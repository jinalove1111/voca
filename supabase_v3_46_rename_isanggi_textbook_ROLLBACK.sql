-- v3.46 ROLLBACK — "중1 천재 이상기"로 정정한 textbooks.name/classes.name
-- 을 원래 값 "중2 천재 이상기"로 되돌린다 (미실행 — v3_46 적용 후 문제가
-- 발견됐을 때만 운영자가 수동 실행).
--
-- v3_46과 대칭 구조: id + 현재(정정된) name 값을 WHERE 가드로 확인하고,
-- 다르면(=애초에 적용 안 됐거나 이미 되돌려짐) 0행 매치로 멱등하게 넘어간다.

begin;

select id, name, grade_id, owner_class_id
from textbooks
where id = '80e8d5dd-a054-4f96-9173-5db981e1fe5b';

select id, name, class_type
from classes
where id = 'e09e147b-7a01-4e58-8bfd-d7205ee8b856';

do $$
declare
  v_tb_rows  int;
  v_cls_rows int;
begin
  update textbooks
     set name = '중2 천재 이상기'
   where id = '80e8d5dd-a054-4f96-9173-5db981e1fe5b'
     and name = '중1 천재 이상기';
  get diagnostics v_tb_rows = row_count;
  if v_tb_rows not in (0, 1) then
    raise exception 'ABORT ROLLBACK-STEP1: textbooks UPDATE 영향 %행(0 또는 1이어야 함)', v_tb_rows;
  end if;

  update classes
     set name = '중2 천재 이상기'
   where id = 'e09e147b-7a01-4e58-8bfd-d7205ee8b856'
     and name = '중1 천재 이상기';
  get diagnostics v_cls_rows = row_count;
  if v_cls_rows not in (0, 1) then
    raise exception 'ABORT ROLLBACK-STEP1: classes UPDATE 영향 %행(0 또는 1이어야 함)', v_cls_rows;
  end if;

  raise notice 'ROLLBACK-STEP1 OK — textbooks UPDATE %행 / classes UPDATE %행(0=이미 원복 상태, 1=이번에 되돌림)', v_tb_rows, v_cls_rows;
end $$;

do $$
declare
  v_tb_name  text;
  v_cls_name text;
begin
  select name into v_tb_name from textbooks where id = '80e8d5dd-a054-4f96-9173-5db981e1fe5b';
  if v_tb_name is distinct from '중2 천재 이상기' then
    raise exception 'ABORT ROLLBACK-STEP2: textbooks.name 이 "중2 천재 이상기"가 아님(실제=%)', coalesce(v_tb_name, '<행 없음>');
  end if;

  select name into v_cls_name from classes where id = 'e09e147b-7a01-4e58-8bfd-d7205ee8b856';
  if v_cls_name is distinct from '중2 천재 이상기' then
    raise exception 'ABORT ROLLBACK-STEP2: classes.name 이 "중2 천재 이상기"가 아님(실제=%)', coalesce(v_cls_name, '<행 없음>');
  end if;

  raise notice 'ROLLBACK-STEP2 OK — textbooks.name=%, classes.name=%', v_tb_name, v_cls_name;
end $$;

commit;
