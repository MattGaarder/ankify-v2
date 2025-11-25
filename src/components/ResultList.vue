<!-- src/components/ResultList.vue -->
<template>
  <div class="column q-gutter-sm">
    <!-- Primary Results -->
    <q-card v-for="(it, idx) in primaryItems" :key="`primary-${idx}`" flat bordered class="q-pa-sm">
      <div class="row items-start justify-between q-mb-sm">
        <div class="col q-pr-sm">
          <div class="text-subtitle1 text-weight-medium">{{ getSelectedHeadword(idx, it) }}</div>
          <div class="text-caption text-grey-7">{{ getSelectedGloss(idx, it) }}</div>
        </div>
        <div class="col-auto row q-gutter-xs items-center">
          <q-btn dense round flat icon="add" :disable="(selected[idx] || []).length === 0"
            :title="'Add to Anki (only selected senses)'" @click="emitAdd(idx, it)" />
          <q-btn dense round flat icon="content_copy" @click="$emit('copy', it)" :title="'Copy'" />
          <q-btn dense round flat icon="close" @click="$emit('remove', it)" :title="'Remove'" />
        </div>
      </div>

      <!-- Divider between card preview and selector -->
      <q-separator class="q-my-sm" />

      <!-- Selection controls -->
      <div class="row items-center q-gutter-sm q-mb-xs">
        <div class="text-caption text-grey-7">{{ selected[idx].length }}/{{ it.senses.length }}</div>
        <q-btn dense round flat size="sm" icon="check_box" @click="selectAll(idx, it)" :title="'Select all senses'" />
        <q-btn dense round flat size="sm" icon="check_box_outline_blank" @click="selectNone(idx)"
          :title="'Deselect all'" />
      </div>

      <div class="q-mt-xs">
        <!-- Checkbox list -->
        <div class="column q-gutter-xs">
          <q-checkbox v-for="(senseItem, i) in getVisibleSenses(idx, it, false)" :key="i" dense
            :model-value="selected[idx].includes(senseItem.originalIndex)"
            @update:model-value="(val) => toggle(idx, senseItem.originalIndex, val)">
            <template v-slot:default>
              <span>{{ typeof senseItem.item === 'string' ? senseItem.item : senseItem.item.text }}</span>
              <span v-if="senseItem.item.reading" class="text-grey-6"> ({{ senseItem.item.reading }})</span>
            </template>
          </q-checkbox>

          <!-- Show more/less button -->
          <q-btn v-if="getSensesList(it).length > SENSES_PREVIEW_LIMIT" flat dense size="sm"
            :label="expanded[idx] ? 'Show less' : `Show ${getSensesList(it).length - SENSES_PREVIEW_LIMIT} more...`"
            class="text-grey-7" @click="expanded[idx] = !expanded[idx]" />
        </div>
      </div>
    </q-card>

    <!-- Secondary Results (Collapsible) -->
    <q-expansion-item v-if="secondaryItems.length > 0" dense expand-separator icon="more_horiz" label="More readings"
      header-class="text-grey-7" class="q-mt-sm">
      <q-card v-for="(it, idx) in secondaryItems" :key="`secondary-${idx}`" flat bordered class="q-pa-sm q-mt-sm">
        <div class="row items-start justify-between q-mb-sm">
          <div class="col q-pr-sm">
            <div class="text-subtitle1 text-weight-medium">{{ getSelectedHeadwordSecondary(idx, it) }}</div>
            <div class="text-caption text-grey-7">{{ getSelectedGlossSecondary(idx, it) }}</div>
          </div>
          <div class="col-auto row q-gutter-xs items-center">
            <q-btn dense round flat icon="add" :disable="(secondarySelected[idx] || []).length === 0"
              :title="'Add to Anki (only selected senses)'" @click="emitAddSecondary(idx, it)" />
            <q-btn dense round flat icon="content_copy" @click="$emit('copy', it)" :title="'Copy'" />
            <q-btn dense round flat icon="close" @click="$emit('remove', it)" :title="'Remove'" />
          </div>
        </div>

        <!-- Divider between card preview and selector -->
        <q-separator class="q-my-sm" />

        <!-- Selection controls -->
        <div class="row items-center q-gutter-sm q-mb-xs">
          <div class="text-caption text-grey-7">{{ secondarySelected[idx].length }}/{{ it.senses.length }}</div>
          <q-btn dense round flat size="sm" icon="check_box" @click="selectAllSecondary(idx, it)"
            :title="'Select all senses'" />
          <q-btn dense round flat size="sm" icon="check_box_outline_blank" @click="selectNoneSecondary(idx)"
            :title="'Deselect all'" />
        </div>

        <div class="q-mt-xs">
          <!-- Checkbox list -->
          <div class="column q-gutter-xs">
            <q-checkbox v-for="(senseItem, i) in getVisibleSenses(idx, it, true)" :key="i" dense
              :model-value="secondarySelected[idx].includes(senseItem.originalIndex)"
              @update:model-value="(val) => toggleSecondary(idx, senseItem.originalIndex, val)">
              <template v-slot:default>
                <span>{{ typeof senseItem.item === 'string' ? senseItem.item : senseItem.item.text }}</span>
                <span v-if="senseItem.item.reading" class="text-grey-6"> ({{ senseItem.item.reading }})</span>
              </template>
            </q-checkbox>

            <!-- Show more/less button -->
            <q-btn v-if="getSensesList(it).length > SENSES_PREVIEW_LIMIT" flat dense size="sm"
              :label="secondaryExpanded[idx] ? 'Show less' : `Show ${getSensesList(it).length - SENSES_PREVIEW_LIMIT} more...`"
              class="text-grey-7" @click="secondaryExpanded[idx] = !secondaryExpanded[idx]" />
          </div>
        </div>
      </q-card>
    </q-expansion-item>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'
const props = defineProps({
  primaryItems: {
    type: Array,
    default: () => []
  },
  secondaryItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['add-note', 'copy', 'preview', 'remove'])
// selected[idx] = array of selected sense indices for primaryItems[idx]
// secondarySelected[idx] = array of selected sense indices for secondaryItems[idx]

const selected = reactive([])
const secondarySelected = reactive([])
const expanded = reactive([])  // track which primary cards are expanded
const secondaryExpanded = reactive([])  // track which secondary cards are expanded
const SENSES_PREVIEW_LIMIT = 5  // show first 5 senses by default

// keep selection array in sync with items length
watch(
  () => props.primaryItems,
  (list) => {
    // initialize each card with all senses selected by default
    selected.length = 0
    expanded.length = 0
    list.forEach((it, idx) => {
      const all = Array.from({ length: it.senses?.length || 0 }, (_, i) => i)
      selected[idx] = all
      expanded[idx] = false
    })
  },
  { immediate: true, deep: false }
)

watch(
  () => props.secondaryItems,
  (list) => {
    secondarySelected.length = 0
    secondaryExpanded.length = 0
    list.forEach((it, idx) => {
      const all = Array.from({ length: it.senses?.length || 0 }, (_, i) => i)
      secondarySelected[idx] = all
      secondaryExpanded[idx] = false
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

function toggleSecondary(cardIdx, senseIdx, isOn) {
  const arr = secondarySelected[cardIdx]
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

// Helper to get the senses list
function getSensesList(it) {
  return it.sensesWithReadings || it.senses.map(s => ({ text: s, reading: it.reading }))
}

// Get visible senses based on expansion state
function getVisibleSenses(idx, it, isSecondary) {
  const sensesList = getSensesList(it)
  const isExpanded = isSecondary ? secondaryExpanded[idx] : expanded[idx]

  // If expanded or list is short, show all
  if (isExpanded || sensesList.length <= SENSES_PREVIEW_LIMIT) {
    return sensesList.map((item, originalIndex) => ({ item, originalIndex }))
  }

  // Otherwise, show only first few
  return sensesList.slice(0, SENSES_PREVIEW_LIMIT).map((item, originalIndex) => ({ item, originalIndex }))
}

function selectAllSecondary(cardIdx, it) {
  secondarySelected[cardIdx] = Array.from({ length: it.senses?.length || 0 }, (_, i) => i)
}

function selectNoneSecondary(cardIdx) {
  secondarySelected[cardIdx] = []
}

// Get selected senses as a comma-separated string for gloss display
function getSelectedGloss(idx, it) {
  const selectedIndices = selected[idx] || []
  if (selectedIndices.length === 0) return '(no senses selected)'

  const sensesList = it.sensesWithReadings || it.senses.map(s => ({ text: s, reading: it.reading }))
  const selectedSenses = selectedIndices
    .sort((a, b) => a - b)
    .map(i => {
      const sense = sensesList[i]
      return typeof sense === 'string' ? sense : sense.text
    })

  return selectedSenses.join(', ')
}

function getSelectedGlossSecondary(idx, it) {
  const selectedIndices = secondarySelected[idx] || []
  if (selectedIndices.length === 0) return '(no senses selected)'

  const sensesList = it.sensesWithReadings || it.senses.map(s => ({ text: s, reading: it.reading }))
  const selectedSenses = selectedIndices
    .sort((a, b) => a - b)
    .map(i => {
      const sense = sensesList[i]
      return typeof sense === 'string' ? sense : sense.text
    })

  return selectedSenses.join(', ')
}

// Get headword with only selected readings
function getSelectedHeadword(idx, it) {
  const selectedIndices = selected[idx] || []
  if (selectedIndices.length === 0) return it.word || it.headword

  const sensesList = it.sensesWithReadings || it.senses.map(s => ({ text: s, reading: it.reading }))

  // Collect unique readings from selected senses
  const activeReadings = new Set()
  selectedIndices.forEach(i => {
    const sense = sensesList[i]
    const reading = (typeof sense === 'string') ? it.reading : sense.reading
    if (reading) activeReadings.add(reading)
  })

  const readingsArray = Array.from(activeReadings)
  if (readingsArray.length === 0) return it.word || it.headword

  return `${it.word}【${readingsArray.join('、')}】`
}

function getSelectedHeadwordSecondary(idx, it) {
  const selectedIndices = secondarySelected[idx] || []
  if (selectedIndices.length === 0) return it.word || it.headword

  const sensesList = it.sensesWithReadings || it.senses.map(s => ({ text: s, reading: it.reading }))

  // Collect unique readings from selected senses
  const activeReadings = new Set()
  selectedIndices.forEach(i => {
    const sense = sensesList[i]
    const reading = (typeof sense === 'string') ? it.reading : sense.reading
    if (reading) activeReadings.add(reading)
  })

  const readingsArray = Array.from(activeReadings)
  if (readingsArray.length === 0) return it.word || it.headword

  return `${it.word}【${readingsArray.join('、')}】`
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

function emitAddSecondary(idx, it) {
  const picked = (secondarySelected[idx] || [])
    .sort((a, b) => a - b)
    .map(i => it.senses[i])

  const payload = {
    ...it,
    selectedSenses: picked
  }
  emit('add-note', payload)
}


</script>
