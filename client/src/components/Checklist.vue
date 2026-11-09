<script setup>
import { Check, Circle } from 'lucide-vue-next'
import { isDone } from '../tree.js'

defineOptions({ name: 'Checklist' })
defineProps({ items: Array })
defineEmits(['reopen'])
</script>

<template>
  <ul class="checklist">
    <li v-for="s in items" :key="s.id" :class="{ done: isDone(s) }">
      <Check v-if="isDone(s)" :size="15" />
      <Circle v-else :size="15" />
      <button v-if="isDone(s)" class="reopen" title="Blås upp bubblan igen" @click="$emit('reopen', s.id)">
        {{ s.title }}
      </button>
      <span v-else>{{ s.title }}</span>
      <Checklist v-if="s.sub_steps?.length" :items="s.sub_steps" @reopen="$emit('reopen', $event)" />
    </li>
  </ul>
</template>
