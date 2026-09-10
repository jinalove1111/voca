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

// student.spec.mjs의 waitUntil(26행)과 동일한 헬퍼 — 파일당 소유권 원칙
// (CLAUDE.md 규칙 16, 이 파일 헤더 주석)에 따라 import 대신 복제한다.
async function waitUntil(fn, { timeout = 15000, interval = 200 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = await fn()
    if (v) return v
    await new Promise((res) => setTimeout(res, interval))
  }
  return false
}

// student.spec.mjs escapeRegExp(86행)와 동일 근거 — 퀴즈 옵션 접근성 이름이
// "글자 + 공백 + 뜻" 조합이라 뜻 문자열만으로 매칭하면 접두사가 겹치는 다른
// 옵션까지 함께 매치될 수 있다(이 fixture의 word id 명명 규칙상 실제로
// 접두사가 겹침). 끝단 앵커(^[A-D] ...뜻$)로 정확히 한 옵션만 고정한다.
function escapeRegExp(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

// student.spec.mjs A6-guided(321-476행)의 가이드 세션 1단어 완료 스텝을
// 그대로 복제(발음 → 예문 → 퀴즈 정답) — 완료 카드가 뜰 때까지 반복
// 호출해 이 모바일 스윕에서도 실제 "세션 N 완료!"/"오늘 단어 전부 완료!"
// 카드 렌더까지 검증한다(체크 (3)).
async function completeOneGuidedWord(page, db) {
  const heroWordEl = page.locator('h1.word-text-hero').first()
  await heroWordEl.waitFor({ state: 'visible' })
  const guidedWordText = (await heroWordEl.textContent())?.trim()
  const guidedFixtureWord = db.tables.words.find((w) => w.word === guidedWordText)
  if (!guidedFixtureWord) throw new Error(`가이드 학습 단어 "${guidedWordText}"를 fixture words에서 찾을 수 없음`)

  await page.getByRole('button', { name: /따라 말하기/ }).click()
  const continueBtn1 = page.getByRole('button', { name: /계속/ })
  await continueBtn1.waitFor({ state: 'visible', timeout: 20000 })
  await continueBtn1.click()

  const exampleSpeechBtn = page.getByRole('button', { name: /예문 따라 말하기/ })
  await exampleSpeechBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await exampleSpeechBtn.isVisible().catch(() => false)) {
    await exampleSpeechBtn.click()
    const continueBtn2 = page.getByRole('button', { name: /계속/ })
    await continueBtn2.waitFor({ state: 'visible', timeout: 20000 })
    await continueBtn2.click()
  }

  await page.getByText('🎮 뜻 맞히기').waitFor({ state: 'visible', timeout: 10000 })
  const quizOptionRe = new RegExp(`^[A-D] ${escapeRegExp(guidedFixtureWord.meaning)}$`)
  await page.getByRole('button', { name: quizOptionRe }).click()

  const transition = await waitUntil(async () => {
    if (await page.getByText(/완료! 🎉/).isVisible().catch(() => false)) return { done: true }
    const heroLocator = page.locator('h1.word-text-hero').first()
    const heroVisible = await heroLocator.isVisible().catch(() => false)
    if (!heroVisible) return false
    const currentHero = (await heroLocator.textContent().catch(() => null))?.trim()
    if (currentHero && currentHero !== guidedWordText) return { done: false }
    return false
  })
  return transition || { done: false }
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
    // (7) 느린 네트워크 — 4개 뷰포트 전부에 걸면 스윕 실행 시간이 크게
    // 늘어나므로 첫 뷰포트(360x640) 하나에만 적용한다(과제 지시 "for one
    // viewport only"). words/units REST 응답을 1.5초 지연시켜, 로그인
    // 화면 진입 전 전역 로딩 게이트(App.jsx "단어를 불러오는 중...",
    // !ready)가 에러로 새지 않고 정상적으로 버텨내는지 확인한다.
    // route.fallback()으로 넘겨 실제 응답은 installMocks가 등록해 둔
    // rest/v1 mock이 그대로 만든다(지연만 추가, 응답 내용은 무변경).
    const isSlowNetworkViewport = vp === VIEWPORTS[0]
    if (isSlowNetworkViewport) {
      await page.route('**/rest/v1/words**', async (route) => {
        await new Promise((res) => setTimeout(res, 1500))
        await route.fallback()
      })
      await page.route('**/rest/v1/units**', async (route) => {
        await new Promise((res) => setTimeout(res, 1500))
        await route.fallback()
      })
    }
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

      if (isSlowNetworkViewport) {
        const loadingOrLoginVisible = await waitUntil(async () => {
          const loadingVisible = await page.getByText('단어를 불러오는 중...').isVisible().catch(() => false)
          const loginVisible = await page.getByPlaceholder('이름 입력...').isVisible().catch(() => false)
          return loadingVisible || loginVisible
        }, { timeout: 10000, interval: 200 })
        r.check(`${name} 느린 네트워크(words/units 1.5초 지연) — 10초 안에 로딩 표시 또는 로그인 화면 렌더`, !!loadingOrLoginVisible)
        const serverErrorVisible = await page.getByText('단어 서버에 연결할 수 없어요').isVisible().catch(() => false)
        r.check(`${name} 느린 네트워크 — 에러 화면(단어 서버에 연결할 수 없어요) 미표시`, !serverErrorVisible)
      }

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

      // (6) 200% 폰트 확대 근사(PROXY) — 실제 OS/브라우저 접근성 폰트 배율을
      // 흉내낼 표준 API가 없어 document.documentElement.fontSize를 직접
      // 200%로 올린다(PROXY로 명시). 히어로 CTA 텍스트가 잘리지 않고
      // (scrollWidth<=clientWidth+여유) 페이지 전체도 가로 스크롤이 생기지
      // 않아야 한다. 확인 후 반드시 100%로 되돌려 이후 스텝(가이드 세션/
      // 단어 공부 등)이 커진 폰트로 오염되지 않게 한다.
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      const heroCtaScaled = page.getByRole('button', { name: '▶ 오늘의 학습 시작' })
      await heroCtaScaled.waitFor({ state: 'visible', timeout: 10000 })
      const heroCtaClipOk = await heroCtaScaled.evaluate((el) => el.scrollWidth <= el.clientWidth + 2)
      const overflowAtScale = await noHorizontalOverflow(page)
      r.check(`${name} PROXY(200% 폰트 확대) — 히어로 CTA 텍스트 잘림 없음(scrollWidth<=clientWidth+2)`, heroCtaClipOk)
      r.check(`${name} PROXY(200% 폰트 확대) — 페이지 가로 스크롤 없음`, overflowAtScale)
      await page.evaluate(() => { document.documentElement.style.fontSize = '' })

      // (3) 가이드 세션(3분 데일리 리추얼) 완료 — student.spec.mjs
      // A6-guided와 동일한 스텝(발음→예문→퀴즈 정답)을 완료 카드가 뜰
      // 때까지 반복한다. 이 fixture 유닛은 15단어, 첫 세션 크기는 항상
      // mid=8(dailyRitual.js planSessionSize — 첫 세션은 recentAccuracy/
      // recentPaceMsPerWord가 둘 다 null이라 struggling/cruising 모두
      // false, size=Math.round((5+10)/2)=8로 결정적) — 안전 상한 20회면
      // 정상 흐름에서 절대 못 채우기 전에 끝난다. GuidedSession.jsx는
      // 부분 완료("세션 N 완료! 🎉")든 전체 완료("오늘 단어 전부 완료! 🎉")든
      // allDone 여부와 무관하게 항상 "🏠 오늘은 여기까지" 버튼을 렌더하므로
      // (GuidedSession.jsx 326-333행) 이 버튼으로 항상 대시보드로 안전하게
      // 돌아올 수 있다.
      await heroCta.click()
      let guidedDone = false
      let guidedIterations = 0
      while (!guidedDone && guidedIterations < 20) {
        const stepResult = await completeOneGuidedWord(page, db)
        guidedDone = !!stepResult.done
        guidedIterations += 1
      }
      r.check(`${name} 가이드 세션 — 완료 카드(/완료! 🎉/)가 표시됨`, guidedDone, `iterations=${guidedIterations}`)
      const guidedHomeBtn = page.getByRole('button', { name: /🏠/ })
      await guidedHomeBtn.waitFor({ state: 'visible', timeout: 10000 })
      const guidedHomeBox = await guidedHomeBtn.boundingBox()
      r.check(`${name} 가이드 세션 완료 카드 — 홈 CTA가 뷰포트 폭 안에 완전히 들어옴`,
        !!guidedHomeBox && guidedHomeBox.x >= 0 && guidedHomeBox.x + guidedHomeBox.width <= vp.width, JSON.stringify(guidedHomeBox))
      r.check(`${name} 가이드 세션 완료 카드 — 홈 CTA 터치 타겟 높이 >= 44px`,
        !!guidedHomeBox && guidedHomeBox.height >= 44, JSON.stringify(guidedHomeBox))
      await guidedHomeBtn.click()
      await page.locator('summary', { hasText: '🧭 더 많은 메뉴' }).waitFor({ state: 'visible', timeout: 15000 })

      // ── 3) 단어 공부(기본 모드='comprehensive') ─────────────────────
      await openMoreMenu(page)
      await page.locator('button', { hasText: '단어 공부' }).click()
      const wordRows = page.locator('.space-y-2.animate-fade-in > button')
      await wordRows.first().waitFor({ state: 'visible' })

      // (1) 가장 긴 단어/뜻 카드 — 이 fixture(tests/e2e/fixtures/index.mjs)는
      // 전부 "e2e-tb-a-w2-N"/"뜻-e2e-tb-a-2-N" 형태라 실제로 아주 긴
      // 문자열이 없다(LIMITATION — 과제 지시대로, student.spec.mjs A5가
      // 이 유닛의 단어 수를 정확히 15개로 고정 단언하고 있어 그 수를
      // 깨뜨리지 않고는 새 단어를 추가할 수 없어 fixture는 건드리지
      // 않았다). 대신 지금 목록에서 "단어+뜻 길이 합"이 가장 긴 행을 골라
      // 그 행으로 검증한다 — overflow-wrap CSS 계약(index.css의
      // .word-text-hero/.word-text/.meaning-box-text)이 깨지지 않는지
      // 확인하는 근사치.
      const wordRowCount = await wordRows.count()
      let longestRowIdx = 0
      let longestRowLen = -1
      for (let i = 0; i < wordRowCount; i++) {
        const row = wordRows.nth(i)
        const wt = (await row.locator('p.font-black.text-lg.text-gray-800.break-words').textContent().catch(() => '')) || ''
        const mt = (await row.locator('p.text-gray-500.text-sm.break-words').textContent().catch(() => '')) || ''
        const len = wt.length + mt.length
        if (len > longestRowLen) { longestRowLen = len; longestRowIdx = i }
      }
      await wordRows.nth(longestRowIdx).click()

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

      // (1) 계속 — 뜻 텍스트(.meaning-box-text, PronounceStep 전용,
      // WordDetail.jsx 396행)도 함께 확인. 기본 모드 첫 단계는 항상
      // PronounceStep이라(위 138행 근처 기존 주석 참고) 항상 존재해야 함.
      const meaningBoxEl = page.locator('.meaning-box-text').first()
      const meaningBoxVisible = await meaningBoxEl.isVisible().catch(() => false)
      r.check(`${name} 단어 공부 카드(최장 텍스트 행) — 뜻 텍스트(.meaning-box-text) 표시`, meaningBoxVisible)
      if (meaningBoxVisible) {
        const meaningBox = await meaningBoxEl.boundingBox()
        const meaningNotClipped = await meaningBoxEl.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
        r.check(`${name} 단어 공부 카드(최장 텍스트 행) — 뜻 텍스트 오른쪽 끝이 뷰포트 폭을 넘지 않음`,
          !!meaningBox && meaningBox.x + meaningBox.width <= vp.width, JSON.stringify(meaningBox))
        r.check(`${name} 단어 공부 카드(최장 텍스트 행) — 뜻 텍스트가 클리핑되지 않음(scrollWidth<=clientWidth+1)`,
          meaningNotClipped, JSON.stringify(meaningBox))
      }

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
      // (2)/(4) 준비 — 이 단어를 일부러 틀려서 오답노트 큐(spellingWrongToday)에
      // 넣어야 대시보드의 "🔁 틀린 단어 다시 보기" 진입로가 나타난다. 과제
      // 지시는 "더 많은 메뉴 → 오답노트 항목"을 가정했지만 실측 결과 그런
      // 항목은 없다(Dashboard.jsx "더 많은 메뉴" 상세 8개 버튼 중 복습
      // 관련 항목 0개, LIMITATION). 복습 화면(App.jsx screen==='spellingReview')의
      // 유일한 진입로는 대시보드 RecommendationBanner의 "🔁 틀린 단어 다시
      // 보기" 버튼(reviewTotal>0일 때만 노출, "더 많은 메뉴" 밖에 항상
      // 노출)이라, 아래에서 만든 오답 1건으로 그 조건을 채워 이 경로로
      // 진입한다. 클릭 전에 단어 원문을 읽어 fixture와 매칭해둔다
      // (student.spec.mjs A6-spelling과 동일 패턴).
      const writeWordRow = page.locator('p.font-black.text-lg.text-gray-800.break-words').first()
      await writeWordRow.waitFor({ state: 'visible' })
      const writeWordText = (await writeWordRow.textContent())?.trim()
      const writeFixtureWord = db.tables.words.find((w) => w.word === writeWordText)
      if (!writeFixtureWord) throw new Error(`쓰기 모드 단어 목록에서 "${writeWordText}"를 fixture words에서 찾을 수 없음`)
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

      // (5) 키보드 열림 근사 — 실제 소프트 키보드 대신 뷰포트 높이를 60%로
      // 줄여(iOS/Android가 키보드를 띄울 때 실제로 벌어지는 일과 비슷한
      // 축소) 입력란/제출 버튼이 여전히 도달 가능한지 확인한다. 확인 후
      // 반드시 원래 뷰포트 크기로 되돌린다 — 안 되돌리면 이후의 모든
      // 겹침/오버플로 단언이 줄어든 높이 기준으로 오염된다.
      await spellingInput.focus()
      const shrunkHeight = Math.round(vp.height * 0.6)
      await page.setViewportSize({ width: vp.width, height: shrunkHeight })
      const confirmBtn = page.getByRole('button', { name: '확인' })
      await spellingInput.scrollIntoViewIfNeeded()
      const kbInputBox = await spellingInput.boundingBox()
      await confirmBtn.scrollIntoViewIfNeeded()
      const kbConfirmBox = await confirmBtn.boundingBox()
      r.check(`${name} 키보드 열림 근사(뷰포트 높이 60%=${shrunkHeight}px) — 철자 입력란 도달 가능`,
        !!kbInputBox && kbInputBox.y >= 0 && kbInputBox.y + kbInputBox.height <= shrunkHeight, JSON.stringify(kbInputBox))
      r.check(`${name} 키보드 열림 근사(뷰포트 높이 60%=${shrunkHeight}px) — 확인 버튼 도달 가능`,
        !!kbConfirmBox && kbConfirmBox.y >= 0 && kbConfirmBox.y + kbConfirmBox.height <= shrunkHeight, JSON.stringify(kbConfirmBox))
      await page.setViewportSize({ width: vp.width, height: vp.height })

      // (2)/(4) 계속 — 일부러 틀린 답을 제출해 오답노트 큐에 이 단어를
      // 넣는다. onResult는 첫 시도에만 기록하므로(SpellingQuestion.jsx
      // submitAnswer의 firstAttempt 가드) 이후 재시도 여부와 무관하게 이
      // 시점에 spellingWrongToday에 반영된다.
      await spellingInput.fill('zzz-e2e-intentionally-wrong-zzz')
      await confirmBtn.click()
      await waitUntil(async () => (await spellingInput.inputValue()) === '')
      await page.locator('button', { hasText: '← 단어 목록' }).click()
      await page.locator('button', { hasText: '← 홈' }).click()

      // ── (2) 복습(오답노트) 화면 ──────────────────────────────────────
      const reviewEntryBtn = page.getByRole('button', { name: /틀린 단어 다시 보기/ })
      await reviewEntryBtn.waitFor({ state: 'visible', timeout: 10000 })
      await reviewEntryBtn.click()

      r.check(`${name} 복습 화면 — 가로 스크롤 없음`, await noHorizontalOverflow(page))
      // 이 화면엔 "←"로 시작하는 뒤로가기 버튼이 없다(SpellingReview.jsx
      // 실측) — 유일한 나가기 동작인 "오늘은 여기까지"를 "뒤로가기"로 간주.
      const reviewBackBtn = page.getByRole('button', { name: '오늘은 여기까지' })
      r.check(`${name} 복습 화면 — 나가기 버튼("오늘은 여기까지") 표시`, await reviewBackBtn.isVisible().catch(() => false))

      const reviewEnInput = page.getByPlaceholder('영어로 철자를 입력하세요')
      const reviewKrInput = page.getByPlaceholder('한글로 뜻을 입력하세요')
      await reviewEnInput.or(reviewKrInput).first().waitFor({ state: 'visible', timeout: 10000 })
      const reviewEnVisible = await reviewEnInput.isVisible().catch(() => false)
      const reviewInput = reviewEnVisible ? reviewEnInput : reviewKrInput
      const reviewAnswer = reviewEnVisible ? writeFixtureWord.word : writeFixtureWord.meaning
      const reviewConfirmBtn = page.getByRole('button', { name: '확인' })
      await reviewConfirmBtn.waitFor({ state: 'visible', timeout: 5000 })
      const reviewConfirmBox = await reviewConfirmBtn.boundingBox()
      r.check(`${name} 복습 화면 — 기본(확인) CTA 터치 타겟 높이 >= 44px`,
        !!reviewConfirmBox && reviewConfirmBox.height >= 44, JSON.stringify(reviewConfirmBox))

      // (4) 보상 토스트 — 오늘 틀렸던 단어를 복습에서 맞히면
      // grantLedgerReward('wrong-word-recovered', ...)가 rewardFeedback에
      // 항목을 추가해 RewardToast(className "fixed top-4 left-1/2")가
      // 뜬다(useStudent.js clearSpellingReviewWord, 1792-1808행). 가이드
      // 세션 정답만으로는 일일 목표(GOAL) 미달로 토스트가 뜨지 않아서
      // (round.completedToday.length >= GOAL 조건, useStudent.js
      // 1415-1422행) 대신 이 "오답 회복" 경로를 쓴다.
      await reviewInput.fill(reviewAnswer)
      await reviewConfirmBtn.click()
      // 클래스 선택자 대신 속성 부분일치를 쓴다 — Tailwind의 "left-1/2"
      // 클래스명 안의 "/"를 CSS 클래스 선택자로 쓰려면 이스케이프가
      // 필요해 실수하기 쉬우므로, 문자열 그대로 매칭되는 속성 선택자로
      // 그 문제를 피한다(RewardToast.jsx 31행의 유일한 "fixed top-4
      // left-1/2" 조합 — 앱 전체에서 이 컴포넌트만 이 클래스 조합을 씀).
      const rewardToast = page.locator('div[class*="top-4"][class*="left-1/2"]')
      const rewardToastVisible = await rewardToast.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} 보상 토스트 — 오답 회복(wrong-word-recovered) 후 RewardToast 등장`, rewardToastVisible)
      if (rewardToastVisible) {
        const toastBox = await rewardToast.first().boundingBox()
        const backBtnDuringToast = page.locator('button', { hasText: /^←/ }).first()
        const backVisibleDuringToast = await backBtnDuringToast.isVisible().catch(() => false)
        const backBoxDuringToast = backVisibleDuringToast ? await backBtnDuringToast.boundingBox() : null
        r.check(`${name} 보상 토스트 — 뷰포트 폭 안에 완전히 들어옴`,
          !!toastBox && toastBox.x >= 0 && toastBox.x + toastBox.width <= vp.width, JSON.stringify(toastBox))
        const toastCoversBack = backBoxDuringToast ? overlaps(toastBox, backBoxDuringToast) : false
        r.check(`${name} 보상 토스트 — 뒤로가기 버튼을 가리지 않음(또는 이 화면엔 뒤로가기 버튼 자체가 없음)`,
          !toastCoversBack, JSON.stringify({ toastBox, backVisibleDuringToast, backBoxDuringToast }))
        // 1.5초 자동 dismiss(RewardToast.jsx 14행) — 정말 사라지는지 확인.
        const toastDismissed = await waitUntil(async () => !(await rewardToast.first().isVisible().catch(() => false)), { timeout: 4000 })
        r.check(`${name} 보상 토스트 — 표시 후 타임아웃 내 자동으로 사라짐`, !!toastDismissed)
      }

      // 복습 큐가 방금 비었으면(단어 1개, 정답으로 해소) SpellingReview.jsx의
      // "words.length===0이면 onDone()" useEffect가 이미 대시보드로
      // 돌려보냈을 수 있다 — "오늘은 여기까지" 버튼은 그 경우 이미
      // 사라졌으므로 조건부로만 누른다.
      if (await reviewBackBtn.isVisible().catch(() => false)) {
        await reviewBackBtn.click()
      }
      await page.locator('summary', { hasText: '🧭 더 많은 메뉴' }).waitFor({ state: 'visible', timeout: 15000 })

      // ── 5) 퀴즈 ──────────────────────────────────────────────────────
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
