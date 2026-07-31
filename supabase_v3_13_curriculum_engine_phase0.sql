-- supabase_v3_13_curriculum_engine_phase0.sql (2026-07-31)
-- Curriculum Engine Phase 0 — 설계 승인 문서: docs/CURRICULUM_ENGINE.md
-- (§2 ER 다이어그램 / §12 마이그레이션 계획을 그대로 구현한 단일 파일).
--
-- 무엇을 하는가(전부 순수 추가 — additive):
--   · 신규 테이블 5개: publishers · grades · grammar_points(스키마만 — 라벨
--     시드 데이터는 이 파일 범위 밖, 아래 "범위 변경 기록" 참고) ·
--     unit_grammar_points · examples.
--   · 기존 테이블에 컬럼 추가만(add column if not exists): textbooks에
--     publisher_id/grade_id/level/book_order, units에
--     position/lesson_no/objectives.
--   · 인덱스, RLS(현행 anon 개방 — v3.4 관례), GRANT, 하단 검증 쿼리.
--
-- 왜 이 형태인가(설계 근거):
--   · 커리큘럼 구조 하부 절반(classes→class_textbooks→textbooks→units→
--     words/passages)은 이미 프로덕션이다(v3.1/v3.3/v3.4 실행 완료). 이
--     파일은 그 위에 빠진 상부 구조(출판사/학년 축, 문법 엔티티, 예문
--     모듈, 출처·승인 워크플로우)만 additive하게 얹는다 — 기존 테이블 재작성
--     없음(CLAUDE.md 규칙 1/3).
--   · examples는 unit_id/textbook_id 모두 NULL 허용 FK다 — 특정 유닛에
--     정렬되지 않은 범용 예문 풀(학년/레벨만 매칭)을 허용하기 위함(설계
--     문서 §2 각주). 유닛 정렬 예문이 학생 화면에서 항상 우선.
--   · approval_status는 boolean이 아니라 4단계 enum(draft/pending/approved/
--     rejected)이다 — reject·재검수·회수(approved→rejected)를 표현하려면
--     boolean으로는 불가능(설계 문서 §9 트레이드오프 표).
--   · 학생 노출은 이 SQL이 아니라 데이터 계층에서 강제한다
--     (src/utils/curriculum/exampleLibrary.js의
--     fetchApprovedExamplesForWords가 approval_status='approved'를 하드코딩)
--     — DB는 값의 정합성(CHECK)만 보장.
--   · grammar_points.code는 docs/reading/05-grammar-taxonomy.md의 12개 그룹
--     표준 문구에서 도출한 안정적 slug다(예: 'tense-past-progressive'). 이
--     코드가 unit_grammar_points/examples.grammar_point_id의 안정적 참조
--     대상이 되고, label(한국어 표시 텍스트)이 바뀌어도 코드는 유지된다.
--
-- 안전 원칙(CLAUDE.md 규칙 9 — 코드보다 먼저/나중 어느 순서로 실행돼도
-- 앱이 절대 깨지지 않는다):
--   · 이 SQL을 실행하기 전에 관련 클라이언트 코드(src/utils/curriculum/*,
--     src/learning/*)가 먼저 배포돼도 무해하다 — 모든 조회 함수는 테이블
--     부재(42P01/PGRST205)를 감지해 { rows:[], featureDisabled:true } 또는
--     {}로 폴백하고(exampleLibrary.js의 isMissingTableError 사용, wordLibrary.js
--     에서 import — 재구현하지 않음), 학생 플로우는 예문 단계가 조건부라
--     테이블이 없으면 그 단계 자체가 삽입되지 않는다(§8).
--   · 반대로 이 SQL만 실행하고 코드가 아직 배포되지 않아도, 기존 어떤
--     화면도 이 신규 테이블/컬럼을 아직 참조하지 않으므로 100% 무해하다.
--   · 파괴적 구문(테이블/전체행 삭제류) 0개 — 이 저장소 PreToolUse 훅이
--     그런 패턴을 애초에 차단한다.
--
-- 실행 주체: 운영자만, Supabase 대시보드 SQL Editor에서 수동 실행
-- (CLAUDE.md 규칙 8 — 에이전트는 DDL을 직접 실행할 권한이 없다). 실행 전후
-- 앱 무중단(순수 additive라 dry-run 불필요, 설계 문서 §12-2).
--
-- 롤백 노트: 전부 additive이므로 "롤백 = 신규 테이블/컬럼 미사용" — 클라이언트가
-- 자동 폴백한다. 물리 삭제는 하지 않는다(설계 문서 §12-3).
--
-- 범위 변경 기록(2026-07-31, 운영자 지시): 이 파일은 원래 설계 문서 §2가
-- 언급한 docs/reading/05-grammar-taxonomy.md 기반 ~120개 문법 라벨 시드
-- INSERT를 포함해 작성됐으나, 운영자가 구현 도중 "콘텐츠/시드/샘플/데모
-- 데이터는 일절 만들지 않는다(라벨 채우기는 후일 AI Curriculum Generator
-- 담당)"로 범위를 축소 지시해 시드 블록을 제거했다. grammar_points
-- 테이블/컬럼/인덱스/RLS/GRANT 구조는 설계 문서 그대로 유지 — 스키마만
-- 있고 행은 0개인 상태로 이 파일이 실행된다.

-- ════════════════════════════════════════════════════════════════════════
-- 1) publishers — 출판사 정규화(승인 사항, 설계 문서 §0)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists publishers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
alter table publishers enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'publishers' and policyname = 'allow anon all publishers') then
    create policy "allow anon all publishers" on publishers for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on publishers to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2) grades — 학년 축(승인 사항)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table grades enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'grades' and policyname = 'allow anon all grades') then
    create policy "allow anon all grades" on grades for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on grades to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 3) grammar_points — 문법 포인트 엔티티(스키마만, 시드 없음). code는
--    docs/reading/05-grammar-taxonomy.md 12개 그룹 표준 문구에서 도출하는
--    안정적 slug 규약을 따를 것을 의도했으나, 실제 라벨 행 채우기는 이
--    파일 범위 밖(위 "범위 변경 기록" 참고) — code UNIQUE 제약이 있어
--    나중에 어떤 방식(교사 수동/AI Generator)으로 채워도 자연히 멱등.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists grammar_points (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  grp text not null,
  grade_band text,
  created_at timestamptz not null default now()
);
create index if not exists idx_grammar_points_grp on grammar_points(grp);
alter table grammar_points enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'grammar_points' and policyname = 'allow anon all grammar_points') then
    create policy "allow anon all grammar_points" on grammar_points for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on grammar_points to anon, authenticated;

-- 시드 없음(2026-07-31 운영자 지시로 범위 축소) — docs/reading/05의 문법
-- 라벨 데이터 시딩은 이 파일의 책임이 아니다. grammar_points는 순수
-- 스키마만 이 파일에서 만들고, 실제 라벨 행은 후속 AI Curriculum
-- Generator(설계 문서 §11 Phase 5)가 채운다. 교사가 관리 화면에서 직접
-- 추가하는 것도 가능(append 전용 테이블, code UNIQUE라 재실행/재추가 시
-- 자연히 멱등).

-- ════════════════════════════════════════════════════════════════════════
-- 4) unit_grammar_points — 유닛 ↔ 문법 포인트 다대다 조인
-- ════════════════════════════════════════════════════════════════════════
create table if not exists unit_grammar_points (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  grammar_point_id uuid not null references grammar_points(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (unit_id, grammar_point_id)
);
create index if not exists idx_ugp_unit on unit_grammar_points(unit_id);
create index if not exists idx_ugp_grammar_point on unit_grammar_points(grammar_point_id);
alter table unit_grammar_points enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'unit_grammar_points' and policyname = 'allow anon all unit_grammar_points') then
    create policy "allow anon all unit_grammar_points" on unit_grammar_points for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on unit_grammar_points to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 5) examples — 콘텐츠 평면의 핵심 신규 테이블(설계 문서 §2 컬럼셋 그대로)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists examples (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references units(id) on delete set null,
  textbook_id uuid references textbooks(id) on delete set null,
  word_id uuid references words(id) on delete set null,
  target_word text not null,
  english_sentence text not null,
  korean_translation text,
  grammar_point_id uuid references grammar_points(id) on delete set null,
  difficulty int not null default 1 check (difficulty between 1 and 5),
  -- 출처·승인 표준 블록(설계 문서 §3) — 후속 콘텐츠 모듈(listening_items 등)이
  -- 동일한 계약을 복제한다.
  source text not null default 'teacher' check (source in ('teacher', 'import', 'rule', 'ai')),
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'pending', 'approved', 'rejected')),
  created_by text,
  approved_by text,
  approved_at timestamptz,
  ai_model text,
  ai_meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 인덱스(설계 문서 §2 "인덱스(Phase 0)" 그대로)
create index if not exists idx_examples_target_word_lower on examples (lower(target_word));
create index if not exists idx_examples_unit_approval on examples (unit_id, approval_status);
create index if not exists idx_examples_textbook_approval on examples (textbook_id, approval_status);
create index if not exists idx_examples_approval_status on examples (approval_status);

alter table examples enable row level security;

-- ── RLS 초기값: 현행 프로덕션 신뢰 모델(anon 개방, v3.4 관례) ──
-- v3.11/v3.12 락다운이 아직 배포 대기 중(미배포 admin-content-write Edge
-- Function에 의존)이라, 즉시 락다운은 dead-end다(설계 문서 §9). 락다운
-- 배포 완료 후 아래 "락다운 합류 블록"을 별도 마이그레이션으로 실행한다.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'examples' and policyname = 'allow anon all examples') then
    create policy "allow anon all examples" on examples for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on examples to anon, authenticated;

-- ── [락다운 합류 블록 — 주석 처리, 현재 미실행] ──────────────────────────
-- v3.11/v3.12 계열(admin-content-write Edge Function 경유 쓰기)이 실제
-- 배포된 뒤, 아래 블록의 주석을 해제해 별도 마이그레이션으로 실행한다.
-- 전제조건(반드시 먼저 확인):
--   1) supabase/functions/admin-content-write/index.ts가 배포됐고,
--      exampleLibrary.js의 createExample/updateExample/deleteExample/
--      setApprovalStatus 등 쓰기 함수들이 adminPin 경유 Edge Function
--      호출로 전환돼 실제 배포됐을 것(현재 Phase 0 시점에는 adminPin이
--      예약 인자일 뿐 미사용 — wordLibrary.js 듀얼패스 관례).
--   2) 관리자 화면(ExampleManager/ApprovalQueue)이 adminPin을 실제로
--      호출부에 넘기도록 배선돼 배포됐을 것.
--   3) v3.11/v3.12가 이미 실행된 상태일 것(같은 신뢰 모델 전환의 일부).
-- 실행 후 효과: anon은 SELECT만 가능, INSERT/UPDATE/DELETE는 default-deny로
-- 차단되고 service_role 키(Edge Function)만 우회 가능해진다.
--
-- alter table examples enable row level security;
-- drop policy if exists "allow anon all examples" on examples;
-- drop policy if exists "examples anon read only" on examples;
-- create policy "examples anon read only" on examples for select using (true);
--
-- alter table publishers enable row level security;
-- drop policy if exists "allow anon all publishers" on publishers;
-- drop policy if exists "publishers anon read only" on publishers;
-- create policy "publishers anon read only" on publishers for select using (true);
--
-- alter table grades enable row level security;
-- drop policy if exists "allow anon all grades" on grades;
-- drop policy if exists "grades anon read only" on grades;
-- create policy "grades anon read only" on grades for select using (true);
--
-- alter table grammar_points enable row level security;
-- drop policy if exists "allow anon all grammar_points" on grammar_points;
-- drop policy if exists "grammar_points anon read only" on grammar_points;
-- create policy "grammar_points anon read only" on grammar_points for select using (true);
--
-- alter table unit_grammar_points enable row level security;
-- drop policy if exists "allow anon all unit_grammar_points" on unit_grammar_points;
-- drop policy if exists "unit_grammar_points anon read only" on unit_grammar_points;
-- create policy "unit_grammar_points anon read only" on unit_grammar_points for select using (true);
-- ─────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- 6) textbooks/units 추가 컬럼(additive only) — 설계 문서 §2
-- ════════════════════════════════════════════════════════════════════════
-- textbooks: publisher_id FK(기존 publisher_name 텍스트는 유지 — 호환,
-- 삭제하지 않음) + grade_id FK + level/book_order 메타.
alter table textbooks add column if not exists publisher_id uuid references publishers(id) on delete set null;
alter table textbooks add column if not exists grade_id uuid references grades(id) on delete set null;
alter table textbooks add column if not exists level text;
alter table textbooks add column if not exists book_order int;
create index if not exists idx_textbooks_publisher on textbooks(publisher_id);
create index if not exists idx_textbooks_grade on textbooks(grade_id);

-- units: position/lesson_no/objectives — "lesson = units 행"(별도 lessons
-- 테이블 없음, 설계 문서 §9 첫 행 트레이드오프)를 메타로 표현.
-- 주의: units.position 컬럼은 이미 존재한다(v1.x, wordLibrary.js가 이미
-- select/order에 씀) — 여기서는 add column if not exists이므로 이미 있으면
-- 무시되고 새로 채워지지 않는다(기존 값 보존, 파괴 없음).
alter table units add column if not exists position int;
alter table units add column if not exists lesson_no int;
alter table units add column if not exists objectives text;

-- ════════════════════════════════════════════════════════════════════════
-- 실행 후 검증 쿼리(v3.4 관례 그대로)
-- ════════════════════════════════════════════════════════════════════════
-- (a) 신규 테이블 5개 존재 확인:
--   select table_name from information_schema.tables
--   where table_name in ('publishers','grades','grammar_points','unit_grammar_points','examples');
-- (b) grammar_points 0행 확인(시드 없음 — 위 "범위 변경 기록" 참고):
--   select count(*) from grammar_points;
-- (c) examples 신규 테이블 0행 확인(백필 없음):
--   select count(*) from examples;
-- (d) textbooks/units 추가 컬럼 확인:
--   select column_name from information_schema.columns
--   where table_name = 'textbooks' and column_name in ('publisher_id','grade_id','level','book_order');
--   select column_name from information_schema.columns
--   where table_name = 'units' and column_name in ('position','lesson_no','objectives');
-- (e) examples CHECK 제약 확인(approval_status/source/difficulty 3개):
--   select conname from pg_constraint where conrelid = 'examples'::regclass and contype = 'c';
-- (f) RLS 정책 확인(5개 신규 테이블 각 1개씩, "allow anon all *"):
--   select tablename, policyname from pg_policies
--   where tablename in ('publishers','grades','grammar_points','unit_grammar_points','examples');
-- (g) 인덱스 확인:
--   select indexname from pg_indexes where tablename = 'examples';
