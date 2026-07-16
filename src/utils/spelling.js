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

// 한글 포함 여부 — 띄어쓰기 무시 비교는 "한글 정답 후보"에만 적용한다.
// 영어 답(kr2en의 target)에까지 공백 제거 비교를 하면 "ice cream"을
// "icecream"으로 써도 정답이 돼 철자 시험 자체가 훼손되므로 절대 금지.
const HAS_HANGUL = /[ㄱ-ㆎ가-힣]/
const normalizeNoSpace = (s) => normalizeSpelling(s).replace(/\s+/g, '')

// 대안 항목 하나(alt)의 파생형들 — 딱 두 가지만(보수적 원칙):
//   1) 괄호 설명 제거: "(규칙적인) 패턴" -> "패턴" (기존 동작 그대로)
//   2) 괄호 기호만 제거해 내용 합침: "영향(을 미치다)" -> "영향을 미치다"
//      (조사/서술부가 괄호로 묶인 표기의 자연스러운 전체형)
// 학생 답의 말단 조사 차이("주문을 하다" vs "주문하다") 같은 형태소 수준
// 유연화는 하지 않는다 — 규칙이 애매한 건 오답 처리하고 교사 검토 큐로
// 보내는 게 방침(2026-07-17 운영자 지시, AI 자동 판정 금지).
const altVariants = (alt) => {
  const variants = [alt]
  const stripped = stripParenthetical(alt)
  if (stripped && stripped !== alt) variants.push(stripped)
  if (/[()]/.test(alt)) {
    const merged = alt.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
    if (merged && !variants.includes(merged)) variants.push(merged)
  }
  return variants
}

const altMatches = (alt, normInput, noSpaceInput) =>
  altVariants(alt).some((v) => {
    if (normalizeSpelling(v) === normInput) return true
    // 한글 후보만: 띄어쓰기 차이 허용("사과 하다" == "사과하다")
    return HAS_HANGUL.test(v) && normalizeNoSpace(v) === noSpaceInput
  })

// 정답 후보 문자열 하나(target 또는 accepted meaning 항목)와 입력 비교.
const candidateMatches = (candidate, normInput, noSpaceInput) => {
  // 2026-07-16 수정: target에 쉼표/세미콜론이 있으면 대안들로 쪼개서만
  // 비교했기 때문에, 학생이 뜻 "전체"를 그대로 정확히 입력한 경우
  // ("휘젓다, 섞다"를 통째로 입력) 오히려 오답 처리되는 구멍이 있었다 —
  // 입실시험 로직 테스트 작성 중 발견. 전체 문자열 일치를 먼저 허용한다.
  if (normalizeSpelling(candidate) === normInput) return true
  if (HAS_HANGUL.test(candidate) && normalizeNoSpace(candidate) === noSpaceInput) return true
  return splitAnswerAlternatives(candidate).some((alt) => altMatches(alt, normInput, noSpaceInput))
}

// opts.acceptedMeanings — 단어별 "추가 인정 뜻" 목록(words.accepted_meanings,
// 관리자가 직접 등록). 각 항목은 target과 완전히 동일한 규칙(다중 대안/
// 괄호/띄어쓰기)으로 비교된다. 2-인자 호출(기존 코드 전부)은 동작 100% 동일.
export const isSpellingCorrect = (input, target, opts = {}) => {
  const normInput = normalizeSpelling(input)
  if (!normInput) return false
  const noSpaceInput = normalizeNoSpace(input)
  const extra = Array.isArray(opts.acceptedMeanings) ? opts.acceptedMeanings : []
  return [target, ...extra].some((c) => c != null && String(c).trim() !== '' && candidateMatches(String(c), normInput, noSpaceInput))
}

// 힌트 — 첫 글자만 보여주고 나머지는 빈칸(밑줄)으로 표시. 방향 무관하게
// 그대로 재사용 가능(문자열 인덱싱만 하므로 영어/한글 모두 동작).
export const spellingHintFor = (word) => `${word[0]}${' _'.repeat(Math.max(word.length - 1, 0))}`
