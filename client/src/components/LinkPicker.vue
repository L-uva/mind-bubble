<script setup>
import { ref, computed } from 'vue'
import { Link2, X } from 'lucide-vue-next'
import Card from './Card.vue'

const props = defineProps({ where: String, candidates: Array })
const emit = defineEmits(['close', 'pick'])

const q = ref('')
const shown = computed(() => {
  const t = q.value.trim().toLowerCase()
  return props.candidates.filter((c) => !t || c.title.toLowerCase().includes(t) || c.path.toLowerCase().includes(t))
})
</script>

<template>
  <Card title="Länka befintlig bubbla" :subtitle="where" @close="emit('close')">
    <input v-model="q" class="picker-search" placeholder="Sök…" autofocus />
    <ul class="picker-list">
      <li v-for="c in shown" :key="c.id">
        <button type="button" @click="emit('pick', c.id)">
          <Link2 :size="14" />
          <span class="pt">{{ c.title }}</span>
          <span class="muted pp">{{ c.path }}</span>
        </button>
      </li>
      <li v-if="!shown.length" class="muted">Inga bubblor att länka.</li>
    </ul>
    <template #actions>
      <button class="btn ghost" type="button" @click="emit('close')"><X :size="16" /> Avbryt</button>
    </template>
  </Card>
</template>
