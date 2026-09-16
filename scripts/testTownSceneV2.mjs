// scripts/testTownSceneV2.mjs — Paul Town V2-A 스토리북 씬 좌표/파생값 순수
// 단위 테스트(2026-09-13).
//
// src/utils/town/townScene.js(+townAmbient.js)만 import한다 — React/DOM/
// 네트워크 0, 결정론(같은 입력 → 항상 같은 출력). townScene.js는 기존
// 8x6 좌표계(townLayout.js가 진실 원천, TOWN_GRID/HOME_CELL)를 절대
// 바꾸지 않고 그 좌표를 퍼센트 앵커/z-index/발자국/정원 풍성함/레벨 파생값
// (nextUnlocks/nearGoal/fogState)으로만 변환하는 순수 함수 모음이라는 것이
// 이 스위트의 핵심 계약이다(CLAUDE.md 규칙 3 — townLayout.js의 8x6 그리드를
// "새로" 재구현하지 않고 그 위에 파생만 얹는지 확인).
//
// CRLF 안전화: Windows(core.autocrlf=true) 워킹카피는 \r\n일 수 있으므로
// 소스를 텍스트로 읽는 즉시 LF로 정규화한다(scripts/testTownUiStatic.mjs와
// 동일 관례).
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

// townScene.js(진실 원천, 다른 세션 소유 — 이 파일은 읽기만 한다)는 Vite가
// 해석해 주는 확장자 없는 상대 import(`from './townLayout'`)를 쓴다. Vite
// 번들에서는 정상이지만 이 스크립트처럼 plain `node`로 직접 import하면
// Node ESM 로더가 확장자 없는 상대 경로를 해석하지 못해 ERR_MODULE_NOT_FOUND로
// 죽는다(2026-09-13 실측). 새 buildXBundle.mjs 파일을 만들지 않고(이 세션이
// 소유하지 않는 신규 파일이라 규칙 16 위반 소지) esbuild로 이 파일 안에서
// 직접 번들해 scripts/.tmp/(gitignore 대상, 산출물이지 소스가 아님)에 쓴 뒤
// 그 산출물을 import한다 — scripts/buildRaceBundle.mjs 등 기존 관례와
// 동일한 도구(esbuild)를 재사용할 뿐, 새 소스 코드 로직을 발명하지 않는다.
const TMP_DIR = path.join(process.cwd(), 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })
const SCENE_BUNDLE_PATH = path.join(TMP_DIR, 'townScene.v2.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/townScene.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: SCENE_BUNDLE_PATH,
})

const {
  SCENE_ROWS, SCENE_COLS, LANE_ROW, ZONES,
  anchorFor, zIndexFor, Z_LAYERS,
  footprintFor, FOOTPRINT_CLASS, spriteFor, HOME_SPRITE,
  gardenRichness, GARDEN_STAGE_THRESHOLDS,
  nextUnlocks, nearGoal, fogState, freeAnchors,
  DISTRICTS, DISTRICT_ORDER, GEO_ORDER, FOG_HEIGHT_UNITS, LOTS, SPOT_MAP,
  PATHS, STUBS, STUB_WIDTH_PCT, MAIN_PATH_WIDTH_PCT,
  districtsVisible, sceneHeightUnits, districtOffsetUnits, districtLocalToGlobal,
  districtForCell, lotState,
} = await import(`${pathToFileURL(SCENE_BUNDLE_PATH).href}?t=${Date.now()}`)
// townAmbient.js는 import 0(순수, 다른 파일을 참조하지 않음)이라 확장자
// 문제가 없어 번들 없이 바로 plain import 가능(위 townScene.js와의 차이를
// 그대로 드러내는 사실 자체가 유용한 정적 신호).
import { ambientTone, ambientClassFor, depthClassFor } from '../src/utils/town/townAmbient.js'
import { TOWN_GRID, HOME_CELL } from '../src/utils/town/townLayout.js'
import { TOWN_ITEM_META, mergeCatalog } from '../src/utils/town/townCatalog.js'
import { TOWN_LEVELS } from '../src/utils/town/townLevel.js'

const ROOT = process.cwd()

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function readSrc(rel) {
  const full = path.join(ROOT, rel)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf8').replace(/\r\n?/g, '\n')
}

function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

// ── fixture 카탈로그 — TOWN_ITEM_META(townCatalog.js, 진실 원천) 그대로
//    17개 아이템을 mergeCatalog()로 정식 카탈로그 형태(name/emoji/price/
//    category/minLevel/sortOrder/assetKey)로 만든다. 새 가격/카테고리를
//    이 테스트가 발명하지 않는다. ────────────────────────────────────────
const catalog = mergeCatalog(Object.entries(TOWN_ITEM_META).map(([id, m]) => ({
  id, name: m.nameKo, emoji: m.emoji, price: m.defaultPrice, category: m.category,
  min_level: m.minLevel, sort_order: m.sortOrder,
})))

// ── 1. 그리드/앵커 불변식 ────────────────────────────────────────────────
section('1. 그리드/앵커 불변식')
check('SCENE_ROWS === TOWN_GRID.rows', SCENE_ROWS === TOWN_GRID.rows)
check('SCENE_COLS === TOWN_GRID.cols', SCENE_COLS === TOWN_GRID.cols)
check('LANE_ROW === Math.floor(TOWN_GRID.rows / 2)', LANE_ROW === Math.floor(TOWN_GRID.rows / 2))

const allCells = []
for (let y = 0; y < SCENE_ROWS; y++) {
  for (let x = 0; x < SCENE_COLS; x++) allCells.push({ x, y })
}
const allAnchors = allCells.map((c) => anchorFor(c.x, c.y))
check(
  '모든 48칸 anchorFor()의 leftPct/topPct/bottomPct가 [0,100] 범위(NaN 없음)',
  allAnchors.every((a) => [a.leftPct, a.topPct, a.bottomPct].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)),
  JSON.stringify(allAnchors.find((a) => ![a.leftPct, a.topPct, a.bottomPct].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) || {}),
)
// 2026-09-16 갱신 — 이 체크는 원래 "균일 8x6 그리드라 48칸이 수학적으로
// 항상 서로 다른 앵커"라는 옛 모델의 불변식이었다. 월드 지오메트리 확장
// 이후 anchorFor(x,y,level)은 아직 열리지 않은 구역의 칸도 안전하게(크래시
// 없이) 처리하기 위해, districtOffsetUnits()가 "보이지 않는 구역"에는
// sceneHeightUnits(level)(=스택 맨 아래 너머)이라는 동일한 폴백값을
// 반환하고 clampPct가 100으로 묶어버려, "잠긴 여러 구역의 칸"들이 레벨이
// 낮을수록 같은 좌표로 뭉치는 게 의도된 동작이다(예: level=1이면 44개 —
// 실측 확인). 그래서 이 불변식은 "모든 구역이 열린 level=8"에서만 여전히
// 참이어야 참된 회귀 신호이므로, level 인자를 8로 고정해 검증한다(이
// 불변식이 지키려던 원래 의도 — "48칸이 서로 다른 자리를 가리켜야 한다"
// — 는 그대로 유지하되, 어느 레벨에서 성립해야 하는지만 명확히 한다).
const allAnchorsLv8 = allCells.map((c) => anchorFor(c.x, c.y, 8))
const anchorKeys = new Set(allAnchorsLv8.map((a) => `${a.leftPct},${a.topPct}`))
check('48칸의 (leftPct,topPct) 조합이 레벨8(전 구역 개방)에서 전부 서로 다름(칸마다 고유 앵커)', anchorKeys.size === 48, `size=${anchorKeys.size}`)

check(
  'HOME 앵커(anchorFor(3,2)) === anchorFor(HOME_CELL.x, HOME_CELL.y)',
  deepEqual(anchorFor(3, 2), anchorFor(HOME_CELL.x, HOME_CELL.y)) && HOME_CELL.x === 3 && HOME_CELL.y === 2,
)

check('anchorFor(1,1) 반복 호출 — 동일 결과(순수 함수)', deepEqual(anchorFor(1, 1), anchorFor(1, 1)))

// anchorFor는 (x,y)만 보고 placement의 다른 필드(itemId 등)는 절대 참조하지
// 않는다 — 서로 다른 itemId를 가진 두 "placement 유사 객체"에서 x/y만 뽑아
// 넘기면 항상 같은 앵커가 나와야 한다(렌더가 오직 좌표에만 의존).
const placementA = { itemId: 'tree', x: 1, y: 1, placedAt: 111, updatedAt: 222 }
const placementB = { itemId: 'totally-different-item-id', x: 1, y: 1, someOtherField: 'ignored-by-anchorFor' }
check(
  'anchorFor(placement.x, placement.y) — itemId 등 다른 필드는 결과에 영향 없음',
  deepEqual(anchorFor(placementA.x, placementA.y), anchorFor(placementB.x, placementB.y)),
)

for (const [label, x, y] of [['음수(-1,-1)', -1, -1], ['범위초과(100,100)', 100, 100], ['NaN(NaN,NaN)', NaN, NaN]]) {
  const a = anchorFor(x, y)
  check(`anchorFor ${label} — NaN 없음`, [a.leftPct, a.topPct, a.bottomPct].every((v) => Number.isFinite(v)), JSON.stringify(a))
  check(`anchorFor ${label} — [0,100] 범위로 클램프`, [a.leftPct, a.topPct, a.bottomPct].every((v) => v >= 0 && v <= 100), JSON.stringify(a))
}

// ── 2. z-index / 레이어 ─────────────────────────────────────────────────
section('2. z-index / Z_LAYERS')
const zByRow = []
for (let y = 0; y < SCENE_ROWS; y++) zByRow.push(zIndexFor(y))
check('zIndexFor(y) — y=0..5 전 구간 y가 클수록 z가 엄격히 증가', zByRow.every((z, i) => i === 0 || z > zByRow[i - 1]), JSON.stringify(zByRow))
check('zIndexFor(y) — 모든 값이 양수', zByRow.every((z) => z > 0), JSON.stringify(zByRow))

// 2026-09-13 구현 결정(townScene.js 헤더 주석) — fog는 objects보다 "아래"
// (z 낮음)여야 한다: 안개가 배치된 오브젝트 위에 있으면 rows 4-5에 이미
// 놓아둔 소유 아이템이 잠긴 것처럼 흐리게 보이는 버그가 생긴다. 그래서
// 순서는 ground<path<patches<fog<objects<overlay<popover(fog=5, objects=10).
check('Z_LAYERS.ground < Z_LAYERS.path', Z_LAYERS.ground < Z_LAYERS.path)
check('Z_LAYERS.path < Z_LAYERS.patches', Z_LAYERS.path < Z_LAYERS.patches)
check('Z_LAYERS.patches < Z_LAYERS.fog', Z_LAYERS.patches < Z_LAYERS.fog)
check('Z_LAYERS.fog < Z_LAYERS.objects(안개가 배치된 오브젝트보다 아래)', Z_LAYERS.fog < Z_LAYERS.objects)
check('Z_LAYERS.objects < Z_LAYERS.overlay', Z_LAYERS.objects < Z_LAYERS.overlay)
check('Z_LAYERS.overlay < Z_LAYERS.popover', Z_LAYERS.overlay < Z_LAYERS.popover)

// 2026-09-16 신규 — zIndexFor(y, districtId) 2번째 인자(구역 스택 순서가
// 행(row) 순서보다 우선해야 함: home 구역의 어떤 행도 tower 구역의 어떤
// 행보다 항상 앞(z 높음)이어야 한다).
check(
  'zIndexFor — home 구역 최소 y(0)조차 tower 구역 최대 y(5)보다 z가 큼(구역 스택이 행보다 우선)',
  zIndexFor(0, 'home') > zIndexFor(5, 'tower'),
  `home(0)=${zIndexFor(0, 'home')} tower(5)=${zIndexFor(5, 'tower')}`,
)
for (let i = 0; i < GEO_ORDER.length - 1; i++) {
  const nearer = GEO_ORDER[i]
  const farther = GEO_ORDER[i + 1]
  check(
    `zIndexFor — ${nearer}(GEO_ORDER 하위)이 ${farther}(GEO_ORDER 상위)보다 항상 z가 큼(같은 y=3 기준)`,
    zIndexFor(3, nearer) > zIndexFor(3, farther),
  )
}
check('zIndexFor(y, districtId 생략) — 기본값 home 취급', zIndexFor(2) === zIndexFor(2, 'home'))

// ── 3. ZONES — 모든 행이 정확히 하나의 존에 속함 ────────────────────────
section('3. ZONES — 행 커버리지')
const allZoneRows = ZONES.flatMap((z) => z.rows)
const sortedZoneRows = [...allZoneRows].sort((a, b) => a - b)
const expectedRows = Array.from({ length: SCENE_ROWS }, (_, i) => i)
check('ZONES의 모든 rows를 합치면 0..rows-1이 정확히 한 번씩 등장', deepEqual(sortedZoneRows, expectedRows), JSON.stringify(sortedZoneRows))
check('ZONES 각 zone은 id/label을 가짐(빈 문자열 아님)', ZONES.every((z) => typeof z.id === 'string' && z.id.length > 0 && typeof z.label === 'string' && z.label.length > 0))
check('ZONES 배열 자체가 freeze됨', Object.isFrozen(ZONES))

// ── 4. footprintFor — 17개 아이템 전부 ──────────────────────────────────
section('4. footprintFor — 카탈로그 17개 아이템')
const EXPECTED_FOOTPRINT = { house: 'lg', special: 'lg', nature: 'md', animal: 'sm', decoration: 'sm' }
for (const [id, m] of Object.entries(TOWN_ITEM_META)) {
  const expected = EXPECTED_FOOTPRINT[m.category] || 'sm'
  check(`footprintFor(${id}) === '${expected}'(category=${m.category})`, footprintFor({ category: m.category }) === expected)
}
check('footprintFor(null) — 크래시 없이 sm 폴백', footprintFor(null) === 'sm')
check('footprintFor({}) — 알 수 없는 카테고리도 sm 폴백', footprintFor({}) === 'sm')
check('FOOTPRINT_CLASS — lg/md/sm 키 전부 문자열', ['lg', 'md', 'sm'].every((k) => typeof FOOTPRINT_CLASS[k] === 'string' && FOOTPRINT_CLASS[k].length > 0))

// ── 5. spriteFor — null-safe ─────────────────────────────────────────────
section('5. spriteFor — null-safety')
const nullSprite = spriteFor(null)
check('spriteFor(null) — assetKey null', nullSprite.assetKey === null)
check('spriteFor(null) — emoji 폴백 🎁', nullSprite.emoji === '🎁')
check('spriteFor(null) — footprint sm', nullSprite.footprint === 'sm')
check('spriteFor(null) — label 빈 문자열', nullSprite.label === '')

const barebonesSprite = spriteFor({ category: 'nature' })
check('spriteFor({category만}) — emoji 폴백 🎁(item.emoji 없음)', barebonesSprite.emoji === '🎁')
check('spriteFor({category만}) — label 빈 문자열(item.name 없음)', barebonesSprite.label === '')

const treeCatalogItem = catalog.find((it) => it.id === 'tree')
const treeSprite = spriteFor(treeCatalogItem)
check('spriteFor(tree) — assetKey === treeCatalogItem.assetKey', treeSprite.assetKey === treeCatalogItem.assetKey)
check('spriteFor(tree) — emoji === 🌳', treeSprite.emoji === '🌳')
check('spriteFor(tree) — footprint === md(자연)', treeSprite.footprint === 'md')
check('spriteFor(tree) — label === 나무', treeSprite.label === '나무')

check('HOME_SPRITE.assetKey === "buildings/my-house"', HOME_SPRITE.assetKey === 'buildings/my-house')
check('HOME_SPRITE.footprint === "lg"', HOME_SPRITE.footprint === 'lg')

// ── 5b. mergeCatalog assetKey 파생 — flower-garden/bench(2026-09-16, 아직
//     아트 없는 두 카탈로그 항목)가 townCatalog.js의 assetKeyFor() 경로를
//     통해 이미 올바른 assetKey를 갖는지(코드 변경 없이 확인만 — TASK 2/3).
//     assetKeyFor 자체는 export되지 않으므로, 기존 5절과 동일한 관례(실제
//     merge된 카탈로그 결과를 통해 간접 검증)를 그대로 따른다. ────────────
section('5b. mergeCatalog — flower-garden/bench assetKey(TASK 2/3 확인)')
const flowerGardenCatalogItem = catalog.find((it) => it.id === 'flower-garden')
const benchCatalogItem = catalog.find((it) => it.id === 'bench')
check('catalog에 flower-garden 항목 존재', !!flowerGardenCatalogItem)
check('catalog에 bench 항목 존재', !!benchCatalogItem)
check(
  "mergeCatalog — flower-garden.assetKey === 'nature/flower-garden'(category=nature 폴더 파생, 코드 변경 0)",
  !!flowerGardenCatalogItem && flowerGardenCatalogItem.assetKey === 'nature/flower-garden',
  JSON.stringify(flowerGardenCatalogItem),
)
check(
  "mergeCatalog — bench.assetKey === 'decorations/bench'(category=decoration -> 폴더 decorations 파생, 코드 변경 0)",
  !!benchCatalogItem && benchCatalogItem.assetKey === 'decorations/bench',
  JSON.stringify(benchCatalogItem),
)
// spriteFor()가 이 assetKey를 그대로 통과시키는지(TownObjectLayer.jsx가
// townAsset(sprite.assetKey)로 조회하는 바로 그 값과 동일해야 함).
const flowerGardenSprite = spriteFor(flowerGardenCatalogItem)
const benchSprite = spriteFor(benchCatalogItem)
check(
  "spriteFor(flower-garden).assetKey === 'nature/flower-garden'",
  flowerGardenSprite.assetKey === 'nature/flower-garden',
)
check(
  "spriteFor(bench).assetKey === 'decorations/bench'",
  benchSprite.assetKey === 'decorations/bench',
)

// ── 6. gardenRichness — 경계값 ───────────────────────────────────────────
section('6. gardenRichness — GARDEN_STAGE_THRESHOLDS 경계')
check('GARDEN_STAGE_THRESHOLDS === [0,10,30,60,100]', deepEqual(GARDEN_STAGE_THRESHOLDS, [0, 10, 30, 60, 100]))

const GARDEN_CASES = [
  [0, { stage: 0, windowsLit: false, ivy: false, birds: false }],
  [9, { stage: 0, windowsLit: false, ivy: false, birds: false }],
  [10, { stage: 1, windowsLit: false, ivy: false, birds: false }],
  [29, { stage: 1, windowsLit: false, ivy: false, birds: false }],
  [30, { stage: 2, windowsLit: true, ivy: false, birds: false }],
  [59, { stage: 2, windowsLit: true, ivy: false, birds: false }],
  [60, { stage: 3, windowsLit: true, ivy: true, birds: false }],
  [99, { stage: 3, windowsLit: true, ivy: true, birds: false }],
  [100, { stage: 4, windowsLit: true, ivy: true, birds: true }],
  [NaN, { stage: 0, windowsLit: false, ivy: false, birds: false }],
  [-5, { stage: 0, windowsLit: false, ivy: false, birds: false }],
]
for (const [points, expected] of GARDEN_CASES) {
  const r = gardenRichness(points)
  check(`gardenRichness(${points}).stage === ${expected.stage}`, r.stage === expected.stage, JSON.stringify(r))
  check(
    `gardenRichness(${points}) — {windowsLit,ivy,birds} === ${JSON.stringify({ windowsLit: expected.windowsLit, ivy: expected.ivy, birds: expected.birds })}`,
    r.windowsLit === expected.windowsLit && r.ivy === expected.ivy && r.birds === expected.birds,
    JSON.stringify(r),
  )
}

// ── 7. nextUnlocks / fogState — 레벨 1,2,3,5,8,10 ────────────────────────
section('7. nextUnlocks/fogState — 레벨별')
// 레벨별 기대값은 TOWN_ITEM_META(minLevel/sortOrder)에서 직접 손으로 도출한
// 값(id 집합, 순서에 안 흔들리게 Set 비교) — townScene.js 구현을 그대로
// 베껴 assert하지 않는다.
const NEXT_UNLOCKS_CASES = [
  [1, 2, ['cat', 'street-lamp', 'red-post-box']],
  [2, 3, ['flower-garden', 'book-shop']],
  [3, 4, ['puppy', 'owl']],
  [5, 6, ['bridge']],
  [8, null, []],
  [10, null, []],
]
for (const [level, expectedNextLevel, expectedIds] of NEXT_UNLOCKS_CASES) {
  const { nextLevel, items } = nextUnlocks(catalog, level)
  check(`nextUnlocks(catalog, ${level}).nextLevel === ${expectedNextLevel}`, nextLevel === expectedNextLevel, `got=${nextLevel}`)
  const idSet = new Set(items.map((it) => it.id))
  check(
    `nextUnlocks(catalog, ${level}).items — id 집합 === {${expectedIds.join(',')}}`,
    idSet.size === expectedIds.length && expectedIds.every((id) => idSet.has(id)),
    `got=${JSON.stringify([...idSet])}`,
  )

  const fog = fogState(catalog, level)
  const expectedVisible = expectedIds.length > 0
  check(`fogState(catalog, ${level}).visible === ${expectedVisible}`, fog.visible === expectedVisible, JSON.stringify(fog))
  if (expectedVisible) {
    check(`fogState(catalog, ${level}).nextLevel === ${expectedNextLevel}`, fog.nextLevel === expectedNextLevel)
    check(`fogState(catalog, ${level}).chip에 "Lv.${expectedNextLevel}" 포함`, fog.chip.includes(`Lv.${expectedNextLevel}`), fog.chip)
    check(`fogState(catalog, ${level}).silhouettes 최대 3개, id 집합 일치`, fog.silhouettes.length <= 3 && fog.silhouettes.length === Math.min(3, expectedIds.length) && fog.silhouettes.every((s) => expectedIds.includes(s.id)))
  } else {
    check(`fogState(catalog, ${level}).nextLevel === null`, fog.nextLevel === null)
    check(`fogState(catalog, ${level}).silhouettes === []`, Array.isArray(fog.silhouettes) && fog.silhouettes.length === 0)
  }
}

// ── 8. nearGoal — 레벨 1,2,3,5,8,10 대표 별(TOWN_LEVELS.min) ────────────
section('8. nearGoal — 레벨별 대표 별(TOWN_LEVELS min)')
function minStarsForLevel(level) {
  const entry = TOWN_LEVELS.find((e) => e.level === level)
  return entry ? entry.min : 0
}
const NEAR_GOAL_CASES = [
  [1, 2, minStarsForLevel(2) - minStarsForLevel(1)],
  [2, 3, minStarsForLevel(3) - minStarsForLevel(2)],
  [3, 4, minStarsForLevel(4) - minStarsForLevel(3)],
  [5, 6, minStarsForLevel(6) - minStarsForLevel(5)],
  [8, 9, minStarsForLevel(9) - minStarsForLevel(8)],
]
for (const [level, expectedNextLevel, expectedRemaining] of NEAR_GOAL_CASES) {
  const stars = minStarsForLevel(level)
  const g = nearGoal(catalog, stars)
  check(`nearGoal(catalog, stars=${stars}[level${level}]).nextLevel === ${expectedNextLevel}`, g.nextLevel === expectedNextLevel, JSON.stringify(g))
  check(`nearGoal(catalog, stars=${stars}[level${level}]).remaining === ${expectedRemaining}`, g.remaining === expectedRemaining, JSON.stringify(g))
  check(`nearGoal(catalog, stars=${stars}[level${level}]).text에 "⭐" 포함`, g.text.includes('⭐'), g.text)
  check(`nearGoal(catalog, stars=${stars}[level${level}]).text에 remaining(${expectedRemaining}) 포함`, g.text.includes(String(expectedRemaining)), g.text)
}
// 최고 레벨(10) — 더 열릴 마을이 없음
const starsAtMax = minStarsForLevel(10)
const gMax = nearGoal(catalog, starsAtMax)
check('nearGoal(catalog, stars=최고레벨) — nextLevel === null', gMax.nextLevel === null, JSON.stringify(gMax))
check('nearGoal(catalog, stars=최고레벨) — text === "모든 마을이 열렸어요!"', gMax.text === '모든 마을이 열렸어요!', gMax.text)
check('fogState(catalog, 10) — visible === false(더 열릴 것 없음)', fogState(catalog, 10).visible === false)

// ── 8b. nearGoal 조사(가/이) 결함 회귀(2026-09-13) — "꽃밭가 열려요"처럼
//     받침 있는 마지막 이름에 항상 "가"를 붙이던 문제를 subjectParticle()로
//     수정했는지, 실제 텍스트 접미사로 확인한다. ─────────────────────────
const bookshopFlowerGoal = nearGoal(catalog, minStarsForLevel(2))
check(
  'nearGoal 조사 수정 — "책방 · 꽃밭" 케이스(names=[책방,꽃밭]) text가 "꽃밭이 열려요"로 끝남(받침 있음 → "이")',
  bookshopFlowerGoal.names.join(',') === '책방,꽃밭' && bookshopFlowerGoal.text.endsWith('꽃밭이 열려요'),
  JSON.stringify({ names: bookshopFlowerGoal.names, text: bookshopFlowerGoal.text }),
)

const bridgeOnlyCatalog = [{ id: 'test-bridge', name: '다리', category: 'special', minLevel: 2, sortOrder: 10 }]
const bridgeOnlyGoal = nearGoal(bridgeOnlyCatalog, minStarsForLevel(1))
check(
  'nearGoal 조사 수정 — 합성 카탈로그(다음 아이템 1개 "다리") text가 "다리가 열려요"로 끝남(받침 없음 → "가")',
  bridgeOnlyGoal.text.endsWith('다리가 열려요'),
  bridgeOnlyGoal.text,
)

// ── 9. Kinney-shaped fixture — starsEarned=60 → 레벨3 ────────────────────
section('9. Kinney-shaped fixture(starsEarned=60)')
const kinneyGoal = nearGoal(catalog, 60)
check('nearGoal(catalog, 60).nextLevel === 4', kinneyGoal.nextLevel === 4, JSON.stringify(kinneyGoal))
check('nearGoal(catalog, 60).remaining === 40', kinneyGoal.remaining === 40, JSON.stringify(kinneyGoal))
check('nearGoal(catalog, 60).names에 "강아지" 포함', kinneyGoal.names.includes('강아지'), JSON.stringify(kinneyGoal.names))
check('nearGoal(catalog, 60).names에 "부엉이" 포함', kinneyGoal.names.includes('부엉이'), JSON.stringify(kinneyGoal.names))
check(
  'nearGoal 조사 수정 — Kinney fixture(강아지 · 부엉이) text가 "부엉이가 열려요"로 끝남(받침 없음 → "가")',
  kinneyGoal.text.endsWith('부엉이가 열려요'),
  kinneyGoal.text,
)

// ── 10. freeAnchors — HOME/점유 칸 제외, null 허용, 잠긴 구역 제외 ───────
// 2026-09-16 갱신 — freeAnchors()는 원래 (placements) 1개 인자만 받았고
// 둘째 자리에 넘기던 'idle'/'placing' 문자열은 구현이 실제로 읽지 않는
// 죽은 인자였다(옛 소스 확인). 월드 지오메트리 확장으로 그 자리가
// 진짜 의미(level, 기본값 1)를 갖게 됐다 — 이제 "레벨이 낮으면 아직 안
// 열린 구역의 스팟은 배치 후보에서 빠진다"는 새 계약이 생겼으므로, 옛
// "48-1=47칸" 기대값(구역 개념이 없던 시절, 항상 전체 그리드 47칸)은
// level=8(전 구역 개방)로 고정했을 때만 그대로 참이다 — 그 경우로
// 옮기고, 새로 생긴 레벨별 필터링 자체를 검증하는 케이스를 추가한다.
section('10. freeAnchors')
const freeEmptyLv8 = freeAnchors([], 8)
check('freeAnchors([], level8) — 48-1(HOME)=47칸(전 구역 개방, 옛 47칸 계약 유지)', freeEmptyLv8.length === 47, `len=${freeEmptyLv8.length}`)
check('freeAnchors([], level8) — HOME_CELL 미포함', !freeEmptyLv8.some((p) => p.x === HOME_CELL.x && p.y === HOME_CELL.y))

const freeWithPlacementsLv8 = freeAnchors([{ x: 1, y: 1 }, null, { x: 2, y: 2 }], 8)
check('freeAnchors(placements 2개+null, level8) — 48-1-2=45칸', freeWithPlacementsLv8.length === 45, `len=${freeWithPlacementsLv8.length}`)
check('freeAnchors — (1,1) 점유 칸 제외됨', !freeWithPlacementsLv8.some((p) => p.x === 1 && p.y === 1))
check('freeAnchors — (2,2) 점유 칸 제외됨', !freeWithPlacementsLv8.some((p) => p.x === 2 && p.y === 2))

const freeAllNullLv8 = freeAnchors([null, null, undefined], 8)
check('freeAnchors(전부 null/undefined, level8) — 크래시 없이 47칸', freeAllNullLv8.length === 47, `len=${freeAllNullLv8.length}`)

const freeGarbageInputLv8 = freeAnchors(undefined, 8)
check('freeAnchors(undefined, level8) — 크래시 없이 47칸(방어적 기본값)', freeGarbageInputLv8.length === 47, `len=${freeGarbageInputLv8.length}`)

// 신규 — 레벨별 구역 필터링(잠긴 구역의 스팟은 배치 후보로 나오지 않음).
// home 밴드는 y=0,1,2 24칸에서 HOME_CELL(3,2) 1칸을 뺀 23칸.
check('freeAnchors([], level1) — home만 열림 = 23칸', freeAnchors([], 1).length === 23, `len=${freeAnchors([], 1).length}`)
check('freeAnchors([]) — level 인자 생략 시 기본값 1과 동일(23칸)', freeAnchors([]).length === 23, `len=${freeAnchors([]).length}`)
check('freeAnchors([], level3) — home(23)+lane(8) = 31칸', freeAnchors([], 3).length === 31, `len=${freeAnchors([], 3).length}`)
check('freeAnchors([], level5) — home(23)+lane(8)+square(8) = 39칸', freeAnchors([], 5).length === 39, `len=${freeAnchors([], 5).length}`)
check(
  'freeAnchors([], level1) 결과가 전부 home 구역 스팟(또는 SPOT_MAP 미등록 칸 아님)',
  freeAnchors([], 1).every(({ x, y }) => SPOT_MAP[`${x},${y}`] && SPOT_MAP[`${x},${y}`].district === 'home'),
)

// ── 11. townScene.js 소스 정적 계약 — import/부작용 0 ────────────────────
section('11. townScene.js 소스 정적 계약')
const sceneSrc = readSrc('src/utils/town/townScene.js')
check('townScene.js 존재', sceneSrc !== null)
if (sceneSrc) {
  check('townScene.js — Math.random 없음', !/Math\.random\(/.test(sceneSrc))
  check('townScene.js — Date.now 없음', !/Date\.now\(/.test(sceneSrc))
  check('townScene.js — fetch( 없음', !/fetch\(/.test(sceneSrc))
  check('townScene.js — supabase 없음', !/supabase/i.test(sceneSrc))
  check('townScene.js — localStorage 없음', !/localStorage/.test(sceneSrc))
  const importLines = sceneSrc.split('\n').filter((l) => /^\s*import\s/.test(l))
  check('townScene.js — import 라인이 하나 이상 존재', importLines.length > 0)
  check(
    "townScene.js — import 출처가 './townLayout'/'./townLevel'뿐",
    importLines.every((l) => /from\s+['"]\.\/townLayout['"]/.test(l) || /from\s+['"]\.\/townLevel['"]/.test(l)),
    JSON.stringify(importLines),
  )
}

// ── 12. townAmbient.js — 순수 함수 sanity ────────────────────────────────
section('12. townAmbient.js — ambientTone/ambientClassFor/depthClassFor')
check('ambientTone(0,0) 반복 호출 — 결정론(동일 결과)', ambientTone(0, 0) === ambientTone(0, 0))
const toneSamples = allCells.slice(0, 12).map((c) => ambientTone(c.x, c.y))
check('ambientTone — 표본 12칸 전부 0|1|2 범위', toneSamples.every((t) => t === 0 || t === 1 || t === 2), JSON.stringify(toneSamples))
check('ambientClassFor(tone=0인 좌표) — 빈 문자열(기본 배경 유지)', ambientTone(0, 0) !== 0 || ambientClassFor(0, 0) === '')
check('ambientClassFor — 반환값이 항상 문자열', allCells.slice(0, 12).every((c) => typeof ambientClassFor(c.x, c.y) === 'string'))
const depthTop = depthClassFor(0, SCENE_ROWS)
const depthBottom = depthClassFor(SCENE_ROWS - 1, SCENE_ROWS)
check('depthClassFor(top row) — 문자열 반환', typeof depthTop === 'string' && depthTop.length > 0)
check('depthClassFor(bottom row) — 문자열 반환', typeof depthBottom === 'string' && depthBottom.length > 0)
check('depthClassFor — 잘못된 rows(0/NaN)에도 크래시 없이 문자열 반환', typeof depthClassFor(0, 0) === 'string' && typeof depthClassFor(NaN, NaN) === 'string')

const ambientSrc = readSrc('src/utils/town/townAmbient.js')
check('townAmbient.js 존재', ambientSrc !== null)
if (ambientSrc) {
  check('townAmbient.js — Math.random 없음', !/Math\.random\(/.test(ambientSrc))
  check('townAmbient.js — React/DOM import 없음(순수 모듈)', !/from\s+['"]react['"]/.test(ambientSrc))
}

// ── 13. 월드 지오메트리(2026-09-16 확장) — districtsVisible/sceneHeightUnits/
//     districtOffsetUnits/lotState/anchorFor(level) ─────────────────────
section('13. 월드 지오메트리 — districtsVisible/sceneHeightUnits')
check('DISTRICT_ORDER — 6개, tower가 맨 앞(위)/home이 맨 끝(아래)', DISTRICT_ORDER.length === 6 && DISTRICT_ORDER[0] === 'tower' && DISTRICT_ORDER[5] === 'home')
check('GEO_ORDER — DISTRICT_ORDER의 정확한 역순(세계 바닥->꼭대기)', deepEqual(GEO_ORDER, [...DISTRICT_ORDER].reverse()))
check('DISTRICTS/DISTRICT_ORDER/LOTS/SPOT_MAP/PATHS/STUBS — 전부 freeze됨', [DISTRICTS, DISTRICT_ORDER, GEO_ORDER, LOTS, SPOT_MAP, PATHS, STUBS].every((o) => Object.isFrozen(o)))
check('SPOT_MAP — 정확히 47개 키(48칸 - HOME_CELL(3,2))', Object.keys(SPOT_MAP).length === 47, `count=${Object.keys(SPOT_MAP).length}`)
check('SPOT_MAP — (3,2) 키 없음(My House 로트 자신)', !Object.prototype.hasOwnProperty.call(SPOT_MAP, '3,2'))
check('LOTS — 정확히 7개(문서 §3.1과 동일)', LOTS.length === 7, `count=${LOTS.length}`)
check('MAIN_PATH_WIDTH_PCT === 13, STUB_WIDTH_PCT === 8, FOG_HEIGHT_UNITS === 0.32', MAIN_PATH_WIDTH_PCT === 13 && STUB_WIDTH_PCT === 8 && FOG_HEIGHT_UNITS === 0.32)
check('STUBS — home에만 존재', Object.keys(STUBS).length === 1 && Object.keys(STUBS)[0] === 'home')

// districtsVisible — 브리프/문서 §2 unlock 표 그대로.
const DISTRICTS_VISIBLE_CASES = [
  [1, ['home']],
  [2, ['home']],
  [3, ['lane', 'home']],
  [4, ['lane', 'home']],
  [5, ['square', 'lane', 'home']],
  [6, ['river', 'square', 'lane', 'home']],
  [7, ['school', 'river', 'square', 'lane', 'home']],
  [8, ['tower', 'school', 'river', 'square', 'lane', 'home']],
  [10, ['tower', 'school', 'river', 'square', 'lane', 'home']],
]
for (const [level, expected] of DISTRICTS_VISIBLE_CASES) {
  check(`districtsVisible(${level}) === ${JSON.stringify(expected)}`, deepEqual(districtsVisible(level), expected), JSON.stringify(districtsVisible(level)))
}

// sceneHeightUnits — WORLD_LAYOUT_REDESIGN_2026-09-16.md §5 "전체 씬 높이
// (×W 배수)" 문단 숫자와 직접 대조(문서가 이미 계산해 둔 값을 그대로
// 손으로 옮긴 것 — 구현을 베끼지 않음).
const SCENE_HEIGHT_CASES = [[1, 1.47], [2, 1.47], [3, 2.32], [4, 2.32], [5, 3.22], [6, 3.72], [7, 4.52], [8, 5.15], [10, 5.15]]
for (const [level, expected] of SCENE_HEIGHT_CASES) {
  const got = sceneHeightUnits(level)
  check(`sceneHeightUnits(${level}) ≈ ${expected}`, Math.abs(got - expected) < 0.001, `got=${got}`)
}
check('sceneHeightUnits(8) 이상 — 안개 없음(fog 높이가 합에 안 들어감)', Math.abs(sceneHeightUnits(8) - Object.values(DISTRICTS).reduce((s, d) => s + d.heightUnits, 0)) < 0.001)

section('13b. districtOffsetUnits — 스택 불변식(레벨 무관하게 하위 구역 위치 고정)')
// "home은 항상 스택 맨 아래" — home 밴드의 바닥(offset+heightUnits)은
// 어떤 레벨이든 항상 sceneHeightUnits(level)과 정확히 같아야 한다(그
// 위에 무엇이 얼마나 쌓이든 home 아래엔 아무것도 없다는 사실 자체는
// 안 변함 — 브리프가 요구하는 "home은 항상 첫 화면/스택 맨 아래" 불변식).
for (const level of [1, 3, 5, 6, 7, 8, 10]) {
  const homeBottom = districtOffsetUnits('home', level) + DISTRICTS.home.heightUnits
  check(`districtOffsetUnits('home', ${level}) + home.heightUnits === sceneHeightUnits(${level})`, Math.abs(homeBottom - sceneHeightUnits(level)) < 0.001, `homeBottom=${homeBottom} scene=${sceneHeightUnits(level)}`)
}
// "lane 아래엔 항상 home 하나만" — lane이 보이는 모든 레벨(3,4,5,6,7,8)에서
// lane 밴드 바닥부터 씬 전체 바닥까지의 거리는 항상 home.heightUnits와
// 같아야 한다(위에 square/river/school/tower가 몇 개 더 쌓이든 lane과
// 그 아래 home의 상대 위치 자체는 흔들리지 않는다는 것 — "구역이 추가돼도
// 이미 있던 하위 구역끼리의 상대 위치는 고정"이라는 스펙 요구사항의
// 직접적인 자동화 검증).
for (const level of [3, 4, 5, 6, 7, 8]) {
  const laneBottom = districtOffsetUnits('lane', level) + DISTRICTS.lane.heightUnits
  const distToSceneBottom = sceneHeightUnits(level) - laneBottom
  check(`레벨${level} — lane 밴드 바닥에서 씬 바닥까지 거리 === home.heightUnits(1.15, 위에 뭐가 더 쌓여도 불변)`, Math.abs(distToSceneBottom - DISTRICTS.home.heightUnits) < 0.001, `got=${distToSceneBottom}`)
}
// 같은 논리를 square(레벨5-8)에도 적용 — square 아래엔 항상 lane+home.
for (const level of [5, 6, 7, 8]) {
  const squareBottom = districtOffsetUnits('square', level) + DISTRICTS.square.heightUnits
  const distToSceneBottom = sceneHeightUnits(level) - squareBottom
  const expected = DISTRICTS.lane.heightUnits + DISTRICTS.home.heightUnits
  check(`레벨${level} — square 밴드 바닥에서 씬 바닥까지 거리 === lane+home(${expected.toFixed(2)}, 위에 뭐가 더 쌓여도 불변)`, Math.abs(distToSceneBottom - expected) < 0.001, `got=${distToSceneBottom}`)
}
// districtOffsetUnits가 안 보이는 구역에도 크래시 없이 유한값을 반환.
check('districtOffsetUnits(안 열린 구역, 예 tower/level1) — 크래시 없이 유한값', Number.isFinite(districtOffsetUnits('tower', 1)))

section('13c. lotState — hidden/for-sale/built')
const LOT_STATE_CASES = [
  ['my-house', 1, [], 'built'],
  ['my-house', 10, [], 'built'],
  ['book-shop', 1, [], 'hidden'],
  ['book-shop', 2, [], 'hidden'],
  ['book-shop', 3, [], 'for-sale'],
  ['book-shop', 3, ['book-shop'], 'built'],
  ['cafe', 4, [], 'hidden'],
  ['cafe', 5, [], 'for-sale'],
  ['cafe', 5, ['cafe'], 'built'],
  ['bridge', 5, [], 'hidden'],
  ['bridge', 6, [], 'for-sale'],
  ['bridge', 6, ['bridge'], 'built'],
  ['english-school', 6, [], 'hidden'],
  ['english-school', 7, [], 'for-sale'],
  ['english-school', 7, ['english-school'], 'built'],
  ['clock-tower', 7, [], 'hidden'],
  ['clock-tower', 8, [], 'for-sale'],
  ['clock-tower', 8, ['clock-tower'], 'built'],
]
const lotById = Object.fromEntries(LOTS.map((l) => [l.id, l]))
for (const [id, level, owned, expected] of LOT_STATE_CASES) {
  const got = lotState(lotById[id], level, owned)
  check(`lotState(${id}, level=${level}, owned=${JSON.stringify(owned)}) === '${expected}'`, got === expected, `got=${got}`)
}
check('lotState(null, 1, []) — 크래시 없이 hidden', lotState(null, 1, []) === 'hidden')
check('lotState(로트, 레벨 인자 누락, []) — 기본 레벨1로 안전 처리(크래시 없음)', typeof lotState(lotById['my-house'], undefined, []) === 'string')

section('13d. anchorFor(x,y,level) — HOME_CELL 특수 케이스 + 레벨 인자')
const homeLotAnchorLv1 = anchorFor(HOME_CELL.x, HOME_CELL.y, 1)
const homeLotAnchorLv8 = anchorFor(HOME_CELL.x, HOME_CELL.y, 8)
check(
  'anchorFor(HOME_CELL, level1) — my-house 로트 자신의 위치(district home)로 풀림, [0,100] 범위',
  [homeLotAnchorLv1.leftPct, homeLotAnchorLv1.topPct, homeLotAnchorLv1.bottomPct].every((v) => Number.isFinite(v) && v >= 0 && v <= 100),
)
check(
  'anchorFor(HOME_CELL, level1) leftPct === 50(LOTS my-house.left)',
  homeLotAnchorLv1.leftPct === 50,
  JSON.stringify(homeLotAnchorLv1),
)
// home은 항상 스택 맨 아래이므로, 레벨이 올라가 구역이 더 열려도 my-house
// 로트 자체의 "밴드 내부" 상대 위치(= districtLocalToGlobal 이전의 로컬
// 값)는 절대 안 변한다(레벨과 무관한 상수, LOTS 데이터 자체가 레벨을
// 안 받음) — 다만 전역 %(scene 전체 대비)는 스택 전체 키가 달라지므로
// level1과 level8에서 달라지는 게 정상이다(§0 참고, 허용된 차이).
check(
  'anchorFor(HOME_CELL, level1) !== anchorFor(HOME_CELL, level8) — 전역 %는 레벨에 따라 달라짐(허용된 차이, 씬 전체 키가 달라지므로)',
  homeLotAnchorLv1.bottomPct !== homeLotAnchorLv8.bottomPct,
  JSON.stringify({ lv1: homeLotAnchorLv1, lv8: homeLotAnchorLv8 }),
)

// SPOT_MAP 47칸 전부 — level=8(전 구역 개방)에서 anchorFor가 유한하고
// [0,100] 범위인 leftPct/topPct/bottomPct를 반환하는지 전수 검사.
let allSpotAnchorsValid = true
for (const key of Object.keys(SPOT_MAP)) {
  const [sx, sy] = key.split(',').map(Number)
  const a = anchorFor(sx, sy, 8)
  if (![a.leftPct, a.topPct, a.bottomPct].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) allSpotAnchorsValid = false
}
check('SPOT_MAP 47칸 전부 — anchorFor(x,y,8)이 유한/범위 내 값 반환', allSpotAnchorsValid)

// districtForCell — HOME_CELL과 대표 스팟 몇 개.
check("districtForCell(HOME_CELL.x, HOME_CELL.y) === 'home'", districtForCell(HOME_CELL.x, HOME_CELL.y) === 'home')
check("districtForCell(0,3) === 'lane'(SPOT_MAP 0,3)", districtForCell(0, 3) === 'lane')
check("districtForCell(5,5) === 'tower'(SPOT_MAP 5,5)", districtForCell(5, 5) === 'tower')

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
