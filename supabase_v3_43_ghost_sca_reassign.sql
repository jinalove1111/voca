-- supabase_v3_43_ghost_sca_reassign.sql
--
-- 목적:
--   Phase 2(Phase 1 = v3_40)의 후속. 1단어짜리 "유령" 유닛 7개(_ghost)를
--   가리키고 있는 student_class_assignments.current_unit_id / students.current_unit_id
--   참조를 전부 정리한다(재배정). 유닛/단어 삭제는 이 파일이 아니라
--   후속 파일 v3_44_ghost_units_delete.sql 이 담당한다(이 파일은 삭제를
--   하지 않는다).
--
-- 분리 사실 및 실행 순서(2026-09-02):
--   운영자 지시로 Paul_DUP_20260722_INACTIVE(student_id
--   38717600-f114-4092-abb6-c285e531f2d6) 소유 SCA 2행은 명시적 운영자
--   승인 없이는 실행 불가능해야 한다. 그래서 이 파일에서는 그 2행을 빼고
--   별도 파일 supabase_v3_43b_paul_dup_sca_reassign.sql 로 분리했다(그
--   2행은 이 파일의 _deferred 임시 테이블에만 기록되며, 갱신 대상에서
--   제외된다). 권장 실행 순서: v3_43(이 파일) → v3_43b(운영자 승인 후) →
--   v3_44.
--
-- 재배정 규칙:
--   그룹 A (실학생, is_primary=true, 5행) = 권위값 동기화.
--     그 학생의 현재 students.current_unit_id 값(이미 그 교재로 정상
--     진행 중인 실제 진도)으로 SCA.current_unit_id 를 맞춘다.
--   그룹 B (실학생, is_primary=false, 6행) = NULL 로 되돌린다.
--     이는 assignTextbook() 이 만드는 초기 상태와 동일하다 — 그 교재의
--     진도가 아직 0이라는 뜻이며, 학생이 이 교재로 전환하는 순간 앱이
--     단어가 있는 첫 유닛을 스스로 확정한다(코드 로직, 이 SQL 이 임의로
--     유닛을 고르지 않는다).
--   그룹 C (탈퇴/QA/중복 등 비실사용 계정 8행 + students 직접 참조 2행)
--     = 그룹 B 와 동일한 규칙(대부분 NULL, Barry 만 예외적으로 자신의
--     현재 진도값이 있어 AUTHORITATIVE). Paul_DUP_20260722_INACTIVE 소유
--     2행은 위 분리 사실 참고 — 이 파일이 아니라 v3_43b 가 처리한다.
--
-- 전제(STEP1 이 실행 시점에 전부 재검증한다, 실패 시 전체 rollback):
--   - _ghost 7개 유닛이 여전히 존재하고 표의 name/textbook_id/word_id 와 일치.
--   - _plan_sca 19행이 가리키는 student_class_assignments 행이 정확히
--     계획과 동일한 상태(id/student_id/class_id/textbook_id/is_primary/
--     current_unit_id)로 존재하며, 유령을 참조하는 SCA 행의 전체 집합이
--     정확히 이 19행 + _deferred 2행(합 21)과 같다(계획/보류에 없는
--     참조가 새로 생겼으면 중단).
--   - _plan_stu 2행이 가리키는 students 행이 계획과 동일한 상태로 존재하며,
--     유령을 참조하는 students 의 전체 집합이 정확히 이 2행과 같다.
--   - AUTHORITATIVE 규칙 6행은 실행 시점에도 여전히 그 학생의 살아있는
--     students.current_unit_id 와 정확히 같은 to_unit 을 가리켜야 한다
--     (조사 시점과 실행 시점 사이 학생이 스스로 진도를 더 나갔다면 이
--     파일은 안전하게 멈춘다).
--   - Yaeji/Song 등 이 계획에 포함되지 않아야 하는 보호 계정은 사전/사후
--     모두 정확한 상태를 assert 한다.
--
-- 이 파일이 절대 건드리지 않는 것(헌법 규칙 4/11):
--   - 학습 기록 테이블(student_progress, student_daily_progress,
--     word_status, xp_ledger, word_king_history, daily_assignments) —
--     읽지도 않는다(단, 학습 테이블 전체의 md5 fingerprint 를 STEP2/STEP4
--     에서 비교해 "이 파일 실행으로 인한 부수효과가 전혀 없었다"만 증명).
--   - PIN 관련 컬럼(pin_hash/pin_fail_count/pin_locked_until/
--     pin_setup_allowed) — fingerprint 계산에서도 명시적으로 제외한다.
--   - units/words 의 삭제(별도 파일 v3_44 의 책임).
--
-- 실행 방법: Supabase 대시보드 SQL Editor 에서 이 파일 전체를 한 번에
-- 실행한다(트랜잭션 1개, 중간에 실패하면 전체 rollback).
--
-- 롤백: supabase_v3_43_ghost_sca_reassign_ROLLBACK.sql

begin;

create temp table _ghost (
  id uuid,
  name text,
  textbook_id uuid,
  word_id uuid
) on commit drop;

insert into _ghost (id, name, textbook_id, word_id) values
  ('113ee184-c5c7-4ee5-8b6c-99d547a06525', 'Unit',  '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', '4eb625e1-69af-467d-93ae-639499c14faf'),
  ('35ee95ae-545b-4c0c-822b-258127142eed', 'Unit',  'faf6dc71-c929-491e-beaa-b175d558b7e2', '739bec2e-bbfe-47b8-928e-ce492147e923'),
  ('3d1c753e-fc1e-4f54-93d3-8dd0a4898939', 'Unit',  '86fdd554-9e8d-4a09-a894-5d05034d3f29', '6f2e9f4c-dabf-48a7-8dca-c737846e6900'),
  ('4bc96928-baf4-41ec-b50a-b8be07dde846', 'Unit',  '59e0a0b7-c00c-4d48-a25e-4d159bb4ccf8', 'aa301dbf-ce88-415f-a653-da031f40f351'),
  ('53e380c7-7275-4e67-8d76-09d3b8db0eec', 'Unit',  '09c073dd-a136-4a66-8e39-44a392f236d8', '62997967-ba13-4669-8823-4bf484d9df76'),
  ('5d9db813-3fc9-45fd-8fe5-bc5e369f1eba', 'Unit1', 'faf6dc71-c929-491e-beaa-b175d558b7e2', '7189faf8-98ef-4071-b48a-ac916590eba2'),
  ('e327efc3-5d35-4b9d-b915-20cb77a79120', 'Unit',  '80e8d5dd-a054-4f96-9173-5db981e1fe5b', 'b9084df0-2c4e-492b-8be4-f237ef62785a');

create temp table _plan_sca (
  grp text,
  sca_id uuid,
  student_id uuid,
  student_name text,
  class_id uuid,
  textbook_id uuid,
  is_primary boolean,
  from_unit uuid,
  to_unit uuid,
  to_name text,
  rule text
) on commit drop;

insert into _plan_sca (grp, sca_id, student_id, student_name, class_id, textbook_id, is_primary, from_unit, to_unit, to_name, rule) values
  ('A', '0a6da72e-a8ae-4dd7-b4a9-e9ad0be72400', '77cc6550-6fe2-4549-a23e-7eba510e891b', 'Harry', '766dffcb-38d4-43d5-b9ad-95ef0f8dafb5', '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', true,  '113ee184-c5c7-4ee5-8b6c-99d547a06525', '2ee167a0-3a09-460e-94e8-2c9e38ac940b', 'Unit3', 'AUTHORITATIVE'),
  ('A', '0c8793c3-504a-4386-8be3-add5dfaaadaa', 'c554cad5-078c-4d43-ab29-e5dcc04a3e84', '이윤제', '766dffcb-38d4-43d5-b9ad-95ef0f8dafb5', '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', true,  '113ee184-c5c7-4ee5-8b6c-99d547a06525', '2ee167a0-3a09-460e-94e8-2c9e38ac940b', 'Unit3', 'AUTHORITATIVE'),
  ('A', '61416017-e392-41e1-8344-c44717b49040', '48a8c230-e2c1-4814-82dd-f8bc4d0e3658', 'Luke',  '766dffcb-38d4-43d5-b9ad-95ef0f8dafb5', '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', true,  '113ee184-c5c7-4ee5-8b6c-99d547a06525', 'd279d1c4-2a37-43be-aa85-19aa0999c850', 'Unit2', 'AUTHORITATIVE'),
  ('A', '6d50aafe-df9a-4690-9e0b-3fdc9df3ebe6', 'd05dea68-f019-4202-b494-6a917158ccd4', '황다은', 'ec584e53-1da5-470e-bab0-238d71cc6042', '09c073dd-a136-4a66-8e39-44a392f236d8', true,  '53e380c7-7275-4e67-8d76-09d3b8db0eec', '49999e20-161a-4059-a24d-9fba0ebea042', '7',     'AUTHORITATIVE'),
  ('A', 'c3c6a13d-8938-41af-a01f-ade0cd65f5e0', 'e32b8d7d-ef76-4292-ba46-059fb7b9719e', '현다율', 'ec584e53-1da5-470e-bab0-238d71cc6042', '09c073dd-a136-4a66-8e39-44a392f236d8', true,  '53e380c7-7275-4e67-8d76-09d3b8db0eec', 'e402499b-e2c7-4c93-a35b-e2b8f3449048', 'Unit1', 'AUTHORITATIVE'),
  ('B', '0b9e542e-cde4-4d56-b248-7d1ff8758d96', '9f115c32-6a4b-4659-a026-f9905a5cc2e2', '문지유', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', false, 'e327efc3-5d35-4b9d-b915-20cb77a79120', null, null, 'TO_NULL'),
  ('B', '283e3160-dc78-42c9-bbe8-ea6bd8505ceb', '0446069e-eae0-4042-8bd1-d1907d5496d7', 'John',  'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', false, 'e327efc3-5d35-4b9d-b915-20cb77a79120', null, null, 'TO_NULL'),
  ('B', 'da532fa0-050e-415c-91c5-cc1e28da763e', '58174565-90b1-4b7e-8dc4-61eb2fbb118a', 'Dain',  'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', false, 'e327efc3-5d35-4b9d-b915-20cb77a79120', null, null, 'TO_NULL'),
  ('B', 'dc245783-2808-4e68-ab35-fff8cb4d9e76', '4f3e0b72-2452-4780-92bf-32eeceff9c90', 'Song',  'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', false, 'e327efc3-5d35-4b9d-b915-20cb77a79120', null, null, 'TO_NULL'),
  ('B', 'daea911e-0f69-413d-8d2f-44de585d7dbb', '6548dd2a-cc01-4b4f-80d9-746d55bf5014', '권교빈', 'ec584e53-1da5-470e-bab0-238d71cc6042', '09c073dd-a136-4a66-8e39-44a392f236d8', false, '53e380c7-7275-4e67-8d76-09d3b8db0eec', null, null, 'TO_NULL'),
  ('B', 'cc9d04b5-2f3b-4b1d-9905-1a201e87d3c1', '77cc6550-6fe2-4549-a23e-7eba510e891b', 'Harry', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', false, '3d1c753e-fc1e-4f54-93d3-8dd0a4898939', null, null, 'TO_NULL'),
  ('C', '7750b95c-b4ca-434e-a8f3-1527983a9871', '1056c7db-8464-45a4-9f3d-d13223c708b6', 'Barry', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', true,  'e327efc3-5d35-4b9d-b915-20cb77a79120', '4fe5a398-7352-415c-b92f-572fc2ecfef9', 'Unit6', 'AUTHORITATIVE'),
  ('C', 'bd70675d-622b-4ab7-90fe-6f20c2aff06a', '67ff824e-9517-4f20-bcfa-92e53808ce26', '_QA_LegacyFix_NewStudent_20260722', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', true,  '3d1c753e-fc1e-4f54-93d3-8dd0a4898939', null, null, 'TO_NULL'),
  ('C', 'df88d8c6-6424-4963-bf6c-c163794c1854', '2bc1170a-b3e3-4db5-baf9-ae4e7a706203', '_QA_Song_TextbookModel_20260722',   '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', true,  '3d1c753e-fc1e-4f54-93d3-8dd0a4898939', null, null, 'TO_NULL'),
  ('C', '46843d59-9b52-4788-ba80-22b2e46e97b6', '2bc1170a-b3e3-4db5-baf9-ae4e7a706203', '_QA_Song_TextbookModel_20260722',   '9e9ce482-d7c0-4771-8e01-37966ee64d79', '59e0a0b7-c00c-4d48-a25e-4d159bb4ccf8', false, '4bc96928-baf4-41ec-b50a-b8be07dde846', null, null, 'TO_NULL'),
  ('C', 'cd51eb67-0b37-4353-bf87-e639648d77f8', '2bc1170a-b3e3-4db5-baf9-ae4e7a706203', '_QA_Song_TextbookModel_20260722',   'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', false, 'e327efc3-5d35-4b9d-b915-20cb77a79120', null, null, 'TO_NULL'),
  ('C', '98099c2e-50b7-401a-bda3-1a304f565279', 'fb063caa-bd0e-4902-94e0-670f746bdc0b', 'leo_DUP_20260805_6bdc0b_INACTIVE',  '2b53d4eb-7545-4b6a-8f14-86de868ea2e3', 'faf6dc71-c929-491e-beaa-b175d558b7e2', true,  '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba', null, null, 'TO_NULL'),
  ('C', '030a0dda-ab4c-48fc-977e-dddcaa004fdd', 'b010d8f6-4f25-44a3-852e-76e8bbcb4794', 'QA_CaseTest', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', false, 'e327efc3-5d35-4b9d-b915-20cb77a79120', null, null, 'TO_NULL'),
  ('C', '244dc359-3227-47c4-aaa2-105e8e38be2d', 'b010d8f6-4f25-44a3-852e-76e8bbcb4794', 'QA_CaseTest', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', false, '3d1c753e-fc1e-4f54-93d3-8dd0a4898939', null, null, 'TO_NULL');

-- Paul_DUP_20260722_INACTIVE 소유 — 운영자 명시 승인 후 별도 파일
-- supabase_v3_43b_paul_dup_sca_reassign.sql 로만 변경한다. 이 파일은
-- 이 2행을 절대 갱신하지 않는다.
create temp table _deferred (
  sca_id uuid,
  student_id uuid,
  from_unit uuid
) on commit drop;

insert into _deferred (sca_id, student_id, from_unit) values
  ('4a7d5dc6-e189-4410-b3dd-dabe4fbd9aac', '38717600-f114-4092-abb6-c285e531f2d6', '3d1c753e-fc1e-4f54-93d3-8dd0a4898939'),
  ('b392747a-3ae8-43df-8eba-e57911f5916b', '38717600-f114-4092-abb6-c285e531f2d6', 'e327efc3-5d35-4b9d-b915-20cb77a79120');

create temp table _plan_stu (
  student_id uuid,
  student_name text,
  class_id uuid,
  unit_name text,
  from_unit uuid
) on commit drop;

insert into _plan_stu (student_id, student_name, class_id, unit_name, from_unit) values
  ('2bc1170a-b3e3-4db5-baf9-ae4e7a706203', '_QA_Song_TextbookModel_20260722',  '9e9ce482-d7c0-4771-8e01-37966ee64d79', 'Unit',   '3d1c753e-fc1e-4f54-93d3-8dd0a4898939'),
  ('fb063caa-bd0e-4902-94e0-670f746bdc0b', 'leo_DUP_20260805_6bdc0b_INACTIVE', '0249067d-dd64-465d-9c27-fb8737e9f4c4', 'Unit 1', '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba');

create temp table _protect (
  student_id uuid,
  label text,
  expected_plan_rows int
) on commit drop;

insert into _protect (student_id, label, expected_plan_rows) values
  ('1c585815-98c8-461e-81fc-0187ffdcfa1c', 'Yaeji',  0),
  ('2c6845fc-b30e-4e4d-b260-d13c13fe7b9a', '박민준', 0),
  ('ab5be7a4-ddac-4b0a-b20b-bbc1cf0a4441', '박성준', 0),
  ('4f3e0b72-2452-4780-92bf-32eeceff9c90', 'Song',   1),
  ('335a9560-d1f1-4628-bd8d-26bcaa8eaee7', 'Paul',   0),
  ('a63923a1-473d-4ba1-bca6-6b8685848cd3', 'Cookie', 0),
  ('738443f3-2676-4b89-9f17-cc7f22aa993c', 'Jinaa',  0);

create temp table _fp_before (
  k text primary key,
  v text
) on commit drop;

-- STEP1: live preconditions — 하나라도 어긋나면 raise exception (전체 rollback)
do $$
declare
  v_n int;
  v_wc int;
  v_rec record;
  v_cur uuid;
  v_uname text;
  v_utb uuid;
begin
  select count(*) into v_n from _ghost g
    join public.units u on u.id = g.id and u.name = g.name and u.textbook_id = g.textbook_id;
  if v_n <> 7 then
    raise exception 'STEP1 유령 유닛 7개 중 % 개만 units 와 일치', v_n;
  end if;

  for v_rec in select * from _ghost loop
    select count(*) into v_wc from public.words w where w.unit_id = v_rec.id;
    if v_wc <> 1 then
      raise exception 'STEP1 유령 % 의 단어 수 % (정확히 1 이어야 함)', v_rec.id, v_wc;
    end if;
    select count(*) into v_n from public.words w where w.unit_id = v_rec.id and w.id = v_rec.word_id;
    if v_n <> 1 then
      raise exception 'STEP1 유령 % 의 단어 id 불일치', v_rec.id;
    end if;
  end loop;

  select count(distinct sca_id) into v_n from _plan_sca;
  if v_n <> 19 then
    raise exception 'STEP1 _plan_sca sca_id 중복 존재 (distinct %)', v_n;
  end if;

  for v_rec in select * from _plan_sca loop
    select count(*) into v_n from public.student_class_assignments a
     where a.id = v_rec.sca_id and a.student_id = v_rec.student_id and a.class_id = v_rec.class_id
       and a.textbook_id = v_rec.textbook_id and a.is_primary = v_rec.is_primary
       and a.current_unit_id = v_rec.from_unit;
    if v_n <> 1 then
      raise exception 'STEP1 SCA 행 % 사전조건 불일치', v_rec.sca_id;
    end if;
    select count(*) into v_n from public.students s where s.id = v_rec.student_id and s.name = v_rec.student_name;
    if v_n <> 1 then
      raise exception 'STEP1 학생 % 이름 불일치', v_rec.student_id;
    end if;
  end loop;

  select count(*) into v_n from public.student_class_assignments a
   where a.current_unit_id in (select id from _ghost)
     and a.id not in (select sca_id from _plan_sca)
     and a.id not in (select sca_id from _deferred);
  if v_n <> 0 then
    raise exception 'STEP1 계획에 없는 유령 참조 SCA 행 % 건 존재', v_n;
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.current_unit_id in (select id from _ghost);
  if v_n <> 21 then
    raise exception 'STEP1 유령 참조 SCA 실측 % (계획 19 + 보류 2 = 21 과 불일치)', v_n;
  end if;

  for v_rec in select * from _deferred loop
    select count(*) into v_n from public.student_class_assignments a
     where a.id = v_rec.sca_id and a.student_id = v_rec.student_id
       and a.current_unit_id = v_rec.from_unit;
    if v_n <> 1 then
      raise exception 'STEP1 보류(Paul_DUP) 행 % 상태 불일치 — v3_43b 를 먼저 실행했다면 이 파일(v3_43)을 그보다 먼저 실행해야 함', v_rec.sca_id;
    end if;
  end loop;

  for v_rec in select * from _plan_stu loop
    select count(*) into v_n from public.students s
     where s.id = v_rec.student_id and s.class_id = v_rec.class_id and s.unit_name = v_rec.unit_name
       and s.current_unit_id = v_rec.from_unit;
    if v_n <> 1 then
      raise exception 'STEP1 students 행 % 사전조건 불일치', v_rec.student_id;
    end if;
  end loop;

  select count(*) into v_n from public.students s
   where s.current_unit_id in (select id from _ghost)
     and s.id not in (select student_id from _plan_stu);
  if v_n <> 0 then
    raise exception 'STEP1 계획에 없는 유령 참조 students 행 % 건 존재', v_n;
  end if;

  select count(*) into v_n from public.students s
   where s.current_unit_id in (select id from _ghost);
  if v_n <> 2 then
    raise exception 'STEP1 유령 참조 students 실측 % (계획 2와 불일치)', v_n;
  end if;

  for v_rec in select * from _plan_sca where rule = 'AUTHORITATIVE' loop
    select s.current_unit_id into v_cur from public.students s where s.id = v_rec.student_id;
    if v_cur is distinct from v_rec.to_unit then
      raise exception 'STEP1 AUTHORITATIVE SCA % to_unit 이 현재 students.current_unit_id 와 불일치', v_rec.sca_id;
    end if;
    select u.textbook_id, u.name into v_utb, v_uname from public.units u where u.id = v_rec.to_unit;
    if v_utb is distinct from v_rec.textbook_id then
      raise exception 'STEP1 AUTHORITATIVE SCA % to_unit 의 textbook_id 불일치', v_rec.sca_id;
    end if;
    if v_uname is distinct from v_rec.to_name then
      raise exception 'STEP1 AUTHORITATIVE SCA % to_unit 의 name 불일치', v_rec.sca_id;
    end if;
    select count(*) into v_wc from public.words w where w.unit_id = v_rec.to_unit;
    if v_wc < 2 then
      raise exception 'STEP1 AUTHORITATIVE SCA % to_unit 단어 수 % (2 이상이어야 함)', v_rec.sca_id, v_wc;
    end if;
    select count(*) into v_n from _ghost g where g.id = v_rec.to_unit;
    if v_n <> 0 then
      raise exception 'STEP1 AUTHORITATIVE SCA % to_unit 이 유령 목록에 있음', v_rec.sca_id;
    end if;
  end loop;

  select count(*) into v_n from _plan_sca where rule = 'TO_NULL' and to_unit is not null;
  if v_n <> 0 then
    raise exception 'STEP1 TO_NULL 행인데 to_unit 이 NULL 이 아님 (% 건)', v_n;
  end if;

  for v_rec in select * from _protect loop
    select count(*) into v_n from public.students s where s.id = v_rec.student_id;
    if v_n <> 1 then
      raise exception 'STEP1 보호 계정 % 이(가) students 에 없음', v_rec.label;
    end if;
    select count(*) into v_n from _plan_sca p where p.student_id = v_rec.student_id;
    if v_n <> v_rec.expected_plan_rows then
      raise exception 'STEP1 보호 계정 % 의 계획 포함 SCA 행 수 불일치', v_rec.label;
    end if;
    select count(*) into v_n from _plan_stu p where p.student_id = v_rec.student_id;
    if v_n <> 0 then
      raise exception 'STEP1 보호 계정 % 이(가) _plan_stu 에 포함됨', v_rec.label;
    end if;
  end loop;

  select count(*) into v_n from public.students s
   where s.id = '1c585815-98c8-461e-81fc-0187ffdcfa1c' and s.name = 'Yaeji'
     and s.class_id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6'
     and s.current_unit_id = '18f59bd6-18ea-426a-b356-e2dc807f3cdb'
     and s.unit_name = 'Unit 7';
  if v_n <> 1 then
    raise exception 'STEP1 Yaeji 사전 assert 실패';
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.student_id = '1c585815-98c8-461e-81fc-0187ffdcfa1c';
  if v_n <> 2 then
    raise exception 'STEP1 Yaeji SCA 행 수 % (정확히 2 이어야 함)', v_n;
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.id = 'a2fae200-0d9e-474d-9edc-ea942d5a058c' and a.student_id = '1c585815-98c8-461e-81fc-0187ffdcfa1c'
     and a.textbook_id = 'faf6dc71-c929-491e-beaa-b175d558b7e2' and a.is_primary = true
     and a.current_unit_id = '65a872b4-9a36-4055-a082-c94db951d76d';
  if v_n <> 1 then
    raise exception 'STEP1 Yaeji SCA a2fae200 사전 assert 실패';
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.id = 'c69427b7-b1df-4e00-9f21-87a06d9af7bf' and a.student_id = '1c585815-98c8-461e-81fc-0187ffdcfa1c'
     and a.textbook_id = '26310f76-9396-40d2-93d9-ff4ca4650e5e' and a.is_primary = false
     and a.current_unit_id = 'adbccbb3-862b-43df-84ba-dde20c2ae186';
  if v_n <> 1 then
    raise exception 'STEP1 Yaeji SCA c69427b7 사전 assert 실패';
  end if;

  raise notice 'STEP1 OK — 사전조건 전부 통과';
end $$;

-- STEP2: 변경 전 스냅샷/fingerprint (학습 기록/PIN 은 md5 로만 다룬다)
do $$
declare
  v_fp text;
  v_t text;
  v_rec record;
begin
  insert into _fp_before values (
    'students:untargeted',
    (select md5(coalesce(string_agg((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed')::text, ',' order by s.id::text), ''))
       from public.students s where s.id not in (select student_id from _plan_stu))
  );
  insert into _fp_before values (
    'students:targeted-minus-cur',
    (select md5(coalesce(string_agg((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed' - 'current_unit_id')::text, ',' order by s.id::text), ''))
       from public.students s where s.id in (select student_id from _plan_stu))
  );
  insert into _fp_before values (
    'sca:untargeted',
    (select md5(coalesce(string_agg(to_jsonb(a)::text, ',' order by a.id::text), ''))
       from public.student_class_assignments a where a.id not in (select sca_id from _plan_sca))
  );
  insert into _fp_before values (
    'sca:targeted-minus-cur',
    (select md5(coalesce(string_agg((to_jsonb(a) - 'current_unit_id')::text, ',' order by a.id::text), ''))
       from public.student_class_assignments a where a.id in (select sca_id from _plan_sca))
  );

  for v_t in select unnest(array['student_progress','student_daily_progress','word_status','xp_ledger','word_king_history','daily_assignments']) loop
    if to_regclass('public.' || v_t) is null then continue; end if;
    execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) from public.%I t', v_t) into v_fp;
    insert into _fp_before values ('tbl:' || v_t, v_fp);
  end loop;

  insert into _fp_before values (
    'units:all', (select md5(coalesce(string_agg(to_jsonb(u)::text, ',' order by u.id::text), '')) from public.units u)
  );
  insert into _fp_before values (
    'words:all', (select md5(coalesce(string_agg(to_jsonb(w)::text, ',' order by w.id::text), '')) from public.words w)
  );
  insert into _fp_before values (
    'classes:all', (select md5(coalesce(string_agg(to_jsonb(c)::text, ',' order by c.id::text), '')) from public.classes c)
  );
  insert into _fp_before values (
    'textbooks:all', (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id::text), '')) from public.textbooks t)
  );
  insert into _fp_before values (
    'counts',
    (select count(*)::text from public.students) || ':' ||
    (select count(*)::text from public.student_class_assignments) || ':' ||
    (select count(*)::text from public.units) || ':' ||
    (select count(*)::text from public.words)
  );

  for v_rec in select * from _protect loop
    insert into _fp_before values (
      'protect:' || v_rec.label || ':students',
      (select md5(coalesce((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed')::text, ''))
         from public.students s where s.id = v_rec.student_id)
    );
    insert into _fp_before values (
      'protect:' || v_rec.label || ':sca',
      (select md5(coalesce(string_agg(
          case when a.id = 'dc245783-2808-4e68-ab35-fff8cb4d9e76' then (to_jsonb(a) - 'current_unit_id')::text else to_jsonb(a)::text end,
          ',' order by a.id::text), ''))
         from public.student_class_assignments a where a.student_id = v_rec.student_id)
    );
  end loop;

  raise notice 'STEP2 OK — 변경 전 스냅샷 저장';
end $$;

-- STEP3: 정확한 대상만 변경
do $$
declare
  v_n int;
begin
  update public.student_class_assignments a set current_unit_id = p.to_unit
    from _plan_sca p where a.id = p.sca_id and a.current_unit_id = p.from_unit;
  get diagnostics v_n = row_count;
  if v_n <> 19 then
    raise exception 'STEP3 SCA UPDATE 영향 행 % (정확히 19 이어야 함)', v_n;
  end if;

  update public.students s set current_unit_id = null
    from _plan_stu p where s.id = p.student_id and s.current_unit_id = p.from_unit;
  get diagnostics v_n = row_count;
  if v_n <> 2 then
    raise exception 'STEP3 students UPDATE 영향 행 % (정확히 2 이어야 함)', v_n;
  end if;

  raise notice 'STEP3 OK — SCA 19건 / students 2건 갱신';
end $$;

-- STEP4: 사후검증 + fingerprint 비교 + 보호 계정 assert
do $$
declare
  v_n int;
  v_fp text;
  v_t text;
  v_rec record;
begin
  select count(*) into v_n from _plan_sca p
    join public.student_class_assignments a on a.id = p.sca_id
   where a.current_unit_id is not distinct from p.to_unit;
  if v_n <> 19 then
    raise exception 'STEP4 SCA 재배정 검증 실패 (% / 19)', v_n;
  end if;

  select count(*) into v_n from _plan_stu p
    join public.students s on s.id = p.student_id
   where s.current_unit_id is null and s.unit_name = p.unit_name;
  if v_n <> 2 then
    raise exception 'STEP4 students 재배정 검증 실패 (% / 2)', v_n;
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.current_unit_id in (select id from _ghost)
     and a.id not in (select sca_id from _deferred);
  if v_n <> 0 then
    raise exception 'STEP4 유령 참조 SCA 잔존(보류 제외) % 건', v_n;
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.current_unit_id in (select id from _ghost);
  if v_n <> 2 then
    raise exception 'STEP4 유령 참조 SCA 잔존(보류분) % (정확히 2 이어야 함 — Paul_DUP 2행은 v3_43b 승인 대기)', v_n;
  end if;

  select count(*) into v_n from public.students s
   where s.current_unit_id in (select id from _ghost);
  if v_n <> 0 then
    raise exception 'STEP4 유령 참조 students 잔존 % 건', v_n;
  end if;

  create temp table _fp_after (
    k text primary key,
    v text
  ) on commit drop;

  insert into _fp_after values (
    'students:untargeted',
    (select md5(coalesce(string_agg((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed')::text, ',' order by s.id::text), ''))
       from public.students s where s.id not in (select student_id from _plan_stu))
  );
  insert into _fp_after values (
    'students:targeted-minus-cur',
    (select md5(coalesce(string_agg((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed' - 'current_unit_id')::text, ',' order by s.id::text), ''))
       from public.students s where s.id in (select student_id from _plan_stu))
  );
  insert into _fp_after values (
    'sca:untargeted',
    (select md5(coalesce(string_agg(to_jsonb(a)::text, ',' order by a.id::text), ''))
       from public.student_class_assignments a where a.id not in (select sca_id from _plan_sca))
  );
  insert into _fp_after values (
    'sca:targeted-minus-cur',
    (select md5(coalesce(string_agg((to_jsonb(a) - 'current_unit_id')::text, ',' order by a.id::text), ''))
       from public.student_class_assignments a where a.id in (select sca_id from _plan_sca))
  );

  for v_t in select unnest(array['student_progress','student_daily_progress','word_status','xp_ledger','word_king_history','daily_assignments']) loop
    if to_regclass('public.' || v_t) is null then continue; end if;
    execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) from public.%I t', v_t) into v_fp;
    insert into _fp_after values ('tbl:' || v_t, v_fp);
  end loop;

  insert into _fp_after values (
    'units:all', (select md5(coalesce(string_agg(to_jsonb(u)::text, ',' order by u.id::text), '')) from public.units u)
  );
  insert into _fp_after values (
    'words:all', (select md5(coalesce(string_agg(to_jsonb(w)::text, ',' order by w.id::text), '')) from public.words w)
  );
  insert into _fp_after values (
    'classes:all', (select md5(coalesce(string_agg(to_jsonb(c)::text, ',' order by c.id::text), '')) from public.classes c)
  );
  insert into _fp_after values (
    'textbooks:all', (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id::text), '')) from public.textbooks t)
  );
  insert into _fp_after values (
    'counts',
    (select count(*)::text from public.students) || ':' ||
    (select count(*)::text from public.student_class_assignments) || ':' ||
    (select count(*)::text from public.units) || ':' ||
    (select count(*)::text from public.words)
  );

  for v_rec in select * from _protect loop
    insert into _fp_after values (
      'protect:' || v_rec.label || ':students',
      (select md5(coalesce((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed')::text, ''))
         from public.students s where s.id = v_rec.student_id)
    );
    insert into _fp_after values (
      'protect:' || v_rec.label || ':sca',
      (select md5(coalesce(string_agg(
          case when a.id = 'dc245783-2808-4e68-ab35-fff8cb4d9e76' then (to_jsonb(a) - 'current_unit_id')::text else to_jsonb(a)::text end,
          ',' order by a.id::text), ''))
         from public.student_class_assignments a where a.student_id = v_rec.student_id)
    );
  end loop;

  for v_rec in select b.k as k, b.v as v_before, f.v as v_after from _fp_before b join _fp_after f on f.k = b.k loop
    if v_rec.v_before is distinct from v_rec.v_after then
      raise exception 'STEP4 fingerprint 불일치: %', v_rec.k;
    end if;
  end loop;

  select count(*) into v_n from public.students s
   where s.id = '1c585815-98c8-461e-81fc-0187ffdcfa1c' and s.name = 'Yaeji'
     and s.class_id = '1693f32b-af23-4364-8d66-d4dc5b20eaa6'
     and s.current_unit_id = '18f59bd6-18ea-426a-b356-e2dc807f3cdb'
     and s.unit_name = 'Unit 7';
  if v_n <> 1 then
    raise exception 'STEP4 Yaeji 사후 assert 실패';
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.id = 'a2fae200-0d9e-474d-9edc-ea942d5a058c' and a.current_unit_id = '65a872b4-9a36-4055-a082-c94db951d76d';
  if v_n <> 1 then
    raise exception 'STEP4 Yaeji SCA a2fae200 사후 assert 실패';
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.id = 'c69427b7-b1df-4e00-9f21-87a06d9af7bf' and a.current_unit_id = 'adbccbb3-862b-43df-84ba-dde20c2ae186';
  if v_n <> 1 then
    raise exception 'STEP4 Yaeji SCA c69427b7 사후 assert 실패';
  end if;

  select count(*) into v_n from public.students s
   where s.id = '4f3e0b72-2452-4780-92bf-32eeceff9c90' and s.current_unit_id = '4ce41359-6424-4b5e-933d-479db6951586';
  if v_n <> 1 then
    raise exception 'STEP4 Song 사후 assert 실패 (current_unit_id)';
  end if;

  select count(*) into v_n from public.student_class_assignments a
   where a.student_id = '4f3e0b72-2452-4780-92bf-32eeceff9c90';
  if v_n <> 6 then
    raise exception 'STEP4 Song SCA 행 수 % (정확히 6 이어야 함)', v_n;
  end if;

  raise notice 'v3_43 OK — SCA 19 / students 2 재배정(Paul_DUP 2행은 v3_43b 승인 대기), 학습기록·별·보상 무접촉';
end $$;

commit;
-- EOF-MARKER supabase_v3_43_ghost_sca_reassign
