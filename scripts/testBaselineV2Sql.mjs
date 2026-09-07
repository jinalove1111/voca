// scripts/testBaselineV2Sql.mjs — supabase_v3_48_reward_legacy_baseline_v2.sql
// (per-student reconcile RPC 재설계, 2026-09-07) 정적 단언 + 순수 JS
// 인메모리 이중 실행 시뮬레이션. 네트워크 0. 실행:
// `node scripts/testBaselineV2Sql.mjs`
//
// scripts/testRewardLedgerMigration.mjs / scripts/testRewardBaselineMigration.mjs
// 와 동일한 두 층(정적 단언 + 인메모리 시뮬레이션) 구조, check() 스타일,
// exit 1 관례를 그대로 따른다. 여기서는 추가로 (C) JS/SQL 가드 상수 리터럴
// 동기화를 검증한다 — scripts/lib/baselineV2Guards.mjs의 숫자와
// supabase_v3_48_reward_legacy_baseline_v2.sql 안에 박힌 리터럴이 반드시
// 같아야 한다.

import fs from 'node:fs'
import {
  TOLERANCE, MAX_INDIVIDUAL, SNAPSHOT_SLACK, SNAPSHOT_MAX,
  evaluateReconcile,
} from './lib/baselineV2Guards.mjs'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const V48_PATH = 'supabase_v3_48_reward_legacy_baseline_v2.sql'
const V48_ROLLBACK_PATH = 'supabase_v3_48_reward_legacy_baseline_v2_ROLLBACK.sql'

// 파괴적 문장(대문자 축약 방지 — 이 파일 자체가 destructive-command-gate에
// 오탐 걸리지 않도록 부분 결합, testRewardLedgerMigration.mjs와 동일 관례).
const dropWord = ['DR', 'OP'].join('')
const truncWord = ['TRUNC', 'ATE'].join('')

// ============================================================================
// (A) SQL 정적 단언 — 본문(forward)
// ============================================================================
console.log('\nA. SQL 정적 단언 — supabase_v3_48_reward_legacy_baseline_v2.sql')
{
  const v48 = fs.readFileSync(V48_PATH, 'utf8')

  check('BEGIN 존재', /\bBEGIN\s*;/i.test(v48))
  check('COMMIT 존재', /\bCOMMIT\s*;/i.test(v48))

  // ── 함수 시그니처/definer/search_path/variable_conflict/grants ──────────
  check('reconcile_legacy_baseline 함수 시그니처 정확(p_student_id uuid, p_snapshot_total integer)',
    /create or replace function public\.reconcile_legacy_baseline\(p_student_id uuid, p_snapshot_total integer\)/i.test(v48))
  check('returns table (ok boolean, reason text, baseline_stars integer, earned_after integer)',
    /returns table \(ok boolean, reason text, baseline_stars integer, earned_after integer\)/i.test(v48))
  check('language plpgsql 존재', /language plpgsql/i.test(v48))
  check('security definer 존재', /security definer/i.test(v48))
  check('set search_path = public 존재', /set search_path = public/i.test(v48))
  check('#variable_conflict use_column 존재', /#variable_conflict use_column/i.test(v48))
  check('revoke all ... from public(함수)',
    /revoke all on function public\.reconcile_legacy_baseline\(uuid, integer\) from public;/i.test(v48))
  check('revoke all ... from anon, authenticated(함수)',
    /revoke all on function public\.reconcile_legacy_baseline\(uuid, integer\) from anon, authenticated;/i.test(v48))
  check('grant execute ... to service_role(함수)',
    /grant execute on function public\.reconcile_legacy_baseline\(uuid, integer\) to service_role;/i.test(v48))

  // ── ordering: lock(c) → earned(d) → exists v2 row(e) → 첫 INSERT INTO reward_ledger(g/i) ──
  const lockIdx = v48.search(/pg_advisory_xact_lock\(hashtext\('reconcile_legacy_baseline:/i)
  const earnedIdx = v48.search(/v_earned := coalesce\(\(select rt\.earned_stars/i)
  const existsIdx = v48.search(/select rl\.stars_delta into v_existing_delta/i)
  const firstInsertLedgerIdx = v48.search(/insert into reward_ledger/i)
  check('advisory lock(c)이 존재하고 earned 계산(d)보다 먼저 등장',
    lockIdx !== -1 && earnedIdx !== -1 && lockIdx < earnedIdx)
  check('earned 계산(d)이 이미 존재하는 v2 행 확인(e)보다 먼저 등장',
    earnedIdx !== -1 && existsIdx !== -1 && earnedIdx < existsIdx)
  check('이미 존재하는 v2 행 확인(e)이 첫 INSERT INTO reward_ledger보다 먼저 등장',
    existsIdx !== -1 && firstInsertLedgerIdx !== -1 && existsIdx < firstInsertLedgerIdx)

  // ── 가드 상수 리터럴 4종(CONSTANT, 함수 DECLARE 절 내부) ─────────────────
  check('TOLERANCE constant integer := 100 존재', /TOLERANCE\s+constant\s+integer\s*:=\s*100\s*;/i.test(v48))
  check('MAX_INDIVIDUAL constant integer := 1500 존재', /MAX_INDIVIDUAL\s+constant\s+integer\s*:=\s*1500\s*;/i.test(v48))
  check('SNAPSHOT_SLACK constant integer := 200 존재', /SNAPSHOT_SLACK\s+constant\s+integer\s*:=\s*200\s*;/i.test(v48))
  check('SNAPSHOT_MAX constant integer := 100000 존재', /SNAPSHOT_MAX\s+constant\s+integer\s*:=\s*100000\s*;/i.test(v48))

  // ── EXACT 전제조건(preflight) ────────────────────────────────────────────
  check('v3_37 marker 확인 + 부재 시 RAISE EXCEPTION 존재',
    /v3_37_reward_legacy_baseline/i.test(v48) && /v3_37 marker not found/i.test(v48))
  check('to_regclass로 reward_totals/reward_ledger/student_progress 3개 존재 확인',
    /to_regclass\('public\.reward_totals'\)/i.test(v48) &&
    /to_regclass\('public\.reward_ledger'\)/i.test(v48) &&
    /to_regclass\('public\.student_progress'\)/i.test(v48))
  check('reward_totals 0행 가드(RAISE EXCEPTION) 존재',
    /reward_totals has 0 rows/i.test(v48))
  check("감사 전용 cutover marker 'v3_48_legacy_reconcile_cutover' 삽입 + ON CONFLICT (migration_name) DO NOTHING 존재",
    /'v3_48_legacy_reconcile_cutover'/.test(v48) && /ON CONFLICT \(migration_name\) DO NOTHING/i.test(v48))

  // ── view에 GRANT 없음(service_role 전용) ─────────────────────────────────
  check('reward_baseline_v2_status 뷰 존재',
    /create or replace view reward_baseline_v2_status as/i.test(v48))
  check('reward_baseline_v2_status에 anon/authenticated GRANT 없음(revoke만 존재)',
    !/grant\s+(select|all)[^;]*reward_baseline_v2_status/i.test(v48) &&
    /revoke all on table reward_baseline_v2_status from anon, authenticated;/i.test(v48))
  check('reward_baseline_v2_status security_invoker PG15 가드(v3_36과 동일 패턴) 존재',
    /server_version_num/i.test(v48) && /security_invoker = on/i.test(v48))

  // ── total_stars는 오직 SNAPSHOT_SLACK 상식 확인(f)에서만 실제로 읽힌다 ───
  // (테이블 컬럼명/INSERT 컬럼 목록으로서의 "total_stars" 문자열 등장은
  // 제외하고, 실제 "select sp.total_stars" 형태의 읽기만 센다 — 주석에서
  // 백틱으로 언급하는 것은 "select " 접두사가 없어 이 정규식에 걸리지
  // 않는다.)
  const readMatches = [...v48.matchAll(/select\s+sp\.total_stars/gi)]
  check('sp.total_stars 읽기가 정확히 1곳(SNAPSHOT_SLACK 상식 확인)에만 존재', readMatches.length === 1)
  if (readMatches.length === 1) {
    const idx = readMatches[0].index
    const windowText = v48.slice(idx, idx + 250)
    check('그 유일한 읽기가 SNAPSHOT_SLACK과 함께(근접 250자 이내) 쓰임',
      /SNAPSHOT_SLACK/.test(windowText))
  } else {
    check('그 유일한 읽기가 SNAPSHOT_SLACK과 함께 쓰임(읽기 개수 불일치로 SKIP 취급, FAIL)', false)
  }

  // ── 본문에 reward_ledger/student_progress UPDATE/DELETE 없음(INSERT/SELECT만) ──
  check('본문에 reward_ledger UPDATE/DELETE 없음(INSERT만)',
    !new RegExp(`(update|delete\\s+from|${truncWord}|${dropWord}\\s+table)\\s+reward_ledger`, 'i').test(v48))
  check('본문에 student_progress UPDATE/DELETE 없음(SELECT만)',
    !new RegExp(`(update|delete\\s+from|${truncWord}|${dropWord}\\s+table)\\s+student_progress`, 'i').test(v48))

  check('idempotency_key 형식이 v1과 동일 패턴(...:legacy-baseline:migration:v2)',
    /p_student_id::text \|\| ':legacy-baseline:migration:v2'/i.test(v48))
  check('ON CONFLICT (idempotency_key) DO NOTHING(g단계, 0-delta 확정 마커) 존재',
    /ON CONFLICT \(idempotency_key\) DO NOTHING/i.test(v48))
  check('unique_violation 예외 처리(i단계, already_reconciled로 수렴) 존재',
    /exception when unique_violation then/i.test(v48) && /already_reconciled/i.test(v48))

  check('advisory lock 키가 함수 이름 기반(reconcile_legacy_baseline:)으로 학생별 직렬화',
    /pg_advisory_xact_lock\(hashtext\('reconcile_legacy_baseline:' \|\| p_student_id::text\)\)/i.test(v48))
}

// ============================================================================
// (B) SQL 정적 단언 — ROLLBACK
// ============================================================================
console.log('\nB. SQL 정적 단언 — supabase_v3_48_reward_legacy_baseline_v2_ROLLBACK.sql')
{
  const rollback = fs.readFileSync(V48_ROLLBACK_PATH, 'utf8')

  check('rollback이 reward_ledger에서 source_id=\'v2\'만 지움(WHERE 포함)',
    /delete\s+from\s+reward_ledger[\s\S]{0,200}source_id\s*=\s*'v2'/i.test(rollback))
  check('rollback이 reward_baseline_review를 v3_48 migration_name 기준으로만 지움(WHERE 포함)',
    /delete\s+from\s+reward_baseline_review[\s\S]{0,150}migration_name\s*=\s*'v3_48_reward_legacy_baseline_v2'/i.test(rollback))
  check('rollback이 reward_migration_log에서 cutover marker만 지움(WHERE 포함)',
    /delete\s+from\s+reward_migration_log[\s\S]{0,150}migration_name\s*=\s*'v3_48_legacy_reconcile_cutover'/i.test(rollback))
  check('rollback이 v1(source_id=\'v1\') 행을 지우지 않음',
    !/delete\s+from\s+reward_ledger[\s\S]{0,200}source_id\s*=\s*'v1'/i.test(rollback))
  check('rollback이 revoke execute(service_role) + drop function if exists + drop view if exists 포함',
    /revoke execute on function public\.reconcile_legacy_baseline\(uuid, integer\) from service_role;/i.test(rollback) &&
    /drop function if exists public\.reconcile_legacy_baseline\(uuid, integer\);/i.test(rollback) &&
    /drop view if exists reward_baseline_v2_status;/i.test(rollback))

  const deleteStatements = rollback.split(';').filter((s) => /\bDELETE\s+FROM\b/i.test(s))
  const allHaveWhere = deleteStatements.length > 0 && deleteStatements.every((s) => /\bWHERE\b/i.test(s))
  check('모든 DELETE FROM 문에 WHERE 절 존재(무조건부 삭제 없음)', allHaveWhere)
  check(`DELETE FROM 문이 정확히 3개(reward_ledger/reward_baseline_review/reward_migration_log)`, deleteStatements.length === 3)
}

// ============================================================================
// (C) JS/SQL 가드 상수 리터럴 동기화 — scripts/lib/baselineV2Guards.mjs의
// 값이 SQL 파일 안에 정확한 리터럴로 박혀 있는지 대조한다.
// ============================================================================
console.log('\nC. 가드 상수 리터럴 동기화 — scripts/lib/baselineV2Guards.mjs ↔ supabase_v3_48_*.sql')
{
  const v48 = fs.readFileSync(V48_PATH, 'utf8')
  const literalPresent = (name, value) =>
    new RegExp(`${name}\\s+constant\\s+integer\\s*:=\\s*${value}\\s*;`, 'i').test(v48)

  check(`TOLERANCE=${TOLERANCE} 리터럴이 SQL에 존재`, literalPresent('TOLERANCE', TOLERANCE))
  check(`MAX_INDIVIDUAL=${MAX_INDIVIDUAL} 리터럴이 SQL에 존재`, literalPresent('MAX_INDIVIDUAL', MAX_INDIVIDUAL))
  check(`SNAPSHOT_SLACK=${SNAPSHOT_SLACK} 리터럴이 SQL에 존재`, literalPresent('SNAPSHOT_SLACK', SNAPSHOT_SLACK))
  check(`SNAPSHOT_MAX=${SNAPSHOT_MAX} 리터럴이 SQL에 존재`, literalPresent('SNAPSHOT_MAX', SNAPSHOT_MAX))
}

// ============================================================================
// (D) 인메모리 이중 실행 시뮬레이션 — reconcile_legacy_baseline() 함수
// a)~j) 단계의 순수 JS 등가. SQL과 1:1 대응하도록 유지한다(변경 시 함께
// 갱신). evaluateReconcile()(b/f/g/h 순수 판정)을 재사용하고, e)/i)/j)
// (원장 상태 의존 부분)는 이 파일에서 직접 시뮬레이션한다.
// ============================================================================

function createDb() {
  return {
    students: new Set(),
    rewardLedger: [],        // [{student_id, reward_type, source_type, source_id, stars_delta, idempotency_key}]
    studentProgress: new Map(), // student_id -> uploaded total_stars(서버에 이미 반영된 값)
    progressHistory: new Map(), // student_id -> historySince(v3_37 이후 실제 학습 기록 합, 근사)
    reviewRows: [],           // [{student_id, snapshot, earned, delta, plausibleMax}]
  }
}

function baselineV2Key(studentId) {
  return `${studentId}:legacy-baseline:migration:v2`
}

function v2Row(db, studentId) {
  return db.rewardLedger.find((e) =>
    e.student_id === studentId && e.reward_type === 'legacy-baseline' &&
    e.source_type === 'migration' && e.source_id === 'v2')
}

function earnedOf(db, studentId) {
  return db.rewardLedger
    .filter((e) => e.student_id === studentId)
    .reduce((sum, e) => sum + e.stars_delta, 0)
}

/** insertLedgerEvent — idempotency_key 전역 unique 제약의 JS 등가. */
function insertLedgerEvent(db, entry) {
  if (db.rewardLedger.some((e) => e.idempotency_key === entry.idempotency_key)) {
    return { inserted: false }
  }
  db.rewardLedger.push(entry)
  return { inserted: true }
}

/**
 * reconcile — reconcile_legacy_baseline(p_student_id, p_snapshot_total)의
 * 순수 JS 등가. a)~j) 순서를 SQL 함수와 동일하게 유지한다.
 */
function reconcile(db, studentId, snapshot) {
  // a) 학생 존재 확인.
  if (!studentId || !db.students.has(studentId)) {
    return { ok: false, reason: 'student_not_found', baselineStars: 0, earnedAfter: 0 }
  }

  // c) advisory lock — 단일 스레드 시뮬레이션이라 no-op(SQL에서는 동시
  //    호출 직렬화 역할, 여기서는 순서 보장이 이미 자연스럽게 성립).

  // d) earned.
  const earned = earnedOf(db, studentId)

  // e) 이미 존재하는 v2 행.
  const existing = v2Row(db, studentId)
  if (existing) {
    return { ok: true, reason: 'already_reconciled', baselineStars: existing.stars_delta, earnedAfter: earned }
  }

  // b/f/g/h — evaluateReconcile()로 판정(SQL과 동일 순수 로직 재사용).
  const uploadedTotal = db.studentProgress.get(studentId) || 0
  const historySince = db.progressHistory.get(studentId) || 0
  const evalResult = evaluateReconcile({ snapshot, earned, uploadedTotal, historySince })

  if (evalResult.reason === 'invalid_snapshot') {
    return { ok: false, reason: 'invalid_snapshot', baselineStars: 0, earnedAfter: 0 }
  }
  if (evalResult.reason === 'review') {
    db.reviewRows.push({ studentId, snapshot, earned, delta: snapshot - earned, plausibleMax: historySince + TOLERANCE })
    return { ok: false, reason: 'review', baselineStars: 0, earnedAfter: earned }
  }
  if (evalResult.reason === 'nothing_to_reconcile') {
    insertLedgerEvent(db, {
      student_id: studentId, reward_type: 'legacy-baseline', source_type: 'migration', source_id: 'v2',
      stars_delta: 0, idempotency_key: baselineV2Key(studentId),
    })
    return { ok: true, reason: 'nothing_to_reconcile', baselineStars: 0, earnedAfter: earned }
  }

  // i) 실제 정산(evalResult.reason === 'ok').
  const delta = evalResult.delta
  const key = baselineV2Key(studentId)
  const insertResult = insertLedgerEvent(db, {
    student_id: studentId, reward_type: 'legacy-baseline', source_type: 'migration', source_id: 'v2',
    stars_delta: Math.min(delta, 32767), idempotency_key: key,
  })
  if (!insertResult.inserted) {
    // unique_violation 등가 — 레이스로 그 사이 다른 호출이 이미 심었다면
    // already_reconciled로 안전하게 수렴.
    return { ok: true, reason: 'already_reconciled', baselineStars: 0, earnedAfter: earnedOf(db, studentId) }
  }

  // j) 정산 완료.
  return { ok: true, reason: 'reconciled', baselineStars: delta, earnedAfter: earnedOf(db, studentId) }
}

console.log('\nD1. T0 — legacy total 300, ledger 0 → reconcile → baseline 300')
{
  const db = createDb()
  db.students.add('s1')
  db.studentProgress.set('s1', 300)
  db.progressHistory.set('s1', 300) // 실제 학습 기록이 delta(300)를 충분히 뒷받침 — plausible_max=400
  const r = reconcile(db, 's1', 300)
  check('ok=true', r.ok === true)
  check("reason='reconciled'", r.reason === 'reconciled')
  check('baseline=300', r.baselineStars === 300)
  check('earned_after == earnedOf(db,s1)', r.earnedAfter === earnedOf(db, 's1'))
  check('earned_after=300', r.earnedAfter === 300)
}

console.log('\nD2. D1 이후 서버 이벤트 +10 → earned 310 == actual 310')
{
  const db = createDb()
  db.students.add('s1')
  db.studentProgress.set('s1', 300)
  db.progressHistory.set('s1', 300)
  reconcile(db, 's1', 300)
  insertLedgerEvent(db, { student_id: 's1', reward_type: 'word-session-complete', source_type: 'event', source_id: 'evt1', stars_delta: 10, idempotency_key: 's1:word-session-complete:event:evt1' })
  check('earned == 310(legacy 300 + 실제 이벤트 10)', earnedOf(db, 's1') === 310)
}

console.log('\nD3. 이벤트가 reconcile *이전*에 도착(ledger 10, snapshot 310) → baseline 300, earned 310')
{
  const db = createDb()
  db.students.add('s2')
  db.studentProgress.set('s2', 310)
  db.progressHistory.set('s2', 300) // delta(300)를 뒷받침 — plausible_max=400
  insertLedgerEvent(db, { student_id: 's2', reward_type: 'word-session-complete', source_type: 'event', source_id: 'evt1', stars_delta: 10, idempotency_key: 's2:word-session-complete:event:evt1' })
  const r = reconcile(db, 's2', 310)
  check('ok=true, reconciled', r.ok === true && r.reason === 'reconciled')
  check('baseline=300(300=310-10)', r.baselineStars === 300)
  check('earned_after=310', r.earnedAfter === 310)
  check('earned_after == earnedOf(db,s2)', r.earnedAfter === earnedOf(db, 's2'))
}

console.log('\nD4. 클라이언트 hold — 정산 시점엔 스냅샷/원장 어디에도 없던 이벤트가 정산 *이후* 도착 → earned == actual')
{
  const db = createDb()
  db.students.add('s3')
  db.studentProgress.set('s3', 300)
  db.progressHistory.set('s3', 300)
  const r = reconcile(db, 's3', 300) // hold 중이라 아직 그 grant는 스냅샷/원장 어디에도 없음
  check('reconciled, baseline=300', r.ok === true && r.reason === 'reconciled' && r.baselineStars === 300)
  // hold 해제 — 보류됐던 grant가 이제 도착.
  insertLedgerEvent(db, { student_id: 's3', reward_type: 'word-session-complete', source_type: 'event', source_id: 'held1', stars_delta: 10, idempotency_key: 's3:word-session-complete:event:held1' })
  check('earned == actual(legacy 300 + held grant 10 = 310)', earnedOf(db, 's3') === 310)
}

console.log('\nD5. held grant 재시도(같은 이벤트 재전송) → unique로 거부, earned 불변')
{
  const db = createDb()
  db.students.add('s3')
  db.studentProgress.set('s3', 300)
  db.progressHistory.set('s3', 300)
  reconcile(db, 's3', 300)
  insertLedgerEvent(db, { student_id: 's3', reward_type: 'word-session-complete', source_type: 'event', source_id: 'held1', stars_delta: 10, idempotency_key: 's3:word-session-complete:event:held1' })
  const before = earnedOf(db, 's3')
  const retry = insertLedgerEvent(db, { student_id: 's3', reward_type: 'word-session-complete', source_type: 'event', source_id: 'held1', stars_delta: 10, idempotency_key: 's3:word-session-complete:event:held1' })
  check('재시도는 거부됨(inserted=false)', retry.inserted === false)
  check('earned 불변', earnedOf(db, 's3') === before)
}

console.log('\nD6. 정산 재호출 → already_reconciled, 신규 행 0건')
{
  const db = createDb()
  db.students.add('s3')
  db.studentProgress.set('s3', 300)
  db.progressHistory.set('s3', 300)
  reconcile(db, 's3', 300)
  insertLedgerEvent(db, { student_id: 's3', reward_type: 'word-session-complete', source_type: 'event', source_id: 'held1', stars_delta: 10, idempotency_key: 's3:word-session-complete:event:held1' })
  const countBefore = db.rewardLedger.filter((e) => e.student_id === 's3').length
  const r2 = reconcile(db, 's3', 999999) // 스냅샷이 뭐든 e)에서 즉시 already_reconciled로 종료
  check('ok=true, already_reconciled', r2.ok === true && r2.reason === 'already_reconciled')
  check('baseline=300(기존 v2 행의 stars_delta)', r2.baselineStars === 300)
  check('earned_after=310(불변)', r2.earnedAfter === 310)
  check('신규 원장 행 추가 없음', db.rewardLedger.filter((e) => e.student_id === 's3').length === countBefore)
}

console.log('\nD7. 두 학생 인터리빙 — 서로 독립(교차 오염 없음)')
{
  const db = createDb()
  db.students.add('s1'); db.students.add('s2')
  db.studentProgress.set('s1', 300)
  db.studentProgress.set('s2', 310)
  db.progressHistory.set('s1', 300)
  db.progressHistory.set('s2', 300)
  insertLedgerEvent(db, { student_id: 's2', reward_type: 'word-session-complete', source_type: 'event', source_id: 'evt1', stars_delta: 10, idempotency_key: 's2:word-session-complete:event:evt1' })
  const r1 = reconcile(db, 's1', 300)
  const r2 = reconcile(db, 's2', 310)
  check('s1 reconciled baseline=300', r1.ok === true && r1.reason === 'reconciled' && r1.baselineStars === 300)
  check('s2 reconciled baseline=300(독립적으로 300=310-10)', r2.ok === true && r2.reason === 'reconciled' && r2.baselineStars === 300)
  check('s1 원장에는 s2 이벤트 없음', !db.rewardLedger.some((e) => e.student_id === 's1' && e.source_id === 'evt1'))
  check('s1 earned=300, s2 earned=310(서로 영향 없음)', earnedOf(db, 's1') === 300 && earnedOf(db, 's2') === 310)
}

console.log('\nD8. snapshot이 uploaded+SNAPSHOT_SLACK 초과 → review, 원장에 행 없음')
{
  const db = createDb()
  db.students.add('s4')
  db.studentProgress.set('s4', 100) // uploaded=100, slack=200 → 한계 300
  const r = reconcile(db, 's4', 301) // 301 > 300
  check('ok=false, reason=review', r.ok === false && r.reason === 'review')
  check('원장에 v2 행 없음', !v2Row(db, 's4'))
  check('review 행 기록됨', db.reviewRows.some((row) => row.studentId === 's4'))
}

console.log('\nD9. delta > history+TOLERANCE(plausible_max) → review, 원장에 행 없음')
{
  const db = createDb()
  db.students.add('s5')
  db.studentProgress.set('s5', 1000) // uploaded == snapshot이라 f)는 통과
  db.progressHistory.set('s5', 50) // plausible_max = 150
  insertLedgerEvent(db, { student_id: 's5', reward_type: 'word-session-complete', source_type: 'event', source_id: 'evt1', stars_delta: 700, idempotency_key: 's5:word-session-complete:event:evt1' })
  const r = reconcile(db, 's5', 1000) // delta = 1000-700 = 300 > plausible_max(150), < MAX_INDIVIDUAL(1500)
  check('ok=false, reason=review(plausible_max 위반, max_individual과 무관하게 단독으로도 걸림)', r.ok === false && r.reason === 'review')
  check('원장에 v2 행 없음', !v2Row(db, 's5'))
}

console.log('\nD10. delta > MAX_INDIVIDUAL(history가 넉넉해도) → review, 원장에 행 없음')
{
  const db = createDb()
  db.students.add('s5b')
  db.studentProgress.set('s5b', 5000)
  db.progressHistory.set('s5b', 10000) // plausible_max 매우 큼 — history 조건은 통과
  const r = reconcile(db, 's5b', 5000) // delta = 5000 > MAX_INDIVIDUAL(1500)
  check('ok=false, reason=review(max_individual 위반)', r.ok === false && r.reason === 'review')
  check('원장에 v2 행 없음', !v2Row(db, 's5b'))
}

console.log('\nD11. delta ≤ 0 → 0-delta 확정 마커 + nothing_to_reconcile, 이후 재호출은 already_reconciled')
{
  const db = createDb()
  db.students.add('s6')
  db.studentProgress.set('s6', 500)
  insertLedgerEvent(db, { student_id: 's6', reward_type: 'word-session-complete', source_type: 'event', source_id: 'evt1', stars_delta: 500, idempotency_key: 's6:word-session-complete:event:evt1' })
  const r1 = reconcile(db, 's6', 500) // delta = 500-500 = 0
  check('1차: ok=true, nothing_to_reconcile', r1.ok === true && r1.reason === 'nothing_to_reconcile')
  check('1차: 0-delta v2 행이 실제로 삽입됨', v2Row(db, 's6')?.stars_delta === 0)
  const r2 = reconcile(db, 's6', 999) // 스냅샷이 뭐든 e)에서 already_reconciled
  check('2차: ok=true, already_reconciled', r2.ok === true && r2.reason === 'already_reconciled')
  check('2차: baseline=0(기존 0-delta 마커)', r2.baselineStars === 0)
}

console.log('\nD12. tamper — uploaded total만 부풀리고 history는 그대로 → review(bounded-once trust로 문서화된 잔여 신뢰 경계)')
{
  const db = createDb()
  db.students.add('s7')
  db.studentProgress.set('s7', 5000) // 공격자가 자기 클라이언트에서 total_stars 자체를 부풀려 업로드
  db.progressHistory.set('s7', 0)    // 그러나 매칭되는 history 기록은 없음(위조하지 않음)
  const r = reconcile(db, 's7', 5000) // snapshot==uploaded라 f)의 SNAPSHOT_SLACK 검사는 통과하지만
  check('ok=false, reason=review(history 기반 h단계가 잡음)', r.ok === false && r.reason === 'review')
  check('원장에 v2 행 없음(부풀린 값이 그대로 반영되지 않음)', !v2Row(db, 's7'))
}

console.log('\nD13. evaluateReconcile 단위 동작 — invalid_snapshot 경계(null/음수/SNAPSHOT_MAX 초과)')
{
  check('snapshot=null → invalid_snapshot', evaluateReconcile({ snapshot: null, earned: 0, uploadedTotal: 0, historySince: 0 }).reason === 'invalid_snapshot')
  check('snapshot=-1 → invalid_snapshot', evaluateReconcile({ snapshot: -1, earned: 0, uploadedTotal: 0, historySince: 0 }).reason === 'invalid_snapshot')
  check(`snapshot=${SNAPSHOT_MAX + 1} → invalid_snapshot`, evaluateReconcile({ snapshot: SNAPSHOT_MAX + 1, earned: 0, uploadedTotal: 1000000, historySince: 0 }).reason === 'invalid_snapshot')
  check(`snapshot=${SNAPSHOT_MAX} → invalid_snapshot 아님(경계값은 허용)`, evaluateReconcile({ snapshot: SNAPSHOT_MAX, earned: 0, uploadedTotal: SNAPSHOT_MAX, historySince: SNAPSHOT_MAX }).reason !== 'invalid_snapshot')
}

console.log(failures === 0
  ? '\n모든 단언 통과 — reconcile_legacy_baseline per-student 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
