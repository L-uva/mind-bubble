const TAU = Math.PI * 2
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rand = (a, b) => a + Math.random() * (b - a)

export const ROOT_ID = 'root'

// Wraps a label so it fits inside a bubble; the full text is always available in the cards.
export function fitText(text, r, extra, sub) {
  const fs = clamp(r * 0.26, 9, 15)
  const maxChars = Math.max(3, Math.floor((r * 1.6) / (fs * 0.56)))
  const maxLines = Math.max(1, Math.floor((r * 1.5) / (fs * 1.18)) - (extra ? 1 : 0) - (sub ? 1 : 0))
  const lines = []
  let cur = ''
  for (let word of String(text || '').split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) word = word.slice(0, maxChars - 1) + '…'
    if (!cur) cur = word
    else if ((cur + ' ' + word).length <= maxChars) cur += ' ' + word
    else {
      lines.push(cur)
      cur = word
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    lines.length = maxLines
    const last = lines[maxLines - 1]
    lines[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last) + '…'
  }
  const kinds = lines.map(() => 'title')
  const short = (s) => (s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s)
  if (sub) {
    lines.push(short(sub))
    kinds.push('sub')
  }
  if (extra) {
    lines.push(short(extra))
    kinds.push('extra')
  }
  return { lines, kinds, fs }
}

export class World {
  constructor() {
    this.nodes = []
    this.map = new Map()
    this.w = 800
    this.h = 600
    this.vw = 800
    this.vh = 600
    this.saved = null
    this.s = 1
    this.spacing = 22
    this.live = true
    this.cluster = 0
    this.awake = 0
    this.time = 0
    this.drag = null
  }

  radiusFor(level) {
    return level === 0 ? 82 * this.s : this.s * Math.max(32, 58 * Math.pow(0.8, level - 1))
  }

  setSize(w, h) {
    this.vw = w
    this.vh = h
    this.s = clamp(Math.min(w, h) / 820, 0.8, 1.25)
    for (const n of this.nodes) n.r0 = this.radiusFor(n.level)
    this.setBounds(this.nodes)
  }

  // The world grows beyond the viewport when there are too many bubbles to fit without crowding.
  setBounds(items) {
    let need = 0
    for (const n of items) {
      const r = this.radiusFor(n.level) + 16 * this.s
      need += Math.PI * r * r
    }
    const f = Math.max(1, Math.sqrt((need * 2) / (this.vw * this.vh)))
    const w = this.vw * f
    const h = this.vh * f
    const dx = (w - this.w) / 2
    const dy = (h - this.h) / 2
    for (const n of this.nodes) if (!n.isRoot) {
      n.x += dx
      n.y += dy
    }
    this.w = w
    this.h = h
    const root = this.map.get(ROOT_ID)
    if (root) {
      root.x = w / 2
      root.y = h / 2
    }
  }

  snapshot() {
    const root = this.map.get(ROOT_ID)
    const out = {}
    if (root) for (const n of this.nodes) if (!n.isRoot) out[n.id] = [Math.round(n.x - root.x), Math.round(n.y - root.y)]
    return out
  }

  // items: [{ id, parentId, level, hue }] in depth-first order, root first.
  setTree(items) {
    const fresh = this.nodes.length <= 1
    this.setBounds(items)
    const seen = new Set()
    for (const it of items) {
      let n = this.map.get(it.id)
      if (!n) {
        n = {
          id: it.id,
          x: this.w / 2,
          y: this.h / 2,
          vx: 0,
          vy: 0,
          fx: 0,
          fy: 0,
          phase: rand(0, TAU),
          pulseW: rand(1.1, 2.0),
          wf1: rand(0.2, 0.5),
          wf2: rand(0.2, 0.5),
          wp1: rand(0, TAU),
          wp2: rand(0, TAU),
          angle: rand(0, 360),
          rot: rand(-24, 24) || 14,
          born: this.time,
          appear: 0,
          isRoot: it.id === ROOT_ID
        }
        this.map.set(n.id, n)
        this.nodes.push(n)
        const sv = this.saved?.[it.id]
        if (n.isRoot) {
          n.appear = 1
          n.fixed = true
        } else if (sv) {
          const root = this.map.get(ROOT_ID)
          n.x = root.x + sv[0]
          n.y = root.y + sv[1]
        } else if (!fresh) {
          const p = this.map.get(it.parentId)
          const root = this.map.get(ROOT_ID)
          if (p) {
            let dx = p.x - root.x
            let dy = p.y - root.y
            let d = Math.hypot(dx, dy)
            if (d < 1) {
              dx = Math.cos(rand(0, TAU))
              dy = Math.sin(rand(0, TAU))
              d = 1
            }
            const a = Math.atan2(dy, dx) + rand(-0.8, 0.8)
            const dist = this.radiusFor(it.level) + p.r0 + 30 * this.s
            n.x = p.x + Math.cos(a) * dist
            n.y = p.y + Math.sin(a) * dist
          }
        }
      }
      n.parentId = it.parentId
      n.links = it.links ?? []
      n.level = it.level
      n.hue = it.hue
      n.r0 = this.radiusFor(it.level)
      n.R = n.R || n.r0
      seen.add(it.id)
    }
    if (this.nodes.some((n) => !seen.has(n.id))) {
      this.nodes = this.nodes.filter((n) => seen.has(n.id))
      for (const id of [...this.map.keys()]) if (!seen.has(id)) this.map.delete(id)
    }
    if (fresh) this.layout()
  }

  layout() {
    const root = this.map.get(ROOT_ID)
    if (!root) return
    root.x = this.w / 2
    root.y = this.h / 2
    const kids = new Map()
    for (const n of this.nodes) {
      if (n.isRoot) continue
      if (!kids.has(n.parentId)) kids.set(n.parentId, [])
      kids.get(n.parentId).push(n)
    }
    const weight = (n) => {
      const c = kids.get(n.id) || []
      return c.length ? c.reduce((a, k) => a + weight(k), 0) : 1
    }
    const gap = this.spacing * 2 * this.s
    const place = (parent, a0, a1) => {
      const c = kids.get(parent.id) || []
      const total = c.reduce((a, k) => a + weight(k), 0)
      let a = a0
      for (const k of c) {
        const span = ((a1 - a0) * weight(k)) / total
        const ang = a + span / 2
        const dist = parent.r0 + k.r0 + gap
        k.x = parent.x + Math.cos(ang) * dist
        k.y = parent.y + Math.sin(ang) * dist
        k.vx = k.vy = 0
        const sv = this.saved?.[k.id]
        if (sv) {
          k.x = root.x + sv[0]
          k.y = root.y + sv[1]
        }
        const cs = clamp(span, 1.1, 2.4)
        place(k, ang - cs / 2, ang + cs / 2)
        a += span
      }
    }
    place(root, -Math.PI / 2, -Math.PI / 2 + TAU)
  }

  wake() {
    this.awake = this.time + 5
  }

  startDrag(id, tx, ty) {
    const n = this.map.get(id)
    if (!n || n.fixed) return
    this.drag = { id, tx, ty }
  }

  moveDrag(tx, ty) {
    if (this.drag) {
      this.drag.tx = tx
      this.drag.ty = ty
    }
  }

  endDrag() {
    this.drag = null
  }

  step(dt) {
    this.time += dt
    const t = this.time
    const s = this.s
    const nodes = this.nodes
    const gap = this.spacing * 2 * s
    const range = 70 * s
    const kSpring = 14
    const kRep = 260
    const damp = Math.exp((this.live ? -2.3 : -7) * dt)
    const e = 0.82
    const cl = this.cluster
    const wander = this.live ? 38 : 0

    for (const n of nodes) {
      n.fx = n.fy = 0
      n.m = Math.pow(n.r0 / 40, 2)
      n.appear = Math.min(1, (t - n.born) / 0.55)
      const pulse = this.live ? 1 + 0.035 * Math.sin(t * n.pulseW + n.phase) : 1
      n.R = n.r0 * pulse * Math.max(0.35, n.appear)
      n.angle += n.rot * dt
    }

    for (const n of nodes) {
      if (n.isRoot) continue
      const ps = [n.parentId, ...(n.links ?? [])]
      for (let k = 0; k < ps.length; k++) {
        const p = this.map.get(ps[k])
        if (!p) continue
        let dx = n.x - p.x
        let dy = n.y - p.y
        const d = Math.hypot(dx, dy) || 0.001
        dx /= d
        dy /= d
        const rest = p.r0 + n.r0 + gap * (k ? 2 : 1 - 0.25 * cl)
        const f = kSpring * (k ? 0.5 : 1 + 0.8 * cl) * (d - rest)
        n.fx -= f * dx
        n.fy -= f * dy
        p.fx += f * dx
        p.fy += f * dy
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 0.001
        const sib = a.parentId === b.parentId
        const far = cl && !sib && a.parentId !== b.id && b.parentId !== a.id
        const rng = far ? range * (1 + 1.2 * cl) : range
        const g = d - a.R - b.R
        if (g >= rng) continue
        dx /= d
        dy /= d
        const k = 1 - Math.max(0, g) / rng
        const f = kRep * k * k * (far ? 1 + 1.5 * cl : sib && cl ? Math.max(0.4, 1 - 0.3 * cl) : 1)
        a.fx -= f * dx
        a.fy -= f * dy
        b.fx += f * dx
        b.fy += f * dy
      }
    }

    for (const n of nodes) {
      if (n.fixed) continue
      const ax = n.fx / n.m + Math.cos(t * n.wf1 + n.wp1) * wander
      const ay = n.fy / n.m + Math.sin(t * n.wf2 + n.wp2) * wander
      n.vx = (n.vx + ax * dt) * damp
      n.vy = (n.vy + ay * dt) * damp
    }

    if (this.drag) {
      const n = this.map.get(this.drag.id)
      if (n) {
        let vx = (this.drag.tx - n.x) * 18
        let vy = (this.drag.ty - n.y) * 18
        const sp = Math.hypot(vx, vy)
        if (sp > 1800) {
          vx = (vx / sp) * 1800
          vy = (vy / sp) * 1800
        }
        n.vx = vx
        n.vy = vy
      }
    }

    for (const n of nodes) {
      if (n.fixed) continue
      const sp = Math.hypot(n.vx, n.vy)
      if (!this.live && sp < 8 && t > this.awake && this.drag?.id !== n.id) n.vx = n.vy = 0
      const max = this.drag && this.drag.id === n.id ? 1800 : 700
      if (sp > max) {
        n.vx = (n.vx / sp) * max
        n.vy = (n.vy / sp) * max
      }
      n.x += n.vx * dt
      n.y += n.vy * dt
    }

    const dragId = this.drag && this.drag.id
    const pad = 3 * s
    const inv = (n) => (n.fixed ? 0 : 1 / (n.m * (n.id === dragId ? 12 : 1)))
    for (let it = 0; it < 5; it++) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          const d = Math.hypot(dx, dy)
          const minD = a.R + b.R + pad
          if (d >= minD) continue
          if (d < 0.0001) {
            dx = 1
            dy = 0
          } else {
            dx /= d
            dy /= d
          }
          const wa = inv(a)
          const wb = inv(b)
          const sum = wa + wb
          if (!sum) continue
          const over = minD - Math.max(d, 0.0001)
          a.x -= (dx * over * wa) / sum
          a.y -= (dy * over * wa) / sum
          b.x += (dx * over * wb) / sum
          b.y += (dy * over * wb) / sum
          const vn = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy
          if (vn < 0) {
            const imp = (-(1 + e) * vn) / sum
            a.vx -= imp * wa * dx
            a.vy -= imp * wa * dy
            b.vx += imp * wb * dx
            b.vy += imp * wb * dy
          }
        }
      }
    }

    const m = 8
    for (const n of nodes) {
      if (n.fixed) continue
      const r = n.R
      if (n.x < r + m) {
        n.x = r + m
        n.vx = Math.abs(n.vx) * 0.6
      } else if (n.x > this.w - r - m) {
        n.x = this.w - r - m
        n.vx = -Math.abs(n.vx) * 0.6
      }
      if (n.y < r + m) {
        n.y = r + m
        n.vy = Math.abs(n.vy) * 0.6
      } else if (n.y > this.h - r - m) {
        n.y = this.h - r - m
        n.vy = -Math.abs(n.vy) * 0.6
      }
    }
  }
}
