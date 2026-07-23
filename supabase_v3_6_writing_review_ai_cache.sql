-- Paul Easy Voca v3.6 — 쓰기 답안 검토 AI 보조 판정 캐시.
--
-- Supabase 대시보드 SQL Editor에서 전체를 그대로 붙여넣고 실행하세요.
-- (멱등 — 몇 번 실행해도 안전, 기존 데이터는 전혀 안 건드립니다.)
--
-- ⚠️ 이 파일은 운영자가 수동으로 실행합니다(에이전트는 Supabase에 DDL을
-- 직접 실행할 수 없음 — 헌법 규칙 8). Edge Function(supabase/functions/
-- grade-writing-answers) 배포도 별도로 운영자 수동입니다:
--   supabase functions deploy grade-writing-answers
--   supabase secrets set ANTHROPIC_API_KEY=... ADMIN_PIN=...
--
-- 이 SQL을 아직 실행하지 않아도 앱은 절대 깨지지 않습니다:
--   - 기존 쓰기 답안 검토 큐(spelling_review_queue)/인정 뜻(words.
--     accepted_meanings) 워크플로우는 이 테이블과 전혀 무관하게 100%
--     그대로 동작합니다(수동 인정/무시 버튼은 이 테이블을 참조하지 않음).
--   - Edge Function은 이 테이블 조회/기록이 실패하면(테이블 미존재) 캐시
--     없이 계속 진행하도록 이미 작성돼 있습니다(supabase/functions/
--     grade-writing-answers/index.ts의 cacheTableMissing 처리).
--
-- 목적: 동일 (단어, 등록뜻 스냅샷, 정규화된 학생답, 품사, 프롬프트 버전,
-- 모델) 조합에 대한 AI 판정을 재사용해, 같은 조합이 나중에 다시 제출돼도
-- 매번 새로 AI를 호출하지 않게 한다. words.accepted_meanings(정식 인정
-- 완료, 관리자 승인 필요)와는 의미가 겹치지 않는다 — 이 테이블은 "AI가
-- 예전에 뭐라고 했었는가"만 담는 캐시이고, 관리자가 실제로 인정 버튼을
-- 눌러야만 accepted_meanings에 반영된다(docs/operations/
-- task2-writing-analysis.md §8 중복 테이블 검토).
--
-- 캐시 키 구성(2026-07-23, 파이프라인 경화 — pipeline.js buildCacheKey와
-- 1:1 대응, 참고: 이 테이블은 그 키 문자열을 하나의 컬럼에 통으로 저장하지
-- 않고 아래 6개 컬럼(word_id/meaning_snapshot/normalized_answer/
-- part_of_speech/prompt_version/model)으로 분해해 저장한다 — 각 컬럼이
-- text/uuid라 Postgres에서 길이 제한이 없으므로 "키가 길어져 컬럼이
-- 넘친다"는 우려는 해당 없음):
--   1. word_id            — words(id) FK
--   2. meaning_snapshot   — 호출 당시 words.meaning 스냅샷. 나중에 관리자가
--                           meaning을 고치면 이 값이 달라져 캐시가 자동으로
--                           미스(재호출) 처리된다(의도된 동작).
--   3. normalized_answer  — pipeline.js normalizeForCompare() 결과(NFKC 기준,
--                           2026-07-23부터 NFC에서 NFKC로 변경 — 이미 저장된
--                           행이 없으므로 이번 변경엔 데이터 마이그레이션 불필요)
--   4. part_of_speech     — 현재 words 테이블에 품사 컬럼이 없어 사실상 항상
--                           빈 문자열('')이지만, 나중에 품사 데이터가 생기면
--                           같은 단어/뜻/답이라도 품사가 다르면 캐시가 분리
--                           되도록 자리를 미리 잡아둔다.
--   5. prompt_version     — pipeline.js PROMPT_VERSION 상수('v2'부터 시작).
--                           system 프롬프트(buildAiPrompt) 문구가 바뀌면 이
--                           상수만 올리면 예전 문구로 받은 캐시 판정이 새
--                           문구 기준으로 조용히 재사용되지 않고 자동 미스
--                           처리된다(§ 구현 지시 1 핵심 목적).
--   6. model              — pipeline.js AI_MODEL_ID 상수. 채점 모델이
--                           바뀌면(예: haiku -> sonnet) 마찬가지로 예전
--                           모델 판정을 새 모델 기준으로 재사용하지 않는다.
-- 이 파일이 아직 운영자 실행 전(§ 위 "운영자 실행 대기")이라 데이터 마이그
-- 레이션 없이 create table 본문 자체에 4/5번 컬럼을 추가했다 — 이미 실행된
-- 테이블이었다면 별도 ALTER TABLE 마이그레이션 파일이 필요했을 것.

create table if not exists spelling_ai_grading_cache (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references words(id) on delete cascade,
  meaning_snapshot text not null,     -- 호출 당시 words.meaning 스냅샷.
                                       -- 나중에 관리자가 meaning을 고치면
                                       -- 이 값이 달라져 캐시가 자동으로
                                       -- 미스(재호출) 처리된다(의도된 동작).
  normalized_answer text not null,    -- pipeline.js normalizeForCompare() 결과
  part_of_speech text not null default '', -- 캐시 키 4번 요소(§ 위 주석) —
                                       -- 현재 words에 품사 컬럼이 없어 항상
                                       -- '' 저장(사실상 no-op, 확장 지점).
  prompt_version text not null default 'v2', -- 캐시 키 5번 요소(§ 위 주석) —
                                       -- pipeline.js PROMPT_VERSION과 동일 값.
  decision text not null check (decision in ('accept','review','reject_candidate')),
  confidence numeric,
  reason text,
  suggested_synonym text,
  part_of_speech_warning text,
  meaning_scope_warning text,         -- v1.1(2026-07-23) 추가 — AI가 accept를
                                       -- 내리면서도 "등록된 여러 뜻 중 일부만
                                       -- 커버"/"의미가 인접하지만 완전 동일은
                                       -- 아님" 같은 경고를 실었을 때만 채워짐.
                                       -- 이 파일이 아직 실행 전이라(§ 위
                                       -- "운영자 실행 대기") 새 마이그레이션
                                       -- 파일을 따로 만들지 않고 이 파일
                                       -- 자체에 컬럼을 추가했다(멱등 —
                                       -- create table if not exists 안이라
                                       -- 처음 실행 시 이 컬럼까지 한 번에
                                       -- 생성됨).
  decision_source text not null,      -- 'levenshtein' | 'lemma' | 'ai' | 'exact_match' | 'synonym' 등
  model text not null default '',     -- 캐시 키 6번 요소(§ 위 주석) —
                                       -- 'claude-haiku-4-5' 등, decision_source
                                       -- ='ai'일 때만 실제 모델 id가 채워짐
                                       -- (그 외 로컬/캐시 재사용 경로는 이
                                       -- 테이블에 새 행을 안 씀 — 이 테이블
                                       -- 자체가 "AI 판정" 전용 캐시라서).
  input_tokens integer,               -- 토큰/비용 로깅(§ 구현 지시 6) — ai 판정 건에만 채움
  output_tokens integer,
  created_at timestamptz not null default now()
);

-- 유니크 키(구현 지시 1) — 기존 3필드(word_id, meaning_snapshot,
-- normalized_answer)에 part_of_speech/prompt_version/model 3개를 추가해
-- pipeline.js buildCacheKey의 6필드 키와 정확히 1:1 대응시킨다. 이 테이블이
-- 아직 미실행이라(§ 위) 기존 인덱스를 DROP 후 재생성할 필요 없이 처음부터
-- 이 정의로 생성된다.
create unique index if not exists uq_spelling_ai_cache_key
  on spelling_ai_grading_cache (word_id, meaning_snapshot, normalized_answer, part_of_speech, prompt_version, model);
create index if not exists idx_spelling_ai_cache_created on spelling_ai_grading_cache (created_at);

-- RLS: 기존 테이블들과 달리(anon 전체 허용 관례) 여기서는 한 단계 더
-- 보수적으로 SELECT만 anon/authenticated에 허용한다 — 실제 쓰기는 Edge
-- Function(service_role, RLS/GRANT를 우회)만 하므로 클라이언트에 불필요한
-- 쓰기 권한을 노출하지 않는다. 관리자 화면이 캐시 히트율 등을 참고용으로
-- 조회할 수도 있어 SELECT는 열어둔다.
alter table spelling_ai_grading_cache enable row level security;
drop policy if exists "allow anon select" on spelling_ai_grading_cache;
create policy "allow anon select" on spelling_ai_grading_cache for select using (true);
grant select on table spelling_ai_grading_cache to anon, authenticated;
-- insert/update/delete는 anon/authenticated에 GRANT하지 않음(의도적 —
-- service_role만 씀). 실행 순서 무관 안전: 이 GRANT가 없어도 클라이언트는
-- 애초에 이 테이블에 쓰기 시도를 하지 않는다(spellingReviewAiApi.js는
-- 조회만 하거나, Edge Function을 통해서만 간접적으로 기록됨).
