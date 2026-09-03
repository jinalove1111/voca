import { useEffect } from 'react'
import { formatRewardLines } from '../utils/rewardSummary'

// src/components/SessionRewardCard.jsx — Session Reward Summary(P1, 2026-09-03).
//
// RewardToast.jsx와 같은 정신의 props-only 표시 컴포넌트(훅 직접 사용
// 없음) — summary(rewardSummary.buildSessionRewardSummary 결과)와
// onDismiss만 받는다. 모달 아님(배경 클릭 차단 없음), 학습 흐름을 절대
// 막지 않는다. 화면 하단 고정(RewardToast는 상단 고정이라 겹치지 않음),
// 최대 max-w-sm, ~2.5초 뒤 자동 dismiss, 탭하면 즉시 dismiss. 사운드/
// 색종이 없음 — 짧은 슬라이드업 애니메이션만(기존 animate-slide-up 재사용,
// 신규 keyframes 추가 없음, CLAUDE.md 규칙 6).
//
// z-index는 z-40 — GiftReveal(z-50, 전체화면 오버레이)/HatCeremony류
// 축하 연출이 항상 이 카드보다 위에 그려지도록(요구사항 5번: "GiftReveal/
// HatCeremony 오버레이보다 낮아서 절대 그것들을 가리지 않는다").
const AUTO_DISMISS_MS = 2500

export default function SessionRewardCard({ summary, onDismiss }) {
  useEffect(() => {
    if (!summary) return undefined
    const t = setTimeout(() => onDismiss && onDismiss(), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary])

  if (!summary) return null
  const lines = formatRewardLines(summary)
  if (lines.length === 0) return null

  return (
    <div
      onClick={() => onDismiss && onDismiss()}
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-sm animate-slide-up bg-white rounded-3xl card-shadow btn-press cursor-pointer select-none px-5 py-4"
      role="status"
    >
      <div className="flex flex-col gap-1 items-center text-center">
        {lines.map((line, i) => (
          <p key={i} className={i === 0 ? 'text-base font-black text-gray-900' : 'text-sm font-bold text-gray-600'}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
