// tests/e2e/townV2ArtworkPipeline.spec.mjs
//
// Paul Town V2-A "아트워크 드롭인 파이프라인 + V2-B 접근성/모바일 폴리시"
// (2026-09-13) 회귀 — 오늘 밤 커밋된 4개 변경을 실제 브라우저에서 검증한다:
// (1) src/assets/town/assetManifest.js(신규, 23개 P0 항목) + townScene.js의
//     gardenStageSprite() — 여기서는 순수 함수 자체가 아니라 그 결과를
//     소비하는 TownAmbientLayer.jsx가 TOWN_ASSETS 부재(오늘) 상태에서도
//     기존 화면을 조금도 바꾸지 않는지를 townV2.spec.mjs의 회귀 스위트가
//     이미 검증한다(town-scene-v2/HUD/앰비언트 sr-only 등) — 이 파일은
//     "V2 OFF면 V1이 그대로"라는 최소 회귀 가드만 다시 확인하고,
// (2) TownSheet.jsx의 Escape 닫기/배경 스크롤 잠금/포커스 이동·복원,
// (3) TownScreenV2.jsx/TownObjectLayer.jsx의 safe-area·toast/모드배너
//     aria-live·배치 aria-label "배치됨" 문구를 새로 검증한다.
//
// townV2.spec.mjs와 동일한 mock 전체 가로채기(installMocks) + 결정론
// 폴링(waitUntil) 관례를 따르되, 새 파일이라 필요한 소규모 헬퍼는
// 복제한다(파일당 소유권 원칙, CLAUDE.md 규칙 16 — townV2.spec.mjs와
// 동시에 같은 파일을 건드리지 않게).
//
// 실 Supabase/Vercel 요청 0건 — installMocks가 전체 네트워크를 가로챈다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'

const LV_BADGE_SEL = 'span[title="누적 별(성취) — 절대 줄지 않아요"]'
const DOLLAR_BADGE_SEL = 'span[title="사용 가능한 Paul Dollar"]'

async function waitUntil(fn, { timeout = 15000, interval = 150 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = await fn()
    if (v) return v
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  return false
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

// townV2.spec.mjs와 동일 관례 — 매 네비게이션(reload 포함)마다 다시
// 실행되므로 reload 후에도 유지된다(Playwright addInitScript 계약).
async function setDeviceFlags(page, flags) {
  await page.addInitScript((flagsJson) => {
    try { localStorage.setItem('paulEasyVoca_features', flagsJson) } catch { /* 무시 */ }
  }, JSON.stringify(flags))
}

async function login(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

async function goToPaulTownScreen(page) {
  const goBtn = page.getByRole('button', { name: '구경가기' })
  await goBtn.waitFor({ state: 'visible', timeout: 20000 })
  await goBtn.click()
}

async function enterTownCard(page) {
  const card = page.locator('button', { hasText: '들어가기' })
  await card.waitFor({ state: 'visible', timeout: 15000 })
  return card
}

async function waitForTownHeader(page) {
  await page.locator(LV_BADGE_SEL).waitFor({ state: 'visible', timeout: 15000 })
}

// townV2.spec.mjs S4와 동일한 구매 플로우(나무 구매) — 이 spec 고유
// 시나리오(배치 aria-label)를 위해 복제한다.
async function buyTree(page, r, name) {
  await page.locator('[data-testid="town-open-shop"]').click()
  await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: '자연 카테고리' }).click()
  const treeCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('나무', { exact: true }) }).first()
  await treeCard.waitFor({ state: 'visible', timeout: 10000 })
  await treeCard.getByRole('button', { name: '구매' }).click()
  const confirmSheet = page.locator('div.animate-slide-up')
  await confirmSheet.waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: '사기' }).click()
  const purchaseSettled = await waitUntil(async () => !(await confirmSheet.isVisible().catch(() => false)), { timeout: 10000 })
  r.check(`${name} — 구매 확인 시트 닫힘(처리 완료)`, !!purchaseSettled)
  await page.locator('[data-testid="town-sheet-close"]').click()
  await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[town-v2-artwork]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  function collect(mocks) {
    unmockedRequests.push(...mocks.unmockedRequests)
    ttsFallbackRequests.push(...mocks.ttsFallbackRequests)
    mockErrors.push(...mocks.db.errors)
  }

  // ── T1 — V2 OFF(paulTownV1만 true) → V1 격자 그대로(회귀 가드) ──────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'T1[390x844,V1-only]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const emptyCellVisible = await page.getByRole('button', { name: /^빈 칸 \(/ }).first()
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} — V1 격자 빈 칸(aria-label "빈 칸 (") 표시`, emptyCellVisible)

      const sceneV2Count = await page.locator('[data-testid="town-scene-v2"]').count()
      r.check(`${name} — town-scene-v2 요소 없음(V2 미렌더, paulTownV2 플래그 부재)`, sceneV2Count === 0, `count=${sceneV2Count}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── T2 — 바텀시트 Escape 닫기 ─────────────────────────────────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'T2[390x844] Escape 닫기'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      await page.locator('[data-testid="town-open-shop"]').click()
      const sheetVisible = await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 상점 시트 열림`, sheetVisible)

      await page.keyboard.press('Escape')
      const sheetGoneAfterEscape = await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      r.check(`${name} — Escape 키로 시트가 닫힘`, !!sheetGoneAfterEscape)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── T3 — 배경 스크롤 잠금(body overflow) ─────────────────────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'T3[390x844] 배경 스크롤 잠금'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const overflowBeforeOpen = await page.evaluate(() => document.body.style.overflow)
      r.check(`${name} — 시트 열기 전 body.style.overflow는 'hidden'이 아님`, overflowBeforeOpen !== 'hidden', JSON.stringify(overflowBeforeOpen))

      await page.locator('[data-testid="town-open-shop"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      const overflowWhileOpen = await page.evaluate(() => document.body.style.overflow)
      r.check(`${name} — 시트 열린 동안 body.style.overflow === 'hidden'`, overflowWhileOpen === 'hidden', overflowWhileOpen)

      await page.locator('[data-testid="town-sheet-close"]').click()
      await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      const overflowAfterClose = await page.evaluate(() => document.body.style.overflow)
      r.check(
        `${name} — 닫기 버튼으로 닫은 후 body.style.overflow가 열기 전 값으로 복원됨(hidden 아님)`,
        overflowAfterClose === overflowBeforeOpen && overflowAfterClose !== 'hidden',
        `before=${JSON.stringify(overflowBeforeOpen)} after=${JSON.stringify(overflowAfterClose)}`,
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── T4 — 포커스 이동(열릴 때 시트로) + 복원(닫힐 때 이전 요소로) ────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'T4[390x844] 포커스 이동/복원'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const openBtn = page.locator('[data-testid="town-open-shop"]')
      await openBtn.focus()
      const focusedBeforeOpen = await page.evaluate(() => document.activeElement === document.querySelector('[data-testid="town-open-shop"]'))
      r.check(`${name} — 시트 열기 전 상점 버튼에 포커스가 있음(사전 조건)`, focusedBeforeOpen)

      await openBtn.click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      const focusInsideSheet = await waitUntil(() => page.evaluate(() => {
        const sheet = document.querySelector('[data-testid="town-sheet"]')
        return !!sheet && sheet.contains(document.activeElement)
      }), { timeout: 5000 })
      r.check(`${name} — 시트가 열리면 포커스가 시트 내부로 이동함`, !!focusInsideSheet)

      await page.locator('[data-testid="town-sheet-close"]').click()
      await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      const focusNotOnBody = await page.evaluate(() => document.activeElement !== document.body)
      r.check(`${name} — 시트가 닫히면 포커스가 document.body로 방치되지 않음`, focusNotOnBody)
      const focusReturnedToOpenBtn = await page.evaluate(() => document.activeElement === document.querySelector('[data-testid="town-open-shop"]'))
      console.log(`  [진단] ${name} — 닫힘 후 activeElement가 상점 버튼과 일치? ${focusReturnedToOpenBtn}`)
      r.check(`${name} — 시트가 닫히면 포커스가 열기 전 상점 버튼으로 복원됨`, focusReturnedToOpenBtn)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── T5 — 가로 스크롤 없음(모바일 3종 뷰포트, safe-area 패딩 확인) ───────
  {
    const T5_VIEWPORTS = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
    for (const vp of T5_VIEWPORTS) {
      const name = `T5[${vp.width}x${vp.height}] 가로 스크롤 없음`
      const context = await browser.newContext({ viewport: vp })
      const page = await context.newPage()
      await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
      const mocks = await installMocks(page)
      try {
        await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
        await login(page)
        await goToPaulTownScreen(page)
        const card = await enterTownCard(page)
        await card.click()
        await page.locator('[data-testid="town-screen-v2"]').waitFor({ state: 'visible', timeout: 15000 })
        await waitForTownHeader(page)

        r.check(`${name} — scrollWidth <= innerWidth`, await noHorizontalOverflow(page))
      } catch (err) {
        const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
        r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
          `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
      } finally {
        collect(mocks)
        await context.close()
      }
    }
  }

  // ── T6 — 배치 aria-label에 "배치됨" 문구 반영 ────────────────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'T6[390x844] 배치 aria-label'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      // 환영 선물 20 PD 지급까지 대기(구매에 필요한 잔액 확보).
      await waitUntil(async () => {
        const t = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('20') ? t : false
      }, { timeout: 10000 })

      await buyTree(page, r, name)

      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      await page.locator('[data-anchor="1,1"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="1,1"]').click()

      const placedButton = page.locator('[data-item-id="tree"][data-cell="1,1"] button')
      const placedVisible = await placedButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (1,1)에 배치됨`, placedVisible)

      const ariaLabel = await placedButton.getAttribute('aria-label').catch(() => null)
      r.check(`${name} — 배치된 아이템 버튼의 aria-label에 "배치됨" 포함`, !!ariaLabel && ariaLabel.includes('배치됨'), JSON.stringify(ariaLabel))
      r.check(
        `${name} — aria-label에 기존 안내 문구("눌러서 이동하거나 보관해요")도 함께 유지됨`,
        !!ariaLabel && ariaLabel.includes('눌러서 이동하거나 보관해요'),
        JSON.stringify(ariaLabel),
      )

      // 이동/보관 버튼 접근 가능한 이름 회귀 방지.
      //
      // 2026-09-13 — 최초 구현은 시각 텍스트("이동"/"보관")를 그대로 둔 채
      // aria-label="이동하기"/aria-label="보관하기"를 추가로 붙였다. WAI-ARIA
      // 접근 가능한 이름(accessible name) 계산 규칙상 aria-label이 있으면
      // 텍스트 콘텐츠보다 항상 우선하므로, 이 버튼들의 실제 접근 가능한
      // 이름이 "이동"/"보관"에서 "이동하기"/"보관하기"로 바뀌어 기존 회귀
      // 스위트 tests/e2e/townV2.spec.mjs S4(`getByRole('button', { name:
      // '이동', exact: true })`, 367/391행)가 FAIL하는 것을 이 세션이
      // verify:e2e 실행 중 직접 재현했다. 근본 수정: 그 aria-label 두 줄을
      // 제거해 접근 가능한 이름을 원래 시각 텍스트("이동"/"보관")로 되돌렸다
      // (src/components/town/v2/TownObjectLayer.jsx). 시각 텍스트 자체가
      // 이미 명확한 접근 가능한 이름이라 별도 aria-label은 불필요했다 —
      // 아래 단언은 그 수정이 유지되는지 고정한다.
      await placedButton.click()
      const moveBtn = page.getByRole('button', { name: '이동', exact: true })
      await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
      const moveAriaLabel = await moveBtn.getAttribute('aria-label').catch(() => null)
      r.check(`${name} — "이동" 버튼에 별도 aria-label 없음(시각 텍스트가 곧 접근 가능한 이름)`, moveAriaLabel === null, JSON.stringify(moveAriaLabel))
      const storeBtn = page.getByRole('button', { name: '보관', exact: true })
      await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
      const storeAriaLabel = await storeBtn.getAttribute('aria-label').catch(() => null)
      r.check(`${name} — "보관" 버튼에 별도 aria-label 없음(시각 텍스트가 곧 접근 가능한 이름)`, storeAriaLabel === null, JSON.stringify(storeAriaLabel))
      // 회귀 방지 고정 — 깨졌던 이름("이동하기"/"보관하기")으로는 더 이상
      // 아무 버튼도 찾히지 않아야 한다(원래 시각 텍스트 이름만 유효).
      const staleNameCount = await page.getByRole('button', { name: '이동하기', exact: true }).count()
      r.check(`${name} — 회귀 방지: "이동하기" 이름의 버튼 0개(원래 "이동"으로 복원됨)`, staleNameCount === 0, `count=${staleNameCount}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── T7 — prefers-reduced-motion 재확인(회귀 가드) ────────────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'T7[390x844] reduced-motion 재확인'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      const sceneVisible = await page.locator('[data-testid="town-scene-v2"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} — reduced-motion에도 town-scene-v2 렌더됨`, sceneVisible)
      await waitForTownHeader(page)

      const animAllPausedOrNone = await page.evaluate(() => {
        const anims = document.getAnimations()
        return anims.length === 0 || anims.every((a) => a.playState === 'paused' || a.playState === 'finished')
      })
      const animCount = await page.evaluate(() => document.getAnimations().length)
      r.check(`${name} — prefers-reduced-motion에서 실행 중인 애니메이션 0개(또는 전부 일시정지/종료)`, animAllPausedOrNone, `count=${animCount}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── T8 — 경제 격리: 시트 열고닫기/배치모드 토글만으로는 구매·환영청구
  //     호출이 늘지 않음 ──────────────────────────────────────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'T8[390x844] 경제 격리(구매/환영청구 부작용 없음)'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    // owned:['tree']+welcomeClaimed:true — 배치 모드 진입에 필요한 소유
    // 아이템은 fixture로 이미 확보해두고(이번 세션에서 구매 0건이어야
    // 한다는 계약을 지키기 위함), 환영 선물도 이미 청구된 상태로 시작해
    // claim_town_welcome이 마운트 시점에 재시도되지 않게 한다(townV2.spec
    // S5와 동일 패턴).
    const mocks = await installMocks(page, {
      townState: { starsEarned: 20, dollars: { available: 0, earned: 20, spent: 20 }, owned: ['tree'], welcomeClaimed: true },
    })
    const { db } = mocks
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      r.check(`${name} — 마운트 직후 claim_town_welcome 0회(welcomeClaimed:true라 시도 안 함)`, (db._townCalls.claim_town_welcome || 0) === 0, `count=${db._townCalls.claim_town_welcome}`)

      // 상점 시트 3회 열고 닫기(구매 없이).
      for (let i = 0; i < 3; i++) {
        await page.locator('[data-testid="town-open-shop"]').click()
        await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
        await page.locator('[data-testid="town-sheet-close"]').click()
        await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      }

      // 배치 모드 진입(이미 소유한 나무) → 취소(placing 모드 on → off,
      // 앵커를 클릭하지 않고 "취소" 버튼으로 나감 → 이동/배치 자체가
      // 일어나지 않음).
      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      const cancelBtn = page.getByRole('button', { name: '취소', exact: true })
      const placingModeVisible = await cancelBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — "마을에 놓기" 클릭 후 배치 모드(취소 배너) 진입`, placingModeVisible)
      await cancelBtn.click()
      const modeIdleAgain = await waitUntil(async () => !(await cancelBtn.isVisible().catch(() => false)), { timeout: 5000 })
      r.check(`${name} — "취소" 클릭으로 배치 모드 종료(토글 off)`, !!modeIdleAgain)

      // 보관함 시트도 다시 열고 닫기.
      await page.locator('[data-testid="town-open-inventory"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-testid="town-sheet-close"]').click()
      await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })

      r.check(
        `${name} — purchase_town_item 호출 0건(비어있음)`,
        Object.keys(db._townCalls.purchase_town_item || {}).length === 0,
        JSON.stringify(db._townCalls.purchase_town_item),
      )
      r.check(
        `${name} — claim_town_welcome 최종 0회(시트 열고닫기/배치토글만으로 늘지 않음)`,
        (db._townCalls.claim_town_welcome || 0) === 0,
        `count=${db._townCalls.claim_town_welcome}`,
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] townCalls=${JSON.stringify(db._townCalls)}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
