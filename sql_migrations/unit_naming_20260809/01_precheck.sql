-- unit_naming 01_precheck.sql — 100% SELECT 전용 (2026-08-09 야간 준비)
-- 실행해도 데이터가 변하지 않는다. 모든 check의 pass=true여야 03 진행.

with mapping(unit_id, old_name, new_name) as (values
  ('e402499b-e2c7-4c93-a35b-e2b8f3449048'::uuid, 'Unit1',  'Unit 1'),  -- 고1 능률 민병천
  ('5d9db813-3fc9-45fd-8fe5-bc5e369f1eba'::uuid, 'Unit1',  'Unit 1'),  -- 중1 동아 윤정미
  ('4488e97a-4ad3-4a44-8560-a45b8746c796'::uuid, 'Unit1',  'Unit 1'),  -- 중2 동아 윤정미
  ('407dee3e-7aed-40af-afcb-fa8c7ad8b717'::uuid, 'Unit10', 'Unit 10'), -- 고1 6월 학평
  ('adbccbb3-862b-43df-84ba-dde20c2ae186'::uuid, 'Unit2',  'Unit 2'),  -- Presentation 6 -2026
  ('e06226c1-63c8-495c-97d5-c96a3d834d8d'::uuid, 'Unit2',  'Unit 2'),  -- 중2 YMB 박준원
  ('052d0326-db84-4ed5-b6a5-17d81c3edd36'::uuid, 'Unit2',  'Unit 2'),  -- 고1 능률 민병천
  ('6ec4b139-6eb1-431b-be67-6f6bb4fc36b4'::uuid, 'Unit3',  'Unit 3'),  -- 중2 YMB 박준원
  ('ba173837-7711-407c-bc24-f38e1ac5eba5'::uuid, 'Unit3',  'Unit 3'),  -- 고1 6월 학평
  ('e74c2247-4ee5-42f9-bb9d-575698e8127a'::uuid, 'Unit6',  'Unit 6'),  -- 중2 YMB 박준원
  ('3b4a003d-7b71-4c14-a65f-864d5abf81ba'::uuid, 'Unit6',  'Unit 6'),  -- 고1 6월 학평
  ('4fe5a398-7352-415c-b92f-572fc2ecfef9'::uuid, 'Unit6',  'Unit 6'),  -- 중2 천재 이상기
  ('e35c4acd-080a-414f-9af9-ad1be7b5dc48'::uuid, 'Unit7',  'Unit 7'),  -- 고1 6월 학평
  ('a54e1d31-99ea-49dc-b6e5-22e134e2b33d'::uuid, 'Unit8',  'Unit 8'),  -- Presentation 6 -2026
  ('0755e971-a6b2-4a7f-b83f-3b20d9e5ceb4'::uuid, 'Unit9',  'Unit 9')   -- 고1 6월 학평
)
-- check 1: 매핑 15건 전부 (id, old_name)이 현재 DB와 정확히 일치하는가
select '1: 매핑 15건 id+이름 일치' as check_name,
       count(*) = 15 as pass, count(*) as matched
from mapping m join units u on u.id = m.unit_id and u.name = m.old_name

union all
-- check 2: rename 후 같은 교재 안에 이름 충돌이 없는가
--   (새 이름과 동일한 이름의 "다른" 유닛이 같은 textbook에 이미 존재하면 실패)
select '2: rename 후 교재 내 이름 충돌 0',
       count(*) = 0, count(*)
from mapping m
join units u on u.id = m.unit_id
join units other on other.textbook_id = u.textbook_id
  and other.id <> u.id and other.name = m.new_name

union all
-- check 3: 대상 유닛들의 단어/학생 참조가 살아 있는가(존재 확인 — rename은
--   이들을 변경하지 않지만, 실행 전 상태 기록을 위한 기준값)
select '3: 대상 유닛 참조 현황(기록용 — pass는 항상 true)',
       true, (select count(*) from words w where w.unit_id in (select unit_id from mapping))

union all
-- check 4: current_unit_id가 null이면서 unit_name 문자열이 old_name과 일치하는
--   학생 수(이 학생들의 문자열은 03이 건드리지 않음 — 0이 아니면 운영자 확인)
select '4: 문자열 폴백만으로 old 이름을 쓰는 학생 수(0 권장)',
       count(*) = 0, count(*)
from students s
where s.current_unit_id is null
  and s.unit_name in (select distinct old_name from mapping);

-- 참고 목록(사람 검토용): 위 check 4 해당 학생
select '4-detail' as review, s.id, s.name, s.unit_name, s.class_id
from students s
where s.current_unit_id is null
  and s.unit_name in ('Unit1', 'Unit10', 'Unit2', 'Unit3', 'Unit6', 'Unit7', 'Unit8', 'Unit9');
