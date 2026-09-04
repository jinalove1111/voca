// tests/e2e/student.spec.mjs
//
// 학생 화면 시나리오 A1~A7(작업 지시서 기준). 실제 Supabase/Vercel 요청 0건
// — tests/e2e/lib/mockRoutes.mjs가 모든 네트워크를 가로챈다. PIN은 fixture
// 상수("0000")이고 실 학생 계정/실명은 전혀 쓰지 않는다(QA_STUDENT_NAME은
// src/utils/accountStatus.js의 TEST_ACCOUNT_NAMES 중 하나).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { writesTo } from './lib/postgrestMock.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, TB_A, TB_B, TB_A_UNIT2_WORD_COUNT } from './fixtures/index.mjs'

async function login(page) {
  // initWordLibrary 완료 후에야 로그인 화면이 뜬다 — 머신이 바쁠 때(verify:all
  // 직후) 기본 30초로는 부족한 flake를 실측해 넉넉히 기다린다(admin.spec 동일).
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

async function openMoreMenu(page) {
  const summary = page.locator('summary', { hasText: '🧭 더 많은 메뉴' })
  // 이미 열려 있으면(재방문) 다시 누르지 않는다 — <details open> 상태는
  // DOM에서 open 속성으로 확인 가능.
  const details = page.locator('details', { has: summary })
  const isOpen = await details.evaluate((el) => el.hasAttribute('open')).catch(() => false)
  if (!isOpen) await summary.click()
}

async function readGardenFilled(page) {
  await openMoreMenu(page)
  await page.locator('button', { hasText: '나의 정원' }).click()
  const text = await page.getByText(/\/16칸이 자랐어요/).textContent()
  await page.locator('button', { hasText: '← 홈으로' }).click()
  const m = text.match(/(\d+)\/16칸이 자랐어요/)
  return m ? Number(m[1]) : null
}

// A6-spelling/A6-guided 전용 — EnglishGarden.jsx 38행("🌿 성장 포인트
// {world.growthPoints} (배운 단어 수)")은 위 readGardenFilled가 읽는
// "칸 수"(POINTS_PER_STAGE=2점당 1칸, worldProgress.js)보다 더 세밀한
// 원시 포인트 값이다. 단어 1개짜리 정답 처리는 칸 문턱(2점)을 못 넘어
// readGardenFilled로는 변화가 안 보이므로, "정확히 +1"을 확인하려면 이
// 원시 값을 읽어야 한다.
async function readGardenGrowthPoints(page) {
  await openMoreMenu(page)
  await page.locator('button', { hasText: '나의 정원' }).click()
  const text = await page.getByText(/성장 포인트 \d+/).textContent()
  await page.locator('button', { hasText: '← 홈으로' }).click()
  const m = text.match(/성장 포인트 (\d+)/)
  return m ? Number(m[1]) : null
}

// 퀴즈 정답 옵션(WordDetail.jsx QuizStep)의 접근성 이름은 "A 뜻-..." 처럼
// "글자 + 공백 + 뜻" 조합이라, 뜻 문자열만으로 getByRole 매칭하면 Playwright의
// 부분일치 규칙 때문에 다른 단어(예: 뜻이 "...-1"인 단어 vs "...-10"인 단어,
// 이 fixture의 word id 명명 규칙상 실제로 접두사가 겹침)까지 함께 매치되어
// strict mode 예외가 난다(실측). 끝단 앵커(^[A-D] ...뜻$)로 정확히 한 옵션만
// 고정한다.
function escapeRegExp(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

async function answerOneQuizQuestionCorrectly(page, db) {
  const wordEl = page.locator('.word-text').first()
  await wordEl.waitFor({ state: 'visible' })
  const wordText = (await wordEl.textContent())?.trim()
  const fixtureWord = db.tables.words.find((w) => w.word === wordText)
  if (!fixtureWord) throw new Error(`퀴즈에 나온 단어 "${wordText}"를 fixture words에서 찾을 수 없음`)
  await page.getByRole('button', { name: fixtureWord.meaning }).click()
  await page.getByRole('button', { name: /다음 문제|결과 보기/ }).waitFor({ state: 'visible' })
  return fixtureWord
}

export async function run(browser, baseURL) {
  const r = createRecorder('[student]')
  const context = await browser.newContext()
  const page = await context.newPage()
  const { db, unmockedRequests } = await installMocks(page)

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

    // A1 — 로그인
    await login(page)
    const textbookSelect = page.getByLabel('교과서 선택')
    await textbookSelect.waitFor({ state: 'visible', timeout: 15000 })
    r.check('A1 로그인 성공 — 학습 화면(교과서 선택기) 진입', true)

    // A2 — 배정 교재 표시(라벨 형식 + A/B가 서로 다른 항목으로 둘 다 존재)
    const tbOptions = await textbookSelect.locator('option').allTextContents()
    const labelA = `${TB_A.name} (${TB_A.publisher})`
    const labelB = `${TB_B.name} (${TB_B.publisher})`
    r.check('A2 primary 교재(A) 라벨이 "이름 (출판사)" 형식으로 옵션에 존재', tbOptions.includes(labelA), JSON.stringify(tbOptions))
    r.check('A2 secondary 교재(B)도 별개 옵션으로 존재', tbOptions.includes(labelB), JSON.stringify(tbOptions))
    r.check('A2 "중1"이 정확히 1개 옵션에만 등장', tbOptions.filter((t) => t.includes('중1')).length === 1, JSON.stringify(tbOptions))
    r.check('A2 "중2"가 정확히 1개 옵션에만 등장', tbOptions.filter((t) => t.includes('중2')).length === 1, JSON.stringify(tbOptions))
    const selectedTbLabel = await textbookSelect.locator('option:checked').textContent()
    r.check('A2 현재 선택된 교재가 primary(A)와 일치', selectedTbLabel === labelA, selectedTbLabel)

    // A3 — 현재 Unit 표시(A의 Unit2)
    const unitSelect = page.getByLabel('현재 유닛 선택')
    const selectedUnit = await unitSelect.locator('option:checked').textContent()
    r.check('A3 현재 유닛이 Unit 2로 선택되어 있음', selectedUnit?.trim() === 'Unit 2', selectedUnit)

    // A4 — Unit dropdown 목록 = A의 Unit1~3 정확히 3개(B 유닛 비혼입)
    const unitOptions = await unitSelect.locator('option').allTextContents()
    const trimmed = unitOptions.map((s) => s.trim())
    r.check('A4 유닛 옵션이 정확히 3개', trimmed.length === 3, JSON.stringify(trimmed))
    r.check('A4 유닛 옵션이 Unit 1/2/3 (A 소속만)', ['Unit 1', 'Unit 2', 'Unit 3'].every((u) => trimmed.includes(u)), JSON.stringify(trimmed))

    // A5 — 현재 유닛 단어 수 = fixture(15)와 일치해 표시
    await openMoreMenu(page)
    const wordCountVisible = await page.getByText(`${TB_A_UNIT2_WORD_COUNT}개 단어`).isVisible().catch(() => false)
    r.check(`A5 현재 유닛 단어 수(${TB_A_UNIT2_WORD_COUNT}개)가 화면에 표시됨`, wordCountVisible)

    // A7(전) — English Garden 정답 처리 전 gardenPoints 표시
    const gardenBefore = await readGardenFilled(page)
    r.check('A7(전) 정원 화면에서 칸 수를 읽을 수 있음', gardenBefore !== null, String(gardenBefore))
    r.check('A7(전) 학습 전 정원은 0칸(신규 계정)', gardenBefore === 0, String(gardenBefore))

    // A6 — 퀴즈 1문항 이상 정답 처리 후 화면 갱신 + mock 쓰기 로그
    await openMoreMenu(page)
    await page.locator('button', { hasText: '퀴즈' }).click()
    const firstWord = await answerOneQuizQuestionCorrectly(page, db)
    const nextVisible = await page.getByRole('button', { name: /다음 문제|결과 보기/ }).isVisible()
    r.check('A6 퀴즈 정답 처리 후 진행 표시(다음 문제/결과 버튼)가 갱신됨', nextVisible)
    await page.getByRole('button', { name: /다음 문제|결과 보기/ }).click()

    // 정원 2점(=1칸) 문턱을 넘기기 위해 서로 다른 단어 하나 더 정답 처리.
    const secondWord = await answerOneQuizQuestionCorrectly(page, db)
    r.check('A6 두 번째 문항도 서로 다른 단어(중복 아님)', secondWord.id !== firstWord.id, `${firstWord.id} / ${secondWord.id}`)
    await page.locator('button', { hasText: '← 홈' }).click()

    // 디바운스(2초) 동기화가 student_progress에 반영될 때까지 대기 후 확인.
    await page.waitForTimeout(3000)
    const progressWrites = writesTo(db, 'student_progress')
    r.check('A6 퀴즈 정답이 student_progress mock 쓰기 호출로 기록됨', progressWrites.length > 0, JSON.stringify(progressWrites.map((w) => w.method)))
    const lastWrite = progressWrites[progressWrites.length - 1]
    const clearedWords = lastWrite?.body?.progress_data?.clearedWords
    r.check('A6 동기화된 기록에 clearedWords가 채워짐(빈 배열 아님)', Array.isArray(clearedWords) && clearedWords.length > 0, JSON.stringify(clearedWords))

    // A7(후) — 정답 처리 후 gardenPoints 증가(2점=1칸, POINTS_PER_STAGE=2)
    const gardenAfter = await readGardenFilled(page)
    r.check('A7(후) 단어 2개 정답 처리 후 정원이 1칸 자람(0→1)', gardenAfter === gardenBefore + 1, `before=${gardenBefore} after=${gardenAfter}`)

    // ── A6-spelling — 쓰기(철자) 모드 단어 1개 정답 처리 ──────────────────
    // 기존 A1~A7(퀴즈 경로) 진행과 정원 포인트가 섞이지 않도록 별도
    // 브라우저 컨텍스트 + 새 fixture(0 기준선)에서 실행한다.
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()
    const { db: db2, unmockedRequests: unmockedRequests2 } = await installMocks(page2)
    try {
      await page2.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page2)
      await page2.getByLabel('교과서 선택').waitFor({ state: 'visible', timeout: 15000 })

      const gardenBeforeSpelling = await readGardenGrowthPoints(page2)
      r.check('A6-spelling(전) 정원 성장 포인트 0(신규 계정)', gardenBeforeSpelling === 0, String(gardenBeforeSpelling))

      // 쓰기 모드 진입 — WordBrowser.jsx MODES 배열의 '쓰기'(id:'write') 버튼.
      // mode='write'면 WordDetail.buildSteps가 ['spelling'] 단일 단계만
      // 요구한다(WordDetail.jsx 706-708행) — 반 설정의 spellingTestEnabled
      // 와 무관하게 항상 진입 가능(그 플래그는 'comprehensive' 모드의 선택적
      // 스펠링 단계에만 관여, 706행 buildSteps 분기 참고).
      await openMoreMenu(page2)
      await page2.locator('button', { hasText: '단어 공부' }).click()
      await page2.locator('button', { hasText: '쓰기' }).click()

      // 목록 화면(WordBrowser.jsx 195행)에 이미 단어 원문이 보이므로, 클릭
      // 전에 읽어 정답으로 그대로 타이핑한다(방향은 fixture 전 클래스가
      // spelling_direction='kr2en'이라 화면엔 뜻만 보이고 입력은 영어 철자).
      const wordRow = page2.locator('p.font-black.text-lg.text-gray-800.break-words').first()
      await wordRow.waitFor({ state: 'visible' })
      const spellingTargetWord = (await wordRow.textContent())?.trim()
      const spellingFixtureWord = db2.tables.words.find((w) => w.word === spellingTargetWord)
      if (!spellingFixtureWord) throw new Error(`쓰기 모드 단어 목록에서 "${spellingTargetWord}"를 fixture words에서 찾을 수 없음`)
      await wordRow.click()

      // 진행 표시("문제 N/전체")는 SpellingQuestion(WordDetail 진입 후)에만
      // 있고 목록 화면에는 없으므로, 클릭해 들어간 뒤에 읽는다.
      const spellingInput = page2.getByPlaceholder('영어로 철자를 입력하세요')
      await spellingInput.waitFor({ state: 'visible' })
      const progressBefore = await page2.getByText(/문제 \d+ \/ \d+/).textContent()
      await spellingInput.fill(spellingFixtureWord.word)
      await page2.getByRole('button', { name: '확인' }).click()
      await page2.getByText('정답이에요!', { exact: true }).waitFor({ state: 'visible', timeout: 5000 })
      r.check('A6-spelling 정답 제출 후 정답 화면("정답이에요!")이 표시됨', true)

      // markCorrect()의 700ms 자동 진행(SpellingQuestion.jsx 220행) 이후
      // 다음 문제로 — "문제 N/전체" 진행 표시가 실제로 바뀌는지 확인.
      await page2.waitForTimeout(1200)
      const progressAfter = await page2.getByText(/문제 \d+ \/ \d+/).textContent()
      r.check('A6-spelling 정답 처리 후 진행 표시(문제 N/전체)가 다음 문제로 갱신됨', progressAfter !== progressBefore, `${progressBefore} -> ${progressAfter}`)

      // 디바운스 동기화(A6 퀴즈와 동일 패턴) 후 mock 쓰기 로그 확인.
      await page2.waitForTimeout(3000)
      const progressWritesSpelling = writesTo(db2, 'student_progress')
      r.check('A6-spelling 정답이 student_progress mock 쓰기 호출로 기록됨', progressWritesSpelling.length > 0, JSON.stringify(progressWritesSpelling.map((w) => w.method)))
      const lastWriteSpelling = progressWritesSpelling[progressWritesSpelling.length - 1]
      const clearedWordsSpelling = lastWriteSpelling?.body?.progress_data?.clearedWords
      // markWordCleared(wordId)의 wordId는 fixture UUID(spellingFixtureWord.id)가
      // 아니라 word.word 슬러그다(wordLibrary.js가 앱 내부 word.id로 쓰는 값 —
      // 실측: mock 쓰기 로그의 clearedWords에는 "e2e-tb-a-w2-1" 같은 원문 단어
      // 문자열이 들어있다).
      r.check('A6-spelling 동기화된 기록의 clearedWords가 이 단어를 포함', Array.isArray(clearedWordsSpelling) && clearedWordsSpelling.includes(spellingFixtureWord.word), JSON.stringify(clearedWordsSpelling))

      // 정원 포인트 — useStudent.js recordSpellingAnswer()의 정답 분기는
      // markWordCleared(wordId)를 정확히 1회만 호출한다(2026-09-04 정원
      // 성장 소스 버그 수정 주석, useStudent.js 1639행). markWordCleared는
      // clearedWords 배열에 append하는 유일한 지점이고 attachmentCore.js
      // deriveAttachmentStats(142행)의 gardenPoints는 cleared∪completedWords
      // ∪clearedWords의 합집합 크기이므로, 이 단어가 그 전에 어디에도 없었다면
      // (fresh fixture) +1이 기대값이다.
      await page2.locator('button', { hasText: '← 단어 목록' }).click()
      await page2.locator('button', { hasText: '← 홈' }).click()
      const gardenAfterSpelling = await readGardenGrowthPoints(page2)
      r.check('A6-spelling 단어 1개 정답 처리 후 정원 성장 포인트가 정확히 +1', gardenAfterSpelling === gardenBeforeSpelling + 1, `before=${gardenBeforeSpelling} after=${gardenAfterSpelling}`)

      // 대조군 — 같은 단어를 다시 맞혀도 markWordCleared가 멱등이라
      // (useStudent.js 1148행 "prev.clearedWords.includes(slug) ? {} : ...")
      // 정원 포인트는 +0이어야 한다.
      await openMoreMenu(page2)
      await page2.locator('button', { hasText: '단어 공부' }).click()
      const wordRowAgain = page2.locator('p.font-black.text-lg.text-gray-800.break-words').first()
      await wordRowAgain.waitFor({ state: 'visible' })
      const sameWordAgain = (await wordRowAgain.textContent())?.trim()
      await wordRowAgain.click()
      const spellingInputAgain = page2.getByPlaceholder('영어로 철자를 입력하세요')
      await spellingInputAgain.waitFor({ state: 'visible' })
      await spellingInputAgain.fill(spellingFixtureWord.word)
      await page2.getByRole('button', { name: '확인' }).click()
      await page2.getByText('정답이에요!', { exact: true }).waitFor({ state: 'visible', timeout: 5000 })
      await page2.waitForTimeout(1200)
      await page2.locator('button', { hasText: '← 단어 목록' }).click()
      await page2.locator('button', { hasText: '← 홈' }).click()
      const gardenAfterControl = await readGardenGrowthPoints(page2)
      r.check('A6-spelling(대조군) 같은 단어 재정답은 정원 포인트 +0(멱등)', sameWordAgain === spellingTargetWord && gardenAfterControl === gardenAfterSpelling, `word=${sameWordAgain} after=${gardenAfterSpelling} control=${gardenAfterControl}`)
    } catch (err) {
      const bodyText2 = await page2.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [A6-spelling 진단] mockErrors=${JSON.stringify(db2.errors.slice(0, 3))}\n  [A6-spelling 진단] body(앞 400자)=${JSON.stringify(bodyText2.slice(0, 400))}`
      throw err
    } finally {
      await context2.close()
    }
    unmockedRequests.push(...unmockedRequests2)
    db.errors.push(...db2.errors)

    // ── A6-guided — GuidedSession(3분 데일리 리추얼) 세션 1단계(단어 1개)
    //    완료 ─────────────────────────────────────────────────────────────
    // 별도 컨텍스트 + 새 fixture(0 기준선). PronounceStep의 "따라 말하기"는
    // 마이크 녹음을 실제로 요구하지 않는다 — 이 headless 환경에서
    // getUserMedia는 거부되지만, WordDetail.jsx 181-188행의 mic 에러
    // 캐치 분기("녹음은 나중에 하고 먼저 듣기와 퀴즈를...")가 onAnyResult()를
    // 그대로 호출해 다음 단계로 진행할 수 있게 해준다(실측: unmocked
    // network 0건, translate.googleapis.com 등 실제 TTS 폴백 호출도
    // 발생하지 않음 — headless Chromium의 window.speechSynthesis가
    // voices 0개로도 onend를 정상 발생시킴).
    const context3 = await browser.newContext()
    const page3 = await context3.newPage()
    const { db: db3, unmockedRequests: unmockedRequests3 } = await installMocks(page3)
    try {
      await page3.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page3)
      await page3.getByLabel('교과서 선택').waitFor({ state: 'visible', timeout: 15000 })

      const gardenBeforeGuided = await readGardenGrowthPoints(page3)
      r.check('A6-guided(전) 정원 성장 포인트 0(신규 계정)', gardenBeforeGuided === 0, String(gardenBeforeGuided))

      // 히어로 CTA(Dashboard.jsx RecommendationBanner) — 학습 기록이 전혀
      // 없는 신규 계정은 "첫 방문" 분기라 라벨이 "▶ 오늘의 학습 시작"으로
      // 고정된다(Dashboard.jsx 251-257행). onStartGuided가 있으면(App.jsx가
      // 항상 전달) guidedSession 화면으로 이동.
      await page3.getByRole('button', { name: '▶ 오늘의 학습 시작' }).click()

      const heroWordEl = page3.locator('h1.word-text-hero').first()
      await heroWordEl.waitFor({ state: 'visible' })
      const guidedWordText = (await heroWordEl.textContent())?.trim()
      const guidedFixtureWord = db3.tables.words.find((w) => w.word === guidedWordText)
      if (!guidedFixtureWord) throw new Error(`가이드 학습 첫 단어 "${guidedWordText}"를 fixture words에서 찾을 수 없음`)

      // 1단계: 발음(PronounceStep) — "따라 말하기" 클릭 → canProceed.
      await page3.getByRole('button', { name: /따라 말하기/ }).click()
      const continueBtn1 = page3.getByRole('button', { name: /계속/ })
      await continueBtn1.waitFor({ state: 'visible', timeout: 20000 })
      await continueBtn1.click()

      // 2단계: 예문(ExampleStep) — fixture는 example_text가 비어 있지만
      // wordLibrary.js가 "I can see a/an {word}." 필러 예문을 채워
      // hasExample이 true가 되므로(WordDetail.jsx 754행) 이 단계가 항상
      // 나타난다(실측 확인). 같은 방식(SpeechBtn → canProceed)으로 통과.
      const exampleSpeechBtn = page3.getByRole('button', { name: /예문 따라 말하기/ })
      await exampleSpeechBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      if (await exampleSpeechBtn.isVisible().catch(() => false)) {
        await exampleSpeechBtn.click()
        const continueBtn2 = page3.getByRole('button', { name: /계속/ })
        await continueBtn2.waitFor({ state: 'visible', timeout: 20000 })
        await continueBtn2.click()
      }

      // 3단계: 퀴즈(QuizStep) — 정답 선택. 반 설정 spellingTestEnabled=false라
      // 'comprehensive' 모드에도 스펠링 단계는 없다(WordDetail.jsx 711행) —
      // 퀴즈가 이 단어의 마지막 단계.
      await page3.getByText('🎮 뜻 맞히기').waitFor({ state: 'visible', timeout: 10000 })
      const quizOptionRe = new RegExp(`^[A-D] ${escapeRegExp(guidedFixtureWord.meaning)}$`)
      await page3.getByRole('button', { name: quizOptionRe }).click()
      const correctReactionVisible = await page3.getByText('🎉 정답! 잘했어요!').waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
      r.check('A6-guided 퀴즈 정답 선택 후 화면 갱신(정답 표시)', correctReactionVisible)

      // 정답 1.8초 후 자동으로 다음 단어로 넘어간다(WordDetail.jsx QuizStep
      // 541-545행) — 그 시점에 goNext()가 STEPS 소진을 감지해
      // onMarkCompleted(GuidedSession.jsx 399행 → App.jsx의
      // studentData.markWordCompleted)를 부르고, 이 정답 처리 자체는 이미
      // handleQuizAnswer → onQuizAnswer(=studentData.recordQuizAnswer) →
      // (정답이면) markWordCleared를 호출한다(useStudent.js 1578행) — 같은
      // wordId로 completedWords와 clearedWords 둘 다에 들어간다.
      await page3.waitForTimeout(2200)
      const guidedNextWordVisible = await page3.locator('h1.word-text-hero').first().isVisible().catch(() => false)
      // fixture는 15단어(band minSize~maxSize=5~10, mid=8)라 1단어만으로는
      // 세션이 끝나지 않고(실측: "세션 1/2") 다음 단어로 넘어간다 — 그래도
      // 세션 크기 계산이 바뀌어 정확히 1단어 세션이 되는 경우까지 대비해
      // "완료 카드"(GuidedSession.jsx 274행 "세션 N 완료!"/"오늘 단어 전부
      // 완료!") 분기도 함께 받아준다.
      const guidedDoneCardVisible = await page3.getByText(/완료!/).isVisible().catch(() => false)
      r.check('A6-guided 1단어 완료 후 다음 단어(또는 완료 카드)로 화면이 갱신됨', guidedNextWordVisible || guidedDoneCardVisible)

      // 다음 단어 화면이면 WordDetail의 "← 홈"(GuidedSession.jsx 392행
      // backLabel="← 홈")으로, 완료 카드면 "🏠 오늘은 여기까지"/"🏠 홈으로"로
      // 나간다 — 둘 다 결국 onDone=setScreen('dashboard')(App.jsx 769행).
      if (guidedNextWordVisible) {
        await page3.getByRole('button', { name: '← 홈' }).click()
      } else {
        await page3.getByRole('button', { name: /🏠/ }).click()
      }
      await page3.locator('summary', { hasText: '🧭 더 많은 메뉴' }).waitFor({ state: 'visible', timeout: 15000 })

      // 디바운스 동기화(A6 퀴즈/A6-spelling과 동일 패턴 — 2초 디바운스 +
      // 여유) 후 mock 쓰기 로그 확인.
      await page3.waitForTimeout(3000)
      const progressWritesGuided = writesTo(db3, 'student_progress')
      r.check('A6-guided 완료가 student_progress mock 쓰기 호출로 기록됨', progressWritesGuided.length > 0, JSON.stringify(progressWritesGuided.map((w) => w.method)))
      const lastWriteGuided = progressWritesGuided[progressWritesGuided.length - 1]
      const completedWordsGuided = lastWriteGuided?.body?.progress_data?.completedWords
      const clearedWordsGuided = lastWriteGuided?.body?.progress_data?.clearedWords
      // markWordCompleted/markWordCleared의 wordId는 fixture UUID가 아니라
      // word.word 슬러그다(A6-spelling과 동일한 실측 근거).
      r.check('A6-guided 동기화된 기록의 completedWords가 이 단어를 포함(markWordCompleted)', Array.isArray(completedWordsGuided) && completedWordsGuided.includes(guidedFixtureWord.word), JSON.stringify(completedWordsGuided))
      r.check('A6-guided 동기화된 기록의 clearedWords도 이 단어를 포함(퀴즈 정답 경로의 markWordCleared)', Array.isArray(clearedWordsGuided) && clearedWordsGuided.includes(guidedFixtureWord.word), JSON.stringify(clearedWordsGuided))

      // 정원 포인트 — attachmentCore.js 142행의 gardenSet은
      // cleared∪completedWords∪clearedWords "합집합"(Set)이다. 이 단어
      // 하나가 completedWords와 clearedWords 양쪽에 다 들어가도 같은
      // wordId라 집합 크기는 1만 늘어난다 — "두 콜백이 불렸으니 +2"가
      // 아니라 "이 단어 자체가 정원에 들어왔으니 +1"이 실제 계산 결과다
      // (실측: growthPoints 0→1, 8월/9월 union 도입 이력 그대로).
      const gardenAfterGuided = await readGardenGrowthPoints(page3)
      r.check('A6-guided 단어 1개 완료 후 정원 성장 포인트가 정확히 +1(합집합 — completedWords/clearedWords 중복 집계 아님)', gardenAfterGuided === gardenBeforeGuided + 1, `before=${gardenBeforeGuided} after=${gardenAfterGuided}`)
    } catch (err) {
      const bodyText3 = await page3.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [A6-guided 진단] mockErrors=${JSON.stringify(db3.errors.slice(0, 3))}\n  [A6-guided 진단] body(앞 400자)=${JSON.stringify(bodyText3.slice(0, 400))}`
      throw err
    } finally {
      await context3.close()
    }
    unmockedRequests.push(...unmockedRequests3)
    db.errors.push(...db3.errors)
  } catch (err) {
    // 진단 — 예외 시점의 화면 텍스트/mock 오류를 에러 메시지에 실어 러너가
    // 그대로 출력하게 한다(페이지는 finally에서 닫히므로 여기서만 읽을 수 있다).
    const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
    err.message += `\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
    throw err
  } finally {
    await context.close()
  }

  return { results: r.results, unmockedRequests, mockErrors: db.errors }
}
