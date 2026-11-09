<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Sun, Moon, Library as LibraryIcon, X } from 'lucide-vue-next'
import { api } from './api.js'
import { ancestors, find, newId, percent as calcPercent, stepHue } from './tree.js'
import { ROOT_ID } from './physics.js'
import BubbleCanvas from './components/BubbleCanvas.vue'
import FabMenu from './components/FabMenu.vue'
import NodeCard from './components/NodeCard.vue'
import RootCard from './components/RootCard.vue'
import StepForm from './components/StepForm.vue'
import TemplateForm from './components/TemplateForm.vue'
import Library from './components/Library.vue'

const doc = ref(null)
const config = ref({ machineTypes: [] })
const canvas = ref(null)
const card = ref(null) // { type: 'node' | 'root' | 'step' | 'template', id? }
const adding = ref(false)
const library = ref(false)
const theme = ref(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

const pct = computed(() => (doc.value ? calcPercent(doc.value.steps) : 0))
const cardNode = computed(() => (card.value?.id && doc.value ? find(doc.value.steps, card.value.id) : null))

function trail(list, target, acc) {
  for (const s of list) {
    if (s.id === target) return acc
    const r = trail(s.sub_steps ?? [], target, [...acc, s.title])
    if (r) return r
  }
  return null
}
const cardPath = computed(() =>
  cardNode.value ? trail(doc.value.steps, card.value.id, [doc.value.project.title]) ?? [] : []
)
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

async function save() {
  const res = await api.saveProject(doc.value.machine.number, doc.value)
  doc.value.project = { ...doc.value.project, ...res.project }
}

async function openProject(number) {
  try {
    doc.value = await api.project(number)
    localStorage.setItem('project', String(number))
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

function popNode() {
  const { node } = cardNode.value
  canvas.value.playPop(node.id)
  node.status = 'completed'
  card.value = null
  save()
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
  list.splice(list.indexOf(node), 1)
  if (parent && !list.length) delete parent.sub_steps
  card.value = null
  save()
}

let colorTimer
function setColor(hue) {
  cardNode.value.node.color = hue
  clearTimeout(colorTimer)
  colorTimer = setTimeout(save, 400)
}

function editProject(data) {
  doc.value.project.title = data.title
  doc.value.project.description = data.description
  save()
}

function reopen(id) {
  const chain = ancestors(doc.value.steps, id)
  if (!chain) return
  for (const n of [...chain, find(doc.value.steps, id).node]) n.status = 'pending'
  save()
}

function startAdding() {
  if (!doc.value) return
  card.value = null
  library.value = false
  adding.value = true
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') {
    if (e.target.closest?.('input, textarea, select')) return
    e.preventDefault()
    startAdding()
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
    v-if="doc"
    ref="canvas"
    :title="doc.project.title"
    :steps="doc.steps"
    :adding="adding"
    @select="onSelect"
  />
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
    <div v-if="adding" class="banner">
      Välj bubblan som ska få ett nytt steg
      <button class="icon-btn" @click="adding = false"><X :size="16" /></button>
    </div>
  </Transition>

  <FabMenu :disabled="!doc" @add-step="startAdding" @save-template="card = { type: 'template' }" @library="library = true" />

  <RootCard v-if="doc && card?.type === 'root'" :doc="doc" :percent="pct"   @close="card = null" @reopen="reopen" @edit="editProject" />
  <NodeCard
    v-if="doc && card?.type === 'node' && cardNode"
    :node="cardNode.node"
    :path="cardPath"
    :hue="cardNode.parent ? null : stepHue(doc.steps, cardNode.node)"
    @close="card = null"
    @done="popNode"
      @edit="editNode"
    @remove="removeNode"
    @color="setColor"
    @reopen="reopen"
  />
  <StepForm v-if="doc && card?.type === 'step'" :parent-title="stepParentTitle" @close="card = null" @save="addStep" />
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
