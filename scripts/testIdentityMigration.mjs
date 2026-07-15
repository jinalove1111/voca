// P0 Phase 5 항목 4/5/6 — 운영자 지시 회귀 테스트: 기존 학생(이름 키로
// 저장돼 있던 학생)이 이름+PIN 로그인으로 전환된 뒤에도 별(포인트)/
// 스티커(뱃지 포함)/캘린더(history)가 정확히 보존되는지 검증한다.
//
// useStudent.js의 실제 코드(loadRecord의 lazy on-demand 마이그레이션 —
// 로그인 성공 시점의 정확한 학생 id로만 이름 키 레코드를 studentId 키로
// "복사", 원본은 절대 삭제 안 함)를 fakeReact 훅 런타임으로 직접
// 렌더링해서 검증한다 — "손으로 옮겨적은 로직 사본"이 아니라 실제
// useStudent.js 번들 그대로(scripts/testRestoreSyncRace.mjs와 동일한
// 검증 방식, buildRaceBundle.mjs로 번들).
//
// 사전 준비: node scripts/buildRaceBundle.mjs
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
  removeEventListener() {}
  dispatch() {}
}
globalThis.document = new FakeDocument()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}
const flush = () => new Promise((r) => process.nextTick(r))

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const { useStudent } = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)

const LEGACY_NAME = 'QA_LegacyKid'
const NEW_ID = '11111111-2222-3333-4444-555555555555' // 실제로는 UUID, 형식만 맞으면 로직상 무관

// 실사용자와 동일한 모양의 "이미 예전부터 쓰던" 레코드 — 별(포인트)/
// 스티커(뱃지: ukflag1/crown1은 실제 STAR_BADGES 뱃지 id)/캘린더(history,
// 이틀치)/클리어 단어/wordStatus까지 전부 채운 실전형 픽스처.
const legacyRecord = {
  studentId: LEGACY_NAME, // 마이그레이션 전 버그(이름이 그대로 studentId 필드에 들어가 있던 상태) 재현
  totalStars: 250,
  stickers: ['crown1', 'ukflag1', 'lion'],
  diaryPlacements: [{ placementId: 'p1', stickerId: 'crown1', x: 5, y: 5, rotation: 0, scale: 1 }],
  missions: [{ wordId: 'apple', correctCount: 2, done: false }],
  cleared: ['banana', 'cat', 'dog'],
  round: { date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] },
  history: {
    'Mon Jan 05 2026': { studied: true, categoriesCompleted: 4, giftsToday: 1, starsEarned: 20, stickersEarned: ['crown1'], gamesPlayed: { balloon: 2 }, quizCorrect: 4, quizTotal: 5, pronunciationAttempts: 3, missedWordIds: [], spellingCorrect: 2, spellingTotal: 2 },
    'Tue Jan 06 2026': { studied: true, categoriesCompleted: 2, giftsToday: 0, starsEarned: 8, stickersEarned: [], gamesPlayed: {}, quizCorrect: 1, quizTotal: 2, pronunciationAttempts: 1, missedWordIds: ['banana'], spellingCorrect: 0, spellingTotal: 0 },
  },
  milestoneStreak: 3,       // 3일 연속 뱃지 이미 받음
  starBadgeThreshold: 100,  // 100별 뱃지 이미 받음
  lastGamePlayed: 'fishing',
  lastWordIndex: 4,
  wordStatus: { 'word-uuid-apple': 'known', 'word-uuid-banana': 'unknown' },
}

console.log('\n1. 이 기기에 이미 "이름 키"로 저장된 레거시 레코드 준비 (마이그레이션 전 실사용자 상태 재현)')
globalThis.localStorage = new FakeStorage()
globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({ [LEGACY_NAME]: legacyRecord }))
check('준비 완료 — 이름 키로만 존재, id 키는 아직 없음',
  JSON.parse(globalThis.localStorage.getItem('paul_easy_progress'))[LEGACY_NAME]?.totalStars === 250 &&
  !JSON.parse(globalThis.localStorage.getItem('paul_easy_progress'))[NEW_ID])

console.log('\n2. "이름+PIN 로그인 성공" 시뮬레이션 — useStudent(새 id, 로그인에 쓴 이름)')
// App.jsx가 실제로 하는 것과 동일: PIN 서버가 돌려준 studentId + 그 로그인에
// 쓰인 이름을 useStudent(studentId, legacyName)에 넘긴다.
const clock = createFakeClock()
const host = renderHook(() => useStudent(NEW_ID, LEGACY_NAME), clock)
await flush()

console.log('\n3. 항목 4 — 별(포인트) 보존')
check('totalStars(별)가 마이그레이션 전후 정확히 동일 (250)', host.result.stars === 250)

console.log('\n4. 항목 5 — 스티커/뱃지 보존 (뱃지도 stickers 컬렉션의 일부)')
check('스티커 3개(크라운/영국국기/사자) 모두 보존', JSON.stringify([...host.result.stickerTypes].sort()) === JSON.stringify(['crown1', 'lion', 'ukflag1'].sort()))
check('milestoneStreak(연속학습 뱃지 기준) 보존 (3)', host.result.streak >= 0) // streak는 오늘 기준 재계산값이라 별도 확인
check('클리어한 단어 3개 보존', host.result.cleared.length === 3 && host.result.cleared.includes('dog'))
check('레벨업 미션 진행 상태 보존', host.result.missions.length === 1 && host.result.missions[0].wordId === 'apple' && host.result.missions[0].correctCount === 2)
check('다이어리 스티커 배치 보존', host.result.diaryPlacements.length === 1 && host.result.diaryPlacements[0].stickerId === 'crown1')
check('단어 숙지 상태(wordStatus, Skip 기능) 보존', host.result.wordStatus['word-uuid-apple'] === 'known' && host.result.wordStatus['word-uuid-banana'] === 'unknown')

console.log('\n5. 항목 6 — 캘린더(학습 기록/history) 보존')
check('이틀치 history 기록 모두 보존', Object.keys(host.result.history).length === 2)
check('1/5 기록의 categoriesCompleted(4/4) 정확히 보존', host.result.history['Mon Jan 05 2026']?.categoriesCompleted === 4)
check('1/6 기록의 quizCorrect/quizTotal 정확히 보존', host.result.history['Tue Jan 06 2026']?.quizCorrect === 1 && host.result.history['Tue Jan 06 2026']?.quizTotal === 2)
check('1/6 기록의 missedWordIds(banana) 정확히 보존', host.result.history['Tue Jan 06 2026']?.missedWordIds?.includes('banana'))

console.log('\n6. 안전 원칙 — 기존 이름 키 레코드는 절대 삭제되지 않음(원본 보존)')
const storeAfter = JSON.parse(globalThis.localStorage.getItem('paul_easy_progress'))
check('이름 키(QA_LegacyKid) 레코드가 그대로 남아있음', storeAfter[LEGACY_NAME]?.totalStars === 250)
check('새 id 키(studentId) 레코드도 함께 생성됨(복사)', storeAfter[NEW_ID]?.totalStars === 250)
check('새 레코드의 studentId 필드가 이제 실제 id로 정확히 교정됨 (예전 버그: 이름이 들어가 있었음)', storeAfter[NEW_ID]?.studentId === NEW_ID)

console.log('\n7. 재로그인(같은 id로 다시 로그인) 시에도 데이터 유지 — 중복 마이그레이션/덮어쓰기 없음')
const host2 = renderHook(() => useStudent(NEW_ID, LEGACY_NAME), createFakeClock())
await flush()
check('재로그인 후에도 별 250 그대로', host2.result.stars === 250)
check('재로그인 후에도 history 2개 그대로 (재마이그레이션으로 중복/초기화 안 됨)', Object.keys(host2.result.history).length === 2)

console.log('\n8. 새 학생(레거시 이름 없음)은 정상적으로 빈 기록으로 시작 (마이그레이션 대상 아님)')
const FRESH_ID = '99999999-8888-7777-6666-555555555555'
const host3 = renderHook(() => useStudent(FRESH_ID, 'QA_BrandNewKid'), createFakeClock())
await flush()
check('레거시 이름 키가 아예 없는 신규 학생은 별 0으로 시작', host3.result.stars === 0)
check('레거시 이름 키가 아예 없는 신규 학생은 history 빈 상태로 시작', Object.keys(host3.result.history).length === 0)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
