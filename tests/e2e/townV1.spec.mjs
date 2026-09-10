// tests/e2e/townV1.spec.mjs
//
// Paul Town V1(paulTownV1, 2026-09-11) 회귀 스펙 — 내 마을(8×6 격자 배치/
// 이동/보관)·상점(카테고리·잠금·부족액·구매)·보관함·헤더(레벨/Paul Dollar)·
// 환영 보상(20 Paul Dollar 1회)을 4개 모바일 뷰포트(360×640~412×915)에서
// 검증한다. mobileViewports.spec.mjs와 동일한 per-viewport try/catch/finally
// 구조(한 뷰포트가 실패해도 나머지 뷰포트는 계속 실행)를 그대로 따르되,
// 이 파일은 새 파일이라 필요한 소규모 헬퍼(login/waitUntil/
// noHorizontalOverflow)는 그 파일에서 import하지 않고 복제한다(파일당
// 소유권 원칙, CLAUDE.md 규칙 16 — 두 spec이 같은 파일을 동시에 건드리지
// 않게).
//
// 실 Supabase/Vercel 요청 0건 — installMocks가 전체 네트워크를 가로챈다
// (tests/e2e/lib/mockRoutes.mjs). Paul Town 상점 3 action(get_town_shop_state/
// purchase_town_item/claim_town_welcome)은 그 파일에 이번에 추가한 stateful
// mock이 처리한다(fixture 학생 starsEarned=20 → 마을 레벨 2 고정).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]

function vpName(vp) { return `[${vp.width}x${vp.height}]` }

// student.spec.mjs/mobileViewports.spec.mjs와 동일한 결정론적 폴링 헬퍼 —
// 새 파일이라 재정의(다른 세션 소유 파일을 import해서 재사용하지 않는다,
// 규칙 16).
async function waitUntil(fn, { timeout = 15000, interval = 150 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = await fn()
    if (v) return v
    await new Promise((res) => setTimeout(res, interval))
  }
  return false
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

// paulTownV1 플래그 ON — src/config/features.js의 localStorage 스냅샷에
// 이 키만 심어둔다(그 외 플래그는 DEFAULT_FEATURES가 채운다, loadFeaturesFromStorage
// 병합 규칙). 매 네비게이션(reload 포함)마다 다시 실행되므로 reload 후에도
// 플래그가 유지된다(Playwright addInitScript 계약).
async function enableTownFlag(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('paulEasyVoca_features', JSON.stringify({ paulTownV1: true })) } catch { /* 무시 */ }
  })
}

async function login(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

// 대시보드(Paul Town 홈 밴드, 항상 노출 — attachmentWorldGarden/paulTownHomeBand
// 둘 다 기본 ON) → "구경가기" → PaulTown 화면.
async function goToPaulTownScreen(page) {
  const goBtn = page.getByRole('button', { name: '구경가기' })
  await goBtn.waitFor({ state: 'visible', timeout: 20000 })
  await goBtn.click()
}

// PaulTown 화면의 "🏘 내 마을" 진입 카드(전체가 버튼 하나, "들어가기"는 그
// 안의 span — PaulTown.jsx 231-245행) → TownScreen.
async function enterTownV1(page) {
  const card = page.locator('button', { hasText: '들어가기' })
  await card.waitFor({ state: 'visible', timeout: 15000 })
  return card
}

const LV_BADGE_SEL = 'span[title="누적 별(성취) — 절대 줄지 않아요"]'
const DOLLAR_BADGE_SEL = 'span[title="사용 가능한 Paul Dollar"]'

async function waitForTownHeader(page) {
  await page.locator(LV_BADGE_SEL).waitFor({ state: 'visible', timeout: 15000 })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[town]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  for (const vp of VIEWPORTS) {
    const name = vpName(vp)
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await enableTownFlag(page)
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)

      // ── (진입) "🏘 내 마을" 카드 표시 + "들어가기" 터치 타겟 ────────────
      // PaulTown은 React.lazy 지연 로드라 클릭 직후 즉시 isVisible을 보면
      // 레이스로 false가 뜬다 — waitFor로 실제 렌더를 기다린다.
      const cardVisible = await page.getByText('내 마을 — Welcome to Paul Town')
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} PaulTown 화면 — "🏘 내 마을" 진입 카드 표시`, cardVisible)
      const enterLabel = page.getByText('들어가기', { exact: true })
      const enterBox = await enterLabel.boundingBox()
      r.check(`${name} PaulTown 화면 — "들어가기" 터치 타겟 높이 >= 44px`, !!enterBox && enterBox.height >= 44, JSON.stringify(enterBox))

      const card = await enterTownV1(page)
      await card.click()

      // ── TownScreen 헤더 — Lv./💵, 가로 스크롤 없음 ──────────────────────
      await waitForTownHeader(page)
      r.check(`${name} TownScreen — 가로 스크롤 없음(헤더 진입 직후)`, await noHorizontalOverflow(page))
      const lvBadge = page.locator(LV_BADGE_SEL)
      const dollarBadge = page.locator(DOLLAR_BADGE_SEL)
      const lvTextInit = (await lvBadge.textContent().catch(() => '')) || ''
      r.check(`${name} TownScreen 헤더 — "Lv." 표시`, /Lv\.\d+/.test(lvTextInit), lvTextInit)
      const dollarTextInit = (await dollarBadge.textContent().catch(() => '')) || ''
      r.check(`${name} TownScreen 헤더 — "💵" 표시`, dollarTextInit.includes('💵'), dollarTextInit)

      // ── 폴 이미지 1장만(HeroReaction, img[alt] — welcome 가이드가 뜬 뒤) ──
      // welcome 가이드는 마운트 후 useEffect로 세팅되므로(동기 렌더에는 없음)
      // 이미지가 실제로 나타날 때까지 폴링한다.
      const heroImgAppeared = await waitUntil(async () => (await page.locator('img[alt]').count()) === 1)
      r.check(`${name} TownScreen — 폴 이미지(img[alt]) 정확히 1장`, !!heroImgAppeared,
        `count=${await page.locator('img[alt]').count()}`)

      // ── 환영 선물 20 Paul Dollar — 1회만 지급 ───────────────────────────
      const welcomeClaimed = await waitUntil(() => (db._townCalls.claim_town_welcome || 0) >= 1, { timeout: 10000 })
      r.check(`${name} 환영 선물 — claim_town_welcome 호출 발생`, !!welcomeClaimed)
      const balanceAfterWelcome = await waitUntil(async () => {
        const t2 = (await dollarBadge.textContent().catch(() => '')) || ''
        return t2.includes('20') ? t2 : false
      }, { timeout: 10000 })
      r.check(`${name} 환영 선물 — 헤더 잔액이 $20으로 표시됨`, !!balanceAfterWelcome, balanceAfterWelcome || '(no $20 text)')
      r.check(`${name} 환영 선물 — claim_town_welcome 호출 정확히 1회(중복 지급 없음)`,
        db._townCalls.claim_town_welcome === 1, `count=${db._townCalls.claim_town_welcome}`)

      // ── 새로고침 후에도 재지급되지 않음(대시보드로 돌아가 있으므로 이
      //     화면의 claim 이펙트가 다시 실행되지 않는다 — 세션은
      //     localStorage로 복원되지만 화면(screen state)은 복원되지 않아
      //     TownScreen이 재마운트되지 않는다는 사실 자체가 검증 대상). ──
      await page.reload({ waitUntil: 'domcontentloaded' })
      const backOnDashboard = await page.getByRole('button', { name: '구경가기' }).waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)
      r.check(`${name} 새로고침 — 세션 복원되어 대시보드로 돌아옴`, backOnDashboard)
      r.check(`${name} 새로고침 후 — claim_town_welcome 호출 카운트가 1로 유지(재지급 없음)`,
        db._townCalls.claim_town_welcome === 1, `count=${db._townCalls.claim_town_welcome}`)

      await goToPaulTownScreen(page)
      const card2 = await enterTownV1(page)
      await card2.click()
      await waitForTownHeader(page)
      const dollarTextAfterReload = (await dollarBadge.textContent().catch(() => '')) || ''
      r.check(`${name} 새로고침 후 — 헤더 잔액이 여전히 $20(서버가 잔액을 기억)`, dollarTextAfterReload.includes('20'), dollarTextAfterReload)

      // ── 탭 3개 가로 스크롤 없음 ──────────────────────────────────────────
      for (const [tabLabel, tabName] of [['🏘 내 마을', 'town'], ['🛒 상점', 'shop'], ['🎁 보관함', 'inventory']]) {
        await page.getByRole('button', { name: tabLabel }).click()
        r.check(`${name} ${tabName} 탭 — 가로 스크롤 없음`, await noHorizontalOverflow(page))
      }

      // ── 상점 탭 — 카테고리/잠금/부족액 ───────────────────────────────────
      await page.getByRole('button', { name: '🛒 상점' }).click()
      const natureTabBtn = page.getByRole('button', { name: '자연 카테고리' })
      await natureTabBtn.waitFor({ state: 'visible', timeout: 10000 })
      r.check(`${name} 상점 — 카테고리 탭 표시(자연)`, await natureTabBtn.isVisible().catch(() => false))
      await natureTabBtn.click()

      const treeCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('나무', { exact: true }) }).first()
      await treeCard.waitFor({ state: 'visible', timeout: 10000 })
      const treeBuyBtn = treeCard.getByRole('button', { name: '구매' })
      const treeBuyBox = await treeBuyBtn.boundingBox().catch(() => null)
      r.check(`${name} 상점 — 나무(tree) 카드 "구매" 버튼 높이 >= 44px`, !!treeBuyBox && treeBuyBox.height >= 44, JSON.stringify(treeBuyBox))

      const flowerCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('꽃밭', { exact: true }) }).first()
      await flowerCard.waitFor({ state: 'visible', timeout: 10000 })
      const flowerText = (await flowerCard.textContent().catch(() => '')) || ''
      r.check(`${name} 상점 — 꽃밭(flower-garden) 카드 잠김(🔒) 표시`, flowerText.includes('🔒'), flowerText)
      r.check(`${name} 상점 — 꽃밭(flower-garden) 카드 "Level 3" 표시`, flowerText.includes('Level 3'), flowerText)

      // ── 별(⭐) 배지 — 구매 전 텍스트 보관(구매 후 불변 확인용) ──────────
      const lvTextBeforePurchase = (await lvBadge.textContent().catch(() => '')) || ''

      // ── 나무 구매 — 확인 시트($10/잔여) → "사기" 더블클릭(연타 방지 검증) ──
      await treeBuyBtn.click()
      const confirmSheet = page.locator('div.animate-slide-up')
      await confirmSheet.waitFor({ state: 'visible', timeout: 10000 })
      const confirmText = (await confirmSheet.textContent().catch(() => '')) || ''
      r.check(`${name} 나무 구매 확인 시트 — 가격 "$10" 표시`, confirmText.includes('$10'), confirmText)
      r.check(`${name} 나무 구매 확인 시트 — 잔여 안내에 "10" 표시(20-10)`, /남는[^0-9]*10/.test(confirmText), confirmText)

      const buyBtn = page.getByRole('button', { name: '사기' })
      await buyBtn.waitFor({ state: 'visible', timeout: 5000 })
      // 연타(더블클릭) 방지 검증 — useTownShop.js의 purchasingRef 동기 가드가
      // 두 번째 클릭을 서버로 보내지 않아야 한다(같은 tick 안에서 두 클릭을
      // 디스패치 — fill()이 아니라 실제 클릭 이벤트 2회).
      await buyBtn.evaluate((el) => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })

      const purchaseSettled = await waitUntil(async () => {
        const stillOpen = await confirmSheet.isVisible().catch(() => false)
        return !stillOpen
      }, { timeout: 10000 })
      r.check(`${name} 나무 구매 — 확인 시트가 닫힘(구매 처리 완료)`, !!purchaseSettled)

      const treeOwnedShown = await waitUntil(async () => {
        const t2 = (await treeCard.textContent().catch(() => '')) || ''
        return t2.includes('보유 ✓') ? t2 : false
      }, { timeout: 10000 })
      r.check(`${name} 나무 구매 — 카드에 "보유 ✓" 표시`, !!treeOwnedShown, treeOwnedShown || '(no owned text)')

      r.check(`${name} 나무 구매 — 더블클릭에도 purchase_town_item(tree) 호출 정확히 1회`,
        (db._townCalls.purchase_town_item.tree || 0) === 1, `count=${db._townCalls.purchase_town_item.tree}`)

      const dollarTextAfterBuy = (await dollarBadge.textContent().catch(() => '')) || ''
      r.check(`${name} 나무 구매 — 헤더 잔액이 $10으로 감소(20-10)`, dollarTextAfterBuy.includes('10') && !dollarTextAfterBuy.includes('20'), dollarTextAfterBuy)

      const lvTextAfterPurchase = (await lvBadge.textContent().catch(() => '')) || ''
      r.check(`${name} 나무 구매 — ⭐ 레벨 배지 불변(구매는 별을 소비하지 않음)`, lvTextAfterPurchase === lvTextBeforePurchase, `before=${lvTextBeforePurchase} after=${lvTextAfterPurchase}`)

      const successGuideShown = await waitUntil(() => page.getByText(/Great job|나무/).first().isVisible().catch(() => false), { timeout: 5000 })
      r.check(`${name} 나무 구매 — 성공 가이드 문구(Great job/나무) 표시`, !!successGuideShown)

      // ── 고양이(cat) — 나무 구매 후 잔액 10으로 부족액 표시 ───────────────
      await page.getByRole('button', { name: '동물 카테고리' }).click()
      const catCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('고양이', { exact: true }) }).first()
      await catCard.waitFor({ state: 'visible', timeout: 10000 })
      const catText = (await catCard.textContent().catch(() => '')) || ''
      r.check(`${name} 상점 — 고양이(cat) 카드 "10 더 필요" 표시(잔액 10, 가격 20)`, catText.includes('10 더 필요'), catText)

      // ── 보관함 탭 — "마을에 놓기" ────────────────────────────────────────
      await page.getByRole('button', { name: '🎁 보관함' }).click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()

      // placing 모드 진입 시 자동으로 "내 마을" 탭으로 전환된다(TownScreen.handlePlaceStart).
      const modeHint = await page.getByText(/을\(를\) 놓을 칸을 선택하세요/).isVisible().catch(() => false)
      r.check(`${name} 마을에 놓기 — placing 모드 진입 + "내 마을" 탭 자동 전환`, modeHint)

      const emptyCellBtn = () => page.getByRole('button', { name: /^빈 칸/ }).first()
      await emptyCellBtn().waitFor({ state: 'visible', timeout: 10000 })
      await emptyCellBtn().click()

      const treeCell = page.getByRole('button', { name: /^나무 —/ })
      const treePlaced = await waitUntil(() => treeCell.isVisible().catch(() => false), { timeout: 10000 })
      r.check(`${name} 배치 — 나무(🌳)가 격자에 렌더됨`, !!treePlaced)
      const treeEmojiVisible = await page.getByText('🌳', { exact: true }).isVisible().catch(() => false)
      r.check(`${name} 배치 — 격자 셀에 🌳 이모지 표시(에셋 미등록 폴백)`, treeEmojiVisible)

      // ── 이동 ─────────────────────────────────────────────────────────
      await treeCell.click()
      // exact:true 필수 — 셀 자체의 aria-label("나무 — 눌러서 이동하거나
      // 보관해요")도 부분일치로 "이동"/"보관"을 포함해 strict mode violation을
      // 낸다(2026-09-11 실측).
      const moveBtn = page.getByRole('button', { name: '이동', exact: true })
      await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
      await moveBtn.click()
      const emptyCellBtn2 = () => page.getByRole('button', { name: /^빈 칸/ }).first()
      await emptyCellBtn2().waitFor({ state: 'visible', timeout: 10000 })
      await emptyCellBtn2().click()
      const treeMoved = await waitUntil(() => treeCell.isVisible().catch(() => false), { timeout: 10000 })
      r.check(`${name} 이동 — 나무가 새 칸으로 옮겨짐(라벨 유지 확인)`, !!treeMoved)

      // ── 보관(스토리지) ────────────────────────────────────────────────
      await treeCell.click()
      const storeBtn = page.getByRole('button', { name: '보관', exact: true })
      await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
      await storeBtn.click()
      const treeStored = await waitUntil(async () => !(await treeCell.isVisible().catch(() => false)), { timeout: 10000 })
      r.check(`${name} 보관 — 나무가 격자에서 제거됨`, !!treeStored)

      await page.getByRole('button', { name: '🎁 보관함' }).click()
      const backInInventory = await page.getByRole('button', { name: '마을에 놓기' }).isVisible().catch(() => false)
      r.check(`${name} 보관 — 다시 보관함 "마을에 놓기" 목록에 나타남`, backInInventory)

      // ── 새로고침 후 배치 유지(localStorage 백업 진행 레코드) — 다시 배치
      //     후 reload ────────────────────────────────────────────────────
      await page.getByRole('button', { name: '마을에 놓기' }).click()
      await emptyCellBtn().waitFor({ state: 'visible', timeout: 10000 })
      await emptyCellBtn().click()
      const treePlacedAgain = await waitUntil(() => treeCell.isVisible().catch(() => false), { timeout: 10000 })
      r.check(`${name} 재배치 — 새로고침 전 나무가 격자에 표시됨`, !!treePlacedAgain)
      const placedLabel = (await treeCell.getAttribute('aria-label').catch(() => '')) || ''

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: '구경가기' }).waitFor({ state: 'visible', timeout: 20000 })
      await goToPaulTownScreen(page)
      const card3 = await enterTownV1(page)
      await card3.click()
      await waitForTownHeader(page)
      await page.getByRole('button', { name: '🏘 내 마을' }).click()
      const treeStillPlaced = await waitUntil(() => page.getByRole('button', { name: /^나무 —/ }).isVisible().catch(() => false), { timeout: 10000 })
      r.check(`${name} 새로고침 후 — 배치가 그대로 유지됨(localStorage 백업 진행 레코드)`, !!treeStillPlaced, placedLabel)

      // ── LIMITATION(2026-09-11): 이 fixture 세트는 QA 학생 1명만 제공한다
      //     (tests/e2e/fixtures/index.mjs). "두 번째 학생으로 재로그인"
      //     시나리오는 실제로 재현할 수 없어, 대신 세션 포인터만 지우고
      //     (paulEasyVoca_currentStudent) 같은 학생으로 다시 로그인해
      //     배치가 studentId 기준으로(세션이 아니라) 영속됨을 확인한다 —
      //     진짜 "다른 학생" 격리를 검증하지는 못한다(LIMITATION으로 기록). ──
      await page.evaluate(() => { try { localStorage.removeItem('paulEasyVoca_currentStudent') } catch { /* 무시 */ } })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card4 = await enterTownV1(page)
      await card4.click()
      await waitForTownHeader(page)
      const treeStillPlacedAfterRelogin = await waitUntil(() => page.getByRole('button', { name: /^나무 —/ }).isVisible().catch(() => false), { timeout: 10000 })
      r.check(`${name} LIMITATION(같은 학생 재로그인 시뮬레이션, 두 번째 fixture 학생 없음) — 배치가 studentId 기준으로 유지됨`, !!treeStillPlacedAfterRelogin)

      // ── 200% 폰트 확대 근사(PROXY) — 상점 탭에서 "구매" 버튼 클리핑/가로
      //     스크롤 없음. 확인 후 반드시 100%로 되돌린다. ──────────────────
      await page.getByRole('button', { name: '🛒 상점' }).click()
      await page.getByRole('button', { name: '자연 카테고리' }).click()
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      const shopNoOverflowAtScale = await noHorizontalOverflow(page)
      const townSignBuyBtn = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('마을 표지판', { exact: true }) }).first().getByRole('button', { name: '구매' })
      const townSignBtnVisible = await townSignBuyBtn.isVisible().catch(() => false)
      let buyBtnClipOk = true
      if (townSignBtnVisible) {
        buyBtnClipOk = await townSignBuyBtn.evaluate((el) => el.scrollWidth <= el.clientWidth + 2)
      }
      r.check(`${name} PROXY(200% 폰트) — 상점 탭 가로 스크롤 없음`, shopNoOverflowAtScale)
      r.check(`${name} PROXY(200% 폰트) — "구매" 버튼 텍스트 잘림 없음`, buyBtnClipOk)
      await page.evaluate(() => { document.documentElement.style.fontSize = '' })
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] townCalls=${JSON.stringify(db._townCalls)}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      unmockedRequests.push(...u)
      ttsFallbackRequests.push(...t)
      mockErrors.push(...db.errors)
      await context.close()
    }
  }

  // ── 플래그 OFF 대조군(뷰포트 1개만, 360x640) — "🏘 내 마을" 카드가 없고
  //     Town action 네트워크 호출이 0건이어야 한다(기본값 바이트 단위 동일). ──
  {
    const vp = VIEWPORTS[0]
    const name = `${vpName(vp)} FLAG-OFF`
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    // enableTownFlag(page) 호출 없음 — 플래그 기본값(OFF) 그대로.
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await page.getByRole('button', { name: '구경가기' }).waitFor({ state: 'visible', timeout: 20000 })
      await page.getByRole('button', { name: '구경가기' }).click()
      await page.getByText('마을 곳곳').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})

      const noEntryCard = await page.getByText('내 마을 — Welcome to Paul Town').isVisible().catch(() => false)
      r.check(`${name} — "🏘 내 마을" 진입 카드 없음(플래그 OFF, 기본값 무변화)`, !noEntryCard)

      // 대시보드 진입부터 지금까지 grant-xp town action 호출이 0건이어야
      // 한다 — useTownShop의 enabled 게이트(townShopV1 || paulTownV1) &&
      // studentId가 둘 다 false라 애초에 fetch 자체가 일어나지 않아야 한다.
      const totalTownCalls = (db._townCalls.get_town_shop_state || 0)
        + (db._townCalls.claim_town_welcome || 0)
        + Object.values(db._townCalls.purchase_town_item || {}).reduce((a, b) => a + b, 0)
      r.check(`${name} — Town action(get_town_shop_state/purchase_town_item/claim_town_welcome) 호출 0건`,
        totalTownCalls === 0, `count=${totalTownCalls}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      unmockedRequests.push(...u)
      ttsFallbackRequests.push(...t)
      mockErrors.push(...db.errors)
      await context.close()
    }
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
