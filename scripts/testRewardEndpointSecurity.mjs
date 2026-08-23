// scripts/testRewardEndpointSecurity.mjs
//
// Reward System V1 서버 엔드포인트 보안 계약 (2026-08-23 감사).
//
// 이 파일은 **현재 상태를 고정**한다 — 잘 막혀 있는 것은 회귀를 막고,
// 아직 열려 있는 것은 "알려진 노출"로 명시해 조용히 잊히지 않게 한다.
// production에 요청을 보내지 않는다(순수 함수 + 소스 정적 검사만).
//
// ── 잘 막혀 있는 것 (회귀 방지) ─────────────────────────────────────────
//   · 금액을 클라이언트가 못 정한다 — req.body의 stars/amount를 읽지 않고
//     항상 resolveRewardStars()가 결정
//   · idempotency_key를 클라이언트가 못 정한다 — 서버가 조립
//   · rewardType 화이트리스트 + sourceType 일치 검증
//   · legacy-baseline은 API로 지급 불가(마이그레이션 전용)
//   · student_progress/students를 UPDATE/DELETE하지 않는다
//
// ── 알려진 노출 (HIGH) — 2026-08-23 강화 후 잔여분 ─────────────────────
// api/grant-xp.js에는 **인증이 없다**(POST면 누구나 호출 가능). 금액과 키는
// 서버가 정하므로 1회당 지급액은 못 부풀리지만, sourceId가 클라이언트
// 제어이고 다음 두 타입은 자유도가 사실상 무한하다:
//   · exam-complete       (pattern 'uuid')       — 임의 UUID v4마다 +2별
//   · wrong-word-recovered(pattern 'date:token') — 임의 토큰마다 +1별
// 2026-08-23 서버 강화(L1 학생 실재 / L2 exam 실재 / L3 일일 상한)로 이 두
// 타입의 **무제한**은 닫혔다. 남은 노출은 인증 부재 하나 — 상한 안에서라면
// 여전히 남의 studentId로 원장을 부풀릴 수 있다(하루 최대 86별).
//
// 대조군: 기존 XP 경로(api/grant-xp.js의 XP 분기)는 정확히 이 문제를 겪고
// 고친 이력이 있다 — source_event_id를 **기간키(날짜)** 로 제한해
// "wordId나 무작위값을 기간키 자리에 써서 사실상 무제한 반복 지급"을
// 차단했다(그 파일 주석). Reward V1은 그 교훈이 적용되지 않았다.
//
// 영향 범위(중요): 이 경로는 reward_ledger에만 쓴다. 학생이 화면에서 보는
// total_stars는 클라이언트 로컬 레코드에서 오고 원장에서 재계산되지 않으므로
// (rewardEngine.js 헤더, 운영자 결정), **학생에게 보이는 별은 변하지 않는다.**
// 그래서 CRITICAL이 아니라 HIGH로 분류한다 — 원장 무결성 손상이지
// 학생 피해가 아니다.
//
// 수정하지 않은 이유: 이 엔드포인트는 이미 배포돼 학생 트래픽을 받고 있고,
// 올바른 수정(인증 도입 또는 서버측 실재 검증/일일 상한)은 값 결정이 필요한
// 설계 판단이다. 잘못 고치면 정상 보상이 막힌다. 운영자 승인 후 수정한다.
//
// 등록: npm run verify:reward-security
// 네트워크 0, Supabase 0, production 요청 0.

import fs from 'node:fs'

let failures = 0, asserted = 0, known = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}
// 알려진 노출 — 지금은 열려 있는 것이 "현재 상태"다. 닫히면 이 단언이
// 실패하므로, 고친 사람이 이 파일을 함께 갱신하게 된다(의도된 알람).
function knownExposure(label, stillOpen) {
  asserted++; known++
  if (stillOpen) console.log(`  KNOWN 노출 유지 — ${label}`)
  else { console.log(`  CHANGED  ${label} — 닫힌 것으로 보입니다. 이 파일을 갱신하세요.`); failures++ }
}

const api = fs.readFileSync('api/grant-xp.js', 'utf8')
const code = api.split('\n').map(l => l.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n')
const eng = await import('../src/utils/rewardEngine.js')

console.log('\n1. 금액/키를 클라이언트가 정하지 못한다')
for (const needle of ['body.stars', 'body.amount', 'body.starsDelta', 'body.stars_delta']) {
  check(`req.${needle} 를 읽지 않는다`, !code.includes(needle))
}
check('req.body의 idempotency_key를 읽지 않는다', !code.includes('body.idempotency_key') && !code.includes('body.idempotencyKey'))
check('금액은 resolveRewardStars()가 결정', /resolveRewardStars\(/.test(code))
check('키는 rewardIdempotencyKey()가 조립', /rewardIdempotencyKey\(/.test(code))

console.log('\n2. 타입/소스 화이트리스트')
check('isValidRewardType으로 rewardType 검증', /isValidRewardType\(/.test(code))
check('isValidRewardSource로 sourceType/sourceId 검증', /isValidRewardSource\(/.test(code))
check('legacy-baseline은 API로 지급 불가', eng.isValidRewardType('legacy-baseline') === false)
check('알 수 없는 rewardType 거부', eng.isValidRewardType('free-stars') === false)
check('sourceType 불일치 거부', eng.isValidRewardSource('exam-complete', 'daily-goal', '2026-08-23') === false)
check('금액 0인 타입은 지급되지 않음(zero_reward 분기)', /zero_reward/.test(code))

console.log('\n3. 학생 데이터 보호')
check('student_progress를 UPDATE하지 않는다', !/from\('student_progress'\)[\s\S]{0,80}\.update\(/.test(code))
check('students를 UPDATE/DELETE하지 않는다', !/from\('students'\)[\s\S]{0,80}\.(update|delete)\(/.test(code))
check('reward_ledger에만 insert', /from\('reward_ledger'\)/.test(code) && /\.insert\(/.test(code))
check('중복 키는 23505로 흡수(재지급 아님)', /23505/.test(code))

console.log('\n4. 날짜 기간키가 강제되는 타입 — 하루 1회로 묶임')
const today = new Date().toDateString()
for (const t of ['word-session-complete', 'writing-complete', 'daily-goal-complete']) {
  const rule = eng.REWARD_SOURCE_RULES[t]
  check(`${t}: 날짜 패턴 강제(자유도 = 날짜뿐)`, rule.pattern === 'date')
  check(`${t}: 임의 문자열 거부`, eng.isValidRewardSource(t, rule.sourceType, 'anything-goes') === false)
  check(`${t}: 정상 날짜는 통과`, eng.isValidRewardSource(t, rule.sourceType, today) === true)
}

console.log('\n5. ★ 알려진 노출 (HIGH, 미수정) — 인증 부재 + sourceId 자유도')
knownExposure('api/grant-xp.js에 인증(PIN/토큰/서명) 검증이 없다',
  !/verifyStudentPin|verifyAdminPin|Authorization|bearer/i.test(code))
{
  // exam-complete: 임의 UUID v4마다 새 키 = 새 지급
  const uuids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-9222-222222222222']
  const bothValid = uuids.every(u => eng.isValidRewardSource('exam-complete', 'entrance-test', u))
  const keysDiffer = new Set(uuids.map(u => eng.rewardIdempotencyKey('s', 'exam-complete', 'entrance-test', u))).size === 2
  knownExposure(`exam-complete: 임의 UUID마다 +${eng.REWARD_STARS['exam-complete']}별 (엔진 단독으로는 통과 — 서버 L2가 entrance_test_results로 차단)`, bothValid && keysDiffer)
}
{
  // wrong-word-recovered: 날짜는 고정이어도 토큰이 자유
  const toks = [`${today}:aaa`, `${today}:bbb`, `${today}:zzz`]
  const allValid = toks.every(s => eng.isValidRewardSource('wrong-word-recovered', 'spelling-review', s))
  const keysDiffer = new Set(toks.map(s => eng.rewardIdempotencyKey('s', 'wrong-word-recovered', 'spelling-review', s))).size === toks.length
  knownExposure(`wrong-word-recovered: 임의 토큰마다 +${eng.REWARD_STARS['wrong-word-recovered']}별 (엔진 단독으로는 통과 — 서버 L3 일일 상한으로 유한화)`, allValid && keysDiffer)
}
// 2026-08-23 강화로 닫힘 — KNOWN이 아니라 회귀 방지 단언으로 전환한다.
check('서버측 일일 상한이 존재한다(2026-08-23 강화)', /rewardDailyCap\(/.test(code) && /daily_cap_reached/.test(code))

console.log('\n6. 완화 요인 — 학생에게 보이는 별은 영향받지 않는다')
{
  const wl = fs.readFileSync('src/utils/wordLibrary.js', 'utf8')
  check('total_stars는 클라이언트 로컬 값으로만 upsert된다(원장에서 재계산 없음)',
    /total_stars: totalStars/.test(wl) && !/total_stars:[\s\S]{0,120}reward_ledger/.test(wl))
  const engSrc = fs.readFileSync('src/utils/rewardEngine.js', 'utf8')
  check('rewardEngine이 total_stars를 원장에서 파생시키지 않는다', !/total_stars\s*=/.test(engSrc))
}

console.log(`\n총 단언 ${asserted}개 (알려진 노출 ${known}건 포함) / 실패 ${failures}개`)
console.log(failures === 0
  ? '보안 계약 고정 ✅ (알려진 노출은 KNOWN으로 표기 — 수정 시 이 파일을 함께 갱신할 것)'
  : `${failures}개 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
