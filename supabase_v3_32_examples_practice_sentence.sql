-- supabase_v3_32_examples_practice_sentence.sql
-- ============================================================================
-- ★ 실행 금지 — 운영자 승인 후 Supabase SQL Editor에서 수동 실행 (2026-08-09)
--
-- examples 학생 연습용 짧은 예문 컬럼 — additive, 멱등.
--   - english_sentence = SOURCE(교과서/본문 원문) — 기존 그대로, 절대 무수정.
--   - practice_sentence = 학생 단어 연습용 짧은 문장(6~10단어 권장, 12단어
--     경고) — 별도 저장. null이면 학생 화면이 원문으로 폴백.
--   학생 기본 화면은 practice 우선, "본문 보기"에서 source 확인(코드 배포됨,
--   curriculumExamplesStudentUI 플래그 뒤).
--
-- 안전성(규칙 9): add column if not exists — 기존 행/원문 무변경(신규 컬럼
-- default null). 클라이언트는 컬럼 부재 시 42703 캐스케이드 폴백으로 저장/
-- 조회 모두 정상(v3_31 source_meta와 동일 패턴 — 실행 순서 무관).
-- GRANT: v3_13 테이블 단위 부여로 자동 포함.
-- ============================================================================

alter table examples add column if not exists practice_sentence text;

comment on column examples.practice_sentence is
  '학생 연습용 짧은 예문(관리자 검수). english_sentence(본문 원문)와 분리 — 원문은 절대 수정하지 않음. null이면 학생 화면이 원문 폴백.';

-- 검증(SELECT 전용):
-- select column_name, data_type from information_schema.columns
--  where table_name = 'examples' and column_name = 'practice_sentence';

-- 롤백: 컬럼 제거는 저장소 정책 금지(checkDestructiveSql 훅) — 값 초기화만:
-- update examples set practice_sentence = null where practice_sentence is not null;
-- (실행 전 SELECT id, practice_sentence 백업 권장. 코드가 null 폴백하므로 무조치도 안전)
