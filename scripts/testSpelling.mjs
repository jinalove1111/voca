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
import { assignDirections } from '../src/utils/entranceTest.js'

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
check('뜻 전체를 그대로 입력해도 정답: "휘젓다, 섞다" == "휘젓다, 섞다" (2026-07-16 수정)', isSpellingCorrect('휘젓다, 섞다', '휘젓다, 섞다'))
check('세미콜론 포함 전체 입력도 정답: "조언; (뾰족한) 끝; 봉사료, 팁" 통째로', isSpellingCorrect('조언; (뾰족한) 끝; 봉사료, 팁', '조언; (뾰족한) 끝; 봉사료, 팁'))

console.log('\n8. en2kr 방향 — 괄호 설명이 붙은 대안은 괄호를 뗀 형태도 정답 인정')
check('"패턴" == "(규칙적인) 패턴, 양식" (괄호 뗀 형태)', isSpellingCorrect('패턴', '(규칙적인) 패턴, 양식'))
check('"양식" == "(규칙적인) 패턴, 양식" (다른 대안)', isSpellingCorrect('양식', '(규칙적인) 패턴, 양식'))
check('괄호 포함 원문 그대로 입력해도 정답: "(규칙적인) 패턴" == "(규칙적인) 패턴, 양식"', isSpellingCorrect('(규칙적인) 패턴', '(규칙적인) 패턴, 양식'))

console.log('\n9. kr2en 방향은 회귀 없음 — 영어 target에는 콤마가 없으므로 기존과 동일하게 완전일치만 정답')
check('"apple" == "apple" (단일 정답, 변화 없음)', isSpellingCorrect('apple', 'apple'))
check('"apple" != "apple, banana" 같은 비현실적 target이어도 다중 대안 로직 자체는 정상 동작(참고용)', isSpellingCorrect('banana', 'apple, banana'))

console.log('\n10. (2026-07-17) 한글 답 띄어쓰기 차이 허용 — 영어 답에는 절대 미적용')
check('"주문하다" == "주문 하다" (한글: 공백 무시)', isSpellingCorrect('주문하다', '주문 하다'))
check('"주문 하다" == "주문하다" (반대 방향도 동일)', isSpellingCorrect('주문 하다', '주문하다'))
check('"영향을미치다" == "영향을 미치다"', isSpellingCorrect('영향을미치다', '영향을 미치다'))
check('대안 중 하나에도 적용: "섞 다" == "휘젓다, 섞다"', isSpellingCorrect('섞 다', '휘젓다, 섞다'))
check('영어 답은 여전히 공백 무시 안 함: "icecream" != "ice cream"', !isSpellingCorrect('icecream', 'ice cream'))
check('영어 답 회귀 재확인: "ap ple" != "apple"', !isSpellingCorrect('ap ple', 'apple'))
check('한글이어도 다른 뜻이면 오답: "주문받다" != "주문하다"', !isSpellingCorrect('주문받다', '주문하다'))

console.log('\n11. (2026-07-17) 괄호 조사/서술부 합침형 인정 — "영향(을 미치다)" 패턴')
check('"영향" == "영향(을 미치다)" (괄호 뗀 형태, 기존 규칙)', isSpellingCorrect('영향', '영향(을 미치다)'))
check('"영향을 미치다" == "영향(을 미치다)" (괄호 합침형, 신규)', isSpellingCorrect('영향을 미치다', '영향(을 미치다)'))
check('"영향을미치다" == "영향(을 미치다)" (합침형+공백 무시 결합)', isSpellingCorrect('영향을미치다', '영향(을 미치다)'))
check('무관한 답은 오답: "영향력" != "영향(을 미치다)"', !isSpellingCorrect('영향력', '영향(을 미치다)'))
check('말단 조사 차이는 보수적으로 오답(검토 큐 대상): "주문을 하다" != "주문하다"', !isSpellingCorrect('주문을 하다', '주문하다'))

console.log('\n12. (2026-07-17) acceptedMeanings — 단어별 추가 인정 뜻')
const opts = { acceptedMeanings: ['질서', '순서(를 정하다)'] }
check('기본 target은 그대로 정답: "주문하다" == "주문하다"', isSpellingCorrect('주문하다', '주문하다', opts))
check('추가 인정 뜻도 정답: "질서"', isSpellingCorrect('질서', '주문하다', opts))
check('추가 인정 뜻에 괄호 규칙 적용: "순서"', isSpellingCorrect('순서', '주문하다', opts))
check('추가 인정 뜻에 합침형 적용: "순서를 정하다"', isSpellingCorrect('순서를 정하다', '주문하다', opts))
check('목록에 없으면 여전히 오답: "지시"', !isSpellingCorrect('지시', '주문하다', opts))
check('acceptedMeanings 미전달(기존 호출) 동작 동일: "질서" != "주문하다"', !isSpellingCorrect('질서', '주문하다'))
check('acceptedMeanings=null 안전: 크래시 없음', isSpellingCorrect('주문하다', '주문하다', { acceptedMeanings: null }))
check('빈 문자열 항목은 무시(공백 입력이 정답 되면 안 됨)', !isSpellingCorrect('', '주문하다', { acceptedMeanings: [''] }))

console.log('\n13. (2026-07-17) assignDirections — mixed 50:50 정확 배분 (입실시험/쓰기 모드 공용)')
{
  const dirs20 = assignDirections(20, 'mixed')
  check('20문제 mixed: kr2en 정확히 10개', dirs20.filter((d) => d === 'kr2en').length === 10)
  check('20문제 mixed: en2kr 정확히 10개', dirs20.filter((d) => d === 'en2kr').length === 10)
  const dirs7 = assignDirections(7, 'mixed')
  const k7 = dirs7.filter((d) => d === 'kr2en').length
  check('7문제(홀수) mixed: 3:4 또는 4:3', (k7 === 3 || k7 === 4) && dirs7.length === 7)
  // 셔플 확인 — 결정적 rng로 "전반부 전부 kr2en" 배열이 아님을 확인
  let seed = 42
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  const dirsShuffled = assignDirections(10, 'mixed', { rng })
  check('mixed는 셔플됨(전반부 5개가 전부 kr2en인 정렬 상태가 아님)', dirsShuffled.slice(0, 5).some((d) => d === 'en2kr'))
  check('kr2en 고정: 전부 kr2en', assignDirections(5, 'kr2en').every((d) => d === 'kr2en'))
  check('en2kr 고정: 전부 en2kr', assignDirections(5, 'en2kr').every((d) => d === 'en2kr'))
  check('random: 길이만 보장(각 원소는 kr2en/en2kr)', assignDirections(30, 'random').every((d) => d === 'kr2en' || d === 'en2kr'))
  check('알 수 없는 값 -> fallback 전부 배정', assignDirections(3, 'weird').every((d) => d === 'kr2en'))
  check('0개/음수 안전', assignDirections(0, 'mixed').length === 0 && assignDirections(-5, 'mixed').length === 0)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
