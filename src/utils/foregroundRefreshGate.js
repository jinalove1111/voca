// 포그라운드 복귀 재조회 쿨다운(2026-09, overnight T7b)
//
// App.jsx의 visibilitychange/focus 핸들러는 이미 "동시에 두 이벤트가
// 겹쳐 들어오는" 근접 중복은 inFlight 플래그로 막고 있지만(2026-07-10
// 최적화, App.jsx 주석 참고), "짧은 간격으로 앱을 여러 번 들락날락"하는
// 패턴 — 예: 다른 앱 확인하러 잠깐 나갔다가 바로 돌아오길 반복 — 은
// inFlight가 아니라 매번 새 재조회 라운드(6개 쿼리)를 쏜다. 이 함수는
// 그 라운드 자체에 10초 쿨다운을 두는 순수 판정 로직만 분리한 것 —
// 실제 setInterval/이벤트 배선은 App.jsx에 그대로 둔다(리팩터 아님).
//
// 최초 복귀(lastMs가 아직 기록되지 않은 상태, 즉 0/null/undefined)는
// 쿨다운과 무관하게 항상 즉시 허용한다 — "탭을 처음 열고 딱 한 번
// 포그라운드로 돌아온 순간"까지 지연시키면 안 되기 때문.
export function shouldRefreshOnForeground(lastMs, nowMs, cooldownMs = 10000) {
  if (!lastMs) return true
  return (nowMs - lastMs) >= cooldownMs
}
