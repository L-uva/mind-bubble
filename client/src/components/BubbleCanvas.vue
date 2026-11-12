<script setup>
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { ZoomIn, ZoomOut, Maximize } from 'lucide-vue-next'
import { World, ROOT_ID, fitText } from '../physics.js'
import { assignHues, canLink, colorScheme, index, isVisible, percent, rootHue, valueText } from '../tree.js'

const props = defineProps({
  title: { type: String, default: '' },
  steps: { type: Array, default: () => [] },
  adding: { type: Boolean, default: false },
  layoutKey: { type: String, default: '' },
  spacing: { type: Number, default: 22 },
  live: { type: Boolean, default: true },
  cluster: { type: Number, default: 0 }
})
const emit = defineEmits(['select', 'pop', 'link'])

const hover = ref(null)
const view = ref({ k: 1, x: 0, y: 0 })
let auto = true
let focusId = null
let lastSaved = ''
const vw = () => window.innerWidth

const svg = ref(null)
const fx = ref(null)
const views = shallowRef([])
const world = new World()
world.spacing = props.spacing
world.live = props.live
world.cluster = props.cluster
watch(() => [props.spacing, props.live, props.cluster], ([sp, lv, cl]) => {
  world.spacing = sp
  world.live = lv
  world.cluster = cl
  world.wake()
})
let raf = 0
let last = 0
let down = null

const storeKey = () => (props.layoutKey ? 'layout-' + props.layoutKey : '')

function loadLayout() {
  try {
    world.saved = JSON.parse(localStorage.getItem(storeKey()) || 'null')
  } catch {
    world.saved = null
  }
}

function saveLayout() {
  const key = storeKey()
  if (!key || world.nodes.length < 2) return
  const s = JSON.stringify(world.snapshot())
  if (s === lastSaved) return
  lastSaved = s
  try {
    localStorage.setItem(key, s)
  } catch {}
}

function fit() {
  const W = world.w
  const H = world.h
  const k = Math.min(world.vw / W, world.vh / H, 1)
  view.value = { k, x: (world.vw - W * k) / 2, y: (world.vh - H * k) / 2 }
}

function zoomAt(factor, cx, cy) {
  const v = view.value
  const k = Math.min(3, Math.max(0.25, v.k * factor))
  const f = k / v.k
  view.value = { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
  auto = false
}

function zoomBtn(factor) {
  zoomAt(factor, world.vw / 2, world.vh / 2)
}

function refit() {
  auto = true
  fit()
}

function onWheel(e) {
  const r = svg.value.getBoundingClientRect()
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
}

function focusSet(id) {
  const n = world.map.get(id)
  if (!n || n.isRoot) return null
  const set = new Set([id])
  const up = [n]
  while (up.length) {
    const u = up.pop()
    for (const pid of [u.parentId, ...(u.links ?? [])]) {
      const p = world.map.get(pid)
      if (p && !set.has(p.id)) {
        set.add(p.id)
        up.push(p)
      }
    }
  }
  const kids = [id]
  const seen = new Set()
  while (kids.length) {
    const k = kids.pop()
    if (seen.has(k)) continue
    seen.add(k)
    set.add(k)
    for (const x of world.nodes) if (x.parentId === k || x.links?.includes(k)) kids.push(x.id)
  }
  return set
}

function items() {
  const ix = index(props.steps)
  const hues = assignHues(props.steps)
  const out = [{ id: ROOT_ID, parentId: null, level: 0, hue: rootHue(), label: props.title, desc: '', extra: `${percent(props.steps)} %` }]
  const byId = new Map([[ROOT_ID, out[0]]])
  const links = []
  const walk = (list, parentId, level, hue) => {
    list.forEach((s) => {
      if (s.ref) {
        const t = ix.get(s.ref)
        if (t && isVisible(t, ix)) links.push([parentId, t.id])
        return
      }
      if (!isVisible(s, ix)) return
      const h = level === 1 ? hues.get(s.id) : hue
      const it = { id: s.id, parentId, level, hue: h, label: s.title, sub: s.subtitle, desc: s.description, extra: valueText(s), done: s.status === 'completed', links: [] }
      byId.set(s.id, it)
      out.push(it)
      walk(s.sub_steps ?? [], s.id, level + 1, h)
    })
  }
  walk(props.steps, ROOT_ID, 1, 0)
  for (const [from, to] of links) {
    const it = byId.get(to)
    if (it && byId.has(from) && it.parentId !== from && !it.links.includes(from)) it.links.push(from)
  }
  return out
}

const edges = shallowRef([])

function rebuild() {
  const list = items()
  world.setTree(list)
  if (auto) fit()
  edges.value = list.flatMap((it) =>
    it.id === ROOT_ID ? [] : [it.parentId, ...it.links].map((p, k) => ({ key: `${it.id}>${p}`, from: p, to: it.id, link: k > 0 }))
  )
  for (const it of list) {
    const n = world.map.get(it.id)
    const t = fitText(it.label, n.r0, it.extra, it.sub)
    n.lines = t.lines
    n.kinds = t.kinds
    n.fs = t.fs
    n.fullTitle = it.label
    n.desc = it.desc
    n.done = !!it.done
  }
  views.value = world.nodes.slice()
}

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016)
  last = now
  world.step(dt / 2)
  world.step(dt / 2)
  const fs = focusSet(focusId)
  for (const n of world.nodes) {
    if (!n.el) continue
    n.focus = (n.focus ?? 1) + ((!fs || fs.has(n.id) ? 1 : 0.16) - (n.focus ?? 1)) * Math.min(1, dt * 10)
    const a = 0.5 + 0.5 * easeOutBack(n.appear)
    n.el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)}) scale(${a.toFixed(3)})`)
    n.el.style.opacity = Math.min(1, n.appear * 1.6) * n.focus
    n.body?.setAttribute('r', n.R.toFixed(2))
  }
  for (const e of edges.value) {
    const a = world.map.get(e.from)
    const b = world.map.get(e.to)
    if (!e.el || !a || !b) continue
    e.el.style.opacity = Math.min(a.focus ?? 1, b.focus ?? 1) * Math.min(1, b.appear * 1.6)
    e.el.setAttribute('x1', a.x.toFixed(1))
    e.el.setAttribute('y1', a.y.toFixed(1))
    e.el.setAttribute('x2', b.x.toFixed(1))
    e.el.setAttribute('y2', b.y.toFixed(1))
  }
  raf = requestAnimationFrame(frame)
}

function easeOutBack(t) {
  const c = 1.9
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

function pointer(e) {
  const r = svg.value.getBoundingClientRect()
  const v = view.value
  return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k }
}

const linkLine = ref(null)
const mode = ref('')
const linkOver = ref(null)
let pan = null
let pinch = null
let press = 0
const touches = new Map()

function trackDown(e) {
  if (e.pointerType === 'mouse') return
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (touches.size !== 2) return
  clearTimeout(press)
  if (down) world.endDrag()
  down = null
  pan = null
  focusId = null
  hover.value = null
  const [a, b] = [...touches.values()]
  const r = svg.value.getBoundingClientRect()
  pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, v: { ...view.value } }
}

function trackMove(e) {
  if (!touches.has(e.pointerId)) return
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (!pinch || touches.size < 2) return
  const [a, b] = [...touches.values()]
  const r = svg.value.getBoundingClientRect()
  const cx = (a.x + b.x) / 2 - r.left
  const cy = (a.y + b.y) / 2 - r.top
  const k = Math.min(3, Math.max(0.25, pinch.v.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)))
  const wx = (pinch.cx - pinch.v.x) / pinch.v.k
  const wy = (pinch.cy - pinch.v.y) / pinch.v.k
  view.value = { k, x: cx - wx * k, y: cy - wy * k }
  auto = false
}

function trackUp(e) {
  touches.delete(e.pointerId)
  if (touches.size < 2) pinch = null
}

function onBgDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (touches.size > 1) return
  pan = { x: e.clientX, y: e.clientY, vx: view.value.x, vy: view.value.y }
  svg.value.setPointerCapture(e.pointerId)
}

function onDown(e, n) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (touches.size > 1) return
  hover.value = null
  focusId = n.id
  const p = pointer(e)
  down = { n, x: p.x, y: p.y, ox: p.x - n.x, oy: p.y - n.y, moved: false, long: false, touch: e.pointerType !== 'mouse', linking: (e.ctrlKey || e.metaKey) && !n.isRoot && e.pointerType === 'mouse' }
  if (down.touch) {
    const d = down
    const { clientX: cx, clientY: cy } = e
    clearTimeout(press)
    press = setTimeout(() => {
      if (down !== d || d.moved) return
      d.long = true
      hover.value = { n, x: cx, y: cy - 60 }
      navigator.vibrate?.(15)
      emit('select', n.id)
    }, 500)
  }
  svg.value.setPointerCapture(e.pointerId)
}

function onMove(e) {
  if (pan) {
    if (Math.hypot(e.clientX - pan.x, e.clientY - pan.y) > 3) mode.value = 'pan'
    view.value = { ...view.value, x: pan.vx + e.clientX - pan.x, y: pan.vy + e.clientY - pan.y }
    auto = false
    return
  }
  if (!down) return
  const p = pointer(e)
  if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 5) {
    down.moved = true
    clearTimeout(press)
    if (!down.n.isRoot && !down.linking) world.startDrag(down.n.id, p.x - down.ox, p.y - down.oy)
  }
  if (down.linking) {
    linkLine.value = down.moved ? { x1: down.n.x, y1: down.n.y, x2: p.x, y2: p.y } : null
    if (down.moved) {
      mode.value = 'link'
      updateLinkOver(e)
    }
  } else if (down.moved) {
    if (!down.n.isRoot) mode.value = 'drag'
    world.moveDrag(p.x - down.ox, p.y - down.oy)
  }
}

function updateLinkOver(e) {
  const id = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bubble')?.dataset.id
  if (!id || id === down.n.id) {
    linkOver.value = null
    return
  }
  const ix = index(props.steps)
  linkOver.value = { id, ok: canLink(id === ROOT_ID ? null : ix.get(id), ix.get(down.n.id), props.steps, ix) }
}

function onUp(e) {
  clearTimeout(press)
  mode.value = ''
  linkOver.value = null
  if (pan) {
    pan = null
    return
  }
  if (!down) return
  if (down.linking) {
    const to = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bubble')?.dataset.id
    if (down.moved && to && to !== down.n.id) emit('link', to, down.n.id)
    linkLine.value = null
  } else if (!down.moved && !down.long) emit(props.adding || down.n.isRoot ? 'select' : 'pop', down.n.id)
  world.endDrag()
  const touch = down.touch
  down = null
  if (touch) {
    focusId = null
    hover.value = null
  } else if (!document.elementFromPoint(e.clientX, e.clientY)?.closest('.bubble')) focusId = null
}

function onEnter(e, n) {
  if (!down) focusId = n.id
  if (!down) hover.value = { n, x: e.clientX, y: e.clientY }
}

function onHoverMove(e) {
  if (hover.value) hover.value = { ...hover.value, x: e.clientX, y: e.clientY }
}

function leave() {
  hover.value = null
  if (!down) focusId = null
}

function onContext(n) {
  hover.value = null
  emit('select', n.id)
}

function playPop(id) {
  const n = world.map.get(id)
  if (!n || !fx.value) return
  const color = n.body ? getComputedStyle(n.body).fill : '#aaa'
  const NS = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(NS, 'g')
  g.setAttribute('transform', `translate(${n.x} ${n.y})`)
  const mk = (r, attrs) => {
    const c = document.createElementNS(NS, 'circle')
    c.setAttribute('r', r)
    for (const k in attrs) c.setAttribute(k, attrs[k])
    g.appendChild(c)
    return c
  }
  const R = n.R
  const body = mk(R, { fill: color, opacity: 0.9 })
  const ring = mk(R, { fill: 'none', stroke: color, 'stroke-width': 3 })
  const anims = [
    body.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' }),
    ring.animate([{ transform: 'scale(0.9)', opacity: 1 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' })
  ]
  const count = 12
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4
    const dist = R * (1.15 + Math.random() * 0.9)
    const d = mk(2 + Math.random() * 4.5, { fill: color })
    anims.push(
      d.animate(
        [
          { transform: `translate(${Math.cos(a) * R * 0.7}px, ${Math.sin(a) * R * 0.7}px) scale(1)`, opacity: 1 },
          { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist}px) scale(0.2)`, opacity: 0 }
        ],
        { duration: 420 + Math.random() * 200, easing: 'cubic-bezier(.1,.8,.3,1)', fill: 'forwards' }
      )
    )
  }
  fx.value.appendChild(g)
  Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => g.remove())
}

defineExpose({ playPop })

watch(() => [props.title, props.steps], rebuild, { deep: true })
watch(colorScheme, rebuild, { deep: true })

let ro
let saveTimer = 0
onMounted(() => {
  const resize = () => {
    const r = svg.value.getBoundingClientRect()
    world.setSize(r.width, r.height)
    if (world.nodes.length) rebuild()
    else if (auto) fit()
  }
  loadLayout()
  ro = new ResizeObserver(resize)
  ro.observe(svg.value)
  resize()
  rebuild()
  last = performance.now()
  raf = requestAnimationFrame(frame)
  saveTimer = setInterval(saveLayout, 4000)
  window.addEventListener('pagehide', saveLayout)
})

onBeforeUnmount(() => {
  saveLayout()
  clearInterval(saveTimer)
  window.removeEventListener('pagehide', saveLayout)
  cancelAnimationFrame(raf)
  ro?.disconnect()
})
</script>

<template>
  <svg
    ref="svg"
    class="canvas"
    :class="{ adding, panning: mode === 'pan', dragging: mode === 'drag', linking: mode === 'link' }"
    @pointerdown.capture="trackDown"
    @pointerdown.self="onBgDown"
    @wheel.prevent="onWheel"
    @pointermove="trackMove($event); onMove($event)"
    @pointerup="trackUp($event); onUp($event)"
    @pointercancel="trackUp($event); onUp($event)"
  >
    <g class="world" :transform="`translate(${view.x} ${view.y}) scale(${view.k})`">
    <g class="edges">
      <line v-for="e in edges" :key="e.key" :ref="(el) => (e.el = el)" class="edge" :class="{ link: e.link }" />
    </g>
    <line v-if="linkLine" class="edge link-drag" :x1="linkLine.x1" :y1="linkLine.y1" :x2="linkLine.x2" :y2="linkLine.y2" />
    <g class="bubbles">
      <g
        v-for="n in views"
        :key="n.id"
        :ref="(el) => (n.el = el)"
        class="bubble"
        :data-id="n.id"
        :class="{ root: n.isRoot, done: n.done, 'link-ok': linkOver?.id === n.id && linkOver.ok, 'link-bad': linkOver?.id === n.id && !linkOver.ok }"
        :style="{ '--h': n.hue, '--lv': n.level }"
        @pointerdown="onDown($event, n)"
        @pointerenter="onEnter($event, n)"
        @pointermove="onHoverMove"
        @pointerleave="leave"
        @contextmenu.prevent="onContext(n)"
      >
        <circle :ref="(el) => (n.body = el)" class="body" :r="n.r0" />
        <g class="labels" :font-size="n.fs">
          <text
            v-for="(l, i) in n.lines"
            :key="i"
            x="0"
            :y="(i - (n.lines.length - 1) / 2) * n.fs * 1.18"
            :class="{ extra: n.kinds[i] === 'extra', sub: n.kinds[i] === 'sub', 'root-title': n.isRoot && n.kinds[i] === 'title' }"
          >
            {{ l }}
          </text>
        </g>
      </g>
    </g>
    <g ref="fx" class="fx" />
    </g>
  </svg>
  <div class="zoom-ctl">
    <button title="Zooma in" @click="zoomBtn(1.25)"><ZoomIn :size="18" /></button>
    <button title="Zooma ut" @click="zoomBtn(0.8)"><ZoomOut :size="18" /></button>
    <button title="Anpassa till fönstret" @click="refit"><Maximize :size="18" /></button>
  </div>
  <div
    v-if="hover && (hover.n.desc || hover.n.fullTitle)"
    class="tip"
    :style="{ left: Math.min(hover.x + 16, vw() - 300) + 'px', top: hover.y + 18 + 'px' }"
  >
    <strong>{{ hover.n.fullTitle }}</strong>
    <span v-if="hover.n.desc">{{ hover.n.desc }}</span>
  </div>
</template>
