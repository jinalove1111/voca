// Verifies the spelling-test grading rules (src/utils/spelling.js):
// case-insensitive, whitespace-trimmed, exact match required.
import { isSpellingCorrect, spellingHintFor, normalizeSpelling } from '../src/utils/spelling.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. 대소문자 구분 안 함')
check('APPLE == apple', isSpellingCorrect('APPLE', 'apple'))
check('Apple == apple', isSpellingCorrect('Apple', 'apple'))
check('aPPle == apple', isSpellingCorrect('aPPle', 'apple'))

console.log('\n2. 앞뒤 공백 자동 제거')
check('"  apple  " == apple', isSpellingCorrect('  apple  ', 'apple'))
check('"apple\\n" == apple (개행도 제거)', isSpellingCorrect('apple\n', 'apple'))

console.log('\n3. 완전히 일치해야 정답 (부분일치/오타는 오답)')
check('appl != apple (오타)', !isSpellingCorrect('appl', 'apple'))
check('applee != apple (오타)', !isSpellingCorrect('applee', 'apple'))
check('banana != apple (다른 단어)', !isSpellingCorrect('banana', 'apple'))
check('빈 문자열 != apple', !isSpellingCorrect('', 'apple'))
check('중간 공백은 무시하지 않음: "ap ple" != apple', !isSpellingCorrect('ap ple', 'apple'))

console.log('\n4. null/undefined 입력해도 크래시 없이 오답 처리')
check('null 입력 -> false, 크래시 없음', isSpellingCorrect(null, 'apple') === false)
check('undefined 입력 -> false, 크래시 없음', isSpellingCorrect(undefined, 'apple') === false)

console.log('\n5. 힌트 — 첫 글자 + 나머지 빈칸')
check('apple -> "a _ _ _ _"', spellingHintFor('apple') === 'a _ _ _ _')
check('cat -> "c _ _"', spellingHintFor('cat') === 'c _ _')
check('한 글자 단어 "a" -> "a"', spellingHintFor('a') === 'a')

console.log('\n6. normalizeSpelling 단독 확인')
check('normalizeSpelling("  Apple ") === "apple"', normalizeSpelling('  Apple ') === 'apple')

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
