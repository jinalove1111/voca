// scripts/testGrowthPoints.mjs
//
// growthPoints.js(정원 성장 v2 보너스, P2, 2026-09-03) 순수 계약 테스트.
// 네트워크 0, DB 접근 0 — growthPoints.js는 zero-import 순수 모듈이라
// 이 테스트도 순수 함수 호출만 한다.
//
// CLAUDE.md 규칙 15(FAIL-first) 실측 — growthPoints.js가 존재하지 않는
// 상태(이 파일을 처음 작성한 시점)에서 이 테스트를 실행하면 import 자체가
// 실패해 20개 단언 전부 FAIL(0/20)한다. growthPoints.js 구현 후 재실행해
// 전부 PASS로 바뀌는 것을 확인한다(구현 커밋 로그의 "FAIL-first 증거" 참고).
import {
  GROWTH_V2_EPOCH,
  BONUS_WEIGHTS,
  PER_DAY_CAPS,
  bonusPointsFromLedger,
  growthPoints,
} from '../src/utils/attachment/growthPoints.js'
import { deriveAttachmentStats } from '../src/utils/attachment/attachmentCore.js'
import { gardenPlots, computeWorldState, PLOT_STAGE_EMOJI } from '../src/utils/attachment/worldProgress.js'

let failures = 0
let asserted = 0
const failed = []
let scenario = ''
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++; failed.push(`[${scenario}] ${label}`) }
}

const AFTER = '2026-09-05T10:00:00.000Z' // epoch(2026-09-03) 이후
const BEFORE = '2026-08-20T10:00:00.000Z' // epoch 이전
const entry = (overrides = {}) => ({
  reward_type: 'daily-goal-complete',
  source_type: 'daily-goal',
  source_id: '2026-09-05:goal',
  stars_delta: 2,
  idempotency_key: `k-${Math.random()}`,
  created_at: AFTER,
  ...overrides,
})

console.log('\n=== [growth-points] 정원 성장 v2 보너스 — 순수 계약 ===')

// ── 1) 가중치 ────────────────────────────────────────────────────────────
scenario = '1) 가중치'
console.log(`\n-- ${scenario}`)
{
  check('daily-goal-complete = 2', BONUS_WEIGHTS['daily-goal-complete'] === 2)
  check('writing-complete = 1', BONUS_WEIGHTS['writing-complete'] === 1)
  check('exam-complete = 2', BONUS_WEIGHTS['exam-complete'] === 2)
  check('wrong-word-recovered = 1', BONUS_WEIGHTS['wrong-word-recovered'] === 1)
  check('unit-complete = 4', BONUS_WEIGHTS['unit-complete'] === 4)
  check('word-session-complete = 0(단어축에서 이미 셈)', BONUS_WEIGHTS['word-session-complete'] === 0)
  check('streak-bonus = 0(레거시, 원장 무관)', BONUS_WEIGHTS['streak-bonus'] === 0)
  check('word-mastered = 0', BONUS_WEIGHTS['word-mastered'] === 0)
  check('review-session-bonus = 0', BONUS_WEIGHTS['review-session-bonus'] === 0)

  check('daily-goal-complete 1건 → 보너스 2', bonusPointsFromLedger([entry()]) === 2)
  check('writing-complete 1건 → 보너스 1', bonusPointsFromLedger([entry({ reward_type: 'writing-complete', idempotency_key: 'w1' })]) === 1)
  check('exam-complete 1건 → 보너스 2', bonusPointsFromLedger([entry({ reward_type: 'exam-complete', idempotency_key: 'e1' })]) === 2)
  check('unit-complete 1건 → 보너스 4', bonusPointsFromLedger([entry({ reward_type: 'unit-complete', idempotency_key: 'u1' })]) === 4)
  check('word-session-complete 1건 → 보너스 0', bonusPointsFromLedger([entry({ reward_type: 'word-session-complete', idempotency_key: 'ws1' })]) === 0)
}

// ── 2) 알 수 없는 타입/손상 입력 ──────────────────────────────────────────
scenario = '2) 알 수 없는 타입 · 손상 입력'
console.log(`\n-- ${scenario}`)
{
  check('알 수 없는 reward_type → 0점', bonusPointsFromLedger([entry({ reward_type: 'mystery-type', idempotency_key: 'm1' })]) === 0)
  check('reward_type 없음 → 0점', bonusPointsFromLedger([{ source_id: 'x', created_at: AFTER }]) === 0)
  check('비객체 항목(문자열) 무시', bonusPointsFromLedger(['not-an-object', entry({ idempotency_key: 'm2' })]) === 2)
  check('null 항목 무시', bonusPointsFromLedger([null, entry({ idempotency_key: 'm3' })]) === 2)
  check('배열 자체가 아닌 입력(undefined) → 0점, 크래시 없음', bonusPointsFromLedger(undefined) === 0)
  check('빈 배열 → 0점', bonusPointsFromLedger([]) === 0)
}

// ── 3) epoch 필터 ─────────────────────────────────────────────────────────
scenario = '3) epoch 필터'
console.log(`\n-- ${scenario}`)
{
  check('epoch 이전 항목 → 0점', bonusPointsFromLedger([entry({ created_at: BEFORE, idempotency_key: 'b1' })]) === 0)
  check('epoch 당일(경계 포함) 항목 → 카운트됨', bonusPointsFromLedger([entry({ created_at: `${GROWTH_V2_EPOCH}T00:00:00.000Z`, idempotency_key: 'b2' })]) === 2)
  check('epoch 이후 항목 → 카운트됨', bonusPointsFromLedger([entry({ idempotency_key: 'b3' })]) === 2)
  check('created_at 없음 → 보수적으로 0점 취급', bonusPointsFromLedger([entry({ created_at: undefined, idempotency_key: 'b4' })]) === 0)
  check('epoch 전후 혼합 — 이후 항목만 합산', bonusPointsFromLedger([
    entry({ created_at: BEFORE, idempotency_key: 'mix1' }),
    entry({ idempotency_key: 'mix2' }),
  ]) === 2)
}

// ── 4) 일일 상한(wrong-word-recovered) ────────────────────────────────────
scenario = '4) 일일 상한'
console.log(`\n-- ${scenario}`)
{
  check('PER_DAY_CAPS.wrong-word-recovered === 2', PER_DAY_CAPS['wrong-word-recovered'] === 2)
  const sameDayFive = Array.from({ length: 5 }, (_, i) => entry({
    reward_type: 'wrong-word-recovered', source_id: `2026-09-05:word${i}`, idempotency_key: `wwr-${i}`,
  }))
  check('같은 날짜 5건 → 상한 2건까지만 가산(2×1=2)', bonusPointsFromLedger(sameDayFive) === 2)

  const threeDaysThreeEach = []
  for (const day of ['2026-09-05', '2026-09-06', '2026-09-07']) {
    for (let i = 0; i < 3; i++) {
      threeDaysThreeEach.push(entry({
        reward_type: 'wrong-word-recovered', source_id: `${day}:word${i}`, idempotency_key: `${day}-${i}`,
      }))
    }
  }
  check('3개 날짜 × 3건(날짜당 상한 2) → 6점(2+2+2)', bonusPointsFromLedger(threeDaysThreeEach) === 6)

  // 상한이 없는 유형(daily-goal-complete)은 여러 건이어도 전부 가산
  const manyGoals = Array.from({ length: 4 }, (_, i) => entry({ idempotency_key: `goal-${i}`, source_id: `2026-09-0${5 + i}:goal` }))
  check('상한 없는 유형은 여러 건이어도 전부 가산(4×2=8)', bonusPointsFromLedger(manyGoals) === 8)
}

// ── 5) 멱등성(idempotency) ────────────────────────────────────────────────
scenario = '5) 멱등성'
console.log(`\n-- ${scenario}`)
{
  const ledger = [entry({ idempotency_key: 'idem-1' }), entry({ reward_type: 'writing-complete', idempotency_key: 'idem-2' })]
  const once = bonusPointsFromLedger(ledger)
  const twiceSameArray = bonusPointsFromLedger(ledger)
  check('같은 배열을 두 번 계산해도 같은 결과(순수 함수)', once === twiceSameArray)

  const dup = [entry({ idempotency_key: 'dup-key' }), entry({ idempotency_key: 'dup-key' })]
  check('같은 idempotency_key가 두 번 있어도 1건으로만 계산', bonusPointsFromLedger(dup) === 2)

  const dupAcrossTypes = [
    entry({ idempotency_key: 'dup-key-2', reward_type: 'daily-goal-complete' }),
    entry({ idempotency_key: 'dup-key-2', reward_type: 'daily-goal-complete' }),
    entry({ idempotency_key: 'unique-3', reward_type: 'writing-complete' }),
  ]
  check('중복 제거 후 남은 고유 항목만 합산(2 + 1 = 3)', bonusPointsFromLedger(dupAcrossTypes) === 3)
}

// ── 6) growthPoints(단어축 + 보너스) ──────────────────────────────────────
scenario = '6) growthPoints 합성'
console.log(`\n-- ${scenario}`)
{
  check('단어축 10 + 보너스 없음 = 10', growthPoints(10, []) === 10)
  check('단어축 10 + daily-goal-complete 1건 = 12', growthPoints(10, [entry({ idempotency_key: 'gp-1' })]) === 12)
  check('단어축이 NaN이면 0으로 취급 + 보너스만', growthPoints(NaN, [entry({ idempotency_key: 'gp-2' })]) === 2)
}

// ── 7) 단조성 — 정원 칸/월드 단계가 절대 역행하지 않는다 ──────────────────
scenario = '7) 단조성(역행 없음)'
console.log(`\n-- ${scenario}`)
{
  const stageOrder = Object.keys(PLOT_STAGE_EMOJI) // ['empty','seed','sprout','flower','tree']
  const stageSum = (stats) => gardenPlots(stats).reduce((a, p) => a + stageOrder.indexOf(p.stage), 0)
  const worldUnlockedCount = (stats) => computeWorldState(stats).stages.filter((s) => s.unlocked).length

  // 5개 이상의 "before/after" 학습 진행 픽스처 — 각 after는 before보다
  // 항상 학습량/보너스가 같거나 늘어난 상태(realistic fixtures).
  const fixtures = [
    { before: { cleared: ['a', 'b'], rewardLedger: [] }, after: { cleared: ['a', 'b', 'c'], rewardLedger: [entry({ idempotency_key: 'f1' })] } },
    { before: { cleared: [], rewardLedger: [entry({ idempotency_key: 'f2' })] }, after: { cleared: ['x'], rewardLedger: [entry({ idempotency_key: 'f2' }), entry({ reward_type: 'writing-complete', idempotency_key: 'f3' })] } },
    { before: { completedWords: Array.from({ length: 5 }, (_, i) => `w${i}`), rewardLedger: [] }, after: { completedWords: Array.from({ length: 12 }, (_, i) => `w${i}`), rewardLedger: [entry({ reward_type: 'exam-complete', idempotency_key: 'f4' })] } },
    { before: { clearedWords: ['q1'], rewardLedger: [entry({ reward_type: 'wrong-word-recovered', source_id: '2026-09-05:q1', idempotency_key: 'f5' })] }, after: { clearedWords: ['q1', 'q2', 'q3'], rewardLedger: [entry({ reward_type: 'wrong-word-recovered', source_id: '2026-09-05:q1', idempotency_key: 'f5' }), entry({ reward_type: 'wrong-word-recovered', source_id: '2026-09-06:q2', idempotency_key: 'f6' })] } },
    { before: { cleared: Array.from({ length: 20 }, (_, i) => `m${i}`), rewardLedger: [] }, after: { cleared: Array.from({ length: 20 }, (_, i) => `m${i}`), rewardLedger: [entry({ reward_type: 'unit-complete', idempotency_key: 'f7' })] } },
  ]

  let allMono = true
  let idx = 0
  for (const { before, after } of fixtures) {
    idx += 1
    const bStats = deriveAttachmentStats(before)
    const aStats = deriveAttachmentStats(after)
    const bGrowth = growthPoints(bStats.gardenPoints, before.rewardLedger)
    const aGrowth = growthPoints(aStats.gardenPoints, after.rewardLedger)
    const bStatsV2 = { ...bStats, gardenPoints: bGrowth }
    const aStatsV2 = { ...aStats, gardenPoints: aGrowth }
    if (aGrowth < bGrowth) allMono = false
    if (stageSum(aStatsV2) < stageSum(bStatsV2)) allMono = false
    if (worldUnlockedCount(aStatsV2) < worldUnlockedCount(bStatsV2)) allMono = false
    check(`픽스처 ${idx}: growthPoints 역행 없음(${bGrowth} → ${aGrowth})`, aGrowth >= bGrowth)
  }
  check('5개 픽스처 전체 — 정원 칸/월드 단계 역행 없음', allMono)
}

// ── 8) flag-off 바이트 단위 동일성 ────────────────────────────────────────
scenario = '8) flag-off 동일성'
console.log(`\n-- ${scenario}`)
{
  // testGardenGrowthFlow.mjs의 기존 픽스처와 동일한 형태 — 옵션을 주지
  // 않은 deriveAttachmentStats(rec)는 gardenSet.size 그대로여야 한다
  // (attachmentGardenGrowthV2 플래그가 꺼져 있을 때의 기존 계약).
  const rec1 = { cleared: ['apple', 'banana'], completedWords: [], clearedWords: [] }
  const rec2 = { cleared: [], completedWords: Array.from({ length: 40 }, (_, i) => `w${i}`), clearedWords: [] }
  const rec3 = { cleared: ['dup'], completedWords: ['dup'], clearedWords: ['dup'] }
  for (const [label, rec] of [['rec1(2단어)', rec1], ['rec2(40단어)', rec2], ['rec3(합집합 중복)', rec3]]) {
    const gardenSetSize = new Set([...(rec.cleared || []), ...(rec.completedWords || []), ...(rec.clearedWords || [])]).size
    check(`${label}: 옵션 없는 deriveAttachmentStats.gardenPoints === gardenSet.size`, deriveAttachmentStats(rec).gardenPoints === gardenSetSize)
  }
}

// ── 요약 ─────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(64)}`)
if (failures === 0) {
  console.log(`PASS  growth-points — 정원 성장 v2 보너스 순수 계약 (${asserted}개 단언)`)
  process.exit(0)
} else {
  console.log(`FAIL  growth-points — ${asserted}개 중 ${failures}개 실패`)
  for (const f of failed) console.log(`  - ${f}`)
  process.exit(1)
}
