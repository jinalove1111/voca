// src/components/town/v2/TownAmbientLayer.jsx — Paul Town V2-A 정원 앰비언트
// 레이어(2026-09-13).
//
// gardenRichness(gardenPoints)의 stage/windowsLit/ivy/birds만 읽어 집
// 주변에 결정론적으로 장식(꽃/창문 불빛/담쟁이/새)을 더한다 — 경제
// 데이터(별/달러/카탈로그)는 이 레이어에서 전혀 다루지 않는다. 순수
// 장식이라 aria-hidden + pointer-events-none(스크린리더용 sr-only 문장
// 하나만 예외).
import { HOME_CELL, SCENE_ROWS, SCENE_COLS, anchorFor, Z_LAYERS } from '../../../utils/town/townScene'

const STAGE_EMOJI = {
  0: [],
  1: ['🌱', '🌱'],
  2: ['🌷', '🌱', '🌷'],
  3: ['🌷', '🌻', '🌷', '🌼'],
  4: ['🌳', '🌷', '🌻', '🌼', '🐦'],
}

const OFFSETS = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 0, dy: -1 },
]

export default function TownAmbientLayer({ richness, gardenPoints }) {
  const r = richness || { stage: 0, windowsLit: false, ivy: false, birds: false }
  const emojis = STAGE_EMOJI[r.stage] || []
  const homeAnchor = anchorFor(HOME_CELL.x, HOME_CELL.y)
  const points = Number.isFinite(Number(gardenPoints)) && Number(gardenPoints) > 0 ? Number(gardenPoints) : 0

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ zIndex: Z_LAYERS.patches }}>
      {r.windowsLit && (
        <div
          className="absolute w-[16%] h-[10%] bg-[#e0a73a]/40 blur-md rounded-full motion-safe:animate-pulse"
          style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.topPct}%`, transform: 'translate(-50%, -50%)' }}
        />
      )}
      {emojis.map((emoji, i) => {
        const off = OFFSETS[i % OFFSETS.length]
        const x = Math.max(0, Math.min(SCENE_COLS - 1, HOME_CELL.x + off.dx))
        const y = Math.max(0, Math.min(SCENE_ROWS - 1, HOME_CELL.y + off.dy))
        const a = anchorFor(x, y)
        return (
          <span
            key={i}
            className="absolute text-lg"
            style={{ left: `${a.leftPct}%`, top: `${a.bottomPct}%`, transform: 'translate(-50%, -100%)' }}
          >
            {emoji}
          </span>
        )
      })}
      {r.ivy && (
        <span
          className="absolute text-base"
          style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.bottomPct}%`, transform: 'translate(40%, -30%)' }}
        >
          🌿
        </span>
      )}
      {r.birds && (
        <span
          className="absolute text-base motion-safe:animate-bounce"
          style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.topPct}%`, transform: 'translate(120%, -120%)' }}
        >
          🐦
        </span>
      )}
      <p className="sr-only">배운 단어 {points}개로 정원이 자라고 있어요</p>
    </div>
  )
}
