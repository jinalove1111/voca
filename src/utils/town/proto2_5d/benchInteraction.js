// src/utils/town/proto2_5d/benchInteraction.js — Paul Town 2.5D 캐릭터
// 프로토타입(Stage 4, 2026-09-23 + 모바일 시각 보정, 2026-09-23) 벤치
// walk-to-sit 순수 기하/타이밍 헬퍼.
//
// 순수 함수/상수만 — React/DOM 의존 없음, Math.random/Date.now 없음(전부
// 결정론). walkGrid.js/pathfinding.js/depthOrder.js는 이 파일에서 바꾸지
// 않는다(팀장 지시) — 이 파일은 그 위에 얹히는 "벤치 전용" 계산만 소유한다
// (소유권 분리). 기존 src/components/town/v2/TownScene.jsx(벤치 앉기
// 파일럿)의 상태 머신 *패턴*(seq 가드 타이머 체인, 반복 탭 무시 정책)만
// 재사용하고 그 파일을 import/수정하지 않는다(ASTRA_HANDOFF_2026-09-21.md
// §12/§19 격리 원칙).
//
// rect 매개변수는 walkGrid.js OBSTACLES 항목과 동일한 모양
// { x0, x1, y0, y1 }(world-% 좌표, x0<x1, y0<y1) — 이 프로토타입엔 벤치가
// 하나뿐이지만(walkGrid.js OBSTACLES의 'demo-bench'), 함수 자체는 특정
// 벤치 인스턴스에 종속되지 않게 rect를 받는 순수 형태로 짠다.
//
// 벤치 렌더 기하(아래 benchRenderedSizePx/benchSeatPoint/benchTapPad)는
// world-x%/world-y% 사이에 고정 비율(예: worldContract.js WORLD.w:WORLD.h
// =100:190)이 있다고 가정하지 않는다 — 실측 결과 바닥(proto25d-ground)
// 엘리먼트는 실제로 뷰포트를 정확히 꽉 채운다(fixed inset-0 컨테이너의
// 유일한 flex-1 자식이라, width는 stretch로 컨테이너 폭 100%, height는
// flex-grow로 남은 세로 공간 전부를 차지 — style의 aspectRatio는 두 축이
// 이미 이렇게 확정돼 있어 실제로는 적용되지 않는다). 즉 x-%/y-% 물리 px
// 비율은 뷰포트마다 다르다(1280x800 데스크톱에서 실측 1.6, 412x915
// 모바일에서 실측 0.45 — 이 파일의 "1 x-%=1.9 y-%" 같은 고정 가정은 틀린
// 전제였다, 2026-09-23 measureGround 스크립트로 재확인). 그래서 이 함수들은
// 항상 호출 시점의 실제 groundWidthPx/groundHeightPx를 받아 그 비율로
// 계산한다(고정 상수로 근사하지 않음).

// TownScene.jsx CHARACTER_SIT_HOLD_MS(2500ms)와 동일 값 — 새 타이밍을
// 발명하지 않는다(두 벤치 상호작용이 서로 다른 "앉아있는 느낌"을 주지
// 않도록).
export const SIT_HOLD_MS = 2500

// reduced-motion에서도 "앉아있는 상태"가 실제로 관측 가능해야 한다는 요구
// (운영자 지시 — 걷기 transition만 스킵하고 phase 자체는 건너뛰지 않는다,
// Stage 3의 "depth/scale은 reduced-motion에서도 생략 안 함" 원칙과 동일
// 정신). 400ms는 "순간적으로 느껴지지 않을 최소값"으로 문서화한 값 —
// 공식 스펙이 요구하는 최소치(≥400ms)를 그대로 상수화했다.
export const REDUCED_MOTION_SIT_HOLD_MS = 400

// 벤치 도착 지점(캐릭터가 앉기 전 멈춰 서는 곳) — 벤치 바닥 접점(y1)
// 바로 아래(화면상 "앞")로 이 gap만큼 띄운다. walkGrid.js 격자 셀 높이
// (CELL_H_PCT≈1.26)보다 커서(2) 항상 벤치 박스 바깥 걸을 수 있는 칸에
// 떨어진다(데모 장애물 3개 중 어느 것과도 안 겹침 — 유닛 테스트가 실제
// OBSTACLES로 재확인).
export const BENCH_ARRIVAL_GAP_PCT = 2

// 벤치 아트 원본 픽셀 크기(src/assets/town/decorations/bench.webp, 72x48 —
// `file`/`Image` 실측으로 확인). 벤치는 width만 world-%로 지정하고 height는
// 이미지 자체 종횡비에 맡기므로(Proto25DScreen.jsx — aspect-ratio 강제 없음),
// "실제로 렌더되는 벤치 높이"는 이 종횡비에서 역산해야 한다. 런타임에
// img.naturalWidth/naturalHeight를 읽는 대신 상수로 고정한 이유 — 이 파일은
// DOM 의존이 전혀 없는 순수 함수 모듈(위 헤더 주석)이고, 이 값은 정적 에셋
// 파일 자체라 결정론적 유닛 테스트로 고정할 수 있어야 하기 때문(팀장 지시 —
// "문서화된 상수도 허용, 테스트에 결정론적이어야 함").
const BENCH_ASSET_NATURAL_WIDTH = 72
const BENCH_ASSET_NATURAL_HEIGHT = 48
const BENCH_ASSET_ASPECT = BENCH_ASSET_NATURAL_HEIGHT / BENCH_ASSET_NATURAL_WIDTH // 48/72 ≈ 0.6667

// 벤치 아트 렌더 폭 px 하한 — Proto25DScreen.jsx가 <img> width에 거는 CSS
// max(nominal%, 44px)와 정확히 같은 값(단일 진실 원천, 그 파일이 이 상수를
// import해서 쓴다). 좁은 뷰포트(360~412px)에서 nominal 7%는 25~29px밖에
// 안 돼 글리프/아트가 읽기 어려운 회귀가 있었다(팀장 지시 항목4).
export const BENCH_ASSET_MIN_WIDTH_PX = 44

// 좌석면 비율(0=벤치 렌더 이미지 맨 아래, 1=맨 위) — bench.webp를 실측하면
// 하단 대부분이 다리+좌석판 두께이고 그 위 나머지가 등받이인 낮은 벤치
// 실루엣이라, "앉는 판" 자체는 이미지 하단에서 위로 대략 55% 지점에 있다.
// 이전 버전(고정 BENCH_SIT_OFFSET_PCT=2 world-%)은 이 이미지의 실제 렌더
// 높이가 아니라 walkGrid.js 장애물 박스 높이(y0~y1=5)를 기준으로 오프셋을
// 잡아, 렌더 높이(뷰포트에 따라 다르지만 데스크톱 1280x800 실측 ≈7.5
// world-y%)보다 오프셋이 더 작아 좌석이 이미지 상단(등받이 부근)에
// 가깝게 찍혀 "붕 뜬" 것처럼 보였다(2026-09-23 모바일 실기기 프리뷰에서
// 실측 확인된 회귀).
const SEAT_FRACTION = 0.55

/**
 * 벤치가 실제로 렌더되는 px 크기(폭 하한 적용 후) — "화면에 그려지는
 * 그대로"를 반영해야 하는 계산(좌석 지점)에 쓴다. groundWidthPx/
 * groundHeightPx는 바닥(proto25d-ground) 엘리먼트의 현재 렌더 크기(px,
 * getBoundingClientRect) — 이 파일은 고정 world 종횡비를 가정하지 않으므로
 * (위 헤더 주석 참고) 매 호출마다 실제 값을 받아야 한다.
 * @param {{x0:number,x1:number}} rect
 * @param {number} groundWidthPx
 * @returns {{widthPx:number,heightPx:number}}
 */
export function benchRenderedSizePx(rect, groundWidthPx) {
  const nominalWidthPx = (groundWidthPx || 0) * (rect.x1 - rect.x0) / 100
  const widthPx = Math.max(nominalWidthPx, BENCH_ASSET_MIN_WIDTH_PX)
  return { widthPx, heightPx: widthPx * BENCH_ASSET_ASPECT }
}

/**
 * 벤치가 실제로 렌더되는 세로 높이(world-y%, 폭 하한 적용 후) —
 * benchRenderedSizePx의 heightPx를 groundHeightPx 기준 %로 환산한다.
 * @param {{x0:number,x1:number}} rect
 * @param {number} groundWidthPx
 * @param {number} groundHeightPx
 * @returns {number}
 */
export function benchRenderedHeightYPct(rect, groundWidthPx, groundHeightPx) {
  if (!(groundHeightPx > 0)) return 0
  const { heightPx } = benchRenderedSizePx(rect, groundWidthPx)
  return (heightPx / groundHeightPx) * 100
}

// 벤치 탭 판정 기본 확장 여백(world-%) — 손가락 친화적 여유. 390px 뷰포트
// 기준 2 world-% ≈ 7.8px(390*2/100) — walkGrid.js 격자 셀 1개 폭(2.4)보다
// 작아 인접 칸을 오탐하지 않으면서도 정확한 픽셀 경계보다는 약간 넉넉하게
// 잡은 값. 실제 유효 탭 여백은 이 값과 44px 최소 타겟 요구사항 중 더 큰
// 쪽을 쓴다(아래 benchTapPad 참고).
export const BENCH_TAP_PAD_PCT = 2

// 손가락 탭 타겟 최소 크기(CSS px) — WCAG 2.5.5/iOS HIG가 공통으로 권장하는
// 44x44px 하한.
export const MIN_TAP_TARGET_PX = 44

/**
 * 벤치 도착 지점(raw, 아직 nearestWalkablePoint 보정 전) — 벤치 중심 x,
 * 바닥 접점(y1) 바로 아래(앞) BENCH_ARRIVAL_GAP_PCT만큼 띄운 지점.
 * 호출부(Proto25DScreen.jsx)가 이 반환값을 walkGrid.js의
 * nearestWalkablePoint로 다시 보정해 실제 이동 목표로 쓴다(이 함수 자체는
 * walkGrid.js를 import하지 않는다 — 순수 기하 계산만 소유).
 * @param {{x0:number,x1:number,y0:number,y1:number}} rect
 * @returns {{x:number,y:number}}
 */
export function benchArrivalPoint(rect) {
  return { x: (rect.x0 + rect.x1) / 2, y: rect.y1 + BENCH_ARRIVAL_GAP_PCT }
}

/**
 * 착석 지점 — 벤치 중심 x, 벤치의 실제 렌더 기하(benchRenderedHeightYPct +
 * SEAT_FRACTION)에서 유도한 "좌석면" y. 걷기 목적지가 아니므로
 * nearestWalkablePoint 보정을 거치지 않는다(벤치 박스 안은 원래 걸을 수
 * 없는 칸이지만, 앉은 상태는 "걷기"가 아니라 캐릭터를 벤치 위에 얹는 별도
 * 연출이라 이 좌표를 그대로 쓴다). groundWidthPx/groundHeightPx가 없으면
 * (예: 호출부가 아직 바닥 엘리먼트를 측정하지 못한 극히 예외적인 경우)
 * renderedHeightY=0으로 안전 폴백해 y1(벤치 바닥 접점) 그대로를 반환한다
 * (크래시 없음 — 이전 고정 오프셋 버전보다는 부정확하지만 여전히 벤치
 * 박스 안).
 * @param {{x0:number,x1:number,y0:number,y1:number}} rect
 * @param {number} groundWidthPx
 * @param {number} groundHeightPx
 * @returns {{x:number,y:number}}
 */
export function benchSeatPoint(rect, groundWidthPx, groundHeightPx) {
  const renderedHeightY = benchRenderedHeightYPct(rect, groundWidthPx, groundHeightPx)
  return { x: (rect.x0 + rect.x1) / 2, y: rect.y1 - renderedHeightY * SEAT_FRACTION }
}

/**
 * world-% 탭 지점이 벤치 박스(+padding) 안인지 — 순수 사각형 hit-test.
 * Proto25DScreen.jsx의 유일한 포인터 경로(바닥 레이어 onPointerDown/
 * onPointerUp)가 "탭 지점이 벤치 안인가"를 판정하는 데만 쓴다(벤치 이미지
 * 엘리먼트 자체는 pointer-events:none이라 별도 onClick 경로가 없다 —
 * 새 이벤트 경로를 만들지 않는다는 요구사항).
 * pad는 숫자(x/y 공용, 기존 계약 그대로)이거나 {padX,padY}(x/y 축별 여백,
 * benchTapPad가 world-x%/world-y%의 서로 다른 px 비율을 반영해 축마다 다른
 * 값을 계산해 주므로 필요) 둘 다 받는다.
 * @param {{x:number,y:number}} point
 * @param {{x0:number,x1:number,y0:number,y1:number}} rect
 * @param {number|{padX:number,padY:number}} [pad]
 * @returns {boolean}
 */
export function isBenchTap(point, rect, pad = BENCH_TAP_PAD_PCT) {
  if (!point || !rect) return false
  const { padX, padY } = typeof pad === 'number' ? { padX: pad, padY: pad } : pad
  return point.x >= rect.x0 - padX && point.x <= rect.x1 + padX &&
    point.y >= rect.y0 - padY && point.y <= rect.y1 + padY
}

/**
 * 벤치 유효 탭 패딩(world-%, {padX,padY}) — hit-test 자체는 항상
 * walkGrid.js OBSTACLES의 원본 rect(x0~x1, y0~y1, nominal 7x5 world-%)를
 * 기준으로 한다(요구사항 — 새 이벤트 경로/히트박스 정의를 만들지 않는다,
 * walkGrid.js 무변경). 이 원본 rect를 현재 뷰포트 px로 환산한 크기가
 * MIN_TAP_TARGET_PX(44)보다 작으면, 부족분의 절반만큼 패딩을 늘려 유효
 * 탭 타겟이 항상 최소 44x44 CSS px가 되도록 한다(팀장 지시 항목4) — 벤치
 * 아트 자체의 시각적 px 하한(BENCH_ASSET_MIN_WIDTH_PX, benchRenderedSizePx)
 * 과는 별개 계산이다(아트가 시각적으로 커 보여도 히트박스 원본은 항상
 * nominal rect이므로, 탭 판정 패딩은 그 원본 rect 기준으로 독립적으로
 * 보장해야 한다). x축/y축을 따로 계산하는 이유 — world-x%와 world-y%가
 * 서로 다른 px 비율을 가질 수 있어(위 헤더 주석 참고, 뷰포트마다 다름)
 * 동일한 % 여백이 축마다 다른 실제 px 여백으로 렌더된다. 항상
 * BENCH_TAP_PAD_PCT(기존 손가락 친화적 최소 여백) 이상을 보장한다 — 이미
 * 그보다 큰 화면(데스크톱 등)에서 여백이 줄어드는 회귀를 막는다.
 * @param {{x0:number,x1:number,y0:number,y1:number}} rect
 * @param {{groundWidthPx:number,groundHeightPx:number,minTargetPx?:number}} viewport
 * @returns {{padX:number,padY:number}}
 */
export function benchTapPad(rect, { groundWidthPx, groundHeightPx, minTargetPx = MIN_TAP_TARGET_PX } = {}) {
  const nominalWidthPct = rect.x1 - rect.x0
  const nominalHeightPct = rect.y1 - rect.y0
  const nominalWidthPx = (groundWidthPx || 0) * (nominalWidthPct / 100)
  const nominalHeightPx = (groundHeightPx || 0) * (nominalHeightPct / 100)
  const neededPadXPx = Math.max(0, (minTargetPx - nominalWidthPx) / 2)
  const neededPadYPx = Math.max(0, (minTargetPx - nominalHeightPx) / 2)
  const neededPadXPct = groundWidthPx > 0 ? (neededPadXPx / groundWidthPx) * 100 : 0
  const neededPadYPct = groundHeightPx > 0 ? (neededPadYPx / groundHeightPx) * 100 : 0
  return {
    padX: Math.max(BENCH_TAP_PAD_PCT, neededPadXPct),
    padY: Math.max(BENCH_TAP_PAD_PCT, neededPadYPct),
  }
}

/**
 * from -> to 이동 방향에서 좌우 미러링 부호를 파생한다 — -1(왼쪽 보기,
 * scaleX(-1) 적용) | 1(오른쪽 보기, 기본 방향, 미적용) | 0(정확히 수직
 * 이동이라 좌우 방향이 정의되지 않음 — 호출부는 이 경우 기존 facing을
 * 그대로 유지해야 한다, "벤치가 정확히 위에 있으면 현재 방향 유지" 요구
 * 그대로).
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @returns {-1|0|1}
 */
export function facingToward(from, to) {
  if (!from || !to) return 0
  const dx = to.x - from.x
  if (dx === 0) return 0
  return dx < 0 ? -1 : 1
}
