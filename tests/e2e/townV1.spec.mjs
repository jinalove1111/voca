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
// PHASE 10(2026-09-11) — "가장 긴 카탈로그 이름" 카드 오버플로우 회귀용.
// 새 이름을 여기서 발명하지 않고 townCatalog.js(진실 원천, 다른 세션
// 소유 파일 — import만 하고 수정하지 않는다)의 메타를 그대로 읽는다.
import { TOWN_ITEM_META, TOWN_CATEGORIES } from '../../src/utils/town/townCatalog.js'

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  // TASK 7(2026-09-11) 추가 — 태블릿/데스크톱/가로모드 폰. 콘텐츠가 전부
  // max-w-lg(TownScreen.jsx/TownGrid.jsx) 안에 갇혀 있어 넓은 뷰포트에서도
  // 같은 시나리오 흐름을 그대로 재사용할 수 있다(러너 구조 변경 없음).
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 844, height: 390 },
]

function vpName(vp) { return `[${vp.width}x${vp.height}]` }

// TASK 7 — 뷰포트 경계 안에 완전히 들어오는지(부분 클리핑 없이) 확인.
// Playwright boundingBox 좌표는 viewport 기준이라 x/y가 음수거나
// x+width/y+height가 viewport 크기를 넘으면 화면 밖으로 잘린 것이다.
function boxInsideViewport(box, vp, { checkY = true } = {}) {
  if (!box) return false
  const xOk = box.x >= -0.5 && (box.x + box.width) <= vp.width + 0.5
  if (!checkY) return xOk
  return xOk && box.y >= -0.5 && (box.y + box.height) <= vp.height + 0.5
}

// TASK 7 — 화면에 보이는(크기>0, display/visibility 숨김 아님) <button> 전체의
// 최소 높이. disabled 버튼(HOME 칸처럼 실제 탭 대상이 아닌 장식용)은
// 터치 타겟 판정에서 제외한다.
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

// PHASE 10(2026-09-11) — 신규 회귀 4종(연타 배치 중복 방지/긴 라벨 카드
// 오버플로우/느린 네트워크/환영 토스트)은 과제 지시가 명시한 5개 뷰포트
// (360/375/390/412x*, 768x1024)에서만 실행한다. 1280x800/844x390(TASK 7
// 가로모드·데스크톱 전용 뷰포트)은 "keep as-is" 지시대로 손대지 않는다.
function isPhase10Viewport(vp) {
  const skip = (vp.width === 1280 && vp.height === 800) || (vp.width === 844 && vp.height === 390)
  return !skip
}

// PHASE 10 — 카탈로그 전체(17개)에서 한글 이름이 가장 긴 아이템 1개를
// 고른다(동률이면 TOWN_ITEM_META 선언 순서상 먼저 나오는 쪽 — 실측
// 2026-09-11 기준 'british-cottage'/영국 코티지). 하드코딩 대신 메타를
// 그대로 읽어, 나중에 townCatalog.js가 바뀌어도 이 스펙이 따라간다.
const LONGEST_TOWN_ITEM = Object.entries(TOWN_ITEM_META).reduce((best, [id, m]) => (
  !best || m.nameKo.length > best.meta.nameKo.length ? { id, meta: m } : best
), null)
const LONGEST_TOWN_ITEM_CATEGORY_LABEL = (() => {
  const entry = LONGEST_TOWN_ITEM && TOWN_CATEGORIES.find((c) => c.id === LONGEST_TOWN_ITEM.meta.category)
  return entry ? entry.label : null
})()

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

      // ── TASK 7 — PD(Paul Dollar) 배지가 뷰포트 안에 완전히 들어옴 ────────
      const dollarBadgeBox = await dollarBadge.boundingBox().catch(() => null)
      r.check(`${name} TASK7 — PD 잔액 배지가 뷰포트 안에 완전히 표시됨(클리핑 없음)`,
        boxInsideViewport(dollarBadgeBox, vp), JSON.stringify(dollarBadgeBox))

      // ── PHASE 4(2026-09-11) — 💵 배지 아래 학습→보상 연결 캡션
      //     "공부하면 💵가 생겨요"(TownHeader.jsx) — 표시/뷰포트 안/배지와
      //     겹치지 않음(세로로 배지 아래 위치). ─────────────────────────────
      const captionLocator = page.getByText('공부하면 💵가 생겨요', { exact: true })
      const captionVisible = await captionLocator.isVisible().catch(() => false)
      r.check(`${name} PHASE4 — 헤더 캡션 "공부하면 💵가 생겨요" 표시`, captionVisible)
      const captionBox = await captionLocator.boundingBox().catch(() => null)
      r.check(`${name} PHASE4 — 헤더 캡션이 뷰포트 안에 완전히 표시됨(클리핑 없음)`,
        boxInsideViewport(captionBox, vp), JSON.stringify(captionBox))
      const captionBelowBadge = !!captionBox && !!dollarBadgeBox && captionBox.y >= dollarBadgeBox.y + dollarBadgeBox.height - 0.5
      r.check(`${name} PHASE4 — 헤더 캡션이 💵 배지와 겹치지 않음(배지 아래 배치)`,
        captionBelowBadge, `captionBox=${JSON.stringify(captionBox)} dollarBadgeBox=${JSON.stringify(dollarBadgeBox)}`)

      // ── 폴 이미지 1장만(HeroReaction, img[alt] — welcome 가이드가 뜬 뒤) ──
      // welcome 가이드는 마운트 후 useEffect로 세팅되므로(동기 렌더에는 없음)
      // 이미지가 실제로 나타날 때까지 폴링한다.
      const heroImgAppeared = await waitUntil(async () => (await page.locator('img[alt]').count()) === 1)
      r.check(`${name} TownScreen — 폴 이미지(img[alt]) 정확히 1장`, !!heroImgAppeared,
        `count=${await page.locator('img[alt]').count()}`)

      // ── 환영 선물 20 Paul Dollar — 1회만 지급 ───────────────────────────
      const welcomeClaimed = await waitUntil(() => (db._townCalls.claim_town_welcome || 0) >= 1, { timeout: 10000 })
      r.check(`${name} 환영 선물 — claim_town_welcome 호출 발생`, !!welcomeClaimed)

      // ── PHASE 10(2026-09-11) — 환영 보상 토스트("🎁 환영 선물", TownScreen.jsx
      //     toast state — granted:true일 때만 표시, 3초 뒤 자동 소멸). 지정된
      //     5개 뷰포트에서만 확인(그 외는 TASK 7 "keep as-is"). ────────────
      if (isPhase10Viewport(vp)) {
        const rewardToastLocator = page.getByText('🎁 환영 선물', { exact: false })
        const toastAppeared = await waitUntil(() => rewardToastLocator.first().isVisible().catch(() => false), { timeout: 5000 })
        r.check(`${name} PHASE10 — 환영 선물 토스트("🎁 환영 선물") 표시`, !!toastAppeared)
        if (toastAppeared) {
          const toastBox = await rewardToastLocator.first().boundingBox().catch(() => null)
          r.check(`${name} PHASE10 — 환영 선물 토스트가 뷰포트 안에 표시됨(클리핑 없음)`,
            boxInsideViewport(toastBox, vp), JSON.stringify(toastBox))
          const headerBox = await page.locator('div.bg-white.rounded-3xl.card-shadow.p-3.flex.items-center.gap-2').first().boundingBox().catch(() => null)
          const noOverlapWithHeader = !!toastBox && !!headerBox
            && (toastBox.y >= headerBox.y + headerBox.height - 0.5 || toastBox.y + toastBox.height <= headerBox.y + 0.5)
          r.check(`${name} PHASE10 — 환영 선물 토스트가 헤더(Lv./💵 바)와 겹치지 않음`,
            noOverlapWithHeader, `toastBox=${JSON.stringify(toastBox)} headerBox=${JSON.stringify(headerBox)}`)
        }
        const toastDisappeared = await waitUntil(async () => !(await rewardToastLocator.first().isVisible().catch(() => false)), { timeout: 5000 })
        r.check(`${name} PHASE10 — 환영 선물 토스트가 일정 시간 후 사라짐(자동 dismiss)`, !!toastDisappeared)
      }

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

      // ── 탭 3개 가로 스크롤 없음 + (TASK 7) 터치 타겟/내 마을 그리드 ───────
      for (const [tabLabel, tabName] of [['🏘 내 마을', 'town'], ['🛒 상점', 'shop'], ['🎁 보관함', 'inventory']]) {
        await page.getByRole('button', { name: tabLabel }).click()
        r.check(`${name} ${tabName} 탭 — 가로 스크롤 없음`, await noHorizontalOverflow(page))

        // TASK 7 — 이 탭에서 보이는(disabled 제외) 버튼 전체의 최소 높이가
        // >= 40px인지. 실제 최솟값은 항상 detail에 기록(리포트 요구사항).
        const btnScan = await minVisibleButtonHeight(page)
        r.check(`${name} ${tabName} 탭 — 보이는 버튼 전체 터치 타겟 높이 >= 40px`,
          btnScan.min !== null && btnScan.min >= 40, `min=${btnScan.min} count=${btnScan.count}`)

        if (tabName === 'town') {
          // TASK 7 — 내 마을 그리드가 뷰포트 가로폭 안에 들어오고, HOME
          // 칸(🏠 My House, 절대 탭 불가/장식)이 표시됨.
          const gridBox = await page.locator('div.grid.gap-1.rounded-3xl.p-2').first().boundingBox().catch(() => null)
          r.check(`${name} town 탭 — 내 마을 그리드가 뷰포트 가로폭 안에 들어옴`,
            boxInsideViewport(gridBox, vp, { checkY: false }), JSON.stringify(gridBox))
          const homeCellVisible = await page.getByRole('button', { name: 'My House' }).isVisible().catch(() => false)
          r.check(`${name} town 탭 — HOME 칸(🏠 My House) 표시`, homeCellVisible)
        }

        // ── PHASE 4(2026-09-11) — 보관함이 아직 비어있는 시점(이 루프는 첫
        //     구매보다 먼저 실행됨)에 안내 문구 + "🛒 상점으로 가기" 버튼
        //     (TownInventory.jsx) 검증. 클릭 시 탭이 상점으로 전환된다. ─────
        if (tabName === 'inventory') {
          const emptyInventoryMsgVisible = await page.getByText('상점에서 첫 아이템을 사보세요 🌳').isVisible().catch(() => false)
          r.check(`${name} PHASE4 — 빈 보관함 안내 문구 "상점에서 첫 아이템을 사보세요 🌳" 표시`, emptyInventoryMsgVisible)
          const goShopBtn = page.getByRole('button', { name: '🛒 상점으로 가기' })
          const goShopBtnBox = await goShopBtn.boundingBox().catch(() => null)
          r.check(`${name} PHASE4 — 빈 보관함 "🛒 상점으로 가기" 버튼 높이 >= 44px`,
            !!goShopBtnBox && goShopBtnBox.height >= 44, JSON.stringify(goShopBtnBox))
          await goShopBtn.click()
          const switchedToShopTab = await page.getByRole('button', { name: '자연 카테고리' })
            .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
          r.check(`${name} PHASE4 — "🛒 상점으로 가기" 클릭 시 상점 탭으로 전환됨`, switchedToShopTab)
        }
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
      // TASK 7 — 상점 사용성: 첫 구매 가능 카드의 "구매" 버튼이 뷰포트
      // 안에 완전히 들어옴(카테고리 탭도 위에서 이미 클릭·표시로 검증됨).
      // 스크롤 후 위치를 본다 — 세로로 짧은 랜드스케이프 뷰포트(844x390)
      // 등에서는 페이지가 세로 스크롤되는 게 정상이라(fixed 오버레이 없음,
      // TownScreen.jsx 확인), 스크롤 전 fold 밖에 있는 것 자체는 결함이
      // 아니다 — 스크롤"해도" 잘리는지가 진짜 회귀 신호다.
      await treeBuyBtn.scrollIntoViewIfNeeded().catch(() => {})
      const treeBuyBoxScrolled = await treeBuyBtn.boundingBox().catch(() => null)
      r.check(`${name} TASK7 — 상점 첫 구매 가능 카드 "구매" 버튼이 뷰포트 안에 표시됨(스크롤 후)`,
        boxInsideViewport(treeBuyBoxScrolled, vp), JSON.stringify(treeBuyBoxScrolled))

      const flowerCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('꽃밭', { exact: true }) }).first()
      await flowerCard.waitFor({ state: 'visible', timeout: 10000 })
      const flowerText = (await flowerCard.textContent().catch(() => '')) || ''
      r.check(`${name} 상점 — 꽃밭(flower-garden) 카드 잠김(🔒) 표시`, flowerText.includes('🔒'), flowerText)
      r.check(`${name} 상점 — 꽃밭(flower-garden) 카드 "Level 3" 표시`, flowerText.includes('Level 3'), flowerText)
      // ── PHASE 4(2026-09-11) — 잠금 카드 두 번째 줄 "Level N = ⭐M"
      //     (TownShopPanel.jsx, starsForLevel) 형식 검증. ────────────────
      const flowerLockedSecondLineText = (await flowerCard.getByText(/Level \d+ = ⭐\d+/).textContent().catch(() => '')) || ''
      r.check(`${name} PHASE4 — 잠금 카드 두 번째 줄 "Level N = ⭐M" 형식 표시`,
        /Level \d+ = ⭐\d+/.test(flowerLockedSecondLineText), flowerLockedSecondLineText)

      // ── TASK 7 — 잠금 문구("Level N에서 열려요") 폰트 크기 가독성 ────────
      const flowerLockedBtn = flowerCard.getByRole('button')
      const flowerLockedFontSize = await flowerLockedBtn.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize)).catch(() => 0)
      r.check(`${name} TASK7 — 잠김 문구("Level N에서 열려요") 폰트 크기 >= 12px`,
        flowerLockedFontSize >= 12, `fontSize=${flowerLockedFontSize}px`)

      // ── 별(⭐) 배지 — 구매 전 텍스트 보관(구매 후 불변 확인용) ──────────
      const lvTextBeforePurchase = (await lvBadge.textContent().catch(() => '')) || ''

      // ── 나무 구매 — 확인 시트($10/잔여) → "사기" 더블클릭(연타 방지 검증) ──
      await treeBuyBtn.click()
      const confirmSheet = page.locator('div.animate-slide-up')
      await confirmSheet.waitFor({ state: 'visible', timeout: 10000 })

      // ── TASK 7 — 패널/시트 닫기: "취소"로 확인 시트가 닫히고, 구매 호출이
      //     증가하지 않음(닫은 뒤 다시 열어 원래 시나리오를 이어간다). ──────
      const cancelBtn = page.getByRole('button', { name: '취소' })
      await cancelBtn.waitFor({ state: 'visible', timeout: 5000 })
      await cancelBtn.click()
      const sheetClosedByCancel = await waitUntil(async () => !(await confirmSheet.isVisible().catch(() => false)), { timeout: 5000 })
      r.check(`${name} TASK7 — 확인 시트 "취소" 클릭 시 닫힘`, !!sheetClosedByCancel)
      r.check(`${name} TASK7 — "취소" 클릭 후 purchase_town_item(tree) 호출 증가 없음`,
        !(db._townCalls.purchase_town_item.tree > 0), `count=${db._townCalls.purchase_town_item.tree || 0}`)
      await treeBuyBtn.click()
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
      // ── PHASE 4(2026-09-11) — 부족액 카드 두 번째 줄 "(공부하면 모여요)"
      //     (TownShopPanel.jsx). ────────────────────────────────────────
      r.check(`${name} PHASE4 — 부족액 카드 두 번째 줄 "(공부하면 모여요)" 표시`, catText.includes('(공부하면 모여요)'), catText)

      // ── PHASE 10(2026-09-11) — 카탈로그 최장 한글 이름 카드가 자기 카드
      //     폭 안에서 잘리지 않음(scrollWidth <= clientWidth+1). 지정된 5개
      //     뷰포트에서만(그 외는 TASK 7 "keep as-is"). ──────────────────────
      if (isPhase10Viewport(vp) && LONGEST_TOWN_ITEM && LONGEST_TOWN_ITEM_CATEGORY_LABEL) {
        await page.getByRole('button', { name: `${LONGEST_TOWN_ITEM_CATEGORY_LABEL} 카테고리` }).click()
        const longNameKo = LONGEST_TOWN_ITEM.meta.nameKo
        const longCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText(longNameKo, { exact: true }) }).first()
        const longCardVisible = await longCard.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
        r.check(`${name} PHASE10 — 최장 카탈로그 이름("${longNameKo}") 카드 표시`, longCardVisible)
        if (longCardVisible) {
          const overflowMetrics = await longCard.getByText(longNameKo, { exact: true })
            .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
          r.check(`${name} PHASE10 — 최장 카탈로그 이름("${longNameKo}") 카드 텍스트 오버플로우 없음`,
            overflowMetrics.scrollWidth <= overflowMetrics.clientWidth + 1, JSON.stringify(overflowMetrics))
        }
      }

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
      // PHASE 10(2026-09-11) — 지정된 5개 뷰포트에서는 빈 칸을 "연타"(같은
      // 틱에 실제 클릭 이벤트 2회 디스패치 — 위 buyBtn 더블클릭 방지 검증과
      // 동일한 패턴)해 배치 중복 방지 가드를 검증한다. 그 외 뷰포트
      // (1280x800/844x390)는 TASK 7 "keep as-is" 지시대로 기존 단일 클릭
      // 그대로 유지한다.
      if (isPhase10Viewport(vp)) {
        await emptyCellBtn().evaluate((el) => {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        })
      } else {
        await emptyCellBtn().click()
      }
      const treePlacedAgain = await waitUntil(() => treeCell.isVisible().catch(() => false), { timeout: 10000 })
      r.check(`${name} 재배치 — 새로고침 전 나무가 격자에 표시됨`, !!treePlacedAgain)

      if (isPhase10Viewport(vp)) {
        const treeEmojiCountAfterRapidTap = await page.getByText('🌳', { exact: true }).count()
        r.check(`${name} PHASE10 — 빈 칸 연타(rapid tap) 후 나무 이모지가 격자에 정확히 1개만 표시됨(중복 배치 없음)`,
          treeEmojiCountAfterRapidTap === 1, `count=${treeEmojiCountAfterRapidTap}`)
        await page.getByRole('button', { name: '🎁 보관함' }).click()
        const treeStillInNotPlacedList = await page.getByRole('button', { name: '마을에 놓기' }).isVisible().catch(() => false)
        r.check(`${name} PHASE10 — 연타 배치 후 보관함 "마을에 놓기" 목록에 나무가 더 이상 없음(중복 배치 없음)`, !treeStillInNotPlacedList)
        await page.getByRole('button', { name: '🏘 내 마을' }).click()
      }

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

      // ── TASK 7 — 200% 폰트 확대를 나머지 두 탭(내 마을/보관함)에도 적용해
      //     가로 스크롤이 없는지 확인(폰트는 그대로 200% 유지한 채 탭만
      //     전환 — 기존 상점 탭 검증 방식과 동일한 폰트 배율 재사용). ──────
      for (const [tabLabel, tabName] of [['🏘 내 마을', 'town'], ['🎁 보관함', 'inventory']]) {
        await page.getByRole('button', { name: tabLabel }).click()
        r.check(`${name} PROXY(200% 폰트) — ${tabName} 탭 가로 스크롤 없음`, await noHorizontalOverflow(page))
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = '' })

      // ── TASK 7 — 뒤로가기(1): 화면 안 "← Paul Town" 버튼 → PaulTown
      //     화면으로 복귀(진입 카드가 다시 보임). ───────────────────────────
      await page.getByRole('button', { name: '← Paul Town' }).click()
      const backToPaulTown = await page.getByText('내 마을 — Welcome to Paul Town')
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} TASK7 — "← Paul Town" 클릭 시 PaulTown 화면으로 복귀(진입 카드 재표시)`, backToPaulTown)

      // ── TASK 7 — 뒤로가기(2): 브라우저 레벨 goBack(). 이 앱은 client-side
      //     라우팅(pushState/hash)이 전혀 없다(App.jsx는 순수 React
      //     useState로 화면을 전환 — src 전역에 pushState/popstate 없음,
      //     2026-09-11 실측). 따라서 goBack()은 SPA 화면 전환을 되돌리는
      //     게 아니라 브라우저 세션 히스토리상 이전 문서(이 컨텍스트에서는
      //     최초 about:blank)로 완전히 이탈하거나, 되돌아갈 이전 문서가
      //     없으면 아무 일도 하지 않는다 — 둘 다 "정상"이고, 실제 회귀는
      //     오직 크래시/에러 문구가 뜨는 경우뿐이다. 이 화면이 마지막
      //     단계라 이후 남은 단언에 영향 없음(re-enter 불필요). ──────────
      const card5 = await enterTownV1(page)
      await card5.click()
      await waitForTownHeader(page)
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(300)
      const afterBackBody = await page.locator('body').innerText().catch(() => '')
      const afterBackUrl = page.url()
      const crashed = afterBackBody.includes('문제가 발생했어요')
      const stillHasAppUi = /이름 입력|Paul Town|Lv\.|시작하기/.test(afterBackBody)
      const wentBlank = afterBackUrl === 'about:blank' || afterBackBody.trim().length === 0
      r.check(`${name} TASK7 — 브라우저 뒤로가기(page.goBack) 후 크래시/에러 문구 없음`, !crashed,
        `url=${afterBackUrl} bodyHead=${JSON.stringify(afterBackBody.slice(0, 200))}`)
      r.check(`${name} TASK7 — 브라우저 뒤로가기(page.goBack) 실제 동작 문서화(SPA에 client-side 라우팅 없음 — 앱 이탈 또는 무변화 중 하나, 에러만 회귀)`,
        crashed ? false : (wentBlank || stillHasAppUi),
        `url=${afterBackUrl} wentBlank=${wentBlank} stillHasAppUi=${stillHasAppUi}`)
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

  // ── PHASE 4(2026-09-11) EMPTY-WALLET(뷰포트 1개만, 360x640) — 환영
  //     선물을 청구하지 않는(비활성) mock 옵션(installMocks의
  //     townWelcomeDisabled → db._townWelcomeDisabled)으로 잔액 0·보유 0
  //     상태를 안정적으로 유지해, 메인 루프에서는 타이밍상 재현할 수 없는
  //     "아직 💵가 없어요" 상점 안내 카드(TownShopPanel.jsx)를 검증한다. ──
  {
    const vp = VIEWPORTS[0]
    const name = `${vpName(vp)} EMPTY-WALLET`
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await enableTownFlag(page)
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page, { townWelcomeDisabled: true })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownV1(page)
      await card.click()
      await waitForTownHeader(page)
      await page.getByRole('button', { name: '🛒 상점' }).click()

      const emptyWalletMsgVisible = await waitUntil(
        () => page.getByText('아직 💵가 없어요', { exact: false }).isVisible().catch(() => false),
        { timeout: 10000 },
      )
      r.check(`${name} — 빈 지갑(잔액 0·보유 0) 상점 안내 카드 "아직 💵가 없어요" 표시`, !!emptyWalletMsgVisible)
      const emptyWalletHeaderText = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
      r.check(`${name} — claim_town_welcome이 비활성화된 mock에서도 헤더 잔액이 "0"으로 유지됨`,
        emptyWalletHeaderText.includes('0'), emptyWalletHeaderText)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      unmockedRequests.push(...u)
      ttsFallbackRequests.push(...t)
      mockErrors.push(...db.errors)
      await context.close()
    }
  }

  // ── PHASE 10(2026-09-11) SLOW-NETWORK(뷰포트 1개만, 360x640) — /api/
  //     grant-xp(Town action 3종)를 1200ms 지연시켜, 상점 화면이 10초
  //     안에 에러 문구 없이 최종 잔액($20, 환영 선물 정상 지급 포함)을
  //     표시하는지 확인한다(로딩/비활성 상태 자체는 구현이 아직 없어도
  //     이 스펙은 "결국 정상 렌더"만 강제 — 과제 지시의 "or simply renders
  //     correctly ... within 10s" 대안 경로). ─────────────────────────────
  {
    const vp = VIEWPORTS[0]
    const name = `${vpName(vp)} SLOW-NETWORK`
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await enableTownFlag(page)
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page, { slowGrantXpMs: 1200 })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownV1(page)
      await card.click()
      await waitForTownHeader(page)
      await page.getByRole('button', { name: '🛒 상점' }).click()

      const start = Date.now()
      const dollarBadge = page.locator(DOLLAR_BADGE_SEL)
      const balanceShown = await waitUntil(async () => {
        const t2 = (await dollarBadge.textContent().catch(() => '')) || ''
        return t2.includes('20') ? t2 : false
      }, { timeout: 10000 })
      const elapsedMs = Date.now() - start
      r.check(`${name} — 느린 네트워크(grant-xp 1200ms 지연)에도 10초 안에 환영 선물 잔액($20) 표시`,
        !!balanceShown, `elapsedMs=${elapsedMs} text=${balanceShown || '(none)'}`)

      const bodyTextDuring = await page.locator('body').innerText().catch(() => '')
      const hasErrorText = bodyTextDuring.includes('문제가 발생했어요')
      r.check(`${name} — 느린 네트워크 중 에러 문구 없음`, !hasErrorText, bodyTextDuring.slice(0, 200))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      unmockedRequests.push(...u)
      ttsFallbackRequests.push(...t)
      mockErrors.push(...db.errors)
      await context.close()
    }
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
