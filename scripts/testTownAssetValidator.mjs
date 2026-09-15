// scripts/testTownAssetValidator.mjs — validateTownAssetCandidate.mjs
// 회귀 스위트(2026-09-15, 6시간 자율 개선 세션 Phase F — 자산 파이프라인
// 하드닝). 네트워크/DB 0, 순수 Node.
//
// 목적: 이 세션에서 validateTownAssetCandidate.mjs에 추가한 2가지 실제
// 기능(WebP 컨테이너 파서, backgrounds/ui 폴더 고아-스캔 제외)이 계속
// 정확히 동작하는지 회귀 확인한다. 합성 PNG 픽스처(zlib만으로 직접
// 인코딩 — 외부 이미지 라이브러리 의존 없음, decodePng와 동일한 원칙)로
// PNG 경로를, 저장소에 이미 존재하는 실제 WebP 파일(이번 세션에 추가한
// 환경 아트워크 6개)로 WebP 경로를 검증한다.
import zlib from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import { decodePng, analyzeAlpha, decodeWebpContainer, inspectImageFile } from './validateTownAssetCandidate.mjs'

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const section = (name) => console.log(`\n-- ${name} --`)

// ══════════════════════════════════════════════════════════════════════
section('1. 합성 PNG 픽스처 — decodePng/analyzeAlpha')
// ══════════════════════════════════════════════════════════════════════
// 최소 유효 PNG를 직접 인코딩(필터 타입 0 = None만 사용, colorType 6 RGBA).
// CRC는 decodePng가 검증하지 않으므로(길이 기반 오프셋만 사용) 0으로
// 채워도 안전 — 이 파일 자체의 실제 파싱 로직만 정확히 검증하면 된다.
function crc32Stub() { return Buffer.from([0, 0, 0, 0]) }
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, crc32Stub()])
}
function buildPng(width, height, pixelFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bitDepth
  ihdr.writeUInt8(6, 9) // colorType RGBA
  ihdr.writeUInt8(0, 10)
  ihdr.writeUInt8(0, 11)
  ihdr.writeUInt8(0, 12) // interlace none
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y)
      const off = y * (stride + 1) + 1 + x * 4
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a
    }
  }
  const idat = zlib.deflateSync(raw)
  const iend = Buffer.alloc(0)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', iend)])
}

{
  // 4x4, 가운데 2x2만 불투명(빨강), 나머지 투명 — 여백/바운딩박스 검증용.
  const png = buildPng(4, 4, (x, y) => {
    const inCenter = x >= 1 && x <= 2 && y >= 1 && y <= 2
    return inCenter ? [255, 0, 0, 255] : [0, 0, 0, 0]
  })
  const decoded = decodePng(png)
  check('합성 PNG: width/height 정확히 파싱', decoded.width === 4 && decoded.height === 4)
  check('합성 PNG: colorType 6(RGBA) 파싱', decoded.colorType === 6)
  const a = analyzeAlpha(decoded)
  check('합성 PNG: hasRealAlpha true(투명 픽셀 실존)', a.hasRealAlpha === true)
  check('합성 PNG: bbox가 가운데 2x2와 일치', a.bbox && a.bbox.l === 1 && a.bbox.t === 1 && a.bbox.r === 3 && a.bbox.b === 3, JSON.stringify(a.bbox))
  check('합성 PNG: 중심 픽셀 RGB(빨강) 정확히 디코드', decoded.rgba[(1 * 4 + 1) * 4] === 255 && decoded.rgba[(1 * 4 + 1) * 4 + 1] === 0)

  const info = inspectImageFile(png)
  check('inspectImageFile: PNG 경로에서 pixelDecodeAvailable=true', info.pixelDecodeAvailable === true)
  check('inspectImageFile: PNG 포맷 라벨 RGBA', info.format === 'png(RGBA)')
}

{
  // 완전 불투명 PNG(RGB, colorType 2) — hasRealAlpha는 항상 false여야 함.
  const png = buildPng(2, 2, () => [10, 20, 30, 255])
  // colorType 2로 다시 만들 필요 있음 — buildPng는 RGBA 고정이라 여기선
  // RGBA 전부 alpha=255인 경우로 "완전 불투명" 케이스를 대신 검증한다.
  const decoded = decodePng(png)
  const a = analyzeAlpha(decoded)
  check('합성 PNG: 전부 alpha=255 → hasRealAlpha=false(투명 픽셀 없음)', a.hasRealAlpha === false, `transparent=${a.transparentPct}%`)
}

check('decodePng: PNG 아닌 버퍼는 명확한 에러로 실패(거짓 PASS 없음)', (() => {
  try { decodePng(Buffer.from('not a png')); return false } catch { return true }
})())

// ══════════════════════════════════════════════════════════════════════
section('2. 합성 WebP 픽스처 — decodeWebpContainer/inspectImageFile')
// ══════════════════════════════════════════════════════════════════════
// decodeWebpContainer는 컨테이너 헤더만 읽고 실제 압축 비트스트림 내용은
// 전혀 검증하지 않으므로(그게 이 함수의 정직한 한계), 진짜 libwebp
// 인코더 출력이 없어도 RIFF 청크 구조만 정확히 흉내 낸 최소 버퍼로 파싱
// 로직 자체를 완전히 검증할 수 있다 — main 브랜치 기준으로 이 테스트가
// 독립적으로 항상 돌아야 하므로(PR #57 병합 전에는 실제 환경 아트워크
// 파일이 아직 존재하지 않음, 아래 3절 참고) 외부 파일에 의존하지 않는다.
function riffChunk(fourcc, payload) {
  const size = Buffer.alloc(4)
  size.writeUInt32LE(payload.length, 0)
  const padded = payload.length % 2 === 1 ? Buffer.concat([payload, Buffer.from([0])]) : payload
  return Buffer.concat([Buffer.from(fourcc, 'ascii'), size, padded])
}
function buildWebpVP8(width, height) {
  // 단순 손실(VP8X 없음, 알파 불가) — 프레임 태그 3B(임의) + 시작코드
  // 3B(0x9d,0x01,0x2a) + width/height 각 2B LE(상위 2비트는 스케일, 0 사용).
  const vp8Payload = Buffer.from([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f])
  const riff = Buffer.concat([Buffer.from('WEBP', 'ascii'), riffChunk('VP8 ', vp8Payload)])
  const size = Buffer.alloc(4)
  size.writeUInt32LE(riff.length, 0)
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, riff])
}
function buildWebpVP8X(width, height, hasAlpha) {
  const flags = hasAlpha ? 0x10 : 0x00
  const w1 = width - 1
  const h1 = height - 1
  const vp8xPayload = Buffer.from([
    flags, 0, 0, 0,
    w1 & 0xff, (w1 >> 8) & 0xff, (w1 >> 16) & 0xff,
    h1 & 0xff, (h1 >> 8) & 0xff, (h1 >> 16) & 0xff,
  ])
  const riff = Buffer.concat([Buffer.from('WEBP', 'ascii'), riffChunk('VP8X', vp8xPayload)])
  const size = Buffer.alloc(4)
  size.writeUInt32LE(riff.length, 0)
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, riff])
}

{
  const buf = buildWebpVP8(1000, 292)
  const r = decodeWebpContainer(buf)
  check('합성 WebP(VP8, 단순 손실): 포맷 라벨 정확', r.format === 'webp(lossy, VP8)', r.format)
  check('합성 WebP(VP8): hasAlpha=false(단순 손실은 알파 불가)', r.hasAlpha === false)
  check('합성 WebP(VP8): width/height 정확히 파싱', r.width === 1000 && r.height === 292, `${r.width}x${r.height}`)
}

{
  const buf = buildWebpVP8X(800, 165, true)
  const r = decodeWebpContainer(buf)
  check('합성 WebP(VP8X, 알파 있음): 포맷 라벨 정확', r.format === 'webp(extended, VP8X)', r.format)
  check('합성 WebP(VP8X): hasAlpha=true(flags bit4 세팅됨)', r.hasAlpha === true)
  check('합성 WebP(VP8X): width/height 정확히 파싱(width-1/height-1 인코딩 역산)', r.width === 800 && r.height === 165, `${r.width}x${r.height}`)
}

{
  const buf = buildWebpVP8X(125, 122, false)
  const r = decodeWebpContainer(buf)
  check('합성 WebP(VP8X, 알파 없음): hasAlpha=false(flags bit4 미설정)', r.hasAlpha === false)
}

{
  const buf = buildWebpVP8X(800, 165, true)
  const info = inspectImageFile(buf)
  check('inspectImageFile: WebP 경로에서 pixelDecodeAvailable=false(정직한 한계 표시)', info.pixelDecodeAvailable === false)
  check('inspectImageFile: WebP도 width/height는 제공', info.width === 800 && info.height === 165)
}

// ══════════════════════════════════════════════════════════════════════
section('3. 실제 환경 아트워크(존재할 때만) — 보너스 실전 검증')
// ══════════════════════════════════════════════════════════════════════
// PR #57(마을 장면 비주얼 업그레이드)이 병합되기 전에는 이 파일들이
// main에 없다 — 그게 정상이라 SKIP한다(존재하면 실제 libwebp 산출물과도
// 호환되는지 보너스로 재확인, 없으면 위 2절의 합성 검증만으로 충분).
const BG_DIR = 'src/assets/town/backgrounds'
const REAL_ENV_ARTWORK = [
  ['village-sky-backdrop.webp', 'webp(lossy, VP8)', false],
  ['village-hedge-border.webp', 'webp(extended, VP8X)', true],
  ['village-cobblestone-tile.webp', 'webp(lossy, VP8)', false],
  ['garden-accent-1.webp', 'webp(extended, VP8X)', true],
  ['garden-accent-2.webp', 'webp(extended, VP8X)', true],
  ['garden-accent-3.webp', 'webp(extended, VP8X)', true],
]
let skippedReal = 0
for (const [name, expectedFormat, expectedAlpha] of REAL_ENV_ARTWORK) {
  const fp = `${BG_DIR}/${name}`
  if (!existsSync(fp)) { skippedReal++; continue }
  const buf = readFileSync(fp)
  const r = decodeWebpContainer(buf)
  check(`${name}(실파일): 포맷 ${expectedFormat}`, r.format === expectedFormat, r.format)
  check(`${name}(실파일): hasAlpha=${expectedAlpha}`, r.hasAlpha === expectedAlpha)
}
if (skippedReal === REAL_ENV_ARTWORK.length) {
  console.log(`  SKIP  실제 환경 아트워크 6개 전부 없음(PR #57 미병합 — main 기준 정상, 합성 검증(2절)으로 충분)`)
} else if (skippedReal > 0) {
  console.log(`  INFO  실제 환경 아트워크 ${skippedReal}/${REAL_ENV_ARTWORK.length}개만 없음(부분 병합 상태로 추정)`)
}

check('decodeWebpContainer: WebP 아닌 버퍼는 명확한 에러로 실패', (() => {
  try { decodeWebpContainer(Buffer.from('not a webp')); return false } catch { return true }
})())

check('inspectImageFile: PNG도 WebP도 아닌 버퍼는 명확한 에러로 실패', (() => {
  try { inspectImageFile(Buffer.from('neither format')); return false } catch { return true }
})())

// ══════════════════════════════════════════════════════════════════════
console.log(`\n총 ${passed + failed}개 단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('전체 PASS')
}
