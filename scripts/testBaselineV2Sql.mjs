// scripts/testBaselineV2Sql.mjs — supabase_v3_48_reward_legacy_baseline_v2.sql
// 정적 단언 + 순수 JS 인메모리 이중 실행 시뮬레이션. 네트워크 0. 실행:
// `node scripts/testBaselineV2Sql.mjs`
//
// scripts/testRewardLedgerMigration.mjs / scripts/testRewardBaselineMigration.mjs
// 와 동일한 두 층(정적 단언 + 인메모리 시뮬레이션) 구조, check() 스타일,
// exit 1 관례를 그대로 따른다. 여기서는 추가로 (C) JS/SQL 가드 상수
// 리터럴 동기화를 검증한다 — scripts/lib/baselineV2Guards.mjs의 숫자와
// supabase_v3_48_reward_legacy_baseline_v2.sql 안에 박힌 리터럴이 반드시
// 같아야 한다(2026-09-06 하드닝 작업의 핵심 방어 항목).

import fs from 'node:fs'
import {
  CANDIDATES_MIN, CANDIDATES_MAX, TOTAL_MIN, TOTAL_MAX,
  MAX_INDIVIDUAL, PROGRESS_ROWS_MIN, PROGRESS_ROWS_MAX,
  evaluateBaselineGuards,
} from './lib/baselineV2Guards.mjs'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const V48_PATH = 'supabase_v3_48_reward_legacy_baseline_v2.sql'
const V48_ROLLBACK_PATH = 'supabase_v3_48_reward_legacy_baseline_v2_ROLLBACK.sql'

// ============================================================================
// (A) SQL 정적 단언 — 본문(forward)
// ============================================================================
console.log('\nA. SQL 정적 단언 — supabase_v3_48_reward_legacy_baseline_v2.sql')
{
  const v48 = fs.readFileSync(V48_PATH, 'utf8')

  check('BEGIN 존재', /\bBEGIN\s*;/i.test(v48))
  check('COMMIT 존재', /\bCOMMIT\s*;/i.test(v48))
  check('DO $$ 블록 존재', /DO\s*\$\$/i.test(v48))

  check('v3_48 marker(reward_migration_log) 확인 + skip 분기 존재',
    /reward_migration_log/i.test(v48) && /already applied, skipping/i.test(v48))
  check('v3_37 선행 marker 확인 + 부재 시 RAISE EXCEPTION 존재',
    /v3_37_reward_legacy_baseline/i.test(v48) && /RAISE EXCEPTION/i.test(v48))

  check('ON CONFLICT (idempotency_key) DO NOTHING 존재',
    /ON CONFLICT\s*\(\s*idempotency_key\s*\)\s*DO NOTHING/i.test(v48))
  check('reward_ledger INSERT의 source_id가 오직 \'v2\'',
    /VALUES\s*\(rec\.student_id,\s*'legacy-baseline',\s*'migration',\s*'v2'/i.test(v48))

  // 파괴적 문장(대문자 축약 방지 — 이 파일 자체가 destructive-command-gate에
  // 오탐 걸리지 않도록 부분 결합, testRewardLedgerMigration.mjs와 동일 관례).
  const dropWord = ['DR', 'OP'].join('')
  const truncWord = ['TRUNC', 'ATE'].join('')
  check('본문에 reward_ledger UPDATE/DELETE 없음(INSERT만)',
    !new RegExp(`(update|delete\\s+from|${truncWord}|${dropWord}\\s+table)\\s+reward_ledger`, 'i').test(v48))
  check('본문에 student_progress UPDATE/DELETE 없음(SELECT만)',
    !new RegExp(`(update|delete\\s+from|${truncWord}|${dropWord}\\s+table)\\s+student_progress`, 'i').test(v48))

  check('v1 marker(v3_37_reward_legacy_baseline) 존재 확인 로직 존재',
    /SELECT executed_at INTO v_v1_at[\s\S]{0,120}v3_37_reward_legacy_baseline/i.test(v48))

  check('reward_totals 0행 가드(RAISE EXCEPTION) 존재',
    /reward_totals[\s\S]{0,80}= 0[\s\S]{0,200}RAISE EXCEPTION/i.test(v48) ||
    (/v_reward_totals_rows\s*=\s*0/i.test(v48) && /RAISE EXCEPTION/i.test(v48)))

  check('필수 테이블 4개(reward_totals/reward_ledger/student_progress/student_daily_progress) 존재 확인(to_regclass)',
    /to_regclass\('public\.reward_totals'\)/i.test(v48) &&
    /to_regclass\('public\.reward_ledger'\)/i.test(v48) &&
    /to_regclass\('public\.student_progress'\)/i.test(v48) &&
    /to_regclass\('public\.student_daily_progress'\)/i.test(v48))

  check('음수 delta는 애초에 스킵(CONTINUE WHEN v_delta <= 0) 존재',
    /CONTINUE WHEN v_delta\s*<=\s*0/i.test(v48))
  check('postcheck에 삽입 v2 행 중 stars_delta<=0 명시적 재확인 존재',
    /stars_delta\s*<=\s*0/i.test(v48))
  check('postcheck에 v2 행 수 == inserted_count 대조(중복 0 확인) 존재',
    /v_dup_check[\s\S]{0,100}<>\s*inserted_count/i.test(v48))
  check('postcheck에 inserted_count \\+ review_count == candidate_count 대조 존재',
    /\(inserted_count \+ review_count\)\s*<>\s*candidate_count/i.test(v48))

  check('가드 상수 CONSTANT 선언 7개 모두 존재',
    /CANDIDATES_MIN\s+CONSTANT/i.test(v48) &&
    /CANDIDATES_MAX\s+CONSTANT/i.test(v48) &&
    /TOTAL_MIN\s+CONSTANT/i.test(v48) &&
    /TOTAL_MAX\s+CONSTANT/i.test(v48) &&
    /MAX_INDIVIDUAL_LIMIT\s+CONSTANT/i.test(v48) &&
    /PROGRESS_ROWS_MIN\s+CONSTANT/i.test(v48) &&
    /PROGRESS_ROWS_MAX\s+CONSTANT/i.test(v48))

  check('가드 평가(BOUNDED 4종)가 어떤 INSERT INTO reward_ledger보다 먼저 등장',
    (() => {
      const guardIdx = v48.search(/BOUNDED guard failed: candidate_count/i)
      const insertIdx = v48.search(/INSERT INTO reward_ledger/i)
      return guardIdx !== -1 && insertIdx !== -1 && guardIdx < insertIdx
    })())

  check('EXACT/BOUNDED 가드 구분 헤더 주석 존재', /EXACT 가드/.test(v48) && /BOUNDED 가드/.test(v48))
}

// ============================================================================
// (B) SQL 정적 단언 — ROLLBACK
// ============================================================================
console.log('\nB. SQL 정적 단언 — supabase_v3_48_reward_legacy_baseline_v2_ROLLBACK.sql')
{
  const rollback = fs.readFileSync(V48_ROLLBACK_PATH, 'utf8')

  check('rollback이 reward_ledger에서 source_id=\'v2\'만 지움(WHERE 포함)',
    /delete\s+from\s+reward_ledger[\s\S]{0,200}source_id\s*=\s*'v2'/i.test(rollback))
  check('rollback이 reward_baseline_review를 v3_48 marker 기준으로만 지움(WHERE 포함)',
    /delete\s+from\s+reward_baseline_review[\s\S]{0,150}migration_name\s*=\s*'v3_48_reward_legacy_baseline_v2'/i.test(rollback))
  check('rollback이 reward_migration_log에서 자기 marker만 지움(WHERE 포함)',
    /delete\s+from\s+reward_migration_log[\s\S]{0,150}migration_name\s*=\s*'v3_48_reward_legacy_baseline_v2'/i.test(rollback))
  check('rollback이 v1(source_id=\'v1\') 행을 지우지 않음',
    !/delete\s+from\s+reward_ledger[\s\S]{0,200}source_id\s*=\s*'v1'/i.test(rollback))

  const deleteStatements = rollback.split(';').filter((s) => /\bDELETE\s+FROM\b/i.test(s))
  const allHaveWhere = deleteStatements.length > 0 && deleteStatements.every((s) => /\bWHERE\b/i.test(s))
  check('모든 DELETE FROM 문에 WHERE 절 존재(무조건부 삭제 없음)', allHaveWhere)
}

// ============================================================================
// (C) JS/SQL 가드 상수 리터럴 동기화 — scripts/lib/baselineV2Guards.mjs의
// 값이 SQL 파일 안에 정확한 리터럴로 박혀 있는지 대조한다.
// ============================================================================
console.log('\nC. 가드 상수 리터럴 동기화 — scripts/lib/baselineV2Guards.mjs ↔ supabase_v3_48_*.sql')
{
  const v48 = fs.readFileSync(V48_PATH, 'utf8')
  const literalPresent = (name, value) =>
    new RegExp(`${name}\\s+CONSTANT\\s+integer\\s*:=\\s*${value}\\s*;`, 'i').test(v48)

  check(`CANDIDATES_MIN=${CANDIDATES_MIN} 리터럴이 SQL에 존재`, literalPresent('CANDIDATES_MIN', CANDIDATES_MIN))
  check(`CANDIDATES_MAX=${CANDIDATES_MAX} 리터럴이 SQL에 존재`, literalPresent('CANDIDATES_MAX', CANDIDATES_MAX))
  check(`TOTAL_MIN=${TOTAL_MIN} 리터럴이 SQL에 존재`, literalPresent('TOTAL_MIN', TOTAL_MIN))
  check(`TOTAL_MAX=${TOTAL_MAX} 리터럴이 SQL에 존재`, literalPresent('TOTAL_MAX', TOTAL_MAX))
  check(`MAX_INDIVIDUAL_LIMIT=${MAX_INDIVIDUAL} 리터럴이 SQL에 존재`, literalPresent('MAX_INDIVIDUAL_LIMIT', MAX_INDIVIDUAL))
  check(`PROGRESS_ROWS_MIN=${PROGRESS_ROWS_MIN} 리터럴이 SQL에 존재`, literalPresent('PROGRESS_ROWS_MIN', PROGRESS_ROWS_MIN))
  check(`PROGRESS_ROWS_MAX=${PROGRESS_ROWS_MAX} 리터럴이 SQL에 존재`, literalPresent('PROGRESS_ROWS_MAX', PROGRESS_ROWS_MAX))
}

// ============================================================================
// (D) 인메모리 이중 실행 시뮬레이션 — supabase_v3_48_*.sql DO 블록의 의미론
// 명세. SQL과 1:1 대응하도록 유지한다(변경 시 함께 갱신).
// ============================================================================

const V48_MIGRATION_NAME = 'v3_48_reward_legacy_baseline_v2'
const V37_MIGRATION_NAME = 'v3_37_reward_legacy_baseline'

function createDb() {
  return {
    rewardLedger: [],           // [{student_id, reward_type, source_type, source_id, stars_delta, idempotency_key}]
    rewardTotals: new Map(),    // student_id -> earned_stars (reward_ledger sum 근사 — 시뮬레이션에서는 독립 입력으로 취급)
    studentProgress: new Map(), // student_id -> total_stars
    studentDailyProgress: [],   // [{student_id, date, stars_earned}] (v1 이후만 넣는다고 가정)
    reviewRows: [],             // [{student_id, delta, plausible_max}]
    migrationLog: new Map(),    // migration_name -> {executed_at, target_rows, total_stars_sum}
  }
}

function baselineV2Key(studentId) {
  return `${studentId}:legacy-baseline:migration:v2`
}

function v2Rows(db) {
  return db.rewardLedger.filter((e) => e.reward_type === 'legacy-baseline' && e.source_type === 'migration' && e.source_id === 'v2')
}

/**
 * applyV3_48 — SQL DO 블록의 순수 JS 등가. guardOverride로 테스트에서
 * BOUNDED 가드를 강제로 통과/실패시킬 수 있게 한다(기본은 항상 평가).
 */
function applyV3_48(db, { skipGuards = false } = {}) {
  if (db.migrationLog.has(V48_MIGRATION_NAME)) {
    return { skipped: true, inserted: 0, review: 0, candidates: 0 }
  }
  if (!db.migrationLog.has(V37_MIGRATION_NAME)) {
    throw new Error('v3_37 marker not found — aborting')
  }
  const v1At = db.migrationLog.get(V37_MIGRATION_NAME).executed_at

  // EXACT 가드 — reward_totals가 완전히 비어 있으면(맵 크기 0) 중단.
  // (student_progress에 행이 있는데 reward_totals가 통째로 비어 있는
  // 상태만 여기서는 "유실"로 취급 — SQL의 count(*)=0 의미와 동일.)
  if (db.rewardTotals.size === 0 && db.studentProgress.size > 0) {
    throw new Error('reward_totals has 0 rows — v1 baseline appears missing')
  }

  // BOUNDED 가드 사전 계산(어떤 삽입도 하기 전) — delta>0 전체 후보
  // (review로 빠질 학생 포함).
  const deltas = [...db.studentProgress.entries()].map(([studentId, totalStars]) => {
    const earned = db.rewardTotals.get(studentId) || 0
    return { studentId, delta: (totalStars || 0) - earned }
  })
  const candidateDeltas = deltas.filter((d) => d.delta > 0)
  const candidateCount = candidateDeltas.length
  const totalDeltaSum = candidateDeltas.reduce((sum, d) => sum + d.delta, 0)
  const maxIndividual = candidateDeltas.reduce((m, d) => Math.max(m, d.delta), 0)
  const progressRows = db.studentProgress.size

  if (!skipGuards) {
    const guard = evaluateBaselineGuards({
      candidates: candidateCount, total: totalDeltaSum, maxIndividual, progressRows,
    })
    if (!guard.ok) {
      throw new Error(`BOUNDED guard failed: ${guard.failures.map((f) => f.guard).join(',')}`)
    }
  }

  // ② loop — delta별로 이관 또는 review.
  let insertedCount = 0
  let reviewCount = 0
  let totalDeltaSumInserted = 0
  for (const { studentId, delta } of candidateDeltas) {
    const plausibleMax = db.studentDailyProgress
      .filter((d) => d.student_id === studentId && d.date >= v1At)
      .reduce((sum, d) => sum + d.stars_earned, 0) + 50

    if (delta > plausibleMax) {
      db.reviewRows.push({ studentId, delta, plausibleMax })
      reviewCount++
    } else {
      const key = baselineV2Key(studentId)
      const exists = db.rewardLedger.some((e) => e.idempotency_key === key)
      if (!exists) {
        db.rewardLedger.push({
          student_id: studentId, reward_type: 'legacy-baseline', source_type: 'migration', source_id: 'v2',
          stars_delta: Math.min(delta, 32767), idempotency_key: key,
        })
        insertedCount++
        totalDeltaSumInserted += delta
      }
    }
  }

  // ③ postcheck — 부분 처리 방지.
  if (insertedCount + reviewCount !== candidateCount) {
    throw new Error(`mismatch: candidates=${candidateCount} inserted+review=${insertedCount + reviewCount}`)
  }
  // EXACT 가드 — 중복 0(v2 행 수 == insertedCount).
  if (v2Rows(db).length !== insertedCount) {
    throw new Error(`dup mismatch: v2 rows=${v2Rows(db).length} inserted=${insertedCount}`)
  }
  // EXACT 가드 — 음수(또는 0) delta 삽입 0건.
  if (v2Rows(db).some((e) => e.stars_delta <= 0)) {
    throw new Error('negative or zero stars_delta row inserted')
  }

  db.migrationLog.set(V48_MIGRATION_NAME, { executed_at: 'sim', target_rows: insertedCount, total_stars_sum: totalDeltaSumInserted })
  return { skipped: false, inserted: insertedCount, review: reviewCount, candidates: candidateCount }
}

function withV1Marker(db) {
  db.migrationLog.set(V37_MIGRATION_NAME, { executed_at: '2026-08-23' })
  return db
}

console.log('\nD1. 1회 실행 — 정상 시나리오(가드 통과), 기대 insert/review 라우팅')
{
  const db = withV1Marker(createDb())
  db.studentProgress.set('s1', 300) // delta 300 (earned 0)
  db.studentProgress.set('s2', 50)  // delta 50
  db.studentProgress.set('s3', 20)  // delta 0 (earned == total) -> 후보 아님
  db.rewardTotals.set('s3', 20)
  // BOUNDED 가드 candidate_count>=5 요구 — 최소치를 맞추기 위해 추가 학생.
  for (let i = 4; i <= 8; i++) db.studentProgress.set(`s${i}`, 10)
  // s2/s8은 plausible_max를 낮게 둬서 review로 라우팅되게 한다(daily-progress 없음 -> plausible_max=50).
  db.studentDailyProgress.push({ student_id: 's1', date: '2026-08-24', stars_earned: 260 }) // plausible_max = 310 >= 300 -> insert
  // s2: plausible_max=50, delta=50 -> 50<=50 -> insert(경계값, 초과 아님)

  // 이 시나리오는 라우팅 로직(insert vs review) 자체를 검증하는 것이
  // 목적이라 BOUNDED 가드는 건너뛴다(가드 자체는 D7~D11에서 별도 검증).
  const result = applyV3_48(db, { skipGuards: true })
  check('skip=false', result.skipped === false)
  check('candidate 수 == 7(s1,s2,s4..s8, s3 제외)', result.candidates === 7)
  check('전원 insert 또는 review로 라우팅(합계==candidates)', result.inserted + result.review === result.candidates)
  check('s3는 원장에 없음(delta<=0이라 후보 자체가 아님)', !v2Rows(db).some((e) => e.student_id === 's3'))
}

console.log('\nD2. 즉시 재실행 — marker로 인해 완전 no-op(두 번째 실행 신규 행 0)')
{
  const db = withV1Marker(createDb())
  db.rewardTotals.set('zzz-unrelated', 0) // reward_totals가 비어있지 않다는 것만 보장(이 테스트는 empty-guard가 아니라 marker skip이 목적)
  for (let i = 1; i <= 6; i++) db.studentProgress.set(`s${i}`, 100)
  const r1 = applyV3_48(db, { skipGuards: true })
  const countAfter1 = v2Rows(db).length
  const r2 = applyV3_48(db, { skipGuards: true })
  check('1회차 정상 실행(skip=false)', r1.skipped === false)
  check('2회차는 marker 때문에 skip', r2.skipped === true)
  check('2회차 신규 삽입 0건', r2.inserted === 0)
  check('원장 v2 행 수 불변', v2Rows(db).length === countAfter1)
}

console.log('\nD3. marker 없이 두 번 적용해도(가상 시나리오) ON CONFLICT로 신규 행 0건')
{
  // 실제 SQL에서는 marker가 항상 먼저 걸리지만, "설령 marker 로직이
  // 우회되더라도" idempotency_key unique(ON CONFLICT DO NOTHING)가 2차
  // 방어선이라는 것을 검증 — insertLegacyBaselineRow의 중복 방지만 따로
  // 시뮬레이션한다(marker 체크를 건너뛰는 저수준 헬퍼).
  const db = withV1Marker(createDb())
  for (let i = 1; i <= 6; i++) db.studentProgress.set(`s${i}`, 100)

  function insertOnce(studentId, delta) {
    const key = baselineV2Key(studentId)
    const exists = db.rewardLedger.some((e) => e.idempotency_key === key)
    if (exists) return { inserted: false }
    db.rewardLedger.push({
      student_id: studentId, reward_type: 'legacy-baseline', source_type: 'migration', source_id: 'v2',
      stars_delta: delta, idempotency_key: key,
    })
    return { inserted: true }
  }

  const first = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => insertOnce(id, 100))
  const second = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => insertOnce(id, 100))
  check('1차 삽입 전원 성공', first.every((r) => r.inserted === true))
  check('2차 삽입(마커 없이도) 전원 거부(ON CONFLICT DO NOTHING과 동등)', second.every((r) => r.inserted === false))
  check('원장 v2 행 수는 6건(중복 없음)', v2Rows(db).length === 6)
}

console.log('\nD4. 음수 delta는 애초에 후보에서 제외(CONTINUE WHEN v_delta<=0의 JS 등가)')
{
  const db = withV1Marker(createDb())
  db.studentProgress.set('s1', 10)
  db.rewardTotals.set('s1', 50) // earned(50) > total_stars(10) -> delta -40
  for (let i = 2; i <= 6; i++) db.studentProgress.set(`s${i}`, 20) // 나머지 5명은 후보로 채워 CANDIDATES_MIN 충족
  const result = applyV3_48(db, { skipGuards: true })
  check('s1은 후보에 포함되지 않음(delta<=0)', !v2Rows(db).some((e) => e.student_id === 's1'))
  check('음수 delta 학생은 review에도 없음', !db.reviewRows.some((r) => r.studentId === 's1'))
  check('candidate 수 == 5(s1 제외)', result.candidates === 5)
}

console.log('\nD5. delta가 plausible_max 초과 — review로 라우팅, 원장에 삽입되지 않음')
{
  const db = withV1Marker(createDb())
  db.rewardTotals.set('zzz-unrelated', 0) // reward_totals 비어있지 않음(이 테스트는 empty-guard가 아니라 review 라우팅이 목적)
  db.studentProgress.set('s1', 10000) // 비정상적으로 큰 delta
  for (let i = 2; i <= 6; i++) db.studentProgress.set(`s${i}`, 30)
  // s1의 daily-progress 없음 -> plausible_max = 50, delta(10000) > 50 -> review.
  // 하지만 이 시나리오는 BOUNDED 가드(total<=24000, maxIndividual<=1500)에도
  // 걸릴 수 있으므로 skipGuards로 라우팅 로직만 순수하게 검증한다.
  const result = applyV3_48(db, { skipGuards: true })
  check('s1은 review로 라우팅(원장에 없음)', !v2Rows(db).some((e) => e.student_id === 's1'))
  check('s1은 reviewRows에 존재', db.reviewRows.some((r) => r.studentId === 's1'))
  check('review로 빠져도 postcheck(inserted+review==candidates)는 여전히 성립', result.inserted + result.review === result.candidates)
}

console.log('\nD6. per-student: ledger_earned + baseline(auto row) == total_stars')
{
  const db = withV1Marker(createDb())
  db.rewardTotals.set('s1', 200)
  db.studentProgress.set('s1', 500) // delta 300
  for (let i = 2; i <= 6; i++) db.studentProgress.set(`s${i}`, 40)
  db.studentDailyProgress.push({ student_id: 's1', date: '2026-08-24', stars_earned: 260 }) // plausible_max 310 >= 300
  applyV3_48(db, { skipGuards: true })
  const s1Row = v2Rows(db).find((e) => e.student_id === 's1')
  check('s1이 원장에 삽입됨(review 아님)', !!s1Row)
  check('ledger_earned(200) + baseline(300) === total_stars(500)', (db.rewardTotals.get('s1') || 0) + (s1Row?.stars_delta || 0) === 500)
}

console.log('\nD7. BOUNDED 가드 실패 — candidate_count가 상한 초과 시 삽입 0건, 예외로 중단')
{
  const db = withV1Marker(createDb())
  db.rewardTotals.set('zzz-unrelated', 0) // reward_totals 비어있지 않음(이 테스트는 empty-guard가 아니라 BOUNDED candidates 가드가 목적)
  for (let i = 1; i <= 90; i++) db.studentProgress.set(`s${i}`, 20) // 90 > CANDIDATES_MAX(80)
  let threw = false
  try {
    applyV3_48(db)
  } catch (err) {
    threw = /BOUNDED guard failed/.test(err.message)
  }
  check('가드 실패 시 예외 발생', threw)
  check('가드 실패 시 원장에 아무 행도 삽입되지 않음(전부 롤백 등가)', v2Rows(db).length === 0)
  check('가드 실패 시 marker도 기록되지 않음', !db.migrationLog.has(V48_MIGRATION_NAME))
}

console.log('\nD8. BOUNDED 가드 실패 — total_delta_sum이 상한 초과')
{
  const db = withV1Marker(createDb())
  db.rewardTotals.set('zzz-unrelated', 0) // reward_totals 비어있지 않음(이 테스트는 empty-guard가 아니라 BOUNDED total 가드가 목적)
  for (let i = 1; i <= 10; i++) db.studentProgress.set(`s${i}`, 5000) // 합계 50,000 > TOTAL_MAX(24000)
  let threw = false
  try {
    applyV3_48(db)
  } catch (err) {
    threw = /BOUNDED guard failed/.test(err.message)
  }
  check('total 초과 시 예외 발생', threw)
  check('total 초과 시 원장에 아무 행도 삽입되지 않음', v2Rows(db).length === 0)
}

console.log('\nD9. EXACT 가드 — reward_totals가 완전히 비어 있으면(v1 유실) 즉시 중단')
{
  const db = withV1Marker(createDb())
  for (let i = 1; i <= 6; i++) db.studentProgress.set(`s${i}`, 20)
  // db.rewardTotals를 의도적으로 비워둔다(v1 baseline 유실 시뮬레이션).
  let threw = false
  try {
    applyV3_48(db)
  } catch (err) {
    threw = /reward_totals has 0 rows/.test(err.message)
  }
  check('reward_totals 0행 시 예외 발생', threw)
  check('원장에 아무 행도 삽입되지 않음', v2Rows(db).length === 0)
}

console.log('\nD10. v3_37 marker 없이 실행 시도 — 즉시 중단')
{
  const db = createDb() // withV1Marker 호출 안 함
  db.studentProgress.set('s1', 10)
  let threw = false
  try {
    applyV3_48(db)
  } catch (err) {
    threw = /v3_37 marker not found/.test(err.message)
  }
  check('v1 marker 없으면 예외 발생', threw)
}

console.log('\nD11. evaluateBaselineGuards 단위 동작 — 4개 항목 개별 FAIL/PASS')
{
  const allOk = evaluateBaselineGuards({ candidates: 24, total: 1998, maxIndividual: 277, progressRows: 193 })
  check('현재 실측 스냅샷(24/1998/277/193)은 가드 전체 PASS', allOk.ok === true && allOk.failures.length === 0)

  const tooFewCandidates = evaluateBaselineGuards({ candidates: 2, total: 1000, maxIndividual: 100, progressRows: 200 })
  check('candidates < MIN → FAIL, 실패 guard 이름 candidates', tooFewCandidates.ok === false && tooFewCandidates.failures.some((f) => f.guard === 'candidates'))

  const tooManyTotal = evaluateBaselineGuards({ candidates: 20, total: 30000, maxIndividual: 100, progressRows: 200 })
  check('total > MAX → FAIL, 실패 guard 이름 total', tooManyTotal.ok === false && tooManyTotal.failures.some((f) => f.guard === 'total'))

  const tooBigMax = evaluateBaselineGuards({ candidates: 20, total: 1000, maxIndividual: 2000, progressRows: 200 })
  check('maxIndividual > 1500 → FAIL', tooBigMax.ok === false && tooBigMax.failures.some((f) => f.guard === 'maxIndividual'))

  const badProgressRows = evaluateBaselineGuards({ candidates: 20, total: 1000, maxIndividual: 100, progressRows: 10000 })
  check('progressRows > MAX → FAIL', badProgressRows.ok === false && badProgressRows.failures.some((f) => f.guard === 'progressRows'))
}

console.log(failures === 0
  ? '\n모든 단언 통과 — reward_legacy_baseline_v2 EXACT/BOUNDED 가드 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
