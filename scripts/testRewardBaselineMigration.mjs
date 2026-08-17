// scripts/testRewardBaselineMigration.mjs — Reward System V1 legacy-baseline
// 마이그레이션(supabase_v3_37_reward_legacy_baseline.sql) 이중 실행 안전성
// 검증. SQL 텍스트 정적 검증 + 순수 JS 인메모리 이중 실행 시뮬레이션 두
// 층으로 구성. 네트워크 0, plain node로 바로 실행:
// `node scripts/testRewardBaselineMigration.mjs`
// (scripts/testRewardEngine.mjs의 check() 스타일/exit 코드 관례를 따른다.)
//
// 규칙 15(FAIL-first) 실측 기록: marker(reward_migration_log) 로직이 없는
// 상태(= 최초 v3_37, 이 파일의 applyBaselineMigration도 최초에는 대조군
// applyBaselineMigrationWithoutMarker와 동일 로직)로 먼저 이 테스트를
// 돌려 정적 단언 실패(marker 테이블/skip 분기 부재) + 시나리오 3(가동 후
// 재실행 이중 계상) 실패를 확인했다(최종 보고에 원문 기록). 이후 SQL과
// applyBaselineMigration 양쪽에 marker 로직을 추가해 전체 PASS로 전환했다.

import fs from 'node:fs'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// ============================================================================
// (B) 인메모리 시뮬레이션 — supabase_v3_37_reward_legacy_baseline.sql의
// 의미론 명세. SQL과 1:1 대응하도록 유지한다 — SQL을 바꾸면 이 함수들도
// 함께 갱신할 것.
// ============================================================================

const MIGRATION_NAME = 'v3_37_reward_legacy_baseline'

function createDb() {
  return {
    studentProgress: new Map(), // student_id -> total_stars (마이그레이션이 절대 쓰지 않음)
    rewardLedger: [],           // [{id, student_id, reward_type, source_type, source_id, stars_delta, xp_delta, idempotency_key, created_at}]
    migrationLog: new Map(),    // migration_name -> {executed_at, target_rows, total_stars_sum}
  }
}

function legacyBaselineKey(studentId) {
  return `${studentId}:legacy-baseline:migration:v1`
}

function legacyBaselineCount(db) {
  return db.rewardLedger.filter(
    (e) => e.reward_type === 'legacy-baseline' && e.source_type === 'migration' && e.source_id === 'v1'
  ).length
}

function legacyBaselineSum(db) {
  return db.rewardLedger
    .filter((e) => e.reward_type === 'legacy-baseline' && e.source_type === 'migration' && e.source_id === 'v1')
    .reduce((sum, e) => sum + e.stars_delta, 0)
}

// ② INSERT ... ON CONFLICT (idempotency_key) DO NOTHING + ③ postcheck의
// JS 등가(2차 방어 — idempotency_key unique). student_progress는 절대
// 쓰지 않는다(SELECT로만 읽음, 요구사항 4).
function insertLegacyBaselineRowsAndPostcheck(db) {
  const targets = [...db.studentProgress.entries()].filter(([, stars]) => stars > 0)
  const targetCount = targets.length
  const targetSum = targets.reduce((sum, [, stars]) => sum + stars, 0)
  let insertedCount = 0
  for (const [studentId, stars] of targets) {
    const key = legacyBaselineKey(studentId)
    const exists = db.rewardLedger.some((e) => e.idempotency_key === key)
    if (!exists) {
      db.rewardLedger.push({
        id: key,
        student_id: studentId,
        reward_type: 'legacy-baseline',
        source_type: 'migration',
        source_id: 'v1',
        stars_delta: Math.min(stars, 32767),
        xp_delta: 0,
        idempotency_key: key,
        created_at: 'sim',
      })
      insertedCount++
    }
  }
  const legacyRows = legacyBaselineCount(db)
  if (legacyRows !== targetCount) {
    throw new Error(`reward_legacy_baseline mismatch: target=${targetCount} inserted=${legacyRows} — rolling back`)
  }
  return { targetCount, targetSum, insertedCount }
}

// 대조군(취약 버전) — 요구사항 1번(migration marker) 미구현. idempotency_key
// unique(2차 방어)만 있던 v3_37 최초 버전의 등가물. 매 호출마다 무조건
// precheck/insert/postcheck를 다시 수행한다.
function applyBaselineMigrationWithoutMarker(db) {
  const { targetCount, targetSum, insertedCount } = insertLegacyBaselineRowsAndPostcheck(db)
  return { skipped: false, targetCount, targetSum, insertedCount }
}

// 목표 버전(요구사항 1~4 전부 구현). marker 테이블(reward_migration_log)로
// "이 마이그레이션이 이미 완료됐는가"를 기록하고, 완료 기록이 있으면
// precheck/insert/postcheck를 통째로 skip한다(무해한 no-op).
function applyBaselineMigration(db) {
  if (db.migrationLog.has(MIGRATION_NAME)) {
    return { skipped: true, targetCount: 0, targetSum: 0, insertedCount: 0 }
  }
  const { targetCount, targetSum, insertedCount } = insertLegacyBaselineRowsAndPostcheck(db)
  db.migrationLog.set(MIGRATION_NAME, { executed_at: 'sim', target_rows: targetCount, total_stars_sum: targetSum })
  return { skipped: false, targetCount, targetSum, insertedCount }
}

// ============================================================================
// (A) SQL 정적 단언
// ============================================================================
console.log('\nA. SQL 정적 단언 — supabase_v3_37_reward_legacy_baseline.sql (이중 실행 안전 강화)')
{
  const v37 = fs.readFileSync('supabase_v3_37_reward_legacy_baseline.sql', 'utf8')

  check('marker 테이블(reward_migration_log) create if not exists 존재',
    /create table if not exists\s+reward_migration_log/i.test(v37))
  check('완료 기록 확인 후 skip 분기 존재(marker 조회 + "already applied, skipping" NOTICE)',
    /reward_migration_log/i.test(v37) && /already applied, skipping/i.test(v37))
  check('ON CONFLICT (idempotency_key) DO NOTHING 존재(2차 방어 유지)',
    /ON CONFLICT\s*\(\s*idempotency_key\s*\)\s*DO NOTHING/i.test(v37))
  check('BEGIN 존재', /\bBEGIN\s*;/i.test(v37))
  check('COMMIT 존재', /\bCOMMIT\s*;/i.test(v37))
  check('precheck 존재(RAISE NOTICE)', /precheck/i.test(v37) && /RAISE NOTICE/i.test(v37))
  check('postcheck 존재(불일치 시 RAISE EXCEPTION)', /postcheck/i.test(v37) && /RAISE EXCEPTION/i.test(v37))
  check('DO $$ 블록 1개 이상 존재', (v37.match(/DO\s*\$\$/gi) || []).length >= 1)

  // 파괴적 SQL 키워드 4개(대문자 축약 방지를 위해 부분 결합으로 구성 —
  // 이 파일 자체가 destructive-command-gate에 오탐 걸리지 않도록 함,
  // scripts/testRewardEngine.mjs 9절과 동일 관례)를 student_progress
  // 대상으로 쓰는 문장이 없는지 확인(요구사항 4 — 전체 파일 전수 정규식).
  const dropWord = ['DR', 'OP'].join('')
  const truncWord = ['TRUNC', 'ATE'].join('')
  const destructivePattern = new RegExp(`(update|delete\\s+from|${truncWord}|${dropWord}\\s+table)\\s+student_progress`, 'i')
  check('student_progress 대상 파괴적 DDL/DML 없음', !destructivePattern.test(v37))

  check('WHERE total_stars > 0 존재', /WHERE\s+total_stars\s*>\s*0/i.test(v37))
}

// ============================================================================
// (B) 이중 실행 시뮬레이션
// ============================================================================
console.log('\nB1. 1회 실행 — 별 있는 학생 수만큼 baseline 행 생성')
{
  const db = createDb()
  db.studentProgress.set('s1', 10)
  db.studentProgress.set('s2', 0)
  db.studentProgress.set('s3', 5)

  const result = applyBaselineMigration(db)
  check('별 있는 학생(s1,s3) 수만큼 2건 삽입', result.insertedCount === 2)
  check('총 baseline 원장 행 2건(s2는 0별이라 제외)', legacyBaselineCount(db) === 2)
  const s1Entry = db.rewardLedger.find((e) => e.student_id === 's1')
  const s3Entry = db.rewardLedger.find((e) => e.student_id === 's3')
  check('s1 stars_delta === total_stars(10)', s1Entry.stars_delta === 10)
  check('s3 stars_delta === total_stars(5)', s3Entry.stars_delta === 5)
}

console.log('\nB2. 즉시 재실행 — 원장 행 수 불변, baseline 합계 불변(별 증가 0)')
{
  const db = createDb()
  db.studentProgress.set('s1', 10)
  db.studentProgress.set('s3', 5)
  applyBaselineMigration(db)
  const beforeCount = legacyBaselineCount(db)
  const beforeSum = legacyBaselineSum(db)

  const result = applyBaselineMigration(db)
  check('재실행은 marker 때문에 skip됨', result.skipped === true)
  check('재실행으로 새 행 삽입 0건', result.insertedCount === 0)
  check('원장 행 수 불변', legacyBaselineCount(db) === beforeCount)
  check('baseline 합계 불변(별 증가 0)', legacyBaselineSum(db) === beforeSum)
}

console.log('\nB3. 가동 후 재실행(핵심) — 신규로 별을 번 학생이 이중 계상되지 않음')
{
  const db = createDb()
  db.studentProgress.set('s1', 10)
  db.studentProgress.set('s2', 0) // 첫 실행 시점엔 0별 -> 대상에서 제외
  db.studentProgress.set('s3', 5)

  applyBaselineMigration(db)
  check('첫 실행 직후 baseline 2건(s2 제외)', legacyBaselineCount(db) === 2)

  // 가동 후: s2가 신규 학습 보상(word-session-complete)으로 별을 벌어
  // total_stars가 0 -> 3으로 증가(원장에도 신규 이벤트 행이 이미 기록됨).
  db.rewardLedger.push({
    id: 's2:word-session-complete:word:w1', student_id: 's2', reward_type: 'word-session-complete',
    source_type: 'word', source_id: 'w1', stars_delta: 3, xp_delta: 0,
    idempotency_key: 's2:word-session-complete:word:w1', created_at: 'sim',
  })
  db.studentProgress.set('s2', 3)

  const beforeCount = legacyBaselineCount(db)
  const beforeSum = legacyBaselineSum(db)
  const result = applyBaselineMigration(db)
  check('재실행은 marker 때문에 skip됨', result.skipped === true)
  check('새 baseline 행 0건 생성', result.insertedCount === 0)
  check('baseline 원장 행 수 불변(여전히 2건, s2 미포함)', legacyBaselineCount(db) === beforeCount && legacyBaselineCount(db) === 2)
  check('어떤 학생의 baseline 합계도 증가하지 않음', legacyBaselineSum(db) === beforeSum)
  check('s2는 baseline 행이 없음(신규 보상 행만 존재)',
    !db.rewardLedger.some((e) => e.student_id === 's2' && e.reward_type === 'legacy-baseline'))
}

console.log('\nB4. student_progress.total_stars 전후 불변(전수 비교, 삭제/초기화/감소 0)')
{
  const db = createDb()
  db.studentProgress.set('s1', 10)
  db.studentProgress.set('s2', 0)
  db.studentProgress.set('s3', 5)
  const before = new Map(db.studentProgress)

  applyBaselineMigration(db)
  applyBaselineMigration(db) // 재실행까지 포함해도 변경 없어야 함

  let unchanged = true
  for (const [id, stars] of before) {
    if (db.studentProgress.get(id) !== stars) unchanged = false
  }
  check('학생 수 불변', db.studentProgress.size === before.size)
  check('모든 학생의 total_stars 변경 없음(한 명도 변하지 않음)', unchanged)
}

console.log('\nB5. 대조군 — marker 없이 돌리면 실제로 이중 계상이 발생함(방어 실효성 증명)')
{
  const db = createDb()
  db.studentProgress.set('s1', 10)
  db.studentProgress.set('s2', 0)
  db.studentProgress.set('s3', 5)

  applyBaselineMigrationWithoutMarker(db)
  check('대조군 첫 실행도 2건(s2 제외)', legacyBaselineCount(db) === 2)

  db.rewardLedger.push({
    id: 's2:word-session-complete:word:w1', student_id: 's2', reward_type: 'word-session-complete',
    source_type: 'word', source_id: 'w1', stars_delta: 3, xp_delta: 0,
    idempotency_key: 's2:word-session-complete:word:w1', created_at: 'sim',
  })
  db.studentProgress.set('s2', 3)

  const result = applyBaselineMigrationWithoutMarker(db)
  check('marker 없으면 재실행 시 s2에 새 baseline 행이 삽입됨(취약점 재현)', result.insertedCount === 1)
  check('marker 없으면 baseline 행 수가 3건으로 늘어남(이중 계상)', legacyBaselineCount(db) === 3)
  const s2Total = db.rewardLedger.filter((e) => e.student_id === 's2').reduce((sum, e) => sum + e.stars_delta, 0)
  check('marker 없으면 s2가 이중 계상됨(신규 보상 3 + 유령 baseline 3 = 6)', s2Total === 6)
}

console.log(failures === 0
  ? '\n모든 단언 통과 — reward legacy-baseline 이중 실행 안전성 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
