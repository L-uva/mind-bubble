<script setup>
import { ref, computed } from 'vue'
import { X, Save, Link2 } from 'lucide-vue-next'
import Card from './Card.vue'

const props = defineProps({ parentTitle: String, canLink: Boolean })
const emit = defineEmits(['close', 'save', 'link'])

const title = ref('')
const subtitle = ref('')
const description = ref('')
const value = ref('')
const unit = ref('')
const valid = computed(() => title.value.trim())

function submit() {
  if (!valid.value) return
  const step = { title: title.value.trim(), description: description.value.trim() }
  if (subtitle.value.trim()) step.subtitle = subtitle.value.trim()
  const v = String(value.value).trim()
  if (v !== '') step.value = isNaN(Number(v)) ? v : Number(v)
  if (unit.value.trim()) step.unit = unit.value.trim()
  emit('save', step)
}
</script>

<template>
  <Card title="Nytt steg" :subtitle="`Läggs under: ${parentTitle}`" @close="emit('close')">
    <form id="step-form" class="form" @submit.prevent="submit">
      <label>Uppgift *<input v-model="title" autofocus required /></label>
      <label>Underrubrik<input v-model="subtitle" /></label>
      <label>Beskrivning<textarea v-model="description" rows="3" /></label>
      <div class="row">
        <label>Värde<input v-model="value" /></label>
        <label>Enhet<input v-model="unit" /></label>
      </div>
    </form>
    <template #actions>
      <button v-if="canLink" class="btn ghost link-btn" type="button" @click="emit('link')">
        <Link2 :size="16" /> Länka befintlig
      </button>
      <button class="btn ghost" type="button" @click="emit('close')"><X :size="16" /> Avbryt</button>
      <button class="btn primary" type="submit" form="step-form" :disabled="!valid"><Save :size="16" /> Spara</button>
    </template>
  </Card>
</template>
