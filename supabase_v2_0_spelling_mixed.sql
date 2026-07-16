-- Paul Easy Voca v2.0 — 쓰기시험 양방향 혼합형(mixed) + 채점 관대화 지원 스키마.
--
-- Supabase 대시보드 SQL Editor에 전체를 그대로 붙여넣고 실행하세요. (멱등 —
-- 몇 번 실행해도 안전, 기존 데이터는 전혀 안 건드립니다.)
--
-- 라이브 실측(2026-07-17): classes.spelling_direction 컬럼이 아직 없음을
-- 확인 — 예전 supabase_spelling_direction_schema.sql이 실행되지 않은
-- 상태라, 그 내용을 이 파일에 합쳐 하나로 정리했습니다(이 파일 하나만
-- 실행하면 됩니다. 옛 파일은 따로 실행할 필요 없음).
--
-- 이 SQL을 아직 실행하지 않아도 앱은 절대 깨지지 않습니다:
--   - spelling_direction: wordLibrary.js가 컬럼 부재를 감지해 'kr2en' 폴백.
--   - accepted_meanings: words 조회가 컬럼 없이 재시도(빈 목록 취급).
--   - spelling_review_queue: spellingReviewApi.js가 테이블 부재 시 조용히
--     스킵(기록 안 함, 관리자 패널은 자동 숨김/안내).

-- 1) 반별 쓰기시험 출제 방향 — 'kr2en'(기본, 기존 동작) | 'en2kr' |
--    'random'(문제마다 50% 확률) | 'mixed'(세션 단위 정확 50:50 배분).
--    기본값이 기존 동작 그대로라 실행해도 어떤 반의 동작도 안 바뀝니다 —
--    관리자가 반별로 직접 바꿔야만 새 방향이 적용됩니다.
alter table classes
  add column if not exists spelling_direction text not null default 'kr2en';

-- 2) 단어별 "추가 인정 뜻" — 채점 시 words.meaning 외에 이 목록의 항목도
--    정답 후보로 합류(jsonb 문자열 배열, 예: ["질서", "순서"]).
--    관리자 화면에서 단어별 편집 + 교사 검토 큐의 "이 답 인정" 원클릭이
--    여기에 추가합니다. AI 자동 판정은 없음(운영자 방침).
alter table words
  add column if not exists accepted_meanings jsonb not null default '[]';

-- 3) 교사 검토 큐 — 영→한 문제에서 한글로 답했는데 오답 처리된 제출을
--    저장(첫 시도만). 교사가 보고 "이 답 인정"하면 그 단어의
--    accepted_meanings에 추가되어 다음부터 정답 처리됩니다.
--    status: 'pending'(대기) | 'accepted'(인정됨) | 'dismissed'(무시).
create table if not exists spelling_review_queue (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references words(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  submitted_answer text not null,
  direction text not null default 'en2kr',
  status text not null default 'pending',
  date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);
create index if not exists idx_spelling_review_queue_status on spelling_review_queue (status, created_at);

-- 같은 단어에 같은 답이 반복 제출돼도 큐가 무한정 불어나지 않게 —
-- 단어+제출답 조합은 1행만 유지(두 번째부터는 앱이 upsert-무시).
create unique index if not exists uq_spelling_review_word_answer
  on spelling_review_queue (word_id, submitted_answer);

-- RLS: 기존 테이블들과 동일한 정책(anon 전체 허용) — 이 앱은 anon key
-- 하나로 동작하는 구조(supabase_v1_8_entrance_test.sql 주석과 같은 상황).
-- 나중에 인증 체계가 생기면 함께 좁혀야 함. create policy는 if not exists가
-- 없어서 중복 실행 안전하게 drop 후 재생성.
alter table spelling_review_queue enable row level security;
drop policy if exists "allow anon all" on spelling_review_queue;
create policy "allow anon all" on spelling_review_queue for all using (true) with check (true);

-- v1.9(컬럼 단위 권한)를 이미 실행한 경우를 위한 명시적 grant — words에 새
-- 컬럼이 추가됐고, 새 테이블은 기본 권한을 따르지만 명시가 안전(fail-closed
-- 원칙, v1.9 파일 하단 주석 참고). v1.9 미실행 상태여도 무해.
grant select (accepted_meanings), update (accepted_meanings) on table words to anon, authenticated;
grant select, insert, update, delete on table spelling_review_queue to anon, authenticated;
