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

/**
 * fromCell -> toCell 직선(격자 공간)이 전부 걸을 수 있는 칸을 지나는지 —
 * 코너 컷팅 금지 규칙도 동일하게 적용한다. steps = max(|dCol|,|dRow|)만큼
 * 선형보간 후 반올림(항상 같은 계산 순서 -> 결정론).
 */
function hasLineOfSight(fromCell, toCell, obstacles) {
  const dc = toCell.col - fromCell.col
  const dr = toCell.row - fromCell.row
  const steps = Math.max(Math.abs(dc), Math.abs(dr))
  if (steps === 0) return true
  let prevCol = fromCell.col
  let prevRow = fromCell.row
  for (let i = 1; i <= steps; i++) {
    const col = Math.round(fromCell.col + (dc * i) / steps)
    const row = Math.round(fromCell.row + (dr * i) / steps)
    if (!isWalkableCell(col, row, obstacles)) return false
    const stepDc = col - prevCol
    const stepDr = row - prevRow
    if (stepDc !== 0 && stepDr !== 0) {
      if (!isWalkableCell(prevCol + stepDc, prevRow, obstacles)) return false
      if (!isWalkableCell(prevCol, prevRow + stepDr, obstacles)) return false
    }
    prevCol = col
    prevRow = row
  }
  return true
}

/**
 * 그리디 string-pulling — startCell에서 출발해, 현재 웨이포인트에서 직선
 * 시야(hasLineOfSight)가 닿는 가장 먼 셀로 곧장 점프한다. 남은 경로 전체를
 * 끝까지 스캔해 "시야가 닿는 가장 먼 인덱스"를 찾는다(첫 실패에서 멈추지
 * 않는다) — 원시 BFS 경로는 지그재그일 수 있어, 경로 중간의 곁가지 셀
 * 하나에 대한 시야가 막혔다고 그 뒤에 있는(그러나 시작점에서는 직선으로
 * 훤히 보이는) 더 먼 셀까지 시야가 막혔다고 오판하면 안 된다(이 세션이
 * 최초 구현에서 "첫 실패 시 break"로 짜서 실측으로 발견한 회귀 — 장애물이
 * 전혀 없는 구간에서도 불필요한 우회 웨이포인트가 생겼다, 유닛 테스트로
 * 재현 후 전체 스캔 방식으로 고쳤다). 전역 최소 웨이포인트 수를 수학적으로
 * 보장하지는 않지만 결정론적이고(같은 경로 -> 같은 단순화) 계산이
 * 빠르며(격자가 작아 O(경로 길이^2) 스캔도 무시할 비용), 장애물이 없는
 * 구간은 항상 단일 웨이포인트로 수렴한다.
 */
function simplifyCellPath(startCell, fullPath, obstacles) {
  const cells = [startCell, ...fullPath]
  const waypoints = []
  let anchor = 0
  while (anchor < cells.length - 1) {
    let farthest = anchor + 1
    for (let i = anchor + 2; i < cells.length; i++) {
      if (hasLineOfSight(cells[anchor], cells[i], obstacles)) farthest = i
    }
    waypoints.push(cells[farthest])
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
 * - 그 외엔 BFS로 셀 경로를 구하고(도달 불가면 null), string-pulling으로
 *   단순화한 뒤, 마지막 웨이포인트만 보정된 end의 정확한 좌표로 교체한다
 *   (중간 웨이포인트는 셀 중심 좌표라도 무방 — 라우팅 용도일 뿐 정밀 착지
 *   지점이 아니다; 마지막 좌표만 픽셀 단위 정밀도가 필요하다).
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

  const simplifiedCells = simplifyCellPath(startCell, rawCellPath, obstacles)
  const waypoints = simplifiedCells.map(({ col, row }) => cellToWorldPoint(col, row))
  waypoints[waypoints.length - 1] = correctedEnd
  return waypoints
}
