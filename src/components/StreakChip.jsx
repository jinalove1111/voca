// src/components/StreakChip.jsx — 대시보드 헤더 스트릭(🔥) 배지, Streak V2
// 배선(P6, docs/REWARD_LOOP_AUDIT_2026-09-03.md §14, 2026-09-03)을 위해
// Dashboard.jsx 인라인 마크업에서 분리한 작은 프레젠테이션 컴포넌트.
//
// 계약: `v2`가 없으면(null/undefined, streakV2 플래그 OFF이거나 history가
// 아직 없을 때) 예전 Dashboard.jsx 인라인 마크업과 완전히 동일한 마크업만
// 렌더한다 — 이 파일을 도입해도 플래그 OFF 학생 화면은 바이트 단위로
// 동일해야 한다(scripts/testStreakV2Wiring.mjs SSR 단언이 이 계약을
// 고정한다). `v2`가 있으면(computeStreakV2 결과) current/best/
// protectedThisWeek를 추가로 보여준다 — 어떤 보상도 여기서 지급하지
// 않는다(순수 표시).
export default function StreakChip({ streak, v2 }) {
  if (v2) {
    if (!(v2.current > 0)) return null
    return (
      <div className="flex items-center gap-1 bg-orange-100 px-3 py-2 rounded-2xl">
        <span className="text-lg">🔥</span>
        <span className="font-black text-orange-600 text-sm">
          {v2.current}일{v2.protectedThisWeek ? ' · 🛡️ 보호됨' : ''}
        </span>
        {v2.best > v2.current && (
          <span className="text-orange-500 text-[10px] font-bold ml-1">최고 {v2.best}일</span>
        )}
      </div>
    )
  }
  if (!(streak > 0)) return null
  return (
    <div className="flex items-center gap-1 bg-orange-100 px-3 py-2 rounded-2xl">
      <span className="text-lg">🔥</span>
      <span className="font-black text-orange-600 text-sm">{streak}일</span>
    </div>
  )
}
