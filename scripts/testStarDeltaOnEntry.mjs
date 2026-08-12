// scripts/testStarDeltaOnEntry.mjs
//
// 회귀 대상 — 운영자 신고: "아무 문제도 풀지 않고 로그인 → 학습 화면 진입
// → 나가기만 했는데 별이 늘어난다." 원인은 코드 읽기로 이미 확정됐었다(이
// 파일은 처음엔 그 원인을 "고치지" 않고, 재현해서 빨간불로 고정하는 회귀
// 테스트만 만들었다 — CLAUDE.md 규칙 15: 회귀는 먼저 실제로 FAIL하는지
// 확인):
//   1) src/hooks/useStudent.js loadRecord(id, legacyName) — 이 기기에서
//      처음 보는 studentId면 store[legacyName](표시 "이름" 문자열 키)로
//      로컬 진도를 찾아 "그대로" 채택했다.
//   2) normalizeRecord — 주운 레코드의 소유자(studentId)를 검사 없이 현재
//      id로 덮어썼다.
//   3) 마운트 시 클라우드 병합이 maxNum(local, cloud)이라 오염값을
//      "합산"이 아니라 "보존"했다.
//   4) 2초 디바운스 동기화가 그 오염값을 새 계정 UUID로 Supabase에 그대로
//      업로드했다.
//   5) App.jsx 로그아웃은 세션 키(paulEasyVoca_currentStudent)만 지우고
//      진도 저장소(paul_easy_progress)는 그대로 둔다 — 그래서 다음 로그인
//      (다른 동명이인 계정)이 여전히 1)의 이름 키를 발견한다.
// 실측 증거: 같은 기기·같은 이름 "권교빈"으로 만들어진 계정 5개가
// 7/7(47별)+7/9(72별)=119별을 공유(그중 2개는 완전 클론).
//
// 2026-08-12 수정 완료 — src/hooks/useStudent.js에 "이름 키 소유권 가드"를
// 추가했다(claimName/loadNameClaims, loadRecord 내부). 이 기기에서 그 이름
// 키를 "처음" 채택한 studentId만 로컬 저장소(paul_easy_name_claims)에
// 소유자로 기록되고, 그 뒤로 "다른" studentId가 같은 이름으로 로그인하면
// 이름 키(및 더 오래된 흩어진 paulEasyVoca_{name}_{field} 키)를 채택하지
// 않고 freshRecord(id)로 시작한다. 원인 1)~4) 자체는 코드에 그대로 남아
//있지만(그 경로들은 여전히 정상 마이그레이션에 필요), 진입 지점(loadRecord)
// 에서 "이 studentId가 이 이름 키의 정당한 소유자인가"를 먼저 확인해 오염
// 경로 자체가 시작되지 않도록 막았다. 아래 시나리오 ②는 이제 PASS해야
// 정상이고(가드 동작 확인), ①③④⑤⑥과 함께 전부 초록이면 verify:star-delta
// 통과 + tests/harness/registry.mjs(student 도메인)에 등록되어 verify:all
// 게이트에도 포함된다.
//
// 시나리오 ① (대조군, 항상 PASS) — 이 기기에 UUID도 이름 키도 전혀 없는
// 완전 신규 학생이 로그인 → 마운트 → 학습 함수는 단 하나도 호출하지 않고
// 복원/2초 디바운스 동기화까지 전부 flush. 원인이 "지급"이 아니라 "복원"에
// 있었으므로, 별 지급 경로 자체는 무죄임을 보여주는 대조군 — 여기서 별이
// 늘면 지급 로직에 별도 버그가 있다는 뜻이라 원인 진단이 틀렸다는 신호.
//
// 시나리오 ② (수정 후 PASS로 전환 — 가드의 핵심 계약) — 같은 기기에 같은
// 표시 이름("권교빈")의 오염 레코드(총 119별, 실측 사고와 같은 모양)가
// 이름 키로 남아있고, 그 이름을 "이미 정당한 원래 소유자"(ORIGINAL_ID)가
// 소유권 가드에 이미 선점 등록해둔 상태(= 이 패치 배포 후 원래 소유자가
// 적어도 한 번은 로그인해 claimName이 자동으로 기록한 상태를 재현)에서,
// 그 기기에서 처음 보는 "다른" UUID(동명이인 신규 계정)로 로그인한다.
// 클라우드 스텁은 이 새 UUID에 대해 빈 백업을 반환(오염이 로컬 기원임을
// 증명 — 클라우드에서 온 게 아님). 가드가 정상 동작하면 이 신규 계정은
// 이름 키를 채택하지 않고 별 0으로 시작해야 하고, 그 값 그대로 클라우드에
// 업로드돼야 한다.
//
// 시나리오 ③ (재입장/새로고침, 신규) — 같은 studentId가 이미 자기 own
// 레코드를 가진 상태에서 마운트 → 마운트 재실행(새로고침과 동일하게 같은
// localStorage를 공유하는 새 렌더 트리)해도 별이 전혀 변하지 않아야 한다
// (중복 지급 0). 소유권 가드가 "이미 자기 자신이 소유자"인 정상 재로그인
// 경로를 막지 않는지 확인.
//
// 시나리오 ④ (동일 이벤트 재호출, 신규) — 실제 보상 트리거(markPronunciationOk,
// 내부적으로 grantReward를 호출)를 같은 wordId로 두 번 연속 호출해도 별이
// 정확히 1회만 오른다 — 기존 round.starGrantLog dedup 계약이 이번 수정으로
// 깨지지 않았는지 확인(grantReward 자체는 한 줄도 바꾸지 않았다).
//
// 시나리오 ⑤ (실제 정답 시 정상 지급, 신규) — 오염과 무관한 완전 신규
// 학생이 실제 학습 경로(markPronunciationOk)를 호출하면 기존 규칙대로 별이
// 오른다 — 이번 수정이 보상 자체를 죽이지 않았음을 증명.
//
// 시나리오 ⑥ (다른 이름/다른 UUID로 반복, 신규) — ②와 동일한 오염 구조를
// 전혀 다른 표시 이름·전혀 다른 UUID 조합으로 한 번 더 돌려, 가드가 "권교빈"
// 특정 문자열에 우연히 맞은 게 아니라 이름 전반에 적용되는 공통 로직임을
// 고정한다.
//
// 실행 방식은 기존 하네스(scripts/testRestoreSyncRace.mjs,
// scripts/testIdentityMigration.mjs)와 완전히 동일 — 새 테스트 프레임워크
// 발명 없음. fakeReact.mjs의 최소 hooks 런타임 + fake clock으로 실제
// 번들된 src/hooks/useStudent.js(scripts/buildRaceBundle.mjs 산출물,
// scripts/.tmp/useStudent.race.bundle.mjs)를 그대로 구동한다. 네트워크 0,
// DB 접근 0(scripts/wordLibraryRaceStub.mjs가 클라우드 fetch/sync를 전부
// 스텁).
//
//   npm run verify:star-delta
// (내부적으로 scripts/buildRaceBundle.mjs를 먼저 실행한다.)
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
const scenarioFailures = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
let currentScenario = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else {
    console.log(`  FAIL  ${label}`)
    failures++
    scenarioFailures[currentScenario] = (scenarioFailures[currentScenario] || 0) + 1
  }
}
const flush = () => new Promise((r) => process.nextTick(r))

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const { useStudent } = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)

currentScenario = 1
console.log('\n시나리오 ① — 완전 신규 학생, 진입만 하고 아무 학습도 안 함 → 별 델타 0 (대조군, 항상 PASS)')
{
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage() // 이 기기에 아무 기록도 없음(UUID도 이름도)
  globalThis.document = new FakeDocument()
  const NEW_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
  const NEW_NAME = 'QA_BrandNewFresh'

  const clock = createFakeClock()
  const host = renderHook(() => useStudent(NEW_ID, NEW_NAME), clock)
  // 마운트 직후(이펙트 실행 전) — 학습 함수(markWordViewed/markQuizSolved/
  // answerMission/markPronunciationOk/recordSpellingAnswer/grantSticker/
  // grantReward)는 단 하나도 호출하지 않았다.
  check('마운트 직후 totalStars === 0', host.result.stars === 0)
  check('마운트 직후 round.starGrantLog 비어있음', host.result.round.starGrantLog.length === 0)

  // 복원 이펙트 flush — 신규 학생(isEmptyRecord===true) 경로는
  // fetchFullProgress()가 끝나야 restoreChecked=true (useStudent.js:801-815).
  raceStub.fetchFullProgressDeferred.resolve(null) // 클라우드에도 백업 없음(진짜 신규)
  await flush(); await flush(); await flush()
  check('클라우드 백업 없음 확인 후에도 totalStars === 0', host.result.stars === 0)
  check('restoreChecked === true (복원 절차 완료)', host.result.restoreChecked === true)

  // 2초 디바운스 동기화까지 flush
  clock.advance(2000)
  await flush(); await flush(); await flush()
  check('디바운스 동기화가 정확히 1회 발생', raceStub.syncCalls.length === 1)
  check('업로드 payload의 totalStars === 0', raceStub.syncCalls[0]?.totalStars === 0)
  check('업로드 payload의 fullRecord.totalStars === 0', raceStub.syncCalls[0]?.fullRecord?.totalStars === 0)
  check('업로드 payload의 fullRecord.round.starGrantLog 비어있음', (raceStub.syncCalls[0]?.fullRecord?.round?.starGrantLog || []).length === 0)
}

// 실측 사고와 같은 모양(7/7 47별 + 7/9 72별 = 119별)의 오염 레코드를 만드는
// 공용 헬퍼 — ②와 ⑥이 이름/카운트만 바꿔 재사용.
function buildContaminatedRecord(displayName, totalStars) {
  return {
    studentId: displayName, // 레거시 레코드 흔한 모양(이름이 그대로 studentId 필드에 남아있음)
    totalStars,
    stickers: ['crown1'],
    diaryPlacements: [],
    missions: [],
    cleared: ['apple', 'banana'],
    round: { date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] },
    history: {
      'Tue Jul 07 2026': { studied: true, categoriesCompleted: 4, giftsToday: 1, starsEarned: 47, stickersEarned: [], gamesPlayed: {}, quizCorrect: 4, quizTotal: 5, pronunciationAttempts: 4, missedWordIds: [], spellingCorrect: 3, spellingTotal: 4 },
      'Thu Jul 09 2026': { studied: true, categoriesCompleted: 4, giftsToday: 2, starsEarned: 72, stickersEarned: ['crown1'], gamesPlayed: { balloon: 1 }, quizCorrect: 5, quizTotal: 5, pronunciationAttempts: 5, missedWordIds: [], spellingCorrect: 5, spellingTotal: 5 },
    },
    milestoneStreak: 2,
    starBadgeThreshold: 100,
    lastGamePlayed: 'balloon',
    lastWordIndex: 8,
    wordStatus: {},
  }
}

// ②/⑥이 공유하는 "동명이인 로그인이 가드에 막히는지" 검증 본체.
function runHomonymBlockScenario(scenarioNumber, displayName, originalId, duplicateId, totalStars) {
  currentScenario = scenarioNumber
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)

  const contaminated = buildContaminatedRecord(displayName, totalStars)
  globalThis.localStorage = new FakeStorage()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({ [displayName]: contaminated }))
  // 이름 키 소유권 가드 — "원래 정당한 소유자"(originalId)가 이 패치 배포
  // 이후 이미 한 번 로그인해 이 이름을 선점 등록해둔 상태를 재현. 이게
  // 없으면 표식 없는 이름은 "아직 아무도 선점하지 않음"으로 간주돼 첫
  // 요청자에게 정상 허용되므로(기존 마이그레이션 경로 보존), 가드가
  // 막아야 하는 실제 시점(원 소유자가 이미 보호망에 들어온 뒤)을 정확히
  // 재현하려면 이 사전 등록이 필요하다.
  globalThis.localStorage.setItem('paul_easy_name_claims', JSON.stringify({ [displayName]: originalId }))
  globalThis.document = new FakeDocument()

  const clock = createFakeClock()
  const host = renderHook(() => useStudent(duplicateId, displayName), clock)

  // loadRecord(id, legacyName)은 useState 초기화 함수 안에서 첫 렌더보다도
  // 먼저 동기적으로 실행된다 — 학습 함수는 물론 어떤 이펙트도 돌기 전에
  // 이미 오염이 일어난다면 여기서부터 별이 0이 아니다.
  check('마운트 직후 totalStars === 0 (동명이인 오염 없음, 가드 동작)', host.result.stars === 0)

  // 클라우드는 이 새 UUID에 대해 빈 백업(오염이 로컬 기원임을 증명)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return { host, clock }
}

console.log('\n시나리오 ② — 같은 기기·같은 표시이름의 동명이인 신규 계정 로그인 → 이름 키 가드가 오염을 차단 (수정 후 PASS)')
{
  const DISPLAY_NAME = '권교빈' // 실제 프로덕션 사고 사례와 동일한 표시 이름
  const ORIGINAL_ID = 'cccccccc-1111-2222-3333-444444444444' // 이 이름의 정당한 원 소유자
  const DUPLICATE_ID = 'bbbbbbbb-9999-8888-7777-666666666666' // 동명이인 신규 계정
  const { host, clock } = runHomonymBlockScenario(2, DISPLAY_NAME, ORIGINAL_ID, DUPLICATE_ID, 119)

  await flush(); await flush(); await flush()
  check('클라우드 백업 없음 확인 후에도 totalStars === 0', host.result.stars === 0)

  clock.advance(2000)
  await flush(); await flush(); await flush()
  check('디바운스 동기화가 발생', raceStub.syncCalls.length === 1)
  check('업로드 payload의 totalStars가 119가 아님(오염값을 새 계정으로 업로드하지 않음)', raceStub.syncCalls[0]?.totalStars !== 119)
  check('업로드 payload의 totalStars === 0', raceStub.syncCalls[0]?.totalStars === 0)
}

currentScenario = 3
console.log('\n시나리오 ③ — 재입장/새로고침(같은 UUID) → 별 중복 지급 없음 (신규)')
{
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)

  const SAME_ID = 'dddddddd-1111-2222-3333-444444444444'
  const SAME_NAME = 'QA_ReturningKid'
  // 이미 정상적으로 자기 own 레코드(별 42개)를 가진, 예전에 로그인한 적
  // 있는 학생 — 그 로그인 시점에 claimName이 이미 이름도 자기 자신으로
  // 기록해뒀다고 가정(재현을 위해 함께 시딩).
  const existing = { studentId: SAME_ID, totalStars: 42, stickers: [], diaryPlacements: [], missions: [], cleared: [], round: { date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] }, history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 0, wordStatus: {} }
  globalThis.localStorage = new FakeStorage()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({ [SAME_ID]: existing }))
  globalThis.localStorage.setItem('paul_easy_name_claims', JSON.stringify({ [SAME_NAME]: SAME_ID }))
  globalThis.document = new FakeDocument()

  const clock1 = createFakeClock()
  const host1 = renderHook(() => useStudent(SAME_ID, SAME_NAME), clock1)
  check('첫 마운트 — totalStars === 42 (own 레코드 그대로)', host1.result.stars === 42)
  raceStub.fetchFullProgressDeferred.resolve(null)
  await flush(); await flush(); await flush()
  clock1.advance(2000)
  await flush(); await flush(); await flush()
  check('첫 마운트 sync 후에도 totalStars === 42 (증가 없음)', host1.result.stars === 42)

  // "언마운트 → 다시 마운트" = 새로고침과 동일하게 같은(공유) localStorage
  // 위에서 완전히 새 렌더 트리를 만든다(App.jsx가 학생이 바뀔 때 하는
  // 것과 동일한 종류의 재마운트, useStudent.js 헤더 주석 참고).
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  const clock2 = createFakeClock()
  const host2 = renderHook(() => useStudent(SAME_ID, SAME_NAME), clock2)
  check('재마운트 직후 totalStars === 42 (중복 지급 없음)', host2.result.stars === 42)
  raceStub.fetchFullProgressDeferred.resolve(null)
  await flush(); await flush(); await flush()
  clock2.advance(2000)
  await flush(); await flush(); await flush()
  check('재마운트 sync 후에도 totalStars === 42 (여전히 변화 없음)', host2.result.stars === 42)
  check('재마운트 업로드 payload도 42', raceStub.syncCalls[0]?.totalStars === 42)
}

currentScenario = 4
console.log('\n시나리오 ④ — 동일 dedupKey로 보상 트리거 재호출 → 별 1회만 지급 (신규, 기존 dedup 계약 확인)')
{
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
  const ID = 'eeeeeeee-1111-2222-3333-444444444444'
  const NAME = 'QA_DedupCheck'
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(ID, NAME), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  await flush(); await flush(); await flush()

  const before = host.result.stars
  host.result.markPronunciationOk('word-dedup-test') // 1회차 — 지급됨
  host.result.markPronunciationOk('word-dedup-test') // 2회차(같은 wordId, 같은 날 = 같은 dedupKey) — 거부돼야 함
  check('별이 정확히 +1만 증가(2회 호출에도 1회만 지급)', host.result.stars === before + 1)
  check('starGrantLog에 dedupKey가 정확히 1개만 기록됨', host.result.round.starGrantLog.filter(k => k === `pronunciation:word-dedup-test:${host.result.round.date}`).length === 1)
}

currentScenario = 5
console.log('\n시나리오 ⑤ — 실제 정답(발음 성공) 경로 호출 시 정상 지급 (신규, 보상 자체를 죽이지 않았음을 증명)')
{
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
  const ID = 'ffffffff-1111-2222-3333-444444444444'
  const NAME = 'QA_RealRewardCheck'
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(ID, NAME), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  await flush(); await flush(); await flush()
  check('학습 전 totalStars === 0', host.result.stars === 0)

  host.result.markPronunciationOk('word-real-answer')
  check('발음 성공 1회 → totalStars === 1 (기존 규칙 그대로)', host.result.stars === 1)

  clock.advance(2000)
  await flush(); await flush(); await flush()
  check('업로드 payload의 totalStars === 1', raceStub.syncCalls[0]?.totalStars === 1)
}

console.log('\n시나리오 ⑥ — 다른 표시이름/다른 UUID 조합으로 동일 오염 시나리오 재확인 (신규, 공통 로직 고정)')
{
  const DISPLAY_NAME = 'QA_Homonym_판다' // ②와 겹치지 않는 별도 이름
  const ORIGINAL_ID = '11112222-1111-2222-3333-444444444444'
  const DUPLICATE_ID = '33334444-1111-2222-3333-444444444444'
  const { host, clock } = runHomonymBlockScenario(6, DISPLAY_NAME, ORIGINAL_ID, DUPLICATE_ID, 55)

  await flush(); await flush(); await flush()
  check('클라우드 백업 없음 확인 후에도 totalStars === 0', host.result.stars === 0)

  clock.advance(2000)
  await flush(); await flush(); await flush()
  check('디바운스 동기화가 발생', raceStub.syncCalls.length === 1)
  check('업로드 payload의 totalStars가 55가 아님(오염값을 새 계정으로 업로드하지 않음)', raceStub.syncCalls[0]?.totalStars !== 55)
  check('업로드 payload의 totalStars === 0', raceStub.syncCalls[0]?.totalStars === 0)
}

console.log('\n─── 결과 요약 ───')
for (const n of [1, 2, 3, 4, 5, 6]) console.log(`시나리오 ${n} 실패 수: ${scenarioFailures[n]} (0이어야 정상)`)
console.log(failures === 0
  ? '\n모든 단언 통과 — 이름 키 소유권 가드가 정상 동작 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
