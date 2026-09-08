// Paul Town 별 상점 V1(townShopV1, 2026-09-06) — 순수 파생/리듀서만.
//
// 이 파일은 import 0(window/Date 없음) — 서버(api/grant-xp.js)가 가격/
// 소유권의 유일한 권위(star_purchases)이고, 여기서는 그 응답을 UI가
// 그리기 좋은 형태로 다듬거나(normalizeShopState), 서버 응답을 반영해
// 클라이언트 메모리 상태를 갱신하는 순수 리듀서(applyPurchaseResult)만
// 제공한다. 학생 진행 레코드(useStudent.js)에는 아무것도 추가하지 않는다
// — 소유권은 매 마운트/로그인/새로고침마다 서버에서 다시 조회한다.
//
// 2재화 분리(Paul Dollar V1, 2026-09-08, 운영자 승인 DOLLAR_DESIGN_COMPLETE):
// ⭐ 별(stars)은 이제 누적 성취 값(never decreases, 상점에서 소비되지
// 않음)이고, 💵 Paul Dollar(dollars)가 상점 전용 화폐다. 서버 응답
// (get_town_shop_state)은 { starsEarned, dollarsAvailable, dollarsEarned,
// dollarsSpent, owned, items }를 반환한다 — 레거시 { available, earned,
// spent } 필드는 더 이상 서버가 내려주지 않는다. normalizeShopState는
// 혹시 남아있는 레거시 응답(available만 있고 dollarsAvailable이 없는
// 경우)도 안전하게 dollars.available로 흡수한다(과도기 방어, 규칙 9).

// 카탈로그 — 표시용(이름/이모지/가격/화폐 표시). 실제 결제 가격은 서버가
// 최종 결정하고, 클라이언트는 이 price를 절대 요청 바디에 싣지 않는다
// (스펙 — "The client NEVER sends price/studentId for these actions").
export const TOWN_SHOP_ITEMS = [
  { id: 'shop-lamp', name: '책상 램프', emoji: '💡', price: 60, priceCurrency: 'dollars' },
]

export const FIRST_ITEM_ID = 'shop-lamp'

/**
 * 상점 아이템 한 개의 UI 상태 — 순수 파생.
 * 우선순위: owned > purchasing > insufficient/buyable(dollarsAvailable 비교).
 * @param {{id:string, price:number}} item
 * @param {{dollarsAvailable:number, owned:string[], purchasing:boolean}} ctx
 *   - 하위호환: `available`(레거시 파라미터명)도 dollarsAvailable의 별칭으로
 *     허용한다(dollarsAvailable이 없을 때만 available을 본다).
 * @returns {{kind:'owned'}|{kind:'purchasing'}|{kind:'insufficient', missing:number}|{kind:'buyable'}}
 */
export function shopItemState(item, ctx = {}) {
  const { dollarsAvailable, available, owned, purchasing } = ctx
  const ownedList = Array.isArray(owned) ? owned : []
  if (ownedList.includes(item.id)) return { kind: 'owned' }
  if (purchasing) return { kind: 'purchasing' }
  const raw = dollarsAvailable !== undefined ? dollarsAvailable : available
  const avail = Math.max(0, Number(raw) || 0)
  if (avail < item.price) return { kind: 'insufficient', missing: item.price - avail }
  return { kind: 'buyable' }
}

/**
 * 서버 구매 응답을 클라이언트 메모리 상태에 반영하는 순수 리듀서.
 * 실패(res.ok===false)에서 reason이 'insufficient'가 아니면 상태는 완전히
 * 동일한 참조로 반환(불필요한 리렌더 방지 + "실패 시 상태 불변" 계약).
 * ⭐ starsEarned는 이 함수가 절대 건드리지 않는다 — 상점 구매는 오직
 * dollars.available만 변화시킨다(별은 상점에서 소비되지 않는다는 설계).
 * @param {{starsEarned:number, dollars:{available:number, earned:number, spent:number}, owned:string[]}} state
 * @param {string} itemId
 * @param {object} res - server response (purchase_town_item):
 *   { ok, reason, dollarsSpent, balanceAfter(dollars), duplicate }
 */
export function applyPurchaseResult(state, itemId, res) {
  const cur = state && typeof state === 'object'
    ? state
    : { starsEarned: 0, dollars: { available: 0, earned: 0, spent: 0 }, owned: [] }
  const curDollars = cur.dollars || { available: 0, earned: 0, spent: 0 }
  if (res && res.ok && (res.reason === 'purchased' || res.reason === 'already_owned')) {
    const nextOwned = cur.owned && cur.owned.includes(itemId) ? cur.owned : [...(cur.owned || []), itemId]
    const nextAvailable = Math.max(0, Number(res.balanceAfter) || 0)
    return { ...cur, owned: nextOwned, dollars: { ...curDollars, available: nextAvailable } }
  }
  if (res && res.ok === false && res.reason === 'insufficient' && Number.isFinite(Number(res.balanceAfter))) {
    return { ...cur, dollars: { ...curDollars, available: Math.max(0, Number(res.balanceAfter) || 0) } }
  }
  return cur
}

/**
 * 서버 상점 상태 응답(get_town_shop_state)을 안전하게 정규화 — 쓰레기
 * 입력(undefined/null/이상한 타입)에도 절대 throw하지 않는다.
 *
 * 반환: { starsEarned:int≥0, dollars:{available,earned,spent}≥0, owned:string[], items:[] }
 * 레거시 응답 방어(v3_49 배포 전 과도기, 2026-09-08 추가): 새 필드
 * (starsEarned/dollarsAvailable)가 없고 옛 필드(earned/available)만 있으면
 * earned → starsEarned, available → dollars.available로 흡수한다. 서버가
 * `legacyShape: true`를 명시적으로 실어 보내는 응답도 이미 새 필드명
 * (starsEarned/dollarsAvailable 등)으로 매핑돼 오므로 별도 분기 없이 아래
 * 일반 경로를 그대로 통과한다 — legacyShape 자체는 이 함수가 읽지 않는다.
 */
export function normalizeShopState(res) {
  const hasStarsEarned = res && res.starsEarned !== undefined && res.starsEarned !== null
  const rawStarsEarned = hasStarsEarned ? res.starsEarned : (res && res.earned)
  const starsEarned = Math.max(0, Number(rawStarsEarned) || 0)
  const hasDollarsAvailable = res && res.dollarsAvailable !== undefined && res.dollarsAvailable !== null
  const rawAvailable = hasDollarsAvailable ? res.dollarsAvailable : (res && res.available)
  const available = Math.max(0, Number(rawAvailable) || 0)
  const earned = Math.max(0, Number(res && res.dollarsEarned) || 0)
  const spent = Math.max(0, Number(res && res.dollarsSpent) || 0)
  const ownedRaw = Array.isArray(res && res.owned) ? res.owned : []
  const owned = Array.from(new Set(ownedRaw.filter((id) => typeof id === 'string')))
  const items = Array.isArray(res && res.items) ? res.items : []
  return { starsEarned, dollars: { available, earned, spent }, owned, items }
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

/**
 * 정수 Paul Dollar 표시 포맷 — `$60`처럼 통화 기호+정수. 음수/NaN은 0으로
 * 클램프(다른 정규화 함수들과 동일한 방어 원칙).
 */
export function formatDollars(n) {
  return `$${Math.max(0, Math.round(Number(n) || 0))}`
}
