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
-- [2026-08-09 재조사 반영 — v3_29 §3-1 실학생 3명(Irene/황성연/김가윤) 판정]
--   운영 정보: 김가윤(Joy)/황성연(Colin)은 최근 MS Advanced Class로 반 이동.
--   반 이동 전 학습기록(word_status/progress/일별기록)은 이 파일이 전혀
--   건드리지 않으며(SCA/students의 current_unit_id 포인터 값만 변경),
--   과거 기록은 이전 반·교재 기준 그대로 보존된다.
--   · Irene: SCA(중1동아, 비primary)가 빈 Unit 1 참조 — canonical은 그 교재의
--     유일한 단어 유닛 Unit1(5d9db813)로 확정(HIGH). 아래 일괄 UPDATE가 커버.
--   · 김가윤: 유일한 SCA(2026-08-05 생성, 반=이동 전 실반 Presentation 6,
--     primary)가 민병천 "빈" Unit 1(8a34adf4)을 참조. 본인 students.
--     current_unit_id는 이미 민병천 "실" Unit1(e402499b, 단어 40)이고
--     08-05~06 일별 학습 진행(별 153) — 같은 교재의 실유닛으로 포인터만
--     어긋난 상태(HIGH). 아래 8a34adf4→e402499b 일괄 UPDATE가 정확히 커버.
--     ※ 이 SCA의 class_id(이동 전 반)는 이 파일 범위 밖 — 변경하지 않는다.
--   · 황성연: SCA(김기택, 비primary, 2026-07-20 생성)가 김기택 빈 Unit 1
--     (e4804821)을 참조. 본인 학습기록 22건 전부 김기택 "Unit 6"(a437b6c9,
--     2026-07-20~08-05) — 행동 근거는 Unit 6 하나를 가리키지만, 김기택
--     교재는 UNKNOWN(1과 근거 없음) 범위라 이 파일의 필수 단계에 넣지 않고
--     하단 [선택 블록]에 주석으로만 준비한다(운영자 승인 시 주석 해제).
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

-- ────────────────────────────────────────────────────────────────────────────
-- [선택 블록 — 기본 주석 처리, 운영자 명시 승인 시에만 주석 해제 후 별도 실행]
-- 황성연(Colin)의 김기택 SCA(id b4c31361-…) 포인터를 빈 Unit 1(e4804821)에서
-- 본인이 실제 학습한 "Unit 6"(a437b6c9, word_status 22건 전부 이 유닛,
-- 2026-07-20~08-05)으로 이전. 김기택 교재의 과 번호는 UNKNOWN이지만 이
-- 1행은 이름 추정이 아니라 본인 행동 기록 기반이라 별도 승인 대상으로 둔다.
-- 실행해도 김기택 빈 Unit 1 유닛 행 자체는 삭제하지 않는다(다른 archive/QA
-- 참조가 남아 있고, 과 번호 확정 전 유닛 정리는 보류).
--
-- update student_class_assignments
--   set current_unit_id = 'a437b6c9-74ff-4ee4-8447-7a9f7ae4f5a7' -- 김기택 "Unit 6"(2026-08-09 라이브 실측 UUID, 아래 검증 쿼리로 재확인 가능)
--   where id = (select a.id from student_class_assignments a
--               join students s on s.id = a.student_id
--               where s.id = '2a86fc9b-510a-4db1-a18d-598a360e142b'
--                 and a.current_unit_id = 'e4804821-5bab-408f-b2eb-4d991d9d3c22');
--
-- 위 Unit 6 UUID 검증(SELECT 전용): 단어 40개짜리 김기택 "Unit 6" id 확인
-- select u.id, u.name, count(w.id) as words
-- from units u left join words w on w.unit_id = u.id
-- where u.textbook_id = '86fdd554-9e8d-4a09-a894-5d05034d3f29' and u.name = 'Unit 6'
-- group by u.id, u.name;
-- ────────────────────────────────────────────────────────────────────────────

-- 실행 후: v3_29의 §1-5(global_invariants)를 다시 실행해 units_total만
-- 정확히 5 줄고(34→29) 나머지 수치가 전부 동일한지 확인한다. 이어서
-- npm run verify:student / verify:admin / verify:unit + 실기기 로그인·학습
-- 화면 확인(STEP 7). 결과는 handoff.md에 기록.
