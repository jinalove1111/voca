-- ============================================================================
-- supabase_v3_48_reward_legacy_baseline_v2.sql — Reward System V1: legacy
-- baseline 2차 이관(v2), **전면 재설계**. 2026-09-07.
--
-- 실행은 운영자가 Supabase 대시보드 SQL Editor에서 supabase_v3_37_
-- reward_legacy_baseline.sql 실행 확인 후 1회 실행(수동 실행, CLAUDE.md
-- 규칙 8). 이 파일 자체는 함수/뷰/marker 1행만 설치할 뿐, 학생별 원장
-- 행은 이 SQL 실행 시점에는 단 1건도 삽입하지 않는다(설치만, 데이터는
-- 학생이 다음 로그인 시 스스로 채운다 — 아래 "왜 per-student RPC인가"
-- 참고). 재실행해도 함수/뷰는 create or replace로, marker는 ON CONFLICT
-- DO NOTHING으로 항상 안전(멱등).
--
-- ── 왜 v2를 통째로 다시 설계했는가(2026-09-06 하드닝판의 구조적 결함) ────
-- 직전 버전(2026-09-06 하드닝판, EXACT/BOUNDED 가드 포함)은 마이그레이션
-- 실행 시각 T 딱 한 번, 전체 학생을 순회하며
--   delta = student_progress.total_stars(T) − reward_totals.earned_stars(T)
-- 를 전역 스냅샷으로 계산해 원장에 심었다. 그런데 실측 결과 이 계산은
-- 구조적으로 이중 계상 또는 누락을 만든다는 것이 드러났다:
--
--   · 클라이언트는 별을 번 뒤 ~2초 디바운스를 거쳐 student_progress.
--     total_stars를 업로드한다. 반면 서버 원장(reward_ledger) 행은 그
--     지급을 트리거한 POST가 도착한 시점(또는 신규 재시도 큐를 통해
--     그보다 한참 뒤)에 삽입된다 — 즉 "화면에 별이 반영된 시각"과
--     "서버 원장에 그 별이 기록된 시각" 사이에 신뢰할 수 없는 간극이
--     있다.
--   · total_stars 업로드가 T *이전*에 도착했지만 그 이벤트의 원장 INSERT가
--     T *이후*에 도착하면: 전역 스냅샷은 이미 이 별을 "레거시(원장에
--     없던 부분)"로 계상해 baseline에 담고, 뒤이어 도착한 원장 INSERT가
--     또 한 번 이 별을 더한다 → **이중 계상**.
--   · 반대로 원장 INSERT가 T *이전*에 들어왔지만 total_stars 업로드가 T
--     *이후*에 도착하면: baseline 계산 시점엔 이미 원장에 반영돼 있으니
--     delta에 안 잡히고, 그렇다고 T 이후의 정상 이벤트로도 다시 안 잡힌다
--     (원장 INSERT가 이미 끝났으므로) → **누락**.
--
-- 이 간극을 "타임스탬프를 비교해서" 메우려는 시도 자체가 근본적으로
-- 불가능하다 — reward_ledger.source_id에 들어가는 날짜는 **클라이언트
-- 시계** 기준이라 서버가 신뢰할 수 있는 이벤트 시각이 어디에도 없다
-- (student_daily_progress.date도 클라이언트가 채우는 값). 그래서 이
-- 재설계는 타임스탬프 비교를 완전히 포기하고 "학생별로, 클라이언트가
-- 스스로 선언한 정지(quiescent) 시점"에서 그 학생만 정산하는 방식으로
-- 바꿨다.
--
-- ── 새 설계: per-student reconcile RPC(전역 스냅샷 폐기) ─────────────────
-- 클라이언트(reward 재시도 큐를 다루는 별도 세션/에이전트가 구현)는:
--   1) 자신의 로컬 reward 재시도 큐를 모두 비운다(드레인 — 큐에 남아
--      있던 미전송 POST를 서버에 전부 반영).
--   2) 큐가 빌 때까지 신규 POST 발생을 홀드한다(정지 시점 확보).
--   3) 그 순간의 로컬 total_stars 스냅샷 값을 들고 이 파일이 설치하는
--      `reconcile_legacy_baseline(p_student_id, p_snapshot_total)` RPC를
--      1회 호출한다.
-- 서버는 그 순간 자신의 원장(reward_totals)과 클라이언트가 보고한
-- 스냅샷만 비교한다 — **어떤 타임스탬프도 비교하지 않는다.** 학생마다
-- "정지 시점"이 다르므로(로그인할 때마다 정산), 전역 스냅샷의 "모두가
-- 같은 T 시점"이라는 잘못된 전제 자체가 사라진다. 이 함수는 학생이 다음
-- 로그인 시 최초 1회만 의미 있게 작동하고(그 이후는 already_reconciled로
-- 즉시 종료), reward_ledger에 source_id='v2' 행이 학생별로 최대 1건만
-- 쌓인다 — v3_37(source_id='v1', 전역 1회성)과 감사 목적으로 명확히
-- 구분된다.
--
-- ── cutover marker는 감사(audit)용일 뿐, 어떤 판정에도 쓰이지 않는다 ─────
-- 아래 EXACT 전제조건 블록이 reward_migration_log에 심는
-- 'v3_48_legacy_reconcile_cutover' 행은 "이 SQL이 언제 설치됐는가"를
-- 사람이 나중에 확인할 수 있게 남기는 감사 기록일 뿐이다 —
-- reconcile_legacy_baseline() 함수 본문 어디에서도 이 marker의 시각을
-- 읽거나 비교하지 않는다(위 "왜 v2를 통째로 다시 설계했는가" 절에서
-- 설명한, 타임스탬프 비교 자체를 신뢰하지 않는다는 설계 원칙과 일관).
--
-- ── student_progress/reward_ledger v1 행은 절대 건드리지 않는다 ──────────
-- 이 파일은 student_progress에 대한 UPDATE/DELETE 문을 단 하나도 포함하지
-- 않는다(SELECT로만 읽는다). reward_ledger에 대해서도 함수 내부 INSERT만
-- 있고 기존 행(v1 baseline 포함)은 절대 수정/삭제하지 않는다 —
-- source_id='v2'로 v1과 명확히 구분해 감사 가능성을 유지한다.
--
-- ── EXACT 전제조건(설치 시점 1회 확인, DO 블록) ───────────────────────────
-- 이 SQL을 실행하는 시점에 아래를 모두 확인하고, 하나라도 위반되면
-- RAISE EXCEPTION으로 트랜잭션 전체를 중단한다(BEGIN/COMMIT으로 감싸져
-- 있어 EXCEPTION 시 자동 ROLLBACK, 함수/뷰/marker 무엇도 설치되지 않음):
--   · v3_37 marker(reward_migration_log)가 존재 — 학생별 함수가 실행 시점
--     마다 스스로 이 marker를 다시 확인하지는 않지만(런타임에는 marker
--     부재 시 "여유 없이 보수적으로" 처리 — 함수 본문 h 단계 주석 참고),
--     애초에 v1 baseline이 전혀 실행되지 않은 상태로 v2를 설치하는 것
--     자체가 설계 전제 위반이라 설치 단계에서부터 막는다.
--   · reward_totals/reward_ledger/student_progress 3개가 반드시 존재.
--   · reward_totals가 0행이면 안 됨 — v1 baseline이 통째로 유실된 상태로
--     착각하고 설치하면, 이후 모든 학생의 per-student reconcile이 "원장에
--     아무것도 없다"고 오판해 total_stars 전액을 baseline으로 이관하며
--     이중 계상 위험이 매우 크다.
--
-- ── 가드 상수(함수 내부 CONSTANT, 2026-09-07 실측 근거) ──────────────────
-- TOLERANCE=100 / MAX_INDIVIDUAL=1500 / SNAPSHOT_SLACK=200 / SNAPSHOT_MAX=
-- 100000 — 근거는 아래 함수 정의 DECLARE 절 주석에 전문이 있다(요약:
-- history-blob-vs-total_stars 노이즈 실측 p90=57/max=370이라 TOLERANCE=100은
-- p90 이상을 통과시키고 이상치만 review로 보낸다. MAX_INDIVIDUAL=1500은
-- 실측 최대 delta 277 + 14일×75별/일 여유. SNAPSHOT_SLACK=200은 클라이언트
-- 스냅샷이 자신의 2초 디바운스 업로드보다 몇 건 앞설 수 있는 정상 오차
-- 범위). 이 4개 값은 scripts/lib/baselineV2Guards.mjs의 동일 이름 상수와
-- 리터럴이 반드시 일치해야 하며, scripts/testBaselineV2Sql.mjs가 두 파일의
-- 숫자를 정적으로 대조해 드리프트를 잡는다.
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

-- 1) reward_baseline_review — 검토용 테이블. 컬럼 구성은 2026-09-06
--    하드닝판과 동일하게 유지하지만, `total_stars` 컬럼의 의미가
--    바뀌었다: 더 이상 "그 시점 student_progress.total_stars 서버 값"이
--    아니라 "그 학생이 reconcile 호출 시 들고 온 클라이언트 스냅샷
--    (p_snapshot_total)"을 기록한다 — per-student RPC 설계에서는 서버가
--    전체 학생을 순회하며 한 번에 계산하지 않으므로, 각 호출이 자기
--    스냅샷 값을 스스로 남긴다. `migration_name`은 여전히
--    'v3_48_reward_legacy_baseline_v2' 문자열로 고정해 v1(v3_37)과
--    구분한다(이 이름의 reward_migration_log 행이 실제로 존재하는 것은
--    아니다 — 감사용 marker는 별도의 'v3_48_legacy_reconcile_cutover'
--    행이며, 이 컬럼은 그와 무관하게 "어떤 메커니즘이 이 검토 행을
--    남겼는가"를 표시하는 태그일 뿐이다). RLS/GRANT는 v1과 동일한 최소
--    권한(정책 0 + GRANT 0, service_role만 접근) — 학생별 원본 스냅샷/
--    원장 수치를 클라이언트에 절대 노출하지 않는다.
create table if not exists reward_baseline_review (
  student_id uuid not null,
  total_stars integer not null, -- 의미 변경: 이제 "클라이언트 스냅샷"(p_snapshot_total)을 기록한다(위 설명 참고, 컬럼명은 하위 호환을 위해 유지).
  ledger_earned integer not null,
  delta integer not null,
  plausible_max integer not null,
  migration_name text not null,
  created_at timestamptz not null default now(),
  primary key (student_id, migration_name)
);
alter table reward_baseline_review enable row level security;
revoke all on table reward_baseline_review from anon, authenticated;

-- 2) EXACT 전제조건 — 함수/뷰를 설치하기 전에 한 번만 확인한다(설치
--    시점 검증. 학생별 reconcile 호출마다 반복하지 않는다 — 반복하면
--    "v3_37 marker가 나중에 지워지는" 있을 수 없는 시나리오까지 매번
--    확인하는 낭비이고, 애초에 이 확인의 목적은 "v2를 v1 없이 설치하는
--    설계 실수"를 막는 것이지 런타임 방어가 아니다).
DO $$
DECLARE
  v_v1_at timestamptz;
  v_reward_totals_rows integer := 0;
BEGIN
  -- v3_37 선행 확인.
  SELECT executed_at INTO v_v1_at
    FROM reward_migration_log
   WHERE migration_name = 'v3_37_reward_legacy_baseline';
  IF v_v1_at IS NULL THEN
    RAISE EXCEPTION 'v3_48 preflight: v3_37 marker not found in reward_migration_log — run supabase_v3_37_reward_legacy_baseline.sql first';
  END IF;

  -- 필수 테이블/뷰 3개 존재 확인.
  IF to_regclass('public.reward_totals') IS NULL THEN
    RAISE EXCEPTION 'v3_48 preflight: reward_totals not found';
  END IF;
  IF to_regclass('public.reward_ledger') IS NULL THEN
    RAISE EXCEPTION 'v3_48 preflight: reward_ledger not found';
  END IF;
  IF to_regclass('public.student_progress') IS NULL THEN
    RAISE EXCEPTION 'v3_48 preflight: student_progress not found';
  END IF;

  -- reward_totals가 0행이면 v1 baseline이 통째로 유실된 것으로 간주하고
  -- 즉시 중단한다(그대로 진행하면 이후 모든 per-student reconcile이
  -- "원장에 아무것도 없다"고 오판해 이중 계상 위험이 매우 크다).
  SELECT count(*) INTO v_reward_totals_rows FROM reward_totals;
  IF v_reward_totals_rows = 0 THEN
    RAISE EXCEPTION 'v3_48 preflight: reward_totals has 0 rows — v1 baseline appears missing (per-student reconcile would double-count everyone)';
  END IF;

  -- 감사 전용 cutover marker — 어떤 로직도 이 값을 읽거나 비교하지 않는다
  -- (헤더 "cutover marker는 감사용일 뿐" 절 참고). reward_migration_log의
  -- PK는 migration_name이므로 ON CONFLICT DO NOTHING으로 재실행 안전.
  INSERT INTO reward_migration_log (migration_name, executed_at, target_rows, total_stars_sum)
  VALUES ('v3_48_legacy_reconcile_cutover', now(), 0, 0)
  ON CONFLICT (migration_name) DO NOTHING;

  RAISE NOTICE 'v3_48 preflight passed — legacy reconcile cutover marker recorded (audit only, v1_executed_at=%)', v_v1_at;
END $$;

-- 3) reconcile_legacy_baseline — per-student 정산 단일 진입점. 반드시
--    service_role 전용(SECURITY DEFINER 함수는 기본적으로 PUBLIC에 EXECUTE
--    권한이 부여되므로 아래 REVOKE로 반드시 회수 — supabase_v3_47_
--    town_shop.sql의 purchase_town_item과 동일 경고). 학생이 이 함수를
--    직접 호출할 수 있으면 스냅샷 값을 조작해 baseline을 부풀릴 수
--    있으므로, 반드시 api/*.js(service_role key)만 호출한다.
create or replace function public.reconcile_legacy_baseline(p_student_id uuid, p_snapshot_total integer)
returns table (ok boolean, reason text, baseline_stars integer, earned_after integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
-- OUT 컬럼명(baseline_stars 등)이 테이블 컬럼명과 겹칠 때 plpgsql이 모호한
-- 컬럼 참조로 런타임 오류를 내는 것을 막는 belt-and-braces 설정 —
-- 아래에서도 모든 컬럼 참조에 테이블 별칭(rt/sp/st/rl)을 명시해 이 설정에
-- 의존하지 않고도 안전하게 동작하도록 이중으로 막는다.
declare
  -- ══════════════════════════════════════════════════════════════════════
  -- 가드 상수 — 2026-09-07 실측 기준. scripts/lib/baselineV2Guards.mjs의
  -- 동일 이름 상수와 리터럴이 반드시 일치해야 한다(scripts/
  -- testBaselineV2Sql.mjs가 정적으로 대조한다 — 한쪽만 고치지 말 것).
  --   TOLERANCE=100 — history-blob(student_progress.progress_data.history)
  --     vs total_stars 노이즈를 2026-09-07 READ-ONLY로 실측한 결과 p90=57,
  --     max=370. 100은 p90 이상을 통과시키면서 극단적 이상치(예:
  --     history와 무관하게 total_stars만 부풀려진 경우)만 review로 보낸다.
  --   MAX_INDIVIDUAL=1500 — 실측 관측된 학생별 최대 delta 277 +
  --     14일×관측 최대 75별/일 ≈ 1,330 여유를 반올림.
  --   SNAPSHOT_SLACK=200 — 클라이언트가 들고 오는 로컬 스냅샷(2초
  --     디바운스로 아직 서버에 업로드되지 않은 최신 값)이 이미 서버에
  --     반영된 student_progress.total_stars보다 몇 건의 grant만큼
  --     앞서 있는 것은 정상 — 이 여유를 넘어서면(디바운스 몇 초로는
  --     설명 안 되는 큰 차이) review로 보낸다.
  --   SNAPSHOT_MAX=100000 — 스냅샷 자체가 정수 범위를 벗어난 명백한 오염
  --     값(음수/비정상적으로 큰 값)을 최소 비용으로 걸러내는 상한.
  TOLERANCE constant integer := 100;
  MAX_INDIVIDUAL constant integer := 1500;
  SNAPSHOT_SLACK constant integer := 200;
  SNAPSHOT_MAX constant integer := 100000;

  v_earned integer;
  v_uploaded integer;
  v_delta integer;
  v_existing_delta integer;
  v_v1_at timestamptz;
  v_history_since integer := 0;
  v_plausible_max integer;
  v_hist_rec record;
begin
  -- a) 학생 존재 확인.
  if p_student_id is null or not exists (select 1 from students st where st.id = p_student_id) then
    return query select false, 'student_not_found'::text, 0, 0;
    return;
  end if;

  -- b) 스냅샷 값 자체의 유효성(범위) 확인.
  if p_snapshot_total is null or p_snapshot_total < 0 or p_snapshot_total > SNAPSHOT_MAX then
    return query select false, 'invalid_snapshot'::text, 0, 0;
    return;
  end if;

  -- c) 학생별 advisory lock — 같은 학생이 거의 동시에 두 번 reconcile을
  --    호출하는 경합(더블클릭/재시도/여러 탭)을 직렬화한다(hashtext,
  --    xact 범위라 트랜잭션 종료 시 자동 해제 — purchase_town_item과
  --    동일 패턴).
  perform pg_advisory_xact_lock(hashtext('reconcile_legacy_baseline:' || p_student_id::text));

  -- d) 현재 원장 합계(서버가 신뢰하는 유일한 값 — student_progress.
  --    total_stars는 클라이언트 표시용 캐시라 이 계산에 절대 쓰지 않는다,
  --    CLAUDE.md 규칙 1/4와 같은 정신).
  v_earned := coalesce((select rt.earned_stars from reward_totals rt where rt.student_id = p_student_id), 0);

  -- e) 이미 이 학생의 v2 reconcile 행이 있으면 즉시 already_reconciled —
  --    타임스탬프를 전혀 비교하지 않고 "이미 심었는가"만 본다(설계 원칙).
  select rl.stars_delta into v_existing_delta
    from reward_ledger rl
   where rl.student_id = p_student_id
     and rl.reward_type = 'legacy-baseline'
     and rl.source_type = 'migration'
     and rl.source_id = 'v2';
  if found then
    return query select true, 'already_reconciled'::text, v_existing_delta, v_earned;
    return;
  end if;

  -- f) 스냅샷이 서버에 이미 업로드된 total_stars보다 SNAPSHOT_SLACK 이상
  --    앞서 있으면(클라이언트 디바운스로는 설명되지 않는 큰 차이) review로
  --    보내고 원장에는 아무것도 넣지 않는다. `sp.total_stars`를 읽는 것은
  --    이 SQL 파일 전체에서 이 한 곳뿐이다(SNAPSHOT_SLACK 상식 확인
  --    전용 — 잔액/구매 가능 여부 등 어떤 판정에도 total_stars를 쓰지
  --    않는다, 위 d) 주석 참고).
  v_uploaded := coalesce((select sp.total_stars from student_progress sp where sp.student_id = p_student_id), 0);
  if p_snapshot_total > v_uploaded + SNAPSHOT_SLACK then
    insert into reward_baseline_review (student_id, total_stars, ledger_earned, delta, plausible_max, migration_name)
    values (p_student_id, p_snapshot_total, v_earned, p_snapshot_total - v_earned, v_uploaded + SNAPSHOT_SLACK, 'v3_48_reward_legacy_baseline_v2')
    on conflict (student_id, migration_name) do nothing;
    return query select false, 'review'::text, 0, v_earned;
    return;
  end if;

  -- g) delta 계산. 0 이하면(이미 원장이 스냅샷을 따라잡았거나 넘어선
  --    경우) "정산할 것 없음" 확정 마커(stars_delta=0, check 제약이 0
  --    이상을 허용)를 심어 이후 호출을 곧장 e)에서 already_reconciled로
  --    수렴시킨다(재계산 반복 방지).
  v_delta := p_snapshot_total - v_earned;
  if v_delta <= 0 then
    insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, xp_delta, idempotency_key, created_at)
    values (p_student_id, 'legacy-baseline', 'migration', 'v2', 0, 0, p_student_id::text || ':legacy-baseline:migration:v2', now())
    on conflict (idempotency_key) do nothing;
    return query select true, 'nothing_to_reconcile'::text, 0, v_earned;
    return;
  end if;

  -- h) 타당성 검사 — v3_37 실행 시각 이후 history 블록에 실제로 기록된
  --    starsEarned 합계(+ TOLERANCE 여유)를 "이 학생이 v1 이후 실제로
  --    벌었을 법한 최대치"로 보고, delta가 이를 초과하거나
  --    MAX_INDIVIDUAL을 초과하면 원장에 넣지 않고 review로 보낸다.
  --    history 키는 JS Date().toDateString() 형식("Mon Jan 05 2026")을
  --    가정한다 — 먼저 정규식으로 그 형식과 일치하는 키만 골라내고
  --    (형식이 다른 키는 to_date 호출 자체를 하지 않고 건너뛴다), 그래도
  --    남을 수 있는 개별 파싱 실패(예: 존재하지 않는 날짜)는 begin/
  --    exception으로 개별 키 단위로만 흡수해 함수 전체가 죽지 않게 한다.
  --    v3_37 marker가 어떤 이유로든 사라져 있으면(있을 수 없는 상황이지만
  --    방어적으로) history를 전혀 신뢰하지 않고 v_history_since=0으로
  --    보수적으로 처리한다 — "관대하게 통과시키는" 방향이 아니라 "더 자주
  --    review로 보내는" 안전한 방향으로 fail-closed.
  select rm.executed_at into v_v1_at
    from reward_migration_log rm
   where rm.migration_name = 'v3_37_reward_legacy_baseline';

  for v_hist_rec in
    select he.key as hist_key, he.value as hist_val
      from student_progress sp
      cross join lateral jsonb_each(coalesce(sp.progress_data->'history', '{}'::jsonb)) as he(key, value)
     where sp.student_id = p_student_id
  loop
    if v_hist_rec.hist_key ~ '^[A-Za-z]{3} [A-Za-z]{3} [0-9]{2} [0-9]{4}$' then
      begin
        if v_v1_at is not null and to_date(v_hist_rec.hist_key, 'Dy Mon DD YYYY') >= v_v1_at::date then
          v_history_since := v_history_since + coalesce((v_hist_rec.hist_val->>'starsEarned')::int, 0);
        end if;
      exception when others then
        -- 정규식은 통과했지만 실제 날짜 파싱에 실패한 개별 키는 안전하게
        -- 건너뛴다(함수 전체를 죽이지 않는다).
        null;
      end;
    end if;
  end loop;

  v_plausible_max := v_history_since + TOLERANCE;

  if v_delta > v_plausible_max or v_delta > MAX_INDIVIDUAL then
    insert into reward_baseline_review (student_id, total_stars, ledger_earned, delta, plausible_max, migration_name)
    values (p_student_id, p_snapshot_total, v_earned, v_delta, v_plausible_max, 'v3_48_reward_legacy_baseline_v2')
    on conflict (student_id, migration_name) do nothing;
    return query select false, 'review'::text, 0, v_earned;
    return;
  end if;

  -- i) 실제 정산 — unique(idempotency_key) 경합에 대비해 예외 처리로
  --    감싼다: advisory lock이 같은 학생의 순차 처리를 보장하지만, 혹시
  --    모를 레이스에도 이중 계상 대신 already_reconciled로 안전하게
  --    수렴시킨다(purchase_town_item의 already_owned 패턴과 동일 정신).
  begin
    insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, xp_delta, idempotency_key, created_at)
    values (p_student_id, 'legacy-baseline', 'migration', 'v2', least(v_delta, 32767)::smallint, 0, p_student_id::text || ':legacy-baseline:migration:v2', now());
  exception when unique_violation then
    return query select true, 'already_reconciled'::text, 0, v_earned;
    return;
  end;

  -- j) 정산 완료.
  return query select true, 'reconciled'::text, v_delta, v_earned + v_delta;
end;
$$;

revoke all on function public.reconcile_legacy_baseline(uuid, integer) from public;
revoke all on function public.reconcile_legacy_baseline(uuid, integer) from anon, authenticated;
grant execute on function public.reconcile_legacy_baseline(uuid, integer) to service_role;

-- 4) reward_baseline_v2_status — 운영자 모니터링 뷰(파생값, 저장 아님).
--    학생들이 로그인하며 reconcile을 호출할 때마다 이 뷰의 집계가
--    자연스럽게 늘어난다 — 별도 배치/스케줄 없이 그냥 조회 시점 재계산.
--    service_role 전용(GRANT 없음).
create or replace view reward_baseline_v2_status as
  select
    count(*) filter (where rl.stars_delta > 0) as reconciled_students,
    count(*) filter (where rl.stars_delta = 0) as nothing_students,
    coalesce(sum(rl.stars_delta), 0)::bigint as baseline_total,
    (select count(*) from reward_baseline_review rbr where rbr.migration_name = 'v3_48_reward_legacy_baseline_v2') as review_rows
  from reward_ledger rl
 where rl.reward_type = 'legacy-baseline'
   and rl.source_type = 'migration'
   and rl.source_id = 'v2';

-- reward_totals(v3_36)와 동일한 이유로 security_invoker=on 적용(PG15+
-- 전용, 버전 가드). GRANT가 0건이라 이 뷰에 접근 가능한 롤은 service_role
-- 뿐이지만(BYPASSRLS), 훗날 실수로 누군가 anon/authenticated에 SELECT를
-- 부여하더라도 security_invoker가 켜져 있으면 밑단 reward_ledger/
-- reward_baseline_review의 RLS(정책 0)를 우회하지 못해 0행만 반환된다.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'alter view reward_baseline_v2_status set (security_invoker = on)';
    RAISE NOTICE 'reward_baseline_v2_status: security_invoker=on 적용(PG15+)';
  ELSE
    RAISE NOTICE 'reward_baseline_v2_status: PG15 미만이라 security_invoker 미지원 — GRANT 0건이므로 노출 위험 없음(뷰에 접근 가능한 롤이 service_role뿐)';
  END IF;
END $$;

-- 명시적 REVOKE(자기 교정, v3_36과 동일 관례) — 이 뷰는 GRANT를 한 번도
-- 부여한 적이 없지만, 과거 실행 여부와 무관하게 "GRANT 0건"이라는 최종
-- 상태로 항상 수렴하게 한다(부여된 적이 없으면 완전한 no-op, 재실행 안전).
revoke all on table reward_baseline_v2_status from anon, authenticated;

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서, service_role/postgres 세션)
--   select * from reward_migration_log where migration_name = 'v3_48_legacy_reconcile_cutover';
--   -- 감사용 cutover marker 1행 확인(설치 시각). 로직에는 쓰이지 않는다.
--   select * from reward_baseline_v2_status;
--   -- 학생들이 로그인하며 reconcile을 호출한 만큼 reconciled_students/
--   -- baseline_total이 시간이 지나며 자연스럽게 늘어난다(0부터 시작 —
--   -- 이 SQL 실행 자체는 데이터를 넣지 않는다).
--   select * from reward_baseline_review order by created_at desc limit 10;
--   -- SNAPSHOT_SLACK/타당성 검사를 초과해 원장에 자동 반영되지 않은
--   -- 학생 목록 — 운영자 수동 검토용. 아래 6) 참고.
--
--   select * from reward_ledger where reward_type='legacy-baseline' and source_type='migration' and source_id='v2' and student_id = '<review 행의 student_id>';
--   -- 해당 학생이 그 뒤 재로그인해 스스로 reconcile에 성공했는지 확인.
--
-- review 행을 운영자가 수동으로 승인해 원장에 반영하고 싶다면(신중하게
-- 판단한 뒤에만) 아래 INSERT 템플릿을 참고 — **이 파일은 이 문장을
-- 실행하지 않는다(NOT EXECUTED, 템플릿일 뿐)**:
--   insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, xp_delta, idempotency_key, created_at)
--   values ('<student_id>', 'legacy-baseline', 'migration', 'v2', <운영자가 검토해 확정한 값>, 0, '<student_id>:legacy-baseline:migration:v2', now())
--   on conflict (idempotency_key) do nothing;
-- ============================================================================
