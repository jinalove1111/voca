-- v3.42 — students anon/authenticated DELETE 권한 회수 (2026-09-01, CRITICAL 보안 수정)
--
-- ── 배경 ────────────────────────────────────────────────────────────────
-- students 테이블은 RLS가 비활성이고 정책이 0개라 접근 제어가 오직 GRANT에
-- 의존한다. v1_9(2026-07-16)가 SELECT/UPDATE를 컬럼 단위로 좁히고,
-- v3_16(2026-08-06)이 INSERT를 회수했지만, DELETE는 "관리자 학생 삭제 흐름이
-- anon 경유"라는 당시 이유로 두 파일 모두 의도적으로 남겨 두었다.
-- 그 전제는 2026-08-08에 사라졌다 — 관리자 학생 삭제는 서버 액션
-- api/admin-pin-actions.js hard_delete_student(service_role + 관리자 PIN
-- 재인증)만 쓰고, 클라이언트 wordLibrary.removeStudent는 호출부가 0이다
-- (useStudent.js의 재export 1줄만 남음). 즉 anon DELETE 권한은 앱이 전혀
-- 쓰지 않는 dead permission이면서, 브라우저 번들에 실리는 공개 anon key로
-- 임의 학생 행을 지울 수 있는 공격면이다(2026-09-01 READ-ONLY 감사 +
-- 같은 날 pilot cleanup에서 anon key DELETE가 HTTP 200으로 성공한 실측으로
-- 확정). students 삭제는 FK CASCADE로 student_progress / word_status /
-- student_daily_progress / xp_ledger / student_class_assignments /
-- entrance_test_results 까지 소멸시키므로 CRITICAL.
--
-- ── 이 파일이 하는 일 (정확히 1개 REVOKE) ────────────────────────────────
--   revoke delete on table public.students from anon, authenticated;
-- 그 외 무접촉:
--   · 데이터 변경 0 (DML 없음)  · RLS 활성/비활성 변경 0  · 정책 변경 0
--   · SELECT(컬럼 단위, v1_9) / UPDATE(컬럼 단위 4개) / INSERT(회수 상태) 그대로
--   · 다른 테이블 GRANT 변경 0  · service_role은 GRANT 체계 밖(BYPASS)이라
--     hard_delete_student 등 서버 경로에 영향 0
--
-- 재실행 안전(멱등): 이미 회수된 상태에서 다시 실행해도 REVOKE는 no-op.
-- 앱 폴백(규칙 9): 코드 배포 순서와 무관 — 앱은 이 권한을 쓰지 않는다.
-- 동반 변경: scripts/testRlsSecurity.mjs §7 계약이 "DELETE 허용"에서
-- "DELETE 거부"로 반전됨 — 이 SQL 실행 전에는 그 §7이 FAIL(예상), 실행 후 PASS.
--
-- 실행: Supabase 대시보드 SQL Editor에 전문 붙여넣기 (CLAUDE.md 규칙 8).
-- 롤백: supabase_v3_42_students_delete_lockdown_ROLLBACK.sql

revoke delete on table public.students from anon, authenticated;

-- PostgREST 권한 캐시 갱신(v1_9/v3_16과 동일 관례).
notify pgrst, 'reload schema';

-- ── 사후 검증(읽기 전용) — anon/authenticated에 DELETE가 남아 있으면 즉시 예외 ──
do $$
declare v_left int;
begin
  select count(*) into v_left
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'students'
    and privilege_type = 'DELETE'
    and grantee in ('anon', 'authenticated');
  if v_left <> 0 then
    raise exception 'v3_42 검증 실패: anon/authenticated에 students DELETE 권한이 %건 남아 있음', v_left;
  end if;
  raise notice 'v3_42 OK — anon/authenticated students DELETE 권한 0건 (SELECT/UPDATE/INSERT 권한 무변경)';
end $$;
