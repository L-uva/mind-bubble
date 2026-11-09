<script setup>
import { ref, computed } from 'vue'
import { X, Save } from 'lucide-vue-next'
import Card from './Card.vue'

const props = defineProps({ doc: Object, machineTypes: Array })
const emit = defineEmits(['close', 'save'])

const name = ref('')
const machineType = ref(props.doc.machine.type || props.machineTypes[0] || '')
const title = ref(props.doc.project.title)
const description = ref(props.doc.project.description)
const valid = computed(() => name.value.trim() && title.value.trim())

function submit() {
  if (!valid.value) return
  emit('save', {
    name: name.value.trim(),
    machine_type: machineType.value,
    title: title.value.trim(),
    description: description.value.trim()
  })
}
</script>

<template>
  <Card title="Spara som mall" subtitle="Alla bubblor sparas som en ny mall i biblioteket" @close="emit('close')">
    <form id="tpl-form" class="form" @submit.prevent="submit">
      <label>Namn *<input v-model="name" autofocus required /></label>
      <label>
        Maskintyp
        <select v-model="machineType">
          <option v-for="t in machineTypes" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label>Titel *<input v-model="title" required /></label>
      <label>Beskrivning<textarea v-model="description" rows="3" /></label>
    </form>
    <template #actions>
      <button class="btn ghost" type="button" @click="emit('close')"><X :size="16" /> Avbryt</button>
      <button class="btn primary" type="submit" form="tpl-form" :disabled="!valid"><Save :size="16" /> Spara</button>
    </template>
  </Card>
</template>
