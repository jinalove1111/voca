// src/components/town/v2/TownGroundLayer.jsx — Paul Town V2-A 바닥 레이어
// (2026-09-13, 2026-09-13 비주얼 폴리시 — 칸별 패치 제거).
//
// 크림→따뜻한 톤→모스그린 그라데이션 배경 + 산울타리(hedge) 테두리·상단
// 밴드 + ~6개의 고정 유기적 블롭(organic blob)으로 톤 변화를 준다. 이전
// 버전은 칸(x,y)마다 둥근 사각 패치를 하나씩 그려 8x6 격자 리듬이 눈에
// 보였다(코디네이터 스크린샷 피드백, 2026-09-13) — 이번 버전은 칸 수와
// 무관한 고정 개수(6개)의 큰 블러 블롭만 그려 격자감을 없앤다. CSS
// grid를 쓰지 않고(칸 경계선이 보이지 않아야 함) 퍼센트 좌표만 쓴다 —
// 장식용이라 aria-hidden + pointer-events-none.
import { Z_LAYERS } from '../../../utils/town/townScene'
import { ambientClassFor } from '../../../utils/town/townAmbient'

// 고정 결정론 위치 6개(칸 좌표와 무관 — 장면 퍼센트로 직접 지정).
// ambientClassFor(i, i*2)로 톤만 townAmbient.js(순수 도메인)에서 그대로
// 빌려 쓴다(새 팔레트 발명 없음).
const BLOBS = [
  { left: 8, top: 6, w: 46, h: 14 },
  { left: 55, top: 18, w: 40, h: 12 },
  { left: -5, top: 38, w: 38, h: 10 },
  { left: 60, top: 62, w: 45, h: 12 },
  { left: 10, top: 74, w: 50, h: 12 },
  { left: 50, top: 88, w: 42, h: 10 },
]

const HEDGE_BAND_STYLE = {
  backgroundImage: 'radial-gradient(circle, rgba(88,130,70,0.55) 0 45%, transparent 50%)',
  backgroundSize: '14px 14px',
}

export default function TownGroundLayer() {
  return (
    <div
      className="absolute inset-0 rounded-[28px] border-4 border-[#8fb37a]/60 bg-gradient-to-b from-[#fdebd0] via-[#e8ecd2] to-[#cfe3c0] overflow-hidden pointer-events-none"
      style={{ zIndex: Z_LAYERS.ground }}
      aria-hidden="true"
    >
      {BLOBS.map((b, i) => {
        const toneClass = ambientClassFor(i, i * 2) || 'bg-[#cfe3c0]/20'
        return (
          <span
            key={i}
            className={`absolute rounded-[50%] blur-2xl opacity-60 pointer-events-none ${toneClass}`}
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
              zIndex: Z_LAYERS.patches,
            }}
          />
        )
      })}

      {/* 다듬어진 산울타리(hedge) 테두리 — 안쪽 링 + 상단 텍스처 밴드. */}
      <div
        className="absolute inset-0 rounded-[28px] shadow-[inset_0_0_0_7px_rgba(143,179,122,0.55)] pointer-events-none"
        style={{ zIndex: Z_LAYERS.patches }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[3.5%] pointer-events-none"
        style={{ ...HEDGE_BAND_STYLE, zIndex: Z_LAYERS.patches }}
      />
    </div>
  )
}
