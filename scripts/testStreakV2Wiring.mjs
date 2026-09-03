// scripts/testStreakV2Wiring.mjs — Streak V2 배선(P6, 2026-09-03,
// docs/REWARD_LOOP_AUDIT_2026-09-03.md §14) FAIL-first 계약 테스트.
//
// 4개 파트:
//   1) src/utils/gamification/streakAdapter.js 순수 모듈(직접 import) —
//      historyToQualifiedDates/computeStreakV2 계약(연속/공백+freeze/
//      리셋+best 보존/퀴즈 단독 인정일).
//   2) 레거시 calcStreak(useStudent.js) 시맨틱 무변경 — 소스 문자열 검사
//      (이 세션은 useStudent.js를 절대 수정하지 않는다, 파일 소유권 규칙).
//   3) Dashboard.jsx 정적 배선 검사 — streakV2 플래그/computeStreakV2 참조.
//   4) src/components/StreakChip.jsx — esbuild 번들 + react-dom/server SSR
//      문자열 단언(flag-off/v2=null vs flag-on/v2 props 비교), testSessionRewardSummary.mjs
//      템플릿과 동일 패턴.
//
// FAIL-first 실측(2026-09-03, `git stash push -u -- Dashboard.jsx
// streakAdapter.js StreakChip.jsx`로 구현 전 상태를 재현한 뒤 실행):
// 9 FAIL / 8 PASS(streakAdapter.js/StreakChip.jsx 부재로 인한 import·정적
// 배선 실패 전부, 레거시 calcStreak 무변경 계열 4건만 이미 PASS) — 구현
// 복원(`git stash pop`) 후 전체 재실행 결과는 handoff/커밋 메시지에 기록.
//
// 실행: node scripts/testStreakV2Wiring.mjs
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'

let failures = 0
const check = (label, cond) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// ── 1) streakAdapter.js — 순수 모듈 계약 ────────────────────────────────
console.log('\n1. src/utils/gamification/streakAdapter.js')
let adapterMod = null
try {
  adapterMod = await import(pathToFileURL(path.resolve('src/utils/gamification/streakAdapter.js')).href)
} catch (e) {
  console.log(`  (import 실패: ${e.message})`)
}
check('streakAdapter.js import 가능', !!adapterMod)
const { historyToQualifiedDates, computeStreakV2, toLocalDateStr, localTodayStr, MILESTONES } = adapterMod || {}
check('historyToQualifiedDates export(function)', typeof historyToQualifiedDates === 'function')
check('computeStreakV2 export(function)', typeof computeStreakV2 === 'function')
check('MILESTONES 재수출(streakModel과 동일 배열)', Array.isArray(MILESTONES) && MILESTONES[0] === 3)

// zero-import(streakModel만) 계약 — 순수 모듈 관례, attachmentCore를
// import하지 않는다는 요구사항의 소스 레벨 증거.
{
  let src = ''
  try { src = fs.readFileSync(path.resolve('src/utils/gamification/streakAdapter.js'), 'utf8') } catch { /* FAIL-first: 파일 부재 */ }
  const importLines = [...src.matchAll(/^import .+$/gm)].map((m) => m[0])
  check('streakAdapter.js는 streakModel.js만 import(attachmentCore 미의존)', importLines.length === 1 && /from '\.\/streakModel\.js'/.test(importLines[0]))
}

if (historyToQualifiedDates && computeStreakV2 && toLocalDateStr) {
  // 3일 연속 인정 → current 3
  {
    const history = {
      '2026-08-05': { categoriesCompleted: 4, quizCorrect: 0 },
      '2026-08-06': { categoriesCompleted: 2, quizCorrect: 0 },
      '2026-08-07': { categoriesCompleted: 1, quizCorrect: 0 },
    }
    const r = computeStreakV2(history, '2026-08-07')
    check('3일 연속 인정일 → current 3', r.current === 3)
    check('연속 중엔 protectedThisWeek false', r.protectedThisWeek === false)
  }

  // 같은 주 안 하루 공백 → freeze로 이어짐 + protectedThisWeek true
  {
    const history = {
      '2026-08-03': { categoriesCompleted: 1, quizCorrect: 0 }, // 월
      '2026-08-04': { categoriesCompleted: 1, quizCorrect: 0 }, // 화
      // 08-05(수) 공백
      '2026-08-06': { categoriesCompleted: 1, quizCorrect: 0 }, // 목
      '2026-08-07': { categoriesCompleted: 1, quizCorrect: 0 }, // 금
    }
    const r = computeStreakV2(history, '2026-08-07')
    check('같은 주 하루 공백은 freeze로 이어짐(끊기지 않음)', r.current === 4)
    check('이번 주 freeze 발동 → protectedThisWeek true', r.protectedThisWeek === true)
  }

  // 두 번째 공백(같은 주 2회) → 끊김, 단 best는 보존
  {
    const history = {
      '2026-07-27': { categoriesCompleted: 1, quizCorrect: 0 }, // 월(지난주)
      '2026-07-28': { categoriesCompleted: 1, quizCorrect: 0 },
      '2026-07-29': { categoriesCompleted: 1, quizCorrect: 0 },
      '2026-07-30': { categoriesCompleted: 1, quizCorrect: 0 },
      '2026-07-31': { categoriesCompleted: 1, quizCorrect: 0 }, // 5일 연속(best 후보)
      '2026-08-03': { categoriesCompleted: 1, quizCorrect: 0 }, // 새 주 월, 공백 뒤 재시작
      // 08-04(화) 공백
      // 08-05(수) 공백(같은 주 2번째 공백 — freeze 1회 소진 후라 이어붙지 않음)
      '2026-08-06': { categoriesCompleted: 1, quizCorrect: 0 },
      '2026-08-07': { categoriesCompleted: 1, quizCorrect: 0 },
    }
    const r = computeStreakV2(history, '2026-08-07')
    check('같은 주 두 번째 공백은 끊김(freeze 1회 한도)', r.current < 5)
    check('끊겨도 best는 과거 최장 연속 보존', r.best >= 5)
  }

  // quiz_correct >= 10만으로도 인정일(categories 0이어도)
  {
    const history = {
      '2026-08-07': { categoriesCompleted: 0, quizCorrect: 12 },
    }
    const dates = historyToQualifiedDates(history)
    check('quiz_correct≥10 단독으로도 인정일', dates.includes('2026-08-07'))
    const r = computeStreakV2(history, '2026-08-07')
    check('퀴즈 단독 인정일도 streak에 반영', r.current === 1 && r.todayQualified === true)
  }

  // categoriesCompleted 1~3(레거시 기준 미달)만으로도 V2는 인정 —
  // 레거시(≥4)와 V2(≥1)가 의도적으로 다른 기준임을 교차 확인.
  {
    const history = { '2026-08-07': { categoriesCompleted: 1, quizCorrect: 0 } }
    const r = computeStreakV2(history, '2026-08-07')
    check('categoriesCompleted 1(레거시 미달)도 V2는 인정', r.current === 1)
  }

  // 빈 history/파싱 불가 키 방어
  {
    const r = computeStreakV2({}, '2026-08-07')
    check('빈 history 크래시 없음 + current 0', r.current === 0 && r.best === 0)
    const dates = historyToQualifiedDates({ 'not-a-date': { categoriesCompleted: 4 } })
    check('파싱 불가 키는 무시(크래시 없음)', Array.isArray(dates) && dates.length === 0)
  }

  // milestoneLabel 형식
  {
    const r = computeStreakV2({ '2026-08-07': { categoriesCompleted: 1 } }, '2026-08-07')
    check('milestoneLabel에 다음 마일스톤 일수 포함', typeof r.milestoneLabel === 'string' && r.milestoneLabel.includes('3'))
  }

  // toLocalDateStr — attachmentCore.parseHistoryKey와 동일 파싱(new Date(key))
  check('toLocalDateStr: Date 객체 → YYYY-MM-DD', toLocalDateStr(new Date(2026, 7, 7)) === '2026-08-07')
  check('localTodayStr(): YYYY-MM-DD 형식', typeof localTodayStr === 'function' && /^\d{4}-\d{2}-\d{2}$/.test(localTodayStr()))
}

// ── 2) 레거시 calcStreak 시맨틱 무변경(useStudent.js 미수정) ────────────
console.log('\n2. src/hooks/useStudent.js — calcStreak 시맨틱 무변경(정적 검사)')
const useStudentSrc = fs.readFileSync(path.resolve('src/hooks/useStudent.js'), 'utf8')
{
  const fnStart = useStudentSrc.indexOf('function calcStreak(history)')
  const fnSlice = fnStart >= 0 ? useStudentSrc.slice(fnStart, fnStart + 400) : ''
  check('calcStreak 함수가 여전히 존재', fnStart >= 0)
  check('calcStreak가 여전히 categoriesCompleted >= 4를 요구(4/4 완료 기준 무변경)', /categoriesCompleted\s*>=\s*4/.test(fnSlice))
  check('calcStreak가 여전히 toDateString() 키를 사용(무변경)', /toDateString\(\)/.test(fnSlice))
}
// 파일 전체가 아니라 calcStreak 함수 구간만 HEAD와 비교한다 — useStudent.js는
// 이 세션이 소유하지 않는 파일이라(다른 에이전트가 동시 작업 중일 수 있음,
// 규칙 16) 파일 전체 바이트 비교는 무관한 동시 변경에도 거짓 FAIL을 낼 수
// 있다. calcStreak 함수 구간 자체가 HEAD와 동일한지만 확인하면 "이 세션이
// 스트릭 레거시 로직에 손대지 않았다"는 주장을 정확히 검증할 수 있다.
// CRLF/LF 정규화 — Windows(core.autocrlf) 환경에서 git show(LF)와 작업
// 트리(CRLF)의 개행 차이만으로 거짓 FAIL이 나지 않게 비교 전 \r 제거.
const normEol = (s) => s.replace(/\r\n/g, '\n')
let headFnSlice = ''
try {
  const { execSync } = await import('node:child_process')
  const headSrc = normEol(execSync('git show HEAD:src/hooks/useStudent.js', { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 }))
  const headFnStart = headSrc.indexOf('function calcStreak(history)')
  headFnSlice = headFnStart >= 0 ? headSrc.slice(headFnStart, headFnStart + 400) : ''
} catch (e) {
  console.log(`  (git show 실패: ${e.message})`)
}
{
  const normUseStudentSrc = normEol(useStudentSrc)
  const fnStart = normUseStudentSrc.indexOf('function calcStreak(history)')
  const fnSlice = fnStart >= 0 ? normUseStudentSrc.slice(fnStart, fnStart + 400) : ''
  check('calcStreak 함수 구간이 HEAD와 바이트 단위로 동일(이 세션은 이 함수에 손대지 않는다)', headFnSlice.length > 0 && headFnSlice === fnSlice)
}

// ── 3) Dashboard.jsx — 정적 배선 검사 ───────────────────────────────────
console.log('\n3. src/components/Dashboard.jsx — 정적 배선 검사')
const dashboardSrc = fs.readFileSync(path.resolve('src/components/Dashboard.jsx'), 'utf8')
check("Dashboard.jsx가 isFeatureEnabled('streakV2')를 참조", /isFeatureEnabled\(['"]streakV2['"]\)/.test(dashboardSrc))
check('Dashboard.jsx가 computeStreakV2를 streakAdapter에서 import', /computeStreakV2.*from ['"]\.\.\/utils\/gamification\/streakAdapter['"]/.test(dashboardSrc))
check('Dashboard.jsx가 StreakChip을 렌더', /<StreakChip\b/.test(dashboardSrc))
check('Dashboard.jsx가 레거시 streak(useStudent.js calcStreak 파생)도 여전히 destructure(폴백 유지)', /\bstreak\b/.test(dashboardSrc.slice(0, dashboardSrc.indexOf('export default function Dashboard') + 2000)))

// ── 4) StreakChip.jsx — SSR 렌더 문자열 단언(flag-off vs flag-on) ───────
console.log('\n4. src/components/StreakChip.jsx — SSR 렌더')
let StreakChip = null
try {
  await esbuild.build({
    entryPoints: ['src/components/StreakChip.jsx'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: 'scripts/.tmp/streakChip',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
  })
  const mod = await import(pathToFileURL(path.resolve('scripts/.tmp/streakChip/StreakChip.js')).href)
  StreakChip = mod.default
} catch (e) {
  console.log(`  (번들/import 실패: ${e.message})`)
}
check('StreakChip 번들/import 가능', typeof StreakChip === 'function')

if (StreakChip) {
  const React = (await import('react')).default
  const { renderToStaticMarkup } = await import('react-dom/server')

  // flag-off(v2=null) — 레거시 마크업과 완전히 동일해야 함(바이트 비교).
  const legacyHtml = renderToStaticMarkup(React.createElement(StreakChip, { streak: 5, v2: null }))
  const expectedLegacyHtml = renderToStaticMarkup(
    React.createElement('div', { className: 'flex items-center gap-1 bg-orange-100 px-3 py-2 rounded-2xl' },
      React.createElement('span', { className: 'text-lg' }, '🔥'),
      React.createElement('span', { className: 'font-black text-orange-600 text-sm' }, '5일'))
  )
  check('flag-off(v2=null): 예전 인라인 마크업과 바이트 단위로 동일', legacyHtml === expectedLegacyHtml)

  const legacyZeroHtml = renderToStaticMarkup(React.createElement(StreakChip, { streak: 0, v2: null }))
  check('flag-off + streak 0: 아무것도 렌더 안 함(예전과 동일)', legacyZeroHtml === '')

  // flag-on(v2 있음) — current/보호/최고 기록 표시
  const v2Html = renderToStaticMarkup(React.createElement(StreakChip, {
    streak: 5,
    v2: { current: 4, best: 7, protectedThisWeek: true, todayQualified: true, freezesUsed: ['2026-08-05'], nextMilestone: { day: 7, remaining: 3 }, milestoneLabel: '7일까지 3일 남음' },
  }))
  check('flag-on: V2 current 표시(레거시 streak 아님)', v2Html.includes('4일') && !v2Html.includes('5일'))
  check('flag-on: protectedThisWeek → 🛡️ 보호됨 표시', v2Html.includes('🛡️') && v2Html.includes('보호됨'))
  check('flag-on: best > current → 최고 기록 표시', v2Html.includes('최고 7일'))

  // best <= current면 최고 기록 텍스트 생략
  const v2NoBestHtml = renderToStaticMarkup(React.createElement(StreakChip, {
    streak: 5, v2: { current: 7, best: 7, protectedThisWeek: false },
  }))
  check('flag-on: best와 current가 같으면 최고 기록 텍스트 생략', !v2NoBestHtml.includes('최고'))

  const v2ZeroHtml = renderToStaticMarkup(React.createElement(StreakChip, { streak: 0, v2: { current: 0, best: 0, protectedThisWeek: false } }))
  check('flag-on: current 0이면 아무것도 렌더 안 함', v2ZeroHtml === '')
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
