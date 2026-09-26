// src/utils/town/proto2_5d/pathfinding.js — Paul Town 2.5D 캐릭터 프로토타입
// (Stage 2, 2026-09-22) 격자 기반 경로 탐색.
//
// 순수 함수만(React/DOM 없음, 새 의존성 0개 — 이 저장소에 경로탐색
// 라이브러리가 전혀 없어 처음부터 직접 구현한다, CLAUDE.md 규칙 6).
//
// BFS(너비 우선 탐색)를 선택했다(A*가 아님) — 이유: (1) 격자가 최대
// 40x76=3040칸으로 작아 휴리스틱 가속이 사실상 무의미하고, (2) 이 단계의
// 요구사항이 "예쁜 최단거리"가 아니라 "장애물을 절대 통과하지 않는
// 결정론적 경로"이므로 휴리스틱 튜닝이 필요 없는 가장 단순한 알고리즘이
// 요구사항에 더 잘 맞는다(BFS는 균일 비용 격자에서 hop 수 기준 최단경로를
// 튜닝 없이 보장한다), (3) BFS는 매 실행마다 정확히 같은 순서로 셀을
// 방문하므로(고정 이웃 순서 + FIFO 큐, Math.random/타이밍 의존 없음)
// 동일 입력 -> 동일 경로가 알고리즘 구조 자체로 보장된다(팀장 요구사항8).
//
// 8방향(대각선 포함) 이동을 허용하되 "코너 컷팅"은 금지한다 — 대각선
// 이동은 그 대각선이 지나가는 두 직교 이웃 셀도 모두 걸을 수 있어야만
// 허용된다. 이렇게 해야 장애물 모서리를 대각선으로 스치듯 통과하는
// 시각적 버그 없이도, 4방향 전용보다 훨씬 짧고 자연스러운 경로가
// 나온다(4방향 전용은 대각선 이동 하나를 "위 한 칸 + 오른쪽 한 칸"처럼
// 지그재그로 풀어야 해서 장애물이 전혀 없는 평범한 대각선 탭에도
// 웨이포인트가 수십 개로 늘어나 애니메이션이 비정상적으로 느려진다).
//
// 원시 BFS 셀 경로는 이웃 순서에 따라 지그재그일 수 있어(hop 수는 항상
// 최소지만 "직선 구간"이 우연히 쪼개질 수 있음), 이후 그리디 line-of-sight
// 단순화("string pulling")로 실제 애니메이션에 쓸 웨이포인트 수를 최소화한다
// — 장애물이 전혀 없는 구간에서는 결과가 웨이포인트 1개(시작->도착 직선)로
// 수렴해 Stage 1의 단일 전이(walkTo) 체감과 사실상 동일해진다.
import {
  OBSTACLES,
  WORLD_MIN,
  WORLD_MAX,
  isWalkableCell,
  worldToCell,
  cellToWorldPoint,
  nearestWalkablePoint,
} from './walkGrid'

// 이웃 순서 고정(결정론) — 직교 4방향을 먼저, 대각선 4방향을 나중에 시도.
const DIRS = Object.freeze([
  Object.freeze({ dc: 0, dr: -1 }), // 위
  Object.freeze({ dc: 0, dr: 1 }), // 아래
  Object.freeze({ dc: -1, dr: 0 }), // 왼쪽
  Object.freeze({ dc: 1, dr: 0 }), // 오른쪽
  Object.freeze({ dc: -1, dr: -1 }), // 왼쪽-위
  Object.freeze({ dc: 1, dr: -1 }), // 오른쪽-위
  Object.freeze({ dc: -1, dr: 1 }), // 왼쪽-아래
  Object.freeze({ dc: 1, dr: 1 }), // 오른쪽-아래
])

/**
 * startCell에서 endCell까지 BFS(8방향, 코너 컷팅 금지). 반환은 startCell을
 * 제외한 셀 목록([{col,row}, ...], endCell 포함) — 도달 불가면 null.
 */
function bfsCellPath(startCell, endCell, obstacles) {
  const key = (c, r) => `${c},${r}`
  const visited = new Set([key(startCell.col, startCell.row)])
  const queue = [{ col: startCell.col, row: startCell.row, path: [] }]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head]
    head += 1
    for (const { dc, dr } of DIRS) {
      const nc = cur.col + dc
      const nr = cur.row + dr
      const k = key(nc, nr)
      if (visited.has(k)) continue
      if (!isWalkableCell(nc, nr, obstacles)) continue
      if (dc !== 0 && dr !== 0) {
        // 코너 컷팅 금지 — 대각선이 스치는 두 직교 이웃도 걸을 수 있어야 함.
        if (!isWalkableCell(cur.col + dc, cur.row, obstacles)) continue
        if (!isWalkableCell(cur.col, cur.row + dr, obstacles)) continue
      }
      visited.add(k)
      const nextPath = [...cur.path, { col: nc, row: nr }]
      if (nc === endCell.col && nr === endCell.row) return nextPath
      queue.push({ col: nc, row: nr, path: nextPath })
    }
  }
  return null
}

// 부동소수점 비교 여유(EPS) — 세그먼트-사각형 클리핑 결과 구간 [t0,t1]이
// "점 하나 수준으로만" 겹치는지(경계 접촉) 판정할 때만 쓴다.
const SEG_TOUCH_EPS = 1e-9

/**
 * 선분 (from -> to)이 사각형(rect: {x0,x1,y0,y1}, closed)의 "내부에
 * 엄격히"(경계선 접촉/통과는 제외) 들어가는 구간이 존재하는지 — 표준
 * Liang-Barsky 슬랩(slab) 클리핑으로 선분을 사각형(닫힌 영역)에 대해
 * 파라미터 구간 [t0,t1] ⊆ [0,1]로 정확히 클리핑한 뒤(점 샘플링이 아니라
 * 대수적으로 정확한 교차 계산 — 아무리 좁은 침입이라도 샘플 간격에
 * 걸러지지 않는다), 그 구간이 한 점보다 넓으면(t1-t0 > EPS) 구간 중점이
 * 실제로 사각형 내부에 "엄격히" 있는지 확인한다(선분이 사각형의 변 위를
 * 정확히 따라가는 퇴화 케이스 — 예: 수평선이 y=rect.y0 위를 그대로 지나는
 * 경우 — 클리핑 구간은 non-degenerate로 나오지만 그 구간의 모든 점이
 * 경계선 위일 뿐 내부가 아니므로, 중점 좌표로 직접 "엄격히 내부"인지
 * 재확인해 이런 경계-접촉 퇴화 케이스를 침입으로 오판하지 않는다).
 */
function segmentEntersRectInterior(from, to, rect) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  let t0 = 0
  let t1 = 1
  // 한 축을 [lo,hi] 슬랩에 대해 클리핑 — d===0(그 축과 평행)이면 시작점
  // 좌표가 이미 슬랩 안인지만 확인(그 축은 t와 무관하게 항상 참/거짓).
  const clipAxis = (p, d, lo, hi) => {
    if (d === 0) return p >= lo && p <= hi
    let ta = (lo - p) / d
    let tb = (hi - p) / d
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp }
    if (ta > t0) t0 = ta
    if (tb < t1) t1 = tb
    return t0 <= t1
  }
  if (!clipAxis(from.x, dx, rect.x0, rect.x1)) return false
  if (!clipAxis(from.y, dy, rect.y0, rect.y1)) return false
  if (t0 > t1) return false
  if (t1 - t0 <= SEG_TOUCH_EPS) return false // 점 하나 수준의 접촉만 — 내부 침입 아님
  const tm = (t0 + t1) / 2
  const mx = from.x + dx * tm
  const my = from.y + dy * tm
  return mx > rect.x0 && mx < rect.x1 && my > rect.y0 && my < rect.y1
}

/**
 * fromPoint -> toPoint 직선(WORLD-% 좌표 공간, 셀 공간이 아님)이 world
 * 경계 안에서 어떤 장애물도 침입하지 않는지 확인한다 — 점 샘플링이 아니라
 * 대수적으로 정확한 선분-사각형 교차 계산(segmentEntersRectInterior)을
 * 쓴다.
 *
 * (2026-09-25, Stage 5 스트레스 테스트로 실측 발견한 버그 수정 — 1차 시도
 * 후 2차 정정) 최초 버그는: 이 체크가 격자-셀 인덱스 공간에서만 이뤄졌다
 * (fromCell/toCell을 정수 (col,row)로 반올림한 뒤 그 사이를 보간) — 그런데
 * 실제 시작/도착점은 nearestWalkablePoint가 "걸을 수 있으면 원래 좌표를
 * 그대로 보존"하므로 셀 중심에 스냅되지 않은 정확한 world 좌표일 수 있다
 * (walkGrid.js nearestWalkablePoint 주석 "격자 중심으로 스냅하지 않음"
 * 그대로). 즉 string-pulling이 "시작 셀의 정수 좌표"를 기준으로 시야를
 * 검증했지만, 실제로 캐릭터가 걷는 첫 구간은 "정확한(셀 중심이 아닌)
 * 시작점"에서 출발했다(예: 시드 20260925+1 스트레스 994번 쌍,
 * tree-plaza-ne 장애물을 첫 구간이 ~0.3 world-% 침범).
 *
 * 1차 정정에서는 셀 인덱스를 거치지 않고 world 좌표를 직접 고정 간격
 * (0.2 world-%)으로 점 샘플링했는데, 실측(시드 20260925, pair#38)으로
 * 또 다른 회귀가 드러났다 — 두 cell-center 웨이포인트 사이의 대각선
 * 직선이 장애물 모서리를 깊이 ≈0.03 world-%(샘플 간격 0.2보다 좁음)로
 * 살짝 스치는 경우, 고정 간격 샘플이 그 좁은 침입 구간을 건너뛰어
 * "시야 뚫림"으로 오판했다 — "샘플 간격보다 얕은 침입은 원리적으로 항상
 * 놓칠 수 있다"는 점 샘플링 자체의 구조적 한계다. 최종 해법은 샘플 간격을
 * 더 좁히는 미봉책이 아니라, 애초에 점 샘플링을 쓰지 않고 선분-사각형
 * 교차를 대수적으로 정확히 계산하는 것 — 침입 폭이 아무리 좁아도(심지어
 * 부동소수점 정밀도 한계까지) 놓치지 않는다.
 */
function hasLineOfSightWorld(fromPoint, toPoint, obstacles) {
  // world 경계 — [WORLD_MIN,WORLD_MAX]^2는 볼록 영역이고 두 끝점이 항상 그
  // 안에 있으므로(nearestWalkablePoint가 clamp 보장), 직선 위 x/y의
  // 극값은 항상 두 끝점에서 나온다(선형 보간이므로) — 샘플링 없이 끝점
  // min/max만으로 경계 이탈 여부를 정확히 판정할 수 있다.
  const minX = Math.min(fromPoint.x, toPoint.x)
  const maxX = Math.max(fromPoint.x, toPoint.x)
  const minY = Math.min(fromPoint.y, toPoint.y)
  const maxY = Math.max(fromPoint.y, toPoint.y)
  if (minX < WORLD_MIN || maxX > WORLD_MAX || minY < WORLD_MIN || maxY > WORLD_MAX) return false
  for (const ob of obstacles) {
    if (segmentEntersRectInterior(fromPoint, toPoint, ob)) return false
  }
  return true
}

/**
 * 그리디 string-pulling(WORLD 좌표 공간) — worldPoints[0](정확한 보정
 * 시작점)에서 출발해, 현재 웨이포인트에서 직선 시야(hasLineOfSightWorld)가
 * 닿는 가장 먼 점으로 곧장 점프한다. 남은 경로 전체를 끝까지 스캔해
 * "시야가 닿는 가장 먼 인덱스"를 찾는다(첫 실패에서 멈추지 않는다) — 원시
 * BFS 경로는 지그재그일 수 있어, 경로 중간의 곁가지 점 하나에 대한 시야가
 * 막혔다고 그 뒤에 있는(그러나 시작점에서는 직선으로 훤히 보이는) 더 먼
 * 점까지 시야가 막혔다고 오판하면 안 된다(이 세션이 최초 구현에서 "첫
 * 실패 시 break"로 짜서 실측으로 발견한 회귀 — 장애물이 전혀 없는
 * 구간에서도 불필요한 우회 웨이포인트가 생겼다, 유닛 테스트로 재현 후
 * 전체 스캔 방식으로 고쳤다). 전역 최소 웨이포인트 수를 수학적으로
 * 보장하지는 않지만 결정론적이고(같은 입력 -> 같은 단순화) 격자가 작아
 * 계산 비용도 무시할 만하며, 장애물이 없는 구간은 항상 단일 웨이포인트로
 * 수렴한다. worldPoints[0](시작점) 자체는 절대 반환하지 않는다(anchor가
 * 0에서 시작해 반환값은 항상 index>=1).
 */
function simplifyWorldPath(worldPoints, obstacles) {
  const waypoints = []
  let anchor = 0
  while (anchor < worldPoints.length - 1) {
    let farthest = anchor + 1
    for (let i = anchor + 2; i < worldPoints.length; i++) {
      if (hasLineOfSightWorld(worldPoints[anchor], worldPoints[i], obstacles)) farthest = i
    }
    waypoints.push(worldPoints[farthest])
    anchor = farthest
  }
  return waypoints
}

/**
 * start(world-% {x,y})에서 end(world-% {x,y})까지의 경로.
 *
 * - start/end 둘 다 먼저 nearestWalkablePoint로 보정한다(clamp + 장애물
 *   보정, walkGrid.js에 위임 — 이 함수가 다시 구현하지 않는다).
 * - 같은 셀로 귀결되면 보정된 end 좌표 그대로 웨이포인트 1개.
 * - 그 외엔 BFS로 셀 경로를 구하고(도달 불가면 null), 그 경로를 WORLD 좌표
 *   점 목록(정확한 보정 시작점 + 중간 셀들의 중심 + 정확한 보정 도착점)으로
 *   바꾼 뒤 string-pulling으로 단순화한다(중간 웨이포인트는 셀 중심 좌표라도
 *   무방 — 라우팅 용도일 뿐 정밀 착지 지점이 아니다; 시작/도착 좌표만 픽셀
 *   단위 정밀도가 필요하다 — 그래서 simplifyWorldPath 자체가 처음부터
 *   정확한 시작/도착 좌표를 놓고 시야를 검증한다, hasLineOfSightWorld 주석
 *   참고 — 셀 인덱스 공간에서 검증하고 나중에 끝만 정확한 좌표로 바꿔치기
 *   하면 검증되지 않은 구간이 생긴다는 것이 바로 2026-09-25에 고친 버그).
 * - obstacles 인자는 프로덕션에서는 항상 기본값(OBSTACLES)을 쓴다 — 유닛
 *   테스트가 "완전히 막힌 목적지" 같은 병적 시나리오를 커스텀 장애물
 *   집합으로 재현할 수 있도록만 열어둔 매개변수.
 *
 * @returns {Array<{x:number,y:number}>|null} 웨이포인트 목록(순서대로
 *   따라 걸으면 됨) 또는 경로 없음(null).
 */
export function findPath(start, end, obstacles = OBSTACLES) {
  const correctedStart = nearestWalkablePoint(start.x, start.y, obstacles)
  const correctedEnd = nearestWalkablePoint(end.x, end.y, obstacles)
  const startCell = worldToCell(correctedStart.x, correctedStart.y)
  const endCell = worldToCell(correctedEnd.x, correctedEnd.y)

  if (!isWalkableCell(startCell.col, startCell.row, obstacles)) return null
  if (!isWalkableCell(endCell.col, endCell.row, obstacles)) return null
  if (startCell.col === endCell.col && startCell.row === endCell.row) return [correctedEnd]

  const rawCellPath = bfsCellPath(startCell, endCell, obstacles)
  if (!rawCellPath || rawCellPath.length === 0) return null

  // rawCellPath의 마지막 원소는 endCell이다 — 그 셀 중심 좌표 대신
  // correctedEnd(정확한 도착점)를 world 점 목록의 마지막 원소로 직접
  // 쓴다(중간 셀만 cellToWorldPoint로 중심점 변환).
  const intermediateCells = rawCellPath.slice(0, -1)
  const worldPoints = [
    correctedStart,
    ...intermediateCells.map(({ col, row }) => cellToWorldPoint(col, row)),
    correctedEnd,
  ]
  return simplifyWorldPath(worldPoints, obstacles)
}
