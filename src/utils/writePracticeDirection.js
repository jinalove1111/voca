// 쓰기 연습(studyMode==='write')은 반 설정(classDirection)과 무관하게 항상
// 양방향(mixed, 50:50)으로 출제한다(운영자 결정 2026-09-09, handoff 118차).
// 그 외 모드(종합/복습/일일 의식/입실시험)는 이 함수를 쓰지 않고 기존처럼
// 반 설정을 그대로 따른다 — App.jsx의 mixedDirections useMemo에서만 호출.
// 순수 함수(부작용 없음, 전역 상태 참조 없음) — App.jsx의 useMemo/useRef
// 배선(assignDirections/extendStableDirections)은 그대로 두고, "이번 세션에
// mixed를 강제할지" 판단만 이 함수로 분리한다.
export const WRITE_PRACTICE_MODE = 'write'

export function resolveSessionSpellingDirection(studyMode, classDirection) {
  if (studyMode === WRITE_PRACTICE_MODE) return 'mixed'
  return classDirection
}
