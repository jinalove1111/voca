// 2026-10-10(244차) 장소 근접 판정 — 진입 7 / 이탈 9 히스테리시스(깜빡임 방지). 순수.
const dist = (p, e) => Math.hypot(p.x - e.x, p.y - e.y)

/** @returns {string|null} 가까운 placeId. currentId가 leave 안이면 유지(더 가까운 다른 곳이 enter 안이면 교체). */
export function nearestPlace(pos, places, { enter = 7, leave = 9 } = {}, currentId = null) {
  let best = null, bestD = Infinity
  for (const p of places || []) {
    const d = dist(pos, p.entrance)
    if (d < bestD) { best = p; bestD = d }
  }
  const cur = currentId && (places || []).find((p) => p.id === currentId)
  if (cur) {
    const dc = dist(pos, cur.entrance)
    if (dc <= leave) return best && best.id !== cur.id && bestD <= enter && bestD < dc ? best.id : cur.id
  }
  return best && bestD <= enter ? best.id : null
}
