// scripts/testProto25dDepth.mjs — Paul Town 2.5D 캐릭터 프로토타입
// (Stage 3, 2026-09-22) depthVisual.js(Y-기반 스케일/깊이 순서 파생) 순수
// 단위 테스트.
//
// React/DOM/네트워크 0. depthVisual.js가 worldContract.js/depthOrder.js를
// 확장자 없는 상대 import로 참조하므로, plain `node`로 직접 import하면
// Node ESM 로더가 ERR_MODULE_NOT_FOUND로 죽는다(scripts/testTownWorldContract.mjs/
// scripts/testProto25dWalkGrid.mjs와 동일 원인/동일 해법) — esbuild로
// scripts/.tmp/(gitignore 대상)에 번들해 그 산출물을 import한다.
//
// walkGrid.js OBSTACLES(demo-building/bench/tree)를 재사용해 "실제 이
// 프로토타입이 쓰는 장애물과 캐릭터가 Y 기준으로 정말 서로 가리고
// 가려지는지"까지 검증한다(가상의 픽스처가 아니라 실제 데이터).
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const DEPTH_VISUAL_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dDepthVisual.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/depthVisual.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: DEPTH_VISUAL_BUNDLE_PATH,
})
const {
  characterScale, characterDepthKey, characterZIndex,
  obstacleDepthKey, obstacleZIndex, CHARACTER_LAYER, OBSTACLE_LAYER, CHARACTER_ID,
} = await import(`${pathToFileURL(DEPTH_VISUAL_BUNDLE_PATH).href}?t=${Date.now()}`)

const WORLD_CONTRACT_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dWorldContract.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/worldContract.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: WORLD_CONTRACT_BUNDLE_PATH,
})
const { depthScale } = await import(`${pathToFileURL(WORLD_CONTRACT_BUNDLE_PATH).href}?t=${Date.now()}`)

const GRID_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dWalkGridForDepth.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/walkGrid.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: GRID_BUNDLE_PATH,
})
const { OBSTACLES } = await import(`${pathToFileURL(GRID_BUNDLE_PATH).href}?t=${Date.now()}`)

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

// 고정 시드 LCG — Math.random 사용 금지(walkGrid.js/pathfinding.js/
// testTownDepthOrder.mjs와 동일 관례).
function makeLcg(seed) {
  let state = seed >>> 0
  return function next() {
    state = (1103515245 * state + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}
const rand = makeLcg(20260922)
function randY() { return rand() * 100 }

// ── 1. characterScale — depthScale(worldContract.js) 재사용 계약 ────────
section('1. characterScale — worldContract.depthScale 재사용 계약')

check('characterScale(y) === depthScale(y)(재구현 없음, 동일 함수 위임) — y=0', characterScale(0) === depthScale(0))
check('characterScale(y) === depthScale(y) — y=50', characterScale(50) === depthScale(50))
check('characterScale(y) === depthScale(y) — y=100', characterScale(100) === depthScale(100))
{
  let allMatch = true
  for (let i = 0; i < 200; i++) {
    const y = randY()
    if (characterScale(y) !== depthScale(y)) { allMatch = false; break }
  }
  check('200개 무작위 y 전부 characterScale(y) === depthScale(y)', allMatch)
}

// 항목1(운영자 목록) — 동일 y는 항상 동일 스케일(결정론).
check('동일 y(37.5)를 두 번 호출해도 완전히 같은 스케일(결정론)', characterScale(37.5) === characterScale(37.5))

// 항목2 — 더 작은 y(더 뒤)는 더 큰 y(더 앞)보다 스케일이 작다.
check('characterScale(10) < characterScale(90)(뒤가 더 작게)', characterScale(10) < characterScale(90))
check('characterScale(20) < characterScale(50)', characterScale(20) < characterScale(50))
{
  let monotoneOk = true
  let prevY = 0
  let prevScale = characterScale(0)
  for (let y = 1; y <= 100; y++) {
    const s = characterScale(y)
    if (s < prevScale - 1e-9) { monotoneOk = false; break } // 비감소(구간별 선형 보간이라 완전 strictly-increasing은 아니어도 감소는 없어야 함
    prevY = y
    prevScale = s
  }
  check('characterScale(y)는 y가 0->100으로 증가하는 동안 절대 감소하지 않음(단조 비감소, 1 간격 샘플)', monotoneOk, `prevY=${prevY}`)
}

// 항목3 — 스케일은 항상 depthScale의 공식 범위 [0.55,1.20] 안.
{
  let inBounds = true
  const sampleYs = [-50, 0, 1, 27, 28, 45, 66, 99, 100, 150, NaN]
  for (const y of sampleYs) {
    const s = characterScale(y)
    if (!(Number.isFinite(s) && s >= 0.55 && s <= 1.20)) { inBounds = false; break }
  }
  check('경계값/이상값 포함 characterScale이 항상 [0.55, 1.20] 범위(depthScale과 동일 계약)', inBounds)
}

// ── 2. characterDepthKey / characterZIndex — y가 바뀌면 depth도 바뀐다 ──
section('2. characterDepthKey / characterZIndex — y 변화에 따른 depth 변화')

// 항목4 — y가 바뀌면 depth key도 바뀐다.
check('characterDepthKey(20) !== characterDepthKey(80)(y가 다르면 depth key도 다름)', characterDepthKey(20) !== characterDepthKey(80))
check('characterDepthKey(20) < characterDepthKey(80)(더 뒤 y가 더 작은 key)', characterDepthKey(20) < characterDepthKey(80))
check('characterZIndex(y)는 characterDepthKey(y)와 동일(이 시스템 실사용 범위에서 cssZIndex 클램프 미발동)', characterZIndex(45) === characterDepthKey(45))
check("characterDepthKey는 항상 'character' 레이어를 씀(CHARACTER_LAYER export 값)", CHARACTER_LAYER === 'character')
check("CHARACTER_ID는 안정적 고정 문자열('proto-character')", CHARACTER_ID === 'proto-character')

// ── 3/4. OBSTACLES(walkGrid.js 실데이터)로 occlusion 시나리오 검증 ────────
// 항목5/6 — 캐릭터 y가 장애물 y1(지면 접점)보다 작으면(더 뒤) 가려지고,
// 크면(더 앞) 가린다.
section('3/4. 캐릭터 vs 장애물(walkGrid.js 실데이터) — Y 기준 occlusion')

const demoBuilding = OBSTACLES.find((o) => o.id === 'demo-building')
check('사전조건 — walkGrid.js에 demo-building이 존재', !!demoBuilding, JSON.stringify(OBSTACLES))
if (demoBuilding) {
  const behindY = demoBuilding.y1 - 10 // 건물 지면 접점보다 훨씬 뒤(작은 y)
  const frontY = demoBuilding.y1 + 10 // 건물 지면 접점보다 훨씬 앞(큰 y)
  const buildingKey = obstacleDepthKey(demoBuilding.id, demoBuilding.y1)
  const behindCharKey = characterDepthKey(behindY)
  const frontCharKey = characterDepthKey(frontY)

  // 항목5 — 캐릭터 y가 장애물 y1보다 작으면(더 뒤) 장애물에 가려짐(캐릭터
  // depth key < 장애물 depth key).
  check(
    `항목5 — 캐릭터(y=${behindY}, 장애물 뒤)의 depth key가 장애물(y1=${demoBuilding.y1})보다 작음(가려짐)`,
    behindCharKey < buildingKey,
    `char=${behindCharKey} obstacle=${buildingKey}`,
  )
  // 항목6 — 캐릭터 y가 장애물 y1보다 크면(더 앞) 장애물을 가림.
  check(
    `항목6 — 캐릭터(y=${frontY}, 장애물 앞)의 depth key가 장애물(y1=${demoBuilding.y1})보다 큼(가림)`,
    frontCharKey > buildingKey,
    `char=${frontCharKey} obstacle=${buildingKey}`,
  )
}

// 나머지 두 장애물(demo-bench/demo-tree)에도 동일 관계가 성립하는지 일반화 검증.
{
  let allOk = true
  for (const ob of OBSTACLES) {
    const obKey = obstacleDepthKey(ob.id, ob.y1)
    const behindKey = characterDepthKey(Math.max(0, ob.y1 - 5))
    const frontKey = characterDepthKey(Math.min(100, ob.y1 + 5))
    if (!(behindKey < obKey && frontKey > obKey)) { allOk = false; break }
  }
  // Phase 6A(2026-09-23) — OBSTACLES가 sceneFixture.js SCENE_FIXTURE에서
  // 파생되며 3개에서 8개로 늘었다(walkGrid.js 헤더 주석 참고). 이 루프는
  // 애초에 `for (const ob of OBSTACLES)`로 개수에 의존하지 않게 짜여 있어
  // (하드코딩된 길이 단언 없음) 코드 변경 없이 늘어난 개수 전부를 그대로
  // 검증한다 — 라벨 문구만 정확한 개수로 갱신(약화 없음).
  check(`OBSTACLES(${OBSTACLES.length}개) 전부에서 캐릭터가 장애물 y1보다 뒤/앞일 때 각각 가려짐/가림 관계가 성립`, allOk, JSON.stringify(OBSTACLES))
}

// ── 5. 동일 y(정확히 장애물 y1과 같음) — 타이브레이크 결정론 ─────────────
section('5. 동일 depth key/타이브레이크 결정론')

// 항목7 — 캐릭터 y와 장애물 y1이 정확히 같을 때도 두 depth key는 절대
// 충돌하지 않는다(depthOrder.js의 콜리전 없음 계약, character base=6004 !==
// objects base=6002) — 그리고 그 비교 결과는 항상 동일(결정론).
if (demoBuilding) {
  const tieY = demoBuilding.y1
  const charKeyAtTie = characterDepthKey(tieY)
  const obKeyAtTie = obstacleDepthKey(demoBuilding.id, tieY)
  check(
    '캐릭터 y === 장애물 y1(정확히 동일)이어도 depth key가 충돌하지 않음(character/objects base 차이)',
    charKeyAtTie !== obKeyAtTie,
    `char=${charKeyAtTie} ob=${obKeyAtTie}`,
  )
  check(
    '동일 y에서의 비교 결과(캐릭터가 앞인지)가 여러 번 호출해도 항상 동일(결정론)',
    (charKeyAtTie > obKeyAtTie) === (characterDepthKey(tieY) > obstacleDepthKey(demoBuilding.id, tieY)),
  )
  // character(6004) > objects(6002) base이므로 정확히 같은 y에서는 캐릭터가
  // 항상 앞(가림) — 이 시스템의 실제 정책 값에 대한 회귀 고정.
  check(
    '정확히 같은 y에서는 캐릭터(character base=6004)가 장애물(objects base=6002)보다 항상 앞',
    charKeyAtTie > obKeyAtTie,
  )
}

// OBSTACLE_LAYER export 값 회귀 고정(장애물이 실제로 'objects' 레이어를 씀).
check("OBSTACLE_LAYER === 'objects'", OBSTACLE_LAYER === 'objects')

// ── 6. 결정론/순수성 — 부작용 없음, 같은 입력은 항상 같은 출력 ───────────
section('6. 결정론/순수성')

{
  let allDeterministic = true
  for (let i = 0; i < 200; i++) {
    const y = randY()
    const a = characterZIndex(y)
    const b = characterZIndex(y)
    if (a !== b) { allDeterministic = false; break }
  }
  check('200개 무작위 y 전부 characterZIndex(y) 반복 호출이 완전히 동일(결정론)', allDeterministic)
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
