// src/hooks/unitCompletionDetector.js — P4(유닛 완료 보상, 2026-09-03,
// docs/REWARD_LOOP_AUDIT_2026-09-03.md §14) 전이(transition) 감지 순수
// 헬퍼.
//
// rewardEngine.js/rewardSummary.js와 동일한 zero-import 원칙 — import
// 0개, React 없음, window/document/localStorage 없음, 네트워크 호출 없음.
// useAttachment.js가 이 함수를 소비하는 유일한 지점이지만, useAttachment.js
// 자체는 productEvents.js(→supabaseClient.js→import.meta.env)를 statically
// import하고 있어 plain Node에서 직접 import하면 크래시한다(import.meta.env가
// undefined인 환경에서 undefined.VITE_SUPABASE_URL 접근) — 그래서 이 순수
// 로직만 별도 파일로 분리해, 훅 전체를 번들링하지 않고도 Node 테스트에서
// 직접 import해 검증할 수 있게 한다(scripts/testUnitCompleteReward.mjs).
//
// 의미: 이전에 "이미 알려준" unitId 집합(prevSet)과 지금 completedUnits()가
// 돌려주는 unitId 목록(currentIds)을 비교해, prevSet에 없던(=이번에 새로
// 완료된) unitId만 반환한다.
export function diffNewlyCompleted(prevSet, currentIds) {
  const prev = prevSet instanceof Set ? prevSet : new Set(Array.isArray(prevSet) ? prevSet : [])
  const ids = Array.isArray(currentIds) ? currentIds : []
  return ids.filter((id) => id !== undefined && id !== null && !prev.has(id))
}
