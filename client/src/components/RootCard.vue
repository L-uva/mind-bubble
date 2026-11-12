<script setup>
import { computed, ref } from 'vue'
import { X, Pencil, Save } from 'lucide-vue-next'
import Card from './Card.vue'
import Checklist from './Checklist.vue'

const props = defineProps({ doc: Object, percent: Number })
const emit = defineEmits(['close', 'reopen', 'edit'])

const editing = ref(false)
const draft = ref({})
const valid = computed(() => draft.value.title?.trim())

function startEdit() {
  draft.value = { title: props.doc.project.title, description: props.doc.project.description ?? '' }
  editing.value = true
}

function submit() {
  if (!valid.value) return
  emit('edit', { title: draft.value.title.trim(), description: draft.value.description.trim() })
  editing.value = false
}
</script>

<template>
  <Card width="460px" :title="doc.project.title" :subtitle="`${doc.machine.type} · ${doc.machine.number}`" @close="emit('close')">
    <template #tools>
      <button v-if="!editing" class="icon-btn" title="Redigera" @click="startEdit"><Pencil :size="16" /></button>
    </template>
    <form v-if="editing" id="root-edit" class="form" @submit.prevent="submit">
      <label>Titel *<input v-model="draft.title" required autofocus /></label>
      <label>Beskrivning<textarea v-model="draft.description" rows="3" /></label>
    </form>
    <template v-else>
      <div class="root-head">
        <div class="pct">{{ percent }} %</div>
        <div class="bar"><span :style="{ width: percent + '%' }" /></div>
      </div>
      <p v-if="doc.project.description" class="desc">{{ doc.project.description }}</p>
      <Checklist :items="doc.steps" @reopen="emit('reopen', $event)" />
    </template>
    <template v-if="editing" #actions>
      <button class="btn ghost" type="button" @click="editing = false"><X :size="16" /> Avbryt</button>
      <button class="btn primary" type="submit" form="root-edit" :disabled="!valid"><Save :size="16" /> Spara</button>
    </template>
  </Card>
</template>
