-- supabase_v3_31_examples_source_meta.sql
-- ============================================================================
-- examples 출처(provenance) 메타데이터 컬럼 — additive, 멱등 (2026-08-09, 77차)
--
-- 목적: "본문 가져오기"(TextImportPanel)가 저장하는 교과서/학평 본문 예문에
--   본문 몇 번째 문장에서 왔는지 등의 출처 정보를 남긴다.
--   예: { "origin": "textbook_passage", "sentence_index": 3 }
--   학교/학년/출판사/교재/유닛은 기존 FK(textbook_id→grade_id/publisher_id,
--   unit_id)가 이미 담당하므로 여기 중복 저장하지 않는다. AI 생성 예문과
--   본문 원문 예문의 구별은 기존 source CHECK('teacher'/'import'/'rule'/'ai')
--   컬럼이 담당 — 이 컬럼은 그 위에 얹는 세부 출처다.
--
-- 안전성(규칙 9):
--   - add column if not exists — 멱등, 몇 번을 실행해도 무해.
--   - 클라이언트 코드(exampleLibrary.createExample)는 이 컬럼 부재 시 42703을
--     감지해 컬럼 없이 1회 재시도한다 — SQL이 코드보다 먼저든 나중이든 앱이
--     깨지지 않는다. 조회(EXAMPLES_SELECT)에는 의도적으로 미포함(컬럼 부재
--     환경에서 SELECT 전체가 400 나는 것을 방지) — 조회 노출은 이 SQL 실행
--     확인 후 후속 세션에서 추가.
--   - GRANT: v3_13이 examples에 테이블 단위 select/insert/update/delete를
--     이미 부여했으므로 새 컬럼도 자동 포함 — 추가 GRANT 불필요.
--   - 기존 행 데이터 무변경(신규 컬럼 default null).
-- ============================================================================

alter table examples add column if not exists source_meta jsonb;

comment on column examples.source_meta is
  '출처 세부 메타(JSON). 본문 가져오기: {origin:"textbook_passage", sentence_index:int}. source 컬럼(teacher/import/rule/ai)의 보조 — 교재/유닛 자체는 FK가 담당.';

-- 검증(SELECT 전용):
-- select column_name, data_type from information_schema.columns
--  where table_name = 'examples' and column_name = 'source_meta';
