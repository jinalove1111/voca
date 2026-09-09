// scripts/testRewardServerHardening.mjs
//
// Reward V1 서버측 강화 (2026-08-23, HIGH 4건 대응). 규칙 15에 따라
// 구현 **전에** 작성했고, 수정 전 소스에서 FAIL하는 것을 실측한 뒤 구현했다.
//
// 감사에서 확정된 HIGH 4건:
//   H1. api/grant-xp.js에 인증이 없다 — POST면 누구나 호출
//   H2. exam-complete가 pattern 'uuid'라 임의 UUID마다 +2별 (실재 시험 미검증)
//   H3. wrong-word-recovered가 'date:token'이라 임의 토큰마다 +1별
//   H4. 서버측 일일 상한이 없다
//
// 서버측 방어 3층을 추가한다(클라이언트 검증만으로는 의미 없음):
//   L1. 학생 실재 검증 — students에 없는 studentId는 거부(클라이언트 주장 불신)
//   L2. 이벤트 실재 검증 — exam-complete는 entrance_test_results에
//       (test_id, student_id) 행이 실제로 있을 때만 지급. 서버가 관측 가능한
//       진실이므로 클라이언트가 UUID를 지어내도 통과하지 못한다.
//   L3. 일일 상한 — (student_id, reward_type)별 오늘 지급 건수를 세어 초과 거부.
//       상한값은 실데이터 근거: 유닛 최대 단어 50개(wrong-word-recovered),
//       반·날짜당 입실시험 최대 8건(exam-complete). 날짜 경계는 KST 자정.
//
// 전부 fail-closed — 검증 쿼리가 실패하면 지급하지 않는다.
//
// H1(완전한 인증)은 이 범위에서 닫지 못한다. 저장소에 세션 토큰 개념이
// 없고(_pinAuth.js는 PIN 해시/관리자 재인증만 제공), 클라이언트는 로그인 후
// studentId 외에 아무 자격도 보유하지 않는다. 인증 도입은 새 아키텍처라
// "최소 수정"이 아니다 — L1~L3로 피해 반경을 상한이 있는 크기로 줄이고,
// 완전한 인증은 BLOCKED로 남긴다(운영자 설계 판단 필요).
//
// 등록: npm run verify:reward-hardening
// 순수 함수 + 소스 정적 검사. 네트워크 0, production 요청 0, DB 무접촉.

import fs from 'node:fs'

let failures = 0, asserted = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

let eng = {}
try { eng = await import('../src/utils/rewardEngine.js') } catch (e) { console.log('  (rewardEngine import 실패: ' + e.message + ')') }
const { REWARD_DAILY_CAP, rewardDailyCap, kstDayStartMs } = eng
const api = fs.readFileSync('api/grant-xp.js', 'utf8')
const code = api.split('\n').map(l => l.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n')
// reward 분기만 잘라내 검사(기존 XP 분기와 섞이지 않게)
const branch = (code.match(/if \(req\.body && req\.body\.ledger === 'reward'\)[\s\S]*?\n  \}/) || [''])[0]

console.log('\n1. 일일 상한 상수 — 실데이터 근거 값')
check('REWARD_DAILY_CAP export 존재', !!REWARD_DAILY_CAP && typeof REWARD_DAILY_CAP === 'object')
check('rewardDailyCap() 순수 함수 존재', typeof rewardDailyCap === 'function')
if (REWARD_DAILY_CAP) {
  check('word-session-complete 상한 1 (날짜키라 하루 1회)', REWARD_DAILY_CAP['word-session-complete'] === 1)
  check('writing-complete 상한 1', REWARD_DAILY_CAP['writing-complete'] === 1)
  check('daily-goal-complete 상한 1', REWARD_DAILY_CAP['daily-goal-complete'] === 1)
  check('streak-bonus 상한 1', REWARD_DAILY_CAP['streak-bonus'] === 1)
  check('exam-complete 상한 10 (반·날짜당 시험 실측 최대 8 + 여유)', REWARD_DAILY_CAP['exam-complete'] === 10)
  check('wrong-word-recovered 상한 60 (유닛 실측 최대 50단어 + 여유)', REWARD_DAILY_CAP['wrong-word-recovered'] === 60)
}
if (typeof rewardDailyCap === 'function') {
  check('알 수 없는 타입은 상한 0 (fail-closed)', rewardDailyCap('free-stars') === 0)
  check('legacy-baseline 상한 0 (API 지급 불가)', rewardDailyCap('legacy-baseline') === 0)
  check('정상 타입은 양수 상한', rewardDailyCap('exam-complete') > 0)
}

console.log(String.fromCharCode(10) + "2. KST 자정 경계 — 상한 집계 기준 (순수 수치 연산)")

check('kstDayStartMs() 존재', typeof kstDayStartMs === 'function')
if (typeof kstDayStartMs === 'function') {
  const at = (iso) => kstDayStartMs(Date.parse(iso))
  const isoOf = (ms) => new Date(ms).toISOString()
  check('UTC 00:30(=KST 09:30) -> 같은 KST 날짜의 자정', isoOf(at('2026-08-23T00:30:00Z')) === '2026-08-22T15:00:00.000Z')
  check('UTC 14:59(=KST 23:59) -> 같은 KST 날짜의 자정', isoOf(at('2026-08-23T14:59:00Z')) === '2026-08-22T15:00:00.000Z')
  check('UTC 15:01(=KST 익일 00:01) -> 다음 KST 날짜의 자정', isoOf(at('2026-08-23T15:01:00Z')) === '2026-08-23T15:00:00.000Z')
  check('경계 정확: KST 자정 직전/직후가 다른 날로 갈린다', at('2026-08-23T14:59:59Z') !== at('2026-08-23T15:00:00Z'))
  check('잘못된 입력은 NaN(fail-closed)', Number.isNaN(kstDayStartMs('nope')))
}

console.log('\n3. L1 — 학생 실재 검증 (클라이언트 주장 불신)')
check('reward 분기가 students 테이블을 조회한다', /from\('students'\)/.test(branch))
check('학생 미존재 시 거부 사유 존재', /student_not_found/.test(branch))
check('조회 실패 시 fail-closed(지급하지 않음)', /student_lookup_failed/.test(branch))

console.log('\n4. L2 — exam-complete 실재 검증')
check('entrance_test_results를 조회한다', /from\('entrance_test_results'\)/.test(branch))
check('test_id와 student_id 둘 다로 조회', /test_id/.test(branch) && /student_id/.test(branch))
check('제출 기록 없으면 거부 사유 존재', /exam_result_not_found/.test(branch))
check('조회 실패 시 fail-closed', /exam_lookup_failed/.test(branch))
check('exam-complete일 때만 이 검증을 탄다(다른 타입 무영향)', /rewardType === 'exam-complete'/.test(branch))

console.log('\n5. L3 — 서버측 일일 상한')
check('reward_ledger에서 오늘 건수를 센다', /from\('reward_ledger'\)[\s\S]{0,400}count/.test(branch))
check('created_at을 KST 자정 기준으로 필터', /kstDayStartMs\(/.test(branch) && /gte\('created_at'/.test(branch))
check('student_id + reward_type으로 한정', /eq\('student_id'/.test(branch) && /eq\('reward_type'/.test(branch))
check('상한 초과 시 거부 사유 존재', /daily_cap_reached/.test(branch))
check('집계 실패 시 fail-closed', /cap_check_failed/.test(branch))
check('rewardDailyCap()으로 상한을 얻는다', /rewardDailyCap\(/.test(branch))

console.log('\n6. 기존 동작 무회귀 — 원래 방어가 그대로 남아 있는가')
check('금액은 여전히 resolveRewardStars()가 결정', /resolveRewardStars\(/.test(branch))
check('키는 여전히 서버가 조립', /rewardIdempotencyKey\(/.test(branch))
check('req.body에서 금액을 읽지 않는다', !/body\.stars|body\.amount/.test(code))
check('23505 중복키 흡수 유지', /23505|DUPLICATE_KEY_VIOLATION/.test(branch))
check('42P01/PGRST205 table_missing 폴백 유지', /42P01/.test(branch) && /PGRST205/.test(branch))
check('student_progress를 UPDATE하지 않는다', !/from\('student_progress'\)[\s\S]{0,80}\.update\(/.test(code))
check('기존 XP 분기는 무변경(같은 파일 내 공존)', /const \{ studentId, eventType, sourceEventId \} = req\.body/.test(code))

console.log('\n7. 공격 시나리오 — 상한이 실제로 피해를 묶는가 (구조 검증, magic budget 아님)')
// 이 절은 원래(2026-08-23, commit b55b96e) `worst < 200`을 단언했다 — 그 때
// REWARD_DAILY_CAP은 원본 6개 앵커뿐이었다(합 91). 2026-09-06 commit 52db9e4가
// 같은 객체에 레거시 6종을 추가해 Σ가 766으로 뛰었고, 그 Σ 공식 자체도
// REWARD_STARS의 가변 금액 placeholder(spelling-combo/streak-bonus = 0)를
// 그대로 곱해 실제 천장(951)을 과소집계한다(정밀 스냅샷은
// scripts/testRewardDailyCeilingTable.mjs). 운영자가 예산 숫자를 승인한 적이
// 없으므로(rewardEngine.js REWARD_DAILY_CAP 주석 "OPEN DECISION") 이 절은
// 더 이상 임의의 상한 리터럴(<200/<766/<951 등)을 단언하지 않고, 원래 의도
// — "상한이 무제한이 아니다: 모든 지급 타입에 유한한 일일 상한이 존재하고
// 공격자가 무제한으로 부풀릴 수 없다" — 만 구조적으로 검증한다.
if (REWARD_DAILY_CAP && eng.REWARD_STARS && eng.REWARD_SOURCE_RULES) {
  const capKeys = Object.keys(REWARD_DAILY_CAP).sort()
  const ruleKeys = Object.keys(eng.REWARD_SOURCE_RULES).sort()
  check('REWARD_SOURCE_RULES의 모든 타입에 유한 양의 정수 상한이 있다',
    ruleKeys.every((t) => Number.isInteger(REWARD_DAILY_CAP[t]) && REWARD_DAILY_CAP[t] > 0))
  check('REWARD_DAILY_CAP의 모든 키가 REWARD_SOURCE_RULES에도 존재한다(역방향 — 상한만 있고 지급 경로 없는 유령 키 없음)',
    capKeys.every((t) => Object.prototype.hasOwnProperty.call(eng.REWARD_SOURCE_RULES, t)))
  check('두 키 집합이 완전히 동일하다', JSON.stringify(capKeys) === JSON.stringify(ruleKeys))

  check('알 수 없는 타입은 rewardDailyCap() 0 (무제한 아님)', !rewardDailyCap('__unknown_reward_type__'))
  check('legacy-baseline은 rewardDailyCap() 0 (구성상 배제, API 지급 불가)', !rewardDailyCap('legacy-baseline'))

  // 단일 이벤트 최대 지급액 — 고정 금액 타입은 REWARD_STARS[t] 그대로 양수여야
  // 하고, 가변 금액 타입(streak-bonus/spelling-combo)은 REWARD_STARS가 0
  // placeholder이므로(rewardEngine.js:46,60) 실제 금액표(STREAK_BONUS/
  // LEGACY_SPELLING_COMBO_BONUS)의 최댓값을 봐야 한다 — 이 접근은
  // testRewardDailyCeilingTable.mjs의 maxStarsFor()와 동일하다(같은 결론에
  // 두 번 도달해 서로 교차검증).
  const VARIABLE_TYPES = ['spelling-combo', 'streak-bonus']
  const maxStarsFor = (t) => {
    const fixed = eng.REWARD_STARS[t]
    if (typeof fixed === 'number' && fixed > 0) return fixed
    if (t === 'spelling-combo' && eng.LEGACY_SPELLING_COMBO_BONUS) return Math.max(...Object.values(eng.LEGACY_SPELLING_COMBO_BONUS))
    if (t === 'streak-bonus' && eng.STREAK_BONUS) return Math.max(...Object.values(eng.STREAK_BONUS))
    return 0
  }
  check('고정 금액 타입은 전부 REWARD_STARS[t] > 0 (placeholder 0 없음)',
    ruleKeys.filter((t) => !VARIABLE_TYPES.includes(t)).every((t) => eng.REWARD_STARS[t] > 0))
  check('가변 금액 타입(spelling-combo/streak-bonus)도 실제 금액표 최댓값이 유한 양수(REWARD_STARS placeholder 0에 가려지지 않음)',
    VARIABLE_TYPES.every((t) => Number.isFinite(maxStarsFor(t)) && maxStarsFor(t) > 0))

  check('exam-complete 단독 상한 = 10 x 2 = 20별', REWARD_DAILY_CAP['exam-complete'] * eng.REWARD_STARS['exam-complete'] === 20)
  check('wrong-word-recovered 단독 상한 = 60 x 1 = 60별', REWARD_DAILY_CAP['wrong-word-recovered'] * eng.REWARD_STARS['wrong-word-recovered'] === 60)

  // Σ(cap × 실제 단일 이벤트 최대 금액) — "얼마인지"는 참고용으로만 출력하고
  // 어떤 문턱값도 assert하지 않는다(운영자 예산 미승인, 위 배경 주석 참고).
  // 유한하다는 것 자체만 확인 — 이것이 원래 §7의 의도("무제한이 아니다")다.
  const worst = ruleKeys.reduce((sum, t) => sum + REWARD_DAILY_CAP[t] * maxStarsFor(t), 0)
  check('한 학생당 하루 이론 상한 합이 유한 양수다(무제한 아님) — 구체적 예산 값은 단언하지 않음',
    Number.isFinite(worst) && worst > 0)
  console.log(`  참고(집계 제외, 정책 아님): 이론 상한 합 = ${worst}★ — 예산 승인값은 운영자 결정(OPEN DECISION, rewardEngine.js REWARD_DAILY_CAP 주석)`)
}

console.log(String.fromCharCode(10) + '8. H1 인증 — 2026-08-24 서명 세션 토큰으로 닫힘')
{
  check('reward 분기에 인증 guard가 있다', /verifySessionToken\(/.test(branch))
  check('거부 사유 unauthorized 존재', /unauthorized/.test(branch))
  check('L0 인증이 L1~L3보다 먼저 온다(불필요한 DB 조회 방지)',
    branch.indexOf('verifySessionToken') < branch.indexOf("from('students')"))
  check('L1~L3 기존 방어가 그대로 남아 있다',
    /student_not_found/.test(branch) && /exam_result_not_found/.test(branch) && /daily_cap_reached/.test(branch))
}

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0 ? '모든 단언 통과 — Reward V1 서버측 강화 고정 ✅' : `${failures}개 단언 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
