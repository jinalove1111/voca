// 검색 결과 렌더 상한(2026-09, overnight T7b) — 순수 함수만, 필터링/선택
// 로직은 절대 건드리지 않는다(호출부의 filteredGroups/selected 계산은
// 그대로, 이 함수는 "이미 계산된 결과 목록을 얼마나 화면에 그릴지"만
// 자른다). 학생 규모가 커진 반(대량 검색 히트)에서 DOM 노드 수가
// 무제한으로 늘어나는 걸 막기 위한 순수 렌더 상한 — 선택/필터 의미는
// 변하지 않는다(list 자체는 호출부가 그대로 들고 있음).
export function capList(list, limit) {
  const safeList = Array.isArray(list) ? list : []
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : safeList.length
  if (safeList.length <= safeLimit) {
    return { items: safeList, remaining: 0 }
  }
  return { items: safeList.slice(0, safeLimit), remaining: safeList.length - safeLimit }
}
