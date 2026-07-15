// P0(2026-07-15) 갱신 — findStudentByName은 이제 "이름으로 로그인 인증"이
// 아니라 관리자 도구용 조회 헬퍼일 뿐이다(실제 로그인 인증은 이름+PIN,
// api/verify-student-pin.js가 서버에서 담당 — 이 스크립트는 클라이언트
// wordLibrary.js 캐시 레이어만 다루므로 그 서버 엔드포인트는 별도
// scripts/testStudentPinAuth.mjs에서 검증한다). 대소문자 무시 매칭이
// 여전히 정확히 동작하는지, addStudent가 이제 id(UUID)를 반환하는지,
// removeStudent(id)가 id 기반으로 정확히 동작하는지 검증한다.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const { initWordLibrary, findStudentByName, addStudent, getStudents, removeStudent, getStudentById } = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASSES = (await import(pathToFileURL(BUNDLE).href)).getClassNames()
const anyClass = CLASSES[0]
if (!anyClass) throw new Error('No class exists to test against — aborting')

console.log('\n1. 신규 학생 등록 — addStudent가 id(UUID)를 반환')
const studentId = await addStudent('QA_CaseTest', anyClass, 'Unit 1')
check('addStudent가 UUID 형태의 id를 반환함', typeof studentId === 'string' && /^[0-9a-f-]{36}$/i.test(studentId))
check('getStudentById(id)로 즉시 조회됨', getStudentById(studentId)?.name === 'QA_CaseTest')

console.log('\n2. 대소문자 무시 이름 조회 (findStudentByName — 이제 배열 반환, 관리자 도구용)')
check('정확한 이름으로 조회됨 (배열에 포함)', findStudentByName('QA_CaseTest').some(s => s.id === studentId))
check('소문자로 입력해도 같은 학생이 배열에 포함됨', findStudentByName('qa_casetest').some(s => s.id === studentId))
check('대문자로 입력해도 같은 학생이 배열에 포함됨', findStudentByName('QA_CASETEST').some(s => s.id === studentId))
check('앞뒤 공백이 있어도 조회됨', findStudentByName('  qa_casetest  ').some(s => s.id === studentId))

console.log('\n3. 존재하지 않는 학생 조회')
check('없는 이름은 빈 배열 반환', Array.isArray(findStudentByName('QA_NoSuchStudent_zzz')) && findStudentByName('QA_NoSuchStudent_zzz').length === 0)

console.log('\n4. getStudents()는 이제 학생 객체 배열을 반환 (이름 문자열 배열 아님)')
const all = getStudents()
check('getStudents() 결과가 배열', Array.isArray(all))
check('각 원소가 {id,name,...} 객체 형태', all.every(s => typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string'))
check('방금 등록한 학생이 포함됨', all.some(s => s.id === studentId))

console.log('\n5. 정리 — removeStudent(id)')
await removeStudent(studentId)
check('삭제 후 getStudentById가 null 반환', getStudentById(studentId) === null)
check('삭제 후 findStudentByName에서도 사라짐', !findStudentByName('QA_CaseTest').some(s => s.id === studentId))

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
