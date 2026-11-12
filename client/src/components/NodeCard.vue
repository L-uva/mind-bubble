<script setup>
import { computed, ref } from 'vue'
import { X, Pencil, Save, Trash2, Link2 } from 'lucide-vue-next'
import Card from './Card.vue'
import Checklist from './Checklist.vue'
import { HUES, count, pendingBelow, valueText } from '../tree.js'

const props = defineProps({
  node: Object,
  path: Array,
  hue: { type: Number, default: null },
  ix: Map,
  shared: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'reopen', 'edit', 'remove', 'color', 'unlink'])

const remaining = computed(() => pendingBelow(props.node, props.ix))
const subCount = computed(() => count(props.node.sub_steps).total)
const confirming = ref(false)
const value = computed(() => valueText(props.node))

const editing = ref(false)
const draft = ref({})
const valid = computed(() => draft.value.title?.trim())

function startEdit() {
  draft.value = {
    title: props.node.title,
    subtitle: props.node.subtitle ?? '',
    description: props.node.description ?? '',
    value: props.node.value ?? '',
    unit: props.node.unit ?? ''
  }
  editing.value = true
}

function submit() {
  if (!valid.value) return
  const v = String(draft.value.value).trim()
  emit('edit', {
    title: draft.value.title.trim(),
    subtitle: draft.value.subtitle.trim() || undefined,
    description: draft.value.description.trim(),
    value: v === '' ? undefined : isNaN(Number(v)) ? v : Number(v),
    unit: draft.value.unit.trim() || undefined
  })
  editing.value = false
}
</script>

<template>
  <Card :title="node.title" :subtitle="path.join(' › ')" @close="emit('close')">
    <template #tools>
      <template v-if="!editing && !confirming">
        <button class="icon-btn" title="Redigera" @click="startEdit"><Pencil :size="16" /></button>
        <button class="icon-btn danger" title="Ta bort" @click="confirming = true"><Trash2 :size="16" /></button>
      </template>
    </template>

    <div v-if="confirming" class="confirm">
      <Trash2 :size="28" />
      <p>
        Ta bort <strong>{{ node.title }}</strong
        >?
      </p>
      <p v-if="subCount" class="warn">
        {{ subCount }} delsteg under bubblan tas också bort permanent.
      </p>
      <p v-if="shared.length" class="warn">
        Bubblan delas med {{ shared.length }} andra grenar. Länkarna tas också bort.
      </p>
      <p class="muted">Detta kan inte ångras.</p>
    </div>
    <form v-else-if="editing" id="node-edit" class="form" @submit.prevent="submit">
      <label>Uppgift *<input v-model="draft.title" required autofocus /></label>
      <label>Underrubrik<input v-model="draft.subtitle" /></label>
      <label>Beskrivning<textarea v-model="draft.description" rows="3" /></label>
      <div class="row">
        <label>Värde<input v-model="draft.value" /></label>
        <label>Enhet<input v-model="draft.unit" /></label>
      </div>
      <div v-if="hue !== null" class="colors">
        <span class="muted">Färg (delsteg får samma färg)</span>
        <div class="swatches">
          <button
            v-for="h in HUES"
            :key="h"
            type="button"
            class="swatch"
            :class="{ on: h === hue }"
            :style="{ '--h': h }"
            :title="`Färg ${h}`"
            @click="emit('color', h)"
          />
        </div>
        <input
          class="hue-slider"
          type="range"
          min="0"
          max="360"
          :value="hue"
          @input="emit('color', Number($event.target.value))"
        />
      </div>
    </form>
    <template v-else>
      <p v-if="node.subtitle" class="sub-label">{{ node.subtitle }}</p>
      <p v-if="node.description" class="desc">{{ node.description }}</p>
      <dl v-if="value" class="meta">
        <dt>Värde</dt>
        <dd>{{ value }}</dd>
      </dl>
      <ul v-if="shared.length" class="shared-list">
        <li v-for="s in shared" :key="s.refId">
          <Link2 :size="14" /> Delas även under <strong>{{ s.parentTitle }}</strong>
          <button class="icon-btn" title="Ta bort länken" @click="emit('unlink', s.refId)"><X :size="14" /></button>
        </li>
      </ul>
      <template v-if="node.sub_steps?.length">
        <p class="group-label">Deluppgifter<template v-if="remaining"> · {{ remaining }} kvar att poppa</template></p>
        <Checklist :items="node.sub_steps" @reopen="emit('reopen', $event)" />
      </template>
    </template>

    <template v-if="confirming || editing" #actions>
      <template v-if="confirming">
        <button class="btn ghost" @click="confirming = false"><X :size="16" /> Avbryt</button>
        <button class="btn danger" @click="emit('remove')"><Trash2 :size="16" /> Ta bort</button>
      </template>
      <template v-else>
        <button class="btn ghost" type="button" @click="editing = false"><X :size="16" /> Avbryt</button>
        <button class="btn primary" type="submit" form="node-edit" :disabled="!valid"><Save :size="16" /> Spara</button>
      </template>
    </template>
  </Card>
</template>
