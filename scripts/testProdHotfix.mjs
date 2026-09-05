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
  ALLOWLIST,
  buildApplySql,
  buildRollbackSql,
  buildPreflightPlan,
  buildPostflightPlan,
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
import {
  runHotfix,
  createLiveReaderFromClient,
  computeStandardStatus,
  computeApplyEligibility,
  STOP_REASON_TO_APPLY_ELIGIBILITY,
  APPLY_ELIGIBILITY_VALUES,
} from './prodHotfix.mjs'

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

// fix/harness-apply-two-phase-approval(2026-09-05) — db.__applied 플래그를
// 함께 세운다. 2단계 승인(1단계=티켓 발급, 2단계=검증+apply)에서는 runHotfix()
// 가 같은 reader 를 상대로 baseline(students/SCA 전체 스냅샷 + 학습기록
// 카운트)을 "두 번"(1단계 한 번, 2단계 한 번, 둘 다 apply 이전) 읽는다 —
// makeReader() 의 selectAllRows/headCountFiltered 가 이 플래그로 "실제로
// apply 가 있었는가"를 보고 before/after 큐를 고르게 해야, 1단계와 2단계의
// baseline fingerprint 가 (드리프트가 없는 한) 항상 같아진다(순수 호출
// 횟수로 전환하던 예전 방식은 2번째 runHotfix 호출의 자기 baseline 읽기를
// 이미 "적용 후"로 잘못 앞당겨 approval-stale 오탐을 냈다).
function applyChangesToDb(db, manifest) {
  db.__applied = true
  for (const c of manifest.changes) {
    const key = `${c.table}:${c.id}`
    db[key] = { ...db[key], ...c.set }
  }
}

function revertChangesToDb(db, manifest) {
  db.__applied = false
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
  const countsQueues = opts.countsQueues || {}
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
    // fix/harness-apply-two-phase-approval(2026-09-05) — 호출 횟수가 아니라
    // db.__applied(실제로 apply 가 일어났는가)로 before/after 큐를 고른다
    // (위 applyChangesToDb/revertChangesToDb 주석 참고).
    async headCountFiltered(table, filters) {
      const key = `${table}|${filters.student_id}`
      const q = countsQueues[key]
      if (Array.isArray(q)) {
        const idx = db.__applied ? Math.min(1, q.length - 1) : 0
        return { count: q[idx], tableMissing: false }
      }
      return { count: opts.baselineDefault ?? 10, tableMissing: false }
    },
    async selectAllRows(table) {
      const q = tableRowsQueues[table]
      if (Array.isArray(q)) {
        const idx = db.__applied ? Math.min(1, q.length - 1) : 0
        return q[idx]
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

// fix/harness-apply-two-phase-approval(2026-09-05) — readline 기반 단일
// 승인 프롬프트(rl.question, 'APPLY <runId>' 문구 비교)를 2단계(1단계=
// runHotfix() 가 티켓 파일 발급, 2단계=같은 runId 로 --approve 재실행)로
// 대체한 뒤, 예전에 "isTTY:()=>true, approve: async (rid) => `APPLY ${rid}`"
// 로 즉시 승인을 흉내내던 테스트가 쓰는 헬퍼. 1단계가 'ticket-issued' 로
// 끝나지 않으면(dry-run/CI/토큰없음/manifest 오류 등으로 더 일찍 STOP) 그
// 결과를 그대로 반환한다 — "여전히 1단계에서 막히는" 시나리오도 이 헬퍼로
// 검증할 수 있다. deps.isTTY 를 명시적으로 넘기면(예: TTY 아님 테스트) 그
// 값이 기본값(true)을 덮어쓴다.
async function runApprovedHotfix(options, deps = {}) {
  const phase1 = await runHotfix({ ...options, approveRunId: undefined }, deps)
  if (phase1.status !== 'ticket-issued') return phase1
  const runId = phase1.report.runId
  const phase2 = await runHotfix({ ...options, runId, approveRunId: runId }, { isTTY: () => true, ...deps })
  return { ...phase2, phase1 }
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

console.log('\n=== [5] CI 게이트 — 토큰 있어도 write path 비활성(2단계에서 확인) ===')
{
  // fix/harness-apply-two-phase-approval(2026-09-05) — 1단계(--approve
  // 없음)는 CI 여도 티켓을 발급한다(계획 통과 기록, DB WRITE 0). CI 게이트
  // 자체는 2단계(--approve)에서 확인한다 — 상세 시나리오는 [14b] 참고.
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const phase1 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-CI-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk({ ci: true }) },
  )
  check('CI 환경 1단계 시 status = ticket-issued', phase1.status === 'ticket-issued', phase1.status)
  check('CI 환경 1단계 시 executor 호출 0', calls.length === 0)

  const phase2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-CI-1', approveRunId: 'RUN-CI-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk({ ci: true }), isTTY: () => true },
  )
  check('CI 환경 2단계(--approve) 시 status = ready-to-apply', phase2.status === 'ready-to-apply', phase2.status)
  check('CI 환경 2단계 시 stopReasons 에 CI 포함', (phase2.report.stopReasons || []).some((r) => r.includes('CI')))
  check('CI 환경 2단계 시에도 executor 호출 0', calls.length === 0)
}

console.log('\n=== [6] 2단계 승인 게이트 — 1단계(티켓 발급) 기본 동작 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-TICKET-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('1단계(--approve 없음) 시 status = ticket-issued', res.status === 'ticket-issued', res.status)
  check('1단계 시 exitCode = 0', res.exitCode === 0)
  check('1단계 시 executor 호출 0(DB WRITE 없음)', calls.length === 0)
  check('1단계 시 report.apply_eligibility = READY', res.report.apply_eligibility === 'READY')
  const ticketPath = path.join(REPORT_DIR, 'RUN-TICKET-1.ticket.json')
  check('티켓 파일 생성됨', fs.existsSync(ticketPath))
  const ticket = JSON.parse(fs.readFileSync(ticketPath, 'utf8'))
  check('티켓에 runId 기록', ticket.runId === 'RUN-TICKET-1')
  check('티켓에 manifestSha256 기록(64자리 hex)', /^[0-9a-f]{64}$/.test(ticket.manifestSha256))
  check('티켓에 preflightFingerprint 기록(64자리 hex)', /^[0-9a-f]{64}$/.test(ticket.preflightFingerprint))
  check('티켓은 아직 미사용(used=false)', ticket.used === false)
  check('티켓 만료시각 > 발급시각', new Date(ticket.expiresAt).getTime() > new Date(ticket.createdAt).getTime())
}

console.log('\n=== [6b] 2단계 승인 게이트 — TTY 아니면 STOP(2단계에서만 확인) ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-TTY-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => false },
  )
  check('비대화형 시 status = not-interactive', res.status === 'not-interactive', res.status)
  check('비대화형 시 exitCode != 0', res.exitCode !== 0)
  check('비대화형 시 executor 호출 0', calls.length === 0)
  check('1단계 자체는 여전히 ticket-issued 로 성공함', res.phase1.status === 'ticket-issued')
}

console.log('\n=== [6c] 2단계 승인 게이트 — 잘못된 runId(--approve) STOP(approval-mismatch) ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const phase1 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-WRONGID-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('[wrong-runid] 1단계 ticket-issued', phase1.status === 'ticket-issued')
  const phase2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', reportDir: REPORT_DIR, reader, executor, dryRun: false, approveRunId: 'RUN-DOES-NOT-EXIST' },
    { loadEnv: () => envOk(), isTTY: () => true },
  )
  check('잘못된 runId 로 --approve 시 status = approval-mismatch', phase2.status === 'approval-mismatch', phase2.status)
  check('잘못된 runId 시 executor 호출 0', calls.length === 0)
}

console.log('\n=== [6d] 2단계 승인 게이트 — 티켓 재사용 STOP(approval-used) ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const phase1 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-REUSE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('[reuse] 1단계 ticket-issued', phase1.status === 'ticket-issued')
  // 이 STOP 사유 하나만 격리하기 위해, 실제 apply 성공을 한 번 더
  // 시뮬레이션하는 대신(그러면 라이브 값이 바뀌어 preflight-mismatch 가
  // 먼저 걸린다) 티켓 파일의 used 플래그만 직접 사용됨으로 표시한다(실제
  // 시나리오: 정상 승인 1회를 끝낸 뒤 같은 --approve 명령을 실수로 다시
  // 실행하는 경우와 같은 티켓 상태).
  const ticketPath = path.join(REPORT_DIR, 'RUN-REUSE-1.ticket.json')
  const ticket = JSON.parse(fs.readFileSync(ticketPath, 'utf8'))
  ticket.used = true
  ticket.usedAt = new Date().toISOString()
  fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2), 'utf8')
  const phase2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-REUSE-1', approveRunId: 'RUN-REUSE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true },
  )
  check('이미 사용된 티켓으로 승인 시도 시 status = approval-used', phase2.status === 'approval-used', phase2.status)
  check('재사용 시 executor 호출 0', calls.length === 0)
}

console.log('\n=== [6e] 2단계 승인 게이트 — 만료된 티켓 STOP(approval-expired) ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const t0 = new Date('2026-09-05T00:00:00.000Z')
  const t0Plus16m = new Date(t0.getTime() + 16 * 60 * 1000) // TTL(15분) 초과
  const phase1 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-EXPIRE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), now: () => t0 },
  )
  check('[expire] 1단계 ticket-issued', phase1.status === 'ticket-issued')
  const phase2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-EXPIRE-1', approveRunId: 'RUN-EXPIRE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true, now: () => t0Plus16m },
  )
  check('만료된 티켓 승인 시도 시 status = approval-expired', phase2.status === 'approval-expired', phase2.status)
  check('만료 시 executor 호출 0', calls.length === 0)
}

console.log('\n=== [6f] 2단계 승인 게이트 — 티켓 발급 이후 manifest 변조 STOP(approval-manifest-mismatch) ===')
{
  const tmpManifestPath = path.join(REPORT_DIR, 'ticket-tamper-manifest.json')
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(tmpManifestPath, JSON.stringify(BASE_MANIFEST), 'utf8')
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const phase1 = await runHotfix(
    { manifestPath: tmpManifestPath, envFlag: 'production', runId: 'RUN-MTAMPER-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('[manifest-tamper] 1단계 ticket-issued', phase1.status === 'ticket-issued')
  // 승인(2단계) 이전에 manifest 파일 내용을 바꾼다(티켓의 manifestSha256 과 달라짐).
  fs.writeFileSync(tmpManifestPath, JSON.stringify({ ...BASE_MANIFEST, id: 'tampered-between-phases' }), 'utf8')
  const phase2 = await runHotfix(
    { manifestPath: tmpManifestPath, envFlag: 'production', runId: 'RUN-MTAMPER-1', approveRunId: 'RUN-MTAMPER-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true },
  )
  check('티켓 발급 이후 manifest 변조 시 status = approval-manifest-mismatch', phase2.status === 'approval-manifest-mismatch', phase2.status)
  check('manifest 변조 시 executor 호출 0', calls.length === 0)
  fs.writeFileSync(tmpManifestPath, JSON.stringify(BASE_MANIFEST), 'utf8') // 원복(다음 테스트 오염 방지)
}

console.log('\n=== [6g] 2단계 승인 게이트 — 티켓 발급 이후 라이브 드리프트 STOP(approval-stale) ===')
{
  // 학습기록 카운트만 드리프트시킨다(manifest 가 확인하는 expect_before
  // 컬럼과는 무관 — preflight-mismatch 가 아니라 approval-stale 이 잡아야
  // 하는 시나리오를 격리해서 재현한다: "그 사이 학생이 숙제를 더 했다").
  let learningCount = 10
  const staleReader = {
    async getRow(table, id, columns) {
      const v = buildFakeDb(BASE_MANIFEST)[`${table}:${id}`]
      if (!v) return null
      const out = {}
      for (const col of columns) out[col] = v[col]
      return out
    },
    async countWordsForUnit() { return 2 },
    async headCountFiltered() { return { count: learningCount, tableMissing: false } },
    async selectAllRows() { return [] },
  }
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const phase1 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-STALE-1', reportDir: REPORT_DIR, reader: staleReader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('[stale] 1단계 ticket-issued', phase1.status === 'ticket-issued')
  learningCount = 15 // 티켓 발급 이후 라이브 드리프트(숙제 진행)
  const phase2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-STALE-1', approveRunId: 'RUN-STALE-1', reportDir: REPORT_DIR, reader: staleReader, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true },
  )
  check('티켓 발급 이후 드리프트 시 status = approval-stale', phase2.status === 'approval-stale', phase2.status)
  check('드리프트 감지 시 executor 호출 0(apply 이전에 차단)', calls.length === 0)
}

console.log('\n=== [7a] apply 성공 → postflight 실패(값 미반영) → 자동 롤백 ===')
{
  // 의도적으로 executor 가 db 를 갱신하지 않아, postflight 가 여전히
  // expect_before 값을 보게 만든다(적용이 실패로 반영된 상황 재현).
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-ROLLBACK-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
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
  const res = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-APPLYFAIL-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
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
  const res = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-APPLIED-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('정상 apply+postflight+health 시 status = applied', res.status === 'applied')
  check('정상 apply 시 executor 호출 1회', calls.length === 1)
  check('정상 apply 시 dbWriteCount = changes.length(3)', res.report.dbWriteCount === 3)
}

console.log('\n=== [7d] postflight/must_not_change 전부 정상이지만 health 실패 → 롤백 ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const executor = makeApplyRevertExecutor(reader, BASE_MANIFEST)
  const res = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-HEALTHFAIL-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: false, output: 'FAIL 학생 1명' }) },
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
  const res = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-UNRELATED-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: true, output: '' }) },
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
  const res = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-BASELINE-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: true, output: '' }) },
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

console.log('\n=== [14b] CI — 1단계 티켓은 발급되지만(계획 통과 기록), 2단계는 CI 우선으로 항상 STOP ===')
{
  // fix/harness-apply-two-phase-approval(2026-09-05) — 1단계(티켓 발급)는
  // "이 계획이 게이트를 통과했다"는 사실만 기록하고 그 자체로는 절대 아무
  // 것도 쓰지 않는다(dbWriteCount 0) — 그래서 CI 여도 발급 자체는 막지
  // 않는다. 실제 위험한 경로(executor.run 호출)는 2단계(--approve)에서만
  // 열릴 수 있고, 거기서는 CI 감지 시 티켓 검증조차 시작하기 전에 항상
  // STOP 한다 — 이 두 단언이 CI 안전성의 핵심이다.
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const phase1 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-CI-ENV-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk({ ci: true }), isTTY: () => true },
  )
  check('CI+TTY — 1단계는 ticket-issued(계획 통과 기록, DB WRITE 0)', phase1.status === 'ticket-issued', phase1.status)
  check('CI 환경에서도 1단계 티켓 파일은 생성된다', fs.existsSync(path.join(REPORT_DIR, 'RUN-CI-ENV-1.ticket.json')))
  check('CI 환경 1단계도 executor 호출 0', calls.length === 0)

  const phase2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-CI-ENV-1', approveRunId: 'RUN-CI-ENV-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk({ ci: true }), isTTY: () => true },
  )
  check('CI 환경에서 --approve 를 시도해도 status = ready-to-apply(CI 우선, 절대 승인 불가)', phase2.status === 'ready-to-apply', phase2.status)
  check('CI 환경에서는 2단계에서도 티켓 검증 이전에 STOP(executor 호출 0 유지)', calls.length === 0)
}

console.log('\n=== [15] --approve <runId> 바인딩 — 정확한 runId 아니면 STOP(approval-mismatch) ===')
{
  // fix/harness-apply-two-phase-approval(2026-09-05) — readline 문구 비교가
  // 사라지고 "--approve <runId> 가 티켓 파일명과 정확히 일치하는가"로
  // 바뀌었다. 빈 문자열은 CLI 파서가 --approve 자체를 안 준 것과 구분이
  // 안 되므로(falsy) 이 표에서 제외 — 대신 "전혀 다른 runId"/"대소문자만
  // 다른 runId" 두 경우로 바인딩이 정확히 일치해야만 통과함을 확인한다.
  const scenarios = [
    { label: '다른-runId', slug: 'OTHER', mutate: () => 'OTHER-RUN-ID-999' },
    { label: '대소문자-다름', slug: 'CASE', mutate: (rid) => rid.toLowerCase() },
  ]
  for (const s of scenarios) {
    const runId = `RUN-BIND-${s.slug}`
    const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
    const calls = []
    const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
    const phase1 = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId, reportDir: REPORT_DIR, reader, executor, dryRun: false },
      { loadEnv: () => envOk() },
    )
    check(`[bind:${s.label}] 1단계 ticket-issued`, phase1.status === 'ticket-issued')
    const wrongId = s.mutate(runId)
    const phase2 = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', reportDir: REPORT_DIR, reader, executor, dryRun: false, approveRunId: wrongId },
      { loadEnv: () => envOk(), isTTY: () => true },
    )
    check(`잘못된 runId(${s.label}) 로 --approve 시 status = approval-mismatch`, phase2.status === 'approval-mismatch', phase2.status)
    check(`잘못된 runId(${s.label}) 시 executor 호출 0`, calls.length === 0)
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

console.log('\n=== [17] manifest 변조 감지(8.5단계 — 티켓 검증 통과 후 apply 직전 파일 재해시) ===')
{
  // fix/harness-apply-two-phase-approval(2026-09-05) — 예전엔 readline
  // approve() 콜백 안에서 파일을 변조해 "승인 직후, 적용 직전" 구간을
  // 재현했다. 이제 승인은 콜백이 아니라 2단계 CLI 재실행이라, 같은 좁은
  // 구간(8단계 티켓 검증 통과 이후 ~ 8.5단계 재해시 이전)을 재현하려면
  // 2단계 실행 "안에서" 티켓 검증(8) 이후·재해시(8.5) 이전에 실행되는
  // 지점 — 즉 preflight(4단계, getRow) — 에서 파일을 변조한다: 2단계도
  // 처음부터 0~7단계를 다시 돌기 때문에 4단계 시점엔 아직 8단계 티켓 sha
  // 대조(phase2 시작 시 1단계에서 읽은 원본 manifestSha256 기준)가 끝나기
  // 전이라 8단계까지는 통과하고, 8.5단계 재확인에서만 걸린다.
  const tmpManifestPath = path.join(REPORT_DIR, 'tamper-manifest.json')
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(tmpManifestPath, JSON.stringify(BASE_MANIFEST), 'utf8')

  const reader1 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const phase1 = await runHotfix(
    { manifestPath: tmpManifestPath, envFlag: 'production', runId: 'RUN-TAMPER-1', reportDir: REPORT_DIR, reader: reader1, dryRun: false, executor: { async run() { return { ok: true } } } },
    { loadEnv: () => envOk() },
  )
  check('[8.5-tamper] 1단계 ticket-issued(파일 아직 원본)', phase1.status === 'ticket-issued')

  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const reader2 = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const originalGetRow = reader2.getRow.bind(reader2)
  let tamperedOnce = false
  reader2.getRow = async (...args) => {
    if (!tamperedOnce) {
      tamperedOnce = true
      fs.writeFileSync(tmpManifestPath, JSON.stringify({ ...BASE_MANIFEST, id: 'tampered' }), 'utf8')
    }
    return originalGetRow(...args)
  }
  const phase2 = await runHotfix(
    { manifestPath: tmpManifestPath, envFlag: 'production', runId: 'RUN-TAMPER-1', approveRunId: 'RUN-TAMPER-1', reportDir: REPORT_DIR, reader: reader2, executor, dryRun: false },
    { loadEnv: () => envOk(), isTTY: () => true },
  )
  check('manifest 파일 변조 시 status = manifest-tampered', phase2.status === 'manifest-tampered', phase2.status)
  check('manifest 파일 변조 시 executor 호출 0', calls.length === 0)
  check('report.manifestSha256 기록됨(64자리 hex)', typeof phase2.report.manifestSha256 === 'string' && /^[0-9a-f]{64}$/.test(phase2.report.manifestSha256))
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
    { loadEnv: () => envOk({ url: 'https://azsjthtdjfpnctffjfsk.supabase.co' }) },
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
  const resUnder = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-UNDER-1', reportDir: REPORT_DIR, reader: readerUnder, executor: executorUnder, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: true, output: '' }) },
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
  const resOver = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-OVER-1', reportDir: REPORT_DIR, reader: readerOver, executor: executorOver, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: true, output: '' }) },
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
  const applyRes = await runApprovedHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-SOURCE-FOR-ROLLBACKOF-1', reportDir: REPORT_DIR, reader: reader1, executor: executor1, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: true, output: '' }) },
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
  // C3(2026-09-05): 시그니처가 (manifest, runId) 에서 (manifest, applySql,
  // rollbackSql) 로 바뀌었다(실제 생성된 SQL을 대조하도록) — 호출부도 실제
  // SQL을 먼저 만들어 넘긴다.
  const guard = verifyWriteDriftGuard(BASE_MANIFEST, buildApplySql(BASE_MANIFEST, 'RUN-B2-1'), buildRollbackSql(BASE_MANIFEST, 'RUN-B2-1'))
  check('정상 manifest 는 verifyWriteDriftGuard ok=true(불일치 0건)', guard.ok && guard.mismatches.length === 0, JSON.stringify(guard.mismatches))

  const realManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'prod', 'manifests', 'ghost-unit-landing-20260902.json'), 'utf8'))
  const guardReal = verifyWriteDriftGuard(realManifest, buildApplySql(realManifest, 'RUN-B2-2'), buildRollbackSql(realManifest, 'RUN-B2-2'))
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

// ── B4 픽스처: SCA 전용 insert/delete manifest ──────────────────────────
const NEW_SCA_ID = crypto.randomUUID()
const NEW_CLASS_ID = crypto.randomUUID()
const NEW_TEXTBOOK_ID = crypto.randomUUID()
const INSERT_STUDENT_ID = BASE_MANIFEST.changes[1].id
const INSERT_MANIFEST = {
  id: 'test-hotfix-sca-add-001',
  project_ref: 'testref123',
  title: 'SCA 신규 배정 추가(premiddle 케이스 재현)',
  affected_students: [INSERT_STUDENT_ID],
  changes: [
    {
      op: 'insert',
      table: 'student_class_assignments',
      id: NEW_SCA_ID,
      fields: {
        student_id: INSERT_STUDENT_ID,
        class_id: NEW_CLASS_ID,
        textbook_id: NEW_TEXTBOOK_ID,
        current_unit_id: null,
        is_primary: false,
      },
    },
  ],
}

const DELETE_SCA_ID = crypto.randomUUID()
const DELETE_STUDENT_ID = BASE_MANIFEST.changes[2].expect_before.student_id
const DELETE_MANIFEST = {
  id: 'test-hotfix-sca-remove-001',
  project_ref: 'testref123',
  title: 'SCA 배정 제거',
  affected_students: [DELETE_STUDENT_ID],
  changes: [
    {
      op: 'delete',
      table: 'student_class_assignments',
      id: DELETE_SCA_ID,
      expect_before: {
        student_id: DELETE_STUDENT_ID,
        class_id: NEW_CLASS_ID,
        textbook_id: NEW_TEXTBOOK_ID,
        current_unit_id: null,
        is_primary: false,
        // QA-V2: op=delete 는 rollback 재삽입이 원래 생성시각을 복원해야 하므로
        // expect_before 에 created_at 이 필수다.
        created_at: '2026-01-01T00:00:00+00:00',
      },
    },
  ],
}

console.log('\n=== [B4] validateManifest — SCA insert/delete op 검증 ===')
{
  check('정상 insert manifest 는 valid', validateManifest(INSERT_MANIFEST).valid, JSON.stringify(validateManifest(INSERT_MANIFEST).errors))
  check('정상 delete manifest 는 valid', validateManifest(DELETE_MANIFEST).valid, JSON.stringify(validateManifest(DELETE_MANIFEST).errors))

  const insertWrongTable = clone(INSERT_MANIFEST)
  insertWrongTable.changes[0].table = 'students'
  check('op=insert 는 students 테이블 거부', !validateManifest(insertWrongTable).valid)

  const insertMissingField = clone(INSERT_MANIFEST)
  delete insertMissingField.changes[0].fields.is_primary
  check('op=insert fields 누락 컬럼 거부', !validateManifest(insertMissingField).valid)

  const insertExtraField = clone(INSERT_MANIFEST)
  insertExtraField.changes[0].fields.extra_col = 'x'
  check('op=insert fields 허용 안 된 컬럼 거부', !validateManifest(insertExtraField).valid)

  const insertBadBoolean = clone(INSERT_MANIFEST)
  insertBadBoolean.changes[0].fields.is_primary = 'false'
  check('op=insert fields.is_primary 문자열이면 거부', !validateManifest(insertBadBoolean).valid)

  const insertWithExpectBefore = clone(INSERT_MANIFEST)
  insertWithExpectBefore.changes[0].expect_before = { foo: 'bar' }
  check('op=insert 에 expect_before 있으면 거부', !validateManifest(insertWithExpectBefore).valid)

  const deleteWrongTable = clone(DELETE_MANIFEST)
  deleteWrongTable.changes[0].table = 'students'
  check('op=delete 는 students 테이블 거부', !validateManifest(deleteWrongTable).valid)

  const deleteMissingField = clone(DELETE_MANIFEST)
  delete deleteMissingField.changes[0].expect_before.class_id
  check('op=delete expect_before 5개 컬럼 미만이면 거부', !validateManifest(deleteMissingField).valid)

  const deletePrimaryNoFlag = clone(DELETE_MANIFEST)
  deletePrimaryNoFlag.changes[0].expect_before.is_primary = true
  check('op=delete is_primary=true 인데 allow_primary_delete 없으면 거부', !validateManifest(deletePrimaryNoFlag).valid)

  const deletePrimaryWithFlag = clone(DELETE_MANIFEST)
  deletePrimaryWithFlag.changes[0].expect_before.is_primary = true
  deletePrimaryWithFlag.allow_primary_delete = true
  check('op=delete is_primary=true + allow_primary_delete=true 는 허용',
    validateManifest(deletePrimaryWithFlag).valid, JSON.stringify(validateManifest(deletePrimaryWithFlag).errors))

  const deleteWithSet = clone(DELETE_MANIFEST)
  deleteWithSet.changes[0].set = { current_unit_id: null }
  check('op=delete 에 set 있으면 거부', !validateManifest(deleteWithSet).valid)
}

console.log('\n=== [B4] buildApplySql/buildRollbackSql — SCA insert/delete SQL 생성 ===')
{
  const runId = 'RUN-B4-SQL-1'
  const insertApply = buildApplySql(INSERT_MANIFEST, runId)
  const insertRollback = buildRollbackSql(INSERT_MANIFEST, runId)
  check('insert apply SQL 에 insert into 포함', /insert into public\.student_class_assignments/.test(insertApply))
  check('insert apply SQL 에 중복 가드(if exists) 포함', insertApply.includes('중복 행 이미 존재'))
  check('insert apply SQL 정적 스캔 위반 0건', staticSafetyScan(insertApply).length === 0, JSON.stringify(staticSafetyScan(insertApply)))
  check('insert rollback SQL 은 delete from(방금 넣은 행 제거)', /delete from public\.student_class_assignments where id = /.test(insertRollback))
  check('insert rollback SQL 정적 스캔 위반 0건', staticSafetyScan(insertRollback).length === 0, JSON.stringify(staticSafetyScan(insertRollback)))

  const deleteApply = buildApplySql(DELETE_MANIFEST, runId)
  const deleteRollback = buildRollbackSql(DELETE_MANIFEST, runId)
  check('delete apply SQL 은 delete from(expect_before 전체로 가드)', /delete from public\.student_class_assignments where id = /.test(deleteApply))
  check('delete apply SQL 정적 스캔 위반 0건', staticSafetyScan(deleteApply).length === 0, JSON.stringify(staticSafetyScan(deleteApply)))
  check('delete rollback SQL 은 insert into(원복)', /insert into public\.student_class_assignments/.test(deleteRollback))
  check('delete rollback SQL 에 원복 값(student_id) 포함', deleteRollback.includes(DELETE_MANIFEST.changes[0].expect_before.student_id))
  check('delete rollback SQL 정적 스캔 위반 0건(중복 가드 없음 — 복원이라 스킵)', staticSafetyScan(deleteRollback).length === 0, JSON.stringify(staticSafetyScan(deleteRollback)))

  // 다른 테이블/형태의 INSERT/DELETE 는 여전히 전부 거부(ALLOWLIST 는
  // UPDATE 전용이라는 원칙이 이 세 안전 패턴 밖에서는 그대로 유지된다).
  const otherTableInsert = "begin;\n  insert into public.students (id, name) values ('x', 'y');\ncommit;\n"
  check('student_class_assignments 가 아닌 테이블의 insert 는 정적 스캔 위반', staticSafetyScan(otherTableInsert).length >= 1)
  const otherTableDelete = "begin;\n  delete from public.classes where id = 'x';\ncommit;\n"
  check('student_class_assignments 가 아닌 테이블의 delete 는 정적 스캔 위반', staticSafetyScan(otherTableDelete).length >= 1)
}

console.log('\n=== [B4] buildPreflightPlan/buildPostflightPlan — insert(no-duplicate)/delete(not-exists) ===')
{
  const preInsert = buildPreflightPlan(INSERT_MANIFEST)
  check('insert change 는 preflight kind=no-duplicate', preInsert[0].kind === 'no-duplicate')
  check('insert change preflight filters 에 student_id/textbook_id 포함',
    preInsert[0].filters.student_id === INSERT_MANIFEST.changes[0].fields.student_id
    && preInsert[0].filters.textbook_id === INSERT_MANIFEST.changes[0].fields.textbook_id)

  const postInsert = buildPostflightPlan(INSERT_MANIFEST)
  check('insert change 는 postflight expect=fields', JSON.stringify(postInsert[0].expect) === JSON.stringify(INSERT_MANIFEST.changes[0].fields))

  const preDelete = buildPreflightPlan(DELETE_MANIFEST)
  check('delete change 는 preflight expect=expect_before(행 전체)', JSON.stringify(preDelete[0].expect) === JSON.stringify(DELETE_MANIFEST.changes[0].expect_before))

  const postDelete = buildPostflightPlan(DELETE_MANIFEST)
  check('delete change 는 postflight kind=not-exists', postDelete[0].kind === 'not-exists')
}

console.log('\n=== [B4] runHotfix 통합 — SCA insert(정상 적용) ===')
{
  const reader = {
    db: {},
    async getRow(table, id, columns) {
      const row = this.db[`${table}:${id}`]
      if (!row) return null
      if (!columns) return { ...row }
      const out = {}
      for (const c of columns) out[c] = row[c]
      return out
    },
    async countWordsForUnit() { return 2 },
    async headCountFiltered() { return { count: 0, tableMissing: false } }, // 아직 중복 없음
    async selectAllRows() { return [] },
  }
  const executor = {
    calls: [],
    async run(sql) {
      executor.calls.push(sql)
      reader.db[`student_class_assignments:${NEW_SCA_ID}`] = { id: NEW_SCA_ID, ...INSERT_MANIFEST.changes[0].fields }
      return { ok: true }
    },
  }
  const res = await runApprovedHotfix(
    { manifest: INSERT_MANIFEST, envFlag: 'production', runId: 'RUN-B4-SCA-ADD-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('insert manifest 적용 성공 → applied', res.status === 'applied', JSON.stringify(res.report.postMismatches || res.status))
  check('insert manifest 적용 시 executor 호출 1회', executor.calls.length === 1)
}

console.log('\n=== [B4] runHotfix 통합 — SCA delete(정상 적용) ===')
{
  const reader = {
    db: { [`student_class_assignments:${DELETE_SCA_ID}`]: { id: DELETE_SCA_ID, ...DELETE_MANIFEST.changes[0].expect_before } },
    async getRow(table, id, columns) {
      const row = this.db[`${table}:${id}`]
      if (!row) return null
      if (!columns) return { ...row }
      const out = {}
      for (const c of columns) out[c] = row[c]
      return out
    },
    async countWordsForUnit() { return 2 },
    async headCountFiltered() { return { count: 0, tableMissing: false } },
    async selectAllRows() { return [] },
  }
  const executor = {
    calls: [],
    async run(sql) {
      executor.calls.push(sql)
      delete reader.db[`student_class_assignments:${DELETE_SCA_ID}`]
      return { ok: true }
    },
  }
  const res = await runApprovedHotfix(
    { manifest: DELETE_MANIFEST, envFlag: 'production', runId: 'RUN-B4-SCA-DEL-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), runHealthCheck: () => ({ ok: true, output: '' }) },
  )
  check('delete manifest 적용 성공 → applied', res.status === 'applied', JSON.stringify(res.report.postMismatches || res.status))
  check('delete manifest 적용 시 executor 호출 1회', executor.calls.length === 1)
}

console.log('\n=== [B4] runHotfix — insert 중복 사전조건 위반 → preflight-mismatch(fail-closed) ===')
{
  const reader = {
    async getRow() { return null },
    async countWordsForUnit() { return 2 },
    async headCountFiltered() { return { count: 1, tableMissing: false } }, // 이미 같은 student+textbook 행 존재
    async selectAllRows() { return [] },
  }
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: INSERT_MANIFEST, envFlag: 'production', runId: 'RUN-B4-DUP-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('중복 SCA 존재 시 status = preflight-mismatch', res.status === 'preflight-mismatch')
  check('중복 SCA 존재 시 executor 호출 0', calls.length === 0)
  check('mismatches 에 duplicate-row-exists 기록', (res.report.mismatches || []).some((m) => m.reason === 'duplicate-row-exists'))
}

console.log('\n=== [B4] runHotfix — delete 대상 행이 이미 없음 → preflight-mismatch(fail-closed) ===')
{
  const reader = {
    async getRow() { return null },
    async countWordsForUnit() { return 2 },
    async headCountFiltered() { return { count: 0, tableMissing: false } },
    async selectAllRows() { return [] },
  }
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: DELETE_MANIFEST, envFlag: 'production', runId: 'RUN-B4-DELMISS-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('삭제 대상 행이 이미 없으면 status = preflight-mismatch', res.status === 'preflight-mismatch')
  check('삭제 대상 없음 시 executor 호출 0', calls.length === 0)
}

// ── B5 픽스처: invariants delta 미리보기용 최소 스냅샷 ───────────────────
const B5_TB1 = crypto.randomUUID()
const B5_TB2 = crypto.randomUUID()
const B5_UNIT_GOOD = crypto.randomUUID() // TB1 소속, 정상 유닛(2단어)
const B5_UNIT_GOOD2 = crypto.randomUUID() // TB2 소속, 정상 유닛(2단어) — 유령 재배정 목적지
const B5_UNIT_GHOST = crypto.randomUUID() // TB2 소속, 유령(단어 전부 헤더 라벨)
const B5_STUDENT_GHOST = crypto.randomUUID()
const B5_SCA_PRIMARY = crypto.randomUUID()
const B5_SCA_GHOST = crypto.randomUUID()
const B5_CLASS_ID = crypto.randomUUID()

function buildB5GhostSnapshot() {
  return {
    students: [{ id: B5_STUDENT_GHOST, name: 'B5테스트학생', class_id: null, current_unit_id: B5_UNIT_GOOD, unit_name: 'Unit1' }],
    classes: [],
    textbooks: [{ id: B5_TB1, name: 'TB1', owner_class_id: null }, { id: B5_TB2, name: 'TB2', owner_class_id: null }],
    units: [
      { id: B5_UNIT_GOOD, name: 'Unit1', textbook_id: B5_TB1, class_id: null },
      { id: B5_UNIT_GOOD2, name: 'Unit2', textbook_id: B5_TB2, class_id: null },
      { id: B5_UNIT_GHOST, name: 'UnitX', textbook_id: B5_TB2, class_id: null },
    ],
    words: [
      { id: crypto.randomUUID(), unit_id: B5_UNIT_GOOD, word: 'apple', meaning: '사과' },
      { id: crypto.randomUUID(), unit_id: B5_UNIT_GOOD, word: 'banana', meaning: '바나나' },
      { id: crypto.randomUUID(), unit_id: B5_UNIT_GOOD2, word: 'cat', meaning: '고양이' },
      { id: crypto.randomUUID(), unit_id: B5_UNIT_GOOD2, word: 'dog', meaning: '개' },
      { id: crypto.randomUUID(), unit_id: B5_UNIT_GHOST, word: 'word', meaning: '뜻' }, // 헤더 라벨 잔재 -> ghost
    ],
    assignments: [
      { id: B5_SCA_PRIMARY, student_id: B5_STUDENT_GHOST, class_id: null, textbook_id: B5_TB1, current_unit_id: B5_UNIT_GOOD, is_primary: true, created_at: '2026-01-01' },
      { id: B5_SCA_GHOST, student_id: B5_STUDENT_GHOST, class_id: null, textbook_id: B5_TB2, current_unit_id: B5_UNIT_GHOST, is_primary: false, created_at: '2026-01-01' },
    ],
    classTextbooks: [],
  }
}

console.log('\n=== [B5] applyManifestToSnapshot — 순수 변환(update/insert/delete) ===')
{
  const snap = buildB5GhostSnapshot()
  const updateManifest = { id: 'x', project_ref: 'y', changes: [
    { table: 'student_class_assignments', id: B5_SCA_GHOST, expect_before: { current_unit_id: B5_UNIT_GHOST }, set: { current_unit_id: B5_UNIT_GOOD2 } },
  ] }
  const after = applyManifestToSnapshot(snap, updateManifest)
  check('applyManifestToSnapshot — 원본 snap 은 mutate 되지 않음', snap.assignments.find((a) => a.id === B5_SCA_GHOST).current_unit_id === B5_UNIT_GHOST)
  check('applyManifestToSnapshot — 사본은 update 반영됨', after.assignments.find((a) => a.id === B5_SCA_GHOST).current_unit_id === B5_UNIT_GOOD2)

  const insertId = crypto.randomUUID()
  const insertManifest = { id: 'x', project_ref: 'y', changes: [
    { op: 'insert', table: 'student_class_assignments', id: insertId, fields: { student_id: B5_STUDENT_GHOST, class_id: null, textbook_id: B5_TB2, current_unit_id: B5_UNIT_GOOD2, is_primary: false } },
  ] }
  const afterInsert = applyManifestToSnapshot(snap, insertManifest)
  check('applyManifestToSnapshot — insert 로 새 행이 사본에 추가됨', afterInsert.assignments.some((a) => a.id === insertId))
  check('applyManifestToSnapshot — insert 는 원본 배열 길이를 바꾸지 않음', snap.assignments.length === 2)

  const deleteManifest = { id: 'x', project_ref: 'y', changes: [
    { op: 'delete', table: 'student_class_assignments', id: B5_SCA_GHOST, expect_before: { student_id: B5_STUDENT_GHOST, class_id: null, textbook_id: B5_TB2, current_unit_id: B5_UNIT_GHOST, is_primary: false } },
  ] }
  const afterDelete = applyManifestToSnapshot(snap, deleteManifest)
  check('applyManifestToSnapshot — delete 로 사본에서 행이 사라짐', !afterDelete.assignments.some((a) => a.id === B5_SCA_GHOST))
  check('applyManifestToSnapshot — delete 는 원본 배열을 바꾸지 않음', snap.assignments.some((a) => a.id === B5_SCA_GHOST))
}

console.log('\n=== [B5] diffInvariantFindings — 순수 비교(new_fail/new_warn/resolved) ===')
{
  const before = [
    { code: 'A', studentId: 's1', severity: 'WARN', refs: { x: 1 } },
    { code: 'B', studentId: 's2', severity: 'FAIL', refs: { y: 2 } },
  ]
  const after = [
    { code: 'A', studentId: 's1', severity: 'WARN', refs: { x: 1 } }, // 그대로 유지
    { code: 'C', studentId: 's3', severity: 'FAIL', refs: { z: 3 } }, // 새 FAIL
    { code: 'D', studentId: 's4', severity: 'WARN', refs: { w: 4 } }, // 새 WARN
  ]
  const delta = diffInvariantFindings(before, after)
  check('diffInvariantFindings — new_fail 에 C 포함', delta.new_fail.some((f) => f.code === 'C'))
  check('diffInvariantFindings — new_warn 에 D 포함', delta.new_warn.some((f) => f.code === 'D'))
  check('diffInvariantFindings — resolved 에 B 포함', delta.resolved.some((f) => f.code === 'B'))
  check('diffInvariantFindings — 유지된 A 는 new_*/resolved 어디에도 없음',
    !delta.new_fail.some((f) => f.code === 'A') && !delta.new_warn.some((f) => f.code === 'A') && !delta.resolved.some((f) => f.code === 'A'))
}

console.log('\n=== [B5] computeInvariantsDeltaPreview — 유령 SCA 재배정 → resolved 에 SCA_GHOST_UNIT ===')
{
  const snap = buildB5GhostSnapshot()
  const fixManifest = { id: 'fix-ghost-sca', project_ref: 'y', changes: [
    { table: 'student_class_assignments', id: B5_SCA_GHOST, expect_before: { current_unit_id: B5_UNIT_GHOST }, set: { current_unit_id: B5_UNIT_GOOD2 } },
  ] }
  const delta = computeInvariantsDeltaPreview(snap, fixManifest)
  check('유령 SCA 재배정 후 resolved 에 SCA_GHOST_UNIT 포함', delta.resolved.some((f) => f.code === 'SCA_GHOST_UNIT'), JSON.stringify(delta))
  check('유령 SCA 재배정은 새 FAIL 을 만들지 않음', delta.new_fail.length === 0, JSON.stringify(delta.new_fail))
}

console.log('\n=== [B5] computeInvariantsDeltaPreview — 두 번째 primary 추가 → new_fail 에 MULTIPLE_PRIMARY ===')
{
  const snap = buildB5GhostSnapshot()
  const newScaId = crypto.randomUUID()
  const badManifest = { id: 'bad-second-primary', project_ref: 'y', changes: [
    { op: 'insert', table: 'student_class_assignments', id: newScaId,
      fields: { student_id: B5_STUDENT_GHOST, class_id: null, textbook_id: B5_TB2, current_unit_id: B5_UNIT_GOOD2, is_primary: true } },
  ] }
  const delta = computeInvariantsDeltaPreview(snap, badManifest)
  check('두 번째 primary 삽입 시 new_fail 에 MULTIPLE_PRIMARY 포함', delta.new_fail.some((f) => f.code === 'MULTIPLE_PRIMARY'), JSON.stringify(delta.new_fail))
}

console.log('\n=== [B5] runHotfix — invariants delta 가 MULTIPLE_PRIMARY FAIL 을 만들면 승인 전 blocked-invariant(fail-closed) ===')
{
  const snap = buildB5GhostSnapshot()
  const newScaId = crypto.randomUUID()
  const badManifest = {
    id: 'bad-second-primary-live', project_ref: 'testref123',
    affected_students: [B5_STUDENT_GHOST],
    changes: [
      { op: 'insert', table: 'student_class_assignments', id: newScaId,
        fields: { student_id: B5_STUDENT_GHOST, class_id: B5_CLASS_ID, textbook_id: B5_TB2, current_unit_id: B5_UNIT_GOOD2, is_primary: true } },
    ],
  }
  const reader = {
    async getRow() { return null },
    async countWordsForUnit() { return 2 },
    async headCountFiltered() { return { count: 0, tableMissing: false } }, // no-duplicate 사전조건 충족
    async selectAllRows() { return [] }, // students/SCA 스냅샷 해시(baseline)는 무관 행이라 빈 배열로 충분
  }
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: badManifest, envFlag: 'production', runId: 'RUN-B5-BLOCK-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk(), loadInvariantSnapshot: async () => snap },
  )
  check('status = blocked-invariant', res.status === 'blocked-invariant', res.status)
  check('승인 전 차단이라 executor 호출 0(승인 콜백 자체는 도달 전에 STOP)', calls.length === 0)
  check('report.invariantsDelta.new_fail 에 MULTIPLE_PRIMARY 포함', (res.report.invariantsDelta?.new_fail || []).some((f) => f.code === 'MULTIPLE_PRIMARY'))
}

console.log('\n=== [B5] runHotfix — loadInvariantSnapshot 미주입 시 기존 동작 그대로(회귀 없음) ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-B5-NOOP-1', reportDir: REPORT_DIR, reader, dryRun: true },
    { loadEnv: () => envOk() }, // loadInvariantSnapshot 없음
  )
  check('loadInvariantSnapshot 미주입 시 여전히 ready-to-apply', res.status === 'ready-to-apply')
  check('loadInvariantSnapshot 미주입 시 report.invariantsDelta 없음', res.report.invariantsDelta === undefined)
}

console.log('\n=== [C2] computeStandardStatus — 4값 enum 매핑(PASS|WARN|FAIL|BLOCKED_NEEDS_APPROVAL) ===')
{
  check('plan/dry-run 의 ready-to-apply → PASS',
    computeStandardStatus({ status: 'ready-to-apply', dryRun: true, stopReasons: ['--dry-run'], hasNewWarn: false }) === 'PASS')
  check('plan/dry-run 인데 invariants new_warn 있으면 → WARN',
    computeStandardStatus({ status: 'ready-to-apply', dryRun: true, stopReasons: ['--dry-run'], hasNewWarn: true }) === 'WARN')
  check('실제 apply 시도(dryRun=false) + 토큰 없음 → BLOCKED_NEEDS_APPROVAL',
    computeStandardStatus({ status: 'ready-to-apply', dryRun: false, stopReasons: ['SUPABASE_ACCESS_TOKEN 미설정'], hasNewWarn: false }) === 'BLOCKED_NEEDS_APPROVAL')
  check('실제 apply 시도(dryRun=false) + CI 환경 → BLOCKED_NEEDS_APPROVAL',
    computeStandardStatus({ status: 'ready-to-apply', dryRun: false, stopReasons: ['CI 환경'], hasNewWarn: false }) === 'BLOCKED_NEEDS_APPROVAL')
  check('preflight-mismatch → FAIL',
    computeStandardStatus({ status: 'preflight-mismatch', dryRun: true, stopReasons: [], hasNewWarn: false }) === 'FAIL')
  check('blocked-invariant → FAIL',
    computeStandardStatus({ status: 'blocked-invariant', dryRun: false, stopReasons: [], hasNewWarn: false }) === 'FAIL')
  check('applied(성공) → PASS', computeStandardStatus({ status: 'applied', dryRun: false, stopReasons: [], hasNewWarn: false }) === 'PASS')
  check('applied + new_warn 있음 → WARN', computeStandardStatus({ status: 'applied', dryRun: false, stopReasons: [], hasNewWarn: true }) === 'WARN')
  check('rolled-back → FAIL', computeStandardStatus({ status: 'rolled-back', dryRun: false, stopReasons: [], hasNewWarn: false }) === 'FAIL')
  check('invalid-manifest → FAIL', computeStandardStatus({ status: 'invalid-manifest', dryRun: true, stopReasons: [], hasNewWarn: false }) === 'FAIL')
}

console.log('\n=== [C2] runHotfix — report.standardStatus + STANDARD_STATUS 콘솔 라인 wiring ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const originalLog = console.log
  const lines = []
  console.log = (...args) => { lines.push(args.join(' ')) }
  let res
  try {
    res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C2-STD-1', reportDir: REPORT_DIR, reader, dryRun: true },
      { loadEnv: () => envOk() },
    )
  } finally {
    console.log = originalLog
  }
  check('dry-run(plan) 은 report.standardStatus = PASS', res.report.standardStatus === 'PASS')
  check('콘솔 출력에 STANDARD_STATUS: PASS 라인 포함', lines.some((l) => l.includes('STANDARD_STATUS: PASS')))
}
{
  // fix/harness-apply-two-phase-approval(2026-09-05) — dry-run 없이(--dry-run
  // 미지정) 1단계(--approve 없음)는 토큰이 없어도 티켓을 발급한다(계획이
  // 통과했다는 사실 자체는 토큰 유무와 무관 — READY). 하지만 그 티켓으로
  // 2단계(--approve)를 시도하면 그때 토큰 없음에 막혀 BLOCKED_NEEDS_APPROVAL
  // 이 된다 — "적용 시도"라는 의도가 확정되는 시점은 --approve 때다.
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const phase1 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C2-STD-2', reportDir: REPORT_DIR, reader, dryRun: false },
    { loadEnv: () => envOk({ accessToken: '' }) },
  )
  check('토큰 없어도 1단계는 ticket-issued(READY)', phase1.status === 'ticket-issued', phase1.status)
  check('토큰 없는 1단계는 report.standardStatus = PASS', phase1.report.standardStatus === 'PASS', phase1.report.standardStatus)

  const phase2 = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C2-STD-2', approveRunId: 'RUN-C2-STD-2', reportDir: REPORT_DIR, reader, dryRun: false },
    { loadEnv: () => envOk({ accessToken: '' }), isTTY: () => true },
  )
  check('토큰 없는 2단계(--approve) 시도는 status = ready-to-apply(CI/토큰 게이트 재확인)', phase2.status === 'ready-to-apply', phase2.status)
  check('토큰 없는 2단계 시도는 report.standardStatus = BLOCKED_NEEDS_APPROVAL', phase2.report.standardStatus === 'BLOCKED_NEEDS_APPROVAL', phase2.report.standardStatus)
}

// ══════════════════════════════════════════════════════════════════════
// plan-eligibility-textbook-identity 트랙(2026-09-05) — 작업1: apply_
// eligibility 8값 매핑 표(computeApplyEligibility/STOP_REASON_TO_APPLY_
// ELIGIBILITY, scripts/prodHotfix.mjs)의 STOP 사유별 단언 + 완전성 가드.
// ══════════════════════════════════════════════════════════════════════
console.log('\n=== [D1] computeApplyEligibility — STOP 사유별 apply_eligibility 매핑 ===')
{
  check('preflight-mismatch → BLOCKED_PREFLIGHT',
    computeApplyEligibility({ status: 'preflight-mismatch', dryRun: true, stopReasons: [] }) === 'BLOCKED_PREFLIGHT')
  check('baseline-failed → BLOCKED_PREFLIGHT',
    computeApplyEligibility({ status: 'baseline-failed', dryRun: true, stopReasons: [] }) === 'BLOCKED_PREFLIGHT')
  check('ready-to-apply(dryRun=false, 토큰 없음) → BLOCKED_NEEDS_APPROVAL',
    computeApplyEligibility({ status: 'ready-to-apply', dryRun: false, stopReasons: ['SUPABASE_ACCESS_TOKEN 미설정'] }) === 'BLOCKED_NEEDS_APPROVAL')
  check('ready-to-apply(dryRun=false, CI) → BLOCKED_NEEDS_APPROVAL',
    computeApplyEligibility({ status: 'ready-to-apply', dryRun: false, stopReasons: ['CI 환경'] }) === 'BLOCKED_NEEDS_APPROVAL')
  check('not-interactive → BLOCKED_NEEDS_APPROVAL',
    computeApplyEligibility({ status: 'not-interactive', dryRun: false, stopReasons: [] }) === 'BLOCKED_NEEDS_APPROVAL')
  // fix/harness-apply-two-phase-approval(2026-09-05) — 'not-approved' 는
  // readline 문구 비교 전용 STOP 이라 2단계 승인 게이트에는 더 없다(표에서도
  // 제거). 대신 새 STOP 사유 6종을 확인한다.
  check('ticket-issued → READY(1단계 완료, 대기 상태)',
    computeApplyEligibility({ status: 'ticket-issued', dryRun: false, stopReasons: [] }) === 'READY')
  check('approval-mismatch → BLOCKED_NEEDS_APPROVAL',
    computeApplyEligibility({ status: 'approval-mismatch', dryRun: false, stopReasons: [] }) === 'BLOCKED_NEEDS_APPROVAL')
  check('approval-used → BLOCKED_NEEDS_APPROVAL',
    computeApplyEligibility({ status: 'approval-used', dryRun: false, stopReasons: [] }) === 'BLOCKED_NEEDS_APPROVAL')
  check('approval-expired → BLOCKED_NEEDS_APPROVAL',
    computeApplyEligibility({ status: 'approval-expired', dryRun: false, stopReasons: [] }) === 'BLOCKED_NEEDS_APPROVAL')
  check('approval-manifest-mismatch → BLOCKED_MANIFEST',
    computeApplyEligibility({ status: 'approval-manifest-mismatch', dryRun: false, stopReasons: [] }) === 'BLOCKED_MANIFEST')
  check('approval-stale → BLOCKED_PREFLIGHT',
    computeApplyEligibility({ status: 'approval-stale', dryRun: false, stopReasons: [] }) === 'BLOCKED_PREFLIGHT')
  check('blocked-write-drift → BLOCKED_WRITE_DRIFT',
    computeApplyEligibility({ status: 'blocked-write-drift', dryRun: false, stopReasons: [] }) === 'BLOCKED_WRITE_DRIFT')
  check('blocked-invariant → BLOCKED_INVARIANT',
    computeApplyEligibility({ status: 'blocked-invariant', dryRun: true, stopReasons: [] }) === 'BLOCKED_INVARIANT')
  check('blocked-invariant-unavailable → BLOCKED_INVARIANT',
    computeApplyEligibility({ status: 'blocked-invariant-unavailable', dryRun: true, stopReasons: [] }) === 'BLOCKED_INVARIANT')
  check('blocked-ambiguous-textbook → BLOCKED_AMBIGUOUS_TEXTBOOK',
    computeApplyEligibility({ status: 'blocked-ambiguous-textbook', dryRun: false, stopReasons: [] }) === 'BLOCKED_AMBIGUOUS_TEXTBOOK')
  check('blocked-ambiguous-textbook-unavailable → BLOCKED_AMBIGUOUS_TEXTBOOK',
    computeApplyEligibility({ status: 'blocked-ambiguous-textbook-unavailable', dryRun: false, stopReasons: [] }) === 'BLOCKED_AMBIGUOUS_TEXTBOOK')
  // lint/정적 스캔/manifest 검증/allowlist 실패 계열 → BLOCKED_MANIFEST
  for (const s of ['invalid-manifest', 'manifest-sha-mismatch', 'manifest-tampered', 'unsafe-sql', 'env-flag-required', 'env-mismatch', 'invalid-run-id', 'rollback-of-report-load-failed', 'rollback-of-mismatch']) {
    check(`${s} → BLOCKED_MANIFEST`, computeApplyEligibility({ status: s, dryRun: true, stopReasons: [] }) === 'BLOCKED_MANIFEST')
  }
  check('ready-to-apply(dryRun=true) → READY(plan 모드는 계획 통과=READY)',
    computeApplyEligibility({ status: 'ready-to-apply', dryRun: true, stopReasons: ['--dry-run'] }) === 'READY')
  check('applied → READY', computeApplyEligibility({ status: 'applied', dryRun: false, stopReasons: [] }) === 'READY')
  check('apply-failed → BLOCKED_UNKNOWN(사전 8범주 밖, 종결 상태)',
    computeApplyEligibility({ status: 'apply-failed', dryRun: false, stopReasons: [] }) === 'BLOCKED_UNKNOWN')
  check('rollback-failed → BLOCKED_UNKNOWN',
    computeApplyEligibility({ status: 'rollback-failed', dryRun: false, stopReasons: [] }) === 'BLOCKED_UNKNOWN')
  check('rolled-back → BLOCKED_UNKNOWN',
    computeApplyEligibility({ status: 'rolled-back', dryRun: false, stopReasons: [] }) === 'BLOCKED_UNKNOWN')
  check('임의 미등록 status → BLOCKED_UNKNOWN + computeStandardStatus = FAIL',
    computeApplyEligibility({ status: 'totally-made-up-status-xyz', dryRun: true, stopReasons: [] }) === 'BLOCKED_UNKNOWN'
    && computeStandardStatus({ status: 'totally-made-up-status-xyz', dryRun: true, stopReasons: [], hasNewWarn: false }) === 'FAIL')
  check('computeApplyEligibility 는 항상 APPLY_ELIGIBILITY_VALUES 8값 중 하나만 반환',
    ['preflight-mismatch', 'blocked-write-drift', 'blocked-invariant', 'ready-to-apply', 'not-interactive', 'apply-failed', 'unknown-xyz']
      .every((s) => APPLY_ELIGIBILITY_VALUES.includes(computeApplyEligibility({ status: s, dryRun: true, stopReasons: [] }))))
}

console.log('\n=== [D1] 완전성 가드 — runHotfix() 의 모든 finish(\'...\') STOP 사유가 매핑 표에 등록돼 있다 ===')
{
  // 새 STOP 사유가 STOP_REASON_TO_APPLY_ELIGIBILITY 갱신 없이 추가되면 이
  // 단언이 FAIL 한다(fail-closed 완전성 가드 — 작업1 요구사항). 'ready-to-apply'
  // 는 표에 없는 대신 computeApplyEligibility() 가 dryRun/stopReasons 로
  // 특수 처리하므로 별도로 커버리지를 확인한다.
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'prodHotfix.mjs'), 'utf8')
  const found = new Set()
  const re = /finish\('([a-zA-Z0-9_-]+)'/g
  let m
  while ((m = re.exec(src))) found.add(m[1])
  check('grep 으로 최소 1개 이상의 finish() 사유를 수집함(회귀 방지 — 파싱 자체가 깨지지 않았는지)', found.size >= 15, found.size)
  const uncovered = [...found].filter((s) => s !== 'ready-to-apply' && !Object.prototype.hasOwnProperty.call(STOP_REASON_TO_APPLY_ELIGIBILITY, s))
  check('runHotfix() 의 모든 finish() status 문자열이 매핑 표(또는 ready-to-apply 특수 처리)에 등록됨',
    uncovered.length === 0, JSON.stringify(uncovered))
  check("'ready-to-apply' 는 특수 처리 대상이라 표에는 없음(computeApplyEligibility 가 커버)",
    !Object.prototype.hasOwnProperty.call(STOP_REASON_TO_APPLY_ELIGIBILITY, 'ready-to-apply'))
}

console.log('\n=== [D1] runHotfix — report.blocked_reason / report.apply_eligibility wiring ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-D1-WIRING-1', reportDir: REPORT_DIR, reader, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('report.blocked_reason = ready-to-apply(원래 status 문자열)', res.report.blocked_reason === 'ready-to-apply', res.report.blocked_reason)
  check('report.apply_eligibility = READY', res.report.apply_eligibility === 'READY', res.report.apply_eligibility)
  check('report.status 필드는 그대로 유지됨(삭제 아님)', res.report.status === 'ready-to-apply')
  check('report.standardStatus 필드는 그대로 유지됨(삭제 아님)', res.report.standardStatus === 'PASS')
}
{
  const reader = makeReader(BASE_MANIFEST, {
    getRowOverride: { 'students:2c6845fc-b30e-4e4d-b260-d13c13fe7b9a': () => ({ current_unit_id: 'WRONG-UNIT-ID', unit_name: 'Unit5' }) },
  })
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-D1-WIRING-2', reportDir: REPORT_DIR, reader, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('preflight-mismatch → report.blocked_reason = preflight-mismatch', res.report.blocked_reason === 'preflight-mismatch')
  check('preflight-mismatch → report.apply_eligibility = BLOCKED_PREFLIGHT', res.report.apply_eligibility === 'BLOCKED_PREFLIGHT', res.report.apply_eligibility)
}

// ── QA-V2(2026-09-04): V2 보안 리뷰 회귀 7종(FAIL-first) ──────────────────
// 아래 섹션들은 read-only 보안 리뷰가 지적한 7개 항목을 회귀 테스트로 고정한다.
// CLAUDE.md 규칙 15에 따라 수정 전 코드에서 먼저 실행해 실제로 FAIL 하는 것을
// 확인한 뒤(각 섹션 주석의 "수정 전 실측" 참고) 구현을 넣었다.

console.log('\n=== [QA1] manifest 문자열 값 $/%/역슬래시/제어문자 차단 + dollar-quote 태그화 ===')
{
  // 수정 전 실측: INJECTION_CHAR_RE 가 ;/--//* 만 봐서 아래 값들이 전부 통과했다.
  const stealthDollar = clone(BASE_MANIFEST)
  stealthDollar.changes[1].set.unit_name = 'A$$ x'
  check('set 값의 $$ 는 scanManifestStringValues 가 검출',
    scanManifestStringValues(stealthDollar).some((v) => v.value === 'A$$ x'))
  check('set 값에 $$ 가 있으면 invalid-manifest', !validateManifest(stealthDollar).valid)

  const pctId = clone(BASE_MANIFEST)
  pctId.id = 'test%hotfix-001'
  check('manifest.id 의 % 는 거부(raise notice 포맷 탈출 방지)', !validateManifest(pctId).valid)

  const backslash = clone(BASE_MANIFEST)
  backslash.title = 'back\\slash 제목'
  check('문자열 값의 역슬래시 거부', !validateManifest(backslash).valid)

  const control = clone(BASE_MANIFEST)
  control.notes = ['a', String.fromCharCode(7), 'b'].join('')
  check('문자열 값의 제어문자 거부', !validateManifest(control).valid)

  const expectPct = clone(BASE_MANIFEST)
  expectPct.must_not_change[0].expect.unit_name = 'Unit%2'
  check('must_not_change.expect 값의 % 도 거부', !validateManifest(expectPct).valid)

  const refDollar = clone(BASE_MANIFEST)
  refDollar.reference_rows_must_exist[0].expect.name = 'Unit$5'
  check('reference_rows_must_exist.expect 값의 $ 도 거부', !validateManifest(refDollar).valid)
}
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const stealth = clone(BASE_MANIFEST)
  stealth.changes[1].set.unit_name = 'A$$ x'
  const res = await runHotfix(
    { manifest: stealth, envFlag: 'production', runId: 'RUN-QA1-STEALTH-1', reportDir: REPORT_DIR, reader, executor, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('stealth manifest 는 SQL 생성 이전에 invalid-manifest 로 STOP', res.status === 'invalid-manifest', res.status)
  check('stealth manifest 는 apply SQL 파일을 만들지 않음', !res.report.applySqlPath)
  check('stealth manifest 는 executor 호출 0', calls.length === 0)
}
{
  const runId = 'RUNID-TEST-1'
  const sql = buildApplySql(BASE_MANIFEST, runId)
  check('생성 SQL 은 태그 없는 $$ 를 쓰지 않음', !sql.includes('$$'), sql.split('\n').find((l) => l.includes('$$')) || '')
  check('생성 SQL 은 runId 기반 태그 인용 사용(do)', sql.includes('do $hotfix_RUNIDTEST1$'))
  check('생성 SQL 은 runId 기반 태그 인용 사용(end)', sql.includes('end $hotfix_RUNIDTEST1$;'))
  check('rollback SQL 도 같은 태그 인용 사용', buildRollbackSql(BASE_MANIFEST, runId).includes('$hotfix_RUNIDTEST1$'))

  let threw = false
  try { buildApplySql(BASE_MANIFEST, 'bad$id') } catch { threw = true }
  check('runId 이 영숫자/하이픈 밖 문자를 포함하면 SQL 생성 자체가 throw(fail-closed)', threw)

  const pctManifest = clone(BASE_MANIFEST)
  pctManifest.id = 'pct%id' // validateManifest 는 거부하지만, 생성기 자체의 이스케이프를 직접 확인
  const pctSql = buildApplySql(pctManifest, runId)
  check('raise notice 포맷에 실린 데이터의 % 는 %% 로 이스케이프', pctSql.includes('pct%%id'))
  check('의도된 자리표시자(% rows)는 그대로 유지', /raise notice '[^']*OK: % rows', v_total;/.test(pctSql))
}

console.log('\n=== [QA2] must_not_change/reference_rows_must_exist 의 expect 값 타입 검사 ===')
{
  // 수정 전 실측: expect 는 "object 인지"만 확인하고 값 타입은 전혀 안 봤다.
  const badMnc = clone(BASE_MANIFEST)
  badMnc.must_not_change[0].expect.current_unit_id = 'NOT-A-UUID'
  check('must_not_change.expect 의 uuid 컬럼이 uuid 아니면 거부', !validateManifest(badMnc).valid)

  const nullMnc = clone(BASE_MANIFEST)
  nullMnc.must_not_change[0].expect.current_unit_id = null
  check('must_not_change.expect 의 current_unit_id=null 은 허용(uuid_or_null)',
    validateManifest(nullMnc).valid, JSON.stringify(validateManifest(nullMnc).errors))

  const nullClassId = clone(BASE_MANIFEST)
  nullClassId.must_not_change.push({ table: 'students', id: crypto.randomUUID(), expect: { class_id: null } })
  check('must_not_change.expect 의 class_id=null 은 거부(uuid 전용 컬럼)', !validateManifest(nullClassId).valid)

  const badBool = clone(BASE_MANIFEST)
  badBool.must_not_change.push({ table: 'student_class_assignments', id: crypto.randomUUID(), expect: { is_primary: 'true' } })
  check('must_not_change.expect 의 boolean 컬럼이 문자열이면 거부', !validateManifest(badBool).valid)

  const badRef = clone(BASE_MANIFEST)
  badRef.reference_rows_must_exist[0].expect.textbook_id = 'nope'
  check('reference_rows_must_exist.expect 의 textbook_id 가 uuid 아니면 거부', !validateManifest(badRef).valid)

  const objRef = clone(BASE_MANIFEST)
  objRef.reference_rows_must_exist[0].expect.name = { nested: 'x' }
  check('expect 값이 스칼라(string/number/boolean/null)가 아니면 거부', !validateManifest(objRef).valid)

  check('정상 BASE_MANIFEST 의 expect 들은 그대로 통과', validateManifest(BASE_MANIFEST).valid,
    JSON.stringify(validateManifest(BASE_MANIFEST).errors))
}

console.log('\n=== [QA3] 서술 lint 오탐 — 여러 change 가 같은 before 를 공유하는 경우(유령 유닛 N행) ===')
{
  // 수정 전 실측: title 이 changes[0] 과 완전히 일치해도, 같은 before 값을 쓰는
  // changes[2](다른 after)와 부분 일치한다는 이유로 FAIL 로 잡혔다(오탐).
  const ghostTitle = clone(BASE_MANIFEST)
  ghostTitle.title = "핫픽스: current_unit_id '113ee184-c5c7-4ee5-8b6c-99d547a06525' -> '4ce41359-6424-4b5e-933d-479db6951586'"
  check('한 change 와 완전히 일치하는 서술은 다른 change 때문에 FAIL 되지 않음(오탐 0)',
    lintManifestNarratives(ghostTitle).length === 0, JSON.stringify(lintManifestNarratives(ghostTitle)))
  check('오탐 없는 서술은 validateManifest 도 통과', validateManifest(ghostTitle).valid)

  const contradiction = clone(BASE_MANIFEST)
  contradiction.title = "핫픽스: current_unit_id '113ee184-c5c7-4ee5-8b6c-99d547a06525' -> '00000000-0000-4000-8000-000000000000'"
  check('어느 change 와도 일치하지 않는 서술은 여전히 FAIL(모순 탐지 유지)',
    lintManifestNarratives(contradiction).length > 0)

  const inChange = clone(BASE_MANIFEST)
  inChange.changes[2]._comment = "current_unit_id '113ee184-c5c7-4ee5-8b6c-99d547a06525' -> '4ce41359-6424-4b5e-933d-479db6951586'"
  check('changes[i] 안의 서술은 그 change 하고만 대조(다른 change 와 맞아도 FAIL)',
    lintManifestNarratives(inChange).length > 0, JSON.stringify(lintManifestNarratives(inChange)))
}

console.log('\n=== [QA4] invariants delta 계산 실패 → fail-closed(blocked-invariant-unavailable) ===')
{
  // 수정 전 실측: 로더/평가 예외를 catch 해 "fail-open, 정보성" 으로 넘기고
  // ready-to-apply 로 진행했다(=검증되지 않은 채 승인 대상이 됨).
  const base = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const reader = {
    ...base,
    async selectAllRows(table, columns) {
      if (table === 'units') throw new Error('READ_ERROR units selectAll (fixture)')
      return base.selectAllRows(table, columns)
    },
  }
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-QA4-INV-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    {
      loadEnv: () => envOk(),
      runHealthCheck: () => ({ ok: true, output: '' }),
      loadInvariantSnapshot: async (r) => {
        await r.selectAllRows('units', ['id'])
        return { students: [], assignments: [] }
      },
    },
  )
  check('스냅샷 조회 실패 시 status = blocked-invariant-unavailable', res.status === 'blocked-invariant-unavailable', res.status)
  check('계산 실패는 절대 ready-to-apply 가 아님', res.status !== 'ready-to-apply')
  check('계산 실패 시 STANDARD_STATUS = FAIL', res.report.standardStatus === 'FAIL', res.report.standardStatus)
  check('계산 실패 시 exitCode != 0', res.exitCode !== 0)
  check('계산 실패 시 executor 호출 0', calls.length === 0)
  check('computeStandardStatus(blocked-invariant-unavailable) = FAIL',
    computeStandardStatus({ status: 'blocked-invariant-unavailable', dryRun: true, stopReasons: [], hasNewWarn: false }) === 'FAIL')
}

console.log('\n=== [QA5] delete rollback 의 created_at 복원 + insert (student_id,class_id) 선행조건 ===')
{
  // 수정 전 실측: op=delete 의 expect_before 는 5개 컬럼만 요구했고, rollback
  // insert 는 created_at 없이 행을 다시 넣어 원래 생성시각이 소실됐다.
  const noCreatedAt = clone(DELETE_MANIFEST)
  delete noCreatedAt.changes[0].expect_before.created_at
  check('op=delete expect_before 에 created_at 없으면 거부', !validateManifest(noCreatedAt).valid)
  check('created_at 포함 delete manifest 는 valid',
    validateManifest(DELETE_MANIFEST).valid, JSON.stringify(validateManifest(DELETE_MANIFEST).errors))

  const rollback = buildRollbackSql(DELETE_MANIFEST, 'RUN-QA5-1')
  check('delete rollback insert 컬럼 목록에 created_at 포함',
    /insert into public\.student_class_assignments \([^)]*created_at[^)]*\)/.test(rollback))
  check('delete rollback insert 값에 원래 created_at 리터럴 포함',
    rollback.includes(`'${DELETE_MANIFEST.changes[0].expect_before.created_at}'`))
  check('delete rollback 정적 스캔 위반 0건', staticSafetyScan(rollback).length === 0, JSON.stringify(staticSafetyScan(rollback)))

  const insertApply = buildApplySql(INSERT_MANIFEST, 'RUN-QA5-2')
  check('insert 선행조건에 (student_id, textbook_id) 가드 포함',
    /if exists \(select 1 from public\.student_class_assignments where student_id = '[^']+' and textbook_id = /.test(insertApply))
  check('insert 선행조건에 (student_id, class_id) 가드 포함(테이블 실제 unique key)',
    /if exists \(select 1 from public\.student_class_assignments where student_id = '[^']+' and class_id = /.test(insertApply))
  check('두 선행조건 모두 정적 스캔 통과', staticSafetyScan(insertApply).length === 0, JSON.stringify(staticSafetyScan(insertApply)))

  const dupItems = buildPreflightPlan(INSERT_MANIFEST).filter((p) => p.kind === 'no-duplicate')
  check('preflight no-duplicate 항목 2건(textbook_id/class_id)', dupItems.length === 2, JSON.stringify(dupItems))
  check('preflight no-duplicate 에 class_id 필터 포함', dupItems.some((p) => 'class_id' in (p.filters || {})))
}

console.log('\n=== [QA6] staticSafetyScan 에 manifest 를 실제로 넘긴다(narrative-drift 이중 방어선) ===')
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'prodHotfix.mjs'), 'utf8')
  check('3단계가 staticSafetyScan(applySql, manifest) 로 호출', /staticSafetyScan\(applySql, manifest\)/.test(src))
  check('manifest 를 빠뜨린 호출 형태가 남아있지 않음', !/staticSafetyScan\(applySql\)/.test(src))
}

console.log('\n=== [QA7] dry-run 콘솔 문구 + .tmp gitignore ===')
{
  const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
  const originalLog = console.log
  const lines = []
  console.log = (...args) => { lines.push(args.join(' ')) }
  try {
    await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-QA7-DRY-1', reportDir: REPORT_DIR, reader, dryRun: true },
      { loadEnv: () => envOk() },
    )
  } finally {
    console.log = originalLog
  }
  check('dry-run 은 STANDARD_STATUS 에 (DRY-RUN — 실제 적용 아님) 을 덧붙여 표시',
    lines.some((l) => l.trim() === 'STANDARD_STATUS: PASS (DRY-RUN — 실제 적용 아님)'),
    JSON.stringify(lines.filter((l) => l.includes('STANDARD_STATUS'))))

  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  check('.gitignore 에 루트 .tmp/ 포함(운영 보고서 실값 추적 금지)',
    gitignore.split(/\r?\n/).some((l) => l.trim() === '.tmp/'))
}

// ══════════════════════════════════════════════════════════════════════
// C3(2026-09-05) — verifyWriteDriftGuard 를 runHotfix() 실행 흐름(6.5단계)에
// 배선한 런타임 FAIL-CLOSED 게이트 검증. 예전엔 이 가드가 [B2] 의
// happy-path 호출로만 존재를 확인받았고, runHotfix() 어디서도 호출되지
// 않아 실제 실행에는 아무 영향이 없었다(감사에서 확인된 문제 [1]).
// D.buildApplySql 을 감싸 실제 생성 SQL 을 변조하는 stub 으로 세 가지
// 드리프트(SET 값/대상 row id/변경 건수)를 재현하고, 매 케이스에서
// executor.run() 이 절대 호출되지 않음(6.5단계가 8단계 승인 게이트보다도
// 먼저라 dryRun:false 로만 두면 충분 — isTTY/approve 는 이 STOP 지점까지
// 아예 도달하지 않으므로 불필요)을 단언한다.
// ══════════════════════════════════════════════════════════════════════
console.log('\n=== [C3] runHotfix — VERIFY==WRITE 드리프트 가드 배선(blocked-write-drift, FAIL-first) ===')
{
  // 통제군 — 정상 manifest 는 배선된 가드도 그대로 통과(ok=true), 기존
  // dry-run 동작(ready-to-apply) 이 바뀌지 않는다([B2]의 pure-function 대조군과
  // 별개로, 실행 흐름(runHotfix)에 배선된 뒤에도 정상 케이스가 안 깨짐을 확인).
  {
    const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
    const res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C3-CONTROL-1', reportDir: REPORT_DIR, reader, dryRun: true },
      { loadEnv: () => envOk() },
    )
    check('통제군: status = ready-to-apply(기존 동작 그대로)', res.status === 'ready-to-apply')
    check('통제군: report.writeDriftGuard.ok = true(불일치 0건)',
      res.report.writeDriftGuard?.ok === true && (res.report.writeDriftGuard?.mismatches || []).length === 0,
      JSON.stringify(res.report.writeDriftGuard))
  }

  // (i) SET 값 드리프트 — BASE_MANIFEST.changes[0](SCA f9a14e8a…)의 SET
  // current_unit_id 를 buildApplySql 결과에서만 다른 UUID 로 바꿔치기한다.
  {
    const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
    const calls = []
    const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
    const driftedBuildApplySql = (manifest, runId) => buildApplySql(manifest, runId).replace(
      "set current_unit_id = '4ce41359-6424-4b5e-933d-479db6951586' where id = 'f9a14e8a",
      "set current_unit_id = '00000000-0000-4000-8000-000000000099' where id = 'f9a14e8a",
    )
    const res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C3-SETDRIFT-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
      { loadEnv: () => envOk(), buildApplySql: driftedBuildApplySql },
    )
    check('(i) SET 값 드리프트: status = blocked-write-drift', res.status === 'blocked-write-drift')
    check('(i) SET 값 드리프트: executor 호출 0(승인 게이트 도달 전 STOP)', calls.length === 0)
    const mismatches = res.report.writeDriftGuard?.mismatches || []
    check('(i) SET 값 드리프트: apply-set-mismatch 포함', mismatches.some((m) => m.reason === 'apply-set-mismatch'), JSON.stringify(mismatches))
  }

  // (ii) 대상 row id 드리프트 — 같은 change 의 WHERE id 를 다른 UUID 로 바꿔,
  // 원래 id 로는 매칭되는 SQL 라인을 찾을 수 없게 만든다.
  {
    const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
    const calls = []
    const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
    const driftedBuildApplySql = (manifest, runId) => buildApplySql(manifest, runId).replace(
      "where id = 'f9a14e8a-0a2f-4f5a-aaa7-8b6fc7f0db77' and student_id",
      "where id = '00000000-0000-4000-8000-000000000088' and student_id",
    )
    const res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C3-IDDRIFT-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
      { loadEnv: () => envOk(), buildApplySql: driftedBuildApplySql },
    )
    check('(ii) 대상 row id 드리프트: status = blocked-write-drift', res.status === 'blocked-write-drift')
    check('(ii) 대상 row id 드리프트: executor 호출 0', calls.length === 0)
    const mismatches = res.report.writeDriftGuard?.mismatches || []
    check('(ii) 대상 row id 드리프트: apply-sql-not-found 포함(원래 id 로 매칭되는 라인을 못 찾음)',
      mismatches.some((m) => m.reason === 'apply-sql-not-found'), JSON.stringify(mismatches))
  }

  // (iii) 변경 건수(row 수) 드리프트 — manifest 밖 여분 UPDATE 문을 1개 끼워
  // 넣는다(기존 3개 라인은 그대로 두어 per-change 대조는 전부 통과하지만,
  // 총 개수(3 vs 4)가 어긋난다 — apply-row-count-mismatch 전용 케이스).
  {
    const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
    const calls = []
    const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
    const driftedBuildApplySql = (manifest, runId) => buildApplySql(manifest, runId).replace(
      '  if v_total <> 3 then raise exception',
      "  update public.students set unit_name = 'ExtraDrift' where id = '2c6845fc-b30e-4e4d-b260-d13c13fe7b9a' and unit_name = 'Unit5';\n  if v_total <> 3 then raise exception",
    )
    const res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C3-COUNTDRIFT-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
      { loadEnv: () => envOk(), buildApplySql: driftedBuildApplySql },
    )
    check('(iii) 행 수 드리프트: status = blocked-write-drift', res.status === 'blocked-write-drift')
    check('(iii) 행 수 드리프트: executor 호출 0', calls.length === 0)
    const mismatches = res.report.writeDriftGuard?.mismatches || []
    check('(iii) 행 수 드리프트: apply-row-count-mismatch 포함(기대 3, 실제 4)',
      mismatches.some((m) => m.reason === 'apply-row-count-mismatch' && m.expected === 3 && m.actual === 4), JSON.stringify(mismatches))
  }
}

// ══════════════════════════════════════════════════════════════════════
// C3(2026-09-05) — 단계 순서 단언. defaultDeps.onStep(선택적 훅, 기본
// no-op)으로 runHotfix() 가 각 단계 진입 시 남기는 이름을 배열로 수집해,
// 고정 순서(감사 문제 [3]) 를 배열 완전 일치로 확인한다. dry-run 흐름은
// approval-gate/apply/postflight/health-check 에 도달하지 않아야 하고,
// 승인 이후(apply 성공) 흐름은 그 뒤 단계까지 이어져야 한다.
// ══════════════════════════════════════════════════════════════════════
console.log('\n=== [C4] runHotfix — 단계 순서 단언(onStep) ===')
{
  // dry-run 흐름 — write-drift-guard(6.5) 통과 후 dry-run-stop 에서 멈춘다.
  {
    const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
    const steps = []
    const res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C4-DRY-1', reportDir: REPORT_DIR, reader, dryRun: true },
      { loadEnv: () => envOk(), onStep: (name) => steps.push(name) },
    )
    check('dry-run: status = ready-to-apply', res.status === 'ready-to-apply')
    const expected = ['manifest-load', 'env-flag', 'env-ref', 'static-scan', 'preflight', 'ambiguous-textbook-check', 'class-id-change-check', 'baseline', 'plan-output', 'write-drift-guard', 'dry-run-stop']
    check('dry-run: 단계 순서가 기대 순서와 정확히 일치(고정 순서)', JSON.stringify(steps) === JSON.stringify(expected), JSON.stringify(steps))
    check('dry-run: approval/apply/postflight/health 에는 도달하지 않음',
      !steps.includes('approval-gate') && !steps.includes('apply') && !steps.includes('postflight') && !steps.includes('health-check'))
  }

  // 승인 이후 apply 성공 전체 흐름 — approval-gate 부터 health-check 까지 이어진다.
  // fix/harness-apply-two-phase-approval(2026-09-05) — 승인이 2단계(1단계=
  // 티켓 발급, 2단계=--approve 로 재실행)로 나뉘면서, "승인 이후" 단계 순서도
  // 두 번의 별도 runHotfix() 호출로 나눠 각각 확인한다(같은 runId 재사용).
  {
    const reader = makeReader(BASE_MANIFEST, { tableRowsQueues: OK_SNAPSHOTS })
    const calls = []
    const executor = {
      async run(sql) { calls.push(sql); if (calls.length === 1) applyChangesToDb(reader.db, BASE_MANIFEST); return { ok: true } },
    }

    const steps1 = []
    const phase1 = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C4-APPLY-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
      { loadEnv: () => envOk(), onStep: (name) => steps1.push(name) },
    )
    check('1단계: status = ticket-issued', phase1.status === 'ticket-issued', phase1.status)
    const expected1 = ['manifest-load', 'env-flag', 'env-ref', 'static-scan', 'preflight', 'ambiguous-textbook-check', 'class-id-change-check', 'baseline', 'plan-output', 'write-drift-guard', 'ticket-issue']
    check('1단계: 단계 순서가 기대 순서와 정확히 일치(고정 순서)', JSON.stringify(steps1) === JSON.stringify(expected1), JSON.stringify(steps1))
    check('1단계: approval-gate/apply/postflight/health 에는 도달하지 않음',
      !steps1.includes('approval-gate') && !steps1.includes('apply') && !steps1.includes('postflight') && !steps1.includes('health-check'))

    const steps2 = []
    const res = await runHotfix(
      { manifest: BASE_MANIFEST, envFlag: 'production', runId: 'RUN-C4-APPLY-1', approveRunId: 'RUN-C4-APPLY-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
      { loadEnv: () => envOk(), isTTY: () => true, runHealthCheck: () => ({ ok: true, output: '' }), onStep: (name) => steps2.push(name) },
    )
    check('2단계: status = applied', res.status === 'applied')
    const expected2 = ['manifest-load', 'env-flag', 'env-ref', 'static-scan', 'preflight', 'ambiguous-textbook-check', 'class-id-change-check', 'baseline', 'plan-output', 'write-drift-guard', 'approval-gate', 'manifest-reverify', 'apply', 'postflight', 'health-check']
    check('2단계: 단계 순서가 기대 순서와 정확히 일치(고정 순서, readline 없음)', JSON.stringify(steps2) === JSON.stringify(expected2), JSON.stringify(steps2))
    check('2단계: ticket-issue 단계는 다시 지나가지 않음(이미 1단계에서 발급됨)', !steps2.includes('ticket-issue'))
  }
}

// ══════════════════════════════════════════════════════════════════════
// [C5](2026-09-05, plan-eligibility-textbook-identity 트랙, 작업2) — 교재
// identity 모호성 사전 차단(blocked-ambiguous-textbook) 통합 테스트.
// fixture: "V2 중1 천재 이상기"(AMBIG_TB1) / "V2 중2 천재 이상기"(AMBIG_TB2)
// — 같은 출판사("천재교육"), 학년 접두만 다름(TEXTBOOK_SIMILAR_NAME 과 동일
// 조건). AMBIG_UNIT 은 AMBIG_TB2 소속 — SCA 를 그 유닛으로 재배정하는
// change 는 대상 교재(AMBIG_TB2)가 모호 쌍의 일원이라 차단 대상이다.
// ══════════════════════════════════════════════════════════════════════
console.log("\n=== [C5] runHotfix — 교재 identity 모호성 사전 차단(blocked-ambiguous-textbook) ===")
const AMBIG_TB1 = crypto.randomUUID()
const AMBIG_TB2 = crypto.randomUUID()
const AMBIG_UNIT = crypto.randomUUID()
const AMBIG_SAFE_TB = crypto.randomUUID()
const AMBIG_SAFE_UNIT = crypto.randomUUID()
const AMBIG_SCA = crypto.randomUUID()
const AMBIG_STUDENT = crypto.randomUUID()
const AMBIG_TEXTBOOKS_LIVE = [
  { id: AMBIG_TB1, name: 'V2 중1 천재 이상기', publisher_name: '천재교육' },
  { id: AMBIG_TB2, name: 'V2 중2 천재 이상기', publisher_name: '천재교육' },
  { id: AMBIG_SAFE_TB, name: 'V2 완전히 다른 교재', publisher_name: '동아' },
]

function buildAmbigManifest(extra = {}) {
  return {
    id: 'test-ambiguous-textbook-001',
    project_ref: 'testref123',
    title: '모호 교재 재배정 테스트',
    affected_students: [AMBIG_STUDENT],
    changes: [
      {
        table: 'student_class_assignments', id: AMBIG_SCA,
        expect_before: { student_id: AMBIG_STUDENT, textbook_id: AMBIG_TB1, is_primary: true, current_unit_id: crypto.randomUUID() },
        set: { current_unit_id: AMBIG_UNIT },
        ...extra,
      },
    ],
    reference_rows_must_exist: [
      { table: 'units', id: AMBIG_UNIT, expect: { name: 'Unit1', textbook_id: AMBIG_TB2 } },
    ],
    learning_baseline_tables: [],
  }
}

function buildAmbigReader(manifest, extraOpts = {}) {
  return makeReader(manifest, { tableRowsQueues: { textbooks: [AMBIG_TEXTBOOKS_LIVE] }, ...extraOpts })
}

// (i) ack 없이 모호 교재로 재배정 → blocked-ambiguous-textbook, executor 호출 0
{
  const manifest = buildAmbigManifest()
  const reader = buildAmbigReader(manifest)
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest, envFlag: 'production', runId: 'RUN-C5-BLOCK-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('(i) ack 없음: status = blocked-ambiguous-textbook', res.status === 'blocked-ambiguous-textbook', res.status)
  check('(i) ack 없음: apply_eligibility = BLOCKED_AMBIGUOUS_TEXTBOOK', res.report.apply_eligibility === 'BLOCKED_AMBIGUOUS_TEXTBOOK', res.report.apply_eligibility)
  check('(i) ack 없음: executor 호출 0(승인 게이트 도달 전 STOP)', calls.length === 0)
}

// FAIL-first 확인 — blocked-ambiguous-textbook STOP 자체가 실제로 이 신규
// 코드에 의존하는지, 그 STOP 을 임시로 무력화하면 (i)가 FAIL 하는지 1회
// 확인한다(CLAUDE.md 규칙 15). 코드 수정 없이 "return 을 건너뛴 결과"를
// 흉내내려면 실제 runHotfix 소스를 손대야 하므로, 여기서는 대신 최소
// FAIL-first 대체 증거로 "이 STOP 이 없었다면 나왔을 상태"(ready-to-apply,
// dry-run)가 이 fixture 로 정상 도달 가능함을 별도로 확인해, (i)의 PASS 가
// 우연이 아니라 신규 차단 로직이 실제로 개입한 결과임을 방증한다(아래
// (iv) 비모호 fixture 로 같은 흐름이 정상 통과함을 대조군으로 확인).

// (ii) 올바른 textbook_identity ack → 통과(dry-run 까지 도달)
{
  const manifest = buildAmbigManifest({
    textbook_identity: { id: AMBIG_TB2, name: 'V2 중2 천재 이상기', publisher_name: '천재교육' },
  })
  const reader = buildAmbigReader(manifest)
  const res = await runHotfix(
    { manifest, envFlag: 'production', runId: 'RUN-C5-ACK-OK-1', reportDir: REPORT_DIR, reader, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('(ii) 올바른 ack: status = ready-to-apply(dry-run 까지 통과)', res.status === 'ready-to-apply', res.status)
  check('(ii) 올바른 ack: apply_eligibility = READY', res.report.apply_eligibility === 'READY', res.report.apply_eligibility)
}

// (iii) ack 의 name 을 반대쪽 교재("중1…")로 잘못 준 경우 → 여전히 차단
{
  const manifest = buildAmbigManifest({
    textbook_identity: { id: AMBIG_TB2, name: 'V2 중1 천재 이상기', publisher_name: '천재교육' },
  })
  const reader = buildAmbigReader(manifest)
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest, envFlag: 'production', runId: 'RUN-C5-ACK-BADNAME-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('(iii) name 이 잘못된 ack: status = blocked-ambiguous-textbook', res.status === 'blocked-ambiguous-textbook', res.status)
  check('(iii) name 이 잘못된 ack: executor 호출 0', calls.length === 0)
}

// (iv) 모호하지 않은 교재는 ack 없이 통과
{
  const manifest = buildAmbigManifest()
  manifest.changes[0].set.current_unit_id = AMBIG_SAFE_UNIT
  manifest.reference_rows_must_exist = [
    { table: 'units', id: AMBIG_SAFE_UNIT, expect: { name: 'Unit1', textbook_id: AMBIG_SAFE_TB } },
  ]
  const reader = buildAmbigReader(manifest)
  const res = await runHotfix(
    { manifest, envFlag: 'production', runId: 'RUN-C5-SAFE-1', reportDir: REPORT_DIR, reader, dryRun: true },
    { loadEnv: () => envOk() },
  )
  check('(iv) 비모호 교재: ack 없이도 status = ready-to-apply', res.status === 'ready-to-apply', res.status)
  check('(iv) 비모호 교재: apply_eligibility = READY', res.report.apply_eligibility === 'READY', res.report.apply_eligibility)
}

// (v) 교재 목록 조회 실패 → blocked-ambiguous-textbook-unavailable(fail-closed)
{
  const manifest = buildAmbigManifest()
  const baseReader = makeReader(manifest)
  const reader = {
    ...baseReader,
    async selectAllRows(table) {
      if (table === 'textbooks') throw new Error('READ_ERROR textbooks selectAll (fixture)')
      return baseReader.selectAllRows(table)
    },
  }
  const calls = []
  const executor = { async run(sql) { calls.push(sql); return { ok: true } } }
  const res = await runHotfix(
    { manifest, envFlag: 'production', runId: 'RUN-C5-UNAVAIL-1', reportDir: REPORT_DIR, reader, executor, dryRun: false },
    { loadEnv: () => envOk() },
  )
  check('(v) 교재 조회 실패: status = blocked-ambiguous-textbook-unavailable', res.status === 'blocked-ambiguous-textbook-unavailable', res.status)
  check('(v) 교재 조회 실패: apply_eligibility = BLOCKED_AMBIGUOUS_TEXTBOOK', res.report.apply_eligibility === 'BLOCKED_AMBIGUOUS_TEXTBOOK', res.report.apply_eligibility)
  check('(v) 교재 조회 실패: executor 호출 0', calls.length === 0)
}

console.log('\n=== [C5] validateManifest — 교재 name 기반 매칭/조건 필드 거부(lint, BLOCKED_MANIFEST 로 고정) ===')
{
  const withNameWhere = buildAmbigManifest()
  withNameWhere.changes[0].where = { name: '중1 천재 이상기' }
  const res1 = validateManifest(withNameWhere)
  check('change 에 where:{name:...} 가 있으면 거부(알 수 없는 키)', !res1.valid, JSON.stringify(res1.errors))

  const withTextbookName = buildAmbigManifest()
  withTextbookName.changes[0].textbook_name = '중1 천재 이상기'
  const res2 = validateManifest(withTextbookName)
  check('change 에 textbook_name 같은 임의 문자열 키가 있으면 거부', !res2.valid, JSON.stringify(res2.errors))

  // ALLOWLIST 자체가 이미 id 기반임을 고정(회귀 방지) — set/expect_before
  // 는 컬럼 값만 받고, 교재/행을 이름 문자열로 지정할 스키마 자리가
  // 애초에 없다(테이블/컬럼 화이트리스트 + UUID id 검증만 존재).
  check('ALLOWLIST 는 컬럼명만 등록(교재를 name 으로 지정하는 스키마가 없음)',
    !ALLOWLIST.student_class_assignments.includes('name') && !ALLOWLIST.students.includes('name'))

  const badAckNoId = buildAmbigManifest({ textbook_identity: { name: 'V2 중2 천재 이상기', publisher_name: '천재교육' } })
  const res3 = validateManifest(badAckNoId)
  check('textbook_identity 에 id 가 없으면 거부(name 만으로는 ack 무효)', !res3.valid, JSON.stringify(res3.errors))

  const badAckBadId = buildAmbigManifest({ textbook_identity: { id: 'not-a-uuid', name: 'V2 중2 천재 이상기' } })
  const res4 = validateManifest(badAckBadId)
  check('textbook_identity.id 가 UUID 아니면 거부', !res4.valid, JSON.stringify(res4.errors))

  const okAck = buildAmbigManifest({ textbook_identity: { id: AMBIG_TB2, name: 'V2 중2 천재 이상기', publisher_name: '천재교육' } })
  const res5 = validateManifest(okAck)
  check('올바른 형식의 textbook_identity 는 통과', res5.valid, JSON.stringify(res5.errors))
}

console.log(`\n=== summary ===\nPASS ${pass} / FAIL ${fail}`)
if (fail > 0) {
  console.log('FAIL')
  process.exit(1)
} else {
  console.log('PASS')
  process.exit(0)
}
