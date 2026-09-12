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
const anchorKeys = new Set(allAnchors.map((a) => `${a.leftPct},${a.topPct}`))
check('48칸의 (leftPct,topPct) 조합이 전부 서로 다름(칸마다 고유 앵커)', anchorKeys.size === 48, `size=${anchorKeys.size}`)

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

// ── 9. Kinney-shaped fixture — starsEarned=60 → 레벨3 ────────────────────
section('9. Kinney-shaped fixture(starsEarned=60)')
const kinneyGoal = nearGoal(catalog, 60)
check('nearGoal(catalog, 60).nextLevel === 4', kinneyGoal.nextLevel === 4, JSON.stringify(kinneyGoal))
check('nearGoal(catalog, 60).remaining === 40', kinneyGoal.remaining === 40, JSON.stringify(kinneyGoal))
check('nearGoal(catalog, 60).names에 "강아지" 포함', kinneyGoal.names.includes('강아지'), JSON.stringify(kinneyGoal.names))
check('nearGoal(catalog, 60).names에 "부엉이" 포함', kinneyGoal.names.includes('부엉이'), JSON.stringify(kinneyGoal.names))

// ── 10. freeAnchors — HOME/점유 칸 제외, null 허용 ───────────────────────
section('10. freeAnchors')
const freeEmpty = freeAnchors([], 'idle')
check('freeAnchors([], idle) — 48-1(HOME)=47칸', freeEmpty.length === 47, `len=${freeEmpty.length}`)
check('freeAnchors([], idle) — HOME_CELL 미포함', !freeEmpty.some((p) => p.x === HOME_CELL.x && p.y === HOME_CELL.y))

const freeWithPlacements = freeAnchors([{ x: 1, y: 1 }, null, { x: 2, y: 2 }], 'placing')
check('freeAnchors(placements 2개+null, placing) — 48-1-2=45칸', freeWithPlacements.length === 45, `len=${freeWithPlacements.length}`)
check('freeAnchors — (1,1) 점유 칸 제외됨', !freeWithPlacements.some((p) => p.x === 1 && p.y === 1))
check('freeAnchors — (2,2) 점유 칸 제외됨', !freeWithPlacements.some((p) => p.x === 2 && p.y === 2))

const freeAllNull = freeAnchors([null, null, undefined], 'idle')
check('freeAnchors(전부 null/undefined) — 크래시 없이 47칸', freeAllNull.length === 47, `len=${freeAllNull.length}`)

const freeGarbageInput = freeAnchors(undefined, 'idle')
check('freeAnchors(undefined) — 크래시 없이 47칸(방어적 기본값)', freeGarbageInput.length === 47, `len=${freeGarbageInput.length}`)

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

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
