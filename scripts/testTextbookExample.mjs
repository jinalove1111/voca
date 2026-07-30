// 교과서 예문 프로토타입 순수 함수/데이터 검증.
//
// src/utils/textbookExampleModel.js와 src/data/textbookExamples.js는 둘 다
// React/DB 의존성이 전혀 없는 순수 모듈이라 esbuild 번들 없이 Node에서
// 바로 import 가능하다(package.json에 "type": "module" 있음).
//   node scripts/testTextbookExample.mjs
import assert from 'node:assert/strict'
import { TEXTBOOK_CURRICULUM } from '../src/data/textbookExamples.js'
import {
  listGrades,
  listTextbooks,
  listUnits,
  getUnit,
  makeFillBlank,
  checkAnswer,
} from '../src/utils/textbookExampleModel.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. 모든 grade/textbook/unit이 list* 함수로 도달 가능함')
{
  const grades = listGrades()
  check(`listGrades()가 ${TEXTBOOK_CURRICULUM.length}개 학년을 반환함`, grades.length === TEXTBOOK_CURRICULUM.length)

  for (const g of TEXTBOOK_CURRICULUM) {
    check(`listGrades()에 "${g.grade}" 포함`, grades.includes(g.grade))
    const textbooks = listTextbooks(g.grade)
    check(`listTextbooks("${g.grade}")에 "${g.textbook}" 포함`, textbooks.includes(g.textbook))

    const units = listUnits(g.grade, g.textbook)
    check(`listUnits("${g.grade}", "${g.textbook}")가 ${g.units.length}개 단원 반환`, units.length === g.units.length)

    for (const u of g.units) {
      const found = units.find((x) => x.id === u.id)
      check(`listUnits() 결과에 단원 ${u.id} 포함`, !!found)

      const viaGetUnit = getUnit(u.id)
      check(`getUnit("${u.id}")가 올바른 단원 반환`, viaGetUnit?.id === u.id)

      check(`단원 ${u.id}에 vocab이 최소 4개 이상 있음`, u.vocab.length >= 4)
      for (const v of u.vocab) {
        check(`  단어 "${v.word}"에 example이 최소 2개 있음`, v.examples.length >= 2)
      }
    }
  }
}

check('getUnit()이 존재하지 않는 id에 대해 null 반환(throw 아님)', getUnit('does-not-exist') === null)

console.log('\n2. 모든 vocab 예문의 en이 자신의 word를 포함함(빈칸 생성 가능성 보장)')
{
  for (const g of TEXTBOOK_CURRICULUM) {
    for (const u of g.units) {
      for (const v of u.vocab) {
        for (const ex of v.examples) {
          const re = new RegExp(`\\b${v.word}\\b`, 'i')
          check(`"${ex.en}"이 단어 "${v.word}"를 포함함`, re.test(ex.en))
        }
      }
    }
  }
}

console.log('\n3. makeFillBlank()가 단어를 빈칸으로 바꾸고 answer로 반환함')
{
  const { prompt, answer } = makeFillBlank('You are my good friend.', 'friend')
  check('prompt에 "____" 포함', prompt.includes('____'))
  check('prompt에 원래 단어가 더 이상 없음(대소문자 무관)', !/friend/i.test(prompt))
  check('answer가 원래 단어와 같음', answer === 'friend')

  // 대소문자 무관 매칭
  const caseInsensitive = makeFillBlank('Friend is a nice word.', 'friend')
  check('대소문자가 달라도 매칭됨', caseInsensitive.prompt.includes('____'))

  // whole-word 매칭 (부분 문자열 오탐 방지: "friendly" 안의 "friend"는 안 잡혀야 함)
  const wholeWord = makeFillBlank('She is very friendly.', 'friend')
  check('whole-word 경계를 지켜 "friendly" 안의 "friend"를 blank하지 않음', !wholeWord.prompt.includes('____'))
  check('매칭 실패 시 answer는 그대로 전달됨', wholeWord.answer === 'friend')
  check('매칭 실패 시 prompt는 원문 그대로(throw 없음)', wholeWord.prompt === 'She is very friendly.')

  // 빈 입력에도 throw하지 않음
  const empty = makeFillBlank('', 'friend')
  check('빈 문자열 입력에도 throw하지 않고 안전하게 반환', empty.prompt === '' && empty.answer === 'friend')
}

console.log('\n4. checkAnswer()가 대소문자/공백/구두점에 관대함')
{
  check('정확히 같은 문자열', checkAnswer('friend', 'friend') === true)
  check('대소문자 다름', checkAnswer('Friend', 'friend') === true)
  check('앞뒤 공백', checkAnswer('  friend  ', 'friend') === true)
  check('앞뒤 구두점', checkAnswer('friend.', 'friend') === true)
  check('전혀 다른 단어는 false', checkAnswer('foe', 'friend') === false)
  check('전체 문장 비교 - 대소문자/구두점 무시', checkAnswer('you are my good friend', 'You are my good friend.') === true)
  check('전체 문장 비교 - 실제로 다른 문장은 false', checkAnswer('you are my bad friend', 'You are my good friend.') === false)
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures}개 실패`)
process.exit(failures ? 1 : 0)
