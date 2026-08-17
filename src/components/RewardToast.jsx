import { useEffect } from 'react'

// src/components/RewardToast.jsx — Reward System V1(2026-08-15, Phase 2).
//
// 화면 상단 고정 소형 토스트 — 훅(useStudent 등) 직접 사용 없음, props로만
// 받는다(entries: rewardFeedback 배열, onDismiss: dismissRewardFeedback).
// 모달/오버레이 아님(배경 클릭 차단 없음, pointer-events는 토스트 자기
// 자신에게만) — 학습 흐름을 절대 막지 않는다. 각 항목은 1.5초 후 자동
// dismiss, 클릭하면 즉시 dismiss. 기존 tailwind.config.js의
// animate-slide-up(0.4s 등장) 키프레임을 그대로 재사용(새 keyframes 추가
// 없음, CLAUDE.md 규칙 6 — 외부 의존성/신규 애니메이션 최소화).
function RewardToastItem({ entry, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(entry.id), 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id])

  return (
    <div
      onClick={() => onDismiss(entry.id)}
      className="pointer-events-auto animate-slide-up bg-gray-900/90 text-white font-black text-sm px-4 py-2 rounded-2xl card-shadow cursor-pointer select-none">
      {entry.text}
    </div>
  )
}

export default function RewardToast({ entries, onDismiss }) {
  if (!Array.isArray(entries) || entries.length === 0) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {entries.map((entry) => (
        <RewardToastItem key={entry.id} entry={entry} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
