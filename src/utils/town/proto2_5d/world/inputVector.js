// 2026-10-10(244차) 입력 -> 이동 벡터. 순수. y는 아래가 +.
const UP = ['arrowup', 'w'], DOWN = ['arrowdown', 's'], LEFT = ['arrowleft', 'a'], RIGHT = ['arrowright', 'd']

const norm = (x, y) => {
  const l = Math.hypot(x, y)
  return l > 1 ? { x: x / l, y: y / l } : { x: x + 0, y: y + 0 }
}

/** 키 집합(Set 또는 배열) -> 벡터. 반대 키는 상쇄, 대각선은 길이 1로 정규화. */
export function keysToVector(keys) {
  const set = new Set([...(keys || [])].map((k) => String(k).toLowerCase()))
  const has = (l) => l.some((k) => set.has(k))
  return norm((has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0), (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0))
}

/** 조이스틱 중심 대비 오프셋(dx,dy) -> 벡터(길이 <= 1). deadZone 이하는 0, 이후 0..1로 재매핑. */
export function joystickVector(dx, dy, maxRadius, deadZone = 0.15) {
  const r = Math.hypot(dx, dy)
  if (!(maxRadius > 0) || !(r > 0)) return { x: 0, y: 0 }
  const n = Math.min(r / maxRadius, 1)
  if (n <= deadZone) return { x: 0, y: 0 }
  const m = (n - deadZone) / (1 - deadZone)
  return { x: (dx / r) * m + 0, y: (dy / r) * m + 0 }
}

/** combine(keyVec, joyVec): 조이스틱이 0이 아니면 조이스틱이 이긴다. */
export const combine = (a, b) => (b && (b.x || b.y) ? { x: b.x, y: b.y } : { x: a?.x || 0, y: a?.y || 0 })
