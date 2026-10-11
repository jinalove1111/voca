// PAUL PHONICS game logic (253차 prototype, 254차 unit-aware): Sound Bubble Pop + Word Train. Pure: no React, DOM, storage or network.
// Randomness only from the seed the caller passes (reuses the picture-word seeded rng/shuffled).
import { rng, shuffled } from '../pictureWords/practice.js'
import { PHONICS_ITEMS } from '../../data/phonics/phonicsWords.js'

export const POSITION_KO = { initial: '첫', medial: '가운데', final: '끝' }
export const BUBBLE_OBJECTIVE_KO = '단어의 첫 소리를 듣고 글자 고르기'
export const TRAIN_OBJECTIVE_KO = '소리 블록을 차례로 이어 단어 만들기'
export const OTHER_SOUND_KO = '다른 소리'
export const VOWEL_TRAIN_OBJECTIVE_KO = '들리는 모음 소리를 빈 칸에 끼우기'
export const VOWELS = ['a', 'e', 'i', 'o', 'u']

// ---- Sound Bubble Pop: hear the word, pick the grapheme of the target sound (default: the FIRST sound)
// opts.targetIndex = which grapheme of the word is the target; opts.optionPairs = 'grapheme|ipa' pairs the distractors may come from
// (the caller passes the learned pairs, Book 1 passes the five short vowels). Without opts the distractors come from the pool's first sounds.
const position = (i, n) => (i === 0 ? 'initial' : i === n - 1 ? 'final' : 'medial')
// opts.detect + opts.vowel = Book 1 first-sound task: two options [vowel, 다른 소리]; right = the vowel when the word has it, else 다른 소리 (no consonant decides anything).
export function bubbleRound(item, seed, pool = PHONICS_ITEMS, { targetIndex = 0, optionPairs, detect = false, vowel } = {}) {
  const grapheme = item.graphemes[targetIndex]
  const ipa = item.phonemes[targetIndex]
  if (detect) {
    const has = item.graphemes.includes(vowel)
    return { itemId: item.id, target: { grapheme: has ? vowel : OTHER_SOUND_KO, ipa, position: position(targetIndex, item.graphemes.length) }, objectiveKo: vowel + ' 소리가 들리는지 골라요', options: shuffled([vowel, OTHER_SOUND_KO], rng(seed + 7)), detect: true }
  }
  const seen = new Set([grapheme])
  const distractors = []
  const source = optionPairs ? optionPairs.map((p) => p.split('|')) : pool.map((o) => [o.graphemes[0], o.phonemes[0]])
  // a different PHONEME and a different grapheme (so c/k never competes with another /k/ spelling); each grapheme once
  for (const [g, ph] of shuffled(source, rng(seed))) {
    if (ph === ipa || seen.has(g)) continue
    seen.add(g)
    distractors.push(g)
    if (distractors.length === 3) break
  }
  if (!distractors.length) return null // not bubble-eligible
  const options = shuffled([grapheme, ...distractors], rng(seed + 7))
  const pos = position(targetIndex, item.graphemes.length)
  return { itemId: item.id, target: { grapheme, ipa, position: pos }, objectiveKo: `단어의 ${POSITION_KO[pos]} 소리를 듣고 글자 고르기`, options }
}
export const bubbleStart = (round) => ({ round, wrong: 0, tried: [], done: false, last: null })

// once = the sound test: ONE pick, no retry (a miss ends the item with wrong = 1)
export function bubblePick(state, optionIndex, { once = false } = {}) {
  const { round } = state
  if (state.done || state.tried.includes(optionIndex) || optionIndex < 0 || optionIndex >= round.options.length) return state
  if (round.options[optionIndex] !== round.target.grapheme) return once ? { ...state, wrong: 1, tried: [optionIndex], done: true, last: 'wrong' } : { ...state, wrong: state.wrong + 1, tried: [...state.tried, optionIndex], last: 'wrong' }
  return { ...state, done: true, last: 'right' }
}


// The spelled word as parts for display; the target grapheme's letters are marked hl (a split digraph marks BOTH its letters, e.g. c a k e -> a and e).
export function spellParts(graphemes, targetIndex = -1) {
  const parts = []
  let tail = null
  graphemes.forEach((g, i) => {
    const m = /^(.+)_e$/.exec(g)
    if (m) { parts.push({ t: m[1], hl: i === targetIndex }); tail = { t: 'e', hl: i === targetIndex } } else {
      parts.push({ t: g, hl: i === targetIndex })
      if (tail) { parts.push(tail); tail = null }
    }
  })
  if (tail) parts.push(tail)
  return parts
}

// ---- Word Train: tap grapheme tiles in order (digraphs are ONE tile) + exactly one distractor tile
// opts.learned = 'grapheme|ipa' pairs taught so far: the distractor tile must be one of those graphemes (none if there is none).
const EXTRA = ['a', 'e', 'i', 'o', 'u', 'b', 'd', 'm', 'n', 't', 'sh', 'ch', 'oo', 'ee']

export function trainRound(item, seed, { learned } = {}) {
  const answer = item.graphemes
  const r = rng(seed)
  let real = shuffled(answer.map((grapheme, i) => ({ id: `t${i}`, grapheme })), r)
  // never pre-solved: rotate once (a rotation by one only equals the original when every tile is identical)
  if (real.every((t, i) => t.grapheme === answer[i])) real = [...real.slice(1), real[0]]
  const base = learned ? [...new Set(learned.map((p) => p.split('|')[0]))] : EXTRA
  const extra = shuffled(base.filter((g) => !answer.includes(g)), r)[0]
  const tiles = real.slice()
  if (extra) tiles.splice(r.int(tiles.length + 1), 0, { id: `x${answer.length}`, grapheme: extra })
  return { itemId: item.id, target: { graphemes: answer, phonemes: item.phonemes }, objectiveKo: TRAIN_OBJECTIVE_KO, tiles }
}
// ---- Book 1 Word Train: every consonant grapheme is a grey helper, ONE carriage (the vowel) is empty, the tiles are the five vowels.
export function trainRoundVowel(item, seed) {
  const slot = item.graphemes.findIndex((g) => VOWELS.includes(g))
  if (slot < 0) return null
  const vowel = item.graphemes[slot]
  const tiles = shuffled(VOWELS.map((grapheme) => ({ id: 'v' + grapheme, grapheme })), rng(seed))
  return { itemId: item.id, target: { graphemes: item.graphemes, phonemes: item.phonemes, slot, vowel }, objectiveKo: VOWEL_TRAIN_OBJECTIVE_KO, tiles }
}
export function vowelTap(state, tileId) {
  const { round } = state
  const tile = round.tiles.find((t) => t.id === tileId)
  if (!tile || state.done) return state
  if (tile.grapheme !== round.target.vowel) return { ...state, wrong: state.wrong + 1, last: 'wrong' }
  return { ...state, placed: 1, usedTileIds: [tileId], last: 'right', done: true }
}
export const trainStart = (round) => ({ round, placed: 0, usedTileIds: [], wrong: 0, last: null, done: false })

export function trainTap(state, tileId) {
  const { round } = state
  const tile = round.tiles.find((t) => t.id === tileId)
  if (!tile || state.done || state.usedTileIds.includes(tileId)) return state
  if (tile.grapheme !== round.target.graphemes[state.placed]) return { ...state, wrong: state.wrong + 1, last: 'wrong' }
  const placed = state.placed + 1
  return { ...state, placed, usedTileIds: [...state.usedTileIds, tileId], last: 'right', done: placed === round.target.graphemes.length }
}

// ---- attempt record: a plain frozen object. Nothing is stored or sent; studentId is the session's student UUID (never a name).
// step: 'bubble' | 'train' | 'test' | 'review'
export const phonicsAttempt = ({ studentId, gameId, bookId = null, unitId = null, step = null, targetPhonemes, itemId, correct, retries, completed }) =>
  Object.freeze({ v: 1, studentId, gameId, bookId, unitId, step, targetPhonemes, itemId, correct, retries, completed })

export const sessionItems = (seed, count = 6, items = PHONICS_ITEMS) => shuffled(items, rng(seed)).slice(0, count)

// Per target phoneme: { attempts, wrong, retries, improvedAfterReview }. improvedAfterReview = a phoneme missed in a non-review step
// was later answered right first time in a 'review' step. Records are in the order they happened.
export function summarisePhonemes(records) {
  const out = {}
  const missed = new Set()
  for (const r of records) {
    for (const ph of r.targetPhonemes || []) {
      const s = out[ph] || (out[ph] = { attempts: 0, wrong: 0, retries: 0, improvedAfterReview: false })
      s.attempts++
      s.retries += r.retries
      if (!r.correct) s.wrong++
      if (r.step !== 'review' && !r.correct) missed.add(ph)
      if (r.step === 'review' && r.correct && missed.has(ph)) s.improvedAfterReview = true
    }
  }
  return out
}
