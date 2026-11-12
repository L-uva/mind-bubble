<script setup>
import { ref, onMounted, watch } from 'vue'
import { X, Plus, Save, Trash2, ChevronLeft } from 'lucide-vue-next'
import { api } from '../api.js'

const props = defineProps({ current: Number, machineTypes: Array })
const emit = defineEmits(['close', 'open', 'deleted'])

const tab = ref('active')
const projects = ref([])
const templates = ref([])
const creating = ref(false)
const error = ref('')

const form = ref({ source: 'scratch', template_id: '', machine_number: '', machine_type: '', title: '', description: '' })

async function load() {
  projects.value = await api.projects(tab.value)
}

async function openCreate() {
  templates.value = await api.templates()
  form.value = {
    source: 'scratch',
    template_id: '',
    machine_number: '',
    machine_type: props.machineTypes[0] || '',
    title: '',
    description: ''
  }
  error.value = ''
  creating.value = true
}

function pickTemplate() {
  const t = templates.value.find((x) => x.id === Number(form.value.template_id))
  if (t) {
    form.value.title = t.title
    form.value.description = t.description
    form.value.machine_type = t.machine_type || form.value.machine_type
  }
}

async function create() {
  error.value = ''
  const f = form.value
  try {
    const doc = await api.createProject({
      machine_number: f.machine_number,
      machine_type: f.machine_type,
      title: f.title,
      description: f.description,
      template_id: f.source === 'template' ? f.template_id : undefined
    })
    emit('open', doc.machine.number)
  } catch (e) {
    error.value = e.message
  }
}

async function remove(p) {
  if (!confirm(`Ta bort ${p.title} (${p.machine_number})?`)) return
  await api.deleteProject(p.machine_number)
  emit('deleted', p.machine_number)
  load()
}

async function removeTemplate() {
  const id = Number(form.value.template_id)
  if (!id || !confirm('Ta bort mallen?')) return
  await api.deleteTemplate(id)
  templates.value = await api.templates()
  form.value.template_id = ''
}

watch(tab, load)
onMounted(load)
</script>

<template>
  <div class="overlay drawer-overlay" @pointerdown.self="emit('close')">
    <aside class="drawer">
      <header>
        <button v-if="creating" class="icon-btn" title="Tillbaka" @click="creating = false"><ChevronLeft :size="16" /></button>
        <h2>{{ creating ? 'Nytt projekt' : 'Bibliotek' }}</h2>
        <button class="icon-btn" title="Stäng" @click="emit('close')"><X :size="16" /></button>
      </header>

      <template v-if="!creating">
        <div class="seg">
          <button :class="{ on: tab === 'active' }" @click="tab = 'active'">Pågående</button>
          <button :class="{ on: tab === 'completed' }" @click="tab = 'completed'">Avslutade</button>
        </div>
        <ul class="plist">
          <li v-for="p in projects" :key="p.machine_number" :class="{ current: p.machine_number === current }">
            <button class="pitem" @click="emit('open', p.machine_number)">
              <strong>{{ p.title }}</strong>
              <span class="muted">{{ p.machine_type }} · {{ p.machine_number }}</span>
              <span class="bar"><span :style="{ width: p.completed + '%' }" /></span>
            </button>
            <span class="pct-small">{{ p.completed }} %</span>
            <button class="icon-btn" title="Ta bort" @click="remove(p)"><Trash2 :size="16" /></button>
          </li>
          <li v-if="!projects.length" class="muted empty">Inga projekt här än.</li>
        </ul>
        <div class="drawer-foot">
          <button class="btn primary" @click="openCreate"><Plus :size="16" /> Nytt projekt</button>
        </div>
      </template>

      <form v-else class="form" @submit.prevent="create">
        <div class="seg">
          <button type="button" :class="{ on: form.source === 'scratch' }" @click="form.source = 'scratch'">Från början</button>
          <button type="button" :class="{ on: form.source === 'template' }" @click="form.source = 'template'">Från mall</button>
        </div>
        <label>Maskinnummer *<input v-model="form.machine_number" type="number" min="1" required autofocus /></label>
        <label v-if="form.source === 'template'">
          Mall
          <span class="row tight">
            <select v-model="form.template_id" required @change="pickTemplate">
              <option value="" disabled>Välj mall…</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}{{ t.machine_type ? ' · ' + t.machine_type : '' }}</option>
            </select>
            <button type="button" class="icon-btn" title="Ta bort mall" :disabled="!form.template_id" @click="removeTemplate">
              <Trash2 :size="16" />
            </button>
          </span>
        </label>
        <label>
          Maskintyp
          <select v-model="form.machine_type">
            <option v-for="t in machineTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label>Titel *<input v-model="form.title" required /></label>
        <label>Beskrivning<textarea v-model="form.description" rows="3" /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="drawer-foot">
          <button type="button" class="btn ghost" @click="creating = false"><X :size="16" /> Avbryt</button>
          <button type="submit" class="btn primary"><Save :size="16" /> Skapa</button>
        </div>
      </form>
    </aside>
  </div>
</template>
