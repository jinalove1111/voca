// 2026-10-10(244차) 자유 이동 — 축 분리 AABB 슬라이드. 순수/결정론. 몸 = 반지름 radius의 정사각 박스.
import { WORLD_W, WORLD_H } from './worldMap.js'

const EPS = 1e-9
const MAX_DT_MS = 50

const hits = (x, y, r, s) => x - r < s.x1 - EPS && x + r > s.x0 + EPS && y - r < s.y1 - EPS && y + r > s.y0 + EPS

// 한 축만 d만큼 이동. 벽에 닿으면 벽 면에 정확히 붙인다(터널링 없음: 호출자가 |d| <= radius 로 쪼갠다).
function slide(pos, axis, d, r, solids) {
  const other = axis === 'x' ? pos.y : pos.x
  let v = pos[axis] + d
  for (const s of solids) {
    const lo = axis === 'x' ? s.y0 : s.x0
    const hi = axis === 'x' ? s.y1 : s.x1
    if (!(other - r < hi - EPS && other + r > lo + EPS)) continue
    const a0 = axis === 'x' ? s.x0 : s.y0
    const a1 = axis === 'x' ? s.x1 : s.y1
    if (v - r < a1 - EPS && v + r > a0 + EPS) v = d > 0 ? a0 - r : a1 + r
  }
  return v
}

/**
 * @param {{x:number,y:number}} pos
 * @param {{x:number,y:number}} vec 길이 1 초과면 정규화(대각선이 빠르지 않다)
 * @returns {{x:number,y:number,moved:boolean,blocked:boolean}}
 */
export function stepMove(pos, vec, dtMs, opts = {}) {
  const { speed = 28, radius = 1.5, solids = [], bounds = { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H } } = opts
  let vx = Number(vec?.x) || 0
  let vy = Number(vec?.y) || 0
  const len = Math.hypot(vx, vy)
  if (len > 1) { vx /= len; vy /= len }
  const dt = Math.min(Math.max(Number(dtMs) || 0, 0), MAX_DT_MS)
  const dx = vx * speed * dt / 1000
  const dy = vy * speed * dt / 1000
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / radius))
  const p = { x: pos.x, y: pos.y }
  const lox = bounds.x0 + radius, hix = bounds.x1 - radius, loy = bounds.y0 + radius, hiy = bounds.y1 - radius
  let blocked = false
  for (let i = 0; i < n; i++) {
    const sx = dx / n, sy = dy / n
    if (sx) { const v = Math.min(hix, Math.max(lox, slide(p, 'x', sx, radius, solids))); if (Math.abs(v - (p.x + sx)) > EPS) blocked = true; p.x = v }
    if (sy) { const v = Math.min(hiy, Math.max(loy, slide(p, 'y', sy, radius, solids))); if (Math.abs(v - (p.y + sy)) > EPS) blocked = true; p.y = v }
  }
  return { x: p.x, y: p.y, moved: p.x !== pos.x || p.y !== pos.y, blocked }
}

/** 이동 방향 -> 스프라이트 방향. 영벡터면 prev 유지, 큰 축 우선(동률은 좌우). */
export function facingFor(vec, prev = 'front') {
  const x = Number(vec?.x) || 0
  const y = Number(vec?.y) || 0
  if (!x && !y) return prev
  if (Math.abs(y) > Math.abs(x)) return y > 0 ? 'front' : 'back'
  return x > 0 ? 'right' : 'left'
}

/** 몸 박스가 solids와 겹치는가(테스트/스폰 검증용). */
export const bodyHits = (pos, radius, solids) => solids.some((s) => hits(pos.x, pos.y, radius, s))
