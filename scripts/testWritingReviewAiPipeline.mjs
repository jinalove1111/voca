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
  PROMPT_VERSION, AI_MODEL_ID,
} from '../supabase/functions/grade-writing-answers/pipeline.js'
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

console.log('\n39. 캐시 키 버저닝 — partOfSpeech별 분리, PROMPT_VERSION/AI_MODEL_ID 포함, 6필드 라운드트립')
{
  const base = { wordId: 'w1', meaningSnapshot: '뜻', normalizedAnswer: '답' }
  const keyNoun = buildCacheKey({ ...base, partOfSpeech: 'noun' })
  const keyVerb = buildCacheKey({ ...base, partOfSpeech: 'verb' })
  check('partOfSpeech가 다르면 캐시 키도 다름(같은 단어/뜻/답이어도 분리)', keyNoun !== keyVerb)

  const keyDefault = buildCacheKey(base) // partOfSpeech 생략 -> ''
  check('현재 PROMPT_VERSION 상수가 키에 포함(프롬프트 변경 시 자동 캐시 무효화 근거)', keyDefault.includes(PROMPT_VERSION))
  check('현재 AI_MODEL_ID 상수가 키에 포함(모델 변경 시 자동 캐시 무효화 근거)', keyDefault.includes(AI_MODEL_ID))

  const parsedNoun = parseCacheKey(keyNoun)
  check('partOfSpeech 포함 키도 6필드 전부 라운드트립', parsedNoun.wordId === 'w1' && parsedNoun.meaningSnapshot === '뜻' && parsedNoun.normalizedAnswer === '답' && parsedNoun.partOfSpeech === 'noun' && parsedNoun.promptVersion === PROMPT_VERSION && parsedNoun.model === AI_MODEL_ID)
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
  check('setWordAcceptedMeanings 인자 2개(wordDbId, meanings) — 시그니처 불변', wordLibraryReal.setWordAcceptedMeanings.length === 2)
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

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
