// src/components/town/v2/TownFogLayer.jsx — Paul Town V2-A 잠금 안개 레이어
// (2026-09-13).
//
// fogState(catalog, level)이 visible:false면 아무것도 그리지 않는다(잠긴
// 아이템이 하나도 없을 때). visible이면 장면 하단(마을 광장·마을 바깥
// 행)을 옅은 안개로 덮고, 다음 레벨에서 열리는 아이템 실루엣(최대 3개) +
// "⭐ Lv.N에서 열려요" 칩을 보여준다. 경제 데이터를 새로 계산하지 않고
// fog prop 그대로 표시만 한다.
import { SCENE_ROWS, Z_LAYERS } from '../../../utils/town/townScene'

const FOG_START_ROW = 4

export default function TownFogLayer({ fog }) {
  if (!fog || !fog.visible) return null
  const topPct = (FOG_START_ROW / SCENE_ROWS) * 100

  return (
    <div
      className="absolute left-0 right-0 bottom-0 pointer-events-none bg-gradient-to-t from-white/85 via-white/60 to-transparent backdrop-blur-[1px] flex flex-col items-center justify-start pt-3 gap-2"
      style={{ top: `${topPct}%`, zIndex: Z_LAYERS.fog }}
      data-testid="town-fog"
      aria-label={`다음 잠금 해제: Lv.${fog.nextLevel}`}
    >
      <div className="flex gap-2">
        {fog.silhouettes.map((s) => (
          <span key={s.id} className="text-2xl opacity-30 grayscale blur-[1px]" aria-hidden="true">{s.emoji}</span>
        ))}
      </div>
      <span className="bg-white/90 text-[#1e2a5a] text-xs font-black rounded-full px-3 py-1">{fog.chip}</span>
    </div>
  )
}
