// scripts/testRewardDailyCeilingTable.mjs
//
// Reward System V1 — 일일 상한(REWARD_DAILY_CAP) × "실제 최대 지급액"
// 천장(ceiling) 테이블. 결정 지원용(non-gating, extra:true) — 상한값 자체를
// 바꾸거나 예산을 확정하는 테스트가 아니라, 기존 Σ(cap × 금액) 공격 시나리오
// 계산(scripts/testRewardServerHardening.mjs 7절, ~110-112행)이 가변 금액
// 타입 2종을 과소집계하고 있음을 정직하게 드러내고 고정한다.
//
// ── 배경(읽기 전용 분석, 2026-09-09) ────────────────────────────────────
// testRewardServerHardening.mjs:110-112는 worst = Σ REWARD_DAILY_CAP[t] ×
// REWARD_STARS[t] = 766 을 계산해 `worst < 200`을 단언한다. 이 단언은 이미
// stale하다(2026-09-06 레거시 6종 흡수 전, 원래 6개 앵커 합 86 기준으로
// 맞춰졌던 상한 — rewardEngine.js 551-555행 "OPEN DECISION" 주석 참고) —
// 이 파일은 그 단언을 고치지 않는다(운영자 결정 보류, product code 소유권
// 밖). 대신 그 Σ 공식 자체가 가변 금액 타입 2종을 과소집계하고 있음을
// 드러낸다:
//   · REWARD_STARS['spelling-combo'] === 0 (rewardEngine.js:60) — 실제
//     금액은 LEGACY_SPELLING_COMBO_BONUS(:77)에서 콤보(3/5/10)별로 조회되며
//     최댓값은 3. cap(spelling-combo)=60 → 실제 최대 60×3=180인데 Σ 공식은
//     60×0=0으로 집계한다.
//   · REWARD_STARS['streak-bonus'] === 0 (:46) — 실제 금액은
//     STREAK_BONUS(:82)에서 연속일수(3/5/7)별로 조회되며 최댓값은 5.
//     cap(streak-bonus)=1 → 실제 최대 1×5=5인데 Σ 공식은 1×0=0으로 집계한다.
// 두 차이(180+5=185)를 반영하면 구조적 진짜 천장은 766+185=951이다.
//
// 이 파일은 "766이 틀렸으니 200을 951로 바꿔라"를 주장하지 않는다 — 상한
// 예산 자체는 rewardEngine.js가 이미 명시한 대로 운영자 확정 대상(OPEN
// DECISION)이다. 이 파일의 유일한 책임은 "현재 상수들로 계산 가능한 진짜
// 천장이 얼마인지"를 정직하게 계산·스냅샷 고정하는 것 — 운영자가 예산을
// 정할 때 정확한 숫자를 보게 하기 위함이다.
//
// 등록: npm run verify:reward-ceiling-table (extra:true, non-gating)
// 순수 계산 + rewardEngine.js import 1개(file:// URL). 네트워크 0, DB 0,
// rewardEngine.js/api/grant-xp.js/useStudent.js 어느 것도 수정하지 않는다.

import { pathToFileURL } from 'node:url'
import path from 'node:path'

let failures = 0, asserted = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const engUrl = pathToFileURL(path.resolve('src/utils/rewardEngine.js')).href
const eng = await import(engUrl)
const {
  REWARD_STARS, REWARD_DAILY_CAP, REWARD_SOURCE_RULES,
  LEGACY_SPELLING_COMBO_BONUS, STREAK_BONUS, isValidRewardType,
} = eng

// ── maxStarsFor(t) — REWARD_STARS[t]가 0(가변 금액 placeholder)이면 그
// 타입의 실제 가변 금액 표에서 최댓값을 찾는다. 그 외에는 REWARD_STARS[t]
// 그대로(고정 금액).
function maxStarsFor(rewardType) {
  const fixed = REWARD_STARS[rewardType]
  if (typeof fixed === 'number' && fixed > 0) return fixed
  if (rewardType === 'spelling-combo') return Math.max(...Object.values(LEGACY_SPELLING_COMBO_BONUS))
  if (rewardType === 'streak-bonus') return Math.max(...Object.values(STREAK_BONUS))
  return 0
}

console.log('\n1. 계약 — REWARD_DAILY_CAP과 REWARD_SOURCE_RULES 키 집합이 정확히 일치')
{
  const capKeys = Object.keys(REWARD_DAILY_CAP).sort()
  const ruleKeys = Object.keys(REWARD_SOURCE_RULES).sort()
  check('REWARD_DAILY_CAP의 모든 키가 REWARD_SOURCE_RULES에 존재',
    capKeys.every((k) => Object.prototype.hasOwnProperty.call(REWARD_SOURCE_RULES, k)))
  check('REWARD_SOURCE_RULES의 모든 키에 상한(cap)이 정의됨(예외 0건)',
    ruleKeys.every((k) => Object.prototype.hasOwnProperty.call(REWARD_DAILY_CAP, k)))
  check(`두 키 집합이 완전히 동일 (${capKeys.length}개)`, JSON.stringify(capKeys) === JSON.stringify(ruleKeys))
  check("legacy-baseline은 REWARD_DAILY_CAP에 없음(API 지급 불가, 상한 대상 아님)",
    !Object.prototype.hasOwnProperty.call(REWARD_DAILY_CAP, 'legacy-baseline'))
  check("isValidRewardType('legacy-baseline') === false", isValidRewardType('legacy-baseline') === false)
}

console.log('\n2. 천장 테이블 — type | cap | maxStars | cap×maxStars')
// 스냅샷(2026-09-09) — rewardEngine.js 소스 상수로부터 계산해 고정한 값.
// 상한값 자체를 바꾸는 게 아니라, "지금 상수로 계산하면 얼마가 나오는가"를
// 고정해 상수가 조용히 바뀌어도(운영자 승인 없이) 이 테스트가 잡아내게
// 한다. 상한값 변경은 운영자 sign-off와 함께 이 스냅샷도 함께 갱신할 것.
const CEILING_SNAPSHOT = {
  // 날짜 기간키 5종(구조적으로 하루 1건, rewardEngine.js:529 주석) — cap 1,
  // 고정 금액 그대로.
  'word-session-complete': { cap: 1, maxStars: 1 },
  'writing-complete': { cap: 1, maxStars: 2 },
  'daily-goal-complete': { cap: 1, maxStars: 3 },
  // exam-complete — 반·날짜당 시험 실측 최대 8 + 여유(rewardEngine.js:526-528).
  'exam-complete': { cap: 10, maxStars: 2 },
  // wrong-word-recovered — 유닛 실측 최대 50단어 + 여유(:524-525).
  'wrong-word-recovered': { cap: 60, maxStars: 1 },
  // streak-bonus — REWARD_STARS는 0 placeholder(:46), 실제 최댓값은
  // STREAK_BONUS={3:2,5:3,7:5}(:82)의 최댓값 5. cap은 날짜:streak 기간키라
  // 구조적으로 하루 1건(:538).
  'streak-bonus': { cap: 1, maxStars: 5 },
  // ── 레거시 6종(2026-09-06 흡수, rewardEngine.js:539-561) ────────────────
  'pronunciation': { cap: 120, maxStars: 1 },
  'mission-clear': { cap: 40, maxStars: 3 },
  'daily-mission-bonus': { cap: 12, maxStars: 10 },
  // spelling-combo — REWARD_STARS는 0 placeholder(:60), 실제 최댓값은
  // LEGACY_SPELLING_COMBO_BONUS={3:1,5:2,10:3}(:77)의 최댓값 3.
  'spelling-combo': { cap: 60, maxStars: 3 },
  'sticker-duplicate': { cap: 15, maxStars: 20 },
  // matchgame — GAME_REWARD_DAILY_LIMIT=1 x ROUNDS=5 구조적 상한(:549-550).
  'matchgame': { cap: 5, maxStars: 4 },
}

const table = Object.keys(REWARD_DAILY_CAP).map((t) => {
  const cap = REWARD_DAILY_CAP[t]
  const maxStars = maxStarsFor(t)
  return { type: t, cap, maxStars, product: cap * maxStars }
})
console.log('  type                    | cap | maxStars | cap×maxStars')
console.log('  ------------------------|-----|----------|-------------')
for (const row of table) {
  console.log(`  ${row.type.padEnd(23)} | ${String(row.cap).padStart(3)} | ${String(row.maxStars).padStart(8)} | ${String(row.product).padStart(12)}`)
}

for (const row of table) {
  const snap = CEILING_SNAPSHOT[row.type]
  check(`[${row.type}] 스냅샷 존재`, !!snap)
  if (!snap) continue
  check(`[${row.type}] cap === 스냅샷(${snap.cap})`, row.cap === snap.cap)
  check(`[${row.type}] maxStars === 스냅샷(${snap.maxStars})`, row.maxStars === snap.maxStars)
}
check('스냅샷에 없는 타입 0건(테이블과 스냅샷 키 집합 동일)',
  table.every((r) => Object.prototype.hasOwnProperty.call(CEILING_SNAPSHOT, r.type))
  && Object.keys(CEILING_SNAPSHOT).length === table.length)

console.log('\n3. Σ 공식 대조 — REWARD_STARS(placeholder 0 포함) vs maxStarsFor(실제 최댓값)')
const sumUsingRewardStars = Object.entries(REWARD_DAILY_CAP)
  .reduce((sum, [t, cap]) => sum + cap * (REWARD_STARS[t] || 0), 0)
const sumUsingMax = table.reduce((sum, r) => sum + r.product, 0)
console.log(`  Σ cap × REWARD_STARS (기존 testRewardServerHardening.mjs 공식) = ${sumUsingRewardStars}`)
console.log(`  Σ cap × maxStarsFor  (가변 금액 실제 최댓값 반영)              = ${sumUsingMax}`)
console.log(`  과소집계분(가변 금액 2종 누락분)                                = ${sumUsingMax - sumUsingRewardStars}`)

check('testRewardServerHardening.mjs 7절과 동일한 공식으로 766 재현(회귀 감지용, 그 파일은 무수정)',
  sumUsingRewardStars === 766)
check('가변 금액 실제 최댓값 반영 시 951 (spelling-combo 180 + streak-bonus 5 반영)',
  sumUsingMax === 951)
check('가변 금액 반영 합이 placeholder 합보다 크다(과소집계 실증)', sumUsingMax > sumUsingRewardStars)
check('spelling-combo 단독 기여분 = 60 × 3 = 180 (placeholder 공식은 0으로 놓침)',
  table.find((r) => r.type === 'spelling-combo').product === 180)
check('streak-bonus 단독 기여분 = 1 × 5 = 5 (placeholder 공식은 0으로 놓침)',
  table.find((r) => r.type === 'streak-bonus').product === 5)
check('가변 금액 두 타입은 product > 0 (placeholder로 죽지 않음)',
  table.find((r) => r.type === 'spelling-combo').product > 0
  && table.find((r) => r.type === 'streak-bonus').product > 0)

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0
  ? '모든 단언 통과 — 일일 상한 천장 테이블 고정(예산 확정 아님, 운영자 결정 보류 사항 그대로 유지) ✅'
  : `${failures}개 단언 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
