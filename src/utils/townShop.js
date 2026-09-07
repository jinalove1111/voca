// Paul Town 별 상점 V1(townShopV1, 2026-09-06) — 순수 파생/리듀서만.
//
// 이 파일은 import 0(window/Date 없음) — 서버(api/grant-xp.js)가 가격/
// 소유권의 유일한 권위(star_purchases)이고, 여기서는 그 응답을 UI가
// 그리기 좋은 형태로 다듬거나(normalizeShopState), 서버 응답을 반영해
// 클라이언트 메모리 상태를 갱신하는 순수 리듀서(applyPurchaseResult)만
// 제공한다. 학생 진행 레코드(useStudent.js)에는 아무것도 추가하지 않는다
// — 소유권은 매 마운트/로그인/새로고침마다 서버에서 다시 조회한다.

// 카탈로그 — 표시용(이름/이모지/가격 표시). 실제 결제 가격은 서버가 최종
// 결정하고, 클라이언트는 이 price를 절대 요청 바디에 싣지 않는다(스펙 —
// "The client NEVER sends price/studentId for these actions").
export const TOWN_SHOP_ITEMS = [
  { id: 'shop-lamp', name: '책상 램프', emoji: '💡', price: 60 },
]

export const FIRST_ITEM_ID = 'shop-lamp'

/**
 * 상점 아이템 한 개의 UI 상태 — 순수 파생.
 * 우선순위: owned > purchasing > insufficient/buyable(available 비교).
 * @param {{id:string, price:number}} item
 * @param {{available:number, owned:string[], purchasing:boolean}} ctx
 * @returns {{kind:'owned'}|{kind:'purchasing'}|{kind:'insufficient', missing:number}|{kind:'buyable'}}
 */
export function shopItemState(item, { available, owned, purchasing } = {}) {
  const ownedList = Array.isArray(owned) ? owned : []
  if (ownedList.includes(item.id)) return { kind: 'owned' }
  if (purchasing) return { kind: 'purchasing' }
  const avail = Math.max(0, Number(available) || 0)
  if (avail < item.price) return { kind: 'insufficient', missing: item.price - avail }
  return { kind: 'buyable' }
}

/**
 * 서버 구매 응답을 클라이언트 메모리 상태에 반영하는 순수 리듀서.
 * 실패(res.ok===false)에서 reason이 'insufficient'가 아니면 상태는 완전히
 * 동일한 참조로 반환(불필요한 리렌더 방지 + "실패 시 상태 불변" 계약).
 * @param {{available:number, owned:string[]}} state
 * @param {string} itemId
 * @param {object} res - server response (purchase_town_item)
 */
export function applyPurchaseResult(state, itemId, res) {
  const cur = state && typeof state === 'object' ? state : { available: 0, owned: [] }
  if (res && res.ok && (res.reason === 'purchased' || res.reason === 'already_owned')) {
    const nextOwned = cur.owned && cur.owned.includes(itemId) ? cur.owned : [...(cur.owned || []), itemId]
    const nextAvailable = Math.max(0, Number(res.balanceAfter) || 0)
    return { ...cur, owned: nextOwned, available: nextAvailable }
  }
  if (res && res.ok === false && res.reason === 'insufficient' && Number.isFinite(Number(res.balanceAfter))) {
    return { ...cur, available: Math.max(0, Number(res.balanceAfter) || 0) }
  }
  return cur
}

/**
 * 서버 상점 상태 응답(get_town_shop_state)을 안전하게 정규화 — 쓰레기
 * 입력(undefined/null/이상한 타입)에도 절대 throw하지 않는다.
 */
export function normalizeShopState(res) {
  const available = Math.max(0, Number(res && res.available) || 0)
  const ownedRaw = Array.isArray(res && res.owned) ? res.owned : []
  const owned = Array.from(new Set(ownedRaw.filter((id) => typeof id === 'string')))
  const items = Array.isArray(res && res.items) ? res.items : []
  return { available, owned, items }
}

/**
 * 소유한 아이템의 방 소품 표시 목록 — 카탈로그 순서 고정, 중복 제거.
 * PaulTown.jsx의 기존 deco 배열에 이어붙여 같은 방식으로 렌더한다.
 */
export function purchasedDeco(owned, items = TOWN_SHOP_ITEMS) {
  const ownedSet = new Set(Array.isArray(owned) ? owned : [])
  const seen = new Set()
  const out = []
  for (const item of items) {
    if (!ownedSet.has(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    out.push({ id: item.id, emoji: item.emoji, name: item.name })
  }
  return out
}
