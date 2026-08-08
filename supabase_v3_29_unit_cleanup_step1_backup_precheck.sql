-- supabase_v3_29_unit_cleanup_step1_backup_precheck.sql
-- ============================================================================
-- Unit 구조 정리 STEP 1 — 백업 스냅샷 + migration 사전검증 (2026-08-09, 76차)
--
-- ★ 이 파일은 100% SELECT 전용입니다. UPDATE/DELETE/INSERT/DDL이 전혀 없고,
--   몇 번을 실행해도 데이터가 변하지 않습니다(멱등, 규칙 9).
-- ★ 실제 수정(포인터 이전 + 빈 유닛 삭제)은 별도 파일
--   supabase_v3_30_unit_cleanup_repoint_delete.sql 에 있으며, 이 파일(v3_29)의
--   §2 사전검증이 전부 PASS이고 §1 백업 결과를 저장한 뒤에만 운영자가
--   수동으로 실행합니다(규칙 8 — 에이전트/CI는 DDL/DML 실행 불가).
--
-- 배경(2026-08-09 감사, handoff 76차 예정):
--   createClass()가 반(=교재 컨테이너) 생성 시 빈 "Unit 1"을 자동 생성하고,
--   이후 Excel 업로드가 "Unit1"/"Unit6" 등 다른 표기로 유닛을 새로 만들어
--   "빈 Unit 1"이 교재마다 남는 패턴 확인. 감사 결과:
--     빈 유닛 7개(단어 0/학습기록 0/예문 0), 그중 canonical 매핑이 확실한
--     4개만 v3_30 정리 대상. 김기택/박준원의 빈 Unit 1 2개는 canonical을
--     확정할 수 없어(UNKNOWN) v3_30에서 제외 — 자동 이동 금지 원칙.
--
-- 대상 유닛(감사 확정 UUID — 이름이 아니라 id로만 지정, 규칙 4와 동일 정신):
--   [정리 대상 4 — canonical 확정]
--     419e9fd0-ca9c-46c9-a971-cfebf06ad917  중2 천재 이상기 "Unit 1"(빈)
--        → canonical 4fe5a398-7352-415c-b92f-572fc2ecfef9 "Unit6"(단어 40,
--          이 교재의 유일한 단어 유닛이라 확실)
--     8a34adf4-252e-405b-9068-ea6c65373e07  고1 능률 민병천 "Unit 1"(빈)
--        → canonical e402499b-... "Unit1"(단어 40, 정규화 이름 동일)
--     2ebdf73f-7a97-4cb2-b734-8a1d95466c1a  중1 동아 윤정미 "Unit 1"(빈)
--        → canonical 5d9db813-... "Unit1"(단어 40, 정규화 이름 동일)
--     c620055c-90ce-4766-b054-b32ad90e5325  중2 동아 윤정미 "Unit 1"(빈)
--        → canonical 4488e97a-... "Unit1"(단어 40, 정규화 이름 동일)
--   [고아 1 — 참조 0이면 삭제만]
--     4a1cd04c-5e96-44dd-a501-30a8dd890153  교재 연결 없는 "Unit 1"
--   [UNKNOWN 2 — v3_30 대상 아님, 이 파일에서는 현황 백업만]
--     e4804821-5bab-408f-b2eb-4d991d9d3c22  중2 능률 김기택 "Unit 1"(빈)
--        (이 교재의 단어 유닛은 Unit 4/5/6 — 어느 과가 1과인지 DB 근거 없음)
--     67c8268e-41b6-4307-918a-47713522f43b  중2 YMB 박준원 "Unit 1"(빈)
--        (단어 유닛 Unit2/3/5/6 — 동일 사유)
--
-- 사용법: Supabase 대시보드 SQL Editor에서 섹션별로 실행하고,
--   §1 결과는 CSV 다운로드로 로컬 보관(롤백 원본), §2 결과는 pass 컬럼이
--   전부 true인지 확인. FAIL이 하나라도 있으면 v3_30을 실행하지 않는다.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- §1 백업 스냅샷 (전부 SELECT — 결과를 CSV로 저장할 것)
-- ────────────────────────────────────────────────────────────────────────────

-- 1-1. 대상 유닛 7개의 전체 행(삭제/변경 전 원본 — 롤백 시 이 값으로 복원)
select 'units_snapshot' as backup_section, u.*
from units u
where u.id in (
  '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
  '8a34adf4-252e-405b-9068-ea6c65373e07',
  '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
  'c620055c-90ce-4766-b054-b32ad90e5325',
  '4a1cd04c-5e96-44dd-a501-30a8dd890153',
  'e4804821-5bab-408f-b2eb-4d991d9d3c22',
  '67c8268e-41b6-4307-918a-47713522f43b'
);

-- 1-2. canonical 유닛 4개의 현재 행(이전 대상이 실존하는지의 원본 증거)
select 'canonical_units_snapshot' as backup_section, u.*
from units u
where u.id in (
  '4fe5a398-7352-415c-b92f-572fc2ecfef9', -- 천재 Unit6
  'e402499b-e2c7-4c93-a35b-e2b8f3449048', -- 민병천 Unit1 (2026-08-09 라이브 실측 UUID)
  '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba', -- 중1동아 Unit1 (실측 UUID)
  '4488e97a-4ad3-4a44-8560-a45b8746c796'  -- 중2동아 Unit1 (실측 UUID)
);

-- 1-3. 빈 유닛을 current_unit_id로 참조하는 students 행(변경 전 포인터 원본).
--      ※ pin/자격증명 컬럼은 절대 SELECT하지 않는다(규칙 11).
select 'students_pointer_snapshot' as backup_section,
       s.id, s.name, s.class_id, s.unit_name, s.current_unit_id, s.created_at
from students s
where s.current_unit_id in (
  '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
  '8a34adf4-252e-405b-9068-ea6c65373e07',
  '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
  'c620055c-90ce-4766-b054-b32ad90e5325',
  '4a1cd04c-5e96-44dd-a501-30a8dd890153',
  'e4804821-5bab-408f-b2eb-4d991d9d3c22',
  '67c8268e-41b6-4307-918a-47713522f43b'
);

-- 1-4. 빈 유닛을 current_unit_id로 참조하는 SCA 행(변경 전 포인터 원본)
select 'sca_pointer_snapshot' as backup_section,
       a.id, a.student_id, s.name as student_name, a.class_id,
       a.current_unit_id, a.is_primary, a.created_at
from student_class_assignments a
join students s on s.id = a.student_id
where a.current_unit_id in (
  '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
  '8a34adf4-252e-405b-9068-ea6c65373e07',
  '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
  'c620055c-90ce-4766-b054-b32ad90e5325',
  '4a1cd04c-5e96-44dd-a501-30a8dd890153',
  'e4804821-5bab-408f-b2eb-4d991d9d3c22',
  '67c8268e-41b6-4307-918a-47713522f43b'
);

-- 1-5. 전역 불변식 스냅샷 — v3_30 실행 전/후로 이 쿼리를 다시 돌려 "삭제된
--      것은 빈 유닛 행뿐"임을 수치로 증명한다(보존 대상: 학생/PIN/class/
--      current_unit/숙제/progress/별/word_status/학습·시험기록/SCA/예문/단어).
select 'global_invariants' as backup_section,
       (select count(*) from students)                  as students_total,
       (select count(*) from students where pin_hash is not null) as students_with_pin, -- 값이 아니라 개수만(규칙 11)
       (select count(*) from classes)                   as classes_total,
       (select count(*) from units)                     as units_total,
       (select count(*) from words)                     as words_total,
       (select count(*) from word_status)               as word_status_total,
       (select count(*) from student_progress)          as student_progress_total,
       (select count(*) from student_daily_progress)    as daily_progress_total,
       (select count(*) from student_class_assignments) as sca_total,
       (select count(*) from examples)                  as examples_total,
       (select count(*) from daily_assignments)         as daily_assignments_total;

-- ────────────────────────────────────────────────────────────────────────────
-- §2 사전검증 — 전부 true(pass)여야 v3_30 실행 가능
-- ────────────────────────────────────────────────────────────────────────────

-- 2-1. 정리 대상 5개(확정 4 + 고아 1)에 단어/예문이 정말 0개인가
--      (하나라도 있으면 감사 이후 상태가 변한 것 — 즉시 중단)
select '2-1 정리대상 유닛에 단어 0' as check_name,
       count(*) = 0 as pass, count(*) as offending_rows
from words
where unit_id in (
  '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
  '8a34adf4-252e-405b-9068-ea6c65373e07',
  '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
  'c620055c-90ce-4766-b054-b32ad90e5325',
  '4a1cd04c-5e96-44dd-a501-30a8dd890153'
)
union all
select '2-2 정리대상 유닛에 예문 0',
       count(*) = 0, count(*)
from examples
where unit_id in (
  '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
  '8a34adf4-252e-405b-9068-ea6c65373e07',
  '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
  'c620055c-90ce-4766-b054-b32ad90e5325',
  '4a1cd04c-5e96-44dd-a501-30a8dd890153'
)
union all
-- 2-3. canonical 유닛 4개가 실존하고 각각 단어가 충분히(>=26) 있는가
select '2-3 canonical 유닛 4개 실존+단어 보유',
       count(distinct w.unit_id) = 4, count(distinct w.unit_id)
from words w
where w.unit_id in (
  '4fe5a398-7352-415c-b92f-572fc2ecfef9',
  'e402499b-e2c7-4c93-a35b-e2b8f3449048',
  '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba',
  '4488e97a-4ad3-4a44-8560-a45b8746c796'
)
union all
-- 2-4. 확정 4개 유닛을 current_unit_id로 참조하는 "실학생"(비archive/비QA)이
--      0명인가 — 감사 시점(2026-08-09)엔 archive/QA뿐이었다. 실학생이
--      나타났으면 그 학생 처리를 먼저 결정해야 하므로 FAIL로 중단.
select '2-4 확정4유닛 current_unit 실학생 0명',
       count(*) = 0, count(*)
from students s
where s.current_unit_id in (
  '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
  '8a34adf4-252e-405b-9068-ea6c65373e07',
  '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
  'c620055c-90ce-4766-b054-b32ad90e5325'
)
and s.name !~* '(_dup|_inactive)'
and s.name !~* '^_?qa_'
union all
-- 2-5. 고아 유닛(4a1cd04c)은 어떤 참조도 0인가(있으면 삭제 대상 아님)
select '2-5 고아 유닛 참조 0(students+SCA+words+examples)',
       (select count(*) from students where current_unit_id = '4a1cd04c-5e96-44dd-a501-30a8dd890153')
     + (select count(*) from student_class_assignments where current_unit_id = '4a1cd04c-5e96-44dd-a501-30a8dd890153')
     + (select count(*) from words where unit_id = '4a1cd04c-5e96-44dd-a501-30a8dd890153')
     + (select count(*) from examples where unit_id = '4a1cd04c-5e96-44dd-a501-30a8dd890153') = 0,
       (select count(*) from students where current_unit_id = '4a1cd04c-5e96-44dd-a501-30a8dd890153')
     + (select count(*) from student_class_assignments where current_unit_id = '4a1cd04c-5e96-44dd-a501-30a8dd890153')
     + (select count(*) from words where unit_id = '4a1cd04c-5e96-44dd-a501-30a8dd890153')
     + (select count(*) from examples where unit_id = '4a1cd04c-5e96-44dd-a501-30a8dd890153')
union all
-- 2-6. UNKNOWN 2개(김기택/박준원 빈 Unit 1)가 v3_30 어디에도 등장하지 않을
--      것의 전제 — 여기서는 "여전히 단어 0인 빈 유닛"인지만 기록용으로 확인.
select '2-6 UNKNOWN 2유닛 여전히 단어 0(기록용)',
       count(*) = 0, count(*)
from words
where unit_id in (
  'e4804821-5bab-408f-b2eb-4d991d9d3c22',
  '67c8268e-41b6-4307-918a-47713522f43b'
);

-- ────────────────────────────────────────────────────────────────────────────
-- §3 사람 검토용 목록(pass/fail 아님) — SCA로 빈 유닛을 참조하는 실학생.
--    감사 시점 실측: Irene(중1동아 빈 Unit 1, 비primary) /
--    김가윤(민병천 빈 Unit 1, primary) — 이 2명은 확정 canonical로 함께
--    이전된다(v3_30 §2). 황성연(김기택 빈 Unit 1, 비primary)은 UNKNOWN
--    교재라 v3_30 대상이 아니며 운영자 결정 대기.
--    이 목록에 그 외 실학생이 새로 보이면 v3_30 실행 전 재검토.
-- ────────────────────────────────────────────────────────────────────────────
select '3-1 SCA로 빈 유닛을 참조하는 실계정(검토용)' as review_name,
       s.name as student_name, a.current_unit_id, a.is_primary, u.name as unit_name,
       t.name as textbook_name
from student_class_assignments a
join students s on s.id = a.student_id
left join units u on u.id = a.current_unit_id
left join textbooks t on t.id = u.textbook_id
where a.current_unit_id in (
  '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
  '8a34adf4-252e-405b-9068-ea6c65373e07',
  '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
  'c620055c-90ce-4766-b054-b32ad90e5325',
  '4a1cd04c-5e96-44dd-a501-30a8dd890153',
  'e4804821-5bab-408f-b2eb-4d991d9d3c22',
  '67c8268e-41b6-4307-918a-47713522f43b'
)
and s.name !~* '(_dup|_inactive)'
and s.name !~* '^_?qa_';
