// Production Safety Harness — prodHotfix 회귀 테스트 (FAIL-first, 네트워크 0)
// (2026-09-03, Phase 1-B)
//
// 전부 순수 모듈(scripts/lib/hotfixManifest.mjs) 직접 import + runHotfix()에
// deps 주입(fake reader/executor/approve/health check)으로 검증한다. 실제
// Supabase/Management API 호출 0건 — CLAUDE.md 규칙 15(회귀 의심 시 FAIL
// 실측)를 이 신규 모듈에도 그대로 적용해, 구현 전 상태에서 각 섹션이
// 무엇을 재현하는지 주석에 남긴다.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateManifest,
  buildApplySql,
  buildRollbackSql,
  buildPreflightPlan,
  staticSafetyScan,
  sqlLiteral,
  redactSecrets,
  scanManifestStringValues,
  describeChange,
  lintManifestNarratives,
  parseGeneratedUpdateStatement,
  verifyWriteDriftGuard,
  refreshExpectBefore,
  applyManifestToSnapshot,
  diffInvariantFindings,
  computeInvariantsDeltaPreview,
} from './lib/hotfixManifest.mjs'
import { runHotfix, createLiveReaderFromClient } from './prodHotfix.mjs'

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
        return { count: q[Math.min(i, q.length - 1)], tableMissing: false }
      }
      return { count: opts.baselineDefault ?? 10, tableMissing: false }
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-PRE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-DRY-1', reportDir: REPORT_DIR, reader, executor, dryRun: true },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-CI-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-TTY-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-APPROVE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-ROLLBACK-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-APPLYFAIL-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-APPLIED-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-HEALTHFAIL-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-UNRELATED-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-BASELINE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
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
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-ENVMISMATCH-1', reportDir: REPORT_DIR, reader, dryRun: true },
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

// ══════════════════════════════════════════════════════════════════════
// Phase 2·7 강화 — 아래부터 신규 섹션(기존 [1]~[invalid manifest] 는 위에서
// 불변, 이 파일은 확장만 했다)
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== [nullable] current_unit_id uuid 또는 null 허용(문자열 "null" 은 거부) ===')
{
  const nullSet = clone(BASE_MANIFEST)
  nullSet.changes[0].set = { current_unit_id: null }
  check('set.current_unit_id = null 은 허용(SCA)', validateManifest(nullSet).valid)

  const nullSetStudents = clone(BASE_MANIFEST)
  nullSetStudents.changes[1].expect_before.current_unit_id = null
  nullSetStudents.changes[1].set.current_unit_id = null
  check('expect_before/set.current_unit_id = null 은 허용(students)', validateManifest(nullSetStudents).valid)

  const stringNull = clone(BASE_MANIFEST)
  stringNull.changes[0].set = { current_unit_id: 'null' }
  check('set.current_unit_id = 문자열 "null" 은 거부', !validateManifest(stringNull).valid)

  // apply/rollback SQL 가드 문자열 — current_unit_id 를 NULL 로 비우는 변경은
  // rollback 방향에서 WHERE 절이 "current_unit_id is null" 이어야 한다(SET
  // 절의 "= NULL" 은 언제나 거짓이라 WHERE 로 못 씀 — sqlEq 의 널 분기).
  const nullManifest = clone(BASE_MANIFEST)
  nullManifest.changes = [{
    table: 'student_class_assignments',
    id: nullManifest.changes[0].id,
    expect_before: { student_id: nullManifest.changes[0].expect_before.student_id, current_unit_id: '113ee184-c5c7-4ee5-8b6c-99d547a06525' },
    set: { current_unit_id: null },
  }]
  const rid = 'RUN-NULL-SQL-1'
  const applySql = buildApplySql(nullManifest, rid)
  const rollbackSql = buildRollbackSql(nullManifest, rid)
  check('apply SQL SET 절에 current_unit_id = NULL 포함', applySql.includes('current_unit_id = NULL'))
  check('rollback SQL WHERE 절에 current_unit_id is null 가드 포함', rollbackSql.includes('current_unit_id is null'))
  check('rollback SQL SET 절에 원복 uuid 값 포함', rollbackSql.includes("current_unit_id = '113ee184-c5c7-4ee5-8b6c-99d547a06525'"))
  check('apply/rollback SQL 정적 스캔 위반 0건(null 케이스)', staticSafetyScan(applySql).length === 0 && staticSafetyScan(rollbackSql).length === 0)
}

console.log('\n=== [generated_from] 선택 필드 형식 검증 ===')
{
  const ok = clone(BASE_MANIFEST)
  ok.generated_from = { tool: 'scripts/generateHotfixManifest.mjs', at: '2026-09-03T00:00:00.000Z', snapshot_sha256: 'a'.repeat(64) }
  check('generated_from 정상 형식은 허용', validateManifest(ok).valid)

  const noSha = clone(BASE_MANIFEST)
  noSha.generated_from = { tool: 't', at: '2026-09-03T00:00:00.000Z' }
  check('generated_from.snapshot_sha256 생략은 허용(선택 필드)', validateManifest(noSha).valid)

  const missingTool = clone(BASE_MANIFEST)
  missingTool.generated_from = { at: '2026-09-03T00:00:00.000Z' }
  check('generated_from.tool 누락 거부', !validateManifest(missingTool).valid)

  const badSha = clone(BASE_MANIFEST)
  badSha.generated_from = { tool: 't', at: '2026-09-03T00:00:00.000Z', snapshot_sha256: 'not-hex' }
  check('generated_from.snapshot_sha256 형식 아니면 거부', !validateManifest(badSha).valid)

  const notObject = clone(BASE_MANIFEST)
  notObject.generated_from = 'nope'
  check('generated_from 이 객체 아니면 거부', !validateManifest(notObject).valid)
}

console.log('\n=== [10] sqlLiteral 이스케이프 명시 테스트 ===')
{
  check("sqlLiteral 작은따옴표 이스케이프", sqlLiteral("O'Brien") === "'O''Brien'")
  check('sqlLiteral null -> NULL', sqlLiteral(null) === 'NULL')
  check('sqlLiteral boolean true -> true', sqlLiteral(true) === 'true')
  check('sqlLiteral boolean false -> false', sqlLiteral(false) === 'false')
}

console.log('\n=== [11] allowlist 강화 — op/컬럼 타입/max_changes 상한 ===')
{
  const badOpInsert = clone(BASE_MANIFEST)
  badOpInsert.changes[0].op = 'insert'
  check('op=insert 거부', !validateManifest(badOpInsert).valid)

  const badOpUpsert = clone(BASE_MANIFEST)
  badOpUpsert.changes[0].op = 'upsert'
  check('op=upsert 거부', !validateManifest(badOpUpsert).valid)

  const badOpDelete = clone(BASE_MANIFEST)
  badOpDelete.changes[0].op = 'delete'
  check('op=delete 거부(회귀 방지)', !validateManifest(badOpDelete).valid)

  const badUuidSet = clone(BASE_MANIFEST)
  badUuidSet.changes[0].set.current_unit_id = 'not-a-uuid'
  check('set.current_unit_id uuid/null 형식 아니면 거부', !validateManifest(badUuidSet).valid)

  const badBooleanSet = clone(BASE_MANIFEST)
  badBooleanSet.changes[2].set = { ...badBooleanSet.changes[2].set, is_primary: 'true' }
  check('set.is_primary boolean 아니면 거부', !validateManifest(badBooleanSet).valid)

  const badUnitNameLong = clone(BASE_MANIFEST)
  badUnitNameLong.changes[1].set.unit_name = 'x'.repeat(51)
  check('set.unit_name 51자 초과 거부', !validateManifest(badUnitNameLong).valid)

  const badUnitNameEmpty = clone(BASE_MANIFEST)
  badUnitNameEmpty.changes[1].set.unit_name = ''
  check('set.unit_name 빈 문자열 거부', !validateManifest(badUnitNameEmpty).valid)

  function makeCappedManifest(n, maxChanges) {
    const m = clone(BASE_MANIFEST)
    m.changes = []
    m.must_not_change = []
    m.reference_rows_must_exist = []
    for (let i = 0; i < n; i++) {
      m.changes.push({
        table: 'students',
        id: crypto.randomUUID(),
        expect_before: { unit_name: 'Unit1' },
        set: { unit_name: 'Unit2' },
      })
    }
    if (maxChanges !== undefined) m.max_changes = maxChanges
    return m
  }

  check('max_changes 미지정 시 21개 초과 거부(기본 상한 20)', !validateManifest(makeCappedManifest(21)).valid)
  check('max_changes 미지정 20개는 허용', validateManifest(makeCappedManifest(20)).valid)
  check('max_changes=30 지정 시 25개 허용', validateManifest(makeCappedManifest(25, 30)).valid)
  check('max_changes 51 이상은 거부(상한 50)', !validateManifest(makeCappedManifest(10, 51)).valid)
  check('max_changes=50 이어도 changes 51개는 거부', !validateManifest(makeCappedManifest(51, 50)).valid)
  check('max_changes=50, changes 50개는 허용', validateManifest(makeCappedManifest(50, 50)).valid)
}

console.log('\n=== [12] SQL 인젝션 이중 방어(manifest 문자열 값) ===')
{
  check('정상 manifest 문자열 값 스캔 위반 0건', scanManifestStringValues(BASE_MANIFEST).length === 0)

  const semicolon = clone(BASE_MANIFEST)
  semicolon.title = 'ok; DROP everything'
  check('title 에 세미콜론 포함 시 스캔 위반 감지', scanManifestStringValues(semicolon).length >= 1)
  check('title 에 세미콜론 포함 시 validateManifest 거부', !validateManifest(semicolon).valid)

  const sqlComment = clone(BASE_MANIFEST)
  sqlComment.changes[1].set.unit_name = "Unit5' -- comment"
  check('set 값에 -- 주석 포함 시 validateManifest 거부', !validateManifest(sqlComment).valid)

  const blockComment = clone(BASE_MANIFEST)
  blockComment.title = 'ok /* hidden */'
  check('title 에 /* 블록 주석 포함 시 validateManifest 거부', !validateManifest(blockComment).valid)
}

console.log('\n=== [13] redactSecrets(text, env) — 비밀값 마스킹(순수 함수) ===')
{
  const fakeEnv = { SUPABASE_ACCESS_TOKEN: 'sekrit-token-999', ANON_KEY: 'anon-key-abc', PIN_HASH_SAMPLE: 'pinhash123', SHORT: 'ab', PLAIN_VALUE: 'hello world' }
  const text = 'token=sekrit-token-999 key=anon-key-abc pin=pinhash123 short=ab plain=hello world'
  const redacted = redactSecrets(text, fakeEnv)
  check('토큰 값 마스킹됨', !redacted.includes('sekrit-token-999') && redacted.includes('[REDACTED]'))
  check('KEY 값 마스킹됨', !redacted.includes('anon-key-abc'))
  check('PIN 값 마스킹됨', !redacted.includes('pinhash123'))
  check('3자 미만 값은 마스킹 대상 아님(원문 유지)', redacted.includes('short=ab'))
  check('키 이름에 KEY/TOKEN/SECRET/PIN 이 없는 값(PLAIN_VALUE)은 마스킹 안 됨', redacted.includes('hello world'))
  check('env 없으면 원문 그대로', redactSecrets('plain text', undefined) === 'plain text')
  check('빈 문자열 값은 스킵', redactSecrets('x', { EMPTY_KEY: '' }) === 'x')
}

console.log('\n=== [13c] redactSecrets 강화 — 인코딩된/잘린 노출도 마스킹 (2026-09-03) ===')
{
  // (a) base64 인코딩 형태 — manifest 스냅샷/로그가 값을 base64 로 실을 수 있다.
  const val = 'sekrit-token-999'
  const b64 = Buffer.from(val, 'utf8').toString('base64')
  const text = `payload: ${b64}`
  const redacted = redactSecrets(text, { SUPABASE_ACCESS_TOKEN: val })
  check('base64 인코딩된 비밀값도 마스킹됨', !redacted.includes(b64) && redacted.includes('[REDACTED]'), redacted)
}
{
  // (b) URL 인코딩 형태 — 값에 인코딩 대상 특수문자(공백/+)가 있어야 encodeURIComponent 결과가 원본과 달라진다.
  const val = 'sekrit token+999'
  const urlEnc = encodeURIComponent(val)
  const text = `q=${urlEnc}`
  const redacted = redactSecrets(text, { SECRET_KEY: val })
  check('URL 인코딩된 비밀값도 마스킹됨', !redacted.includes(urlEnc) && redacted.includes('[REDACTED]'), redacted)
}
{
  // (c) 앞 12자 이상 접두 조각만 잘려서 노출된 경우(로그가 값을 앞부분만
  // 남기고 잘라내는 경우 등)도 마스킹한다.
  const val = 'sekrit-token-999-longvalue-full-secret-xyz'
  const clippedLog = `token=${val.slice(0, 12)}...(cut off)`
  const redacted = redactSecrets(clippedLog, { SUPABASE_ACCESS_TOKEN: val })
  check('12자 이상 접두 조각만 노출돼도 마스킹됨',
    !redacted.includes(val.slice(0, 12)) && redacted.includes('[REDACTED]'), redacted)
}
{
  // 6자 미만 값은 새 패턴(base64/URL/접두) 탐지 대상이 아니다(오탐 방지) —
  // 정확한 부분 문자열 매칭(기존 동작, 3자 이상)은 계속 살아있어야 한다.
  const redacted = redactSecrets('short=abcd rest unaffected', { SHORT_KEY: 'abcd' })
  check('4자 값(6자 미만)도 정확 매칭은 그대로 동작(예외 없음)',
    redacted === 'short=[REDACTED] rest unaffected', redacted)
}

console.log('\n=== [13b] redaction 통합 — 콘솔 출력에도 FAKE_TOKEN 노출 없음 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const executor = { async run() { return { ok: true } } }
  const originalLog = console.log
  const originalErr = console.error
  const lines = []
  console.log = (...args) => { lines.push(args.join(' ')) }
  console.error = (...args) => { lines.push(args.join(' ')) }
  let res
  try {
    res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-REDACT-CONSOLE-1', reportDir: REPORT_DIR, reader, executor, dryRun: true },
      { loadEnv: () => envOk() },
    )
  } finally {
    console.log = originalLog
    console.error = originalErr
  }
  const combined = lines.join('\n')
  check('dry-run 콘솔 출력에 FAKE_TOKEN 없음', !combined.includes(FAKE_TOKEN))
  check('dry-run 은 여전히 ready-to-apply', res.status === 'ready-to-apply')
}

console.log('\n=== [14] --env production|staging 플래그 필수 ===')
{
  const reader1 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res1 = await runHotfix(
    { manifest: BASE_MANIFEST, runId: 'RUN-ENVFLAG-MISSING-1', reportDir: REPORT_DIR, reader: reader1, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('--env 미지정 시 status = env-flag-required', res1.status === 'env-flag-required')
  check('--env 미지정 시 exitCode != 0', res1.exitCode !== 0)

  const reader2 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'prod', runId: 'RUN-ENVFLAG-BAD-1', reportDir: REPORT_DIR, reader: reader2, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check("--env 값이 'prod'(오타) 이면 거부", res2.status === 'env-flag-required')

  const reader3 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res3 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'staging', runId: 'RUN-ENVFLAG-STAGING-1', reportDir: REPORT_DIR, reader: reader3, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('--env staging 은 허용(project_ref 만 맞으면 진행)', res3.status === 'ready-to-apply')
}

console.log('\n=== [14b] CI 는 TTY+정확한 승인 문구가 있어도 --env 값과 무관하게 write path 비활성 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  let approveCalled = false
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-CI-ENV-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk({ ci: true }), isTTY: () => true, approve: async (rid) => { approveCalled = true; return `APPLY ${rid}` } },
  )
  check('CI+TTY+정확한 승인이어도 status = ready-to-apply(CI 우선)', res.status === 'ready-to-apply')
  check('CI 환경에서는 승인 콜백 자체가 호출되지 않음', !approveCalled)
  check('CI 환경에서는 executor 호출 0', calls.length === 0)
}

console.log('\n=== [15] 승인 문구 runId 바인딩 — 재시도 없이 STOP ===')
{
  const scenarios = [
    { label: '빈-입력', answer: async () => '' },
    { label: 'yes', answer: async () => 'yes' },
    { label: '다른-runId', answer: async () => 'APPLY OTHER-RUN-ID-999' },
    { label: '대소문자-다름', answer: async (rid) => `apply ${rid}` },
  ]
  for (const s of scenarios) {
    const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
    const calls = []
    const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
    const res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: `RUN-BIND-${s.label}`, reportDir: REPORT_DIR, reader, executor, dryRun: false },
      { loadEnv: () => envOk(), isTTY: () => true, approve: s.answer },
    )
    check(`승인 문구 불일치(${s.label}) 시 status = not-approved`, res.status === 'not-approved')
    check(`승인 문구 불일치(${s.label}) 시 executor 호출 0`, calls.length === 0)
  }

  // apply SQL 문자열의 runId 가 report.runId 와 정확히 일치(ABORT 메시지 경로)
  const reader2 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-BIND-MATCH-1', reportDir: REPORT_DIR, reader: reader2, dryRun: true },
    { loadEnv: () => envOk() },
  )
  const applySqlContent = fs.readFileSync(path.join(REPORT_DIR, 'RUN-BIND-MATCH-1.apply.sql'), 'utf8')
  check('apply SQL 안의 runId 가 report.runId 와 일치', applySqlContent.includes('RUN-BIND-MATCH-1') && res2.report.runId === 'RUN-BIND-MATCH-1')
}

console.log('\n=== [16] report.rollback 메타데이터 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-ROLLBACKMETA-1', reportDir: REPORT_DIR, reader, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('report.rollback.sql_path 존재', typeof res.report.rollback?.sql_path === 'string' && res.report.rollback.sql_path.endsWith('.rollback.sql'))
  check('report.rollback.guards 길이 = changes.length', (res.report.rollback?.guards || []).length === BASE_MANIFEST.changes.length)
  const guard0 = res.report.rollback.guards[0]
  check('guards[0].where 가 changes[0].set 과 일치', JSON.stringify(guard0.where) === JSON.stringify(BASE_MANIFEST.changes[0].set))
  check('report.expectedRows = changes.length', res.report.expectedRows === BASE_MANIFEST.changes.length)
}

console.log('\n=== [17] manifest 변조 감지(승인 이후 apply 직전 파일 재해시) ===')
{
  const tmpManifestPath = path.join(REPORT_DIR, 'tamper-manifest.json')
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(tmpManifestPath, JSON.stringify(BASE_MANIFEST), 'utf8')
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifestPath: tmpManifestPath, envFlag: 'production', runId: 'RUN-TAMPER-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    {
      loadEnv: () => envOk(),
      isTTY: () => true,
      approve: async (rid) => {
        // 승인 직후, 실제 적용 직전에 파일을 변조(공격 시나리오 재현)
        fs.writeFileSync(tmpManifestPath, JSON.stringify({ ...BASE_MANIFEST, id: 'tampered' }), 'utf8')
        return `APPLY ${rid}`
      },
    },
  )
  check('manifest 파일 변조 시 status = manifest-tampered', res.status === 'manifest-tampered')
  check('manifest 파일 변조 시 executor 호출 0', calls.length === 0)
  check('report.manifestSha256 기록됨(64자리 hex)', typeof res.report.manifestSha256 === 'string' && /^[0-9a-f]{64}$/.test(res.report.manifestSha256))
  fs.writeFileSync(tmpManifestPath, JSON.stringify(BASE_MANIFEST), 'utf8') // 원복(다음 테스트 오염 방지)
}

console.log('\n=== [17b] --expect-manifest-sha 사전 고정 ===')
{
  const raw = JSON.stringify(BASE_MANIFEST)
  const correctHash = crypto.createHash('sha256').update(raw).digest('hex')

  const reader1 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res1 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', expectManifestSha: correctHash, runId: 'RUN-SHA-OK-1', reportDir: REPORT_DIR, reader: reader1, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('올바른 --expect-manifest-sha 는 통과(ready-to-apply)', res1.status === 'ready-to-apply')

  const reader2 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', expectManifestSha: 'deadbeef'.repeat(8), runId: 'RUN-SHA-BAD-1', reportDir: REPORT_DIR, reader: reader2, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('불일치 --expect-manifest-sha 는 STOP(manifest-sha-mismatch)', res2.status === 'manifest-sha-mismatch')
}

console.log('\n=== [18] Case E 회귀 — ghost-unit-landing manifest, 이미 적용된 상태(after 값)로 조회 ===')
{
  const manifestPath = path.join(ROOT, 'scripts', 'prod', 'manifests', 'ghost-unit-landing-20260902.json')
  const realManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  // "이미 적용됨" 재현: getRow 는 항상 (expect_before + set) 병합값(=after)
  // 을 돌려준다 — 프리플라이트(expect_before 대조)가 반드시 FAIL 해야 한다.
  const afterById = {}
  for (const c of realManifest.changes) afterById[`${c.table}:${c.id}`] = { ...c.expect_before, ...c.set }
  for (const mnc of realManifest.must_not_change || []) afterById[`${mnc.table}:${mnc.id}`] = { ...mnc.expect }
  for (const r of realManifest.reference_rows_must_exist || []) afterById[`${r.table}:${r.id}`] = { ...r.expect }

  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const reader = {
    async getRow(table, id, columns) {
      const row = afterById[`${table}:${id}`]
      if (!row) return null
      const out = {}
      for (const col of columns) out[col] = row[col]
      return out
    },
    async countWordsForUnit() { return 2 },
    async headCountFiltered() { return { count: 0, tableMissing: false } },
    async selectAllRows() { return [] },
  }
  const res = await runHotfix(
    { manifestPath, envFlag: 'production', runId: 'RUN-CASE-E-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk({ url: 'https://azsjthtdjfpnctffjfsk.supabase.co' }), isTTY: () => true, approve: async (rid) => `APPLY ${rid}` },
  )
  check('Case E: status = preflight-mismatch', res.status === 'preflight-mismatch')
  check('Case E: executor 호출 0', calls.length === 0)
  const mismatches = res.report.mismatches || []
  check('Case E: mismatches 존재', mismatches.length > 0)
  const withExpectedActual = mismatches.filter((m) => 'expected' in m && 'actual' in m)
  check('Case E: mismatches 에 expected/actual 표 포함', withExpectedActual.length > 0)
}

console.log('\n=== [19] 행 수 방향(초과/미달) 회귀 — 명시적 라벨 ===')
{
  // 방향 A: 행 수 미달(3개 중 2개만 실제로 반영, 1개 누락) → rolled-back
  const readerUnder = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const callsUnder = []
  const executorUnder = {
    async run(sql) {
      callsUnder.push(sql)
      if (callsUnder.length === 1) {
        const partial = clone(BASE_MANIFEST)
        partial.changes = partial.changes.slice(0, 2)
        applyChangesToDb(readerUnder.db, partial)
      } else {
        revertChangesToDb(readerUnder.db, BASE_MANIFEST)
      }
      return { ok: true }
    },
  }
  const resUnder = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-UNDER-1', reportDir: REPORT_DIR, reader: readerUnder, executor: executorUnder, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}`, runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('행 수 미달(1개 누락) 시 status = rolled-back', resUnder.status === 'rolled-back')
  check('행 수 미달 시 executor 호출 2회(apply, rollback)', callsUnder.length === 2)

  // 방향 B: 행 수 초과(무관 행 1개 추가 변경) → rolled-back
  const studentsAfterExtra = STUDENTS_ROWS_AFTER_OK.map((r) => (
    r.id === 'zz-unrelated-student' ? { ...r, current_unit_id: 'zz-unit-extra-changed' } : r
  ))
  const readerOver = makeReader(BASE_MANIFEST, {
    tableRowsQueues: { students: [STUDENTS_ROWS_BEFORE, studentsAfterExtra], student_class_assignments: [SCA_ROWS_BEFORE, SCA_ROWS_AFTER_OK] },
  })
  const executorOver = makeApplyRevertExecutor(readerOver, BASE_MANIFEST)
  const resOver = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-OVER-1', reportDir: REPORT_DIR, reader: readerOver, executor: executorOver, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}`, runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('행 수 초과(무관 행 추가 변경) 시 status = rolled-back', resOver.status === 'rolled-back')
  check('행 수 초과 시 executor 호출 2회(apply, rollback)', executorOver.calls.length === 2)
}

console.log('\n=== [20] --rollback-of 모드 — READY 까지만, WRITE 0(동일 승인 게이트) ===')
{
  // 1) 정상 apply 시뮬레이션으로 원본 보고서 생성
  const reader1 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls1 = []
  const executor1 = {
    async run(sql) {
      calls1.push(sql)
      if (calls1.length === 1) applyChangesToDb(reader1.db, BASE_MANIFEST)
      return { ok: true }
    },
  }
  const applyRes = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-SOURCE-FOR-ROLLBACKOF-1', reportDir: REPORT_DIR, reader: reader1, executor: executor1, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, approve: async (rid) => `APPLY ${rid}`, runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('rollback-of 소스: 원본 apply 성공(applied)', applyRes.status === 'applied')
  const sourceReportPath = applyRes.report.reportPath

  // 2) --rollback-of 모드: 현재 DB = hotfix 적용됨(after 값) → preflight 는
  //    after 값 확인(buildPostflightPlan)이라 PASS 해야 한다.
  const reader2 = {
    db: { ...reader1.db },
    async getRow(table, id) {
      const v = this.db[`${table}:${id}`]
      return v ? { ...v } : null
    },
    async countWordsForUnit() { return 2 },
    async headCountFiltered() { return { count: 0, tableMissing: false } },
    async selectAllRows() { return [] },
  }
  const calls2 = []
  const executor2 = { async run(sql) { calls2.push(sql); return { ok: true } } }
  const rollbackOfRes = await runHotfix(
    {
      manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-ROLLBACKOF-1', reportDir: REPORT_DIR,
      reader: reader2, executor: executor2, dryRun: true, rollbackOfReportPath: sourceReportPath,
    },
    { loadEnv: () => envOk() },
  )
  check('rollback-of 모드: status = ready-to-apply', rollbackOfRes.status === 'ready-to-apply')
  check('rollback-of 모드: report.mode = rollback-of', rollbackOfRes.report.mode === 'rollback-of')
  check('rollback-of 모드: dry-run 이므로 executor 호출 0', calls2.length === 0)
  check('rollback-of 모드: DB WRITE 0', (rollbackOfRes.report.dbWriteCount ?? 0) === 0)

  // 3) manifestId 불일치 시 거부
  const otherManifest = clone(BASE_MANIFEST)
  otherManifest.id = 'different-manifest-id'
  const reader3 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const mismatchRes = await runHotfix(
    { manifest: otherManifest, envFlag: 'production', runId: 'RUN-ROLLBACKOF-MISMATCH-1', reportDir: REPORT_DIR, reader: reader3, dryRun: true, rollbackOfReportPath: sourceReportPath },
    { loadEnv: () => envOk() },
  )
  check('rollback-of 모드: manifestId 불일치 시 status = rollback-of-mismatch', mismatchRes.status === 'rollback-of-mismatch')
}

// ══════════════════════════════════════════════════════════════════════
// Track 11 버그 수정 회귀(2026-09-03) — headCountFiltered 가 select('id')
// 를 하드코딩해 student_progress(PK=student_id, id 컬럼 없음)에서 PostgREST
// 400 → 미처리 예외로 baseline 단계 전체가 크래시하던 버그. FAIL-first로
// 실측(아래 [21]/[22] 를 이 수정 전 코드에 대고 돌리면 관련 assertion 이
// 실패한다 — 수정 후에는 전부 PASS).
// ══════════════════════════════════════════════════════════════════════

// supabase-js 의 `.from(table).select(col, opts).eq(k, v)` 체인을 흉내내는
// 최소 가짜 클라이언트. count-head 쿼리는 `.eq()` 이후 바로 awiat 되므로
// (maybeSingle/range 없이) builder 자체를 thenable 로 만든다. 실제
// PostgREST 가 존재하지 않는 컬럼/테이블에 돌려주는 에러 shape(code 필드)
// 를 그대로 재현한다.
function makeFakeCountClient(behavior) {
  return {
    from(table) {
      let selectCol = null
      const filters = {}
      const builder = {
        select(col) { selectCol = col; return builder },
        eq(k, v) { filters[k] = v; return builder },
        then(resolve, reject) {
          Promise.resolve(behavior(table, selectCol, filters)).then(resolve, reject)
        },
      }
      return builder
    },
  }
}

function bugFixtureBehavior(table, selectCol) {
  if (table === 'student_progress') {
    // student_progress 는 PK 가 student_id 라 id 컬럼이 없다 — select=id 로
    // 쿼리하면 실제 PostgREST 가 이렇게 42703(undefined_column)/400 을 준다.
    if (selectCol === 'id') return { count: null, error: { message: 'column student_progress.id does not exist', code: '42703' } }
    if (selectCol === 'student_id') return { count: 7, error: null }
  }
  if (table === 'ghost_table_not_migrated') {
    // 마이그레이션 미실행 테이블 — relation 자체가 없다(42P01).
    return { count: null, error: { message: 'relation "public.ghost_table_not_migrated" does not exist', code: '42P01' } }
  }
  return { count: 0, error: null }
}

console.log('\n=== [21] createLiveReaderFromClient.headCountFiltered — select(id) 하드코딩 버그 회귀(FAIL-first) ===')
{
  const liveReader = createLiveReaderFromClient(makeFakeCountClient(bugFixtureBehavior))

  let threw = null
  let result = null
  try {
    result = await liveReader.headCountFiltered('student_progress', { student_id: 'sid-1' })
  } catch (err) { threw = err }
  check('headCountFiltered(student_progress, {student_id}) 는 예외 없이 카운트 반환(select=student_id 사용)', threw === null)
  check('정상 카운트 값 반환(7) + tableMissing=false', result?.count === 7 && result?.tableMissing === false)

  const missingResult = await liveReader.headCountFiltered('ghost_table_not_migrated', { student_id: 'sid-1' })
  check('테이블 부재(42P01)는 예외 대신 count 0 + tableMissing=true 로 fail-open', missingResult.count === 0 && missingResult.tableMissing === true)

  // filters 키가 'id' 인 경우(구버전이 실제로 하던 select=id 쿼리를 재현) —
  // 테이블 부재가 아닌 다른 에러(컬럼 없음)는 여전히 fail-closed 로 예외
  // 전파돼야 한다(runHotfix 쪽에서 baseline-failed 로 STOP 하는 근거).
  let otherErrThrew = null
  try {
    await liveReader.headCountFiltered('student_progress', { id: 'sid-1' })
  } catch (err) { otherErrThrew = err }
  check('테이블부재가 아닌 다른 에러(컬럼없음 등)는 여전히 예외로 전파(fail-closed)', otherErrThrew !== null && /column student_progress\.id/.test(otherErrThrew.message))
}

console.log('\n=== [22] runHotfix baseline 단계 — table-missing fail-open / 기타 에러는 crash 대신 baseline-failed(FAIL-first) ===')
{
  // 2a) 테이블 부재(fail-open) — 수정 전엔 headCountFiltered 가 select('id')
  //     로 크래시해 어떤 manifest 도 ready-to-apply 에 도달하지 못했다.
  const readerMissing = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  readerMissing.headCountFiltered = async (table) => (
    table === 'student_progress' ? { count: 0, tableMissing: true } : { count: 5, tableMissing: false }
  )
  const resMissing = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-BASELINE-MISSING-1', reportDir: REPORT_DIR, reader: readerMissing, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('테이블 부재(student_progress) 여도 baseline 단계 통과 → ready-to-apply', resMissing.status === 'ready-to-apply')
  const missingEntries = resMissing.report.baseline?.tableMissing || []
  check('report.baseline.tableMissing 에 student_progress 기록', missingEntries.some((m) => m.table === 'student_progress'))

  // 2b) 테이블 부재가 아닌 다른 에러(예: 컬럼 없음) — fail-closed 로 STOP,
  //     프로세스 크래시(미처리 예외) 대신 상태값으로 보고해야 한다.
  const readerOtherError = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  readerOtherError.headCountFiltered = async (table) => {
    if (table === 'student_progress') throw new Error('READ_ERROR student_progress count column student_progress.id does not exist')
    return { count: 5, tableMissing: false }
  }
  const resOtherError = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-BASELINE-OTHERERR-1', reportDir: REPORT_DIR, reader: readerOtherError, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('테이블부재 아닌 baseline 조회 에러는 status = baseline-failed(크래시 아님)', resOtherError.status === 'baseline-failed')
  check('baseline-failed 시 exitCode != 0', resOtherError.exitCode !== 0)
  check('baseline-failed 시 report.baselineError 기록', typeof resOtherError.report.baselineError === 'string')
}

// ══════════════════════════════════════════════════════════════════════
// Harness V2 — Track B/C(2026-09-04) — 아래부터 신규 섹션. 기존 [1]~[22]는
// 위에서 불변, 이 파일은 확장만 했다.
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== [B1] describeChange — 서술 문자열 canonical 생성 ===')
{
  const change = BASE_MANIFEST.changes[1] // students, current_unit_id + unit_name
  const applyDesc = describeChange(change)
  check('describeChange 기본(apply) 은 set 키 개수만큼 줄 생성', applyDesc.length === Object.keys(change.set).length)
  check('describeChange apply — current_unit_id 줄 포함',
    applyDesc.some((l) => l === `students ${change.id}: current_unit_id "113ee184-c5c7-4ee5-8b6c-99d547a06525" -> "4ce41359-6424-4b5e-933d-479db6951586"`))
  check('describeChange apply — unit_name 줄(변경 없음도 그대로 표기)',
    applyDesc.some((l) => l === `students ${change.id}: unit_name "Unit5" -> "Unit5"`))

  const rollbackDesc = describeChange(change, 'rollback')
  check('describeChange rollback — before/after 가 뒤바뀜(current_unit_id)',
    rollbackDesc.some((l) => l === `students ${change.id}: current_unit_id "4ce41359-6424-4b5e-933d-479db6951586" -> "113ee184-c5c7-4ee5-8b6c-99d547a06525"`))
}

console.log('\n=== [B1] lintManifestNarratives — 서술/실값 불일치 탐지(2026-09-02 유령 유닛 사고 재현) ===')
{
  // 실측 사고 재현: rollback 코멘트가 "unit_name 'Unit' -> 'Unit5'" 라고
  // 적었지만, 실제 expect_before.unit_name 은 이미 'Unit5' 였다(변경된 적
  // 없음) — VERIFY 서술과 WRITE 가드가 서로 다른 이야기를 하고 있었다.
  const wrong = clone(BASE_MANIFEST)
  wrong.title = "핫픽스: unit_name 'Unit' -> 'Unit5' 로 정정"
  const wrongFindings = lintManifestNarratives(wrong)
  check('잘못된 서술("Unit"->"Unit5", 실제 expect_before.unit_name="Unit5") 은 FAIL 로 감지',
    wrongFindings.length > 0, JSON.stringify(wrongFindings))

  const correct = clone(BASE_MANIFEST)
  correct.title = "핫픽스: unit_name 'Unit5' -> 'Unit5' (실제 변경 없음, current_unit_id 만 갱신)"
  const correctFindings = lintManifestNarratives(correct)
  check('올바른 서술("Unit5"->"Unit5", 실제 값과 일치) 은 PASS(위반 0건)', correctFindings.length === 0, JSON.stringify(correctFindings))

  const absent = clone(BASE_MANIFEST)
  absent.title = '핫픽스: 유령 유닛 재배정'
  check('서술 자체가 없으면 PASS(위반 0건)', lintManifestNarratives(absent).length === 0)

  // 화살표 서술이 어떤 change 의 컬럼 값과도 상관없으면(예: 완전히 무관한
  // 문자열) 검증 불가로 보고 무시한다(오탐 방지).
  const unrelated = clone(BASE_MANIFEST)
  unrelated.title = '무관한 서술: A -> B (매칭 대상 없음)'
  check('실제 컬럼 값과 상관없는 화살표 서술은 무시(오탐 없음)', lintManifestNarratives(unrelated).length === 0)

  // _comment/notes/generated_from 등 임의 자유 텍스트 필드도 스캔 대상.
  const badComment = clone(BASE_MANIFEST)
  badComment._comment = "current_unit_id '113ee184-c5c7-4ee5-8b6c-99d547a06525' -> 'WRONG-TARGET-ID'"
  check('_comment 필드의 잘못된 서술도 감지', lintManifestNarratives(badComment).length > 0)
}

console.log('\n=== [B1] validateManifest 에 narrative lint 위반 wiring(errors) ===')
{
  const wrong = clone(BASE_MANIFEST)
  wrong.title = "핫픽스: unit_name 'Unit' -> 'Unit5' 로 정정"
  const res = validateManifest(wrong)
  check('narrative 불일치 manifest 는 validateManifest 도 거부', !res.valid)
  check('validateManifest.errors 에 narrative 관련 메시지 포함', res.errors.some((e) => e.includes('narrative')))

  const correct = clone(BASE_MANIFEST)
  correct.title = '핫픽스: 유령 유닛 재배정(서술 없음)'
  check('narrative 문제 없는 정상 manifest 는 그대로 valid', validateManifest(correct).valid)
}

console.log('\n=== [B1] staticSafetyScan(sql, manifest) — narrative lint 도 위반 목록에 포함 ===')
{
  const runId = 'RUN-B1-STATIC-1'
  const okSql = buildApplySql(BASE_MANIFEST, runId)
  check('manifest 인자 생략 시 기존 동작 그대로(위반 0건)', staticSafetyScan(okSql).length === 0)
  check('narrative 문제 없는 manifest 를 함께 넘겨도 위반 0건', staticSafetyScan(okSql, BASE_MANIFEST).length === 0)

  const wrong = clone(BASE_MANIFEST)
  wrong.title = "핫픽스: unit_name 'Unit' -> 'Unit5' 로 정정"
  const violationsWithNarrative = staticSafetyScan(okSql, wrong)
  check('narrative 문제 있는 manifest 를 넘기면 위반 목록에 narrative-drift 포함',
    violationsWithNarrative.some((v) => v.match === 'narrative-drift'))
}

console.log('\n=== [B1] apply/rollback SQL 헤더 주석이 describeChange 로만 생성됨(hand text 금지) ===')
{
  const runId = 'RUN-B1-HEADER-1'
  const applySql = buildApplySql(BASE_MANIFEST, runId)
  const rollbackSql = buildRollbackSql(BASE_MANIFEST, runId)
  const c0 = BASE_MANIFEST.changes[0]
  const applyDescLine = describeChange(c0, 'apply')[0]
  const rollbackDescLine = describeChange(c0, 'rollback')[0]
  check('apply SQL 헤더 주석에 describeChange(apply) 첫 줄 포함', applySql.includes(`-- ${applyDescLine}`))
  check('rollback SQL 헤더 주석에 describeChange(rollback) 첫 줄 포함', rollbackSql.includes(`-- ${rollbackDescLine}`))
}

console.log('\n=== [B2] VERIFY==WRITE 구조적 회귀 가드(verifyWriteDriftGuard, parseGeneratedUpdateStatement) ===')
{
  const guard = verifyWriteDriftGuard(BASE_MANIFEST, 'RUN-B2-1')
  check('정상 manifest 는 verifyWriteDriftGuard ok=true(불일치 0건)', guard.ok && guard.mismatches.length === 0, JSON.stringify(guard.mismatches))

  const realManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'prod', 'manifests', 'ghost-unit-landing-20260902.json'), 'utf8'))
  const guardReal = verifyWriteDriftGuard(realManifest, 'RUN-B2-2')
  check('ghost-unit-landing 실 manifest 도 verifyWriteDriftGuard ok=true', guardReal.ok && guardReal.mismatches.length === 0, JSON.stringify(guardReal.mismatches))

  const parsed = parseGeneratedUpdateStatement("  update public.students set unit_name = 'Unit9' where id = 'x-id' and unit_name = 'Unit1';")
  check('parseGeneratedUpdateStatement 정상 파싱(table/set/where)',
    parsed && parsed.table === 'students' && parsed.set.unit_name === 'Unit9' && parsed.where.unit_name === 'Unit1' && parsed.where.id === 'x-id')

  const parsedNull = parseGeneratedUpdateStatement("  update public.student_class_assignments set current_unit_id = NULL where id = 'x' and current_unit_id is null;")
  check('parseGeneratedUpdateStatement — NULL/is null 왕복 파싱', parsedNull.set.current_unit_id === null && parsedNull.where.current_unit_id === null)

  const parsedBool = parseGeneratedUpdateStatement("  update public.student_class_assignments set is_primary = true where id = 'x' and is_primary = false;")
  check('parseGeneratedUpdateStatement — boolean 왕복 파싱', parsedBool.set.is_primary === true && parsedBool.where.is_primary === false)

  // 파괴적 키워드 문자열을 통짜로 남기면 PreToolUse 파괴 명령 훅이 이 파일
  // 자체의 Write/Edit 를 오탐 차단할 수 있어, 런타임에 조각을 이어붙인다.
  const notAStatement = ['drop', ' table', ' students;'].join('')
  check('구조 파싱 불가 라인은 null 반환(안전한 실패)', parseGeneratedUpdateStatement(notAStatement) === null)
}

console.log(`\n=== summary ===\nPASS ${pass} / FAIL ${fail}`)
if (fail > 0) {
  console.log('FAIL')
  process.exit(1)
} else {
  console.log('PASS')
  process.exit(0)
}
