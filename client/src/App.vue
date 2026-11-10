<script setup>
import { ref, computed, provide, onMounted, onBeforeUnmount } from 'vue'
import { Sun, Moon, Library as LibraryIcon, X } from 'lucide-vue-next'
import { api } from './api.js'
import {
  allAncestors,
  find,
  index,
  linksTo,
  newId,
  pendingBelow,
  percent as calcPercent,
  reaches,
  removeLinksTo,
  stepHue
} from './tree.js'
import { ROOT_ID } from './physics.js'
import { touchRecent } from './recent.js'
import BubbleCanvas from './components/BubbleCanvas.vue'
import TableEditor from './components/TableEditor.vue'
import FabMenu from './components/FabMenu.vue'
import NodeCard from './components/NodeCard.vue'
import RootCard from './components/RootCard.vue'
import StepForm from './components/StepForm.vue'
import LinkPicker from './components/LinkPicker.vue'
import TemplateForm from './components/TemplateForm.vue'
import Library from './components/Library.vue'

const doc = ref(null)
const config = ref({ machineTypes: [] })
const canvas = ref(null)
const card = ref(null) // { type: 'node' | 'root' | 'step' | 'template', id? }
const adding = ref(false)
const view = ref('bubbles')
const notice = ref('')
const library = ref(false)
const theme = ref(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

const ix = computed(() => index(doc.value?.steps))
provide('ix', ix)

const pct = computed(() => (doc.value ? calcPercent(doc.value.steps) : 0))
const cardNode = computed(() => (card.value?.id && doc.value ? find(doc.value.steps, card.value.id) : null))

function trail(list, target, acc) {
  for (const s of list) {
    if (s.ref) continue
    if (s.id === target) return acc
    const r = trail(s.sub_steps ?? [], target, [...acc, s.title])
    if (r) return r
  }
  return null
}
const cardPath = computed(() =>
  cardNode.value ? trail(doc.value.steps, card.value.id, [doc.value.project.title]) ?? [] : []
)
const shared = computed(() =>
  cardNode.value
    ? linksTo(doc.value.steps, card.value.id).map(({ link, parent }) => ({
        refId: link.id,
        parentTitle: parent ? parent.title : doc.value.project.title
      }))
    : []
)

function linkCandidates() {
  const id = card.value?.id
  const parent = !id || id === ROOT_ID ? null : ix.value.get(id)
  const children = parent ? parent.sub_steps ?? [] : doc.value.steps
  const taken = new Set(children.map((c) => c.ref ?? c.id))
  const names = new Map()
  const walk = (list, path) => {
    for (const s of list) {
      if (s.ref) continue
      names.set(s.id, path)
      walk(s.sub_steps ?? [], [...path, s.title])
    }
  }
  walk(doc.value.steps, [doc.value.project.title])
  return [...ix.value.values()]
    .filter((t) => !taken.has(t.id) && !(parent && reaches(t, parent, ix.value)))
    .map((t) => ({ id: t.id, title: t.title, path: names.get(t.id).join(' › ') }))
}

function addLink(targetId) {
  const id = card.value.id
  const link = { id: newId(), ref: targetId }
  if (!id || id === ROOT_ID) doc.value.steps.push(link)
  else {
    const { node } = find(doc.value.steps, id)
    node.sub_steps = [...(node.sub_steps ?? []), link]
  }
  card.value = null
  save()
}

function unlink(refId) {
  const walk = (list) => {
    const i = list.findIndex((c) => c.id === refId)
    if (i >= 0) {
      list.splice(i, 1)
      return true
    }
    return list.some((s) => {
      if (!s.sub_steps || !walk(s.sub_steps)) return false
      if (!s.sub_steps.length) delete s.sub_steps
      return true
    })
  }
  walk(doc.value.steps)
  card.value = null
  save()
}

const stepParentTitle = computed(() => {
  const id = card.value?.id
  return !id || id === ROOT_ID ? doc.value?.project.title : find(doc.value.steps, id)?.node.title
})

function applyTheme() {
  document.documentElement.dataset.theme = theme.value
  localStorage.setItem('theme', theme.value)
}
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme()
}

const MAX_HISTORY = 10
const undoStack = []
const redoStack = []
const history = ref({ undo: 0, redo: 0 })
const revision = ref(0)
let baseline = ''
let saveTimer = 0

const snap = () =>
  JSON.stringify({ steps: doc.value.steps, title: doc.value.project.title, description: doc.value.project.description })

function syncHistory() {
  history.value = { undo: undoStack.length, redo: redoStack.length }
}

function resetHistory() {
  undoStack.length = 0
  redoStack.length = 0
  baseline = snap()
  syncHistory()
}

async function persist() {
  const res = await api.saveProject(doc.value.machine.number, doc.value)
  doc.value.project = { ...doc.value.project, ...res.project }
}

async function save() {
  clearTimeout(saveTimer)
  saveTimer = 0
  if (!doc.value) return
  const cur = snap()
  if (cur === baseline) return
  undoStack.push(baseline)
  if (undoStack.length > MAX_HISTORY) undoStack.shift()
  redoStack.length = 0
  baseline = cur
  syncHistory()
  await persist()
}

function saveSoon(ms) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, ms)
}

async function flush() {
  if (saveTimer) await save()
}

function restore(state) {
  const s = JSON.parse(state)
  doc.value.steps = s.steps
  doc.value.project.title = s.title
  doc.value.project.description = s.description
  baseline = state
  card.value = null
  adding.value = false
  revision.value++
  syncHistory()
  return persist()
}

async function undo() {
  await flush()
  if (!undoStack.length) return
  redoStack.push(baseline)
  await restore(undoStack.pop())
}

async function redo() {
  await flush()
  if (!redoStack.length) return
  undoStack.push(baseline)
  await restore(redoStack.pop())
}

function onTableChange(p) {
  doc.value.steps = p.steps
  doc.value.project.title = p.title ?? doc.value.project.title
  doc.value.project.description = p.description
  saveSoon(600)
}

function setView(name) {
  card.value = null
  adding.value = false
  view.value = name
}

async function openProject(number) {
  await flush()
  try {
    doc.value = await api.project(number)
    localStorage.setItem('project', String(number))
    touchRecent(number)
    resetHistory()
  } catch {
    doc.value = null
    localStorage.removeItem('project')
  }
  card.value = null
  adding.value = false
  library.value = false
}

function onSelect(id) {
  if (adding.value) {
    card.value = { type: 'step', id }
    adding.value = false
    return
  }
  card.value = id === ROOT_ID ? { type: 'root' } : { type: 'node', id }
}

function pop(node) {
  canvas.value.playPop(node.id)
  node.status = 'completed'
  card.value = null
  save()
}

function popNode() {
  pop(cardNode.value.node)
}

let noticeTimer
function onPop(id) {
  const found = find(doc.value.steps, id)
  if (!found || found.node.status === 'completed') return
  const left = pendingBelow(found.node, ix.value)
  if (left) {
    notice.value = `Poppa de ${left} mindre bubblorna först`
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (notice.value = ''), 2200)
    return
  }
  pop(found.node)
}

function addStep(data) {
  const step = { id: newId(), status: 'pending', ...data }
  const id = card.value.id
  if (!id || id === ROOT_ID) doc.value.steps.push(step)
  else {
    const { node } = find(doc.value.steps, id)
    node.sub_steps = [...(node.sub_steps ?? []), step]
  }
  card.value = null
  save()
}

async function saveTemplate(data) {
  await api.createTemplate({ ...data, steps: doc.value.steps })
  card.value = null
}

function onDeleted(number) {
  if (doc.value?.machine.number === number) {
    doc.value = null
    localStorage.removeItem('project')
  }
}

function editNode(data) {
  const { node } = cardNode.value
  node.title = data.title
  node.description = data.description
  if (data.value === undefined) delete node.value
  else node.value = data.value
  if (data.unit === undefined) delete node.unit
  else node.unit = data.unit
  save()
}

function removeNode() {
  const { node, parent } = cardNode.value
  const list = parent ? parent.sub_steps : doc.value.steps
  canvas.value.playPop(node.id)
  const owned = new Set()
  const collect = (n) => {
    owned.add(n.id)
    for (const c of n.sub_steps ?? []) if (!c.ref) collect(c)
  }
  collect(node)
  list.splice(list.indexOf(node), 1)
  removeLinksTo(doc.value.steps, owned)
  if (parent && !list.length) delete parent.sub_steps
  card.value = null
  save()
}

function setColor(hue) {
  cardNode.value.node.color = hue
  saveSoon(400)
}

function editProject(data) {
  doc.value.project.title = data.title
  doc.value.project.description = data.description
  save()
}

function reopen(id) {
  const node = ix.value.get(id)
  if (!node) return
  for (const n of [...allAncestors(id, ix.value), node]) n.status = 'pending'
  save()
}

function startAdding() {
  if (!doc.value || view.value !== 'bubbles') return
  card.value = null
  library.value = false
  adding.value = true
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const k = e.key.toLowerCase()
    if (!['a', 'z', 'y'].includes(k) || e.target.closest?.('input, textarea, select')) return
    e.preventDefault()
    if (k === 'a' && !e.shiftKey) startAdding()
    else if (k === 'y' || (k === 'z' && e.shiftKey)) redo()
    else if (k === 'z') undo()
    return
  }
  if (e.key !== 'Escape') return
  if (card.value) card.value = null
  else if (adding.value) adding.value = false
  else if (library.value) library.value = false
}

onMounted(async () => {
  applyTheme()
  window.addEventListener('keydown', onKey)
  config.value = await api.config()
  const stored = Number(localStorage.getItem('project'))
  if (stored) await openProject(stored)
  if (!doc.value) {
    const list = await api.projects('active')
    if (list.length) await openProject(list[0].machine_number)
  }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <BubbleCanvas
    v-if="doc && view === 'bubbles'"
    ref="canvas"
    :key="doc.machine.number"
    :layout-key="String(doc.machine.number)"
    :title="doc.project.title"
    :steps="doc.steps"
    :adding="adding"
    @select="onSelect"
    @pop="onPop"
  />
  <TableEditor v-else-if="doc" :key="doc.machine.number" :doc="doc" :revision="revision" @change="onTableChange" />
  <div v-else class="empty-state">
    <h1>Mind Bubble</h1>
    <p class="muted">Inget projekt öppet.</p>
    <button class="btn primary" @click="library = true"><LibraryIcon :size="16" /> Öppna biblioteket</button>
  </div>

  <div v-if="doc" class="chip">{{ doc.machine.type }} · {{ doc.machine.number }}</div>
  <button class="icon-btn theme" :title="theme === 'dark' ? 'Ljust läge' : 'Mörkt läge'" @click="toggleTheme">
    <Sun v-if="theme === 'dark'" :size="18" />
    <Moon v-else :size="18" />
  </button>

  <Transition name="banner">
    <div v-if="notice" class="banner warn-banner">{{ notice }}</div>
  </Transition>

  <Transition name="banner">
    <div v-if="adding" class="banner">
      Välj bubblan som ska få ett nytt steg
      <button class="icon-btn" @click="adding = false"><X :size="16" /></button>
    </div>
  </Transition>

  <FabMenu
    :disabled="!doc"
    :view="view"
    :can-undo="history.undo > 0"
    :can-redo="history.redo > 0"
    :current="doc?.machine.number"
    @add-step="startAdding"
    @save-template="card = { type: 'template' }"
    @library="library = true"
    @view="setView"
    @undo="undo"
    @redo="redo"
    @open="openProject"
  />

  <RootCard v-if="doc && card?.type === 'root'" :doc="doc" :percent="pct"   @close="card = null" @reopen="reopen" @edit="editProject" />
  <NodeCard
    v-if="doc && card?.type === 'node' && cardNode"
    :node="cardNode.node"
    :path="cardPath"
    :hue="cardNode.parent ? null : stepHue(doc.steps, cardNode.node)"
    :ix="ix"
    :shared="shared"
    @unlink="unlink"
    @close="card = null"
    @done="popNode"
      @edit="editNode"
    @remove="removeNode"
    @color="setColor"
    @reopen="reopen"
  />
  <LinkPicker
    v-if="doc && card?.type === 'link'"
    :where="`Läggs under: ${stepParentTitle}`"
    :candidates="linkCandidates()"
    @close="card = null"
    @pick="addLink"
  />
  <StepForm
    v-if="doc && card?.type === 'step'"
    can-link
    :parent-title="stepParentTitle"
    @close="card = null"
    @save="addStep"
    @link="card = { type: 'link', id: card.id }"
  />
  <TemplateForm
    v-if="doc && card?.type === 'template'"
    :doc="doc"
    :machine-types="config.machineTypes"
    @close="card = null"
    @save="saveTemplate"
  />
  <Library
    v-if="library"
    :current="doc?.machine.number"
    :machine-types="config.machineTypes"
    @close="library = false"
    @open="openProject"
    @deleted="onDeleted"
  />
</template>
