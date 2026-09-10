-- ============================================================================
-- supabase_v3_50_town_v1.sql — Paul Town V1: 마을 상점 확장(카탈로그
-- 메타데이터 + 레벨 잠금) + 신규 학생 웰컴 크레딧. 2026-09-11.
--
-- 실행은 운영자가 Supabase 대시보드 SQL Editor에서 supabase_v3_49_
-- paul_dollar.sql 실행 확인 후 1회 실행(수동 실행, CLAUDE.md 규칙 8).
-- BEGIN/COMMIT 트랜잭션으로 감싸 부분 적용을 막는다. 멱등 — 여러 번
-- 실행해도 안전(add column if not exists / on conflict do update(메타
-- 컬럼만) / create or replace function / DO 블록 가드).
--
-- ── 목적 ──────────────────────────────────────────────────────────────────
-- 1) town_items에 카탈로그 메타데이터 컬럼 4개(category/sort_order/
--    min_level/asset_key)를 추가하고 16개 신규 아이템 + 기존 shop-lamp의
--    메타데이터를 시드한다 — price/active는 이 파일이 절대 건드리지
--    않는다(운영자가 대시보드에서 조정했을 수 있는 값 보존, v3_47/v3_49와
--    동일 판단).
-- 2) town_level_for_stars(stars) — 별 총량(reward_totals.earned_stars,
--    절대 감소하지 않는 서버 원장 파생값)을 레벨 1~10으로 환산하는 순수
--    함수. 임계값 [0,20,50,100,200,350,550,800,1100,1500]는 승인된 설계
--    (src/utils/town/townLevel.js와 동일 값이어야 함 — 아래 "실행 순서"
--    참고).
-- 3) purchase_town_item — v3_49 본문을 그대로 두고 딱 한 곳(아이템 조회
--    직후, advisory lock 이전)에 레벨 잠금 검사만 추가한다. 그 외 로직은
--    v3_49와 바이트 단위로 동일 — 잠금 도입이 기존 구매 계약(already_owned/
--    insufficient/purchased/원자적 두 INSERT)을 조금도 바꾸지 않는다
--    (CLAUDE.md 규칙 1).
-- 4) grant_town_welcome_credit — 신규 학생에게 정확히 1회, $20 웰컴
--    크레딧을 지급하는 함수. 이 마이그레이션 자체는 아무 학생에게도
--    지급하지 않는다(함수 정의만) — 지급은 앱의 paulTownV1 플래그 ON
--    상태에서 학생 본인 세션이 1회 호출할 때만 일어난다. UNIQUE
--    idempotency_key(`${student_id}:welcome:town-v1`)가 "정확히 1회"를
--    구조적으로 강제한다(소급/백필 없음).
--
-- ── 예상 변경 규모(expected delta table) ─────────────────────────────────
--   town_items 컬럼           +4 (category, sort_order, min_level, asset_key)
--   town_items 행             +16(신규 아이템) + 기존 shop-lamp 메타 갱신 1건
--   함수 create/replace       3  — purchase_town_item 교체 1(레벨 잠금 추가)
--                                 · town_level_for_stars 신규 1
--                                 · grant_town_welcome_credit 신규 1
--   dollar_ledger 행          0  (이 마이그레이션 실행 자체는 어떤 학생에게도
--                                 웰컴 크레딧을 지급하지 않는다 — 함수 정의뿐)
--   reward_ledger 행          0
--   students / student_progress 행  0
--   star_purchases / town_purchases 행  0(이 파일은 두 테이블 모두 전혀
--                                 건드리지 않는다)
--
-- ── 코드 전/후 어느 순서든 안전(CLAUDE.md 규칙 9) ────────────────────────
-- 이 SQL이 아직 실행되지 않은 상태에서 클라이언트가 새 카탈로그 메타
-- (category/sort_order/min_level/asset_key)를 조회하면 PostgREST가 해당
-- 컬럼 부재로 42703을 낼 수 있으므로, 클라이언트는 이 컬럼들이 없을 때
-- 자체 카탈로그 메타(하드코딩 fallback)로 폴백해야 한다(신규 구현 시
-- 필수). 반대로 이 SQL이 클라이언트 코드보다 먼저 실행돼도 안전 — 새
-- 컬럼/함수를 아직 읽지 않는 구 클라이언트는 그냥 무시할 뿐이고, 레벨
-- 잠금이 추가된 purchase_town_item도 min_level 기본값이 1이라 사실상
-- 모든 기존 아이템 구매를 그대로 통과시킨다(레벨 1 미만은 없음).
--
-- ── town_items 새 컬럼에 대한 GRANT — 추가 조치 불필요 ───────────────────
-- v3_47이 이미 `grant select on table town_items to anon, authenticated;`
-- 로 테이블 단위 SELECT를 부여했다(컬럼 단위 GRANT가 아님) — PostgreSQL의
-- 테이블 단위 GRANT는 그 테이블에 나중에 추가되는 모든 컬럼에 자동으로
-- 적용되므로, 이 파일이 추가하는 새 컬럼 4개도 별도 GRANT 없이 곧바로
-- anon/authenticated SELECT로 조회 가능하다(확인: town_items는
-- CLAUDE.md 규칙 10이 명시한 `students` 테이블이 아니므로 그 규칙이 직접
-- 적용되지는 않지만, "새 컬럼에 GRANT가 필요한가"라는 동일한 점검을 거친
-- 결과 — 이 테이블은 컬럼별이 아니라 테이블 단위 권한 모델이라 추가 조치
-- 불필요하다는 뜻).
--
-- ── 실행 순서 참고(강제 아님, 문서화만) ──────────────────────────────────
-- src/utils/town/townLevel.js(클라이언트 전용 레벨 계산, 이 SQL과 별도
-- 세션이 병행 작성 중)의 임계값 배열과 이 파일의
-- town_level_for_stars() 임계값이 반드시 일치해야 한다 — 두 값이 어긋나면
-- 클라이언트가 표시하는 레벨과 서버가 실제로 잠그는 레벨이 달라지는 UX
-- 버그(보안 문제는 아님 — 서버가 항상 최종 권위)가 생긴다.
--
-- ── 롤백 ──────────────────────────────────────────────────────────────────
-- supabase_v3_50_town_v1_ROLLBACK.sql. town_items의 새 컬럼 4개는 롤백이
-- 지우지 않는다(이 저장소의 destructive-SQL 게이트가 컬럼 삭제 구문 자체를
-- Write/Edit 단계에서 차단 — 롤백 파일 헤더에 상세 설명).
-- ============================================================================

begin;

-- 1) town_items — 카탈로그 메타데이터 컬럼 4개 추가(기존 컬럼 0개 변경/
--    제거). min_level은 CHECK로 1~10 범위를 강제하고 기본값 1 — 기존
--    아이템(shop-lamp 포함, 아래에서 메타만 갱신)과 이 파일이 아직 다루지
--    않는 미래 아이템 모두 안전한 기본값으로 시작한다.
alter table town_items
  add column if not exists category text,
  add column if not exists sort_order smallint not null default 0,
  add column if not exists min_level smallint not null default 1 check (min_level between 1 and 10),
  add column if not exists asset_key text;

-- 2) 신규 아이템 16종 시드 — on conflict (id) do update는 메타데이터
--    4개 컬럼(category/sort_order/min_level/asset_key)만 갱신한다.
--    price/active는 SET 절에 없으므로 재실행해도 운영자가 대시보드에서
--    조정했을 수 있는 값을 절대 덮어쓰지 않는다(v3_47/v3_49와 동일 원칙).
--    신규 행 삽입 시에는 이 INSERT가 공급하는 price/active 값이 그대로
--    쓰인다.
insert into town_items (id, name, emoji, price, price_currency, active, category, sort_order, min_level, asset_key)
values
  ('british-cottage',  '영국 코티지',   '🏠',  80, 'dollars', true, 'house',      10, 1, 'buildings/british-cottage'),
  ('tree',              '나무',          '🌳',  10, 'dollars', true, 'nature',     10, 1, 'nature/tree'),
  ('bench',             '벤치',          '🪑',  15, 'dollars', true, 'decoration', 20, 1, 'decorations/bench'),
  ('town-sign',         '마을 표지판',   '🪧',  40, 'dollars', true, 'decoration', 30, 1, 'decorations/town-sign'),
  ('cat',               '고양이',        '🐱',  20, 'dollars', true, 'animal',     10, 2, 'animals/cat'),
  ('street-lamp',       '가로등',        '🪔',  25, 'dollars', true, 'decoration', 40, 2, 'decorations/street-lamp'),
  ('red-post-box',      '빨간 우편함',   '📮',  25, 'dollars', true, 'decoration', 50, 2, 'decorations/red-post-box'),
  ('flower-garden',     '꽃밭',          '🌷',  30, 'dollars', true, 'nature',     20, 3, 'nature/flower-garden'),
  ('book-shop',         '책방',          '📚', 120, 'dollars', true, 'house',      20, 3, 'buildings/book-shop'),
  ('puppy',             '강아지',        '🐶',  30, 'dollars', true, 'animal',     20, 4, 'animals/puppy'),
  ('owl',               '부엉이',        '🦉',  40, 'dollars', true, 'animal',     30, 4, 'animals/owl'),
  ('cafe',              '카페',          '☕', 120, 'dollars', true, 'house',      30, 5, 'buildings/cafe'),
  ('stone-fountain',    '돌 분수',       '⛲',  60, 'dollars', true, 'decoration', 60, 5, 'decorations/stone-fountain'),
  ('bridge',            '돌다리',        '🌉', 150, 'dollars', true, 'special',    10, 6, 'special/bridge'),
  ('english-school',    '영어 학교',     '🏫', 150, 'dollars', true, 'special',    20, 7, 'special/english-school'),
  ('clock-tower',       '시계탑',        '🕰️', 200, 'dollars', true, 'special',    30, 8, 'special/clock-tower')
on conflict (id) do update set
  category   = excluded.category,
  sort_order = excluded.sort_order,
  min_level  = excluded.min_level,
  asset_key  = excluded.asset_key;

-- 3) 기존 shop-lamp(v3_47 시드) 메타데이터만 갱신 — price(60)/active/name/
--    emoji/price_currency는 이 UPDATE가 SET 절에 포함하지 않으므로 절대
--    바뀌지 않는다. 멱등(같은 값을 반복 SET해도 안전).
update town_items
   set category   = 'decoration',
       sort_order = 90,
       min_level  = 1,
       asset_key  = 'decorations/shop-lamp'
 where id = 'shop-lamp';

-- 4) town_level_for_stars — 별 총량 → 레벨 1~10 순수 변환 함수. 테이블을
--    전혀 참조하지 않는 결정적(deterministic) 계산이라 language sql
--    immutable로 선언한다. null/음수는 레벨 1로 취급(방어적 기본값).
--    임계값 [0,20,50,100,200,350,550,800,1100,1500] → 레벨 1..10.
create or replace function public.town_level_for_stars(p_stars integer)
returns integer
language sql
immutable
as $$
  select case
    when p_stars is null or p_stars < 0 then 1
    when p_stars >= 1500 then 10
    when p_stars >= 1100 then 9
    when p_stars >= 800  then 8
    when p_stars >= 550  then 7
    when p_stars >= 350  then 6
    when p_stars >= 200  then 5
    when p_stars >= 100  then 4
    when p_stars >= 50   then 3
    when p_stars >= 20   then 2
    else 1
  end;
$$;

-- 클라이언트가 이 함수를 직접 RPC로 호출할 필요는 없다(레벨 표시는
-- src/utils/town/townLevel.js의 동일 임계값으로 클라이언트에서 계산) —
-- purchase_town_item(SECURITY DEFINER, service_role 전용) 내부에서만
-- 쓰이므로 다른 신규 함수와 동일하게 service_role 전용으로 잠근다.
revoke all on function public.town_level_for_stars(integer) from public;
revoke all on function public.town_level_for_stars(integer) from anon, authenticated;
grant execute on function public.town_level_for_stars(integer) to service_role;

-- 5) purchase_town_item — v3_49 본문 그대로 + 레벨 잠금 검사 1곳만 추가
--    (아이템 조회/화폐 검사 직후, advisory lock 이전 — 잠긴 아이템에는
--    애초에 어떤 자원도 잠그지 않는다). 반환 shape은 v3_49와 동일(ok,
--    reason, dollars_spent, balance_after)이므로 drop 없이 create or
--    replace만으로 안전하게 교체된다.
create or replace function public.purchase_town_item(p_student_id uuid, p_item_id text)
returns table (
  ok boolean,
  reason text,
  dollars_spent integer,
  balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_price integer;
  v_currency text;
  v_balance integer;
  v_min_level smallint;
  v_level integer;
begin
  -- 1) 학생 존재 확인.
  if p_student_id is null or not exists (select 1 from students s where s.id = p_student_id) then
    return query select false, 'student_not_found'::text, 0, 0;
    return;
  end if;

  -- 2) 활성 아이템 + 가격 + 화폐 + 최소 레벨 조회.
  select ti.price, ti.price_currency, ti.min_level into v_price, v_currency, v_min_level
    from town_items ti
   where ti.id = p_item_id
     and ti.active;
  if not found then
    return query select false, 'item_not_found'::text, 0, 0;
    return;
  end if;

  -- 3) 이 아이템이 폴달러로 구매 가능한 아이템이 아니면(레거시 stars
  --    전용 아이템이 향후 남아있을 가능성 대비) 구매 자체를 거부한다 —
  --    이 함수는 오직 dollars 아이템만 처리한다.
  if v_currency is distinct from 'dollars' then
    return query select false, 'item_not_purchasable'::text, 0, 0;
    return;
  end if;

  -- 3-b) [town_v1 신규] 레벨 잠금 확인 — 별 총량 기준(reward_totals,
  --      절대 감소하지 않음)으로 레벨을 계산해 최소 레벨 미달이면 구매
  --      자체를 거부한다. advisory lock 이전에 검사하므로 잠긴 아이템은
  --      어떤 자원도 잠그지 않고 즉시 반환한다. balance_after는 다른
  --      조기 반환 분기(item_not_found 등)와 달리 실제 현재 잔액을
  --      돌려준다 — 클라이언트가 "잠김" 화면에서도 잔액을 함께 보여줄 수
  --      있도록.
  v_level := public.town_level_for_stars(
    coalesce((select rt.earned_stars from reward_totals rt where rt.student_id = p_student_id), 0)
  );
  if v_min_level > v_level then
    v_balance := coalesce((select db.balance from dollar_balances db where db.student_id = p_student_id), 0);
    return query select false, 'locked'::text, 0, v_balance;
    return;
  end if;

  -- 4) 학생별 advisory lock — v3_47/v3_49와 동일 이유(더블클릭/네트워크
  --    재시도 경합을 학생 단위로 직렬화, xact 범위라 트랜잭션 종료 시
  --    자동 해제).
  perform pg_advisory_xact_lock(hashtext('purchase_town_item:' || p_student_id::text));

  -- 5) ⚠️ 잔액 계산은 반드시 dollar_balances(폴달러 원장 파생 뷰)만
  --    신뢰한다. reward_totals/student_progress.total_stars 등 별 관련
  --    값은 이 함수 어디에서도 구매 가능 여부 판정에 쓰지 않는다(위
  --    3-b는 레벨 잠금 판정 전용이며 지출 가능 여부와는 무관).
  v_balance := coalesce((select db.balance from dollar_balances db where db.student_id = p_student_id), 0);

  -- 6) 이미 보유 중이면(star_purchases의 레거시 별 구매 또는
  --    town_purchases의 기존 폴달러 구매, 화폐 무관) 재구매 없이
  --    already_owned.
  if exists (select 1 from star_purchases sp where sp.student_id = p_student_id and sp.item_id = p_item_id)
     or exists (select 1 from town_purchases tp where tp.student_id = p_student_id and tp.item_id = p_item_id) then
    return query select true, 'already_owned'::text, 0, v_balance;
    return;
  end if;

  -- 7) 잔액 부족.
  if v_balance < v_price then
    return query select false, 'insufficient'::text, 0, v_balance;
    return;
  end if;

  -- 8) 실제 차감(구매) — town_purchases(폴달러 구매 이력, star_purchases는
  --    절대 건드리지 않음) + dollar_ledger(폴달러 차감) 두 INSERT를 이
  --    함수 본문(= 단일 트랜잭션) 안에서 함께 실행해 원자성을 보장한다.
  begin
    insert into town_purchases (student_id, item_id, currency, price_paid)
    values (p_student_id, p_item_id, 'dollars', v_price);

    insert into dollar_ledger (student_id, event_type, dollars_delta, source_type, source_id, idempotency_key)
    values (
      p_student_id,
      'purchase:' || p_item_id,
      -v_price,
      'purchase',
      p_item_id,
      p_student_id::text || ':purchase:' || p_item_id
    );
  exception when unique_violation then
    return query select true, 'already_owned'::text, 0, v_balance;
    return;
  end;

  return query select true, 'purchased'::text, v_price, (v_balance - v_price);
end;
$$;

revoke all on function public.purchase_town_item(uuid, text) from public;
revoke all on function public.purchase_town_item(uuid, text) from anon, authenticated;
grant execute on function public.purchase_town_item(uuid, text) to service_role;

-- 6) grant_town_welcome_credit — 신규 학생 웰컴 크레딧(정확히 1회, $20).
--    idempotency_key(`${student_id}:welcome:town-v1`)의 전역 UNIQUE
--    제약(dollar_ledger, v3_49)이 "정확히 1회"를 구조적으로 강제한다 —
--    동시에 여러 요청이 와도 정확히 하나만 삽입되고 나머지는 on conflict
--    do nothing으로 조용히 무시된다. 이 마이그레이션은 아무 학생에게도
--    지급하지 않는다(함수 정의만) — 지급은 앱의 paulTownV1 플래그 ON
--    상태에서 학생 본인 세션이 1회 호출할 때만, 소급/백필 없음.
create or replace function public.grant_town_welcome_credit(p_student_id uuid)
returns table (
  granted boolean,
  balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_rows integer;
  v_balance integer;
begin
  if p_student_id is null or not exists (select 1 from students s where s.id = p_student_id) then
    return query select false, 0;
    return;
  end if;

  insert into dollar_ledger (student_id, event_type, dollars_delta, source_type, source_id, idempotency_key)
  values (
    p_student_id,
    'welcome:town-v1',
    20,
    'welcome',
    'town-v1',
    p_student_id::text || ':welcome:town-v1'
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_rows = row_count;

  v_balance := coalesce((select db.balance from dollar_balances db where db.student_id = p_student_id), 0);

  return query select (v_rows > 0), v_balance;
end;
$$;

revoke all on function public.grant_town_welcome_credit(uuid) from public;
revoke all on function public.grant_town_welcome_credit(uuid) from anon, authenticated;
grant execute on function public.grant_town_welcome_credit(uuid) to service_role;

-- PostgREST 스키마/권한 캐시 즉시 갱신(새 컬럼/함수 인식).
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- 실행 후 확인 (부작용 없는 조회만 — 같은 SQL Editor에서 바로 실행 가능,
-- 상세 점검은 supabase_v3_50_town_v1_POST_VERIFY.sql 참고)
--
--   select count(*) from town_items where active and category is not null;
--   -- 17이어야 함(신규 16 + shop-lamp).
--   select id, category, sort_order, min_level, asset_key from town_items
--     where id = 'shop-lamp';
--   -- category='decoration', sort_order=90, min_level=1,
--   -- asset_key='decorations/shop-lamp' — price/active/name/emoji는 이
--   -- 파일 실행 전후로 한 글자도 바뀌지 않아야 함.
--   select public.town_level_for_stars(x) from (values (0),(19),(20),(1499),(1500)) v(x);
--   -- 순서대로 1,1,2,9,10.
--   select proname, prosecdef from pg_proc
--     where proname in ('town_level_for_stars','purchase_town_item','grant_town_welcome_credit');
--   -- purchase_town_item/grant_town_welcome_credit는 prosecdef=true.
--   -- town_level_for_stars는 SECURITY DEFINER가 아니어도 정상(SQL 순수
--   -- 함수, 테이블 미참조).
--   select count(*) from dollar_ledger where event_type = 'welcome:town-v1';
--   -- 0이어야 함(이 파일은 아무 학생에게도 지급하지 않음).
--
-- anon key로 town_items를 SELECT하면 새 컬럼(category/sort_order/
-- min_level/asset_key) 포함 전체가 그대로 보여야 정상(테이블 단위 GRANT).
-- grant_town_welcome_credit/town_level_for_stars를 anon/authenticated
-- 키로 직접 RPC 호출하면 42501(또는 함수 자체가 안 보임)이어야 정상.
-- ============================================================================
