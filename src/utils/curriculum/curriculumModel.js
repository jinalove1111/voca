// src/utils/curriculum/curriculumModel.js — Curriculum Engine 순수 모델 계층.
//
// import 0개(하네스로 검증 가능한 순수성 — readingModel.js/sentenceLearning.js
// 관례와 동일). React/Supabase/네트워크 무의존. 이 파일은 상태를 갖지 않고,
// 값을 받아 값을 돌려주는 함수만 export한다.
//
// 설계 근거: docs/CURRICULUM_ENGINE.md §3(승인 워크플로우) / §12 참고.
// 승인 상태전이(canTransition)를 이 파일에 중앙화하는 이유는 설계 문서
// §3이 명시한 대로다 — "전이 규칙은 순수 함수 canTransition(from, to)로
// 중앙화" (UI/IO 어디서도 상태전이 규칙을 재구현하지 않는다).

// ── 출처·승인 표준 값(supabase_v3_13의 CHECK 제약과 1:1 대응) ──────────────
export const APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected']
export const SOURCES = ['teacher', 'import', 'rule', 'ai']

// 승인 상태 전이 그래프(설계 문서 §3):
//   draft → pending
//   pending → approved | rejected
//   rejected → pending (수정 후 재검수)
//   approved → rejected (회수)
// 그 외 모든 전이(예: draft→approved 직행, approved→pending, 자기자신 등)는
// false — "AI/규칙 초안이 검수 없이 학생에게 노출될 수 없다"는 제품
// 불변식을 이 함수 하나가 지킨다.
const TRANSITIONS = {
  draft: new Set(['pending']),
  pending: new Set(['approved', 'rejected']),
  rejected: new Set(['pending']),
  approved: new Set(['rejected']),
}

export function canTransition(from, to) {
  if (!APPROVAL_STATUSES.includes(from) || !APPROVAL_STATUSES.includes(to)) return false
  if (from === to) return false
  return TRANSITIONS[from]?.has(to) === true
}

// whole-word(대소문자 무관) 포함 여부 — textbookExampleModel.js의
// makeFillBlank가 쓰는 것과 동일한 경계 판정 방식(\b)을 여기서도 재사용
// (같은 정규식 관례, 다만 이 파일은 import 0개 규칙 때문에 그 함수를
// 직접 import하지 않고 같은 로직을 얕게 반복— 로직 자체는 1줄이라 재구현
// 리스크가 낮고, 이 파일의 "import 0개" 제약이 우선한다).
function containsWholeWord(sentence, word) {
  if (!sentence || !word) return false
  const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`, 'i')
  return re.test(sentence)
}

// 예문 필드 검증 — createExample/updateExample(IO 계층)이 DB 왕복 전에
// 호출한다. 필수: target_word, english_sentence. 불변식: english_sentence가
// target_word를 whole-word로(대소문자 무관) 포함해야 한다(그렇지 않으면
// makeFillBlank가 빈칸을 만들 자리가 없어 학습 모드 전체가 무의미해진다).
// difficulty가 주어지면 1..5 범위여야 한다(supabase CHECK와 동일 규칙을
// 클라이언트에서 먼저 걸러 명확한 한국어 에러를 줄 수 있게 함).
export function validateExampleFields(fields) {
  const errors = []
  const f = fields || {}
  const targetWord = typeof f.target_word === 'string' ? f.target_word.trim() : ''
  const englishSentence = typeof f.english_sentence === 'string' ? f.english_sentence.trim() : ''

  if (!targetWord) errors.push('target_word(대상 단어)는 필수예요.')
  if (!englishSentence) errors.push('english_sentence(영어 문장)는 필수예요.')

  if (targetWord && englishSentence && !containsWholeWord(englishSentence, targetWord)) {
    errors.push('영어 문장에 대상 단어가 온전한 단어 형태로 포함돼 있어야 해요.')
  }

  if (f.difficulty !== undefined && f.difficulty !== null) {
    const d = Number(f.difficulty)
    if (!Number.isFinite(d) || d < 1 || d > 5) {
      errors.push('difficulty(난이도)는 1~5 사이 숫자여야 해요.')
    }
  }

  if (f.source !== undefined && f.source !== null && !SOURCES.includes(f.source)) {
    errors.push(`source는 ${SOURCES.join('/')} 중 하나여야 해요.`)
  }

  if (f.approval_status !== undefined && f.approval_status !== null && !APPROVAL_STATUSES.includes(f.approval_status)) {
    errors.push(`approval_status는 ${APPROVAL_STATUSES.join('/')} 중 하나여야 해요.`)
  }

  return { ok: errors.length === 0, errors }
}

// 예문 행(row)이 필터 조건에 맞는지 — listExamples(IO 계층)가 돌려주는 것과
// 같은 camelCase 형태(exampleLibrary.js의 toRow 출력: unitId/textbookId/
// targetWord/grammarPointId/approvalStatus)를 그대로 받는다(리뷰 반영 — 이전
// 버전은 snake_case DB 컬럼명을 기대해서 listExamples 결과에 절대 매치되지
// 않는 계약 불일치가 있었다). 관리자 화면의 로컬 재필터링에 재사용 가능한
// 순수 판정 함수. filters의 각 키는 optional — 주어진 것만 검사한다.
//
// publisherId/gradeId는 필터 키에 없다 — examples 행에는 publisher_id/
// grade_id 컬럼이 없고(설계상 textbook을 경유해서만 연결), 이 함수는 순수
// 판정만 하므로 조인 없이는 그 값을 검증할 수 없다. 출판사/학년으로 예문을
// 거르고 싶은 관리자 화면은 먼저 curriculumApi(listPublishers/listGrades +
// textbooks 조회)로 대상 textbookId 목록을 구한 뒤, 이 함수에는 textbookId
// (또는 unitId)로 넘겨야 한다.
export function matchesFilters(row, filters) {
  const r = row || {}
  const f = filters || {}
  if (f.textbookId && r.textbookId !== f.textbookId) return false
  if (f.unitId && r.unitId !== f.unitId) return false
  if (f.grammarPointId && r.grammarPointId !== f.grammarPointId) return false
  if (f.approvalStatus && r.approvalStatus !== f.approvalStatus) return false
  if (f.targetWord) {
    const needle = String(f.targetWord).trim().toLowerCase()
    const haystack = String(r.targetWord || '').toLowerCase()
    if (needle && !haystack.includes(needle)) return false
  }
  return true
}

// ── 학생 노출 예문 랭킹(2026-08-09, SOURCE TEXT FIRST) ─────────────────────
// fetchApprovedExamplesForWords(exampleLibrary.js)가 단어별 "최고 1개"를
// 고를 때 쓰는 순수 랭킹. 2축:
//   ① 유닛 일치(지배적, x10): 선택 유닛과 정확히 일치하면 2, 아니면 1 —
//      유닛 정렬 예문이 항상 우선(§2 각주, 기존 동작 보존).
//   ② 같은 유닛 축 안 source 우선순위: 'import'(실제 교과서/학평 본문 문장)
//      2 > 'teacher'(교사 직접 작성) 1 > 'rule'/'ai' 0 — 운영자 지시
//      "SOURCE TEXT FIRST, AI GENERATED SECOND".
// 동점이면 호출부의 created_at desc 순회가 최신 행을 유지한다.
export const SOURCE_PRIORITY = { import: 2, teacher: 1, rule: 0, ai: 0 }

// 2026-08-09 확장 — 3축 랭킹(대표 연습 예문 선정, 운영자 지시):
//   ① 유닛 일치(지배적, ×1000)
//   ② 연습 예문 품질(practiceQuality 0..3, ×100) — 같은 단어가 본문에서
//      여러 번 발견돼도 학생에게는 "연습 예문이 있는(그리고 5~8단어인)"
//      대표 1개만 노출되게 하는 축. 점수 계산은 순수 모듈
//      practiceSentence.practiceQualityScore(이 파일은 import 0 유지 —
//      숫자만 받는다).
//   ③ source 우선순위(import 2 > teacher 1 > rule/ai 0, ×10)
// 동점이면 호출부의 created_at desc 순회가 최신 행 유지(기존 동일).
export function computeExampleRank(rowUnitId, source, selectedUnitId, practiceQuality = 0) {
  const unitTier = selectedUnitId && rowUnitId === selectedUnitId ? 2 : 1
  const pq = Math.max(0, Math.min(3, Number(practiceQuality) || 0))
  return unitTier * 1000 + pq * 100 + (SOURCE_PRIORITY[source] || 0) * 10
}

// target_word 정규화 — 저장 시(createExample) 그리고 조회 매칭 시
// (fetchApprovedExamplesForWords의 키) 동일하게 사용해 대소문자/공백 차이로
// 매칭이 어긋나는 것을 방지한다.
export function normalizeTargetWord(s) {
  return String(s || '').trim().toLowerCase()
}
