// tests/e2e/townPilotAllowlist.spec.mjs — Pilot A(2026-09-12) Town V1 UUID
// 허용목록 회귀. src/config/pilotTown.js가 운영자 승인 5명의 UUID를
// paulTownV1 기기 플래그와 무관하게 Town V1 진입 자격으로 인정하는지를
// 실제 브라우저에서 검증한다(단위 테스트는 scripts/testPilotTownAllowlist.mjs
// — 순수 함수/정적 검사만, 실제 로그인/렌더는 여기서만 확인).
//
// townFlagCrossTab.spec.mjs/townV1.spec.mjs와 동일한 mock 전체 가로채기
// (installMocks) + 결정론 폴링(waitUntil) 관례를 따르되, 새 파일이라 필요한
// 소규모 헬퍼는 복제한다(파일당 소유권 원칙, CLAUDE.md 규칙 16 — 다른
// spec과 동시에 같은 파일을 건드리지 않게). tests/e2e/lib/mockRoutes.mjs의
// installMocks({ studentId })는 이 스펙을 위해 추가한 opt-in 오버라이드
// (기본 동작 무변화, 다른 spec은 이 옵션을 쓰지 않는다).
//
// 관리자 기능 토글은 전혀 쓰지 않는다(기기 플래그 OFF 그대로) — Pilot A
// 진입 자격이 오직 로그인 UUID로만 결정된다는 것이 이 스펙의 핵심.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
// 승인 UUID 5개는 src/config/pilotTown.js(진실 원천)를 그대로 읽는다 —
// 이 스펙이 별도로 UUID를 다시 타이핑하면 표류 위험이 생긴다.
import { PILOT_A_TOWN_STUDENT_IDS } from '../../src/config/pilotTown.js'

const VIEWPORT = { width: 390, height: 844 }

async function waitUntil(fn, { timeout = 15000, interval = 150 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = await fn()
    if (v) return v
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  return false
}

async function loginStudent(page) {
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

async function townEntryCardVisible(page) {
  return page.getByText('내 마을 — Welcome to Paul Town').isVisible().catch(() => false)
}

// PaulTown 화면의 "🏘 내 마을" 진입 카드(전체가 버튼 하나, "들어가기"는 그
// 안의 span — PaulTown.jsx). townV1.spec.mjs와 동일한 셀렉터.
async function enterTownV1Card(page) {
  const card = page.locator('button', { hasText: '들어가기' })
  await card.waitFor({ state: 'visible', timeout: 15000 })
  return card
}

const LV_BADGE_SEL = 'span[title="누적 별(성취) — 절대 줄지 않아요"]'
const DOLLAR_BADGE_SEL = 'span[title="사용 가능한 Paul Dollar"]'

async function waitForTownHeader(page) {
  await page.locator(LV_BADGE_SEL).waitFor({ state: 'visible', timeout: 15000 })
}

// paulTownV1 기기 플래그를 명시적으로 ON — N2 시나리오(기존 동작 보존
// 확인)에만 쓴다. townV1.spec.mjs의 enableTownFlag와 동일 패턴.
async function enableTownFlagOn(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('paulEasyVoca_features', JSON.stringify({ paulTownV1: true })) } catch { /* 무시 */ }
  })
}

const PILOT_IDS = [...PILOT_A_TOWN_STUDENT_IDS]

export async function run(browser, baseURL) {
  const r = createRecorder('[town-pilot-allowlist]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  function collect(mocks) {
    unmockedRequests.push(...mocks.unmockedRequests)
    ttsFallbackRequests.push(...mocks.ttsFallbackRequests)
    mockErrors.push(...mocks.db.errors)
  }

  // ── P1~P5 — 승인된 5명 각각, 기기 플래그 OFF 상태로도 Town V1 진입 ──────
  for (let i = 0; i < PILOT_IDS.length; i++) {
    const pilotId = PILOT_IDS[i]
    const label = `P${i + 1}`
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    // enableTownFlagOn 호출 없음 — 기기 플래그 기본값(OFF) 그대로.
    const mocks = await installMocks(page, { studentId: pilotId })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginStudent(page)
      await goToPaulTownScreen(page)

      const cardVisible = await page.getByText('내 마을 — Welcome to Paul Town')
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${label}(${pilotId}) — 기기 플래그 OFF에도 "내 마을 — Welcome to Paul Town" 카드 표시`, cardVisible)

      const enterVisible = await page.getByText('들어가기', { exact: true }).isVisible().catch(() => false)
      r.check(`${label}(${pilotId}) — "들어가기" 버튼 표시`, enterVisible)

      const card = await enterTownV1Card(page)
      await card.click()
      await waitForTownHeader(page)

      const lvBadgeVisible = await page.locator(LV_BADGE_SEL).isVisible().catch(() => false)
      r.check(`${label}(${pilotId}) — Town V1 헤더 ⭐ 레벨 배지 표시`, lvBadgeVisible)
      const dollarBadgeVisible = await page.locator(DOLLAR_BADGE_SEL).isVisible().catch(() => false)
      r.check(`${label}(${pilotId}) — Town V1 헤더 💵 잔액 배지 표시`, dollarBadgeVisible)
      const shopTabVisible = await page.getByRole('button', { name: '🛒 상점' }).isVisible().catch(() => false)
      r.check(`${label}(${pilotId}) — "🛒 상점" 탭 표시`, shopTabVisible)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${label}(${pilotId}) 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(mocks.db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── N1 — 비승인 fixture UUID, 기기 플래그 OFF → 카드 없음 ────────────────
  {
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    const mocks = await installMocks(page) // studentId 미지정 → 기본 QA_STUDENT_ID(비승인)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginStudent(page)
      await goToPaulTownScreen(page)
      await page.getByText('마을 곳곳').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1000)
      const cardVisible = await townEntryCardVisible(page)
      r.check(`N1(${QA_STUDENT_ID}) — 비승인 UUID + 플래그 OFF는 진입 카드 없음`, cardVisible === false)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check('N1 시나리오 실행 완료(예외 없음)', false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── N2 — 비승인 fixture UUID, 기기 플래그 ON → 카드 있음(기존 동작 보존) ──
  {
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    await enableTownFlagOn(page)
    const mocks = await installMocks(page) // studentId 미지정 → 기본 QA_STUDENT_ID(비승인)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginStudent(page)
      await goToPaulTownScreen(page)
      const cardVisible = await page.getByText('내 마을 — Welcome to Paul Town')
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`N2(${QA_STUDENT_ID}) — 비승인 UUID라도 기기 플래그 ON이면 진입 카드 표시(기존 동작 보존)`, cardVisible)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check('N2 시나리오 실행 완료(예외 없음)', false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── W — 승인 UUID 1명, 환영 지급 비활성 mock(잔액 0/보유 0) → "환영 선물"
  //     토스트 없음 + 잔액 불변(0 유지). 기기 플래그 OFF(Pilot 자격만으로
  //     진입). townV1.spec.mjs EMPTY-WALLET 시나리오와 동일한
  //     townWelcomeDisabled 옵션 재사용. ─────────────────────────────────
  {
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    const pilotId = PILOT_IDS[0]
    const mocks = await installMocks(page, { studentId: pilotId, townWelcomeDisabled: true })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginStudent(page)
      await goToPaulTownScreen(page)
      const card = await enterTownV1Card(page)
      await card.click()
      await waitForTownHeader(page)

      const welcomeClaimAttempted = await waitUntil(() => (mocks.db._townCalls.claim_town_welcome || 0) >= 1, { timeout: 10000 })
      r.check(`W(${pilotId}) — claim_town_welcome 요청이 mock에 도달함(응답 granted:false)`, !!welcomeClaimAttempted)

      const toastLocator = page.getByText('🎁 환영 선물', { exact: false })
      await page.waitForTimeout(2000)
      const toastVisible = await toastLocator.first().isVisible().catch(() => false)
      r.check(`W(${pilotId}) — 환영 지급 비활성 mock에서는 "환영 선물" 토스트가 뜨지 않음`, toastVisible === false)

      const dollarText = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
      r.check(`W(${pilotId}) — 헤더 잔액이 "0"으로 유지됨(환영 20 미지급)`, dollarText.includes('0') && !dollarText.includes('20'), dollarText)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check('W 시나리오 실행 완료(예외 없음)', false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(mocks.db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S — 학생 격리: P1(승인 UUID) 로그인 후 로그아웃 → 같은 컨텍스트(같은
  //     localStorage/기기 플래그 상태)에서 N1(비승인 UUID)로 재로그인하면
  //     카드가 없어야 한다 — 허용목록이 기기가 아니라 UUID 단위임을 확인. ──
  {
    const context = await browser.newContext({ viewport: VIEWPORT })
    const pilotId = PILOT_IDS[0]

    const pageP1 = await context.newPage()
    const mocksP1 = await installMocks(pageP1, { studentId: pilotId })
    try {
      await pageP1.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginStudent(pageP1)
      await goToPaulTownScreen(pageP1)
      const cardVisibleForPilot = await pageP1.getByText('내 마을 — Welcome to Paul Town')
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`S(${pilotId}) — 로그아웃 전 승인 UUID는 진입 카드 표시`, cardVisibleForPilot)

      // 로그아웃 버튼은 Dashboard에만 있다(PaulTown.jsx에는 없음) — 먼저
      // "← 홈으로"로 대시보드로 돌아간 뒤 로그아웃한다.
      await pageP1.getByRole('button', { name: '← 홈으로' }).click()
      await pageP1.getByRole('button', { name: '구경가기' }).waitFor({ state: 'visible', timeout: 15000 })

      pageP1.on('dialog', (d) => d.accept())
      await pageP1.getByRole('button', { name: /로그아웃/ }).click()
      const backToLogin = await pageP1.getByPlaceholder('이름 입력...')
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`S(${pilotId}) — 로그아웃 후 로그인 화면으로 복귀`, backToLogin)
    } catch (err) {
      const bodyText = await pageP1.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check('S(로그아웃 단계) 시나리오 실행 완료(예외 없음)', false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocksP1)
      await pageP1.close()
    }

    // 같은 컨텍스트(공유 localStorage) 안에서 새 페이지 — 비승인 UUID로
    // 로그인. 별도 installMocks 인스턴스가 필요하다(Playwright route는
    // 페이지 단위) — studentId 미지정이라 기본 QA_STUDENT_ID(비승인)를 쓴다.
    const pageN1 = await context.newPage()
    const mocksN1 = await installMocks(pageN1)
    try {
      await pageN1.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginStudent(pageN1)
      await goToPaulTownScreen(pageN1)
      await pageN1.getByText('마을 곳곳').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      await pageN1.waitForTimeout(1000)
      const cardVisibleForN1 = await townEntryCardVisible(pageN1)
      r.check(
        `S(${QA_STUDENT_ID}) — 같은 컨텍스트에서 비승인 UUID로 재로그인하면 진입 카드 없음(허용목록은 기기가 아니라 UUID 단위)`,
        cardVisibleForN1 === false
      )
    } catch (err) {
      const bodyText = await pageN1.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check('S(N1 재로그인 단계) 시나리오 실행 완료(예외 없음)', false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocksN1)
      await pageN1.close()
    }

    await context.close()
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
