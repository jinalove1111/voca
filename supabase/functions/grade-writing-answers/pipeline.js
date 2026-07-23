// supabase/functions/grade-writing-answers/pipeline.js
//
// 순수 로직 모듈 — Deno(Edge Function)와 Node(테스트 하네스) 양쪽에서 그대로
// import 가능하도록 외부 의존성 없이 작성한다(Node 내장 API도 안 씀 —
// 표준 JS만 사용). DB 접근/네트워크 호출/파일시스템은 전부 이 파일 밖에서
// 하고, 이 파일은 "입력 -> 판정" 계산만 담당한다.
//
// 재사용 원칙(헌법 규칙 3): 1~7단계(정규화/완전일치/인정 답안 매치)는
// src/utils/spelling.js의 isSpellingCorrect를 그대로 재사용한다 — 채점
// 엔진을 여기서 새로 발명하지 않는다. 이 큐 자체가 "이미 그 함수를 통과
// 못 한 답만 쌓인 곳"이라는 게 docs/operations/task2-writing-analysis.md
// §1-3의 핵심 발견이고, 그래서 이 함수가 재확인 삼아 다시 돌려도 대부분
// false가 나오는 게 정상이다(§10 표 참고).
import { isSpellingCorrect } from '../../../src/utils/spelling.js'

const HAS_HANGUL = /[ㄱ-ㅎ가-힣]/

// 1~5단계: 공백 trim, 중복 공백 축약, Unicode NFC, 흔한 문장부호 제거.
// 대소문자(3단계)는 isSpellingCorrect가 내부적으로 처리하므로 여기선 안 함.
// 주의: "~"는 절대 제거 안 함 — "aware of" -> "~을 인식하는"처럼 등록 뜻
// 자체에 의미 있는 접두로 쓰이는 경우가 실측 샘플에 있었다(분석 문서 §10
// 5단계 각주 — 오탐 방지).
export function normalizeForCompare(raw) {
  if (raw == null) return ''
  let s = String(raw).normalize('NFC')
  s = s.trim().replace(/\s+/g, ' ')
  s = s.replace(/^[.,!?"'“”‘’]+|[.,!?"'“”‘’]+$/g, '')
  return s.trim()
}

// 9단계: Damerau-Levenshtein(전치 포함) — 답안이 전부 10자 미만이라
// O(n*m)로 충분(성능 걱정 없음).
export function editDistance(a, b) {
  const s = String(a ?? '')
  const t = String(b ?? '')
  const n = s.length
  const m = t.length
  if (n === 0) return m
  if (m === 0) return n
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[n][m]
}

// 8단계 — 한국어 활용어미 보수적 제거(진짜 형태소 분석기 아님, 휴리스틱
// 어미 목록 1회 제거). spelling.js:38-40행과 같은 원칙 — 형태소 유연화는
// 그 자체로 자동 정답 처리하지 않고, "품사/활용형 차이일 수 있다"는 힌트만
// 만들어 AI 프롬프트에 실어 보낸다.
const KOREAN_ENDINGS = ['스러운', '적으로', '하다', '되다', '스럽다', '한', '된', '히', '음', '는', '은', '을', '다', '게']
export function stripKoreanEndings(raw) {
  let s = String(raw ?? '')
  for (const ending of KOREAN_ENDINGS) {
    if (s.length > ending.length && s.endsWith(ending)) {
      s = s.slice(0, -ending.length)
      break // 한 번만 — 과도한 축약(어간이 너무 짧아져 오탐) 방지
    }
  }
  return s
}

export function possiblePosVariant(normInput, normTarget) {
  if (!HAS_HANGUL.test(normInput) || !HAS_HANGUL.test(normTarget)) return false
  if (normInput === normTarget) return false
  const stemA = stripKoreanEndings(normInput)
  const stemB = stripKoreanEndings(normTarget)
  return stemA.length >= 2 && stemA === stemB
}

// 로컬(비AI) 판정 — accept만 확정적으로 반환하고, 그 외엔 항상 null(AI로
// 보냄)을 반환한다. reject_candidate/review는 절대 여기서 확정하지 않는다
// (설계 문서 §10: "명백히 틀렸다"는 의미 판단이라 편집거리만으로 안전하게
// 못 정한다 — §1-3 항목7 "살다"/"떠나다"처럼 편집거리는 가까워도 뜻이
// 반대인 사례가 실측에서 확인됨).
export function classifyLocally({ word, meaning, acceptedMeanings = [], submittedAnswer }) {
  // 1~5단계 정규화(공백/NFC/문장부호) 결과를 실제로 채점 엔진에 먹인다 —
  // isSpellingCorrect에 원본 그대로 넘기면 "완벽한." 같은 끝 마침표나 NFD로
  // 분해된 한글이 정규화 단계의 의미를 전혀 못 받는 버그가 된다(테스트로
  // 실측 확인 후 수정, 2026-07-23).
  const normAnswer = normalizeForCompare(submittedAnswer)
  const candidates = [meaning, ...(Array.isArray(acceptedMeanings) ? acceptedMeanings : [])]
    .filter((c) => c != null && String(c).trim() !== '')
  // 콤마/세미콜론으로 나뉜 대안까지 전부 펼친 목록 — 편집거리 비교와 품사
  // 힌트 계산 양쪽에서 재사용(하나로 통일해 "일어나다, 발생하다" 같은
  // 다중 대안 뜻에서도 각 대안별로 정확히 비교되게 한다).
  const allAlternatives = candidates.flatMap((c) => String(c).split(/[,;]/).map((x) => x.trim()).filter(Boolean))

  // 1~7단계: 기존 채점 엔진 재확인(정규화된 입력으로). 이 큐 자체가 이미
  // 이걸 통과 못 한 답만 모은 곳이라, 여기서 true가 나오는 건 (a) 이 함수의
  // 추가 정규화(문장부호/NFC)로 새로 잡히는 케이스이거나 (b) 그 사이
  // 관리자가 accepted_meanings를 추가해 이제는 맞게 된 경우.
  //
  // v1.1(2026-07-23): 등록 뜻(meaning) 자체와 일치한 경우(decisionSource
  // 'exact_match')와, 관리자가 나중에 추가한 accepted_meanings 목록의 항목과만
  // 일치한 경우('synonym')를 구분한다 — 관리자 UI가 "출처(rule|synonym|ai|
  // cache)"를 표시해야 해서(운영 UI 요구사항) 이 둘을 더 이상 뭉뚱그리지
  // 않는다. 두 번 비교하는 게 약간 비효율적이지만 항목당 문자열 몇 개
  // 비교라 성능에 영향 없다.
  if (isSpellingCorrect(normAnswer, meaning, { acceptedMeanings: [] })) {
    return {
      decision: 'accept',
      confidence: 1,
      reason: '정규화 후 등록된 뜻과 완전히 일치',
      decisionSource: 'exact_match',
    }
  }
  if (isSpellingCorrect(normAnswer, meaning, { acceptedMeanings })) {
    return {
      decision: 'accept',
      confidence: 1,
      reason: '정규화 후 관리자가 인정한 동의어 답안과 일치',
      decisionSource: 'synonym',
    }
  }

  // 9단계: 등록 뜻/인정 답안 각 대안과 편집거리 비교, 가장 가까운 것 채택.
  let bestDist = Infinity
  let bestCandidate = null
  for (const alt of allAlternatives) {
    const normAlt = normalizeForCompare(alt)
    const dist = HAS_HANGUL.test(normAlt)
      ? editDistance(normAnswer.replace(/\s+/g, ''), normAlt.replace(/\s+/g, ''))
      : editDistance(normAnswer.toLowerCase(), normAlt.toLowerCase())
    if (dist < bestDist) { bestDist = dist; bestCandidate = alt }
  }

  if (bestCandidate) {
    const compareLen = HAS_HANGUL.test(normalizeForCompare(bestCandidate))
      ? normAnswer.replace(/\s+/g, '').length
      : normAnswer.length
    // 보수적 임계값(분석 문서 위험 목록): 짧은 답에서 편집거리 1은 거의
    // 항상 단순 오타 — 자동 accept. 그 이상은 "가까워 보이지만 뜻이
    // 정반대일 수 있는" 위험이 있어 로컬에서 확정 안 하고 AI로 넘긴다.
    if (bestDist === 1 && compareLen >= 2) {
      return {
        decision: 'accept',
        confidence: 0.9,
        reason: `단순 오타로 추정(편집거리 1, "${bestCandidate}"와 비교)`,
        decisionSource: 'levenshtein',
      }
    }
  }

  const posHint = allAlternatives.some((alt) => possiblePosVariant(normAnswer, normalizeForCompare(alt)))
  return {
    decision: null, // 로컬 미해결 — 캐시 확인 후 AI로
    hint: {
      posWarning: posHint,
      closestCandidate: bestCandidate,
      closestDistance: bestDist === Infinity ? null : bestDist,
    },
  }
}

// 배치 크기 20~30(설계 제약) — 마지막 나머지 배치는 20 미만일 수 있음(총
// 건수의 나머지라 불가피, 설계 위반 아님).
export function buildBatches(items, size = 25) {
  if (size < 20 || size > 30) throw new Error('배치 크기는 20~30 사이여야 합니다(설계 제약)')
  const batches = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

// 동일 (단어, 등록뜻 스냅샷, 정규화 답안) 조합 캐시 키 — supabase_v3_6_
// writing_review_ai_cache.sql의 unique(word_id, meaning_snapshot,
// normalized_answer)와 1:1 대응.
export function buildCacheKey({ wordId, meaningSnapshot, normalizedAnswer }) {
  return `${wordId}::${meaningSnapshot}::${normalizedAnswer}`
}

export function parseCacheKey(key) {
  const [wordId, meaningSnapshot, normalizedAnswer] = String(key).split('::')
  return { wordId, meaningSnapshot, normalizedAnswer }
}

// AI 결과 스키마(§ 분석 문서 §12) 그대로 — 필드명은 snake_case로 고정.
// v1.1(2026-07-23): meaning_scope_warning 필드 추가 — AI가 decision=accept를
// 내리면서도 "학생 답이 등록된 여러 뜻 중 일부만 커버한다"/"의미가 인접하지만
// 완전히 같지는 않다" 같은 경고를 함께 줄 수 있는 자리(로컬 규칙 판정에는
// 절대 안 생김 — exact_match/synonym/levenshtein은 문자열 비교라 의미
// 범위를 판단하지 않는다, AI 전용 필드).
export function buildProposal({
  pendingId, word, meaning, submittedAnswer, decision, confidence, reason,
  suggestedSynonym = null, partOfSpeechWarning = null, meaningScopeWarning = null,
  decisionSource, cacheHit = false,
}) {
  return {
    pending_answer_id: pendingId,
    word,
    registered_meaning: meaning,
    student_answer: submittedAnswer,
    decision,
    confidence,
    reason,
    suggested_synonym: suggestedSynonym,
    part_of_speech_warning: partOfSpeechWarning,
    meaning_scope_warning: meaningScopeWarning,
    decision_source: decisionSource,
    cache_hit: cacheHit,
  }
}

const VALID_DECISIONS = new Set(['accept', 'review', 'reject_candidate'])
export function isValidAiDecision(obj) {
  return !!obj && typeof obj === 'object' && VALID_DECISIONS.has(obj.decision)
}

// AI에게 보낼 프롬프트 — 배치 하나 분량. system은 규칙(캐시 대상,
// 4개 배치가 공유하는 고정 블록 — 프롬프트 캐싱 breakpoint 위치), user는
// 배치별로 달라지는 실제 항목 목록.
export function buildAiPrompt(batchItems) {
  const system = [
    '당신은 초등학교 영어 단어 쓰기시험 채점 보조입니다.',
    '학생이 영→한 문제에서 한글로 답했는데 등록된 뜻과 문자열이 달라 오답 처리된 제출을 검토합니다.',
    '이미 단순 오타/완전일치는 규칙 기반으로 걸러졌고, 여기 오는 항목은 의미 판단이 필요한 것들입니다.',
    '학생이 뜻은 맞게 이해했지만 표현/어휘가 다른 경우 accept, 판단이 애매하거나 부분적으로만 맞으면 review, 명백히 다른 뜻이면 reject_candidate로 표시하세요.',
    'accept로 판단했더라도 등록된 뜻이 여러 개(쉼표로 나열)인데 학생 답이 그 중 일부 의미만 커버하거나, 의미가 인접하지만 완전히 같지는 않은 경우에는 meaning_scope_warning에 그 이유를 짧게 적으세요(문제 없으면 null).',
    '절대 임의로 다른 pending_answer_id를 만들어내지 마세요 — 입력에 있던 값만 정확히 그대로 돌려주세요.',
    '각 항목마다 정확히 아래 필드를 가진 JSON 객체 하나씩, 전체를 JSON 배열 하나로만 응답하세요(배열 앞뒤에 다른 텍스트를 절대 넣지 마세요):',
    '{"pending_answer_id": string, "decision": "accept"|"review"|"reject_candidate", "confidence": number(0~1), "reason": string(한국어 1문장), "suggested_synonym": string|null, "part_of_speech_warning": string|null, "meaning_scope_warning": string|null}',
  ].join('\n')
  const user = JSON.stringify(batchItems.map((it) => ({
    pending_answer_id: it.id,
    word: it.word,
    registered_meaning: it.meaning,
    accepted_meanings: it.acceptedMeanings || [],
    student_answer: it.submittedAnswer,
    pos_warning_hint: !!it.hint?.posWarning,
  })))
  return { system, user }
}

// AI 원문 응답을 pending_answer_id -> 판정 Map으로 파싱. 파싱 실패/배열
// 아님/스키마 위반 항목은 그냥 Map에서 빠진다(누락 = 호출부가 review로 강등,
// § 설계 제약 "잘못된 JSON -> review").
export function parseAiBatchResponse(rawText) {
  let arr
  try {
    arr = JSON.parse(rawText)
  } catch {
    return new Map()
  }
  if (!Array.isArray(arr)) return new Map()
  const map = new Map()
  for (const entry of arr) {
    if (entry && typeof entry.pending_answer_id === 'string' && isValidAiDecision(entry)) {
      map.set(entry.pending_answer_id, entry)
    }
  }
  return map
}

// pending 답안 배열 -> 최종 제안(AI 결과 스키마) 배열. 이 함수는 어떤 DB
// write도 하지 않는다(§ preview-only) — cacheLookup/cacheStore/aiClassify는
// 전부 호출부가 주입하는 부수효과이고, 이 함수 자체는 순수하게 조합만 한다.
// cacheStore가 쓰는 대상은 오직 "AI 판정 캐시" 테이블이지 spelling_review_
// queue.status나 words.accepted_meanings가 아니다 — 그 둘은 여전히 관리자가
// 기존 인정/무시 버튼을 눌러야만 바뀐다.
export async function classifyBatch(pendingItems, { cacheLookup, cacheStore, aiClassify, batchSize = 25 } = {}) {
  const proposals = []
  const unresolved = []

  for (const item of pendingItems) {
    const local = classifyLocally(item)
    if (local.decision) {
      proposals.push(buildProposal({
        pendingId: item.id, word: item.word, meaning: item.meaning, submittedAnswer: item.submittedAnswer,
        decision: local.decision, confidence: local.confidence, reason: local.reason,
        decisionSource: local.decisionSource, cacheHit: false,
      }))
      continue
    }
    unresolved.push({ ...item, hint: local.hint })
  }

  const stillUnresolved = []
  for (const item of unresolved) {
    const key = buildCacheKey({
      wordId: item.wordId,
      meaningSnapshot: item.meaning,
      normalizedAnswer: normalizeForCompare(item.submittedAnswer),
    })
    const cached = cacheLookup ? await cacheLookup(key) : null
    if (cached) {
      proposals.push(buildProposal({
        pendingId: item.id, word: item.word, meaning: item.meaning, submittedAnswer: item.submittedAnswer,
        decision: cached.decision, confidence: cached.confidence, reason: cached.reason,
        suggestedSynonym: cached.suggestedSynonym ?? null, partOfSpeechWarning: cached.partOfSpeechWarning ?? null,
        meaningScopeWarning: cached.meaningScopeWarning ?? null,
        decisionSource: cached.decisionSource || 'ai', cacheHit: true,
      }))
    } else {
      stillUnresolved.push({ ...item, cacheKey: key })
    }
  }

  if (stillUnresolved.length === 0) return proposals

  if (!aiClassify) {
    // AI 분류기가 주입되지 않으면(예: ANTHROPIC_API_KEY 미설정) 전부 review로
    // 강등 — "AI 실패" 폴백과 동일 경로, auto-reject 아님.
    for (const item of stillUnresolved) {
      proposals.push(buildProposal({
        pendingId: item.id, word: item.word, meaning: item.meaning, submittedAnswer: item.submittedAnswer,
        decision: 'review', confidence: null, reason: 'AI 분류기 미사용(설정 없음) — 관리자 확인 필요',
        partOfSpeechWarning: item.hint?.posWarning ? '품사/활용형 차이 가능성' : null,
        decisionSource: 'ai_unavailable', cacheHit: false,
      }))
    }
    return proposals
  }

  const batches = buildBatches(stillUnresolved, batchSize)
  for (const batch of batches) {
    let aiResults
    try {
      aiResults = await aiClassify(batch)
    } catch (err) {
      for (const item of batch) {
        proposals.push(buildProposal({
          pendingId: item.id, word: item.word, meaning: item.meaning, submittedAnswer: item.submittedAnswer,
          decision: 'review', confidence: null, reason: `AI 호출 실패: ${err?.message || err}`,
          partOfSpeechWarning: item.hint?.posWarning ? '품사/활용형 차이 가능성' : null,
          decisionSource: 'ai_error', cacheHit: false,
        }))
      }
      continue
    }

    for (const item of batch) {
      const res = aiResults instanceof Map ? aiResults.get(item.id) : aiResults?.[item.id]
      if (!res || !isValidAiDecision(res)) {
        proposals.push(buildProposal({
          pendingId: item.id, word: item.word, meaning: item.meaning, submittedAnswer: item.submittedAnswer,
          decision: 'review', confidence: null,
          reason: '설계 제약(잘못된 JSON): AI 응답 스키마 검증 실패 — 안전하게 review로 강등',
          partOfSpeechWarning: item.hint?.posWarning ? '품사/활용형 차이 가능성' : null,
          decisionSource: 'parse_error', cacheHit: false,
        }))
        continue
      }
      proposals.push(buildProposal({
        pendingId: item.id, word: item.word, meaning: item.meaning, submittedAnswer: item.submittedAnswer,
        decision: res.decision, confidence: res.confidence ?? null, reason: res.reason || '',
        suggestedSynonym: res.suggested_synonym ?? null,
        partOfSpeechWarning: res.part_of_speech_warning ?? (item.hint?.posWarning ? '품사/활용형 차이 가능성' : null),
        meaningScopeWarning: res.meaning_scope_warning ?? null,
        decisionSource: 'ai', cacheHit: false,
      }))
      if (cacheStore) {
        await cacheStore(item.cacheKey, {
          decision: res.decision, confidence: res.confidence ?? null, reason: res.reason || '',
          suggestedSynonym: res.suggested_synonym ?? null, partOfSpeechWarning: res.part_of_speech_warning ?? null,
          meaningScopeWarning: res.meaning_scope_warning ?? null,
          decisionSource: 'ai',
        })
      }
    }
  }

  return proposals
}

// 2026-07-23 claude-api 스킬(claude-sonnet-5/claude-haiku-4-5 최신 가격표)
// 확인 기준 — $/1M 토큰. 가격이 바뀌면 claude-api 스킬로 재확인 후 이 상수만
// 갱신할 것(코드 다른 곳은 안 건드림).
export const MODEL_PRICING_PER_MTOK = {
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
}

export function estimateCostUsd({ inputTokens = 0, outputTokens = 0 }, model = 'claude-haiku-4-5') {
  const price = MODEL_PRICING_PER_MTOK[model]
  if (!price) throw new Error(`알 수 없는 모델(가격표 없음): ${model}`)
  return (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output
}

// api/_pinAuth.js:75 checkAdminReauth와 동일한 비교 로직(문자열 완전일치).
// Deno Edge Function은 그 Node 전용 모듈을 import 할 수 없어 비교 로직만
// 별도 구현했다 — 두 곳 중 하나만 고치면 드리프트가 생기니 한쪽을 바꾸면
// 반드시 다른 쪽도 확인할 것(§ 위험 목록).
export function verifyAdminPin(candidatePin, expectedPin) {
  if (!expectedPin) return false
  return typeof candidatePin === 'string' && candidatePin === expectedPin
}
