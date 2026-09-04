// Production Safety Harness — prod:plan(runPlan) 회귀 테스트 (FAIL-first, 네트워크 0)
// (2026-09-04, Harness V2 Track C1)
//
// runPlan() 은 scripts/prodHotfix.mjs 에 있다(prodPlan.mjs CLI 가 그 함수를
// 그대로 호출) — 이 파일은 CLI 파싱/파일 저장이 아니라 runPlan() 자체의
// 판정 로직(apply_eligibility 매핑, risk, 영향 집계, drift)만 network 0 으로
// 검증한다. 전부 fake reader 주입 — 실제 Supabase 호출 0건.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPlan } from './prodHotfix.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT_DIR = path.join(ROOT, 'scripts', '.tmp', 'prod-plan-test')

let pass = 0
let fail = 0
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) } else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
}

function envOk(extra = {}) {
  return { url: 'https://testref123.supabase.co', anonKey: 'anon-fake', accessToken: '', ci: false, ...extra }
}

function makePlanReader(snap, opts = {}) {
  const db = {}
  for (const [table, rows] of Object.entries(snap)) {
    for (const row of rows) if (row.id) db[`${table}:${row.id}`] = row
  }
  return {
    async getRow(table, id, columns) {
      const row = db[`${table}:${id}`]
      if (!row) return null
      if (!columns) return { ...row }
      const out = {}
      for (const c of columns) out[c] = row[c]
      return out
    },
    async countWordsForUnit(unitId) {
      return (snap.words || []).filter((w) => w.unit_id === unitId).length
    },
    async headCountFiltered(table, filters) {
      if (opts.headCountFiltered) return opts.headCountFiltered(table, filters)
      return { count: 0, tableMissing: false }
    },
    async selectAllRows(table) { return snap[table] || [] },
  }
}

const TB1 = crypto.randomUUID()
const U1 = crypto.randomUUID()
const U2 = crypto.randomUUID()
const S1 = crypto.randomUUID()
const SCA1 = crypto.randomUUID()
const CLASS1 = crypto.randomUUID()

function buildBaseSnapshot() {
  return {
    students: [{ id: S1, name: 'PlanTest학생', class_id: null, current_unit_id: U1, unit_name: 'Unit1' }],
    classes: [],
    textbooks: [{ id: TB1, name: 'Book A', owner_class_id: null }],
    units: [
      { id: U1, name: 'Unit1', textbook_id: TB1, class_id: null },
      { id: U2, name: 'Unit2', textbook_id: TB1, class_id: null },
    ],
    words: [
      { id: crypto.randomUUID(), unit_id: U1, word: 'apple', meaning: '사과' },
      { id: crypto.randomUUID(), unit_id: U1, word: 'banana', meaning: '바나나' },
      { id: crypto.randomUUID(), unit_id: U2, word: 'cat', meaning: '고양이' },
      { id: crypto.randomUUID(), unit_id: U2, word: 'dog', meaning: '개' },
    ],
    student_class_assignments: [
      { id: SCA1, student_id: S1, class_id: CLASS1, textbook_id: TB1, current_unit_id: U1, is_primary: true, created_at: '2026-01-01' },
    ],
  }
}

function buildOkManifest() {
  return {
    id: 'plan-test-ok-001',
    project_ref: 'testref123',
    title: '플랜 테스트 — 정상 재배정',
    affected_students: [S1],
    changes: [
      {
        table: 'student_class_assignments', id: SCA1,
        expect_before: { student_id: S1, textbook_id: TB1, is_primary: true, current_unit_id: U1 },
        set: { current_unit_id: U2 },
      },
    ],
  }
}

console.log('=== [C1] runPlan — 정상 manifest → READY, DB WRITE 0 ===')
{
  const snap = buildBaseSnapshot()
  const reader = makePlanReader(snap)
  const { plan, hotfixResult } = await runPlan(
    { manifest: buildOkManifest(), envFlag: 'production', reader, reportDir: REPORT_DIR, runId: 'RUN-PLAN-OK-1' },
    { loadEnv: () => envOk() },
  )
  check('apply_eligibility = READY', plan.apply_eligibility === 'READY', plan.status)
  check('risk = LOW(1개 업데이트, primary flip 없음)', plan.risk === 'LOW')
  check('preflight 1건 match', plan.preflight.length === 1 && plan.preflight[0].match === true)
  check('affected.students = 1', plan.affected.students === 1)
  check('affected.textbooks >= 1', plan.affected.textbooks >= 1)
  check('affected.units >= 1', plan.affected.units >= 1)
  check('DB WRITE 0(hotfixResult.report.dbWriteCount)', (hotfixResult.report.dbWriteCount ?? 0) === 0)
  check('lint.ok = true(서술 없음)', plan.lint.ok === true)
  check('invariantsDelta 계산됨(리더 재사용)', plan.invariantsDelta !== null)
}

console.log('\n=== [C1] runPlan — narrative lint 위반 → BLOCKED_LINT ===')
{
  const snap = buildBaseSnapshot()
  const reader = makePlanReader(snap)
  const badManifest = buildOkManifest()
  badManifest.title = `핫픽스: current_unit_id 'WRONG-BEFORE-ID' -> '${U2}' (실제 expect_before 와 다른 서술)`
  const { plan } = await runPlan(
    { manifest: badManifest, envFlag: 'production', reader, reportDir: REPORT_DIR, runId: 'RUN-PLAN-LINT-1' },
    { loadEnv: () => envOk() },
  )
  check('apply_eligibility = BLOCKED_LINT', plan.apply_eligibility === 'BLOCKED_LINT')
  check('lint.ok = false', plan.lint.ok === false)
  check('lint.findings 비어있지 않음', plan.lint.findings.length > 0)
}

console.log('\n=== [C1] runPlan — 프리플라이트 불일치(이미 적용됨) → BLOCKED_PREFLIGHT ===')
{
  const snap = buildBaseSnapshot()
  snap.student_class_assignments[0].current_unit_id = U2 // 이미 적용된 상태로 조작
  const reader = makePlanReader(snap)
  const { plan } = await runPlan(
    { manifest: buildOkManifest(), envFlag: 'production', reader, reportDir: REPORT_DIR, runId: 'RUN-PLAN-PRE-1' },
    { loadEnv: () => envOk() },
  )
  check('apply_eligibility = BLOCKED_PREFLIGHT', plan.apply_eligibility === 'BLOCKED_PREFLIGHT', plan.status)
  check('preflight 행이 mismatch 로 표시됨', plan.preflight.some((r) => r.match === false))
}

console.log('\n=== [C1] runPlan — MULTIPLE_PRIMARY 를 만드는 manifest → BLOCKED_INVARIANT ===')
{
  const snap = buildBaseSnapshot()
  const reader = makePlanReader(snap)
  const newScaId = crypto.randomUUID()
  const badManifest = {
    id: 'plan-test-invariant-001', project_ref: 'testref123', title: '두 번째 primary 추가(회귀 재현)',
    affected_students: [S1],
    changes: [
      { op: 'insert', table: 'student_class_assignments', id: newScaId,
        fields: { student_id: S1, class_id: crypto.randomUUID(), textbook_id: crypto.randomUUID(), current_unit_id: null, is_primary: true } },
    ],
  }
  const { plan } = await runPlan(
    { manifest: badManifest, envFlag: 'production', reader, reportDir: REPORT_DIR, runId: 'RUN-PLAN-INV-1' },
    { loadEnv: () => envOk() },
  )
  check('apply_eligibility = BLOCKED_INVARIANT', plan.apply_eligibility === 'BLOCKED_INVARIANT', plan.status)
  check('invariantsDelta.new_fail 에 MULTIPLE_PRIMARY 포함', (plan.invariantsDelta?.new_fail || []).some((f) => f.code === 'MULTIPLE_PRIMARY'))
}

console.log('\n=== [C1] runPlan — risk 산정(LOW/MEDIUM/HIGH) ===')
{
  const snap = buildBaseSnapshot()

  // MEDIUM: primary flip(is_primary 값이 바뀌는 update)
  const primaryFlipManifest = buildOkManifest()
  primaryFlipManifest.changes[0].expect_before.is_primary = true
  primaryFlipManifest.changes[0].set.is_primary = false
  const { plan: planFlip } = await runPlan(
    { manifest: primaryFlipManifest, envFlag: 'production', reader: makePlanReader(snap), reportDir: REPORT_DIR, runId: 'RUN-PLAN-RISK-FLIP-1' },
    { loadEnv: () => envOk() },
  )
  check('primary flip 은 risk = MEDIUM', planFlip.risk === 'MEDIUM', planFlip.risk)

  // HIGH: delete op 포함
  const deleteManifest = {
    id: 'plan-test-risk-remove-001', project_ref: 'testref123', allow_primary_delete: true,
    changes: [{ op: 'delete', table: 'student_class_assignments', id: SCA1,
      expect_before: { student_id: S1, class_id: CLASS1, textbook_id: TB1, current_unit_id: U1, is_primary: true } }],
  }
  const { plan: planDelete } = await runPlan(
    { manifest: deleteManifest, envFlag: 'production', reader: makePlanReader(snap), reportDir: REPORT_DIR, runId: 'RUN-PLAN-RISK-DEL-1' },
    { loadEnv: () => envOk() },
  )
  check('delete 포함 시 risk = HIGH', planDelete.risk === 'HIGH', planDelete.risk)
}

console.log('\n=== [C1] runPlan — --refresh-expect: drift 목록 + <manifest>.refreshed.json 생성(원본 불변) ===')
{
  const tmpManifestPath = path.join(REPORT_DIR, 'drift-source.json')
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  const manifestOnDisk = buildOkManifest()
  fs.writeFileSync(tmpManifestPath, JSON.stringify(manifestOnDisk), 'utf8')
  const originalRaw = fs.readFileSync(tmpManifestPath, 'utf8')

  const snap = buildBaseSnapshot()
  snap.student_class_assignments[0].current_unit_id = U2 // 라이브 값이 manifest 의 expect_before(U1)와 다름(drift)
  const reader = makePlanReader(snap)

  const { plan } = await runPlan(
    { manifestPath: tmpManifestPath, envFlag: 'production', reader, reportDir: REPORT_DIR, refreshExpect: true, runId: 'RUN-PLAN-DRIFT-1' },
    { loadEnv: () => envOk() },
  )
  check('drift 목록에 current_unit_id 항목 포함', plan.drift.some((d) => d.column === 'current_unit_id'), JSON.stringify(plan.drift))
  check('refreshedManifestPath 는 <manifest>.refreshed.json', plan.refreshedManifestPath?.endsWith('.refreshed.json'))
  check('원본 manifest 파일은 절대 변경되지 않음', fs.readFileSync(tmpManifestPath, 'utf8') === originalRaw)
  check('refreshed.json 파일이 실제로 생성됨', fs.existsSync(plan.refreshedManifestPath))
  const refreshed = JSON.parse(fs.readFileSync(plan.refreshedManifestPath, 'utf8'))
  check('refreshed.json 의 expect_before 가 라이브 값(U2)으로 갱신됨', refreshed.changes[0].expect_before.current_unit_id === U2)
  // refresh 된 사본으로 다시 계획을 세우면 이제 preflight 가 PASS 여야 한다(=BLOCKED_PREFLIGHT 가 아님).
  const { plan: planAfterRefresh } = await runPlan(
    { manifest: refreshed, envFlag: 'production', reader: makePlanReader(snap), reportDir: REPORT_DIR, runId: 'RUN-PLAN-DRIFT-2' },
    { loadEnv: () => envOk() },
  )
  check('refresh 된 manifest 는 더 이상 BLOCKED_PREFLIGHT 가 아님(READY)', planAfterRefresh.apply_eligibility === 'READY', planAfterRefresh.status)
}

console.log('\n=== [C1] runPlan — 항상 DB WRITE 0(dryRun 강제, 승인 게이트 도달 안 함) ===')
{
  const snap = buildBaseSnapshot()
  const reader = makePlanReader(snap)
  const { plan, hotfixResult } = await runPlan(
    { manifest: buildOkManifest(), envFlag: 'production', reader, reportDir: REPORT_DIR, runId: 'RUN-PLAN-DBWRITE-1' },
    { loadEnv: () => envOk() },
  )
  check('plan.dbWriteCount = 0', plan.dbWriteCount === 0)
  check('hotfixResult.status = ready-to-apply(승인 게이트 이전 STOP)', hotfixResult.status === 'ready-to-apply')
  check('hotfixResult.exitCode = 0', hotfixResult.exitCode === 0)
}

console.log(`\n=== summary ===\nPASS ${pass} / FAIL ${fail}`)
if (fail > 0) {
  console.log('FAIL')
  process.exit(1)
} else {
  console.log('PASS')
  process.exit(0)
}
