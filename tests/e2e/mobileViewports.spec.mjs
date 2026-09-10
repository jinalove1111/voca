// tests/e2e/mobileViewports.spec.mjs
//
// 모바일 뷰포트 회귀 스펙(2026-09-10) — 로그인/대시보드/단어공부/쓰기연습/
// 퀴즈 화면이 4개 실기 근사 뷰포트(360×640~412×915)에서 가로 스크롤,
// 44px 미만 터치 타겟, iOS 확대를 유발하는 16px 미만 입력 폰트, 고정
// SpeedBtn(App.jsx, aria-label="발음 재생 속도") 겹침 없이 렌더되는지
// 검증한다.
//
// student.spec.mjs를 수정하지 않고 그 파일의 소규모 헬퍼(login/
// openMoreMenu/waitUntil 패턴)만 이 파일에 복제해 재사용한다(파일당 소유권
// 원칙, CLAUDE.md 규칙 16 — 두 spec이 같은 파일을 동시에 건드리지 않게).
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

async function login(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

async function openMoreMenu(page) {
  const summary = page.locator('summary', { hasText: '🧭 더 많은 메뉴' })
  const details = page.locator('details', { has: summary })
  const isOpen = await details.evaluate((el) => el.hasAttribute('open')).catch(() => false)
  if (!isOpen) await summary.click()
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

function overlaps(a, b) {
  return !!a && !!b
    && a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y
}

async function fontSizePx(locator) {
  const px = await locator.evaluate((el) => window.getComputedStyle(el).fontSize)
  return parseFloat(px)
}

export async function run(browser, baseURL) {
  const r = createRecorder('[mobile]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  for (const vp of VIEWPORTS) {
    const name = vpName(vp)
    // A8(student.spec.mjs)와 동일한 패턴 — 한 뷰포트가 실패해도 나머지
    // 뷰포트가 계속 실행되도록 try/catch/finally로 감싼다.
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

      // ── 1) 로그인 화면(로그인 전) ────────────────────────────────────
      const nameInput = page.getByPlaceholder('이름 입력...')
      const pinInput = page.getByPlaceholder('PIN 4자리')
      const startBtn = page.getByRole('button', { name: '시작하기!' })
      await nameInput.waitFor({ state: 'visible', timeout: 90000 })

      r.check(`${name} 로그인 화면 — 가로 스크롤 없음`, await noHorizontalOverflow(page))

      const nameBox = await nameInput.boundingBox()
      const pinBox = await pinInput.boundingBox()
      const startBox = await startBtn.boundingBox()
      r.check(`${name} 로그인 화면 — 이름 입력란이 뷰포트 폭 안에 들어옴`,
        !!nameBox && nameBox.x >= 0 && nameBox.x + nameBox.width <= vp.width, JSON.stringify(nameBox))
      r.check(`${name} 로그인 화면 — PIN 입력란이 뷰포트 폭 안에 들어옴`,
        !!pinBox && pinBox.x >= 0 && pinBox.x + pinBox.width <= vp.width, JSON.stringify(pinBox))
      r.check(`${name} 로그인 화면 — "시작하기!" 버튼이 뷰포트 폭 안에 들어옴`,
        !!startBox && startBox.x >= 0 && startBox.x + startBox.width <= vp.width, JSON.stringify(startBox))

      const nameFontPx = await fontSizePx(nameInput)
      const pinFontPx = await fontSizePx(pinInput)
      r.check(`${name} 로그인 화면 — 이름 입력란 폰트 크기 >= 16px(iOS 자동 확대 방지)`, nameFontPx >= 16, `${nameFontPx}px`)
      r.check(`${name} 로그인 화면 — PIN 입력란 폰트 크기 >= 16px(iOS 자동 확대 방지)`, pinFontPx >= 16, `${pinFontPx}px`)

      // ── 로그인 ───────────────────────────────────────────────────────
      await login(page)
      const textbookSelect = page.getByLabel('교과서 선택')
      await textbookSelect.waitFor({ state: 'visible', timeout: 15000 })

      // ── 2) 대시보드 ──────────────────────────────────────────────────
      r.check(`${name} 대시보드 — 가로 스크롤 없음`, await noHorizontalOverflow(page))
      r.check(`${name} 대시보드 — 교과서 선택기 표시`, await textbookSelect.isVisible().catch(() => false))

      // 신규 계정(학습 기록 없음) 첫 방문 분기 — Dashboard.jsx
      // RecommendationBanner가 "▶ 오늘의 학습 시작" 라벨로 고정한다
      // (student.spec.mjs A6-guided와 동일 근거).
      const heroCta = page.getByRole('button', { name: '▶ 오늘의 학습 시작' })
      await heroCta.waitFor({ state: 'visible', timeout: 15000 })
      const heroBox = await heroCta.boundingBox()
      r.check(`${name} 대시보드 — 히어로 CTA 터치 타겟 높이 >= 44px`, !!heroBox && heroBox.height >= 44, JSON.stringify(heroBox))
      r.check(`${name} 대시보드 — 히어로 CTA가 뷰포트 폭 안에 완전히 들어옴`,
        !!heroBox && heroBox.x >= 0 && heroBox.x + heroBox.width <= vp.width, JSON.stringify(heroBox))

      // 2026-09-10 — App.jsx가 대시보드에서는 SpeedBtn을 아예 렌더하지
      // 않도록 고쳤다(오디오 재생 없는 화면에서 히어로 CTA를 가리던 375x667
      // 실측 회귀 수정). 그래서 지금의 불변식은 "안 겹침"이 아니라 "미렌더
      // 또는(렌더돼도) 안 겹침" — 둘 중 하나만 성립하면 CTA는 안전하다.
      const speedBtn = page.locator('button[aria-label="발음 재생 속도"]')
      const speedVisible = await speedBtn.isVisible().catch(() => false)
      const speedBox = speedVisible ? await speedBtn.boundingBox() : null
      const heroNotObstructed = !speedVisible || !overlaps(heroBox, speedBox)
      r.check(`${name} 대시보드 — 히어로 CTA가 고정 SpeedBtn에 가려지지 않음(대시보드 미렌더 또는 겹침 없음)`,
        heroNotObstructed, JSON.stringify({ heroBox, speedVisible, speedBox }))

      // ── 3) 단어 공부(기본 모드='comprehensive') ─────────────────────
      await openMoreMenu(page)
      await page.locator('button', { hasText: '단어 공부' }).click()
      const wordRows = page.locator('.space-y-2.animate-fade-in > button')
      await wordRows.first().waitFor({ state: 'visible' })
      await wordRows.first().click()

      // 대시보드에서는 미렌더지만, 단어 공부 화면은 오디오 재생이 있는
      // 화면이라 SpeedBtn이 계속 보여야 한다(위 수정이 다른 화면까지
      // 건드리지 않았다는 증거).
      const speedBtnOnCard = page.locator('button[aria-label="발음 재생 속도"]')
      r.check(`${name} 단어 공부 카드 — SpeedBtn 표시 유지`, await speedBtnOnCard.isVisible().catch(() => false))

      r.check(`${name} 단어 공부 카드 — 가로 스크롤 없음`, await noHorizontalOverflow(page))

      // 기본 모드 첫 단계는 발음(PronounceStep, .word-text-hero) — 퀴즈
      // 단계(.word-text)로 진행해도 동일 선택자가 계속 하나만 매치되도록
      // 두 클래스를 함께 받는다(WordDetail.jsx 382/610행, index.css 61/74행).
      const wordTextEl = page.locator('.word-text-hero, .word-text').first()
      await wordTextEl.waitFor({ state: 'visible', timeout: 10000 })
      r.check(`${name} 단어 공부 카드 — 단어 텍스트 표시`, await wordTextEl.isVisible().catch(() => false))
      const wordTextBox = await wordTextEl.boundingBox()
      r.check(`${name} 단어 공부 카드 — 단어 텍스트 오른쪽 끝이 뷰포트 폭을 넘지 않음`,
        !!wordTextBox && wordTextBox.x + wordTextBox.width <= vp.width, JSON.stringify(wordTextBox))

      const backBtn = page.locator('button', { hasText: /^←/ }).first()
      r.check(`${name} 단어 공부 카드 — 뒤로가기 버튼("←"로 시작) 표시`, await backBtn.isVisible().catch(() => false))

      // 카드 본문(WordDetail.jsx 889행 컨테이너) 안의 가시 버튼들 — "다음/계속"
      // 류 스텝 액션 버튼을 포함해 가장 작은 터치 타겟 높이를 함께 보고한다.
      const cardButtons = page.locator('.max-w-lg.mx-auto.animate-fade-in button')
      const cardBtnCount = await cardButtons.count()
      let smallestCardBtnHeight = Infinity
      let allCardBtnsAtLeast40 = true
      for (let i = 0; i < cardBtnCount; i++) {
        const btn = cardButtons.nth(i)
        if (!(await btn.isVisible().catch(() => false))) continue
        const box = await btn.boundingBox()
        if (!box) continue
        if (box.height < smallestCardBtnHeight) smallestCardBtnHeight = box.height
        if (box.height < 40) allCardBtnsAtLeast40 = false
      }
      r.check(`${name} 단어 공부 카드 — 스텝 액션 버튼 높이 >= 40px(가장 작은 값 기준)`,
        allCardBtnsAtLeast40, `smallest=${smallestCardBtnHeight === Infinity ? 'n/a' : smallestCardBtnHeight}`)

      // ── 4) 쓰기 연습(studyMode='write', 항상 mixed — 방향은 단언하지 않음) ──
      await page.locator('button', { hasText: '← 단어 목록' }).click()
      await page.locator('button', { hasText: '쓰기' }).click()
      const writeWordRows = page.locator('.space-y-2.animate-fade-in > button')
      await writeWordRows.first().waitFor({ state: 'visible' })
      await writeWordRows.first().click()

      const spellingEnInput = page.getByPlaceholder('영어로 철자를 입력하세요')
      const spellingKrInput = page.getByPlaceholder('한글로 뜻을 입력하세요')
      await spellingEnInput.or(spellingKrInput).first().waitFor({ state: 'visible', timeout: 20000 })
      const spellingEnVisible = await spellingEnInput.isVisible().catch(() => false)
      const spellingInput = spellingEnVisible ? spellingEnInput : spellingKrInput

      r.check(`${name} 쓰기 연습 — 가로 스크롤 없음`, await noHorizontalOverflow(page))
      r.check(`${name} 쓰기 연습 — 철자 입력란 표시`, await spellingInput.isVisible().catch(() => false))
      const spellingFontPx = await fontSizePx(spellingInput)
      r.check(`${name} 쓰기 연습 — 철자 입력란 폰트 크기 >= 16px(iOS 자동 확대 방지)`, spellingFontPx >= 16, `${spellingFontPx}px`)
      const spellingInputBox = await spellingInput.boundingBox()
      r.check(`${name} 쓰기 연습 — 철자 입력란이 뷰포트 폭 안에 들어옴`,
        !!spellingInputBox && spellingInputBox.x >= 0 && spellingInputBox.x + spellingInputBox.width <= vp.width, JSON.stringify(spellingInputBox))

      // 문제(프롬프트) 텍스트 — SpellingQuestion.jsx의 answer 단계는 방향
      // 무관 동일 마크업(`<p className="text-3xl font-black">{promptText}</p>`,
      // 348/357행)이라 이 선택자 하나로 kr2en/en2kr 둘 다 커버된다.
      const promptEl = page.locator('p.text-3xl.font-black').first()
      await promptEl.waitFor({ state: 'visible', timeout: 10000 })
      const promptBox = await promptEl.boundingBox()
      r.check(`${name} 쓰기 연습 — 문제 프롬프트가 뷰포트 안에서 잘리지 않음`,
        !!promptBox && promptBox.x >= 0 && promptBox.x + promptBox.width <= vp.width, JSON.stringify(promptBox))

      // ── 5) 퀴즈 ──────────────────────────────────────────────────────
      await page.locator('button', { hasText: '← 단어 목록' }).click()
      await page.locator('button', { hasText: '← 홈' }).click()
      await openMoreMenu(page)
      await page.locator('button', { hasText: '퀴즈' }).click()

      const quizOptions = page.getByRole('button', { name: /^[A-D] / })
      await quizOptions.first().waitFor({ state: 'visible', timeout: 15000 })
      const quizCount = await quizOptions.count()
      r.check(`${name} 퀴즈 — 옵션 4개 모두 존재`, quizCount === 4, `count=${quizCount}`)

      const quizBoxes = []
      for (let i = 0; i < quizCount; i++) {
        quizBoxes.push(await quizOptions.nth(i).boundingBox())
      }
      const quizAllVisible = quizBoxes.every((b) => !!b)
      r.check(`${name} 퀴즈 — 옵션 4개 모두 표시(boundingBox 확보)`, quizAllVisible, JSON.stringify(quizBoxes))

      const quizNoOverflow = quizBoxes.every((b) => !!b && b.x >= 0 && b.x + b.width <= vp.width)
      r.check(`${name} 퀴즈 — 옵션이 가로로 넘치지 않음`, quizNoOverflow, JSON.stringify(quizBoxes))

      const quizAllTall = quizBoxes.every((b) => !!b && b.height >= 44)
      r.check(`${name} 퀴즈 — 옵션 터치 타겟 높이 >= 44px`, quizAllTall, JSON.stringify(quizBoxes.map((b) => b?.height)))

      let quizNoOverlap = true
      for (let i = 0; i < quizBoxes.length && quizNoOverlap; i++) {
        for (let j = i + 1; j < quizBoxes.length; j++) {
          if (overlaps(quizBoxes[i], quizBoxes[j])) { quizNoOverlap = false; break }
        }
      }
      r.check(`${name} 퀴즈 — 옵션끼리 서로 겹치지 않음`, quizNoOverlap, JSON.stringify(quizBoxes))
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
