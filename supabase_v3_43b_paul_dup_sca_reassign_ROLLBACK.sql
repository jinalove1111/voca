-- supabase_v3_43b_paul_dup_sca_reassign_ROLLBACK.sql
--
-- 목적: supabase_v3_43b_paul_dup_sca_reassign.sql 의 정확한 역연산.
-- Paul_DUP_20260722_INACTIVE(student_id 38717600-f114-4092-abb6-c285e531f2d6)
-- 소유 student_class_assignments 2행의 current_unit_id 를 NULL 에서
-- 각각의 from_unit(1단어 유령 유닛)으로 복원한다.
--
-- 이 롤백은 해당 2행을 다시 1단어 유령 유닛 참조 상태로 되돌린다 —
-- v3_43b 정방향이 잘못됐다고 확인된 경우에만 실행할 것.
--
-- 전제: supabase_v3_44_ghost_units_delete.sql 이 아직 실행되지 않았어야
-- 한다(이 2행의 from_unit 이 units 에 여전히 존재해야 함). 이미 v3_44 가
-- 실행되어 유령 유닛이 삭제된 상태라면 이 파일은 즉시 raise exception 으로
-- 중단하며, 먼저 supabase_v3_44_ghost_units_delete_ROLLBACK.sql 을
-- 실행하라고 안내한다.
--
-- 이 파일이 절대 건드리지 않는 것(헌법 규칙 4/11):
--   - students 테이블(이 파일은 students 를 갱신하지 않는다).
--   - 학습 기록 테이블(student_progress, student_daily_progress,
--     word_status, xp_ledger, word_king_history, daily_assignments) —
--     fingerprint(md5) 비교만 한다.
--   - PIN 관련 컬럼 — fingerprint 계산에서도 명시적으로 제외한다.
--
-- 실행 방법: Supabase 대시보드 SQL Editor 에서 이 파일 전체를 한 번에
-- 실행한다(트랜잭션 1개, 중간에 실패하면 전체 rollback).

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

create temp table _plan (
  sca_id uuid,
  student_id uuid,
  class_id uuid,
  textbook_id uuid,
  is_primary boolean,
  from_unit uuid
) on commit drop;

insert into _plan (sca_id, student_id, class_id, textbook_id, is_primary, from_unit) values
  ('4a7d5dc6-e189-4410-b3dd-dabe4fbd9aac', '38717600-f114-4092-abb6-c285e531f2d6', '9fb1bc3a-4e50-45d6-89ad-81f8b1faf512', '86fdd554-9e8d-4a09-a894-5d05034d3f29', false, '3d1c753e-fc1e-4f54-93d3-8dd0a4898939'),
  ('b392747a-3ae8-43df-8eba-e57911f5916b', '38717600-f114-4092-abb6-c285e531f2d6', 'e09e147b-7a01-4e58-8bfd-d7205ee8b856', '80e8d5dd-a054-4f96-9173-5db981e1fe5b', true,  'e327efc3-5d35-4b9d-b915-20cb77a79120');

create temp table _fp_before (
  k text primary key,
  v text
) on commit drop;

-- STEP1: v3_43b 이 적용된 상태인지 확인 + v3_44 가 실행되지 않았는지 확인
do $$
declare
  v_n int;
  v_rec record;
begin
  select count(*) into v_n from _ghost g join public.units u on u.id = g.id;
  if v_n <> 7 then
    raise exception 'STEP1 유령 유닛이 이미 삭제된 상태 — v3_44 가 이미 실행됨. 먼저 v3_44 ROLLBACK 을 실행하라';
  end if;

  select count(*) into v_n from public.students s
   where s.id = '38717600-f114-4092-abb6-c285e531f2d6' and s.name = 'Paul_DUP_20260722_INACTIVE';
  if v_n <> 1 then
    raise exception 'STEP1 학생 38717600-f114-4092-abb6-c285e531f2d6 이(가) 존재하지 않거나 이름이 Paul_DUP_20260722_INACTIVE 가 아님';
  end if;

  for v_rec in select * from _plan loop
    select count(*) into v_n from public.student_class_assignments a
     where a.id = v_rec.sca_id and a.student_id = v_rec.student_id and a.class_id = v_rec.class_id
       and a.textbook_id = v_rec.textbook_id and a.is_primary = v_rec.is_primary
       and a.current_unit_id is null;
    if v_n <> 1 then
      raise exception 'STEP1 SCA 행 % 이(가) v3_43b 적용 상태가 아님', v_rec.sca_id;
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

  raise notice 'STEP1 OK — v3_43b 적용 상태 확인';
end $$;

-- STEP2: 변경 전 스냅샷/fingerprint
do $$
declare
  v_fp text;
  v_t text;
begin
  insert into _fp_before values (
    'students:all',
    (select md5(coalesce(string_agg((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed')::text, ',' order by s.id::text), ''))
       from public.students s)
  );
  insert into _fp_before values (
    'sca:untargeted',
    (select md5(coalesce(string_agg(to_jsonb(a)::text, ',' order by a.id::text), ''))
       from public.student_class_assignments a where a.id not in (select sca_id from _plan))
  );
  insert into _fp_before values (
    'sca:targeted-minus-cur',
    (select md5(coalesce(string_agg((to_jsonb(a) - 'current_unit_id')::text, ',' order by a.id::text), ''))
       from public.student_class_assignments a where a.id in (select sca_id from _plan))
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

  raise notice 'STEP2 OK — 변경 전 스냅샷 저장';
end $$;

-- STEP3: v3_43b 를 역연산 — 유령 유닛 참조 상태로 복원
do $$
declare
  v_n int;
begin
  update public.student_class_assignments a set current_unit_id = p.from_unit
    from _plan p where a.id = p.sca_id and a.current_unit_id is null;
  get diagnostics v_n = row_count;
  if v_n <> 2 then
    raise exception 'STEP3 SCA UPDATE 영향 행 % (정확히 2 이어야 함)', v_n;
  end if;

  raise notice 'STEP3 OK — Paul_DUP SCA 2건 유령 참조 상태로 복원';
end $$;

-- STEP4: 사후검증 + fingerprint 비교 + 보호 계정 assert
do $$
declare
  v_n int;
  v_fp text;
  v_t text;
  v_rec record;
begin
  select count(*) into v_n from _plan p
    join public.student_class_assignments a on a.id = p.sca_id
   where a.current_unit_id = p.from_unit;
  if v_n <> 2 then
    raise exception 'STEP4 SCA 복원 검증 실패 (% / 2)', v_n;
  end if;

  create temp table _fp_after (
    k text primary key,
    v text
  ) on commit drop;

  insert into _fp_after values (
    'students:all',
    (select md5(coalesce(string_agg((to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until' - 'pin_setup_allowed')::text, ',' order by s.id::text), ''))
       from public.students s)
  );
  insert into _fp_after values (
    'sca:untargeted',
    (select md5(coalesce(string_agg(to_jsonb(a)::text, ',' order by a.id::text), ''))
       from public.student_class_assignments a where a.id not in (select sca_id from _plan))
  );
  insert into _fp_after values (
    'sca:targeted-minus-cur',
    (select md5(coalesce(string_agg((to_jsonb(a) - 'current_unit_id')::text, ',' order by a.id::text), ''))
       from public.student_class_assignments a where a.id in (select sca_id from _plan))
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

  raise notice 'v3_43b ROLLBACK OK — Paul_DUP SCA 2행 유령 참조 상태로 복원';
end $$;

commit;
-- EOF-MARKER supabase_v3_43b_paul_dup_sca_reassign_ROLLBACK
