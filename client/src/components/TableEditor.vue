<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { GripVertical, Trash2, ArrowUpToLine, ArrowDownToLine, Link2 } from 'lucide-vue-next'
import LinkPicker from './LinkPicker.vue'
import { assignHues, rootHue } from '../tree.js'
import {
  blankRow,
  blockEnd,
  build,
  ensureTail,
  flatten,
  indent,
  isBlank,
  linkRow,
  moveDown,
  moveTo,
  moveUp,
  normalize,
  outdent,
  pruneLinks,
  removeBlock,
  toggleDone
} from '../tableModel.js'

const INDENT = 22
const GRIP = 34

const props = defineProps({ doc: Object, revision: { type: Number, default: 0 } })
const emit = defineEmits(['change'])

const page = ref(null)
const tbl = ref(null)
const rows = ref([])
const root = ref({ title: '', description: '' })
const menu = ref(null)
const drag = ref(null)
const picker = ref(null)
let skipEmit = false

function tidy() {
  normalize(rows.value)
  pruneLinks(rows.value)
  ensureTail(rows.value)
}

function load() {
  rows.value = flatten(props.doc.steps)
  root.value = { title: props.doc.project.title, description: props.doc.project.description ?? '' }
  tidy()
}
load()

watch(
  () => props.revision,
  () => {
    skipEmit = true
    load()
  }
)

watch(
  [rows, root],
  () => {
    if (skipEmit) {
      skipEmit = false
      return
    }
    tidy()
    emit('change', {
      steps: build(rows.value),
      title: root.value.title.trim() || undefined,
      description: root.value.description.trim()
    })
  },
  { deep: true }
)

const percent = computed(() => {
  const real = rows.value.filter((r) => !r.ref && r.title.trim())
  return real.length ? Math.round((real.filter((r) => r.done).length / real.length) * 100) : 0
})

const view = computed(() => {
  const hues = assignHues(
    rows.value.filter((r) => r.depth === 1 && !r.ref && r.title.trim()).map((r) => ({ id: r.id, color: r.extra.color }))
  )
  return rows.value.map((r, i) => {
    const t = r.ref ? rows.value.find((x) => x.id === r.ref) : null
    return { r, i, hue: hues.get(r.id) ?? hues.get(topOf(i)), t, last: i === rows.value.length - 1 }
  })
})

function topOf(i) {
  for (let k = i; k >= 0; k--) if (rows.value[k].depth === 1 && !rows.value[k].ref) return rows.value[k].id
  return null
}

const ids = computed(() => ['root', ...rows.value.map((r) => r.id)])

function cell(id, col) {
  return tbl.value?.querySelector(`[data-row="${id}"][data-col="${col}"]`)
}

function focusCell(id, col = 'title', sel) {
  nextTick(() => {
    const el = cell(id, col)
    if (!el) return
    el.focus()
    const [a, b] = sel ?? [el.value.length, el.value.length]
    el.setSelectionRange(a, b)
  })
}

function focusNeighbor(id, col, dir) {
  const k = ids.value.indexOf(id) + dir
  if (k >= 0 && k < ids.value.length) focusCell(ids.value[k], col)
}

function onKey(e, r, col) {
  const i = rows.value.indexOf(r)
  const el = e.target
  const sel = [el.selectionStart, el.selectionEnd]
  const run = (fn) => {
    e.preventDefault()
    fn(rows.value, i)
    tidy()
    focusCell(r.id, col, sel)
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.key === 'ArrowRight') return run(indent)
    if (e.key === 'ArrowLeft') return run(outdent)
    if (e.key === 'ArrowUp') return run(moveUp)
    if (e.key === 'ArrowDown') return run(moveDown)
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    focusNeighbor(r.id, col, e.key === 'ArrowUp' ? -1 : 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    focusNeighbor(r.id, col, 1)
  } else if (r.ref && (e.key === 'Backspace' || e.key === 'Delete')) {
    e.preventDefault()
    const prev = ids.value[ids.value.indexOf(r.id) - 1]
    removeBlock(rows.value, i)
    tidy()
    focusCell(prev, 'title')
  } else if (e.key === 'Backspace' && col === 'title' && !r.title && !r.subtitle && !r.description && sel[0] === 0) {
    e.preventDefault()
    if (r.depth > 1) return run(outdent)
    const prev = ids.value[ids.value.indexOf(r.id) - 1]
    if (i !== rows.value.length - 1) removeBlock(rows.value, i)
    tidy()
    focusCell(prev, 'title')
  }
}

function onRootKey(e, col) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  if (e.key === 'ArrowDown' || e.key === 'Enter') {
    e.preventDefault()
    focusCell(rows.value[0].id, col)
  }
}

function toggle(r) {
  toggleDone(rows.value, rows.value.indexOf(r.ref ? rows.value.find((x) => x.id === r.ref) : r))
}

function openMenu(e, r) {
  if (isBlank(r)) return
  menu.value = { x: e.clientX, y: e.clientY, id: r.id }
}

let press = 0

function rowDown(e, r) {
  if (e.pointerType === 'mouse' || e.target.closest('input, textarea, .grip')) return
  const { clientX: x, clientY: y } = e
  clearTimeout(press)
  press = setTimeout(() => {
    openMenu({ clientX: x, clientY: y }, r)
    navigator.vibrate?.(15)
  }, 500)
}

function rowCancel() {
  clearTimeout(press)
}

function linkCandidates() {
  const i = rows.value.findIndex((r) => r.id === picker.value.id)
  const row = rows.value[i]
  const chain = new Set()
  let d = row.depth
  for (let k = i - 1; k >= 0 && d > 1; k--) {
    if (rows.value[k].depth < d) {
      chain.add(rows.value[k].id)
      d = rows.value[k].depth
    }
  }
  const path = []
  const out = []
  for (const r of rows.value) {
    path.length = r.depth - 1
    if (r.ref) continue
    path[r.depth - 1] = r.title.trim()
    if (r.title.trim() && !chain.has(r.id) && r.id !== row.id) {
      out.push({ id: r.id, title: r.title.trim(), path: path.slice(0, -1).join(' › ') || root.value.title })
    }
  }
  return out
}

function pickLink(target) {
  const i = rows.value.findIndex((r) => r.id === picker.value.id)
  picker.value = null
  if (i < 0) return
  const fresh = linkRow(target, rows.value[i].depth)
  rows.value.splice(blockEnd(rows.value, i), 0, fresh)
  tidy()
  focusCell(fresh.id)
}

function menuAction(kind) {
  const i = rows.value.findIndex((r) => r.id === menu.value.id)
  menu.value = null
  if (i < 0) return
  const row = rows.value[i]
  if (kind === 'link') {
    picker.value = { id: row.id }
    return
  }
  if (kind === 'delete') {
    removeBlock(rows.value, i)
    tidy()
    return
  }
  const fresh = blankRow(row.depth)
  rows.value.splice(kind === 'insert' ? i : blockEnd(rows.value, i), 0, fresh)
  tidy()
  focusCell(fresh.id)
}

function startDrag(e, r) {
  if (e.button !== 0) return
  e.preventDefault()
  const from = rows.value.indexOf(r)
  drag.value = { from, end: blockEnd(rows.value, from), target: null }
  window.addEventListener('pointermove', moveDrag)
  window.addEventListener('pointerup', endDrag, { once: true })
}

function moveDrag(e) {
  const d = drag.value
  if (!d) return
  if (e.clientY < 90) page.value.scrollBy(0, -14)
  else if (e.clientY > innerHeight - 90) page.value.scrollBy(0, 14)
  const els = [...tbl.value.querySelectorAll('[data-wrap]')]
  let k = els.findIndex((el) => e.clientY < el.getBoundingClientRect().bottom)
  if (k < 0) k = els.length - 1
  const rect = els[k].getBoundingClientRect()
  const top = e.clientY < rect.top + rect.height / 2
  const boundary = k + (top ? 0 : 1)
  if (boundary > d.from && boundary < d.end) {
    d.target = null
    return
  }
  const size = d.end - d.from
  const at = boundary > d.from ? boundary - size : boundary
  const rest = rows.value.filter((_, idx) => idx < d.from || idx >= d.end)
  const max = at > 0 ? rest[at - 1].depth + 1 : 1
  const origin = tbl.value.getBoundingClientRect()
  const depth = Math.max(1, Math.min(max, Math.floor((e.clientX - origin.left - GRIP - 6) / INDENT) + 1))
  d.target = { at, depth, y: (top ? rect.top : rect.bottom) - origin.top }
}

function endDrag() {
  window.removeEventListener('pointermove', moveDrag)
  const d = drag.value
  drag.value = null
  if (!d?.target) return
  const id = rows.value[d.from].id
  moveTo(rows.value, d.from, d.target.at, d.target.depth)
  tidy()
  focusCell(id)
}

function closeMenu(e) {
  if (e.type === 'keydown' && e.key !== 'Escape') return
  menu.value = null
}

onMounted(() => {
  window.addEventListener('pointerdown', closeMenu)
  window.addEventListener('keydown', closeMenu)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeMenu)
  window.removeEventListener('keydown', closeMenu)
  window.removeEventListener('pointermove', moveDrag)
})
</script>

<template>
  <div ref="page" class="table-page">
    <div ref="tbl" class="tbl" @dragstart.prevent>
      <div class="trow thead">
        <div />
        <div class="cell">Uppgift</div>
        <div class="cell">Underrubrik</div>
        <div class="cell">Beskrivning</div>
        <div class="cell">Status</div>
        <div class="cell center">Poppa</div>
      </div>

      <div class="trow root-row">
        <div />
        <div class="cell title">
          <span class="dot root" :style="{ '--h': rootHue() }" />
          <input
            v-model="root.title"
            data-row="root"
            data-col="title"
            placeholder="Projektets titel"
            @keydown="onRootKey($event, 'title')"
          />
        </div>
        <div class="cell" />
        <div class="cell">
          <input
            v-model="root.description"
            data-row="root"
            data-col="description"
            placeholder="Beskrivning"
            @keydown="onRootKey($event, 'description')"
          />
        </div>
        <div class="cell"><span class="pill">{{ percent }} %</span></div>
        <div />
      </div>

      <div
        v-for="{ r, i, hue, t, last } in view"
        :key="r.id"
        data-wrap
        class="trow"
        :class="{
          ghost: isBlank(r),
          done: t ? t.done : r.done,
          linked: !!r.ref,
          dragging: drag && i >= drag.from && i < drag.end
        }"
        @contextmenu.prevent="openMenu($event, r)"
        @pointerdown="rowDown($event, r)"
        @pointerup="rowCancel"
        @pointermove="rowCancel"
        @pointercancel="rowCancel"
      >
        <div class="grip" :class="{ off: isBlank(r) }" title="Dra för att flytta" @pointerdown="startDrag($event, r)">
          <GripVertical :size="15" />
        </div>
        <div class="cell title">
          <span class="guides" :style="{ width: (r.depth - 1) * INDENT + 'px' }" />
          <Link2 v-if="r.ref" class="link-ico" :size="14" />
          <span v-else-if="!isBlank(r)" class="dot" :style="{ '--h': hue }" />
          <span v-else class="dot ghost-dot" />
          <input
            v-if="r.ref"
            :value="t ? t.title : ''"
            readonly
            :data-row="r.id"
            data-col="title"
            title="Delad bubbla – redigera originalet"
            @keydown="onKey($event, r, 'title')"
          />
          <input
            v-else
            v-model="r.title"
            :data-row="r.id"
            data-col="title"
            :class="{ missing: !r.title.trim() && (r.description.trim() || r.subtitle.trim()) }"
            :placeholder="last ? 'Skriv för att lägga till…' : r.description.trim() || r.subtitle.trim() ? 'Uppgift saknas' : ''"
            @keydown="onKey($event, r, 'title')"
          />
        </div>
        <div class="cell">
          <input v-if="r.ref" :value="t ? t.subtitle : ''" readonly :data-row="r.id" data-col="subtitle" @keydown="onKey($event, r, 'subtitle')" />
          <input v-else v-model="r.subtitle" :data-row="r.id" data-col="subtitle" @keydown="onKey($event, r, 'subtitle')" />
        </div>
        <div class="cell">
          <input v-if="r.ref" :value="t ? t.description : ''" readonly :data-row="r.id" data-col="description" @keydown="onKey($event, r, 'description')" />
          <input v-else v-model="r.description" :data-row="r.id" data-col="description" @keydown="onKey($event, r, 'description')" />
        </div>
        <div class="cell">
          <span v-if="r.ref || r.title.trim()" class="pill" :class="{ ok: (t || r).done }">{{ (t || r).done ? 'Klart' : 'Väntar' }}</span>
        </div>
        <div class="cell center">
          <input v-if="r.ref || r.title.trim()" type="checkbox" tabindex="-1" :checked="(t || r).done" @change="toggle(r)" />
        </div>
      </div>

      <div
        v-if="drag?.target"
        class="drop-line"
        :style="{ top: drag.target.y + 'px', left: GRIP + (drag.target.depth - 1) * INDENT + 'px' }"
      />
    </div>

    <p class="hint">
      <kbd>Ctrl</kbd>+<kbd>→</kbd><kbd>←</kbd> flytta in/ut · <kbd>Ctrl</kbd>+<kbd>↑</kbd><kbd>↓</kbd> flytta raden · dra i
      handtaget · högerklicka för meny
    </p>

    <LinkPicker
      v-if="picker"
      :where="`Läggs efter: ${rows.find((r) => r.id === picker.id)?.title || '…'}`"
      :candidates="linkCandidates()"
      @close="picker = null"
      @pick="pickLink"
    />

    <Teleport to="body">
      <div v-if="menu" class="ctx" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @pointerdown.stop>
        <button @click="menuAction('insert')"><ArrowUpToLine :size="15" /> Infoga rad</button>
        <button @click="menuAction('add')"><ArrowDownToLine :size="15" /> Lägg till rad</button>
        <button @click="menuAction('link')"><Link2 :size="15" /> Länka befintlig…</button>
        <button class="danger" @click="menuAction('delete')"><Trash2 :size="15" /> Ta bort rad</button>
      </div>
    </Teleport>
  </div>
</template>
