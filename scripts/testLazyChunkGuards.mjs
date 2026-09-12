// scripts/testLazyChunkGuards.mjs — 2026-09-12 lazy-chunk 복구(PR #40, P1)
// 정적 회귀 가드(testUiStabilityGuards.mjs/testStaleChunkRecovery.mjs와 동일
// 패턴: 전부 소스 텍스트 정적 분석 + 순수 함수 단위 테스트만, 실제 React
// 렌더/네트워크는 하나도 안 함. 유일한 예외는 섹션 4 — 이미 존재하는
// dist/를 읽기만 한다, 이 스크립트 자체는 빌드를 실행하지 않는다).
//
// 배경(131차 사고, handoff.md 2026-09-12): 배포마다 Vite가 모든 lazy 청크
// 파일명을 해시째로 바꾼다. 배포 전에 이미 앱을 열어둔 세션이 배포 이후
// 처음 React.lazy 동적 import()를 실행하면 옛 청크 URL 404 → reject →
// AppErrorBoundary 크래시. src/utils/staleChunkRecovery.js(순수)가 그
// 상황을 판정해 60초 가드로 세션당 1회 자동 새로고침한다(App.jsx의
// AppErrorBoundary.componentDidCatch + src/main.jsx의 vite:preloadError
// 리스너, 2군데). 이 안전망은 "모든 code-split 화면이 실제로 Suspense+
// AppErrorBoundary 아래에서 렌더된다"는 전제 위에서만 동작한다 — 누군가
// 새 lazy 화면을 추가하면서 Suspense/AppErrorBoundary 밖에 두거나, 배선
// 자체(main.jsx 리스너/App.jsx 호출부)를 실수로 지우면 이 안전망은 조용히
// 무력화된다. 이 스크립트는 그 정적 불변식을 고정한다.
//
// 구조 참고(중요, 순수 텍스트 스캔 설계 이유): App.jsx의 애착/Paul Town 계열
// Suspense 블록(HatCollection~TownScreen)은 AppInner 함수 *내부*에 있고,
// AppInner 자신을 감싸는 <AppErrorBoundary> 태그는 파일 훨씬 뒤쪽의
// `export default function App()` 안, `<AppErrorBoundary><AppInner .../>
// </AppErrorBoundary>` 한 줄에만 있다(AppInner의 JSX 텍스트 안에는
// <AppErrorBoundary> 문자열이 아예 없다). 그래서 "가장 가까운 앞쪽
// <AppErrorBoundary> 태그"만 보는 순진한 스캔은 이 11개 중 다수(Hat/Word/
// Growth/English/PaulTown/Bookshelf/TimeMachine/Town/EntranceTest)를 항상
// 오탐 FAIL 처리한다 — 실제로 안전한 코드인데 가짜 회귀를 보고하는 가드는
// 무의미하다(오히려 신뢰를 깎는다). 그래서 이 스크립트는 "직접 포함"
// 외에 "AppInner 함수 범위 안에 있고, 그 AppInner의 모든 JSX 사용처가
// AppErrorBoundary로 직접 감싸여 있다"는 1단계 간접 포함까지 인정한다
// (섹션 5의 부정 대조군이 이 간접 판정 자체가 실제로 깨질 수 있음을 증명).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  isStaleChunkError,
  tryRecoverFromStaleChunk,
  clearStaleChunkGuard,
  scheduleGuardReset,
  STALE_CHUNK_GUARD_WINDOW_MS,
} from '../src/utils/staleChunkRecovery.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let checks = 0
let failures = 0
function check(label, cond, detail = '') {
  checks++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail ? '  — ' + detail : ''}`); failures++ }
}
function skip(label, reason) {
  console.log(`  SKIP  ${label}  — ${reason}`)
}

const appJsx = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8')
const mainJsx = fs.readFileSync(path.join(repoRoot, 'src/main.jsx'), 'utf8')
const staleChunkSrc = fs.readFileSync(path.join(repoRoot, 'src/utils/staleChunkRecovery.js'), 'utf8')

// ── 공용 정적 분석 헬퍼(원본/부정 대조군 텍스트 둘 다에 재사용) ───────────

// 순서 있는 open/close 마커 쌍을 스택으로 매칭해 [start,end) 범위 목록을
// 만든다. React.Suspense/AppErrorBoundary 둘 다 이 파일 안에서 서로
// 중첩되지 않으므로 이 단순 스택 매칭으로 충분하다.
function pairRanges(text, openMarker, closeMarker) {
  const events = []
  for (let i = text.indexOf(openMarker); i !== -1; i = text.indexOf(openMarker, i + openMarker.length)) {
    events.push({ pos: i, type: 'open' })
  }
  for (let i = text.indexOf(closeMarker); i !== -1; i = text.indexOf(closeMarker, i + closeMarker.length)) {
    events.push({ pos: i, type: 'close', end: i + closeMarker.length })
  }
  events.sort((a, b) => a.pos - b.pos)
  const stack = []
  const ranges = []
  for (const e of events) {
    if (e.type === 'open') stack.push(e.pos)
    else {
      const start = stack.pop()
      if (start !== undefined) ranges.push({ start, end: e.end })
    }
  }
  return ranges
}

// `<Name ...` 또는 `<Name/>` 형태의 JSX 사용처 시작 인덱스 전부.
function usageIndices(text, name) {
  const re = new RegExp(`<${name}(?=[\\s/>])`, 'g')
  const out = []
  let m
  while ((m = re.exec(text))) out.push(m.index)
  return out
}

function within(idx, ranges) {
  return ranges.find((r) => idx >= r.start && idx < r.end)
}

// 최상위(들여쓰기 0) `function <name>(` 선언부터, 그 뒤 다음 최상위 선언
// (function/const/class/export)이 시작되기 전까지를 그 함수의 "범위"로
// 본다 — 실제 파서 없이도 이 저장소의 일관된 최상위=0-indent 포맷 덕에
// 안전하다(중괄호 카운팅은 문자열/주석 안의 짝 안 맞는 `{`/`}`에 취약해
// 일부러 피함).
function functionSpan(text, name) {
  const declRe = new RegExp(`^function ${name}\\(`, 'm')
  const m = declRe.exec(text)
  if (!m) return null
  const start = m.index
  const nextRe = /^(function |const |class |export )/gm
  nextRe.lastIndex = start + m[0].length
  const next = nextRe.exec(text)
  return { start, end: next ? next.index : text.length }
}

function buildCtx(text) {
  return {
    suspenseRanges: pairRanges(text, '<React.Suspense', '</React.Suspense>'),
    boundaryRanges: pairRanges(text, '<AppErrorBoundary>', '</AppErrorBoundary>'),
    appInnerSpan: functionSpan(text, 'AppInner'),
    appInnerUsageIndices: usageIndices(text, 'AppInner'),
  }
}

// range(예: 어떤 Suspense 블록)가 AppErrorBoundary로 보호되는지 — 직접
// (그 범위 자체가 <AppErrorBoundary>...</AppErrorBoundary> 안) 또는 간접
// (그 범위가 AppInner 함수 범위 안이고, AppInner의 모든 JSX 사용처가
// 전부 직접 보호됨)으로 판정한다.
function isProtected(range, ctx) {
  const direct = within(range.start, ctx.boundaryRanges) && within(range.end - 1, ctx.boundaryRanges)
  if (direct) return { protected: true, mode: 'direct' }
  if (
    ctx.appInnerSpan &&
    range.start >= ctx.appInnerSpan.start &&
    range.end <= ctx.appInnerSpan.end &&
    ctx.appInnerUsageIndices.length > 0 &&
    ctx.appInnerUsageIndices.every((idx) => within(idx, ctx.boundaryRanges))
  ) {
    return { protected: true, mode: 'via-AppInner' }
  }
  return { protected: false, mode: 'none' }
}

// 이름 하나에 대한 종합 판정: 사용처가 존재하고, 그 사용처 전부가 어떤
// Suspense 범위 안에 있고, 그 Suspense 범위가 AppErrorBoundary로 보호됨.
function checkNameProtection(text, name, ctx) {
  const idxs = usageIndices(text, name)
  if (idxs.length === 0) return { ok: false, reason: '사용처 없음' }
  for (const idx of idxs) {
    const susRange = within(idx, ctx.suspenseRanges)
    if (!susRange) return { ok: false, reason: `사용처(idx=${idx})가 어떤 Suspense 블록에도 안 속함` }
    const prot = isProtected(susRange, ctx)
    if (!prot.protected) return { ok: false, reason: `Suspense 블록이 AppErrorBoundary로 보호 안 됨(usage idx=${idx})` }
  }
  return { ok: true }
}

// ── 1. App.jsx — React.lazy 선언 수집 ────────────────────────────────────
console.log('\n1. App.jsx — React.lazy 선언 수집')
const lazyDecls = []
{
  const re = /const (\w+) = React\.lazy\(\(\) => import\('([^']+)'\)\)/g
  let m
  while ((m = re.exec(appJsx))) lazyDecls.push({ name: m[1], importPath: m[2] })
  console.log(`  lazy 선언 ${lazyDecls.length}개: ${lazyDecls.map((d) => d.name).join(', ')}`)
  check('React.lazy 선언이 11개 이상(현재 기준 11개)', lazyDecls.length >= 11, `실제 ${lazyDecls.length}개`)
  const expected = ['AdminScreen', 'ParentScreen', 'EntranceTest', 'HatCollection', 'WordMuseum',
    'GrowthAlbum', 'EnglishGarden', 'PaulTown', 'Bookshelf', 'TimeMachine', 'TownScreen']
  const names = new Set(lazyDecls.map((d) => d.name))
  for (const n of expected) check(`현재 기준 lazy 화면 목록에 ${n} 포함`, names.has(n))
}

// ── 2. App.jsx — 각 lazy 화면 사용처가 Suspense 안 + AppErrorBoundary 보호 ─
console.log('\n2. App.jsx — 각 lazy 화면: JSX 사용처 존재 + Suspense 안 + AppErrorBoundary로 보호(직접/AppInner 경유)')
const realCtx = buildCtx(appJsx)
for (const { name } of lazyDecls) {
  const idxs = usageIndices(appJsx, name)
  check(`<${name}> JSX 사용처가 최소 1곳 존재`, idxs.length > 0)
  const result = checkNameProtection(appJsx, name, realCtx)
  check(`<${name}> 사용이 Suspense 안 + AppErrorBoundary로 보호됨(${result.ok ? '' : result.reason})`.replace(/\(\)$/, ''), result.ok, result.reason)
}

// ── 3. AppErrorBoundary 클래스 배선 ───────────────────────────────────────
console.log('\n3. App.jsx — AppErrorBoundary 클래스가 stale-chunk 복구 배선을 그대로 유지')
{
  check('class AppErrorBoundary extends React.Component 선언 존재', /class AppErrorBoundary extends React\.Component/.test(appJsx))
  check('static getDerivedStateFromError(error) 존재', /static getDerivedStateFromError\(error\)/.test(appJsx))
  check('componentDidCatch(error, info) 존재', /componentDidCatch\(error, info\)/.test(appJsx))
  check(
    "isStaleChunkError/tryRecoverFromStaleChunk를 './utils/staleChunkRecovery'에서 import",
    /import\s*\{\s*isStaleChunkError,\s*tryRecoverFromStaleChunk\s*\}\s*from\s*['"]\.\/utils\/staleChunkRecovery['"]/.test(appJsx)
  )
  const callBlockMatch = appJsx.match(/tryRecoverFromStaleChunk\(\{[\s\S]{0,300}?\}\)/)
  const callBlock = callBlockMatch ? callBlockMatch[0] : ''
  check('componentDidCatch가 tryRecoverFromStaleChunk({ ... }) 호출', !!callBlockMatch)
  check('그 호출이 storage: window.sessionStorage를 넘김', /storage:\s*window\.sessionStorage/.test(callBlock))
  check("그 호출이 reload: () => window.location.reload()를 넘김", /reload:\s*\(\)\s*=>\s*window\.location\.reload\(\)/.test(callBlock))
  check(
    '"그냥 다시 시도" 버튼이 this.setState({ hasError: false, error: null ... }) 유지',
    /this\.setState\(\{\s*hasError:\s*false,\s*error:\s*null/.test(appJsx)
  )
  check(
    '"로그아웃 후 다시 시작" 버튼이 paulEasyVoca_currentStudent 세션 키를 제거',
    /localStorage\.removeItem\('paulEasyVoca_currentStudent'\)/.test(appJsx)
  )
}

// ── 4. main.jsx — vite:preloadError 배선 ─────────────────────────────────
console.log('\n4. main.jsx — vite:preloadError 리스너 + 가드 초기화 배선')
{
  check("window.addEventListener('vite:preloadError', ...) 등록", /window\.addEventListener\('vite:preloadError'/.test(mainJsx))
  check('scheduleGuardReset(window.sessionStorage) 호출(부팅 시 가드 자가 해제 예약)', mainJsx.includes('scheduleGuardReset(window.sessionStorage)'))
  check('리스너 콜백이 tryRecoverFromStaleChunk(...)를 호출', mainJsx.includes('tryRecoverFromStaleChunk('))
  const totalPreventDefault = (mainJsx.match(/event\.preventDefault\(\)/g) || []).length
  const guardedPreventDefault = (mainJsx.match(/if\s*\(\s*result\.reloaded\s*\)\s*event\.preventDefault\(\)/g) || []).length
  check(
    'event.preventDefault()는 오직 result.reloaded 안에서만 호출(무조건 preventDefault 아님)',
    totalPreventDefault >= 1 && totalPreventDefault === guardedPreventDefault,
    `preventDefault 총 ${totalPreventDefault}회, reloaded 가드된 것 ${guardedPreventDefault}회`
  )
}

// ── 5. staleChunkRecovery.js — export/상수/동작 계약 ──────────────────────
console.log('\n5. src/utils/staleChunkRecovery.js — export 계약 + 상수 + localStorage 무사용')
{
  check('isStaleChunkError export가 함수', typeof isStaleChunkError === 'function')
  check('tryRecoverFromStaleChunk export가 함수', typeof tryRecoverFromStaleChunk === 'function')
  check('clearStaleChunkGuard export가 함수', typeof clearStaleChunkGuard === 'function')
  check('scheduleGuardReset export가 함수', typeof scheduleGuardReset === 'function')
  check('STALE_CHUNK_GUARD_WINDOW_MS === 60_000(1분 루프 방지 가드)', STALE_CHUNK_GUARD_WINDOW_MS === 60_000)

  let capturedDelay = null
  const fakeTimer = (fn, ms) => { capturedDelay = ms; return 0 }
  const fakeStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  scheduleGuardReset(fakeStorage, undefined, fakeTimer) // delayMs 생략 → 기본값 적용
  check('scheduleGuardReset 기본 지연이 30_000ms(delayMs 인자 생략 시)', capturedDelay === 30_000, `실제 ${capturedDelay}`)

  check(
    'staleChunkRecovery.js는 localStorage를 어디서도 안 씀(sessionStorage만, 탭 범위/로그아웃 무관 잔존 방지)',
    !staleChunkSrc.includes('localStorage')
  )
}

// ── 6. 빌드 산출물 가드(dist/ 존재할 때만, 이 스크립트는 빌드를 실행 안 함) ─
console.log('\n6. dist/ 빌드 산출물 가드(있을 때만 — 이 스크립트는 build를 직접 실행하지 않음)')
{
  const distDir = path.join(repoRoot, 'dist')
  const assetsDir = path.join(distDir, 'assets')
  if (!fs.existsSync(distDir) || !fs.existsSync(assetsDir)) {
    skip('dist/ 산출물 검사 전체', 'dist/ 없음 — npm run build를 먼저 실행해야 이 섹션이 돈다')
  } else {
    const assetFiles = fs.readdirSync(assetsDir)
    for (const { name } of lazyDecls) {
      const re = new RegExp(`^${name}-[A-Za-z0-9_-]+\\.js$`)
      const matches = assetFiles.filter((f) => re.test(f))
      check(`dist/assets/에 ${name}-*.js 청크가 정확히 1개`, matches.length === 1, `실제 ${matches.length}개: ${matches.join(', ')}`)
    }
    const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')
    const indexJsRefs = [...indexHtml.matchAll(/src="[^"]*assets\/(index-[A-Za-z0-9_-]+\.js)"/g)].map((m) => m[1])
    check('dist/index.html이 assets/index-*.js를 정확히 1개만 참조', indexJsRefs.length === 1, `실제 ${indexJsRefs.length}개: ${indexJsRefs.join(', ')}`)
    if (indexJsRefs.length === 1) {
      const mainBundle = fs.readFileSync(path.join(assetsDir, indexJsRefs[0]), 'utf8')
      check("메인 번들에 'staleChunkReloadAt' 문자열 포함(가드 키 상수)", mainBundle.includes('staleChunkReloadAt'))
      check("메인 번들에 'vite:preloadError' 문자열 포함(리스너 등록 코드)", mainBundle.includes('vite:preloadError'))
    } else {
      skip('메인 번들 문자열 검사 2건', 'index-*.js 참조가 정확히 1개가 아니라 대상 파일을 특정할 수 없음')
    }
  }
}

// ── 7. 부정 대조군(규칙 15) — 이 스캐너가 실제로 위반을 잡아내는지 확인 ────
console.log('\n7. 부정 대조군 — 스캐너 자체가 실제 위반을 잡아내는지(사본에만 문자열 수술, src 무수정)')
{
  // 7a. TownScreen 사용처를 Suspense 블록 밖으로 이동
  const townIdxs = usageIndices(appJsx, 'TownScreen')
  check('(설정) 원본에 <TownScreen 사용처가 존재', townIdxs.length > 0)
  if (townIdxs.length > 0) {
    const idx = townIdxs[0]
    const tagEnd = appJsx.indexOf('/>', idx) + 2
    const tag = appJsx.slice(idx, tagEnd)
    const closeIdx = appJsx.indexOf('</React.Suspense>', tagEnd)
    check('(설정) TownScreen 사용처 뒤에 </React.Suspense>가 존재', closeIdx !== -1)
    if (closeIdx !== -1) {
      const closeEnd = closeIdx + '</React.Suspense>'.length
      const corrupted = appJsx.slice(0, idx) + appJsx.slice(tagEnd, closeEnd) + '\n' + tag + appJsx.slice(closeEnd)
      const corruptedCtx = buildCtx(corrupted)
      const result = checkNameProtection(corrupted, 'TownScreen', corruptedCtx)
      check('사본에서 TownScreen을 Suspense 밖으로 옮기면 스캐너가 위반을 감지', result.ok === false, result.ok ? '위반을 못 잡음(스캐너 결함)' : result.reason)
      const other = checkNameProtection(corrupted, 'AdminScreen', corruptedCtx)
      check('같은 사본에서 무관한 AdminScreen은 여전히 정상 판정(수술이 전역을 깨지 않음)', other.ok === true)
    }
  }

  // 7b. main.jsx에서 vite:preloadError 리터럴 제거(addEventListener 호출부만
  // — 헤더 주석에도 같은 문자열이 등장하므로 첫 occurrence만 지우는 단순
  // replace는 주석을 지우고 실제 등록 호출을 안 건드리는 거짓양성 위험이
  // 있어, 호출부 문자열을 명시적으로 타겟한다).
  check("(설정) 원본 main.jsx에 addEventListener('vite:preloadError' 호출이 존재", mainJsx.includes("addEventListener('vite:preloadError'"))
  const corruptedMain = mainJsx.replace("addEventListener('vite:preloadError'", "addEventListener('DISABLED_vite_preloadError'")
  check(
    "사본에서 'vite:preloadError' 리터럴을 지우면 리스너 등록 검사가 실패로 뒤집힘",
    !/window\.addEventListener\('vite:preloadError'/.test(corruptedMain)
  )

  // 7c. App() 최종 반환에서 <AppInner>를 감싸는 AppErrorBoundary를 제거
  //     → AppInner 함수 범위 안의(간접 보호) Suspense 블록들이 전부
  //     보호되지 않는다고 판정돼야 한다(간접 판정 로직 자체의 유효성 확인).
  const wrappedReturn = "return <AppErrorBoundary><AppInner studentId={student.id} studentName={student.name} onLogout={handleLogout} /></AppErrorBoundary>"
  check('(설정) 원본에 <AppErrorBoundary><AppInner .../></AppErrorBoundary> 최종 반환 줄이 존재', appJsx.includes(wrappedReturn))
  if (appJsx.includes(wrappedReturn)) {
    const unwrappedReturn = "return <AppInner studentId={student.id} studentName={student.name} onLogout={handleLogout} />"
    const corrupted2 = appJsx.replace(wrappedReturn, unwrappedReturn)
    const corruptedCtx2 = buildCtx(corrupted2)
    const result = checkNameProtection(corrupted2, 'EntranceTest', corruptedCtx2)
    check(
      '사본에서 AppInner를 감싸는 AppErrorBoundary를 제거하면 AppInner 내부 lazy 화면(EntranceTest)이 보호 안 됨으로 뒤집힘',
      result.ok === false,
      result.ok ? '위반을 못 잡음(간접 판정 로직 결함)' : result.reason
    )
  }
}

console.log(`\n${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`\nFAIL — ${failures}건 실패`)
  process.exitCode = 1
} else {
  console.log('\nPASS — 전체 통과')
}
