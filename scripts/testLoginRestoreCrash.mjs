// P0(2026-07-17) 프로덕션 크래시 회귀 테스트 — "PIN 초기화/재설정 후
// 재로그인 직후 TypeError: Cannot read properties of undefined (reading
// 'forEach')".
//
// 크래시 지점: App.jsx:154 `spellingWrongToday.forEach(...)` (reviewWordIds
// useMemo). undefined의 출처: useStudent.js가 반환하는 spellingWrongToday
// = record.round.spellingWrongToday — 옛 스키마(2026-07-07 쓰기시험 기능
// 이전에 만들어진 round 객체)에는 이 필드가 없다. 그런 round는 두 경로로
// 지금도 유입된다:
//   1) 클라우드 백업 blob(student_progress.progress_data) — 옛 앱 버전이
//      업로드한 뒤 그 학생이 재동기화하지 못한 경우(크래시 자체가
//      재동기화를 막아 blob이 영영 옛 스키마로 남는 악순환).
//   2) 이 기기에 남아있던 이름 키 로컬 레코드 — v1.6 identity 마이그레이션
//      (loadRecord 경로 2)이 스키마 정규화 없이 그대로 복사.
// PIN 초기화/재설정된 학생 = 강제로 재로그인하는 학생 = 정확히 이 두
// 복원/마이그레이션 경로를 타는 학생이라 재현율이 높았다.
//
// 검증 방식: testRestoreSyncRace.mjs와 동일 — 실제 useStudent.js 번들
// (buildRaceBundle.mjs, react/wordLibrary만 스텁) + fakeReact 훅 런타임.
// App.jsx:152-156 / Dashboard.jsx:214,218의 실제 소비 코드를 그대로
// 시뮬레이션해서 "로그인 직후 첫 렌더"가 크래시 없이 지나가는지 본다.
//
// 실행:
//   node scripts/buildRaceBundle.mjs
//   node scripts/testLoginRestoreCrash.mjs
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
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${extra ? `\n        ${extra}` : ''}`); failures++ }
}
const flush = () => new Promise((r) => process.nextTick(r))
const today = () => new Date().toDateString()

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const { useStudent } = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)

// App.jsx:152-156(reviewWordIds useMemo — 실제 크래시 라인) +
// Dashboard.jsx:214,218 + App.jsx:158(filterWordsByScope 인자) —
// 로그인 직후 첫 렌더가 record에서 실제로 읽는 것들을 그대로 실행.
function simulateFirstRender(result) {
  const ids = new Set(result.missions.filter((m) => !m.done).map((m) => m.wordId))
  result.spellingWrongToday.forEach((id) => ids.add(id)) // ← App.jsx:154 크래시 라인
  void result.cleared.length
  void result.stickerTypes.length
  void result.diaryPlacements.length
  void Object.keys(result.wordStatus || {}).length
  return ids
}

// 로그인 직후 렌더 + 소비를 try/catch로 감싸 크래시를 잡는다. fakeReact의
// setState는 동기 재렌더라, 복원 patch로 인한 크래시가 프로덕션(React의
// 다음 렌더에서 폭발)과 달리 .then 안에서 삼켜질 수 있으므로 — 명시적
// rerender로 프로덕션의 "복원 반영 후 첫 렌더"를 재현한다.
function renderAndConsume(host) {
  try {
    host.rerender()
    simulateFirstRender(host.result)
    return null
  } catch (e) {
    return e
  }
}

// 2026-07-07(쓰기시험) 이전 스키마의 round — spellingWrongToday/spellingCombo 없음
const oldSchemaRound = (date) => ({
  date, wordsViewed: ['w1'], examplesHeard: 2, quizSolved: 1, pronunciationOk: 1,
})
// v1.4 백업 도입(07-09) 직후, v1.5 wordStatus(07-09 이후) 이전 스키마의 blob
const oldSchemaBlob = (id) => ({
  studentId: id,
  totalStars: 120,
  stickers: ['heart1', 'star1'],
  diaryPlacements: [{ placementId: 'p1', stickerId: 'heart1', x: 10, y: 20, rotation: 0, scale: 1 }],
  missions: [{ wordId: 'w9', correctCount: 1, done: false }],
  cleared: ['w2', 'w3'],
  round: oldSchemaRound(today()), // 오늘 날짜지만 옛 스키마 (spellingWrongToday 없음!)
  history: {
    'Tue Jul 01 2026': { studied: true, categoriesCompleted: 4, giftsToday: 1, starsEarned: 15, stickersEarned: ['heart1'], gamesPlayed: { balloon: 1 }, quizCorrect: 3, quizTotal: 4, pronunciationAttempts: 2, missedWordIds: ['w2'] },
  },
  milestoneStreak: 0,
  starBadgeThreshold: 100, // 120별인데 이미 100뱃지 받은 상태 — 테스트 노이즈(뱃지 지급) 방지
  lastGamePlayed: 'balloon',
  lastWordIndex: 3,
  // wordStatus 없음 (v1.5 이전 blob)
})

console.log('\n[1] P0 재현 — PIN 초기화 후 새 기기/빈 로컬에서 재로그인 → 옛 스키마 클라우드 백업 복원')
{
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  globalThis.localStorage = new FakeStorage()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent('11111111-1111-4111-8111-111111111111'), clock)

  const preErr = renderAndConsume(host)
  check('복원 전(freshRecord 상태) 첫 렌더는 크래시 없음', preErr === null, preErr?.stack)

  raceStub.fetchFullProgressDeferred.resolve(oldSchemaBlob('11111111-1111-4111-8111-111111111111'))
  await flush(); await flush(); await flush()

  const err = renderAndConsume(host)
  check('옛 스키마 백업 복원 직후 렌더가 크래시 없음 (기존엔 여기서 forEach TypeError)', err === null, err?.stack)
  check('복원된 별 보존 (totalStars 120)', host.result.stars === 120)
  check('스티커 보존 (2개)', host.result.stickerTypes.length === 2)
  check('캘린더(history) 보존', !!host.result.history['Tue Jul 01 2026'])
  check('다이어리 배치 보존', host.result.diaryPlacements.length === 1)
  check('오늘 round 진행값 보존 (wordsViewed 1)', host.result.round.wordsViewed.length === 1)
  check('spellingWrongToday가 배열로 정규화됨', Array.isArray(host.result.spellingWrongToday))
  check('wordStatus가 객체로 정규화됨', host.result.wordStatus && typeof host.result.wordStatus === 'object')
}

console.log('\n[2] P0 재현 — 같은 기기 이름 키 레거시 레코드(v1.6 마이그레이션 경로)가 옛 스키마일 때')
{
  raceStub.resetFetchFullProgressDeferred()
  globalThis.localStorage = new FakeStorage()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({
    '김철수': { ...oldSchemaBlob('legacy'), studentId: '김철수' },
  }))
  const clock = createFakeClock()
  let host, syncErr = null
  try {
    host = renderHook(() => useStudent('22222222-2222-4222-8222-222222222222', '김철수'), clock)
  } catch (e) { syncErr = e }
  check('이름 키 → id 키 마이그레이션 마운트가 크래시 없음', syncErr === null, syncErr?.stack)
  if (host) {
    const err = renderAndConsume(host)
    check('마이그레이션 직후 첫 렌더 소비가 크래시 없음', err === null, err?.stack)
    check('별 보존 (120)', host.result.stars === 120)
    check('캘린더 보존', !!host.result.history['Tue Jul 01 2026'])
    const store = JSON.parse(globalThis.localStorage.getItem('paul_easy_progress'))
    check('원본 이름 키 레코드는 삭제되지 않음', !!store['김철수'])
    check('id 키 레코드가 정규화되어 저장됨', Array.isArray(store['22222222-2222-4222-8222-222222222222']?.round?.spellingWrongToday))
  }
}

console.log('\n[3] 완전 신규 학생 — 백업 없음(null) = 정상 상태')
{
  raceStub.resetFetchFullProgressDeferred()
  globalThis.localStorage = new FakeStorage()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent('33333333-3333-4333-8333-333333333333'), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  await flush(); await flush(); await flush()
  const err = renderAndConsume(host)
  check('백업 없음 → freshRecord로 크래시 없음', err === null, err?.stack)
  check('별 0, 스티커 0', host.result.stars === 0 && host.result.stickerTypes.length === 0)
}

console.log('\n[4] 부분/손상 blob — 최상위 배열 필드가 통째로 없음')
{
  raceStub.resetFetchFullProgressDeferred()
  globalThis.localStorage = new FakeStorage()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent('44444444-4444-4444-8444-444444444444'), clock)
  raceStub.fetchFullProgressDeferred.resolve({
    studentId: '44444444-4444-4444-8444-444444444444',
    totalStars: 7,
    // stickers/missions/cleared/diaryPlacements/history/round/wordStatus 전부 없음
  })
  await flush(); await flush(); await flush()
  const err = renderAndConsume(host)
  check('배열 필드 전부 누락된 blob도 크래시 없음', err === null, err?.stack)
  check('별은 보존 (7)', host.result.stars === 7)
  check('missions/cleared/stickers 배열 정규화', Array.isArray(host.result.missions) && Array.isArray(host.result.cleared) && Array.isArray(host.result.stickerTypes))
}

console.log('\n[5] 기록 많은 학생 — 현행 스키마 blob 복원 시 전 필드 보존')
{
  raceStub.resetFetchFullProgressDeferred()
  globalThis.localStorage = new FakeStorage()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent('55555555-5555-4555-8555-555555555555'), clock)
  const blob = {
    ...oldSchemaBlob('55555555-5555-4555-8555-555555555555'),
    round: { date: today(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: ['w7'], spellingCombo: 2 },
    wordStatus: { dbid1: 'known', dbid2: 'unknown' },
  }
  raceStub.fetchFullProgressDeferred.resolve(blob)
  await flush(); await flush(); await flush()
  const err = renderAndConsume(host)
  check('현행 스키마 blob 크래시 없음', err === null, err?.stack)
  check('오답노트 큐 보존', host.result.spellingWrongToday.length === 1 && host.result.spellingWrongToday[0] === 'w7')
  check('콤보 보존 (2)', host.result.spellingCombo === 2)
  check('wordStatus 보존', host.result.wordStatus.dbid1 === 'known' && host.result.wordStatus.dbid2 === 'unknown')
  check('별/스티커/캘린더/다이어리 보존', host.result.stars === 120 && host.result.stickerTypes.length === 2 && !!host.result.history['Tue Jul 01 2026'] && host.result.diaryPlacements.length === 1)
}

console.log('\n[6] stale 날짜 round의 blob — round만 자정 롤오버 의미로 리셋, 누적 데이터는 보존')
{
  raceStub.resetFetchFullProgressDeferred()
  globalThis.localStorage = new FakeStorage()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent('66666666-6666-4666-8666-666666666666'), clock)
  raceStub.fetchFullProgressDeferred.resolve({
    ...oldSchemaBlob('66666666-6666-4666-8666-666666666666'),
    round: oldSchemaRound('Wed Jul 01 2026'), // 옛 스키마 + 지난 날짜
  })
  await flush(); await flush(); await flush()
  const err = renderAndConsume(host)
  check('지난 날짜 옛 스키마 round도 크래시 없음', err === null, err?.stack)
  check('round는 오늘 기준으로 리셋됨 (지난 진행은 오늘로 계산 안 됨)', host.result.round.date === today() && host.result.round.wordsViewed.length === 0)
  check('누적 데이터(별/캘린더)는 보존', host.result.stars === 120 && !!host.result.history['Tue Jul 01 2026'])
}

console.log('\n[7] 로딩 게이트 — restoreChecked가 훅에서 노출되고, 복원 완료 후 true')
{
  raceStub.resetFetchFullProgressDeferred()
  globalThis.localStorage = new FakeStorage()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent('77777777-7777-4777-8777-777777777777'), clock)
  check('빈 로컬 로그인 직후에는 restoreChecked === false (Dashboard 렌더 보류)', host.result.restoreChecked === false)
  raceStub.fetchFullProgressDeferred.resolve(oldSchemaBlob('77777777-7777-4777-8777-777777777777'))
  await flush(); await flush(); await flush()
  check('복원 완료 후 restoreChecked === true', host.result.restoreChecked === true)
}
{
  raceStub.resetFetchFullProgressDeferred()
  globalThis.localStorage = new FakeStorage()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({
    '88888888-8888-4888-8888-888888888888': { ...oldSchemaBlob('88888888-8888-4888-8888-888888888888') },
  }))
  const clock = createFakeClock()
  const host = renderHook(() => useStudent('88888888-8888-4888-8888-888888888888'), clock)
  check('로컬에 데이터 있는 학생은 처음부터 restoreChecked === true (대기 없음)', host.result.restoreChecked === true)
}

console.log('\n[8] 이미 id 키로 저장된 옛 스키마 레코드(과거 마이그레이션 잔재) — 마운트 시 정규화')
{
  raceStub.resetFetchFullProgressDeferred()
  globalThis.localStorage = new FakeStorage()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({
    '99999999-9999-4999-8999-999999999999': { ...oldSchemaBlob('99999999-9999-4999-8999-999999999999') },
  }))
  const clock = createFakeClock()
  let host, mountErr = null
  try {
    host = renderHook(() => useStudent('99999999-9999-4999-8999-999999999999'), clock)
  } catch (e) { mountErr = e }
  check('옛 스키마 id 키 레코드 마운트 크래시 없음', mountErr === null, mountErr?.stack)
  if (host) {
    const err = renderAndConsume(host)
    check('첫 렌더 소비 크래시 없음', err === null, err?.stack)
    check('별/스티커/캘린더 보존', host.result.stars === 120 && host.result.stickerTypes.length === 2 && !!host.result.history['Tue Jul 01 2026'])
  }
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
