// M4b(2026-08-04) Cleared Stars — 파생(derived) 방식 불변식 증명.
// clearedWords는 영구 append-only이고 단일 기록 지점(markWordCleared,
// src/hooks/useStudent.js)이 patch updater 안에서 includes 검사 후에만
// append한다(멀티기기는 mergeProgressRecords의 unionList) — 그래서
// `new Set(clearedWords).size === clearedWords.length`가 구조적 불변식이고,
// clearedStars를 저장하지 않고 매번 `clearedWords.length *
// CLEARED_STAR_PER_WORD`로 다시 계산하면 중복 지급이 애초에 존재할 수 없다
// (저장된 "지급 상태"가 없으므로). 이 스크립트는 그 사실을 실제 번들된
// useStudent.js 훅(시뮬레이션이 아니라 진짜 소스)으로 검증한다.
//
// 실행 전 먼저 번들 필요(scripts/buildMultiTabBundle.mjs가 이미 존재하는
// 이 파일을 그대로 재사용 — useStudent.js 소스가 바뀌지 않는 한 새 번들
// 스크립트가 필요 없음):
//   node scripts/buildMultiTabBundle.mjs
//   node scripts/testClearedStars.mjs
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

const { useStudent, CLEARED_STAR_PER_WORD, mergeProgressRecords, normalizeRecord } =
  await import(pathToFileURL('scripts/.tmp/useStudent.multitab.bundle.mjs').href)

check('CLEARED_STAR_PER_WORD은 미션 보너스(10)보다 낮은 양수(위계 보존)', CLEARED_STAR_PER_WORD > 0 && CLEARED_STAR_PER_WORD < 10)

function baseRecord(id, stars, extra = {}) {
  return {
    studentId: id, totalStars: stars, stickers: [], diaryPlacements: [], missions: [], cleared: [],
    completedWords: [], clearedWords: [],
    round: { date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, spellingWrongToday: [] },
    history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 0, wordStatus: {},
    ...extra,
  }
}

function mount(id, stars, extra) {
  const storage = new FakeStorage()
  storage.setItem('paul_easy_progress', JSON.stringify({ [id]: baseRecord(id, stars, extra) }))
  globalThis.localStorage = storage
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  return { tab: renderHook(() => useStudent(id), clock), clock, storage }
}

console.log('\n시나리오 1: markWordCleared(\'apple\') 같은 단어 5회 연속(같은 tick) — 저장/파생 둘 다 1개로 고정')
{
  const { tab } = mount('QA_Cleared5x', 3)
  const starsBefore = tab.result.stars
  for (let i = 0; i < 5; i++) tab.result.markWordCleared('apple')
  check('clearedWords.length === 1 (5회 호출해도 한 번만 기록)', tab.result.clearedWords.length === 1 && tab.result.clearedWords[0] === 'apple')
  check('clearedStars === 1 (파생값도 정확히 1)', tab.result.clearedStars === 1 * CLEARED_STAR_PER_WORD)
  check('totalStars(=stars)는 markWordCleared 호출로 전혀 변하지 않음(저장된 지급 상태가 없다는 증거)', tab.result.stars === starsBefore)
}

console.log('\n시나리오 2: 퀴즈 3경로(WordDetail 본 코스 첫 시도 / GuidedSession 오답 재시도 / QuizGame 홈 퀴즈)가 전부 recordQuizAnswer 단일 choke point를 거친다 — 같은 단어를 세 "경로"에서 정답 처리해도 clearedWords는 하나')
{
  const { tab } = mount('QA_QuizPaths', 3)
  const starsBefore = tab.result.stars
  tab.result.recordQuizAnswer('banana', true)  // 경로 1: WordDetail.QuizStep 첫 시도 정답
  tab.result.recordQuizAnswer('banana', false) // 오답도 한 번 섞어봄(멱등성엔 영향 없어야 함)
  tab.result.recordQuizAnswer('banana', true)  // 경로 2: GuidedSession 오답 재시도 정답
  tab.result.recordQuizAnswer('banana', true)  // 경로 3: QuizGame 홈 퀴즈 정답
  check('clearedWords.length === 1 (퀴즈 3경로 동일 단어 → 한 번만 기록)', tab.result.clearedWords.length === 1 && tab.result.clearedWords[0] === 'banana')
  check('clearedStars === 1', tab.result.clearedStars === 1 * CLEARED_STAR_PER_WORD)
  check('recordQuizAnswer(오답 포함 4회 호출)도 totalStars를 전혀 바꾸지 않음', tab.result.stars === starsBefore)
}

console.log('\n시나리오 3: 2탭(2기기) 동시 진행 후 병합 — 양쪽이 같은 단어를 각자 클리어해도 병합 후 하나로 수렴')
{
  const A = { ...baseRecord('QA_Merge', 3), clearedWords: ['apple', 'cherry'] } // 탭 A에서 얻은 진행분
  const B = { ...baseRecord('QA_Merge', 3), clearedWords: ['banana', 'cherry'] } // 탭 B에서 얻은 진행분(cherry는 양쪽 다 이미 클리어)
  const merged = mergeProgressRecords(A, B, 'QA_Merge')
  const uniqueCount = new Set(merged.clearedWords).size
  check('병합 후 clearedWords.length === 3 (apple/banana/cherry, cherry 중복 제거)', merged.clearedWords.length === 3)
  check('병합 후에도 length === 유니크 개수(구조적 불변식 유지)', merged.clearedWords.length === uniqueCount)
  // 병합 결과를 다시 마운트해 훅이 계산하는 clearedStars도 동일하게 3인지 확인.
  const { tab } = mount('QA_Merge', merged.totalStars, { clearedWords: merged.clearedWords })
  check('병합 결과로 마운트한 훅의 clearedStars === 3', tab.result.clearedStars === 3 * CLEARED_STAR_PER_WORD)
}

console.log('\n시나리오 4 (핵심 — 임의 호출 시퀀스): markWordCleared/recordQuizAnswer를 뒤섞어 여러 번 호출한 뒤에도 clearedStars가 정확히 new Set(clearedWords).size * CLEARED_STAR_PER_WORD와 같고, 그 어떤 호출도 totalStars를 바꾸지 않는다(= 저장된 지급 상태가 존재하지 않음을 증명)')
{
  const { tab } = mount('QA_Arbitrary', 7)
  const starsBefore = tab.result.stars
  const calls = [
    () => tab.result.markWordCleared('word1'),
    () => tab.result.markWordCleared('word2'),
    () => tab.result.recordQuizAnswer('word1', true),  // 이미 클리어된 단어 재확인
    () => tab.result.markWordCleared('word2'),         // 중복
    () => tab.result.recordQuizAnswer('word3', false), // 오답 — clearedWords 영향 없어야 함
    () => tab.result.recordQuizAnswer('word3', true),
    () => tab.result.markWordCleared('word1'),         // 중복
    () => tab.result.recordQuizAnswer('word4', true),
    () => tab.result.markWordCleared('word3'),         // 이미 recordQuizAnswer로 기록됨 — 중복
  ]
  for (const call of calls) call()
  const expectedUnique = new Set(['word1', 'word2', 'word3', 'word4'])
  check('임의 시퀀스 후 clearedWords가 정확히 기대 단어 4개(중복 없음)', tab.result.clearedWords.length === 4 && [...expectedUnique].every(w => tab.result.clearedWords.includes(w)))
  check(
    '핵심 불변식: clearedStars === new Set(clearedWords).size * CLEARED_STAR_PER_WORD',
    tab.result.clearedStars === new Set(tab.result.clearedWords).size * CLEARED_STAR_PER_WORD
  )
  check('starsDisplay === stars + clearedStars', tab.result.starsDisplay === tab.result.stars + tab.result.clearedStars)
  check('임의 시퀀스(9회 호출) 전체가 끝난 뒤에도 totalStars(=stars) 불변 — grantReward/totalStars 증가 경로를 전혀 거치지 않았다는 증거', tab.result.stars === starsBefore)
}

console.log('\n시나리오 5: 구 blob(clearedWords 필드 자체가 없음) — 크래시 없이 clearedStars === 0')
{
  const oldBlob = { studentId: 'QA_OldBlob', totalStars: 12, stickers: [], diaryPlacements: [], missions: [], cleared: [] }
  // 순수 함수 레벨(normalizeRecord)로도 확인 — clearedWords가 asArray로 안전하게 []로 채워짐.
  const normalized = normalizeRecord(oldBlob, 'QA_OldBlob')
  check('normalizeRecord — 구 blob에 clearedWords 필드가 없어도 크래시 없이 빈 배열로 채움', Array.isArray(normalized.clearedWords) && normalized.clearedWords.length === 0)

  const storage = new FakeStorage()
  storage.setItem('paul_easy_progress', JSON.stringify({ QA_OldBlob: oldBlob }))
  globalThis.localStorage = storage
  globalThis.document = new FakeDocument()
  const clock = createFakeClock()
  const tab = renderHook(() => useStudent('QA_OldBlob'), clock)
  check('훅 레벨 — 구 blob 로그인 시 크래시 없이 clearedStars === 0', tab.result.clearedStars === 0)
  check('훅 레벨 — starsDisplay === stars(클리어 별 0개라 원본 별과 동일)', tab.result.starsDisplay === tab.result.stars)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
