// scripts/testEnvArtManifest.mjs — Paul Town V2 environment art manifest
// test suite (2026-09-17). Same check/section/summary style as
// scripts/testTownSceneV2.mjs. Pure Node, no React/DOM/network. Exercises
// scripts/validateEnvArtManifest.mjs against:
//   1. the real docs/design/town/manifest/env-art-batch1.spec.json (structural
//      facts about the spec itself)
//   2. the real docs/design/town/manifest/env-art-manifest.json (must PASS
//      the validator with 0 errors/0 warnings in its fresh all-"missing"
//      state, plus spot-checks on specific asset entries)
//   3. a hand-built bad manifest (duplicate key at the raw-JSON-text level,
//      forbidden field, wrong px1x, unknown depthLayer) written to
//      scripts/.tmp/ (git-ignored) — every one of the 4 injected problems
//      must be caught.

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import {
  DEFAULT_MANIFEST,
  DEFAULT_SPEC,
  FORBIDDEN_FIELDS,
  ALLOWED_DEPTH_LAYER,
  ALLOWED_REPEAT,
  ALLOWED_CATEGORY,
  ALLOWED_KIND,
  ALLOWED_ANCHOR,
  ALLOWED_UNLOCK_VISIBILITY,
  ALLOWED_STATUS,
  FALLBACK_BY_KIND,
  checkDuplicateAssetKeys,
  validateManifestObject,
  validateManifestText,
  validateManifestFiles,
  resolveSafeTrackedEnvPath,
} from './validateEnvArtManifest.mjs'

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

// ── 1. spec.json structural facts ───────────────────────────────────────────
section('1. env-art-batch1.spec.json — structural facts')

check('spec 파일 존재', existsSync(DEFAULT_SPEC), DEFAULT_SPEC)
const specDoc = JSON.parse(readFileSync(DEFAULT_SPEC, 'utf8'))
check('spec.count === 38', specDoc.count === 38, `got=${specDoc.count}`)
const specKeys = Object.keys(specDoc.assets)
check('spec.assets 키 개수 === 38', specKeys.length === 38, `got=${specKeys.length}`)
check(
  '모든 spec 엔트리 asset_key === 객체 키',
  specKeys.every((k) => specDoc.assets[k].asset_key === k),
)
check(
  '모든 spec 엔트리 px2x가 [w,h] 숫자 쌍',
  specKeys.every((k) => Array.isArray(specDoc.assets[k].px2x) && specDoc.assets[k].px2x.length === 2 && specDoc.assets[k].px2x.every((n) => Number.isFinite(n) && n > 0)),
)
const filenames = specKeys.map((k) => specDoc.assets[k].filename)
check('모든 filename이 .webp로 끝남', filenames.every((f) => f.endsWith('.webp')))
check('filename 38개 전부 유일(중복 없음)', new Set(filenames).size === 38, `unique=${new Set(filenames).size}`)

check("maxBytes2x: grass-base === 120KB(특례)", specDoc.assets['grass-base'].maxBytes2x === 120 * 1024)
check("maxBytes2x: sky-hills === 200KB(sky 특례)", specDoc.assets['sky-hills'].maxBytes2x === 200 * 1024)
const tileKeysExGrassBase = specKeys.filter((k) => specDoc.assets[k].kind === 'tile' && k !== 'grass-base')
check(
  'grass-base/river-straight를 제외한 모든 tile kind === 80KB (river-straight는 2026-09-17 운영자 결정으로 128KB 특례)',
  tileKeysExGrassBase.length > 0 && tileKeysExGrassBase.every((k) => specDoc.assets[k].maxBytes2x === (k === 'river-straight' ? 128 * 1024 : 80 * 1024)),
  `n=${tileKeysExGrassBase.length}`,
)
const patchKeys = specKeys.filter((k) => specDoc.assets[k].kind === 'patch')
check('모든 patch kind === 128KB (2026-09-18 운영자 결정 patch: all128)', patchKeys.length > 0 && patchKeys.every((k) => specDoc.assets[k].maxBytes2x === 128 * 1024), `n=${patchKeys.length}`)
const spriteKeys = specKeys.filter((k) => specDoc.assets[k].kind === 'sprite')
check('모든 sprite kind === 40KB', spriteKeys.length > 0 && spriteKeys.every((k) => specDoc.assets[k].maxBytes2x === 40 * 1024), `n=${spriteKeys.length}`)

check('모든 sprite marginPctMin === 4', spriteKeys.every((k) => specDoc.assets[k].marginPctMin === 4))
const nonSpriteKeys = specKeys.filter((k) => specDoc.assets[k].kind !== 'sprite')
check('모든 non-sprite(tile/patch/band) marginPctMin === 0', nonSpriteKeys.every((k) => specDoc.assets[k].marginPctMin === 0))

const seamAxisKeys = specKeys.filter((k) => specDoc.assets[k].seamAxis)
check('seamAxis가 설정된 키는 정확히 4개(grass-base/path-straight/path-straight-narrow/river-straight)', seamAxisKeys.length === 4, JSON.stringify(seamAxisKeys))
check("grass-base seamAxis === 'xy'", specDoc.assets['grass-base'].seamAxis === 'xy')
check("path-straight seamAxis === 'y'", specDoc.assets['path-straight'].seamAxis === 'y')
check("river-straight seamAxis === 'y'", specDoc.assets['river-straight'].seamAxis === 'y')

// ── 2. real manifest — validator PASS + spot checks ─────────────────────────
section('2. env-art-manifest.json — validator PASS + spot checks')

check('manifest 파일 존재', existsSync(DEFAULT_MANIFEST), DEFAULT_MANIFEST)
const manifestResult = validateManifestFiles(DEFAULT_MANIFEST, DEFAULT_SPEC)
check('실제 매니페스트 — 에러 0건', manifestResult.errors.length === 0, JSON.stringify(manifestResult.errors))
check('실제 매니페스트 — 경고 0건(art-staging/ 부재 시 src/assets/town/env 트래킹 파일로 폴백)', manifestResult.warnings.length === 0, JSON.stringify(manifestResult.warnings))

const manifestDoc = JSON.parse(readFileSync(DEFAULT_MANIFEST, 'utf8'))
const mAssets = manifestDoc.assets
const mKeys = Object.keys(mAssets)
check('manifest.count === 38', manifestDoc.count === 38)
check('manifest 키 개수 === spec 키 개수', mKeys.length === specKeys.length, `${mKeys.length} vs ${specKeys.length}`)
check('spec/manifest 키 집합이 정확히 동일', specKeys.every((k) => mKeys.includes(k)) && mKeys.every((k) => specKeys.includes(k)))

// 2026-09-17 실물 아트 1차 ingest 이후: 초기 상태(전부 missing) 단언은 상태 일관성 단언으로 교체.
check('모든 엔트리 status ∈ {missing, staged, rejected}', mKeys.every((k) => ['missing', 'staged', 'rejected'].includes(mAssets[k].status)))
check('status=missing 엔트리는 stagedPath/sha256/bytes2x === null', mKeys.filter((k) => mAssets[k].status === 'missing').every((k) => mAssets[k].stagedPath === null && mAssets[k].sha256 === null && mAssets[k].bytes2x === null))
check('status=staged 엔트리는 stagedPath(art-staging/)·sha256(64hex)·bytes2x(>0) 보유', mKeys.filter((k) => mAssets[k].status === 'staged').every((k) => typeof mAssets[k].stagedPath === 'string' && mAssets[k].stagedPath.startsWith('art-staging/') && /^[0-9a-f]{64}$/.test(mAssets[k].sha256) && Number.isInteger(mAssets[k].bytes2x) && mAssets[k].bytes2x > 0))
check('status=rejected 엔트리는 rejectionReasons 비어있지 않음', mKeys.filter((k) => mAssets[k].status === 'rejected').every((k) => Array.isArray(mAssets[k].rejectionReasons) && mAssets[k].rejectionReasons.length > 0))
check('px1x === px2x/2 (전체)', mKeys.every((k) => mAssets[k].px1x[0] === mAssets[k].px2x[0] / 2 && mAssets[k].px1x[1] === mAssets[k].px2x[1] / 2))
for (const forbidden of FORBIDDEN_FIELDS) {
  check(`금지 필드 부재(전체): '${forbidden}'`, mKeys.every((k) => !Object.prototype.hasOwnProperty.call(mAssets[k], forbidden)))
}
check('모든 category가 허용 집합 안', mKeys.every((k) => ALLOWED_CATEGORY.has(mAssets[k].category)))
check('모든 kind가 허용 집합 안', mKeys.every((k) => ALLOWED_KIND.has(mAssets[k].kind)))
check('모든 anchor가 허용 집합 안', mKeys.every((k) => ALLOWED_ANCHOR.has(mAssets[k].anchor)))
check('모든 depthLayer가 허용 집합 안(terrain|water|path|scenery|foregroundVegetation)', mKeys.every((k) => ALLOWED_DEPTH_LAYER.has(mAssets[k].depthLayer)))
check('모든 repeat가 허용 집합 안', mKeys.every((k) => ALLOWED_REPEAT.has(mAssets[k].repeat)))
check('모든 unlockVisibility가 허용 집합 안(always|region)', mKeys.every((k) => ALLOWED_UNLOCK_VISIBILITY.has(mAssets[k].unlockVisibility)))
check('모든 status가 허용 집합 안', mKeys.every((k) => ALLOWED_STATUS.has(mAssets[k].status)))
check(
  'fallback이 kind에 맞게 일관됨(tile/patch/band→css, sprite→hide)',
  mKeys.every((k) => mAssets[k].fallback === FALLBACK_BY_KIND[mAssets[k].kind]),
)

const regionKeys = mKeys.filter((k) => mAssets[k].unlockVisibility === 'region')
check('unlockVisibility=region인 키는 전부 region 필드를 가짐', regionKeys.every((k) => typeof mAssets[k].region === 'string'))
check("path-junction.unlockVisibility === 'region' && region === 'lane'", mAssets['path-junction'].unlockVisibility === 'region' && mAssets['path-junction'].region === 'lane')
check("path-straight-narrow region === 'school'", mAssets['path-straight-narrow'].region === 'school')
check("flower-pot-tall region === 'square'", mAssets['flower-pot-tall'].region === 'square')
check("path-straight.unlockVisibility === 'always'(집 앞 도어스텝~포크 구간)", mAssets['path-straight'].unlockVisibility === 'always')
check("grass-base.unlockVisibility === 'always'", mAssets['grass-base'].unlockVisibility === 'always')

check("fence-corner(sprite) fallback === 'hide'", mAssets['fence-corner'].fallback === 'hide')
check("grass-base(tile) fallback === 'css'", mAssets['grass-base'].fallback === 'css')
check("sky-hills(band) fallback === 'css'", mAssets['sky-hills'].fallback === 'css')
check("riverbank-reeds(river 카테고리, sprite kind) fallback === 'hide'(kind 기준 오버라이드)", mAssets['riverbank-reeds'].fallback === 'hide')

check("shrub-round depthLayer === 'foregroundVegetation'", mAssets['shrub-round'].depthLayer === 'foregroundVegetation')
check("fence-straight depthLayer === 'scenery'", mAssets['fence-straight'].depthLayer === 'scenery')
check("river-straight depthLayer === 'water'", mAssets['river-straight'].depthLayer === 'water')
check("path-straight depthLayer === 'path'", mAssets['path-straight'].depthLayer === 'path')
check("grass-base depthLayer === 'terrain'", mAssets['grass-base'].depthLayer === 'terrain')

check("path-straight-narrow.variantFamily === 'path-straight'", mAssets['path-straight-narrow'].variantFamily === 'path-straight')
check("fence-gate-closed.variantFamily === 'fence-gate'", mAssets['fence-gate-closed'].variantFamily === 'fence-gate')
check("riverbank-reeds-stones.variantFamily === 'riverbank-reeds'", mAssets['riverbank-reeds-stones'].variantFamily === 'riverbank-reeds')

check('raw JSON 텍스트 레벨 중복 키 스캔 — 실제 매니페스트는 0건', checkDuplicateAssetKeys(readFileSync(DEFAULT_MANIFEST, 'utf8')).length === 0)

// ── 3. hand-built bad manifest — every injected problem must be caught ──────
section('3. 인위적 bad manifest — 4개 결함이 전부 잡히는지')

const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })
const BAD_MANIFEST_PATH = path.join(TMP_DIR, 'env-art-manifest.bad.json')

const validEntryTemplate = (key, overrides = {}) => ({
  asset_key: key,
  filename: `${key}.webp`,
  category: 'prop',
  kind: 'sprite',
  px2x: [64, 64],
  px1x: [32, 32],
  transparent: true,
  anchor: 'bottom-center',
  renderedPx: 'x px',
  depthLayer: 'scenery',
  repeat: 'none',
  variantFamily: key,
  fallback: 'hide',
  unlockVisibility: 'always',
  status: 'missing',
  stagedPath: null,
  sha256: null,
  bytes2x: null,
  notes: 'n',
  ...overrides,
})

// Written by hand as a raw string (not JSON.stringify(object)) specifically
// so the "dup-key" object key can appear TWICE at the source-text level —
// JSON.stringify from a real JS object could never produce that, since JS
// objects cannot hold two same-named properties in the first place.
const dupEntryJson = (suffix) => JSON.stringify(validEntryTemplate('dup-key', { notes: `dup ${suffix}` }))
const forbiddenEntryJson = JSON.stringify(validEntryTemplate('forbidden-field-key', { price: 999 }))
const badPx1xEntryJson = JSON.stringify(validEntryTemplate('bad-px1x-key', { px1x: [10, 10] }))
const badLayerEntryJson = JSON.stringify(validEntryTemplate('bad-layer-key', { depthLayer: 'unknown-layer' }))

const badManifestText = `{
  "assets": {
    "dup-key": ${dupEntryJson('first')},
    "dup-key": ${dupEntryJson('second')},
    "forbidden-field-key": ${forbiddenEntryJson},
    "bad-px1x-key": ${badPx1xEntryJson},
    "bad-layer-key": ${badLayerEntryJson}
  }
}`

// sanity: this really does contain the literal object KEY "dup-key": twice
// in the source text (not just twice total — "dup-key" also appears as a
// VALUE inside each entry's own asset_key/variantFamily fields, e.g.
// "asset_key": "dup-key", which is why this checks the "dup-key": key-form
// specifically rather than any occurrence of the bare string).
check('bad manifest 원문에 객체 키 "dup-key": 가 정확히 2회 등장', (badManifestText.match(/"dup-key":/g) || []).length === 2)

writeFileSync(BAD_MANIFEST_PATH, badManifestText)

// 3a. in-memory (no disk round-trip) — validateManifestText directly
const badResultText = validateManifestText(badManifestText, null, {})
check('bad manifest(텍스트) — 에러 1건 이상', badResultText.errors.length > 0, `n=${badResultText.errors.length}`)
check('bad manifest(텍스트) — 중복 키 에러 포착(raw text scan)', badResultText.errors.some((e) => e.includes('duplicate key') && e.includes('dup-key')))
check('bad manifest(텍스트) — 금지 필드 에러 포착', badResultText.errors.some((e) => e.includes('forbidden field') && e.includes('price')))
check('bad manifest(텍스트) — px1x 불일치 에러 포착', badResultText.errors.some((e) => e.includes('bad-px1x-key') && e.includes('px1x')))
check('bad manifest(텍스트) — 알 수 없는 depthLayer 에러 포착', badResultText.errors.some((e) => e.includes('bad-layer-key') && e.includes('depthLayer')))

// 3b. disk round-trip — validateManifestFiles against the written file (no spec cross-check, pass null spec path via nonexistent file)
const badResultFile = validateManifestFiles(BAD_MANIFEST_PATH, path.join(TMP_DIR, 'nonexistent-spec.json'))
check('bad manifest(디스크) — validateManifestFiles도 동일 에러 4종을 포착', [
  badResultFile.errors.some((e) => e.includes('duplicate key') && e.includes('dup-key')),
  badResultFile.errors.some((e) => e.includes('forbidden field') && e.includes('price')),
  badResultFile.errors.some((e) => e.includes('bad-px1x-key') && e.includes('px1x')),
  badResultFile.errors.some((e) => e.includes('bad-layer-key') && e.includes('depthLayer')),
].every(Boolean), JSON.stringify(badResultFile.errors))
check('bad manifest(디스크) — spec 파일 없음 경고 발생', badResultFile.warnings.some((w) => w.includes('spec')))

// 3c. sanity — a manifest with NO injected problems should NOT trip these 4 checks
const goodOne = { assets: { 'ok-key': validEntryTemplate('ok-key') } }
const goodResult = validateManifestObject(goodOne, null, {})
check('정상 엔트리 1개짜리 매니페스트 — 에러 0건(대조군)', goodResult.errors.length === 0, JSON.stringify(goodResult.errors))
check('checkDuplicateAssetKeys — 정상 텍스트는 빈 배열', checkDuplicateAssetKeys(JSON.stringify(goodOne)).length === 0)

// ── 4. tracked-asset fallback (art-staging/ absent) — secure fallback ───────
// 2026-09-19 — art-staging/ is gitignored, so a fresh checkout/CI never has
// the staged file on disk. validateEnvArtManifest.mjs falls back to the
// already-committed copy at src/assets/town/env/<filename> and runs the
// SAME sha256/bytes2x integrity checks against it. This section proves that
// fallback is both functional (matches -> 0 errors/no warning) and secure
// (tampered content/size still ERRORs, unsafe filenames are rejected outright
// and never resolve outside the tracked dir, staged still wins when present).
section('4. status=staged 폴백(art-staging/ 부재) — tracked src/assets/town/env 사용')

const stagedTemplateKey = mKeys.find((k) => mAssets[k].status === 'staged')
check('폴백 테스트용 실제 staged 엔트리 템플릿 존재', !!stagedTemplateKey, `stagedCount=${mKeys.filter((k) => mAssets[k].status === 'staged').length}`)
const stagedTemplate = JSON.parse(JSON.stringify(mAssets[stagedTemplateKey]))
const cloneStagedEntry = (overrides = {}) => ({ ...JSON.parse(JSON.stringify(stagedTemplate)), ...overrides })

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const GOOD_BYTES = Buffer.from('paul-town-env-art-fallback-fixture-content-v1')
const WRONG_CONTENT_SAME_LEN_BYTES = Buffer.alloc(GOOD_BYTES.length, 0x58) // all 'X', same length, different sha256
const GOOD_SHA = sha256Hex(GOOD_BYTES)

const FALLBACK_TMP_BASE = path.join(TMP_DIR, 'env-art-fallback')
function makeScenarioDirs(name) {
  const base = path.join(FALLBACK_TMP_BASE, name)
  const root = path.join(base, 'root')
  const trackedEnvDir = path.join(base, 'tracked-env')
  mkdirSync(root, { recursive: true })
  mkdirSync(trackedEnvDir, { recursive: true })
  return { root, trackedEnvDir }
}

// 4a. staged absent + tracked fallback present + matching sha/bytes -> 0 errors, no 'not found on disk' warning.
{
  const dirs = makeScenarioDirs('scenario1-match')
  const entry = cloneStagedEntry({
    asset_key: 'fallback-ok',
    filename: 'fallback-ok.webp',
    stagedPath: 'art-staging/batch1/fallback-ok.webp',
    sha256: GOOD_SHA,
    bytes2x: GOOD_BYTES.length,
  })
  writeFileSync(path.join(dirs.trackedEnvDir, 'fallback-ok.webp'), GOOD_BYTES)
  const result = validateManifestObject({ assets: { 'fallback-ok': entry } }, null, dirs)
  check('4a. staged 부재 + tracked 폴백 일치 — 에러 0건', result.errors.length === 0, JSON.stringify(result.errors))
  check("4a. staged 부재 + tracked 폴백 일치 — 'not found on disk' 경고 없음", !result.warnings.some((w) => w.includes('not found on disk')))
}

// 4b. staged absent + fallback present but content differs -> sha256 mismatch ERROR (integrity preserved).
{
  const dirs = makeScenarioDirs('scenario2-sha-mismatch')
  const entry = cloneStagedEntry({
    asset_key: 'fallback-bad-sha',
    filename: 'fallback-bad-sha.webp',
    stagedPath: 'art-staging/batch1/fallback-bad-sha.webp',
    sha256: GOOD_SHA,
    bytes2x: GOOD_BYTES.length,
  })
  writeFileSync(path.join(dirs.trackedEnvDir, 'fallback-bad-sha.webp'), WRONG_CONTENT_SAME_LEN_BYTES)
  const result = validateManifestObject({ assets: { 'fallback-bad-sha': entry } }, null, dirs)
  check('4b. staged 부재 + tracked 폴백 내용 다름(길이 동일) — sha256 mismatch 에러 포착', result.errors.some((e) => e.includes('sha256 mismatch')), JSON.stringify(result.errors))
  check('4b. 동일 케이스 — bytes2x mismatch는 발생하지 않음(길이는 동일)', !result.errors.some((e) => e.includes('bytes2x mismatch')))
}

// 4c. staged absent + fallback present, actual bytes match content but manifest's declared bytes2x is wrong -> bytes2x mismatch ERROR.
{
  const dirs = makeScenarioDirs('scenario3-bytes-mismatch')
  const entry = cloneStagedEntry({
    asset_key: 'fallback-bad-bytes',
    filename: 'fallback-bad-bytes.webp',
    stagedPath: 'art-staging/batch1/fallback-bad-bytes.webp',
    sha256: GOOD_SHA,
    bytes2x: GOOD_BYTES.length + 1, // manifest declares wrong bytes2x
  })
  writeFileSync(path.join(dirs.trackedEnvDir, 'fallback-bad-bytes.webp'), GOOD_BYTES)
  const result = validateManifestObject({ assets: { 'fallback-bad-bytes': entry } }, null, dirs)
  check('4c. staged 부재 + tracked 폴백 sha 일치, manifest bytes2x 오기재 — bytes2x mismatch 에러 포착', result.errors.some((e) => e.includes('bytes2x mismatch')), JSON.stringify(result.errors))
  check('4c. 동일 케이스 — sha256 mismatch는 발생하지 않음(내용 자체는 일치)', !result.errors.some((e) => e.includes('sha256 mismatch')))
}

// 4d. staged absent + fallback absent -> pre-existing 'not found on disk' WARNING still appears, 0 hash errors.
{
  const dirs = makeScenarioDirs('scenario4-both-absent')
  const entry = cloneStagedEntry({
    asset_key: 'fallback-missing',
    filename: 'fallback-missing.webp',
    stagedPath: 'art-staging/batch1/fallback-missing.webp',
    sha256: GOOD_SHA,
    bytes2x: GOOD_BYTES.length,
  })
  const result = validateManifestObject({ assets: { 'fallback-missing': entry } }, null, dirs)
  check("4d. staged 부재 + tracked 폴백도 부재 — 'not found on disk' 경고 유지", result.warnings.some((w) => w.includes('not found on disk')), JSON.stringify(result.warnings))
  check('4d. 동일 케이스 — sha256/bytes2x mismatch 에러는 없음(파일 자체를 못 읽었으므로 비교 안 함)', !result.errors.some((e) => e.includes('sha256 mismatch') || e.includes('bytes2x mismatch')))
}

// 4e. staged present takes precedence over the tracked fallback, even when the fallback would have been correct.
{
  const dirs = makeScenarioDirs('scenario5-staged-precedence')
  const stagedRelPath = 'art-staging/batch1/fallback-precedence.webp'
  const entry = cloneStagedEntry({
    asset_key: 'fallback-precedence',
    filename: 'fallback-precedence.webp',
    stagedPath: stagedRelPath,
    sha256: GOOD_SHA,
    bytes2x: GOOD_BYTES.length,
  })
  const stagedAbsPath = path.join(dirs.root, stagedRelPath)
  mkdirSync(path.dirname(stagedAbsPath), { recursive: true })
  writeFileSync(stagedAbsPath, WRONG_CONTENT_SAME_LEN_BYTES) // staged file is WRONG
  writeFileSync(path.join(dirs.trackedEnvDir, 'fallback-precedence.webp'), GOOD_BYTES) // fallback would be CORRECT
  const result = validateManifestObject({ assets: { 'fallback-precedence': entry } }, null, dirs)
  check('4e. staged 파일 존재 시 우선 사용됨(내용이 틀리면 폴백이 맞아도 에러)', result.errors.some((e) => e.includes('sha256 mismatch')), JSON.stringify(result.errors))
  check("4e. staged 우선 사용 케이스 — 'not found on disk' 경고 없음(staged가 실제로 존재해 읽혔음)", !result.warnings.some((w) => w.includes('not found on disk')))
}

// 4f. unsafe filenames for the fallback are rejected outright (no read attempt), and a sentinel placed
// outside trackedEnvDir can never be accepted as a match even if it happens to contain matching bytes.
{
  const dirs = makeScenarioDirs('scenario6-unsafe-filename')
  const sentinelOutsidePath = path.join(dirs.trackedEnvDir, '..', 'evil.webp')
  writeFileSync(sentinelOutsidePath, GOOD_BYTES) // matching content — must NEVER be treated as a valid fallback match

  check("4f. resolveSafeTrackedEnvPath('../evil.webp', ...) === null(직접 단위 테스트)", resolveSafeTrackedEnvPath('../evil.webp', dirs.trackedEnvDir) === null)
  check("4f. resolveSafeTrackedEnvPath('sub\\\\evil.webp', ...) === null(백슬래시, 직접 단위 테스트)", resolveSafeTrackedEnvPath('sub\\evil.webp', dirs.trackedEnvDir) === null)

  const traversalEntry = cloneStagedEntry({
    asset_key: 'traversal-key',
    filename: '../evil.webp',
    stagedPath: 'art-staging/batch1/never-exists.webp',
    sha256: GOOD_SHA,
    bytes2x: GOOD_BYTES.length,
  })
  const traversalResult = validateManifestObject({ assets: { 'traversal-key': traversalEntry } }, null, dirs)
  check("4f. filename='../evil.webp' — unsafe filename 에러 포착(읽기 시도 없이 즉시 거부)", traversalResult.errors.some((e) => e.includes('unsafe filename') && e.includes('../evil.webp')), JSON.stringify(traversalResult.errors))
  check("4f. 트래버설 케이스 — sha256/bytes2x mismatch 에러 없음(파일을 읽지 않았으므로)", !traversalResult.errors.some((e) => e.includes('sha256 mismatch') || e.includes('bytes2x mismatch')))
  check("4f. 트래버설 케이스 — 'not found on disk' 경고 없음(unsafe는 경고가 아니라 에러)", !traversalResult.warnings.some((w) => w.includes('not found on disk')))

  const backslashEntry = cloneStagedEntry({
    asset_key: 'backslash-key',
    filename: 'sub\\evil.webp',
    stagedPath: 'art-staging/batch1/never-exists-2.webp',
    sha256: GOOD_SHA,
    bytes2x: GOOD_BYTES.length,
  })
  const backslashResult = validateManifestObject({ assets: { 'backslash-key': backslashEntry } }, null, dirs)
  check("4f. filename='sub\\\\evil.webp' — unsafe filename 에러 포착", backslashResult.errors.some((e) => e.includes('unsafe filename')), JSON.stringify(backslashResult.errors))
}

// cleanup — this section's own temp dirs only (does not touch scripts/.tmp/env-art-manifest.bad.json from section 3).
rmSync(FALLBACK_TMP_BASE, { recursive: true, force: true })

// ── result ───────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
