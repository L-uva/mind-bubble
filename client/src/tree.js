import { reactive } from 'vue'

export const ROOT_HUE = 255
export const HUES = [205, 345, 150, 35, 180, 95, 320]

export const PALETTES = [
  { id: 'pastel', label: 'Pastell' },
  { id: 'pop', label: 'Pop' },
  { id: 'tonal', label: 'Toner', base: true },
  { id: 'complement', label: 'Komplement', base: true }
]

// palette: how colors look and are picked. baseHue: the first bubble's hue for the palettes that build on it.
export const colorScheme = reactive({ palette: 'pastel', baseHue: ROOT_HUE })

const hueDist = (a, b) => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}
const wrap = (h) => ((Math.round(h) % 360) + 360) % 360
const golden = (from) => Array.from({ length: 240 }, (_, n) => wrap(n * 137.508 + from))
const COMPLEMENT = [180, 30, 210, -30, 150, 60, 240, -60, 120, 90, 270, -90]
const TONES = Array.from({ length: 9 }, (_, i) => (i + 2) * 15).flatMap((d) => [d, -d])

export const usesBaseHue = () => !!PALETTES.find((p) => p.id === colorScheme.palette)?.base

export const rootHue = () => (usesBaseHue() ? colorScheme.baseHue : ROOT_HUE)

function huePool() {
  const base = colorScheme.baseHue
  if (colorScheme.palette === 'tonal') return [...TONES.map((o) => wrap(base + o)), ...golden(base)]
  if (colorScheme.palette === 'complement') return [...COMPLEMENT.map((o) => wrap(base + o)), ...golden(base)]
  return [...HUES, ...golden(20)]
}

// Gives every top-level bubble its own hue, never the root's. Stored colors win; the rest take the
// first palette hue that is far enough from all hues in use (the gap shrinks only when the circle is full).
export function assignHues(steps) {
  const tops = (steps ?? []).filter((s) => !s.ref)
  const root = rootHue()
  const out = new Map()
  const used = [root]
  for (const s of tops) {
    if (s.color === undefined || s.color === null || s.color === '' || !Number.isFinite(Number(s.color))) continue
    out.set(s.id, Number(s.color))
    used.push(Number(s.color))
  }
  const pool = huePool()
  for (const s of tops) {
    if (out.has(s.id)) continue
    let h
    for (let gap = 24; h === undefined; gap = Math.max(1, gap - 3)) {
      h = pool.find((c) => hueDist(root, c) >= 20 && used.every((u) => hueDist(u, c) >= gap))
      if (gap === 1) break
    }
    h ??= pool[0]
    out.set(s.id, h)
    used.push(h)
  }
  return out
}

export const stepHue = (steps, node) => assignHues(steps).get(node.id) ?? HUES[0]

// Same rules as dragging a bubble onto another: no self-links, no duplicates, no cycles. parent null = root.
export function canLink(parent, target, steps, ix) {
  if (!target || (parent && parent.id === target.id)) return false
  const kidsOf = parent ? parent.sub_steps ?? [] : steps
  if (kidsOf.some((c) => (c.ref ?? c.id) === target.id)) return false
  return !(parent && reaches(target, parent, ix))
}

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

// Children of a node. Links are only followed when withLinks is set (cycle checks); popping only counts own children.
export function kids(s, ix, withLinks = false) {
  return (s.sub_steps ?? []).filter((c) => withLinks || !isRef(c)).map((c) => (isRef(c) ? ix.get(c.ref) : c)).filter(Boolean)
}

export function subtree(s, ix, withLinks = false, seen = new Set()) {
  for (const c of kids(s, ix, withLinks)) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    subtree(c, ix, withLinks, seen)
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
  return from.id === to.id || subtree(from, ix, true).some((c) => c.id === to.id)
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
