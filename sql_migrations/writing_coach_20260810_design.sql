-- sql_migrations/writing_coach_20260810_design.sql (2026-08-09 작성)
-- Writing Coach MVP — 저장 스키마 **설계 초안** (docs/WRITING_COACH.md §8)
--
-- ⛔ 실행 금지(DESIGN ONLY — DO NOT RUN):
--   이 파일은 아직 실행 대상이 아니다. 현 MVP는 DB 접근 0으로 완전히
--   동작하며(완료 요약을 저장하는 코드 자체가 아직 없음), 이 파일은 후속
--   "완료 요약 저장" 작업이 시작될 때 운영자 검토를 거쳐 실행 여부/시점을
--   결정한다. 실행하게 되더라도 운영자만, Supabase 대시보드 SQL Editor에서
--   수동 실행한다(CLAUDE.md 규칙 8 — 에이전트/CI는 DDL 실행 권한 없음).
--
-- 무엇을 하는가(전부 순수 추가 — additive):
--   · 신규 테이블 2개: writing_submissions(세션 요약 1행) ·
--     writing_attempts(시도별 이력 N행).
--   · 인덱스, RLS, GRANT. 기존 테이블 변경 0.
--
-- 왜 이 형태인가(설계 근거):
--   · submissions/attempts 2테이블 분리 — 관리자 통계(자주 틀린 유형,
--     혼자 고침 비율)는 요약 1행으로 충분하고, 시도별 원문 이력은 교사가
--     개별 학생을 들여다볼 때만 필요하다. 통계 쿼리가 무거운 이력 테이블을
--     스캔하지 않게 축을 분리한다.
--   · student_id는 uuid FK — 학생 식별은 항상 students.id(UUID)로 하고
--     이름 문자열 매칭 금지(CLAUDE.md 규칙 4, v1.6 P0 사고의 교훈).
--   · errors jsonb — 오류는 taxonomy 코드(snake_case slug,
--     src/utils/writing/errorTaxonomy.js의 14종)로 기록한다. 로컬 규칙 →
--     AI 검사 단계 전환(docs/WRITING_COACH.md §7)에도 스키마가 안 바뀌도록
--     코드 체계를 클라이언트와 공유하는 것이 핵심.
--   · self_corrected_count — 핵심 KPI(혼자 고침 비율)의 분자. 판정 로직은
--     클라이언트 순수 모듈(writingSession.js)이 결정론적으로 계산한 값을
--     그대로 기록한다(서버 재계산 없음 — MVP 단순성 우선, 위변조 방어는
--     성적/보상과 무관한 관찰 지표라 리스크 낮음).
--
-- 안전 원칙(CLAUDE.md 규칙 9 — 실행 순서 무관):
--   · 클라이언트 코드가 먼저 배포돼도 무해 — 현 MVP는 이 테이블을 아예
--     참조하지 않는다. 후속 저장 코드는 테이블 부재(42P01/PGRST205)를
--     감지해 조용히 no-op 폴백해야 한다(exampleLibrary.js의
--     isMissingTableError 관례).
--   · 이 SQL만 먼저 실행돼도 무해 — 어떤 기존 화면도 이 테이블을 참조하지
--     않는다. 전 구문 멱등(if not exists / do $$ 가드).
--   · 파괴적 구문(테이블/전체행 삭제·비우기류) 0개 — 이 저장소 PreToolUse
--     훅이 그런 패턴을 애초에 차단한다.

-- ════════════════════════════════════════════════════════════════════════
-- 1) writing_submissions — 쓰기 세션 요약(세션당 1행)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists writing_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  -- sentence(현 MVP) / guided / free — 3단계 모드(docs/WRITING_COACH.md §2)를
  -- 처음부터 구분해 두면 모드 추가 때 스키마 변경이 없다.
  topic_type text not null default 'sentence'
    check (topic_type in ('sentence', 'guided', 'free')),
  target_words jsonb not null default '[]'::jsonb,   -- ["park", ...] 오늘 단어
  original_text text not null,                       -- 첫 제출 문장
  final_text text,                                   -- 마지막 제출 문장(미완료 시 null 허용)
  attempt_count int not null default 0 check (attempt_count >= 0),
  self_corrected_count int not null default 0 check (self_corrected_count >= 0),
  completed boolean not null default false,
  -- 세션에서 관측된 오류 유형 요약: [{ "type": "tense", "selfCorrected": true }, ...]
  -- (getSessionSummary + resolvedErrors 구조 그대로 — 통계는 이 컬럼만 읽음)
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_writing_submissions_student
  on writing_submissions (student_id, created_at desc);
-- 월별 오류 유형 통계가 기간 스캔이라 created_at 단독 인덱스도 준비
create index if not exists idx_writing_submissions_created
  on writing_submissions (created_at desc);

-- ════════════════════════════════════════════════════════════════════════
-- 2) writing_attempts — 시도별 이력(교사 개별 열람용)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists writing_attempts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references writing_submissions(id) on delete cascade,
  attempt_no int not null check (attempt_no >= 1),
  text text not null,
  -- 이 시도에서 남아 있던 오류: [{ "type": "article", "span": {...}, "hint": "..." }]
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (submission_id, attempt_no)
);

create index if not exists idx_writing_attempts_submission
  on writing_attempts (submission_id, attempt_no);

-- ════════════════════════════════════════════════════════════════════════
-- 3) RLS + GRANT
-- ════════════════════════════════════════════════════════════════════════
-- 현행 관례(v3_4 계열 — supabase_v3_13의 동일 패턴): anon 개방 정책으로
-- 시작한다. 이 앱은 학생이 anon key로 직접 읽고 쓰는 구조라(서버리스 함수
-- 12개 한도로 쓰기 프록시 신설도 불가 — docs/WRITING_COACH.md §7 BLOCKED
-- 참고) 개방 정책이 현재 아키텍처의 일관된 선택이다.
--
-- ⚠️ 락다운 대안 표기: 운영자가 프로덕션 락다운(v3_13 하단 "락다운 합류
-- 블록" 방향)을 진행 중이면, 아래 개방 정책 대신
--   · anon: insert + 자기 student_id 행 select만
--   · 관리자 통계: service_role(또는 Edge Function) 경유
-- 로 바꾸는 쪽이 맞다 — 실행 시점의 저장소 락다운 상태에 맞춰 이 절만
-- 교체할 것(가드가 "정책 존재 여부"를 보므로, 락다운 정책을 먼저 만들면
-- 이 개방 절은 재실행돼도 조용히 스킵된다 — v3_13 리뷰 M1 교훈 그대로).
alter table writing_submissions enable row level security;
alter table writing_attempts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'writing_submissions') then
    create policy "allow anon all writing_submissions" on writing_submissions
      for all to anon using (true) with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'writing_attempts') then
    create policy "allow anon all writing_attempts" on writing_attempts
      for all to anon using (true) with check (true);
  end if;
end $$;

grant select, insert, update on writing_submissions to anon;
grant select, insert on writing_attempts to anon;

-- ════════════════════════════════════════════════════════════════════════
-- 4) 관리자 통계 뷰 쿼리 예시(참고용 주석 — 뷰 생성은 이 파일 범위 밖)
-- ════════════════════════════════════════════════════════════════════════
-- (a) 이번 달 자주 틀린 오류 유형 Top:
--   select e->>'type' as error_type, count(*) as cnt
--   from writing_submissions s, jsonb_array_elements(s.errors) e
--   where s.created_at >= date_trunc('month', now())
--   group by 1 order by cnt desc;
--
-- (b) 학생별 혼자 고친 비율(핵심 KPI — self-correction rate):
--   select s.student_id,
--          sum(s.self_corrected_count)::float
--            / nullif(sum(jsonb_array_length(s.errors)), 0) as self_correction_rate,
--          count(*) filter (where s.completed) as completed_sessions,
--          avg(s.attempt_count) as avg_attempts
--   from writing_submissions s
--   where s.created_at >= date_trunc('month', now())
--   group by s.student_id;
--
-- (c) 정답 공개 의존율(낮을수록 좋음 — 3회 이상 시도한 세션 비중의 근사.
--     attempts 이력과 조인하면 "공개 후에야 완료"를 정밀 집계 가능):
--   select count(*) filter (where attempt_count >= 3)::float / nullif(count(*), 0)
--   from writing_submissions
--   where created_at >= date_trunc('month', now());
