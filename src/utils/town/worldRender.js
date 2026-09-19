// src/utils/town/worldRender.js — Paul Town V2 세계 좌표(world-coordinate)
// 렌더 어댑터(순수 도메인, 2026-09-18).
//
// 이 모듈은 새 지오메트리를 발명하지 않는다 — worldContract.js(WORLD/
// LANDMARKS, 동결된 월드 지오메트리)와 placementContract.js(47칸 배치
// 계약, CELLS/CELL_BY_ID/cellUnlockLevel)를 그대로 읽어, React 컴포넌트가
// 곧바로 CSS(%/px/z-index)로 쓸 수 있는 형태로만 변환한다(재구현 없음,
// CLAUDE.md 규칙 3). px↔% 변환 계수(3.9, WORLD_ASPECT=1.9)의 원천은
// docs/design/town/mockup/paul-town-recompose.html의 실측 하네스 로직
// (`pct(n)`/`pctH(n)`, 390px 기준 캔버스에서 width-scale 값을 %로 바꾸는
// 식)이다 — 그 하네스가 실제로 렌더해 승인받은 계산과 동일한 공식을
// 여기서도 그대로 쓴다.
//
// import는 ./worldContract, ./placementContract, ./depthOrder, ./townScene
// 넷만 쓴다(React/DOM/fetch/localStorage/Math.random 없음, 순수·결정론).
// 저장된 배치 데이터(placements의 x/y, 셀 id 문자열)는 이 모듈이 절대
// 바꾸지 않는다 — 읽기 전용 매핑일 뿐 마이그레이션이 아니다.
import { WORLD, LANDMARKS, depthScale } from './worldContract'
import { CELL_BY_ID, cellUnlockLevel } from './placementContract'
import { LAYER_BASE, cssZIndex } from './depthOrder'
import { HOME_CELL, SCENE_COLS, SCENE_ROWS, LOTS } from './townScene'

// 세계 물리 종횡비(세로/가로) — WORLD.h/WORLD.w = 190/100 = 1.9
// (PAUL_TOWN_APPROVED_WORLD_DESIGN_2026-09-17.md §1.1 "at 360/390/430 px
// width the world is 684/741/817 px tall"과 동일 비율).
export const WORLD_ASPECT = WORLD.h / WORLD.w

// CSS aspect-ratio 문자열 — 목업 하네스 `.stage { aspect-ratio: 100 / 190; }`
// 와 동일하게 WORLD 자체에서 파생한다(하드코딩 재도출 아님).
export const SCENE_ASPECT_RATIO = `${WORLD.w} / ${WORLD.h}`

// 목업 하네스의 기준 캔버스 폭(390px, 세 프리셋 360/390/430 중 default) —
// pxToWidthPct의 px→% 변환 계수(390/100 = 3.9)가 여기서 파생된다.
export const REF_WIDTH_PX = 390
const PX_PER_WIDTH_PCT = REF_WIDTH_PX / 100

/**
 * px(세계 폭 390px 기준 디자인 픽셀값) -> 세계 폭 대비 %. 목업 하네스의
 * `pct(n)`(n은 이미 width-scale 0~100 값)과 동일 계수(÷3.9)를, "디자인
 * px 원본" 입력까지 한 단계 더 당겨온 버전이다. 비유한값은 크래시 대신
 * 0을 반환한다.
 */
export function pxToWidthPct(px) {
  const n = Number(px)
  if (!Number.isFinite(n)) return 0
  return n / PX_PER_WIDTH_PCT
}

/**
 * 세계 폭 기준 % -> 세계 "높이" 기준 %. 목업 하네스의 `pctH(n)`
 * (`n / WORLD_ASPECT`)과 동일 — width-scale로 측정된 크기(예: 폭 기준
 * px에서 변환한 값)를 top/height 같은 height-scale 퍼센트로 쓸 때 필요한
 * 보정이다. 비유한값은 크래시 대신 0을 반환한다.
 */
export function widthPctToHeightPct(wPct) {
  const n = Number(wPct)
  if (!Number.isFinite(n)) return 0
  return n / WORLD_ASPECT
}

// townScene.js의 (비export) clampCoord와 동일한 규칙을 그대로 미러링한다
// (정수가 아니면 0, 그 다음 [0, max-1]로 clamp) — townScene.js가 export하지
// 않으므로 재구현이 아니라 "같은 규칙을 이 파일에서도 안전하게 쓰기 위한
// 복제"다(재설계 없음, 두 곳 모두 townLayout.js의 TOWN_GRID를 유일한
// 진실 원천으로 삼는다는 점은 변하지 않는다).
function clampCoord(v, max) {
  const n = Number.isInteger(v) ? v : 0
  return Math.max(0, Math.min(max - 1, n))
}

const HOME_FALLBACK = Object.freeze({ cellId: null, leftPct: 50, topPct: 50, bottomPct: 50, scale: 1, zone: null, depthY: 50 })

/**
 * 셀(x,y, townLayout.js의 8x6 그리드 좌표) -> world 앵커. HOME_CELL은
 * LANDMARKS['my-house'](zone 'home', scale 1)로, 그 외 칸은
 * placementContract.js의 CELL_BY_ID[`${x},${y}`]로 매핑한다. 저장된 셀
 * id/좌표 자체는 바꾸지 않는다 — 순수 읽기 파생일 뿐이다. 손상된 입력
 * (비정수/범위 밖/알 수 없는 셀)도 townScene.js의 clampCoord와 동일하게
 * 그리드 안으로 clamp하고 절대 throw하지 않는다.
 * @returns {{cellId:string|null, leftPct:number, topPct:number, bottomPct:number, scale:number, zone:string|null, depthY:number}}
 */
export function cellAnchor(x, y) {
  const cx = clampCoord(x, SCENE_COLS)
  const cy = clampCoord(y, SCENE_ROWS)

  if (cx === HOME_CELL.x && cy === HOME_CELL.y) {
    const home = LANDMARKS['my-house']
    if (!home) return HOME_FALLBACK
    return {
      cellId: `${HOME_CELL.x},${HOME_CELL.y}`,
      leftPct: home.x,
      topPct: home.y,
      bottomPct: home.y,
      scale: 1,
      zone: 'home',
      depthY: home.y,
    }
  }

  const id = `${cx},${cy}`
  const cell = CELL_BY_ID[id]
  if (!cell) return HOME_FALLBACK

  return {
    cellId: id,
    leftPct: cell.x,
    topPct: cell.y,
    bottomPct: cell.y,
    scale: cell.scale,
    zone: cell.zone,
    depthY: cell.y,
  }
}

/**
 * 랜드마크(LANDMARKS[id]) -> 렌더 박스. anchor는 bottom-center — leftPct/
 * bottomPct가 그 앵커점이고, widthPct/heightPct는 거기서 위로 자라는
 * 크기다. heightPct = w * hFactor / WORLD_ASPECT(물리 폭×종횡비를 세계
 * "높이" % 스케일로 환산 — worldContract.js 헤더 주석의 공식 그대로,
 * placementContract.js의 landmarkBox 내부 계산과 동일 정신). 알 수 없는
 * id는 null.
 * @returns {{id:string, leftPct:number, bottomPct:number, widthPct:number, heightPct:number, aspect:number, depthY:number, region:string}|null}
 */
export function landmarkBox(id) {
  const landmark = LANDMARKS[id]
  if (!landmark) return null
  return {
    id,
    leftPct: landmark.x,
    bottomPct: landmark.y,
    widthPct: landmark.w,
    heightPct: (landmark.w * landmark.hFactor) / WORLD_ASPECT,
    aspect: landmark.hFactor,
    depthY: landmark.y,
    region: landmark.region,
  }
}

/**
 * (layer, y, id) -> CSS z-index. depthOrder.js의 cssZIndex/depthKey에
 * 위임하되(재구현하지 않는다), depthKey가 unknown layer/비유한 y에 대해
 * 의도적으로 throw하는 것과 달리 이 어댑터는 렌더 경로에서 절대 죽지
 * 않아야 하므로 크래시 대신 안전한 기본값으로 정규화한다 — 알 수 없는
 * layer는 'objects'(콘텐츠 티어 기본), 비유한 y는 50(세계 세로 중앙)으로
 * 대체한 뒤 cssZIndex를 호출한다.
 */
export function worldZIndex(layer, y, id) {
  const safeLayer = typeof layer === 'string' && Object.prototype.hasOwnProperty.call(LAYER_BASE, layer)
    ? layer
    : 'objects'
  const n = Number(y)
  const safeY = Number.isFinite(n) ? n : 50
  return cssZIndex({ id, layer: safeLayer, y: safeY })
}

/**
 * 현재 레벨에서 배치 가능한 빈 world 셀(그리드 좌표) 목록 — townScene.js의
 * freeAnchors와 같은 {x,y} 셰이프를 반환하지만, 잠금해제 판정 기준이
 * 다르다: 여기서는 placementContract.js의 47칸 배치 계약
 * (PLACEMENT_CONTRACT_V1, 오너 결정 2026-09-18 — river 리버뱅크 씬은
 * Lv1부터 배경으로 보이지만 riverApproach 3칸 자체(오브젝트 배치)는
 * Lv6에 열린다)을 따른다. 이는 townScene.freeAnchors가 쓰는 SPOT_MAP
 * district 잠금해제(구역 단위)와 14칸이 의도적으로 다르다 — 씬 배경(강
 * 등)의 가시성은 이 함수가 관장하지 않는다, 오직 "오브젝트를 여기 놓을
 * 수 있는가"만 답한다. 순서는 row-major(y 바깥, x 안쪽), townScene의
 * freeAnchors와 동일.
 * @param {Array<{x:number,y:number}|null>} placements
 * @param {number} level
 * @returns {Array<{x:number,y:number}>}
 */
export function freeWorldAnchors(placements, level) {
  const n = Number(level)
  const lvl = Number.isFinite(n) && n >= 1 ? n : 1
  const list = Array.isArray(placements) ? placements.filter(Boolean) : []
  const occupied = new Set(list.map((p) => `${p.x},${p.y}`))

  const out = []
  for (let y = 0; y < SCENE_ROWS; y++) {
    for (let x = 0; x < SCENE_COLS; x++) {
      if (x === HOME_CELL.x && y === HOME_CELL.y) continue
      if (occupied.has(`${x},${y}`)) continue
      const cell = CELL_BY_ID[`${x},${y}`]
      if (!cell) continue
      if (cellUnlockLevel(cell) <= lvl) out.push({ x, y })
    }
  }
  return out
}

// 고정 랜드마크(LOTS) id 분류 — 2026-09-18 D1 정정(이전 landmarkRenderSource
// 접근은 틀린 규칙이라 전면 교체됐다, 아래 참고).
//
// 왜 이 판정이 필요한가: LOTS id(my-house/book-shop/cafe/stone-fountain/
// bridge/english-school/clock-tower)는 townCatalog.js 카탈로그 아이템
// id와 겹친다(my-house 제외). 학생이 book-shop/cafe 등을 "구매"하면
// ownedIds에 들어가고, 옛 8x6 시절엔 그걸 보관함에서 마을 칸에 "배치"할
// 수도 있었다(townLayout.townPlacements에 항목이 남음) — 하지만 세계
// 좌표 계약(월드 렌더러)에서 이 7개는 항상 LANDMARKS의 고정 박스에서만
// 그려지는 고정 로트다(TownObjectLayer.jsx의 LOTS.map 루프). 자유 배치
// 뷰/렌더 모델에서는 이 7개 id를 "배치 가능한 일반 아이템"으로 취급하지
// 않는다 — 그렇다고 레거시 townPlacements 항목을 지우거나 다시 쓰지도
// 않는다(데이터는 그대로 두고 뷰에서만 걸러낸다, CLAUDE.md 규칙 9/13과
// 같은 정신: 마이그레이션 없이 읽기 시점에 안전하게 처리).
//
// 왜 townCatalog.js가 아니라 여기(LOTS)가 분류 원천인가: 카탈로그의
// category 필드로는 구분이 안 된다 — book-shop/cafe는 'house',
// stone-fountain은 'decoration', bridge/english-school/clock-tower는
// 'special'이라 카테고리 값 자체가 흩어져 있고, my-house는 애초에
// 카탈로그 아이템조차 아니다(집 자체, 구매 불가). LOTS는 월드 계약이
// 이미 "이 7개는 고정 로트"라고 확정해 둔 유일한 목록이라, 이 판정의
// 신뢰할 수 있는 단일 원천은 LOTS뿐이다(오너 결정 — 다른 대안 없음).
// 다른 어떤 파일에도 이 7개 id를 하드코딩하지 않는다 — 전부 이 Set을
// 참조한다.
export const FIXED_LANDMARK_IDS = Object.freeze(new Set(LOTS.map((lot) => lot.id)))

/**
 * id가 고정 랜드마크(LOTS) 목록에 속하는지. 위 FIXED_LANDMARK_IDS의
 * 유일한 조회 창구 — 문자열이 아니거나 목록에 없는 값은 안전하게 false
 * (크래시 없음).
 * @param {string} id
 * @returns {boolean}
 */
export function isFixedLandmarkId(id) {
  return typeof id === 'string' && FIXED_LANDMARK_IDS.has(id)
}

// 배치 아이템 발자국 폭(world % 기준) BASE 값 — 하네스 실측(항상 보이는
// 소품 wPct 실측: 배경 나무 y≈30~47대 6.7~7.7%, 중간 y≈58~72대
// 8.7~12.3%, 전경 y≈86~88대 14.4~14.9%)에 맞춘 값. 옛 WORLD_FOOTPRINT_WIDTH_PCT
// {12,8,5.5}(TownObjectLayer.jsx, Step 7 초안)는 depthScale과 곱해도 중간
// 장면의 나무가 실측 7.4%(390px 기준 29px)로 하네스 범위보다 작게
// 나왔다 — 이번 값은 depthScale(worldContract.js, 유일한 깊이-스케일
// 진실 원천)을 그대로 곱해 하네스 범위에 맞춘다.
export const PLACED_ITEM_BASE_WIDTH_PCT = Object.freeze({ lg: 13, md: 10, sm: 6.5 })
const PLACED_ITEM_MAX_WIDTH_PCT = 16

/**
 * 배치 아이템 하나의 렌더 폭(world % 기준, TownObjectLayer.jsx가
 * width 스타일에 그대로 쓴다) — BASE[footprint] * depthScale(y)
 * (worldContract.depthScale, 재구현 없음), 최대 16%로 클램프. px 캡/
 * viewport별 clamp() 없이 오직 %만 쓴다 — 360/390/430 어디서도 동일한
 * "장면 대비 비율"로 렌더된다(작업 지시서 명시 — 해상도별로 다른
 * 절대 크기를 만들지 않는다). 알 수 없는 footprint는 'sm'로 안전
 * 폴백(크래시 없음).
 * @param {'lg'|'md'|'sm'|string} footprint
 * @param {number} y — world y(0~100), anchor.depthY.
 * @returns {number} 0~16 범위의 % 값.
 */
export function placedItemWidthPct(footprint, y) {
  const base = PLACED_ITEM_BASE_WIDTH_PCT[footprint] || PLACED_ITEM_BASE_WIDTH_PCT.sm
  const n = Number(y)
  const safeY = Number.isFinite(n) ? n : 50
  const scale = depthScale(safeY)
  return Math.min(PLACED_ITEM_MAX_WIDTH_PCT, base * scale)
}

// D5(2026-09-18) — 배치 모드 44px 탭 컨트롤 겹침 정정. 근본 원인: 셀 앵커는
// world % 좌표라, 좁은 화면(예: 360px)에서는 서로 다른 두 앵커가 44 CSS px
// 보다 더 가깝게 투영될 수 있다(예: Lv8 '1,1'과 '7,3') — TownPlacementOverlay
// 의 44x44 버튼이 앵커 중심에 그려지므로 나중에 그려진 버튼이 앞의 버튼
// pointer 이벤트를 가로챈다. 이 함수는 "마커(시각적 진짜 위치)"와
// "탭 가능한 44x44 컨트롤(포인터 타깃)"을 분리한다 — 마커는 항상 참
// 앵커에 그대로 남고, 컨트롤만 겹치지 않는 자리로 결정론적으로 옮긴다.
const CONTROL_OFFSET_DIRS = Object.freeze([
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
])

// ring r(정수 step 단위)의 후보 오프셋 전부 — Chebyshev 반경 r인 정사각형
// 둘레의 모든 정수 격자점(그 안쪽 점은 더 작은 ring에서 이미 시도됨).
// 순서: 위 CONTROL_OFFSET_DIRS(오른쪽/왼쪽/아래/위/대각선 4방향, 문서의
// "고정된 순서")를 먼저 시도하고, 그 나머지 둘레점(예: ring=2의 (2,1)
// 같은 "축도 대각선도 아닌" 점)은 각도(atan2) 오름차순으로 이어 붙인다
// — 좁은 화면에서 촘촘히 모인 실제 앵커 데이터(월드 % 좌표라 균일 격자가
// 아님)는 8방향만으로는 해소되지 않는 경우가 실제로 있어(Lv3~8 @
// 360~430px 실측), 같은 ring 안의 나머지 둘레점까지 결정론적으로 넓혀
// 탐색한다 — ring 자체(최대 3)와 "고정 순서로 시도한다"는 계약은 그대로
// 지킨다.
function ringOffsets(r) {
  const primary = CONTROL_OFFSET_DIRS.map(([i, j]) => [i * r, j * r])
  const seen = new Set(primary.map(([i, j]) => `${i},${j}`))
  const rest = []
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue
      const key = `${i},${j}`
      if (seen.has(key)) continue
      seen.add(key)
      rest.push([i, j])
    }
  }
  rest.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]))
  return [...primary, ...rest]
}

// Chebyshev(체스판) 거리 — max(|dx|,|dy|). 두 44px 정사각형 컨트롤의
// 중심이 서로의 박스 "안"에 들어가지 않으려면 이 거리가 반박스폭(22)을
// 넘기만 하면 된다(2026-09-18 D5 2차 정정, 오너 지적 — AABB 전체
// 비겹침은 과한 제약이라 불필요한 이동을 유발했다. 아래 docblock 참고).
function chebyshev(dx, dy) {
  return Math.max(Math.abs(dx), Math.abs(dy))
}

function boxFullyInside(box, w, h) {
  return box.left >= 0 && box.top >= 0 && box.right <= w && box.bottom <= h
}

function clampBoxToBounds(box, w, h, size) {
  let { left, top } = box
  const boxW = Math.min(size, w)
  const boxH = Math.min(size, h)
  left = Math.max(0, Math.min(w - boxW, left))
  top = Math.max(0, Math.min(h - boxH, top))
  return { left, top, right: left + boxW, bottom: top + boxH }
}

/**
 * 배치 모드 앵커 목록 -> 서로 "중심이 겹치지 않는" 44x44(기본) 탭 컨트롤
 * 배치. 2026-09-18 2차 정정(오너 리뷰) — 1차 구현은 두 컨트롤의 44x44
 * 박스 전체가 조금도 겹치지 않아야 한다는 AABB 전체-비겹침 규칙을
 * 썼는데, 이는 실제 수용 기준(각 컨트롤은 ≥44x44, 그 "중심"이
 * elementFromPoint로 자기 자신에 해석되고, 어느 컨트롤도 완전히 가려지지
 * 않으면 충분 — 모서리 일부 겹침은 허용)보다 훨씬 강해서, 월드 % 좌표
 * 앵커가 촘촘한 구간(예: 360px Lv8, 47개 동시 표시)에서 불필요하게 먼
 * 거리(최대 수백 px)까지 옮기는 과잉 이동을 유발했다. 이 함수는 이제
 * "중심 배제(center-exclusion)" 규칙만 강제한다 — 두 컨트롤 중심의
 * Chebyshev 거리(=max(|dx|,|dy|))가 `size/2 + margin`(기본 44/2+2=24)
 * 이상이면 통과. Chebyshev >= 24 > 22(반박스폭)이므로 한쪽 중심이 반드시
 * 상대 박스 밖에 남는다(양방향 대칭이라 서로의 중심을 서로 가리지
 * 않음을 보장) — 이게 정확히 오너가 요구한 "각 컨트롤 중심이 자기
 * 자신에 해석된다"는 계약이다.
 *
 * 입력 순서(anchors, freeWorldAnchors의 row-major 순서 그대로) = 처리
 * 순서 = 결정론의 근거(같은 입력이면 항상 같은 출력). 각 앵커에 대해
 * 먼저 중심을 그대로 쓰고, 이미 배치된 컨트롤과 중심 배제 조건을 어기면
 * 고정된 순서(오른쪽→왼쪽→아래→위→대각선 4방향 먼저, 그다음 같은 ring
 * 둘레의 나머지 점을 각도순으로, `size/2+margin`(24px) 간격)로 후보를
 * 시도해 "중심 배제를 만족하고 씬 경계 안에 완전히 들어가는" 첫 후보를
 * 쓴다. 간격이 1차 구현(46px)의 거의 절반이라 실측상 ring 2를 넘는
 * 경우가 드물다(아래 stats 참고) — ring 상한 자체는 여전히
 * `max(3, ceil(max(sceneW,sceneH)/step)+1)`로 씬 전체를 결정론적으로
 * 덮을 때까지 열어 두되(무한루프 없음), 정말로 화면 전체가 컨트롤로
 * 꽉 찬 극단적 경우에만 unresolved:true로 원래 앵커 위치를 유지한다.
 * 마지막으로 모든 박스(오프셋 여부 무관, 가장자리 근처 포함)를 씬 경계
 * 안으로 clamp한다. sceneW/sceneH가 비정상이면 REF_WIDTH_PX 기준 세계
 * 비율로 안전 폴백.
 * @param {Array<{x:number,y:number}>} anchors
 * @param {number} sceneW
 * @param {number} sceneH
 * @param {{size?:number, gap?:number}} [opts] gap은 이제 "중심 배제
 *   여유(margin)"의 의미로 쓰인다(기본 2px) — 최소 중심간 거리는
 *   size/2+gap.
 * @returns {Array<{x:number,y:number,cellId:string|null,anchorLeftPct:number,anchorTopPct:number,controlLeftPct:number,controlTopPct:number,offset:boolean,dxPx:number,dyPx:number,unresolved:boolean}>}
 */
export function layoutPlacementControls(anchors, sceneW, sceneH, { size = 44, gap = 2 } = {}) {
  const list = Array.isArray(anchors) ? anchors.filter((a) => a && Number.isFinite(Number(a.x)) && Number.isFinite(Number(a.y))) : []
  const wNum = Number(sceneW)
  const hNum = Number(sceneH)
  const w = Number.isFinite(wNum) && wNum > 0 ? wNum : REF_WIDTH_PX
  const h = Number.isFinite(hNum) && hNum > 0 ? hNum : REF_WIDTH_PX * WORLD_ASPECT
  const sizeNum = Number(size)
  const boxSize = Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : 44
  const gapNum = Number(gap)
  const margin = Number.isFinite(gapNum) ? gapNum : 2
  const minCenterDist = boxSize / 2 + margin

  const placedCenters = []
  const out = []

  function tooClose(cx, cy) {
    return placedCenters.some((p) => chebyshev(cx - p.x, cy - p.y) < minCenterDist)
  }

  for (const a of list) {
    const x = Number(a.x)
    const y = Number(a.y)
    const anchor = cellAnchor(x, y)
    const anchorXpx = (anchor.leftPct / 100) * w
    const anchorYpx = (anchor.topPct / 100) * h

    let chosenX = anchorXpx
    let chosenY = anchorYpx
    let offset = false
    let unresolved = false

    if (tooClose(anchorXpx, anchorYpx)) {
      let found = null
      const step = minCenterDist
      const maxRing = Math.max(3, Math.ceil(Math.max(w, h) / step) + 1)
      for (let ring = 1; ring <= maxRing && !found; ring++) {
        for (const [dx, dy] of ringOffsets(ring)) {
          const cx = anchorXpx + dx * step
          const cy = anchorYpx + dy * step
          const candidateBox = { left: cx - boxSize / 2, top: cy - boxSize / 2, right: cx + boxSize / 2, bottom: cy + boxSize / 2 }
          if (!boxFullyInside(candidateBox, w, h)) continue
          if (tooClose(cx, cy)) continue
          found = { x: cx, y: cy }
          break
        }
      }
      if (found) {
        chosenX = found.x
        chosenY = found.y
        offset = true
      } else {
        unresolved = true
      }
    }

    const rawFinalBox = { left: chosenX - boxSize / 2, top: chosenY - boxSize / 2, right: chosenX + boxSize / 2, bottom: chosenY + boxSize / 2 }
    const finalBox = clampBoxToBounds(rawFinalBox, w, h, boxSize)
    const centerX = (finalBox.left + finalBox.right) / 2
    const centerY = (finalBox.top + finalBox.bottom) / 2
    placedCenters.push({ x: centerX, y: centerY })

    out.push({
      x,
      y,
      cellId: anchor.cellId,
      anchorLeftPct: anchor.leftPct,
      anchorTopPct: anchor.topPct,
      controlLeftPct: (centerX / w) * 100,
      controlTopPct: (centerY / h) * 100,
      offset,
      dxPx: centerX - anchorXpx,
      dyPx: centerY - anchorYpx,
      unresolved,
    })
  }

  return out
}
