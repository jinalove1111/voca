-- ============================================================================
-- supabase_v2_7_house_system.sql — House System (게임화 하위카드 8번).
-- 2026-07-19. Supabase 대시보드 SQL Editor에서 1회 실행. 멱등 — 여러 번
-- 실행해도 안전(`add column if not exists` / `create index if not exists`).
--
-- 근거: PROJECT_BOARD.md "[P3] 게임화" 하위 카드 8번, GAME_DESIGN.md 6번
-- 섹션(House System), PAUL_BIBLE.md §10(DESIGN DIRECTION), PAUL_PRINCIPLES.md
-- 3번("하우스가 소속감을 만드는 이유").
--
-- ── 설계 판단 1: `houses` 테이블을 만들지 않는다 ──────────────────────────
-- PAUL_BIBLE.md §10 원문은 "신규 houses 테이블"을 제안했지만, 실제 구현은
-- 코드 상수(`src/utils/houseSystem.js`의 `HOUSES`)로 대체했다 — 이 저장소가
-- 이미 반복 확립한 "자주 안 바뀌는 소규모 목록은 정적 JS 객체, DB 테이블
-- 아님" 관례(ticketEconomy.js의 TICKET_GRANT_TABLE/REWARD_CATALOG,
-- wordKing.js의 가중치 상수, GAME_DESIGN.md 8번 섹션 자신도 Weekly Events
-- 콘텐츠에 "신규 이벤트 정의 테이블을 만들지 않는다"고 명시)를 하우스
-- 정의에도 그대로 적용한 것 — 하우스 4개는 관리자가 웹 UI로 추가/삭제하는
-- 요구가 실제로 생기기 전까지 테이블+CRUD API를 만들면 과설계(YAGNI).
-- 목록이 실제로 바뀌면 `houseSystem.js`의 HOUSES 배열 + 아래 CHECK 제약을
-- 함께 수정해야 한다(이 파일과 그 파일이 유일한 커플링 지점 — 파일 헤더에
-- 서로 참조 명시).
--
-- ── 설계 판단 2: house_id는 FK가 아니라 smallint + CHECK ─────────────────
-- 참조할 테이블이 없으므로 FK 자체가 불가능하다. 대신 CHECK 제약으로
-- houseSystem.js의 HOUSES id 범위(1~4)와 정합성을 보장한다. current_unit_id
-- (v2.1, uuid FK)와 다른 이유는 "가리키는 대상이 관리자가 만들고 지우는
-- 동적 엔티티(반의 유닛)인가, 코드에 고정된 상수인가"의 차이다.
--
-- ── 설계 판단 3: 별도 house_enabled 스위치를 만들지 않는다 ────────────────
-- supabase_v2_5_gamification_master_switch.sql이 "word_king_enabled/
-- house_enabled/weekly_event_enabled는 각 기능이 실제 착수될 때 그 카드의
-- SQL에서 추가"하기로 계획했었지만, 실제로 Word King(하위카드 7번) 착수
-- 시점에 `word_king_enabled`를 추가하지 않고 기존 `gamification_enabled`
-- 마스터 스위치 하나로 노출을 게이팅했다(Dashboard.jsx `weeklyChampion`
-- 블록 — grep 결과 word_king_enabled는 코드 어디에도 없음, 2026-07-19
-- 실측 확인). House System도 정확히 같은 이유로 `gamification_enabled`를
-- 재사용한다 — 텍스트 한 줄(§학생 화면 최소 표시)에 별도 on/off 축을 추가로
-- 관리하게 하는 것은 111명 실사용 반 교사에게 스위치가 늘어나는 관리
-- 부담만 키우고 실익이 적다(YAGNI + Word King 선례 일관성).
--
-- ── 설계 판단 4: `classes.weekly_event_enabled`는 이번에 만든다(설정 슬롯) ─
-- Weekly Events는 이번 라운드에 실제 이벤트 정의/트리거가 전혀 없어(콘텐츠
-- 0개) 노출을 게이팅할 화면 자체가 없다 — 그런데도 이 컬럼을 미리 추가하는
-- 이유는, 운영자 지시가 명시적으로 "설정 슬롯만 만들어라 — 확장 가능한
-- 구조로 자리만"이라고 House/gamification_enabled 재사용과는 별개로 이
-- 컬럼을 지목했기 때문이다(향후 실제 이벤트가 붙을 때 "이번 주는 시험
-- 주간이라 이벤트를 끄고 싶다"처럼 House/기본 게임화와는 독립적으로 교사가
-- 켜고 끌 필요가 실제로 생길 가능성이 높다고 판단 — House는 상시 소속
-- 정보라 독립 스위치가 불필요하지만, Weekly Events는 "이번 주만" 켜고 끄는
-- 시간 제한적 성격이라 마스터 스위치와 다른 축의 on/off가 의미 있다).
-- 지금은 콘텐츠가 없으므로 이 컬럼을 읽는 코드가 없다(죽은 컬럼처럼
-- 보이지만, "확장 가능한 구조 자리만"이라는 지시를 그대로 반영한 결과 —
-- 실제 이벤트가 붙는 라운드에서 이 컬럼을 읽기 시작하면 된다).
--
-- ── 실행 순서 안전성 ────────────────────────────────────────────────────
-- 코드가 먼저 배포돼도 안전: wordLibrary.js의 refreshStudents/addStudent는
-- house_id 컬럼 select/insert가 실패하면 자동으로 컬럼 없는 경로로 폴백한다
-- (v2.1 current_unit_id와 동일한 패턴). 이 SQL이 먼저 실행돼도 안전: 구버전
-- 코드는 새 컬럼을 아예 모르고, 컬럼은 nullable이라 기존 INSERT에 영향 없다.
-- ============================================================================

-- 1) students.house_id (멱등). GRANT는 v1.9 컬럼권한 체제 때문에 필수
--    (CLAUDE.md 규칙 10 — 빠뜨리면 이 컬럼뿐 아니라 기존 잘 되던 조회까지
--    fail-closed로 깨질 수 있음, current_unit_id 선례 그대로 반복).
alter table public.students
  add column if not exists house_id smallint;

-- 1-b) CHECK 제약(멱등 — 이미 있으면 건너뜀). houseSystem.js의 HOUSES
--      id(1~4)와 반드시 일치해야 한다 — 목록이 바뀌면 이 블록도 함께 수정.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass
      and conname = 'students_house_id_check'
  ) then
    alter table public.students
      add constraint students_house_id_check
      check (house_id is null or house_id between 1 and 4);
  end if;
end $$;

-- 2) 인덱스 (멱등) — 반별이 아니라 하우스별 팀 점수 집계/재배정 조회 성능용.
create index if not exists idx_students_house_id
  on public.students (house_id);

-- 3) anon/authenticated GRANT — v1.9 이후 필수(위 주석 참고). 멱등.
grant select (house_id) on table public.students to anon, authenticated;
grant update (house_id) on table public.students to anon, authenticated;

-- 4) classes.weekly_event_enabled — Weekly Events 설정 슬롯(위 설계 판단 4).
--    supabase_spelling_test_schema.sql/supabase_v2_5_gamification_master_
--    switch.sql과 동일한 "classes 반별 opt-in boolean, 기본 false" 관례
--    재사용. classes는 students(v1.9)와 달리 컬럼단위 GRANT 대상이 아니라
--    (테이블 단위 "allow anon all" RLS 유지) 별도 GRANT 불필요.
alter table public.classes
  add column if not exists weekly_event_enabled boolean not null default false;

-- 5) 기존 학생 백필 — 라운드로빈으로 4개 하우스에 균등 배정(created_at 순).
--    이미 house_id가 있는 학생(재실행/수동 배정 학생)은 절대 건드리지
--    않는다(멱등 + 관리자가 이미 재배정한 값을 덮어쓰지 않음).
with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.students
  where house_id is null
)
update public.students s
set house_id = ((ordered.rn - 1) % 4) + 1
from ordered
where s.id = ordered.id;

-- PostgREST 스키마/권한 캐시 즉시 갱신.
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 하우스별 인원 분포 — 4개 하우스가 균형에 가까운지 확인:
--   select house_id, count(*) from public.students group by house_id order by house_id;
--
-- ② anon 권한 확인 (실행 후 반드시 reset role):
--   set role anon; select id, house_id from public.students limit 1; reset role;
--   -- 정상 행 반환이어야 함. pin_hash는 여전히 42501 거부(변경 없음).
--
-- ③ CHECK 제약이 실제로 잘못된 값을 거부하는지(트랜잭션으로만 시도 —
--    커밋하지 말 것):
--   begin;
--   update public.students set house_id = 99 where id = (select id from public.students limit 1);
--   -- 위는 CHECK violation으로 에러가 나야 정상. 확인 후:
--   rollback;
--
-- ④ classes.weekly_event_enabled 기본값 확인(전부 false여야 정상):
--   select name, weekly_event_enabled from public.classes;
--
-- 이번 라운드는 순수 함수 테스트(scripts/testHouseSystem.mjs)까지만 —
-- 이 SQL이 아직 실행 전이라 라이브 e2e(실제 house_id 배정/GRANT 확인)
-- 스크립트는 만들지 않았다(Word King/Entrance Test가 쓰는 "SQL 미실행 시
-- 안전 SKIP" 패턴을 새로 또 추가하기보다, 운영자가 이 SQL을 실제로 실행한
-- 뒤 다음 세션에서 라이브 e2e를 추가하는 편이 더 정확하다 — 지금 만들면
-- 검증 못 해본 채로 만든 테스트가 된다). 대신 위 ①~④ SQL Editor 검증
-- 쿼리로 실행 직후 수동 확인.
-- ============================================================================
