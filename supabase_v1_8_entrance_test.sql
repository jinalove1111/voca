-- Paul Easy Voca v1.8 — 입실 단어시험(Entrance Word Test) + 반별 랭킹/오늘의 VIP.
--
-- Supabase SQL Editor에 전체를 그대로 붙여넣고 실행하세요.
--
-- 배경(2026-07-16 밤, 자율 작업):
--   수업 시작과 동시에 반 학생들이 각자 폰으로 참여하는 단어시험(종이 시험
--   대체). 교사가 관리자 화면에서 반/문항수/방향(영→한·한→영·랜덤)/제한시간을
--   정해 시험을 시작하면, 학생 홈 화면에 "오늘의 입실시험" 배너가 뜨고,
--   응시 → 자동 채점 → 결과가 즉시 저장된다. 반별 랭킹(공동 순위 허용)과
--   오늘의 VIP는 이 결과에서 계산한다(날짜가 바뀌면 자동으로 리셋 —
--   date 컬럼으로 "오늘" 것만 조회).
--
-- 안전 설계:
--   - create table if not exists — 멱등, 기존 테이블/데이터 전혀 안 건드림.
--   - 이 SQL이 실행되기 전에 앱 코드가 먼저 배포돼도 앱은 절대 깨지지 않음:
--     entranceTestApi.js가 테이블 부재(쿼리 에러)를 감지하면 학생 배너/관리자
--     탭 UI가 자동으로 숨김·"준비 중" 안내로 폴백한다(스키마보다 코드가 먼저
--     나가도 되는 기존 spelling_test_schema.sql과 동일한 원칙).
--   - 기존 학생 데이터(별/스티커/캘린더/학습기록)와 완전히 분리된 순수 추가
--     테이블 — 기존 테이블에는 컬럼 하나 안 건드림.

-- 1) 시험 세션 — 교사가 "시험 시작"을 누를 때 1행 생성.
--    words: 출제 범위 단어 스냅샷 [{ "word": "...", "meaning": "..." }, ...].
--    시험 생성 시점의 단어를 그대로 저장하므로, 같은 반 학생들이 서로 다른
--    유닛에 배정돼 있거나 시험 도중 관리자가 단어를 수정해도 응시자 전원이
--    항상 동일한 문제 풀에서 출제받는다.
create table if not exists entrance_tests (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  date date not null,
  status text not null default 'active',           -- 'active' | 'closed'
  direction text not null default 'en2kr',         -- 'en2kr' | 'kr2en' | 'random'
  question_count integer not null default 10,
  time_limit_seconds integer not null default 120,
  words jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists idx_entrance_tests_class_date on entrance_tests (class_id, date);

-- 2) 학생별 응시 결과 — 학생 식별은 반드시 students.id(UUID) 기준(이름 금지,
--    P0 identity 리팩터링 원칙). 같은 시험에 같은 학생은 1행(재제출은 upsert).
--    missed_words: 틀린 단어 스냅샷 [{ "word": "...", "meaning": "..." }, ...]
--    — 교사 결과 페이지의 "많이 틀린 단어" 집계용.
create table if not exists entrance_test_results (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references entrance_tests(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  score integer not null default 0,
  total integer not null default 0,
  missed_words jsonb not null default '[]',
  duration_seconds integer,
  submitted_at timestamptz not null default now(),
  unique (test_id, student_id)
);
create index if not exists idx_entrance_test_results_test on entrance_test_results (test_id);

-- RLS: 기존 테이블들과 동일한 정책(anon 전체 허용) — 이 앱은 anon key 하나로
-- 동작하는 구조라 테이블별로 좁힐 수단이 아직 없음(supabase_v1_3_schema.sql의
-- 주석과 같은 상황). 나중에 인증 체계가 생기면 함께 좁혀야 함.
alter table entrance_tests enable row level security;
create policy "allow anon all" on entrance_tests for all using (true) with check (true);

alter table entrance_test_results enable row level security;
create policy "allow anon all" on entrance_test_results for all using (true) with check (true);
