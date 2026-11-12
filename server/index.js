import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3123
const today = () => new Date().toISOString().slice(0, 10)
const readConfig = () =>
  JSON.parse(readFileSync(join(here, existsSync(join(here, 'config.json')) ? 'config.json' : 'config.example.json'), 'utf8'))

// Gives every node an id, a status and renumbers the top level steps.
// A link node ({ id, ref }) shares the bubble `ref` with another branch.
function normalizeSteps(list, opts = {}) {
  const ids = new Map()
  const out = normalizeNodes(list, opts, ids)
  return dropBadLinks(out, ids)
}

function dropBadLinks(list, ids, trail = new Set()) {
  const out = []
  for (const s of list) {
    if (s.ref !== undefined) {
      const to = ids.get(s.ref)
      if (!to || trail.has(to)) continue
      s.ref = to
    } else if (s.sub_steps) {
      s.sub_steps = dropBadLinks(s.sub_steps, ids, new Set([...trail, s.id]))
      if (!s.sub_steps.length) delete s.sub_steps
    }
    out.push(s)
  }
  return out
}

function normalizeNodes(list, { resetStatus = false, top = true } = {}, ids) {
  return (list ?? []).map((s, i) => {
    if (s.ref) {
      const link = { id: resetStatus ? randomUUID() : s.id || randomUUID(), ref: String(s.ref) }
      if (top) link.step_number = i + 1
      return link
    }
    const node = {
      id: resetStatus ? randomUUID() : s.id || randomUUID(),
      title: String(s.title ?? ''),
      description: String(s.description ?? ''),
      status: resetStatus ? 'pending' : s.status === 'completed' ? 'completed' : 'pending'
    }
    if (top) node.step_number = i + 1
    if (s.value !== undefined && s.value !== null && s.value !== '') node.value = s.value
    if (top && Number.isFinite(Number(s.color)) && s.color !== null && s.color !== '') {
      node.color = Math.max(0, Math.min(360, Math.round(Number(s.color))))
    }
    if (s.unit) node.unit = s.unit
    if (s.id) ids.set(s.id, node.id)
    const subs = normalizeNodes(s.sub_steps, { resetStatus, top: false }, ids)
    if (subs.length) node.sub_steps = subs
    return node
  })
}

function countNodes(list) {
  let total = 0
  let done = 0
  for (const s of list) {
    if (s.ref) continue
    total++
    if (s.status === 'completed') done++
    const c = countNodes(s.sub_steps ?? [])
    total += c.total
    done += c.done
  }
  return { total, done }
}

function percent(steps) {
  const { total, done } = countNodes(steps)
  return total ? Math.round((done / total) * 100) : 0
}

function rowToDoc(r) {
  return {
    machine: { number: r.machine_number, type: r.machine_type },
    project: {
      title: r.title,
      description: r.description,
      completed: r.completed,
      created: r.created,
      changed: r.changed,
      status: r.status
    },
    steps: JSON.parse(r.steps)
  }
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/config', (_req, res) => res.json(readConfig()))

app.get('/api/projects', (req, res) => {
  const { status } = req.query
  const rows = status
    ? db.prepare('SELECT * FROM projects WHERE status = ? ORDER BY changed DESC, machine_number DESC').all(status)
    : db.prepare('SELECT * FROM projects ORDER BY changed DESC, machine_number DESC').all()
  res.json(
    rows.map((r) => ({
      machine_number: r.machine_number,
      machine_type: r.machine_type,
      title: r.title,
      status: r.status,
      completed: r.completed,
      changed: r.changed
    }))
  )
})

app.get('/api/projects/:number', (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE machine_number = ?').get(Number(req.params.number))
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(rowToDoc(row))
})

app.post('/api/projects', (req, res) => {
  const { machine_number, machine_type, title, description, template_id } = req.body ?? {}
  const number = Number(machine_number)
  if (!Number.isInteger(number) || number <= 0) return res.status(400).json({ error: 'machine.number krävs' })
  if (db.prepare('SELECT 1 FROM projects WHERE machine_number = ?').get(number)) {
    return res.status(409).json({ error: 'Maskinnumret finns redan' })
  }
  let steps = []
  let type = machine_type ?? ''
  let projTitle = title
  let projDesc = description ?? ''
  if (template_id) {
    const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(template_id))
    if (!t) return res.status(404).json({ error: 'Template saknas' })
    steps = normalizeSteps(JSON.parse(t.steps), { resetStatus: true })
    type = type || t.machine_type
    projTitle = projTitle || t.title
    projDesc = projDesc || t.description
  }
  if (!projTitle) return res.status(400).json({ error: 'title krävs' })
  const d = today()
  db.prepare(
    'INSERT INTO projects (machine_number, machine_type, title, description, status, completed, created, changed, steps) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(number, type, projTitle, projDesc, 'active', percent(steps), d, d, JSON.stringify(steps))
  res.status(201).json(rowToDoc(db.prepare('SELECT * FROM projects WHERE machine_number = ?').get(number)))
})

app.put('/api/projects/:number', (req, res) => {
  const number = Number(req.params.number)
  const existing = db.prepare('SELECT * FROM projects WHERE machine_number = ?').get(number)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const body = req.body ?? {}
  const steps = normalizeSteps(body.steps)
  const completed = percent(steps)
  const { total } = countNodes(steps)
  const status = total > 0 && completed === 100 ? 'completed' : 'active'
  db.prepare(
    'UPDATE projects SET title = ?, description = ?, machine_type = ?, status = ?, completed = ?, changed = ?, steps = ? WHERE machine_number = ?'
  ).run(
    body.project?.title ?? existing.title,
    body.project?.description ?? existing.description,
    body.machine?.type ?? existing.machine_type,
    status,
    completed,
    today(),
    JSON.stringify(steps),
    number
  )
  res.json(rowToDoc(db.prepare('SELECT * FROM projects WHERE machine_number = ?').get(number)))
})

app.delete('/api/projects/:number', (req, res) => {
  db.prepare('DELETE FROM projects WHERE machine_number = ?').run(Number(req.params.number))
  res.status(204).end()
})

app.get('/api/templates', (_req, res) => {
  res.json(db.prepare('SELECT id, name, machine_type, title, description, created FROM templates ORDER BY id DESC').all())
})

app.post('/api/templates', (req, res) => {
  const { name, machine_type, title, description, steps } = req.body ?? {}
  if (!name || !title) return res.status(400).json({ error: 'name och title krävs' })
  const clean = normalizeSteps(steps, { resetStatus: true })
  const info = db
    .prepare('INSERT INTO templates (name, machine_type, title, description, steps, created) VALUES (?,?,?,?,?,?)')
    .run(name, machine_type ?? '', title, description ?? '', JSON.stringify(clean), today())
  res.status(201).json({ id: Number(info.lastInsertRowid) })
})

app.delete('/api/templates/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(Number(req.params.id))
  res.status(204).end()
})

function seedExample() {
  if (db.prepare('SELECT COUNT(*) AS c FROM projects').get().c > 0) return
  try {
    const file = [join(here, '..', 'EXAMPLE_DATA.json'), join(here, 'seed.example.json')].find(existsSync)
    const ex = JSON.parse(readFileSync(file, 'utf8'))
    const steps = normalizeSteps(ex.steps)
    const d = today()
    db.prepare(
      'INSERT INTO projects (machine_number, machine_type, title, description, status, completed, created, changed, steps) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(ex.machine.number, ex.machine.type, ex.project.title, ex.project.description ?? '', 'active', percent(steps), d, d, JSON.stringify(steps))
  } catch {
    // no example data available
  }
}
seedExample()

const clientDist = join(here, '..', 'client', 'dist')
if (existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(clientDist, 'index.html')))
}

app.listen(PORT, () => console.log(`Mind Bubble server: http://localhost:${PORT}`))
