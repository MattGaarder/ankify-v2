// src/composables/useKuromoji.js
// @ts-ignore
import kuromoji from 'kuromoji/build/kuromoji.js';


let _tokenizerPromise = null

export function useKuromoji(dicPath = '/kuromoji/dict/') {
  function getTokenizer() {
    if (!_tokenizerPromise) {
      _tokenizerPromise = new Promise((resolve, reject) => {
        kuromoji.builder({ dicPath }).build((err, tokenizer) => {
          if (err) return reject(err)
          resolve(tokenizer)
        })
      })
    }
    return _tokenizerPromise
  }

  async function tokenize(text) {
    const tokenizer = await getTokenizer()
    return tokenizer.tokenize(text || '')
  }

  return { tokenize }
}