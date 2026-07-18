-- ============================================================================
-- supabase_v2_3_paul_rank.sql — Paul Rank System 기반 (Word King 이전 단계)
-- 2026-07-19. Supabase SQL Editor에서 1회 실행. 멱등 — 여러 번 실행해도 안전.
--
-- ── 이 SQL이 만드는 것 ──────────────────────────────────────────────────
-- 1) xp_ledger — Rank 계산의 유일한 원천(source of truth). 학생별+이벤트별
--    unique 제약으로 중복 지급을 DB 레벨에서 원천 차단(idempotency).
-- 2) xp_totals — xp_ledger를 학생별로 합산한 VIEW(저장 컬럼 아님 — 매 조회
--    시 재계산되는 순수 파생값). "저장된 중복값보다 파생값을 우선한다"는
--    이번 지시를 스키마 레벨에서 강제하기 위해 일부러 컬럼이 아니라 뷰로
--    만들었다(student_progress.hat_stage처럼 "빠른 조회용 사본" 컬럼을
--    새로 얹지 않았다 — 111명 규모에서는 뷰 집계로 충분히 빠르고, 사본이
--    없으면애초에 사본-원본 불일치 버그 자체가 존재할 수 없다).
--
-- ── 왜 xp_ledger가 anon "allow anon all"이 아닌가 ──────────────────────
-- 이 저장소의 기존 게임화류 테이블(student_progress 등)은 전부 anon이
-- 직접 읽고 쓴다(RLS "allow anon all"). 이번 지시는 이 패턴을 정확히
-- 반복하지 말라고 명시했다: "클라이언트가 보낸 XP 총합을 신뢰하지
-- 마라", "학생 화면에서 직접 Supabase에 XP를 insert/update하는 경로를
-- 만들지 마라". 그래서 xp_ledger는 GAME_DESIGN.md §5(Word King)가 이미
-- 제안해 둔 것과 같은 패턴 — **anon read-only(SELECT만) + 쓰기는
-- service_role 전용(api/grant-xp.js)** — 을 그대로 재사용한다. anon/
-- authenticated 롤에는 INSERT/UPDATE/DELETE 권한을 아예 부여하지
-- 않으므로(REVOKE 불필요 — GRANT를 안 하면 기본이 거부), 클라이언트가
-- Supabase JS로 직접 xp_ledger에 쓰려고 해도 42501로 거부된다. 로컬에
-- service_role 키가 없는 환경(이 저장소의 알려진 상태, api/_pinAuth.js
-- 주석 참고)에서는 anon 키로 폴백하는 서버 함수도 있지만, 이 테이블은
-- anon에 INSERT 권한 자체가 없으므로 그 폴백조차 "새 구멍"이 되지
-- 않는다 — 폴백이 실패하면 그냥 실패한다(안전한 실패, fail-closed).
--
-- ── 백필 판단: 기존 111명 학생의 XP를 어떻게 초기화하는가 ──────────────
-- 결론: **백필하지 않는다.** 전원 XP=0(새싹모자, Tiny)에서 새로 시작한다.
-- 이유:
--   · "별을 조용히 XP로 변환하지 말라"는 원칙은 "지속적 미러링 금지"뿐
--     아니라 "1회성이라도 산술 변환으로 XP를 합성하는 것" 자체를 금지하는
--     것으로 읽었다 — xp_ledger는 "감사 가능한 이벤트 원장"이 존재
--     이유인데, `totalStars`로 시드값을 계산해 넣으면 그 시드 행에는
--     실제로 일어난 학습 이벤트가 없다(source_event_id가 진짜 이벤트를
--     가리키지 않는 "유령 행"이 됨) — 원장의 감사 가능성 자체를
--     첫 줄부터 깨뜨린다.
--   · v2.1의 unit_name→current_unit_id 백필과는 성격이 다르다: 그건
--     "같은 사실(현재 유닛)을 다른 저장 형태로 옮긴 것"(정보 손실/발명
--     없음)이지만, totalStars→XP는 "다른 축(누적 반복량)의 숫자를 새 축
--     (감사된 학습 이벤트)의 숫자인 것처럼 발명하는 것"이라 원본 문서
--     (GAME_DESIGN.md §2)가 이미 경고한 "인플레이션/왜곡"과 정확히
--     같은 함정이다.
--   · 대신 아래 "선택적 1회성 런칭 보너스" 블록을 **주석 처리된 채로**
--     남겨둔다 — 운영자가 "기존 학생이 뒤처진 느낌을 받지 않게 하고
--     싶다"고 판단하면, 이 블록의 주석을 풀어 별도로 실행할 수 있다.
--     이것도 xp_ledger를 통해서만 지급되므로(같은 unique 제약, 감사
--     추적 유지) "조용한 변환"이 아니라 "명시적으로 기록된, 운영자가
--     의도적으로 결정한 1회성 이벤트"로 남는다 — 이 결정 자체가
--     감사 로그에 남는다는 게 핵심 차이.
--
-- ── 실행 순서 안전성 (CLAUDE.md 규칙 9) ─────────────────────────────────
-- 코드가 이 SQL보다 먼저 배포돼도 안전: src/utils/wordLibrary.js의
-- fetchXpTotal()/fetchXpTotals()는 테이블/뷰 부재(쿼리 에러)를 감지하면
-- xp=0으로 폴백하고, api/grant-xp.js는 insert 실패를 삼켜 학습 흐름을
-- 절대 막지 않는다(기존 syncStudentProgress의 fire-and-forget 원칙과
-- 동일). 이 SQL이 먼저 실행돼도 안전: 코드가 아직 안 나갔으면 그냥
-- 아무도 이 테이블을 안 씀(순수 추가 테이블 — 기존 테이블 컬럼 0개 변경).
-- ============================================================================

-- 1) xp_ledger — 이벤트별 원장. student_id+source_event_id unique 제약이
--    곧 idempotency 메커니즘(같은 이벤트가 두 번 들어와도 두 번째는 DB가
--    자연스럽게 거부 — 애플리케이션 코드가 따로 "이미 지급했는지" 조회할
--    필요 없음, race condition에도 안전).
create table if not exists xp_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  event_type text not null,
  amount smallint not null check (amount > 0 and amount <= 100), -- 서버가 XP_EVENT_TABLE 값만 씀(최대 20) — 100은 미래 여유를 둔 방어적 상한, 클라이언트가 무엇을 보내든 이 CHECK 밖 값은 DB가 거부
  source_event_id text not null,
  created_at timestamptz not null default now(),
  unique (student_id, source_event_id)
);
create index if not exists idx_xp_ledger_student on xp_ledger (student_id);

-- 2) RLS — anon read-only. INSERT/UPDATE/DELETE는 GRANT 자체를 하지
--    않는다(= 기본 거부, service_role만 RLS를 우회해 쓸 수 있음).
alter table xp_ledger enable row level security;
create policy "xp_ledger anon read only" on xp_ledger for select using (true);
grant select on table xp_ledger to anon, authenticated;
-- 참고: anon/authenticated에 insert/update/delete GRANT를 절대 추가하지
-- 말 것 — 추가하는 순간 이 테이블의 존재 이유(서버 검증 전용 쓰기 경로)가
-- 무효화된다. 이 주석은 다음 세션을 위한 명시적 경고.

-- 3) xp_totals — 파생 VIEW(저장 아님, 매 조회 재계산). 관리자 대시보드가
--    111명을 한 번에 조회할 때 N+1 쿼리 없이 그룹집계 1번으로 끝내기
--    위한 용도 — "빠른 조회"를 위해 컬럼을 새로 얹는 기존 관례
--    (total_xp/streak_count 등 student_progress 사본 컬럼) 대신 VIEW를
--    쓴 이유는 위 헤더 설명 참고.
create or replace view xp_totals as
  select student_id, coalesce(sum(amount), 0)::integer as total_xp
  from xp_ledger
  group by student_id;
grant select on xp_totals to anon, authenticated;

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- (선택, 기본 비활성) 1회성 런칭 보너스 — 운영자가 명시적으로 결정할 때만
-- 아래 블록의 주석을 풀어 별도로 실행하세요. 위 "백필 판단" 설명 참고 —
-- 이 블록도 xp_ledger를 통해서만 지급하므로 감사 추적이 남습니다.
-- 예시: 기존 학생 전원에게 "출시 기념" 이벤트로 균일 XP 20점 1회 지급.
--
-- insert into xp_ledger (student_id, event_type, amount, source_event_id)
-- select id, 'v2.3-launch-bonus', 20, 'v2.3-launch-bonus:' || id::text
-- from students
-- on conflict (student_id, source_event_id) do nothing;
-- ============================================================================

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 테이블/뷰 생성 확인:
--   select count(*) from xp_ledger;
--   select count(*) from xp_totals;
--
-- ② anon 권한 확인(실행 후 반드시 reset role):
--   set role anon;
--   select * from xp_ledger limit 1;              -- 정상(빈 결과 OK, 42501 아니어야 함)
--   insert into xp_ledger (student_id, event_type, amount, source_event_id)
--     values ('00000000-0000-0000-0000-000000000000', 'test', 1, 'anon-write-test');
--   -- 위 insert는 반드시 42501(permission denied)로 실패해야 정상.
--   reset role;
--
-- ③ 중복 방지 확인(unique 제약):
--   insert into xp_ledger (student_id, event_type, amount, source_event_id)
--     values ((select id from students limit 1), 'test', 1, 'dup-test-1');
--   insert into xp_ledger (student_id, event_type, amount, source_event_id)
--     values ((select id from students limit 1), 'test', 1, 'dup-test-1');
--   -- 두 번째 insert는 반드시 23505(unique violation)로 실패해야 정상.
--   delete from xp_ledger where source_event_id = 'dup-test-1';
--
-- 전체 라이브 검증은 로컬에서(서비스롤 키가 .env.local에 있을 때만 실제
-- insert까지 검증, 없으면 SKIP — scripts/testXpLedgerDb.mjs 헤더 참고):
--   node scripts/testXpLedgerDb.mjs
-- ============================================================================
