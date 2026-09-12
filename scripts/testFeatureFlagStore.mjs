// scripts/testFeatureFlagStore.mjs — 2026-09-12 Kinney Pilot A 사고 회귀.
// src/config/features.js의 크로스탭 재조회(storage/visibilitychange/
// pageshow 리스너 + subscribeFeatures/refreshFeaturesFromStorage) + 저장
// read-back 검증(setFeatureEnabled/setMultipleFeatures/resetFeatures가
// { ok, reason } 반환)을 순수 Node 환경에서 검증한다. React 렌더 없음 —
// window/document/localStorage를 인메모리 가짜로 만들어 features.js를
// 그 위에서 동작시킨다(이 모듈은 다른 모듈을 import하지 않는 순수
// 파일이라 esbuild 번들 없이 바로 동적 import 가능).
//
// Node는 모듈을 프로세스당 한 번만 로드하므로(ESM 캐시), "새 탭"은 재
// import가 아니라 이 프로세스 안에서 fake localStorage를 외부에서 직접
// 변경한 뒤 refreshFeaturesFromStorage()/storage 이벤트를 호출하는 것으로
// 시뮬레이션한다(과제 지시서 방법 그대로).
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let failures = 0
let checks = 0
function check(label, cond, extra) {
  checks++
  if (cond) {
    console.log(`  PASS  ${label}`)
  } else {
    console.log(`  FAIL  ${label}${extra !== undefined ? `  (${JSON.stringify(extra)})` : ''}`)
    failures++
  }
}

// ── 가짜 localStorage ───────────────────────────────────────────────────
function createFakeStorage() {
  let store = {}
  let throwOnSetItem = false
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      if (throwOnSetItem) throw new Error('QuotaExceededError (simulated)')
      store[k] = String(v)
    },
    removeItem: (k) => { delete store[k] },
    // 테스트 전용 헬퍼(브라우저 localStorage에는 없음) ──────────────────
    _setRaw: (k, v) => { store[k] = v },
    _getRaw: (k) => store[k],
    _setThrowOnSetItem: (b) => { throwOnSetItem = b },
    _clear: () => { store = {} },
  }
}

// ── 가짜 이벤트 타깃(window/document 공용) ─────────────────────────────
function createEventTarget() {
  const listeners = new Map() // type -> Set<fn>
  return {
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(fn)
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn)
    },
    dispatch: (type, evt = {}) => {
      for (const fn of listeners.get(type) || []) fn(evt)
    },
  }
}

const fakeStorage = createFakeStorage()
const fakeWindow = createEventTarget()
const fakeDocument = createEventTarget()
fakeDocument.visibilityState = 'hidden'

globalThis.localStorage = fakeStorage
globalThis.window = fakeWindow
globalThis.document = fakeDocument

const featuresModulePath = path.join(__dirname, '..', 'src', 'config', 'features.js')
const mod = await import(pathToFileURL(featuresModulePath).href)
const {
  isFeatureEnabled,
  setFeatureEnabled,
  setMultipleFeatures,
  resetFeatures,
  getAllFeatures,
  subscribeFeatures,
  refreshFeaturesFromStorage,
} = mod

function currentRaw() {
  const raw = fakeStorage._getRaw('paulEasyVoca_features')
  return raw ? JSON.parse(raw) : null
}

// ── 1. 기본값 ────────────────────────────────────────────────────────────
console.log('\n1. 기본값')
{
  check('paulTownV1 기본값 false', isFeatureEnabled('paulTownV1') === false)
}

// ── 2. setFeatureEnabled → ok:true, 저장됨, 구독자 알림 정확히 1회 ───────
console.log('\n2. setFeatureEnabled — 성공 경로')
{
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  const result = setFeatureEnabled('paulTownV1', true)
  check('결과 { ok: true }', result && result.ok === true, result)
  check('isFeatureEnabled가 true를 반영', isFeatureEnabled('paulTownV1') === true)
  const raw = currentRaw()
  check('저장된 JSON에 paulTownV1: true', !!raw && raw.paulTownV1 === true, raw)
  check('구독자가 정확히 1회 호출됨', calls === 1, calls)
  unsub()
}

// ── 3. "다른 탭" 시뮬레이션 — 외부에서 storage를 바꾼 뒤 refresh ────────
console.log('\n3. refreshFeaturesFromStorage — 외부(다른 탭) 변경 반영')
{
  // 먼저 알려진 상태로 되돌린다(리셋 자체도 이 모듈의 API).
  const resetResult = resetFeatures()
  check('resetFeatures가 ok:true 반환', resetResult && resetResult.ok === true, resetResult)
  check('reset 후 paulTownV1 false', isFeatureEnabled('paulTownV1') === false)

  // 다른 탭이 이 API를 거치지 않고 localStorage에 직접 쓴 것을 흉내낸다.
  const merged = { ...getAllFeatures(), paulTownV1: true }
  fakeStorage._setRaw('paulEasyVoca_features', JSON.stringify(merged))

  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  const changed = refreshFeaturesFromStorage()
  check('refreshFeaturesFromStorage가 true(변경됨) 반환', changed === true)
  check('isFeatureEnabled가 외부 변경을 반영(true)', isFeatureEnabled('paulTownV1') === true)
  check('구독자가 정확히 1회 호출됨', calls === 1, calls)
  unsub()
}

// ── 4~6. storage 이벤트 — key 매칭 규칙 ─────────────────────────────────
console.log('\n4. storage 이벤트 — key === "paulEasyVoca_features" → refresh')
{
  const merged = { ...getAllFeatures(), paulTownV1: false }
  fakeStorage._setRaw('paulEasyVoca_features', JSON.stringify(merged))
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  fakeWindow.dispatch('storage', { key: 'paulEasyVoca_features' })
  check('storage 이벤트(key=paulEasyVoca_features) 후 값 반영(false)', isFeatureEnabled('paulTownV1') === false)
  check('구독자 1회 호출', calls === 1, calls)
  unsub()
}

console.log('\n5. storage 이벤트 — key === null → refresh(브라우저의 storage clear() 관례)')
{
  const merged = { ...getAllFeatures(), paulTownV1: true }
  fakeStorage._setRaw('paulEasyVoca_features', JSON.stringify(merged))
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  fakeWindow.dispatch('storage', { key: null })
  check('storage 이벤트(key=null) 후 값 반영(true)', isFeatureEnabled('paulTownV1') === true)
  check('구독자 1회 호출', calls === 1, calls)
  unsub()
}

console.log('\n6. storage 이벤트 — 무관한 key → refresh 안 함(알림 0)')
{
  const merged = { ...getAllFeatures(), paulTownV1: false }
  fakeStorage._setRaw('paulEasyVoca_features', JSON.stringify(merged))
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  fakeWindow.dispatch('storage', { key: 'some_unrelated_key' })
  check('값이 반영되지 않음(여전히 true, stale 유지)', isFeatureEnabled('paulTownV1') === true)
  check('구독자 호출 0회', calls === 0, calls)
  unsub()
}

// ── 7. visibilitychange visible → refresh ──────────────────────────────
console.log('\n7. visibilitychange(visible) → refresh')
{
  const merged = { ...getAllFeatures(), paulTownV1: false }
  fakeStorage._setRaw('paulEasyVoca_features', JSON.stringify(merged))
  fakeDocument.visibilityState = 'visible'
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  fakeDocument.dispatch('visibilitychange')
  check('visible 상태에서 dispatch 후 값 반영(false)', isFeatureEnabled('paulTownV1') === false)
  check('구독자 1회 호출', calls === 1, calls)
  unsub()
}
console.log('\n7b. visibilitychange(hidden) → refresh 안 함')
{
  const merged = { ...getAllFeatures(), paulTownV1: true }
  fakeStorage._setRaw('paulEasyVoca_features', JSON.stringify(merged))
  fakeDocument.visibilityState = 'hidden'
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  fakeDocument.dispatch('visibilitychange')
  check('hidden 상태에서는 반영 안 됨(여전히 false, stale 유지)', isFeatureEnabled('paulTownV1') === false)
  check('구독자 호출 0회', calls === 0, calls)
  unsub()
}

// ── 8. pageshow → refresh ───────────────────────────────────────────────
console.log('\n8. pageshow → refresh')
{
  const merged = { ...getAllFeatures(), paulTownV1: true }
  fakeStorage._setRaw('paulEasyVoca_features', JSON.stringify(merged))
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  fakeWindow.dispatch('pageshow')
  check('pageshow 후 값 반영(true)', isFeatureEnabled('paulTownV1') === true)
  check('구독자 1회 호출', calls === 1, calls)
  unsub()
}

// ── 9. setItem이 던짐 → ok:false, 메모리 되돌림, 알림 없음 ──────────────
console.log('\n9. setFeatureEnabled — setItem 예외 → persist_failed, 메모리 롤백, notify 없음')
{
  resetFeatures()
  check('사전조건: townShopV1 기본 false', isFeatureEnabled('townShopV1') === false)
  fakeStorage._setThrowOnSetItem(true)
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  const result = setFeatureEnabled('townShopV1', true)
  check('결과 { ok: false, reason: "persist_failed" }', result && result.ok === false && result.reason === 'persist_failed', result)
  check('메모리가 롤백됨(여전히 false)', isFeatureEnabled('townShopV1') === false)
  check('구독자 호출 0회(알림 없음)', calls === 0, calls)
  unsub()
  fakeStorage._setThrowOnSetItem(false)
}

// ── 10. read-back 불일치(setItem이 조용히 no-op) → ok:false ─────────────
console.log('\n10. setFeatureEnabled — setItem 조용한 no-op(read-back 불일치) → persist_failed')
{
  resetFeatures()
  check('사전조건: townShopV1 기본 false', isFeatureEnabled('townShopV1') === false)
  const realSetItem = fakeStorage.setItem
  fakeStorage.setItem = () => { /* 조용히 아무 것도 안 씀 */ }
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  const result = setFeatureEnabled('townShopV1', true)
  check('결과 { ok: false, reason: "persist_failed" }', result && result.ok === false && result.reason === 'persist_failed', result)
  check('메모리가 롤백됨(여전히 false)', isFeatureEnabled('townShopV1') === false)
  check('구독자 호출 0회', calls === 0, calls)
  unsub()
  fakeStorage.setItem = realSetItem
}

// ── 11. resetFeatures/setMultipleFeatures — 성공 시 ok:true + notify ────
console.log('\n11. setMultipleFeatures/resetFeatures — 성공 경로')
{
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  const multiResult = setMultipleFeatures({ paulTownV1: true, townShopV1: true })
  check('setMultipleFeatures ok:true', multiResult && multiResult.ok === true, multiResult)
  check('두 플래그 모두 반영', isFeatureEnabled('paulTownV1') === true && isFeatureEnabled('townShopV1') === true)
  check('setMultipleFeatures가 구독자를 호출함', calls >= 1, calls)

  calls = 0
  const resetResult = resetFeatures()
  check('resetFeatures ok:true', resetResult && resetResult.ok === true, resetResult)
  check('reset 후 기본값으로 복귀(paulTownV1 false)', isFeatureEnabled('paulTownV1') === false)
  check('resetFeatures가 구독자를 호출함', calls >= 1, calls)
  unsub()
}

// ── 12. unsubscribe가 실제로 알림을 멈춤 ────────────────────────────────
console.log('\n12. unsubscribe — 이후 알림 받지 않음')
{
  let calls = 0
  const unsub = subscribeFeatures(() => { calls++ })
  setFeatureEnabled('paulTownV1', true)
  check('구독 중에는 호출됨(1회)', calls === 1, calls)
  unsub()
  setFeatureEnabled('paulTownV1', false)
  check('unsubscribe 후에는 더 이상 호출 안 됨(여전히 1)', calls === 1, calls)
}

// ── 13. 리스너 하나가 던져도 나머지는 계속 알림받음 ──────────────────────
console.log('\n13. 리스너 예외 격리 — 하나가 throw해도 나머지는 정상 호출')
{
  let goodCalls = 0
  const unsubBad = subscribeFeatures(() => { throw new Error('boom') })
  const unsubGood = subscribeFeatures(() => { goodCalls++ })
  let threw = false
  try {
    setFeatureEnabled('paulTownV1', true)
  } catch {
    threw = true
  }
  check('setFeatureEnabled 자체는 던지지 않음(리스너 예외를 삼킴)', threw === false)
  check('정상 리스너는 그대로 호출됨', goodCalls === 1, goodCalls)
  unsubBad()
  unsubGood()
}

console.log(`\n${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`\nFAIL — ${failures}건 실패`)
  process.exitCode = 1
} else {
  console.log('\nPASS — 전체 통과')
}
