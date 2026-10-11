// PAUL PHONICS unit logic (255차, 256차: target balancing, two-sound exclusion, bubble session, word difficulty). Pure: no React, DOM, storage or network.
// A unit's words are its OWN explicit list (data/phonics/curriculum.js); the static test proves every word is decodable from learnedPairs (Book 1 is exempt: the child only listens for the vowel).
import { BOOKS, DEF, bookById, reviewUnit, recordableTargets } from '../../data/phonics/curriculum.js'
import { itemOfSlot } from '../../data/phonics/phonicsWords.js'
import { bubbleRound } from './games.js'
import { rng, shuffled } from '../pictureWords/practice.js'

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
// a word with several matching targets takes the one used least so far in this unit (ties: earliest in the word), so EVERY target of a multi-target unit is exercised (b2u2 g via dig).
// A word whose matched target is two sounds (qu, x, nk) is never offered as Sound Bubble Pop (B is dropped from its games).
// a contrast unit targets the vowel and restricts the bubble options to the two contrasted spellings (a vs a_e).
function slotsOf(unit) {
  const used = new Map()
  return unit.words.flatMap((n) => {
    const it = itemOfSlot(n)
    if (!it) return []
    const pairs = it.graphemes.map((_, i) => pairOf(it, i))
    let targetIndex = -1
    let least = Infinity
    pairs.forEach((p, i) => {
      if (!unit.targets.some((x) => x.pair === p)) return
      const c = used.get(p) || 0
      if (c < least) { least = c; targetIndex = i }
    })
    let games = unit.games
    if (targetIndex >= 0) {
      used.set(pairs[targetIndex], least + 1)
      if (unit.targets.find((x) => x.pair === pairs[targetIndex]).twoSounds) games = games.replace('B', '')
    }
    const out = { ...it, targetIndex, games }
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
    if (r.bookId !== bookId || r.unitId !== unitId || r.unitTest) continue
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

// The Book 1 picture Unit Test reads whole words with consonants the child has not been taught yet: it is locked there (the sound bubbles check Book 1 instead). null = not locked.
export const BOOK1_TEST_LOCK_KO = 'Book 1은 소리 풍선으로 확인해요'
export const unitTestLock = (book) => (book.focus === 'vowel-recognition' ? BOOK1_TEST_LOCK_KO : null)

// Sound Bubble Pop session of a unit: its own bubble-able words + up to `count` review items from EARLIER units (seeded, each with ITS OWN unit as `origin` and its own target),
// so a single-target unit is not the same answer all the way through. The first unit of Book 1 has no earlier unit, so it has no review items.
// Review items prefer target graphemes the unit does not teach itself and each grapheme at most once; contrast units are not drawn from. Order is shuffled.
// Every earlier-unit bubble word a unit's session may draw review items from (book order, unit order; deduped by id; carries its own `origin`).
export function bubbleReviewPool(bookId, unitId) {
  const ctx = unitContext(bookId, unitId)
  if (!ctx || ctx.unit.review) return []
  const own = new Set(ctx.words.map((w) => w.id))
  const pool = []
  for (const b of BOOKS) {
    for (const u of b.units) {
      if (b.id === bookId && u.id === unitId) return pool
      if (u.kind === 'contrast') continue
      for (const w of slotsOf(u)) {
        if (own.has(w.id) || !hasGame(w, 'B') || w.targetIndex < 0 || !bubbleOk(w, ctx)) continue
        own.add(w.id)
        pool.push({ ...w, origin: { bookId: b.id, unitId: u.id } })
      }
    }
  }
  return pool
}
const bubbleOk = (w, ctx) => !!bubbleRound(w, 0, undefined, { targetIndex: w.targetIndex, optionPairs: w.optionPairs || ctx.optionPairs })

// Book 1 Unit 1 has no earlier unit to mix in, so it is a DETECTION task: the unit's words (they have the unit vowel) + words of the other Book 1 units (they do not);
// every item is tagged { detect, vowel } and records stay with the unit being played. needsReview (pedagogy call by the lead).
export const detectUnit = (bookId, unitId) => { const n = nodeOf(bookId, unitId); return !!n && !n.unit.review && n.book.focus === 'vowel-recognition' && n.book.units[0].id === unitId }
export function detectWords(bookId, unitId) {
  const { book, unit, words } = unitContext(bookId, unitId)
  const vowel = unit.targets[0].grapheme
  const tag = (w) => ({ ...w, detect: true, vowel })
  const ok = (w) => hasGame(w, 'B') && w.targetIndex >= 0
  const far = new Map()
  for (const u of book.units) if (u.id !== unitId) for (const w of slotsOf(u)) if (ok(w) && !w.graphemes.includes(vowel)) far.set(w.id, tag(w))
  return { own: words.filter(ok).map(tag), far: [...far.values()] }
}

function sessionParts(bookId, unitId, seed, count) {
  const ctx = unitContext(bookId, unitId)
  if (!ctx || ctx.unit.review) return null
  const r = rng(seed)
  const detect = detectUnit(bookId, unitId)
  const d = detect ? detectWords(bookId, unitId) : null
  const own = d ? d.own : ctx.words.filter((w) => hasGame(w, 'B') && w.targetIndex >= 0 && bubbleOk(w, ctx))
  if (!own.length) return null
  const taken = new Set(d ? [] : own.map((w) => w.graphemes[w.targetIndex]))
  const review = []
  for (const w of shuffled(d ? d.far : bubbleReviewPool(bookId, unitId), r)) {
    const g = w.graphemes[w.targetIndex]
    if (taken.has(g)) continue
    taken.add(g)
    review.push(w)
    if (review.length === count) break
  }
  return { own, review, r }
}

export function bubbleSession(bookId, unitId, seed, count = 3) {
  const p = sessionParts(bookId, unitId, seed, count)
  return p ? shuffled([...p.own, ...p.review], p.r) : []
}

// Book 1 sound test (소리 확인): 5 items = up to 2 review/contrast items + the unit's own words, one pick each. Nothing stored.
export function testSession(bookId, unitId, seed, size = 5) {
  const p = sessionParts(bookId, unitId, seed, 3)
  if (!p) return []
  const rev = p.review.slice(0, 2)
  return shuffled([...rev, ...shuffled(p.own, p.r).slice(0, size - rev.length)], p.r)
}

// Word difficulty 1-3 (computed). A cluster = two or more consonant graphemes in a row; a syllable = a run of vowel graphemes.
//  3: 5+ graphemes, or 2+ clusters, or 2+ syllables.   2: 4 graphemes, or a digraph / split digraph / vowel team (grapheme longer than one letter), or one cluster.   1: the rest.
const vowelG = (g) => /^[aeiou]/.test(g)
export function wordDifficulty(item) {
  const gs = item.graphemes
  let clusters = 0, syllables = 0, run = 0, prevVowel = false
  gs.forEach((g) => {
    const v = vowelG(g)
    if (v && !prevVowel) syllables++
    if (!v) { run++; if (run === 2) clusters++ } else run = 0
    prevVowel = v
  })
  if (gs.length >= 5 || clusters >= 2 || syllables >= 2) return 3
  if (gs.length === 4 || clusters === 1 || gs.some((g) => g.length > 1)) return 2
  return 1
}
