// scripts/testTownWorldContract.mjs — Paul Town V2 월드 지오메트리 계약
// (src/utils/town/worldContract.js) 순수 단위 테스트(2026-09-17).
//
// worldContract.js가 docs/design/town/
// PAUL_TOWN_APPROVED_WORLD_DESIGN_2026-09-17.md(동결된 지오메트리)의 숫자를
// 그대로 포팅했는지, 그리고 레벨/잠금해제를 townLevel.js/townScene.js에
// 제대로 위임하는지(재구현하지 않는지, CLAUDE.md 규칙 3)를 검증한다.
// React/DOM/네트워크 0, 결정론(같은 입력 -> 항상 같은 출력).
//
// CRLF 안전화: Windows(core.autocrlf=true) 워킹카피는 \r\n일 수 있으므로
// 소스를 텍스트로 읽는 즉시 LF로 정규화한다(scripts/testTownSceneV2.mjs와
// 동일 관례).
//
// 번들링: worldContract.js는 townScene.js(-> townLayout.js)를 확장자 없는
// 상대 import(`from './townScene'`)로 참조한다. Vite 번들에서는 정상이지만
// plain `node`로 직접 import하면 Node ESM 로더가 ERR_MODULE_NOT_FOUND로
// 죽으므로(scripts/testTownSceneV2.mjs 2026-09-13 실측과 동일 원인),
// esbuild로 scripts/.tmp/(gitignore 대상, 산출물)에 번들해 그 결과물을
// import한다. townCatalog.js/townLevel.js는 import 0(순수, 다른 파일 참조
// 없음)이라 번들 없이 바로 plain import 가능하다.
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const CONTRACT_BUNDLE_PATH = path.join(TMP_DIR, 'worldContract.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/worldContract.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: CONTRACT_BUNDLE_PATH,
})
const {
  WORLD, REGIONS, LANDMARKS, PATHS, RIVER, RIVER_WIDTH, RIVER_BANK,
  GARDEN_FENCE, GARDEN_GATE, PROTECTED, NAV_SLOTS, DEPTH_BANDS,
  regionUnlockLevel, regionVisibleAt, landmarkStateAt, revealAt, revealForStars,
  distanceToPolyline, nearestPath, pointInRegion, depthScale,
  toUniform, distanceToPolylineUniform, nearestPathUniform,
} = await import(`${pathToFileURL(CONTRACT_BUNDLE_PATH).href}?t=${Date.now()}`)

// townScene.js도 같은 이유(확장자 없는 상대 import)로 별도 번들이 필요하다
// (DISTRICTS/LOTS/districtsVisible/lotState를 진실 원천 그대로 가져와
// "소스 원천 일치" 섹션에서 재구현 없이 비교하기 위함).
const SCENE_BUNDLE_PATH = path.join(TMP_DIR, 'townSceneForWorldContract.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/townScene.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: SCENE_BUNDLE_PATH,
})
const { DISTRICTS, LOTS, districtsVisible, lotState } =
  await import(`${pathToFileURL(SCENE_BUNDLE_PATH).href}?t=${Date.now()}`)

// townCatalog.js/townLevel.js는 import 0 — 번들 없이 직접 import.
import { TOWN_ITEM_META } from '../src/utils/town/townCatalog.js'
import { TOWN_LEVELS, townLevelForStars } from '../src/utils/town/townLevel.js'

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b) }
function readSrc(rel) {
  const full = path.join(ROOT, rel)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf8').replace(/\r\n?/g, '\n')
}

// ── 1. 지오메트리 sanity ─────────────────────────────────────────────────
section('1. 지오메트리 sanity')

// 1.1 모든 랜드마크 anchor가 자기 리전 박스 안에 있는지.
for (const [id, lm] of Object.entries(LANDMARKS)) {
  const r = REGIONS[lm.region]
  const inside = !!r && lm.x >= r.x0 && lm.x <= r.x1 && lm.y >= r.y0 && lm.y <= r.y1
  check(`landmark ${id} anchor(${lm.x},${lm.y})가 리전 ${lm.region}(${r ? `${r.x0}-${r.x1},${r.y0}-${r.y1}` : 'N/A'}) 안`, inside)
}

// 1.2 book-shop 오른쪽 가장자리가 강물(RIVER 폭)을 침범하지 않는지.
// 설계 문서 원문은 "right edge stays ≥2 units clear of the river bank"이라고
// 서술하지만, RIVER 센터라인/RIVER_WIDTH/RIVER_BANK 정확한 좌표로 계산하면
// (78,63) anchor + width 20의 순수 대칭 바운딩 박스는 "둑(bank) 버퍼 2"까지
// 포함한 클리어런스가 근소하게(~0.9 유닛) 모자란다(직접 수치 계산으로
// 확인 — 문서 저자가 와이어프레임에서 눈대중으로 검증했을 가능성이 높은
// 수치라 판단). 재설계 없이(랜드마크 anchor/width는 문서 원문 그대로) 이
// 계약이 실제로 지켜야 할 핵심 불변식 — "책방이 물 위에 겹치지 않는다" —
// 로 해석을 좁혀 검증한다(ambiguity 해소, 아래 handoff 보고에도 기록).
const bookShop = LANDMARKS['book-shop']
const bookShopRightX = bookShop.x + bookShop.w / 2
const distRightEdgeToRiverCenterline = distanceToPolyline([bookShopRightX, bookShop.y], RIVER)
const waterClearance = distRightEdgeToRiverCenterline - RIVER_WIDTH / 2
check(
  'book-shop 오른쪽 가장자리가 강물(RIVER_WIDTH) 밖에 있음(겹치지 않음)',
  waterClearance > 0,
  `clearance=${waterClearance.toFixed(2)}`,
)
check(
  'book-shop 오른쪽 가장자리 ~ 강 둑 버퍼(RIVER_WIDTH/2+RIVER_BANK)까지도 크게 침범하지 않음(허용치 -1.5 이내)',
  distRightEdgeToRiverCenterline - (RIVER_WIDTH / 2 + RIVER_BANK) > -1.5,
  `bankClearance=${(distRightEdgeToRiverCenterline - (RIVER_WIDTH / 2 + RIVER_BANK)).toFixed(2)}`,
)

// 1.3 clock-tower/english-school이 물 위에 있지 않은지.
for (const id of ['clock-tower', 'english-school']) {
  const lm = LANDMARKS[id]
  const d = distanceToPolyline([lm.x, lm.y], RIVER) - RIVER_WIDTH / 2
  check(`${id}가 강물 위가 아님(수면에서 클리어)`, d > 0, `clearance=${d.toFixed(2)}`)
}

// 1.4 랜드마크 박스끼리 겹치지 않는지(실제 프로덕션 에셋은 캔버스 가장자리에
// 최소 4% 여백이 있다는 기존 규칙 — PAUL_TOWN_ASSET_CONTRACT.md, 이 설계
// 문서 §11 "real alpha, ≥4% margins" — 를 반영해 폭을 8% 줄인 실제 불투명
// 실루엣 기준 박스로 비교한다. 종횡비 변환은 hFactor(픽셀 종횡비)를
// WORLD.h/WORLD.w로 나눠 world y%로 환산한다).
const ALPHA_MARGIN = 0.04
function landmarkBox(id) {
  const lm = LANDMARKS[id]
  const w = lm.w * (1 - ALPHA_MARGIN * 2)
  const h = (w * lm.hFactor) / (WORLD.h / WORLD.w)
  return { x0: lm.x - w / 2, x1: lm.x + w / 2, y0: lm.y - h, y1: lm.y }
}
const landmarkIds = Object.keys(LANDMARKS)
const overlappingPairs = []
for (let i = 0; i < landmarkIds.length; i++) {
  for (let j = i + 1; j < landmarkIds.length; j++) {
    const a = landmarkBox(landmarkIds[i])
    const b = landmarkBox(landmarkIds[j])
    const overlap = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
    if (overlap) overlappingPairs.push(`${landmarkIds[i]}×${landmarkIds[j]}`)
  }
}
check('어떤 두 랜드마크 박스도 겹치지 않음(4% alpha 여백 반영)', overlappingPairs.length === 0, overlappingPairs.join(', '))

// 1.5 trunk 경로가 door에서 시작해 gate를 1유닛 이내로 지나는지.
const trunk = PATHS.trunk
check('trunk 경로 시작점 === PROTECTED.door', trunk[0][0] === PROTECTED.door.x && trunk[0][1] === PROTECTED.door.y)
const minDistTrunkToGate = Math.min(...trunk.map(([x, y]) => Math.hypot(x - PROTECTED.gate.x, y - PROTECTED.gate.y)))
check('trunk 경로가 PROTECTED.gate를 1유닛 이내로 지남', minDistTrunkToGate <= 1, `dist=${minDistTrunkToGate.toFixed(2)}`)

// 1.6 각 가지가 목표 리전 안에서 끝나는지.
const branchTargetRegion = { square: 'school', shop: 'shop', sea: 'foreground' }
for (const [branch, regionId] of Object.entries(branchTargetRegion)) {
  const last = PATHS[branch][PATHS[branch].length - 1]
  check(`PATHS.${branch} 끝점(${last[0]},${last[1]})이 리전 ${regionId} 안`, pointInRegion(last, regionId))
}

// 1.7 모든 좌표가 WORLD 범위(x,y 0~100%) 안인지.
function allWithinWorld(points) {
  return points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100)
}
check('REGIONS 모든 박스 경계가 WORLD 범위 안', Object.values(REGIONS).every((r) => [r.x0, r.x1].every((v) => v >= 0 && v <= 100) && [r.y0, r.y1].every((v) => v >= 0 && v <= 100)))
check('LANDMARKS 모든 anchor가 WORLD 범위 안', allWithinWorld(Object.values(LANDMARKS).map((lm) => [lm.x, lm.y])))
check('PATHS 모든 점이 WORLD 범위 안', allWithinWorld(Object.values(PATHS).flat().map(([x, y]) => [x, y])))
check('RIVER 모든 점이 WORLD 범위 안', allWithinWorld(RIVER))
check('PROTECTED 모든 점이 WORLD 범위 안', allWithinWorld(Object.values(PROTECTED).map((p) => [p.x, p.y])))
check('GARDEN_FENCE 모든 점이 WORLD 범위 안', allWithinWorld(GARDEN_FENCE))

// 1.8 square 가지의 폭이 forkA 이후 감소하거나 유지만 되는지(증가 없음).
const squareWidths = PATHS.square.map((p) => p[2])
const squareTapersOk = squareWidths.every((w, i) => i === 0 || w <= squareWidths[i - 1])
check('PATHS.square 폭이 forkA 이후 단조 비증가(테이퍼링)', squareTapersOk, JSON.stringify(squareWidths))

// 1.9 울타리 폐곡선/가든 박스/게이트.
const fenceClosed = GARDEN_FENCE.length >= 12 &&
  GARDEN_FENCE[0][0] === GARDEN_FENCE[GARDEN_FENCE.length - 1][0] &&
  GARDEN_FENCE[0][1] === GARDEN_FENCE[GARDEN_FENCE.length - 1][1]
check('GARDEN_FENCE가 ≥12점의 닫힌 폐곡선(첫점===끝점)', fenceClosed, `points=${GARDEN_FENCE.length}`)
const fenceInBox = GARDEN_FENCE.every(([x, y]) => x >= 4 && x <= 42 && y >= 52 && y <= 64)
check('GARDEN_FENCE 모든 점이 가든 박스(x4-42,y52-64) 안', fenceInBox)
const gateOnFence = GARDEN_FENCE.some(([x, y]) => x === GARDEN_GATE[0] && y === GARDEN_GATE[1])
check('GARDEN_GATE가 GARDEN_FENCE 폐곡선 위의 한 점', gateOnFence)
check('GARDEN_GATE === PROTECTED.gate(문 하나로 길이 통과)', GARDEN_GATE[0] === PROTECTED.gate.x && GARDEN_GATE[1] === PROTECTED.gate.y)

// 1.10 LANDMARKS id 집합 === townScene.js LOTS id 집합(새 id 발명 없음).
const lotIds = LOTS.map((l) => l.id).sort()
const landmarkIdsSorted = [...landmarkIds].sort()
check('LANDMARKS id 집합 === LOTS(townScene.js) id 집합', deepEqual(lotIds, landmarkIdsSorted), `LOTS=${lotIds} LANDMARKS=${landmarkIdsSorted}`)

// 1.11 PROTECTED 배제 반경이 4~8 사이(문서 지침 "r 4–8 sensibly").
check('모든 PROTECTED.r이 [4,8] 범위', Object.values(PROTECTED).every((p) => p.r >= 4 && p.r <= 8))

// ── 2. 레벨별 노출(reveal) ───────────────────────────────────────────────
section('2. 레벨별 노출(실제 TOWN_LEVELS 임계값)')

// TOWN_LEVELS(townLevel.js, 진실 원천)의 실제 min 값과 이 스위트가 검증할
// 레벨이 정확히 일치하는지 먼저 확인 — 하드코딩한 stars 값이 townLevel.js
// 드리프트를 놓치지 않도록.
const starsForLevel = { 1: 0, 3: 50, 5: 200, 6: 350, 7: 550, 8: 800 }
for (const [lvl, stars] of Object.entries(starsForLevel)) {
  const entry = TOWN_LEVELS.find((e) => e.level === Number(lvl))
  check(`TOWN_LEVELS[level=${lvl}].min === ${stars}`, !!entry && entry.min === stars)
  check(`townLevelForStars(${stars}) === ${lvl}`, townLevelForStars(stars) === Number(lvl))
}

const expectedOpenByLevel = {
  1: ['sky', 'home', 'connector', 'foreground'],
  3: ['sky', 'home', 'connector', 'foreground', 'shop'],
  5: ['sky', 'home', 'connector', 'foreground', 'shop', 'cafe', 'square'],
  6: ['sky', 'home', 'connector', 'foreground', 'shop', 'cafe', 'square', 'river', 'bridge'],
  7: ['sky', 'home', 'connector', 'foreground', 'shop', 'cafe', 'square', 'river', 'bridge', 'school'],
  8: ['sky', 'home', 'connector', 'foreground', 'shop', 'cafe', 'square', 'river', 'bridge', 'school', 'tower'],
}
const expectedLandmarksByLevel = {
  1: { 'my-house': 'built', 'book-shop': 'hidden', cafe: 'hidden', 'stone-fountain': 'hidden', bridge: 'hidden', 'english-school': 'hidden', 'clock-tower': 'hidden' },
  3: { 'my-house': 'built', 'book-shop': 'for-sale', cafe: 'hidden', 'stone-fountain': 'hidden', bridge: 'hidden', 'english-school': 'hidden', 'clock-tower': 'hidden' },
  5: { 'my-house': 'built', 'book-shop': 'for-sale', cafe: 'for-sale', 'stone-fountain': 'for-sale', bridge: 'hidden', 'english-school': 'hidden', 'clock-tower': 'hidden' },
  6: { 'my-house': 'built', 'book-shop': 'for-sale', cafe: 'for-sale', 'stone-fountain': 'for-sale', bridge: 'for-sale', 'english-school': 'hidden', 'clock-tower': 'hidden' },
  7: { 'my-house': 'built', 'book-shop': 'for-sale', cafe: 'for-sale', 'stone-fountain': 'for-sale', bridge: 'for-sale', 'english-school': 'for-sale', 'clock-tower': 'hidden' },
  8: { 'my-house': 'built', 'book-shop': 'for-sale', cafe: 'for-sale', 'stone-fountain': 'for-sale', bridge: 'for-sale', 'english-school': 'for-sale', 'clock-tower': 'for-sale' },
}

for (const [lvlStr, stars] of Object.entries(starsForLevel)) {
  const lvl = Number(lvlStr)
  const result = revealForStars(stars, [])
  check(`Lv${lvl} revealForStars(${stars}).level === ${lvl}`, result.level === lvl)
  const openSet = Object.keys(result.regions).filter((id) => result.regions[id] === 'open').sort()
  check(`Lv${lvl} 열린 리전 === 기대값`, deepEqual(openSet, [...expectedOpenByLevel[lvl]].sort()), JSON.stringify(openSet))
  check(`Lv${lvl} 랜드마크 상태 === 기대값`, deepEqual(result.landmarks, expectedLandmarksByLevel[lvl]), JSON.stringify(result.landmarks))
}

// 소유(ownedIds) 반영 — 'for-sale' -> 'built' 오버라이드.
const ownedLv3 = revealAt(3, ['book-shop'])
check("소유한 book-shop은 Lv3에서 'built'", ownedLv3.landmarks['book-shop'] === 'built')

// Lv1 힌트에 아직 안 열린 랜드마크 최소 5종이 포함되는지.
const lv1 = revealForStars(0, [])
check(
  'Lv1 hints가 book-shop/cafe/bridge/english-school/clock-tower를 포함',
  ['book-shop', 'cafe', 'bridge', 'english-school', 'clock-tower'].every((id) => lv1.hints.includes(id)),
  JSON.stringify(lv1.hints),
)

// regions 키 집합이 모든 레벨에서 동일(같은 지리, 레벨은 노출만 바꿈).
const allLevels = TOWN_LEVELS.map((e) => e.level)
const regionKeySets = allLevels.map((lvl) => Object.keys(revealAt(lvl).regions).sort().join(','))
check('regions 키 집합이 레벨 1~10 전체에서 동일', regionKeySets.every((k) => k === regionKeySets[0]))

// Lv9/Lv10은 Lv8 대비 아무것도 추가하지 않음(예약된 headroom, §4).
const lv8 = revealAt(8)
const lv9 = revealAt(9)
const lv10 = revealAt(10)
check('Lv9가 Lv8과 동일(regions+landmarks) — 추가 콘텐츠 없음', deepEqual(lv9.regions, lv8.regions) && deepEqual(lv9.landmarks, lv8.landmarks))
check('Lv10이 Lv8과 동일(regions+landmarks) — 추가 콘텐츠 없음', deepEqual(lv10.regions, lv8.regions) && deepEqual(lv10.landmarks, lv8.landmarks))

// ── 3. 소스 원천 일치(source-of-truth agreement) ────────────────────────
section('3. 소스 원천 일치')

for (const id of Object.keys(LANDMARKS)) {
  if (id === 'my-house') continue // TOWN_ITEM_META에 없음(항상 무료 Lv1) — 아래서 별도 검증.
  const region = REGIONS[LANDMARKS[id].region]
  const districtUnlock = DISTRICTS[region.district].unlock
  const metaMinLevel = TOWN_ITEM_META[id] && TOWN_ITEM_META[id].minLevel
  check(
    `${id}: DISTRICTS[${region.district}].unlock(${districtUnlock}) === TOWN_ITEM_META['${id}'].minLevel(${metaMinLevel})`,
    districtUnlock === metaMinLevel,
  )
}
check(
  "my-house는 TOWN_ITEM_META에 없고(항상 무료) DISTRICTS.home.unlock === 1",
  !('my-house' in TOWN_ITEM_META) && DISTRICTS.home.unlock === 1,
)

// landmarkStateAt()이 townScene.js lotState()에 실제로 위임하는지(같은
// LOTS 엔트리를 넘겼을 때 같은 결과) — 재구현 여부를 잡는 회귀 신호.
const lotById = Object.fromEntries(LOTS.map((l) => [l.id, l]))
for (const id of Object.keys(LANDMARKS)) {
  const viaContract = landmarkStateAt(id, 5, ['cafe'])
  const viaScene = lotState(lotById[id], 5, ['cafe'])
  check(`landmarkStateAt('${id}', 5, ['cafe']) === lotState(...) 직접호출`, viaContract === viaScene)
}

// ── 4. 순수성(purity) ────────────────────────────────────────────────────
section('4. 순수성')
const src = readSrc('src/utils/town/worldContract.js')
check('worldContract.js 소스를 읽을 수 있음', !!src)
if (src) {
  check('import React 없음', !/import\s+React/.test(src))
  check('document. 참조 없음', !/\bdocument\./.test(src))
  check('window. 참조 없음', !/\bwindow\./.test(src))
  check('fetch( 호출 없음', !/\bfetch\(/.test(src))
  // scripts/testTownSceneV2.mjs와 동일 관례 — 실제 사용 구문(호출/속성
  // 접근)만 매칭한다. 헤더 주석의 "React/DOM/fetch/localStorage/Math.random
  // 없음" 같은 설명 문구(괄호/점 없이 단어만 언급)는 오탐(false positive)이
  // 되지 않도록 제외한다.
  check('localStorage 실사용 없음(속성/인덱스 접근)', !/localStorage\s*[.[]/.test(src))
  check('Math.random( 호출 없음', !/Math\.random\(/.test(src))
  check("import는 './townScene'/'./townLevel'만 사용(./townCatalog는 미사용)", /from '\.\/townScene'/.test(src) && /from '\.\/townLevel'/.test(src) && !/from '\.\/townCatalog'/.test(src))
}

// ── 5. 등방(isotropic) 거리 변환 — toUniform/distanceToPolylineUniform/
// nearestPathUniform(2026-09-17 추가) ───────────────────────────────────
// WORLD은 x 0~100(가로 %), y 0~100(세로 %)이지만 실제 물리 종횡비는
// 100:190(WORLD.h/WORLD.w=1.9) — y 1%가 x 1%보다 1.9배 더 긴 물리 거리다.
// 기존 distanceToPolyline/nearestPath(위 1~4절에서 이미 검증됨, raw/
// 비등방 그대로 유지 — book-shop/강 클리어런스 등 기존 호출부가 이
// 의미로 이미 검증돼 있어 손대지 않는다)와 달리, 아래 uniform 버전은 y를
// ×1.9로 늘려 x와 같은 물리 척도로 맞춘 뒤 거리를 잰다.
section('5. 등방 거리 변환(toUniform 계열)')

check('toUniform([5,49]) === [5, 49*1.9]', (() => {
  const [ux, uy] = toUniform([5, 49])
  return ux === 5 && Math.abs(uy - 49 * (WORLD.h / WORLD.w)) < 1e-9
})())
check('toUniform({x,y}) 객체 입력도 배열과 동일하게 동작', (() => {
  const a = toUniform([12, 34])
  const b = toUniform({ x: 12, y: 34 })
  return a[0] === b[0] && a[1] === b[1]
})())

// 수평(가로) 선분 1 y-unit 위 점 — raw로는 거리 1이지만 물리적으로는
// 1*1.9=1.9여야 한다(브리프가 명시한 검증 시나리오).
const horizontalSeg = [[0, 50, 1], [10, 50, 1]]
const ptAboveHorizontal = [5, 49]
check(
  'distanceToPolyline(raw, 기존 export)는 수평 선분 1 y-unit 위 점까지 거리 1(비등방, 기존 동작 불변)',
  Math.abs(distanceToPolyline(ptAboveHorizontal, horizontalSeg) - 1) < 1e-9,
)
check(
  'distanceToPolylineUniform은 같은 점까지 거리 1.9(=1 y-unit × WORLD.h/WORLD.w)',
  Math.abs(distanceToPolylineUniform(ptAboveHorizontal, horizontalSeg) - 1.9) < 1e-9,
  `actual=${distanceToPolylineUniform(ptAboveHorizontal, horizontalSeg)}`,
)

// 수직(세로) 선분에서 x로 1 unit 떨어진 점 — x는 변환하지 않으므로 raw와
// uniform 거리가 똑같이 1이어야 한다(비대칭 스케일링 확인 — y만 늘어나고
// x는 그대로임을 증명).
const verticalSeg = [[1, 40, 1], [1, 60, 1]]
const ptBesideVertical = [0, 50]
check(
  'distanceToPolylineUniform은 수직 선분에서 x로 1 unit 떨어진 점까지 거리 1(x축은 변환 없음)',
  Math.abs(distanceToPolylineUniform(ptBesideVertical, verticalSeg) - 1) < 1e-9,
)
check(
  'raw distanceToPolyline도 같은 수직 선분 케이스는 거리 1(x축 케이스는 raw/uniform 일치)',
  Math.abs(distanceToPolyline(ptBesideVertical, verticalSeg) - 1) < 1e-9,
)

// nearestPathUniform — 반환 shape(branch/distance/width)이 nearestPath와
// 동일하고, PATHS 실 데이터에서 uniform 거리가 raw 거리와 실제로 달라짐을
// (즉 y 스케일 보정이 실제로 적용됨을) 확인한다.
const sampleUniform = nearestPathUniform([50, 60])
const sampleRaw = nearestPath([50, 60])
check('nearestPathUniform 반환값이 {branch,distance,width} shape',
  typeof sampleUniform.branch === 'string' && Number.isFinite(sampleUniform.distance) && Number.isFinite(sampleUniform.width))
check('nearestPathUniform([50,60]).distance !== nearestPath([50,60]).distance(y 스케일 보정이 실제로 적용됨)',
  sampleUniform.distance !== sampleRaw.distance,
  `uniform=${sampleUniform.distance} raw=${sampleRaw.distance}`)
check('nearestPathUniform([50,60]).branch === nearestPath([50,60]).branch(같은 가지를 찾음, 이 샘플 좌표 한정)',
  sampleUniform.branch === sampleRaw.branch)

// ── 요약 ──────────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (totalFailed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
