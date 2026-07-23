-- Paul Easy Voca v3.7 — 쓰기 답안 검토 AI 보조 v1.1, "이 단어 허용 답안으로
-- 저장" 감사/이력 테이블.
--
-- Supabase 대시보드 SQL Editor에서 전체를 그대로 붙여넣고 실행하세요.
-- (멱등 — 몇 번 실행해도 안전, 기존 데이터는 전혀 안 건드립니다.)
--
-- ⚠️ 이 파일은 운영자가 수동으로 실행합니다(에이전트는 Supabase에 DDL을
-- 직접 실행할 수 없음 — 헌법 규칙 8).
--
-- 이 SQL을 아직 실행하지 않아도 앱은 절대 깨지지 않습니다:
--   - "이 단어 허용 답안으로 저장" 버튼을 눌러도 기능 매칭에 실제로 쓰이는
--     words.accepted_meanings 저장(setWordAcceptedMeanings, 기존 로직 그대로)은
--     100% 정상 동작합니다.
--   - 이 테이블은 오직 감사/이력용(이 답이 언제/어떤 경로로 인정됐는지 기록)
--     이라, INSERT가 실패해도(테이블 미존재) src/utils/spellingReviewAiApi.js
--     의 recordAcceptedVariantBestEffort()가 조용히 삼킵니다(호출부에 에러
--     전파 안 함) — 즉 "같은 조합은 다음부터 AI 없이 규칙 매칭"이라는 핵심
--     동작(accepted_meanings 기반)은 이 테이블 실행 여부와 완전히 무관하게
--     성립합니다(기존 채점기 classifyLocally/isSpellingCorrect가 이미
--     accepted_meanings를 읽으므로).
--
-- 목적: word ID / 등록된 뜻(스냅샷) / 품사(가능한 경우) / 인정된 답안 /
-- 생성 주체 / 생성일을 남겨, 나중에 "이 동의어가 언제 왜 인정됐는지"를
-- 추적할 수 있게 한다. words.accepted_meanings(정식 인정 목록, 기능
-- 매칭의 원본)와 의미가 겹치지 않는다 — 저 컬럼이 여전히 "무엇이 정답으로
-- 인정됐는가"의 유일한 원본이고, 이 테이블은 "언제/누가/어떤 경로로"만
-- 추가로 담는 이력 로그다(docs/operations/task2-writing-analysis.md §8
-- "중복 테이블 만들지 않기" 원칙과 동일하게, 이 테이블도 기능 매칭에는
-- 절대 관여하지 않는다).

create table if not exists word_accepted_variants (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references words(id) on delete cascade,
  registered_meaning text,            -- 저장 당시 words.meaning 스냅샷(감사용)
  part_of_speech text,                -- 가능하면 기록(현재 UI에서는 별도 품사
                                       -- 입력 필드가 없어 대부분 null — 확장 지점)
  accepted_answer text not null,      -- 인정된 학생 답안 원문
  created_by text default 'admin_ui_ai_review', -- 생성 주체(관리자 PIN 등 자격증명은
                                       -- 절대 기록 안 함 — 헌법 규칙 11과 별개로,
                                       -- 이 필드는 애초에 "어떤 워크플로우로
                                       -- 생성됐는가"만 담는 고정 라벨)
  created_at timestamptz not null default now()
);

create index if not exists idx_word_accepted_variants_word_id on word_accepted_variants (word_id);
create index if not exists idx_word_accepted_variants_created on word_accepted_variants (created_at);

-- RLS: 이 테이블은 관리자 화면(브라우저, anon key)이 직접 INSERT한다(다른
-- 관리자 전용 테이블과 동일 관례 — 실제 접근 통제는 UI 단의 관리자 PIN
-- 게이트가 담당, 이 앱은 anon key 하나로 동작하는 구조라는 기존 전제와
-- 동일함, supabase_v2_0_spelling_mixed.sql 주석 참고). 다만 이력 테이블
-- 성격상 UPDATE/DELETE는 grant하지 않는다(append-only 감사 로그 — 실수로
-- 이력을 고치거나 지우는 경로를 아예 없앤다).
alter table word_accepted_variants enable row level security;
drop policy if exists "allow anon insert" on word_accepted_variants;
create policy "allow anon insert" on word_accepted_variants for insert with check (true);
drop policy if exists "allow anon select" on word_accepted_variants;
create policy "allow anon select" on word_accepted_variants for select using (true);

grant select, insert on table word_accepted_variants to anon, authenticated;
-- update/delete는 의도적으로 grant하지 않음(append-only 이력).
