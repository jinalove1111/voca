-- supabase_v3_4_sentence_learning.sql (2026-07-23)
-- Sentence Learning v3.4 Phase A: 문장 학습 메타(핵심 문장/중요도/문법
-- 포인트/끊어읽기 청크) + 학생별 문장 진행도 + 문장-단어 연결.
--
-- 설계 근거:
--   · v3.3 Reading Foundation(passages/passage_sentences,
--     supabase_v3_3_reading.sql — 프로덕션 적용됨)을 그대로 확장한다.
--     새 계층을 발명하지 않고 passage_sentences에 학습 메타 컬럼 4개를
--     추가(additive)하고, 학생별 진행도는 word_status(v1.5)와 동일한
--     (student_id, 대상_id) unique 패턴의 신규 테이블로 둔다.
--   · 학생 식별은 students.id(UUID) FK — 이름 문자열 미사용(CLAUDE.md
--     규칙 4).
--   · RLS는 v1.3 이래 student_progress/word_status와 동일한 "allow anon
--     all" 관례(supabase_v1_5_word_status.sql / supabase_v3_3_reading.sql
--     의 정책 블록과 동일 신뢰 모델). 브라우저는 anon key만 사용하고
--     service_role key는 절대 클라이언트에 두지 않는다(api/*.js 전용).
--     자격증명/PIN류 민감 컬럼이 전혀 없는 학습 데이터 테이블이라 같은
--     관례가 적합하다.
--
-- 전부 순수 추가(additive) + 멱등. 삭제성 구문 0개. 기존 행 변경 0개
-- (add column의 default가 기존 문장 행에 안전한 기본값을 채울 뿐).
-- 실행 전에는 클라이언트가 컬럼/테이블 부재(42703/42P01)를 감지해
-- 기존 v3.3 동작으로 폴백한다(readingApi.js cascading 폴백,
-- sentenceProgressApi.js 빈 폴백 — CLAUDE.md 규칙 9).
--
-- 롤백 노트: 새 컬럼 4개는 default가 있어 기존 코드가 무시해도 무해하고,
-- sentence_progress/sentence_words는 완전히 고립된 신규 테이블이다(기존
-- 테이블을 참조만 함). 이 파일을 실행하지 않은 상태로 코드만 배포해도
-- 편집기의 신규 컨트롤이 비활성 안내로 폴백할 뿐 v3.3 기능 무손실.

-- ── 1) passage_sentences 학습 메타 컬럼(순수 추가) ──
-- is_key_sentence: 핵심 문장만 5단계 학습을 걷는다(비핵심은 보기/듣기만).
-- importance_level: 시험 중요도 1..5 (라벨은 src/utils/sentenceLearning.js
--   IMPORTANCE_LABELS가 진실 원천 — 5=반드시 암기 ... 1=참고).
-- grammar_point: 교사가 적는 문법 포인트 한 줄(선택).
-- chunks: 끊어읽기 청크 jsonb 배열(예: ["I went","to school","yesterday"]).
--   수동 입력 전용(AI 자동 분할 없음) — 유효한 2개 이상 배열이 아니면
--   클라이언트가 단일 청크 폴백(chunksOf).
alter table passage_sentences add column if not exists is_key_sentence boolean not null default false;
alter table passage_sentences add column if not exists importance_level int not null default 1;
alter table passage_sentences add column if not exists grammar_point text;
alter table passage_sentences add column if not exists chunks jsonb;

-- importance_level 범위 CHECK(1..5) — 제약이 없을 때만 추가(멱등).
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'passage_sentences_importance_level_check'
      and conrelid = 'passage_sentences'::regclass
  ) then
    alter table passage_sentences
      add constraint passage_sentences_importance_level_check
      check (importance_level between 1 and 5);
  end if;
end $$;

-- passage_sentences는 v3.3에서 테이블 단위 grant(select/insert/update/
-- delete)가 이미 있어 새 컬럼도 자동 포함된다(students처럼 컬럼 단위
-- grant로 회수된 테이블이 아님 — CLAUDE.md 규칙 10의 대상 아님).

-- ── 2) sentence_progress — 학생별 문장 학습 진행도 ──
-- 단계 흐름(진실 원천은 src/utils/sentenceLearning.js STAGES):
--   read → chunk → puzzle → one_blank → ko_to_en → mastered
create table if not exists sentence_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  sentence_id uuid not null references passage_sentences(id) on delete cascade,
  current_stage text not null default 'read'
    check (current_stage in ('read', 'chunk', 'puzzle', 'one_blank', 'ko_to_en', 'mastered')),
  completed_stages jsonb not null default '[]',
  attempt_count int default 0,
  correct_count int default 0,
  wrong_count int default 0,
  mastered_at timestamptz,
  last_practiced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, sentence_id)
);
create index if not exists idx_sentence_progress_student on sentence_progress(student_id);
create index if not exists idx_sentence_progress_sentence on sentence_progress(sentence_id);
alter table sentence_progress enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sentence_progress' and policyname = 'allow anon all sentence_progress') then
    create policy "allow anon all sentence_progress" on sentence_progress for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on sentence_progress to anon, authenticated;

-- ── 3) sentence_words — 문장 ↔ 유닛 단어 수동 연결(선택적) ──
-- 관리자가 나중에 수동으로 연결한다(이번 Phase에는 연결 UI 없음 —
-- pickBlank의 유닛 단어 우선 빈칸 선택 등에서 소비 예정).
create table if not exists sentence_words (
  id uuid primary key default gen_random_uuid(),
  sentence_id uuid not null references passage_sentences(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  created_at timestamptz default now(),
  unique(sentence_id, word_id)
);
create index if not exists idx_sentence_words_sentence on sentence_words(sentence_id);
create index if not exists idx_sentence_words_word on sentence_words(word_id);
alter table sentence_words enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sentence_words' and policyname = 'allow anon all sentence_words') then
    create policy "allow anon all sentence_words" on sentence_words for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on sentence_words to anon, authenticated;

-- ── 실행 후 검증 쿼리 ──
-- (a) 새 컬럼 4개 확인:
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'passage_sentences'
--     and column_name in ('is_key_sentence', 'importance_level', 'grammar_point', 'chunks');
-- (b) 기존 문장 행이 안전 기본값으로 채워졌는지(전부 false/1이어야 정상):
--   select count(*) filter (where is_key_sentence) as key_cnt,
--          count(*) filter (where importance_level <> 1) as lvl_cnt
--   from passage_sentences;
-- (c) importance_level CHECK 확인(1행):
--   select conname from pg_constraint
--   where conname = 'passage_sentences_importance_level_check';
-- (d) 신규 테이블(둘 다 0행이어야 정상 — 백필 없음):
--   select count(*) from sentence_progress;
--   select count(*) from sentence_words;
-- (e) RLS 정책 확인(각 1개씩):
--   select tablename, policyname from pg_policies
--   where tablename in ('sentence_progress', 'sentence_words');
-- (f) FK cascade 확인(confdeltype = 'c'):
--   select conname, confdeltype from pg_constraint
--   where conrelid in ('sentence_progress'::regclass, 'sentence_words'::regclass)
--     and contype = 'f';
