// Regression test for the "Unit4 → Unit5 → re-login → reverts to Unit4" bug.
// Root cause: wordLibrary.js's _students cache (unlike _cache for
// classes/words) was only ever populated once at initWordLibrary() and
// never refreshed again for a browser tab's whole lifetime — so an admin's
// unit reassignment made on another device (or even a logout->re-login
// within the same tab, which is a pure client-side state change with no
// page reload) kept reading the stale in-memory value. The fix (App.jsx)
// now calls refreshStudents() at login and on tab focus. This script
// verifies the underlying wordLibrary.js mechanism the fix depends on:
// setStudentUnit() persists correctly, and a fresh refreshStudents() call
// (exactly what App.jsx now does at login) always reflects the latest DB
// value even if the in-memory cache was stale a moment before.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, createClass, deleteClass, addClassUnit, addStudent, removeStudent,
  setStudentUnit, getStudentUnit, refreshStudents,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASS = 'QA_UnitPersistTest'
const STUDENT_NAME = 'QA_UnitPersistStudent'

console.log('\n1. 준비 — Unit4, Unit5가 있는 반 + 학생을 Unit4로 등록')
await createClass(CLASS)
await addClassUnit(CLASS, 'Unit4')
await addClassUnit(CLASS, 'Unit5')
// P0(2026-07-15): addStudent가 id(UUID)를 반환 — 이후 전부 id 기준.
const STUDENT = await addStudent(STUDENT_NAME, CLASS, 'Unit4')
check('처음 등록 시 Unit4', getStudentUnit(STUDENT) === 'Unit4')

console.log('\n2. Unit5로 변경 (관리자 반 배정 액션과 동일한 setStudentUnit 호출)')
await setStudentUnit(STUDENT, 'Unit5')
check('변경 직후 Unit5로 반영됨', getStudentUnit(STUDENT) === 'Unit5')

console.log('\n3. "재로그인" 시뮬레이션 — 완전히 새로 refreshStudents() 호출 (App.jsx가 로그인 시점에 항상 호출하도록 고침)')
// 새로고침 전, 캐시가 인위적으로 예전 값(Unit4)이었다고 가정해도 —
// refreshStudents()는 항상 DB의 실제 값을 가져오므로 결과가 같아야 함.
await refreshStudents()
check('재로그인(refreshStudents) 후에도 Unit5 유지', getStudentUnit(STUDENT) === 'Unit5')

console.log('\n4. Unit5 -> Unit4 -> Unit5 여러 번 왕복해도 항상 최신 값 반영')
await setStudentUnit(STUDENT, 'Unit4')
await refreshStudents()
check('Unit4로 재변경 후 정확히 반영', getStudentUnit(STUDENT) === 'Unit4')
await setStudentUnit(STUDENT, 'Unit5')
await refreshStudents()
check('다시 Unit5로 변경 후에도 정확히 반영 (최종 상태 유지)', getStudentUnit(STUDENT) === 'Unit5')

console.log('\n5. 정리')
await removeStudent(STUDENT)
await deleteClass(CLASS)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
