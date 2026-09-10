// src/components/town/TownShopPanel.jsx — Paul Town V1 상점 패널(2026-09-11).
//
// 카테고리 탭 + 아이템 카드(보유/잠김/부족/구매 가능/구매 중 5상태,
// townCatalog.itemState가 유일한 판정 로직) + 구매 확인 시트. 소유권/
// 잔액의 진실 원천은 항상 서버(townShop.state) — 여기서는 balance -
// item.price 같은 "남는 금액 미리보기"만 로컬로 계산하고(구매 확인 문구용,
// 실제 차감이 아님), ⭐(별)에서 💵(잔액)을 역산하는 계산은 절대 하지
// 않는다.
import { useState } from 'react'
import { TOWN_CATEGORIES, itemState, shortfall, groupByCategory } from '../../utils/town/townCatalog'
import { TOWN_PHRASES } from '../../utils/town/townMessages'
import { formatDollars } from '../../utils/townShop'
import { townAsset } from '../../assets/town'

export default function TownShopPanel({ items, ownedIds, balance, level, purchasingId, onPurchase, onGuide }) {
  const [activeCategory, setActiveCategory] = useState((TOWN_CATEGORIES[0] && TOWN_CATEGORIES[0].id) || 'house')
  const [confirmItem, setConfirmItem] = useState(null)
  const grouped = groupByCategory(items)
  const visibleItems = grouped[activeCategory] || []

  function handleCardTap(item, state) {
    if (state === 'buyable') {
      setConfirmItem(item)
    } else if (state === 'insufficient') {
      onGuide && onGuide('insufficient', { shortfall: shortfall(item, balance) })
    } else if (state === 'locked') {
      onGuide && onGuide('locked', { level: item.minLevel })
    }
  }

  async function handleConfirmPurchase() {
    const item = confirmItem
    setConfirmItem(null)
    if (!item || !onPurchase) return
    const res = await onPurchase(item.id)
    if (res && res.ok) {
      onGuide && onGuide('purchase_success', { name: item.name })
    } else if (res && res.reason === 'insufficient_funds') {
      onGuide && onGuide('insufficient', { shortfall: shortfall(item, balance) })
    } else if (res && res.reason === 'locked') {
      onGuide && onGuide('locked', { level: item.minLevel })
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-bold text-purple-400">{TOWN_PHRASES.learnEarn}</p>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TOWN_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            aria-label={`${cat.label} 카테고리`}
            className={`flex-shrink-0 min-h-[44px] px-4 rounded-2xl text-sm font-black btn-press ${
              activeCategory === cat.id ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {visibleItems.map((item) => {
          const state = itemState(item, { ownedIds, purchasingId, balance, level })
          const asset = townAsset(item.assetKey)
          return (
            <div key={item.id} className="bg-white rounded-2xl card-shadow p-3 flex flex-col items-center text-center gap-1">
              <div className="w-12 h-12 flex items-center justify-center text-3xl">
                {asset ? (
                  <img src={asset} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" />
                ) : (
                  <span aria-hidden="true">{item.emoji}</span>
                )}
              </div>
              <p className="text-sm font-black text-gray-800">{item.name}</p>
              <p className="text-xs text-gray-400">{item.nameEn}</p>
              <p className="text-xs font-bold text-emerald-600">${item.price}</p>

              {state === 'owned' && (
                <span className="min-h-[44px] w-full flex items-center justify-center text-xs font-black text-emerald-500">
                  보유 ✓
                </span>
              )}
              {state === 'locked' && (
                <button
                  type="button"
                  onClick={() => handleCardTap(item, state)}
                  className="min-h-[44px] w-full rounded-xl bg-gray-100 text-gray-400 text-xs font-black btn-press"
                >
                  🔒 Level {item.minLevel}에서 열려요
                </button>
              )}
              {state === 'insufficient' && (
                <button
                  type="button"
                  onClick={() => handleCardTap(item, state)}
                  className="min-h-[44px] w-full rounded-xl bg-orange-50 text-orange-500 text-xs font-black btn-press"
                >
                  💵 {shortfall(item, balance)} 더 필요
                </button>
              )}
              {state === 'purchasing' && (
                <span className="min-h-[44px] w-full flex items-center justify-center gap-1 rounded-xl bg-purple-50 text-purple-400 text-xs font-black">
                  <span className="inline-block w-3 h-3 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  구매 중…
                </span>
              )}
              {state === 'buyable' && (
                <button
                  type="button"
                  onClick={() => handleCardTap(item, state)}
                  className="min-h-[44px] w-full rounded-xl bg-purple-500 text-white text-sm font-black btn-press hover:bg-purple-600"
                >
                  구매
                </button>
              )}
            </div>
          )
        })}
      </div>

      {confirmItem && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmItem(null)}
        >
          <div className="bg-white rounded-3xl card-shadow p-5 max-w-sm w-full animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <p className="text-center font-black text-gray-800 mb-1">
              {confirmItem.name} {formatDollars(confirmItem.price)}
            </p>
            <p className="text-center text-xs text-gray-400 mb-4">
              → 남는 별 💵{formatDollars(Math.max(0, balance - confirmItem.price))}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                className="flex-1 min-h-[44px] rounded-2xl bg-gray-100 text-gray-500 font-black btn-press"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmPurchase}
                className="flex-1 min-h-[44px] rounded-2xl bg-purple-500 text-white font-black btn-press"
              >
                사기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
