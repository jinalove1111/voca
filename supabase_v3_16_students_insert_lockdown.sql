-- ============================================================================
-- supabase_v3_16_students_insert_lockdown.sql — 학생 계정 생성을 서버
-- (service_role, 관리자 인가) 전용으로 잠근다. 2026-08-06 P0 후속.
-- Supabase SQL Editor에서 1회 실행(멱등 — 여러 번 실행해도 안전).
--
-- ⚠️⚠️⚠️ 실행 순서 경고 ⚠️⚠️⚠️ 반드시 다음이 "코드 배포까지" 먼저 끝난
-- 뒤에 실행하세요:
--   - 클라이언트 자기등록(로그인 화면 "처음이에요" → wordLibrary.addStudent
--     anon insert) 경로 제거.
--   - 대체 경로: api/admin-pin-actions.js의 create_student 액션(관리자
--     인가 + service_role, 이 SQL과 세트로 이번에 추가됨).
-- 순서를 지키지 않고(코드 배포 전에) 이 SQL만 먼저 실행하면, 구버전 로그인
-- 화면의 "처음이에요" 자기등록 버튼이 permission denied(42501)로 실패한다.
-- 앱이 크래시하지는 않는다 — 등록 시도가 에러 안내로 막힐 뿐, 기존 학생의
-- 로그인/학습/조회는 이 SQL과 전혀 무관하게 계속 정상 동작한다(INSERT만
-- 막고 SELECT/UPDATE/DELETE는 손대지 않음).
--
-- ── 배경 ────────────────────────────────────────────────────────────────
-- 학생 생성이 클라이언트 anon insert로만 가능했고 관리자 전용 서버 경로가
-- 없었다 — 그 결과 동명+동일PIN 중복 계정이 실제로 쌓일 수 있었고,
-- api/verify-student-pin.js가 PIN 일치 후보 2개 이상일 때 첫 후보를 임의
-- 로그인시키는 사고로 이어졌다(같은 날 그 파일도 명시 거부로 수정됨).
-- 이 SQL은 그 근본 원인(누구나 언제든 anon key로 계정을 계속 추가 생성할
-- 수 있던 구조)을 막는다.
--
-- ── 무엇을 하는가 ────────────────────────────────────────────────────────
-- students 테이블의 INSERT 권한만 anon/authenticated에서 회수한다. SELECT/
-- UPDATE/DELETE는 전혀 건드리지 않는다(v1_9_security_rls.sql이 이미 SELECT/
-- UPDATE를 컬럼 단위로 제한해 둔 상태 그대로 유지, DELETE도 관리자 학생
-- 삭제 흐름이 계속 쓰므로 그대로 둠). service_role 키(서버리스 함수)는 이
-- 권한 체계 밖이라 영향 없음 — api/admin-pin-actions.js의 create_student가
-- 계속 정상 동작한다.

revoke insert on table public.students from anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- ── UNIQUE 제약을 의도적으로 추가하지 않는 이유 ───────────────────────────
-- v1.6부터 동명이인은 지원 사양이다(이름은 식별자가 아님 — students.id가
-- 유일 식별자, supabase_v1_6_student_identity.sql이 정확히 이 이유로
-- students_name_key UNIQUE 제약을 제거했다). unique(name)이나
-- unique(class_id, name) 같은 제약을 지금 다시 추가하면, 실존하는 정당한
-- 동명이인 학생(다른 반, 같은 반 모두 가능)의 신규 등록을 DB 레벨에서
-- 파괴한다 — 이건 이 마이그레이션의 목적(중복 "사고" 재발 방지)과 무관한
-- 별개의 회귀를 만드는 것이므로 절대 하지 않는다.
--
-- 대신 이번 P0 대응은 아래 네 가지 조합으로 재발을 막는다:
--   (a) 클라이언트 자기등록 경로 제거(코드 배포, 위 실행 순서 참고)
--   (b) 이 SQL의 anon insert 권한 회수(=서버 우회 경로 자체를 차단)
--   (c) api/admin-pin-actions.js create_student의 중복 이름 사전 점검
--       (force:true로 관리자가 명시 승인할 때만 통과)
--   (d) create_student가 클라이언트 생성 UUID를 멱등성 키로 받아 insert —
--       네트워크 재시도/중복 제출이 같은 studentId면 중복 행 대신
--       idempotentReplay로 안전하게 흡수됨
-- ============================================================================

-- ── 읽기 전용 점검 쿼리(주석 아님 — 실행해도 데이터를 전혀 바꾸지 않음) ──
-- 실행 시점 기준 이미 존재하는 중복 이름 그룹을 보여준다(QA_ 테스트 계정
-- 제외). 이 결과가 빈 목록이 아니어도 이 SQL 자체는 그 행들을 하나도
-- 건드리지 않는다 — 순수 조회이며, 발견된 중복은 운영자가 별도로 판단할
-- 사항이다(아래 참고 섹션).
select lower(trim(name)) as normalized_name, count(*) as dup_count
from public.students
where name not ilike 'QA\_%' escape '\'
group by lower(trim(name))
having count(*) > 1
order by dup_count desc;

-- QA_ 접두 테스트 계정 총 개수(참고용 — 이 SQL은 이 행들도 삭제하지 않음).
select count(*) as qa_test_student_count
from public.students
where name ilike 'QA\_%' escape '\';

-- ============================================================================
-- ── 참고(주석 전용 — 실행되는 SQL 아님): QA_ 테스트 계정 정리 ────────────
-- 이 파일을 그대로 실행해도 어떤 행도 삭제되지 않는다. 아래는 운영자가
-- 별도로 정리하기로 결정했을 때만 참고할 절차 안내이며, 이 파일 실행과는
-- 완전히 무관하다.
--
-- QA_ 접두 학생을 지우려면 FK cascade(관련 테이블: student_class_
-- assignments, xp_ledger, word_king_history, sentence_progress 등 학생을
-- 참조하는 모든 테이블)를 먼저 확인하고, on delete cascade가 걸려있지 않은
-- 테이블은 함께 정리해야 한다. 예시(실행 전 반드시 대상 이름 패턴/개수를
-- 위 조회로 다시 확인할 것):
--
--   -- delete from public.students where name ilike 'QA\_%' escape '\';
--
-- 위 줄은 의도적으로 주석 처리돼 있다 — 운영자가 대상을 직접 확인하고
-- 필요할 때만 수동으로 주석을 풀어 실행할 사항이다.
-- ============================================================================

-- ── 실행 후 검증(주석 — SQL Editor에서 수동으로 따로 실행할 것) ─────────
--   set role anon;
--   insert into public.students (name, class_id, unit_name) values ('테스트', null, 'Unit 1');  -- 42501 거부돼야 함
--   reset role;
-- ============================================================================
