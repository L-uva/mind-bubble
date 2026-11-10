export const HUES = [205, 345, 150, 35, 265, 180, 95, 320]

export const stepHue = (steps, node) => node.color ?? HUES[Math.max(0, steps.indexOf(node)) % HUES.length]

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)

export const isDone = (s) => s.status === 'completed'

export const isRef = (s) => !!s.ref

// Maps id -> real node. Link nodes ({ id, ref }) are resolved through this index.
export function index(steps) {
  const ix = new Map()
  const walk = (list) => {
    for (const s of list ?? []) {
      if (isRef(s)) continue
      ix.set(s.id, s)
      walk(s.sub_steps)
    }
  }
  walk(steps)
  return ix
}

// Real children of a node, with links resolved.
export function kids(s, ix) {
  return (s.sub_steps ?? []).map((c) => (isRef(c) ? ix.get(c.ref) : c)).filter(Boolean)
}

export function subtree(s, ix, seen = new Set()) {
  for (const c of kids(s, ix)) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    subtree(c, ix, seen)
  }
  return [...seen].map((id) => ix.get(id))
}

export const hasPendingDesc = (s, ix) => subtree(s, ix).some((c) => !isDone(c))

// A popped bubble stays visible only while something below it is still pending.
export const isVisible = (s, ix) => !isDone(s) || hasPendingDesc(s, ix)

export function count(steps) {
  let total = 0
  let done = 0
  for (const s of steps ?? []) {
    if (isRef(s)) continue
    total++
    if (isDone(s)) done++
    const c = count(s.sub_steps)
    total += c.total
    done += c.done
  }
  return { total, done }
}

export function percent(steps) {
  const { total, done } = count(steps)
  return total ? Math.round((done / total) * 100) : 0
}

export function pendingBelow(s, ix) {
  return subtree(s, ix).filter((c) => !isDone(c)).length
}

// True if `to` can be reached from `from` by walking down (links included).
export function reaches(from, to, ix) {
  return from.id === to.id || subtree(from, ix).some((c) => c.id === to.id)
}

// Every real node above `id`, following all parent links.
export function allAncestors(id, ix) {
  const out = new Set()
  const up = (cid) => {
    for (const p of ix.values()) {
      if (out.has(p.id)) continue
      if ((p.sub_steps ?? []).some((c) => c.id === cid || c.ref === cid)) {
        out.add(p.id)
        up(p.id)
      }
    }
  }
  up(id)
  return [...out].map((x) => ix.get(x))
}

// Link nodes pointing at `id`, with the node holding each one (null = top level).
export function linksTo(steps, id) {
  const out = []
  const walk = (list, parent) => {
    for (const s of list ?? []) {
      if (isRef(s)) {
        if (s.ref === id) out.push({ link: s, parent })
      } else walk(s.sub_steps, s)
    }
  }
  walk(steps, null)
  return out
}

export function removeLinksTo(steps, ids) {
  const walk = (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      if (isRef(s)) {
        if (ids.has(s.ref)) list.splice(i, 1)
      } else if (s.sub_steps) {
        walk(s.sub_steps)
        if (!s.sub_steps.length) delete s.sub_steps
      }
    }
  }
  walk(steps)
}

export function find(steps, id, level = 1, parent = null) {
  for (const s of steps ?? []) {
    if (isRef(s)) continue
    if (s.id === id) return { node: s, parent, level }
    const r = find(s.sub_steps, id, level + 1, s)
    if (r) return r
  }
  return null
}

export function ancestors(steps, id, trail = []) {
  for (const s of steps ?? []) {
    if (isRef(s)) continue
    if (s.id === id) return trail
    const r = ancestors(s.sub_steps, id, [...trail, s])
    if (r) return r
  }
  return null
}

export function valueText(s) {
  if (s.value === undefined || s.value === null || s.value === '') return ''
  return `${s.value}${s.unit ? ' ' + s.unit : ''}`
}
