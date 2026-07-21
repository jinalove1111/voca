// [LEGACY — 87~117행 "[갭 워크어라운드]" 블록은 이제 불필요] addStudent()가
// student_class_assignments에 primary 행을 만들지 않던 갭이 2026-07-21에
// wordLibrary.js에서 수정됐다(addStudent에 insert 추가). 그 수정을 워크어라운드
// 없이 증명하는 라이브 e2e는 scripts/testMultiTextbookLiveFixed.mjs 참고 — 이
// 파일은 갭이 발견된 시점의 원본 그대로 보존(어떤 상태에서 무엇이 깨졌는지
// 기록으로 남기기 위함)하며, 새 세션은 워크어라운드가 필요 없는 이 두 번째
// 스크립트를 우선 사용할 것.
//
// Multi-textbook (student_class_assignments) LIVE e2e — 운영자 지시
// (2026-07-21, drift-bug 수정 b37bf36 검증)로 실행. 실제 프로덕션 학생을
// 절대 건드리지 않기 위해 전용 QA 학생 1명만 새로 만들고(이름에
// _QA_MultiTextbook_Test_ 접두어), 기존 실제 반 2개(교체/삭제 없음, 읽기
// 전용으로만 사용)에 배정한다. 이 스크립트는 mock 없이 esbuild로 번들된
// 진짜 src/utils/wordLibrary.js를 라이브 Supabase에 대고 그대로 실행한다
// (buildWordLibBundle.mjs와 동일한 관례 — testStudentUnitDecouple.mjs 참고).
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testMultiTextbookLive.mjs
//
// 주의: 이 스크립트는 테스트 학생을 정리(삭제)하지 않는다 — 운영자 지시에
// 따라 검토용으로 남겨둔다. 생성된 student_id/이름은 콘솔 출력 마지막에
// 명확히 보고한다.
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const lib = await import(pathToFileURL(BUNDLE).href)
const {
  initWordLibrary, refreshStudents,
  getClassNames, getClassIdByName, getClassUnits,
  addStudent,
  getStudentClassId, getStudentUnitId, getStudentUnit,
  getStudentClassAssignments, assignTextbook, setAssignmentUnit, setPrimaryAssignment,
  getStudentWords,
} = lib
await initWordLibrary()

const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
const supabase = createClient(url, key)

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const TEST_STUDENT_NAME = `_QA_MultiTextbook_Test_20260721`

console.log('=== Multi-Textbook LIVE e2e (real DB, real app functions) ===\n')

// ── 후보 반 선정 — 실제 반 목록에서 유닛+단어가 있는 반 2개를 고른다 ────────
const classNames = getClassNames()
console.log(`전체 반 목록(${classNames.length}개): ${classNames.join(', ')}`)

const usable = classNames.filter((name) => {
  const units = getClassUnits(name)
  return units.length > 0 && units.some((u) => (u.words || []).length > 0)
})
if (usable.length < 2) throw new Error(`유닛+단어가 있는 반이 2개 미만이라 테스트 불가: ${JSON.stringify(usable)}`)

const primaryClassName = usable[0]
const secondClassName = usable.find((n) => n !== primaryClassName)
const primaryClassId = getClassIdByName(primaryClassName)
const secondClassId = getClassIdByName(secondClassName)
console.log(`\n선택된 반 — 1차(primary): "${primaryClassName}" (${primaryClassId})`)
console.log(`선택된 반 — 2차(secondary): "${secondClassName}" (${secondClassId})`)

const primaryUnits = getClassUnits(primaryClassName)
const primaryUnitName = primaryUnits[0].name
console.log(`1차 반의 첫 유닛: "${primaryUnitName}"`)

const secondUnits = getClassUnits(secondClassName)
// 2번째 유닛이 있으면 그걸(기본값과 달라야 self-heal 검증이 더 명확), 없으면 첫 유닛.
const secondUnit = secondUnits.find((u) => (u.words || []).length > 0 && u !== secondUnits[0]) || secondUnits.find((u) => (u.words || []).length > 0)
console.log(`2차 반에서 배정할 유닛: "${secondUnit.name}" (${secondUnit.id})`)

let testStudentId = null

console.log('\n[Step 1] 전용 QA 테스트 학생 생성 (addStudent — StudentSelect.jsx "처음이에요" 흐름과 동일 호출)')
testStudentId = await addStudent(TEST_STUDENT_NAME, primaryClassName, primaryUnitName)
console.log(`  생성된 student_id: ${testStudentId}`)
check('student_id는 UUID 형태', /^[0-9a-f-]{36}$/i.test(testStudentId), testStudentId)
check('생성 직후 primary class_id === 선택한 1차 반', getStudentClassId(testStudentId) === primaryClassId)

const originalClassId = getStudentClassId(testStudentId)
const originalUnitIdBeforeAnyTest = getStudentUnitId(testStudentId)
console.log(`  기록: originalClassId=${originalClassId}, originalUnitId(테스트 시작 전 값)=${originalUnitIdBeforeAnyTest}`)

// ── 발견된 갭(이 스크립트의 첫 실행에서 실측, 워크어라운드) ────────────────
// addStudent()는 student_class_assignments에 primary 행을 만들지 않는다
// (supabase_v2_9_student_class_assignments.sql 자체 주석 43~59행, handoff.md
// 2026-07-21 1차 "남은 위험" 항목이 이미 "후속 구현 권고"로 명시한 바로 그
// 갭 — 마이그레이션 시점 백필은 "당시 존재하던" 294명만 커버하고, 그 이후
// addStudent로 생성되는 모든 신규 학생에게는 적용되지 않는다). 그 결과
// getStudentClassAssignments()는 이 학생에 대해 행이 0개일 때만
// syntheticPrimaryAssignment로 폴백하므로(코드 887~896행), assignTextbook로
// 두 번째 교재를 배정해 행이 1개가 되는 순간부터는 그 폴백이 더 이상 걸리지
// 않아 "primary 행 자체가 통째로 안 보이는" 상태가 된다 — 이 스크립트의
// 최초 실행(정리됨)에서 정확히 이렇게 재현됐다: assignTextbook 직후
// getStudentClassAssignments가 2건이 아니라 1건(secondary만)을 반환했고,
// 이어서 setPrimaryAssignment가 원래 반으로 되돌아갈 대상 행을 찾지 못해
// throw했다. 이건 이번 과제가 검증 대상으로 삼은 b37bf36(read/write-time
// drift-heal)과는 별개의, 그 전 단계(행 자체가 없음) 갭이라 b37bf36 로직이
// 아예 발동할 기회가 없다.
//
// 아래 insert는 정확히 supabase_v2_9 마이그레이션의 백필 INSERT문과 같은
// 모양(같은 컬럼, on conflict do nothing)을 이 학생 1명에게만 적용한
// 것이다 — addStudent가 앞으로 반드시 해야 할 일을 대신 수행하는 테스트
// 픽스처 셋업(다른 QA 스크립트들이 createClass/setClassWords로 픽스처를
// 준비하는 것과 같은 성격)이지 검증 대상 함수(assignTextbook/
// getStudentClassAssignments/setAssignmentUnit/setPrimaryAssignment/
// getStudentWords)를 mock하는 게 아니다 — 이후 모든 단계는 여전히 전부
// 진짜 앱 함수로 진행한다.
console.log('\n[갭 워크어라운드] addStudent가 만들지 않는 primary 배정 행을 마이그레이션 백필과 동일한 형태로 직접 insert (검증 대상 함수 자체는 그대로 진짜 함수 사용)')
const { error: seedErr } = await supabase.from('student_class_assignments').insert({
  student_id: testStudentId, class_id: originalClassId, current_unit_id: originalUnitIdBeforeAnyTest, is_primary: true,
})
if (seedErr && seedErr.code !== '23505') throw seedErr
console.log('  seed insert 완료(또는 이미 존재, 23505 no-op)')

console.log('\n[Step 2] 두 번째 교재 배정 — assignTextbook(testStudentId, secondClassId)')
await assignTextbook(testStudentId, secondClassId)
const assignmentsAfterAssign = await getStudentClassAssignments(testStudentId)
console.log('  getStudentClassAssignments 결과:', JSON.stringify(assignmentsAfterAssign))
check('배정 2건', assignmentsAfterAssign.length === 2, assignmentsAfterAssign)
const primaryRow1 = assignmentsAfterAssign.find((a) => a.isPrimary)
const secondaryRow1 = assignmentsAfterAssign.find((a) => !a.isPrimary)
check('primary 행이 원래 1차 반과 일치, is_primary:true', primaryRow1?.classId === originalClassId && primaryRow1?.isPrimary === true, primaryRow1)
check('secondary 행이 2차 반과 일치, is_primary:false', secondaryRow1?.classId === secondClassId && secondaryRow1?.isPrimary === false, secondaryRow1)

console.log('\n[Step 3] 2차 배정에 유닛 지정 + 주 교재 전환')
await setAssignmentUnit(testStudentId, secondClassId, secondUnit.id)
console.log(`  setAssignmentUnit(secondClassId, ${secondUnit.id}) 완료`)

await setPrimaryAssignment(testStudentId, secondClassId)
console.log('  setPrimaryAssignment(secondClassId) 완료')

const { data: studentRowAfterSwitch, error: srErr } = await supabase
  .from('students').select('id,class_id,current_unit_id').eq('id', testStudentId).single()
if (srErr) throw srErr
console.log('  students 테이블 직접 조회:', JSON.stringify(studentRowAfterSwitch))
check('students.class_id === secondClassId', studentRowAfterSwitch.class_id === secondClassId)
check('students.current_unit_id === secondUnit.id', studentRowAfterSwitch.current_unit_id === secondUnit.id)

const assignmentsAfterSwitch = await getStudentClassAssignments(testStudentId)
console.log('  getStudentClassAssignments 결과(전환 후):', JSON.stringify(assignmentsAfterSwitch))
const newPrimaryRow = assignmentsAfterSwitch.find((a) => a.classId === secondClassId)
const demotedRow = assignmentsAfterSwitch.find((a) => a.classId === originalClassId)
check('2차 반이 is_primary:true', newPrimaryRow?.isPrimary === true, newPrimaryRow)
check('1차 반이 is_primary:false로 강등', demotedRow?.isPrimary === false, demotedRow)
check('강등된 1차 반 행의 current_unit_id가 전환 직전 값 그대로 보존(self-heal, b37bf36)', demotedRow?.unitId === originalUnitIdBeforeAnyTest, { got: demotedRow?.unitId, expected: originalUnitIdBeforeAnyTest })

console.log('\n[Step 4] 진도(단어) 격리 검증')
const wordsNoOverride = getStudentWords(testStudentId)
const wordsOriginalOverride = getStudentWords(testStudentId, { classId: originalClassId })
const idsNoOverride = wordsNoOverride.map((w) => w.dbId).sort()
const idsOriginalOverride = wordsOriginalOverride.map((w) => w.dbId).sort()
console.log(`  override 없음(현재 primary=2차 반) 단어 수: ${wordsNoOverride.length}, dbId 샘플: ${idsNoOverride.slice(0, 3).join(',')}`)
console.log(`  override=원래 1차 반 단어 수: ${wordsOriginalOverride.length}, dbId 샘플: ${idsOriginalOverride.slice(0, 3).join(',')}`)
check('override 없는 호출이 2차 반(secondUnit) 단어와 정확히 일치', JSON.stringify(idsNoOverride) === JSON.stringify((secondUnit.words || []).map((w) => w.id).sort()))
check('override=원래 반 호출이 1차 반(primaryUnit) 단어와 정확히 일치', JSON.stringify(idsOriginalOverride) === JSON.stringify((primaryUnits.find((u) => u.name === primaryUnitName).words || []).map((w) => w.id).sort()))
check('두 결과의 실제 단어 id 집합이 서로 다름(섞이지 않음)', JSON.stringify(idsNoOverride) !== JSON.stringify(idsOriginalOverride), { idsNoOverride, idsOriginalOverride })

console.log('\n[Step 5] 원래 교재로 복귀 — 회귀 핵심 체크')
await setPrimaryAssignment(testStudentId, originalClassId)
const { data: studentRowAfterRevert, error: srErr2 } = await supabase
  .from('students').select('id,class_id,current_unit_id').eq('id', testStudentId).single()
if (srErr2) throw srErr2
console.log('  students 테이블 직접 조회(복귀 후):', JSON.stringify(studentRowAfterRevert))
check('students.class_id === originalClassId로 복귀', studentRowAfterRevert.class_id === originalClassId)
check('students.current_unit_id === 테스트 시작 전 원래 유닛 id로 정확히 복원(stale/2차 반 유닛 아님)', studentRowAfterRevert.current_unit_id === originalUnitIdBeforeAnyTest, { got: studentRowAfterRevert.current_unit_id, expected: originalUnitIdBeforeAnyTest, secondUnitId: secondUnit.id })

console.log('\n=== 결과 ===')
console.log(`테스트 학생 (정리하지 않고 남겨둠): id=${testStudentId}, name="${TEST_STUDENT_NAME}"`)
console.log(`1차 반: "${primaryClassName}" (${primaryClassId}), 2차 반: "${secondClassName}" (${secondClassId})`)
console.log(failures === 0 ? '\n모든 검증 통과 ✅' : `\n${failures}개 검증 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
