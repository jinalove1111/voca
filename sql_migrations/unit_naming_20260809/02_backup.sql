-- unit_naming 02_backup.sql — 100% SELECT 전용. 결과를 CSV로 저장(롤백 원본).

-- 2-1. rename 대상 유닛 15행의 현재 전체 행
select 'units_before' as backup_section, u.*
from units u
where u.id in (
  'e402499b-e2c7-4c93-a35b-e2b8f3449048', '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba',
  '4488e97a-4ad3-4a44-8560-a45b8746c796', '407dee3e-7aed-40af-afcb-fa8c7ad8b717',
  'adbccbb3-862b-43df-84ba-dde20c2ae186', 'e06226c1-63c8-495c-97d5-c96a3d834d8d',
  '052d0326-db84-4ed5-b6a5-17d81c3edd36', '6ec4b139-6eb1-431b-be67-6f6bb4fc36b4',
  'ba173837-7711-407c-bc24-f38e1ac5eba5', 'e74c2247-4ee5-42f9-bb9d-575698e8127a',
  '3b4a003d-7b71-4c14-a65f-864d5abf81ba', '4fe5a398-7352-415c-b92f-572fc2ecfef9',
  'e35c4acd-080a-414f-9af9-ad1be7b5dc48', 'a54e1d31-99ea-49dc-b6e5-22e134e2b33d',
  '0755e971-a6b2-4a7f-b83f-3b20d9e5ceb4'
);

-- 2-2. unit_name 문자열이 동기화될 학생들의 변경 전 값(id + 문자열만 — PIN 무접촉)
select 'students_unit_name_before' as backup_section,
       s.id, s.name, s.unit_name, s.current_unit_id
from students s
where s.current_unit_id in (
  'e402499b-e2c7-4c93-a35b-e2b8f3449048', '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba',
  '4488e97a-4ad3-4a44-8560-a45b8746c796', '407dee3e-7aed-40af-afcb-fa8c7ad8b717',
  'adbccbb3-862b-43df-84ba-dde20c2ae186', 'e06226c1-63c8-495c-97d5-c96a3d834d8d',
  '052d0326-db84-4ed5-b6a5-17d81c3edd36', '6ec4b139-6eb1-431b-be67-6f6bb4fc36b4',
  'ba173837-7711-407c-bc24-f38e1ac5eba5', 'e74c2247-4ee5-42f9-bb9d-575698e8127a',
  '3b4a003d-7b71-4c14-a65f-864d5abf81ba', '4fe5a398-7352-415c-b92f-572fc2ecfef9',
  'e35c4acd-080a-414f-9af9-ad1be7b5dc48', 'a54e1d31-99ea-49dc-b6e5-22e134e2b33d',
  '0755e971-a6b2-4a7f-b83f-3b20d9e5ceb4'
);

-- 2-3. 전역 불변식(03 전후 비교용 — 03은 어떤 행도 추가/삭제하지 않아야 함)
select 'global_invariants' as backup_section,
       (select count(*) from units)  as units_total,
       (select count(*) from words)  as words_total,
       (select count(*) from students) as students_total,
       (select count(*) from word_status) as word_status_total,
       (select count(*) from student_progress) as progress_total,
       (select count(*) from student_class_assignments) as sca_total,
       (select count(*) from examples) as examples_total;
