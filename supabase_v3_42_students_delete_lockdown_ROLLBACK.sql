-- v3.42 ROLLBACK — students anon/authenticated DELETE 권한 재부여 (2026-09-01)
--
-- supabase_v3_42_students_delete_lockdown.sql이 회수한 DELETE GRANT만 정확히
-- 되돌린다(v3_42 이전 상태 = 테이블 단위 DELETE 허용). 그 외 무접촉:
-- 데이터 0 / RLS 0 / 정책 0 / SELECT·UPDATE·INSERT 권한 0 / 다른 테이블 0.
--
-- ⚠️ 이 롤백은 CRITICAL 공격면(공개 anon key로 임의 학생 삭제)을 다시 여는
-- 것이다. 앱 기능 중 이 권한을 쓰는 경로는 0이므로 "앱이 깨져서" 롤백할
-- 이유는 없다 — 예상치 못한 외부 도구/운영 스크립트가 anon DELETE에
-- 의존하는 것이 확인된 경우에만, 그 도구를 service_role로 옮길 때까지의
-- 임시 조치로만 사용할 것.
--
-- 실행: Supabase 대시보드 SQL Editor에 전문 붙여넣기 (CLAUDE.md 규칙 8).

grant delete on table public.students to anon, authenticated;

notify pgrst, 'reload schema';

do $$
declare v_cnt int;
begin
  select count(*) into v_cnt
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'students'
    and privilege_type = 'DELETE'
    and grantee in ('anon', 'authenticated');
  if v_cnt <> 2 then
    raise exception 'v3_42 롤백 검증 실패: DELETE 권한 보유 롤 %건 (기대 2: anon, authenticated)', v_cnt;
  end if;
  raise notice 'v3_42 ROLLBACK OK — anon/authenticated students DELETE 재부여됨 (v3_42 이전 상태)';
end $$;
