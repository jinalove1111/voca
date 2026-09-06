-- ============================================================================
-- supabase_v3_48_reward_legacy_baseline_v2.sql — Reward System V1: legacy
-- baseline 2차 이관(v2). 2026-09-06.
--
-- 실행은 운영자가 Supabase 대시보드 SQL Editor에서 supabase_v3_37_
-- reward_legacy_baseline.sql 실행 확인 후 1회 실행(수동 실행, CLAUDE.md
-- 규칙 8). 재실행해도 marker(reward_migration_log) 때문에 no-op — 몇 번을
-- 실행해도 안전(RAISE NOTICE로 "already applied, skipping" 출력 후 정상
-- COMMIT, 에러 아님).
--
-- ── 왜 v2가 필요한가(v1만으로는 부족해진 이유) ───────────────────────────
-- reward_ledger(서버 원장, v3_36)는 실측 결과 2026-08-23 이후 실제로 쌓인
-- 별의 약 20.8%만 커버한다 — 7개 레거시 클라이언트 지급 경로가 여전히
-- reward_ledger에 한 번도 포스트하지 않고 student_progress.total_stars만
-- 직접 올리기 때문이다. v3_37은 "가동 시점"의 total_stars 스냅샷 1회만
-- 이관했으므로(marker 'v3_37_reward_legacy_baseline'), 그 이후 이
-- 미포집 경로로 쌓인 별은 원장에 전혀 반영되지 않은 채로 남아 있다. 이
-- 상태에서 Town Shop(v3_47) 등 "reward_totals만 신뢰하는" 새 기능을
-- 가동하면, 실제로는 별을 충분히 모은 학생이 서버 판정에서는 별이 부족한
-- 것으로 보이는 회귀가 생긴다. v2는 이 괴리(delta)를 한 번 더, 이번에는
-- 통제된 타당성 검사와 함께 이관한다.
--
-- ── 무엇을 하는가 ────────────────────────────────────────────────────────
-- student_progress가 있는 학생마다 delta = total_stars - coalesce(
-- reward_totals.earned_stars, 0)을 계산해, delta > 0인 경우에만 정확히
-- 1건의 'legacy-baseline' 행(source_type='migration', source_id='v2',
-- idempotency_key = `${student_id}:legacy-baseline:migration:v2`)을
-- reward_ledger에 심는다. student_progress 행이 없는 학생은 대상에서
-- 자연히 제외된다(스킵).
--
-- ── 통제된 타당성 검사(plausible_max) — delta를 무조건 믿지 않는 이유 ────
-- delta가 비정상적으로 크면(예: total_stars 자체가 과거 버그/수동 조작으로
-- 부풀려진 경우) 그대로 원장에 심는 것이 위험하다. 그래서 v3_37 실행
-- 시각(v_v1_at) 이후 student_daily_progress에 실제로 기록된 stars_earned
-- 합계 + 여유값 50을 "이 학생이 v1 이후 실제로 벌었을 법한 최대치"로 보고,
-- delta가 이를 초과하면 원장에 넣지 않고 대신 reward_baseline_review
-- 테이블에 기록만 남겨 운영자가 수동 검토하게 한다(자동 이관하지 않음 —
-- 안전 우선, CLAUDE.md 규칙 1).
--
-- ── student_progress/reward_ledger v1 행은 절대 건드리지 않는다 ──────────
-- 이 파일은 student_progress에 대한 UPDATE/DELETE 문을 단 하나도 포함하지
-- 않는다(SELECT로만 읽는다). reward_ledger에 대해서도 INSERT만 하고
-- 기존 행(v1 baseline 포함)은 절대 수정/삭제하지 않는다 — source_id='v2'로
-- v1과 명확히 구분해 감사 가능성을 유지한다.
--
-- ── migration marker + v1 의존성 가드 ─────────────────────────────────────
-- v3_37과 동일하게 reward_migration_log에 'v3_48_reward_legacy_baseline_v2'
-- marker가 이미 있으면 전체를 건너뛴다(no-op). marker가 없으면 먼저
-- 'v3_37_reward_legacy_baseline' marker가 존재하는지 확인하고, 없으면
-- RAISE EXCEPTION으로 즉시 중단한다(v1 executed_at을 plausible_max 계산의
-- 기준점으로 쓰기 때문에 v1이 선행돼야 한다).
--
-- ── EXACT 가드 vs BOUNDED 가드(2026-09-06 하드닝 추가) ────────────────────
-- 이 파일은 실행 전(어떤 INSERT도 하기 전) 두 종류의 가드를 확인하고,
-- 하나라도 위반되면 RAISE EXCEPTION으로 트랜잭션 전체를 중단한다(부분
-- 삽입 없음 — BEGIN/COMMIT으로 감싸져 있어 EXCEPTION 시 자동 ROLLBACK).
--
--   EXACT 가드(근사가 아니라 구조적으로 항상 참이어야 하는 조건):
--     · 음수 delta는 애초에 삽입되지 않는다(CONTINUE WHEN v_delta <= 0으로
--       구조적 보장) — postcheck에서 삽입된 v2 행 중 stars_delta<=0인
--       행이 0건임을 다시 명시적으로 확인(방어적 이중 확인).
--     · 중복 키 0건 — idempotency_key unique 제약(원장 자체) + postcheck
--       에서 reward_ledger의 v2 행 수 == inserted_count 확인.
--     · v3_37 marker(reward_migration_log)가 반드시 먼저 존재.
--     · reward_totals/reward_ledger/student_progress/
--       student_daily_progress 4개 테이블이 반드시 존재.
--     · reward_totals가 0행이면 안 됨(RAISE EXCEPTION) — v1 baseline이
--       통째로 유실된 상태로 착각하고 실행하면 전원 "전액 신규 delta"로
--       잘못 계산돼 이중 계상 위험이 매우 크다.
--     · inserted_count + review_count == candidate_count(부분 처리 없음).
--
--   BOUNDED 가드(정상 학습으로 설명되지 않는 이상치를 잡기 위한 범위 —
--   숫자는 2026-09-06 실측 스냅샷 기준 여유를 둔 상한/하한이며, 근거는
--   아래 DO 블록 상단 상수 선언부 주석에 그대로 남겨둔다. 스냅샷:
--   candidate_students=24, total_delta=1,998, max_individual=277,
--   student_progress=187행, 활성 학생(30일) ~31명, 학습일당 p50 20 /
--   p75 43별):
--     · candidate_count ∈ [5, 80]
--     · total_delta_sum ∈ [500, 24000]
--     · max_individual ≤ 1500
--     · student_progress 전체 행 수 ∈ [150, 500]
--   위 7개 상수는 scripts/lib/baselineV2Guards.mjs의 동일 이름 상수와
--   리터럴 값이 반드시 일치해야 한다 — scripts/testBaselineV2Sql.mjs가
--   두 파일의 숫자를 정적으로 대조해 드리프트를 잡는다. 이 SQL을 실행할
--   무렵 학생들이 계속 학습해 값이 바뀌어 있을 것이므로, 가드가 실패하면
--   숫자만 보고 성급히 상수를 늘리지 말고 "정상적인 학습 증가"인지
--   "구조적 이상"(예: reward_totals 재구축 실패)인지부터 확인할 것.
--
-- ── 이 baseline의 성격(운영자가 반드시 알아야 할 것) ─────────────────────
-- 이 baseline은 1회성 통제 고정값이며, 이후 student_progress.total_stars는
-- 여전히 표시용 캐시일 뿐이다(원장에서 재계산하지 않음, v3_37과 동일 판단
-- — rewardEngine.js 헤더 주석 참고). 두 번 실행해도 no-op(marker가 즉시
-- skip 처리). 이 SQL을 아직 실행하지 않은 상태에서는 서버가 계산하는
-- "구매 가능 별"(reward_totals 기준, 예: Town Shop)이 실제보다 낮게
-- 계산될 뿐이고, 그로 인해 앱이 깨지거나 크래시하지는 않는다(학생이
-- 보는 total_stars 표시값 자체는 이 SQL 실행 여부와 무관하게 그대로).
-- ============================================================================

BEGIN;

-- 0) migration marker 테이블 — v3_37이 이미 만들지만, 이 파일만 단독으로
--    (v3_37 실행 여부와 무관하게) Write되는 경우를 대비해 멱등 생성으로
--    한 번 더 선언한다(정의가 완전히 동일 — create table if not exists라
--    이미 있으면 그냥 no-op).
create table if not exists reward_migration_log (
  migration_name text primary key,
  executed_at timestamptz not null default now(),
  target_rows integer not null,
  total_stars_sum bigint not null
);

-- 0-b) 검토용 테이블 — plausible_max를 초과해 자동 이관하지 않은 학생을
--    운영자가 수동으로 확인할 수 있도록 기록만 남긴다. reward_ledger와
--    동일 최소 권한(정책 0 + GRANT 0, service_role만 접근) — 학생별 원본
--    total_stars/ledger_earned 차이를 클라이언트에 절대 노출하지 않는다.
create table if not exists reward_baseline_review (
  student_id uuid not null,
  total_stars integer not null,
  ledger_earned integer not null,
  delta integer not null,
  plausible_max integer not null,
  migration_name text not null,
  created_at timestamptz not null default now(),
  primary key (student_id, migration_name)
);
alter table reward_baseline_review enable row level security;
revoke all on table reward_baseline_review from anon, authenticated;

DO $$
DECLARE
  -- ══════════════════════════════════════════════════════════════════════
  -- 가드 상수 — 2026-09-06 스냅샷 기준. scripts/lib/baselineV2Guards.mjs의
  -- 동일 이름 상수와 리터럴이 반드시 일치해야 한다(scripts/
  -- testBaselineV2Sql.mjs가 정적으로 대조한다 — 한쪽만 고치지 말 것).
  -- 근거는 파일 헤더 "EXACT 가드 vs BOUNDED 가드" 절 참고. 요약:
  --   candidate_count ∈ [5,80] — 실측 24, 활성 학생 증가로만 커질 수 있고
  --     43%(80명) 초과는 학습 증가가 아니라 구조적 문제로 본다.
  --   total_delta_sum ∈ [500,24000] — 실측 1,998 + 활성 ~31명×p75 43별×
  --     최대 14일 여유(≈+18,700) ≈ 20,698을 24,000으로 반올림.
  --   max_individual ≤ 1500 — 실측 277 + 14일×관측 최대 75별/일 ≈ 1,330
  --     → 1,500.
  --   progress_rows ∈ [150,500] — student_progress 전체 행 수(모집단
  --     크기 정합성 체크, 111명 규모 학생 수 기준).
  CANDIDATES_MIN CONSTANT integer := 5;
  CANDIDATES_MAX CONSTANT integer := 80;
  TOTAL_MIN CONSTANT integer := 500;
  TOTAL_MAX CONSTANT integer := 24000;
  MAX_INDIVIDUAL_LIMIT CONSTANT integer := 1500;
  PROGRESS_ROWS_MIN CONSTANT integer := 150;
  PROGRESS_ROWS_MAX CONSTANT integer := 500;

  already_applied boolean;
  v_v1_at timestamptz;
  v_reward_totals_rows integer := 0;
  v_progress_rows integer := 0;
  candidate_count integer := 0;
  total_delta_sum_precheck bigint := 0;
  max_individual_precheck integer := 0;
  inserted_count integer := 0;
  review_count integer := 0;
  total_delta_sum bigint := 0;
  v_dup_check integer := 0;
  v_negative_inserted_count integer := 0;
  rec RECORD;
  v_earned integer;
  v_delta integer;
  v_plausible_max integer;
  v_key text;
BEGIN
  -- ⓪ marker 확인 — 이미 완료 기록이 있으면 전체를 건너뛴다(무해한
  --    no-op, v3_37과 동일한 재실행 안전성 판단).
  SELECT EXISTS (
    SELECT 1 FROM reward_migration_log WHERE migration_name = 'v3_48_reward_legacy_baseline_v2'
  ) INTO already_applied;

  IF already_applied THEN
    RAISE NOTICE 'reward_legacy_baseline_v2: migration already applied, skipping (no-op)';
    RETURN;
  END IF;

  -- v1 선행 확인 — plausible_max 계산의 기준점(v_v1_at)이 반드시 필요하다.
  SELECT executed_at INTO v_v1_at
    FROM reward_migration_log
   WHERE migration_name = 'v3_37_reward_legacy_baseline';
  IF v_v1_at IS NULL THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2: v3_37 marker not found in reward_migration_log — run supabase_v3_37_reward_legacy_baseline.sql first';
  END IF;

  -- EXACT 가드 — 필수 테이블 4개 존재 확인. 어느 하나라도 없으면 delta
  -- 계산 자체가 무의미하므로 INSERT를 시도하기 전에 즉시 중단한다.
  IF to_regclass('public.reward_totals') IS NULL
     OR to_regclass('public.reward_ledger') IS NULL
     OR to_regclass('public.student_progress') IS NULL
     OR to_regclass('public.student_daily_progress') IS NULL THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2: required table missing (reward_totals/reward_ledger/student_progress/student_daily_progress) — aborting before any insert';
  END IF;

  -- EXACT 가드 — reward_totals가 0행이면 v1 baseline이 통째로 유실된
  -- 것으로 간주하고 즉시 중단한다(그대로 진행하면 전 학생이 "전액 신규
  -- delta"로 계산돼 이중 계상된다 — 파일 헤더 "EXACT 가드 vs BOUNDED
  -- 가드" 절 참고).
  SELECT count(*) INTO v_reward_totals_rows FROM reward_totals;
  IF v_reward_totals_rows = 0 THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2: reward_totals has 0 rows — v1 baseline appears missing (would double-count every student) — aborting before any insert';
  END IF;

  -- BOUNDED 가드 사전 계산 — 어떤 INSERT도 하기 전에, delta>0인 전체
  -- 후보(추후 review로 빠질 학생 포함, ②의 candidate 정의와 동일)만으로
  -- candidate_count/total_delta_sum/max_individual을 미리 집계한다.
  SELECT count(*) INTO v_progress_rows FROM student_progress;

  SELECT
    count(*) FILTER (WHERE d.delta > 0),
    coalesce(sum(d.delta) FILTER (WHERE d.delta > 0), 0),
    coalesce(max(d.delta) FILTER (WHERE d.delta > 0), 0)
    INTO candidate_count, total_delta_sum_precheck, max_individual_precheck
  FROM (
    SELECT sp.student_id,
           coalesce(sp.total_stars, 0) - coalesce((SELECT rt.earned_stars FROM reward_totals rt WHERE rt.student_id = sp.student_id), 0) AS delta
      FROM student_progress sp
  ) d;

  RAISE NOTICE 'reward_legacy_baseline_v2 guard-precheck: candidate_students=%, total_delta_sum=%, max_individual=%, progress_rows=%, v1_executed_at=%',
    candidate_count, total_delta_sum_precheck, max_individual_precheck, v_progress_rows, v_v1_at;

  IF candidate_count < CANDIDATES_MIN OR candidate_count > CANDIDATES_MAX THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2 BOUNDED guard failed: candidate_count=% not in [%,%] — aborting before any insert',
      candidate_count, CANDIDATES_MIN, CANDIDATES_MAX;
  END IF;
  IF total_delta_sum_precheck < TOTAL_MIN OR total_delta_sum_precheck > TOTAL_MAX THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2 BOUNDED guard failed: total_delta_sum=% not in [%,%] — aborting before any insert',
      total_delta_sum_precheck, TOTAL_MIN, TOTAL_MAX;
  END IF;
  IF max_individual_precheck > MAX_INDIVIDUAL_LIMIT THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2 BOUNDED guard failed: max_individual=% exceeds % — aborting before any insert',
      max_individual_precheck, MAX_INDIVIDUAL_LIMIT;
  END IF;
  IF v_progress_rows < PROGRESS_ROWS_MIN OR v_progress_rows > PROGRESS_ROWS_MAX THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2 BOUNDED guard failed: progress_rows=% not in [%,%] — aborting before any insert',
      v_progress_rows, PROGRESS_ROWS_MIN, PROGRESS_ROWS_MAX;
  END IF;

  -- ① precheck — delta>0 후보 학생 수를 실행 로그에 남긴다(운영자가 실행
  --    전 SQL Editor 콘솔에서 눈으로 확인할 수 있도록 NOTICE로 출력).
  --    candidate_count는 위 BOUNDED 가드 사전 계산에서 이미 구했으므로
  --    재계산하지 않고 그대로 재사용한다(동일 쿼리 중복 방지).
  RAISE NOTICE 'reward_legacy_baseline_v2 precheck: candidate_students=%, v1_executed_at=%', candidate_count, v_v1_at;

  -- ② 학생별 delta 계산 + 통제된 타당성 검사 후 이관(reward_ledger) 또는
  --    검토 테이블(reward_baseline_review) 행 삽입. student_progress 행이
  --    없는 학생은 이 FOR 루프 자체에 등장하지 않으므로 자연히 스킵된다.
  FOR rec IN SELECT sp.student_id, sp.total_stars FROM student_progress sp
  LOOP
    v_earned := coalesce((SELECT rt.earned_stars FROM reward_totals rt WHERE rt.student_id = rec.student_id), 0);
    v_delta := coalesce(rec.total_stars, 0) - v_earned;
    CONTINUE WHEN v_delta <= 0;

    v_plausible_max := coalesce((
      SELECT sum(stars_earned) FROM student_daily_progress d
       WHERE d.student_id = rec.student_id AND d.date >= v_v1_at::date
    ), 0) + 50;

    IF v_delta > v_plausible_max THEN
      INSERT INTO reward_baseline_review (student_id, total_stars, ledger_earned, delta, plausible_max, migration_name)
      VALUES (rec.student_id, coalesce(rec.total_stars, 0), v_earned, v_delta, v_plausible_max, 'v3_48_reward_legacy_baseline_v2')
      ON CONFLICT (student_id, migration_name) DO NOTHING;
      review_count := review_count + 1;
    ELSE
      v_key := rec.student_id::text || ':legacy-baseline:migration:v2';
      INSERT INTO reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, xp_delta, idempotency_key, created_at)
      VALUES (rec.student_id, 'legacy-baseline', 'migration', 'v2', least(v_delta, 32767)::smallint, 0, v_key, now())
      ON CONFLICT (idempotency_key) DO NOTHING;
      IF FOUND THEN
        inserted_count := inserted_count + 1;
        total_delta_sum := total_delta_sum + v_delta;
      END IF;
    END IF;
  END LOOP;

  -- ③ postcheck — 후보 전원이 이관되거나 검토 테이블로 빠졌는지 확인
  --    (부분 처리 방지 — v3_37의 postcheck-mismatch-rollback과 동일 정신).
  RAISE NOTICE 'reward_legacy_baseline_v2 postcheck: candidate_students=%, inserted_rows=%, review_rows=%, total_delta_sum=%',
    candidate_count, inserted_count, review_count, total_delta_sum;
  IF (inserted_count + review_count) <> candidate_count THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2 mismatch: candidates=% inserted+review=% — rolling back',
      candidate_count, (inserted_count + review_count);
  END IF;

  -- EXACT 가드 — 중복 키 0건. idempotency_key unique 제약이 1차 방어이고,
  -- 이 count는 방어적 이중 확인이다: reward_ledger에 실제로 심긴 v2
  -- legacy-baseline 행 수가 이번 실행에서 센 inserted_count와 정확히
  -- 같아야 한다(다르면 unique 제약을 우회한 예상 밖 경로가 있다는 뜻).
  SELECT count(*) INTO v_dup_check
    FROM reward_ledger
   WHERE reward_type = 'legacy-baseline' AND source_type = 'migration' AND source_id = 'v2';
  IF v_dup_check <> inserted_count THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2 EXACT guard failed: reward_ledger v2 rows=% but inserted_count=% — mismatch, rolling back',
      v_dup_check, inserted_count;
  END IF;

  -- EXACT 가드 — 음수(또는 0) delta 행은 구조적으로 삽입될 수 없다
  -- (CONTINUE WHEN v_delta <= 0). 아래는 그 구조적 보장이 실제로 지켜졌는지
  -- 방어적으로 다시 확인하는 명시적 단언 — 0건이 아니면 즉시 중단한다.
  SELECT count(*) INTO v_negative_inserted_count
    FROM reward_ledger
   WHERE reward_type = 'legacy-baseline' AND source_type = 'migration' AND source_id = 'v2'
     AND stars_delta <= 0;
  IF v_negative_inserted_count <> 0 THEN
    RAISE EXCEPTION 'reward_legacy_baseline_v2 EXACT guard failed: % inserted v2 row(s) have stars_delta<=0 — rolling back',
      v_negative_inserted_count;
  END IF;

  -- ④ marker 완료 기록 — postcheck를 통과한 뒤에만 기록해, 다음 실행부터
  --    ⓪에서 걸러진다.
  INSERT INTO reward_migration_log (migration_name, executed_at, target_rows, total_stars_sum)
  VALUES ('v3_48_reward_legacy_baseline_v2', now(), inserted_count, total_delta_sum);
END $$;

COMMIT;

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서)
--   select count(*) from reward_ledger
--     where reward_type = 'legacy-baseline' and source_type = 'migration' and source_id = 'v2';
--   select count(*) from reward_baseline_review where migration_name = 'v3_48_reward_legacy_baseline_v2';
--   select * from reward_migration_log where migration_name = 'v3_48_reward_legacy_baseline_v2';
--   -- 위 marker 행이 있으면 재실행 시 자동으로 no-op.
--   select * from reward_baseline_review order by delta desc limit 10;
--   -- plausible_max를 초과해 자동 이관되지 않은 학생 목록 — 운영자 수동 검토용.
-- ============================================================================
