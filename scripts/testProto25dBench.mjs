// scripts/testProto25dBench.mjs — Paul Town 2.5D 캐릭터 프로토타입(Stage 4,
// 2026-09-23 + 모바일 시각 보정, 2026-09-23) benchInteraction.js(벤치
// walk-to-sit 순수 기하/타이밍 헬퍼) 순수 단위 테스트.
//
// React/DOM/네트워크 0. benchInteraction.js 자체는 아무 것도 import하지
// 않는(의존성 0) 순수 모듈이라 esbuild 번들 없이 plain `node`로 직접
// import한다(확장자 없는 상대 import 문제가 애초에 없음 — 이 저장소의
// scripts/verifyUnitPassage.mjs 등 "의존성 0 모듈을 직접 import"하는 기존
// 관례와 동일). walkGrid.js(demo-bench 실제 좌표, nearestWalkablePoint/
// classifyPoint로 "정말 걸을 수 있는 칸인지" 재검증용)는 worldContract.js를
// 확장자 없이 import하므로 scripts/testProto25dWalkGrid.mjs와 동일하게
// esbuild로 scripts/.tmp/에 번들해서 쓴다.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'
import {
  SIT_HOLD_MS,
  REDUCED_MOTION_SIT_HOLD_MS,
  BENCH_ARRIVAL_GAP_PCT,
  BENCH_TAP_PAD_PCT,
  BENCH_ASSET_MIN_WIDTH_PX,
  MIN_TAP_TARGET_PX,
  benchArrivalPoint,
  benchSeatPoint,
  benchRenderedSizePx,
  isBenchTap,
  benchTapPad,
  facingToward,
} from '../src/utils/town/proto2_5d/benchInteraction.js'

// 실측 뷰포트 3종(팀장 지시 — 360/390/412 + 데스크톱 비교군) — 아래
// "3. benchSeatPoint"/"6. benchTapPad" 섹션이 이 값들로 결정론적으로
// 재검증한다(2026-09-23 scripts/.tmp/measureGround.mjs 실측으로 "바닥
// 엘리먼트가 뷰포트를 정확히 채운다"를 먼저 확인한 값 — groundWidthPx/
// groundHeightPx = 뷰포트 width/height 그대로).
const VIEWPORTS = [
  { name: '1280x800(desktop)', groundWidthPx: 1280, groundHeightPx: 800 },
  { name: '412x915(mobile)', groundWidthPx: 412, groundHeightPx: 915 },
  { name: '390x844(mobile)', groundWidthPx: 390, groundHeightPx: 844 },
  { name: '360x800(mobile)', groundWidthPx: 360, groundHeightPx: 800 },
]
const BENCH_ASSET_ASPECT_REF = 48 / 72 // benchInteraction.js BENCH_ASSET_ASPECT 값 복제(72x48 원본 실측)

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const GRID_BUNDLE_PATH = path.join(TMP_DIR, 'proto25dWalkGridForBench.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/walkGrid.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: GRID_BUNDLE_PATH,
})
const { OBSTACLES, nearestWalkablePoint, classifyPoint } = await import(`${pathToFileURL(GRID_BUNDLE_PATH).href}?t=${Date.now()}`)

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

const BENCH = OBSTACLES.find((ob) => ob.id === 'demo-bench')
check('사전조건 — walkGrid.js에 demo-bench가 존재', !!BENCH, JSON.stringify(OBSTACLES))

// ── 1. 상수 — 기존 값 재사용(새 타이밍 발명 아님) ────────────────────────
section('1. 상수 — TownScene.jsx CHARACTER_SIT_HOLD_MS 재사용 회귀 고정')

check('SIT_HOLD_MS === 2500(TownScene.jsx CHARACTER_SIT_HOLD_MS와 동일)', SIT_HOLD_MS === 2500)
{
  // 소스 파일을 직접 읽어 TownScene.jsx의 실제 상수 정의와 대조한다(import
  // 아님 — 격리 유지, 이 저장소의 다른 "소스 텍스트 대조" 관례와 동일,
  // 예: townProto25d.spec.mjs S1의 features.js 정규식 대조).
  const fs = await import('node:fs')
  const src = fs.readFileSync(path.join(ROOT, 'src/components/town/v2/TownScene.jsx'), 'utf8')
  const m = src.match(/CHARACTER_SIT_HOLD_MS\s*=\s*(\d+)/)
  check(
    'TownScene.jsx CHARACTER_SIT_HOLD_MS 소스 값이 SIT_HOLD_MS와 정확히 일치(새 타이밍 발명 아님)',
    !!m && Number(m[1]) === SIT_HOLD_MS,
    m ? m[0] : '매칭 없음',
  )
}
check('REDUCED_MOTION_SIT_HOLD_MS >= 400(운영자 지시 — reduced-motion에서도 착석 상태가 관측 가능해야 함)', REDUCED_MOTION_SIT_HOLD_MS >= 400)
check('REDUCED_MOTION_SIT_HOLD_MS < SIT_HOLD_MS(reduced-motion이 실제로 더 짧음)', REDUCED_MOTION_SIT_HOLD_MS < SIT_HOLD_MS)

// ── 2. benchArrivalPoint — 벤치 앞(더 큰 y) 도착 지점 ────────────────────
section('2. benchArrivalPoint — 도착 지점 기하')

if (BENCH) {
  const arrival = benchArrivalPoint(BENCH)
  check('도착 지점 x === 벤치 중심 x', arrival.x === (BENCH.x0 + BENCH.x1) / 2, JSON.stringify(arrival))
  check('도착 지점 y === 벤치 y1 + BENCH_ARRIVAL_GAP_PCT', arrival.y === BENCH.y1 + BENCH_ARRIVAL_GAP_PCT, JSON.stringify(arrival))
  check('도착 지점이 벤치보다 앞(y가 더 큼, 화면상 벤치 "앞")', arrival.y > BENCH.y1)

  // 항목(unit spec) — 도착 지점은 이미 걸을 수 있는 칸에 떨어져야 한다
  // (nearestWalkablePoint가 보정할 필요가 없어야 이상적 — 이 값 자체로
  // classifyPoint가 'walkable'을 반환하는지 실제 walkGrid.js 데이터로
  // 재확인).
  check(
    '도착 지점이 실제 walkGrid.js 격자에서 걸을 수 있는 칸(장애물 3개 전부와 안 겹침)',
    classifyPoint(arrival.x, arrival.y, OBSTACLES) === 'walkable',
    JSON.stringify(arrival),
  )
  const corrected = nearestWalkablePoint(arrival.x, arrival.y, OBSTACLES)
  check(
    'nearestWalkablePoint로 보정해도 좌표가 그대로(이미 걸을 수 있어 보정 불필요 — "정상 목적지는 그대로 보존" 원칙과 일치)',
    corrected.x === arrival.x && corrected.y === arrival.y,
    JSON.stringify({ arrival, corrected }),
  )

  // 결정론 — 같은 rect로 여러 번 호출해도 완전히 같은 값.
  const arrival2 = benchArrivalPoint(BENCH)
  check('benchArrivalPoint(BENCH) 반복 호출이 완전히 동일(결정론)', arrival.x === arrival2.x && arrival.y === arrival2.y)
}

// ── 3. benchSeatPoint — 벤치 박스 안(좌석면) 착석 지점, 뷰포트별 실측 기하 ──
// (모바일 시각 보정, 2026-09-23) — 고정 오프셋(BENCH_SIT_OFFSET_PCT) 대신
// 벤치의 실제 렌더 기하(benchRenderedSizePx, 폭 하한 반영)에서 유도한다.
// 이 파일 헤더 주석 참고 — world x-%/y-%의 물리 px 비율이 뷰포트마다
// 다르므로(고정 종횡비 가정 없음), 여러 뷰포트에서 모두 "벤치 박스 안 +
// 지정된 비율" 계약을 재확인한다.
section('3. benchSeatPoint — 착석 지점 기하(뷰포트별 실측 기하)')

if (BENCH) {
  for (const vp of VIEWPORTS) {
    const seat = benchSeatPoint(BENCH, vp.groundWidthPx, vp.groundHeightPx)
    const { heightPx: renderedHeightPx } = benchRenderedSizePx(BENCH, vp.groundWidthPx)
    const expectedRenderedHeightY = (renderedHeightPx / vp.groundHeightPx) * 100
    const expectedSeatY = BENCH.y1 - expectedRenderedHeightY * 0.55 // benchInteraction.js SEAT_FRACTION(0.55) 값 복제

    check(`[${vp.name}] 착석 지점 x === 벤치 중심 x`, seat.x === (BENCH.x0 + BENCH.x1) / 2, JSON.stringify(seat))
    check(
      `[${vp.name}] 착석 지점 y가 예상 공식(y1 - renderedHeightY*0.55)과 정확히 일치(오차<1e-9)`,
      Math.abs(seat.y - expectedSeatY) < 1e-9,
      `seat=${JSON.stringify(seat)} expected=${expectedSeatY}`,
    )
    check(
      `[${vp.name}] 착석 지점이 벤치 박스 세로 범위(y0~y1) 안`,
      seat.y >= BENCH.y0 && seat.y <= BENCH.y1,
      JSON.stringify({ seat, BENCH }),
    )
    check(`[${vp.name}] 착석 지점이 벤치 y1(바닥 접점)보다 작음(박스 안쪽, 지면보다 위)`, seat.y < BENCH.y1)

    const seat2 = benchSeatPoint(BENCH, vp.groundWidthPx, vp.groundHeightPx)
    check(`[${vp.name}] benchSeatPoint 반복 호출이 완전히 동일(결정론)`, seat.x === seat2.x && seat.y === seat2.y)
  }

  // groundWidthPx/groundHeightPx가 없는(0/undefined) 방어적 호출 —
  // renderedHeightY=0으로 폴백해 y1 그대로를 반환(크래시 없음, 여전히
  // 벤치 박스 안 — 위 함수 JSDoc 참고).
  const seatNoViewport = benchSeatPoint(BENCH)
  check(
    'groundWidthPx/groundHeightPx 없이 호출해도 크래시 없이 y1로 안전 폴백',
    seatNoViewport.y === BENCH.y1 && seatNoViewport.x === (BENCH.x0 + BENCH.x1) / 2,
    JSON.stringify(seatNoViewport),
  )
}

// ── 3b. benchRenderedSizePx — 벤치 렌더 px 크기(폭 하한 반영) ────────────
section('3b. benchRenderedSizePx — 벤치 렌더 px 크기(폭 하한 반영)')

if (BENCH) {
  // 데스크톱(1280) — nominal 7%*1280=89.6px > 44px 하한이라 하한이 트리거
  // 되지 않아야 한다.
  const wide = benchRenderedSizePx(BENCH, 1280)
  check('1280px 폭에서는 nominal 크기 그대로(하한 미적용)', Math.abs(wide.widthPx - 89.6) < 1e-9, JSON.stringify(wide))
  check(
    '1280px 폭에서 렌더 높이가 폭*에셋종횡비와 일치',
    Math.abs(wide.heightPx - wide.widthPx * BENCH_ASSET_ASPECT_REF) < 1e-9,
    JSON.stringify(wide),
  )

  // 모바일(360) — nominal 7%*360=25.2px < 44px 하한이라 하한이 트리거된다.
  const narrow = benchRenderedSizePx(BENCH, 360)
  check(`360px 폭에서는 폭 하한(${BENCH_ASSET_MIN_WIDTH_PX}px)이 적용됨`, narrow.widthPx === BENCH_ASSET_MIN_WIDTH_PX, JSON.stringify(narrow))
  check(
    '360px 폭에서 렌더 높이가 하한 폭*에셋종횡비와 일치',
    Math.abs(narrow.heightPx - BENCH_ASSET_MIN_WIDTH_PX * BENCH_ASSET_ASPECT_REF) < 1e-9,
    JSON.stringify(narrow),
  )
}

// ── 4. isBenchTap — 사각형 hit-test(안/밖/패딩) ──────────────────────────
section('4. isBenchTap — 벤치 탭 판정')

if (BENCH) {
  const centre = { x: (BENCH.x0 + BENCH.x1) / 2, y: (BENCH.y0 + BENCH.y1) / 2 }
  check('벤치 중심은 항상 탭으로 판정', isBenchTap(centre, BENCH))
  check('벤치 박스 경계(x0,y0) 자기 자신도 탭으로 판정(경계 포함)', isBenchTap({ x: BENCH.x0, y: BENCH.y0 }, BENCH))
  check('벤치 박스 경계(x1,y1) 자기 자신도 탭으로 판정(경계 포함)', isBenchTap({ x: BENCH.x1, y: BENCH.y1 }, BENCH))

  const farOutside = { x: BENCH.x0 - BENCH_TAP_PAD_PCT - 5, y: centre.y }
  check('패딩 + 5를 넘어서 멀리 벗어난 지점은 탭 아님', !isBenchTap(farOutside, BENCH), JSON.stringify(farOutside))

  const justInsidePad = { x: BENCH.x0 - BENCH_TAP_PAD_PCT + 0.01, y: centre.y }
  check('패딩 범위 안(경계 바로 안쪽)은 탭으로 판정(손가락 친화적 여유)', isBenchTap(justInsidePad, BENCH), JSON.stringify(justInsidePad))

  const justOutsidePad = { x: BENCH.x0 - BENCH_TAP_PAD_PCT - 0.01, y: centre.y }
  check('패딩 범위 바로 밖은 탭 아님(패딩 경계가 정확함)', !isBenchTap(justOutsidePad, BENCH), JSON.stringify(justOutsidePad))

  check('pad=0으로 호출하면 패딩 없이 순수 박스만 판정', !isBenchTap({ x: BENCH.x0 - 0.5, y: centre.y }, BENCH, 0))
  check('pad=0, 박스 안쪽 경계는 여전히 탭', isBenchTap({ x: BENCH.x0, y: centre.y }, BENCH, 0))

  check('null point는 false(크래시 없음)', isBenchTap(null, BENCH) === false)
  check('null rect는 false(크래시 없음)', isBenchTap(centre, null) === false)

  check('동일 입력 반복 호출이 완전히 동일(결정론)', isBenchTap(centre, BENCH) === isBenchTap(centre, BENCH))

  // (모바일 시각 보정, 2026-09-23) — pad를 {padX,padY} 객체로 넘기면 x/y축을
  // 독립적으로 판정한다(benchTapPad가 축별로 다른 값을 계산해 주므로 필요).
  const asymPad = { padX: 5, padY: 0.5 }
  check(
    '{padX,padY} 객체 pad — x축 여백(5) 안이지만 y축 여백(0.5) 밖이면 탭 아님',
    !isBenchTap({ x: BENCH.x0 - 4, y: BENCH.y0 - 1 }, BENCH, asymPad),
  )
  check(
    '{padX,padY} 객체 pad — x축 여백(5) 안, y축은 박스 안이면 탭',
    isBenchTap({ x: BENCH.x0 - 4, y: centre.y }, BENCH, asymPad),
  )
  check(
    '{padX,padY} 객체 pad — y축 여백(0.5) 안이면 탭',
    isBenchTap({ x: centre.x, y: BENCH.y0 - 0.3 }, BENCH, asymPad),
  )
}

// ── 4b. benchTapPad — 동적 탭 패딩(항상 유효 탭 타겟 >=44x44px) ──────────
section('4b. benchTapPad — 동적 탭 패딩(모바일 시각 보정, 2026-09-23)')

if (BENCH) {
  for (const vp of VIEWPORTS) {
    const pad = benchTapPad(BENCH, { groundWidthPx: vp.groundWidthPx, groundHeightPx: vp.groundHeightPx })
    const effectiveWidthPx = ((BENCH.x1 - BENCH.x0) + 2 * pad.padX) / 100 * vp.groundWidthPx
    const effectiveHeightPx = ((BENCH.y1 - BENCH.y0) + 2 * pad.padY) / 100 * vp.groundHeightPx
    check(
      `[${vp.name}] 유효 탭 타겟 폭이 ${MIN_TAP_TARGET_PX}px 이상(오차 허용 0.01px)`,
      effectiveWidthPx >= MIN_TAP_TARGET_PX - 0.01,
      `pad=${JSON.stringify(pad)} effectiveWidthPx=${effectiveWidthPx}`,
    )
    check(
      `[${vp.name}] 유효 탭 타겟 높이가 ${MIN_TAP_TARGET_PX}px 이상(오차 허용 0.01px)`,
      effectiveHeightPx >= MIN_TAP_TARGET_PX - 0.01,
      `pad=${JSON.stringify(pad)} effectiveHeightPx=${effectiveHeightPx}`,
    )
    check(`[${vp.name}] padX가 기본 BENCH_TAP_PAD_PCT(${BENCH_TAP_PAD_PCT}) 이상`, pad.padX >= BENCH_TAP_PAD_PCT)
    check(`[${vp.name}] padY가 기본 BENCH_TAP_PAD_PCT(${BENCH_TAP_PAD_PCT}) 이상`, pad.padY >= BENCH_TAP_PAD_PCT)
  }

  // groundWidthPx/groundHeightPx 없이 호출해도 크래시 없이 기본 패딩으로 폴백.
  const padNoViewport = benchTapPad(BENCH, {})
  check(
    '뷰포트 없이 호출해도 크래시 없이 기본 BENCH_TAP_PAD_PCT로 폴백',
    padNoViewport.padX === BENCH_TAP_PAD_PCT && padNoViewport.padY === BENCH_TAP_PAD_PCT,
    JSON.stringify(padNoViewport),
  )

  // 결정론.
  const padA = benchTapPad(BENCH, { groundWidthPx: 360, groundHeightPx: 800 })
  const padB = benchTapPad(BENCH, { groundWidthPx: 360, groundHeightPx: 800 })
  check('benchTapPad 반복 호출이 완전히 동일(결정론)', padA.padX === padB.padX && padA.padY === padB.padY)
}

// ── 5. facingToward — 좌우 방향 파생 ─────────────────────────────────────
section('5. facingToward — 이동 방향 -> 미러링 부호')

check('오른쪽으로 이동(dx>0) -> 1(기본 방향, 미러링 없음)', facingToward({ x: 10, y: 50 }, { x: 20, y: 50 }) === 1)
check('왼쪽으로 이동(dx<0) -> -1(미러링)', facingToward({ x: 20, y: 50 }, { x: 10, y: 50 }) === -1)
check('정확히 수직 이동(dx===0) -> 0(방향 미정의, 호출부가 기존 facing 유지)', facingToward({ x: 15, y: 30 }, { x: 15, y: 80 }) === 0)
check('from===to(완전히 같은 점) -> 0', facingToward({ x: 15, y: 30 }, { x: 15, y: 30 }) === 0)
check('null from -> 0(크래시 없음)', facingToward(null, { x: 10, y: 10 }) === 0)
check('null to -> 0(크래시 없음)', facingToward({ x: 10, y: 10 }, null) === 0)

// Stage 4 실사용 시나리오 — 캐릭터가 벤치 왼쪽에서 출발해 도착 지점(벤치
// 중심 x와 같음)으로 걸어가면 오른쪽을 보고(dx>0 -> 1), 오른쪽에서
// 출발하면 왼쪽을 본다(dx<0 -> -1) — startWalkToBench가 실제로 쓰는
// from(현재 위치)/to(도착 지점) 조합을 그대로 재현.
if (BENCH) {
  const arrival = benchArrivalPoint(BENCH)
  const fromLeft = { x: arrival.x - 20, y: arrival.y }
  const fromRight = { x: arrival.x + 20, y: arrival.y }
  check('벤치 왼쪽에서 접근하면 오른쪽을 봄(facing=1)', facingToward(fromLeft, arrival) === 1)
  check('벤치 오른쪽에서 접근하면 왼쪽을 봄(facing=-1)', facingToward(fromRight, arrival) === -1)
  check('벤치 정확히 아래(같은 x)에서 접근하면 방향 미정의(facing=0, 기존 방향 유지)', facingToward({ x: arrival.x, y: arrival.y + 20 }, arrival) === 0)
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
