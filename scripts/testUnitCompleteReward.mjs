// scripts/testUnitCompleteReward.mjs — P4 "유닛 완료 보상"(2026-09-03,
// docs/REWARD_LOOP_AUDIT_2026-09-03.md §14) FAIL-first 계약 테스트.
//
// 3개 파트:
//   1) src/hooks/useStudent.js의 recordUnitCompleted — 실제 번들된 훅을
//      fakeReact.mjs로 구동해 flag OFF/ON, 중복지급 방지, 서로 다른
//      unitId 별개 지급을 검증(scripts/testRewardFlow.mjs와 동일 기법
//      재사용, CLAUDE.md 규칙 3).
//   2) mergeProgressRecords(rewardEngine 원장 병합, 무변경 기존 로직)이
//      unit-complete 항목에도 정확히 같은 규칙(idempotency_key 기준
//      union)으로 동작하는지.
//   3) src/hooks/unitCompletionDetector.js의 diffNewlyCompleted(순수 함수) —
//      "이번에 새로 완료된 unitId만" 골라내는 로직 자체를 직접 검증 +
//      useAttachment.js 배선의 정적 검사(첫 실행 씨딩, 별도 effect).
//
// 실행:
//   node scripts/buildUnitCompleteBundle.mjs && node scripts/testUnitCompleteReward.mjs
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createFakeClock, renderHook } from './fakeReact.mjs'
import { diffNewlyCompleted } from '../src/hooks/unitCompletionDetector.js'

let failures = 0
let asserted = 0
const check = (label, cond) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
class FakeDocument {
  constructor() { this.visibilityState = 'visible'; this.listeners = {} }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn) }
  dispatch(type) { (this.listeners[type] || []).forEach(fn => fn()) }
}

const raceStub = await import(pathToFileURL(path.resolve('scripts/wordLibraryRaceStub.mjs')).href)
const bundlePath = path.resolve('scripts/.tmp/useStudent.p4p5.bundle.mjs')
let bundleCacheBust = 0
// features.js는 번들 안에 인라인되어 있어 setFeatureEnabled를 밖에서 부를
// 방법이 없다(export 안 됨) — 대신 매 시나리오마다 "새 URL"로 다시
// import해서 모듈을 통째로 새로 평가시킨다(Node ESM은 URL이 다르면 별도
// 모듈 인스턴스). features.js 모듈 최상단의 `loadFeaturesFromStorage()`가
// 그 시점의 globalThis.localStorage를 읽으므로, import 직전에 원하는 flag
// 값을 localStorage에 심어두면 그 값으로 초기화된다.
async function loadFreshBundle() {
  bundleCacheBust += 1
  return await import(pathToFileURL(bundlePath).href + `?t=${bundleCacheBust}`)
}

function freshEnv(featureOverrides, seedRecord, id) {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
  if (featureOverrides) {
    globalThis.localStorage.setItem('paulEasyVoca_features', JSON.stringify(featureOverrides))
  }
  if (seedRecord) {
    globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({ [id]: seedRecord }))
  }
}

async function mount(id, name, { featureOverrides, seedRecord } = {}) {
  freshEnv(featureOverrides, seedRecord, id)
  const bundle = await loadFreshBundle()
  const clock = createFakeClock()
  const host = renderHook(() => bundle.useStudent(id, name), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return { host, clock, bundle }
}

const flush = () => new Promise((r) => process.nextTick(r))
function settle(host) { host.rerender(); return host }
function ledgerArr(host) { return Array.isArray(host.result.rewardLedger) ? host.result.rewardLedger : [] }
function ledgerCount(host, rewardType, sourceIdPredicate) {
  return ledgerArr(host).filter((e) => e && e.reward_type === rewardType && (!sourceIdPredicate || sourceIdPredicate(e.source_id))).length
}

// ── 1) flag OFF — recordUnitCompleted는 항상 false, 어떤 상태도 안 바뀜 ──
console.log('\n1. flag unitCompleteReward OFF — recordUnitCompleted 무동작')
{
  const { host } = await mount('22222222-0000-0000-0000-000000000001', 'QA_Unit_FlagOff', { featureOverrides: { unitCompleteReward: false } })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  check('recordUnitCompleted 함수 존재', typeof host.result.recordUnitCompleted === 'function')
  const ret = host.result.recordUnitCompleted?.('unit-x')
  check('flag OFF — 반환값 false', ret === false)
  settle(host)
  check('flag OFF — rewardLedger에 unit-complete 0건', ledgerCount(host, 'unit-complete') === 0)
  check('flag OFF — totalStars 변화 없음', host.result.stars === before)
}

// ── 2) flag ON — 첫 호출 지급, idempotency key 형식, +5 ──
console.log('\n2. flag unitCompleteReward ON — 첫 호출 지급(+5, 정확한 key)')
{
  const ID = '22222222-0000-0000-0000-000000000002'
  const UNIT_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
  const { host } = await mount(ID, 'QA_Unit_On1', { featureOverrides: { unitCompleteReward: true } })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  const ret = host.result.recordUnitCompleted(UNIT_ID)
  settle(host)
  check('flag ON — 첫 호출 반환값 true', ret === true)
  check('flag ON — unit-complete 정확히 1건', ledgerCount(host, 'unit-complete', (id) => id === UNIT_ID) === 1)
  const entry = ledgerArr(host).find((e) => e.reward_type === 'unit-complete')
  check('idempotency_key 형식 === `${sid}:unit-complete:unit:${unitId}`', entry && entry.idempotency_key === `${ID}:unit-complete:unit:${UNIT_ID}`)
  check('source_type === "unit"', entry && entry.source_type === 'unit')
  check('stars_delta === 5', entry && entry.stars_delta === 5)
  check('totalStars === before + 5', host.result.stars === before + 5)
}

// ── 3) flag ON — 같은 unitId 재호출 → 추가 지급 0 ──
console.log('\n3. flag ON — 같은 unitId 재호출 → 추가 지급 없음(평생 1회)')
{
  const ID = '22222222-0000-0000-0000-000000000003'
  const UNIT_ID = 'aaaaaaaa-0000-4000-8000-000000000002'
  const { host } = await mount(ID, 'QA_Unit_On2', { featureOverrides: { unitCompleteReward: true } })
  await flush(); await flush(); await flush()
  host.result.recordUnitCompleted(UNIT_ID)
  settle(host)
  const afterFirst = host.result.stars
  const ret2 = host.result.recordUnitCompleted(UNIT_ID)
  settle(host)
  check('두 번째 호출 반환값 false', ret2 === false)
  check('두 번째 호출 후에도 여전히 1건', ledgerCount(host, 'unit-complete', (id) => id === UNIT_ID) === 1)
  check('두 번째 호출 후 totalStars 변화 없음', host.result.stars === afterFirst)
}

// ── 4) flag ON — 다른 unitId → 별개 지급 ──
console.log('\n4. flag ON — 다른 unitId → 별개로 2번째 지급')
{
  const ID = '22222222-0000-0000-0000-000000000004'
  const UNIT_A = 'aaaaaaaa-0000-4000-8000-000000000003'
  const UNIT_B = 'aaaaaaaa-0000-4000-8000-000000000004'
  const { host } = await mount(ID, 'QA_Unit_On3', { featureOverrides: { unitCompleteReward: true } })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  host.result.recordUnitCompleted(UNIT_A)
  settle(host)
  host.result.recordUnitCompleted(UNIT_B)
  settle(host)
  check('unitId별 각각 정확히 1건씩(합 2건)', ledgerCount(host, 'unit-complete') === 2)
  check('totalStars === before + 10(유닛 2개 × 5)', host.result.stars === before + 10)
}

// ── 5) falsy unitId — flag ON이어도 무동작 ──
console.log('\n5. flag ON — falsy unitId(undefined/null/빈문자열)는 무동작')
{
  const { host } = await mount('22222222-0000-0000-0000-000000000005', 'QA_Unit_Falsy', { featureOverrides: { unitCompleteReward: true } })
  await flush(); await flush(); await flush()
  const before = host.result.stars
  check('undefined — false', host.result.recordUnitCompleted(undefined) === false)
  check('null — false', host.result.recordUnitCompleted(null) === false)
  check('빈 문자열 — false', host.result.recordUnitCompleted('') === false)
  settle(host)
  check('falsy 호출 후 unit-complete 0건', ledgerCount(host, 'unit-complete') === 0)
  check('falsy 호출 후 totalStars 변화 없음', host.result.stars === before)
}

// ── 6) mergeProgressRecords — 두 기기가 같은 unit-complete 항목을 들고
//     있으면 병합 후 정확히 1건(idempotency_key 기준 union) ──
console.log('\n6. mergeProgressRecords — unit-complete 원장 병합(같은 key 1건, 서로 다른 unitId는 둘 다 보존)')
{
  const { bundle } = await mount('22222222-0000-0000-0000-000000000006', 'QA_Unit_Merge')
  const ID = 'merge-unit-id'
  const sharedKey = `${ID}:unit-complete:unit:shared-unit`
  const shared_local = { id: sharedKey, reward_type: 'unit-complete', source_type: 'unit', source_id: 'shared-unit', stars_delta: 5, xp_delta: 0, idempotency_key: sharedKey, created_at: 'LOCAL' }
  const shared_cloud = { id: sharedKey, reward_type: 'unit-complete', source_type: 'unit', source_id: 'shared-unit', stars_delta: 5, xp_delta: 0, idempotency_key: sharedKey, created_at: 'CLOUD' }
  const localOnlyKey = `${ID}:unit-complete:unit:local-only-unit`
  const localOnly = { id: localOnlyKey, reward_type: 'unit-complete', source_type: 'unit', source_id: 'local-only-unit', stars_delta: 5, xp_delta: 0, idempotency_key: localOnlyKey, created_at: 'LOCAL' }
  const cloudOnlyKey = `${ID}:unit-complete:unit:cloud-only-unit`
  const cloudOnly = { id: cloudOnlyKey, reward_type: 'unit-complete', source_type: 'unit', source_id: 'cloud-only-unit', stars_delta: 5, xp_delta: 0, idempotency_key: cloudOnlyKey, created_at: 'CLOUD' }

  const localRaw = { studentId: ID, totalStars: 5, rewardLedger: [shared_local, localOnly] }
  const cloudRaw = { studentId: ID, totalStars: 5, rewardLedger: [shared_cloud, cloudOnly] }
  const merged = bundle.mergeProgressRecords(localRaw, cloudRaw, ID)

  check('병합 원장 길이 === 3(겹치는 key 1건만)', Array.isArray(merged.rewardLedger) && merged.rewardLedger.length === 3)
  check('겹치는 key는 local 버전 우선', merged.rewardLedger.find((e) => e.idempotency_key === sharedKey)?.created_at === 'LOCAL')
  check('local 전용 unitId 보존', merged.rewardLedger.some((e) => e.idempotency_key === localOnlyKey))
  check('cloud 전용 unitId 보존', merged.rewardLedger.some((e) => e.idempotency_key === cloudOnlyKey))
}

// ── 7) diffNewlyCompleted(순수 함수) — 전이 감지 로직 자체 ──
console.log('\n7. src/hooks/unitCompletionDetector.js — diffNewlyCompleted(순수 함수)')
{
  check('빈 prevSet — 전부 새로 완료', JSON.stringify(diffNewlyCompleted(new Set(), ['a', 'b'])) === JSON.stringify(['a', 'b']))
  check('일부 이미 알려짐 — 새 항목만', JSON.stringify(diffNewlyCompleted(new Set(['a']), ['a', 'b'])) === JSON.stringify(['b']))
  check('전부 이미 알려짐 — 빈 배열', diffNewlyCompleted(new Set(['a', 'b']), ['a', 'b']).length === 0)
  check('currentIds가 줄어도(유닛 목록 변경) 에러 없음, 빈 배열', diffNewlyCompleted(new Set(['a', 'b']), ['a']).length === 0)
  check('null/undefined id는 결과에서 제외', JSON.stringify(diffNewlyCompleted(new Set(), ['a', null, undefined, 'b'])) === JSON.stringify(['a', 'b']))
  check('prevSet이 배열이어도 안전하게 Set으로 취급', JSON.stringify(diffNewlyCompleted(['a'], ['a', 'b'])) === JSON.stringify(['b']))
  check('currentIds가 배열이 아니면 빈 배열(방어)', diffNewlyCompleted(new Set(), null).length === 0)
}

// ── 8) useAttachment.js 배선 정적 검사 — 첫 실행 씨딩(소급 지급 없음) + 별도 effect ──
console.log('\n8. useAttachment.js 배선 정적 검사(첫 실행 씨딩, 별도 effect, hats effect 재사용 아님)')
{
  const src = fs.readFileSync(path.resolve('src/hooks/useAttachment.js'), 'utf8')
  check('diffNewlyCompleted를 unitCompletionDetector에서 import', /import\s*\{\s*diffNewlyCompleted\s*\}\s*from\s*['"]\.\/unitCompletionDetector['"]/.test(src))
  check('notifiedUnitIdsRef(별도 ref) 존재 — 기존 ranRef 재사용 아님', /notifiedUnitIdsRef\s*=\s*useRef\(null\)/.test(src))
  const seedIdx = src.indexOf('notifiedUnitIdsRef.current === null')
  const grantIdx = src.indexOf('recordUnitCompleted?.(unitId)')
  check('첫 실행 씨딩 분기가 recordUnitCompleted 호출보다 소스상 앞에 위치(=최초 렌더는 지급 없이 씨딩만)', seedIdx > 0 && grantIdx > seedIdx)
  check('effect는 unitsDone에 의존(모자 판정용 ranRef 이펙트와 별개 트리거)', /\[unitsDone\]/.test(src))
  check('recordUnitCompleted를 studentData에서 destructure', /recordUnitCompleted\s*\}\s*=\s*studentData/.test(src))
}

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
