-- Paul Easy Voca v2.4 — entrance_test_results 쓰기 경로를 서버(api/submit-
-- entrance-result.js, service_role)로 제한. 2026-07-19, P1 보안 감사 후속
-- (PROJECT_BOARD.md "[P1] 입실시험 결과 서버 재검증 없음").
--
-- 배경: supabase_v1_8_entrance_test.sql이 entrance_test_results에
-- `create policy "allow anon all" ... using (true) with check (true)`를
-- 걸어놔서, anon key만 있으면 누구나 임의 student_id/test_id 조합으로 점수를
-- 조작해 저장할 수 있었다(재현 실측 완료). 서버(api/submit-entrance-
-- result.js)가 이제 DB에 저장된 출제 스냅샷(entrance_tests.words)으로 직접
-- 재채점한 결과만 저장하므로, 클라이언트(anon key)의 직접 쓰기 경로 자체를
-- 막아야 재검증 로직을 우회할 수 없다.
--
-- 조회(SELECT)는 계속 anon 허용 — 랭킹/오늘의 VIP/본인 결과 확인
-- (entranceTestApi.js의 fetchResultsForTests/fetchOwnResult)이 여전히
-- 클라이언트에서 직접 읽는다(이 기능들은 조작 위협이 아니라 순수 조회라
-- 좁힐 필요 없음, 기존 다른 조회 계열과 동일 원칙).
--
-- service_role 키는 Postgres BYPASSRLS 속성으로 RLS 자체를 우회하므로
-- (Supabase 기본 동작), api/submit-entrance-result.js는 별도 정책 없이도
-- 이미 전체 쓰기가 가능하다 — 아래에서 anon/authenticated용 INSERT/UPDATE/
-- DELETE 정책을 아예 만들지 않으면(= 존재하지 않으면), RLS가 활성화된 상태
-- 에서는 매칭되는 정책이 없는 모든 쓰기 요청이 기본적으로 거부된다.
--
-- 멱등 — 여러 번 실행해도 안전(drop policy if exists 후 재생성). Supabase
-- SQL Editor에 그대로 붙여넣고 실행하세요. entrance_tests 테이블(시험 생성/
-- 종료 — 관리자 화면이 anon key로 직접 CRUD하는 기존 신뢰 모델)은 이번
-- 카드의 범위가 아니므로 건드리지 않는다.

drop policy if exists "allow anon all" on entrance_test_results;

create policy "entrance_test_results_select_all" on entrance_test_results
  for select using (true);

-- INSERT/UPDATE/DELETE 정책을 의도적으로 만들지 않음 — anon/authenticated는
-- 이제 이 테이블에 전혀 쓸 수 없고, service_role(BYPASSRLS)만 쓸 수 있다.
