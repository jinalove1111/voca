// v3.x — 교재 표시 라벨 단일 원천(2026-09-03, 운영자 지시).
//
// 배경(실사고): 운영자가 "중1 천재 이상기"를 새로 추가하려다 관리자
// 화면에서 이름이 같은 두 교재(중1/중2 천재 이상기) 중 학년이 다른 걸
// 잘못 선택해, 학생 화면에 엉뚱한 교재가 노출됐다. 데이터 계층(createClass/
// textbooks 테이블)에는 잘못이 없다 — 정확한 이름으로 별개 행이 그대로
// 만들어졌다(문자열 정규화/학년 유추 없음, 의도적으로 그대로 유지).
// 문제는 순수 UI: 관리자가 교재를 "고르는" <select> 옵션 텍스트가
// 이름만 보여줘 이름이 같고 학년/출판사만 다른 두 교재를 구분할 수
// 없었다(TextbookAssignmentPanel.jsx). 이 파일은 그 표시 텍스트를
// 한 곳에서 만든다 — 데이터 쓰기 경로는 절대 건드리지 않는다.
//
// textbookLabel은 ClassTextbookLinks.jsx가 2026-07-22부터 써온 인라인
// tbLabel(name + (publisher))을 글자 그대로 추출한 것 — 출력 문자열은
// 100% 동일(회귀 없음, scripts/testTextbookGradeLabel.mjs 골든 스냅샷으로
// 고정). textbookOptionLabel은 여기에 유닛 수를 더해 배정 목록
// (TextbookAssignmentPanel.jsx)처럼 더 강한 구분이 필요한 곳에서만 쓴다.

// tb: { name, publisherName? } — getAllTextbooks()/getTextbookById()가
// 주는 모양 그대로 받는다. tb가 없거나 name이 없으면 빈 문자열(화면이
// 깨지지 않는다).
export function textbookLabel(tb) {
  return [tb?.name, tb?.publisherName && `(${tb.publisherName})`].filter(Boolean).join(' ')
}

// unitCount: 숫자면 " · 유닛 N개"를 덧붙인다. 숫자가 아니면(계산 불가/
// 아직 모름) 붙이지 않고 textbookLabel과 완전히 동일한 결과를 반환한다 —
// 호출부가 유닛 수를 못 구해도 화면이 깨지지 않는다.
export function textbookOptionLabel(tb, unitCount) {
  const base = textbookLabel(tb)
  return typeof unitCount === 'number' ? `${base} · 유닛 ${unitCount}개` : base
}
