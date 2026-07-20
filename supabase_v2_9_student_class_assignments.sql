-- ============================================================================
-- supabase_v2_9_student_class_assignments.sql — 학생 1계정 다중 교재
-- (Multi-Textbook) 동시 배정을 위한 조인 테이블.
-- 2026-07-21. Supabase 대시보드 SQL Editor에서 1회 실행(운영자 수동
-- — CLAUDE.md 규칙 8, 에이전트/CI는 DDL을 직접 실행할 수 없다).
-- 멱등 — 여러 번 실행해도 안전(`create table if not exists` /
-- `create index if not exists` / 백필은 `on conflict do nothing`).
--
-- 근거: docs/agent-decisions/0004-multi-textbook-architecture.md
-- (승인된 설계 기록 — 이 SQL은 그 문서의 "새 테이블 — student_class_
-- assignments" 섹션을 그대로 구현한다. 컬럼/타입/제약을 그 문서와 다르게
-- 바꾸지 말 것 — 바꿔야 하면 먼저 그 문서를 갱신).
--
-- 왜 이 파일명이 v2_9인가: 요청 시점에는 "v2_7"로 지목됐으나, 실측 결과
-- v2_7(supabase_v2_7_house_system.sql)과 v2_8(supabase_v2_8_seasonal_
-- progression.sql)이 이미 이 저장소에 존재해(2026-07-19 작성) 다음 실제
-- 빈 버전 번호는 v2_9다. 파일명 충돌/버전 재사용을 피하기 위해 이 번호로
-- 작성한다.
--
-- ── 이 SQL이 만드는 것 ──────────────────────────────────────────────────
-- student_class_assignments — 학생↔반(=교재 컨테이너, decision 0004 참고)
-- 다대다 배정. 오늘의 "학생 1명 = 반 1개"도 이 테이블에서는 그냥
-- is_primary=true인 행 1개로 표현된다. 두 번째 이상 교재를 배정하려면
-- is_primary=false인 행을 추가로 insert하면 된다(이 SQL은 UI/API를 새로
-- 만들지 않는다 — 순수 스키마 준비).
--
-- ── students.class_id / students.current_unit_id는 그대로 둔다(삭제 없음) ──
-- decision 0004가 명시한 대로 이 두 컬럼은 계속 "권위 있는 필드"로 남고,
-- 이 테이블의 is_primary=true 행은 그 값의 캐시(sync)다. wordLibrary.js/
-- AdminScreen.jsx 등 기존 "학생은 반이 하나"를 전제하는 15개 이상의
-- 호출부는 이 SQL 실행 여부와 무관하게 오늘과 동일하게 계속 동작한다
-- (이 테이블을 아직 아무 코드도 조회하지 않으므로).
--
-- ── RLS 정책: v1.3 "allow anon all" 패턴(v1.9 컬럼단위 제약과 무관) ────────
-- 이 테이블은 students 테이블이 아니라 신규 테이블이므로 v1.9의 컬럼단위
-- GRANT 회수 체제(규칙 10) 대상이 아니다. word_king_history/seasons처럼
-- "보상이 걸린 서버 전용 계산값"도 아니고 student_progress/daily_
-- assignments와 같은 "학생 자기 자신의 배정 상태를 클라이언트가 직접
-- 읽고 쓰는" 일반 데이터라, supabase_v1_3_schema.sql:55,58,61이 확립한
-- 테이블 단위 "allow anon all" 정책을 그대로 재사용한다(decision 0004
-- "마이그레이션 안전성" 섹션이 이 패턴을 명시).
--
-- ── 트리거를 쓰지 않는 이유(신규 학생 자동 배정 행 생성) ───────────────────
-- 이 저장소 전체 SQL 파일을 확인한 결과(전수 grep, `create trigger`/
-- `create or replace function` 매치 0건) 이 스키마는 어디에도 DB 트리거를
-- 쓰지 않는다 — v2.1(current_unit_id)/v2.6(word_king_history)/v2.7
-- (house_id)/v2.8(seasons) 전부 백필은 1회성 SQL UPDATE/INSERT로만 하고,
-- "새 행이 생길 때 자동으로 파생 행을 만드는" 로직은 전부 애플리케이션
-- 계층(addStudent 등 API 코드)에 있다. 이 관례를 그대로 따라 트리거를
-- 새로 발명하지 않는다. 대신: (1) 오늘 당장은 이 테이블을 아직 아무
-- 코드도 조회/삽입하지 않으므로 "신규 학생에게 배정 행이 없다"는 상태가
-- 곧바로 문제가 되지 않고, (2) 실제로 이 테이블을 읽기 시작하는 후속
-- 구현(관리자 교재 배정 UI/학생 조회 API)에서, 학생 생성(addStudent) API가
-- students.class_id INSERT와 같은 흐름 안에서 student_class_assignments의
-- is_primary=true 행도 함께 INSERT하도록 명시적으로 구현할 것을 권고한다
-- (= "행이 없으면 영원히 특수 케이스로 처리해야 하는" 문제를, DB 트리거
-- 대신 애플리케이션 코드가 학생 생성 시점에 두 테이블을 함께 쓰는 방식으로
-- 해소). 이 SQL 자체는 스키마 준비만 하므로 addStudent 코드 변경은
-- 포함하지 않는다(범위 밖 — 후속 구현 세션).
--
-- ── 실행 순서 안전성(CLAUDE.md 규칙 9) ────────────────────────────────────
-- 코드가 이 SQL보다 먼저 배포돼도 안전: 오늘은 이 테이블을 참조하는 코드가
-- 전혀 없다(순수 스키마 준비, 이번 세션은 코드 변경 0건). 이 SQL이 먼저
-- 실행돼도 안전: students/classes/units 세 테이블 중 어떤 컬럼도 이
-- 마이그레이션이 변경하지 않는다(추가/삭제/타입변경 전부 없음) — 순수
-- 추가 테이블이라 기존 로그인/학습/퀴즈/동기화 플로우에 영향 0.
--
-- ── 롤백(원상 복구) ─────────────────────────────────────────────────────
-- 이 테이블은 순수 추가(additive)이며 students.class_id/current_unit_id가
-- 계속 권위 있는 필드로 남아있으므로, 이 테이블 자체를 완전히 제거해도
-- 기존 단일 교재 학생 294명(2026-07-21 라이브 실측)의 로그인/학습/진도
-- 플로우는 전혀 영향받지 않는다(non-destructive to existing single-class
-- functionality — 확인됨).
-- 정확한 제거 명령 문구는 이 저장소의 PreToolUse 훅
-- (scripts/hooks/checkDestructiveSql.mjs)이 *.sql 파일 안에 파괴적 DDL
-- 리터럴(테이블 삭제 키워드 등)이 그대로 적히는 것 자체를 자동 차단하므로
-- 이 파일 안에는 직접 적지 않는다(훅을 우회하지 않기 위함 — CLAUDE.md
-- 규칙 18). 정확한 구문은 이 마이그레이션을 준비한 세션의 최종 보고와
-- handoff.md에 텍스트로 남겨두었으니 그것을 참고해 운영자가 SQL Editor
-- 콘솔에 직접 타이핑해 실행할 것(= "if exists" 옵션을 붙인 표준 테이블
-- 제거 DDL 한 줄, 대상은 public.student_class_assignments).
-- ============================================================================

-- 1) 테이블 (멱등).
create table if not exists public.student_class_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  current_unit_id uuid references public.units(id) on delete set null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (student_id, class_id)
);

-- 2) 인덱스 (멱등) — student_id/class_id 각 방향 조회 성능용
--    (v2_1의 idx_students_current_unit_id, v2_6의 idx_word_king_history_
--    class_period와 동일하게 "역조회가 잦은 FK 컬럼에 인덱스" 관례 재사용).
create index if not exists idx_student_class_assignments_student_id
  on public.student_class_assignments (student_id);
create index if not exists idx_student_class_assignments_class_id
  on public.student_class_assignments (class_id);

-- 3) RLS — v1.3 "allow anon all" 패턴 재사용
--    (supabase_v1_3_schema.sql:55,58,61 — 이 저장소 기존 게임화/진행도류
--    테이블의 표준 정책, decision 0004가 명시적으로 이 패턴을 지목).
alter table public.student_class_assignments enable row level security;
drop policy if exists "allow anon all" on public.student_class_assignments;
create policy "allow anon all" on public.student_class_assignments
  for all using (true) with check (true);

-- 4) 백필 — 기존 학생의 현재 class_id/current_unit_id를 is_primary=true
--    행 1개로 그대로 복제. `on conflict do nothing`으로 재실행 안전(멱등)
--    — 이미 배정 행이 있는 학생(재실행 또는 후속 세션에서 관리자가 이미
--    두 번째 교재를 배정한 학생)의 기존 행을 절대 덮어쓰지 않는다.
insert into public.student_class_assignments
  (student_id, class_id, current_unit_id, is_primary)
select id, class_id, current_unit_id, true
from public.students
where class_id is not null
on conflict (student_id, class_id) do nothing;

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 테이블 생성 + 백필 건수 확인 — 2026-07-21 라이브 실측 기준
--    students.class_id가 not null인 학생이 294명이었으므로, 아래는 294
--    (± 실행 시점까지 늘어난 신규 학생 수)에 근접해야 정상:
--   select count(*) from public.student_class_assignments;
--
-- ② 백필된 값이 students 원본과 정확히 일치하는지(0행이어야 정상):
--   select s.id, s.name, s.class_id, sca.class_id as backfilled_class_id
--   from public.students s
--   join public.student_class_assignments sca
--     on sca.student_id = s.id and sca.is_primary = true
--   where sca.class_id is distinct from s.class_id
--      or sca.current_unit_id is distinct from s.current_unit_id;
--
-- ③ class_id가 null인 학생(= 아직 반 배정이 없는 학생)은 백필 대상에서
--    제외되므로 배정 행이 0개인 게 정상 — 목록 확인:
--   select id, name from public.students where class_id is null;
--
-- ④ 학생당 is_primary=true 행이 정확히 1개인지(0행이어야 정상 — 2개 이상
--    이면 "주 교재가 둘"이라는 모순 상태):
--   select student_id, count(*) from public.student_class_assignments
--   where is_primary = true group by student_id having count(*) <> 1;
--
-- ⑤ anon 권한 확인(실행 후 반드시 reset role):
--   set role anon;
--   select * from public.student_class_assignments limit 1;  -- 정상(빈/행 OK, 42501 아니어야 함)
--   reset role;
--
-- 이번 라운드는 스키마 준비까지만 — 이 SQL이 아직 실행 전이라 라이브 e2e는
-- 만들지 않는다(Word King/House/Seasons가 쓴 "SQL 미실행 시 안전 SKIP"
-- 패턴을 새로 또 추가하기보다, 운영자가 이 SQL을 실제로 실행한 뒤 다음
-- 구현 세션에서 addStudent API 연동 + 라이브 e2e를 추가하는 편이 더 정확).
-- ============================================================================
