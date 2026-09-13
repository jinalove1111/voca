// src/components/town/v2/TownScene.jsx — Paul Town V2-A 스토리북 마을 장면
// (2026-09-13).
//
// 기존 8x6 좌표계(townLayout.js)와 경제/배치 데이터는 전부 부모
// (TownScreenV2.jsx)가 소유·전달한다 — 이 컴포넌트는 좌표를 퍼센트
// 앵커로 바꿔 레이어 순서대로 쌓아 그리는 순수 렌더러다. openPlacementId
// (어느 아이템 팝오버가 열려 있는지)만 이 화면 스코프에서 로컬로
// 소유한다(V1 TownGrid와 동일 정신).
import { useState } from 'react'
import TownGroundLayer from './TownGroundLayer'
import TownPathLayer from './TownPathLayer'
import TownAmbientLayer from './TownAmbientLayer'
import TownObjectLayer from './TownObjectLayer'
import TownFogLayer from './TownFogLayer'
import TownPlacementOverlay from './TownPlacementOverlay'
import { freeAnchors } from '../../../utils/town/townScene'

export default function TownScene({
  placements, itemById, mode, onCellTap, onStartMove, onStore, richness, gardenPoints, fog,
}) {
  const [openPlacementId, setOpenPlacementId] = useState(null)
  const modeKind = (mode && mode.kind) || 'idle'

  function handleTogglePlacement(placementId) {
    setOpenPlacementId((cur) => (cur === placementId ? null : placementId))
  }

  function handleStartMove(placementId) {
    setOpenPlacementId(null)
    onStartMove && onStartMove(placementId)
  }

  function handleStore(placementId) {
    setOpenPlacementId(null)
    onStore && onStore(placementId)
  }

  function handleAnchorTap(x, y) {
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
