-- v3_31_source_meta 04_verify.sql — 100% SELECT 전용.
-- supabase_v3_31_examples_source_meta.sql(=03) 실행 후 검증.

-- check 1: 컬럼이 생겼는가(jsonb)
select '1: source_meta 컬럼 존재+jsonb' as check_name,
       count(*) = 1 as pass, max(data_type) as data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'examples' and column_name = 'source_meta';

-- check 2: 기존 행 무변경 — 01_precheck check 2의 examples_total과 동일해야 함
select '2: examples 행 수(01과 동일해야 함)' as check_name,
       count(*) as examples_total,
       count(*) filter (where source_meta is not null) as with_meta_rows -- 적용 직후엔 0이 정상
from examples;

-- check 3: 새 컬럼 anon 권한 자동 포함(테이블 단위 GRANT 전제 재확인)
select '3: anon 권한 유지' as check_name,
       bool_or(privilege_type = 'SELECT') as has_select,
       bool_or(privilege_type = 'INSERT') as has_insert
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'examples' and grantee = 'anon';

-- 실행 후 앱 확인: 본문 가져오기에서 예문 1건 저장 → 아래로 provenance 기록 확인
-- select id, target_word, source, source_meta from examples
--  where source = 'import' order by created_at desc limit 5;
