// src/components/RewardCard.jsx — Reward System V1(2026-08-15, Phase 2).
//
// 순수 표시 전용 컴포넌트 — 훅(useStudent 등)을 직접 쓰지 않는다. 모든
// 값은 props로만 받는다(호출부, Dashboard.jsx가 studentData에서 이미
// 파생된 원시값만 내려준다). 이 카드 자체는 상태를 갖지 않고, 지급/판정
// 로직은 한 줄도 없다(그 책임은 rewardEngine.js + useStudent.js).
//
// 한 줄~두 줄 컴팩트 표시(모바일 한 화면 방해 금지, 높이 작게). 운영자
// 지시(2026-08-17)로 접힌 <details> 밖, 대시보드 메인 영역에 항상 보이는
// 위치로 이동 — 흰 배경 형제 카드들(오늘의 미션 등)과 같은 rounded-3xl
// card-shadow 리듬에 맞춰 배경/글자색만 조정(보라색 그라디언트 카드 내부
// 전용이었던 이전 색상을 흰 카드용으로 교체, 정보 항목은 전부 그대로).
export default function RewardCard({ totalStars, streak, categoriesCompletedToday, level, starsToNext }) {
  return (
    <div className="bg-white rounded-3xl card-shadow px-4 py-3 text-center">
      <p className="text-gray-700 text-xs font-bold leading-relaxed">
        ⭐ {totalStars} · 🔥 {streak}일 · 🎯 오늘 {categoriesCompletedToday}/4 · Lv.{level}
      </p>
      <p className="text-gray-400 text-[11px] mt-0.5">
        {starsToNext === null ? '최고 레벨!' : `다음 보상까지 ⭐ ${starsToNext}개`}
      </p>
    </div>
  )
}
