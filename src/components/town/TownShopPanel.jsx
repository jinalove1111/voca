// src/components/town/TownShopPanel.jsx — Paul Town V1 상점 패널(2026-09-11).
//
// 카테고리 탭 + 아이템 카드(보유/잠김/부족/구매 가능/구매 중 5상태,
// townCatalog.itemState가 유일한 판정 로직) + 구매 확인 시트. 소유권/
// 잔액의 진실 원천은 항상 서버(townShop.state) — 여기서는 balance -
// item.price 같은 "남는 금액 미리보기"만 로컬로 계산하고(구매 확인 문구용,
// 실제 차감이 아님), ⭐(별)에서 💵(잔액)을 역산하는 계산은 절대 하지
// 않는다.
import { useState, useEffect } from 'react'
import { TOWN_CATEGORIES, itemState, shortfall, groupByCategory } from '../../utils/town/townCatalog'
import { TOWN_LEVELS } from '../../utils/town/townLevel'
import { TOWN_PHRASES } from '../../utils/town/townMessages'
import { formatDollars } from '../../utils/townShop'
import { townAsset } from '../../assets/town'
// PHASE 4(2026-09-11) — 빈 상점(잔액 0 & 보유 0) 안내 카드에 쓰는 보상
// 금액은 절대 하드코딩하지 않고 rewardEngine.REWARD_STARS를 그대로
// 읽는다(학업 보상 로직의 유일한 진실 원천, rewardEngine.js 헤더 원칙).
import { REWARD_STARS } from '../../utils/rewardEngine'

// TOWN_LEVELS는 level(1-based) 배열 — 별 임계값을 잠금 카드 안내에 쓴다.
function starsForLevel(level) {
  const entry = TOWN_LEVELS[Math.max(1, Number(level) || 1) - 1]
  return entry ? entry.min : 0
}

// 2026-09-15c — 배포 이후 해시 자산이 사라지면(CDN 정리/배포 스킵) <img>가
// 깨진 이미지 아이콘을 그대로 노출하던 격차(전체 여정 감사 P2). V2
// TownSprite.jsx와 동일하게 onError 1회 → 이모지 폴백(재시도 없음,
// assetKey가 바뀌면 다음 자산은 다시 시도). 파일 내부 로컬 컴포넌트로
// 두어 기존 정적 계약(이 파일에 <img loading="lazy" decoding="async">가
// 존재)을 그대로 만족시킨다.
function ItemThumb({ asset, assetKey, emoji }) {
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => { setLoadFailed(false) }, [assetKey])
  if (asset && !loadFailed) {
    return <img src={asset} alt="" loading="lazy" decoding="async" onError={() => setLoadFailed(true)} className="w-full h-full object-contain" />
  }
  return <span aria-hidden="true">{emoji}</span>
}

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

  // 2026-09-15c — 실패 경로 fail-safe. 실측 결함 2건:
  //   (1) 서버 SQL(supabase_v3_47_town_shop.sql:157)과 mock이 돌려주는
  //       사유는 'insufficient'인데 여기서는 'insufficient_funds'만 봐서
  //       서버측 잔액 부족 거절(클라이언트 잔액이 stale-high일 때)이 죽은
  //       분기였다 — 둘 다 받는다. 부족액은 서버가 알려준 balanceAfter
  //       (applyPurchaseResult가 헤더 잔액도 같은 값으로 정정)로 계산해
  //       안내 문구와 헤더가 항상 일치하게 한다.
  //   (2) in_flight/network_failed/rpc_failed/relogin_required 등 나머지
  //       실패는 아무 안내 없이 시트만 닫혀 아이가 "눌렀는데 아무 일도
  //       안 일어남"을 겪었다 — busy/failed 안내로 갈라 보여준다.
  //   onPurchase가 throw해도(unhandled rejection) 동일하게 failed로 흡수.
  // 경제/가격/서버 계약/소유권 판정은 전부 무변경(서버가 여전히 유일한
  // 진실 원천, 여기서는 그 결과를 안내할 뿐).
  async function handleConfirmPurchase() {
    const item = confirmItem
    setConfirmItem(null)
    if (!item || !onPurchase) return
    let res
    try {
      res = await onPurchase(item.id)
    } catch {
      res = { ok: false, reason: 'client_error' }
    }
    if (res && res.ok) {
      onGuide && onGuide('purchase_success', { name: item.name })
    } else if (res && (res.reason === 'insufficient' || res.reason === 'insufficient_funds')) {
      const knownBalance = Number.isFinite(Number(res.balanceAfter)) ? Number(res.balanceAfter) : balance
      onGuide && onGuide('insufficient', { shortfall: shortfall(item, knownBalance) })
    } else if (res && res.reason === 'locked') {
      onGuide && onGuide('locked', { level: item.minLevel })
    } else if (res && res.reason === 'in_flight') {
      onGuide && onGuide('purchase_busy', { name: item.name })
    } else {
      onGuide && onGuide('purchase_failed', { name: item.name })
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-bold text-purple-400">{TOWN_PHRASES.learnEarn}</p>

      {/* PHASE 4(2026-09-11) — 잔액 0 & 보유 0(첫 방문)일 때만 보이는
          안내 카드. 숫자는 REWARD_STARS에서만 읽는다(하드코딩 금지). */}
      {Number(balance) === 0 && (Array.isArray(ownedIds) ? ownedIds.length : 0) === 0 && (
        <div className="bg-amber-50 rounded-2xl p-3 text-center">
          <p className="text-xs font-bold text-amber-700">
            아직 💵가 없어요 — 오늘 단어 공부를 끝내면 💵{REWARD_STARS['word-session-complete']}, 쓰기 5문제 맞히면 💵{REWARD_STARS['writing-complete']}!
          </p>
        </div>
      )}

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
                <ItemThumb asset={asset} assetKey={item.assetKey} emoji={item.emoji} />
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
                <>
                  <button
                    type="button"
                    onClick={() => handleCardTap(item, state)}
                    className="min-h-[44px] w-full rounded-xl bg-gray-100 text-gray-400 text-xs font-black btn-press"
                  >
                    🔒 Level {item.minLevel}에서 열려요
                  </button>
                  {/* PHASE 4(2026-09-11) — 목표 별 개수를 숫자로 보여준다. */}
                  <p className="text-[11px] text-gray-400">Level {item.minLevel} = ⭐{starsForLevel(item.minLevel)}</p>
                </>
              )}
              {state === 'insufficient' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleCardTap(item, state)}
                    className="min-h-[44px] w-full rounded-xl bg-orange-50 text-orange-500 text-xs font-black btn-press"
                  >
                    💵 {shortfall(item, balance)} 더 필요
                  </button>
                  {/* PHASE 4(2026-09-11) — 공부하면 💵가 모인다는 것을 상기. */}
                  <p className="text-[11px] text-gray-400">(공부하면 모여요)</p>
                </>
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
