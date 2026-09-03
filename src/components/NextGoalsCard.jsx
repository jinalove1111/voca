// src/components/NextGoalsCard.jsx — P3 "다음 목표(Next Goals)" 위젯
// (2026-09-03, docs/REWARD_LOOP_AUDIT_2026-09-03.md §14 P3).
//
// RewardCard.jsx와 같은 원칙 — 순수 표시 전용, 훅 없음, 지급/판정 로직
// 0줄(그 책임은 src/utils/nextGoals.js). 오늘(short)/다음(medium)/장기
// (long) 3줄만 컴팩트하게 보여준다 — 버튼/모달 없음, 탭해도 아무 화면
// 전환이 없다(연구 브리프 §3 "즉각적이면서 정보성인 피드백" — 다음에
// 뭘 하면 되는지 텍스트로만 알려주는 것이 목적).
//
// 진행률 바는 nextGoals.js가 이미 계산한 pct(항상 최소 10%, endowed
// progress)를 그대로 width%로 쓴다 — 이 컴포넌트는 0%로 시작하는 바를
// 만들지 않는다.
import { formatGoalLine } from '../utils/nextGoals'

const ROWS = [
  { key: 'short', title: '오늘' },
  { key: 'medium', title: '다음' },
  { key: 'long', title: '장기' },
]

// 한 줄 말줄임 표시(overflow-hidden + text-ellipsis + whitespace-nowrap
// 조합) — 긴 라벨도 카드 높이를 늘리지 않고 한 줄로 잘려 보인다.
const ONE_LINE_CLASS = 'overflow-hidden text-ellipsis whitespace-nowrap'

export default function NextGoalsCard({ goals }) {
  if (!goals) return null
  return (
    <div className="bg-white rounded-3xl card-shadow px-4 py-3 space-y-2.5">
      {ROWS.map(({ key, title }) => {
        const goal = goals[key]
        if (!goal) return null
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 w-6 shrink-0">{title}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-bold text-gray-700 leading-tight ${ONE_LINE_CLASS}`}>
                {formatGoalLine(goal)}
              </p>
              <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-pink-500 rounded-full"
                  style={{ width: `${goal.pct}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
