// src/components/town/TownGrid.jsx — Paul Town V1 8x6 마을 격자(2026-09-11).
//
// 8x6 CSS grid — 크림→따뜻한 톤→초록 그라데이션 배경, 가운데 자갈길 행,
// 남색 테두리(전부 CSS만, 새 배경 이미지 없음). HOME_CELL(고정 🏠 My
// House)은 절대 탭 불가. 다른 칸은 mode(idle/placing/moving)에 따라
// 탭 동작이 달라진다:
//   - idle: 빈 칸은 반응 없음, 놓인 아이템은 이동/보관 미니 액션 스트립을
//     연다(로컬 open 상태, 부모 상태 변경 없음).
//   - placing/moving: 빈 칸을 탭하면 onCellTap(x,y)를 호출(부모가 실제
//     배치/이동을 수행). 놓인 칸은 이 모드에서 탭 무시(충돌 방지).
import { useState } from 'react'
import { TOWN_GRID, HOME_CELL } from '../../utils/town/townLayout'
import { townAsset } from '../../assets/town'

export default function TownGrid({ placements, itemById, mode, onCellTap, onStartMove, onStore }) {
  const [openPlacementId, setOpenPlacementId] = useState(null)
  const modeKind = (mode && mode.kind) || 'idle'
  const midRow = Math.floor(TOWN_GRID.rows / 2)
  const list = Array.isArray(placements) ? placements : []
  const byCell = {}
  for (const p of list) {
    if (p) byCell[`${p.x},${p.y}`] = p
  }

  function isHomeCell(x, y) {
    return x === HOME_CELL.x && y === HOME_CELL.y
  }

  function handleCellClick(x, y) {
    if (isHomeCell(x, y)) return
    const placed = byCell[`${x},${y}`]
    if (placed) {
      if (modeKind === 'idle') {
        setOpenPlacementId((cur) => (cur === placed.placementId ? null : placed.placementId))
      }
      return
    }
    setOpenPlacementId(null)
    if (modeKind === 'placing' || modeKind === 'moving') {
      onCellTap && onCellTap(x, y)
    }
  }

  const cells = []
  for (let y = 0; y < TOWN_GRID.rows; y++) {
    for (let x = 0; x < TOWN_GRID.cols; x++) cells.push({ x, y })
  }

  return (
    <div className="max-w-lg mx-auto">
      <div
        className="grid gap-1 rounded-3xl p-2 border-2 border-[#1e2a5a]/20 bg-gradient-to-b from-[#fdebd0] via-[#f6e3c8] to-[#cfe3c0]"
        style={{ gridTemplateColumns: `repeat(${TOWN_GRID.cols}, minmax(0, 1fr))` }}
      >
        {cells.map(({ x, y }) => {
          const home = isHomeCell(x, y)
          const placed = !home ? byCell[`${x},${y}`] : null
          const item = placed ? itemById && itemById[placed.itemId] : null
          const isPath = !home && y === midRow
          const isOpen = !!placed && openPlacementId === placed.placementId
          const asset = item ? townAsset(item.assetKey) : null
          const label = home
            ? 'My House'
            : placed
              ? `${item ? item.name : placed.itemId} — 눌러서 이동하거나 보관해요`
              : `빈 칸 (${x + 1}, ${y + 1})`

          return (
            <div key={`${x},${y}`} className="relative aspect-square">
              <button
                type="button"
                onClick={() => handleCellClick(x, y)}
                aria-label={label}
                disabled={home}
                className={`w-full h-full rounded-xl flex items-center justify-center leading-none ${
                  home
                    ? 'bg-purple-100 border-2 border-purple-300'
                    : isPath
                      ? 'bg-[#d9d2c5]'
                      : 'bg-white/40 border border-[#1e2a5a]/10'
                }`}
                style={{ fontSize: 'clamp(0.85rem, 4vw, 1.5rem)' }}
              >
                {home && <span aria-hidden="true">🏠</span>}
                {!home && placed && asset && (
                  <img src={asset} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" />
                )}
                {!home && placed && !asset && (
                  <span aria-hidden="true">{item ? item.emoji : '🎁'}</span>
                )}
              </button>
              {isOpen && (
                <div className="absolute z-10 left-1/2 top-full -translate-x-1/2 mt-1 flex gap-1 bg-white rounded-2xl card-shadow p-1 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => { setOpenPlacementId(null); onStartMove && onStartMove(placed.placementId) }}
                    className="min-h-[44px] px-3 rounded-xl bg-purple-100 text-purple-600 text-xs font-black btn-press"
                  >
                    이동
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpenPlacementId(null); onStore && onStore(placed.placementId) }}
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
      <p className="text-center text-xs text-gray-400 mt-2">🏠 My House · 아이템을 눌러 이동하거나 보관해요</p>
    </div>
  )
}
