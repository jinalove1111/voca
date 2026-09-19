// src/utils/town/worldContract.js — Paul Town V2 월드 지오메트리 계약(순수
// 데이터 + 파생 함수, 2026-09-17).
//
// docs/design/town/PAUL_TOWN_APPROVED_WORLD_DESIGN_2026-09-17.md(운영자
// 승인, 동결된 지오메트리)를 코드로 옮긴 "구현 계약" 모듈이다 — 좌표/폭/
// anchor는 그 문서의 숫자(2026-09-17 보정치 포함: §1.2 리전 박스, §1.3
// My House (22,53) w34, §1.4 경로 폴리라인, §2 랜드마크 anchor)를 그대로
// 포팅했을 뿐 재설계하지 않는다(CLAUDE.md 규칙 3 — 이미 완료/승인된
// 설계를 재구현하지 않는다).
//
// 레벨/잠금해제는 여기서 다시 정의하지 않는다 — townLevel.js
// (TOWN_LEVELS/townLevelForStars)와 townScene.js(DISTRICTS[*].unlock/LOTS/
// lotState/districtsVisible)를 그대로 위임한다. import는 ./townScene과
// ./townLevel만 쓴다(React/DOM/fetch/localStorage/Math.random 없음, 순수·
// 결정론). ./townCatalog는 이 모듈의 데이터/파생 로직에 필요하지 않아
// import하지 않는다(허용되지만 미사용 import를 남기지 않는다).
import { DISTRICTS, LOTS, districtsVisible, lotState } from './townScene'
import { townLevelForStars } from './townLevel'

// 월드 전체 크기 — x는 세계 너비의 %(0~100), y는 세계 "높이"의 %(0~100).
// 실제 세로 물리 크기는 100(가로) : 190(세로) 비율(h)이라, hFactor처럼
// 픽셀 종횡비를 y% 폭으로 환산해야 하는 계산에서만 h가 쓰인다 — 좌표
// 자체(x/y)는 항상 0~100 스케일이다.
export const WORLD = Object.freeze({ w: 100, h: 190 })

// REGIONS — §1.2 리전 박스(2026-09-17 보정 포함) 그대로. district는 그
// 리전의 잠금해제를 실제로 관장하는 DISTRICTS(townScene.js) id — 잠금
// 레벨 숫자 자체는 여기 저장하지 않고 regionUnlockLevel()이 파생한다.
export const REGIONS = Object.freeze({
  sky: Object.freeze({ x0: 0, x1: 100, y0: 0, y1: 12, district: 'home' }),
  tower: Object.freeze({ x0: 66, x1: 86, y0: 6, y1: 26, district: 'tower' }),
  school: Object.freeze({ x0: 28, x1: 64, y0: 8, y1: 26, district: 'school' }),
  // River 리전은 §1.2 표에 단일 박스로 나오지 않고 센터라인+폭(§RIVER)으로
  // 주어진다 — RIVER 센터라인(x 86~95) ± (RIVER_WIDTH/2 + RIVER_BANK = 7)를
  // 감싸는 바운딩 박스로 파생했다(재도출이지 재설계가 아님 — 숫자 원천은
  // 여전히 아래 RIVER/RIVER_WIDTH/RIVER_BANK).
  river: Object.freeze({ x0: 79, x1: 100, y0: 12, y1: 100, district: 'river' }),
  bridge: Object.freeze({ x0: 76, x1: 96, y0: 29, y1: 38, district: 'river' }),
  cafe: Object.freeze({ x0: 56, x1: 78, y0: 36, y1: 50, district: 'square' }),
  square: Object.freeze({ x0: 40, x1: 70, y0: 40, y1: 64, district: 'square' }),
  shop: Object.freeze({ x0: 68, x1: 88, y0: 46, y1: 66, district: 'lane' }),
  home: Object.freeze({ x0: 2, x1: 46, y0: 24, y1: 66, district: 'home' }),
  connector: Object.freeze({ x0: 44, x1: 58, y0: 56, y1: 70, district: 'home' }),
  foreground: Object.freeze({ x0: 0, x1: 100, y0: 66, y1: 100, district: 'home' }),
})

// LANDMARKS — id는 townScene.js LOTS[*].id와 정확히 같아야 한다(새 id를
// 여기서 발명하지 않는다). hFactor는 프로덕션 에셋의 실제 픽셀 종횡비
// (height/width) — my-house/book-shop/cafe 256x320(1.25), bridge
// 320x160(0.5), stone-fountain 192x192(1.0), clock-tower 192x512(≈2.75,
// §8.3 표 그대로) — world y%로 렌더 높이를 환산할 때
// heightPct = w * hFactor / (WORLD.h / WORLD.w) 형태로 쓰인다(§8 asset
// plan, "Anchor = bottom-center").
export const LANDMARKS = Object.freeze({
  'my-house': Object.freeze({ x: 22, y: 53, w: 34, hFactor: 1.25, region: 'home' }),
  'book-shop': Object.freeze({ x: 78, y: 63, w: 20, hFactor: 1.25, region: 'shop' }),
  'cafe': Object.freeze({ x: 67, y: 47, w: 20, hFactor: 1.25, region: 'cafe' }),
  'stone-fountain': Object.freeze({ x: 55, y: 55, w: 12, hFactor: 1.0, region: 'square' }),
  'bridge': Object.freeze({ x: 86, y: 34, w: 20, hFactor: 0.5, region: 'bridge' }),
  'english-school': Object.freeze({ x: 46, y: 24, w: 30, hFactor: 1.25, region: 'school' }),
  'clock-tower': Object.freeze({ x: 76, y: 21, w: 12, hFactor: 2.75, region: 'tower' }),
})

const LOT_BY_ID = Object.freeze(LOTS.reduce((acc, lot) => { acc[lot.id] = lot; return acc }, {}))

// PATHS — §1.4 메인 경로 센터라인, 가지(branch)별 [x, y, width%] 목록.
// trunk은 door -> doorstep -> gate -> (44,65) -> forkA로 끝나고, 나머지
// 세 가지(square/shop/sea)는 모두 forkA(50,62)에서 출발한다(문서의
// "FORK A ... 세 branches" 구조 그대로). SEA 가지는 전경(foreground)
// 쪽으로 뻗어가며 넓어지는 방향이라 테이퍼링하지 않는다 — 마지막 화면
// 밖 지점(100,96)도 앞 지점과 같은 폭 10을 그대로 유지한다(2026-09-17
// 디자인 목업 #geometry JSON과의 동기화 확인 결과 반영).
export const PATHS = Object.freeze({
  trunk: Object.freeze([
    Object.freeze([22, 53, 6]),
    Object.freeze([27, 58, 7]),
    Object.freeze([33, 61, 8]),
    Object.freeze([44, 65, 9]),
    Object.freeze([50, 62, 9]),
  ]),
  square: Object.freeze([
    Object.freeze([50, 62, 9]),
    Object.freeze([55, 57, 8]),
    Object.freeze([68, 47, 7]),
    Object.freeze([78, 40, 6]),
    Object.freeze([84, 34, 6]),
    Object.freeze([74, 26, 5]),
    Object.freeze([50, 26, 4]),
  ]),
  shop: Object.freeze([
    Object.freeze([50, 62, 9]),
    Object.freeze([60, 68, 8]),
    Object.freeze([72, 67, 7]),
    Object.freeze([78, 63, 7]),
  ]),
  sea: Object.freeze([
    Object.freeze([50, 62, 9]),
    Object.freeze([47, 76, 9]),
    Object.freeze([52, 84, 9]),
    Object.freeze([64, 90, 10]),
    Object.freeze([80, 92, 10]),
    Object.freeze([100, 96, 10]),
  ]),
})

// RIVER — §1.2/§1.4 센터라인 그대로(수정 반영: 다리는 (86,34)). 폭은 물
// ~10 + 둑 ~2(문서 문구 그대로).
export const RIVER = Object.freeze([
  Object.freeze([93, 12]),
  Object.freeze([88, 26]),
  Object.freeze([86, 34]),
  Object.freeze([91, 44]),
  Object.freeze([94, 60]),
  Object.freeze([95, 100]),
])
export const RIVER_WIDTH = 10
export const RIVER_BANK = 2

// GARDEN_FENCE — §1.3/§2 "fence rule"(2026-09-17 추가): x 4~42, y 52~64를
// 감싸는, 모서리 반경 ≥6인 둥근 폐곡선 + 앞면(전면, y 큰 쪽) 바깥으로
// 볼록한 bow. GARDEN_GATE(33,61)는 §1.4 PATHS.trunk의 GATE 지점과 동일한
// 점이다(문 하나로 길이 통과한다는 문서 규칙 그대로). 폐곡선은 첫 점을
// 마지막에 반복해 명시적으로 닫는다.
export const GARDEN_FENCE = Object.freeze([
  Object.freeze([10, 52]),
  Object.freeze([22, 52]),
  Object.freeze([34, 52]),
  Object.freeze([40, 54]),
  Object.freeze([42, 58]),
  Object.freeze([40, 60]),
  Object.freeze([36, 61.5]),
  Object.freeze([33, 61]),
  Object.freeze([29, 62]),
  Object.freeze([24, 64]),
  Object.freeze([16, 63.5]),
  Object.freeze([10, 61]),
  Object.freeze([6, 58]),
  Object.freeze([4, 55]),
  Object.freeze([5, 52.5]),
  Object.freeze([10, 52]),
])
export const GARDEN_GATE = Object.freeze([33, 61])

// PROTECTED — 경로/랜드마크의 "절대 겹치면 안 되는" 핵심 지점들과 배제
// 반경(r, 단위). bridgeCrossing/paul/seaSign은 프롬프트에 명시된 정확한
// 좌표(86,34)/(10,92)/(80,92)를 그대로 쓴다. 나머지는 §1.4/§1.3/§2에서
// 같은 이름으로 지칭된 지점을 그대로 가져왔다(예: doorstep=(27,58) —
// "DOOR (22,53) → doorstep flagstones / (27,58) w7" 문장에서 DOOR 다음
// 점이 doorstep).
export const PROTECTED = Object.freeze({
  door: Object.freeze({ x: 22, y: 53, r: 5 }),
  doorstep: Object.freeze({ x: 27, y: 58, r: 4 }),
  gate: Object.freeze({ x: 33, y: 61, r: 5 }),
  forkA: Object.freeze({ x: 50, y: 62, r: 6 }),
  shopEntrance: Object.freeze({ x: 78, y: 63, r: 6 }),
  cafeEntrance: Object.freeze({ x: 68, y: 47, r: 6 }),
  fountain: Object.freeze({ x: 55, y: 55, r: 6 }),
  bridgeCrossing: Object.freeze({ x: 86, y: 34, r: 6 }),
  schoolEntrance: Object.freeze({ x: 50, y: 26, r: 6 }),
  towerBase: Object.freeze({ x: 76, y: 21, r: 8 }),
  paul: Object.freeze({ x: 10, y: 92, r: 6 }),
  seaSign: Object.freeze({ x: 80, y: 92, r: 6 }),
})

// NAV_SLOTS — §1.8 Explore/Friends 진입점(미구현, 아키텍처만). Friends는
// 월드 안 위치가 아니라 네비게이션 전용 슬롯(§1.8 "Not a world location").
export const NAV_SLOTS = Object.freeze({
  explore: Object.freeze({ kind: 'sign+nav', sign: Object.freeze([80, 92]) }),
  friends: Object.freeze({ kind: 'nav-only' }),
})

// DEPTH_BANDS — §1.5 깊이/스케일 구간 그대로.
export const DEPTH_BANDS = Object.freeze([
  Object.freeze({ maxY: 28, scale: Object.freeze([0.55, 0.65]) }),
  Object.freeze({ maxY: 45, scale: Object.freeze([0.70, 0.82]) }),
  Object.freeze({ maxY: 66, scale: Object.freeze([0.85, 1.00]) }),
  Object.freeze({ maxY: 100, scale: Object.freeze([1.00, 1.20]) }),
])

function normalizeLevel(level) {
  const n = Number(level)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function toXY(pt) {
  if (Array.isArray(pt)) return [Number(pt[0]) || 0, Number(pt[1]) || 0]
  if (pt && typeof pt === 'object') return [Number(pt.x) || 0, Number(pt.y) || 0]
  return [0, 0]
}

/** y(구간 maxY, [0.55,1.20] 범위)에 따른 오브젝트 스케일 — 구간 내 선형 보간. */
export function depthScale(y) {
  const clamped = Math.max(0, Math.min(100, Number(y) || 0))
  let minY = 0
  for (const band of DEPTH_BANDS) {
    if (clamped <= band.maxY) {
      const [s0, s1] = band.scale
      const span = band.maxY - minY
      const frac = span === 0 ? 1 : (clamped - minY) / span
      return s0 + (s1 - s0) * frac
    }
    minY = band.maxY
  }
  const last = DEPTH_BANDS[DEPTH_BANDS.length - 1]
  return last.scale[1]
}

/** 점 하나 - 선분 하나 최단거리(유클리드). */
function distPointToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = x0 + t * dx
  const cy = y0 + t * dy
  return Math.hypot(px - cx, py - cy)
}

/**
 * 점(pt: [x,y] 또는 {x,y}) - 폴리라인(각 항목 [x,y,...])의 최단거리.
 * 폴리라인이 비어있으면 Infinity, 점 하나뿐이면 그 점까지의 거리.
 */
export function distanceToPolyline(pt, polyline) {
  const [px, py] = toXY(pt)
  const poly = Array.isArray(polyline) ? polyline : []
  if (poly.length === 0) return Infinity
  if (poly.length === 1) return Math.hypot(px - poly[0][0], py - poly[0][1])
  let min = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[i + 1]
    min = Math.min(min, distPointToSegment(px, py, x0, y0, x1, y1))
  }
  return min
}

/** 폴리라인 정점 중 pt에 가장 가까운 정점의 width(세 번째 값)를 반환. */
function nearestVertexWidth(pt, polyline) {
  const [px, py] = toXY(pt)
  let best = null
  let bestDist = Infinity
  for (const v of polyline) {
    const d = Math.hypot(px - v[0], py - v[1])
    if (d < bestDist) { bestDist = d; best = v }
  }
  return best ? best[2] : 0
}

/** pt에서 가장 가까운 PATHS 가지(branch)와 거리/폭. */
export function nearestPath(pt) {
  let best = null
  for (const [branch, poly] of Object.entries(PATHS)) {
    const distance = distanceToPolyline(pt, poly)
    if (!best || distance < best.distance) {
      best = { branch, distance, width: nearestVertexWidth(pt, poly) }
    }
  }
  return best
}

// ---------------------------------------------------------------------
// 등방(isotropic) 거리 계산 — 2026-09-17 추가(placementContract.js 작업
// 중 발견된 단위 불일치 수정). WORLD은 x 0~100(가로 폭 %), y 0~100(세로
// 높이 %)이지만 실제 물리 종횡비는 100:190(WORLD.h/WORLD.w = 1.9) —
// 즉 y 1%는 x 1%보다 1.9배 더 긴 물리 거리다. distanceToPolyline/
// nearestPath(위)는 이 비율을 보정하지 않고 x/y를 같은 척도로 취급하는
// "raw" 버전으로, 기존 호출부(예: 이 파일 자신을 쓰는
// scripts/testTownWorldContract.mjs의 book-shop/강 클리어런스 검증)가
// 이미 그 raw 의미로 검증되어 있어 그대로 둔다(제거/변경 금지) — 대신
// 물리적으로 정확한 거리가 필요한 새 호출부(placementContract.js의
// path/river/fence/protected/셀 간격 판정)를 위해 "uniform" 버전을
// 별도로 추가한다. toUniform은 y만 ×(WORLD.h/WORLD.w)로 늘려 x와 같은
// 물리 척도로 맞춘 점을 반환하고, distanceToPolylineUniform/
// nearestPathUniform은 그 uniform 공간에서 유클리드 거리를 계산한다.
const Y_TO_X_RATIO = WORLD.h / WORLD.w

/** pt(=[x,y]|{x,y}) -> [x, y*(WORLD.h/WORLD.w)] — x와 같은 물리 척도로 맞춘 점. */
export function toUniform(pt) {
  const [x, y] = toXY(pt)
  return [x, y * Y_TO_X_RATIO]
}

/**
 * distanceToPolyline의 등방(isotropic) 버전 — pt/폴리라인 정점을 모두
 * toUniform으로 변환한 뒤 같은 점-선분 최단거리 계산을 적용한다. 반환값은
 * "물리적으로 정확한" 거리(uniform 단위, x-스케일과 동일)다.
 */
export function distanceToPolylineUniform(pt, polyline) {
  const [px, py] = toUniform(pt)
  const poly = Array.isArray(polyline) ? polyline : []
  if (poly.length === 0) return Infinity
  if (poly.length === 1) {
    const [qx, qy] = toUniform(poly[0])
    return Math.hypot(px - qx, py - qy)
  }
  let min = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, y0] = toUniform(poly[i])
    const [x1, y1] = toUniform(poly[i + 1])
    min = Math.min(min, distPointToSegment(px, py, x0, y0, x1, y1))
  }
  return min
}

/** nearestVertexWidth의 등방 버전 — 가장 가까운 정점을 uniform 거리 기준으로 고른다. */
function nearestVertexWidthUniform(pt, polyline) {
  const [px, py] = toUniform(pt)
  let best = null
  let bestDist = Infinity
  for (const v of polyline) {
    const [vx, vy] = toUniform(v)
    const d = Math.hypot(px - vx, py - vy)
    if (d < bestDist) { bestDist = d; best = v }
  }
  return best ? best[2] : 0
}

/** nearestPath의 등방 버전 — distance는 uniform 단위, width는 원래 폭(x-스케일) 그대로. */
export function nearestPathUniform(pt) {
  let best = null
  for (const [branch, poly] of Object.entries(PATHS)) {
    const distance = distanceToPolylineUniform(pt, poly)
    if (!best || distance < best.distance) {
      best = { branch, distance, width: nearestVertexWidthUniform(pt, poly) }
    }
  }
  return best
}

/** pt(=[x,y]|{x,y})가 REGIONS[id] 박스 안(경계 포함)인지. */
export function pointInRegion(pt, id) {
  const [px, py] = toXY(pt)
  const r = REGIONS[id]
  if (!r) return false
  return px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1
}

/** REGIONS[id]가 속한 district의 DISTRICTS[*].unlock(잠금해제 레벨). */
export function regionUnlockLevel(id) {
  const r = REGIONS[id]
  if (!r) return Infinity
  const d = DISTRICTS[r.district]
  return d ? d.unlock : Infinity
}

/** 그 레벨에서 리전이 보이는지 — districtsVisible(townScene.js)에 위임. */
export function regionVisibleAt(id, level) {
  const r = REGIONS[id]
  if (!r) return false
  return districtsVisible(level).includes(r.district)
}

/**
 * 랜드마크(LOTS id) 하나의 상태 — 'hidden'|'for-sale'|'built'.
 * townScene.js의 lotState()에 그대로 위임한다(재구현하지 않는다) — 이
 * 함수는 오직 id로 LOTS 엔트리를 찾아 넘기는 어댑터일 뿐이다.
 */
export function landmarkStateAt(id, level, ownedIds) {
  const lot = LOT_BY_ID[id]
  if (!lot) return 'hidden'
  return lotState(lot, level, ownedIds)
}

/**
 * 레벨 하나에 대한 전체 노출 상태 스냅샷.
 * @returns {{level:number, regions:Object<string,'open'|'locked'>,
 *   landmarks:Object<string,'hidden'|'for-sale'|'built'>, hints:string[]}}
 * hints는 아직 'hidden'인 랜드마크 id 목록(경로 입구에 실루엣+표지판을
 * 보여줘야 하는 대상, §4).
 */
export function revealAt(level, ownedIds = []) {
  const lvl = normalizeLevel(level)
  const regions = {}
  for (const id of Object.keys(REGIONS)) {
    regions[id] = regionVisibleAt(id, lvl) ? 'open' : 'locked'
  }
  const landmarks = {}
  const hints = []
  for (const lot of LOTS) {
    const state = landmarkStateAt(lot.id, lvl, ownedIds)
    landmarks[lot.id] = state
    if (state === 'hidden') hints.push(lot.id)
  }
  return { level: lvl, regions, landmarks, hints }
}

/** 누적 별(stars) -> revealAt(townLevelForStars(stars), ownedIds). */
export function revealForStars(stars, ownedIds) {
  return revealAt(townLevelForStars(stars), ownedIds)
}
