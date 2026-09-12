// tests/e2e/townFlagCrossTab.spec.mjs — 2026-09-12 Kinney Pilot A 사고 회귀.
//
// 실사고: Samsung Internet(Kinney 학생 반)에서 관리자가 "🎯 기능" 패널로
// paulTownV1을 켰고 저장도 됐는데(관리자 탭의 체크박스는 켜짐으로 표시),
// 이미 로그인 상태로 열려 있던 학생 탭은 새로고침 없이는 여전히 구버전
// Paul Town(내 마을 카드 없음)을 보여줬다. 근본 원인은 src/config/
// features.js의 currentFeatures가 페이지 인스턴스당 한 번만 로드되고,
// 다른 탭/이전에 열린 인스턴스가 그 변경을 다시 읽어올 방법(storage 이벤트,
// 포커스/가시성 재조회)이 전혀 없었기 때문(자세한 배경은 그 파일의
// 2026-09-12 헤더 주석). 이 스펙은 실제 브라우저의 "같은 브라우저, 두 탭"
// 구성으로 그 사고를 재현하고(수정 전 코드에서 FAIL했음을
// docs/operations의 규칙 15 증거로 별도 확인) 수정 후에는 새로고침 없이도
// 반영되는지 검증한다.
//
// staleChunk.spec.mjs/townV1.spec.mjs와 동일한 mock 전체 가로채기
// (installMocks) + 결정론 폴링(waitUntil) 관례를 따르되, 새 파일이라
// 필요한 소규모 헬퍼는 복제한다(파일당 소유권 원칙, CLAUDE.md 규칙 16 —
// 다른 spec과 동시에 같은 파일을 건드리지 않게).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { ADMIN_PIN, QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'

async function waitUntil(fn, { timeout = 15000, interval = 150 } = {}) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    try { last = await fn() } catch { last = undefined }
    if (last) return last
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  return last
}

async function loginAdmin(page) {
  await page.locator('button', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 90000 })
  await page.locator('button', { hasText: '⚙️ 관리자' }).click()
  await page.getByPlaceholder('비밀번호').fill(ADMIN_PIN)
  await page.locator('button', { hasText: '로그인' }).click()
  await page.locator('h1', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 15000 })
}

// AdminScreen 탭 목록 중 "🎯 기능" → FeatureManagementPanel → "애착 시스템
// (Attachment & Growth)" 카테고리를 펼친다(paulTownV1을 비롯해 이 스펙이
// 건드리는 체크박스가 모두 이 카테고리에 있음, features.js DEFAULT_FEATURES
// 참고). 이미 펼쳐져 있어도(재클릭으로 접히는 것 방지) 안전하게 멱등이 되도록
// 체크박스가 보일 때까지만 기다린다.
async function expandAttachmentCategory(page) {
  await page.locator('button', { hasText: '🎯 기능' }).click()
  const heading = page.getByText('애착 시스템 (Attachment & Growth)')
  await heading.waitFor({ state: 'visible', timeout: 10000 })
  const paulTownCheckbox = page.locator('#paulTownV1')
  if (!(await paulTownCheckbox.isVisible().catch(() => false))) {
    await heading.click()
    await paulTownCheckbox.waitFor({ state: 'visible', timeout: 10000 })
  }
}

// 임의의 개별 기능 체크박스를 토글(현재 상태의 반대로)한다 — 2026-09-12
// 시나리오 E/G가 paulTownV1 외의 플래그도 다루기 위한 범용 헬퍼.
async function toggleFeatureCheckbox(page, featureName) {
  const checkbox = page.locator(`#${featureName}`)
  await checkbox.waitFor({ state: 'visible', timeout: 10000 })
  const wasChecked = await checkbox.isChecked()
  await checkbox.click()
  await waitUntil(async () => (await checkbox.isChecked()) === !wasChecked)
}

async function togglePaulTownV1Flag(page) {
  await expandAttachmentCategory(page)
  await toggleFeatureCheckbox(page, 'paulTownV1')
}

async function readStoredPaulTownV1(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('paulEasyVoca_features')
      const parsed = raw ? JSON.parse(raw) : null
      return parsed ? parsed.paulTownV1 === true : false
    } catch {
      return null
    }
  })
}

// 2026-09-12 — FeatureManagementPanel의 온디바이스 진단 UI(저장됨:/주소
// 라인) 회귀. localStorage 전체를 파싱해 돌려준다(getAllFeatures 메모리
// 캐시가 아니라 저장소 그 자체 — 관리자 화면이 보여주는 것과 같은 소스).
async function readAllStoredFeatures(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('paulEasyVoca_features')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
}

// 특정 featureName의 <label htmlFor=featureName> 안에 렌더되는 "저장됨: …"
// 텍스트를 읽는다(FeatureManagementPanel.jsx가 그 label 안에 렌더).
async function readPersistedLineText(page, featureName) {
  const label = page.locator(`label[for="${featureName}"]`)
  await label.waitFor({ state: 'visible', timeout: 10000 })
  return label.innerText()
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

export async function run(browser, baseURL) {
  const r = createRecorder('[town-flag-xtab]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  // ── 시나리오 1(핵심 회귀): 같은 컨텍스트, 두 탭 ─────────────────────────
  // Page B를 먼저 열어 "관리자가 토글하기 전부터 열려 있던 학생 탭"을
  // 만든 뒤, Page A에서 토글하고, Page B를 새로고침 없이 그대로 사용한다.
  {
    const context = await browser.newContext()
    const pageB = await context.newPage()
    const pageA = await context.newPage()
    const mocksB = await installMocks(pageB)
    const mocksA = await installMocks(pageA)

    try {
      // Page B — 먼저 로드해서 학생 선택 화면에 그대로 둔다(로그인 전).
      await pageB.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await pageB.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
      r.check('S1 Page B가 토글 전에 먼저 로드됨(학생 선택 화면)', true)

      // Page A — 관리자 로그인 → 🎯 기능 → 애착 시스템 → paulTownV1 ON.
      await pageA.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginAdmin(pageA)
      await togglePaulTownV1Flag(pageA)
      const storedTrue = await readStoredPaulTownV1(pageA)
      r.check('S1 Page A에서 토글 후 localStorage.paulTownV1 === true', storedTrue === true, storedTrue)

      // Page B — 새로고침 없이 그대로 로그인 → 대시보드 → 구경가기.
      await loginStudent(pageB)
      await goToPaulTownScreen(pageB)
      const cardVisibleNoReload = await waitUntil(() => townEntryCardVisible(pageB))
      r.check(
        'S1(핵심) Page B가 리로드 없이 "🏘 내 마을" 진입 카드를 봄 — 수정 전 코드에서는 FAIL했던 지점',
        cardVisibleNoReload === true
      )

      const enterBtn = pageB.locator('button', { hasText: '들어가기' })
      const enterBtnVisible = await enterBtn.isVisible().catch(() => false)
      r.check('S1 "들어가기" 버튼 노출', enterBtnVisible === true)
      if (enterBtnVisible) {
        await enterBtn.click()
        const shopTabVisible = await waitUntil(() => pageB.getByRole('button', { name: '🛒 상점' }).isVisible().catch(() => false))
        r.check('S1 들어가기 클릭 후 Town V1 화면 "🛒 상점" 탭 노출', shopTabVisible === true)
        const lvBadgeVisible = await pageB.locator('span[title="누적 별(성취) — 절대 줄지 않아요"]').isVisible().catch(() => false)
        r.check('S1 Town V1 헤더(레벨 배지) 노출', lvBadgeVisible === true)
      } else {
        r.check('S1 들어가기 클릭 후 Town V1 화면 "🛒 상점" 탭 노출', false, 'S1 진입 카드/버튼이 없어 스킵됨')
        r.check('S1 Town V1 헤더(레벨 배지) 노출', false, 'S1 진입 카드/버튼이 없어 스킵됨')
      }
    } catch (err) {
      const bodyTextB = await pageB.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [S1 진단] mockErrors(B)=${JSON.stringify(mocksB.db.errors.slice(0, 3))}\n  [S1 진단] body(B, 앞 400자)=${JSON.stringify(bodyTextB.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...mocksA.unmockedRequests, ...mocksB.unmockedRequests)
    ttsFallbackRequests.push(...mocksA.ttsFallbackRequests, ...mocksB.ttsFallbackRequests)
    mockErrors.push(...mocksA.db.errors, ...mocksB.db.errors)
  }

  // ── 시나리오 2: 새로고침 후에도 유지(영속성) ────────────────────────────
  {
    const context = await browser.newContext()
    const pageB = await context.newPage()
    const pageA = await context.newPage()
    const mocksB = await installMocks(pageB)
    const mocksA = await installMocks(pageA)

    try {
      await pageB.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await pageB.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })

      await pageA.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginAdmin(pageA)
      await togglePaulTownV1Flag(pageA)

      await pageB.reload({ waitUntil: 'domcontentloaded' })
      await loginStudent(pageB)
      await goToPaulTownScreen(pageB)
      const cardVisibleAfterReload = await waitUntil(() => townEntryCardVisible(pageB))
      r.check('S2 Page B를 새로고침한 뒤에도 "🏘 내 마을" 진입 카드가 보임(영속성)', cardVisibleAfterReload === true)
    } catch (err) {
      const bodyTextB = await pageB.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [S2 진단] mockErrors(B)=${JSON.stringify(mocksB.db.errors.slice(0, 3))}\n  [S2 진단] body(B, 앞 400자)=${JSON.stringify(bodyTextB.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...mocksA.unmockedRequests, ...mocksB.unmockedRequests)
    ttsFallbackRequests.push(...mocksA.ttsFallbackRequests, ...mocksB.ttsFallbackRequests)
    mockErrors.push(...mocksA.db.errors, ...mocksB.db.errors)
  }

  // ── 대조군: 토글 없이 로그인 → 진입 카드 없음(기본값 무변화) ────────────
  {
    const context = await browser.newContext()
    const page = await context.newPage()
    const mocks = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginStudent(page)
      await goToPaulTownScreen(page)
      // 카드가 없다는 것은 "끝내 안 나타남"을 증명해야 하므로, 존재를
      // 기다리지 않고(있으면 즉시 true) 짧게 폴링한 뒤 없음을 확정한다.
      await page.waitForTimeout(1000)
      const cardVisible = await townEntryCardVisible(page)
      r.check('대조군 — 토글 없이는 "🏘 내 마을" 진입 카드가 없음(플래그 기본값 false)', cardVisible === false)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [대조군 진단] mockErrors=${JSON.stringify(mocks.db.errors.slice(0, 3))}\n  [대조군 진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...mocks.unmockedRequests)
    ttsFallbackRequests.push(...mocks.ttsFallbackRequests)
    mockErrors.push(...mocks.db.errors)
  }

  // ── 시나리오 E: paulTownV1을 다시 끄면 저장됨 라인/새 학생 탭 카드가
  //    즉시 그 사실을 반영(온디바이스 진단 UI 2026-09-12 추가분 회귀) ──────
  {
    const context = await browser.newContext()
    const pageA = await context.newPage()
    const mocksA = await installMocks(pageA)
    let mocksC

    try {
      await pageA.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginAdmin(pageA)
      await togglePaulTownV1Flag(pageA) // ON
      const lineOn = await readPersistedLineText(pageA, 'paulTownV1')
      r.check('E paulTownV1 ON 직후 저장됨 라인이 true를 보여줌', lineOn.includes('저장됨: true'), lineOn)

      await toggleFeatureCheckbox(pageA, 'paulTownV1') // OFF
      const storedAfterOff = await readAllStoredFeatures(pageA)
      r.check(
        'E OFF 토글 후 localStorage.paulTownV1 === false',
        !!storedAfterOff && storedAfterOff.paulTownV1 === false,
        storedAfterOff
      )
      const lineOff = await readPersistedLineText(pageA, 'paulTownV1')
      r.check('E OFF 토글 후 저장됨 라인이 false를 보여줌', lineOff.includes('저장됨: false'), lineOff)

      // 새 탭(같은 컨텍스트) — 리로드가 아니라 완전히 새로 연 페이지.
      const pageC = await context.newPage()
      mocksC = await installMocks(pageC)
      await pageC.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginStudent(pageC)
      await goToPaulTownScreen(pageC)
      await pageC.waitForTimeout(1000)
      const cardVisible = await townEntryCardVisible(pageC)
      r.check('E 새 학생 탭 — paulTownV1을 다시 끈 뒤에는 진입 카드가 없음', cardVisible === false)
    } catch (err) {
      const bodyTextA = await pageA.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [E 진단] mockErrors(A)=${JSON.stringify(mocksA.db.errors.slice(0, 3))}\n  [E 진단] body(A, 앞 400자)=${JSON.stringify(bodyTextA.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...mocksA.unmockedRequests)
    ttsFallbackRequests.push(...mocksA.ttsFallbackRequests)
    mockErrors.push(...mocksA.db.errors)
    if (mocksC) {
      unmockedRequests.push(...mocksC.unmockedRequests)
      ttsFallbackRequests.push(...mocksC.ttsFallbackRequests)
      mockErrors.push(...mocksC.db.errors)
    }
  }

  // ── 시나리오 G: paulTownV1 토글이 다른 플래그를 건드리지 않음 + 저장됨/
  //    화면 주소 진단 라인 노출(온디바이스 진단 UI 2026-09-12 추가분 회귀) ──
  {
    const context = await browser.newContext()
    const page = await context.newPage()
    const mocks = await installMocks(page)

    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginAdmin(page)
      // "이 화면의 주소:" 라인은 FeatureManagementPanel의 features 탭
      // 안에서만 렌더된다 — 관리자 로그인 직후 기본 탭은 "🎯 기능"이 아니라
      // 대시보드이므로, 먼저 "🎯 기능" 탭으로 이동해야 한다(2026-09-12).
      await expandAttachmentCategory(page)

      const originLine = page.getByText('이 화면의 주소:')
      await originLine.waitFor({ state: 'visible', timeout: 10000 })
      const originText = await originLine.innerText()
      r.check('G 주소 라인이 http://localhost: 를 포함', originText.includes('http://localhost:'), originText)

      // paulTownV1 토글 "전" 스냅샷을 비어있지 않게 만들기 위해 다른
      // 플래그(attachmentBookshelf)를 먼저 한 번 건드려 저장소를 채운다 —
      // 그래야 "토글 전후 다른 키 무변화" 비교가 트리비얼하지 않다.
      await toggleFeatureCheckbox(page, 'attachmentBookshelf')
      const before = await readAllStoredFeatures(page)

      await toggleFeatureCheckbox(page, 'paulTownV1')
      const after = await readAllStoredFeatures(page)
      r.check('G paulTownV1 토글 후 townShopV1은 여전히 false', !!after && after.townShopV1 === false, after)

      const beforeObj = before || {}
      const afterObj = after || {}
      const changedOtherKeys = Object.keys({ ...beforeObj, ...afterObj }).filter(
        (k) => k !== 'paulTownV1' && beforeObj[k] !== afterObj[k]
      )
      r.check(
        'G paulTownV1 외 다른 플래그는 토글 전후 값이 그대로(스냅샷 비교)',
        changedOtherKeys.length === 0,
        changedOtherKeys
      )

      const lineOn = await readPersistedLineText(page, 'paulTownV1')
      r.check('G 저장됨: true 라인이 paulTownV1 옆에 노출', lineOn.includes('저장됨: true'), lineOn)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [G 진단] mockErrors=${JSON.stringify(mocks.db.errors.slice(0, 3))}\n  [G 진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    unmockedRequests.push(...mocks.unmockedRequests)
    ttsFallbackRequests.push(...mocks.ttsFallbackRequests)
    mockErrors.push(...mocks.db.errors)
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
