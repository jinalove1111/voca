// 교과서 예문 프로토타입 — 순수 함수 모델.
//
// React/네트워크/DB 의존성 전혀 없음(테스트 가능성을 위해 의도적으로
// 순수하게 유지). src/data/textbookExamples.js의 정적 샘플 커리큘럼만
// 읽는다. 관리자 전용 프로토타입 컴포넌트에서만 쓰인다 — 학생 화면과
// 무관.
import { TEXTBOOK_CURRICULUM } from '../data/textbookExamples.js'

export function listGrades() {
  return TEXTBOOK_CURRICULUM.map((g) => g.grade)
}

export function listTextbooks(grade) {
  const g = TEXTBOOK_CURRICULUM.find((x) => x.grade === grade)
  if (!g) return []
  return g.units.length ? [g.textbook] : []
}

export function listUnits(grade, textbook) {
  const g = TEXTBOOK_CURRICULUM.find((x) => x.grade === grade && x.textbook === textbook)
  return g ? g.units : []
}

export function getUnit(unitId) {
  for (const g of TEXTBOOK_CURRICULUM) {
    const u = g.units.find((x) => x.id === unitId)
    if (u) return u
  }
  return null
}

// 대소문자 무관 whole-word 첫 매치를 '____'로 치환한다. 못 찾으면(예문
// 데이터에 결함이 있는 경우) 절대 throw하지 않고, 빈칸 없이 원문을 그대로
// 돌려준다 — 프로토타입이 콘텐츠 오류로 죽지 않게 하기 위한 방어적 설계.
export function makeFillBlank(exampleEn, word) {
  if (!exampleEn || !word) return { prompt: exampleEn || '', answer: word || '' }
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`, 'i')
  if (!re.test(exampleEn)) return { prompt: exampleEn, answer: word }
  const prompt = exampleEn.replace(re, '____')
  return { prompt, answer: word }
}

// 관대한 비교: 앞뒤 공백/구두점을 무시하고 소문자로 비교한다.
export function checkAnswer(input, answer) {
  const normalize = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/^[^\w]+|[^\w]+$/g, '')
  return normalize(input) === normalize(answer)
}
