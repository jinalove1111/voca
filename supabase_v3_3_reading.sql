-- supabase_v3_3_reading.sql (2026-07-23)
-- Reading Foundation: 유닛에 소속되는 읽기 지문(passage) + 문장(sentence).
--
-- 설계 근거:
--   · 지문은 units(id)에 직접 매달린다 — v3.1 교재 도메인 모델(반 →
--     교재 → 유닛 → 단어, supabase_v3_1_textbooks.sql)에서 유닛은 이미
--     교재(textbook) 소속이므로, passages.unit_id 하나로 반→교재→유닛
--     계층을 자동으로 상속한다. 새 계층 개념을 발명하지 않는다 —
--     "기존 Unit 구조 확장" 요구를 units 테이블을 전혀 건드리지 않고
--     순수 추가 테이블 2개로 충족한다.
--   · RLS는 v1.3 이래의 "allow anon all" 관례(units/words/textbooks/
--     class_textbooks와 동일 신뢰 모델 — 관리자 쓰기도 anon key로 수행,
--     supabase_v3_1_textbooks.sql의 정책 블록 그대로). 자격증명/PIN류
--     민감 데이터가 전혀 없는 콘텐츠 테이블이라 같은 관례가 적합하다.
--
-- 전부 순수 추가(additive) + 멱등. 삭제성 구문 0개, 기존 테이블/행 변경
-- 0개. 실행 전에는 클라이언트(src/utils/readingApi.js)가 테이블 부재를
-- 감지해 빈 목록으로 폴백하고, 관리자 편집기는 "SQL 실행 후 사용 가능"
-- 안내만 표시한다(CLAUDE.md 규칙 9 — 코드가 먼저 배포돼도 앱이 깨지지
-- 않음).
--
-- 롤백 노트: passages/passage_sentences는 완전히 고립된 신규 테이블이다
-- (기존 테이블에 컬럼 추가도 없음). 지워도 클라이언트는 "지문 없음"
-- 폴백으로 복귀할 뿐 기존 기능(단어 학습/퀴즈/쓰기 등) 무손실.

-- ── 1) passages — 유닛별 읽기 지문 ──
create table if not exists passages (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  title text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_passages_unit on passages(unit_id);
alter table passages enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'passages' and policyname = 'allow anon all passages') then
    create policy "allow anon all passages" on passages for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on passages to anon, authenticated;

-- ── 2) passage_sentences — 지문 내 문장(영문 필수, 한글 번역 선택) ──
create table if not exists passage_sentences (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null references passages(id) on delete cascade,
  position int not null default 0,
  english text not null,
  korean text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_passage_sentences_passage on passage_sentences(passage_id);
alter table passage_sentences enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'passage_sentences' and policyname = 'allow anon all passage_sentences') then
    create policy "allow anon all passage_sentences" on passage_sentences for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on passage_sentences to anon, authenticated;

-- ── 실행 후 검증 쿼리 ──
-- (a) 테이블 생성 확인(둘 다 0행이어야 정상 — 백필 없음, 콘텐츠는 관리자가 입력):
--   select count(*) from passages;
--   select count(*) from passage_sentences;
-- (b) RLS 정책 확인(각 1개씩):
--   select tablename, policyname from pg_policies
--   where tablename in ('passages', 'passage_sentences');
-- (c) FK cascade 확인(지문을 지우면 문장이, 유닛을 지우면 지문이 함께 정리됨):
--   select conname, confdeltype from pg_constraint
--   where conrelid in ('passages'::regclass, 'passage_sentences'::regclass)
--     and contype = 'f';  -- confdeltype = 'c' (cascade)여야 함
