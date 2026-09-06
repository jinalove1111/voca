// 곡선 아포스트로피 매칭 회귀 테스트(2026-09-06 야간 QA) —
// src/utils/curriculum/textImport.js의 buildMatchers/matchWordsToSentences.
// 배경: don't/I'm처럼 스트레이트 아포스트로피(')로 등록된 축약형 단어가
// 곡선 아포스트로피(’ 등, 워드/한글 IME/붙여넣기 흔함)로 타이핑된 문장과
// whole-word 정규식으로 매칭되지 않아 NOT_FOUND로 분류되던 문제.
// 순수 함수만 직접 호출 — 네트워크 0(scripts/testNextFailState.mjs와 동일
// 관례).
import { matchWordsToSentences } from '../src/utils/curriculum/textImport.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

function matchOf(word, sentence) {
  const [result] = matchWordsToSentences([{ id: 'w1', word }], [sentence])
  return result.matches[0] || null
}

console.log('\n=== ① 스트레이트 아포스트로피로 등록된 단어 ↔ 곡선 아포스트로피 문장 ===')
{
  const SENT = 'I don’t like it.' // curly ’ (U+2019)
  const m = matchOf("don't", SENT)
  check('word "don\'t"(straight) matches curly-apostrophe sentence', m !== null)
  check('matchType === exact', m?.matchType === 'exact')
  check('반환된 sentence는 원문(curly)과 byte-identical', m?.sentence === SENT)
}

{
  const SENT = 'I’m happy.' // curly ’
  const m = matchOf("I'm", SENT)
  check('word "I\'m"(straight) matches curly-apostrophe sentence "I’m happy."', m !== null)
  check('matchType === exact', m?.matchType === 'exact')
  check('반환된 sentence는 원문(curly)과 byte-identical', m?.sentence === SENT)
}

console.log('\n=== ② 곡선 아포스트로피로 등록된 단어 ↔ 스트레이트 아포스트로피 문장(역방향) ===')
{
  const SENT = "I don't like it." // straight '
  const m = matchOf('don’t', SENT) // curly 등록
  check('word "don’t"(curly)으로 등록해도 straight-apostrophe 문장과 매칭', m !== null)
  check('matchType === exact', m?.matchType === 'exact')
  check('반환된 sentence는 원문(straight) 그대로', m?.sentence === SENT)
}

console.log('\n=== ③ 원문 보존 불변식 — 다른 곡선 변형 문자(ʻʼ′＇)도 정규화 ===')
{
  const variants = ['‘', '’', 'ʼ', 'ʻ', '′', '＇']
  for (const ch of variants) {
    const sent = `I don${ch}t like it.`
    const m = matchOf("don't", sent)
    check(`아포스트로피 변형 U+${ch.codePointAt(0).toString(16).toUpperCase()} 매칭`, m !== null && m.sentence === sent)
  }
}

console.log('\n=== ④ 대조군 — 비축약형 단어는 기존 동작 그대로(회귀 없음) ===')
{
  const before = matchOf('apple', 'I like apples.')
  check('대조군 "apple" in "I like apples." — matchType 존재(기존과 동일 분류)', before !== null)
  // regularInflections('apple')에 'apples'가 포함되므로 원형 자체는 문장에
  // 없고 변화형만 존재 — 기존 로직대로 'inflected'로 분류돼야 한다(아포
  // 스트로피 정규화와 무관한 축약형 아닌 단어의 동작은 절대 변경되지 않음).
  check('대조군 matchType === inflected(변경 없음)', before?.matchType === 'inflected')
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
