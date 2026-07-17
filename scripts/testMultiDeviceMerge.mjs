// v2.2 라이브 e2e — 다중 기기(A/B) 교차 사용 시나리오를 실제 Supabase에
// 대해 재현한다. 두 개의 가짜 "기기 로컬 레코드"가 실제 앱의 doSync와
// 동일한 알고리즘(fetchProgressBackupStrict → mergeProgressRecords →
// syncStudentProgress)으로 교차 동기화했을 때, 클라우드 백업 blob에 양쪽
// 진행분이 모두 남는지(기존 last-writer-wins에서는 B 진행분이 유실됐던
// 정확히 그 시나리오) 확인. QA_ 학생만 생성/정리 — 프로덕션 데이터 불변.
//
// 실행:
//   node scripts/buildWordLibBundle.mjs && node scripts/buildProgressBundle.mjs
//   node scripts/testMultiDeviceMerge.mjs
//   (WORDLIB_BUNDLE / PROGRESS_BUNDLE 미설정 시 표준 .tmp 경로 사용)
import { pathToFileURL } from 'node:url'

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
globalThis.localStorage = new FakeStorage() // progress 번들 로드용(순수 함수만 씀)

const WORDLIB = process.env.WORDLIB_BUNDLE || 'scripts/.tmp/wordLibrary.bundle.mjs'
const PROGRESS = process.env.PROGRESS_BUNDLE || 'scripts/.tmp/useStudent.progress.bundle.mjs'
const {
  initWordLibrary, addStudent, removeStudent, getClassNames,
  syncStudentProgress, fetchFullProgress, fetchProgressBackupStrict,
} = await import(pathToFileURL(WORDLIB).href)
const { mergeProgressRecords, freshRecord, normalizeRecord, calcStreak, todayStr } =
  await import(pathToFileURL(PROGRESS).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// 실제 앱 doSync(useStudent.js)와 동일한 업로드 알고리즘 — 병합 후 업로드.
// (시나리오 0에서만 mergeSkip=true로 "구버전 last-writer-wins"를 재현해
// 대조군으로 쓴다.)
async function deviceSync(studentId, localRecord, { mergeSkip = false } = {}) {
  const backup = mergeSkip ? null : await fetchProgressBackupStrict(studentId)
  const merged = mergeProgressRecords(localRecord, backup, studentId)
  const day = merged.history[todayStr()]
  await syncStudentProgress(studentId, {
    totalStars: merged.totalStars,
    clearedCount: merged.cleared.length,
    streak: calcStreak(merged.history),
    stickersCount: merged.stickers.length,
    fullRecord: merged,
    daily: {
      categoriesCompleted: day?.categoriesCompleted || 0,
      starsEarned: day?.starsEarned || 0,
      quizCorrect: day?.quizCorrect || 0,
      quizTotal: day?.quizTotal || 0,
      pronunciationAttempts: day?.pronunciationAttempts || 0,
      missedWordIds: day?.missedWordIds || [],
    },
  })
  return merged
}

const anyClass = getClassNames()[0]
if (!anyClass) throw new Error('테스트할 반이 없음 — 중단')

const NAME = 'QA_MultiDeviceMerge'
console.log('\n0. QA 학생 생성')
const studentId = await addStudent(NAME, anyClass, 'Unit 1')
console.log(`  (id: ${studentId})`)

try {
  console.log('\n1. 기기 A 최초 학습(별 50, cleared a/b, 스티커 s1, 다이어리 p1) → 동기화')
  const deviceA = normalizeRecord(freshRecord(studentId), studentId)
  deviceA.totalStars = 50
  deviceA.cleared = ['a', 'b']
  deviceA.stickers = ['s1']
  deviceA.diaryPlacements = [{ placementId: 'p1', stickerId: 's1', x: 1, y: 1, rotation: 0, scale: 1 }]
  deviceA.wordStatus = { w1: 'known' }
  await deviceSync(studentId, deviceA)
  const blob1 = await fetchFullProgress(studentId)
  check('백업 blob에 A 진행분 (별 50)', blob1?.totalStars === 50)

  console.log('\n2. 기기 B 로그인(로컬 빔 → 백업 복원) 후 +10 별, cleared c, 스티커 s2 → 동기화')
  const restoredB = await fetchFullProgress(studentId)
  const deviceB = mergeProgressRecords(freshRecord(studentId), restoredB, studentId) // 복원 = 빈 로컬과 병합
  check('B 복원이 A 진행분을 받음 (별 50)', deviceB.totalStars === 50)
  deviceB.totalStars = 60
  deviceB.cleared = [...deviceB.cleared, 'c']
  deviceB.stickers = [...deviceB.stickers, 's2']
  deviceB.wordStatus = { ...deviceB.wordStatus, w2: 'unknown' }
  await deviceSync(studentId, deviceB)
  const blob2 = await fetchFullProgress(studentId)
  check('백업 blob = B 기준 (별 60, cleared c 포함)', blob2?.totalStars === 60 && blob2?.cleared?.includes('c'))

  console.log('\n3. 다시 기기 A(로컬은 여전히 별 50 + B 진행분 없음)에서 활동(+2 별, cleared d) → 동기화')
  console.log('   ← 구버전이면 여기서 B의 진행분(별 10, c, s2)이 영구 유실되던 지점')
  deviceA.totalStars = 52
  deviceA.cleared = ['a', 'b', 'd']
  await deviceSync(studentId, deviceA)
  const blob3 = await fetchFullProgress(studentId)
  check('★핵심★ 백업 별 = max(52, 60) = 60 — B의 별이 살아있음', blob3?.totalStars === 60)
  check('★핵심★ cleared에 A의 d와 B의 c 모두', blob3?.cleared?.includes('c') && blob3?.cleared?.includes('d'))
  check('★핵심★ 스티커 s1/s2 모두', blob3?.stickers?.includes('s1') && blob3?.stickers?.includes('s2'))
  check('wordStatus 양쪽 모두 (w1 known + w2 unknown)', blob3?.wordStatus?.w1 === 'known' && blob3?.wordStatus?.w2 === 'unknown')

  console.log('\n4. 대조군 — 같은 상태에서 구버전(병합 없는) 업로드를 시뮬레이션하면 실제로 유실됐는지 확인')
  await deviceSync(studentId, deviceA, { mergeSkip: true })
  const blobOld = await fetchFullProgress(studentId)
  check('구버전 방식은 실제로 B 진행분을 파괴함 (별 52, c 없음) — 버그 재현 확인', blobOld?.totalStars === 52 && !blobOld?.cleared?.includes('c'))
  // 복구: 병합 동기화 한 번이면 B 기기의 다음 동기화가 잃은 걸 되돌림
  await deviceSync(studentId, deviceB)
  const blobHealed = await fetchFullProgress(studentId)
  check('B의 다음 병합 동기화가 유실분 복원 (별 60, c/d 모두)', blobHealed?.totalStars === 60 && blobHealed?.cleared?.includes('c') && blobHealed?.cleared?.includes('d'))

  console.log('\n5. 다이어리 삭제 tombstone 라이브 왕복 — A가 p1 삭제 → blob에서도 제거되고 부활 안 함')
  deviceA.diaryPlacements = []
  deviceA.diaryRemovedIds = ['p1']
  await deviceSync(studentId, deviceA)
  const blob5 = await fetchFullProgress(studentId)
  check('blob에서 p1 제거됨', !(blob5?.diaryPlacements || []).some((p) => p.placementId === 'p1'))
  check('tombstone이 blob에 영속(JSONB 왕복)', (blob5?.diaryRemovedIds || []).includes('p1'))
  // B(로컬에 아직 p1 있음)가 동기화해도 부활하지 않아야 함
  await deviceSync(studentId, deviceB)
  const blob6 = await fetchFullProgress(studentId)
  check('p1 가진 B가 동기화해도 부활 안 함 (tombstone 우선)', !(blob6?.diaryPlacements || []).some((p) => p.placementId === 'p1'))

  console.log('\n6. 구스키마 blob 방어 — 옛 필드 구성 blob과의 라이브 병합 왕복 크래시 없음')
  const oldStyle = {
    studentId, totalStars: 61, stickers: ['s1', 's2'], diaryPlacements: [], missions: [], cleared: ['a'],
    round: { date: todayStr(), wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0 },
    history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 2,
  }
  await deviceSync(studentId, oldStyle)
  const blob7 = await fetchFullProgress(studentId)
  check('구스키마 로컬 동기화 후에도 진행분 보존 (별 61, cleared c/d 유지)', blob7?.totalStars === 61 && blob7?.cleared?.includes('c') && blob7?.cleared?.includes('d'))
  check('정규화 필드가 blob에 채워짐 (spellingWrongToday 배열)', Array.isArray(blob7?.round?.spellingWrongToday))
} finally {
  console.log('\n7. 정리 — QA 학생 삭제')
  await removeStudent(studentId)
}
const afterDelete = await fetchFullProgress(studentId)
check('정리 후 백업 없음 (cascade)', afterDelete === null)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
