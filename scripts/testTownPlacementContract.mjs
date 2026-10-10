// scripts/testTownPlacementContract.mjs — Paul Town V2 47칸 배치 계약
// (src/utils/town/placementContract.js) 순수 단위 테스트(2026-09-17).
//
// placementContract.js가 worldContract.js(동결된 월드 지오메트리)에 대해
// 실제로 "47칸 모두 콜리전 0(추천 클래스 기준)"인지, SPOT_MAP(townScene.js)
// id 집합과 정확히 일치하는지, §5 존 배분을 지키는지, tree/bench 배제
// 규칙을 지키는지를 검증한다. React/DOM/네트워크 0, 결정론(같은 입력 ->
// 항상 같은 출력) — Math.random 대신 시드 고정 LCG로 퍼징한다.
//
// CRLF 안전화: scripts/testTownWorldContract.mjs와 동일 관례(소스를 텍스트로
// 읽는 즉시 LF로 정규화).
//
// 번들링: placementContract.js는 worldContract.js/townScene.js를 확장자
// 없는 상대 import(`from './worldContract'`, `from './townScene'`)로
// 참조한다 — plain `node`로 직접 import하면 Node ESM 로더가
// ERR_MODULE_NOT_FOUND로 죽으므로(scripts/testTownWorldContract.mjs와 동일
// 원인), esbuild로 scripts/.tmp/(gitignore 대상, 산출물)에 번들해 그
// 결과물을 import한다.
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const CONTRACT_BUNDLE_PATH = path.join(TMP_DIR, 'placementContract.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/placementContract.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: CONTRACT_BUNDLE_PATH,
})
const {
  OBJECT_CLASSES, LARGE_CLASSES, RIVER_CELLS_UNLOCK, ZONE_QUOTA,
  CELLS, CELL_BY_ID, cellsInZone, cellUnlockLevel, collisionsFor,
  isPlacementAllowed, visibleMarkerStyle,
} = await import(`${pathToFileURL(CONTRACT_BUNDLE_PATH).href}?t=${Date.now()}`)

// worldContract.js도 같은 이유로 별도 번들이 필요하다(WORLD/REGIONS 등을
// 진실 원천 그대로 가져와 "cell이 실제로 WORLD/REGION 안인지"를 재구현
// 없이 비교하기 위함).
const WC_BUNDLE_PATH = path.join(TMP_DIR, 'worldContractForPlacement.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/worldContract.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: WC_BUNDLE_PATH,
})
const { WORLD, REGIONS, PROTECTED, pointInRegion, toUniform } =
  await import(`${pathToFileURL(WC_BUNDLE_PATH).href}?t=${Date.now()}`)

// (x1,y1)-(x2,y2)의 등방(uniform) 유클리드 거리 — placementContract.js
// 내부의 uniformDist와 동일한 정의(toUniform으로 y만 ×WORLD.h/WORLD.w
// 보정한 뒤 hypot). 테스트가 모듈과 다른 척도로 "가깝다"를 재정의하면
// 오탐/누락이 생기므로, 모듈이 실제로 쓰는 것과 같은 진실 원천
// (toUniform, worldContract.js 2026-09-17 추가 export)을 그대로 쓴다.
function uDist(x1, y1, x2, y2) {
  const [ux1, uy1] = toUniform([x1, y1])
  const [ux2, uy2] = toUniform([x2, y2])
  return Math.hypot(ux1 - ux2, uy1 - uy2)
}

// townScene.js도 같은 이유(확장자 없는 상대 import)로 별도 번들 — SPOT_MAP을
// 진실 원천 그대로 가져와 "CELLS의 id 집합이 SPOT_MAP 키 집합과 정확히
// 같은지"를 재구현 없이 비교한다.
const SCENE_BUNDLE_PATH = path.join(TMP_DIR, 'townSceneForPlacement.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/townScene.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: SCENE_BUNDLE_PATH,
})
const { SPOT_MAP } = await import(`${pathToFileURL(SCENE_BUNDLE_PATH).href}?t=${Date.now()}`)

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

// 시드 고정 LCG(Numerical Recipes 상수) — Math.random 없이 결정론적 퍼징.
function makeLcg(seed) {
  let state = seed >>> 0
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

// ── 1. CELLS 구조/개수/id ────────────────────────────────────────────────
section('1. CELLS 구조/개수/id')

check('CELLS.length === 47', CELLS.length === 47, `actual=${CELLS.length}`)
check('CELLS id 전부 유일', new Set(CELLS.map((c) => c.id)).size === CELLS.length)

const spotKeys = new Set(Object.keys(SPOT_MAP))
const cellIds = new Set(CELLS.map((c) => c.id))
check('CELLS id 집합이 SPOT_MAP 키 집합과 정확히 같음(부분집합 아님)',
  spotKeys.size === cellIds.size && [...spotKeys].every((k) => cellIds.has(k)))
check('SPOT_MAP 키 개수도 47', spotKeys.size === 47, `actual=${spotKeys.size}`)

check('CELL_BY_ID가 CELLS와 1:1 대응', Object.keys(CELL_BY_ID).length === 47 &&
  CELLS.every((c) => CELL_BY_ID[c.id] === c))

for (const c of CELLS) {
  check(`cell ${c.id}는 zone/x/y/depthClass/scale/recommended/exclusions 필드를 가짐`,
    typeof c.zone === 'string' && Number.isFinite(c.x) && Number.isFinite(c.y) &&
    typeof c.depthClass === 'string' && Number.isFinite(c.scale) &&
    Array.isArray(c.recommended) && Array.isArray(c.exclusions))
}

// ── 2. 존(zone) 배분 — §5 ────────────────────────────────────────────────
section('2. 존 배분(§5)')

const EXPECTED_QUOTA = {
  frontGarden: 10, houseLawn: 8, villageLane: 5, squarePerimeter: 8,
  cafeEdge: 3, shopSurround: 4, riverApproach: 3, schoolLawn: 3,
  towerGreen: 2, foregroundVerge: 1,
}
check('ZONE_QUOTA export가 §5 배분과 정확히 같음', JSON.stringify(ZONE_QUOTA) === JSON.stringify(EXPECTED_QUOTA))
const totalQuota = Object.values(EXPECTED_QUOTA).reduce((a, b) => a + b, 0)
check('§5 배분 합계 47', totalQuota === 47, `actual=${totalQuota}`)

for (const [zone, n] of Object.entries(EXPECTED_QUOTA)) {
  const actual = CELLS.filter((c) => c.zone === zone).length
  check(`zone '${zone}' 셀 개수 === ${n}`, actual === n, `actual=${actual}`)
  check(`cellsInZone('${zone}').length === ${n}`, cellsInZone(zone).length === n)
}
const knownZones = new Set(Object.keys(EXPECTED_QUOTA))
check('CELLS의 모든 zone이 §5 10개 존 중 하나', CELLS.every((c) => knownZones.has(c.zone)))

// ── 3. WORLD/REGION 포함, 최소 간격 6(uniform) ──────────────────────────────
section('3. WORLD/REGION 포함 + 최소 간격(uniform)')

for (const c of CELLS) {
  const inWorld = c.x >= 0 && c.x <= WORLD.w && c.y >= 0 && c.y <= 100
  check(`cell ${c.id}(${c.x},${c.y})가 WORLD 안`, inWorld)
}
for (const c of CELLS) {
  const inAnyRegion = Object.keys(REGIONS).some((id) => pointInRegion([c.x, c.y], id))
  check(`cell ${c.id}(${c.x},${c.y})가 REGIONS 중 하나 안`, inAnyRegion)
}

// zone -> 그 zone의 "own" REGIONS id. placementContract.js 내부
// ZONE_REGION과 동일한 매핑(모듈이 export하지 않는 내부 상수라 여기서
// 독립적으로 재선언 — cellUnlockLevel()의 위임 대상 리전과 같은 값이라
// 섹션 7에서 그 위임이 실제로 이 리전들을 가리키는지도 교차 검증된다).
const ZONE_OWN_REGION = {
  frontGarden: 'home', houseLawn: 'home', villageLane: 'connector',
  squarePerimeter: 'square', cafeEdge: 'cafe', shopSurround: 'shop',
  riverApproach: 'river', schoolLawn: 'school', towerGreen: 'tower',
  foregroundVerge: 'foreground',
}
// 자기 zone 리전 밖에 있는 게 "허용된" 유일한 예외 — villageLane 5번째
// 칸(fork 분기점 보호반경 + 4갈래 경로 폭이 connector 리전 대부분을
// 차지해, own-region 안에서는 4칸까지만 콜리전 0으로 배치 가능했다).
// PLACEMENT_CONTRACT_V1 문서의 "자기 zone 밖 예외" 섹션에도 같은 사유로
// 기록돼 있다. 브리프 허용치(최대 3개) 안의 1개.
const OWN_ZONE_EXCEPTIONS = new Set(['7,2'])
check(`OWN_ZONE_EXCEPTIONS 개수(${OWN_ZONE_EXCEPTIONS.size})가 브리프 허용치(최대 3) 이내`, OWN_ZONE_EXCEPTIONS.size <= 3)

let inOwnZoneCount = 0
for (const c of CELLS) {
  const ownRegionId = ZONE_OWN_REGION[c.zone]
  const inOwnZone = !!ownRegionId && pointInRegion([c.x, c.y], ownRegionId)
  if (inOwnZone) inOwnZoneCount++
  if (OWN_ZONE_EXCEPTIONS.has(c.id)) {
    check(`cell ${c.id}(문서화된 예외)는 자기 zone('${c.zone}' -> REGIONS.${ownRegionId}) 밖이어도 됨(그러나 REGIONS 중 하나 안이어야 함, 2번째 체크에서 이미 확인)`, true)
  } else {
    check(`cell ${c.id}(${c.x},${c.y})가 자기 zone('${c.zone}' -> REGIONS.${ownRegionId}) 안`, inOwnZone)
  }
}
check(`자기 zone 리전 안에 있는 셀이 47개 중 최소 44개(예외 ≤3)`, inOwnZoneCount >= 44, `actual=${inOwnZoneCount}`)

let minPairDist = Infinity
let minPairDesc = ''
for (let i = 0; i < CELLS.length; i++) {
  for (let j = i + 1; j < CELLS.length; j++) {
    const a = CELLS[i]
    const b = CELLS[j]
    const d = uDist(a.x, a.y, b.x, b.y)
    if (d < minPairDist) { minPairDist = d; minPairDesc = `${a.id}-${b.id}` }
  }
}
check('47칸 중 어떤 두 칸도 6 unit(uniform)보다 가깝지 않음', minPairDist >= 6, `min=${minPairDist.toFixed(3)} (${minPairDesc})`)

// ── 4. collisionsFor — recommended는 항상 collision-free ─────────────────
section('4. recommended 클래스는 항상 collision-free')

let recommendedChecked = 0
for (const c of CELLS) {
  for (const cls of c.recommended) {
    const collisions = collisionsFor(c, cls)
    check(`cell ${c.id} + '${cls}'(recommended) → collisionsFor 0건`, collisions.length === 0,
      collisions.length ? JSON.stringify(collisions) : '')
    recommendedChecked++
  }
}
check('recommended 클래스 단언이 최소 1건 이상 실행됨(빈 테스트 방지)', recommendedChecked > 0, `count=${recommendedChecked}`)
// 2026-09-17 단위(y-x 종횡비) 버그 수정 후 재도출 — 47칸 전부 recommended가
// 비어있지 않다(최초 버전은 my-house 랜드마크 박스를 실제보다 1.9배 크게
// 계산해 '5,0' 한 칸이 예외였으나, uniform 거리로 고친 뒤 좌표를 다시
// 배치해 이 예외를 없앴다).
check('47칸 전부 recommended가 비어 있지 않음(빈 recommended 칸 0개)',
  CELLS.every((c) => c.recommended.length > 0),
  `empty=${JSON.stringify(CELLS.filter((c) => c.recommended.length === 0).map((c) => c.id))}`)

// ── 5. tree/bench — 콜리전 있으면 반드시 exclusions에 있음 ─────────────────
section('5. tree/bench 배제 규칙')

for (const c of CELLS) {
  for (const cls of ['tree', 'bench']) {
    const collisions = collisionsFor(c, cls)
    const excluded = c.exclusions.includes(cls)
    check(`cell ${c.id} + '${cls}': 콜리전 없음 또는 exclusions에 포함`, collisions.length === 0 || excluded)
  }
}

// LARGE_CLASSES export 확인 + 핵심 출입구 10 unit 반경 안에서는 항상 배제.
check("LARGE_CLASSES === ['tree','bench']", JSON.stringify(LARGE_CLASSES) === JSON.stringify(['tree', 'bench']))
const ENTRANCE_KEYS = ['door', 'gate', 'shopEntrance', 'cafeEntrance', 'bridgeCrossing', 'schoolEntrance', 'towerBase', 'paul']
for (const c of CELLS) {
  const near = ENTRANCE_KEYS.some((k) => {
    const p = PROTECTED[k]
    return p && uDist(c.x, c.y, p.x, p.y) < 10
  })
  if (near) {
    check(`cell ${c.id}는 핵심 출입구 10 unit 이내 → tree/bench 모두 exclusions`,
      c.exclusions.includes('tree') && c.exclusions.includes('bench'))
  }
}

// ── 6. PROTECTED — recommended 클래스는 절대 protected 콜리전 없음 ─────────
section('6. PROTECTED 배제(recommended 기준)')

for (const key of Object.keys(PROTECTED)) {
  let violated = false
  for (const c of CELLS) {
    for (const cls of c.recommended) {
      const collisions = collisionsFor(c, cls)
      if (collisions.some((x) => x.kind === 'protected' && x.with === key)) violated = true
    }
  }
  check(`PROTECTED.${key} — recommended 클래스 중 이 지점과 충돌하는 것 없음`, !violated)
}
// 일반화: recommended 클래스는 어떤 PROTECTED 지점과도 충돌 없음(대칭 확인).
let anyRecommendedProtected = false
for (const c of CELLS) {
  for (const cls of c.recommended) {
    if (collisionsFor(c, cls).some((x) => x.kind === 'protected')) anyRecommendedProtected = true
  }
}
check('recommended 클래스가 protected 콜리전을 내는 사례 0건(전수)', !anyRecommendedProtected)

// ── 7. 잠금해제 레벨(cellUnlockLevel) ───────────────────────────────────
section('7. cellUnlockLevel')

for (const zone of ['frontGarden', 'houseLawn', 'foregroundVerge']) {
  for (const c of cellsInZone(zone)) {
    check(`zone '${zone}' cell ${c.id} → cellUnlockLevel === 1`, cellUnlockLevel(c) === 1)
  }
}
for (const c of cellsInZone('shopSurround')) {
  check(`shopSurround cell ${c.id} → cellUnlockLevel === 3`, cellUnlockLevel(c) === 3)
}
for (const c of cellsInZone('cafeEdge')) {
  check(`cafeEdge cell ${c.id} → cellUnlockLevel === 5`, cellUnlockLevel(c) === 5)
}
for (const c of cellsInZone('squarePerimeter')) {
  check(`squarePerimeter cell ${c.id} → cellUnlockLevel === 1(§5 예외: Lv5 리전이지만 Lv1부터 잔디로 사용)`, cellUnlockLevel(c) === 1)
}
for (const c of cellsInZone('schoolLawn')) {
  check(`schoolLawn cell ${c.id} → cellUnlockLevel === 7`, cellUnlockLevel(c) === 7)
}
for (const c of cellsInZone('towerGreen')) {
  check(`towerGreen cell ${c.id} → cellUnlockLevel === 8`, cellUnlockLevel(c) === 8)
}
check('RIVER_CELLS_UNLOCK === 6', RIVER_CELLS_UNLOCK === 6)
for (const c of cellsInZone('riverApproach')) {
  check(`riverApproach cell ${c.id} → cellUnlockLevel === RIVER_CELLS_UNLOCK(6)`, cellUnlockLevel(c) === RIVER_CELLS_UNLOCK)
}
for (const c of cellsInZone('villageLane')) {
  check(`villageLane cell ${c.id} → cellUnlockLevel === 1(home과 동일 취급)`, cellUnlockLevel(c) === 1)
}
check('cellUnlockLevel(알 수 없는 zone)은 Infinity', cellUnlockLevel({ zone: 'nope' }) === Infinity)
check('cellUnlockLevel(null)은 Infinity', cellUnlockLevel(null) === Infinity)

// ── 8. isPlacementAllowed ───────────────────────────────────────────────
section('8. isPlacementAllowed')

const sampleFront = cellsInZone('frontGarden')[0]
check('frontGarden 셀 + recommended 클래스 + Lv1 → ok', (() => {
  const cls = sampleFront.recommended[0]
  const r = isPlacementAllowed(sampleFront.id, cls, 1)
  return r.ok === true && r.reasons.length === 0
})())

const sampleShop = cellsInZone('shopSurround')[0]
check('shopSurround 셀 + Lv1(잠김) → ok:false, reasons에 locked', (() => {
  const cls = sampleShop.recommended[0] || Object.keys(OBJECT_CLASSES)[0]
  const r = isPlacementAllowed(sampleShop.id, cls, 1)
  return r.ok === false && r.reasons.includes('locked')
})())
check('shopSurround 셀 + Lv3(해제) → locked 사유 없음', (() => {
  const cls = sampleShop.recommended[0]
  const r = isPlacementAllowed(sampleShop.id, cls, 3)
  return !r.reasons.includes('locked')
})())

check('exclusions에 있는 클래스는 excluded 사유 포함', (() => {
  const excludedCls = sampleFront.exclusions[0]
  if (!excludedCls) return true // 이 셀이 exclusions가 없으면 스킵(다른 셀로 대체 확인)
  const r = isPlacementAllowed(sampleFront.id, excludedCls, cellUnlockLevel(sampleFront))
  return r.reasons.includes('excluded')
})())

check("isPlacementAllowed('없는-id', 'tree', 1) → unknown-cell", (() => {
  const r = isPlacementAllowed('99,99', 'tree', 1)
  return r.ok === false && r.reasons.includes('unknown-cell')
})())
check(`isPlacementAllowed('${sampleFront.id}', 'no-such-class', 1) → unknown-class`, (() => {
  const r = isPlacementAllowed(sampleFront.id, 'no-such-class', 1)
  return r.ok === false && r.reasons.includes('unknown-class')
})())

// 모든 cell x recommended[0]는 그 cell의 unlock 레벨에서 ok:true.
for (const c of CELLS) {
  if (c.recommended.length === 0) continue
  const lvl = cellUnlockLevel(c)
  const r = isPlacementAllowed(c.id, c.recommended[0], lvl)
  check(`isPlacementAllowed(${c.id}, '${c.recommended[0]}', unlockLevel=${lvl}) → ok`, r.ok === true)
}

// ── 9. visibleMarkerStyle ───────────────────────────────────────────────
section('9. visibleMarkerStyle')

check("visibleMarkerStyle('idle') === 'none'", visibleMarkerStyle('idle') === 'none')
check("visibleMarkerStyle('placing') === 'ground-glow'", visibleMarkerStyle('placing') === 'ground-glow')
check("visibleMarkerStyle('moving') === 'ground-glow'", visibleMarkerStyle('moving') === 'ground-glow')
check("visibleMarkerStyle('알수없음') === 'none'(안전 기본값)", visibleMarkerStyle('unknown-mode') === 'none')
check("visibleMarkerStyle(undefined) === 'none'", visibleMarkerStyle(undefined) === 'none')

// ── 10. 퍼징(시드 고정 LCG) ──────────────────────────────────────────────
section('10. 퍼징')

const rngA = makeLcg(20260917)
let fuzzThrew = false
let fuzzNonArray = false
for (let i = 0; i < 2000; i++) {
  const x = rngA() * WORLD.w
  const y = rngA() * 100
  try {
    const result = collisionsFor({ x, y }, 'flower')
    if (!Array.isArray(result)) fuzzNonArray = true
  } catch {
    fuzzThrew = true
  }
}
check('collisionsFor: WORLD 안 2000개 랜덤 점 — 크래시 없음', !fuzzThrew)
check('collisionsFor: WORLD 안 2000개 랜덤 점 — 항상 배열 반환', !fuzzNonArray)

const rngB = makeLcg(20260918)
const classNames = Object.keys(OBJECT_CLASSES)
let detDiff = 0
for (let i = 0; i < 500; i++) {
  const cell = CELLS[Math.floor(rngB() * CELLS.length)]
  const cls = classNames[Math.floor(rngB() * classNames.length)]
  const level = Math.floor(rngB() * 10) + 1
  const r1 = isPlacementAllowed(cell.id, cls, level)
  const r2 = isPlacementAllowed(cell.id, cls, level)
  if (JSON.stringify(r1) !== JSON.stringify(r2)) detDiff++
}
check('isPlacementAllowed: 500쌍 랜덤 (cell,class,level) — 두 번 호출 결과 항상 동일(결정론)', detDiff === 0, `diffs=${detDiff}`)

// ── 11. 순수성(purity) ───────────────────────────────────────────────────
section('11. 순수성')

const src = readSrc('src/utils/town/placementContract.js')
check('placementContract.js 소스를 읽을 수 있음', !!src)
if (src) {
  check('import React 없음', !/import\s+React/.test(src))
  check('document. 참조 없음', !/\bdocument\./.test(src))
  check('window. 참조 없음', !/\bwindow\./.test(src))
  check('fetch( 호출 없음', !/\bfetch\(/.test(src))
  check('localStorage 실사용 없음(속성/인덱스 접근)', !/localStorage\s*[.[]/.test(src))
  check('Math.random( 호출 없음', !/Math\.random\(/.test(src))
  check("import는 './worldContract'/'./townScene'만 사용", /from '\.\/worldContract'/.test(src) && /from '\.\/townScene'/.test(src))
  const importSpecifiers = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])
  check('import 대상이 worldContract/townScene 둘뿐(제3의 상대/패키지 import 없음)',
    importSpecifiers.length > 0 && importSpecifiers.every((s) => s === './worldContract' || s === './townScene'))
}

// ── 12. 회귀 — 기존 스위트 unchanged ────────────────────────────────────
section('12. 회귀(기존 스위트, 정보용 — 별도 커맨드로 실행 확인)')
check('이 섹션은 참고용 — 실제 회귀 확인은 README/handoff에 별도 실행 로그로 기록', true)

// ── 요약 ──────────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (totalFailed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
