<!-- src/components/ResultList.vue -->
<template>
  <div class="column q-gutter-sm">
    <q-card
      v-for="(it, idx) in items"
      :key="idx"
      flat
      bordered
      class="q-pa-sm"
    >
      <div class="row items-center justify-between">
        <div class="col">
          <div class="text-subtitle1">{{ it.headword }}</div>
          <div class="text-caption text-grey-7">{{ it.gloss }}</div>
        </div>
        <div class="col-auto">
          <q-btn dense round flat icon="add"
            :disable="(selected[idx] || []).length === 0"
            :title="'Add to Anki (only selected senses)'"
            @click="emitAdd(idx, it)" />
          <q-btn dense round flat icon="content_copy" @click="$emit('copy', it)" :title="'Copy'"/>
          <!-- <q-btn dense round flat icon="visibility" @click="$emit('preview', it)" :title="'Preview'"/> -->
        </div>
      </div>
      <q-chip
        dense
        outline
        :label="`${selected[idx].length}/${it.senses.length}`"
        title="Selected senses"
      />
      <q-expansion-item
        dense
        expand-separator
        label="Select senses"
        header-class="q-py-xs"
        class="q-mt-xs"
      >
        <div class="row items-center q-gutter-xs q-mb-xs">
          <q-btn size="sm" flat icon="select_all" label="All"
                 @click="selectAll(idx, it)" />
          <q-btn size="sm" flat icon="close" label="None"
                 @click="selectNone(idx)" />
          <q-space />
          <div class="text-caption text-grey-7">
            {{ selected[idx].length }} of {{ it.senses.length }} selected
          </div>
        </div>

        <!-- Checkbox list -->
        <div class="column q-gutter-xs">
          <q-checkbox
            v-for="(s, i) in it.senses"
            :key="i"
            dense
            :label="s"
            :model-value="selected[idx].includes(i)"
            @update:model-value="(val) => toggle(idx, i, val)"
          />
        </div>
      </q-expansion-item>
    </q-card>
  </div>
</template>

<script setup>
  import { reactive, watch } from 'vue'
  const props = defineProps({
    items: {
      type: Array,
      default: () => []
    }
  })

  const emit = defineEmits(['add-note', 'copy', 'preview'])
  // selected[idx] = array of selected sense indices for items[idx]
  // We track indices (stable) and map to strings on emit.

  const selected = reactive([])

  // keep selection array in sync with items length 
  watch(
    () => props.items,
    (list) => {
      // initialize each card with all senses selected by default
      selected.length = 0
      list.forEach((it, idx) => {
        const all = Array.from({ length: it.senses?.length || 0 }, (_, i) => i)
        selected[idx] = all
      })
    },
    { immediate: true, deep: false }
  )

  function toggle(cardIdx, senseIdx, isOn) {
    const arr = selected[cardIdx]
    if (!arr) return
    const pos = arr.indexOf(senseIdx)
    if (isOn && pos === -1) arr.push(senseIdx)
    if (!isOn && pos !== -1) arr.splice(pos, 1)
  }

  function selectAll(cardIdx, it) {
    selected[cardIdx] = Array.from({ length: it.senses?.length || 0 }, (_, i) => i)
  }

  function selectNone(cardIdx) {
    selected[cardIdx] = []
  }

  // Emit the item with selected senses only 
  function emitAdd(idx, it) {
    const picked = (selected[idx] || [])
      .sort((a, b) => a - b)
      .map(i => it.senses[i])

    const payload = {
      ...it,
      // add an explicit selectedSenses array for the parent
      selectedSenses: picked
    }
    emit('add-note', payload)
  }
</script>