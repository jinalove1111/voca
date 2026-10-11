// PAUL PHONICS eligibility (254차). Pure: no React, DOM, storage or network.
// A word may appear in a unit only if EVERY grapheme|phoneme pair in it has been taught by then (Book 1 is the exception: the child only listens for the vowel).
import { BOOKS, bookById, reviewUnit } from '../../data/phonics/curriculum.js'
import { PHONICS_ITEMS } from '../../data/phonics/phonicsWords.js'

export const pairOf = (item, i) => `${item.graphemes[i]}|${item.phonemes[i]}`
export const BOOK1_VOWELS = ['a|æ', 'e|e', 'i|ɪ', 'o|ɒ', 'u|ʌ']

export function nodeOf(bookId, unitId) {
  const book = bookById(bookId)
  if (!book) return null
  const unit = unitId === 'review' ? reviewUnit(book) : book.units.find((u) => u.id === unitId)
  return unit ? { book, unit } : null
}

// all pairs of every earlier unit (book order, unit order) + this unit; the review node = everything up to the end of its book
export function learnedPairs(bookId, unitId) {
  const node = nodeOf(bookId, unitId)
  if (!node) return []
  const out = new Set()
  for (const b of BOOKS) {
    for (const u of b.units) {
      u.targets.forEach((x) => out.add(x.pair))
      if (b.id === bookId && u.id === unitId) return [...out]
    }
    if (b.id === bookId) return [...out] // review node: the whole book
  }
  return [...out]
}

export const targetPairs = (bookId, unitId) => (nodeOf(bookId, unitId)?.unit.targets || []).map((x) => x.pair)

// Words of a node, each with `targetIndex` (the position of the unit's sound in the word). Order = table order.
export function unitWords(bookId, unitId) {
  const node = nodeOf(bookId, unitId)
  if (!node) return []
  const targets = targetPairs(bookId, unitId)
  const learned = new Set(learnedPairs(bookId, unitId))
  const vowelBook = node.book.focus === 'vowel-recognition'
  return PHONICS_ITEMS.flatMap((it) => {
    const pairs = it.graphemes.map((_, i) => pairOf(it, i))
    const targetIndex = pairs.findIndex((p) => targets.includes(p))
    if (targetIndex < 0) return []
    if (!vowelBook && !pairs.every((p) => learned.has(p))) return []
    return [{ ...it, targetIndex }]
  })
}

// everything a unit hub needs
export function unitContext(bookId, unitId) {
  const node = nodeOf(bookId, unitId)
  if (!node) return null
  const learned = learnedPairs(bookId, unitId)
  const vowelBook = node.book.focus === 'vowel-recognition'
  return { ...node, bookId, unitId, words: unitWords(bookId, unitId), learned, optionPairs: vowelBook ? BOOK1_VOWELS : learned, trainOffered: !vowelBook }
}

// Items still owed a review: missed (not first-try correct) in a bubble/train step of this unit and not yet answered right in a later review step.
export function missedItems(records, bookId, unitId) {
  const state = new Map()
  for (const r of records) {
    if (r.bookId !== bookId || r.unitId !== unitId) continue
    if (r.step === 'review') { if (r.correct) state.delete(r.itemId); continue }
    if (!r.correct) state.set(r.itemId, true)
  }
  return [...state.keys()]
}
