-- ============================================================================
-- supabase_v3_36_reward_ledger.sql — Reward System V1: 별 지급 원장(단일
-- 진실 원천 후보). 2026-08-15. 미실행 — Supabase 대시보드 SQL Editor에서
-- 운영자가 수동 실행(CLAUDE.md 규칙 8, 에이전트는 DDL 직접 실행 권한 없음).
-- 멱등 — 여러 번 실행해도 안전(create table if not exists / create or
-- replace view / create index if not exists).
--
-- ── 코드보다 먼저/나중에 실행돼도 안전(CLAUDE.md 규칙 9) ────────────────
-- 클라이언트(src/utils/rewardEngine.js — 이 원장 형태를 만드는 순수 함수
-- 모듈)는 이 테이블 부재를 감지하면 로컬 원장(append-only 배열, 향후
-- progress_data 내 저장 위치는 ticketEconomy.js의 ticketLedger와 동일한
-- 판단을 따를 예정)만으로 계속 동작해야 한다 — 이 SQL이 아직 실행되지
-- 않은 상태에서도 학습 흐름이 절대 막히지 않는다. 이 SQL이 코드보다
-- 먼저 실행돼도 안전 — 순수 추가 테이블(기존 테이블 컬럼 0개 변경),
-- 아무도 안 쓰면 그냥 빈 테이블로 존재할 뿐이다.
--
-- ── idempotency_key 형식(전역 UNIQUE) ───────────────────────────────────
--   `${student_id}:${reward_type}:${source_type}:${source_id}`
-- src/utils/rewardEngine.js의 rewardIdempotencyKey()가 이 형식의 단일
-- 진실 원천 — 서버/클라이언트가 같은 계산을 재구현하지 않고 그대로 공유
-- (paulRankShared.js가 api/grant-xp.js와 같은 판단 함수를 공유하는 것과
-- 동일 패턴). student_id를 키에 포함하는 이유: 이 컬럼이 테이블 전역
-- UNIQUE라, 두 학생이 우연히 같은 (reward_type, source_type, source_id)
-- 조합을 가질 수 있는 이벤트(예: 같은 반 같은 유닛 시험 완료)에서 서로의
-- 지급을 막지 않기 위함.
--
-- ── stars_delta check 하한만 두는 이유 ───────────────────────────────────
-- 원안은 `check (stars_delta between 0 and 50)`이었으나,
-- supabase_v3_37_reward_legacy_baseline.sql(기존 student_progress.
-- total_stars를 원장으로 1회성 이관)이 학생별 누적 총 별(수백 이상 가능)을
-- 그대로 옮겨 심어야 해서 상한이 baseline과 충돌한다. 그래서 하한(음수
-- 지급 방지)만 DB에 두고, "한 번의 실제 학습 이벤트가 비정상적으로 큰
-- 별을 지급하지 못하게" 막는 상한은 애플리케이션 레벨(rewardEngine.js
-- REWARD_STARS 화이트리스트 + 이 값만 신뢰하는 서버 쓰기 경로)에서
-- 관리한다.
--
-- ── RLS: 최소 권한(정책 0 + GRANT 0) — anon/authenticated 완전 차단,
-- service_role만 접근(v2_3_paul_rank.sql의 xp_ledger와 유사하나 더 엄격한
-- 패턴) ───────────────────────────────────────────────────────────────────
-- anon/authenticated에 INSERT/UPDATE/DELETE GRANT를 절대 추가하지 말 것
-- — 추가하는 순간 "클라이언트가 보낸 별 총합을 신뢰하지 않는다"는 이
-- 테이블의 존재 이유(서버 검증 전용 쓰기 경로)가 무효화된다.
-- 2026-08-18 갱신 — SELECT도 열지 않는다: src/와 api/ 전체를 실측한 결과
-- reward_ledger/reward_totals를 SELECT하는 코드가 0건(rewardEngine.js의
-- 주석 5줄이 전부, 실제 조회 없음)이라 앱이 읽지 않는 권한을 미리 열어둘
-- 이유가 없다 — 최소 권한 원칙. 나중에 서버(service_role)가 아닌 클라이언트
-- 가 읽어야 할 일이 생기면 그때 별도 마이그레이션으로 필요한 최소 범위만
-- 연다. 이 판단의 부수 효과: create policy 구문 자체가 파일에 없으므로
-- "정책 재실행 시 already exists 오류" 문제가 원천적으로 사라진다(정책이
-- 0개라 재실행할 정책이 없음) — 아래 2)번 참고.
-- ============================================================================

-- 1) reward_ledger — 이벤트별 원장. idempotency_key 전역 unique 제약이
--    곧 idempotency 메커니즘(같은 이벤트가 두 번 들어와도 두 번째는 DB가
--    자연스럽게 거부).
create table if not exists reward_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade, -- 2026-08-18 판단 근거: 기존 xp_ledger(supabase_v2_3_paul_rank.sql)와 동일한 on delete cascade 패턴을 그대로 따른다 — 학생 삭제 시 그 학생 파생 기록(원장 포함)도 함께 정리되는 것이 이 저장소의 기존 방침과 일치하고, 삭제된 아동의 개인정보 파생 데이터를 무기한 남기지 않는다는 판단. 트레이드오프: 삭제 후 그 학생 몫의 지급 이력을 감사(audit)해야 하는 요구가 생기면 CASCADE 때문에 원장이 함께 사라지므로, 그런 요구가 있다면 삭제 전에 별도 아카이브(예: 별도 테이블로 스냅샷)가 필요하다 — 지금은 그 요구가 없어 xp_ledger와 동일하게 CASCADE를 유지한다.
  reward_type text not null,
  source_type text not null,
  source_id text not null,
  stars_delta smallint not null check (stars_delta >= 0), -- 상한은 애플리케이션 레벨에서 관리(위 헤더 설명 — legacy-baseline 이관과의 충돌 회피). 2026-08-18 실측: production 최대 total_stars=1,553(smallint 한계 32767에서 충분히 안전, 32767 초과 학생 0명). 향후 이 값이 한계에 근접하면 `alter table reward_ledger alter column stars_delta type integer`로 무손실 승격 가능 — 지금은 타입을 바꾸지 않는다.
  xp_delta smallint not null default 0 check (xp_delta between 0 and 100), -- V1은 항상 0(XP는 기존 xp_ledger 경로 유지, "별을 조용히 XP로 변환하지 말라" 원칙)
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_reward_ledger_student on reward_ledger (student_id);

-- 2) RLS — 최소 권한(정책 0 + GRANT 0). enable row level security는
--    재실행 안전(이미 켜져 있어도 오류 없음, Postgres가 no-op으로 처리).
--    앱이 이 테이블을 읽지 않으므로 정책을 단 하나도 만들지 않는다 —
--    INSERT/UPDATE/DELETE/SELECT 전부 GRANT 자체가 없어 anon/authenticated
--    는 42501(permission denied)로 완전 차단되고, service_role만 RLS를
--    우회해 접근한다(BYPASSRLS 속성, Supabase 기본).
--    참고(멱등성): 이 파일에는 create policy 구문이 없으므로 "정책
--    재실행 시 already exists 오류"가 날 수 있는 경우 자체가 없다 —
--    해당 없음(정책을 만들지 않음).
alter table reward_ledger enable row level security;
-- 참고: anon/authenticated에 select/insert/update/delete GRANT를 절대
-- 추가하지 말 것 — 다음 세션을 위한 명시적 경고. 앱이 이 테이블을 전혀
-- 읽지 않으므로(src/, api/ 전수 실측, rewardEngine.js 주석 5줄이 전부)
-- SELECT GRANT도 필요 없다. 나중에 클라이언트가 읽어야 할 일이 생기면
-- 그때 별도 마이그레이션으로 필요한 최소 범위만 연다.

-- 3) reward_totals — 파생 VIEW(저장 아님, 매 조회 재계산). "저장된 합계
--    컬럼보다 파생값을 우선한다"는 xp_totals와 동일 판단 — 사본 컬럼이
--    없으면 사본-원본 불일치 버그 자체가 존재할 수 없다. 이 뷰도 앱이
--    읽지 않으므로 GRANT를 열지 않는다(최소 권한, service_role만 접근).
create or replace view reward_totals as
  select student_id, coalesce(sum(stars_delta), 0)::integer as earned_stars
  from reward_ledger
  group by student_id;

-- 4) reward_totals에 security_invoker=on 적용(버전 안전, 멱등) — PostgreSQL
--    뷰는 기본적으로 소유자 권한(security_invoker off)으로 실행되므로,
--    훗날 누군가 실수로 이 뷰에 SELECT를 부여하면 밑단 reward_ledger의
--    RLS(정책 0)를 우회해 전체 학생 집계가 노출될 수 있다. security_invoker
--    로 전환하면 뷰가 "조회하는 롤 자신"의 권한/RLS로 실행되어, 정책이
--    0개인 이상 어떤 롤이 뷰 SELECT 권한을 얻어도 0행만 반환된다(원천 차단).
--    security_invoker는 PostgreSQL 15+ 전용이라, 버전 가드 없이 무조건
--    실행하면 구버전 인스턴스에서 마이그레이션 전체가 실패한다 — 그래서
--    server_version_num을 확인하는 DO 블록으로 감쌌다. PG15 미만이면 이
--    설정을 건너뛰어도 위험하지 않다(GRANT가 0건이라 뷰에 접근 가능한
--    롤 자체가 service_role뿐 — service_role은 RLS를 우회하는 게 원래
--    의도된 동작이라 security_invoker 여부와 무관).
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'alter view reward_totals set (security_invoker = on)';
    RAISE NOTICE 'reward_totals: security_invoker=on 적용(PG15+)';
  ELSE
    RAISE NOTICE 'reward_totals: PG15 미만이라 security_invoker 미지원 — GRANT 0건이므로 노출 위험 없음(뷰에 접근 가능한 롤이 service_role뿐)';
  END IF;
END $$;

-- 5) 명시적 REVOKE(자기 교정) — 이 파일은 GRANT를 한 번도 부여한 적이
--    없지만, 혹시 이 파일의 이전 버전(anon/authenticated에 SELECT를
--    부여하던 버전)을 누군가 이미 실행했다면 그 권한은 재실행만으로는
--    회수되지 않는다. 아래 REVOKE는 그런 과거 실행 여부와 무관하게
--    마이그레이션이 항상 "GRANT 0건"이라는 최종 상태로 수렴하게 하는
--    자기 교정 구문이다 — 부여된 적이 없으면 완전한 no-op(오류 없음),
--    재실행해도 안전. 대상은 이번에 새로 만드는 reward_ledger/
--    reward_totals 두 개뿐이며, students/student_progress/xp_ledger/
--    word_status 등 기존 테이블의 권한 체계는 절대 건드리지 않는다.
revoke all on table reward_ledger from anon, authenticated;
revoke all on table reward_totals from anon, authenticated;

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 확인 (부작용 없는 조회만 — 같은 SQL Editor에서 바로 실행 가능)
--
--   select count(*) from reward_ledger;
--   select count(*) from reward_totals;
--
-- 위 두 count가 오류 없이 나오면 테이블/뷰가 정상 생성된 것이다(초기에는
-- 0건이 정상). anon 권한 거부 확인/중복 방지(unique) 확인처럼 실제로 행을
-- 넣고 지우는 검증은 이 파일에서 완전히 분리했다 — 필요하면 운영자 판단
-- 하에 supabase_v3_36_reward_ledger_VERIFY.sql을 별도로 실행할 것. 이
-- 마이그레이션 본문은 그 VERIFY 파일 없이도 완결된다.
-- ============================================================================
