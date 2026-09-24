// scripts/testProto25dPathRandom.mjs — Paul Town 2.5D 캐릭터 프로토타입
// (Stage 5, 2026-09-25) walkGrid.js/pathfinding.js 결정론적 시드 랜덤
// property 테스트.
//
// React/DOM/네트워크 0. testProto25dWalkGrid.mjs와 동일한 이유로(확장자
// 없는 상대 import, pathfinding.js -> walkGrid.js -> worldContract.js/
// sceneFixture.js) esbuild로 scripts/.tmp/에 번들해 그 산출물을 import한다
// (재구현 없음, 동일 관례 그대로 재사용). characterSpriteContract.js는
// 의존성이 (v1 characterManifest.js 하나뿐이고 그 파일 자체는 import가
// 전혀 없어) 확장자 있는 plain import로 node가 직접 로드할 수 있어
// esbuild 번들이 필요 없다(그 파일 자체 헤더 주석 "esbuild 불필요, plain
// import" 그대로).
//
// 목적 — 기존 28단언 고정 시나리오 스위트(testProto25dWalkGrid.mjs)는
// 수작업으로 고른 소수의 (start,end) 쌍만 검증한다. 이 스위트는 시드 고정
// PRNG(mulberry32, Math.random 없음 -> 결정론 유지)로 임의의 (start,target)
// 쌍 100개(+스트레스 1000개)를 생성해 findPath의 불변식(장애물 절대 미침입/
// 경계 준수/결정론/방향 계약)이 넓은 입력 공간에서도 깨지지 않는지 확인한다.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const BUNDLE_PATH = path.join(TMP_DIR, 'proto25dPathRandomPathfinding.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/pathfinding.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDLE_PATH,
})
const { findPath } = await import(`${pathToFileURL(BUNDLE_PATH).href}?t=${Date.now()}`)

const GRID_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dPathRandomWalkGrid.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/walkGrid.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: GRID_BUNDLE_PATH,
})
const {
  WORLD_MIN, WORLD_MAX, OBSTACLES,
  classifyPoint, nearestWalkablePoint,
} = await import(`${pathToFileURL(GRID_BUNDLE_PATH).href}?t=${Date.now()}`)

const { directionForMove, facingForMove } = await import('../src/utils/town/proto2_5d/characterSpriteContract.js')

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

// ── 결정론 PRNG(mulberry32) — Math.random 사용 금지(재현 가능성 요구사항) ──
function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pointInAnyObstacle(x, y, obstacles) {
  // walkGrid.js의 rectsOverlap과 동일한 "경계 접촉은 허용" 판정 — 사각형
  // 내부에 "엄격히" 포함될 때만 침입으로 센다(요구사항 3 — 경계 접촉 허용).
  return obstacles.some((ob) => x > ob.x0 && x < ob.x1 && y > ob.y0 && y < ob.y1)
}

function randomPoint(rand, lo, hi) {
  return { x: lo + rand() * (hi - lo), y: lo + rand() * (hi - lo) }
}

function randomWalkableStart(rand) {
  // start는 걸을 수 있는 지점이어야 한다(요구사항) — 넓은 범위에서 뽑되
  // nearestWalkablePoint로 보정해 사전조건을 항상 만족시킨다.
  const raw = randomPoint(rand, WORLD_MIN, WORLD_MAX)
  return nearestWalkablePoint(raw.x, raw.y)
}

const SEED = 20260925
const rand = mulberry32(SEED)

// ── 1~6. 100개 무작위 (start,target) 쌍 — 전체 불변식 검증 ────────────────
section(`1~6. 무작위 (start,target) 100쌍 — 시드=${SEED}`)

const PAIR_COUNT = 100
let nullCount = 0
let throwCount = 0
let intrusionSamples = 0
let intrusionCount = 0
let zeroLenLegCount = 0
let overLongLegCount = 0
let legCountTotal = 0
const worldDiagonal = Math.sqrt((WORLD_MAX - WORLD_MIN) ** 2 + (WORLD_MAX - WORLD_MIN) ** 2)
const badNullPairs = []
const badPairs = { firstWaypoint: [], lastWaypoint: [], outOfWalkable: [], outOfBounds: [], determinism: [], direction: [] }

for (let i = 0; i < PAIR_COUNT; i++) {
  const start = randomWalkableStart(rand)
  // target — 범위 [0,100] 전체(장애물 내부/world 경계 밖 포함).
  const target = randomPoint(rand, 0, 100)

  let path
  let threw = false
  try {
    path = findPath(start, target)
  } catch (err) {
    threw = true
  }
  if (threw) { throwCount++; continue }

  if (path === null) {
    nullCount++
    badNullPairs.push({ start, target })
    continue
  }

  // 2. 마지막 웨이포인트 = nearestWalkablePoint(target) (오차 1e-6 이내).
  const correctedTarget = nearestWalkablePoint(target.x, target.y)
  const last = path[path.length - 1]
  const lastMatches = Math.abs(last.x - correctedTarget.x) <= 1e-6 && Math.abs(last.y - correctedTarget.y) <= 1e-6
  if (!lastMatches) badPairs.lastWaypoint.push({ start, target, last, correctedTarget })

  // 2. 첫 웨이포인트 != start (pathfinding.js findPath 계약 — startCell/endCell이
  // 같은 셀이면 단일 웨이포인트[correctedEnd]만 반환하고, 그 외엔 BFS 경로
  // 첫 스텝부터 반환한다. 어느 경우든 웨이포인트 목록에 start 좌표 자체는
  // 포함되지 않는다 — start와 우연히 좌표가 같은 경우만 예외로 허용).
  const correctedStart = nearestWalkablePoint(start.x, start.y)
  const first = path[0]
  const firstOk = !(first.x === correctedStart.x && first.y === correctedStart.y && path.length > 1)
  if (!firstOk) badPairs.firstWaypoint.push({ start, target, first })

  // 2. 모든 웨이포인트가 walkable이고 [WORLD_MIN,WORLD_MAX] 안.
  let allWalkableInBounds = true
  for (const wp of path) {
    const inBounds = wp.x >= WORLD_MIN - 1e-6 && wp.x <= WORLD_MAX + 1e-6 && wp.y >= WORLD_MIN - 1e-6 && wp.y <= WORLD_MAX + 1e-6
    const walkable = classifyPoint(wp.x, wp.y) === 'walkable'
    if (!inBounds) allWalkableInBounds = false
    if (!walkable) allWalkableInBounds = false
  }
  if (!allWalkableInBounds) badPairs.outOfWalkable.push({ start, target, path })

  // 3. 세그먼트 샘플링 — 각 leg를 1% 간격(>=50 샘플)으로 촘촘히 스캔해
  // 장애물 내부(엄격 포함)를 절대 지나지 않는지 확인.
  let prev = correctedStart
  for (const wp of path) {
    const dist = Math.hypot(wp.x - prev.x, wp.y - prev.y)

    // 4. zero-length / world-diagonal 초과 leg 카운트.
    legCountTotal++
    if (dist === 0) zeroLenLegCount++
    if (dist > worldDiagonal + 1e-9) overLongLegCount++

    const steps = 100 // 1% 간격 -> 101 샘플(>= 50 요구사항 충족)
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const x = prev.x + (wp.x - prev.x) * t
      const y = prev.y + (wp.y - prev.y) * t
      intrusionSamples++
      if (pointInAnyObstacle(x, y, OBSTACLES)) intrusionCount++
    }
    prev = wp
  }

  // 5. 결정론 — 같은 입력 재호출 -> deep-equal.
  const pathAgain = findPath(start, target)
  const deterministic = JSON.stringify(path) === JSON.stringify(pathAgain)
  if (!deterministic) badPairs.determinism.push({ start, target })

  // 6. 방향/미러 계약 — 각 leg의 dx/dy로 directionForMove 판정,
  // |dx|>=1.0이고 direction==='side'면 facingForMove(dx)가 dx 부호와 일치.
  let prevLeg = correctedStart
  let directionOk = true
  for (const wp of path) {
    const dx = wp.x - prevLeg.x
    const dy = wp.y - prevLeg.y
    const direction = directionForMove(dx, dy)
    if (!['front', 'back', 'side'].includes(direction)) directionOk = false
    if (Math.abs(dx) >= 1.0 && direction === 'side') {
      const facing = facingForMove(dx)
      const expectedSign = dx > 0 ? 1 : -1
      if (facing !== expectedSign) directionOk = false
    }
    prevLeg = wp
  }
  if (!directionOk) badPairs.direction.push({ start, target, path })
}

check('findPath가 100쌍 전부에서 예외를 던지지 않음', throwCount === 0, `throwCount=${throwCount}`)
check('null(도달 불가) 개수가 0(이 픽스처는 전부 도달 가능)', nullCount === 0, `nullCount=${nullCount}` + (badNullPairs.length ? `  pairs=${JSON.stringify(badNullPairs)}` : ''))
check('모든 경로의 첫 웨이포인트가 start와 겹치지 않음(다중 웨이포인트일 때)', badPairs.firstWaypoint.length === 0, `count=${badPairs.firstWaypoint.length}`)
check('모든 경로의 마지막 웨이포인트 = nearestWalkablePoint(target)(오차 1e-6 이내)', badPairs.lastWaypoint.length === 0, `count=${badPairs.lastWaypoint.length}`)
check('모든 웨이포인트가 walkable이고 [WORLD_MIN,WORLD_MAX] 범위 안', badPairs.outOfWalkable.length === 0, `count=${badPairs.outOfWalkable.length}`)
check('세그먼트 침입 0건(1% 간격 샘플링)', intrusionCount === 0, `intrusionCount=${intrusionCount} / samples=${intrusionSamples}`)
check('zero-length leg 없음', zeroLenLegCount === 0, `count=${zeroLenLegCount}`)
check('world 대각선 길이를 초과하는 leg 없음', overLongLegCount === 0, `count=${overLongLegCount}`)
check('100쌍 전부 결정론(동일 입력 -> 동일 경로, 재호출 deep-equal)', badPairs.determinism.length === 0, `count=${badPairs.determinism.length}`)
check('모든 leg의 방향/미러 계약 준수(direction 유효값 + side일 때 facing 부호 일치)', badPairs.direction.length === 0, `count=${badPairs.direction.length}`)

console.log(`  (참고) leg 총계=${legCountTotal}, 세그먼트 샘플 총계=${intrusionSamples}`)

// ── 7. 스트레스 — 추가 1000쌍(시드+1), no-throw + no-intrusion만, 시간 측정 ──
section('7. 스트레스 — 추가 1000쌍(시드+1), no-throw/no-intrusion만 + 소요시간 출력')
{
  const STRESS_COUNT = 1000
  const rand2 = mulberry32(SEED + 1)
  let stressThrow = 0
  let stressIntrusion = 0
  let stressSamples = 0
  const t0 = Date.now()
  for (let i = 0; i < STRESS_COUNT; i++) {
    const start = randomWalkableStart(rand2)
    const target = randomPoint(rand2, 0, 100)
    let path
    try {
      path = findPath(start, target)
    } catch (err) {
      stressThrow++
      continue
    }
    if (!Array.isArray(path)) continue
    let prev = nearestWalkablePoint(start.x, start.y)
    for (const wp of path) {
      const steps = 100
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const x = prev.x + (wp.x - prev.x) * t
        const y = prev.y + (wp.y - prev.y) * t
        stressSamples++
        if (pointInAnyObstacle(x, y, OBSTACLES)) stressIntrusion++
      }
      prev = wp
    }
  }
  const elapsedMs = Date.now() - t0
  check(`스트레스 ${STRESS_COUNT}쌍 전부 예외 없음`, stressThrow === 0, `throwCount=${stressThrow}`)
  check('스트레스 세그먼트 침입 0건', stressIntrusion === 0, `intrusionCount=${stressIntrusion} / samples=${stressSamples}`)
  console.log(`  (참고) 스트레스 ${STRESS_COUNT}쌍 소요시간 = ${elapsedMs}ms (하드 타임리밋 단언 없음, 참고 출력만)`)
}

// ── 8. 결정적 회귀 — 994번 쌍(2026-09-25, sub-cell 오프셋 LOS 버그) ────────
// 위 스트레스 섹션(시드+1=20260926)의 995번째 반복(0-based index 994)에서
// 실측으로 발견한 고정 좌표 재현 — 당시 findPath는 시작점의 정확한(셀
// 중심이 아닌) 좌표를 무시하고 시작 "셀"의 정수 좌표 기준으로 시야를
// 검증해, 첫 구간이 tree-plaza-ne 장애물을 ~0.3 world-% 침범했다
// (pathfinding.js hasLineOfSightWorld 헤더 주석 참고 — 이후 세그먼트 점
// 샘플링 1차 정정에서도 별도의(더 좁은, ≈0.03 world-%) 코너 스침 회귀가
// 새로 드러나 최종적으로 대수적 정확 교차 계산으로 고쳤다). 이 좌표
// 쌍으로 직접 고정 재현해, 시드/PRNG 변경에 흔들리지 않는 회귀 방지
// 케이스를 둔다.
section('8. 결정적 회귀 — 994번 쌍(고정 좌표, sub-cell 오프셋 LOS 버그)')
{
  const start = { x: 62.23291927576065, y: 33.2526438459754 }
  const target = { x: 68.08681073598564, y: 97.38113367930055 }
  const path = findPath(start, target)
  check('994번 쌍 — 경로가 존재함(도달 가능)', Array.isArray(path) && path.length > 0, JSON.stringify(path))
  if (Array.isArray(path)) {
    const correctedStart = nearestWalkablePoint(start.x, start.y)
    let prev = correctedStart
    let intrudes994 = false
    for (const wp of path) {
      const steps = 200 // 이 회귀 자체가 좁은 침입(≈0.03 world-%)이었으므로 기본 100보다 촘촘히.
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const x = prev.x + (wp.x - prev.x) * t
        const y = prev.y + (wp.y - prev.y) * t
        if (pointInAnyObstacle(x, y, OBSTACLES)) intrudes994 = true
      }
      prev = wp
    }
    check('994번 쌍 — 경로가 더 이상 장애물을 침범하지 않음(회귀 수정 확인)', !intrudes994)
    // 모든 웨이포인트가 walkable + 경계 안 + 마지막 웨이포인트 = 보정된 target.
    const correctedTarget = nearestWalkablePoint(target.x, target.y)
    const last994 = path[path.length - 1]
    check(
      '994번 쌍 — 마지막 웨이포인트 = nearestWalkablePoint(target)',
      Math.abs(last994.x - correctedTarget.x) <= 1e-6 && Math.abs(last994.y - correctedTarget.y) <= 1e-6,
      JSON.stringify({ last994, correctedTarget }),
    )
    const allValid994 = path.every((wp) =>
      wp.x >= WORLD_MIN - 1e-6 && wp.x <= WORLD_MAX + 1e-6 &&
      wp.y >= WORLD_MIN - 1e-6 && wp.y <= WORLD_MAX + 1e-6 &&
      classifyPoint(wp.x, wp.y) === 'walkable')
    check('994번 쌍 — 모든 웨이포인트가 walkable이고 경계 안', allValid994)
  }
}

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
console.log(`시드=${SEED} / 100쌍 null개수=${nullCount} / 100쌍 침입개수=${intrusionCount}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
