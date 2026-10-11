// Phonics Adventure prototype logic (253차): Sound Bubble Pop + Word Train. Pure: no React, DOM, storage or network.
// Randomness only from the seed the caller passes (reuses the picture-word seeded rng/shuffled).
import { rng, shuffled } from '../pictureWords/practice.js'
import { PHONICS_ITEMS } from '../../data/phonics/phonicsWords.js'

export const BUBBLE_OBJECTIVE_KO = '단어의 첫 소리를 듣고 글자 고르기'
export const TRAIN_OBJECTIVE_KO = '소리 블록을 차례로 이어 단어 만들기'

// ---- Sound Bubble Pop: hear the word, pick the grapheme of its FIRST sound
export function bubbleRound(item, seed, pool = PHONICS_ITEMS) {
  const grapheme = item.graphemes[0]
  const ipa = item.phonemes[0]
  const seen = new Set([grapheme])
  const distractors = []
  // a different first PHONEME and a different grapheme (so c/k never competes with another /k/ spelling); each grapheme once
  for (const o of shuffled(pool, rng(seed))) {
    const g = o.graphemes[0]
    if (o.phonemes[0] === ipa || seen.has(g)) continue
    seen.add(g)
    distractors.push(g)
    if (distractors.length === 3) break
  }
  const options = shuffled([grapheme, ...distractors], rng(seed + 7))
  return { itemId: item.id, target: { grapheme, ipa, position: 'initial' }, objectiveKo: BUBBLE_OBJECTIVE_KO, options }
}
export const bubbleStart = (round) => ({ round, wrong: 0, tried: [], done: false, last: null })

export function bubblePick(state, optionIndex) {
  const { round } = state
  if (state.done || state.tried.includes(optionIndex) || optionIndex < 0 || optionIndex >= round.options.length) return state
  if (round.options[optionIndex] !== round.target.grapheme) return { ...state, wrong: state.wrong + 1, tried: [...state.tried, optionIndex], last: 'wrong' }
  return { ...state, done: true, last: 'right' }
}

// ---- Word Train: tap grapheme tiles in order (digraphs are ONE tile) + exactly one distractor tile
const EXTRA = ['a', 'e', 'i', 'o', 'u', 'b', 'd', 'm', 'n', 't', 'sh', 'ch', 'oo', 'ee']

export function trainRound(item, seed) {
  const answer = item.graphemes
  const r = rng(seed)
  let real = shuffled(answer.map((grapheme, i) => ({ id: `t${i}`, grapheme })), r)
  // never pre-solved: rotate once (a rotation by one only equals the original when every tile is identical)
  if (real.every((t, i) => t.grapheme === answer[i])) real = [...real.slice(1), real[0]]
  const extra = shuffled(EXTRA.filter((g) => !answer.includes(g)), r)[0]
  const tiles = real.slice()
  tiles.splice(r.int(tiles.length + 1), 0, { id: `x${answer.length}`, grapheme: extra })
  return { itemId: item.id, target: { graphemes: answer, phonemes: item.phonemes }, objectiveKo: TRAIN_OBJECTIVE_KO, tiles }
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
export const phonicsAttempt = ({ studentId, gameId, unitId = null, targetPhonemes, itemId, correct, retries, completed }) =>
  Object.freeze({ v: 1, studentId, gameId, unitId, targetPhonemes, itemId, correct, retries, completed })

export const sessionItems = (seed, count = 6) => shuffled(PHONICS_ITEMS, rng(seed)).slice(0, count)
