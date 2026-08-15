-- supabase_v3_34_account_status.sql (2026-08-11)
-- 목적: "이 계정이 아카이브/중복/QA인가", "이 계정이 테스트 계정인가"를
-- 지금까지처럼 students.name 문자열 관례(`_DUP`/`_INACTIVE` 접미,
-- `QA_`/`_QA_` 접두, cookie/paul/jinaa/barry 정확 일치)로만 판정하던 것을
-- 명시 컬럼(students.is_test, students.archived)으로 전환한다.
--
-- 왜(사고 배경, 운영자 확정 2026-08-11): 실사용 중인 학생 권교빈의 중복
-- 계정(942e7e12-1fab-4948-a870-6d5dd5f7d36b)이 "_INACTIVE" 이름을 달고
-- 있어 입실시험 분모(관리자 "반 전체 N명" 집계)에서 통째로 빠졌다 — 그
-- 학생의 canonical 계정(6548dd2a-cc01-4b4f-80d9-746d55bf5014) 자체는
-- 정상이었지만, "이름에 _INACTIVE가 들어간 계정만 걸러낸다"는 규칙이
-- 이름이 바뀐 계정 전체를 뭉뚱그려 취급하는 구조라 실사고로 이어졌다.
-- 근본 해결은 `docs/ENTRANCE_EXAM_ELIGIBILITY.md` "4. 아카이브/중복/QA
-- 계정" 절이 이미 "NEEDS APPROVAL(DDL 필요)"로 못박아 둔 항목 — 이 파일이
-- 그 승인 대기 항목을 구현한다.
--
-- 코드 근거(이미 폴백 로직이 준비돼 있음, 이 세션은 SQL만 추가):
-- `src/utils/accountStatus.js`의 isTestAccountStudent()/isArchivedStudent()는
-- `typeof student.is_test === 'boolean'`/`typeof student.archived ===
-- 'boolean'`이면 그 값을 우선하고, 아니면(컬럼이 없거나 아직 select에
-- 포함 안 됐거나) 기존 이름 규칙(entranceEligibility.isArchivedOrFixture
-- StudentName, TEST_ACCOUNT_NAMES = ['cookie','paul','jinaa','barry'])으로
-- 폴백한다 — 이 SQL을 실행하지 않아도, 먼저 실행해도 앱이 깨지지 않는
-- 구조가 코드 쪽에 이미 갖춰져 있다(규칙 9).
--
-- ── 실행 순서 안전성(규칙 9) ──────────────────────────────────────────────
-- 이 SQL 실행 전: accountStatus.js는 두 컬럼이 select에 없으므로 항상
-- undefined를 보고 이름 폴백 경로를 탄다 — 오늘과 동일 동작.
-- 이 SQL 실행 후(코드가 아직 이 컬럼을 select하지 않는 상태라도): 컬럼이
-- 생겨도 기존 select 목록(STUDENTS_SELECT_BASE 등, wordLibrary.js:291)이
-- 명시 컬럼 나열 방식이라 새 컬럼을 자동으로 끌고 오지 않는다 — 즉 이
-- SQL만 실행해서는 아무 화면도 즉시 바뀌지 않는다(안전). 클라이언트가 이
-- 컬럼을 실제로 읽기 시작하는 것은 별도 코드 세션의 몫(이 SQL의 범위 밖).
--
-- ── 컬럼 권한(규칙 10) — 읽기 전용 GRANT만 ────────────────────────────────
-- 2026-08-11 시점 저장소 전수 grep(src/, api/) 기준으로 is_test/archived를
-- **쓰는(UPDATE/INSERT)** 코드 경로가 하나도 없다 — accountStatus.js와
-- 그 호출부(wordLibrary.js, StudentDirectory.jsx)는 전부 읽기만 한다.
-- 그래서 이 SQL은 SELECT만 GRANT한다. 관리자 화면에 "이 계정을 테스트로
-- 표시" 같은 토글 UI가 생기면, 그 구현과 함께 별도 마이그레이션으로
-- `grant update (is_test, archived) on table public.students to anon,
-- authenticated;`를 추가할 것 — 지금 미리 주는 것은 아직 없는 쓰기 경로에
-- 권한만 선(先)부여하는 것이라 최소권한 원칙에 어긋나 하지 않는다.
--
-- ── 백필 규칙(accountStatus.js/entranceEligibility.js의 기존 이름 규칙을
--    그대로 컬럼값으로 옮김 — 새 판정 기준 발명 아님) ──────────────────────
-- archived = true  ← name에 "_dup" 또는 "_inactive"가 포함되거나(대소문자
--                     무시, entranceEligibility.isArchivedOrFixtureStudentName
--                     의 /_dup|_inactive/i와 동일), name이 "qa_" 또는
--                     "_qa_"로 시작(같은 파일의 /^(qa_|_qa_)/i와 동일).
-- is_test  = true  ← trim 후 소문자 비교로 name이 정확히
--                     cookie/paul/jinaa/barry 중 하나(accountStatus.js의
--                     TEST_ACCOUNT_NAMES와 동일).
--
-- ── 무접촉(변경하지 않는 것, 명시) ────────────────────────────────────────
-- students.name은 이 SQL에서 절대 바꾸지 않는다(rename 없음 — 이름은 그대로
-- 두고 컬럼만 추가). class_id/unit_name/current_unit_id/house_id/pin_*
-- 등 다른 어떤 컬럼도 건드리지 않는다. student_progress/student_daily_
-- progress/word_status/student_class_assignments/xp_ledger 등 학생 데이터
-- 테이블은 이 SQL에서 전혀 참조하지 않는다 — 순수 students.is_test/
-- students.archived 두 컬럼의 추가+백필뿐이다.
--
-- ── 멱등성(규칙 9) ────────────────────────────────────────────────────────
-- 컬럼 추가는 조건부(이미 있으면 그대로 둠). 백필 UPDATE 두 건 모두
-- `is distinct from true` 조건이 있어, 이미 true인 행은 재실행 시 건드리지
-- 않는다(0행 처리) — 몇 번을 재실행해도 결과 동일. 이 파일에는 테이블/
-- 컬럼을 지우는 구문, 전체 비우기 구문, WHERE 절 없는 무조건부 행 삭제
-- 구문이 전혀 없다(순수 컬럼 추가 2건 + GRANT 2건 + 조건부 UPDATE 2건뿐).
--
-- ── 실행 주체(규칙 8) ─────────────────────────────────────────────────────
-- students 테이블은 v1.9 이후 컬럼 단위 권한 회수 상태라 anon/에이전트로는
-- 애초에 DDL/GRANT 실행이 불가능하다. Supabase 대시보드 SQL Editor에서
-- 운영자가 postgres/service_role 권한으로 수동 실행한다.
--
-- ── 롤백 ─────────────────────────────────────────────────────────────────
-- 두 컬럼은 이 SQL 이전에 존재하지 않았으므로 "이전 값"은 항상 false다 —
-- 되돌리려면 아래 두 UPDATE만 실행하면 충분하고 별도 백업 테이블이
-- 필요 없다(컬럼 자체는 유지 — 컬럼을 지우는 변경은 제안하지 않는다,
-- 규칙 13/18과 동일 정신으로 파괴적 변경을 이 SQL에 직접 적지 않는다):
--   update public.students set archived = false where archived = true;
--   update public.students set is_test = false where is_test = true;
-- 컬럼 자체를 없애고 싶으면(비권장 — 코드가 여전히 typeof 체크로 폴백하니
-- 굳이 지울 이유가 없음) 운영자가 별도로 SQL Editor에서 직접 판단해 실행.
-- ============================================================================

-- 1) 컬럼 추가 (멱등) — 둘 다 not null default false, 기존 행은 전부 false로
--    시작(아래 4)/5) 백필이 실제 대상만 true로 올림).
alter table public.students
  add column if not exists is_test boolean not null default false;
alter table public.students
  add column if not exists archived boolean not null default false;

-- 2) anon/authenticated GRANT — SELECT만(위 "컬럼 권한" 절 근거, 멱등 —
--    GRANT 중복 실행 무해).
grant select (is_test) on table public.students to anon, authenticated;
grant select (archived) on table public.students to anon, authenticated;

-- 3) 백필 — archived (entranceEligibility.isArchivedOrFixtureStudentName과
--    동일 규칙: '_dup'/'_inactive' 포함, 또는 'qa_'/'_qa_'로 시작. LIKE의
--    '_' 와일드카드와 리터럴 언더스코어를 구분하기 위해 escape '!' 사용
--    — supabase_v3_25_roster_archive_empty_dups.sql의 검증 쿼리와 동일
--    escape 관례 재사용).
update public.students
set archived = true
where archived is distinct from true
  and (
    name ilike '%!_dup%' escape '!'
    or name ilike '%!_inactive%' escape '!'
    or name ilike 'qa!_%' escape '!'
    or name ilike '!_qa!_%' escape '!'
  );

-- 4) 백필 — is_test (accountStatus.js TEST_ACCOUNT_NAMES와 동일: trim 후
--    소문자 정확 일치).
update public.students
set is_test = true
where is_test is distinct from true
  and lower(trim(name)) in ('cookie', 'paul', 'jinaa', 'barry');

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 전체 카운트 요약:
--   select
--     count(*) filter (where archived) as archived_count,
--     count(*) filter (where is_test) as test_count,
--     count(*) as total
--   from public.students;
--
-- ② archived로 표시된 행 목록(리뷰용 — 예상과 다른 이름이 걸렸는지 눈으로
--    확인, 수정/삭제 금지):
--   select id, name from public.students where archived order by name;
--
-- ③ is_test로 표시된 행 목록(cookie/paul/jinaa/barry 각 계정 — 이름이
--    같은 중복 계정이 여러 개면 전부 걸림, 정상):
--   select id, name from public.students where is_test order by name;
--
-- ④ 권교빈 사고 재현 확인 — canonical 계정은 archived가 아니어야:
--   select id, name, archived, is_test from public.students
--   where id = '6548dd2a-cc01-4b4f-80d9-746d55bf5014';
--   -- 기대: archived = false (이름이 "_DUP"/"_INACTIVE"를 포함하지 않는
--   --       canonical 계정이므로)
--
-- ⑤ MS Advanced Class(0249067d-dd64-465d-9c27-fb8737e9f4c4, 舊 "고1 6월
--    학평") 소속 학생 중 실제 집계 대상(비-archived, 비-test) 수 — 참고용
--    근사치. **주의**: 입실시험 분모의 정식 판정 로직은
--    docs/ENTRANCE_EXAM_ELIGIBILITY.md의 3규칙(A/B/C, students.class_id
--    뿐 아니라 student_class_assignments/textbook 소유 반까지 포함)이라
--    아래 쿼리는 "직접 소속(students.class_id)" 기준 근사치일 뿐이고,
--    정확한 분모는 `npm run verify:admin`(testEntranceClassScope.mjs)의
--    라이브 교차 검증으로 확인할 것 — 이 세션은 라이브 DB 접근 권한이
--    없어 기대값(예: 12)을 이 시점에서 실측 확인하지 못했다(정직 기록,
--    추측 금지):
--   select count(*) as ms_advanced_direct_active_students
--   from public.students
--   where class_id = '0249067d-dd64-465d-9c27-fb8737e9f4c4'
--     and archived = false
--     and is_test = false;
--
-- ⑥ anon 권한 확인(실행 후 반드시 reset role):
--   set role anon;
--   select id, is_test, archived from public.students limit 1;  -- 정상(42501 아니어야 함)
--   reset role;
-- ============================================================================
