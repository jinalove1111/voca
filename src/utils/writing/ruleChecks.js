// src/utils/writing/ruleChecks.js — Writing Coach 로컬 규칙 기반 검사기 (순수 모듈).
//
// import는 같은 폴더의 errorTaxonomy.js 하나뿐(명시적 .js 확장자 —
// curriculumModel.js 관례). React/Supabase/네트워크/AI 호출 전부 0 —
// scripts/testWritingCoach.mjs가 플레인 Node로 직접 import한다.
//
// 설계 근거(docs/WRITING_COACH.md §5 참고):
//   · 비용 아키텍처 1단계 — AI를 전혀 부르지 않고 브라우저 로컬에서 즉시
//     검사한다(운영자 원칙: 유료 API 전에 무료 대안 먼저, CLAUDE.md 규칙 7).
//   · 오탐 최소화가 최우선 불변식이다 — "확실할 때만 발화, 불확실하면 침묵".
//     초등학생에게 틀리지 않은 곳을 틀렸다고 말하는 순간 코치에 대한 신뢰가
//     깨진다. 그래서 모든 규칙이 넓은 문법 규칙이 아니라 좁은 소사전 +
//     명시적 예외 목록으로만 동작한다(예: school/home/work/bed는 무관사
//     관용이므로 관사 규칙에서 아예 제외).
//   · 정답은 여기서도 만들지 않는다 — 힌트는 taxonomy의 hintTemplate이
//     생성하는 "위치 가리키기" 문구뿐. suggestCorrection()은 3회 시도 후
//     "정답 공개" 단계 전용이며, 세션 상태 머신(writingSession.js)이
//     revealAllowed를 판정한 뒤에만 화면에 노출된다.

import { errorTypeByCode } from './errorTaxonomy.js'

// ── 소사전들 ────────────────────────────────────────────────────────────────

// 현재형(원형/be/have) → 과거형 매핑. 두 용도:
//   1) 시제 규칙의 "현재형 동사 존재" 감지(키 목록이 감지 대상)
//   2) suggestCorrection의 "정답 공개" 단계 교정(값이 교정 결과)
// read처럼 과거형 철자가 같은 동사는 애초에 넣지 않는다 — 감지 자체가
// 불가능하고(went/goed 같은 신호가 없음) 오탐만 만든다.
export const PAST_TENSE_MAP = {
  go: 'went', come: 'came', see: 'saw', eat: 'ate', do: 'did',
  is: 'was', are: 'were', am: 'was', have: 'had', has: 'had',
  get: 'got', make: 'made', take: 'took', buy: 'bought', run: 'ran',
  write: 'wrote', meet: 'met', give: 'gave', find: 'found', say: 'said',
  tell: 'told', know: 'knew', drink: 'drank', sleep: 'slept', swim: 'swam',
  sing: 'sang', play: 'played', study: 'studied', watch: 'watched',
  visit: 'visited', want: 'wanted', like: 'liked', learn: 'learned',
}

// 3인칭 단수 현재 매핑 — SVA 규칙 감지(키) + 정답 공개 교정(값).
export const THIRD_PERSON_MAP = {
  go: 'goes', come: 'comes', eat: 'eats', like: 'likes', want: 'wants',
  play: 'plays', watch: 'watches', study: 'studies', have: 'has', do: 'does',
  see: 'sees', run: 'runs', live: 'lives', work: 'works', sleep: 'sleeps',
  drink: 'drinks', make: 'makes', take: 'takes', get: 'gets', say: 'says',
  know: 'knows', swim: 'swims', sing: 'sings', read: 'reads',
}

// 관사 규칙 대상 명사 — "전치사 + 무관사 단수"가 거의 확실히 틀린 것만.
// ⚠️ school/home/work/bed/church는 절대 넣지 않는다("go to school"은 관용
// 무관사가 표준) — 이 예외를 지키는 것이 이 규칙의 오탐 방어 핵심이다.
export const ARTICLE_NOUNS = [
  'park', 'store', 'library', 'museum', 'zoo', 'bank', 'airport',
  'station', 'hospital', 'restaurant', 'beach', 'playground', 'market',
  'gym', 'pool', 'cinema', 'bakery', 'farm',
]

// 관용 무관사 명사 — 테스트가 "규칙 대상에 절대 없음"을 단언하는 명시적
// 목록(문서화 겸용). ARTICLE_NOUNS에 실수로 추가되는 회귀를 막는다.
export const NO_ARTICLE_IDIOM_NOUNS = ['school', 'home', 'work', 'bed', 'church']

// 과거 시간 표현 — 시제 규칙의 전제 조건. 이 표현이 문장에 없으면 시제
// 규칙은 아예 침묵한다(현재형 문장은 아무 문제 없으므로).
const TIME_MARKER_RE =
  /\byesterday\b|\blast\s+(?:week|weekend|night|year|month|summer|winter|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\bago\b/i

// 시제/SVA 감지에서 "직전 단어가 이것이면 침묵"하는 목록 — 원형이 문법상
// 옳은 자리들. 예: "I wanted to go home yesterday."의 go(부정사),
// "I didn't go ... yesterday."의 go(조동사 뒤 원형)는 전부 정상이다.
const BASE_FORM_ALLOWED_BEFORE = new Set([
  'to', 'did', "didn't", 'do', "don't", 'does', "doesn't", 'not',
  'will', "won't", 'would', 'can', "can't", 'could', 'should', 'shall',
  'must', 'may', 'might', "let's",
])

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// match 시작 위치 바로 앞의 단어(어파스트로피 포함) — 소문자로 반환.
function wordBefore(sentence, index) {
  const m = sentence.slice(0, index).match(/([A-Za-z']+)\s+$/)
  return m ? m[1].toLowerCase() : null
}

// whole-word(대소문자 무관) 포함 여부 — curriculumModel.js와 같은 \b 관례.
function containsWholeWord(sentence, word) {
  if (!sentence || !word) return false
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(sentence)
}

function makeHint(code, ctx) {
  const t = errorTypeByCode(code)
  return t ? t.hintTemplate(ctx) : ''
}

// ── 메인 검사기 ─────────────────────────────────────────────────────────────
//
// 반환: { errors, usedTargetWords }
//   errors: [{ type, span: {start,end}|null, hint, meta }]
//     · meta는 suggestCorrection 전용 내부 정보(교정 방법) — UI는 type/span/
//       hint만 쓴다.
//   usedTargetWords: [{ word, used }] — targetWords 각각의 whole-word 포함
//     여부. "오류"로 취급하지 않고 별도 필드로 돌려주는 이유: 단어 미사용은
//     문법 오류가 아니라 과제 조건이라, 세션 상태 머신/기록에서 다른 축으로
//     다뤄야 한다(errors에 섞으면 completed 판정과 오류 통계가 오염된다).
export function runRuleChecks(sentence, { targetWords = [] } = {}) {
  const text = typeof sentence === 'string' ? sentence : ''
  const errors = []
  const usedTargetWords = targetWords.map((word) => ({
    word,
    used: containsWholeWord(text, word),
  }))
  const trimmed = text.trim()
  if (!trimmed) return { errors, usedTargetWords }

  // 1) 시제 — 과거 시간 표현 + 소사전 현재형 동사(직전 단어 예외 통과)일
  //    때만 발화. 시간 표현 텍스트를 힌트에 넣는다("yesterday가 있으니 …").
  const timeMatch = text.match(TIME_MARKER_RE)
  const tenseSpans = [] // SVA 억제용(아래 6번 주석 참고)
  if (timeMatch) {
    const timeWord = timeMatch[0]
    const verbAlt = Object.keys(PAST_TENSE_MAP).join('|')
    const verbRe = new RegExp(`\\b(${verbAlt})\\b`, 'gi')
    for (const m of text.matchAll(verbRe)) {
      const prev = wordBefore(text, m.index)
      if (prev && BASE_FORM_ALLOWED_BEFORE.has(prev)) continue
      const span = { start: m.index, end: m.index + m[0].length }
      tenseSpans.push(span)
      errors.push({
        type: 'tense',
        span,
        hint: makeHint('tense', { timeWord }),
        meta: { fix: 'past_tense', word: m[0], replacement: PAST_TENSE_MAP[m[0].toLowerCase()] },
      })
    }
  }

  // 2) 관사 — 전치사(to/at/in/on) 바로 뒤에 무관사 단수 가산명사 소사전이
  //    올 때만. "to the park"/"to my park"는 명사가 전치사 바로 뒤가
  //    아니므로 매치 자체가 안 된다(관사·소유격이 이미 있으면 침묵).
  {
    const nounAlt = ARTICLE_NOUNS.join('|')
    const artRe = new RegExp(`\\b(to|at|in|on)\\s+(${nounAlt})\\b`, 'gi')
    for (const m of text.matchAll(artRe)) {
      const noun = m[2]
      const nounStart = m.index + m[0].length - noun.length
      errors.push({
        type: 'article',
        span: { start: nounStart, end: nounStart + noun.length },
        hint: makeHint('article', { noun }),
        meta: { fix: 'insert_the', insertAt: nounStart },
      })
    }
  }

  // 3) 첫 글자 소문자 → punctuation(where:'start').
  //    첫 단어가 소문자 "i"면 이 규칙은 침묵한다 — 아래 5번(I 철자) 규칙이
  //    같은 자리를 더 정확한 힌트로 다루므로, 한 곳에 힌트 2개가 겹쳐
  //    학생을 혼란시키지 않게 한다.
  const firstAlphaIdx = text.search(/[A-Za-z]/)
  const startsWithLowerI = /^\s*i\b/.test(text)
  if (firstAlphaIdx >= 0 && /[a-z]/.test(text[firstAlphaIdx]) && !startsWithLowerI) {
    errors.push({
      type: 'punctuation',
      span: { start: firstAlphaIdx, end: firstAlphaIdx + 1 },
      hint: makeHint('punctuation', { where: 'start' }),
      meta: { fix: 'capitalize_first', index: firstAlphaIdx },
    })
  }

  // 4) 끝 문장부호 없음 → punctuation(where:'end'). span은 "빠진 것"이라
  //    가리킬 범위가 없으므로 null.
  if (!/[.!?]$/.test(trimmed)) {
    errors.push({
      type: 'punctuation',
      span: null,
      hint: makeHint('punctuation', { where: 'end' }),
      meta: { fix: 'add_period' },
    })
  }

  // 5) 소문자 "i" 단독 사용 → spelling. 대소문자 구분 매치(\b 덕분에 it/in
  //    안의 i는 안 잡히고, i'm의 i는 잡힌다 — 둘 다 의도한 동작).
  for (const m of text.matchAll(/\bi\b/g)) {
    errors.push({
      type: 'spelling',
      span: { start: m.index, end: m.index + 1 },
      hint: makeHint('spelling', { word: 'i' }),
      meta: { fix: 'capitalize_i', index: m.index },
    })
  }

  // 6) 3인칭 단수 — He/She/It + 소사전 원형 동사가 "바로 인접"할 때만
  //    (사이에 조동사/부사가 끼면 매치 안 됨 — 오탐 방어). 단, 같은 동사에
  //    이미 시제 오류가 발화됐으면 침묵한다: "He go ... yesterday."의 옳은
  //    수정은 goes가 아니라 went라서, SVA 힌트가 학생을 반대 방향으로
  //    이끌기 때문이다.
  {
    const svaAlt = Object.keys(THIRD_PERSON_MAP).join('|')
    const svaRe = new RegExp(`\\b(he|she|it)\\s+(${svaAlt})\\b`, 'gi')
    for (const m of text.matchAll(svaRe)) {
      const verb = m[2]
      const verbStart = m.index + m[0].length - verb.length
      if (tenseSpans.some((s) => s.start === verbStart)) continue
      errors.push({
        type: 'subject_verb_agreement',
        span: { start: verbStart, end: verbStart + verb.length },
        hint: makeHint('subject_verb_agreement', { subject: m[1] }),
        meta: { fix: 'third_person', word: verb, replacement: THIRD_PERSON_MAP[verb.toLowerCase()] },
      })
    }
  }

  return { errors, usedTargetWords }
}

// ── 정답 공개용 교정 ────────────────────────────────────────────────────────
//
// 3회 시도 후 "정답 보기" 단계 전용(writingSession.js가 revealAllowed일 때만
// 호출/노출). 사전 기반으로 확실히 고칠 수 있는 오류만 다룬다.
//
// 전부-또는-null 정책: errors 중 하나라도 교정 방법(meta.fix)을 모르면 null을
// 반환한다 — "정답"이라고 보여준 문장에 오류가 남아 있으면 학생이 그걸
// 정답으로 학습해버리는 최악의 결과가 되므로, 반쪽 교정은 아예 안 보여주는
// 쪽이 안전하다(불확실하면 침묵 원칙의 연장).
export function suggestCorrection(sentence, errors) {
  if (typeof sentence !== 'string' || !sentence.trim()) return null
  if (!Array.isArray(errors) || errors.length === 0) return null

  const ops = []
  for (const err of errors) {
    const meta = err.meta || {}
    if (meta.fix === 'past_tense' || meta.fix === 'third_person') {
      if (!meta.replacement || !err.span) return null
      ops.push({ pos: err.span.start, run: (s) => replaceRange(s, err.span, meta.word, meta.replacement) })
    } else if (meta.fix === 'insert_the') {
      ops.push({ pos: meta.insertAt, run: (s) => s.slice(0, meta.insertAt) + 'the ' + s.slice(meta.insertAt) })
    } else if (meta.fix === 'capitalize_first') {
      ops.push({ pos: meta.index, run: (s) => s.slice(0, meta.index) + s[meta.index].toUpperCase() + s.slice(meta.index + 1) })
    } else if (meta.fix === 'capitalize_i') {
      ops.push({ pos: meta.index, run: (s) => s.slice(0, meta.index) + 'I' + s.slice(meta.index + 1) })
    } else if (meta.fix === 'add_period') {
      // 끝에 붙이는 조작 — 위치 무한대로 두면 "뒤에서 앞으로" 정렬에서
      // 항상 제일 먼저 적용돼 다른 span 위치를 안 흔든다.
      ops.push({ pos: Infinity, run: (s) => s.trimEnd() + '.' })
    } else {
      return null // 교정 방법을 모르는 오류 유형 — 반쪽 정답 금지
    }
  }

  // 뒤에서 앞으로 적용 — 앞쪽 편집이 뒤쪽 span 인덱스를 밀어내는 문제를
  // 정렬만으로 해결(각 op는 원본 기준 위치를 갖고 있으므로).
  ops.sort((a, b) => b.pos - a.pos)
  let out = sentence
  for (const op of ops) out = op.run(out)
  return out
}

// span 범위를 replacement로 치환 — 원형이 대문자로 시작했으면(문장 첫 단어
// 등) 교정형도 첫 글자를 대문자로 유지한다.
function replaceRange(s, span, original, replacement) {
  const cap = /^[A-Z]/.test(original)
  const rep = cap ? replacement[0].toUpperCase() + replacement.slice(1) : replacement
  return s.slice(0, span.start) + rep + s.slice(span.end)
}
