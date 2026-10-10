// 2026-10-11(247차) 클릭/탭 이동 — 순수/결정론(React/DOM/랜덤/시간 없음).
// 기존 src/utils/town/proto2_5d/pathfinding.js(findPath)는 walkGrid.js의 고정 OBSTACLES·100x100 좌표계에 묶여 있어
// 320x240 월드/몸 반지름 1.5에는 시그니처가 맞지 않는다 -> BFS 규칙(8방향, 코너 컷팅 금지, 고정 이웃 순서)과
// "장애물 내부를 엄격히 통과하는 선분이면 시야 막힘" 판정만 같은 방식으로 여기에 작게 다시 쓴다(pathfinding.js는 수정하지 않음).
// 충돌 판정은 freeMove.js의 bodyHits/stepMove, 좌표/장소는 worldMap.js·fastTravel.js를 그대로 쓴다.
import { WORLD_W, WORLD_H, PLACES, OBJECTS, solids } from './worldMap.js'
import { bodyHits } from './freeMove.js'
import { travelTarget } from './fastTravel.js'

const CELL = 2
const RADIUS = 1.5
const MARGIN = 0.2 // 셀 중심 몸 박스 여유(반지름 + 0.2)
const LOS_PAD = 0.05 // 시야 검사용 솔리드 팽창(반지름 + 0.05)
const SNAP_RINGS = 30

// 8방향, 직교 먼저 — pathfinding.js와 같은 고정 순서(결정론).
const DIRS = Object.freeze([[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]])

const inBounds = (p, r = RADIUS) => p.x >= r && p.x <= WORLD_W - r && p.y >= r && p.y <= WORLD_H - r
/** 이 지점에 몸(반지름 1.5)이 서 있을 수 있는가. */
export const isStandable = (p, list = solids()) => inBounds(p) && !bodyHits(p, RADIUS, list)

let memo = null
/** 월드 전체 보행 격자. 기본 인자는 한 번만 만든다. */
export function buildWalkGrid(list = solids(), { cell = CELL, radius = RADIUS } = {}) {
  const useMemo = list === solids() && cell === CELL && radius === RADIUS
  if (useMemo && memo) return memo
  const cols = Math.ceil(WORLD_W / cell), rows = Math.ceil(WORLD_H / cell)
  const walk = new Uint8Array(cols * rows)
  const r = radius + MARGIN
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = { x: (col + 0.5) * cell, y: (row + 0.5) * cell }
      if (c.x >= r && c.x <= WORLD_W - r && c.y >= r && c.y <= WORLD_H - r && !bodyHits(c, r, list)) walk[row * cols + col] = 1
    }
  }
  const grid = { cell, cols, rows, walk, radius }
  if (useMemo) memo = grid
  return grid
}

const ok = (g, c, r) => c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.walk[r * g.cols + c] === 1
const cellOf = (g, p) => ({ c: Math.min(g.cols - 1, Math.max(0, Math.floor(p.x / g.cell))), r: Math.min(g.rows - 1, Math.max(0, Math.floor(p.y / g.cell))) })
const centerOf = (g, c, r) => ({ x: (c + 0.5) * g.cell, y: (r + 0.5) * g.cell })

/** 가장 가까운 보행 셀(없으면 null). 제한된 링 탐색, 동률은 행/열 순서로 결정. */
function nearestCell(g, p) {
  const s = cellOf(g, p)
  if (ok(g, s.c, s.r)) return s
  let best = null, bestD = Infinity, found = -1
  for (let k = 1; k <= SNAP_RINGS; k++) {
    if (found >= 0 && k > found + 1) break
    for (let r = s.r - k; r <= s.r + k; r++) {
      for (let c = s.c - k; c <= s.c + k; c++) {
        if (Math.max(Math.abs(c - s.c), Math.abs(r - s.r)) !== k || !ok(g, c, r)) continue
        const m = centerOf(g, c, r), d = Math.hypot(m.x - p.x, m.y - p.y)
        if (d < bestD) { bestD = d; best = { c, r }; if (found < 0) found = k }
      }
    }
  }
  return best
}

// 선분 a->b가 사각형(x0..x1,y0..y1) 내부를 엄격히 지나가는가(Liang-Barsky, 경계 접촉은 통과 아님).
function segEntersInterior(a, b, q) {
  const dx = b.x - a.x, dy = b.y - a.y
  let t0 = 0, t1 = 1
  const clip = (p, d, lo, hi) => {
    if (d === 0) return p > lo && p < hi
    let ta = (lo - p) / d, tb = (hi - p) / d
    if (ta > tb) { const t = ta; ta = tb; tb = t }
    if (ta > t0) t0 = ta
    if (tb < t1) t1 = tb
    return t0 < t1
  }
  if (!clip(a.x, dx, q.x0, q.x1) || !clip(a.y, dy, q.y0, q.y1)) return false
  const tm = (t0 + t1) / 2
  const mx = a.x + dx * tm, my = a.y + dy * tm
  return mx > q.x0 && mx < q.x1 && my > q.y0 && my < q.y1
}

const inflate = (list, pad) => list.map((s) => ({ x0: s.x0 - pad, x1: s.x1 + pad, y0: s.y0 - pad, y1: s.y1 + pad }))
const clearLine = (a, b, boxes) => !boxes.some((q) => segEntersInterior(a, b, q))

/**
 * from -> to 웨이포인트 목록(월드 좌표) 또는 null(도달 불가). 같은 입력 -> 같은 출력.
 * 마지막 웨이포인트: to가 설 수 있는 곳이면 to 그대로, 아니면 스냅된 셀 중심.
 */
export function planPath(from, to, grid = buildWalkGrid(), list = solids()) {
  const g = grid
  const sc = nearestCell(g, from)
  const ec = nearestCell(g, to)
  if (!sc || !ec) return null
  const end = isStandable(to, list) ? { x: to.x, y: to.y } : centerOf(g, ec.c, ec.r)

  const idx = (c, r) => r * g.cols + c
  const prev = new Int32Array(g.cols * g.rows).fill(-2)
  prev[idx(sc.c, sc.r)] = -1
  const queue = [idx(sc.c, sc.r)]
  const goal = idx(ec.c, ec.r)
  for (let h = 0; h < queue.length && prev[goal] === -2; h++) {
    const cur = queue[h], cc = cur % g.cols, cr = (cur - cc) / g.cols
    for (const [dc, dr] of DIRS) {
      const nc = cc + dc, nr = cr + dr
      if (!ok(g, nc, nr) || prev[idx(nc, nr)] !== -2) continue
      if (dc && dr && (!ok(g, cc + dc, cr) || !ok(g, cc, cr + dr))) continue // 코너 컷팅 금지
      prev[idx(nc, nr)] = cur
      queue.push(idx(nc, nr))
    }
  }
  if (prev[goal] === -2) return null

  const cells = []
  for (let i = goal; i >= 0; i = prev[i]) { const c = i % g.cols; cells.push(centerOf(g, c, (i - c) / g.cols)) }
  cells.reverse()
  const pts = [{ x: from.x, y: from.y }, ...cells, end]

  // 그리디 시야 단순화(몸 반지름만큼 팽창한 솔리드 기준) — 가장 먼 보이는 점으로 점프, 없으면 다음 점.
  const boxes = inflate(list, g.radius + LOS_PAD)
  const out = []
  let a = 0
  while (a < pts.length - 1) {
    let far = a + 1
    for (let i = pts.length - 1; i > a + 1; i--) if (clearLine(pts[a], pts[i], boxes)) { far = i; break }
    out.push(pts[far])
    a = far
  }
  // 첫 점이 시작 위치와 사실상 같으면 건너뛴다(중복 웨이포인트 방지).
  return out.length > 1 && Math.hypot(out[0].x - from.x, out[0].y - from.y) < 1e-6 ? out.slice(1) : out
}

/** 클릭한 월드 좌표 -> 건물(장소) 위면 그 장소의 접근 지점 + placeId, 아니면 그 점. */
export function resolveClickTarget(p) {
  for (const place of PLACES) {
    const o = OBJECTS.find((q) => q.id === place.objectId)
    if (!o) continue
    const halfW = Math.max(o.foot ? o.foot.w : 0, o.h * 0.5) / 2
    if (p.x >= o.x - halfW && p.x <= o.x + halfW && p.y >= o.y - o.h && p.y <= o.y + 1) {
      const t = travelTarget(place.id) || place.entrance
      return { x: t.x, y: t.y, placeId: place.id }
    }
  }
  return { x: p.x, y: p.y }
}

/**
 * 한 틱의 진행 벡터. 첫 웨이포인트가 arriveEps 안이면 버리고 다음으로.
 * reach(이번 틱에 갈 수 있는 거리)를 주면 마지막 접근에서 벡터 길이를 줄여 정확히 도착한다(오버슈트/진동 방지).
 */
export function followStep(pos, waypoints, arriveEps = 0.6, reach = 0) {
  let w = waypoints
  while (w.length && Math.hypot(w[0].x - pos.x, w[0].y - pos.y) <= arriveEps) w = w.slice(1)
  if (!w.length) return { vec: { x: 0, y: 0 }, waypoints: [], done: true }
  const dx = w[0].x - pos.x, dy = w[0].y - pos.y, d = Math.hypot(dx, dy)
  const k = reach > 0 && d < reach ? d / reach : 1
  return { vec: { x: (dx / d) * k, y: (dy / d) * k }, waypoints: w, done: false }
}
