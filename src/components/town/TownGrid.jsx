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
// British World Phase 2(2026-09-12) — 안전 프로토타입 실배선. 둘 다 순수
// 함수/조회이고 배치/이동/보관 판정(townLayout.js)에는 관여하지 않는다
// (COMPONENT_ARCHITECTURE.md §2/§3/§4). ambientClassFor/depthClassFor는
// 셀 버튼의 기존 className에 톤만 덧붙이고(신규 DOM 0), TownDiscoveryCard는
// 이미 열려 있는 이동/보관 액션 스트립 안에만 추가로 렌더된다(새 모달 0,
// UX_FLOW.md §7).
import { ambientClassFor, depthClassFor } from '../../utils/town/townAmbient'
import { placeKeyForItemId } from '../../utils/town/townDiscovery'
import TownDiscoveryCard from './TownDiscoveryCard'

export default function TownGrid({ placements, itemById, mode, onCellTap, onStartMove, onStore, studentId }) {
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
      {/* 2026-09-11 터치 타겟 40px 보장 — 8칸을 각각 40px 이상으로 확보하면
          360~390px 폭 화면에서는 그리드가 뷰포트보다 넓어진다. 페이지 전체가
          가로로 밀리지 않도록 이 wrapper 안에서만 가로 스크롤되게 하고(모바일
          규칙: 넓은 콘텐츠는 자기 컨테이너 안에서 스크롤), 마지막 줄의 이동/
          보관 액션 스트립이 잘리지 않도록 아래 여백(pb-16)을 넉넉히 둔다. */}
      <div className="overflow-x-auto -mx-2 px-2 pb-16">
        <div
          className="grid gap-1 rounded-3xl p-2 border-2 border-[#1e2a5a]/20 bg-gradient-to-b from-[#fdebd0] via-[#f6e3c8] to-[#cfe3c0]"
          style={{ gridTemplateColumns: `repeat(${TOWN_GRID.cols}, minmax(40px, 1fr))` }}
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

          // British World Phase 2 — 이 칸이 발견 콘텐츠를 가진 장소인지
          // (bookshop/post-box/cafe/clock-tower/garden/school 6종만, 나머지
          // 11종은 discovery=null 그대로) isOpen일 때만 계산(불필요한 호출
          // 방지, 순수 함수라 호출 비용 자체는 낮음).
          const discoveryPlaceKey = placed ? placeKeyForItemId(placed.itemId) : null

          return (
            <div key={`${x},${y}`} className={`relative aspect-square ${depthClassFor(y, TOWN_GRID.rows)}`}>
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
                      : `bg-white/40 border border-[#1e2a5a]/10 ${ambientClassFor(x, y)}`
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
                <div className="absolute z-10 left-1/2 top-full -translate-x-1/2 mt-1 flex flex-col gap-1 bg-white rounded-2xl card-shadow p-1 min-w-[160px]">
                  <div className="flex gap-1 whitespace-nowrap">
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
                  {/* British World Phase 2 — 새 모달 아님, 이미 열린 액션
                      스트립 안의 인라인 카드(UX_FLOW.md §7). 이동/보관
                      버튼과 별개 행이라 클릭 판정 간섭 0. */}
                  {discoveryPlaceKey && (
                    <TownDiscoveryCard itemId={placed.itemId} studentId={studentId} />
                  )}
                </div>
              )}
            </div>
          )
        })}
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">🏠 My House · 아이템을 눌러 이동하거나 보관해요</p>
    </div>
  )
}
