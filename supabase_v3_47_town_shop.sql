-- ============================================================================
-- supabase_v3_47_town_shop.sql — Town Shop V1: 별로 마을(내 방) 아이템을
-- 구매하는 서버 검증 경로. 2026-09-06.
--
-- 실행은 운영자가 Supabase 대시보드 SQL Editor에서 수동으로 한다(CLAUDE.md
-- 규칙 8, 에이전트는 DDL 직접 실행 권한 없음). 멱등 — 여러 번 실행해도
-- 안전(create table if not exists / create or replace function / on
-- conflict do nothing / drop policy if exists 후 재생성).
--
-- ── 코드 전/후 어느 순서든 안전(CLAUDE.md 규칙 9) ────────────────────────
-- 순수 추가 테이블(기존 테이블 컬럼 0개 변경) + 신규 RPC 함수 2개뿐이다.
-- 이 SQL이 아직 실행되지 않은 상태에서 클라이언트/서버가 town_items를
-- 조회하거나 purchase_town_item/get_town_shop_state를 호출하면 PostgREST가
-- 42P01(테이블 없음)/PGRST205(스키마 캐시에 없음)/42883(함수 없음)을
-- 반환하는데, 서버(api/*.js)와 클라이언트는 이 세 코드를 모두
-- `table_missing`으로 폴백 처리해야 한다(신규 구현 시 필수 — 이 SQL이
-- 코드보다 늦게 실행돼도 학습 흐름이 절대 막히지 않는다). 반대로 이 SQL이
-- 코드보다 먼저 실행돼도 안전 — 아무도 호출하지 않으면 빈 테이블/미사용
-- 함수로 존재할 뿐이다.
--
-- ── 별 잔액의 단일 진실 원천 ─────────────────────────────────────────────
-- "얼마나 벌었는가"는 절대 student_progress.total_stars(클라이언트가 직접
-- 쓰는 표시용 캐시, 조작 가능)로 판정하지 않는다 — reward_totals 뷰
-- (supabase_v3_36_reward_ledger.sql, reward_ledger 합계)만 신뢰한다.
-- 레거시로 쌓인 total_stars는 이미 supabase_v3_37_reward_legacy_baseline.sql
-- (v1)과 supabase_v3_48_reward_legacy_baseline_v2.sql(v2, 이 이후 실행)이
-- reward_ledger에 legacy-baseline 행으로 반영해 두므로, 두 baseline
-- 마이그레이션을 실행한 뒤에 이 Town Shop을 가동하는 것을 권장한다(실행
-- 순서를 강제하지는 않는다 — 먼저 실행돼도 v_earned가 낮게 계산될 뿐
-- 크래시 없음).
--
-- ── star_purchases에 idempotency_key 컬럼을 두지 않는 이유 ───────────────
-- reward_ledger(v3_36)는 여러 다른 reward_type/source_type 이벤트가 같은
-- 학생에게 반복적으로 쌓이므로 전역 unique(idempotency_key)가 필요했지만,
-- Town Shop 아이템은 "학생당 아이템당 정확히 1개까지"라는 훨씬 단순한
-- 제약이라 unique(student_id, item_id) 자체가 곧 idempotency 메커니즘이다
-- — 같은 구매 요청이 두 번 들어와도 두 번째는 DB가 자연스럽게 거부(또는
-- 아래 함수가 already_owned로 흡수)한다. 별도 idempotency_key 컬럼을
-- 추가하면 같은 의미를 두 제약으로 중복 표현하게 될 뿐이라 추가하지
-- 않는다.
--
-- ── RLS 전략: 두 테이블이 서로 다른 최소 권한 패턴을 쓰는 이유 ───────────
-- town_items는 "표시용 카탈로그"(가격/이름/이모지)라 학생 화면이 직접
-- 읽어야 하므로 SELECT만 여는 정책 하나("classes anon read only" 등과
-- 동일 패턴, supabase_v3_11_lockdown_curriculum_write.sql 참고)를 둔다.
-- star_purchases는 "누가 무엇을 샀는가"라는 지급/차감 사실 자체라
-- reward_ledger(v3_36)와 완전히 동일한 최소 권한(정책 0 + GRANT 0,
-- service_role만 접근)을 그대로 적용한다 — 클라이언트가 자신의 구매
-- 내역조차 직접 SELECT하지 않고, 항상 get_town_shop_state() RPC(아래)를
-- 통해서만 파생값(잔액/보유 아이템 목록)을 받는다.
-- ============================================================================

-- 1) town_items — 구매 가능한 아이템 카탈로그(표시용, 순수 읽기 데이터).
create table if not exists town_items (
  id text primary key,
  name text not null,
  emoji text not null,
  price smallint not null check (price > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 시드 — 재실행 시 가격을 덮어쓰지 않는다(on conflict do nothing, 운영자가
-- 이후 대시보드에서 가격을 수동 조정했을 수 있으므로 마이그레이션
-- 재실행이 그 조정을 되돌리면 안 된다).
insert into town_items (id, name, emoji, price, active)
values ('shop-lamp', '책상 램프', '💡', 60, true)
on conflict (id) do nothing;

alter table town_items enable row level security;
drop policy if exists "town_items anon read only" on town_items;
create policy "town_items anon read only" on town_items for select using (true);
-- INSERT/UPDATE/DELETE GRANT는 절대 추가하지 말 것 — 가격/카탈로그는
-- service_role(운영자 SQL Editor 또는 향후 관리자 API)만 바꾼다.
grant select on table town_items to anon, authenticated;

-- 2) star_purchases — 학생별 구매 이력(지급/차감 사실). reward_ledger와
--    동일 이유로 클라이언트에 SELECT조차 열지 않는다(아래 RLS 절 참고).
create table if not exists star_purchases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade, -- reward_ledger(v3_36)와 동일한 on delete cascade 판단을 그대로 따른다(파일 헤더 근거는 v3_36 참고) — 학생 삭제 시 구매 이력도 함께 정리.
  item_id text not null references town_items(id),
  stars_spent smallint not null check (stars_spent > 0),
  created_at timestamptz not null default now(),
  unique (student_id, item_id) -- 학생당 아이템당 최대 1건 — 이 unique 제약 자체가 idempotency 메커니즘(위 헤더 설명 참고). 별도 idempotency_key 컬럼을 두지 않는다.
);
create index if not exists idx_star_purchases_student on star_purchases (student_id);

alter table star_purchases enable row level security;
-- 정책 0개 + GRANT 0개(reward_ledger v3_36과 동일 최소 권한 패턴) —
-- anon/authenticated에 select/insert/update/delete GRANT를 절대 추가하지
-- 말 것. 학생 화면은 이 테이블을 직접 읽지 않고 항상 get_town_shop_state()
-- RPC를 통해서만 파생값을 받는다.
revoke all on table star_purchases from anon, authenticated;

-- 3) purchase_town_item — 구매 단일 진입점. service_role 전용(SECURITY
--    DEFINER 함수는 기본적으로 PUBLIC에 EXECUTE 권한이 부여되므로 아래
--    REVOKE로 반드시 회수 — supabase_v3_5_season_lifecycle.sql의
--    start_new_season과 동일 경고). 학생이 이 함수를 직접 호출할 수
--    있으면 클라이언트가 stars_spent/가격 검증을 우회해 별을 무한정
--    깎아낼 수 있으므로, 반드시 api/*.js(service_role key)만 호출한다.
create or replace function public.purchase_town_item(p_student_id uuid, p_item_id text)
returns table (ok boolean, reason text, stars_spent integer, balance_after integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
-- OUT 컬럼명(stars_spent 등)이 테이블 컬럼명과 겹칠 때 plpgsql이 모호한
-- 컬럼 참조로 런타임 오류(column reference is ambiguous)를 내는 것을
-- 막는 belt-and-braces 설정 — 아래에서도 모든 컬럼 참조에 테이블 별칭을
-- 명시해 이 설정에 의존하지 않고도 안전하게 동작하도록 이중으로 막는다.
declare
  v_price integer;
  v_earned integer;
  v_spent integer;
  v_available integer;
begin
  -- 1) 학생 존재 확인.
  if p_student_id is null or not exists (select 1 from students s where s.id = p_student_id) then
    return query select false, 'student_not_found'::text, 0, 0;
    return;
  end if;

  -- 2) 활성 아이템 + 가격 조회.
  select ti.price into v_price from town_items ti where ti.id = p_item_id and ti.active;
  if not found then
    return query select false, 'item_not_found'::text, 0, 0;
    return;
  end if;

  -- 3) 학생별 advisory lock — students 행 자체는 이 경로에서 갱신하지
  --    않으므로(총 별은 reward_ledger에서 파생, 잔액은 매번 재계산) 걸어
  --    둘 row가 없다. 같은 학생이 거의 동시에 두 번 구매 요청을 보내는
  --    경합(더블클릭/네트워크 재시도)을 직렬화하기 위해 학생별 고유 키로
  --    advisory lock을 건다(hashtext, xact 범위라 트랜잭션 종료 시 자동
  --    해제 — supabase_v3_5_season_lifecycle.sql의 start_new_season과
  --    동일 패턴).
  perform pg_advisory_xact_lock(hashtext('purchase_town_item:' || p_student_id::text));

  -- 4) ⚠️ 잔액 계산은 반드시 reward_totals(서버 원장 파생 뷰)만 신뢰한다.
  --    student_progress.total_stars는 클라이언트가 직접 쓰는 표시용
  --    캐시라 조작 가능 — 이 판정에 절대 쓰지 않는다(CLAUDE.md 규칙 1/4와
  --    같은 정신 — 신뢰 경계가 다른 값을 구매 가능 여부에 섞지 않는다).
  v_earned := coalesce((select rt.earned_stars from reward_totals rt where rt.student_id = p_student_id), 0);
  v_spent := coalesce((select sum(sp.stars_spent) from star_purchases sp where sp.student_id = p_student_id), 0);
  v_available := greatest(v_earned - v_spent, 0);

  -- 5) 이미 보유 중이면 재구매 없이 already_owned.
  if exists (select 1 from star_purchases sp where sp.student_id = p_student_id and sp.item_id = p_item_id) then
    return query select true, 'already_owned'::text, 0, v_available;
    return;
  end if;

  -- 6) 잔액 부족.
  if v_available < v_price then
    return query select false, 'insufficient'::text, 0, v_available;
    return;
  end if;

  -- 7) 실제 차감(구매) — unique(student_id,item_id) 경합에 대비해 예외
  --    처리로 감싼다: advisory lock이 같은 학생의 순차 처리를 보장하지만,
  --    혹시 모를 레이스(예: 잠금 구현이 바뀌는 미래 리팩터링)에도 이중
  --    차감 대신 already_owned로 안전하게 수렴시킨다.
  begin
    insert into star_purchases (student_id, item_id, stars_spent)
    values (p_student_id, p_item_id, v_price);
  exception when unique_violation then
    return query select true, 'already_owned'::text, 0, v_available;
    return;
  end;

  return query select true, 'purchased'::text, v_price, (v_available - v_price);
end;
$$;

revoke all on function public.purchase_town_item(uuid, text) from public;
revoke all on function public.purchase_town_item(uuid, text) from anon, authenticated;
grant execute on function public.purchase_town_item(uuid, text) to service_role;

-- 4) get_town_shop_state — 조회 전용 파생값(잔액/보유 아이템). 클라이언트
--    화면이 star_purchases/reward_ledger를 직접 SELECT하지 않고 이 RPC
--    하나로만 상태를 받는다(위 RLS 절 설명과 일관).
create or replace function public.get_town_shop_state(p_student_id uuid)
returns table (earned integer, spent integer, available integer, owned_item_ids text[])
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
-- OUT 컬럼명(earned/spent 등)이 테이블 컬럼명과 겹칠 때의 모호한 컬럼 참조
-- 오류를 막는 belt-and-braces 설정(purchase_town_item과 동일 이유) — 아래
-- 모든 컬럼 참조에도 테이블 별칭을 명시해 이 설정에 의존하지 않는다.
declare
  v_earned integer;
  v_spent integer;
  v_owned text[];
begin
  v_earned := coalesce((select rt.earned_stars from reward_totals rt where rt.student_id = p_student_id), 0);
  v_spent := coalesce((select sum(sp.stars_spent) from star_purchases sp where sp.student_id = p_student_id), 0);
  select coalesce(array_agg(sp.item_id), '{}'::text[]) into v_owned
    from star_purchases sp where sp.student_id = p_student_id;
  return query select v_earned, v_spent, greatest(v_earned - v_spent, 0), v_owned;
end;
$$;

revoke all on function public.get_town_shop_state(uuid) from public;
revoke all on function public.get_town_shop_state(uuid) from anon, authenticated;
grant execute on function public.get_town_shop_state(uuid) to service_role;

-- PostgREST 스키마/권한 캐시 즉시 갱신(새 테이블/함수 인식).
notify pgrst, 'reload schema';

-- ============================================================================
-- 실행 후 확인 (부작용 없는 조회만 — 같은 SQL Editor에서 바로 실행 가능)
--
--   select * from town_items;
--   -- shop-lamp 1행, price=60이 보여야 함(재실행해도 가격 그대로).
--   select count(*) from star_purchases;
--   -- 초기에는 0건이 정상.
--   select proname, prosecdef from pg_proc
--     where proname in ('purchase_town_item','get_town_shop_state');
--   -- prosecdef = true(SECURITY DEFINER) 확인.
--
-- anon key로 town_items를 SELECT하면 shop-lamp가 보여야 하고(카탈로그는
-- 공개), star_purchases를 SELECT하면 42501(permission denied)이어야
-- 정상이다(reward_ledger와 동일 최소 권한). purchase_town_item/
-- get_town_shop_state를 anon/authenticated 키로 직접 RPC 호출하면 42501
-- (또는 함수 자체가 안 보임)이어야 정상 — service_role 전용.
-- ============================================================================
