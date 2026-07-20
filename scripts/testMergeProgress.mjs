// v2.2 다중 기기 진행도 병합(mergeProgressRecords) 순수 함수 테스트.
// testProgress.mjs와 같은 하네스(PROGRESS_BUNDLE — 실제 useStudent.js를
// esbuild로 번들한 코드, 손으로 옮겨적은 사본 아님)로 실행:
//   node scripts/buildProgressBundle.mjs
//   PROGRESS_BUNDLE=scripts/.tmp/useStudent.progress.bundle.mjs node scripts/testMergeProgress.mjs
//
// 핵심 검증: "파괴적 축소 방지" — 병합 결과가 양쪽 어느 기기의 진행분도
// 잃지 않는다(필드별). + A/B 교차 사용 시나리오, 한쪽 빈 경우, 구스키마
// blob 하위호환, 다이어리 삭제 tombstone, 멱등성.
import { pathToFileURL } from 'node:url'

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
globalThis.localStorage = new FakeStorage()

const BUNDLE = process.env.PROGRESS_BUNDLE
if (!BUNDLE) throw new Error('Set PROGRESS_BUNDLE (see comment above)')
const {
  mergeProgressRecords, freshRecord, freshRound, freshHistoryDay, normalizeRecord,
  todayStr, isEmptyRecord, DIARY_TOMBSTONE_CAP,
} = await import(pathToFileURL(BUNDLE).href)

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}
const ID = 'QA_MERGE_KID'
const today = todayStr()

// 공통 조상: 별 50, 스티커 s1, cleared [a,b], 미션 apple(1), 어제 히스토리
function ancestor() {
  const r = freshRecord(ID)
  r.totalStars = 50
  r.stickers = ['s1']
  r.cleared = ['a', 'b']
  r.missions = [{ wordId: 'apple', correctCount: 1, done: false }]
  r.diaryPlacements = [{ placementId: 'p1', stickerId: 's1', x: 1, y: 1, rotation: 0, scale: 1 }]
  r.history = { 'Wed Jul 16 2026': { ...freshHistoryDay(), starsEarned: 10, quizTotal: 4, quizCorrect: 3 } }
  r.lastWordIndex = 3
  r.lastWordIndexByUnit = { u1: 3 }
  r.wordStatus = { w1: 'known' }
  return r
}

console.log('\n1. 핵심 유실 시나리오 — A(로컬, 조상+자기 진행)가 B의 진행이 담긴 백업을 덮어쓰지 않음')
{
  // 기기 A: 조상에서 +2 별, cleared d 추가
  const A = ancestor()
  A.totalStars = 52
  A.cleared = ['a', 'b', 'd']
  // 클라우드(=B가 올린 백업): 조상에서 +10 별, cleared c, 스티커 s2, 미션 진전
  const B = ancestor()
  B.totalStars = 60
  B.cleared = ['a', 'b', 'c']
  B.stickers = ['s1', 's2']
  B.missions = [{ wordId: 'apple', correctCount: 3, done: true }]
  B.wordStatus = { w1: 'known', w2: 'unknown' }
  B.lastWordIndexByUnit = { u1: 7, u2: 2 }

  const m = mergeProgressRecords(A, B, ID)
  check('totalStars = max(52, 60) = 60 (B의 별이 사라지지 않음)', m.totalStars === 60)
  check('cleared 합집합 (A의 d + B의 c 모두 보존)', ['a', 'b', 'c', 'd'].every((w) => m.cleared.includes(w)) && m.cleared.length === 4)
  check('stickers 합집합, 중복 없음', m.stickers.length === 2 && m.stickers.includes('s1') && m.stickers.includes('s2'))
  check('미션은 더 진전된 쪽(B의 done)', m.missions.find((x) => x.wordId === 'apple')?.done === true)
  check('wordStatus 합집합 (B에만 있던 w2 보존)', m.wordStatus.w2 === 'unknown' && m.wordStatus.w1 === 'known')
  check('lastWordIndexByUnit 유닛별 max (u1: max(3,7)=7, u2: 2 보존)', m.lastWordIndexByUnit.u1 === 7 && m.lastWordIndexByUnit.u2 === 2)
  check('멱등성 — 같은 병합 반복해도 결과 동일', JSON.stringify(mergeProgressRecords(m, B, ID)) === JSON.stringify(m))
}

console.log('\n2. 대칭성 — 방향을 바꿔도(로컬/클라우드 스왑) 집합·카운터 내용 동일')
{
  const A = ancestor(); A.totalStars = 52; A.cleared = ['a', 'b', 'd']
  const B = ancestor(); B.totalStars = 60; B.cleared = ['a', 'b', 'c']; B.stickers = ['s1', 's2']
  const ab = mergeProgressRecords(A, B, ID)
  const ba = mergeProgressRecords(B, A, ID)
  check('totalStars 동일', ab.totalStars === ba.totalStars)
  check('cleared 집합 동일', JSON.stringify([...ab.cleared].sort()) === JSON.stringify([...ba.cleared].sort()))
  check('stickers 집합 동일', JSON.stringify([...ab.stickers].sort()) === JSON.stringify([...ba.stickers].sort()))
}

console.log('\n3. 한쪽이 빈 경우')
{
  const A = ancestor()
  const m1 = mergeProgressRecords(A, null, ID)
  check('클라우드 null → 로컬 그대로(정규화만)', m1.totalStars === 50 && m1.cleared.length === 2)
  const m2 = mergeProgressRecords(freshRecord(ID), A, ID)
  check('로컬 빈 레코드 → 클라우드 진행분 전부 보존', m2.totalStars === 50 && m2.stickers.includes('s1') && m2.missions.length === 1)
  check('빈+빈 = 빈', isEmptyRecord(mergeProgressRecords(freshRecord(ID), freshRecord(ID), ID)))
}

console.log('\n4. 구스키마 클라우드 blob (normalizeRecord 하위호환 재사용)')
{
  // 2026-07-07 이전 스키마: round에 spellingWrongToday 없음, lastWordIndexByUnit/
  // diaryRemovedIds/wordStatus 없음 — 실제 P0 크래시를 냈던 모양의 blob
  const oldBlob = {
    studentId: ID, totalStars: 33, stickers: ['s9'], diaryPlacements: [], missions: [], cleared: ['z'],
    round: { date: today, wordsViewed: ['w'], examplesHeard: 2, quizSolved: 1, pronunciationOk: 0 },
    history: { [today]: { studied: true, categoriesCompleted: 1, starsEarned: 3 } },
    milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 9,
  }
  const m = mergeProgressRecords(ancestor(), oldBlob, ID)
  check('크래시 없이 병합, 구 blob 진행분 보존 (cleared z, 스티커 s9)', m.cleared.includes('z') && m.stickers.includes('s9'))
  check('round.spellingWrongToday 배열로 정규화', Array.isArray(m.round.spellingWrongToday))
  check('lastWordIndex = max(3, 9) = 9', m.lastWordIndex === 9)
  check('오늘 round 필드별 max/합집합 (wordsViewed w 보존)', m.round.wordsViewed.includes('w') && m.round.examplesHeard === 2)
  check('diaryRemovedIds 빈 배열로 채워짐', Array.isArray(m.diaryRemovedIds))
}

console.log('\n5. 히스토리 — 없는 날짜 합집합 + 같은 날짜 필드별 max')
{
  const A = ancestor()
  A.history = {
    'Tue Jul 15 2026': { ...freshHistoryDay(), starsEarned: 5 },
    [today]: { ...freshHistoryDay(), starsEarned: 8, quizTotal: 10, quizCorrect: 7, stickersEarned: ['x1'], gamesPlayed: { balloon: 2 }, missedWordIds: ['m1'] },
  }
  const B = ancestor()
  B.history = {
    'Mon Jul 14 2026': { ...freshHistoryDay(), starsEarned: 4 },
    [today]: { ...freshHistoryDay(), starsEarned: 12, quizTotal: 6, quizCorrect: 6, stickersEarned: ['x2'], gamesPlayed: { balloon: 1, fishing: 3 }, missedWordIds: ['m2', 'm3'], categoriesCompleted: 3 },
  }
  const m = mergeProgressRecords(A, B, ID)
  check('세 날짜 모두 존재 (없는 날짜 합집합)', ['Tue Jul 15 2026', 'Mon Jul 14 2026', today].every((d) => m.history[d]))
  const d = m.history[today]
  check('같은 날짜: starsEarned max(8,12)=12', d.starsEarned === 12)
  check('같은 날짜: quizTotal max(10,6)=10', d.quizTotal === 10)
  check('같은 날짜: categoriesCompleted max(0,3)=3', d.categoriesCompleted === 3)
  check('같은 날짜: stickersEarned 합집합', d.stickersEarned.includes('x1') && d.stickersEarned.includes('x2'))
  check('같은 날짜: gamesPlayed 게임별 max', d.gamesPlayed.balloon === 2 && d.gamesPlayed.fishing === 3)
  check('같은 날짜: missedWordIds 더 긴 쪽(이중 계산 방지)', JSON.stringify(d.missedWordIds) === JSON.stringify(['m2', 'm3']))
}

console.log('\n6. round — 같은 날 기기 교차(합집합/max), 오늘 아닌 클라우드 round는 리셋')
{
  const A = ancestor()
  A.round = { ...freshRound(), wordsViewed: ['w1', 'w2'], quizSolved: 3, spellingWrongToday: ['sw1'], spellingCombo: 2 }
  const B = ancestor()
  B.round = { ...freshRound(), wordsViewed: ['w2', 'w3'], quizSolved: 1, examplesHeard: 4, spellingWrongToday: ['sw2'], spellingCombo: 5 }
  const m = mergeProgressRecords(A, B, ID)
  check('wordsViewed 합집합(중복 없이 3개)', m.round.wordsViewed.length === 3)
  check('quizSolved max=3, examplesHeard max=4', m.round.quizSolved === 3 && m.round.examplesHeard === 4)
  check('spellingWrongToday 합집합', m.round.spellingWrongToday.includes('sw1') && m.round.spellingWrongToday.includes('sw2'))
  check('spellingCombo max=5', m.round.spellingCombo === 5)

  const C = ancestor()
  C.round = { ...freshRound(), date: 'Mon Jul 14 2026', wordsViewed: ['old1'], quizSolved: 9 }
  const m2 = mergeProgressRecords(A, C, ID)
  check('오늘 아닌 클라우드 round는 버려짐(normalizeRecord 리셋) — 로컬 오늘 round만', !m2.round.wordsViewed.includes('old1') && m2.round.quizSolved === 3)
}

console.log('\n7. 다이어리 — 합집합 + 삭제 tombstone (부활 방지)')
{
  const A = ancestor()
  // A에서 p1 삭제 (removePlacement와 동일한 결과 상태)
  A.diaryPlacements = []
  A.diaryRemovedIds = ['p1']
  A.totalStars = 51
  const B = ancestor() // 클라우드엔 p1이 아직 있고 B가 p2를 추가
  B.diaryPlacements = [
    { placementId: 'p1', stickerId: 's1', x: 1, y: 1, rotation: 0, scale: 1 },
    { placementId: 'p2', stickerId: 's2', x: 5, y: 5, rotation: 0, scale: 1 },
  ]
  const m = mergeProgressRecords(A, B, ID)
  check('삭제한 p1은 부활하지 않음', !m.diaryPlacements.some((p) => p.placementId === 'p1'))
  check('B가 추가한 p2는 보존', m.diaryPlacements.some((p) => p.placementId === 'p2'))
  check('tombstone 자체도 병합 보존(다음 병합에서도 계속 막음)', m.diaryRemovedIds.includes('p1'))

  // 반대 방향: 클라우드 tombstone이 로컬 배치를 제거 (B 기기에서 삭제한 게 A 로그인 병합에 반영)
  const m2 = mergeProgressRecords(B, m, ID)
  check('클라우드 tombstone이 로컬에 남아있던 p1도 제거', !m2.diaryPlacements.some((p) => p.placementId === 'p1'))

  // 같은 placementId 위치 충돌 → 로컬 우선
  const L = ancestor(); L.diaryPlacements = [{ placementId: 'p1', stickerId: 's1', x: 99, y: 99, rotation: 15, scale: 1.2 }]
  const m3 = mergeProgressRecords(L, ancestor(), ID)
  check('같은 배치 id 충돌 시 로컬 좌표 우선', m3.diaryPlacements.find((p) => p.placementId === 'p1').x === 99)

  // tombstone 상한
  const big = ancestor()
  big.diaryRemovedIds = Array.from({ length: DIARY_TOMBSTONE_CAP + 50 }, (_, i) => `t${i}`)
  const m4 = mergeProgressRecords(big, ancestor(), ID)
  check(`tombstone 상한 ${DIARY_TOMBSTONE_CAP} 유지(최근 것 보존)`, m4.diaryRemovedIds.length === DIARY_TOMBSTONE_CAP && m4.diaryRemovedIds.includes(`t${DIARY_TOMBSTONE_CAP + 49}`))
}

console.log('\n8. wordStatus — 더 진전된 상태 우선, 동률 로컬')
{
  const A = ancestor(); A.wordStatus = { w1: 'known', w2: 'unknown', w3: 'mastered', w5: 'skipped' }
  const B = ancestor(); B.wordStatus = { w1: 'mastered', w2: 'skipped', w3: 'known', w4: 'known', w5: 'unknown' }
  const m = mergeProgressRecords(A, B, ID)
  check('w1: cloud mastered > local known', m.wordStatus.w1 === 'mastered')
  check('w2: local unknown > cloud skipped', m.wordStatus.w2 === 'unknown')
  check('w3: local mastered 유지', m.wordStatus.w3 === 'mastered')
  check('w4: cloud에만 있음 → 보존', m.wordStatus.w4 === 'known')
  check('w5: cloud unknown > local skipped', m.wordStatus.w5 === 'unknown')
}

console.log('\n9. 배지/스트릭 임계값 max — 병합 후 중복 축하 없음 보장용')
{
  const A = ancestor(); A.milestoneStreak = 7; A.starBadgeThreshold = 100
  const B = ancestor(); B.milestoneStreak = 3; B.starBadgeThreshold = 300
  const m = mergeProgressRecords(A, B, ID)
  check('milestoneStreak max=7', m.milestoneStreak === 7)
  check('starBadgeThreshold max=300 (B에서 이미 축하한 배지 재발급 안 됨)', m.starBadgeThreshold === 300)
  check('lastGamePlayed 로컬 우선/없으면 클라우드', mergeProgressRecords({ ...ancestor(), lastGamePlayed: null }, { ...ancestor(), lastGamePlayed: 'balloon' }, ID).lastGamePlayed === 'balloon')
}

console.log('\n10. 필드별 "유실 없음" 총괄 — 병합 결과 ⊇ 양쪽 각각 (집합 필드)')
{
  const A = ancestor(); A.cleared = ['a', 'b', 'd']; A.stickers = ['s1', 's3']
  const B = ancestor(); B.cleared = ['a', 'c']; B.stickers = ['s1', 's2']
  const m = mergeProgressRecords(A, B, ID)
  const nA = normalizeRecord(A, ID), nB = normalizeRecord(B, ID)
  const supersets = [
    ['cleared', (r) => r.cleared], ['stickers', (r) => r.stickers],
    ['missions(wordId)', (r) => r.missions.map((x) => x.wordId)],
    ['history 날짜', (r) => Object.keys(r.history)],
    ['wordStatus 키', (r) => Object.keys(r.wordStatus)],
  ]
  for (const [label, get] of supersets) {
    check(`${label}: merged ⊇ local ∪ cloud`,
      [...get(nA), ...get(nB)].every((v) => get(m).includes(v)))
  }
  check('totalStars ≥ 양쪽 모두', m.totalStars >= nA.totalStars && m.totalStars >= nB.totalStars)
}

console.log('\n11. Writing MVP(2026-07-20) — spellingReviewQueue 이월(rollover)/병합')
{
  // 어제 round에 spellingWrongToday가 남아있던 채로 로드되면(normalizeRecord),
  // round는 freshRound()로 리셋되지만 그 안의 단어들은 영구 큐로 이월돼야 한다.
  const yesterday = 'Sat Jul 18 2026'
  const stale = { ...freshRecord(ID), round: { ...freshRound(), date: yesterday, spellingWrongToday: ['w1', 'w2'] } }
  const n1 = normalizeRecord(stale, ID)
  check('이월: round는 오늘로 리셋(빈 spellingWrongToday)', n1.round.date === today && n1.round.spellingWrongToday.length === 0)
  check('이월: 어제 spellingWrongToday가 spellingReviewQueue로 이동', n1.spellingReviewQueue.includes('w1') && n1.spellingReviewQueue.includes('w2'))

  // 기존에 이미 큐에 있던 단어(w0)는 이번 이월로 사라지지 않고 합집합됨
  const staleWithExisting = { ...freshRecord(ID), spellingReviewQueue: ['w0'], round: { ...freshRound(), date: yesterday, spellingWrongToday: ['w1'] } }
  const n2 = normalizeRecord(staleWithExisting, ID)
  check('이월: 기존 큐(w0) + 새로 이월된(w1) 합집합, 유실 없음', n2.spellingReviewQueue.includes('w0') && n2.spellingReviewQueue.includes('w1'))

  // 오늘 날짜 round는 이월 대상이 아님(그대로 유지, 큐 불변)
  const fresh = { ...freshRecord(ID), spellingReviewQueue: ['persisted1'], round: { ...freshRound(), date: today, spellingWrongToday: ['todayWrong'] } }
  const n3 = normalizeRecord(fresh, ID)
  check('오늘 round는 이월 없음 — spellingWrongToday 그대로', n3.round.spellingWrongToday.includes('todayWrong'))
  check('오늘 round는 이월 없음 — spellingReviewQueue 불변(todayWrong 안 섞임)', n3.spellingReviewQueue.length === 1 && n3.spellingReviewQueue[0] === 'persisted1')

  // 구버전 레코드(필드 자체가 없음)도 크래시 없이 빈 배열로 정규화
  const noField = { studentId: ID, totalStars: 5 }
  const n4 = normalizeRecord(noField, ID)
  check('spellingReviewQueue 필드 없는 구버전 레코드 → 빈 배열로 안전 정규화', Array.isArray(n4.spellingReviewQueue) && n4.spellingReviewQueue.length === 0)

  // 기기 간 병합 — 합집합, 유실 없음(다른 필드들과 동일 원칙)
  const A = { ...ancestor(), spellingReviewQueue: ['qa1', 'qShared'] }
  const B = { ...ancestor(), spellingReviewQueue: ['qb1', 'qShared'] }
  const m = mergeProgressRecords(A, B, ID)
  check('병합: spellingReviewQueue 합집합(양쪽 유실 없음)', ['qa1', 'qb1', 'qShared'].every((w) => m.spellingReviewQueue.includes(w)) && m.spellingReviewQueue.length === 3)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
