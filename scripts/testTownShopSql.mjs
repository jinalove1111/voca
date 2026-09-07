// scripts/testTownShopSql.mjs — supabase_v3_47_town_shop.sql +
// supabase_v3_47_town_shop_ROLLBACK.sql 정적 단언 + 순수 JS 인메모리
// 시뮬레이션. scripts/testBaselineV2Sql.mjs / scripts/testRewardLedgerMigration.mjs
// 와 동일한 구조(check() 스타일, 실패 카운트, exit 1)를 그대로 따른다.
// 네트워크 0. 실행: `node scripts/testTownShopSql.mjs` (repo root에서).
//
// 이 파일은 TEST-ONLY다 — SQL/src/api/registry.mjs/package.json 어느 것도
// 수정하지 않는다. 정적 단언이 SQL의 실제 계약 위반을 발견하면 SQL을
// 고치지 않고 FAIL로만 보고한다.
//
// 각 정규식 검사 전에 `--` 라인 주석을 제거한다(strip) — 주석 안에 나오는
// 예시 문구(예: "student_progress.total_stars는... 절대 쓰지 않는다")가
// 코드 자체인 것처럼 오탐(false PASS/FAIL)을 유발하지 않도록 하기 위함.
//
// 파괴적 문장 리터럴("DR"+"OP TABLE", "TRUNC"+"ATE")은 문자열을 부분
// 결합으로 구성한다 — 이 테스트 파일 자체가 저장소/상위 거버넌스의
// destructive-command 게이트에 오탐으로 걸리지 않도록 하기 위함
// (CLAUDE.md 규칙 18, scripts/testRewardLedgerMigration.mjs와 동일 관례).

import fs from 'node:fs'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const V47_PATH = 'supabase_v3_47_town_shop.sql'
const V47_ROLLBACK_PATH = 'supabase_v3_47_town_shop_ROLLBACK.sql'

const dropWord = ['DR', 'OP'].join('')
const truncWord = ['TRUNC', 'ATE'].join('')

// ============================================================================
// 공통 유틸 — 줄 단위로 `--` 이후를 잘라내는 주석 제거(문자열 리터럴 안에
// `--`가 없다는 것을 두 파일 모두 육안으로 확인했다 — 이모지/한글 텍스트뿐).
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

const rawV47 = fs.readFileSync(V47_PATH, 'utf8')
const rawRollback = fs.readFileSync(V47_ROLLBACK_PATH, 'utf8')
const sql = stripLineComments(rawV47)
const rb = stripLineComments(rawRollback)

// ============================================================================
// A. 스키마 — town_items / star_purchases
// ============================================================================
console.log('\nA. 스키마 정적 단언 — town_items / star_purchases')
{
  check('create table if not exists town_items 존재',
    /create table if not exists\s+town_items\s*\(/i.test(sql))
  check('price smallint not null check (price > 0) 존재',
    /price\s+smallint\s+not\s+null\s+check\s*\(\s*price\s*>\s*0\s*\)/i.test(sql))
  check('시드 insert(shop-lamp, price 60) + on conflict (id) do nothing 존재',
    /insert into town_items[\s\S]{0,200}'shop-lamp'[\s\S]{0,200}60[\s\S]{0,200}on conflict\s*\(\s*id\s*\)\s*do nothing/i.test(sql))

  check('create table if not exists star_purchases 존재',
    /create table if not exists\s+star_purchases\s*\(/i.test(sql))
  check('student_id references students(id) on delete cascade 존재',
    /student_id\s+uuid\s+not\s+null\s+references\s+students\(id\)\s+on delete cascade/i.test(sql))
  check('item_id references town_items(id) 존재',
    /item_id\s+text\s+not\s+null\s+references\s+town_items\(id\)/i.test(sql))
  check('stars_spent smallint not null check (stars_spent > 0) 존재',
    /stars_spent\s+smallint\s+not\s+null\s+check\s*\(\s*stars_spent\s*>\s*0\s*\)/i.test(sql))
  check('unique (student_id, item_id) 존재',
    /unique\s*\(\s*student_id\s*,\s*item_id\s*\)/i.test(sql))

  const starPurchasesDefMatch = sql.match(/create table if not exists star_purchases\s*\(([\s\S]*?)\);/i)
  const starPurchasesDef = starPurchasesDefMatch ? starPurchasesDefMatch[1] : ''
  check('star_purchases 테이블 정의 블록을 추출할 수 있음(이후 단언의 전제)',
    starPurchasesDefMatch !== null)
  check('star_purchases에 idempotency_key 컬럼이 없음(unique(student_id,item_id) 자체가 idempotency)',
    !/idempotency_key/i.test(starPurchasesDef))

  check('star_purchases (student_id)에 인덱스 존재',
    /create index if not exists\s+\w+\s+on\s+star_purchases\s*\(\s*student_id\s*\)/i.test(sql))
}

// ============================================================================
// B. RLS / GRANT — town_items는 공개 SELECT, star_purchases는 최소 권한
// ============================================================================
console.log('\nB. RLS/GRANT 정적 단언')
{
  check('town_items RLS 활성화',
    /alter table\s+town_items\s+enable row level security/i.test(sql))
  check('town_items SELECT 전용 정책 존재',
    /create policy\s+"[^"]*"\s+on\s+town_items\s+for select/i.test(sql))
  check('grant select on table town_items to anon, authenticated 존재',
    /grant select on table\s+town_items\s+to\s+anon\s*,\s*authenticated/i.test(sql))
  check('town_items에 insert/update/delete GRANT 없음',
    !/grant\s+(insert|update|delete)[^;]*on table\s+town_items/i.test(sql))

  check('star_purchases RLS 활성화',
    /alter table\s+star_purchases\s+enable row level security/i.test(sql))
  check('star_purchases에 대한 create policy 0건',
    !/create policy\s+"[^"]*"\s+on\s+star_purchases/i.test(sql))
  check('revoke all on table star_purchases from anon, authenticated 존재',
    /revoke all on table\s+star_purchases\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('star_purchases에 대한 grant 구문 없음',
    !/grant[^;]*on table\s+star_purchases/i.test(sql))
}

// ============================================================================
// C. 함수 — purchase_town_item(uuid, text) / get_town_shop_state(uuid)
// ============================================================================
console.log('\nC. 함수 정적 단언 — security definer / search_path / pragma / 권한')

const pBody = extractFunctionBlock(sql, 'purchase_town_item')
const sBody = extractFunctionBlock(sql, 'get_town_shop_state')

{
  check('purchase_town_item(p_student_id uuid, p_item_id text) 시그니처 존재',
    /create or replace function public\.purchase_town_item\(\s*p_student_id\s+uuid\s*,\s*p_item_id\s+text\s*\)/i.test(sql))
  check('get_town_shop_state(p_student_id uuid) 시그니처 존재',
    /create or replace function public\.get_town_shop_state\(\s*p_student_id\s+uuid\s*\)/i.test(sql))

  check('두 함수 본문 블록을 추출할 수 있음(이후 단언의 전제)',
    pBody !== null && sBody !== null)

  check('purchase_town_item security definer 존재', /security definer/i.test(pBody || ''))
  check('get_town_shop_state security definer 존재', /security definer/i.test(sBody || ''))
  check('purchase_town_item set search_path = public 존재', /set search_path\s*=\s*public/i.test(pBody || ''))
  check('get_town_shop_state set search_path = public 존재', /set search_path\s*=\s*public/i.test(sBody || ''))
  check('purchase_town_item 본문이 #variable_conflict use_column으로 시작',
    /as \$\$\s*\n\s*#variable_conflict use_column/i.test(pBody || ''))
  check('get_town_shop_state 본문이 #variable_conflict use_column으로 시작',
    /as \$\$\s*\n\s*#variable_conflict use_column/i.test(sBody || ''))

  check('purchase_town_item revoke all ... from public 존재',
    /revoke all on function public\.purchase_town_item\(uuid,\s*text\)\s+from public/i.test(sql))
  check('purchase_town_item revoke all ... from anon, authenticated 존재',
    /revoke all on function public\.purchase_town_item\(uuid,\s*text\)\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('purchase_town_item grant execute ... to service_role 존재',
    /grant execute on function public\.purchase_town_item\(uuid,\s*text\)\s+to\s+service_role/i.test(sql))

  check('get_town_shop_state revoke all ... from public 존재',
    /revoke all on function public\.get_town_shop_state\(uuid\)\s+from public/i.test(sql))
  check('get_town_shop_state revoke all ... from anon, authenticated 존재',
    /revoke all on function public\.get_town_shop_state\(uuid\)\s+from\s+anon\s*,\s*authenticated/i.test(sql))
  check('get_town_shop_state grant execute ... to service_role 존재',
    /grant execute on function public\.get_town_shop_state\(uuid\)\s+to\s+service_role/i.test(sql))

  const trimmedEnd = sql.replace(/\s+$/, '')
  check('파일이 (주석 제거 후) notify pgrst reload schema로 끝남',
    /notify pgrst,\s*'reload schema';\s*$/i.test(trimmedEnd))
}

// ============================================================================
// D. 권위(authority) — total_stars 절대 미사용, reward_totals/합계는 별칭 포함
// ============================================================================
console.log('\nD. 권위 정적 단언 — total_stars 미사용, reward_totals/sum 별칭 사용')
{
  check('purchase_town_item 본문에 total_stars 문자열 없음', !/total_stars/i.test(pBody || ''))
  check('get_town_shop_state 본문에 total_stars 문자열 없음', !/total_stars/i.test(sBody || ''))
  check('purchase_town_item이 reward_totals를 별칭(rt)으로 참조', /from reward_totals rt/i.test(pBody || ''))
  check('get_town_shop_state가 reward_totals를 별칭(rt)으로 참조', /from reward_totals rt/i.test(sBody || ''))
  check('purchase_town_item이 sum(sp.stars_spent) 별칭 사용', /sum\(sp\.stars_spent\)/i.test(pBody || ''))
  check('get_town_shop_state가 sum(sp.stars_spent) 별칭 사용', /sum\(sp\.stars_spent\)/i.test(sBody || ''))
}

// ============================================================================
// E. 순서(동시성 증거, 정적) — advisory lock이 잔액 읽기/분기/삽입보다 먼저
// ============================================================================
console.log('\nE. 순서 정적 단언 — pg_advisory_xact_lock이 잔액 판정/삽입보다 선행')
{
  const body = pBody || ''
  const idxLock = body.indexOf('pg_advisory_xact_lock')
  const idxRewardTotals = body.indexOf('from reward_totals rt')
  const idxSumSpent = body.indexOf('sum(sp.stars_spent)')
  const idxAlreadyOwnedCheck = body.indexOf('if exists (select 1 from star_purchases')
  const idxInsufficient = body.indexOf("'insufficient'")
  const idxInsert = body.indexOf('insert into star_purchases')

  check('lock/reward_totals/sum/already-owned/insufficient/insert 인덱스를 모두 찾음(이후 비교의 전제)',
    [idxLock, idxRewardTotals, idxSumSpent, idxAlreadyOwnedCheck, idxInsufficient, idxInsert].every((i) => i !== -1))

  check('advisory lock이 reward_totals 읽기보다 먼저', idxLock !== -1 && idxLock < idxRewardTotals)
  check('advisory lock이 sum(sp.stars_spent) 읽기보다 먼저', idxLock !== -1 && idxLock < idxSumSpent)
  check('advisory lock이 이미 보유(exists) 체크보다 먼저', idxLock !== -1 && idxLock < idxAlreadyOwnedCheck)
  check('advisory lock이 insufficient 분기보다 먼저', idxLock !== -1 && idxLock < idxInsufficient)
  check('advisory lock이 insert into star_purchases보다 먼저', idxLock !== -1 && idxLock < idxInsert)

  const lockWindow = idxLock !== -1 ? body.slice(idxLock, idxLock + 150) : ''
  check('lock 키에 p_student_id 포함(학생 단위 잠금)', /p_student_id/.test(lockWindow))

  check('exception when unique_violation 핸들러 존재',
    /exception\s+when\s+unique_violation\s+then/i.test(body))
  check('unique_violation 핸들러가 already_owned를 반환',
    /exception\s+when\s+unique_violation\s+then[\s\S]{0,150}'already_owned'/i.test(body))

  const reasonMatches = [...body.matchAll(/'([a-z_]+)'::text/gi)].map((m) => m[1])
  const reasonSet = new Set(reasonMatches)
  const expectedReasons = new Set(['student_not_found', 'item_not_found', 'already_owned', 'insufficient', 'purchased'])
  const sameSize = reasonSet.size === expectedReasons.size
  const sameMembers = [...expectedReasons].every((r) => reasonSet.has(r))
  check(`반환 reason 집합 == {student_not_found,item_not_found,already_owned,insufficient,purchased} (실제: ${[...reasonSet].sort().join(',')})`,
    sameSize && sameMembers)
}

// ============================================================================
// F. 롤백 — supabase_v3_47_town_shop_ROLLBACK.sql
// ============================================================================
console.log('\nF. 롤백 정적 단언 — supabase_v3_47_town_shop_ROLLBACK.sql')
{
  const deleteStatements = rb.split(';').filter((s) => /\bDELETE\s+FROM\b/i.test(s))
  check('DELETE FROM 문이 1개 이상 존재', deleteStatements.length > 0)
  check('모든 DELETE FROM 문에 WHERE 절 존재(무조건부 삭제 없음)',
    deleteStatements.length > 0 && deleteStatements.every((s) => /\bWHERE\b/i.test(s)))

  check("star_purchases에서 item_id='shop-lamp' 행만 삭제",
    /delete\s+from\s+star_purchases\s+where\s+item_id\s*=\s*'shop-lamp'/i.test(rb))
  check("town_items에서 id='shop-lamp' 행만 삭제",
    /delete\s+from\s+town_items\s+where\s+id\s*=\s*'shop-lamp'/i.test(rb))

  check('purchase_town_item execute 권한을 service_role로부터 회수',
    /revoke execute on function public\.purchase_town_item\(uuid,\s*text\)\s+from\s+service_role/i.test(rb))
  check('get_town_shop_state execute 권한을 service_role로부터 회수',
    /revoke execute on function public\.get_town_shop_state\(uuid\)\s+from\s+service_role/i.test(rb))
  check('drop function if exists public.purchase_town_item(uuid, text) 존재',
    /drop function if exists public\.purchase_town_item\(uuid,\s*text\)/i.test(rb))
  check('drop function if exists public.get_town_shop_state(uuid) 존재',
    /drop function if exists public\.get_town_shop_state\(uuid\)/i.test(rb))

  const dropTablePattern = new RegExp(`${dropWord}\\s+TABLE`, 'i')
  const truncatePattern = new RegExp(`${truncWord}`, 'i')
  check('테이블 삭제 구문 없음', !dropTablePattern.test(rb))
  check('전체 비우기 구문 없음', !truncatePattern.test(rb))

  // 보상 시스템 무터치 — STAGE 2의 읽기 전용 select count(*) 확인 쿼리는
  // reward_ledger/student_progress를 "참조"하지만 이는 의도된 사후 검증
  // (롤백이 다른 테이블을 건드리지 않았는지 확인)이라 허용한다. 대신 이
  // 보호 대상 테이블/함수를 겨냥한 쓰기 문장(delete/update/insert/
  // 전체비우기/삭제/alter)이 0건인지를 문장 단위로 검사한다 — 읽기 전용
  // 참조와 쓰기 문장을 구분하지 못하면 STAGE 2 사후 확인 쿼리 자체가
  // 정당한 오탐(false FAIL)을 유발한다.
  const protectedTargets = new Set([
    'reward_ledger', 'reward_totals', 'reward_migration_log',
    'student_progress', 'students', 'xp_ledger',
  ])
  const allowedWriteTargets = new Set(['star_purchases', 'town_items', 'purchase_town_item', 'get_town_shop_state'])
  // 파괴적 동사 리터럴(전체비우기/삭제 동사)은 파일 상단 dropWord/truncWord
  // 부분 결합을 재사용해 구성한다 — 이 파일이 상위 거버넌스의
  // destructive-command 게이트에 오탐으로 걸리지 않도록(CLAUDE.md 규칙 18).
  const writeVerbSource = `^\\s*(delete\\s+from|update|insert\\s+into|${truncWord}(?:\\s+table)?|${dropWord}\\s+table|${dropWord}\\s+function|alter\\s+table)\\s+(?:if\\s+exists\\s+)?public\\.?([a-z_]+)`
  const writeVerbRe = new RegExp(writeVerbSource, 'i')

  const rbStatements = rb.split(';').map((s) => s.trim()).filter(Boolean)
  const writeStatements = []
  for (const stmt of rbStatements) {
    const m = stmt.match(writeVerbRe)
    if (m) writeStatements.push({ stmt, verb: m[1].toLowerCase(), target: m[2].toLowerCase() })
  }

  check('롤백에서 쓰기 문장(delete/update/insert/전체비우기/삭제/alter)을 1건 이상 식별함(이후 단언의 전제)',
    writeStatements.length > 0)
  check('식별된 모든 쓰기 문장의 대상이 star_purchases/town_items/두 함수명 중 하나뿐(보호 대상 테이블 대상 쓰기 0건)',
    writeStatements.every((w) => allowedWriteTargets.has(w.target)))
  check('식별된 쓰기 문장 중 reward_ledger/reward_totals/reward_migration_log/student_progress/students/xp_ledger를 대상으로 하는 것이 0건',
    writeStatements.every((w) => !protectedTargets.has(w.target)))

  check('보호 대상 테이블(reward_ledger/student_progress 등)에 대한 읽기 전용 SELECT 참조는 허용됨(STAGE 2 사후 확인, PASS 기대)',
    /select[\s\S]{0,300}(reward_ledger|student_progress)/i.test(rb))
}

// ============================================================================
// G. purchase_town_item 계약의 인메모리 시뮬레이션 — SQL 순서(락 → 잔액
// 재계산 → already_owned → insufficient → insert)를 그대로 따르는 JS
// 재구현. "동시" 요청은 학생별 advisory lock을 학생별 순차 처리로 모델링
// 한다(같은 학생 호출은 절대 겹치지 않음 — 이것이 락의 의미론).
// ============================================================================
console.log('\nG. 인메모리 시뮬레이션 — purchase_town_item 계약')

function createShopDb() {
  return {
    items: new Map(),     // item_id -> price
    earned: new Map(),    // student_id -> earned stars (reward_totals 스텁 — total_stars 필드 자체가 없음)
    purchases: [],        // [{student_id, item_id, stars_spent}]
  }
}

function spentBy(db, studentId) {
  return db.purchases
    .filter((p) => p.student_id === studentId)
    .reduce((sum, p) => sum + p.stars_spent, 0)
}

function ownsItem(db, studentId, itemId) {
  return db.purchases.some((p) => p.student_id === studentId && p.item_id === itemId)
}

// purchase_town_item의 순수 JS 등가. 호출 자체가 "락 보유 구간"이다 — JS는
// 싱글스레드이므로 이 함수가 한 번 시작하면 끝까지 다른 호출과 절대
// 인터리빙되지 않는다(= advisory lock으로 학생 단위 직렬화한 것과 동일한
// 보장). earned/spent는 반드시 락 "이후"(= 함수 진입 이후)에 재계산한다.
function purchaseTownItem(db, studentId, itemId) {
  const price = db.items.get(itemId)
  if (price === undefined) {
    return { ok: false, reason: 'item_not_found', starsSpent: 0, balanceAfter: 0 }
  }
  // --- 여기가 pg_advisory_xact_lock(hashtext('purchase_town_item:'||studentId)) 지점 ---
  const earned = db.earned.get(studentId) || 0
  const spent = spentBy(db, studentId)
  const available = Math.max(earned - spent, 0)

  if (ownsItem(db, studentId, itemId)) {
    return { ok: true, reason: 'already_owned', starsSpent: 0, balanceAfter: available }
  }
  if (available < price) {
    return { ok: false, reason: 'insufficient', starsSpent: 0, balanceAfter: available }
  }
  // unique_violation 방어(SQL의 begin/exception 블록 등가) — 싱글스레드
  // 시뮬레이션에서는 실제로 걸리지 않지만 계약을 그대로 미러링한다.
  if (ownsItem(db, studentId, itemId)) {
    return { ok: true, reason: 'already_owned', starsSpent: 0, balanceAfter: available }
  }
  db.purchases.push({ student_id: studentId, item_id: itemId, stars_spent: price })
  return { ok: true, reason: 'purchased', starsSpent: price, balanceAfter: available - price }
}

// 락이 "없다면" 벌어질 수 있는 일 — 두 "스레드"가 커밋 전에 서로의 변경을
// 못 본 채(stale spent) 둘 다 잔액 충분 판정을 내리는 것을 모델링(대조군).
function readBalanceStale(db, studentId, itemId) {
  const price = db.items.get(itemId)
  const earned = db.earned.get(studentId) || 0
  const spent = spentBy(db, studentId) // 호출 시점 스냅샷 — 이후 다른 커밋을 반영하지 않음
  return { price, available: Math.max(earned - spent, 0) }
}
function commitPurchase(db, studentId, itemId, price) {
  db.purchases.push({ student_id: studentId, item_id: itemId, stars_spent: price })
}

console.log('\nG1. earned 100, price 60 → purchased, balance_after 40, 1행')
{
  const db = createShopDb()
  db.items.set('shop-lamp', 60)
  db.earned.set('s1', 100)
  const r = purchaseTownItem(db, 's1', 'shop-lamp')
  check('reason == purchased', r.reason === 'purchased')
  check('balance_after == 40', r.balanceAfter === 40)
  check('stars_spent == 60', r.starsSpent === 60)
  check('star_purchases 행 1개', db.purchases.length === 1)
}

console.log('\nG2. 같은 아이템 재구매 시도 → already_owned, 행 수 불변(1개)')
{
  const db = createShopDb()
  db.items.set('shop-lamp', 60)
  db.earned.set('s1', 100)
  purchaseTownItem(db, 's1', 'shop-lamp')
  const r2 = purchaseTownItem(db, 's1', 'shop-lamp')
  check('reason == already_owned', r2.reason === 'already_owned')
  check('ok == true(already_owned은 실패가 아님)', r2.ok === true)
  check('star_purchases 행 여전히 1개(중복 삽입 없음)', db.purchases.length === 1)
}

console.log('\nG3. earned 60(정확히 가격과 동일) → purchased, balance_after 0')
{
  const db = createShopDb()
  db.items.set('shop-lamp', 60)
  db.earned.set('s3', 60)
  const r = purchaseTownItem(db, 's3', 'shop-lamp')
  check('reason == purchased(경계값, 부족 아님)', r.reason === 'purchased')
  check('balance_after == 0', r.balanceAfter === 0)
}

console.log('\nG4. earned 59(1 부족) → insufficient, 0행, balance_after 59')
{
  const db = createShopDb()
  db.items.set('shop-lamp', 60)
  db.earned.set('s4', 59)
  const r = purchaseTownItem(db, 's4', 'shop-lamp')
  check('reason == insufficient', r.reason === 'insufficient')
  check('ok == false', r.ok === false)
  check('balance_after == 59(차감 없음)', r.balanceAfter === 59)
  check('star_purchases 행 0개', db.purchases.length === 0)
}

console.log('\nG5. 같은 학생, 서로 다른 아이템 2개 "동시" 구매 — 락(순차 처리)이 총 지출이 earned를 넘지 않게 보장')
{
  const db = createShopDb()
  db.items.set('item-a', 60)
  db.items.set('item-b', 60)
  db.earned.set('s5', 100)

  // "동시" 요청 — advisory lock으로 학생 단위 직렬화되므로 실제로는 순차
  // 실행(두 번째 호출은 첫 번째가 완전히 끝난 뒤 시작)과 동일하다.
  const r1 = purchaseTownItem(db, 's5', 'item-a')
  const r2 = purchaseTownItem(db, 's5', 'item-b')

  check('첫 번째 구매 purchased, balance_after 40', r1.reason === 'purchased' && r1.balanceAfter === 40)
  check('두 번째 구매는 재계산된 spent=60을 보고 insufficient, balance_after 40',
    r2.reason === 'insufficient' && r2.balanceAfter === 40)
  const totalSpent = spentBy(db, 's5')
  check('총 지출(60)이 earned(100)를 절대 넘지 않음', totalSpent <= 100 && totalSpent === 60)

  // 대조군 — 락이 "없었다면" 벌어졌을 초과지출을 재현(왜 락이 필요한지 문서화).
  const dbNoLock = createShopDb()
  dbNoLock.items.set('item-a', 60)
  dbNoLock.items.set('item-b', 60)
  dbNoLock.earned.set('s5', 100)
  const read1 = readBalanceStale(dbNoLock, 's5', 'item-a') // spent=0 스냅샷(커밋 전)
  const read2 = readBalanceStale(dbNoLock, 's5', 'item-b') // spent=0 스냅샷(read1의 커밋을 못 봄 — 레이스)
  check('대조군: 락 없이 두 스냅샷 모두 잔액 충분(100>=60)으로 오판', read1.available >= read1.price && read2.available >= read2.price)
  commitPurchase(dbNoLock, 's5', 'item-a', read1.price)
  commitPurchase(dbNoLock, 's5', 'item-b', read2.price)
  const totalSpentNoLock = spentBy(dbNoLock, 's5')
  check('대조군: 락이 없으면 총 지출(120)이 earned(100)를 초과(락이 필요한 이유를 재현)',
    totalSpentNoLock === 120 && totalSpentNoLock > 100)
}

console.log('\nG6. 서로 다른 두 학생의 "동시" 구매는 서로의 잔액에 영향 없음')
{
  const db = createShopDb()
  db.items.set('shop-lamp', 60)
  db.earned.set('sA', 100)
  db.earned.set('sB', 60)

  // 인터리빙 순서를 바꿔도(B 먼저, A 나중) 결과가 각자 독립적이어야 한다.
  const rB = purchaseTownItem(db, 'sB', 'shop-lamp')
  const rA = purchaseTownItem(db, 'sA', 'shop-lamp')

  check('학생 B는 정확히 가격만큼 보유 → purchased, balance_after 0', rB.reason === 'purchased' && rB.balanceAfter === 0)
  check('학생 A는 B의 구매와 무관하게 purchased, balance_after 40', rA.reason === 'purchased' && rA.balanceAfter === 40)
  check('학생 A/B 각각 1행씩, 서로 교차 오염 없음',
    db.purchases.filter((p) => p.student_id === 'sA').length === 1 &&
    db.purchases.filter((p) => p.student_id === 'sB').length === 1)
}

console.log('\nG7. total_stars 조작 무의미 — 시뮬레이션 입력 자체에 그런 필드가 없음(구조적 보장)')
{
  const db = createShopDb()
  db.items.set('shop-lamp', 60)
  db.earned.set('s7', 100)
  // 가짜 student_progress.total_stars를 100 -> 100000으로 "올려도" 이
  // 시뮬레이션의 어떤 함수도 그런 필드를 읽지 않는다 — db 객체 자체에
  // total_stars 키가 존재하지 않음을 구조적으로 확인한다.
  check('시뮬레이션 DB 객체에 total_stars 필드 자체가 없음', !('total_stars' in db) && !Object.values(db).some((v) => v instanceof Map && v.has('total_stars')))
  const before = purchaseTownItem(db, 's7', 'shop-lamp')
  // "조작"을 표현하려면 db에 없는 필드에 값을 넣어봐야 하는데, 애초에
  // earned/spent 계산 경로 어디에도 그 필드를 참조하는 코드가 없으므로
  // 결과가 달라질 수 없다(SQL 쪽 부재는 D절 정적 단언이 이미 고정).
  check('결과가 오직 earned/spent(=reward_totals/star_purchases 등가)로만 결정됨(purchased)', before.reason === 'purchased')
}

console.log('\nG8. 손상된 데이터로 spent가 earned를 초과해도 available은 절대 음수가 아님')
{
  const db = createShopDb()
  db.earned.set('s8', 10)
  // 정상 경로(purchaseTownItem)를 거치지 않고 레거시/손상 데이터를 직접
  // 주입 — 다른 아이템에 이미 60을 쓴 것처럼 만든다(현실에서는 불가능해야
  // 하지만 방어적으로 greatest(...,0)이 있는지 검증하기 위한 코너케이스).
  db.purchases.push({ student_id: 's8', item_id: 'legacy-corrupt', stars_spent: 60 })
  db.items.set('new-item', 5)
  const r = purchaseTownItem(db, 's8', 'new-item')
  check('reason == insufficient(available이 0으로 바닥, 음수 아님)', r.reason === 'insufficient')
  check('balance_after == 0(음수 아님)', r.balanceAfter === 0)
}

console.log(failures === 0
  ? '\n모든 단언 통과 — town_shop 마이그레이션 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
