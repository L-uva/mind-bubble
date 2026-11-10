<script setup>
import { Check, Circle, Link2 } from 'lucide-vue-next'
import { inject } from 'vue'
import { isDone } from '../tree.js'

defineOptions({ name: 'Checklist' })
defineProps({ items: Array })
defineEmits(['reopen'])

const ix = inject('ix', { value: new Map() })
const real = (s) => (s.ref ? ix.value.get(s.ref) : s)
</script>

<template>
  <ul class="checklist">
    <template v-for="c in items" :key="c.id">
      <li v-if="real(c)" :class="{ done: isDone(real(c)) }">
        <Check v-if="isDone(real(c))" :size="15" />
        <Circle v-else :size="15" />
        <button v-if="isDone(real(c))" class="reopen" title="Blås upp bubblan igen" @click="$emit('reopen', real(c).id)">
          {{ real(c).title }}
        </button>
        <span v-else>{{ real(c).title }}</span>
        <Link2 v-if="c.ref" :size="13" class="muted" title="Delad bubbla" />
        <Checklist v-if="!c.ref && c.sub_steps?.length" :items="c.sub_steps" @reopen="$emit('reopen', $event)" />
      </li>
    </template>
  </ul>
</template>
