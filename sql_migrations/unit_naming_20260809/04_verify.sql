-- unit_naming 04_verify.sql — 100% SELECT 전용. 03 실행 후 검증.

with mapping(unit_id, old_name, new_name) as (values
  ('e402499b-e2c7-4c93-a35b-e2b8f3449048'::uuid, 'Unit1',  'Unit 1'),
  ('5d9db813-3fc9-45fd-8fe5-bc5e369f1eba'::uuid, 'Unit1',  'Unit 1'),
  ('4488e97a-4ad3-4a44-8560-a45b8746c796'::uuid, 'Unit1',  'Unit 1'),
  ('407dee3e-7aed-40af-afcb-fa8c7ad8b717'::uuid, 'Unit10', 'Unit 10'),
  ('adbccbb3-862b-43df-84ba-dde20c2ae186'::uuid, 'Unit2',  'Unit 2'),
  ('e06226c1-63c8-495c-97d5-c96a3d834d8d'::uuid, 'Unit2',  'Unit 2'),
  ('052d0326-db84-4ed5-b6a5-17d81c3edd36'::uuid, 'Unit2',  'Unit 2'),
  ('6ec4b139-6eb1-431b-be67-6f6bb4fc36b4'::uuid, 'Unit3',  'Unit 3'),
  ('ba173837-7711-407c-bc24-f38e1ac5eba5'::uuid, 'Unit3',  'Unit 3'),
  ('e74c2247-4ee5-42f9-bb9d-575698e8127a'::uuid, 'Unit6',  'Unit 6'),
  ('3b4a003d-7b71-4c14-a65f-864d5abf81ba'::uuid, 'Unit6',  'Unit 6'),
  ('4fe5a398-7352-415c-b92f-572fc2ecfef9'::uuid, 'Unit6',  'Unit 6'),
  ('e35c4acd-080a-414f-9af9-ad1be7b5dc48'::uuid, 'Unit7',  'Unit 7'),
  ('a54e1d31-99ea-49dc-b6e5-22e134e2b33d'::uuid, 'Unit8',  'Unit 8'),
  ('0755e971-a6b2-4a7f-b83f-3b20d9e5ceb4'::uuid, 'Unit9',  'Unit 9')
)
select '1: 15건 전부 새 이름 적용' as check_name,
       count(*) = 15 as pass, count(*) as ok_rows
from mapping m join units u on u.id = m.unit_id and u.name = m.new_name

union all
select '2: 공백 없는 UnitN 표기 잔존 0(교재 연결 유닛 전체)',
       count(*) = 0, count(*)
from units where textbook_id is not null and name ~ '^[Uu]nit[0-9]+$'

union all
select '3: rename 유닛을 가리키는 학생의 unit_name 문자열 동기화 완료',
       count(*) = 0, count(*)
from students s join mapping m on s.current_unit_id = m.unit_id
where s.unit_name is distinct from m.new_name

union all
select '4: 같은 교재 내 이름 중복 0',
       count(*) = 0, count(*)
from units a join units b
  on a.textbook_id = b.textbook_id and a.id < b.id and a.name = b.name
where a.textbook_id is not null;

-- 전역 불변식 재확인(02_backup의 global_invariants와 전부 동일해야 함 —
-- 03은 행을 추가/삭제하지 않음):
select 'global_invariants_after' as backup_section,
       (select count(*) from units)  as units_total,
       (select count(*) from words)  as words_total,
       (select count(*) from students) as students_total,
       (select count(*) from word_status) as word_status_total,
       (select count(*) from student_progress) as progress_total,
       (select count(*) from student_class_assignments) as sca_total,
       (select count(*) from examples) as examples_total;
