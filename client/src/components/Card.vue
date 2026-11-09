<script setup>
defineProps({ title: String, subtitle: String, width: { type: String, default: '420px' } })
defineEmits(['close'])
</script>

<template>
  <div class="overlay" @pointerdown.self="$emit('close')">
    <div class="card" role="dialog" :style="{ width }">
      <header v-if="title">
        <div class="head-text">
          <h2>{{ title }}</h2>
          <p v-if="subtitle" class="muted">{{ subtitle }}</p>
        </div>
        <slot name="tools" />
      </header>
      <div class="card-body"><slot /></div>
      <footer v-if="$slots.actions"><slot name="actions" /></footer>
    </div>
  </div>
</template>
