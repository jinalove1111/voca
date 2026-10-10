// 2026-10-11(247차) 클릭/탭 이동 순수 로직(clickMove.js) 계약 핀. 네트워크/저장소/브라우저 0.
import fs from 'node:fs'
import { WORLD_W, WORLD_H, ZONES, PLACES, OBJECTS, SPAWN, solids } from '../src/utils/town/proto2_5d/world/worldMap.js'
import { stepMove, bodyHits } from '../src/utils/town/proto2_5d/world/freeMove.js'
import { nearestPlace } from '../src/utils/town/proto2_5d/world/proximity.js'
import { buildWalkGrid, planPath, resolveClickTarget, followStep, isStandable } from '../src/utils/town/proto2_5d/world/clickMove.js'

let n = 0, fail = 0
const ok = (cond, name) => { n++; if (!cond) { fail++; console.log(`FAIL ${name}`) } }
const SOL = solids()
const R = 1.5
const grid = buildWalkGrid()

ok(buildWalkGrid() === grid, '격자는 한 번만 만든다(memo)')
const cellAt = (p) => grid.walk[Math.floor(p.y / grid.cell) * grid.cols + Math.floor(p.x / grid.cell)]
ok(cellAt(SPAWN) === 1 && isStandable(SPAWN), 'SPAWN은 보행 가능')
{
  let bad = 0
  for (const s of SOL) {
    const cx = Math.floor((s.x0 + s.x1) / 2 / grid.cell), cy = Math.floor((s.y0 + s.y1) / 2 / grid.cell)
    for (let y = Math.ceil(s.y0 / grid.cell); y < Math.floor(s.y1 / grid.cell); y++) for (let x = Math.ceil(s.x0 / grid.cell); x < Math.floor(s.x1 / grid.cell); x++) if (grid.walk[y * grid.cols + x]) bad++
    if (grid.walk[cy * grid.cols + cx]) bad++
  }
  ok(bad === 0, `모든 솔리드 내부 셀은 보행 불가(위반 ${bad})`)
}

// ---- 결정론 LCG ----
let seed = 20261011
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const ready = ZONES.filter((z) => z.status === 'ready' && ['plaza', 'park', 'school'].includes(z.id))
const randPoint = () => {
  for (;;) {
    const z = ready[Math.floor(rnd() * ready.length)]
    const p = { x: z.rect.x + rnd() * z.rect.w, y: z.rect.y + rnd() * z.rect.h }
    if (isStandable(p)) return p
  }
}

// 걷기 시뮬레이션(16ms 틱, 화면과 같은 규칙: followStep + stepMove, 400ms 정지 시 중단)
function walk(start, path) {
  let pos = { ...start }, wps = path, stuck = 0, steps = 0, hit = false
  const dt = 16
  while (steps < 40000) {
    const f = followStep(pos, wps, 0.6, 28 * dt / 1000)
    if (f.done) return { pos, steps, hit, done: true, stuck: false }
    wps = f.waypoints
    const r = stepMove(pos, f.vec, dt, { solids: SOL })
    if (bodyHits(r, R, SOL)) hit = true
    stuck = r.moved ? 0 : stuck + dt
    pos = { x: r.x, y: r.y }
    steps++
    if (stuck > 400) return { pos, steps, hit, done: false, stuck: true }
  }
  return { pos, steps, hit, done: false, stuck: false }
}

{
  let pairs = 0, nulls = 0, hits = 0, far = 0, undone = 0, stuckN = 0, worst = 0
  for (let i = 0; i < 240; i++) {
    const a = randPoint(), b = randPoint()
    const path = planPath(a, b)
    pairs++
    if (!path) { nulls++; continue }
    const last = path[path.length - 1]
    const w = walk(a, path)
    if (w.hit) hits++
    if (!w.done) undone++
    if (w.stuck) stuckN++
    const d = Math.hypot(w.pos.x - last.x, w.pos.y - last.y)
    worst = Math.max(worst, d)
    if (d > 1.0) far++
  }
  ok(pairs >= 200, `시뮬레이션 쌍 ${pairs}개(>=200)`)
  ok(nulls === 0, `보행 가능한 두 점 사이에 경로 없음 0건(실제 ${nulls})`)
  ok(hits === 0, `걷는 동안 솔리드 침범 0건(실제 ${hits})`)
  ok(undone === 0 && stuckN === 0, `모든 걷기가 종료, 멈춤 0건(미종료 ${undone}, 정지 ${stuckN})`)
  ok(far === 0, `도착 지점이 목표에서 1.0 이내(최대 ${worst.toFixed(2)}, 초과 ${far})`)
}

// ---- 건물 내부 클릭은 밖으로 스냅 ----
{
  let bad = 0, tested = 0
  for (const s of SOL.filter((q) => !q.id.startsWith('zone-'))) {
    const c = { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 }
    const path = planPath(SPAWN, c)
    tested++
    if (!path) continue // 막힌 곳에 둘러싸인 솔리드는 null 허용
    const e = path[path.length - 1]
    if (!isStandable(e)) bad++
  }
  ok(tested > 20 && bad === 0, `솔리드 중심 클릭 -> 서 있을 수 있는 지점으로 스냅(검사 ${tested}, 위반 ${bad})`)
}

// ---- 장소 건물 클릭 -> 입구 접근 지점, nearestPlace가 그 장소 ----
for (const p of PLACES) {
  const o = OBJECTS.find((q) => q.id === p.objectId)
  const t = resolveClickTarget({ x: o.x, y: o.y - o.h / 2 })
  ok(t.placeId === p.id, `${p.id}: 건물 중앙 클릭 -> placeId`)
  const path = planPath(SPAWN, t)
  const w = path && walk(SPAWN, path)
  ok(!!w && w.done && !w.hit && nearestPlace(w.pos, PLACES, undefined, null) === p.id, `${p.id}: 걸어간 끝에서 nearestPlace === ${p.id}`)
}
ok(resolveClickTarget({ x: 160, y: 122 }).placeId === undefined && resolveClickTarget({ x: 160, y: 122 }).x === 160, '빈 땅 클릭은 그 점 그대로')

// ---- 도달 불가 / 월드 밖 ----
{
  const closed = SOL.filter((s) => s.id.startsWith('zone-'))[0]
  const inside = { x: (closed.x0 + closed.x1) / 2, y: (closed.y0 + closed.y1) / 2 }
  const p = planPath(SPAWN, inside)
  ok(p === null || isStandable(p[p.length - 1]), '준비 중 구역 한가운데 클릭 -> null 또는 밖으로 스냅')
  // 완전히 막힌 가짜 월드: 시작을 둘러싼 벽 -> null
  const walls = [{ id: 'w1', x0: 0, x1: WORLD_W, y0: 0, y1: 100 }, { id: 'w2', x0: 0, x1: WORLD_W, y0: 140, y1: WORLD_H }, { id: 'w3', x0: 0, x1: 150, y0: 100, y1: 140 }, { id: 'w4', x0: 170, x1: WORLD_W, y0: 100, y1: 140 }]
  const g2 = buildWalkGrid(walls)
  ok(planPath({ x: 160, y: 120 }, { x: 10, y: 10 }, g2, walls) === null || bodyHits(planPath({ x: 160, y: 120 }, { x: 10, y: 10 }, g2, walls).at(-1), R, walls) === false, '가둔 구역 밖 목표 -> 경로 없음 또는 안전한 스냅')
  const sealed = [{ id: 's', x0: 0, x1: WORLD_W, y0: 0, y1: WORLD_H }]
  ok(planPath({ x: 160, y: 120 }, { x: 10, y: 10 }, buildWalkGrid(sealed), sealed) === null, '전부 막힘 -> null')
}

// ---- 결정론 / 순수성 ----
{
  const a = randPoint(), b = randPoint()
  ok(JSON.stringify(planPath(a, b)) === JSON.stringify(planPath(a, b)), '같은 입력 -> 같은 경로')
  const wp = [{ x: 10, y: 0 }]
  ok(followStep({ x: 0, y: 0 }, wp).vec.x === 1 && followStep({ x: 9.7, y: 0 }, wp).done === true, 'followStep: 단위 벡터 / 도착 시 done')
  ok(Math.abs(followStep({ x: 9, y: 0 }, wp, 0.6, 2).vec.x - 0.5) < 1e-9, 'followStep: reach 안쪽에서는 벡터가 줄어 정확히 도착')
  const src = fs.readFileSync(new URL('../src/utils/town/proto2_5d/world/clickMove.js', import.meta.url), 'utf8')
  ok(!/Math\.random|Date\.now|performance\.now|localStorage|sessionStorage|document|window|fetch\(/.test(src.replace(/\/\/.*$/gm, '')), '순수: 랜덤/시간/저장소/DOM 없음')
}

console.log(`testTownWorldClickMove: ${n - fail}/${n} PASS`)
if (fail) process.exit(1)
