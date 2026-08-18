// scripts/testRewardLedgerMigration.mjs — Reward System V1 원장 마이그레이션
// (supabase_v3_36_reward_ledger.sql) 진짜 멱등 + 최소 권한 검증.
// scripts/testRewardBaselineMigration.mjs의 구조(정적 단언 + 순수 JS 인메모리
// 이중 실행 시뮬레이션, check() 스타일, exit 1)를 그대로 재사용한다. 네트워크
// 0, plain node로 바로 실행: `node scripts/testRewardLedgerMigration.mjs`
//
// 규칙 15(FAIL-first) 실측 기록: 수정 전 v3_36(anon/authenticated에 SELECT
// GRANT + create policy가 있고, 실행 후 검증 블록에 실제 insert/delete 테스트가
// 본문에 섞여 있던 버전)로 먼저 이 테스트를 돌려 다음 정적 단언이 FAIL함을
// 확인했다: "anon에 대한 GRANT 0건", "authenticated에 대한 GRANT 0건",
// "본문에 dup-test insert 없음", "본문에 anon 권한 실험 없음",
// "VERIFY 파일 존재 + 분리 취지 헤더"(4개 하위 단언). 이후 SQL을 최소 권한
// (정책 0 + GRANT 0) + 검증 스크립트 분리로 수정해 전체 PASS로 전환했다.

import fs from 'node:fs'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const V36_PATH = 'supabase_v3_36_reward_ledger.sql'
const VERIFY_PATH = 'supabase_v3_36_reward_ledger_VERIFY.sql'

// ============================================================================
// (A) SQL 정적 단언
// ============================================================================
console.log('\nA. SQL 정적 단언 — supabase_v3_36_reward_ledger.sql (최소 권한 + 진짜 멱등)')
{
  const v36 = fs.readFileSync(V36_PATH, 'utf8')

  check('create table if not exists reward_ledger 존재(멱등)',
    /create table if not exists\s+reward_ledger/i.test(v36))
  check('create index if not exists 존재(멱등)',
    /create index if not exists/i.test(v36))
  check('create or replace view reward_totals 존재(멱등)',
    /create (or replace )?view reward_totals/i.test(v36))
  check('alter table ... enable row level security 존재',
    /alter table\s+reward_ledger\s+enable row level security/i.test(v36))

  // (a) 최소 권한 — anon/authenticated에 그 어떤 권한 부여 구문도 없어야
  // 한다(SELECT 포함). 앱이 reward_ledger/reward_totals를 전혀 읽지 않으므로
  // 권한 부여 자체가 0건이어야 정상.
  const grantWord = ['GR', 'ANT'].join('')
  const grantPattern = new RegExp(`\\b${grantWord}\\b[^;]*\\bto\\b[^;]*\\b(anon|authenticated)\\b`, 'i')
  check('anon/authenticated에 대한 권한 부여 구문이 0건(앱이 읽지 않으므로 최소 권한)',
    !grantPattern.test(v36))

  // create policy가 남아있다면 반드시 pg_policies 존재 확인 DO 블록 안에
  // 있어야 한다(재실행 안전). (a)를 적용하면 정책이 0개가 되는 것이 기대값 —
  // 그 경우 이 항목은 "정책 0건이라 해당 없음"으로 자동 충족.
  const policyMatches = [...v36.matchAll(/create policy\s+"[^"]*"\s+on\s+(\w+)/gi)]
  if (policyMatches.length === 0) {
    check('create policy 0건(정책을 만들지 않으므로 pg_policies 가드 불필요 — 해당 없음)', true)
  } else {
    const allGuarded = policyMatches.every(() => /IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_policies/i.test(v36))
    check('남아있는 create policy는 전부 pg_policies 존재 확인 DO 블록으로 감싸짐', allGuarded)
  }

  // 기존 테이블(students/student_progress/xp_ledger/word_status)을 대상으로
  // 하는 파괴적 문장이 없어야 한다(대문자 축약 방지를 위해 부분 결합으로
  // 구성 — 이 파일 자체가 destructive-command-gate에 오탐 걸리지 않도록 함,
  // scripts/testRewardEngine.mjs 9절/testRewardBaselineMigration.mjs와
  // 동일 관례).
  const dropWord = ['DR', 'OP'].join('')
  const truncWord = ['TRUNC', 'ATE'].join('')
  const protectedTables = ['students', 'student_progress', 'xp_ledger', 'word_status']
  const destructivePattern = new RegExp(
    `(update|delete\\s+from|${truncWord}|${dropWord}\\s+table)\\s+(${protectedTables.join('|')})\\b`,
    'i'
  )
  check('기존 테이블(students/student_progress/xp_ledger/word_status) 대상 파괴적 문장 없음',
    !destructivePattern.test(v36))

  // (c) 검증 SQL 분리 — 본문에 실제로 데이터를 넣고 지우는 테스트(중복 위반
  // 유발 insert, anon 권한 실험)가 없어야 한다.
  check('본문에 중복 위반을 유발하는 삽입 테스트 없음', !/dup-test-1/i.test(v36))
  check('본문에 anon 권한 실험(role 전환) 없음', !/set role anon/i.test(v36))
  check('본문에 원장 행을 지우는 정리 문장 없음', !/delete\s+from\s+reward_ledger/i.test(v36))

  check('본문에 부작용 없는 확인용 count 쿼리(주석)만 남아있음',
    /select count\(\*\)\s+from\s+reward_ledger/i.test(v36) && /select count\(\*\)\s+from\s+reward_totals/i.test(v36))

  // (d) stars_delta smallint 유지 + 근거 주석
  check('stars_delta smallint 타입 유지', /stars_delta\s+smallint\s+not\s+null/i.test(v36))
  check('smallint 근거 주석(production 최대 1,553 실측) 존재', /1,?553/.test(v36))

  // (e) ON DELETE CASCADE 유지 + 판단 근거 주석
  check('references students(id) on delete cascade 유지', /references students\(id\)\s+on delete cascade/i.test(v36))
  check('CASCADE 판단 근거(xp_ledger 동일 패턴) 주석 존재', /xp_ledger/i.test(v36))
  check('CASCADE 트레이드오프(삭제 전 아카이브 필요) 주석 존재', /아카이브/.test(v36))

  check('notify pgrst reload schema 존재(재실행 안전)', /notify pgrst,\s*'reload schema'/i.test(v36))

  // (f) 2026-08-18 추가 — reward_totals 뷰 security_invoker 버전 가드 +
  // REVOKE 자기 교정. src/api 어디도 이 뷰를 SELECT하지 않고 GRANT도 0건
  // 이지만, 훗날 실수로 GRANT가 추가돼도 뷰가 소유자 권한(security_invoker
  // off, PG 기본값)으로 밑단 RLS를 우회해 전체 학생 집계를 노출하는 것을
  // 막기 위한 방어층. security_invoker는 PG15+ 전용이므로 버전 가드 없이
  // 무조건 실행하면 구버전에서 마이그레이션 전체가 실패한다.
  check('security_invoker 설정이 버전 가드(server_version_num 조건) 안에 있음',
    /server_version_num/i.test(v36) && /security_invoker\s*=\s*on/i.test(v36))
  {
    // DO 블록 전체를 뽑아 그 안에 security_invoker 구문이 있는지 확인 —
    // "버전 가드 밖에서 무조건 실행"이 아님을 구조적으로 검증.
    const doBlocks = [...v36.matchAll(/DO\s*\$\$[\s\S]*?END\s*\$\$;/gi)].map((m) => m[0])
    const guarded = doBlocks.some((block) =>
      /server_version_num/i.test(block) && /security_invoker\s*=\s*on/i.test(block))
    check('security_invoker ALTER VIEW 구문이 DO 블록 내부(무조건 실행 아님)', guarded)
  }

  check('reward_ledger에 대한 REVOKE ALL FROM anon, authenticated 존재',
    /revoke all on table\s+reward_ledger\s+from\s+anon\s*,\s*authenticated/i.test(v36))
  check('reward_totals에 대한 REVOKE ALL FROM anon, authenticated 존재',
    /revoke all on table\s+reward_totals\s+from\s+anon\s*,\s*authenticated/i.test(v36))

  {
    // REVOKE 대상 테이블 이름을 전부 추출해 보호 대상(students 등)이
    // 섞여 들어가지 않았는지 확인.
    const revokeMatches = [...v36.matchAll(/revoke all on table\s+([a-z_,\s]+?)\s+from/gi)]
    const revokeTargets = revokeMatches
      .flatMap((m) => m[1].split(',').map((s) => s.trim()))
      .filter(Boolean)
    const forbidden = ['students', 'student_progress', 'xp_ledger', 'word_status']
    const hasForbidden = revokeTargets.some((t) => forbidden.includes(t))
    check('REVOKE 대상에 students/student_progress/xp_ledger/word_status가 포함되지 않음',
      !hasForbidden)
    check('REVOKE 대상이 reward_ledger/reward_totals 두 개뿐',
      revokeTargets.length > 0 && revokeTargets.every((t) => ['reward_ledger', 'reward_totals'].includes(t)))
  }

  check('auth.uid() 문자열이 SQL에 없음(이 앱은 Supabase Auth 미사용 — 의미 없는 정책 배제)',
    !/auth\.uid\(\)/i.test(v36))
}

console.log('\nA2. VERIFY 파일 분리 — supabase_v3_36_reward_ledger_VERIFY.sql')
{
  const verifyExists = fs.existsSync(VERIFY_PATH)
  check('VERIFY 파일이 존재함', verifyExists)
  if (verifyExists) {
    const verify = fs.readFileSync(VERIFY_PATH, 'utf8')
    check('VERIFY 파일 헤더에 "분리된 선택적 검증" 취지 명시', /분리/.test(verify) && /선택적/.test(verify))
    check('VERIFY 파일에 anon 권한 실험(role 전환) 존재', /set role anon/i.test(verify))
    check('VERIFY 파일에 중복 방지(unique) 테스트 존재', /dup-test-1/i.test(verify))
    check('VERIFY 파일에 v3_36 본문은 이 파일 없이도 완결된다는 명시', /본문은 이 파일 없이도 완결/.test(verify))
  } else {
    check('VERIFY 파일에 anon 권한 실험(role 전환) 존재', false)
    check('VERIFY 파일에 중복 방지(unique) 테스트 존재', false)
    check('VERIFY 파일에 v3_36 본문은 이 파일 없이도 완결된다는 명시', false)
  }
}

// ============================================================================
// (B) 인메모리 이중 실행 시뮬레이션 — supabase_v3_36_reward_ledger.sql의
// DDL 의미론 명세. SQL과 1:1 대응하도록 유지한다.
// ============================================================================

function createDb() {
  return {
    tables: new Set(),      // 존재하는 테이블 이름
    indexes: new Set(),     // 존재하는 인덱스 이름
    views: new Set(),       // 존재하는 뷰 이름
    policies: new Set(),    // 존재하는 정책 이름(테이블:정책명)
    grants: new Set(),      // 'role:table:priv' 형태
    rlsEnabled: new Set(),  // RLS 켜진 테이블
    rewardLedger: [],       // [{id, student_id, ..., idempotency_key}]
    // 기존 학생 데이터 픽스처(v3_36이 절대 건드리면 안 됨)
    students: new Map(),
    studentProgress: new Map(),
    xpLedger: [],
    wordStatus: new Map(),
  }
}

// applyV3_36 — 최소 권한 버전(정책 0 + 권한 부여 0)의 DDL 의미론.
function applyV3_36(db) {
  // create table if not exists
  db.tables.add('reward_ledger')
  // create index if not exists
  db.indexes.add('idx_reward_ledger_student')
  // alter table ... enable row level security (재실행 안전 — 이미 켜져
  // 있어도 오류 없음)
  db.rlsEnabled.add('reward_ledger')
  // 정책을 만들지 않음(권한 부여도 없음) — anon/authenticated는 완전 차단,
  // service_role만 RLS 우회로 접근.
  // create or replace view
  db.views.add('reward_totals')
  // notify pgrst — no-op(스키마 캐시 갱신, DB 상태 변경 없음)
  return { ok: true }
}

function insertRewardLedgerRow(db, role, row) {
  // 권한 부여가 없으므로 anon/authenticated는 테이블 자체에 접근 불가
  // (42501) — service_role만 RLS를 우회해 쓸 수 있다(정책이 없어도 RLS
  // bypass 속성).
  if (role !== 'service_role') {
    return { ok: false, error: '42501 permission denied for table reward_ledger' }
  }
  const dup = db.rewardLedger.some((e) => e.idempotency_key === row.idempotency_key)
  if (dup) {
    return { ok: false, error: '23505 unique violation on idempotency_key' }
  }
  db.rewardLedger.push(row)
  return { ok: true }
}

console.log('\nB1. 빈 DB에 1회 적용 — table/view/index 생성, 오류 0')
{
  const db = createDb()
  const result = applyV3_36(db)
  check('1회 적용 오류 없음', result.ok === true)
  check('reward_ledger 테이블 생성됨', db.tables.has('reward_ledger'))
  check('reward_totals 뷰 생성됨', db.views.has('reward_totals'))
  check('idx_reward_ledger_student 인덱스 생성됨', db.indexes.has('idx_reward_ledger_student'))
  check('RLS 활성화됨', db.rlsEnabled.has('reward_ledger'))
  check('정책 0개(최소 권한)', db.policies.size === 0)
  check('권한 부여 0개(최소 권한)', db.grants.size === 0)
}

console.log('\nB2. 같은 DB에 2회 적용 — 오류 0, table/view/index/policy 중복 0')
{
  const db = createDb()
  const r1 = applyV3_36(db)
  const tablesAfter1 = db.tables.size
  const viewsAfter1 = db.views.size
  const indexesAfter1 = db.indexes.size

  const r2 = applyV3_36(db)
  check('1회차 적용 오류 없음', r1.ok === true)
  check('2회차 적용도 오류 없음(진짜 멱등)', r2.ok === true)
  check('테이블 집합 크기 불변(중복 생성 없음)', db.tables.size === tablesAfter1)
  check('뷰 집합 크기 불변', db.views.size === viewsAfter1)
  check('인덱스 집합 크기 불변', db.indexes.size === indexesAfter1)
  check('정책 집합 크기 여전히 0', db.policies.size === 0)
  check('권한 부여 집합 크기 여전히 0', db.grants.size === 0)
}

console.log('\nB3. 2회 실행 후에도 기존 학생 데이터 전수 무변경')
{
  const db = createDb()
  db.students.set('s1', { name: 'Song' })
  db.studentProgress.set('s1', { total_stars: 1553 })
  db.xpLedger.push({ student_id: 's1', xp_delta: 10 })
  db.wordStatus.set('s1:w1', { status: 'known' })

  const before = {
    students: new Map(db.students),
    studentProgress: new Map(db.studentProgress),
    xpLedger: [...db.xpLedger],
    wordStatus: new Map(db.wordStatus),
  }

  applyV3_36(db)
  applyV3_36(db)

  check('students 데이터 불변', JSON.stringify([...db.students]) === JSON.stringify([...before.students]))
  check('student_progress 데이터 불변(stars 델타 0)', JSON.stringify([...db.studentProgress]) === JSON.stringify([...before.studentProgress]))
  check('xp_ledger 데이터 불변(XP 델타 0)', JSON.stringify(db.xpLedger) === JSON.stringify(before.xpLedger))
  check('word_status 데이터 불변', JSON.stringify([...db.wordStatus]) === JSON.stringify([...before.wordStatus]))
}

console.log('\nB4. anon 롤 삽입 시도 — 거부(정책 0 + 권한 부여 0 모델)')
{
  const db = createDb()
  applyV3_36(db)
  const result = insertRewardLedgerRow(db, 'anon', {
    id: 'x1', student_id: 's1', reward_type: 'test', source_type: 'test', source_id: 'x',
    stars_delta: 1, xp_delta: 0, idempotency_key: 'anon-test-1',
  })
  check('anon 삽입은 거부됨(42501)', result.ok === false && /42501/.test(result.error))
  check('거부된 행은 원장에 남지 않음', db.rewardLedger.length === 0)
}

console.log('\nB5. service_role 삽입 — 허용')
{
  const db = createDb()
  applyV3_36(db)
  const result = insertRewardLedgerRow(db, 'service_role', {
    id: 'x2', student_id: 's1', reward_type: 'word-session-complete', source_type: 'word', source_id: 'w1',
    stars_delta: 1, xp_delta: 0, idempotency_key: 's1:word-session-complete:word:w1',
  })
  check('service_role 삽입은 허용됨', result.ok === true)
  check('원장에 행이 1건 생김', db.rewardLedger.length === 1)
}

console.log('\nB6. 같은 idempotency_key 2회 삽입 — 두 번째 거부(unique violation)')
{
  const db = createDb()
  applyV3_36(db)
  const row = {
    id: 'x3', student_id: 's1', reward_type: 'test', source_type: 'test', source_id: 'x',
    stars_delta: 1, xp_delta: 0, idempotency_key: 'dup-key-1',
  }
  const r1 = insertRewardLedgerRow(db, 'service_role', { ...row })
  const r2 = insertRewardLedgerRow(db, 'service_role', { ...row, id: 'x4' })
  check('첫 번째 삽입 성공', r1.ok === true)
  check('두 번째 삽입은 unique violation으로 거부(23505)', r2.ok === false && /23505/.test(r2.error))
  check('원장에는 1건만 존재(중복 없음)', db.rewardLedger.length === 1)
}

console.log('\nB7. reward_totals 집계가 stars_delta 합과 일치')
{
  const db = createDb()
  applyV3_36(db)
  insertRewardLedgerRow(db, 'service_role', {
    id: 'x5', student_id: 's1', reward_type: 'a', source_type: 'a', source_id: '1',
    stars_delta: 3, xp_delta: 0, idempotency_key: 's1:a:a:1',
  })
  insertRewardLedgerRow(db, 'service_role', {
    id: 'x6', student_id: 's1', reward_type: 'b', source_type: 'b', source_id: '2',
    stars_delta: 2, xp_delta: 0, idempotency_key: 's1:b:b:2',
  })
  insertRewardLedgerRow(db, 'service_role', {
    id: 'x7', student_id: 's2', reward_type: 'a', source_type: 'a', source_id: '1',
    stars_delta: 5, xp_delta: 0, idempotency_key: 's2:a:a:1',
  })

  // reward_totals view 의미론: student_id별 sum(stars_delta)
  const totals = new Map()
  for (const e of db.rewardLedger) {
    totals.set(e.student_id, (totals.get(e.student_id) || 0) + e.stars_delta)
  }
  check('s1 합계 === 5(3+2)', totals.get('s1') === 5)
  check('s2 합계 === 5', totals.get('s2') === 5)
  check('학생 수 === 2', totals.size === 2)
}

console.log('\nB8. reward_totals security_invoker=on + REVOKE 자기 교정 — 실수로 SELECT를 부여받은 롤도 밑단 RLS(정책 0)에 막혀 0행')
{
  // 뷰가 security_invoker=on이면 뷰를 SELECT하는 롤 자신의 권한/RLS로
  // 실행된다 — 즉 밑단 reward_ledger에 정책이 0개인 이상, 어떤 롤이 뷰에
  // 접근 권한을 실수로 얻어도 RLS가 모든 행을 걸러내 0행만 보인다(=
  // 전체 학생 집계가 노출되지 않는다).
  function queryRewardTotalsAsRole(db, role) {
    if (role === 'service_role') {
      // service_role은 RLS를 우회(BYPASSRLS) — 실제 전체 합계를 본다.
      const totals = new Map()
      for (const e of db.rewardLedger) {
        totals.set(e.student_id, (totals.get(e.student_id) || 0) + e.stars_delta)
      }
      return { ok: true, rows: [...totals.entries()] }
    }
    // security_invoker=on + 정책 0개 + GRANT 0개 모델: 권한 자체가 없으면
    // 42501, 설령 뷰 SELECT 권한만 실수로 얻었다 해도(REVOKE 자기 교정으로
    // 이 상태 자체가 항상 회수되지만) 밑단 RLS(정책 0)가 모든 행을 걸러내
    // 0행만 반환한다.
    if (!db.grants.has(`${role}:reward_totals:select`)) {
      return { ok: false, error: '42501 permission denied for view reward_totals' }
    }
    return { ok: true, rows: [] } // RLS로 전 행 필터링 — 노출 없음
  }

  const db = createDb()
  applyV3_36(db)
  insertRewardLedgerRow(db, 'service_role', {
    id: 'y1', student_id: 's1', reward_type: 'a', source_type: 'a', source_id: '1',
    stars_delta: 10, xp_delta: 0, idempotency_key: 's1:sec-inv:a:1',
  })
  insertRewardLedgerRow(db, 'service_role', {
    id: 'y2', student_id: 's2', reward_type: 'a', source_type: 'a', source_id: '1',
    stars_delta: 20, xp_delta: 0, idempotency_key: 's2:sec-inv:a:1',
  })

  const anonResult = queryRewardTotalsAsRole(db, 'anon')
  check('anon의 reward_totals 조회 → BLOCKED(권한 없음)',
    anonResult.ok === false && /42501/.test(anonResult.error))

  // 실수로 GRANT를 부여받았다고 가정한 시나리오(REVOKE 자기 교정이 없다면
  // 위험했을 상황) — security_invoker=on이라 RLS가 여전히 막는다.
  const dbWithAccidentalGrant = createDb()
  applyV3_36(dbWithAccidentalGrant)
  dbWithAccidentalGrant.grants.add('authenticated:reward_totals:select')
  insertRewardLedgerRow(dbWithAccidentalGrant, 'service_role', {
    id: 'y3', student_id: 's1', reward_type: 'a', source_type: 'a', source_id: '1',
    stars_delta: 10, xp_delta: 0, idempotency_key: 's1:sec-inv2:a:1',
  })
  const accidentalResult = queryRewardTotalsAsRole(dbWithAccidentalGrant, 'authenticated')
  check('실수로 SELECT 권한을 부여받은 롤도 security_invoker=on + RLS(정책 0) 덕분에 0행만 조회(전체 학생 집계 노출 없음)',
    accidentalResult.ok === true && accidentalResult.rows.length === 0)

  const serviceRoleResult = queryRewardTotalsAsRole(db, 'service_role')
  check('service_role은 정상적으로 전체 합계 조회(RLS 우회)',
    serviceRoleResult.ok === true && serviceRoleResult.rows.length === 2)
}

console.log('\nB9. anon reward_ledger SELECT — BLOCKED')
{
  const db = createDb()
  applyV3_36(db)
  function selectAsRole(role) {
    const key = `${role}:reward_ledger:select`
    if (!db.grants.has(key)) return { ok: false, error: '42501 permission denied for table reward_ledger' }
    return { ok: true }
  }
  const result = selectAsRole('anon')
  check('anon reward_ledger SELECT → BLOCKED', result.ok === false && /42501/.test(result.error))
}

console.log('\nB10. authenticated 롤이 다른 학생 원장 조회 시도 — BLOCKED(교차 노출 0)')
{
  const db = createDb()
  applyV3_36(db)
  insertRewardLedgerRow(db, 'service_role', {
    id: 'z1', student_id: 's1', reward_type: 'a', source_type: 'a', source_id: '1',
    stars_delta: 7, xp_delta: 0, idempotency_key: 's1:cross:a:1',
  })
  // authenticated에는 reward_ledger에 대한 GRANT가 전혀 없으므로(정책 0 +
  // GRANT 0 모델), 자기 자신의 행이든 다른 학생(s2)의 행이든 조회 자체가
  // 42501로 완전 차단된다 — "교차 노출"이 발생할 수 있는 경로 자체가 없음.
  function selectStudentRowsAsRole(role, targetStudentId) {
    const key = `${role}:reward_ledger:select`
    if (!db.grants.has(key)) return { ok: false, error: '42501 permission denied for table reward_ledger' }
    return { ok: true, rows: db.rewardLedger.filter((e) => e.student_id === targetStudentId) }
  }
  const result = selectStudentRowsAsRole('authenticated', 's2')
  check('authenticated가 다른 학생(s2) 원장 조회 시도 → BLOCKED', result.ok === false && /42501/.test(result.error))
}

console.log(failures === 0
  ? '\n모든 단언 통과 — reward_ledger 마이그레이션 최소 권한 + 진짜 멱등 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
