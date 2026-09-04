// scripts/testBrowserE2E.mjs — Browser E2E 러너 (2026-09-05, npm run verify:e2e)
//
// Playwright(chromium)로 학생/관리자 화면을 실제 브라우저에서 렌더해 표시
// 결과를 자동 검증한다(운영자가 스크린샷을 보내지 않아도 됨). tests/e2e/의
// 모든 spec은 page.route()로 네트워크 전체를 mock한다(tests/e2e/lib/
// mockRoutes.mjs) — 실제 Supabase/Vercel 요청 0건이 이 하네스의 전제이며,
// 이 러너가 그 사실을 다시 한 번 집계해 단언으로 남긴다(fail-closed).
//
// 흐름: build 산출물(dist/index.html) 확인 → 없으면 npm run build 실행
//       → vite preview 기동(고정 포트, 준비될 때까지 폴링)
//       → Playwright chromium 실행(설치 안 돼 있으면 아래 SKIP/FAIL 분기)
//       → tests/e2e/student.spec.mjs, tests/e2e/admin.spec.mjs 순차 실행
//       → 기존 하네스 관례와 동일한 "총 N단언 — PASS n / FAIL m / SKIP k" 출력
//
// 브라우저 미설치 시:
//   E2E_SKIP_IF_NO_BROWSER=1 이면 SKIP(exit 0) — 로컬에서 verify:all을 깨지
//   않기 위한 관용(tests/harness/registry.mjs가 extra:true로 이 관용을 함께 문서화).
//   그 변수가 없으면 FAIL(exit 1) — CI(.github/workflows/release-gate.yml)는
//   사전에 `npx playwright install --with-deps chromium`을 실행하므로 이
//   변수를 세팅하지 않고, 브라우저 부재 자체가 fail-closed로 게이트를 막는다.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const PORT = Number(process.env.E2E_PREVIEW_PORT) || 4173
const BASE_URL = `http://localhost:${PORT}`

function log(msg) { console.log(`[testBrowserE2E] ${msg}`) }

function killTree(child) {
  if (!child || child.killed) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try { child.kill('SIGTERM') } catch { /* 이미 종료됨 — 무시 */ }
  }
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return true
    } catch { /* 아직 준비 안 됨 — 재시도 */ }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

async function main() {
  // ── 1) build 산출물 확인 ─────────────────────────────────────────────
  const distIndex = path.join(ROOT, 'dist', 'index.html')
  if (!fs.existsSync(distIndex)) {
    log('dist/index.html 없음 — npm run build 실행')
    const res = spawnSync(npmCmd, ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    if (res.status !== 0) {
      console.error('FAIL — npm run build 실패, browser E2E를 실행할 수 없습니다.')
      process.exit(1)
    }
  } else {
    log('dist/index.html 존재 — 기존 build 산출물 재사용(재빌드 생략)')
  }

  // ── 2) Playwright chromium 가용성 확인(SKIP/FAIL 분기가 preview 서버
  //      기동보다 먼저 와야 브라우저 없는 로컬 환경에서 불필요하게 서버를
  //      띄웠다 죽이는 낭비가 없다) ─────────────────────────────────────
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch (err) {
    console.error('FAIL — playwright 패키지를 불러올 수 없습니다:', err?.message || err)
    process.exit(1)
  }

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (err) {
    if (process.env.E2E_SKIP_IF_NO_BROWSER === '1') {
      log('SKIP — Playwright chromium 브라우저가 설치되어 있지 않습니다(E2E_SKIP_IF_NO_BROWSER=1).')
      log(`  (${err?.message || err})`)
      log('  로컬에서 실행하려면: npx playwright install chromium')
      process.exit(0)
    }
    console.error('FAIL — Playwright chromium 브라우저를 실행할 수 없습니다(fail-closed, CI 기본 동작).')
    console.error(`  ${err?.message || err}`)
    console.error('  로컬에서 이 실패를 건너뛰려면 E2E_SKIP_IF_NO_BROWSER=1을 설정하거나, npx playwright install chromium을 실행하세요.')
    process.exit(1)
  }

  // ── 3) vite preview 기동 ─────────────────────────────────────────────
  log(`vite preview 기동 중 (포트 ${PORT})...`)
  const preview = spawn(npmCmd, ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  })
  let previewOutput = ''
  preview.stdout.on('data', (d) => { previewOutput += d.toString() })
  preview.stderr.on('data', (d) => { previewOutput += d.toString() })

  const allResults = []
  const specSummaries = []

  try {
    const ready = await waitForServer(BASE_URL)
    if (!ready) {
      console.error('FAIL — vite preview 서버가 준비되지 않았습니다(타임아웃).')
      console.error(previewOutput.split('\n').slice(-40).join('\n'))
      process.exit(1)
    }
    log(`preview 서버 준비 완료 — ${BASE_URL}`)

    const specs = [
      { name: '[student]', modulePath: '../tests/e2e/student.spec.mjs' },
      { name: '[admin]', modulePath: '../tests/e2e/admin.spec.mjs' },
    ]

    for (const spec of specs) {
      log(`${spec.name} 시나리오 실행 중...`)
      const mod = await import(spec.modulePath)
      let outcome
      try {
        outcome = await mod.run(browser, BASE_URL)
      } catch (err) {
        console.error(`${spec.name} 실행 중 예외 발생:`, err?.stack || err)
        allResults.push({ name: `${spec.name} 시나리오 실행 완료(예외 없음)`, status: 'FAIL', detail: String(err?.message || err) })
        continue
      }
      allResults.push(...outcome.results)
      const unmocked = outcome.unmockedRequests || []
      const mockErrors = outcome.mockErrors || []
      allResults.push({
        name: `${spec.name} 실제 Supabase/Vercel로 나간 미mock 요청 0건(fail-closed 가드)`,
        status: unmocked.length === 0 ? 'PASS' : 'FAIL',
        detail: unmocked.length ? JSON.stringify(unmocked.slice(0, 5)) : '',
      })
      allResults.push({
        name: `${spec.name} PostgREST mock 내부 오류(미지원 쿼리 등) 0건`,
        status: mockErrors.length === 0 ? 'PASS' : 'FAIL',
        detail: mockErrors.length ? JSON.stringify(mockErrors.slice(0, 5)) : '',
      })
      specSummaries.push({ name: spec.name, unmockedCount: unmocked.length, errorCount: mockErrors.length })
    }
  } finally {
    await browser.close().catch(() => {})
    killTree(preview)
  }

  console.log(`\n${'='.repeat(60)}`)
  const pass = allResults.filter((r) => r.status === 'PASS').length
  const fail = allResults.filter((r) => r.status === 'FAIL').length
  const skip = allResults.filter((r) => r.status === 'SKIP').length
  for (const r of allResults) {
    if (r.status === 'FAIL') console.log(`  FAIL  ${r.name}${r.detail ? '  ' + r.detail : ''}`)
  }
  console.log(`총 ${allResults.length}단언 — PASS ${pass} / FAIL ${fail} / SKIP ${skip}`)
  for (const s of specSummaries) {
    console.log(`  ${s.name} 미mock 요청 ${s.unmockedCount}건 / mock 내부 오류 ${s.errorCount}건`)
  }
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('FAIL — testBrowserE2E 러너 자체가 예외로 종료됨:', err?.stack || err)
  process.exit(1)
})
