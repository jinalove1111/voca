-- v3.46 — "중2 천재 이상기" 교재/반 이름을 실제 학년에 맞게 "중1 천재
-- 이상기"로 정정 (2026-09-03, 운영자 지시 대기 — 미실행)
--
-- ── 배경 ────────────────────────────────────────────────────────────────
-- textbooks.id=80e8d5dd-a054-4f96-9173-5db981e1fe5b 와 그 소유 컨테이너
-- classes.id=e09e147b-7a01-4e58-8bfd-d7205ee8b856 의 이름이 둘 다 "중2 천재
-- 이상기"로 잘못 저장돼 있다 — 실제로는 "중1 천재 이상기"여야 한다
-- (운영자 확인, 2026-09-03). 이 교재의 grade_id(c003ed8a… = "풍양중 2")는
-- 이 파일이 건드리지 않는다 — grades 테이블에 "중1"에 해당하는 행이 아직
-- 없어(2026-09-03 조회 시 "풍양중 2"/"주곡중 2" 2행만 존재) 잘못 지정하는
-- 것보다 미변경이 안전하다는 운영자 지시.
--
-- Production Safety Harness(scripts/prodHotfix.mjs) 의 ALLOWLIST 는
-- students/student_class_assignments 두 테이블의 특정 컬럼 UPDATE만
-- 허용하고 textbooks/classes 는 포함하지 않는다 — 이 두 건의 name 정정은
-- 그 하네스로 표현할 수 없어 이 SQL 파일로 별도 준비한다(CLAUDE.md 규칙 8
-- — 실행은 운영자가 Supabase 대시보드 SQL Editor에서 수동으로 한다).
--
-- ── 이 파일이 하는 일 ───────────────────────────────────────────────────
-- textbooks.name, classes.name 딱 2행만 UPDATE 한다. id + 현재 name 값을
-- 모두 WHERE 절 가드로 검증하므로(예상과 다른 이름이면 0행 매치 -> 안전하게
-- 아무 일도 안 함), 실수로 다른 교재/반을 건드릴 수 없다.
--   · student_class_assignments / students / units / words 전부 무접촉
--     (유령 유닛 참조 재배정은 별도 harness manifest
--     scripts/prod/manifests/isanggi-textbook-cleanup-20260903.json 담당)
--   · 행 삭제/전체 비우기/테이블·컬럼 제거 구문 전부 없음(UPDATE 2건 뿐)
--
-- ── 안전장치 ────────────────────────────────────────────────────────────
--  STEP 0  대상 id들의 현재 name이 정확히 "중2 천재 이상기"인지 검증하고
--          결과를 출력. 다르면 이미 적용됐거나 다른 행이라는 뜻이므로
--          STEP 1의 WHERE 가드가 자연히 0행을 매치해 멱등하게 넘어간다.
--  STEP 1  UPDATE textbooks / UPDATE classes, 각각 id = ... and name =
--          '중2 천재 이상기' 로 가드. 예상 밖 행(0 또는 2가 아닌) 이 바뀌면
--          예외를 던져 트랜잭션 전체를 롤백한다.
--  STEP 2  갱신 후 실제 name 값이 "중1 천재 이상기"인지, 다른 컬럼(예:
--          grade_id/owner_class_id/class_type)이 그대로인지 재확인.
--
-- 재실행 시 동작(정직 기록): 이미 적용된 상태에서 다시 돌리면 STEP 0의
-- 현재 name이 "중1 천재 이상기"라 STEP 1의 WHERE 가드가 0행을 매치하고,
-- STEP 2도 이미 "중1 천재 이상기"이므로 통과한다 — 즉 몇 번을 재실행해도
-- 결과가 같다(멱등, CLAUDE.md 규칙 9).
--
-- 실행: Supabase 대시보드 SQL Editor에 전문 붙여넣기. 이 세션에서는
-- 실행하지 않았다(에이전트는 DB에 DDL/DML을 직접 실행할 권한이 없음,
-- CLAUDE.md 규칙 8) — 준비만 완료된 상태.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- STEP 0 — 실행 전 상태 확인 (기대: 둘 다 "중2 천재 이상기")
-- ══════════════════════════════════════════════════════════════════════
select id, name, grade_id, owner_class_id
from textbooks
where id = '80e8d5dd-a054-4f96-9173-5db981e1fe5b';

select id, name, class_type
from classes
where id = 'e09e147b-7a01-4e58-8bfd-d7205ee8b856';

-- ══════════════════════════════════════════════════════════════════════
-- STEP 1 — UPDATE (가드: id + 현재 name 일치할 때만, 멱등)
-- ══════════════════════════════════════════════════════════════════════
do $$
declare
  v_tb_rows  int;
  v_cls_rows int;
begin
  update textbooks
     set name = '중1 천재 이상기'
   where id = '80e8d5dd-a054-4f96-9173-5db981e1fe5b'
     and name = '중2 천재 이상기';
  get diagnostics v_tb_rows = row_count;
  if v_tb_rows not in (0, 1) then
    raise exception 'ABORT STEP1: textbooks UPDATE 영향 %행(0 또는 1이어야 함)', v_tb_rows;
  end if;

  update classes
     set name = '중1 천재 이상기'
   where id = 'e09e147b-7a01-4e58-8bfd-d7205ee8b856'
     and name = '중2 천재 이상기';
  get diagnostics v_cls_rows = row_count;
  if v_cls_rows not in (0, 1) then
    raise exception 'ABORT STEP1: classes UPDATE 영향 %행(0 또는 1이어야 함)', v_cls_rows;
  end if;

  raise notice 'STEP1 OK — textbooks UPDATE %행 / classes UPDATE %행(0=이미 적용됨, 1=이번에 정정)', v_tb_rows, v_cls_rows;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- STEP 2 — 사후 검증 (하나라도 실패하면 전체 롤백)
-- ══════════════════════════════════════════════════════════════════════
do $$
declare
  v_tb_name  text;
  v_tb_grade uuid;
  v_tb_owner uuid;
  v_cls_name text;
  v_cls_type text;
begin
  select name, grade_id, owner_class_id into v_tb_name, v_tb_grade, v_tb_owner
  from textbooks where id = '80e8d5dd-a054-4f96-9173-5db981e1fe5b';
  if v_tb_name is distinct from '중1 천재 이상기' then
    raise exception 'ABORT STEP2: textbooks.name 이 "중1 천재 이상기"가 아님(실제=%)', coalesce(v_tb_name, '<행 없음>');
  end if;
  if v_tb_grade is distinct from 'c003ed8a-9835-4314-9869-10423e921ffd'::uuid then
    raise exception 'ABORT STEP2: textbooks.grade_id 가 예상과 다름(변경되면 안 됨, 실제=%)', v_tb_grade;
  end if;
  if v_tb_owner is distinct from 'e09e147b-7a01-4e58-8bfd-d7205ee8b856'::uuid then
    raise exception 'ABORT STEP2: textbooks.owner_class_id 가 예상과 다름(변경되면 안 됨, 실제=%)', v_tb_owner;
  end if;

  select name, class_type into v_cls_name, v_cls_type
  from classes where id = 'e09e147b-7a01-4e58-8bfd-d7205ee8b856';
  if v_cls_name is distinct from '중1 천재 이상기' then
    raise exception 'ABORT STEP2: classes.name 이 "중1 천재 이상기"가 아님(실제=%)', coalesce(v_cls_name, '<행 없음>');
  end if;
  if v_cls_type is distinct from 'textbook' then
    raise exception 'ABORT STEP2: classes.class_type 이 예상과 다름(변경되면 안 됨, 실제=%)', v_cls_type;
  end if;

  raise notice 'STEP2 OK — textbooks.name=%, classes.name=% (grade_id/owner_class_id/class_type 불변 확인)', v_tb_name, v_cls_name;
end $$;

commit;
