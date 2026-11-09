export const HUES = [205, 345, 150, 35, 265, 180, 95, 320]

export const stepHue = (steps, node) => node.color ?? HUES[Math.max(0, steps.indexOf(node)) % HUES.length]

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)

export const isDone = (s) => s.status === 'completed'

export const hasPendingDesc = (s) => (s.sub_steps ?? []).some((c) => !isDone(c) || hasPendingDesc(c))

// A popped bubble stays visible only while something below it is still pending.
export const isVisible = (s) => !isDone(s) || hasPendingDesc(s)

export function count(steps) {
  let total = 0
  let done = 0
  for (const s of steps ?? []) {
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

export function pendingBelow(s) {
  return count(s.sub_steps).total - count(s.sub_steps).done
}

export function find(steps, id, level = 1, parent = null) {
  for (const s of steps ?? []) {
    if (s.id === id) return { node: s, parent, level }
    const r = find(s.sub_steps, id, level + 1, s)
    if (r) return r
  }
  return null
}

export function ancestors(steps, id, trail = []) {
  for (const s of steps ?? []) {
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
