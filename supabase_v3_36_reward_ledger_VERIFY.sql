-- ============================================================================
-- supabase_v3_36_reward_ledger_VERIFY.sql — supabase_v3_36_reward_ledger.sql
-- 실행 후 선택적으로 돌리는 검증 스크립트. 2026-08-18 신설.
--
-- 이 파일은 본 마이그레이션(supabase_v3_36_reward_ledger.sql)과 완전히
-- 분리된 별개 파일이다 — v3_36 본문은 이 파일 없이도 완결된다(테이블/뷰/
-- 인덱스/RLS가 전부 v3_36만으로 정상 동작). 이 파일은 실행하면 테스트
-- 행을 reward_ledger에 넣었다가 지우므로(부작용 있는 SQL), 운영자 판단
-- 하에 v3_36 실행 후 선택적으로 별도 실행한다 — v3_36 실행 자체에는
-- 필요하지 않다.
--
-- 사용법: Supabase 대시보드 SQL Editor에서 이 파일 전체를 붙여넣고 실행.
-- 각 섹션의 주석에 "정상" 기준이 적혀 있다 — 기준과 다르면 v3_36 재검토.
-- ============================================================================

-- ① anon 권한 확인(최소 권한 — SELECT조차 열지 않았으므로 조회도 거부돼야
--    정상). 실행 후 반드시 reset role로 되돌릴 것.
set role anon;
select * from reward_ledger limit 1;
-- 위 select는 반드시 42501(permission denied)로 실패해야 정상 — v3_36이
-- SELECT GRANT를 anon에 주지 않았기 때문(2026-08-18부터 최소 권한 정책).
insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta)
  values ('00000000-0000-0000-0000-000000000000', 'test', 'test', 'x', 1);
-- 위 insert도 반드시 42501(permission denied)로 실패해야 정상.
reset role;

-- ② 중복 방지 확인(idempotency_key unique 제약). service_role(SQL Editor
--    기본 세션)로 실행 — 테스트 행을 넣었다가 즉시 지운다.
insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, idempotency_key)
  values ((select id from students limit 1), 'test', 'test', 'x', 1, 'dup-test-1');
insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, idempotency_key)
  values ((select id from students limit 1), 'test', 'test', 'x', 1, 'dup-test-1');
-- 두 번째 insert는 반드시 23505(unique violation)로 실패해야 정상.
delete from reward_ledger where idempotency_key = 'dup-test-1';
-- 위 delete로 테스트 행 정리 — 실행 후 reward_ledger에 dup-test-1 행이
-- 남아있지 않아야 정상(select count(*) from reward_ledger where
-- idempotency_key = 'dup-test-1'; 이 0이어야 함).
-- ============================================================================
