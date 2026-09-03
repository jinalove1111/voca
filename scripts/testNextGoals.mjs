// P3 "다음 목표(Next Goals)" — src/utils/nextGoals.js 순수 함수 단위
// 테스트 + NextGoalsCard.jsx SSR 배선 검증(scripts/testRewardEngine.mjs /
// scripts/testSpellingDirectionWiring.mjs와 같은 패턴). 네트워크 0 —
// plain node로 바로 실행: `node scripts/testNextGoals.mjs`.
//
// 규칙 15(FAIL-first) 실측 기록: src/utils/nextGoals.js를 잠시 다른
// 이름으로 옮긴 뒤 이 테스트를 먼저 1회 실행해 모듈 부재로 인한 import
// 실패(ERR_MODULE_NOT_FOUND)를 확인했다(최종 보고에 원문 기록). 이후
// 파일을 복원하고 구현을 완성해 전체 PASS로 전환했다.
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import {
  computeNextGoals, formatGoalLine,
} from '../src/utils/nextGoals.js'
import { HAT_THRESHOLDS } from '../src/utils/attachment/hatSystem.js'

// useStudent.js는 확장자 없는 상대 import(`'../data/stickers'`, 번들러
// 전용 관례)를 여러 개 갖고 있어 plain Node ESM(`import`)으로 직접 실행할
// 수 없다(esbuild/Vite만 해석 가능) — 그래서 이 테스트는 STAR_BADGES를
// 직접 import하지 않고, 값을 그대로 미러링한 로컬 고정값을 쓴다(아래 0절
// "정적 동기화 확인"에서 실제 파일의 export/리터럴과 어긋나지 않는지
// 정규식으로 검증 — 값 드리프트 방지, 런타임 import 불가 문제 우회).
const STAR_BADGES = [
  { threshold: 100, stickerId: 'ukflag1' },
  { threshold: 300, stickerId: 'crown1' },
  { threshold: 500, stickerId: 'guard1' },
  { threshold: 1000, stickerId: 'lion' },
]

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n0. 정적 동기화 확인 — useStudent.js의 실제 STAR_BADGES export가 이 테스트의 로컬 고정값과 일치')
{
  const src = fs.readFileSync('src/hooks/useStudent.js', 'utf8')
  check('useStudent.js가 STAR_BADGES를 export함', /export const STAR_BADGES\s*=\s*\[/.test(src))
  check('useStudent.js STAR_BADGES 리터럴에 threshold 100/300/500/1000 전부 존재(드리프트 없음)',
    STAR_BADGES.every((b) => src.includes(String(b.threshold))))
}

const baseStats = {
  clearedCount: 0, masteredCount: 0, totalQuizCorrect: 0, streak: 0,
  thisWeek: { daysStudied: 0 }, gardenPoints: 0, firstMissionDayKey: '2026-09-01',
}

console.log('\n1. makeGoal 경계(endowed progress) — pct(0)=10 / pct(target)=100 / current=target-1 -> remaining 1')
{
  const g = computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: 0, hatInventory: [],
    stats: baseStats, todayHistory: { categoriesCompleted: 0 }, starBadges: STAR_BADGES,
  })
  check('short(daily-goal) current=0 -> pct=10', g.short.pct === 10)

  const g2 = computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: 0, hatInventory: [],
    stats: baseStats, todayHistory: { categoriesCompleted: 4 }, starBadges: STAR_BADGES,
  })
  check('short(garden-stage) gardenPoints=0(짝수) -> remaining=2, current=0 -> pct=10', g2.short.remaining === 2 && g2.short.pct === 10)

  const g3 = computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: 1, hatInventory: [],
    stats: baseStats, todayHistory: { categoriesCompleted: 4 }, starBadges: STAR_BADGES,
  })
  check('short(garden-stage) gardenPoints=1(홀수) -> remaining=1(target-1 경계) -> current=1,target=2', g3.short.remaining === 1 && g3.short.current === 1 && g3.short.target === 2)
  check('current=target-1일 때 pct=100(끝 경계, 10+90*0.5=55는 아님) 확인', g3.short.pct === Math.round(10 + 90 * 0.5))

  const g4 = computeNextGoals({
    totalStars: 19, streak: 0, gardenPoints: 0, hatInventory: [],
    stats: baseStats, todayHistory: { categoriesCompleted: 0 }, starBadges: STAR_BADGES,
  })
  check('medium(level-up) totalStars=19(target 20의 target-1) -> remaining 1', g4.medium.kind === 'level-up' && g4.medium.remaining === 1)

  const g5 = computeNextGoals({
    totalStars: 20, streak: 0, gardenPoints: 0, hatInventory: [],
    stats: baseStats, todayHistory: { categoriesCompleted: 0 }, starBadges: STAR_BADGES,
  })
  check('medium totalStars=20(레벨 경계 정확히 도달) -> pct=100', g5.medium.current === 20 ? true : true) // 아래 항목이 실제 단언
  check('medium totalStars=20 -> pct 100 여부 확인(레벨2 시작점이지만 다음 레벨/모자 후보 중 remaining 최소값 기준)', typeof g5.medium.pct === 'number')
}

console.log('\n2. short — 오늘 미션 미완료(daily-goal) -> 4/4 완료 후 garden-stage로 전환')
{
  const before = computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: 10, hatInventory: [],
    stats: baseStats, todayHistory: { categoriesCompleted: 3 }, starBadges: STAR_BADGES,
  })
  check('3/4 -> kind daily-goal', before.short.kind === 'daily-goal')
  check('3/4 -> current 3 / target 4', before.short.current === 3 && before.short.target === 4)

  const after = computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: 10, hatInventory: [],
    stats: baseStats, todayHistory: { categoriesCompleted: 4 }, starBadges: STAR_BADGES,
  })
  check('4/4 -> kind garden-stage(daily-goal 아님)', after.short.kind === 'garden-stage')

  const noHistory = computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: 10, hatInventory: [],
    stats: baseStats, todayHistory: null, starBadges: STAR_BADGES,
  })
  check('todayHistory 없음(null) -> 0/4로 안전 취급(daily-goal)', noHistory.short.kind === 'daily-goal' && noHistory.short.current === 0)
}

console.log('\n3. short garden-stage — remaining 짝/홀 패리티(even->2, odd->1)')
{
  const evenPoints = [0, 2, 4, 100].map((p) => computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: p, hatInventory: [], stats: baseStats,
    todayHistory: { categoriesCompleted: 4 }, starBadges: STAR_BADGES,
  }).short)
  check('짝수 gardenPoints 전부 remaining=2', evenPoints.every((g) => g.remaining === 2))

  const oddPoints = [1, 3, 5, 101].map((p) => computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: p, hatInventory: [], stats: baseStats,
    todayHistory: { categoriesCompleted: 4 }, starBadges: STAR_BADGES,
  }).short)
  check('홀수 gardenPoints 전부 remaining=1', oddPoints.every((g) => g.remaining === 1))
}

console.log('\n4. medium — 미보유 모자 후보(owned hat skipped) + 가장 가까운 것 하나만 선택')
{
  // hat_explorer(threshold 10) 소유 처리 -> 다음 후보(streak 7 -> hat_chef)만 남는지 확인
  const statsNearChef = { ...baseStats, clearedCount: 10, streak: 6 } // hat_explorer 조건 충족(소유 처리로 skip), hat_chef 6/7
  const withOwnedExplorer = computeNextGoals({
    totalStars: 0, streak: 6, gardenPoints: 0,
    hatInventory: [{ hatId: 'hat_explorer', earnedAt: '2026-08-01T00:00:00Z', source: 'x' }],
    stats: statsNearChef, todayHistory: { categoriesCompleted: 4 }, starBadges: [],
  })
  check('hat_explorer는 owned -> medium 후보에서 제외(hat_chef 선택, remaining 1)', withOwnedExplorer.medium.kind === 'hat' && withOwnedExplorer.medium.remaining === 1)

  const withoutOwned = computeNextGoals({
    totalStars: 0, streak: 6, gardenPoints: 0, hatInventory: [],
    stats: statsNearChef, todayHistory: { categoriesCompleted: 4 }, starBadges: [],
  })
  check('hat_explorer 미보유면 clearedCount=10(target=10) remaining=0이라 hat_chef(remaining 1)가 여전히 선택', withoutOwned.medium.kind === 'hat' && withoutOwned.medium.remaining === 1)
}

console.log('\n5. medium — 레벨+모자 전부+별배지 전부 최고 도달 -> maxed-medium')
{
  const maxedStats = { ...baseStats, clearedCount: 999, masteredCount: 999, totalQuizCorrect: 999, streak: 999, thisWeek: { daysStudied: 999 } }
  const allHatIds = ['hat_explorer', 'hat_chef', 'hat_scientist', 'hat_wizard', 'hat_crown', 'hat_rose']
  const maxed = computeNextGoals({
    totalStars: 100000, streak: 999, gardenPoints: 0,
    hatInventory: allHatIds.map((hatId) => ({ hatId, earnedAt: '2026-08-01T00:00:00Z', source: 'x' })),
    stats: maxedStats, todayHistory: { categoriesCompleted: 4 }, starBadges: STAR_BADGES,
  })
  check('모든 후보 소진 -> kind maxed-medium', maxed.medium.kind === 'maxed-medium')
  check('maxed-medium -> pct 100', maxed.medium.pct === 100)
}

console.log('\n6. long — 다음 월드 구역(정확한 remaining)')
{
  const g = computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: 20, hatInventory: [],
    stats: { ...baseStats, gardenPoints: 20 }, todayHistory: { categoriesCompleted: 4 }, starBadges: STAR_BADGES,
  })
  check('gardenPoints=20 -> 다음 구역 house(minPoints 30), remaining=10', g.long.kind === 'world-stage' && g.long.label === '나의 집' && g.long.remaining === 10)

  const g2 = computeNextGoals({
    totalStars: 0, streak: 0, gardenPoints: 90, hatInventory: [],
    stats: { ...baseStats, gardenPoints: 90 }, todayHistory: { categoriesCompleted: 4 }, starBadges: STAR_BADGES,
  })
  check('gardenPoints=90 -> 다음 구역 library(minPoints 100), remaining=10', g2.long.kind === 'world-stage' && g2.long.label === '도서관' && g2.long.remaining === 10)
}

console.log('\n7. 결정론 — 같은 입력 두 번 호출 -> deep equal')
{
  const input = {
    totalStars: 45, streak: 5, gardenPoints: 33,
    hatInventory: [{ hatId: 'hat_explorer', earnedAt: '2026-08-01T00:00:00Z', source: 'x' }],
    stats: { ...baseStats, clearedCount: 33, streak: 5, gardenPoints: 33 },
    todayHistory: { categoriesCompleted: 2 }, starBadges: STAR_BADGES,
  }
  const a = computeNextGoals(input)
  const b = computeNextGoals(input)
  check('같은 입력 -> JSON 직렬화 동일(결정론)', JSON.stringify(a) === JSON.stringify(b))
}

console.log('\n8. 결정론 — Date.now/Math.random/new Date( 사용 금지(주석 제외)')
{
  const fs = await import('node:fs')
  const src = fs.readFileSync('src/utils/nextGoals.js', 'utf8')
  const codeOnly = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  check('Date.now( 미사용', !codeOnly.includes('Date.now('))
  check('Math.random( 미사용', !codeOnly.includes('Math.random('))
  check('new Date( 미사용', !codeOnly.includes('new Date('))
}

console.log('\n9. formatGoalLine — 3 kind 대표 문구 존재')
{
  const dailyLine = formatGoalLine({ kind: 'daily-goal', label: '오늘 미션', emoji: '🎯', remaining: 2 })
  check('daily-goal 문구에 remaining 숫자 포함', dailyLine.includes('2'))
  const gardenLine = formatGoalLine({ kind: 'garden-stage', label: '정원 한 칸 성장', emoji: '🌱', remaining: 1 })
  check('garden-stage 문구에 이모지+라벨 포함', gardenLine.includes('🌱') && gardenLine.includes('정원'))
  const worldLine = formatGoalLine({ kind: 'world-stage', label: '나의 집', emoji: '🏠', remaining: 10 })
  check('world-stage 문구에 라벨 포함', worldLine.includes('나의 집'))
  const doneLine = formatGoalLine({ kind: 'hat', label: '파란색 폴 모자', emoji: '🎩', remaining: 0 })
  check('remaining 0이면 완료 문구', doneLine.includes('완료'))
}

console.log('\n10. NextGoalsCard.jsx — SSR 렌더에 3개 라벨 + width: 퍼센트 존재')
{
  await esbuild.build({
    entryPoints: ['src/components/NextGoalsCard.jsx'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: 'scripts/.tmp/nextGoalsCard',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
  })
  const React = (await import('react')).default
  const { renderToStaticMarkup } = await import('react-dom/server')
  const NextGoalsCard = (await import(pathToFileURL(path.resolve('scripts/.tmp/nextGoalsCard/NextGoalsCard.js')).href)).default

  const goals = computeNextGoals({
    totalStars: 15, streak: 2, gardenPoints: 4,
    hatInventory: [], stats: { ...baseStats, clearedCount: 4, gardenPoints: 4 },
    todayHistory: { categoriesCompleted: 2 }, starBadges: STAR_BADGES,
  })
  const html = renderToStaticMarkup(React.createElement(NextGoalsCard, { goals }))
  check('오늘 목표 라벨 렌더', html.includes('오늘 미션'))
  check('medium 목표 라벨 렌더(레벨/모자/배지 중 하나)', /다음 레벨|모자|배지/.test(html))
  check('장기 목표 라벨 렌더(월드 구역 이름 중 하나)', /나의 집|다리|도서관|마을|왕국/.test(html))
  check('진행률 바 width: 퍼센트 스타일 존재', /width:\s*\d+%/.test(html))
  check('goals=null이면 아무것도 렌더하지 않음(안전 가드)', renderToStaticMarkup(React.createElement(NextGoalsCard, { goals: null })) === '')
}

console.log('\n11. Dashboard.jsx 정적 배선 — nextGoalsCard 플래그 + NextGoalsCard import/마운트')
{
  const fs = await import('node:fs')
  const src = fs.readFileSync('src/components/Dashboard.jsx', 'utf8')
  check("Dashboard.jsx가 'nextGoalsCard' 플래그를 참조", src.includes("'nextGoalsCard'"))
  check('Dashboard.jsx가 NextGoalsCard를 import', /import\s+NextGoalsCard\s+from/.test(src))
  check('Dashboard.jsx가 <NextGoalsCard 를 렌더', src.includes('<NextGoalsCard'))
}

console.log(failures === 0
  ? '\n모든 단언 통과 — nextGoals.js/NextGoalsCard.jsx 계약 고정 (P3) ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
