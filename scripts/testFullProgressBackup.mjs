// v1.4 클라우드 백업/복구 검증 — student_progress.full_record 왕복 확인.
// testSyncProgress.mjs와 동일한 패턴(실제 wordLibrary.js + 라이브지만
// 사용 후 정리되는 QA 학생)으로 실제 Supabase에 대해 검증한다.
//
// 주의: supabase_v1_4_full_progress_backup.sql을 Supabase 대시보드에서
// 먼저 실행해야 통과한다 — 실행 전에는 "full_record 컬럼 없음" 에러로
// 실패하는 게 정상이며, 그게 바로 이 스크립트가 확인하려는 전제조건이다.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, addStudent, removeStudent, getClassNames,
  syncStudentProgress, fetchFullProgress,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const anyClass = getClassNames()[0]
if (!anyClass) throw new Error('No class exists to test against — aborting')

const NAME = 'QA_FullBackupTest'
console.log('\n1. 백업 대상 학생 생성')
await addStudent(NAME, anyClass, 'Unit 1')

console.log('\n2. 신규 학생은 아직 백업이 없음')
const before = await fetchFullProgress(NAME)
check('동기화 전에는 fetchFullProgress가 null 반환', before === null)

console.log('\n3. 실제 progress record 모양으로 fullRecord와 함께 동기화')
const fakeRecord = {
  studentId: NAME,
  totalStars: 87,
  stickers: ['ukflag1', 'crown1'],
  diaryPlacements: [{ placementId: 'p1', stickerId: 'ukflag1', x: 10, y: 20, rotation: 0, scale: 1 }],
  missions: [{ wordId: 'apple', correctCount: 2, done: false }],
  cleared: ['banana', 'cat'],
  round: { date: new Date().toDateString(), wordsViewed: ['dog'], examplesHeard: 1, quizSolved: 2, pronunciationOk: 1, spellingWrongToday: [] },
  history: {
    [new Date().toDateString()]: {
      studied: true, categoriesCompleted: 4, giftsToday: 1, starsEarned: 30,
      stickersEarned: ['ukflag1'], gamesPlayed: { balloon: 2 },
      quizCorrect: 3, quizTotal: 5, pronunciationAttempts: 4,
      missedWordIds: ['apple'], spellingCorrect: 2, spellingTotal: 3,
    },
  },
  milestoneStreak: 3,
  starBadgeThreshold: 0,
  lastGamePlayed: 'balloon',
  lastWordIndex: 5,
}
let migrationApplied = true
try {
  await syncStudentProgress(NAME, {
    totalStars: fakeRecord.totalStars,
    clearedCount: fakeRecord.cleared.length,
    streak: 3,
    stickersCount: fakeRecord.stickers.length,
    fullRecord: fakeRecord,
    daily: {
      categoriesCompleted: 4, starsEarned: 30, quizCorrect: 3, quizTotal: 5,
      pronunciationAttempts: 4, missedWordIds: ['apple'],
    },
  })
} catch (err) {
  migrationApplied = false
  console.log(`  (예상된 실패 — 마이그레이션 미적용: ${err.message || err})`)
}
check('supabase_v1_4_full_progress_backup.sql이 적용되어 있음 (full_record 컬럼 존재)', migrationApplied)

if (migrationApplied) {
  console.log('\n4. 백업이 그대로 다시 읽히는지 (복구 시나리오)')
  const restored = await fetchFullProgress(NAME)
  check('백업이 null이 아님', restored !== null)
  if (restored) {
    check('totalStars 일치', restored.totalStars === fakeRecord.totalStars)
    check('stickers 배열 일치', JSON.stringify(restored.stickers) === JSON.stringify(fakeRecord.stickers))
    check('missions 일치', JSON.stringify(restored.missions) === JSON.stringify(fakeRecord.missions))
    check('history(캘린더) 일치', JSON.stringify(restored.history) === JSON.stringify(fakeRecord.history))
    check('diaryPlacements 일치', JSON.stringify(restored.diaryPlacements) === JSON.stringify(fakeRecord.diaryPlacements))
    check('milestoneStreak 일치', restored.milestoneStreak === fakeRecord.milestoneStreak)
  }
} else {
  console.log('\n4. (건너뜀 — 마이그레이션 미적용)')
}

console.log('\n5. 정리 — 테스트 학생 삭제 (백업 적용됐다면 cascade로 함께 삭제되는지도 확인)')
await removeStudent(NAME)
if (migrationApplied) {
  const afterDelete = await fetchFullProgress(NAME)
  check('학생 삭제 후 fetchFullProgress는 null (학생 자체가 없으므로)', afterDelete === null)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌ (supabase_v1_4_full_progress_backup.sql을 아직 안 돌렸다면 정상적인 실패입니다)`)
process.exit(failures === 0 ? 0 : 1)
