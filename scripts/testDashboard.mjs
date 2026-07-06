// Verifies fetchDashboardData() batch-fetches student_progress +
// student_daily_progress correctly for multiple students at once (used by
// AdminScreen's AdminDashboard) — against live Supabase with disposable
// QA students, cleaned up at the end.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, createClass, deleteClass, addStudent, removeStudent,
  syncStudentProgress, fetchDashboardData,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASS = 'QA_DashboardTest'
const A = 'QA_DashKidA'
const B = 'QA_DashKidB'

console.log('\n1. 테스트용 반/학생 2명 준비 + 서로 다른 진행도 동기화')
await createClass(CLASS)
await addStudent(A, CLASS, 'Unit 1')
await addStudent(B, CLASS, 'Unit 1')

await syncStudentProgress(A, {
  totalStars: 100, clearedCount: 10, streak: 5, stickersCount: 3,
  daily: { categoriesCompleted: 4, starsEarned: 20, quizCorrect: 8, quizTotal: 10, pronunciationAttempts: 12, missedWordIds: ['apple', 'apple', 'banana'] },
})
// B has no synced progress at all — must not crash, just show as "no record"
console.log('\n2. 배치 조회 (학생 2명, 그 중 1명은 동기화 기록 없음)')
const rows = await fetchDashboardData([A, B])

check('결과가 요청한 학생 수(2명)와 일치', rows.length === 2)
const rowA = rows.find(r => r.name === A)
const rowB = rows.find(r => r.name === B)
check('학생 A의 progress가 정확히 조회됨 (total_stars === 100)', rowA?.progress?.total_stars === 100)
check('학생 A의 dailyRows에 오늘 기록 1개 포함', rowA?.dailyRows?.length === 1)
check('학생 A의 dailyRows.quiz_correct === 8', rowA?.dailyRows?.[0]?.quiz_correct === 8)
check('학생 A의 missed_word_ids에 apple이 2번', rowA?.dailyRows?.[0]?.missed_word_ids?.filter(w => w === 'apple').length === 2)
check('동기화 기록 없는 학생 B도 크래시 없이 포함됨 (progress는 null)', rowB && rowB.progress === null)
check('학생 B의 dailyRows는 빈 배열', Array.isArray(rowB?.dailyRows) && rowB.dailyRows.length === 0)

console.log('\n3. 정리')
await removeStudent(A)
await removeStudent(B)
await deleteClass(CLASS)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
