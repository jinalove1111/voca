// 입실시험 "대상 학생" 판정 — 단일 진실 공급원(순수 함수, 네트워크/DB 무접촉).
//
// 왜 이 파일이 따로 있나: 2026-08-10~11 사이에 같은 버그가 세 번 형태를 바꿔
// 재발했다. 원인은 전부 "이 학생이 이 반의 시험 대상인가"를 서로 다른 곳에서
// 서로 다른 기준으로 계산했기 때문이다.
//   ① 학생 배너: students.class_id 하나만 봄        -> 교재 반 시험 전원 미표시
//   ② 91차 수정: class_id ∪ SCA.class_id            -> 교재 축 누락으로 8명 미표시
//   ③ 관리자 분모: students.class_id 하나만 봄       -> 교재 반 0명 / 사람 반 과다
// 규칙을 이 파일 한 곳에만 두고 학생 화면·관리자 화면이 똑같이 쓰게 한다.
//
// ── 운영 원칙(2026-08-11 운영자 확정) ──────────────────────────────────
// "학생의 반 ≠ 학생이 공부할 수 있는 모든 교재."
// 중2 학생도 필요하면 고1 교재를 배정받아 공부할 수 있고, 반을 옮기지 않는다.
// 따라서 판정 기준은 학년/반 이름이 아니라 **배정이 실제 존재하는가**다.
// "오늘 열어본 교재"(current_unit_id)로도 판정하지 않는다 — 학생이 교재를
// 오가며 공부하기 때문(실례: 김보민은 고1 6월 학평을 보는 중이지만 고1 능률
// 민병천도 배정돼 있어 두 시험 모두 대상).
//
// ── 판정 규칙 ─────────────────────────────────────────────────────────
// 학생의 "입실시험 조회 범위" = 다음 반 id의 합집합(중복 제거):
//   A. students.class_id                      — 사람 반에 직접 시험을 연 경우
//   B. student_class_assignments.class_id     — 개별 배정(v2.9 축)
//   C. B행의 textbook_id가 가리키는 교재의 소유 반(v3.1 축)
// 시험은 entrance_tests.class_id 하나로 식별되므로, 그 값이 이 범위에 있으면
// 대상이다.
//
// B와 C가 둘 다 필요한 이유: setPrimaryTextbook은 textbook_id만 갱신하고
// class_id는 예전 값을 남긴다(사람 반 불변 전환). 그래서 한 배정 행이 두
// 축에서 서로 다른 반을 가리키는 상태가 정상적으로 존재한다(실측 56행).
//
// class_textbooks(반의 기본 교재)는 **의도적으로 판정에 넣지 않는다**.
// 넣으면 "반에 그 교재가 걸려 있다"는 이유만으로 그 반 전원이 시험 대상이
// 되어, 실제로는 다른 책을 배정받은 학생까지 끌려 들어온다(실측: 고1 능률
// 민병천 8명 -> 15명, Pre-Middle 9명이 고1 시험 대상이 됨). 운영자 확정
// 규칙은 "반 전체"가 아니라 "배정이 실제 존재하는 학생"이다.

// 아카이브/중복/QA 픽스처 계정 — 이름 접미·접두 관례(StudentSelect의
// isRealSetupStudent, StudentDirectory 로드 필터와 같은 규칙 중 "계정 종류"
// 부분만). 화면별 예외 목록(특정 이름 제외 등)은 여기 넣지 않는다 — 그건
// 그 화면의 정책이지 계정 종류가 아니다.
export const isArchivedOrFixtureStudentName = (name) =>
  /_dup|_inactive/i.test(name || '') || /^(qa_|_qa_)/i.test(name || '')

// 배정 행 하나가 근거로 삼는 반 id들 — [class_id, 교재 소유 반].
// resolveTextbookOwnerClassId: (textbookId) => classId | null (호출부가 주입).
export function assignmentClassIds(assignment, resolveTextbookOwnerClassId) {
  if (!assignment) return []
  const out = []
  if (assignment.classId) out.push(assignment.classId)
  const ownerClassId = assignment.textbookId && typeof resolveTextbookOwnerClassId === 'function'
    ? resolveTextbookOwnerClassId(assignment.textbookId)
    : null
  if (ownerClassId) out.push(ownerClassId)
  return out
}

// 학생의 전체 조회 범위(순서: 사람 반 -> 배정 순). 중복 제거, falsy 제거.
export function entranceScopeClassIds({ primaryClassId, assignments, resolveTextbookOwnerClassId }) {
  const ids = []
  const push = (id) => { if (id && !ids.includes(id)) ids.push(id) }
  push(primaryClassId)
  for (const a of assignments || []) {
    for (const id of assignmentClassIds(a, resolveTextbookOwnerClassId)) push(id)
  }
  return ids
}

// 이 학생이 이 반의 시험 대상인가 — 관리자 집계와 학생 화면이 같은 답을
// 내야 하는 지점. scope는 entranceScopeClassIds의 결과.
export const isInEntranceScope = (scope, testClassId) =>
  !!testClassId && Array.isArray(scope) && scope.includes(testClassId)

// 판정 근거(관리자 추적/디버깅용) — 왜 이 학생이 대상인지.
// 'CLASS_MEMBER'        : students.class_id 가 그 반
// 'INDIVIDUAL_CLASS'    : 배정 행의 class_id 가 그 반(v2.9 축)
// 'INDIVIDUAL_TEXTBOOK' : 배정 교재의 소유 반이 그 반(v3.1 축)
// null                  : 대상 아님
export function entranceEligibilitySource({ primaryClassId, assignments, resolveTextbookOwnerClassId }, testClassId) {
  if (!testClassId) return null
  if (primaryClassId && primaryClassId === testClassId) return 'CLASS_MEMBER'
  for (const a of assignments || []) {
    if (a?.classId === testClassId) return 'INDIVIDUAL_CLASS'
  }
  for (const a of assignments || []) {
    if (!a?.textbookId) continue
    const owner = typeof resolveTextbookOwnerClassId === 'function' ? resolveTextbookOwnerClassId(a.textbookId) : null
    if (owner && owner === testClassId) return 'INDIVIDUAL_TEXTBOOK'
  }
  return null
}
