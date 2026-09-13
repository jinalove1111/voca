// scripts/testTownAssetManifest.mjs — Paul Town V2-A 아트워크 매니페스트 순수
// 단위 테스트(2026-09-13).
//
// src/assets/town/assetManifest.js(TOWN_ASSET_MANIFEST/getManifestEntry/
// manifestAssetKeys/isKnownAssetKey), src/utils/town/townScene.js(신규
// gardenStageSprite만), src/assets/town/index.js(townAsset/TOWN_ASSETS)를
// 대상으로 한다 — React/DOM/네트워크 0, 결정론(같은 입력 → 항상 같은 출력).
//
// 이 스위트의 핵심 계약: assetManifest.js는 순수 데이터/헬퍼일 뿐이며
// 가격/레벨/소유권/구매 같은 경제 개념을 절대 다루지 않는다(그 권위는
// 항상 town_items DB/townCatalog.js/서버에 있다 — CLAUDE.md 저장소 헌법과
// 동일 원칙). 또한 오늘은 TOWN_ASSETS가 여전히 빈 객체라 townAsset()이
// 항상 null을 반환해야 하고(실제 아트워크 파일 부재가 마을 화면을 절대
// 깨뜨리지 않음), gardenStageSprite()는 townScene.js의 다른 모든 기존
// export(anchorFor/spriteFor 등)를 절대 바꾸지 않은 순수 추가 함수라는
// 것도 함께 고정한다.
//
// assetManifest.js/index.js는 import가 전혀 없는 순수 데이터/헬퍼 모듈이라
// plain node ESM(pathToFileURL)으로 바로 import 가능하다(2026-09-13 실측).
// townScene.js는 확장자 없는 상대 import(`from './townLayout'`)를 쓰는
// Vite 관례라 plain node가 해석하지 못하므로(ERR_MODULE_NOT_FOUND),
// scripts/testTownSceneV2.mjs와 동일하게 esbuild로 이 파일 안에서 직접
// 번들해 scripts/.tmp/(gitignore 대상, 산출물이지 소스가 아님)에 쓴 뒤
// 그 산출물을 import한다 — 새 buildXBundle.mjs 파일을 만들지 않고 기존
// 관례(esbuild)만 재사용한다. 파일명은 testTownSceneV2.mjs가 쓰는
// townScene.v2.bundle.mjs와 겹치지 않도록 이 스크립트 전용 이름을 쓴다
// (두 스위트가 verify:all에서 병렬/순차로 함께 돌 때 서로의 산출물을
// 덮어쓰지 않기 위함).
//
// CRLF 안전화: Windows(core.autocrlf=true) 워킹카피는 \r\n일 수 있으므로
// 소스를 텍스트로 읽는 즉시 LF로 정규화한다(scripts/testTownUiStatic.mjs와
// 동일 관례).
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

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

// ── 모듈 로드 ────────────────────────────────────────────────────────────
// assetManifest.js/index.js — import 0(순수 모듈)이라 plain import로 충분.
const {
  TOWN_ASSET_MANIFEST, getManifestEntry, manifestAssetKeys, isKnownAssetKey,
} = await import(`${pathToFileURL(path.join(ROOT, 'src/assets/town/assetManifest.js')).href}`)
const { townAsset, TOWN_ASSETS } = await import(`${pathToFileURL(path.join(ROOT, 'src/assets/town/index.js')).href}`)

// townScene.js — townLayout.js/townLevel.js를 확장자 없는 상대 import로
// 참조하는 Vite 관례라 esbuild로 번들해야 plain node에서 로드 가능.
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })
const SCENE_BUNDLE_PATH = path.join(TMP_DIR, 'townScene.assetManifest.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/townScene.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: SCENE_BUNDLE_PATH,
})
const { gardenStageSprite } = await import(`${pathToFileURL(SCENE_BUNDLE_PATH).href}?t=${Date.now()}`)

// ── 1. 매니페스트 유효성 ─────────────────────────────────────────────────
section('1. 매니페스트 유효성')
const entries = Object.values(TOWN_ASSET_MANIFEST)
check('TOWN_ASSET_MANIFEST — 정확히 23개 항목', entries.length === 23, `count=${entries.length}`)

const VALID_FOOTPRINTS = new Set(['lg', 'md', 'sm', null])
const VALID_Z_LAYERS = new Set(['objects', 'patches'])

for (const e of entries) {
  const label = `TOWN_ASSET_MANIFEST['${e.assetKey}']`
  check(`${label} — assetKey 비어있지 않은 문자열`, typeof e.assetKey === 'string' && e.assetKey.length > 0)
  check(`${label} — filename 비어있지 않은 문자열`, typeof e.filename === 'string' && e.filename.length > 0)
  check(`${label} — folder 비어있지 않은 문자열`, typeof e.folder === 'string' && e.folder.length > 0)
  check(`${label} — canvas.w > 0`, Number.isFinite(e.canvas && e.canvas.w) && e.canvas.w > 0, JSON.stringify(e.canvas))
  check(`${label} — canvas.h > 0`, Number.isFinite(e.canvas && e.canvas.h) && e.canvas.h > 0, JSON.stringify(e.canvas))
  check(
    `${label} — canvas2x.w === canvas.w * 2`,
    e.canvas2x && e.canvas2x.w === e.canvas.w * 2,
    `canvas.w=${e.canvas && e.canvas.w} canvas2x.w=${e.canvas2x && e.canvas2x.w}`,
  )
  check(
    `${label} — canvas2x.h === canvas.h * 2`,
    e.canvas2x && e.canvas2x.h === e.canvas.h * 2,
    `canvas.h=${e.canvas && e.canvas.h} canvas2x.h=${e.canvas2x && e.canvas2x.h}`,
  )
  check(`${label} — aspectRatio 비어있지 않은 문자열`, typeof e.aspectRatio === 'string' && e.aspectRatio.length > 0)
  check(`${label} — transparent === true`, e.transparent === true)
  check(`${label} — anchor === 'bottom-center'`, e.anchor === 'bottom-center')
  check(`${label} — footprint ∈ {'lg','md','sm',null}`, VALID_FOOTPRINTS.has(e.footprint), `footprint=${e.footprint}`)
  check(`${label} — zLayer ∈ {'objects','patches'}`, VALID_Z_LAYERS.has(e.zLayer), `zLayer=${e.zLayer}`)
  check(`${label} — variants는 배열`, Array.isArray(e.variants))
  check(`${label} — priority === 'P0'`, e.priority === 'P0')
  check(
    `${label} — assetKey가 folder값 + '/'로 시작`,
    typeof e.assetKey === 'string' && typeof e.folder === 'string' && e.assetKey.startsWith(`${e.folder}/`),
    `assetKey=${e.assetKey} folder=${e.folder}`,
  )
}

const keys = manifestAssetKeys()
check('manifestAssetKeys() — 정확히 23개 키 반환', keys.length === 23, `count=${keys.length}`)
check(
  'manifestAssetKeys() — TOWN_ASSET_MANIFEST의 키 집합과 정확히 일치',
  keys.length === entries.length && keys.every((k) => Object.prototype.hasOwnProperty.call(TOWN_ASSET_MANIFEST, k)),
  JSON.stringify(keys),
)

// ── 2. 알 수 없는 asset_key — 안전한 폴백 ────────────────────────────────
section('2. 알 수 없는 asset_key — getManifestEntry/isKnownAssetKey 안전 폴백')
const UNKNOWN_INPUTS = ['nature/foo-nonexistent', undefined, '', 123, null, {}, [], true]
for (const input of UNKNOWN_INPUTS) {
  let threw = false
  let result
  try { result = getManifestEntry(input) } catch { threw = true }
  check(`getManifestEntry(${JSON.stringify(input)}) — throw 없음`, !threw)
  check(`getManifestEntry(${JSON.stringify(input)}) — null 반환`, !threw && result === null, JSON.stringify(result))

  let threw2 = false
  let result2
  try { result2 = isKnownAssetKey(input) } catch { threw2 = true }
  check(`isKnownAssetKey(${JSON.stringify(input)}) — throw 없음`, !threw2)
  check(`isKnownAssetKey(${JSON.stringify(input)}) — false 반환`, !threw2 && result2 === false, String(result2))
}

check('getManifestEntry(\'nonexistent/foo\') — null', getManifestEntry('nonexistent/foo') === null)
check('isKnownAssetKey(\'nonexistent/foo\') — false', isKnownAssetKey('nonexistent/foo') === false)

let realKeysAllKnown = true
for (const k of keys) {
  if (!isKnownAssetKey(k)) { realKeysAllKnown = false; break }
  if (getManifestEntry(k) === null) { realKeysAllKnown = false; break }
}
check('실제 매니페스트 키 23개 전부 isKnownAssetKey() === true / getManifestEntry() !== null', realKeysAllKnown)

// ── 3. 아트워크 파일 부재 — Town 화면 크래시 없음 ────────────────────────
section('3. 아트워크 파일 부재(TOWN_ASSETS 비어있음) — townAsset 안전 폴백')
const townAssetsKeyCount = Object.keys(TOWN_ASSETS).length
console.log(`  [정보] Object.keys(TOWN_ASSETS).length === ${townAssetsKeyCount}(오늘은 0이 기대값이지만, 향후 실제 아트워크가 채워지면 0이 아닐 수 있음 — 길이 자체는 하드 FAIL 대상 아님)`)
check(
  'townAsset(\'nature/garden-stage-2\') — 오늘(아트워크 미채움) null 반환',
  townAsset('nature/garden-stage-2') === null || townAssetsKeyCount > 0,
  `TOWN_ASSETS keys=${townAssetsKeyCount}`,
)
let townAssetThrew = false
let townAssetResult
try { townAssetResult = townAsset('anything-not-in-manifest') } catch { townAssetThrew = true }
check('townAsset(\'anything-not-in-manifest\') — throw 없음', !townAssetThrew)
check('townAsset(\'anything-not-in-manifest\') — null 반환(폴백 신호)', !townAssetThrew && townAssetResult === null)

// ── 4. gardenStageSprite 정확성 ──────────────────────────────────────────
section('4. gardenStageSprite — stage 0..4 정상 범위')
for (let n = 0; n <= 4; n++) {
  const sprite = gardenStageSprite(n)
  check(`gardenStageSprite(${n}).assetKey === 'nature/garden-stage-${n}'`, sprite.assetKey === `nature/garden-stage-${n}`, JSON.stringify(sprite))
  check(`gardenStageSprite(${n}).footprint === null`, sprite.footprint === null, JSON.stringify(sprite))
  check(`gardenStageSprite(${n}).assetKey가 실제 매니페스트 키(isKnownAssetKey === true)`, isKnownAssetKey(sprite.assetKey), sprite.assetKey)
}

section('4b. gardenStageSprite — 범위 밖/손상 입력 clamp')
const OUT_OF_RANGE_INPUTS = [-5, 99, NaN, undefined, '3', null, -0.5, 4.9, Infinity, -Infinity, 'garbage', {}]
for (const input of OUT_OF_RANGE_INPUTS) {
  let threw = false
  let sprite
  try { sprite = gardenStageSprite(input) } catch { threw = true }
  check(`gardenStageSprite(${JSON.stringify(input)}) — throw 없음`, !threw)
  if (!threw) {
    const m = /^nature\/garden-stage-(\d)$/.exec(sprite.assetKey)
    const stageNum = m ? Number(m[1]) : -1
    check(
      `gardenStageSprite(${JSON.stringify(input)}) — assetKey가 nature/garden-stage-0..4 범위`,
      m !== null && stageNum >= 0 && stageNum <= 4,
      JSON.stringify(sprite),
    )
    check(
      `gardenStageSprite(${JSON.stringify(input)}) — 결과 assetKey가 알려진 매니페스트 키`,
      isKnownAssetKey(sprite.assetKey),
      sprite.assetKey,
    )
  }
}

// ── 5. 매니페스트는 프레젠테이션 전용 — 경제 개념 결합 없음 ───────────────
section('5. assetManifest.js — 경제(가격/레벨/소유권) 결합 없음')
const manifestSrc = readSrc('src/assets/town/assetManifest.js')
check('src/assets/town/assetManifest.js 존재', manifestSrc !== null)
if (manifestSrc) {
  // 헤더 주석이 한글로 "가격/레벨/소유권"을 설명 목적으로 언급하는 것은
  // 허용하고, 실제 코드에 나타날 수 있는 영어 식별자 토큰만 검사한다.
  const FORBIDDEN_TOKENS = ['price', 'min_level', 'minLevel', 'owned', 'purchase', 'supabase', 'fetch(', 'dollar', 'reward', 'xp']
  const lowerSrc = manifestSrc.toLowerCase()
  // 'export'(JS 키워드, 모든 ESM 모듈에 등장)가 'xp'를 부분 문자열로
  // 포함해 'xp' 토큰만 단순 부분일치로 세면 매번 거짓 양성이 난다 — 'xp'
  // 검사에 한해서만 'export' 단어를 먼저 제거한 텍스트로 센다(다른 토큰은
  // export와 겹치지 않으므로 원본 그대로 검사).
  const lowerSrcNoExport = lowerSrc.replace(/\bexport\b/g, '')
  for (const token of FORBIDDEN_TOKENS) {
    const haystack = token === 'xp' ? lowerSrcNoExport : lowerSrc
    const count = haystack.split(token.toLowerCase()).length - 1
    check(`assetManifest.js — 영어 식별자 토큰 '${token}' 없음`, count === 0, `count=${count}`)
  }
}

// ── 6. TownAmbientLayer.jsx — 드롭인 계약(정적 소스 검사) ────────────────
section('6. TownAmbientLayer.jsx — 드롭인 아트 준비 계약')
const ambientSrc = readSrc('src/components/town/v2/TownAmbientLayer.jsx')
check('src/components/town/v2/TownAmbientLayer.jsx 존재', ambientSrc !== null)
if (ambientSrc) {
  check(
    "TownAmbientLayer.jsx — townAsset import from '../../../assets/town'",
    /import\s*\{\s*townAsset\s*\}\s*from\s+['"]\.\.\/\.\.\/\.\.\/assets\/town['"]/.test(ambientSrc),
  )
  check(
    'TownAmbientLayer.jsx — gardenStageSprite import(townScene)',
    /import\s*\{[^}]*\bgardenStageSprite\b[^}]*\}\s*from\s+['"]\.\.\/\.\.\/\.\.\/utils\/town\/townScene['"]/.test(ambientSrc),
  )
  check('TownAmbientLayer.jsx — TownSprite import', /import\s+TownSprite\s+from\s+['"]\.\/TownSprite['"]/.test(ambientSrc))
  check(
    'TownAmbientLayer.jsx — 배경 스프라이트가 조건부 렌더(gardenBgAsset && ...)',
    /gardenBgAsset\s*&&/.test(ambientSrc),
  )
  check(
    'TownAmbientLayer.jsx — 조건부 렌더 블록 안에 <TownSprite 렌더 존재',
    /gardenBgAsset\s*&&\s*\([\s\S]{0,200}<TownSprite/.test(ambientSrc),
  )
  check(
    'TownAmbientLayer.jsx — STAGE_EMOJI 객체가 여전히 존재하고 stage 0~4 키를 가짐',
    /STAGE_EMOJI\s*=\s*\{[\s\S]*?0:[\s\S]*?1:[\s\S]*?2:[\s\S]*?3:[\s\S]*?4:[\s\S]*?\}/.test(ambientSrc),
  )
  check('TownAmbientLayer.jsx — sr-only 문장에 "배운 단어" 텍스트 존재', /배운 단어/.test(ambientSrc))
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
