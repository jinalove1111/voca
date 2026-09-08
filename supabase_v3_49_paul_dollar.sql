-- ============================================================================
-- supabase_v3_49_paul_dollar.sql — Paul Dollar(💵) V1: 마을 상점 전용 2차
-- 화폐 도입. 2026-09-08.
--
-- 실행은 운영자가 Supabase 대시보드 SQL Editor에서 supabase_v3_47_
-- town_shop.sql / supabase_v3_48_reward_legacy_baseline_v2.sql 실행 확인
-- 후 1회 실행(수동 실행, CLAUDE.md 규칙 8). BEGIN/COMMIT 트랜잭션으로
-- 감싸 부분 적용을 막는다. 멱등 — 여러 번 실행해도 안전(create table if
-- not exists / create or replace function|view / add column if not
-- exists / on conflict do nothing / drop function|trigger|view if
-- exists 후 재생성 / DO 블록 가드 제약).
--
-- ⚠️ v3_47/v3_48은 이 파일이 롤백되지 않는다 — 이 마이그레이션은 그 두
-- 파일이 만든 town_items/star_purchases/purchase_town_item(구 시그니처)/
-- get_town_shop_state(구 시그니처)/reward_ledger/reward_totals를 그대로
-- 전제하고 그 위에 얹는다. v3_47/v3_48 자체 롤백은
-- supabase_v3_47_town_shop_ROLLBACK.sql / supabase_v3_48_...
-- _ROLLBACK.sql 각각의 책임 범위이며, 이 파일과 이 파일의 ROLLBACK은
-- 그 파일들을 건드리지 않는다.
--
-- ── 두 화폐, 두 개의 진실 원천(승인된 설계, 변경 금지) ─────────────────────
-- ⭐ 별(stars) = 서버 권위 누적 업적. 단일 진실 원천은 여전히
--   reward_totals(v3_36, reward_ledger.stars_delta의 합) — student_progress.
--   total_stars(클라이언트 표시 캐시, 조작 가능)는 이 파일도 절대 읽지
--   않는다. **별은 절대 감소하지 않는다** — 구매가 더 이상 별을 차감하지
--   않으므로(v3_47의 stars 기반 차감 로직은 이 파일이 완전히 대체한다),
--   별은 오직 reward_ledger에 새 행이 쌓일 때만(양수만, 기존 CHECK
--   stars_delta >= 0) 늘어난다.
-- 💵 폴달러(Paul Dollar) = 상점 전용 화폐. 단일 진실 원천은 신규
--   dollar_ledger(이 파일)의 dollars_delta 합(= dollar_balances 뷰) —
--   저장된 합계 컬럼을 두지 않는다(reward_totals/xp_totals와 동일하게
--   "파생값을 우선"하는 이 저장소의 기존 판단을 그대로 따른다, 사본-원본
--   불일치 버그 자체가 존재할 수 없게).
-- 컷오버 시점에 레거시 별을 폴달러로 환산해 지급하지 않는다 — 모든 학생은
-- 폴달러 $0에서 시작한다(운영자 지시, 승인된 설계). reward_ledger에 이미
-- 쌓인 legacy-baseline 행(source_type='migration', source_id in
-- ('v1','v2'), v3_37/v3_48)은 dollar_rules에 'legacy-baseline'을 의도적으로
-- 시드하지 않으므로 트리거가 자동으로 $0을 지급한다(아래 3번 항목).
--
-- ── 코드 전/후 어느 순서든 안전(CLAUDE.md 규칙 9) ────────────────────────
-- 순수 추가 테이블 3개(dollar_rules/dollar_ledger/town_purchases) + 파생 뷰
-- 1개(dollar_balances) + 트리거 1개 + town_items에 컬럼 1개 추가(기존
-- 컬럼 0개 변경/제거, star_purchases는 이 파일에서 전혀 건드리지 않음) +
-- RPC 함수 2개 교체(반환 shape 변경, 시그니처는 동일)뿐이다. 이 SQL이
-- 아직 실행되지 않은 상태에서 클라이언트/서버가 purchase_town_item/
-- get_town_shop_state를 호출하면 v3_47이 만든 구 시그니처(stars 기반)가
-- 그대로 응답한다 — 크래시 없음, 다만 별 기반 구매가 여전히 동작한다는
-- 뜻이므로 **townShopV1 플래그를 ON으로 켜기 전에 이 SQL을 먼저 실행해야
-- 한다**(운영 순서, 강제 아님 — 강제라면 배포 스크립트가 순서를 검증해야
-- 하지만 지금은 문서화만). 반대로 이 SQL이 클라이언트 코드보다 먼저
-- 실행돼도 안전 — 새 반환 컬럼(dollars_earned 등)을 아직 읽지 않는 구
-- 클라이언트는 그냥 그 필드를 무시할 뿐이다.
--
-- ── 왜 star_purchases에 새 컬럼을 얹지 않고 town_purchases를 별도로
-- 만드는가(설계 결정, 계획서 초안과의 유일한 편차) ───────────────────────
-- 원안은 star_purchases에 currency/price_paid 컬럼을 얹어 폴달러 구매도
-- 같은 테이블에 기록하는 것이었다. 그런데 star_purchases.stars_spent는
-- v3_47에서 `not null check (stars_spent > 0)`으로 이미 고정돼 있어서,
-- 폴달러 구매(실제로는 별을 전혀 안 씀)를 이 테이블에 넣으려면 그 컬럼에
-- 뭔가 양수 값을 억지로 채워야 한다 — 0을 넣으면 CHECK 위반, v_price를
-- 넣으면 "60 stars spent"라고 적힌 감사 기록이 남아 실제로는 별이 전혀
-- 차감되지 않았다는 사실과 모순된다(오해를 부르는 감사 흔적). 게다가 이
-- CHECK 제약 자체를 완화하려면 그 제약을 먼저 없애는 구문이 필요한데, 이
-- 저장소의 destructive-SQL 게이트(scripts/hooks/checkDestructiveSql.mjs,
-- CLAUDE.md 규칙 18)는 테이블 제약/컬럼을 없애는 구문 전반(제약 제거,
-- NOT NULL 제거 포함)을 SQL 파일 저장 자체 단계에서 차단한다 — 이 저장소는
-- 실제로 컬럼/제약을 지우는 구문을 한 번도 쓴 적이 없다(DEVELOPER_GUIDE.md
-- Migration Rules).
--
-- 그래서 이 파일은 star_purchases를 v3_47이 남긴 모습 그대로 "레거시
-- 별 구매 이력"으로 완전히 보존하고(불변 감사 기록, Paul QA 행 포함 —
-- 이 파일 어디에도 star_purchases를 향한 쓰기 구문이 없다), 폴달러
-- 구매는 별도 테이블 town_purchases(아래 5번 항목)에 currency는 항상
-- 'dollars'로 고정한 채(체크 제약으로 강제) 기록한다. "이미 가진
-- 아이템인가"는 두 테이블의 합집합(UNION)으로만 판정하므로(아래
-- get_town_shop_state 설명), 레거시 별 구매도 여전히 보유로 인정되면서도
-- 두 화폐의 감사 기록이 서로 오염되지 않는다 — 어떤 행도 "실제로 일어나지
-- 않은 화폐 이동"을 암시하는 값을 담지 않는다.
--
-- ── dollar_rules — "어떤 보상이 폴달러로도 전환되는가"의 화이트리스트 ────
-- reward_ledger에 이미 존재하는 12개 실제 학습 보상 reward_type만 시드하고
-- (src/utils/rewardEngine.js REWARD_STARS/REWARD_SOURCE_RULES와 1:1 대응),
-- 'legacy-baseline'은 절대 시드하지 않는다 — 레거시 이관 행(v1/v2)이
-- 폴달러로 다시 환산되면 "레거시 별은 환산하지 않는다"는 승인된 설계가
-- 깨진다. dollars_per_star=1(전부) — 향후 특정 보상만 배율을 다르게
-- 주고 싶으면 이 테이블 값만 바꾸면 된다(코드 배포 불필요, 운영자가
-- update 문 하나로 조정 가능하도록 설계).
--
-- ── 트리거가 reward_ledger INSERT를 절대 막지 않는 이유 ─────────────────
-- fn_reward_ledger_to_dollars()는 AFTER INSERT 트리거라 별 지급(원 INSERT)
-- 자체를 막을 수 없고, 본문 전체를 EXCEPTION WHEN OTHERS로 감싸 폴달러
-- 삽입이 어떤 이유로든 실패해도(예: dollar_ledger에 아직 없는 제약 위반,
-- 향후 스키마 변경으로 인한 타입 불일치 등) `raise warning`만 남기고
-- 조용히 넘어간다 — 별 지급 경로가 폴달러 계산 실패로 절대 막히면
-- 안 된다(CLAUDE.md 규칙 1, 안정성 최우선).
--
-- ── RLS/GRANT — reward_ledger(v3_36)/star_purchases(v3_47)와 동일한
-- 최소 권한(정책 0 + GRANT 0, service_role만 접근) ───────────────────────
-- dollar_rules/dollar_ledger/town_purchases 셋 다 anon/authenticated에
-- 어떤 권한도 열지 않는다. 학생 화면은 이 세 테이블을 직접 SELECT하지
-- 않고 항상 get_town_shop_state() RPC를 통해서만 파생값을 받는다(v3_47과
-- 동일 원칙).
-- ============================================================================

begin;

-- 1) dollar_rules — 어떤 reward_type이 폴달러로도 전환되는지의 화이트
--    리스트(운영자가 이 테이블만 갱신하면 코드 배포 없이 배율/on-off 조정
--    가능).
create table if not exists dollar_rules (
  reward_type text primary key,
  dollars_per_star smallint not null default 1 check (dollars_per_star >= 0),
  active boolean not null default true,
  created_at timestamptz default now()
);

alter table dollar_rules enable row level security;
-- 정책 0개 + GRANT 0개 — anon/authenticated에 select/insert/update/delete
-- GRANT를 절대 추가하지 말 것. 학생 화면은 이 테이블을 직접 읽지 않는다.
revoke all on table dollar_rules from anon, authenticated;

-- 시드 — src/utils/rewardEngine.js REWARD_STARS/REWARD_SOURCE_RULES에 실제
-- 존재하는 12개 학습 보상 reward_type만. 'legacy-baseline'은 의도적으로
-- 여기 없다(위 헤더 "레거시 별은 환산하지 않는다" 설명 참고) — on conflict
-- do nothing이라 재실행해도 운영자가 이후 대시보드에서 조정한 배율/on-off를
-- 덮어쓰지 않는다.
insert into dollar_rules (reward_type, dollars_per_star, active) values
  ('word-session-complete', 1, true),
  ('writing-complete',      1, true),
  ('exam-complete',         1, true),
  ('wrong-word-recovered',  1, true),
  ('daily-goal-complete',   1, true),
  ('streak-bonus',          1, true),
  ('pronunciation',         1, true),
  ('mission-clear',         1, true),
  ('daily-mission-bonus',   1, true),
  ('spelling-combo',        1, true),
  ('sticker-duplicate',     1, true),
  ('matchgame',             1, true)
on conflict (reward_type) do nothing;

-- 2) dollar_ledger — 폴달러 지급/차감 사실의 단일 진실 원천(append-only).
--    트리거/구매 함수 둘 다 idempotency_key 안에 이미 student_id를 포함
--    시켜(트리거는 reward_ledger.idempotency_key에 ':dollar' 접미사만
--    붙이는데, 그 원본 키 자체가 이미 `${student_id}:${reward_type}:
--    ${source_type}:${source_id}` 형식 — rewardEngine.js
--    rewardIdempotencyKey()가 단일 진실 원천) 전역 unique 제약과 학생별
--    격리를 동시에 만족시킨다.
create table if not exists dollar_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade, -- reward_ledger(v3_36)/star_purchases(v3_47)와 동일한 on delete cascade 판단을 그대로 따른다 — 학생 삭제 시 파생 화폐 기록도 함께 정리.
  event_type text not null,
  dollars_delta integer not null check (dollars_delta <> 0),
  source_type text not null,
  source_id text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_dollar_ledger_student on dollar_ledger (student_id);

alter table dollar_ledger enable row level security;
-- 정책 0개 + GRANT 0개 — reward_ledger/star_purchases와 동일 최소 권한.
revoke all on table dollar_ledger from anon, authenticated;

-- 3) dollar_balances — 파생 VIEW(저장 아님, 매 조회 재계산). reward_totals/
--    xp_totals와 동일 판단(사본 컬럼을 두지 않는다).
create or replace view dollar_balances as
  select
    student_id,
    coalesce(sum(dollars_delta), 0)::integer as balance,
    coalesce(sum(case when dollars_delta > 0 then dollars_delta else 0 end), 0)::integer as earned,
    coalesce(-sum(case when dollars_delta < 0 then dollars_delta else 0 end), 0)::integer as spent
  from dollar_ledger
  group by student_id;

-- reward_totals(v3_36)와 동일한 이유로 security_invoker=on 적용(PG15+
-- 전용, 버전 가드) — 훗날 누군가 실수로 이 뷰에 SELECT를 부여해도
-- 밑단 dollar_ledger의 RLS(정책 0)를 우회해 전체 학생 집계가 노출되지
-- 않도록 원천 차단.
do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view dollar_balances set (security_invoker = on)';
    raise notice 'dollar_balances: security_invoker=on 적용(PG15+)';
  else
    raise notice 'dollar_balances: PG15 미만이라 security_invoker 미지원 — GRANT 0건이므로 노출 위험 없음(뷰에 접근 가능한 롤이 service_role뿐)';
  end if;
end $$;

revoke all on table dollar_balances from anon, authenticated;

-- 4) fn_reward_ledger_to_dollars — reward_ledger에 별이 지급될 때마다
--    (양수 stars_delta) dollar_rules 화이트리스트에 있으면 같은 비율로
--    폴달러도 함께 지급하는 AFTER INSERT 트리거 함수. 실패해도 별 지급을
--    절대 막지 않는다(위 헤더 설명).
create or replace function public.fn_reward_ledger_to_dollars()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate smallint;
begin
  if new.stars_delta > 0 then
    select dr.dollars_per_star into v_rate
      from dollar_rules dr
     where dr.reward_type = new.reward_type
       and dr.active;

    if found and v_rate > 0 then
      insert into dollar_ledger (student_id, event_type, dollars_delta, source_type, source_id, idempotency_key)
      values (
        new.student_id,
        'reward:' || new.reward_type,
        new.stars_delta * v_rate,
        new.source_type,
        new.source_id,
        new.idempotency_key || ':dollar'
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return new;
exception when others then
  -- 폴달러 지급이 어떤 이유로든 실패해도 별 지급(원 INSERT)은 절대 막지
  -- 않는다(CLAUDE.md 규칙 1) — 원인은 warning으로만 남긴다.
  raise warning 'fn_reward_ledger_to_dollars failed: %', sqlerrm;
  return new;
end;
$$;

-- 트리거 함수는 직접 호출(SELECT fn_reward_ledger_to_dollars())이 아니라
-- 항상 트리거 메커니즘을 통해서만 실행돼야 한다(PostgreSQL이 트리거 함수를
-- 트리거 컨텍스트 밖에서 직접 호출하면 자체적으로 오류를 낸다). 방어적으로
-- PUBLIC/anon/authenticated의 직접 EXECUTE 권한도 명시적으로 회수한다 —
-- 트리거 발동 자체는 이 REVOKE와 무관하게 계속 동작한다(테이블 소유자
-- 권한으로 발동, GRANT/REVOKE는 오직 "누군가 SELECT로 직접 호출"만 막음).
revoke all on function public.fn_reward_ledger_to_dollars() from public;
revoke all on function public.fn_reward_ledger_to_dollars() from anon, authenticated;

drop trigger if exists trg_reward_ledger_to_dollars on reward_ledger;
create trigger trg_reward_ledger_to_dollars
  after insert on reward_ledger
  for each row execute function public.fn_reward_ledger_to_dollars();

-- 5) town_items — 새 컬럼만 추가(기존 컬럼 0개 변경/제거, CLAUDE.md 규칙
--    9). star_purchases는 이 파일이 전혀 건드리지 않는다(위 헤더 "왜
--    town_purchases를 별도로 만드는가" 설명 참고).
--    town_items.price(60, shop-lamp)는 이 파일에서 절대 바꾸지 않는다 —
--    승인된 설계("램프 가격 $60, 컬럼은 price 그대로, 화폐만 dollars로
--    전환") 그대로.
alter table town_items
  add column if not exists price_currency text not null default 'dollars';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.town_items'::regclass
      and conname = 'town_items_price_currency_check'
  ) then
    alter table public.town_items
      add constraint town_items_price_currency_check
      check (price_currency in ('stars', 'dollars'));
  end if;
end $$;

-- 5-b) town_purchases — 폴달러 구매 이력 전용 신규 테이블(star_purchases
--      와 완전히 분리, 위 헤더 설명 참고). star_purchases(v3_47)와 동일한
--      최소 권한/구조 패턴을 그대로 따르되, currency는 'dollars' 외의
--      값을 절대 허용하지 않는다(CHECK로 강제 — 이 테이블에는 애초에
--      레거시 stars 행이 존재할 수 없다).
create table if not exists town_purchases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade, -- star_purchases(v3_47)/dollar_ledger(이 파일)와 동일한 on delete cascade 판단.
  item_id text not null references town_items(id),
  currency text not null default 'dollars' check (currency = 'dollars'),
  price_paid integer not null check (price_paid > 0),
  created_at timestamptz not null default now(),
  unique (student_id, item_id) -- star_purchases와 동일 — 학생당 아이템당 최대 1건, 이 unique 제약 자체가 idempotency 메커니즘.
);
create index if not exists idx_town_purchases_student on town_purchases (student_id);

alter table town_purchases enable row level security;
-- 정책 0개 + GRANT 0개 — star_purchases/dollar_ledger와 동일 최소 권한.
-- anon/authenticated에 select/insert/update/delete GRANT를 절대 추가하지
-- 말 것. 학생 화면은 이 테이블을 직접 읽지 않고 항상 get_town_shop_state()
-- RPC를 통해서만 파생값(보유 아이템 목록)을 받는다.
revoke all on table town_purchases from anon, authenticated;

-- 6) RPC 교체 — 반환 shape이 바뀌므로(purchase_town_item: stars_spent ->
--    dollars_spent 등) 기존 함수를 지우고 재생성한다(시그니처(uuid, text)/
--    (uuid)는 v3_47과 동일하게 유지 — 호출부 파라미터 계약은 안 바뀐다).
--    함수 제거 구문은 checkDestructiveSql.mjs 차단 대상이 아니다(TABLE/
--    COLUMN/DATABASE/SCHEMA 삭제만 차단, v3_47/v3_48 ROLLBACK과 동일 판단).
drop function if exists public.get_town_shop_state(uuid);
drop function if exists public.purchase_town_item(uuid, text);

-- get_town_shop_state — 조회 전용 파생값(별 총액 + 폴달러 잔액/보유
-- 아이템). ⚠️ 별은 절대 차감되지 않음 — stars_earned는 오직 reward_totals
-- (원장 합계)에서만 오고, 어떤 구매도 이 값을 줄이지 않는다.
create or replace function public.get_town_shop_state(p_student_id uuid)
returns table (
  stars_earned integer,
  dollars_available integer,
  dollars_earned integer,
  dollars_spent integer,
  owned_item_ids text[]
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
-- OUT 컬럼명(stars_earned 등)이 테이블 컬럼명과 겹칠 때 plpgsql이 모호한
-- 컬럼 참조로 런타임 오류를 내는 것을 막는 belt-and-braces 설정
-- (v3_47과 동일 이유) — 아래에서도 모든 컬럼 참조에 테이블 별칭을 명시해
-- 이 설정에 의존하지 않고도 안전하게 동작하도록 이중으로 막는다.
declare
  v_stars_earned integer;
  v_dollars_available integer;
  v_dollars_earned integer;
  v_dollars_spent integer;
  v_owned text[];
begin
  -- ⚠️ 별은 절대 reward_totals 외의 값(예: student_progress.total_stars)으로
  -- 판정하지 않는다(CLAUDE.md 규칙 1/4와 같은 정신).
  v_stars_earned := coalesce((select rt.earned_stars from reward_totals rt where rt.student_id = p_student_id), 0);

  v_dollars_available := coalesce((select db.balance from dollar_balances db where db.student_id = p_student_id), 0);
  v_dollars_earned := coalesce((select db.earned from dollar_balances db where db.student_id = p_student_id), 0);
  v_dollars_spent := coalesce((select db.spent from dollar_balances db where db.student_id = p_student_id), 0);

  -- 보유 아이템은 star_purchases(레거시 별 구매 이력)와 town_purchases
  -- (신규 폴달러 구매 이력) 두 테이블의 합집합(UNION, 중복 제거)이다 —
  -- 어느 화폐로 샀든 "이미 가진 아이템"이라는 사실 자체는 동일하다(위
  -- 헤더 "왜 town_purchases를 별도로 만드는가" 설명 참고).
  select coalesce(array_agg(distinct combined.item_id), '{}'::text[]) into v_owned
    from (
      select sp.item_id from star_purchases sp where sp.student_id = p_student_id
      union
      select tp.item_id from town_purchases tp where tp.student_id = p_student_id
    ) combined;

  return query select v_stars_earned, v_dollars_available, v_dollars_earned, v_dollars_spent, v_owned;
end;
$$;

revoke all on function public.get_town_shop_state(uuid) from public;
revoke all on function public.get_town_shop_state(uuid) from anon, authenticated;
grant execute on function public.get_town_shop_state(uuid) to service_role;

-- purchase_town_item — 구매 단일 진입점(폴달러 전용). service_role
-- 전용(SECURITY DEFINER 함수는 기본적으로 PUBLIC에 EXECUTE 권한이 부여
-- 되므로 아래 REVOKE로 반드시 회수). ⚠️ 별은 절대 차감되지 않음 — 이
-- 함수는 reward_ledger/reward_totals를 전혀 쓰지 않는다(별 지급 경로와
-- 구매 경로는 완전히 분리).
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
  --    unique_violation 예외 처리는 v3_47과 동일 이유(advisory lock이
  --    순차 처리를 보장하지만, 혹시 모를 레이스에 대비해 이중 차감 대신
  --    already_owned로 안전하게 수렴) — town_purchases.unique(student_id,
  --    item_id)가 이 예외의 실질적 발생 지점이다.
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

-- PostgREST 스키마/권한 캐시 즉시 갱신(새 테이블/뷰/트리거/함수 인식).
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- 실행 후 확인 (부작용 없는 조회만 — 같은 SQL Editor에서 바로 실행 가능)
--
--   select count(*) from dollar_rules;
--   -- 12여야 함(legacy-baseline 미포함).
--   select count(*) from dollar_rules where reward_type = 'legacy-baseline';
--   -- 0이어야 함.
--   select count(*) from dollar_ledger;
--   -- 실행 직후에는 0건이 정상(트리거는 "이후" reward_ledger INSERT부터
--   -- 반응한다 — 과거 행에는 소급 적용되지 않음, 별도 백필 없음).
--   select tgname, tgrelid::regclass from pg_trigger
--     where tgname = 'trg_reward_ledger_to_dollars';
--   -- 1행, tgrelid가 reward_ledger여야 함.
--   select proname, prosecdef, pronargs from pg_proc
--     where proname in ('fn_reward_ledger_to_dollars','purchase_town_item','get_town_shop_state');
--   -- 3행 모두 prosecdef = true(SECURITY DEFINER).
--   select count(*) from star_purchases where item_id = 'shop-lamp';
--   -- 1이어야 함(Paul QA 레거시 행, currency='stars', stars_spent=60 —
--   -- 이 파일이 전혀 건드리지 않았으므로 v3_47 실행 이후와 완전히 동일).
--   select count(*) from town_purchases;
--   -- 실행 직후에는 0건이 정상(테이블만 새로 생김, 아직 아무도 폴달러로
--   -- 구매하지 않음).
--
-- anon key로 dollar_rules/dollar_ledger/dollar_balances/town_purchases를
-- SELECT하면 42501(permission denied)이어야 정상(reward_ledger/
-- star_purchases와 동일 최소 권한). town_items를 SELECT하면 shop-lamp가
-- 여전히 price=60, price_currency='dollars'로 보여야 한다(카탈로그는
-- 공개, 가격 자체는 무변경). star_purchases를 SELECT하면 여전히 42501
-- 이어야 하고, service_role로 직접 조회하면 이 파일 실행 전후로 행 수/값이
-- 한 글자도 바뀌지 않아야 한다(이 파일은 그 테이블에 어떤 쓰기 구문도
-- 담고 있지 않다).
-- ============================================================================
