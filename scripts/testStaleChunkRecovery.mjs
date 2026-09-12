// scripts/testStaleChunkRecovery.mjs — 2026-09-12 P1 stale lazy chunk 자동
// 복구 회귀(testUiStabilityGuards.mjs와 동일 패턴 — 순수 함수 단위 테스트 +
// 정적 소스 검사만, 실제 React 렌더/네트워크는 하나도 안 함).
//
// 배경: 배포마다 lazy 청크 파일명이 전부 바뀌어, 배포 전 세션이 그 이후
// dynamic import()를 하면 404 → React.lazy reject → AppErrorBoundary 크래시
// 화면. src/utils/staleChunkRecovery.js(순수, storage/reload 주입형)가 이
// 상황을 판정하고 세션당(60초 가드) 1회 자동 새로고침한다. 이 스크립트는
// 그 판정/가드/루프 방지 로직과, App.jsx/main.jsx 배선이 실제로 그 함수를
// 쓰는지를 검증한다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STALE_CHUNK_GUARD_KEY,
  isStaleChunkError,
  readGuard,
  tryRecoverFromStaleChunk,
  clearStaleChunkGuard,
  scheduleGuardReset,
} from '../src/utils/staleChunkRecovery.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let failures = 0
let checks = 0
function check(label, cond, detail = '') {
  checks++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`); failures++ }
}

// ── 인메모리 가짜 storage(옵션: setItem에서 throw) ──────────────────────
function makeFakeStorage({ throwOnSet = false } = {}) {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (throwOnSet) throw new Error('QuotaExceededError(시뮬레이션)')
      store.set(k, String(v))
    },
    removeItem: (k) => { store.delete(k) },
    _store: store,
  }
}

function makeReloadSpy() {
  let count = 0
  const fn = () => { count += 1 }
  return { fn, get count() { return count } }
}

// ── 1. isStaleChunkError / tryRecoverFromStaleChunk — 기본 판정 ─────────
console.log('\n1. stale 청크 오류 패턴 → reload 정확히 1회, 가드 기록')
{
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = Object.assign(new Error('chunk load failed'), { name: 'ChunkLoadError' })
  const r = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  check('name===ChunkLoadError → isStaleChunkError true', isStaleChunkError(err) === true)
  check('reloaded=true, reason=reloaded', r.reloaded === true && r.reason === 'reloaded', JSON.stringify(r))
  check('reload 정확히 1회 호출', spy.count === 1, `count=${spy.count}`)
  check('가드 타임스탬프가 storage에 기록됨(1000)', readGuard(storage) === 1000)
}

const MESSAGE_CASES = [
  ['Failed to fetch dynamically imported module: https://example.com/assets/PaulTown-DsFGJg61.js', 'Failed to fetch dynamically imported module'],
  ['Importing a module script failed.', 'Importing a module script failed.'],
  ['error loading dynamically imported module', 'error loading dynamically imported module'],
]
console.log('\n2. 실제 브라우저 오류 메시지 패턴 3종 → 각각 reload 1회')
for (const [message, label] of MESSAGE_CASES) {
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = new Error(message)
  const r = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  check(`"${label}" → isStaleChunkError true`, isStaleChunkError(err) === true)
  check(`"${label}" → reload 1회`, spy.count === 1 && r.reloaded === true, JSON.stringify(r))
}

console.log('\n3. vite:preloadError 이벤트 payload 모양(Error, 동일 메시지) → reload 1')
{
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const payload = new Error('Failed to fetch dynamically imported module: https://x/assets/A-abc.js')
  const r = tryRecoverFromStaleChunk({ error: payload, storage, reload: spy.fn, now: 1000 })
  check('preloadError payload도 stale로 판정 → reload 1', spy.count === 1 && r.reloaded === true, JSON.stringify(r))
}

// ── 4. 60초 가드 — 루프 방지 ─────────────────────────────────────────────
console.log('\n4. 60초 가드 윈도우 — 같은 storage에서 두 번째 동일 오류는 reload 0')
{
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = Object.assign(new Error('x'), { name: 'ChunkLoadError' })
  const r1 = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  const r2 = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1500 })
  check('1차 reload 1', r1.reloaded === true && spy.count === 1)
  check('2차(0.5초 후) reload 0, reason=guard_active', r2.reloaded === false && r2.reason === 'guard_active', JSON.stringify(r2))
  check('reload 누적 여전히 1회', spy.count === 1)
}

console.log('\n5. 가드 윈도우(60초) 만료 후에는 다시 reload 1')
{
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = Object.assign(new Error('x'), { name: 'ChunkLoadError' })
  tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  const r2 = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 + 61_000 })
  check('61초 후 재발생 → reload 1 추가(총 2)', r2.reloaded === true && spy.count === 2, JSON.stringify(r2))
}

console.log('\n6. clearStaleChunkGuard 이후에는 즉시 다시 reload 1, scheduleGuardReset이 지연 후 가드를 지움')
{
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = Object.assign(new Error('x'), { name: 'ChunkLoadError' })
  tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  check('clear 전 가드 존재', readGuard(storage) === 1000)
  clearStaleChunkGuard(storage)
  check('clear 후 가드 없음', readGuard(storage) === null)
  const r2 = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1010 })
  check('가드 해제 직후(10ms 후)라도 즉시 reload 1(윈도우 무관)', r2.reloaded === true && spy.count === 2, JSON.stringify(r2))

  // scheduleGuardReset — 페이크 타이머로 지연 실행을 즉시 캡처
  const storage2 = makeFakeStorage()
  storage2.setItem(STALE_CHUNK_GUARD_KEY, '5000')
  let capturedFn = null
  let capturedDelay = null
  const fakeSetTimer = (fn, delay) => { capturedFn = fn; capturedDelay = delay; return 'timer-id' }
  const timerId = scheduleGuardReset(storage2, 30_000, fakeSetTimer)
  check('scheduleGuardReset이 setTimer(fn, 30000)을 호출', capturedDelay === 30_000 && typeof capturedFn === 'function')
  check('실행 전에는 가드가 아직 존재', readGuard(storage2) === 5000)
  capturedFn()
  check('지연 콜백 실행 후 가드 제거됨', readGuard(storage2) === null)
  check('timer id를 그대로 반환', timerId === 'timer-id')
}

// ── 7. 오탐 방지 — 일반/인증/Supabase 오류는 전부 reload 0 ──────────────
console.log('\n7. 일반 데이터 오류 → not_stale, reload 0')
{
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = new TypeError("Cannot read properties of undefined (reading 'map')")
  const r = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  check('일반 TypeError는 isStaleChunkError false', isStaleChunkError(err) === false)
  check('reload 0, reason=not_stale', spy.count === 0 && r.reason === 'not_stale', JSON.stringify(r))
}

console.log('\n8. 일반 네트워크/인증 오류 3종 → 전부 reload 0')
for (const message of ['Network request failed', 'unauthorized', 'JWT expired', 'relogin_required']) {
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = new Error(message)
  const r = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  check(`Error('${message}') → reload 0, not_stale`, spy.count === 0 && r.reason === 'not_stale', JSON.stringify(r))
}

console.log('\n9. Supabase/PostgREST 오류 3종 → 전부 reload 0')
for (const message of ['PGRST205 Could not find the table', 'permission denied for table students', '42501']) {
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = new Error(message)
  const r = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  check(`Error('${message}') → reload 0, not_stale`, spy.count === 0 && r.reason === 'not_stale', JSON.stringify(r))
}

console.log('\n10. undefined/null/문자열 오류 → reload 0, throw 없음')
{
  for (const val of [undefined, null, 'plain string error']) {
    const storage = makeFakeStorage()
    const spy = makeReloadSpy()
    let threw = false
    let r
    try { r = tryRecoverFromStaleChunk({ error: val, storage, reload: spy.fn, now: 1000 }) } catch { threw = true }
    check(`${JSON.stringify(val)} → throw 없음`, threw === false)
    check(`${JSON.stringify(val)} → reload 0`, spy.count === 0 && r?.reason === 'not_stale', JSON.stringify(r))
  }
}

// ── 11. storage 쓰기 실패 — Safari 프라이빗 모드 등 ──────────────────────
console.log('\n11. storage.setItem이 throw하면 → reload 0, reason=storage_unavailable')
{
  const storage = makeFakeStorage({ throwOnSet: true })
  const spy = makeReloadSpy()
  const err = Object.assign(new Error('x'), { name: 'ChunkLoadError' })
  const r = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 })
  check('reload 0', spy.count === 0)
  check('reason=storage_unavailable', r.reason === 'storage_unavailable', JSON.stringify(r))
}

// ── 12. 루프 시뮬레이션 — 짧은 간격 연속 발생도 총 reload는 1 ───────────
console.log('\n12. 1초 간격 연속 5회 stale 오류 → 총 reload 정확히 1회(루프 방지 실측)')
{
  const storage = makeFakeStorage()
  const spy = makeReloadSpy()
  const err = Object.assign(new Error('x'), { name: 'ChunkLoadError' })
  const reasons = []
  for (let i = 0; i < 5; i++) {
    const r = tryRecoverFromStaleChunk({ error: err, storage, reload: spy.fn, now: 1000 + i * 1000 })
    reasons.push(r.reason)
  }
  check('5회 호출 중 reload는 정확히 1회', spy.count === 1, `count=${spy.count}`)
  check('첫 호출만 reloaded, 나머지는 guard_active', reasons[0] === 'reloaded' && reasons.slice(1).every((x) => x === 'guard_active'), JSON.stringify(reasons))
}

// ── 13. 정적 배선 확인 — App.jsx / main.jsx ─────────────────────────────
console.log('\n13. App.jsx — AppErrorBoundary가 stale 판정/복구를 실제로 사용')
{
  const appJsx = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8')
  check(
    'App.jsx가 staleChunkRecovery에서 isStaleChunkError/tryRecoverFromStaleChunk를 import',
    /import\s*\{\s*isStaleChunkError,\s*tryRecoverFromStaleChunk\s*\}\s*from\s*['"]\.\/utils\/staleChunkRecovery['"]/.test(appJsx)
  )
  check(
    'getDerivedStateFromError가 stale 필드를 isStaleChunkError(error)로 설정',
    /getDerivedStateFromError\(error\)\s*\{\s*return\s*\{\s*hasError:\s*true,\s*error,\s*stale:\s*isStaleChunkError\(error\)/.test(appJsx)
  )
  check(
    'componentDidCatch가 window.sessionStorage를 storage로 넘겨 tryRecoverFromStaleChunk 호출',
    /tryRecoverFromStaleChunk\(\{[\s\S]*?storage:\s*window\.sessionStorage/.test(appJsx)
  )
  check(
    '재시도 버튼이 this.state.stale로 분기(신규 "새로고침" vs 기존 "그냥 다시 시도")',
    /this\.state\.stale \? \(/.test(appJsx) && /새로고침/.test(appJsx) && /그냥 다시 시도/.test(appJsx)
  )
  check(
    'non-stale 분기는 여전히 setState({ hasError: false, error: null })로 복귀',
    /setState\(\{\s*hasError:\s*false,\s*error:\s*null\s*\}\)/.test(appJsx)
  )
  check(
    '"로그아웃 후 다시 시작" 버튼은 여전히 paulEasyVoca_currentStudent 제거 + reload',
    /localStorage\.removeItem\('paulEasyVoca_currentStudent'\)/.test(appJsx) && /로그아웃 후 다시 시작/.test(appJsx)
  )
}

console.log('\n14. main.jsx — vite:preloadError 리스너 + scheduleGuardReset 배선')
{
  const mainJsx = fs.readFileSync(path.join(repoRoot, 'src/main.jsx'), 'utf8')
  check(
    "main.jsx가 addEventListener('vite:preloadError', ...)를 등록",
    /addEventListener\(\s*'vite:preloadError'/.test(mainJsx)
  )
  check(
    'preloadError 핸들러가 tryRecoverFromStaleChunk를 호출',
    /tryRecoverFromStaleChunk\(/.test(mainJsx)
  )
  check(
    'scheduleGuardReset(window.sessionStorage)를 부팅 시 호출',
    /scheduleGuardReset\(window\.sessionStorage\)/.test(mainJsx)
  )
}

console.log('\n15. staleChunkRecovery.js는 localStorage를 쓰지 않음(sessionStorage만, 탭 범위)')
{
  const utilSrc = fs.readFileSync(path.join(repoRoot, 'src/utils/staleChunkRecovery.js'), 'utf8')
  check('localStorage 참조 없음', !/localStorage/.test(utilSrc))
  check('storage는 전부 매개변수로 주입(전역 window 직접 참조 없음)', !/window\./.test(utilSrc))
}

console.log(`\n${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`\nFAIL — ${failures}건 실패`)
  process.exitCode = 1
} else {
  console.log('\nPASS — 전체 통과')
}
