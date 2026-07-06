-- Paul Easy Voca v1.3 스키마 — 실제 공부방(학생 50명) 운영 관리 기능용.
-- Supabase 대시보드 SQL Editor에서 통째로 실행해주세요. (이 파일은 이전에
-- 준비했던 supabase_v1_1_progress_sync.sql을 대체·확장합니다 — 그 파일은
-- 실행되지 않았으니 이 파일 하나만 실행하면 됩니다.)
--
-- 앱 코드는 anon key만 써서 새 테이블을 직접 만들 수 없어 대시보드에서
-- 실행해주셔야 합니다. 실행 후 알려주시면 이어서 동기화 코드와 관리자
-- 대시보드/숙제 관리/리포트 화면을 구현하겠습니다.

-- 1) 학생별 누적 진행도 (별 총합/클리어 단어 수/스트릭 등 하루 단위가
--    아닌 값들) — 기기 localStorage의 값을 fire-and-forget으로 동기화.
create table if not exists student_progress (
  student_id uuid primary key references students(id) on delete cascade,
  total_stars integer not null default 0,
  cleared_count integer not null default 0,
  streak integer not null default 0,
  stickers_count integer not null default 0,
  last_studied_date date,
  updated_at timestamptz not null default now()
);

-- 2) 학생별 하루 단위 기록 — 관리자 대시보드의 "오늘 공부 여부/숙제 완료
--    여부/최근 7일 기록/퀴즈 정답률/발음 연습 횟수/많이 틀린 단어"를
--    전부 여기서 계산. categories_completed >= 4 를 "숙제 완료"로 취급.
create table if not exists student_daily_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  categories_completed integer not null default 0,
  stars_earned integer not null default 0,
  quiz_correct integer not null default 0,
  quiz_total integer not null default 0,
  pronunciation_attempts integer not null default 0,
  missed_word_ids jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique (student_id, date)
);
create index if not exists idx_student_daily_progress_date on student_daily_progress (date);

-- 3) 반별 날짜별 오늘의 단어 배정 — 비어있으면 기존처럼 유닛 전체 단어를
--    보여주는 폴백을 앱에서 유지할 예정 (기존 동작 안 깨짐).
create table if not exists daily_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  date date not null,
  word_ids jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (class_id, date)
);

-- RLS: 이 앱은 아직 로그인 인증이 없고 학생 이름/관리자 PIN만으로 동작하는
-- 구조라, 익명(anon) 전체 허용으로 시작합니다. 나중에 학생 인증이 생기면
-- 더 좁혀야 합니다 (다른 테이블들도 이미 이 정책입니다).
alter table student_progress enable row level security;
create policy "allow anon all" on student_progress for all using (true) with check (true);

alter table student_daily_progress enable row level security;
create policy "allow anon all" on student_daily_progress for all using (true) with check (true);

alter table daily_assignments enable row level security;
create policy "allow anon all" on daily_assignments for all using (true) with check (true);
