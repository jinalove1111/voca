-- supabase_v3_35_entrance_textbook_backfill.sql (2026-08-11)
-- 목적: "고1 능률 민병천" 교재(textbook_id 09c073dd-a136-4a66-8e39-
-- 44a392f236d8, 소유 컨테이너 class_id ec584e53-1da5-470e-bab0-
-- 238d71cc6042 — supabase_v3_20_neungnyul_container_class.sql 실행 후 실측
-- 확정된 id, handoff.md 2026-08-08(61차) 검증 완료 기록 참고)를 실제로
-- 배우는 12명 중 student_class_assignments(SCA) 행이 없어(또는 canonical
-- 계정이 아닌 중복 계정에만 있어) 입실시험 대상에서 빠지는 학생 4명에게
-- 순수 배정 행만 INSERT한다.
--
-- 배경(운영자 확정): 대상은 원래 3명(황다은/김규민/현다율)이었으나, 사전
-- 분모 계산 결과 4번째 대상(권교빈 canonical 계정)이 추가로 확인됐다 —
-- 아래 "④ 권교빈(Liam) canonical 계정" 절에 별도 근거와 함께 기재.
--
-- 코드 근거 — 행의 모양을 UI가 실제로 만드는 것과 동일하게 맞춤:
-- `src/utils/wordLibrary.js`의 assignTextbook(studentId, classId)
-- (2108~2143행 인근)이 "두 번째 이상 교재 배정"을 만들 때 정확히
--   { student_id, class_id, textbook_id, current_unit_id: null, is_primary: false }
-- 모양으로 INSERT한다(2118~2124행). 이 SQL의 INSERT 4건은 이 모양을 그대로
-- 따른다 — 새 모양을 발명하지 않았다.
-- `src/components/admin/TextbookAssignmentPanel.jsx`(69행)가 실제로 관리자
-- 화면에서 이 함수를 호출할 때 `assignTextbook(studentId, tb.ownerClassId)`
-- 로 교재의 **소유 컨테이너 class_id**(= ec584e53…, 사람이 속한 반이
-- 아니라 교재 컨테이너 반)를 넘긴다 — 이 SQL의 class_id 값도 그와 동일
-- (ec584e53…이지 학생들이 실제로 소속된 사람 반이 아님).
-- is_primary는 반드시 **false**로 고정한다(assignTextbook과 동일) — true로
-- 넣으면 setPrimaryAssignment/setPrimaryTextbook 경로를 거치지 않고 학생의
-- "현재 학습 교재"가 바뀌어 버린다. 대상 4명은 계속 다른 교재를 주 교재로
-- 학습해야 한다(황다은·현다율은 고1 6월 학평, 김규민은 중2 능률 김기택,
-- 권교빈은 canonical 계정이 이미 학습 중인 교재 — 아래 참고).
-- current_unit_id는 null로 고정한다 — assignTextbook 헤더 주석(2098~2102행)
-- 이 명시한 설계 선택("이 반의 첫 유닛으로 자동 지정하지 않는다 — 관리자가
-- setAssignmentUnit으로 명시적으로 진도를 고르게 하기 위함")을 그대로
-- 따른다. 코드가 null을 안전하게 다루는 근거: getStudentClassAssignments
-- (1937행 인근 합성 배정 로직)와 resolveStudentUnitObj(current_unit_id
-- 우선, null이면 반의 첫 유닛/unit_name 폴백)가 이미 null current_unit_id를
-- 정상 처리하는 경로이고, 선례로 김보민(d68a3f24-1e9c-42d9-a1ba-
-- 0ce9389f79d6)의 능률 배정 행이 is_primary=false로 이미 이 모양대로
-- 존재하며 정상 동작 중이다(entranceEligibility.js 17행 주석의 예시로
-- 명시 인용됨).
--
-- ── 절대 하지 않는 것(중요 제약) ────────────────────────────────────────
-- 이 SQL은 순수 INSERT 4행뿐이다. 대상 학생들의 students.class_id/다른
-- 교재 배정/is_primary/progress/stars/word_status/current_unit_id 등
-- 기존 행은 어떤 것도 UPDATE/DELETE하지 않는다 — 이 파일에는 UPDATE/
-- DELETE 구문이 전혀 없다(INSERT 4건 + 검증 SELECT뿐).
--
-- ── 멱등성(규칙 9) ────────────────────────────────────────────────────────
-- 각 INSERT는 `where not exists`로 같은 (student_id, class_id) 또는 같은
-- (student_id, textbook_id) 배정이 이미 있으면 아무 것도 하지 않는다.
-- student_class_assignments에는 두 개의 유니크 제약이 공존한다
-- (supabase_v2_9_student_class_assignments.sql의 unique(student_id,
-- class_id) + supabase_v3_1_textbooks.sql의 부분 유니크 인덱스
-- uq_sca_student_textbook(student_id, textbook_id) where textbook_id is
-- not null) — `on conflict (student_id, class_id) do nothing` 하나만
-- 쓰면 두 번째 제약과 충돌 시 에러가 날 수 있어, 더 안전한 `where not
-- exists` 방식(두 제약을 모두 사전에 확인)을 선택했다.
--
-- ── 실행 순서 안전성(규칙 9) ────────────────────────────────────────────
-- 코드가 이 SQL보다 먼저 배포돼도 안전: assignTextbook/관리자 UI는 이미
-- 존재하는 기능이라 이 SQL 실행 여부와 무관하게 계속 동작한다(이 SQL은
-- 그 기능이 놓친 4개 행을 대신 채우는 것뿐). 이 SQL이 먼저 실행돼도 안전:
-- 신규 INSERT 4행뿐이고 다른 테이블/컬럼은 전혀 건드리지 않는다.
--
-- ── 실행 주체(규칙 8) ─────────────────────────────────────────────────────
-- student_class_assignments는 v1.3 "allow anon all" RLS 정책 테이블이라
-- 이론상 anon 클라이언트도 쓸 수 있지만, 이 저장소 관례상 학생 데이터에
-- 영향을 주는 대량/일괄 배정 SQL은 에이전트가 직접 실행하지 않고 SQL
-- 파일만 준비해 운영자가 Supabase 대시보드 SQL Editor에서 수동 실행한다
-- (규칙 8, 이 저장소의 다른 모든 supabase_v3_*.sql과 동일 관례).
--
-- ── 롤백 ─────────────────────────────────────────────────────────────────
-- 이 SQL이 새로 만드는 행은 4개뿐이고 각 행은 (student_id, class_id,
-- textbook_id)로 고유 식별된다. 되돌리려면 아래처럼 그 3개 값을 모두
-- 조건으로 건 조건부 삭제(WHERE 절 있음, 각 대상 1행만 영향)를 실행한다
-- — 다른 배정 행(예: 학평/김기택 배정, 942e7e12 중복 계정의 기존 배정)은
-- 조건에 안 걸려 전혀 영향받지 않는다:
--   delete from public.student_class_assignments
--   where student_id = 'd05dea68-f019-4202-b494-6a917158ccd4'
--     and class_id = 'ec584e53-1da5-470e-bab0-238d71cc6042'
--     and textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
--     and is_primary = false;
--   -- (김규민 7592fa07…/현다율 e32b8d7d…/권교빈 6548dd2a…도 student_id만
--   --  바꿔 동일하게 반복)
-- ============================================================================

-- ── ① 황다은(Dana, d05dea68-f019-4202-b494-6a917158ccd4) ──
insert into public.student_class_assignments
  (student_id, class_id, textbook_id, current_unit_id, is_primary)
select
  'd05dea68-f019-4202-b494-6a917158ccd4',
  'ec584e53-1da5-470e-bab0-238d71cc6042',
  '09c073dd-a136-4a66-8e39-44a392f236d8',
  null,
  false
where not exists (
  select 1 from public.student_class_assignments
  where student_id = 'd05dea68-f019-4202-b494-6a917158ccd4'
    and (
      class_id = 'ec584e53-1da5-470e-bab0-238d71cc6042'
      or textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
    )
);

-- ── ② 김규민(Richard, 7592fa07-04a0-4597-89ac-31eae0c01299) ──
insert into public.student_class_assignments
  (student_id, class_id, textbook_id, current_unit_id, is_primary)
select
  '7592fa07-04a0-4597-89ac-31eae0c01299',
  'ec584e53-1da5-470e-bab0-238d71cc6042',
  '09c073dd-a136-4a66-8e39-44a392f236d8',
  null,
  false
where not exists (
  select 1 from public.student_class_assignments
  where student_id = '7592fa07-04a0-4597-89ac-31eae0c01299'
    and (
      class_id = 'ec584e53-1da5-470e-bab0-238d71cc6042'
      or textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
    )
);

-- ── ③ 현다율(Essel, e32b8d7d-ef76-4292-ba46-059fb7b9719e) ──
insert into public.student_class_assignments
  (student_id, class_id, textbook_id, current_unit_id, is_primary)
select
  'e32b8d7d-ef76-4292-ba46-059fb7b9719e',
  'ec584e53-1da5-470e-bab0-238d71cc6042',
  '09c073dd-a136-4a66-8e39-44a392f236d8',
  null,
  false
where not exists (
  select 1 from public.student_class_assignments
  where student_id = 'e32b8d7d-ef76-4292-ba46-059fb7b9719e'
    and (
      class_id = 'ec584e53-1da5-470e-bab0-238d71cc6042'
      or textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
    )
);

-- ── ④ 권교빈(Liam) canonical 계정 — 추가 확정 대상(코디네이터 실측 지시,
--      2026-08-11) ──────────────────────────────────────────────────────
-- 권교빈은 실제로 "고1 능률 민병천"을 배우는 12명 중 한 명인데, 능률 교재
-- SCA 배정이 그의 **중복 계정** 942e7e12-1fab-4948-a870-6d5dd5f7d36b
-- ("권교빈_DUP2_f7d36b_INACTIVE")에만 있고, canonical 계정
-- 6548dd2a-cc01-4b4f-80d9-746d55bf5014에는 배정 자체가 없어 분모에서
-- 빠진다.
-- canonical 판정 근거(실측): 6548dd2a 계정은 total_stars 1039, 스티커 30,
-- 입실시험 응시 5건(7/16·7/21·7/23·8/4)으로 학습 이력의 본류다. 반면
-- 942e7e12는 시험 응시 0건이고 8/6·8/11 이틀치(별 159)만 고유하다.
-- 다른 3명과 완전히 동일한 행 모양(is_primary=false, current_unit_id
-- null, class_id/textbook_id 동일)으로 넣는다. **이 INSERT는
-- 942e7e12 계정을 전혀 건드리지 않는다** — 그 계정의 배정/진도/별은
-- 이 파일 어디에서도 UPDATE/DELETE하지 않고 그대로 보존한다(운영자
-- 지시 — 중복 계정 데이터 임의 삭제·합산 금지).
--
-- ⚠ 운영자 주의(반드시 인지): 이 INSERT는 분모(집계)를 바로잡을 뿐,
-- 학생이 실제로 로그인하는 계정을 바꾸지 않는다. 학생이 계속 942e7e12
-- 계정으로 로그인하면 시험 응시 기록은 그 계정에 남아 "대상자엔 있는데
-- 응시자엔 없는" 상태가 된다. 계정 통합(어느 계정으로 로그인할지 확정 +
-- PIN 정리)은 별도 운영자 작업이며 이 마이그레이션의 범위가 아니다.
insert into public.student_class_assignments
  (student_id, class_id, textbook_id, current_unit_id, is_primary)
select
  '6548dd2a-cc01-4b4f-80d9-746d55bf5014',
  'ec584e53-1da5-470e-bab0-238d71cc6042',
  '09c073dd-a136-4a66-8e39-44a392f236d8',
  null,
  false
where not exists (
  select 1 from public.student_class_assignments
  where student_id = '6548dd2a-cc01-4b4f-80d9-746d55bf5014'
    and (
      class_id = 'ec584e53-1da5-470e-bab0-238d71cc6042'
      or textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
    )
);

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 4명 모두 능률 교재 배정을 새로 가졌는지(4행 기대, 전부 is_primary=
--    false, current_unit_id null):
--   select student_id, class_id, textbook_id, current_unit_id, is_primary
--   from public.student_class_assignments
--   where textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
--     and student_id in (
--       'd05dea68-f019-4202-b494-6a917158ccd4',
--       '7592fa07-04a0-4597-89ac-31eae0c01299',
--       'e32b8d7d-ef76-4292-ba46-059fb7b9719e',
--       '6548dd2a-cc01-4b4f-80d9-746d55bf5014'
--     )
--   order by student_id;
--
-- ② 대상 3명(황다은/김규민/현다율)의 다른 컬럼이 전혀 안 바뀌었는지
--    (students 테이블 원본과 대조 — 0행 변화 없어야 정상, 이 쿼리는
--    "이 SQL 실행 전에 기록해 둔 값과 비교"용이므로 실행 전 스냅샷을
--    별도로 떠 둘 것을 권장):
--   select id, name, class_id, current_unit_id from public.students
--   where id in (
--     'd05dea68-f019-4202-b494-6a917158ccd4',
--     '7592fa07-04a0-4597-89ac-31eae0c01299',
--     'e32b8d7d-ef76-4292-ba46-059fb7b9719e',
--     '6548dd2a-cc01-4b4f-80d9-746d55bf5014'
--   );
--
-- ③ 권교빈 중복 계정(942e7e12…)의 기존 배정이 그대로 살아있는지(1행 이상
--    기대, 이 SQL이 그 계정을 전혀 건드리지 않았음을 재확인):
--   select student_id, class_id, textbook_id, is_primary
--   from public.student_class_assignments
--   where student_id = '942e7e12-1fab-4948-a870-6d5dd5f7d36b';
--
-- ④ "고1 능률 민병천" 분모가 정확히 12명이고, 그 12명이 아래 UUID
--    집합과 정확히 일치하는지(0행이어야 정상 — 있으면 안 되는데 있거나,
--    있어야 하는데 없는 학생이 있다는 뜻). is_test=true(Barry/Jinaa)는
--    운영자 QA 목적상 SCA 배정 자체는 유지하되 "실제 학생 분모"에서는
--    제외해야 하므로, supabase_v3_34_account_status.sql(is_test/archived
--    컬럼)이 먼저 적용된 상태를 전제로 한다 — 미적용 상태면 아래 쿼리의
--    `s.is_test`가 컬럼 부재로 에러(42703)나므로, 그 경우
--    supabase_v3_34_account_status.sql을 먼저 실행할 것:
--   with expected(id) as (
--     values
--       ('d05dea68-f019-4202-b494-6a917158ccd4'::uuid), -- 황다은/Dana
--       ('a4666b79-cf9f-4525-94f5-bf6e040bf689'::uuid), -- 박서진/Rogan
--       ('83ebbdb8-efeb-4890-98fe-e300f872d734'::uuid), -- 김태율/Terry
--       ('6548dd2a-cc01-4b4f-80d9-746d55bf5014'::uuid), -- 권교빈/Liam
--       ('2a86fc9b-510a-4db1-a18d-598a360e142b'::uuid), -- 황성연/Colin
--       ('e92ab261-f4cb-422b-850a-3e5e4921df55'::uuid), -- 박건우/Ethan
--       ('16fa6e1c-d5c3-40b4-b55a-b1c18e67e551'::uuid), -- 전하은/Haeun
--       ('6148ad1b-48a4-417f-a5fa-0e7efb343397'::uuid), -- 최은경/Nana
--       ('d68a3f24-1e9c-42d9-a1ba-0ce9389f79d6'::uuid), -- 김보민/Chloe
--       ('7592fa07-04a0-4597-89ac-31eae0c01299'::uuid), -- 김규민/Richard
--       ('1d9d3183-f344-4dbb-8792-d067917cb7b0'::uuid), -- 김가윤/Joy
--       ('e32b8d7d-ef76-4292-ba46-059fb7b9719e'::uuid)  -- 현다율/Essel
--   ),
--   actual as (
--     select distinct s.id from public.students s
--     join public.student_class_assignments sca on sca.student_id = s.id
--     where sca.textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8'
--       and coalesce(s.archived, false) = false
--       and coalesce(s.is_test, false) = false
--   )
--   select
--     (select count(*) from actual) as actual_count, -- 기대: 12
--     (select count(*) from expected e where not exists (select 1 from actual a where a.id = e.id)) as missing_from_actual, -- 기대: 0
--     (select count(*) from actual a where not exists (select 1 from expected e where e.id = a.id)) as unexpected_in_actual; -- 기대: 0
--
-- ⑤ 테스트 계정(Barry/Jinaa)은 위 ④의 12명 분모에는 안 들어가지만, 그들의
--    능률 교재 배정 행 자체는 살아 있어야 한다(운영자 QA 응시 접근 유지
--    요건 — 배정 삭제 금지):
--   select s.id, s.name, s.is_test, sca.class_id, sca.textbook_id, sca.is_primary
--   from public.students s
--   join public.student_class_assignments sca on sca.student_id = s.id
--   where s.id in (
--     '1056c7db-8464-45a4-9f3d-d13223c708b6', -- Barry
--     '738443f3-2676-4b89-9f17-cc7f22aa993c'  -- Jinaa
--   )
--   and sca.textbook_id = '09c073dd-a136-4a66-8e39-44a392f236d8';
--   -- 기대: Barry/Jinaa 각각 배정 행이 그대로 존재(행 수는 이 SQL 실행
--   --       전과 동일 — 이 SQL은 두 계정의 SCA를 전혀 건드리지 않았으므로
--   --       "0건이면 안 됨"만 확인, 정확한 기대 건수는 이 세션에서 실측
--   --       불가라 추측하지 않는다).
-- ============================================================================
