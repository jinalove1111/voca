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
await createClass(CLASS)
await setClassWords(CLASS, [
  { word: 'apple', meaning: '사과' },
  { word: 'banana', meaning: '바나나' },
  { word: 'cherry', meaning: '체리' },
], 'Unit 1')
await addStudent(STUDENT, CLASS, 'Unit 1')

console.log('\n2. 배정 없음 -> 유닛 전체 단어 폴백')
let words = getStudentWords(STUDENT)
check('배정 안 했을 때 3개 단어(전체) 반환', words.length === 3)
check('오늘의 배정 목록이 비어있음', getTodaysAssignmentWordIds(CLASS).length === 0)

console.log('\n3. apple, cherry만 오늘의 단어로 배정')
await setTodaysAssignment(CLASS, ['apple', 'cherry'])
words = getStudentWords(STUDENT)
check('배정 후 2개 단어만 반환', words.length === 2)
check('반환된 단어가 정확히 apple/cherry', words.every(w => w.id === 'apple' || w.id === 'cherry'))
check('banana는 제외됨', !words.some(w => w.id === 'banana'))

console.log('\n4. 다른 esbuild 프로세스에서도(=새로고침 이후) 동일하게 보이는지')
await refreshWordLibrary()
words = getStudentWords(STUDENT)
check('refreshWordLibrary 이후에도 배정이 유지됨', words.length === 2)

console.log('\n5. 배정 해제 -> 다시 전체 단어 폴백')
await setTodaysAssignment(CLASS, [])
words = getStudentWords(STUDENT)
check('배정 해제 후 다시 3개 전체 반환', words.length === 3)

console.log('\n6. 정리 — 반 삭제 시 daily_assignments도 cascade 삭제되는지 확인 (에러 없이 삭제되면 통과)')
await removeStudent(STUDENT)
try {
  await deleteClass(CLASS)
  check('반 삭제 성공 (daily_assignments FK 문제 없음)', true)
} catch (err) {
  check('반 삭제 성공 (daily_assignments FK 문제 없음): ' + err.message, false)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
