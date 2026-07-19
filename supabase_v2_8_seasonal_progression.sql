-- ============================================================================
-- supabase_v2_8_seasonal_progression.sql — Seasonal Progression 시즌 경계
-- 마커. 2026-07-19. Supabase 대시보드 SQL Editor에서 1회 실행. 멱등 —
-- 여러 번 실행해도 안전(create table if not exists / create index if not
-- exists / drop policy if exists + create policy).
--
-- 근거: PROJECT_BOARD.md 게임화 하위카드 9번, GAME_DESIGN.md 9번 섹션
-- (Seasonal Progression).
--
-- ── 설계 원칙(운영자 지시 그대로, 재발명 금지) ────────────────────────────
-- 레벨/뱃지/스트릭은 영구 — 이 SQL은 그 값들을 저장하는 어떤 테이블/컬럼도
-- 건드리지 않는다(xp_ledger/students 등 전부 무관, 신규 컬럼 0개). 시즌
-- 경계에서 리셋 대상은 오직 Ticket Economy 잔액 + House 팀 점수뿐
-- (GAME_DESIGN.md 9번 섹션 원문 그대로).
--
-- ── "리셋"의 실제 의미 — 원장 삭제가 아니라 경계 마커 ─────────────────────
-- Ticket 원장(progress_data.ticketLedger, append-only)도 House 팀 점수의
-- 소스(같은 티켓 원장)도 전부 append-only라 물리적으로 지우지 않는다
-- (CLAUDE.md 규칙 5 "프로덕션 데이터 삭제 금지"와 직결). 대신 이 테이블에
-- "이 시점부터 새 시즌" 마커 행을 추가하고, 시즌별 잔액/점수는 그 마커
-- 이후의 원장 항목만 집계하는 파생 계산으로 구현한다(src/utils/
-- ticketEconomy.js sumTicketBalanceSince / src/utils/houseSystem.js
-- computeHouseSeasonScores). 이전 시즌 데이터는 이 테이블에도 원장에도
-- 그대로 남아있다 — "역대 시즌 이력"으로 조회 가능(운영자가 나중에 원하면).
--
-- ── classes 컬럼 대신 별도 테이블을 쓴 이유 ───────────────────────────────
-- House 팀 점수는 이미 반(class) 경계를 넘어 학생 전원을 대상으로 전역
-- 집계된다(students.house_id는 반과 무관한 전역 속성 — houseSystem.js/
-- wordLibrary.js fetchHouseWeeklyScore가 반 필터 없이 그 하우스 전체
-- 학생을 조회, 2026-07-19(9차) 구현 확인). 시즌 경계를 반(classes) 단위
-- 컬럼으로 쪼개면 서로 다른 반 소속 학생이 같은 하우스에 있을 때 하우스
-- 팀 점수 집계 기준일(경계)이 반마다 달라지는 불일치가 생긴다 — 그래서
-- 전역 단일 경계(seasons 테이블, 항상 최신 행 1개가 "현재 시즌")를 쓴다.
-- 여러 반 컬럼을 매번 원자적으로 함께 갱신해야 하는 방식보다, 시즌
-- 전환마다 새 행 하나만 append하는 편이 이 저장소의 기존 append-only
-- 관례(xp_ledger/word_king_history/ticketLedger)와도 일관되고, 여러 반
-- UPDATE 도중 일부만 실패해 경계가 반마다 어긋나는 상황 자체가 구조적으로
-- 없어 트랜잭션 안전성도 더 높다.
--
-- ── 쓰기 권한: service_role 전용(anon 쓰기 금지) ──────────────────────────
-- word_king_history와 같은 이유(GAME_DESIGN.md §11 Anti-cheat 원칙) — 이
-- 테이블은 "보상이 걸린" 값은 아니지만, 전역으로 모든 학생의 Ticket/House
-- 집계 기준일에 영향을 준다. anon이 쓸 수 있으면 학생 누구나 가짜 시즌
-- 경계 행을 넣어 전교생의 티켓/하우스 점수를 임의로 리셋시키는 장난
-- (그리핑)이 가능해진다 — 그래서 anon read-only + 쓰기는
-- api/start-new-season.js(관리자 재인증, checkAdminReauth)만 허용한다.
--
-- ── 실행 순서 안전성(CLAUDE.md 규칙 9) ────────────────────────────────────
-- 코드가 이 SQL보다 먼저 배포돼도 안전: fetchCurrentSeason() 계열 조회
-- 함수는 테이블 없음 에러(42P01/PGRST205)를 감지해 "시즌 없음"(null)으로
-- 폴백한다 — 이 경우 Ticket/House 표시는 전부 기존 "전체 누적" 값 그대로
-- 보인다(리셋 이전 동작과 100% 동일, 회귀 없음). 이 SQL이 먼저 실행돼도
-- 안전: 관리자가 "새 시즌 시작" 버튼을 누르기 전까지는 테이블에 행이
-- 없으므로 역시 "시즌 없음" 상태와 동일하게 동작한다.
-- ============================================================================

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  -- 관리자가 남기는 짧은 메모(선택) — 예: "2026 2학기". 표시 외 어떤
  -- 집계/계산 로직도 이 값을 파싱하지 않는다(순수 참고용 텍스트).
  note text,
  created_at timestamptz not null default now()
);

-- 가장 최근 시즌(=현재 시즌) 조회 최적화.
create index if not exists idx_seasons_started_at on public.seasons (started_at desc);

-- RLS — anon read-only. INSERT/UPDATE/DELETE는 GRANT 자체를 하지 않는다
-- (= 기본 거부, service_role만 RLS를 우회해 쓸 수 있음). word_king_history/
-- xp_ledger와 완전히 동일한 패턴 — 새 패턴 발명 아님.
alter table public.seasons enable row level security;
drop policy if exists "seasons anon read only" on public.seasons;
create policy "seasons anon read only" on public.seasons for select using (true);
grant select on table public.seasons to anon, authenticated;
-- 참고: anon/authenticated에 insert/update/delete GRANT를 절대 추가하지
-- 말 것 — 추가하는 순간 "시즌 경계는 관리자만 바꾼다"는 이 테이블의 존재
-- 이유가 무효화된다(word_king_history SQL의 동일 경고를 그대로 재사용).

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 테이블 생성 확인(처음엔 0행이 정상 — 관리자가 버튼을 누르기 전):
--   select count(*) from public.seasons;
--
-- ② anon 권한 확인(실행 후 반드시 reset role):
--   set role anon;
--   select * from public.seasons limit 1;   -- 정상(빈 결과 OK, 42501 아니어야 함)
--   insert into public.seasons (started_at) values (now());
--   -- 위는 반드시 42501(permission denied)로 실패해야 정상.
--   reset role;
--
-- ③ 관리자 화면 "새 시즌 시작" 버튼을 누른 뒤:
--   select id, started_at, note from public.seasons order by started_at desc limit 5;
--   -- 새 행이 맨 위에 추가돼 있어야 하고, 이전 행들은 그대로 남아있어야
--   -- 한다(삭제 없음 확인 — 이 저장소는 append-only 원장 관례를 이
--   -- 테이블에도 그대로 적용했다).
--
-- 이번 라운드는 순수 함수 테스트(scripts/testSeasonalProgression.mjs)까지만
-- — 이 SQL이 아직 실행 전이라 라이브 e2e는 만들지 않았다(Word King/House가
-- 쓴 "SQL 미실행 시 안전 SKIP" 패턴을 새로 또 추가하기보다, 운영자가 이
-- SQL을 실제로 실행한 뒤 다음 세션에서 라이브 e2e를 추가하는 편이 더
-- 정확하다).
-- ============================================================================
