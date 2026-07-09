-- Paul Easy Voca v1.5 — 단어별 "알아요/모르겠어요" 상태 저장 (Skip 기능).
--
-- Supabase SQL Editor에 전체를 그대로 붙여넣고 실행하세요.
--
-- 안전 설계:
--   - CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS — 이미 있는 건
--     절대 안 건드림, 여러 번 실행해도 안전(멱등).
--   - students / words / classes 등 기존 테이블은 읽기만 함(student_id,
--     word_id 컬럼 타입을 실제 students.id / words.id 타입에 맞추기 위해).
--   - 기존 progress_data(v1.4)와는 완전히 별개 테이블 — 기존 저장 기능에
--     전혀 영향 없음.

do $$
declare
  student_id_type text;
  word_id_type text;
begin
  select data_type into student_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'students' and column_name = 'id';
  select data_type into word_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'words' and column_name = 'id';

  if student_id_type is null or word_id_type is null then
    raise exception 'students 또는 words 테이블/id 컬럼을 찾을 수 없습니다 — 올바른 Supabase 프로젝트에서 실행 중인지 먼저 확인해주세요.';
  end if;

  raise notice 'student_id 타입: %, word_id 타입: %', student_id_type, word_id_type;

  execute format($f$
    create table if not exists word_status (
      id uuid default gen_random_uuid() primary key,
      student_id %s references students(id) on delete cascade,
      word_id %s references words(id) on delete cascade,
      status text not null default 'unknown' check (status in ('known', 'unknown', 'skipped', 'mastered')),
      last_seen_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (student_id, word_id)
    )
  $f$, student_id_type, word_id_type);
end $$;

-- 이미 테이블이 있던 경우(컬럼 일부만 없는 경우) 대비한 보강.
alter table word_status add column if not exists status text not null default 'unknown';
alter table word_status add column if not exists last_seen_at timestamptz not null default now();
alter table word_status add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'word_status_status_check') then
    alter table word_status add constraint word_status_status_check
      check (status in ('known', 'unknown', 'skipped', 'mastered'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'word_status_student_word_key') then
    alter table word_status add constraint word_status_student_word_key unique (student_id, word_id);
  end if;
end $$;

comment on table word_status is
  '학생별 단어 숙지 상태 — "알아요"(known)/"모르겠어요"(unknown) 버튼. 로컬스토리지의 record.wordStatus와 미러링되며, 관리자 대시보드의 아는/모르는/복습 필요 단어 수 집계에 쓰임.';

create index if not exists idx_word_status_student on word_status (student_id);
create index if not exists idx_word_status_status on word_status (status);

alter table word_status enable row level security;
drop policy if exists "allow anon all" on word_status;
create policy "allow anon all" on word_status for all using (true) with check (true);
