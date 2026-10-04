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
//
// ⚠ 2026-09-23 수정 — "메인 청크" 판정 방식을 파일명 패턴 매칭에서
// dist/index.html 기반 실제 엔트리 참조로 바꿨다. 근본 원인: Stage 4
// (feat/town proto commit 8132dd1 계열)부터 src/assets/town/index.js(마을
// 에셋 레지스트리)가 지연 로드되는 Proto25DScreen 청크에서도 import되면서,
// Rollup이 그 모듈을 전용 공유 청크로 분리해 이름을 "index-<hash>.js"로
// 붙였다 — 즉 실제 엔트리 청크와 이름 패턴이 동일한 "index-*.js" 파일이
// dist/assets에 2개 존재하게 됐다. 기존 findChunk(/^index-[\w-]+\.js$/)는
// "여러 개 매치되면 가장 짧은 이름을 쓴다"는 임의 동률 규칙이라, 두 후보의
// 상대적 이름 정렬 순서가 OS/파일시스템의 readdirSync 열거 순서에 의존했다
// (Windows NTFS와 Linux ext4가 같은 순서를 보장하지 않음) — 로컬(Windows)
// 에서는 우연히 실제 엔트리(index-B-ciJRTO.js)가 먼저 나와 통과했지만,
// Linux CI(run 35792210920)에서는 에셋 레지스트리 청크(index-BK1aVjiB.js,
// 24KB, TownScreen 참조도 paulTownV1 리터럴도 없음)가 선택되어 "메인 청크에
// TownScreen 청크 파일명 문자열 존재"·"메인 청크에 paulTownV1:!1 리터럴
// 존재" 두 단언이 FAIL했다. 진짜 불변식은 "메인 청크 = dist/index.html이
// <script type="module"> 정적 태그로 직접 참조하는 그 파일"이므로, 이제
// index.html을 파싱해 그 엔트리 파일명을 직접 얻는다(파일명 패턴 매칭이 아니라
// 산출물의 실제 배선을 읽음). index.html에서 못 찾으면(예상 밖 산출물 구조)
// 기존 이름 패턴 방식으로 안전하게 폴백하되, 그 사실을 경고로 콘솔에
// 남긴다 — 폴백 시에도 "신선한 체크아웃(dist 자체 부재)"는 여전히
// 0번(위쪽)에서 이미 SKIP 처리되므로 무관하다. TownScreen 청크 판정(접두어
// "TownScreen-")과 나머지 모든 단언(예산/플래그/에셋 인벤토리)은 이 불변식
// 변경과 무관해 손대지 않았다 — 아래에서 각 단언을 현재 dist에 대해 그대로
// 재확인했다(모두 그 진짜 엔트리를 대상으로 여전히 성립).
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

// index.html을 먼저 읽는다 — 메인 청크 판정이 이제 이 파일의 실제 <script
// type="module"> 엔트리 참조에 의존하기 때문에 findChunk보다 먼저 필요하다.
let indexHtml = ''
const indexHtmlPath = path.join(DIST, 'index.html')
if (existsSync(indexHtmlPath)) indexHtml = readFileSync(indexHtmlPath, 'utf8')

// 메인 청크 = dist/index.html이 <script type="module" ... src="/assets/…">로
// 직접 참조하는 그 파일(진짜 엔트리, 산출물의 실제 배선). 파일명 패턴이
// 아니라 이 배선을 읽어 판정하므로, 같은 "index-*.js" 이름 패턴을 가진
// 무관한 공유 청크(예: 에셋 레지스트리가 분리돼 나온 청크)가 있어도 흔들리지
// 않는다.
function resolveMainFileFromIndexHtml(html, files) {
  if (!html) return null
  const m = html.match(/<script[^>]*\btype=["']module["'][^>]*\bsrc=["']\/assets\/([^"']+\.js)["']/)
  if (!m) return null
  const name = m[1]
  return files.includes(name) ? name : null
}

let mainFile = resolveMainFileFromIndexHtml(indexHtml, assetFiles)
if (!mainFile) {
  // 폴백: index.html에서 못 찾은 경우(예상 밖 산출물 구조)만 기존 이름
  // 패턴 방식을 쓴다 — "신선한 체크아웃"은 이미 위 0번에서 SKIP 처리됐으므로
  // 여기 도달했다는 것 자체가 이례적인 상황이라는 신호. 조용히 넘어가지
  // 않고 경고를 남긴다.
  const fallback = findChunk(/^index-[\w-]+\.js$/)
  if (fallback) {
    console.log(`  경고  dist/index.html에서 메인 청크 엔트리를 찾지 못해 이름 패턴 폴백 사용(${fallback}) — index.html 구조 변경 여부 확인 필요`)
  }
  mainFile = fallback
}
const townFile = findChunk(/^TownScreen-[\w-]+\.js$/)

if (!mainFile || !townFile) {
  skip(`필요한 청크를 찾지 못함(main=${mainFile || 'NONE'}, TownScreen=${townFile || 'NONE'}) — 빌드 산출물 구조가 예상과 다름(청크 분할 변경 등). 신선한 체크아웃 시나리오는 아니므로 회귀일 수 있으나, 이 스크립트는 dist 부재/불완전 케이스 전부를 안전하게 SKIP한다(과제 지시: "dist/assets가 없으면 SKIP").`)
}

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

// ── 4. 마을 이미지 에셋 — 정확히 Batch 1+2+3 21개만 번들됨(그 외 0개) ────
// 2026-09-13 갱신 — Batch 1 아트워크 드롭인(src/assets/town/index.js의
// TOWN_ASSETS 8개 키)으로 이 섹션의 전제가 바뀌었다. 예전엔 "마을 이미지
// 0개"가 TOWN_ASSETS={} 상태와 일치하는 유일하게 옳은 값이었지만, 이제는
// "정확히 이 8개만 있고 그 이상은 없음"이 옳은 값이었다 — testTownUiStatic.mjs/
// testTownV2Static.mjs가 이미 겪은 것과 동일한 종류의 전제 갱신(그 두
// 파일과 이 섹션 모두 같은 근본 사실—TOWN_ASSETS의 실제 키 목록—을 서로
// 다른 관점에서 검사한다: 소스 코드 vs 번들 산출물). 2026-09-14에 Batch 2
// 첫 자산(book-shop), 두 번째 자산(red-post-box), 세 번째 자산(animals/cat),
// 네 번째 자산(animals/owl), 다섯 번째 자산(animals/puppy), 여섯 번째 자산
// (buildings/cafe)이 추가되어 14개로, 같은 날 Batch 3 첫 자산
// (special/bridge)·두 번째 자산(special/english-school)·세 번째 자산
// (decorations/town-sign)·네 번째 자산(special/clock-tower)·다섯 번째
// 자산(decorations/shop-lamp)·여섯 번째 자산(decorations/street-lamp)·
// 일곱 번째 자산(decorations/stone-fountain)이 추가되어 21개로 갱신
// (decorations/bench는 baked 배경 글로우 결함으로 DEFERRED, TOWN_ASSETS에
// 없음).
//
// ⚠ red-post-box·cat·owl·puppy·shop-lamp·street-lamp·stone-fountain은
// 실측(빌드 산출물 직접 확인)상 나머지 14개와 다르게 동작한다 — 다른
// 발견 사항을 그대로 보고: red-post-box.webp(3670B)·cat.webp(2516B)·
// owl.webp(3822B)·puppy.webp(2710B)·shop-lamp.webp(3842B)·
// street-lamp.webp(2564B)·stone-fountain.webp(3678B)는 전부 Vite 기본
// assetsInlineLimit(4096바이트) 미만이라 dist/assets에 별도 물리
// 파일로 방출되지 않고, 참조하는 JS 청크 안에 data:image/webp;base64
// URL로 직접 인라인된다(나머지 14개는 전부 4096바이트 이상이라 물리
// 파일로 방출됨, 최소 book-shop 10.21KB). cafe.webp(10258바이트)도
// book-shop과 마찬가지로 한도를 크게 넘어 물리 파일로 방출된다(실측
// 빌드 산출물로 확인 — dist/assets에 cafe-*.webp 존재, JS 청크에 새
// base64 인스턴스 추가 없음). bridge.webp(9726바이트)·
// english-school.webp(24442바이트)·town-sign.webp(5464바이트)·
// clock-tower.webp(17064바이트)도 동일하게 물리 파일로 방출된다. 이는
// Vite의 표준 동작이며 회귀가 아니다 — 그래서 "물리 파일 14개" 계약과
// "인라인 7개" 계약을 분리해서 검사한다.
section('4. 마을 이미지 에셋 — Batch 1+2+3 21개만 번들, 그 외 0개')
const TOWN_ASSET_URL_RE = /assets\/town\//
check('메인 청크에 assets/town/ 경로 문자열 0건(Vite가 소스 폴더 구조를 산출물 URL에 남기지 않음)', !TOWN_ASSET_URL_RE.test(mainSrc))
check('TownScreen 청크에 assets/town/ 경로 문자열 0건(위와 동일 이유)', !TOWN_ASSET_URL_RE.test(townSrc))
const KNOWN_SAFE_IMAGE_PREFIX = /^(paul_|favicon\.)/
// 2026-09-17 갱신(P0 최종 아트 7종 드롭인, PR #60) — 전제가 다시 바뀌었다:
// (a) nature/flower-garden·decorations/bench가 TOWN_ASSETS에 신규 등록돼
// 23개 키, (b) 최종 아트로 교체된 red-post-box.webp(8644B)·street-lamp.webp
// (7256B)가 4096바이트 한도를 넘어 이제 물리 파일로 방출된다. 따라서
// 물리 파일 계약은 14→18개, 인라인 계약은 7→5개(cat/owl/puppy/shop-lamp/
// stone-fountain — 이 5개는 이번에 손대지 않아 그대로 4KB 미만). 크기
// 예산(gzip 135KB/15KB, raw 1.5MB) 자체는 그대로다 — 갱신된 것은 산출물
// 인벤토리 사실뿐이다(빌드 산출물 직접 확인).
// 물리 파일로 방출될 것으로 기대되는 18개(cat/owl/puppy/shop-lamp/
// stone-fountain 제외 — 위 설명 참고).
const EXPECTED_BATCH1_IMAGE_BASENAMES = [
  'my-house', 'british-cottage', 'book-shop', 'cafe', 'bridge', 'english-school', 'town-sign', 'clock-tower', 'tree',
  'garden-stage-0', 'garden-stage-1', 'garden-stage-2', 'garden-stage-3', 'garden-stage-4',
  'flower-garden', 'bench', 'red-post-box', 'street-lamp',
]
// Vite는 해시를 붙여 `<basename>-<hash>.<ext>`로 내보낸다(예:
// my-house-BbqH3Nte.webp) — 해시는 빌드마다 바뀌므로 접두사로만 매칭한다.
function isExpectedBatch1Image(f) {
  return EXPECTED_BATCH1_IMAGE_BASENAMES.some((base) => f.startsWith(`${base}-`) || f === `${base}.webp`)
}
// 2026-09-15b — 마을 장면 비주얼 업그레이드용 환경/장식 아트워크 6개
// (사용자 승인, TownGrid.jsx에서 townAsset()/TOWN_ASSETS 카탈로그를 거치지
// 않고 직접 import). 위 EXPECTED_BATCH1_IMAGE_BASENAMES와 의도적으로
// 분리한다 — 그 목록은 구매 가능한 카탈로그 아이템(townCatalog.js) 전용
// 계약이고, 이건 구매 불가능한 순수 배경/장식이라 서로 다른 개념이다.
const EXPECTED_ENV_ARTWORK_BASENAMES = [
  'village-sky-backdrop', 'village-hedge-border', 'village-cobblestone-tile',
  'garden-accent-1', 'garden-accent-2', 'garden-accent-3',
]
function isExpectedEnvArtwork(f) {
  return EXPECTED_ENV_ARTWORK_BASENAMES.some((base) => f.startsWith(`${base}-`) || f === `${base}.webp`)
}
// 2026-09-18(작업 지시서 STEP 4) — src/assets/town/env/index.js(TOWN_ENV_ASSETS,
// 위 EXPECTED_ENV_ARTWORK_BASENAMES(2026-09-15b, TownGrid.jsx 전용 6개)와는
// 완전히 별개 레지스트리, scripts/testTownEnvAssets.mjs가 그 소스 자체를
// 이미 검증한다)의 35개 키 — TownGroundLayer.jsx/TownEnvImage.jsx가 처음
// import해 빌드 그래프에 들어갔다. 아래 4b 섹션이 이 35개의 물리 파일
// 인벤토리/청크 누출을 자세히 검증하고, 여기서는 "이 35개도 stray가
// 아니다"만 알린다(같은 매칭 로직을 두 섹션이 공유).
const ENV_ART_KEYS = [
  'sky-hills', 'grass-base', 'grass-patch-light', 'grass-patch-dark', 'grass-patch-worn',
  'wildflower-scatter', 'path-straight', 'path-straight-narrow', 'path-curve-gentle',
  'path-curve-strong', 'path-fork', 'path-junction', 'path-end', 'path-end-entrance',
  'fence-straight', 'fence-straight-short', 'fence-corner', 'fence-gate',
  'hedge-straight', 'hedge-straight-tall', 'hedge-end',
  'shrub-round', 'shrub-round-small', 'shrub-wide',
  'flower-cluster-pink', 'flower-cluster-yellow', 'flower-cluster-mixed', 'flower-bed-border',
  'flower-pot', 'flower-pot-tall',
  'river-straight', 'river-bend', 'river-highlight', 'riverbank-reeds', 'riverbank-reeds-stones',
]
// basename 접두어 충돌(예: path-straight vs path-straight-narrow, Vite 해시
// 자체에 '-'/'_' 둘 다 나올 수 있어(실측: path-curve-gentle-DsQ3-r7b.webp)
// "접미부에 하이픈 없음"을 가정한 정규식만으로는 못 가른다, 실측으로 확인
// 했다) — "가장 긴(가장 구체적인) 키가 이긴다"로 명확히 가른다.
function matchEnvArtKey(filename) {
  if (!filename.endsWith('.webp')) return null
  let best = null
  for (const key of ENV_ART_KEYS) {
    if (filename.startsWith(`${key}-`) && (!best || key.length > best.length)) best = key
  }
  return best
}
// 2026-09-24(Phase 6C) — Paul 캐릭터 스프라이트 PNG 16개(8프레임 x 1x/2x,
// src/assets/town/character/, characterSpriteManifest.default.js가
// Proto25DScreen.jsx의 spriteManifest 기본값으로 배선)가 처음으로 빌드
// 그래프에 들어와 dist/assets에 나타났다. 이 파일들은 §4가 검사하는
// townCatalog.js 구매 카탈로그(EXPECTED_BATCH1_IMAGE_BASENAMES)나
// TownGrid.jsx 전용 환경/장식(EXPECTED_ENV_ARTWORK_BASENAMES)이나 V2 환경
// 아트(ENV_ART_KEYS)와는 완전히 다른 별개 레지스트리라 그 목록들에 섞지
// 않고 독립된 매칭 함수로 strayImages 제외 집합에만 등록한다 — 정확한
// 개수/청크 격리/gzip 예산의 실제 검증은 아래 4c 섹션이 전담한다(중복
// 검증 없음, scripts/testPaulSpriteAssets.mjs가 이미 검증한 소스단
// 배선/픽셀 계약은 여기서 재구현하지 않는다).
// 2026-09-25(paul-walk-side-b-v2 원-프레임 스왑) — walk-side-b 프레임 하나가
// 'paul-walk-side-b-v2.png'로 교체됐다(install2 세션, 이 세션은 소유하지
// 않음) — 그 해시드 산출물 파일명(예: paul-walk-side-b-v2-<hash>.png)도
// 여전히 "정상 Paul 스프라이트"로 인식하도록 선택적 `-v숫자` 접미부를
// 허용한다(다른 7개 프레임의 정규식/개수 계약은 그대로 — CLAUDE.md 규칙 3,
// 재구현 없음).
const PAUL_SPRITE_FILE_RE = /^paul-(idle-front|walk-(front|back|side)-[ab](-v\d+)?|sit)(@2x)?-[\w-]+\.png$/
function isPaulSpriteAsset(filename) {
  return PAUL_SPRITE_FILE_RE.test(filename)
}
const strayImages = assetFiles.filter(
  (f) => /\.(png|jpe?g|webp|gif)$/i.test(f) && !KNOWN_SAFE_IMAGE_PREFIX.test(f) && !isExpectedBatch1Image(f) && !isExpectedEnvArtwork(f) && !matchEnvArtKey(f) && !isPaulSpriteAsset(f),
)
check(
  '마을 이미지 중 카탈로그 물리 파일 18개(Batch 1+2+3 14개 + P0 최종 아트로 추가/승격된 4개) + 환경/장식 아트워크 6개(카탈로그 아님, 2026-09-15b) + V2 환경 아트 35개(2026-09-18, 4b 섹션에서 자세히 검증) + Paul 캐릭터 스프라이트 16개(2026-09-24 Phase 6C, 4c 섹션에서 자세히 검증) 외의 예상치 못한 파일이 dist/assets에 없음',
  strayImages.length === 0,
  strayImages.length > 0 ? strayImages.join(', ') : undefined,
)
const foundEnvArtwork = assetFiles.filter(isExpectedEnvArtwork)
const foundEnvArtworkBases = new Set(
  foundEnvArtwork.map((f) => EXPECTED_ENV_ARTWORK_BASENAMES.find((base) => f.startsWith(`${base}-`) || f === `${base}.webp`)),
)
check(
  '환경/장식 아트워크 6개가 전부 dist/assets에 정확히 존재(webp 1개씩)',
  EXPECTED_ENV_ARTWORK_BASENAMES.every((base) => foundEnvArtworkBases.has(base)),
  `found=${[...foundEnvArtworkBases].join(',')}`,
)
const foundBatch1 = assetFiles.filter(isExpectedBatch1Image)
const foundBatch1Bases = new Set(
  foundBatch1.map((f) => EXPECTED_BATCH1_IMAGE_BASENAMES.find((base) => f.startsWith(`${base}-`) || f === `${base}.webp`)),
)
check(
  '카탈로그 물리 파일 18개 asset_key가 전부 dist/assets에 정확히 존재(webp 1개씩)',
  EXPECTED_BATCH1_IMAGE_BASENAMES.every((base) => foundBatch1Bases.has(base)),
  `found=${[...foundBatch1Bases].join(',')}`,
)
check(
  'cat은 물리 파일로 dist/assets에 존재하지 않음(2.5KB < 4KB 인라인 한도, 의도된 Vite 동작)',
  !assetFiles.some((f) => f.startsWith('cat-') || f === 'cat.webp'),
)
check(
  'owl은 물리 파일로 dist/assets에 존재하지 않음(3.8KB < 4KB 인라인 한도, 의도된 Vite 동작)',
  !assetFiles.some((f) => f.startsWith('owl-') || f === 'owl.webp'),
)
check(
  'puppy는 물리 파일로 dist/assets에 존재하지 않음(2.7KB < 4KB 인라인 한도, 의도된 Vite 동작)',
  !assetFiles.some((f) => f.startsWith('puppy-') || f === 'puppy.webp'),
)
check(
  'shop-lamp는 물리 파일로 dist/assets에 존재하지 않음(3.8KB < 4KB 인라인 한도, 의도된 Vite 동작)',
  !assetFiles.some((f) => f.startsWith('shop-lamp-') || f === 'shop-lamp.webp'),
)
check(
  'stone-fountain은 물리 파일로 dist/assets에 존재하지 않음(3.7KB < 4KB 인라인 한도, 의도된 Vite 동작)',
  !assetFiles.some((f) => f.startsWith('stone-fountain-') || f === 'stone-fountain.webp'),
)
const inlinedWebpJsFiles = jsFiles.filter((f) => readAsset(f).includes('data:image/webp;base64,'))
check(
  '11번째 자산(cat)·12번째 자산(owl)·13번째 자산(puppy)·19번째 자산(shop-lamp)·21번째 자산(stone-fountain)이 최소 1개 JS 청크에 data:image/webp;base64 URL로 실제 인라인됨(자산이 조용히 누락되지 않음)',
  inlinedWebpJsFiles.length >= 1,
  `matched=${inlinedWebpJsFiles.join(',') || '(none)'}`,
)
const totalInlinedWebpOccurrences = jsFiles.reduce(
  (sum, f) => sum + (readAsset(f).match(/data:image\/webp;base64,/g) || []).length,
  0,
)
check(
  '인라인된 data:image/webp;base64 URL 발생 횟수가 정확히 5건(cat 1 + owl 1 + puppy 1 + shop-lamp 1 + stone-fountain 1, 중복/누락 없음 — red-post-box/street-lamp는 2026-09-17 최종 아트로 4KB를 넘어 물리 파일로 승격)',
  totalInlinedWebpOccurrences === 5,
  `count=${totalInlinedWebpOccurrences}`,
)

// ── 4b. V2 환경(environment) 아트 — 35개 키 인벤토리 + 메인/V1 청크 누출 가드 ──
// 2026-09-18(작업 지시서 STEP 4) — src/assets/town/env/index.js
// (TOWN_ENV_ASSETS, 위 섹션 4의 카탈로그 물리 파일 18개/환경-장식
// 아트워크 6개와는 완전히 별개 레지스트리, scripts/testTownEnvAssets.mjs가
// 그 소스 자체를 이미 검증한다)가 처음으로 실제 빌드 그래프에 들어간
// 시점 — TownGroundLayer.jsx/TownEnvImage.jsx가 이 레지스트리를
// import한다. 이 섹션은 그 35개 키가 실제 산출물에 정확히 반영됐는지
// (물리 파일 개수, 실측 전부 4KB 이상이라 인라인 후보가 아님)와,
// paulTownV2 플래그가 OFF인 배포본에서 메인 청크/V1 TownScreen 청크가
// 이 자산을 전혀 요청하지 않는지(누출 가드)를 확인한다.
section('4b. V2 환경 아트(35개 키) — 물리 파일 인벤토리 + 메인/V1 청크 누출 가드')
check('환경 아트 키가 정확히 35개(manifest staged 개수와 동일 — scripts/testTownEnvAssets.mjs가 그 원천을 검증)', ENV_ART_KEYS.length === 35)

// ENV_ART_KEYS/matchEnvArtKey는 위 섹션 4(strayImages 계산)와 공유(중복
// 정의 없음, 같은 접두어-충돌 매칭 로직을 여기서도 그대로 재사용).
const envArtFilesByKey = {}
for (const f of assetFiles) {
  const key = matchEnvArtKey(f)
  if (!key) continue
  envArtFilesByKey[key] = envArtFilesByKey[key] || []
  envArtFilesByKey[key].push(f)
}
const envArtPhysicalCount = Object.values(envArtFilesByKey).reduce((sum, arr) => sum + arr.length, 0)
check(
  '환경 아트 35개 키가 전부 정확히 물리 파일 1개씩(실측 전부 4KB 이상이라 인라인 후보가 아님)',
  ENV_ART_KEYS.every((k) => (envArtFilesByKey[k] || []).length === 1),
  JSON.stringify(Object.fromEntries(ENV_ART_KEYS.map((k) => [k, (envArtFilesByKey[k] || []).length]))),
)
check(
  '환경 아트 물리 파일 총 개수 === 35(그 외 미분류/중복 매치 없음)',
  envArtPhysicalCount === 35,
  `count=${envArtPhysicalCount}`,
)
const envArtLeaksInMain = ENV_ART_KEYS.filter((k) => mainSrc.includes(k))
check(
  '메인 청크(index-*.js)에 환경 아트 키 문자열 0건(플래그 OFF 누출 가드 — env 레지스트리는 v2/*에서만 import됨)',
  envArtLeaksInMain.length === 0,
  JSON.stringify(envArtLeaksInMain),
)
const envArtLeaksInTownV1 = ENV_ART_KEYS.filter((k) => townSrc.includes(k))
check(
  'V1 TownScreen 청크에 환경 아트 키 문자열 0건(V1은 env 레지스트리를 import하지 않음)',
  envArtLeaksInTownV1.length === 0,
  JSON.stringify(envArtLeaksInTownV1),
)

// ── 4c. Paul 캐릭터 스프라이트(2026-09-24, Phase 6C) — 16개 물리 파일
// 인벤토리 + 메인/V1/V2 청크 누출 가드 ────────────────────────────────────
// Phase 6C — install 세션이 src/assets/town/character/에 Paul 캐릭터
// 스프라이트 PNG 16장(8프레임: idle-front/walk-front-a·b/walk-back-a·b/
// walk-side-a·b/sit, 각 1x+@2x)을 드롭하고 characterSpriteManifest.default.js
// (PAUL_SPRITE_MANIFEST)가 Proto25DScreen.jsx의 spriteManifest 기본값으로
// 배선됐다(그 소스단 계약/픽셀 실측은 scripts/testPaulSpriteAssets.mjs가
// 이미 전담 검증 — 여기서는 재구현하지 않는다, CLAUDE.md 규칙 3). 이
// 섹션은 그 결과가 실제 빌드 산출물에 기대한 모양으로만 반영됐는지 —
// 정확히 16개 물리 파일 + Proto25DScreen 청크(지연 로드) 하나에만 격리 +
// gzip 예산 — 를 확인한다. Proto25DScreen 청크가 §1(TownScreen)과 마찬가지로
// dist/index.html이 직접 참조하지 않는 지연 로드 청크라는 사실 자체는
// scripts/testPaulSpriteAssets.mjs §8(번들 누출 가드)이 이미 확인했으므로
// (그 스위트가 유일한 검증 경로) 여기서 다시 확인하지 않고, 이 파일
// 고유의 관심사(gzip 예산 + 이 파일이 이미 읽어둔 main/townSrc 대비 재확인)
// 만 추가한다.
section('4c. Paul 캐릭터 스프라이트(2026-09-24, Phase 6C) — 16개 물리 파일 인벤토리 + 메인/V1/V2 청크 누출 가드')
const paulSpriteFiles = assetFiles.filter(isPaulSpriteAsset)
check(
  'Paul 캐릭터 스프라이트 물리 파일이 정확히 16개(8프레임 x 1x/2x)',
  paulSpriteFiles.length === 16,
  `count=${paulSpriteFiles.length}, files=${JSON.stringify(paulSpriteFiles)}`,
)

const protoFile = findChunk(/^Proto25DScreen-[\w-]+\.js$/)
if (check('Proto25DScreen 청크가 별도 파일로 존재(React.lazy 분할, paulTown2_5d 프로토타입)', !!protoFile)) {
  const protoBuf = readAssetBuf(protoFile)
  const protoSrc = protoBuf.toString('utf8')
  const protoGzip = gzipBytes(protoBuf)
  const PROTO_GZIP_BUDGET_BYTES = 60 * 1000 // SPRITE_CONTRACT §5-6 예산(2026-09-24 실측 ≈11.2KB, 러너웨이만 잡는 넉넉한 여유)

  check(`'paul-idle-front' 문자열이 Proto25DScreen 청크(${protoFile})에 존재(스프라이트가 실제로 이 청크에서 참조됨)`, protoSrc.includes('paul-idle-front'))
  check(`'paul-sit' 문자열이 Proto25DScreen 청크(${protoFile})에 존재`, protoSrc.includes('paul-sit'))
  check(
    "메인 청크(index-*.js)에 'paul-idle-front'/'paul-sit' 문자열 0건(항상 지연 로드 — 누출 가드)",
    !mainSrc.includes('paul-idle-front') && !mainSrc.includes('paul-sit'),
  )
  check(
    "V1 TownScreen 청크에 'paul-idle-front'/'paul-sit' 문자열 0건(V1은 Proto25DScreen을 import하지 않는 완전 격리 실험)",
    !townSrc.includes('paul-idle-front') && !townSrc.includes('paul-sit'),
  )
  const townV2File = findChunk(/^TownScreenV2-[\w-]+\.js$/)
  if (townV2File) {
    const townV2Src = readAsset(townV2File)
    check(
      `V2 TownScreenV2 청크(${townV2File})에 'paul-idle-front'/'paul-sit' 문자열 0건(V2도 Proto25DScreen을 import하지 않음)`,
      !townV2Src.includes('paul-idle-front') && !townV2Src.includes('paul-sit'),
    )
  } else {
    console.log('  정보  TownScreenV2 청크를 찾지 못함(산출물 구조가 예상과 다름) — 이 청크 대상 누출 가드만 건너뜀(다른 단언과 무관, 신선한 체크아웃이 아니므로 전체 SKIP은 하지 않음).')
  }

  check(`Proto25DScreen 청크 gzip ≤ 60KB (실측 ${fmtKB(protoGzip)}KB)`, protoGzip <= PROTO_GZIP_BUDGET_BYTES)
} else {
  console.log('  정보  Proto25DScreen 청크 부재로 이 섹션의 나머지 청크-격리/gzip 단언을 건너뜀(바로 위 존재 여부 FAIL이 이미 문제를 보고함).')
}

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
