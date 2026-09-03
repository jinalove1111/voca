// P9(2026-09-03, docs/REWARD_LOOP_AUDIT_2026-09-03.md §12) — 관리자
// StudentDirectory 보상 요약 1줄 표시의 순수 로직 테스트. 패턴은
// scripts/testPureUtils.mjs와 동일(check(label, cond) + exit code) —
// React/네트워크/Supabase 전혀 없는 순수 모듈이라 esbuild 없이 Node에서
// 바로 import 가능. 실행 순서: (1) FAIL-first — 아직 구현이 없거나
// 틀렸을 때 정말 FAIL이 나는지 먼저 확인(CLAUDE.md 규칙 15 "테스트 자체의
// 유효성 검증"), (2) 구현 완료 후 전부 PASS.
import { summarizeStudentRewards, formatAdminRewardLine } from '../src/utils/adminRewardSummary.js'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

let failures = 0
let checks = 0
function check(label, cond) {
  checks++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// ── 1. summarizeStudentRewards — null/undefined 행: 0/null이지 throw 아님 ──
console.log('\n1. summarizeStudentRewards — null/undefined/빈 행')
{
  const fromNull = summarizeStudentRewards(null)
  check('null 행 → totalStars 0', fromNull.totalStars === 0)
  check('null 행 → streak 0', fromNull.streak === 0)
  check('null 행 → gardenPoints 0', fromNull.gardenPoints === 0)
  check('null 행 → hatCount 0', fromNull.hatCount === 0)
  check('null 행 → lastStudiedDate null', fromNull.lastStudiedDate === null)
  check('null 행 → lastReward null', fromNull.lastReward === null)
  check('null 행 → xp null(배치 조회 안 됐으면 표시 안 함)', fromNull.xp === null)

  const fromUndefined = summarizeStudentRewards(undefined)
  check('undefined 행도 throw 없이 동일하게 폴백', fromUndefined.totalStars === 0 && fromUndefined.gardenPoints === 0)

  const fromEmpty = summarizeStudentRewards({})
  check('빈 객체 행도 안전 폴백', fromEmpty.totalStars === 0 && fromEmpty.lastReward === null)
}

// ── 2. 레거시 행(rewardLedger/hatInventory 없는 v1.3~v1.4 시절 레코드) ──
console.log('\n2. 레거시 행 — progress_data는 있지만 rewardLedger/hatInventory가 없음')
{
  const legacyRow = {
    total_stars: 42,
    streak: 3, // streak_count 컬럼 자체가 없던 시절(레거시 폴백 확인)
    cleared_count: 10,
    last_studied_date: '2026-01-05',
    progress_data: { cleared: ['a', 'b'], completedWords: ['a', 'c'] }, // clearedWords/rewardLedger/hatInventory 없음
  }
  const s = summarizeStudentRewards(legacyRow)
  check('레거시 행도 throw 없이 처리됨', typeof s === 'object')
  check('streak_count 없으면 streak 컬럼으로 폴백', s.streak === 3)
  check('레거시 행 gardenPoints는 cleared/completedWords만으로 계산(clearedWords 없음 취급)', s.gardenPoints === 3) // {a,b} ∪ {a,c} = {a,b,c}
  check('레거시 행 hatCount 0(hatInventory 없음)', s.hatCount === 0)
  check('레거시 행 lastReward null(rewardLedger 없음)', s.lastReward === null)
  check('레거시 행 totalStars는 그대로 반영', s.totalStars === 42)
}

// ── 3. streak_count 우선 폴백 ──
console.log('\n3. streak_count 컬럼 우선순위')
{
  const bothPresent = summarizeStudentRewards({ streak: 1, streak_count: 9 })
  check('streak_count가 있으면 streak_count를 쓴다(더 최신 denormalized 값)', bothPresent.streak === 9)
}

// ── 4. gardenPoints — distinct union 수학 ──
console.log('\n4. gardenPoints — cleared ∪ completedWords ∪ clearedWords distinct union')
{
  const row = {
    progress_data: {
      cleared: ['w1', 'w2', 'w3'],
      completedWords: ['w2', 'w3', 'w4'],
      clearedWords: ['w4', 'w5'],
    },
  }
  const s = summarizeStudentRewards(row)
  // union = {w1,w2,w3,w4,w5} = 5
  check('3개 배열 합집합의 distinct 크기(중복 제거)', s.gardenPoints === 5)

  const dupRow = { progress_data: { cleared: ['x', 'x', 'x'], completedWords: ['x'], clearedWords: ['x'] } }
  check('완전 중복이면 1로 수렴', summarizeStudentRewards(dupRow).gardenPoints === 1)

  const emptyRow = { progress_data: { cleared: [], completedWords: [], clearedWords: [] } }
  check('전부 빈 배열이면 0', summarizeStudentRewards(emptyRow).gardenPoints === 0)
}

// ── 5. lastReward — created_at 기준 최신 항목 선택 ──
console.log('\n5. lastReward — rewardLedger에서 created_at 최신 항목')
{
  const row = {
    progress_data: {
      rewardLedger: [
        { reward_type: 'word-session-complete', stars_delta: 2, created_at: '2026-01-01T00:00:00.000Z' },
        { reward_type: 'writing-complete', stars_delta: 5, created_at: '2026-03-10T09:00:00.000Z' },
        { reward_type: 'exam-complete', stars_delta: 3, created_at: '2026-02-01T00:00:00.000Z' },
      ],
    },
  }
  const s = summarizeStudentRewards(row)
  check('가장 최근(created_at 최댓값) 항목을 고른다', s.lastReward?.type === 'writing-complete')
  check('stars_delta도 함께 반환', s.lastReward?.stars === 5)
  check('date는 YYYY-MM-DD로 잘림', s.lastReward?.date === '2026-03-10')

  const singleRow = { progress_data: { rewardLedger: [{ reward_type: 'daily-goal-complete', stars_delta: 1, created_at: '2026-05-01T00:00:00.000Z' }] } }
  check('항목이 1개뿐이어도 정상 반환', summarizeStudentRewards(singleRow).lastReward?.type === 'daily-goal-complete')

  const emptyLedgerRow = { progress_data: { rewardLedger: [] } }
  check('빈 배열이면 null', summarizeStudentRewards(emptyLedgerRow).lastReward === null)
}

// ── 6. hatCount ──
console.log('\n6. hatCount — hatInventory 길이')
{
  const row = { progress_data: { hatInventory: [{ hatId: 'h1' }, { hatId: 'h2' }, { hatId: 'h3' }] } }
  check('hatInventory 배열 길이 그대로', summarizeStudentRewards(row).hatCount === 3)
}

// ── 7. xp — 호출부가 xpTotal을 얹어 넘긴 경우만 표시 ──
console.log('\n7. xp — progressRow.xpTotal 있을 때만 숫자, 없으면 null')
{
  check('xpTotal 없으면 xp null', summarizeStudentRewards({ total_stars: 10 }).xp === null)
  check('xpTotal 있으면 그대로 숫자', summarizeStudentRewards({ xpTotal: 77 }).xp === 77)
}

// ── 8. formatAdminRewardLine — 각 세그먼트가 문자열에 포함됨 ──
console.log('\n8. formatAdminRewardLine — 한 줄 문자열 세그먼트 포함 확인')
{
  const summary = summarizeStudentRewards({
    total_stars: 15,
    streak_count: 4,
    last_studied_date: '2026-09-01',
    progress_data: {
      cleared: ['a', 'b'],
      hatInventory: [{ hatId: 'h1' }],
      rewardLedger: [{ reward_type: 'mission-clear', stars_delta: 2, created_at: '2026-08-30T00:00:00.000Z' }],
    },
    xpTotal: 30,
  })
  const line = formatAdminRewardLine(summary)
  check('별 세그먼트 포함', line.includes('⭐ 15'))
  check('스트릭 세그먼트 포함', line.includes('🔥 4일'))
  check('정원 세그먼트 포함', line.includes('🌱 정원 2'))
  check('모자 세그먼트 포함', line.includes('🎩 1'))
  check('최근 학습 세그먼트 포함', line.includes('최근 학습 2026-09-01'))
  check('최근 보상 세그먼트 포함(타입+별)', line.includes('mission-clear') && line.includes('+2'))
  check('XP 세그먼트 포함(선택값 있을 때)', line.includes('XP 30'))

  const noXpLine = formatAdminRewardLine(summarizeStudentRewards({}))
  check('XP 값 없으면 XP 세그먼트 자체가 없음', !noXpLine.includes('XP '))
  check('보상 없으면 "최근 보상 없음" 표시', noXpLine.includes('최근 보상 없음'))

  const brokenSummary = formatAdminRewardLine(null)
  check('formatAdminRewardLine(null)도 throw 없이 안전 폴백 문자열', typeof brokenSummary === 'string' && brokenSummary.includes('⭐ 0'))
}

// ── 9. 정적 검사 — StudentDirectory.jsx가 formatAdminRewardLine을
//      import & 실제로 사용하는지, PIN 컬럼 문자열이 HEAD 대비 늘지
//      않았는지(CLAUDE.md 규칙 11) ──
console.log('\n9. 정적 검사 — StudentDirectory.jsx import/사용 + PIN 컬럼 노출 카운트')
{
  const filePath = 'src/components/admin/StudentDirectory.jsx'
  const src = readFileSync(new URL(`../${filePath}`, import.meta.url), 'utf8')

  check(
    'StudentDirectory.jsx가 adminRewardSummary에서 formatAdminRewardLine을 import',
    /import\s*\{[^}]*formatAdminRewardLine[^}]*\}\s*from\s*['"].*adminRewardSummary['"]/.test(src)
  )
  check(
    'StudentDirectory.jsx 본문이 formatAdminRewardLine(...)을 실제로 호출',
    /formatAdminRewardLine\s*\(/.test(src)
  )

  const pinPattern = /pin_hash|pin_fail_count|pin_locked_until/g
  const currentCount = (src.match(pinPattern) || []).length

  let headSrc = ''
  try {
    headSrc = execSync(`git show HEAD:${filePath}`, { encoding: 'utf8', cwd: new URL('..', import.meta.url) })
  } catch {
    headSrc = '' // git 명령 실패 시(예: 얕은 clone) 이 서브체크만 스킵
  }
  if (headSrc) {
    const headCount = (headSrc.match(pinPattern) || []).length
    check(
      `PIN 컬럼 문자열(pin_hash/pin_fail_count/pin_locked_until) 언급 수가 HEAD(${headCount}) 대비 늘지 않음(현재 ${currentCount})`,
      currentCount <= headCount
    )
  } else {
    check('git show HEAD 실패 — PIN 컬럼 카운트 비교 스킵(git 접근 불가 환경)', true)
  }
}

console.log(`\n${checks} checks, ${failures} failures`)
if (failures > 0) process.exit(1)
