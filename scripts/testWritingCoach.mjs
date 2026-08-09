// Writing Coach MVP 순수 모듈 검증 하네스.
//
// src/utils/writing/*.js는 전부 React/DB 무의존 순수 모듈이라 esbuild 번들
// 없이 Node에서 바로 import 가능하다(package.json "type": "module").
//   node scripts/testWritingCoach.mjs
//
// 핵심 검증: 운영자 예시 시나리오("I go to park yesterday." → 힌트 → 학생
// 자가 수정 → 완료)를 그대로 재현 + 3회 실패 후 정답 공개 + 오탐 방어
// (정상 문장에 오류 0 — school 무관사 예외 등).
import { ERROR_TYPES, errorTypeByCode } from '../src/utils/writing/errorTaxonomy.js'
import {
  runRuleChecks,
  suggestCorrection,
  PAST_TENSE_MAP,
  ARTICLE_NOUNS,
  NO_ARTICLE_IDIOM_NOUNS,
} from '../src/utils/writing/ruleChecks.js'
import {
  startSession,
  submitAttempt,
  getSessionSummary,
  REVEAL_AFTER_ATTEMPTS,
} from '../src/utils/writing/writingSession.js'

let failures = 0
let passes = 0
function check(label, cond) {
  if (cond) { console.log(`  PASS  ${label}`); passes++ }
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. taxonomy — 14개 오류 유형 코드가 전부 존재하고 조회 가능함')
{
  const expected = [
    'tense', 'article', 'subject_verb_agreement', 'singular_plural',
    'preposition', 'word_order', 'spelling', 'punctuation', 'verb_form',
    'pronoun', 'comparison', 'infinitive_gerund', 'vocabulary_choice',
    'unnatural_expression',
  ]
  check(`ERROR_TYPES가 정확히 ${expected.length}종`, ERROR_TYPES.length === expected.length)
  for (const code of expected) {
    const t = errorTypeByCode(code)
    check(`errorTypeByCode("${code}")가 label/hintTemplate을 가짐`,
      !!t && typeof t.label === 'string' && typeof t.hintTemplate === 'function')
  }
  check('errorTypeByCode("없는코드")는 null(throw 아님)', errorTypeByCode('nope') === null)
  check('hintTemplate은 ctx 없이 호출해도 문자열 반환(폴백)',
    ERROR_TYPES.every((t) => typeof t.hintTemplate() === 'string' && t.hintTemplate().length > 0))
}

console.log('\n2. 운영자 예시 시나리오 — "I go to park yesterday." 3단계 전체 재현')
{
  let s = startSession({ targetWords: [] })
  check('startSession: attemptCount 0 / 미완료', s.attemptCount === 0 && s.completed === false)

  // 1차: 시제 + 관사 2건
  s = submitAttempt(s, 'I go to park yesterday.')
  const types1 = s.remainingErrors.map((e) => e.type).sort()
  check('1차: 오류 2건(tense + article)', JSON.stringify(types1) === JSON.stringify(['article', 'tense']))
  check('1차: 피드백 첫 줄이 "2곳 다시 확인해보세요."', s.feedback[0] === '2곳 다시 확인해보세요.')
  check('1차: 힌트에 yesterday 언급(시제 단서)', s.feedback.some((f) => f.includes('yesterday') && f.includes('시제')))
  check('1차: 힌트에 park 앞 확인 유도', s.feedback.some((f) => f.includes('park 앞')))
  check('1차: 피드백은 최대 3줄', s.feedback.length <= 3)
  check('1차: 어떤 피드백에도 정답 단어(went/the) 대필 없음',
    !s.feedback.some((f) => /\bwent\b|\bthe\b/.test(f)))
  check('1차: 정답 공개 아직 불가', s.revealAllowed === false && s.revealText === null)
  check('1차: original이 첫 제출 문장으로 고정', s.original === 'I go to park yesterday.')

  // 2차: 시제만 고침 → 인정 문구 + 관사 힌트
  s = submitAttempt(s, 'I went to park yesterday.')
  check('2차: 남은 오류는 article 1건', s.remainingErrors.length === 1 && s.remainingErrors[0].type === 'article')
  check('2차: 인정 문구가 먼저("시제는 고쳤어요.")', s.feedback[0] === '시제는 고쳤어요.')
  check('2차: 남은 관사 힌트에 "이제" + park', s.feedback[1]?.startsWith('이제') && s.feedback[1].includes('park'))
  check('2차: 자가 수정 1건 집계', s.selfCorrectedCount === 1)
  check('2차: 아직 미완료', s.completed === false)

  // 3차: 관사도 고침 → 완료
  s = submitAttempt(s, 'I went to the park yesterday.')
  check('3차: 오류 0 → completed', s.completed === true && s.remainingErrors.length === 0)
  check('3차: 자가 수정 2건(시제+관사 모두 학생이 직접)', s.selfCorrectedCount === 2)
  check('3차: 인정 문구(관사) 포함', s.feedback.some((f) => f.includes('관사')))

  const summary = getSessionSummary(s)
  check('summary: attemptCount 3', summary.attemptCount === 3)
  check('summary: selfCorrectedCount 2', summary.selfCorrectedCount === 2)
  check('summary: errorTypes에 tense/article 기록', summary.errorTypes.includes('tense') && summary.errorTypes.includes('article'))
  check('summary: completed true', summary.completed === true)
}

console.log('\n3. 3회 실패 → revealAllowed + suggestCorrection 정답 공개')
{
  let s = startSession({})
  const wrong = 'I go to park yesterday.'
  for (let i = 0; i < REVEAL_AFTER_ATTEMPTS; i++) s = submitAttempt(s, wrong)
  check(`${REVEAL_AFTER_ATTEMPTS}회 실패 후 revealAllowed`, s.revealAllowed === true)
  check('revealText가 정답 문장', s.revealText === 'I went to the park yesterday.')
  check('2회까지는 공개 불가였음(중간 상태 재확인)', (() => {
    let t = startSession({})
    t = submitAttempt(t, wrong)
    t = submitAttempt(t, wrong)
    return t.revealAllowed === false && t.revealText === null
  })())
  // 공개 후 고친 오류는 자가 수정으로 세지 않는다(보수적 KPI 집계)
  s = submitAttempt(s, 'I went to the park yesterday.')
  check('공개 후 완료 — completed', s.completed === true)
  check('공개 후 고친 2건은 selfCorrected로 안 셈', s.selfCorrectedCount === 0)
}

console.log('\n4. 오탐 방어 — 정상 문장에는 절대 발화하지 않음')
{
  const clean = [
    'I went to school yesterday.',      // school은 무관사 관용 — 관사 규칙 침묵
    'I went home last night.',          // home도 무관사 관용
    'I wanted to go home yesterday.',   // to 뒤 원형(부정사)은 정상
    "I didn't go to school yesterday.", // 조동사 뒤 원형은 정상
    'She goes to the park every day.',  // 3인칭 -s 이미 맞음 + 관사 있음
    'He is happy.',                     // 시간 표현 없음 — 시제 규칙 침묵
    'We play soccer.',                  // he/she/it 아님 — SVA 침묵
  ]
  for (const sent of clean) {
    const { errors } = runRuleChecks(sent)
    check(`정상 문장 오류 0: "${sent}"`, errors.length === 0)
  }
  check('school/home/work/bed가 관사 규칙 대상에 절대 없음',
    NO_ARTICLE_IDIOM_NOUNS.every((n) => !ARTICLE_NOUNS.includes(n)))
}

console.log('\n5. 대문자/마침표/I 철자/3인칭 규칙')
{
  const r1 = runRuleChecks('he plays soccer.')
  check('첫 글자 소문자 → punctuation(where:start)', r1.errors.some((e) => e.type === 'punctuation'))

  const r2 = runRuleChecks('I like pizza')
  check('끝 문장부호 없음 → punctuation', r2.errors.some((e) => e.type === 'punctuation' && e.span === null))

  const r3 = runRuleChecks('i am happy.')
  check('소문자 i → spelling', r3.errors.some((e) => e.type === 'spelling'))
  check('소문자 i로 시작 시 대문자 규칙은 중복 발화 안 함(spelling 한 건만)',
    r3.errors.length === 1)
  check('suggestCorrection: i → I', suggestCorrection('i am happy.', r3.errors) === 'I am happy.')

  const r4 = runRuleChecks('He play soccer.')
  check('He + 원형 → subject_verb_agreement', r4.errors.some((e) => e.type === 'subject_verb_agreement'))
  check('SVA 힌트가 주어(He)를 짚음', r4.errors[0].hint.includes('He'))
  check('suggestCorrection: He play → He plays', suggestCorrection('He play soccer.', r4.errors) === 'He plays soccer.')

  // 시제와 SVA가 같은 동사에서 충돌하면 시제만(went가 정답인데 goes로
  // 유도하는 힌트 방지)
  const r5 = runRuleChecks('He go to school yesterday.')
  check('He go + yesterday → tense만(SVA 억제)',
    r5.errors.some((e) => e.type === 'tense') && !r5.errors.some((e) => e.type === 'subject_verb_agreement'))

  // 복합 교정: 소문자 시작 + 시제 + 끝부호 없음
  const raw = 'he go to school yesterday'
  const r6 = runRuleChecks(raw)
  check('복합 오류 3건 감지(대문자/시제/끝부호)', r6.errors.length === 3)
  check('suggestCorrection 복합 교정', suggestCorrection(raw, r6.errors) === 'He went to school yesterday.')
}

console.log('\n6. targetWords — whole-word 사용 여부(usedTargetWords)')
{
  const { errors, usedTargetWords } = runRuleChecks('I like my new bag.', { targetWords: ['bag', 'happy'] })
  check('오류와 별도 필드로 반환(오류 0 유지)', errors.length === 0)
  check('bag은 used=true', usedTargetWords.find((u) => u.word === 'bag')?.used === true)
  check('happy는 used=false', usedTargetWords.find((u) => u.word === 'happy')?.used === false)
  const partial = runRuleChecks('She is friendly.', { targetWords: ['friend'] })
  check('부분 문자열은 미사용 처리(friendly ≠ friend)', partial.usedTargetWords[0].used === false)
  // 세션에도 그대로 흐른다
  let s = startSession({ targetWords: ['park'] })
  s = submitAttempt(s, 'I went to the park yesterday.')
  check('세션 state에 usedTargetWords 반영', s.usedTargetWords[0]?.used === true)
}

console.log('\n7. 상태 머신 방어 — 빈 제출/불변성/사전 무결성')
{
  let s = startSession({})
  const before = s
  s = submitAttempt(s, '   ')
  check('빈 제출은 attemptCount를 안 올림', s.attemptCount === 0)
  check('빈 제출 안내 문구', s.feedback[0] === '문장을 입력해주세요.')
  check('이전 state 불변(원본 미변형)', before.feedback.length === 0)

  s = submitAttempt(s, 'I go to park yesterday.')
  check('완료 전 제출도 completed=false 유지', s.completed === false)

  check('PAST_TENSE_MAP 소사전 20개 이상', Object.keys(PAST_TENSE_MAP).length >= 20)
  check('suggestCorrection: 오류 없으면 null', suggestCorrection('I am happy.', []) === null)
  check('runRuleChecks: 비문자열 입력에 안전(빈 결과)', runRuleChecks(null).errors.length === 0)
}

console.log(`\n결과: PASS ${passes} / FAIL ${failures}`)
process.exit(failures > 0 ? 1 : 0)
