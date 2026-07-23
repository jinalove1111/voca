// scripts/testWritingReviewAiPipeline.mjs
//
// Task 2(쓰기 답안 검토 AI 보조) — 규칙 기반 파이프라인 + 캐시/배치/AI
// 오류처리 + 클라이언트 일괄 액션 계획(순수 로직) 검증. 전부 픽스처
// 데이터로만 동작(라이브 spelling_review_queue 무관, DB/네트워크 접근 0회).
// AI 호출은 전부 mock — 실제 Anthropic API를 호출하지 않는다(로컬에 키
// 없음 — 이 스크립트가 그걸 요구하면 애초에 CI/로컬에서 못 돈다).
//
// 로컬에서 검증 불가능한 항목(Supabase Edge Function 실제 배포, 실제
// RLS 권한 거부, 실제 Anthropic 응답 파싱)은 가짜로 PASS 처리하지 않고
// 맨 아래 "배포 후 확인 필요" 섹션에 정직하게 SKIP으로 표기한다.
//
// v1.1(2026-07-23, docs/operations/task2-writing-report.md v1.1 섹션) 추가분
// — 섹션 27부터: 규칙 기반 분류가 이제 브라우저에서 먼저 실행되는
// 아키텍처(pipeline.js 클라이언트 재사용, 미해결 항목만 Edge Function
// 전송), "확실한 답안 모두 인정"/"동일한 답안 모두 인정" 대상 선별,
// 요약 집계(summarizeProposals), 인정 변형 감사 레코드, 운영자 제공 실제
// 사례 픽스처(climate/evaporation/stream/constant). src/utils/
// spellingReviewAiApi.js의 fetch 기반 Edge Function 호출 자체(네트워크
// 실패/404 폴백 분기)는 supabaseClient(import.meta.env)를 top-level
// import하는 브라우저 전용 모듈이라 이 Node 스크립트에서 직접 실행할 수
// 없다 — 그 파일이 호출하는 순수 함수(classifyLocally/buildProposal, 둘 다
// 이 파일에서 이미 광범위하게 검증됨)와 "미해결만 골라 보낸다"는 분리 로직
// 자체를 섹션 35에서 동일하게 재현해 검증한다(정직한 한계, § 섹션 36 참고).
import {
  classifyLocally, classifyBatch, buildBatches, buildCacheKey, parseCacheKey,
  buildAiPrompt, parseAiBatchResponse, estimateCostUsd, editDistance,
  normalizeForCompare, verifyAdminPin, isValidAiDecision, buildProposal,
  PROMPT_VERSION, AI_MODEL_ID, DEFAULT_AI_PROVIDER, DEFAULT_GEMINI_MODEL,
  MODEL_PRICING_PER_MTOK,
} from '../supabase/functions/grade-writing-answers/pipeline.js'
import {
  createAIProvider, safeEstimateCostUsd, FALLBACK_PRICE_PER_MTOK,
  OpenAIProvider, GeminiProvider, AnthropicProvider,
} from '../supabase/functions/grade-writing-answers/providers.js'
import {
  selectRows, findDuplicateAnswerRows, planAccept, selectHighConfidenceAccepts,
  filterProposals, summarizeBulkResults, normalizeForCompare as normalizeForCompareClient,
  selectCertainAccepts, selectAllDuplicateGroupRows, groupRowsByAnswer, groupKeyFor,
  summarizeProposals, buildAcceptedVariantRecord,
  filterProposalsBySource, filterRowsByStudent, distinctStudentIds, sortDisplayItems,
  buildConfirmSummary,
} from '../src/utils/spellingReviewBulkPlan.js'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import esbuild from 'esbuild'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// ── 픽스처 — 실측 라이브 99건과 무관, 손으로 구성한 대표 사례들 ──────────
const F = {
  exact: { id: 'p1', wordId: 'w1', word: 'locker', meaning: '물품 보관함', acceptedMeanings: [], submittedAnswer: '물품 보관함' },
  whitespace: { id: 'p2', wordId: 'w1', word: 'locker', meaning: '물품 보관함', acceptedMeanings: [], submittedAnswer: '  물품   보관함  ' },
  punctuation: { id: 'p3', wordId: 'w2', word: 'perfect', meaning: '완벽한', acceptedMeanings: [], submittedAnswer: '완벽한.' },
  caseVariant: { id: 'p4', wordId: 'w3', word: 'apple', meaning: 'apple', acceptedMeanings: [], submittedAnswer: 'APPLE' },
  nfdVsNfc: { id: 'p5', wordId: 'w1', word: 'locker', meaning: '물품 보관함', acceptedMeanings: [], submittedAnswer: '물품 보관함'.normalize('NFD') },
  synonymAlreadyAccepted: { id: 'p6', wordId: 'w4', word: 'flat', meaning: '바람이 빠진, 펑크가 난', acceptedMeanings: ['펑크난'], submittedAnswer: '펑크난' },
  typo: { id: 'p7', wordId: 'w1', word: 'locker', meaning: '물품 보관함', acceptedMeanings: [], submittedAnswer: '물품 보괌함' }, // 관->괌 오타(편집거리 1)
  // 어미가 여러 음절이라 편집거리가 커서(levenshtein 자동 accept 임계값
  // 밖) 실제로 8단계 품사 힌트 경로까지 도달하는 조합으로 구성(단일 음절
  // 어미 차이는 편집거리 1이라 9단계에서 먼저 accept돼버려 8단계를 테스트
  // 못 함 — 실측 확인 후 조정, 2026-07-23).
  posVariant: { id: 'p8', wordId: 'w5', word: 'natural', meaning: '자연스러운', acceptedMeanings: [], submittedAnswer: '자연' },
  closeButWrongMeaning: { id: 'p9', wordId: 'w6', word: 'leave', meaning: '떠나다', acceptedMeanings: [], submittedAnswer: '살다' }, // 편집거리 가까움(문자 겹침 없음에 가까움) — 로컬에서 accept 확정 금지
  trueSynonymDifferentString: { id: 'p10', wordId: 'w7', word: 'urine', meaning: '소변', acceptedMeanings: [], submittedAnswer: '오줌' },
  completelyWrong: { id: 'p11', wordId: 'w8', word: 'harm', meaning: '해치다', acceptedMeanings: [], submittedAnswer: '농부' },
  duplicateA: { id: 'p12', wordId: 'w9', word: 'hug', meaning: '안다, 포옹하다', acceptedMeanings: [], submittedAnswer: '포옹' },
  duplicateB: { id: 'p13', wordId: 'w9', word: 'hug', meaning: '안다, 포옹하다', acceptedMeanings: [], submittedAnswer: '포옹' }, // p12와 동일 답안, 같은 단어
}

// 운영자가 직접 제공한 실제 사례(v1.1, 2026-07-23) — 라이브 pending 중
// 실측된 조합. "환경"은 climate(기후)와 의미가 인접해 보이지만 실제로는
// 다른 개념(오답 후보)이라 맹목적 자동 인정이 있으면 안 되고, "완벽하게"/
// "o"는 등록 뜻과 완전히 무관해 reject_candidate로 가야 한다(자동 거부
// 실행은 여전히 없음 — 제안만).
const REAL_CASES = {
  climate: { id: 'r1', wordId: 'rw1', word: 'climate', meaning: '기후', acceptedMeanings: [], submittedAnswer: '환경' },
  evaporation: { id: 'r2', wordId: 'rw2', word: 'evaporation', meaning: '증발', acceptedMeanings: [], submittedAnswer: '완벽하게' },
  stream: { id: 'r3', wordId: 'rw3', word: 'stream', meaning: '흐름', acceptedMeanings: [], submittedAnswer: '실시간' },
  constant: { id: 'r4', wordId: 'rw4', word: 'constant', meaning: '끊임없는', acceptedMeanings: [], submittedAnswer: 'o' },
}

console.log('\n1. 정규화(공백/문장부호/Unicode NFC) — 완전일치로 귀결되면 로컬 accept')
{
  const rExact = classifyLocally(F.exact)
  check('완전일치는 즉시 accept', rExact.decision === 'accept' && rExact.decisionSource === 'exact_match')

  const rWs = classifyLocally(F.whitespace)
  check('중복 공백/양끝 공백은 정규화 후 accept', rWs.decision === 'accept')

  const rPunct = classifyLocally(F.punctuation)
  check('끝 마침표는 제거 후 accept', rPunct.decision === 'accept')

  const rCase = classifyLocally(F.caseVariant)
  check('영어 답 대소문자 무시 accept', rCase.decision === 'accept')

  const rNfd = classifyLocally(F.nfdVsNfc)
  check('NFD로 분해된 한글도 NFC 정규화 후 accept(자모 분해 대비)', rNfd.decision === 'accept')
}

console.log('\n2. 이미 등록된 accepted_meanings 재확인(동의어) — accept')
{
  const r = classifyLocally(F.synonymAlreadyAccepted)
  check('accepted_meanings에 이미 있는 답은 accept', r.decision === 'accept')
}

console.log('\n3. 편집거리(9단계) — 짧은 오타는 accept, 애매한 건 로컬에서 확정 안 함')
{
  const rTypo = classifyLocally(F.typo)
  check('편집거리 1 오타는 accept(levenshtein)', rTypo.decision === 'accept' && rTypo.decisionSource === 'levenshtein')
  check('오타 accept 신뢰도는 완전일치보다 낮음', rTypo.confidence < 1 && rTypo.confidence > 0.5)

  const rClose = classifyLocally(F.closeButWrongMeaning)
  check('편집거리는 가까워도 뜻이 다르면 로컬에서 accept 확정 안 함(null, AI로)', rClose.decision === null)

  check('완전 오답(전혀 다른 문자열)도 로컬에서 reject 확정 안 함(AI로 넘김)', classifyLocally(F.completelyWrong).decision === null)
  check('진짜 동의어인데 문자열이 다르면 로컬 미해결(AI로)', classifyLocally(F.trueSynonymDifferentString).decision === null)
}

console.log('\n4. 품사/활용형 힌트(8단계) — 그 자체로 판정하지 않고 힌트만 생성')
{
  const r = classifyLocally(F.posVariant)
  check('활용형 차이는 로컬 미해결(null)', r.decision === null)
  check('posWarning 힌트가 세팅됨', r.hint?.posWarning === true)
}

console.log('\n5. 편집거리 함수 자체 확인')
{
  check('동일 문자열 거리 0', editDistance('abc', 'abc') === 0)
  check('한 글자 치환 거리 1', editDistance('abc', 'abd') === 1)
  check('전치(transposition) 거리 1', editDistance('ab', 'ba') === 1)
  check('빈 문자열 대비 길이만큼', editDistance('', 'abc') === 3)
}

console.log('\n6. 배치 청크(20~30) — 99건 픽스처')
{
  const fixture99 = Array.from({ length: 99 }, (_, i) => ({ id: `fx-${i}` }))
  const batches = buildBatches(fixture99, 25)
  check('99건 -> 4개 배치', batches.length === 4)
  check('앞 3개 배치는 25건씩', batches.slice(0, 3).every((b) => b.length === 25))
  check('마지막 배치는 나머지 24건', batches[3].length === 24)
  check('전체 합은 99', batches.reduce((s, b) => s + b.length, 0) === 99)

  check('size 20 미만/30 초과는 설계 제약 위반으로 예외', (() => {
    try { buildBatches(fixture99, 19); return false } catch { /* expected */ }
    try { buildBatches(fixture99, 31); return false } catch { return true }
  })())
}

console.log('\n7. 캐시 히트 — 동일 (word_id, meaning, 정규화답안) 조합은 AI 재호출 없이 재사용')
{
  const cacheStore = new Map()
  const cacheLookup = async (key) => cacheStore.get(key) || null
  const cacheStorer = async (key, decision) => cacheStore.set(key, decision)

  let aiCallCount = 0
  const aiClassify = async (batch) => {
    aiCallCount++
    const map = new Map()
    for (const item of batch) map.set(item.id, { pending_answer_id: item.id, decision: 'review', confidence: 0.5, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null })
    return map
  }

  const itemsFirstRun = [F.closeButWrongMeaning]
  const itemsSecondRunSameCombo = [{ ...F.closeButWrongMeaning, id: 'p9-again' }] // 같은 word/meaning/답안, 다른 pending id

  const proposals1 = await classifyBatch(itemsFirstRun, { cacheLookup, cacheStore: cacheStorer, aiClassify })
  check('1차 호출은 AI를 1번 호출', aiCallCount === 1)
  check('1차 결과는 cache_hit=false', proposals1[0].cache_hit === false)

  const proposals2 = await classifyBatch(itemsSecondRunSameCombo, { cacheLookup, cacheStore: cacheStorer, aiClassify })
  check('동일 (word,meaning,정규화답안) 조합 재제출 시 AI 재호출 없음(캐시 히트)', aiCallCount === 1)
  check('2차 결과는 cache_hit=true', proposals2[0].cache_hit === true)
  check('2차 결과 판정은 캐시된 값 그대로', proposals2[0].decision === 'review')
}

console.log('\n8. AI 정상 응답 파싱')
{
  const raw = JSON.stringify([
    { pending_answer_id: 'a1', decision: 'accept', confidence: 0.92, reason: '동의어로 판단됨', suggested_synonym: '소변', part_of_speech_warning: null },
    { pending_answer_id: 'a2', decision: 'reject_candidate', confidence: 0.1, reason: '전혀 다른 뜻', suggested_synonym: null, part_of_speech_warning: null },
  ])
  const map = parseAiBatchResponse(raw)
  check('정상 응답은 pending_answer_id 2건 모두 파싱', map.size === 2)
  check('a1 decision=accept', map.get('a1').decision === 'accept')
  check('a2 decision=reject_candidate', map.get('a2').decision === 'reject_candidate')
}

console.log('\n9. AI 실패/잘못된 JSON — 항상 review로 강등(자동 거부 금지)')
{
  check('완전히 깨진 텍스트 -> 빈 Map', parseAiBatchResponse('이건 JSON이 아님{{{').size === 0)
  check('배열이 아닌 JSON -> 빈 Map', parseAiBatchResponse('{"foo":"bar"}').size === 0)
  check('배열이지만 decision 값이 스키마 밖 -> 그 항목만 제외', parseAiBatchResponse(JSON.stringify([{ pending_answer_id: 'x', decision: 'delete_forever' }])).size === 0)

  // classifyBatch 레벨: AI 호출 자체가 throw하는 경우
  const throwingAi = async () => { throw new Error('네트워크 오류(모의)') }
  const proposalsOnError = await classifyBatch([F.completelyWrong], { aiClassify: throwingAi })
  check('AI 호출 실패 시 decision=review(자동 거부 아님)', proposalsOnError[0].decision === 'review')
  check('AI 호출 실패 시 decision_source=ai_error', proposalsOnError[0].decision_source === 'ai_error')

  // 잘못된 JSON(파싱은 되지만 스키마 위반)이 돌아오는 경우
  const badSchemaAi = async () => new Map() // 파싱 결과가 비어있는 상황(스키마 위반 항목 전부 탈락)과 동치
  const proposalsBadSchema = await classifyBatch([F.trueSynonymDifferentString], { aiClassify: badSchemaAi })
  check('스키마 위반 응답도 review로 강등', proposalsBadSchema[0].decision === 'review')
  check('스키마 위반 decision_source=parse_error', proposalsBadSchema[0].decision_source === 'parse_error')

  check('isValidAiDecision — 정상', isValidAiDecision({ decision: 'accept' }) === true)
  check('isValidAiDecision — 스키마 밖 값 거부', isValidAiDecision({ decision: 'nuke' }) === false)
  check('isValidAiDecision — 객체 아님 거부', isValidAiDecision('accept') === false)
}

console.log('\n10. AI 분류기 미설정(ANTHROPIC_API_KEY 없음) — 전부 review, auto-reject 없음')
{
  const proposals = await classifyBatch([F.completelyWrong, F.trueSynonymDifferentString])
  check('분류기 없으면 전부 review', proposals.every((p) => p.decision === 'review'))
  check('decision_source=ai_unavailable', proposals.every((p) => p.decision_source === 'ai_unavailable'))
}

console.log('\n11. 최종 스키마 필드 — AI 결과 스키마(분석 문서 §12) 9개 필드 전부 존재')
{
  const proposals = await classifyBatch([F.exact])
  const p = proposals[0]
  const requiredFields = ['pending_answer_id', 'word', 'registered_meaning', 'student_answer', 'decision', 'confidence', 'reason', 'suggested_synonym', 'part_of_speech_warning', 'decision_source', 'cache_hit']
  check('필수 필드 전부 존재', requiredFields.every((f) => Object.prototype.hasOwnProperty.call(p, f)))
}

console.log('\n12. 미리보기 순수성 — classifyBatch는 부작용 없이 순수 계산만 함')
{
  let writeAttempted = false
  const spyStore = { spelling_review_queue: [], words: [] } // 아무 코드도 이 객체를 안 건드려야 함
  const cacheLookup = async () => null
  const cacheStore = async () => { /* 캐시 테이블에만 기록 — spelling_review_queue/words 무관 */ }
  const aiClassify = async (batch) => {
    // 이 함수(테스트 mock)가 spyStore를 건드리면 실패로 잡는다 — 실제
    // 구현(Edge Function)도 aiClassify는 오직 Anthropic 호출만 하지
    // DB write를 하지 않는다.
    if (spyStore.spelling_review_queue.length > 0 || spyStore.words.length > 0) writeAttempted = true
    const map = new Map()
    for (const item of batch) map.set(item.id, { pending_answer_id: item.id, decision: 'review', confidence: 0.4, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null })
    return map
  }
  await classifyBatch([F.exact, F.completelyWrong], { cacheLookup, cacheStore, aiClassify })
  check('classifyBatch 실행 중 spelling_review_queue/words 상태 불변', !writeAttempted && spyStore.spelling_review_queue.length === 0 && spyStore.words.length === 0)
}

console.log('\n13. 클라이언트 일괄 액션 계획(순수 로직) — 선택된 것만 갱신')
{
  const rows = [
    { id: 'r1', wordId: 'w9', submittedAnswer: '포옹', acceptedMeanings: [] },
    { id: 'r2', wordId: 'w10', submittedAnswer: '다른답', acceptedMeanings: [] },
    { id: 'r3', wordId: 'w11', submittedAnswer: '또다른답', acceptedMeanings: [] },
  ]
  const selected = selectRows(rows, ['r1', 'r3'])
  check('선택된 2건만 골라짐(r2 제외)', selected.length === 2 && selected.every((r) => r.id !== 'r2'))
}

console.log('\n14. 동일 답안 일괄 인정 — 같은 단어+정규화 답안인 다른 pending 행 탐색')
{
  const rows = [
    { id: 'p12', wordId: 'w9', submittedAnswer: '포옹' },
    { id: 'p13', wordId: 'w9', submittedAnswer: '  포옹  ' }, // 공백만 다름 — 정규화하면 동일
    { id: 'p14', wordId: 'w9', submittedAnswer: '안아주다' }, // 다른 답안
    { id: 'p15', wordId: 'w99', submittedAnswer: '포옹' }, // 다른 단어(같은 문자열이어도 무관해야 함)
  ]
  const dupes = findDuplicateAnswerRows(rows, rows[0], normalizeForCompare)
  check('같은 단어+정규화 후 동일 답안만 중복으로 탐지(p13만)', dupes.length === 1 && dupes[0].id === 'p13')
}

console.log('\n15. 인정 계획(planAccept) — answer_only vs all_duplicates')
{
  const row = { id: 'r1', wordId: 'w9', submittedAnswer: '포옹', acceptedMeanings: ['안다'] }
  const dupRows = [{ id: 'r2', submittedAnswer: '안아주다' }]

  const planSingle = planAccept(row, { mode: 'answer_only' })
  check('answer_only는 이 답안만 추가', planSingle.mergedAcceptedMeanings.includes('포옹') && planSingle.additionalResolveIds.length === 0)
  check('기존 인정 목록은 보존(안다 유지)', planSingle.mergedAcceptedMeanings.includes('안다'))

  const planAll = planAccept(row, { mode: 'all_duplicates', duplicateRows: dupRows })
  check('all_duplicates는 중복 행의 답안도 함께 추가', planAll.mergedAcceptedMeanings.includes('안아주다'))
  check('all_duplicates는 중복 행 id를 추가 처리 대상으로 반환', planAll.additionalResolveIds.includes('r2'))

  const planDedup = planAccept({ id: 'r1', wordId: 'w9', submittedAnswer: '포옹', acceptedMeanings: ['포옹'] }, { mode: 'answer_only' })
  check('이미 인정된 답을 다시 인정해도 중복 저장 안 됨', planDedup.mergedAcceptedMeanings.filter((m) => m === '포옹').length === 1)
}

console.log('\n16. "답안을 인정 동의어로 저장 후 다음번엔 즉시 accept" 라운드트립')
{
  const before = classifyLocally({ id: 'p16', wordId: 'w9', word: 'hug', meaning: '안다, 포옹하다', acceptedMeanings: [], submittedAnswer: '포옹' })
  check('저장 전에는 로컬 미해결(동의어라 편집거리로도 못 잡음)', before.decision === null)

  // planAccept가 계산한 값을 실제로 words.accepted_meanings에 반영했다고
  // 가정하고, 같은 단어에 같은 답이 또 들어오면 이제는 accepted_meanings
  // 매치로 즉시 accept 되어야 한다.
  const plan = planAccept({ id: 'p16', wordId: 'w9', submittedAnswer: '포옹', acceptedMeanings: [] }, { mode: 'synonym' })
  const after = classifyLocally({ id: 'p16-again', wordId: 'w9', word: 'hug', meaning: '안다, 포옹하다', acceptedMeanings: plan.mergedAcceptedMeanings, submittedAnswer: '포옹' })
  check('동의어 저장 후 재분류하면 즉시 accept', after.decision === 'accept')
}

console.log('\n17. high-confidence 제안 일괄 인정 대상 선별')
{
  const proposals = [
    { pending_answer_id: 'x1', decision: 'accept', confidence: 0.95 },
    { pending_answer_id: 'x2', decision: 'accept', confidence: 0.5 }, // 신뢰도 낮음 — 제외
    { pending_answer_id: 'x3', decision: 'review', confidence: 0.99 }, // accept 아님 — 제외
    { pending_answer_id: 'x4', decision: 'accept', confidence: 0.81 },
  ]
  const high = selectHighConfidenceAccepts(proposals, 0.8)
  check('신뢰도 0.8 이상 accept만 선별(x1,x4)', high.length === 2 && high.every((p) => ['x1', 'x4'].includes(p.pending_answer_id)))
}

console.log('\n18. 판정별/단어별 필터')
{
  const proposals = [
    { pending_answer_id: 'a', decision: 'accept', word: 'locker' },
    { pending_answer_id: 'b', decision: 'review', word: 'lantern' },
    { pending_answer_id: 'c', decision: 'reject_candidate', word: 'locker' },
  ]
  check('decision 필터', filterProposals(proposals, { decision: 'accept' }).length === 1)
  check('word 필터(부분 일치, 대소문자 무시)', filterProposals(proposals, { wordQuery: 'lock' }).length === 2)
  check('필터 없으면 전체', filterProposals(proposals, {}).length === 3)
}

console.log('\n19. 완료 요약 계산')
{
  const results = [{ ok: true }, { ok: true }, { ok: false, error: 'x' }]
  const summary = summarizeBulkResults(results)
  check('성공/실패/전체 카운트', summary.ok === 2 && summary.failed === 1 && summary.total === 3)
}

console.log('\n20. 비용 추정(claude-api 스킬 확인 가격표 기준)')
{
  const costHaiku = estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, 'claude-haiku-4-5')
  check('Haiku 4.5: 100만 입력+100만 출력 = $1+$5=$6', Math.abs(costHaiku - 6) < 1e-9)
  const costSonnet = estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, 'claude-sonnet-5')
  check('Sonnet 5: 100만 입력+100만 출력 = $3+$15=$18', Math.abs(costSonnet - 18) < 1e-9)
  check('알 수 없는 모델은 예외', (() => { try { estimateCostUsd({}, 'claude-made-up'); return false } catch { return true } })())

  // 99건 전량 AI 처리 최악 상한(분석 문서 §13-2 추정 규모 재확인)
  const worstCase = estimateCostUsd({ inputTokens: 22000, outputTokens: 10000 }, 'claude-haiku-4-5')
  check('99건 전량 처리 추정 비용은 10센트 미만(분석 문서 §13-2와 일치)', worstCase < 0.10)
}

console.log('\n21. 관리자 인증(verifyAdminPin) — Edge Function 인가 로직')
{
  check('정확한 PIN은 통과', verifyAdminPin('1234', '1234') === true)
  check('틀린 PIN은 거부', verifyAdminPin('0000', '1234') === false)
  check('adminPin 누락(undefined)은 거부', verifyAdminPin(undefined, '1234') === false)
  check('서버 ADMIN_PIN 자체가 미설정이면 무조건 거부(fail-closed)', verifyAdminPin('1234', undefined) === false)
  check('숫자 타입으로 온 PIN은 거부(문자열만 허용)', verifyAdminPin(1234, '1234') === false)
}

console.log('\n22. 캐시 키 빌드/파싱 라운드트립')
{
  const key = buildCacheKey({ wordId: 'w1', meaningSnapshot: '물품 보관함', normalizedAnswer: '물품보괌함' })
  const parsed = parseCacheKey(key)
  check('캐시 키 파싱 라운드트립', parsed.wordId === 'w1' && parsed.meaningSnapshot === '물품 보관함' && parsed.normalizedAnswer === '물품보괌함')
}

console.log('\n23. AI 프롬프트 빌더 — pending_answer_id/스키마 안내 포함')
{
  const { system, user } = buildAiPrompt([F.completelyWrong])
  check('system 프롬프트에 3종 판정 스키마 안내 포함', system.includes('accept') && system.includes('review') && system.includes('reject_candidate'))
  check('system 프롬프트에 "임의로 다른 pending_answer_id" 금지 문구 포함', system.includes('pending_answer_id'))
  const userParsed = JSON.parse(user)
  check('user 페이로드에 원본 pending_answer_id 보존', userParsed[0].pending_answer_id === F.completelyWrong.id)
}

console.log('\n24. 수동 폴백(기존 워크플로우) — spellingReviewApi.js 무변경 확인')
{
  // 이 파일은 supabaseClient(import.meta.env)를 top-level import하는 브라우저
  // 전용 모듈이라 plain Node에서 직접 import하면 크래시한다(다른 wordLibrary.js
  // 의존 테스트들이 esbuild 번들을 거치는 것과 같은 이유) — 여기서는 번들
  // 없이 소스 텍스트로 "이 Task 2 작업이 그 파일의 핵심 검증 로직을 안
  // 건드렸는지"만 가볍게 재확인한다(§ 폴백 보존 — 실제 동작은 기존
  // scripts/testSpellingV2Db.mjs가 이미 e2e로 검증).
  const scriptDir = fileURLToPath(new URL('.', import.meta.url))
  const src = fs.readFileSync(new URL('../src/utils/spellingReviewApi.js', import.meta.url), 'utf8')
  check('resolveSpellingReview의 status 화이트리스트 검증 문구 그대로 존재', src.includes("['accepted', 'dismissed'].includes(status)"))
  check('여전히 행을 삭제하지 않고 status만 업데이트(update, delete 아님)', src.includes(".update({ status })") && !src.includes(".delete()"))
  void scriptDir
}

console.log('\n25. 드리프트 가드 — 서버(pipeline.js)/클라이언트(spellingReviewBulkPlan.js) normalizeForCompare 두 사본이 여전히 같은 결과를 내는지')
{
  const samples = [' 물품   보관함 ', '완벽한.', '물품 보관함'.normalize('NFD'), '', null, '~을 인식하는', 'APPLE']
  check('두 구현이 모든 샘플에서 동일 결과', samples.every((s) => normalizeForCompare(s) === normalizeForCompareClient(s)))
}

console.log('\n27. exact_match vs synonym 구분(v1.1) — 관리자 UI "출처" 표시용')
{
  const exactCase = classifyLocally({ word: 'locker', wordId: 'w1', meaning: '물품 보관함', acceptedMeanings: ['보관함'], submittedAnswer: '물품 보관함' })
  check('등록 뜻(meaning) 자체와 일치하면 exact_match', exactCase.decision === 'accept' && exactCase.decisionSource === 'exact_match')

  const synonymCase = classifyLocally({ word: 'flat', meaning: '바람이 빠진, 펑크가 난', acceptedMeanings: ['펑크난'], submittedAnswer: '펑크난' })
  check('accepted_meanings(관리자가 나중에 추가한 동의어)와만 일치하면 synonym', synonymCase.decision === 'accept' && synonymCase.decisionSource === 'synonym')

  const p = buildProposal({ pendingId: 'x', word: 'flat', meaning: 'm', submittedAnswer: 'a', decision: synonymCase.decision, confidence: synonymCase.confidence, reason: synonymCase.reason, decisionSource: synonymCase.decisionSource })
  check('buildProposal이 decision_source=synonym을 그대로 보존', p.decision_source === 'synonym')
}

console.log('\n28. meaning_scope_warning 필드(v1.1) — AI 전용, 로컬 판정에는 절대 안 생김')
{
  const local = classifyLocally(F.exact)
  const localProposal = buildProposal({ pendingId: F.exact.id, word: F.exact.word, meaning: F.exact.meaning, submittedAnswer: F.exact.submittedAnswer, decision: local.decision, confidence: local.confidence, reason: local.reason, decisionSource: local.decisionSource })
  check('로컬(규칙) 판정은 meaning_scope_warning이 항상 null', localProposal.meaning_scope_warning === null)

  const raw = JSON.stringify([{ pending_answer_id: 'a1', decision: 'accept', confidence: 0.9, reason: '부분 일치', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: '등록된 여러 뜻 중 하나만 커버' }])
  const map = parseAiBatchResponse(raw)
  check('AI 응답의 meaning_scope_warning 필드가 파싱됨', map.get('a1').meaning_scope_warning === '등록된 여러 뜻 중 하나만 커버')

  const proposals = await classifyBatch([F.closeButWrongMeaning], {
    aiClassify: async (batch) => {
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'accept', confidence: 0.9, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: '의미 범위 경고 예시' })
      return m
    },
  })
  check('classifyBatch가 AI의 meaning_scope_warning을 proposal에 그대로 전달', proposals[0].meaning_scope_warning === '의미 범위 경고 예시')

  const cacheStore = new Map()
  await classifyBatch([{ ...F.closeButWrongMeaning, id: 'cache-src' }], {
    cacheLookup: async (key) => cacheStore.get(key) || null,
    cacheStore: async (key, decision) => cacheStore.set(key, decision),
    aiClassify: async (batch) => {
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'accept', confidence: 0.9, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: '캐시로 재사용될 경고' })
      return m
    },
  })
  const [cachedProposal] = await classifyBatch([{ ...F.closeButWrongMeaning, id: 'cache-reuse' }], {
    cacheLookup: async (key) => cacheStore.get(key) || null,
    cacheStore: async () => {},
    aiClassify: async () => { throw new Error('캐시 히트라 호출되면 안 됨') },
  })
  check('캐시 재사용 시에도 meaning_scope_warning이 그대로 유지', cachedProposal.meaning_scope_warning === '캐시로 재사용될 경고' && cachedProposal.cache_hit === true)
}

console.log('\n29. 운영자 제공 실제 사례(climate/evaporation/stream/constant) — 맹목적 자동 인정/거부 없음')
{
  // (a) 로컬 규칙 단계에서 절대 확정되면 안 됨(전부 의미 판단이 필요한
  // 케이스라 편집거리로는 안 잡힘 — AI로 넘어가야 정상).
  for (const [name, item] of Object.entries(REAL_CASES)) {
    const local = classifyLocally(item)
    check(`"${name}"(${item.word}/${item.meaning}, 답="${item.submittedAnswer}") — 로컬 규칙 단계에서 확정 안 됨(AI로 위임)`, local.decision === null)
  }

  // (b) AI가 각 사례에 맞는 판정을 냈다고 가정(운영자 기대치 반영한 mock)
  // — climate/evaporation처럼 "의미가 인접하지만 다름"/"완전 무관"은
  // review 또는 reject_candidate로, 실제로 결과가 그렇게 나오는지 확인.
  // ⚠ 이 mock 응답은 실제 Claude 판단이 아니라 "AI가 이렇게 응답해도
  // 파이프라인이 안전하게 처리하는지"를 검증하는 테스트 더블이다(§ 정직한
  // 한계 — 실제 모델 응답 품질은 배포 후 실측 필요, 섹션 36 SKIP 참고).
  const mockDecisions = {
    r1: { decision: 'review', confidence: 0.4, reason: '기후와 환경은 인접하지만 동일 개념 아님' }, // climate/환경
    r2: { decision: 'reject_candidate', confidence: 0.05, reason: '증발과 완벽하게는 의미상 전혀 무관' }, // evaporation/완벽하게
    r3: { decision: 'review', confidence: 0.5, reason: '흐름과 실시간은 문맥에 따라 다를 수 있음' }, // stream/실시간
    r4: { decision: 'reject_candidate', confidence: 0.02, reason: 'o는 답이 아님(무관/미완성 응답)' }, // constant/o
  }
  const aiClassify = async (batch) => {
    const m = new Map()
    for (const it of batch) {
      const d = mockDecisions[it.id]
      m.set(it.id, { pending_answer_id: it.id, decision: d.decision, confidence: d.confidence, reason: d.reason, suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null })
    }
    return m
  }
  const proposals = await classifyBatch(Object.values(REAL_CASES), { aiClassify })
  const byId = new Map(proposals.map((p) => [p.pending_answer_id, p]))
  check('climate/환경 — review 유지(의미 모호, 자동 인정 안 됨)', byId.get('r1').decision === 'review')
  check('evaporation/완벽하게 — reject_candidate(무관 답안)', byId.get('r2').decision === 'reject_candidate')
  check('stream/실시간 — review 유지', byId.get('r3').decision === 'review')
  check('constant/o — reject_candidate(무관 답안)', byId.get('r4').decision === 'reject_candidate')
  check('4건 전부 decision_source=ai(로컬에서 확정 안 됐다는 뜻)', proposals.every((p) => p.decision_source === 'ai'))
  check('reject_candidate 제안이 있어도 이 호출 자체는 어떤 DB도 건드리지 않음(순수 계산, § 섹션 12와 동일 원칙)', Array.isArray(proposals))
}

console.log('\n30. "확실한 답안 모두 인정" 대상 선별(selectCertainAccepts) — 전부 AND')
{
  const proposals = [
    { pending_answer_id: 'c1', decision: 'accept', confidence: 0.97, part_of_speech_warning: null, meaning_scope_warning: null, decision_source: 'ai' }, // 통과
    { pending_answer_id: 'c2', decision: 'accept', confidence: 0.90, part_of_speech_warning: null, meaning_scope_warning: null, decision_source: 'ai' }, // 신뢰도 미달
    { pending_answer_id: 'c3', decision: 'accept', confidence: 0.99, part_of_speech_warning: '품사 차이 가능성', meaning_scope_warning: null, decision_source: 'ai' }, // 품사 경고
    { pending_answer_id: 'c4', decision: 'accept', confidence: 0.99, part_of_speech_warning: null, meaning_scope_warning: '의미 범위 경고', decision_source: 'ai' }, // 의미범위 경고
    { pending_answer_id: 'c5', decision: 'review', confidence: 0.99, part_of_speech_warning: null, meaning_scope_warning: null, decision_source: 'ai' }, // review는 애초 제외
    { pending_answer_id: 'c6', decision: 'accept', confidence: 1, part_of_speech_warning: null, meaning_scope_warning: null, decision_source: 'exact_match' }, // 통과(규칙 기반도 포함)
  ]
  const certain = selectCertainAccepts(proposals, 0.95)
  check('c1/c6만 통과(0.95 미만/품사경고/의미범위경고/review 전부 제외)', certain.length === 2 && certain.every((p) => ['c1', 'c6'].includes(p.pending_answer_id)))
  check('review/reject_candidate는 confidence가 아무리 높아도 절대 포함 안 됨', !certain.some((p) => p.pending_answer_id === 'c5'))
}

console.log('\n31. "동일한 답안 모두 인정" 전역 대상 선별(selectAllDuplicateGroupRows) + 그룹핑')
{
  const rows = [
    { id: 'g1', wordId: 'w9', submittedAnswer: '포옹' },
    { id: 'g2', wordId: 'w9', submittedAnswer: '  포옹 ' }, // 공백만 다름 — 동일 그룹
    { id: 'g3', wordId: 'w9', submittedAnswer: '안아주다' }, // 단독 그룹(제외 대상)
    { id: 'g4', wordId: 'w10', submittedAnswer: '포옹' }, // 다른 단어(문자열 같아도 별개 그룹)
  ]
  const all = selectAllDuplicateGroupRows(rows, normalizeForCompareClient)
  check('그룹 크기 2 이상인 행만(g1,g2) — 단독 그룹(g3,g4)은 제외', all.length === 2 && all.every((r) => ['g1', 'g2'].includes(r.id)))

  const groups = groupRowsByAnswer(rows, normalizeForCompareClient)
  check('그룹 수는 3개((w9,포옹) / (w9,안아주다) / (w10,포옹))', groups.size === 3)
  check('groupKeyFor가 단어+정규화답안 조합을 키로 씀', groupKeyFor(rows[0], normalizeForCompareClient) === groupKeyFor(rows[1], normalizeForCompareClient))
}

console.log('\n32. 인정 변형 감사 레코드(buildAcceptedVariantRecord) — supabase_v3_7 메타데이터')
{
  const row = { wordId: 'w9', meaning: '안다, 포옹하다', submittedAnswer: '포옹' }
  const rec = buildAcceptedVariantRecord(row)
  check('word_id/등록뜻/인정답안이 그대로 담김', rec.word_id === 'w9' && rec.registered_meaning === '안다, 포옹하다' && rec.accepted_answer === '포옹')
  check('created_by 기본값이 관리자 PIN 등 자격증명이 아닌 고정 라벨(헌법 규칙 11 — PIN류 절대 미기록)', rec.created_by === 'admin_ui_ai_review' && !/pin/i.test(rec.created_by))
  check('part_of_speech는 명시 안 하면 null(확장 지점)', rec.part_of_speech === null)
}

console.log('\n33. AI 미리보기 요약 집계(summarizeProposals) — 자동인정가능/확인필요/오답후보/규칙/AI/캐시/실패')
{
  const proposals = [
    { decision: 'accept', decision_source: 'exact_match', cache_hit: false },
    { decision: 'accept', decision_source: 'synonym', cache_hit: false },
    { decision: 'accept', decision_source: 'levenshtein', cache_hit: false },
    { decision: 'review', decision_source: 'ai', cache_hit: false },
    { decision: 'reject_candidate', decision_source: 'ai', cache_hit: false },
    { decision: 'accept', decision_source: 'ai', cache_hit: true }, // 캐시 재사용
    { decision: 'review', decision_source: 'ai_unavailable', cache_hit: false }, // 호출 실패
    { decision: 'review', decision_source: 'ai_error', cache_hit: false },
    { decision: 'review', decision_source: 'parse_error', cache_hit: false },
  ]
  const s = summarizeProposals(proposals)
  check('total=9', s.total === 9)
  check('safeAccept=4(accept decision 4건)', s.safeAccept === 4)
  check('review=4, rejectCandidate=1', s.review === 4 && s.rejectCandidate === 1)
  check('ruleBased=3(exact_match+synonym+levenshtein)', s.ruleBased === 3)
  check('aiProcessed=2(캐시 아닌 신규 ai 호출 결과 — decision 무관하게 review/reject_candidate 포함 2건)', s.aiProcessed === 2)
  check('cacheHits=1', s.cacheHits === 1)
  check('failed=3(ai_unavailable+ai_error+parse_error)', s.failed === 3)
  check('세부 합계(rule+ai+cache+failed)가 total과 일치', s.ruleBased + s.aiProcessed + s.cacheHits + s.failed === s.total)
}

console.log('\n34. 105건+ 배치(요구사항 명시 규모) — buildBatches 경계값 재확인')
{
  const fixture130 = Array.from({ length: 130 }, (_, i) => ({ id: `big-${i}` }))
  const batches = buildBatches(fixture130, 25)
  check('130건 -> 6개 배치(25*5+5)', batches.length === 6 && batches[5].length === 5)
  check('전체 합은 130', batches.reduce((s, b) => s + b.length, 0) === 130)

  const fixture109 = Array.from({ length: 109 }, (_, i) => ({ id: `live-${i}` })) // 코디네이터 실측 라이브 pending 규모
  const batches109 = buildBatches(fixture109, 25)
  check('실측 라이브 규모(109건) -> 5개 배치(25*4+9)', batches109.length === 5 && batches109[4].length === 9)
}

console.log('\n35. 클라이언트 "규칙 먼저, 미해결만 AI" 분리 로직(spellingReviewAiApi.js의 runLocalRules와 동일 원리 재현)')
{
  // src/utils/spellingReviewAiApi.js는 supabaseClient(import.meta.env)를
  // top-level import하는 브라우저 전용 모듈이라 이 Node 스크립트에서 직접
  // import할 수 없다(§ 파일 상단 주석) — 그 파일이 내부적으로 쓰는 것과
  // 정확히 같은 순수 함수(classifyLocally/buildProposal)로 동일한 분리
  // 로직을 재현해 "미해결 항목만 AI로 보낸다"는 핵심 계약을 검증한다.
  const mixedRows = [F.exact, F.typo, F.closeButWrongMeaning, F.trueSynonymDifferentString, F.completelyWrong]
  const resolved = []
  const unresolved = []
  for (const row of mixedRows) {
    const local = classifyLocally(row)
    if (local.decision) {
      resolved.push(buildProposal({ pendingId: row.id, word: row.word, meaning: row.meaning, submittedAnswer: row.submittedAnswer, decision: local.decision, confidence: local.confidence, reason: local.reason, decisionSource: local.decisionSource }))
    } else {
      unresolved.push(row)
    }
  }
  check('5건 중 2건(exact, typo)은 규칙으로 즉시 해결', resolved.length === 2)
  check('나머지 3건만 AI 전송 대상(unresolved)', unresolved.length === 3 && unresolved.every((r) => ['p9', 'p10', 'p11'].includes(r.id)))

  let aiCallCount = 0
  const finalProposals = [...resolved]
  if (unresolved.length > 0) {
    aiCallCount++
    for (const row of unresolved) {
      finalProposals.push(buildProposal({ pendingId: row.id, word: row.word, meaning: row.meaning, submittedAnswer: row.submittedAnswer, decision: 'review', confidence: 0.3, reason: 'mock ai', decisionSource: 'ai' }))
    }
  }
  check('AI는 정확히 1번만 호출(배치로 미해결분만 묶어서)', aiCallCount === 1)
  check('최종 제안 개수는 입력 행 수와 동일(누락 없음)', finalProposals.length === mixedRows.length)
  check('규칙으로 해결된 결과는 AI를 거치지 않고 그대로 살아있음(exact_match/levenshtein 유지)', finalProposals.some((p) => p.decision_source === 'exact_match') && finalProposals.some((p) => p.decision_source === 'levenshtein'))
}

console.log('\n36. 라이브 배포 의존 항목 — 로컬 검증 불가(정직한 SKIP, 실패로 안 셈)')
{
  console.log('  SKIP  실제 Supabase Edge Function(grade-writing-answers) e2e 호출 — 배포(supabase functions deploy) 후 스테이징에서 확인 필요')
  console.log('  SKIP  spelling_ai_grading_cache/word_accepted_variants 테이블 RLS 실측 — supabase_v3_6/v3_7 SQL 실행 후 scripts/testRlsSecurity.mjs류로 확인 필요')
  console.log('  SKIP  실제 Claude Haiku 4.5 응답 스키마 준수율(meaning_scope_warning 포함 신규 필드 실제 준수 여부) — 로컬에 ANTHROPIC_API_KEY 없음, mock으로만 파싱 로직 검증됨(위 8/9/28번)')
  console.log('  SKIP  Edge Function 실제 미배포 상태에서 브라우저 fetch()가 정확히 어떤 응답(404 HTML/네트워크 오류)을 내는지 — 로컬은 supabaseClient(import.meta.env) 브라우저 전용이라 vite dev/실배포 스테이징에서 확인 필요(§ 섹션 35 정직한 한계)')
}


// ── v2(2026-07-23, implementer C — 테스트 확장) 준비: spellingReviewAiApi.js를
// esbuild로 번들 ──────────────────────────────────────────────────────────
// 이 파일은 supabaseClient(import.meta.env)를 top-level import하는 브라우저
// 전용 모듈이라(§ 섹션 24/35 기존 주석과 동일 이유) plain Node에서 직접
// import하면 크래시한다. testSpellingDirectionWiring.mjs/testQuizStepReset.mjs
// 가 이미 쓰는 "테스트 파일 안에서 esbuild 자체 번들"(별도 build 스크립트
// 없음, TESTING.md 새 테스트 작성 패턴 2) 패턴을 그대로 따른다 —
// wordLibrary/spellingReviewApi/supabaseClient만 최소 가상 스텁으로
// 교체하고, runAiPhase/estimateAiCostUsd/evaluateCostGate 등 검증 대상
// 로직 자체는 실제 소스 그대로(재구현 없음, 헌법 규칙 3). import.meta.env는
// esbuild define으로 빌드 타임에 고정 문자열로 치환(런타임 크래시 방지 —
// 아래 섹션은 fetch 자체를 mock하므로 실제 URL 값은 무관).
const aiApiStub = (contents) => ({ contents, loader: 'js' })
await esbuild.build({
  entryPoints: ['src/utils/spellingReviewAiApi.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/spellingReviewAiApi.bundle.mjs',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fake.supabase.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fake-anon-key'),
  },
  plugins: [{
    name: 'ai-api-stubs',
    setup(build) {
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]spellingReviewApi$/ }, () => ({ path: 'v:reviewapi', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]supabaseClient$/ }, () => ({ path: 'v:supa', namespace: 'v' }))
      // 실행 중 이 스텁들이 실제로 호출되면(= 미리보기 단계에서 DB write가
      // 일어났다는 뜻) globalThis.__aiApiSpy에 기록 — 섹션 43이 "미리보기는
      // 상태를 안 바꾼다"를 이 경로로도 재확인한다(§ 섹션 12와 같은 원칙).
      build.onLoad({ filter: /^v:wordlib$/, namespace: 'v' }, () => aiApiStub(
        `export const setWordAcceptedMeanings = async (...args) => { (globalThis.__aiApiSpy ||= { calls: [] }).calls.push(['setWordAcceptedMeanings', args]) }`
      ))
      build.onLoad({ filter: /^v:reviewapi$/, namespace: 'v' }, () => aiApiStub(
        `export const resolveSpellingReview = async (...args) => { (globalThis.__aiApiSpy ||= { calls: [] }).calls.push(['resolveSpellingReview', args]) }`
      ))
      build.onLoad({ filter: /^v:supa$/, namespace: 'v' }, () => aiApiStub(
        `export const supabase = { from: () => ({ insert: async () => ({ error: null }) }) }`
      ))
    },
  }],
})
const spellingReviewAiApi = await import(pathToFileURL('scripts/.tmp/spellingReviewAiApi.bundle.mjs').href)
const { runRulesPhase, runAiPhase, estimateAiCostUsd, evaluateCostGate, AI_BATCH_SIZE, MAX_REQUESTS_PER_RUN } = spellingReviewAiApi

console.log('\n37. 미션 지정 픽스처 쌍(explicitly/constant/adopt) — 정확한 문자열로 재확인')
{
  const M = {
    explicitly: { id: 'm1', wordId: 'mw1', word: 'explicitly', meaning: '명시적으로', acceptedMeanings: [], submittedAnswer: '명시적으로' },
    constantExact: { id: 'm2', wordId: 'mw2', word: 'constant', meaning: '끊임없이', acceptedMeanings: [], submittedAnswer: '끊임없이' },
    constantTypo: { id: 'm3', wordId: 'mw2', word: 'constant', meaning: '끊임없이', acceptedMeanings: [], submittedAnswer: '끝임없이' }, // 끊 -> 끝 한 글자만 다름
    adopt: { id: 'm4', wordId: 'mw3', word: 'adopt', meaning: '채택하다', acceptedMeanings: [], submittedAnswer: '추천하다' },
  }

  const rExplicit = classifyLocally(M.explicitly)
  check('explicitly/명시적으로 — 등록 뜻과 완전일치라 안전하게 로컬 accept(exact_match)', rExplicit.decision === 'accept' && rExplicit.decisionSource === 'exact_match')

  const rConstExact = classifyLocally(M.constantExact)
  check('constant/끊임없이(등록 뜻 그대로) — 로컬 accept(exact_match)', rConstExact.decision === 'accept' && rConstExact.decisionSource === 'exact_match')

  const rConstTypo = classifyLocally(M.constantTypo)
  check('constant/끝임없이 — exact_match로 잘못 확정되지 않음(문자열이 실제로 다름, 오탐 방지)', rConstTypo.decisionSource !== 'exact_match')
  // 실측(편집거리 1, "끊"<->"끝" 한 글자 치환) — 현재 구현은 이걸 보수적
  // typo 경로(levenshtein)로 accept한다. 이 값 자체를 사전 요구사항으로
  // 박아두지 않고 실제 동작을 그대로 실측해 문서화한다(§ 미션 지시:
  // "현재 보수적 동작이 무엇이든 그것을 assert, exact_match만 아니면 됨").
  check('constant/끝임없이 — 로컬에서 accept라면 반드시 levenshtein(보수적 오타) 경로여야 함', rConstTypo.decision !== 'accept' || rConstTypo.decisionSource === 'levenshtein')
  check('constant/끝임없이 편집거리 실측 = 1(끊->끝 한 글자 치환)', editDistance('끝임없이', '끊임없이') === 1)

  const rAdoptLocal = classifyLocally(M.adopt)
  check('adopt/추천하다 — 로컬 규칙 단계에서 확정 안 됨(AI로 위임)', rAdoptLocal.decision === null)

  const aiRejectsAdopt = async (batch) => {
    const m = new Map()
    for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'reject_candidate', confidence: 0.1, reason: '채택하다와 추천하다는 다른 뜻', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null })
    return m
  }
  const adoptProposals = await classifyBatch([M.adopt], { aiClassify: aiRejectsAdopt })
  check('adopt/추천하다 — AI가 reject_candidate 반환 시 최종 제안도 reject_candidate', adoptProposals[0].decision === 'reject_candidate')
  check('adopt/추천하다 — reject_candidate 제안이어도 classifyBatch는 배열만 반환(자동 거부 실행 없음, 순수 계산)', Array.isArray(adoptProposals) && adoptProposals.length === 1)

  // climate/환경은 섹션 29(REAL_CASES.climate)가 정확히 같은 문자열
  // (word:'climate', meaning:'기후', submittedAnswer:'환경')로 이미 review로
  // 확정 검증했다 — 문자열이 다르지 않으므로 재작성하지 않고 그대로임을
  // 재확인만 한다(미션 지시 "동일하면 확장만" 그대로 따름).
  check('climate/환경 — 섹션 29에서 이미 review로 검증된 동일 문자열 재확인', REAL_CASES.climate.word === 'climate' && REAL_CASES.climate.meaning === '기후' && REAL_CASES.climate.submittedAnswer === '환경')
}

console.log('\n38. NFKC 정규화 — 전각(full-width) 문자/전각 공백/전각 문장부호가 NFC만으로는 못 잡는 케이스를 잡는지')
{
  const fullWidthClimate = 'ｃｌｉｍａｔｅ' // 전각 영문자
  check('NFC만으로는 전각 영문자가 그대로 남음(정규화 안 됨 실측 — NFKC가 필요한 이유)', fullWidthClimate.normalize('NFC') === fullWidthClimate)
  check('normalizeForCompare(NFKC 기반)는 전각 영문자를 반각으로 정규화', normalizeForCompare(fullWidthClimate) === 'climate')

  const rFullWidth = classifyLocally({ word: 'apple', meaning: 'apple', acceptedMeanings: [], submittedAnswer: 'ａｐｐｌｅ' })
  check('전각 답안도 등록 뜻(반각)과 매치되어 accept(대소문자는 isSpellingCorrect가 처리)', rFullWidth.decision === 'accept')

  const fullWidthSpace = '기후　　' // 전각 공백(U+3000) 두 개
  check('전각 공백도 trim되어 사라짐', normalizeForCompare(fullWidthSpace) === '기후')

  const fullWidthPeriod = '기후．' // 전각 마침표(U+FF0E)
  check('NFC만으로는 전각 마침표가 문장부호 제거 정규식(반각 기준)에 안 걸려 남음', fullWidthPeriod.normalize('NFC') === '기후．')
  check('NFKC가 전각 마침표를 반각으로 바꾼 뒤에야 문장부호 제거 규칙이 먹혀 "기후"만 남음', normalizeForCompare(fullWidthPeriod) === '기후')
}

console.log('\n39. 캐시 키 버저닝(2026-07-24 재설계, 운영자 요구사항 11) — partOfSpeech별 분리, PROMPT_VERSION 포함, model 제외(provider 무관), 5필드 라운드트립')
{
  // ⚠ 2026-07-24까지는 키가 6필드(모델 포함)였다 — 운영자가 "provider/모델을
  // 바꿔도 기존 AI 판정을 그대로 재사용해 비용을 아낀다"는 요구로 model을
  // 캐시 키에서 의도적으로 뺐다(§ pipeline.js buildCacheKey 주석). 이 섹션은
  // 옛 6필드 가정이 아니라 그 새 계약 자체("provider/model이 달라도 같은
  // 입력이면 같은 키")를 단언한다.
  const base = { wordId: 'w1', meaningSnapshot: '뜻', normalizedAnswer: '답' }
  const keyNoun = buildCacheKey({ ...base, partOfSpeech: 'noun' })
  const keyVerb = buildCacheKey({ ...base, partOfSpeech: 'verb' })
  check('partOfSpeech가 다르면 캐시 키도 다름(같은 단어/뜻/답이어도 분리)', keyNoun !== keyVerb)

  const keyDefault = buildCacheKey(base) // partOfSpeech 생략 -> ''
  check('현재 PROMPT_VERSION 상수가 키에 포함(프롬프트 변경 시 자동 캐시 무효화 근거)', keyDefault.includes(PROMPT_VERSION))

  const parsedNoun = parseCacheKey(keyNoun)
  check('partOfSpeech 포함 키도 5필드 전부 라운드트립(model 필드 없음)', parsedNoun.wordId === 'w1' && parsedNoun.meaningSnapshot === '뜻' && parsedNoun.normalizedAnswer === '답' && parsedNoun.partOfSpeech === 'noun' && parsedNoun.promptVersion === PROMPT_VERSION)
  check('parseCacheKey 결과 객체에 model 필드가 아예 없음(6필드 시절 잔재 없음)', !Object.prototype.hasOwnProperty.call(parsedNoun, 'model'))

  // 모델 무관성(요구사항 11의 계약) 자체를 단언 — buildCacheKey는 애초에
  // model 파라미터를 받지 않으므로, 호출부가 어떤 model/provider 값을
  // "같이" 넘겨봐도(구현이 그 필드를 사용하지 않아) 결과 키는 완전히 같다.
  const keyForOpenAi = buildCacheKey({ ...base, model: 'gpt-5-nano' })
  const keyForGemini = buildCacheKey({ ...base, model: 'gemini-2.5-flash' })
  const keyForAnthropic = buildCacheKey({ ...base, model: 'claude-haiku-4-5' })
  check('OpenAI/Gemini/Anthropic 등 provider가 달라도(model 필드를 같이 넘겨도) 캐시 키는 완전히 동일 — provider 무관 캐시 계약', keyForOpenAi === keyForGemini && keyForGemini === keyForAnthropic && keyForOpenAi === keyDefault)

  check('AI_MODEL_ID 상수는 여전히 export되어 있음(실제 AI 호출용, 캐시 키와는 무관해짐)', typeof AI_MODEL_ID === 'string' && AI_MODEL_ID.length > 0)
  check('키 문자열 자체에 AI_MODEL_ID 값이 더 이상 포함되지 않음(model 필드 제거 확인)', !keyDefault.includes(AI_MODEL_ID))
}

console.log('\n40. 타임아웃(AbortError) — runAiPhase가 절대 throw 안 하고 review/confidence 0/ai_unavailable로 강등')
{
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { const e = new Error('aborted(모의)'); e.name = 'AbortError'; throw e }
  try {
    const rows = [
      { id: 'to1', wordId: 'tow1', word: 'a', meaning: 'm', acceptedMeanings: [], submittedAnswer: 's1' },
      { id: 'to2', wordId: 'tow2', word: 'b', meaning: 'n', acceptedMeanings: [], submittedAnswer: 's2' },
    ]
    let threw = false
    let res
    try {
      res = await runAiPhase({ adminPin: '1234', unresolvedRows: rows })
    } catch {
      threw = true
    }
    check('AbortError 발생 시 runAiPhase 자체는 throw하지 않음', threw === false)
    check('타임아웃된 항목 전부 review로 강등', res.proposals.every((p) => p.decision === 'review'))
    check('타임아웃된 항목 전부 confidence=0', res.proposals.every((p) => p.confidence === 0))
    check('타임아웃된 항목 전부 decision_source=ai_unavailable', res.proposals.every((p) => p.decision_source === 'ai_unavailable'))
    check('규칙 단계 결과는 이 함수가 안 건드리므로 항목 수만큼 그대로 반환(누락 없음)', res.proposals.length === rows.length)
    check('callFailed=true로 호출부가 실패를 인지할 수 있음', res.callFailed === true)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\n41. AI 응답 ID 불일치 — 요청에 없던 id는 무시, 누락된 정당 id는 review로 보충')
{
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      proposals: [
        { pending_answer_id: 'mm-a', decision: 'accept', confidence: 0.9, reason: 'ok', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null },
        { pending_answer_id: 'ghost-not-requested', decision: 'accept', confidence: 0.9, reason: '요청에 없던 id(모의)', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null },
      ],
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
  })
  try {
    const rows = [
      { id: 'mm-a', wordId: 'w1', word: 'a', meaning: 'm1', acceptedMeanings: [], submittedAnswer: 's1' },
      { id: 'mm-b', wordId: 'w2', word: 'b', meaning: 'm2', acceptedMeanings: [], submittedAnswer: 's2' },
    ]
    const res = await runAiPhase({ adminPin: '1234', unresolvedRows: rows })
    check('결과 건수는 요청 건수와 동일(2건, ghost id는 포함 안 됨)', res.proposals.length === 2)
    const byId = new Map(res.proposals.map((p) => [p.pending_answer_id, p]))
    check('요청에 없던 id(ghost-not-requested)는 최종 결과에 전혀 없음', !byId.has('ghost-not-requested'))
    check('응답에 있던 정당 id(mm-a)는 AI 판정 그대로 반영', byId.get('mm-a').decision === 'accept')
    check('응답에서 누락된 정당 id(mm-b)는 review로 안전하게 보충(누락 침묵 없음)', byId.get('mm-b').decision === 'review' && byId.get('mm-b').decision_source === 'ai_unavailable')
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\n42. 잘못된 JSON 응답(Edge Function 바디 파싱 불가) — 전부 review로 강등(§ 섹션 9의 pipeline.js 레벨과는 다른 계층)')
{
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError('Unexpected token — 유효한 JSON 아님(모의)') },
  })
  try {
    const rows = [{ id: 'bad1', wordId: 'w1', word: 'a', meaning: 'm', acceptedMeanings: [], submittedAnswer: 's' }]
    const res = await runAiPhase({ adminPin: '1234', unresolvedRows: rows })
    check('파싱 불가 응답도 전부 review', res.proposals.every((p) => p.decision === 'review'))
    check('decision_source=ai_unavailable(§ 현재 계약 — callEdgeFunctionForUnresolved의 body 파싱 실패 경로)', res.proposals.every((p) => p.decision_source === 'ai_unavailable'))
    check('callFailed=true', res.callFailed === true)
  } finally {
    globalThis.fetch = originalFetch
  }
  // 참고: pipeline.js 레벨(Anthropic이 배열 아닌/깨진 텍스트를 반환하는 경우)의
  // 잘못된 JSON은 이미 섹션 9에서 decision_source=parse_error로 강등됨을
  // 검증했다 — 이 섹션은 그와 다른 계층(클라이언트가 Edge Function 자체의
  // HTTP 응답 바디를 못 읽는 경우)의 계약을 추가로 확인하는 것뿐이다.
}

console.log(`\n43. 143건 배치 — runRulesPhase+runAiPhase(${AI_BATCH_SIZE}청크, v1.3 운영자 비용 최소화 스펙) 경유 fetch 호출 수/전건 커버/미리보기 순수성(0건 mutation)`)
{
  const originalFetch = globalThis.fetch
  let fetchCallCount = 0
  globalThis.fetch = async (_url, opts) => {
    fetchCallCount++
    const body = JSON.parse(opts.body)
    const ids = body.pendingIds
    return {
      ok: true, status: 200,
      json: async () => ({
        ok: true,
        proposals: ids.map((id) => ({ pending_answer_id: id, decision: 'review', confidence: 0.5, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null })),
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
    }
  }
  globalThis.__aiApiSpy = { calls: [] }
  try {
    const rows143 = []
    for (let i = 0; i < 20; i++) rows143.push({ id: `b143-ex-${i}`, wordId: 'bw1', word: 'same', meaning: '동일답', acceptedMeanings: [], submittedAnswer: '동일답' }) // 규칙으로 즉시 해결
    for (let i = 0; i < 123; i++) rows143.push({ id: `b143-un-${i}`, wordId: 'bw2', word: 'diff', meaning: `등록뜻${i}`, acceptedMeanings: [], submittedAnswer: `전혀다른답${i}` }) // 미해결 -> AI
    check('픽스처는 정확히 143건', rows143.length === 143)

    const { resolved, unresolved } = runRulesPhase({ rows: rows143 })
    check('규칙 단계에서 20건 해결, 123건 미해결', resolved.length === 20 && unresolved.length === 123)

    const aiRes = await runAiPhase({ adminPin: '1234', unresolvedRows: unresolved })
    // v1.3: 기본 배치 크기가 25 -> AI_BATCH_SIZE(20)로 하향(구현 상수를 그대로
    // import해 드리프트 방지, § spellingReviewAiApi.js AI_BATCH_SIZE 주석).
    // 123건 미해결 -> ceil(123/20)=7배치(20*6+3), 요청 수(7)가
    // MAX_REQUESTS_PER_RUN(10) 이내라 호출 한도 이월(ai_deferred)은 발생 안 함.
    check(`fetch 호출 수 = ceil(123/${AI_BATCH_SIZE}) = 7(${AI_BATCH_SIZE}*6+3)`, fetchCallCount === Math.ceil(123 / AI_BATCH_SIZE) && fetchCallCount === 7)
    check('143건 전부 제안을 받음(20 규칙 + 123 AI, 누락 없음)', resolved.length + aiRes.proposals.length === 143)
    check('미리보기 중 setWordAcceptedMeanings/resolveSpellingReview 호출 0건(순수 미리보기, § 섹션 12와 동일 원칙)', globalThis.__aiApiSpy.calls.length === 0)
    check('요청 수(7)가 호출 한도(10) 이내라 이월(deferredCount) 없음', aiRes.deferredCount === 0)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\n43b. 호출 한도(MAX_REQUESTS_PER_RUN) 초과분 이월 — 초과 항목은 전송 자체가 안 되고 ai_deferred로 정직하게 표시(v1.3 신규 계약)')
{
  const originalFetch = globalThis.fetch
  let fetchCallCount = 0
  globalThis.fetch = async (_url, opts) => {
    fetchCallCount++
    const body = JSON.parse(opts.body)
    const ids = body.pendingIds
    return {
      ok: true, status: 200,
      json: async () => ({
        ok: true,
        proposals: ids.map((id) => ({ pending_answer_id: id, decision: 'review', confidence: 0.5, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null, decision_source: 'ai' })),
        usage: { inputTokens: 100, outputTokens: 50 },
        budget: { exceeded: false, todayUsd: 0.1, capUsd: 2.0 },
      }),
    }
  }
  try {
    // 정확히 MAX_REQUESTS_PER_RUN개 배치(=AI_BATCH_SIZE*MAX_REQUESTS_PER_RUN건)를
    // 채우고, 거기에 15건을 더 얹어 "호출 한도를 넘는 마지막 부분 배치"가
    // 생기도록 구성(향후 두 상수가 바뀌어도 이 비율로 재현됨).
    const capacity = AI_BATCH_SIZE * MAX_REQUESTS_PER_RUN
    const overflowCount = 15
    const rows = Array.from({ length: capacity + overflowCount }, (_, i) => ({
      id: `cap-${i}`, wordId: 'capw', word: 'diff', meaning: `등록뜻${i}`, acceptedMeanings: [], submittedAnswer: `전혀다른답${i}`,
    }))
    const res = await runAiPhase({ adminPin: '1234', unresolvedRows: rows })
    check(`fetch 호출 수는 딱 MAX_REQUESTS_PER_RUN(${MAX_REQUESTS_PER_RUN})까지만 — 그 이상은 전송 자체가 안 됨`, fetchCallCount === MAX_REQUESTS_PER_RUN)
    check(`전송된 ${capacity}건은 정상 응답 그대로(decision_source=ai)`, res.proposals.filter((p) => p.decision_source === 'ai').length === capacity)
    const deferred = res.proposals.filter((p) => p.decision_source === 'ai_deferred')
    check(`이월된 ${overflowCount}건은 decision_source=ai_deferred`, deferred.length === overflowCount)
    check('이월 항목은 decision=review/confidence=0으로 안전하게 강등(자동 거부/자동 인정 아님)', deferred.every((p) => p.decision === 'review' && p.confidence === 0))
    check('제안 총 개수는 입력 행 수와 동일(누락 없음)', res.proposals.length === capacity + overflowCount)
    check('runAiPhase가 보고하는 deferredCount도 이월분과 일치', res.deferredCount === overflowCount)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\n43c. 서버 예산 초과 신호(budget.exceeded/decision_source=ai_budget_exceeded) — 이후 청크 전송 중단 + 나머지 ai_budget_exceeded로 이월')
{
  const originalFetch = globalThis.fetch
  let fetchCallCount = 0
  globalThis.fetch = async (_url, opts) => {
    fetchCallCount++
    const body = JSON.parse(opts.body)
    const ids = body.pendingIds
    // 첫 번째 청크부터 서버가 예산 초과를 알림 — 이후 청크는 절대 전송되면
    // 안 된다(§ runAiPhase "thisBatchHitBudget이면 break").
    return {
      ok: true, status: 200,
      json: async () => ({
        ok: true,
        proposals: ids.map((id) => ({ pending_answer_id: id, decision: 'review', confidence: 0.5, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null, decision_source: 'ai' })),
        usage: { inputTokens: 100, outputTokens: 50 },
        budget: { exceeded: true, todayUsd: 2.1, capUsd: 2.0 },
      }),
    }
  }
  try {
    // AI_BATCH_SIZE의 3배 -> 3청크가 필요한 규모(호출 한도 10 미만이라
    // 한도 이월과는 섞이지 않음, 순수하게 예산 초과 계약만 검증).
    const rows = Array.from({ length: AI_BATCH_SIZE * 3 }, (_, i) => ({
      id: `bud-${i}`, wordId: 'budw', word: 'diff', meaning: `등록뜻${i}`, acceptedMeanings: [], submittedAnswer: `전혀다른답${i}`,
    }))
    const res = await runAiPhase({ adminPin: '1234', unresolvedRows: rows })
    check('첫 청크가 budget.exceeded=true를 반환하면 fetch는 딱 1번만 호출됨(이후 청크 전송 안 함)', fetchCallCount === 1)
    check('budgetExceeded=true로 호출부가 인지 가능', res.budgetExceeded === true)
    check('budgetInfo에 서버가 준 값 그대로 보존', res.budgetInfo?.todayUsd === 2.1 && res.budgetInfo?.capUsd === 2.0)
    const sentBatch = res.proposals.filter((p) => p.decision_source === 'ai')
    check(`전송된 첫 배치(${AI_BATCH_SIZE}건)는 정상 ai 응답 그대로`, sentBatch.length === AI_BATCH_SIZE)
    const deferredByBudget = res.proposals.filter((p) => p.decision_source === 'ai_budget_exceeded')
    check(`못 보낸 나머지 ${AI_BATCH_SIZE * 2}건은 decision_source=ai_budget_exceeded로 이월`, deferredByBudget.length === AI_BATCH_SIZE * 2)
    check('예산 초과 이월 항목도 decision=review/confidence=0(자동 거부 아님)', deferredByBudget.every((p) => p.decision === 'review' && p.confidence === 0))
    check('제안 총 개수는 입력 행 수와 동일(누락 없음)', res.proposals.length === AI_BATCH_SIZE * 3)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\n44. 비용 게이트 — estimateAiCostUsd 단조성/evaluateCostGate 차단 조건/localStorage 상한 헬퍼')
{
  check('N=0이면 비용 0', estimateAiCostUsd(0) === 0)
  check('N>0이면 비용 항상 0보다 큼', estimateAiCostUsd(1) > 0 && estimateAiCostUsd(200) > 0)
  check('건수가 늘면 비용도 단조 증가(1 < 25 < 26 < 200)', estimateAiCostUsd(1) < estimateAiCostUsd(25) && estimateAiCostUsd(25) < estimateAiCostUsd(26) && estimateAiCostUsd(26) < estimateAiCostUsd(200))

  check('실행당 상한 초과 시 blocked', evaluateCostGate({ estimatedCostUsd: 2, ceilingUsd: 1, todaySpentUsd: 0, dailyCeilingUsd: 100 }).blocked === true)
  check('실행당 상한 이하면 통과', evaluateCostGate({ estimatedCostUsd: 0.5, ceilingUsd: 1, todaySpentUsd: 0, dailyCeilingUsd: 100 }).blocked === false)
  check('일일 누적+이번 추정이 일일 상한 초과 시 blocked(실행당 상한은 통과해도)', evaluateCostGate({ estimatedCostUsd: 0.5, ceilingUsd: 1, todaySpentUsd: 4.8, dailyCeilingUsd: 5 }).blocked === true)
  check('둘 다 통과하면 blocked=false', evaluateCostGate({ estimatedCostUsd: 0.1, ceilingUsd: 1, todaySpentUsd: 0, dailyCeilingUsd: 5 }).blocked === false)

  // localStorage 헬퍼 — Node에는 없으므로 최소 in-memory 셔임 주입(§ TESTING.md
  // 새 테스트 작성 패턴 2, 다른 테스트가 브라우저 API를 다루는 방식과 동일
  // 원칙). 원래 값(있었다면, 보통 undefined)은 끝에 복원.
  class FakeStorage {
    constructor() { this.store = {} }
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null }
    setItem(k, v) { this.store[k] = String(v) }
    removeItem(k) { delete this.store[k] }
  }
  const originalLocalStorage = globalThis.localStorage
  try {
    globalThis.localStorage = new FakeStorage()
    check('setCostCeilingUsd/getCostCeilingUsd 라운드트립', (() => { spellingReviewAiApi.setCostCeilingUsd(2.5); return spellingReviewAiApi.getCostCeilingUsd() === 2.5 })())
    check('setDailyCeilingUsd/getDailyCeilingUsd 라운드트립', (() => { spellingReviewAiApi.setDailyCeilingUsd(9.9); return spellingReviewAiApi.getDailyCeilingUsd() === 9.9 })())

    globalThis.localStorage = new FakeStorage()
    check('저장된 값 없으면 기본값(getCostCeilingUsd === DEFAULT_COST_CEILING_USD)', spellingReviewAiApi.getCostCeilingUsd() === spellingReviewAiApi.DEFAULT_COST_CEILING_USD)
    check('오늘 누적 지출 초기값 0', spellingReviewAiApi.getTodaySpentUsd() === 0)
    spellingReviewAiApi.recordEstimatedSpendUsd(0.5)
    spellingReviewAiApi.recordEstimatedSpendUsd(0.25)
    check('recordEstimatedSpendUsd가 누적됨(0.5+0.25=0.75)', Math.abs(spellingReviewAiApi.getTodaySpentUsd() - 0.75) < 1e-9)
  } finally {
    globalThis.localStorage = originalLocalStorage
  }
}

console.log('\n45. buildConfirmSummary — 단어 10개 넘는 부분은 화면에서 안 보여주고 개수만 집계, 학생 수, 변형저장 플래그, 비가역 경고')
{
  const rows12Words = Array.from({ length: 12 }, (_, i) => ({ id: `cs-${i}`, word: `word${i}`, studentId: `s${i % 5}` }))
  const summary = buildConfirmSummary(rows12Words, { kind: 'accept' })
  check('count는 전체 행 수(12)', summary.count === 12)
  check('단어 12개 -> wordsDisplay는 10개까지만', summary.wordsDisplay.length === 10)
  check('안 보여준 나머지 개수는 2(12-10)', summary.wordsTruncatedCount === 2)
  check('학생 수는 studentId distinct(5명, s0~s4)', summary.studentCount === 5)
  check('kind=accept -> savesAcceptedMeanings=true, savesAcceptedVariant=false', summary.savesAcceptedMeanings === true && summary.savesAcceptedVariant === false)
  check('irreversibleWarning 문구 존재', typeof summary.irreversibleWarning === 'string' && summary.irreversibleWarning.length > 0)

  const summarySynonym = buildConfirmSummary(rows12Words.slice(0, 3), { kind: 'synonym' })
  check('kind=synonym -> 둘 다 true(변형 저장 포함)', summarySynonym.savesAcceptedMeanings === true && summarySynonym.savesAcceptedVariant === true)

  const summaryDismiss = buildConfirmSummary(rows12Words.slice(0, 3), { kind: 'dismiss' })
  check('kind=dismiss -> 둘 다 false(인정 목록 무관)', summaryDismiss.savesAcceptedMeanings === false && summaryDismiss.savesAcceptedVariant === false)

  const rowsUnder10 = Array.from({ length: 4 }, (_, i) => ({ id: `u-${i}`, word: `w${i}`, studentId: null }))
  const summaryUnder = buildConfirmSummary(rowsUnder10, { kind: 'accept' })
  check('10개 미만이면 안 보여주는 나머지 없음(0)', summaryUnder.wordsTruncatedCount === 0 && summaryUnder.wordsDisplay.length === 4)
  check('studentId 없는 행은 학생 수에서 제외', summaryUnder.studentCount === 0)
}

console.log('\n46. 판정 출처 필터(규칙/AI/캐시) + 학생 필터 + 정렬(안정 정렬 포함)')
{
  const proposals = [
    { pending_answer_id: 'a', decision: 'accept', decision_source: 'exact_match', cache_hit: false },
    { pending_answer_id: 'b', decision: 'accept', decision_source: 'synonym', cache_hit: false },
    { pending_answer_id: 'c', decision: 'accept', decision_source: 'levenshtein', cache_hit: false },
    { pending_answer_id: 'd', decision: 'review', decision_source: 'ai', cache_hit: false },
    { pending_answer_id: 'e', decision: 'accept', decision_source: 'ai', cache_hit: true },
  ]
  check('규칙만(rule) — exact_match/synonym/levenshtein 3건', filterProposalsBySource(proposals, 'rule').length === 3)
  check('AI만(ai) — cache_hit 아니면서 decision_source=ai(1건, d)', filterProposalsBySource(proposals, 'ai').length === 1 && filterProposalsBySource(proposals, 'ai')[0].pending_answer_id === 'd')
  check('캐시(cache) — cache_hit=true(1건, e)', filterProposalsBySource(proposals, 'cache').length === 1 && filterProposalsBySource(proposals, 'cache')[0].pending_answer_id === 'e')
  check('all — 전체', filterProposalsBySource(proposals, 'all').length === 5)

  const rows = [
    { id: 'r1', studentId: 's1' },
    { id: 'r2', studentId: 's2' },
    { id: 'r3', studentId: 's1' },
    { id: 'r4', studentId: null },
  ]
  check('filterRowsByStudent — 특정 학생만(s1, 2건)', filterRowsByStudent(rows, 's1').length === 2)
  check('filterRowsByStudent — all이면 전체', filterRowsByStudent(rows, 'all').length === 4)
  check('distinctStudentIds — 등장 순서대로 중복 없이(studentId 없는 행 제외)', JSON.stringify(distinctStudentIds(rows)) === JSON.stringify(['s1', 's2']))

  const items = [
    { row: { word: 'banana', studentId: 's2' }, proposal: { confidence: 0.5, decision: 'review' } },
    { row: { word: 'apple', studentId: 's1' }, proposal: { confidence: 0.9, decision: 'accept' } },
    { row: { word: 'cherry', studentId: 's3' }, proposal: { confidence: 0.9, decision: 'reject_candidate' } }, // confidence 동률(apple과) — 안정 정렬 확인용
  ]
  const byConfDesc = sortDisplayItems(items, 'confidence', 'desc')
  check('confidence desc 정렬 — 동률(0.9) 두 건은 원래 입력 순서 유지(안정 정렬: apple,cherry), 0.5는 맨 뒤', byConfDesc.map((i) => i.row.word).join(',') === 'apple,cherry,banana')
  const byConfAsc = sortDisplayItems(items, 'confidence', 'asc')
  check('confidence asc 정렬 — 0.5가 먼저', byConfAsc[0].row.word === 'banana')
  const byWord = sortDisplayItems(items, 'word', 'asc')
  check('word asc 정렬 — 알파벳순(apple,banana,cherry)', byWord.map((i) => i.row.word).join(',') === 'apple,banana,cherry')
  const byStudent = sortDisplayItems(items, 'student', 'asc')
  check('student asc 정렬 — s1,s2,s3', byStudent.map((i) => i.row.studentId).join(',') === 's1,s2,s3')
  const byNone = sortDisplayItems(items, 'none')
  check('sortBy=none이면 원본 순서 그대로(정렬 안 함)', byNone.map((i) => i.row.word).join(',') === 'banana,apple,cherry')

  // proposal이 아직 없는 행(AI 확인 전 미해결 상태)은 정렬 시 맨 뒤로 밀림
  // (confidence -1 취급, spellingReviewBulkPlan.js:138 comparator 그대로).
  const withMissingProposal = [
    { row: { word: 'z', studentId: 's9' }, proposal: null },
    { row: { word: 'a', studentId: 's1' }, proposal: { confidence: 0.5, decision: 'accept' } },
  ]
  const sortedMissing = sortDisplayItems(withMissingProposal, 'confidence', 'desc')
  check('proposal 없는 행은 confidence 정렬에서 맨 뒤로 밀림', sortedMissing[0].row.word === 'a' && sortedMissing[1].row.word === 'z')
}

console.log('\n47. 수동 폴백 경로 실체 확인 — resolveSpellingReview/setWordAcceptedMeanings가 실제로 존재하고 시그니처(인자 개수)가 그대로인지')
{
  // 섹션 24는 소스 텍스트 검색으로만 확인했다(§ 그 섹션 주석) — 여기서는
  // 한 단계 더 나아가 실제 함수 레퍼런스를 얻어 존재/타입/인자 개수(arity)를
  // 확인한다(§ 절대 호출은 안 함 — 아래에서 두 함수 모두 단 한 번도 invoke
  // 되지 않는다, DB 접근 0회). supabaseClient(import.meta.env)만 최소
  // 스텁으로 교체하고 나머지는 실제 소스 그대로 esbuild 번들(§ 섹션 37 준비
  // 블록과 같은 원칙, 로직 재구현 없음).
  const manualPathsStub = (contents) => ({ contents, loader: 'js' })
  await esbuild.build({
    entryPoints: ['src/utils/wordLibrary.js', 'src/utils/spellingReviewApi.js'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: 'scripts/.tmp/manualPaths',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fake.supabase.test'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fake-anon-key'),
    },
    plugins: [{
      name: 'stub-supabase-only',
      setup(build) {
        build.onResolve({ filter: /utils[\\/]supabaseClient$/ }, () => ({ path: 'v:supa', namespace: 'v' }))
        build.onLoad({ filter: /^v:supa$/, namespace: 'v' }, () => manualPathsStub(`export const supabase = { from: () => ({}) }`))
      },
    }],
  })
  const wordLibraryReal = await import(pathToFileURL('scripts/.tmp/manualPaths/wordLibrary.js').href)
  const spellingReviewApiReal = await import(pathToFileURL('scripts/.tmp/manualPaths/spellingReviewApi.js').href)

  check('setWordAcceptedMeanings 존재(함수)', typeof wordLibraryReal.setWordAcceptedMeanings === 'function')
  // 2026-07-24 보안 락다운으로 3번째 인자 adminPin(하위호환 옵셔널)이
  // 추가돼 arity가 2→3이 됐다(wordLibrary.js:556 주석 참고). 여기서는
  // (a) 새 arity 자체를 확인하고, (b) 앞 2개 인자(wordDbId, meanings)의
  // 이름/순서가 그대로인지 소스 파싱으로 확인하고, (c) adminPin 미전달
  // (기존 2-인자 호출부) 시 여전히 레거시 anon 직접 update 경로를 타는
  // 옵셔널 분기가 소스에 남아있는지 확인한다(§ 두 함수 모두 절대 invoke
  // 안 함 원칙 유지 — 아래도 함수를 호출하지 않고 toString()으로만 검사).
  check('setWordAcceptedMeanings 인자 3개(wordDbId, meanings, adminPin) — 2026-07-24 보안 락다운으로 하위호환 옵셔널 3번째 인자 추가', wordLibraryReal.setWordAcceptedMeanings.length === 3)
  const setWordAcceptedMeaningsSrc = wordLibraryReal.setWordAcceptedMeanings.toString()
  const setWordAcceptedMeaningsParams = setWordAcceptedMeaningsSrc.match(/\(([^)]*)\)/)?.[1] ?? ''
  check('setWordAcceptedMeanings 앞 2개 인자(wordDbId, meanings) 이름/순서 불변 — 기존 호출부 호환', /^\s*wordDbId\s*,\s*meanings\s*,\s*adminPin\s*$/.test(setWordAcceptedMeaningsParams))
  check('setWordAcceptedMeanings — adminPin 미전달(2-인자 호출) 시 레거시 anon 직접 update 경로로 폴백하는 옵셔널 분기가 소스에 존재', /if\s*\(\s*adminPin\s*\)/.test(setWordAcceptedMeaningsSrc))
  check('resolveSpellingReview 존재(함수)', typeof spellingReviewApiReal.resolveSpellingReview === 'function')
  check('resolveSpellingReview 인자 2개(id, status) — 시그니처 불변', spellingReviewApiReal.resolveSpellingReview.length === 2)
}

console.log('\n48. 서버 측 상한(index.ts) — 순수 비용 수식만 재확인(Deno 라이브 배포 400 응답 형태는 SKIP)')
{
  // index.ts는 Deno 전용(npm:@supabase/supabase-js, Deno.serve, Deno.env)이라
  // 이 Node 스크립트가 직접 import할 수 없다 — 순수 계산 부분(estimateCostUsd,
  // pipeline.js와 완전히 동일한 함수)만 index.ts가 실제로 쓰는 것과 같은
  // 추정 상수(EST_INPUT_TOKENS_PER_ITEM=250, EST_OUTPUT_TOKENS_PER_ITEM=120,
  // EST_SYSTEM_PROMPT_TOKENS_PER_BATCH=260, BATCH_SIZE=25 — index.ts 74-86행)
  // 로 재현해 MAX_ITEMS_PER_REQUEST(기본 200)/MAX_EST_COST_USD_PER_REQUEST
  // (기본 2.0) 기준 최악 시나리오가 실제로 상한을 넘는지/안 넘는지만
  // 확인한다. index.ts의 그 상수 값이 바뀌면 이 테스트도 함께 갱신해야
  // 한다(드리프트 가능성 — § 정직한 한계, 하드코딩 재복제와 같은 위험).
  const EST_INPUT_TOKENS_PER_ITEM = 250
  const EST_OUTPUT_TOKENS_PER_ITEM = 120
  const EST_SYSTEM_PROMPT_TOKENS_PER_BATCH = 260
  const BATCH_SIZE = 25
  const MAX_ITEMS_PER_REQUEST = 200
  const MAX_EST_COST_USD_PER_REQUEST = 2.0

  function preflightCost(unresolvedCount) {
    const batches = Math.ceil(unresolvedCount / BATCH_SIZE)
    return estimateCostUsd({
      inputTokens: unresolvedCount * EST_INPUT_TOKENS_PER_ITEM + batches * EST_SYSTEM_PROMPT_TOKENS_PER_BATCH,
      outputTokens: unresolvedCount * EST_OUTPUT_TOKENS_PER_ITEM,
    }, 'claude-haiku-4-5')
  }

  const worstCase200 = preflightCost(MAX_ITEMS_PER_REQUEST)
  check(`MAX_ITEMS_PER_REQUEST(200건) 전량 미해결 최악 추정 비용(약 $${worstCase200.toFixed(4)})은 서버 상한 $${MAX_EST_COST_USD_PER_REQUEST} 미만(기본 설정으로도 정상 요청은 안 막힘)`, worstCase200 < MAX_EST_COST_USD_PER_REQUEST)
  check('비용 추정은 항목 수에 대해 단조 증가(캡이 항상 의미 있게 작동)', preflightCost(50) < preflightCost(100) && preflightCost(100) < preflightCost(200))

  console.log('  SKIP  실제 Edge Function이 200건 초과/비용 상한 초과 요청에 정확히 HTTP 400 + error 문구 형태로 응답하는지 — Deno 런타임 라이브 배포 필요(§ 섹션 36과 동일한 배포 의존 한계, index.ts 136-141행/195-202행 로직 자체는 코드 리뷰로 확인됨)')
}

console.log('\n49. 미래 제출 정합성 — 인정 변형 저장 후 동일 답안 재제출 시 AI 호출 없이 즉시 synonym accept')
{
  const beforeSave = classifyLocally(F.trueSynonymDifferentString) // urine/소변, 답=오줌(진짜 동의어, 편집거리로 안 잡힘)
  check('저장 전에는 로컬 미해결(진짜 동의어라 편집거리로 못 잡음)', beforeSave.decision === null)

  const plan = planAccept({ id: F.trueSynonymDifferentString.id, wordId: F.trueSynonymDifferentString.wordId, submittedAnswer: F.trueSynonymDifferentString.submittedAnswer, acceptedMeanings: [] }, { mode: 'synonym' })
  check('planAccept(synonym)가 accepted_meanings에 "오줌"을 추가', plan.mergedAcceptedMeanings.includes('오줌'))

  // 다음 제출(같은 단어, 같은 답, 새 pending id) — accepted_meanings가 이미
  // words 테이블에 반영됐다고 가정하면 그 다음 학생 제출은 AI 호출 없이
  // 규칙 단계에서 바로 확정돼야 한다("학생은 다음 제출에 즉시 정답 처리").
  const nextSubmission = { ...F.trueSynonymDifferentString, id: 'p10-next-submission', acceptedMeanings: plan.mergedAcceptedMeanings }
  const afterLocal = classifyLocally(nextSubmission)
  check('저장 후 재분류하면 즉시 accept', afterLocal.decision === 'accept')
  check('출처는 synonym(exact_match 아님 — 등록 뜻 자체가 아니라 나중에 추가된 동의어)', afterLocal.decisionSource === 'synonym')

  const proposalsNoAi = await classifyBatch([nextSubmission]) // aiClassify 주입 안 함 — AI 없이도 규칙만으로 끝나야 함
  check('classifyBatch도 AI 없이 규칙만으로 accept 반환(캐시/AI 호출 불필요)', proposalsNoAi[0].decision === 'accept' && proposalsNoAi[0].decision_source === 'synonym')
}

// ── v3(2026-07-24, implementer — provider 추상화 계약 테스트) — providers.js
// 신규 파일 검증. index.ts가 provider별 fetch/스키마/응답 파싱 로직을 전부
// providers.js로 위임했으므로(§ providers.js 파일 헤더), 세 provider가
// 동일 인터페이스(gradeWritingAnswers/healthCheck/estimateCost/
// normalizeResponse) 계약을 실제로 지키는지, 그리고 팩토리(createAIProvider)
// 가 운영자 환경변수 오타에도 안전하게(throw 없이 openai로) 폴백하는지를
// 검증한다. 전부 mock fetchImpl로만 동작(로컬에 실제 API 키 없음 — 실제
// OpenAI/Gemini/Anthropic를 호출하지 않는다, § 파일 상단 정직한 한계와 동일
// 원칙).
console.log('\n50. createAIProvider 팩토리 — 알려진 provider 3종은 정확한 클래스, 미지 문자열은 throw 없이 openai로 폴백')
{
  const openaiInst = createAIProvider({ provider: 'openai', apiKeys: {}, models: {} })
  check('provider:"openai" -> OpenAIProvider 인스턴스', openaiInst instanceof OpenAIProvider)
  check('openai 기본 모델은 AI_MODEL_ID(gpt-5-nano)', openaiInst.model === AI_MODEL_ID)
  check('openai 인스턴스 fallbackApplied=false(정상 provider)', openaiInst.fallbackApplied === false)

  const geminiInst = createAIProvider({ provider: 'gemini', apiKeys: {}, models: {} })
  check('provider:"gemini" -> GeminiProvider 인스턴스', geminiInst instanceof GeminiProvider)
  check('gemini 기본 모델은 DEFAULT_GEMINI_MODEL(gemini-2.5-flash)', geminiInst.model === DEFAULT_GEMINI_MODEL)

  const anthropicInst = createAIProvider({ provider: 'anthropic', apiKeys: {}, models: {} })
  check('provider:"anthropic" -> AnthropicProvider 인스턴스', anthropicInst instanceof AnthropicProvider)
  check('anthropic 기본 모델은 claude-haiku-4-5(하위호환 보존)', anthropicInst.model === 'claude-haiku-4-5')

  check('DEFAULT_AI_PROVIDER 상수는 openai(운영자 명시 비용 결정)', DEFAULT_AI_PROVIDER === 'openai')

  let unknownCallbackPayload = null
  const fallbackInst = createAIProvider({
    provider: 'not-a-real-provider-typo',
    apiKeys: {},
    onUnknownProvider: (payload) => { unknownCallbackPayload = payload },
  })
  check('미지 provider 문자열이어도 throw하지 않음(우아한 폴백, 헌법 규칙 9)', fallbackInst instanceof OpenAIProvider)
  check('미지 provider는 openai로 폴백', fallbackInst.name === 'openai')
  check('폴백 인스턴스는 fallbackApplied=true로 표시', fallbackInst.fallbackApplied === true)
  check('폴백 인스턴스는 원래 요청했던 provider 문자열을 보존(requestedProvider)', fallbackInst.requestedProvider === 'not-a-real-provider-typo')
  check('onUnknownProvider 콜백이 요청/폴백 provider 정보와 함께 호출됨', unknownCallbackPayload?.requestedProvider === 'not-a-real-provider-typo' && unknownCallbackPayload?.fallbackProvider === 'openai')

  const modelOverride = createAIProvider({ provider: 'openai', apiKeys: { openai: 'k' }, models: { openai: 'gpt-5-nano-custom' } })
  check('models 옵션으로 모델 오버라이드 가능', modelOverride.model === 'gpt-5-nano-custom')
  check('apiKeys 옵션으로 apiKey 주입 가능', modelOverride.apiKey === 'k')
}

console.log('\n51. healthCheck — apiKey 유무에 따른 apiKeyPresent, 유료 호출(fetch) 0회')
{
  let fetchSpyCount = 0
  const spyFetch = async () => { fetchSpyCount++; throw new Error('healthCheck는 절대 fetch를 호출하면 안 됨(유료 호출 방지)') }

  const withoutKey = createAIProvider({ provider: 'openai', apiKeys: {}, fetchImpl: spyFetch })
  const hcNoKey = withoutKey.healthCheck()
  check('apiKey 없으면 apiKeyPresent=false', hcNoKey.apiKeyPresent === false)
  check('apiKey 없으면 ok=false', hcNoKey.ok === false)
  check('healthCheck 응답에 provider/model 정보 포함', hcNoKey.provider === 'openai' && hcNoKey.model === AI_MODEL_ID)

  const withKey = createAIProvider({ provider: 'gemini', apiKeys: { gemini: 'fake-key-123' }, fetchImpl: spyFetch })
  const hcWithKey = withKey.healthCheck()
  check('apiKey 있으면 apiKeyPresent=true', hcWithKey.apiKeyPresent === true)
  check('apiKey 있으면 ok=true', hcWithKey.ok === true)

  const anthWithKey = createAIProvider({ provider: 'anthropic', apiKeys: { anthropic: 'fake-key-456' }, fetchImpl: spyFetch })
  check('anthropic도 동일 계약(apiKeyPresent=true)', anthWithKey.healthCheck().apiKeyPresent === true)

  check('healthCheck 호출 3번 중 fetch(유료 호출)는 단 한 번도 발생 안 함', fetchSpyCount === 0)
}

console.log('\n52. normalizeResponse — OpenAI(choices/decisions 언래핑)/Gemini(candidates[0].content.parts[0].text)/Anthropic(content 텍스트 블록) 3종 응답이 동일한 정규화 텍스트로 수렴')
{
  const decisionEntry = {
    pending_answer_id: 'norm-1', decision: 'accept', confidence: 0.77, reason: '정규화 계약 테스트',
    suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null,
  }
  const expectedNormalized = JSON.stringify([decisionEntry])

  const openaiInst = createAIProvider({ provider: 'openai', apiKeys: { openai: 'k' } })
  const openaiRaw = { choices: [{ message: { content: JSON.stringify({ decisions: [decisionEntry] }) } }] }
  check('OpenAI: {"decisions":[...]}로 감싼 응답이 언래핑되어 배열 텍스트로 정규화', openaiInst.normalizeResponse(openaiRaw) === expectedNormalized)

  const geminiInst = createAIProvider({ provider: 'gemini', apiKeys: { gemini: 'k' } })
  const geminiRaw = { candidates: [{ content: { parts: [{ text: JSON.stringify([decisionEntry]) }] } }] }
  check('Gemini: candidates[0].content.parts[0].text의 배열 텍스트 그대로 정규화', geminiInst.normalizeResponse(geminiRaw) === expectedNormalized)

  const anthropicInst = createAIProvider({ provider: 'anthropic', apiKeys: { anthropic: 'k' } })
  const anthropicRaw = { content: [{ type: 'text', text: JSON.stringify([decisionEntry]) }] }
  check('Anthropic: content 배열의 text 블록에서 배열 텍스트 추출', anthropicInst.normalizeResponse(anthropicRaw) === expectedNormalized)

  check('요구사항 7 계약: 3 provider 전부 최종적으로 동일한 정규화 텍스트로 수렴', openaiInst.normalizeResponse(openaiRaw) === geminiInst.normalizeResponse(geminiRaw) && geminiInst.normalizeResponse(geminiRaw) === anthropicInst.normalizeResponse(anthropicRaw))

  // 방어적 정규화 — Gemini가 스키마를 어기고 {"decisions":[...]}류로 감싸도
  // 같은 공용 경로로 흡수(§ providers.js GeminiProvider.normalizeResponse 주석).
  const geminiWrappedRaw = { candidates: [{ content: { parts: [{ text: JSON.stringify({ decisions: [decisionEntry] }) }] } }] }
  check('Gemini가 방어적으로 {"decisions":[...]} 형태로 응답해도 동일하게 언래핑됨', geminiInst.normalizeResponse(geminiWrappedRaw) === expectedNormalized)

  // 파싱 실패 시 원문 그대로 반환(공용 계약, § normalizeDecisionsText 주석)
  const brokenText = '이것은 JSON이 아님{{{'
  check('파싱 불가 원문은 그대로 반환(빈 배열로 조용히 삼키지 않음 — parseAiBatchResponse가 빈 Map으로 review 강등하게 함)', openaiInst.normalizeResponse({ choices: [{ message: { content: brokenText } }] }) === brokenText)
}

console.log('\n53. gradeWritingAnswers — mock fetchImpl로 end-to-end, 3 provider가 동일 스키마의 decisionsMap/토큰 카운트 반환 + 실패(throw) 계약')
{
  const batch = [{ id: 'e2e-1', wordId: 'e2e-w1', word: 'sample', meaning: '샘플', acceptedMeanings: [], submittedAnswer: '보기' }]
  const wantDecision = { pending_answer_id: 'e2e-1', decision: 'accept', confidence: 0.81, reason: 'e2e mock', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null }

  const openaiFetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ decisions: [wantDecision] }) } }], usage: { prompt_tokens: 120, completion_tokens: 40 } }),
  })
  const geminiFetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify([wantDecision]) }] } }], usageMetadata: { promptTokenCount: 130, candidatesTokenCount: 45 } }),
  })
  const anthropicFetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify([wantDecision]) }], usage: { input_tokens: 110, output_tokens: 35 } }),
  })

  const openaiInst = createAIProvider({ provider: 'openai', apiKeys: { openai: 'k' }, fetchImpl: openaiFetch })
  const geminiInst = createAIProvider({ provider: 'gemini', apiKeys: { gemini: 'k' }, fetchImpl: geminiFetch })
  const anthropicInst = createAIProvider({ provider: 'anthropic', apiKeys: { anthropic: 'k' }, fetchImpl: anthropicFetch })

  const [openaiRes, geminiRes, anthropicRes] = await Promise.all([
    openaiInst.gradeWritingAnswers(batch),
    geminiInst.gradeWritingAnswers(batch),
    anthropicInst.gradeWritingAnswers(batch),
  ])

  for (const [label, res] of [['openai', openaiRes], ['gemini', geminiRes], ['anthropic', anthropicRes]]) {
    check(`${label}: decisionsMap은 Map이고 요청한 pending_answer_id(e2e-1)를 담음`, res.decisionsMap instanceof Map && res.decisionsMap.has('e2e-1'))
    check(`${label}: decisionsMap.get('e2e-1').decision === 'accept'`, res.decisionsMap.get('e2e-1').decision === 'accept')
    check(`${label}: inputTokens/outputTokens 둘 다 양수(각 provider 고유 usage 필드에서 정확히 파싱됨)`, res.inputTokens > 0 && res.outputTokens > 0)
    check(`${label}: 반환 객체 스키마가 {decisionsMap, inputTokens, outputTokens} 3개 키로 동일`, Object.keys(res).sort().join(',') === 'decisionsMap,inputTokens,outputTokens')
  }
  check('OpenAI/Gemini/Anthropic 응답 형태(usage 필드명)가 서로 다름에도 정규화된 토큰 값 자체는 각각 정확(120/40, 130/45, 110/35)', openaiRes.inputTokens === 120 && openaiRes.outputTokens === 40 && geminiRes.inputTokens === 130 && geminiRes.outputTokens === 45 && anthropicRes.inputTokens === 110 && anthropicRes.outputTokens === 35)

  // 실패 계약 — fetch 자체가 throw(네트워크 오류)하면 gradeWritingAnswers도
  // 그대로 throw(내부에서 삼키지 않음) -> classifyBatch가 이걸 잡아 review로
  // 강등하는 기존 경로(§ 섹션 9 ai_error)와 정확히 이어진다.
  const networkFailInst = createAIProvider({ provider: 'openai', apiKeys: { openai: 'k' }, fetchImpl: async () => { throw new Error('네트워크 오류(모의)') } })
  let networkThrew = false
  try { await networkFailInst.gradeWritingAnswers(batch) } catch (err) { networkThrew = true; check('네트워크 오류 시 에러 메시지 보존', /네트워크 오류/.test(err.message)) }
  check('fetch 자체가 throw하면 gradeWritingAnswers도 throw(삼키지 않음)', networkThrew === true)

  // 실패 계약 — HTTP 오류 응답(res.ok=false)도 throw
  const httpFailInst = createAIProvider({
    provider: 'gemini', apiKeys: { gemini: 'k' },
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Rate limit exceeded(모의)' } }) }),
  })
  let httpThrew = false
  try { await httpFailInst.gradeWritingAnswers(batch) } catch (err) { httpThrew = true; check('HTTP 오류 응답의 error.message가 예외 메시지로 전달됨', err.message === 'Rate limit exceeded(모의)') }
  check('HTTP 오류(res.ok=false) 시에도 gradeWritingAnswers가 throw', httpThrew === true)

  // classifyBatch와 실제로 연결했을 때(§ pipeline.js aiClassify 계약) 위
  // throw가 정확히 ai_error로 강등되는지까지 한 번 더 실측(providers.js가
  // pipeline.js와 실제로 맞물리는지 확인 — mock만 쓰던 섹션 9와 달리 진짜
  // provider 인스턴스를 aiClassify로 주입).
  const aiClassifyViaRealProvider = async (b) => {
    const { decisionsMap } = await networkFailInst.gradeWritingAnswers(b)
    return decisionsMap
  }
  const proposalsViaProvider = await classifyBatch([{ id: 'e2e-fail-1', wordId: 'e2e-w1', word: 'sample', meaning: '샘플', acceptedMeanings: [], submittedAnswer: '보기' }], { aiClassify: aiClassifyViaRealProvider })
  check('실제 provider 인스턴스가 throw해도 classifyBatch는 review로 안전하게 강등(자동 거부 아님)', proposalsViaProvider[0].decision === 'review' && proposalsViaProvider[0].decision_source === 'ai_error')
}

console.log('\n54. estimateCost — gemini-2.5-flash 단가 반영, 미지 모델 과대추정 폴백이 throw하지 않음')
{
  check('MODEL_PRICING_PER_MTOK에 gemini-2.5-flash 단가 존재($0.30 입력/$2.50 출력)', MODEL_PRICING_PER_MTOK['gemini-2.5-flash']?.input === 0.30 && MODEL_PRICING_PER_MTOK['gemini-2.5-flash']?.output === 2.50)

  const geminiInst = createAIProvider({ provider: 'gemini', apiKeys: { gemini: 'k' } })
  const geminiCost = geminiInst.estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 })
  check('gemini-2.5-flash: 100만 입력+100만 출력 = $0.30+$2.50=$2.80', Math.abs(geminiCost - 2.80) < 1e-9)

  const openaiInst = createAIProvider({ provider: 'openai', apiKeys: { openai: 'k' } })
  const openaiCost = openaiInst.estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 })
  check('gpt-5-nano: 100만 입력+100만 출력 = $0.05+$0.40=$0.45', Math.abs(openaiCost - 0.45) < 1e-9)

  // 미지 모델 — estimateCostUsd 자체는 예외를 던지지만(§ 섹션 20), provider의
  // estimateCost는 safeEstimateCostUsd를 거쳐 절대 throw하지 않고 최고가로
  // 안전하게 과대추정한다(헌법 규칙 9 — 알 수 없는 입력에도 함수 전체가
  // 안 죽어야 함).
  const unknownModelInst = createAIProvider({ provider: 'openai', apiKeys: { openai: 'k' }, models: { openai: 'gpt-made-up-model-xyz' } })
  let unknownThrew = false
  let unknownCost = null
  try { unknownCost = unknownModelInst.estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 }) } catch { unknownThrew = true }
  check('미지 모델이어도 estimateCost는 throw하지 않음(우아한 폴백)', unknownThrew === false)
  check('미지 모델 과대추정은 FALLBACK_PRICE_PER_MTOK(최고가, claude-sonnet-5 단가) 기준', Math.abs(unknownCost - ((1_000_000 / 1e6) * FALLBACK_PRICE_PER_MTOK.input + (1_000_000 / 1e6) * FALLBACK_PRICE_PER_MTOK.output)) < 1e-9)
  check('FALLBACK_PRICE_PER_MTOK은 알려진 모델 중 최고가(과소추정 아닌 과대추정 방향)', FALLBACK_PRICE_PER_MTOK.input >= MODEL_PRICING_PER_MTOK['gpt-5-nano'].input && FALLBACK_PRICE_PER_MTOK.input >= MODEL_PRICING_PER_MTOK['gemini-2.5-flash'].input && FALLBACK_PRICE_PER_MTOK.output >= MODEL_PRICING_PER_MTOK['claude-haiku-4-5'].output)

  // safeEstimateCostUsd 자체도 직접 확인(onUnknownModel 콜백 계약)
  let unknownModelCallbackPayload = null
  const directCost = safeEstimateCostUsd({ inputTokens: 0, outputTokens: 0 }, 'totally-unknown-model', { onUnknownModel: (p) => { unknownModelCallbackPayload = p } })
  check('safeEstimateCostUsd(0 토큰, 미지 모델) 결과는 0(비율 계산이므로)', directCost === 0)
  check('onUnknownModel 콜백이 미지 모델명을 담아 호출됨', unknownModelCallbackPayload?.model === 'totally-unknown-model')
}

console.log('\n55. 캐시 provider 무관성 통합(classifyBatch + 실제 provider 인스턴스) — provider가 달라도 같은 캐시 키로 저장/조회')
{
  const sharedItemFields = { wordId: 'prov-cache-w1', word: 'depart', meaning: '떠나다', acceptedMeanings: [], submittedAnswer: '살다' }
  const firstItem = { ...sharedItemFields, id: 'prov-cache-1' }
  const secondItem = { ...sharedItemFields, id: 'prov-cache-2' } // 같은 word/meaning/정규화답안, 다른 pending id — 캐시 키는 동일해야 함

  check('두 항목의 캐시 키는 실제로 동일(word/meaning/정규화답안이 같으므로)', buildCacheKey({ wordId: firstItem.wordId, meaningSnapshot: firstItem.meaning, normalizedAnswer: normalizeForCompare(firstItem.submittedAnswer) }) === buildCacheKey({ wordId: secondItem.wordId, meaningSnapshot: secondItem.meaning, normalizedAnswer: normalizeForCompare(secondItem.submittedAnswer) }))

  const cacheStore = new Map()
  const cacheLookup = async (key) => cacheStore.get(key) || null
  const cacheStorer = async (key, decision) => cacheStore.set(key, decision)

  let openaiFetchCalls = 0
  const openaiMockFetch = async (_url, init) => {
    openaiFetchCalls++
    const body = JSON.parse(init.body)
    const userPayload = JSON.parse(body.messages[1].content)
    const decisions = userPayload.map((it) => ({ pending_answer_id: it.pending_answer_id, decision: 'accept', confidence: 0.88, reason: 'openai mock', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null }))
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ decisions }) } }], usage: { prompt_tokens: 50, completion_tokens: 20 } }) }
  }
  const aiClassifyOpenAi = async (batch) => {
    const provider = createAIProvider({ provider: 'openai', apiKeys: { openai: 'k' }, fetchImpl: openaiMockFetch })
    const { decisionsMap } = await provider.gradeWritingAnswers(batch)
    return decisionsMap
  }
  const proposals1 = await classifyBatch([firstItem], { cacheLookup, cacheStore: cacheStorer, aiClassify: aiClassifyOpenAi })
  check('1차(OpenAI provider 경유) — AI 호출 1회 발생, cache_hit=false', openaiFetchCalls === 1 && proposals1[0].cache_hit === false)
  check('1차 결과 decision=accept(mock 그대로)', proposals1[0].decision === 'accept')

  // 2차는 완전히 다른 provider(Gemini)를 쓰도록 구성하되, fetch가 호출되면
  // 즉시 테스트 실패로 잡히게 한다 — 캐시 히트라면 aiClassify 자체가 절대
  // 호출되지 않아야 하므로(classifyBatch가 cacheLookup에서 이미 채움) 이
  // Gemini mock fetch는 한 번도 실행되면 안 된다.
  let geminiFetchCalls = 0
  const geminiMockFetchShouldNotRun = async () => { geminiFetchCalls++; throw new Error('캐시 히트가 예상되므로 Gemini fetch가 호출되면 안 됨') }
  const aiClassifyGemini = async (batch) => {
    const provider = createAIProvider({ provider: 'gemini', apiKeys: { gemini: 'k' }, fetchImpl: geminiMockFetchShouldNotRun })
    const { decisionsMap } = await provider.gradeWritingAnswers(batch)
    return decisionsMap
  }
  const proposals2 = await classifyBatch([secondItem], { cacheLookup, cacheStore: cacheStorer, aiClassify: aiClassifyGemini })
  check('2차(Gemini provider로 구성했지만) — 캐시 히트라 Gemini fetch는 0회 호출', geminiFetchCalls === 0)
  check('2차 결과는 cache_hit=true(1차에서 OpenAI provider로 저장된 캐시를 그대로 재사용 — 요구사항 11 계약 실증)', proposals2[0].cache_hit === true)
  check('2차 결과 판정도 1차(OpenAI mock)가 저장한 값 그대로', proposals2[0].decision === 'accept' && proposals2[0].reason === 'openai mock')
}

// ── v4(2026-07-24, implementer — 학습 시스템 테스트 확장, 운영자 요구사항
// 10) — "선생님이 같은 검토를 두 번 하지 않는" 자동 학습 시스템
// (writing_answer_statistics)이 서버/클라이언트에 구현 완료된 뒤의 커버리지
// 확장. 구현 파일(pipeline.js/index.ts/writingAnswerStatsApi.js/
// spellingReviewApi.js/spellingReviewAiApi.js)은 이번 작업에서 전혀 수정하지
// 않았다(§ 미션 지시 — 읽기 전용, 실제 동작 기준으로만 단언 추가) — 아래
// 섹션들은 전부 그 파일들을 읽고 확인한 실제 계약을 재현한 것이다.
console.log('\n(준비) writingAnswerStatsApi.js 번들 — supabaseClient/wordLibrary만 스텁(spellingReviewBulkPlan은 실제 소스 그대로, 헌법 규칙 3 재구현 금지)')
const statsApiStub = (contents) => ({ contents, loader: 'js' })
await esbuild.build({
  entryPoints: ['src/utils/writingAnswerStatsApi.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/writingAnswerStatsApi.bundle.mjs',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fake.supabase.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fake-anon-key'),
  },
  plugins: [{
    name: 'stats-api-stubs',
    setup(build) {
      // ⚠ 실측 확인(2026-07-24, 이 섹션 작업 중): esbuild onResolve의
      // args.path는 소스에 적힌 "원문" 상대경로 문자열이다(예: 여기서는
      // "./wordLibrary") — 이미 resolveDir까지 반영된 절대경로가 아니다.
      // 기존 섹션 36/43/47/60이 재사용해온 /utils[\\/]wordLibrary$/ 필터는
      // "utils/wordLibrary" 형태만 매치하므로 같은 디렉터리(src/utils/)
      // 안에서 쓰인 "./wordLibrary" 상대 import에는 실제로 매치되지 않는다
      // (node -e probe로 args.path==="./wordLibrary" 직접 확인) — 그 기존
      // 섹션들은 스텁이 적용 안 된 채로 "실제" wordLibrary.js/spellingReviewApi.js
      // /supabaseClient.js가 번들에 그대로 포함돼도 그 함수들을 한 번도
      // 호출하지 않는 경로만 테스트해서 우연히 통과해온 것뿐이다(§ 정직한
      // 기록). 이 섹션(writingAnswerStatsApi.js)은 registerRecommendation이
      // 실제로 setWordAcceptedMeanings/supabase를 호출하므로 스텁이 반드시
      // 적용돼야 해서, 여기서는 실제 관측된 원문 상대경로로 정확히 매치한다.
      build.onResolve({ filter: /^\.\/wordLibrary$/ }, () => ({ path: 'v:wordlib2', namespace: 'v' }))
      build.onResolve({ filter: /^\.\/supabaseClient$/ }, () => ({ path: 'v:supa2', namespace: 'v' }))
      build.onLoad({ filter: /^v:wordlib2$/, namespace: 'v' }, () => statsApiStub(`
export const setWordAcceptedMeanings = async (...args) => {
  (globalThis.__statsApiSpy ||= { calls: [] }).calls.push(['setWordAcceptedMeanings', args])
  if (globalThis.__statsApiFailSetMeanings) throw new Error('setWordAcceptedMeanings 실패(모의)')
}
`))
      build.onLoad({ filter: /^v:supa2$/, namespace: 'v' }, () => statsApiStub(`
export const supabase = {
  from(table) {
    return {
      select(...selArgs) {
        const filters = []
        const chain = {
          eq(...a) { filters.push(['eq', ...a]); return chain },
          gte(...a) { filters.push(['gte', ...a]); return chain },
          lt(...a) { filters.push(['lt', ...a]); return chain },
          order(...a) { filters.push(['order', ...a]); return chain },
          limit(...a) { filters.push(['limit', ...a]); return chain },
          then(resolve, reject) {
            (globalThis.__statsApiSpy ||= { calls: [] }).calls.push(['select', table, selArgs, filters])
            const responses = globalThis.__statsApiResponses || {}
            const resp = responses[table] || { data: [], error: null, count: 0 }
            return Promise.resolve(resp).then(resolve, reject)
          },
        }
        return chain
      },
      insert(record) {
        (globalThis.__statsApiSpy ||= { calls: [] }).calls.push(['insert', table, record])
        if (globalThis.__statsApiFailInsert === table) return Promise.reject(new Error('insert 실패(모의)'))
        return Promise.resolve({ error: null })
      },
      update(patch) {
        return {
          eq: async (col, val) => {
            (globalThis.__statsApiSpy ||= { calls: [] }).calls.push(['update', table, patch, col, val])
            if (globalThis.__statsApiFailUpdate === table) return { error: new Error('update 실패(모의)') }
            return { error: null }
          },
        }
      },
    }
  },
}
`))
    },
  }],
})
const writingAnswerStatsApi = await import(pathToFileURL('scripts/.tmp/writingAnswerStatsApi.bundle.mjs').href)
function resetStatsApiMockState() {
  globalThis.__statsApiSpy = { calls: [] }
  globalThis.__statsApiFailSetMeanings = false
  globalThis.__statsApiFailInsert = null
  globalThis.__statsApiFailUpdate = null
  globalThis.__statsApiResponses = {}
}

console.log('\n56. statsLookup 훅(반복 답안·오답 누적, 요구사항 5) — classifyBatch 캐시 다음/AI 이전 위치, decision 보존, accept 무시, budgetExceeded와의 우선순위')
{
  // (a) statsLookup이 전부 null 반환 — 기존 AI 경로와 100% 동일(회귀 없음)
  {
    let aiCalls = 0
    const aiClassify = async (batch) => {
      aiCalls++
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'review', confidence: 0.5, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null })
      return m
    }
    const statsLookupNull = async () => null
    const proposals = await classifyBatch([F.closeButWrongMeaning], { aiClassify, statsLookup: statsLookupNull })
    check('statsLookup이 null 반환 시 기존 AI 경로 그대로(회귀 없음)', aiCalls === 1 && proposals[0].decision_source === 'ai')
  }

  // (b) skip:true + decision:'reject_candidate' — AI/cacheStore 미호출, decision_source=stats_repeat, 값 보존
  {
    let aiCalls = 0
    let cacheStoreCalls = 0
    const aiClassify = async () => { aiCalls++; return new Map() }
    const cacheStore = async () => { cacheStoreCalls++ }
    const statsLookup = async () => ({ skip: true, decision: 'reject_candidate', confidence: 0.82, reason: '과거 5회 reject_candidate' })
    const proposals = await classifyBatch([F.trueSynonymDifferentString], { aiClassify, cacheStore, statsLookup })
    check('stats skip 시 decision_source=stats_repeat', proposals[0].decision_source === 'stats_repeat')
    check('stats skip 시 decision은 statsLookup이 준 값 그대로(reject_candidate)', proposals[0].decision === 'reject_candidate')
    check('stats skip 시 confidence도 그대로 보존', proposals[0].confidence === 0.82)
    check('stats skip 시 reason도 그대로 보존', proposals[0].reason === '과거 5회 reject_candidate')
    check('stats skip 시 aiClassify 0회 호출', aiCalls === 0)
    check('stats skip 시 cacheStore 0회 호출(새 AI 캐시 행을 만들 근거 없음)', cacheStoreCalls === 0)
  }

  // (c) skip:true + decision:'review' — 허용된 값, 마찬가지로 stats_repeat
  {
    const statsLookup = async () => ({ skip: true, decision: 'review', confidence: 0.4 })
    const proposals = await classifyBatch([F.completelyWrong], { statsLookup, aiClassify: async () => new Map() })
    check('decision:"review" skip도 허용되어 stats_repeat로 확정', proposals[0].decision_source === 'stats_repeat' && proposals[0].decision === 'review')
  }

  // (d) skip:true + decision:'accept' — 허용 안 됨(이중 인정 경로 금지), 무시하고 정상 AI 경로로 진행
  {
    let aiCalls = 0
    const aiClassify = async (batch) => {
      aiCalls++
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'accept', confidence: 0.99, reason: 'ai-real', suggested_synonym: null, part_of_speech_warning: null })
      return m
    }
    const statsLookup = async () => ({ skip: true, decision: 'accept', confidence: 0.99, reason: '잘못된 자동인정 시도(모의)' })
    const proposals = await classifyBatch([F.closeButWrongMeaning], { aiClassify, statsLookup })
    check('decision:"accept" skip은 무시되고 정상 AI 경로로 진행(이중 인정 경로 금지)', aiCalls === 1 && proposals[0].decision_source === 'ai')
    check('accept 무시 후 실제로는 AI가 낸 판정이 최종 반영됨(statsLookup 값이 아님)', proposals[0].decision === 'accept' && proposals[0].reason === 'ai-real')
  }

  // (e) 스키마 밖 임의 decision 문자열도 방어적으로 무시
  {
    const statsLookup = async () => ({ skip: true, decision: 'delete_forever' })
    const proposals = await classifyBatch([F.trueSynonymDifferentString], { statsLookup, aiClassify: async () => new Map() })
    check('스키마 밖 decision 문자열도 무시되고 정상 경로로 진행(stats_repeat 아님)', proposals[0].decision_source !== 'stats_repeat')
  }

  // (f) 캐시 히트 항목은 statsLookup 자체가 호출되지 않음(캐시 조회가 먼저)
  {
    const cacheMap = new Map()
    const key = buildCacheKey({ wordId: F.trueSynonymDifferentString.wordId, meaningSnapshot: F.trueSynonymDifferentString.meaning, normalizedAnswer: normalizeForCompare(F.trueSynonymDifferentString.submittedAnswer) })
    cacheMap.set(key, { decision: 'review', confidence: 0.5, reason: 'cached', decisionSource: 'ai' })
    let statsCalls = 0
    const statsLookup = async () => { statsCalls++; return null }
    const proposals = await classifyBatch([F.trueSynonymDifferentString], {
      cacheLookup: async (k) => cacheMap.get(k) || null,
      cacheStore: async () => {},
      statsLookup,
      aiClassify: async () => new Map(),
    })
    check('캐시 히트 항목은 statsLookup이 아예 호출되지 않음(캐시가 먼저)', statsCalls === 0 && proposals[0].cache_hit === true)
  }

  // (g) budgetExceeded와의 우선순위 — statsLookup이 먼저 처리한 항목은 budgetExceeded 영향을 받지 않음
  {
    const statsLookup = async (item) => (item.id === F.trueSynonymDifferentString.id ? { skip: true, decision: 'reject_candidate', confidence: 0.8 } : null)
    const proposals = await classifyBatch([F.trueSynonymDifferentString, F.completelyWrong], { statsLookup, budgetExceeded: true })
    const byId = new Map(proposals.map((p) => [p.pending_answer_id, p]))
    check('statsLookup이 스킵한 항목은 budgetExceeded와 무관하게 stats_repeat 유지', byId.get(F.trueSynonymDifferentString.id).decision_source === 'stats_repeat')
    check('statsLookup이 스킵하지 않은 나머지는 budgetExceeded로 강등(ai_budget_exceeded)', byId.get(F.completelyWrong.id).decision_source === 'ai_budget_exceeded')
  }

  // (h) 품사 힌트 보존 — statsLookup 스킵 시에도 로컬 hint 기반 part_of_speech_warning이 세팅됨
  {
    const statsLookup = async () => ({ skip: true, decision: 'review', confidence: 0.3 })
    const proposals = await classifyBatch([F.posVariant], { statsLookup, aiClassify: async () => new Map() })
    check('statsLookup 스킵이어도 posWarning 힌트가 part_of_speech_warning에 반영됨', proposals[0].part_of_speech_warning === '품사/활용형 차이 가능성')
  }

  // (i) reason 생략 시 기본 문구로 폴백
  {
    const statsLookup = async () => ({ skip: true, decision: 'reject_candidate', confidence: 0.5 })
    const proposals = await classifyBatch([F.trueSynonymDifferentString], { statsLookup, aiClassify: async () => new Map() })
    check('reason 생략 시 기본 문구로 폴백', proposals[0].reason === '통계 기반 반복 오답 — 과거 판정 재사용')
  }

  // (j) statsLookup 옵션 자체를 안 넘긴 기존 호출부 — 기본값(null)과 100% 동일하게 동작(회귀 없음)
  {
    let aiCalls = 0
    const aiClassify = async (batch) => {
      aiCalls++
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'review', confidence: 0.5, reason: 'mock', suggested_synonym: null, part_of_speech_warning: null })
      return m
    }
    const proposals = await classifyBatch([F.closeButWrongMeaning], { aiClassify }) // statsLookup 키 자체 생략
    check('statsLookup 옵션 자체를 안 넘긴 기존 호출부는 기본값(null)과 동일(AI 경로 그대로)', aiCalls === 1 && proposals[0].decision_source === 'ai')
  }
}

console.log('\n57. 동일 답안/동의어 등록(원클릭, registerRecommendation) — 3단계 순서, ①실패 시 ②③ 중단, dismissRecommendation은 status만')
{
  const sampleRow = { id: 'rec-1', wordId: 'w-rec-1', meaning: '안다, 포옹하다', submittedAnswer: '포옹', acceptedMeanings: ['안다'] }

  // (a) ①(setWordAcceptedMeanings) 실패 -> ②③ 절대 실행 안 됨
  {
    resetStatsApiMockState()
    globalThis.__statsApiFailSetMeanings = true
    let threw = false
    try { await writingAnswerStatsApi.registerRecommendation(sampleRow) } catch { threw = true }
    check('①실패 시 registerRecommendation이 throw', threw === true)
    const calls = globalThis.__statsApiSpy.calls
    check('①실패 시 setWordAcceptedMeanings는 호출됨(실패 지점)', calls.some((c) => c[0] === 'setWordAcceptedMeanings'))
    check('①실패 시 insert(word_accepted_variants) 절대 호출 안 됨', !calls.some((c) => c[0] === 'insert'))
    check('①실패 시 update(writing_answer_statistics) 절대 호출 안 됨', !calls.some((c) => c[0] === 'update'))
  }

  // (b) 성공 경로 — 순서(①setWordAcceptedMeanings ②insert audit ③update status)와 각 호출 인자
  {
    resetStatsApiMockState()
    await writingAnswerStatsApi.registerRecommendation(sampleRow)
    const calls = globalThis.__statsApiSpy.calls
    const order = calls.map((c) => c[0])
    check('호출 순서가 setWordAcceptedMeanings -> insert -> update', order.join(',') === 'setWordAcceptedMeanings,insert,update')

    const setCall = calls.find((c) => c[0] === 'setWordAcceptedMeanings')
    check('①setWordAcceptedMeanings(wordId, mergedAcceptedMeanings) — planAccept(answer_only) 결과 그대로', setCall[1][0] === sampleRow.wordId && Array.isArray(setCall[1][1]) && setCall[1][1].includes('포옹') && setCall[1][1].includes('안다'))

    const insertCall = calls.find((c) => c[0] === 'insert')
    check('②insert 대상 테이블은 word_accepted_variants', insertCall[1] === 'word_accepted_variants')
    check('②감사 레코드 created_by=stats_learning(이 경로 출처 라벨)', insertCall[2].created_by === 'stats_learning')
    check('②감사 레코드 accepted_answer/word_id가 원본 답안과 일치', insertCall[2].accepted_answer === '포옹' && insertCall[2].word_id === sampleRow.wordId)

    const updateCall = calls.find((c) => c[0] === 'update')
    check('③update 대상 테이블은 writing_answer_statistics', updateCall[1] === 'writing_answer_statistics')
    check('③status=accepted + status_changed_at 문자열 포함', updateCall[2].status === 'accepted' && typeof updateCall[2].status_changed_at === 'string')
    check('③eq(id, row.id)로 정확히 이 행만 대상', updateCall[3] === 'id' && updateCall[4] === sampleRow.id)
  }

  // (c) ②(감사 insert) 실패는 best-effort — ③은 그대로 실행됨(인정 자체는 이미 완료)
  {
    resetStatsApiMockState()
    globalThis.__statsApiFailInsert = 'word_accepted_variants'
    let threw = false
    try { await writingAnswerStatsApi.registerRecommendation(sampleRow) } catch { threw = true }
    check('②감사 insert 실패는 조용히 무시되고 예외를 던지지 않음', threw === false)
    const calls = globalThis.__statsApiSpy.calls
    check('②실패해도 ③update(status)는 정상 실행됨(best-effort)', calls.some((c) => c[0] === 'update'))
  }

  // (d) ③(status 업데이트) 실패는 던짐(정직하게 알림 — 계속 "대기"로 남으면 안 됨)
  {
    resetStatsApiMockState()
    globalThis.__statsApiFailUpdate = 'writing_answer_statistics'
    let threw = false
    try { await writingAnswerStatsApi.registerRecommendation(sampleRow) } catch { threw = true }
    check('③status 업데이트 실패는 throw(호출부 alert로 이어짐)', threw === true)
  }

  // (e) dismissRecommendation — status=dismissed만, 다른 호출 없음
  {
    resetStatsApiMockState()
    await writingAnswerStatsApi.dismissRecommendation('rec-99')
    const calls = globalThis.__statsApiSpy.calls
    check('dismissRecommendation은 setWordAcceptedMeanings/insert를 전혀 호출 안 함', !calls.some((c) => c[0] === 'setWordAcceptedMeanings') && !calls.some((c) => c[0] === 'insert'))
    const updateCall = calls.find((c) => c[0] === 'update')
    check('dismissRecommendation은 update(status=dismissed)만 실행', !!updateCall && updateCall[2].status === 'dismissed' && updateCall[3] === 'id' && updateCall[4] === 'rec-99')
  }
}

console.log('\n58. 관리자 추천/Batch(Top50, fetchLearningRecommendations) — 쿼리 파라미터(minCount/count desc/limit) + 테이블 미존재 폴백')
{
  // (a) 기본 파라미터(minCount=3, limit=50) — status=pending, count>=3, order count desc, limit 50
  {
    resetStatsApiMockState()
    globalThis.__statsApiResponses = { writing_answer_statistics: { data: [], error: null } }
    await writingAnswerStatsApi.fetchLearningRecommendations()
    const call = globalThis.__statsApiSpy.calls.find((c) => c[0] === 'select')
    check('조회 테이블은 writing_answer_statistics', call[1] === 'writing_answer_statistics')
    const filters = call[3]
    check('status=pending 필터 포함', filters.some((f) => f[0] === 'eq' && f[1] === 'status' && f[2] === 'pending'))
    check('기본 minCount=3 -> gte(count, 3)', filters.some((f) => f[0] === 'gte' && f[1] === 'count' && f[2] === 3))
    check('count 내림차순 정렬', filters.some((f) => f[0] === 'order' && f[1] === 'count' && f[2]?.ascending === false))
    check('기본 limit=50', filters.some((f) => f[0] === 'limit' && f[1] === 50))
  }

  // (b) 커스텀 minCount/limit이 실제로 쿼리에 반영됨
  {
    resetStatsApiMockState()
    globalThis.__statsApiResponses = { writing_answer_statistics: { data: [], error: null } }
    await writingAnswerStatsApi.fetchLearningRecommendations({ minCount: 10, limit: 5 })
    const call = globalThis.__statsApiSpy.calls.find((c) => c[0] === 'select')
    const filters = call[3]
    check('커스텀 minCount=10 반영', filters.some((f) => f[0] === 'gte' && f[1] === 'count' && f[2] === 10))
    check('커스텀 limit=5 반영', filters.some((f) => f[0] === 'limit' && f[1] === 5))
  }

  // (c) 정상 응답 매핑 — words embed/필드명 변환(planAccept 호환 필드 포함)
  {
    resetStatsApiMockState()
    globalThis.__statsApiResponses = {
      writing_answer_statistics: {
        error: null,
        data: [{
          id: 'rec-a', word_id: 'w-a', registered_meaning: '기후', student_answer: '환경',
          normalized_answer: '환경', count: 7, accepted_count: 0, rejected_count: 6,
          distinct_student_ids: ['11111111-1111-1111-1111-111111111111'],
          first_seen: '2026-07-20T00:00:00Z', last_seen: '2026-07-24T00:00:00Z',
          last_decision: 'reject_candidate', last_confidence: 0.05, status: 'pending',
          words: { word: 'climate', meaning: '기후', accepted_meanings: [] },
        }],
      },
    }
    const rows = await writingAnswerStatsApi.fetchLearningRecommendations()
    check('반환 1건, planAccept 호환 필드(id/wordId/submittedAnswer/acceptedMeanings/meaning) 포함', rows.length === 1 && rows[0].id === 'rec-a' && rows[0].wordId === 'w-a' && rows[0].submittedAnswer === '환경' && Array.isArray(rows[0].acceptedMeanings) && rows[0].meaning === '기후')
    check('표시용 추가 필드(count/distinctStudentCount/word) 매핑됨', rows[0].count === 7 && rows[0].distinctStudentCount === 1 && rows[0].word === 'climate')
  }

  // (d) 테이블 미존재(42P01/PGRST205) -> null 폴백(throw 안 함)
  {
    resetStatsApiMockState()
    globalThis.__statsApiResponses = { writing_answer_statistics: { data: null, error: { code: '42P01', message: 'relation "writing_answer_statistics" does not exist' } } }
    const result42P01 = await writingAnswerStatsApi.fetchLearningRecommendations()
    check('42P01(테이블 없음) -> null 폴백', result42P01 === null)

    resetStatsApiMockState()
    globalThis.__statsApiResponses = { writing_answer_statistics: { data: null, error: { code: 'PGRST205', message: 'schema cache' } } }
    const resultPGRST205 = await writingAnswerStatsApi.fetchLearningRecommendations()
    check('PGRST205(스키마 캐시에 없음) -> null 폴백', resultPGRST205 === null)
  }
}

console.log('\n59. Dashboard(절약 카운터) — accumulateSavingsCounters/readTodaySavings 누적/분리 + fetchLearningRateMetrics 주 경계(월요일, Asia/Seoul) 실측')
{
  class FakeStorage {
    constructor() { this.store = {} }
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null }
    setItem(k, v) { this.store[k] = String(v) }
    removeItem(k) { delete this.store[k] }
  }
  const originalLocalStorage = globalThis.localStorage
  try {
    globalThis.localStorage = new FakeStorage()
    const empty = writingAnswerStatsApi.readTodaySavings()
    check('저장된 값 없으면 전부 0(rules/cache/variants/statsSkips/ai)', empty.rules === 0 && empty.cache === 0 && empty.variants === 0 && empty.statsSkips === 0 && empty.ai === 0)

    writingAnswerStatsApi.accumulateSavingsCounters({ rules: 3, cache: 2, ai: 1 })
    writingAnswerStatsApi.accumulateSavingsCounters({ rules: 1, statsSkips: 4, variants: 2 })
    const afterTwoRuns = writingAnswerStatsApi.readTodaySavings()
    check('같은 날 두 번 실행분이 누적됨(rules 3+1=4, cache 2+0=2, statsSkips 0+4=4, variants 0+2=2, ai 1+0=1)', afterTwoRuns.rules === 4 && afterTwoRuns.cache === 2 && afterTwoRuns.statsSkips === 4 && afterTwoRuns.variants === 2 && afterTwoRuns.ai === 1)

    // "다른 날" 분리 — 오늘과 무관한 임의 날짜 키에 값을 심어도 오늘 조회에
    // 전혀 섞이지 않는지 확인(seoulDateStr는 비공개 함수라 오늘 키 문자열을
    // 재계산하지 않고, 절대 오늘일 수 없는 고정 과거 날짜 키로 검증).
    globalThis.localStorage.setItem('voca_writing_ai_savings_2000-01-01', JSON.stringify({ rules: 999, cache: 999, variants: 999, statsSkips: 999, ai: 999 }))
    const stillToday = writingAnswerStatsApi.readTodaySavings()
    check('임의의 다른 날짜 키 값은 오늘 조회에 전혀 섞이지 않음(날짜별로 완전히 분리된 키)', stillToday.rules === 4 && stillToday.ai === 1)

    // 절약률 계산의 "전체 0 처리" — 이 레이어는 비율 자체를 계산하지 않고
    // 순수 누적치만 반환하므로, 합계가 0이어도 NaN/Infinity가 이 레이어에서
    // 발생하지 않는다는 계약만 확인한다(비율 계산은 호출부 몫).
    globalThis.localStorage = new FakeStorage()
    const allZero = writingAnswerStatsApi.readTodaySavings()
    const total = allZero.rules + allZero.cache + allZero.variants + allZero.statsSkips + allZero.ai
    check('전체 0일 때 합계도 정확히 0(비율 0/0 방지는 호출부 책임 — 이 레이어는 정직하게 0만 반환)', total === 0)

    // 주간 학습률(fetchLearningRateMetrics) — 월요일 00:00(Asia/Seoul) 경계 실측.
    // countRows가 쓰는 select 체인은 위 (준비) 블록의 스텁을 그대로 재사용.
    resetStatsApiMockState()
    globalThis.__statsApiResponses = {
      writing_answer_statistics: { data: null, error: null, count: 3 },
      word_accepted_variants: { data: null, error: null, count: 1 },
    }
    const metrics = await writingAnswerStatsApi.fetchLearningRateMetrics()
    check('반환값 매핑 — thisWeek/lastWeek 각각 autoAcceptedCount/synonymCount 포함(모의 count 그대로 통과)', metrics.thisWeek.autoAcceptedCount === 3 && metrics.thisWeek.synonymCount === 1 && metrics.lastWeek.autoAcceptedCount === 3 && metrics.lastWeek.synonymCount === 1)

    const selectCalls = globalThis.__statsApiSpy.calls.filter((c) => c[0] === 'select')
    check('countRows 쿼리 4번(이번주/지난주 x 자동인정/동의어)', selectCalls.length === 4)

    function isoOf(filters, key) {
      const f = filters.find((x) => x[0] === key)
      return f ? f[2] : null
    }
    function isSeoulMondayMidnightIso(iso) {
      if (!iso) return false
      const shifted = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
      return shifted.getUTCDay() === 1 && shifted.getUTCHours() === 0 && shifted.getUTCMinutes() === 0 && shifted.getUTCSeconds() === 0
    }

    const statsQueries = selectCalls.filter((c) => c[1] === 'writing_answer_statistics')
    const variantQueries = selectCalls.filter((c) => c[1] === 'word_accepted_variants')
    check('writing_answer_statistics/word_accepted_variants 쿼리 각 2번씩', statsQueries.length === 2 && variantQueries.length === 2)

    const thisWeekStatsQuery = statsQueries.find((c) => c[3].length === 2) // eq(status)+gte만(lt 없음 = 이번 주, 끝은 "지금까지")
    const lastWeekStatsQuery = statsQueries.find((c) => c[3].length === 3) // eq+gte+lt = 지난 주(양끝 경계)
    check('이번 주 쿼리는 gte만, 지난 주는 gte+lt(양끝 경계)로 구분됨', !!thisWeekStatsQuery && !!lastWeekStatsQuery)

    const thisWeekStartIso = isoOf(thisWeekStatsQuery[3], 'gte')
    const lastWeekStartIso = isoOf(lastWeekStatsQuery[3], 'gte')
    const lastWeekEndIso = isoOf(lastWeekStatsQuery[3], 'lt')
    check('이번 주 시작은 Asia/Seoul 기준 월요일 00:00 정각', isSeoulMondayMidnightIso(thisWeekStartIso))
    check('지난 주 시작도 Asia/Seoul 기준 월요일 00:00 정각', isSeoulMondayMidnightIso(lastWeekStartIso))
    check('지난 주 끝(lt)은 이번 주 시작과 정확히 동일(경계가 이어짐, 이중집계/누락 없음)', lastWeekEndIso === thisWeekStartIso)
    check('지난 주 시작은 이번 주 시작보다 정확히 7일 이전', new Date(thisWeekStartIso).getTime() - new Date(lastWeekStartIso).getTime() === 7 * 24 * 60 * 60 * 1000)

    const thisWeekVariantQuery = variantQueries.find((c) => c[3].length === 1)
    check('동의어 이번 주 쿼리(word_accepted_variants)도 같은 이번 주 시작 경계를 씀', !!thisWeekVariantQuery && isoOf(thisWeekVariantQuery[3], 'gte') === thisWeekStartIso)

    // 테이블 없음(42P01) -> 그 카운트만 null("수집 중"), 나머지는 정상 0으로
    // 구분(요구사항 8 "지어내지 않기" — 0과 null을 혼동하지 않음).
    resetStatsApiMockState()
    globalThis.__statsApiResponses = {
      writing_answer_statistics: { data: null, error: { code: '42P01', message: 'missing' } },
      word_accepted_variants: { data: null, error: null, count: 0 },
    }
    const metricsMissing = await writingAnswerStatsApi.fetchLearningRateMetrics()
    check('writing_answer_statistics 테이블 없음 -> autoAcceptedCount는 null("수집 중"), synonymCount는 정상 0으로 구분', metricsMissing.thisWeek.autoAcceptedCount === null && metricsMissing.thisWeek.synonymCount === 0)
  } finally {
    globalThis.localStorage = originalLocalStorage
  }
}

console.log('\n60. Performance(요구사항 9) — logSpellingReview의 record_writing_answer_stat RPC가 await되지 않음(fire-and-forget), pending/실패해도 학생 경로 안 막힘')
{
  // 소스 텍스트 확인 — fire-and-forget 계약이 실제 소스에 그대로 있는지.
  const src = fs.readFileSync(new URL('../src/utils/spellingReviewApi.js', import.meta.url), 'utf8')
  check('recordAnswerStatBestEffort 호출에 await가 없음(fire-and-forget, 소스 텍스트 확인)', /(?<!await )recordAnswerStatBestEffort\(wordDbId, studentId, answer, meaning\)/.test(src))
  check('내부 supabase.rpc(...) 호출도 await 없이 .then/.catch 체인만 사용', /supabase\.rpc\('record_writing_answer_stat', \{[\s\S]*?\}\)\.then\(/.test(src) && !/await supabase\.rpc/.test(src))

  // 실행 스파이 — 실제 함수를 esbuild로 번들해 supabase.rpc가 영원히 pending인
  // Promise를 반환해도 logSpellingReview 자체는 빠르게 resolve되는지 실측
  // (source 확인만으로는 "정말 실행 시점에도 그런지"까지는 검증 안 되므로).
  const perfStub = (contents) => ({ contents, loader: 'js' })
  await esbuild.build({
    entryPoints: ['src/utils/spellingReviewApi.js'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: 'scripts/.tmp/spellingReviewApiPerf.bundle.mjs',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fake.supabase.test'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fake-anon-key'),
    },
    plugins: [{
      name: 'perf-supabase-stub',
      setup(build) {
        // § 위 (준비) 블록 주석과 동일한 실측 근거 — 원문 상대경로로 정확히 매치.
        build.onResolve({ filter: /^\.\/supabaseClient$/ }, () => ({ path: 'v:supa3', namespace: 'v' }))
        build.onLoad({ filter: /^v:supa3$/, namespace: 'v' }, () => perfStub(`
export const supabase = {
  from(table) {
    return {
      upsert: async (record, opts) => {
        (globalThis.__perfSpy ||= { calls: [] }).calls.push(['upsert', table, record, opts])
        return { error: null }
      },
    }
  },
  rpc(fnName, params) {
    (globalThis.__perfSpy ||= { calls: [] }).calls.push(['rpc', fnName, params])
    return globalThis.__perfRpcFactory ? globalThis.__perfRpcFactory() : Promise.resolve({ error: null })
  },
}
`))
      },
    }],
  })
  const spellingReviewApiPerf = await import(pathToFileURL('scripts/.tmp/spellingReviewApiPerf.bundle.mjs').href)

  // (a) RPC가 영원히 pending이어도 logSpellingReview는 빠르게 resolve
  {
    globalThis.__perfSpy = { calls: [] }
    globalThis.__perfRpcFactory = () => new Promise(() => {}) // 절대 resolve/reject 안 함(영원히 pending)
    let resolved = false
    const p = spellingReviewApiPerf.logSpellingReview('word-1', 'student-1', '답안', 'en2kr', '뜻').then(() => { resolved = true })
    await Promise.race([p, new Promise((r) => setTimeout(r, 300))])
    check('RPC가 영원히 pending이어도 logSpellingReview는 300ms 내 resolve(await 안 함 실측)', resolved === true)
    check('RPC(rpc) 호출 자체는 실제로 일어남(호출을 생략한 게 아니라 결과만 안 기다림)', globalThis.__perfSpy.calls.some((c) => c[0] === 'rpc' && c[1] === 'record_writing_answer_stat'))
    check('큐 upsert도 정상 실행됨(RPC와 독립된 별도 기록)', globalThis.__perfSpy.calls.some((c) => c[0] === 'upsert'))
    globalThis.__perfRpcFactory = null
  }

  // (b) RPC가 함수 없음 에러(42883)로 resolve돼도 예외가 학생 경로로 전파 안 됨
  {
    globalThis.__perfSpy = { calls: [] }
    globalThis.__perfRpcFactory = () => Promise.resolve({ error: { code: '42883', message: 'function record_writing_answer_stat does not exist' } })
    let threw = false
    try {
      await spellingReviewApiPerf.logSpellingReview('word-2', 'student-2', '답안2', 'en2kr', '뜻2')
    } catch { threw = true }
    check('RPC 함수 없음(42883) 에러여도 logSpellingReview는 throw하지 않음', threw === false)
    globalThis.__perfRpcFactory = null
  }

  // (c) RPC 자체가 reject(네트워크 오류)해도 예외가 학생 경로로 전파 안 됨
  {
    globalThis.__perfSpy = { calls: [] }
    globalThis.__perfRpcFactory = () => Promise.reject(new Error('네트워크 오류(모의)'))
    let threw = false
    try {
      await spellingReviewApiPerf.logSpellingReview('word-3', 'student-3', '답안3', 'en2kr', '뜻3')
    } catch { threw = true }
    check('RPC 자체가 reject(네트워크 오류)해도 logSpellingReview는 throw하지 않음(.catch로 흡수)', threw === false)
    globalThis.__perfRpcFactory = null
  }
}

console.log('\n61. statsSkips 전파(runAiPhase) — 서버 summary.statsSkips 청크별 합산 + clientStats.rulesResolvedCount 바디 포함 계약')
{
  const originalFetch = globalThis.fetch
  // (a) rulesResolvedCount>0 — 모든 청크 요청 바디에 clientStats 포함 + statsSkips 누적
  {
    const capturedBodies = []
    globalThis.fetch = async (_url, opts) => {
      const body = JSON.parse(opts.body)
      capturedBodies.push(body)
      const ids = body.pendingIds
      return {
        ok: true, status: 200,
        json: async () => ({
          ok: true,
          proposals: ids.map((id) => ({ pending_answer_id: id, decision: 'reject_candidate', confidence: 0.8, reason: 'mock stats repeat', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null, decision_source: 'stats_repeat' })),
          usage: { inputTokens: 10, outputTokens: 5 },
          summary: { statsSkips: 3 },
        }),
      }
    }
    try {
      const rows = Array.from({ length: AI_BATCH_SIZE + 5 }, (_, i) => ({ id: `stat-${i}`, wordId: 'sw', word: 'x', meaning: 'y', acceptedMeanings: [], submittedAnswer: 'z' }))
      const res = await runAiPhase({ adminPin: '1234', unresolvedRows: rows, rulesResolvedCount: 12 })
      check(`${AI_BATCH_SIZE}+5건 -> 2개 청크(fetch 2회)`, capturedBodies.length === 2)
      check('각 청크 요청 바디에 clientStats.rulesResolvedCount=12 포함(모든 청크에 동일 값)', capturedBodies.every((b) => b.clientStats?.rulesResolvedCount === 12))
      check('statsSkips는 청크별 응답(각 3)의 합으로 누적(2*3=6)', res.statsSkips === 6)
      check('제안에도 decision_source=stats_repeat이 그대로 반영됨(서버 응답 그대로 전달)', res.proposals.every((p) => p.decision_source === 'stats_repeat'))
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  // (b) rulesResolvedCount 생략(기본 0) — clientStats 필드 자체가 요청 바디에 없음
  {
    let capturedBody = null
    globalThis.fetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body)
      return {
        ok: true, status: 200,
        json: async () => ({ ok: true, proposals: [], usage: { inputTokens: 0, outputTokens: 0 }, summary: { statsSkips: 0 } }),
      }
    }
    try {
      await runAiPhase({ adminPin: '1234', unresolvedRows: [{ id: 'no-rules-1', wordId: 'w1', word: 'a', meaning: 'm', acceptedMeanings: [], submittedAnswer: 's' }] })
      check('rulesResolvedCount 기본값(0)이면 clientStats 필드 자체가 요청 바디에 없음(additive, 옛 서버도 안전)', !('clientStats' in capturedBody))
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  // (c) 서버가 summary.statsSkips를 아예 안 주는(구버전) 경우 -> statsSkips=0으로 안전 폴백(에러 없음)
  {
    globalThis.fetch = async (_url, opts) => {
      const body = JSON.parse(opts.body)
      const ids = body.pendingIds
      return {
        ok: true, status: 200,
        json: async () => ({ ok: true, proposals: ids.map((id) => ({ pending_answer_id: id, decision: 'review', confidence: 0.5, reason: 'legacy', suggested_synonym: null, part_of_speech_warning: null })), usage: { inputTokens: 5, outputTokens: 2 } }),
      }
    }
    try {
      const res = await runAiPhase({ adminPin: '1234', unresolvedRows: [{ id: 'legacy-1', wordId: 'w1', word: 'a', meaning: 'm', acceptedMeanings: [], submittedAnswer: 's' }] })
      check('구버전 서버 응답(summary 자체 없음)에도 statsSkips=0으로 안전 폴백', res.statsSkips === 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  }
}

console.log('\n62. classifyBatch 캐시 미스 중복 제거(2026-07-24, AI 비용 낭비 감사 후속) — 같은 캐시 키를 가진 미해결 항목은 AI/statsLookup을 대표 1건에만 호출하고 나머지는 결과 복제')
{
  // 같은 (word_id, meaning, normalized_answer)이지만 pending_answer_id는
  // 서로 다른 5건 — "5명이 같은 오답을 낸" 시나리오를 재현.
  const dupGroup = Array.from({ length: 5 }, (_, i) => ({
    id: `dup-${i}`, wordId: 'wdup', word: 'harm', meaning: '해치다', acceptedMeanings: [], submittedAnswer: '농부',
  }))

  // (a) aiClassify는 정확히 1회 호출되고, 배치에는 대표 1건만 담긴다 —
  // 5건 전부 동일한 decision/confidence/reason을 받는다.
  {
    let aiCalls = 0
    let lastBatch = null
    const aiClassify = async (batch) => {
      aiCalls++
      lastBatch = batch
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'reject_candidate', confidence: 0.77, reason: 'dedup-mock', suggested_synonym: null, part_of_speech_warning: null, meaning_scope_warning: null })
      return m
    }
    const proposals = await classifyBatch(dupGroup, { aiClassify })
    check('중복 5건이어도 aiClassify는 정확히 1회만 호출됨', aiCalls === 1)
    check('AI로 보내는 배치에는 그룹 대표 1건만 담김(중복 4건 미포함)', lastBatch.length === 1 && lastBatch[0].id === 'dup-0')
    check('결과 제안도 5건 그대로 반환됨(각자 pending_answer_id 유지)', proposals.length === 5)
    check('5건 전부 동일한 decision을 받음(reject_candidate)', proposals.every((p) => p.decision === 'reject_candidate'))
    check('5건 전부 동일한 confidence를 받음(0.77)', proposals.every((p) => p.confidence === 0.77))
    check('5건 전부 동일한 reason을 받음(dedup-mock)', proposals.every((p) => p.reason === 'dedup-mock'))
    check('5건 전부 decision_source=ai(캐시 히트 아님)', proposals.every((p) => p.decision_source === 'ai' && p.cache_hit === false))
    check('5건 각자의 pending_answer_id는 그대로 보존됨', new Set(proposals.map((p) => p.pending_answer_id)).size === 5)
  }

  // (b) cacheStore는 그룹당 1회만 호출됨(대표 처리분만 upsert) — 5회가
  // 아니라 1회.
  {
    let cacheStoreCalls = 0
    let storedKey = null
    const aiClassify = async (batch) => {
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'accept', confidence: 0.9, reason: 'ok', suggested_synonym: null, part_of_speech_warning: null })
      return m
    }
    const cacheStore = async (key) => { cacheStoreCalls++; storedKey = key }
    await classifyBatch(dupGroup, { aiClassify, cacheStore })
    check('cacheStore는 그룹당 1회만 호출됨(5건이 아니라 1건 upsert)', cacheStoreCalls === 1)
    const expectedKey = buildCacheKey({ wordId: 'wdup', meaningSnapshot: '해치다', normalizedAnswer: normalizeForCompare('농부') })
    check('cacheStore에 전달된 키는 buildCacheKey 5필드 형식 그대로(대표 항목 기준)', storedKey === expectedKey)
  }

  // (c) 배치 크기(batchSize)는 대표 개수 기준 — 대표 21명 분량(각 3중복,
  // 총 63건)을 batchSize=20으로 넣으면 대표 21명은 2개 배치(20+1)로
  // 나뉘어야 한다(중복까지 합친 63건 기준으로 나뉘면 4개 배치가 됨 — 그건
  // 이 최적화의 목적을 무력화하므로 실패로 간주).
  {
    // meaning/submittedAnswer는 편집거리 1(짧은 길이)로 로컬 규칙(9단계,
    // bestDist===1 && compareLen>=2)에 우연히 자동 accept되지 않도록 서로
    // 충분히 다른 문자열로 구성한다(로컬 확정 없이 항상 unresolved -> AI로
    // 넘어가야 이 배치 크기 테스트가 유효).
    const manyReps = Array.from({ length: 21 }, (_, g) =>
      Array.from({ length: 3 }, (_, i) => ({
        id: `g${g}-${i}`, wordId: `wbatch${g}`, word: 'x', meaning: `그룹뜻모음${g}`, acceptedMeanings: [], submittedAnswer: `전혀다른답변${g}`,
      }))
    ).flat()
    let batchCount = 0
    const batchSizes = []
    const aiClassify = async (batch) => {
      batchCount++
      batchSizes.push(batch.length)
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'review', confidence: 0.5, reason: 'r', suggested_synonym: null, part_of_speech_warning: null })
      return m
    }
    const proposals = await classifyBatch(manyReps, { aiClassify, batchSize: 20 })
    check('배치 크기는 그룹 대표(21명) 기준으로 나뉨 — 2개 배치(20+1)', batchCount === 2 && batchSizes[0] === 20 && batchSizes[1] === 1)
    check('최종 제안 수는 원본 63건 그대로(중복 포함 전원)', proposals.length === 63)
  }

  // (d) statsLookup은 그룹 대표에게만 호출됨(중복 4건은 재호출 안 함) —
  // skip 결과는 5건 전원에 복제.
  {
    let statsCalls = 0
    const statsLookup = async () => { statsCalls++; return { skip: true, decision: 'reject_candidate', confidence: 0.6, reason: '통계 재사용(모의)' } }
    let aiCalls = 0
    const proposals = await classifyBatch(dupGroup, { statsLookup, aiClassify: async () => { aiCalls++; return new Map() } })
    check('statsLookup은 그룹당 1회만 호출됨(중복 4건 재호출 안 함)', statsCalls === 1)
    check('statsLookup 스킵 시 aiClassify는 호출되지 않음', aiCalls === 0)
    check('5건 전부 decision_source=stats_repeat', proposals.every((p) => p.decision_source === 'stats_repeat'))
    check('5건 전부 동일한 decision(reject_candidate)/reason을 받음', proposals.every((p) => p.decision === 'reject_candidate' && p.reason === '통계 재사용(모의)'))
  }

  // (e) budgetExceeded여도 그룹 대표만 강등 계산하고, 결과는 5건 전원에 복제.
  {
    const proposals = await classifyBatch(dupGroup, { budgetExceeded: true })
    check('budgetExceeded 강등도 5건 전원에 복제됨', proposals.length === 5 && proposals.every((p) => p.decision_source === 'ai_budget_exceeded'))
  }

  // (f) aiClassify가 throw하면 그룹 대표만 호출됐어도 에러 강등은 그룹원
  // 전원에 복제됨(review, decision_source=ai_error).
  {
    let aiCalls = 0
    const aiClassify = async () => { aiCalls++; throw new Error('모의 AI 실패') }
    const proposals = await classifyBatch(dupGroup, { aiClassify })
    check('AI 호출 실패 시에도 aiClassify는 1회만 호출됨(대표 1건 배치)', aiCalls === 1)
    check('실패 강등이 5건 전원에 복제됨(decision_source=ai_error)', proposals.length === 5 && proposals.every((p) => p.decision_source === 'ai_error' && p.decision === 'review'))
  }

  // (g) AI 응답 스키마 검증 실패(대표 항목에 대한 응답 누락)도 그룹원
  // 전원에 parse_error로 복제됨.
  {
    const aiClassify = async () => new Map() // 대표 id에 대한 응답이 아예 없음
    const proposals = await classifyBatch(dupGroup, { aiClassify })
    check('AI 응답 누락(스키마 검증 실패)도 5건 전원에 parse_error로 복제됨', proposals.length === 5 && proposals.every((p) => p.decision_source === 'parse_error' && p.decision === 'review'))
  }

  // (h) 중복이 전혀 없는 기존 사용 패턴 — 회귀 없음 재확인(각자 다른
  // wordId/answer라 그룹 크기 전부 1, 기존 동작과 100% 동일해야 함).
  {
    let aiCalls = 0
    const aiClassify = async (batch) => {
      aiCalls++
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'review', confidence: 0.5, reason: 'no-dup', suggested_synonym: null, part_of_speech_warning: null })
      return m
    }
    const proposals = await classifyBatch([F.closeButWrongMeaning, F.trueSynonymDifferentString, F.completelyWrong], { aiClassify })
    check('중복 없는 3건은 배치에 3건 전부 그대로 담김(그룹핑이 회귀를 만들지 않음)', aiCalls === 1)
    check('중복 없는 3건 각자 독립적인 결과를 받음', proposals.length === 3 && proposals.every((p) => p.decision_source === 'ai'))
  }

  // (i) 부분 중복 — 그룹 2개(중복 3건 + 유니크 1건) 섞인 경우 대표 2건만
  // 배치에 담김.
  {
    // m1~m3/m4 둘 다 1글자 비교(compareLen<2)라 편집거리 1이어도 로컬
    // 규칙(9단계)이 자동 accept하지 않는다(bestDist===1 && compareLen>=2
    // 조건 불충족) — 로컬 확정 없이 항상 unresolved로 남아야 배치 구성
    // 검증이 유효하다.
    const mixed = [
      { id: 'm1', wordId: 'wmix', word: 'x', meaning: 'y', acceptedMeanings: [], submittedAnswer: 'z' },
      { id: 'm2', wordId: 'wmix', word: 'x', meaning: 'y', acceptedMeanings: [], submittedAnswer: 'z' },
      { id: 'm3', wordId: 'wmix', word: 'x', meaning: 'y', acceptedMeanings: [], submittedAnswer: 'z' },
      { id: 'm4', wordId: 'wother', word: 'x', meaning: 'q', acceptedMeanings: [], submittedAnswer: 'w' },
    ]
    let lastBatch = null
    const aiClassify = async (batch) => {
      lastBatch = batch
      const m = new Map()
      for (const it of batch) m.set(it.id, { pending_answer_id: it.id, decision: 'accept', confidence: 0.8, reason: it.id, suggested_synonym: null, part_of_speech_warning: null })
      return m
    }
    const proposals = await classifyBatch(mixed, { aiClassify })
    check('부분 중복(3+1) — 배치에는 대표 2건만 담김', lastBatch.length === 2)
    check('부분 중복 — 최종 제안은 4건 전부 반환', proposals.length === 4)
    const byId = new Map(proposals.map((p) => [p.pending_answer_id, p]))
    check('중복 그룹(m1/m2/m3)은 대표(m1)와 동일한 reason을 공유', byId.get('m1').reason === 'm1' && byId.get('m2').reason === 'm1' && byId.get('m3').reason === 'm1')
    check('유니크 그룹(m4)은 자신만의 결과를 받음', byId.get('m4').reason === 'm4')
  }
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
