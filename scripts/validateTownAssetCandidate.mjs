// scripts/validateTownAssetCandidate.mjs — Paul Town 아트워크 후보 객관적
// 검증 도구(2026-09-14, Batch 3 배치 워크플로우 하드닝의 일부).
//
// 목적: docs/design/town/PAUL_TOWN_ASSET_CONTRACT.md §3이 "자동화 가능"으로
// 분류한 객관적 사실(실제 알파 채널 존재/투명 여백 %/치수/종횡비/중복 해시/
// PNG 유효성)을 매 배치마다 사람이 Python REPL로 손으로 반복 계산하지 않고
// 한 커맨드로 확인하기 위한 스크립트다. React/DOM/네트워크/DB 의존성 없음
// (다른 scripts/test*.mjs와 동일한 순수 Node 스타일).
//
// 이 스크립트는 "주관적" 판정(스토리북 톤/원근/과도한 소품/원치 않는
// 텍스트/조명 방향)은 절대 하지 않는다 — 그건 여전히 사람의 시각 검토
// 몫이다(계약 문서 §3 원칙 그대로).
//
// 외부 의존성 0개(CLAUDE.md 규칙 6) — PNG 디코딩은 Node 내장 zlib만으로
// 직접 구현한다(IHDR 파싱 + IDAT concat + inflate + PNG 표준 5종 필터
// 역연산). 8bit RGBA(colorType 6)/8bit RGB(colorType 2)만 지원 — 그 외
// (팔레트/16bit/인터레이스)는 "지원 안 함, 수동 확인 필요"로 정직하게
// 실패한다(잘못 디코딩해서 거짓 PASS를 내는 것보다 안전).
//
// 사용법:
//   node scripts/validateTownAssetCandidate.mjs <assetKey> <filePath>
//     — 단일 후보를 계약(assetManifest.js)과 대조
//   node scripts/validateTownAssetCandidate.mjs --audit
//     — src/assets/town/** 전체를 매니페스트와 대조(고아 자산/누락 변형)
//   node scripts/validateTownAssetCandidate.mjs --hash <file1> <file2> ...
//     — 여러 후보 파일의 md5를 찍어 중복 탐지

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { TOWN_ASSET_MANIFEST } from '../src/assets/town/assetManifest.js'

const ROOT = process.cwd()

// ── PNG 디코더(최소 구현, colorType 2/6, 8bit, non-interlaced만) ──────────

function readPngChunks(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('PNG 시그니처 불일치 — PNG 파일이 아님')
  const chunks = []
  let off = 8
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    chunks.push({ type, data })
    off += 8 + len + 4 // length + type + data + crc
  }
  return chunks
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** @returns {{width:number,height:number,colorType:number,rgba:Buffer}} */
function decodePng(buf) {
  const chunks = readPngChunks(buf)
  const ihdr = chunks.find((c) => c.type === 'IHDR')
  if (!ihdr) throw new Error('IHDR 청크 없음')
  const width = ihdr.data.readUInt32BE(0)
  const height = ihdr.data.readUInt32BE(4)
  const bitDepth = ihdr.data.readUInt8(8)
  const colorType = ihdr.data.readUInt8(9)
  const interlace = ihdr.data.readUInt8(12)
  if (bitDepth !== 8) throw new Error(`지원 안 함: bitDepth=${bitDepth}(8bit만 지원) — 수동 확인 필요`)
  if (interlace !== 0) throw new Error('지원 안 함: interlaced PNG(수동 확인 필요)')
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`지원 안 함: colorType=${colorType}(2=RGB/6=RGBA만 지원, 팔레트/그레이스케일 등은 수동 확인 필요)`)
  }
  const channels = colorType === 6 ? 4 : 3
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))
  const raw = zlib.inflateSync(idat)
  const bytesPerPixel = channels
  const stride = width * bytesPerPixel
  const rgba = Buffer.alloc(width * height * 4)
  let rawOff = 0
  const prevRow = Buffer.alloc(stride)
  let curRow = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOff]
    rawOff += 1
    raw.copy(curRow, 0, rawOff, rawOff + stride)
    rawOff += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bytesPerPixel ? curRow[x - bytesPerPixel] : 0
      const b = prevRow[x]
      const c = x >= bytesPerPixel ? prevRow[x - bytesPerPixel] : 0
      let val = curRow[x]
      if (filterType === 1) val = (val + a) & 0xff
      else if (filterType === 2) val = (val + b) & 0xff
      else if (filterType === 3) val = (val + ((a + b) >> 1)) & 0xff
      else if (filterType === 4) val = (val + paeth(a, b, c)) & 0xff
      curRow[x] = val
    }
    for (let x = 0; x < width; x++) {
      const srcOff = x * bytesPerPixel
      const dstOff = (y * width + x) * 4
      rgba[dstOff] = curRow[srcOff]
      rgba[dstOff + 1] = curRow[srcOff + 1]
      rgba[dstOff + 2] = curRow[srcOff + 2]
      rgba[dstOff + 3] = channels === 4 ? curRow[srcOff + 3] : 255
    }
    prevRow.set(curRow)
  }
  return { width, height, colorType, rgba }
}

// ── 알파/여백 분석(순수 함수, decodePng 출력만 소비) ──────────────────────

function analyzeAlpha({ width, height, colorType, rgba }) {
  const total = width * height
  let transparentCount = 0
  let opaqueCount = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3]
      if (a <= 4) transparentCount++
      else if (a >= 250) opaqueCount++
      if (a > 4) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const partialCount = total - transparentCount - opaqueCount
  const hasRealAlpha = colorType === 6 && transparentCount > 0
  const bbox = maxX >= 0 ? { l: minX, t: minY, r: maxX + 1, b: maxY + 1 } : null
  const margins = bbox
    ? {
        left: (bbox.l / width) * 100,
        top: (bbox.t / height) * 100,
        right: ((width - bbox.r) / width) * 100,
        bottom: ((height - bbox.b) / height) * 100,
      }
    : null
  const contentAspect = bbox ? (bbox.r - bbox.l) / (bbox.b - bbox.t) : null
  return {
    width,
    height,
    colorType,
    hasRealAlpha,
    transparentPct: (transparentCount / total) * 100,
    opaquePct: (opaqueCount / total) * 100,
    partialPct: (partialCount / total) * 100,
    bbox,
    margins,
    contentAspect,
  }
}

function parseAspectRatio(s) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(s)
  if (!m) return null
  return Number(m[1]) / Number(m[2])
}

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(2) : String(n)
}

// ── 모드 1: 단일 후보 vs assetKey 계약 대조 ───────────────────────────────

function validateCandidate(assetKey, filePath) {
  const entry = TOWN_ASSET_MANIFEST[assetKey]
  if (!entry) {
    console.log(`FAIL  assetKey '${assetKey}'가 assetManifest.js에 없음 — 먼저 매니페스트/계약 문서에 SPEC_ONLY로 추가할 것`)
    process.exitCode = 1
    return
  }
  if (!existsSync(filePath)) {
    console.log(`FAIL  파일 없음: ${filePath}`)
    process.exitCode = 1
    return
  }
  const buf = readFileSync(filePath)
  const md5 = crypto.createHash('md5').update(buf).digest('hex')
  console.log(`asset_key: ${assetKey}`)
  console.log(`file: ${filePath}`)
  console.log(`md5: ${md5}`)

  let decoded
  try {
    decoded = decodePng(buf)
  } catch (e) {
    console.log(`FAIL  PNG 디코드 실패: ${e.message}`)
    process.exitCode = 1
    return
  }
  const a = analyzeAlpha(decoded)
  const results = []
  const check = (label, ok, detail) => {
    results.push({ label, ok, detail })
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
  }

  check('실제 알파 채널 존재(colorType=6 RGBA, 실제 투명 픽셀 有)', a.hasRealAlpha, `colorType=${a.colorType}, transparent=${fmt(a.transparentPct)}%`)
  check('완전 불투명(alpha=255) 아님 — 배경 없이 꽉 찬 파일이 아님', a.transparentPct > 0.5, `transparent=${fmt(a.transparentPct)}%`)

  if (a.bbox) {
    const targetAspect = parseAspectRatio(entry.aspectRatio)
    // 정보용(게이트 아님) — bbox 기반 종횡비는 가는 돌출부(핀볼 장식/램프 팔 등)나
    // 실제 콘텐츠와 멀리 떨어진 1~2px짜리 거의-불투명(alpha 1~3) 노이즈 픽셀에
    // 의해 크게 왜곡될 수 있음이 실측으로 확인됐다(2026-09-14, 이미 배선·검증
    // 완료된 special/bridge로 재현 — PIL 기본 getbbox()도 동일 함정에 빠짐).
    // 그래서 이 항목은 FAIL로 게이트하지 않고 참고 수치만 출력한다 — 실제
    // 종횡비 적합성은 여전히 사람의 시각 검토(또는 export 파이프라인의 안전
    // 리사이즈)가 판단한다.
    if (targetAspect) {
      const diffPct = (Math.abs(a.contentAspect - targetAspect) / targetAspect) * 100
      console.log(`  INFO  콘텐츠 종횡비(참고용, 게이트 아님) — 실측=${fmt(a.contentAspect)}, 계약=${entry.aspectRatio}(${fmt(targetAspect)}), 차이=${fmt(diffPct)}% (가는 돌출부/노이즈 픽셀로 왜곡될 수 있음 — 큰 차이는 사람이 육안 재확인)`)
    }
    check('여백 계산 가능(콘텐츠가 캔버스 전체를 채우지 않음)', a.margins.left < 100, `L=${fmt(a.margins.left)}% T=${fmt(a.margins.top)}% R=${fmt(a.margins.right)}% B=${fmt(a.margins.bottom)}%`)
    const minMargin = Math.min(a.margins.left, a.margins.top, a.margins.right, a.margins.bottom)
    check('전 방향 여백 ≥4%(계약 §0) — 미달이면 안전 repad 필요(자동 REGEN 아님)', minMargin >= 4, `최소 여백=${fmt(minMargin)}%(0~4% 구간은 export 파이프라인에서 repad로 해결 가능, 음수/과도 초과가 아니면 B등급 후보)`)

    // partial-alpha 비율은 항상 참고용으로 출력한다(게이트 아님, WARN도
    // 아님) — bench1~4.png(baked radial glow, 실제 결함)는 1.8~3.9%였지만,
    // 이미 시각 검증을 마친 정상 자산인 special/bridge(잎/덩굴 등 복잡한
    // 윤곽선 때문에 안티에일리어싱 자체가 많음)도 3.88%로 측정돼 실측
    // 캘리브레이션 결과 이 수치 하나만으로는 baked glow와 "윤곽선이 복잡한
    // 정상 자산"을 구분할 수 없음이 확인됐다(2026-09-14). 그래서 자동
    // 판정/경고를 포기하고 수치만 보여준다 — glow 여부는 여전히 사람의
    // 육안 검토(정상 안티에일리어싱은 실루엣 가장자리에만 얇게, glow는
    // 배경 넓은 영역에 완만한 그라디언트로 보임)로만 판정한다.
    console.log(`  INFO  partial-alpha(참고용, 게이트/경고 아님) — ${fmt(a.partialPct)}% (복잡한 윤곽선의 정상 안티에일리어싱과 baked glow를 이 수치만으로 구분 불가함이 실측 확인됨 — 육안 검토 필수)`)
  } else {
    check('콘텐츠 바운딩박스 계산', false, '전체 투명 — 콘텐츠 없음')
  }

  check(`캔버스 해상도가 매니페스트 1x(${entry.canvas.w}x${entry.canvas.h}) 또는 2x(${entry.canvas2x.w}x${entry.canvas2x.h})와 무관하게 임의 해상도(원본 후보는 보통 더 큼, export 단계에서 리사이즈됨 — 참고용)`, true, `실제=${decoded.width}x${decoded.height}`)

  const failCount = results.filter((r) => !r.ok).length
  console.log(failCount === 0 ? '\n결과: 객관적 검증 전부 PASS — 주관적 시각 검토(스타일/장면/텍스트/조명)는 별도 필요' : `\n결과: 객관적 검증 ${failCount}건 FAIL — 위 FAIL 항목 참고`)
  if (failCount > 0) process.exitCode = 1
}

// ── 모드 2: 해시 중복 탐지 ─────────────────────────────────────────────────

function hashFiles(filePaths) {
  const byHash = new Map()
  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.log(`SKIP  파일 없음: ${fp}`)
      continue
    }
    const md5 = crypto.createHash('md5').update(readFileSync(fp)).digest('hex')
    console.log(`${md5}  ${fp}`)
    if (!byHash.has(md5)) byHash.set(md5, [])
    byHash.get(md5).push(fp)
  }
  const dups = [...byHash.entries()].filter(([, files]) => files.length > 1)
  if (dups.length > 0) {
    console.log('\n중복 발견(바이트 동일):')
    for (const [hash, files] of dups) {
      console.log(`  ${hash}: ${files.join(' == ')}`)
    }
  } else {
    console.log('\n중복 없음(전부 서로 다른 파일)')
  }
}

// ── 모드 3: 매니페스트 커버리지 감사(고아 자산/누락 변형) ──────────────────

function auditManifestCoverage() {
  const townDir = path.join(ROOT, 'src', 'assets', 'town')
  const indexSrc = readFileSync(path.join(townDir, 'index.js'), 'utf8')
  const wiredKeys = new Set(
    Array.from(/export const TOWN_ASSETS\s*=\s*\{([\s\S]*?)\n\}/.exec(indexSrc)[1].matchAll(/'([^']+)':/g)).map((m) => m[1]),
  )
  console.log(`매니페스트 총 asset_key: ${Object.keys(TOWN_ASSET_MANIFEST).length}개`)
  console.log(`TOWN_ASSETS 배선(wired): ${wiredKeys.size}개\n`)

  let missingFiles = 0
  for (const [key, entry] of Object.entries(TOWN_ASSET_MANIFEST)) {
    const dir = path.join(townDir, entry.folder)
    const base = entry.filename.replace(/\.webp$/, '')
    const expected = [`${base}.png`, `${base}.webp`, `${base}@2x.png`, `${base}@2x.webp`]
    const missing = expected.filter((f) => !existsSync(path.join(dir, f)))
    const isWired = wiredKeys.has(key)
    if (isWired && missing.length > 0) {
      console.log(`FAIL  ${key}: TOWN_ASSETS에 배선됐지만 파일 누락 — ${missing.join(', ')}`)
      missingFiles++
    } else if (isWired) {
      console.log(`PASS  ${key}: 배선됨, 4파일 전부 존재`)
    } else if (missing.length < 4) {
      console.log(`INFO  ${key}: 파일 일부 존재하지만 미배선(${4 - missing.length}/4) — WIRED 전 단계로 추정`)
    } else {
      console.log(`INFO  ${key}: SPEC_ONLY(파일 없음, 정상 — 아직 후보 미제출)`)
    }
  }

  // 고아 자산: town 폴더에 있지만 매니페스트 어디에도 없는 파일
  const knownBasenames = new Set(Object.values(TOWN_ASSET_MANIFEST).map((e) => e.filename.replace(/\.webp$/, '')))
  let orphanCount = 0
  for (const folder of readdirSync(townDir)) {
    const full = path.join(townDir, folder)
    if (!statSync(full).isDirectory()) continue
    for (const f of readdirSync(full)) {
      if (f === '.gitkeep') continue
      const base = f.replace(/@2x/, '').replace(/\.(png|webp)$/, '')
      if (!knownBasenames.has(base)) {
        console.log(`FAIL  고아 자산(매니페스트에 없음): ${folder}/${f}`)
        orphanCount++
      }
    }
  }
  if (orphanCount === 0) console.log('\nPASS  고아 자산 0건')

  if (missingFiles > 0 || orphanCount > 0) process.exitCode = 1
}

// ── entrypoint ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
if (args[0] === '--audit') {
  auditManifestCoverage()
} else if (args[0] === '--hash') {
  hashFiles(args.slice(1))
} else if (args.length === 2) {
  validateCandidate(args[0], args[1])
} else {
  console.log('사용법:')
  console.log('  node scripts/validateTownAssetCandidate.mjs <assetKey> <filePath>')
  console.log('  node scripts/validateTownAssetCandidate.mjs --audit')
  console.log('  node scripts/validateTownAssetCandidate.mjs --hash <file1> [file2 ...]')
  process.exitCode = 1
}
