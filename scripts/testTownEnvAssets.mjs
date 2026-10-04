// scripts/testTownEnvAssets.mjs — Paul Town V2 환경 아트 레지스트리
// (src/assets/town/env/*.webp + index.js) 순수 단위 테스트(2026-09-18).
//
// 검증 대상: docs/design/town/manifest/env-art-manifest.json(status="staged"
// 35개)과 src/assets/town/env/의 실제 파일 집합/해시/크기가 정확히
// 일치하는지, index.js가 그 35개 키만 export하는지, 그리고 이 레지스트리가
// src/components/town/v2/*(+ 자기 자신) 밖에서는 전혀 import되지 않는지
// (V1/메인 번들이 paulTownV2 OFF 상태에서 env 이미지를 절대 요청하지 않는다
// 는 계약의 정적 증거).
//
// 번들링 불필요 — index.js는 .webp를 import하므로 esbuild/plain node
// import를 쓰지 않고(assetTarget이 없음) 소스 텍스트를 정규식으로만
// 검사한다(scripts/testTownV2Static.mjs와 동일 관례).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

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
function sha256Of(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

// ── 0. manifest/spec 로드 ─────────────────────────────────────────────────
section('0. manifest/spec JSON 로드')
const MANIFEST_PATH = path.join(ROOT, 'docs/design/town/manifest/env-art-manifest.json')
const SPEC_PATH = path.join(ROOT, 'docs/design/town/manifest/env-art-batch1.spec.json')
const ENV_DIR = path.join(ROOT, 'src/assets/town/env')

let manifest = null
let spec = null
if (check('env-art-manifest.json이 존재함', existsSync(MANIFEST_PATH))) {
  try { manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); check('env-art-manifest.json 파싱 가능', true) }
  catch (e) { check('env-art-manifest.json 파싱 가능', false, e.message) }
}
if (check('env-art-batch1.spec.json이 존재함', existsSync(SPEC_PATH))) {
  try { spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')); check('env-art-batch1.spec.json 파싱 가능', true) }
  catch (e) { check('env-art-batch1.spec.json 파싱 가능', false, e.message) }
}

if (!manifest || !spec) {
  console.log('\nmanifest/spec을 확보하지 못해 나머지 검증을 건너뜀.')
  console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
  process.exit(1)
}

const stagedEntries = Object.values(manifest.assets).filter((a) => a.status === 'staged')
const stagedKeys = stagedEntries.map((a) => a.asset_key).sort()
check('manifest — status=staged가 정확히 35개', stagedKeys.length === 35, `count=${stagedKeys.length}`)

// ── 1. 파일 집합 === staged 키 35개 ──────────────────────────────────────
section('1. src/assets/town/env/*.webp 파일 집합 === manifest staged 키')
const dirFiles = existsSync(ENV_DIR) ? readdirSync(ENV_DIR) : []
const webpFiles = dirFiles.filter((f) => f.endsWith('.webp'))
const webpKeys = webpFiles.map((f) => f.slice(0, -'.webp'.length)).sort()
check(
  'env/ 디렉터리의 .webp 파일 키 집합이 manifest staged 35개와 정확히 일치',
  JSON.stringify(webpKeys) === JSON.stringify(stagedKeys),
  `dir=${JSON.stringify(webpKeys)} manifest=${JSON.stringify(stagedKeys)}`,
)
const nonWebpNonIndex = dirFiles.filter((f) => f !== 'index.js' && !f.endsWith('.webp'))
check('env/ 디렉터리에 index.js/.webp 외 다른 파일이 없음(-1x/.png 등 미혼입)', nonWebpNonIndex.length === 0, JSON.stringify(nonWebpNonIndex))

// ── 2. 해시/크기 ──────────────────────────────────────────────────────────
section('2. 각 파일 sha256/bytes2x/maxBytes2x')
for (const entry of stagedEntries) {
  const key = entry.asset_key
  const filePath = path.join(ENV_DIR, `${key}.webp`)
  if (!check(`${key}.webp — 파일 존재`, existsSync(filePath))) continue
  const actualHash = sha256Of(filePath)
  check(`${key}.webp — sha256 일치`, actualHash === entry.sha256, `expected=${entry.sha256} actual=${actualHash}`)
  const actualSize = statSync(filePath).size
  if (entry.bytes2x != null) {
    check(`${key}.webp — bytes 일치(manifest bytes2x)`, actualSize === entry.bytes2x, `expected=${entry.bytes2x} actual=${actualSize}`)
  }
  const specEntry = spec.assets[key]
  if (check(`${key}.webp — spec에 대응 항목 존재`, !!specEntry)) {
    check(`${key}.webp — maxBytes2x 이하`, actualSize <= specEntry.maxBytes2x, `actual=${actualSize} max=${specEntry.maxBytes2x}`)
  }
}

// ── 3. index.js — TOWN_ENV_ASSETS 35개 키 + import 1:1 ──────────────────
section('3. src/assets/town/env/index.js — TOWN_ENV_ASSETS 35개 키 + import 매칭')
const indexSrc = readSrc('src/assets/town/env/index.js')
check('index.js 존재', indexSrc !== null)

const importMatches = indexSrc ? Array.from(indexSrc.matchAll(/^import\s+(\w+)\s+from\s+'\.\/([\w-]+)\.webp'$/gm)) : []
check('index.js — import 문이 정확히 35개', importMatches.length === 35, `count=${importMatches.length}`)
const importedKeys = importMatches.map((m) => m[2]).sort()
check(
  'index.js — import된 파일명 키 집합이 manifest staged 35개와 일치',
  JSON.stringify(importedKeys) === JSON.stringify(stagedKeys),
  `imported=${JSON.stringify(importedKeys)} manifest=${JSON.stringify(stagedKeys)}`,
)

const objBlockMatch = indexSrc ? /export const TOWN_ENV_ASSETS\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\)/.exec(indexSrc) : null
check('index.js — TOWN_ENV_ASSETS = Object.freeze({...}) 블록을 찾음', !!objBlockMatch)
const objKeys = objBlockMatch
  ? Array.from(objBlockMatch[1].matchAll(/'([\w-]+)':/g)).map((m) => m[1]).sort()
  : []
check('index.js — TOWN_ENV_ASSETS 키가 정확히 35개', objKeys.length === 35, `count=${objKeys.length}`)
check(
  'index.js — TOWN_ENV_ASSETS 키 집합이 manifest staged 35개와 일치(kebab-case asset_key 그대로)',
  JSON.stringify(objKeys) === JSON.stringify(stagedKeys),
  `keys=${JSON.stringify(objKeys)} manifest=${JSON.stringify(stagedKeys)}`,
)
check(
  'index.js — townEnvAsset()이 TOWN_ENV_ASSETS[key] || null 폴백 계약',
  !!indexSrc && /return\s+TOWN_ENV_ASSETS\[key\]\s*\|\|\s*null/.test(indexSrc),
)

// ── 4. import 범위 — src/components/town/v2/** + 자기 자신 밖에서 0건 ────
section('4. env 레지스트리 import 범위 — v2/* + 자기 자신 밖에서 0건')
function walk(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}
const SRC_DIR = path.join(ROOT, 'src')
const allSrcFiles = walk(SRC_DIR).filter((f) => /\.(js|jsx|ts|tsx)$/.test(f))
const V2_DIR_ABS = path.join(SRC_DIR, 'components', 'town', 'v2')
const ENV_INDEX_ABS = path.join(ENV_DIR, 'index.js')
const offenders = []
for (const file of allSrcFiles) {
  if (file === ENV_INDEX_ABS) continue
  if (file.startsWith(V2_DIR_ABS + path.sep)) continue
  const src = readFileSync(file, 'utf8')
  if (src.includes('assets/town/env')) offenders.push(path.relative(ROOT, file))
}
check(
  'src/ 트리 전체에서 v2/* + env/index.js 자신을 제외하면 "assets/town/env" 문자열이 0건',
  offenders.length === 0,
  JSON.stringify(offenders),
)

// ── 5. 대표 자산 sha256 접두 ──────────────────────────────────────────────
section('5. 대표 자산 sha256 접두(오너 승인 2026-09-18)')
function checkPrefix(key, prefix) {
  const entry = manifest.assets[key]
  check(`${key} — manifest sha256이 ${prefix}로 시작`, !!entry && typeof entry.sha256 === 'string' && entry.sha256.startsWith(prefix), entry ? entry.sha256 : '(no entry)')
  const filePath = path.join(ENV_DIR, `${key}.webp`)
  if (existsSync(filePath)) {
    const actualHash = sha256Of(filePath)
    check(`${key}.webp — 실파일 sha256이 ${prefix}로 시작`, actualHash.startsWith(prefix), actualHash)
  }
}
checkPrefix('shrub-wide', '5dc24710')
checkPrefix('flower-cluster-pink', '7224f4ba')
checkPrefix('flower-cluster-yellow', '21dcca45')

// ── 결과 ──────────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (totalFailed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
} else {
  console.log('\n전체 PASS')
}
