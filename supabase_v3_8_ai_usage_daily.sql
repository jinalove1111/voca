-- Paul Easy Voca v3.8 — 쓰기 답안 검토 AI 보조 "일일" 비용 상한 집계 테이블.
--
-- Supabase 대시보드 SQL Editor에서 전체를 그대로 붙여넣고 실행하세요.
-- (멱등 — 몇 번 실행해도 안전, 기존 데이터는 전혀 안 건드립니다.)
--
-- ⚠️ 이 파일은 운영자가 수동으로 실행합니다(에이전트는 Supabase에 DDL을
-- 직접 실행할 수 없음 — 헌법 규칙 8). Edge Function(supabase/functions/
-- grade-writing-answers) 재배포도 별도로 운영자 수동입니다:
--   supabase functions deploy grade-writing-answers
--   supabase secrets set OPENAI_API_KEY=... AI_PROVIDER=openai \
--     OPENAI_MODEL=gpt-5-nano MAX_DAILY_COST=2.0 ...
--
-- 이 SQL을 아직 실행하지 않아도 앱은 절대 깨지지 않습니다:
--   - 기존 쓰기 답안 검토 큐(spelling_review_queue)/인정 뜻(words.
--     accepted_meanings)/AI 판정 캐시(spelling_ai_grading_cache) 워크플로우는
--     이 테이블과 전혀 무관하게 100% 그대로 동작합니다.
--   - Edge Function은 이 테이블 조회/기록이 실패하면(테이블 미존재 —
--     Postgres 42P01 또는 PostgREST가 스키마 캐시에 아직 반영 못 한 경우의
--     PGRST205) 경고 로그만 남기고 "일일 상한 없이" 진행하도록 이미 작성돼
--     있습니다(요청당 상한 MAX_ITEMS_PER_REQUEST/MAX_EST_COST_USD_PER_REQUEST는
--     이 테이블과 무관하게 계속 그대로 적용됩니다 — § 헌법 규칙 9 우아한
--     성능 저하).
--
-- 목적: 하루(Asia/Seoul 기준 날짜, 아래 이유 참고) 동안 이 Edge Function이
-- 실제로 보낸 AI(현재 OpenAI gpt-5-nano) 호출의 추정 비용 누계를 집계해,
-- 운영자가 지정한 MAX_DAILY_COST(기본 $2.00)를 넘으면 그날 남은 요청은
-- AI 호출 자체를 건너뛰고(review/ai_budget_exceeded로 정직하게 표시) 자동
-- 거부 없이 관리자 확인으로 미룬다. 요청당 상한(MAX_EST_COST_USD_PER_REQUEST,
-- supabase_v3_6 배포 이후 도입)이 "한 번에 너무 큰 요청"을 막는 것과 달리,
-- 이 테이블은 "하루 동안 누적된 여러 번의 작은 요청 합계"가 상한을 넘는
-- 상황을 막기 위한 것 — 둘은 서로 다른 위험을 막으므로 하나가 다른 하나를
-- 대체하지 않는다.
--
-- 날짜 기준을 Asia/Seoul로 고정하는 이유(index.ts getSeoulDateString과
-- 1:1): 이 앱의 실제 사용자(학생/관리자)는 전부 한국 시간대에서 활동하므로
-- "오늘 하루"의 경계가 한국 자정이어야 운영자가 상한을 직관적으로 이해할
-- 수 있다. Supabase/Deno 실행 환경의 시스템 시간대(보통 UTC)를 그대로 쓰면
-- 한국 기준 같은 날 안에서도 UTC 자정(=한국 09:00)을 지나며 하루가 조용히
-- 둘로 쪼개져 상한이 실제 의도보다 두 배로 느슨해질 수 있다 — 그래서
-- usage_date는 서버 시스템 시간대가 아니라 명시적으로 Asia/Seoul로 계산한
-- 날짜 문자열이다.

create table if not exists ai_usage_daily (
  usage_date date primary key,        -- Asia/Seoul 기준 날짜(YYYY-MM-DD) —
                                       -- index.ts의 getSeoulDateString()과
                                       -- 반드시 같은 계산 방식이어야 한다.
  request_count integer not null default 0,  -- 그날 실제로 보낸 AI 배치 요청 수
                                       -- (캐시 히트/로컬 규칙 확정 건은 제외 —
                                       -- 실제 비용이 발생한 호출만 센다).
  item_count integer not null default 0,     -- 그날 실제 AI로 전송된 항목(답안) 수
                                       -- 누계(배치 크기와 무관하게 개별 항목 합).
  est_cost_usd numeric not null default 0,   -- 그날 추정 비용 누계(가능하면
                                       -- 실제 usage 토큰 기반 계산 우선,
                                       -- pipeline.js estimateCostUsd 재사용).
  updated_at timestamptz not null default now()
);

-- 코멘트(멱등 — comment on은 여러 번 실행해도 안전, DDL 아님).
comment on table ai_usage_daily is
  'Task 2(쓰기 답안 검토 AI 보조) 일일 비용 상한 집계 — service_role(Edge Function) 전용, anon/authenticated 접근 없음. 운영자 참고용 조회는 Supabase 대시보드 Table Editor에서 직접.';

-- RLS: anon/authenticated GRANT를 아예 하지 않는다(기존 spelling_ai_grading_
-- cache가 SELECT만 열어둔 것보다 한 단계 더 보수적) — 이 테이블은 비용
-- 집계라는 순수 운영 데이터라 관리자 화면에서도 조회할 필요가 없고,
-- Edge Function은 service_role key로 동작해 RLS를 우회하므로 이 정책은
-- "실수로 클라이언트에 노출되는 사고"를 막는 방어선일 뿐이다.
alter table ai_usage_daily enable row level security;
-- 정책을 하나도 만들지 않는다 — RLS가 켜져 있고 어떤 policy도 없으면
-- service_role(정책을 항상 우회) 외에는 그 누구도(anon/authenticated 포함)
-- 행을 하나도 볼 수 없다(fail-closed, 의도된 동작).
-- anon/authenticated에 select/insert/update/delete 전부 GRANT하지 않음
-- (의도적 — service_role만 씀). 실행 순서 무관 안전: 이 GRANT가 없어도
-- 클라이언트 코드는 애초에 이 테이블에 전혀 접근하지 않는다(spellingReviewAiApi.js/
-- AdminScreen.jsx는 이 테이블을 참조하지 않음 — 오직 Edge Function만 읽고 씀).
