// Verifies v1.3 "오늘의 단어 배정": getStudentWords() falls back to the full
// unit when no assignment exists, and returns only the assigned subset when
// one does — against the REAL wordLibrary.js logic and live Supabase,
// using a fully disposable QA class/student cleaned up at the end.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, createClass, deleteClass, setClassWords, addStudent, removeStudent,
  getStudentWords, setTodaysAssignment, getTodaysAssignmentWordIds, refreshWordLibrary,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASS = 'QA_DailyAssignTest'
const STUDENT = 'QA_DailyAssignStudent'

console.log('\n1. 테스트용 반/단어/학생 준비')
// v3.11 보안 락다운(classes/units/words anon SELECT-only)이 v3.12보다 먼저
// 걸려 createClass 자체가 42501로 막힌다 — 아래 3번의 setTodaysAssignment
// SKIP 래핑까지 도달하지 못하므로, 락다운이 실제로 막는 첫 쓰기(픽스처
// 생성)로 SKIP 지점을 당긴다(scripts/testRenameClass.mjs와 동일 관례).
try {
  await createClass(CLASS)
} catch (err) {
  if (err?.code === '42501' || /row-level security|permission denied/i.test(err?.message || '')) {
    console.log(`\nSKIP(락다운 환경 — anon 쓰기 불가, admin-content-write pin 경로로 재검증 필요). 원본 에러: ${err.message}`)
    process.exit(0)
  }
  throw err
}
await setClassWords(CLASS, [
  { word: 'apple', meaning: '사과' },
  { word: 'banana', meaning: '바나나' },
  { word: 'cherry', meaning: '체리' },
], 'Unit 1')
// P0(2026-07-15): addStudent가 id(UUID)를 반환 — getStudentWords/
// removeStudent는 id 기준.
const studentId = await addStudent(STUDENT, CLASS, 'Unit 1')

console.log('\n2. 배정 없음 -> 유닛 전체 단어 폴백')
let words = getStudentWords(studentId)
check('배정 안 했을 때 3개 단어(전체) 반환', words.length === 3)
check('오늘의 배정 목록이 비어있음', getTodaysAssignmentWordIds(CLASS).length === 0)

console.log('\n3. apple, cherry만 오늘의 단어로 배정')
// v3.12 보안 락다운(supabase_v3_12_lockdown_daily_assignments.sql) 적용
// 환경에서는 adminPin 없는 레거시 anon 쓰기가 42501(permission denied)로
// 막힌다 — 이건 "테스트가 실패"한 게 아니라 정확히 의도한 보안 동작이다.
// 위 1~2번(배정 없음 -> 유닛 전체 폴백, 조회)은 쓰기와 무관해 이미
// 실제로 검증됐으므로 그 결과는 그대로 유지하고, 이후 쓰기 의존 구간만
// 가짜 PASS 대신 정직하게 SKIP 처리한다(scripts/testXpLedgerDb.mjs의
// "정상적으로 예상된 상태" SKIP 관례와 동일).
try {
  await setTodaysAssignment(CLASS, ['apple', 'cherry'])
} catch (err) {
  if (err?.code === '42501' || /row-level security|permission denied/i.test(err?.message || '')) {
    console.log(`\nSKIP(락다운 환경 — anon 쓰기 불가) — daily_assignments 쓰기가 v3.12 RLS로 막혀 있음(예상된 상태, admin-content-write 배포 후 adminPin 경로로 재검증 필요). 원본 에러: ${err.message}`)
    console.log('   (위 1~2번 조회 기반 검증은 그대로 통과함)')
    await removeStudent(studentId).catch(() => {})
    await deleteClass(CLASS).catch(() => {})
    process.exit(0)
  }
  throw err
}
words = getStudentWords(studentId)
check('배정 후 2개 단어만 반환', words.length === 2)
check('반환된 단어가 정확히 apple/cherry', words.every(w => w.id === 'apple' || w.id === 'cherry'))
check('banana는 제외됨', !words.some(w => w.id === 'banana'))

console.log('\n4. 다른 esbuild 프로세스에서도(=새로고침 이후) 동일하게 보이는지')
await refreshWordLibrary()
words = getStudentWords(studentId)
check('refreshWordLibrary 이후에도 배정이 유지됨', words.length === 2)

console.log('\n5. 배정 해제 -> 다시 전체 단어 폴백')
await setTodaysAssignment(CLASS, [])
words = getStudentWords(studentId)
check('배정 해제 후 다시 3개 전체 반환', words.length === 3)

console.log('\n6. 정리 — 반 삭제 시 daily_assignments도 cascade 삭제되는지 확인 (에러 없이 삭제되면 통과)')
await removeStudent(studentId)
try {
  await deleteClass(CLASS)
  check('반 삭제 성공 (daily_assignments FK 문제 없음)', true)
} catch (err) {
  check('반 삭제 성공 (daily_assignments FK 문제 없음): ' + err.message, false)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
