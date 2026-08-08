-- v3_31_source_meta 01_precheck.sql — 100% SELECT 전용 (2026-08-09 야간 2차)
-- supabase_v3_31_examples_source_meta.sql(=03 역할) 실행 전 상태 확인.

-- check 1: source_meta 컬럼이 아직 없는가(있으면 이미 적용됨 — 03은 add
--   column if not exists라 재실행해도 무해하지만, 상태 인지용)
select '1: source_meta 컬럼 부재(미적용 상태)' as check_name,
       count(*) = 0 as not_applied_yet, count(*) as existing_columns
from information_schema.columns
where table_schema = 'public' and table_name = 'examples' and column_name = 'source_meta';

-- check 2: examples 테이블 현황(적용 전 기준값 — additive라 행 수 불변이어야 함)
select '2: examples 행 수(기준값)' as check_name,
       count(*) as examples_total,
       count(*) filter (where source = 'import') as import_rows,
       count(*) filter (where source = 'teacher') as teacher_rows
from examples;

-- check 3: 테이블 단위 GRANT가 이미 있는가(새 컬럼 자동 포함 전제 확인)
select '3: examples 테이블 anon 권한(신규 컬럼 자동 포함 전제)' as check_name,
       bool_or(privilege_type = 'SELECT') as has_select,
       bool_or(privilege_type = 'INSERT') as has_insert,
       bool_or(privilege_type = 'UPDATE') as has_update
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'examples' and grantee = 'anon';
