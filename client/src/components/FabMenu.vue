<script setup>
import { ref, watch } from 'vue'
import {
  Menu,
  X,
  Plus,
  BookmarkPlus,
  Library,
  Undo2,
  Redo2,
  Table2,
  CircleDot,
  History,
  Settings,
  Palette,
  ChevronLeft,
  Check
} from 'lucide-vue-next'
import { api } from '../api.js'
import { getRecent } from '../recent.js'
import { HUES, PALETTES } from '../tree.js'

const props = defineProps({
  disabled: Boolean,
  view: { type: String, default: 'bubbles' },
  canUndo: Boolean,
  canRedo: Boolean,
  current: { type: Number, default: null },
  theme: { type: String, default: 'light' },
  settings: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['add-step', 'save-template', 'library', 'view', 'undo', 'redo', 'open', 'theme', 'settings'])
const open = ref(false)
const recent = ref([])
const showSettings = ref(false)
const showThemes = ref(false)

const OFFSETS = {
  pastel: HUES.slice(0, 4).map((h) => [h, 72, 82]),
  pop: HUES.slice(0, 4).map((h) => [h, 92, 60])
}

function preview(id) {
  const base = props.settings.baseHue ?? 255
  const spec =
    id === 'tonal'
      ? [0, 30, -30, 60].map((o) => [base + o, 60, 80])
      : id === 'complement'
        ? [0, 180, 30, 210].map((o) => [base + o, 65, 78])
        : OFFSETS[id]
  return spec.map(([h, s, l]) => `hsl(${h} ${s}% ${l}%)`)
}

watch(open, (v) => {
  if (!v) showSettings.value = false
})

watch(open, async (v) => {
  if (!v) return
  try {
    const all = await api.projects()
    const order = getRecent()
    const rank = (p) => {
      const k = order.indexOf(p.machine_number)
      return k < 0 ? 99 : k
    }
    recent.value = all
      .filter((p) => order.includes(p.machine_number))
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 5)
  } catch {
    recent.value = []
  }
})

function pick(name, ...args) {
  open.value = false
  emit(name, ...args)
}
</script>

<template>
  <div class="fab-wrap">
    <Transition name="menu">
      <div v-if="open" class="fab-menu">
        <button :disabled="view === 'bubbles'" @click="pick('view', 'bubbles')">
          <CircleDot :size="18" /> Mind Bubble <kbd v-if="view !== 'bubbles'">F2</kbd><Check v-if="view === 'bubbles'" :size="15" class="end" />
        </button>
        <button :disabled="view === 'table' || disabled" @click="pick('view', 'table')">
          <Table2 :size="18" /> Tabeleditor <kbd v-if="view !== 'table'">F2</kbd><Check v-if="view === 'table'" :size="15" class="end" />
        </button>
        <hr />
        <button :disabled="disabled || view !== 'bubbles'" @click="pick('add-step')">
          <Plus :size="18" /> Lägg till steg <kbd>Ctrl+A</kbd>
        </button>
        <button :disabled="!canUndo" @click="pick('undo')"><Undo2 :size="18" /> Ångra <kbd>Ctrl+Z</kbd></button>
        <button :disabled="!canRedo" @click="pick('redo')"><Redo2 :size="18" /> Gör om <kbd>Ctrl+Y</kbd></button>
        <hr />
        <div class="has-sub">
          <button><History :size="18" /> Senast använda <ChevronLeft :size="15" class="end" /></button>
          <div class="submenu">
            <p v-if="!recent.length" class="muted">Inget ännu</p>
            <button v-for="p in recent" :key="p.machine_number" @click="pick('open', p.machine_number)">
              <span class="rtitle">{{ p.title }}</span>
              <span class="muted">{{ p.machine_type }} · {{ p.machine_number }}</span>
              <Check v-if="p.machine_number === current" :size="14" class="end" />
            </button>
          </div>
        </div>
        <button :disabled="disabled" @click="pick('save-template')"><BookmarkPlus :size="18" /> Spara som mall</button>
        <button @click="pick('library')"><Library :size="18" /> Bibliotek</button>
        <hr />
        <div class="has-sub settings" :class="{ show: showSettings }">
          <button @click="showSettings = !showSettings"><Settings :size="18" /> Inställningar <ChevronLeft :size="15" class="end" /></button>
          <div class="submenu">
            <div class="set-col">
              <button class="theme-head" type="button" @click="showThemes = !showThemes">
                <span><Palette :size="16" /> Färgtema</span>
                <b>{{ PALETTES.find((p) => p.id === settings.palette)?.label }}</b>
              </button>
              <div v-if="showThemes" class="theme-opts">
                <button
                  v-for="p in PALETTES"
                  :key="p.id"
                  type="button"
                  class="theme-opt"
                  :class="{ on: settings.palette === p.id }"
                  @click="emit('settings', { palette: p.id })"
                >
                  <span class="theme-dots"><i v-for="(c, i) in preview(p.id)" :key="i" :style="{ background: c }" /></span>
                  {{ p.label }}
                </button>
              </div>
              <template v-if="showThemes && PALETTES.find((p) => p.id === settings.palette)?.base">
                <span class="muted">Kulör på första bubblan</span>
                <input
                  class="hue-slider"
                  type="range"
                  min="0"
                  max="359"
                  :value="settings.baseHue"
                  @input="emit('settings', { baseHue: Number($event.target.value) })"
                />
              </template>
            </div>
            <div class="set-row">
              <span>Mörkt läge</span>
              <button class="switch" :class="{ on: theme === 'dark' }" role="switch" :aria-checked="theme === 'dark'" @click="emit('theme')"><i /></button>
            </div>
            <div class="set-row">
              <span>Pulserande bubblor</span>
              <button class="switch" :class="{ on: settings.live }" role="switch" :aria-checked="!!settings.live" @click="emit('settings', { live: !settings.live })"><i /></button>
            </div>
            <div class="set-col">
              <span>Gruppering</span>
              <div class="seg" role="radiogroup">
                <button
                  v-for="(l, i) in ['Av', 'Lätt', 'Stark']"
                  :key="i"
                  :class="{ on: (settings.cluster || 0) === i }"
                  role="radio"
                  :aria-checked="(settings.cluster || 0) === i"
                  @click="emit('settings', { cluster: i })"
                >
                  {{ l }}
                </button>
              </div>
            </div>
            <div class="set-col">
              <span>Avstånd <b>{{ settings.spacing }}</b></span>
              <input type="range" min="5" max="40" step="1" :value="settings.spacing" @input="emit('settings', { spacing: Number($event.target.value) })" />
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <button class="fab" :class="{ open }" aria-label="Meny" @click="open = !open">
      <X v-if="open" :size="24" />
      <Menu v-else :size="24" />
    </button>
  </div>
</template>
