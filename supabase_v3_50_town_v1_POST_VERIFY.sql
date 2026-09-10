-- POST_VERIFY — supabase_v3_50_town_v1.sql 실행 후 확인 전용.
-- 작성 2026-09-11. 이 파일은 SELECT만 담는다 — 어떤 쓰기(INSERT/UPDATE/
-- DELETE/ALTER/CREATE/DROP)도 없다. Supabase 대시보드 SQL Editor에서
-- 순서대로(또는 개별적으로) 실행해 각 결과를 눈으로 확인할 것.

-- ============================================================================
-- 1) 컬럼 존재 확인 — town_items에 category/sort_order/min_level/
--    asset_key 4개가 정확한 타입으로 존재하는지.
-- ============================================================================
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'town_items'
   and column_name in ('category', 'sort_order', 'min_level', 'asset_key')
 order by column_name;
-- 4행이어야 함. sort_order/min_level은 smallint, category/asset_key는
-- text, sort_order/min_level은 is_nullable='NO'(NOT NULL).

-- ============================================================================
-- 2) 활성 아이템 17개 전부 category not null(신규 16 + shop-lamp).
-- ============================================================================
select count(*) as active_items_with_category
  from town_items
 where active
   and category is not null;
-- 17이어야 함.

select id, category, sort_order, min_level, asset_key, price, active
  from town_items
 order by min_level, sort_order, id;
-- 17행 전체를 눈으로 확인 — shop-lamp가 price=60, active=true,
-- category='decoration', sort_order=90, min_level=1,
-- asset_key='decorations/shop-lamp'로 보여야 하고, 나머지 16개 신규
-- 아이템도 스펙과 일치해야 한다.

-- ============================================================================
-- 3) min_level 분포 — 레벨 1~8에 걸쳐 아이템이 존재해야 함(스펙상 9/10은
--    현재 아이템이 없음, 향후 확장 여지).
-- ============================================================================
select min_level, count(*) as item_count
  from town_items
 where active
 group by min_level
 order by min_level;

-- ============================================================================
-- 4) 함수 존재 + SECURITY DEFINER 여부.
-- ============================================================================
select proname, prosecdef, pronargs
  from pg_proc
 where proname in ('town_level_for_stars', 'purchase_town_item', 'grant_town_welcome_credit')
 order by proname;
-- 3행. purchase_town_item/grant_town_welcome_credit는 prosecdef=true.
-- town_level_for_stars는 SECURITY DEFINER가 아니어도 정상(순수 SQL 함수,
-- 테이블 미참조 — LANGUAGE SQL IMMUTABLE).

-- ============================================================================
-- 5) 함수 권한 — anon/authenticated는 실행 불가, service_role만 가능.
-- ============================================================================
select
  has_function_privilege('anon', 'public.town_level_for_stars(integer)', 'execute')            as anon_can_exec_level_fn,
  has_function_privilege('authenticated', 'public.town_level_for_stars(integer)', 'execute')   as authenticated_can_exec_level_fn,
  has_function_privilege('service_role', 'public.town_level_for_stars(integer)', 'execute')    as service_role_can_exec_level_fn;
-- anon/authenticated는 false, service_role은 true.

select
  has_function_privilege('anon', 'public.grant_town_welcome_credit(uuid)', 'execute')          as anon_can_exec_welcome_fn,
  has_function_privilege('authenticated', 'public.grant_town_welcome_credit(uuid)', 'execute') as authenticated_can_exec_welcome_fn,
  has_function_privilege('service_role', 'public.grant_town_welcome_credit(uuid)', 'execute')  as service_role_can_exec_welcome_fn;
-- anon/authenticated는 false, service_role은 true.

select
  has_function_privilege('anon', 'public.purchase_town_item(uuid, text)', 'execute')           as anon_can_exec_purchase_fn,
  has_function_privilege('authenticated', 'public.purchase_town_item(uuid, text)', 'execute')  as authenticated_can_exec_purchase_fn,
  has_function_privilege('service_role', 'public.purchase_town_item(uuid, text)', 'execute')   as service_role_can_exec_purchase_fn;
-- anon/authenticated는 false, service_role은 true(v3_49와 동일 유지).

-- ============================================================================
-- 6) town_level_for_stars 임계값 spot check — [0,20,50,100,200,350,550,
--    800,1100,1500] 경계 5곳.
-- ============================================================================
select
  public.town_level_for_stars(0)    as lvl_at_0,     -- 기대: 1
  public.town_level_for_stars(19)   as lvl_at_19,    -- 기대: 1
  public.town_level_for_stars(20)   as lvl_at_20,    -- 기대: 2
  public.town_level_for_stars(1499) as lvl_at_1499,  -- 기대: 9
  public.town_level_for_stars(1500) as lvl_at_1500;  -- 기대: 10

select
  public.town_level_for_stars(null) as lvl_at_null,  -- 기대: 1
  public.town_level_for_stars(-5)   as lvl_at_negative; -- 기대: 1

-- ============================================================================
-- 7) dollar_ledger 웰컴 크레딧 행 — 이 마이그레이션 실행 직후에는 반드시
--    0건이어야 함(함수 정의만 생성, 아무 학생에게도 아직 지급 안 됨).
-- ============================================================================
select count(*) as welcome_credit_rows_immediately_after_migration
  from dollar_ledger
 where event_type = 'welcome:town-v1';
-- 0이어야 함(마이그레이션 실행 직후 시점 한정 — 이후 학생 세션이 실제로
-- grant_town_welcome_credit을 호출하기 시작하면 이 값은 자연스럽게
-- 증가한다, 이는 정상 동작이며 이 확인은 "실행 직후" 스냅샷 전용).

-- ============================================================================
-- 8) must_not_change 카운트 — 이 마이그레이션이 절대 건드리지 않는
--    테이블들의 행 수(운영자가 실행 전/후 값을 비교해야 함, 이 파일
--    단독으로는 "전" 값을 모르므로 실행 직후 스냅샷만 남긴다).
-- ============================================================================
select
  (select count(*) from reward_ledger)     as reward_ledger_rows,
  (select count(*) from dollar_ledger)     as dollar_ledger_rows_total,
  (select count(*) from town_purchases)    as town_purchases_rows,
  (select count(*) from star_purchases)    as star_purchases_rows,
  (select count(*) from students)          as students_rows,
  (select count(*) from student_progress)  as student_progress_rows;
-- reward_ledger_rows/town_purchases_rows/star_purchases_rows/students_rows/
-- student_progress_rows는 실행 전과 정확히 같아야 한다. dollar_ledger_rows_total도
-- 이 마이그레이션 자체는 새 행을 만들지 않으므로(함수 정의만) 실행 전과
-- 같아야 한다 — 단, 이 마이그레이션 실행과 무관하게 그 사이 학생들이
-- 계속 학습해 reward_ledger 트리거로 dollar_ledger 행이 늘었다면(v3_49
-- 트리거는 이 마이그레이션과 무관하게 항상 동작 중) 그만큼은 자연 증가로
-- 간주하고 reward_ledger_rows 증가분과 대조해 설명 가능해야 한다.
