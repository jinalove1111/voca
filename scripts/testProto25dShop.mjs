// scripts/testProto25dShop.mjs — Paul Town 2.5D 캐릭터 프로토타입
// (Phase 2, 2026-09-26, 가게 경험 v1) shopInteraction.js(신규, 가게 입장/
// 상품 순수 기하 + 데이터 헬퍼) 순수 단위 테스트.
//
// React/DOM/네트워크 0. shopInteraction.js가 walkGrid.js(확장자 없는 상대
// import)를 참조하므로 plain `node`로 직접 import하면 ERR_MODULE_NOT_FOUND로
// 죽는다(scripts/testProto25dWalkGrid.mjs/testProto25dCamera.mjs와 동일
// 원인/동일 해법) — esbuild로 scripts/.tmp/에 번들해서 쓴다. shopInteraction.js
// 자신은 townAsset()(.webp 정적 자산)을 import하지 않으므로(그 파일 헤더
// 주석 참고 — sceneFixture.js와 동일한 "walkGrid.js 번들 그래프에 asset을
// 섞지 않는다" 설계) 이 번들에는 '.webp' 로더가 필요 없다. assetKey ->
// 실제 URL 해석(townAsset())만 별도로 src/assets/town/index.js를
// '.webp':'dataurl' 로더로 번들해서 검증한다(scripts/testProto25dSceneFixture.mjs
// 와 동일 패턴).
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const SHOP_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dShop.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/shopInteraction.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: SHOP_BUNDLE_PATH,
})
const {
  SHOP_ID, SHOP_COLLISION_RECT, SHOP_ENTRANCE_RAW, SHOP_ENTRANCE, getShopEntrance,
  SHOP_RADIUS, isNearShopEntrance, SHOP_PRODUCTS,
} = await import(`${pathToFileURL(SHOP_BUNDLE_PATH).href}?t=${Date.now()}`)

const GRID_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dWalkGridForShop.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/walkGrid.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: GRID_BUNDLE_PATH,
})
const { OBSTACLES, CELL_W_PCT, CELL_H_PCT, classifyPoint } = await import(`${pathToFileURL(GRID_BUNDLE_PATH).href}?t=${Date.now()}`)

const ASSETS_BUNDLE_PATH = path.join(TMP_DIR, 'townAssetsIndex.shop.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/assets/town/index.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: ASSETS_BUNDLE_PATH,
  loader: { '.webp': 'dataurl' },
})
const { townAsset } = await import(`${pathToFileURL(ASSETS_BUNDLE_PATH).href}?t=${Date.now()}`)

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

// ── 1. SHOP_PRODUCTS — 개수/필드/고유성 ─────────────────────────────────
section('1. SHOP_PRODUCTS — 정확히 3개, 필수 필드, id 고유')
{
  check('SHOP_PRODUCTS가 정확히 3개', Array.isArray(SHOP_PRODUCTS) && SHOP_PRODUCTS.length === 3, JSON.stringify(SHOP_PRODUCTS))
  const ids = SHOP_PRODUCTS.map((p) => p.id)
  check('모든 id가 서로 다름(중복 없음)', new Set(ids).size === ids.length, JSON.stringify(ids))
  let allFieldsOk = true
  const missing = []
  for (const p of SHOP_PRODUCTS) {
    const ok = typeof p.id === 'string' && p.id.length > 0 &&
      typeof p.nameEn === 'string' && p.nameEn.length > 0 &&
      typeof p.descEn === 'string' && p.descEn.length > 0 &&
      typeof p.pricePlaceholder === 'string' && p.pricePlaceholder.length > 0 &&
      typeof p.assetKey === 'string' && p.assetKey.length > 0
    if (!ok) { allFieldsOk = false; missing.push(p.id) }
  }
  check('모든 상품이 id/nameEn/descEn/pricePlaceholder/assetKey를 non-empty 문자열로 가짐', allFieldsOk, JSON.stringify(missing))
  check('SHOP_PRODUCTS(배열)가 frozen', Object.isFrozen(SHOP_PRODUCTS))
  check('SHOP_PRODUCTS 각 항목이 frozen', SHOP_PRODUCTS.every((p) => Object.isFrozen(p)))
}

// ── 2. descEn — 쉬운 8단어 이하 ──────────────────────────────────────────
section('2. SHOP_PRODUCTS — descEn이 8단어 이하')
{
  for (const p of SHOP_PRODUCTS) {
    const wordCount = p.descEn.trim().split(/\s+/).filter(Boolean).length
    check(`${p.id} — descEn("${p.descEn}") 단어 수(${wordCount})가 8 이하`, wordCount <= 8, String(wordCount))
  }
  for (const p of SHOP_PRODUCTS) {
    check(`${p.id} — pricePlaceholder("${p.pricePlaceholder}")가 "$"로 시작`, p.pricePlaceholder.startsWith('$'))
  }
}

// ── 3. assetKey — townAsset()으로 실제 해석되거나 placeholder 표시 ───────
section('3. SHOP_PRODUCTS — assetKey가 townAsset()에서 URL로 해석됨(또는 placeholder 플래그로 정직하게 표시)')
{
  for (const p of SHOP_PRODUCTS) {
    const url = townAsset(p.assetKey)
    const resolved = typeof url === 'string' && url.length > 0
    check(
      `${p.id}(assetKey=${p.assetKey}) — townAsset()이 non-empty URL을 반환하거나 placeholder:true로 정직하게 표시됨`,
      resolved || p.placeholder === true,
      `resolved=${resolved} placeholder=${p.placeholder}`,
    )
    // 이 세 assetKey는 실제로 TOWN_ASSETS에 이미 등록돼 있어(decorations/bench,
    // nature/flower-garden, decorations/street-lamp) 셋 다 실제 URL로
    // 해석돼야 한다(placeholder:true는 "이름/그림 불일치" 표시일 뿐 자산
    // 자체의 부재가 아니다 — shopInteraction.js 헤더 주석 참고).
    check(`${p.id} — 실제로 townAsset()이 non-empty URL을 반환함(플레이스홀더 이미지가 아니라 실제 등록된 자산)`, resolved, `url=${JSON.stringify(url)}`)
  }
}

// ── 4. SHOP_COLLISION_RECT — 기존 demo-building 좌표와 byte-identical(회귀 고정) ──
section('4. SHOP_COLLISION_RECT — sceneFixture.js demo-building 좌표와 정확히 일치(값 복제 없음)')
{
  check('SHOP_ID === "demo-building"', SHOP_ID === 'demo-building')
  const ref = { x0: 38, x1: 62, y0: 24, y1: 40 }
  check(
    'SHOP_COLLISION_RECT가 walkGrid.js OBSTACLES의 demo-building과 정확히 일치(byte-identical)',
    !!SHOP_COLLISION_RECT &&
      SHOP_COLLISION_RECT.x0 === ref.x0 && SHOP_COLLISION_RECT.x1 === ref.x1 &&
      SHOP_COLLISION_RECT.y0 === ref.y0 && SHOP_COLLISION_RECT.y1 === ref.y1,
    JSON.stringify(SHOP_COLLISION_RECT),
  )
  const domObstacle = OBSTACLES.find((ob) => ob.id === SHOP_ID)
  check(
    'SHOP_COLLISION_RECT가 walkGrid.js가 실제로 export하는 OBSTACLES 항목과 동일 객체 값(단일 진실 원천, 값 복제 아님)',
    !!domObstacle && JSON.stringify(domObstacle) === JSON.stringify(SHOP_COLLISION_RECT),
  )
}

// ── 5. SHOP_ENTRANCE_RAW/SHOP_ENTRANCE — 기하 계약 ───────────────────────
section('5. 입장 지점 — 콜리전 박스 중심 x, y1+gap, 걷기 가능 여백/장애물 밖')
{
  check(
    'SHOP_ENTRANCE_RAW.x === 콜리전 박스 중심 x((38+62)/2=50)',
    SHOP_ENTRANCE_RAW.x === (SHOP_COLLISION_RECT.x0 + SHOP_COLLISION_RECT.x1) / 2,
    String(SHOP_ENTRANCE_RAW.x),
  )
  const gap = SHOP_ENTRANCE_RAW.y - SHOP_COLLISION_RECT.y1
  check('SHOP_ENTRANCE_RAW.y가 콜리전 박스 y1(40)보다 큼(박스 바로 아래)', SHOP_ENTRANCE_RAW.y > SHOP_COLLISION_RECT.y1, String(SHOP_ENTRANCE_RAW.y))
  check(
    '입장 지점 gap(y - y1)이 walkGrid.js CELL_H_PCT보다 큼(항상 박스 바깥 걸을 수 있는 칸에 떨어지도록 하는 설계 조건)',
    gap > CELL_H_PCT,
    `gap=${gap} CELL_H_PCT=${CELL_H_PCT}`,
  )

  check('getShopEntrance()가 SHOP_ENTRANCE와 동일한 값을 반환', JSON.stringify(getShopEntrance()) === JSON.stringify(SHOP_ENTRANCE))
  check('SHOP_ENTRANCE가 frozen', Object.isFrozen(SHOP_ENTRANCE))

  check('입장 지점(보정 후)이 실제로 걷기 가능 칸으로 분류됨(classifyPoint === "walkable")', classifyPoint(SHOP_ENTRANCE.x, SHOP_ENTRANCE.y) === 'walkable', JSON.stringify(SHOP_ENTRANCE))
  check('입장 지점이 가게 콜리전 박스 y1보다 아래(y가 더 큼)', SHOP_ENTRANCE.y > SHOP_COLLISION_RECT.y1, String(SHOP_ENTRANCE.y))

  let insideAnyObstacle = false
  const offenders = []
  for (const ob of OBSTACLES) {
    if (SHOP_ENTRANCE.x >= ob.x0 && SHOP_ENTRANCE.x <= ob.x1 && SHOP_ENTRANCE.y >= ob.y0 && SHOP_ENTRANCE.y <= ob.y1) {
      insideAnyObstacle = true
      offenders.push(ob.id)
    }
  }
  check('입장 지점이 walkGrid.js OBSTACLES 어떤 장애물 rect 안에도 있지 않음', !insideAnyObstacle, JSON.stringify(offenders))
}

// ── 6. SHOP_RADIUS — CELL_W_PCT/CELL_H_PCT의 2배(리터럴 아님) ────────────
section('6. SHOP_RADIUS — walkGrid.js 셀 크기의 정확히 2배(파생값, 리터럴 복제 아님)')
{
  check('SHOP_RADIUS.x === 2 * CELL_W_PCT', SHOP_RADIUS.x === 2 * CELL_W_PCT, `${SHOP_RADIUS.x} vs ${2 * CELL_W_PCT}`)
  check('SHOP_RADIUS.y === 2 * CELL_H_PCT', SHOP_RADIUS.y === 2 * CELL_H_PCT, `${SHOP_RADIUS.y} vs ${2 * CELL_H_PCT}`)
  check('SHOP_RADIUS가 frozen', Object.isFrozen(SHOP_RADIUS))
}

// ── 7. isNearShopEntrance — 타원 멤버십(중심/경계/밖) ────────────────────
section('7. isNearShopEntrance — (dx/rx)²+(dy/ry)²<=1 타원 판정(중심/경계 포함/밖/NaN-safe)')
{
  const { x: ex, y: ey } = SHOP_ENTRANCE
  const { x: rx, y: ry } = SHOP_RADIUS

  // 경계(정확히 rx/ry)는 부동소수점 덧셈/뺄셈 왕복 오차(ey+ry에서 다시
  // ry를 빼면 원래 ry와 마지막 비트가 어긋날 수 있음 — camera.js의
  // stepCamera 스냅 여유와 동일한 부류의 문제)에 취약해, "경계에서 아주
  // 살짝 안쪽(1e-6)은 true, 아주 살짝 바깥쪽(1e-6)은 false"로 검증한다
  // (<=1 비교 연산자가 실제로 경계 포함임을 확인하되, 정확히 ==1인
  // 지점에서의 부동소수점 반올림 방향에는 의존하지 않음).
  const EPS = 1e-6
  check('입장 지점 정확히 그 자리(중심) — true', isNearShopEntrance(ex, ey) === true)
  check('중심에서 x축으로 rx보다 살짝 안쪽(dx=rx-1e-6,dy=0) — true(경계 포함 확인)', isNearShopEntrance(ex + rx - EPS, ey) === true)
  check('중심에서 y축으로 ry보다 살짝 안쪽(dx=0,dy=ry-1e-6) — true(경계 포함 확인)', isNearShopEntrance(ex, ey + ry - EPS) === true)
  check('중심에서 x축으로 rx보다 살짝 바깥쪽(dx=rx+1e-6,dy=0) — false', isNearShopEntrance(ex + rx + EPS, ey) === false)
  check('중심에서 y축으로 ry보다 살짝 바깥쪽(dx=0,dy=ry+1e-6) — false', isNearShopEntrance(ex, ey + ry + EPS) === false)
  check('경계를 확실히 넘어선 x(dx=rx*1.05,dy=0) — false', isNearShopEntrance(ex + rx * 1.05, ey) === false)
  check('경계를 확실히 넘어선 y(dx=0,dy=ry*1.05) — false', isNearShopEntrance(ex, ey + ry * 1.05) === false)
  check('한참 먼 지점(0,0) — false', isNearShopEntrance(0, 0) === false)
  check('반경 안쪽 한 지점(dx=rx*0.5,dy=ry*0.5) — true((0.5)²+(0.5)²=0.5<=1)', isNearShopEntrance(ex + rx * 0.5, ey + ry * 0.5) === true)

  check('charX=NaN — 예외 없이 false(안전 폴백)', isNearShopEntrance(NaN, ey) === false)
  check('charY=undefined — 예외 없이 false(안전 폴백)', isNearShopEntrance(ex, undefined) === false)
  check('둘 다 문자열("50","40") — 예외 없이 false(안전 폴백, Number.isFinite가 문자열을 거부)', isNearShopEntrance('50', '40') === false)

  check('결정론 — 같은 입력을 두 번 호출해도 같은 결과', isNearShopEntrance(ex + 1, ey + 1) === isNearShopEntrance(ex + 1, ey + 1))
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
