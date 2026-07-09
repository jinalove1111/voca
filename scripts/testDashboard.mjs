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

// 2026-07-10 회귀 테스트 — AdminScreen.jsx의 "오늘 공부함" 배지가
// categories_completed > 0을 기준으로 삼던 시절엔, 학생이 단어를 몇 개
// 보기만 하고 어느 카테고리도 다 못 채운 날 관리자 화면에 "⬜ 오늘 아직
// 안 함"으로 잘못 보였다(캘린더에서 이미 고친 것과 같은 버그 클래스).
// 수정 후 기준은 "오늘 날짜 row 존재 여부"(!!today)뿐이므로, 여기서는
// categories_completed=0인 row도 dailyRows에 정상적으로 반영되는지만
// 확인 — 실제 "오늘 공부함" 판정 로직 자체는 AdminScreen.jsx에 있음.
console.log('\n2.5. "단어만 보고 카테고리는 못 채운 날" (categoriesCompleted=0) 도 오늘자 row가 생기는지')
const C = 'QA_DashKidC'
await addStudent(C, CLASS, 'Unit 1')
await syncStudentProgress(C, {
  totalStars: 0, clearedCount: 0, streak: 0, stickersCount: 0,
  daily: { categoriesCompleted: 0, starsEarned: 0, quizCorrect: 0, quizTotal: 0, pronunciationAttempts: 0, missedWordIds: [] },
})
const [rowC] = await fetchDashboardData([C])
check('categoriesCompleted=0이어도 오늘자 row는 생김 (AdminScreen의 !!today 판정이 여기 의존)', rowC?.dailyRows?.length === 1)
check('그 row의 categories_completed 값은 정확히 0으로 반영됨', rowC?.dailyRows?.[0]?.categories_completed === 0)
await removeStudent(C)

console.log('\n3. 정리')
await removeStudent(A)
await removeStudent(B)
await deleteClass(CLASS)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
