// Standalone test for the unified progress store (src/hooks/useStudent.js).
// Exercises the SAME exported pure functions the hook uses, against a fake
// localStorage, to verify: category-completion counting, persistence across
// a simulated reload, and next-day reset behavior (keeps cumulative fields,
// resets only today's round).
import assert from 'node:assert/strict'

// ── Fake localStorage ────────────────────────────────────────────────────
class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
globalThis.localStorage = new FakeStorage()

// Node can't resolve extensionless relative imports the way Vite does, and
// useStudent.js pulls in Supabase-backed wordLibrary.js at the top (browser-
// only `import.meta.env`) purely for a re-export we don't test here — so we
// test against an esbuild bundle with `react`/wordLibrary externalized,
// which contains the exact same source for every function under test.
const BUNDLE = process.env.PROGRESS_BUNDLE
if (!BUNDLE) throw new Error('Set PROGRESS_BUNDLE to the esbuild output path (see comment above)')
const { pathToFileURL } = await import('node:url')
const {
  freshRecord, freshRound, freshHistoryDay, calcStreak, countCategoriesCompleted, GOAL, migrateOldData,
  isEmptyRecord, spellingComboBonus, SPELLING_COMBO_BONUS, movePlacementInList,
  normalizeRecord, mergeProgressRecords,
} = await import(pathToFileURL(BUNDLE).href)

const STORE_KEY = 'paul_easy_progress'
function loadStore() { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }
function saveStore(store) { localStorage.setItem(STORE_KEY, JSON.stringify(store)) }

let failures = 0
function check(label, cond) {
  if (cond) { console.log(`  PASS  ${label}`) }
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. 미션 4개 완료 -> categoriesCompleted 계산')
{
  const name = 'TestKid'
  const store = { [name]: freshRecord(name) }
  saveStore(store)

  const rec = store[name]
  // Simulate viewing 5 words, hearing 5 examples, solving 5 quizzes, 5 pronunciations
  for (let i = 0; i < 5; i++) rec.round.wordsViewed.push(`w${i}`)
  rec.round.examplesHeard = 3
  rec.round.quizSolved = 5
  rec.round.pronunciationOk = 5
  check('단어5/예문3/퀴즈5/발음5 -> 3개 카테고리 완료', countCategoriesCompleted(rec.round) === 3)

  rec.round.examplesHeard = 5
  check('4개 카테고리 모두 완료 -> count === 4', countCategoriesCompleted(rec.round) === 4)

  const today = rec.round.date
  rec.history[today] = { ...freshHistoryDay(), categoriesCompleted: 4, giftsToday: 1, starsEarned: 30, stickersEarned: ['ukflag1'] }
  saveStore(store)

  // Round resets for the next repeat, but today's history stays latched at 4
  rec.round = freshRound()
  saveStore(store)
  const reloaded = loadStore()[name]
  check('메인 화면(오늘 라운드) 4/4 반영 전 리셋 후에도 캘린더 기록은 4로 유지', reloaded.history[today].categoriesCompleted === 4)
  check('메인/캘린더가 같은 값을 읽음 (동일 필드)', reloaded.history[today].categoriesCompleted === 4 && countCategoriesCompleted(freshRound()) === 0)
}

console.log('\n2. 별/스티커 동일하게 표시 (하나의 store에서 읽음)')
{
  const name = 'TestKid'
  const store = loadStore()
  const rec = store[name]
  const today = rec.round.date
  check('별 30개 기록', rec.history[today].starsEarned === 30)
  check('스티커 1개(🇬🇧) 기록', rec.history[today].stickersEarned.includes('ukflag1'))
}

console.log('\n3. 새로고침(재로드) 후에도 유지')
{
  // Simulate app reload: re-parse the SAME localStorage key from scratch.
  const before = loadStore()['TestKid']
  const reparsed = JSON.parse(localStorage.getItem(STORE_KEY))['TestKid']
  check('totalStars 유지', reparsed.totalStars === before.totalStars)
  check('stickers 유지', JSON.stringify(reparsed.stickers) === JSON.stringify(before.stickers))
  check('history 유지', JSON.stringify(reparsed.history) === JSON.stringify(before.history))
}

console.log('\n4. 날짜가 바뀌면 오늘 미션만 초기화, 누적 데이터는 유지')
{
  const name = 'TestKid'
  const store = loadStore()
  const rec = store[name]
  rec.totalStars = 500
  rec.stickers = ['ukflag1', 'crown1']
  rec.round = { date: 'Wed Jul 01 2026', wordsViewed: ['a', 'b', 'c'], examplesHeard: 2, quizSolved: 1, pronunciationOk: 0 }
  saveStore(store)

  // Simulate the hook's midnight-check: round.date !== todayStr() -> reset round only
  const todayStrFake = () => 'Sun Jul 05 2026' // pretend "today" has moved on
  const isStale = rec.round.date !== todayStrFake()
  const afterMidnight = isStale ? { ...rec, round: freshRound() } : rec
  // freshRound() stamps the REAL today, not our fake one, but the reset
  // mechanics (wiping wordsViewed/examplesHeard/quizSolved/pronunciationOk)
  // are what matters here.
  check('날짜가 바뀌면 wordsViewed 초기화', afterMidnight.round.wordsViewed.length === 0)
  check('날짜가 바뀌면 examplesHeard 초기화', afterMidnight.round.examplesHeard === 0)
  check('날짜가 바뀌면 quizSolved 초기화', afterMidnight.round.quizSolved === 0)
  check('날짜가 바뀌면 pronunciationOk 초기화', afterMidnight.round.pronunciationOk === 0)
  check('totalStars는 유지', afterMidnight.totalStars === 500)
  check('stickers는 유지', afterMidnight.stickers.length === 2)
  check('history(캘린더 기록)는 유지', Object.keys(afterMidnight.history).length > 0)
  check('studentId는 유지', afterMidnight.studentId === name)
}

console.log('\n5. 스트릭 계산 (연속 완료일)')
{
  const d = new Date()
  const key = (offset) => { const x = new Date(d); x.setDate(x.getDate() - offset); return x.toDateString() }
  const history = {
    [key(0)]: { categoriesCompleted: 4 },
    [key(1)]: { categoriesCompleted: 4 },
    [key(2)]: { categoriesCompleted: 2 }, // breaks the streak (not fully completed)
  }
  check('오늘/어제 4/4 완료, 그저께는 미완료 -> streak === 2', calcStreak(history) === 2)
}

console.log('\n6. 게임 플레이 기록 (v1.1)')
{
  const day = freshHistoryDay()
  check('새 히스토리 day에 gamesPlayed 빈 객체 기본값', JSON.stringify(day.gamesPlayed) === '{}')

  // Simulate what recordGamePlayed does (same increment logic, since the
  // real function is a hook-internal callback wrapping bumpHistory/patch).
  const bumped1 = { ...day, gamesPlayed: { ...(day.gamesPlayed || {}), balloon: (day.gamesPlayed?.balloon || 0) + 1 } }
  const bumped2 = { ...bumped1, gamesPlayed: { ...(bumped1.gamesPlayed || {}), balloon: (bumped1.gamesPlayed?.balloon || 0) + 1 } }
  const bumped3 = { ...bumped2, gamesPlayed: { ...(bumped2.gamesPlayed || {}), fishing: (bumped2.gamesPlayed?.fishing || 0) + 1 } }
  check('풍선 게임 2번 플레이 -> balloon: 2', bumped3.gamesPlayed.balloon === 2)
  check('낚시 게임 1번 플레이 -> fishing: 1', bumped3.gamesPlayed.fishing === 1)

  // Seed a pre-v1.1 scattered-key history entry (no gamesPlayed field at all)
  // to confirm migration backfills it instead of leaving it undefined.
  localStorage.setItem('paulEasyVoca_OldKid_history', JSON.stringify({
    'Mon Jan 01 2026': { missionsCompleted: 1, starsEarned: 10, stickersEarned: [] },
  }))
  const oldHistoryEntry = migrateOldData('OldKid', 'OldKid-id').history
  check('구버전 기록 마이그레이션 시 gamesPlayed는 빈 객체로 채워짐 (undefined 아님)',
    Object.values(oldHistoryEntry).length > 0 &&
    Object.values(oldHistoryEntry).every(d => d.gamesPlayed && typeof d.gamesPlayed === 'object'))
}

console.log('\n7. 퀴즈 정답률/발음 횟수/틀린 단어 (v1.3)')
{
  const day = freshHistoryDay()
  check('새 히스토리 day에 quizCorrect/quizTotal/pronunciationAttempts/missedWordIds 기본값',
    day.quizCorrect === 0 && day.quizTotal === 0 && day.pronunciationAttempts === 0 &&
    JSON.stringify(day.missedWordIds) === '[]')

  // Simulate recordQuizAnswer's logic: 2 correct, 1 wrong (word 'apple' missed twice)
  const simulateAnswer = (d, wordId, correct) => ({
    ...d,
    quizTotal: (d.quizTotal || 0) + 1,
    quizCorrect: (d.quizCorrect || 0) + (correct ? 1 : 0),
    missedWordIds: correct ? (d.missedWordIds || []) : [...(d.missedWordIds || []), wordId],
  })
  let d = day
  d = simulateAnswer(d, 'banana', true)
  d = simulateAnswer(d, 'apple', false)
  d = simulateAnswer(d, 'apple', false)
  check('3문제 중 1개 정답 -> quizCorrect === 1', d.quizCorrect === 1)
  check('3문제 시도 -> quizTotal === 3', d.quizTotal === 3)
  check('apple을 2번 틀림 -> missedWordIds에 apple이 2번 기록됨',
    d.missedWordIds.filter(w => w === 'apple').length === 2)

  // Simulate markPronunciationAttempt's logic: 2 attempts (success + fail both count)
  let p = day
  p = { ...p, pronunciationAttempts: (p.pronunciationAttempts || 0) + 1 }
  p = { ...p, pronunciationAttempts: (p.pronunciationAttempts || 0) + 1 }
  check('발음 시도 2번(성공+실패 모두) -> pronunciationAttempts === 2', p.pronunciationAttempts === 2)

  // Migration backfill check, same pattern as gamesPlayed above
  localStorage.setItem('paulEasyVoca_OldKid2_history', JSON.stringify({
    'Mon Jan 01 2026': { missionsCompleted: 1, starsEarned: 5, stickersEarned: [] },
  }))
  const migrated = migrateOldData('OldKid2', 'OldKid2-id').history
  check('구버전 기록 마이그레이션 시 v1.3 필드도 안전한 기본값으로 채워짐',
    Object.values(migrated).length > 0 &&
    Object.values(migrated).every(d => d.quizCorrect === 0 && d.quizTotal === 0 &&
      d.pronunciationAttempts === 0 && Array.isArray(d.missedWordIds)))
}

console.log('\n8.5. 카테고리 0개 완료 상태에서도 history 기록 생김 (v1.5 버그 수정 — 홈엔 기록 있는데 캘린더는 비어보이던 버그)')
{
  // Reproduces the reported bug: student opens a word (studied today) but
  // hasn't finished any of the 4 categories yet (categoriesCompleted 0/4).
  // Before the fix, bumpHistory was only called once a category hit GOAL,
  // so history[today] never existed at all on a 0/4 day — the calendar
  // grid/streak looked completely empty even though the home screen showed
  // live in-progress round data. markWordViewed now also calls
  // bumpHistory(() => ({})), which creates the entry (via freshHistoryDay())
  // the moment a word is first viewed, regardless of category completion.
  const name = 'PartialKid'
  const store = { [name]: freshRecord(name) }
  saveStore(store)
  const rec = store[name]
  const today = rec.round.date

  check('활동 전에는 history 비어있음', Object.keys(rec.history).length === 0)

  // Simulate markWordViewed's bumpHistory(() => ({})) call on first word view
  rec.round.wordsViewed.push('w0')
  rec.history[today] = { ...(rec.history[today] || freshHistoryDay()) }
  saveStore(store)

  check('단어 1개만 봐도(카테고리 미완료) history[오늘] 엔트리가 생김', !!rec.history[today])
  check('studied: true로 기록됨 (캘린더 팝업의 "공부했어요!" 근거)', rec.history[today].studied === true)
  check('아직 카테고리는 0개 완료 상태', countCategoriesCompleted(rec.round) === 0)
  check('categoriesCompleted도 0으로 정확히 반영 (아직 조작 안 했으므로)', rec.history[today].categoriesCompleted === 0)
  check('0/4 상태는 스트릭에 포함되지 않음 (4/4 필요, 정상 동작)', calcStreak(rec.history) === 0)
}

console.log('\n8. 쓰기 시험 오답노트 (spellingWrongToday)')
{
  const round = freshRound()
  check('새 round에 spellingWrongToday 빈 배열 기본값', Array.isArray(round.spellingWrongToday) && round.spellingWrongToday.length === 0)

  // Simulate recordSpellingAnswer's logic: wrong answers get added (deduped), correct answers don't
  const addWrong = (r, wordId) => r.spellingWrongToday.includes(wordId) ? r : { ...r, spellingWrongToday: [...r.spellingWrongToday, wordId] }
  let r = round
  r = addWrong(r, 'apple')
  r = addWrong(r, 'banana')
  r = addWrong(r, 'apple') // 중복 — 이미 있으면 추가 안 됨
  check('apple을 두 번 틀려도 오답노트엔 한 번만 기록됨(중복 제거)', r.spellingWrongToday.filter(w => w === 'apple').length === 1)
  check('오답노트에 apple, banana 둘 다 있음', r.spellingWrongToday.includes('apple') && r.spellingWrongToday.includes('banana'))

  // Simulate clearSpellingReviewWord's logic: removes one word from the queue
  const clear = (r, wordId) => ({ ...r, spellingWrongToday: r.spellingWrongToday.filter(id => id !== wordId) })
  r = clear(r, 'apple')
  check('복습에서 apple을 맞히면 오답노트에서 제거됨', !r.spellingWrongToday.includes('apple'))
  check('banana는 그대로 남아있음', r.spellingWrongToday.includes('banana'))
  r = clear(r, 'banana')
  check('전부 맞히면 오답노트가 빈 배열이 됨(복습 종료 조건)', r.spellingWrongToday.length === 0)

  const day = freshHistoryDay()
  check('새 히스토리 day에 spellingCorrect/spellingTotal 기본값 0', day.spellingCorrect === 0 && day.spellingTotal === 0)
}

console.log('\n8.7. 쓰기시험 콤보 보너스 (P3 게임화) — 보수적 지급 + 하위호환')
{
  check('새 round에 spellingCombo 기본값 0', freshRound().spellingCombo === 0)

  // 마일스톤 정의 자체가 보수적인지 — 기존 별 경제 기준(미션 보너스 10,
  // 중복 스티커 20)보다 항상 작아야 하고, 한 콤보 런에서 최대 +6.
  check('콤보 보너스는 3/5/10 세 마일스톤뿐', JSON.stringify(Object.keys(SPELLING_COMBO_BONUS).sort((a, b) => a - b)) === JSON.stringify(['3', '5', '10']))
  check('각 보너스가 미션 보너스(10)보다 훨씬 작음 (최대 3)', Object.values(SPELLING_COMBO_BONUS).every(v => v >= 1 && v <= 3))
  check('한 콤보 런 최대 누적 보너스 = 6 (인플레이션 방지)', Object.values(SPELLING_COMBO_BONUS).reduce((a, b) => a + b, 0) === 6)

  // spellingComboBonus는 "정확히 그 콤보에 도달한 순간"에만 지급
  check('콤보 1~2는 보너스 없음', spellingComboBonus(1) === 0 && spellingComboBonus(2) === 0)
  check('콤보 3 도달 -> +1', spellingComboBonus(3) === 1)
  check('콤보 4는 추가 지급 없음(3에서 이미 지급)', spellingComboBonus(4) === 0)
  check('콤보 5 도달 -> +2', spellingComboBonus(5) === 2)
  check('콤보 10 도달 -> +3', spellingComboBonus(10) === 3)
  check('콤보 10 초과는 끊기기 전까지 추가 지급 없음', spellingComboBonus(11) === 0 && spellingComboBonus(20) === 0)
  check('콤보 0/음수/이상값에도 안전하게 0', spellingComboBonus(0) === 0 && spellingComboBonus(-1) === 0 && spellingComboBonus(undefined) === 0)

  // recordSpellingAnswer의 콤보 로직 시뮬레이션(같은 (||0)+1 / 리셋 규칙):
  // 정답 3연속 -> 오답 -> 다시 정답. 오답노트 로직은 콤보와 독립적으로 기존
  // 그대로인지도 함께 확인.
  const step = (r, wordId, correct) => correct
    ? { round: { ...r.round, spellingCombo: (r.round.spellingCombo || 0) + 1 } }
    : {
        round: {
          ...r.round,
          spellingCombo: 0,
          spellingWrongToday: r.round.spellingWrongToday.includes(wordId)
            ? r.round.spellingWrongToday
            : [...r.round.spellingWrongToday, wordId],
        },
      }
  let rec = { round: freshRound() }
  let starsAwarded = 0
  const answer = (wordId, correct) => {
    rec = { ...rec, ...step(rec, wordId, correct) }
    if (correct) starsAwarded += spellingComboBonus(rec.round.spellingCombo)
  }
  answer('a', true); answer('b', true); answer('c', true)
  check('3연속 정답 -> 콤보 3, 별 +1', rec.round.spellingCombo === 3 && starsAwarded === 1)
  answer('d', false)
  check('오답 -> 콤보 0으로 리셋', rec.round.spellingCombo === 0)
  check('오답노트에는 기존 로직대로 추가됨(콤보와 무관)', rec.round.spellingWrongToday.includes('d'))
  answer('e', true)
  check('리셋 후 다시 1부터 (별 추가 지급 없음)', rec.round.spellingCombo === 1 && starsAwarded === 1)
  answer('f', true); answer('g', true)
  check('다시 3연속 도달 -> 또 +1 (런마다 한 번씩)', rec.round.spellingCombo === 3 && starsAwarded === 2)

  // 하위호환 — 기존 학생의 저장된 round에는 spellingCombo 필드가 없음.
  // (||0) 방어로 첫 정답에 1이 되어야 하고, 크래시 없어야 함.
  const legacyRound = freshRound()
  delete legacyRound.spellingCombo
  let legacy = { round: legacyRound }
  legacy = { ...legacy, ...step(legacy, 'x', true) }
  check('spellingCombo 없는 기존 레코드 -> 첫 정답에 콤보 1 (크래시/NaN 없음)', legacy.round.spellingCombo === 1)
  const legacyWrong = { round: (() => { const r = freshRound(); delete r.spellingCombo; return r })() }
  const afterWrong = { ...legacyWrong, ...step(legacyWrong, 'y', false) }
  check('spellingCombo 없는 기존 레코드 -> 오답 시 0으로 세팅 + 오답노트 정상', afterWrong.round.spellingCombo === 0 && afterWrong.round.spellingWrongToday.includes('y'))

  // 구버전(흩어진 키) 마이그레이션 라운드에도 spellingCombo 기본값 채워짐
  localStorage.setItem('paulEasyVoca_ComboOldKid_round', JSON.stringify({ date: new Date().toDateString(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0 }))
  const migratedRec = migrateOldData('ComboOldKid', 'ComboOldKid-id')
  check('구버전 round 마이그레이션 시 spellingCombo 0으로 채워짐', migratedRec.round.spellingCombo === 0)
}

console.log('\n8.8. 다이어리 레이어 순서 (P4) — 배열 재정렬 방식 + 기존 데이터 하위호환')
{
  const mk = (id, extra = {}) => ({ placementId: id, stickerId: 's1', x: 50, y: 50, rotation: 0, scale: 1, ...extra })
  const list = [mk('a'), mk('b'), mk('c')] // 그리기 순서: a(맨 뒤) -> b -> c(맨 앞)

  const front = movePlacementInList(list, 'b', 'front')
  check("가운데 스티커 '앞으로' -> 한 칸 위로 (a,c,b)", front.map(p => p.placementId).join(',') === 'a,c,b')
  const back = movePlacementInList(list, 'b', 'back')
  check("가운데 스티커 '뒤로' -> 한 칸 아래로 (b,a,c)", back.map(p => p.placementId).join(',') === 'b,a,c')

  check('맨 앞 스티커는 더 앞으로 못 감 (원본 그대로 반환)', movePlacementInList(list, 'c', 'front') === list)
  check('맨 뒤 스티커는 더 뒤로 못 감 (원본 그대로 반환)', movePlacementInList(list, 'a', 'back') === list)
  check('없는 placementId면 아무 일도 안 일어남', movePlacementInList(list, 'nope', 'front') === list)
  check('빈 배열도 안전', movePlacementInList([], 'a', 'front').length === 0)

  check('원본 배열은 절대 변형되지 않음 (불변성)', list.map(p => p.placementId).join(',') === 'a,b,c')
  check('재정렬해도 각 placement 객체의 필드는 그대로 (스키마 변경 없음 = 하위호환)',
    JSON.stringify(Object.keys(front[2]).sort()) === JSON.stringify(Object.keys(mk('x')).sort()))

  // 하위호환 — rotation/scale 필드가 없는 아주 예전 배치 데이터도 재정렬
  // 가능해야 하고, 필드가 새로 생기거나 사라지면 안 됨.
  const legacy = [
    { placementId: 'old1', stickerId: 's1', x: 30, y: 30 }, // rotation/scale 없음
    mk('new1', { rotation: 45, scale: 2 }),
  ]
  const reordered = movePlacementInList(legacy, 'old1', 'front')
  check('rotation/scale 없는 레거시 배치도 재정렬 정상', reordered.map(p => p.placementId).join(',') === 'new1,old1')
  check('레거시 배치 객체가 그대로 보존됨 (필드 추가/삭제 없음)',
    JSON.stringify(reordered[1]) === JSON.stringify(legacy[0]))
  check('회전/크기 값이 있는 배치도 값 그대로 보존', reordered[0].rotation === 45 && reordered[0].scale === 2)
}

console.log('\n9. isEmptyRecord — 클라우드 백업 복구 여부를 판단하는 기준 (v1.4)')
{
  check('갓 생성한 freshRecord는 비어있다고 판단', isEmptyRecord(freshRecord('NewKid')))

  const withStars = { ...freshRecord('K'), totalStars: 1 }
  check('별이 하나라도 있으면 비어있지 않음', !isEmptyRecord(withStars))

  const withHistory = { ...freshRecord('K'), history: { 'Wed Jul 01 2026': freshHistoryDay() } }
  check('캘린더 기록이 하나라도 있으면 비어있지 않음', !isEmptyRecord(withHistory))

  const withStickers = { ...freshRecord('K'), stickers: ['ukflag1'] }
  check('스티커가 하나라도 있으면 비어있지 않음', !isEmptyRecord(withStickers))

  const withMissions = { ...freshRecord('K'), missions: [{ wordId: 'apple', correctCount: 1, done: false }] }
  check('레벨업 미션이 하나라도 있으면 비어있지 않음', !isEmptyRecord(withMissions))
}

console.log('\n10.5. Phase 2 M3(2026-08-03) — completedWords/clearedWords 학습 신호 초기값 + 멱등성 + 축 독립')
{
  const fresh = freshRecord('SignalKid')
  check('freshRecord에 completedWords 빈 배열 기본값', Array.isArray(fresh.completedWords) && fresh.completedWords.length === 0)
  check('freshRecord에 clearedWords 빈 배열 기본값', Array.isArray(fresh.clearedWords) && fresh.clearedWords.length === 0)
  check('completedWords/clearedWords가 비어있으면 여전히 isEmptyRecord 판정에 영향 없음(기존 기준 그대로)', isEmptyRecord(fresh))

  // markWordCompleted/markWordCleared는 hook-internal(patch 경유) 콜백이라
  // 여기서 직접 import할 수 없다 — 실제 구현과 정확히 같은 "이미 있으면
  // no-op, 없으면 append" 규칙을 시뮬레이션해 멱등성/독립성을 확인한다
  // (recordGamePlayed 시뮬레이션과 동일 패턴, 위 6번 참고).
  const markCompleted = (arr, slug) => arr.includes(slug) ? arr : [...arr, slug]
  const markCleared = (arr, slug) => arr.includes(slug) ? arr : [...arr, slug]

  let completedWords = fresh.completedWords
  completedWords = markCompleted(completedWords, 'apple')
  completedWords = markCompleted(completedWords, 'apple') // 중복 호출 — no-op
  completedWords = markCompleted(completedWords, 'banana')
  check('같은 단어를 두 번 완료 처리해도 한 번만 기록(멱등)', completedWords.filter(w => w === 'apple').length === 1)
  check('서로 다른 단어는 각각 기록됨', completedWords.includes('apple') && completedWords.includes('banana'))

  let clearedWords = fresh.clearedWords
  clearedWords = markCleared(clearedWords, 'apple') // 첫 시도 정답
  clearedWords = markCleared(clearedWords, 'apple') // 재시도 정답 — 이미 있으므로 no-op
  check('같은 단어를 재시도로 다시 맞혀도 clearedWords는 한 번만 기록(멱등)', clearedWords.filter(w => w === 'apple').length === 1)

  // 세 축(cleared/completedWords/clearedWords)의 완전한 독립 — 같은
  // 슬러그로 하나를 채워도 다른 두 축과 기존 cleared 배열은 절대 안 바뀜.
  const rec = { ...fresh, cleared: ['apple'], completedWords, clearedWords }
  check('cleared(레벨업 미션)는 completedWords/clearedWords 갱신과 무관하게 그대로', rec.cleared.length === 1 && rec.cleared[0] === 'apple')
  check('completedWords 갱신이 clearedWords 배열 참조를 바꾸지 않음(별개 배열)', rec.completedWords !== rec.clearedWords)
  check('completed 처리된 단어가 cleared(레벨업 미션) 배열엔 자동으로 안 들어감(축 독립)', !rec.cleared.includes('banana'))
}

console.log('\n10.6. Phase 2 M4a(2026-08-04) — round.completedToday 일별 카운터(관측 배선, 보상 판정 무변경)')
{
  // 자정 리셋 — round.date가 오늘이 아니면 normalizeRecord가 round를 통째로
  // freshRound()로 리셋한다(완전히 기존 wordsViewed와 동일한 경로) — 영구
  // completedWords는 이 리셋과 무관하게 그대로 보존되는지가 핵심(축 분리 증명).
  const staleRaw = { completedWords: ['apple'], round: { date: 'Mon Jan 01 2001', completedToday: ['a', 'b', 'c', 'd', 'e'] } }
  const normalized = normalizeRecord(staleRaw, 'MidnightKid')
  check('자정 롤오버 — round.completedToday가 0으로 리셋됨', normalized.round.completedToday.length === 0)
  check('자정 롤오버 — completedWords(영구)는 그대로 보존(영구/일별 축 분리 증명)',
    normalized.completedWords.length === 1 && normalized.completedWords[0] === 'apple')

  // union 병합 — local[a,b] + cloud[b,c] = [a,b,c](중복 b는 1개만)
  const localRaw = { round: { ...freshRound(), completedToday: ['a', 'b'] } }
  const cloudRaw = { round: { ...freshRound(), completedToday: ['b', 'c'] } }
  const merged = mergeProgressRecords(localRaw, cloudRaw, 'MergeKid')
  check('union 병합 — local[a,b]+cloud[b,c] = [a,b,c](중복 b 1개)',
    merged.round.completedToday.length === 3 && ['a', 'b', 'c'].every(w => merged.round.completedToday.includes(w)))

  // markWordCompleted는 hook-internal(patch 경유) 콜백이라 여기서 직접
  // import할 수 없다 — 실제 구현(src/hooks/useStudent.js)과 정확히 같은
  // "completedWords/round.completedToday 각각 독립적으로 이미 있으면 no-op"
  // 규칙을 그대로 시뮬레이션(위 10.5의 markCompleted 시뮬레이션과 동일 패턴).
  const markWordCompletedSim = (rec, slug) => {
    const alreadyPermanent = rec.completedWords.includes(slug)
    const alreadyToday = rec.round.completedToday.includes(slug)
    return {
      ...rec,
      completedWords: alreadyPermanent ? rec.completedWords : [...rec.completedWords, slug],
      round: { ...rec.round, completedToday: alreadyToday ? rec.round.completedToday : [...rec.round.completedToday, slug] },
    }
  }

  // 멱등 — markWordCompleted('apple') x3 -> completedToday.length === 1
  let idemRec = freshRecord('IdemKid')
  idemRec = markWordCompletedSim(idemRec, 'apple')
  idemRec = markWordCompletedSim(idemRec, 'apple')
  idemRec = markWordCompletedSim(idemRec, 'apple')
  check('markWordCompleted(apple) x3 — round.completedToday.length === 1(멱등)', idemRec.round.completedToday.length === 1)
  check('markWordCompleted(apple) x3 — completedWords.length === 1(기존 동작 그대로)', idemRec.completedWords.length === 1)

  // 복습일 시나리오 — 유닛을 한 바퀴 돈 뒤(completedWords에 이미 기록) 자정
  // 롤오버 후 같은 단어를 다시 완료해도 completedToday는 정상적으로 1로
  // 기록되고(그날의 관측치는 살아있음), completedWords는 여전히 1(멱등 —
  // 여기서 XP를 판정한다면 무한 파밍이 안 된다는 근거, 이번 마일스톤에서
  // 실제 판정 연결은 없음).
  let reviewRec = freshRecord('ReviewKid')
  reviewRec = markWordCompletedSim(reviewRec, 'apple') // 1라운드차 완료
  check('복습일 준비 — 1라운드차 completedWords/completedToday 둘 다 1', reviewRec.completedWords.length === 1 && reviewRec.round.completedToday.length === 1)
  reviewRec = { ...reviewRec, round: freshRound() } // 자정 롤오버(normalizeRecord와 동일 — round만 리셋)
  check('자정 롤오버 직후 — completedToday === 0, completedWords는 1 보존', reviewRec.round.completedToday.length === 0 && reviewRec.completedWords.length === 1)
  reviewRec = markWordCompletedSim(reviewRec, 'apple') // 복습일에 같은 단어 재완료
  check('복습일 시나리오 — 재완료 후 completedToday.length === 1(오늘 처음이라 정상 기록됨, XP 0 회귀 없음)', reviewRec.round.completedToday.length === 1)
  check('복습일 시나리오 — completedWords.length는 여전히 1(멱등, 증가하지 않음)', reviewRec.completedWords.length === 1)
}

console.log('\n10.7. Phase 2 M4d(2026-08-05) — history[date].completedTodayCount (round.completedToday 영구 스냅샷, 관측 배선)')
{
  // measurement-m4d-gate-2026-08-05가 실측한 문제: round.completedToday는
  // 자정 롤오버로 리셋되고, history[date]엔 그 카운트를 저장하는 필드가
  // 없어 과거 날짜 값이 영구 유실됐다. 아래는 useStudent.js의 실제 훅
  // (bumpHistory 기반 useEffect)과 정확히 같은 규칙 — "round.completedToday.length가
  // 기존 기록보다 커졌을 때만" 기록 — 을 시뮬레이션한다(hook-internal이라
  // 직접 import 불가, 위 markWordCompletedSim과 동일한 근거).
  const bumpCompletedTodayCountSim = (rec) => {
    const today = rec.round.date
    const count = rec.round.completedToday.length
    const day = rec.history[today] || freshHistoryDay()
    const existing = day.completedTodayCount || 0
    if (count <= existing) return rec
    return { ...rec, history: { ...rec.history, [today]: { ...day, completedTodayCount: count } } }
  }

  // high-water — 늘어날 때만 기록, 줄어들면(불가능하지만 방어적으로) 유지
  let hw = freshRecord('HighWaterKid')
  hw.round.completedToday = ['a']
  hw = bumpCompletedTodayCountSim(hw)
  check('completedToday 1개 -> completedTodayCount = 1', hw.history[hw.round.date].completedTodayCount === 1)
  hw.round.completedToday = ['a', 'b', 'c']
  hw = bumpCompletedTodayCountSim(hw)
  check('completedToday 3개로 증가 -> completedTodayCount = 3', hw.history[hw.round.date].completedTodayCount === 3)
  const beforeDowngrade = hw.history[hw.round.date].completedTodayCount
  hw.round.completedToday = ['a'] // 실제로는 절대 줄어들지 않지만(dedup append-only) 방어 확인
  hw = bumpCompletedTodayCountSim(hw)
  check('completedToday가 줄어도 completedTodayCount는 절대 감소하지 않음(high-water)', hw.history[hw.round.date].completedTodayCount === beforeDowngrade && beforeDowngrade === 3)

  // 자정 롤오버 — 새 history[date] 엔트리가 열려도 어제자 완전한 카운트는
  // bumpHistory가 건드리지 않으므로 그대로 보존된다(정확히 measurement-m4d-gate가
  // 실측한 유실 시나리오의 수정판).
  const yesterday = 'Tue Aug 04 2026'
  let rollover = freshRecord('RolloverKid')
  rollover.history[yesterday] = { ...freshHistoryDay(), completedTodayCount: 5 }
  rollover.round = { ...freshRound(), date: yesterday, completedToday: ['a', 'b', 'c', 'd', 'e'] }
  // normalizeRecord가 실제 자정 체크(round.date !== todayStr())를 수행 —
  // round만 오늘로 리셋되고 history[yesterday]는 그대로 남는다.
  const normalizedRollover = normalizeRecord(rollover, 'RolloverKid')
  check('자정 롤오버 후 — round는 오늘로 리셋(completedToday 0)', normalizedRollover.round.completedToday.length === 0)
  check('자정 롤오버 후 — 어제 history[date].completedTodayCount=5 그대로 보존(유실 없음)', normalizedRollover.history[yesterday].completedTodayCount === 5)
  // 오늘 새로 학습을 시작해도 어제 값과 독립적으로 0에서 다시 쌓인다
  let today2 = { ...normalizedRollover, round: { ...normalizedRollover.round, completedToday: ['x'] } }
  today2 = bumpCompletedTodayCountSim(today2)
  check('오늘 새 엔트리는 0에서 다시 시작(어제 값과 무관)', today2.history[today2.round.date].completedTodayCount === 1)
  check('오늘 엔트리 갱신이 어제 값을 건드리지 않음', today2.history[yesterday].completedTodayCount === 5)

  // 하위호환 — 구버전 레코드(필드 자체 없음)는 크래시 없이 0으로 정규화
  const legacyDay = { studentId: 'LegacyKid', history: { [yesterday]: { studied: true, categoriesCompleted: 4 } } }
  const normalizedLegacy = normalizeRecord(legacyDay, 'LegacyKid')
  check('구버전 history[date](completedTodayCount 필드 없음) -> 0으로 안전 정규화(NaN 아님)',
    normalizedLegacy.history[yesterday].completedTodayCount === 0 && !Number.isNaN(normalizedLegacy.history[yesterday].completedTodayCount))

  // 병합 — max (categoriesCompleted와 동일 규칙)
  const localMerge = { ...freshRecord('MergeCountKid'), history: { [yesterday]: { ...freshHistoryDay(), completedTodayCount: 2 } } }
  const cloudMerge = { ...freshRecord('MergeCountKid'), history: { [yesterday]: { ...freshHistoryDay(), completedTodayCount: 5 } } }
  const mergedCount = mergeProgressRecords(localMerge, cloudMerge, 'MergeCountKid')
  check('병합 — completedTodayCount max(2,5)=5(더 진전된 쪽 유실 없음)', mergedCount.history[yesterday].completedTodayCount === 5)
  const mergedCountRev = mergeProgressRecords(cloudMerge, localMerge, 'MergeCountKid')
  check('병합 대칭성 — 방향을 바꿔도 max(5,2)=5로 동일', mergedCountRev.history[yesterday].completedTodayCount === 5)
}

console.log('\n10. wordStatus (v1.5 Skip 기능) — 새 필드가 기존 로직을 깨뜨리지 않는지')
{
  const fresh = freshRecord('SkipKid')
  check('freshRecord에 wordStatus 빈 객체 기본값', JSON.stringify(fresh.wordStatus) === '{}')
  check('wordStatus가 비어있으면 여전히 isEmptyRecord = true', isEmptyRecord(fresh))

  const withKnown = { ...freshRecord('K'), wordStatus: { 'word-uuid-1': 'known' } }
  check('알아요 표시한 단어가 하나라도 있으면 isEmptyRecord = false (클라우드 복구 대상에서 제외 안 됨)', !isEmptyRecord(withKnown))

  const migrated = migrateOldData('OldKid3', 'OldKid3-id')
  check('구버전 기록 마이그레이션 시 wordStatus도 안전한 기본값({})으로 채워짐', JSON.stringify(migrated.wordStatus) === '{}')
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
