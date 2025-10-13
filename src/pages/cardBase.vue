<!--
  cardBase.vue
  Runs in the RENDERER process (Vue/Quasar). Talks to Electron MAIN via preload (window.ankify.*).

  Responsibilities:
    • Provide a textarea for Japanese input
    • Tokenize text (via MAIN → kuromoji) and let user select "content words"
    • Lookup selected tokens on Jisho (via MAIN → dict:lookup IPC)
    • Present results and allow adding to Anki (via MAIN → ankiconnect:invoke IPC)

  Where logs appear:
    • console.log HERE = DevTools console of the BrowserWindow (renderer)
    • console.warn HERE = same
    • Anything prefixed [main] in your terminal = Electron MAIN logs

  Glossary:
    • kuromoji tokens: array of token objects for Japanese morphs.
      Important fields used here:
        - surface_form   : original surface string as it appeared in text (e.g., "食べる")
        - basic_form     : dictionary/base form (e.g., "食べる"); '*' if not provided
        - pos            : part-of-speech in Japanese ("名詞","動詞","形容詞", etc.)
        - reading, pronunciation, pos_detail_1..3 (not used here but available)

    • Jisho JSON (https://jisho.org/api/v1/search/words):
      Top-level shape from dict:lookup:
        {
          ok: true,
          data: {
            "data": [
              {
                "japanese": [{ "word": "食べる", "reading": "たべる" }, ...],
                "senses": [
                  { "english_definitions": ["to eat", "to consume"], ... },
                  ...
                ],
                ...
              },
              ...
            ]
          }
        }
      We normalize each entry into a simple structure for display & note creation:
        {
          headword: "食べる【たべる】",
          word: "食べる",
          reading: "たべる",
          gloss: "to eat",           // first sense
          senses: ["to eat", ...],   // all glosses (flat list of strings)
          raw: <original Jisho entry>
        }

  Patterns to notice:
    • We use Set for token selections (fast add/remove/has), but Vue reactivity
      doesn't track Set mutations → we re-assign a *new* Set(set) to trigger updates.

    • Promise.all([...]) returns an array-of-arrays (per-token result lists).
      We then call .flat() to collapse one level: [[a,b],[c]] → [a,b,c].
      .flat() with no args = depth 1 by default.

    • We dedupe final results by a computed "key" (headword) using a Set to avoid duplicate cards.
-->
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
      </q-input>
        <!-- Token actions row -->
        <div class="row items-center q-gutter-sm q-mt-sm">
          <q-btn flat dense icon="splitscreen" label="Analyze" @click="analyze" :loading="analyzing" />
          <q-btn flat dense icon="select_all" label="All" @click="selectAllTokens" />
          <q-btn flat dense icon="close" label="None" @click="selectNoTokens" />
          <q-space />
          <q-btn color="primary" dense label="Lookup selected" @click="lookupSelected" :disable="!selectedTokens.size" />
        </div>

        <!-- Token chip list -->
        <div v-if="uniqueTokens.length" class="row q-gutter-xs q-mt-xs">
          <q-chip
            v-for="t in uniqueTokens"
            :key="t"
            clickable
            :color="selectedTokens.has(t) ? 'primary' : void 0"
            :text-color="selectedTokens.has(t) ? 'white' : void 0"
            @click="toggleSelect(t)"
          >
            {{ t }}
          </q-chip>
        </div>
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
        />
      </div>
    </div>
  </q-page>
</template>

<script setup>
  import { ref, onMounted } from 'vue';
  import ResultList from 'src/components/ResultList.vue';

  onMounted(() => {
    try {
      console.log('ankify bridge keys:', Object.keys(window.ankify || {}))
    } catch (e) {
      console.warn('ankify bridge not available yet:', e)
    }
  });

  const text = ref('');
  const dense = ref(true);

  // reactive state for the list UI
  const results = ref([])  ;     // array of normalized items
  const loading = ref(false);
  const errorMsg = ref('');

  // tokenization state
  const tokens = ref([]);                 
  const uniqueTokens = ref([]);           // deduped surface/basic forms
  const selectedTokens = ref(new Set());  // UI selection set
  const analyzing = ref(false);

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

  // Analyze using Electron-side kuromoji
  async function analyze() {
    const q = text.value || '';
    if (!q.trim()) {
      tokens.value = [];
      uniqueTokens.value = [];
      selectedTokens.value = new Set();
      return;
    }
    analyzing.value = true;
    try {
      // Call into main via preload → returns kuromoji tokens
      // IMPORTANT: pass a string, not a ref
      const tks = await window.ankify.tokenize(q);
      tokens.value = tks;

      // Keep only content words and de-duplicate by base/surface form
      // Because each kuromoji token t has a string pos. The array ['名詞','動詞','形容詞'] is our allow-list;
      // .includes(t.pos) returns true only when the token’s POS is one of those three.
      const surfaced = tks
        .filter(t => ['名詞', '動詞', '形容詞'].includes(t.pos))
        .map(t => (t.basic_form && t.basic_form !== '*') ? t.basic_form : t.surface_form);

      const uniq = Array.from(new Set(surfaced)).filter(Boolean);
      uniqueTokens.value = uniq;
      selectedTokens.value = new Set(uniq);
    } catch (e) {
      errorMsg.value = `Tokenization failed: ${String(e)}`;
    } finally {
      analyzing.value = false;
    }
  }

  function toggleSelect(term) {
    const set = selectedTokens.value
    if (set.has(term)) set.delete(term)
    else set.add(term)
    // Force reactivity for Set in Vue
    selectedTokens.value = new Set(set)
  }

  function selectAllTokens() {
    selectedTokens.value = new Set(uniqueTokens.value)
  }
  function selectNoTokens() {
    selectedTokens.value = new Set()
  }


  async function lookupSelected() {
    const picks = Array.from(selectedTokens.value)
    if (!picks.length) {
      errorMsg.value = 'No tokens selected.'
      return
    }

    loading.value = true
    errorMsg.value = ''
    results.value = []
    try {
      const all = await Promise.all(
        picks.map(async term => {
          const res = await window.ankify?.dictLookup?.(term)
          if (!res?.ok) return []
          const data = res.data?.data ?? []
          return data.map(normalizeItem)
        })
      )
      // flatten + remove duplicate headwords
      // After Promise.all, we have an array of arrays (one array of normalized results per token). 
      // .flat() collapses one level of nesting so we can treat all results as a single list, making de-duplication straightforward.
      const flat = all.flat()
      const seen = new Set()
      results.value = flat.filter(it => {
        const key = it.headword
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (!results.value.length) errorMsg.value = 'No results for selected tokens.'
    } catch (e) {
      errorMsg.value = `Lookup failed: ${String(e)}`
    } finally {
      loading.value = false
    }
  }

  // ----------------------------------------------------------------------------
  // onAddNote: Build an Anki note payload and POST to AnkiConnect (via MAIN bridge).
  // ----------------------------------------------------------------------------
  async function onAddNote(item) {
    try {
      const modelName = 'Basic (and reversed card)'; // Deck model; adjust to taste
      const deckName = 'Ankify';

      const note = noteFromResult(item, { modelName, deckName });
      // ipcMain.handle('ankiconnect:invoke') expects: action + params
      // Here action = 'addNote', params = { note }
      const id = await window.ankify.invokeAnki('addNote', { note });
      console.log('addNote id:', id)
    } catch (e) {
      console.error('Add note failed', e)
    }
  }
  // noteFromResult: Translate our normalized Jisho item → AnkiConnect note JSON.
  //
  // AnkiConnect addNote schema (simplified):
  // {
  //   "action": "addNote",
  //   "version": 6,
  //   "params": {
  //     "note": {
  //       "deckName": "Ankify",
  //       "modelName": "Basic (and reversed card)",
  //       "fields": { "Front": "...", "Back": "..." },
  //       "tags": ["ankify"],
  //       "options": { allowDuplicate: false, ... }
  //     }
  //   }
  // }
  function noteFromResult(item, { modelName, deckName }) {
    const headword = String(item?.headword ?? '').trim()
    const senses = Array.isArray(item?.selectedSenses) && item.selectedSenses.length
      ? item.selectedSenses
      : (Array.isArray(item?.senses) ? item.senses : []);
    // Format senses as numbered lines for the "Back" field.
    const back = senses.length ? senses.map((g, i) => `${i + 1}. ${g}`).join('\n') : '(no gloss)'

    if (!headword) throw new Error('Front is empty')

    return {
      deckName,
      modelName,
      fields: { Front: headword, Back: back },
      tags: ['ankify', 'picked'],
      options: {
        allowDuplicate: false,
        duplicateScope: 'deck',
        duplicateScopeOptions: { deckName, checkChildren: false, checkAllModels: false }
      }
    }
  }

  function onCopy(item) {
    navigator.clipboard?.writeText(`${item.headword} — ${item.gloss}`)
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
</script>

<style>
  .page-background {
    background-color: white;
  }
</style>