// src/components/town/v2/TownHud.jsx — Paul Town V2-A 나무 팻말 HUD
// (2026-09-13).
//
// ⭐ 마을 레벨(누적 별) + 💵 사용 가능한 Paul Dollar + 다음 레벨 진행바 +
// 다음 목표 안내(goal.text, townScene.nearGoal()) + 상점/보관함 진입
// 버튼. V1 TownHeader와 동일하게 잔액/별을 서로 역산하지 않고 부모가
// 넘겨준 값만 표시한다.
import { TOWN_LEVELS, starsToNextTownLevel } from '../../../utils/town/townLevel'
import { formatDollars } from '../../../utils/townShop'

export default function TownHud({ level, starsEarned, dollarsAvailable, goal, onOpenShop, onOpenInventory }) {
  const lvl = Math.max(1, Number.isFinite(Number(level)) ? Number(level) : 1)
  const stars = Math.max(0, Number.isFinite(Number(starsEarned)) ? Number(starsEarned) : 0)
  const { nextLevel } = starsToNextTownLevel(stars)
  const curEntry = TOWN_LEVELS.find((e) => e.level === lvl) || TOWN_LEVELS[0]
  const nextEntry = nextLevel != null ? TOWN_LEVELS.find((e) => e.level === nextLevel) : null
  const span = nextEntry ? Math.max(1, nextEntry.min - curEntry.min) : 1
  const progressed = nextEntry ? Math.min(span, Math.max(0, stars - curEntry.min)) : span
  const pct = Math.round((progressed / span) * 100)

  return (
    <div className="relative bg-gradient-to-b from-[#fdebd0] to-[#f6e3c8] border-2 border-[#8b6f3e]/40 rounded-2xl p-1">
      <div className="bg-white/90 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-black px-2.5 py-1.5 rounded-full flex-shrink-0"
            title="누적 별(성취) — 절대 줄지 않아요"
          >
            ⭐ Lv.{lvl}
          </span>
          <span
            className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-black px-2.5 py-1.5 rounded-full flex-shrink-0"
            title="사용 가능한 Paul Dollar"
          >
            💵 {formatDollars(dollarsAvailable)}
          </span>
          <p className="text-xs text-gray-400 whitespace-nowrap">공부하면 💵가 생겨요</p>
        </div>

        <div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p data-testid="town-goal" className="text-xs text-gray-500 whitespace-normal break-words mt-0.5">
            {goal ? goal.text : ''}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenShop}
            data-testid="town-open-shop"
            className="flex-1 min-h-[44px] rounded-2xl text-sm font-black btn-press bg-[#1e2a5a] text-white"
          >
            🛒 상점
          </button>
          <button
            type="button"
            onClick={onOpenInventory}
            data-testid="town-open-inventory"
            className="flex-1 min-h-[44px] rounded-2xl text-sm font-black btn-press bg-white text-[#1e2a5a] border border-[#1e2a5a]/20"
          >
            🎁 보관함
          </button>
        </div>
      </div>
    </div>
  )
}
