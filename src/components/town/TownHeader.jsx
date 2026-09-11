// src/components/town/TownHeader.jsx — Paul Town V1 상단 상태 바(2026-09-11).
//
// ⭐ 마을 레벨(누적 별, 절대 줄지 않음) + 다음 레벨까지 진행바 + 💵 사용
// 가능한 Paul Dollar. 잔액은 오직 부모(TownScreen)가 넘겨주는
// dollarsAvailable(=townShop.state.dollars.available) 그대로 표시만 한다
// — 여기서 별에서 잔액을 역산하지 않는다(별=성취, 달러=상점 화폐, 완전히
// 분리된 두 값).
import { TOWN_LEVELS, starsToNextTownLevel } from '../../utils/town/townLevel'
import { formatDollars } from '../../utils/townShop'

export default function TownHeader({ level, starsEarned, dollarsAvailable }) {
  const lvl = Math.max(1, Number.isFinite(Number(level)) ? Number(level) : 1)
  const stars = Math.max(0, Number.isFinite(Number(starsEarned)) ? Number(starsEarned) : 0)
  const { nextLevel, remaining } = starsToNextTownLevel(stars)
  const curEntry = TOWN_LEVELS.find((e) => e.level === lvl) || TOWN_LEVELS[0]
  const nextEntry = nextLevel != null ? TOWN_LEVELS.find((e) => e.level === nextLevel) : null
  const span = nextEntry ? Math.max(1, nextEntry.min - curEntry.min) : 1
  const progressed = nextEntry ? Math.min(span, Math.max(0, stars - curEntry.min)) : span
  const pct = Math.round((progressed / span) * 100)

  return (
    <div className="bg-white rounded-3xl card-shadow p-3 flex items-center gap-2">
      <span
        className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-black px-2.5 py-1.5 rounded-full flex-shrink-0"
        title="누적 별(성취) — 절대 줄지 않아요"
      >
        ⭐ Lv.{lvl}
      </span>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-0.5 text-center whitespace-nowrap overflow-hidden text-ellipsis">
          {nextEntry ? `다음 레벨까지 ⭐ ${remaining}` : '최고 레벨이에요!'}
        </p>
      </div>
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
        <span
          className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-black px-2.5 py-1.5 rounded-full"
          title="사용 가능한 Paul Dollar"
        >
          💵 {formatDollars(dollarsAvailable)}
        </span>
        {/* PHASE 4(2026-09-11) — 학습→보상 연결 캡션. 1줄, 12px 이상(text-xs). */}
        <p className="text-xs text-gray-400 whitespace-nowrap">공부하면 💵가 생겨요</p>
      </div>
    </div>
  )
}
