-- v3.45 — 백업/마이그레이션 로그 6개 테이블 RLS 활성화 + anon/authenticated
-- 권한 회수 (2026-09-02, Supabase Security Advisor 경고 대응)
--
-- ── 배경 ────────────────────────────────────────────────────────────────
-- 2026-09-02 Supabase Security Advisor 경고 `rls_disabled_in_public`.
-- READ-ONLY 감사로 아래 6개 테이블의 상태를 실측(HEAD count=exact):
-- 백업 5개는 RLS 비활성 + anon 조회 가능(SELECT 200)을 실측. reward_migration_log는
-- RLS 이미 활성(정책 0)이지만 anon/authenticated GRANT가 남아 있어 함께 회수 대상이다.
--   · backup_20260809_paul_dedup      (3행,  컬럼 id,name,class_id,unit_name,current_unit_id)
--   · backup_20260809_roster_v324     (17행)
--   · backup_20260809_roster_v325     (33행)
--   · backup_20260809_roster_v327     (87행)
--   · backup_20260809_roster_v328     (6행)
--   · reward_migration_log            (1행 — v3_37 완료 마커. 2026-09-02 VERIFY 실측.
--                                    이 테이블은 이미 RLS ON + 정책 0개라 anon에는 0행으로
--                                    보였음 → v3_45에서는 revoke만 실질 효과)
-- 백업 5개는 v3_23/v3_24/v3_25/v3_27/v3_28이 `create table if not exists
-- ... as select`로 만든 학생 id·이름 스냅샷이고, reward_migration_log는
-- v3_37의 멱등 마커 테이블이다. public 스키마 기본 권한(ALTER DEFAULT
-- PRIVILEGES) 때문에 anon/authenticated에 ALL이 부여된 상태로 추정된다
-- (입력/수정/삭제 권한은 재실측하지 않음 — 조회 결과 200만 실측 확정).
--
-- ── 앱 영향 0 근거 ─────────────────────────────────────────────────────
-- src/, api/, supabase/functions/ 전수 grep 결과 6개 테이블 이름 참조
-- 0건(2026-09-02). scripts/testRewardBaselineMigration.mjs,
-- scripts/testRewardEngine.mjs는 v3_37 SQL 텍스트를 정적 검사할 뿐 DB
-- 접근 없음. 따라서 이 6개 테이블을 잠가도 학생/관리자/학부모 화면 및
-- API 어디에도 영향이 없다.
--
-- v3_37(reward_migration_log의 유일한 사용자)과
-- supabase_v3_36_37_reward_ledger_ROLLBACK.sql은 SQL Editor(postgres 롤)
-- 또는 service_role로만 실행되므로 이 RLS/REVOKE 변경과 무관하다 —
-- postgres는 테이블 소유자, service_role은 BYPASSRLS 속성을 가진다.
-- 행 단위 보안을 테이블 소유자에게까지 강제 적용하는 옵션은 사용하지
-- 않는다(소유자 접근을 유지하기 위함).
--
-- ── 이 파일이 하는 일 ────────────────────────────────────────────────────
-- 존재하는 테이블에 한해서만(to_regclass로 존재 확인):
--   alter table public.<t> enable row level security;
--   revoke all on table public.<t> from anon, authenticated;
-- 정책(create policy)은 하나도 만들지 않는다 — 기본 거부(default deny).
-- 이미 존재하지 않는 테이블은 RAISE NOTICE로 건너뛴다(멱등, 재실행 안전).
-- service_role/postgres 권한은 절대 건드리지 않는다. 데이터 변경(추가/
-- 수정/제거) 0, 다른 테이블 접촉 0.
--
-- ── CLAUDE.md 규칙 준수 ───────────────────────────────────────────────
-- 규칙 8: 에이전트는 DDL을 직접 실행하지 않는다 — 이 파일은 준비만 하고,
-- 실행은 운영자가 Supabase 대시보드 SQL Editor에서 수동으로 한다.
-- 규칙 9: 코드 배포와 무관하게 언제든 실행 가능(앱이 이 6개 테이블을
-- 전혀 참조하지 않으므로, 이 SQL이 코드보다 먼저 실행되든 나중에
-- 실행되든 앱이 깨지지 않는다).
--
-- ── 실행 순서 ──────────────────────────────────────────────────────────
-- 1) (선택) supabase_v3_45_lockdown_backup_tables_VERIFY.sql을 먼저 실행해
--    실행 전 상태(RLS off, anon/authenticated 권한 보유, 정책 0개, 행 수)를
--    기록해 둔다.
-- 2) 이 파일 전문을 Supabase 대시보드 SQL Editor에 붙여넣고 실행 — 코드
--    배포는 필요 없다.
-- 3) VERIFY를 다시 실행해 실행 후 상태(RLS on, anon/authenticated 권한
--    0건, 정책 여전히 0개, 행 수 불변)를 확인한다.
--
-- 롤백: supabase_v3_45_lockdown_backup_tables_ROLLBACK.sql (주의: 원래의
-- 취약한 anon 개방 상태로 되돌리므로 되도록 사용하지 않을 것 — 헤더 참고).

do $$
declare
  v_tables text[] := array[
    'backup_20260809_paul_dedup',
    'backup_20260809_roster_v324',
    'backup_20260809_roster_v325',
    'backup_20260809_roster_v327',
    'backup_20260809_roster_v328',
    'reward_migration_log'
  ];
  v_t text;
begin
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null then
      execute format('alter table public.%I enable row level security;', v_t);
      execute format('revoke all on table public.%I from anon, authenticated;', v_t);
      raise notice 'v3_45: % — RLS 활성화 + anon/authenticated 권한 회수 완료', v_t;
    else
      raise notice 'v3_45: % — 테이블 없음, 건너뜀', v_t;
    end if;
  end loop;
end $$;

-- PostgREST 권한/스키마 캐시 즉시 갱신(v1_9/v3_16/v3_36/v3_42와 동일 관례).
notify pgrst, 'reload schema';

-- ── 사후 검증(읽기 전용) — RLS 비활성 또는 anon/authenticated 권한이
-- 하나라도 남아 있으면 즉시 예외를 던진다 ─────────────────────────────
do $$
declare
  v_tables text[] := array[
    'backup_20260809_paul_dedup',
    'backup_20260809_roster_v324',
    'backup_20260809_roster_v325',
    'backup_20260809_roster_v327',
    'backup_20260809_roster_v328',
    'reward_migration_log'
  ];
  v_t text;
  v_rls boolean;
  v_grant_cnt int;
begin
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is null then
      continue;
    end if;

    select relrowsecurity into v_rls
    from pg_class
    where oid = to_regclass('public.' || v_t);

    if v_rls is distinct from true then
      raise exception 'v3_45 검증 실패: % 의 RLS가 활성화되어 있지 않음(relrowsecurity=%)', v_t, v_rls;
    end if;

    select count(*) into v_grant_cnt
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = v_t
      and grantee in ('anon', 'authenticated');

    if v_grant_cnt <> 0 then
      raise exception 'v3_45 검증 실패: % 에 anon/authenticated 권한이 %건 남아 있음', v_t, v_grant_cnt;
    end if;
  end loop;

  raise notice 'v3_45 OK: 백업/로그 6개 테이블(존재하는 것) RLS 활성 + anon/authenticated 권한 0건 확인';
end $$;
