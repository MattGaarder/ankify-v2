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
      <q-input outlined square v-model="text" hint="何かお手伝いできますか？" :dense="dense" type="textarea" autogrow
        input-style="resize: vertical; min-height: 60px" @mouseup="onTextSelect" @keyup="onTextSelect">
      </q-input>

      <div class="q-mt-md">
        <q-linear-progress v-if="loading" indeterminate />
        <q-banner v-if="errorMsg" class="q-mt-sm" dense rounded>
          {{ errorMsg }}
        </q-banner>
        <ResultList v-if="!loading && (primaryResults.length || secondaryResults.length)"
          :primary-items="primaryResults" :secondary-items="secondaryResults" @add-note="onAddNote" @copy="onCopy"
          @remove="onRemove" />
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
const primaryResults = ref([]);     // array of primary (relevant) items
const secondaryResults = ref([]);   // array of secondary (related) items
const loading = ref(false);
const errorMsg = ref('');
const originalSelection = ref('');  // track the original selected text

// tokenization state
const tokens = ref([]);
const activeWords = ref(new Set());  // words that have results displayed
const wordToResults = ref(new Map());  // map word -> array of result items
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
async function analyze(textToAnalyze) {
  const q = textToAnalyze || '';
  if (!q.trim()) {
    tokens.value = [];
    return [];
  }
  analyzing.value = true;
  try {
    // Call into main via preload → returns kuromoji tokens
    const tks = await window.ankify.tokenize(q);
    tokens.value = tks;

    // Keep only content words and de-duplicate by base/surface form
    const surfaced = tks
      .filter(t => ['名詞', '動詞', '形容詞'].includes(t.pos))
      .map(t => (t.basic_form && t.basic_form !== '*') ? t.basic_form : t.surface_form);

    // Add the raw selection to the front of the list
    surfaced.unshift(q);

    const uniq = Array.from(new Set(surfaced)).filter(Boolean);
    return uniq;
  } catch (e) {
    errorMsg.value = `Tokenization failed: ${String(e)}`;
    return [];
  } finally {
    analyzing.value = false;
  }
}

async function onTextSelect(event) {
  const input = event.target;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selectedText = input.value.substring(start, end);

  if (selectedText && selectedText.trim().length > 0) {
    originalSelection.value = selectedText;
    const tokensToLookup = await analyze(selectedText);
    await lookupSelected(tokensToLookup);
  }
}





async function lookupSelected(tokens) {
  if (!tokens || !tokens.length) {
    return
  }

  loading.value = true
  errorMsg.value = ''
  primaryResults.value = []
  secondaryResults.value = []
  const newWordToResults = new Map()
  const newActiveWords = new Set()

  try {
    // Lookup each token and track which words have results
    const all = await Promise.all(
      tokens.map(async term => {
        const res = await window.ankify?.dictLookup?.(term)
        if (!res?.ok) return { term, items: [] }
        const data = res.data?.data ?? []
        const items = data.map(normalizeItem)
        return { term, items }
      })
    )

    // Build word-to-results mapping and collect all results
    const allResults = []
    for (const { term, items } of all) {
      if (items.length > 0) {
        newWordToResults.set(term, items)
        newActiveWords.add(term)
        allResults.push(...items)
      }
    }

    // Deduplicate by headword
    const seen = new Set()
    const deduped = allResults.filter(it => {
      const key = it.headword
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Group by kanji (word) to merge multiple readings
    const kanjiGroups = new Map()
    for (const item of deduped) {
      const kanji = item.word
      if (!kanji) continue

      if (!kanjiGroups.has(kanji)) {
        // Create sensesWithReadings - each sense tagged with its reading
        const sensesWithReadings = item.senses.map(sense => ({
          text: sense,
          reading: item.reading
        }))

        kanjiGroups.set(kanji, {
          word: kanji,
          readings: new Set([item.reading]),
          senses: [...item.senses], // legacy format
          sensesWithReadings, // new format with reading associations
          gloss: item.gloss,
          raw: item.raw
        })
      } else {
        const group = kanjiGroups.get(kanji)
        if (item.reading) group.readings.add(item.reading)

        // Add senses with their reading associations
        for (const sense of item.senses) {
          // Check if this sense already exists
          const existing = group.sensesWithReadings.find(s => s.text === sense)
          if (!existing) {
            group.sensesWithReadings.push({
              text: sense,
              reading: item.reading
            })
            group.senses.push(sense) // also add to legacy format
          }
        }
      }
    }

    // Convert grouped results back to normalized format
    const grouped = Array.from(kanjiGroups.values()).map(group => {
      const readingsArray = Array.from(group.readings)
      return {
        word: group.word,
        reading: readingsArray[0], // primary reading
        readings: readingsArray, // all readings
        sensesWithReadings: group.sensesWithReadings, // NEW: senses with reading tags
        headword: readingsArray.length > 1
          ? `${group.word}【${readingsArray.join('、')}】`
          : `${group.word}【${readingsArray[0]}】`,
        gloss: group.gloss,
        senses: group.senses,
        raw: group.raw
      }
    })

    // Split into primary (substring of selection) and secondary (related)
    const original = originalSelection.value
    const primary = []
    const secondary = []

    for (const item of grouped) {
      // Check if the word appears in the original selection
      if (item.word && original.includes(item.word)) {
        primary.push(item)
      } else {
        secondary.push(item)
      }
    }

    primaryResults.value = primary
    secondaryResults.value = secondary
    wordToResults.value = newWordToResults
    activeWords.value = newActiveWords

    if (!primary.length && !secondary.length) {
      errorMsg.value = 'No results for selected tokens.'
    }
  } catch (e) {
    errorMsg.value = `Lookup failed: ${String(e)}`
  } finally {
    loading.value = false
  }
}

// Remove a result item and filter it from the display
function onRemove(item) {
  // Get the word associated with this item
  const word = item.word
  if (!word) return

  // Remove from active words
  const newActiveWords = new Set(activeWords.value)
  newActiveWords.delete(word)
  activeWords.value = newActiveWords

  // Get the results associated with this word
  const wordResults = wordToResults.value.get(word) || []

  // Create a set of headwords to remove
  const headwordsToRemove = new Set(wordResults.map(result => result.headword))

  // Filter results
  primaryResults.value = primaryResults.value.filter(result => !headwordsToRemove.has(result.headword))
  secondaryResults.value = secondaryResults.value.filter(result => !headwordsToRemove.has(result.headword))

  // Remove from word-to-results map
  const newWordToResults = new Map(wordToResults.value)
  newWordToResults.delete(word)
  wordToResults.value = newWordToResults
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
  const word = String(item?.word ?? '').trim()
  const reading = String(item?.reading ?? '').trim()
  const sensesWithReadings = item?.sensesWithReadings || []

  // Get selected senses (either from selectedSenses or all senses)
  const selectedSenses = Array.isArray(item?.selectedSenses) && item.selectedSenses.length
    ? item.selectedSenses
    : (Array.isArray(item?.senses) ? item.senses : []);

  // Determine which readings to include based on selected senses
  let activeReadings = new Set()

  if (sensesWithReadings.length > 0) {
    // For each selected sense, find its reading
    for (const selectedSense of selectedSenses) {
      const senseObj = sensesWithReadings.find(s => s.text === selectedSense)
      if (senseObj && senseObj.reading) {
        activeReadings.add(senseObj.reading)
      }
    }
  } else {
    // Fallback: if no sensesWithReadings, use all readings or the single reading
    const allReadings = Array.isArray(item?.readings) ? item.readings : [reading]
    activeReadings = new Set(allReadings.filter(Boolean))
  }

  // Format front: kanji on one line, only selected readings on the next
  let front
  const readingsArray = Array.from(activeReadings).filter(Boolean)

  if (word && readingsArray.length > 0) {
    const readingsText = readingsArray.join('、')
    front = `${word}<br>${readingsText}`
  } else if (word) {
    front = word
  } else if (reading) {
    front = reading
  } else {
    front = headword // fallback to original format
  }

  // Format senses as numbered lines for the "Back" field (each on new line with HTML br tags)
  const back = selectedSenses.length
    ? selectedSenses.map((g, i) => `${i + 1}. ${g}`).join('<br>')
    : '(no gloss)'

  if (!front) throw new Error('Front is empty')

  return {
    deckName,
    modelName,
    fields: { Front: front, Back: back },
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
