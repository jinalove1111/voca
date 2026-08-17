-- ============================================================================
-- supabase_v3_37_reward_legacy_baseline.sql — Reward System V1: 기존
-- student_progress.total_stars를 reward_ledger의 1회성 legacy-baseline
-- 원장 행으로 이관(읽기 + INSERT만, student_progress는 절대 건드리지
-- 않음). 2026-08-15.
--
-- 미실행 — Supabase 대시보드 SQL Editor에서 운영자가 supabase_v3_36_
-- reward_ledger.sql 실행 확인 후 수동 실행(CLAUDE.md 규칙 8). 재실행
-- 안전(멱등) — idempotency_key unique 제약 + ON CONFLICT DO NOTHING으로
-- 몇 번을 실행해도 중복 삽입 없음(postcheck가 재실행 시에도 학생 수와
-- 원장 행 수가 정확히 일치함을 재확인).
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
-- ── 트랜잭션/precheck/postcheck 구조 ────────────────────────────────────
-- BEGIN ~ COMMIT 안에서: ① precheck(대상 행 수/총 별 합을 RAISE NOTICE로
-- 출력) → ② INSERT ... ON CONFLICT DO NOTHING → ③ postcheck(삽입된
-- legacy-baseline 행 수와 대상 학생 수를 비교, 불일치면 RAISE EXCEPTION
-- 으로 트랜잭션 전체 롤백 — 부분 이관 방지).
-- ============================================================================

BEGIN;

-- ① precheck — 대상 행 수/총 별 합을 실행 로그에 남긴다(운영자가 실행
--    전 SQL Editor 콘솔에서 눈으로 확인할 수 있도록 NOTICE로 출력).
DO $$
DECLARE
  target_count integer;
  target_sum bigint;
BEGIN
  SELECT count(*), coalesce(sum(total_stars), 0)
    INTO target_count, target_sum
    FROM student_progress
    WHERE total_stars > 0;
  RAISE NOTICE 'reward_legacy_baseline precheck: target_rows=%, total_stars_sum=%', target_count, target_sum;
END $$;

-- ② 이관 — 학생별 정확히 1건, 이미 있으면 건드리지 않음(멱등). student_
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
--    것을 원천 차단).
DO $$
DECLARE
  target_count integer;
  inserted_count integer;
BEGIN
  SELECT count(*) INTO target_count FROM student_progress WHERE total_stars > 0;
  SELECT count(*) INTO inserted_count
    FROM reward_ledger
    WHERE reward_type = 'legacy-baseline' AND source_type = 'migration' AND source_id = 'v1';
  RAISE NOTICE 'reward_legacy_baseline postcheck: target_rows=%, legacy_baseline_rows=%', target_count, inserted_count;
  IF inserted_count <> target_count THEN
    RAISE EXCEPTION 'reward_legacy_baseline mismatch: target=% inserted=% — rolling back', target_count, inserted_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서)
--   select count(*) from reward_ledger where reward_type = 'legacy-baseline';
--   select count(*) from student_progress where total_stars > 0;
--   -- 위 두 count가 일치해야 정상(postcheck가 이미 커밋 시점에 이를 보장).
--   select * from reward_totals order by earned_stars desc limit 5;
-- ============================================================================
