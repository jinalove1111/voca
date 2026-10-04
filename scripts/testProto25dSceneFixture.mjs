// scripts/testProto25dSceneFixture.mjs — Paul Town 2.5D 캐릭터 프로토타입
// (Phase 6A, 2026-09-23) sceneFixture.js(씬 구성 단일 진실 원천) 순수 단위
// 테스트.
//
// React/DOM/네트워크 0. sceneFixture.js가 worldContract.js(-> townScene.js/
// townLevel.js)를 확장자 없는 상대 import로 참조하므로, plain `node`로
// 직접 import하면 ERR_MODULE_NOT_FOUND로 죽는다(scripts/testProto25dWalkGrid.mjs
// 와 동일 원인/동일 해법) — esbuild로 scripts/.tmp/에 번들해서 쓴다.
// sceneFixture.js 자신은 townAsset()(.webp 정적 자산)을 import하지
// 않으므로(sceneFixture.js 헤더 주석 참고 — walkGrid.js의 import 그래프에
// asset을 섞지 않기 위한 의도적 설계) 이 번들에는 '.webp' 로더가 필요
//없다. assetKey -> 실제 URL 해석(townAsset())만 별도로 src/assets/town/
// index.js를 '.webp':'dataurl' 로더로 번들해서 검증한다(scripts/
// testTownAssetManifest.mjs와 동일 패턴).
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const FIXTURE_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dSceneFixture.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/sceneFixture.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: FIXTURE_BUNDLE_PATH,
})
const {
  SCENE_FIXTURE, deriveObstacles, footprintRect, sceneUnitPx, objectRenderedWidthPx,
} = await import(`${pathToFileURL(FIXTURE_BUNDLE_PATH).href}?t=${Date.now()}`)

const GRID_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dWalkGridForFixture.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/walkGrid.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: GRID_BUNDLE_PATH,
})
const {
  OBSTACLES, WORLD_MIN, WORLD_MAX, classifyPoint, nearestWalkablePoint,
} = await import(`${pathToFileURL(GRID_BUNDLE_PATH).href}?t=${Date.now()}`)

const PATHFINDING_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dPathfindingForFixture.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/pathfinding.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: PATHFINDING_BUNDLE_PATH,
})
const { findPath } = await import(`${pathToFileURL(PATHFINDING_BUNDLE_PATH).href}?t=${Date.now()}`)

const ASSETS_BUNDLE_PATH = path.join(TMP_DIR, 'townAssetsIndex.sceneFixture.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/assets/town/index.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: ASSETS_BUNDLE_PATH,
  loader: { '.webp': 'dataurl' },
})
const { townAsset } = await import(`${pathToFileURL(ASSETS_BUNDLE_PATH).href}?t=${Date.now()}`)

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function rectsOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

// ── 1. id 고유성 ──────────────────────────────────────────────────────
section('1. SCENE_FIXTURE — id 고유성')
{
  const ids = SCENE_FIXTURE.map((o) => o.id)
  const uniqueIds = new Set(ids)
  check('모든 id가 서로 다름(중복 없음)', uniqueIds.size === ids.length, JSON.stringify(ids))
  check('id가 8개(레거시 3 + 신규 5, pond 제외)', ids.length === 8, JSON.stringify(ids))
}

// ── 2. assetKey가 townAsset()으로 전부 해석됨 ────────────────────────────
section('2. SCENE_FIXTURE — 모든 assetKey가 townAsset()으로 실제 URL을 반환')
{
  let allResolved = true
  const unresolved = []
  for (const obj of SCENE_FIXTURE) {
    const url = townAsset(obj.assetKey)
    if (typeof url !== 'string' || url.length === 0) {
      allResolved = false
      unresolved.push(obj.id)
    }
  }
  check('모든 fixture 항목의 assetKey가 townAsset()에서 non-empty 문자열 URL을 반환함', allResolved, JSON.stringify(unresolved))
}

// ── 3. collisionRect(파생 포함)가 world 경계/걷기 가능 여백 안 ───────────
section('3. deriveObstacles — 모든 rect가 world 경계 [0,100] 및 걷기 가능 여백 [2,98] 안')
{
  const obstacles = deriveObstacles(SCENE_FIXTURE)
  let allInBounds = true
  let allInWalkableBand = true
  const offenders = []
  for (const ob of obstacles) {
    if (ob.x0 < 0 || ob.x1 > 100 || ob.y0 < 0 || ob.y1 > 100) { allInBounds = false; offenders.push(ob.id) }
    if (ob.x0 < WORLD_MIN || ob.x1 > WORLD_MAX || ob.y0 < WORLD_MIN || ob.y1 > WORLD_MAX) { allInWalkableBand = false; offenders.push(ob.id) }
  }
  check('모든 파생 obstacle rect가 [0,100] world 경계 안', allInBounds, JSON.stringify(offenders))
  check(`모든 파생 obstacle rect가 걷기 가능 여백 [${WORLD_MIN},${WORLD_MAX}] 안`, allInWalkableBand, JSON.stringify(offenders))
}

// ── 4. OBSTACLES(walkGrid.js) === deriveObstacles(SCENE_FIXTURE) ───────
section('4. walkGrid.OBSTACLES가 deriveObstacles(SCENE_FIXTURE)와 완전히 동일(단일 진실 원천 확인)')
{
  check(
    'walkGrid.js가 export하는 OBSTACLES가 이 파일에서 직접 계산한 deriveObstacles(SCENE_FIXTURE)와 deep-equal',
    JSON.stringify(OBSTACLES) === JSON.stringify(deriveObstacles(SCENE_FIXTURE)),
  )
}

// ── 5. 레거시 3개 rect가 역사적 숫자와 byte-identical ────────────────────
section('5. 레거시 3개(demo-building/demo-bench/demo-tree) rect — 역사적 좌표 회귀 고정')
{
  const LEGACY_REF = {
    'demo-building': { x0: 38, x1: 62, y0: 24, y1: 40 },
    'demo-bench': { x0: 20, x1: 27, y0: 58, y1: 63 },
    'demo-tree': { x0: 70, x1: 76, y0: 56, y1: 62 },
  }
  const obstacles = deriveObstacles(SCENE_FIXTURE)
  for (const [id, ref] of Object.entries(LEGACY_REF)) {
    const found = obstacles.find((o) => o.id === id)
    check(`${id} rect가 2026-09-22 원본 좌표와 정확히 일치(byte-identical)`, !!found && JSON.stringify({ x0: found.x0, x1: found.x1, y0: found.y0, y1: found.y1 }) === JSON.stringify(ref), JSON.stringify(found))
  }
}

// ── 6. 신규 오브젝트의 derived rect가 footprintRect 산식과 일치 ──────────
section('6. 신규 오브젝트(footprintDepthPct 기반) — deriveObstacles 결과가 footprintRect 산식과 일치')
{
  const obstacles = deriveObstacles(SCENE_FIXTURE)
  let allMatch = true
  const mismatches = []
  for (const obj of SCENE_FIXTURE) {
    if (obj.collisionRect) continue // 레거시 3개는 5절에서 이미 확인
    const expected = footprintRect(obj.anchor, obj.widthPct, obj.footprintDepthPct)
    const found = obstacles.find((o) => o.id === obj.id)
    const match = !!found && found.x0 === expected.x0 && found.x1 === expected.x1 && found.y0 === expected.y0 && found.y1 === expected.y1
    if (!match) { allMatch = false; mismatches.push(obj.id) }
  }
  check('collisionRect가 없는 모든 신규 오브젝트의 파생 rect === footprintRect(anchor,widthPct,footprintDepthPct)', allMatch, JSON.stringify(mismatches))
}

// ── 7. 어떤 두 obstacle rect도 서로 겹치지 않음 ──────────────────────────
section('7. 장애물 8개 — 어떤 두 쌍도 서로 겹치지 않음')
{
  const obstacles = deriveObstacles(SCENE_FIXTURE)
  let anyOverlap = false
  const overlapping = []
  for (let i = 0; i < obstacles.length; i++) {
    for (let j = i + 1; j < obstacles.length; j++) {
      if (rectsOverlap(obstacles[i], obstacles[j])) {
        anyOverlap = true
        overlapping.push(`${obstacles[i].id} x ${obstacles[j].id}`)
      }
    }
  }
  check('8개 장애물 중 어떤 쌍도 겹치지 않음', !anyOverlap, JSON.stringify(overlapping))
}

// ── 8. 캐릭터 스폰(50,62) — 어떤 rect 안에도 있지 않고, 모든 오브젝트 주변에 도달 가능 ──
section('8. 캐릭터 스폰(50,62) — walkable, 모든 오브젝트 옆 지점까지 findPath 도달')
{
  const SPAWN = { x: 50, y: 62 }
  check('스폰 지점(50,62)이 walkable로 분류됨', classifyPoint(SPAWN.x, SPAWN.y) === 'walkable')
  const obstacles = deriveObstacles(SCENE_FIXTURE)
  const insideAnyObstacle = obstacles.some((ob) => SPAWN.x >= ob.x0 && SPAWN.x <= ob.x1 && SPAWN.y >= ob.y0 && SPAWN.y <= ob.y1)
  check('스폰 지점이 어떤 장애물 rect 안에도 있지 않음', !insideAnyObstacle, JSON.stringify(obstacles))

  let allReachable = true
  const unreachable = []
  for (const ob of obstacles) {
    // 각 장애물 바로 아래(y1+1, 더 큰 y=화면 앞쪽) 지점을 목표로 삼는다
    // (benchArrivalPoint와 동일 정신 — 장애물 바닥 접점 바로 앞). 그
    // 지점이 다른 장애물과 겹쳐 걸을 수 없으면 nearestWalkablePoint로
    // 가장 가까운 걸을 수 있는 지점으로 보정한 뒤 findPath를 검증한다.
    const cx = (ob.x0 + ob.x1) / 2
    const raw = { x: cx, y: Math.min(WORLD_MAX, ob.y1 + 1) }
    const target = nearestWalkablePoint(raw.x, raw.y)
    const path = findPath(SPAWN, target)
    if (!path || path.length === 0) { allReachable = false; unreachable.push({ id: ob.id, target }) }
  }
  check('8개 장애물 전부 — 그 바로 옆(아래) 걸을 수 있는 지점까지 findPath가 경로를 찾음', allReachable, JSON.stringify(unreachable))
}

// ── 9. objectRenderedWidthPx — minWidthPx 하한 + depth-scale 반영 ───────
section('9. objectRenderedWidthPx — minWidthPx 하한을 지키고 depth(anchor.y)에 따라 스케일')
{
  const groundRectDesktop = { width: 1280, height: 800 }
  const shrub = SCENE_FIXTURE.find((o) => o.id === 'shrub-sw')
  check('사전조건 — shrub-sw가 존재하고 minWidthPx=28', !!shrub && shrub.minWidthPx === 28)
  if (shrub) {
    const w = objectRenderedWidthPx(shrub, groundRectDesktop)
    check('shrub-sw 렌더 폭이 minWidthPx(28) 이상', w >= 28, String(w))
  }

  // 아주 좁은 뷰포트(360px)에서는 nominal 폭이 minWidthPx보다 작아져
  // 하한이 실제로 발동해야 한다(단순 nominal 계산보다 커야 함).
  const groundRectNarrow = { width: 360, height: 800 }
  if (shrub) {
    const wNarrow = objectRenderedWidthPx(shrub, groundRectNarrow)
    const nominalOnly = (shrub.widthPct / 100) * sceneUnitPx(groundRectNarrow)
    check('좁은 뷰포트(360px)에서 minWidthPx 하한이 실제로 nominal 계산값보다 결과를 끌어올림', wNarrow > nominalOnly, `w=${wNarrow} nominal=${nominalOnly}`)
    check('좁은 뷰포트에서도 여전히 minWidthPx(28) 이상', wNarrow >= 28, String(wNarrow))
  }

  // depth-scale 반영 — 같은 widthPct라도 anchor.y가 클수록(앞쪽) 더 크게
  // 렌더돼야 한다(demo-tree y=62 vs house-annex 유사 폭 비교 대신, 동일
  // widthPct(6)인 demo-tree/tree-plaza-nw/tree-plaza-ne로 직접 비교).
  const tree = SCENE_FIXTURE.find((o) => o.id === 'demo-tree') // y=62(앞)
  const treeNw = SCENE_FIXTURE.find((o) => o.id === 'tree-plaza-nw') // y=56(뒤)
  if (tree && treeNw) {
    const wFront = objectRenderedWidthPx(tree, groundRectDesktop)
    const wBack = objectRenderedWidthPx(treeNw, groundRectDesktop)
    check('같은 widthPct(6)라도 anchor.y가 더 큰(앞쪽) 오브젝트가 더 크게 렌더됨(depth-scale 반영)', wFront > wBack, `front(y=${tree.anchor.y})=${wFront} back(y=${treeNw.anchor.y})=${wBack}`)
  }
}

// ── 10. sceneUnitPx — 세로가 짧으면 세로 기준으로 캡됨 ──────────────────
section('10. sceneUnitPx — 가로가 지나치게 넓으면(세로 대비) 세로*1.2로 캡')
{
  const wideShort = { width: 2000, height: 100 } // 가로가 압도적으로 넓음
  check('가로가 넓어도 sceneUnitPx가 1.2*height(=120)로 캡됨', sceneUnitPx(wideShort) === 120, String(sceneUnitPx(wideShort)))

  const tallNarrow = { width: 100, height: 2000 } // 세로가 압도적으로 김
  check('세로가 길면 캡이 발동하지 않고 width 그대로(=100)', sceneUnitPx(tallNarrow) === 100, String(sceneUnitPx(tallNarrow)))

  const desktop = { width: 1280, height: 800 } // 1.2*800=960 > 1280? no: 960<1280 -> 캡 발동, 960
  check('1280x800 데스크톱 — 1.2*800(=960) < width(1280)이라 세로 기준으로 캡됨', sceneUnitPx(desktop) === 960, String(sceneUnitPx(desktop)))

  check('groundRect 없음(undefined) — 크래시 없이 0 반환', sceneUnitPx(undefined) === 0)
}

// ── 11. sceneFixture.js 소스 자체에 "assets/town/env" 문자열이 없음 ──────
section('11. sceneFixture.js — env 레지스트리 import 금지(testTownEnvAssets.mjs 범위 강제와 동일 계약)')
{
  const src = readFileSync(path.join(ROOT, 'src/utils/town/proto2_5d/sceneFixture.js'), 'utf8')
  check('sceneFixture.js 소스에 "assets/town/env" 문자열이 0건(scripts/testTownEnvAssets.mjs §4와 동일 계약을 이 파일 자신도 지킴)', !src.includes('assets/town/env'), )
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
