// src/components/town/v2/TownAmbientLayer.jsx — Paul Town V2-A 정원 앰비언트
// 레이어(2026-09-13).
//
// gardenRichness(gardenPoints)의 stage/windowsLit/ivy/birds만 읽어 집
// 주변에 결정론적으로 장식(꽃/창문 불빛/담쟁이/새)을 더한다 — 경제
// 데이터(별/달러/카탈로그)는 이 레이어에서 전혀 다루지 않는다. 순수
// 장식이라 aria-hidden + pointer-events-none(스크린리더용 sr-only 문장
// 하나만 예외).
import { HOME_CELL, anchorFor, Z_LAYERS } from '../../../utils/town/townScene'

const STAGE_EMOJI = {
  0: [],
  1: ['🌱', '🌱'],
  2: ['🌷', '🌱', '🌷'],
  3: ['🌷', '🌻', '🌷', '🌼'],
  4: ['🌳', '🌷', '🌻', '🌼', '🐦'],
}

export default function TownAmbientLayer({ richness, gardenPoints }) {
  const r = richness || { stage: 0, windowsLit: false, ivy: false, birds: false }
  const emojis = STAGE_EMOJI[r.stage] || []
  const homeAnchor = anchorFor(HOME_CELL.x, HOME_CELL.y)
  const points = Number.isFinite(Number(gardenPoints)) && Number(gardenPoints) > 0 ? Number(gardenPoints) : 0

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ zIndex: Z_LAYERS.patches }}>
      {/* 집 옆 화단(garden bed) — 항상 그린다. stage emoji들을 여기 안에
          모아 담아(flex-wrap) "화단"으로 읽히게 한다 — stage 0(아직
          아무것도 안 자람)은 옅은 새싹 하나만 보여줘 "자랄 준비가 된
          빈 화단"임을 알린다. */}
      <div
        className="absolute rounded-[50%] bg-[#c9a227]/15 border border-[#8fb37a]/40 flex flex-wrap items-center justify-center gap-0.5 overflow-hidden"
        style={{ left: '2%', top: '12%', width: '30%', height: '22%' }}
      >
        {r.stage === 0 ? (
          <span className="text-lg opacity-40">🌱</span>
        ) : (
          emojis.map((emoji, i) => (
            <span key={i} className="text-base leading-none">{emoji}</span>
          ))
        )}
      </div>

      {r.windowsLit && (
        <div
          className="absolute w-[16%] h-[10%] bg-[#e0a73a]/40 blur-md rounded-full motion-safe:animate-pulse"
          style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.topPct}%`, transform: 'translate(-50%, -50%)' }}
        />
      )}
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
