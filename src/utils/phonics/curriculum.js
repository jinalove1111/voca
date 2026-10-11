// PAUL PHONICS unit logic (255차). Pure: no React, DOM, storage or network.
// A unit's words are its OWN explicit list (data/phonics/curriculum.js); the static test proves every word is decodable from learnedPairs (Book 1 is exempt: the child only listens for the vowel).
import { BOOKS, DEF, bookById, reviewUnit, recordableTargets } from '../../data/phonics/curriculum.js'
import { itemOfSlot } from '../../data/phonics/phonicsWords.js'

export const pairOf = (item, i) => `${item.graphemes[i]}|${item.phonemes[i]}`
export const BOOK1_VOWELS = ['a|æ', 'e|e', 'i|ɪ', 'o|ɒ', 'u|ʌ']

export function nodeOf(bookId, unitId) {
  const book = bookById(bookId)
  if (!book) return null
  const unit = unitId === 'review' ? reviewUnit(book) : book.units.find((u) => u.id === unitId)
  return unit ? { book, unit } : null
}

// all pairs of every earlier unit (book order, unit order) + this unit (aux pairs count from that unit on); the review node = everything up to the end of its book
export function learnedPairs(bookId, unitId) {
  const node = nodeOf(bookId, unitId)
  if (!node) return []
  const out = new Set()
  for (const b of BOOKS) {
    for (const u of b.units) {
      u.targets.forEach((x) => out.add(x.pair))
      u.aux.forEach((p) => out.add(p))
      if (b.id === bookId && u.id === unitId) return [...out]
    }
    if (b.id === bookId) return [...out] // review node: the whole book
  }
  return [...out]
}

export const targetPairs = (bookId, unitId) => (nodeOf(bookId, unitId)?.unit.targets || []).map((x) => x.pair)

const isVowelG = (g) => /^[aeiou](_e)?$/.test(g)
const counterpart = (g) => (g.includes('_') ? g[0] : `${g}_e`)

// slots of ONE unit as table items. targetIndex = the grapheme the unit teaches (-1 when it teaches no single sound, e.g. clusters);
// a contrast unit targets the vowel and restricts the bubble options to the two contrasted spellings (a vs a_e).
function slotsOf(unit) {
  const targets = unit.targets.map((x) => x.pair)
  return unit.words.flatMap((n) => {
    const it = itemOfSlot(n)
    if (!it) return []
    const pairs = it.graphemes.map((_, i) => pairOf(it, i))
    let targetIndex = pairs.findIndex((p) => targets.includes(p))
    const out = { ...it, targetIndex, games: unit.games }
    if (unit.kind === 'contrast' && unit.games.includes('B')) {
      targetIndex = it.graphemes.findIndex(isVowelG)
      const g = it.graphemes[targetIndex]
      const c = counterpart(g)
      out.targetIndex = targetIndex
      out.optionPairs = [pairOf(it, targetIndex), `${c}|${DEF[c]}`]
    }
    return [out]
  })
}

// Words of a node (order = the unit's list). The review node = every word of the book once: games merged, and the bubble target of the first unit that offers Sound Bubble Pop.
export function unitWords(bookId, unitId) {
  const node = nodeOf(bookId, unitId)
  if (!node) return []
  if (!node.unit.review) return slotsOf(node.unit)
  const by = new Map()
  for (const u of node.book.units) {
    for (const w of slotsOf(u)) {
      const cur = by.get(w.id)
      if (!cur) { by.set(w.id, w); continue }
      const games = [...new Set((cur.games + w.games).split(''))].join('')
      by.set(w.id, !cur.games.includes('B') && w.games.includes('B') ? { ...w, games } : { ...cur, games })
    }
  }
  return [...by.values()]
}

// per-game word lists a hub needs (picture-less items are fine for B and T; H, L, practice and the picture test use only image 'ready' items)
export const hasGame = (w, g) => w.games.includes(g)
export const readyWords = (words) => words.filter((w) => w.image === 'ready')

// everything a unit hub needs
export function unitContext(bookId, unitId) {
  const node = nodeOf(bookId, unitId)
  if (!node) return null
  const learned = learnedPairs(bookId, unitId)
  const vowelBook = node.book.focus === 'vowel-recognition'
  return { ...node, bookId, unitId, words: unitWords(bookId, unitId), learned, optionPairs: vowelBook ? BOOK1_VOWELS : learned }
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

// recordable phonemes of a unit that an EARLIER unit already needed (the same recording is reused)
export function reusedIpas(bookId, unitId) {
  const seen = new Set()
  for (const b of BOOKS) {
    for (const u of b.units) {
      const here = recordableTargets(u).map((x) => x.ipa)
      if (b.id === bookId && u.id === unitId) return [...new Set(here.filter((p) => seen.has(p)))]
      here.forEach((p) => seen.add(p))
    }
  }
  return []
}
