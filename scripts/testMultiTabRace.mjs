// Phase 1 영속성 감사(2026-07-18) — "다중 탭"(같은 기기, 같은 학생, 두 탭이
// 동시에 씀)과 "중복 요청"(2초 디바운스 동기화가 연타/빠른 조작 중 중첩
// 호출되는지) 시나리오를 실제 번들된 useStudent.js 코드로 검증한다. 실행
// 전 먼저 번들 필요:
//   node scripts/buildMultiTabBundle.mjs
//   node scripts/testMultiTabRace.mjs
import { pathToFileURL } from 'node:url'
import { createFakeClock, renderHook } from './fakeReact.mjs'

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

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}
const flush = () => new Promise((r) => process.nextTick(r))

const stub = await import(pathToFileURL('scripts/wordLibraryMultiTabStub.mjs').href)
const { useStudent } = await import(pathToFileURL('scripts/.tmp/useStudent.multitab.bundle.mjs').href)

function baseRecord(id, stars) {
  return {
    studentId: id, totalStars: stars, stickers: [], diaryPlacements: [], missions: [], cleared: [],
    round: { date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] },
    history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 0, wordStatus: {},
  }
}

console.log('\n시나리오 1 (다중 탭): 같은 기기 두 탭이 같은 학생 레코드를 거의 동시에 씀 — localStorage 레이어에 storage 이벤트 리스너가 없어 나중에 쓰는 탭이 먼저 쓴 탭의 로컬 변경을 덮어쓰는지 확인')
{
  stub.resetFetchFullProgressDeferred()
  stub.syncCalls.length = 0
  stub.resetPendingStrictReads()
  const shared = new FakeStorage() // 두 탭이 공유하는 "같은 기기"의 localStorage
  shared.setItem('paul_easy_progress', JSON.stringify({ QA_MultiTab: baseRecord('QA_MultiTab', 10) }))
  globalThis.localStorage = shared
  globalThis.document = new FakeDocument()

  const clockA = createFakeClock()
  const tabA = renderHook(() => useStudent('QA_MultiTab'), clockA)
  const clockB = createFakeClock()
  const tabB = renderHook(() => useStudent('QA_MultiTab'), clockB)

  check('두 탭 모두 마운트 시 같은 초기값을 읽음 (10)', tabA.result.stars === 10 && tabB.result.stars === 10)

  // 탭 A에서 별 +5 (사용자가 탭 A에서 학습 중)
  tabA.result.addStars(5)
  const storedAfterA = JSON.parse(shared.getItem('paul_easy_progress'))
  check('탭 A 저장 직후 localStorage에 반영됨 (15)', storedAfterA.QA_MultiTab.totalStars === 15)

  // 탭 B는 탭 A의 변경을 모른 채(스토리지 이벤트 리스너 없음) 자기 메모리
  // 상태(10) 기준으로 별 +3 — 실제 두 탭을 빠르게 오가며 조작하는 사용자를
  // 시뮬레이션.
  check('탭 B는 탭 A의 변경을 자기 화면에 반영하지 못함(리스너 없음, 여전히 10)', tabB.result.stars === 10)
  tabB.result.addStars(3)
  const storedAfterB = JSON.parse(shared.getItem('paul_easy_progress'))
  check(
    '[다중 탭 발견] 탭 B의 저장이 탭 A의 +5를 덮어씀 — localStorage는 13(=10+3)이 되고 탭 A의 +5(15)는 로컬에서 사라짐',
    storedAfterB.QA_MultiTab.totalStars === 13
  )

  // 자기 힐링 경로: 그래도 각 탭은 "자기 메모리 상의 record"를 기준으로
  // 독립적으로 클라우드 동기화하므로(탭 B의 localStorage 덮어쓰기와 무관),
  // 두 탭이 각자 정상적으로 동기화를 마치면 클라우드에는 결국 양쪽 진행분이
  // 다 반영된다 — 이게 유일한 안전망이라는 걸 같이 확인.
  clockA.advance(2000); await flush()
  clockB.advance(2000); await flush()
  const readIdx = { A: null, B: null }
  // 두 탭의 read 순서는 호출 순서(A 먼저 advance)와 같다고 가정 가능 —
  // 각자 자기 backup read를 기다리는 중.
  check('두 탭 모두 각자 백업 read를 기다리는 중 (pending 2건)', stub.pendingStrictReadCount() === 2)
  stub.resolveStrictRead(0, null) // 탭 A의 read: 클라우드에 아직 아무도 안 올림
  await flush(); await flush()
  stub.resolveStrictRead(1, null) // 탭 B의 read
  await flush(); await flush()
  const uploaded = stub.syncCalls.map(c => c.totalStars).sort((a, b) => a - b)
  check(
    '[자기 힐링] 두 탭이 각자 자기 메모리 기준으로 업로드 — 탭 A는 15, 탭 B는 13을 각각 올림 (다음 로그인의 병합 복원이 최종적으로 max=15로 수렴시킴)',
    uploaded.length === 2 && uploaded[0] === 13 && uploaded[1] === 15
  )
}

console.log('\n시나리오 2 (연타/빠른 조작): 한 탭에서 2초 안에 여러 번 조작해도 디바운스 타이머가 매번 리셋되어 대기 중 sync 호출이 중첩 스케줄되지 않아야 함')
{
  stub.resetFetchFullProgressDeferred()
  stub.syncCalls.length = 0
  stub.resetPendingStrictReads()
  const storage = new FakeStorage()
  // stars=1(0이 아닌 값)로 시작 — isEmptyRecord()가 0이면 "빈 레코드"로 보고
  // restoreChecked가 클라우드 복구(or 5초 타임아웃)를 기다리게 되어 이
  // 시나리오가 검증하려는 디바운스 타이머 자체가 지연되므로 피한다.
  storage.setItem('paul_easy_progress', JSON.stringify({ QA_RapidFire: baseRecord('QA_RapidFire', 1) }))
  globalThis.localStorage = storage
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  const tab = renderHook(() => useStudent('QA_RapidFire'), clock)

  // 마운트 시 이미 타이머 1개 스케줄됨. 1.9초 뒤(타이머 발동 전) 연타 5회.
  clock.advance(1900)
  for (let i = 0; i < 5; i++) { tab.result.addStars(1); clock.advance(100) } // 매번 리셋되어 계속 2초 뒤로 밀림
  check('연타 중에는 아직 sync가 발동하지 않음(계속 리셋됨)', stub.pendingStrictReadCount() === 0)
  clock.advance(2000) // 마지막 조작 이후 조용해진 뒤 2초
  await flush()
  check('조용해진 뒤 정확히 1개의 read만 대기(중첩 스케줄 없음)', stub.pendingStrictReadCount() === 1)
  stub.resolveStrictRead(0, null)
  await flush(); await flush()
  check('sync 호출도 정확히 1회, 최종 누적값 반영(1+5=6)', stub.syncCalls.length === 1 && stub.syncCalls[0].totalStars === 6)
}

console.log('\n시나리오 3 (중복 업로드 순서 뒤바뀜 — P1 수정 검증): 디바운스가 두 번 연속 발동해 두 개의 doSync가 겹칠 때, 먼저 시작한(오래된) 호출의 네트워크 응답이 나중에 시작한 호출보다 늦게 도착해도 stale 값으로 최신 업로드를 덮어쓰지 않아야 함')
{
  stub.resetFetchFullProgressDeferred()
  stub.syncCalls.length = 0
  stub.resetPendingStrictReads()
  const storage = new FakeStorage()
  storage.setItem('paul_easy_progress', JSON.stringify({ QA_Overlap: baseRecord('QA_Overlap', 5) }))
  globalThis.localStorage = storage
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  const tab = renderHook(() => useStudent('QA_Overlap'), clock)

  // 마운트로 스케줄된 첫 타이머(2000ms) 발동 — doSync #1 시작(local=5 스냅샷),
  // read는 아직 응답 안 함(네트워크 느림).
  clock.advance(2000)
  await flush()
  check('doSync #1이 read를 기다리는 중 (local=5 스냅샷)', stub.pendingStrictReadCount() === 1)

  // read #1이 대기하는 동안 사용자가 계속 조작 → record 변경 → 새 타이머 스케줄
  tab.result.addStars(2) // local = 7
  clock.advance(2000) // 새 타이머(4000ms 시점) 발동 — doSync #2 시작(local=7 스냅샷)
  await flush()
  check('doSync #2도 read를 기다리는 중 (local=7 스냅샷, #1과 동시 진행 중)', stub.pendingStrictReadCount() === 2)

  // 네트워크 응답 순서가 뒤바뀜: 나중에 시작한 #2가 먼저 도착 → 업로드(7)
  stub.resolveStrictRead(1, null)
  await flush(); await flush()
  check('#2(최신) 업로드 완료', stub.syncCalls.length === 1 && stub.syncCalls[0].totalStars === 7)

  // 그 다음 오래된 #1의 응답이 뒤늦게 도착 — 수정 전이면 stale(5)로 덮어썼음
  stub.resolveStrictRead(0, null)
  await flush(); await flush()
  check(
    '[P1 수정 확인] #1(오래된, stale)은 자신이 추월당했음을 감지하고 업로드를 포기 — 총 업로드 횟수 여전히 1회, 클라우드에 stale(5)로 덮어쓰기 없음',
    stub.syncCalls.length === 1 && stub.syncCalls[0].totalStars === 7
  )
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
