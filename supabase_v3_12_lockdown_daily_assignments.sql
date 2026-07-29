-- Paul Easy Voca v3.12 — 숙제 배정(daily_assignments) 쓰기 보안 락다운
--
-- ⚠️⚠️⚠️ 절대 먼저 실행하지 마세요 — 이 파일은 "아직 준비되지 않았습니다" ⚠️⚠️⚠️
--
-- 이 SQL은 v3.11(classes/units/words)과 정확히 같은 취약점을 daily_assignments
-- 테이블에도 닫으려는 것이다. **2026-07-30 기준, 선행 코드 작업은 v3.11과
-- 동일하게 code-complete 상태다**(아래). 남은 건 v3.11과 마찬가지로 "배포"뿐:
--
--   • v3.11(classes/units/words): 클라이언트 쓰기가 admin-content-write Edge
--     Function 경유로 전환됨(wordLibrary.js + AdminScreen.jsx 배선 완료),
--     남은 건 Edge Function "배포"뿐.
--   • v3.12(daily_assignments, 이 파일): [★ 코드 완료됨 ★] admin-content-write
--     Edge Function에 `assignment.set` action 추가 완료, wordLibrary.js의
--     setTodaysAssignment/setAssignmentForDate가 adminPin(옵셔널 마지막 인자)
--     truthy면 그 action 경유·falsy면 레거시 anon 폴백하는 듀얼패스로 전환 완료,
--     AdminScreen.jsx의 4개 호출부(FutureAssignmentPlanner save() + 오늘의 단어
--     토글/유닛 전체 배정/전체 해제)가 pin을 전달하도록 배선 완료.
--     build + verify:admin 등 전체 검증 PASS. → 즉 "로컬 커밋에는 준비됨",
--     단 "배포됐다"는 뜻은 아님(v3.11과 동일 취급).
--
-- 따라서 지금 이 SQL만 (함수 배포 없이) 실행하면, "현재 정상 동작하는" 관리자의
-- 오늘/특정일 숙제 단어 배정이 즉시 42501(permission denied)로 깨진다 — 배포된
-- 구버전 번들에는 이 배선이 없기 때문. 이 파일을 잘못 먼저 실행하면 **현재 잘
-- 되는 기능을 새로 깨뜨리는** 것이라 더 위험하다(저장소 헌법 규칙 1).
--
-- ── 실행 순서(v3.11과 한 배치로, docs/DEPLOY_COMMANDS_V311_V312.md 참고) ──
--   1) [완료] admin-content-write에 assignment.set action 추가.
--   2) [완료] wordLibrary.js 듀얼패스(adminPin) 전환.
--   3) [완료] AdminScreen.jsx 4개 호출부 pin 전달.
--   4) admin-content-write Edge Function 배포 + Vercel 프론트 최신 배포.
--      (assignment.set이 같은 함수에 있어 v3.11 함수 배포 1번으로 함께 커버됨)
--   5) 관리자 화면에서 숙제 배정 1회 저장 라이브 확인(정상 저장되면 배선 OK).
--   6) 그 다음에야 이 SQL 실행(v3.11 SQL 먼저, 그 다음 이 v3.12 SQL).
--
-- ── 배경(왜 필요한가) ──────────────────────────────────────────────────
-- daily_assignments 테이블은 supabase_v1_3_schema.sql:60-61에서
-- `create policy "allow anon all" ... for all using (true) with check (true)`
-- 로 생성돼, 공개 anon key만으로 인터넷 누구나 인증 없이 임의 반의 임의 날짜
-- 숙제 단어를 통째로 덮어쓸 수 있다(학생을 교사 의도와 다른 단어로 유도하거나
-- 배정을 비울 수 있음). classes/units/words와 정확히 같은 취약점 클래스인데
-- v3.11 락다운 범위에서 누락됐다(2026-07-29 관리자 플로우 감사에서 발견).
--
-- ── 무엇을 하는가 ────────────────────────────────────────────────────
-- daily_assignments의 기존 "allow anon all"(전체 CRUD) 정책을 제거하고
-- SELECT만 허용하는 정책으로 교체한다. 쓰기 계열은 정책이 없으므로 RLS
-- default-deny로 자동 차단 → 쓰기는 오직 service_role(Edge Function)만.
-- 학생/관리자의 기존 숙제 "조회"는 SELECT라 영향 없음.
--
-- 멱등(여러 번 실행해도 안전) — 정책만 교체한다. 테이블/컬럼을 없애거나
-- 전체 행을 비우는 구문은 쓰지 않는다(순수 RLS 정책 교체).

alter table daily_assignments enable row level security;

-- 기존 전체허용 정책 제거(있을 때만)
drop policy if exists "allow anon all" on daily_assignments;

-- SELECT만 허용(조회는 계속 anon 직접). 쓰기는 service_role 전용.
drop policy if exists "daily_assignments anon read only" on daily_assignments;
create policy "daily_assignments anon read only" on daily_assignments for select using (true);

-- 참고: service_role 키(Edge Function)는 RLS를 우회하므로, 위 선행 코드 작업
-- 완료 후에는 admin-content-write(assignment.set)가 정상적으로 쓰기를 계속한다.
