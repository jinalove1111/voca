// Verifies the case-insensitive re-login fix (findStudentByName) and the
// addStudent duplicate guard, against the REAL wordLibrary.js logic
// (esbuild bundle, no source changes) and the live Supabase project, using
// disposable QA rows cleaned up at the end.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const { initWordLibrary, findStudentByName, addStudent, getStudents, removeStudent } = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASSES = (await import(pathToFileURL(BUNDLE).href)).getClassNames()
const anyClass = CLASSES[0]
if (!anyClass) throw new Error('No class exists to test against — aborting')

console.log('\n1. 신규 학생 등록 후 대소문자 다르게 재로그인')
await addStudent('QA_CaseTest', anyClass, 'Unit 1')
check('정확한 이름으로 조회됨', findStudentByName('QA_CaseTest') === 'QA_CaseTest')
check('소문자로 입력해도 원래 이름(QA_CaseTest)으로 해석됨', findStudentByName('qa_casetest') === 'QA_CaseTest')
check('대문자로 입력해도 원래 이름으로 해석됨', findStudentByName('QA_CASETEST') === 'QA_CaseTest')
check('앞뒤 공백이 있어도 해석됨', findStudentByName('  qa_casetest  ') === 'QA_CaseTest')

console.log('\n2. 대소문자만 다른 중복 계정 생성 방지')
const before = getStudents().length
await addStudent('qa_casetest', anyClass, 'Unit 1') // different casing, same student
const after = getStudents().length
check('addStudent가 중복 계정을 만들지 않음', before === after)

console.log('\n3. 존재하지 않는 학생 조회')
check('없는 이름은 null 반환', findStudentByName('QA_NoSuchStudent_zzz') === null)

// cleanup
await removeStudent('QA_CaseTest')
check('테스트 학생 정리 완료', findStudentByName('QA_CaseTest') === null)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
