-- ROLLBACK — supabase_v3_49_paul_dollar.sql(Paul Dollar V1) 되돌리기.
-- 작성 2026-09-08. **아직 실행하지 않음.** 배포 실패 시에만 사용.
--
-- 실행 방법: Supabase 대시보드 SQL Editor. 아래 STAGE를 **하나씩** 실행하고
-- 각 단계의 확인 쿼리를 눈으로 본 뒤 다음으로 넘어갈 것. 통째로 붙여넣지
-- 말 것.
--
-- ── 이 파일의 범위 ─────────────────────────────────────────────────────
-- v3_49가 만든 것만 정확히 되돌린다: 트리거(trg_reward_ledger_to_dollars) +
-- 트리거 함수(fn_reward_ledger_to_dollars) 제거, RPC 2종을 v3_47의 별
-- 기반(stars) 본문으로 원복, dollar_balances 뷰 제거, dollar_ledger에서
-- 이 트리거/RPC가 만든 행만 정확히 삭제(WHERE 절 필수, CLAUDE.md 규칙 18),
-- town_purchases에서 이 RPC가 만든 폴달러 구매 행만 정확히 삭제(WHERE 절
-- 필수 — currency='dollars'는 이 테이블의 CHECK 제약상 사실상 전체 행과
-- 같지만 형태를 명시적으로 남긴다, 아래 STAGE 1 4)번 설명 참고).
-- dollar_rules/dollar_ledger/town_purchases 세 테이블 구조 자체와
-- town_items.price_currency 컬럼은 그대로 남긴다(구조 삭제 구문은 이
-- 저장소의 destructive-SQL 게이트가 Write/Edit 단계에서 차단 대상으로
-- 삼는 영역이라 애초에 이 파일에 담을 수 없다 — v3_47/v3_48 ROLLBACK과
-- 동일 판단). star_purchases는 v3_49가 애초에 전혀 건드리지 않았으므로
-- (구조/데이터 둘 다) 이 롤백도 당연히 손대지 않는다.
--
-- ── 함수/뷰/트리거 제거 구문은 checkDestructiveSql.mjs 차단 대상이 아니다 ──
-- 이 저장소의 destructive-command 게이트(scripts/hooks/checkDestructiveSql.mjs)
-- 는 테이블/컬럼/데이터베이스/스키마 구조를 지우는 구문과 전체 비우기
-- 구문만 차단하고, 함수/뷰/트리거 제거 구문은 차단하지 않는다(CLAUDE.md
-- 규칙 18) — 아래 트리거/함수/뷰 제거 구문은 그래서 이 파일에 포함할 수
-- 있다. 테이블 구조 자체를 없애는 구문은 이 파일에 없다.
--
-- ── ⚠️ 롤백 이후 학생 대상 동작(운영자 필독) ───────────────────────────────
-- 이 롤백은 purchase_town_item/get_town_shop_state를 v3_47의 **별(stars)
-- 기반 차감 로직 그대로**로 되돌린다 — 즉 롤백 직후에는 "구매 시 별이
-- 차감되는" 예전 동작이 다시 살아난다. townShopV1 플래그가 이미 학생에게
-- ON으로 배포돼 있다면, 이 롤백을 실행하는 순간부터 학생 화면이 다시
-- "별로 구매"라고 표시/차감할 수 있으므로, 운영자는 **이 롤백을 실행하기
-- 전에 townShopV1 플래그를 반드시 OFF로 내려야 한다**(별 차감 로직 자체가
-- 부활하는 것을 원하지 않는다면). 이 파일 자체는 플래그를 건드리지 않는다
-- (SQL 파일이라 클라이언트 설정에 관여할 수 없음 — 플래그 조작은 운영자의
-- 별도 배포 작업).
--
-- ── 절대 건드리지 않는 것 ───────────────────────────────────────────────
-- students / student_progress / total_stars / reward_ledger(모든 행, v1/v2
-- legacy-baseline 포함) / reward_totals / xp_ledger / town_items.price(60)
-- / dollar_rules 시드 행 / star_purchases(테이블 전체 — v3_49가 애초에
-- 쓰기 구문 0건이었으므로 이 롤백도 0건).
-- 이 파일은 v3_49가 새로 만든 트리거/함수/뷰와, 그 트리거/RPC가 만든
-- dollar_ledger/town_purchases 행(각각 이벤트 타입/currency로 정확히
-- 식별 가능한 것)만 지운다.

-- ============================================================================
-- STAGE 0 — 현재 상태 확인 (읽기 전용, 항상 먼저 실행)
-- ============================================================================
select
  (select count(*) from pg_trigger where tgname = 'trg_reward_ledger_to_dollars')      as trigger_rows,
  (select count(*) from pg_proc where proname = 'fn_reward_ledger_to_dollars')          as trigger_fn_rows,
  (select count(*) from pg_proc where proname = 'purchase_town_item')                   as purchase_fn_rows,
  (select count(*) from pg_proc where proname = 'get_town_shop_state')                  as state_fn_rows,
  (select count(*) from pg_views where viewname = 'dollar_balances')                    as balances_view_rows,
  (select count(*) from dollar_ledger where event_type like 'reward:%')                 as reward_derived_dollar_rows,
  (select count(*) from dollar_ledger where event_type like 'purchase:%')               as purchase_derived_dollar_rows,
  (select count(*) from dollar_rules)                                                   as dollar_rules_rows,
  (select count(*) from town_purchases where currency = 'dollars')                      as dollar_purchase_rows,
  (select count(*) from star_purchases)                                                 as star_purchases_rows_must_be_unchanged;

-- ============================================================================
-- STAGE 1 — 트리거/함수/뷰 제거 + RPC 2종을 v3_47(별 기반) 본문으로 원복.
--   멱등(재실행해도 안전 — 이미 지워진 트리거/함수/뷰에 대해서는 그냥
--   if exists no-op, create or replace는 몇 번이든 안전).
-- ============================================================================
begin;

-- 1) 트리거 먼저 제거(함수보다 먼저 지워야 함 — 트리거가 함수를 참조).
drop trigger if exists trg_reward_ledger_to_dollars on reward_ledger;
drop function if exists public.fn_reward_ledger_to_dollars();

-- 2) RPC 2종 제거 후 v3_47 원본 본문으로 재생성(시그니처/반환 shape을
--    v3_47과 정확히 동일하게 되돌린다 — 아래 본문은
--    supabase_v3_47_town_shop.sql에서 그대로 복사한 것이며 한 글자도
--    바꾸지 않았다).
drop function if exists public.get_town_shop_state(uuid);
drop function if exists public.purchase_town_item(uuid, text);

create or replace function public.purchase_town_item(p_student_id uuid, p_item_id text)
returns table (ok boolean, reason text, stars_spent integer, balance_after integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_price integer;
  v_earned integer;
  v_spent integer;
  v_available integer;
begin
  if p_student_id is null or not exists (select 1 from students s where s.id = p_student_id) then
    return query select false, 'student_not_found'::text, 0, 0;
    return;
  end if;

  select ti.price into v_price from town_items ti where ti.id = p_item_id and ti.active;
  if not found then
    return query select false, 'item_not_found'::text, 0, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('purchase_town_item:' || p_student_id::text));

  v_earned := coalesce((select rt.earned_stars from reward_totals rt where rt.student_id = p_student_id), 0);
  v_spent := coalesce((select sum(sp.stars_spent) from star_purchases sp where sp.student_id = p_student_id), 0);
  v_available := greatest(v_earned - v_spent, 0);

  if exists (select 1 from star_purchases sp where sp.student_id = p_student_id and sp.item_id = p_item_id) then
    return query select true, 'already_owned'::text, 0, v_available;
    return;
  end if;

  if v_available < v_price then
    return query select false, 'insufficient'::text, 0, v_available;
    return;
  end if;

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

create or replace function public.get_town_shop_state(p_student_id uuid)
returns table (earned integer, spent integer, available integer, owned_item_ids text[])
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
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

-- 3) dollar_balances 뷰 제거(파생 뷰뿐, 밑단 dollar_ledger 테이블 구조는
--    남긴다 — 아래 4번 참고).
drop view if exists dollar_balances;

-- 4) 트리거/구매 RPC가 만든 dollar_ledger 행만 정확히 삭제(WHERE 절
--    필수) — event_type 접두사로 두 출처를 정확히 구분한다:
--      'reward:' 접두사 = fn_reward_ledger_to_dollars 트리거가 만든 행
--      'purchase:' 접두사 = purchase_town_item(dollars) RPC가 만든 행
--    이 두 접두사 밖의 행은 애초에 이 마이그레이션이 만들 수 없으므로
--    (트리거/함수 코드 전체가 이 두 event_type 형식만 생성) 조건이 사실상
--    "이 파일이 만든 모든 행"과 동일하지만, 형태를 명시적으로 남겨 향후
--    다른 출처가 dollar_ledger에 행을 추가해도 이 롤백이 그 행까지
--    실수로 지우지 않도록 한다.
delete from dollar_ledger
 where event_type like 'reward:%'
    or event_type like 'purchase:%';

-- 5) purchase_town_item(v3_49)이 만든 폴달러 구매 이력만 정확히 삭제 —
--    town_purchases는 이 마이그레이션이 만든 신규 테이블이고 CHECK
--    제약(currency = 'dollars')상 이 테이블에는 애초에 다른 currency 값이
--    존재할 수 없으므로, 이 WHERE 조건은 사실상 "이 테이블의 모든 행"과
--    동일하다 — 그럼에도 형태를 명시적으로 남겨(CLAUDE.md 규칙 18, 무조건
--    DELETE 금지) 향후 이 테이블의 CHECK 제약이 완화되는 일이 생겨도 이
--    롤백이 의도치 않은 다른 화폐 행까지 지우지 않도록 한다.
delete from town_purchases
 where currency = 'dollars';

-- dollar_rules 시드 행/dollar_rules 테이블 구조, town_items.price_currency
-- 컬럼, town_purchases 테이블 구조는 전부 그대로 남긴다 — 구조 삭제 구문은
-- 이 파일 범위 밖(위 헤더 설명 참고). star_purchases는 애초에 이 파일이
-- 쓰기 구문 0건이므로(위 헤더 설명) 당연히 그대로 남는다.

-- 확인: 트리거/함수/뷰 0건, dollar_ledger의 reward:/purchase: 접두사 행
-- 0건, town_purchases 0건. dollar_rules/star_purchases는 STAGE 0과
-- 정확히 같아야 한다(이 롤백이 건드리지 않는 대상).
select
  (select count(*) from pg_trigger where tgname = 'trg_reward_ledger_to_dollars')       as trigger_rows_after,
  (select count(*) from pg_proc where proname = 'fn_reward_ledger_to_dollars')           as trigger_fn_rows_after,
  (select count(*) from pg_views where viewname = 'dollar_balances')                     as balances_view_rows_after,
  (select count(*) from dollar_ledger where event_type like 'reward:%')                  as reward_derived_dollar_rows_after,
  (select count(*) from dollar_ledger where event_type like 'purchase:%')                as purchase_derived_dollar_rows_after,
  (select count(*) from town_purchases where currency = 'dollars')                       as dollar_purchase_rows_after,
  (select count(*) from dollar_rules)                                                    as dollar_rules_rows_after_must_be_unchanged,
  (select count(*) from star_purchases)                                                  as star_purchases_rows_after_must_be_unchanged;

commit;

-- PostgREST 스키마/권한 캐시 즉시 갱신(트리거/함수/뷰 제거 및 RPC 반환
-- shape 원복을 클라이언트가 즉시 인식하도록).
notify pgrst, 'reload schema';

-- STAGE 1 이후 재실행 안전성: dollar_rules/dollar_ledger/town_purchases
-- 테이블 구조와 RLS/REVOKE는 그대로 남아 있으므로, v3_49를 다시 실행하면
-- 트리거/함수/뷰/새 RPC 본문이 정상적으로 재설치된다(정상 재설치 경로).
-- 단, 트리거는 재설치 시점 "이후"의 reward_ledger INSERT부터만 반응하므로,
-- 롤백 구간 동안 쌓인 별 지급에는 폴달러가 소급 지급되지 않는다(v3_49
-- 헤더의 실행 후 확인 절과 동일 판단 — 소급 백필 없음).

-- ============================================================================
-- STAGE 2 — 되돌린 뒤 학생 데이터 무변경 확인 (읽기 전용)
-- ============================================================================
select
  (select count(*) from reward_ledger)      as reward_ledger_rows_untouched,
  (select count(*) from students)           as students_rows_untouched,
  (select count(*) from student_progress)   as student_progress_rows_untouched,
  (select count(*) from town_items where id = 'shop-lamp' and price = 60) as shop_lamp_price_untouched;
-- STAGE 0 이전 값과 reward_ledger/students/student_progress 세 값이 정확히
-- 같아야 하고, shop_lamp_price_untouched는 항상 1이어야 한다(이 롤백은
-- town_items.price를 절대 바꾸지 않는다) — 다르면 이 파일이 아닌 다른
-- 원인이므로 즉시 중단하고 조사할 것.
