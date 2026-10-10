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
    if (!e.phonics) continue
    if (!map.has(e.phonics.group)) map.set(e.phonics.group, [])
    map.get(e.phonics.group).push(e)
  }
  return [...map].map(([group, items]) => ({ group, items }))
}

// Picture Vocabulary view: MATCH only, grouped by the 8 shop categories.
export function shopGroups(entries = PICTURE_WORDS) {
  return SHOP_ORDER.map((shop) => ({ shop, items: entries.filter((e) => e.shop === shop && e.tracks.includes('pictureVocabulary')) }))
}

export function reuseSummary(entries = PICTURE_WORDS) {
  const match = entries.filter((e) => e.status === 'MATCH')
  const existing = match.filter((e) => e.existingWord)
  const newCandidates = match.filter((e) => !e.existingWord)
  return { existing, newCandidates, pendingApproval: entries.length - match.length }
}

const APPROVED_TRACKS = (e) => [
  'pictureVocabulary', 'shopVocabulary',
  ...(e.phonics ? ['phonics'] : []),
  ...(e.shop === 'garden' || e.shop === 'decoration' ? ['townObject'] : []),
]

// Pure: never mutates entries/decisions. decisions = { [id]: { action:'approve'|'exclude', en?, ko?, at } }
export function applyDecisions(entries, decisions) {
  const d = decisions && typeof decisions === 'object' ? decisions : {}
  return entries.map((e) => {
    const x = Object.prototype.hasOwnProperty.call(d, e.id) ? d[e.id] : null
    if (!x || (x.action !== 'approve' && x.action !== 'exclude')) return { ...e, decision: null }
    if (x.action === 'exclude') return { ...e, decision: 'exclude', tracks: [] }
    const en = typeof x.en === 'string' && x.en.trim() ? x.en.trim() : e.en
    const ko = typeof x.ko === 'string' && x.ko.trim() ? x.ko.trim() : e.ko
    return { ...e, decision: 'approve', en, ko, edited: en !== e.en || ko !== e.ko, tracks: e.tracks.length ? e.tracks : APPROVED_TRACKS(e) }
  })
}
