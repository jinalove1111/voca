// scripts/generateDashboard.mjs — 개발자 대시보드 정적 HTML 생성기.
//
// 목적: PROJECT_BOARD.md + Health Check + Verify 결과 + .ai-status + Git
// 상태 + 로컬 Wiki 검색 안내, 6개를 self-contained 단일 HTML(`dashboard/
// index.html`)로 렌더링. 학생 앱(src/)과 완전히 분리된 개발자 전용 로컬
// 도구 — Vite/Vercel 빌드 대상 아님, App.jsx 라우팅에 절대 연결하지 않는다.
//
// 설계 원칙(운영자 지시, CLAUDE.md 규칙 6/12/13과 동일 원칙 적용):
//   - 새 npm 패키지 없음 — Node 내장 fs/path/child_process만 사용.
//   - PROJECT_BOARD.md를 읽기 전용으로 파싱만 한다 — 두 번째 진실원천을
//     만들지 않는다(카드 수정/추가 기능 없음, 순수 표시).
//   - 외부 CDN/이미지/API 호출 없음 — 인라인 CSS/JS만, 오프라인에서도 동작.
//   - Verify 전체 재실행은 --with-verify 플래그가 있을 때만(느릴 수 있어
//     기본은 캐시 표시). 캐시는 tests/harness/registry.mjs +
//     runDomain.mjs를 그대로 import해서 재사용 — 검증 로직 재구현 없음.
//
// 실행: node scripts/generateDashboard.mjs [--with-verify]
//       npm run dashboard [-- --with-verify]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const OUT_DIR = path.join(ROOT, 'dashboard')
const OUT_FILE = path.join(OUT_DIR, 'index.html')
const VERIFY_CACHE = path.join(OUT_DIR, '.last-verify.json')

const WITH_VERIFY = process.argv.includes('--with-verify')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return null }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ============================================================
// 1. PROJECT_BOARD.md — 읽기 전용 파싱 (컬럼별 카드 개수 + 제목만)
// ============================================================
const BOARD_COLUMNS = ['BACKLOG', 'NEXT', 'IN_PROGRESS', 'VERIFY', 'DONE', 'BLOCKED']

function parseBoard() {
  const content = readFileSafe(path.join(ROOT, 'PROJECT_BOARD.md'))
  const columns = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, []]))
  if (!content) return { columns, total: 0, error: 'PROJECT_BOARD.md를 찾을 수 없음' }

  let current = null
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(BACKLOG|NEXT|IN_PROGRESS|VERIFY|DONE|BLOCKED)\b/)
    if (heading) { current = heading[1]; continue }
    if (/^##\s+/.test(line)) { current = null; continue } // 다른 레벨2 헤딩(사용법 등) — 컬럼 아님
    const card = line.match(/^###\s+(.+)$/)
    if (card && current) columns[current].push(card[1].trim())
  }
  const total = Object.values(columns).reduce((n, arr) => n + arr.length, 0)
  return { columns, total }
}

// ============================================================
// 2. Health Check — scripts/healthCheck.mjs 실행 + stdout 파싱
// ============================================================
function runHealthCheck() {
  const res = spawnSync('node', [path.join(ROOT, 'scripts/healthCheck.mjs')], { cwd: ROOT, encoding: 'utf8' })
  const output = (res.stdout || '') + (res.stderr || '')
  return parseHealthCheck(output, res.status)
}

function parseHealthCheck(output, exitCode) {
  const scores = []
  let current = null
  let avg = null
  let ranAt = null
  for (const line of output.split(/\r?\n/)) {
    const ts = line.match(/^실행 시각: (.+)$/)
    if (ts) { ranAt = ts[1]; continue }
    const sc = line.match(/^(.+): (\d+)\/100\s+\[([^\]]+)\]$/)
    if (sc) {
      current = { area: sc[1].trim(), score: Number(sc[2]), kind: sc[3].trim(), reference: /참고|밖/.test(sc[1]), reasons: [] }
      scores.push(current)
      continue
    }
    const rs = line.match(/^\s{2}-\s(.+)$/)
    if (rs && current) { current.reasons.push(rs[1]); continue }
    const av = line.match(/^9개 영역 평균: ([\d.]+)\/100$/)
    if (av) avg = Number(av[1])
  }
  return { scores, avg, ranAt, exitCode, ok: scores.length > 0 }
}

// ============================================================
// 3. Verify 결과 — 기본은 캐시(dashboard/.last-verify.json), --with-verify
//    지정 시 tests/harness/registry.mjs + runDomain.mjs를 그대로 import해
//    실제 재실행(로직 재구현 없음, 오케스트레이션 레이어만 재사용).
// ============================================================
async function getVerifyResults() {
  if (WITH_VERIFY) {
    console.log('[dashboard] --with-verify 지정 — tests/harness 전체 도메인 재실행 (느릴 수 있음)')
    const { DOMAINS } = await import(new URL('../tests/harness/registry.mjs', import.meta.url).href)
    const { runDomainHarness } = await import(new URL('../tests/harness/runDomain.mjs', import.meta.url).href)
    const domains = []
    let anyFail = false
    for (const id of Object.keys(DOMAINS)) {
      const r = await runDomainHarness(id)
      const status = r.skip ? 'SKIP' : (r.ok ? 'PASS' : 'FAIL')
      if (status === 'FAIL') anyFail = true
      domains.push({ id, label: r.label, status, skip: r.skip || null, scriptCount: r.results.length })
    }
    const cache = { generatedAt: new Date().toISOString(), ok: !anyFail, domains }
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(VERIFY_CACHE, JSON.stringify(cache, null, 2))
    return cache
  }
  const cached = readFileSafe(VERIFY_CACHE)
  if (!cached) return null
  try { return JSON.parse(cached) } catch { return null }
}

// ============================================================
// 4. .ai-status/*.json — 존재하는 상태 파일 전부
// ============================================================
function getAiStatuses() {
  const dir = path.join(ROOT, '.ai-status')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'TEMPLATE.json')
  return files
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        return { file: f, example: f.startsWith('EXAMPLE-'), ...data }
      } catch (e) {
        return { file: f, error: String(e.message || e) }
      }
    })
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
}

// ============================================================
// 5. Git 상태 — child_process로 조회, 실패해도 대시보드 생성은 계속
// ============================================================
function safeGit(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (res.status !== 0) return null
  return (res.stdout || '').trim()
}

function getGitStatus() {
  const branch = safeGit(['branch', '--show-current']) || '(확인 불가)'
  const statusRaw = safeGit(['status', '--porcelain'])
  const changedFiles = statusRaw ? statusRaw.split('\n').filter(Boolean) : []
  const logRaw = safeGit(['log', '-5', '--oneline'])
  const log = logRaw ? logRaw.split('\n').filter(Boolean) : []
  const upstream = safeGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  let aheadBehind = null
  if (upstream) {
    const ab = safeGit(['rev-list', '--left-right', '--count', `${upstream}...HEAD`])
    if (ab) {
      const parts = ab.split(/\s+/).map(Number)
      aheadBehind = { upstream, behind: parts[0] || 0, ahead: parts[1] || 0 }
    }
  }
  return { branch, changedFiles, log, aheadBehind }
}

// ============================================================
// 렌더링 — self-contained 단일 HTML(인라인 CSS/JS만, 외부 호출 0)
// ============================================================
function scoreColor(score) {
  if (score >= 85) return 'var(--good)'
  if (score >= 65) return 'var(--warn)'
  return 'var(--bad)'
}

function renderBoardSection(board) {
  const cols = BOARD_COLUMNS.map((name) => {
    const cards = board.columns[name] || []
    const items = cards.length
      ? `<ul class="card-list">${cards.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
      : `<p class="muted">비어있음</p>`
    return `
      <div class="board-col">
        <div class="board-col-head"><span class="badge badge-${name.toLowerCase()}">${name}</span><span class="count">${cards.length}</span></div>
        ${items}
      </div>`
  }).join('')
  return `
    <section class="panel">
      <h2>1. PROJECT_BOARD.md (읽기 전용)</h2>
      <p class="muted">단일 권위 소스는 항상 <code>PROJECT_BOARD.md</code> 파일 자체입니다 — 이 대시보드는 그 내용을 그대로 파싱해서 보여줄 뿐, 여기서 카드를 수정/추가할 수 없습니다.</p>
      <p class="stat-line">전체 카드 수: <strong>${board.total}</strong></p>
      <div class="board-grid">${cols}</div>
    </section>`
}

function renderHealthSection(health) {
  if (!health.ok) {
    return `<section class="panel"><h2>2. Health Check</h2><p class="muted">scripts/healthCheck.mjs 실행 결과를 파싱하지 못했습니다(exit ${health.exitCode}).</p></section>`
  }
  const rows = health.scores.map((s) => `
    <div class="meter-row">
      <div class="meter-label">
        <span>${esc(s.area)}</span>
        <span class="meter-kind">[${esc(s.kind)}]</span>
      </div>
      <div class="meter-track"><div class="meter-fill" style="width:${s.score}%;background:${scoreColor(s.score)}"></div></div>
      <div class="meter-score">${s.score}/100</div>
      <details class="reasons"><summary>근거 ${s.reasons.length}건</summary><ul>${s.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
    </div>`).join('')
  return `
    <section class="panel">
      <h2>2. Health Check (9개 영역, 실행 시각: ${esc(health.ranAt || '알 수 없음')})</h2>
      ${health.avg != null ? `<p class="stat-line">9개 영역 평균: <strong>${health.avg}/100</strong></p>` : ''}
      <div class="meters">${rows}</div>
    </section>`
}

function renderVerifySection(verify) {
  if (!verify) {
    return `
      <section class="panel">
        <h2>3. Verify 결과</h2>
        <p class="muted">아직 실행 안 됨. <code>npm run verify:all</code>을 먼저 실행하거나
        <code>npm run dashboard -- --with-verify</code>로 대시보드가 직접 전체 도메인을
        재실행하고 캐시(<code>dashboard/.last-verify.json</code>)를 생성하도록 하세요.</p>
      </section>`
  }
  const rows = verify.domains.map((d) => `
    <tr>
      <td>${esc(d.id)}</td>
      <td>${esc(d.label)}</td>
      <td><span class="status-badge status-${d.status.toLowerCase()}">${d.status}</span></td>
      <td class="muted">${d.skip ? esc(d.skip) : (d.scriptCount != null ? `${d.scriptCount}개 스크립트` : '')}</td>
    </tr>`).join('')
  return `
    <section class="panel">
      <h2>3. Verify 결과 (마지막 실행: ${esc(verify.generatedAt)})</h2>
      <p class="stat-line">전체 판정: <span class="status-badge status-${verify.ok ? 'pass' : 'fail'}">${verify.ok ? 'PASS' : 'FAIL'}</span></p>
      <table class="data-table">
        <thead><tr><th>도메인</th><th>설명</th><th>상태</th><th>비고</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
}

function renderAiStatusSection(statuses) {
  if (!statuses.length) {
    return `<section class="panel"><h2>4. .ai-status/</h2><p class="muted">상태 파일이 없습니다.</p></section>`
  }
  const rows = statuses.map((s) => `
    <tr>
      <td>${esc(s.file)}${s.example ? ' <span class="tag">example</span>' : ''}</td>
      <td>${esc(s.agent_name || '-')}</td>
      <td><span class="status-badge status-${(s.status || 'unknown').toLowerCase()}">${esc(s.status || 'unknown')}</span></td>
      <td>${esc(s.task || s.error || '-')}</td>
      <td class="muted">${esc(s.updated_at || '-')}</td>
    </tr>`).join('')
  return `
    <section class="panel">
      <h2>4. .ai-status/ (에이전트 상태)</h2>
      <table class="data-table">
        <thead><tr><th>파일</th><th>agent</th><th>status</th><th>task</th><th>updated_at</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
}

function renderGitSection(git) {
  const changed = git.changedFiles.length
    ? `<ul class="card-list">${git.changedFiles.map((l) => `<li><code>${esc(l)}</code></li>`).join('')}</ul>`
    : `<p class="muted">clean — 변경 없음</p>`
  const log = `<ul class="card-list">${git.log.map((l) => `<li><code>${esc(l)}</code></li>`).join('')}</ul>`
  const ab = git.aheadBehind
    ? `ahead <strong>${git.aheadBehind.ahead}</strong> / behind <strong>${git.aheadBehind.behind}</strong> (vs <code>${esc(git.aheadBehind.upstream)}</code>)`
    : '업스트림 추적 정보 없음'
  return `
    <section class="panel">
      <h2>5. Git 상태</h2>
      <p class="stat-line">브랜치: <strong>${esc(git.branch)}</strong> — ${ab}</p>
      <h3>변경된 파일 (git status --porcelain)</h3>
      ${changed}
      <h3>최근 커밋 (git log -5 --oneline)</h3>
      ${log}
    </section>`
}

function renderWikiSection() {
  return `
    <section class="panel">
      <h2>6. LLM Wiki 검색</h2>
      <p class="muted">이 대시보드는 정적 HTML이라 대화형 검색 실행이 불가능합니다 — 흉내내지 않고 사용법만 안내합니다.</p>
      <pre class="code-block">npm run wiki:search -- "키워드"
npm run wiki:search -- "PIN 해시" --limit 5
node scripts/wikiSearch.mjs "entrance test 서버 재검증" --context 3</pre>
      <p>색인: <a href="../wiki/HOME.md">wiki/HOME.md</a> (상대 링크 — 로컬에서 이 HTML을 열었을 때만 유효)</p>
    </section>`
}

function renderHtml({ board, health, verify, statuses, git, generatedAt }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Paul Easy Voca — 개발자 대시보드</title>
<style>
  :root {
    --bg: #f8fafc; --panel: #ffffff; --border: #e2e8f0; --text: #1e293b; --muted: #64748b;
    --accent: #2563eb; --good: #16a34a; --warn: #d97706; --bad: #dc2626;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, "Malgun Gothic", sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
  header { padding: 24px 32px; background: var(--panel); border-bottom: 1px solid var(--border); }
  header h1 { margin: 0 0 4px; font-size: 22px; }
  header p { margin: 0; color: var(--muted); font-size: 13px; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 32px 64px; display: flex; flex-direction: column; gap: 20px; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 20px 24px; }
  .panel h2 { margin: 0 0 12px; font-size: 16px; }
  .panel h3 { margin: 16px 0 8px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
  .muted { color: var(--muted); font-size: 13px; }
  .stat-line { font-size: 14px; margin: 4px 0 12px; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
  .code-block { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 8px; font-size: 13px; overflow-x: auto; }
  a { color: var(--accent); }
  .card-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .card-list li { font-size: 12.5px; border-left: 3px solid var(--border); padding: 3px 8px; background: #f8fafc; border-radius: 3px; }
  .board-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 12px; }
  .board-col { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: #fbfcfe; }
  .board-col-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .board-col .count { font-weight: 700; font-size: 13px; color: var(--muted); }
  .badge { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; letter-spacing: .02em; }
  .badge-backlog { background: #e2e8f0; color: #475569; }
  .badge-next { background: #dbeafe; color: #1d4ed8; }
  .badge-in_progress { background: #fef3c7; color: #92400e; }
  .badge-verify { background: #ede9fe; color: #6d28d9; }
  .badge-done { background: #dcfce7; color: #15803d; }
  .badge-blocked { background: #fee2e2; color: #b91c1c; }
  .meters { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
  .meter-row { display: grid; grid-template-columns: 220px 1fr 70px auto; align-items: center; gap: 10px; }
  .meter-label { font-size: 13px; display: flex; flex-direction: column; }
  .meter-kind { font-size: 10.5px; color: var(--muted); }
  .meter-track { background: #e2e8f0; border-radius: 999px; height: 10px; overflow: hidden; }
  .meter-fill { height: 100%; border-radius: 999px; }
  .meter-score { font-size: 13px; font-weight: 700; text-align: right; }
  .reasons { font-size: 12px; }
  .reasons summary { cursor: pointer; color: var(--muted); }
  .reasons ul { margin: 6px 0 0; padding-left: 18px; }
  .data-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  .data-table th, .data-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .data-table th { color: var(--muted); font-weight: 600; font-size: 11.5px; text-transform: uppercase; }
  .status-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
  .status-pass, .status-completed { background: #dcfce7; color: #15803d; }
  .status-fail, .status-failed, .status-blocked { background: #fee2e2; color: #b91c1c; }
  .status-skip { background: #fef3c7; color: #92400e; }
  .status-working, .status-planning, .status-reviewing { background: #dbeafe; color: #1d4ed8; }
  .tag { font-size: 10px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
  footer { text-align: center; color: var(--muted); font-size: 12px; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>Paul Easy Voca — 개발자 대시보드</h1>
  <p>생성 시각: ${esc(generatedAt)} — 개발자 전용 로컬 도구(정적 생성 HTML). 학생 앱(src/)과 무관, Vercel 배포 대상 아님.</p>
</header>
<main>
${renderBoardSection(board)}
${renderHealthSection(health)}
${renderVerifySection(verify)}
${renderAiStatusSection(statuses)}
${renderGitSection(git)}
${renderWikiSection()}
</main>
<footer>scripts/generateDashboard.mjs — 산출물은 커밋되지 않습니다(.gitignore). 다시 생성하려면 <code>npm run dashboard</code>.</footer>
<script>
  // 순수 로컬 인라인 스크립트 — 외부 호출 없음. details/summary는 브라우저 기본 동작이라
  // 별도 JS 불필요, 이 스크립트는 향후 확장 여지를 위한 자리표시(현재는 정적 표시만).
</script>
</body>
</html>`
}

async function main() {
  const generatedAt = new Date().toISOString()
  const board = parseBoard()
  const health = runHealthCheck()
  const verify = await getVerifyResults()
  const statuses = getAiStatuses()
  const git = getGitStatus()

  const html = renderHtml({ board, health, verify, statuses, git, generatedAt })

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(OUT_FILE, html)

  console.log(`\n[dashboard] 생성 완료: ${OUT_FILE}`)
  console.log(`[dashboard] 브라우저에서 위 경로를 직접 열어 확인하세요(자동으로 열지 않습니다).`)
  if (!verify) {
    console.log(`[dashboard] Verify 캐시 없음 — npm run dashboard -- --with-verify 로 채울 수 있습니다.`)
  }
}

main()
