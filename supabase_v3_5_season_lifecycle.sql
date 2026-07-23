-- ============================================================================
-- supabase_v3_5_season_lifecycle.sql — Seasonal Progression 시즌 생애주기
-- 확장(시즌 번호/종료일/활성 플래그 + 활성 시즌 유일성 보장 + 원자적 전환
-- RPC). 2026-07-23. Supabase 대시보드 SQL Editor에서 1회 실행. 멱등 —
-- 여러 번 실행해도 안전(add column if not exists / create index if not
-- exists / create or replace function / 조건부 백필 do 블록).
--
-- 전제: supabase_v2_8_seasonal_progression.sql(`seasons` 테이블
-- id/started_at/note, anon read-only + service_role 전용 쓰기)이 이미
-- 실행돼 있어야 한다(2026-07-23 season-system-specialist 라운드 확인 —
-- 프로덕션에 이미 실행됨, `seasons` 테이블 존재·0행). 이 SQL은 그 테이블에
-- 컬럼만 추가한다 — 새 테이블 없음, 기존 컬럼 삭제 없음, RLS 정책도
-- 그대로(anon read-only 유지, INSERT/UPDATE 권한은 여전히 GRANT하지
-- 않음 — 아래 4번 RPC가 유일한 쓰기 경로).
--
-- ── 이 마이그레이션이 고치는 것(2026-07-23 season-system-specialist 감사) ──
-- v2_8은 "시즌 시작" 마커 행 하나만 append하는 최소 구현이라(관리자
-- 트리거만 있고 실제 "종료" 개념이 없음) 다음 문제가 있었다:
--   1) 시즌 번호가 없어 "몇 번째 시즌"인지 표시 불가.
--   2) 이전 시즌의 종료일이 기록되지 않아 시즌 이력 조회가 불완전.
--   3) "현재 시즌"이 오직 "가장 최근 started_at 행"이라는 암묵적 관례에만
--      의존 — DB 레벨 보장이 없어 데이터가 꼬이면(수동 SQL 실수 등) 조용히
--      틀린 값을 보여줄 수 있음.
--   4) 관리자가 "새 시즌 시작" 버튼을 더블클릭하거나 네트워크 재시도로
--      중복 요청을 보내면 두 개의 새 시즌 행이 거의 동시에 insert돼
--      시즌 경계가 두 번 튈 수 있음(원자적 보호 없음 — 단순 insert 1줄
--      뿐이었다, api/start-new-season.js 2026-07-19 최초 버전).
-- 이 SQL은 위 4가지를 고친다 — 리셋 대상(House 팀 점수)이나 리셋 안 되는
-- 대상(레벨/뱃지/스트릭/XP/티켓 원장/학습 기록/출석/숙제)의 범위는 전혀
-- 바꾸지 않는다. sumTicketBalanceSince/computeHouseSeasonScores 등 파생
-- 계산 함수는 여전히 `started_at` 하나만 경계로 쓴다(무회귀) — 이 SQL이
-- 추가하는 season_number/ended_at/is_active는 표시·이력·무결성 보장
-- 용도이지 그 계산 함수들의 시그니처를 바꾸지 않는다.
--
-- ── 실행 순서 안전성(CLAUDE.md 규칙 9) ────────────────────────────────────
-- 코드가 이 SQL보다 먼저 배포돼도 안전: src/utils/seasonApi.js는 확장
-- 컬럼(season_number/ended_at/is_active) 조회가 42703(undefined_column)로
-- 실패하면 v2_8 시절의 기본 컬럼(id/started_at/note)만으로 폴백한다.
-- api/start-new-season.js도 새 RPC(start_new_season)가 PGRST202/42883
-- (함수 없음)으로 실패하면 v2_8 시절의 단순 insert 폴백 경로를 그대로
-- 유지한다(코드에 이미 반영, 이 SQL과 별도 배포돼도 무방).
-- 이 SQL이 먼저 실행돼도 안전: 관리자가 "새 시즌 시작" 버튼을 누르기 전
-- 까지는 기존 동작과 동일(테이블에 새 행이 없으면 "시즌 없음" 상태 그대로).
-- ============================================================================

-- 1) 컬럼 추가(멱등). season_number/ended_at은 처음엔 기존 행에서 NULL일
--    수 있다(바로 아래 2단계에서 백필). is_active는 새로 추가되는 컬럼이라
--    기본값 true로 채워지지만, 기존 행이 2개 이상이면 3단계 백필에서
--    "가장 최근 시즌만 활성"으로 즉시 정정한다.
alter table public.seasons add column if not exists season_number integer;
alter table public.seasons add column if not exists ended_at timestamptz;
alter table public.seasons add column if not exists is_active boolean not null default true;

-- 2) 시즌 번호 백필(멱등 — season_number가 이미 채워진 행은 건드리지
--    않음). started_at 오름차순으로 1부터 순번을 매긴다. 프로덕션은 현재
--    0행이라 이 블록은 사실상 no-op이지만, 이 SQL을 나중에 재실행하거나
--    다른 환경(스테이징 등)에 이미 v2_8만으로 만들어진 행이 있는 경우를
--    대비한 방어적 백필이다.
do $$
begin
  if exists (select 1 from public.seasons where season_number is null) then
    with ordered as (
      select id, row_number() over (order by started_at asc) as rn
      from public.seasons
    )
    update public.seasons s
      set season_number = o.rn
      from ordered o
      where s.id = o.id and s.season_number is null;
  end if;
end $$;

-- 3) 활성 플래그/종료일 정합화(멱등 — 여러 번 실행해도 항상 같은 결과:
--    "가장 최근 started_at 행만 활성, 나머지는 비활성 + 종료일 = 다음
--    시즌 시작일"). 재실행해도 안전한 이유: 실제 시즌 전환은 오직 4번
--    RPC(start_new_season)로만 일어나고, 그 RPC가 이미 is_active/ended_at
--    을 정확히 관리하므로 이 재계산은 매번 같은 최종 상태로 수렴한다.
do $$
begin
  with ordered as (
    select id, started_at,
           lead(started_at) over (order by started_at asc) as next_started_at,
           row_number() over (order by started_at desc) as rn_desc
    from public.seasons
  )
  update public.seasons s
    set is_active = (o.rn_desc = 1),
        ended_at = case when o.rn_desc = 1 then s.ended_at else coalesce(s.ended_at, o.next_started_at) end
    from ordered o
    where s.id = o.id;
end $$;

-- 4) 활성 시즌 정확히 1개 보장 — partial unique index. 3단계 백필 이후에
--    만들어야 "여러 행이 true"인 상태에서 인덱스 생성 자체가 실패하는
--    것을 피한다(멱등 — if not exists).
create unique index if not exists idx_seasons_single_active on public.seasons (is_active) where is_active;

-- 시즌 번호 유일성(레이스 컨디션 발생 시 뒤늦게 커밋되는 두 번째 요청이
-- 여기서 명확히 unique_violation으로 실패한다 — 아래 RPC의 advisory lock과
-- 이중 방어, "동시 실행 보호"의 DB 레벨 최종 백스톱).
create unique index if not exists idx_seasons_season_number on public.seasons (season_number) where season_number is not null;

-- 5) 원자적 전환 RPC — "현재 활성 시즌 종료 + 새 시즌 시작"을 한 함수
--    호출(=암묵적 트랜잭션 1개)로 묶는다. api/start-new-season.js가 이
--    RPC를 우선 호출하고, 함수가 없는 환경(이 SQL 미실행)에서만 v2_8
--    시절 단순 insert로 폴백한다.
--
--    동시 실행 보호: 같은 advisory lock 키로 동시 호출을 직렬화한다
--    (더블클릭/네트워크 재시도로 두 요청이 거의 동시에 들어와도 하나씩
--    순서대로 처리됨 — 두 요청 모두 "성공"하더라도 시즌이 연속으로 2번
--    전환될 뿐, 활성 시즌이 2개가 되는 경합 자체는 위 unique index로도
--    이중 차단된다).
--
--    쓰기 권한: service_role 전용. SECURITY DEFINER 함수는 기본적으로
--    PUBLIC에 EXECUTE 권한이 부여되므로, anon/authenticated에서 명시적으로
--    회수한다 — 그렇지 않으면 RLS를 우회하는 이 함수를 학생이 직접 호출해
--    전교생의 시즌 경계를 임의로 리셋시키는 그리핑이 가능해진다
--    (supabase_v2_8_seasonal_progression.sql의 동일 경고와 같은 이유).
create or replace function public.start_new_season(p_note text default null)
returns table (
  id uuid,
  season_number integer,
  started_at timestamptz,
  ended_at timestamptz,
  is_active boolean,
  note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_number integer;
  v_new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('public.start_new_season'));

  update public.seasons
    set is_active = false, ended_at = now()
    where is_active = true;

  select coalesce(max(season_number), 0) + 1 into v_next_number from public.seasons;

  insert into public.seasons (season_number, started_at, is_active, note)
  values (v_next_number, now(), true, p_note)
  returning public.seasons.id into v_new_id;

  return query
    select s.id, s.season_number, s.started_at, s.ended_at, s.is_active, s.note
    from public.seasons s
    where s.id = v_new_id;
end;
$$;

revoke all on function public.start_new_season(text) from public;
revoke all on function public.start_new_season(text) from anon, authenticated;
grant execute on function public.start_new_season(text) to service_role;

-- 참고: 새 컬럼(season_number/ended_at/is_active)에 별도 GRANT SELECT가
-- 필요 없다 — supabase_v2_8이 이미 "grant select on table public.seasons
-- to anon, authenticated"로 테이블 단위 권한을 줬고, Postgres의 테이블
-- 단위 GRANT는 그 이후 추가되는 컬럼에도 자동으로 적용된다(students 테이블
-- PIN 컬럼처럼 컬럼 단위 REVOKE를 쓴 적이 없는 테이블이라 규칙 10의
-- "컬럼 추가 시 GRANT 동반" 요건이 이미 충족된 상태 — 새로 GRANT를 추가로
-- 실행할 필요가 없다는 뜻이지 규칙을 생략한 게 아니다).

-- PostgREST 스키마/권한 캐시 즉시 갱신(새 컬럼 + 새 RPC 함수 인식).
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 검증 (같은 SQL Editor에서 바로 실행)
--
-- ① 컬럼/인덱스 확인:
--   select column_name, data_type from information_schema.columns
--     where table_schema='public' and table_name='seasons'
--     order by ordinal_position;
--   select indexname from pg_indexes where tablename='seasons';
--   -- idx_seasons_single_active, idx_seasons_season_number가 보여야 함.
--
-- ② anon은 RPC를 호출할 수 없어야 함(그리핑 방지 확인):
--   set role anon;
--   select * from public.start_new_season('anon test');
--   -- 반드시 42501(permission denied for function) 등으로 실패해야 정상.
--   reset role;
--
-- ③ service_role로 RPC 직접 실행해보기(선택 — 실제 운영 트리거는 관리자
--    화면 버튼을 통해서만 해야 한다. 여기서 직접 실행하면 실제로 새
--    시즌이 시작되니 SQL Editor 콘솔에서 함부로 실행하지 말 것):
--   -- select * from public.start_new_season('SQL Editor 수동 테스트');
--
-- ④ 활성 시즌이 정확히 1개인지 확인:
--   select count(*) from public.seasons where is_active;  -- 항상 1
--
-- ⑤ 이전 시즌 보존 확인(운영자가 실제로 "새 시즌 시작" 버튼을 누른 뒤):
--   select season_number, started_at, ended_at, is_active, note
--     from public.seasons order by season_number desc limit 5;
--   -- 새 행이 맨 위(가장 큰 번호)에 추가되고, 이전 행들은 ended_at만
--   -- 채워진 채 그대로 남아있어야 한다(삭제 없음).
-- ============================================================================
