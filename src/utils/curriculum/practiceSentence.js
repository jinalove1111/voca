// src/utils/curriculum/practiceSentence.js — 학생용 짧은 연습 예문(순수 모델)
//
// import 0개 순수 모듈(curriculumModel.js 관례). 2026-08-09 운영자 지시:
// source(본문 원문, 절대 무수정)와 practice(학생 연습용 짧은 문장)를 분리.
//
// 2026-08-09 정책 전환(운영자 지시 — 이 파일의 유일한 전략):
//   본문 핵심 표현 = 교과서 source_sentence에서 target word가 든 핵심
//   chunk를 **그대로 잘라낸 것**(extractKeyChunk). 새 문장 생성/paraphrase/
//   단어 추가·변형/단어 자산 문장 전면 금지 — 학생이 어차피 외울 본문을
//   단어 단계에서 짧게 미리 보게 하는 것이 목적이다.
//   추출 실패 시 null — UI가 빈칸+직접 입력(본문 substring 검증)으로 안내.
// 관리자는 언제든 chunk 경계를 수정할 수 있다(단, 본문 substring이어야 저장).

const WORD_LIMIT_WARN = 10   // 초과 시 경고(운영자 지시: 기본 4~10단어 chunk)

export function countWords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsTargetWholeWord(sentence, target) {
  const tokens = String(target || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  const pattern = tokens.map(escapeRegex).join('\\s+')
  return new RegExp(`\\b${pattern}\\b`, 'i').test(String(sentence || ''))
}

// validatePracticeSentence(targetWord, sentence, sourceSentence?)
// → { ok, wordCount, warnings: string[] }
//   ok=false: 비어있거나 대상 단어 미포함, 또는(sourceSentence 전달 시)
//   본문의 부분 문자열이 아님 — 새 문장/paraphrase 저장 차단(2026-08-09
//   정책: 본문 핵심 표현은 반드시 원문에서 그대로 잘라야 한다).
//   warnings: 10단어 초과 등 — 저장은 가능하되 관리자 확인 유도.
export function validatePracticeSentence(targetWord, sentence, sourceSentence) {
  const s = String(sentence || '').trim()
  const warnings = []
  if (!s) return { ok: false, wordCount: 0, warnings: ['본문 핵심 표현이 비어 있어요.'] }
  if (!containsTargetWholeWord(s, targetWord)) {
    return { ok: false, wordCount: countWords(s), warnings: [`핵심 표현에 대상 단어(${targetWord})가 온전한 형태로 포함돼야 해요.`] }
  }
  if (sourceSentence !== undefined && !String(sourceSentence || '').includes(s)) {
    return { ok: false, wordCount: countWords(s), warnings: ['본문에 없는 문장이에요 — 핵심 표현은 본문에서 그대로 잘라야 해요(새 문장/의역 금지).'] }
  }
  const wc = countWords(s)
  if (wc > WORD_LIMIT_WARN) warnings.push(`⚠ ${wc}단어 — 4~10단어의 짧은 본문 chunk를 권장해요.`)
  return { ok: true, wordCount: wc, warnings }
}

// ── 본문 핵심 표현 추출(2026-08-09 정책 전환 — 운영자 지시) ────────────────
// 목적 변경: 연습 문장을 "생성"하지 않는다. 학생이 어차피 외워야 하는
// 교과서 본문에서 target word가 든 핵심 chunk를 **그대로 잘라** 미리 보게
// 한다. 절대 규칙: 새 문장 생성/paraphrase/단어 추가·변형 전면 금지.
// 반환 chunk는 원문 오프셋 슬라이싱이라 `source.includes(chunk) === true`가
// 구조적으로 보장된다(끝 문장부호 제거만 예외 — 제거해도 substring 유지).
// 기본 4~10단어, collocation/전치사구는 끊지 않고, 짧은 문장(≤10단어)은
// 전체 문장을 그대로 쓴다.
const DETS = new Set(['the', 'a', 'an', 'his', 'her', 'their', 'its', 'this', 'that', 'these', 'those', 'my', 'our', 'your'])
const PREPS = new Set(['at', 'in', 'on', 'for', 'of', 'to', 'by', 'with', 'from', 'about', 'after', 'before', 'during', 'under', 'over', 'into'])
const STOP_RIGHT = new Set([
  'and', 'but', 'so', 'because', 'that', 'which', 'who', 'when', 'while', 'or', 'although',
  // 서술부 진입 차단(최소 목록) — target 직후 명사 연쇄(independence
  // movement)는 잇되 동사/조동사로는 넘어가지 않는다.
  'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', "didn't", "don't", "doesn't",
  'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'must', 'never', 'not', 'also',
])
const CHUNK_MIN = 4
const CHUNK_MAX = 10

// 토큰화(원문 오프셋 보존) — 슬라이싱이 항상 원문 부분 문자열이 되게 한다.
function tokenize(src) {
  const tokens = []
  const re = /\S+/g
  let m
  while ((m = re.exec(src)) !== null) tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  return tokens
}
const coreOf = (t) => String(t || '').toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
const isCapModifier = (t, idx) => idx > 0 && /^[A-Z]/.test(t) // 문장 첫 단어 제외, 대문자 시작 = 수식어로 간주

// extractKeyChunk(sourceSentence, targetWord) → chunk 문자열 | null
export function extractKeyChunk(sourceSentence, targetWord) {
  const src = String(sourceSentence || '')
  if (!src.trim() || !containsTargetWholeWord(src, targetWord)) return null
  const tokens = tokenize(src)
  const targetTokens = String(targetWord).trim().toLowerCase().split(/\s+/)

  // 짧은 문장은 전체 사용(규칙 9).
  if (tokens.length <= CHUNK_MAX) return src.trim()

  // target 위치(첫 whole-word 등장, 다단어 target은 연속 일치).
  let ti = -1
  for (let i = 0; i + targetTokens.length <= tokens.length; i++) {
    if (targetTokens.every((tt, k) => coreOf(tokens[i + k].text) === tt)) { ti = i; break }
  }
  if (ti === -1) return null
  let lo = ti
  let hi = ti + targetTokens.length - 1

  // LEFT: 관사/소유격/대문자 수식어 체인을 지나 전치사가 나오면 포함.
  while (lo > 0) {
    const c = coreOf(tokens[lo - 1].text)
    if (DETS.has(c) || isCapModifier(tokens[lo - 1].text, lo - 1)) { lo--; continue }
    if (PREPS.has(c)) { lo--; break }
    break
  }

  // RIGHT: ①target 직후 명사 연쇄 ②of/for/in… 전치사구 보어 체인 —
  // 접속사/서술부/문장부호에서 정지, 총 CHUNK_MAX 단어 이내.
  const endsClause = (t) => /[.!?,;:]$/.test(t)
  while (hi + 1 < tokens.length && (hi - lo + 1) < CHUNK_MAX) {
    if (endsClause(tokens[hi].text)) break
    const c = coreOf(tokens[hi + 1].text)
    if (STOP_RIGHT.has(c)) break
    if (PREPS.has(c)) {
      // 전치사구 시작 — 보어(관사/수식어/명사)를 흡수, 다음 전치사/정지어 전까지.
      let k = hi + 2
      while (k < tokens.length && (k - lo + 1) <= CHUNK_MAX) {
        const kc = coreOf(tokens[k].text)
        if (STOP_RIGHT.has(kc) || PREPS.has(kc)) break
        k++
        if (endsClause(tokens[k - 1].text)) break
      }
      if (k > hi + 2) { hi = k - 1; continue }
      break
    }
    hi++ // 명사 연쇄 계속(예: independence movement)
  }

  // 최소 4단어 미달이면 좌측으로 확장(예: "fight for Korean independence").
  while ((hi - lo + 1) < CHUNK_MIN && lo > 0) lo--

  let chunk = src.slice(tokens[lo].start, tokens[hi].end)
  chunk = chunk.replace(/[.!?,;:]+$/, '') // 끝 문장부호만 제거(substring 유지)
  if (!containsTargetWholeWord(chunk, targetWord)) return null
  return chunk
}

// practiceQualityScore(targetWord, practiceSentence) → 0..3
// 대표 연습 예문 선정용 품질 점수(2026-08-09 운영자 지시 — 같은 단어의 여러
// 예문 중 학생에게 보여줄 1개를 고르는 기준의 수치화):
//   0 = 핵심 표현 없음/무효(target 미포함 등) — 대표 후보 아님
//   1 = 유효하지만 김(>12단어)
//   2 = 유효 + 11~12단어
//   3 = 유효 + 4~10단어(정책 기본 구간 — 최우선)
export function practiceQualityScore(targetWord, practiceSentence) {
  const s = String(practiceSentence || '').trim()
  if (!s) return 0
  const v = validatePracticeSentence(targetWord, s)
  if (!v.ok) return 0
  if (v.wordCount >= 4 && v.wordCount <= 10) return 3
  if (v.wordCount <= 12) return 2
  return 1
}

// suggestPracticeSentence({ targetWord, sourceSentence })
// → { sentence, origin: 'source_chunk' } | null
// 2026-08-09 정책 전환: 제안은 **본문 chunk 추출만** — 단어 자산 등 본문에
// 없는 문장은 어떤 경우에도 제안하지 않는다(새 문장 금지). assetExample
// 인자는 하위 호환으로 받되 완전히 무시한다.
export function suggestPracticeSentence({ targetWord, sourceSentence } = {}) {
  const chunk = extractKeyChunk(sourceSentence, targetWord)
  if (chunk) return { sentence: chunk, origin: 'source_chunk' }
  return null
}
