-- unit_naming 03_migration.sql — UPDATE 전용(삭제/INSERT 없음), 트랜잭션+가드.
-- ★ 01_precheck 전부 PASS + 02_backup CSV 저장 후에만 운영자가 수동 실행.
-- 가드 위반 시 raise exception → 트랜잭션 전체 자동 롤백(부분 적용 없음).

begin;

-- 매핑을 임시 테이블로(트랜잭션 안에서만 존재 — on commit drop, DDL이지만
-- temp 객체라 스키마 무영향).
create temporary table _unit_renames(unit_id uuid, old_name text, new_name text) on commit drop;
insert into _unit_renames values
  ('e402499b-e2c7-4c93-a35b-e2b8f3449048', 'Unit1',  'Unit 1'),
  ('5d9db813-3fc9-45fd-8fe5-bc5e369f1eba', 'Unit1',  'Unit 1'),
  ('4488e97a-4ad3-4a44-8560-a45b8746c796', 'Unit1',  'Unit 1'),
  ('407dee3e-7aed-40af-afcb-fa8c7ad8b717', 'Unit10', 'Unit 10'),
  ('adbccbb3-862b-43df-84ba-dde20c2ae186', 'Unit2',  'Unit 2'),
  ('e06226c1-63c8-495c-97d5-c96a3d834d8d', 'Unit2',  'Unit 2'),
  ('052d0326-db84-4ed5-b6a5-17d81c3edd36', 'Unit2',  'Unit 2'),
  ('6ec4b139-6eb1-431b-be67-6f6bb4fc36b4', 'Unit3',  'Unit 3'),
  ('ba173837-7711-407c-bc24-f38e1ac5eba5', 'Unit3',  'Unit 3'),
  ('e74c2247-4ee5-42f9-bb9d-575698e8127a', 'Unit6',  'Unit 6'),
  ('3b4a003d-7b71-4c14-a65f-864d5abf81ba', 'Unit6',  'Unit 6'),
  ('4fe5a398-7352-415c-b92f-572fc2ecfef9', 'Unit6',  'Unit 6'),
  ('e35c4acd-080a-414f-9af9-ad1be7b5dc48', 'Unit7',  'Unit 7'),
  ('a54e1d31-99ea-49dc-b6e5-22e134e2b33d', 'Unit8',  'Unit 8'),
  ('0755e971-a6b2-4a7f-b83f-3b20d9e5ceb4', 'Unit9',  'Unit 9');

-- 가드 1: (id, old_name) 15건 전부 현재 DB와 일치(예상 count와 다르면 중단).
do $$
declare n int;
begin
  select count(*) into n from _unit_renames r join units u on u.id = r.unit_id and u.name = r.old_name;
  if n <> 15 then
    raise exception '[가드1] 매핑 일치 %/15 — 상태가 예상과 다름(이미 적용됐거나 변경됨). 중단(자동 롤백)', n;
  end if;
end $$;

-- 가드 2: rename 후 같은 교재 내 이름 충돌 0 재확인.
do $$
declare n int;
begin
  select count(*) into n
  from _unit_renames r
  join units u on u.id = r.unit_id
  join units other on other.textbook_id = u.textbook_id and other.id <> u.id and other.name = r.new_name;
  if n > 0 then
    raise exception '[가드2] rename 후 이름 충돌 %건 — 중단(자동 롤백)', n;
  end if;
end $$;

-- STEP 1: units.name rename (id 기준 15건).
update units u
set name = r.new_name
from _unit_renames r
where u.id = r.unit_id;

-- STEP 2: students.unit_name 문자열 캐시 동기화 — current_unit_id가 rename
-- 대상인 학생만(표시 일관성). current_unit_id null 학생의 문자열은 무접촉.
update students s
set unit_name = r.new_name
from _unit_renames r
where s.current_unit_id = r.unit_id;

-- 가드 3(사후): 대상 15개 유닛이 전부 새 이름이 됐는지.
do $$
declare n int;
begin
  select count(*) into n from _unit_renames r join units u on u.id = r.unit_id and u.name = r.new_name;
  if n <> 15 then
    raise exception '[가드3] rename 결과 %/15 — 중단(자동 롤백)', n;
  end if;
end $$;

commit;

-- 실행 후 04_verify.sql로 검증. 앱 쪽 재검증: npm run verify:student && npm run verify:admin
