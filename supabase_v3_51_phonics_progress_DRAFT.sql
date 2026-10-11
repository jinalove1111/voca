-- ============================================================================
-- supabase_v3_51_phonics_progress_DRAFT.sql
-- DRAFT — 실행 금지. 운영자 승인·검토 전.
--
-- PAUL PHONICS 학습 발달 기록 테이블 초안 (257차, 2026-10-11).
-- 이 파일은 아무도 실행하지 않았고, 앱 코드(src/, api/)는 이 파일도, 아래 두
-- 테이블도 읽거나 쓰지 않는다. 클라이언트는 테이블이 없어도 지금과 똑같이
-- 동작한다(학습 발달 화면은 가상의 샘플 데이터만 보여 준다). 설계 배경:
-- docs/design/PHONICS_PROGRESS_2026-10-11.md
--
-- 실행 전제(운영자 승인 후): Supabase 대시보드 SQL Editor에서 수동 실행(CLAUDE.md
-- 규칙 8). 승인 시 이 파일 이름에서 _DRAFT를 떼고 검토 결과를 반영한다.
--
-- ── 설계 원칙 ───────────────────────────────────────────────────────────
-- 1) 학생 식별은 students.id(UUID)만 쓴다(규칙 4). 이름 컬럼 없음.
-- 2) 음성 파일·녹음은 저장하지 않는다 — 정답 여부와 횟수만 저장한다.
-- 3) 멱등: create table if not exists / create index if not exists. 여러 번
--    실행해도 안전하고, 코드보다 먼저든 나중이든 실행 순서에 앱이 깨지지
--    않는다(규칙 9 — 아무 코드도 이 테이블을 참조하지 않으므로).
-- 4) RLS를 켜고 anon/authenticated 정책을 만들지 않는다 → 브라우저의 anon 키로는
--    읽기·쓰기가 모두 막힌다. 접근은 서버 경로(api/*.js 또는 service_role 전용
--    RPC)만 한다. service_role은 RLS를 우회한다.
-- 5) GRANT: 이 두 테이블은 students 테이블이 아니므로 규칙 10(students 신규
--    컬럼 GRANT)의 대상이 아니다. 대신 DATABASE.md의 "RLS / 컬럼 권한" 방식을
--    따라 anon·authenticated의 모든 권한을 명시적으로 회수하고(revoke all),
--    service_role에만 필요한 권한을 준다. students.pin_* 컬럼과 무관하다(규칙 11).
-- ============================================================================

begin;

create table if not exists public.phonics_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  book_id text not null,
  unit_id text not null,
  game_id text not null,
  step text,
  item_id text not null,
  target_phonemes text[] not null default '{}',
  correct boolean not null,
  retries integer not null default 0 check (retries >= 0),
  completed boolean not null default true,
  -- 오프라인 재전송 중복 방지용 클라이언트 키(학생당 유일). 초안 제안 — 승인 시 확정.
  client_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.phonics_unit_tests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  book_id text not null,
  unit_id text not null,
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  client_key text,
  created_at timestamptz not null default now(),
  check (score <= total)
);

create index if not exists phonics_attempts_student_created_idx on public.phonics_attempts (student_id, created_at desc);
create index if not exists phonics_attempts_student_unit_idx on public.phonics_attempts (student_id, book_id, unit_id);
create unique index if not exists phonics_attempts_client_key_uidx on public.phonics_attempts (student_id, client_key) where client_key is not null;
create index if not exists phonics_unit_tests_student_created_idx on public.phonics_unit_tests (student_id, created_at desc);
create unique index if not exists phonics_unit_tests_client_key_uidx on public.phonics_unit_tests (student_id, client_key) where client_key is not null;

-- RLS: 켜기만 하고 정책은 만들지 않는다(= anon/authenticated 전부 거부).
alter table public.phonics_attempts enable row level security;
alter table public.phonics_unit_tests enable row level security;

revoke all on public.phonics_attempts from anon, authenticated;
revoke all on public.phonics_unit_tests from anon, authenticated;
grant select, insert on public.phonics_attempts to service_role;
grant select, insert on public.phonics_unit_tests to service_role;

commit;

-- ── 검증 쿼리 (실행 후 운영자가 SQL Editor에서 확인; 아래는 주석이라 실행되지 않음) ──
-- select count(*) from public.phonics_attempts;            -- 기대: 0 (이 마이그레이션은 행을 넣지 않는다)
-- select count(*) from public.phonics_unit_tests;          -- 기대: 0
-- select relname, relrowsecurity from pg_class
--   where relname in ('phonics_attempts', 'phonics_unit_tests');   -- 기대: 둘 다 relrowsecurity = true
-- select tablename, policyname from pg_policies
--   where tablename in ('phonics_attempts', 'phonics_unit_tests');  -- 기대: 0행 (anon 정책 없음)
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name in ('phonics_attempts', 'phonics_unit_tests')
--   order by table_name, grantee;                          -- 기대: service_role만 select/insert
