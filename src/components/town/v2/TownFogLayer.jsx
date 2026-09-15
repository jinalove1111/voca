// src/components/town/v2/TownFogLayer.jsx — Paul Town V2-B 안개 지평선
// 레이어(2026-09-16 재작성).
//
// 2026-09-13 버전은 8x6 균일 그리드의 마지막 2행(FOG_START_ROW=4)을 덮는
// 밴드였다. 월드 지오메트리 확장 이후로는 행이 아니라 "현재 보이는 구역
// 스택 맨 위(가장 최근에 잠긴 구역 바로 위)"에 얹히는 진짜 지평선 밴드다
// (docs/design/town/WORLD_LAYOUT_REDESIGN_2026-09-16.md §2 fog district,
// wireframe의 renderFog()). 위치/높이는 townScene.js의 FOG_HEIGHT_UNITS/
// sceneHeightUnits(level)로 계산하고(레벨<8일 때만 그 높이가 씬 총합에
// 포함됨 — anchorFor 등 다른 레이어와 동일 계산 기준을 공유), 표시 여부·
// 실루엣·칩 텍스트는 여전히 기존 fogState()가 만든 fog prop을 그대로 쓴다
// (새 카피 발명 없음 — 작업 지시서 6번). TownGroundLayer.jsx도 이 밴드를
// 그릴 수 있었지만(지시서가 어느 파일이 소유해도 된다고 명시), 중복 없이
// 이 파일이 유일하게 소유한다.
import { Z_LAYERS, sceneHeightUnits, FOG_HEIGHT_UNITS } from '../../../utils/town/townScene'

export default function TownFogLayer({ fog, level = 1 }) {
  if (!fog || !fog.visible) return null
  const total = sceneHeightUnits(level)
  const heightPct = total > 0 ? (FOG_HEIGHT_UNITS / total) * 100 : 0

  return (
    <div
      className="absolute inset-x-0 top-0 pointer-events-none bg-gradient-to-b from-[#fdebd0]/80 to-white flex flex-col items-center justify-end pb-2 gap-1 overflow-hidden backdrop-blur-[1px]"
      style={{ height: `${heightPct}%`, zIndex: Z_LAYERS.fog }}
      data-testid="town-fog"
      aria-label={`다음 잠금 해제: Lv.${fog.nextLevel}`}
    >
      {/* 다음 구역의 대표 건물을 흐릿한 실루엣(그레이스케일+블러)으로만
          암시 — 새 아트 없음, 기존 fogState() 이모지를 그대로 재사용한다. */}
      <div className="flex gap-2">
        {fog.silhouettes.map((s) => (
          <span key={s.id} className="text-xl opacity-35 grayscale blur-[1px]" aria-hidden="true">{s.emoji}</span>
        ))}
      </div>
      <span className="bg-white/90 text-[#1e2a5a] text-[10px] font-black rounded-full px-3 py-1">{fog.chip}</span>
    </div>
  )
}
