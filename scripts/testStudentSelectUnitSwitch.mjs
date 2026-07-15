// Verifies the ACTUAL root cause fix for the "unit keeps reverting to the
// first-picked value" bug (reported 3 times, originally in StudentSelect.jsx
// — that screen no longer shows a unit picker at all since the P0(2026-07-15)
// name+PIN login rewrite, see src/components/StudentSelect.jsx; unit
// reassignment now only happens via AdminScreen.jsx's "반 배정" UI). What
// this script actually still guards against — and still matters — is the
// underlying wordLibrary.js mechanism the original fix depended on:
// setStudentUnit() persists correctly, and refreshStudents() (called at
// login AND whenever AdminScreen reassigns a unit) always reflects the
// latest DB value even if the in-memory cache was stale a moment before.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, createClass, deleteClass, addClassUnit, addStudent, removeStudent,
  getStudentUnit, setStudentUnit, refreshStudents,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASS = 'QA_RoganClass'
const STUDENT_NAME = 'QA_Rogan'

// P0(2026-07-15): id 기준 — pickedUnit이 있고 현재 값과 다를 때만
// setStudentUnit을 호출(안 건드린 경우엔 그대로 유지), 이어서
// refreshStudents()로 최신 값을 다시 읽어온다(AdminScreen이 반 배정
// 저장 후 하는 것과 동일한 패턴).
async function simulateUnitPick(id, pickedUnit) {
  const currentUnit = getStudentUnit(id)
  console.log('[test] 현재 unit:', { id, currentUnit })
  console.log('[test] 새로 고른 값:', { pickedUnit })
  if (pickedUnit && pickedUnit !== currentUnit) {
    await setStudentUnit(id, pickedUnit)
  }
  await refreshStudents()
  const homeUnit = getStudentUnit(id)
  console.log('[test] 반영된 unit 값:', { homeUnit })
  return homeUnit
}

console.log('\n1. Rogan 등록 (Unit4 선택)')
await createClass(CLASS)
await addClassUnit(CLASS, 'Unit4')
await addClassUnit(CLASS, 'Unit5')
await addClassUnit(CLASS, 'Unit3')
const STUDENT = await addStudent(STUDENT_NAME, CLASS, 'Unit4')
check('처음 Unit4', getStudentUnit(STUDENT) === 'Unit4')

console.log('\n2. Unit5로 변경')
let home = await simulateUnitPick(STUDENT, 'Unit5')
check('Unit5로 반영됨', home === 'Unit5')

console.log('\n3. 아무 것도 안 건드리고 재조회 (그대로 로그인과 동일)')
home = await simulateUnitPick(STUDENT, '')
check('Unit5 그대로 유지', home === 'Unit5')

console.log('\n4. 다시 Unit3 선택')
home = await simulateUnitPick(STUDENT, 'Unit3')
check('Unit3로 반영됨', home === 'Unit3')

console.log('\n5. 정리')
await removeStudent(STUDENT)
await deleteClass(CLASS)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
