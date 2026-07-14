// Verifies the spelling-test grading rules (src/utils/spelling.js):
// case-insensitive, whitespace-trimmed, exact match required — PLUS
// (2026-07 direction expansion) direction-neutral multi-answer grading for
// en2kr: words.meaning often stores several comma/semicolon-separated
// synonyms (e.g. "휘젓다, 섞다"), so matching any one of them must count as
// correct. kr2en targets (English words) essentially never contain commas,
// so this extension must not change any kr2en grading result — sections
// 1-6 below are the original kr2en regression suite, verbatim, still
// passing unchanged.
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

console.log('\n7. en2kr 방향 — 콤마로 구분된 복수 정답(실제 words.meaning 표본 패턴) 중 하나만 맞아도 정답')
check('"휘젓다" == "휘젓다, 섞다" (첫 번째 대안)', isSpellingCorrect('휘젓다', '휘젓다, 섞다'))
check('"섞다" == "휘젓다, 섞다" (두 번째 대안)', isSpellingCorrect('섞다', '휘젓다, 섞다'))
check('공백 섞여도 동일: " 섞다 " == "휘젓다, 섞다"', isSpellingCorrect(' 섞다 ', '휘젓다, 섞다'))
check('둘 다 아니면 오답: "젓다" != "휘젓다, 섞다"', !isSpellingCorrect('젓다', '휘젓다, 섞다'))
check('세미콜론 구분자도 동일하게 처리: "끝" == "조언; (뾰족한) 끝; 봉사료, 팁"', isSpellingCorrect('끝', '조언; (뾰족한) 끝; 봉사료, 팁'))
check('전혀 관련 없는 값은 여전히 오답', !isSpellingCorrect('사과', '휘젓다, 섞다'))

console.log('\n8. en2kr 방향 — 괄호 설명이 붙은 대안은 괄호를 뗀 형태도 정답 인정')
check('"패턴" == "(규칙적인) 패턴, 양식" (괄호 뗀 형태)', isSpellingCorrect('패턴', '(규칙적인) 패턴, 양식'))
check('"양식" == "(규칙적인) 패턴, 양식" (다른 대안)', isSpellingCorrect('양식', '(규칙적인) 패턴, 양식'))
check('괄호 포함 원문 그대로 입력해도 정답: "(규칙적인) 패턴" == "(규칙적인) 패턴, 양식"', isSpellingCorrect('(규칙적인) 패턴', '(규칙적인) 패턴, 양식'))

console.log('\n9. kr2en 방향은 회귀 없음 — 영어 target에는 콤마가 없으므로 기존과 동일하게 완전일치만 정답')
check('"apple" == "apple" (단일 정답, 변화 없음)', isSpellingCorrect('apple', 'apple'))
check('"apple" != "apple, banana" 같은 비현실적 target이어도 다중 대안 로직 자체는 정상 동작(참고용)', isSpellingCorrect('banana', 'apple, banana'))

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
