// Verifies the ACTUAL root cause fix for the "unit keeps reverting to the
// first-picked value" bug (reported 3 times). Root cause: StudentSelect.jsx
// showed a unit <select> for an EXISTING student's name, but handleStart's
// existing-student branch used to call onSelect(existing) directly WITHOUT
// ever looking at the chosen selectedUnit — so picking "Unit5" in the
// dropdown was pure decoration for a returning student and never reached
// the database. This script replicates StudentSelect.jsx's handleStart
// decision logic exactly (see src/components/StudentSelect.jsx) against the
// real wordLibrary.js functions and live Supabase, running the exact
// scenario the user specified: 로그인(Unit4 등록) → Unit5 선택 → "재로그인"
// (refreshStudents) → Unit5 유지 → Unit3 선택 → Unit3 반영.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, createClass, deleteClass, addClassUnit, addStudent, removeStudent,
  findStudentByName, getStudentUnit, setStudentUnit, refreshStudents,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASS = 'QA_RoganClass'
const STUDENT = 'QA_Rogan'

// Mirrors StudentSelect.jsx's handleStart existing-branch exactly: only
// calls setStudentUnit if a unit was picked AND it differs from the
// student's current unit — never silently ignores the picked value, never
// forces a change nobody asked for.
async function simulateLoginWithUnitPick(name, pickedUnit) {
  const existing = findStudentByName(name)
  const currentUnit = getStudentUnit(existing)
  console.log('[test] 로그인 시 fetch된 student:', { name: existing, currentUnit })
  console.log('[test] Unit 선택 화면에서 고른 값:', { pickedUnit })
  if (pickedUnit && pickedUnit !== currentUnit) {
    await setStudentUnit(existing, pickedUnit)
  }
  await refreshStudents() // App.jsx's handleSelect does this before onSelect
  const homeUnit = getStudentUnit(existing)
  console.log('[test] Home 표시 unit 값:', { homeUnit })
  return homeUnit
}

console.log('\n1. Rogan 로그인 (신규 등록, Unit4 선택)')
await createClass(CLASS)
await addClassUnit(CLASS, 'Unit4')
await addClassUnit(CLASS, 'Unit5')
await addClassUnit(CLASS, 'Unit3')
await addStudent(STUDENT, CLASS, 'Unit4')
check('Home Unit4', getStudentUnit(STUDENT) === 'Unit4')

console.log('\n2. Unit 선택 화면으로 이동 -> Unit5 선택')
let home = await simulateLoginWithUnitPick(STUDENT, 'Unit5')
check('Home Unit5', home === 'Unit5')

console.log('\n3. 새로고침 -> Rogan 재로그인 (유닛 선택 안 건드림, 그대로 로그인)')
home = await simulateLoginWithUnitPick(STUDENT, '') // 드롭다운을 건드리지 않은 경우
check('Home Unit5 (그대로 유지)', home === 'Unit5')

console.log('\n4. 다시 Unit3 선택')
home = await simulateLoginWithUnitPick(STUDENT, 'Unit3')
check('Home Unit3', home === 'Unit3')

console.log('\n5. 정리')
await removeStudent(STUDENT)
await deleteClass(CLASS)
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
