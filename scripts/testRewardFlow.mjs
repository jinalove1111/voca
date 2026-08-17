// scripts/testRewardFlow.mjs
//
// Reward System V1 — Phase 2(2026-08-15) 통합 테스트. 1단계에서 완성된
// 순수 모듈 rewardEngine.js(수정 금지, scripts/testRewardEngine.mjs가 그
// 계약 63단언을 고정)를 src/hooks/useStudent.js에 배선한 결과를 실제
// 학습 함수 호출 경로로 검증한다 — rewardEngine.js의 함수를 직접 호출해
// "규칙이 맞다"만 확인하는 게 아니라, markWordCompleted/recordSpellingAnswer/
// recordExamCompleted 등 진짜 사용자 액션 경로를 통해 "실제로 별이 지급
// 되는가"까지 끝까지 확인한다.
//
// 구동 방식은 scripts/testStarDeltaOnEntry.mjs와 완전히 동일(새 테스트
// 프레임워크 발명 없음) — fakeReact.mjs의 최소 hooks 런타임 + fake clock
// 으로 실제 번들된 src/hooks/useStudent.js(scripts/buildRaceBundle.mjs
// 산출물, scripts/.tmp/useStudent.race.bundle.mjs)를 그대로 구동한다.
// 네트워크 0, DB 접근 0(scripts/wordLibraryRaceStub.mjs가 클라우드
// fetch/sync를 전부 스텁).
//
// CLAUDE.md 규칙 15 — 이 파일은 배선 전(rewardLedger 스키마 필드/병합/
// normalize만 있고 grantLedgerReward와 앵커 5개가 아직 연결되지 않은
// 상태)에 먼저 실행해 실제로 FAIL하는지 실측했다: 55단언 중 30개 FAIL
// (테스트 1/2/3/5/6/7/8/9/10 — word-session-complete/writing-complete/
// exam-complete/wrong-word-recovered/daily-goal-complete/streak-bonus/
// Level Up 전부 미배선 상태이므로 예상대로 FAIL, 테스트 4/11/12는 그
// 성질상 배선 전에도 우연히 PASS — 4는 "두 번 다 0"이라 동일값 비교가
// 성립, 11/12는 순수 스키마 병합/정규화만 검증). 그 다음 useStudent.js에
// grantLedgerReward + 앵커 5개를 배선하고 이 파일을 다시 돌려 55/55
// 전부 PASS로 전환했다(중간에 word-session-complete 계열 4건이 fakeReact.mjs
// 특유의 "useEffect 안에서 patch()가 재렌더를 유발하면 그 result가 outer
// run()의 stale 캡처에 가려짐" 현상으로 한 차례 더 FAIL했었고, settle()
// 헬퍼로 실제 원인을 확인 후 우회했다 — 아래 settle() 주석 참고, 실제
// production 코드/localStorage는 그 시점에도 항상 정확했음).
//
//   npm run verify:reward
// (내부적으로 scripts/testRewardEngine.mjs + scripts/buildRaceBundle.mjs를
// 먼저 실행한다.)
//
// 사전 준비(단독 node 실행 시): node scripts/buildRaceBundle.mjs
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
let asserted = 0
const scenarioFailures = {}
let currentScenario = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else {
    console.log(`  FAIL  ${label}`)
    failures++
    scenarioFailures[currentScenario] = (scenarioFailures[currentScenario] || 0) + 1
  }
}
const flush = () => new Promise((r) => process.nextTick(r))

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const bundle = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)
const { useStudent, mergeProgressRecords, normalizeRecord, todayStr } = bundle

function freshEnv() {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
}

function mountFresh(id, name) {
  freshEnv()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id, name), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return { host, clock }
}

function mountSeeded(id, name, seedRecord) {
  freshEnv()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({ [id]: seedRecord }))
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id, name), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return { host, clock }
}

// fakeReact.mjs의 run()은 hookFn()의 반환값을 커밋(effect 실행) "전"에
// 캡처한다(주석 "Commit phase must run BEFORE..." 참고) — 그래서 어떤
// useEffect 안에서 patch()가 또 다른 동기 재렌더를 유발하면(Reward System
// V1 앵커 중 word-session-complete/daily-goal-complete/streak-bonus처럼
// useEffect 안에서 grantLedgerReward를 호출하는 경우), 그 재렌더가 만든
// 최신 상태가 이 run() 호출 자체가 반환하는 stale한 result에는 반영되지
// 않을 수 있다(밑바탕 상태/localStorage는 항상 정확 — patch()가 매번
// saveStore를 동기 호출하므로, 어긋나는 건 host.result 스냅샷 뿐). 실제
// 프로덕션 React에는 없는 이 테스트 더블 특유의 한계이고,
// testLoginRestoreCrash.mjs가 이미 같은 이유로 host.rerender()를 명시
// 호출해 우회하는 것과 동일한 기법 — settle()은 그 관례를 재사용한다.
function settle(host) {
  host.rerender()
  return host
}

function ledgerArr(host) {
  return Array.isArray(host.result.rewardLedger) ? host.result.rewardLedger : []
}
function ledgerCount(host, rewardType, sourceIdPredicate) {
  return ledgerArr(host).filter((e) => e && e.reward_type === rewardType && (!sourceIdPredicate || sourceIdPredicate(e.source_id))).length
}

function completeFullRound(host, { wordSuffix, examples, quizzes, pron }) {
  for (let i = 0; i < 5; i++) host.result.markWordViewed(`${wordSuffix}-v${i}`)
  for (let i = 0; i < examples; i++) host.result.markExampleHeard()
  for (let i = 0; i < quizzes; i++) host.result.markQuizSolved()
  for (let i = 0; i < pron; i++) host.result.markPronunciationOk(`${wordSuffix}-p${i}`)
}

// ── 테스트 1 — 신규 학생 마운트 + 학습 0회 → rewardLedger 0건, totalStars 0 ──
currentScenario = 1
console.log('\n테스트 1 — 신규 학생 마운트 + 학습 0회 → rewardLedger 0건, totalStars 0 (진입 지급 없음)')
{
  const { host } = mountFresh('11111111-0000-0000-0000-000000000001', 'QA_Reward_Fresh')
  await flush(); await flush(); await flush()
  check('rewardLedger 0건', Array.isArray(host.result.rewardLedger) && host.result.rewardLedger.length === 0)
  check('totalStars === 0', host.result.stars === 0)
}

// ── 테스트 2 — 단어 세션 완료(중복 발화 포함) → word-session-complete 1건, +1 ──
currentScenario = 2
console.log('\n테스트 2 — 단어 세션 완료(같은 날 효과 중복 발화 포함) → word-session-complete 정확히 1건, +1')
{
  const { host } = mountFresh('11111111-0000-0000-0000-000000000002', 'QA_Reward_WordSession')
  await flush(); await flush(); await flush()
  const before = host.result.stars
  host.result.markWordCompleted('w1')
  host.result.markWordCompleted('w2')
  host.result.markWordCompleted('w3')
  host.result.markWordCompleted('w4')
  host.result.markWordCompleted('w5') // round.completedToday.length === GOAL(5) — 여기서 지급
  host.result.markWordCompleted('w6') // 중복 발화(완료 조건 유지 상태에서 효과 재평가) — 재지급 없어야 함
  check('word-session-complete 정확히 1건', ledgerCount(host, 'word-session-complete') === 1)
  check('totalStars === before + 1', host.result.stars === before + 1)
}

// ── 테스트 3 — 리마운트(refresh) 후 같은 조건 재발화 → 추가 지급 0 ──
currentScenario = 3
console.log('\n테스트 3 — 리마운트(refresh 시뮬레이션) 후 같은 조건 재발화 → 추가 지급 0')
{
  const ID = '11111111-0000-0000-0000-000000000003'
  const NAME = 'QA_Reward_Remount'
  const { host } = mountFresh(ID, NAME)
  await flush(); await flush(); await flush()
  const before = host.result.stars
  for (let i = 0; i < 5; i++) host.result.markWordCompleted(`m${i}`)
  settle(host) // word-session-complete는 useEffect 안에서 지급됨(위 settle() 주석)
  const afterFirst = host.result.stars
  check('첫 마운트 — word-session-complete 1건', ledgerCount(host, 'word-session-complete') === 1)
  check('첫 마운트 — +1', afterFirst === before + 1)

  // 언마운트 없이 "재마운트" = 같은(공유) localStorage 위에서 완전히 새
  // 렌더 트리를 만든다(App.jsx가 학생이 바뀔 때 하는 것과 동일한 종류의
  // 재마운트, testStarDeltaOnEntry.mjs 시나리오 ③과 동일 패턴).
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  const clock2 = createFakeClock()
  const host2 = renderHook(() => useStudent(ID, NAME), clock2)
  raceStub.fetchFullProgressDeferred.resolve(null)
  await flush(); await flush(); await flush()
  check('리마운트 직후 word-session-complete 여전히 1건(추가 없음)', ledgerCount(host2, 'word-session-complete') === 1)
  check('리마운트 후 totalStars 변화 없음', host2.result.stars === afterFirst)
}

// ── 테스트 4 — 같은 UUID 재로그인(localStorage 재로드) → 추가 지급 0 ──
currentScenario = 4
console.log('\n테스트 4 — 같은 UUID 재로그인(localStorage에서 레코드 재로드) → 추가 지급 0')
{
  const ID = '11111111-0000-0000-0000-000000000004'
  const NAME = 'QA_Reward_Relogin'
  const { host } = mountFresh(ID, NAME)
  await flush(); await flush(); await flush()
  for (let i = 0; i < 5; i++) host.result.markWordCompleted(`r${i}`)
  settle(host) // word-session-complete는 useEffect 안에서 지급됨(위 settle() 주석)
  const afterFirst = host.result.stars
  const ledgerAfterFirst = ledgerCount(host, 'word-session-complete')

  // "로그아웃 후 재로그인"은 이 기기(localStorage)를 공유한 채 완전히
  // 새 마운트를 만드는 것과 동일 — mountFresh를 다시 부르지 않고
  // (localStorage를 초기화해버리므로) 직접 새 렌더 트리만 만든다.
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  const clock2 = createFakeClock()
  const host2 = renderHook(() => useStudent(ID, NAME), clock2)
  raceStub.fetchFullProgressDeferred.resolve(null)
  await flush(); await flush(); await flush()
  check('재로그인 직후 totalStars 동일', host2.result.stars === afterFirst)
  check('재로그인 후 word-session-complete 건수 동일(추가 지급 없음)', ledgerCount(host2, 'word-session-complete') === ledgerAfterFirst)
}

// ── 테스트 5 — writing 완료 justCompleted 유도 → +2 정확히 1건 ──
currentScenario = 5
console.log('\n테스트 5 — writing 완료(justCompleted 유도 + 완료 후 추가 정답) → writing-complete 정확히 1건, +2')
{
  const { host } = mountFresh('11111111-0000-0000-0000-000000000005', 'QA_Reward_Writing')
  await flush(); await flush(); await flush()
  const before = host.result.stars
  // GOAL(5)에 처음 도달하는 순간에만 justCompletedWriting === true.
  for (let i = 0; i < 5; i++) host.result.recordSpellingAnswer(`sw${i}`, true)
  // 완료 이후 추가 정답 2회 — justCompletedWriting은 더 이상 true가 될 수
  // 없지만(prevCorrect가 이미 GOAL 이상), 재지급이 없는지 함께 확인.
  host.result.recordSpellingAnswer('sw5', true)
  host.result.recordSpellingAnswer('sw6', true)
  check('writing-complete 정확히 1건', ledgerCount(host, 'writing-complete') === 1)
  check('totalStars에 +2 반영(writing-complete 몫)', host.result.stars >= before + 2)
  const entry = ledgerArr(host).find((e) => e.reward_type === 'writing-complete')
  check('writing-complete stars_delta === 2', entry && entry.stars_delta === 2)
}

// ── 테스트 6 — recordExamCompleted 2회 → +2 정확히 1건, 다른 testId는 별개 ──
currentScenario = 6
console.log('\n테스트 6 — recordExamCompleted 2회(같은 testId) → +2 정확히 1건, 다른 testId는 별개 지급')
{
  const { host } = mountFresh('11111111-0000-0000-0000-000000000006', 'QA_Reward_Exam')
  await flush(); await flush(); await flush()
  const before = host.result.stars
  check('recordExamCompleted 함수가 존재', typeof host.result.recordExamCompleted === 'function')
  host.result.recordExamCompleted?.('test-1')
  host.result.recordExamCompleted?.('test-1')
  check('exam-complete(test-1) 정확히 1건', ledgerCount(host, 'exam-complete', (id) => id === 'test-1') === 1)
  check('totalStars === before + 2', host.result.stars === before + 2)
  host.result.recordExamCompleted?.('test-2')
  check('exam-complete(test-2) 별개로 1건 추가', ledgerCount(host, 'exam-complete', (id) => id === 'test-2') === 1)
  check('totalStars === before + 4(두 시험 합산)', host.result.stars === before + 4)
}

// ── 테스트 7 — 오답 회복(clearSpellingReviewWord + recordSpellingAnswer 교차) → +1 정확히 1건 ──
currentScenario = 7
console.log('\n테스트 7 — 오답 회복: clearSpellingReviewWord 2회 + recordSpellingAnswer 정답 교차 → wrong-word-recovered 각 단어별 정확히 1건')
{
  const ID = '11111111-0000-0000-0000-000000000007'
  const today = todayStr()
  const seed = {
    studentId: ID,
    totalStars: 0,
    round: { date: today, wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, pronunciationOkWordIds: [], spellingWrongToday: [], spellingCombo: 0, starGrantLog: [], completedToday: [] },
    spellingReviewQueue: ['rec-a', 'rec-b', 'rec-c'],
    history: {},
  }
  const { host } = mountSeeded(ID, 'QA_Reward_WrongWord', seed)
  await flush(); await flush(); await flush()
  const before = host.result.stars

  // ① clearSpellingReviewWord 경로 — 큐에 있던 단어를 두 번 제거 시도(두
  // 번째는 이미 큐에서 빠져 있어 재지급되면 안 됨).
  host.result.clearSpellingReviewWord('rec-a')
  host.result.clearSpellingReviewWord('rec-a')
  check('rec-a — wrong-word-recovered 정확히 1건(clearSpellingReviewWord 경로)', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':rec-a')) === 1)

  // ② recordSpellingAnswer 정답 경로 — 큐에 있던 다른 단어를 정답으로 해소.
  host.result.recordSpellingAnswer('rec-b', true)
  check('rec-b — wrong-word-recovered 정확히 1건(recordSpellingAnswer 경로)', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':rec-b')) === 1)

  // ③ 교차 호출 — recordSpellingAnswer로 이미 해소된 단어를 다시
  // clearSpellingReviewWord로 불러도(두 경로가 같은 dedupKey를 공유하므로)
  // 추가 지급이 없어야 한다.
  host.result.clearSpellingReviewWord('rec-b')
  check('rec-b — 교차 호출 후에도 여전히 정확히 1건', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':rec-b')) === 1)

  check('totalStars === before + 2(rec-a, rec-b 각 +1)', host.result.stars === before + 2)

  // ④ 대조군 — 큐/오늘 오답 어디에도 없던 단어는 clearSpellingReviewWord를
  // 불러도 지급되지 않아야 한다(오답 회복이 아니므로).
  host.result.clearSpellingReviewWord('never-wrong')
  check('큐/오답 이력이 전혀 없던 단어는 지급 없음', ledgerCount(host, 'wrong-word-recovered', (id) => id.endsWith(':never-wrong')) === 0)
}

// ── 테스트 8 — daily goal: 레거시 +10 유지 + daily-goal-complete +3(하루 1회) ──
currentScenario = 8
console.log('\n테스트 8 — daily goal 4/4: 레거시 +10 그대로 + daily-goal-complete +3(1건) / 같은 날 2번째 라운드 → 레거시 +10 재지급 + daily-goal 추가 0건(운영자 테스트 13)')
{
  const { host } = mountFresh('11111111-0000-0000-0000-000000000008', 'QA_Reward_DailyGoal')
  await flush(); await flush(); await flush()
  const before = host.result.stars

  // 1라운드 — 4개 카테고리 각 5회(단, word-session-complete 앵커는
  // round.completedToday를 보므로 markWordViewed만으로는 트리거되지
  // 않는다 — 이 시나리오는 daily-goal-complete/레거시 미션 보너스만
  // 독립적으로 확인하기 위해 의도적으로 markWordCompleted를 호출하지
  // 않는다).
  completeFullRound(host, { wordSuffix: 'r1', examples: 5, quizzes: 5, pron: 5 })
  settle(host) // daily-goal-complete는 useEffect 안에서 지급됨(위 settle() 주석)
  check('1라운드 — daily-goal-complete 정확히 1건', ledgerCount(host, 'daily-goal-complete') === 1)
  const entry1 = ledgerArr(host).find((e) => e.reward_type === 'daily-goal-complete')
  check('1라운드 — daily-goal-complete stars_delta === 3', entry1 && entry1.stars_delta === 3)
  // 레거시 지급 확인 — 발음 연습(distinct wordId 5개, 각 +1) + 미션
  // 보너스(MISSION_BONUS_STARS=10, 라운드 시그니처 dedupKey) + 신규
  // daily-goal-complete(+3) = 18. 레거시 grantReward 호출을 한 글자도
  // 바꾸지 않았다면 이 총합이 정확히 맞아야 한다(총별로 확인).
  const afterRound1 = host.result.stars
  check('1라운드 후 totalStars 델타 === 18(발음5 + 레거시미션보너스10 + 신규daily-goal3)', afterRound1 === before + 18)

  // 2라운드 — 같은 날 두 번째 4/4 완료(라운드 카운트가 1라운드와 달라야
  // handledRoundRef 시그니처가 겹치지 않는다 — 6개씩 사용).
  completeFullRound(host, { wordSuffix: 'r2', examples: 6, quizzes: 6, pron: 5 })
  settle(host)
  check('2라운드 후에도 daily-goal-complete 여전히 정확히 1건(하루 1회 유지)', ledgerCount(host, 'daily-goal-complete') === 1)
  const afterRound2 = host.result.stars
  check('2라운드 — 레거시 +10 재지급 확인(발음5 + 미션보너스10, daily-goal 추가 없음 = 델타 15)', afterRound2 === afterRound1 + 15)
}

// ── 테스트 9 — streak-bonus: 연속일수별 금액/무보너스 경계 ──
currentScenario = 9
console.log('\n테스트 9 — streak-bonus: 연속 학습일수에 따른 보너스(3→2 / 5→3 / 7→5), 경계 밖은 0')
function daysAgoStr(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toDateString()
}
function seedHistoryForStreak(priorDays) {
  const history = { [todayStr()]: { categoriesCompleted: 4 } }
  for (let i = 1; i <= priorDays; i++) history[daysAgoStr(i)] = { categoriesCompleted: 4 }
  return history
}
async function runStreakCase(idx, priorDays, expectedStreak, expectedBonus) {
  const ID = `11111111-0000-0000-0000-0000000009${String(idx).padStart(2, '0')}`
  const seed = { studentId: ID, totalStars: 0, history: seedHistoryForStreak(priorDays) }
  const { host } = mountSeeded(ID, `QA_Reward_Streak${idx}`, seed)
  await flush(); await flush(); await flush()
  settle(host) // streak-bonus는 마운트 시 useEffect 안에서 지급됨(위 settle() 주석)
  const streakActual = host.result.streak
  check(`priorDays=${priorDays} → streak === ${expectedStreak}(실측 ${streakActual})`, streakActual === expectedStreak)
  const bonusEntries = ledgerCount(host, 'streak-bonus')
  if (expectedBonus > 0) {
    check(`priorDays=${priorDays} → streak-bonus 정확히 1건(+${expectedBonus})`, bonusEntries === 1)
    const entry = ledgerArr(host).find((e) => e.reward_type === 'streak-bonus')
    check(`priorDays=${priorDays} → stars_delta === ${expectedBonus}`, entry && entry.stars_delta === expectedBonus)
  } else {
    check(`priorDays=${priorDays} → streak-bonus 지급 없음(0건)`, bonusEntries === 0)
  }
}
await runStreakCase(1, 2, 3, 2)  // 연속 2일 + 오늘 = 3 → +2
await runStreakCase(2, 4, 5, 3)  // 연속 4일 + 오늘 = 5 → +3
await runStreakCase(3, 6, 7, 5)  // 연속 6일 + 오늘 = 7 → +5
await runStreakCase(4, 3, 4, 0)  // 연속 3일 + 오늘 = 4 → 보너스 없음
await runStreakCase(5, 5, 6, 0)  // 연속 5일 + 오늘 = 6 → 보너스 없음
await runStreakCase(6, 7, 8, 0)  // 연속 7일 + 오늘 = 8 → 보너스 없음

// ── 테스트 10 — 레벨 경계 + Level Up 피드백 ──
currentScenario = 10
console.log('\n테스트 10 — 레벨 경계(totalStars 19→20) 넘으면 Level Up 피드백, 20~49 구간 내 증가는 Level Up 없음')
{
  const ID = '11111111-0000-0000-0000-000000000010'
  const seed = { studentId: ID, totalStars: 19, round: { date: todayStr(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, pronunciationOkWordIds: [], spellingWrongToday: [], spellingCombo: 0, starGrantLog: [], completedToday: [] } }
  const { host } = mountSeeded(ID, 'QA_Reward_LevelUp', seed)
  await flush(); await flush(); await flush()
  check('시작 totalStars === 19', host.result.stars === 19)
  for (let i = 0; i < 5; i++) host.result.markWordCompleted(`lv${i}`) // word-session-complete +1 → 20
  settle(host) // word-session-complete는 useEffect 안에서 지급됨(위 settle() 주석)
  check('totalStars === 20(레벨 경계 통과)', host.result.stars === 20)
  const hasLevelUp = (host.result.rewardFeedback || []).some((f) => /Level ?Up/i.test(f.text))
  check('rewardFeedback에 Level Up 항목 존재', hasLevelUp)
}
{
  const ID = '11111111-0000-0000-0000-000000000011'
  const seed = { studentId: ID, totalStars: 25, round: { date: todayStr(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, pronunciationOkWordIds: [], spellingWrongToday: [], spellingCombo: 0, starGrantLog: [], completedToday: [] } }
  const { host } = mountSeeded(ID, 'QA_Reward_NoLevelUp', seed)
  await flush(); await flush(); await flush()
  for (let i = 0; i < 5; i++) host.result.markWordCompleted(`nl${i}`) // +1 → 26, 여전히 Level 2(20~49) 구간 내
  settle(host)
  check('totalStars === 26(같은 레벨 구간 내)', host.result.stars === 26)
  const hasLevelUp = (host.result.rewardFeedback || []).some((f) => /Level ?Up/i.test(f.text))
  check('20~49 구간 내 증가는 Level Up 피드백 없음', !hasLevelUp)
}

// ── 테스트 11 — mergeRewardLedgers(mergeProgressRecords 경유): local/cloud 원장 union ──
currentScenario = 11
console.log('\n테스트 11 — mergeProgressRecords: local/cloud rewardLedger 겹침 union(같은 key 1건, local 우선), 양쪽 고유 항목 보존')
{
  const ID = '11111111-0000-0000-0000-000000000012'
  const sharedKey = `${ID}:exam-complete:entrance-test:merge-test-1`
  const localOnly = { id: `${ID}:word-session-complete:daily-words:local-only`, reward_type: 'word-session-complete', source_type: 'daily-words', source_id: 'local-only', stars_delta: 1, xp_delta: 0, idempotency_key: `${ID}:word-session-complete:daily-words:local-only`, created_at: '2026-08-15T01:00:00.000Z' }
  const cloudOnly = { id: `${ID}:writing-complete:daily-writing:cloud-only`, reward_type: 'writing-complete', source_type: 'daily-writing', source_id: 'cloud-only', stars_delta: 2, xp_delta: 0, idempotency_key: `${ID}:writing-complete:daily-writing:cloud-only`, created_at: '2026-08-15T02:00:00.000Z' }
  const sharedLocal = { id: sharedKey, reward_type: 'exam-complete', source_type: 'entrance-test', source_id: 'merge-test-1', stars_delta: 2, xp_delta: 0, idempotency_key: sharedKey, created_at: 'LOCAL-VERSION' }
  const sharedCloud = { id: sharedKey, reward_type: 'exam-complete', source_type: 'entrance-test', source_id: 'merge-test-1', stars_delta: 2, xp_delta: 0, idempotency_key: sharedKey, created_at: 'CLOUD-VERSION' }

  const localRaw = { studentId: ID, totalStars: 3, rewardLedger: [localOnly, sharedLocal] }
  const cloudRaw = { studentId: ID, totalStars: 2, rewardLedger: [cloudOnly, sharedCloud] }
  const merged = mergeProgressRecords(localRaw, cloudRaw, ID)

  check('merged.rewardLedger 길이 === 3(겹치는 key 1건만 포함)', Array.isArray(merged.rewardLedger) && merged.rewardLedger.length === 3)
  check('local 고유 항목 보존', merged.rewardLedger.some((e) => e.idempotency_key.endsWith('local-only')))
  check('cloud 고유 항목 보존', merged.rewardLedger.some((e) => e.idempotency_key.endsWith('cloud-only')))
  const mergedShared = merged.rewardLedger.find((e) => e.idempotency_key === sharedKey)
  check('겹치는 key는 local 버전 우선', mergedShared && mergedShared.created_at === 'LOCAL-VERSION')
}

// ── 테스트 12 — rewardLedger 없는 구버전 레코드(normalize) 안전 ──
currentScenario = 12
console.log('\n테스트 12 — rewardLedger 필드가 없는 구버전 레코드도 normalizeRecord가 안전하게 빈 배열로 채움')
{
  const legacy = { studentId: 'legacy-id', totalStars: 7 } // rewardLedger 필드 자체가 없음
  const normalized = normalizeRecord(legacy, 'legacy-id')
  check('normalizeRecord 크래시 없이 반환', !!normalized)
  check('rewardLedger가 빈 배열로 채워짐', Array.isArray(normalized.rewardLedger) && normalized.rewardLedger.length === 0)
  check('기존 totalStars는 그대로 보존', normalized.totalStars === 7)
}

console.log('\n─── 결과 요약 ───')
for (const n of Object.keys(scenarioFailures)) console.log(`테스트 ${n} 실패 수: ${scenarioFailures[n]}`)
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0
  ? '\n모든 단언 통과 — Reward System V1 Phase 2 배선 정상 동작 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
