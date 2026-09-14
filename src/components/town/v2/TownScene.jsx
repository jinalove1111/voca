// src/components/town/v2/TownScene.jsx — Paul Town V2-A 스토리북 마을 장면
// (2026-09-13).
//
// 기존 8x6 좌표계(townLayout.js)와 경제/배치 데이터는 전부 부모
// (TownScreenV2.jsx)가 소유·전달한다 — 이 컴포넌트는 좌표를 퍼센트
// 앵커로 바꿔 레이어 순서대로 쌓아 그리는 순수 렌더러다. openPlacementId
// (어느 아이템 팝오버가 열려 있는지)만 이 화면 스코프에서 로컬로
// 소유한다(V1 TownGrid와 동일 정신).
//
// 2026-09-14 — 배치 팝오버 바깥 탭 닫기(V2B_V2C_ROADMAP.md 1.3절, 이전엔
// 같은 아이템 재탭만 닫혔음). objects 레이어(z=10)보다 낮은 z-index(8)의
// 투명 백드롭을 팝오버가 열려 있을 때만 깔아, 아이템 버튼 자체는 그대로
// 위에서 클릭되고(다른 아이템 직접 전환 유지) 빈 공간 탭만 백드롭에
// 잡혀 닫히게 한다. Escape로도 닫히고(TownSheet.jsx와 동일 관례), 닫힐 때
// 그 팝오버를 열었던 버튼으로 포커스를 복귀한다(TownSheet.jsx의 포커스
// 복귀 패턴과 동일 정신).
import { useState, useEffect, useRef } from 'react'
import TownGroundLayer from './TownGroundLayer'
import TownPathLayer from './TownPathLayer'
import TownAmbientLayer from './TownAmbientLayer'
import TownObjectLayer from './TownObjectLayer'
import TownFogLayer from './TownFogLayer'
import TownPlacementOverlay from './TownPlacementOverlay'
import { freeAnchors, Z_LAYERS } from '../../../utils/town/townScene'

export default function TownScene({
  placements, itemById, mode, onCellTap, onStartMove, onStore, richness, gardenPoints, fog,
}) {
  const [openPlacementId, setOpenPlacementId] = useState(null)
  const modeKind = (mode && mode.kind) || 'idle'
  const triggerRef = useRef(null)

  function closePopover() {
    setOpenPlacementId(null)
    const el = triggerRef.current
    if (el && typeof el.focus === 'function' && document.contains(el)) el.focus()
    triggerRef.current = null
  }

  function handleTogglePlacement(placementId, triggerEl) {
    setOpenPlacementId((cur) => {
      if (cur === placementId) {
        triggerRef.current = null
        return null
      }
      triggerRef.current = triggerEl || null
      return placementId
    })
  }

  // Escape로 팝오버 닫기(열려 있을 때만 리스너 부착 — TownSheet.jsx와 동일 관례)
  useEffect(() => {
    if (openPlacementId == null) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') closePopover()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPlacementId])

  function handleStartMove(placementId) {
    triggerRef.current = null
    setOpenPlacementId(null)
    onStartMove && onStartMove(placementId)
  }

  function handleStore(placementId) {
    triggerRef.current = null
    setOpenPlacementId(null)
    onStore && onStore(placementId)
  }

  function handleAnchorTap(x, y) {
    triggerRef.current = null
    setOpenPlacementId(null)
    onCellTap && onCellTap(x, y)
  }

  return (
    <div className="max-w-lg mx-auto">
      <div
        data-testid="town-scene-v2"
        role="group"
        aria-label="내 마을"
        className="relative w-full overflow-hidden rounded-[28px] card-shadow"
        style={{ aspectRatio: '8 / 13' }}
      >
        <TownGroundLayer />
        <TownPathLayer />
        <TownAmbientLayer richness={richness} gardenPoints={gardenPoints} />
        {openPlacementId != null && (
          <button
            type="button"
            data-testid="town-scene-backdrop"
            aria-label="팝오버 닫기"
            onClick={closePopover}
            className="absolute inset-0 w-full h-full cursor-default"
            style={{ zIndex: Z_LAYERS.fog + 1 }}
          />
        )}
        <TownObjectLayer
          placements={placements}
          itemById={itemById}
          modeKind={modeKind}
          openPlacementId={openPlacementId}
          onTogglePlacement={handleTogglePlacement}
          onStartMove={handleStartMove}
          onStore={handleStore}
        />
        <TownFogLayer fog={fog} />
        {modeKind !== 'idle' && (
          <TownPlacementOverlay
            anchors={freeAnchors(placements, mode)}
            onAnchorTap={handleAnchorTap}
            modeKind={modeKind}
          />
        )}
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">🏡 My House · 아이템을 눌러 이동하거나 보관해요</p>
    </div>
  )
}
