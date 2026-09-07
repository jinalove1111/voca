// scripts/lib/baselineV2Guards.mjs — supabase_v3_48_reward_legacy_baseline_v2.sql
// (per-student reconcile RPC 재설계, 2026-09-07) 가드 상수 + 순수 평가
// 함수의 단일 진실 원천(JS 쪽). 네트워크 0, 순수 함수만 export한다.
//
// ── 왜 SQL과 상수를 분리해서 이중 관리하는가(그리고 어떻게 드리프트를 막는가) ──
// SQL(reconcile_legacy_baseline 함수 DECLARE 절)은 호출 시점에 이 숫자들로
// 실제 가드를 건다. 이 JS 모듈은 (1) scripts/dryRunBaselineV2.mjs가 "학생
// 별로 이 규칙을 적용하면 어떻게 라우팅될지"를 사전에 근사로 보여주는 데,
// (2) scripts/testBaselineV2Sql.mjs가 SQL 텍스트 안에 이 리터럴이 그대로
// 박혀 있는지 정적으로 대조하는 데 쓴다 — 두 파일 중 하나만 고치고 다른
// 하나를 잊는 실수(리터럴 드리프트)를 테스트가 즉시 잡아낸다. 상수 값의
// 근거(2026-09-07 실측 스냅샷)는 supabase_v3_48_reward_legacy_baseline_v2.sql
// 의 reconcile_legacy_baseline 함수 DECLARE 절 주석에 전문이 있다 — 여기서는
// 반복하지 않는다.
export const TOLERANCE = 100
export const MAX_INDIVIDUAL = 1500
export const SNAPSHOT_SLACK = 200
export const SNAPSHOT_MAX = 100000

/**
 * evaluateReconcile — SQL reconcile_legacy_baseline() 함수의 b/f/g/h 단계를
 * 그대로 옮긴 순수 함수(부작용 없음, 네트워크 없음). e)/i)/j) 단계(이미
 * 존재하는 원장 행 확인, 실제 INSERT, 최종 리턴 값 조립)는 DB 상태(원장
 * 존재 여부, unique 충돌)에 의존하므로 이 순수 함수의 범위 밖이다 — 이
 * 함수는 "주어진 스냅샷/원장/업로드값/history 합계로 어떤 판정이 나올지"
 * 만 계산한다.
 *
 * @param {{snapshot:number, earned:number, uploadedTotal:number, historySince:number}} params
 *   snapshot      — 클라이언트가 보고한 total_stars 스냅샷(p_snapshot_total)
 *   earned        — reward_totals.earned_stars(v_earned)
 *   uploadedTotal — student_progress.total_stars(v_uploaded, 서버에 이미 반영된 값)
 *   historySince  — v3_37 이후 history 블록에서 합산한 starsEarned(v_history_since)
 * @returns {{reason: 'invalid_snapshot'|'review'|'nothing_to_reconcile'|'ok', delta: number}}
 *   reason이 'ok'이면 delta(> 0)만큼 reward_ledger에 심을 후보라는 뜻이고,
 *   그 외 reason은 SQL 함수가 삽입 없이(또는 0-delta 확정 마커만 남기고)
 *   조기 반환하는 경우와 1:1 대응한다.
 */
export function evaluateReconcile({ snapshot, earned, uploadedTotal, historySince }) {
  // b) 스냅샷 범위 검증.
  if (snapshot === null || snapshot === undefined || !Number.isFinite(snapshot) || snapshot < 0 || snapshot > SNAPSHOT_MAX) {
    return { reason: 'invalid_snapshot', delta: 0 }
  }

  const safeEarned = Number.isFinite(earned) ? earned : 0
  const safeUploaded = Number.isFinite(uploadedTotal) ? uploadedTotal : 0
  const safeHistorySince = Number.isFinite(historySince) ? historySince : 0

  // f) 스냅샷이 서버에 이미 업로드된 값보다 SNAPSHOT_SLACK 이상 앞서면 review.
  if (snapshot > safeUploaded + SNAPSHOT_SLACK) {
    return { reason: 'review', delta: 0 }
  }

  // g) delta 계산 — 0 이하면 정산할 것 없음.
  const delta = snapshot - safeEarned
  if (delta <= 0) {
    return { reason: 'nothing_to_reconcile', delta: 0 }
  }

  // h) 타당성 검사.
  const plausibleMax = safeHistorySince + TOLERANCE
  if (delta > plausibleMax || delta > MAX_INDIVIDUAL) {
    return { reason: 'review', delta: 0 }
  }

  return { reason: 'ok', delta }
}
