// scripts/testPaulSpriteAssets.mjs — Paul Town 2.5D "Paul" 캐릭터 실제
// 스프라이트 자산(PNG 16장(8프레임 x 1x/2x) + 라이선스 문서 + 레지스트리
// index.js + 프로덕션 기본 매니페스트 characterSpriteManifest.default.js)
// 순수 단위 테스트(Phase 6C, 2026-09-24).
//
// scripts/testPaulSpriteIngest.mjs는 이미지가 아직 도착하지 않은 상태
// (src/assets/town/character/에 README.md만 존재)를 전제로 순수 함수/CLI
// 계약을 검증했다(그 파일은 이 세션이 소유하지 않는다 — CLAUDE.md 규칙 16,
// 이 파일은 "이미지가 실제로 도착한 뒤"의 상태만 별도로 검증한다). 이
// 스위트가 검사하는 8개 PNG(x2배율)/LICENSE.txt/NOTICE.md/index.js는 전부
// 동시에 작업 중인 다른 세션("install")이 소유·작성한다 — 이 스크립트는
// 그 산출물을 읽기만 하고 절대 쓰지 않는다.
//
// 외부 의존성 0개(CLAUDE.md 규칙 6) — PNG 디코딩은
// scripts/validateTownAssetCandidate.mjs의 decodePng를, 잉크 bbox/코너
// 알파 분석은 scripts/spriteIngestPaul.mjs가 이미 export해 둔 순수 함수
// (computeInkBbox/alphaAt)를 재사용한다(재구현 없음, CLAUDE.md 규칙 3).
// esbuild(기존 devDependency)만 번들링에 쓴다.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'
import { decodePng, analyzeAlpha } from './validateTownAssetCandidate.mjs'
import { computeInkBbox, alphaAt } from './spriteIngestPaul.mjs'
import { PAUL_SPRITE_FILES, PAUL_SPRITE_DIR } from '../src/utils/town/proto2_5d/paulSpriteManifest.js'
import { SPRITE_FRAME_IDS, validateSpriteManifest } from '../src/utils/town/proto2_5d/characterSpriteContract.js'

const ROOT = process.cwd()
const CHARACTER_DIR = path.join(ROOT, PAUL_SPRITE_DIR)
const SRC_DIR = path.join(ROOT, 'src')
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')

let totalPassed = 0
let totalFailed = 0
const failures = []
function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

// ── 사전 확인 — install 세션의 산출물이 실제로 도착했는지 ────────────────
section('0. 사전 확인 — install 세션 산출물 존재')
{
  const sitAt2x = path.join(CHARACTER_DIR, 'paul-sit@2x.png')
  if (!check('src/assets/town/character/paul-sit@2x.png 존재(install 세션 완료 신호)', existsSync(sitAt2x))) {
    console.log('\ninstall 세션의 PNG 산출물이 아직 도착하지 않음 — 나머지 검증을 건너뜀.')
    console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
    process.exitCode = 1
    process.exit()
  }
}

// frameId -> {file1x, file2x} 맵(paulSpriteManifest.js PAUL_SPRITE_FILES를
// 그대로 재사용 — 파일명 재정의 없음).
const FRAME_FILES = SPRITE_FRAME_IDS.map((frameId) => ({
  frameId,
  file1x: PAUL_SPRITE_FILES[frameId],
  file2x: PAUL_SPRITE_FILES[frameId].replace(/\.png$/, '@2x.png'),
}))

// ── 1. 16개 파일 존재 + 정확한 치수로 디코딩 ─────────────────────────────
section('1. 16개 PNG(8프레임 x 1x/2x) — 존재 + decodePng로 96x128(1x)/192x256(2x) RGBA 디코딩')
const decoded1x = {}
const decoded2x = {}
for (const { frameId, file1x, file2x } of FRAME_FILES) {
  const p1 = path.join(CHARACTER_DIR, file1x)
  const p2 = path.join(CHARACTER_DIR, file2x)
  if (check(`${file1x} 존재`, existsSync(p1))) {
    try {
      const d = decodePng(readFileSync(p1))
      decoded1x[frameId] = d
      check(`${file1x} — 96x128 RGBA(colorType=6)로 디코딩됨`, d.width === 96 && d.height === 128 && d.colorType === 6, `${d.width}x${d.height} colorType=${d.colorType}`)
    } catch (e) {
      check(`${file1x} — decodePng 성공`, false, e.message)
    }
  }
  if (check(`${file2x} 존재`, existsSync(p2))) {
    try {
      const d = decodePng(readFileSync(p2))
      decoded2x[frameId] = d
      check(`${file2x} — 192x256 RGBA(colorType=6)로 디코딩됨`, d.width === 192 && d.height === 256 && d.colorType === 6, `${d.width}x${d.height} colorType=${d.colorType}`)
    } catch (e) {
      check(`${file2x} — decodePng 성공`, false, e.message)
    }
  }
}

// ── 2. 1x 프레임 — 실제 alpha/네 귀퉁이 투명/발 접지선/중심축 실측 ────────
section('2. 1x 프레임(8장) — 실제 alpha + 투명 귀퉁이 + 발 접지선(최하단 행=127) + 중심축(±1px)')
for (const { frameId, file1x } of FRAME_FILES) {
  const d = decoded1x[frameId]
  if (!d) { check(`${file1x} — 픽셀 분석(디코딩 실패로 건너뜀)`, false); continue }
  const a = analyzeAlpha(d)
  const hasBoth = a.transparentPct > 0 && a.opaquePct > 0
  check(`${file1x} — 실제 alpha(투명+불투명 공존)`, hasBoth, `transparent=${a.transparentPct.toFixed(2)}% opaque=${a.opaquePct.toFixed(2)}%`)

  const corners = [[0, 0], [95, 0], [0, 127], [95, 127]]
  const cornerAlphas = corners.map(([x, y]) => alphaAt(d, x, y))
  check(`${file1x} — 네 귀퉁이 투명(alpha<=16)`, cornerAlphas.every((v) => v <= 16), `corners=${cornerAlphas.join(',')}`)

  const bbox = computeInkBbox(d)
  if (!bbox) { check(`${file1x} — 잉크 bbox 존재(전체 투명 아님)`, false); continue }
  check(`${file1x} — 발 접지선(최하단 잉크 행 === 127)`, bbox.maxY === 127, `maxY=${bbox.maxY}`)
  check(`${file1x} — 잉크 bbox 가로 중심이 캔버스 중심(48)의 ±1px 이내`, Math.abs(bbox.centerX - 48) <= 1, `centerX=${bbox.centerX}`)
}

// ── 3. 2x 프레임 — 동일 실측(캔버스 절대 좌표 기준, ratio=2 환산) ─────────
section('3. 2x 프레임(8장) — 발 접지선(최하단 행=255) + 중심축(±2px, 1x의 2배)')
for (const { frameId, file2x } of FRAME_FILES) {
  const d = decoded2x[frameId]
  if (!d) { check(`${file2x} — 픽셀 분석(디코딩 실패로 건너뜀)`, false); continue }
  const bbox = computeInkBbox(d)
  if (!bbox) { check(`${file2x} — 잉크 bbox 존재(전체 투명 아님)`, false); continue }
  check(`${file2x} — 발 접지선(최하단 잉크 행 === 255)`, bbox.maxY === 255, `maxY=${bbox.maxY}`)
  check(`${file2x} — 잉크 bbox 가로 중심이 캔버스 중심(96)의 ±2px 이내`, Math.abs(bbox.centerX - 96) <= 2, `centerX=${bbox.centerX}`)
}
check(
  '8개 프레임 전부 — 2x 캔버스가 1x의 정확히 2배(192x256 vs 96x128)',
  SPRITE_FRAME_IDS.every((id) => decoded1x[id] && decoded2x[id] && decoded2x[id].width === decoded1x[id].width * 2 && decoded2x[id].height === decoded1x[id].height * 2),
)

// ── 4. LICENSE.txt / NOTICE.md ───────────────────────────────────────────
section('4. LICENSE.txt / NOTICE.md — 존재 + NOTICE.md가 8개 파일명 + sha256을 언급')
{
  const licensePath = path.join(CHARACTER_DIR, 'LICENSE.txt')
  const noticePath = path.join(CHARACTER_DIR, 'NOTICE.md')
  check('LICENSE.txt 존재', existsSync(licensePath))
  const noticeExists = check('NOTICE.md 존재', existsSync(noticePath))
  if (noticeExists) {
    const notice = readFileSync(noticePath, 'utf8')
    const missingNames = FRAME_FILES.filter(({ file1x }) => !notice.includes(file1x)).map(({ file1x }) => file1x)
    check('NOTICE.md가 8개 프레임 파일명(1x)을 전부 언급함', missingNames.length === 0, JSON.stringify(missingNames))
    check("NOTICE.md가 'sha256' 문자열을 포함함", notice.includes('sha256'))
  }
}

// ── 5. src/assets/town/character/index.js — 레지스트리 exports ──────────
section('5. src/assets/town/character/index.js — PAUL_SPRITE_SOURCES / PAUL_SPRITE_SOURCES_2X / PAUL_SPRITE_MEASURED')
let indexModule = null
{
  const indexPath = path.join(CHARACTER_DIR, 'index.js')
  if (check('src/assets/town/character/index.js 존재', existsSync(indexPath))) {
    try {
      const bundlePath = path.join(TMP_DIR, 'paulSpriteCharacterIndex.bundle.mjs')
      await esbuild.build({
        entryPoints: [indexPath],
        bundle: true,
        format: 'esm',
        platform: 'node',
        outfile: bundlePath,
        loader: { '.png': 'dataurl' },
      })
      indexModule = await import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`)
      check('index.js — esbuild 번들 + import 성공', true)
    } catch (e) {
      check('index.js — esbuild 번들 + import 성공', false, e.message)
    }
  }
}
if (indexModule) {
  const sources = indexModule.PAUL_SPRITE_SOURCES
  const sources2x = indexModule.PAUL_SPRITE_SOURCES_2X
  check('PAUL_SPRITE_SOURCES export 존재 + 정확히 8개 키(= SPRITE_FRAME_IDS)', !!sources && JSON.stringify(Object.keys(sources).sort()) === JSON.stringify([...SPRITE_FRAME_IDS].sort()), sources ? JSON.stringify(Object.keys(sources)) : '(없음)')
  check('PAUL_SPRITE_SOURCES — 모든 값이 non-empty 문자열(data URL)', !!sources && Object.values(sources).every((v) => typeof v === 'string' && v.length > 0))
  check('PAUL_SPRITE_SOURCES_2X export 존재 + 정확히 8개 키(= SPRITE_FRAME_IDS)', !!sources2x && JSON.stringify(Object.keys(sources2x).sort()) === JSON.stringify([...SPRITE_FRAME_IDS].sort()), sources2x ? JSON.stringify(Object.keys(sources2x)) : '(없음)')
  check('PAUL_SPRITE_SOURCES_2X — 모든 값이 non-empty 문자열(data URL)', !!sources2x && Object.values(sources2x).every((v) => typeof v === 'string' && v.length > 0))
  check('PAUL_SPRITE_MEASURED export 존재(객체)', !!indexModule.PAUL_SPRITE_MEASURED && typeof indexModule.PAUL_SPRITE_MEASURED === 'object')
} else {
  for (const label of [
    'PAUL_SPRITE_SOURCES export 존재 + 정확히 8개 키(= SPRITE_FRAME_IDS)',
    'PAUL_SPRITE_SOURCES — 모든 값이 non-empty 문자열(data URL)',
    'PAUL_SPRITE_SOURCES_2X export 존재 + 정확히 8개 키(= SPRITE_FRAME_IDS)',
    'PAUL_SPRITE_SOURCES_2X — 모든 값이 non-empty 문자열(data URL)',
    'PAUL_SPRITE_MEASURED export 존재(객체)',
  ]) check(label, false, 'index.js 번들/import 실패로 건너뜀')
}

// ── 6. characterSpriteManifest.default.js — 프로덕션 기본 매니페스트 ─────
section('6. src/utils/town/proto2_5d/characterSpriteManifest.default.js — validateSpriteManifest(...).ok===true')
const MANIFEST_SRC_PATH = path.join(SRC_DIR, 'utils', 'town', 'proto2_5d', 'characterSpriteManifest.default.js')
let paulManifest = null
{
  if (check('characterSpriteManifest.default.js 존재', existsSync(MANIFEST_SRC_PATH))) {
    try {
      const bundlePath = path.join(TMP_DIR, 'characterSpriteManifestDefault.bundle.mjs')
      await esbuild.build({
        entryPoints: [MANIFEST_SRC_PATH],
        bundle: true,
        format: 'esm',
        platform: 'node',
        outfile: bundlePath,
        loader: { '.png': 'dataurl' },
      })
      const mod = await import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`)
      check('characterSpriteManifest.default.js — esbuild 번들 + import 성공', true)
      // export 이름은 이 세션이 소유하지 않는 파일이라 하드코딩하지 않는다
      // (default export 또는 'frames' 필드를 가진 첫 객체 export를 찾는다
      // — 어느 쪽이든 install 세션의 실제 명명 규칙을 그대로 수용).
      paulManifest = mod.default && typeof mod.default === 'object' && mod.default.frames
        ? mod.default
        : Object.values(mod).find((v) => v && typeof v === 'object' && v.frames)
      check('모듈이 frames 필드를 가진 매니페스트 객체를 export함(default 또는 named)', !!paulManifest, JSON.stringify(Object.keys(mod)))
    } catch (e) {
      check('characterSpriteManifest.default.js — esbuild 번들 + import 성공', false, e.message)
    }
  }
}
if (paulManifest) {
  const validation = validateSpriteManifest(paulManifest)
  check('validateSpriteManifest(PAUL_SPRITE_MANIFEST).ok === true', validation.ok === true, JSON.stringify(validation.errors))
  const frames = paulManifest.frames || {}
  check('모든 프레임(8개)이 src를 가짐', SPRITE_FRAME_IDS.every((id) => typeof frames[id]?.src === 'string' && frames[id].src.length > 0))
  check('모든 프레임(8개)이 src2x를 가짐', SPRITE_FRAME_IDS.every((id) => typeof frames[id]?.src2x === 'string' && frames[id].src2x.length > 0))
  check('sit 프레임에 seatAnchor가 있음', !!(frames.sit && frames.sit.seatAnchor && typeof frames.sit.seatAnchor.x === 'number' && typeof frames.sit.seatAnchor.y === 'number'), JSON.stringify(frames.sit && frames.sit.seatAnchor))
  check('frameDurationMs > 0', typeof paulManifest.frameDurationMs === 'number' && paulManifest.frameDurationMs > 0, String(paulManifest.frameDurationMs))
  check('characterId가 non-empty 문자열', typeof paulManifest.characterId === 'string' && paulManifest.characterId.length > 0, String(paulManifest.characterId))
  check('license.approvedBy가 non-empty 문자열(운영자 승인 기록)', !!(paulManifest.license && typeof paulManifest.license.approvedBy === 'string' && paulManifest.license.approvedBy.length > 0), JSON.stringify(paulManifest.license))
} else {
  for (const label of [
    'validateSpriteManifest(PAUL_SPRITE_MANIFEST).ok === true',
    '모든 프레임(8개)이 src를 가짐',
    '모든 프레임(8개)이 src2x를 가짐',
    'sit 프레임에 seatAnchor가 있음',
    'frameDurationMs > 0',
    'characterId가 non-empty 문자열',
    'license.approvedBy가 non-empty 문자열(운영자 승인 기록)',
  ]) check(label, false, '매니페스트 번들/import 실패로 건너뜀')
}

// ── 7. import 격리 ────────────────────────────────────────────────────────
// "문자열 전체 금지"가 아니라 "실제 모듈 import 금지"가 진짜 계약이다 —
// PAUL_SPRITE_DIR = 'src/assets/town/character'(paulSpriteManifest.js,
// 이 세션의 testPaulSpriteAssets.mjs 자신도 그 상수를 import해 재사용한다)
// 처럼 경로를 사람이 읽는 문서/상수 문자열로 담는 것은 번들 격리와 무관
// (에셋 자체를 import하지 않으므로 그 파일의 청크에 이미지가 실리지
// 않는다) — 그래서 import 문(from '...assets/town/character...') 형태만
// 오프렌더로 잡는다(단순 substring 검사는 이 정당한 상수 참조를 오탐하는
// 것을 실측으로 확인, CLAUDE.md 규칙 15 — 회귀 의심 시 먼저 재현/재검증).
const CHARACTER_IMPORT_RE = /\bfrom\s+['"][^'"]*assets\/town\/character[^'"]*['"]|\bimport\(\s*['"][^'"]*assets\/town\/character[^'"]*['"]/
section('7. import 격리 — "assets/town/character" 실제 import가 예상 범위 밖에서 0건')
{
  function walk(dir, out = []) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, name.name)
      if (name.isDirectory()) walk(full, out)
      else out.push(full)
    }
    return out
  }
  const allSrcFiles = walk(SRC_DIR).filter((f) => /\.(js|jsx|ts|tsx)$/.test(f))
  const CHARACTER_DIR_ABS = CHARACTER_DIR
  const offenders = []
  for (const file of allSrcFiles) {
    if (file === MANIFEST_SRC_PATH) continue
    if (file.startsWith(CHARACTER_DIR_ABS + path.sep)) continue
    const src = readFileSync(file, 'utf8')
    if (CHARACTER_IMPORT_RE.test(src)) offenders.push(path.relative(ROOT, file))
  }
  check(
    'src/ 트리 전체에서 characterSpriteManifest.default.js + src/assets/town/character/ 자신을 제외하면 "assets/town/character"를 실제로 import하는 파일이 0건',
    offenders.length === 0,
    JSON.stringify(offenders),
  )

  const townIndexSrc = readFileSync(path.join(SRC_DIR, 'assets', 'town', 'index.js'), 'utf8')
  check('src/assets/town/index.js(V1 TOWN_ASSETS) — "assets/town/character"를 import하지 않음', !CHARACTER_IMPORT_RE.test(townIndexSrc))

  const protoScreenSrc = readFileSync(path.join(SRC_DIR, 'components', 'town', 'proto2_5d', 'Proto25DScreen.jsx'), 'utf8')
  check('Proto25DScreen.jsx — characterSpriteManifest.default를 import함', protoScreenSrc.includes('characterSpriteManifest.default'))

  const townComponentsDir = path.join(SRC_DIR, 'components', 'town')
  const v1Files = existsSync(townComponentsDir)
    ? readdirSync(townComponentsDir, { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.jsx')).map((d) => path.join(townComponentsDir, d.name))
    : []
  const v2Dir = path.join(townComponentsDir, 'v2')
  const v2Files = existsSync(v2Dir) ? walk(v2Dir).filter((f) => /\.(js|jsx)$/.test(f)) : []
  const legacyFiles = [...v1Files, ...v2Files]
  const legacyOffendersCharacter = []
  const legacyOffendersPaulSprite = []
  for (const file of legacyFiles) {
    const src = readFileSync(file, 'utf8')
    if (CHARACTER_IMPORT_RE.test(src)) legacyOffendersCharacter.push(path.relative(ROOT, file))
    if (src.includes('PAUL_SPRITE')) legacyOffendersPaulSprite.push(path.relative(ROOT, file))
  }
  check('V1(src/components/town/*.jsx) + V2(src/components/town/v2/**) — "assets/town/character" import 0건', legacyOffendersCharacter.length === 0, JSON.stringify(legacyOffendersCharacter))
  check('V1 + V2 — "PAUL_SPRITE" 참조 0건', legacyOffendersPaulSprite.length === 0, JSON.stringify(legacyOffendersPaulSprite))
}

// ── 8. 번들 누출(dist/assets가 있을 때만) ─────────────────────────────────
section('8. 번들 누출(guarded — dist/assets 존재할 때만) — Paul 스프라이트가 Proto25DScreen 청크에만 존재')
{
  const distAssetsDir = path.join(ROOT, 'dist', 'assets')
  if (!existsSync(distAssetsDir)) {
    console.log('SKIP — dist/assets 없음(빌드 미실행) — 이 섹션은 조용히 건너뜀(가짜 PASS/FAIL 만들지 않음).')
  } else {
    const distIndexHtmlPath = path.join(ROOT, 'dist', 'index.html')
    const indexHtml = existsSync(distIndexHtmlPath) ? readFileSync(distIndexHtmlPath, 'utf8') : ''
    const assetFiles = readdirSync(distAssetsDir).filter((f) => /\.m?js$/.test(f))
    function resolveMainFileFromIndexHtml(html, files) {
      const m = html.match(/<script[^>]*\btype=["']module["'][^>]*\bsrc=["']\/assets\/([^"']+\.js)["']/)
      if (!m) return null
      return files.includes(m[1]) ? m[1] : null
    }
    const mainFile = resolveMainFileFromIndexHtml(indexHtml, assetFiles)
    const townFiles = assetFiles.filter((f) => /^TownScreen-[\w-]+\.js$/.test(f))

    const markerNeedles = FRAME_FILES.map(({ file1x }) => file1x.replace(/\.png$/, ''))
    function chunkHasSpriteMarker(fileName) {
      const src = readFileSync(path.join(distAssetsDir, fileName), 'utf8')
      return markerNeedles.some((needle) => src.includes(needle))
    }
    const chunksWithMarker = assetFiles.filter((f) => chunkHasSpriteMarker(f))
    check(
      "정확히 1개의 JS 청크만 'paul-idle-front' 등 스프라이트 파일명 마커를 포함함",
      chunksWithMarker.length === 1,
      JSON.stringify(chunksWithMarker),
    )
    if (chunksWithMarker.length === 1) {
      check(`그 청크의 파일명이 'Proto25DScreen'을 포함함(지연 로드 청크 증거)`, chunksWithMarker[0].includes('Proto25DScreen'), chunksWithMarker[0])
    }
    if (mainFile) {
      check(`메인 청크(${mainFile})에 Paul 스프라이트 파일명 마커가 없음`, !chunkHasSpriteMarker(mainFile))
    } else {
      console.log('INFO  메인 청크를 index.html에서 판정하지 못함 — 이 하위 단언은 건너뜀(testBundleBudget.mjs와 동일한 SKIP 정신, 신선한 체크아웃 아님에도 산출물 구조가 예상과 다를 때).')
    }
    for (const tf of townFiles) {
      check(`TownScreen 청크(${tf})에 Paul 스프라이트 파일명 마커가 없음`, !chunkHasSpriteMarker(tf))
    }
    if (townFiles.length === 0) console.log('INFO  TownScreen-*.js 청크를 찾지 못함(V1 플래그 OFF로 트리 셰이킹됐을 수 있음) — 관련 단언 0건.')
  }
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
