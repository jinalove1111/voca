-- ROLLBACK — supabase_v3_48_reward_legacy_baseline_v2.sql 되돌리기.
-- 작성 2026-09-06. **아직 실행하지 않음.** 배포 실패 시에만 사용.
--
-- 실행 방법: Supabase 대시보드 SQL Editor. 아래 STAGE를 **하나씩** 실행하고
-- 각 단계의 확인 쿼리를 눈으로 본 뒤 다음으로 넘어갈 것.
--
-- ── 이 파일의 범위 ─────────────────────────────────────────────────────
-- v3_48이 심은 것만 정확히 지운다: reward_ledger의 source_id='v2'
-- legacy-baseline 행, reward_baseline_review의 v2 검토 행, marker 1행.
-- reward_ledger의 source_id='v1'(v3_37) 행과 실제 학습 보상 행(legacy-
-- baseline이 아닌 모든 reward_type)은 이 필터 조건 덕분에 절대 건드리지
-- 않는다. 테이블 구조(reward_baseline_review 포함) 자체는 제거하지 않는다
-- (v3_36_37 롤백과 동일 판단 — 앱은 빈/부분 테이블이 남아 있어도 정상
-- 동작한다).

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
     where migration_name = 'v3_48_reward_legacy_baseline_v2')                                  as marker_rows;

-- ============================================================================
-- STAGE 1 — v3_48 되돌리기 (v2 baseline 행 + 검토 행 + marker 제거). 멱등.
--   앱은 계속 동작한다(테이블은 그대로 남는다, v1 행/실제 보상 행 무변경).
-- ============================================================================
begin;

delete from reward_ledger
 where reward_type = 'legacy-baseline'
   and source_type = 'migration'
   and source_id = 'v2';

delete from reward_baseline_review
 where migration_name = 'v3_48_reward_legacy_baseline_v2';

delete from reward_migration_log
 where migration_name = 'v3_48_reward_legacy_baseline_v2';

-- 확인: v2 baseline 0건, 검토 행 0건, marker 0건. v1 행/실제 보상 행은
-- STAGE 0과 정확히 같아야 한다.
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
     where migration_name = 'v3_48_reward_legacy_baseline_v2')                                  as marker_rows_after;

commit;

-- STAGE 1 이후 재실행 안전성: marker가 지워졌으므로 v3_48을 다시 실행하면
-- 그 시점의 delta로 baseline이 새로 계산돼 들어간다(정상 재설치).

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
