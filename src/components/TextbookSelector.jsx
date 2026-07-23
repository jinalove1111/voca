// v3.1(2026-07-22, 도메인 모델 교정) — 교재 선택기.
// 계층: 반(사람 그룹) → 교재 → 유닛. 이 컴포넌트는 "교재" 축만 담당하고,
// 옵션 목록은 App.jsx가 모드에 따라 만든다:
//   · 교재 모드(supabase_v3_1_textbooks.sql 실행 후): 학생의 사람 반에
//     연결된 교재들(class_textbooks) — 전환은 setPrimaryTextbook(사람 반
//     불변, students.current_unit_id만 동기화).
//   · 레거시 모드(실행 전): v2.9 다중 반 배정 그대로 — 전환은
//     setPrimaryAssignment. 옵션 1개 이하면 아무것도 렌더하지 않는다
//     (기존 학생 화면 변화 0 — v2.9와 동일한 계약).
// 상호작용 패턴(select + 전환 중 disabled + 인라인 에러)은 유닛 셀렉트와
// 동일(새 패턴 발명 없음 — v2.9 결정 그대로 유지).
export default function TextbookSelector({ options, currentId, switching, error, onSwitch }) {
  if (!Array.isArray(options) || options.length <= 1) return null

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
