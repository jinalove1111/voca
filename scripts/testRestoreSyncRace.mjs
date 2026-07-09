// 2026-07-10 안정성 수정 검증 — useStudent.js의 "클라우드 복구 vs 자동
// 동기화" 레이스 컨디션(신규기기 로그인 시 복구가 2초 디바운스보다
// 늦으면 빈 기록으로 클라우드 백업을 덮어쓰던 문제, restoreChecked로
// 수정)이 실제로 고쳐졌는지, 그리고 탭 숨김 시 즉시 flush가 동작하는지를
// "손으로 옮겨적은 로직 사본"이 아니라 실제 번들된 useStudent.js 코드로
// 직접 검증한다. React 없이 실행하기 위해 최소 hooks 런타임(fakeReact.mjs)
// + 수동 제어 가능한 fake clock을 사용.
//
// 실행 전 먼저 번들 필요(둘 다 external:true로 유지해야 함 — 안 그러면
// esbuild가 스텁을 번들에 인라인해버려서, 이 테스트 파일이 import하는
// syncCalls 배열과 번들 내부의 syncCalls가 서로 다른 인스턴스가 됨):
//   node scripts/buildRaceBundle.mjs
//   node scripts/testRestoreSyncRace.mjs
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
globalThis.localStorage = new FakeStorage()
globalThis.document = new FakeDocument()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}
const flush = () => new Promise((r) => process.nextTick(r))

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const { useStudent } = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)

console.log('\n시나리오 1: 신규기기 로그인(로컬 비어있음) — 클라우드 복구가 2초보다 느릴 때, 동기화가 먼저 발동해 빈 기록으로 백업을 덮어쓰지 않아야 함')
{
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  globalThis.localStorage = new FakeStorage() // 완전히 새 기기 시뮬레이션
  const clock = createFakeClock()
  const host = renderHook(() => useStudent('QA_Race_NewDevice'), clock)

  clock.advance(2000) // 원래 디바운스 타이머가 있었다면 여기서 발동했을 시점
  await flush()
  check('2초가 지나도 복구 전에는 sync가 호출되지 않음 (레이스 수정 확인)', raceStub.syncCalls.length === 0)

  // 이제 클라우드 복구 fetch가 (2초보다 늦게) 응답 — 진짜 백업 데이터
  raceStub.fetchFullProgressDeferred.resolve({
    studentId: 'QA_Race_NewDevice', totalStars: 42, stickers: ['a'], diaryPlacements: [],
    missions: [], cleared: [], round: { date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] },
    history: { [new Date().toDateString()]: { studied: true, categoriesCompleted: 2, giftsToday: 0, starsEarned: 5, stickersEarned: [], gamesPlayed: {}, quizCorrect: 0, quizTotal: 0, pronunciationAttempts: 0, missedWordIds: [], spellingCorrect: 0, spellingTotal: 0 } },
    milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 0, wordStatus: {},
  })
  await flush(); await flush(); await flush()

  check('복구 후 로컬 record에 반영됨 (totalStars === 42)', host.result.stars === 42)
  check('복구 직후에도 아직 sync는 안 쏨 (restoreChecked 반영 후 새로 스케줄된 타이머가 아직 안 끝남)', raceStub.syncCalls.length === 0)

  clock.advance(2000) // 복구 이후 다시 시작된 디바운스 타이머
  await flush()
  check('복구 완료 후에는 정상적으로 sync 발동', raceStub.syncCalls.length === 1)
  check('sync에 실린 fullRecord가 복구된(빈 값 아닌) 데이터 — 클라우드 백업이 빈 값으로 덮어써지지 않음',
    raceStub.syncCalls[0]?.fullRecord?.totalStars === 42)
}

console.log('\n시나리오 2: 기존 학생(로컬에 이미 데이터 있음) — 복구 대기 없이 정상 디바운스')
{
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  globalThis.localStorage = new FakeStorage()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({
    QA_Race_Existing: {
      studentId: 'QA_Race_Existing', totalStars: 10, stickers: [], diaryPlacements: [], missions: [], cleared: [],
      round: { date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] },
      history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 0, wordStatus: {},
    },
  }))
  const clock = createFakeClock()
  renderHook(() => useStudent('QA_Race_Existing'), clock)

  clock.advance(2000)
  await flush()
  check('기존 학생은 클라우드 복구를 기다리지 않고 2초 후 바로 sync', raceStub.syncCalls.length === 1)
  check('sync 데이터가 로컬 값과 일치 (totalStars === 10)', raceStub.syncCalls[0]?.totalStars === 10)
}

console.log('\n시나리오 3: 탭이 숨겨지면(visibilitychange hidden) 2초를 기다리지 않고 즉시 flush')
{
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  globalThis.localStorage = new FakeStorage()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({
    QA_Race_Hide: {
      studentId: 'QA_Race_Hide', totalStars: 7, stickers: [], diaryPlacements: [], missions: [], cleared: [],
      round: { date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] },
      history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 0, wordStatus: {},
    },
  }))
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  renderHook(() => useStudent('QA_Race_Hide'), clock)

  check('아직(0ms) sync 없음', raceStub.syncCalls.length === 0)
  globalThis.document.visibilityState = 'hidden'
  globalThis.document.dispatch('visibilitychange')
  await flush()
  check('탭 숨김 즉시(2초 기다리지 않고) sync 발동', raceStub.syncCalls.length === 1)
  check('flush된 데이터가 정확함 (totalStars === 7)', raceStub.syncCalls[0]?.totalStars === 7)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 실패 ❌`)
// useStudent.js의 자정 롤오버 체크(setInterval 30s)는 이 fakeClock이 아닌
// 진짜 Node 타이머라 프로세스가 안 끝나고 계속 떠 있음 — 테스트 자체는
// 이미 끝났으므로 성공/실패 여부와 무관하게 명시적으로 종료.
process.exit(failures > 0 ? 1 : 0)
