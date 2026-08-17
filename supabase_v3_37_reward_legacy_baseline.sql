-- ============================================================================
-- supabase_v3_37_reward_legacy_baseline.sql — Reward System V1: 기존
-- student_progress.total_stars를 reward_ledger의 1회성 legacy-baseline
-- 원장 행으로 이관(읽기 + INSERT만, student_progress는 절대 건드리지
-- 않음). 2026-08-15. 2026-08-17 — migration marker 강화(이중 실행 절대
-- 안전, 아래 "왜 marker가 필요한가" 섹션 참고).
--
-- 미실행 — Supabase 대시보드 SQL Editor에서 운영자가 supabase_v3_36_
-- reward_ledger.sql 실행 확인 후 **가동 전 1회 실행 권장**(수동 실행,
-- CLAUDE.md 규칙 8). 재실행해도 marker(reward_migration_log) 때문에
-- no-op — 몇 번을 실행해도 안전(RAISE NOTICE로 "already applied,
-- skipping" 출력 후 정상 COMMIT, 에러 아님).
--
-- ── 왜 marker가 필요한가(idempotency_key unique만으로는 부족한 이유) ────
-- 기존 2차 방어(idempotency_key unique + ON CONFLICT DO NOTHING)는 "같은
-- 시점에 두 번 실행"에는 안전하지만, "Reward v1 가동 후 시간이 지나
-- 재실행"에는 취약하다: 첫 실행 당시 total_stars=0이어서 대상에서 빠졌던
-- 학생이 그 사이 신규 학습 보상(word-session-complete 등)으로 별을 벌어
-- total_stars>0이 되면, 재실행 시 그 학생에게 baseline 행이 그때 처음
-- 삽입된다. 그 학생의 별은 이미 신규 원장에도 기록돼 있으므로 baseline이
-- 그 위에 다시 얹혀 이중 계상된다. marker(reward_migration_log)는 "이
-- 마이그레이션이 이미 한 번 완료됐는가" 자체를 기록해, 완료 후에는 대상
-- 재계산(precheck/INSERT/postcheck)을 통째로 건너뛰어 이 시나리오를
-- 원천 차단한다(scripts/testRewardBaselineMigration.mjs 시나리오 3이
-- 이 취약점과 방어 효과를 실측 고정).
--
-- ── 왜 legacy-baseline 원장 행이 필요한가 ──────────────────────────────
-- Reward System V1(src/utils/rewardEngine.js)의 총 별은 앞으로
-- reward_ledger 원장 합계(earnedStars()/reward_totals 뷰)로 계산된다.
-- 기존 111명 규모 학생이 이미 쌓아둔 student_progress.total_stars를 이
-- 새 원장 체계로 옮기지 않으면, 원장 기반 화면으로 전환하는 순간 모든
-- 학생의 별이 0으로 보이는 회귀가 생긴다. 그래서 학생별 정확히 1건의
-- 'legacy-baseline' 행으로 기존 누적치를 원장에 심는다 — source_type=
-- 'migration', source_id='v1'로 "실제 학습 이벤트가 아니라 마이그레이션
-- 시드"임을 명시적으로 구분해 감사 가능성을 유지한다.
--
-- ── student_progress는 절대 건드리지 않는다(운영자 결정 1) ─────────────
-- 이 파일은 student_progress에 대한 UPDATE/DELETE 문을 단 하나도 포함
-- 하지 않는다(SELECT로만 읽는다) — total_stars는 기존 표시값으로 그대로
-- 남는다(다른 화면이 여전히 참조 중일 수 있으므로 삭제/초기화 금지).
--
-- ── check 제약 설계 변경(v3_36과 함께 읽을 것) ──────────────────────────
-- v3_36의 stars_delta는 원래 상한(50)까지 뒀던 초안을 하한(0 이상)만
-- 두는 것으로 바꿨다 — legacy-baseline은 학생별 누적치라 50을 훌쩍 넘는
-- 값이 흔하기 때문(수백 별 누적 학생 존재). 상한(단일 이벤트가 비정상
-- 적으로 큰 값을 못 넣게 막는 것)은 애플리케이션 레벨(rewardEngine.js의
-- REWARD_STARS 화이트리스트)에서 관리한다(v3_36 헤더 주석 참고).
--
-- ── migration marker(reward_migration_log) — 명시적 완료 기록 ───────────
-- v3_36은 이미 커밋된 파일이라 수정하지 않는다 — marker 테이블은 여기서
-- create table if not exists로 정의한다(어느 순서로 실행돼도, 몇 번을
-- 실행돼도 안전). "이 마이그레이션이 이미 완료됐는가" 자체를 학생별이
-- 아니라 마이그레이션 단위로 1행 기록해, 완료 후 재실행은 대상 재계산
-- 자체를 건너뛴다(idempotency_key unique는 여전히 2차 방어로 유지).
--
-- ── 트랜잭션/marker-skip/precheck/postcheck 구조 ─────────────────────────
-- BEGIN ~ COMMIT 안, 하나의 DO 블록에서: ⓪ marker 확인 — 이미 완료
-- 기록이 있으면 RAISE NOTICE로 "already applied, skipping" 출력 후 그냥
-- RETURN(에러 아님, 무해한 no-op) → ① precheck(대상 행 수/총 별 합을
-- RAISE NOTICE로 출력) → ② INSERT ... ON CONFLICT DO NOTHING → ③
-- postcheck(삽입된 legacy-baseline 행 수와 대상 학생 수를 비교, 불일치면
-- RAISE EXCEPTION으로 트랜잭션 전체 롤백 — 부분 이관 방지) → ④ marker에
-- 완료 기록 삽입. postcheck/marker 기록은 ⓪에서 이미 RETURN한 재실행
-- 경로에서는 아예 도달하지 않으므로 skip 시에도 실패하지 않는다.
-- ============================================================================

BEGIN;

-- 0) migration marker 테이블 — 멱등 생성(코드/실행 순서 무관 안전).
create table if not exists reward_migration_log (
  migration_name text primary key,
  executed_at timestamptz not null default now(),
  target_rows integer not null,
  total_stars_sum bigint not null
);

DO $$
DECLARE
  already_applied boolean;
  target_count integer;
  target_sum bigint;
  inserted_count integer;
BEGIN
  -- ⓪ marker 확인 — 이미 완료 기록이 있으면 전체를 건너뛴다(무해한
  --    no-op). 이 분기가 없으면 "가동 후 시간이 지나 재실행" 시 첫 실행
  --    당시 total_stars=0이라 대상에서 빠졌던 학생이 그 사이 별을 벌어
  --    재실행에서 새로 baseline이 삽입되며 이중 계상되는 취약점이 생긴다
  --    (파일 헤더 "왜 marker가 필요한가" 섹션 참고).
  SELECT EXISTS (
    SELECT 1 FROM reward_migration_log WHERE migration_name = 'v3_37_reward_legacy_baseline'
  ) INTO already_applied;

  IF already_applied THEN
    RAISE NOTICE 'reward_legacy_baseline: migration already applied, skipping (no-op)';
    RETURN;
  END IF;

  -- ① precheck — 대상 행 수/총 별 합을 실행 로그에 남긴다(운영자가 실행
  --    전 SQL Editor 콘솔에서 눈으로 확인할 수 있도록 NOTICE로 출력).
  SELECT count(*), coalesce(sum(total_stars), 0)
    INTO target_count, target_sum
    FROM student_progress
    WHERE total_stars > 0;
  RAISE NOTICE 'reward_legacy_baseline precheck: target_rows=%, total_stars_sum=%', target_count, target_sum;

  -- ② 이관 — 학생별 정확히 1건, 이미 있으면 건드리지 않음(idempotency_key
  --    unique + ON CONFLICT DO NOTHING, 2차 방어로 유지). student_
  --    progress.student_id는 이미 students(id) FK이므로 별도 조인 없이
  --    바로 사용한다. total_stars가 smallint 범위를 넘는 극단값을 대비해
  --    least()로 방어(reward_ledger.stars_delta가 smallint 컬럼).
  INSERT INTO reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, xp_delta, idempotency_key, created_at)
  SELECT
    student_id,
    'legacy-baseline',
    'migration',
    'v1',
    least(total_stars, 32767)::smallint,
    0,
    student_id::text || ':legacy-baseline:migration:v1',
    now()
  FROM student_progress
  WHERE total_stars > 0
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- ③ postcheck — 삽입된(또는 이미 존재하던) legacy-baseline 행 수가 대상
  --    학생 수와 정확히 일치하는지 확인. 불일치면 예외를 던져 트랜잭션
  --    전체를 롤백한다(부분 이관 방지 — "일부만 이관된 상태"가 커밋되는
  --    것을 원천 차단). marker가 이미 존재하는 재실행에서는 위 ⓪에서
  --    이미 RETURN했으므로 이 블록에 도달하지 않는다 — skip 재실행에서
  --    실패할 수 없다.
  SELECT count(*)
    INTO inserted_count
    FROM reward_ledger
    WHERE reward_type = 'legacy-baseline' AND source_type = 'migration' AND source_id = 'v1';
  RAISE NOTICE 'reward_legacy_baseline postcheck: target_rows=%, legacy_baseline_rows=%', target_count, inserted_count;
  IF inserted_count <> target_count THEN
    RAISE EXCEPTION 'reward_legacy_baseline mismatch: target=% inserted=% — rolling back', target_count, inserted_count;
  END IF;

  -- ④ marker 완료 기록 — postcheck를 통과한 뒤에만 기록해, 다음 실행부터
  --    ⓪에서 걸러진다.
  INSERT INTO reward_migration_log (migration_name, executed_at, target_rows, total_stars_sum)
  VALUES ('v3_37_reward_legacy_baseline', now(), target_count, target_sum);
END $$;

COMMIT;

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서)
--   select count(*) from reward_ledger where reward_type = 'legacy-baseline';
--   select count(*) from student_progress where total_stars > 0;
--   -- 위 두 count가 일치해야 정상(postcheck가 이미 커밋 시점에 이를 보장).
--   select * from reward_migration_log;
--   -- migration_name='v3_37_reward_legacy_baseline' 행 1개가 있어야 정상
--   -- (이 행이 있으면 재실행 시 자동으로 no-op).
--   select * from reward_totals order by earned_stars desc limit 5;
-- ============================================================================
