// Production Safety Harness — prod:plan (2026-09-04, Harness V2 Track C1)
//
// node scripts/prodPlan.mjs <manifest.json> [--env production|staging]
//   [--refresh-expect] [--fixture-reader <file>] [--report-dir <dir>] [--json]
//
// ★ READ-ONLY 보장 ★
// scripts/prodHotfix.mjs 의 runPlan() 을 dryRun:true 로만 호출한다 —
// 승인 게이트(APPLY <runId> 입력)에 절대 도달하지 않으므로 DB WRITE 는
// 항상 0이다. 이 파일 자체에는 UPDATE/INSERT/DELETE 를 실행하는 코드가
// 전혀 없다(로직은 전부 prodHotfix.mjs 의 runHotfix()/runPlan() 재사용 —
// 복제 없음, CLAUDE.md 규칙 3).
//
// 출력: 콘솔(사람용 요약) + <report-dir>/<runId>.plan.md(사람용 상세) +
// <report-dir>/<runId>.plan.json(자동화용). --env 를 생략하면 'production'
// 을 기본값으로 쓴다(계획 확인은 쓰기가 없어 위험하지 않음 — apply 는
// 여전히 --env 를 명시해야 하는 prod:apply/prodHotfix.mjs 가 담당).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPlan } from './prodHotfix.mjs'
import { describeChange } from './lib/hotfixManifest.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgv(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--refresh-expect') args.refreshExpect = true
    else if (a === '--fixture-reader') args.fixtureReaderPath = argv[++i]
    else if (a === '--report-dir') args.reportDir = argv[++i]
    else if (a === '--env') args.envFlag = argv[++i]
    else if (a === '--json') args.jsonOutput = true
    else args._.push(a)
  }
  return args
}

function fmtVal(v) { return JSON.stringify(v ?? null) }

function renderMarkdown(plan, manifest) {
  const lines = []
  lines.push(`# Hotfix Plan — ${plan.manifestId}`)
  lines.push('')
  lines.push(`- run: ${plan.runId}`)
  lines.push(`- project_ref: ${plan.projectRef}`)
  lines.push(`- title: ${plan.title || '(없음)'}`)
  lines.push(`- status: ${plan.status}`)
  lines.push(`- **apply_eligibility: ${plan.apply_eligibility}**`)
  lines.push(`- risk: ${plan.risk}`)
  lines.push('')

  lines.push('## Lint(서술 일치성)')
  lines.push(plan.lint.ok ? 'PASS — 위반 없음' : `FAIL — ${plan.lint.findings.length}건`)
  for (const f of plan.lint.findings) lines.push(`  - ${f}`)
  lines.push('')

  lines.push('## Preflight')
  if (!plan.preflight.length) lines.push('(변경 없음)')
  for (const row of plan.preflight) {
    lines.push(`- [${row.match ? 'MATCH' : 'MISMATCH'}] ${row.op} ${row.label}${row.mismatchReason ? ` — ${row.mismatchReason}` : ''}`)
  }
  lines.push('')

  lines.push('## Before -> After')
  for (const c of manifest.changes || []) {
    lines.push(`- ${c.table} ${c.id}`)
    for (const d of describeChange(c, 'apply')) lines.push(`  - ${d}`)
  }
  lines.push('')

  lines.push('## 영향 범위')
  lines.push(`- 학생: ${plan.affected.students}명, 교재: ${plan.affected.textbooks}종, 유닛: ${plan.affected.units}개`)
  lines.push(`- 학습기록 baseline 테이블: ${plan.learningBaselineTables.join(', ') || '(없음)'}`)
  if (plan.baseline?.counts) {
    for (const [sid, counts] of Object.entries(plan.baseline.counts)) {
      lines.push(`  - ${sid}: ${Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(', ')}`)
    }
  }
  lines.push('')

  lines.push('## Invariants delta 미리보기')
  if (plan.invariantsDelta) {
    lines.push(`- new_fail: ${plan.invariantsDelta.new_fail.length}건`)
    for (const f of plan.invariantsDelta.new_fail) lines.push(`  - ${f.code} ${f.studentId ?? '(유닛)'} — ${f.detail}`)
    lines.push(`- new_warn: ${plan.invariantsDelta.new_warn.length}건`)
    lines.push(`- resolved: ${plan.invariantsDelta.resolved.length}건`)
    for (const f of plan.invariantsDelta.resolved) lines.push(`  - ${f.code} ${f.studentId ?? '(유닛)'} — ${f.detail}`)
  } else {
    // QA-V2(2026-09-04): invariants delta 를 계산하지 못한 계획은 "정보 없음"
    // 이 아니라 적용 차단 사유다(runHotfix 가 blocked-invariant-unavailable 로
    // STOP 하고 apply_eligibility 는 BLOCKED_INVARIANT 가 된다).
    lines.push('(계산 실패 — 적용 차단)')
  }
  lines.push('')

  lines.push('## Drift(--refresh-expect)')
  if (plan.drift.length) {
    for (const d of plan.drift) lines.push(`- ${d.table}:${d.id}.${d.column} manifest=${fmtVal(d.manifest_value)} live=${fmtVal(d.live_value)}`)
    if (plan.refreshedManifestPath) lines.push(`- 갱신본 저장: ${plan.refreshedManifestPath}`)
  } else {
    lines.push('(--refresh-expect 미지정 또는 drift 없음)')
  }
  lines.push('')

  lines.push('## 파일')
  lines.push(`- apply SQL: ${plan.applySqlPath || '(없음)'}`)
  lines.push(`- rollback SQL: ${plan.rollbackSqlPath || '(없음)'}`)
  lines.push('')
  lines.push('DB WRITE: 0')
  return lines.join('\n')
}

function renderConsole(plan) {
  const lines = []
  lines.push(`\n=== Hotfix Plan — ${plan.manifestId} (run ${plan.runId}) ===`)
  lines.push(`status: ${plan.status}  risk: ${plan.risk}  apply_eligibility: ${plan.apply_eligibility}`)
  lines.push(`lint: ${plan.lint.ok ? 'PASS' : `FAIL(${plan.lint.findings.length}건)`}`)
  lines.push(`preflight: ${plan.preflight.filter((r) => r.match).length}/${plan.preflight.length} match`)
  lines.push(`영향: 학생 ${plan.affected.students}명 / 교재 ${plan.affected.textbooks}종 / 유닛 ${plan.affected.units}개`)
  if (plan.invariantsDelta) {
    lines.push(`invariants delta: new_fail ${plan.invariantsDelta.new_fail.length} · new_warn ${plan.invariantsDelta.new_warn.length} · resolved ${plan.invariantsDelta.resolved.length}`)
  }
  if (plan.drift.length) lines.push(`drift: ${plan.drift.length}건(--refresh-expect)`)
  lines.push('DB WRITE: 0')
  return lines.join('\n')
}

async function main() {
  const parsed = parseArgv(process.argv.slice(2))
  const manifestArg = parsed._[0]
  if (!manifestArg) {
    console.error('사용법: node scripts/prodPlan.mjs <manifest.json> [--env production|staging] [--refresh-expect] [--fixture-reader <file>] [--report-dir <dir>] [--json]')
    process.exitCode = 1
    return
  }

  const manifestPath = path.resolve(manifestArg)
  const reportDir = parsed.reportDir ? path.resolve(parsed.reportDir) : path.join(ROOT, 'scripts', '.tmp', 'prod-reports')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  const { plan } = await runPlan({
    manifestPath,
    envFlag: parsed.envFlag || 'production',
    fixtureReaderPath: parsed.fixtureReaderPath ? path.resolve(parsed.fixtureReaderPath) : undefined,
    reportDir,
    refreshExpect: !!parsed.refreshExpect,
  })

  fs.mkdirSync(reportDir, { recursive: true })
  const mdPath = path.join(reportDir, `${plan.runId}.plan.md`)
  const jsonPath = path.join(reportDir, `${plan.runId}.plan.json`)
  fs.writeFileSync(mdPath, `${renderMarkdown(plan, manifest)}\n`, 'utf8')
  fs.writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')

  if (parsed.jsonOutput) {
    console.log(JSON.stringify({ ...plan, mdPath, jsonPath }, null, 2))
  } else {
    console.log(renderConsole(plan))
    console.log(`\n리포트: ${mdPath}\n        ${jsonPath}`)
  }

  process.exitCode = plan.apply_eligibility === 'READY' ? 0 : 1
}

await main()
