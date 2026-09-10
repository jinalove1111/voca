// src/utils/town/townLayout.js — Paul Town V1 배치 그리드(순수 도메인,
// 2026-09-11).
//
// import 0 — React/supabase 없음, Date.now/Math.random은 오직 기본
// 인자값(now)으로만 쓰이고 호출부가 항상 override 가능(테스트 결정론).
// state shape { townPlacements: [{placementId,itemId,x,y,placedAt}],
// townRemovedIds: [] } — mergeTownLayout()은 useStudent.js의
// mergeProgressRecords() diaryPlacements 병합(로컬 우선 union + tombstone
// 합집합 후 제거, cap 300)과 동일한 정신을 따른다(CLAUDE.md 규칙 3 —
// 이미 검증된 병합 전략을 재구현이 아니라 그대로 미러링).
//
// 모든 함수는 순수하다 — 입력을 절대 mutate하지 않고 항상 새 객체/배열을
// 반환한다. 손상된 입력(undefined/null/배열 아님 등)에도 크래시 없이
// 안전한 기본값(빈 배열)으로 취급한다.

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
  const placement = { placementId: id, itemId, x, y, placedAt: now }
  return { ok: true, state: { ...cur, townPlacements: [...cur.townPlacements, placement] } }
}

/**
 * 기존 배치를 (x,y)로 이동.
 * @returns {{ok:boolean, reason?:string, state:object}}
 *   reason: 'not_found' | 'out_of_bounds' | 'home_cell' | 'cell_occupied'
 */
export function moveItem(state, placementId, x, y) {
  const cur = normalizeState(state)
  const fail = (reason) => ({ ok: false, reason, state: cur })

  const idx = cur.townPlacements.findIndex((p) => p && p.placementId === placementId)
  if (idx < 0) return fail('not_found')
  if (!inBounds(x, y)) return fail('out_of_bounds')
  if (isHomeCell(x, y)) return fail('home_cell')
  if (cur.townPlacements.some((p, i) => i !== idx && p && p.x === x && p.y === y)) return fail('cell_occupied')

  const nextPlacements = cur.townPlacements.map((p, i) => (i === idx ? { ...p, x, y } : p))
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
 * 로컬/클라우드 병합 — placementId 기준 union(local 우선), tombstone
 * union 후 그 안의 placementId는 최종 결과에서 제거, tombstone cap 300.
 * mergeProgressRecords()의 diaryPlacements 병합과 동일한 정신.
 */
export function mergeTownLayout(local, cloud) {
  const a = normalizeState(local)
  if (!cloud) return a
  const b = normalizeState(cloud)

  const removed = unionArrays(a.townRemovedIds, b.townRemovedIds).slice(-TOMBSTONE_CAP)
  const removedSet = new Set(removed)
  const localIds = new Set(a.townPlacements.filter(Boolean).map((p) => p.placementId))

  const merged = [
    ...a.townPlacements,
    ...b.townPlacements.filter((p) => p && !localIds.has(p.placementId)),
  ].filter((p) => p && !removedSet.has(p.placementId))

  return { townPlacements: merged, townRemovedIds: removed }
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
