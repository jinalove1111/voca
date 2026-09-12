// src/components/town/v2/TownObjectLayer.jsx — Paul Town V2-A 오브젝트
// 레이어(2026-09-13).
//
// 고정 집(HOME_CELL, 절대 탭 불가) + 배치된 아이템들을 bottom-anchor로
// 그린다. 각 아이템은 44px+ 버튼으로 감싸 탭하면(idle 모드에서만) 이동/
// 보관 미니 액션 팝오버를 연다 — 이 파일은 openPlacementId를 소유하지
// 않고 부모(TownScene.jsx)가 넘겨준 값/콜백만 쓴다(V1 TownGrid와 동일
// 정신, 소유권만 부모로 옮김).
import TownSprite from './TownSprite'
import {
  HOME_CELL, HOME_SPRITE, anchorFor, zIndexFor, spriteFor, Z_LAYERS, FOOTPRINT_CLASS, SCENE_COLS,
} from '../../../utils/town/townScene'

export default function TownObjectLayer({
  placements, itemById, modeKind, openPlacementId, onTogglePlacement, onStartMove, onStore,
}) {
  const list = Array.isArray(placements) ? placements.filter(Boolean) : []
  const homeAnchor = anchorFor(HOME_CELL.x, HOME_CELL.y)
  const idle = modeKind === 'idle'

  return (
    <div className="absolute inset-0" style={{ zIndex: Z_LAYERS.objects }}>
      <div
        aria-label="My House"
        data-testid="town-home"
        className={`absolute ${FOOTPRINT_CLASS[HOME_SPRITE.footprint]}`}
        style={{
          left: `${homeAnchor.leftPct}%`,
          top: `${homeAnchor.bottomPct}%`,
          transform: 'translate(-50%, -100%)',
          zIndex: zIndexFor(HOME_CELL.y),
        }}
      >
        <TownSprite sprite={HOME_SPRITE} className="w-full h-full" />
      </div>

      {list.map((p) => {
        const item = itemById && itemById[p.itemId]
        const sprite = spriteFor(item)
        const anchor = anchorFor(p.x, p.y)
        const isOpen = openPlacementId === p.placementId
        const popoverAlign = p.x <= 1 ? 'left-0' : p.x >= SCENE_COLS - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'
        const label = `${sprite.label || (item ? item.name : p.itemId)} — 눌러서 이동하거나 보관해요`

        return (
          <div
            key={p.placementId}
            data-placement-id={p.placementId}
            data-item-id={p.itemId}
            data-cell={`${p.x},${p.y}`}
            className={`absolute ${FOOTPRINT_CLASS[sprite.footprint]}`}
            style={{
              left: `${anchor.leftPct}%`,
              top: `${anchor.bottomPct}%`,
              transform: 'translate(-50%, -100%)',
              zIndex: zIndexFor(p.y),
            }}
          >
            <button
              type="button"
              onClick={() => { if (idle) onTogglePlacement && onTogglePlacement(p.placementId) }}
              disabled={!idle}
              aria-label={label}
              className="min-h-[44px] min-w-[44px] w-full flex items-center justify-center"
            >
              <TownSprite sprite={sprite} className="w-full h-full" />
            </button>

            {isOpen && (
              <div
                className={`absolute top-full mt-1 flex gap-1 bg-white rounded-2xl card-shadow p-1 whitespace-nowrap ${popoverAlign}`}
                style={{ zIndex: Z_LAYERS.popover }}
              >
                <button
                  type="button"
                  onClick={() => onStartMove && onStartMove(p.placementId)}
                  className="min-h-[44px] px-3 rounded-xl bg-purple-100 text-purple-600 text-xs font-black btn-press"
                >
                  이동
                </button>
                <button
                  type="button"
                  onClick={() => onStore && onStore(p.placementId)}
                  className="min-h-[44px] px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-black btn-press"
                >
                  보관
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
