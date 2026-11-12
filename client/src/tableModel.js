import { index, newId, reaches } from './tree.js'

// The table works on a flat outline: a row's parent is the closest row above it with a smaller depth.

export const isBlank = (r) => !r.ref && !r.title.trim() && !r.subtitle.trim() && !r.description.trim()

export const linkRow = (target, depth) => ({ id: newId(), depth, ref: target, title: '', subtitle: '', description: '', done: false, extra: {} })

export function blankRow(depth = 1) {
  return { id: newId(), depth, title: '', subtitle: '', description: '', done: false, extra: {} }
}

export function flatten(steps) {
  const rows = []
  const walk = (list, depth) => {
    for (const s of list ?? []) {
      if (s.ref) {
        rows.push(linkRow(s.ref, depth))
        rows[rows.length - 1].id = s.id ?? newId()
        continue
      }
      const { id, title, subtitle, description, status, sub_steps, ...extra } = s
      rows.push({
        id: id ?? newId(),
        depth,
        title: title ?? '',
        subtitle: subtitle ?? '',
        description: description ?? '',
        done: status === 'completed',
        extra
      })
      walk(sub_steps, depth + 1)
    }
  }
  walk(steps, 1)
  return rows
}

export function build(rows) {
  const out = []
  const real = new Set(rows.filter((r) => !r.ref && r.title.trim()).map((r) => r.id))
  const stack = [out]
  const prune = (list) => {
    for (const n of list) {
      if (n.ref) continue
      if (n.sub_steps.length) prune(n.sub_steps)
      else delete n.sub_steps
    }
  }
  for (const r of rows) {
    stack.length = Math.min(stack.length, r.depth)
    while (stack.length < r.depth) stack.push(stack[stack.length - 1])
    const list = stack[r.depth - 1]
    if (r.ref) {
      if (real.has(r.ref)) list.push({ id: r.id, ref: r.ref })
      continue
    }
    if (!r.title.trim()) {
      stack[r.depth] = list
      continue
    }
    const node = {
      id: r.id,
      title: r.title.trim(),
      ...(r.subtitle.trim() ? { subtitle: r.subtitle.trim() } : {}),
      description: r.description.trim(),
      status: r.done ? 'completed' : 'pending',
      ...r.extra,
      sub_steps: []
    }
    if (list === out) node.step_number = out.length + 1
    else {
      delete node.step_number
      delete node.color
    }
    list.push(node)
    stack[r.depth] = node.sub_steps
  }
  prune(out)
  return out
}

// A link row has no children, so the row after it can be at most as deep as the link itself.
export function normalize(rows) {
  let max = 1
  for (const r of rows) {
    r.depth = Math.max(1, Math.min(r.depth, max))
    max = r.ref ? r.depth : r.depth + 1
  }
}

// Drops link rows whose bubble is gone or that would make a bubble contain itself.
export function pruneLinks(rows) {
  for (let pass = 0; pass < rows.length; pass++) {
    const ids = new Set(rows.filter((r) => !r.ref).map((r) => r.id))
    const steps = build(rows)
    const ix = index(steps)
    const bad = new Set()
    const cyc = []
    const walk = (list, owner) => {
      for (const s of list) {
        if (s.ref) {
          const t = ix.get(s.ref)
          if (owner && t && reaches(t, owner, ix)) cyc.push(s.id)
        } else walk(s.sub_steps ?? [], s)
      }
    }
    walk(steps, null)
    for (const r of rows) if (r.ref && !ids.has(r.ref)) bad.add(r.id)
    const last = rows.map((r) => r.id).filter((id) => cyc.includes(id)).pop()
    if (last) bad.add(last)
    if (!bad.size) return
    for (let i = rows.length - 1; i >= 0; i--) if (bad.has(rows[i].id)) rows.splice(i, 1)
    normalize(rows)
  }
}

export function ensureTail(rows) {
  while (rows.length > 1 && isBlank(rows[rows.length - 1]) && isBlank(rows[rows.length - 2])) rows.pop()
  const last = rows[rows.length - 1]
  if (!last || !isBlank(last)) rows.push(blankRow(last ? last.depth : 1))
}

export function blockEnd(rows, i) {
  let j = i + 1
  while (j < rows.length && rows[j].depth > rows[i].depth) j++
  return j
}

function shiftBlock(rows, i, delta) {
  const end = blockEnd(rows, i)
  for (let k = i; k < end; k++) rows[k].depth += delta
}

export function indent(rows, i) {
  if (i === 0 || rows[i].depth > rows[i - 1].depth) return i
  shiftBlock(rows, i, 1)
  normalize(rows)
  return i
}

export function outdent(rows, i) {
  if (rows[i].depth <= 1) return i
  shiftBlock(rows, i, -1)
  normalize(rows)
  return i
}

// First press goes down into the bottom of the tree above, later presses lift the row one line at a time.
export function moveUp(rows, i) {
  if (i === 0) return i
  const above = rows[i - 1]
  if (rows[i].depth < above.depth) {
    shiftBlock(rows, i, above.depth - rows[i].depth)
    normalize(rows)
    return i
  }
  const block = rows.splice(i, blockEnd(rows, i) - i)
  rows.splice(i - 1, 0, ...block)
  normalize(rows)
  return i - 1
}

export function moveDown(rows, i) {
  const end = blockEnd(rows, i)
  const next = rows[end]
  if (!next) return i
  if (next.depth < rows[i].depth) {
    shiftBlock(rows, i, next.depth - rows[i].depth)
    normalize(rows)
    return i
  }
  const block = rows.splice(i, end - i)
  const hasKids = rows[i + 1] && rows[i + 1].depth > rows[i].depth
  if (hasKids) for (const r of block) r.depth += 1
  rows.splice(i + 1, 0, ...block)
  normalize(rows)
  return i + 1
}

// `at` is an index into the rows with the moved block already removed.
export function moveTo(rows, i, at, depth) {
  const block = rows.splice(i, blockEnd(rows, i) - i)
  const delta = depth - block[0].depth
  for (const r of block) r.depth += delta
  rows.splice(at, 0, ...block)
  normalize(rows)
  return at
}

export function removeBlock(rows, i) {
  rows.splice(i, blockEnd(rows, i) - i)
}

export function toggleDone(rows, i) {
  const done = !rows[i].done
  rows[i].done = done
  if (done) {
    for (let k = i + 1, end = blockEnd(rows, i); k < end; k++) rows[k].done = true
  } else {
    let d = rows[i].depth
    for (let k = i - 1; k >= 0 && d > 1; k--) {
      if (rows[k].depth < d) {
        rows[k].done = false
        d = rows[k].depth
      }
    }
  }
}
