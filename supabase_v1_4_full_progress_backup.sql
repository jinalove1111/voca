-- Paul Easy Voca v1.4 — student_progress 테이블 생성/보강.
-- 학생 공부 기록(streak/calendar/XP/미션/복습기록) 클라우드 백업용.
--
-- Supabase SQL Editor에 전체를 그대로 붙여넣고 실행하세요.
--
-- 안전 설계:
--   - 전부 IF NOT EXISTS 기반 — 이미 있는 건 절대 건드리지 않음(여러 번
--     실행해도 안전, 멱등).
--   - students / words / classes 등 기존 테이블은 전혀 손대지 않고 읽기만
--     함(students.id의 실제 타입을 확인하기 위해서만 조회).
--   - student_id 컬럼 타입은 students.id의 실제 타입을 조회해서 자동으로
--     맞춤 — uuid가 아닌 경우에도 안전하게 대응.
--   - v1.3 관리자 대시보드(AdminScreen.jsx)가 이미 읽고 있는 컬럼
--     (total_stars/stickers_count/cleared_count/streak)도 새 컬럼과
--     함께 그대로 유지 — 이번 백업 기능 추가로 기존 관리자 화면이
--     깨지지 않게 함.

do $$
declare
  id_type text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'students' and column_name = 'id';

  if id_type is null then
    raise exception 'students 테이블 또는 id 컬럼을 찾을 수 없습니다 — 지금 SQL Editor에서 보고 있는 프로젝트가 이 앱이 실제로 쓰는 Supabase 프로젝트가 맞는지 먼저 확인해주세요.';
  end if;

  raise notice 'students.id 타입 확인됨: %, 이 타입으로 student_progress.student_id를 생성합니다.', id_type;

  execute format($f$
    create table if not exists student_progress (
      id uuid default gen_random_uuid() primary key,
      student_id %s references students(id) on delete cascade,
      -- v1.3부터 있던 컬럼 — 관리자 대시보드(AdminScreen.jsx)가 이미
      -- 이 이름으로 읽고 있어서 그대로 유지
      total_stars integer default 0,
      cleared_count integer default 0,
      streak integer default 0,
      stickers_count integer default 0,
      last_studied_date date,
      -- v1.4 신규 — streak/calendar/XP/미션/복습기록 클라우드 백업
      progress_data jsonb default '{}'::jsonb,
      streak_count integer default 0,
      total_xp integer default 0,
      calendar_data jsonb default '{}'::jsonb,
      mission_data jsonb default '{}'::jsonb,
      review_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )
  $f$, id_type);
end $$;

-- 혹시 테이블은 이전에 이미 만들어졌지만(v1.3까지만 반영됐거나, 위 컬럼
-- 중 일부만 없는 경우) 대비한 보강 — 전부 IF NOT EXISTS라 안전, 이미
-- 있는 컬럼/값은 절대 건드리지 않음.
alter table student_progress add column if not exists total_stars integer default 0;
alter table student_progress add column if not exists cleared_count integer default 0;
alter table student_progress add column if not exists streak integer default 0;
alter table student_progress add column if not exists stickers_count integer default 0;
alter table student_progress add column if not exists last_studied_date date;
alter table student_progress add column if not exists progress_data jsonb default '{}'::jsonb;
alter table student_progress add column if not exists streak_count integer default 0;
alter table student_progress add column if not exists total_xp integer default 0;
alter table student_progress add column if not exists calendar_data jsonb default '{}'::jsonb;
alter table student_progress add column if not exists mission_data jsonb default '{}'::jsonb;
alter table student_progress add column if not exists review_data jsonb default '{}'::jsonb;
alter table student_progress add column if not exists updated_at timestamptz default now();

comment on column student_progress.progress_data is
  '학생 진행도 전체 백업(JSON) — useStudent.js의 record 객체 전체(별/스티커/일기/미션/캘린더/오늘 라운드 포함). 로컬 데이터 유실 시 이 컬럼 하나로 완전 복구 가능.';
comment on column student_progress.streak_count is '연속 학습일 수 — progress_data와 별도로 빠른 조회/정렬용.';
comment on column student_progress.total_xp is '누적 별(XP) — progress_data와 별도로 빠른 조회/정렬용.';
comment on column student_progress.calendar_data is '날짜별 학습 히스토리(캘린더) — progress_data.history와 동일 데이터의 조회 편의용 사본.';
comment on column student_progress.mission_data is '레벨업 미션 진행 상태 — progress_data.missions와 동일 데이터의 조회 편의용 사본.';
comment on column student_progress.review_data is '복습(오답노트) 큐 — progress_data.round.spellingWrongToday와 동일 데이터의 조회 편의용 사본.';

-- 학생당 백업 행이 하나만 유지되도록(sync가 upsert로 계속 같은 행을
-- 갱신) — 이 제약이 없으면 sync할 때마다 새 행이 쌓여서 테이블이
-- 무한정 커지고, 복구 조회 시 "행이 여러 개"라 어떤 걸 써야 할지 알 수
-- 없게 됨. 이미 있으면(예: 테이블이 student_id를 primary key로 만들어져
-- 있던 경우) 건드리지 않음.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_progress_student_id_key'
  ) and not exists (
    -- student_id가 이미 primary key거나 다른 이름의 unique 제약을 갖고
    -- 있으면(예: v1.3 원본처럼 student_id 자체가 PK인 테이블) 중복 제약을
    -- 또 만들지 않음
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
    where tc.table_name = 'student_progress'
      and kcu.column_name = 'student_id'
      and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
  ) then
    alter table student_progress add constraint student_progress_student_id_key unique (student_id);
  end if;
end $$;

create index if not exists idx_student_progress_student_id on student_progress (student_id);

-- RLS — 이 앱은 로그인 인증 없이 학생 이름/관리자 PIN만으로 동작하는
-- 구조라 다른 테이블들과 동일하게 익명(anon) 전체 허용으로 시작합니다.
-- 정책이 이미 있어도(재실행 시) 에러 없이 넘어가도록 먼저 지우고 다시 생성.
alter table student_progress enable row level security;
drop policy if exists "allow anon all" on student_progress;
create policy "allow anon all" on student_progress for all using (true) with check (true);
