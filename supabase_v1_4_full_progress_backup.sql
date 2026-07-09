-- Paul Easy Voca v1.4 — student_progress 테이블 보장 + 학생 공부 기록
-- (streak/calendar/XP/미션/복습기록) 클라우드 백업 컬럼 추가.
--
-- Supabase 대시보드 SQL Editor에서 통째로 실행해주세요.
--
-- 이전 실행 시 "relation student_progress does not exist" 에러가 났다면,
-- 이 프로젝트에는 아직 student_progress 테이블 자체가 없는 상태입니다
-- (v1.3 스키마가 반영 안 됐거나, 다른 이유로 없는 상태). 이 파일은 그
-- 상태에서도 안전하게 실행되도록:
--   1) student_progress 테이블이 없으면 먼저 만들고(CREATE TABLE IF NOT
--      EXISTS, full_record 컬럼 포함해서 한 번에)
--   2) 이미 테이블이 있던 경우(v1.3까지는 반영됐지만 full_record만 없는
--      경우)를 위해 컬럼 추가를 한 번 더 보장(ADD COLUMN IF NOT EXISTS)
-- 순서로 진행합니다. 전부 IF NOT EXISTS 기반이라 이미 있는 것에는 아무
-- 영향을 주지 않고, 몇 번을 실행해도 안전합니다(멱등).
--
-- 백업 내용: full_record 하나의 JSON 컬럼에 학생의 진행도 전체 —
-- 별(XP), 스티커, 레벨업 미션, 캘린더 히스토리(스트릭 계산의 기반),
-- 오늘의 라운드(복습 큐 포함) — 를 통째로 저장합니다. useStudent.js의
-- record 객체와 정확히 같은 모양이라, 복구 시 그대로 로컬에 되돌려 쓸
-- 수 있습니다.

-- 1) student_progress 테이블 — 없으면 생성 (있으면 이 블록은 아무 일도
--    하지 않음)
create table if not exists student_progress (
  student_id uuid primary key references students(id) on delete cascade,
  total_stars integer not null default 0,      -- XP(누적 별)
  cleared_count integer not null default 0,
  streak integer not null default 0,           -- 연속 완료일 수
  stickers_count integer not null default 0,
  last_studied_date date,
  full_record jsonb,                            -- streak/calendar/XP/미션/복습기록 전체 백업
  updated_at timestamptz not null default now()
);

-- 2) 이미 테이블이 있었던 경우(예: v1.3까지만 반영된 상태)를 위한 안전장치
--    — full_record 컬럼만 없을 수도 있으므로 별도로 한 번 더 보장
alter table student_progress add column if not exists full_record jsonb;

comment on column student_progress.full_record is
  '학생 로컬 진행도 전체 백업(JSON) — streak/calendar/XP/미션/복습기록 등 useStudent.js의 record 객체 전체. 로컬 데이터 유실 시 복구용.';

-- 3) RLS — 이 앱은 로그인 인증 없이 학생 이름/관리자 PIN만으로 동작하는
--    구조라 다른 테이블들과 동일하게 익명(anon) 전체 허용으로 시작합니다.
--    정책이 이미 있어도(재실행 시) 에러 없이 넘어가도록 먼저 지우고 다시 생성.
alter table student_progress enable row level security;
drop policy if exists "allow anon all" on student_progress;
create policy "allow anon all" on student_progress for all using (true) with check (true);
