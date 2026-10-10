// src/utils/town/placementContract.js — Paul Town V2 47칸 배치(placement)
// 계약(순수 데이터 + 파생 함수, 2026-09-17).
//
// docs/design/town/analysis/anchor-collision-2026-09-17.md(47칸 콜리전
// 사전분석, 11/47만 clean)를 출발점으로, worldContract.js(동결된 월드
// 지오메트리)에 대해 "47칸 모두 clean"이 될 때까지 좌표를 조정한 최종
// 배치 계약이다. src/components/town/v2/*, townScene.js 등 기존 렌더러는
// 아직 이 모듈을 import하지 않는다(unshipped, 순수 준비 작업) — 셀 id
// (SPOT_MAP의 'x,y' 키)만 townScene.js와 정확히 일치시킬 뿐, 좌표/월드
// 위치/줌 메타데이터는 이 파일이 새로 정의한다(기존 SPOT_MAP의
// left/top/scale은 재사용하지 않는다 — 그것은 구 district-local 좌표계이고
// 이 파일은 worldContract.js의 새 0~100 world 좌표계를 쓴다).
//
// import는 ./worldContract와 ./townScene만 쓴다(React/DOM/fetch/
// localStorage/Math.random 없음, 순수·결정론).
import {
  WORLD, LANDMARKS, RIVER, RIVER_WIDTH, RIVER_BANK,
  GARDEN_FENCE, GARDEN_GATE, PROTECTED, DEPTH_BANDS,
  depthScale, regionUnlockLevel,
  toUniform, distanceToPolylineUniform, nearestPathUniform,
} from './worldContract'
import { SPOT_MAP } from './townScene'

// ---------------------------------------------------------------------
// OBJECT_CLASSES — 배치 가능한 오브젝트 종류별 발자국(footprint, world
// unit, scale=1 기준). 충돌 판정용 "베이스 박스"는 발자국 아래쪽
// h*0.45만큼만 쓴다(오브젝트는 바닥 정렬(bottom-anchored)이고, 실제로
// 땅을 차지하는 건 밑동뿐이라는 가정 — 나무/램프처럼 키 큰 오브젝트가
// 실제보다 훨씬 넓게 다른 배치를 막지 않도록).
// ---------------------------------------------------------------------
export const OBJECT_CLASSES = Object.freeze({
  tree: Object.freeze({ w: 12, h: 16 }),
  flower: Object.freeze({ w: 8, h: 5 }),
  bench: Object.freeze({ w: 12, h: 6 }),
  lamp: Object.freeze({ w: 5, h: 18 }),
  postbox: Object.freeze({ w: 5, h: 12 }),
  animal: Object.freeze({ w: 7, h: 6 }),
  decoration: Object.freeze({ w: 8, h: 8 }),
})

export const LARGE_CLASSES = Object.freeze(['tree', 'bench'])

// 대형 클래스(나무/벤치)는 이 8개 핵심 출입구/교차점 반경 10 unit 안에서는
// 무조건 배제한다 — collisionsFor의 protected 판정(반경 r, 셀 6~8)보다
// 넉넉한 여유 버퍼로, "기하학적으로 안 겹친다"와 "출입 동선을 시각적으로
// 막지 않는다"는 별개 요구라 협의된 명시적 큐레이션 규칙이다(반경 자체
// 판정과 무관하게 항상 적용).
const LARGE_CLASS_EXCLUSION_ANCHORS = Object.freeze([
  'door', 'gate', 'shopEntrance', 'cafeEntrance',
  'bridgeCrossing', 'schoolEntrance', 'towerBase', 'paul',
])

// riverApproach(리버뱅크) 셀의 잠금해제 레벨 — REGIONS.river의 district가
// 'river'(DISTRICTS.river.unlock === 6)라 regionUnlockLevel('river')과도
// 이미 일치하지만, docs/design/town/analysis/anchor-collision-2026-09-17.md
// 가 "river 리전 자체는 Lv1부터 배경으로 보이지만 기능적으로는 Lv6(다리/강
// 상호작용 잠금해제)"라고 명시적으로 가정(assumption)으로 플래그해 둔
// 값이라, 운영자 확인 전까지는 하드코딩 상수로 분리해 둔다(운영자가
// "river 셀은 Lv1부터도 가능"이라고 정정하면 이 상수 하나만 바꾸면 된다).
export const RIVER_CELLS_UNLOCK = 6

// zone -> 실제 위치가 속한 REGIONS id (cellUnlockLevel이 위임할 리전).
// hedgeEdge/villageLane은 브리프가 명시한 대로 별도 예산을 새로 만들지
// 않고 house-lawn/connector 예산에 포함된다 — hedgeEdge는 0칸(향후 house
// lawn 내부를 더 세분할 때 쓸 수 있도록 열거값만 남겨둠), villageLane이
// §5 "lawn connector" 5칸 전부를 담당한다.
const ZONE_REGION = Object.freeze({
  frontGarden: 'home',
  houseLawn: 'home',
  hedgeEdge: 'home',
  villageLane: 'connector',
  squarePerimeter: 'square',
  cafeEdge: 'cafe',
  shopSurround: 'shop',
  riverApproach: 'river',
  schoolLawn: 'school',
  towerGreen: 'tower',
  foregroundVerge: 'foreground',
})

// zone별 §5 배분(합계 47) — PAUL_TOWN_APPROVED_WORLD_DESIGN_2026-09-17.md
// §5 "front garden 10, house lawn 8, lawn connector 5, square ring 8,
// café edge 3, shop front 4, riverbank 3, school lawn 3, tower green 2,
// foreground verge 1 = 47"을 그대로 옮긴 것 — square ring은 zone
// 'squarePerimeter', shop front는 'shopSurround', riverbank는
// 'riverApproach', lawn connector는 'villageLane'으로 이름 붙였다.
export const ZONE_QUOTA = Object.freeze({
  frontGarden: 10,
  houseLawn: 8,
  villageLane: 5,
  squarePerimeter: 8,
  cafeEdge: 3,
  shopSurround: 4,
  riverApproach: 3,
  schoolLawn: 3,
  towerGreen: 2,
  foregroundVerge: 1,
})

// SPOT_MAP 키(townScene.js 진실 원천) 순서 그대로 47개 id를 가져온다 —
// 새 id를 발명하지 않고, SPOT_MAP이 바뀌어도(행/열 순서 유지 한) 이 순서가
// 자동으로 따라간다.
const CELL_IDS = Object.freeze(Object.keys(SPOT_MAP))

// RAW_PLACEMENTS — CELL_IDS와 같은 길이/순서로 zip될 (zone, x, y) 47개.
// x/y는 worldContract.js의 0~100 world 좌표계(REGIONS/LANDMARKS/PATHS와
// 동일 스케일). 좌표는 anchor-collision-2026-09-17.md의 47칸 위치를
// 출발점 삼되, y-x 물리 종횡비(WORLD.h/WORLD.w=1.9 — 아래 Y_RATIO)를
// 반영한 uniform 거리로 collisionsFor()가 그 zone의 대표 클래스에 대해
// 0건이 되도록, 그리고 가능한 한 자기 zone의 REGIONS 박스 안에 들도록
// 좌표 탐색(격자 탐색 + farthest-point 재배치)으로 조정한 최종 값이다
// (2026-09-17 2차 수정 — 최초 버전은 y를 x와 같은 척도로 잘못 취급해
// 랜드마크 박스가 실제보다 훨씬 크게 계산됐고, 그 결과 여러 칸이 자기
// zone 리전 밖으로 밀려났었다. Y_RATIO 보정 후 재도출) — 구역 배분(순서/
// 개수)은 §5 표와 동일하되, 개별 좌표는 "가능한 콜리전 0 + 자기 zone
// 리전 안"을 만족하도록 이 세션이 다시 도출했다(재설계가 아니라 재배치 —
// 지오메트리 자체(REGIONS/PATHS/LANDMARKS/PROTECTED/fence)는
// worldContract.js 값을 그대로 참조해 검증했을 뿐 바꾸지 않았다). 유일한
// 예외 1칸(villageLane의 5번째, 아래 목록 맨 끝) — PLACEMENT_CONTRACT_V1
// 문서의 "자기 zone 밖 예외" 섹션 참고.
const RAW_PLACEMENTS = Object.freeze([
  Object.freeze({ zone: 'frontGarden', x: 35.6, y: 65.8 }),
  Object.freeze({ zone: 'frontGarden', x: 2.8, y: 65.8 }),
  Object.freeze({ zone: 'frontGarden', x: 19.2, y: 65.2 }),
  Object.freeze({ zone: 'frontGarden', x: 34.6, y: 57.8 }),
  Object.freeze({ zone: 'frontGarden', x: 3.8, y: 57.2 }),
  Object.freeze({ zone: 'frontGarden', x: 20.2, y: 56.4 }),
  Object.freeze({ zone: 'frontGarden', x: 45.6, y: 52.8 }),
  Object.freeze({ zone: 'frontGarden', x: 2, y: 48.6 }),
  Object.freeze({ zone: 'frontGarden', x: 41.2, y: 45.8 }),
  Object.freeze({ zone: 'frontGarden', x: 45.8, y: 38.8 }),
  Object.freeze({ zone: 'houseLawn', x: 3.2, y: 36.2 }),
  Object.freeze({ zone: 'houseLawn', x: 20.4, y: 32.4 }),
  Object.freeze({ zone: 'houseLawn', x: 33.6, y: 32.4 }),
  Object.freeze({ zone: 'houseLawn', x: 8.4, y: 30 }),
  Object.freeze({ zone: 'houseLawn', x: 45.8, y: 29.8 }),
  Object.freeze({ zone: 'houseLawn', x: 32, y: 24.8 }),
  Object.freeze({ zone: 'houseLawn', x: 17, y: 24.4 }),
  Object.freeze({ zone: 'houseLawn', x: 2, y: 24 }),
  Object.freeze({ zone: 'villageLane', x: 56, y: 70 }),
  Object.freeze({ zone: 'villageLane', x: 58, y: 60.25 }),
  Object.freeze({ zone: 'villageLane', x: 46.2, y: 59 }),
  Object.freeze({ zone: 'villageLane', x: 49.4, y: 56.15 }),
  Object.freeze({ zone: 'villageLane', x: 42.65, y: 68.1 }),
  Object.freeze({ zone: 'squarePerimeter', x: 64.6, y: 55.2 }),
  Object.freeze({ zone: 'squarePerimeter', x: 54.2, y: 43 }),
  Object.freeze({ zone: 'squarePerimeter', x: 50.4, y: 48 }),
  Object.freeze({ zone: 'squarePerimeter', x: 64.8, y: 63.8 }),
  Object.freeze({ zone: 'squarePerimeter', x: 46.4, y: 42.8 }),
  Object.freeze({ zone: 'squarePerimeter', x: 41.6, y: 49.6 }),
  Object.freeze({ zone: 'squarePerimeter', x: 65, y: 59 }),
  Object.freeze({ zone: 'squarePerimeter', x: 52, y: 40 }),
  Object.freeze({ zone: 'cafeEdge', x: 78, y: 48.1 }),
  Object.freeze({ zone: 'cafeEdge', x: 60.5, y: 48.1 }),
  Object.freeze({ zone: 'cafeEdge', x: 70.4, y: 49.9 }),
  Object.freeze({ zone: 'shopSurround', x: 80.4, y: 65.9 }),
  Object.freeze({ zone: 'shopSurround', x: 84.3, y: 46 }),
  Object.freeze({ zone: 'shopSurround', x: 81.4, y: 50.8 }),
  Object.freeze({ zone: 'shopSurround', x: 87.1, y: 64.2 }),
  Object.freeze({ zone: 'riverApproach', x: 100, y: 12 }),
  Object.freeze({ zone: 'riverApproach', x: 87.5, y: 89.75 }),
  Object.freeze({ zone: 'riverApproach', x: 80.5, y: 27.25 }),
  Object.freeze({ zone: 'schoolLawn', x: 62.2, y: 8 }),
  Object.freeze({ zone: 'schoolLawn', x: 28, y: 8 }),
  Object.freeze({ zone: 'schoolLawn', x: 62.4, y: 20 }),
  Object.freeze({ zone: 'towerGreen', x: 84, y: 6 }),
  Object.freeze({ zone: 'towerGreen', x: 84, y: 17.2 }),
  Object.freeze({ zone: 'foregroundVerge', x: 14.75, y: 94 }),
])

function depthClassForY(y) {
  const n = Number(y) || 0
  if (n <= DEPTH_BANDS[0].maxY) return 'background'
  if (n <= DEPTH_BANDS[1].maxY) return 'midBack'
  if (n <= DEPTH_BANDS[2].maxY) return 'mid'
  return 'foreground'
}

// WORLD은 x 0~100(가로 %), y 0~100(세로 %)이지만 실제 물리 종횡비는
// 100:190(WORLD.h/WORLD.w = 1.9) — y 1%가 x 1%보다 1.9배 더 긴 물리
// 거리다(2026-09-17 단위 버그 수정 — 최초 구현은 x/y를 같은 척도로
// 취급했었다). 이 모듈의 모든 박스 높이/거리 판정은 "uniform 단위"(x와
// 같은 물리 척도)로 계산한다 — worldContract.js의 toUniform/
// distanceToPolylineUniform/nearestPathUniform(2026-09-17 추가 export)에
// 위임하고, 여기서는 재구현하지 않는다.
const Y_RATIO = WORLD.h / WORLD.w

/**
 * (x1,y1)-(x2,y2)의 등방(uniform) 유클리드 거리 — worldContract.js의
 * toUniform(둘 다 x-스케일로 맞춘 점)으로 변환한 뒤 잰다(재구현하지
 * 않는다, y 보정 로직의 유일한 원천은 toUniform).
 */
function uniformDist(x1, y1, x2, y2) {
  const [ux1, uy1] = toUniform([x1, y1])
  const [ux2, uy2] = toUniform([x2, y2])
  return Math.hypot(ux1 - ux2, uy1 - uy2)
}

function landmarkBox(landmark) {
  // "anchor bottom-center, w, h = w*hFactor, shrink 4%/side" — w/h는 모두
  // x-스케일(물리) 값이다. h를 y0/y1(y-percent) 계산에 쓰려면 Y_RATIO로
  // 나눠 y-percent 스케일로 환산해야 한다(4%/side 축소는 폭/높이 각각
  // 8%(양쪽 4%씩) 줄이는 것과 같다 — 물리 스케일에서 먼저 축소한 뒤 변환해도
  // y-percent에서 먼저 변환한 뒤 축소해도 결과는 같다, 스칼라 곱의 교환).
  const w = landmark.w * 0.92
  const hPhysical = landmark.w * landmark.hFactor * 0.92
  const h = hPhysical / Y_RATIO
  return { x0: landmark.x - w / 2, x1: landmark.x + w / 2, y0: landmark.y - h, y1: landmark.y }
}

function footprintBox(x, y, objectClass, scale) {
  const fp = OBJECT_CLASSES[objectClass]
  if (!fp) return null
  const w = fp.w * scale
  const hPhysical = fp.h * 0.45 * scale
  const h = hPhysical / Y_RATIO
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y }
}

function boxesOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

function overlapArea(a, b) {
  const ow = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
  const oh = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  return ow * oh
}

function toXY(pt) {
  if (Array.isArray(pt)) return [Number(pt[0]) || 0, Number(pt[1]) || 0]
  if (pt && typeof pt === 'object') return [Number(pt.x) || 0, Number(pt.y) || 0]
  return [0, 0]
}

/**
 * collisionsFor()의 실제 계산부. cellsList(이웃-셀 판정 대상)를 인자로
 * 받는 내부 헬퍼로 분리해 둔 이유: buildCells()가 CELLS(모듈 export,
 * 아직 생성 중)를 참조하지 않고도 "임시 얕은 셀 목록"을 대상으로 같은
 * 로직을 재사용할 수 있게 하기 위해서다(달걀-닭 문제를 mutable 전역
 * 대신 함수 인자로 푼다).
 */
function computeCollisions(x, y, scale, objectClass, cellsList, selfId) {
  const out = []

  if (y > 95) out.push({ kind: 'nav', with: 'bottom-nav', overlap: y - 95 })

  const np = nearestPathUniform([x, y])
  const pathThreshold = np.width / 2 + 1.5
  if (np.distance < pathThreshold) {
    out.push({ kind: 'path', with: np.branch, overlap: pathThreshold - np.distance })
  }

  const riverDist = distanceToPolylineUniform([x, y], RIVER)
  const riverThreshold = RIVER_WIDTH / 2 + RIVER_BANK
  if (riverDist < riverThreshold) {
    out.push({ kind: 'river', with: 'river', overlap: riverThreshold - riverDist })
  }

  const gateDist = uniformDist(x, y, GARDEN_GATE[0], GARDEN_GATE[1])
  if (gateDist > 3) {
    const fenceDist = distanceToPolylineUniform([x, y], GARDEN_FENCE)
    if (fenceDist < 1.5) out.push({ kind: 'fence', with: 'garden-fence', overlap: 1.5 - fenceDist })
  }

  for (const key of Object.keys(PROTECTED)) {
    const p = PROTECTED[key]
    const d = uniformDist(x, y, p.x, p.y)
    if (d < p.r) out.push({ kind: 'protected', with: key, overlap: p.r - d })
  }

  if (OBJECT_CLASSES[objectClass]) {
    const box = footprintBox(x, y, objectClass, scale)
    for (const id of Object.keys(LANDMARKS)) {
      const lb = landmarkBox(LANDMARKS[id])
      if (boxesOverlap(box, lb)) out.push({ kind: 'landmark', with: id, overlap: overlapArea(box, lb) })
    }
    for (const other of Array.isArray(cellsList) ? cellsList : []) {
      if (!other) continue
      if (selfId && other.id === selfId) continue
      if (!selfId && other.x === x && other.y === y) continue
      const otherScale = Number.isFinite(other.scale) ? other.scale : depthScale(other.y)
      // 이웃 셀도 같은 objectClass를 놓는다고 가정(대칭·보수적 판정) —
      // "이 클래스 하나로 두 앵커를 동시에 채울 수 있는가"를 묻는 것이지,
      // 실제로 서로 다른 클래스가 배치될 미래를 예측하지 않는다.
      const otherBox = footprintBox(other.x, other.y, objectClass, otherScale)
      if (boxesOverlap(box, otherBox)) {
        out.push({ kind: 'cell', with: other.id || `${other.x},${other.y}`, overlap: overlapArea(box, otherBox) })
      }
    }
  }

  return out
}

/**
 * cell(=등록된 CELLS 엔트리 또는 {x,y} 임의 점) + objectClass 하나에 대한
 * 충돌 목록. path/river/fence/protected/nav는 objectClass와 무관한 점
 * 기반 판정(발자국 크기를 타지 않음)이고, landmark/cell(이웃 셀)만
 * objectClass의 발자국 박스 크기에 따라 달라진다. objectClass가
 * OBJECT_CLASSES에 없으면 landmark/cell 판정은 건너뛴다(점 기반 판정만
 * 수행) — 알 수 없는 클래스에도 크래시하지 않는다.
 * @returns {Array<{kind:string, with:string, overlap:number}>}
 */
export function collisionsFor(cell, objectClass) {
  const [x, y] = toXY(cell)
  const scale = Number.isFinite(cell && cell.scale) ? cell.scale : depthScale(y)
  return computeCollisions(x, y, scale, objectClass, CELLS, cell && cell.id)
}

function nearLargeClassExclusionAnchor(x, y) {
  return LARGE_CLASS_EXCLUSION_ANCHORS.some((key) => {
    const p = PROTECTED[key]
    return p && uniformDist(x, y, p.x, p.y) < 10
  })
}

function buildCells() {
  if (RAW_PLACEMENTS.length !== CELL_IDS.length) {
    throw new Error(`placementContract: RAW_PLACEMENTS(${RAW_PLACEMENTS.length}) !== CELL_IDS(${CELL_IDS.length})`)
  }
  // 1단계 — id/x/y/zone/depthClass/scale만 가진 "얕은" 셀 목록(이웃-셀
  // 콜리전 판정에서 서로를 참조하기 위해 먼저 존재해야 한다).
  const shallow = RAW_PLACEMENTS.map((raw, i) => ({
    id: CELL_IDS[i],
    x: raw.x,
    y: raw.y,
    zone: raw.zone,
    depthClass: depthClassForY(raw.y),
    scale: depthScale(raw.y),
  }))

  return shallow.map((cell) => {
    const recommended = []
    const exclusions = []
    for (const cls of Object.keys(OBJECT_CLASSES)) {
      const collisions = computeCollisions(cell.x, cell.y, cell.scale, cls, shallow, cell.id)
      if (collisions.length === 0) recommended.push(cls)
      else exclusions.push(cls)
    }
    if (nearLargeClassExclusionAnchor(cell.x, cell.y)) {
      for (const cls of LARGE_CLASSES) {
        const ri = recommended.indexOf(cls)
        if (ri >= 0) recommended.splice(ri, 1)
        if (!exclusions.includes(cls)) exclusions.push(cls)
      }
    }
    return Object.freeze({
      ...cell,
      recommended: Object.freeze(recommended),
      exclusions: Object.freeze(exclusions),
    })
  })
}

export const CELLS = Object.freeze(buildCells())

export const CELL_BY_ID = Object.freeze(
  CELLS.reduce((acc, cell) => { acc[cell.id] = cell; return acc }, {}),
)

/** zone에 속한 CELLS 부분집합(원본과 같은 순서). */
export function cellsInZone(zone) {
  return CELLS.filter((c) => c.zone === zone)
}

/**
 * cell(CELLS 엔트리)의 잠금해제 레벨. squarePerimeter는 스펙대로 Lv1
 * 예외(§5 "Lv5 region; usable from Lv1 as lawn"), riverApproach는
 * RIVER_CELLS_UNLOCK(운영자 확인 대기), 그 외는 zone -> REGIONS
 * 매핑(ZONE_REGION)을 거쳐 regionUnlockLevel()에 위임한다(재구현하지
 * 않는다 — townScene.js DISTRICTS[*].unlock이 유일한 잠금해제 레벨
 * 진실 원천).
 */
export function cellUnlockLevel(cell) {
  if (!cell || !cell.zone) return Infinity
  if (cell.zone === 'squarePerimeter') return 1
  if (cell.zone === 'riverApproach') return RIVER_CELLS_UNLOCK
  const regionId = ZONE_REGION[cell.zone]
  return regionId ? regionUnlockLevel(regionId) : Infinity
}

/**
 * cellId + objectClass + level 조합이 배치 가능한지. 잠금(레벨 미달),
 * 배제(cell.exclusions), 충돌(collisionsFor) 세 가지를 모두 확인한다.
 * @returns {{ok:boolean, reasons:string[]}}
 */
export function isPlacementAllowed(cellId, objectClass, level) {
  const reasons = []
  const cell = CELL_BY_ID[cellId]
  if (!cell) { reasons.push('unknown-cell'); return { ok: false, reasons } }
  if (!OBJECT_CLASSES[objectClass]) { reasons.push('unknown-class'); return { ok: false, reasons } }

  const lvl = Number.isFinite(Number(level)) ? Number(level) : 1
  if (lvl < cellUnlockLevel(cell)) reasons.push('locked')
  if (cell.exclusions.includes(objectClass)) reasons.push('excluded')
  if (collisionsFor(cell, objectClass).length > 0) reasons.push('collision')

  return { ok: reasons.length === 0, reasons }
}

/**
 * 배치 모드에 따른 앵커 마커 노출 스타일 — 향후 배치 오버레이 UI 계약.
 * 'idle'(평소 마을 화면)은 격자/점/박스 등 어떤 시각적 마커도 없다
 * ('none') — 배치/이동 모드('placing'|'moving')에서만 바닥에 은은한
 * 글로우('ground-glow')로 앵커를 보여준다. 알 수 없는 mode는 안전하게
 * 'none'.
 */
export function visibleMarkerStyle(mode) {
  if (mode === 'placing' || mode === 'moving') return 'ground-glow'
  return 'none'
}
