// src/components/town/v2/TownGroundLayer.jsx — Paul Town V2-A 바닥 레이어
// (2026-09-13).
//
// 크림→따뜻한 톤→모스그린 그라데이션 배경 + 산울타리(hedge) 테두리 +
// 결정론 ambient 톤 패치(townAmbient.js, 좌표별 항상 같은 결과). CSS
// grid를 쓰지 않고(칸 경계선이 보이지 않아야 함) anchorFor()의 퍼센트
// 좌표로만 패치를 배치한다 — 장식용이라 aria-hidden + pointer-events-none.
import { SCENE_ROWS, SCENE_COLS, anchorFor, Z_LAYERS } from '../../../utils/town/townScene'
import { ambientClassFor, depthClassFor } from '../../../utils/town/townAmbient'

export default function TownGroundLayer() {
  const patches = []
  for (let y = 0; y < SCENE_ROWS; y++) {
    for (let x = 0; x < SCENE_COLS; x++) {
      const toneClass = ambientClassFor(x, y)
      if (!toneClass) continue
      const { leftPct, topPct } = anchorFor(x, y)
      patches.push({ x, y, toneClass, depthClass: depthClassFor(y, SCENE_ROWS), leftPct, topPct })
    }
  }

  return (
    <div
      className="absolute inset-0 rounded-[28px] border-4 border-[#8fb37a]/60 bg-gradient-to-b from-[#fdebd0] via-[#e8ecd2] to-[#cfe3c0] overflow-hidden pointer-events-none"
      style={{ zIndex: Z_LAYERS.ground }}
      aria-hidden="true"
    >
      {patches.map((p) => (
        <span
          key={`${p.x},${p.y}`}
          className={`absolute rounded-full pointer-events-none ${p.toneClass} ${p.depthClass}`}
          style={{
            left: `${p.leftPct}%`,
            top: `${p.topPct}%`,
            width: `${100 / SCENE_COLS}%`,
            height: `${100 / SCENE_ROWS}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: Z_LAYERS.patches,
          }}
        />
      ))}
    </div>
  )
}
