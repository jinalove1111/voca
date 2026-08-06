// v3.1(2026-07-22, 도메인 모델 교정) — 교재 선택기.
// 계층: 반(사람 그룹) → 교재 → 유닛. 이 컴포넌트는 "교재" 축만 담당하고,
// 옵션 목록은 App.jsx가 모드에 따라 만든다:
//   · 교재 모드(supabase_v3_1_textbooks.sql 실행 후): 학생의 사람 반에
//     연결된 교재들(class_textbooks) — 전환은 setPrimaryTextbook(사람 반
//     불변, students.current_unit_id만 동기화).
//   · 레거시 모드(실행 전): v2.9 다중 반 배정 그대로 — 전환은
//     setPrimaryAssignment.
// 상호작용 패턴(select + 전환 중 disabled + 인라인 에러)은 유닛 셀렉트와
// 동일(새 패턴 발명 없음 — v2.9 결정 그대로 유지).
//
// 2026-08-06 P1(운영자 지시) — 교재가 1개뿐인 반(예: Presentation 6 -2026)
// 에서 학생 홈에 교재 축 자체가 안 보인다는 보고. 실제 원인은 "옵션 1개
// 이하면 아무것도 렌더하지 않는다"는 v2.9~v3.1 계약(과거 이 주석에 그렇게
// 명시돼 있었음) — 그 계약을 여기서 변경한다: 옵션이 정확히 1개면 선택
// UI(select) 대신 "교재: <이름>" 정적 텍스트로 항상 보여준다(운영자 지시
// "교재가 하나뿐이면 선택값을 표시하되 불필요한 조작은 최소화한다"). 옵션
// 0개(교재 미배정)는 기존 그대로 비렌더.
export default function TextbookSelector({ options, currentId, switching, error, onSwitch }) {
  if (!Array.isArray(options) || options.length === 0) return null

  // 옵션이 1개뿐이고 currentId가 그 옵션과 일치(또는 currentId 자체가 없음)하면
  // 조작 불필요한 정적 표시. currentId가 그 1개 옵션과 다르면(캐시 갱신 지연
  // 예외) 아래 select 경로로 내려가 "(현재 교재)" 방어 옵션이 살아있게 한다.
  if (options.length === 1 && (!currentId || currentId === options[0].id)) {
    return (
      <div className="text-sm text-purple-200 mt-1 flex items-center justify-center gap-1.5 flex-wrap">
        <span>교재: {options[0].label}</span>
        {error && <p className="text-xs font-bold text-yellow-200 w-full">⚠️ {error}</p>}
      </div>
    )
  }

  return (
    <div className="text-sm text-purple-200 mt-1 flex items-center justify-center gap-1.5 flex-wrap">
      <span>교재:</span>
      <label className="inline-flex items-center gap-1">
        <span className="sr-only">교재 선택</span>
        <select
          value={currentId || ''}
          disabled={switching}
          onChange={(e) => onSwitch(e.target.value)}
          className="bg-white/20 text-white font-bold rounded-xl px-2 py-2.5 text-sm border-2 border-white/30 focus:outline-none focus:border-white/70 disabled:opacity-60 appearance-auto"
        >
          {/* 현재 교재가 옵션에 아직 없는 예외(캐시 갱신 지연)에도 빈 값 방지 — 유닛 셀렉트의 동일 방어 패턴 */}
          {currentId && !options.some((o) => o.id === currentId) && (
            <option value={currentId}>(현재 교재)</option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.id} className="text-gray-800">
              {o.label}
            </option>
          ))}
        </select>
        {switching && <span className="text-xs">⏳</span>}
      </label>
      {error && <p className="text-xs font-bold text-yellow-200 w-full">⚠️ {error}</p>}
    </div>
  )
}
