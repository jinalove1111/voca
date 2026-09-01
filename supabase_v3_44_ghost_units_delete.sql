-- supabase_v3_44_ghost_units_delete.sql
--
-- 목적: v3_43(SCA/students 재배정) 완료 후, 더 이상 아무도 참조하지 않는
-- 1단어짜리 "유령" 유닛 6개(및 그 단어 6개)를 실제로 삭제한다.
--
-- 전제: supabase_v3_43 → supabase_v3_43b(운영자 승인) 가 모두 실행되어,
-- 원래 유령을 가리키던 SCA 21행(v3_43 19행 + v3_43b 2행) / students 2행이
-- 전부 재배정 완료 상태여야 한다(미완료면 이 파일은 즉시 raise exception
-- 으로 중단한다).
--
-- 삭제 대상(_del, 6개) = 유령 7개(_ghost) 중 53e380c7-7275-4e67-8d76-09d3b8db0eec
-- 를 제외한 6개.
-- 보류 대상(_hold, 1개) = 53e380c7-7275-4e67-8d76-09d3b8db0eec 단 하나.
--   이 유닛은 삭제하지 않는다 — 실학생 현다율(e32b8d7d-ef76-4292-ba46-059fb7b9719e)
--   의 word_status 실제 학습 기록 1행이 그 단어(62997967-ba13-4669-8823-4bf484d9df76)
--   에 걸려 있어, 삭제하면 CASCADE 로 그 학습 기록까지 지워지기 때문이다.
--   이 유닛의 삭제 여부는 운영자의 별도 결정 대상으로 남긴다.
--
-- 안전장치:
--   - STEP1 에서 pg_constraint 카탈로그를 스캔해 units/words 를 참조하는
--     모든 FK 를 동적으로 확인한다(추측이 아니라 실제 스키마 기준).
--     words.unit_id → units.id 는 정확히 6건(삭제될 단어들 자신)만
--     허용하고, 그 외 어떤 테이블이든 참조가 1건이라도 남아있으면 중단한다.
--   - progress_data->'lastWordIndexByUnit' 에 남아있는 유령 유닛 id 키는
--     FK 가 아니라 JSON blob 이므로 카탈로그 스캔에 잡히지 않는다 —
--     이 파일은 이 키를 삭제/수정하지 않고, 삭제 전후 개수(조사 시점 값
--     7 건)만 확인해 "건드리지 않았다"를 증명한다.
--   - 삭제 전 public.backup_v3_44_units / public.backup_v3_44_words 에
--     삭제될 행을 전량 백업하고, anon/authenticated 권한을 회수한다.
--
-- 이 파일이 절대 건드리지 않는 것(헌법 규칙 4/11):
--   - 학습 기록 테이블(student_progress, student_daily_progress,
--     word_status, xp_ledger, word_king_history, daily_assignments) —
--     읽기(참조 카운트/fingerprint)만 하고 쓰지 않는다.
--   - PIN 관련 컬럼 — fingerprint 계산에서도 명시적으로 제외한다.
--
-- 실행 방법: Supabase 대시보드 SQL Editor 에서 이 파일 전체를 한 번에
-- 실행한다(트랜잭션 1개, 중간에 실패하면 전체 rollback).
--
-- 롤백: supabase_v3_44_ghost_units_delete_ROLLBACK.sql
-- (백업 테이블 backup_v3_44_units/words 를 이용해 원상복구한다. 이 파일
-- 자체는 백업 테이블을 남겨두며 삭제하지 않는다.)

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
  sca_id uuid,
  student_id uuid,
  class_id uuid,
  textbook_id uuid,
  to_unit uuid
) on commit drop;

insert into _plan_sca (sca_id, student_id, class_id, textbook_id, to_unit) values
  ('0a6da72e-a8ae-4dd7-b4a9-e9ad0be72400', '77cc6550-6fe2-4549-a23e-7eba510e891b', '766dffcb-38d4-43d5-b9ad-95ef0f8dafb5', '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', '2ee167a0-3a09-460e-94e8-2c9e38ac940b'),
  ('0c8793c3-504a-4386-8be3-add5dfaaadaa', 'c554cad5-078c-4d43-ab29-e5dcc04a3e84', '766dffcb-38d4-43d5-b9ad-95ef0f8dafb5', '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', '2ee167a0-3a09-460e-94e8-2c9e38ac940b'),
  ('61416017-e392-41e1-8344-c44717b49040', '48a8c230-e2c1-4814-82dd-f8bc4d0e3658', '766dffcb-38d4-43d5-b9ad-95ef0f8dafb5', '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', 'd279d1c4-2a37-43be-aa85-19aa0999c850'),
  ('6d50aafe-df9a-4690-9e0b-3fdc9df3ebe6', 'd05dea68-f019-4202-b494-6a917158ccd4', 'ec584e53-1da5-470e-bab0-238d71cc6042', '09c073dd-a136-4a66-8e39-44a392f236d8', '49999e20-161a-4059-a24d-9fba0ebea042'),
  ('c3c6a13d-8938-41af-a01f-ade0cd65f5e0', 'e32b8d7d-ef76-4292-ba46-059fb7b9719e', 'ec584e53-1da5-470e-bab0-238d71cc6042', '09c073dd-a136-4a66-8e39-44a392f236d8', 'e402499b-e2c7-4c93-a35b-e2b8f3449048'),
  ('0b9e542e-cde4-4d56-b248-7d1ff8758d96', '9f115c32-6a4b-4659-a026-f9905a5cc2e2', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', null),
  ('283e3160-dc78-42c9-bbe8-ea6bd8505ceb', '0446069e-eae0-4042-8bd1-d1907d5496d7', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', null),
  ('da532fa0-050e-415c-91c5-cc1e28da763e', '58174565-90b1-4b7e-8dc4-61eb2fbb118a', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', null),
  ('dc245783-2808-4e68-ab35-fff8cb4d9e76', '4f3e0b72-2452-4780-92bf-32eeceff9c90', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', null),
  ('daea911e-0f69-413d-8d2f-44de585d7dbb', '6548dd2a-cc01-4b4f-80d9-746d55bf5014', 'ec584e53-1da5-470e-bab0-238d71cc6042', '09c073dd-a136-4a66-8e39-44a392f236d8', null),
  ('cc9d04b5-2f3b-4b1d-9905-1a201e87d3c1', '77cc6550-6fe2-4549-a23e-7eba510e891b', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', null),
  ('7750b95c-b4ca-434e-a8f3-1527983a9871', '1056c7db-8464-45a4-9f3d-d13223c708b6', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', '4fe5a398-7352-415c-b92f-572fc2ecfef9'),
  ('bd70675d-622b-4ab7-90fe-6f20c2aff06a', '67ff824e-9517-4f20-bcfa-92e53808ce26', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', null),
  ('df88d8c6-6424-4963-bf6c-c163794c1854', '2bc1170a-b3e3-4db5-baf9-ae4e7a706203', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', null),
  ('46843d59-9b52-4788-ba80-22b2e46e97b6', '2bc1170a-b3e3-4db5-baf9-ae4e7a706203', '9e9ce482-d7c0-4771-8e01-37966ee64d79', '59e0a0b7-c00c-4d48-a25e-4d159bb4ccf8', null),
  ('cd51eb67-0b37-4353-bf87-e639648d77f8', '2bc1170a-b3e3-4db5-baf9-ae4e7a706203', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', null),
  ('98099c2e-50b7-401a-bda3-1a304f565279', 'fb063caa-bd0e-4902-94e0-670f746bdc0b', '2b53d4eb-7545-4b6a-8f14-86de868ea2e3', 'faf6dc71-c929-491e-beaa-b175d558b7e2', null),
  ('4a7d5dc6-e189-4410-b3dd-dabe4fbd9aac', '38717600-f114-4092-abb6-c285e531f2d6', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', null),
  ('b392747a-3ae8-43df-8eba-e57911f5916b', '38717600-f114-4092-abb6-c285e531f2d6', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', null),
  ('030a0dda-ab4c-48fc-977e-dddcaa004fdd', 'b010d8f6-4f25-44a3-852e-76e8bbcb4794', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', null),
  ('244dc359-3227-47c4-aaa2-105e8e38be2d', 'b010d8f6-4f25-44a3-852e-76e8bbcb4794', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', null);

create temp table _plan_stu (
  student_id uuid,
  class_id uuid,
  unit_name text
) on commit drop;

insert into _plan_stu (student_id, class_id, unit_name) values
  ('2bc1170a-b3e3-4db5-baf9-ae4e7a706203', '9e9ce482-d7c0-4771-8e01-37966ee64d79', 'Unit'),
  ('fb063caa-bd0e-4902-94e0-670f746bdc0b', '0249067d-dd64-465d-9c27-fb8737e9f4c4', 'Unit 1');

-- 삭제 대상(6개) = 유령 7개 중 53e380c7(HOLD) 제외
create temp table _del (
  id uuid,
  name text,
  textbook_id uuid,
  word_id uuid
) on commit drop;

insert into _del (id, name, textbook_id, word_id)
  select id, name, textbook_id, word_id from _ghost
   where id <> '53e380c7-7275-4e67-8d76-09d3b8db0eec';

-- 보류 대상(1개) = 53e380c7 — 현다율의 word_status 실제 기록 때문에 삭제하지 않음
create temp table _hold (
  id uuid,
  name text,
  textbook_id uuid,
  word_id uuid
) on commit drop;

insert into _hold (id, name, textbook_id, word_id)
  select id, name, textbook_id, word_id from _ghost
   where id = '53e380c7-7275-4e67-8d76-09d3b8db0eec';

-- _del 각 유닛의 단어 1개씩(합계 6) — id = word id, unit_id = 그 단어가 속한 유닛
create temp table _del_words (
  id uuid,
  unit_id uuid
) on commit drop;

insert into _del_words (id, unit_id)
  select word_id, id from _del;

create temp table _fp_before (
  k text primary key,
  v text
) on commit drop;

-- STEP1: live preconditions
do $$
declare
  v_n int;
  v_wc int;
  v_rec record;
  v_c record;
begin
  select count(*) into v_n from _plan_sca p
    join public.student_class_assignments a on a.id = p.sca_id
   where a.current_unit_id is not distinct from p.to_unit;
  if v_n <> 21 then
    raise exception 'STEP1 v3_43/v3_43b 미완료 — SCA 재배정 % / 21', v_n;
  end if;

  select count(*) into v_n from _plan_stu p
    join public.students s on s.id = p.student_id
   where s.current_unit_id is null;
  if v_n <> 2 then
    raise exception 'STEP1 v3_43/v3_43b 미완료 — students 재배정 % / 2', v_n;
  end if;

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

  for v_rec in select d.id as unit_id, dw.id as word_id from _del d join _del_words dw on dw.unit_id = d.id loop
    select count(*) into v_n from public.students s where s.current_unit_id = v_rec.unit_id;
    if v_n <> 0 then
      raise exception 'STEP1 삭제 대상 유닛 % 을(를) 가리키는 students 행 % 건 존재', v_rec.unit_id, v_n;
    end if;
    select count(*) into v_n from public.student_class_assignments a where a.current_unit_id = v_rec.unit_id;
    if v_n <> 0 then
      raise exception 'STEP1 삭제 대상 유닛 % 을(를) 가리키는 SCA 행 % 건 존재', v_rec.unit_id, v_n;
    end if;
    select count(*) into v_n from public.word_status ws where ws.word_id = v_rec.word_id;
    if v_n <> 0 then
      raise exception 'STEP1 삭제 대상 단어 % 를 가리키는 word_status 행 % 건 존재', v_rec.word_id, v_n;
    end if;
  end loop;

  select count(*) into v_n from public.students s where s.current_unit_id = '53e380c7-7275-4e67-8d76-09d3b8db0eec';
  if v_n <> 0 then
    raise exception 'STEP1 HOLD 유닛을 가리키는 students 행 % 건 존재', v_n;
  end if;
  select count(*) into v_n from public.student_class_assignments a where a.current_unit_id = '53e380c7-7275-4e67-8d76-09d3b8db0eec';
  if v_n <> 0 then
    raise exception 'STEP1 HOLD 유닛을 가리키는 SCA 행 % 건 존재', v_n;
  end if;
  select count(*) into v_n from public.word_status ws
   where ws.word_id = '62997967-ba13-4669-8823-4bf484d9df76' and ws.student_id = 'e32b8d7d-ef76-4292-ba46-059fb7b9719e'
     and ws.status = 'known';
  if v_n <> 1 then
    raise exception 'STEP1 HOLD 대상 상태가 조사 시점과 다름';
  end if;
  select count(*) into v_n from public.word_status ws where ws.word_id = '62997967-ba13-4669-8823-4bf484d9df76';
  if v_n <> 1 then
    raise exception 'STEP1 HOLD 대상 단어의 word_status 행 수 % (정확히 1 이어야 함)', v_n;
  end if;

  for v_c in
    select c.conrelid::regclass::text as tbl, c.confrelid::regclass::text as ref,
           (select attname from pg_attribute where attrelid = c.conrelid and attnum = c.conkey[1]) as col,
           array_length(c.conkey, 1) as ncols, c.confdeltype::text as deltype
      from pg_constraint c
     where c.contype::text = 'f' and c.confrelid in ('public.units'::regclass, 'public.words'::regclass)
  loop
    if v_c.ncols <> 1 then raise exception 'FK % 는 복합키 — 수동 확인 필요', v_c.tbl; end if;
    execute format('select count(*) from %s where %I in (select id from %s)', v_c.tbl, v_c.col,
                   case when v_c.ref like '%units' then '_del' else '_del_words' end) into v_n;
    if v_c.tbl in ('words', 'public.words') and v_c.col = 'unit_id' then
      if v_n <> 6 then raise exception 'words.unit_id 참조 % (정확히 6)', v_n; end if;
    elsif v_n <> 0 then
      raise exception 'FK 참조 남음: %.% → % 건 (deltype %)', v_c.tbl, v_c.col, v_n, v_c.deltype;
    end if;
  end loop;

  select count(*) into v_n
    from public.student_progress p, jsonb_object_keys(case when jsonb_typeof(p.progress_data->'lastWordIndexByUnit') = 'object' then p.progress_data->'lastWordIndexByUnit' else '{}'::jsonb end) k
   where k in (select id::text from _del);
  if v_n <> 7 then
    raise exception 'STEP1 progress blob 유령 유닛 키 참조 % (조사 시점 7 과 불일치)', v_n;
  end if;

  if to_regclass('public.backup_v3_44_units') is not null then
    raise exception 'STEP1 backup_v3_44_units 가 이미 존재함 — 이미 실행됨';
  end if;
  if to_regclass('public.backup_v3_44_words') is not null then
    raise exception 'STEP1 backup_v3_44_words 가 이미 존재함 — 이미 실행됨';
  end if;

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

-- STEP2: 변경 전 스냅샷/fingerprint
do $$
declare
  v_fp text;
  v_t text;
begin
  insert into _fp_before values (
    'students:all',
    (select md5(coalesce(string_agg((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed')::text, ',' order by s.id::text), '')) from public.students s)
  );
  insert into _fp_before values (
    'sca:all',
    (select md5(coalesce(string_agg(to_jsonb(a)::text, ',' order by a.id::text), '')) from public.student_class_assignments a)
  );
  insert into _fp_before values (
    'units:rest',
    (select md5(coalesce(string_agg(to_jsonb(u)::text, ',' order by u.id::text), '')) from public.units u where u.id not in (select id from _del))
  );
  insert into _fp_before values (
    'words:rest',
    (select md5(coalesce(string_agg(to_jsonb(w)::text, ',' order by w.id::text), '')) from public.words w where w.unit_id not in (select id from _del))
  );

  for v_t in select unnest(array['student_progress','student_daily_progress','word_status','xp_ledger','word_king_history','daily_assignments']) loop
    if to_regclass('public.' || v_t) is null then continue; end if;
    execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) from public.%I t', v_t) into v_fp;
    insert into _fp_before values ('tbl:' || v_t, v_fp);
  end loop;

  insert into _fp_before values (
    'classes:all', (select md5(coalesce(string_agg(to_jsonb(c)::text, ',' order by c.id::text), '')) from public.classes c)
  );
  insert into _fp_before values (
    'textbooks:all', (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id::text), '')) from public.textbooks t)
  );

  if to_regclass('public.class_textbooks') is not null then
    insert into _fp_before values (
      'class_textbooks:all',
      (select md5(coalesce(string_agg(to_jsonb(ct)::text, ',' order by to_jsonb(ct)::text), '')) from public.class_textbooks ct)
    );
  end if;

  insert into _fp_before values ('count:students', (select count(*)::text from public.students));
  insert into _fp_before values ('count:sca', (select count(*)::text from public.student_class_assignments));
  insert into _fp_before values ('count:units', (select count(*)::text from public.units));
  insert into _fp_before values ('count:words', (select count(*)::text from public.words));

  raise notice 'STEP2 OK — 변경 전 스냅샷 저장';
end $$;

-- STEP3: 백업 생성(top-level) + 검증/삭제(DO 블록)
create table public.backup_v3_44_units as
  select * from public.units where id in (select id from _del);

create table public.backup_v3_44_words as
  select * from public.words where unit_id in (select id from _del);

revoke all on table public.backup_v3_44_units from anon, authenticated;
revoke all on table public.backup_v3_44_words from anon, authenticated;

do $$
declare
  v_n int;
begin
  select count(*) into v_n from public.backup_v3_44_units;
  if v_n <> 6 then
    raise exception 'STEP3 backup_v3_44_units 행 수 % (정확히 6 이어야 함)', v_n;
  end if;
  select count(*) into v_n from public.backup_v3_44_units u where u.id not in (select id from _del);
  if v_n <> 0 then
    raise exception 'STEP3 backup_v3_44_units 에 계획 외 행 % 건 존재', v_n;
  end if;
  select count(*) into v_n from _del d where d.id not in (select id from public.backup_v3_44_units);
  if v_n <> 0 then
    raise exception 'STEP3 backup_v3_44_units 에 누락된 계획 행 % 건', v_n;
  end if;

  select count(*) into v_n from public.backup_v3_44_words;
  if v_n <> 6 then
    raise exception 'STEP3 backup_v3_44_words 행 수 % (정확히 6 이어야 함)', v_n;
  end if;
  select count(*) into v_n from public.backup_v3_44_words w where w.id not in (select id from _del_words);
  if v_n <> 0 then
    raise exception 'STEP3 backup_v3_44_words 에 계획 외 행 % 건 존재', v_n;
  end if;
  select count(*) into v_n from _del_words dw where dw.id not in (select id from public.backup_v3_44_words);
  if v_n <> 0 then
    raise exception 'STEP3 backup_v3_44_words 에 누락된 계획 행 % 건', v_n;
  end if;

  delete from public.words w where w.id in (select id from _del_words) and w.unit_id in (select id from _del);
  get diagnostics v_n = row_count;
  if v_n <> 6 then
    raise exception 'STEP3 words DELETE 영향 행 % (정확히 6 이어야 함)', v_n;
  end if;

  delete from public.units u where u.id in (select id from _del);
  get diagnostics v_n = row_count;
  if v_n <> 6 then
    raise exception 'STEP3 units DELETE 영향 행 % (정확히 6 이어야 함)', v_n;
  end if;

  raise notice 'STEP3 OK — 유령 단어 6 / 유령 유닛 6 삭제(백업 완료)';
end $$;

-- STEP4: 사후검증 + fingerprint 비교 + 카운트 delta 확인
do $$
declare
  v_n int;
  v_fp text;
  v_t text;
  v_rec record;
  v_students_before int;
  v_students_after int;
  v_sca_before int;
  v_sca_after int;
  v_units_before int;
  v_units_after int;
  v_words_before int;
  v_words_after int;
begin
  select count(*) into v_n from public.units u where u.id in (select id from _del);
  if v_n <> 0 then
    raise exception 'STEP4 삭제 대상 유닛 잔존 % 건', v_n;
  end if;

  select count(*) into v_n from public.units u where u.id = '53e380c7-7275-4e67-8d76-09d3b8db0eec';
  if v_n <> 1 then
    raise exception 'STEP4 HOLD 유닛이 존재하지 않음';
  end if;
  select count(*) into v_n from public.words w where w.unit_id = '53e380c7-7275-4e67-8d76-09d3b8db0eec';
  if v_n <> 1 then
    raise exception 'STEP4 HOLD 유닛의 단어 수 % (정확히 1 이어야 함)', v_n;
  end if;

  select count(*) into v_n from public.words w where w.id in (select id from _del_words);
  if v_n <> 0 then
    raise exception 'STEP4 삭제 대상 단어 잔존 % 건', v_n;
  end if;

  create temp table _fp_after (
    k text primary key,
    v text
  ) on commit drop;

  insert into _fp_after values (
    'students:all',
    (select md5(coalesce(string_agg((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed')::text, ',' order by s.id::text), '')) from public.students s)
  );
  insert into _fp_after values (
    'sca:all',
    (select md5(coalesce(string_agg(to_jsonb(a)::text, ',' order by a.id::text), '')) from public.student_class_assignments a)
  );
  insert into _fp_after values (
    'units:rest',
    (select md5(coalesce(string_agg(to_jsonb(u)::text, ',' order by u.id::text), '')) from public.units u where u.id not in (select id from _del))
  );
  insert into _fp_after values (
    'words:rest',
    (select md5(coalesce(string_agg(to_jsonb(w)::text, ',' order by w.id::text), '')) from public.words w where w.unit_id not in (select id from _del))
  );

  for v_t in select unnest(array['student_progress','student_daily_progress','word_status','xp_ledger','word_king_history','daily_assignments']) loop
    if to_regclass('public.' || v_t) is null then continue; end if;
    execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) from public.%I t', v_t) into v_fp;
    insert into _fp_after values ('tbl:' || v_t, v_fp);
  end loop;

  insert into _fp_after values (
    'classes:all', (select md5(coalesce(string_agg(to_jsonb(c)::text, ',' order by c.id::text), '')) from public.classes c)
  );
  insert into _fp_after values (
    'textbooks:all', (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id::text), '')) from public.textbooks t)
  );

  if to_regclass('public.class_textbooks') is not null then
    insert into _fp_after values (
      'class_textbooks:all',
      (select md5(coalesce(string_agg(to_jsonb(ct)::text, ',' order by to_jsonb(ct)::text), '')) from public.class_textbooks ct)
    );
  end if;

  for v_rec in
    select b.k as k, b.v as v_before, f.v as v_after from _fp_before b join _fp_after f on f.k = b.k
     where b.k not like 'count:%'
  loop
    if v_rec.v_before is distinct from v_rec.v_after then
      raise exception 'STEP4 fingerprint 불일치: %', v_rec.k;
    end if;
  end loop;

  select v::int into v_students_before from _fp_before where k = 'count:students';
  select v::int into v_sca_before from _fp_before where k = 'count:sca';
  select v::int into v_units_before from _fp_before where k = 'count:units';
  select v::int into v_words_before from _fp_before where k = 'count:words';

  select count(*) into v_students_after from public.students;
  select count(*) into v_sca_after from public.student_class_assignments;
  select count(*) into v_units_after from public.units;
  select count(*) into v_words_after from public.words;

  if v_students_after <> v_students_before then
    raise exception 'STEP4 students 총 건수 변경됨 (% -> %)', v_students_before, v_students_after;
  end if;
  if v_sca_after <> v_sca_before then
    raise exception 'STEP4 SCA 총 건수 변경됨 (% -> %)', v_sca_before, v_sca_after;
  end if;
  if v_units_after <> v_units_before - 6 then
    raise exception 'STEP4 units 총 건수가 정확히 6 감소하지 않음 (% -> %)', v_units_before, v_units_after;
  end if;
  if v_words_after <> v_words_before - 6 then
    raise exception 'STEP4 words 총 건수가 정확히 6 감소하지 않음 (% -> %)', v_words_before, v_words_after;
  end if;

  select count(*) into v_n
    from public.student_progress p, jsonb_object_keys(case when jsonb_typeof(p.progress_data->'lastWordIndexByUnit') = 'object' then p.progress_data->'lastWordIndexByUnit' else '{}'::jsonb end) k
   where k in (select id::text from _del);
  if v_n <> 7 then
    raise exception 'STEP4 progress blob 유령 유닛 키 참조 % (7 과 불일치 — 학습 기록이 변형됨)', v_n;
  end if;

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

  raise notice 'v3_44 OK — 유령 유닛 6 삭제(53e380c7 HOLD), 학습기록 무접촉, 백업 backup_v3_44_units/words';
end $$;

commit;
-- EOF-MARKER supabase_v3_44_ghost_units_delete
