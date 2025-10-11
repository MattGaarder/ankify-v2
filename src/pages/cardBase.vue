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
      <!-- <div v-if="resultText" class="q-mt-md">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-xs">Result</div>
            <div style="white-space: pre-wrap">{{ resultText }}</div>
          </q-card-section>
        </q-card>
      </div> -->
      <div class="q-mt-md">
        <q-linear-progress v-if="loading" indeterminate />

        <q-banner v-if="errorMsg" class="q-mt-sm" dense rounded>
          {{ errorMsg }}
        </q-banner>

        <ResultList
          v-if="!loading && results.length"
          :items="results"
          @add-note="onAddNote"
          @copy="onCopy"
          @preview="onPreview"
        />
      </div>
    </div>
  </q-page>
</template>





<script setup>
  console.log('ankify bridge keys:', Object.keys(window.ankify || {}));

  import { ref } from 'vue';
  import ResultList from 'src/components/ResultList.vue';

  const text = ref('');
  const dense = ref(true);


  // NEW reactive state for the list UI
  const results = ref([])  ;     // array of normalized items
  const loading = ref(false);
  const errorMsg = ref('');

  const hidePopover = async () => { 
    await window.ankify?.hidePopover?.()
  }
  // const closePopover = async () => {
  //   await window.ankify?.closePopover?.()
  // }

  function normalizeItem(item) {
    const jp = item.japanese?.[0] || {}
    const word = jp.word || ''
    const reading = jp.reading || ''
    const headword = (word && reading) ? `${word}【${reading}】` : (word || reading || '(no word)')
    const senses = (item.senses || [])
      .map(s => (s.english_definitions || []).join(', '))
      .filter(Boolean)

    return {
      headword,   // e.g., 食べる【たべる】
      word,       // 食べる
      reading,    // たべる
      gloss: senses[0] || '(no gloss)',
      senses,     // list of glosses
      raw: item   // keep original if you need more fields later
    }
  }

  const lookup = async () => {
    const q = text.value?.trim()
    if (!q) return

    loading.value = true
    errorMsg.value = ''
    results.value = []

    try {
      const res = await window.ankify?.dictLookup?.(q);
      window.ankify?.log?.('Lookup result:', res);
      console.log(res);
      if (!res?.ok) {
        errorMsg.value = res?.error || 'Unknown error'
        return
      }

      const data = res.data?.data ?? [];
      // ✅ actually use normalizeItem here
      results.value = data.map(normalizeItem);

      if (!results.value.length) errorMsg.value = 'No results.'
    } catch (e) {
      errorMsg.value = `Lookup failed: ${String(e)}`
    } finally {
      loading.value = false
    }
  }

  async function onAddNote() {
    console.log('[onAddNote] start'); 
    try {
      const decks = await window.ankify.invokeAnki('deckNames', {});
      console.log('Decks:', decks);

      // What models exist?
      const models = await window.ankify.invokeAnki('modelNames', {});
      console.log('Models:', models);
      for (const m of models) {
        const f = await window.ankify.invokeAnki('modelFieldNames', { modelName: m });
        console.log(m, '→', f);
}

      // What are the exact field names for the model you plan to use?
      const modelName = 'Basic (and reversed card)'; // pick the one you plan to use
      const fields = await window.ankify.invokeAnki('modelFieldNames', { modelName });
      console.log('Fields for model:', modelName, fields);
      // Expect something like ["Front", "Back"] for the stock template
      console.log('Fields for Basic:', fields);
      // const note = noteFromResult(item); 
      const id = await window.ankify.invokeAnki('addNote', {
        note: {
          deckName: 'Ankify',
          modelName: 'Basic (and reversed card)',
          fields: {
            Front: 'テスト',
            Back: 'test',
          },
          tags: ['ankify'],
          options: { allowDuplicate: true, duplicateScope: 'deck' }
        }
      });
      console.log('addNote id:', id);
      window.ankify?.log?.('Added note', id);

      // optional Quasar notify:
      // $q.notify({ type: 'positive', message: 'Added to Anki' })
    } catch (e) {
      window.ankify?.log?.('Add note failed', String(e));
    }
  }

  function onCopy(item) {
    navigator.clipboard?.writeText(`${item.headword} — ${item.gloss}`)
  }

  function onPreview(item) {
    window.ankify?.log?.('Preview', item)
  }


  // Build the note from a normalized item
  // async function invokeAnki(action, params = {}, apiKey) {
  //   const body = { action, version: 6, params }
  //   if (apiKey) body.key = apiKey
  //   const resp = await fetch('http://127.0.0.1:8765', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(body)
  //   })
  //   console.log(resp);
  //   const data = await resp.json()
  //   console.log(data);
  //   if (data.error) throw new Error(data.error)
  //   return data.result
  // }

  // function noteFromResult(item) {
  //   const { headword, senses } = item
  //   const backLines = senses.length ? senses.map((g, i) => `${i + 1}. ${g}`) : ['(no gloss)']

  //   const note = {
  //     deckName: 'Ankify',
  //     modelName: 'Basic',
  //     fields: {
  //       Front: headword,
  //       Back: backLines.join('\n')
  //     },
  //     tags: ['ankify'],
  //     options: {
  //       allowDuplicate: false,
  //       duplicateScope: 'deck',
  //       duplicateScopeOptions: { deckName: 'Ankify', checkChildren: false, checkAllModels: false }
  //     }
  //   }
  //   return note
  // }
</script>

<style>
  .page-background {
    background-color: white;
  }
</style>