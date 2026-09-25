// scripts/testProto25dWalkGrid.mjs — Paul Town 2.5D 캐릭터 프로토타입
// (Stage 2, 2026-09-22) walkGrid.js/pathfinding.js 순수 단위 테스트.
//
// React/DOM/네트워크 0. src/utils/town/proto2_5d/pathfinding.js가
// walkGrid.js(-> worldContract.js -> townScene.js/townLevel.js)를 확장자
// 없는 상대 import로 참조하므로, plain `node`로 직접 import하면 Node ESM
// 로더가 ERR_MODULE_NOT_FOUND로 죽는다(scripts/testTownWorldContract.mjs
// 2026-09-17 실측과 동일 원인/동일 해법) — esbuild로 scripts/.tmp/
// (gitignore 대상)에 번들해 그 산출물을 import한다.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const BUNDLE_PATH = path.join(TMP_DIR, 'proto25dPathfinding.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/pathfinding.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDLE_PATH,
})
const { findPath } = await import(`${pathToFileURL(BUNDLE_PATH).href}?t=${Date.now()}`)

const GRID_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dWalkGrid.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/walkGrid.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: GRID_BUNDLE_PATH,
})
const {
  WORLD_MIN, WORLD_MIN_Y, WORLD_MAX, GRID_COLS, GRID_ROWS, CELL_H_PCT, OBSTACLES,
  classifyPoint, clampToWorldBounds, nearestWalkablePoint,
  isWalkableCell, worldToCell, cellToWorldPoint,
} = await import(`${pathToFileURL(GRID_BUNDLE_PATH).href}?t=${Date.now()}`)

const EPS = 1e-6 // walkGrid.js BOUNDS_EPS와 동일 스케일 — 부동소수점 비교 여유

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function pointInAnyObstacle(x, y, obstacles) {
  return obstacles.some((ob) => x >= ob.x0 && x <= ob.x1 && y >= ob.y0 && y <= ob.y1)
}

// ── 1. 정상 목적지는 그대로 보존 ─────────────────────────────────────
section('1. nearestWalkablePoint — 정상 in-bounds 목적지는 그대로 보존')
{
  const p = { x: 10, y: 90 } // OBSTACLES 어디와도 안 겹치는 열린 영역
  check('OBSTACLES 밖 지점(10,90)은 walkable로 분류됨(사전조건)', classifyPoint(p.x, p.y) === 'walkable')
  const corrected = nearestWalkablePoint(p.x, p.y)
  check('정상 목적지 좌표가 정확히 보존됨(격자 중심으로 스냅되지 않음)', corrected.x === p.x && corrected.y === p.y, JSON.stringify(corrected))
}

// ── 2/3. clampToWorldBounds — 경계 clamp ────────────────────────────
section('2/3. clampToWorldBounds — 범위 밖 좌표 clamp')
{
  const neg = clampToWorldBounds(-50, -999)
  // 2026-09-26(O2) — y 하한은 더 이상 WORLD_MIN이 아니라 WORLD_MIN_Y다(상단
  // 스프라이트 clip 방지 여백, walkGrid.js WORLD_MIN_Y 정의 주석 참고). 이
  // 단언은 O2 이전엔 "대칭적인 clamp(x/y 모두 WORLD_MIN)"를 인코딩했었다 —
  // O2 이후 y축만 별도 하한을 갖는 비대칭 clamp로 바뀌었다.
  check('음수 좌표가 최소 경계로 clamp됨(x=WORLD_MIN, y=WORLD_MIN_Y)', neg.x === WORLD_MIN && neg.y === WORLD_MIN_Y, JSON.stringify(neg))
  const over = clampToWorldBounds(500, 1000)
  check('초과 좌표가 최대 경계(WORLD_MAX)로 clamp됨', over.x === WORLD_MAX && over.y === WORLD_MAX, JSON.stringify(over))
  const mixed = clampToWorldBounds(-10, 250)
  check('한쪽만 범위를 벗어난 좌표도 그 축만 clamp됨', mixed.x === WORLD_MIN && mixed.y === WORLD_MAX, JSON.stringify(mixed))
}

// ── 4. 장애물 안 목적지 -> 가장 가까운 걸을 수 있는 지점으로 보정 ─────
section('4. nearestWalkablePoint — 장애물 안 목적지 보정')
{
  const building = OBSTACLES.find((o) => o.id === 'demo-building')
  const insideX = (building.x0 + building.x1) / 2
  const insideY = (building.y0 + building.y1) / 2
  check('건물 중심점은 사전조건상 blocked로 분류됨', classifyPoint(insideX, insideY) === 'blocked')
  const corrected = nearestWalkablePoint(insideX, insideY)
  check('보정된 좌표는 더 이상 장애물 안이 아님', classifyPoint(corrected.x, corrected.y) === 'walkable', JSON.stringify(corrected))
  check('보정된 좌표는 원래 장애물 박스 밖', !pointInAnyObstacle(corrected.x, corrected.y, OBSTACLES), JSON.stringify(corrected))
}

// ── 5. 경로는 절대 장애물 셀을 지나지 않음 ────────────────────────────
section('5. findPath — 경로가 장애물 셀을 지나지 않음')
{
  const start = { x: 50, y: 62 } // Proto25DScreen.jsx INITIAL_LEFT/TOP_PCT와 동일
  const end = { x: 15, y: 15 } // demo-building을 넘어가는 먼 지점
  const path = findPath(start, end)
  check('경로가 존재함(사전조건)', Array.isArray(path) && path.length > 0, JSON.stringify(path))
  if (Array.isArray(path)) {
    // 웨이포인트 사이 모든 통과 셀(선형보간, findPath 내부 hasLineOfSight와
    // 동일 해상도)이 장애물과 겹치지 않는지 직접 재검증한다(구현을 다시
    // 호출하지 않고 독립적으로 셀 단위 재확인 — 회귀 시 자기 자신의 버그를
    // 스스로 통과시키지 않기 위함).
    let allClear = true
    let prev = start
    for (const wp of path) {
      const steps = 40
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = prev.x + (wp.x - prev.x) * t
        const y = prev.y + (wp.y - prev.y) * t
        if (pointInAnyObstacle(x, y, OBSTACLES)) { allClear = false; break }
      }
      if (!allClear) break
      prev = wp
    }
    check('웨이포인트를 잇는 모든 구간이 장애물 박스를 지나지 않음', allClear)
  }
}

// ── 6. 장애물 뒤 목적지 -> 우회 경로(직선 아님) ──────────────────────
section('6. findPath — 장애물 뒤 목적지는 우회 경로를 만든다')
{
  // start(50,62)에서 building(x:38~62,y:24~40) 바로 위(50,20)로 직선을 그으면
  // 반드시 building을 관통한다 — 우회가 필요하다.
  const start = { x: 50, y: 62 }
  const end = { x: 50, y: 20 }
  const straightLineThroughBuilding = (() => {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      const x = start.x + (end.x - start.x) * t
      const y = start.y + (end.y - start.y) * t
      if (pointInAnyObstacle(x, y, OBSTACLES)) return true
    }
    return false
  })()
  check('사전조건 — 직선 경로는 실제로 building을 관통함', straightLineThroughBuilding)

  const path = findPath(start, end)
  check('경로가 존재함(우회 가능)', Array.isArray(path) && path.length > 0, JSON.stringify(path))
  check('경로 웨이포인트가 2개 이상(직선 1스텝이 아니라 우회가 있음)', Array.isArray(path) && path.length >= 2, `length=${path?.length}`)
}

// ── 7. 완전히 도달 불가능한 목적지 -> 안전하게 실패(null, 크래시 없음) ──
section('7. findPath — 완전히 막힌 목적지는 안전하게 null 반환')
{
  // 커스텀 장애물 — world 전체 폭(WORLD_MIN~WORLD_MAX)을 가로지르는 벽
  // 하나로 걷기 가능 영역을 위/아래 두 구역으로 완전히 분리한다(우회로
  // 자체가 존재하지 않는 병적 케이스 — 실제 OBSTACLES 픽스처는 이렇게
  // 막힌 적 없음, 이 테스트 전용 커스텀 장애물).
  const wall = Object.freeze([Object.freeze({ id: 'wall', x0: 0, x1: 100, y0: 49, y1: 51 })])
  const start = { x: 50, y: 10 } // 벽 위쪽
  const end = { x: 50, y: 90 } // 벽 아래쪽 — 벽을 통과하지 않고는 도달 불가
  let threw = false
  let path
  try {
    path = findPath(start, end, wall)
  } catch (err) {
    threw = true
  }
  check('완전히 막힌 목적지 호출이 예외를 던지지 않음', !threw)
  check('완전히 막힌 목적지는 null을 반환함(경로 없음)', path === null, JSON.stringify(path))
}

// ── 8. 결정론 — 동일 입력은 항상 동일 경로 ────────────────────────────
section('8. findPath — 결정론(동일 입력 -> 동일 경로)')
{
  const start = { x: 50, y: 62 }
  const end = { x: 90, y: 10 }
  const pathA = findPath(start, end)
  const pathB = findPath(start, end)
  check('두 번 호출한 경로가 깊은 비교로 완전히 동일함', JSON.stringify(pathA) === JSON.stringify(pathB), `A=${JSON.stringify(pathA)}\n  B=${JSON.stringify(pathB)}`)

  // 여러 다른 목적지 쌍으로도 반복 확인(단일 케이스 우연 방지).
  const pairs = [
    [{ x: 5, y: 5 }, { x: 95, y: 95 }],
    [{ x: 30, y: 70 }, { x: 80, y: 20 }],
    [{ x: 50, y: 62 }, { x: 50, y: 20 }], // 우회 필요 케이스
  ]
  let allDeterministic = true
  for (const [s, e] of pairs) {
    const p1 = JSON.stringify(findPath(s, e))
    const p2 = JSON.stringify(findPath(s, e))
    if (p1 !== p2) allDeterministic = false
  }
  check('여러 시작/도착 쌍 전부에서 반복 호출 결과가 동일함', allDeterministic)
}

// ── 추가 — 격자/셀 기본 계약(문서화된 해상도 그대로인지) ─────────────
section('부록 — 격자 해상도/셀 변환 기본 계약')
{
  check('GRID_COLS=40', GRID_COLS === 40, String(GRID_COLS))
  check('GRID_ROWS=76(=GRID_COLS * WORLD.h/WORLD.w, 정사각 셀 유도)', GRID_ROWS === 76, String(GRID_ROWS))
  // 격자는 [0,100]이 아니라 [WORLD_MIN,WORLD_MAX]에 앵커링된다(경계
  // 사각지대 방지, walkGrid.js 헤더 주석 참고) — worldToCell(WORLD_MIN,
  // WORLD_MIN)이 격자의 (0,0) 셀이어야 한다.
  const cell = worldToCell(WORLD_MIN, WORLD_MIN)
  check('worldToCell(WORLD_MIN,WORLD_MIN) === {col:0,row:0}(격자가 WORLD_MIN에 앵커링됨)', cell.col === 0 && cell.row === 0, JSON.stringify(cell))
  const back = cellToWorldPoint(0, 0)
  check('cellToWorldPoint(0,0)이 WORLD_MIN 근처 셀 중심을 반환', back.x > WORLD_MIN && back.y > WORLD_MIN && back.x < WORLD_MIN + 3 && back.y < WORLD_MIN + 2, JSON.stringify(back))
  check('격자 밖 셀은 항상 isWalkableCell=false', isWalkableCell(-1, 0) === false && isWalkableCell(GRID_COLS, 0) === false)
  // Stage 5 감사(2026-09-23) 추가 — 반대쪽 모서리(WORLD_MAX)도 대칭적으로
  // 마지막 셀(GRID_COLS-1,GRID_ROWS-1)로 귀결되는지 직접 확인한다(이전에는
  // WORLD_MIN 모서리만 worldToCell로 직접 검증하고, WORLD_MAX 쪽은
  // classifyPoint(walkable 여부)만 확인해 정확한 셀 인덱스까지는 재확인하지
  // 않고 있었다 — 순수 함수라 뷰포트와 무관하게 항상 같은 값이어야 한다).
  const maxCell = worldToCell(WORLD_MAX, WORLD_MAX)
  check(
    'worldToCell(WORLD_MAX,WORLD_MAX) === {col:GRID_COLS-1,row:GRID_ROWS-1}(반대쪽 모서리도 대칭적으로 앵커링됨)',
    maxCell.col === GRID_COLS - 1 && maxCell.row === GRID_ROWS - 1,
    JSON.stringify(maxCell),
  )
  const maxBack = cellToWorldPoint(GRID_COLS - 1, GRID_ROWS - 1)
  check(
    'cellToWorldPoint(GRID_COLS-1,GRID_ROWS-1)이 WORLD_MAX 근처 셀 중심을 반환(격자 밖으로 나가지 않음)',
    maxBack.x < WORLD_MAX && maxBack.y < WORLD_MAX && maxBack.x > WORLD_MAX - 3 && maxBack.y > WORLD_MAX - 2,
    JSON.stringify(maxBack),
  )
  // 왕복(world -> cell -> world -> cell) — 셀 중심점을 다시 넣으면 같은
  // 셀로 돌아와야 한다(양쪽 모서리 모두, 라운드트립 안정성).
  const roundTripMin = worldToCell(back.x, back.y)
  check('cellToWorldPoint(0,0) 왕복이 다시 {0,0}으로 귀결됨(라운드트립 안정)', roundTripMin.col === 0 && roundTripMin.row === 0, JSON.stringify(roundTripMin))
  const roundTripMax = worldToCell(maxBack.x, maxBack.y)
  check(
    'cellToWorldPoint(GRID_COLS-1,GRID_ROWS-1) 왕복이 다시 같은 셀로 귀결됨(라운드트립 안정)',
    roundTripMax.col === GRID_COLS - 1 && roundTripMax.row === GRID_ROWS - 1,
    JSON.stringify(roundTripMax),
  )
  // 경계 사각지대 회귀 방지 — 정확히 WORLD_MIN/WORLD_MAX인 점(장애물과
  // 무관한 위치)은 반드시 walkable이어야 한다(이 세션이 최초 구현에서
  // 실측으로 발견한 회귀, walkGrid.js 헤더 주석 참고).
  // 2026-09-26(O2) — (WORLD_MIN,WORLD_MIN) 모서리는 이제 상단 여백(row
  // 0~7) 안이라 blocked다. 코너 사각지대 회귀 의도(x축 경계 정확성)는
  // y=WORLD_MIN_Y로 옮겨 그대로 유지한다.
  check('정확히 (WORLD_MIN,WORLD_MIN_Y)인 점(장애물 밖, O2 상단 여백 바로 아래)은 walkable로 분류됨(경계 사각지대 회귀 방지)', classifyPoint(WORLD_MIN, WORLD_MIN_Y) === 'walkable')
  check('정확히 (WORLD_MAX,WORLD_MAX)인 점(장애물 밖)은 walkable로 분류됨(경계 사각지대 회귀 방지)', classifyPoint(WORLD_MAX, WORLD_MAX) === 'walkable')
  // O2 회귀 방지 — (50,WORLD_MIN)은 이제 상단 여백 안이라 blocked여야 한다
  // (x=50은 어떤 장애물과도 안 겹치는 열린 열이라, blocked라면 오직 O2
  // 상단 여백 때문이어야 한다).
  check('(50,WORLD_MIN)은 O2 상단 여백 안이라 blocked로 분류됨', classifyPoint(50, WORLD_MIN) === 'blocked')
}

// ── 9. sub-cell 오프셋 + 장애물 모서리 인접 시나리오(회귀 방지) ──────────
// 2026-09-25 — findPath의 string-pulling이 "시작/도착 셀의 정수 좌표"
// 기준으로 시야를 검증하던 버그(정확한 sub-cell 오프셋 좌표를 무시)를
// 고쳤다(pathfinding.js hasLineOfSightWorld 헤더 주석 참고). demo-building
// 모서리 바로 옆(모서리에서 0.1~0.9 world-% 떨어진, 즉 셀 중심이 아니라
// 코너 쪽으로 크게 치우친 sub-cell 오프셋) 지점을 start/target으로 각각
// 써서, 수정된 로직이 실제로 "정확한 좌표"를 기준으로 시야를 검증하는지
// scripts/testProto25dPathRandom.mjs와 동일한 촘촘한 점 샘플링으로 확인.
section('9. sub-cell 오프셋 + 장애물 모서리 인접 시나리오(회귀 방지)')
{
  const building = OBSTACLES.find((o) => o.id === 'demo-building')

  function assertPathClear(label, start, end) {
    check(`${label} — 시작점은 walkable(사전조건)`, classifyPoint(start.x, start.y) === 'walkable', JSON.stringify(start))
    const path = findPath(start, end)
    check(`${label} — 경로가 존재함`, Array.isArray(path) && path.length > 0, JSON.stringify(path))
    if (!Array.isArray(path)) return
    let allClear = true
    let prev = start
    for (const wp of path) {
      const steps = 200 // 이 회귀 자체가 샘플 간격보다 좁은 침입이었으므로 촘촘히 샘플링.
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = prev.x + (wp.x - prev.x) * t
        const y = prev.y + (wp.y - prev.y) * t
        if (pointInAnyObstacle(x, y, OBSTACLES)) { allClear = false; break }
      }
      if (!allClear) break
      prev = wp
    }
    check(`${label} — 경로가 장애물을 침범하지 않음(0.5% 간격 샘플링)`, allClear)
    return path
  }

  // (a) 시작점이 건물 우하단 모서리(x1,y1) 바로 밖, 셀 중심이 아니라
  // 모서리 쪽으로 크게 치우친 sub-cell 오프셋 — 건물을 지나 반대편(좌상단
  // 방향, 6번 섹션과 동일한 우회 목적지)으로 이동.
  const cornerStart = { x: building.x1 + 0.1, y: building.y1 + 0.1 }
  assertPathClear('(a) 코너 인접 시작점', cornerStart, { x: 15, y: 15 })

  // (b) 도착점이 건물 좌상단 모서리(x0,y0) 바로 밖, 마찬가지로 모서리
  // 쪽으로 치우친 sub-cell 오프셋 — 먼 시작점에서 그 도착점으로 이동.
  const cornerTarget = { x: building.x0 - 0.1, y: building.y0 - 0.1 }
  const startFar = { x: 90, y: 80 }
  const pathB = assertPathClear('(b) 코너 인접 도착점', startFar, cornerTarget)
  if (Array.isArray(pathB)) {
    const correctedCornerTarget = nearestWalkablePoint(cornerTarget.x, cornerTarget.y)
    check(
      '(b) 코너 인접 도착점 — 마지막 웨이포인트가 도착점의 정확한 좌표(보정 불필요, 이미 walkable)',
      Math.abs(pathB[pathB.length - 1].x - correctedCornerTarget.x) <= 1e-9 &&
        Math.abs(pathB[pathB.length - 1].y - correctedCornerTarget.y) <= 1e-9,
      JSON.stringify(pathB[pathB.length - 1]),
    )
  }

  // (c) 결정론 — 위 코너 인접 케이스들도 동일 입력 -> 동일 경로(반복 호출).
  const pathA1 = JSON.stringify(findPath(cornerStart, { x: 15, y: 15 }))
  const pathA2 = JSON.stringify(findPath(cornerStart, { x: 15, y: 15 }))
  check('(c) 코너 인접 시작점 시나리오도 결정론적(재호출 deep-equal)', pathA1 === pathA2)
  const pathB1 = JSON.stringify(findPath(startFar, cornerTarget))
  const pathB2 = JSON.stringify(findPath(startFar, cornerTarget))
  check('(c) 코너 인접 도착점 시나리오도 결정론적(재호출 deep-equal)', pathB1 === pathB2)
}

// ── 10. O2 상단 여백 — WORLD_MIN_Y가 실제로 상단을 막고, x축은 무관함 ──
// 2026-09-26 — 캐릭터 스프라이트가 world-y=WORLD_MIN 근처에서 화면 상단에
// 잘려 보이던 문제(O2)를 walkGrid.js가 WORLD_MIN_Y(상단 걷기 여백)로
// 고쳤다. 여기서는 (a) 걸을 수 있는 모든 칸이 실제로 이 여백 아래에
// 있는지 전수(exhaustive) 검사, (b) WORLD_MIN_Y 값 자체가 문서화된 유도
// 공식(row 8의 y0)에 정확히 고정(lock)돼 있는지, (c) 이 여백이 y축
// 전용이고 x축 여백(WORLD_MIN)은 전혀 건드리지 않았는지, (d)/(e)
// nearestWalkablePoint/clampToWorldBounds도 이 여백을 존중하는지 확인한다.
section('10. O2 상단 여백 — WORLD_MIN_Y가 실제로 상단을 막고, x축은 무관함')
{
  // (a) 전수 검사 — 걸을 수 있다고 판정된 모든 셀은 반드시 WORLD_MIN_Y
  // 이상의 y0을 가져야 한다(격자 3040칸 전부, 비용 무시할 만함 — 이 파일
  // 헤더 주석의 "매 탭마다 전수 BFS도 무시할 만함" 논리와 동일).
  let allAboveMargin = true
  let firstViolation = null
  for (let row = 0; row < GRID_ROWS && allAboveMargin; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (isWalkableCell(col, row)) {
        const y0 = WORLD_MIN + row * CELL_H_PCT
        if (y0 < WORLD_MIN_Y - EPS) { allAboveMargin = false; firstViolation = { col, row, y0 }; break }
      }
    }
  }
  check('걸을 수 있는 모든 셀의 y0 >= WORLD_MIN_Y(상단 여백 밖)', allAboveMargin, JSON.stringify(firstViolation))

  // (b) WORLD_MIN_Y 값 자체가 문서화된 유도 공식(row 8의 y0)에 정확히
  // 고정돼 있는지 — 24는 SCENE_FIXTURE에서 가장 위쪽 오브젝트(demo-building)
  // 의 collisionRect.y0(sceneFixture.js)로, walkGrid.js가 이 값을 export하지
  // 않아 여기 하드코딩한다(사양 문서 명시 허용).
  const TOPMOST_SCENE_OBJECT_Y0 = 24
  check(
    'WORLD_MIN_Y는 WORLD_MIN보다 크고 씬 최상단 오브젝트(y0=24)보다 작음(과보정이되 걷기 공간을 잃지 않음)',
    WORLD_MIN_Y > WORLD_MIN && WORLD_MIN_Y < TOPMOST_SCENE_OBJECT_Y0,
    `WORLD_MIN_Y=${WORLD_MIN_Y}`,
  )
  check(
    'WORLD_MIN_Y === WORLD_MIN + 8*CELL_H_PCT(row 8의 y0과 완전히 동일한 연산, lock)',
    Math.abs(WORLD_MIN_Y - (WORLD_MIN + 8 * CELL_H_PCT)) < EPS,
    `WORLD_MIN_Y=${WORLD_MIN_Y}, row8 y0=${WORLD_MIN + 8 * CELL_H_PCT}`,
  )

  // (c) x축 여백은 O2와 무관 — WORLD_MIN에 딱 붙은 x좌표도(장애물과 안
  // 겹치는 y라면) 여전히 walkable이어야 한다.
  check('x=WORLD_MIN(O2와 무관한 축), y=50(장애물 밖)은 walkable', classifyPoint(WORLD_MIN, 50) === 'walkable')

  // (d) nearestWalkablePoint — 상단 여백 안(장애물이 아니라 여백 자체)의
  // 목적지도 안전하게 여백 밖(y>=WORLD_MIN_Y)으로 보정돼야 한다.
  const correctedTop = nearestWalkablePoint(50, WORLD_MIN)
  check(
    'nearestWalkablePoint(50,WORLD_MIN)이 반환하는 y가 WORLD_MIN_Y 이상(상단 여백 밖으로 보정됨)',
    correctedTop.y >= WORLD_MIN_Y - EPS,
    JSON.stringify(correctedTop),
  )

  // (e) clampToWorldBounds — y=0(범위 밖) 입력이 WORLD_MIN이 아니라
  // WORLD_MIN_Y로 clamp돼야 한다(O2 이전 동작과의 회귀 방지).
  const clampedTop = clampToWorldBounds(50, 0)
  check('clampToWorldBounds(50,0).y === WORLD_MIN_Y', clampedTop.y === WORLD_MIN_Y, JSON.stringify(clampedTop))
}

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
