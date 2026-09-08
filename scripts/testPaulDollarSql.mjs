// scripts/testPaulDollarSql.mjs — supabase_v3_49_paul_dollar.sql +
// supabase_v3_49_paul_dollar_ROLLBACK.sql 정적 단언 + 순수 JS 인메모리
// 시뮬레이션. scripts/testTownShopSql.mjs / scripts/testBaselineV2Sql.mjs와
// 동일한 구조(check() 스타일, 실패 카운트, exit 1)를 그대로 따른다.
// 네트워크 0. 실행: `node scripts/testPaulDollarSql.mjs` (repo root에서).
//
// 이 파일은 TEST-ONLY다 — SQL/src/api/registry.mjs/package.json 어느 것도
// 수정하지 않는다. 정적 단언이 SQL의 실제 계약 위반을 발견하면 SQL을
// 고치지 않고 FAIL로만 보고한다.
//
// 각 정규식 검사 전에 `--` 라인 주석을 제거한다(strip) — 주석 안에 나오는
// 예시 문구가 코드 자체인 것처럼 오탐(false PASS/FAIL)을 유발하지 않도록
// 하기 위함(testTownShopSql.mjs와 동일 관례).
//
// 파괴적 문장 리터럴("DR"+"OP TABLE" 등)은 문자열을 부분 결합으로 구성한다
// — 이 테스트 파일 자체가 저장소/상위 거버넌스의 destructive-command
// 게이트에 오탐으로 걸리지 않도록 하기 위함(CLAUDE.md 규칙 18,
// scripts/testTownShopSql.mjs와 동일 관례).

import fs from 'node:fs'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const V49_PATH = 'supabase_v3_49_paul_dollar.sql'
const V49_ROLLBACK_PATH = 'supabase_v3_49_paul_dollar_ROLLBACK.sql'

const dropWord = ['DR', 'OP'].join('')
const truncWord = ['TRUNC', 'ATE'].join('')

// ============================================================================
// 공통 유틸
// ============================================================================
function stripLineComments(text) {
  return text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--')
      return idx === -1 ? line : line.slice(0, idx)
    })
    .join('\n')
}

function extractFunctionBlock(sql, fnName) {
  const startIdx = sql.indexOf(`create or replace function public.${fnName}(`)
  if (startIdx === -1) return null
  const closeIdx = sql.indexOf('\n$$;', startIdx)
  if (closeIdx === -1) return null
  return sql.slice(startIdx, closeIdx + 4)
}

const rawV49 = fs.readFileSync(V49_PATH, 'utf8')
const rawRollback = fs.readFileSync(V49_ROLLBACK_PATH, 'utf8')
const sql = stripLineComments(rawV49)
const rb = stripLineComments(rawRollback)

const EXPECTED_REWARD_TYPES = [
  'word-session-complete', 'writing-complete', 'exam-complete', 'wrong-word-recovered',
  'daily-goal-complete', 'streak-bonus', 'pronunciation', 'mission-clear',
  'daily-mission-bonus', 'spelling-combo', 'sticker-duplicate', 'matchgame',
]

// ============================================================================
// A. 스키마 — dollar_rules / dollar_ledger
// ============================================================================
console.log('\nA. 스키마 정적 단언 — dollar_rules / dollar_ledger')
{
  check('create table if not exists dollar_rules 존재',
    /create table if not exists\s+dollar_rules\s*\(/i.test(sql))
  check('dollar_rules.reward_type text primary key 존재',
    /reward_type\s+text\s+primary key/i.test(sql))
  check('dollar_rules.dollars_per_star smallint not null default 1 check (>= 0) 존재',
    /dollars_per_star\s+smallint\s+not\s+null\s+default\s+1\s+check\s*\(\s*dollars_per_star\s*>=\s*0\s*\)/i.test(sql))
  check('dollar_rules.active boolean not null default true 존재',
    /active\s+boolean\s+not\s+null\s+default\s+true/i.test(sql))

  check('create table if not exists dollar_ledger 존재',
    /create table if not exists\s+dollar_ledger\s*\(/i.test(sql))
  check('dollar_ledger.student_id references students(id) on delete cascade 존재',
    /student_id\s+uuid\s+not\s+null\s+references\s+students\(id\)\s+on delete cascade/i.test(sql))
  check('dollar_ledger.dollars_delta integer not null check (<> 0) 존재',
    /dollars_delta\s+integer\s+not\s+null\s+check\s*\(\s*dollars_delta\s*<>\s*0\s*\)/i.test(sql))
  check('dollar_ledger.idempotency_key text not null unique 존재',
    /idempotency_key\s+text\s+not\s+null\s+unique/i.test(sql))
  check('dollar_ledger (student_id) 인덱스 존재',
    /create index if not exists\s+\w+\s+on\s+dollar_ledger\s*\(\s*student_id\s*\)/i.test(sql))
}

// ============================================================================
// B. 시드 — 정확히 12개 reward_type, legacy-baseline 제외
// ============================================================================
console.log('\nB. 시드 정적 단언 — dollar_rules 12개, legacy-baseline 제외')
{
  const insertMatch = sql.match(/insert into dollar_rules[\s\S]*?on conflict\s*\(\s*reward_type\s*\)\s*do nothing/i)
  check('insert into dollar_rules ... on conflict (reward_type) do nothing 블록 존재', insertMatch !== null)
  const insertBlock = insertMatch ? insertMatch[0] : ''

  for (const rt of EXPECTED_REWARD_TYPES) {
    check(`시드에 '${rt}' 포함`, new RegExp(`'${rt}'`, 'i').test(insertBlock))
  }
  check('시드에 legacy-baseline이 포함되지 않음', !/'legacy-baseline'/i.test(insertBlock))

  const seededTypes = [...insertBlock.matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*1\s*,\s*true\s*\)/gi)].map((m) => m[1])
  check(`시드된 reward_type 개수 == 12 (실제: ${seededTypes.length})`, seededTypes.length === 12)
  check('시드된 reward_type 집합이 EXPECTED_REWARD_TYPES와 정확히 일치',
    seededTypes.length === EXPECTED_REWARD_TYPES.length &&
    EXPECTED_REWARD_TYPES.every((rt) => seededTypes.includes(rt)))
}

// ============================================================================
// C. RLS/GRANT — dollar_rules/dollar_ledger/dollar_balances 최소 권한
// ============================================================================
console.log('\nC. RLS/GRANT 정적 단언')
{
  check('dollar_rules RLS 활성화', /alter table\s+dollar_rules\s+enable row level security/i.test(sql))
  check('dollar_rules에 대한 create policy 0건', !/create policy\s+"[^"]*"\s+on\s+dollar_rules/i.test(sql))
  check('revoke all on table dollar_rules from anon, authenticated 존재',
    /revoke all on table\s+dollar_rules\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('dollar_rules에 대한 grant 구문 없음', !/grant[^;]*on table\s+dollar_rules/i.test(sql))

  check('dollar_ledger RLS 활성화', /alter table\s+dollar_ledger\s+enable row level security/i.test(sql))
  check('dollar_ledger에 대한 create policy 0건', !/create policy\s+"[^"]*"\s+on\s+dollar_ledger/i.test(sql))
  check('revoke all on table dollar_ledger from anon, authenticated 존재',
    /revoke all on table\s+dollar_ledger\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('dollar_ledger에 대한 grant 구문 없음', !/grant[^;]*on table\s+dollar_ledger/i.test(sql))

  check('revoke all on table dollar_balances from anon, authenticated 존재',
    /revoke all on table\s+dollar_balances\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('dollar_balances에 대한 grant 구문 없음', !/grant[^;]*on table\s+dollar_balances/i.test(sql))
}

// ============================================================================
// D. 뷰 — dollar_balances
// ============================================================================
console.log('\nD. dollar_balances 뷰 정적 단언')
{
  check('create or replace view dollar_balances 존재',
    /create or replace view dollar_balances as/i.test(sql))
  check('balance = sum(dollars_delta) 형태', /sum\(dollars_delta\)/i.test(sql))
  check('security_invoker=on PG15+ 가드(DO 블록) 존재',
    /alter view dollar_balances set \(security_invoker = on\)/i.test(sql))
  check('server_version_num >= 150000 버전 가드 존재', /server_version_num.*>=\s*150000/i.test(sql))
}

// ============================================================================
// E. 트리거 — fn_reward_ledger_to_dollars / trg_reward_ledger_to_dollars
// ============================================================================
console.log('\nE. 트리거 정적 단언')
const triggerFnBody = extractFunctionBlock(sql, 'fn_reward_ledger_to_dollars')
{
  check('트리거 함수 본문을 추출할 수 있음(이후 단언의 전제)', triggerFnBody !== null)
  const body = triggerFnBody || ''
  check('returns trigger 존재', /returns trigger/i.test(sql.slice(sql.indexOf('create or replace function public.fn_reward_ledger_to_dollars'), sql.indexOf('create or replace function public.fn_reward_ledger_to_dollars') + 400)))
  check('security definer 존재', /security definer/i.test(body))
  check('set search_path = public 존재', /set search_path\s*=\s*public/i.test(body))
  check('if new.stars_delta > 0 가드 존재', /if\s+new\.stars_delta\s*>\s*0\s+then/i.test(body))
  check('dollar_rules에서 reward_type/active로 조회', /from\s+dollar_rules\s+dr[\s\S]{0,120}dr\.reward_type\s*=\s*new\.reward_type[\s\S]{0,60}dr\.active/i.test(body))
  check('found and v_rate > 0 가드 존재', /if\s+found\s+and\s+v_rate\s*>\s*0\s+then/i.test(body))
  check("idempotency_key에 ':dollar' 접미사 부여", /new\.idempotency_key\s*\|\|\s*':dollar'/i.test(body))
  check('on conflict (idempotency_key) do nothing 존재', /on conflict\s*\(\s*idempotency_key\s*\)\s*do nothing/i.test(body))
  check('exception when others then ... raise warning 존재',
    /exception\s+when\s+others\s+then[\s\S]{0,200}raise warning/i.test(body))
  check('exception 핸들러도 return new로 끝남(별 지급을 절대 막지 않음)',
    /exception\s+when\s+others\s+then[\s\S]{0,300}return new/i.test(body))

  check('drop trigger if exists trg_reward_ledger_to_dollars on reward_ledger 존재',
    /drop trigger if exists\s+trg_reward_ledger_to_dollars\s+on\s+reward_ledger/i.test(sql))
  check('create trigger trg_reward_ledger_to_dollars after insert on reward_ledger 존재',
    /create trigger\s+trg_reward_ledger_to_dollars\s+after insert on\s+reward_ledger/i.test(sql))
  check('트리거가 fn_reward_ledger_to_dollars를 실행', /execute function public\.fn_reward_ledger_to_dollars\(\)/i.test(sql))
}

// ============================================================================
// F. town_items 컬럼 추가 + town_purchases 신규 테이블(star_purchases는
//    이 파일에서 완전히 무변경이어야 함)
// ============================================================================
console.log('\nF. 컬럼/테이블 정적 단언 — town_items.price_currency, town_purchases, star_purchases 무변경')
{
  check("town_items.price_currency text not null default 'dollars' 추가",
    /add column if not exists\s+price_currency\s+text\s+not\s+null\s+default\s+'dollars'/i.test(sql))
  check('town_items_price_currency_check 제약 DO 블록(if not exists) 존재',
    /add constraint\s+town_items_price_currency_check\s+check\s*\(\s*price_currency in \('stars',\s*'dollars'\)\s*\)/i.test(sql))
  check('town_items.price(60) 값을 바꾸는 UPDATE 문이 없음(가격 무변경)',
    !/update\s+town_items\s+set\s+price\s*=/i.test(sql))
  // 제약 추가 DO 블록은 pg_constraint 존재 확인 후에만 add constraint를
  // 실행한다(멱등) — ALTER TABLE ... ADD CONSTRAINT는 checkDestructiveSql
  // 훅의 차단 대상(ALTER TABLE 내 DROP)이 아니다(추가이지 삭제가 아님).
  check('town_items 제약 추가가 pg_constraint 존재 확인으로 감싸짐(멱등)',
    /conrelid\s*=\s*'public\.town_items'::regclass[\s\S]{0,40}conname\s*=\s*'town_items_price_currency_check'/i.test(sql))

  // ⚠️ star_purchases는 이 파일에서 완전히 무변경이어야 한다(코디네이터
  // 설계 결정 — 레거시 별 구매 이력은 불변 감사 기록으로 보존, 새 컬럼을
  // 얹지 않는다). ALTER/INSERT/UPDATE 등 어떤 쓰기 구문도 없어야 한다.
  check('star_purchases를 향한 alter table 구문이 전혀 없음',
    !/alter table\s+star_purchases/i.test(sql))
  check('star_purchases를 향한 insert into 구문이 전혀 없음',
    !/insert into\s+star_purchases/i.test(sql))
  check('star_purchases를 향한 update 구문이 전혀 없음',
    !/update\s+star_purchases\b/i.test(sql))

  check('create table if not exists town_purchases 존재',
    /create table if not exists\s+town_purchases\s*\(/i.test(sql))
  check('town_purchases.student_id references students(id) on delete cascade 존재',
    /student_id\s+uuid\s+not\s+null\s+references\s+students\(id\)\s+on delete cascade/i.test(sql))
  check('town_purchases.item_id references town_items(id) 존재',
    /item_id\s+text\s+not\s+null\s+references\s+town_items\(id\)/i.test(sql))
  check("town_purchases.currency text not null default 'dollars' check (currency = 'dollars') 존재",
    /currency\s+text\s+not\s+null\s+default\s+'dollars'\s+check\s*\(\s*currency\s*=\s*'dollars'\s*\)/i.test(sql))
  check('town_purchases.price_paid integer not null check (price_paid > 0) 존재',
    /price_paid\s+integer\s+not\s+null\s+check\s*\(\s*price_paid\s*>\s*0\s*\)/i.test(sql))
  check('town_purchases unique (student_id, item_id) 존재',
    /unique\s*\(\s*student_id\s*,\s*item_id\s*\)/i.test(sql))
  check('town_purchases (student_id) 인덱스 존재',
    /create index if not exists\s+\w+\s+on\s+town_purchases\s*\(\s*student_id\s*\)/i.test(sql))
  check('town_purchases RLS 활성화', /alter table\s+town_purchases\s+enable row level security/i.test(sql))
  check('town_purchases에 대한 create policy 0건', !/create policy\s+"[^"]*"\s+on\s+town_purchases/i.test(sql))
  check('revoke all on table town_purchases from anon, authenticated 존재',
    /revoke all on table\s+town_purchases\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('town_purchases에 대한 grant 구문 없음', !/grant[^;]*on table\s+town_purchases/i.test(sql))
}

// ============================================================================
// G. RPC — get_town_shop_state(uuid) / purchase_town_item(uuid, text)
// ============================================================================
console.log('\nG. RPC 정적 단언 — 반환 shape / security / 권위 / 권한')

const gBody = extractFunctionBlock(sql, 'get_town_shop_state')
const pBody = extractFunctionBlock(sql, 'purchase_town_item')

{
  check('기존 get_town_shop_state(uuid) drop function if exists 존재',
    /drop function if exists public\.get_town_shop_state\(uuid\)/i.test(sql))
  check('기존 purchase_town_item(uuid, text) drop function if exists 존재',
    /drop function if exists public\.purchase_town_item\(uuid,\s*text\)/i.test(sql))

  check('get_town_shop_state 반환 shape == (stars_earned, dollars_available, dollars_earned, dollars_spent, owned_item_ids)',
    /returns table\s*\(\s*stars_earned\s+integer,\s*dollars_available\s+integer,\s*dollars_earned\s+integer,\s*dollars_spent\s+integer,\s*owned_item_ids\s+text\[\]\s*\)/i.test(sql))
  check('purchase_town_item 반환 shape == (ok, reason, dollars_spent, balance_after)',
    /returns table\s*\(\s*ok\s+boolean,\s*reason\s+text,\s*dollars_spent\s+integer,\s*balance_after\s+integer\s*\)/i.test(sql))

  check('두 함수 본문 블록을 추출할 수 있음(이후 단언의 전제)', gBody !== null && pBody !== null)

  check('get_town_shop_state security definer 존재', /security definer/i.test(gBody || ''))
  check('purchase_town_item security definer 존재', /security definer/i.test(pBody || ''))
  check('get_town_shop_state set search_path = public 존재', /set search_path\s*=\s*public/i.test(gBody || ''))
  check('purchase_town_item set search_path = public 존재', /set search_path\s*=\s*public/i.test(pBody || ''))
  check('get_town_shop_state #variable_conflict use_column로 시작', /as \$\$\s*\n\s*#variable_conflict use_column/i.test(gBody || ''))
  check('purchase_town_item #variable_conflict use_column로 시작', /as \$\$\s*\n\s*#variable_conflict use_column/i.test(pBody || ''))

  check('get_town_shop_state 본문에 total_stars 문자열 없음', !/total_stars/i.test(gBody || ''))
  check('purchase_town_item 본문에 total_stars 문자열 없음', !/total_stars/i.test(pBody || ''))
  check('get_town_shop_state가 reward_totals를 별칭(rt)으로 참조', /from reward_totals rt/i.test(gBody || ''))
  check('get_town_shop_state가 dollar_balances를 별칭(db)으로 참조', /from dollar_balances db/i.test(gBody || ''))
  check('purchase_town_item이 dollar_balances를 별칭(db)으로 참조(잔액 판정)', /from dollar_balances db/i.test(pBody || ''))

  check('purchase_town_item 본문에 reward_ledger/reward_totals 참조가 전혀 없음(별 지급 경로와 완전 분리)',
    !/reward_ledger|reward_totals/i.test(pBody || ''))

  check('purchase_town_item이 price_currency로 dollars 아이템만 처리(가드 존재)',
    /v_currency is distinct from 'dollars'/i.test(pBody || '') && /'item_not_purchasable'/i.test(pBody || ''))

  // ⚠️ get_town_shop_state의 보유 아이템은 star_purchases ∪ town_purchases
  // (UNION)여야 한다 — 레거시 별 구매도 여전히 보유로 인정.
  check('get_town_shop_state가 star_purchases와 town_purchases를 UNION으로 합쳐 보유 아이템을 계산',
    /select\s+sp\.item_id\s+from\s+star_purchases\s+sp\s+where\s+sp\.student_id\s*=\s*p_student_id[\s\S]{0,80}union[\s\S]{0,80}select\s+tp\.item_id\s+from\s+town_purchases\s+tp\s+where\s+tp\.student_id\s*=\s*p_student_id/i.test(gBody || ''))

  // ⚠️ purchase_town_item의 already_owned 판정도 star_purchases OR
  // town_purchases 양쪽을 봐야 한다(레거시 별 구매 보유자가 재구매하지
  // 못하도록).
  check('purchase_town_item의 already_owned 판정이 star_purchases 또는 town_purchases 존재 여부(OR)',
    /if\s+exists\s*\(select 1 from star_purchases sp where sp\.student_id = p_student_id and sp\.item_id = p_item_id\)[\s\S]{0,80}or\s+exists\s*\(select 1 from town_purchases tp where tp\.student_id = p_student_id and tp\.item_id = p_item_id\)/i.test(pBody || ''))

  // ⚠️ purchase_town_item은 절대 star_purchases에 쓰기를 하지 않는다(레거시
  // 테이블 완전 보존) — insert/update 어느 쪽도 없어야 한다.
  check('purchase_town_item 본문에 star_purchases를 향한 insert/update가 전혀 없음',
    !/(insert into star_purchases|update star_purchases)/i.test(pBody || ''))

  const idxLock = (pBody || '').indexOf('pg_advisory_xact_lock')
  const idxBalance = (pBody || '').indexOf('from dollar_balances db')
  const idxAlreadyOwned = (pBody || '').indexOf('if exists (select 1 from star_purchases')
  const idxInsufficient = (pBody || '').indexOf("'insufficient'")
  const idxInsertTownPurchases = (pBody || '').indexOf('insert into town_purchases')
  const idxInsertDollarLedger = (pBody || '').indexOf('insert into dollar_ledger')

  check('lock/balance/already-owned/insufficient/두 insert 인덱스를 모두 찾음(이후 비교의 전제)',
    [idxLock, idxBalance, idxAlreadyOwned, idxInsufficient, idxInsertTownPurchases, idxInsertDollarLedger].every((i) => i !== -1))
  check('advisory lock이 잔액 조회보다 먼저', idxLock < idxBalance)
  check('advisory lock이 already-owned 체크보다 먼저', idxLock < idxAlreadyOwned)
  check('advisory lock이 insufficient 분기보다 먼저', idxLock < idxInsufficient)
  check('advisory lock이 두 insert보다 먼저', idxLock < idxInsertTownPurchases && idxLock < idxInsertDollarLedger)
  check('insert into town_purchases와 insert into dollar_ledger가 같은 begin/exception 블록 안에 함께 있음(원자적 두 INSERT)',
    idxInsertTownPurchases !== -1 && idxInsertDollarLedger !== -1 && idxInsertDollarLedger > idxInsertTownPurchases &&
    (pBody || '').slice(idxInsertTownPurchases, idxInsertDollarLedger + 50).indexOf('exception when unique_violation') === -1)
  check('두 insert 이후에 exception when unique_violation 핸들러가 옴(두 INSERT를 함께 감쌈)',
    (() => {
      const afterInserts = (pBody || '').indexOf('exception when unique_violation', idxInsertDollarLedger)
      return afterInserts !== -1 && afterInserts > idxInsertDollarLedger
    })())

  check('purchase_town_item이 dollar_ledger에 음수 dollars_delta(-v_price) 삽입', /-v_price/.test(pBody || ''))
  check("purchase_town_item의 dollar_ledger idempotency_key가 student:purchase:item 형식",
    /p_student_id::text\s*\|\|\s*':purchase:'\s*\|\|\s*p_item_id/i.test(pBody || ''))

  const reasonMatches = [...(pBody || '').matchAll(/'([a-z_]+)'::text/gi)].map((m) => m[1])
  const reasonSet = new Set(reasonMatches)
  const expectedReasons = new Set(['student_not_found', 'item_not_found', 'item_not_purchasable', 'already_owned', 'insufficient', 'purchased'])
  check(`반환 reason 집합 == {student_not_found,item_not_found,item_not_purchasable,already_owned,insufficient,purchased} (실제: ${[...reasonSet].sort().join(',')})`,
    reasonSet.size === expectedReasons.size && [...expectedReasons].every((r) => reasonSet.has(r)))

  check('get_town_shop_state revoke all ... from public 존재',
    /revoke all on function public\.get_town_shop_state\(uuid\)\s+from public/i.test(sql))
  check('get_town_shop_state revoke all ... from anon, authenticated 존재',
    /revoke all on function public\.get_town_shop_state\(uuid\)\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('get_town_shop_state grant execute ... to service_role 존재',
    /grant execute on function public\.get_town_shop_state\(uuid\)\s+to\s+service_role/i.test(sql))
  check('purchase_town_item revoke all ... from public 존재',
    /revoke all on function public\.purchase_town_item\(uuid,\s*text\)\s+from public/i.test(sql))
  check('purchase_town_item revoke all ... from anon, authenticated 존재',
    /revoke all on function public\.purchase_town_item\(uuid,\s*text\)\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('purchase_town_item grant execute ... to service_role 존재',
    /grant execute on function public\.purchase_town_item\(uuid,\s*text\)\s+to\s+service_role/i.test(sql))

  // '별은 절대 차감되지 않음' 문구는 주석(-- ...) 안에 있으므로 comment-
  // stripped된 sql이 아니라 원본(rawV49)에서 확인해야 한다.
  check("두 RPC 주석에 '별은 절대 차감되지 않음' 취지 문구 존재",
    /별은 절대 차감되지 않음/.test(rawV49))

  const trimmedEnd = sql.replace(/\s+$/, '')
  check('파일이 (주석 제거 후) commit;으로 끝남(트랜잭션 종료가 파일의 마지막 실행 문장)',
    /\ncommit;\s*$/i.test(trimmedEnd))
  check('notify pgrst reload schema가 commit; 앞(같은 트랜잭션 안)에 존재',
    (() => {
      const idxNotify = sql.indexOf("notify pgrst, 'reload schema';")
      const idxCommit = sql.lastIndexOf('\ncommit;')
      return idxNotify !== -1 && idxCommit !== -1 && idxNotify < idxCommit
    })())
  check('begin;/commit; 트랜잭션으로 감싸짐', /^\s*begin;/i.test(sql.trim()) && /\ncommit;/i.test(sql))
}

// ============================================================================
// H. 파괴적 패턴 부재(v3_49 본문 자체)
// ============================================================================
console.log('\nH. 파괴적 패턴 부재 정적 단언 — v3_49 본문')
{
  const dropTablePattern = new RegExp(`${dropWord}\\s+TABLE`, 'i')
  const truncatePattern = new RegExp(`${truncWord}`, 'i')
  check('테이블 삭제 구문 없음', !dropTablePattern.test(sql))
  check('전체 비우기 구문 없음', !truncatePattern.test(sql))
  check('ALTER TABLE ... DROP 패턴 없음(제약/컬럼 제거 없음)',
    !new RegExp(`ALTER\\s+TABLE\\b[^;]*\\b${dropWord}\\b`, 'i').test(sql))
}

// ============================================================================
// I. 롤백 — supabase_v3_49_paul_dollar_ROLLBACK.sql
// ============================================================================
console.log('\nI. 롤백 정적 단언')
{
  const deleteStatements = rb.split(';').filter((s) => /\bDELETE\s+FROM\b/i.test(s))
  check('DELETE FROM 문이 1개 이상 존재', deleteStatements.length > 0)
  check('모든 DELETE FROM 문에 WHERE 절 존재(무조건부 삭제 없음)',
    deleteStatements.length > 0 && deleteStatements.every((s) => /\bWHERE\b/i.test(s)))

  check('drop trigger if exists trg_reward_ledger_to_dollars on reward_ledger 존재',
    /drop trigger if exists\s+trg_reward_ledger_to_dollars\s+on\s+reward_ledger/i.test(rb))
  check('drop function if exists public.fn_reward_ledger_to_dollars() 존재',
    /drop function if exists public\.fn_reward_ledger_to_dollars\(\)/i.test(rb))
  check('drop view if exists dollar_balances 존재',
    /drop view if exists dollar_balances/i.test(rb))

  // 롤백이 v3_47(별 기반) 본문을 정확히 복원하는지 — 반환 shape 마커로 확인.
  check('롤백된 purchase_town_item이 v3_47 반환 shape(stars_spent, balance_after)으로 복원됨',
    /returns table\s*\(\s*ok\s+boolean,\s*reason\s+text,\s*stars_spent\s+integer,\s*balance_after\s+integer\s*\)/i.test(rb))
  check('롤백된 get_town_shop_state가 v3_47 반환 shape(earned, spent, available, owned_item_ids)으로 복원됨',
    /returns table\s*\(\s*earned\s+integer,\s*spent\s+integer,\s*available\s+integer,\s*owned_item_ids\s+text\[\]\s*\)/i.test(rb))
  check('롤백된 purchase_town_item이 reward_totals rt / sum(sp.stars_spent) 별 기반 계산으로 복원됨',
    /from reward_totals rt/i.test(rb) && /sum\(sp\.stars_spent\)/i.test(rb))
  check("롤백된 purchase_town_item에 dollar_ledger/dollar_balances 참조가 없음(순수 v3_47 본문)",
    (() => {
      const body = extractFunctionBlock(rb, 'purchase_town_item') || ''
      return body.length > 0 && !/dollar_ledger|dollar_balances/i.test(body)
    })())

  check('dollar_ledger에서 reward:/purchase: 접두사 행만 삭제(구조/시드 무변경)',
    /delete from dollar_ledger[\s\S]{0,120}event_type like 'reward:%'[\s\S]{0,80}event_type like 'purchase:%'/i.test(rb))
  check("town_purchases에서 currency = 'dollars' 조건으로 삭제(테이블 구조는 남김)",
    /delete from town_purchases[\s\S]{0,40}where\s+currency\s*=\s*'dollars'/i.test(rb))
  check('롤백 본문에 star_purchases를 향한 alter/insert/update가 전혀 없음(레거시 테이블 완전 보존)',
    !/(alter table\s+star_purchases|insert into\s+star_purchases\s*\(student_id, item_id, currency|update\s+star_purchases\s+set)/i.test(rb))

  const dropTablePattern = new RegExp(`${dropWord}\\s+TABLE`, 'i')
  const truncatePattern = new RegExp(`${truncWord}`, 'i')
  check('테이블 삭제 구문 없음', !dropTablePattern.test(rb))
  check('전체 비우기 구문 없음', !truncatePattern.test(rb))
  check('ALTER TABLE ... DROP 패턴 없음(제약/컬럼 제거 없음)',
    !new RegExp(`ALTER\\s+TABLE\\b[^;]*\\b${dropWord}\\b`, 'i').test(rb))

  // 보호 대상(건드리면 안 되는 테이블)에 대한 쓰기 문장이 0건인지 문장
  // 단위로 검사(testTownShopSql.mjs F절과 동일 관례) — 읽기 전용 STAGE 0/2
  // 확인 쿼리는 정당하게 허용한다.
  const protectedTargets = new Set([
    'reward_ledger', 'reward_totals', 'student_progress', 'students', 'xp_ledger',
    'dollar_rules', 'town_items', 'star_purchases',
  ])
  const allowedWriteTargets = new Set([
    'dollar_ledger', 'town_purchases', 'purchase_town_item', 'get_town_shop_state',
    'fn_reward_ledger_to_dollars', 'dollar_balances', 'trg_reward_ledger_to_dollars',
  ])
  const writeVerbSource = `^\\s*(delete\\s+from|update|insert\\s+into|${truncWord}(?:\\s+table)?|${dropWord}\\s+table|${dropWord}\\s+function|${dropWord}\\s+trigger|${dropWord}\\s+view|alter\\s+table)\\s+(?:if\\s+exists\\s+)?public\\.?([a-z_]+)`
  const writeVerbRe = new RegExp(writeVerbSource, 'i')
  const rbStatements = rb.split(';').map((s) => s.trim()).filter(Boolean)
  const writeStatements = []
  for (const stmt of rbStatements) {
    const m = stmt.match(writeVerbRe)
    if (m) writeStatements.push({ stmt, verb: m[1].toLowerCase(), target: m[2].toLowerCase() })
  }
  check('롤백에서 쓰기 문장을 1건 이상 식별함(이후 단언의 전제)', writeStatements.length > 0)
  check('식별된 쓰기 문장 중 보호 대상(reward_ledger/students/student_progress/xp_ledger/dollar_rules/town_items 등)을 대상으로 하는 것이 0건',
    writeStatements.every((w) => !protectedTargets.has(w.target)))

  check('보호 대상 테이블에 대한 읽기 전용 SELECT 참조는 허용됨(STAGE 0/2 확인, PASS 기대)',
    /select[\s\S]{0,300}(reward_ledger|student_progress)/i.test(rb))
}

// ============================================================================
// J. 인메모리 시뮬레이션 — reward_ledger→dollar_ledger 트리거 + purchase_town_item
// ============================================================================
console.log('\nJ. 인메모리 시뮬레이션 — Paul Dollar 경제 계약')

function createDollarDb() {
  return {
    dollarRules: new Map(),   // reward_type -> {rate, active}
    rewardLedger: [],         // [{student_id, reward_type, source_type, source_id, stars_delta, idempotency_key}]
    dollarLedger: [],         // [{student_id, event_type, dollars_delta, source_type, source_id, idempotency_key}]
    starPurchases: [],        // [{student_id, item_id, stars_spent, currency, price_paid}] — 레거시 별 구매 이력. purchase_town_item(dollars)은 이 배열을 절대 push하지 않는다(코디네이터 설계 결정 — 완전 보존).
    townPurchases: [],        // [{student_id, item_id, currency, price_paid}] — 폴달러 구매 이력 전용(신규 테이블).
    townItems: new Map(),     // item_id -> {price, currency, active}
  }
}

function seedDefaultRules(db) {
  for (const rt of EXPECTED_REWARD_TYPES) db.dollarRules.set(rt, { rate: 1, active: true })
  // legacy-baseline은 절대 시드하지 않는다(SQL과 동일).
}

function earnedStars(db, studentId) {
  return db.rewardLedger
    .filter((r) => r.student_id === studentId)
    .reduce((sum, r) => sum + r.stars_delta, 0)
}

function dollarBalance(db, studentId) {
  return db.dollarLedger
    .filter((d) => d.student_id === studentId)
    .reduce((sum, d) => sum + d.dollars_delta, 0)
}

// fn_reward_ledger_to_dollars() 트리거의 순수 JS 등가 — AFTER INSERT 시
// 자동 호출된다고 가정하고 insertRewardLedger()가 직접 실행한다.
function fireDollarTrigger(db, rewardRow) {
  if (rewardRow.stars_delta <= 0) return
  const rule = db.dollarRules.get(rewardRow.reward_type)
  if (!rule || !rule.active || rule.rate <= 0) return
  const idempotencyKey = `${rewardRow.idempotency_key}:dollar`
  if (db.dollarLedger.some((d) => d.idempotency_key === idempotencyKey)) return // on conflict do nothing
  db.dollarLedger.push({
    student_id: rewardRow.student_id,
    event_type: `reward:${rewardRow.reward_type}`,
    dollars_delta: rewardRow.stars_delta * rule.rate,
    source_type: rewardRow.source_type,
    source_id: rewardRow.source_id,
    idempotency_key: idempotencyKey,
  })
}

// reward_ledger INSERT의 순수 JS 등가(idempotency_key 전역 unique 제약 포함).
function insertRewardLedger(db, { studentId, rewardType, sourceType, sourceId, starsDelta }) {
  const idempotencyKey = `${studentId}:${rewardType}:${sourceType}:${sourceId}`
  if (db.rewardLedger.some((r) => r.idempotency_key === idempotencyKey)) {
    return { inserted: false } // unique violation과 동일 효과(두 번째는 무시)
  }
  const row = { student_id: studentId, reward_type: rewardType, source_type: sourceType, source_id: sourceId, stars_delta: starsDelta, idempotency_key: idempotencyKey }
  db.rewardLedger.push(row)
  fireDollarTrigger(db, row) // AFTER INSERT 트리거 등가
  return { inserted: true }
}

function ownsItem(db, studentId, itemId) {
  // ⚠️ 보유 판정은 star_purchases(레거시 별 구매) OR town_purchases(폴달러
  // 구매) — get_town_shop_state의 UNION과 동일 계약.
  return db.starPurchases.some((p) => p.student_id === studentId && p.item_id === itemId)
    || db.townPurchases.some((p) => p.student_id === studentId && p.item_id === itemId)
}

// purchase_town_item(p_student_id, p_item_id)의 순수 JS 등가. 호출 자체가
// "advisory lock 보유 구간"이다(testTownShopSql.mjs와 동일 모델링 — JS
// 싱글스레드이므로 한 호출이 끝날 때까지 다른 호출과 인터리빙되지 않음).
// ⚠️ 이 함수는 star_purchases를 절대 push하지 않는다 — 폴달러 구매는
// town_purchases에만 기록된다(코디네이터 설계 결정, SQL 본문과 동일 계약).
function purchaseTownItem(db, studentId, itemId) {
  const item = db.townItems.get(itemId)
  if (!item || !item.active) {
    return { ok: false, reason: 'item_not_found', dollarsSpent: 0, balanceAfter: 0 }
  }
  if (item.currency !== 'dollars') {
    return { ok: false, reason: 'item_not_purchasable', dollarsSpent: 0, balanceAfter: 0 }
  }
  // --- pg_advisory_xact_lock(hashtext('purchase_town_item:'||studentId)) 지점 ---
  const balance = dollarBalance(db, studentId)

  if (ownsItem(db, studentId, itemId)) {
    return { ok: true, reason: 'already_owned', dollarsSpent: 0, balanceAfter: balance }
  }
  if (balance < item.price) {
    return { ok: false, reason: 'insufficient', dollarsSpent: 0, balanceAfter: balance }
  }

  // 두 INSERT(town_purchases + dollar_ledger)를 같은 "트랜잭션"(이 함수
  // 호출) 안에서 원자적으로 수행 — unique_violation 방어(SQL의
  // begin/exception 블록 등가).
  if (ownsItem(db, studentId, itemId)) {
    return { ok: true, reason: 'already_owned', dollarsSpent: 0, balanceAfter: balance }
  }
  db.townPurchases.push({ student_id: studentId, item_id: itemId, currency: 'dollars', price_paid: item.price })
  db.dollarLedger.push({
    student_id: studentId,
    event_type: `purchase:${itemId}`,
    dollars_delta: -item.price,
    source_type: 'purchase',
    source_id: itemId,
    idempotency_key: `${studentId}:purchase:${itemId}`,
  })
  return { ok: true, reason: 'purchased', dollarsSpent: item.price, balanceAfter: balance - item.price }
}

console.log('\nJ1. 보상 5 stars(pronunciation) 지급 → dollars +5, stars_earned +5')
{
  const db = createDollarDb()
  seedDefaultRules(db)
  insertRewardLedger(db, { studentId: 's1', rewardType: 'pronunciation', sourceType: 'pronunciation', sourceId: 'w1:2026-09-08', starsDelta: 5 })
  check('stars_earned == 5', earnedStars(db, 's1') === 5)
  check('dollar 잔액 == 5', dollarBalance(db, 's1') === 5)
  check('dollar_ledger 행 1개', db.dollarLedger.filter((d) => d.student_id === 's1').length === 1)
}

console.log('\nJ2. 같은 idempotency_key로 재삽입 시도 → 두 원장 모두 신규 행 없음')
{
  const db = createDollarDb()
  seedDefaultRules(db)
  insertRewardLedger(db, { studentId: 's2', rewardType: 'pronunciation', sourceType: 'pronunciation', sourceId: 'w1:2026-09-08', starsDelta: 5 })
  const r2 = insertRewardLedger(db, { studentId: 's2', rewardType: 'pronunciation', sourceType: 'pronunciation', sourceId: 'w1:2026-09-08', starsDelta: 5 })
  check('두 번째 삽입은 무시됨(inserted=false)', r2.inserted === false)
  check('reward_ledger 행 여전히 1개', db.rewardLedger.filter((r) => r.student_id === 's2').length === 1)
  check('dollar_ledger 행 여전히 1개', db.dollarLedger.filter((d) => d.student_id === 's2').length === 1)
  check('stars_earned == 5(중복 아님)', earnedStars(db, 's2') === 5)
  check('dollar 잔액 == 5(중복 아님)', dollarBalance(db, 's2') === 5)
}

console.log('\nJ3. legacy-baseline 300 이관 → dollars +0, stars +300(레거시는 환산 안 됨)')
{
  const db = createDollarDb()
  seedDefaultRules(db)
  insertRewardLedger(db, { studentId: 's3', rewardType: 'legacy-baseline', sourceType: 'migration', sourceId: 'v2', starsDelta: 300 })
  check('stars_earned == 300', earnedStars(db, 's3') === 300)
  check('dollar 잔액 == 0(legacy-baseline은 dollar_rules에 없음)', dollarBalance(db, 's3') === 0)
  check('dollar_ledger 행 0개', db.dollarLedger.filter((d) => d.student_id === 's3').length === 0)
}

console.log('\nJ4. stars 223 / dollars 0인 학생 → 구매 시도 → insufficient, stars 무변화(223)')
{
  const db = createDollarDb()
  seedDefaultRules(db)
  db.townItems.set('shop-lamp', { price: 60, currency: 'dollars', active: true })
  insertRewardLedger(db, { studentId: 's4', rewardType: 'daily-goal-complete', sourceType: 'daily-goal', sourceId: '2026-09-01', starsDelta: 223 })
  // dollar_rules 배율이 1이라 이 보상 하나만으로도 dollars=223이 되므로,
  // "stars 223 / dollars 0"을 실측하려면 dollar_rules에 없는 방식으로
  // stars만 쌓는다(예: legacy-baseline로 이관된 것처럼).
  const db2 = createDollarDb()
  seedDefaultRules(db2)
  db2.townItems.set('shop-lamp', { price: 60, currency: 'dollars', active: true })
  insertRewardLedger(db2, { studentId: 's4', rewardType: 'legacy-baseline', sourceType: 'migration', sourceId: 'v1', starsDelta: 223 })
  check('stars_earned == 223, dollars == 0(전제 확인)', earnedStars(db2, 's4') === 223 && dollarBalance(db2, 's4') === 0)
  const r = purchaseTownItem(db2, 's4', 'shop-lamp')
  check('reason == insufficient', r.reason === 'insufficient')
  check('ok == false', r.ok === false)
  check('stars_earned 여전히 223(구매가 별에 전혀 영향 없음)', earnedStars(db2, 's4') === 223)
  check('dollar 잔액 여전히 0', dollarBalance(db2, 's4') === 0)
}

console.log('\nJ5. dollars 60 추가 획득(→ stars 283) → 구매 → purchased, dollars 0, stars 283(무변화), 보유 1개')
{
  const db = createDollarDb()
  seedDefaultRules(db)
  db.townItems.set('shop-lamp', { price: 60, currency: 'dollars', active: true })
  insertRewardLedger(db, { studentId: 's5', rewardType: 'legacy-baseline', sourceType: 'migration', sourceId: 'v1', starsDelta: 223 })
  insertRewardLedger(db, { studentId: 's5', rewardType: 'daily-goal-complete', sourceType: 'daily-goal', sourceId: '2026-09-08', starsDelta: 60 })
  check('stars_earned == 283(223 + 60)', earnedStars(db, 's5') === 283)
  check('dollar 잔액 == 60(legacy 몫은 환산 안 됨, 신규 60만 환산)', dollarBalance(db, 's5') === 60)

  const r = purchaseTownItem(db, 's5', 'shop-lamp')
  check('reason == purchased', r.reason === 'purchased')
  check('dollarsSpent == 60', r.dollarsSpent === 60)
  check('balanceAfter == 0', r.balanceAfter === 0)
  check('구매 후 dollar 잔액 == 0', dollarBalance(db, 's5') === 0)
  check('구매 후 stars_earned 여전히 283(구매가 별을 절대 차감하지 않음)', earnedStars(db, 's5') === 283)
  check('폴달러 구매가 town_purchases에 기록됨(1건)', db.townPurchases.filter((p) => p.student_id === 's5').length === 1)
  check('star_purchases는 이 구매로 전혀 변하지 않음(0건, 레거시 테이블 완전 보존)', db.starPurchases.filter((p) => p.student_id === 's5').length === 0)
}

console.log('\nJ6. 같은 아이템 재구매/더블클릭 재시도 → already_owned, 구매 행 1개, 음수 원장 행 1개')
{
  const db = createDollarDb()
  seedDefaultRules(db)
  db.townItems.set('shop-lamp', { price: 60, currency: 'dollars', active: true })
  insertRewardLedger(db, { studentId: 's6', rewardType: 'daily-goal-complete', sourceType: 'daily-goal', sourceId: '2026-09-08', starsDelta: 60 })
  purchaseTownItem(db, 's6', 'shop-lamp')
  const r2 = purchaseTownItem(db, 's6', 'shop-lamp')
  check('두 번째 시도 reason == already_owned', r2.reason === 'already_owned')
  check('ok == true(already_owned은 실패가 아님)', r2.ok === true)
  check('town_purchases 행 여전히 1개(중복 삽입 없음)', db.townPurchases.filter((p) => p.student_id === 's6').length === 1)
  check('star_purchases는 이 폴달러 구매로 전혀 변하지 않음(0건)', db.starPurchases.filter((p) => p.student_id === 's6').length === 0)
  check('dollar_ledger의 음수(구매) 행 정확히 1개', db.dollarLedger.filter((d) => d.student_id === 's6' && d.dollars_delta < 0).length === 1)
}

console.log('\nJ7. 서로 다른 아이템($60, $60) "동시" 구매 — advisory lock(순차 처리)이 초과지출을 막음')
{
  const db = createDollarDb()
  seedDefaultRules(db)
  db.townItems.set('item-a', { price: 60, currency: 'dollars', active: true })
  db.townItems.set('item-b', { price: 60, currency: 'dollars', active: true })
  insertRewardLedger(db, { studentId: 's7', rewardType: 'daily-goal-complete', sourceType: 'daily-goal', sourceId: '2026-09-08', starsDelta: 60 })

  const r1 = purchaseTownItem(db, 's7', 'item-a')
  const r2 = purchaseTownItem(db, 's7', 'item-b')
  check('첫 번째 purchased, balanceAfter 0', r1.reason === 'purchased' && r1.balanceAfter === 0)
  check('두 번째는 재계산된 잔액(0)을 보고 insufficient', r2.reason === 'insufficient' && r2.balanceAfter === 0)
  const totalSpent = db.dollarLedger.filter((d) => d.student_id === 's7' && d.dollars_delta < 0).reduce((s, d) => s - d.dollars_delta, 0)
  check('총 지출(60)이 획득(60)을 절대 넘지 않음', totalSpent === 60)
}

console.log('\nJ8. 레거시 Paul 행(currency=stars, 60) 보존 — 보유 인정, stars_earned 무관')
{
  const db = createDollarDb()
  seedDefaultRules(db)
  db.townItems.set('shop-lamp', { price: 60, currency: 'dollars', active: true })
  // v3_47 시절 별로 구매했던 레거시 행을 그대로 시뮬레이션(마이그레이션이
  // 백필한 것과 동일 — currency='stars', price_paid=60).
  db.starPurchases.push({ student_id: 'paul-qa', item_id: 'shop-lamp', stars_spent: 60, currency: 'stars', price_paid: 60 })
  insertRewardLedger(db, { studentId: 'paul-qa', rewardType: 'legacy-baseline', sourceType: 'migration', sourceId: 'v1', starsDelta: 500 })

  const owned = db.starPurchases.some((p) => p.student_id === 'paul-qa' && p.item_id === 'shop-lamp')
  check('레거시 stars 구매 행이 보유로 인정됨(화폐 무관)', owned === true)
  check('stars_earned은 레거시 구매와 무관하게 500(구매가 별에 영향 없음, v1 이전부터의 원칙)', earnedStars(db, 'paul-qa') === 500)
  check('dollar 잔액은 legacy-baseline이 환산되지 않아 0', dollarBalance(db, 'paul-qa') === 0)

  // 재구매 시도 → already_owned(화폐가 달라도 이미 보유). town_purchases에
  // 새 행이 생기면 안 되고(중복 지급 방지), star_purchases의 레거시 행도
  // 이 시도로 전혀 바뀌지 않아야 한다(완전 보존).
  const r = purchaseTownItem(db, 'paul-qa', 'shop-lamp')
  check('재구매 시도 reason == already_owned(화폐 무관 보유 판정)', r.reason === 'already_owned')
  check('town_purchases에 새 행이 생기지 않음(0건)', db.townPurchases.filter((p) => p.student_id === 'paul-qa').length === 0)
  check('star_purchases의 레거시 행이 정확히 1개로 그대로 유지됨(완전 보존)', db.starPurchases.filter((p) => p.student_id === 'paul-qa').length === 1)
}

console.log('\nJ9. 롤백 시뮬레이션 — ROLLBACK 파일이 v3_47 본문 마커를 포함하는지(위 I절 정적 단언 재확인)')
{
  check('ROLLBACK 파일에 v3_47 반환 shape 마커(stars_spent, balance_after) 존재',
    /stars_spent\s+integer,\s*balance_after\s+integer/i.test(rb))
  check('ROLLBACK 파일에 v3_47 반환 shape 마커(earned, spent, available) 존재',
    /earned\s+integer,\s*spent\s+integer,\s*available\s+integer/i.test(rb))
  check('ROLLBACK 파일의 모든 DELETE 문에 WHERE 절 존재(재확인)',
    rb.split(';').filter((s) => /\bDELETE\s+FROM\b/i.test(s)).every((s) => /\bWHERE\b/i.test(s)))
}

console.log(failures === 0
  ? '\n모든 단언 통과 — paul_dollar 마이그레이션 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
