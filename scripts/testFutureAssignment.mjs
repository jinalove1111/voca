// Verifies v1.3 "날짜별 숙제 배정" (plan-ahead future assignment):
// getAssignmentForDate/setAssignmentForDate work for an arbitrary future
// date without affecting today's assignment, and a future assignment has
// zero effect on getStudentWords() until that date actually arrives.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, createClass, deleteClass, setClassWords, addStudent, removeStudent,
  getStudentWords, getAssignmentForDate, setAssignmentForDate, getTodaysAssignmentWordIds,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASS = 'QA_FutureAssignTest'
const STUDENT = 'QA_FutureAssignStudent'
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

console.log('\n1. 준비')
await createClass(CLASS)
await setClassWords(CLASS, [
  { word: 'dog', meaning: '개' },
  { word: 'cat', meaning: '고양이' },
], 'Unit 1')
// P0(2026-07-15): addStudent가 id(UUID)를 반환 — getStudentWords는 id 기준.
const studentId = await addStudent(STUDENT, CLASS, 'Unit 1')

console.log('\n2. 내일 날짜에 dog만 미리 배정')
check('배정 전에는 내일 배정이 비어있음', (await getAssignmentForDate(CLASS, tomorrow())).length === 0)
await setAssignmentForDate(CLASS, tomorrow(), ['dog'])
const tomorrowAssignment = await getAssignmentForDate(CLASS, tomorrow())
check('내일 배정 조회 시 dog가 저장됨', tomorrowAssignment.length === 1 && tomorrowAssignment[0] === 'dog')

console.log('\n3. 오늘 배정에는 전혀 영향 없음 (미래 배정과 완전히 분리)')
check('오늘 배정은 여전히 비어있음(전체 단어 폴백 유지)', getTodaysAssignmentWordIds(CLASS).length === 0)
const words = getStudentWords(studentId)
check('내일 배정을 걸어놔도 오늘 학생은 여전히 전체 단어(2개)를 봄', words.length === 2)

console.log('\n4. 정리')
await removeStudent(studentId)
await deleteClass(CLASS)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
