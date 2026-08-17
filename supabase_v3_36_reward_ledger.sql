-- ============================================================================
-- supabase_v3_36_reward_ledger.sql — Reward System V1: 별 지급 원장(단일
-- 진실 원천 후보). 2026-08-15. 미실행 — Supabase 대시보드 SQL Editor에서
-- 운영자가 수동 실행(CLAUDE.md 규칙 8, 에이전트는 DDL 직접 실행 권한 없음).
-- 멱등 — 여러 번 실행해도 안전(create table if not exists / create or
-- replace view / create index if not exists).
--
-- ── 코드보다 먼저/나중에 실행돼도 안전(CLAUDE.md 규칙 9) ────────────────
-- 클라이언트(src/utils/rewardEngine.js — 이 원장 형태를 만드는 순수 함수
-- 모듈)는 이 테이블 부재를 감지하면 로컬 원장(append-only 배열, 향후
-- progress_data 내 저장 위치는 ticketEconomy.js의 ticketLedger와 동일한
-- 판단을 따를 예정)만으로 계속 동작해야 한다 — 이 SQL이 아직 실행되지
-- 않은 상태에서도 학습 흐름이 절대 막히지 않는다. 이 SQL이 코드보다
-- 먼저 실행돼도 안전 — 순수 추가 테이블(기존 테이블 컬럼 0개 변경),
-- 아무도 안 쓰면 그냥 빈 테이블로 존재할 뿐이다.
--
-- ── idempotency_key 형식(전역 UNIQUE) ───────────────────────────────────
--   `${student_id}:${reward_type}:${source_type}:${source_id}`
-- src/utils/rewardEngine.js의 rewardIdempotencyKey()가 이 형식의 단일
-- 진실 원천 — 서버/클라이언트가 같은 계산을 재구현하지 않고 그대로 공유
-- (paulRankShared.js가 api/grant-xp.js와 같은 판단 함수를 공유하는 것과
-- 동일 패턴). student_id를 키에 포함하는 이유: 이 컬럼이 테이블 전역
-- UNIQUE라, 두 학생이 우연히 같은 (reward_type, source_type, source_id)
-- 조합을 가질 수 있는 이벤트(예: 같은 반 같은 유닛 시험 완료)에서 서로의
-- 지급을 막지 않기 위함.
--
-- ── stars_delta check 하한만 두는 이유 ───────────────────────────────────
-- 원안은 `check (stars_delta between 0 and 50)`이었으나,
-- supabase_v3_37_reward_legacy_baseline.sql(기존 student_progress.
-- total_stars를 원장으로 1회성 이관)이 학생별 누적 총 별(수백 이상 가능)을
-- 그대로 옮겨 심어야 해서 상한이 baseline과 충돌한다. 그래서 하한(음수
-- 지급 방지)만 DB에 두고, "한 번의 실제 학습 이벤트가 비정상적으로 큰
-- 별을 지급하지 못하게" 막는 상한은 애플리케이션 레벨(rewardEngine.js
-- REWARD_STARS 화이트리스트 + 이 값만 신뢰하는 서버 쓰기 경로)에서
-- 관리한다.
--
-- ── RLS: anon read-only, 쓰기는 service_role 전용(v2_3_paul_rank.sql의
-- xp_ledger와 동일 패턴) ─────────────────────────────────────────────────
-- anon/authenticated에 INSERT/UPDATE/DELETE GRANT를 절대 추가하지 말 것
-- — 추가하는 순간 "클라이언트가 보낸 별 총합을 신뢰하지 않는다"는 이
-- 테이블의 존재 이유(서버 검증 전용 쓰기 경로)가 무효화된다.
-- ============================================================================

-- 1) reward_ledger — 이벤트별 원장. idempotency_key 전역 unique 제약이
--    곧 idempotency 메커니즘(같은 이벤트가 두 번 들어와도 두 번째는 DB가
--    자연스럽게 거부).
create table if not exists reward_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  reward_type text not null,
  source_type text not null,
  source_id text not null,
  stars_delta smallint not null check (stars_delta >= 0), -- 상한은 애플리케이션 레벨에서 관리(위 헤더 설명 — legacy-baseline 이관과의 충돌 회피)
  xp_delta smallint not null default 0 check (xp_delta between 0 and 100), -- V1은 항상 0(XP는 기존 xp_ledger 경로 유지, "별을 조용히 XP로 변환하지 말라" 원칙)
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_reward_ledger_student on reward_ledger (student_id);

-- 2) RLS — anon read-only. INSERT/UPDATE/DELETE는 GRANT 자체를 하지
--    않는다(= 기본 거부, service_role만 RLS를 우회해 쓸 수 있음).
alter table reward_ledger enable row level security;
create policy "reward_ledger anon read only" on reward_ledger for select using (true);
grant select on table reward_ledger to anon, authenticated;
-- 참고: anon/authenticated에 insert/update/delete GRANT를 절대 추가하지
-- 말 것 — 다음 세션을 위한 명시적 경고(xp_ledger와 동일한 경고 문구 재사용).

-- 3) reward_totals — 파생 VIEW(저장 아님, 매 조회 재계산). "저장된 합계
--    컬럼보다 파생값을 우선한다"는 xp_totals와 동일 판단 — 사본 컬럼이
--    없으면 사본-원본 불일치 버그 자체가 존재할 수 없다.
create or replace view reward_totals as
  select student_id, coalesce(sum(stars_delta), 0)::integer as earned_stars
  from reward_ledger
  group by student_id;
grant select on reward_totals to anon, authenticated;

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 테이블/뷰 생성 확인:
--   select count(*) from reward_ledger;
--   select count(*) from reward_totals;
--
-- ② anon 권한 확인(실행 후 반드시 reset role):
--   set role anon;
--   select * from reward_ledger limit 1;              -- 정상(빈 결과 OK, 42501 아니어야 함)
--   insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta)
--     values ('00000000-0000-0000-0000-000000000000', 'test', 'test', 'x', 1);
--   -- 위 insert는 반드시 42501(permission denied)로 실패해야 정상.
--   reset role;
--
-- ③ 중복 방지 확인(unique 제약):
--   insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, idempotency_key)
--     values ((select id from students limit 1), 'test', 'test', 'x', 1, 'dup-test-1');
--   insert into reward_ledger (student_id, reward_type, source_type, source_id, stars_delta, idempotency_key)
--     values ((select id from students limit 1), 'test', 'test', 'x', 1, 'dup-test-1');
--   -- 두 번째 insert는 반드시 23505(unique violation)로 실패해야 정상.
--   delete from reward_ledger where idempotency_key = 'dup-test-1';
-- ============================================================================
