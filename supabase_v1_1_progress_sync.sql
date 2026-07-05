-- v1.1 "관리자 반별 진도 통계" / "숙제 완료 상태 관리" 를 실제로 구현하려면
-- 필요한 테이블 초안입니다. Supabase 대시보드 SQL Editor에서 실행해주세요.
-- (앱 코드는 anon key만 사용해서 새 테이블을 직접 만들 수 없습니다.)
--
-- 실행 후 알려주시면, useStudent.js에 이 테이블로의 fire-and-forget 동기화
-- 코드(실패해도 로컬 진행에는 절대 영향 없음)와 관리자 통계/숙제 화면을
-- 이어서 구현하겠습니다.

create table if not exists student_progress (
  student_id uuid primary key references students(id) on delete cascade,
  total_stars integer not null default 0,
  cleared_count integer not null default 0,
  streak integer not null default 0,
  homework_done_today boolean not null default false,
  last_studied_date date,
  updated_at timestamptz not null default now()
);

-- 학생 자기 자신의 진행도만 쓸 수 있게(참고용 — 실제 앱은 아직 로그인 인증이
-- 없어서 학생 이름 기반이라, RLS는 우선 anon 전체 허용으로 시작해도 무방).
alter table student_progress enable row level security;
create policy "allow anon read" on student_progress for select using (true);
create policy "allow anon upsert" on student_progress for insert with check (true);
create policy "allow anon update" on student_progress for update using (true);
