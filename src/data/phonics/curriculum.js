// PAUL PHONICS (폴 파닉스) curriculum (254차). The 5-book outline is the operator's; EVERY unit below is a lead-authored DRAFT (status 'draft', none approved).
// Targets are grapheme|phoneme pairs (British RP). Pure data: no React, storage or network.
export const STATUS_LABEL_KO = { draft: '임시', approved: '승인' }

const t = (pair, kind) => {
  const [grapheme, ipa] = pair.split('|')
  return kind ? { pair, grapheme, ipa, kind } : { pair, grapheme, ipa }
}
const unit = (id, pairs, extra = {}) => ({ id, status: 'draft', targets: pairs.split(' ').map((p) => t(p, extra.kind)), ...extra })

export const BOOKS = [
  {
    id: 'b1', no: 1, titleEn: 'Short Vowels', titleKo: '단모음', focus: 'vowel-recognition', notes: [],
    units: [unit('u1', 'a|æ'), unit('u2', 'e|e'), unit('u3', 'i|ɪ'), unit('u4', 'o|ɒ'), unit('u5', 'u|ʌ')],
  },
  {
    id: 'b2', no: 2, titleEn: 'Single Consonants', titleKo: '단자음', focus: 'sound-letter', notes: ['묶음 순서는 알파벳 순이며 임시입니다'],
    units: [unit('u1', 'b|b c|k d|d f|f g|ɡ'), unit('u2', 'h|h j|dʒ k|k l|l m|m'), unit('u3', 'n|n p|p r|r s|s t|t'), unit('u4', 'v|v w|w y|j z|z qu|kw x|ks')],
  },
  {
    id: 'b3', no: 3, titleEn: 'Long Vowels', titleKo: '장모음', focus: 'sound-letter', notes: [],
    units: [unit('u1', 'a_e|eɪ'), unit('u2', 'i_e|aɪ'), unit('u3', 'o_e|əʊ'), unit('u4', 'u_e|juː', { note: 'u_e는 /uː/로도 읽힙니다' })],
  },
  {
    id: 'b4', no: 4, titleEn: 'Consonant Teams', titleKo: '이중자음', focus: 'sound-letter',
    notes: ['글자 두 개가 소리 하나를 내는 것이 digraph(이 Book의 Unit)이고, dr·tr·sl·sw·sk처럼 글자마다 제 소리를 내는 것은 consonant cluster라서 따로 Unit 없이 Book 2의 글자로 만듭니다'],
    units: [
      unit('u1', 'sh|ʃ', { kind: 'digraph' }), unit('u2', 'ch|tʃ', { kind: 'digraph' }),
      unit('u3', 'th|θ th|ð', { kind: 'digraph', note: 'th는 소리가 두 가지입니다 (/θ/ 와 /ð/)' }),
      unit('u4', 'wh|w', { kind: 'digraph' }), unit('u5', 'ck|k', { kind: 'digraph' }), unit('u6', 'ng|ŋ', { kind: 'digraph' }),
    ],
  },
  {
    id: 'b5', no: 5, titleEn: 'Vowel Teams', titleKo: '이중모음', focus: 'sound-letter', notes: [],
    units: [
      unit('u1', 'ai|eɪ ay|eɪ'), unit('u2', 'ee|iː ea|iː', { note: 'ea는 /e/로도 읽힙니다' }),
      unit('u3', 'oa|əʊ ow|əʊ', { note: 'ow는 /aʊ/로도 읽힙니다' }), unit('u4', 'oi|ɔɪ oy|ɔɪ'),
      unit('u5', 'ou|aʊ ou|uː', { note: 'ou는 소리가 두 가지입니다 (/aʊ/ 와 /uː/)' }),
    ],
  },
]

export const bookById = (id) => BOOKS.find((b) => b.id === id) || null

// The review node ("Book 전체 연습"): targets = every target of the book.
export const reviewUnit = (book) => ({ id: 'review', status: 'draft', targets: book.units.flatMap((u) => u.targets), review: true })

// includeDraft false = approved units only (none exist yet, so the list is empty for every book).
export function unitsOf(bookId, { includeDraft = false } = {}) {
  const b = bookById(bookId)
  return b ? b.units.filter((u) => includeDraft || u.status === 'approved') : []
}
