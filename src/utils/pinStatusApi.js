// 학생 PIN 상태 조회(/api/student-pin-status) — 클라이언트 공용 헬퍼.
//
// 2026-07-17 정리: 같은 POST fetch 패턴이 3곳(AdminScreen 학생 목록 배지,
// StudentSelect "PIN 만들기" 반 배치 조회 + 학생 개별 재조회)에 복붙돼
// 있던 걸 한 곳으로 모음 — 동작 불변, 순수 중복 제거.
//
// 서버(api/student-pin-status.js)는 pin_hash 원문을 절대 내려보내지 않고
// { results: [{ id, hasPinHash, pinSetupAllowed, locked }] } 부울만 반환.
// 에러 처리(조용히 무시 vs 사용자 안내)는 호출부 책임 — 여기서는 결과가
// 없으면 서버가 준 error 메시지로 throw만 한다.

// studentIds(UUID 배열) -> results 배열. 서버가 results를 못 주면 throw.
export async function fetchPinStatuses(studentIds) {
  const res = await fetch('/api/student-pin-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentIds }),
  })
  const data = await res.json()
  if (!data.results) throw new Error(data.error || '조회에 실패했어요.')
  return data.results
}

// studentIds -> { [id]: {hasPinHash, pinSetupAllowed, locked} } 맵 —
// 목록 배지처럼 id로 바로 찾아 쓰는 호출부용.
export async function fetchPinStatusMap(studentIds) {
  const results = await fetchPinStatuses(studentIds)
  return Object.fromEntries(results.map((r) => [r.id, r]))
}
