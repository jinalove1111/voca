-- ROLLBACK — Town Shop V1(supabase_v3_47_town_shop.sql) 되돌리기.
-- 작성 2026-09-06. **아직 실행하지 않음.** 배포 실패 시에만 사용.
--
-- 실행 방법: Supabase 대시보드 SQL Editor. 아래 STAGE를 **하나씩** 실행하고
-- 각 단계의 확인 쿼리를 눈으로 본 뒤 다음으로 넘어갈 것. 통째로 붙여넣지
-- 말 것.
--
-- ── 이 파일의 범위 ─────────────────────────────────────────────────────
-- STAGE 0(확인) / STAGE 1(데이터 삭제 + 함수 제거 + 권한 회수) / STAGE
-- 2(사후 확인)만 담는다. **town_items/star_purchases 테이블 구조 자체를
-- 없애는 구문(TABLE 삭제)은 이 파일에 없다** — 이 저장소의
-- destructive-command 게이트(scripts/hooks/checkDestructiveSql.mjs)가
-- 그 구문(IF EXISTS 포함) 패턴 자체를 Write/Edit 단계에서 차단하기
-- 때문이다(CLAUDE.md 규칙 18). 함수 제거 구문은 이 훅의 차단 대상이
-- 아니라서(TABLE/COLUMN/DATABASE/SCHEMA 삭제만 차단) 아래에 포함했다.
--
-- 테이블이 빈 채로 남아 있어도 앱은 안전하다 — 함수가 제거되고
-- service_role GRANT도 회수되므로 구매 자체가 더 이상 불가능해지고,
-- 클라이언트/서버는 42883(함수 없음)을 `table_missing`과 동일하게
-- 폴백해야 한다(v3_47 헤더 "코드 전/후 어느 순서든 안전" 절 참고). 정말
-- 테이블 구조까지 제거해야 하면 운영자가 게이트를 결재한 뒤 별도로
-- 작성한다.
--
-- ── 절대 건드리지 않는 것 ───────────────────────────────────────────────
-- students / student_progress / total_stars / reward_ledger / reward_totals
-- / xp_ledger 등 기존 테이블·뷰. 이 파일은 town_items/star_purchases와
-- 이번에 만든 함수 2개 외에는 읽기(확인용)조차 하지 않는다.

-- ============================================================================
-- STAGE 0 — 현재 상태 확인 (읽기 전용, 항상 먼저 실행)
-- ============================================================================
select
  (select count(*) from town_items)                                   as town_items_rows,
  (select count(*) from town_items where id = 'shop-lamp')            as shop_lamp_rows,
  (select count(*) from star_purchases)                               as star_purchases_rows,
  (select count(*) from star_purchases where item_id = 'shop-lamp')   as shop_lamp_purchase_rows,
  (select count(*) from pg_proc where proname = 'purchase_town_item') as purchase_fn_rows,
  (select count(*) from pg_proc where proname = 'get_town_shop_state') as state_fn_rows;

-- ============================================================================
-- STAGE 1 — 데이터 삭제 + 함수 제거 + 권한 회수. 멱등(재실행해도 안전 —
--   이미 지워진 행/함수에 대해서는 그냥 0건 삭제/if exists no-op).
-- ============================================================================
begin;

-- v3_47이 심은 시드 행만 정확히 지운다(다른 아이템이 나중에 추가됐다면
-- 그 행은 이 파일의 책임 범위 밖이므로 건드리지 않는다).
delete from star_purchases
 where item_id = 'shop-lamp';

delete from town_items
 where id = 'shop-lamp';

-- service_role 실행 권한 회수 — 회수 이후에는 이미 배포된 서버 코드가
-- purchase_town_item/get_town_shop_state를 호출해도 42501로 실패하고,
-- api/*.js는 이를 안전하게 처리해야 한다(구매 기능 비활성화 효과).
revoke execute on function public.purchase_town_item(uuid, text) from service_role;
revoke execute on function public.get_town_shop_state(uuid) from service_role;

-- 함수 자체 제거 구문(checkDestructiveSql.mjs 차단 대상이 아님 — TABLE/
-- COLUMN/DATABASE/SCHEMA만 차단). 테이블은 빈 채로 남긴다.
drop function if exists public.purchase_town_item(uuid, text);
drop function if exists public.get_town_shop_state(uuid);

-- 확인: 시드 행 0건, 함수 0건. town_items/star_purchases 테이블 자체는
-- 여전히 존재해야 한다(구조 제거는 이 파일 범위 밖).
select
  (select count(*) from town_items where id = 'shop-lamp')             as shop_lamp_rows_after,
  (select count(*) from star_purchases where item_id = 'shop-lamp')    as shop_lamp_purchase_rows_after,
  (select count(*) from pg_proc where proname = 'purchase_town_item')  as purchase_fn_rows_after,
  (select count(*) from pg_proc where proname = 'get_town_shop_state') as state_fn_rows_after;

commit;

-- PostgREST 스키마/권한 캐시 즉시 갱신(함수 제거를 클라이언트가 즉시
-- 42883/스키마 캐시 미스로 인식하도록).
notify pgrst, 'reload schema';

-- STAGE 1 이후 재실행 안전성: town_items/star_purchases 테이블 구조와
-- RLS 정책/REVOKE는 그대로 남아 있으므로, v3_47을 다시 실행하면 시드 행과
-- 함수가 정상적으로 재설치된다(정상 재설치 경로).

-- ============================================================================
-- STAGE 2 — 되돌린 뒤 학생 데이터 무변경 확인 (읽기 전용)
-- ============================================================================
select
  (select count(*) from reward_ledger)      as reward_ledger_rows_untouched,
  (select count(*) from students)           as students_rows_untouched,
  (select count(*) from student_progress)   as student_progress_rows_untouched;
-- STAGE 0 이전 값과 reward_ledger/students/student_progress 세 값이 정확히
-- 같아야 한다(이 롤백은 Town Shop 전용 데이터만 지운다) — 다르면 이 파일이
-- 아닌 다른 원인이므로 즉시 중단하고 조사할 것.
