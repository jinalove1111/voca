// tests/harness/runSentenceLearning.mjs — Sentence Learning(v3.4) 순수 엔진
// 하네스. runReading.mjs와 같은 자기완결형 — Supabase/브라우저 없이
// src/utils/sentenceLearning.js의 순수 함수만 단언한다(I/O 레이어
// sentenceProgressApi.js/readingApi.js 확장은 수동/관리자 화면 검증 대상,
// TESTING.md 관례).
import { readFileSync } from 'node:fs'
import {
  STAGES, IMPORTANCE_LABELS, ENCOURAGE,
  normalizeAnswer, pickBlank, chunksOf, shuffleDeterministic,
  checkChunkOrder, checkBlank, adaptiveState, encouragementFor,
  nextStage, applyStageResult,
} from '../../src/utils/sentenceLearning.js'

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:sentence-learning] Sentence Learning — 순수 엔진 ===')

console.log('\n-- normalizeAnswer')
check('소문자화 + trim + 연속 공백 축약', normalizeAnswer('  I   Went  To SCHOOL ') === 'i went to school')
check('구두점 제거(. , ! ? \' " …)', normalizeAnswer('Hello, world!?') === 'hello world' && normalizeAnswer("Don't...") === 'dont')
check('타이포그래피 따옴표도 제거', normalizeAnswer('Don’t “stop”') === 'dont stop')
check('빈/비문자열 입력 → 빈 문자열', normalizeAnswer('') === '' && normalizeAnswer(null) === '' && normalizeAnswer(undefined) === '')

console.log('\n-- pickBlank')
const unitWords = ['school', 'apple']
const b1 = pickBlank('I went to school yesterday.', unitWords)
check('① 유닛 단어 우선 — school이 빈칸', b1 && b1.answer === 'school' && b1.blankIndex === 3)
check('display에 _____ 표시 + 나머지 원문 보존', b1 && b1.display === 'I went to _____ yesterday.')
const b2 = pickBlank('I went to the park.', [])
check('② 유닛 단어 없으면 동사 — went가 빈칸', b2 && b2.answer === 'went')
const b3 = pickBlank('The big dog.', [])
check('③ 동사도 없으면 마지막 내용어 — dog가 빈칸(관사 the 제외)', b3 && b3.answer === 'dog')
check('관사는 절대 빈칸이 안 됨', ['a', 'an', 'the'].every((art) => (pickBlank(`${art} apple`, []) || {}).answer !== art))
const b4 = pickBlank('I a b c', [])
check('1글자 토큰은 절대 빈칸이 안 됨', !b4 || (b4.answer.length >= 2))
check('빈칸 후보가 전혀 없으면 null(크래시 없음)', pickBlank('a I', []) === null && pickBlank('', []) === null && pickBlank(null, null) === null)
check('결정론(같은 입력 → 항상 같은 빈칸)', JSON.stringify(pickBlank('I went to school.', unitWords)) === JSON.stringify(pickBlank('I went to school.', unitWords)))
const b5 = pickBlank('She likes apples, and he likes school.', ['school'])
check('유닛 단어가 구두점을 달고 있어도 매칭(school. → school)', b5 && b5.answer === 'school')

console.log('\n-- chunksOf')
check('유효한 chunks(2개 이상 문자열 배열)면 그대로(trim)', JSON.stringify(chunksOf({ english: 'x', chunks: [' I went ', 'to school'] })) === JSON.stringify(['I went', 'to school']))
check('chunks 없음/1개/비배열 → 문장 전체 단일 청크 폴백',
  JSON.stringify(chunksOf({ english: 'I went to school.' })) === JSON.stringify(['I went to school.'])
  && JSON.stringify(chunksOf({ english: 'Hi.', chunks: ['Hi.'] })) === JSON.stringify(['Hi.'])
  && JSON.stringify(chunksOf({ english: 'Hi.', chunks: 'broken' })) === JSON.stringify(['Hi.']))
check('jsonb가 문자열로 와도 파싱 수용', JSON.stringify(chunksOf({ english: 'x', chunks: '["a b","c d"]' })) === JSON.stringify(['a b', 'c d']))
check('english도 없으면 빈 배열(크래시 없음)', chunksOf({}).length === 0 && chunksOf(null).length === 0)

console.log('\n-- shuffleDeterministic')
const orig = ['alpha', 'bravo', 'charlie', 'delta']
const s1 = shuffleDeterministic(orig, 'seed-1')
check('시드 결정론(같은 시드 → 같은 순서)', JSON.stringify(s1) === JSON.stringify(shuffleDeterministic(orig, 'seed-1')))
check('다른 시드 → (이 케이스에서) 다른 순서', JSON.stringify(s1) !== JSON.stringify(shuffleDeterministic(orig, 'seed-2')))
check('원소 보존(같은 멤버, 순서만 변경)', [...s1].sort().join(',') === [...orig].sort().join(','))
check('입력 불변(순수)', orig.join(',') === 'alpha,bravo,charlie,delta')
const allSeedsDiffer = ['a', 'b', 'c', 'x1', 'x2', 'x3', 'long-seed', ''].every((seed) => {
  const out = shuffleDeterministic(['p', 'q'], seed)
  return out.length === 2 && out.join(',') !== 'p,q'
})
check('길이 ≥ 2면 항상 원본 순서와 다름(같으면 회전)', allSeedsDiffer)
check('길이 0/1은 그대로', shuffleDeterministic([], 's').length === 0 && shuffleDeterministic(['x'], 's').join('') === 'x')

console.log('\n-- checkChunkOrder / checkBlank')
check('청크 순서 정답(정규화 비교 — 대소문자/구두점 무관)', checkChunkOrder(['i went', 'To School.'], ['I went', 'to school']))
check('청크 순서 오답/길이 불일치/빈 배열 거부', !checkChunkOrder(['to school', 'I went'], ['I went', 'to school']) && !checkChunkOrder(['I went'], ['I went', 'to school']) && !checkChunkOrder([], []))
check('빈칸 정답(정규화 비교)', checkBlank(' School. ', 'school') && checkBlank("DON'T", "don't"))
check('빈칸 오답/빈 정답 거부', !checkBlank('park', 'school') && !checkBlank('', '') && !checkBlank('x', null))

console.log('\n-- adaptiveState / 격려 문구')
check('0~1회 오답: 힌트 없음', !adaptiveState(0).showFullSentence && !adaptiveState(1).showFullSentence && !adaptiveState(1).revealAnswer)
check('2회 오답: 전체 문장 표시', adaptiveState(2).showFullSentence && !adaptiveState(2).revealAnswer)
check('3회 오답: 답 공개 + 공개 후 재입력 요구', adaptiveState(3).revealAnswer && adaptiveState(3).requireRetryAfterReveal)
check('음수/비수치 입력도 크래시 없이 기본 상태', !adaptiveState(-1).showFullSentence && !adaptiveState('x').revealAnswer)
check('격려 문구 3종 + 시도 횟수 결정론 선택', ENCOURAGE.length === 3 && encouragementFor(0) === ENCOURAGE[0] && encouragementFor(4) === ENCOURAGE[1] && encouragementFor(2) === encouragementFor(5))
const punitive = ['틀렸', '벌', '실망', '못했', '왜 안']
check('벌점/질책 언어 없음(격려 문구 전수 검사)', ENCOURAGE.every((m) => punitive.every((p) => !m.includes(p))))

console.log('\n-- nextStage')
check('STAGES 6단계 순서 고정', STAGES.join(',') === 'read,chunk,puzzle,one_blank,ko_to_en,mastered')
check('핵심 문장은 단계를 순서대로 걷는다', nextStage('read', true) === 'chunk' && nextStage('chunk', true) === 'puzzle' && nextStage('puzzle', true) === 'one_blank' && nextStage('one_blank', true) === 'ko_to_en' && nextStage('ko_to_en', true) === 'mastered')
check('mastered 이후는 null', nextStage('mastered', true) === null)
check('비핵심 문장은 어떤 단계에도 진입하지 않음(null)', STAGES.every((s) => nextStage(s, false) === null) && nextStage(undefined, false) === null)
check('알 수 없는 단계값은 read로 방어', nextStage('weird', true) === 'read')

console.log('\n-- applyStageResult (순수 리듀서)')
const t0 = new Date('2026-07-23T10:00:00Z')
const r1 = applyStageResult(null, 'read', true, t0)
check('빈 진행도에서 read 정답 → chunk 전진 + 카운트/시각 기록',
  r1.current_stage === 'chunk' && r1.completed_stages.join(',') === 'read'
  && r1.attempt_count === 1 && r1.correct_count === 1 && r1.wrong_count === 0
  && r1.last_practiced_at === t0.toISOString() && r1.mastered_at === null)
const r2 = applyStageResult({ ...r1 }, 'chunk', false, t0)
check('오답 → 단계 유지 + wrong_count만 증가', r2.current_stage === 'chunk' && r2.wrong_count === 1 && r2.correct_count === 1 && r2.completed_stages.join(',') === 'read')
const r3 = applyStageResult({ ...r2, completed_stages: ['read', 'chunk'] }, 'chunk', true, t0)
check('completed_stages 중복 없이 유지(append-unique)', r3.completed_stages.filter((s) => s === 'chunk').length === 1 && r3.current_stage === 'puzzle')
const rFinal = applyStageResult({ current_stage: 'ko_to_en', completed_stages: ['read', 'chunk', 'puzzle', 'one_blank'], attempt_count: 9, correct_count: 7, wrong_count: 2 }, 'ko_to_en', true, t0)
check('ko_to_en 정답 → mastered 도달 + mastered_at 기록', rFinal.current_stage === 'mastered' && rFinal.mastered_at === t0.toISOString() && rFinal.completed_stages.includes('ko_to_en'))
const t1 = new Date('2026-07-24T10:00:00Z')
const rAgain = applyStageResult({ ...rFinal }, 'ko_to_en', true, t1)
check('mastered_at은 최초 1회만(재학습해도 불변)', rAgain.mastered_at === t0.toISOString() && rAgain.last_practiced_at === t1.toISOString())
const frozen = { current_stage: 'read', completed_stages: ['read'], attempt_count: 1, correct_count: 1, wrong_count: 0, mastered_at: null }
const frozenCopy = JSON.stringify(frozen)
applyStageResult(frozen, 'chunk', true, t0)
check('입력 행을 변경하지 않음(순수)', JSON.stringify(frozen) === frozenCopy)

console.log('\n-- IMPORTANCE_LABELS')
check('1..5 라벨 완비', [1, 2, 3, 4, 5].every((n) => typeof IMPORTANCE_LABELS[n] === 'string' && IMPORTANCE_LABELS[n].length > 0))
check('5=반드시 암기 / 1=참고', IMPORTANCE_LABELS[5] === '반드시 암기' && IMPORTANCE_LABELS[1] === '참고')

console.log('\n-- 순수성(코드 레벨)')
const src = readFileSync(new URL('../../src/utils/sentenceLearning.js', import.meta.url), 'utf8')
check('sentenceLearning.js는 import 0 순수 모듈', !/^import /m.test(src))
check('Math.random 없음(결정론)', !src.includes('Math.random'))
check('supabase/localStorage 접근 없음', !src.includes('supabase') && !src.includes('localStorage'))

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  sentence-learning — Sentence Learning 순수 엔진 (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  sentence-learning — ${failed}건: ${failures.join(', ')}`); process.exit(1)
