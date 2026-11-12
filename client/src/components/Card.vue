<script setup>
import { X } from 'lucide-vue-next'

defineProps({ title: String, subtitle: String, width: { type: String, default: '420px' } })
defineEmits(['close'])
</script>

<template>
  <div class="overlay" @pointerdown.self="$emit('close')">
    <div class="card" role="dialog" :style="{ width }">
      <header>
        <div class="head-text">
          <h2 v-if="title">{{ title }}</h2>
          <p v-if="subtitle" class="muted">{{ subtitle }}</p>
        </div>
        <div class="head-tools">
          <slot name="tools" />
          <button class="icon-btn" type="button" title="Stäng" @click="$emit('close')"><X :size="16" /></button>
        </div>
      </header>
      <div class="card-body"><slot /></div>
      <footer v-if="$slots.actions"><slot name="actions" /></footer>
    </div>
  </div>
</template>
