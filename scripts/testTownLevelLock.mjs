// scripts/testTownLevelLock.mjs
//
// Paul Town V1 순수 도메인(townLevel.js, 2026-09-11) 회귀 스위트.
// 네트워크 0, Supabase 0. rewardEngine.js의 LEVELS(별 5단계)와 앞 5단계
// 값이 정확히 같아야 한다는 계약을 여기서 직접 assert한다(두 파일은
// 서로 import하지 않는 독립 복제 — 드리프트는 이 테스트가 잡는다).
//
// 실행: node scripts/testTownLevelLock.mjs
import { TOWN_LEVELS, TOWN_LEVEL_UNLOCKS, townLevelForStars, starsToNextTownLevel, isUnlocked } from '../src/utils/town/townLevel.js'
import { LEVELS as REWARD_LEVELS } from '../src/utils/rewardEngine.js'

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const section = (name) => console.log(`\n-- ${name} --`)

// ══════════════════════════════════════════════════════════════════════
section('1. rewardEngine.LEVELS와 앞 5단계 완전 동일(parity)')
// ══════════════════════════════════════════════════════════════════════
{
  check('TOWN_LEVELS 앞 5개 length === rewardEngine LEVELS length(5)', REWARD_LEVELS.length === 5)
  for (let i = 0; i < 5; i++) {
    check(`TOWN_LEVELS[${i}] === rewardEngine.LEVELS[${i}] (level/min 둘 다)`,
      TOWN_LEVELS[i].level === REWARD_LEVELS[i].level && TOWN_LEVELS[i].min === REWARD_LEVELS[i].min)
  }
}

// ══════════════════════════════════════════════════════════════════════
section('2. TOWN_LEVELS 구조')
// ══════════════════════════════════════════════════════════════════════
{
  check('TOWN_LEVELS 10단계', TOWN_LEVELS.length === 10)
  check('레벨 번호 1..10 순차', TOWN_LEVELS.every((e, i) => e.level === i + 1))
  check('min 값 엄격히 증가', TOWN_LEVELS.every((e, i) => i === 0 || e.min > TOWN_LEVELS[i - 1].min))
  check('레벨1 min === 0', TOWN_LEVELS[0].min === 0)
  check('레벨10 min === 1500', TOWN_LEVELS[9].min === 1500)
}

// ══════════════════════════════════════════════════════════════════════
section('3. townLevelForStars — 경계값')
// ══════════════════════════════════════════════════════════════════════
{
  const cases = [
    [0, 1], [19, 1], [20, 2], [49, 2], [50, 3], [99, 3], [100, 4], [199, 4],
    [200, 5], [349, 5], [350, 6], [549, 6], [550, 7], [799, 7], [800, 8],
    [1099, 8], [1100, 9], [1499, 9], [1500, 10], [999999, 10],
  ]
  for (const [stars, expected] of cases) {
    check(`townLevelForStars(${stars}) === ${expected}`, townLevelForStars(stars) === expected)
  }
}

// ══════════════════════════════════════════════════════════════════════
section('4. townLevelForStars — 방어(음수/비유한값)')
// ══════════════════════════════════════════════════════════════════════
{
  check('음수 → 레벨1', townLevelForStars(-50) === 1)
  check('NaN → 레벨1', townLevelForStars(NaN) === 1)
  check('undefined → 레벨1', townLevelForStars(undefined) === 1)
  check('null → 레벨1', townLevelForStars(null) === 1)
  check('문자열 쓰레기 → 레벨1', townLevelForStars('garbage') === 1)
  check('Infinity → 레벨1(비유한값)', townLevelForStars(Infinity) === 1)
}

// ══════════════════════════════════════════════════════════════════════
section('5. starsToNextTownLevel')
// ══════════════════════════════════════════════════════════════════════
{
  check('레벨1(0별) → nextLevel 2, remaining 20', (() => {
    const r = starsToNextTownLevel(0)
    return r.nextLevel === 2 && r.remaining === 20
  })())
  check('19별 → nextLevel 2, remaining 1', (() => {
    const r = starsToNextTownLevel(19)
    return r.nextLevel === 2 && r.remaining === 1
  })())
  check('정확히 20별(레벨2 시작) → nextLevel 3, remaining 30', (() => {
    const r = starsToNextTownLevel(20)
    return r.nextLevel === 3 && r.remaining === 30
  })())
  check('1499별(레벨9) → nextLevel 10, remaining 1', (() => {
    const r = starsToNextTownLevel(1499)
    return r.nextLevel === 10 && r.remaining === 1
  })())
  check('정확히 1500별(최고 레벨) → nextLevel null, remaining 0', (() => {
    const r = starsToNextTownLevel(1500)
    return r.nextLevel === null && r.remaining === 0
  })())
  check('최고 레벨 초과(9999별) → nextLevel null, remaining 0', (() => {
    const r = starsToNextTownLevel(9999)
    return r.nextLevel === null && r.remaining === 0
  })())
  check('음수/비유한값 입력 → 크래시 없이 레벨1 기준 계산', (() => {
    const r = starsToNextTownLevel(NaN)
    return r.nextLevel === 2 && r.remaining === 20
  })())
}

// ══════════════════════════════════════════════════════════════════════
section('6. isUnlocked')
// ══════════════════════════════════════════════════════════════════════
{
  check('minLevel 1, 별 0 → 해제됨', isUnlocked(1, 0) === true)
  check('minLevel 3, 별 49(레벨2) → 잠김', isUnlocked(3, 49) === false)
  check('minLevel 3, 별 50(레벨3) → 해제됨', isUnlocked(3, 50) === true)
  check('minLevel 8, 별 799(레벨7) → 잠김', isUnlocked(8, 799) === false)
  check('minLevel 8, 별 800(레벨8) → 해제됨', isUnlocked(8, 800) === true)
  check('minLevel 없음/이상값 → 1로 취급', isUnlocked(undefined, 0) === true)
  check('minLevel이 현재 최고 레벨(10)보다 큼 → 항상 잠김', isUnlocked(11, 999999) === false)
}

// ══════════════════════════════════════════════════════════════════════
section('7. TOWN_LEVEL_UNLOCKS')
// ══════════════════════════════════════════════════════════════════════
{
  check('레벨 1/3/5/8 문구 존재', [1, 3, 5, 8].every((lv) => typeof TOWN_LEVEL_UNLOCKS[lv] === 'string' && TOWN_LEVEL_UNLOCKS[lv].length > 0))
  check('레벨 2/4/6/7/9/10에는 문구 없음(명시된 4단계만)', [2, 4, 6, 7, 9, 10].every((lv) => TOWN_LEVEL_UNLOCKS[lv] === undefined))
}

// ══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
