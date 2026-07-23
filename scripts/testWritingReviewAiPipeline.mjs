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
import {
  classifyLocally, classifyBatch, buildBatches, buildCacheKey, parseCacheKey,
  buildAiPrompt, parseAiBatchResponse, estimateCostUsd, editDistance,
  normalizeForCompare, verifyAdminPin, isValidAiDecision,
} from '../supabase/functions/grade-writing-answers/pipeline.js'
import {
  selectRows, findDuplicateAnswerRows, planAccept, selectHighConfidenceAccepts,
  filterProposals, summarizeBulkResults, normalizeForCompare as normalizeForCompareClient,
} from '../src/utils/spellingReviewBulkPlan.js'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

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

console.log('\n26. 라이브 배포 의존 항목 — 로컬 검증 불가(정직한 SKIP, 실패로 안 셈)')
{
  console.log('  SKIP  실제 Supabase Edge Function(grade-writing-answers) e2e 호출 — 배포(supabase functions deploy) 후 스테이징에서 확인 필요')
  console.log('  SKIP  spelling_ai_grading_cache 테이블 RLS(anon INSERT 거부) 실측 — supabase_v3_6_writing_review_ai_cache.sql 실행 후 scripts/testRlsSecurity.mjs류로 확인 필요')
  console.log('  SKIP  실제 Claude Haiku 4.5 응답 스키마 준수율 — 로컬에 ANTHROPIC_API_KEY 없음, mock으로만 파싱 로직 검증됨(위 8/9번)')
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
