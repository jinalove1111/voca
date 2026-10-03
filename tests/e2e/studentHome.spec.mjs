// tests/e2e/studentHome.spec.mjs
//
// 학생 홈(studentHomeMenu, 2026-10-02) 회귀 스펙 — 로그인 직후 첫 화면(4메뉴
// 카드/시작 버튼/준비 중 안내/나의 성장/내 마을/키보드/킬 스위치/로그아웃/
// Writing 플래그). 실제 Supabase/Vercel 요청 0건(mockRoutes 전체 mock).
// 파일당 소유권 원칙(규칙 16)에 따라 다른 spec의 헬퍼는 import하지 않고 복제한다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
// 승인 UUID는 진실 원천(src/config/pilotTown.js)을 그대로 읽는다(townPilotAllowlist.spec 동일).
import { PILOT_A_TOWN_STUDENT_IDS } from '../../src/config/pilotTown.js'

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 800 },
]
const MAIN_VP = VIEWPORTS[1]

const HOME = '[data-testid="student-home"]'
const NOTICE = '[data-testid="student-home-notice"]'
const card = (page, id) => page.locator(`[data-testid="student-home-menu-${id}"]`)
const WRITING_SOON = '문장 쓰기는 곧 열려요! 조금만 기다려요'

function vpName(vp) { return `[${vp.width}x${vp.height}]` }

async function waitUntil(fn, { timeout = 15000, interval = 150 } = {}) {
  const start = Date.now()
  let last
  while (true) {
    try { last = await fn() } catch { last = undefined }
    if (last) return last
    if (Date.now() - start >= timeout) return last
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

async function setDeviceFlags(page, flags) {
  await page.addInitScript((flagsJson) => {
    try { localStorage.setItem('paulEasyVoca_features', flagsJson) } catch { /* 무시 */ }
  }, JSON.stringify(flags))
}

// 이 spec은 홈을 직접 검증하므로 enterVocaFromHome을 쓰지 않는다.
async function loginOnly(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

async function waitHome(page, timeout = 20000) {
  return page.locator(HOME).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
}
async function waitDashboard(page, timeout = 15000) {
  return page.getByLabel('교과서 선택').waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
}

const noHorizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const activeTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.textContent?.trim() || null)

// 로그인 직후 허용되는 REST 쓰기(townProto25d.spec LOGIN_SYNC_REST_WRITES와 동일).
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
function unexpectedRestWrites(apiCallLog) {
  return apiCallLog
    .filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method))
    .filter((c) => { let p; try { p = new URL(c.url).pathname } catch { p = c.url.split('?')[0] } return !LOGIN_WRITES.includes(p) })
    .map((c) => `${c.method} ${c.url.split('?')[0]}`)
}

export async function run(browser, baseURL) {
  const r = createRecorder('[student-home]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  // 시나리오 하나 = 독립 context/page/mock. 콘솔/페이지 오류 0, (writeGuard)
  // 로그인 외 REST 쓰기 0을 공통 단언한다. 본문에서 던진 예외는 FAIL로 기록
  // (나머지 시나리오는 계속).
  async function scenario(label, vp, { flags, writeGuard = true, dialogAccept = false, townState, studentId } = {}, body) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    // 네트워크 mock 404/abort가 남기는 브라우저 자체 로그("Failed to load resource")는 제외.
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const dialogs = []
    page.on('dialog', async (d) => { dialogs.push(d.message()); if (dialogAccept) await d.accept(); else await d.dismiss() })
    if (flags) await setDeviceFlags(page, flags)
    const { db, unmockedRequests: u, ttsFallbackRequests: t, apiCallLog } = await installMocks(page, { ...(townState ? { townState } : {}), ...(studentId ? { studentId } : {}) })
    const name = `${label} ${vpName(vp)}`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, dialogs })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      if (writeGuard) {
        const bad = unexpectedRestWrites(apiCallLog)
        r.check(`${name} 로그인 동기화 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      await context.close()
    }
    unmockedRequests.push(...u)
    ttsFallbackRequests.push(...t)
    mockErrors.push(...db.errors)
  }

  // ── a. 첫 화면 = 홈, 레이아웃(4 뷰포트) ───────────────────────────────
  for (const vp of VIEWPORTS) {
    await scenario('a 첫 화면', vp, {}, async ({ page, name }) => {
      r.check(`${name} 로그인 직후 학생 홈이 첫 화면`, await waitHome(page))
      const h1 = ((await page.locator(`${HOME} h1`).textContent().catch(() => '')) || '').trim()
      r.check(`${name} h1에 이름+"안녕!"`, h1.includes(QA_STUDENT_NAME) && h1.includes('안녕!'), h1)
      r.check(`${name} 단어 카드("교과서 선택")는 홈에서 안 보임`, !(await page.getByLabel('교과서 선택').isVisible().catch(() => false)))
      r.check(`${name} SpeedBtn 0개`, (await page.locator('button[aria-label="발음 재생 속도"]').count()) === 0)
      r.check(`${name} 가로 스크롤 없음`, await noHorizontalOverflow(page))
      r.check(`${name} nav[aria-label="메인 메뉴"] 존재`, (await page.locator('nav[aria-label="메인 메뉴"]').count()) === 1)

      const boxes = []
      for (const id of ['voca', 'writing', 'speaking', 'growth']) {
        const c = card(page, id)
        r.check(`${name} ${id} 카드 보임`, await c.isVisible().catch(() => false))
        const b = await c.boundingBox()
        boxes.push(b)
        r.check(`${name} ${id} 카드 크기 >=144 x >=44`, !!b && b.height >= 144 - 0.5 && b.width >= 44, JSON.stringify(b))
        // 한글 라벨 클리핑 없음 — 카드 안 span(이름/영문/배지) scrollWidth <= clientWidth+2
        const clipped = await c.evaluate((el) => [...el.querySelectorAll('span')].filter((s) => s.scrollWidth > s.clientWidth + 2).map((s) => s.textContent))
        r.check(`${name} ${id} 카드 라벨 클리핑 없음`, clipped.length === 0, clipped.join(','))
      }
      const [b1, b2, b3] = boxes
      r.check(`${name} 2열 — 카드1·2 같은 행(y ±2)`, !!b1 && !!b2 && Math.abs(b1.y - b2.y) <= 2, `${b1?.y} vs ${b2?.y}`)
      r.check(`${name} 카드1·3 세로로 쌓임`, !!b1 && !!b3 && b3.y >= b1.y + b1.height - 2, `${b1?.y}+${b1?.height} vs ${b3?.y}`)
    })
  }

  // ── b. 시작 버튼 → 가이드 세션 → 대시보드 → 홈 ─────────────────────────
  // fixture daily_assignments가 비어 있으므로 라벨은 "▶ 단어 연습 시작하기".
  // 가이드 세션은 진도 쓰기가 생길 수 있어 writeGuard 제외.
  await scenario('b 시작 버튼', MAIN_VP, { writeGuard: false }, async ({ page, name }) => {
    await waitHome(page)
    const startBtn = page.getByRole('button', { name: '▶ 단어 연습 시작하기' })
    const startAlt = page.getByRole('button', { name: '▶ 오늘 연습 시작하기' })
    r.check(`${name} 시작 버튼 라벨 = "▶ 단어 연습 시작하기"(오늘 숙제 없음 fixture)`, await startBtn.isVisible().catch(() => false))
    r.check(`${name} "▶ 오늘 연습 시작하기"는 보이지 않음`, !(await startAlt.isVisible().catch(() => false)))
    await startBtn.click()
    const hero = await page.locator('h1.word-text-hero').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
    r.check(`${name} 시작 → 가이드 세션 첫 단어(h1.word-text-hero) 표시`, hero)
    r.check(`${name} 가이드 세션에서 홈 루트는 사라짐`, (await page.locator(HOME).count()) === 0)
    await page.getByRole('button', { name: '← 홈' }).first().click()
    r.check(`${name} 가이드 "← 홈" → 대시보드(onDone)`, await waitDashboard(page))
    await page.getByRole('button', { name: '← 홈' }).click()
    r.check(`${name} 대시보드 "← 홈" → 학생 홈`, await waitHome(page))
  })

  // ── c. 단어 카드 → 대시보드, ← 홈, 로그아웃, 포커스 복귀 ────────────────
  await scenario('c 단어 카드', MAIN_VP, {}, async ({ page, name }) => {
    await waitHome(page)
    await card(page, 'voca').click()
    r.check(`${name} 단어 카드 → "교과서 선택" 보임`, await waitDashboard(page))
    r.check(`${name} 대시보드에 "← 홈" 보임`, await page.getByRole('button', { name: '← 홈' }).isVisible().catch(() => false))
    r.check(`${name} 대시보드에 로그아웃 존재`, (await page.getByRole('button', { name: /로그아웃/ }).count()) >= 1)
    await page.getByRole('button', { name: '← 홈' }).click()
    r.check(`${name} "← 홈" → 홈`, await waitHome(page))
    const focused = await waitUntil(async () => (await activeTestId(page)) === 'student-home-menu-voca', { timeout: 3000, interval: 100 })
    r.check(`${name} 하위 화면 복귀 시 포커스가 단어 카드로 복귀`, !!focused, String(await activeTestId(page)))
  })

  // ── d. 준비 중 카드 ──────────────────────────────────────────────────
  for (const vp of [VIEWPORTS[0], MAIN_VP]) {
    await scenario('d 준비 중', vp, {}, async ({ page, name }) => {
      await waitHome(page)
      const notice = page.locator(NOTICE)
      r.check(`${name} notice는 role=status이고 처음엔 비어 있음`,
        (await notice.getAttribute('role')) === 'status' && ((await notice.textContent()) || '').trim() === '')
      // 말하기는 speakingPracticeV1 기본 ON이라 활성 카드 — 준비 중 계약은 speaking.spec(h, 플래그 OFF)에서 검증.
      for (const [id, text] of [['writing', WRITING_SOON]]) {
        const c = card(page, id)
        r.check(`${name} ${id} aria-disabled="true"`, (await c.getAttribute('aria-disabled')) === 'true')
        // Playwright는 aria-disabled="true"를 disabled로 취급(isDisabled()=true, click()은 enabled를 영원히 대기)하므로
        // 네이티브 disabled가 아님을 DOM으로 직접 확인하고, 클릭은 force로 한다(실제 DOM click 핸들러는 그대로 실행됨).
        r.check(`${name} ${id} 네이티브 disabled 아님 + aria-disabled=true(포커스 가능)`, await c.evaluate((el) => el.disabled === false && el.getAttribute('aria-disabled') === 'true'))
        r.check(`${name} ${id} "준비 중" 배지`, ((await c.textContent()) || '').includes('준비 중'))
        await c.focus()
        r.check(`${name} ${id} focus() 가능`, (await activeTestId(page)) === `student-home-menu-${id}`)
        await c.click({ force: true })
        const shown = await waitUntil(async () => ((await notice.textContent()) || '').trim() === text, { timeout: 2000, interval: 100 })
        r.check(`${name} ${id} 누르면 안내문 "${text}"`, !!shown, ((await notice.textContent()) || '').trim())
      }
      r.check(`${name} speaking 카드는 활성(aria-disabled 없음, 준비 중 배지 없음)`, (await card(page, 'speaking').getAttribute('aria-disabled')) === null && !((await card(page, 'speaking').textContent()) || '').includes('준비 중'))
      // 안내가 떠 있는 상태에서 방치 → 약 4초 후 자동으로 비워짐
      const cleared = await waitUntil(async () => ((await notice.textContent()) || '').trim() === '', { timeout: 5500, interval: 150 })
      r.check(`${name} 안내문이 ~4.5초 안에 자동으로 사라짐`, !!cleared)
      r.check(`${name} 준비 중 카드로는 화면 이동 없음`, await page.locator(HOME).isVisible().catch(() => false))
      await card(page, 'voca').click()
      r.check(`${name} 단어 카드는 정상 이동`, await waitDashboard(page))
    })
  }

  // ── e. 나의 성장 ─────────────────────────────────────────────────────
  // fixture student_progress=[] → streak 0/history 비어 있음 → 빈 상태.
  await scenario('e 나의 성장', MAIN_VP, {}, async ({ page, name }) => {
    await waitHome(page)
    await card(page, 'growth').click()
    const h1 = await page.getByRole('heading', { name: '나의 성장', level: 1 }).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
    r.check(`${name} h1 "나의 성장"`, h1)
    for (const label of ['연속 일수', '모은 별', '공부한 날']) {
      r.check(`${name} 통계 카드 "${label}"`, await page.getByText(label, { exact: true }).isVisible().catch(() => false))
    }
    const values = await page.locator('[data-testid="student-growth"] .text-3xl').allTextContents()
    r.check(`${name} 통계 숫자 3개 — 기록 없음이므로 모두 "-"`, values.length === 3 && values.every((v) => v.trim() === '-'), JSON.stringify(values))
    r.check(`${name} 빈 상태 문구`, await page.getByText('아직 기록이 없어요. 오늘 단어 연습을 하면 여기에 쌓여요!').isVisible().catch(() => false))
    r.check(`${name} "단어 연습하러 가기" 버튼`, await page.getByRole('button', { name: '단어 연습하러 가기' }).isVisible().catch(() => false))
    r.check(`${name} SpeedBtn 0개`, (await page.locator('button[aria-label="발음 재생 속도"]').count()) === 0)
    r.check(`${name} 가로 스크롤 없음`, await noHorizontalOverflow(page))
    const link = page.locator('[data-testid="student-growth-link-studyCalendar"]')
    r.check(`${name} 공부 캘린더 링크 존재`, await link.isVisible().catch(() => false))
    await link.click()
    r.check(`${name} 캘린더 화면(h1 "공부 캘린더")`, await page.getByRole('heading', { name: /공부 캘린더/ }).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))
    // 성장에서 연 하위 화면의 back은 나의 성장으로 돌아온다.
    await page.getByRole('button', { name: '← 홈' }).click()
    r.check(`${name} 캘린더 back → 나의 성장(h1)`, await page.getByRole('heading', { name: '나의 성장', level: 1 }).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))
    await page.getByRole('button', { name: '← 홈' }).click()
    r.check(`${name} 성장 화면 "← 홈" → 학생 홈`, await waitHome(page))
  })

  // ── f. 내 마을 ──────────────────────────────────────────────────────
  await scenario('f 내 마을', MAIN_VP, {}, async ({ page, name }) => {
    await waitHome(page)
    const town = page.locator('[data-testid="student-home-town"]')
    const visible = await town.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
    r.check(`${name} 내 마을 버튼 표시(paulTownHomeBand 기본 ON + stats 로드)`, visible)
    if (!visible) return
    // 비승인 학생(기본 QA, paulTownV1 OFF) — 라벨이 "내 마을"이면 허브에 내 마을 카드가 없어 오해를 부른다.
    r.check(`${name} 비자격 학생 — 버튼 라벨 "🏘️ Paul Town 구경가기"`, ((await town.textContent()) || '').trim() === '🏘️ Paul Town 구경가기', ((await town.textContent()) || '').trim())
    r.check(`${name} 비자격 학생 — data-town-eligible="false"`, (await town.getAttribute('data-town-eligible')) === 'false', String(await town.getAttribute('data-town-eligible')))
    await town.click()
    r.check(`${name} 내 마을 → Paul Town 허브(h1 "Paul Town")`, await page.getByRole('heading', { name: 'Paul Town', level: 1 }).waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false))
    r.check(`${name} 비자격 학생 — 허브에 "내 마을 — Welcome to Paul Town" 카드 없음(Pilot A 게이팅)`, !(await page.getByText('내 마을 — Welcome to Paul Town').isVisible().catch(() => false)))
    await page.getByRole('button', { name: '← 홈으로' }).click()
    r.check(`${name} 홈의 내 마을에서 연 허브 back → 학생 홈`, await waitHome(page))
  })

  // ── m. 내 마을 자격 ON — 라벨 "🏘️ 내 마을" + 허브 카드 ────────────────
  const LV_BADGE = 'span[title="누적 별(성취) — 절대 줄지 않아요"]'
  const eligibleTownChecks = async (page, name, { fullRoundTrip }) => {
    await waitHome(page)
    const town = page.locator('[data-testid="student-home-town"]')
    const visible = await town.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
    r.check(`${name} 내 마을 버튼 표시`, visible)
    if (!visible) return
    r.check(`${name} 자격 학생 — 버튼 라벨 "🏘️ 내 마을"`, ((await town.textContent()) || '').trim() === '🏘️ 내 마을', ((await town.textContent()) || '').trim())
    r.check(`${name} 자격 학생 — data-town-eligible="true"`, (await town.getAttribute('data-town-eligible')) === 'true', String(await town.getAttribute('data-town-eligible')))
    await town.click()
    r.check(`${name} 허브에 "내 마을 — Welcome to Paul Town" 카드 표시`, await page.getByText('내 마을 — Welcome to Paul Town').waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false))
    if (!fullRoundTrip) return
    await page.locator('button', { hasText: '들어가기' }).click()
    r.check(`${name} 카드 → Town V1 화면(⭐ 레벨 배지)`, await page.locator(LV_BADGE).waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))
    await page.getByRole('button', { name: /← Paul Town/ }).click()
    r.check(`${name} Town back → 허브`, await page.getByRole('heading', { name: 'Paul Town', level: 1 }).waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))
    await page.getByRole('button', { name: '← 홈으로' }).click()
    r.check(`${name} 허브 back → 학생 홈`, await waitHome(page))
  }
  await scenario('m(i) 자격 ON(paulTownV1 플래그)', MAIN_VP, { flags: { paulTownV1: true } }, async ({ page, name }) => {
    await eligibleTownChecks(page, name, { fullRoundTrip: true })
  })
  // 플래그 기본값 + 승인 UUID 로그인(townPilotAllowlist.spec P1과 동일 메커니즘: installMocks({ studentId }))
  await scenario('m(ii) 자격 ON(Pilot A UUID)', MAIN_VP, { studentId: [...PILOT_A_TOWN_STUDENT_IDS][0] }, async ({ page, name }) => {
    await eligibleTownChecks(page, name, { fullRoundTrip: false })
  })

  // ── n. 그림 시험 바로 가기(Speaking UX v2) — 두 플래그 ON일 때만 ──────
  await scenario('n 시험 바로 가기 ON', MAIN_VP, {}, async ({ page, name }) => {
    await waitHome(page)
    const b = page.locator('[data-testid="student-home-speaking-exam"]')
    r.check(`${name} 두 플래그 ON → 시험 바로 가기 버튼 보임`, await b.isVisible().catch(() => false))
    r.check(`${name} 버튼 높이 >=44px`, ((await b.boundingBox())?.height ?? 0) >= 43.5)
    r.check(`${name} 메인 4카드는 그대로(nav 안 버튼 4개)`, (await page.locator('nav[aria-label="메인 메뉴"] button').count()) === 4)
  })
  for (const [label, flags] of [['situationRecallV1 OFF', { situationRecallV1: false }], ['speakingPracticeV1 OFF', { speakingPracticeV1: false }]]) {
    await scenario(`n 시험 바로 가기 ${label}`, MAIN_VP, { flags }, async ({ page, name }) => {
      await waitHome(page)
      r.check(`${name} 시험 바로 가기 버튼 없음`, (await page.locator('[data-testid="student-home-speaking-exam"]').count()) === 0)
    })
  }

  // ── g. 키보드 ───────────────────────────────────────────────────────
  await scenario('g 키보드', MAIN_VP, {}, async ({ page, name }) => {
    await waitHome(page)
    await page.locator('[data-testid="student-home-town"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
    await page.locator(`${HOME} h1`).click() // 순차 포커스 시작점을 h1로
    const seq = []
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); seq.push(await activeTestId(page)) }
    const expected = ['로그아웃', '▶ 단어 연습 시작하기', 'student-home-menu-voca', 'student-home-menu-writing', 'student-home-menu-speaking', 'student-home-menu-growth', 'student-home-speaking-exam', 'student-home-town']
    r.check(`${name} Tab 순서 = 로그아웃 → 시작 → 카드4 → 그림 시험 바로 가기 → 내 마을`, JSON.stringify(seq) === JSON.stringify(expected), JSON.stringify(seq))
    await card(page, 'voca').focus()
    await page.keyboard.press('Enter')
    r.check(`${name} 단어 카드에서 Enter → 대시보드`, await waitDashboard(page))
  })

  // ── h. 킬 스위치(studentHomeMenu=false) ─────────────────────────────
  await scenario('h 플래그 OFF', MAIN_VP, { flags: { studentHomeMenu: false } }, async ({ page, name }) => {
    r.check(`${name} 로그인 직후 대시보드("교과서 선택")`, await waitDashboard(page, 20000))
    r.check(`${name} 학생 홈 DOM 없음`, (await page.locator(HOME).count()) === 0)
    r.check(`${name} 대시보드에 "← 홈" 없음(기존 배치)`, (await page.getByRole('button', { name: '← 홈' }).count()) === 0)
  })

  // ── i. 홈에서 로그아웃 ──────────────────────────────────────────────
  await scenario('i 로그아웃', MAIN_VP, { dialogAccept: true }, async ({ page, name, dialogs }) => {
    await waitHome(page)
    await page.locator(HOME).getByRole('button', { name: '로그아웃' }).click()
    r.check(`${name} confirm 문구 불변`, dialogs[0] === '정말 로그아웃할까요?\n다시 들어오려면 이름과 PIN이 필요해요.', JSON.stringify(dialogs))
    r.check(`${name} 승인 → 로그인 폼 복귀`, await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))
    r.check(`${name} 학생 홈 DOM 사라짐`, (await page.locator(HOME).count()) === 0)
  })

  // ── j. writingCoachEnabled=true ────────────────────────────────────
  await scenario('j Writing 플래그 ON', MAIN_VP, { flags: { writingCoachEnabled: true } }, async ({ page, name }) => {
    await waitHome(page)
    const c = card(page, 'writing')
    r.check(`${name} 문장 쓰기 카드 aria-disabled 없음`, (await c.getAttribute('aria-disabled')) === null)
    r.check(`${name} "준비 중" 배지 없음`, !((await c.textContent()) || '').includes('준비 중'))
    await c.click()
    r.check(`${name} 클릭 → Writing Coach(← 돌아가기)`, await page.getByRole('button', { name: '← 돌아가기' }).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))
    await page.getByRole('button', { name: '← 돌아가기' }).click()
    r.check(`${name} Writing Coach back → 학생 홈`, await waitHome(page))
  })

  // ── k. 360폭 대시보드 헤더(홈/별/달러/로그아웃) — 상점 지갑 배지 ON ─────
  // LIMITATION: fixture에 streak>0을 심을 쉬운 경로가 없어(useStudent 로컬 history
  // 기반) 🔥 배지는 포함하지 못한다 — 이 헤더가 가장 좁은 경우는 아니다.
  r.skip('k 360x640 헤더에 🔥 streak 배지 포함', 'fixture로 streak>0 시드 불가(useStudent history 기반) — streak 없는 헤더만 검증')
  await scenario('k 대시보드 헤더', VIEWPORTS[0], { flags: { townShopV1: true }, townState: { starsEarned: 20, dollars: { available: 37, earned: 37, spent: 0 }, owned: [], welcomeClaimed: false } }, async ({ page, name }) => {
    await waitHome(page)
    await card(page, 'voca').click()
    await waitDashboard(page)
    const dollar = page.locator('[title="사용 가능한 Paul Dollar"]')
    r.check(`${name} 💵 배지 표시(지갑 로드)`, await dollar.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false))
    const parts = {
      home: page.getByRole('button', { name: '← 홈' }),
      star: page.locator('[title="누적 별(성취)"]'),
      dollar,
      logout: page.getByRole('button', { name: /로그아웃/ }),
    }
    const vp = VIEWPORTS[0]
    const boxes = {}
    for (const [k, loc] of Object.entries(parts)) {
      const b = await loc.first().boundingBox()
      boxes[k] = b
      r.check(`${name} ${k} 가시 + 뷰포트 안`, !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height, JSON.stringify(b))
    }
    const keys = Object.keys(boxes)
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = boxes[keys[i]], b = boxes[keys[j]]
      const overlap = !!a && !!b && a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5 && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5
      r.check(`${name} ${keys[i]}·${keys[j]} 겹침 없음`, !overlap, `${JSON.stringify(a)} / ${JSON.stringify(b)}`)
    }
    r.check(`${name} 가로 스크롤 없음`, await noHorizontalOverflow(page))
  })

  // ── l. 대시보드에서 연 공부 캘린더의 back은 대시보드(기존 동작 불변) ──
  await scenario('l 캘린더 back(대시보드 경유)', MAIN_VP, {}, async ({ page, name }) => {
    await waitHome(page)
    await card(page, 'voca').click()
    await waitDashboard(page)
    const summary = page.locator('summary', { hasText: '🧭 더 많은 메뉴' })
    const details = page.locator('details', { has: summary })
    if (!(await details.evaluate((el) => el.hasAttribute('open')).catch(() => false))) await summary.click()
    await page.locator('button', { hasText: '공부 캘린더' }).click()
    await page.getByRole('heading', { name: /공부 캘린더/ }).waitFor({ state: 'visible', timeout: 10000 })
    await page.getByRole('button', { name: '← 홈' }).click()
    r.check(`${name} 대시보드 → 공부 캘린더 → back = 대시보드`, await waitDashboard(page))
  })

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
