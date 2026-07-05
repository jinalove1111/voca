// Verifies multi-class word/student isolation against the REAL wordLibrary.js
// logic (bundled with esbuild, no source changes) running against the live
// Supabase project — using disposable QA_TestClassA/B + QA_StudentA/B rows
// created via curl right before this script runs (see conversation).
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, getStudentWords, getStudentClassId, getStudentsInClass, getClassNames,
} = await import(pathToFileURL(BUNDLE).href)

await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. classId 기준 반 분리')
{
  const wordsA = getStudentWords('QA_StudentA')
  const wordsB = getStudentWords('QA_StudentB')
  const wordsATexts = wordsA.map(w => w.word).sort()
  const wordsBTexts = wordsB.map(w => w.word).sort()

  check('A반 학생은 apple/banana만 봄', JSON.stringify(wordsATexts) === JSON.stringify(['apple', 'banana']))
  check('B반 학생은 tiger/lion만 봄', JSON.stringify(wordsBTexts) === JSON.stringify(['lion', 'tiger']))
  check('A반 단어에 B반 단어(tiger/lion) 섞이지 않음', !wordsATexts.includes('tiger') && !wordsATexts.includes('lion'))
  check('B반 단어에 A반 단어(apple/banana) 섞이지 않음', !wordsBTexts.includes('apple') && !wordsBTexts.includes('banana'))
  check('각 단어에 classId가 서로 다르게 붙어있음', wordsA[0]?.classId !== wordsB[0]?.classId && wordsA[0]?.classId && wordsB[0]?.classId)

  const classIdA = getStudentClassId('QA_StudentA')
  const classIdB = getStudentClassId('QA_StudentB')
  check('두 학생의 classId가 실제로 다름 (문자열 className이 아니라 id로 구분)', classIdA !== classIdB)
}

console.log('\n2. 반별 학생 목록')
{
  const inA = getStudentsInClass('QA_TestClassA').map(s => s.name)
  const inB = getStudentsInClass('QA_TestClassB').map(s => s.name)
  check('QA_TestClassA에는 QA_StudentA만 있음', JSON.stringify(inA) === JSON.stringify(['QA_StudentA']))
  check('QA_TestClassB에는 QA_StudentB만 있음', JSON.stringify(inB) === JSON.stringify(['QA_StudentB']))
}

console.log('\n3. 반 목록에 두 반 모두 존재')
{
  const names = getClassNames()
  check('QA_TestClassA 존재', names.includes('QA_TestClassA'))
  check('QA_TestClassB 존재', names.includes('QA_TestClassB'))
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
