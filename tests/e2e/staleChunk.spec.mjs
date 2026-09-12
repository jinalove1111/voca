// tests/e2e/staleChunk.spec.mjs — 2026-09-12 P1 stale lazy chunk 자동 복구
// 브라우저 통합 회귀. student.spec.mjs/townV1.spec.mjs와 동일한 mock 전체
// 가로채기(installMocks) + login 헬퍼 패턴을 재사용한다. 실제 Supabase/
// Vercel 요청 0건은 그 mock이 이미 보장(unmockedRequests 가드는 러너
// (scripts/testBrowserE2E.mjs)가 spec 결과에 자동으로 덧붙인다).
//
// 시나리오: 대시보드의 "구경가기"(onGo('paulTown'))를 누르면 React.lazy가
// PaulTown 청크를 동적 import한다. 그 청크 요청만 골라 abort시켜 배포 후
// stale 청크 404를 재현한다(src/utils/staleChunkRecovery.js 헤더 주석의
// 사고 시나리오 그대로).
//   1) 첫 요청만 실패 → AppErrorBoundary가 잡아 자동 새로고침 정확히 1회 →
//      새로고침 후에는 세션이 유지된 채(재로그인 불필요) 앱이 정상 사용
//      가능(크래시 문구 없음), sessionStorage 가드 타임스탬프 기록.
//   2) 모든 요청이 항상 실패 → 자동 새로고침은 1회만 일어나고(60초 가드),
//      가드가 활성인 동안 재발생한 크래시는 "새 버전으로 업데이트" 문구 +
//      "새로고침" 버튼을 보여준 채 멈춘다(두 번째 자동 새로고침 없음).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { STALE_CHUNK_GUARD_KEY } from '../../src/utils/staleChunkRecovery.js'

async function waitUntil(fn, { timeout = 15000, interval = 200 } = {}) {
  const start = Date.now()
  let last
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { last = await fn() } catch { last = undefined }
    if (last) return last
    if (Date.now() - start >= timeout) return last
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

async function login(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

async function goToPaulTownButton(page) {
  const btn = page.getByRole('button', { name: '구경가기' })
  await btn.waitFor({ state: 'visible', timeout: 20000 })
  return btn
}

export async function run(browser, baseURL) {
  const r = createRecorder('[stale-chunk]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  // ── 시나리오 1: 첫 청크 요청만 실패 → 자동 새로고침 정확히 1회 ─────────
  {
    const context = await browser.newContext()
    const page = await context.newPage()
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownButton(page)

      let chunkRequestCount = 0
      // installMocks의 catch-all(page.route('**/*'))보다 나중에 등록해야
      // Playwright가 이 더 구체적인 패턴을 먼저 매치시킨다(mockRoutes.mjs
      // 76행 주석과 동일한 "나중 등록 = 먼저 실행" 관례).
      await page.route('**/assets/PaulTown-*.js', async (route) => {
        chunkRequestCount += 1
        if (chunkRequestCount === 1) await route.abort('failed')
        else await route.continue()
      })

      let loadCount = 0
      page.on('load', () => { loadCount += 1 })

      await (await goToPaulTownButton(page)).click()

      const reloadedOnce = await waitUntil(() => loadCount === 1, { timeout: 15000, interval: 200 })
      r.check('S1 첫 청크 404 → AppErrorBoundary가 잡아 전체 새로고침 정확히 1회', reloadedOnce === true, `loadCount=${loadCount}`)

      const usableAfterReload = await waitUntil(async () => {
        const nameInput = await page.getByPlaceholder('이름 입력...').count()
        const dashboardBtn = await page.getByRole('button', { name: '구경가기' }).count()
        return nameInput > 0 || dashboardBtn > 0
      }, { timeout: 15000 })
      r.check('S1 새로고침 후 앱 사용 가능(재로그인 화면 또는 대시보드가 보임)', usableAfterReload === true)

      const crashTextCount = await page.getByText('앱 오류가 발생했어요').count()
      r.check('S1 새로고침 후 크래시 문구가 남아있지 않음', crashTextCount === 0, `count=${crashTextCount}`)

      const guardTs = await page.evaluate((key) => {
        try { return window.sessionStorage.getItem(key) } catch { return null }
      }, STALE_CHUNK_GUARD_KEY)
      r.check('S1 sessionStorage 가드 타임스탬프가 기록됨', !!guardTs && Number.isFinite(Number(guardTs)), String(guardTs))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [S1 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [S1 진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...u)
    ttsFallbackRequests.push(...t)
    mockErrors.push(...db.errors)
  }

  // ── 시나리오 2: 청크가 계속 실패 → 자동 새로고침은 60초 가드로 1회만,
  //    그 이후 재발생한 크래시는 stale 문구 + "새로고침" 버튼으로 멈춤 ──
  {
    const context = await browser.newContext()
    const page = await context.newPage()
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownButton(page)

      await page.route('**/assets/PaulTown-*.js', async (route) => { await route.abort('failed') })

      let loadCount = 0
      page.on('load', () => { loadCount += 1 })

      await (await goToPaulTownButton(page)).click()

      const firstAutoReload = await waitUntil(() => loadCount === 1, { timeout: 15000, interval: 200 })
      r.check('S2 항상 실패하는 청크에서도 자동 새로고침은 1회 발생', firstAutoReload === true, `loadCount=${loadCount}`)

      // 재로그인 없이 대시보드로 복귀 — 같은 버튼을 다시 눌러 청크 로드를
      // 재시도시킨다(여전히 실패하도록 mock 유지 중).
      await (await goToPaulTownButton(page)).click()

      const staleTextShown = await waitUntil(async () => (
        await page.getByText('앱이 새 버전으로 업데이트됐어요').count()
      ) > 0, { timeout: 15000 })
      r.check('S2 가드 활성 상태에서 재크래시 시 stale 안내 문구 노출', staleTextShown === true)

      const refreshButtonCount = await page.getByRole('button', { name: '새로고침' }).count()
      r.check('S2 "새로고침" 버튼이 노출됨', refreshButtonCount > 0, `count=${refreshButtonCount}`)

      r.check('S2 60초 가드가 두 번째 자동 새로고침을 막음(load 여전히 1회)', loadCount === 1, `loadCount=${loadCount}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [S2 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [S2 진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...u)
    ttsFallbackRequests.push(...t)
    mockErrors.push(...db.errors)
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
