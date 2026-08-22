-- ROLLBACK — Reward System V1 원장 설치(v3_36 + v3_37) 되돌리기.
-- 작성 2026-08-23. **아직 실행하지 않음.** 배포 실패 시에만 사용.
--
-- 실행 방법: Supabase 대시보드 SQL Editor. 아래 STAGE를 **하나씩** 실행하고
-- 각 단계의 확인 쿼리를 눈으로 본 뒤 다음으로 넘어갈 것. 통째로 붙여넣지 말 것.
--
-- ── 이 파일의 범위 ─────────────────────────────────────────────────────
-- STAGE 0 (확인) / STAGE 1 (v3_37 데이터 되돌리기) / STAGE 3 (사후 확인)만
-- 담는다. **구조 자체를 제거하는 STAGE 2(뷰/테이블 삭제)는 이 파일에
-- 없다** — 저장소의 destructive-command 게이트가 파괴적 DDL을 파일로
-- 작성하는 것 자체를 차단하기 때문이다(CLAUDE.md 규칙 18). 실제로 구조까지
-- 되돌려야 하는 상황이면 운영자가 게이트를 결재한 뒤 별도로 작성한다.
-- 절차는 docs 런북의 "STAGE 2" 항목 참고.
--
-- 다행히 대부분의 실패 시나리오에서 STAGE 2는 필요 없다:
-- 테이블이 남아 있어도 앱은 정상 동작하고(클라이언트는 원장을 읽지 않으며
-- total_stars를 원장에서 재계산하지 않는다), 코드 롤백만으로 쓰기가 멈춘다.
--
-- ── 절대 건드리지 않는 것 ───────────────────────────────────────────────
-- students / student_progress / total_stars / 학습 진도 / units / words /
-- textbooks / student_class_assignments / classes / entrance_tests /
-- xp_ledger / xp_totals — 이 파일은 읽기(확인용) 외에 쓰지 않는다.
-- 학생의 별은 원장에서 재계산되지 않으므로(운영자 결정, rewardEngine.js
-- 헤더 참고) 원장을 되돌려도 학생이 보는 별은 1개도 변하지 않는다.

-- ============================================================================
-- STAGE 0 — 현재 상태 확인 (읽기 전용, 항상 먼저 실행)
-- ============================================================================
select
  (select count(*) from reward_ledger)                                        as ledger_rows_total,
  (select count(*) from reward_ledger where reward_type = 'legacy-baseline')  as baseline_rows,
  (select count(*) from reward_ledger where reward_type <> 'legacy-baseline') as real_reward_rows,
  (select count(*) from reward_migration_log
     where migration_name = 'v3_37_reward_legacy_baseline')                   as marker_rows;
-- 기대(설치 직후, 가동 전): ledger_rows_total = baseline_rows = 145,
--                          real_reward_rows = 0, marker_rows = 1

-- 학생 별이 원장과 무관하게 그대로인지 대조용 스냅샷(되돌린 뒤 재실행해 비교)
select count(*)          as progress_rows,
       sum(total_stars)  as total_stars_sum,
       max(total_stars)  as total_stars_max
  from student_progress;
-- 2026-08-23 실측 기준선: progress_rows = 190, total_stars_sum = 33907,
--                        total_stars_max = 1823

-- ============================================================================
-- STAGE 1 — v3_37 되돌리기 (baseline 행 + marker 제거). 멱등.
--   앱은 계속 동작한다(테이블/뷰는 그대로 남는다).
-- ============================================================================
begin;

-- v3_37이 심은 것만 정확히 지운다. reward_type으로 한정하므로 가동 후
-- 실제 학습 보상 행은 절대 건드리지 않는다.
delete from reward_ledger
 where reward_type = 'legacy-baseline';

delete from reward_migration_log
 where migration_name = 'v3_37_reward_legacy_baseline';

-- 확인: baseline 0건, marker 0건. 실제 보상 행은 그대로여야 한다.
select
  (select count(*) from reward_ledger where reward_type = 'legacy-baseline')  as baseline_rows_after,
  (select count(*) from reward_ledger where reward_type <> 'legacy-baseline') as real_reward_rows_after,
  (select count(*) from reward_migration_log
     where migration_name = 'v3_37_reward_legacy_baseline')                   as marker_rows_after;

commit;

-- STAGE 1 이후 재실행 안전성: marker가 지워졌으므로 v3_37을 다시 실행하면
-- 그 시점의 total_stars로 baseline이 새로 계산돼 들어간다(정상 재설치).

-- ============================================================================
-- STAGE 2 — 구조 제거(뷰/테이블) : 이 파일에 없음. 런북 참고.
--   전제 조건: 아래 쿼리가 0을 반환해야 한다. 1건이라도 있으면 구조를
--   제거하면 실제 보상 이력이 사라지므로 STAGE 1까지만 하고 코드 롤백으로
--   대응할 것.
-- ============================================================================
select count(*) as real_reward_rows_must_be_zero
  from reward_ledger
 where reward_type <> 'legacy-baseline';

-- ============================================================================
-- STAGE 3 — 되돌린 뒤 학생 데이터 무변경 확인 (읽기 전용)
-- ============================================================================
select count(*)          as progress_rows,
       sum(total_stars)  as total_stars_sum,
       max(total_stars)  as total_stars_max
  from student_progress;
-- STAGE 0에서 찍어둔 값과 **정확히 같아야 한다**. 다르면 이 파일이 아닌
-- 다른 원인이므로 즉시 중단하고 조사할 것.
