-- v3.45 ROLLBACK — 백업/마이그레이션 로그 6개 테이블 RLS 비활성화 +
-- anon/authenticated 권한 재부여 (2026-09-02)
--
-- supabase_v3_45_lockdown_backup_tables.sql이 잠근 6개 테이블
-- (backup_20260809_paul_dedup, backup_20260809_roster_v324,
-- backup_20260809_roster_v325, backup_20260809_roster_v327,
-- backup_20260809_roster_v328, reward_migration_log)만 정확히 원상태로
-- 되돌린다. 그 외 무접촉: 데이터 0 / 다른 테이블 0 / service_role·postgres
-- 권한 0.
--
-- ⚠️ 이 롤백은 Supabase Security Advisor 경고
-- (`rls_disabled_in_public`)가 다시 발생하는 원래의 취약한 원상태
-- (RLS 비활성 + anon/authenticated에 조회/입력/수정/삭제 등
-- 테이블 권한 전체 개방)로 되돌리는 것이다. 앱은 이 6개 테이블을 전혀
-- 참조하지 않으므로(2026-09-02 src/·api/·supabase/functions/ 전수 grep
-- 0건) "앱이 깨져서" 롤백할 이유는 정상적으로는 없다 — 예상치 못한
-- 외부 도구/운영 스크립트가 anon 경유로 이 백업 테이블을 읽는 것이
-- 확인된 경우에만, 그 도구를 service_role로 옮길 때까지의 임시 조치로만
-- 사용할 것.
--
-- 실행: Supabase 대시보드 SQL Editor에 전문 붙여넣기 (CLAUDE.md 규칙 8).

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
      execute format('alter table public.%I disable row level security;', v_t);
      execute format('grant select, insert, update, delete on table public.%I to anon, authenticated;', v_t);
      raise notice 'v3_45 ROLLBACK: % — RLS 비활성화 + anon/authenticated 권한 재부여 완료', v_t;
    else
      raise notice 'v3_45 ROLLBACK: % — 테이블 없음, 건너뜀', v_t;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ── 사후 검증(읽기 전용) — anon/authenticated 권한이 재부여되지 않은
-- 테이블이 있으면 즉시 예외를 던진다 ────────────────────────────────────
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
  v_grant_cnt int;
begin
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is null then
      continue;
    end if;

    select count(distinct privilege_type) into v_grant_cnt
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = v_t
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');

    if v_grant_cnt <> 4 then
      raise exception 'v3_45 롤백 검증 실패: % 의 anon/authenticated 조회/입력/수정/삭제 권한이 %종류만 확인됨(기대 4)', v_t, v_grant_cnt;
    end if;
  end loop;

  raise notice 'v3_45 ROLLBACK OK — 백업/로그 6개 테이블(존재하는 것) RLS 비활성 + anon/authenticated 권한 재부여 확인(v3_45 이전 상태)';
end $$;
