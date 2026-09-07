-- ROLLBACK — supabase_v3_48_reward_legacy_baseline_v2.sql 되돌리기.
-- 작성 2026-09-07(2026-09-06 하드닝판 → per-student RPC 재설계에 맞춰
-- 재작성). **아직 실행하지 않음.** 배포 실패 시에만 사용.
--
-- 실행 방법: Supabase 대시보드 SQL Editor. 아래 STAGE를 **하나씩** 실행하고
-- 각 단계의 확인 쿼리를 눈으로 본 뒤 다음으로 넘어갈 것. 통째로 붙여넣지
-- 말 것.
--
-- ── 이 파일의 범위 ─────────────────────────────────────────────────────
-- v3_48(재설계판)이 심은 것만 정확히 지운다:
--   · reward_ledger의 source_id='v2' legacy-baseline 행(학생이 로그인하며
--     reconcile_legacy_baseline()을 호출해 그동안 누적된 것 전부 포함)
--   · reward_baseline_review의 migration_name='v3_48_reward_legacy_baseline_v2' 검토 행
--   · reward_migration_log의 'v3_48_legacy_reconcile_cutover' 감사 marker
--   · reconcile_legacy_baseline(uuid, integer) 함수, reward_baseline_v2_status 뷰,
--     그 실행 권한(service_role)
-- reward_ledger의 source_id='v1'(v3_37) 행과 실제 학습 보상 행(legacy-
-- baseline이 아닌 모든 reward_type)은 이 필터 조건 덕분에 절대 건드리지
-- 않는다. reward_baseline_review/reward_migration_log 테이블 구조 자체와
-- 'v3_37_reward_legacy_baseline' marker 행도 제거하지 않는다.
--
-- ── 함수/뷰 제거 구문은 checkDestructiveSql.mjs 차단 대상이 아니다 ────────
-- 이 저장소의 destructive-command 게이트(scripts/hooks/checkDestructiveSql.mjs)
-- 는 TABLE/COLUMN/DATABASE/SCHEMA 삭제만 차단하고 FUNCTION/VIEW 삭제는
-- 차단하지 않는다(CLAUDE.md 규칙 18) — 아래 DROP FUNCTION IF EXISTS/
-- DROP VIEW IF EXISTS는 그래서 이 파일에 포함할 수 있다. 테이블 구조
-- 자체를 없애는 구문은 이 파일에 없다.
--
-- ── 롤백 이후 클라이언트 동작 ─────────────────────────────────────────────
-- 함수가 제거되고 service_role GRANT도 회수되므로, 이미 배포된 서버
-- 코드가 reconcile_legacy_baseline을 호출해도 42883(함수 없음)으로
-- 실패한다 — 호출부는 이를 안전하게 무시/재시도 보류로 처리해야 한다
-- (v3_47 ROLLBACK과 동일 판단, "코드 전/후 어느 순서든 안전").
--
-- ── 절대 건드리지 않는 것 ───────────────────────────────────────────────
-- students / student_progress / total_stars / reward_ledger의 v1 행 /
-- reward_ledger의 legacy-baseline이 아닌 모든 행 / xp_ledger 등.

-- ============================================================================
-- STAGE 0 — 현재 상태 확인 (읽기 전용, 항상 먼저 실행)
-- ============================================================================
select
  (select count(*) from reward_ledger
     where reward_type = 'legacy-baseline' and source_type = 'migration' and source_id = 'v2') as v2_baseline_rows,
  (select count(*) from reward_ledger
     where reward_type = 'legacy-baseline' and source_type = 'migration' and source_id = 'v1') as v1_baseline_rows,
  (select count(*) from reward_ledger
     where reward_type <> 'legacy-baseline')                                                    as real_reward_rows,
  (select count(*) from reward_baseline_review
     where migration_name = 'v3_48_reward_legacy_baseline_v2')                                  as review_rows,
  (select count(*) from reward_migration_log
     where migration_name = 'v3_48_legacy_reconcile_cutover')                                   as cutover_marker_rows,
  (select count(*) from pg_proc where proname = 'reconcile_legacy_baseline')                     as reconcile_fn_rows,
  (select count(*) from pg_views where viewname = 'reward_baseline_v2_status')                    as status_view_rows;

-- ============================================================================
-- STAGE 1 — v3_48(재설계판) 되돌리기. 멱등(재실행해도 안전 — 이미 지워진
--   행/함수/뷰에 대해서는 그냥 0건 삭제/if exists no-op).
--   앱은 계속 동작한다(테이블은 그대로 남는다, v1 행/실제 보상 행 무변경 —
--   함수만 없어져 신규 reconcile 호출만 실패한다).
-- ============================================================================
begin;

delete from reward_ledger
 where reward_type = 'legacy-baseline'
   and source_type = 'migration'
   and source_id = 'v2';

delete from reward_baseline_review
 where migration_name = 'v3_48_reward_legacy_baseline_v2';

delete from reward_migration_log
 where migration_name = 'v3_48_legacy_reconcile_cutover';

-- service_role 실행 권한 회수 — 회수 이후에는 이미 배포된 서버 코드가
-- reconcile_legacy_baseline을 호출해도 42883(함수 없음)으로 실패한다.
revoke execute on function public.reconcile_legacy_baseline(uuid, integer) from service_role;

-- 함수/뷰 자체 제거(checkDestructiveSql.mjs 차단 대상 아님 — TABLE/COLUMN/
-- DATABASE/SCHEMA 삭제만 차단). IF EXISTS라 이미 지워진 상태에서 재실행해도
-- 안전.
drop function if exists public.reconcile_legacy_baseline(uuid, integer);
drop view if exists reward_baseline_v2_status;

-- 확인: v2 baseline 0건, 검토 행 0건, cutover marker 0건, 함수/뷰 0건.
-- v1 행/실제 보상 행은 STAGE 0과 정확히 같아야 한다.
select
  (select count(*) from reward_ledger
     where reward_type = 'legacy-baseline' and source_type = 'migration' and source_id = 'v2') as v2_baseline_rows_after,
  (select count(*) from reward_ledger
     where reward_type = 'legacy-baseline' and source_type = 'migration' and source_id = 'v1') as v1_baseline_rows_after_must_be_unchanged,
  (select count(*) from reward_ledger
     where reward_type <> 'legacy-baseline')                                                    as real_reward_rows_after_must_be_unchanged,
  (select count(*) from reward_baseline_review
     where migration_name = 'v3_48_reward_legacy_baseline_v2')                                  as review_rows_after,
  (select count(*) from reward_migration_log
     where migration_name = 'v3_48_legacy_reconcile_cutover')                                   as cutover_marker_rows_after,
  (select count(*) from pg_proc where proname = 'reconcile_legacy_baseline')                     as reconcile_fn_rows_after,
  (select count(*) from pg_views where viewname = 'reward_baseline_v2_status')                    as status_view_rows_after;

commit;

-- STAGE 1 이후 재실행 안전성: 함수/marker가 지워졌으므로 v3_48을 다시
-- 실행하면 정상 재설치되고, 학생들은 다음 로그인 시 다시 reconcile을
-- 호출해 처음부터 정산한다(v2 원장 행이 이미 지워졌으므로 already_
-- reconciled로 잘못 수렴하지 않음).

-- ============================================================================
-- STAGE 2 — 되돌린 뒤 학생 데이터 무변경 확인 (읽기 전용)
-- ============================================================================
select count(*)          as progress_rows,
       sum(total_stars)  as total_stars_sum,
       max(total_stars)  as total_stars_max
  from student_progress;
-- STAGE 0 이전에 별도로 찍어둔 값과 **정확히 같아야 한다**(이 파일은
-- student_progress를 절대 쓰지 않는다). 다르면 이 파일이 아닌 다른
-- 원인이므로 즉시 중단하고 조사할 것.
