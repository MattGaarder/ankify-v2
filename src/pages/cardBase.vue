<template>
  <q-page class="page-background">
    <div class="q-pa-md q-gutter-sm">
      <q-input
        outlined
        square
        v-model="text"
        hint="何かお手伝いできますか？"
        :dense="dense"
        type="textarea"
      >
        <template #append>
          <q-icon name="close" @click="text = ''" class="cursor-pointer" />
        </template>
        <template #prepend>
          <q-btn round dense flat icon="menu" />
        </template>
      </q-input>
      <div class="row items-center justify-between q-mt-sm">
        <div class="col">
          <q-btn flat round icon="search"  @click="lookup" />
        </div>
        <div class="col-auto">
          <q-btn flat round icon="visibility_off" @click="hidePopover" />
          <q-btn flat round icon="close" @click="hidePopover" />
        </div>
      </div>
      <div v-if="resultText" class="q-mt-md">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-xs">Result</div>
            <div style="white-space: pre-wrap">{{ resultText }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
  import { ref } from 'vue'

  const text = ref('')
  const dense = ref(true)
  const resultText = ref('')

  const hidePopover = async () => { 
    await window.ankify?.hidePopover?.()
  }
  // const closePopover = async () => {
  //   await window.ankify?.closePopover?.()
  // }

  const lookup = async () => {
    const q = text.value?.trim()
    if (!q) return
    try {

      const res = await window.ankify?.dictLookup?.(q)
      if (!res?.ok) {
        resultText.value = `Error: ${res?.error || 'unknown'}`
        return
      }
      const lines = []
      for (const item of res.data?.data ?? []) {
        const jp = item.japanese?.[0]
        const word = jp?.word || jp?.reading || '(no word)'
        const senses = item.senses?.map(s => s.english_definitions?.join(', ')).filter(Boolean) ?? []
        lines.push(`${word} — ${senses[0] || '(no gloss)'}`)
      }
      resultText.value = lines.length ? lines.join('\n') : 'No results.'
    } catch (e) {
      resultText.value = `Lookup failed: ${String(e)}`
    }
  }
</script>

<style>
  .page-background {
    background-color: white;
  }
</style>