-- 쓰기 시험(Spelling Test) 기능 — 반별 관리자 설정 컬럼 추가.
-- Supabase 대시보드 SQL Editor에서 실행해주세요.
--
-- 기본값을 전부 "끔/보수적"으로 잡아서, 실행해도 기존 반의 학생 학습
-- 흐름은 전혀 바뀌지 않습니다 — 관리자가 반별로 직접 켜야만 쓰기 시험
-- 모드가 나타납니다 (안정성 우선 원칙).

alter table classes
  add column if not exists spelling_test_enabled boolean not null default false,
  add column if not exists spelling_hint_enabled boolean not null default false,
  add column if not exists wrong_answer_repeat_count integer not null default 3;
