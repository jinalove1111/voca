// scripts/testTownHarnessGeometrySync.mjs — 디자인 목업 하네스
// (docs/design/town/mockup/paul-town-recompose.html의 #geometry JSON)와
// 코드 계약(src/utils/town/worldContract.js)이 "같은 지오메트리"를
// 서술하는지 비교하는 순수 단위 테스트(2026-09-17).
//
// 목적: 두 진실 원천이 서로 다른 세션/커밋에서 독립적으로 갱신될 수 있으므로
// (하나는 디자인 목업 HTML, 하나는 렌더링에 쓰이는 코드 계약), 수치가 조용히
// 드리프트해도 아무도 못 채는 사고를 막는다. 불일치가 발견되면 이 스크립트는
// 어느 쪽도 수정하지 않고 FAIL 상세로 정확한 차이값만 보고한다 — 어느 쪽이
// 틀렸는지는 오너/리드가 판단한다.
//
// 로딩 방식: worldContract.js는 townScene.js를 확장자 없는 상대 import로
// 참조하므로 plain `node`로 바로 import하면 ERR_MODULE_NOT_FOUND로 죽는다
// (scripts/testTownWorldContract.mjs 2026-09-17 실측과 동일 원인). 그 스크립트와
// 똑같이 esbuild로 scripts/.tmp/에 번들한 뒤 그 산출물을 import한다.
//
// HTML의 #geometry JSON은 정규식으로 직접 뽑는다(HTML 파서 의존성 추가 없음,
// CLAUDE.md 규칙 6 — 외부 의존성 최소화).
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const CONTRACT_BUNDLE_PATH = path.join(TMP_DIR, 'worldContractForHarnessSync.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/worldContract.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: CONTRACT_BUNDLE_PATH,
})
const { WORLD, LANDMARKS, PATHS, RIVER, GARDEN_GATE, PROTECTED } =
  await import(`${pathToFileURL(CONTRACT_BUNDLE_PATH).href}?t=${Date.now()}`)

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }
const near = (a, b, tol = 0.5) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol

// ── 0. HTML에서 #geometry JSON 추출 ──────────────────────────────────────
section('0. 디자인 목업 #geometry JSON 추출')

const HTML_PATH = path.join(ROOT, 'docs/design/town/mockup/paul-town-recompose.html')
let DESIGN = null
if (check('paul-town-recompose.html이 존재함', existsSync(HTML_PATH))) {
  const html = readFileSync(HTML_PATH, 'utf8').replace(/\r\n?/g, '\n')
  const m = html.match(/<script\s+id="geometry"\s+type="application\/json">([\s\S]*?)<\/script>/)
  if (check('#geometry <script> 블록을 찾음', !!m)) {
    try {
      DESIGN = JSON.parse(m[1])
      check('#geometry JSON이 파싱 가능함', true)
    } catch (e) {
      check('#geometry JSON이 파싱 가능함', false, `parse error: ${e.message}`)
    }
  }
}

if (!DESIGN) {
  console.log('\n#geometry JSON을 확보하지 못해 나머지 비교를 건너뜀.')
  console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
  process.exit(1)
}

// ── 1. WORLD 크기 ─────────────────────────────────────────────────────────
section('1. WORLD 크기')
check(`world.w 일치(design=${DESIGN.world?.w}, code=${WORLD.w})`, DESIGN.world?.w === WORLD.w)
check(`world.h 일치(design=${DESIGN.world?.h}, code=${WORLD.h})`, DESIGN.world?.h === WORLD.h)

// ── 2. 랜드마크 id 집합 ───────────────────────────────────────────────────
section('2. 랜드마크 id 집합')

// 2026-09-17 결정: 제품의 LOTS id가 정식 기준이다. 디자인 목업 #geometry
// JSON의 landmarks 키를 stone-fountain/english-school/clock-tower로
// 리네이밍했고(renderLandmark() 호출부의 첫 인자도 함께 갱신, 렌더링
// 변화 없음 — shoot.mjs 16장 재촬영으로 확인), 이제 두 진실 원천의 id
// 집합은 별도 매핑 없이 원문 그대로 일치해야 한다.
const designIds = Object.keys(DESIGN.landmarks || {}).sort()
const codeIds = Object.keys(LANDMARKS).sort()
check(
  '랜드마크 id 집합이 완전히 동일함(별도 매핑 불필요)',
  JSON.stringify(designIds) === JSON.stringify(codeIds),
  `design=${JSON.stringify(designIds)} code=${JSON.stringify(codeIds)}`,
)

// ── 3. 랜드마크 좌표/폭(허용치 0.5) ─────────────────────────────────────────
section('3. 랜드마크 좌표/폭(허용치 0.5)')
for (const id of codeIds) {
  const d = DESIGN.landmarks?.[id]
  const c = LANDMARKS[id]
  if (!check(`${id} 양쪽 모두 존재함`, !!d && !!c)) continue
  check(`${id}.x 0.5 이내`, near(d.x, c.x), `design.x=${d.x} code.x=${c.x} dx=${(d.x - c.x).toFixed(2)}`)
  check(`${id}.y 0.5 이내`, near(d.y, c.y), `design.y=${d.y} code.y=${c.y} dy=${(d.y - c.y).toFixed(2)}`)
  check(`${id}.w 0.5 이내`, near(d.w, c.w), `design.w=${d.w} code.w=${c.w} dw=${(d.w - c.w).toFixed(2)}`)
}

// ── 4. PATHS(trunk/square/shop/sea) ──────────────────────────────────────
section('4. PATHS 각 branch — 점 개수 + (x,y,w) 좌표')
for (const branch of ['trunk', 'square', 'shop', 'sea']) {
  const d = DESIGN.paths?.[branch] || []
  const c = PATHS[branch] || []
  if (!check(`PATHS.${branch} 점 개수 일치(design=${d.length}, code=${c.length})`, d.length === c.length)) continue
  for (let i = 0; i < d.length; i++) {
    const [dx, dy, dw] = d[i]
    const [cx, cy, cw] = c[i]
    check(
      `PATHS.${branch}[${i}] (x,y,w) 0.5 이내`,
      near(dx, cx) && near(dy, cy) && near(dw, cw),
      `design=[${dx},${dy},${dw}] code=[${cx},${cy},${cw}] diff=[${(dx - cx).toFixed(2)},${(dy - cy).toFixed(2)},${(dw - cw).toFixed(2)}]`,
    )
  }
}

// ── 5. RIVER ──────────────────────────────────────────────────────────────
section('5. RIVER')
const dRiver = DESIGN.river || []
const cRiver = RIVER || []
if (check(`RIVER 점 개수 일치(design=${dRiver.length}, code=${cRiver.length})`, dRiver.length === cRiver.length)) {
  for (let i = 0; i < dRiver.length; i++) {
    const [dx, dy] = dRiver[i]
    const [cx, cy] = cRiver[i]
    check(
      `RIVER[${i}] (x,y) 0.5 이내`,
      near(dx, cx) && near(dy, cy),
      `design=[${dx},${dy}] code=[${cx},${cy}] diff=[${(dx - cx).toFixed(2)},${(dy - cy).toFixed(2)}]`,
    )
  }
}

// ── 6. gate/paul/seaSign 단일 지점 ───────────────────────────────────────
section('6. gate/paul/seaSign')
function checkPoint(label, dPt, cPt) {
  if (!check(`${label} 양쪽 모두 존재함`, Array.isArray(dPt) && !!cPt)) return
  const [dx, dy] = dPt
  const cx = 'x' in cPt ? cPt.x : cPt[0]
  const cy = 'y' in cPt ? cPt.y : cPt[1]
  check(
    `${label} (x,y) 0.5 이내`,
    near(dx, cx) && near(dy, cy),
    `design=[${dx},${dy}] code=[${cx},${cy}] diff=[${(dx - cx).toFixed(2)},${(dy - cy).toFixed(2)}]`,
  )
}
checkPoint('gate <-> GARDEN_GATE', DESIGN.gate, GARDEN_GATE)
checkPoint('gate <-> PROTECTED.gate', DESIGN.gate, PROTECTED.gate)
checkPoint('paul <-> PROTECTED.paul', DESIGN.paul, PROTECTED.paul)
checkPoint('seaSign <-> PROTECTED.seaSign', DESIGN.seaSign, PROTECTED.seaSign)

// ── 요약 ──────────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (totalFailed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
