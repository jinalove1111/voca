// Production Safety Harness — 핫픽스 실행기 (2026-09-03, Phase 1-B)
//
// node scripts/prodHotfix.mjs <manifest.json> [--dry-run] [--report-dir <dir>]
//   [--executor management-api] [--fixture-reader <file>]
//
// ★ 이번 단계 프로덕션 WRITE 절대 금지 경로 설계 ★
//   · Management API 실호출은 이 저장소에 없다(토큰도 없음, SUPABASE_ACCESS_TOKEN
//     은 .env/.env.local 어디에도 없다).
//   · 라이브 접근은 supabase-js anon key 로 읽기(select/maybeSingle, count head)
//     만 한다 — 이 파일 안에 UPDATE/INSERT/DELETE 문자열을 담은 실제 실행
//     경로는 executor.run() 뿐이고, 그 executor 는 대화형 승인
//     (`APPLY <runId>` 정확히 입력, TTY 필수) 을 통과해야만 만들어진다.
//   · --dry-run 이거나 CI 환경이거나 SUPABASE_ACCESS_TOKEN 이 없으면
//     승인 단계 이전에 항상 STOP(exit 0) 한다.
//
// 흐름(고정 순서, 어느 단계든 실패 = FAIL-CLOSED STOP):
//   0 run-id 생성 → 1 manifest 로드/검증 → 2 환경(project_ref) 게이트 →
//   3 정적 안전 스캔 → 4 프리플라이트(읽기) → 5 baseline 저장 →
//   6 계획 출력 + apply/rollback SQL 파일 저장 →
//   7 dry-run/CI/토큰없음 → STOP(ready-to-apply) →
//   8 대화형 승인 게이트 → 9 apply → 10 postflight →
//   11 npm run health:students → 12 실패 시 자동 롤백 → 13 보고서
//
// 로직은 CLI 진입점과 분리된 runHotfix(options, deps) 로 있다 — deps 주입으로
// scripts/testProdHotfix.mjs 가 네트워크 0으로 전체 분기를 검증한다.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  validateManifest,
  buildPreflightPlan,
  buildPostflightPlan,
  buildApplySql,
  buildRollbackSql,
  staticSafetyScan,
} from './lib/hotfixManifest.mjs'
import { createDryRunExecutor, createManagementApiExecutor } from './lib/sqlExecutor.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STUDENTS_SNAPSHOT_COLS = ['id', 'class_id', 'unit_name', 'current_unit_id']
const SCA_SNAPSHOT_COLS = ['id', 'student_id', 'textbook_id', 'current_unit_id', 'is_primary']

// ── 순수 유틸 ──────────────────────────────────────────────────────────
function makeRunId(now = new Date()) {
  const ts = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) // YYYYMMDDHHmmss
  const rand = crypto.randomBytes(3).toString('hex')
  return `${ts}-${rand}`
}

function refFromUrl(url) {
  try { return new URL(url).hostname.split('.')[0] || null } catch { return null }
}
function hostFromUrl(url) {
  try { return new URL(url).hostname } catch { return null }
}

function tail(text, n = 20) {
  return String(text || '').trim().split('\n').slice(-n).join('\n')
}

function sortRows(rows) {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function sha256Json(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

function diffUnexpectedRows(table, before, after, expectedIds) {
  const beforeMap = new Map(before.map((r) => [r.id, r]))
  const afterMap = new Map(after.map((r) => [r.id, r]))
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()])
  const diffs = []
  for (const id of allIds) {
    const b = beforeMap.get(id) ?? null
    const a = afterMap.get(id) ?? null
    if (JSON.stringify(b) !== JSON.stringify(a) && !expectedIds.has(id)) {
      diffs.push({ table, id, before: b, after: a, reason: 'unexpected-row-change' })
    }
  }
  return diffs
}

// ── 자격증명 로드(.env + .env.local, 값은 어디에도 로깅하지 않는다) ──────
function loadEnvDefault() {
  const merged = {}
  for (const file of ['.env', '.env.local']) {
    const p = path.join(ROOT, file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=][^=]*)=(.*)$/)
      if (m) {
        const key = m[1].trim()
        if (merged[key] === undefined) merged[key] = m[2].trim()
      }
    }
  }
  return {
    url: process.env.VITE_SUPABASE_URL || merged.VITE_SUPABASE_URL || '',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || merged.VITE_SUPABASE_ANON_KEY || '',
    accessToken: process.env.SUPABASE_ACCESS_TOKEN || merged.SUPABASE_ACCESS_TOKEN || '',
    ci: !!(process.env.CI || process.env.GITHUB_ACTIONS),
  }
}

// ── 리더(읽기 전용) ────────────────────────────────────────────────────
function createLiveReader(url, anonKey) {
  const supabase = createClient(url, anonKey)
  return {
    kind: 'live',
    async getRow(table, id, columns) {
      const { data, error } = await supabase.from(table).select(columns.join(',')).eq('id', id).maybeSingle()
      if (error) throw new Error(`READ_ERROR ${table}:${id} ${error.message}`)
      return data
    },
    async countWordsForUnit(unitId) {
      const { count, error } = await supabase.from('words').select('id', { count: 'exact', head: true }).eq('unit_id', unitId)
      if (error) throw new Error(`READ_ERROR words count unit=${unitId} ${error.message}`)
      return count ?? 0
    },
    async headCountFiltered(table, filters) {
      let q = supabase.from(table).select('id', { count: 'exact', head: true })
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
      const { count, error } = await q
      if (error) throw new Error(`READ_ERROR ${table} count ${error.message}`)
      return count ?? 0
    },
    async selectAllRows(table, columns) {
      const PAGE = 1000
      const out = []
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase.from(table).select(columns.join(',')).order('id', { ascending: true }).range(offset, offset + PAGE - 1)
        if (error) throw new Error(`READ_ERROR ${table} selectAll ${error.message}`)
        out.push(...(data || []))
        if (!data || data.length < PAGE) break
      }
      return out
    },
  }
}

function createFixtureReader(fixtureObj) {
  return {
    kind: 'fixture',
    async getRow(table, id) { return fixtureObj[`${table}:${id}`] ?? null },
    async countWordsForUnit(unitId) { return fixtureObj[`words_count:${unitId}`] ?? 0 },
    async headCountFiltered(table, filters) {
      const key = `count:${table}:${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(',')}`
      return fixtureObj[key] ?? 0
    },
    async selectAllRows(table) { return fixtureObj[`rows:${table}`] ?? [] },
  }
}

async function safeRun(executor, sql) {
  try {
    const res = await executor.run(sql)
    if (res && res.ok === false) return { ok: false, error: res.error || 'executor 실패(사유 미상)' }
    return { ok: true, rows: res?.rows }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

async function readPlanMismatches(reader, plan) {
  const mismatches = []
  for (const item of plan) {
    const row = await reader.getRow(item.table, item.id, Object.keys(item.expect))
    if (!row) { mismatches.push({ table: item.table, id: item.id, reason: 'row-not-found' }); continue }
    for (const [col, val] of Object.entries(item.expect)) {
      if (row[col] !== val) mismatches.push({ table: item.table, id: item.id, column: col, expected: val, actual: row[col] })
    }
    if (item.minWords != null) {
      const wc = await reader.countWordsForUnit(item.id)
      if (wc < item.minWords) mismatches.push({ table: item.table, id: item.id, column: 'words_count', expected: `>=${item.minWords}`, actual: wc })
    }
  }
  return mismatches
}

const defaultDeps = {
  fs,
  loadEnv: loadEnvDefault,
  createLiveReader,
  createFixtureReader,
  createExecutor: ({ kind, projectRef, accessToken }) => {
    if (kind === 'management-api') return createManagementApiExecutor({ projectRef, accessToken })
    return createDryRunExecutor()
  },
  isTTY: () => !!process.stdin.isTTY,
  approve: async (runId) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    try {
      return await rl.question(`승인하려면 정확히 입력하세요: APPLY ${runId}\n> `)
    } finally {
      rl.close()
    }
  },
  runHealthCheck: () => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const res = spawnSync(npmCmd, ['run', 'health:students'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
    return { ok: res.status === 0, output: `${res.stdout || ''}${res.stderr || ''}` }
  },
  now: () => new Date(),
}

function writeReportFile(D, reportDir, runId, report) {
  D.fs.mkdirSync(reportDir, { recursive: true })
  const p = path.join(reportDir, `${runId}.hotfix.json`)
  D.fs.writeFileSync(p, JSON.stringify(report, null, 2), 'utf8')
  return p
}

/**
 * 핵심 로직. CLI 진입점과 분리되어 deps 주입으로 전체 흐름을 network 0
 * 으로 검증할 수 있다(scripts/testProdHotfix.mjs).
 * @param {object} options
 * @param {object} [deps]
 * @returns {Promise<{status:string, exitCode:number, report:object}>}
 */
export async function runHotfix(options, deps = {}) {
  const D = { ...defaultDeps, ...deps }
  const startedAt = D.now().toISOString()
  const runId = options.runId || makeRunId(D.now())
  const reportDir = options.reportDir || path.join(ROOT, 'scripts', '.tmp', 'prod-reports')

  const report = {
    runId,
    startedAt,
    manifestId: null,
    projectRef: null,
    projectRefHost: null,
    status: 'unknown',
  }

  function finish(status, exitCode, extra = {}) {
    report.status = status
    report.finishedAt = D.now().toISOString()
    Object.assign(report, extra)
    const reportPath = writeReportFile(D, reportDir, runId, report)
    report.reportPath = reportPath
    console.log(`\nSTATUS: ${status}`)
    console.log(`DB WRITE: ${extra.dbWriteCount ?? report.dbWriteCount ?? 0}`)
    return { status, exitCode, report }
  }

  // 1) manifest 로드·검증
  let manifest = options.manifest
  if (!manifest) {
    if (!options.manifestPath) return finish('invalid-manifest', 1, { errors: ['manifestPath 또는 manifest 옵션 필요'] })
    try {
      manifest = JSON.parse(D.fs.readFileSync(options.manifestPath, 'utf8'))
    } catch (err) {
      console.error(`FAIL — manifest 파일 로드 실패: ${err.message}`)
      return finish('invalid-manifest', 1, { errors: [`manifest 파일 로드 실패: ${err.message}`] })
    }
  }
  report.manifestId = manifest?.id ?? null
  report.projectRef = manifest?.project_ref ?? null

  const validation = validateManifest(manifest)
  if (!validation.valid) {
    console.error('FAIL — manifest 검증 실패:')
    for (const e of validation.errors) console.error(`  - ${e}`)
    return finish('invalid-manifest', 1, { errors: validation.errors })
  }

  // 2) 환경(project_ref) 게이트
  const env = D.loadEnv()
  report.projectRefHost = env.url ? hostFromUrl(env.url) : null
  const envRef = env.url ? refFromUrl(env.url) : null
  if (!envRef || envRef !== manifest.project_ref) {
    console.error(`FAIL — 환경 project_ref 불일치: 로컬 .env=${envRef || '(없음)'} vs manifest=${manifest.project_ref}`)
    return finish('env-mismatch', 2)
  }
  const ciForced = !!env.ci
  if (ciForced) console.log('CI 환경 감지(process.env.CI 또는 GITHUB_ACTIONS) — write path 영구 비활성(dry-run 강제)')

  // 3) 정적 안전 스캔 (apply/rollback SQL 은 이 시점에 이미 순수 함수로 생성 가능)
  const applySql = buildApplySql(manifest, runId)
  const rollbackSql = buildRollbackSql(manifest, runId)
  const violations = [...staticSafetyScan(applySql), ...staticSafetyScan(rollbackSql)]
  if (violations.length) {
    console.error('FAIL — 정적 안전 스캔 위반(파괴적 키워드 감지):')
    for (const v of violations) console.error(`  line ${v.line}: ${v.text} (${v.match})`)
    return finish('unsafe-sql', 1, { violations })
  }
  console.log('정적 안전 스캔 PASS(파괴적 키워드 0건) — apply/rollback SQL 생성 완료')

  // 4) 프리플라이트(읽기 전용)
  let reader
  if (options.reader) {
    reader = options.reader
  } else if (options.fixtureReaderPath) {
    const fixtureObj = JSON.parse(D.fs.readFileSync(options.fixtureReaderPath, 'utf8'))
    reader = D.createFixtureReader(fixtureObj)
  } else {
    reader = D.createLiveReader(env.url, env.anonKey)
  }

  const preflightPlan = buildPreflightPlan(manifest)
  const preflightMismatches = await readPlanMismatches(reader, preflightPlan)
  if (preflightMismatches.length) {
    console.error('FAIL-CLOSED — 프리플라이트 불일치(현재 DB 상태가 manifest 의 expect_before/expect 와 다름):')
    for (const m of preflightMismatches) {
      console.error(`  ${m.table}:${m.id} ${m.column ?? ''} 기대=${JSON.stringify(m.expected ?? m.reason)} 실제=${JSON.stringify(m.actual ?? '')}`)
    }
    return finish('preflight-mismatch', 1, { mismatches: preflightMismatches })
  }
  console.log('프리플라이트 PASS — 현재 상태가 manifest 의 expect_before/expect 와 일치')

  // 5) baseline 저장(학습기록 카운트 + 무관 행 스냅샷 해시)
  const baselineCounts = {}
  for (const sid of manifest.affected_students || []) {
    baselineCounts[sid] = {}
    for (const table of manifest.learning_baseline_tables || []) {
      baselineCounts[sid][table] = await reader.headCountFiltered(table, { student_id: sid })
    }
  }
  const studentsRowsBefore = sortRows(await reader.selectAllRows('students', STUDENTS_SNAPSHOT_COLS))
  const scaRowsBefore = sortRows(await reader.selectAllRows('student_class_assignments', SCA_SNAPSHOT_COLS))
  report.baseline = {
    counts: baselineCounts,
    snapshot: {
      students: { hash: sha256Json(studentsRowsBefore), rowCount: studentsRowsBefore.length },
      student_class_assignments: { hash: sha256Json(scaRowsBefore), rowCount: scaRowsBefore.length },
    },
  }
  console.log(`baseline 저장 완료 — students ${studentsRowsBefore.length}행 / SCA ${scaRowsBefore.length}행 스냅샷 해시 기록`)

  // 6) 계획 출력 + SQL 파일 저장
  console.log('\n=== 변경 계획 ===')
  for (const c of manifest.changes) {
    console.log(`  ${c.table}:${c.id}`)
    for (const [col, val] of Object.entries(c.set)) {
      console.log(`    ${col}: ${JSON.stringify(c.expect_before[col])} -> ${JSON.stringify(val)}`)
    }
  }
  console.log(`  예상 UPDATE 행 수: ${manifest.changes.length}`)
  if (manifest.must_not_change?.length) {
    console.log('  must_not_change(불변 확인 대상):')
    for (const m of manifest.must_not_change) console.log(`    ${m.table}:${m.id}`)
  }

  D.fs.mkdirSync(reportDir, { recursive: true })
  const applySqlPath = path.join(reportDir, `${runId}.apply.sql`)
  const rollbackSqlPath = path.join(reportDir, `${runId}.rollback.sql`)
  D.fs.writeFileSync(applySqlPath, applySql, 'utf8')
  D.fs.writeFileSync(rollbackSqlPath, rollbackSql, 'utf8')
  report.applySqlPath = applySqlPath
  report.rollbackSqlPath = rollbackSqlPath
  console.log(`\napply SQL 저장: ${applySqlPath}`)
  console.log(`rollback SQL 저장: ${rollbackSqlPath}`)
  console.log('\nREADY TO APPLY')

  // 7) dry-run / CI / 토큰 없음 → STOP
  const noToken = !env.accessToken
  if (options.dryRun || ciForced || noToken) {
    const reasons = []
    if (options.dryRun) reasons.push('--dry-run')
    if (ciForced) reasons.push('CI 환경')
    if (noToken) reasons.push('SUPABASE_ACCESS_TOKEN 미설정')
    console.log(`\nSTOP(정상) — write path 비활성: ${reasons.join(', ')}`)
    return finish('ready-to-apply', 0, { stopReasons: reasons, dbWriteCount: 0 })
  }

  // 8) 대화형 승인 게이트
  if (!D.isTTY()) {
    console.log('\nSTOP — 비대화형(TTY 아님) 환경에서는 승인을 받을 수 없습니다. --dry-run 으로 계획만 확인하세요.')
    return finish('not-interactive', 1, { dbWriteCount: 0 })
  }
  const answer = await D.approve(runId)
  if (String(answer ?? '').trim() !== `APPLY ${runId}`) {
    console.log('\nSTOP — 승인 문구가 정확히 일치하지 않습니다. 적용하지 않습니다.')
    return finish('not-approved', 1, { dbWriteCount: 0 })
  }

  // 9) apply
  const executor = options.executor || D.createExecutor({
    kind: options.executorKind || 'management-api',
    projectRef: manifest.project_ref,
    accessToken: env.accessToken,
  })
  let dbWriteCount = 0
  const applyResult = await safeRun(executor, applySql)
  if (!applyResult.ok) {
    console.error(`\nFAIL — apply 실패(트랜잭션이라 미반영): ${applyResult.error}`)
    return finish('apply-failed', 1, { applyError: applyResult.error, dbWriteCount: 0 })
  }
  dbWriteCount += manifest.changes.length
  console.log('\napply 성공 — postflight 검증 진행')

  // 10) postflight
  const postflightPlan = buildPostflightPlan(manifest)
  const postMismatches = await readPlanMismatches(reader, postflightPlan)

  for (const sid of manifest.affected_students || []) {
    for (const table of manifest.learning_baseline_tables || []) {
      const now2 = await reader.headCountFiltered(table, { student_id: sid })
      if (now2 !== baselineCounts[sid][table]) {
        postMismatches.push({ table, studentId: sid, reason: 'learning-baseline-changed', before: baselineCounts[sid][table], after: now2 })
      }
    }
  }

  const studentsRowsAfter = sortRows(await reader.selectAllRows('students', STUDENTS_SNAPSHOT_COLS))
  const scaRowsAfter = sortRows(await reader.selectAllRows('student_class_assignments', SCA_SNAPSHOT_COLS))
  const expectedStudentIds = new Set(manifest.changes.filter((c) => c.table === 'students').map((c) => c.id))
  const expectedScaIds = new Set(manifest.changes.filter((c) => c.table === 'student_class_assignments').map((c) => c.id))
  postMismatches.push(...diffUnexpectedRows('students', studentsRowsBefore, studentsRowsAfter, expectedStudentIds))
  postMismatches.push(...diffUnexpectedRows('student_class_assignments', scaRowsBefore, scaRowsAfter, expectedScaIds))

  let healthResult = { ok: true, output: '' }
  if (!postMismatches.length) {
    healthResult = D.runHealthCheck()
  }

  if (postMismatches.length || !healthResult.ok) {
    console.error('\nFAIL — postflight/health 검증 실패, 자동 롤백 진행')
    for (const m of postMismatches) console.error(`  ${JSON.stringify(m)}`)
    if (!healthResult.ok) console.error(`  health:students 실패:\n${tail(healthResult.output)}`)

    const rollbackResult = await safeRun(executor, rollbackSql)
    if (!rollbackResult.ok) {
      console.error(`\nFAIL — 롤백도 실패: ${rollbackResult.error} — 수동 조치 필요. apply/rollback SQL 파일을 운영자에게 전달하세요.`)
      return finish('rollback-failed', 1, {
        postMismatches,
        healthOutputTail: tail(healthResult.output || ''),
        rollbackError: rollbackResult.error,
        dbWriteCount,
      })
    }
    dbWriteCount += manifest.changes.length

    // 롤백 후 재확인(원래 expect_before 상태로 돌아왔는지)
    const rollbackVerifyMismatches = await readPlanMismatches(reader, preflightPlan.filter((i) => i.minWords == null))
    if (rollbackVerifyMismatches.length) {
      console.error('\n경고 — 롤백 실행은 성공했지만 재확인에서 불일치 발견, 수동 확인 필요')
    }
    return finish('rolled-back', 1, {
      postMismatches,
      healthOutputTail: tail(healthResult.output || ''),
      rollbackVerifyMismatches,
      dbWriteCount,
    })
  }

  console.log('\npostflight PASS, health:students PASS')
  return finish('applied', 0, { dbWriteCount })
}

// ── CLI 진입점 ─────────────────────────────────────────────────────────
function parseArgv(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--report-dir') args.reportDir = argv[++i]
    else if (a === '--executor') args.executorKind = argv[++i]
    else if (a === '--fixture-reader') args.fixtureReaderPath = argv[++i]
    else args._.push(a)
  }
  return args
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const parsed = parseArgv(process.argv.slice(2))
  const manifestArg = parsed._[0]
  if (!manifestArg) {
    console.error('사용법: node scripts/prodHotfix.mjs <manifest.json> [--dry-run] [--report-dir <dir>] [--executor management-api] [--fixture-reader <file>]')
    process.exitCode = 1
  } else {
    const result = await runHotfix({
      manifestPath: path.resolve(manifestArg),
      dryRun: !!parsed.dryRun,
      reportDir: parsed.reportDir ? path.resolve(parsed.reportDir) : undefined,
      executorKind: parsed.executorKind,
      fixtureReaderPath: parsed.fixtureReaderPath ? path.resolve(parsed.fixtureReaderPath) : undefined,
    })
    process.exitCode = result.exitCode
  }
}
