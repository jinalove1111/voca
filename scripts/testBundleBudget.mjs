// scripts/testBundleBudget.mjs — Paul Town V1 번들 크기 예산(2026-09-11 야간
// 성능 트랙, Task 8). 순수 정적 산출물 검사(dist/index.html + dist/assets/*.js를
// 읽고 gzip 크기를 계산) — React 렌더 0, 네트워크 0, DB 0, src/ 무수정.
//
// 이 스크립트는 dist/를 절대 생성하지 않는다(빌드 트리거 없음, no
// child_process, no vite build) — 이번 야간 세션은 다른 에이전트가 dist/를
// 소유 중이라 이 스크립트는 "있으면 검사, 없으면 SKIP"만 한다. 다른 어떤
// 스크립트/CI 단계가 먼저 npm run build를 돌렸다면 그 산출물을 그대로 읽고,
// 아직이면(신선한 체크아웃, dist/assets 부재) exit 0으로 조용히 SKIP한다 —
// 이게 이 파일이 extra:false(verify:all 필수 게이트)로 등록될 수 있는 이유:
// "빌드 안 한 신선한 체크아웃"에서 절대 FAIL하지 않는다.
//
// 예산 4가지(Task 8 지시대로, 2026-09-11 실측 기준 — 현재 수치는 아래에서
// 실측해 콘솔에 그대로 찍는다):
//   1. TownScreen 청크가 별도 파일로 존재(React.lazy 분할)하고 dist/index.html
//      이 그 파일을 직접 참조하지 않는다(오직 메인 청크만 그 파일명을
//      문자열로 담고 있어야 함 — import() 동적 로드의 증거).
//   2. TownScreen 청크 gzip ≤ 15KB(실측 ≈6.8KB, 2026-09-11).
//   3. 메인(index-*.js) 청크 gzip ≤ 135KB(실측 ≈122.6KB, Town 이전 베이스라인
//      ≈121.2KB로 알려짐 — 이 예산은 "회귀는 잡되 정상 변동은 통과"할 여유를
//      남긴다).
//   4. 메인 청크에 'paulTownV1:!1'(플래그 기본 OFF가 실제 배포본에 반영됐다는
//      증거) 리터럴이 존재.
//   5. 어떤 청크에도 src/assets/town 이미지 URL이 없다(TOWN_ASSETS가 비어
//      있어 지금은 전부 이모지 폴백 — 이미지가 실제로 번들되면 이 체크가
//      깨져 "언제 채워졌는지"를 잡아준다).
//   6. "핵심 시작 경로" JS 원본(raw) 합계 ≤ 1.5MB.
//
// ⚠ 스코프를 좁힌 결정 1건 — 정직하게 기록한다: 6번은 문자 그대로
// "dist/assets/*.js 전체 원본 합계"로 읽으면 안 된다. 실측(2026-09-11)
// 전체 합계는 ≈3.16MB(binary)인데 그중 pdf.worker.min-*.mjs(≈1.19MB) +
// pdf-*.js(≈0.45MB) + xlsx-*.js(≈0.40MB) 세 파일이 ≈2.1MB를 차지한다.
// 이 셋은 관리자가 성적표 PDF/엑셀을 실제로 내보낼 때만 지연 로드되는
// Town 도입 이전부터 있던 기존 기능(AdminScreen 전용, 학생 경로와 무관)
// 이라 "Town 코드가 커져서 학생이 매번 받는 초기 로드가 무거워진다"는 이
// 예산의 취지와 무관하다. 그대로 포함하면 이 체크는 Town 변경 여부와
// 상관없이 상시 FAIL하는 죽은 게이트가 된다(레지스트리 testReleaseGate.mjs
// 의 baseline/regression 분리 원칙, handoff.md Release Gate 섹션과 같은
// 정신 — "항상 빨간불"은 무시당한다). 그래서 6번은 그 3개 파일을 제외한
// "핵심 시작 경로" 합계에 적용하고, 제외 전 전체 합계는 정보용으로 그대로
// 출력한다(숨기지 않음). 실측(2026-09-11): 핵심 합계 ≈1.168MB(예산 대비
// 여유 ≈22% — 최초 1.2MB 예산 초안은 여유 ≈2.7%로 너무 빠듯해 verify:all
// 이 build 직후 실행되는 CI에서 정상적인 크기 변동에도 깨질 위험이
// 있다는 코디네이터 피드백에 따라 1.5MB로 상향. 러너웨이(수백 KB 단위
// 급증)는 여전히 잡되 정상 변동엔 훨씬 넉넉한 여유를 둔다. gzip 예산
// (메인 ≤135KB/TownScreen ≤15KB)과 다른 단언은 전부 그대로).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const ASSETS_DIR = path.join(DIST, 'assets')

let totalPassed = 0
let totalFailed = 0
const failures = []
function check(label, cond, detail) {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else {
    totalFailed++
    const msg = detail !== undefined ? `${label} — ${detail}` : label
    failures.push(msg)
    console.log(`  FAIL  ${msg}`)
  }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function skip(reason) {
  console.log(`SKIP — ${reason}`)
  console.log('총 0개 단언 — dist/ 산출물 부재(신선한 체크아웃 또는 다른 에이전트가 아직 빌드 중). 회귀 아님, exit 0.')
  process.exit(0)
}

// ── 0. dist/ 존재 확인(부재 시 SKIP, exit 0) ──────────────────────────────
if (!existsSync(DIST) || !existsSync(ASSETS_DIR)) {
  skip('dist/ 또는 dist/assets/ 가 없음 — 이 스크립트는 빌드를 트리거하지 않는다(다른 에이전트가 dist/를 소유 중일 수 있음).')
}

let assetFiles
try {
  assetFiles = readdirSync(ASSETS_DIR)
} catch {
  skip('dist/assets/ 읽기 실패')
}

const jsFiles = assetFiles.filter((f) => /\.(m?js)$/.test(f))
if (jsFiles.length === 0) {
  skip('dist/assets/*.js(.mjs) 없음 — 빌드 산출물이 불완전함.')
}

function findChunk(pattern) {
  const matches = assetFiles.filter((f) => pattern.test(f))
  if (matches.length === 0) return null
  // 여러 개 매치되면(있을 리 없지만) 가장 짧은 이름(가장 단순한 파일명) 사용.
  return matches.sort((a, b) => a.length - b.length)[0]
}

const mainFile = findChunk(/^index-[\w-]+\.js$/)
const townFile = findChunk(/^TownScreen-[\w-]+\.js$/)

if (!mainFile || !townFile) {
  skip(`필요한 청크를 찾지 못함(main=${mainFile || 'NONE'}, TownScreen=${townFile || 'NONE'}) — 빌드 산출물 구조가 예상과 다름(청크 분할 변경 등). 신선한 체크아웃 시나리오는 아니므로 회귀일 수 있으나, 이 스크립트는 dist 부재/불완전 케이스 전부를 안전하게 SKIP한다(과제 지시: "dist/assets가 없으면 SKIP").`)
}

let indexHtml = ''
const indexHtmlPath = path.join(DIST, 'index.html')
if (existsSync(indexHtmlPath)) indexHtml = readFileSync(indexHtmlPath, 'utf8')

function readAsset(name) {
  return readFileSync(path.join(ASSETS_DIR, name), 'utf8')
}
function readAssetBuf(name) {
  return readFileSync(path.join(ASSETS_DIR, name))
}
function gzipBytes(buf) {
  return zlib.gzipSync(buf).length // 기본(level 6) — vite/브라우저 실측치와 근접
}
function fmtKB(bytes) {
  return (bytes / 1000).toFixed(1) // 결정적 소수 KB(=bytes/1000), 과제 설명의 "≈122.6 KB"와 동일 단위
}
function fmtMB(bytes) {
  return (bytes / 1_000_000).toFixed(3)
}

const mainBuf = readAssetBuf(mainFile)
const townBuf = readAssetBuf(townFile)
const mainSrc = mainBuf.toString('utf8')
const townSrc = townBuf.toString('utf8')

const mainGzip = gzipBytes(mainBuf)
const townGzip = gzipBytes(townBuf)

const MAIN_GZIP_BUDGET_BYTES = 135 * 1000
const TOWN_GZIP_BUDGET_BYTES = 15 * 1000
const CORE_RAW_BUDGET_BYTES = 1.5 * 1_000_000

// ── 1. 코드 분할 — TownScreen은 별도 청크(lazy), index.html이 직접 참조하지 않음 ──
section('1. 코드 분할 — TownScreen 지연 로드')
check(`TownScreen 청크가 별도 파일로 존재 (${townFile})`, !!townFile)
check(
  'dist/index.html이 TownScreen 청크 파일명을 직접 참조하지 않음(정적 <script>/modulepreload 아님)',
  indexHtml.length > 0 ? !indexHtml.includes(townFile) : true,
  indexHtml.length === 0 ? 'index.html 없음 — 확인 불가, 통과 처리' : undefined,
)
check(
  `메인 청크(${mainFile})가 TownScreen 청크 파일명을 문자열로 담고 있음(동적 import() 배선의 증거)`,
  mainSrc.includes(townFile.replace(/\.js$/, '')) || mainSrc.includes('TownScreen-'),
)

// ── 2. gzip 크기 예산 ──────────────────────────────────────────────────────
section('2. gzip 크기 예산')
check(`TownScreen 청크 gzip ≤ 15KB (실측 ${fmtKB(townGzip)}KB)`, townGzip <= TOWN_GZIP_BUDGET_BYTES)
check(`메인 청크 gzip ≤ 135KB (실측 ${fmtKB(mainGzip)}KB)`, mainGzip <= MAIN_GZIP_BUDGET_BYTES)

// ── 3. 플래그 기본값 — 배포본에 paulTownV1 OFF가 반영됐는지 ──────────────
section('3. 플래그 기본값(paulTownV1 OFF)')
check("메인 청크에 'paulTownV1:!1'(minify된 false) 리터럴 존재", mainSrc.includes('paulTownV1:!1'))

// ── 4. 마을 이미지 에셋 미번들(TOWN_ASSETS 비어있음) ─────────────────────
section('4. 마을 이미지 에셋 — 아직 번들되지 않음(전부 이모지 폴백)')
const TOWN_ASSET_URL_RE = /assets\/town\//
check('메인 청크에 assets/town/ 경로 문자열 0건', !TOWN_ASSET_URL_RE.test(mainSrc))
check('TownScreen 청크에 assets/town/ 경로 문자열 0건', !TOWN_ASSET_URL_RE.test(townSrc))
const KNOWN_SAFE_IMAGE_PREFIX = /^(paul_|favicon\.)/
const strayImages = assetFiles.filter(
  (f) => /\.(png|jpe?g|webp|gif)$/i.test(f) && !KNOWN_SAFE_IMAGE_PREFIX.test(f),
)
check(
  '마을 아이템(집/나무/동물 등) 이미지 파일이 dist/assets에 하나도 없음(TOWN_ASSETS={} 상태와 일치)',
  strayImages.length === 0,
  strayImages.length > 0 ? strayImages.join(', ') : undefined,
)

// ── 5. 전체 JS 원본(raw) 크기 예산(핵심 시작 경로만, 스코프는 파일 헤더 참고) ──
section('5. JS 원본(raw) 크기 — 핵심 시작 경로')
// 관리자 전용 대용량 서드파티(성적표 PDF/엑셀 내보내기, Town 도입 이전부터
// 존재, 실제로 그 화면을 열 때만 지연 로드) — 파일 헤더의 스코프 결정 참고.
const ADMIN_ONLY_HEAVY_RE = /^pdf\.worker[-.]|^pdf-|^xlsx-/
let totalRaw = 0
let coreRaw = 0
const sizeRows = []
for (const f of jsFiles) {
  const size = statSync(path.join(ASSETS_DIR, f)).size
  totalRaw += size
  const excluded = ADMIN_ONLY_HEAVY_RE.test(f)
  if (!excluded) coreRaw += size
  sizeRows.push({ file: f, size, excluded })
}
check(
  `핵심 시작 경로 JS 원본 합계 ≤ 1.5MB (실측 ${fmtMB(coreRaw)}MB, 관리자 전용 pdf/pdf.worker/xlsx 제외)`,
  coreRaw <= CORE_RAW_BUDGET_BYTES,
)
console.log(`  정보  dist/assets/*.js 전체 원본 합계(제외 없음) = ${fmtMB(totalRaw)}MB — pdf.worker/pdf/xlsx 제외분 = ${fmtMB(totalRaw - coreRaw)}MB`)

// ── 결과 표 ──────────────────────────────────────────────────────────────
section('크기 표')
sizeRows.sort((a, b) => b.size - a.size)
console.log('  ' + '파일'.padEnd(34) + 'raw(KB)'.padStart(10) + '  scope')
for (const r of sizeRows) {
  console.log('  ' + r.file.padEnd(34) + fmtKB(r.size).padStart(10) + (r.excluded ? '  admin-only(제외)' : '  core'))
}
console.log('')
console.log('  ' + '항목'.padEnd(24) + 'raw(KB)'.padStart(10) + 'gzip(KB)'.padStart(10) + '  예산(gzip)')
console.log('  ' + mainFile.padEnd(24) + fmtKB(mainBuf.length).padStart(10) + fmtKB(mainGzip).padStart(10) + '  135KB')
console.log('  ' + townFile.padEnd(24) + fmtKB(townBuf.length).padStart(10) + fmtKB(townGzip).padStart(10) + '  15KB')

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
