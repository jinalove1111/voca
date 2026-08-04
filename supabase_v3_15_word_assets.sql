-- supabase_v3_15_word_assets.sql (2026-08-04)
-- Word Asset Library — 단어 텍스트 키 기반 "콘텐츠 자산" 별도 테이블.
--
-- 무엇을 하는가(전부 순수 추가 — additive):
--   · 신규 테이블 1개: word_assets. words 테이블은 단 한 줄도 건드리지
--     않는다(컬럼 추가/변경/삭제 전부 없음).
--   · 인덱스 4개, RLS(anon SELECT-only — 아래 "RLS 설계 정정" 참고), GRANT.
--   · 규칙 기반 백필(AI 미사용) — 기존 words 691행의 example_text/
--     memory_tip을 그대로 word_assets에 복사해 599개 고유 단어 행을 만든다.
--
-- 왜 words를 안 건드리는가(라이브 실측 근거, 오케스트레이터 제공):
--   · words 테이블 실측: 총 691행 / 고유 단어(대소문자·공백 무시) 599개 /
--     중복 13.3%(최다 4회 등장). 즉 같은 단어가 여러 유닛에 최대 4번
--     중복 등록돼 있다.
--   · words 스키마를 전혀 바꾸지 않으면 기존 학생·반·숙제·채점 경로에
--     구조적으로 영향이 0이고, 691행에 대한 백필도 불필요하며(신규
--     word_assets 599행만 채우면 됨), 롤백은 "클라이언트가 word_assets를
--     조회하지 않게 하는 것" 하나로 완전 가역이다.
--   · word_key(정규화 텍스트) 단위로 묶으면 유닛 컨텍스트가 사라진다 —
--     예: 중복 단어 81종을 조사한 결과 41종은 유닛마다 뜻이 다르다
--     (temperature = 체온/기온 등, 동철이의 아님·같은 표기·다른 문맥 뜻).
--     그래서 이 테이블은 "채점 진실"이 아니라 "보조 콘텐츠 자산"으로만
--     설계됐다 — 아래 meaning_primary 컬럼 주석 참고.
--
-- RLS 설계 정정(2026-08-04, 오케스트레이터 지시 — 최초 지시였던 "개방 후
-- 락다운 합류 블록"(v3.13 관례)을 뒤집는 정정): 라이브 실측으로
-- supabase_v3_11_lockdown_curriculum_write.sql이 이미 적용돼 있음이
-- 확인됐다(anon key로 words INSERT 시도 시 42501 반환 — 즉 words는 이미
-- anon SELECT-only). words와 논리적으로 같은 신뢰 등급인 word_assets를
-- "개방 정책으로 시작"하면 이미 잠긴 문을 다시 여는 퇴행이 되므로, 이
-- 파일은 처음부터 anon SELECT-only로 만든다(v3_11과 동일 패턴 — drop
-- policy if exists 후 단일 select 정책만 생성, "정책 존재 여부로 skip"
-- 가드 자체가 불필요 — 애초에 개방 정책을 절대 만들지 않으므로 v3_13이
-- 겪은 "락다운 후 재실행 시 개방 정책 재생성" 리스크가 이 파일에는 구조적으로
-- 없다). 쓰기는 service_role(향후 Edge Function/관리 스크립트) 전용.
--
-- 안전 원칙(CLAUDE.md 규칙 9 — 코드보다 먼저/나중 어느 순서로 실행돼도
-- 앱이 절대 깨지지 않는다):
--   · 이 SQL을 실행하기 전에 관련 클라이언트 코드가 먼저 배포돼도 무해하다
--     — word_assets를 조회하는 모든 함수는(향후 작성 시) 테이블 부재
--     (42P01/PGRST205)를 감지해 빈 결과로 폴백해야 한다(wordLibrary.js의
--     isMissingTableError 재사용 원칙, 재구현 금지).
--   · 반대로 이 SQL만 실행하고 코드가 아직 없어도, 기존 어떤 화면도 이
--     신규 테이블을 아직 참조하지 않으므로 100% 무해하다.
--   · 이미지 생성은 이 파일 범위가 아니다 — image_prompt/image_url/
--     image_status 컬럼은 미래 호환을 위한 준비일 뿐, 이 마이그레이션은
--     이미지를 생성하지도 큐에 넣지도 않는다(image_status 기본값 'none').
--   · 파괴적 구문(테이블/전체행 삭제류) 0개 — 이 저장소 PreToolUse 훅이
--     그런 패턴을 애초에 차단한다. 백필은 INSERT ... ON CONFLICT DO NOTHING
--     하나뿐(멱등 — 여러 번 실행해도 중복 행이 생기지 않음).
--
-- 실행 주체: 운영자만, Supabase 대시보드 SQL Editor에서 수동 실행
-- (CLAUDE.md 규칙 8 — 에이전트는 DDL을 직접 실행할 권한이 없다).
--
-- 롤백 노트: 전부 additive이므로 "롤백 = 신규 테이블 미사용" — 클라이언트가
-- 자동 폴백한다. 물리 삭제는 하지 않는다.

-- ════════════════════════════════════════════════════════════════════════
-- word_assets — 단어 텍스트 키 기반 콘텐츠 자산
-- ════════════════════════════════════════════════════════════════════════
create table if not exists word_assets (
  id uuid primary key default gen_random_uuid(),

  -- 조회 키. word_key = lower(btrim(word)) — 대소문자/앞뒤 공백 무시 정규화.
  -- sense_key는 동형이의어(같은 표기, 근본적으로 다른 뜻) 분리용 예약
  -- 슬롯이다 — 현재는 전부 ''(단일 의미 취급)로만 채워진다. 별도
  -- word_key 단독 인덱스는 만들지 않는다 — unique(word_key, sense_key)
  -- 복합 btree 인덱스가 word_key 단독 조회(leftmost prefix)도 이미
  -- 커버한다.
  word_key text not null,
  sense_key text not null default '',
  word text not null, -- 원본 표기(대표 표기 1개, btrim만 적용)

  -- ⚠️ meaning_primary는 "표시/힌트 전용"이다. 채점 진실은 영구히
  -- words.meaning + words.accepted_meanings(교사가 유닛별로 직접 입력한
  -- 값)이다 — word_assets는 word_key(정규화 텍스트) 단위로만 존재해
  -- 유닛 컨텍스트가 없으므로, 중복 단어 81종 중 41종처럼 유닛마다 뜻이
  -- 다른 경우(예: temperature = 체온/기온) 이 필드로 채점하면 정답을
  -- 오답 처리할 위험이 있다. 클라이언트는 이 필드를 절대 채점에 쓰지
  -- 말 것.
  meaning_primary text,
  part_of_speech text,
  cefr text, -- A1/A2/B1/B2/C1/C2 자유 텍스트. DB CHECK 없음 — 값 검증은 애플리케이션 레벨(콘텐츠 메타데이터라 학생 채점과 무관, 잘못된 값이 들어와도 안전)

  pronunciation_uk text,

  example_sentence text,
  example_translation text,
  -- 예문 필드만의 출처(레코드 전체 출처인 source와 별개 — 예: 뜻은 교사
  -- 입력(source='teacher')인데 예문은 words.example_text 규칙 기반
  -- 백필(import)인 경우를 구분해 표현하기 위함).
  example_source text not null default 'none'
    check (example_source in ('none', 'import', 'ai', 'teacher')),

  -- 콘텐츠 난이도(1~5, 정수) — supabase_v3_13_curriculum_engine_phase0.sql의
  -- examples.difficulty와 동일 도메인. src/learning/memory/difficulty.js가
  -- 계산하는 "학생별 0~1 행동 점수"(computeDifficulty, 여러 신호를 가중
  -- 합산)와는 이름만 비슷할 뿐 완전히 다른 값이다 — 소유자·도메인·갱신
  -- 주체가 다르므로 혼동 금지. 이 컬럼은 콘텐츠 저작 시점의 정적 난이도용.
  difficulty int check (difficulty between 1 and 5),

  image_prompt text,
  image_url text,
  image_status text not null default 'none'
    check (image_status in ('none', 'prompt_ready', 'queued', 'generating', 'ready', 'failed')),

  gesture text,
  emoji text,
  story_memory text,

  -- ⚠️ base_review_interval_days는 학생별 복습 상태가 아니다. 이 자산의
  -- "기본" 간격(콘텐츠 메타데이터, 예: 향후 "추천 시작 박스" 참고용)일
  -- 뿐이다. 학생별 실제 복습 간격/박스 상태는 src/learning/memory/
  -- leitner.js가 전적으로 소유하며(student_progress.review_data.
  -- memoryEngine.boxes에 저장), 이 컬럼을 절대 읽거나 쓰지 않는다. 도메인은
  -- leitner.js의 BOX_INTERVALS_DAYS=[0,1,3,7,14,30]과 정확히 일치시켰다.
  base_review_interval_days int check (base_review_interval_days in (0, 1, 3, 7, 14, 30)),

  tags text[],
  synonyms text[],
  antonyms text[],

  source text not null default 'teacher' check (source in ('teacher', 'import', 'rule', 'ai')),

  -- v3_13(examples 테이블)과 동일한 출처·승인 표준 블록 관례를 재사용한다
  -- (설계 문서 §3 계약과 동일 4단계 enum — draft/pending/approved/rejected).
  -- 단, 이 컬럼의 학생 노출 강제는 이 파일 범위가 아니다(향후 조회
  -- 함수가 담당, examples의 fetchApprovedExamplesForWords와 동일 패턴을
  -- 따를 것을 의도).
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'pending', 'approved', 'rejected')),

  -- 이 자산 행 전체의 생성 진행 상태(필드별 부분 생성을 표현).
  pipeline_status text not null default 'pending'
    check (pipeline_status in ('pending', 'partial', 'complete', 'failed')),
  generated_fields jsonb, -- 어떤 필드가 무엇(rule/ai/import/teacher)으로 채워졌는지 기록(사실만, 추론 없음)
  ai_model text,
  created_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (word_key, sense_key)
);

-- ────────────────────────────────────────────────────────────────────────
-- 인덱스
-- ────────────────────────────────────────────────────────────────────────
create index if not exists idx_word_assets_pipeline_status on word_assets(pipeline_status);
create index if not exists idx_word_assets_image_status on word_assets(image_status);
create index if not exists idx_word_assets_cefr on word_assets(cefr);
create index if not exists idx_word_assets_approval_status on word_assets(approval_status);

-- ────────────────────────────────────────────────────────────────────────
-- RLS — anon SELECT-only로 시작(위 "RLS 설계 정정" 문단 참고). words/
-- classes/units와 동일 신뢰 모델(supabase_v3_11_lockdown_curriculum_write.sql).
-- ────────────────────────────────────────────────────────────────────────
alter table word_assets enable row level security;
drop policy if exists "word_assets anon read only" on word_assets;
create policy "word_assets anon read only" on word_assets for select using (true);
grant select on table word_assets to anon, authenticated;
-- INSERT/UPDATE/DELETE 정책을 만들지 않는다 = RLS default-deny. anon/
-- authenticated는 SELECT GRANT만 받았으므로 설사 정책이 있어도 애초에
-- 테이블 권한 자체가 없다(GRANT와 RLS 정책 이중 방어). 쓰기는
-- service_role(RLS 우회, 향후 Edge Function/관리 스크립트) 전용.

-- ── [역방향 비상 블록 — 주석 처리, 평시 실행 절대 금지] ──────────────────
-- 이 블록은 "락다운 합류용"이 아니라 반대로 "락다운을 임시로 되돌려야
-- 할 때"를 위한 비상용이다(예: service_role 키 없이 급히 관리자 화면에서
-- anon 직접 쓰기로 자산을 채워야 하는 예외 상황). 실행하면 학생을 포함해
-- 배포된 anon key를 아는 누구나 브라우저에서 word_assets 행을 자유롭게
-- 위조(INSERT/UPDATE/DELETE)할 수 있게 된다 — 콘텐츠 자산이므로 채점
-- 정답 자체를 오염시키지는 않지만(meaning_primary는 채점에 안 쓰임),
-- 이미지/발음/예문 등 학생에게 노출되는 콘텐츠가 임의로 바뀔 수 있다.
-- 반드시 필요한 경우에만, 짧은 시간만 열어두고 즉시 위 SELECT-only
-- 정책으로 되돌릴 것.
--
-- alter table word_assets enable row level security;
-- drop policy if exists "word_assets anon read only" on word_assets;
-- create policy "word_assets anon all (EMERGENCY)" on word_assets for all using (true) with check (true);
-- grant select, insert, update, delete on word_assets to anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- 백필 — 규칙 기반, AI 비용 0원 (기존 words의 example_text/memory_tip을
-- 그대로 복사). words 691행 → 고유 word_key 599개로 중복 제거(distinct on).
-- 같은 word_key가 여러 유닛에 걸쳐 있을 때 어느 행을 대표로 남길지는
-- words.created_at 컬럼 존재가 라이브에서 확인되지 않아(DATABASE.md
-- "words 역추적" 섹션 — 원본 DDL 없음) 정렬 기준으로 쓰지 않고, 대신
-- words.id(uuid, 항상 존재 보장)를 결정론적 타이브레이커로 쓴다 —
-- "가장 최근" 대신 "word_key당 안정적으로 동일한 1개 행"만 보장하면
-- 충분하다(대표 뜻/예문 선택 자체는 이후 교사가 검수·수정할 대상).
-- 멱등: on conflict (word_key, sense_key) do nothing — 재실행해도 중복
-- 삽입되지 않는다.
-- ════════════════════════════════════════════════════════════════════════
insert into word_assets (
  word_key, sense_key, word, meaning_primary,
  example_sentence, example_translation, story_memory,
  example_source, source, approval_status, pipeline_status
)
select distinct on (lower(btrim(w.word)))
  lower(btrim(w.word)) as word_key,
  '' as sense_key,
  btrim(w.word) as word,
  w.meaning as meaning_primary,
  w.example_text as example_sentence,
  w.example_translation as example_translation,
  w.memory_tip as story_memory,
  case when w.example_text is not null then 'import' else 'none' end as example_source,
  'import' as source,
  'draft' as approval_status,
  'pending' as pipeline_status
from words w
where w.word is not null and btrim(w.word) <> ''
order by lower(btrim(w.word)), w.id
on conflict (word_key, sense_key) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- 실행 후 검증 쿼리
-- ════════════════════════════════════════════════════════════════════════
-- (a) 신규 테이블 존재 확인:
--   select table_name from information_schema.tables where table_name = 'word_assets';
-- (b) 백필 결과 599행 확인(실측 고유 단어 수와 일치해야 함):
--   select count(*) from word_assets;
-- (c) 컬럼 스팟 체크:
--   select column_name from information_schema.columns
--   where table_name = 'word_assets'
--     and column_name in ('word_key','sense_key','meaning_primary','example_source',
--                          'base_review_interval_days','approval_status','pipeline_status');
-- (d) CHECK 제약 확인(example_source/difficulty/image_status/
--     base_review_interval_days/source/approval_status/pipeline_status 7개):
--   select conname from pg_constraint where conrelid = 'word_assets'::regclass and contype = 'c';
-- (e) 인덱스 확인:
--   select indexname from pg_indexes where tablename = 'word_assets';
-- (f) RLS 정책 확인 — 정확히 1개, SELECT 전용이어야 함:
--   select tablename, policyname, cmd from pg_policies where tablename = 'word_assets';
-- (g) anon 쓰기 차단(42501) 확인 — ⚠️ 이 SQL Editor 세션 자체는 postgres
--     역할로 실행되어 RLS/GRANT를 우회하므로 여기서는 직접 검증 불가.
--     scripts/testRlsSecurity.mjs와 동일한 방식으로 anon key를 쓰는
--     별도 JS 클라이언트(브라우저 또는 node + @supabase/supabase-js)로
--     word_assets에 INSERT 1행을 시도해 42501(permission denied)이
--     반환되는지 실측 확인할 것.
