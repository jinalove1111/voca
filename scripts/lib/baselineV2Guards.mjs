// scripts/lib/baselineV2Guards.mjs — supabase_v3_48_reward_legacy_baseline_v2.sql
// BOUNDED 가드 상수 + 평가 함수의 단일 진실 원천(JS 쪽). 네트워크 0,
// 순수 함수만 export한다.
//
// ── 왜 SQL과 상수를 분리해서 이중 관리하는가(그리고 어떻게 드리프트를 막는가) ──
// SQL(DO 블록)은 실행 시점에 이 숫자들로 실제 가드를 건다. 이 JS 모듈은
// (1) scripts/dryRunBaselineV2.mjs가 "실행하면 통과할지"를 사전에
// 알려주는 데, (2) scripts/testBaselineV2Sql.mjs가 SQL 텍스트 안에 이
// 리터럴이 그대로 박혀 있는지 정적으로 대조하는 데 쓴다 — 두 파일 중
// 하나만 고치고 다른 하나를 잊는 실수(리터럴 드리프트)를 테스트가 즉시
// 잡아낸다. 상수 값의 근거(2026-09-06 실측 스냅샷 + 학습 드리프트 여유)는
// supabase_v3_48_reward_legacy_baseline_v2.sql 헤더 "EXACT 가드 vs
// BOUNDED 가드" 절에 전문이 있다 — 여기서는 반복하지 않는다.
export const CANDIDATES_MIN = 5
export const CANDIDATES_MAX = 80
export const TOTAL_MIN = 500
export const TOTAL_MAX = 24000
export const MAX_INDIVIDUAL = 1500
export const PROGRESS_ROWS_MIN = 150
export const PROGRESS_ROWS_MAX = 500

/**
 * BOUNDED 가드 4종을 평가한다(EXACT 가드는 SQL 실행 시점에만 판정 가능한
 * 것들 — marker/필수 테이블 존재/reward_totals 비어있음 — 이라 이 순수
 * 함수의 범위 밖이다). 네트워크 없음, 부작용 없음.
 * @param {{candidates:number, total:number, maxIndividual:number, progressRows:number}} snapshot
 * @returns {{ok:boolean, failures:Array<{guard:string, value:number, min?:number, max?:number}>}}
 */
export function evaluateBaselineGuards({ candidates, total, maxIndividual, progressRows }) {
  const failures = []

  if (!(candidates >= CANDIDATES_MIN && candidates <= CANDIDATES_MAX)) {
    failures.push({ guard: 'candidates', value: candidates, min: CANDIDATES_MIN, max: CANDIDATES_MAX })
  }
  if (!(total >= TOTAL_MIN && total <= TOTAL_MAX)) {
    failures.push({ guard: 'total', value: total, min: TOTAL_MIN, max: TOTAL_MAX })
  }
  if (!(maxIndividual <= MAX_INDIVIDUAL)) {
    failures.push({ guard: 'maxIndividual', value: maxIndividual, max: MAX_INDIVIDUAL })
  }
  if (!(progressRows >= PROGRESS_ROWS_MIN && progressRows <= PROGRESS_ROWS_MAX)) {
    failures.push({ guard: 'progressRows', value: progressRows, min: PROGRESS_ROWS_MIN, max: PROGRESS_ROWS_MAX })
  }

  return { ok: failures.length === 0, failures }
}
