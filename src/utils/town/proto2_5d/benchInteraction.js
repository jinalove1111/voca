// src/utils/town/proto2_5d/benchInteraction.js — Paul Town 2.5D 캐릭터
// 프로토타입(Stage 4, 2026-09-23) 벤치 walk-to-sit 순수 기하/타이밍 헬퍼.
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

// 착석 지점 — 벤치 바닥 접점(y1)보다 이만큼 위(화면상 벤치 박스 안쪽,
// "좌석면"에 해당하는 위치)로 캐릭터의 논리 발 앵커를 옮긴다. 벤치 박스
// 세로 폭(walkGrid.js demo-bench 기준 y0~y1=5)보다 작게 잡아(2) 좌석이
// 항상 벤치 박스 안에 들어오게 한다. 이 좌표에서의 z-index는 그대로
// characterZIndex(seat.y)를 쓰지 않는다 — Proto25DScreen.jsx가 'sitting'
// 단계에서만 별도로 depthY(=벤치 y1)를 ProtoCharacter에 넘겨 z-index를
// 계산한다(캐릭터가 벤치보다 항상 앞에 렌더돼야 하는데, seat.y가 벤치
// y1보다 작아 topPct 그대로 쓰면 오히려 뒤로 밀려나기 때문 — 자세한 이유는
// Proto25DScreen.jsx의 depthY 계산 부분 주석 참고).
export const BENCH_SIT_OFFSET_PCT = 2

// 벤치 탭 판정 확장 여백(world-%) — 손가락 친화적 여유. 390px 뷰포트
// 기준 2 world-% ≈ 7.8px(390*2/100) — walkGrid.js 격자 셀 1개 폭(2.4)보다
// 작아 인접 칸을 오탐하지 않으면서도 정확한 픽셀 경계보다는 약간 넉넉하게
// 잡은 값.
export const BENCH_TAP_PAD_PCT = 2

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
 * 착석 지점 — 벤치 중심 x, 바닥 접점(y1)보다 BENCH_SIT_OFFSET_PCT만큼 위
 * (벤치 박스 안쪽 "좌석면"). 걷기 목적지가 아니므로 nearestWalkablePoint
 * 보정을 거치지 않는다(벤치 박스 안은 원래 걸을 수 없는 칸이지만, 앉은
 * 상태는 "걷기"가 아니라 캐릭터를 벤치 위에 얹는 별도 연출이라 이 좌표를
 * 그대로 쓴다).
 * @param {{x0:number,x1:number,y0:number,y1:number}} rect
 * @returns {{x:number,y:number}}
 */
export function benchSeatPoint(rect) {
  return { x: (rect.x0 + rect.x1) / 2, y: rect.y1 - BENCH_SIT_OFFSET_PCT }
}

/**
 * world-% 탭 지점이 벤치 박스(+padding) 안인지 — 순수 사각형 hit-test.
 * Proto25DScreen.jsx의 유일한 포인터 경로(바닥 레이어 onPointerDown/
 * onPointerUp)가 "탭 지점이 벤치 안인가"를 판정하는 데만 쓴다(벤치 이미지
 * 엘리먼트 자체는 pointer-events:none이라 별도 onClick 경로가 없다 —
 * 새 이벤트 경로를 만들지 않는다는 요구사항).
 * @param {{x:number,y:number}} point
 * @param {{x0:number,x1:number,y0:number,y1:number}} rect
 * @param {number} [pad]
 * @returns {boolean}
 */
export function isBenchTap(point, rect, pad = BENCH_TAP_PAD_PCT) {
  if (!point || !rect) return false
  return point.x >= rect.x0 - pad && point.x <= rect.x1 + pad &&
    point.y >= rect.y0 - pad && point.y <= rect.y1 + pad
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
