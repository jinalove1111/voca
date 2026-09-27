// scripts/testProto25dPlacedObstacles.mjs — Paul Town 2.5D 프로토타입
// Phase C(2026-09-28, 구매한 벤치 1회 배치) placementSlots.js 순수 단위 테스트.
//
// 각 슬롯(단독 + 전부 동시)이 기존 장애물과 겹치지 않고, 스폰/가게 입구/
// 벤치 도착점을 막지 않으며, 그 지점들로의 경로가 여전히 존재하는지를
// 실제 walkGrid/pathfinding으로 검증한다. 확장자 없는 상대 import 때문에
// esbuild 번들(testProto25dShop.mjs와 동일 패턴). 네트워크 0.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const BUNDLE = path.join(TMP_DIR, 'proto25dPlacedObstacles.bundle.mjs')
await esbuild.build({
  stdin: {
    contents: [
      "export * from './src/utils/town/proto2_5d/placementSlots.js'",
      "export { OBSTACLES, classifyPoint, nearestWalkablePoint } from './src/utils/town/proto2_5d/walkGrid.js'",
      "export { findPath } from './src/utils/town/proto2_5d/pathfinding.js'",
      "export { SHOP_ENTRANCE } from './src/utils/town/proto2_5d/shopInteraction.js'",
      "export { benchArrivalPoint } from './src/utils/town/proto2_5d/benchInteraction.js'",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDLE,
})
const {
  PLACEMENT_SLOTS, placedObstacleRect, obstaclesWithPlacements,
  OBSTACLES, classifyPoint, nearestWalkablePoint, findPath, SHOP_ENTRANCE, benchArrivalPoint,
} = await import(`${pathToFileURL(BUNDLE).href}?t=${Date.now()}`)

let passed = 0
let failed = 0
function check(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
}
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

const SPAWN = { x: 50, y: 62 }
const BENCH = OBSTACLES.find((o) => o.id === 'demo-bench')
const benchRaw = benchArrivalPoint(BENCH)
const BENCH_ARRIVAL = nearestWalkablePoint(benchRaw.x, benchRaw.y)

console.log('\n-- 1. 슬롯 상수 --')
check('슬롯 3개', PLACEMENT_SLOTS.length === 3)
check('PLACEMENT_SLOTS frozen(배열/항목/anchor)', Object.isFrozen(PLACEMENT_SLOTS) && PLACEMENT_SLOTS.every((s) => Object.isFrozen(s) && Object.isFrozen(s.anchor)))
check('슬롯 id 고유', new Set(PLACEMENT_SLOTS.map((s) => s.id)).size === PLACEMENT_SLOTS.length)
check('배치물 rect id = placed-<slotId>', PLACEMENT_SLOTS.every((s) => placedObstacleRect(s).id === `placed-${s.id}`))
check('벤치와 같은 7x5 발자국', PLACEMENT_SLOTS.every((s) => {
  const r = placedObstacleRect(s)
  return Math.abs(r.x1 - r.x0 - (BENCH.x1 - BENCH.x0)) < 1e-9 && Math.abs(r.y1 - r.y0 - (BENCH.y1 - BENCH.y0)) < 1e-9
}))

console.log('\n-- 2. obstaclesWithPlacements --')
check('빈 배치 → OBSTACLES 그대로', obstaclesWithPlacements([]) === OBSTACLES && obstaclesWithPlacements(undefined) === OBSTACLES)
check('알 수 없는 slotId 무시', obstaclesWithPlacements([{ itemId: 'bench', slotId: 'ZZ' }]).length === OBSTACLES.length)
const allPl = PLACEMENT_SLOTS.map((s) => ({ itemId: `x-${s.id}`, slotId: s.id }))
const allObs = obstaclesWithPlacements(allPl)
check('전체 배치 → OBSTACLES + 3', allObs.length === OBSTACLES.length + 3)
check('OBSTACLES 원본 불변(8개)', OBSTACLES.length === 8)
check('결정론(재호출 deep-equal)', JSON.stringify(obstaclesWithPlacements(allPl)) === JSON.stringify(allObs))

console.log('\n-- 3. 겹침 --')
const rects = PLACEMENT_SLOTS.map(placedObstacleRect)
for (const r of rects) {
  const hit = OBSTACLES.filter((o) => overlap(o, r)).map((o) => o.id)
  check(`${r.id}가 기존 장애물과 겹치지 않음`, hit.length === 0, JSON.stringify(hit))
}
let pairOk = true
for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i], rects[j])) pairOk = false
check('슬롯끼리 겹치지 않음', pairOk)

console.log('\n-- 4. 핵심 지점 walkable + 경로 존재(슬롯 단독 / 전부) --')
const cases = [...PLACEMENT_SLOTS.map((s) => ({ label: s.id, obs: obstaclesWithPlacements([{ itemId: 'bench', slotId: s.id }]) })), { label: 'ALL', obs: allObs }]
for (const { label, obs } of cases) {
  check(`[${label}] 스폰 walkable`, classifyPoint(SPAWN.x, SPAWN.y, obs) === 'walkable')
  check(`[${label}] 가게 입구 walkable`, classifyPoint(SHOP_ENTRANCE.x, SHOP_ENTRANCE.y, obs) === 'walkable')
  check(`[${label}] 벤치 도착점 walkable`, classifyPoint(BENCH_ARRIVAL.x, BENCH_ARRIVAL.y, obs) === 'walkable')
  const p1 = findPath(SPAWN, SHOP_ENTRANCE, obs)
  check(`[${label}] 스폰→가게 입구 경로 존재`, Array.isArray(p1) && p1.length > 0)
  const p2 = findPath(SPAWN, BENCH_ARRIVAL, obs)
  check(`[${label}] 스폰→벤치 도착점 경로 존재`, Array.isArray(p2) && p2.length > 0)
  const endOk = p1 && p2 &&
    Math.hypot(p1.at(-1).x - SHOP_ENTRANCE.x, p1.at(-1).y - SHOP_ENTRANCE.y) < 1e-6 &&
    Math.hypot(p2.at(-1).x - BENCH_ARRIVAL.x, p2.at(-1).y - BENCH_ARRIVAL.y) < 1e-6
  check(`[${label}] 경로 끝점이 목적지 그대로(보정 없음)`, endOk)
  check(`[${label}] 결정론`, JSON.stringify(findPath(SPAWN, SHOP_ENTRANCE, obs)) === JSON.stringify(p1))
}

console.log('\n-- 5. 배치물 내부 탭은 바깥으로 보정 --')
for (const r of rects) {
  const obs = obstaclesWithPlacements([{ itemId: 'bench', slotId: r.id.slice('placed-'.length) }])
  const cx = (r.x0 + r.x1) / 2
  const cy = (r.y0 + r.y1) / 2
  const np = nearestWalkablePoint(cx, cy, obs)
  check(`${r.id} 중심 탭 → 보정점이 rect 밖`, !(np.x > r.x0 && np.x < r.x1 && np.y > r.y0 && np.y < r.y1), JSON.stringify(np))
  check(`${r.id} 스폰에서 중심 탭까지 경로 존재`, (findPath(SPAWN, { x: cx, y: cy }, obs) || []).length > 0)
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
