-- ============================================================================
-- supabase_v2_6_word_king.sql — Word King(주간·서버 전용 계산) 저장 테이블.
-- 2026-07-19. Supabase SQL Editor에서 1회 실행. 멱등 — 여러 번 실행해도
-- 안전(`create table if not exists`).
--
-- 근거: PROJECT_BOARD.md 게임화 하위카드 7번, GAME_DESIGN.md 5번 섹션,
-- PAUL_BIBLE.md §11.
--
-- ── 이 SQL이 만드는 것 ──────────────────────────────────────────────────
-- word_king_history — 매주 관리자가 수동으로 트리거하는 계산
-- (api/compute-word-king.js)의 결과 스냅샷. entrance_tests/
-- entrance_test_results(원시 응시 데이터)를 재사용하지 않고 신규 테이블을
-- 쓰는 이유는 GAME_DESIGN.md §5가 이미 설명한 대로: "여러 소스를 합성한
-- 계산 결과"는 "한 번의 시험 응시 원시 데이터"와 성격이 달라, 같은
-- 테이블에 욱여넣으면 나중에 재계산 공식이 바뀔 때 원본/파생을 구분할 수
-- 없어진다.
--
-- ── 왜 anon "allow anon all"이 아닌가 (기존 게임화 테이블과 의도적으로 다름) ──
-- 이 저장소의 기존 게임화류 테이블(student_progress 등)은 전부 anon이
-- 직접 읽고 쓴다. Word King은 정확히 "보상(주간 챔피언 타이틀)이 걸리면
-- 조작 유인이 커지는" 케이스라 그 관례를 반복하지 않는다 — xp_ledger
-- (supabase_v2_3_paul_rank.sql)가 이미 확립한 것과 같은 패턴: **anon
-- read-only(SELECT만) + 쓰기는 service_role 전용
-- (api/compute-word-king.js)**. anon/authenticated 롤에는 INSERT/UPDATE/
-- DELETE 권한을 아예 부여하지 않으므로(GRANT를 안 하면 기본이 거부),
-- 클라이언트가 Supabase JS로 직접 쓰려고 해도 42501로 거부된다.
--
-- ── 점수 산정 입력에 대한 참고(코드는 src/utils/wordKing.js) ────────────
-- score_breakdown(jsonb)에 그 주 계산에 실제로 쓰인 원시 집계값
-- (accuracyCorrect/accuracyTotal/correctedAccuracy/xpEarned/
-- classAverageAccuracy/weights)을 스냅샷으로 함께 저장한다 — 공식이
-- 나중에 바뀌어도 "그때 그 점수가 왜 그렇게 나왔는지"를 원본 재계산 없이
-- 감사할 수 있게 하기 위함(xp_ledger의 감사 가능성 원칙과 같은 방향).
--
-- ── 실행 순서 안전성 (CLAUDE.md 규칙 9) ─────────────────────────────────
-- 코드가 이 SQL보다 먼저 배포돼도 안전: api/compute-word-king.js는 upsert
-- 실패(42P01/PGRST205 = 테이블 없음)를 감지하면 ok:false, reason:
-- 'table_missing'으로 응답하고(학습 흐름과 무관한 관리자 전용 액션이라
-- 실패해도 학생 화면에 영향 없음), wordKingApi.js의 조회 함수들은 에러를
-- 감지하면 조용히 빈 결과로 폴백한다(Dashboard.jsx의 "이번 주 챔피언"
-- 텍스트가 그냥 안 보일 뿐, 크래시 없음). 이 SQL이 먼저 실행돼도 안전:
-- 코드가 아직 안 나갔으면 그냥 아무도 이 테이블을 안 씀(순수 추가 테이블
-- — 기존 테이블 컬럼 0개 변경).
-- ============================================================================

create table if not exists word_king_history (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  student_id uuid not null references students(id) on delete cascade,
  -- 학생 이름 스냅샷 — 학생 화면(Dashboard.jsx)이 별도 조인/조회 없이
  -- "이번 주 챔피언: OOO"를 바로 렌더할 수 있게 하기 위함(공개 표시용
  -- 텍스트라 이름이 바뀌어도 과거 기록은 그 시점 이름 그대로 보존되는
  -- 것도 "역대 명예의 전당"(GAME_DESIGN.md §9) 취지에 맞음).
  student_name text not null,
  score numeric(6, 2) not null,
  score_breakdown jsonb not null default '{}'::jsonb,
  rank_position integer not null,
  computed_at timestamptz not null default now(),
  unique (class_id, period_start, period_end, student_id)
);
create index if not exists idx_word_king_history_class_period on word_king_history (class_id, period_end desc);

-- RLS — anon read-only. INSERT/UPDATE/DELETE는 GRANT 자체를 하지 않는다
-- (= 기본 거부, service_role만 RLS를 우회해 쓸 수 있음). xp_ledger
-- (supabase_v2_3_paul_rank.sql)와 완전히 동일한 패턴 — 새 패턴 발명 아님.
alter table word_king_history enable row level security;
create policy "word_king_history anon read only" on word_king_history for select using (true);
grant select on table word_king_history to anon, authenticated;
-- 참고: anon/authenticated에 insert/update/delete GRANT를 절대 추가하지
-- 말 것 — 추가하는 순간 "보상이 걸린 값은 서버만 쓴다"는 이 테이블의
-- 존재 이유가 무효화된다. 이 주석은 다음 세션을 위한 명시적 경고
-- (xp_ledger SQL의 동일 경고를 그대로 재사용).

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 테이블 생성 확인:
--   select count(*) from word_king_history;
--
-- ② anon 권한 확인(실행 후 반드시 reset role):
--   set role anon;
--   select * from word_king_history limit 1;      -- 정상(빈 결과 OK, 42501 아니어야 함)
--   insert into word_king_history (class_id, period_start, period_end, student_id, student_name, score, rank_position)
--     values ('00000000-0000-0000-0000-000000000000', '2026-07-13', '2026-07-19', '00000000-0000-0000-0000-000000000000', 'test', 1, 1);
--   -- 위 insert는 반드시 42501(permission denied)로 실패해야 정상.
--   reset role;
--
-- ③ 중복 방지 확인(unique 제약, class_id/period_start/period_end/student_id):
--   같은 조합으로 두 번째 upsert를 하면 새 행이 아니라 기존 행이
--   갱신돼야 한다(api/compute-word-king.js가 onConflict로 이 제약을 씀).
--
-- 전체 라이브 검증은 로컬에서(서비스롤 키가 .env.local에 있을 때만 실제
-- insert까지 검증, 없으면 SKIP — scripts/testXpLedgerDb.mjs와 동일 패턴):
--   node scripts/testComputeWordKingApi.mjs
-- ============================================================================
