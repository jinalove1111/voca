// Picture-word classification data + pure helpers. Admin review only. No React, no storage, no network.
import data from './pictureWords.json' with { type: 'json' }

export const PICTURE_WORDS = data.entries
export const COUNTS = data.counts
export const PHONICS_REVIEW = data.phonicsReview
export const SHOP_ORDER = ['food', 'school', 'toy', 'clothes', 'garden', 'decoration', 'furniture', 'pet']
export const SHOP_LABEL_KO = { food: '음식', school: '학용품', toy: '장난감', clothes: '옷', garden: '정원', decoration: '장식', furniture: '가구', pet: '반려동물' }

export const byStatus = (status, entries = PICTURE_WORDS) => entries.filter((e) => e.status === status)

export function phonicsGroups(entries = PICTURE_WORDS) {
  const map = new Map() // Map keeps first-appearance order = stable; NOT a curriculum order
  for (const e of entries) {
    if (!e.phonicsCandidate) continue // 검토 후보일 뿐 — 분류/학습 순서 아님
    if (!map.has(e.phonicsCandidate.group)) map.set(e.phonicsCandidate.group, [])
    map.get(e.phonicsCandidate.group).push(e)
  }
  return [...map].map(([group, items]) => ({ group, items }))
}

// Picture Vocabulary view: MATCH only, grouped by the 8 shop categories.
export function shopGroups(entries = PICTURE_WORDS) {
  return SHOP_ORDER.map((shop) => ({ shop, items: entries.filter((e) => e.shop === shop && e.tracks.includes('pictureVocabulary')) }))
}

export function reuseSummary(entries = PICTURE_WORDS) {
  const learn = entries.filter((e) => e.learn)
  return { existing: learn.filter((e) => e.existingWord), newCandidates: learn.filter((e) => !e.existingWord), pendingApproval: entries.length - learn.length }
}

export const learnableWords = (entries = PICTURE_WORDS) => entries.filter((e) => e.learn)
export const pendingWords = (entries = PICTURE_WORDS) => entries.filter((e) => ['MISMATCH', 'UNCERTAIN', 'MULTIPLE'].includes(e.status) && !e.decision)

// Practice sets: one per shop, fixed order. ready = enough words for a 4-option quiz.
export const SET_ORDER = ['food', 'school', 'toy', 'clothes', 'furniture', 'decoration', 'garden', 'pet']
const SHOP_LABEL_EN = { food: 'Food Shop', school: 'School Shop', toy: 'Toy Shop', clothes: 'Clothes Shop', furniture: 'Furniture Shop', decoration: 'Decoration Shop', garden: 'Garden Shop', pet: 'Pet Shop' }
export function shopSets(entries = PICTURE_WORDS) {
  const all = learnableWords(entries)
  return SET_ORDER.map((shop) => {
    const words = all.filter((e) => e.shop === shop)
    return { shop, labelKo: SHOP_LABEL_KO[shop], labelEn: SHOP_LABEL_EN[shop], words, ready: words.length >= 4 }
  })
}

const APPROVED_TRACKS = (e) => [
  'pictureVocabulary', 'shopVocabulary',
  ...(e.shop === 'garden' || e.shop === 'decoration' ? ['townObject'] : []),
]

// Pure: never mutates entries/decisions. decisions = { [id]: { action:'approve'|'exclude', en?, ko?, at } }
export function applyDecisions(entries, decisions) {
  const d = decisions && typeof decisions === 'object' ? decisions : {}
  return entries.map((e) => {
    const x = Object.prototype.hasOwnProperty.call(d, e.id) ? d[e.id] : null
    if (!x || (x.action !== 'approve' && x.action !== 'exclude')) return { ...e, decision: null }
    if (x.action === 'exclude') return { ...e, decision: 'exclude', learn: false, tracks: [] }
    const en = typeof x.en === 'string' && x.en.trim() ? x.en.trim() : e.en
    const ko = typeof x.ko === 'string' && x.ko.trim() ? x.ko.trim() : e.ko
    return { ...e, decision: 'approve', learn: true, en, ko, edited: en !== e.en || ko !== e.ko, tracks: e.tracks.length ? e.tracks : APPROVED_TRACKS(e) }
  })
}

// Levels (250차) — STRUCTURE ONLY. Phonics here = short plain words chosen by LENGTH, nothing more:
// the real unit/sound order of the textbook is unconfirmed (operator instruction), so this never uses
// phonicsCandidate groups and never orders or classifies by sound. Revisit once the order is confirmed.
export const LEVELS = [
  { id: 'phonics', labelKo: 'Phonics — 짧고 쉬운 단어', enabled: true },
  { id: 'conversation', labelKo: 'Conversation — 생활 단어와 가게 물건', enabled: true },
  { id: 'advanced', labelKo: '높은 단계 (준비 중)', enabled: false },
]
const SHORT_WORD = /^[a-z]{3,4}$/
// Learnable words only, alphabetical by id (callers shuffle with a seed). advanced = [] placeholder.
export function wordsForLevel(levelId, entries = PICTURE_WORDS) {
  const all = learnableWords(entries).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (levelId === 'phonics') return all.filter((e) => SHORT_WORD.test(String(e.en).toLowerCase()))
  if (levelId === 'conversation') return all
  return []
}
