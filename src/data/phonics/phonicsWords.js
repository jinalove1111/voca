// PAUL PHONICS word table (253차 prototype, 254차 renamed). Lead-authored British (RP) table: grapheme and phoneme lists are 1:1 (a split digraph like a_e is ONE grapheme).
// There is NO confirmed textbook/unit order, so every item has unitId null + orderConfirmed false and the set is labelled as a prototype bundle.
// Pure: no React, storage or network.
import { learnableWords } from '../pictureWords/index.js'

export const PHONICS_SET_LABEL_KO = '시제품 묶음 (교재 순서 아님)'

// [picture-word id, word, graphemes, phonemes]
const ROWS = [
  ['pics2/bag', 'bag', ['b', 'a', 'g'], ['b', 'æ', 'ɡ']],
  ['pics2/cup', 'cup', ['c', 'u', 'p'], ['k', 'ʌ', 'p']],
  ['pics2/pen', 'pen', ['p', 'e', 'n'], ['p', 'e', 'n']],
  ['pics2/jam', 'jam', ['j', 'a', 'm'], ['dʒ', 'æ', 'm']],
  ['pics2/egg', 'egg', ['e', 'gg'], ['e', 'ɡ']],
  ['pics2/ink', 'ink', ['i', 'n', 'k'], ['ɪ', 'ŋ', 'k']],
  ['pics2/milk', 'milk', ['m', 'i', 'l', 'k'], ['m', 'ɪ', 'l', 'k']],
  ['pics2/desk', 'desk', ['d', 'e', 's', 'k'], ['d', 'e', 's', 'k']],
  ['pics2/sock', 'sock', ['s', 'o', 'ck'], ['s', 'ɒ', 'k']],
  ['pics2/dress', 'dress', ['d', 'r', 'e', 'ss'], ['d', 'r', 'e', 's']],
  ['pics2/peach', 'peach', ['p', 'ea', 'ch'], ['p', 'iː', 'tʃ']],
  ['pics2/candy', 'sweet', ['s', 'w', 'ee', 't'], ['s', 'w', 'iː', 't']],
  ['pics2/boat', 'boat', ['b', 'oa', 't'], ['b', 'əʊ', 't']],
  ['pics2/train', 'train', ['t', 'r', 'ai', 'n'], ['t', 'r', 'eɪ', 'n']],
  ['pics2/book', 'book', ['b', 'oo', 'k'], ['b', 'ʊ', 'k']],
  ['pics2/shirt', 'shirt', ['sh', 'ir', 't'], ['ʃ', 'ɜː', 't']],
  ['pics2/scarf', 'scarf', ['s', 'c', 'ar', 'f'], ['s', 'k', 'ɑː', 'f']],
  ['pics2/soup', 'soup', ['s', 'ou', 'p'], ['s', 'uː', 'p']],
  ['pics2/chaor', 'chair', ['ch', 'air'], ['tʃ', 'eə']],
  ['pics2/cheese', 'cheese', ['ch', 'ee', 'se'], ['tʃ', 'iː', 'z']],
  ['pics2/cake', 'cake', ['c', 'a_e', 'k'], ['k', 'eɪ', 'k']],
  ['pics2/tape', 'tape', ['t', 'a_e', 'p'], ['t', 'eɪ', 'p']],
  ['pics2/kite', 'kite', ['k', 'i_e', 't'], ['k', 'aɪ', 't']],
  ['pics2/slide', 'slide', ['s', 'l', 'i_e', 'd'], ['s', 'l', 'aɪ', 'd']],
]

// A split digraph X_e writes X, then the NEXT grapheme, then e (c + a_e + k -> cake).
export function spell(graphemes) {
  let out = '', tail = ''
  for (const g of graphemes) {
    const m = /^(.+)_e$/.exec(g)
    if (m) { out += m[1]; tail = 'e' } else { out += g + tail; tail = '' }
  }
  return out + tail
}

const LEARN = learnableWords()

// A row whose picture word is missing, not learnable or spelled differently is dropped (never shown).
export const PHONICS_ITEMS = ROWS.flatMap(([id, word, graphemes, phonemes]) => {
  const pw = LEARN.find((e) => e.id === id)
  if (!pw || pw.en !== word) return []
  return [{ id, word, en: word, ko: pw.ko, asset: pw.asset, graphemes, phonemes, unitId: null, orderConfirmed: false }]
})
