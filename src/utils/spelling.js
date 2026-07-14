// 쓰기 시험 채점 로직 — 순수 함수로 분리해 독립 테스트 가능하게 함.
// 대소문자 구분 안 함, 앞뒤 공백 자동 제거, 완전히 일치해야 정답.
// 방향(kr2en/en2kr) 무관 — "target 문자열과 input이 일치하는가"라는 본질은
// 어느 방향이든 같아서 SpellingQuestion이 어느 방향이든 같은 함수를 그대로
// 재사용한다(하드코딩 없이 direction-neutral).
export const normalizeSpelling = (s) => String(s ?? '').trim().toLowerCase()

// words.meaning 컬럼 실 데이터 표본 확인 결과(2026-07 조사, 419개 중 145개
// ≈35%) "휘젓다, 섞다"처럼 한 단어의 여러 뜻/유의어가 쉼표·세미콜론으로
// 함께 저장된 경우가 흔함(예: pattern -> "(규칙적인) 패턴, 양식"). en2kr
// 방향(영어 제시 -> 한글 뜻 입력)에서 이 중 하나만 입력해도 정답 처리되지
// 않으면 실사용에서 절반 가까운 단어가 사실상 못 맞히는 문제가 생기므로,
// 구분자로 나눈 항목 중 하나라도 일치하면 정답으로 인정한다. kr2en
// 방향의 target(영어 단어)에는 쉼표/세미콜론이 사실상 없으므로 이 확장은
// 기존 kr2en 채점 결과에 영향을 주지 않는다(회귀 없음 — 아래
// scripts/testSpelling.mjs 케이스로 확인).
const splitAnswerAlternatives = (target) =>
  String(target ?? '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)

// "(규칙적인) 패턴"처럼 괄호 설명이 앞에 붙은 항목은 괄호를 뗀 "패턴"만
// 입력해도 맞도록 별도로 한 번 더 허용한다(과도한 설계 방지를 위해 딱
// 이 정도까지만 — 괄호 안 텍스트 자체를 답으로 인정하진 않음).
const stripParenthetical = (s) => s.replace(/\([^)]*\)/g, '').trim()

export const isSpellingCorrect = (input, target) => {
  const normInput = normalizeSpelling(input)
  if (!normInput) return false
  return splitAnswerAlternatives(target).some((alt) => {
    if (normalizeSpelling(alt) === normInput) return true
    const stripped = stripParenthetical(alt)
    return !!stripped && normalizeSpelling(stripped) === normInput
  })
}

// 힌트 — 첫 글자만 보여주고 나머지는 빈칸(밑줄)으로 표시. 방향 무관하게
// 그대로 재사용 가능(문자열 인덱싱만 하므로 영어/한글 모두 동작).
export const spellingHintFor = (word) => `${word[0]}${' _'.repeat(Math.max(word.length - 1, 0))}`
