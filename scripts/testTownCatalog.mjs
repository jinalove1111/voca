// scripts/testTownCatalog.mjs
//
// Paul Town V1 순수 도메인(townCatalog.js, 2026-09-11) 회귀 스위트.
// 네트워크 0, Supabase 0 — src/utils/town/townCatalog.js는 import 0개
// 순수 모듈이라 이 스크립트도 그 파일 하나만 직접 import한다.
//
// 실행: node scripts/testTownCatalog.mjs
import {
  TOWN_CATEGORIES,
  TOWN_ITEM_META,
  mergeCatalog,
  itemState,
  shortfall,
  groupByCategory,
} from '../src/utils/town/townCatalog.js'

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const section = (name) => console.log(`\n-- ${name} --`)

// ══════════════════════════════════════════════════════════════════════
section('1. TOWN_CATEGORIES')
// ══════════════════════════════════════════════════════════════════════
{
  check('5개 카테고리', TOWN_CATEGORIES.length === 5)
  check('순서: house, nature, animal, decoration, special',
    TOWN_CATEGORIES.map((c) => c.id).join(',') === 'house,nature,animal,decoration,special')
  check('각 카테고리에 label/emoji 존재', TOWN_CATEGORIES.every((c) => c.label && c.emoji))
}

// ══════════════════════════════════════════════════════════════════════
section('2. TOWN_ITEM_META 스팟체크')
// ══════════════════════════════════════════════════════════════════════
{
  const cottage = TOWN_ITEM_META['british-cottage']
  check('british-cottage: 🏠/house/L1/sort10/price80/영국 코티지/British Cottage',
    cottage.emoji === '🏠' && cottage.category === 'house' && cottage.minLevel === 1 &&
    cottage.sortOrder === 10 && cottage.defaultPrice === 80 &&
    cottage.nameKo === '영국 코티지' && cottage.nameEn === 'British Cottage')
  const lamp = TOWN_ITEM_META['shop-lamp']
  check('shop-lamp(레거시): 💡/decoration/L1/sort90/price60/책상 램프',
    lamp.emoji === '💡' && lamp.category === 'decoration' && lamp.minLevel === 1 &&
    lamp.sortOrder === 90 && lamp.defaultPrice === 60 && lamp.nameKo === '책상 램프')
  const clockTower = TOWN_ITEM_META['clock-tower']
  check('clock-tower: L8/sort30/price200', clockTower.minLevel === 8 && clockTower.sortOrder === 30 && clockTower.defaultPrice === 200)
  check('메타 아이템 17개(신규 16 + 레거시 shop-lamp)', Object.keys(TOWN_ITEM_META).length === 17)
  check('모든 메타 항목에 필수 필드 존재',
    Object.values(TOWN_ITEM_META).every((m) => m.emoji && m.category && m.minLevel >= 1 && m.sortOrder >= 0 && m.defaultPrice >= 0 && m.nameKo && m.nameEn))
}

// ══════════════════════════════════════════════════════════════════════
section('3. mergeCatalog')
// ══════════════════════════════════════════════════════════════════════
{
  check('null → []', mergeCatalog(null).length === 0)
  check('undefined → []', mergeCatalog(undefined).length === 0)
  check('빈 배열 → []', mergeCatalog([]).length === 0)
  check('배열 아닌 값 → []', mergeCatalog('not-an-array').length === 0)

  const merged1 = mergeCatalog([{ id: 'tree', price: 10 }])
  check('메타 존재 아이템: 서버 price 반영, 나머지는 메타에서', (() => {
    const t = merged1[0]
    return t.price === 10 && t.emoji === '🌳' && t.category === 'nature' && t.minLevel === 1 && t.name === '나무' && t.nameEn === 'Tree'
  })())

  const merged2 = mergeCatalog([{ id: 'tree', price: 999, name: '큰 나무', emoji: '🌲' }])
  check('서버 필드가 메타를 덮어씀(price/name/emoji)', merged2[0].price === 999 && merged2[0].name === '큰 나무' && merged2[0].emoji === '🌲')

  const merged3 = mergeCatalog([{ id: 'bridge', min_level: 3, sort_order: 5, price_currency: 'stars', asset_key: 'special/custom-bridge' }])
  check('snake_case 서버 필드 인식(min_level/sort_order/price_currency/asset_key)', (() => {
    const b = merged3[0]
    return b.minLevel === 3 && b.sortOrder === 5 && b.priceCurrency === 'stars' && b.assetKey === 'special/custom-bridge'
  })())

  const merged4 = mergeCatalog([{ id: 'bridge', minLevel: 4, sortOrder: 6, priceCurrency: 'dollars', assetKey: 'special/bridge-v2' }])
  check('camelCase 서버 필드 인식(minLevel/sortOrder/priceCurrency/assetKey)', (() => {
    const b = merged4[0]
    return b.minLevel === 4 && b.sortOrder === 6 && b.priceCurrency === 'dollars' && b.assetKey === 'special/bridge-v2'
  })())

  const merged5 = mergeCatalog([{ id: 'brand-new-item' }])
  check('메타에 없는 서버 전용 아이템: category decoration/minLevel 1/emoji 🎁 기본값', (() => {
    const x = merged5[0]
    return x.category === 'decoration' && x.minLevel === 1 && x.emoji === '🎁'
  })())
  check('메타에 없는 서버 전용 아이템도 카탈로그에 포함(제외되지 않음)', merged5.length === 1 && merged5[0].id === 'brand-new-item')

  const merged6 = mergeCatalog([{ id: 'tree' }])
  check('메타에 있지만 서버 목록엔 없는 나머지 아이템(예: cat)은 결과에서 제외', merged6.every((x) => x.id !== 'cat') && merged6.length === 1)

  const merged7 = mergeCatalog([
    { id: 'clock-tower' }, // special, sort 30
    { id: 'bridge' },      // special, sort 10
    { id: 'tree' },        // nature, sort 10
    { id: 'british-cottage' }, // house, sort 10
    { id: 'cat' },         // animal, sort 10
  ])
  check('정렬: 카테고리 순서(house,nature,animal,decoration,special) 우선',
    merged7.map((x) => x.id).join(',') === 'british-cottage,tree,cat,bridge,clock-tower')

  const merged8 = mergeCatalog([{ id: 'street-lamp' }, { id: 'bench' }, { id: 'town-sign' }])
  check('같은 카테고리 내 sortOrder 오름차순(bench 20 < street-lamp 40 < town-sign... )', (() => {
    // bench(decoration,20), street-lamp(decoration,40), town-sign(decoration,30)
    return merged8.map((x) => x.id).join(',') === 'bench,town-sign,street-lamp'
  })())

  check('active 기본값 true', mergeCatalog([{ id: 'tree' }])[0].active === true)
  check('active:false 명시 시 false로 반영', mergeCatalog([{ id: 'tree', active: false }])[0].active === false)
  check('가격 음수/NaN 방어 → 0으로 클램프', mergeCatalog([{ id: 'tree', price: -5 }])[0].price === 0 && mergeCatalog([{ id: 'tree', price: 'garbage' }])[0].price === 0)
  check('minLevel 최소 1로 클램프(0 이하 입력)', mergeCatalog([{ id: 'tree', minLevel: 0 }])[0].minLevel === 1)
  check('id 없는/문자열 아닌 서버 항목 필터링', mergeCatalog([{ price: 10 }, { id: 42 }, null, { id: 'tree' }]).length === 1)
  check('priceCurrency 기본값 dollars', mergeCatalog([{ id: 'tree' }])[0].priceCurrency === 'dollars')
  check('assetKey 폴더 매핑(house→buildings)', mergeCatalog([{ id: 'cafe' }])[0].assetKey === 'buildings/cafe')
  check('assetKey 폴더 매핑(animal→animals)', mergeCatalog([{ id: 'cat' }])[0].assetKey === 'animals/cat')
}

// ══════════════════════════════════════════════════════════════════════
section('4. itemState — 우선순위 owned > purchasing > locked > insufficient > buyable')
// ══════════════════════════════════════════════════════════════════════
{
  const item = { id: 'cafe', price: 120, minLevel: 5 }
  check('owned → owned(다른 조건 무시)', itemState(item, { ownedIds: ['cafe'], purchasingId: 'cafe', balance: 0, level: 1 }) === 'owned')
  check('purchasing(미보유, locked/insufficient 조건과 무관) → purchasing', itemState(item, { ownedIds: [], purchasingId: 'cafe', balance: 0, level: 1 }) === 'purchasing')
  check('level < minLevel(잔액 충분해도) → locked', itemState(item, { ownedIds: [], purchasingId: null, balance: 999, level: 4 }) === 'locked')
  check('level 충족 + 잔액 부족 → insufficient', itemState(item, { ownedIds: [], purchasingId: null, balance: 50, level: 5 }) === 'insufficient')
  check('level 충족 + 잔액 충분 → buyable', itemState(item, { ownedIds: [], purchasingId: null, balance: 200, level: 5 }) === 'buyable')
  check('잔액 정확히 price → buyable(경계값)', itemState(item, { ownedIds: [], purchasingId: null, balance: 120, level: 5 }) === 'buyable')
  check('level 정확히 minLevel → locked 아님', itemState(item, { ownedIds: [], purchasingId: null, balance: 120, level: 5 }) !== 'locked')
  check('ctx 생략(기본값) → level 1이면 minLevel1 아이템은 잔액만 봄', itemState({ id: 'tree', price: 10, minLevel: 1 }) === 'insufficient')
  check('malformed ownedIds(문자열) → 크래시 없이 buyable/locked 판정', itemState(item, { ownedIds: 'oops', purchasingId: null, balance: 200, level: 5 }) === 'buyable')
  check('balance 음수/NaN → insufficient(0 취급)', itemState(item, { ownedIds: [], purchasingId: null, balance: -10, level: 5 }) === 'insufficient')
}

// ══════════════════════════════════════════════════════════════════════
section('5. shortfall')
// ══════════════════════════════════════════════════════════════════════
{
  check('잔액 부족 → 정확한 차액', shortfall({ price: 100 }, 60) === 40)
  check('잔액 충분 → 0', shortfall({ price: 100 }, 100) === 0)
  check('잔액 초과 → 0(음수 아님)', shortfall({ price: 100 }, 500) === 0)
  check('잔액 음수 → price 그대로', shortfall({ price: 100 }, -10) === 100)
  check('price NaN → 0 취급', shortfall({ price: 'garbage' }, 10) === 0)
}

// ══════════════════════════════════════════════════════════════════════
section('6. groupByCategory')
// ══════════════════════════════════════════════════════════════════════
{
  const items = [
    { id: 'a', category: 'house' },
    { id: 'b', category: 'nature' },
    { id: 'c', category: 'house' },
    { id: 'd', category: 'unknown-category' },
  ]
  const grouped = groupByCategory(items)
  check('5개 카테고리 키 모두 존재', TOWN_CATEGORIES.every((c) => Array.isArray(grouped[c.id])))
  check('house 카테고리에 a, c 포함(순서 유지)', grouped.house.map((x) => x.id).join(',') === 'a,c')
  check('nature 카테고리에 b 포함', grouped.nature.map((x) => x.id).join(',') === 'b')
  check('알 수 없는 카테고리는 어느 그룹에도 안 들어감(드롭)', Object.values(grouped).every((arr) => !arr.some((x) => x.id === 'd')))
  check('빈 입력 → 모든 카테고리 빈 배열', Object.values(groupByCategory([])).every((arr) => arr.length === 0))
  check('null/undefined 입력 → 크래시 없이 빈 그룹', Object.values(groupByCategory(null)).every((arr) => arr.length === 0) && Object.values(groupByCategory(undefined)).every((arr) => arr.length === 0))
}

// ══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
