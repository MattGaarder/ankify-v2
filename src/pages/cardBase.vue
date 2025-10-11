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
        <!-- <template #prepend>
          <q-btn round dense flat icon="menu" />
        </template> -->
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
      <div class="row items-center justify-between q-mt-sm">
        <!-- <div class="col">
          <q-btn flat round icon="search"  @click="lookup" />
        </div> -->
        <!-- <div class="col-auto">
          <q-btn flat round icon="visibility_off" @click="hidePopover" />
          <q-btn flat round icon="close" @click="hidePopover" />
        </div> -->
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

        />
      </div>
    </div>
  </q-page>
</template>



<script setup>
  import { ref, onMounted } from 'vue';
  import ResultList from 'src/components/ResultList.vue';


  // const DIC_PATH = (import.meta.env.BASE_URL || '/') + 'kuromoji/dict/';

  // // Initialize kuromoji tokenizer composable with dynamic path
  // const { tokenize } = useKuromoji(DIC_PATH);

  onMounted(() => {
    try {
      console.log('ankify bridge keys:', Object.keys(window.ankify || {}))
    } catch (e) {
      console.warn('ankify bridge not available yet:', e)
    }
  });

  // onMounted(async () => {
  //   const base = (import.meta.env.BASE_URL || '/') + 'kuromoji/dict/';
  //   const files = [
  //     'base.dat.gz',
  //     'cc.dat.gz',
  //     'check.dat.gz',
  //     'tid_map.dat.gz',
  //     'tid_pos.dat.gz',
  //     'tid.dat.gz',
  //     'unk_char.dat.gz',
  //     'unk_compat.dat.gz',
  //     'unk_invoke.dat.gz',
  //     'unk_map.dat.gz',
  //     'unk_pos.dat.gz',
  //     'unk.dat.gz',
  //   ];

  //   for (const f of files) {
  //     const url = base + f;
  //     try {
  //       const resp = await fetch(url);
  //       const enc = resp.headers.get('content-encoding');
  //       const ctyp = resp.headers.get('content-type');
  //       const ok = resp.ok;
  //       let sig = null;

  //       if (ok) {
  //         const buf = await resp.arrayBuffer();
  //         const v = new Uint8Array(buf.slice(0, 4));
  //         sig = Array.from(v).join(',');
  //       }

  //       console.log('[probe]', f, {
  //         url, ok, status: resp.status, 'content-type': ctyp, 'content-encoding': enc, sig
  //       });
  //     } catch (e) {
  //       console.warn('[probe] failed', f, e);
  //     }
  //   }
  // });

  const text = ref('');
  const dense = ref(true);


  // NEW reactive state for the list UI
  const results = ref([])  ;     // array of normalized items
  const loading = ref(false);
  const errorMsg = ref('');

  // tokenization state
  const tokens = ref([]);                 
  const uniqueTokens = ref([]);           // deduped surface/basic forms
  const selectedTokens = ref(new Set());  // UI selection set
  const analyzing = ref(false);


  // const hidePopover = async () => { 
  //   await window.ankify?.hidePopover?.()
  // }
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

  // const lookup = async () => {
  //   const q = text.value?.trim()
  //   if (!q) return

  //   loading.value = true
  //   errorMsg.value = ''
  //   results.value = []

  //   try {
  //     const res = await window.ankify?.dictLookup?.(q);
  //     window.ankify?.log?.('Lookup result:', res);
  //     console.log(res);
  //     if (!res?.ok) {
  //       errorMsg.value = res?.error || 'Unknown error'
  //       return
  //     }

  //     const data = res.data?.data ?? [];
  //     // actually use normalizeItem here
  //     results.value = data.map(normalizeItem);

  //     if (!results.value.length) errorMsg.value = 'No results.'
  //   } catch (e) {
  //     errorMsg.value = `Lookup failed: ${String(e)}`
  //   } finally {
  //     loading.value = false
  //   }
  // }

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
      // IMPORTANT: pass a string, not a ref
      const tks = await window.ankify.tokenize(q);
      tokens.value = tks;

      // Filter to content words and dedupe
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

  async function onAddNote(item) {
    try {
      const modelName = 'Basic (and reversed card)'
      const deckName = 'Ankify'

      const note = noteFromResult(item, { modelName, deckName })
      const id = await window.ankify.invokeAnki('addNote', { note })
      console.log('addNote id:', id)
    } catch (e) {
      console.error('Add note failed', e)
    }
  }

  function noteFromResult(item, { modelName, deckName }) {
    const headword = String(item?.headword ?? '').trim()
    const senses = Array.isArray(item?.selectedSenses) && item.selectedSenses.length
      ? item.selectedSenses
      : (Array.isArray(item?.senses) ? item.senses : [])
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

  // function onPreview(item) {
  //   window.ankify?.log?.('Preview', item)
  // }



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