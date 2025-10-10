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
          <q-btn dense round flat icon="add" @click="$emit('add-note', it)" :title="'Add to Anki'"/>
          <q-btn dense round flat icon="content_copy" @click="$emit('copy', it)" :title="'Copy'"/>
          <q-btn dense round flat icon="visibility" @click="$emit('preview', it)" :title="'Preview'"/>
        </div>
      </div>

      <q-expansion-item
        dense
        expand-separator
        label="All senses"
        class="q-mt-xs"
      >
        <ol class="q-ml-md q-mt-xs">
          <li v-for="(s, i) in it.senses" :key="i">{{ s }}</li>
        </ol>
      </q-expansion-item>
    </q-card>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    default: () => []
  }
})

defineEmits(['add-note', 'copy', 'preview'])
</script>