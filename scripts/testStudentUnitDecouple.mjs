// v2.1 학생-Unit 분리 e2e (라이브 Supabase, QA_ 전용 반/학생 생성 후 전부
// 정리 — 프로덕션 데이터는 절대 건드리지 않음).
//
// 검증 항목(운영자 지정 12개 중 이 레이어에서 자동화 가능한 것):
//   * Unit1→Unit2 전환 시 단어 목록이 즉시 그 유닛으로 바뀜
//   * 전환이 영속됨(refreshStudents = 재로그인/새로고침 시뮬레이션)
//   * 관리자 유닛 변경도 같은 setStudentUnit 경로(동일 검증)
//   * 동명 유닛("Unit 1"이 두 반에 존재) 비충돌 — 자기 반 유닛만 로드
//   * 유닛 삭제 시 크래시 없이 안전 폴백(첫 유닛)
//   * 숙제(daily_assignments)는 유닛과 독립 — 배정 단어가 현재 유닛에
//     없으면 반 전체에서 찾아 우선 표시
//   * getStudents/getStudentsInClass의 unitName이 해석된 값과 일치
//   * v2.1 SQL(supabase_v2_1_student_unit_decouple.sql) 실행 전/후 모두
//     동작 — 컬럼 존재 여부를 감지해 해당 모드의 기대값을 검증
//     (실행 전: unit_name 문자열 폴백 경로 / 실행 후: current_unit_id 1차)
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testStudentUnitDecouple.mjs
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const lib = await import(pathToFileURL(BUNDLE).href)
const {
  initWordLibrary, refreshWordLibrary, refreshStudents,
  createClass, deleteClass, addClassUnit, deleteClassUnit, setClassWords,
  addStudent, removeStudent,
  setStudentUnit, getStudentUnit, getStudentUnitId, getStudentWords,
  getStudents, getStudentsInClass, setTodaysAssignment,
} = lib
await initWordLibrary()

// 컬럼 존재 감지 — v2.1 SQL 실행 전(fallback 모드)/후(id 모드) 분기용.
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
const supabase = createClient(url, key)
const colProbe = await supabase.from('students').select('id,current_unit_id').limit(1)
const HAS_COLUMN = !colProbe.error
console.log(`\n[모드] students.current_unit_id 컬럼: ${HAS_COLUMN ? '존재 (v2.1 SQL 적용 후 — id 1차 경로 검증)' : '없음 (SQL 실행 전 — unit_name 폴백 경로 검증)'}`)

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const CLASS_A = 'QA_UnitDecoupleA'
const CLASS_B = 'QA_UnitDecoupleB'
const STUDENT_NAME = 'QA_UnitDecoupleStu'
const wordsOf = (id) => getStudentWords(id).map((w) => w.word).sort().join(',')

let studentId = null
try {
  console.log('\n1. 준비 — 반 A(Unit 1/Unit 2 + 단어), 반 B(동명 "Unit 1" + 다른 단어)')
  await createClass(CLASS_A)
  await addClassUnit(CLASS_A, 'Unit 1')
  await addClassUnit(CLASS_A, 'Unit 2')
  await setClassWords(CLASS_A, [
    { word: 'apple', meaning: '사과' },
    { word: 'banana', meaning: '바나나' },
  ], 'Unit 1')
  await setClassWords(CLASS_A, [
    { word: 'cherry', meaning: '체리' },
    { word: 'durian', meaning: '두리안' },
    { word: 'elderberry', meaning: '엘더베리' },
  ], 'Unit 2')
  await createClass(CLASS_B)
  await addClassUnit(CLASS_B, 'Unit 1')
  await setClassWords(CLASS_B, [
    { word: 'zebra', meaning: '얼룩말' },
    { word: 'yak', meaning: '야크' },
  ], 'Unit 1')

  studentId = await addStudent(STUDENT_NAME, CLASS_A, 'Unit 1')
  check('등록 직후 Unit 1', getStudentUnit(studentId) === 'Unit 1')
  check('등록 직후 Unit 1 단어 로드', wordsOf(studentId) === 'apple,banana', wordsOf(studentId))
  if (HAS_COLUMN) {
    const { data } = await supabase.from('students').select('current_unit_id').eq('id', studentId).single()
    check('등록 시 current_unit_id 기록됨(id 모드)', !!data?.current_unit_id)
    check('getStudentUnitId가 DB 값과 일치', getStudentUnitId(studentId) === data.current_unit_id)
  } else {
    check('getStudentUnitId는 해석된 유닛의 id 반환(폴백 모드도 캐시로 해석)', typeof getStudentUnitId(studentId) === 'string' && getStudentUnitId(studentId).length > 0)
  }

  console.log('\n2. Unit 1 → Unit 2 전환 (학생 홈 선택기/관리자 배정 공용 경로)')
  await setStudentUnit(studentId, 'Unit 2')
  check('전환 직후 Unit 2', getStudentUnit(studentId) === 'Unit 2')
  check('전환 직후 Unit 2 단어 로드', wordsOf(studentId) === 'cherry,durian,elderberry', wordsOf(studentId))
  if (HAS_COLUMN) {
    const { data } = await supabase.from('students').select('current_unit_id,unit_name').eq('id', studentId).single()
    check('current_unit_id가 Unit 2 id로 갱신', data.current_unit_id === getStudentUnitId(studentId))
    check('unit_name 병행 기록(하위호환)', data.unit_name === 'Unit 2')
  } else {
    const { data } = await supabase.from('students').select('unit_name').eq('id', studentId).single()
    check('폴백 모드: unit_name으로 영속', data.unit_name === 'Unit 2')
  }

  console.log('\n3. 재로그인/새로고침 시뮬레이션 — refreshStudents 후에도 유지')
  await refreshStudents()
  check('재조회 후에도 Unit 2', getStudentUnit(studentId) === 'Unit 2')
  check('재조회 후에도 Unit 2 단어', wordsOf(studentId) === 'cherry,durian,elderberry')

  console.log('\n4. Unit 1 복귀 — 단어 목록이 그대로 돌아옴(진행도는 로컬 레코드라 이 경로와 무관 = 구조적 불변)')
  await setStudentUnit(studentId, 'Unit 1')
  check('복귀 후 Unit 1 단어', wordsOf(studentId) === 'apple,banana')
  await setStudentUnit(studentId, 'Unit 2') // 이후 시나리오는 Unit 2에서

  console.log('\n5. 동명 유닛 비충돌 — 반 B에도 "Unit 1"이 있지만 절대 섞이지 않음')
  await setStudentUnit(studentId, 'Unit 1')
  const w = wordsOf(studentId)
  check('반 A의 Unit 1 단어만(zebra/yak 미포함)', w === 'apple,banana' && !w.includes('zebra'), w)

  console.log('\n6. 로스터 표시 일관성 — getStudents/getStudentsInClass가 해석된 유닛 이름 반환')
  const rosterAll = getStudents().find((s) => s.id === studentId)
  const rosterCls = getStudentsInClass(CLASS_A).find((s) => s.id === studentId)
  check('getStudents().unitName === 해석값', rosterAll?.unitName === getStudentUnit(studentId))
  check('getStudentsInClass().unitName === 해석값', rosterCls?.unitName === getStudentUnit(studentId))

  console.log('\n7. 숙제-유닛 독립 — Unit 1 단어를 오늘 숙제로 배정, 학생은 Unit 2에 있어도 숙제가 열림')
  await setStudentUnit(studentId, 'Unit 2')
  await setTodaysAssignment(CLASS_A, ['apple'])
  const hw = getStudentWords(studentId).map((x) => x.word).join(',')
  check('현재 유닛(Unit 2)에 없는 배정 단어를 반 전체에서 찾아 표시', hw === 'apple', hw)
  await setTodaysAssignment(CLASS_A, []) // 배정 해제
  check('배정 해제 후 현재 유닛 전체 복귀', wordsOf(studentId) === 'cherry,durian,elderberry')

  console.log('\n8. 유닛 삭제 안전 폴백 — 학생이 보던 Unit 2 삭제 → 크래시 없이 첫 유닛')
  await deleteClassUnit(CLASS_A, 'Unit 2')
  await refreshStudents() // FK on delete set null(적용 후) / 문자열 잔존(적용 전) 모두 커버
  const afterDelete = wordsOf(studentId)
  check('삭제 후 첫 유닛(Unit 1) 단어로 폴백', afterDelete === 'apple,banana', afterDelete)
  check('표시 유닛도 폴백과 일치', getStudentUnit(studentId) === 'Unit 1')
} finally {
  console.log('\n9. 정리 (QA 데이터만 삭제)')
  try { if (studentId) await removeStudent(studentId) } catch (e) { console.log('  cleanup student:', e.message) }
  try { await deleteClass(CLASS_A) } catch (e) { console.log('  cleanup A:', e.message) }
  try { await deleteClass(CLASS_B) } catch (e) { console.log('  cleanup B:', e.message) }
  await refreshWordLibrary().catch(() => {})
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
