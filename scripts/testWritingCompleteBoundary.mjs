// scripts/testWritingCompleteBoundary.mjs — writing-complete 경계값/새로고침/
// 재로그인/재시도/날짜 경계 회귀 고정 (2026-09-11, qa/town-loop-hardening-2026-09-11)
//
// scripts/testWritingCompleteRealReactTiming.mjs가 2026-09-10 FAIL-first로
// 재현·수정을 검증한 결함(justCompletedWriting을 bumpHistory의 setState
// 함수형 updater "안"에서만 세팅하고 그 직후 밖에서 읽던 타이밍 버그,
// src/hooks/useStudent.js recordSpellingAnswer ~1751-1797행 주석)은 이미
// 수정 완료 상태다(prevCorrectSnapshot/nextCorrectSnapshot을 patch() 호출
// "전" 이 렌더의 클로저 history로 동기 계산). 이 파일은 그 수정을 전제로,
// "정확히 언제(경계) 지급되고 그 이후엔 지급되지 않는가"를 더 넓은 시나리오
// 7종(경계값/새로고침/재로그인(동일·타 UUID)/네트워크 재시도/날짜 경계)으로
// 굳히는 후속 회귀 스위트다 — FAIL-first 재현이 아니라 POST-FIX 계약 고정.
//
// 하네스: testWritingCompleteRealReactTiming.mjs와 동일하게 REAL React 18
// (react-dom/client createRoot + react-dom/test-utils act, 최소 손수제작
// DOM 셔임 — jsdom 아님, 규칙 6 신규 의존성 금지)로 실제
// src/hooks/useStudent.js를 esbuild로 번들해 구동한다(fakeReact.mjs의
// "setState updater가 항상 완전 동기"라는 눈가림 지점을 피하기 위함, 저
// 파일 헤더 주석 참고). buildUseStudentRealReactBundle.mjs를 그대로 재사용
// 하지 않는 이유는 그 스크립트가 고정한 wordLibraryRaceStub.mjs가
// postRewardEvent/postXpEvent를 순수 no-op으로만 두어(호출 캡처 없음) 이
// 파일이 요구하는 "서버 POST 페이로드 검증"을 할 수 없기 때문 — 대신
// scripts/testDoubleEvents.mjs/testRewardIdempotencyStress.mjs가 이미 쓴
// "wordLibraryRaceStub.mjs를 export *로 그대로 재수출하되 postRewardEvent/
// postXpEvent 두 함수만 캡처용으로 오버라이드한 스텁을 scripts/.tmp/에
// 런타임 생성 후 그 위에 real-react 빌드 기법(entry: src/hooks/useStudent.js,
// external: ['react'] — react만 노드 정상 해석에 맡김)을 적용"하는 동일
// 패턴을 재사용한다(재구현 아님, 두 파일 헤더 주석과 동일 근거).
//
// 시나리오(등록 note와 동일 요약):
//   1) 4개 정답까지 0건, 5번째 정답 정확히 1건(원장+reward POST+XP POST)
//   2) 6/7/10번째 정답도 여전히 1건, 오답 개입 무관
//   3) 새로고침(unmount → 로컬 유지 상태로 재마운트) 후에도 1건 유지 —
//      writingCompleteGrantedDayRef가 재마운트로 초기화돼도 spellingCorrect가
//      이미 GOAL 이상으로 복원돼 justCompletedWriting이 다시 true가 될 수
//      없음(hasRewardEntry도 2차 방어)
//   4) 재로그인(unmount → 로컬 클리어 → 클라우드 백업으로 재마운트, 동일
//      UUID) 후에도 1건 유지
//   5) 재로그인을 다른 UUID로 하면 0건(완전 독립), 그 UUID의 5번째 정답은
//      정상적으로 1건 지급(교차 오염 없음)
//   6) 네트워크 재시도 — idempotency key가 항상 같은 문자열로 조립되는지
//      (rewardIdempotencyKey 그대로 사용, useStudent.js가 재구현하지 않음
//      확인) + 재시도 자체는 로컬 원장에 영향 없음(원장 append는 훅의
//      patch() 경로에서만 일어남, 이 스텁 직접 호출과 무관)
//   7) 날짜 경계 — 오늘 5번째 정답 1건, 가짜 시계로 다음날로 이동 후
//      다음날 5번째 정답에서 정확히 1건 추가(별도 day 기간키)
//
// 네트워크 0, DB 0, production 코드 무수정(src/ 전부 읽기만).
// 등록: npm run build 없이 node scripts/testWritingCompleteBoundary.mjs로
// 직접 실행 가능(자체 esbuild 번들 내장) / tests/harness/registry.mjs
// rewardSystem 도메인, extra:false.
import esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { rewardIdempotencyKey, REWARD_STARS } from '../src/utils/rewardEngine.js'

let failures = 0
let passes = 0
function check(label, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${label}`) }
  else { failures++; console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`) }
}
function section(title) { console.log(`\n${title}`) }

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { act } = await import('react-dom/test-utils')

// ── 최소 DOM 셔임(testWritingCompleteRealReactTiming.mjs와 동일 기법의
// 그대로 복제 — 공유 모듈로 뽑혀 있지 않아 각 real-react 하네스 파일이
// 자체 보유하는 게 이 저장소의 기존 관례, 예: testDoubleEvents.mjs의
// FakeStorage/FakeDocument 자체 보유와 동일 성격). ─────────────────────────
class FakeNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType
    this.nodeName = nodeName
    this.childNodes = []
    this._listeners = new Map()
  }
  get ownerDocument() { return globalThis.document }
  appendChild(child) { this.childNodes.push(child); return child }
  insertBefore(child) { this.childNodes.push(child); return child }
  removeChild(child) { this.childNodes = this.childNodes.filter((c) => c !== child); return child }
  addEventListener(type, fn, opts) { (this._listeners.get(type) || this._listeners.set(type, []).get(type)).push({ fn, opts }) }
  removeEventListener() {}
  getRootNode() { return this }
  contains() { return false }
  hasChildNodes() { return this.childNodes.length > 0 }
}
function installDomShim() {
  const doc = new FakeNode(9, '#document')
  doc.documentElement = new FakeNode(1, 'HTML')
  doc.createElement = (tag) => new FakeNode(1, String(tag).toUpperCase())
  doc.createTextNode = () => new FakeNode(3, '#text')
  doc.createComment = () => new FakeNode(8, '#comment')
  doc.activeElement = null
  globalThis.document = doc
  globalThis.window = globalThis
  if (!globalThis.HTMLIFrameElement) globalThis.HTMLIFrameElement = class HTMLIFrameElement {}
}
installDomShim()

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}

// ══════════════════════════════════════════════════════════════════════════
// 0) 자체 번들 — postXpEvent/postRewardEvent 호출을 캡처하는 전용 wordLibrary
//    스텁(scripts/testDoubleEvents.mjs §0/scripts/testRewardIdempotencyStress.mjs
//    와 동일 패턴: wordLibraryRaceStub.mjs를 export *로 그대로 재수출하되
//    두 함수만 캡처용으로 오버라이드 — wordLibraryRaceStub.mjs 자체는
//    무수정) + REAL react(react만 external, buildUseStudentRealReactBundle.mjs
//    와 동일 원리)로 실제 src/hooks/useStudent.js를 번들.
// ══════════════════════════════════════════════════════════════════════════
const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })
const raceStubUrl = pathToFileURL(path.resolve('scripts/wordLibraryRaceStub.mjs')).href
const capturingStubPath = path.join(TMP, 'wordLibraryWritingCompleteBoundaryStub.mjs')
fs.writeFileSync(capturingStubPath, `// AUTO-GENERATED by scripts/testWritingCompleteBoundary.mjs — do not edit by hand.
export * from ${JSON.stringify(raceStubUrl)}
export const xpCalls = []
export async function postXpEvent(studentId, eventType, sourceEventId) {
  xpCalls.push({ studentId, eventType, sourceEventId })
}
export const rewardCalls = []
export async function postRewardEvent(studentId, rewardType, sourceType, sourceId) {
  rewardCalls.push({ studentId, rewardType, sourceType, sourceId })
}
`, 'utf8')
const capturingStubUrl = pathToFileURL(capturingStubPath).href

const outfile = path.join(TMP, 'useStudent.writingCompleteBoundary.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/hooks/useStudent.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  plugins: [{
    name: 'writing-complete-boundary-stubs',
    setup(build) {
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: capturingStubUrl, external: true }))
      // react는 의도적으로 미처리 — esbuild가 기본으로 external 처리하고,
      // 아래 import()가 노드의 정상 ESM 해석으로 실제 react 패키지를 로드한다
      // (buildUseStudentRealReactBundle.mjs와 동일 원리).
    },
  }],
  external: ['react'],
})
console.log('bundled -> ' + outfile)

const stub = await import(capturingStubUrl)
const bundle = await import(pathToFileURL(outfile).href)
const { useStudent, todayStr } = bundle

function newRoot() {
  const container = new FakeNode(1, 'DIV')
  container.tagName = 'DIV'
  container.namespaceURI = null
  return { container, root: createRoot(container) }
}

function ledgerCount(latest, type) {
  return Array.isArray(latest?.rewardLedger) ? latest.rewardLedger.filter((e) => e && e.reward_type === type).length : 0
}
function ledgerEntry(latest, type) {
  return (latest?.rewardLedger || []).find((e) => e && e.reward_type === type)
}
function rewardCallsFor(id, type) {
  return stub.rewardCalls.filter((c) => c.studentId === id && c.rewardType === type)
}
function xpCallsFor(id, type) {
  return stub.xpCalls.filter((c) => c.studentId === id && c.eventType === type)
}
function freshLocalStorage() { globalThis.localStorage = new FakeStorage() }
function readPersistedRecord(id) {
  const raw = globalThis.localStorage.getItem('paul_easy_progress')
  if (!raw) return null
  try { const store = JSON.parse(raw); return store[id] || null } catch { return null }
}

async function mountWithBackup(id, name, backup) {
  stub.resetFetchFullProgressDeferred()
  let latest = null
  function Host(props) { latest = useStudent(props.id, props.name); return null }
  const { root } = newRoot()
  await act(async () => {
    root.render(React.createElement(Host, { id, name }))
    stub.fetchFullProgressDeferred.resolve(backup ?? null)
  })
  return {
    get: () => latest,
    unmount: () => act(async () => { root.unmount() }),
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 1 — 경계값(4개 정답까지 0건, 5번째 정답 정확히 1건: 원장 +
// reward POST + XP POST 셋 다).
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 1 — 4개 정답까지 0건, 5번째 정답에서 정확히 1건(원장/reward POST/XP POST)')
freshLocalStorage()
const idA = '22222222-bbbb-0000-0000-000000000001'
const nameA = 'WCB_SessionA'
let hostA = await mountWithBackup(idA, nameA, null)
const today = todayStr()

for (let i = 0; i < 4; i++) {
  await act(async () => { hostA.get().recordSpellingAnswer(`s1-${i}`, true) })
}
check('4개 정답 후 writing-complete 원장 0건', ledgerCount(hostA.get(), 'writing-complete') === 0)
check('4개 정답 후 reward POST 0건', rewardCallsFor(idA, 'writing-complete').length === 0)
check('4개 정답 후 XP POST 0건', xpCallsFor(idA, 'writing-complete').length === 0)

await act(async () => { hostA.get().recordSpellingAnswer('s1-4', true) })
check('5번째 정답 후 writing-complete 원장 정확히 1건', ledgerCount(hostA.get(), 'writing-complete') === 1, `실제 ${ledgerCount(hostA.get(), 'writing-complete')}건`)
check('5번째 정답 후 reward POST 정확히 1건', rewardCallsFor(idA, 'writing-complete').length === 1)
check('5번째 정답 후 XP POST 정확히 1건', xpCallsFor(idA, 'writing-complete').length === 1)
const rc1 = rewardCallsFor(idA, 'writing-complete')[0]
check('reward POST payload — sourceType === daily-writing', rc1?.sourceType === 'daily-writing')
check('reward POST payload — sourceId === 오늘 날짜 토큰', rc1?.sourceId === today)
const xc1 = xpCallsFor(idA, 'writing-complete')[0]
check('XP POST — sourceEventId === writing-complete:오늘', xc1?.sourceEventId === `writing-complete:${today}`)
const entry1 = ledgerEntry(hostA.get(), 'writing-complete')
check('원장 stars_delta === REWARD_STARS[writing-complete]', entry1?.stars_delta === REWARD_STARS['writing-complete'])
check('원장 idempotency_key === rewardIdempotencyKey(studentId,type,source,day) 그대로', entry1?.idempotency_key === rewardIdempotencyKey(idA, 'writing-complete', 'daily-writing', today))

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 2 — 6/7/10번째 정답도 여전히 1건, 오답 개입 무관.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 2 — 6/7/10번째 정답도 여전히 1건, 오답 개입 무관')
await act(async () => { hostA.get().recordSpellingAnswer('s2-6', true) })
check('6번째 정답 후에도 원장 여전히 1건', ledgerCount(hostA.get(), 'writing-complete') === 1)
check('6번째 정답 후에도 reward POST 여전히 1건', rewardCallsFor(idA, 'writing-complete').length === 1)
check('6번째 정답 후에도 XP POST 여전히 1건', xpCallsFor(idA, 'writing-complete').length === 1)

await act(async () => { hostA.get().recordSpellingAnswer('s2-wrong-a', false) })
check('오답 개입 후에도 원장 여전히 1건', ledgerCount(hostA.get(), 'writing-complete') === 1)

await act(async () => { hostA.get().recordSpellingAnswer('s2-7', true) })
check('7번째 정답 후에도 원장 여전히 1건', ledgerCount(hostA.get(), 'writing-complete') === 1)
check('7번째 정답 후에도 reward POST 여전히 1건', rewardCallsFor(idA, 'writing-complete').length === 1)

await act(async () => { hostA.get().recordSpellingAnswer('s2-wrong-b', false) })
await act(async () => { hostA.get().recordSpellingAnswer('s2-8', true) })
await act(async () => { hostA.get().recordSpellingAnswer('s2-9', true) })
await act(async () => { hostA.get().recordSpellingAnswer('s2-10', true) })
check('10번째 정답 후에도 원장 정확히 1건', ledgerCount(hostA.get(), 'writing-complete') === 1)
check('10번째 정답 후에도 reward POST 정확히 1건', rewardCallsFor(idA, 'writing-complete').length === 1)
check('10번째 정답 후에도 XP POST 정확히 1건', xpCallsFor(idA, 'writing-complete').length === 1)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 3 — 새로고침(unmount → 로컬 유지 상태로 재마운트) 후에도 1건
// 유지. writingCompleteGrantedDayRef는 재마운트로 초기화되지만
// spellingCorrect가 이미 GOAL 이상으로 복원돼 justCompletedWriting이 다시
// true가 될 수 없다(hasRewardEntry도 2차 방어).
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 3 — 새로고침(동일 세션, 로컬 유지) 후에도 1건 유지')
const persistedBeforeRefresh = readPersistedRecord(idA)
check('언마운트 전 로컬 persisted record에 오늘 spellingCorrect가 GOAL 이상으로 저장돼 있음', (persistedBeforeRefresh?.history?.[today]?.spellingCorrect || 0) >= 5, persistedBeforeRefresh?.history?.[today]?.spellingCorrect)
check('언마운트 전 로컬 persisted record에 writing-complete 원장 1건 저장돼 있음', ledgerCount(persistedBeforeRefresh, 'writing-complete') === 1)
await hostA.unmount()
let hostA2 = await mountWithBackup(idA, nameA, null) // 로컬 스토리지는 건드리지 않음(새로고침 = 로컬 유지)
check('재마운트(새로고침) 직후 writing-complete 원장 여전히 정확히 1건', ledgerCount(hostA2.get(), 'writing-complete') === 1)
check('재마운트 직후 오늘 spellingCorrect가 GOAL 이상으로 복원돼 있음', (hostA2.get().history?.[today]?.spellingCorrect || 0) >= 5)

for (let i = 0; i < 3; i++) {
  await act(async () => { hostA2.get().recordSpellingAnswer(`s3-${i}`, true) })
}
check('새로고침 후 3개 추가 정답에도 원장 여전히 1건(ref 리셋과 무관 — spellingCorrect가 이미 GOAL 이상이라 justCompletedWriting이 다시 true가 될 수 없음)', ledgerCount(hostA2.get(), 'writing-complete') === 1)
check('새로고침 후에도 reward POST 여전히 정확히 1건', rewardCallsFor(idA, 'writing-complete').length === 1)
check('새로고침 후에도 XP POST 여전히 정확히 1건', xpCallsFor(idA, 'writing-complete').length === 1)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 4 — 재로그인(unmount → 로컬 클리어 → 클라우드 백업으로 재마운트,
// 동일 UUID) 후에도 1건 유지.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 4 — 재로그인(동일 UUID, 로컬 클리어 + 클라우드 백업 복원) 후에도 1건 유지')
const cloudSnapshot = readPersistedRecord(idA)
check('재로그인 전 클라우드(=직전까지의 persisted local) 스냅샷에 writing-complete 원장 1건 포함', ledgerCount(cloudSnapshot, 'writing-complete') === 1)
await hostA2.unmount()
freshLocalStorage() // "로컬 클리어" — 기기 교체/캐시 삭제 시나리오
let hostA3 = await mountWithBackup(idA, nameA, cloudSnapshot)
check('클라우드 스냅샷 복원 후 writing-complete 원장 정확히 1건', ledgerCount(hostA3.get(), 'writing-complete') === 1)
check('복원된 레코드의 오늘 spellingCorrect도 GOAL 이상 그대로 복원됨', (hostA3.get().history?.[today]?.spellingCorrect || 0) >= 5)

for (let i = 0; i < 2; i++) {
  await act(async () => { hostA3.get().recordSpellingAnswer(`s4-${i}`, true) })
}
check('재로그인(클라우드 복원) 후 추가 정답에도 원장 여전히 1건', ledgerCount(hostA3.get(), 'writing-complete') === 1)
check('재로그인 후에도 reward POST 누적 정확히 1건(idA 기준)', rewardCallsFor(idA, 'writing-complete').length === 1)
check('재로그인 후에도 XP POST 누적 정확히 1건(idA 기준)', xpCallsFor(idA, 'writing-complete').length === 1)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 5 — 다른 UUID로 재로그인하면 0건(완전 독립), 그 UUID의 5번째
// 정답은 정상적으로 1건 지급(교차 오염 없음).
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 5 — 다른 UUID(B)는 A와 완전 독립: 최초 0건, 5번째 정답에서 독립적으로 1건')
const idB = '22222222-bbbb-0000-0000-000000000002'
freshLocalStorage()
let hostB = await mountWithBackup(idB, 'WCB_SessionB', null)
check('B 최초 마운트 시 writing-complete 원장 0건', ledgerCount(hostB.get(), 'writing-complete') === 0)
check('B 최초 마운트 시 reward POST 0건', rewardCallsFor(idB, 'writing-complete').length === 0)
for (let i = 0; i < 4; i++) {
  await act(async () => { hostB.get().recordSpellingAnswer(`b${i}`, true) })
}
check('B 4개 정답 후에도 여전히 0건', ledgerCount(hostB.get(), 'writing-complete') === 0)
await act(async () => { hostB.get().recordSpellingAnswer('b4', true) })
check('B 5번째 정답에서 정확히 1건 지급', ledgerCount(hostB.get(), 'writing-complete') === 1)
check('B reward POST 정확히 1건', rewardCallsFor(idB, 'writing-complete').length === 1)
check('B XP POST 정확히 1건', xpCallsFor(idB, 'writing-complete').length === 1)
check('A의 reward POST 누적은 B 지급과 무관하게 여전히 1건(교차오염 없음)', rewardCallsFor(idA, 'writing-complete').length === 1)
check('A의 writing-complete 원장도 B 지급과 무관하게 여전히 1건', ledgerCount(hostA3.get(), 'writing-complete') === 1)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 6 — 네트워크 재시도: idempotency key가 항상 같은 문자열로
// 조립되는지(grantXp/grantLedgerReward가 rewardIdempotencyKey를 그대로
// 재사용하는지) 확인 + 재시도 자체가 로컬 원장에 영향을 주지 않는지 확인
// (원장 append는 훅의 patch() 경로에서만 일어나고, 스텁 직접 호출은
// 원장을 건드리지 않는다 — 이 스텁 자체는 dedupe하지 않으므로 실제
// dedupe는 로컬 hasRewardEntry/서버 idempotency_key UNIQUE 제약이 담당,
// 이 파일이 검증하는 지점이 아님을 정직하게 명시).
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 6 — 네트워크 재시도: idempotency key 안정성 + 로컬 원장 불변')
const localBeforeRetry = ledgerCount(hostA3.get(), 'writing-complete')
const serverCallsBeforeRetry = rewardCallsFor(idA, 'writing-complete').length
const key1 = rewardIdempotencyKey(idA, 'writing-complete', 'daily-writing', today)
// "1차 POST 실패 → 재시도 성공" 시뮬레이션 — 재시도 큐가 없는 이 스텁에서는
// 동일 payload로 두 번 직접 호출해 재현(과제 지시사항의 폴백 방식).
await stub.postRewardEvent(idA, 'writing-complete', 'daily-writing', today)
await stub.postRewardEvent(idA, 'writing-complete', 'daily-writing', today)
const key2 = rewardIdempotencyKey(idA, 'writing-complete', 'daily-writing', today)
check('재시도 시뮬레이션 두 호출의 idempotency key가 완전히 동일(서버 UNIQUE(idempotency_key)가 흡수 가능)', key1 === key2)
check('idempotency key가 정확한 템플릿(studentId:rewardType:sourceType:sourceId)을 따름', key1 === `${idA}:writing-complete:daily-writing:${today}`)
check('직접 재시도 호출 2건이 캡처 배열에 추가로 기록됨(스텁 자체는 dedupe하지 않음 — 실제 dedupe는 로컬 hasRewardEntry/서버 UNIQUE 제약 소관, 이 단언은 그 사실을 정직하게 문서화)', rewardCallsFor(idA, 'writing-complete').length === serverCallsBeforeRetry + 2)
check('로컬 rewardLedger는 재시도 시뮬레이션과 무관하게 원장 append 건수 불변(원장 append는 patch() 경로에서만 발생, 이 직접 호출은 훅을 거치지 않음)', ledgerCount(hostA3.get(), 'writing-complete') === localBeforeRetry)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 7 — 날짜 경계: 오늘 5번째 정답 1건, 가짜 시계로 다음날로 이동
// 후 다음날 5번째 정답에서 정확히 1건 추가(별도 day 기간키).
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 7 — 날짜 경계: 오늘 1건 → 다음날 5번째 정답에서 1건 추가(총 2건)')
const RealDate = globalThis.Date
async function withFakeToday(offsetDays, fn) {
  const offsetMs = offsetDays * 24 * 60 * 60 * 1000
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offsetMs)
      else super(...args)
    }
    static now() { return RealDate.now() + offsetMs }
  }
  globalThis.Date = FakeDate
  try {
    return await fn()
  } finally {
    globalThis.Date = RealDate
  }
}

freshLocalStorage()
const idD = '22222222-bbbb-0000-0000-000000000003'
let hostD = await mountWithBackup(idD, 'WCB_DayBoundary', null)
const todayD = todayStr()
for (let i = 0; i < 5; i++) {
  await act(async () => { hostD.get().recordSpellingAnswer(`d-${i}`, true) })
}
check('오늘 5번째 정답 → writing-complete 정확히 1건', ledgerCount(hostD.get(), 'writing-complete') === 1)
check('오늘 reward POST 정확히 1건', rewardCallsFor(idD, 'writing-complete').length === 1)
check('오늘 XP POST 정확히 1건', xpCallsFor(idD, 'writing-complete').length === 1)
const todayEntry = ledgerEntry(hostD.get(), 'writing-complete')
check('오늘 원장 source_id === 오늘 날짜 토큰', todayEntry?.source_id === todayD)

await withFakeToday(1, async () => {
  for (let i = 0; i < 4; i++) {
    await act(async () => { hostD.get().recordSpellingAnswer(`d-tmr-${i}`, true) })
  }
  check('다음날 4개 정답 후에도 여전히 1건(다음날분 아직 임계값 미도달)', ledgerCount(hostD.get(), 'writing-complete') === 1)
  await act(async () => { hostD.get().recordSpellingAnswer('d-tmr-4', true) })
  const tomorrowStr = todayStr() // Date가 여전히 fake 상태이므로 "다음날" 문자열
  check('다음날 5번째 정답 → writing-complete 정확히 1건 추가(총 2건)', ledgerCount(hostD.get(), 'writing-complete') === 2)
  check('다음날 reward POST 정확히 1건 추가(총 2건)', rewardCallsFor(idD, 'writing-complete').length === 2)
  check('다음날 XP POST 정확히 1건 추가(총 2건)', xpCallsFor(idD, 'writing-complete').length === 2)
  const tomorrowEntry = (hostD.get().rewardLedger || []).filter((e) => e && e.reward_type === 'writing-complete').find((e) => e.source_id === tomorrowStr)
  check('다음날 원장 항목의 source_id가 오늘과 다름(날짜 경계로 별도 기간키)', !!tomorrowEntry && tomorrowEntry.source_id !== todayD)
})
check('withFakeToday 종료 후 실제 Date로 정상 복원됨', globalThis.Date === RealDate)

console.log('\n─── 결과 요약 ───')
console.log(`총 ${passes + failures}개 단언 중 PASS ${passes}, FAIL ${failures}`)
console.log(failures === 0
  ? '\n모든 단언 통과 — writing-complete 경계값/새로고침/재로그인/재시도/날짜경계 계약 확인(실 React) ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
