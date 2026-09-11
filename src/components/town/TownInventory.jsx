// src/components/town/TownInventory.jsx — Paul Town V1 보관함(2026-09-11).
//
// 보관함 = 소유(owned) - 마을에 놓인 것. "마을에 놓기"는 배치 모드로
// 들어가며 부모(TownScreen)가 탭을 내 마을로 전환한다. 이미 놓인 아이템도
// 함께 목록화해 "위치 옮기기"로 이동 모드를 시작할 수 있다(보관 중이
// 아니라 마을에 있다는 사실을 정직하게 표시).
import { townAsset } from '../../assets/town'

export default function TownInventory({ items, ownedIds, placements, onPlaceStart, onMoveStart, onGoShop }) {
  const owned = Array.isArray(ownedIds) ? ownedIds : []
  const placementByItemId = {}
  for (const p of (Array.isArray(placements) ? placements : [])) {
    if (p) placementByItemId[p.itemId] = p
  }
  const ownedItems = (Array.isArray(items) ? items : []).filter((it) => it && owned.includes(it.id))
  const notPlaced = ownedItems.filter((it) => !placementByItemId[it.id])
  const placed = ownedItems.filter((it) => placementByItemId[it.id])

  if (ownedItems.length === 0) {
    // PHASE 4(2026-09-11) — 빈 보관함 안내 + 상점 탭으로 바로 이동하는
    // 버튼(부모 TownScreen이 탭 전환을 소유, 여기선 콜백만 호출).
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-gray-400">상점에서 첫 아이템을 사보세요 🌳</p>
        <button
          type="button"
          onClick={() => onGoShop && onGoShop()}
          className="min-h-[44px] px-5 mx-auto rounded-2xl bg-purple-500 text-white text-sm font-black btn-press hover:bg-purple-600"
        >
          🛒 상점으로 가기
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {notPlaced.length > 0 && (
        <div>
          <h3 className="font-black text-gray-700 text-sm mb-2">마을에 놓을 수 있어요</h3>
          <div className="grid grid-cols-2 gap-2">
            {notPlaced.map((item) => {
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
                  <button
                    type="button"
                    onClick={() => onPlaceStart && onPlaceStart(item.id)}
                    className="min-h-[44px] w-full rounded-xl bg-purple-500 text-white text-xs font-black btn-press hover:bg-purple-600"
                  >
                    마을에 놓기
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {placed.length > 0 && (
        <div>
          <h3 className="font-black text-gray-700 text-sm mb-2">마을에 있어요</h3>
          <div className="space-y-2">
            {placed.map((item) => {
              const placement = placementByItemId[item.id]
              return (
                <div key={item.id} className="bg-white rounded-2xl card-shadow p-3 flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0" aria-hidden="true">{item.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-sm text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-400">보관 중 아님 · 마을에 있어요</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onMoveStart && onMoveStart(placement.placementId)}
                    className="min-h-[44px] px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-black btn-press flex-shrink-0"
                  >
                    위치 옮기기
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
