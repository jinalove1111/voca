// src/utils/town/townScene.js — Paul Town V2-A 스토리북 씬 좌표/파생값
// (순수 도메인, 2026-09-13).
//
// import는 townLayout.js(TOWN_GRID/HOME_CELL)과 townLevel.js
// (starsToNextTownLevel/townLevelForStars)만 허용한다 — React/DOM/Date.now/
// Math.random 없음. 이 파일은 기존 8x6 좌표계(townLayout.js가 진실
// 원천)를 절대 바꾸지 않고, 그 좌표를 "장면(scene)" 픽셀/퍼센트 앵커로
// 변환하는 순수 파생 함수만 제공한다. 입력을 mutate하지 않고, 손상된
// 입력(undefined/NaN/범위 밖)에도 크래시 없이 안전한 기본값을 반환한다.
//
// 2026-09-16 확장 — Paul Town 월드 레이아웃 재설계(docs/design/town/
// WORLD_LAYOUT_REDESIGN_2026-09-16.md, wireframe/
// paul-town-world-wireframe.html)를 실제 v2 렌더러(src/components/town/v2/*)
// 로 포팅하기 위해 DISTRICTS/DISTRICT_ORDER/GEO_ORDER/LOTS/SPOT_MAP/PATHS/
// STUBS 상수와 districtsVisible/sceneHeightUnits/districtOffsetUnits/
// districtLocalToGlobal/districtForCell/lotState 파생 함수를 추가했다.
// anchorFor/zIndexFor/freeAnchors는 시그니처에 레벨/구역 인자가 늘었을 뿐
// "순수, import 0 확장, 8x6 좌표계 불변"이라는 원래 제약은 그대로다 — 여전히
// townLayout.js/townLevel.js 외에는 아무것도 import하지 않는다. 이 확장은
// paulTownV2 플래그가 꺼져 있는 한 아무 학생에게도 보이지 않는다.

import { TOWN_GRID, HOME_CELL as TOWN_LAYOUT_HOME_CELL } from './townLayout'

// townLayout.js가 유일한 좌표 진실 원천 — 이 파일은 재수출만 한다(v2
// 레이어 컴포넌트들이 townLayout.js와 townScene.js 양쪽을 왔다갔다
// import하지 않도록).
export const HOME_CELL = TOWN_LAYOUT_HOME_CELL
import { starsToNextTownLevel, townLevelForStars } from './townLevel'

export const SCENE_ROWS = TOWN_GRID.rows
export const SCENE_COLS = TOWN_GRID.cols
export const LANE_ROW = Math.floor(TOWN_GRID.rows / 2)

// 행(row) 밴드 -> 존(zone) 매핑. TOWN_GRID.rows/LANE_ROW에서 파생하므로
// 그리드가 커지거나 줄어도(현재 8x6) 모든 행이 정확히 하나의 존에 속한다.
function buildZones() {
  const rows = SCENE_ROWS
  const lane = LANE_ROW
  const homeRows = []
  for (let y = 0; y < lane; y++) homeRows.push(y)
  const laneRows = [lane]
  const squareRow = lane + 1
  const squareRows = squareRow < rows ? [squareRow] : []
  const outskirtsRows = []
  for (let y = squareRow + 1; y < rows; y++) outskirtsRows.push(y)
  return [
    { id: 'home', rows: homeRows, label: '집과 정원' },
    { id: 'lane', rows: laneRows, label: '마을 길' },
    { id: 'square', rows: squareRows, label: '마을 광장' },
    { id: 'outskirts', rows: outskirtsRows, label: '마을 바깥' },
  ].filter((z) => z.rows.length > 0)
}

export const ZONES = Object.freeze(
  buildZones().map((z) => Object.freeze({ ...z, rows: Object.freeze(z.rows) })),
)

function clampCoord(v, max) {
  const n = Number.isInteger(v) ? v : 0
  return Math.max(0, Math.min(max - 1, n))
}

function clampPct(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function normalizeLevel(level) {
  const n = Number(level)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

// ---------------------------------------------------------------------
// 월드 지오메트리(2026-09-16) — docs/design/town/
// WORLD_LAYOUT_REDESIGN_2026-09-16.md §2/§3 + wireframe/
// paul-town-world-wireframe.html의 DISTRICTS/LOTS/SPOT_MAP/PATHS/STUBS를
// 숫자 그대로 포팅한 상수다(좌표 재도출 없음). paulTownV2 뒤 v2 렌더러만
// 소비하고, V1(TownGrid.jsx, 8x6 균일 격자)은 참조하지 않는다 —
// townLayout.js의 8x6 좌표계(TOWN_GRID/HOME_CELL)는 여전히 유일한 배치
// 저장 진실 원천이고, 아래 SPOT_MAP은 그 좌표를 세계 공간 퍼센트로
// "해석"만 한다(재구현이 아니라 파생).
// ---------------------------------------------------------------------

export const DISTRICTS = Object.freeze({
  tower: Object.freeze({ id: 'tower', name: 'Clock Tower & hills/sky', heightUnits: 0.95, scale: 0.56, unlock: 8 }),
  school: Object.freeze({ id: 'school', name: 'English School', heightUnits: 0.80, scale: 0.64, unlock: 7 }),
  river: Object.freeze({ id: 'river', name: 'River & Stone Bridge', heightUnits: 0.50, scale: 0.70, unlock: 6 }),
  square: Object.freeze({ id: 'square', name: 'Village Square & Café', heightUnits: 0.90, scale: 0.76, unlock: 5 }),
  lane: Object.freeze({ id: 'lane', name: 'Book Shop Lane', heightUnits: 0.85, scale: 0.86, unlock: 3 }),
  home: Object.freeze({ id: 'home', name: 'My Home & Garden', heightUnits: 1.15, scale: 1.00, unlock: 1 }),
})

// 페이지/세계 위에서 위(맨 위 구역) -> 아래(홈) 순서 — DOM/렌더 스택
// 순서와 동일(브리프 §3 "snake" 순서 그대로).
export const DISTRICT_ORDER = Object.freeze(['tower', 'school', 'river', 'square', 'lane', 'home'])
// 세계의 바닥(홈) -> 꼭대기(타워) 순서 — z-index 산정/경로(PATHS) 순회에 씀.
export const GEO_ORDER = Object.freeze(['home', 'lane', 'square', 'river', 'school', 'tower'])
export const FOG_HEIGHT_UNITS = 0.32
export const MAIN_PATH_WIDTH_PCT = 13
export const STUB_WIDTH_PCT = 8

// LOTS — 고정 건물 로트. left/baseline은 그 구역(district) 밴드 자체의
// 폭/높이 기준 퍼센트다(밴드 전체 폭이 이미 장면 폭 W와 같으므로 left는
// 별도 변환 없이 그대로 전역 leftPct로 쓸 수 있다 — 세로 위치(baseline)만
// districtOffsetUnits로 전역 변환이 필요하다). width는 구역 스케일 적용
// 전 값(렌더러가 lot.width * DISTRICTS[district].scale로 실제 폭을 만든다).
export const LOTS = Object.freeze([
  Object.freeze({ id: 'my-house', district: 'home', left: 50, baseline: 66, width: 42 }),
  Object.freeze({ id: 'book-shop', district: 'lane', left: 30, baseline: 62, width: 36 }),
  Object.freeze({ id: 'cafe', district: 'square', left: 78, baseline: 60, width: 34 }),
  Object.freeze({ id: 'stone-fountain', district: 'square', left: 50, baseline: 55, width: 16 }),
  Object.freeze({ id: 'bridge', district: 'river', left: 50, baseline: 50, width: 44, crossable: true }),
  Object.freeze({ id: 'english-school', district: 'school', left: 38, baseline: 55, width: 40 }),
  Object.freeze({ id: 'clock-tower', district: 'tower', left: 50, baseline: 60, width: 16 }),
])

const LOT_BY_ID = Object.freeze(LOTS.reduce((acc, lot) => { acc[lot.id] = lot; return acc }, {}))

// SPOT_MAP — 48칸 전체 데코레이션 앵커. wireframe/
// paul-town-world-wireframe.html의 `SPOT_MAP` 객체와 숫자가 동일하다
// (WORLD_LAYOUT_REDESIGN_2026-09-16.md §3.2 표와 1:1). (3,2)는 My House
// 로트 자신이라 여기 없다 — anchorFor()가 HOME_CELL을 별도 분기로 처리한다.
export const SPOT_MAP = Object.freeze({
  '0,0': Object.freeze({ district: 'home', left: 3, top: 22, scale: 0.82 }),
  '1,0': Object.freeze({ district: 'home', left: 17, top: 15, scale: 0.82 }),
  '2,0': Object.freeze({ district: 'home', left: 33, top: 26, scale: 0.82 }),
  '3,0': Object.freeze({ district: 'home', left: 46, top: 16, scale: 0.82 }),
  '4,0': Object.freeze({ district: 'home', left: 58, top: 24, scale: 0.82 }),
  '5,0': Object.freeze({ district: 'home', left: 72, top: 14, scale: 0.82 }),
  '6,0': Object.freeze({ district: 'home', left: 73, top: 27, scale: 0.82 }),
  '7,0': Object.freeze({ district: 'home', left: 97, top: 19, scale: 0.82 }),

  '0,1': Object.freeze({ district: 'home', left: 7, top: 37, scale: 0.90 }),
  '1,1': Object.freeze({ district: 'home', left: 15, top: 45, scale: 0.90 }),
  '2,1': Object.freeze({ district: 'home', left: 23, top: 53, scale: 0.90 }),
  '3,1': Object.freeze({ district: 'home', left: 11, top: 58, scale: 0.90 }),
  '4,1': Object.freeze({ district: 'home', left: 72, top: 34, scale: 0.90 }),
  '5,1': Object.freeze({ district: 'home', left: 80, top: 46, scale: 0.90 }),
  '6,1': Object.freeze({ district: 'home', left: 73, top: 58, scale: 0.90 }),
  '7,1': Object.freeze({ district: 'home', left: 28, top: 40, scale: 0.90 }),

  '0,2': Object.freeze({ district: 'home', left: 5, top: 84, scale: 1.00 }),
  '1,2': Object.freeze({ district: 'home', left: 15, top: 72, scale: 1.00 }),
  '2,2': Object.freeze({ district: 'home', left: 25, top: 66, scale: 1.00 }),
  '4,2': Object.freeze({ district: 'home', left: 75, top: 66, scale: 1.00 }),
  '5,2': Object.freeze({ district: 'home', left: 80, top: 90, scale: 1.00 }),
  '6,2': Object.freeze({ district: 'home', left: 93, top: 86, scale: 1.00 }),
  '7,2': Object.freeze({ district: 'home', left: 66, top: 95, scale: 1.00 }),

  '0,3': Object.freeze({ district: 'lane', left: 8, top: 30, scale: 0.86 }),
  '1,3': Object.freeze({ district: 'lane', left: 18, top: 55, scale: 0.86 }),
  '2,3': Object.freeze({ district: 'lane', left: 12, top: 78, scale: 0.86 }),
  '3,3': Object.freeze({ district: 'lane', left: 60, top: 25, scale: 0.86 }),
  '4,3': Object.freeze({ district: 'lane', left: 72, top: 45, scale: 0.86 }),
  '5,3': Object.freeze({ district: 'lane', left: 82, top: 68, scale: 0.86 }),
  '6,3': Object.freeze({ district: 'lane', left: 90, top: 85, scale: 0.86 }),
  '7,3': Object.freeze({ district: 'lane', left: 48, top: 88, scale: 0.86 }),

  '0,4': Object.freeze({ district: 'square', left: 10, top: 35, scale: 0.76 }),
  '1,4': Object.freeze({ district: 'square', left: 20, top: 60, scale: 0.76 }),
  '2,4': Object.freeze({ district: 'square', left: 93, top: 55, scale: 0.76 }),
  '3,4': Object.freeze({ district: 'square', left: 85, top: 75, scale: 0.76 }),
  '4,4': Object.freeze({ district: 'square', left: 65, top: 28, scale: 0.76 }),
  '5,4': Object.freeze({ district: 'square', left: 68, top: 82, scale: 0.76 }),
  '6,4': Object.freeze({ district: 'square', left: 88, top: 35, scale: 0.76 }),
  '7,4': Object.freeze({ district: 'square', left: 45, top: 90, scale: 0.76 }),

  '0,5': Object.freeze({ district: 'river', left: 15, top: 55, scale: 0.70 }),
  '1,5': Object.freeze({ district: 'river', left: 85, top: 55, scale: 0.70 }),
  '2,5': Object.freeze({ district: 'school', left: 12, top: 70, scale: 0.64 }),
  '3,5': Object.freeze({ district: 'school', left: 85, top: 40, scale: 0.64 }),
  '4,5': Object.freeze({ district: 'school', left: 78, top: 75, scale: 0.64 }),
  '5,5': Object.freeze({ district: 'tower', left: 20, top: 50, scale: 0.56 }),
  '6,5': Object.freeze({ district: 'tower', left: 75, top: 45, scale: 0.56 }),
  '7,5': Object.freeze({ district: 'tower', left: 80, top: 85, scale: 0.56 }),
})

// PATHS/STUBS — 구역별 경로 베지어 세그먼트(밴드 로컬 %, y=0 밴드 위쪽,
// y=100 밴드 아래쪽). wireframe의 PATHS/STUBS 객체와 숫자가 동일하다.
// `c`가 있으면 2차 베지어(Q) 제어점, 없으면 직선(L).
export const PATHS = Object.freeze({
  home: Object.freeze([
    Object.freeze({ from: Object.freeze({ x: 50, y: 100 }), to: Object.freeze({ x: 50, y: 84 }) }),
    Object.freeze({ from: Object.freeze({ x: 50, y: 84 }), c: Object.freeze({ x: 70, y: 82 }), to: Object.freeze({ x: 82, y: 75 }) }),
    Object.freeze({ from: Object.freeze({ x: 82, y: 75 }), c: Object.freeze({ x: 90, y: 58 }), to: Object.freeze({ x: 92, y: 44 }) }),
    Object.freeze({ from: Object.freeze({ x: 92, y: 44 }), c: Object.freeze({ x: 87, y: 18 }), to: Object.freeze({ x: 78, y: 0 }) }),
  ]),
  lane: Object.freeze([
    Object.freeze({ from: Object.freeze({ x: 78, y: 100 }), c: Object.freeze({ x: 75, y: 70 }), to: Object.freeze({ x: 60, y: 50 }) }),
    Object.freeze({ from: Object.freeze({ x: 60, y: 50 }), c: Object.freeze({ x: 56, y: 38 }), to: Object.freeze({ x: 50, y: 30 }) }),
    Object.freeze({ from: Object.freeze({ x: 50, y: 30 }), c: Object.freeze({ x: 38, y: 15 }), to: Object.freeze({ x: 22, y: 0 }) }),
  ]),
  square: Object.freeze([
    Object.freeze({ from: Object.freeze({ x: 22, y: 100 }), c: Object.freeze({ x: 25, y: 82 }), to: Object.freeze({ x: 35, y: 68 }) }),
    Object.freeze({ from: Object.freeze({ x: 35, y: 68 }), c: Object.freeze({ x: 37, y: 48 }), to: Object.freeze({ x: 40, y: 32 }) }),
    Object.freeze({ from: Object.freeze({ x: 40, y: 32 }), c: Object.freeze({ x: 45, y: 15 }), to: Object.freeze({ x: 50, y: 0 }) }),
  ]),
  river: Object.freeze([
    Object.freeze({ from: Object.freeze({ x: 50, y: 100 }), to: Object.freeze({ x: 50, y: 0 }) }),
  ]),
  school: Object.freeze([
    Object.freeze({ from: Object.freeze({ x: 50, y: 100 }), c: Object.freeze({ x: 55, y: 75 }), to: Object.freeze({ x: 60, y: 59 }) }),
    Object.freeze({ from: Object.freeze({ x: 60, y: 59 }), c: Object.freeze({ x: 65, y: 45 }), to: Object.freeze({ x: 68, y: 30 }) }),
    Object.freeze({ from: Object.freeze({ x: 68, y: 30 }), c: Object.freeze({ x: 70, y: 15 }), to: Object.freeze({ x: 70, y: 0 }) }),
  ]),
  tower: Object.freeze([
    Object.freeze({ from: Object.freeze({ x: 70, y: 100 }), c: Object.freeze({ x: 60, y: 85 }), to: Object.freeze({ x: 50, y: 70 }) }),
  ]),
})

export const STUBS = Object.freeze({
  home: Object.freeze([
    Object.freeze({ from: Object.freeze({ x: 50, y: 84 }), to: Object.freeze({ x: 50, y: 72 }) }),
  ]),
})

/** minLevel<=level인 DISTRICT_ORDER(위->아래) 부분집합. */
export function districtsVisible(level) {
  const lvl = normalizeLevel(level)
  return DISTRICT_ORDER.filter((id) => DISTRICTS[id].unlock <= lvl)
}

/** 현재 레벨에서 보이는 전체 씬 높이(heightUnits 합 + 필요시 안개). */
export function sceneHeightUnits(level) {
  const lvl = normalizeLevel(level)
  const visible = districtsVisible(lvl)
  const sum = visible.reduce((acc, id) => acc + DISTRICTS[id].heightUnits, 0)
  return sum + (lvl < 8 ? FOG_HEIGHT_UNITS : 0)
}

/**
 * districtId 밴드 자신의 "맨 위" 가장자리가, 현재 보이는 스택 맨 위(안개
 * 포함)에서 얼마나 떨어져 있는지(heightUnits 단위 누적). districtId가
 * 현재 레벨에서 보이지 않으면(아직 안 열림) sceneHeightUnits(level)을
 * 반환한다(그 구역이 화면에 없으니 스택 맨 아래 너머로 취급하는
 * 크래시 방지용 안전값 — 호출부는 어차피 잠긴 구역을 그리지 않는다).
 */
export function districtOffsetUnits(districtId, level) {
  const lvl = normalizeLevel(level)
  const visible = districtsVisible(lvl)
  let offset = lvl < 8 ? FOG_HEIGHT_UNITS : 0
  for (const id of visible) {
    if (id === districtId) return offset
    offset += DISTRICTS[id].heightUnits
  }
  return offset
}

/**
 * districtId 밴드 로컬 좌표(leftPct 그대로, topPctFromBandTop 0~100 —
 * 그 밴드 자신의 위쪽 기준)를 장면 전체 기준 퍼센트로 변환한다.
 * anchorFor()와 로트 렌더러(TownObjectLayer.jsx)가 공유하는 유일한 좌표
 * 변환 지점 — 스택 누적 수학을 두 곳에서 중복 구현하지 않는다. topPct와
 * bottomPct는 의도적으로 같은 값을 반환한다(스팟은 폭/높이가 없는 앵커점
 * 하나이므로, 중심 정렬(overlay)과 바닥 정렬(오브젝트 sprite) 양쪽
 * 소비처가 같은 점을 그대로 재사용해도 무방하다 — 기존 8x6 균일 그리드
 * 시절엔 "칸 중심"과 "칸 바닥"이 셀 높이만큼 달랐지만, 새 좌표계는 칸이
 * 아니라 점이라 그 구분이 더 이상 의미가 없다).
 */
export function districtLocalToGlobal(districtId, leftPct, topPctFromBandTop, level = 1) {
  const d = DISTRICTS[districtId]
  const totalUnits = sceneHeightUnits(level)
  if (!d || !Number.isFinite(totalUnits) || totalUnits <= 0) {
    return { leftPct: clampPct(leftPct), topPct: 50, bottomPct: 50 }
  }
  const offsetUnits = districtOffsetUnits(districtId, level)
  const localFraction = clampPct(topPctFromBandTop) / 100
  const globalUnits = offsetUnits + localFraction * d.heightUnits
  const pct = clampPct((globalUnits / totalUnits) * 100)
  return { leftPct: clampPct(leftPct), topPct: pct, bottomPct: pct }
}

/** (x,y) -> 그 칸이 속한 구역 id. HOME_CELL은 'home'(SPOT_MAP에 없음). */
export function districtForCell(x, y) {
  const cx = clampCoord(x, SCENE_COLS)
  const cy = clampCoord(y, SCENE_ROWS)
  if (cx === HOME_CELL.x && cy === HOME_CELL.y) return 'home'
  const spot = SPOT_MAP[`${cx},${cy}`]
  return spot ? spot.district : 'home'
}

/**
 * 카탈로그 로트 하나의 표시 상태 — 'hidden'(구역이 아직 안 열림) |
 * 'for-sale'(열렸지만 미구매) | 'built'(구매함, my-house는 항상 built).
 * lot.id가 곧 카탈로그 아이템 id다(townCatalog.js와 1:1, 이 파일이 새
 * id를 발명하지 않는다).
 */
export function lotState(lot, level, ownedIds) {
  if (!lot || !lot.district) return 'hidden'
  const district = DISTRICTS[lot.district]
  if (!district) return 'hidden'
  const lvl = normalizeLevel(level)
  if (district.unlock > lvl) return 'hidden'
  if (lot.id === 'my-house') return 'built'
  const owned = Array.isArray(ownedIds) ? ownedIds : []
  return owned.includes(lot.id) ? 'built' : 'for-sale'
}

/**
 * 셀(x,y) -> 장면 전체 기준 퍼센트 앵커. HOME_CELL은 my-house 로트 자신의
 * 좌표(SPOT_MAP에 없음)로, 그 외 칸은 SPOT_MAP을 거쳐
 * districtLocalToGlobal()로 변환한다. level(마을 레벨, 기본 1 — 인자를 안
 * 주는 기존 호출부도 안전하게 동작하도록)에 따라 그 구역이 현재 스택에서
 * 몇 번째 밴드인지가 달라지므로 결과 퍼센트도 달라진다(같은 칸이라도
 * 레벨마다 다른 %일 수 있음 — 새로 열리는 구역이 위에 쌓이면 전체 씬
 * 키가 커지기 때문). 다만 home처럼 항상 스택 맨 아래인 구역은 "구역
 * 자신의 맨 아래가 곧 씬의 맨 아래"라는 절대 불변식이 레벨과 무관하게
 * 항상 성립한다(scripts/testTownSceneV2.mjs가 이 불변식을 직접 검증).
 * @returns {{leftPct:number, topPct:number, bottomPct:number}}
 */
export function anchorFor(x, y, level = 1) {
  const cx = clampCoord(x, SCENE_COLS)
  const cy = clampCoord(y, SCENE_ROWS)
  if (cx === HOME_CELL.x && cy === HOME_CELL.y) {
    const homeLot = LOT_BY_ID['my-house']
    return districtLocalToGlobal('home', homeLot.left, homeLot.baseline, level)
  }
  const spot = SPOT_MAP[`${cx},${cy}`]
  if (!spot) return { leftPct: 50, topPct: 50, bottomPct: 50 }
  return districtLocalToGlobal(spot.district, spot.left, spot.top, level)
}

// fog는 잠긴 구역 위에 깔리는 "바닥 안개"일 뿐이다 — objects(배치된
// 스프라이트)보다 아래(z 낮음)에 있어야, 이미 구매해 놓은 아이템이 잠긴
// 것처럼 흐리게 보이는 일이 없다(2026-09-13 수정: 안개가 objects 위에
// 있어 rows 4–5에 놓인 소유 아이템이 blur/dim 처리되던 버그).
export const Z_LAYERS = Object.freeze({
  ground: 0,
  path: 1,
  patches: 2,
  fog: 5,
  objects: 10,
  overlay: 90,
  popover: 100,
})

/**
 * y(행)와 districtId 조합 -> z-index. 구역 스택 순서가 먼저다(홈이 항상
 * 화면 아래/앞쪽이라 다른 어떤 구역의 오브젝트보다도 위에 그려져야
 * 한다) — 같은 구역 안에서는 기존 "y가 클수록 앞쪽" 규칙이 타이브레이커로
 * 남는다. districtId를 안 주면(하위호환 기본값) 'home'으로 취급한다 —
 * 이 저장소의 실제 호출부(TownObjectLayer.jsx)는 이번 확장에서 항상 두
 * 인자를 넘기도록 갱신했다.
 */
export function zIndexFor(y, districtId = 'home') {
  const cy = clampCoord(y, SCENE_ROWS)
  const rowZ = 10 + cy * 10
  const idx = GEO_ORDER.indexOf(districtId)
  const rank = idx >= 0 ? idx : 0
  const districtBump = (GEO_ORDER.length - 1 - rank) * 1000
  return districtBump + rowZ
}

export const FOOTPRINT_CLASS = Object.freeze({
  lg: 'w-[19%] max-w-[112px]',
  md: 'w-[14%] max-w-[84px]',
  sm: 'w-[11%] max-w-[64px]',
})

/** 카테고리 -> 발자국 크기('lg'|'md'|'sm'). null-safe, 알 수 없는 카테고리는 'sm'. */
export function footprintFor(item) {
  const category = item && item.category
  if (category === 'house' || category === 'special') return 'lg'
  if (category === 'nature') return 'md'
  return 'sm'
}

/** 카탈로그 아이템 -> 렌더 스프라이트 서술(TownSprite.jsx 입력). null-safe. */
export function spriteFor(item) {
  if (!item) return { assetKey: null, emoji: '🎁', footprint: 'sm', label: '' }
  return {
    assetKey: item.assetKey || null,
    emoji: item.emoji || '🎁',
    footprint: footprintFor(item),
    label: item.name || '',
  }
}

export const HOME_SPRITE = Object.freeze({
  assetKey: 'buildings/my-house',
  emoji: '🏡',
  footprint: 'lg',
  label: 'My House',
})

export const GARDEN_STAGE_THRESHOLDS = Object.freeze([0, 10, 30, 60, 100])

/**
 * 배운 단어 수(gardenPoints) -> 정원 풍성함 단계. 비유한/음수는 stage 0 +
 * 모든 플래그 false로 안전하게 취급한다.
 * @returns {{stage:0|1|2|3|4, windowsLit:boolean, ivy:boolean, birds:boolean}}
 */
export function gardenRichness(gardenPoints) {
  const n = Number(gardenPoints)
  const points = Number.isFinite(n) && n > 0 ? n : 0
  let stage = 0
  for (let i = GARDEN_STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= GARDEN_STAGE_THRESHOLDS[i]) { stage = i; break }
  }
  return {
    stage,
    windowsLit: points >= 30,
    ivy: points >= 60,
    birds: points >= 100,
  }
}

/**
 * 현재 레벨보다 높은 minLevel을 가진 카탈로그 아이템 중, 가장 가까운
 * 다음 레벨(minLevel)에 걸린 것들만 정렬해 반환. 잠긴 아이템이 없으면
 * { nextLevel:null, items:[] }.
 */
export function nextUnlocks(catalog, level) {
  const items = Array.isArray(catalog) ? catalog : []
  const lvl = Math.max(1, Number.isFinite(Number(level)) ? Number(level) : 1)
  const locked = items.filter((it) => it && Number.isFinite(Number(it.minLevel)) && Number(it.minLevel) > lvl)
  if (locked.length === 0) return { nextLevel: null, items: [] }

  let nextLevel = Infinity
  for (const it of locked) nextLevel = Math.min(nextLevel, Number(it.minLevel))

  const atNextLevel = locked
    .filter((it) => Number(it.minLevel) === nextLevel)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))

  return { nextLevel, items: atNextLevel }
}

// 한글 종성(받침) 유무에 따른 주격 조사 선택 — 받침 있으면 "이", 없으면
// "가"(2026-09-13 카피 결함 수정: "꽃밭가 열려요"처럼 받침 단어에 항상
// "가"를 붙이던 문제). 한글 완성형 범위(가~힣) 밖의 마지막 글자(영문/숫자/
// 이모지 등)는 안전하게 기존 동작("가")을 유지한다.
function subjectParticle(word) {
  const w = typeof word === 'string' ? word : ''
  const ch = w.charCodeAt(w.length - 1)
  if (Number.isNaN(ch) || ch < 0xac00 || ch > 0xd7a3) return '가'
  return (ch - 0xac00) % 28 === 0 ? '가' : '이'
}

/**
 * 다음 마을 레벨까지 남은 별 + 그때 열리는 아이템 이름(최대 2개) 안내문.
 * starsToNextTownLevel(별 축)과 nextUnlocks(레벨→아이템 축)을 조합한다.
 * 조사(가/이)는 나열된 이름 중 마지막 이름의 받침 유무를 따른다.
 */
export function nearGoal(catalog, starsEarned) {
  const stars = Number.isFinite(Number(starsEarned)) ? Math.max(0, Number(starsEarned)) : 0
  const { nextLevel, remaining } = starsToNextTownLevel(stars)
  if (nextLevel == null) {
    return { nextLevel: null, remaining: 0, names: [], text: '모든 마을이 열렸어요!' }
  }

  const { items } = nextUnlocks(catalog, townLevelForStars(stars))
  const names = items.slice(0, 2).map((it) => it.name).filter(Boolean)
  const text = names.length > 0
    ? `⭐ ${remaining} 더 모으면 ${names.join(' · ')}${subjectParticle(names[names.length - 1])} 열려요`
    : `⭐ ${remaining} 더 모으면 다음 레벨이 열려요`

  return { nextLevel, remaining, names, text }
}

/**
 * 다음 레벨에서 열리는 아이템(최대 3개)을 안개 실루엣으로 보여주기 위한
 * 서술. 잠긴 아이템이 하나도 없으면 visible:false.
 */
export function fogState(catalog, level) {
  const lvl = Math.max(1, Number.isFinite(Number(level)) ? Number(level) : 1)
  const { nextLevel, items } = nextUnlocks(catalog, lvl)
  if (nextLevel == null || items.length === 0) {
    return { visible: false, nextLevel: null, silhouettes: [], chip: '' }
  }
  const silhouettes = items.slice(0, 3).map((it) => ({ id: it.id, emoji: it.emoji || '🎁', name: it.name || '' }))
  return { visible: true, nextLevel, silhouettes, chip: `⭐ Lv.${nextLevel}에서 열려요` }
}

/**
 * HOME_CELL, 이미 배치가 있는 칸, 그리고 현재 레벨에서 아직 안 열린
 * 구역의 칸을 제외한 빈 칸 좌표(배치 오버레이용). placements 배열에
 * null이 섞여 있어도 안전. 2026-09-16 확장 — 잠긴 구역의 스팟을 배치
 * 후보로 내주지 않도록 level(기본 1)로도 거른다(SPOT_MAP 구역이
 * districtsVisible(level)에 속하는지 교집합).
 */
export function freeAnchors(placements, level = 1) {
  const list = Array.isArray(placements) ? placements.filter(Boolean) : []
  const occupied = new Set(list.map((p) => `${p.x},${p.y}`))
  const visible = new Set(districtsVisible(level))
  const out = []
  for (let y = 0; y < SCENE_ROWS; y++) {
    for (let x = 0; x < SCENE_COLS; x++) {
      if (x === HOME_CELL.x && y === HOME_CELL.y) continue
      if (occupied.has(`${x},${y}`)) continue
      const spot = SPOT_MAP[`${x},${y}`]
      if (!spot || !visible.has(spot.district)) continue
      out.push({ x, y })
    }
  }
  return out
}

const GARDEN_STAGE_EMOJI = ['🌱', '🌱', '🌷', '🌻', '🌳']

/**
 * 정원 단계(stage) -> 화단 자체를 그리는 단일 배경 스프라이트 서술
 * (`TownAmbientLayer.jsx`의 향후 드롭인 아트용, `TownSprite.jsx` 입력
 * 형태와 동일). `gardenRichness()`가 이미 계산하는 stage별 장식 플래그
 * (windowsLit/ivy/birds)나 STAGE_EMOJI 다중 이모지 군집(장식용 flavor)과는
 * 독립적이다 — 이 함수는 오직 "화단 그 자체"의 이미지 앵커만 서술하고,
 * 기존 다중 이모지 군집 렌더링은 그대로 유지된다. stage는 정수 0~4로
 * clamp하고, 비유한/음수는 0, 4 초과는 4로 취급한다.
 * @param {number} stage
 * @returns {{assetKey:string, emoji:string, footprint:null, label:string}}
 */
export function gardenStageSprite(stage) {
  const n = Number(stage)
  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(4, Math.trunc(n))) : 0
  return {
    assetKey: `nature/garden-stage-${clamped}`,
    emoji: GARDEN_STAGE_EMOJI[clamped],
    footprint: null,
    label: 'Garden',
  }
}
