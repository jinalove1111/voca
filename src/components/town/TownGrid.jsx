// src/components/town/TownGrid.jsx — Paul Town V1 8x6 마을 격자(2026-09-11,
// 2026-09-15 마을 장면 비주얼 업그레이드 — 격자(checkerboard) 인상 제거).
//
// 좌표/클릭 판정은 그대로 8x6 격자다 — 바뀐 건 오직 겉모습이다. 칸별
// bg-white/40 테두리 사각형(체스판처럼 보이는 원인)을 없애고, 대신
// V2(TownGroundLayer.jsx/TownPathLayer.jsx)에서 이미 검증된 것과 동일한
// CSS-only 기법(그라데이션 바닥 + 연속된 자갈길 밴드, 새 배경 이미지
// 없음)을 이 grid 컨테이너 밑에 절대배치 레이어 하나로 깐다. 칸(버튼)은
// idle일 땐 투명해 바닥이 그대로 비쳐 보이고, placing/moving일 때만 빈
// 칸에 점선 원 안내가 뜬다(V2 TownPlacementOverlay.jsx와 같은 원리) —
// 배치 완료/취소 즉시 mode가 idle로 돌아가므로 안내도 함께 사라진다.
// ambientClassFor/depthClassFor(townAmbient.js, 2026-09-12에 이미 만들어졌지만
// 그 세션엔 배선하지 않았던 순수 함수 — 새 팔레트 발명 없이 재사용)로
// 칸마다 미묘한 톤 차이를 줘 격자 리듬이 보이지 않게 한다.
// HOME_CELL(고정 🏠 My House)은 절대 탭 불가. 다른 칸은 mode(idle/
// placing/moving)에 따라 탭 동작이 달라진다:
//   - idle: 빈 칸은 반응 없음, 놓인 아이템은 이동/보관 미니 액션 스트립을
//     연다(로컬 open 상태, 부모 상태 변경 없음).
//   - placing/moving: 빈 칸을 탭하면 onCellTap(x,y)를 호출(부모가 실제
//     배치/이동을 수행). 놓인 칸은 이 모드에서 탭 무시(충돌 방지).
import { useState, useEffect } from 'react'
import { TOWN_GRID, HOME_CELL } from '../../utils/town/townLayout'
import { townAsset } from '../../assets/town'
import { ambientClassFor, depthClassFor } from '../../utils/town/townAmbient'

// V2 TownPathLayer.jsx와 동일한 자갈길(cobblestone) 패턴 — radial-gradient
// 점무늬만 쓰고 이미지 자산은 추가하지 않는다.
const COBBLE_STYLE = {
  backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(30,42,90,0.10) 0 30%, transparent 32%)',
  backgroundSize: '18px 14px',
}

// V2 TownGroundLayer.jsx와 동일한 산울타리(hedge) 상단 텍스처 — "정원을
// 둘러싼 담장/산울타리" 느낌을 새 이미지 없이 CSS만으로 준다.
const HEDGE_BAND_STYLE = {
  backgroundImage: 'radial-gradient(circle, rgba(88,130,70,0.55) 0 45%, transparent 50%)',
  backgroundSize: '14px 14px',
}

// 2026-09-15 — TownSprite.jsx(V2)에 이미 있는 런타임 이미지 로드 실패
// 폴백을 V1에도 미러링(전체 여정 감사에서 발견된 기존 격차, P2) — 해시
// 자산이 배포 이후 사라져도 깨진 이미지 아이콘 대신 이모지로 전환한다.
function CellSprite({ assetKey, asset, emoji }) {
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => { setLoadFailed(false) }, [assetKey])
  if (asset && !loadFailed) {
    return (
      <img
        src={asset}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setLoadFailed(true)}
        className="relative w-full h-full object-contain"
      />
    )
  }
  return <span aria-hidden="true" className="relative">{emoji || '🎁'}</span>
}

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

  // 자갈길 밴드 위치(가운데 행) — V2 TownPathLayer.jsx와 동일한 퍼센트 계산.
  const laneTopPct = (midRow / TOWN_GRID.rows) * 100
  const laneHeightPct = (1 / TOWN_GRID.rows) * 100

  return (
    <div className="max-w-lg mx-auto">
      {/* 2026-09-11 터치 타겟 40px 보장 — 8칸을 각각 40px 이상으로 확보하면
          360~390px 폭 화면에서는 그리드가 뷰포트보다 넓어진다. 페이지 전체가
          가로로 밀리지 않도록 이 wrapper 안에서만 가로 스크롤되게 하고(모바일
          규칙: 넓은 콘텐츠는 자기 컨테이너 안에서 스크롤), 마지막 줄의 이동/
          보관 액션 스트립이 잘리지 않도록 아래 여백(pb-16)을 넉넉히 둔다. */}
      <div className="overflow-x-auto -mx-2 px-2 pb-16">
        <div
          className="relative grid gap-1 rounded-3xl p-2 border-4 border-[#8fb37a]/60"
          style={{ gridTemplateColumns: `repeat(${TOWN_GRID.cols}, minmax(40px, 1fr))` }}
        >
        {/* 마을 바닥(장식) — 칸과 무관한 연속 레이어 하나. overflow-hidden으로
            자갈길 밴드 모서리를 rounded-3xl 안에 가둔다(부모 grid 컨테이너
            자체엔 overflow-hidden을 안 둬 아래 이동/보관 팝오버가 안 잘림).
            산울타리(hedge) 안쪽 링 + 상단 텍스처 밴드는 V2 TownGroundLayer.jsx
            와 동일한 기법 — 정원을 담장이 둘러싼 느낌을 새 이미지 없이 준다. */}
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden bg-gradient-to-b from-[#fdebd0] via-[#f6e3c8] to-[#cfe3c0] pointer-events-none"
          aria-hidden="true"
        >
          <div
            className="absolute left-0 right-0 border-y-2 border-[#1e2a5a]/10 bg-[#d9d2c5]"
            style={{ top: `${laneTopPct}%`, height: `${laneHeightPct}%`, ...COBBLE_STYLE }}
          />
          <div className="absolute inset-0 rounded-3xl shadow-[inset_0_0_0_6px_rgba(143,179,122,0.45)]" />
          <div className="absolute inset-x-0 top-0 h-[3%]" style={HEDGE_BAND_STYLE} />
        </div>
        {cells.map(({ x, y }) => {
          const home = isHomeCell(x, y)
          const placed = !home ? byCell[`${x},${y}`] : null
          const item = placed ? itemById && itemById[placed.itemId] : null
          const isPath = !home && y === midRow
          const isOpen = !!placed && openPlacementId === placed.placementId
          const isEmpty = !home && !placed
          const showPlacementGuide = isEmpty && (modeKind === 'placing' || modeKind === 'moving')
          const asset = item ? townAsset(item.assetKey) : null
          const ambientTint = (!home && !isPath) ? (ambientClassFor(x, y) || '') : ''
          const depthTone = !home ? depthClassFor(y, TOWN_GRID.rows) : ''
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
                className={`relative w-full h-full rounded-xl flex items-center justify-center leading-none ${depthTone} ${
                  home
                    ? 'bg-[radial-gradient(circle,rgba(253,235,208,0.85)_0%,transparent_72%)]'
                    : `bg-transparent ${ambientTint}`
                }`}
                style={{ fontSize: 'clamp(0.85rem, 4vw, 1.5rem)' }}
              >
                {home && <span aria-hidden="true">🏠</span>}
                {/* 2026-09-15 — 배치 안내는 칸 전체를 채우는 점선 사각형이
                    아니라 V2 TownPlacementOverlay.jsx와 동일하게 칸 중앙의
                    작은 원 하나로 최소화한다("체스판처럼 보이지 않게" —
                    코디네이터 지시). */}
                {showPlacementGuide && (
                  <span aria-hidden="true" className="absolute w-[45%] h-[45%] max-w-7 max-h-7 rounded-full border-2 border-dashed border-[#e0a73a]/70 bg-[#fdebd0]/50 motion-safe:animate-pulse" />
                )}
                {!home && placed && (
                  <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3/5 h-1.5 rounded-full bg-black/15 blur-[1px]" />
                )}
                {!home && placed && (
                  <CellSprite assetKey={placed.itemId} asset={asset} emoji={item ? item.emoji : '🎁'} />
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
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">🏠 My House · 아이템을 눌러 이동하거나 보관해요</p>
    </div>
  )
}
