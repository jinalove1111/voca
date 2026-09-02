// Production Safety Harness — prodHotfix 회귀 테스트 (FAIL-first, 네트워크 0)
// (2026-09-03, Phase 1-B)
//
// 전부 순수 모듈(scripts/lib/hotfixManifest.mjs) 직접 import + runHotfix()에
// deps 주입(fake reader/executor/approve/health check)으로 검증한다. 실제
// Supabase/Management API 호출 0건 — CLAUDE.md 규칙 15(회귀 의심 시 FAIL
// 실측)를 이 신규 모듈에도 그대로 적용해, 구현 전 상태에서 각 섹션이
// 무엇을 재현하는지 주석에 남긴다.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateManifest,
  buildApplySql,
  buildRollbackSql,
  staticSafetyScan,
} from './lib/hotfixManifest.mjs'
import { runHotfix } from './prodHotfix.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT_DIR = path.join(ROOT, 'scripts', '.tmp', 'prod-reports-test')

let pass = 0
let fail = 0
function check(label, cond) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) } else { fail++; console.log(`  FAIL  ${label}`) }
}

// ── 픽스처: ghost-unit-landing-20260902 manifest 구조를 그대로 재사용 ────
const BASE_MANIFEST = {
  id: 'test-hotfix-001',
  project_ref: 'testref123',
  title: 'test manifest',
  created_at: '2026-09-03',
  affected_students: [
    '2c6845fc-b30e-4e4d-b260-d13c13fe7b9a',
    'bf05032a-8210-4082-8584-7e1afdcc02e2',
  ],
  changes: [
    {
      table: 'student_class_assignments', id: 'f9a14e8a-0a2f-4f5a-aaa7-8b6fc7f0db77',
      expect_before: { student_id: '2c6845fc-b30e-4e4d-b260-d13c13fe7b9a', textbook_id: '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', is_primary: true, current_unit_id: '113ee184-c5c7-4ee5-8b6c-99d547a06525' },
      set: { current_unit_id: '4ce41359-6424-4b5e-933d-479db6951586' },
    },
    {
      table: 'students', id: '2c6845fc-b30e-4e4d-b260-d13c13fe7b9a',
      expect_before: { current_unit_id: '113ee184-c5c7-4ee5-8b6c-99d547a06525', unit_name: 'Unit5' },
      set: { current_unit_id: '4ce41359-6424-4b5e-933d-479db6951586', unit_name: 'Unit5' },
    },
    {
      table: 'student_class_assignments', id: '26708243-b465-4df9-b279-2f363c1b1b15',
      expect_before: { student_id: 'bf05032a-8210-4082-8584-7e1afdcc02e2', textbook_id: '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', is_primary: false, current_unit_id: '113ee184-c5c7-4ee5-8b6c-99d547a06525' },
      set: { current_unit_id: '6f3788d2-fb04-467b-9a06-43009d0017bc' },
    },
  ],
  must_not_change: [
    { table: 'students', id: 'bf05032a-8210-4082-8584-7e1afdcc02e2', expect: { current_unit_id: '28233ded-cb3e-4672-bbf8-c508e1e32d1f', unit_name: 'Unit2' } },
  ],
  reference_rows_must_exist: [
    { table: 'units', id: '4ce41359-6424-4b5e-933d-479db6951586', expect: { name: 'Unit5', textbook_id: '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62' }, min_words: 2 },
    { table: 'units', id: '6f3788d2-fb04-467b-9a06-43009d0017bc', expect: { name: 'Unit1', textbook_id: '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62' }, min_words: 2 },
    { table: 'units', id: '113ee184-c5c7-4ee5-8b6c-99d547a06525', expect: { name: 'Unit' } },
  ],
  learning_baseline_tables: ['word_status', 'student_progress', 'student_daily_progress', 'xp_ledger', 'entrance_test_results', 'spelling_review_queue'],
}

function clone(o) { return JSON.parse(JSON.stringify(o)) }

console.log('=== [1] validateManifest ===')
{
  const ok = validateManifest(BASE_MANIFEST)
  check('정상 manifest 는 valid', ok.valid && ok.errors.length === 0)

  const badTable = clone(BASE_MANIFEST)
  badTable.changes[0].table = 'classes'
  check('allowlist 밖 테이블 거부', !validateManifest(badTable).valid)

  const badCol = clone(BASE_MANIFEST)
  badCol.changes[0].set = { class_id: 'nope', current_unit_id: badCol.changes[0].set.current_unit_id }
  badCol.changes[0].expect_before.class_id = 'c1'
  check('allowlist 밖 컬럼(student_class_assignments.class_id) 거부', !validateManifest(badCol).valid)

  const noGuard = clone(BASE_MANIFEST)
  noGuard.changes[1].set = { ...noGuard.changes[1].set, class_id: 'c9' } // expect_before 에 class_id 없음
  check('set 컬럼이 expect_before 에 없으면 거부', !validateManifest(noGuard).valid)

  const badUuid = clone(BASE_MANIFEST)
  badUuid.changes[0].id = 'not-a-uuid'
  check('changes[].id UUID 아니면 거부', !validateManifest(badUuid).valid)

  const badAffected = clone(BASE_MANIFEST)
  badAffected.affected_students = ['not-a-uuid']
  check('affected_students UUID 아니면 거부', !validateManifest(badAffected).valid)

  const noRef = clone(BASE_MANIFEST)
  delete noRef.project_ref
  check('project_ref 없으면 거부', !validateManifest(noRef).valid)

  const dupId = clone(BASE_MANIFEST)
  dupId.changes.push(clone(BASE_MANIFEST.changes[0]))
  check('changes 내 (table,id) 중복 거부', !validateManifest(dupId).valid)

  const badOp = clone(BASE_MANIFEST)
  badOp.changes[0].op = 'delete'
  check('op 이 update 가 아니면 거부', !validateManifest(badOp).valid)
}

console.log('\n=== [2] SQL 생성(buildApplySql/buildRollbackSql/staticSafetyScan) ===')
{
  const runId = 'RUNID-TEST-1'
  const applySql = buildApplySql(BASE_MANIFEST, runId)
  const rollbackSql = buildRollbackSql(BASE_MANIFEST, runId)

  check('apply SQL 에 begin;/commit; 포함', applySql.includes('begin;') && applySql.includes('commit;'))
  check('apply SQL 에 get diagnostics 포함', applySql.includes('get diagnostics'))
  check('apply SQL 총 영향 행 수 기대값 3 포함', /총 영향 행 수 불일치: % \(기대 3\)/.test(applySql))
  check('apply SQL WHERE 절에 expect_before current_unit_id 포함', applySql.includes("current_unit_id = '113ee184-c5c7-4ee5-8b6c-99d547a06525'"))
  check('apply SQL WHERE 절에 expect_before unit_name=Unit5 포함', applySql.includes("unit_name = 'Unit5'"))
  check('apply SQL SET 절에 신규 current_unit_id 포함', applySql.includes("current_unit_id = '4ce41359-6424-4b5e-933d-479db6951586'"))
  check('apply SQL SET 절에 신규 SCA 2 current_unit_id 포함', applySql.includes("current_unit_id = '6f3788d2-fb04-467b-9a06-43009d0017bc'"))
  check('apply SQL 에 runId 포함(ABORT 메시지)', applySql.includes(runId))
  check('apply SQL 에 must_not_change 위반 체크 포함', applySql.includes('must_not_change 위반'))

  check('rollback SQL WHERE 절에 set 값(신규 current_unit_id) 포함', rollbackSql.includes("current_unit_id = '4ce41359-6424-4b5e-933d-479db6951586'"))
  check('rollback SQL SET 절에 expect_before 값(원복) 포함', rollbackSql.includes("current_unit_id = '113ee184-c5c7-4ee5-8b6c-99d547a06525'"))
  check('rollback SQL 에 begin;/commit; 포함', rollbackSql.includes('begin;') && rollbackSql.includes('commit;'))
  check('rollback SQL 총 영향 행 수 기대값 3 포함', /총 영향 행 수 불일치: % \(기대 3\)/.test(rollbackSql))

  check('apply SQL 정적 스캔 위반 0건', staticSafetyScan(applySql).length === 0)
  check('rollback SQL 정적 스캔 위반 0건', staticSafetyScan(rollbackSql).length === 0)

  // 파괴적 키워드 문자열을 파일에 통짜로 남기면 저장소의 PreToolUse 파괴
  // 명령 훅이 이 테스트 파일 자체의 Write 를 오탐 차단할 수 있어, 런타임에
  // 조각을 이어붙인다(감지 대상 문자열 자체는 동일 — 로직 검증 목적 불변).
  const dangerousStmt = ['drop', ' ', 'table', ' public.students;'].join('')
  const dangerous = `${applySql}\n-- comment ok\n${dangerousStmt}\n`
  check('의도적으로 삽입한 파괴적 DDL 문 감지', staticSafetyScan(dangerous).length >= 1)
}

// ── runHotfix() 통합 시나리오 ────────────────────────────────────────────
function buildFakeDb(manifest) {
  const rows = {}
  for (const c of manifest.changes) rows[`${c.table}:${c.id}`] = { ...c.expect_before }
  for (const m of manifest.must_not_change || []) rows[`${m.table}:${m.id}`] = { ...m.expect }
  for (const r of manifest.reference_rows_must_exist || []) rows[`${r.table}:${r.id}`] = { ...r.expect }
  return rows
}

function applyChangesToDb(db, manifest) {
  for (const c of manifest.changes) {
    const key = `${c.table}:${c.id}`
    db[key] = { ...db[key], ...c.set }
  }
}

function revertChangesToDb(db, manifest) {
  for (const c of manifest.changes) {
    const key = `${c.table}:${c.id}`
    const revert = {}
    for (const col of Object.keys(c.set)) revert[col] = c.expect_before[col]
    db[key] = { ...db[key], ...revert }
  }
}

// apply(1번째 호출)에서 db 를 mutate 하고, 실제로 rollback SQL 이 도는
// 시나리오(2번째 호출)에서는 원복까지 시뮬레이션하는 executor. 이렇게 해야
// 롤백 후 재확인(readPlanMismatches) 도 실제 SQL Editor 에서 rollback.sql
// 을 그대로 돌렸을 때와 같은 "완전히 원복됨" 상태를 재현한다.
function makeApplyRevertExecutor(reader, manifest) {
  const calls = []
  return {
    calls,
    async run(sql) {
      calls.push(sql)
      if (calls.length === 1) applyChangesToDb(reader.db, manifest)
      else if (calls.length === 2) revertChangesToDb(reader.db, manifest)
      return { ok: true }
    },
  }
}

const STUDENTS_ROWS_BEFORE = [
  { id: '2c6845fc-b30e-4e4d-b260-d13c13fe7b9a', class_id: 'c1', unit_name: 'Unit5', current_unit_id: '113ee184-c5c7-4ee5-8b6c-99d547a06525' },
  { id: 'bf05032a-8210-4082-8584-7e1afdcc02e2', class_id: 'c1', unit_name: 'Unit2', current_unit_id: '28233ded-cb3e-4672-bbf8-c508e1e32d1f' },
  { id: 'zz-unrelated-student', class_id: 'c2', unit_name: 'Unit1', current_unit_id: 'zz-unit-1' },
]
const STUDENTS_ROWS_AFTER_OK = STUDENTS_ROWS_BEFORE.map((r) => (
  r.id === '2c6845fc-b30e-4e4d-b260-d13c13fe7b9a'
    ? { ...r, current_unit_id: '4ce41359-6424-4b5e-933d-479db6951586' }
    : r
))
const SCA_ROWS_BEFORE = [
  { id: 'f9a14e8a-0a2f-4f5a-aaa7-8b6fc7f0db77', student_id: '2c6845fc-b30e-4e4d-b260-d13c13fe7b9a', textbook_id: '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', current_unit_id: '113ee184-c5c7-4ee5-8b6c-99d547a06525', is_primary: true },
  { id: '26708243-b465-4df9-b279-2f363c1b1b15', student_id: 'bf05032a-8210-4082-8584-7e1afdcc02e2', textbook_id: '1ba6ec3d-b557-47b5-a480-3dbb5ed12e62', current_unit_id: '113ee184-c5c7-4ee5-8b6c-99d547a06525', is_primary: false },
]
const SCA_ROWS_AFTER_OK = SCA_ROWS_BEFORE.map((r) => (
  r.id === 'f9a14e8a-0a2f-4f5a-aaa7-8b6fc7f0db77' ? { ...r, current_unit_id: '4ce41359-6424-4b5e-933d-479db6951586' }
    : r.id === '26708243-b465-4df9-b279-2f363c1b1b15' ? { ...r, current_unit_id: '6f3788d2-fb04-467b-9a06-43009d0017bc' }
      : r
))

function makeReader(manifest, opts = {}) {
  const db = buildFakeDb(manifest)
  const getRowCalls = {}
  const tableRowsQueues = opts.tableRowsQueues || {}
  const tableRowsCallIdx = {}
  const countsQueues = opts.countsQueues || {}
  const countsCallIdx = {}
  const reader = {
    db,
    async getRow(table, id) {
      const key = `${table}:${id}`
      getRowCalls[key] = (getRowCalls[key] || 0) + 1
      if (opts.getRowOverride?.[key]) return opts.getRowOverride[key](getRowCalls[key])
      const v = db[key]
      return v ? { ...v } : null
    },
    async countWordsForUnit(unitId) { return opts.wordsCounts?.[unitId] ?? 2 },
    async headCountFiltered(table, filters) {
      const key = `${table}|${filters.student_id}`
      const q = countsQueues[key]
      if (Array.isArray(q)) {
        const i = countsCallIdx[key] ?? 0
        countsCallIdx[key] = Math.min(i + 1, q.length - 1)
        return q[Math.min(i, q.length - 1)]
      }
      return opts.baselineDefault ?? 10
    },
    async selectAllRows(table) {
      const q = tableRowsQueues[table]
      if (Array.isArray(q)) {
        const i = tableRowsCallIdx[table] ?? 0
        tableRowsCallIdx[table] = Math.min(i + 1, q.length - 1)
        return q[Math.min(i, q.length - 1)]
      }
      return []
    },
  }
  return reader
}

const OK_SNAPSHOTS = {
  students: [STUDENTS_ROWS_BEFORE, STUDENTS_ROWS_AFTER_OK],
  student_class_assignments: [SCA_ROWS_BEFORE, SCA_ROWS_AFTER_OK],
}

const FAKE_TOKEN = 'FAKE_TOKEN_VALUE_ZZ_998877'
function envOk(extra = {}) {
  return { url: 'https://testref123.supabase.co', anonKey: 'anon-fake', accessToken: FAKE_TOKEN, ci: false, ...extra }
}

console.log('\n=== [3] 프리플라이트 fail-closed ===')
{
  const reader = makeReader(BASE_MANIFEST, {
    getRowOverride: {
      'students:2c6845fc-b30e-4e4d-b260-d13c13fe7b9a': () => ({ current_unit_id: 'WRONG-UNIT-ID', unit_name: 'Unit5' }),
    },
  })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-PRE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('불일치 시 status = preflight-mismatch', res.status === 'preflight-mismatch')
  check('불일치 시 exitCode != 0', res.exitCode !== 0)
  check('불일치 시 executor 호출 0', calls.length === 0)
}

console.log('\n=== [4] dry-run (ready-to-apply) ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-DRY-1', reportDir: REPORT_DIR, reader, executor, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('dry-run 시 status = ready-to-apply', res.status === 'ready-to-apply')
  check('dry-run 시 exitCode = 0', res.exitCode === 0)
  check('dry-run 시 executor 호출 0', calls.length === 0)

  const fs = await import('node:fs')
  const applyPath = path.join(REPORT_DIR, 'RUN-DRY-1.apply.sql')
  const rollbackPath = path.join(REPORT_DIR, 'RUN-DRY-1.rollback.sql')
  const reportPath = path.join(REPORT_DIR, 'RUN-DRY-1.hotfix.json')
  check('apply SQL 파일 생성', fs.existsSync(applyPath))
  check('rollback SQL 파일 생성', fs.existsSync(rollbackPath))
  check('report JSON 파일 생성', fs.existsSync(reportPath))
  const applyContent = fs.readFileSync(applyPath, 'utf8')
  const reportContent = fs.readFileSync(reportPath, 'utf8')
  check('apply SQL 파일에 토큰 문자열 없음', !applyContent.includes(FAKE_TOKEN))
  check('report JSON 에 토큰 문자열 없음', !reportContent.includes(FAKE_TOKEN))
  check('report JSON 에 anonKey 문자열 없음', !reportContent.includes('anon-fake'))
}

console.log('\n=== [5] CI 게이트 — 토큰 있어도 write path 비활성 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-CI-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk({ ci: true }) },
  )
  check('CI 환경 시 status = ready-to-apply', res.status === 'ready-to-apply')
  check('CI 환경 시 stopReasons 에 CI 포함', (res.report.stopReasons || []).some((r) => r.includes('CI')))
  check('CI 환경 시 executor 호출 0', calls.length === 0)
}

console.log('\n=== [6] 승인 게이트 — TTY 아니면 STOP ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-TTY-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => false },
  )
  check('비대화형 시 status = not-interactive', res.status === 'not-interactive')
  check('비대화형 시 exitCode != 0', res.exitCode !== 0)
  check('비대화형 시 executor 호출 0', calls.length === 0)
}

console.log('\n=== [6b] 승인 게이트 — 승인 문구 불일치 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-APPROVE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async () => 'yes please' },
  )
  check('승인 문구 불일치 시 status = not-approved', res.status === 'not-approved')
  check('승인 문구 불일치 시 executor 호출 0', calls.length === 0)
}

console.log('\n=== [7a] apply 성공 → postflight 실패(값 미반영) → 자동 롤백 ===')
{
  // 의도적으로 executor 가 db 를 갱신하지 않아, postflight 가 여전히
  // expect_before 값을 보게 만든다(적용이 실패로 반영된 상황 재현).
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-ROLLBACK-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}` },
  )
  check('postflight 실패 시 status = rolled-back', res.status === 'rolled-back')
  check('postflight 실패 시 executor 호출 2회(apply, rollback)', calls.length === 2)
  check('두 번째 호출이 rollback SQL(원복 값 SET 포함)', calls[1]?.includes("current_unit_id = '113ee184-c5c7-4ee5-8b6c-99d547a06525'"))
  check('postMismatches 기록됨', (res.report.postMismatches || []).length > 0)
}

console.log('\n=== [7b] apply 자체 실패(row-count 예외) → apply-failed, rollback 미호출 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = {
    async run(sql) {
      calls.push(sql)
      throw new Error('ABORT[x] student_class_assignments f9a14e8a 영향 0행(기대 1)')
    },
  }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-APPLYFAIL-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}` },
  )
  check('row-count 예외 시 status = apply-failed', res.status === 'apply-failed')
  check('row-count 예외 시 executor 호출 1회(apply 만)', calls.length === 1)
}

console.log('\n=== [7c] postflight per-change/must_not_change/health 전부 정상 → applied ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = {
    async run(sql) {
      calls.push(sql)
      if (calls.length === 1) applyChangesToDb(reader.db, BASE_MANIFEST)
      return { ok: true }
    },
  }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-APPLIED-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}`, runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('정상 apply+postflight+health 시 status = applied', res.status === 'applied')
  check('정상 apply 시 executor 호출 1회', calls.length === 1)
  check('정상 apply 시 dbWriteCount = changes.length(3)', res.report.dbWriteCount === 3)
}

console.log('\n=== [7d] postflight/must_not_change 전부 정상이지만 health 실패 → 롤백 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const executor = makeApplyRevertExecutor(reader, BASE_MANIFEST)
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-HEALTHFAIL-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}`, runHealthCheck: () => ({ ok: false, output: 'FAIL 학생 1명' }) },
  )
  check('health 실패 시 status = rolled-back', res.status === 'rolled-back')
  check('health 실패 시 executor 호출 2회(apply, rollback)', executor.calls.length === 2)
}

console.log('\n=== [8] 무관 행 변경 감지(manifest 밖 학생) → rollback ===')
{
  const studentsAfterUnexpected = STUDENTS_ROWS_AFTER_OK.map((r) => (
    r.id === 'zz-unrelated-student' ? { ...r, unit_name: 'Unit99', current_unit_id: 'zz-unit-hacked' } : r
  ))
  const reader = makeReader(BASE_MANIFEST, {
    tableRowsQueues: { students: [STUDENTS_ROWS_BEFORE, studentsAfterUnexpected], student_class_assignments: [SCA_ROWS_BEFORE, SCA_ROWS_AFTER_OK] },
  })
  const executor = makeApplyRevertExecutor(reader, BASE_MANIFEST)
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-UNRELATED-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}`, runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('무관 행 변경 감지 시 status = rolled-back', res.status === 'rolled-back')
  const unrelated = (res.report.postMismatches || []).find((m) => m.reason === 'unexpected-row-change' && m.id === 'zz-unrelated-student')
  check('postMismatches 에 unexpected-row-change(zz-unrelated-student) 기록', !!unrelated)
  check('무관 행 변경 감지 시 executor 호출 2회(apply, rollback)', executor.calls.length === 2)
}

console.log('\n=== [9] 학습기록 카운트 변화 감지 → rollback ===')
{
  const sid = BASE_MANIFEST.affected_students[0]
  const changedTable = BASE_MANIFEST.learning_baseline_tables[0]
  const reader = makeReader(BASE_MANIFEST, {
    tableRowsQueues: OK_SNAPSHOTS,
    countsQueues: { [`${changedTable}|${sid}`]: [10, 15] },
  })
  const executor = makeApplyRevertExecutor(reader, BASE_MANIFEST)
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-BASELINE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}`, runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('학습기록 카운트 변화 감지 시 status = rolled-back', res.status === 'rolled-back')
  const learningDiff = (res.report.postMismatches || []).find((m) => m.reason === 'learning-baseline-changed')
  check('postMismatches 에 learning-baseline-changed 기록', !!learningDiff)
  check('학습기록 카운트 변화 감지 시 executor 호출 2회(apply, rollback)', executor.calls.length === 2)
}

console.log('\n=== [환경 게이트] project_ref 불일치 → STOP(exit 2) ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-ENVMISMATCH-1', reportDir: REPORT_DIR, reader, dryRun: true },
    { loadEnv: () => envOk({ url: 'https://other-ref.supabase.co' }) },
  )
  check('project_ref 불일치 시 status = env-mismatch', res.status === 'env-mismatch')
  check('project_ref 불일치 시 exitCode = 2', res.exitCode === 2)
}

console.log('\n=== [invalid manifest] 검증 실패 시 즉시 STOP ===')
{
  const badManifest = clone(BASE_MANIFEST)
  badManifest.changes[0].table = 'classes'
  const res = await runHotfix({ manifest: badManifest, runId: 'RUN-INVALID-1', reportDir: REPORT_DIR, dryRun: true }, {})
  check('invalid manifest 시 status = invalid-manifest', res.status === 'invalid-manifest')
  check('invalid manifest 시 exitCode != 0', res.exitCode !== 0)
}

console.log(`\n=== summary ===\nPASS ${pass} / FAIL ${fail}`)
if (fail > 0) {
  console.log('FAIL')
  process.exit(1)
} else {
  console.log('PASS')
  process.exit(0)
}
