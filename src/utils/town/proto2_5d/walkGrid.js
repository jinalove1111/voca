// src/utils/town/proto2_5d/walkGrid.js — Paul Town 2.5D 캐릭터 프로토타입
// (Stage 2, 2026-09-22) 걷기 가능 영역(walkable area) + 장애물 기하 계약.
//
// 순수 함수/데이터만 — React/DOM 의존 없음, Math.random/Date.now 없음
// (전부 결정론). 기존 src/components/town/v2/*, src/utils/town/townLayout.js,
// placementContract.js는 import하지 않는다(격리 유지,
// docs/design/town/ASTRA_HANDOFF_2026-09-21.md §12/§19). worldContract.js의
// WORLD 상수 하나만 좌표계 원점으로 가져다 쓴다(그 외 LANDMARKS/REGIONS 등은
// import하지 않는다 — 아래 OBSTACLES는 LANDMARKS의 "실제 게임 데이터"가
// 아니라 이 프로토타입 자체의 픽스처다).
import { WORLD } from '../worldContract'

// ── 좌표계 ────────────────────────────────────────────────────────────
// world 좌표는 Proto25DScreen.jsx가 이미 쓰는 것과 동일한 0~100 %
// (leftPct/topPct, WORLD.w=100 가로 % 폭, 컨테이너는 aspect-ratio
// WORLD.w:WORLD.h(100:190)로 세로가 물리적으로 더 길다 — worldContract.js
// 헤더 주석 "좌표 자체(x/y)는 항상 0~100 스케일" 그대로, y도 0~100
// 스케일이지 WORLD.h(190) 자체가 y의 상한이 아니다).
export const WORLD_MIN = 2
export const WORLD_MAX = 98

// ── 격자 해상도 ───────────────────────────────────────────────────────
// GRID_COLS=40을 기준으로 GRID_ROWS = GRID_COLS * (WORLD.h/WORLD.w)로
// 유도한다 — 컨테이너 자체의 물리 종횡비(100:190=1:1.9)가 이미 x 1%와
// y 1%의 물리 거리 비율을 정의하므로(worldContract.js의 Y_TO_X_RATIO와
// 동일 값, 여기서는 재도출만 하고 그 함수는 import하지 않는다), 셀이
// 화면상 정사각형에 가깝게 보이도록 이 비율을 그대로 격자 행/열 비에
// 반영한다. 40은 "충분히 세밀하면서도 BFS가 빠른" 절충값 — 47칸짜리 아이템
// 배치 격자(townLayout.js TOWN_GRID 8x6)보다 훨씬 곱지만, 3000여 셀
// 규모라 매 탭마다 전수 BFS를 돌려도 비용이 무시할 만하다(신규
// 의존성/캐시 불필요).
//
// 격자는 world 전체 [0,100]이 아니라 걷기 가능한 실사용 구간
// [WORLD_MIN,WORLD_MAX](=[2,98], Stage 1 clampPct와 동일 여백)에 정확히
// 맞춰 앵커링한다 — 만약 [0,100] 위에 격자를 얹고 나서 여백 밖 셀만 별도로
// "blocked" 처리했다면, 격자 칸 크기가 여백 폭(2)보다 커서 경계에 딱 붙은
// 점(예: 정확히 x=2)조차 "여백에 걸친 칸"으로 오분류돼 불필요하게
// 보정되는 사각지대가 생긴다(이 세션이 최초 구현에서 실측으로 발견해
// 수정함 — worldToCell(2,2)가 부정확하게 'blocked' 셀로 귀결되는 회귀를
// 유닛 테스트로 재현 후 이 앵커링으로 고쳤다). [WORLD_MIN,WORLD_MAX]에
// 정확히 맞춰 격자를 앵커링하면 이 사각지대가 구조적으로 사라진다.
//
// 390px 뷰포트(기존 Stage 1 모바일 E2E 기준 폭) 참고치: 바닥
// 레이어(Proto25DScreen.jsx `proto25d-ground`)가 폭 ~390px을 그대로 쓰면
// aspect-ratio 100:190에 의해 높이는 ~390*1.9=741px — 셀 1개는 약
// 390*(2.4/100)=9.36px(가로) x 741*(96/76/100)=9.48px(세로), 즉 대략
// 9~10px의 거의 정사각 셀(실제 렌더 높이는 뷰포트 여유 공간에 따라 달라질
// 수 있어 "대략"이라고 명시한다 — 실측이 아니라 CSS 산술로 유도한 근사치).
export const GRID_COLS = 40
export const GRID_ROWS = Math.round(GRID_COLS * (WORLD.h / WORLD.w)) // 76
const USABLE_PCT = WORLD_MAX - WORLD_MIN // 96 — 격자가 실제로 덮는 폭(x/y 공용, clampPct 여백과 동일)
export const CELL_W_PCT = USABLE_PCT / GRID_COLS // 2.4
export const CELL_H_PCT = USABLE_PCT / GRID_ROWS // ≈1.2632
const BOUNDS_EPS = 1e-6 // 부동소수점 곱셈 오차 방어(2.4*40처럼 정확히 96이 아닐 수 있음)

// ── 장애물(데모 픽스처) ───────────────────────────────────────────────
// 실제 학생 데이터/구매 데이터가 아니다 — 마운트 스코프 로컬 상수, 영속화
// 없음. worldContract.js LANDMARKS를 라이브 import하지 않는다(팀장 지시,
// V2 실데이터와 결합 금지) — 아래 두 항목만 LANDMARKS의 스케일 감각을
// "참고"해 손으로 다시 정한 좌표다(값을 그대로 복사하지 않음, import 아님):
//   - demo-building: LANDMARKS['cafe'] = {x:67, y:47, w:20, hFactor:1.25}
//     (worldContract.js:57)의 "건물 하나 폭 ~20 world-% 단위" 규모감만
//     참고했다. 실제 좌표/크기는 이 프로토타입 전용으로 새로 정했다(초기
//     캐릭터 위치(50,62)에서 곧장 위로 탭하면 반드시 우회가 필요하도록
//     폭을 넓게 잡음).
//   - demo-bench/demo-tree: decorations/nature 카탈로그의 "소형(sm/md)
//     장식" 스케일 감각(~6~8 world-% 폭)만 참고했다.
// 박스 좌표는 x0<x1, y0<y1(좌상단-우하단) 직사각형.
export const OBSTACLES = Object.freeze([
  Object.freeze({ id: 'demo-building', x0: 38, x1: 62, y0: 24, y1: 40 }),
  Object.freeze({ id: 'demo-bench', x0: 20, x1: 27, y0: 58, y1: 63 }),
  Object.freeze({ id: 'demo-tree', x0: 70, x1: 76, y0: 56, y1: 62 }),
])

// ── 셀 <-> world 좌표 변환 ────────────────────────────────────────────
// 격자 원점은 WORLD_MIN이다(위 "격자 해상도" 절 참고) — 0이 아니다.
export function worldToCell(x, y) {
  const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((x - WORLD_MIN) / CELL_W_PCT)))
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((y - WORLD_MIN) / CELL_H_PCT)))
  return { col, row }
}

/** 셀의 world-% 중심점(웨이포인트 좌표로 쓰인다). */
export function cellToWorldPoint(col, row) {
  return { x: WORLD_MIN + (col + 0.5) * CELL_W_PCT, y: WORLD_MIN + (row + 0.5) * CELL_H_PCT }
}

function cellBounds(col, row) {
  const x0 = WORLD_MIN + col * CELL_W_PCT
  const y0 = WORLD_MIN + row * CELL_H_PCT
  return { x0, x1: x0 + CELL_W_PCT, y0, y1: y0 + CELL_H_PCT }
}

function rectsOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

/**
 * 셀 (col,row) 전체가 걸을 수 있는지 — 격자 밖이거나, world 여백
 * (WORLD_MIN~WORLD_MAX) 밖으로 조금이라도 걸치거나, 장애물 박스와
 * 조금이라도 겹치면 false. "셀 중심점만" 검사하지 않고 셀 전체 사각형을
 * 장애물과 겹침 검사하는 이유 — 중심점만 보면 셀 면적 대부분이 장애물에
 * 덮여도 중심이 우연히 밖이면 통과로 오판할 수 있어("장애물을 절대
 * 통과하지 않는다" 요구사항에 더 보수적으로 부합).
 */
export function isWalkableCell(col, row, obstacles = OBSTACLES) {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false
  const bounds = cellBounds(col, row)
  // 격자가 이미 [WORLD_MIN,WORLD_MAX]에 정확히 맞춰 앵커링돼 있어 정상
  // 케이스에서는 절대 밖으로 나가지 않는다 — 부동소수점 오차만 방어.
  if (bounds.x0 < WORLD_MIN - BOUNDS_EPS || bounds.x1 > WORLD_MAX + BOUNDS_EPS ||
      bounds.y0 < WORLD_MIN - BOUNDS_EPS || bounds.y1 > WORLD_MAX + BOUNDS_EPS) return false
  for (const ob of obstacles) {
    if (rectsOverlap(bounds, ob)) return false
  }
  return true
}

/** world-% 점 하나가 걸을 수 있는 칸에 속하는지 — 셀 판정에 위임(단일 진실 원천). */
export function classifyPoint(x, y, obstacles = OBSTACLES) {
  const { col, row } = worldToCell(x, y)
  return isWalkableCell(col, row, obstacles) ? 'walkable' : 'blocked'
}

/** [WORLD_MIN, WORLD_MAX] 경계로 clamp — Stage 1의 clampPct(2~98)와 동일 여백. */
export function clampToWorldBounds(x, y) {
  const cx = Math.max(WORLD_MIN, Math.min(WORLD_MAX, Number(x) || 0))
  const cy = Math.max(WORLD_MIN, Math.min(WORLD_MAX, Number(y) || 0))
  return { x: cx, y: cy }
}

/**
 * (col,row)에서 시작해 바깥으로 정사각 "링"을 반지름 1,2,3...순으로 훑어
 * 가장 먼저 발견되는 걸을 수 있는 셀을 반환한다(자기 자신이 이미 걸을 수
 * 있으면 그대로 반환). 각 링 내부는 항상 같은 순서(위쪽 행부터 왼쪽 열부터)
 * 로 훑어 완전히 결정론적이다. 격자 전체가 막혀있는 병적인 경우에만 null
 * (기본 OBSTACLES로는 발생하지 않는다 — 유닛 테스트가 커스텀 obstacles로
 * 이 경로를 검증한다).
 */
export function nearestWalkableCell(col, row, obstacles = OBSTACLES) {
  if (isWalkableCell(col, row, obstacles)) return { col, row }
  const maxRadius = GRID_COLS + GRID_ROWS
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dRow = -radius; dRow <= radius; dRow++) {
      for (let dCol = -radius; dCol <= radius; dCol++) {
        if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== radius) continue // 링 테두리만
        const r = row + dRow
        const c = col + dCol
        if (isWalkableCell(c, r, obstacles)) return { col: c, row: r }
      }
    }
  }
  return null
}

/**
 * 목적지 좌표 보정 — 이미 걸을 수 있으면 원래 좌표를 그대로 반환한다
 * (격자 중심으로 스냅하지 않음 — "정상 목적지는 그대로 보존" 요구사항).
 * 장애물 안이면 nearestWalkableCell로 보정한 셀의 중심점을 반환한다.
 * 항상 먼저 clampToWorldBounds를 적용한다(범위 밖 좌표 방어).
 */
export function nearestWalkablePoint(x, y, obstacles = OBSTACLES) {
  const clamped = clampToWorldBounds(x, y)
  if (classifyPoint(clamped.x, clamped.y, obstacles) === 'walkable') return clamped
  const cell = worldToCell(clamped.x, clamped.y)
  const corrected = nearestWalkableCell(cell.col, cell.row, obstacles)
  if (!corrected) return clamped // 병적으로 전부 막힌 경우의 안전한 폴백
  return cellToWorldPoint(corrected.col, corrected.row)
}
