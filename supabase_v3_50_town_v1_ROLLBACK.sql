-- ROLLBACK — supabase_v3_50_town_v1.sql(Paul Town V1) 되돌리기.
-- 작성 2026-09-11. **아직 실행하지 않음.** 배포 실패 시에만 사용.
--
-- 실행 방법: Supabase 대시보드 SQL Editor. 아래 STAGE를 **하나씩** 실행하고
-- 각 단계의 확인 쿼리를 눈으로 본 뒤 다음으로 넘어갈 것. 통째로 붙여넣지
-- 말 것.
--
-- ── 이 파일의 범위 ─────────────────────────────────────────────────────
-- v3_50이 만든 것만 정확히 되돌린다: 신규 함수 2개(town_level_for_stars,
-- grant_town_welcome_credit) 제거, purchase_town_item을 v3_50 이전(=
-- v3_49) 본문으로 원복(레벨 잠금 검사만 제거, 그 외 v3_49의 폴달러 경제
-- 로직은 완전히 그대로 유지 — v3_47/v3_49 자체는 이 파일이 건드리지
-- 않는다), STAGE 2에서 v3_50이 새로 삽입한 16개 아이템 행만 조건부 삭제.
-- star_purchases/dollar_rules/dollar_ledger/town_purchases/dollar_balances
-- 구조, town_items.price_currency 컬럼, shop-lamp 행(가격 60) 전부 이
-- 파일이 손대지 않는다.
--
-- ── ⚠️ town_items의 신규 컬럼 4개(category/sort_order/min_level/
-- asset_key)는 이 롤백이 지우지 않는다(중요, v3_47/v3_48/v3_49 ROLLBACK과
-- 동일 판단) ─────────────────────────────────────────────────────────────
-- 이 저장소의 destructive-command 게이트(scripts/hooks/checkDestructiveSql.mjs,
-- CLAUDE.md 규칙 18)는 컬럼을 지우는 구문을 포함해 "ALTER TABLE 문 안에
-- 삭제 동사가 등장하는" 모든 패턴을 Write/Edit 저장 시점에 차단한다(테이블/
-- 컬럼 삭제 구문 전반 차단이 목적) — 즉 이 컬럼들을 지우는 SQL은 애초에
-- 이 파일에 담을 수조차 없다(기술적 불가능, 정책 선택이 아님). 남겨진
-- 컬럼은 무해하다 — min_level 기본값 1은 모든 학생을 항상 통과시키고,
-- category/sort_order/asset_key는 순수 표시 메타데이터라
-- purchase_town_item(원복된 v3_49 본문)이 전혀 참조하지 않는다. 컬럼을
-- 실제로 제거해야 한다면 운영자가 Supabase 대시보드에서 수동으로 ALTER
-- TABLE town_items에 대해 category/sort_order/min_level/asset_key 4개
-- 컬럼을 지우는 구문을 직접 작성해 실행해야 한다(이 저장소의 어떤
-- 마이그레이션 파일도 그 구문 자체를 담을 수 없음 — 파괴적 SQL 게이트가
-- "ALTER TABLE 문 안에 삭제 동사가 등장하는" 패턴 자체를 파일 저장
-- 단계에서 차단하므로, 이 설명조차 그 구문을 문자 그대로 적으면 저장이
-- 거부된다).
--
-- ── town_items 16개 신규 행 삭제가 FK로 막힐 수 있음(STAGE 2 필수 확인) ──
-- town_purchases.item_id가 town_items(id)를 참조한다(ON DELETE 액션 없음
-- = 기본 NO ACTION/RESTRICT). 이미 학생이 그 16개 아이템 중 하나라도
-- 폴달러로 구매했다면(town_purchases에 참조 행 존재) DELETE가 FK 위반으로
-- 실패한다 — STAGE 2의 확인 쿼리(blocking_purchases)가 0보다 크면 그
-- STAGE의 DELETE 문을 실행하지 말고 건너뛸 것(카탈로그 행이 남아있어도
-- 무해 — min_level/가격이 낮아 사실상 정상 아이템으로 계속 팔린다는 뜻일
-- 뿐, 이 롤백의 핵심 목적인 "레벨 잠금 로직 제거"와는 무관).
--
-- ── 절대 건드리지 않는 것 ───────────────────────────────────────────────
-- students / student_progress / total_stars / reward_ledger / reward_totals
-- / xp_ledger / dollar_rules(시드) / dollar_ledger(reward:/purchase:/
-- welcome: 어떤 접두사 행도 이 파일은 삭제하지 않는다 — 이미 지급된
-- 웰컴 크레딧은 실제로 학생에게 지급된 화폐이므로 소급 회수하지 않는다,
-- CLAUDE.md 규칙 1) / town_purchases(구조·행 전부) / star_purchases(전부)
-- / town_items.price_currency 컬럼 / town_items.price(60, shop-lamp 포함)
-- / town_items.active / town_items.name / town_items.emoji.
--
-- ============================================================================
-- STAGE 0 — 현재 상태 확인 (읽기 전용, 항상 먼저 실행)
-- ============================================================================
select
  (select count(*) from pg_proc where proname = 'town_level_for_stars')            as level_fn_rows,
  (select count(*) from pg_proc where proname = 'grant_town_welcome_credit')       as welcome_fn_rows,
  (select count(*) from pg_proc where proname = 'purchase_town_item')              as purchase_fn_rows,
  (select count(*) from town_items where id in (
     'british-cottage','tree','bench','town-sign','cat','street-lamp','red-post-box',
     'flower-garden','book-shop','puppy','owl','cafe','stone-fountain','bridge',
     'english-school','clock-tower'
   ))                                                                              as new_item_rows,
  (select count(*) from dollar_ledger where event_type = 'welcome:town-v1')        as welcome_credit_rows_untouched,
  (select count(*) from town_purchases)                                           as town_purchases_rows_untouched,
  (select count(*) from reward_ledger)                                            as reward_ledger_rows_untouched,
  (select count(*) from students)                                                 as students_rows_untouched;

-- ============================================================================
-- STAGE 1 — 함수 2종 제거 + purchase_town_item을 v3_49 본문으로 원복.
--   멱등(재실행해도 안전 — 이미 지워진 함수는 if exists no-op, create or
--   replace는 몇 번이든 안전). 이 STAGE는 town_items 행/컬럼을 전혀
--   건드리지 않으므로 STAGE 2의 FK 상황과 무관하게 항상 안전하게 먼저
--   실행할 수 있다.
-- ============================================================================
begin;

drop function if exists public.town_level_for_stars(integer);
drop function if exists public.grant_town_welcome_credit(uuid);

-- purchase_town_item을 v3_49의 정확한 본문으로 원복(레벨 잠금 검사만
-- 제거 — 아래는 supabase_v3_49_paul_dollar.sql에서 그대로 복사한 것이며
-- 한 글자도 바꾸지 않았다. dollar_balances/town_purchases 기반 폴달러
-- 경제 로직은 그대로 유지된다 — v3_47(별 기반)까지 되돌리지 않는다).
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
begin
  -- 1) 학생 존재 확인.
  if p_student_id is null or not exists (select 1 from students s where s.id = p_student_id) then
    return query select false, 'student_not_found'::text, 0, 0;
    return;
  end if;

  -- 2) 활성 아이템 + 가격 + 화폐 조회.
  select ti.price, ti.price_currency into v_price, v_currency
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

  -- 4) 학생별 advisory lock — v3_47과 동일 이유(더블클릭/네트워크 재시도
  --    경합을 학생 단위로 직렬화, xact 범위라 트랜잭션 종료 시 자동 해제).
  perform pg_advisory_xact_lock(hashtext('purchase_town_item:' || p_student_id::text));

  -- 5) ⚠️ 잔액 계산은 반드시 dollar_balances(폴달러 원장 파생 뷰)만
  --    신뢰한다. reward_totals/student_progress.total_stars 등 별 관련
  --    값은 이 함수 어디에서도 참조하지 않는다 — 별은 구매에 전혀
  --    관여하지 않는다.
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

notify pgrst, 'reload schema';

commit;

-- 확인: 두 신규 함수 0건, purchase_town_item 여전히 1건(원복된 본문).
select
  (select count(*) from pg_proc where proname = 'town_level_for_stars')      as level_fn_rows_after,
  (select count(*) from pg_proc where proname = 'grant_town_welcome_credit') as welcome_fn_rows_after,
  (select count(*) from pg_proc where proname = 'purchase_town_item')        as purchase_fn_rows_after;

-- ============================================================================
-- STAGE 2 — v3_50이 삽입한 16개 신규 아이템 행 삭제(선택적, FK 확인 필수).
--   ⚠️ 아래 확인 쿼리의 blocking_purchases가 0이 아니면 이 STAGE의 DELETE
--   문을 실행하지 말 것 — FK 위반으로 실패하거나(town_purchases.item_id
--   참조), 실행 전에 먼저 그 구매 행을 어떻게 처리할지 운영자가 별도로
--   결정해야 한다. blocking_purchases가 0이면 안전하게 진행 가능.
--   shop-lamp는 이 STAGE가 절대 삭제하지 않는다(id 목록에 없음).
-- ============================================================================

-- 2-a) FK 차단 여부 확인(읽기 전용, 반드시 먼저 실행).
select count(*) as blocking_purchases
  from town_purchases
 where item_id in (
   'british-cottage','tree','bench','town-sign','cat','street-lamp','red-post-box',
   'flower-garden','book-shop','puppy','owl','cafe','stone-fountain','bridge',
   'english-school','clock-tower'
 );

-- 2-b) blocking_purchases == 0일 때만 아래 DELETE를 별도로 실행할 것.
--      (의도적으로 STAGE 1과 별개 트랜잭션 — STAGE 1의 함수 원복은
--      FK 상황과 무관하게 항상 성공해야 하므로 같은 트랜잭션에 묶지
--      않는다.)
begin;

delete from town_items
 where id in (
   'british-cottage','tree','bench','town-sign','cat','street-lamp','red-post-box',
   'flower-garden','book-shop','puppy','owl','cafe','stone-fountain','bridge',
   'english-school','clock-tower'
 );

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- STAGE 3 — 되돌린 뒤 최종 확인 (읽기 전용)
-- ============================================================================
select
  (select count(*) from pg_proc where proname = 'town_level_for_stars')            as level_fn_rows_final,
  (select count(*) from pg_proc where proname = 'grant_town_welcome_credit')       as welcome_fn_rows_final,
  (select count(*) from town_items where id in (
     'british-cottage','tree','bench','town-sign','cat','street-lamp','red-post-box',
     'flower-garden','book-shop','puppy','owl','cafe','stone-fountain','bridge',
     'english-school','clock-tower'
   ))                                                                              as new_item_rows_final,
  (select count(*) from town_items where id = 'shop-lamp' and price = 60)          as shop_lamp_price_untouched,
  (select count(*) from dollar_ledger where event_type = 'welcome:town-v1')        as welcome_credit_rows_final_untouched,
  (select count(*) from reward_ledger)                                            as reward_ledger_rows_untouched,
  (select count(*) from students)                                                 as students_rows_untouched,
  (select count(*) from student_progress)                                        as student_progress_rows_untouched;
-- level_fn_rows_final/welcome_fn_rows_final은 0이어야 함. new_item_rows_final은
-- STAGE 2를 실행했으면 0, 건너뛰었으면 STAGE 0과 동일해야 함. 나머지
-- (shop_lamp_price_untouched=1, welcome_credit_rows_final_untouched/
-- reward_ledger_rows_untouched/students_rows_untouched/
-- student_progress_rows_untouched)는 STAGE 0 이전 값과 정확히 같아야
-- 한다 — 다르면 이 파일이 아닌 다른 원인이므로 즉시 중단하고 조사할 것.
