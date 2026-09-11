// src/utils/town/townLayout.js — Paul Town V1 배치 그리드(순수 도메인,
// 2026-09-11).
//
// import 0 — React/supabase 없음, Date.now/Math.random은 오직 기본
// 인자값(now)으로만 쓰이고 호출부가 항상 override 가능(테스트 결정론).
// state shape { townPlacements: [{placementId,itemId,x,y,placedAt,updatedAt}],
// townRemovedIds: [] } — mergeTownLayout()은 useStudent.js의
// mergeProgressRecords() diaryPlacements 병합(로컬 우선 union + tombstone
// 합집합 후 제거, cap 300)과 동일한 정신을 따른다(CLAUDE.md 규칙 3 —
// 이미 검증된 병합 전략을 재구현이 아니라 그대로 미러링).
//
// 모든 함수는 순수하다 — 입력을 절대 mutate하지 않고 항상 새 객체/배열을
// 반환한다. 손상된 입력(undefined/null/배열 아님 등)에도 크래시 없이
// 안전한 기본값(빈 배열)으로 취급한다.
//
// 2026-09-11 P2 수정(qa-overnight-town 재현 → 승인) — 두 기기 저장 충돌 시
// stale overwrite 재현: 기기 A가 배치를 이동해 먼저 저장했는데, 기기 B가
// 그보다 오래된 로컬 스냅샷을 그대로 동기화하면 병합이 항상 local(=B)을
// 이겨 A의 최신 이동이 조용히 사라졌다(scripts/testTownLayoutIsolationStress45.mjs
// §6a/§6b가 FAIL로 재현). 수정: placement에 updatedAt을 추가(placeItem이
// 생성 시 설정, moveItem이 이동 성공 시 갱신)하고, mergeTownLayout의 같은
// placementId 충돌 해소를 "local 항상 승리"에서 "recency(updatedAt ??
// placedAt ?? 0)가 더 큰 쪽 승리, 동률/양쪽 다 없으면 하위호환으로 local
// 유지"로 교체. 이것은 last-write-wins 휴리스틱이며 CRDT가 아니다 — 기기
// 간 클럭이 어긋나면(클럭 스큐) "실제로 나중에 저장한 쪽"과 "더 큰
// updatedAt을 가진 쪽"이 다를 수 있다는 한계가 여전히 남는다.

export const TOWN_GRID = { cols: 8, rows: 6 }
export const HOME_CELL = { x: 3, y: 2 }

const TOMBSTONE_CAP = 300

export function emptyTownLayout() {
  return { townPlacements: [], townRemovedIds: [] }
}

function normalizeState(state) {
  const townPlacements = Array.isArray(state && state.townPlacements) ? state.townPlacements : []
  const townRemovedIds = Array.isArray(state && state.townRemovedIds) ? state.townRemovedIds : []
  return { townPlacements, townRemovedIds }
}

function inBounds(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && x < TOWN_GRID.cols && y >= 0 && y < TOWN_GRID.rows
}

function isHomeCell(x, y) {
  return x === HOME_CELL.x && y === HOME_CELL.y
}

function unionArrays(a, b) {
  const arrA = Array.isArray(a) ? a : []
  const arrB = Array.isArray(b) ? b : []
  const seen = new Set(arrA)
  const out = [...arrA]
  for (const v of arrB) {
    if (!seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

/**
 * 아이템을 (x,y)에 배치. V1은 아이템 하나당 배치 하나(already_placed).
 * @returns {{ok:boolean, reason?:string, state:object}}
 *   reason: 'not_owned' | 'out_of_bounds' | 'home_cell' | 'already_placed' | 'cell_occupied'
 */
export function placeItem(state, { itemId, x, y, ownedIds, placementId = null, now = Date.now() } = {}) {
  const cur = normalizeState(state)
  const owned = Array.isArray(ownedIds) ? ownedIds : []
  const fail = (reason) => ({ ok: false, reason, state: cur })

  if (typeof itemId !== 'string' || itemId.length === 0 || !owned.includes(itemId)) return fail('not_owned')
  if (!inBounds(x, y)) return fail('out_of_bounds')
  if (isHomeCell(x, y)) return fail('home_cell')
  if (cur.townPlacements.some((p) => p && p.itemId === itemId)) return fail('already_placed')
  if (cur.townPlacements.some((p) => p && p.x === x && p.y === y)) return fail('cell_occupied')

  const id = placementId || `${itemId}:${now}:${Math.random().toString(36).slice(2, 8)}`
  const placement = { placementId: id, itemId, x, y, placedAt: now, updatedAt: now }
  return { ok: true, state: { ...cur, townPlacements: [...cur.townPlacements, placement] } }
}

/**
 * 기존 배치를 (x,y)로 이동. 성공 시 updatedAt을 now로 갱신(2026-09-11,
 * mergeTownLayout의 recency 비교가 이 값을 읽는다 — 위 파일 헤더 참고).
 * @returns {{ok:boolean, reason?:string, state:object}}
 *   reason: 'not_found' | 'out_of_bounds' | 'home_cell' | 'cell_occupied'
 */
export function moveItem(state, placementId, x, y, now = Date.now()) {
  const cur = normalizeState(state)
  const fail = (reason) => ({ ok: false, reason, state: cur })

  const idx = cur.townPlacements.findIndex((p) => p && p.placementId === placementId)
  if (idx < 0) return fail('not_found')
  if (!inBounds(x, y)) return fail('out_of_bounds')
  if (isHomeCell(x, y)) return fail('home_cell')
  if (cur.townPlacements.some((p, i) => i !== idx && p && p.x === x && p.y === y)) return fail('cell_occupied')

  const nextPlacements = cur.townPlacements.map((p, i) => (i === idx ? { ...p, x, y, updatedAt: now } : p))
  return { ok: true, state: { ...cur, townPlacements: nextPlacements } }
}

/**
 * 배치를 제거하고 tombstone(townRemovedIds)에 추가 — cap 300, 최신 유지.
 * @returns {object} 새 state
 */
export function storeItem(state, placementId) {
  const cur = normalizeState(state)
  const nextPlacements = cur.townPlacements.filter((p) => !p || p.placementId !== placementId)
  const nextRemoved = cur.townRemovedIds.includes(placementId)
    ? cur.townRemovedIds
    : [...cur.townRemovedIds, placementId]
  return { townPlacements: nextPlacements, townRemovedIds: nextRemoved.slice(-TOMBSTONE_CAP) }
}

/**
 * 로컬/클라우드 병합 — placementId 기준 union, tombstone union 후 그 안의
 * placementId는 최종 결과에서 제거, tombstone cap 300.
 * mergeProgressRecords()의 diaryPlacements 병합과 동일한 정신.
 *
 * 같은 placementId 충돌(두 기기가 같은 배치를 서로 다르게 저장) 시
 * recency = p.updatedAt ?? p.placedAt ?? 0 을 비교해 더 큰(=더 최근) 쪽을
 * 채택한다(2026-09-11 수정, 파일 헤더 참고) — 동률이거나 양쪽 다 값이
 * 없으면 하위호환으로 local을 유지(구 레코드/폴백).
 */
export function mergeTownLayout(local, cloud) {
  const a = normalizeState(local)
  if (!cloud) return a
  const b = normalizeState(cloud)

  const removed = unionArrays(a.townRemovedIds, b.townRemovedIds).slice(-TOMBSTONE_CAP)
  const removedSet = new Set(removed)
  const cloudById = new Map(b.townPlacements.filter(Boolean).map((p) => [p.placementId, p]))
  const recencyOf = (p) => p.updatedAt ?? p.placedAt ?? 0

  const seen = new Set()
  const merged = []
  for (const p of a.townPlacements) {
    if (!p) continue
    seen.add(p.placementId)
    const cloudP = cloudById.get(p.placementId)
    merged.push(cloudP && recencyOf(cloudP) > recencyOf(p) ? cloudP : p)
  }
  for (const p of b.townPlacements) {
    if (p && !seen.has(p.placementId)) merged.push(p)
  }

  return { townPlacements: merged.filter((p) => p && !removedSet.has(p.placementId)), townRemovedIds: removed }
}

/** 소유하지 않은 아이템의 배치는 절대 렌더하지 않기 위한 방어적 필터. */
export function visiblePlacements(state, ownedIds) {
  const cur = normalizeState(state)
  const owned = Array.isArray(ownedIds) ? ownedIds : []
  return cur.townPlacements.filter((p) => p && owned.includes(p.itemId))
}

/** 'x,y' -> placement 룩업 테이블. */
export function cellMap(state) {
  const cur = normalizeState(state)
  const out = {}
  for (const p of cur.townPlacements) {
    if (p) out[`${p.x},${p.y}`] = p
  }
  return out
}
