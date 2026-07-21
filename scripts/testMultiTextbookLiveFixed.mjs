// Multi-textbook (student_class_assignments) LIVE e2e — addStudent() 갭
// 수정(2026-07-21, "primary 배정 행 없음" 회귀) 검증용. testMultiTextbookLive.mjs
// (레거시)는 이 갭이 발견된 시점에 작성된 스크립트라 seed insert
// 워크어라운드(87~117행 "[갭 워크어라운드]" 블록)를 포함한다 — 그 워크어라운드는
// addStudent가 아직 student_class_assignments에 primary 행을 만들지 않던
// 시절의 임시 픽스처였고, 이 파일이 대체한다: addStudent() 수정 이후에는
// 그 워크어라운드 없이도(= 학생 생성 → 즉시 두 번째 교재 배정 → 즉시 조회)
// primary가 계속 보이는지를 그대로 실제 흐름으로 증명한다.
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testMultiTextbookLiveFixed.mjs
//
// 주의: 이 스크립트도 테스트 학생을 정리(삭제)하지 않는다 — 레거시 스크립트와
// 같은 관례(운영자 지시, 검토용으로 남겨둠). 생성된 student_id/이름은 콘솔
// 출력 마지막에 명확히 보고한다.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const lib = await import(pathToFileURL(BUNDLE).href)
const {
  initWordLibrary,
  getClassNames, getClassIdByName, getClassUnits,
  addStudent,
  getStudentClassId, getStudentUnitId,
  getStudentClassAssignments, assignTextbook, setAssignmentUnit, setPrimaryAssignment,
  getStudentWords,
} = lib
await initWordLibrary()

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const TEST_STUDENT_NAME = `_QA_MultiTextbook_Test2_20260721`

console.log('=== Multi-Textbook LIVE e2e — addStudent() 수정 검증 (워크어라운드 없음) ===\n')

const classNames = getClassNames()
const usable = classNames.filter((name) => {
  const units = getClassUnits(name)
  return units.length > 0 && units.some((u) => (u.words || []).length > 0)
})
if (usable.length < 2) throw new Error(`유닛+단어가 있는 반이 2개 미만이라 테스트 불가: ${JSON.stringify(usable)}`)

const primaryClassName = usable[0]
const secondClassName = usable.find((n) => n !== primaryClassName)
const primaryClassId = getClassIdByName(primaryClassName)
const secondClassId = getClassIdByName(secondClassName)
console.log(`선택된 반 — 1차(primary): "${primaryClassName}" (${primaryClassId})`)
console.log(`선택된 반 — 2차(secondary): "${secondClassName}" (${secondClassId})`)

const primaryUnits = getClassUnits(primaryClassName)
const primaryUnitName = primaryUnits[0].name
console.log(`1차 반의 첫 유닛: "${primaryUnitName}"`)

const secondUnits = getClassUnits(secondClassName)
const secondUnit = secondUnits.find((u) => (u.words || []).length > 0 && u !== secondUnits[0]) || secondUnits.find((u) => (u.words || []).length > 0)
console.log(`2차 반에서 배정할 유닛: "${secondUnit.name}" (${secondUnit.id})`)

console.log('\n[Step 1] 전용 QA 테스트 학생 생성 — 수정된 addStudent() (이제 primary 배정 행도 함께 생성)')
const testStudentId = await addStudent(TEST_STUDENT_NAME, primaryClassName, primaryUnitName)
console.log(`  생성된 student_id: ${testStudentId}`)
check('student_id는 UUID 형태', /^[0-9a-f-]{36}$/i.test(testStudentId), testStudentId)
check('생성 직후 primary class_id === 선택한 1차 반', getStudentClassId(testStudentId) === primaryClassId)

const originalClassId = getStudentClassId(testStudentId)
const originalUnitIdBeforeAnyTest = getStudentUnitId(testStudentId)
console.log(`  기록: originalClassId=${originalClassId}, originalUnitId(테스트 시작 전 값)=${originalUnitIdBeforeAnyTest}`)

console.log('\n[Step 1b] 생성 직후 student_class_assignments에 primary 행이 실제로 존재하는지 확인 (워크어라운드 없이!)')
const assignmentsRightAfterCreate = await getStudentClassAssignments(testStudentId)
console.log('  getStudentClassAssignments 결과(생성 직후):', JSON.stringify(assignmentsRightAfterCreate))
check('생성 직후 배정이 정확히 1건', assignmentsRightAfterCreate.length === 1, assignmentsRightAfterCreate)
check('그 1건이 is_primary:true이고 1차 반과 일치', assignmentsRightAfterCreate[0]?.isPrimary === true && assignmentsRightAfterCreate[0]?.classId === originalClassId, assignmentsRightAfterCreate[0])

console.log('\n[Step 2] 두 번째 교재 배정 — assignTextbook(testStudentId, secondClassId) (워크어라운드 없이 바로)')
await assignTextbook(testStudentId, secondClassId)
const assignmentsAfterAssign = await getStudentClassAssignments(testStudentId)
console.log('  getStudentClassAssignments 결과:', JSON.stringify(assignmentsAfterAssign))
check('배정 2건 (원래 primary가 사라지지 않음 — 바로 이 회귀의 핵심 재현 포인트)', assignmentsAfterAssign.length === 2, assignmentsAfterAssign)
const primaryRow1 = assignmentsAfterAssign.find((a) => a.isPrimary)
const secondaryRow1 = assignmentsAfterAssign.find((a) => !a.isPrimary)
check('primary 행이 여전히 원래 1차 반과 일치, is_primary:true', primaryRow1?.classId === originalClassId && primaryRow1?.isPrimary === true, primaryRow1)
check('secondary 행이 2차 반과 일치, is_primary:false', secondaryRow1?.classId === secondClassId && secondaryRow1?.isPrimary === false, secondaryRow1)

console.log('\n[Step 3] 2차 배정에 유닛 지정 + 주 교재 전환')
await setAssignmentUnit(testStudentId, secondClassId, secondUnit.id)
console.log(`  setAssignmentUnit(secondClassId, ${secondUnit.id}) 완료`)

await setPrimaryAssignment(testStudentId, secondClassId)
console.log('  setPrimaryAssignment(secondClassId) 완료 (예전엔 이 지점에서 "학생이 반에 배정돼 있지 않습니다" throw가 재현됐던 경로)')

const assignmentsAfterSwitch = await getStudentClassAssignments(testStudentId)
console.log('  getStudentClassAssignments 결과(전환 후):', JSON.stringify(assignmentsAfterSwitch))
const newPrimaryRow = assignmentsAfterSwitch.find((a) => a.classId === secondClassId)
const demotedRow = assignmentsAfterSwitch.find((a) => a.classId === originalClassId)
check('2차 반이 is_primary:true', newPrimaryRow?.isPrimary === true, newPrimaryRow)
check('1차 반이 is_primary:false로 강등(사라지지 않고 남아있음)', demotedRow?.isPrimary === false, demotedRow)

console.log('\n[Step 4] 원래 교재로 복귀 — 회귀 핵심 체크 (예전엔 여기서 throw)')
await setPrimaryAssignment(testStudentId, originalClassId)
const assignmentsAfterRevert = await getStudentClassAssignments(testStudentId)
console.log('  getStudentClassAssignments 결과(복귀 후):', JSON.stringify(assignmentsAfterRevert))
const revertedPrimary = assignmentsAfterRevert.find((a) => a.classId === originalClassId)
const revertedSecondary = assignmentsAfterRevert.find((a) => a.classId === secondClassId)
check('원래 반으로 정확히 복귀 (에러 없이 성공)', revertedPrimary?.isPrimary === true, revertedPrimary)
check('2차 반은 non-primary로 남아있음(사라지지 않음)', revertedSecondary?.isPrimary === false, revertedSecondary)

console.log('\n[Step 5] 단어 로딩도 정상 격리되는지 확인')
const words = getStudentWords(testStudentId)
console.log(`  현재(원래 1차 반) 단어 수: ${words.length}`)
check('단어 로딩이 크래시 없이 정상 반환', Array.isArray(words) && words.length > 0, words.length)

console.log('\n=== 결과 ===')
console.log(`테스트 학생 (정리하지 않고 남겨둠): id=${testStudentId}, name="${TEST_STUDENT_NAME}"`)
console.log(`1차 반: "${primaryClassName}" (${primaryClassId}), 2차 반: "${secondClassName}" (${secondClassId})`)
console.log(failures === 0
  ? '\n모든 검증 통과 ✅ — 수정된 addStudent()로 만든 학생은 워크어라운드 없이도 주 교재가 사라지지 않는다.'
  : `\n${failures}개 검증 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
