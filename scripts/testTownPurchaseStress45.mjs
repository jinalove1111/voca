// scripts/testTownPurchaseStress45.mjs
//
// QA 하네스(2026-09-11, qa/overnight-town-2026-09-11) — "구매 동시성
// stress 5/10/20/45" — Paul Town V1(supabase_v3_50_town_v1.sql, 미실행)의
// purchase_town_item RPC가 5/10/20/45명 동시 학생 규모에서 폴달러 잔액
// 무결성(음수 없음/이중 차감 없음/중복 소유 없음/유실 없음/교차 학생 오염
// 없음)을 지키는지 순수 JS 인메모리 시뮬레이션으로 스트레스 테스트한다.
//
// ⚠️ 정직한 고지(scripts/testTownV1Sql.mjs와 동일한 관례) — 이 파일은
// 실제 PostgreSQL 트랜잭션/pg_advisory_xact_lock을 구동하지 않는다. 진짜
// 원자성은 Postgres 엔진 자체에 있고, 여기서는 그 계약(RPC 문장 순서 +
// 학생 단위 advisory lock의 직렬화 의미론)을 JS Promise 체인으로 최대한
// 충실히 미러링해 "설계가 이 순서대로라면 경합이 이렇게 수렴해야 한다"를
// 검증할 뿐이다. 실제 배포 후에는 Postgres 자체의 동시성 테스트(pgbench
// 등)로 재확인이 필요하다 — 이 파일이 그 자리를 대신하지 않는다.
//
// ── 미러링 대상: supabase_v3_50_town_v1.sql 170-282행 ────────────────────
// (create or replace function public.purchase_town_item(p_student_id uuid,
// p_item_id text) 시작 170행 ~ 본문 종료 `$$;` 278행 ~ revoke/grant
// 280-282행). 아래 0절이 이 파일 안에서 그 문장 순서를 정규식으로 재추출해
// 시뮬레이터 코드의 분기 순서와 대조한다(드리프트 가드) — 실제 순서:
//   1) 학생 존재 확인(student_not_found)
//   2) 아이템 조회(price/price_currency/min_level) — item_not_found
//   3) 화폐 검사(price_currency<>'dollars') — item_not_purchasable
//   3-b) [town_v1 신규] town_level_for_stars(reward_totals.earned_stars)
//        계산 후 min_level > level이면 locked (advisory lock 이전!)
//   4) pg_advisory_xact_lock(hashtext('purchase_town_item:'||student_id))
//      — 학생 단위 직렬화(이 파일 1절 withStudentLock이 promise 체인으로
//      재현). 아이템은 잠금 키에 포함되지 않으므로 같은 학생의 서로 다른
//      아이템 요청끼리도 이 지점에서 직렬화된다.
//   5) dollar_balances에서 잔액 재계산(잠금 이후에만 신뢰)
//   6) already_owned = star_purchases ∪ town_purchases 존재 여부
//   7) insufficient = 잔액 < 가격
//   8) town_purchases + dollar_ledger 두 INSERT(원자적 단일 트랜잭션 —
//      unique_violation(student_id,item_id 또는 idempotency_key 충돌) 시
//      already_owned로 수렴)
//
// ── src/api/sql 무수정 ───────────────────────────────────────────────────
// 이 파일은 TEST-ONLY다. src/, api/, supabase_v3_50_town_v1.sql 어느 것도
// 읽기 이외의 방식으로 건드리지 않는다. 시뮬레이션이 RPC 설계상의 실제
// 결함을 재현하면(예: 위 3-b가 advisory lock보다 먼저라 잠긴 아이템은
// 잔액 경합에 전혀 관여하지 않는 것 자체는 설계 의도이므로 결함이 아님)
// SQL을 고치지 않고 FAIL로만 보고한다 — 지시사항에 따라 실제 결함이
// 발견되면 이 파일은 중단하고 사람에게 보고한다(이번 실행에서는 해당 없음,
// 아래 결과 참고).
//
// ── 스타일 재사용(재구현 아님, CLAUDE.md 규칙 3) ─────────────────────────
// · scripts/testTownV1Sql.mjs — townLevelForStarsSim 임계값/ownsItem(union)/
//   dollarBalance 파생 로직을 동일하게(값도 동일) 유지한다 — 새로 추측하지
//   않음.
// · scripts/testRewardStress45.mjs — 동시성 레벨(5/10/20/45)별 DB 완전
//   리셋 + 레벨별 표 누적 + check()/asserted/failures 카운터 스타일을
//   그대로 따른다.
//
// 네트워크 0, production 요청 0, 실제 Supabase 접촉 0, git/DDL 실행 0.
// 실행: `node scripts/testTownPurchaseStress45.mjs` (repo root에서).

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')
const V50_PATH = path.join(ROOT, 'supabase_v3_50_town_v1.sql')

let failures = 0
let asserted = 0
function check(label, cond, detail) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failures++ }
}

function tick() { return new Promise((r) => setImmediate(r)) }
function jitter(maxMs) { return new Promise((r) => setTimeout(r, Math.random() * maxMs)) }

// ============================================================================
// 0. 순서 충실성 — 이 파일의 시뮬레이터가 실제 RPC 문장 순서(위 헤더
//    170-282행 요약)를 정확히 미러링하는지 정규식 대조로 고정한다.
// ============================================================================
console.log('=== 0. SQL 문장 순서 대조 (supabase_v3_50_town_v1.sql purchase_town_item, 170-282행) ===')
{
  const rawSql = fs.readFileSync(V50_PATH, 'utf8')
  const startIdx = rawSql.indexOf('create or replace function public.purchase_town_item(')
  const endIdx = startIdx === -1 ? -1 : rawSql.indexOf('\n$$;', startIdx)
  check('purchase_town_item 본문을 파일에서 추출할 수 있음(이후 순서 대조의 전제)', startIdx !== -1 && endIdx !== -1)
  const body = startIdx !== -1 && endIdx !== -1 ? rawSql.slice(startIdx, endIdx + 4) : ''

  const markers = [
    ["'item_not_purchasable'", body.indexOf("'item_not_purchasable'")],
    ['town_level_for_stars(', body.indexOf('town_level_for_stars(')],
    ["'locked'", body.indexOf("'locked'")],
    ['pg_advisory_xact_lock', body.indexOf('pg_advisory_xact_lock')],
    ['star_purchases sp', body.indexOf('star_purchases sp')],
    ["'insufficient'", body.indexOf("'insufficient'")],
    ['insert into town_purchases', body.indexOf('insert into town_purchases')],
    ['insert into dollar_ledger', body.indexOf('insert into dollar_ledger')],
  ]
  check('순서 대조에 필요한 8개 마커를 모두 찾음', markers.every(([, i]) => i !== -1))
  for (let i = 1; i < markers.length; i++) {
    check(`SQL 순서 유지: "${markers[i - 1][0]}" 가 "${markers[i][0]}" 보다 먼저 등장`, markers[i - 1][1] < markers[i][1])
  }
}

// ============================================================================
// 1. 인메모리 DB + purchase_town_item 등가 함수 — 학생별 advisory lock을
//    promise 체인으로 구현(같은 studentId로 들어오는 모든 호출은 이 지점
//    에서 직렬화되고, 다른 studentId끼리는 완전 병렬). 잠금 이전 단계
//    (학생 확인/아이템 조회/화폐 검사/레벨 잠금)는 직렬화하지 않는다 —
//    실제 SQL도 advisory lock 이전에는 아무 자원도 잠그지 않는다.
// ============================================================================
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

function createDb() {
  return {
    dollarLedger: [],   // {student_id, event_type, dollars_delta, source_type, source_id, idempotency_key}
    townPurchases: [],  // {student_id, item_id, currency, price_paid}
    starPurchases: [],  // 항상 빈 배열(레거시 별 구매 없음) — union 검사 재현용
    townItems: new Map(), // item_id -> {price, currency, active, minLevel}
    students: new Set(),
    rewardTotals: new Map(), // student_id -> earned_stars(전부 0 = 레벨1, 이 테스트는 돈 경합이 목적)
    locks: new Map(),   // student_id -> promise 체인 tail(advisory lock 재현)
    positiveSeeded: new Map(), // student_id -> 누적 양수 시드 합계(불변식 검증용)
  }
}
function earnedStars(db, sid) { return db.rewardTotals.get(sid) || 0 }
function dollarBalance(db, sid) {
  return db.dollarLedger.filter((d) => d.student_id === sid).reduce((s, d) => s + d.dollars_delta, 0)
}
function ownsItem(db, sid, itemId) {
  return db.starPurchases.some((p) => p.student_id === sid && p.item_id === itemId)
    || db.townPurchases.some((p) => p.student_id === sid && p.item_id === itemId)
}
// 학생별 advisory lock — 같은 studentId로 들어오는 호출을 promise 체인으로
// 직렬화한다(pg_advisory_xact_lock(hashtext('purchase_town_item:'||sid))의
// JS 등가). 실패해도 체인이 끊기지 않도록 tail은 항상 resolve로 남긴다.
function withStudentLock(db, sid, fn) {
  const prevTail = db.locks.get(sid) || Promise.resolve()
  const result = prevTail.then(() => fn())
  db.locks.set(sid, result.then(() => undefined, () => undefined))
  return result
}

async function purchaseTownItemV1(db, studentId, itemId) {
  // 1) 학생 존재 확인.
  if (!db.students.has(studentId)) {
    return { ok: false, reason: 'student_not_found', dollarsSpent: 0, balanceAfter: 0 }
  }
  await tick()
  // 2) 아이템 조회 + 3) 화폐 검사.
  const item = db.townItems.get(itemId)
  if (!item || !item.active) {
    return { ok: false, reason: 'item_not_found', dollarsSpent: 0, balanceAfter: 0 }
  }
  if (item.currency !== 'dollars') {
    return { ok: false, reason: 'item_not_purchasable', dollarsSpent: 0, balanceAfter: 0 }
  }

  await tick()
  // 3-b) 레벨 잠금 — advisory lock 이전, 잠긴 아이템은 어떤 자원도 잠그지 않음.
  const level = townLevelForStarsSim(earnedStars(db, studentId))
  if (item.minLevel > level) {
    const balance = dollarBalance(db, studentId)
    return { ok: false, reason: 'locked', dollarsSpent: 0, balanceAfter: balance }
  }

  // 4) advisory lock 진입 — 이 지점부터 같은 studentId 호출끼리 직렬화.
  return withStudentLock(db, studentId, async () => {
    await tick()
    // 5) 잔액은 잠금 이후에만 재계산(다른 대기 중인 호출의 결과를 반영).
    const balance = dollarBalance(db, studentId)
    // 6) already_owned(star_purchases ∪ town_purchases).
    if (ownsItem(db, studentId, itemId)) {
      return { ok: true, reason: 'already_owned', dollarsSpent: 0, balanceAfter: balance }
    }
    // 7) 잔액 부족.
    if (balance < item.price) {
      return { ok: false, reason: 'insufficient', dollarsSpent: 0, balanceAfter: balance }
    }
    // 8) 두 INSERT(원자적) — unique_violation(student_id,item_id) 대비 belt-and-braces 재확인.
    if (db.townPurchases.some((p) => p.student_id === studentId && p.item_id === itemId)) {
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
  })
}

// ============================================================================
// 2. 픽스처 헬퍼 — "welcome 20 + reward rows" 패턴으로 학생별 양수
//    dollar_ledger 행을 시드해 목표 잔액(10/19/20/35/60 순환, insufficient
//    -race 학생만 지시사항 리터럴대로 9로 강제)을 만든다.
// ============================================================================
function seedPositive(db, sid, amount, label) {
  db.dollarLedger.push({
    student_id: sid,
    event_type: label,
    dollars_delta: amount,
    source_type: 'seed',
    source_id: label,
    idempotency_key: `${sid}:${label}:${crypto.randomUUID()}`,
  })
  db.positiveSeeded.set(sid, (db.positiveSeeded.get(sid) || 0) + amount)
}
function seedStudent(db, sid, targetBalance) {
  db.students.add(sid)
  db.rewardTotals.set(sid, 0) // earned_stars=0 -> level 1(돈 경합이 목적, 레벨은 locked-probe 전용)
  const welcome = Math.min(20, targetBalance)
  seedPositive(db, sid, welcome, 'welcome')
  const remainder = targetBalance - welcome
  if (remainder > 0) seedPositive(db, sid, remainder, 'reward:bonus')
}
function registerItem(db, itemId, price, minLevel) {
  db.townItems.set(itemId, { price, currency: 'dollars', active: true, minLevel })
}

const TECHNIQUES = ['double-click', 'x5-same-item', 'two-items', 'insufficient-race', 'two-device']
const BASE_BALANCES = [10, 19, 20, 35, 60] // 지시사항 리터럴 — "balances vary (10, 19, 20, 35, 60)"

// 학생 1명의 시나리오를 세팅하고, 이 학생이 발사할 (itemId, kind, jitter?)
// 콜 목록을 반환한다. 모든 학생은 항상 "locked-probe" 1건을 추가로 함께
// 발사한다(min_level=99 아이템 — earned_stars=0인 이 학생들에게는 항상
// locked이어야 함 — locked 경로가 advisory lock 이전에서 실제로 잔액/락과
// 무관하게 즉시 반환되는지 매 레벨에서 실측하기 위함).
function setupStudentScenario(db, sid, idx, itemOwner) {
  const technique = TECHNIQUES[idx % 5]
  let baseBalance
  if (technique === 'insufficient-race') {
    baseBalance = 9 // 지시사항 리터럴 — "insufficient race (balance 9, item 10, 3 concurrent)"
  } else {
    baseBalance = BASE_BALANCES[setupStudentScenario._flex % 5]
    setupStudentScenario._flex++
  }
  seedStudent(db, sid, baseBalance)

  const calls = []
  const lockedItemId = `locked-${idx}`
  registerItem(db, lockedItemId, 5, 99)
  itemOwner.set(lockedItemId, sid)
  calls.push({ itemId: lockedItemId, kind: 'locked-probe', technique: 'locked-probe' })

  switch (technique) {
    case 'double-click': {
      const itemId = `dc-${idx}`
      registerItem(db, itemId, baseBalance, 1)
      itemOwner.set(itemId, sid)
      calls.push({ itemId, kind: 'double-click', technique })
      calls.push({ itemId, kind: 'double-click', technique })
      break
    }
    case 'x5-same-item': {
      const itemId = `x5-${idx}`
      registerItem(db, itemId, baseBalance, 1)
      itemOwner.set(itemId, sid)
      for (let k = 0; k < 5; k++) calls.push({ itemId, kind: 'x5-same-item', technique })
      break
    }
    case 'two-items': {
      // itemX+itemY > baseBalance(둘 다는 못 삼), 각각은 <= baseBalance(하나는 됨)
      // -> 처리 순서와 무관하게 항상 "정확히 하나만 성공"으로 수렴.
      const priceX = Math.max(1, Math.ceil(baseBalance * 0.7))
      const priceY = Math.max(1, baseBalance - priceX + 1)
      const itemX = `dualx-${idx}`
      const itemY = `dualy-${idx}`
      registerItem(db, itemX, priceX, 1)
      registerItem(db, itemY, priceY, 1)
      itemOwner.set(itemX, sid)
      itemOwner.set(itemY, sid)
      calls.push({ itemId: itemX, kind: 'two-items', technique })
      calls.push({ itemId: itemY, kind: 'two-items', technique })
      break
    }
    case 'insufficient-race': {
      const itemId = `insf-${idx}`
      registerItem(db, itemId, 10, 1) // 지시사항 리터럴 — item 10
      itemOwner.set(itemId, sid)
      for (let k = 0; k < 3; k++) calls.push({ itemId, kind: 'insufficient-race', technique })
      break
    }
    case 'two-device': {
      const itemId = `td-${idx}`
      registerItem(db, itemId, baseBalance, 1)
      itemOwner.set(itemId, sid)
      calls.push({ itemId, kind: 'two-device', technique, jitter: true })
      calls.push({ itemId, kind: 'two-device', technique, jitter: true })
      break
    }
    default:
      throw new Error(`unhandled technique ${technique}`)
  }
  return calls
}
setupStudentScenario._flex = 0

// ============================================================================
// 3. 메인 매트릭스 — 동시성 레벨 5/10/20/45. 레벨마다 DB를 완전히 새로
//    만들고, 그 레벨의 학생 전원 + 전원의 모든 콜(더블클릭 2건/x5 5건/
//    two-items 2건/insufficient-race 3건/two-device 2건(지터)/locked-probe
//    1건)을 단 한 번의 Promise.all로 동시에 발사한다("교차 학생 병렬성" —
//    학생 단위로 순차 대기하지 않음).
// ============================================================================
const CONCURRENCY_LEVELS = [5, 10, 20, 45]
const STUDENT_POOL = Array.from({ length: 45 }, () => crypto.randomUUID())

const tableRows = []
let grandNeg = 0, grandDouble = 0, grandDup = 0, grandLost = 0, grandLeak = 0, grandErrors = 0

console.log('\n=== 1~3. 동시성 레벨별 구매 스트레스(5/10/20/45명) ===')
for (const N of CONCURRENCY_LEVELS) {
  setupStudentScenario._flex = 0
  const db = createDb()
  const itemOwner = new Map() // item_id -> 정당한 소유 student_id(교차 오염 감사용)
  const batch = STUDENT_POOL.slice(0, N)

  const allCalls = [] // {sid, itemId, kind, technique, promise}
  batch.forEach((sid, idx) => {
    const calls = setupStudentScenario(db, sid, idx, itemOwner)
    for (const c of calls) {
      const invoke = async () => {
        try {
          const r = await purchaseTownItemV1(db, sid, c.itemId)
          return r
        } catch (e) {
          return { __error: String((e && e.message) || e) }
        }
      }
      const promise = c.jitter ? jitter(30).then(invoke) : invoke()
      allCalls.push({ sid, itemId: c.itemId, kind: c.kind, technique: c.technique, promise })
    }
  })

  const results = await Promise.all(allCalls.map((c) => c.promise))
  allCalls.forEach((c, i) => { c.result = results[i] })

  const errorCalls = allCalls.filter((c) => c.result && c.result.__error)
  const okCalls = allCalls.filter((c) => !(c.result && c.result.__error))

  const successCount = okCalls.filter((c) => c.result.reason === 'purchased').length
  const alreadyOwnedCount = okCalls.filter((c) => c.result.reason === 'already_owned').length
  const insufficientCount = okCalls.filter((c) => c.result.reason === 'insufficient').length
  const lockedCount = okCalls.filter((c) => c.result.reason === 'locked').length

  // ── 무결성 지표 계산 ──────────────────────────────────────────────────
  // neg: 어떤 호출 결과의 balanceAfter도 음수가 아니고, 레벨 종료 시점
  //      학생 전원의 실제 잔액도 음수가 아님.
  let neg = okCalls.filter((c) => c.result.balanceAfter < 0).length
  for (const sid of batch) if (dollarBalance(db, sid) < 0) neg++

  // double: 같은 item_id로 dollar_ledger에 purchase: 이벤트 행이 2개 이상.
  const purchaseLedgerByItem = new Map()
  for (const row of db.dollarLedger) {
    if (!row.event_type.startsWith('purchase:')) continue
    const itemId = row.event_type.slice('purchase:'.length)
    purchaseLedgerByItem.set(itemId, (purchaseLedgerByItem.get(itemId) || 0) + 1)
  }
  const double = [...purchaseLedgerByItem.values()].filter((n) => n > 1).length

  // dup: town_purchases에 같은 (student_id,item_id) 조합이 2행 이상.
  const purchaseRowsByKey = new Map()
  for (const row of db.townPurchases) {
    const key = `${row.student_id}::${row.item_id}`
    purchaseRowsByKey.set(key, (purchaseRowsByKey.get(key) || 0) + 1)
  }
  const dup = [...purchaseRowsByKey.values()].filter((n) => n > 1).length

  // lost: ok:true/reason:'purchased'를 반환했는데 실제 town_purchases 행이 없음.
  let lost = 0
  for (const c of okCalls) {
    if (c.result.reason !== 'purchased') continue
    const exists = db.townPurchases.some((p) => p.student_id === c.sid && p.item_id === c.itemId)
    if (!exists) lost++
  }

  // leak: town_purchases/dollar_ledger(purchase:) 행의 student_id가 그
  // item_id의 정당한 소유자(itemOwner)와 다름.
  let leak = 0
  for (const row of db.townPurchases) {
    if (itemOwner.get(row.item_id) !== row.student_id) leak++
  }
  for (const [itemId, row] of purchaseLedgerByItem.entries()) {
    void row
    const ledgerRows = db.dollarLedger.filter((d) => d.event_type === `purchase:${itemId}`)
    for (const lr of ledgerRows) {
      if (itemOwner.get(itemId) !== lr.student_id) leak++
    }
  }

  tableRows.push({
    N, students: batch.length, requests: allCalls.length,
    success: successCount, alreadyOwned: alreadyOwnedCount, insufficient: insufficientCount,
    locked: lockedCount, neg, double, dup, lost, leak,
  })
  grandNeg += neg; grandDouble += double; grandDup += dup; grandLost += lost; grandLeak += leak
  grandErrors += errorCalls.length

  console.log(`\n-- N=${N} --`)
  check(`N=${N}: 시나리오 콜 실행 자체의 예외 0건(실제: ${errorCalls.length})`, errorCalls.length === 0)
  check(`N=${N}: 음수 잔액 발생 0건(neg=${neg})`, neg === 0)
  check(`N=${N}: 이중 차감(같은 아이템 purchase 원장 2행 이상) 0건(double=${double})`, double === 0)
  check(`N=${N}: 중복 소유(같은 student+item town_purchases 2행 이상) 0건(dup=${dup})`, dup === 0)
  check(`N=${N}: 구매 유실(ok:true/purchased인데 실제 행 없음) 0건(lost=${lost})`, lost === 0)
  check(`N=${N}: 교차 학생 오염(정당한 소유자 아닌 student_id로 기록) 0건(leak=${leak})`, leak === 0)
  check(`N=${N}: locked-probe(min_level=99, 레벨1 학생) 전원 locked 반환(기대 ${batch.length}, 실제 ${lockedCount})`,
    lockedCount === batch.length)

  // ── 기법별 패턴 집계(레벨 내 해당 기법 인스턴스 전원에 걸쳐 위반 0건인지) ──
  const byStudentTechnique = (technique) => {
    const bySid = new Map()
    for (const c of okCalls.concat(errorCalls)) {
      if (c.technique !== technique) continue
      if (!bySid.has(c.sid)) bySid.set(c.sid, [])
      bySid.get(c.sid).push(c.result)
    }
    return bySid
  }

  {
    const map = byStudentTechnique('double-click')
    let violations = 0
    for (const [, rs] of map) {
      const purchased = rs.filter((r) => r && r.reason === 'purchased').length
      const owned = rs.filter((r) => r && r.reason === 'already_owned').length
      if (!(purchased === 1 && owned === 1)) violations++
    }
    check(`N=${N}: double-click(2건 동시, 동일 아이템) — 인스턴스 ${map.size}개 전원 "성공 1 + already_owned 1" 위반 0건(위반=${violations})`, violations === 0)
  }
  {
    const map = byStudentTechnique('x5-same-item')
    let violations = 0
    for (const [, rs] of map) {
      const purchased = rs.filter((r) => r && r.reason === 'purchased').length
      const owned = rs.filter((r) => r && r.reason === 'already_owned').length
      if (!(purchased === 1 && owned === 4)) violations++
    }
    check(`N=${N}: x5-same-item(5건 동시, 동일 아이템) — 인스턴스 ${map.size}개 전원 "성공 1 + already_owned 4" 위반 0건(위반=${violations})`, violations === 0)
  }
  {
    const map = byStudentTechnique('two-items')
    let violations = 0
    for (const [, rs] of map) {
      const purchased = rs.filter((r) => r && r.reason === 'purchased').length
      const insuff = rs.filter((r) => r && r.reason === 'insufficient').length
      if (!(purchased === 1 && insuff === 1)) violations++
    }
    check(`N=${N}: two-items(서로 다른 아이템 2건 동시, 잔액은 하나만 커버) — 인스턴스 ${map.size}개 전원 "정확히 성공 1 + insufficient 1" 위반 0건(never both, 위반=${violations})`, violations === 0)
  }
  {
    const map = byStudentTechnique('insufficient-race')
    let violations = 0
    for (const [, rs] of map) {
      const purchased = rs.filter((r) => r && r.reason === 'purchased').length
      const insuff = rs.filter((r) => r && r.reason === 'insufficient').length
      if (!(purchased === 0 && insuff === 3)) violations++
    }
    check(`N=${N}: insufficient-race(잔액9/가격10, 3건 동시) — 인스턴스 ${map.size}개 전원 "성공 0 + insufficient 3" 위반 0건(위반=${violations})`, violations === 0)
  }
  {
    const map = byStudentTechnique('two-device')
    let violations = 0
    for (const [, rs] of map) {
      const purchased = rs.filter((r) => r && r.reason === 'purchased').length
      const owned = rs.filter((r) => r && r.reason === 'already_owned').length
      if (!(purchased === 1 && owned === 1)) violations++
    }
    check(`N=${N}: two-device(같은 학생, 지터 0~30ms, 동일 아이템) — 인스턴스 ${map.size}개 전원 "성공 1 + already_owned 1" 위반 0건(위반=${violations})`, violations === 0)
  }

  // ── 결정론적 불변식 — 모든 학생: 최종잔액 == 시드된 양수 합 − 소유
  //    아이템 지불가 합, 그리고 >= 0. ─────────────────────────────────────
  let invariantViolations = 0
  for (const sid of batch) {
    const seeded = db.positiveSeeded.get(sid) || 0
    const spent = db.townPurchases.filter((p) => p.student_id === sid).reduce((s, p) => s + p.price_paid, 0)
    const expected = seeded - spent
    const actual = dollarBalance(db, sid)
    if (actual !== expected || actual < 0) invariantViolations++
  }
  check(`N=${N}: 학생 ${batch.length}명 전원 최종잔액==시드합−지불합 && >=0 위반 0건(위반=${invariantViolations})`, invariantViolations === 0)
}

// ============================================================================
// 4. 표 출력 — level | students | requests | success | already_owned |
//    insufficient | locked | neg | double | dup | lost | leak
// ============================================================================
console.log('\n=== 요약 표 ===')
const header = ['level', 'students', 'requests', 'success', 'already_owned', 'insufficient', 'locked', 'neg', 'double', 'dup', 'lost', 'leak']
console.log('  ' + header.map((h) => h.padStart(13)).join(' | '))
for (const row of tableRows) {
  console.log('  ' + [
    row.N, row.students, row.requests, row.success, row.alreadyOwned, row.insufficient,
    row.locked, row.neg, row.double, row.dup, row.lost, row.leak,
  ].map((v) => String(v).padStart(13)).join(' | '))
}

// ============================================================================
// 5. 전체 합산 단언
// ============================================================================
console.log('\n=== 전체 합산(4개 레벨) ===')
check(`전체 레벨 합산 음수 잔액 0건(grandNeg=${grandNeg})`, grandNeg === 0)
check(`전체 레벨 합산 이중 차감 0건(grandDouble=${grandDouble})`, grandDouble === 0)
check(`전체 레벨 합산 중복 소유 0건(grandDup=${grandDup})`, grandDup === 0)
check(`전체 레벨 합산 구매 유실 0건(grandLost=${grandLost})`, grandLost === 0)
check(`전체 레벨 합산 교차 학생 오염 0건(grandLeak=${grandLeak})`, grandLeak === 0)
check(`전체 레벨 합산 실행 예외 0건(grandErrors=${grandErrors})`, grandErrors === 0)
check(`4개 동시성 레벨 전부 실행됨(5/10/20/45)`, tableRows.length === 4 && tableRows.every((r, i) => r.N === CONCURRENCY_LEVELS[i]))

console.log(`\n총 ${asserted}개 단언 실행.`)
console.log(failures === 0
  ? '\n모든 단언 통과 — Paul Town V1 구매 동시성 stress(5/10/20/45명) 무결성 확인 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
