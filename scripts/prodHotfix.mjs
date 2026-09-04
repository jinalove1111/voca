// Production Safety Harness — 핫픽스 실행기 (2026-09-03, Phase 1-B / Phase 2·7 강화)
//
// node scripts/prodHotfix.mjs <manifest.json> --env production|staging
//   [--dry-run] [--report-dir <dir>] [--executor management-api]
//   [--fixture-reader <file>] [--expect-manifest-sha <hex>]
//   [--rollback-of <report.json>] [--json]
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
//   · --env production|staging 플래그가 없으면(오타 포함) 그 무엇보다
//     먼저 STOP(env-flag-required) — CI 에서는 --env 값과 무관하게 write
//     path 가 비활성 상태를 유지한다.
//
// 흐름(고정 순서, 어느 단계든 실패 = FAIL-CLOSED STOP):
//   0 run-id 생성 → 1 manifest 로드/검증(+ sha256 기록/--expect-manifest-sha
//     대조) → 1.5 --env 플래그 게이트 → 2 환경(project_ref) 게이트 →
//   3 정적 안전 스캔 → (rollback-of 모드면 원본 보고서 대조) →
//   4 프리플라이트(읽기, 모드에 따라 before/after 값 확인 전환) →
//   5 baseline 저장 → 6 계획 출력 + apply/rollback SQL 파일 저장(+ rollback
//     메타데이터 기록) → 7 dry-run/CI/토큰없음 → STOP(ready-to-apply) →
//   8 대화형 승인 게이트(정확히 `APPLY <runId>`) → 8.5 apply 직전 manifest
//     파일 재해시 대조(변조 감지) → 9 apply(forward SQL) → 10 postflight →
//   11 npm run health:students → 12 실패 시 자동 롤백(backward SQL) → 13 보고서
//
// mode: 'apply'(기본) 또는 'rollback-of'(--rollback-of 지정 시) — forward/
// backward SQL 과 preflight/postflight 확인 방향이 서로 뒤바뀔 뿐, 게이트
// 순서·승인 절차는 완전히 동일한 코드 경로를 공유한다(요구사항: "실제
// 실행은 동일 승인 게이트").
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
  redactSecrets,
  describeChange,
  computeInvariantsDeltaPreview,
} from './lib/hotfixManifest.mjs'
import { createDryRunExecutor, createManagementApiExecutor } from './lib/sqlExecutor.mjs'

const ENV_FLAG_VALUES = ['production', 'staging']

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
// 테이블 부재(마이그레이션 미실행) 에러 판별 — PostgREST 는 relation 자체가
// 없으면 42P01(undefined_table), 스키마 캐시에 없으면(REST 시작 후 생성된
// 테이블 등) PGRST205 를 code 로 돌려준다. 이 경우는 "잃을 데이터가 아예
// 없다"는 뜻이라 fail-open(count 0)으로 처리한다 — 그 외 에러(컬럼 없음
// 42703 등)는 fail-closed 로 그대로 던져 baseline 단계를 STOP 시킨다.
function isTableMissingError(error) {
  const code = error?.code || ''
  return code === '42P01' || code === 'PGRST205'
}

/**
 * 이미 만들어진 supabase-js 클라이언트를 감싸는 리더. createLiveReader()가
 * 실제 사용하는 경로이자, 네트워크 0으로 headCountFiltered 의 select 컬럼/
 * 에러 분기 로직만 검증하고 싶을 때(scripts/testProdHotfix.mjs) 가짜
 * 클라이언트를 주입할 수 있도록 분리해 export 한다.
 * @param {*} supabase supabase-js 클라이언트(또는 같은 표면을 흉내낸 가짜 객체)
 */
export function createLiveReaderFromClient(supabase) {
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
    // filters 의 첫 컬럼으로 select 한다(예: {student_id: sid} -> select=student_id).
    // 예전엔 'id' 를 하드코딩했는데, 학습기록 baseline 6개 테이블(word_status/
    // student_progress/student_daily_progress/spelling_review_queue/xp_ledger/
    // entrance_test_results) 중 student_progress 는 PK 가 student_id 라 id
    // 컬럼이 없어 PostgREST 400(42703 undefined_column) → 미처리 예외로
    // baseline 단계 전체가 크래시했다(2026-09-03 실측). scripts/lib/
    // prodDataLoader.mjs 의 loadLearningBaseline() 이 select=student_id 로
    // 동일 6개 테이블을 세는 방식과 통일한다.
    async headCountFiltered(table, filters) {
      const selectCol = Object.keys(filters)[0] || 'id'
      let q = supabase.from(table).select(selectCol, { count: 'exact', head: true })
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
      const { count, error } = await q
      if (error) {
        if (isTableMissingError(error)) return { count: 0, tableMissing: true }
        throw new Error(`READ_ERROR ${table} count ${error.message}`)
      }
      return { count: count ?? 0, tableMissing: false }
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

function createLiveReader(url, anonKey) {
  return createLiveReaderFromClient(createClient(url, anonKey))
}

function createFixtureReader(fixtureObj) {
  return {
    kind: 'fixture',
    async getRow(table, id) { return fixtureObj[`${table}:${id}`] ?? null },
    async countWordsForUnit(unitId) { return fixtureObj[`words_count:${unitId}`] ?? 0 },
    async headCountFiltered(table, filters) {
      const key = `count:${table}:${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(',')}`
      if (fixtureObj[`missing:${table}`]) return { count: 0, tableMissing: true }
      return { count: fixtureObj[key] ?? 0, tableMissing: false }
    },
    async selectAllRows(table) { return fixtureObj[`rows:${table}`] ?? [] },
  }
}

// B5(2026-09-04) — invariants delta 미리보기용 스냅샷을 이미 존재하는
// `reader`(live/fixture/test 어디든 공통) 의 selectAllRows() 만으로 만든다.
// scripts/lib/prodDataLoader.mjs의 loadProductionSnapshot() 처럼 새 HTTP
// 로더를 또 만들지 않고, prodHotfix 가 이미 갖고 있는 reader 추상화를 그대로
// 재사용한다(라이브 CLI 경로는 아래 isMain 에서 buildInvariantSnapshotFromReader
// 를 실제 loadInvariantSnapshot 로 주입, 테스트는 자기 reader/픽스처로 검증).
// class_textbooks 는 PK 가 복합키라 id 컬럼이 없어 이 reader.selectAllRows
// (정렬 기준 id 고정)로 가져올 수 없다 — TEXTBOOK_UNREACHABLE/
// STUDENT_TEXTBOOK_SELECTOR_EMPTY 두 invariant 는 이 delta 미리보기에서
// 항상 연결 0건으로 평가된다(알려진 갭, 나머지 invariant 는 정상 커버 —
// 이 두 코드 전용 새 HTTP 로더를 추가하는 대신 감수한 트레이드오프).
async function buildInvariantSnapshotFromReader(reader) {
  const [students, classes, textbooks, units, words, assignments] = await Promise.all([
    reader.selectAllRows('students', ['id', 'name', 'class_id', 'current_unit_id', 'unit_name']),
    reader.selectAllRows('classes', ['id', 'name', 'spelling_direction', 'class_type']),
    reader.selectAllRows('textbooks', ['id', 'name', 'owner_class_id']),
    reader.selectAllRows('units', ['id', 'name', 'textbook_id', 'class_id']),
    reader.selectAllRows('words', ['id', 'unit_id', 'word', 'meaning']),
    reader.selectAllRows('student_class_assignments', ['id', 'student_id', 'class_id', 'textbook_id', 'is_primary', 'current_unit_id', 'created_at']),
  ])
  return { students, classes, textbooks, units, words, assignments, classTextbooks: [] }
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
    // B4(2026-09-04) — SCA insert/delete 전용 계획 항목. 'no-duplicate' 는
    // insert 전 "같은 student_id+textbook_id 행이 이미 없어야 함" 선조건,
    // 'not-exists' 는 delete 후 "그 id 행이 더는 없어야 함" 확인이다. 둘 다
    // item.expect 가 없다(비교할 컬럼 값이 아니라 존재 여부 자체가 판정
    // 대상) — 기존 expect 기반 분기와는 별도로 처리한다.
    if (item.kind === 'no-duplicate') {
      const r = await reader.headCountFiltered(item.table, item.filters)
      if (r.count > 0) mismatches.push({ table: item.table, id: item.id, reason: 'duplicate-row-exists', filters: item.filters, count: r.count })
      continue
    }
    if (item.kind === 'not-exists') {
      const row = await reader.getRow(item.table, item.id, ['id'])
      if (row) mismatches.push({ table: item.table, id: item.id, reason: 'row-still-exists' })
      continue
    }
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

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text ?? '')).digest('hex')
}

function writeReportFile(D, reportDir, runId, report, secretEnv) {
  D.fs.mkdirSync(reportDir, { recursive: true })
  const p = path.join(reportDir, `${runId}.hotfix.json`)
  const raw = JSON.stringify(report, null, 2)
  const redacted = redactSecrets(redactSecrets(raw, secretEnv || {}), process.env)
  D.fs.writeFileSync(p, redacted, 'utf8')
  return p
}

/**
 * 핵심 로직. CLI 진입점과 분리되어 deps 주입으로 전체 흐름을 network 0
 * 으로 검증할 수 있다(scripts/testProdHotfix.mjs).
 * mode 는 options.rollbackOfReportPath 유무로 결정된다('apply' 기본,
 * 'rollback-of' — 이전 hotfix 를 되돌리는 모드). 두 모드는 forward/backward
 * SQL 과 프리/포스트플라이트 확인 방향만 바뀔 뿐, 게이트·승인 절차는
 * 완전히 같은 코드 경로를 공유한다.
 * @param {object} options
 * @param {object} [deps]
 * @returns {Promise<{status:string, exitCode:number, report:object}>}
 */
export async function runHotfix(options, deps = {}) {
  const D = { ...defaultDeps, ...deps }
  const startedAt = D.now().toISOString()
  const runId = options.runId || makeRunId(D.now())
  const reportDir = options.reportDir || path.join(ROOT, 'scripts', '.tmp', 'prod-reports')

  // 비밀값 마스킹 대상 env — D.loadEnv() 로드 전엔 빈 객체(2단계에서 채움).
  // process.env 는 매 호출마다 항상 함께 스캔한다(운영 환경 실제 방어선).
  let secretEnv = {}
  function log(...args) {
    const text = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')
    console.log(redactSecrets(redactSecrets(text, secretEnv), process.env))
  }
  function logErr(...args) {
    const text = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')
    console.error(redactSecrets(redactSecrets(text, secretEnv), process.env))
  }

  const report = {
    runId,
    startedAt,
    manifestId: null,
    projectRef: null,
    projectRefHost: null,
    mode: 'apply',
    status: 'unknown',
  }

  function finish(status, exitCode, extra = {}) {
    report.status = status
    report.finishedAt = D.now().toISOString()
    Object.assign(report, extra)
    const reportPath = writeReportFile(D, reportDir, runId, report, secretEnv)
    report.reportPath = reportPath
    log(`\nSTATUS: ${status}`)
    log(`DB WRITE: ${extra.dbWriteCount ?? report.dbWriteCount ?? 0}`)
    if (options.jsonOutput) {
      console.log(redactSecrets(redactSecrets(JSON.stringify(report), secretEnv), process.env))
    }
    return { status, exitCode, report }
  }

  // 1) manifest 로드·검증(+ sha256 기록 — 변조 감지의 기준값)
  let manifest = options.manifest
  let manifestRawText = null
  if (!manifest) {
    if (!options.manifestPath) return finish('invalid-manifest', 1, { errors: ['manifestPath 또는 manifest 옵션 필요'] })
    try {
      manifestRawText = D.fs.readFileSync(options.manifestPath, 'utf8')
      manifest = JSON.parse(manifestRawText)
    } catch (err) {
      logErr(`FAIL — manifest 파일 로드 실패: ${err.message}`)
      return finish('invalid-manifest', 1, { errors: [`manifest 파일 로드 실패: ${err.message}`] })
    }
  } else {
    manifestRawText = JSON.stringify(manifest)
  }
  const manifestSha256 = sha256Text(manifestRawText)
  report.manifestSha256 = manifestSha256
  report.manifestId = manifest?.id ?? null
  report.projectRef = manifest?.project_ref ?? null

  if (options.expectManifestSha && options.expectManifestSha !== manifestSha256) {
    logErr(`FAIL — --expect-manifest-sha 불일치: 기대=${options.expectManifestSha} 실제=${manifestSha256}`)
    return finish('manifest-sha-mismatch', 1, { expectManifestSha: options.expectManifestSha })
  }

  const validation = validateManifest(manifest)
  if (!validation.valid) {
    logErr('FAIL — manifest 검증 실패:')
    for (const e of validation.errors) logErr(`  - ${e}`)
    return finish('invalid-manifest', 1, { errors: validation.errors })
  }
  report.expectedRows = manifest.changes.length

  // 1.5) --env production|staging 플래그 게이트(가장 먼저 — 프로젝트 혼동 방지)
  if (!ENV_FLAG_VALUES.includes(options.envFlag)) {
    logErr(`FAIL — --env production|staging 플래그가 필요합니다(받은 값: ${JSON.stringify(options.envFlag ?? null)})`)
    return finish('env-flag-required', 1, {})
  }

  // rollback-of 모드: 이전 실행 보고서의 manifestId/manifest sha256 을 대조해
  // "당시 적용된 것과 동일한 manifest" 로만 되돌리기를 허용한다.
  let rollbackOfSourceReport = null
  if (options.rollbackOfReportPath) {
    try {
      rollbackOfSourceReport = JSON.parse(D.fs.readFileSync(options.rollbackOfReportPath, 'utf8'))
    } catch (err) {
      logErr(`FAIL — --rollback-of 보고서 로드 실패: ${err.message}`)
      return finish('rollback-of-report-load-failed', 1, { errors: [err.message] })
    }
    if (rollbackOfSourceReport.manifestId !== manifest.id) {
      logErr(`FAIL — --rollback-of 보고서의 manifestId(${rollbackOfSourceReport.manifestId})가 현재 manifest.id(${manifest.id})와 다릅니다`)
      return finish('rollback-of-mismatch', 1, {})
    }
    if (rollbackOfSourceReport.manifestSha256 && rollbackOfSourceReport.manifestSha256 !== manifestSha256) {
      logErr('FAIL — --rollback-of 보고서의 manifest sha256 이 현재 manifest 파일과 다릅니다(당시 적용된 것과 다른 manifest)')
      return finish('rollback-of-mismatch', 1, {})
    }
  }
  const mode = rollbackOfSourceReport ? 'rollback-of' : 'apply'
  report.mode = mode
  if (rollbackOfSourceReport) report.rollbackOfSourceRunId = rollbackOfSourceReport.runId

  // 2) 환경(project_ref) 게이트
  const env = D.loadEnv()
  secretEnv = env
  report.projectRefHost = env.url ? hostFromUrl(env.url) : null
  const envRef = env.url ? refFromUrl(env.url) : null
  if (!envRef || envRef !== manifest.project_ref) {
    logErr(`FAIL — 환경 project_ref 불일치: 로컬 .env=${envRef || '(없음)'} vs manifest=${manifest.project_ref}`)
    return finish('env-mismatch', 2)
  }
  const ciForced = !!env.ci
  if (ciForced) log('CI 환경 감지(process.env.CI 또는 GITHUB_ACTIONS) — write path 영구 비활성(dry-run 강제, --env 값과 무관)')

  // 3) 정적 안전 스캔 (apply/rollback SQL 은 이 시점에 이미 순수 함수로 생성 가능)
  const applySql = buildApplySql(manifest, runId)
  const rollbackSql = buildRollbackSql(manifest, runId)
  const violations = [...staticSafetyScan(applySql), ...staticSafetyScan(rollbackSql)]
  if (violations.length) {
    logErr('FAIL — 정적 안전 스캔 위반(파괴적 키워드 감지):')
    for (const v of violations) logErr(`  line ${v.line}: ${v.text} (${v.match})`)
    return finish('unsafe-sql', 1, { violations })
  }
  log('정적 안전 스캔 PASS(파괴적 키워드 0건) — apply/rollback SQL 생성 완료')

  // mode 에 따라 forward(이번에 실행)/backward(실패 시 자동 복구) SQL 결정
  const forwardSql = mode === 'apply' ? applySql : rollbackSql
  const backwardSql = mode === 'apply' ? rollbackSql : applySql

  // 4) 프리플라이트(읽기 전용) — apply 모드는 expect_before(적용 전) 값,
  //    rollback-of 모드는 set(적용 후) 값이 현재 DB 상태와 일치하는지 확인
  let reader
  if (options.reader) {
    reader = options.reader
  } else if (options.fixtureReaderPath) {
    const fixtureObj = JSON.parse(D.fs.readFileSync(options.fixtureReaderPath, 'utf8'))
    reader = D.createFixtureReader(fixtureObj)
  } else {
    reader = D.createLiveReader(env.url, env.anonKey)
  }

  const preflightPlanFull = buildPreflightPlan(manifest)
  const postflightPlanCore = buildPostflightPlan(manifest)
  const forwardPreflightPlan = mode === 'apply' ? preflightPlanFull : postflightPlanCore
  // 롤백/rollback-of 후 "원 상태로 돌아왔는지" 재확인 시 공용으로 쓰는 계획
  // (reference_rows_must_exist 의 min_words 항목은 정적 참조 확인이라 제외)
  const revertVerifyPlan = preflightPlanFull.filter((i) => i.minWords == null)

  const preflightMismatches = await readPlanMismatches(reader, forwardPreflightPlan)
  if (preflightMismatches.length) {
    logErr('FAIL-CLOSED — 프리플라이트 불일치(현재 DB 상태가 manifest 의 기대값과 다름):')
    for (const m of preflightMismatches) {
      logErr(`  ${m.table}:${m.id} ${m.column ?? ''} 기대=${JSON.stringify(m.expected ?? m.reason)} 실제=${JSON.stringify(m.actual ?? '')}`)
    }
    return finish('preflight-mismatch', 1, { mismatches: preflightMismatches })
  }
  log('프리플라이트 PASS — 현재 상태가 manifest 의 기대값과 일치')

  // 5) baseline 저장(학습기록 카운트 + 무관 행 스냅샷 해시)
  // headCountFiltered 가 테이블 부재(42P01/PGRST205)를 만나면 {count:0,
  // tableMissing:true} 로 fail-open 반환한다(마이그레이션 미실행 테이블은
  // 잃을 데이터가 없다는 뜻) — 그 외 에러(예: 컬럼 없음)는 그대로 던져
  // 여기서 baseline-failed 로 STOP 한다(예전엔 미처리 예외로 크래시했다).
  const baselineCounts = {}
  const baselineTableMissing = []
  try {
    for (const sid of manifest.affected_students || []) {
      baselineCounts[sid] = {}
      for (const table of manifest.learning_baseline_tables || []) {
        const r = await reader.headCountFiltered(table, { student_id: sid })
        baselineCounts[sid][table] = r.count
        if (r.tableMissing) baselineTableMissing.push({ table, studentId: sid })
      }
    }
  } catch (err) {
    logErr(`FAIL — 학습기록 baseline 조회 실패: ${err.message}`)
    return finish('baseline-failed', 1, { baselineError: err.message })
  }
  if (baselineTableMissing.length) {
    const missingTables = [...new Set(baselineTableMissing.map((m) => m.table))]
    log(`baseline 안내 — 부재 테이블(count 0 처리, fail-open): ${missingTables.join(', ')}`)
  }
  const studentsRowsBefore = sortRows(await reader.selectAllRows('students', STUDENTS_SNAPSHOT_COLS))
  const scaRowsBefore = sortRows(await reader.selectAllRows('student_class_assignments', SCA_SNAPSHOT_COLS))
  report.baseline = {
    counts: baselineCounts,
    tableMissing: baselineTableMissing,
    snapshot: {
      students: { hash: sha256Json(studentsRowsBefore), rowCount: studentsRowsBefore.length },
      student_class_assignments: { hash: sha256Json(scaRowsBefore), rowCount: scaRowsBefore.length },
    },
  }
  log(`baseline 저장 완료 — students ${studentsRowsBefore.length}행(hash ${report.baseline.snapshot.students.hash.slice(0, 12)}…) / SCA ${scaRowsBefore.length}행(hash ${report.baseline.snapshot.student_class_assignments.hash.slice(0, 12)}…) 스냅샷 해시 기록`)

  // 5.5) B5(2026-09-04) — invariants delta 미리보기(승인 이전, fail-closed).
  // D.loadInvariantSnapshot 이 주입된 경우에만 계산한다(기본은 없음 — 이
  // 기존 30여개 시나리오를 포함해 이 인자를 안 넘기는 모든 호출은 동작이
  // 전혀 바뀌지 않는다). CLI 진입점(isMain)만 실제 라이브 구현을 넘긴다.
  // manifest 를 적용했다면 저장소 전체 관점의 invariant 가 새로 FAIL 로
  // 바뀌는지(예: primary SCA 를 실수로 2개로 만드는 것)를 개별 행 값이
  // 전부 맞더라도 승인 전에 미리 잡는다 — computeInvariantsDeltaPreview 는
  // 순수 변환이라 이 단계 자체는 DB 에 아무 것도 쓰지 않는다.
  if (typeof D.loadInvariantSnapshot === 'function') {
    try {
      const snapshotBefore = await D.loadInvariantSnapshot(reader)
      const invariantsDelta = computeInvariantsDeltaPreview(snapshotBefore, manifest)
      report.invariantsDelta = invariantsDelta
      if (invariantsDelta.new_fail.length > 0) {
        logErr('FAIL-CLOSED — 이 manifest 를 적용하면 새 invariant FAIL 이 발생합니다(승인 전 차단):')
        for (const f of invariantsDelta.new_fail) logErr(`  ${f.code} ${f.studentId ?? '(유닛)'} — ${f.detail}`)
        return finish('blocked-invariant', 1, { invariantsDelta })
      }
      if (invariantsDelta.new_warn.length || invariantsDelta.resolved.length) {
        log(`invariants delta 미리보기 — new_warn ${invariantsDelta.new_warn.length}건, resolved ${invariantsDelta.resolved.length}건`)
      }
    } catch (err) {
      // 이 미리보기는 이미 fail-closed 인 preflight/postflight 위에 얹은
      // 부가 안전망이다 — 조회 자체가 실패해도(네트워크 등) 핵심 흐름을
      // 막지 않고 경고만 남긴다(fail-open, 정보성 기능).
      log(`invariants delta 미리보기 조회 실패(계속 진행, fail-open): ${err.message}`)
    }
  }

  // 6) 계획 출력 + SQL 파일 저장 + rollback 메타데이터 기록
  // B4(2026-09-04) — insert/delete change 는 c.set 이 없어(fields/
  // expect_before 만 있음) 기존처럼 c.set 을 직접 순회하면 크래시한다.
  // describeChange() (hotfixManifest.mjs, 이 로직의 단일 원천)를 그대로
  // 재사용해 update/insert/delete 전부 안전하게 표시한다(재구현 금지).
  log(mode === 'apply' ? '\n=== 변경 계획(before -> after) ===' : '\n=== 되돌리기 계획(rollback-of, 현재 -> 원복) ===')
  for (const c of manifest.changes) {
    log(`  ${c.table}:${c.id}`)
    for (const line of describeChange(c, mode === 'apply' ? 'apply' : 'rollback')) log(`    ${line}`)
  }
  log(`  예상 UPDATE 행 수: ${manifest.changes.length}`)
  if (manifest.must_not_change?.length) {
    log('  must_not_change(불변 확인 대상):')
    for (const m of manifest.must_not_change) log(`    ${m.table}:${m.id}`)
  }

  D.fs.mkdirSync(reportDir, { recursive: true })
  const applySqlPath = path.join(reportDir, `${runId}.apply.sql`)
  const rollbackSqlPath = path.join(reportDir, `${runId}.rollback.sql`)
  D.fs.writeFileSync(applySqlPath, redactSecrets(redactSecrets(applySql, secretEnv), process.env), 'utf8')
  D.fs.writeFileSync(rollbackSqlPath, redactSecrets(redactSecrets(rollbackSql, secretEnv), process.env), 'utf8')
  report.applySqlPath = applySqlPath
  report.rollbackSqlPath = rollbackSqlPath
  report.rollback = {
    sql_path: rollbackSqlPath,
    guards: manifest.changes.map((c) => ({ table: c.table, id: c.id, where: c.set })),
  }
  log(`\napply SQL 저장: ${applySqlPath}`)
  log(`rollback SQL 저장: ${rollbackSqlPath}`)
  log('\nREADY TO APPLY')

  // 7) dry-run / CI / 토큰 없음 → STOP (apply·rollback-of 모드 공통)
  const noToken = !env.accessToken
  if (options.dryRun || ciForced || noToken) {
    const reasons = []
    if (options.dryRun) reasons.push('--dry-run')
    if (ciForced) reasons.push('CI 환경')
    if (noToken) reasons.push('SUPABASE_ACCESS_TOKEN 미설정')
    log(`\nSTOP(정상) — write path 비활성: ${reasons.join(', ')}`)
    return finish('ready-to-apply', 0, { stopReasons: reasons, dbWriteCount: 0 })
  }

  // 8) 대화형 승인 게이트 — 정확히 `APPLY <runId>` 만 허용, 재시도 없음
  if (!D.isTTY()) {
    log('\nSTOP — 비대화형(TTY 아님) 환경에서는 승인을 받을 수 없습니다. --dry-run 으로 계획만 확인하세요.')
    return finish('not-interactive', 1, { dbWriteCount: 0 })
  }
  const answer = await D.approve(runId)
  if (String(answer ?? '').trim() !== `APPLY ${runId}`) {
    log('\nSTOP — 승인 문구가 정확히 일치하지 않습니다. 적용하지 않습니다.')
    return finish('not-approved', 1, { dbWriteCount: 0 })
  }

  // 8.5) apply 직전 manifest 파일 재해시 — 승인 이후 파일이 바뀌었으면 중단
  if (options.manifestPath) {
    let currentRaw
    try {
      currentRaw = D.fs.readFileSync(options.manifestPath, 'utf8')
    } catch (err) {
      logErr(`FAIL — manifest 파일 재확인 실패: ${err.message}`)
      return finish('manifest-tampered', 1, { dbWriteCount: 0 })
    }
    if (sha256Text(currentRaw) !== manifestSha256) {
      logErr('FAIL — manifest 파일이 로드 이후 변경되었습니다(변조 의심). 적용을 중단합니다.')
      return finish('manifest-tampered', 1, { dbWriteCount: 0 })
    }
  }

  // 9) apply(forward SQL)
  const executor = options.executor || D.createExecutor({
    kind: options.executorKind || 'management-api',
    projectRef: manifest.project_ref,
    accessToken: env.accessToken,
  })
  let dbWriteCount = 0
  const applyResult = await safeRun(executor, forwardSql)
  if (!applyResult.ok) {
    logErr(`\nFAIL — ${mode === 'apply' ? 'apply' : 'rollback'} 실패(트랜잭션이라 미반영): ${applyResult.error}`)
    return finish('apply-failed', 1, { applyError: applyResult.error, dbWriteCount: 0 })
  }
  dbWriteCount += manifest.changes.length
  log(`\n${mode === 'apply' ? 'apply' : 'rollback'} 성공 — postflight 검증 진행`)

  // 10) postflight — apply 모드는 set(적용 후) 값, rollback-of 모드는
  //     expect_before(원복) 값이 실제로 반영됐는지 확인
  const forwardPostflightPlan = mode === 'apply' ? postflightPlanCore : revertVerifyPlan
  const postMismatches = await readPlanMismatches(reader, forwardPostflightPlan)

  for (const sid of manifest.affected_students || []) {
    for (const table of manifest.learning_baseline_tables || []) {
      try {
        const r2 = await reader.headCountFiltered(table, { student_id: sid })
        if (r2.count !== baselineCounts[sid][table]) {
          postMismatches.push({ table, studentId: sid, reason: 'learning-baseline-changed', before: baselineCounts[sid][table], after: r2.count })
        }
      } catch (err) {
        // apply 는 이미 실행됐다 — 조회 실패는 postflight 미확인으로 취급해
        // fail-closed(자동 롤백 트리거)로 처리한다(crash 대신).
        postMismatches.push({ table, studentId: sid, reason: 'learning-baseline-check-failed', error: err.message })
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
    logErr('\nFAIL — postflight/health 검증 실패, 자동 복구(backward SQL) 진행')
    for (const m of postMismatches) logErr(`  ${JSON.stringify(m)}`)
    if (!healthResult.ok) logErr(`  health:students 실패:\n${tail(healthResult.output)}`)

    const recoveryResult = await safeRun(executor, backwardSql)
    if (!recoveryResult.ok) {
      logErr(`\nFAIL — 복구도 실패: ${recoveryResult.error} — 수동 조치 필요. apply/rollback SQL 파일을 운영자에게 전달하세요.`)
      return finish('rollback-failed', 1, {
        postMismatches,
        healthOutputTail: tail(healthResult.output || ''),
        rollbackError: recoveryResult.error,
        dbWriteCount,
      })
    }
    dbWriteCount += manifest.changes.length

    // 복구 후 재확인(직전 프리플라이트에서 확인했던 상태로 돌아왔는지)
    const recoveryVerifyPlan = mode === 'apply' ? revertVerifyPlan : postflightPlanCore
    const rollbackVerifyMismatches = await readPlanMismatches(reader, recoveryVerifyPlan)
    if (rollbackVerifyMismatches.length) {
      logErr('\n경고 — 복구 실행은 성공했지만 재확인에서 불일치 발견, 수동 확인 필요')
    }
    return finish('rolled-back', 1, {
      postMismatches,
      healthOutputTail: tail(healthResult.output || ''),
      rollbackVerifyMismatches,
      dbWriteCount,
    })
  }

  log('\npostflight PASS, health:students PASS')
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
    else if (a === '--env') args.envFlag = argv[++i]
    else if (a === '--expect-manifest-sha') args.expectManifestSha = argv[++i]
    else if (a === '--rollback-of') args.rollbackOfReportPath = argv[++i]
    else if (a === '--json') args.jsonOutput = true
    else args._.push(a)
  }
  return args
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const parsed = parseArgv(process.argv.slice(2))
  const manifestArg = parsed._[0]
  if (!manifestArg) {
    console.error('사용법: node scripts/prodHotfix.mjs <manifest.json> --env production|staging [--dry-run] [--report-dir <dir>] [--executor management-api] [--fixture-reader <file>] [--expect-manifest-sha <hex>] [--rollback-of <report.json>] [--json]')
    process.exitCode = 1
  } else {
    // B5(2026-09-04) — 실제 CLI 경로에서만 invariants delta 미리보기를
    // 켠다(D.loadInvariantSnapshot 이 함수일 때만 5.5 단계가 동작 — 테스트는
    // 이 값을 넘기지 않으므로 기존 동작이 전혀 바뀌지 않는다). 픽스처 리더
    // 여도 그대로 동작한다(buildInvariantSnapshotFromReader 는 reader 추상화
    // 하나만 쓴다 — 없는 테이블은 빈 배열로 안전하게 스킵).
    const result = await runHotfix({
      manifestPath: path.resolve(manifestArg),
      dryRun: !!parsed.dryRun,
      reportDir: parsed.reportDir ? path.resolve(parsed.reportDir) : undefined,
      executorKind: parsed.executorKind,
      fixtureReaderPath: parsed.fixtureReaderPath ? path.resolve(parsed.fixtureReaderPath) : undefined,
      envFlag: parsed.envFlag,
      expectManifestSha: parsed.expectManifestSha,
      rollbackOfReportPath: parsed.rollbackOfReportPath ? path.resolve(parsed.rollbackOfReportPath) : undefined,
      jsonOutput: !!parsed.jsonOutput,
    }, { loadInvariantSnapshot: buildInvariantSnapshotFromReader })
    process.exitCode = result.exitCode
  }
}
