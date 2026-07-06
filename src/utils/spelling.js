// 쓰기 시험 채점 로직 — 순수 함수로 분리해 독립 테스트 가능하게 함.
// 대소문자 구분 안 함, 앞뒤 공백 자동 제거, 완전히 일치해야 정답.
export const normalizeSpelling = (s) => String(s ?? '').trim().toLowerCase()

export const isSpellingCorrect = (input, target) => normalizeSpelling(input) === normalizeSpelling(target)

// 힌트 — 첫 글자만 보여주고 나머지는 빈칸(밑줄)으로 표시.
export const spellingHintFor = (word) => `${word[0]}${' _'.repeat(Math.max(word.length - 1, 0))}`
