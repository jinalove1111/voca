// scripts/testPaulSpriteIngest.mjs — Paul Town 2.5D "Paul" 캐릭터 스프라이트
// 인제스트 스캐폴딩(paulSpriteManifest.js + spriteIngestPaul.mjs, 2026-09-24)
// 순수 단위 테스트.
//
// 8장의 실제 PNG는 아직 도착하지 않았다(`src/assets/town/character/`에는
// README.md만 존재) — 이 스위트는 그 부재를 전제로, (1) 파일명/매니페스트
// 빌더의 구조적 계약을, (2) `spriteIngestPaul.mjs`가 내부적으로 쓰는 순수
// 픽셀 분석 함수들을 합성(in-memory) PNG로, (3) CLI(`--check`/`--write`)의
// 실제 동작을 자식 프로세스로 검증한다.
//
// 이 파일은 어떤 이미지 파일도 디스크에 쓰지 않는다 — 합성 PNG 버퍼는
// scripts/testTownAssetValidator.mjs가 쓰는 것과 동일한 관례(zlib
// deflateSync로 IDAT을 직접 구성, CRC는 decodePng가 검증하지 않으므로
// 스텁)로 메모리에서만 만들고 즉시 버린다. 외부 이미지 라이브러리
// 의존성 0(CLAUDE.md 규칙 6).

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { decodePng } from './validateTownAssetCandidate.mjs'
import {
  PAUL_SPRITE_FILES,
  PAUL_SPRITE_DIR,
  buildPaulSpriteManifest,
  paulSpriteBlockers,
} from '../src/utils/town/proto2_5d/paulSpriteManifest.js'
import {
  SPRITE_FRAME_IDS,
  EXPECTED_FRAME_META,
  validateSpriteManifest,
  resolveSpriteFrame,
} from '../src/utils/town/proto2_5d/characterSpriteContract.js'
import {
  computeInkBbox,
  alphaAt,
  analyzeFrameAlpha,
  classifyCanvasSizes,
  analyzeFootLine,
  footLineConsistency,
  analyzeCenterAxis,
  proposeSeatAnchor,
  analyzeMobileRenderSize,
} from './spriteIngestPaul.mjs'

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHARACTER_DIR = path.join(ROOT, 'src', 'assets', 'town', 'character')

// ── 합성 PNG 인메모리 빌더(scripts/testTownAssetValidator.mjs와 동일 관례,
// 새 PNG 인코더 발명 아님 — CRC 스텁은 decodePng가 검증하지 않으므로 안전)
// ─────────────────────────────────────────────────────────────────────────
function crc32Stub() { return Buffer.from([0, 0, 0, 0]) }
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, crc32Stub()])
}
/**
 * width x height 합성 PNG를 메모리에서만 구성한다(디스크에 절대 쓰지
 * 않음). colorType 6(RGBA, 기본) 또는 2(RGB, 알파 없음)를 지원한다.
 * @param {number} width
 * @param {number} height
 * @param {(x:number,y:number)=>[number,number,number,number]} pixelFn
 * @param {{colorType?:2|6}} [opts]
 * @returns {Buffer}
 */
function buildPng(width, height, pixelFn, { colorType = 6 } = {}) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bitDepth
  ihdr.writeUInt8(colorType, 9)
  ihdr.writeUInt8(0, 10)
  ihdr.writeUInt8(0, 11)
  ihdr.writeUInt8(0, 12) // interlace none
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type 0(None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y)
      const off = y * (stride + 1) + 1 + x * channels
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
      if (channels === 4) raw[off + 3] = a
    }
  }
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

/** 지정한 사각형(inclusive) 안은 불투명 검정, 밖은 완전 투명인 RGBA PNG. */
function buildInkRectPng(width, height, rect, { colorType = 6 } = {}) {
  const { x0, x1, y0, y1 } = rect
  return buildPng(width, height, (x, y) => {
    const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1
    return inside ? [20, 20, 20, 255] : [0, 0, 0, 0]
  }, { colorType })
}

function decodeFixture(...args) {
  return decodePng(buildInkRectPng(...args))
}

// ══════════════════════════════════════════════════════════════════════
// 1. 대응표 — PAUL_SPRITE_FILES / PAUL_SPRITE_DIR
// ══════════════════════════════════════════════════════════════════════
section('1. 대응표(PAUL_SPRITE_FILES / SPRITE_FRAME_IDS / PAUL_SPRITE_DIR)')
{
  const keys = Object.keys(PAUL_SPRITE_FILES)
  check('PAUL_SPRITE_FILES의 key 순서가 SPRITE_FRAME_IDS와 정확히 일치', deepEqual(keys, SPRITE_FRAME_IDS), JSON.stringify(keys))

  const expectedFilenames = {
    'idle-front': 'paul-idle-front.png',
    'walk-front-a': 'paul-walk-front-a.png',
    'walk-front-b': 'paul-walk-front-b.png',
    'walk-back-a': 'paul-walk-back-a.png',
    'walk-back-b': 'paul-walk-back-b.png',
    'walk-side-a': 'paul-walk-side-a.png',
    'walk-side-b': 'paul-walk-side-b.png',
    sit: 'paul-sit.png',
  }
  check('PAUL_SPRITE_FILES 값이 운영자 8개 파일명과 정확히 일치', deepEqual(PAUL_SPRITE_FILES, expectedFilenames), JSON.stringify(PAUL_SPRITE_FILES))

  check('PAUL_SPRITE_FILES 모든 값이 .png로 끝남', Object.values(PAUL_SPRITE_FILES).every((f) => f.endsWith('.png')))
  check('PAUL_SPRITE_FILES 값이 전부 고유(8개)', new Set(Object.values(PAUL_SPRITE_FILES)).size === 8)
  check('PAUL_SPRITE_FILES가 frozen', Object.isFrozen(PAUL_SPRITE_FILES))
  check("PAUL_SPRITE_DIR === 'src/assets/town/character'", PAUL_SPRITE_DIR === 'src/assets/town/character')
}

// ══════════════════════════════════════════════════════════════════════
// 2. 빌더 — buildPaulSpriteManifest
// ══════════════════════════════════════════════════════════════════════
section('2. 빌더(buildPaulSpriteManifest)')
{
  const empty = buildPaulSpriteManifest()
  check('인자 없이 호출 → 객체 반환', typeof empty === 'object' && empty !== null)
  check('version === 2', empty.version === 2)
  check('frames가 정확히 8개', Object.keys(empty.frames).length === 8)
  check('frames key 순서가 SPRITE_FRAME_IDS와 일치', deepEqual(Object.keys(empty.frames), SPRITE_FRAME_IDS))
  check('모든 프레임 src가 undefined(소스 미주입)', SPRITE_FRAME_IDS.every((id) => empty.frames[id].src === undefined))

  const vEmpty = validateSpriteManifest(empty)
  check('소스 없는 매니페스트 → validateSpriteManifest ok:false', vEmpty.ok === false)
  const srcErrorCount = SPRITE_FRAME_IDS.filter((id) => vEmpty.errors.some((e) => e.includes(`frames.${id}.src`))).length
  check('validateSpriteManifest errors에 8개 프레임 전부의 src 에러가 포함됨', srcErrorCount === 8, `${srcErrorCount}/8, errors=${JSON.stringify(vEmpty.errors)}`)

  const visual = resolveSpriteFrame({ manifest: empty, validation: vEmpty, phase: 'idle' })
  check('소스 없는 매니페스트 → resolveSpriteFrame kind:"emoji"(이모지 폴백 유지)', visual.kind === 'emoji', JSON.stringify(visual))

  const sources = {}
  for (const frameId of SPRITE_FRAME_IDS) sources[frameId] = `https://example.invalid/${PAUL_SPRITE_FILES[frameId]}`
  const withSources = buildPaulSpriteManifest({ sources })
  const vWith = validateSpriteManifest(withSources)
  check('전체 sources 제공 → validateSpriteManifest ok:true', vWith.ok === true, JSON.stringify(vWith.errors))

  for (const frameId of SPRITE_FRAME_IDS) {
    const frame = withSources.frames[frameId]
    const meta = EXPECTED_FRAME_META[frameId]
    check(`frames.${frameId}.state/direction === EXPECTED_FRAME_META`, frame.state === meta.state && frame.direction === meta.direction)
    check(`frames.${frameId}.file === PAUL_SPRITE_FILES[${frameId}]`, frame.file === PAUL_SPRITE_FILES[frameId])
  }
  check('sit 프레임에 seatAnchor 존재', withSources.frames.sit.seatAnchor && typeof withSources.frames.sit.seatAnchor.x === 'number')
  check('sit 이외 프레임에는 seatAnchor 없음', SPRITE_FRAME_IDS.filter((id) => id !== 'sit').every((id) => withSources.frames[id].seatAnchor === undefined))

  // anchors override — 지정한 프레임에만 적용, 나머지는 기본값 유지.
  const withAnchor = buildPaulSpriteManifest({
    sources,
    anchors: { 'idle-front': { footAnchor: { x: 10, y: 20 } } },
  })
  check('anchors override — idle-front.footAnchor가 override 값', deepEqual(withAnchor.frames['idle-front'].footAnchor, { x: 10, y: 20 }))
  check('anchors override — 지정 안 한 프레임(walk-front-a)은 기본 footAnchor 유지', deepEqual(withAnchor.frames['walk-front-a'].footAnchor, { x: 48, y: 128 }))
  const withSeatOverride = buildPaulSpriteManifest({ sources, anchors: { sit: { seatAnchor: { x: 1, y: 2 } } } })
  check('anchors override — sit.seatAnchor override 적용', deepEqual(withSeatOverride.frames.sit.seatAnchor, { x: 1, y: 2 }))

  // canvas override + invalid fallback.
  const withCanvas = buildPaulSpriteManifest({ canvas: { w: 200, h: 300 } })
  check('canvas override 적용', deepEqual(withCanvas.canvas, { w: 200, h: 300 }))
  const badCanvas = buildPaulSpriteManifest({ canvas: 'not-an-object' })
  check('무효 canvas(문자열) → 기본값 {96,128}로 폴백', deepEqual(badCanvas.canvas, { w: 96, h: 128 }))

  // frameDurationMs override + invalid fallback.
  check('frameDurationMs override(300) 적용', buildPaulSpriteManifest({ frameDurationMs: 300 }).frameDurationMs === 300)
  check('frameDurationMs=0 → 기본값 150으로 폴백', buildPaulSpriteManifest({ frameDurationMs: 0 }).frameDurationMs === 150)
  check('frameDurationMs=음수 → 기본값 150으로 폴백', buildPaulSpriteManifest({ frameDurationMs: -10 }).frameDurationMs === 150)
  check('frameDurationMs=NaN → 기본값 150으로 폴백', buildPaulSpriteManifest({ frameDurationMs: NaN }).frameDurationMs === 150)
  check("frameDurationMs='150'(문자열) → 기본값 150으로 폴백", buildPaulSpriteManifest({ frameDurationMs: '150' }).frameDurationMs === 150)

  // pixelRatio override + invalid fallback.
  check('pixelRatio override(2) 적용', buildPaulSpriteManifest({ pixelRatio: 2 }).pixelRatio === 2)
  check('pixelRatio=1 명시 적용', buildPaulSpriteManifest({ pixelRatio: 1 }).pixelRatio === 1)
  check('pixelRatio=3(무효) → 기본값 1로 폴백', buildPaulSpriteManifest({ pixelRatio: 3 }).pixelRatio === 1)
  check("pixelRatio='x'(무효) → 기본값 1로 폴백", buildPaulSpriteManifest({ pixelRatio: 'x' }).pixelRatio === 1)

  // license shallow-merge.
  const withLicense = buildPaulSpriteManifest({ license: { author: 'X' } })
  check('license override — author가 override 값', withLicense.license.author === 'X')
  check('license override — 지정 안 한 필드(source)는 기본값 유지', withLicense.license.source === 'ChatGPT image generation (operator-directed), 2026-09')

  // 절대 throw하지 않음(쓰레기 인자) — null도 포함(2026-09-24, 소유 세션이
  // paulSpriteManifest.js를 고쳐 명시적 null도 undefined와 동일하게
  // 안전한 기본값 경로를 타도록 수정 완료. 이전에는 `{ ... } = {}` 기본
  // 매개변수가 undefined에만 적용되고 null에는 적용되지 않아
  // buildPaulSpriteManifest(null)이 destructuring TypeError로 throw했다 —
  // 그 회귀를 다시 놓치지 않도록 null을 목록에 유지한다).
  for (const garbage of [null, 'x', [], 42, undefined]) {
    let threw = false
    let result
    try { result = buildPaulSpriteManifest(garbage) } catch { threw = true }
    check(`buildPaulSpriteManifest(${JSON.stringify(garbage)}) — throw 없음, 객체 반환`, !threw && typeof result === 'object' && result !== null)
    check(`buildPaulSpriteManifest(${JSON.stringify(garbage)}) — version === 2`, !threw && result?.version === 2)
    check(`buildPaulSpriteManifest(${JSON.stringify(garbage)}) — frames가 정확히 8개`, !threw && result?.frames && Object.keys(result.frames).length === 8, !threw ? JSON.stringify(Object.keys(result?.frames || {})) : 'threw')
  }
}

// ══════════════════════════════════════════════════════════════════════
// 3. blockers — paulSpriteBlockers
// ══════════════════════════════════════════════════════════════════════
section('3. blockers(paulSpriteBlockers)')
{
  const allMissing = paulSpriteBlockers()
  check('sources 없음 → 8개 BLOCKED_BY_ASSET 반환', allMissing.length === 8, `got ${allMissing.length}`)
  check("전부 'BLOCKED_BY_ASSET:'로 시작", allMissing.every((b) => b.startsWith('BLOCKED_BY_ASSET:')))
  const containsFrameAndFile = SPRITE_FRAME_IDS.every((id) =>
    allMissing.some((b) => b.includes(id) && b.includes(PAUL_SPRITE_FILES[id])),
  )
  check('각 blocker가 frameId + 해당 파일명을 포함', containsFrameAndFile)

  const sevenSources = {}
  for (const frameId of SPRITE_FRAME_IDS) {
    if (frameId === 'sit') continue
    sevenSources[frameId] = `https://example.invalid/${PAUL_SPRITE_FILES[frameId]}`
  }
  const oneMissing = paulSpriteBlockers(sevenSources)
  check('7/8 소스 제공 → blocker 1개', oneMissing.length === 1, JSON.stringify(oneMissing))
  check("남은 blocker가 'sit'/paul-sit.png 언급", oneMissing[0].includes('sit') && oneMissing[0].includes('paul-sit.png'))

  const eightSources = {}
  for (const frameId of SPRITE_FRAME_IDS) eightSources[frameId] = `https://example.invalid/${PAUL_SPRITE_FILES[frameId]}`
  check('8/8 소스 제공 → blocker 0개', deepEqual(paulSpriteBlockers(eightSources), []))

  for (const garbage of [null, undefined, 'x', 42, []]) {
    let threw = false
    let result
    try { result = paulSpriteBlockers(garbage) } catch { threw = true }
    check(`paulSpriteBlockers(${JSON.stringify(garbage)}) — throw 없음, 8개(빈 sources 취급)`, !threw && Array.isArray(result) && result.length === 8)
  }
}

// ══════════════════════════════════════════════════════════════════════
// 4. ingest 검사 함수(순수) — 합성 PNG로 spriteIngestPaul.mjs의 분석 함수 직접 검증
// ══════════════════════════════════════════════════════════════════════
section('4a. 96x128, 접지선/중심축 정상(대조군)')
{
  // 96x128, ink rect x:24..71(폭48, 중심 47.5≈캔버스 중심48), y:32..127(하단 정렬, 최하단 행=127).
  const decoded = decodeFixture(96, 128, { x0: 24, x1: 71, y0: 32, y1: 127 })
  check('96x128 디코딩 — width/height 정확', decoded.width === 96 && decoded.height === 128)

  const alpha = analyzeFrameAlpha(decoded)
  check('실제 alpha(투명+불투명 공존) PASS', alpha.hasBoth === true, JSON.stringify(alpha))
  check('네 귀퉁이 투명(alpha<=16) PASS', alpha.cornersTransparent === true, JSON.stringify(alpha.cornerAlphas))

  const foot = analyzeFootLine(decoded, 1)
  check('발 접지선 — bbox 존재', foot.bbox !== null)
  check('발 접지선 — lowestRow===127(최하단 행)', foot.lowestRow === 127, `got ${foot.lowestRow}`)
  check('발 접지선 — distFromBottom===0', foot.distFromBottom === 0)
  check('발 접지선 — withinBottom true(PASS)', foot.withinBottom === true)
  check('발 접지선 — footAnchorY1x===128', foot.footAnchorY1x === 128, `got ${foot.footAnchorY1x}`)

  const center = analyzeCenterAxis(decoded, 6, 1)
  check('중심축(정면/뒷면 임계) — within true(PASS)', center.within === true, `diff=${center.diffAt1x}`)

  const mobile = analyzeMobileRenderSize(decoded, 1)
  check('모바일 렌더 크기 — canvasW1x===96', mobile.canvasW1x === 96)
  check('모바일 렌더 크기 — scale===40/96', Math.abs(mobile.scale - 40 / 96) < 1e-9)
  check('모바일 렌더 크기 — inkH1x===96(잉크 세로 32..127)', mobile.inkH1x === 96, `got ${mobile.inkH1x}`)
  check('모바일 렌더 크기 — inkW1x===48(잉크 가로 24..71)', mobile.inkW1x === 48, `got ${mobile.inkW1x}`)
  check('모바일 렌더 크기 — ok true(PASS, 높이>=28·폭>=12)', mobile.ok === true, `renderedH=${mobile.renderedH}, renderedW=${mobile.renderedW}`)
}

section('4b. 발 접지선 FAIL(최하단 잉크 행이 하단에서 7px 떨어짐)')
{
  // 동일 폭, 세로 32..120(최하단 행 120, height-1-120=7 > 2 → FAIL).
  const decoded = decodeFixture(96, 128, { x0: 24, x1: 71, y0: 32, y1: 120 })
  const foot = analyzeFootLine(decoded, 1)
  check('발 접지선 — lowestRow===120', foot.lowestRow === 120)
  check('발 접지선 — distFromBottom===7', foot.distFromBottom === 7)
  check('발 접지선 — withinBottom false(FAIL)', foot.withinBottom === false)
}

section('4c. 중심축 FAIL(잉크가 오른쪽으로 20px 이동)')
{
  // 폭 48 유지, x:44..91(오른쪽으로 이동) — bbox.centerX=(44+91)/2=67.5, canvasCenterX=48, diff=19.5 > 6.
  const decoded = decodeFixture(96, 128, { x0: 44, x1: 91, y0: 32, y1: 127 })
  const center = analyzeCenterAxis(decoded, 6, 1)
  check('중심축 — canvasCenterX===48', center.canvasCenterX === 48)
  check('중심축 — bbox.centerX===67.5', center.bbox.centerX === 67.5)
  check('중심축 — diffAt1x가 6px 임계 초과', center.diffAt1x > 6, `diff=${center.diffAt1x}`)
  check('중심축 — within false(FAIL)', center.within === false)
}

section('4d. RGB(알파 채널 없음) PNG — 실제 alpha FAIL')
{
  const decoded = decodeFixture(32, 32, { x0: 0, x1: 31, y0: 0, y1: 31 }, { colorType: 2 })
  check('colorType===2(RGB)로 디코딩됨', decoded.colorType === 2)
  const alpha = analyzeFrameAlpha(decoded)
  check('RGB(알파 없음) → transparentPct===0', alpha.transparentPct === 0, JSON.stringify(alpha))
  check('RGB(알파 없음) → hasBoth false(FAIL, 투명 픽셀 없음)', alpha.hasBoth === false, JSON.stringify(alpha))
}

section('4e. 캔버스 크기 불일치 — 2개 프레임이 서로 다른 해상도')
{
  const sizes = [
    { frameId: 'idle-front', w: 96, h: 128 },
    { frameId: 'walk-front-a', w: 100, h: 128 },
  ]
  const result = classifyCanvasSizes(sizes)
  check('캔버스 크기 불일치 — allSame false(FAIL)', result.allSame === false, JSON.stringify(result))
  check('캔버스 크기 불일치 — pixelRatio null', result.pixelRatio === null)
}

section('4f. 192x256(2x) — pixelRatio 판정 + 1x 단위 환산')
{
  const sizes = [
    { frameId: 'idle-front', w: 192, h: 256 },
    { frameId: 'walk-front-a', w: 192, h: 256 },
  ]
  const result = classifyCanvasSizes(sizes)
  check('192x256 — allSame true', result.allSame === true)
  check('192x256 — pixelRatio===2', result.pixelRatio === 2)
  check('192x256 — canvas1x==={96,128}', deepEqual(result.canvas1x, { w: 96, h: 128 }))
  check("192x256 — sizeLabel==='2x'", result.sizeLabel === '2x')

  // 실측(2x 픽셀 좌표) → 1x 단위 앵커로 정확히 환산되는지: ink rect y:64..255(최하단 행 255), x:48..142.
  const decoded2x = decodeFixture(192, 256, { x0: 48, x1: 142, y0: 64, y1: 255 })
  const foot2x = analyzeFootLine(decoded2x, 2)
  check('192x256 — footAnchorY1x===128(2x 실측이 1x 단위로 정확히 환산됨)', foot2x.footAnchorY1x === 128, `got ${foot2x.footAnchorY1x}`)
}

section('4g. sit 프레임 — PROPOSED seatAnchor가 잉크 bbox 안에 위치')
{
  const decoded = decodeFixture(96, 128, { x0: 24, x1: 71, y0: 32, y1: 127 })
  const proposal = proposeSeatAnchor(decoded)
  check('sit — proposeSeatAnchor가 null이 아님', proposal !== null)
  check('sit — seatYCandidate가 잉크 bbox(minY..maxY) 범위 안', proposal.seatYCandidate >= proposal.bbox.minY && proposal.seatYCandidate <= proposal.bbox.maxY, JSON.stringify(proposal))
  check('sit — centerX가 bbox.centerX와 동일', proposal.centerX === proposal.bbox.centerX)

  // 잉크가 전혀 없는(완전 투명) 프레임 → null.
  const emptyDecoded = decodeFixture(96, 128, { x0: 0, x1: -1, y0: 0, y1: -1 })
  check('완전 투명 프레임 — proposeSeatAnchor null', proposeSeatAnchor(emptyDecoded) === null)
  check('완전 투명 프레임 — computeInkBbox null', computeInkBbox(emptyDecoded) === null)
  check('완전 투명 프레임 — analyzeFootLine bbox null', analyzeFootLine(emptyDecoded, 1).bbox === null)
  check('완전 투명 프레임 — analyzeCenterAxis bbox null', analyzeCenterAxis(emptyDecoded, 6, 1).bbox === null)
  check('완전 투명 프레임 — analyzeMobileRenderSize bbox null', analyzeMobileRenderSize(emptyDecoded, 1).bbox === null)
}

section('4h. footLineConsistency / alphaAt / classifyCanvasSizes 경계값')
{
  check('footLineConsistency — rows 1개(비교 불가) → allWithin1px null', footLineConsistency([{ frameId: 'a', lowestRow: 10 }]).allWithin1px === null)
  check('footLineConsistency — rows 0개 → allWithin1px null', footLineConsistency([]).allWithin1px === null)
  check('footLineConsistency — 2개, 차이 1px 이내 → true', footLineConsistency([{ frameId: 'a', lowestRow: 10 }, { frameId: 'b', lowestRow: 11 }]).allWithin1px === true)
  check('footLineConsistency — 2개, 차이 2px → false', footLineConsistency([{ frameId: 'a', lowestRow: 10 }, { frameId: 'b', lowestRow: 12 }]).allWithin1px === false)
  check('classifyCanvasSizes([]) — allSame false, throw 없음', classifyCanvasSizes([]).allSame === false)
  check('classifyCanvasSizes(null) — allSame false, throw 없음', classifyCanvasSizes(null).allSame === false)

  const decoded = decodeFixture(4, 4, { x0: 1, x1: 2, y0: 1, y1: 2 })
  check('alphaAt — 코너(0,0)는 투명(0)', alphaAt(decoded, 0, 0) === 0)
  check('alphaAt — 중심(1,1)은 불투명(255)', alphaAt(decoded, 1, 1) === 255)
}

// ══════════════════════════════════════════════════════════════════════
// 5. CLI — spriteIngestPaul.mjs --check / --write (자식 프로세스로 실행)
// ══════════════════════════════════════════════════════════════════════
section('5. CLI(spriteIngestPaul.mjs --check / --write, 실제 이미지 0장 상태)')
{
  check('사전 확인 — src/assets/town/character/에 실제 PNG 0장(README.md만)', existsSync(CHARACTER_DIR) && readdirSync(CHARACTER_DIR).every((f) => !/\.(png|webp|svg)$/i.test(f)))

  const checkResult = spawnSync(process.execPath, ['scripts/spriteIngestPaul.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' })
  check('spriteIngestPaul.mjs --check — exit code 1', checkResult.status === 1, `status=${checkResult.status}, stderr=${checkResult.stderr}`)
  const stdout = checkResult.stdout || ''
  const lines = stdout.split('\n')
  const blockedLines = lines.filter((l) => l.startsWith('BLOCKED_BY_ASSET'))
  check('stdout에 BLOCKED_BY_ASSET로 시작하는 줄이 정확히 8개', blockedLines.length === 8, `got ${blockedLines.length}: ${JSON.stringify(blockedLines)}`)
  check("stdout에 '결론' 포함", stdout.includes('결론'))
  check("stdout에 'Error' 문자열 없음", !stdout.includes('Error'))
  check("stdout에 스택트레이스 줄(' at ') 없음", !lines.some((l) => l.trim().startsWith('at ')))
  check('stderr 비어있음(예외로 죽지 않음)', (checkResult.stderr || '').trim() === '', checkResult.stderr)

  const beforeWriteFiles = readdirSync(CHARACTER_DIR)
  const writeResult = spawnSync(process.execPath, ['scripts/spriteIngestPaul.mjs', '--write'], { cwd: ROOT, encoding: 'utf8' })
  check('spriteIngestPaul.mjs --write(체크 미통과 상태) — exit code 1', writeResult.status === 1, `status=${writeResult.status}`)
  check('--write 실행 후에도 index.js가 생성되지 않음', !existsSync(path.join(CHARACTER_DIR, 'index.js')))
  const afterWriteFiles = readdirSync(CHARACTER_DIR)
  check('--write 실행 후 character 디렉터리 내용이 README.md 하나뿐', deepEqual(afterWriteFiles, ['README.md']), JSON.stringify(afterWriteFiles))
  check('--write 실행 전후로 디렉터리 파일 목록 무변경', deepEqual(beforeWriteFiles, afterWriteFiles))
}

// ══════════════════════════════════════════════════════════════════════
// 6. 이미지 부재 안전 — 8장 도착 전 상태를 실측으로 재확인
// ══════════════════════════════════════════════════════════════════════
section('6. 이미지 부재 안전(character 디렉터리 실측)')
{
  const files = readdirSync(CHARACTER_DIR)
  check('character 디렉터리에 .png/.webp/.svg 파일이 0개', files.filter((f) => /\.(png|webp|svg)$/i.test(f)).length === 0, JSON.stringify(files))
  check('character 디렉터리에 index.js 없음', !existsSync(path.join(CHARACTER_DIR, 'index.js')))
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
