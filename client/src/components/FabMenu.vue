<script setup>
import { ref } from 'vue'
import { Menu, X, Plus, BookmarkPlus, Library } from 'lucide-vue-next'

defineProps({ disabled: Boolean })
const emit = defineEmits(['add-step', 'save-template', 'library'])
const open = ref(false)

function pick(name) {
  open.value = false
  emit(name)
}
</script>

<template>
  <div class="fab-wrap">
    <Transition name="menu">
      <div v-if="open" class="fab-menu">
        <button :disabled="disabled" @click="pick('add-step')"><Plus :size="18" /> Lägg till steg <kbd>Ctrl+A</kbd></button>
        <button :disabled="disabled" @click="pick('save-template')"><BookmarkPlus :size="18" /> Spara som mall</button>
        <button @click="pick('library')"><Library :size="18" /> Bibliotek</button>
      </div>
    </Transition>
    <button class="fab" :class="{ open }" aria-label="Meny" @click="open = !open">
      <X v-if="open" :size="24" />
      <Menu v-else :size="24" />
    </button>
  </div>
</template>
