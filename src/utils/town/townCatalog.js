// src/utils/town/townCatalog.js — Paul Town V1 카탈로그(순수 도메인, 2026-09-11).
//
// import 0(React/supabase 없음) — DB `town_items`가 가격/활성 여부의 유일한
// 권위(townShop.js 헤더의 "서버가 최종 결정" 원칙과 동일)이고, 이 파일은
// (1) 서버가 아직 안 내려주는 필드(표시용 한글/영문 이름, 카테고리, 최소
// 레벨, 정렬 순서, 에셋 키)의 "초안" 메타를 들고 있다가 (2) 실제 서버
// 응답과 병합해 UI가 바로 그릴 수 있는 형태로 다듬는다. 소유권/구매 로직은
// 여기 없다 — townLayout.js(배치)/townShop.js(구매 리듀서)가 각자 담당.
//
// TOWN_ITEM_META의 price는 "가격 정책 초안(DB town_items가 진실)" —
// mergeCatalog()가 서버 값이 있으면 항상 서버 값을 우선한다.

export const TOWN_CATEGORIES = [
  { id: 'house', label: '집', emoji: '🏠' },
  { id: 'nature', label: '자연', emoji: '🌳' },
  { id: 'animal', label: '동물', emoji: '🐾' },
  { id: 'decoration', label: '장식', emoji: '✨' },
  { id: 'special', label: '특별', emoji: '🏰' },
]

// id -> 폴더(assetKey 접두) 매핑. 메타에 없는 서버 전용 아이템의 assetKey를
// 파생할 때도 이 표를 그대로 쓴다.
const CATEGORY_FOLDER = {
  house: 'buildings',
  nature: 'nature',
  animal: 'animals',
  decoration: 'decorations',
  special: 'special',
}

function meta(emoji, category, minLevel, sortOrder, defaultPrice, nameKo, nameEn) {
  return { emoji, category, minLevel, sortOrder, defaultPrice, nameKo, nameEn }
}

// 가격 정책 초안(DB town_items가 진실) — DB 값이 있으면 항상 DB가 이긴다.
export const TOWN_ITEM_META = {
  'british-cottage': meta('🏠', 'house', 1, 10, 80, '영국 코티지', 'British Cottage'),
  'tree': meta('🌳', 'nature', 1, 10, 10, '나무', 'Tree'),
  'bench': meta('🪑', 'decoration', 1, 20, 15, '벤치', 'Bench'),
  'town-sign': meta('🪧', 'decoration', 1, 30, 40, '마을 표지판', 'Town Sign'),
  'cat': meta('🐱', 'animal', 2, 10, 20, '고양이', 'Cat'),
  'street-lamp': meta('🪔', 'decoration', 2, 40, 25, '가로등', 'Street Lamp'),
  'red-post-box': meta('📮', 'decoration', 2, 50, 25, '빨간 우체통', 'Red Post Box'),
  'flower-garden': meta('🌷', 'nature', 3, 20, 30, '꽃밭', 'Flower Garden'),
  'book-shop': meta('📚', 'house', 3, 20, 120, '책방', 'Book Shop'),
  'puppy': meta('🐶', 'animal', 4, 20, 30, '강아지', 'Puppy'),
  'owl': meta('🦉', 'animal', 4, 30, 40, '부엉이', 'Owl'),
  'cafe': meta('☕', 'house', 5, 30, 120, '카페', 'Cafe'),
  'stone-fountain': meta('⛲', 'decoration', 5, 60, 60, '돌 분수', 'Stone Fountain'),
  'bridge': meta('🌉', 'special', 6, 10, 150, '다리', 'Bridge'),
  'english-school': meta('🏫', 'special', 7, 20, 150, '영어 학교', 'English School'),
  'clock-tower': meta('🕰️', 'special', 8, 30, 200, '시계탑', 'Clock Tower'),
  // 레거시(townShop.js TOWN_SHOP_ITEMS의 shop-lamp와 동일 id) — 카탈로그
  // 확장으로 흡수, 값은 기존 상수(가격 60)와 동일하게 유지.
  'shop-lamp': meta('💡', 'decoration', 1, 90, 60, '책상 램프', 'Desk Lamp'),
}

function assetKeyFor(id, category, metaEntry) {
  if (metaEntry && metaEntry.assetKey) return metaEntry.assetKey
  const folder = CATEGORY_FOLDER[category] || 'decorations'
  return `${folder}/${id}`
}

function pick(server, camelKey, snakeKey, fallback) {
  if (server && server[camelKey] !== undefined && server[camelKey] !== null) return server[camelKey]
  if (server && snakeKey && server[snakeKey] !== undefined && server[snakeKey] !== null) return server[snakeKey]
  return fallback
}

/**
 * 서버 town_items 응답(snake_case/camelCase 혼용 허용)과 로컬 메타를
 * 병합한다 — 카탈로그 = 서버 목록(메타에만 있고 서버에 없는 아이템은
 * 제외, 서버에만 있고 메타에 없는 아이템도 안전한 기본값으로 포함).
 * @param {Array<object>} serverItems
 * @returns {Array<{id,name,nameEn,emoji,price,priceCurrency,active,category,sortOrder,minLevel,assetKey}>}
 */
export function mergeCatalog(serverItems) {
  if (!Array.isArray(serverItems) || serverItems.length === 0) return []
  const categoryOrder = TOWN_CATEGORIES.map((c) => c.id)

  const merged = serverItems
    .filter((s) => s && typeof s.id === 'string' && s.id.length > 0)
    .map((s) => {
      const metaEntry = TOWN_ITEM_META[s.id] || null
      const category = pick(s, 'category', null, metaEntry ? metaEntry.category : 'decoration')
      const minLevelRaw = pick(s, 'minLevel', 'min_level', metaEntry ? metaEntry.minLevel : 1)
      const sortOrderRaw = pick(s, 'sortOrder', 'sort_order', metaEntry ? metaEntry.sortOrder : 999)
      const assetKey = pick(s, 'assetKey', 'asset_key', assetKeyFor(s.id, category, metaEntry))
      const priceRaw = pick(s, 'price', null, metaEntry ? metaEntry.defaultPrice : 0)
      const priceCurrency = pick(s, 'priceCurrency', 'price_currency', 'dollars')
      const name = pick(s, 'name', null, metaEntry ? metaEntry.nameKo : s.id)
      const emoji = pick(s, 'emoji', null, metaEntry ? metaEntry.emoji : '🎁')
      const activeRaw = pick(s, 'active', null, true)
      const nameEn = (metaEntry && metaEntry.nameEn) || name

      return {
        id: s.id,
        name,
        nameEn,
        emoji,
        price: Math.max(0, Number(priceRaw) || 0),
        priceCurrency,
        active: activeRaw !== false,
        category,
        sortOrder: Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 999,
        minLevel: Math.max(1, Number.isFinite(Number(minLevelRaw)) ? Number(minLevelRaw) : 1),
        assetKey,
      }
    })

  return merged.sort((a, b) => {
    const ai = categoryOrder.indexOf(a.category)
    const bi = categoryOrder.indexOf(b.category)
    const aCat = ai < 0 ? categoryOrder.length : ai
    const bCat = bi < 0 ? categoryOrder.length : bi
    if (aCat !== bCat) return aCat - bCat
    return a.sortOrder - b.sortOrder
  })
}

/**
 * 아이템 하나의 UI 상태 — 우선순위: owned > purchasing > locked >
 * insufficient > buyable.
 * @param {{id:string, price:number, minLevel:number}} item
 * @param {{ownedIds?:string[], purchasingId?:string|null, balance?:number, level?:number}} ctx
 */
export function itemState(item, ctx = {}) {
  const { ownedIds = [], purchasingId = null, balance = 0, level = 1 } = ctx || {}
  const owned = Array.isArray(ownedIds) ? ownedIds : []
  const id = item && item.id
  if (id && owned.includes(id)) return 'owned'
  if (id && purchasingId != null && purchasingId === id) return 'purchasing'

  const lvl = Math.max(1, Number.isFinite(Number(level)) ? Number(level) : 1)
  const minLevel = item && Number.isFinite(Number(item.minLevel)) ? Number(item.minLevel) : 1
  if (lvl < minLevel) return 'locked'

  const bal = Math.max(0, Number.isFinite(Number(balance)) ? Number(balance) : 0)
  const price = item && Number.isFinite(Number(item.price)) ? Number(item.price) : 0
  if (bal < price) return 'insufficient'

  return 'buyable'
}

/** max(0, price - balance) */
export function shortfall(item, balance) {
  const price = item && Number.isFinite(Number(item.price)) ? Number(item.price) : 0
  const bal = Math.max(0, Number.isFinite(Number(balance)) ? Number(balance) : 0)
  return Math.max(0, price - bal)
}

/** TOWN_CATEGORIES 순서로 { house:[], nature:[], ... } 그룹핑. */
export function groupByCategory(items) {
  const out = {}
  for (const cat of TOWN_CATEGORIES) out[cat.id] = []
  for (const item of (Array.isArray(items) ? items : [])) {
    if (item && Object.prototype.hasOwnProperty.call(out, item.category)) {
      out[item.category].push(item)
    }
  }
  return out
}
