// PAUL PHONICS word table (255차, 256차: display + needsReview). The words are the union of the 43 draft units' own word lists (data/phonics/curriculum.js, segmented notation).
// graphemes and phonemes are 1:1 (a split digraph like a_e is ONE grapheme). Pure: no React, storage or network.
// image: 'ready' = a learnable picture word with the same en exists; 'not-needed' = can be learned without a picture; 'needed' = a picture still has to be made.
import { learnableWords } from '../pictureWords/index.js'
import { BOOKS, parseWord, spell } from './curriculum.js'

export { spell }
export const PHONICS_SET_LABEL_KO = '시제품 묶음 (교재 순서 아님)'
export const IMAGE_LABEL_KO = { ready: '그림 준비', needed: '이미지 제작 대기', 'not-needed': '그림 없이 학습' }

export const NOIMG = new Set('boil brown clap cute day dig fight five game group grow her high home hop hope hot june kick kit miss name lunch note pair pink play quiz red right rude rule sat short sip six snap song spot stop swim tenth that them then thick thin this time tune turn wet when which with yes you green loud winter cook good yum quick off buzz white smell skip black breath chop spread'.split(' '))
// Words the teacher must confirm before the unit can be approved (British usage / rare words). jumper = sweater, rubber = eraser in British English.
export const REVIEW_WORDS = new Set('mule prune tenth cub moth vet rude yum cloth globe horn thread spread breath head jumper rubber'.split(' '))

const LEARN = learnableWords()
const PICTURE_BY_EN = new Map()
for (const e of LEARN) { const k = e.en.toLowerCase(); if (!PICTURE_BY_EN.has(k)) PICTURE_BY_EN.set(k, e) }

function build(notation) {
  const { graphemes, phonemes, raw } = parseWord(notation)
  const word = spell(graphemes)
  const pic = PICTURE_BY_EN.get(word) || null
  const item = { id: pic ? pic.id : `word:${word}`, word, en: word, ko: pic ? pic.ko : null, asset: pic ? pic.asset : null, display: spell(raw), needsReview: REVIEW_WORDS.has(word), graphemes, phonemes, picture: pic, image: pic ? 'ready' : NOIMG.has(word) ? 'not-needed' : 'needed' }
  return item
}

// the first notation of a word wins (the static test proves repeats are identical)
const BY_WORD = new Map()
for (const b of BOOKS) for (const u of b.units) for (const n of u.words) { const it = build(n); if (!BY_WORD.has(it.word)) BY_WORD.set(it.word, it) }

export const PHONICS_ITEMS = [...BY_WORD.values()]
export const itemOfWord = (word) => BY_WORD.get(word) || null
// one unit slot (a notation string) -> the table item
export const itemOfSlot = (notation) => BY_WORD.get(spell(parseWord(notation).graphemes)) || null
