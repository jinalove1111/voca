// scripts/spriteIngestPaul.mjs — Paul Town 2.5D "Paul" 캐릭터 스프라이트
// 8장(PNG)이 `src/assets/town/character/`에 실제로 도착한 뒤, 그 도착을
// 객관적으로 검증하는 유일한 커맨드(2026-09-24).
//
// 이 스크립트는 어떤 이미지도 만들지 않는다 — PNG 생성/리터칭/배경 제거는
// 전부 사람(또는 사람이 지시한 외부 도구)의 몫이고, 이 스크립트는 이미
// 디스크에 있는 파일을 읽기만 한다.
//
// 외부 의존성 0개(CLAUDE.md 규칙 6). PNG 디코딩/알파 분석은
// `scripts/validateTownAssetCandidate.mjs`가 이미 구현·검증한
// `decodePng`/`analyzeAlpha`를 그대로 import해서 재사용한다 — 여기서
// PNG 파서를 다시 구현하지 않는다.
//
// 모드:
//   node scripts/spriteIngestPaul.mjs [--check]   (기본값, 읽기 전용)
//   node scripts/spriteIngestPaul.mjs --write      (--check 전항목 PASS일 때만)
//
// --check가 확인하는 8개 항목(a~h, 항목별 PASS/FAIL/BLOCKED_BY_ASSET 출력,
// 하나라도 FAIL/BLOCKED_BY_ASSET면 exit code 1):
//   a. 프레임 누락 — 8개 파일이 src/assets/town/character/에 전부 있는지.
//   b. PNG 디코딩 — decodePng 성공 여부, width/height/colorType 기록.
//   c. 실제 alpha 투명도 — 진짜 투명 픽셀 + 진짜 불투명 픽셀이 공존하는지,
//      네 귀퉁이 픽셀이 투명(alpha<=16)한지.
//   d. 동일 캔버스 크기 — 8장 width/height가 전부 같은지(96x128 또는
//      192x256, 후자면 pixelRatio=2로 취급하고 앵커는 실측값/2로 보고).
//   e. 발 접지선 — sit을 제외한 프레임에서 최하단 불투명(alpha>16) 행이
//      캔버스 하단 2px 이내이고, 프레임 간 ±1px 이내로 일치하는지.
//   f. 중심축 — idle/front/back은 ±6px, side는 ±10px 이내로 잉크
//      바운딩박스 가로 중심이 캔버스 중심 근처인지. sit은 PROPOSED
//      seatAnchor를 "사람 확정 필요" 라벨과 함께 보고만 한다.
//   g. 모바일 렌더 크기 — 캐릭터 박스 40px 폭 기준으로 축소했을 때 잉크
//      높이/폭이 각각 28px/12px 이상인지(PROPOSED 임계값, 수치를 항상 출력).
//   h. 걷기/앉기 상태 연결 — repo-relative 경로로 매니페스트를 만들어
//      validateSpriteManifest가 ok인지, resolveSpriteFrame이 phase별로
//      기대한 frameId를 돌려주는지(옆모습 좌측 이동 시 mirrorX=true 포함).
//
// --write(전항목 PASS일 때만)가 쓰는 파일:
//   - src/assets/town/character/index.js — 8개 PNG import + PAUL_SPRITE_SOURCES/
//     PAUL_SPRITE_MEASURED export(에셋 레지스트리, env/index.js와 동일 격리 규칙).
//   - src/assets/town/character/paul-sprite-measured.json — 실측 원본 기록.
// --write는 LICENSE.txt/NOTICE.md를 쓰지 않는다(사람이 직접 작성, §8) —
// Proto25DScreen.jsx/App.jsx도 건드리지 않는다(배선은 사람 몫, SPRITE
// 계약 §5).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { decodePng, analyzeAlpha } from './validateTownAssetCandidate.mjs'
import { PAUL_SPRITE_FILES, buildPaulSpriteManifest } from '../src/utils/town/proto2_5d/paulSpriteManifest.js'
import {
  validateSpriteManifest,
  resolveSpriteFrame,
  SPRITE_FRAME_IDS,
} from '../src/utils/town/proto2_5d/characterSpriteContract.js'

const ROOT = process.cwd()
const CHARACTER_DIR = path.join(ROOT, 'src', 'assets', 'town', 'character')

let passCount = 0
let failCount = 0
let blockedCount = 0

function report(status, label, detail) {
  if (status === 'PASS') passCount++
  else if (status === 'FAIL') failCount++
  else if (status === 'BLOCKED_BY_ASSET') blockedCount++
  console.log(`${status}  ${label}${detail ? ' — ' + detail : ''}`)
}

function fmt(n) {
  return typeof n === 'number' ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : String(n)
}

// alpha>threshold인 픽셀만으로 잉크 바운딩박스를 계산한다(§4/§5가 명시하는
// alpha>16 임계 — analyzeAlpha의 alpha<=4/>=250 임계와는 다른 목적이라
// 별도 함수로 둔다, decodePng의 rgba 출력만 소비하는 순수 함수).
// export: scripts/testPaulSpriteIngest.mjs가 합성 PNG로 직접 재검증한다
// (2026-09-24, CLI 동작/출력은 변경하지 않음 — 아래 각 check* 함수가 이
// 순수 함수들을 그대로 호출해 report() 문자열이 이전과 완전히 동일함).
export function computeInkBbox(decoded, threshold = 16) {
  const { width, height, rgba } = decoded
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3]
      if (a > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1, centerX: (minX + maxX) / 2 }
}

export function alphaAt(decoded, x, y) {
  return decoded.rgba[(y * decoded.width + x) * 4 + 3]
}

// ── 순수 검사 함수(2026-09-24, 테스트 가능성을 위한 추출) ──────────────────
//
// 아래 analyze*/classify* 함수들은 c~g 각 check 함수의 계산 로직을
// console.log/report() 없이 그대로 옮겨온 것이다 — 각 check 함수는 이제
// 이 함수들을 호출해 값을 얻고, report() 호출/문자열 포맷은 리팩터 전과
// 100% 동일하게 유지한다(CLI 출력 byte-identical, 아래 각 check 함수 diff
// 참고). 전부 decodePng()의 순수 출력만 소비하며 fs/console 접촉 없음.

/** c. 실제 alpha 투명도 — 투명+불투명 공존 여부 + 네 귀퉁이 투명 여부. */
export function analyzeFrameAlpha(decoded) {
  const a = analyzeAlpha(decoded)
  const hasBoth = a.transparentPct > 0 && a.opaquePct > 0
  const { width, height } = decoded
  const corners = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  ]
  const cornerAlphas = corners.map(([x, y]) => alphaAt(decoded, x, y))
  const cornersTransparent = cornerAlphas.every((v) => v <= 16)
  return { transparentPct: a.transparentPct, opaquePct: a.opaquePct, hasBoth, cornerAlphas, cornersTransparent }
}

/**
 * d. 동일 캔버스 크기 — sizes(frameId/w/h 배열, 최소 2개)를 대조해
 * 96x128(1x) 또는 192x256(2x) 매칭 여부를 판정한다. sizes가 비어있거나
 * 배열이 아니면 안전하게 allSame:false를 반환한다(throw 없음).
 * @param {{frameId:string,w:number,h:number}[]} sizes
 */
export function classifyCanvasSizes(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) {
    return { allSame: false, first: null, pixelRatio: null, canvas1x: null, sizeLabel: null }
  }
  const first = sizes[0]
  const allSame = sizes.every((s) => s.w === first.w && s.h === first.h)
  let pixelRatio = null
  let canvas1x = null
  let sizeLabel = null
  if (allSame) {
    if (first.w === 96 && first.h === 128) {
      pixelRatio = 1
      canvas1x = { w: 96, h: 128 }
      sizeLabel = '1x'
    } else if (first.w === 192 && first.h === 256) {
      pixelRatio = 2
      canvas1x = { w: 96, h: 128 }
      sizeLabel = '2x'
    }
  }
  return { allSame, first, pixelRatio, canvas1x, sizeLabel }
}

/** e. 발 접지선(sit 제외) — 단일 프레임 분석. ratio=2면 결과를 1x 단위로 환산. */
export function analyzeFootLine(decoded, ratio = 1) {
  const bbox = computeInkBbox(decoded)
  if (!bbox) return { bbox: null }
  const lowestRow = bbox.maxY
  const distFromBottom = decoded.height - 1 - lowestRow
  const withinBottom = distFromBottom <= 2
  const footAnchorY1x = (lowestRow + 1) / ratio
  return { bbox, lowestRow, distFromBottom, withinBottom, footAnchorY1x }
}

/** e. 프레임 간 최하단 잉크 행 일치(±1px) — rows가 2개 미만이면 null 반환. */
export function footLineConsistency(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return { allWithin1px: null }
  const first = rows[0].lowestRow
  const allWithin1px = rows.every((r) => Math.abs(r.lowestRow - first) <= 1)
  return { allWithin1px }
}

/** f. 중심축(정면/뒷면 ±6px@1x, 측면 ±10px@1x) — 단일 프레임 분석. */
export function analyzeCenterAxis(decoded, thresholdPxAt1x, ratio = 1) {
  const bbox = computeInkBbox(decoded)
  if (!bbox) return { bbox: null }
  const canvasCenterX = decoded.width / 2
  const diff = Math.abs(bbox.centerX - canvasCenterX)
  const thresholdPx = thresholdPxAt1x * ratio
  const within = diff <= thresholdPx
  return { bbox, canvasCenterX, diff, diffAt1x: diff / ratio, within }
}

/** f. sit 프레임의 PROPOSED seatAnchor 후보(§5.2 근사, 사람 확정 필요). */
export function proposeSeatAnchor(decoded) {
  const bbox = computeInkBbox(decoded)
  if (!bbox) return null
  const seatYCandidate = Math.round(bbox.minY + bbox.h * 0.65)
  return { bbox, seatYCandidate, centerX: bbox.centerX }
}

/** g. 모바일 40px 렌더 크기 — 단일 프레임 분석. */
export function analyzeMobileRenderSize(decoded, ratio = 1) {
  const bbox = computeInkBbox(decoded)
  if (!bbox) return { bbox: null }
  const canvasW1x = decoded.width / ratio
  const scale = 40 / canvasW1x
  const inkH1x = bbox.h / ratio
  const inkW1x = bbox.w / ratio
  const renderedH = inkH1x * scale
  const renderedW = inkW1x * scale
  const ok = renderedH >= 28 && renderedW >= 12
  return { bbox, canvasW1x, scale, inkH1x, inkW1x, renderedH, renderedW, ok }
}

// ── a. 프레임 누락 ──────────────────────────────────────────────────────

function checkMissingFrames() {
  console.log('\n-- a. 프레임 누락 --')
  const filePaths = {}
  for (const frameId of SPRITE_FRAME_IDS) {
    const filename = PAUL_SPRITE_FILES[frameId]
    const filePath = path.join(CHARACTER_DIR, filename)
    if (existsSync(filePath)) {
      report('PASS', `${filename} 존재`)
      filePaths[frameId] = filePath
    } else {
      report('BLOCKED_BY_ASSET', `${filename}`, `frames.${frameId} — 파일 없음`)
    }
  }
  return filePaths
}

// ── b. PNG 디코딩 ────────────────────────────────────────────────────────

function checkDecode(filePaths) {
  console.log('\n-- b. PNG 디코딩 --')
  const decodedByFrame = {}
  for (const frameId of SPRITE_FRAME_IDS) {
    const filePath = filePaths[frameId]
    if (!filePath) continue // a단계에서 이미 BLOCKED_BY_ASSET 보고됨 — 중복 보고 안 함
    const filename = PAUL_SPRITE_FILES[frameId]
    try {
      const buf = readFileSync(filePath)
      const decoded = decodePng(buf)
      report('PASS', `${filename} 디코딩`, `${decoded.width}x${decoded.height}, colorType=${decoded.colorType}`)
      decodedByFrame[frameId] = decoded
    } catch (e) {
      report('FAIL', `${filename} 디코딩`, e.message)
    }
  }
  return decodedByFrame
}

// ── c. 실제 alpha 투명도 ─────────────────────────────────────────────────

function checkAlpha(decodedByFrame) {
  console.log('\n-- c. 실제 alpha 투명도 --')
  for (const frameId of SPRITE_FRAME_IDS) {
    const decoded = decodedByFrame[frameId]
    if (!decoded) continue
    const filename = PAUL_SPRITE_FILES[frameId]
    const { hasBoth, transparentPct, opaquePct, cornerAlphas, cornersTransparent } = analyzeFrameAlpha(decoded)
    report(hasBoth ? 'PASS' : 'FAIL', `${filename} 실제 alpha(투명+불투명 공존)`,
      `transparent=${fmt(transparentPct)}%, opaque=${fmt(opaquePct)}%`)
    report(cornersTransparent ? 'PASS' : 'FAIL', `${filename} 네 귀퉁이 투명(alpha<=16)`,
      `corners=${cornerAlphas.join(',')}`)
  }
}

// ── d. 동일 캔버스 크기 ──────────────────────────────────────────────────

function checkCanvasSize(decodedByFrame) {
  console.log('\n-- d. 동일 캔버스 크기 --')
  const sizes = SPRITE_FRAME_IDS
    .filter((id) => decodedByFrame[id])
    .map((id) => ({ frameId: id, w: decodedByFrame[id].width, h: decodedByFrame[id].height }))
  if (sizes.length < 2) {
    console.log(`SKIP  비교 가능한 파일 ${sizes.length}개(2개 미만) — 전체 파일 도착 후 재확인 필요`)
    return { pixelRatio: null, canvas1x: null }
  }
  const { allSame, first, pixelRatio, canvas1x, sizeLabel } = classifyCanvasSizes(sizes)
  report(allSame ? 'PASS' : 'FAIL', '8장(현재 확인 가능한 파일 기준) 캔버스 크기 동일',
    sizes.map((s) => `${s.frameId}=${s.w}x${s.h}`).join(', '))

  if (allSame) {
    if (sizeLabel === '1x') {
      report('PASS', '96x128(1x) 매칭')
    } else if (sizeLabel === '2x') {
      report('PASS', '192x256(2x) 매칭 — pixelRatio=2로 취급, 앵커는 실측/2 = 1x 단위로 보고')
    } else {
      report('FAIL', `96x128 또는 192x256 둘 다 아님`, `실제=${first.w}x${first.h}`)
    }
  }
  return { pixelRatio, canvas1x, sizes }
}

// ── e. 발 접지선 ─────────────────────────────────────────────────────────

function checkFootLine(decodedByFrame, pixelRatio) {
  console.log('\n-- e. 발 접지선(sit 제외) --')
  const nonSitIds = SPRITE_FRAME_IDS.filter((id) => id !== 'sit' && decodedByFrame[id])
  if (nonSitIds.length === 0) {
    console.log('SKIP  비교 가능한 non-sit 파일 없음')
    return
  }
  const ratio = pixelRatio === 2 ? 2 : 1
  const rows = []
  for (const frameId of nonSitIds) {
    const decoded = decodedByFrame[frameId]
    const filename = PAUL_SPRITE_FILES[frameId]
    const { bbox, lowestRow, distFromBottom, withinBottom, footAnchorY1x } = analyzeFootLine(decoded, ratio)
    if (!bbox) {
      report('FAIL', `${filename} 잉크 없음(전체 투명)`)
      continue
    }
    report(withinBottom ? 'PASS' : 'FAIL', `${filename} 최하단 잉크 행이 캔버스 하단 2px 이내`,
      `lowestRow=${lowestRow}, height=${decoded.height}, 하단과의 거리=${distFromBottom}px, 실측 footAnchor.y(1x)=${fmt(footAnchorY1x)}`)
    rows.push({ frameId, lowestRow })
  }
  if (rows.length >= 2) {
    const { allWithin1px } = footLineConsistency(rows)
    report(allWithin1px ? 'PASS' : 'FAIL', '프레임 간 최하단 잉크 행이 ±1px 이내로 일치',
      rows.map((r) => `${r.frameId}=${r.lowestRow}`).join(', '))
  }
}

// ── f. 중심축 ────────────────────────────────────────────────────────────

function checkCenterAxis(decodedByFrame, pixelRatio) {
  console.log('\n-- f. 중심축 --')
  const ratio = pixelRatio === 2 ? 2 : 1
  const frontBackIds = ['idle-front', 'walk-front-a', 'walk-front-b', 'walk-back-a', 'walk-back-b']
  const sideIds = ['walk-side-a', 'walk-side-b']

  for (const frameId of frontBackIds) {
    const decoded = decodedByFrame[frameId]
    if (!decoded) continue
    const filename = PAUL_SPRITE_FILES[frameId]
    const { bbox, canvasCenterX, diffAt1x, within } = analyzeCenterAxis(decoded, 6, ratio)
    if (!bbox) { report('FAIL', `${filename} 잉크 없음`); continue }
    report(within ? 'PASS' : 'FAIL', `${filename} 가로 중심(정면/뒷면, ±${6}px@1x)`,
      `inkCenterX=${fmt(bbox.centerX)}, canvasCenterX=${fmt(canvasCenterX)}, diff=${fmt(diffAt1x)}px(1x), bbox={x:${bbox.minX},y:${bbox.minY},w:${bbox.w},h:${bbox.h}}`)
  }
  for (const frameId of sideIds) {
    const decoded = decodedByFrame[frameId]
    if (!decoded) continue
    const filename = PAUL_SPRITE_FILES[frameId]
    const { bbox, canvasCenterX, diffAt1x, within } = analyzeCenterAxis(decoded, 10, ratio)
    if (!bbox) { report('FAIL', `${filename} 잉크 없음`); continue }
    report(within ? 'PASS' : 'FAIL', `${filename} 가로 중심(측면, ±${10}px@1x)`,
      `inkCenterX=${fmt(bbox.centerX)}, canvasCenterX=${fmt(canvasCenterX)}, diff=${fmt(diffAt1x)}px(1x), bbox={x:${bbox.minX},y:${bbox.minY},w:${bbox.w},h:${bbox.h}}`)
  }

  const sitDecoded = decodedByFrame.sit
  if (sitDecoded) {
    // §5.2 측정 절차 근사: 하단 ~35% 구간이 시작되는 y를 "엉덩이 접촉선"
    // 후보로 제안만 한다 — 최종 확정은 항상 사람 몫(spec §5.2, CONFIRMED
    // 아님).
    const proposal = proposeSeatAnchor(sitDecoded)
    if (proposal) {
      const { bbox, seatYCandidate, centerX } = proposal
      console.log(`INFO  paul-sit.png 잉크 bbox={x:${bbox.minX},y:${bbox.minY},w:${bbox.w},h:${bbox.h}}, PROPOSED seatAnchor={x:${fmt(centerX)},y:${seatYCandidate}} — 사람 확정 필요(§5.2)`)
    } else {
      report('FAIL', 'paul-sit.png 잉크 없음(전체 투명)')
    }
  }
}

// ── g. 모바일 렌더 크기 ──────────────────────────────────────────────────

function checkMobileRenderSize(decodedByFrame, pixelRatio) {
  console.log('\n-- g. 모바일 렌더 크기(캐릭터 박스 40px 폭 기준, PROPOSED 임계값) --')
  const ratio = pixelRatio === 2 ? 2 : 1
  for (const frameId of SPRITE_FRAME_IDS) {
    const decoded = decodedByFrame[frameId]
    if (!decoded) continue
    const filename = PAUL_SPRITE_FILES[frameId]
    const { bbox, scale, renderedH, renderedW, ok } = analyzeMobileRenderSize(decoded, ratio)
    if (!bbox) { report('FAIL', `${filename} 잉크 없음`); continue }
    report(ok ? 'PASS' : 'FAIL', `${filename} 모바일 40px 렌더 시 잉크 크기`,
      `scale=${fmt(scale)}, 렌더높이=${fmt(renderedH)}px(>=28 기대), 렌더폭=${fmt(renderedW)}px(>=12 기대)`)
  }
}

// ── h. 걷기/앉기 상태 연결 ───────────────────────────────────────────────

function checkStateWiring() {
  console.log('\n-- h. 걷기/앉기 상태 연결(구조적 검사, 실제 픽셀 무관) --')
  const sources = {}
  for (const frameId of SPRITE_FRAME_IDS) {
    sources[frameId] = `src/assets/town/character/${PAUL_SPRITE_FILES[frameId]}`
  }
  const manifest = buildPaulSpriteManifest({ sources })
  const validation = validateSpriteManifest(manifest)
  report(validation.ok ? 'PASS' : 'FAIL', 'validateSpriteManifest(repo-relative sources)', JSON.stringify(validation.errors))

  const cases = [
    { label: 'idle', args: { phase: 'idle' }, expectFrameId: 'idle-front' },
    { label: 'walking/front/frame0', args: { phase: 'walking', direction: 'front', frameIndex: 0 }, expectFrameId: 'walk-front-a' },
    { label: 'walking/front/frame1', args: { phase: 'walking', direction: 'front', frameIndex: 1 }, expectFrameId: 'walk-front-b' },
    { label: 'walking/back/frame0', args: { phase: 'walking', direction: 'back', frameIndex: 0 }, expectFrameId: 'walk-back-a' },
    { label: 'walking/side/frame0/facing1', args: { phase: 'walking', direction: 'side', frameIndex: 0, facing: 1 }, expectFrameId: 'walk-side-a', expectMirrorX: false },
    { label: 'walking/side/frame0/facing-1(좌측 이동)', args: { phase: 'walking', direction: 'side', frameIndex: 0, facing: -1 }, expectFrameId: 'walk-side-a', expectMirrorX: true },
    { label: 'leaving/front', args: { phase: 'leaving', direction: 'front', frameIndex: 0 }, expectFrameId: 'walk-front-a' },
    { label: 'leaving/back', args: { phase: 'leaving', direction: 'back', frameIndex: 0 }, expectFrameId: 'walk-back-a' },
    { label: 'leaving/side', args: { phase: 'leaving', direction: 'side', frameIndex: 0 }, expectFrameId: 'walk-side-a' },
    { label: 'sitting', args: { phase: 'sitting' }, expectFrameId: 'sit' },
  ]
  for (const c of cases) {
    const visual = resolveSpriteFrame({ manifest, validation, ...c.args })
    const frameIdOk = visual.kind === 'sprite' && visual.frameId === c.expectFrameId
    const mirrorOk = c.expectMirrorX === undefined || visual.mirrorX === c.expectMirrorX
    report(frameIdOk && mirrorOk ? 'PASS' : 'FAIL', `resolveSpriteFrame(${c.label}) → frameId=${c.expectFrameId}${c.expectMirrorX !== undefined ? `, mirrorX=${c.expectMirrorX}` : ''}`,
      `실제 kind=${visual.kind}, frameId=${visual.frameId}, mirrorX=${visual.mirrorX}`)
  }
  return { manifest, validation }
}

// ── --write ──────────────────────────────────────────────────────────────

function writeRegistry(decodedByFrame, canvasInfo) {
  console.log('\n-- --write: 레지스트리 파일 생성 --')
  mkdirSync(CHARACTER_DIR, { recursive: true })

  const varNameFor = (frameId) =>
    'paul' + frameId.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')
  const file2xFor = (frameId) => PAUL_SPRITE_FILES[frameId].replace(/\.png$/, '@2x.png')

  const importLines = SPRITE_FRAME_IDS
    .map((frameId) => `import ${varNameFor(frameId)} from './${PAUL_SPRITE_FILES[frameId]}'`)
    .join('\n')
  const importLines2x = SPRITE_FRAME_IDS
    .map((frameId) => `import ${varNameFor(frameId)}2x from './${file2xFor(frameId)}'`)
    .join('\n')
  const sourceEntries = SPRITE_FRAME_IDS
    .map((frameId) => `  '${frameId}': ${varNameFor(frameId)},`)
    .join('\n')
  const sourceEntries2x = SPRITE_FRAME_IDS
    .map((frameId) => `  '${frameId}': ${varNameFor(frameId)}2x,`)
    .join('\n')

  // §5 실측 앵커 — footAnchor는 normalize-report.json 실측(캔버스 하단
  // 접지, 모든 프레임 공통 {x:48,y:128})을 그대로 쓴다. sit의 seatAnchor는
  // §5.2가 "기본값 없음, 사람 확정 필요"라고 명시한 PROPOSED 값이었으나,
  // 팀장 지시(2026-09-24)로 {x:48,y:85}가 운영자 확정값으로 확정됐다 —
  // classifyCanvasSizes/checkCenterAxis 등 --check 로직은 이 함수가 건드리지
  // 않으므로 위 INFO 라인의 PROPOSED 출력 자체는 그대로 유지된다(계약
  // 안전망, CLAUDE.md 규칙 15 정신 — 실측은 실측대로 보고하고 확정은 확정대로
  // 별도 기록).
  const footAnchor = { x: 48, y: 128 }
  const seatAnchor = { x: 48, y: 85 }
  const anchors = {}
  for (const frameId of SPRITE_FRAME_IDS) {
    anchors[frameId] = frameId === 'sit' ? { footAnchor, seatAnchor } : { footAnchor }
  }

  const measured = {
    canvas: canvasInfo.canvas1x,
    pixelRatio: canvasInfo.pixelRatio,
    anchors,
    measuredAt: new Date().toISOString(),
  }

  const indexJs = `// src/assets/town/character/index.js — Paul 캐릭터 스프라이트 에셋
// 레지스트리(scripts/spriteIngestPaul.mjs --write가 실측 통과 후 생성,
// ${new Date().toISOString().slice(0, 10)}).
//
// import 제약: env 레지스트리(V2 환경 아트 index.js)와 동일한 격리 규칙 — 이
// 레지스트리는 오직
// src/utils/town/proto2_5d/characterSpriteManifest.default.js에서만
// import한다(절대 src/assets/town/index.js에서 import하지 않고, 절대
// V1/V2 town 화면 파일에서 직접 import하지 않는다 — 청크 격리 규칙,
// ASTRA_HANDOFF §0.10). src/assets/town/index.js(V1 TOWN_ASSETS)는 이
// 파일을 import하지 않고, 이 파일도 그쪽을 import하지 않는다.
${importLines}
${importLines2x}

export const PAUL_SPRITE_SOURCES = Object.freeze({
${sourceEntries}
})

export const PAUL_SPRITE_SOURCES_2X = Object.freeze({
${sourceEntries2x}
})

export const PAUL_SPRITE_MEASURED = Object.freeze(${JSON.stringify(measured, null, 2)})
`
  writeFileSync(path.join(CHARACTER_DIR, 'index.js'), indexJs, 'utf8')
  console.log(`PASS  작성됨: ${path.join(CHARACTER_DIR, 'index.js')}`)

  writeFileSync(
    path.join(CHARACTER_DIR, 'paul-sprite-measured.json'),
    JSON.stringify(measured, null, 2) + '\n',
    'utf8',
  )
  console.log(`PASS  작성됨: ${path.join(CHARACTER_DIR, 'paul-sprite-measured.json')}`)

  console.log('\n남은 사람 작업(이 스크립트는 하지 않음):')
  console.log('  1. LICENSE.txt + NOTICE.md를 src/assets/town/character/에 작성(§8, 승인자/승인일 포함).')
  console.log('  2. seatAnchor(sit) 등 "사람 확정 필요" 라벨이 붙은 값을 육안 재확인 후 확정.')
  console.log('  3. characterSpriteManifest.default.js(프로덕션 기본 매니페스트) 작성 — 승인 후에만.')
  console.log('  4. Proto25DScreen.jsx의 선택적 spriteManifest prop 배선 + paulTown2_5dSprite 플래그 등록 여부 결정.')
  console.log('  5. LICENSE.txt/NOTICE.md 없이는 이 커밋을 올리지 않는다.')
}

// ── entrypoint ───────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--write') ? 'write' : 'check'

  console.log(`spriteIngestPaul.mjs — mode=${mode}`)
  console.log(`대상 디렉터리: ${CHARACTER_DIR}\n`)

  const filePaths = checkMissingFrames()
  const decodedByFrame = checkDecode(filePaths)
  checkAlpha(decodedByFrame)
  const canvasInfo = checkCanvasSize(decodedByFrame)
  checkFootLine(decodedByFrame, canvasInfo.pixelRatio)
  checkCenterAxis(decodedByFrame, canvasInfo.pixelRatio)
  checkMobileRenderSize(decodedByFrame, canvasInfo.pixelRatio)
  checkStateWiring()

  console.log(`\n결과: PASS=${passCount} FAIL=${failCount} BLOCKED_BY_ASSET=${blockedCount}`)

  const allClear = failCount === 0 && blockedCount === 0
  if (!allClear) {
    console.log('결론: --check 미통과 — --write를 실행하지 않는다.')
    process.exitCode = 1
    return
  }

  if (mode === 'write') {
    writeRegistry(decodedByFrame, canvasInfo)
  } else {
    console.log('결론: --check 전항목 PASS. `node scripts/spriteIngestPaul.mjs --write`로 레지스트리를 생성할 수 있다.')
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  main()
}
