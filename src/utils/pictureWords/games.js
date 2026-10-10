// Picture Vocabulary games (250차): Alphabet Hammer + Hidden Letters. Pure: no React, DOM, storage or network.
// Randomness only from the seed the caller passes (reuses practice.js rng/shuffled).
import { rng, shuffled } from './practice.js'
import { wordsForLevel } from '../../data/pictureWords/index.js'

const ALPHA = 'abcdefghijklmnopqrstuvwxyz'
const lc = (s) => String(s).toLowerCase()

// Every character of the word; only a-z letters are playable. Spaces/hyphens/apostrophes are fixed separators.
export const letterCells = (en) => [...String(en)].map((ch) => ({ ch, playable: /^[a-z]$/i.test(ch) }))
const playableLetters = (cells) => cells.filter((c) => c.playable).map((c) => c.ch)
export const playableCount = (en) => playableLetters(letterCells(en)).length

// ---- Alphabet Hammer
export function hammerRound(word, seed) {
  const cells = letterCells(word.en)
  const letters = playableLetters(cells)
  const r = rng(seed)
  const tiles = shuffled(letters.map((ch, i) => ({ id: `t${i}`, ch })), r)
  // order must differ from the answer whenever it can (>= 2 distinct letters): swap the first tile with the first different letter
  if (new Set(letters.map(lc)).size >= 2 && tiles.every((t, i) => lc(t.ch) === lc(letters[i]))) {
    const j = tiles.findIndex((t) => lc(t.ch) !== lc(tiles[0].ch))
    ;[tiles[0], tiles[j]] = [tiles[j], tiles[0]]
  }
  return { wordId: word.id, cells, tiles }
}
export const hammerStart = (round) => ({ round, placed: 0, usedTileIds: [], wrong: 0, last: null, done: false })

export function hammerTap(state, tileId) {
  const { round } = state
  const tile = round.tiles.find((t) => t.id === tileId)
  if (!tile || state.done || state.usedTileIds.includes(tileId)) return state
  const need = playableLetters(round.cells)[state.placed]
  if (lc(tile.ch) !== lc(need)) return { ...state, wrong: state.wrong + 1, last: 'wrong' }
  const placed = state.placed + 1
  return { ...state, placed, usedTileIds: [...state.usedTileIds, tileId], last: 'right', done: placed === round.tiles.length }
}

// ---- Hidden Letters
const HIDE = { easy: () => 1, normal: (n) => Math.max(2, Math.round(n / 3)), hard: (n) => Math.max(2, Math.round(n / 2)) }
export const hiddenCount = (n, difficulty) => Math.max(1, Math.min(n - 1, (HIDE[difficulty] || HIDE.easy)(n)))

export function hiddenRound(word, { difficulty = 'easy', seed = 0 } = {}) {
  const cells = letterCells(word.en)
  const idx = cells.map((c, i) => (c.playable ? i : -1)).filter((i) => i >= 0)
  const r = rng(seed)
  const hidden = shuffled(idx, r).slice(0, hiddenCount(idx.length, difficulty)).sort((a, b) => a - b)
  const positions = []
  const blanks = hidden.map((index, b) => {
    const ch = cells[index].ch
    const upper = ch !== ch.toLowerCase()
    const distractors = shuffled([...ALPHA].filter((x) => x !== lc(ch)), r).slice(0, 3).map((x) => (upper ? x.toUpperCase() : x))
    let pos = r.int(4)
    // the correct option must not sit in the same place for every blank of a round
    if (b > 0 && b === hidden.length - 1 && positions.every((p) => p === pos)) pos = (pos + 1) % 4
    positions.push(pos)
    const options = distractors.slice()
    options.splice(pos, 0, ch)
    return { index, options }
  })
  return { wordId: word.id, cells, hidden, blanks }
}
export const hiddenStart = (round) => ({ round, filled: 0, tried: [], wrong: 0, last: null, done: false })

export function hiddenPick(state, letter) {
  const { round } = state
  if (state.done || state.tried.includes(letter)) return state
  const blank = round.blanks[state.filled]
  if (lc(letter) !== lc(round.cells[blank.index].ch)) return { ...state, wrong: state.wrong + 1, tried: [...state.tried, letter], last: 'wrong' }
  const filled = state.filled + 1
  return { ...state, filled, tried: [], last: 'right', done: filled === round.blanks.length }
}

// ---- word selection
// game: 'hammer' (<= 9 letters) | 'hidden'. Both need >= 2 playable letters. from = optional word list (connected entry).
export const gameEligible = (word, game) => { const n = playableCount(word.en); return n >= 2 && (game !== 'hammer' || n <= 9) }
export function gameWords(levelId, { count = 6, seed = 0, shop, game, from } = {}) {
  let list = (from || wordsForLevel(levelId)).filter((w) => gameEligible(w, game))
  if (shop) list = list.filter((w) => w.shop === shop)
  return shuffled(list, rng(seed)).slice(0, count)
}
