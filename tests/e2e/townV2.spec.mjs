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
import { writesTo } from './lib/postgrestMock.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID, buildFixtureTables } from './fixtures/index.mjs'
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
  // 2026-09-16 갱신 — 월드 지오메트리 확장(anchorFor/freeAnchors가 이제
  // level로 구역을 거른다) 이후, 기본 mock(starsEarned=20 -> 마을레벨2)로는
  // home 구역만 열려 있어(23칸) 이 시나리오가 이동 목적지로 쓰던 (5,4)
  // (square 구역)/(0,5)(river 구역)이 더 이상 배치 후보 앵커에 없다. 이
  // 시나리오의 실제 목적(구매→놓기→이동→마지막 행 클리핑 회귀→바깥 탭/
  // Escape 닫기→보관)은 좌표 자체가 아니라 "그 좌표가 유효한 배치 후보로
  // 열려 있는지"이므로, starsEarned를 800(마을레벨8, 전 구역 개방)으로
  // 올려 옛 좌표(앵커 47개 포함)를 그대로 재사용한다 — 환영 선물 조건
  // (owned:[] && available:0)과 welcomeClaimed:false는 그대로 유지해 위쪽
  // 환영 선물 단언들도 그대로 통과하도록 한다.
  {
    const vp = { width: 390, height: 844 }
    const name = 'S4[390x844] 배치 루프'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 800, dollars: { available: 0, earned: 0, spent: 0 }, owned: [], welcomeClaimed: false },
    })
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

      // ── 2026-09-15 — 구매 직후 "다음엔 마을에 놓아야 한다"는 것을 놓치기
      //     쉬운 문제의 최소 수정(V1과 동일 원리, V2는 HUD 보관함 버튼에
      //     배지). ────────────────────────────────────────────────────────
      const placeHintShownV2 = await page.getByText('보관함에서 마을에 놓아보세요', { exact: false }).first().isVisible().catch(() => false)
      r.check(`${name} 2026-09-15 — 구매 성공 안내 문구에 배치 유도 텍스트 포함("보관함에서 마을에 놓아보세요")`, placeHintShownV2)

      const hudInventoryBtn = page.locator('[data-testid="town-open-inventory"]')
      const hudInventoryAriaLabelAfterBuy = (await hudInventoryBtn.getAttribute('aria-label').catch(() => '')) || ''
      r.check(`${name} 2026-09-15 — 나무 구매 직후(미배치 1개) HUD 보관함 버튼 aria-label에 "1개" 포함`,
        hudInventoryAriaLabelAfterBuy.includes('1개'), hudInventoryAriaLabelAfterBuy)
      const hudInventoryBadgeTextAfterBuy = (await hudInventoryBtn.locator('span[aria-hidden="true"]').textContent().catch(() => '')) || ''
      r.check(`${name} 2026-09-15 — 나무 구매 직후 HUD 보관함 버튼 배지 숫자 "1" 표시`,
        hudInventoryBadgeTextAfterBuy.trim() === '1', hudInventoryBadgeTextAfterBuy)

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

      // ── 2026-09-15 — 배치 완료(유일한 보유 아이템을 마을에 놓음) 후 HUD
      //     보관함 버튼 배지가 사라짐(unplacedCount 0으로 파생). ───────────
      const hudInventoryAriaLabelAfterPlace = (await hudInventoryBtn.getAttribute('aria-label').catch(() => '')) || ''
      r.check(`${name} 2026-09-15 — 배치 완료 후 HUD 보관함 버튼 배지 사라짐(aria-label 기본값 복귀)`,
        !hudInventoryAriaLabelAfterPlace, hudInventoryAriaLabelAfterPlace)
      const hudInventoryBadgeCountAfterPlace = await hudInventoryBtn.locator('span[aria-hidden="true"]').count()
      r.check(`${name} 2026-09-15 — 배치 완료 후 HUD 보관함 버튼 배지 요소 자체가 사라짐(중복/유령 배지 없음)`,
        hudInventoryBadgeCountAfterPlace === 0, `count=${hudInventoryBadgeCountAfterPlace}`)

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

      // ── 클리핑 회귀 검사: 마지막 행(0,5)으로 한 번 더 이동 후, 그 칸의
      //     이동/보관 팝오버가 overflow-hidden인 씬 박스 밖으로 잘리지
      //     않는지 확인(2026-09-13 최종 리뷰 결함 — 팝오버가 항상
      //     아래(top-full)로만 열리면 마지막 행에서는 씬 밖으로 나가
      //     잘려서 이동/보관을 누를 수 없었다). ──────────────────────────
      await page.locator('[data-item-id="tree"][data-cell="5,4"] button').click()
      const moveBtnToLastRow = page.getByRole('button', { name: '이동', exact: true })
      await moveBtnToLastRow.waitFor({ state: 'visible', timeout: 5000 })
      await moveBtnToLastRow.click()
      await page.locator('[data-anchor="0,5"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="0,5"]').click()
      const treeAt05 = page.locator('[data-item-id="tree"][data-cell="0,5"]')
      const placedAt05 = await treeAt05.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (0,5)로 이동됨(마지막 행)`, placedAt05)

      await page.locator('[data-item-id="tree"][data-cell="0,5"] button').click()
      const moveBtnLastRow = page.getByRole('button', { name: '이동', exact: true })
      const moveBtnLastRowVisible = await moveBtnLastRow.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} — 마지막 행(0,5) 팝오버의 "이동" 버튼이 보임(클리핑 안 됨)`, moveBtnLastRowVisible)

      const sceneBoxForClip = await page.locator('[data-testid="town-scene-v2"]').boundingBox()
      const moveBtnLastRowBox = await moveBtnLastRow.boundingBox()
      const moveBtnInsideScene = !!sceneBoxForClip && !!moveBtnLastRowBox &&
        moveBtnLastRowBox.x >= sceneBoxForClip.x &&
        moveBtnLastRowBox.y >= sceneBoxForClip.y &&
        (moveBtnLastRowBox.y + moveBtnLastRowBox.height) <= (sceneBoxForClip.y + sceneBoxForClip.height)
      r.check(
        `${name} — 마지막 행 팝오버 "이동" 버튼이 씬 박스 안에 완전히 들어옴(클리핑 회귀 방지)`,
        moveBtnInsideScene,
        JSON.stringify({ sceneBoxForClip, moveBtnLastRowBox }),
      )

      // ── 배치 팝오버 바깥 탭/Escape 닫기(2026-09-14, V2B_V2C_ROADMAP.md 1.3절) ──
      // 위에서 (0,5) 나무의 팝오버가 이미 열려 있는 상태 — 빈 공간(백드롭
      // 좌측 여백, HOME_CELL(3,2)·나무(0,5) 어디와도 겹치지 않는 좌표) 탭 시
      // 팝오버가 닫히는지 확인. (5,5)는 씬 박스의 rounded-[28px] 모서리
      // 곡선 안쪽이라 overflow-hidden에 의해 포인터 이벤트가 그 지점에서
      // 막혀 바깥 wrapper(<div class="max-w-lg mx-auto">)로 새는 현상을
      // 실측 확인 — (10,80)처럼 네 모서리 반경(28px)에서 충분히 벗어난
      // 좌표를 쓴다.
      const backdrop = page.locator('[data-testid="town-scene-backdrop"]')
      await backdrop.click({ position: { x: 10, y: 80 } })
      const closedByOutsideTap = await waitUntil(
        async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0,
        { timeout: 5000 },
      )
      r.check(`${name} — 빈 공간 탭 시 배치 팝오버가 닫힘(바깥 탭 닫기)`, !!closedByOutsideTap)
      r.check(
        `${name} — 바깥 탭으로 닫아도 나무는 그대로 (0,5)에 남음(배치 불변)`,
        (await page.locator('[data-item-id="tree"][data-cell="0,5"]').count()) === 1,
      )

      // 다시 열고 이번엔 Escape로 닫히는지 확인.
      await page.locator('[data-item-id="tree"][data-cell="0,5"] button').click()
      await page.getByRole('button', { name: '이동', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
      await page.keyboard.press('Escape')
      const closedByEscape = await waitUntil(
        async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0,
        { timeout: 5000 },
      )
      r.check(`${name} — Escape 키로 배치 팝오버가 닫힘`, !!closedByEscape)

      // 이어지는 보관 단계를 위해 팝오버를 다시 연다(아래 storeBtn이 이 팝오버를 사용).
      await page.locator('[data-item-id="tree"][data-cell="0,5"] button').click()
      await page.getByRole('button', { name: '보관', exact: true }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})

      // ── 보관(위에서 이미 열어둔 팝오버를 그대로 사용) ────────────────────
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
      // 나무를 배치한다(2026-09-13, 이 스펙 고유 LIMITATION). 2026-09-16
      // 갱신 — 월드 지오메트리 확장으로 (2,4)는 이제 'square' 구역(마을
      // 레벨5부터 개방)에 속해, 이 시나리오의 레벨3(starsEarned=60)에서는
      // 더 이상 유효한 배치 후보 앵커가 아니다(freeAnchors가 level로 거름).
      // (0,3)은 'lane' 구역(레벨3에 이미 열림)에 속한 칸으로 교체한다 —
      // SPOT_MAP은 townScene.js가 소유한 진실 원천이라 이 세션이 좌표를
      // 새로 발명하지 않고 그대로 조회했다.
      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      await page.locator('[data-anchor="0,3"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="0,3"]').click()
      const treeAt03 = await page.locator('[data-item-id="tree"][data-cell="0,3"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (0,3)에 배치됨(LIMITATION: 로컬 백업 사전 시드 대신 UI로 배치)`, treeAt03)

      // ── 2026-09-18 갱신(작업 지시서 STEP 7) — 2026-09-16 버전은 "안개
      //     컨테이너와 배치 아이템의 바운딩 박스가 겹치지 않는지"를 봤다.
      //     그 가정 자체가 이번 재작성으로 깨졌다: TownFogLayer.jsx는 이제
      //     구역 전체를 덮던 가로 밴드가 아니라, 잠긴 랜드마크마다 개별
      //     헤이즈 타원 + Lv.N 표지판을 그리는 컨테이너(className="absolute
      //     inset-0" — 씬 전체 크기, 그 "안"에 절대위치 자식들이 흩어져
      //     있음)라, data-testid="town-fog" 자체의 boundingBox()는 이제
      //     거의 항상 씬 전체 크기로 나온다(실측: {x:0,y:13,width:390,
      //     height:741}) — 컨테이너 바운딩 박스와 아이템 바운딩 박스의
      //     겹침 여부는 더 이상 "실제로 가려지는가"를 말해주지 않는다(항상
      //     겹친다고 나오지만 실제 시각적 가림과 무관). 더 강한 체크(리드
      //     지시)로 교체 — 나무 버튼의 실제 중심 좌표에서
      //     document.elementFromPoint()가 그 버튼(또는 자손)을 가리키는지
      //     (다른 요소가 그 지점에서 클릭/시각적으로 우선하지 않는지),
      //     그리고 버튼 자신의 computed opacity/filter가 그대로(헤이즈의
      //     LOCKED_FILTER/블러가 실수로 그 버튼에까지 번지지 않았는지)를
      //     직접 확인한다 — "가려지지 않는다"는 원래 의도를 z-index/바운딩
      //     박스 우연이 아니라 실제 렌더 결과로 검증한다.
      const fogVisibleAtLevel3 = await page.locator('[data-testid="town-fog"]').isVisible().catch(() => false)
      r.check(`${name} — town-fog 표시됨(레벨3, book-shop 등 아직 잠김 — 이 회귀를 재현 가능한 조건)`, fogVisibleAtLevel3)
      if (fogVisibleAtLevel3) {
        const treeButton = page.locator('[data-item-id="tree"][data-cell="0,3"] button')
        const occlusion = await treeButton.evaluate((btn) => {
          const rect = btn.getBoundingClientRect()
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          const topEl = document.elementFromPoint(cx, cy)
          const style = window.getComputedStyle(btn)
          return {
            hitsButtonOrDescendant: !!topEl && (topEl === btn || btn.contains(topEl)),
            opacity: style.opacity,
            filter: style.filter,
          }
        })
        r.check(
          `${name} — 나무(0,3) 버튼 중심점의 elementFromPoint가 그 버튼(또는 자손)을 가리킴(잠긴 랜드마크 헤이즈에 가려지지 않음)`,
          occlusion.hitsButtonOrDescendant,
          JSON.stringify(occlusion),
        )
        r.check(
          `${name} — 나무(0,3) 버튼 computed opacity가 그대로 1(헤이즈로 흐려지지 않음)`,
          occlusion.opacity === '1',
          `opacity=${occlusion.opacity}`,
        )
        r.check(
          `${name} — 나무(0,3) 버튼 computed filter가 none(헤이즈로 필터링되지 않음)`,
          occlusion.filter === 'none',
          `filter=${occlusion.filter}`,
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

  // ── S8 — D1 정정 회귀 방지: 고정 랜드마크(LOTS)는 자유 배치 대상이
  //        아니다(worldRender.isFixedLandmarkId, 2026-09-18 D1 정정 —
  //        이전 landmarkRenderSource 기반 S8은 전면 교체됐다). 레거시
  //        townPlacements(옛 8x6 시절 book-shop/cafe를 마을에 "배치"한
  //        기록)가 남아 있어도: 1) 고정 로트는 항상 하나만 그려지고
  //        (lotState만 보고 그림, 배치 데이터 무시), 2) 그 레거시 항목은
  //        배치된 사본으로도 보이지 않으며, 3) 보관함 자유 배치 목록/
  //        배치 후보 앵커 어디에도 나타나지 않는다 — 데이터 자체는
  //        지우거나 다시 쓰지 않는다(마이그레이션 없음, CLAUDE.md 규칙 9).
  {
    const vp = { width: 390, height: 844 }
    const name = 'S8a[390x844] D1 정정 — 레거시 배치된 고정 랜드마크는 뷰에서 걸러짐'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    // 레거시 배치 시드 — mockRoutes.mjs installMocks()의 tables 오버라이드로
    // student_progress.progress_data.townPlacements에 cafe/book-shop 항목을
    // 직접 심는다(useStudent.js fetchFullProgress()가 이 정확한 shape을
        // 읽는다, src/utils/wordLibrary.js:3209 fetchFullProgress 확인 완료) —
    // 로그인 시 로컬이 비어있으므로(새 브라우저 컨텍스트) 이 클라우드 백업이
    // 그대로 병합 복원된다(useStudent.js normalizeRecord 경로, 재구현 없음).
    const legacyPlacements = [
      { placementId: 'legacy-cafe-1', itemId: 'cafe', x: 2, y: 1, placedAt: 1, updatedAt: 1 },
      { placementId: 'legacy-bookshop-1', itemId: 'book-shop', x: 4, y: 3, placedAt: 1, updatedAt: 1 },
    ]
    const tables = {
      ...buildFixtureTables(),
      student_progress: [
        { student_id: QA_STUDENT_ID, progress_data: { townPlacements: legacyPlacements, townRemovedIds: [] } },
      ],
    }
    const mocks = await installMocks(page, {
      tables,
      townState: { starsEarned: 800, dollars: { available: 999, earned: 999, spent: 0 }, owned: ['book-shop', 'cafe', 'tree'], welcomeClaimed: true },
    })
    const { db } = mocks
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      // 레거시 배치가 클라우드 병합 복원으로 반영될 때까지 대기(cafe/
      // book-shop 둘 다 ownedIds에도 있으므로 visiblePlacements를 통과해
      // 일단 placements 배열에는 들어온다 — 이 화면이 그걸 어떻게
      // "보이지 않게" 거르는지가 이 시나리오의 핵심).
      await waitUntil(async () => (await page.locator('[data-lot-id="cafe"]').count()) > 0, { timeout: 10000 })

      // (f) 마을을 "열기만" 해도 student_progress에 새 쓰기가 없다(저장
      //     없음, 새 effect 없음) — 병합 복원 폴링 뒤 한 박자 더 대기.
      await page.waitForTimeout(500)
      const writesOnOpen = writesTo(db, 'student_progress').length
      r.check(`${name} — 마을을 열기만 해도 student_progress 쓰기 0건(저장 부작용 없음)`, writesOnOpen === 0, `writes=${writesOnOpen}`)

      // (a) cafe/book-shop 둘 다 — 아트 1개, 고정 로트 built 1개, 배치된
      //     사본 0개(레거시 배치가 자유 배치 사본으로 이중 렌더되지 않음).
      for (const id of ['cafe', 'book-shop']) {
        const imgCount = await page.locator(`img[data-asset-key="buildings/${id}"]`).count()
        r.check(`${name} — ${id} 아트 <img> 정확히 1개(레거시 배치가 있어도 중복 없음)`, imgCount === 1, `count=${imgCount}`)
        const lotCount = await page.locator(`[data-lot-id="${id}"][data-lot-state="built"]`).count()
        r.check(`${name} — ${id} 고정 로트(built) 정확히 1개`, lotCount === 1, `count=${lotCount}`)
        const placedCount = await page.locator(`[data-item-id="${id}"][data-cell]`).count()
        r.check(`${name} — ${id} 배치된 사본 0개(레거시 배치는 뷰에서 걸러짐, 데이터는 안 지움)`, placedCount === 0, `count=${placedCount}`)
      }

      // (b) 보관함에 카페/책방 "마을에 놓기" 카드가 없고, 나무는 여전히
      //     있음 — freeCatalog(TownScreenV2.jsx)가 isFixedLandmarkId로
      //     걸러낸 결과.
      await page.locator('[data-testid="town-open-inventory"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      const placeButtons = page.getByRole('button', { name: '마을에 놓기' })
      r.check(`${name} — 보관함 "마을에 놓기" 버튼이 정확히 1개(나무만, 카페/책방 제외)`, (await placeButtons.count()) === 1, `count=${await placeButtons.count()}`)
      const cafeCardCount = await page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('카페', { exact: true }) }).count()
      r.check(`${name} — 보관함에 카페 카드 없음`, cafeCardCount === 0, `count=${cafeCardCount}`)
      const bookCardCount = await page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('책방', { exact: true }) }).count()
      r.check(`${name} — 보관함에 책방 카드 없음`, bookCardCount === 0, `count=${bookCardCount}`)
      const treeCardVisible = await page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('나무', { exact: true }) }).first().isVisible().catch(() => false)
      r.check(`${name} — 보관함에 나무 카드는 여전히 보임`, treeCardVisible)

      // (c)+(d) 나무는 여전히 정상적으로 배치/이동/보관 가능하고(고정
      //     랜드마크 필터링이 일반 아이템 배치를 방해하지 않음), 레거시
      //     cafe/book-shop 칸은 배치 후보 앵커로 제공되지 않는다(점유
      //     판정은 occupancyPlacements, 즉 전체 목록 기준 — TownScene.jsx).
      await placeButtons.first().click()
      await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 })
      const anchorCount = await page.locator('[data-anchor]').count()
      r.check(`${name} — 배치 후보 앵커가 45개(47 - 레거시 점유 2칸)`, anchorCount === 45, `count=${anchorCount}`)
      const cafeAnchorOffered = await page.locator('[data-anchor="2,1"]').count()
      r.check(`${name} — 레거시 카페 칸(2,1)이 배치 후보 앵커로 제공되지 않음`, cafeAnchorOffered === 0, `count=${cafeAnchorOffered}`)
      const bookshopAnchorOffered = await page.locator('[data-anchor="4,3"]').count()
      r.check(`${name} — 레거시 책방 칸(4,3)이 배치 후보 앵커로 제공되지 않음`, bookshopAnchorOffered === 0, `count=${bookshopAnchorOffered}`)

      await page.locator('[data-anchor]').first().click()
      const treePlaced = await page.locator('[data-item-id="tree"][data-cell]').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 정상적으로 배치됨`, treePlaced)

      await page.locator('[data-item-id="tree"][data-cell] button').first().click()
      const moveBtn = page.getByRole('button', { name: '이동', exact: true })
      await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
      await moveBtn.click()
      const anotherAnchor = page.locator('[data-anchor]').first()
      await anotherAnchor.waitFor({ state: 'visible', timeout: 10000 })
      await anotherAnchor.click()
      const treeMoved = await page.locator('[data-item-id="tree"][data-cell]').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 정상적으로 이동됨`, treeMoved)

      await page.locator('[data-item-id="tree"][data-cell] button').first().click()
      const storeBtn = page.getByRole('button', { name: '보관', exact: true })
      await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
      await storeBtn.click()
      const treeStored = await waitUntil(async () => (await page.locator('[data-item-id="tree"]').count()) === 0, { timeout: 10000 })
      r.check(`${name} — 나무가 정상적으로 보관됨`, !!treeStored)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S8b — for-sale: 미소유 book-shop이 Lv4에서 for-sale 로트 1개 ─────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S8b[390x844] for-sale — book-shop 미소유 Lv4'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 100, dollars: { available: 0, earned: 0, spent: 0 }, owned: [], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const lvText = await waitUntil(async () => {
        const t = (await page.locator(LV_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('Lv.4') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — HUD "⭐ Lv.4" 표시(starsEarned=100)`, !!lvText, lvText || '(no Lv.4)')

      const forSaleCount = await page.locator('[data-lot-id="book-shop"][data-lot-state="for-sale"]').count()
      r.check(`${name} — book-shop 로트가 for-sale 상태로 정확히 1개`, forSaleCount === 1, `count=${forSaleCount}`)
      const builtCount = await page.locator('[data-lot-id="book-shop"][data-lot-state="built"]').count()
      r.check(`${name} — book-shop built 로트는 0개(미소유)`, builtCount === 0, `count=${builtCount}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S9 — D5 회귀 방지: 배치 모드 44px 탭 컨트롤이 좁은 화면에서도
  //        서로 겹치지 않고 전부 탭 가능함(layoutPlacementControls,
  //        2026-09-18) ────────────────────────────────────────────────────
  const S9_VIEWPORTS = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
  for (const vp of S9_VIEWPORTS) {
    const name = `S9[${vp.width}x${vp.height}] D5 — 배치 앵커 탭 가능성`
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 800, dollars: { available: 0, earned: 0, spent: 0 }, owned: ['tree'], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 })

      const anchors = page.locator('[data-anchor]')
      const anchorCount = await anchors.count()
      const sceneLocator = page.locator('[data-testid="town-scene-v2"]')
      let minW = Infinity
      let minH = Infinity
      let insideCount = 0
      let hitCount = 0
      for (let i = 0; i < anchorCount; i++) {
        const el = anchors.nth(i)
        // elementFromPoint/boundingBox는 실제 스크롤 뷰포트 기준이라(씬
        // 전체가 뷰포트보다 클 수 있음), 검사 직전 이 앵커를 뷰 안으로
        // 스크롤한 "뒤" 앵커/씬 박스 둘 다 새로 측정한다(스크롤 전
        // 좌표를 쓰면 스크롤 위치 아티팩트로 false negative가 난다 —
        // "겹치지 않는다"는 제품 계약과 무관).
        await el.evaluate((btn) => btn.scrollIntoView({ block: 'center', inline: 'center' }))
        const box = await el.boundingBox()
        const sceneBox = await sceneLocator.boundingBox()
        if (!box) continue
        minW = Math.min(minW, box.width)
        minH = Math.min(minH, box.height)
        const inside = !!sceneBox &&
          box.x >= sceneBox.x - 0.5 && box.y >= sceneBox.y - 0.5 &&
          (box.x + box.width) <= (sceneBox.x + sceneBox.width + 0.5) &&
          (box.y + box.height) <= (sceneBox.y + sceneBox.height + 0.5)
        if (inside) insideCount++
        const hit = await el.evaluate((btn) => {
          const r2 = btn.getBoundingClientRect()
          const cx = r2.left + r2.width / 2
          const cy = r2.top + r2.height / 2
          const top = document.elementFromPoint(cx, cy)
          return !!top && (top === btn || btn.contains(top))
        })
        if (hit) hitCount++
      }
      console.log(`  [town-v2] ${name} — 앵커=${anchorCount} minBBox=${minW.toFixed(1)}x${minH.toFixed(1)} inside=${insideCount}/${anchorCount} elementFromPointHit=${hitCount}/${anchorCount}`)
      r.check(`${name} — 앵커 존재(${anchorCount}개) 및 모든 앵커 bbox >= 44x44`, anchorCount > 0 && minW >= 43.5 && minH >= 43.5, `count=${anchorCount} minW=${minW} minH=${minH}`)
      r.check(`${name} — 모든 앵커가 씬 경계 안(${insideCount}/${anchorCount})`, insideCount === anchorCount, `inside=${insideCount}/${anchorCount}`)
      r.check(`${name} — 모든 앵커에서 elementFromPoint가 자기 자신(또는 자손)을 가리킴(겹침 없음, ${hitCount}/${anchorCount})`, hitCount === anchorCount, `hit=${hitCount}/${anchorCount}`)

      if (vp.width === 360) {
        // 명명된 회귀 — '1,1'에 배치→보관→재진입 후 '7,3'을 키보드(Enter)로
        // 활성화해도 정확히 그 칸에 배치되는지(포인터로 클릭한 컨트롤이
        // 실제로는 다른 앵커의 것으로 뒤바뀌지 않았는지의 반증) + 팝오버가
        // 씬 밖으로 잘리지 않는지 + Escape/백드롭 닫기 + 포커스 복귀.
        await page.locator('[data-anchor="1,1"]').click()
        const treeAt11 = await page.locator('[data-item-id="tree"][data-cell="1,1"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
        r.check(`${name} — '1,1' 앵커 클릭 시 나무가 정확히 (1,1)에 배치됨`, treeAt11)

        await page.locator('[data-item-id="tree"][data-cell="1,1"] button').click()
        const storeBtn = page.getByRole('button', { name: '보관', exact: true })
        await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
        await storeBtn.click()
        const stored = await waitUntil(async () => (await page.locator('[data-item-id="tree"]').count()) === 0, { timeout: 10000 })
        r.check(`${name} — 보관 후 나무가 씬에서 사라짐`, !!stored)

        await page.locator('[data-testid="town-open-inventory"]').click()
        const placeBtn2 = page.getByRole('button', { name: '마을에 놓기' })
        await placeBtn2.waitFor({ state: 'visible', timeout: 10000 })
        await placeBtn2.click()
        await page.locator('[data-anchor="7,3"]').waitFor({ state: 'visible', timeout: 10000 })
        await page.locator('[data-anchor="7,3"]').focus()
        await page.keyboard.press('Enter')
        const treeAt73 = await page.locator('[data-item-id="tree"][data-cell="7,3"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
        r.check(`${name} — '7,3' 앵커를 키보드(Enter)로 활성화해도 정확히 (7,3)에 배치됨`, treeAt73)

        const itemBtn = page.locator('[data-item-id="tree"][data-cell="7,3"] button')
        await itemBtn.click()
        const moveBtn = page.getByRole('button', { name: '이동', exact: true })
        await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
        const sceneBoxForPopover = await page.locator('[data-testid="town-scene-v2"]').boundingBox()
        const moveBtnBox = await moveBtn.boundingBox()
        const popoverInside = !!sceneBoxForPopover && !!moveBtnBox &&
          moveBtnBox.x >= sceneBoxForPopover.x - 0.5 && moveBtnBox.y >= sceneBoxForPopover.y - 0.5 &&
          (moveBtnBox.x + moveBtnBox.width) <= (sceneBoxForPopover.x + sceneBoxForPopover.width + 0.5) &&
          (moveBtnBox.y + moveBtnBox.height) <= (sceneBoxForPopover.y + sceneBoxForPopover.height + 0.5)
        r.check(`${name} — (7,3) 팝오버가 씬 박스 안에 완전히 들어옴(클리핑 없음)`, popoverInside, JSON.stringify({ sceneBoxForPopover, moveBtnBox }))

        await page.keyboard.press('Escape')
        const closedByEscape = await waitUntil(async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0, { timeout: 5000 })
        r.check(`${name} — Escape로 팝오버가 닫힘`, !!closedByEscape)
        const focusReturned = await itemBtn.evaluate((btn) => btn === document.activeElement)
        r.check(`${name} — Escape로 닫힌 후 포커스가 트리거(아이템) 버튼으로 복귀`, focusReturned)

        await itemBtn.click()
        await page.getByRole('button', { name: '이동', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
        const backdrop = page.locator('[data-testid="town-scene-backdrop"]')
        await backdrop.click({ position: { x: 10, y: 80 } })
        const closedByBackdrop = await waitUntil(async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0, { timeout: 5000 })
        r.check(`${name} — 백드롭 클릭으로도 팝오버가 닫힘`, !!closedByBackdrop)
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S10 — 표지판 텍스트 폭 회귀 방지: My House 표지판 <text>가 자신의
  //        박스(<rect>, 기둥이 아니라 표지판 판) 폭 안에 여유 있게 들어맞는지
  //        (2026-09-19 — font-size 9.5(텍스트 폭 48.92) → 7.7(텍스트 폭
  //        39.65)로 수정, 박스 폭 44는 그대로). Georgia는 이 하네스(Windows/
  //        Playwright Chromium)와 실제 CI(Linux, Georgia 미설치 → 시스템
  //        세리프 폴백) 간 글리프 폭이 달라질 수 있어, 정확히 0 여유가
  //        아니라 최소 1유닛 이상의 여유를 요구한다(폰트 폴백 흔들림 허용치).
  //        "To the Sea" 표지판(범위 밖, 미수정)도 같은 방식으로 재봤지만
  //        실측 마진이 ~0.94 유닛뿐이라(59.07 vs 60) 이 1유닛 마진 기준과
  //        자연스럽게 맞지 않아 — 이미 알려진 여유이자 이번 수정과 무관한
  //        서명에 새로운(더 느슨한 기준의) 단언을 추가하는 대신 생략한다
  //        (지시서의 "낮은 리스크로 자연스럽게 맞을 때만" 옵션 조건 미충족).
  {
    const vp = { width: 390, height: 844 }
    const name = 'S10[390x844] 표지판 텍스트 폭 <= 박스 폭'
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
      await page.locator('[data-testid="town-scene-v2"]').waitFor({ state: 'visible', timeout: 15000 })

      // TownSceneryLayer.jsx WorldSign — role="img" aria-label=표지판 텍스트
      // 래퍼 안의 <svg>에 <text>(표지판 카피) + 여러 <rect>(판 + 기둥)가
      // 있다. 판은 항상 기둥보다 훨씬 넓은 rect이므로 width가 가장 큰
      // rect를 "박스"로 취급한다(재도출 없음 — svgInner가 유일한 원천).
      async function measureSignTextVsBox(ariaLabel) {
        const sign = page.locator(`div[role="img"][aria-label="${ariaLabel}"]`).first()
        await sign.waitFor({ state: 'visible', timeout: 10000 })
        return sign.evaluate((el) => {
          const text = el.querySelector('text')
          const rects = Array.from(el.querySelectorAll('rect'))
          const box = rects.reduce((widest, rectEl) => {
            const w = parseFloat(rectEl.getAttribute('width') || '0')
            return w > widest.w ? { w, el: rectEl } : widest
          }, { w: 0, el: null }).el
          return {
            textWidth: text ? text.getComputedTextLength() : null,
            boxWidth: box ? parseFloat(box.getAttribute('width')) : null,
          }
        })
      }

      const myHouse = await measureSignTextVsBox('My House')
      r.check(
        `${name} — My House 표지판 텍스트 폭이 박스 폭보다 최소 1 유닛 이상 작음(양쪽 여유 존재)`,
        myHouse.textWidth != null && myHouse.boxWidth != null && myHouse.textWidth <= myHouse.boxWidth - 1,
        JSON.stringify(myHouse),
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

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
