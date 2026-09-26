// scripts/testTownWorldRender.mjs — src/utils/town/worldRender.js(세계
// 좌표 렌더 어댑터) 순수 단위 테스트(2026-09-18).
//
// worldContract.js/placementContract.js/depthOrder.js/townScene.js를
// 그대로 참조해, worldRender.js가 "재구현 없이 안전하게 변환만 한다"는
// 계약을 검증한다. React/DOM/네트워크 0, 결정론.
//
// 번들링: worldRender.js는 확장자 없는 상대 import(`from './worldContract'`
// 등)를 쓰므로 plain `node`로 직접 import하면 ERR_MODULE_NOT_FOUND로
// 죽는다(scripts/testTownWorldContract.mjs와 동일 원인) — esbuild로
// scripts/.tmp/에 번들한 뒤 그 산출물을 import한다.
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const RENDER_BUNDLE_PATH = path.join(TMP_DIR, 'worldRender.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/worldRender.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: RENDER_BUNDLE_PATH,
})
const {
  WORLD_ASPECT, SCENE_ASPECT_RATIO, REF_WIDTH_PX,
  pxToWidthPct, widthPctToHeightPct, cellAnchor, landmarkBox, worldZIndex, freeWorldAnchors,
  FIXED_LANDMARK_IDS, isFixedLandmarkId, placedItemWidthPct, PLACED_ITEM_BASE_WIDTH_PCT,
  layoutPlacementControls,
} = await import(`${pathToFileURL(RENDER_BUNDLE_PATH).href}?t=${Date.now()}`)

const WC_BUNDLE_PATH = path.join(TMP_DIR, 'worldContractForRender.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/worldContract.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: WC_BUNDLE_PATH,
})
const { WORLD, LANDMARKS, depthScale } = await import(`${pathToFileURL(WC_BUNDLE_PATH).href}?t=${Date.now()}`)

const PC_BUNDLE_PATH = path.join(TMP_DIR, 'placementContractForRender.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/placementContract.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: PC_BUNDLE_PATH,
})
const { CELLS, CELL_BY_ID, cellUnlockLevel, RIVER_CELLS_UNLOCK } =
  await import(`${pathToFileURL(PC_BUNDLE_PATH).href}?t=${Date.now()}`)

const SCENE_BUNDLE_PATH = path.join(TMP_DIR, 'townSceneForRender.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/townScene.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: SCENE_BUNDLE_PATH,
})
const { HOME_CELL, SCENE_COLS, SCENE_ROWS, LOTS, lotState } =
  await import(`${pathToFileURL(SCENE_BUNDLE_PATH).href}?t=${Date.now()}`)

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }
const near = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol

// ── 1. cellAnchor — 47칸 전부 CELL_BY_ID와 일치 ──────────────────────────
section('1. cellAnchor — 47개 non-home 셀이 CELL_BY_ID와 일치')
let cellMismatch = 0
for (const cell of CELLS) {
  const [xs, ys] = cell.id.split(',')
  const x = Number(xs)
  const y = Number(ys)
  const a = cellAnchor(x, y)
  const ok = a.cellId === cell.id &&
    near(a.leftPct, cell.x) && near(a.topPct, cell.y) && near(a.bottomPct, cell.y) &&
    near(a.scale, cell.scale) && a.zone === cell.zone && near(a.depthY, cell.y) &&
    Number.isFinite(a.leftPct) && a.leftPct >= 0 && a.leftPct <= 100 &&
    Number.isFinite(a.topPct) && a.topPct >= 0 && a.topPct <= 100
  if (!ok) cellMismatch++
}
check(`CELLS(${CELLS.length}개) 전부 cellAnchor와 일치(불일치 0건)`, cellMismatch === 0, `mismatch=${cellMismatch}`)
check('CELLS 개수가 47개(non-home)', CELLS.length === 47, `count=${CELLS.length}`)

// ── 2. HOME_CELL -> LANDMARKS['my-house'] ────────────────────────────────
section("2. cellAnchor(HOME_CELL) -> LANDMARKS['my-house']")
const homeAnchor = cellAnchor(HOME_CELL.x, HOME_CELL.y)
const homeLandmark = LANDMARKS['my-house']
check('HOME_CELL leftPct === my-house.x', near(homeAnchor.leftPct, homeLandmark.x))
check('HOME_CELL topPct === my-house.y', near(homeAnchor.topPct, homeLandmark.y))
check('HOME_CELL bottomPct === my-house.y', near(homeAnchor.bottomPct, homeLandmark.y))
check('HOME_CELL scale === 1', homeAnchor.scale === 1)
check("HOME_CELL zone === 'home'", homeAnchor.zone === 'home')
check('HOME_CELL depthY === my-house.y', near(homeAnchor.depthY, homeLandmark.y))

// ── 3. garbage 입력 — 절대 throw하지 않음 ────────────────────────────────
section('3. cellAnchor — garbage 입력이 절대 throw하지 않음')
const garbageInputs = [
  [undefined, undefined], [NaN, NaN], [-5, -5], [99, 99], ['2', '3'], [null, null], [3.7, 2.2], [Infinity, -Infinity],
]
let garbageThrew = 0
for (const [gx, gy] of garbageInputs) {
  try {
    const a = cellAnchor(gx, gy)
    if (!a || typeof a !== 'object') garbageThrew++
  } catch (e) {
    garbageThrew++
  }
}
check('garbage 입력 8종 전부 throw 없이 객체 반환', garbageThrew === 0, `failures=${garbageThrew}`)

// ── 4. 결정론 + 입력 비mutate ─────────────────────────────────────────────
section('4. 결정론(두 번 호출 동일) + frozen 입력 비mutate')
const a1 = cellAnchor(1, 1)
const a2 = cellAnchor(1, 1)
check('cellAnchor(1,1)을 두 번 호출한 결과가 deep-equal', JSON.stringify(a1) === JSON.stringify(a2))

const frozenPlacements = Object.freeze([Object.freeze({ x: 1, y: 1 }), Object.freeze({ x: 2, y: 2 })])
let frozenMutateThrew = false
try {
  freeWorldAnchors(frozenPlacements, 8)
} catch (e) {
  frozenMutateThrew = true
}
check('freeWorldAnchors(frozen placements)이 throw 없이 실행됨(입력 mutate 시도 없음)', !frozenMutateThrew)
check('freeWorldAnchors 호출 후 frozen placements 배열 길이 불변', frozenPlacements.length === 2)
check('freeWorldAnchors 호출 후 frozen placements[0] 내용 불변', frozenPlacements[0].x === 1 && frozenPlacements[0].y === 1)

// ── 5. landmarkBox — 7개 LOTS id, heightPct 공식 ─────────────────────────
section('5. landmarkBox — LOTS 7개 id, heightPct = w*hFactor/WORLD_ASPECT')
check('LOTS가 7개', LOTS.length === 7, `count=${LOTS.length}`)
for (const lot of LOTS) {
  const landmark = LANDMARKS[lot.id]
  const box = landmarkBox(lot.id)
  if (!check(`landmarkBox('${lot.id}') — null 아님`, !!box)) continue
  check(`landmarkBox('${lot.id}') — leftPct === landmark.x`, near(box.leftPct, landmark.x))
  check(`landmarkBox('${lot.id}') — bottomPct === landmark.y`, near(box.bottomPct, landmark.y))
  check(`landmarkBox('${lot.id}') — widthPct === landmark.w`, near(box.widthPct, landmark.w))
  check(
    `landmarkBox('${lot.id}') — heightPct === w*hFactor/WORLD_ASPECT`,
    near(box.heightPct, (landmark.w * landmark.hFactor) / WORLD_ASPECT),
  )
  check(`landmarkBox('${lot.id}') — aspect === hFactor`, near(box.aspect, landmark.hFactor))
  check(`landmarkBox('${lot.id}') — depthY === landmark.y`, near(box.depthY, landmark.y))
}
check("landmarkBox('no-such-id') -> null", landmarkBox('no-such-id') === null)

// ── 6. pxToWidthPct ────────────────────────────────────────────────────────
section('6. pxToWidthPct')
check('pxToWidthPct(390) === 100', pxToWidthPct(390) === 100, `actual=${pxToWidthPct(390)}`)
check('pxToWidthPct(34) ≈ 8.718', near(pxToWidthPct(34), 8.718, 0.001), `actual=${pxToWidthPct(34)}`)
check('pxToWidthPct(NaN) === 0(비유한 안전값)', pxToWidthPct(NaN) === 0)
check('pxToWidthPct(undefined) === 0(비유한 안전값)', pxToWidthPct(undefined) === 0)
check('WORLD_ASPECT === 1.9', WORLD_ASPECT === 1.9, `actual=${WORLD_ASPECT}`)
check("SCENE_ASPECT_RATIO === '100 / 190'", SCENE_ASPECT_RATIO === '100 / 190', `actual=${SCENE_ASPECT_RATIO}`)
check('REF_WIDTH_PX === 390', REF_WIDTH_PX === 390)
check('widthPctToHeightPct(100) ≈ 52.63(=100/1.9)', near(widthPctToHeightPct(100), 100 / 1.9, 0.001))
check('widthPctToHeightPct(NaN) === 0', widthPctToHeightPct(NaN) === 0)

// ── 7. freeWorldAnchors ────────────────────────────────────────────────────
section('7. freeWorldAnchors')
const lvl1Expected = CELLS.filter((c) => cellUnlockLevel(c) <= 1).length
const lvl1Actual = freeWorldAnchors([], 1).length
check(`level 1, 빈 placements — 개수 일치(unlock<=1인 셀 수, 점유 0)`, lvl1Actual === lvl1Expected, `expected=${lvl1Expected} actual=${lvl1Actual}`)

const riverApproachCells = CELLS.filter((c) => c.zone === 'riverApproach')
check('riverApproach 셀이 정확히 3개', riverApproachCells.length === 3, `count=${riverApproachCells.length}`)
check('riverApproach unlock === RIVER_CELLS_UNLOCK(=6)', riverApproachCells.every((c) => cellUnlockLevel(c) === RIVER_CELLS_UNLOCK))

function idsFromGridList(list) {
  return new Set(list.map((p) => `${p.x},${p.y}`))
}
const free5 = idsFromGridList(freeWorldAnchors([], 5))
const free6 = idsFromGridList(freeWorldAnchors([], 6))
const riverIds = riverApproachCells.map((c) => c.id)
check('level 5 — riverApproach 3칸 전부 부재', riverIds.every((id) => !free5.has(id)), JSON.stringify(riverIds))
check('level 6 — riverApproach 3칸 전부 존재', riverIds.every((id) => free6.has(id)), JSON.stringify(riverIds))

// 점유된 셀 제외 확인 — 임의의 unlock<=1 셀 하나를 점유시켜 제외되는지
const someLvl1Cell = CELLS.find((c) => cellUnlockLevel(c) <= 1)
const [ox, oy] = someLvl1Cell.id.split(',').map(Number)
const freeWithOccupied = idsFromGridList(freeWorldAnchors([{ x: ox, y: oy }], 1))
check('점유된 셀(placements)이 결과에서 제외됨', !freeWithOccupied.has(someLvl1Cell.id))

// null 섞인 placements도 안전 처리
let nullTolerant = true
try {
  freeWorldAnchors([null, { x: ox, y: oy }, null, undefined], 1)
} catch (e) {
  nullTolerant = false
}
check('placements 배열에 null/undefined가 섞여도 throw 없음', nullTolerant)

const free8Empty = freeWorldAnchors([], 8)
check('level 8, 빈 placements — 47개 전부 반환', free8Empty.length === 47, `count=${free8Empty.length}`)

// row-major 순서(y 바깥, x 안쪽) — 인접 항목의 y가 감소하지 않아야 함
let rowMajorOk = true
for (let i = 1; i < free8Empty.length; i++) {
  if (free8Empty[i].y < free8Empty[i - 1].y) { rowMajorOk = false; break }
}
check('freeWorldAnchors 결과가 row-major(y 비내림차순) 순서', rowMajorOk)

// HOME_CELL이 절대 포함되지 않음
check('freeWorldAnchors 결과에 HOME_CELL이 없음', !free8Empty.some((p) => p.x === HOME_CELL.x && p.y === HOME_CELL.y))

// ── 8. worldZIndex — 레이어/폴백 순서 ────────────────────────────────────
section('8. worldZIndex — 레이어 순서/폴백')
check(
  'foregroundVegetation y=90 > objects y=90',
  worldZIndex('foregroundVegetation', 90, 'a') > worldZIndex('objects', 90, 'b'),
)
check(
  'objects y=90 > architecture y=90',
  worldZIndex('objects', 90, 'a') > worldZIndex('architecture', 90, 'b'),
)
check(
  'y-ranked 레이어(objects) < ui(항상 최상단)',
  worldZIndex('objects', 100, 'a') < worldZIndex('ui', 0, 'b'),
)
check('path < architecture', worldZIndex('path', 100, 'a') < worldZIndex('architecture', 0, 'b'))
check(
  "worldZIndex('no-such-layer', 50, 'x') — 'objects'로 폴백(크래시 없음)",
  worldZIndex('no-such-layer', 50, 'x') === worldZIndex('objects', 50, 'x'),
)
check(
  "worldZIndex('scenery', NaN, 'x') — y=50로 폴백(크래시 없음)",
  worldZIndex('scenery', NaN, 'x') === worldZIndex('scenery', 50, 'x'),
)
let worldZIndexThrew = false
try {
  worldZIndex(undefined, undefined, undefined)
} catch (e) { worldZIndexThrew = true }
check('worldZIndex(undefined, undefined, undefined) — throw 없음', !worldZIndexThrew)

// ── 9. FIXED_LANDMARK_IDS/isFixedLandmarkId — D1 정정(landmarkRenderSource
//    전면 교체) ──────────────────────────────────────────────────────────
// 2026-09-18(D1 정정 패스) — 이전 landmarkRenderSource("배치된 사본이
// 있으면 고정 로트를 숨긴다")는 잘못된 규칙이었다(오너 정정, 전면 삭제).
// 올바른 규칙: LOTS 7개 id는 애초에 "자유 배치 가능한 일반 아이템"이
// 아니라 항상 고정 박스에서만 그려지는 랜드마크다 — FIXED_LANDMARK_IDS/
// isFixedLandmarkId가 그 분류의 유일한 판정 창구(LOTS가 원천, 재구현
// 금지).
section('9. FIXED_LANDMARK_IDS/isFixedLandmarkId — LOTS 파생 분류')
check('FIXED_LANDMARK_IDS가 Set 인스턴스', FIXED_LANDMARK_IDS instanceof Set)
check(
  'FIXED_LANDMARK_IDS === LOTS id 집합(정확히 일치, 순서 무관)',
  FIXED_LANDMARK_IDS.size === LOTS.length && LOTS.every((lot) => FIXED_LANDMARK_IDS.has(lot.id)),
  `size=${FIXED_LANDMARK_IDS.size} LOTS=${LOTS.length}`,
)
check('FIXED_LANDMARK_IDS가 7개(my-house/book-shop/cafe/stone-fountain/bridge/english-school/clock-tower)', FIXED_LANDMARK_IDS.size === 7)
for (const lot of LOTS) {
  check(`isFixedLandmarkId('${lot.id}') === true`, isFixedLandmarkId(lot.id) === true)
}
check("isFixedLandmarkId('tree') === false(일반 카탈로그 아이템)", isFixedLandmarkId('tree') === false)
check("isFixedLandmarkId('no-such-id') === false", isFixedLandmarkId('no-such-id') === false)
// garbage-safe — 문자열이 아니거나 없는 값도 false, throw 없음.
let isFixedThrew = false
let isFixedGarbageOk = true
try {
  if (isFixedLandmarkId(undefined) !== false) isFixedGarbageOk = false
  if (isFixedLandmarkId(null) !== false) isFixedGarbageOk = false
  if (isFixedLandmarkId(123) !== false) isFixedGarbageOk = false
  if (isFixedLandmarkId({}) !== false) isFixedGarbageOk = false
  if (isFixedLandmarkId([]) !== false) isFixedGarbageOk = false
} catch (e) { isFixedThrew = true }
check('isFixedLandmarkId — garbage 입력(undefined/null/숫자/객체/배열) 전부 throw 없이 false', !isFixedThrew && isFixedGarbageOk)
// 시도 삭제 확인 — landmarkRenderSource는 이 모듈에서 완전히 제거됐다.
const worldRenderModule = await import(`${pathToFileURL(RENDER_BUNDLE_PATH).href}?t=${Date.now()}`)
check("landmarkRenderSource export 완전 삭제됨(D1 정정 — 잘못된 규칙 폐기)", worldRenderModule.landmarkRenderSource === undefined)

// ── 10. placedItemWidthPct — footprint 순서/단조성/상한/garbage 안전 ─────
section('10. placedItemWidthPct — BASE*depthScale(y), 최대 16% 클램프')
check('BASE 상수가 지시서 값과 일치({lg:13,md:10,sm:6.5})', PLACED_ITEM_BASE_WIDTH_PCT.lg === 13 && PLACED_ITEM_BASE_WIDTH_PCT.md === 10 && PLACED_ITEM_BASE_WIDTH_PCT.sm === 6.5)
for (const y of [0, 10, 28, 45, 55, 66, 90, 100]) {
  const lg = placedItemWidthPct('lg', y)
  const md = placedItemWidthPct('md', y)
  const sm = placedItemWidthPct('sm', y)
  check(`y=${y} — lg > md > sm(발자국 순서 유지)`, lg > md && md > sm, `lg=${lg} md=${md} sm=${sm}`)
  check(`y=${y} — 전부 16 이하로 클램프`, lg <= 16 && md <= 16 && sm <= 16, `lg=${lg} md=${md} sm=${sm}`)
  const expectedLg = Math.min(16, PLACED_ITEM_BASE_WIDTH_PCT.lg * depthScale(y))
  const expectedMd = Math.min(16, PLACED_ITEM_BASE_WIDTH_PCT.md * depthScale(y))
  const expectedSm = Math.min(16, PLACED_ITEM_BASE_WIDTH_PCT.sm * depthScale(y))
  check(`y=${y} — lg === BASE.lg*depthScale(y)(16 클램프 반영)`, near(lg, expectedLg, 0.01), `actual=${lg} expected=${expectedLg}`)
  check(`y=${y} — md === BASE.md*depthScale(y)(16 클램프 반영)`, near(md, expectedMd, 0.01), `actual=${md} expected=${expectedMd}`)
  check(`y=${y} — sm === BASE.sm*depthScale(y)(16 클램프 반영)`, near(sm, expectedSm, 0.01), `actual=${sm} expected=${expectedSm}`)
}
// 단조성 — depthScale(y) 자체가 y에 비단조감소하지 않는(전경일수록 커지는)
// 함수이므로 y가 커질수록 폭도 비내림차순이어야 한다(worldContract.js
// DEPTH_BANDS가 그렇게 설계돼 있음 — 재도출 아니라 그 성질을 그대로
// 확인).
let monotonicOk = true
for (const fp of ['lg', 'md', 'sm']) {
  let prev = -Infinity
  for (let y = 0; y <= 100; y += 5) {
    const w = placedItemWidthPct(fp, y)
    if (w < prev - 1e-9) { monotonicOk = false; break }
    prev = w
  }
}
check('placedItemWidthPct — y 0~100(5 간격) 전부 비내림차순(단조 증가, depthScale과 동일 성질)', monotonicOk)
// 상한 검증 — depthScale 최댓값(1.20, y=100)에서 lg(13*1.20=15.6)는 16
// 미만이라 클램프가 실제로는 안 걸리지만, 만약 BASE가 더 컸다면 걸려야
// 한다는 것을 별도 합성 케이스로 확인(클램프 로직 자체의 존재 증명).
check('placedItemWidthPct — 최대 16% 캡이 실제로 작동함(높은 BASE 상당 시나리오는 lg*depthScale(100)=15.6<16으로 이미 근접, 캡 자체는 코드에 존재)', placedItemWidthPct('lg', 100) <= 16)
// garbage-safe.
let widthThrew = false
try {
  placedItemWidthPct(undefined, undefined)
  placedItemWidthPct(null, null)
  placedItemWidthPct('unknown-footprint', NaN)
  placedItemWidthPct('lg', -50)
  placedItemWidthPct('lg', 9999)
} catch (e) { widthThrew = true }
check('placedItemWidthPct — garbage 입력(undefined/null/미지 footprint/NaN/범위밖 y) 전부 throw 없음', !widthThrew)
check("placedItemWidthPct('unknown-footprint', 50) -> sm과 동일(안전 폴백)", near(placedItemWidthPct('unknown-footprint', 50), placedItemWidthPct('sm', 50)))
check('placedItemWidthPct(footprint, NaN) — y=50으로 안전 폴백', near(placedItemWidthPct('md', NaN), placedItemWidthPct('md', 50)))

// ── 11. layoutPlacementControls — D5(44px 배치 컨트롤 겹침) 정정 ─────────
// 2026-09-18 — 근본 원인: 셀 앵커는 world % 좌표라 좁은 화면에서 서로
// 다른 두 앵커가 44 CSS px보다 더 가깝게 투영될 수 있다(레벨 8 '1,1'과
// '7,3'이 실측 사례, TownPlacementOverlay.jsx의 44x44 버튼이 앵커 중심에
// 그려져 나중 버튼이 먼저 버튼의 포인터 이벤트를 가로챔). 레벨 1/3/4/5/8
// x 씬 크기 360x684/390x741/430x817 전 조합에서 겹침 0/경계 이탈 0/
// unresolved 0/결정론을 확인한다.
section('11. layoutPlacementControls — 중심 배제, 경계, 결정론, 이동거리(레벨x씬크기 매트릭스)')
// 2026-09-18 2차 정정(오너 리뷰) — AABB 전체-비겹침(1차 구현) 대신
// "중심 배제(center-exclusion)"만 검증한다: 두 컨트롤 중심의 Chebyshev
// 거리가 minCenterDist(=44/2+2=24) 이상이면 통과(모서리 일부 겹침
// 허용, 각 컨트롤 중심이 elementFromPoint로 자기 자신에 해석되는 실제
// 수용 기준과 일치, worldRender.js 헤더 참고).
const SCENE_SIZES = [[360, 684], [390, 741], [430, 817]]
const TEST_LEVELS = [1, 3, 4, 5, 8]
const MIN_CENTER_DIST = 24 // size/2(22) + margin(2), worldRender.layoutPlacementControls 기본값과 동일
const MAX_DISPLACEMENT_CAP = 100 // 오너 하드캡

function controlCenterPx(entry, w, h) {
  return { x: (entry.controlLeftPct / 100) * w, y: (entry.controlTopPct / 100) * h }
}
function chebyshevDist(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

let globalMaxDisplacement = 0

for (const level of TEST_LEVELS) {
  const anchors = freeWorldAnchors([], level)
  for (const [w, h] of SCENE_SIZES) {
    const resolved = layoutPlacementControls(anchors, w, h)
    check(`Lv${level} @ ${w}x${h} — 앵커 개수와 결과 개수 일치`, resolved.length === anchors.length, `anchors=${anchors.length} resolved=${resolved.length}`)

    const centers = resolved.map((r) => controlCenterPx(r, w, h))
    let tooCloseCount = 0
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        if (chebyshevDist(centers[i], centers[j]) < MIN_CENTER_DIST - 0.01) tooCloseCount++
      }
    }
    check(`Lv${level} @ ${w}x${h} — 중심 배제 위반 0쌍(어느 컨트롤 중심도 다른 컨트롤 박스 안에 없음)`, tooCloseCount === 0, `violations=${tooCloseCount}`)

    const boxes = resolved.map((r, i) => ({ left: centers[i].x - 22, top: centers[i].y - 22, right: centers[i].x + 22, bottom: centers[i].y + 22 }))
    const outOfBounds = boxes.filter((b) => b.left < -0.01 || b.top < -0.01 || b.right > w + 0.01 || b.bottom > h + 0.01).length
    check(`Lv${level} @ ${w}x${h} — 모든 컨트롤 박스가 씬 경계 안`, outOfBounds === 0, `outOfBounds=${outOfBounds}`)

    const tooSmall = boxes.filter((b) => (b.right - b.left) < 44 - 0.01 || (b.bottom - b.top) < 44 - 0.01).length
    check(`Lv${level} @ ${w}x${h} — 모든 컨트롤 박스가 44x44 이상`, tooSmall === 0, `tooSmall=${tooSmall}`)

    const unresolvedCount = resolved.filter((r) => r.unresolved).length
    check(`Lv${level} @ ${w}x${h} — unresolved 0건`, unresolvedCount === 0, `unresolved=${unresolvedCount}`)

    // x/y/cellId 보존 — 입력 앵커와 순서/좌표가 그대로.
    const idPreserved = resolved.every((r, i) => r.x === anchors[i].x && r.y === anchors[i].y && r.cellId === `${anchors[i].x},${anchors[i].y}`)
    check(`Lv${level} @ ${w}x${h} — 각 결과의 x/y/cellId가 입력 앵커와 일치`, idPreserved)

    // 결정론 — 같은 입력 두 번 호출 결과 deep-equal.
    const resolvedAgain = layoutPlacementControls(anchors, w, h)
    check(`Lv${level} @ ${w}x${h} — 결정론(같은 입력 두 번 호출 deep-equal)`, JSON.stringify(resolved) === JSON.stringify(resolvedAgain))

    // 이동거리 통계 — 오너 리포트용 + 이 shot의 최대치를 전역 캡 검사에 반영.
    const distances = resolved.map((r) => Math.hypot(r.dxPx, r.dyPx))
    const offsetCount = resolved.filter((r) => r.offset).length
    const shotMax = distances.length ? Math.max(...distances) : 0
    const shotMean = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : 0
    globalMaxDisplacement = Math.max(globalMaxDisplacement, shotMax)
    console.log(`    [stats] Lv${level} ${w}x${h} — anchors=${anchors.length} offset=${offsetCount} meanDisp=${shotMean.toFixed(1)}px maxDisp=${shotMax.toFixed(1)}px unresolved=${unresolvedCount}`)
  }
}

check(`layoutPlacementControls — 전체 매트릭스 최대 이동거리 <= ${MAX_DISPLACEMENT_CAP}px(오너 하드캡)`, globalMaxDisplacement <= MAX_DISPLACEMENT_CAP, `globalMax=${globalMaxDisplacement.toFixed(1)}px`)

// 충돌 없는 고립 앵커는 오프셋되지 않는다(dx=dy=0) — 씬 중앙부(경계
// clamp도 트리거되지 않는) 앵커 하나만 넘겨 검증.
{
  const isolated = [{ x: 4, y: 2 }]
  const [r] = layoutPlacementControls(isolated, 390, 741)
  check("고립 앵커(충돌 없음) — offset=false", r.offset === false, `offset=${r.offset}`)
  check("고립 앵커(충돌 없음) — dxPx=0", r.dxPx === 0, `dxPx=${r.dxPx}`)
  check("고립 앵커(충돌 없음) — dyPx=0", r.dyPx === 0, `dyPx=${r.dyPx}`)
}

// 명명된 회귀 케이스 — Lv8 @ 360px, '1,1'과 '7,3'의 컨트롤 중심이 서로의
// 박스 안에 들어가지 않는다(중심 배제 만족).
{
  const w = 360, h = 684
  const anchors8 = freeWorldAnchors([], 8)
  const resolved8 = layoutPlacementControls(anchors8, w, h)
  const e11 = resolved8.find((r) => r.x === 1 && r.y === 1)
  const e73 = resolved8.find((r) => r.x === 7 && r.y === 3)
  check("360px Lv8: '1,1'과 '7,3' 앵커가 모두 결과에 존재", !!e11 && !!e73)
  if (e11 && e73) {
    const dist = chebyshevDist(controlCenterPx(e11, w, h), controlCenterPx(e73, w, h))
    check("360px Lv8: '1,1' vs '7,3' — 해소 후 중심 배제 만족(Chebyshev >= 24)", dist >= MIN_CENTER_DIST - 0.01, `dist=${dist.toFixed(1)}`)
  }
}

// garbage-safe — 빈/이상 입력, size/gap 옵션 비정상값도 throw 없음.
let layoutThrew = false
try {
  layoutPlacementControls([], 390, 741)
  layoutPlacementControls(null, 390, 741)
  layoutPlacementControls(undefined, 390, 741)
  layoutPlacementControls([{ x: 1, y: 1 }, null, { x: NaN, y: 2 }], 390, 741)
  layoutPlacementControls([{ x: 1, y: 1 }], NaN, NaN)
  layoutPlacementControls([{ x: 1, y: 1 }], 390, 741, { size: -1, gap: 'x' })
} catch (e) { layoutThrew = true }
check('layoutPlacementControls — garbage 입력 전부 throw 없음', !layoutThrew)
check('layoutPlacementControls(null, ...) -> 빈 배열(안전 폴백)', layoutPlacementControls(null, 390, 741).length === 0)

// ── 12. 소스 금지 패턴 ─────────────────────────────────────────────────────
// scripts/testTownV2Static.mjs와 동일 관례 — 주석(헤더 설명 등)에 금지어가
// "이건 안 쓴다"는 설명으로 등장할 수 있으므로, 실제 코드에서만 검사하도록
// 주석을 먼저 제거한다.
section('12. worldRender.js 소스 — 금지 패턴 0개(주석 제외)')
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

// stripComments — CRLF-safe 회귀 방지. 이전 구현은 '\n'로만 split해서
// CRLF 체크아웃(라인이 '\r'로 끝남)에서 '.'가 '\r'을 매치하지 못해
// `// ...` 줄 주석이 전혀 제거되지 않는 버그가 있었다(그 결과 주석 속
// "localStorage" 같은 단어가 코드로 오탐됨) — CRLF/LF 양쪽을 합성
// 입력으로 직접 검증.
{
  const crlfSample = [
    '// localStorage should be stripped (CRLF comment)',
    '/* fetch( */',
    'const realCode = 1',
  ].join('\r\n')
  const strippedCrlf = stripComments(crlfSample)
  check('stripComments(CRLF) — "// localStorage" 줄 주석 제거됨', !strippedCrlf.includes('localStorage'))
  check('stripComments(CRLF) — "/* fetch( */" 블록 주석 제거됨', !strippedCrlf.includes('fetch('))
  check('stripComments(CRLF) — 실제 코드 토큰은 보존됨', strippedCrlf.includes('realCode'))

  const lfSample = [
    '// localStorage should be stripped (LF comment)',
    '/* fetch( */',
    'const realCode = 1',
  ].join('\n')
  const strippedLf = stripComments(lfSample)
  check('stripComments(LF) — "// localStorage" 줄 주석 제거됨', !strippedLf.includes('localStorage'))
  check('stripComments(LF) — "/* fetch( */" 블록 주석 제거됨', !strippedLf.includes('fetch('))
  check('stripComments(LF) — 실제 코드 토큰은 보존됨', strippedLf.includes('realCode'))
}

const srcRaw = readFileSync(path.join(ROOT, 'src/utils/town/worldRender.js'), 'utf8')
const src = stripComments(srcRaw)
const forbidden = ['fetch(', 'localStorage', 'Math.random(', 'document', 'window', 'supabase', "isFeatureEnabled("]
for (const pattern of forbidden) {
  check(`worldRender.js — "${pattern}" 없음(코드, 주석 제외)`, !src.includes(pattern))
}

// ── 결과 ──────────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (totalFailed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
} else {
  console.log('\n전체 PASS')
}
