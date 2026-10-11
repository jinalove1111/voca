// PAUL PHONICS (폴 파닉스) curriculum (255차, 256차 품질 개선). The operator approved only the STRUCTURE of these 43 units (5/7/6/11/14 per book) — every unit is still a lead-authored DRAFT
// (status 'draft': the words, sounds, images and audio are NOT approved). Targets are grapheme|phoneme pairs (British RP). Pure data: no React, storage or network.
// Words use the segmented notation of the design doc: `s-l-i_e-d`, `th:ð-i-s`; a token without `:ipa` uses DEF; `X_e` is a split digraph (one grapheme). An upper-case token keeps a proper noun capitalised on screen (J-u_e:uː-n -> June).
export const STATUS_LABEL_KO = { draft: '임시', approved: '승인' }
export const GAME_NAME = { B: 'Sound Bubble Pop', T: 'Word Train', H: 'Alphabet Hammer', L: 'Hidden Letters' }

export const DEF = { a: 'æ', e: 'e', i: 'ɪ', o: 'ɒ', u: 'ʌ', m: 'm', s: 's', t: 't', p: 'p', n: 'n', d: 'd', g: 'ɡ', c: 'k', b: 'b', h: 'h', f: 'f', l: 'l', r: 'r', j: 'dʒ', k: 'k', w: 'w', v: 'v', y: 'j', z: 'z', ll: 'l', ss: 's', ff: 'f', gg: 'ɡ', zz: 'z', tt: 't', pp: 'p', bb: 'b', qu: 'kw', x: 'ks', a_e: 'eɪ', i_e: 'aɪ', o_e: 'əʊ', u_e: 'juː', e_e: 'iː', ck: 'k', sh: 'ʃ', ch: 'tʃ', th: 'θ', wh: 'w', ng: 'ŋ', nk: 'ŋk', ai: 'eɪ', ay: 'eɪ', ee: 'iː', ea: 'iː', oa: 'əʊ', ow: 'əʊ', ou: 'aʊ', oi: 'ɔɪ', oy: 'ɔɪ', igh: 'aɪ', oo: 'uː', ar: 'ɑː', or: 'ɔː', er: 'ɜː', ir: 'ɜː', ur: 'ɜː', air: 'eə' }

// 'th:ð' -> { pair: 'th|ð', grapheme: 'th', ipa: 'ð' }; raw keeps the notation's own case (display of proper nouns)
export function parseToken(tok) {
  const [g, ipa] = tok.split(':')
  const grapheme = g.toLowerCase()
  const ph = ipa || DEF[grapheme]
  return { pair: `${grapheme}|${ph}`, grapheme, ipa: ph, raw: g }
}
export function parseWord(notation) {
  const toks = notation.split('-').map(parseToken)
  return { graphemes: toks.map((x) => x.grapheme), phonemes: toks.map((x) => x.ipa), raw: toks.map((x) => x.raw) }
}
// A split digraph X_e writes X, then the NEXT grapheme, then e (c + a_e + k -> cake).
export function spell(graphemes) {
  let out = '', tail = ''
  for (const g of graphemes) {
    const m = /^(.+)_e$/.exec(g)
    if (m) { out += m[1]; tail = 'e' } else { out += g + tail; tail = '' }
  }
  return out + tail
}

// ---- dialect notes (admin only; British RP is the reference)
const D_O = 'o /ɒ/ — 미국식은 /ɑː/'
const D_U = 'u /ʌ/ — 잉글랜드 북부는 /ʊ/'
const D_OE = 'o_e·oa·ow /əʊ/ — 미국식은 /oʊ/'
const D_TUBE = 'tube·tune /tjuː-/ — 미국식은 /tuː-/, 현대 영국식은 /tʃuː-/로도 들려요'
const D_R = 'ar·or·er·ir·ur·air는 r 소리를 내지 않아요 — 미국·스코틀랜드는 r을 발음해요'
const D_WH = 'wh /w/ — 스코틀랜드·아일랜드는 /hw/'
const D_BOOK = 'oo가 book에서 /ʊ/ — 잉글랜드 북부 일부는 /uː/'
const D_WITH = 'with /wɪð/ — /wɪθ/는 북부·스코틀랜드·미국'
const D_PEAR = 'pear — ear 철자는 보통 /ɪə/ (pear만 /eə/)'
const D_AIR = 'air·ear /eə/ — 현대 남부 영국식은 /ɛː/로 들려요'
const D_TRDR = 'tr·dr — 실제 소리는 /tʃr/, /dʒr/에 가깝게 들려요'
export const DIALECT_NOTES = [D_O, D_U, D_OE, D_TUBE, D_R, D_WH, D_BOOK, D_WITH, D_PEAR, D_AIR, D_TRDR]

const DIGRAPH = '글자 둘, 소리 하나'
const CLUSTER = '자음군 — 글자마다 제 소리, 이어서 읽기'

// qu (/kw/), x (/ks/) and nk (/ŋk/) are ONE written unit but TWO sounds: never a Sound Bubble Pop target, never recorded as one clip.
const NO_RECORDING = new Set(['kw', 'ks', 'ŋk'])

// unit(id, 'learn tokens', 'word notations', { difficulty, games, label?, ...extra })
function unit(id, learn, words, m) {
  const toks = learn ? learn.split(' ').map(parseToken) : []
  const targets = toks.map(({ raw, ...x }) => {
    const t = m.kind === 'digraph' ? { ...x, kind: 'digraph' } : x
    return NO_RECORDING.has(x.ipa) ? { ...t, twoSounds: true } : t
  })
  const { aux = [], ...rest } = m
  return { id, status: 'draft', targets, aux, words: words.split(' '), ...rest }
}

export const BOOKS = [
  {
    id: 'b1', no: 1, titleEn: 'Short Vowels', titleKo: '단모음', focus: 'vowel-recognition',
    notes: ['모음 소리를 알아듣는 Book이에요. 자음은 도우미 소리일 뿐이고 Book 2에서 정식으로 배워요'],
    units: [
      unit('u1', 'a', 'b-a-g j-a-m c-a-t h-a-t m-a-p', { difficulty: 2, games: 'B' }),
      unit('u2', 'e', 'p-e-n d-e-s-k e-gg b-e-d r-e-d', { difficulty: 2, games: 'B' }),
      unit('u3', 'i', 'm-i-l-k i-nk p-i-g s-i-x l-i-p', { difficulty: 2, games: 'B' }),
      unit('u4', 'o', 's-o-ck d-o-g b-o-x h-o-t p-o-t', { difficulty: 2, games: 'B', dialect: D_O }),
      unit('u5', 'u', 'c-u-p s-u-n b-u-s m-u-g n-u-t', { difficulty: 3, games: 'B', dialect: D_U }),
    ],
  },
  {
    id: 'b2', no: 2, titleEn: 'Single Consonants', titleKo: '단자음', focus: 'sound-letter', notes: [],
    units: [
      unit('u1', 'm s t p', 'm-a-t s-a-t t-a-p p-o-t s-i-p', { difficulty: 1, games: 'BTHL' }),
      unit('u2', 'n d g c', 'p-e-n c-u-p d-o-g c-a-n d-i-g g-u-m', { difficulty: 1, games: 'BTHL' }),
      unit('u3', 'b h f l', 'b-a-g b-e-d h-a-t f-a-n l-e-g', { difficulty: 2, games: 'BTHL' }),
      unit('u4', 'r j k w', 'j-a-m m-i-l-k d-e-s-k r-e-d w-e-t k-i-d', { difficulty: 2, games: 'BTHL' }),
      unit('u5', 'v y z', 'v-a-n y-e-s z-i-p v-e-t y-u-m', { difficulty: 3, games: 'BTHL' }),
      unit('u6', 'll ss ff gg zz tt pp bb', 'e-gg d-r-e-ss b-e-ll h-i-ll m-i-ss o-ff b-u-zz s-o-ck d-u-ck', { difficulty: 1, games: 'THL', kind: 'doubles', aux: ['ck|k'], note: 'ck는 여기서 미리 만나고 Book 4에서 정식으로 배워요' }),
      unit('u7', 'qu x', 'b-o-x s-i-x f-o-x qu-i-z qu-i-ck', { difficulty: 2, games: 'THL', kind: 'quex', note: 'qu /kw/, x /ks/ — 글자 하나 모양, 소리는 둘' }),
    ],
  },
  {
    id: 'b3', no: 3, titleEn: 'Long Vowels', titleKo: '장모음', focus: 'sound-letter', notes: [],
    units: [
      unit('u1', 'a_e', 'c-a_e-k t-a_e-p g-a_e-t n-a_e-m g-a_e-m', { difficulty: 2, games: 'BTHL' }),
      unit('u2', 'i_e', 'k-i_e-t s-l-i_e-d b-i_e-k f-i_e-v t-i_e-m', { difficulty: 2, games: 'BTHL' }),
      unit('u3', 'o_e', 'b-o_e-n h-o_e-m c-o_e-n r-o_e-p n-o_e-t', { difficulty: 2, games: 'BTHL', dialect: D_OE }),
      unit('u4', 'u_e', 'c-u_e-b t-u_e-b c-u_e-t m-u_e-l t-u_e-n', { difficulty: 2, games: 'BTHL', label: 'u_e (cube)', dialect: D_TUBE, note: 'u_e /juː/' }),
      unit('u5', 'u_e:uː', 'r-u_e:uː-l J-u_e:uː-n f-l-u_e:uː-t r-u_e:uː-d p-r-u_e:uː-n', { difficulty: 2, games: 'BTHL', label: 'u_e (rule)', note: 'u_e /uː/' }),
      unit('u6', '', 't-a-p t-a_e-p k-i-t k-i_e-t c-a-p c-a_e-p h-o-p h-o_e-p c-u-b c-u_e-b', { difficulty: 3, games: 'B', kind: 'contrast', labels: ['tap–tape', 'kit–kite', 'cap–cape', 'hop–hope', 'cub–cube'], note: '단모음·장모음 구별' }),
    ],
  },
  {
    id: 'b4', no: 4, titleEn: 'Consonant Teams', titleKo: '이중자음', focus: 'sound-letter',
    notes: ['A: 글자 둘이 소리 하나를 내요 (digraph).  B: 자음군은 글자마다 제 소리를 내고 이어서 읽어요 (cluster) — 소리 하나를 따로 듣지 않아요'],
    groups: [{ id: 'a', titleKo: `A. ${DIGRAPH}`, unitIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'] }, { id: 'b', titleKo: `B. ${CLUSTER}`, unitIds: ['u8', 'u9', 'u10', 'u11'] }],
    units: [
      unit('u1', 'ck', 's-o-ck d-u-ck k-i-ck n-e-ck r-o-ck', { difficulty: 1, games: 'BTHL', kind: 'digraph' }),
      unit('u2', 'sh', 'sh-i-p sh-o-p f-i-sh d-i-sh sh-e-ll', { difficulty: 2, games: 'BTHL', kind: 'digraph' }),
      unit('u3', 'ch', 'ch-i-p ch-i-n ch-o-p l-u-n-ch ch-i-ck', { difficulty: 2, games: 'BTHL', kind: 'digraph' }),
      unit('u4', 'th', 'th-i-n th-i-ck m-o-th c-l-o-th t-e-n-th', { difficulty: 3, games: 'BTHL', kind: 'digraph', label: 'th (thin)', note: 'th /θ/' }),
      unit('u5', 'th:ð', 'th:ð-i-s th:ð-a-t th:ð-e-m th:ð-e-n w-i-th:ð', { difficulty: 3, games: 'BTHL', kind: 'digraph', label: 'th (this)', dialect: D_WITH, note: 'th /ð/' }),
      unit('u6', 'wh', 'wh-e-n wh-i-p wh-i-ch wh-i_e-t wh-a_e-l', { difficulty: 1, games: 'BTHL', kind: 'digraph', dialect: D_WH }),
      unit('u7', 'ng nk', 'r-i-ng k-i-ng s-o-ng w-i-ng i-nk p-i-nk', { difficulty: 2, games: 'BTHL', kind: 'digraph', note: 'ng /ŋ/는 소리 하나, nk /ŋk/는 소리 둘이라 풍선은 ng 단어로만 해요' }),
      unit('u8', '', 's-l-i_e-d f-l-a-g c-l-a-p p-l-u-m g-l-o_e-b b-l-a-ck', { difficulty: 3, games: 'THL', kind: 'cluster', labels: ['bl', 'cl', 'fl', 'gl', 'pl', 'sl'], note: 'l 자음군' }),
      unit('u9', '', 'd-r-e-ss g-r-a_e-p-s d-r-u-m f-r-o-g c-r-a-b b-r-i-ck t-r-u-ck', { difficulty: 3, games: 'THL', kind: 'cluster', labels: ['br', 'cr', 'dr', 'fr', 'gr', 'tr'], dialect: D_TRDR, note: 'r 자음군' }),
      unit('u10', '', 'd-e-s-k s-t-o-p s-p-o-t s-n-a-p s-w-i-m s-m-e-ll s-k-i-p', { difficulty: 2, games: 'THL', kind: 'cluster', labels: ['st', 'sp', 'sn', 'sm', 'sk', 'sw'], note: 's 자음군' }),
      unit('u11', '', 'm-i-l-k h-a-n-d t-e-n-t l-a-m-p n-e-s-t', { difficulty: 2, games: 'THL', kind: 'cluster', labels: ['nd', 'nt', 'mp', 'st', 'lk'], note: '끝 자음군' }),
    ],
  },
  {
    id: 'b5', no: 5, titleEn: 'Vowel Teams', titleKo: '모음 조합 및 확장 음가', focus: 'sound-letter', notes: [],
    reviewNote: '같은 철자, 다른 소리 — ow: snow/cow · oo: moon/book · ea: sea/bread · ou: cloud/soup',
    units: [
      unit('u1', 'ai ay', 't-r-ai-n r-ai-n s-n-ai-l d-ay p-l-ay', { difficulty: 2, games: 'BTHL' }),
      unit('u2', 'ee ea', 's-w-ee-t p-ea-ch g-r-ee-n t-r-ee s-ea l-ea-f', { difficulty: 2, games: 'BTHL', note: 'e_e(these, Pete)는 드물어 예외로만 소개' }),
      unit('u3', 'oa ow', 'b-oa-t c-oa-t r-oa-d s-n-ow g-r-ow', { difficulty: 2, games: 'BTHL', label: 'oa · ow (snow)', dialect: D_OE }),
      unit('u4', 'ow:aʊ ou', 'c-ow:aʊ t-ow:aʊ-n b-r-ow:aʊ-n l-ou-d c-l-ou-d', { difficulty: 2, games: 'BTHL', label: 'ow (cow) · ou (cloud)' }),
      unit('u5', 'oi oy', 'c-oi-n oi-l b-oi-l b-oy t-oy', { difficulty: 2, games: 'BTHL' }),
      unit('u6', 'igh', 'n-igh-t l-igh-t h-igh r-igh-t f-igh-t', { difficulty: 2, games: 'BTHL' }),
      unit('u7', 'oo ou:uː', 'm-oo-n s-p-oo-n z-oo f-oo-d b-oo-t s-ou:uː-p g-r-ou:uː-p y-ou:uː', { difficulty: 3, games: 'BTHL', label: 'oo (moon) · ou (soup)', note: 'oo /uː/ (+ ou /uː/ 예외 철자: soup, group, you)' }),
      unit('u8', 'oo:ʊ', 'b-oo:ʊ-k f-oo:ʊ-t c-oo:ʊ-k g-oo:ʊ-d w-oo:ʊ-d', { difficulty: 3, games: 'BTHL', label: 'oo (book)', dialect: D_BOOK }),
      unit('u9', 'ar', 'c-ar s-c-ar-f s-t-ar p-ar-k f-ar-m', { difficulty: 2, games: 'BTHL', dialect: D_R }),
      unit('u10', 'or', 'f-or-k h-or-n c-or-n s-t-or-m sh-or-t', { difficulty: 2, games: 'BTHL', dialect: D_R }),
      unit('u11', 'er ir ur', 'sh-ir-t s-k-ir-t b-ir-d t-ur-n h-er', { difficulty: 3, games: 'BTHL', dialect: D_R }),
      unit('u12', 'er:ə', 'b-u-tt-er:ə p-e-pp-er:ə j-u-m-p-er:ə r-u-bb-er:ə w-i-n-t-er:ə', { difficulty: 2, games: 'THL', note: '끝 -er /ə/', dialect: D_R }),
      unit('u13', 'air ear:eə', 'ch-air p-ear:eə h-air p-air s-t-air', { difficulty: 2, games: 'BTHL', dialect: `${D_R}. ${D_PEAR}. ${D_AIR}` }),
      unit('u14', 'ea:e', 'b-r-ea:e-d h-ea:e-d th-r-ea:e-d s-p-r-ea:e-d b-r-ea:e-th', { difficulty: 3, games: 'BTHL', label: 'ea (bread)', note: 'ea /e/ — 같은 철자 ea의 또 다른 소리' }),
    ],
  },
]

export const bookById = (id) => BOOKS.find((b) => b.id === id) || null

// every unit's own recordable targets (digraph/vowel/consonant sounds); doubles, qu/x (/kw/ /ks/), nk (/ŋk/) and clusters need no recording
export const recordableTargets = (u) => (u.kind === 'doubles' ? [] : u.targets.filter((x) => !NO_RECORDING.has(x.ipa)))

export const unitLabel = (u) => u.label || (u.labels && u.labels.length ? u.labels : [...u.targets, ...u.aux.map(parseAux)]).map((x) => (typeof x === 'string' ? x : x.grapheme)).join(' · ')
function parseAux(p) { const [grapheme, ipa] = p.split('|'); return { pair: p, grapheme, ipa } }

export const OBJECTIVE_KO = {
  contrast: '소리 구별 복습', cluster: '자음군을 이어서 읽기', digraph: '글자 둘이 내는 소리 하나 익히기',
  b1: '단어 속 모음 소리 알아듣기', b2: '글자와 소리 짝 짓기', b3: 'silent-e로 장모음 읽기', b5: '같은 소리의 다른 철자 익히기',
}
export function objectiveKo(book, u) {
  if (u.kind === 'contrast' || u.kind === 'cluster' || u.kind === 'digraph') return OBJECTIVE_KO[u.kind]
  return OBJECTIVE_KO[book.id] || OBJECTIVE_KO.b2
}

// "Book 1 전체 + Book 2 Unit 1–3" — everything earlier in book order, then unit order
export function prereqKo(bookId, unitId) {
  const bi = BOOKS.findIndex((b) => b.id === bookId)
  if (bi < 0) return ''
  const k = BOOKS[bi].units.findIndex((u) => u.id === unitId)
  if (k < 0) return ''
  const parts = []
  if (bi === 1) parts.push('Book 1 전체')
  else if (bi > 1) parts.push(`Book 1–${bi} 전체`)
  if (k === 1) parts.push(`Book ${bi + 1} Unit 1`)
  else if (k > 1) parts.push(`Book ${bi + 1} Unit 1–${k}`)
  return parts.length ? parts.join(' + ') : '없음'
}

// The review node ("Book 전체 연습"): targets = every target of the book; the book's review note (if any) is its note line.
export const reviewUnit = (book) => ({ id: 'review', status: 'draft', targets: book.units.flatMap((u) => u.targets), aux: [], words: [], games: [...new Set(book.units.flatMap((u) => u.games.split('')))].join(''), review: true, ...(book.reviewNote ? { note: book.reviewNote } : {}) })

// includeDraft false = approved units only (none exist yet, so the list is empty for every book).
export function unitsOf(bookId, { includeDraft = false } = {}) {
  const b = bookById(bookId)
  return b ? b.units.filter((u) => includeDraft || u.status === 'approved') : []
}
