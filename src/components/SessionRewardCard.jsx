import { useEffect } from 'react'
import { formatRewardLines, withGardenGrowth } from '../utils/rewardSummary'
// 정원 "단계" 변환(gardenStageTotal)은 attachment/worldProgress.js가 이미
// 가진 유일한 계산(재구현 금지, EnglishGarden.jsx도 이 파일을 그대로
// import) — 컴포넌트 레이어는 attachment/* import가 허용된다(레이어 계약,
// 금지는 useStudent.js 같은 훅 레이어에만 적용, 2026-09-03 P1 회귀 수정).
import { gardenStageTotal } from '../utils/attachment/worldProgress'

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
  // useStudent.js는 정원 성장 원시값(gardenRawBefore/gardenRawAfter)만
  // 넘긴다(레이어 계약, useStudent.js 헤더 주석 참고) — 여기서 "단계"
  // 총합으로 변환해 gardenGrowth를 확정한다. 두 값이 없으면(레거시 경로로
  // 이미 gardenGrowth가 채워진 요약) 그대로 둔다.
  const hasRawGardenValues = summary.gardenRawBefore !== null && summary.gardenRawBefore !== undefined
    && summary.gardenRawAfter !== null && summary.gardenRawAfter !== undefined
  const resolvedSummary = hasRawGardenValues
    ? withGardenGrowth(summary, gardenStageTotal(summary.gardenRawBefore), gardenStageTotal(summary.gardenRawAfter))
    : summary
  const lines = formatRewardLines(resolvedSummary)
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
