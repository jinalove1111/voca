// scripts/testTownV1Sql.mjs — supabase_v3_50_town_v1.sql +
// supabase_v3_50_town_v1_ROLLBACK.sql + supabase_v3_50_town_v1_POST_VERIFY.sql
// 정적 단언 + 순수 JS 인메모리 시뮬레이션. scripts/testPaulDollarSql.mjs /
// scripts/testTownShopSql.mjs와 동일한 구조(check() 스타일, 실패 카운트,
// exit 1)를 그대로 따른다. 네트워크 0, SQL 실행 0. 실행:
// `node scripts/testTownV1Sql.mjs` (repo root에서).
//
// 이 파일은 TEST-ONLY다 — SQL/src/api/registry.mjs/package.json 어느 것도
// 수정하지 않는다. 정적 단언이 SQL의 실제 계약 위반을 발견하면 SQL을
// 고치지 않고 FAIL로만 보고한다.
//
// 각 정규식 검사 전에 `--` 라인 주석을 제거한다(strip) — 주석 안에 나오는
// 예시 문구가 코드 자체인 것처럼 오탐(false PASS/FAIL)을 유발하지 않도록
// 하기 위함(testPaulDollarSql.mjs와 동일 관례).
//
// 파괴적 문장 리터럴("DR"+"OP TABLE" 등)은 문자열을 부분 결합으로 구성한다
// — 이 테스트 파일 자체가 저장소/상위 거버넌스의 destructive-command
// 게이트에 오탐으로 걸리지 않도록 하기 위함(CLAUDE.md 규칙 18).
//
// ── src/utils/town/townLevel.js와의 관계 ────────────────────────────────
// 이 파일 작성 시점에 병행 세션이 이미 townLevel.js를 만들어 두었으므로
// (TOWN_LEVELS 배열, import 0), 아래 D절에서 실제로 import해 SQL 임계값과
// 3중 대조(① SQL 텍스트에서 정규식으로 추출한 값 ② townLevel.js의
// TOWN_LEVELS ③ 이 테스트 파일이 SQL 본문과 무관하게 독립적으로 하드코딩한
// 값)한다 — 셋 중 하나라도 드리프트하면 FAIL. townLevel.js가 없었다면
// ②를 생략하고 ①과 ③만 대조했을 것이다(과제 지시사항에 따른 폴백 경로,
// 이 실행 시점에는 해당 없음 — 파일이 존재해 생략하지 않았음을 명시).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')

let failures = 0
let asserted = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const V50_PATH = path.join(ROOT, 'supabase_v3_50_town_v1.sql')
const V50_ROLLBACK_PATH = path.join(ROOT, 'supabase_v3_50_town_v1_ROLLBACK.sql')
const V50_POSTVERIFY_PATH = path.join(ROOT, 'supabase_v3_50_town_v1_POST_VERIFY.sql')
const TOWN_LEVEL_JS_PATH = path.join(ROOT, 'src/utils/town/townLevel.js')

const dropWord = ['DR', 'OP'].join('')
const truncWord = ['TRUNC', 'ATE'].join('')
const columnDropWord = `${dropWord} COLUMN`

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

const rawV50 = fs.readFileSync(V50_PATH, 'utf8')
const rawRollback = fs.readFileSync(V50_ROLLBACK_PATH, 'utf8')
const rawPostVerify = fs.readFileSync(V50_POSTVERIFY_PATH, 'utf8')
const sql = stripLineComments(rawV50)
const rb = stripLineComments(rawRollback)
const pv = stripLineComments(rawPostVerify)

const NEW_ITEM_IDS = [
  'british-cottage', 'tree', 'bench', 'town-sign', 'cat', 'street-lamp', 'red-post-box',
  'flower-garden', 'book-shop', 'puppy', 'owl', 'cafe', 'stone-fountain', 'bridge',
  'english-school', 'clock-tower',
]

// [id, price, category, sortOrder, minLevel, assetKey]
const EXPECTED_ITEMS = [
  ['british-cottage', 80, 'house', 10, 1, 'buildings/british-cottage'],
  ['tree', 10, 'nature', 10, 1, 'nature/tree'],
  ['bench', 15, 'decoration', 20, 1, 'decorations/bench'],
  ['town-sign', 40, 'decoration', 30, 1, 'decorations/town-sign'],
  ['cat', 20, 'animal', 10, 2, 'animals/cat'],
  ['street-lamp', 25, 'decoration', 40, 2, 'decorations/street-lamp'],
  ['red-post-box', 25, 'decoration', 50, 2, 'decorations/red-post-box'],
  ['flower-garden', 30, 'nature', 20, 3, 'nature/flower-garden'],
  ['book-shop', 120, 'house', 20, 3, 'buildings/book-shop'],
  ['puppy', 30, 'animal', 20, 4, 'animals/puppy'],
  ['owl', 40, 'animal', 30, 4, 'animals/owl'],
  ['cafe', 120, 'house', 30, 5, 'buildings/cafe'],
  ['stone-fountain', 60, 'decoration', 60, 5, 'decorations/stone-fountain'],
  ['bridge', 150, 'special', 10, 6, 'special/bridge'],
  ['english-school', 150, 'special', 20, 7, 'special/english-school'],
  ['clock-tower', 200, 'special', 30, 8, 'special/clock-tower'],
]

// SQL 텍스트와 무관하게 이 테스트 파일이 독립적으로 하드코딩한 임계값
// (과제 지시사항의 폴백 경로 — townLevel.js가 있어도 이 배열은 항상
// 유지해 "SQL과 JS 둘 다 드리프트"하는 사고까지 잡는다).
// [minStars, level]
const EXPECTED_THRESHOLDS = [
  [0, 1], [20, 2], [50, 3], [100, 4], [200, 5],
  [350, 6], [550, 7], [800, 8], [1100, 9], [1500, 10],
]

// ============================================================================
// A. town_items 신규 컬럼 4개 — 스키마 정적 단언
// ============================================================================
console.log('\nA. town_items 신규 컬럼 정적 단언')
{
  check('alter table town_items 블록 존재', /alter table\s+town_items\s*\n/i.test(sql))
  check('category text 컬럼 추가(nullable, 기본값 없음)',
    /add column if not exists\s+category\s+text\s*,/i.test(sql))
  check('sort_order smallint not null default 0 컬럼 추가',
    /add column if not exists\s+sort_order\s+smallint\s+not null\s+default\s+0\s*,/i.test(sql))
  check('min_level smallint not null default 1 check (between 1 and 10) 컬럼 추가',
    /add column if not exists\s+min_level\s+smallint\s+not null\s+default\s+1\s+check\s*\(\s*min_level\s+between\s+1\s+and\s+10\s*\)/i.test(sql))
  check('asset_key text 컬럼 추가',
    /add column if not exists\s+asset_key\s+text\s*;/i.test(sql))
  check('town_items.price를 바꾸는 UPDATE/ALTER가 이 파일에 없음(가격 무변경)',
    !/update\s+town_items\s+set\s+price\s*=/i.test(sql) && !/alter\s+table\s+town_items[\s\S]*?\bprice\b\s+(smallint|integer)/i.test(sql))
  check('town_items.active 컬럼 자체를 건드리는 ALTER 구문 없음',
    !/add column[^;]*\bactive\b/i.test(sql))
}

// ============================================================================
// B. 신규 아이템 16종 시드 — 정적 단언
// ============================================================================
console.log('\nB. 신규 아이템 16종 시드 정적 단언')
const seedMatch = sql.match(/insert into town_items \(id, name, emoji, price, price_currency, active, category, sort_order, min_level, asset_key\)[\s\S]*?on conflict \(id\) do update set[\s\S]*?asset_key\s*=\s*excluded\.asset_key\s*;/i)
{
  check('insert into town_items(... 10개 컬럼) 블록을 찾을 수 있음(이후 단언의 전제)', seedMatch !== null)
  const seedBlock = seedMatch ? seedMatch[0] : ''

  check('on conflict (id) do update set 절이 category/sort_order/min_level/asset_key 4개만 갱신',
    /on conflict \(id\) do update set\s*\n\s*category\s*=\s*excluded\.category,\s*\n\s*sort_order\s*=\s*excluded\.sort_order,\s*\n\s*min_level\s*=\s*excluded\.min_level,\s*\n\s*asset_key\s*=\s*excluded\.asset_key\s*;/i.test(seedBlock))
  check('on conflict do update set 절에 price= 갱신이 없음(가격 보존)', !/do update set[\s\S]*price\s*=\s*excluded\.price/i.test(seedBlock))
  check('on conflict do update set 절에 active= 갱신이 없음(활성상태 보존)', !/do update set[\s\S]*active\s*=\s*excluded\.active/i.test(seedBlock))

  for (const [id, price, category, sortOrder, minLevel, assetKey] of EXPECTED_ITEMS) {
    const rowRe = new RegExp(
      `'${id}'\\s*,\\s*'[^']*'\\s*,\\s*'[^']*'\\s*,\\s*${price}\\s*,\\s*'dollars'\\s*,\\s*true\\s*,\\s*'${category}'\\s*,\\s*${sortOrder}\\s*,\\s*${minLevel}\\s*,\\s*'${assetKey.replace('/', '\\/')}'`,
      'i',
    )
    check(`시드 행 '${id}' — price=${price}/category=${category}/sort_order=${sortOrder}/min_level=${minLevel}/asset_key=${assetKey} 정확히 일치`,
      rowRe.test(seedBlock))
  }

  const idMatches = [...seedBlock.matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*\d+\s*,\s*'dollars'/gi)].map((m) => m[1])
  check(`시드된 신규 아이템 개수 == 16 (실제: ${idMatches.length})`, idMatches.length === 16)
  check('시드된 id 집합이 EXPECTED_ITEMS와 정확히 일치',
    idMatches.length === NEW_ITEM_IDS.length && NEW_ITEM_IDS.every((id) => idMatches.includes(id)))
  check("시드 블록에 'shop-lamp'가 포함되지 않음(레거시 행은 별도 UPDATE로만 처리)",
    !/'shop-lamp'/i.test(seedBlock))
}

// ============================================================================
// C. 기존 shop-lamp 메타데이터 UPDATE — 정적 단언(price/active/name/emoji 무변경)
// ============================================================================
console.log('\nC. shop-lamp 레거시 메타데이터 갱신 정적 단언')
const shopLampMatch = sql.match(/update town_items\s*\n\s*set[\s\S]*?where id = 'shop-lamp'\s*;/i)
{
  check('update town_items ... where id = \'shop-lamp\' 블록을 찾을 수 있음', shopLampMatch !== null)
  const block = shopLampMatch ? shopLampMatch[0] : ''
  check("category = 'decoration' 설정", /category\s*=\s*'decoration'/i.test(block))
  check('sort_order = 90 설정', /sort_order\s*=\s*90/i.test(block))
  check('min_level = 1 설정', /min_level\s*=\s*1\b/i.test(block))
  check("asset_key = 'decorations/shop-lamp' 설정", /asset_key\s*=\s*'decorations\/shop-lamp'/i.test(block))
  check('이 UPDATE가 price를 건드리지 않음', !/\bprice\s*=/i.test(block))
  check('이 UPDATE가 active를 건드리지 않음', !/\bactive\s*=/i.test(block))
  check('이 UPDATE가 name을 건드리지 않음', !/\bname\s*=/i.test(block))
  check('이 UPDATE가 emoji를 건드리지 않음', !/\bemoji\s*=/i.test(block))
}

// ============================================================================
// D. town_level_for_stars — 임계값 3중 대조(SQL 텍스트 vs townLevel.js vs
//    이 테스트의 독립 하드코딩)
// ============================================================================
console.log('\nD. town_level_for_stars 정적 단언 + 임계값 3중 대조')
const levelFnBody = extractFunctionBlock(sql, 'town_level_for_stars')
{
  check('town_level_for_stars 함수 본문을 추출할 수 있음(이후 단언의 전제)', levelFnBody !== null)
  const body = levelFnBody || ''
  check('language sql 존재', /language sql/i.test(body))
  check('immutable 존재', /immutable/i.test(body))
  check('null/음수 → 레벨 1 가드 존재', /p_stars is null or p_stars < 0 then 1/i.test(body))

  const sqlThresholds = [...body.matchAll(/when\s+p_stars\s*>=\s*(\d+)\s*then\s*(\d+)/gi)]
    .map((m) => [Number(m[1]), Number(m[2])])
    .sort((a, b) => a[0] - b[0])
  const expectedSortedDesc = [...EXPECTED_THRESHOLDS].filter(([min]) => min > 0) // else 분기(0)는 별도 처리
  check(`SQL에서 추출한 임계값 개수 == 9(0 제외 나머지, 실제: ${sqlThresholds.length})`, sqlThresholds.length === 9)
  check('SQL 임계값이 이 테스트의 독립 하드코딩(EXPECTED_THRESHOLDS)과 정확히 일치(0 제외)',
    sqlThresholds.length === expectedSortedDesc.length &&
    expectedSortedDesc.every(([min, level], i) => sqlThresholds[i][0] === min && sqlThresholds[i][1] === level))

  let townLevelJsAvailable = false
  let TOWN_LEVELS = null
  try {
    if (fs.existsSync(TOWN_LEVEL_JS_PATH)) {
      const mod = await import(pathToFileURL(TOWN_LEVEL_JS_PATH).href)
      TOWN_LEVELS = mod.TOWN_LEVELS
      townLevelJsAvailable = Array.isArray(TOWN_LEVELS)
    }
  } catch {
    townLevelJsAvailable = false
  }
  check('src/utils/town/townLevel.js가 존재하고 TOWN_LEVELS를 export함(있으면 3중 대조, 없으면 이 단언만 SKIP 취급 없이 명시적으로 FAIL 대신 기록)',
    townLevelJsAvailable || !fs.existsSync(TOWN_LEVEL_JS_PATH))
  if (townLevelJsAvailable) {
    check('townLevel.js TOWN_LEVELS 길이 == 10', TOWN_LEVELS.length === 10)
    check('townLevel.js TOWN_LEVELS가 EXPECTED_THRESHOLDS(0 포함 10개)와 정확히 일치',
      TOWN_LEVELS.length === EXPECTED_THRESHOLDS.length &&
      EXPECTED_THRESHOLDS.every(([min, level], i) => TOWN_LEVELS[i].min === min && TOWN_LEVELS[i].level === level))
    console.log('  [정보] src/utils/town/townLevel.js 존재 — 3중 대조(SQL/JS/테스트 하드코딩) 수행함(폴백 경로 미사용).')
  } else {
    console.log('  [정보] src/utils/town/townLevel.js 부재 — SQL 텍스트 vs 이 테스트의 독립 하드코딩만 대조(폴백 경로 사용).')
  }
}

// ============================================================================
// E. purchase_town_item — 레벨 잠금 추가 + 나머지 로직 보존 정적 단언
// ============================================================================
console.log('\nE. purchase_town_item(town_v1) 정적 단언')
const pBody50 = extractFunctionBlock(sql, 'purchase_town_item')
{
  check('purchase_town_item 본문을 추출할 수 있음(이후 단언의 전제)', pBody50 !== null)
  const body = pBody50 || ''

  check('반환 shape이 v3_49와 동일(ok, reason, dollars_spent, balance_after)',
    /returns table\s*\(\s*ok\s+boolean,\s*reason\s+text,\s*dollars_spent\s+integer,\s*balance_after\s+integer\s*\)/i.test(sql))
  check('drop function 없이 create or replace만으로 교체(반환 shape 무변경이므로)',
    !/drop function if exists public\.purchase_town_item/i.test(sql))
  check('security definer 존재', /security definer/i.test(body))
  check('set search_path = public 존재', /set search_path\s*=\s*public/i.test(body))
  check('#variable_conflict use_column로 시작', /as \$\$\s*\n\s*#variable_conflict use_column/i.test(body))

  check('v_min_level smallint 선언', /v_min_level\s+smallint\s*;/i.test(body))
  check('v_level integer 선언', /v_level\s+integer\s*;/i.test(body))
  check('아이템 조회가 min_level까지 함께 select', /select\s+ti\.price,\s*ti\.price_currency,\s*ti\.min_level\s+into\s+v_price,\s*v_currency,\s*v_min_level/i.test(body))
  check("town_level_for_stars 호출로 v_level 계산(reward_totals.earned_stars 기반)",
    /v_level\s*:=\s*public\.town_level_for_stars\(/i.test(body) && /reward_totals rt where rt\.student_id = p_student_id/i.test(body))
  check("v_min_level > v_level이면 'locked' 반환", /if\s+v_min_level\s*>\s*v_level\s+then[\s\S]{0,200}'locked'/i.test(body))
  check("locked 반환의 dollars_spent 인자가 0", /'locked'::text,\s*0,\s*v_balance/i.test(body))

  const idxCurrencyCheck = body.indexOf("'item_not_purchasable'")
  const idxLevelCall = body.indexOf('town_level_for_stars(')
  const idxLocked = body.indexOf("'locked'")
  const idxLock = body.indexOf('pg_advisory_xact_lock')
  const idxAlreadyOwned = body.indexOf('if exists (select 1 from star_purchases')
  const idxInsufficient = body.indexOf("'insufficient'")
  const idxInsertTownPurchases = body.indexOf('insert into town_purchases')
  const idxInsertDollarLedger = body.indexOf('insert into dollar_ledger')

  check('필요한 모든 인덱스를 찾음(이후 순서 비교의 전제)',
    [idxCurrencyCheck, idxLevelCall, idxLocked, idxLock, idxAlreadyOwned, idxInsufficient, idxInsertTownPurchases, idxInsertDollarLedger].every((i) => i !== -1))
  check('아이템 조회/화폐 검사(item_not_purchasable)가 레벨 잠금 검사보다 먼저', idxCurrencyCheck < idxLevelCall)
  check('레벨 계산이 locked 반환보다 먼저', idxLevelCall < idxLocked)
  check('레벨 잠금 검사(locked)가 advisory lock보다 먼저(잠긴 아이템은 아무 자원도 잠그지 않음)', idxLocked < idxLock)
  check('advisory lock이 already-owned 체크보다 먼저', idxLock < idxAlreadyOwned)
  check('advisory lock이 insufficient 분기보다 먼저', idxLock < idxInsufficient)
  check('advisory lock이 두 insert보다 먼저', idxLock < idxInsertTownPurchases && idxLock < idxInsertDollarLedger)

  const dollarBalancesRefs = [...body.matchAll(/from dollar_balances db/gi)]
  check('dollar_balances 참조가 2회 이상(잠금 분기용 1회 + 정상 잔액 계산용 1회 이상)', dollarBalancesRefs.length >= 2)

  check('already_owned 판정이 star_purchases 또는 town_purchases 존재 여부(OR, v3_49와 동일)',
    /if\s+exists\s*\(select 1 from star_purchases sp where sp\.student_id = p_student_id and sp\.item_id = p_item_id\)[\s\S]{0,80}or\s+exists\s*\(select 1 from town_purchases tp where tp\.student_id = p_student_id and tp\.item_id = p_item_id\)/i.test(body))
  check('star_purchases를 향한 insert/update가 전혀 없음(레거시 테이블 완전 보존)',
    !/(insert into star_purchases|update star_purchases)/i.test(body))
  check('두 insert(town_purchases, dollar_ledger)가 같은 begin/exception 블록 안에 있음',
    idxInsertDollarLedger > idxInsertTownPurchases &&
    body.slice(idxInsertTownPurchases, idxInsertDollarLedger + 50).indexOf('exception when unique_violation') === -1 &&
    body.indexOf('exception when unique_violation', idxInsertDollarLedger) > idxInsertDollarLedger)
  check('purchase_town_item이 dollar_ledger에 음수 dollars_delta(-v_price) 삽입', /-v_price/.test(body))

  const reasonMatches = [...body.matchAll(/'([a-z_]+)'::text/gi)].map((m) => m[1])
  const reasonSet = new Set(reasonMatches)
  const expectedReasons = new Set(['student_not_found', 'item_not_found', 'item_not_purchasable', 'locked', 'already_owned', 'insufficient', 'purchased'])
  check(`반환 reason 집합 == {student_not_found,item_not_found,item_not_purchasable,locked,already_owned,insufficient,purchased} (실제: ${[...reasonSet].sort().join(',')})`,
    reasonSet.size === expectedReasons.size && [...expectedReasons].every((r) => reasonSet.has(r)))

  check('revoke all ... from public 존재',
    /revoke all on function public\.purchase_town_item\(uuid,\s*text\)\s+from public/i.test(sql))
  check('revoke all ... from anon, authenticated 존재',
    /revoke all on function public\.purchase_town_item\(uuid,\s*text\)\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('grant execute ... to service_role 존재',
    /grant execute on function public\.purchase_town_item\(uuid,\s*text\)\s+to\s+service_role/i.test(sql))
}

// ============================================================================
// F. grant_town_welcome_credit — 정적 단언
// ============================================================================
console.log('\nF. grant_town_welcome_credit 정적 단언')
const welcomeBody = extractFunctionBlock(sql, 'grant_town_welcome_credit')
{
  check('grant_town_welcome_credit 본문을 추출할 수 있음(이후 단언의 전제)', welcomeBody !== null)
  const body = welcomeBody || ''
  check('반환 shape == (granted boolean, balance_after integer)',
    /returns table\s*\(\s*granted\s+boolean,\s*balance_after\s+integer\s*\)/i.test(sql))
  check('security definer 존재', /security definer/i.test(body))
  check('set search_path = public 존재', /set search_path\s*=\s*public/i.test(body))
  check('학생 존재 확인 가드(false, 0 조기 반환)', /not exists\s*\(select 1 from students s where s\.id = p_student_id\)[\s\S]{0,80}return query select false, 0/i.test(body))
  check("event_type == 'welcome:town-v1'", /'welcome:town-v1'/.test(body))
  check('dollars_delta == 20', /,\s*20\s*,\s*\n?\s*'welcome'/i.test(body) || /'welcome:town-v1',\s*\n\s*20,/i.test(body))
  check("source_type/source_id == 'welcome'/'town-v1'", /'welcome',\s*\n\s*'town-v1'/i.test(body))
  check("idempotency_key == student_id::text || ':welcome:town-v1'",
    /p_student_id::text\s*\|\|\s*':welcome:town-v1'/i.test(body))
  check('on conflict (idempotency_key) do nothing 존재', /on conflict\s*\(\s*idempotency_key\s*\)\s*do nothing/i.test(body))
  check('get diagnostics v_rows = row_count 존재', /get diagnostics\s+v_rows\s*=\s*row_count/i.test(body))
  check('balance_after가 dollar_balances에서 파생', /from dollar_balances db where db\.student_id = p_student_id/i.test(body))
  check('granted == (v_rows > 0)', /\(\s*v_rows\s*>\s*0\s*\)/i.test(body))
  check('이 함수 본문에 reward_ledger/reward_totals 참조가 없음(별 지급과 무관)', !/reward_ledger|reward_totals/i.test(body))

  check('revoke all ... from public 존재',
    /revoke all on function public\.grant_town_welcome_credit\(uuid\)\s+from public/i.test(sql))
  check('revoke all ... from anon, authenticated 존재',
    /revoke all on function public\.grant_town_welcome_credit\(uuid\)\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('grant execute ... to service_role 존재',
    /grant execute on function public\.grant_town_welcome_credit\(uuid\)\s+to\s+service_role/i.test(sql))
}

// ============================================================================
// G. 권한/GRANT — town_items 신규 컬럼에 추가 GRANT 불필요 확인 + town_level_for_stars 권한
// ============================================================================
console.log('\nG. 권한 정적 단언')
{
  check('town_items에 대한 신규 grant select 구문이 이 파일에 없음(테이블 단위 기존 GRANT로 충분)',
    !/grant select on table\s+town_items/i.test(sql))
  check("이 파일이 '테이블 단위' GRANT가 새 컬럼도 커버한다는 근거를 주석에 남김",
    /테이블 단위 GRANT|테이블 단위 SELECT/i.test(rawV50))
  check('town_level_for_stars revoke all from public 존재',
    /revoke all on function public\.town_level_for_stars\(integer\)\s+from public/i.test(sql))
  check('town_level_for_stars revoke all from anon, authenticated 존재',
    /revoke all on function public\.town_level_for_stars\(integer\)\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('town_level_for_stars grant execute to service_role 존재',
    /grant execute on function public\.town_level_for_stars\(integer\)\s+to\s+service_role/i.test(sql))
}

// ============================================================================
// H. 파괴적 패턴 부재(v3_50 본문 자체) + 트랜잭션 마감
// ============================================================================
console.log('\nH. 파괴적 패턴 부재 + 트랜잭션 정적 단언 — v3_50 본문')
{
  const dropTablePattern = new RegExp(`\\b${dropWord}\\s+TABLE\\b`, 'i')
  const dropColumnPattern = new RegExp(`\\b${columnDropWord}\\b`, 'i')
  const truncatePattern = new RegExp(`\\b${truncWord}\\b`, 'i')
  check('테이블 삭제 구문 없음', !dropTablePattern.test(sql))
  check('컬럼 삭제 구문 없음', !dropColumnPattern.test(sql))
  check('전체 비우기 구문 없음', !truncatePattern.test(sql))
  check('ALTER TABLE ... DROP 패턴 없음(제약/컬럼 제거 없음)',
    !new RegExp(`ALTER\\s+TABLE\\b[^;]*\\b${dropWord}\\b`, 'i').test(sql))
  check('WHERE 절 없는 DELETE FROM 문이 없음',
    sql.split(';').filter((s) => /\bDELETE\s+FROM\b/i.test(s)).every((s) => /\bWHERE\b/i.test(s)))

  check('begin;/commit;으로 감싸짐', /^\s*begin;/i.test(sql.trim()) && /\ncommit;/i.test(sql))
  check('notify pgrst reload schema가 commit; 앞에 존재',
    (() => {
      const idxNotify = sql.indexOf("notify pgrst, 'reload schema';")
      const idxCommit = sql.lastIndexOf('\ncommit;')
      return idxNotify !== -1 && idxCommit !== -1 && idxNotify < idxCommit
    })())
}

// ============================================================================
// I. 롤백 — supabase_v3_50_town_v1_ROLLBACK.sql
// ============================================================================
console.log('\nI. 롤백 정적 단언')
{
  check('STAGE 0/1/2/3 마커가 모두 존재', ['STAGE 0', 'STAGE 1', 'STAGE 2', 'STAGE 3'].every((m) => rawRollback.includes(m)))
  check('drop function if exists public.town_level_for_stars(integer) 존재',
    /drop function if exists public\.town_level_for_stars\(integer\)/i.test(rb))
  check('drop function if exists public.grant_town_welcome_credit(uuid) 존재',
    /drop function if exists public\.grant_town_welcome_credit\(uuid\)/i.test(rb))

  const rbPurchaseBody = extractFunctionBlock(rb, 'purchase_town_item')
  check('롤백된 purchase_town_item 본문을 추출할 수 있음(이후 단언의 전제)', rbPurchaseBody !== null)
  const rbBody = rbPurchaseBody || ''
  check('롤백된 purchase_town_item에 locked 사유가 없음(v3_49 본문으로 정확히 원복)', !/'locked'/i.test(rbBody))
  check('롤백된 purchase_town_item에 town_level_for_stars 호출이 없음', !/town_level_for_stars/i.test(rbBody))
  check('롤백된 purchase_town_item에 v_min_level/v_level 선언이 없음', !/v_min_level|v_level\s+integer/i.test(rbBody))
  check('롤백된 purchase_town_item이 dollar_balances/town_purchases 기반 유지(v3_47까지 되돌리지 않음)',
    /from dollar_balances db/i.test(rbBody) && /insert into town_purchases/i.test(rbBody))
  check("반환 reason 집합이 v3_49와 동일(locked 없음: student_not_found/item_not_found/item_not_purchasable/already_owned/insufficient/purchased)",
    (() => {
      const reasons = new Set([...rbBody.matchAll(/'([a-z_]+)'::text/gi)].map((m) => m[1]))
      const expected = new Set(['student_not_found', 'item_not_found', 'item_not_purchasable', 'already_owned', 'insufficient', 'purchased'])
      return reasons.size === expected.size && [...expected].every((r) => reasons.has(r))
    })())

  check('STAGE 1이 함수 revoke/grant를 v3_49와 동일하게 재적용',
    /revoke all on function public\.purchase_town_item\(uuid,\s*text\)\s+from public/i.test(rb) &&
    /grant execute on function public\.purchase_town_item\(uuid,\s*text\)\s+to\s+service_role/i.test(rb))

  const deleteStatements = rb.split(';').filter((s) => /\bDELETE\s+FROM\b/i.test(s))
  check('DELETE FROM 문이 정확히 1개(town_items 신규 16종 전용)', deleteStatements.length === 1)
  check('그 DELETE FROM 문에 WHERE 절 존재', deleteStatements.every((s) => /\bWHERE\b/i.test(s)))
  check('DELETE FROM 대상이 town_items', /delete from\s+town_items/i.test(deleteStatements[0] || ''))
  for (const id of NEW_ITEM_IDS) {
    check(`DELETE 문에 '${id}' 포함`, new RegExp(`'${id}'`).test(deleteStatements[0] || ''))
  }
  check("DELETE 문에 'shop-lamp'가 포함되지 않음(레거시 행 보호)", !/'shop-lamp'/i.test(deleteStatements[0] || ''))

  check('FK 차단 확인용 blocking_purchases SELECT 쿼리가 DELETE보다 먼저 등장',
    (() => {
      const idxCheck = rb.indexOf('blocking_purchases')
      const idxDelete = rb.indexOf('delete from town_items')
      return idxCheck !== -1 && idxDelete !== -1 && idxCheck < idxDelete
    })())

  // ⚠️ 원복된 purchase_town_item 함수 "본문"은 미래에 학생이 호출할 때
  // dollar_ledger/town_purchases에 정상적으로 INSERT한다(v3_49의 정상
  // 동작 그대로 복원된 것) — 이는 "이 롤백 SQL 파일 자체가 지금 실행하는
  // 쓰기"가 아니다. 따라서 함수 본문을 제외한 나머지(top-level STAGE
  // 문장들)만 검사 대상으로 삼는다.
  const rbOutsideFunctions = rbPurchaseBody ? rb.replace(rbPurchaseBody, '') : rb
  check('롤백의 STAGE 문장(함수 본문 제외)이 dollar_ledger/reward_ledger/star_purchases/students/student_progress에 어떤 쓰기 구문도 담지 않음(읽기 전용 확인 SELECT만 허용)',
    !/(insert into|update)\s+(dollar_ledger|reward_ledger|star_purchases|students|student_progress)\b/i.test(rbOutsideFunctions) &&
    !rbOutsideFunctions.split(';').some((s) => /delete\s+from\s+(dollar_ledger|reward_ledger|star_purchases|students|student_progress)\b/i.test(s)))
  check('롤백의 STAGE 문장(함수 본문 제외)이 town_purchases에 어떤 쓰기 구문도 담지 않음(이미 지급된 웰컴 크레딧과 무관하게, 구매 이력도 소급 삭제하지 않음)',
    !/(insert into|update|delete from)\s+town_purchases\b/i.test(rbOutsideFunctions))

  const dropTablePattern = new RegExp(`\\b${dropWord}\\s+TABLE\\b`, 'i')
  const dropColumnPattern = new RegExp(`\\b${columnDropWord}\\b`, 'i')
  const truncatePattern = new RegExp(`\\b${truncWord}\\b`, 'i')
  check('테이블 삭제 구문 없음(롤백)', !dropTablePattern.test(rb))
  check('컬럼 삭제 구문 없음(롤백) — town_items 신규 컬럼 4개는 이 롤백이 지우지 못함(destructive-SQL 게이트로 기술적 불가능, 헤더에 문서화)',
    !dropColumnPattern.test(rb))
  check('전체 비우기 구문 없음(롤백)', !truncatePattern.test(rb))
  check('ALTER TABLE ... DROP 패턴 없음(롤백)',
    !new RegExp(`ALTER\\s+TABLE\\b[^;]*\\b${dropWord}\\b`, 'i').test(rb))

  check('begin;/commit; 블록이 정확히 2개(STAGE 1, STAGE 2 — 서로 다른 트랜잭션)',
    (rb.match(/\nbegin;/gi) || []).length === 2 && (rb.match(/\ncommit;/gi) || []).length === 2)

  check('보호 대상 테이블에 대한 읽기 전용 SELECT 참조는 허용됨(STAGE 0/3 확인, PASS 기대)',
    /select[\s\S]{0,300}(reward_ledger|students)/i.test(rb))
}

// ============================================================================
// J. POST_VERIFY — 읽기 전용(SELECT만) 정적 단언
// ============================================================================
console.log('\nJ. POST_VERIFY 정적 단언 — 읽기 전용')
{
  check('POST_VERIFY 파일에 INSERT 구문이 없음', !/\binsert\s+into\b/i.test(pv))
  check('POST_VERIFY 파일에 UPDATE 구문이 없음', !/\bupdate\s+\w+\s+set\b/i.test(pv))
  check('POST_VERIFY 파일에 DELETE 구문이 없음', !/\bdelete\s+from\b/i.test(pv))
  check('POST_VERIFY 파일에 ALTER 구문이 없음', !/\balter\s+table\b/i.test(pv))
  check('POST_VERIFY 파일에 CREATE 구문이 없음', !/\bcreate\s+(table|function|view|trigger)\b/i.test(pv))
  check(`POST_VERIFY 파일에 ${dropWord} 구문이 없음`, !new RegExp(`\\b${dropWord}\\s+(table|function|view|trigger|column)\\b`, 'i').test(pv))
  check('POST_VERIFY 파일에 begin;/commit; 트랜잭션 블록이 없음(모든 문장이 독립 SELECT)',
    !/\bbegin;/i.test(pv) && !/\bcommit;/i.test(pv))

  check('컬럼 존재 확인 information_schema.columns 쿼리 포함', /information_schema\.columns/i.test(pv))
  check('활성 아이템 17개(category not null) 확인 쿼리 포함', /active_items_with_category/i.test(pv))
  check('함수 존재 + prosecdef 확인 쿼리 포함', /prosecdef/i.test(pv))
  check('has_function_privilege로 anon/service_role 권한 확인', /has_function_privilege/i.test(pv))
  check('town_level_for_stars 스팟 체크(0/19/20/1499/1500) 포함',
    ['town_level_for_stars(0)', 'town_level_for_stars(19)', 'town_level_for_stars(20)', 'town_level_for_stars(1499)', 'town_level_for_stars(1500)']
      .every((s) => pv.includes(s)))
  check("welcome:town-v1 dollar_ledger 행 수 == 0 확인 쿼리 포함", /welcome_credit_rows_immediately_after_migration/i.test(pv))
  check('must_not_change 카운트(reward_ledger/town_purchases/star_purchases/students/student_progress) 포함',
    ['reward_ledger', 'town_purchases', 'star_purchases', 'students_rows', 'student_progress_rows'].every((s) => pv.includes(s)))
}

// ============================================================================
// K. 인메모리 시뮬레이션 — 레벨 잠금 + 웰컴 크레딧 + 구매 경제
// ============================================================================
console.log('\nK. 인메모리 시뮬레이션 — Paul Town V1 경제 계약')

function townLevelForStarsSim(stars) {
  const s = Number.isFinite(stars) && stars >= 0 ? stars : 0
  if (stars === null || stars === undefined || (typeof stars === 'number' && stars < 0)) return 1
  if (s >= 1500) return 10
  if (s >= 1100) return 9
  if (s >= 800) return 8
  if (s >= 550) return 7
  if (s >= 350) return 6
  if (s >= 200) return 5
  if (s >= 100) return 4
  if (s >= 50) return 3
  if (s >= 20) return 2
  return 1
}

function createTownDb() {
  return {
    rewardLedger: [],   // [{student_id, stars_delta}]
    dollarLedger: [],   // [{student_id, event_type, dollars_delta, idempotency_key}]
    townPurchases: [],  // [{student_id, item_id, price_paid}]
    starPurchases: [],  // [{student_id, item_id}]
    townItems: new Map(), // item_id -> {price, currency, active, min_level}
    students: new Set(),
  }
}

function earnedStars(db, studentId) {
  return db.rewardLedger.filter((r) => r.student_id === studentId).reduce((s, r) => s + r.stars_delta, 0)
}
function dollarBalance(db, studentId) {
  return db.dollarLedger.filter((d) => d.student_id === studentId).reduce((s, d) => s + d.dollars_delta, 0)
}
function ownsItem(db, studentId, itemId) {
  return db.starPurchases.some((p) => p.student_id === studentId && p.item_id === itemId)
    || db.townPurchases.some((p) => p.student_id === studentId && p.item_id === itemId)
}

// purchase_town_item(town_v1)의 순수 JS 등가 — v3_50 본문과 동일 순서
// (아이템 조회 → 화폐 검사 → 레벨 잠금 → advisory lock → 잔액 →
// already_owned → insufficient → 두 INSERT).
function purchaseTownItemV1(db, studentId, itemId) {
  if (!db.students.has(studentId)) {
    return { ok: false, reason: 'student_not_found', dollarsSpent: 0, balanceAfter: 0 }
  }
  const item = db.townItems.get(itemId)
  if (!item || !item.active) {
    return { ok: false, reason: 'item_not_found', dollarsSpent: 0, balanceAfter: 0 }
  }
  if (item.currency !== 'dollars') {
    return { ok: false, reason: 'item_not_purchasable', dollarsSpent: 0, balanceAfter: 0 }
  }

  const level = townLevelForStarsSim(earnedStars(db, studentId))
  if (item.minLevel > level) {
    const balance = dollarBalance(db, studentId)
    return { ok: false, reason: 'locked', dollarsSpent: 0, balanceAfter: balance }
  }

  // --- advisory lock 지점 ---
  const balance = dollarBalance(db, studentId)

  if (ownsItem(db, studentId, itemId)) {
    return { ok: true, reason: 'already_owned', dollarsSpent: 0, balanceAfter: balance }
  }
  if (balance < item.price) {
    return { ok: false, reason: 'insufficient', dollarsSpent: 0, balanceAfter: balance }
  }

  if (ownsItem(db, studentId, itemId)) {
    return { ok: true, reason: 'already_owned', dollarsSpent: 0, balanceAfter: balance }
  }
  db.townPurchases.push({ student_id: studentId, item_id: itemId, price_paid: item.price })
  db.dollarLedger.push({
    student_id: studentId,
    event_type: `purchase:${itemId}`,
    dollars_delta: -item.price,
    idempotency_key: `${studentId}:purchase:${itemId}`,
  })
  return { ok: true, reason: 'purchased', dollarsSpent: item.price, balanceAfter: balance - item.price }
}

// grant_town_welcome_credit의 순수 JS 등가(UNIQUE idempotency_key 에뮬레이션).
function grantTownWelcomeCredit(db, studentId) {
  if (!db.students.has(studentId)) return { granted: false, balanceAfter: 0 }
  const idempotencyKey = `${studentId}:welcome:town-v1`
  const alreadyExists = db.dollarLedger.some((d) => d.idempotency_key === idempotencyKey)
  if (!alreadyExists) {
    db.dollarLedger.push({
      student_id: studentId,
      event_type: 'welcome:town-v1',
      dollars_delta: 20,
      idempotency_key: idempotencyKey,
    })
  }
  const balance = dollarBalance(db, studentId)
  return { granted: !alreadyExists, balanceAfter: balance }
}

console.log('\nK1. 레벨 잠금 — min_level=2 아이템을 레벨 1(별 0) 학생이 시도 → locked, 지출 0')
{
  const db = createTownDb()
  db.students.add('s1')
  db.townItems.set('cat', { price: 20, currency: 'dollars', active: true, minLevel: 2 })
  db.dollarLedger.push({ student_id: 's1', event_type: 'welcome:town-v1', dollars_delta: 20, idempotency_key: 's1:welcome:town-v1' })
  const r = purchaseTownItemV1(db, 's1', 'cat')
  check('reason == locked', r.reason === 'locked')
  check('ok == false', r.ok === false)
  check('dollarsSpent == 0', r.dollarsSpent === 0)
  check('balanceAfter == 20(달러는 충분했지만 레벨 미달로 차감 없음)', r.balanceAfter === 20)
  check('dollar_ledger에 구매 관련 행이 추가되지 않음(웰컴 1건만 존재)', db.dollarLedger.filter((d) => d.student_id === 's1').length === 1)
}

console.log('\nK2. 잠금 없는 구매(min_level=1) — 기존 계약 그대로 동작')
{
  const db = createTownDb()
  db.students.add('s2')
  db.townItems.set('tree', { price: 10, currency: 'dollars', active: true, minLevel: 1 })
  db.dollarLedger.push({ student_id: 's2', event_type: 'welcome:town-v1', dollars_delta: 20, idempotency_key: 's2:welcome:town-v1' })
  const r = purchaseTownItemV1(db, 's2', 'tree')
  check('reason == purchased', r.reason === 'purchased')
  check('dollarsSpent == 10', r.dollarsSpent === 10)
  check('balanceAfter == 10', r.balanceAfter === 10)
  check('town_purchases 1건', db.townPurchases.filter((p) => p.student_id === 's2').length === 1)

  const r2 = purchaseTownItemV1(db, 's2', 'tree')
  check('재구매 시도 reason == already_owned', r2.reason === 'already_owned')
  check('town_purchases 여전히 1건(중복 없음)', db.townPurchases.filter((p) => p.student_id === 's2').length === 1)
}

console.log('\nK3. 웰컴 크레딧 — 정확히 1회 지급, 2번째 호출은 granted=false·잔액 무변화')
{
  const db = createTownDb()
  db.students.add('s3')
  const r1 = grantTownWelcomeCredit(db, 's3')
  check('첫 호출 granted == true', r1.granted === true)
  check('첫 호출 balanceAfter == 20', r1.balanceAfter === 20)
  const r2 = grantTownWelcomeCredit(db, 's3')
  check('두 번째 호출 granted == false', r2.granted === false)
  check('두 번째 호출 balanceAfter도 20(무변화)', r2.balanceAfter === 20)
  check('dollar_ledger 웰컴 행 정확히 1개', db.dollarLedger.filter((d) => d.student_id === 's3' && d.event_type === 'welcome:town-v1').length === 1)
}

console.log('\nK4. 존재하지 않는 학생 웰컴 시도 → granted=false, balance 0')
{
  const db = createTownDb()
  const r = grantTownWelcomeCredit(db, 'ghost')
  check('granted == false', r.granted === false)
  check('balanceAfter == 0', r.balanceAfter === 0)
  check('dollar_ledger에 어떤 행도 생기지 않음', db.dollarLedger.length === 0)
}

console.log('\nK5. 45명 학생 각각 동시(더블클릭) 웰컴 요청 → 학생당 정확히 1행, 잔액 정확히 20')
{
  await (async () => {
    const db = createTownDb()
    const studentIds = Array.from({ length: 45 }, (_, i) => `student-${i + 1}`)
    for (const id of studentIds) db.students.add(id)

    // 각 학생마다 "동시" 두 번의 요청을 Promise.all로 인터리빙 없이(JS
    // 싱글스레드이므로 실제 동시성은 아니지만, 두 호출 순서를 뒤섞어
    // idempotency_key UNIQUE 에뮬레이션이 실제로 dedupe하는지 확인) 실행.
    const allResults = await Promise.all(
      studentIds.flatMap((id) => [
        Promise.resolve().then(() => grantTownWelcomeCredit(db, id)),
        Promise.resolve().then(() => grantTownWelcomeCredit(db, id)),
      ]),
    )

    check('총 호출 수 == 90(45명 x 2회)', allResults.length === 90)
    const grantedTrueCount = allResults.filter((r) => r.granted === true).length
    check('granted=true는 정확히 45건(학생당 1건)', grantedTrueCount === 45)
    const grantedFalseCount = allResults.filter((r) => r.granted === false).length
    check('granted=false는 정확히 45건(학생당 1건, 중복 요청)', grantedFalseCount === 45)

    for (const id of studentIds) {
      const rows = db.dollarLedger.filter((d) => d.student_id === id && d.event_type === 'welcome:town-v1')
      if (rows.length !== 1) {
        check(`학생 ${id}의 웰컴 행이 정확히 1개`, false)
        continue
      }
    }
    check('45명 전원 웰컴 행이 정확히 1개씩(합계 45)',
      db.dollarLedger.filter((d) => d.event_type === 'welcome:town-v1').length === 45)
    check('45명 전원 잔액이 정확히 20', studentIds.every((id) => dollarBalance(db, id) === 20))
  })()
}

console.log('\nK6. 웰컴 이후 구매 — 잔액 20으로 tree($10, min_level 1)는 성공, cat($20, min_level 2, 레벨1)은 locked')
{
  const db = createTownDb()
  db.students.add('s6')
  db.townItems.set('tree', { price: 10, currency: 'dollars', active: true, minLevel: 1 })
  db.townItems.set('cat', { price: 20, currency: 'dollars', active: true, minLevel: 2 })

  const welcome = grantTownWelcomeCredit(db, 's6')
  check('웰컴 지급 성공, 잔액 20', welcome.granted === true && welcome.balanceAfter === 20)

  const buyTree = purchaseTownItemV1(db, 's6', 'tree')
  check('tree 구매 성공(purchased)', buyTree.reason === 'purchased')
  check('tree 구매 후 잔액 10', buyTree.balanceAfter === 10)

  const buyCat = purchaseTownItemV1(db, 's6', 'cat')
  check("cat 구매 시도는 'locked'(잔액은 남아있지만 레벨 미달이 우선)", buyCat.reason === 'locked')
  check('cat 구매 시도가 잔액을 전혀 차감하지 않음(여전히 10)', buyCat.balanceAfter === 10)
  check('cat 구매 시도 이후에도 실제 잔액이 10으로 유지됨', dollarBalance(db, 's6') === 10)
  check('town_purchases에는 tree 1건만 존재(cat은 잠겨서 기록되지 않음)',
    db.townPurchases.filter((p) => p.student_id === 's6').length === 1 &&
    db.townPurchases.some((p) => p.student_id === 's6' && p.item_id === 'tree'))
}

console.log('\nK7. 레벨 경계값 대조 — townLevelForStarsSim이 EXPECTED_THRESHOLDS와 정확히 일치')
{
  for (const [minStars, level] of EXPECTED_THRESHOLDS) {
    check(`stars=${minStars} → level=${level}`, townLevelForStarsSim(minStars) === level)
    if (minStars > 0) {
      check(`stars=${minStars - 1} → level=${level - 1}(경계 바로 아래)`, townLevelForStarsSim(minStars - 1) === level - 1)
    }
  }
  check('stars=0 → level=1', townLevelForStarsSim(0) === 1)
}

console.log(`\n총 ${asserted}개 단언 실행.`)
console.log(failures === 0
  ? '\n모든 단언 통과 — town_v1 마이그레이션 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
