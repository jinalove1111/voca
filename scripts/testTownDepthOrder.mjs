// scripts/testTownDepthOrder.mjs — Paul Town V2 월드 깊이(depth) 모델
// (src/utils/town/depthOrder.js) 순수 단위 테스트(2026-09-17).
//
// 2026-09-22(Stage 3, Paul Town 2.5D 캐릭터 프로토타입) — depthOrder.js에
// 'character' 레이어가 추가되면서(순수 additive, 기존 12개 레이어 값
// 무변경) 이 스위트의 "정확히 12개"류 하드코딩 단언들을 13개로 갱신했다 —
// 아래에서 값이 바뀐 지점마다 "2026-09-22"로 표시한다. 다른 11개 기존
// 레이어(sky~foregroundVegetation, paul, ui)에 대한 단언은 단 하나도
// 약화하지 않았다(기존 조건식 그대로, 개수/목록 리터럴만 13개로 확장).
// randInt(12) 하드코딩(8곳)도 randInt(DEPTH_LAYERS.length)로 일반화해
// 레이어 수가 다시 바뀌어도 이 스위트가 스스로 따라가게 했다(값 자체가
// 아니라 "매직 넘버 12"만 제거).
//
// depthOrder.js만 검증 대상으로 import한다(그 파일이 다시 townScene.js의
// Z_LAYERS를 문서화 목적으로 import하지만, 그건 depthOrder.js 내부 구현
// 세부사항이라 이 테스트가 townScene.js를 직접 건드리지 않는다) —
// React/DOM/네트워크 0, 결정론(같은 입력 → 항상 같은 출력). 무작위성이
// 필요한 property 테스트는 Math.random이 아니라 이 파일 안에 직접 구현한
// 작은 LCG(선형 합동 생성기, 고정 시드)만 쓴다 — 같은 시드는 항상 같은
// 시퀀스를 내므로 재실행해도 결과가 재현된다.
//
// CRLF 안전화가 필요 없는 이유: 이 스크립트는 소스 텍스트를 직접
// 파싱/비교하지 않고(scripts/testTownSceneV2.mjs와 달리 정적 코드 스캔이
// 없음) esbuild 번들 산출물을 import만 하므로 개행 문자 이슈가 없다.
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

// depthOrder.js는 townScene.js를 확장자 없는 상대 경로(`from './townScene'`)로
// import하는데, Vite 번들 밖에서 plain `node`로 직접 import하면 Node ESM
// 로더가 이를 해석하지 못해 ERR_MODULE_NOT_FOUND로 죽는다(2026-09-13
// testTownSceneV2.mjs가 처음 겪은 것과 동일한 문제). 새 소스 로직을
// 발명하지 않고 같은 해법(esbuild로 scripts/.tmp/에 번들 후 그 산출물을
// import)을 재사용한다.
const TMP_DIR = path.join(process.cwd(), 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })
const BUNDLE_PATH = path.join(TMP_DIR, 'townDepthOrder.v2.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/depthOrder.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDLE_PATH,
})

const {
  DEPTH_LAYERS, LAYER_BASE, Y_RANKED_LAYERS,
  depthKey, compareDepth, sortByDepth, cssZIndex, CSS_Z_INDEX_MAX, occludes,
} = await import(`${pathToFileURL(BUNDLE_PATH).href}?t=${Date.now()}`)

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function throws(fn) {
  try { fn(); return false } catch { return true }
}

// 고정 시드 LCG — Math.random 사용 금지, 재현 가능한 결정론적 난수만.
function makeLcg(seed) {
  let state = seed >>> 0
  return function next() {
    state = (1103515245 * state + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}
const rand = makeLcg(20260917)
function randInt(maxExclusive) { return Math.floor(rand() * maxExclusive) }

// ── 1. DEPTH_LAYERS / LAYER_BASE 기본 계약 ─────────────────────────────
section('1. DEPTH_LAYERS / LAYER_BASE 기본 계약')

const EXPECTED_LAYERS = [
  'sky', 'hills', 'distantLocked', 'terrain', 'water', 'path',
  'architecture', 'scenery', 'objects', 'foregroundVegetation', 'character', 'paul', 'ui',
]
check('DEPTH_LAYERS.length === 13(2026-09-22, character 추가)', DEPTH_LAYERS.length === 13, `len=${DEPTH_LAYERS.length}`)
check(
  'DEPTH_LAYERS === 지정된 13개 레이어 순서(뒤→앞, 2026-09-22 character 추가)',
  JSON.stringify(DEPTH_LAYERS) === JSON.stringify(EXPECTED_LAYERS),
  JSON.stringify(DEPTH_LAYERS),
)
check('Object.keys(LAYER_BASE).length === 13(2026-09-22, character 추가)', Object.keys(LAYER_BASE).length === 13)
check(
  'DEPTH_LAYERS 13개 전부 LAYER_BASE에 정수 키로 존재',
  DEPTH_LAYERS.every((l) => Number.isInteger(LAYER_BASE[l])),
)
check(
  'LAYER_BASE는 DEPTH_LAYERS 순서대로 엄격히 증가(strictly increasing)',
  DEPTH_LAYERS.every((l, i) => i === 0 || LAYER_BASE[l] > LAYER_BASE[DEPTH_LAYERS[i - 1]]),
)
check('Y_RANKED_LAYERS.size === 5(2026-09-22, character 추가)', Y_RANKED_LAYERS.size === 5)
check(
  'Y_RANKED_LAYERS === {architecture, scenery, objects, foregroundVegetation, character}만(2026-09-22 character 추가)',
  DEPTH_LAYERS.every((l) => {
    const expected = ['architecture', 'scenery', 'objects', 'foregroundVegetation', 'character'].includes(l)
    return Y_RANKED_LAYERS.has(l) === expected
  }),
)
check(
  '기존 11개 레이어(character 제외)의 LAYER_BASE 값은 2026-09-17 원본과 완전히 동일(회귀 방지)',
  LAYER_BASE.sky === 0 && LAYER_BASE.hills === 1000 && LAYER_BASE.distantLocked === 2000 &&
  LAYER_BASE.terrain === 3000 && LAYER_BASE.water === 4000 && LAYER_BASE.path === 5000 &&
  LAYER_BASE.architecture === 6000 && LAYER_BASE.scenery === 6001 && LAYER_BASE.objects === 6002 &&
  LAYER_BASE.foregroundVegetation === 6003 && LAYER_BASE.paul === 8000 && LAYER_BASE.ui === 9000,
)

// ── 2. depthKey 기본 동작(경계값/클램프/에러) ────────────────────────────
section('2. depthKey 기본 동작')

check('depthKey(sky, y 없음) === LAYER_BASE.sky', depthKey({ id: 's1', layer: 'sky' }) === LAYER_BASE.sky)
check('depthKey(path, y 없음) === LAYER_BASE.path', depthKey({ id: 'p1', layer: 'path' }) === LAYER_BASE.path)
check('depthKey(architecture, y=0) === LAYER_BASE.architecture', depthKey({ id: 'a0', layer: 'architecture', y: 0 }) === LAYER_BASE.architecture)
check('depthKey(architecture, y=100) === LAYER_BASE.architecture + 900', depthKey({ id: 'a100', layer: 'architecture', y: 100 }) === LAYER_BASE.architecture + 900)
check(
  'depthKey(y=-50) === depthKey(y=0) (음수 y는 0으로 clamp)',
  depthKey({ id: 'aNeg', layer: 'architecture', y: -50 }) === depthKey({ id: 'aZero', layer: 'architecture', y: 0 }),
)
check(
  'depthKey(y=150) === depthKey(y=100) (100 초과는 100으로 clamp)',
  depthKey({ id: 'aOver', layer: 'architecture', y: 150 }) === depthKey({ id: 'aHundred', layer: 'architecture', y: 100 }),
)
check('알 수 없는 layer는 Error', throws(() => depthKey({ id: 'x', layer: 'nope', y: 10 })))
check('y-ranked 레이어에서 y=NaN은 Error', throws(() => depthKey({ id: 'x', layer: 'objects', y: NaN })))
check('y-ranked 레이어에서 y=undefined는 Error', throws(() => depthKey({ id: 'x', layer: 'objects' })))
check(
  '비-y-ranked 레이어(paul)는 y를 무시(y=999를 줘도 base와 동일)',
  depthKey({ id: 'paulX', layer: 'paul', y: 999 }) === LAYER_BASE.paul,
)
check('entity가 null이면 Error', throws(() => depthKey(null)))
check('entity가 객체가 아니면(문자열) Error', throws(() => depthKey('not-an-object')))

// ── 3. 시나리오 — 나무 vs 집 (scenery/architecture 교차, y가 우선) ───────
section('3. 시나리오 — 나무 vs 집')

const treeBehind = { id: 'tree-behind', layer: 'scenery', y: 40 }
const house = { id: 'house', layer: 'architecture', y: 53 }
check('나무(scenery,y=40) 뒤 / 집(architecture,y=53) 앞: occludes(house, tree) === true', occludes(house, treeBehind) === true)
check('반대 방향은 false: occludes(tree, house) === false', occludes(treeBehind, house) === false)
check('compareDepth(house, tree) > 0', compareDepth(house, treeBehind) > 0)
check(
  'sortByDepth([tree, house])의 마지막(가장 앞) 요소는 house',
  sortByDepth([treeBehind, house]).at(-1).id === 'house',
)

const treeFront = { id: 'tree-front', layer: 'objects', y: 60 }
check('나무(objects,y=60) 앞 / 집(architecture,y=53) 뒤: occludes(tree, house) === true', occludes(treeFront, house) === true)
check('반대 방향은 false: occludes(house, tree) === false', occludes(house, treeFront) === false)

// ── 4. 시나리오 — 벤치는 path/terrain보다 항상 앞 ────────────────────────
section('4. 시나리오 — 벤치(objects,y=64) vs path/terrain')

const bench = { id: 'bench', layer: 'objects', y: 64 }
const pathEntity = { id: 'path1', layer: 'path' }
const terrainEntity = { id: 'terrain1', layer: 'terrain' }
check('벤치가 path보다 앞: occludes(bench, path) === true', occludes(bench, pathEntity) === true)
check('벤치가 terrain보다 앞: occludes(bench, terrain) === true', occludes(bench, terrainEntity) === true)
check('반대 방향(path가 벤치보다 앞)은 false', occludes(pathEntity, bench) === false)
check('반대 방향(terrain이 벤치보다 앞)은 false', occludes(terrainEntity, bench) === false)

// ── 5. 시나리오 — 동물(objects,y=50)과 건물(architecture) 교차 ──────────
section('5. 시나리오 — 동물 vs 건물(baseline y 교차)')

const animal = { id: 'animal', layer: 'objects', y: 50 }
const buildingLower = { id: 'buildingLower', layer: 'architecture', y: 53 } // 화면상 더 아래(가까움)
const buildingHigher = { id: 'buildingHigher', layer: 'architecture', y: 24 } // 화면상 더 위(멀음)
check(
  '동물은 화면상 더 아래(y=53)인 건물보다 절대 앞이 아님: occludes(animal, buildingLower) === false',
  occludes(animal, buildingLower) === false,
)
check('그 건물은 동물보다 앞: occludes(buildingLower, animal) === true', occludes(buildingLower, animal) === true)
check(
  '동물은 화면상 더 위(y=24)인 건물보다 항상 앞: occludes(animal, buildingHigher) === true',
  occludes(animal, buildingHigher) === true,
)
check('그 건물은 동물보다 뒤: occludes(buildingHigher, animal) === false', occludes(buildingHigher, animal) === false)

// ── 6. 시나리오 — 강(water)은 다리(architecture)보다 y와 무관하게 항상 뒤 ─
section('6. 시나리오 — 강 vs 다리(y 무관)')

const river = { id: 'river', layer: 'water' }
const bridgeYs = [0, 25, 50, 75, 100]
const bridgeAlwaysFront = bridgeYs.every((y) => occludes({ id: `bridge${y}`, layer: 'architecture', y }, river) === true)
const riverNeverFront = bridgeYs.every((y) => occludes(river, { id: `bridge${y}`, layer: 'architecture', y }) === false)
check('다리는 모든 y값에서 강보다 앞', bridgeAlwaysFront)
check('강은 모든 y값에서 다리보다 앞이 아님', riverNeverFront)

// ── 7. 시나리오 — 전경 식물(foregroundVegetation) vs 오브젝트/폴/UI ──────
section('7. 시나리오 — 전경 식물 vs 오브젝트/폴/UI')

const plant = { id: 'plant', layer: 'foregroundVegetation', y: 70 }
const objAt66 = { id: 'obj66', layer: 'objects', y: 66 }
const paulSmallY = { id: 'paul-small-y', layer: 'paul', y: 1 } // 식물보다 훨씬 작은 y
const paulNoY = { id: 'paul-no-y', layer: 'paul' }
const uiEntity = { id: 'ui1', layer: 'ui' }

check('식물(y=70)이 오브젝트(y=66)보다 앞', occludes(plant, objAt66) === true)
check('반대 방향은 false', occludes(objAt66, plant) === false)
check('폴은 y가 식물보다 작아도 항상 식물보다 앞', occludes(paulSmallY, plant) === true)
check('식물은 폴(y가 작아도)보다 앞이 될 수 없음', occludes(plant, paulSmallY) === false)
check('폴(y 없음)도 항상 식물보다 앞', occludes(paulNoY, plant) === true)
check('UI는 항상 식물보다 앞', occludes(uiEntity, plant) === true)
check('식물은 UI보다 앞이 될 수 없음', occludes(plant, uiEntity) === false)
check('UI는 폴보다도 항상 앞(최상단 레이어 sanity)', occludes(uiEntity, paulSmallY) === true)

// ── 8. 시나리오 — sky/hills/distantLocked는 항상 terrain보다 뒤 ─────────
section('8. 시나리오 — 배경 레이어 순서')

const skyEntity = { id: 'sky1', layer: 'sky' }
const hillsEntity = { id: 'hills1', layer: 'hills' }
const lockedEntity = { id: 'locked1', layer: 'distantLocked' }
const terrainEntity2 = { id: 'terrain2', layer: 'terrain' }
check('terrain은 sky보다 앞', occludes(terrainEntity2, skyEntity) === true)
check('terrain은 hills보다 앞', occludes(terrainEntity2, hillsEntity) === true)
check('terrain은 distantLocked보다 앞', occludes(terrainEntity2, lockedEntity) === true)
check('sky는 terrain보다 앞이 아님', occludes(skyEntity, terrainEntity2) === false)
check('hills는 terrain보다 앞이 아님', occludes(hillsEntity, terrainEntity2) === false)
check('distantLocked는 terrain보다 앞이 아님', occludes(lockedEntity, terrainEntity2) === false)

// ── 9. cssZIndex ─────────────────────────────────────────────────────
section('9. cssZIndex')

const cssFixtures = DEPTH_LAYERS.map((layer, i) => ({
  id: `css${i}`, layer, y: Y_RANKED_LAYERS.has(layer) ? (i * 37) % 101 : undefined,
}))
check(
  '샘플 엔티티 전부 cssZIndex가 [0, CSS_Z_INDEX_MAX] 범위',
  cssFixtures.every((e) => { const z = cssZIndex(e); return Number.isFinite(z) && z >= 0 && z <= CSS_Z_INDEX_MAX }),
)
check(
  '이 시스템의 실제 depthKey 범위(≤ 9000)에서는 cssZIndex === depthKey(클램프 미발동)',
  cssFixtures.every((e) => cssZIndex(e) === depthKey(e)),
)

// ── 10. sortByDepth / compareDepth — 불변성/결정론 ───────────────────────
section('10. sortByDepth / compareDepth 불변성·결정론')

const mutationGuardInput = [treeBehind, house, bench, river]
const beforeIds = mutationGuardInput.map((e) => e.id)
const sortedGuard = sortByDepth(mutationGuardInput)
check('sortByDepth는 입력 배열을 mutate하지 않음(순서 불변)', mutationGuardInput.map((e) => e.id).join(',') === beforeIds.join(','))
check('sortByDepth는 새 배열을 반환(입력과 다른 참조)', sortedGuard !== mutationGuardInput)

const oneOfEachFixture = DEPTH_LAYERS.map((layer, i) => ({
  id: layer, layer, y: Y_RANKED_LAYERS.has(layer) ? 50 : undefined,
}))
check(
  '레이어당 하나씩(콘텐츠 티어는 동일 y=50)을 정렬하면 DEPTH_LAYERS 순서와 일치(동일 y일 때 레이어가 타이브레이크)',
  JSON.stringify(sortByDepth(oneOfEachFixture).map((e) => e.id)) === JSON.stringify(DEPTH_LAYERS),
)

const tieFixture = [
  { id: 'b', layer: 'objects', y: 50 },
  { id: 'a', layer: 'objects', y: 50 },
]
check(
  'tieBreak 없이 depthKey가 완전히 같으면 id 문자열 순서로 정렬(a가 b보다 앞쪽 인덱스)',
  sortByDepth(tieFixture).map((e) => e.id).join(',') === 'a,b',
)

// 큰 무작위 픽스처(레이어 골고루 섞임)로 "두 번 정렬해도 같은 결과"를 검증.
const bigFixture = []
for (let i = 0; i < 150; i++) {
  const layer = DEPTH_LAYERS[randInt(DEPTH_LAYERS.length)]
  bigFixture.push({ id: `item${i}`, layer, y: Y_RANKED_LAYERS.has(layer) ? randInt(101) : undefined })
}
const sortedForward = sortByDepth(bigFixture).map((e) => e.id)
const sortedFromReversed = sortByDepth([...bigFixture].reverse()).map((e) => e.id)
const sortedAgain = sortByDepth(bigFixture).map((e) => e.id)
check(
  '같은 집합을 다른 입력 순서로 정렬해도 결과 순서가 동일(총순서, 결정론)',
  JSON.stringify(sortedForward) === JSON.stringify(sortedFromReversed),
)
check('같은 배열을 두 번 정렬해도 결과가 동일(안정성)', JSON.stringify(sortedForward) === JSON.stringify(sortedAgain))

// ── 11. Property 테스트(고정 시드 LCG, Math.random 미사용) ───────────────
section('11. Property 테스트(LCG, 시드 20260917)')

// A) 같은 y-ranked 레이어 내 500쌍 — y가 클수록 key도 크다(정수 y라 항상 엄격).
let propAOk = true
let propADetail = ''
for (let i = 0; i < 500; i++) {
  const ya = randInt(101)
  let yb = randInt(101)
  let guard = 0
  while (yb === ya && guard < 10) { yb = randInt(101); guard++ }
  if (yb === ya) continue
  const ka = depthKey({ id: `pa${i}`, layer: 'objects', y: ya })
  const kb = depthKey({ id: `pb${i}`, layer: 'objects', y: yb })
  if (Math.sign(ka - kb) !== Math.sign(ya - yb)) { propAOk = false; propADetail = `ya=${ya} yb=${yb} ka=${ka} kb=${kb}`; break }
}
check('property A — 동일 y-ranked 레이어 내 500쌍: y가 클수록 key도 크다', propAOk, propADetail)

// B) 서로 다른 레이어 500쌍(단, 둘 다 콘텐츠 티어인 조합은 제외 — 그 조합만
//    예외적으로 y가 레이어를 뒤집을 수 있다는 게 §3/§5 시나리오의 핵심이라,
//    이 property는 "적어도 한쪽이 콘텐츠 티어 밖"인 조합에서 레이어 순서가
//    y와 무관하게 항상 이긴다는 걸 검증한다).
let propBOk = true
let propBDetail = ''
for (let i = 0; i < 500; i++) {
  const ai = randInt(DEPTH_LAYERS.length)
  let bi = randInt(DEPTH_LAYERS.length)
  let guard = 0
  while (bi === ai && guard < 10) { bi = randInt(DEPTH_LAYERS.length); guard++ }
  if (bi === ai) continue
  const layerA = DEPTH_LAYERS[ai]
  const layerB = DEPTH_LAYERS[bi]
  if (Y_RANKED_LAYERS.has(layerA) && Y_RANKED_LAYERS.has(layerB)) continue
  const ya = Y_RANKED_LAYERS.has(layerA) ? randInt(101) : undefined
  const yb = Y_RANKED_LAYERS.has(layerB) ? randInt(101) : undefined
  const ka = depthKey({ id: `qa${i}`, layer: layerA, y: ya })
  const kb = depthKey({ id: `qb${i}`, layer: layerB, y: yb })
  const expectedSign = Math.sign(ai - bi)
  if (Math.sign(ka - kb) !== expectedSign) { propBOk = false; propBDetail = `${layerA}(${ya}) vs ${layerB}(${yb})`; break }
}
check('property B — 콘텐츠 티어 둘 다가 아닌 500 교차쌍: 레이어 순서가 y와 무관하게 항상 이김', propBOk, propBDetail)

// C) 콜리전 없음 — 서로 다른 레이어 500쌍의 depthKey가 절대 같지 않음.
let propDOk = true
let propDDetail = ''
for (let i = 0; i < 500; i++) {
  const ai = randInt(DEPTH_LAYERS.length)
  let bi = randInt(DEPTH_LAYERS.length)
  let guard = 0
  while (bi === ai && guard < 10) { bi = randInt(DEPTH_LAYERS.length); guard++ }
  if (bi === ai) continue
  const layerA = DEPTH_LAYERS[ai]
  const layerB = DEPTH_LAYERS[bi]
  const ya = Y_RANKED_LAYERS.has(layerA) ? randInt(101) : undefined
  const yb = Y_RANKED_LAYERS.has(layerB) ? randInt(101) : undefined
  const ka = depthKey({ id: `ra${i}`, layer: layerA, y: ya })
  const kb = depthKey({ id: `rb${i}`, layer: layerB, y: yb })
  if (ka === kb) { propDOk = false; propDDetail = `${layerA}(${ya})=${ka} vs ${layerB}(${yb})=${kb}`; break }
}
check('property C — 서로 다른 레이어 500쌍: depthKey가 절대 충돌하지 않음', propDOk, propDDetail)

// D) cssZIndex — 500개 무작위 엔티티 전부 [0, CSS_Z_INDEX_MAX] 범위.
let propEOk = true
for (let i = 0; i < 500; i++) {
  const layer = DEPTH_LAYERS[randInt(DEPTH_LAYERS.length)]
  const y = Y_RANKED_LAYERS.has(layer) ? randInt(101) : undefined
  const z = cssZIndex({ id: `sa${i}`, layer, y })
  if (!(Number.isFinite(z) && z >= 0 && z <= CSS_Z_INDEX_MAX)) { propEOk = false; break }
}
check('property D — 500개 무작위 엔티티: cssZIndex 항상 [0, CSS_Z_INDEX_MAX] 범위', propEOk)

// E) 알 수 없는 layer는 항상 Error.
const garbageLayers = ['nope', '', 'Architecture', 'OBJECTS', 42, null, undefined, {}]
const propFOk = garbageLayers.every((g) => throws(() => depthKey({ id: 'x', layer: g, y: 10 })))
check('property E — 알 수 없는/오타 layer 값들은 전부 Error', propFOk, JSON.stringify(garbageLayers))

// ── 12. 시나리오 — 'character' 레이어(2026-09-22 Stage 3 추가) ──────────
// Paul Town 2.5D 캐릭터 프로토타입(paulTown2_5d, 격리 실험)이 이 레이어를
// 쓴다 — 여기서는 depthOrder.js 계약만 검증한다(캐릭터/장애물 구체 로직
// 자체는 scripts/testProto25dDepth.mjs가 별도로 검증).
section("12. 시나리오 — 'character' 레이어(Stage 3 추가)")

check('depthKey(character, y=0) === LAYER_BASE.character', depthKey({ id: 'c0', layer: 'character', y: 0 }) === LAYER_BASE.character)
check('depthKey(character, y=100) === LAYER_BASE.character + 900', depthKey({ id: 'c100', layer: 'character', y: 100 }) === LAYER_BASE.character + 900)

const charBehind = { id: 'char-behind', layer: 'character', y: 40 }
const objInFront = { id: 'obj-in-front', layer: 'objects', y: 53 }
check(
  '캐릭터(character,y=40)가 오브젝트(objects,y=53)보다 뒤: occludes(obj, char) === true',
  occludes(objInFront, charBehind) === true,
)
check('반대 방향은 false', occludes(charBehind, objInFront) === false)

const charFront = { id: 'char-front', layer: 'character', y: 60 }
const objBehind = { id: 'obj-behind', layer: 'objects', y: 53 }
check(
  '캐릭터(character,y=60)가 오브젝트(objects,y=53)보다 앞: occludes(char, obj) === true',
  occludes(charFront, objBehind) === true,
)
check('반대 방향은 false', occludes(objBehind, charFront) === false)

check(
  '캐릭터는 paul보다 항상 뒤(콘텐츠 티어 밖으로 못 넘어감): occludes(paul, character) === true',
  occludes({ id: 'paulY', layer: 'paul' }, { id: 'charY', layer: 'character', y: 100 }) === true,
)
check(
  'sky/hills 등 배경 레이어는 character(y=0)보다도 항상 뒤',
  occludes({ id: 'charMin', layer: 'character', y: 0 }, { id: 'skyE', layer: 'sky' }) === true,
)

const charTieA = { id: 'ctb', layer: 'character', y: 50 }
const charTieB = { id: 'cta', layer: 'character', y: 50 }
check(
  '동일 y의 character 두 엔티티는 id 문자열 순서로 결정론적 타이브레이크',
  sortByDepth([charTieA, charTieB]).map((e) => e.id).join(',') === 'cta,ctb',
)

const objTie = { id: 'obj-tie', layer: 'objects', y: 50 }
const charTie = { id: 'char-tie', layer: 'character', y: 50 }
check(
  'character/objects가 정확히 같은 y=50이어도 depthKey가 서로 충돌하지 않음(콜리전 없음)',
  depthKey(objTie) !== depthKey(charTie),
)

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
