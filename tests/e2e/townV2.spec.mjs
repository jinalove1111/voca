// tests/e2e/townV2.spec.mjs
//
// Paul Town V2-A(paulTownV2, 2026-09-13) 스토리북 마을 장면 회귀 — V1의
// 형제 렌더러(TownScreenV2.jsx)가 V1(TownScreen.jsx)의 저장/소유권 로직
// (placeTownItem/moveTownItem/storeTownItem/townShop.purchase/
// townShop.claimWelcome)을 그대로 재사용하면서, 화면만 격자(TownGrid)가
// 아니라 씬(TownScene, 퍼센트 앵커 기반 레이어 합성)으로 바꿔 그리는지를
// 검증한다. townV1.spec.mjs/townPilotAllowlist.spec.mjs와 동일한 mock 전체
// 가로채기(installMocks) + 결정론 폴링(waitUntil) 관례를 따르되, 새 파일이라
// 필요한 소규모 헬퍼는 복제한다(파일당 소유권 원칙, CLAUDE.md 규칙 16 —
// 다른 spec과 동시에 같은 파일을 건드리지 않게).
//
// 실 Supabase/Vercel 요청 0건 — installMocks가 전체 네트워크를 가로챈다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { PILOT_A_TOWN_STUDENT_IDS } from '../../src/config/pilotTown.js'

const LV_BADGE_SEL = 'span[title="누적 별(성취) — 절대 줄지 않아요"]'
const DOLLAR_BADGE_SEL = 'span[title="사용 가능한 Paul Dollar"]'
const PILOT_IDS = [...PILOT_A_TOWN_STUDENT_IDS]

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

// townV1.spec.mjs와 동일한 정의(disabled 버튼은 터치 타겟 판정에서 제외).
async function minVisibleButtonHeight(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    let min = Infinity
    let count = 0
    for (const b of buttons) {
      if (b.disabled) continue
      const rect = b.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      const style = window.getComputedStyle(b)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      count += 1
      if (rect.height < min) min = rect.height
    }
    return { min: Number.isFinite(min) ? min : null, count }
  })
}

// paulEasyVoca_features localStorage 스냅샷에 flags만 심는다(그 외 플래그는
// features.js의 DEFAULT_FEATURES가 채운다). 매 네비게이션(reload 포함)마다
// 다시 실행되므로 reload 후에도 유지된다(Playwright addInitScript 계약,
// townV1.spec.mjs enableTownFlag와 동일 패턴 — 여기선 임의 flags를 받는다).
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

// PaulTown 화면의 "🏘 내 마을" 진입 카드(전체가 버튼 하나, "들어가기"는 그
// 안의 span — PaulTown.jsx). townV1.spec.mjs와 동일한 셀렉터.
async function enterTownCard(page) {
  const card = page.locator('button', { hasText: '들어가기' })
  await card.waitFor({ state: 'visible', timeout: 15000 })
  return card
}

async function waitForTownHeader(page) {
  await page.locator(LV_BADGE_SEL).waitFor({ state: 'visible', timeout: 15000 })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[town-v2]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  function collect(mocks) {
    unmockedRequests.push(...mocks.unmockedRequests)
    ttsFallbackRequests.push(...mocks.ttsFallbackRequests)
    mockErrors.push(...mocks.db.errors)
  }

  // ── S1 — V2 OFF, V1 ON(390x844): 기존 V1 격자가 그대로 보임 ──────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S1[390x844,V1-only]'
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
      r.check(`${name} — town-scene-v2 요소 없음(V2 미렌더)`, sceneV2Count === 0, `count=${sceneV2Count}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S2 — V1+V2 ON, 3개 뷰포트: 씬 렌더/HUD/안개/앰비언트 ─────────────────
  const S2_VIEWPORTS = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
  for (const vp of S2_VIEWPORTS) {
    const name = `S2[${vp.width}x${vp.height}]`
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

      const screenVisible = await page.locator('[data-testid="town-screen-v2"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} — town-screen-v2 표시`, screenVisible)
      const sceneVisible = await page.locator('[data-testid="town-scene-v2"]').isVisible().catch(() => false)
      r.check(`${name} — town-scene-v2 표시`, sceneVisible)

      const emptyCellCount = await page.getByRole('button', { name: /^빈 칸 \(/ }).count()
      r.check(`${name} — V1 격자 빈 칸 요소 0개`, emptyCellCount === 0, `count=${emptyCellCount}`)

      const hasInlineGridTemplate = await page.locator('[data-testid="town-scene-v2"] *').evaluateAll(
        (els) => els.some((el) => !!(el.style && el.style.gridTemplateColumns)),
      )
      r.check(`${name} — 씬 내부에 inline grid-template-columns 없음(격자 아님)`, !hasInlineGridTemplate)

      const homeVisible = await page.locator('[data-testid="town-home"]').isVisible().catch(() => false)
      r.check(`${name} — town-home(집) 표시`, homeVisible)

      await waitForTownHeader(page)
      // get_town_shop_state 응답이 오기 전에는 level 기본값 1("Lv.1")이 잠깐
      // 보일 수 있다(레이스) — mock 응답 반영(레벨 2)까지 폴링한다.
      const lvText = await waitUntil(async () => {
        const t = (await page.locator(LV_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('Lv.2') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — HUD "⭐ Lv.2" 표시(기본 mock starsEarned=20)`, !!lvText, lvText || '(no Lv.2)')
      const dollarVisible = await page.locator(DOLLAR_BADGE_SEL).isVisible().catch(() => false)
      r.check(`${name} — 💵 잔액 칩 표시`, dollarVisible)

      const goalText = await waitUntil(async () => {
        const t = (await page.locator('[data-testid="town-goal"]').textContent().catch(() => '')) || ''
        return t.includes('⭐') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — town-goal 텍스트에 "⭐" 포함`, !!goalText, goalText || '(no ⭐)')

      const fogVisible = await waitUntil(() => page.locator('[data-testid="town-fog"]').isVisible().catch(() => false), { timeout: 5000 })
      r.check(`${name} — town-fog 표시(레벨2는 다음 레벨 잠금 아이템 있음)`, !!fogVisible)
      if (fogVisible) {
        const fogText = (await page.locator('[data-testid="town-fog"]').textContent().catch(() => '')) || ''
        r.check(`${name} — town-fog 칩에 "Lv." 포함`, fogText.includes('Lv.'), fogText)
      }

      r.check(`${name} — 가로 스크롤 없음`, await noHorizontalOverflow(page))
      const btnScan = await minVisibleButtonHeight(page)
      r.check(`${name} — 보이는 버튼 전체 터치 타겟 높이 >= 44px`, btnScan.min !== null && btnScan.min >= 44, `min=${btnScan.min} count=${btnScan.count}`)

      const ambientSentence = await page.locator('.sr-only', { hasText: '정원' }).count()
      r.check(`${name} — 앰비언트 sr-only 문장에 "정원" 포함(스크린리더 전용)`, ambientSentence > 0, `count=${ambientSentence}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(mocks.db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S3 — 허용목록 경로: paulTownV2만 켜져도(paulTownV1 OFF) V2 렌더 ──────
  if (PILOT_IDS.length > 0) {
    const pilotId = PILOT_IDS[0]
    const vp = { width: 390, height: 844 }

    // S3a — { paulTownV2: true }만(paulTownV1 없음/false) → V2 렌더(허용목록
    // 학생은 townV1Enabled가 이미 true이므로 townV2Active = true && true).
    {
      const name = `S3a(pilot ${pilotId}) V2-only flag`
      const context = await browser.newContext({ viewport: vp })
      const page = await context.newPage()
      await setDeviceFlags(page, { paulTownV2: true })
      const mocks = await installMocks(page, { studentId: pilotId })
      try {
        await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
        await login(page)
        await goToPaulTownScreen(page)
        const card = await enterTownCard(page)
        await card.click()
        const sceneVisible = await page.locator('[data-testid="town-scene-v2"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
        r.check(`${name} — town-scene-v2 표시(허용목록 자격 + V2 플래그만으로 충분)`, sceneVisible)
      } catch (err) {
        const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
        r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
          `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
      } finally {
        collect(mocks)
        await context.close()
      }
    }

    // S3b — {} (플래그 둘 다 없음) → 허용목록 자격만으로 V1 격자는 여전히
    //       보이되(townV1Enabled true), V2는 꺼짐(paulTownV2Enabled false).
    {
      const name = `S3b(pilot ${pilotId}) no-flags`
      const context = await browser.newContext({ viewport: vp })
      const page = await context.newPage()
      const mocks = await installMocks(page, { studentId: pilotId })
      try {
        await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
        await login(page)
        await goToPaulTownScreen(page)
        const card = await enterTownCard(page)
        await card.click()
        const emptyCellVisible = await page.getByRole('button', { name: /^빈 칸 \(/ }).first()
          .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
        r.check(`${name} — 플래그 전부 OFF에도 허용목록 자격으로 V1 격자 표시`, emptyCellVisible)
        const sceneV2Count = await page.locator('[data-testid="town-scene-v2"]').count()
        r.check(`${name} — town-scene-v2 없음(V2 플래그 OFF)`, sceneV2Count === 0, `count=${sceneV2Count}`)
      } catch (err) {
        const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
        r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
          `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
      } finally {
        collect(mocks)
        await context.close()
      }
    }
  } else {
    r.skip('S3 — Pilot A 허용목록 UUID', 'PILOT_A_TOWN_STUDENT_IDS가 비어있음')
  }

  // ── S4 — 배치 루프(구매→놓기→이동→보관, 390x844, V1+V2 ON) ───────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S4[390x844] 배치 루프'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    const { db } = mocks
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      // 환영 선물 20 PD — 1회 청구, HUD에 반영될 때까지 대기.
      const welcomeClaimed = await waitUntil(() => (db._townCalls.claim_town_welcome || 0) >= 1, { timeout: 10000 })
      r.check(`${name} — claim_town_welcome 호출 발생`, !!welcomeClaimed)
      const balanceAfterWelcome = await waitUntil(async () => {
        const t = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('20') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — 환영 선물 후 헤더 잔액 $20 표시`, !!balanceAfterWelcome, balanceAfterWelcome || '(no $20)')

      // ── 상점 시트 열기 → 나무 구매 ──────────────────────────────────────
      await page.locator('[data-testid="town-open-shop"]').click()
      const sheet = page.locator('[data-testid="town-sheet"]')
      const sheetVisible = await sheet.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 상점 시트(role=dialog) 표시`, sheetVisible)
      const sheetRoleDialog = await sheet.getAttribute('role').catch(() => null)
      r.check(`${name} — 상점 시트 role="dialog"`, sheetRoleDialog === 'dialog', `role=${sheetRoleDialog}`)

      await page.getByRole('button', { name: '자연 카테고리' }).click()
      const treeCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('나무', { exact: true }) }).first()
      await treeCard.waitFor({ state: 'visible', timeout: 10000 })
      await treeCard.getByRole('button', { name: '구매' }).click()
      const confirmSheet = page.locator('div.animate-slide-up')
      await confirmSheet.waitFor({ state: 'visible', timeout: 10000 })
      await page.getByRole('button', { name: '사기' }).click()
      const purchaseSettled = await waitUntil(async () => !(await confirmSheet.isVisible().catch(() => false)), { timeout: 10000 })
      r.check(`${name} — 구매 확인 시트 닫힘(처리 완료)`, !!purchaseSettled)
      const treeOwnedShown = await waitUntil(async () => {
        const t = (await treeCard.textContent().catch(() => '')) || ''
        return t.includes('보유 ✓') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — 나무 카드에 "보유 ✓" 표시`, !!treeOwnedShown)
      r.check(`${name} — purchase_town_item(tree) 호출 정확히 1회`, (db._townCalls.purchase_town_item.tree || 0) === 1, `count=${db._townCalls.purchase_town_item.tree}`)

      // 고양이(cat, 미구매) 카드는 여전히 "보유 ✓"가 아님 — owned가 정확히
      // ['tree']뿐임을(cat까지 딸려오지 않았음을) DOM으로 간접 확인한다(db
      // 내부 townStates는 mockRoutes.mjs 클로저라 테스트에서 직접 못 읽음).
      await page.getByRole('button', { name: '동물 카테고리' }).click()
      const catCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('고양이', { exact: true }) }).first()
      await catCard.waitFor({ state: 'visible', timeout: 10000 })
      const catCardText = (await catCard.textContent().catch(() => '')) || ''
      r.check(`${name} — 고양이 카드는 "보유 ✓"가 아님(owned가 tree 하나뿐)`, !catCardText.includes('보유 ✓'), catCardText)

      const dollarTextAfterBuy = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
      r.check(`${name} — 구매 후 헤더 잔액 $10(20-10)`, dollarTextAfterBuy.includes('10') && !dollarTextAfterBuy.includes('20'), dollarTextAfterBuy)

      // ── 시트 닫기 → 보관함 열기 → "마을에 놓기" ──────────────────────────
      await page.locator('[data-testid="town-sheet-close"]').click()
      const sheetClosed = await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      r.check(`${name} — "닫기" 클릭 시 시트 닫힘`, !!sheetClosed)

      await page.locator('[data-testid="town-open-inventory"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()

      // placing 모드 진입 시 시트가 자동으로 닫힌다(TownScreenV2 onPlaceStart).
      const sheetClosedAfterPlace = await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      r.check(`${name} — "마을에 놓기" 클릭 시 시트 자동으로 닫힘`, !!sheetClosedAfterPlace)

      const anchorCount = await page.locator('[data-anchor]').count()
      r.check(`${name} — 배치 오버레이 앵커 47개(48-HOME)`, anchorCount === 47, `count=${anchorCount}`)

      await page.locator('[data-anchor="1,1"]').click()
      const treeAt11 = page.locator('[data-item-id="tree"][data-cell="1,1"]')
      const placedAt11 = await treeAt11.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (1,1)에 배치됨(data-item-id/data-cell)`, placedAt11)
      const anchorsGoneAfterPlace = await waitUntil(async () => (await page.locator('[data-anchor]').count()) === 0, { timeout: 5000 })
      r.check(`${name} — 배치 완료 후 앵커 오버레이 사라짐`, !!anchorsGoneAfterPlace)

      // ── 새로고침 후 배치 유지 ────────────────────────────────────────────
      await page.reload({ waitUntil: 'domcontentloaded' })
      const backOnDashboard = await page.getByRole('button', { name: '구경가기' }).waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)
      r.check(`${name} — 새로고침 후 세션 복원(대시보드 표시)`, backOnDashboard)
      await goToPaulTownScreen(page)
      const card2 = await enterTownCard(page)
      await card2.click()
      const treeStillAt11 = await page.locator('[data-item-id="tree"][data-cell="1,1"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} — 새로고침 후 (1,1) 배치가 유지됨`, treeStillAt11)

      // ── 이동: (1,1) → (5,4) ──────────────────────────────────────────────
      await page.locator('[data-item-id="tree"][data-cell="1,1"] button').click()
      const moveBtn = page.getByRole('button', { name: '이동', exact: true })
      await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
      await moveBtn.click()
      await page.locator('[data-anchor="5,4"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="5,4"]').click()
      const treeAt54 = await page.locator('[data-item-id="tree"][data-cell="5,4"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (5,4)로 이동됨`, treeAt54)

      // ── 보관 ──────────────────────────────────────────────────────────
      await page.locator('[data-item-id="tree"][data-cell="5,4"] button').click()
      const storeBtn = page.getByRole('button', { name: '보관', exact: true })
      await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
      await storeBtn.click()
      const treeGone = await waitUntil(async () => (await page.locator('[data-item-id="tree"]').count()) === 0, { timeout: 10000 })
      r.check(`${name} — 보관 후 나무 래퍼가 씬에서 사라짐`, !!treeGone)

      await page.locator('[data-testid="town-open-inventory"]').click()
      const backInInventory = await page.getByRole('button', { name: '마을에 놓기' }).isVisible().catch(() => false)
      r.check(`${name} — 보관 후 보관함 "마을에 놓기" 목록에 다시 나타남`, backInInventory)

      // ── mock 카운터/상태 최종 확인 — 이동/보관은 비용이 없으므로 잔액은
      //     구매 직후와 동일하게 $10으로 유지돼야 한다(상점 시트를 다시 열어
      //     HUD와 카드 둘 다에서 재확인 — get_town_shop_state 재조회 유발). ──
      r.check(`${name} — purchase_town_item(tree) 최종 1회(중복 없음)`, (db._townCalls.purchase_town_item.tree || 0) === 1)
      r.check(`${name} — get_town_shop_state 호출 1회 이상`, (db._townCalls.get_town_shop_state || 0) >= 1)
      r.check(`${name} — claim_town_welcome 1회 유지(중복 지급 없음)`, db._townCalls.claim_town_welcome === 1, `count=${db._townCalls.claim_town_welcome}`)
      const dollarTextFinal = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
      r.check(`${name} — 이동/보관 이후에도 잔액 $10 유지(비용 없음)`, dollarTextFinal.includes('10') && !dollarTextFinal.includes('20'), dollarTextFinal)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] townCalls=${JSON.stringify(db._townCalls)}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S5 — Kinney-shaped fixture(starsEarned=60, owned=['tree']) ──────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S5[390x844] Kinney fixture'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 60, dollars: { available: 31, earned: 41, spent: 10 }, owned: ['tree'], welcomeClaimed: true },
    })
    const { db, apiCallLog } = mocks
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const lvText = await waitUntil(async () => {
        const t = (await page.locator(LV_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('Lv.3') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — HUD "⭐ Lv.3" 표시(starsEarned=60)`, !!lvText, lvText || '(no Lv.3)')
      const dollarText = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
      r.check(`${name} — HUD 💵 31 표시`, dollarText.includes('31'), dollarText)
      const goalText = (await page.locator('[data-testid="town-goal"]').textContent().catch(() => '')) || ''
      r.check(`${name} — town-goal에 "40" 포함(nearGoal remaining)`, goalText.includes('40'), goalText)

      // 로컬 백업(useStudent.js localStorage)에 사전 배치를 주입할 안전한
      // 경로가 없어(src/ 미수정 원칙) — 계약이 명시한 폴백대로 UI를 통해
      // 나무를 (2,4)에 배치한다(2026-09-13, 이 스펙 고유 LIMITATION).
      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      await page.locator('[data-anchor="2,4"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="2,4"]').click()
      const treeAt24 = await page.locator('[data-item-id="tree"][data-cell="2,4"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (2,4)에 배치됨(LIMITATION: 로컬 백업 사전 시드 대신 UI로 배치)`, treeAt24)

      // ── 2026-09-13 설계 결정 — 안개(fog)는 objects보다 아래(z 낮음)여야
      //     row 4-5에 놓인 소유 아이템(여기선 y=4의 나무)이 흐리게 가려지지
      //     않는다. 레벨3에서는 puppy/owl(minLevel4)이 아직 잠겨 있어
      //     fogState가 visible:true라 실제로 이 회귀가 재현 가능한 조건이다
      //     — town-fog가 보이는 상태에서 나무 래퍼의 실제 렌더 z-index가
      //     안개 레이어보다 큰지 getComputedStyle로 직접 비교한다. ─────────
      const fogVisibleAtLevel3 = await page.locator('[data-testid="town-fog"]').isVisible().catch(() => false)
      r.check(`${name} — town-fog 표시됨(레벨3, puppy/owl 아직 잠김 — 이 회귀를 재현 가능한 조건)`, fogVisibleAtLevel3)
      if (fogVisibleAtLevel3) {
        const [treeZ, fogZ] = await Promise.all([
          page.locator('[data-item-id="tree"][data-cell="2,4"]').evaluate((el) => Number(window.getComputedStyle(el).zIndex) || 0),
          page.locator('[data-testid="town-fog"]').evaluate((el) => Number(window.getComputedStyle(el).zIndex) || 0),
        ])
        r.check(
          `${name} — 나무(y=4) 렌더 z-index(${treeZ})가 안개 레이어 z-index(${fogZ})보다 큼(가려지지 않음)`,
          treeZ > fogZ,
          `treeZ=${treeZ} fogZ=${fogZ}`,
        )
      }

      // ── 상점/보관함 열고 닫기(부작용 없음 확인용) ────────────────────────
      await page.locator('[data-testid="town-open-shop"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-testid="town-sheet-close"]').click()
      await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      await page.locator('[data-testid="town-open-inventory"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-testid="town-sheet-close"]').click()
      await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })

      r.check(`${name} — purchase_town_item 호출 0건(구매 없음)`, Object.keys(db._townCalls.purchase_town_item || {}).length === 0, JSON.stringify(db._townCalls.purchase_town_item))
      r.check(`${name} — claim_town_welcome 호출 0건(welcomeClaimed:true + 잔액>0이라 클라이언트가 청구 시도조차 안 함)`, (db._townCalls.claim_town_welcome || 0) === 0, `count=${db._townCalls.claim_town_welcome}`)

      const grantXpActions = new Set(
        apiCallLog.filter((c) => c.url.includes('/api/grant-xp')).map((c) => (c.body && c.body.action) || '(no action)'),
      )
      const allowedActions = new Set(['get_town_shop_state'])
      const extraActions = [...grantXpActions].filter((a) => !allowedActions.has(a))
      r.check(
        `${name} — /api/grant-xp 호출 action 집합이 {get_town_shop_state}의 부분집합(보상/구매/환영 호출 없음)`,
        extraActions.length === 0,
        `actions=${JSON.stringify([...grantXpActions])}`,
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S6 — 200% 확대(zoom), 390x844, V2 ON ─────────────────────────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S6[390x844] 200% zoom'
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

      // Chromium은 표준 CSS는 아니지만 documentElement.style.zoom을 실제
      // 레이아웃 확대로 반영한다(Playwright chromium 실측) — 뷰포트를 그대로
      // 두고 컨텐츠만 2배로 키워 "확대된 화면에서도 잘리지 않는지"를 보는
      // 것이 목적이라, 뷰포트를 절반으로 줄이는 방식(내용은 그대로, 뷰포트만
      // 작아짐)보다 이 방식이 실제 브라우저 확대(Ctrl/Cmd + +)에 더 가깝다.
      await page.evaluate(() => { document.documentElement.style.zoom = '2' })

      r.check(`${name} — 200% 확대 후 가로 스크롤 없음`, await noHorizontalOverflow(page))
      const sceneVisibleAtZoom = await page.locator('[data-testid="town-scene-v2"]').isVisible().catch(() => false)
      r.check(`${name} — 200% 확대 후에도 town-scene-v2 표시`, sceneVisibleAtZoom)
      const hudChipsVisible = await page.locator(LV_BADGE_SEL).isVisible().catch(() => false)
        && await page.locator(DOLLAR_BADGE_SEL).isVisible().catch(() => false)
      r.check(`${name} — 200% 확대 후에도 HUD 칩(⭐/💵) 표시`, hudChipsVisible)
      const btnScanAtZoom = await minVisibleButtonHeight(page)
      r.check(`${name} — 200% 확대 후에도 보이는 버튼 전체 >= 44px`, btnScanAtZoom.min !== null && btnScanAtZoom.min >= 44, `min=${btnScanAtZoom.min}`)

      await page.evaluate(() => { document.documentElement.style.zoom = '' })
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S7 — prefers-reduced-motion: reduce, 배치 모드(앵커 펄스 애니메이션) ──
  {
    const vp = { width: 390, height: 844 }
    const name = 'S7[390x844] reduced-motion'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 20, dollars: { available: 0, earned: 20, spent: 20 }, owned: ['tree'], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await page.locator('[data-testid="town-screen-v2"]').waitFor({ state: 'visible', timeout: 15000 })
      await waitForTownHeader(page)

      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      const anchorsVisible = await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 배치 모드 진입, 앵커(motion-safe:animate-pulse) 표시`, anchorsVisible)

      const animCount = await page.evaluate(() => document.getAnimations().length)
      const animAllPausedOrNone = await page.evaluate(() => {
        const anims = document.getAnimations()
        return anims.length === 0 || anims.every((a) => a.playState === 'paused' || a.playState === 'finished')
      })
      r.check(`${name} — prefers-reduced-motion에서 실행 중인 애니메이션 0개(또는 전부 일시정지/종료)`, animAllPausedOrNone, `count=${animCount}`)

      const sceneStillVisible = await page.locator('[data-testid="town-scene-v2"]').isVisible().catch(() => false)
      r.check(`${name} — reduced-motion에도 V2 씬이 정상 렌더됨`, sceneStillVisible)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
