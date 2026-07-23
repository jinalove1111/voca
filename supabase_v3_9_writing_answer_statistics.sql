-- Paul Easy Voca v3.9 — "선생님이 같은 검토를 두 번 하지 않는" 학습 서버:
-- 쓰기 답안 통계 테이블 + 반복 오답 재사용 RPC + ai_usage_daily 절약 컬럼.
--
-- Supabase 대시보드 SQL Editor에서 전체를 그대로 붙여넣고 실행하세요.
-- (멱등 — 몇 번 실행해도 안전, 기존 데이터는 전혀 안 건드립니다.)
--
-- ⚠️ 이 파일은 운영자가 수동으로 실행합니다(에이전트는 Supabase에 DDL을
-- 직접 실행할 수 없음 — 헌법 규칙 8). Edge Function(supabase/functions/
-- grade-writing-answers) 재배포도 별도로 운영자 수동입니다:
--   supabase functions deploy grade-writing-answers
--   (선택, 기본값 그대로 써도 됨) supabase secrets set STATS_REJECT_THRESHOLD=5
--
-- 이 SQL을 아직 실행하지 않아도 앱은 절대 깨지지 않습니다:
--   - 기존 쓰기 답안 검토 큐(spelling_review_queue)/AI 판정 캐시(spelling_
--     ai_grading_cache)/일일 비용 상한(ai_usage_daily) 워크플로우는 이
--     테이블과 전혀 무관하게 100% 그대로 동작합니다.
--   - Edge Function(index.ts)은 이 테이블 조회/기록이 실패하면(테이블
--     미존재 — Postgres 42P01 또는 PostgREST 스키마 캐시 지연 PGRST205)
--     경고 로그만 남기고 "통계 스킵 없이" 진행하도록 이미 작성돼 있습니다
--     (statsLookup이 null이 되어 기존 캐시->AI 흐름과 100% 동일 동작).
--   - ai_usage_daily의 절약 컬럼 3개(rules_resolved_count/cache_hit_count/
--     stats_skip_count)가 아직 없어도(이 파일의 ALTER TABLE 부분 미실행)
--     index.ts는 42703(undefined column)을 감지해 그 3개 컬럼 없이 기존
--     v3.8 컬럼만 기록하는 폴백 경로로 자동 전환합니다(§ index.ts
--     accumulateUsageRowV39ColumnsMissingFallback).
--
-- 목적("선생님이 같은 검토를 두 번 하지 않는" 요구사항 5, 오답 학습):
-- 그동안 매번 AI에게 새로 판단을 맡기던 "학생이 실제로 제출한 (단어,
-- 정규화 답안) 조합"의 등장 이력을 집계해, 이미 여러 번 반복적으로
-- reject_candidate 판정을 받은 조합은 AI를 다시 부르지 않고 그 판정을
-- 재사용한다 — 자동 거부가 아니라 review와 동급으로 "관리자가 여전히
-- 확인 가능한" 상태로 표시될 뿐이다(§ index.ts statsLookup 주석).
-- 관리자 화면에서 이 통계를 "Top50 반복 오답" 같은 형태로 보여주는 것도
-- 이 테이블을 라이브로 직접 쿼리하면 충분하다 — 111명 규모에서 별도
-- pg_cron 새벽 배치를 새로 만들 필요가 없다(무료/최소 인프라 우선,
-- 헌법 규칙 7). 그래서 이 파일에는 cron 잡을 추가하지 않았다.

-- ── 1) writing_answer_statistics 테이블 ─────────────────────────────────
create table if not exists writing_answer_statistics (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references words(id) on delete cascade,
  registered_meaning text not null,   -- 판정 당시 등록 뜻 스냅샷(관리자가
                                       -- 나중에 meaning을 고치면 새 스냅샷
                                       -- 조합이 새 행으로 분리됨 — spelling_
                                       -- ai_grading_cache.meaning_snapshot과
                                       -- 동일 설계 원칙).
  student_answer text not null,       -- 마지막 원문 예시(가장 최근 제출
                                       -- 원문 그대로, 표시/디버깅용).
  normalized_answer text not null,    -- pipeline.js normalizeForCompare() 결과.
  count integer not null default 1,   -- 이 (단어, 등록뜻, 정규화답안) 조합의
                                       -- 총 등장(제출) 횟수.
  accepted_count integer not null default 0,   -- AI가 accept로 판정한 횟수.
  rejected_count integer not null default 0,   -- AI가 reject_candidate로
                                       -- 판정한 횟수 — 이 값이 반복 스킵의
                                       -- 핵심 신호(§ 아래 RPC/index.ts).
  distinct_student_ids uuid[] not null default '{}', -- 고유 학생 UUID만
                                       -- 저장(헌법 규칙 4 — 이름 절대 저장
                                       -- 안 함). 상한 200개, 넘으면 더 안
                                       -- 추가(count와 무관하게 배열만 상한).
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_decision text,                 -- 'accept' | 'review' | 'reject_candidate' | null
  last_confidence numeric,
  status text not null default 'pending',  -- 'pending' | 'accepted' | 'dismissed'
                                       -- — 관리자가 이 통계 행 자체를 참고해
                                       -- 직접 정리했는지 표시(관리자 UI가
                                       -- status/status_changed_at만 UPDATE).
  status_changed_at timestamptz,
  constraint writing_answer_statistics_status_check
    check (status in ('pending', 'accepted', 'dismissed'))
);

create unique index if not exists uq_writing_answer_statistics_key
  on writing_answer_statistics (word_id, registered_meaning, normalized_answer);
create index if not exists idx_writing_answer_statistics_word_id
  on writing_answer_statistics (word_id);

comment on table writing_answer_statistics is
  '쓰기 답안 검토 AI 보조 — 반복 오답 통계("선생님이 같은 검토를 두 번 하지 않는" 요구사항 5). 행 생성/count 증가는 오직 record_writing_answer_stat RPC로만.';

-- RLS: SELECT는 관리자 패널 조회용으로 열어두고, UPDATE는 status/
-- status_changed_at 두 컬럼만 컬럼 단위로 허용한다(관리자가 "이 반복
-- 오답 통계를 확인했다"고 표시하는 용도) — count/accepted_count/
-- rejected_count/distinct_student_ids 등은 클라이언트가 절대 직접 못
-- 바꾸고 오직 아래 RPC(count 증가)와 index.ts의 service_role 갱신
-- (accepted_count/rejected_count/last_decision/last_confidence)만 건드릴
-- 수 있다 — 남용 면적을 "RPC 하나 + service_role 배치 갱신"으로 최소화.
alter table writing_answer_statistics enable row level security;
drop policy if exists "allow anon select" on writing_answer_statistics;
create policy "allow anon select" on writing_answer_statistics for select using (true);
drop policy if exists "allow anon update status" on writing_answer_statistics;
create policy "allow anon update status" on writing_answer_statistics for update using (true) with check (true);

grant select on table writing_answer_statistics to anon, authenticated;
grant update (status, status_changed_at) on table writing_answer_statistics to anon, authenticated;
-- insert/delete는 anon/authenticated에 GRANT하지 않는다(의도적) — 행
-- 생성/count 증가는 오직 아래 record_writing_answer_stat RPC(SECURITY
-- DEFINER)를 통해서만 가능하다. 테이블 자체에 대한 직접 쓰기 권한이
-- 없으므로 이 RPC 하나가 유일한 쓰기 경로가 되어 남용 면적이 최소화된다.

-- ── 2) record_writing_answer_stat RPC(원자적 upsert) ────────────────────
-- 학생이 오답을 제출할 때(spelling_review_queue에 pending 항목이 새로
-- 생길 때) 클라이언트가 이 RPC를 호출해 통계를 갱신한다. INSERT ... ON
-- CONFLICT DO UPDATE 한 문장으로 원자적으로 처리되므로, 여러 학생이 거의
-- 동시에 같은 조합을 제출해도 count가 누락되지 않는다(§ index.ts
-- accumulateUsageRow의 "읽고-더하고-쓰기" 방식과 달리 이 RPC는 진짜
-- 원자적 — 동시성이 훨씬 높은 학생 제출 경로라 이 차이가 중요하다).
create or replace function public.record_writing_answer_stat(
  p_word_id uuid,
  p_registered_meaning text,
  p_student_answer text,
  p_normalized_answer text,
  p_student_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_word_id is null then
    raise exception 'p_word_id is required';
  end if;
  if p_registered_meaning is null or length(trim(p_registered_meaning)) = 0 then
    raise exception 'p_registered_meaning must not be empty';
  end if;
  if p_student_answer is null or length(trim(p_student_answer)) = 0 or length(p_student_answer) > 500 then
    raise exception 'p_student_answer must be non-empty and <= 500 chars';
  end if;
  if p_normalized_answer is null or length(trim(p_normalized_answer)) = 0 or length(p_normalized_answer) > 200 then
    raise exception 'p_normalized_answer must be non-empty and <= 200 chars';
  end if;

  insert into public.writing_answer_statistics as w (
    word_id, registered_meaning, student_answer, normalized_answer,
    count, distinct_student_ids, first_seen, last_seen
  )
  values (
    p_word_id, p_registered_meaning, p_student_answer, p_normalized_answer,
    1,
    case when p_student_id is null then '{}'::uuid[] else array[p_student_id] end,
    now(), now()
  )
  on conflict (word_id, registered_meaning, normalized_answer) do update
  set
    count = w.count + 1,
    student_answer = excluded.student_answer,
    last_seen = now(),
    distinct_student_ids = case
      -- 학생 UUID가 없으면(익명/미확정 세션) 배열을 건드리지 않는다.
      when p_student_id is null then w.distinct_student_ids
      -- 이미 목록에 있으면 중복 추가 안 함.
      when p_student_id = any(w.distinct_student_ids) then w.distinct_student_ids
      -- 상한 200개 초과 시 더 이상 추가 안 함(count 자체는 계속 증가).
      when coalesce(array_length(w.distinct_student_ids, 1), 0) >= 200 then w.distinct_student_ids
      else array_append(w.distinct_student_ids, p_student_id)
    end;
end;
$$;

-- SECURITY DEFINER 함수는 기본적으로 PUBLIC에 EXECUTE 권한이 부여되므로
-- 먼저 명시적으로 회수한 뒤, 의도한 대상(anon/authenticated — 학생이
-- 로그인 세션에서 직접 호출하는 경로, 요구사항 명세대로 그랜트)에만 다시
-- 부여한다. 이 함수는 테이블 자체에 대한 INSERT/UPDATE 권한 없이도(테이블
-- 단위 GRANT는 anon/authenticated에게 SELECT + UPDATE(status,
-- status_changed_at)뿐 — § 위 1번 섹션) SECURITY DEFINER라 함수 소유자
-- 권한으로 실행되어 count/accepted_count/rejected_count/
-- distinct_student_ids까지 쓸 수 있다 — "테이블 직접 쓰기 권한 없이 RPC
-- 만으로 증가 가능한 구조"로 남용 면적을 이 함수 하나(입력 검증 포함)로
-- 좁힌 것이 의도된 설계다.
revoke all on function public.record_writing_answer_stat(uuid, text, text, text, uuid) from public;
grant execute on function public.record_writing_answer_stat(uuid, text, text, text, uuid) to anon, authenticated, service_role;

-- ── 3) ai_usage_daily 절약 컬럼(구현 지시 3 — "절약 집계") ──────────────
-- ALTER TABLE IF EXISTS로 감싸 supabase_v3_8_ai_usage_daily.sql이 아직
-- 실행 전이어도(테이블 자체가 없어도) 이 문장이 에러 없이 조용히 no-op
-- 된다(헌법 규칙 9 — 실행 순서 무관). v3.8이 나중에 실행되면 그 테이블
-- 정의에는 이 3개 컬럼이 없으므로, 그 이후 이 v3.9 파일을 (다시) 실행하면
-- 그때 컬럼이 추가된다 — 두 파일 실행 순서가 어느 쪽이든 최종 상태는
-- 동일하다.
alter table if exists ai_usage_daily
  add column if not exists rules_resolved_count integer not null default 0; -- 클라이언트가 자체 규칙(exact_match/synonym/levenshtein)으로 확정 처리한 건수(요청 바디 clientStats.rulesResolvedCount로 보고받음)
alter table if exists ai_usage_daily
  add column if not exists cache_hit_count integer not null default 0;      -- 이번 실행에서 spelling_ai_grading_cache 캐시로 채운 건수
alter table if exists ai_usage_daily
  add column if not exists stats_skip_count integer not null default 0;    -- 이번 실행에서 writing_answer_statistics 반복 오답 스킵으로 AI 호출을 건너뛴 건수
-- ai_item_count는 신설하지 않는다 — 기존 item_count 컬럼(v3.8, "그날 실제
-- AI로 전송된 항목 수")을 그대로 재사용한다(§ 계약).

-- (조정자 검토 반영, 2026-07-24) comment on column은 IF EXISTS 가드가 불가능한
-- 구문이라, ai_usage_daily 테이블 자체가 아직 없는 상태(v3_8 미실행 — 현재
-- 라이브가 실제로 이 상태)에서 이 파일을 먼저 실행하면 42P01(undefined_table)
-- 로 스크립트 전체가 중단돼 아래 RPC/알림 문장까지 실행되지 않는다 — 헤더의
-- "실행 순서 무관" 보장을 깨는 회귀였다. to_regclass로 테이블 존재를 먼저
-- 확인한 뒤에만 comment 3문장을 실행하는 DO 블록으로 감싼다(위 alter table
-- if exists ... add column if not exists가 테이블이 있을 때만 이미 컬럼을
-- 만들어 두므로, 여기서는 테이블 존재만 확인하면 컬럼 존재는 보장된다).
-- comment on은 동적 SQL이 아니라 정적 구문이라 PL/pgSQL DO 블록 안에서
-- EXECUTE 없이 그대로 실행 가능하다.
do $$
begin
  if to_regclass('public.ai_usage_daily') is not null then
    comment on column ai_usage_daily.rules_resolved_count is '클라이언트가 로컬 규칙으로 자체 확정한 건수 누계(비용 무관, 절약 집계용)';
    comment on column ai_usage_daily.cache_hit_count is 'spelling_ai_grading_cache 캐시로 AI 호출 없이 채운 건수 누계';
    comment on column ai_usage_daily.stats_skip_count is 'writing_answer_statistics 반복 오답 통계로 AI 호출을 건너뛴 건수 누계';
  end if;
end
$$;

-- PostgREST 스키마/권한 캐시 즉시 갱신(신규 테이블/컬럼/RPC 함수 인식).
notify pgrst, 'reload schema';
