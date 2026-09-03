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

// ── P4 "유닛 완료 보상" 축하(2026-09-03, flag unitCompleteReward) ────────
// summary.unitComplete가 있으면(rewardSummary.buildSessionRewardSummary가
// entries에서 unit-complete 항목을 찾아 실어준 값, useStudent.js 재구현
// 아님) "big" 변형으로 렌더 — 더 큰 헤딩 + 결정적(랜덤 아님) 코스메틱
// 이모지 한 줄. 자동 닫힘도 일반(2.5초)보다 길게(3.5초) — 축하를 조금 더
// 오래 보여준다.
const BIG_AUTO_DISMISS_MS = 3500

// P7 "서프라이즈"(코스메틱 전용, 경제/희소성 없음, 감사 §13 원칙 3) —
// 이 목록 중 어떤 것을 보여줄지는 unitId의 순수 해시로 결정된다(같은
// 유닛은 항상 같은 줄 — Math.random 없음, 재현 가능).
const COSMETIC_ROWS = ['🎉✨🎊', '🌟🎆🌟', '🎈🎉🎈', '✨🎉✨', '🎊🌟🎊']

// 문자열 → 0 이상 정수(간단한 순수 해시, 암호학적 용도 아님 — 코스메틱
// 선택에만 쓴다). 같은 입력은 항상 같은 출력(결정론).
function hashString(value) {
  const str = String(value || '')
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

export default function SessionRewardCard({ summary, onDismiss }) {
  const isBig = !!(summary && summary.unitComplete)
  const autoDismissMs = isBig ? BIG_AUTO_DISMISS_MS : AUTO_DISMISS_MS
  useEffect(() => {
    if (!summary) return undefined
    const t = setTimeout(() => onDismiss && onDismiss(), autoDismissMs)
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
  // big 변형은 lines가 비어 있어도(이론상 도달 불가 — unit-complete 자체가
  // +5★ 항목이라 stars 줄이 항상 있다) 축하 헤딩만은 보여준다. 일반
  // 변형은 기존 그대로 "보여줄 줄이 없으면 아무것도 렌더하지 않음".
  if (!isBig && lines.length === 0) return null

  const cosmeticRow = isBig ? COSMETIC_ROWS[hashString(summary.unitComplete.unitId) % COSMETIC_ROWS.length] : null

  return (
    <div
      onClick={() => onDismiss && onDismiss()}
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-sm animate-slide-up bg-white rounded-3xl card-shadow btn-press cursor-pointer select-none px-5 py-4"
      role="status"
    >
      <div className="flex flex-col gap-1 items-center text-center">
        {isBig && (
          <p className="text-xl font-black text-gray-900">📘 유닛 완료!</p>
        )}
        {isBig && cosmeticRow && (
          <p aria-hidden="true" className="text-2xl leading-none">{cosmeticRow}</p>
        )}
        {lines.map((line, i) => (
          <p key={i} className={i === 0 && !isBig ? 'text-base font-black text-gray-900' : 'text-sm font-bold text-gray-600'}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
