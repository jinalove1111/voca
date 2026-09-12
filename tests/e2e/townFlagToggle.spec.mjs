// tests/e2e/townFlagToggle.spec.mjs — 2026-09-12
//
// admin FeatureManagementPanel의 paulTownV1 체크박스 토글이 같은 브라우저
// 세션 안에서(reload 없이도) 학생 로그인 후 실제로 반영되는지 검증한다.
// 운영자가 진단 스크래치 스크립트(reproFlagToggle.mjs, 임시 파일 — 저장소
// 밖 scratchpad)로 이미 재현해 둔 흐름(admin 토글 → 관리자 나가기 → 학생
// 로그인 → 레거시 Paul Town 화면)을 정식 회귀 spec으로 옮긴 것.
//
// staleChunk.spec.mjs와 동일한 계약: run(browser, baseURL) → { results,
// unmockedRequests, mockErrors, ttsFallbackRequests }, 시나리오별 새
// context/page, installMocks()로 전체 네트워크 mock(실 Supabase/Vercel
// 요청 0건 전제), 끝나면 context.close(). 헤더 셀렉터(⭐ 레벨/💵 잔액)는
// townV1.spec.mjs의 title 속성 기반 상수를 그대로 재사용한다(같은 값,
// 다른 세션 소유 파일이라 import는 하지 않고 이 파일 안에 복제 — CLAUDE.md
// 규칙 16).
//
// 뷰포트는 390×844(townV1.spec.mjs 목록 중 하나) 고정 — 이 spec의 목적은
// 반응형 검증이 아니라 플래그 전파 타이밍/영속성이라 여러 뷰포트를 반복할
// 이유가 없다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'

const VIEWPORT = { width: 390, height: 844 }
const ADMIN_PIN = '9999'

// townV1.spec.mjs와 동일한 title 기반 셀렉터(그 파일의 상수 복제, 규칙 16).
const LV_BADGE_SEL = 'span[title="누적 별(성취) — 절대 줄지 않아요"]'
const DOLLAR_BADGE_SEL = 'span[title="사용 가능한 Paul Dollar"]'

async function loginAdmin(page) {
  await page.locator('button', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 90000 })
  await page.locator('button', { hasText: '⚙️ 관리자' }).click()
  await page.getByPlaceholder('비밀번호').fill(ADMIN_PIN)
  await page.locator('button', { hasText: '로그인' }).click()
  await page.locator('h1', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 15000 })
}

async function openFeaturesTabAndExpandAttachment(page) {
  await page.locator('button', { hasText: '🎯 기능' }).click()
  await page.getByText('애착 시스템 (Attachment & Growth)', { exact: true }).click()
  await page.locator('#paulTownV1').waitFor({ state: 'visible', timeout: 5000 })
}

async function leaveAdmin(page) {
  await page.locator('button', { hasText: '← 나가기' }).click()
}

async function loginStudent(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

async function goToLegacyPaulTown(page) {
  await page.locator('button', { hasText: '구경가기' }).waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('button', { hasText: '구경가기' }).click()
  // 화면이 실제로 마운트될 때까지 대기(paulTownV1 값과 무관하게 항상
  // 존재하는 헤딩) — 카드 상태를 읽기 전 CSS 페이드인 트랜지션 도중 값을
  // 읽어 false negative가 나는 것을 방지(reproFlagToggle.mjs에서 이미
  // 실측 확인된 레이스).
  await page.getByText('Paul Town', { exact: true }).waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(600)
}

async function readFeaturesStorage(page) {
  return page.evaluate(() => localStorage.getItem('paulEasyVoca_features'))
}

async function readPaulTownV1FromStorage(page) {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('paulEasyVoca_features') || '{}').paulTownV1 } catch { return 'PARSE_ERROR' }
  })
}

async function checkEntryCardPresent(page) {
  const cardText = await page.getByText('내 마을 — Welcome to Paul Town').isVisible().catch(() => false)
  const enterBtn = await page.getByText('들어가기', { exact: true }).isVisible().catch(() => false)
  return { cardText, enterBtn }
}

export async function run(browser, baseURL) {
  const r = createRecorder('[town-flag]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  // ── F1: control — 토글 없이 레거시 Paul Town(카드/들어가기 부재) ──────
  {
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      const storageBefore = await readFeaturesStorage(page)
      r.check('F1 초기 localStorage.paulEasyVoca_features === null', storageBefore === null, String(storageBefore))

      await loginStudent(page)
      await goToLegacyPaulTown(page)
      const cardState = await checkEntryCardPresent(page)
      r.check('F1 토글 없음 → "내 마을 — Welcome to Paul Town" 카드 부재', cardState.cardText === false, JSON.stringify(cardState))
      r.check('F1 토글 없음 → "들어가기" 버튼 부재', cardState.enterBtn === false, JSON.stringify(cardState))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [F1 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [F1 진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...u)
    ttsFallbackRequests.push(...t)
    mockErrors.push(...db.errors)
  }

  // ── F2: same-session — admin 토글 → 나가기 → 학생 로그인 → Paul Town
  //       카드/들어가기 → Town V1 헤더(⭐/💵) + 🛒 상점 탭 ────────────────
  {
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginAdmin(page)
      await openFeaturesTabAndExpandAttachment(page)

      const checkedBefore = await page.locator('#paulTownV1').isChecked()
      await page.locator('#paulTownV1').click()
      const checkedAfterToggle = await page.locator('#paulTownV1').isChecked()
      r.check('F2 토글 클릭 후 체크박스 checked === true', checkedAfterToggle === true, `before=${checkedBefore} after=${checkedAfterToggle}`)

      const paulTownV1InStorage = await readPaulTownV1FromStorage(page)
      r.check('F2 토글 직후 localStorage.paulEasyVoca_features.paulTownV1 === true', paulTownV1InStorage === true, String(paulTownV1InStorage))

      await leaveAdmin(page)
      await loginStudent(page)
      await goToLegacyPaulTown(page)

      const cardState = await checkEntryCardPresent(page)
      r.check('F2 토글 후(같은 세션) → "내 마을 — Welcome to Paul Town" 카드 표시', cardState.cardText === true, JSON.stringify(cardState))
      r.check('F2 토글 후(같은 세션) → "들어가기" 버튼 표시', cardState.enterBtn === true, JSON.stringify(cardState))

      const enterBtn = page.locator('button', { hasText: '들어가기' })
      await enterBtn.click()

      const lvBadge = page.locator(LV_BADGE_SEL)
      const dollarBadge = page.locator(DOLLAR_BADGE_SEL)
      await lvBadge.waitFor({ state: 'visible', timeout: 15000 })
      const lvVisible = await lvBadge.isVisible().catch(() => false)
      const dollarVisible = await dollarBadge.isVisible().catch(() => false)
      r.check('F2 Town V1 헤더 — ⭐ 레벨 배지 표시', lvVisible)
      r.check('F2 Town V1 헤더 — 💵 잔액 배지 표시', dollarVisible)

      const shopTabVisible = await page.getByRole('button', { name: '🛒 상점' }).isVisible().catch(() => false)
      r.check('F2 Town V1 — "🛒 상점" 탭 표시', shopTabVisible)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [F2 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [F2 진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...u)
    ttsFallbackRequests.push(...t)
    mockErrors.push(...db.errors)
  }

  // ── F3: reload persistence — 토글 후 새로고침해도 저장된 값 유지 ──────
  {
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginAdmin(page)
      await openFeaturesTabAndExpandAttachment(page)
      await page.locator('#paulTownV1').click()
      await leaveAdmin(page)

      await page.reload({ waitUntil: 'domcontentloaded' })
      const paulTownV1AfterReload = await readPaulTownV1FromStorage(page)
      r.check('F3 reload 후에도 localStorage.paulEasyVoca_features.paulTownV1 === true', paulTownV1AfterReload === true, String(paulTownV1AfterReload))

      await loginStudent(page)
      await goToLegacyPaulTown(page)
      const cardState = await checkEntryCardPresent(page)
      r.check('F3 reload 후 학생 로그인 → "내 마을 — Welcome to Paul Town" 카드 표시', cardState.cardText === true, JSON.stringify(cardState))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [F3 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [F3 진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...u)
    ttsFallbackRequests.push(...t)
    mockErrors.push(...db.errors)
  }

  // ── F4: write-failure visibility — setItem이 이 키에서만 throw할 때
  //       현재 동작(체크박스가 unchecked로 되돌아가고, 패널에 에러 문구가
  //       노출되지 않는다)을 있는 그대로 고정한다. 이건 "바람직한 동작"이
  //       아니라 "현재 실제 동작"의 회귀 앵커 — 알려진 UX 갭(에러 무표시)을
  //       개선 없이 문서화만 한다. ───────────────────────────────────────
  {
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()

    await page.addInitScript(() => {
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === 'paulEasyVoca_features') {
          throw new DOMException('Simulated quota exceeded for paulEasyVoca_features', 'QuotaExceededError')
        }
        return orig.apply(this, arguments)
      }
    })

    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginAdmin(page)
      await openFeaturesTabAndExpandAttachment(page)

      await page.locator('#paulTownV1').click().catch(() => { /* 클릭 자체는 실패하지 않을 수 있음 — 아래에서 결과만 확인 */ })
      // React 상태 업데이트/재렌더가 비동기일 수 있어 짧게 대기.
      await page.waitForTimeout(300)

      const checkedAfterToggle = await page.locator('#paulTownV1').isChecked().catch(() => 'ERROR_READING_CHECKBOX')
      r.check('F4 (현재 동작) setItem throw 시 체크박스가 unchecked로 되돌아감', checkedAfterToggle === false, String(checkedAfterToggle))

      const storageAfterToggle = await readFeaturesStorage(page)
      r.check('F4 (현재 동작) setItem throw 시 localStorage.paulEasyVoca_features는 null로 남음', storageAfterToggle === null, String(storageAfterToggle))

      // INFO성 체크 — 패널 안에 "오류"/"Error" 텍스트가 보이는지 관찰만
      // 하고 항상 통과시킨다(현재 구현엔 전용 에러 배너가 없다는 사실 자체가
      // 알려진 갭이라, 그 부재를 실패로 처리하지 않는다).
      const anyVisibleErrorText = await page.getByText(/오류|Error/i).first().isVisible().catch(() => false)
      console.log(`  INFO  [town-flag] F4 (관찰용) 패널 내 "오류"/"Error" 텍스트 노출 여부=${anyVisibleErrorText}`)

      // 알려진 UX 갭 고정 — 쓰기 실패를 사용자에게 알리는 에러 표시가 현재
      // 없다(false로 항상 실패하지 않고, 이 자체를 "현재 동작"으로 단언).
      r.check('F4 (알려진 갭, 개선 대상 아님) 쓰기 실패 시 화면에 에러가 노출되지 않음', anyVisibleErrorText === false, `anyVisibleErrorText=${anyVisibleErrorText}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [F4 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [F4 진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`
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
