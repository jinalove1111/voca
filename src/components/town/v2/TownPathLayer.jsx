// src/components/town/v2/TownPathLayer.jsx — Paul Town V2-A 자갈길 레이어
// (2026-09-13).
//
// LANE_ROW를 가로지르는 자갈길 밴드(cobblestone, radial-gradient 패턴만
// 씀 — 새 이미지 없음) + 집(HOME_CELL)에서 그 길까지 내려오는 짧은
// 세로 길. 순수 장식이라 aria-hidden + pointer-events-none.
import { LANE_ROW, SCENE_ROWS, HOME_CELL, Z_LAYERS, anchorFor } from '../../../utils/town/townScene'

const COBBLE_STYLE = {
  backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(30,42,90,0.10) 0 30%, transparent 32%)',
  backgroundSize: '18px 14px',
}

export default function TownPathLayer() {
  const laneTopPct = (LANE_ROW / SCENE_ROWS) * 100
  const laneHeightPct = (1 / SCENE_ROWS) * 100
  const homeAnchor = anchorFor(HOME_CELL.x, HOME_CELL.y)
  const spurHeightPct = Math.max(0, laneTopPct - homeAnchor.bottomPct)

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: Z_LAYERS.path }} aria-hidden="true">
      <div
        className="absolute left-2 right-2 rounded-full border-y-2 border-[#1e2a5a]/10 bg-[#d9d2c5]"
        style={{ top: `${laneTopPct}%`, height: `${laneHeightPct}%`, ...COBBLE_STYLE }}
      />
      {spurHeightPct > 0 && (
        <div
          className="absolute w-[7%] max-w-[18px] bg-[#d9d2c5] rounded-full"
          style={{
            left: `${homeAnchor.leftPct}%`,
            top: `${homeAnchor.bottomPct}%`,
            height: `${spurHeightPct}%`,
            transform: 'translateX(-50%)',
          }}
        />
      )}
    </div>
  )
}
