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
const CHUNK_MIN = 3
const CHUNK_MAX = 10
// 우측으로 흡수하는 보어 전치사 — of/for 연쇄("invitation of the government",
// "independence of Korea")만. in/at/on은 흡수하지 않아 장소/시간 꼬리
// ("in Tapgol Park")가 chunk에 붙지 않는다(2026-08-09 품질 규칙 5).
const RIGHT_COMPLEMENT_PREPS = new Set(['of', 'for'])

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
  // 어색한 전치사 시작 방지(품질 규칙 4): 전치사로 시작하되 바로 뒤가
  // 관사가 아니면("for Korean …") 관용 전치사구가 아니므로 좌측 내용어를
  // 하나 더 포함해 자연스러운 구를 만든다("shouting for Korean independence",
  // "fight for Korean independence"). "at the invitation of…"처럼
  // 전치사+관사로 시작하는 관용 표현은 그대로 허용.
  if (lo > 0 && PREPS.has(coreOf(tokens[lo].text)) && !DETS.has(coreOf(tokens[lo + 1]?.text))) {
    lo--
  }

  // RIGHT: ①target 직후 명사 연쇄 ②of/for/in… 전치사구 보어 체인 —
  // 접속사/서술부/문장부호에서 정지, 총 CHUNK_MAX 단어 이내.
  const endsClause = (t) => /[.!?,;:]$/.test(t)
  while (hi + 1 < tokens.length && (hi - lo + 1) < CHUNK_MAX) {
    if (endsClause(tokens[hi].text)) break
    const c = coreOf(tokens[hi + 1].text)
    if (STOP_RIGHT.has(c)) break
    if (PREPS.has(c)) {
      // of/for 보어 연쇄만 흡수 — in/at/on 등 장소·시간 전치사구는 학습
      // 포인트가 아니므로 chunk에 붙이지 않는다(품질 규칙 5).
      if (!RIGHT_COMPLEMENT_PREPS.has(c)) break
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

// ── chunkQualityGrade(2026-08-09 운영자 지시 — 핵심 표현 품질 등급) ─────────
// chunkQualityGrade(targetWord, chunk, sourceSentence) → 'HIGH'|'MEDIUM'|'LOW'
//
// 왜 별도 함수인가: practiceQualityScore(0~3)는 대표 예문 "랭킹"용 수치라
// representativeExample.js가 이미 소비 중 — 그 계약을 건드리지 않고, 관리자
// 화면의 "이 chunk를 자동 승인해도 되는가" 판단용 등급을 분리했다. 두 함수
// 모두 같은 validatePracticeSentence(target 포함 + 원문 substring)를 전제로
// 쓰므로 서로 모순되지 않는다(HIGH가 되는 3~8단어 구간은 점수 3의 4~10단어
// 구간에 포함 — 등급이 랭킹을 뒤집는 경우 없음).
//
// 결정적 점수 합산 기준(경계값 명시 — 전부 이 파일의 기존 어휘 집합 재사용):
//   [전제 — 실패 시 즉시 LOW]
//     · chunk 비어있지 않음 + target whole-word 포함
//     · sourceSentence 전달 시 원문 exact substring(새 문장/의역은 무조건 LOW)
//   [가점]
//     · 단어 수 3~8: +2 / 9~10: +1 / 그 외(<3 또는 >10): -1
//     · collocation 완결 +1(최대 1회): "전치사+관사" 관용 시작("at the …")
//       또는 chunk 중간의 of/for 보어 연쇄 — 단, chunk 끝이 내용어일 때만
//       (끝이 함수어면 보어가 미완결이므로 가점 없음)
//   [감점]
//     · bare 전치사 시작(전치사 뒤가 관사 아님, "for Korean …"): -1
//     · 접속사 시작(and/but/so/because …): -1
//     · 절 경계 불량 — 끝 단어가 전치사/관사/접속사: -3
//     · 장소/인명 — 함수어 아닌 대문자 시작 토큰 2연속 이상("Tapgol Park",
//       "Dr. Schofield"): -3 (단일 대문자 토큰("Korean")은 감점 없음 —
//       국적 형용사가 교과서 chunk에 흔해 오탐이 되기 때문)
//     · 날짜 — 연도(1000~2099) 또는 월 이름 포함: -3
//   [등급 경계] 합계 ≥2 → HIGH / 0~1 → MEDIUM / <0 → LOW
//
// LOW는 자동 승인 금지(운영자 지시) — UI(TextImportPanel)는 프리필은 하되
// 경고 배지로 관리자 검토를 유도한다. 이 함수는 순수(부수효과 0)다.
const CONJS = new Set(['and', 'but', 'so', 'because', 'or', 'although', 'that', 'which', 'who', 'when', 'while'])
const MONTHS = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])
const YEAR_RE = /\b(1[0-9]{3}|20[0-9]{2})\b/

export function chunkQualityGrade(targetWord, chunk, sourceSentence) {
  const s = String(chunk || '').trim()
  // 전제: target 포함 + (sourceSentence 전달 시) 원문 substring —
  // validatePracticeSentence 재사용(검증 로직 단일 원본, 재구현 없음).
  if (!validatePracticeSentence(targetWord, s, sourceSentence).ok) return 'LOW'

  const words = s.split(/\s+/).filter(Boolean)
  const cores = words.map(coreOf)
  const isFn = (c) => DETS.has(c) || PREPS.has(c) || CONJS.has(c)
  let score = 0

  // 단어 수: 3~8 우선 / ≤10 양호 / 그 외 감점
  const wc = words.length
  if (wc >= 3 && wc <= 8) score += 2
  else if (wc >= 9 && wc <= 10) score += 1
  else score -= 1

  // 절 경계 품질: 끝이 함수어면 미완결 절단("at the invitation of") — 강감점.
  const endsClean = !isFn(cores[cores.length - 1])
  if (!endsClean) score -= 3

  // 자연스러움: bare 전치사 시작 / 접속사 시작 감점.
  if (PREPS.has(cores[0]) && !DETS.has(cores[1])) score -= 1
  if (CONJS.has(cores[0])) score -= 1

  // collocation 완결 가점 — 끝이 내용어일 때만(미완결이면 완결 가점과 모순).
  // bare 전치사 시작의 of/for(cores[0])는 시작 감점 대상이지 완결 가점이
  // 아니므로 i>0만 본다.
  if (endsClean) {
    const prepArticleStart = PREPS.has(cores[0]) && DETS.has(cores[1])
    const midComplement = cores.some((c, i) => i > 0 && RIGHT_COMPLEMENT_PREPS.has(c))
    if (prepArticleStart || midComplement) score += 1
  }

  // 장소/인명: 함수어 아닌 대문자 토큰 2연속("Tapgol Park", "Dr. Schofield").
  let run = 0
  let properRun = false
  words.forEach((w, i) => {
    const properLike = /^[A-Z]/.test(w) && cores[i] !== '' && !isFn(cores[i])
    run = properLike ? run + 1 : 0
    if (run >= 2) properRun = true
  })
  if (properRun) score -= 3

  // 날짜: 연도/월 이름 — 학습 포인트가 아닌 시점 정보라 chunk 부적합.
  if (YEAR_RE.test(s)) score -= 3
  if (cores.some((c) => MONTHS.has(c))) score -= 3

  if (score >= 2) return 'HIGH'
  if (score >= 0) return 'MEDIUM'
  return 'LOW'
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
