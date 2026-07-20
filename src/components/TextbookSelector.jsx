import { getClassNames, getClassIdByName } from '../utils/wordLibrary'

// v2.9(2026-07-21, decision 0004 다중 교재) — 학생에게 2개 이상의 교재
// (student_class_assignments 행)가 배정돼 있을 때만 나타나는 선택기.
// 0개/1개(오늘의 294명 전원 포함, 마이그레이션 실행 전 전체)면 이 컴포넌트
// 자체가 아무것도 렌더하지 않는다(요구사항 2) — 부모(Dashboard.jsx)가
// assignments 유무로 조건부 렌더하지 않아도 되도록 이 컴포넌트 안에서
// 한 번 더 방어적으로 확인한다.
//
// App.jsx의 handleUnitSwitch/Dashboard.jsx의 유닛 select 드롭다운과 동일한
// 상호작용 패턴(select + 전환 중 disabled + 실패 시 인라인 에러 문구)을
// 그대로 재사용한다(요구사항 3 — 새 패턴을 발명하지 않음).
//
// 설계 선택(구현 세션, docs/agent-decisions/0004-multi-textbook-
// architecture.md 근거) — 선택 시 getStudentWords의 classId override(임시
// 조회)가 아니라 setPrimaryAssignment(주 교재 전환, 영구 — wordLibrary.js
// "5) 쓰기 — 주 교재 전환" 주석 참고)를 호출한다. 이유: Current Unit/숙제/
// 게임화 스위치(gamificationEnabled)/입실시험 배너/쓰기시험 설정 등
// 15개 이상의 기존 호출부가 전부 students.class_id(주 반) 하나만 읽는다 —
// override만 쓰면 단어 목록만 선택한 교재를 따라가고 나머지 화면은 계속
// 이전 교재를 가리켜(요구사항 6 위반) 반쪽짜리로 일관성이 깨진다.
// setPrimaryAssignment는 단 한 번의 쓰기로 이 모든 기존 호출부를 자동으로
// 같은 교재에 맞춰준다(코드 변경 0 — 백엔드 주석에 명시된 설계 의도 그대로).
export default function TextbookSelector({ assignments, currentClassId, switching, error, onSwitch }) {
  if (!Array.isArray(assignments) || assignments.length <= 1) return null

  // _cache는 반 "이름"으로 키잉되므로(wordLibrary.js 관례), classId ->
  // 이름 역방향 조회는 getClassNameById가 내부적으로 하는 것과 동일한
  // 방식을 여기서 재구성한다(그 함수 자체는 export되지 않음 — 이 파일은
  // 오직 export된 getClassNames/getClassIdByName만 사용).
  const classNameById = {}
  getClassNames().forEach((name) => {
    const id = getClassIdByName(name)
    if (id) classNameById[id] = name
  })

  return (
    <div className="text-sm text-purple-200 mt-1 flex items-center justify-center gap-1.5 flex-wrap">
      <span>교재:</span>
      <label className="inline-flex items-center gap-1">
        <span className="sr-only">교재 선택</span>
        <select
          value={currentClassId || ''}
          disabled={switching}
          onChange={(e) => onSwitch(e.target.value)}
          className="bg-white/20 text-white font-bold rounded-xl px-2 py-1.5 text-sm border-2 border-white/30 focus:outline-none focus:border-white/70 disabled:opacity-60 appearance-auto"
        >
          {/* 현재 반이 배정 목록에 아직 없는 예외(캐시 갱신 지연 등)에도 셀렉트가 빈 값이 되지 않게 — 유닛 셀렉트의 동일 방어 패턴 재사용 */}
          {currentClassId && !assignments.some((a) => a.classId === currentClassId) && (
            <option value={currentClassId}>{classNameById[currentClassId] || '(현재 교재)'}</option>
          )}
          {assignments.map((a) => (
            <option key={a.classId} value={a.classId} className="text-gray-800">
              {classNameById[a.classId] || '(알 수 없는 반)'}
            </option>
          ))}
        </select>
        {switching && <span className="text-xs">⏳</span>}
      </label>
      {error && <p className="text-xs font-bold text-yellow-200 w-full">⚠️ {error}</p>}
    </div>
  )
}
