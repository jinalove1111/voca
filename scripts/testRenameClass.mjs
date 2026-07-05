// Verifies that renaming a class (renameClass) never breaks an existing
// student's word access — students are linked by class_id, not by matching
// the className string, so a rename should be fully transparent to them.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const { initWordLibrary, getStudentWords, renameClass, getClassNames } = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const before = getStudentWords('QA_StudentA').map(w => w.word).sort()
check('개명 전 A반 학생 단어 확인', JSON.stringify(before) === JSON.stringify(['apple', 'banana']))

await renameClass('QA_TestClassA', 'QA_TestClassA_Renamed')

const names = getClassNames()
check('반 목록에 새 이름 반영됨', names.includes('QA_TestClassA_Renamed') && !names.includes('QA_TestClassA'))

const after = getStudentWords('QA_StudentA').map(w => w.word).sort()
check('개명 후에도 같은 학생이 같은 단어(apple/banana)를 그대로 봄', JSON.stringify(after) === JSON.stringify(['apple', 'banana']))

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
