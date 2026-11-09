<script setup>
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { World, ROOT_ID, fitText } from '../physics.js'
import { HUES, isVisible, percent, valueText } from '../tree.js'

const props = defineProps({
  title: { type: String, default: '' },
  steps: { type: Array, default: () => [] },
  adding: { type: Boolean, default: false }
})
const emit = defineEmits(['select'])

const svg = ref(null)
const fx = ref(null)
const views = shallowRef([])
const world = new World()
let raf = 0
let last = 0
let down = null

function items() {
  const out = [{ id: ROOT_ID, parentId: null, level: 0, hue: 255, label: props.title, extra: `${percent(props.steps)} %` }]
  const walk = (list, parentId, level, hue) => {
    list.forEach((s, i) => {
      if (!isVisible(s)) return
      const h = level === 1 ? (s.color ?? HUES[i % HUES.length]) : hue
      out.push({ id: s.id, parentId, level, hue: h, label: s.title, extra: valueText(s), done: s.status === 'completed' })
      walk(s.sub_steps ?? [], s.id, level + 1, h)
    })
  }
  walk(props.steps, ROOT_ID, 1, 0)
  return out
}

function rebuild() {
  const list = items()
  world.setTree(list)
  for (const it of list) {
    const n = world.map.get(it.id)
    const t = fitText(it.label, n.r0, it.extra)
    n.lines = t.lines
    n.fs = t.fs
    n.hasExtra = t.hasExtra
    n.fullTitle = it.label
    n.done = !!it.done
  }
  views.value = world.nodes.slice()
}

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016)
  last = now
  world.step(dt / 2)
  world.step(dt / 2)
  for (const n of world.nodes) {
    if (!n.el) continue
    const a = 0.5 + 0.5 * easeOutBack(n.appear)
    n.el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)}) scale(${a.toFixed(3)})`)
    n.el.style.opacity = Math.min(1, n.appear * 1.6)
    n.body?.setAttribute('r', n.R.toFixed(2))
    const p = n.line && world.map.get(n.parentId)
    if (p) {
      n.line.setAttribute('x1', p.x.toFixed(1))
      n.line.setAttribute('y1', p.y.toFixed(1))
      n.line.setAttribute('x2', n.x.toFixed(1))
      n.line.setAttribute('y2', n.y.toFixed(1))
    }
  }
  raf = requestAnimationFrame(frame)
}

function easeOutBack(t) {
  const c = 1.9
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

function pointer(e) {
  const r = svg.value.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function onDown(e, n) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const p = pointer(e)
  down = { n, x: p.x, y: p.y, ox: p.x - n.x, oy: p.y - n.y, moved: false }
  svg.value.setPointerCapture(e.pointerId)
}

function onMove(e) {
  if (!down) return
  const p = pointer(e)
  if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 5) {
    down.moved = true
    if (!down.n.isRoot) world.startDrag(down.n.id, p.x - down.ox, p.y - down.oy)
  }
  if (down.moved) world.moveDrag(p.x - down.ox, p.y - down.oy)
}

function onUp() {
  if (!down) return
  if (!down.moved) emit('select', down.n.id)
  world.endDrag()
  down = null
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

let ro
onMounted(() => {
  const resize = () => {
    const r = svg.value.getBoundingClientRect()
    world.setSize(r.width, r.height)
    if (world.nodes.length) rebuild()
  }
  ro = new ResizeObserver(resize)
  ro.observe(svg.value)
  resize()
  rebuild()
  last = performance.now()
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
})
</script>

<template>
  <svg
    ref="svg"
    class="canvas"
    :class="{ adding }"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <g class="edges">
      <line v-for="n in views.filter((v) => !v.isRoot)" :key="n.id" :ref="(el) => (n.line = el)" class="edge" />
    </g>
    <g class="bubbles">
      <g
        v-for="n in views"
        :key="n.id"
        :ref="(el) => (n.el = el)"
        class="bubble"
        :class="{ root: n.isRoot, done: n.done }"
        :style="{ '--h': n.hue, '--lv': n.level }"
        @pointerdown="onDown($event, n)"
      >
        <title>{{ n.fullTitle }}</title>
        <circle :ref="(el) => (n.body = el)" class="body" :r="n.r0" />
        <g class="labels" :font-size="n.fs">
          <text
            v-for="(l, i) in n.lines"
            :key="i"
            x="0"
            :y="(i - (n.lines.length - 1) / 2) * n.fs * 1.18"
            :class="{ extra: n.hasExtra && i === n.lines.length - 1, 'root-title': n.isRoot && !(n.hasExtra && i === n.lines.length - 1) }"
          >
            {{ l }}
          </text>
        </g>
      </g>
    </g>
    <g ref="fx" class="fx" />
  </svg>
</template>
