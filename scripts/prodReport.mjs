// Production Ops Report — READ-ONLY 운영 보고서 생성기 (2026-09-04, Track D)
//
// ★ READ-ONLY 보장 ★
// 이 스크립트는 (a) 기존 READ-ONLY 하네스 2개를 자식 프로세스로 실행하고
// (b) 로컬 파일(PROJECT_BOARD.md, src/utils/attachment/worldProgress.js,
// --from-dir로 준 fixture)을 읽고 (c) 선택적으로 GET 요청 1회(배포 페이지)와
// `gh pr list`(읽기 전용 GitHub API)를 호출한다. PATCH/POST/PUT/DELETE 경로가
// 이 파일 어디에도 없고, prod:hotfix(scripts/prodHotfix.mjs)는 아예 import
// 하지 않는다 — "npm run prod:report"는 절대 prodHotfix apply를 트리거하지
// 않는다(운영자 지시, 이 트랙의 절대 제약).
//
// 사용법:
//   node scripts/prodReport.mjs                        라이브 실행(READ-ONLY)
//     내부적으로 다음 두 개의 기존 READ-ONLY 하네스를 순서대로 실행한다:
//       node scripts/studentHealthCheck.mjs --json --require-env --mask-names
//       node scripts/prodCheck.mjs --require-env --json --report-dir <dir>
//   node scripts/prodReport.mjs --from-dir <dir>        네트워크 0, 재조회 스킵
//     <dir>/prodcheck.json — scripts/prodCheck.mjs --json stdout과 동일 shape
//     <dir>/health.json    — scripts/studentHealthCheck.mjs --json stdout과 동일 shape
//     <dir>/security-regressions.txt (선택) — scripts/testSecurityRegressions.mjs
//       실행 결과 stdout을 캡처해 둔 텍스트. "KNOWN ..." 줄만 파싱한다.
//   node scripts/prodReport.mjs --sha <sha>             origin/main 대신 이 sha 표기
//   node scripts/prodReport.mjs --no-network-web        배포 페이지 GET 생략
//
// 산출물: docs/qa/ops-report/ops-report-latest.{md,json} +
//         docs/qa/ops-report/history/ops-report-<UTC>.{md,json}
//
// 이 파일은 표준 finding 변환(scripts/lib/opsStatus.mjs, 다른 파일 — 재구현
// 아님)을 그대로 쓴다. 판정 로직은 전혀 갖지 않는다 — 여기서는 조회·집계·
// 렌더링·파일 저장만 한다.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { worstStatus, fromProdCheckReport, fromHealthReport, renderSummary } from './lib/opsStatus.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const FROM_DIR = opt('--from-dir')
const SHA_OVERRIDE = opt('--sha')
const NO_NETWORK_WEB = flag('--no-network-web')

// 13개 섹션 — 정확히 이 순서로 렌더된다(테스트가 순서를 고정 단언한다).
export const SECTION_TITLES = [
  '## 1. 실행 요약 (Executive Summary)',
  '## 2. 프로덕션 헬스 (Production Health)',
  '## 3. 학생 무결성 (Student Integrity)',
  '## 4. 교재 무결성 (Textbook Integrity)',
  '## 5. 정원 (Garden)',
  '## 6. 폴 타운 (Paul Town)',
  '## 7. 보상 (Reward)',
  '## 8. 엑셀 (Excel)',
  '## 9. 보안 (Security)',
  '## 10. 성능 (Performance)',
  '## 11. 유령/레거시 (Ghost/Legacy)',
  '## 12. 열린 PR (Open PRs)',
  '## 13. 승인 대기열 (Approval Queue)',
]

// 아직 --json 산출물이 없어 raw finding으로 못 옮기는 도메인들 — 스위트
// 이름만 정직하게 나열한다(가짜 집계 금지, 헌법 규칙 18).
const REWARD_SUITES = [
  'testRewardEngine.mjs', 'testRewardFlow.mjs', 'testRewardBaselineMigration.mjs',
  'testRewardLedgerMigration.mjs', 'testRewardServerWrite.mjs', 'testRewardIdempotencyStress.mjs',
  'testRewardConcurrencyMatrix.mjs', 'testRewardServerHardening.mjs', 'testRewardServerHardeningBehavior.mjs',
  'testRewardEndpointSecurity.mjs', 'testGameRewardPolicy.mjs', 'testDoubleEvents.mjs', 'testMissionBonusIdempotency.mjs',
]
const EXCEL_SUITES = ['testExcelHeaderGuard.mjs', 'testExcelHeaderResidue.mjs', 'testExcelImportFixtures.mjs']
const SECURITY_SUITES = [
  'testRlsSecurity.mjs', 'testSecurityRegressions.mjs', 'testAdminPinThrottle.mjs',
  'testSessionTokenAuth.mjs', 'testRewardEndpointSecurity.mjs', 'testHardDeleteGuard.mjs',
]
const GARDEN_SUITES_KNOWN = [
  { file: 'testGardenGrowthFlow.mjs', asserts: 84, notedAt: '2026-08-30 registry 편입' },
  { file: 'testGardenGrowthSources.mjs', asserts: 44, notedAt: '2026-09-04' },
]
const PAUL_TOWN_SUITE_KNOWN = { file: 'testPaulTownProgression.mjs', asserts: 222, notedAt: '2026-09-04' }

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

function loadReports() {
  if (FROM_DIR) {
    return { prodcheck: readJsonSafe(path.join(FROM_DIR, 'prodcheck.json')), health: readJsonSafe(path.join(FROM_DIR, 'health.json')) }
  }
  const healthRes = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts/studentHealthCheck.mjs'), '--json', '--require-env', '--mask-names'],
    { cwd: ROOT, encoding: 'utf8' })
  let health = null
  try { health = JSON.parse(healthRes.stdout) } catch { /* 아래 리포트에 (조회 없음)으로 반영 */ }

  const reportDir = path.join(ROOT, 'scripts', '.tmp', 'prod-reports')
  const prodRes = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts/prodCheck.mjs'), '--require-env', '--json', '--report-dir', reportDir],
    { cwd: ROOT, encoding: 'utf8' })
  let prodcheck = null
  try { prodcheck = JSON.parse(prodRes.stdout) } catch { /* 아래 리포트에 (조회 없음)으로 반영 */ }

  return { prodcheck, health }
}

function loadBlockedCards() {
  try {
    const text = fs.readFileSync(path.join(ROOT, 'PROJECT_BOARD.md'), 'utf8')
    const idx = text.indexOf('\n## BLOCKED')
    if (idx === -1) return []
    const rest = text.slice(idx + 1)
    const nextIdx = rest.indexOf('\n## ')
    const section = nextIdx === -1 ? rest : rest.slice(0, nextIdx)
    return [...section.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim())
  } catch {
    return []
  }
}

function loadSha() {
  if (SHA_OVERRIDE) return SHA_OVERRIDE
  try {
    const res = spawnSync('git', ['rev-parse', 'origin/main'], { cwd: ROOT, encoding: 'utf8' })
    if (res.status === 0) return res.stdout.trim()
  } catch { /* ignore */ }
  return null
}

function loadOpenPRs() {
  if (FROM_DIR) return { ok: false, prs: [], reason: '--from-dir 모드(오프라인 회귀) — gh 생략' }
  try {
    const res = spawnSync('gh', ['pr', 'list', '--state', 'open', '--json', 'number,title,isDraft,headRefName'],
      { encoding: 'utf8', timeout: 15000 })
    if (res.error) return { ok: false, prs: [], reason: `gh 실행 불가: ${res.error.message}` }
    if (res.status !== 0) return { ok: false, prs: [], reason: `gh 인증/실행 실패(exit ${res.status}): ${(res.stderr || '').slice(0, 200)}` }
    return { ok: true, prs: JSON.parse(res.stdout || '[]') }
  } catch (err) {
    return { ok: false, prs: [], reason: String(err?.message || err) }
  }
}

async function loadGardenConstants() {
  try {
    const mod = await import(pathToFileURL(path.join(ROOT, 'src/utils/attachment/worldProgress.js')).href)
    return { ok: true, WORLD_STAGES: mod.WORLD_STAGES, PLOT_COUNT: mod.PLOT_COUNT, POINTS_PER_STAGE: mod.POINTS_PER_STAGE }
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) }
  }
}

async function loadDeployedInfo() {
  if (NO_NETWORK_WEB || FROM_DIR) {
    return { ok: false, reason: NO_NETWORK_WEB ? '--no-network-web' : '--from-dir 모드(오프라인 회귀) — 배포 페이지 조회 생략' }
  }
  try {
    const res = await fetch('https://voca-drab.vercel.app', { signal: AbortSignal.timeout(8000) })
    const text = await res.text()
    const m = text.match(/\/assets\/index-([a-zA-Z0-9_-]+)\.js/)
    return { ok: res.ok, status: res.status, bundleHash: m ? m[1] : null }
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) }
  }
}

function loadSecurityKnown() {
  if (!FROM_DIR) {
    return { ok: false, items: [], reason: '이 리포트는 testSecurityRegressions.mjs를 자동 실행하지 않음(READ-ONLY 범위 밖) — npm run verify:security-regressions로 별도 확인' }
  }
  const p = path.join(FROM_DIR, 'security-regressions.txt')
  if (!fs.existsSync(p)) return { ok: false, items: [], reason: 'security-regressions.txt 없음(선택 파일 — --from-dir에 넣으면 KNOWN 항목이 표시됨)' }
  const text = fs.readFileSync(p, 'utf8')
  return { ok: true, items: [...text.matchAll(/^\s*KNOWN\s+(.+)$/gm)].map((m) => m[1].trim()) }
}

function codeOf(f) {
  const i = f.check_id.indexOf(':')
  return i === -1 ? f.check_id : f.check_id.slice(i + 1)
}
const isTextbookCode = (code) => code.startsWith('TEXTBOOK_') || code.startsWith('UNIT_TEXTBOOK_')
  || code === 'UNIT_CONTENT_DUPLICATE' || code.startsWith('SCA_')

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 140)
}

function findingsTable(list, limit = 50) {
  if (!list.length) return '없음\n'
  const header = '| status | entity | check_id | expected | actual | recommended_action |\n|---|---|---|---|---|---|'
  const rows = list.slice(0, limit).map((f) => {
    const who = f.entity_label ?? f.entity_id ?? '-'
    return `| ${f.status} | ${f.entity_type}:${esc(who)} | ${f.check_id} | ${esc(f.expected)} | ${esc(f.actual)} | ${esc(f.recommended_action)} |`
  })
  const more = list.length > limit ? `\n(외 ${list.length - limit}건 생략)` : ''
  return [header, ...rows].join('\n') + more + '\n'
}

async function main() {
  const { prodcheck, health } = loadReports()
  const timestamp = new Date().toISOString()
  const environment = FROM_DIR ? 'local' : 'production'

  const prodFindings = prodcheck ? fromProdCheckReport(prodcheck, { environment, timestamp }) : []
  const healthFindings = health ? fromHealthReport(health, { environment, timestamp }) : []
  const allFindings = [...prodFindings, ...healthFindings]

  const overall = worstStatus(allFindings.map((f) => f.status))
  const studentFindings = allFindings.filter((f) => f.entity_type === 'student')
  const textbookFindings = allFindings.filter((f) => isTextbookCode(codeOf(f)))
  const approvalQueue = allFindings.filter((f) => f.write_required && f.approval_required)

  const board = loadBlockedCards()
  const sha = loadSha()
  const openPrs = loadOpenPRs()
  const garden = await loadGardenConstants()
  await loadDeployedInfo() // best-effort 참고 정보 — 실패해도 리포트를 막지 않는다(현재 섹션에 노출은 생략).
  const secKnown = loadSecurityKnown()

  const L = []
  L.push(`# 운영 보고서 — Paul Easy Voca (${timestamp})`)
  L.push('')

  L.push(SECTION_TITLES[0])
  L.push(`상태: **${overall}**`)
  L.push(`- prod:check verdict ${prodcheck?.verdict ?? '(조회 없음)'} · health summary PASS ${health?.summary?.pass ?? '-'}/WARN ${health?.summary?.warn ?? '-'}/FAIL ${health?.summary?.fail ?? '-'}`)
  L.push(`- 전체 finding ${allFindings.length}건 (student ${studentFindings.length} · textbook/unit ${textbookFindings.length})`)
  L.push(`- 승인 대기(Approval queue) ${approvalQueue.length}건 · PROJECT_BOARD.md BLOCKED 카드 ${board.length}건`)
  L.push('')

  L.push(SECTION_TITLES[1])
  L.push(`- prod:check verdict: ${prodcheck?.verdict ?? '(조회 없음 — .env 부재 또는 미실행)'}`)
  L.push(`- health summary: ${health?.summary ? `PASS ${health.summary.pass} / WARN ${health.summary.warn} / FAIL ${health.summary.fail} (총 ${health.summary.total}명)` : '(조회 없음)'}`)
  L.push(`- projectRef: ${prodcheck?.env?.projectRef ?? '(알수없음)'} · origin/main: ${sha ?? '(알수없음)'}`)
  L.push('')

  L.push(SECTION_TITLES[2])
  L.push(`REAL 학생만 대상(양쪽 하네스 모두 classifyAccount==='REAL'만 평가). 제외 집계: ${health?.excluded ? `아카이브 ${health.excluded.ARCHIVED} / 테스트 ${health.excluded.TEST} / QA반픽스처 ${health.excluded.QA_FIXTURE}` : '(health 리포트 없어 집계 불가)'}`)
  L.push(findingsTable(studentFindings))

  L.push(SECTION_TITLES[3])
  L.push('TEXTBOOK_* / UNIT_TEXTBOOK_* / UNIT_CONTENT_DUPLICATE / SCA_* 코드만.')
  L.push(findingsTable(textbookFindings))

  L.push(SECTION_TITLES[4])
  if (garden.ok) {
    L.push(`WORLD_STAGES(minPoints): ${garden.WORLD_STAGES.map((s) => `${s.id}=${s.minPoints}`).join(', ')}`)
    L.push(`정원 격자: ${garden.PLOT_COUNT}칸 · 칸당 ${garden.POINTS_PER_STAGE}포인트(src/utils/attachment/worldProgress.js)`)
  } else {
    L.push(`포뮬러 상수 로드 실패(${garden.reason}) — src/utils/attachment/worldProgress.js 직접 확인 필요`)
  }
  L.push('prod:check는 progress_data를 로드하지 않아 학생별 world stage 분포는 이 리포트에서 계산할 수 없음 — see verify suites:')
  for (const s of GARDEN_SUITES_KNOWN) L.push(`- scripts/${s.file}(마지막 확인 ${s.asserts}단언 PASS, registry note ${s.notedAt})`)
  L.push('')

  L.push(SECTION_TITLES[5])
  L.push('진행 분류 문서: docs/qa/paul-town-progression-classification.md')
  L.push(`- scripts/${PAUL_TOWN_SUITE_KNOWN.file}(마지막 확인 ${PAUL_TOWN_SUITE_KNOWN.asserts}단언 PASS, registry note ${PAUL_TOWN_SUITE_KNOWN.notedAt})`)
  L.push('')

  L.push(SECTION_TITLES[6])
  for (const s of REWARD_SUITES) L.push(`- scripts/${s}`)
  L.push('')

  L.push(SECTION_TITLES[7])
  for (const s of EXCEL_SUITES) L.push(`- scripts/${s}`)
  L.push('')

  L.push(SECTION_TITLES[8])
  for (const s of SECURITY_SUITES) L.push(`- scripts/${s}`)
  if (secKnown.ok) {
    L.push('KNOWN(의도된 열린 상태, --from-dir의 security-regressions.txt에서 파싱):')
    if (!secKnown.items.length) L.push('  (파일은 있으나 KNOWN 줄 없음)')
    for (const it of secKnown.items) L.push(`  - ${it}`)
  } else {
    L.push(`KNOWN 항목: ${secKnown.reason}`)
  }
  L.push('')

  L.push(SECTION_TITLES[9])
  L.push('상세: docs/qa/overnight-2026-09-04/T7-ui-perf-findings.md')
  L.push('')

  L.push(SECTION_TITLES[10])
  const ghostUnits = Array.isArray(health?.ghostUnits) ? health.ghostUnits : []
  L.push(`유령 유닛 ${ghostUnits.length}개(엑셀 헤더 잔재, health.ghostUnits 기준 — 유닛명/교재ID만, 학생 개인정보 없음)`)
  for (const g of ghostUnits.slice(0, 20)) L.push(`- ${JSON.stringify(g.name ?? '')} (교재 ${g.textbookId ?? '?'}, 단어 ${g.wordCount ?? 0}개) — ${g.reason ?? ''}`)
  L.push('')

  L.push(SECTION_TITLES[11])
  if (openPrs.ok) {
    if (!openPrs.prs.length) L.push('없음')
    for (const pr of openPrs.prs) L.push(`- #${pr.number} ${pr.title} (${pr.headRefName}${pr.isDraft ? ', draft' : ''})`)
  } else {
    L.push(`gh 조회 생략/실패: ${openPrs.reason}`)
  }
  L.push('')

  L.push(SECTION_TITLES[12])
  L.push(findingsTable(approvalQueue))
  if (board.length) {
    L.push('PROJECT_BOARD.md BLOCKED 카드:')
    for (const t of board) L.push(`- ${t}`)
  } else {
    L.push('PROJECT_BOARD.md BLOCKED 카드: 없음')
  }
  L.push('')

  L.push('---')
  L.push('DB WRITE: 0 (이 스크립트는 GET/gh 읽기 전용 API/로컬 파일 읽기만 합니다)')

  const md = L.join('\n') + '\n'

  const OUT_DIR = path.join(ROOT, 'docs', 'qa', 'ops-report')
  const HISTORY_DIR = path.join(OUT_DIR, 'history')
  fs.mkdirSync(HISTORY_DIR, { recursive: true })
  const dateTag = timestamp.replace(/[:.]/g, '-')
  const mdPath = path.join(OUT_DIR, 'ops-report-latest.md')
  const jsonPath = path.join(OUT_DIR, 'ops-report-latest.json')
  const jsonPayload = {
    generatedAt: timestamp,
    environment,
    overall,
    sha,
    findingCount: allFindings.length,
    approvalQueueCount: approvalQueue.length,
    boardBlockedCount: board.length,
    sources: { prodcheckVerdict: prodcheck?.verdict ?? null, healthSummary: health?.summary ?? null },
    findings: allFindings,
    dbWrite: 0,
  }
  fs.writeFileSync(mdPath, md, 'utf8')
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2) + '\n', 'utf8')
  fs.writeFileSync(path.join(HISTORY_DIR, `ops-report-${dateTag}.md`), md, 'utf8')
  fs.writeFileSync(path.join(HISTORY_DIR, `ops-report-${dateTag}.json`), JSON.stringify(jsonPayload, null, 2) + '\n', 'utf8')

  console.log(renderSummary(allFindings))
  console.log(`\n리포트: ${mdPath}`)
  console.log('DB WRITE: 0')
  process.exitCode = 0
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await main()
