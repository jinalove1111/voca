// Verifies that renaming a class (renameClass) never breaks an existing
// student's word access — students are linked by class_id, not by matching
// the className string, so a rename should be fully transparent to them.
//
// 2026-07-10: this test used to depend on QA_TestClassA/QA_StudentA
// fixtures shared with testMultiClass.mjs, AND renamed the class without
// ever cleaning up — running it once permanently broke testMultiClass.mjs's
// fixture assumption for every future run, and left an orphaned QA class/
// student in the live DB forever. Now fully self-contained with its own
// disposable fixtures (distinct names, no collision with other test
// scripts) and proper cleanup at the end.
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, getStudentWords, renameClass, getClassNames,
  createClass, deleteClass, setClassWords, addStudent, removeStudent,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n0. 픽스처 준비')
await createClass('QA_RenameTestClass')
await setClassWords('QA_RenameTestClass', [{ word: 'apple', meaning: '사과' }, { word: 'banana', meaning: '바나나' }], 'Unit 1')
await addStudent('QA_RenameStudent', 'QA_RenameTestClass', 'Unit 1')

const before = getStudentWords('QA_RenameStudent').map(w => w.word).sort()
check('개명 전 학생 단어 확인', JSON.stringify(before) === JSON.stringify(['apple', 'banana']))

await renameClass('QA_RenameTestClass', 'QA_RenameTestClass_Renamed')

const names = getClassNames()
check('반 목록에 새 이름 반영됨', names.includes('QA_RenameTestClass_Renamed') && !names.includes('QA_RenameTestClass'))

const after = getStudentWords('QA_RenameStudent').map(w => w.word).sort()
check('개명 후에도 같은 학생이 같은 단어(apple/banana)를 그대로 봄', JSON.stringify(after) === JSON.stringify(['apple', 'banana']))

console.log('\n정리')
await removeStudent('QA_RenameStudent')
await deleteClass('QA_RenameTestClass_Renamed')
check('테스트 반/학생 정리 완료', true)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
