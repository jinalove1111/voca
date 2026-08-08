-- unit_naming 05_rollback.sql — 03의 역방향(UPDATE 전용). 문제 발생 시에만.
-- 03과 같은 가드 구조: 예상 상태(15건 전부 새 이름)가 아니면 중단.

begin;

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

-- 가드: 15건 전부 "새 이름" 상태여야 롤백 가능(예상과 다르면 중단).
do $$
declare n int;
begin
  select count(*) into n from _unit_renames r join units u on u.id = r.unit_id and u.name = r.new_name;
  if n <> 15 then
    raise exception '[롤백 가드] 새 이름 상태 %/15 — 03이 완전 적용된 상태가 아님. 중단(자동 롤백)', n;
  end if;
end $$;

-- 역방향 rename.
update units u
set name = r.old_name
from _unit_renames r
where u.id = r.unit_id;

-- students.unit_name 역동기화(03 STEP 2의 역).
update students s
set unit_name = r.old_name
from _unit_renames r
where s.current_unit_id = r.unit_id;

commit;

-- 롤백 후 01_precheck.sql을 다시 돌리면 check 1이 pass=true(원상)여야 한다.
