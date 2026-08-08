-- supabase_v3_30_unit_cleanup_repoint_delete.sql
-- ============================================================================
-- ★★★ 아직 실행 금지 — 운영자 명시 승인 전 (2026-08-09 기준 미실행) ★★★
--
-- Unit 구조 정리 STEP 2~5 — 포인터 이전(UPDATE) + 빈 유닛 삭제(DELETE).
-- 반드시 supabase_v3_29_unit_cleanup_step1_backup_precheck.sql 을 먼저 실행해
-- §1 백업 결과(CSV)를 보관하고 §2 사전검증이 전부 PASS인 것을 확인한 뒤,
-- 운영자가 Supabase 대시보드 SQL Editor에서 수동으로 실행한다(규칙 8).
--
-- 무엇을 하는가(전부 아래 begin~commit 한 트랜잭션):
--   [가드]  실행 시점에 사전조건을 다시 검증 — 하나라도 어긋나면
--           raise exception으로 트랜잭션 전체가 자동 롤백된다(부분 적용 없음).
--   [STEP2] canonical이 확정된 빈 유닛 4개를 가리키는 students.current_unit_id
--           / student_class_assignments.current_unit_id 를 같은 교재의
--           canonical 유닛으로 UPDATE (포인터 4->4 이전, 행 삭제 없음).
--   [STEP3] 이전 후 참조 잔존 0 재확인(가드).
--   [STEP5] 참조 0이 확정된 빈 유닛 5개(확정 4 + 고아 1)만 id 명시 DELETE.
--
-- 하지 않는 것(보존 확약):
--   - students/PIN(pin_*)/classes/숙제(daily_assignments)/student_progress/
--     별/word_status/학습·시험기록/SCA 행/examples/words 는 어떤 행도
--     삭제·변경하지 않는다. 변경되는 것은 위 두 컬럼의 "빈 유닛 -> canonical
--     유닛" 포인터 값뿐이고, 삭제되는 것은 데이터 0인 유닛 행 5개뿐이다.
--   - students.unit_name(표시용 문자열)은 건드리지 않는다 — 화면 표시는
--     current_unit_id 우선(resolveStudentUnitObj), 문자열은 폴백일 뿐이며
--     이름 rename(STEP 6)은 운영자가 과 번호 확정 후 별도 작업.
--   - UNKNOWN 2개(김기택 e4804821-…, 박준원 67c8268e-…의 빈 "Unit 1")는
--     이 파일 어디에도 등장하지 않는다 — canonical 확정 불가(그 교재들의
--     단어 유닛이 Unit 4/5/6 등뿐이라 어느 과가 1과인지 DB 근거 없음).
--     황성연(김기택 빈 Unit 1, 비primary SCA)도 같은 이유로 이동하지 않는다.
--
-- 매핑(2026-08-09 감사 + 라이브 실측 UUID — v3_29 §1-2와 동일):
--   419e9fd0-ca9c-46c9-a971-cfebf06ad917 (천재 "Unit 1" 빈)
--     -> 4fe5a398-7352-415c-b92f-572fc2ecfef9 (천재 "Unit6", 유일 단어 유닛)
--   8a34adf4-252e-405b-9068-ea6c65373e07 (민병천 "Unit 1" 빈)
--     -> e402499b-e2c7-4c93-a35b-e2b8f3449048 (민병천 "Unit1", 정규화 동명)
--   2ebdf73f-7a97-4cb2-b734-8a1d95466c1a (중1동아 "Unit 1" 빈)
--     -> 5d9db813-3fc9-45fd-8fe5-bc5e369f1eba (중1동아 "Unit1", 정규화 동명)
--   c620055c-90ce-4766-b054-b32ad90e5325 (중2동아 "Unit 1" 빈)
--     -> 4488e97a-4ad3-4a44-8560-a45b8746c796 (중2동아 "Unit1", 정규화 동명)
--   4a1cd04c-5e96-44dd-a501-30a8dd890153 (교재 연결 없는 고아 "Unit 1")
--     -> 이전 없음(참조 0 확인 후 삭제만)
--
-- 롤백: 실행 전 원본은 v3_29 §1 CSV. 트랜잭션 중 실패는 자동 전체 롤백.
--   커밋 후 되돌리려면 CSV의 units_snapshot으로 유닛 행 5개를 재INSERT하고
--   students/sca_pointer_snapshot 값으로 두 컬럼을 역UPDATE하면 된다
--   (모든 행이 id 기준이라 복원 순서 무관).
-- ============================================================================

begin;

-- ── 가드 1: 정리 대상 5개 유닛에 단어/예문이 여전히 0인지 ──────────────────
do $$
declare n int;
begin
  select count(*) into n from words where unit_id in (
    '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
    '8a34adf4-252e-405b-9068-ea6c65373e07',
    '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
    'c620055c-90ce-4766-b054-b32ad90e5325',
    '4a1cd04c-5e96-44dd-a501-30a8dd890153');
  if n > 0 then
    raise exception '[가드1] 정리 대상 유닛에 단어 %개 존재 — 감사 이후 상태 변경, 중단(자동 롤백)', n;
  end if;
  select count(*) into n from examples where unit_id in (
    '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
    '8a34adf4-252e-405b-9068-ea6c65373e07',
    '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
    'c620055c-90ce-4766-b054-b32ad90e5325',
    '4a1cd04c-5e96-44dd-a501-30a8dd890153');
  if n > 0 then
    raise exception '[가드1] 정리 대상 유닛에 예문 %개 존재 — 중단(자동 롤백)', n;
  end if;
end $$;

-- ── 가드 2: canonical 4개가 실존하고 각각 단어를 보유하는지 ────────────────
do $$
declare n int;
begin
  select count(distinct unit_id) into n from words where unit_id in (
    '4fe5a398-7352-415c-b92f-572fc2ecfef9',
    'e402499b-e2c7-4c93-a35b-e2b8f3449048',
    '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba',
    '4488e97a-4ad3-4a44-8560-a45b8746c796');
  if n <> 4 then
    raise exception '[가드2] canonical 유닛 4개 중 %개만 단어 보유 — 중단(자동 롤백)', n;
  end if;
end $$;

-- ── 가드 3: 확정 4개 유닛을 current_unit_id로 쓰는 "실학생"이 0명인지 ──────
--   (archive(_DUP/_INACTIVE)/QA 계정만 이동 대상이라는 감사 전제 재검증.
--    SCA 쪽 실학생 2명(Irene/김가윤)은 canonical 확정 교재라 이동에 포함 —
--    students.current_unit_id 쪽만 0명 전제를 강제한다.)
do $$
declare n int;
begin
  select count(*) into n from students
  where current_unit_id in (
    '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
    '8a34adf4-252e-405b-9068-ea6c65373e07',
    '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
    'c620055c-90ce-4766-b054-b32ad90e5325')
    and name !~* '(_dup|_inactive)'
    and name !~* '^_?qa_';
  if n > 0 then
    raise exception '[가드3] 빈 유닛을 current_unit으로 쓰는 실학생 %명 발견 — 그 학생 처리 결정 전 중단(자동 롤백)', n;
  end if;
end $$;

-- ── STEP 2: 포인터 이전 (행 삭제 없음, 두 컬럼 UPDATE만) ───────────────────
update students set current_unit_id = '4fe5a398-7352-415c-b92f-572fc2ecfef9'
  where current_unit_id = '419e9fd0-ca9c-46c9-a971-cfebf06ad917';
update students set current_unit_id = 'e402499b-e2c7-4c93-a35b-e2b8f3449048'
  where current_unit_id = '8a34adf4-252e-405b-9068-ea6c65373e07';
update students set current_unit_id = '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba'
  where current_unit_id = '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a';
update students set current_unit_id = '4488e97a-4ad3-4a44-8560-a45b8746c796'
  where current_unit_id = 'c620055c-90ce-4766-b054-b32ad90e5325';

update student_class_assignments set current_unit_id = '4fe5a398-7352-415c-b92f-572fc2ecfef9'
  where current_unit_id = '419e9fd0-ca9c-46c9-a971-cfebf06ad917';
update student_class_assignments set current_unit_id = 'e402499b-e2c7-4c93-a35b-e2b8f3449048'
  where current_unit_id = '8a34adf4-252e-405b-9068-ea6c65373e07';
update student_class_assignments set current_unit_id = '5d9db813-3fc9-45fd-8fe5-bc5e369f1eba'
  where current_unit_id = '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a';
update student_class_assignments set current_unit_id = '4488e97a-4ad3-4a44-8560-a45b8746c796'
  where current_unit_id = 'c620055c-90ce-4766-b054-b32ad90e5325';

-- ── STEP 3(가드 4): 이전 후 삭제 대상 5개를 참조하는 행이 0인지 ────────────
do $$
declare n int;
begin
  select (select count(*) from students where current_unit_id in (
            '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
            '8a34adf4-252e-405b-9068-ea6c65373e07',
            '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
            'c620055c-90ce-4766-b054-b32ad90e5325',
            '4a1cd04c-5e96-44dd-a501-30a8dd890153'))
       + (select count(*) from student_class_assignments where current_unit_id in (
            '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
            '8a34adf4-252e-405b-9068-ea6c65373e07',
            '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
            'c620055c-90ce-4766-b054-b32ad90e5325',
            '4a1cd04c-5e96-44dd-a501-30a8dd890153'))
    into n;
  if n > 0 then
    raise exception '[가드4] 이전 후에도 잔존 참조 %건 — 삭제 진행 불가, 중단(자동 롤백)', n;
  end if;
end $$;

-- ── STEP 5: 참조 0이 확정된 빈 유닛 5개만 id 명시 삭제 ─────────────────────
--   (UNKNOWN 2개 — e4804821-…, 67c8268e-… — 는 목록에 없음, 절대 삭제 금지)
delete from units where id in (
  '419e9fd0-ca9c-46c9-a971-cfebf06ad917',
  '8a34adf4-252e-405b-9068-ea6c65373e07',
  '2ebdf73f-7a97-4cb2-b734-8a1d95466c1a',
  'c620055c-90ce-4766-b054-b32ad90e5325',
  '4a1cd04c-5e96-44dd-a501-30a8dd890153'
);

commit;

-- 실행 후: v3_29의 §1-5(global_invariants)를 다시 실행해 units_total만
-- 정확히 5 줄고(34→29) 나머지 수치가 전부 동일한지 확인한다. 이어서
-- npm run verify:student / verify:admin / verify:unit + 실기기 로그인·학습
-- 화면 확인(STEP 7). 결과는 handoff.md에 기록.
