-- ============================================================================
-- supabase_v3_45_lockdown_backup_tables_VERIFY.sql — v3_45 실행 전/후 공통
-- 사용 검증 스크립트. 2026-09-02 신설.
--
-- SELECT 전용 — 어떤 쓰기(INSERT/UPDATE/DELETE/DDL)도 하지 않는다. v3_45
-- 실행 전에 한 번, 실행 후에 한 번, 같은 쿼리들을 그대로 다시 돌려서
-- 상태 변화를 비교한다. 이 파일은 supabase_v3_45_lockdown_backup_tables.sql
-- 본문과 완전히 분리된 별개 파일이며, v3_45 본문은 이 VERIFY 없이도
-- 완결된다.
--
-- 사용법: Supabase 대시보드 SQL Editor에서 이 파일 전체를 붙여넣고 실행.
-- 각 쿼리 위 주석에 "기대값"이 적혀 있다 — 실행 전/후 값이 기대와 다르면
-- v3_45를 재검토할 것.
-- ============================================================================

-- ① RLS 활성 여부 + 강제(force) 여부 + 존재 여부.
--    기대값: 실행 전 relrowsecurity=false(테이블이 존재하는 경우) /
--            실행 후 relrowsecurity=true / relforcerowsecurity는
--            실행 전후 항상 false(행 단위 보안을 소유자에게까지 강제
--            적용하는 옵션을 쓰지 않으므로).
--    reward_migration_log는 실행 전에도 이미 relrowsecurity=true(2026-09-02 실측) —
--    나머지 5개(백업 테이블)만 false→true로 바뀐다.
select
  t.tbl as table_name,
  (to_regclass('public.' || t.tbl) is not null) as table_exists,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from (values
  ('backup_20260809_paul_dedup'),
  ('backup_20260809_roster_v324'),
  ('backup_20260809_roster_v325'),
  ('backup_20260809_roster_v327'),
  ('backup_20260809_roster_v328'),
  ('reward_migration_log')
) as t(tbl)
left join pg_class c on c.oid = to_regclass('public.' || t.tbl)
order by t.tbl;

-- ② anon/authenticated/service_role 권한 목록.
--    기대값: 실행 전 — anon, authenticated 각각에 SELECT/INSERT/UPDATE/
--    DELETE/TRUNCATE/REFERENCES/TRIGGER 등 다수 privilege_type 존재.
--    실행 후 — anon, authenticated 는 0행(권한 전부 회수). service_role은
--    실행 전후 변화 없어야 함(GRANT 체계 밖, BYPASSRLS이므로 원래도 이
--    목록에 나타나지 않거나 무관).
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'backup_20260809_paul_dedup',
    'backup_20260809_roster_v324',
    'backup_20260809_roster_v325',
    'backup_20260809_roster_v327',
    'backup_20260809_roster_v328',
    'reward_migration_log'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- ③ 정책(pg_policies) 목록.
--    기대값: 실행 전/후 모두 0행 — v3_45는 정책을 하나도 만들지 않는다
--    (default deny, GRANT 자체를 회수하는 방식).
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'backup_20260809_paul_dedup',
    'backup_20260809_roster_v324',
    'backup_20260809_roster_v325',
    'backup_20260809_roster_v327',
    'backup_20260809_roster_v328',
    'reward_migration_log'
  )
order by tablename, policyname;

-- ④ 행 수(데이터 무접촉 증명).
--    기대값: 실행 전/후 동일해야 함 — backup_20260809_paul_dedup=3,
--    backup_20260809_roster_v324=17, backup_20260809_roster_v325=33,
--    backup_20260809_roster_v327=87, backup_20260809_roster_v328=6,
--    reward_migration_log=1 (v3_37 완료 마커 1행, 실행 전/후 불변, 2026-09-02
--    실측 기준값). 이 쿼리는 6개 테이블이
--    모두 존재한다고 가정한다(2026-09-02 실측 시점 기준 전부 존재) — FROM
--    절의 테이블명은 Postgres가 실행 전에 정적으로 해석하므로, WHERE의
--    to_regclass만으로는 실제로 존재하지 않는 테이블을 조용히 건너뛸 수
--    없다(그런 경우 "relation does not exist" 오류가 난다). 실행 전 위 ①
--    쿼리로 6개 테이블의 존재 여부를 먼저 확인해 둘 것 — 그 사이 테이블이
--    삭제(drop)됐다면 이 쿼리에서 그 테이블 이름의 union all 절만 제거하고
--    재실행할 것.
select 'backup_20260809_paul_dedup' as table_name, count(*) as row_count
  from public.backup_20260809_paul_dedup
union all
select 'backup_20260809_roster_v324', count(*)
  from public.backup_20260809_roster_v324
union all
select 'backup_20260809_roster_v325', count(*)
  from public.backup_20260809_roster_v325
union all
select 'backup_20260809_roster_v327', count(*)
  from public.backup_20260809_roster_v327
union all
select 'backup_20260809_roster_v328', count(*)
  from public.backup_20260809_roster_v328
union all
select 'reward_migration_log', count(*)
  from public.reward_migration_log;

-- ============================================================================
-- 앱 쪽 실측(참고용, 이 SQL 파일이 실행하지는 않음 — 별도로 curl 등으로
-- 확인할 것): anon key로
--   HEAD /rest/v1/backup_20260809_roster_v324?select=*&limit=1
-- 을 호출하면 v3_45 실행 전에는 206(Partial Content, 정상 조회)이 오고,
-- 실행 후에는 401 또는 42501(permission denied, RLS/GRANT 차단)이 와야
-- 정상이다. reward_migration_log는 실행 전 200/0행(RLS 필터) → 실행 후
-- 401/42501(GRANT 회수)로 바뀐다.
-- ============================================================================
