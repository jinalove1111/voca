// tests/e2e/entranceInputLoss.spec.mjs
//
// 입실 단어시험(EntranceTest.jsx) 입력 유실 의혹 검증(2026-09-11).
//
// 가설: 학생이 답을 입력하는 도중 타이머/상태 전환이 setInput('')을 실행해
// 아직 제출하지 못한 입력을 지워버릴 수 있다(용의 지점: startTest() ~251행,
// advance() 안 900ms 피드백 타이머 ~313행). 코드를 먼저 정독한 결과:
//   - JSX(436~476행)는 feedback이 non-null인 동안 <input> 자체를 렌더하지
//     않는다(삼항 분기) — 즉 "입력 중에 지워진다"는 시나리오가 성립하려면
//     그 순간에 입력 필드가 실제로 존재해야 하는데, 코드상 존재하지 않는다.
//   - advance()는 feedback이 이미 떠 있으면 맨 앞에서 즉시 return한다(304행)
//     — 피드백 표시 중 중복 advance 자체가 불가능.
// 즉 정적 분석만으로는 "재현 안 됨"이 유력하지만, 이 파일은 그 결론을 실제
// 브라우저에서 실증한다(추측으로 끝내지 않음) — 아래 (a)(b)(c) 세 경로.
//
// 실 Supabase/Vercel 요청 0건 — installMocks가 전체 네트워크를 가로챈다
// (tests/e2e/lib/mockRoutes.mjs). fixture는 QA 학생의 primary 교재(TB_A)
// 소유 반(class_id=TB_A.classId)에 active 입실시험 1건을 직접 주입한다 —
// entrance_tests 스키마(entranceTestApi.js mapTest)와 학생 조회 범위 규칙
// (entranceEligibility.js entranceScopeClassIds: 사람 반 ∪ 배정 class_id ∪
// 배정 교재의 소유 반)을 그대로 따른다. 시험이 이 학생의 scope에서 유일한
// active 시험이므로 entranceTestSelection.js가 최상위 후보 1개로 즉시
// chosen 처리해(needsChoice 없음) 선택 화면 없이 바로 'intro'로 진입한다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { buildFixtureTables, QA_STUDENT_NAME, QA_LOGIN_PIN, TB_A } from './fixtures/index.mjs'

// student.spec.mjs와 동일한 결정론적 폴링 헬퍼(고정 sleep 대신 조건 자체를
// 반복 확인) — 새 파일이라 재정의(다른 에이전트 소유 파일인 student.spec을
// import해서 재사용하지 않는다, 규칙 16).
async function waitUntil(fn, { timeout = 15000, interval = 100 } = {}) {
  const start = Date.now()
  let last
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { last = await fn() } catch { last = undefined }
    if (last) return last
    if (Date.now() - start >= timeout) return last
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

// wordLibrary.localIsoDateStr()/analyticsMath.fmtDay()와 바이트 단위로 같은
// 규칙(로컬 타임존 기준 YYYY-MM-DD) — 같은 머신에서 Node와 브라우저가 같은
// "오늘"을 보므로 이 문자열이 entrance_tests.date 필터와 항상 일치한다.
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function login(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

// TB_A 소유 반에 active 입실시험 1건을 심은 fixture 테이블 세트를 만든다.
// words는 TB_A의 실제 단어(어느 유닛이든 무방 — entrance_tests에는 unit_id가
// 없고, 이 시험이 학생 scope의 유일한 active 시험이라 tier 판정과 무관하게
// 자동 선택된다, entranceTestSelection.js 참고) 중 앞의 wordCount개.
function makeEntranceTestRow(tables, { id, timeLimitSeconds = 600, wordCount = 3 } = {}) {
  const words = tables.words
    .filter((w) => w.unit_id.startsWith(`e2e-unit-${TB_A.id}`))
    .slice(0, wordCount)
    .map((w) => ({ word: w.word, meaning: w.meaning }))
  return {
    id,
    class_id: TB_A.classId,
    date: localDateStr(),
    status: 'active',
    direction: 'kr2en', // 고정 방향 — 프롬프트/정답이 결정론적이어야 어느 문제가 나와도 정답을 계산할 수 있다.
    question_count: wordCount,
    time_limit_seconds: timeLimitSeconds,
    words,
    created_at: '2026-01-01T00:00:00Z',
  }
}

async function setupEntranceContext(browser, { id, timeLimitSeconds, wordCount }) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const tables = buildFixtureTables()
  const row = makeEntranceTestRow(tables, { id, timeLimitSeconds, wordCount })
  tables.entrance_tests = [row]
  const { db, unmockedRequests, ttsFallbackRequests } = await installMocks(page, { tables })
  return { context, page, db, unmockedRequests, ttsFallbackRequests, testWords: row.words }
}

// 배너 클릭 -> 시험 시작 -> running phase(입력창 등장)까지.
async function openAndStartEntranceTest(page) {
  const bannerBtn = page.getByRole('button', { name: /오늘의 입실시험이 시작됐어요/ })
  await bannerBtn.waitFor({ state: 'visible', timeout: 20000 })
  await bannerBtn.click()
  const startBtn = page.getByRole('button', { name: '🔥 시험 시작!' })
  await startBtn.waitFor({ state: 'visible', timeout: 10000 })
  await startBtn.click()
  await page.locator('input').first().waitFor({ state: 'visible', timeout: 10000 })
}

// 현재 문제 프롬프트(=뜻, kr2en 고정이므로) 텍스트로 fixture 단어를 역추적.
async function readCurrentPromptWord(page, testWords) {
  const promptEl = page.locator('p.text-3xl.font-black.text-gray-800.break-words')
  await promptEl.waitFor({ state: 'visible' })
  const promptText = (await promptEl.textContent())?.trim()
  const word = testWords.find((w) => w.meaning === promptText)
  return { promptText, word }
}

export async function run(browser, baseURL) {
  const r = createRecorder('[entrance]')
  const allUnmocked = []
  const allTtsFallback = []
  const allMockErrors = []

  // ── (a) 피드백 표시 창(FEEDBACK_MS=900ms) — 정답 제출 직후 타이핑 시도 ──
  {
    const { context, page, db, unmockedRequests, ttsFallbackRequests, testWords } =
      await setupEntranceContext(browser, { id: 'e2e-entrance-feedback', timeLimitSeconds: 600, wordCount: 3 })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await openAndStartEntranceTest(page)

      const { promptText, word } = await readCurrentPromptWord(page, testWords)
      r.check('(a) Q1 프롬프트에 대응하는 fixture 단어를 찾음(kr2en 고정 — prompt=meaning)', !!word, promptText)

      const input = page.locator('input')
      await input.fill(word.word)
      await input.press('Enter') // advance(input) 트리거 — feedback이 non-null이 되고 900ms 타이머 시작

      // 피드백 카드가 실제로 뜬 순간을 폴링(고정 sleep 대신) — 그 즉시 아래
      // 타이핑 시도가 "정말 피드백 표시 중"에 일어나도록 보장한다.
      const feedbackShown = await waitUntil(
        () => page.locator('.animate-slide-up').isVisible().catch(() => false),
        { timeout: 2000, interval: 20 }
      )
      r.check('(a) 정답 제출 직후 피드백 카드가 나타남', !!feedbackShown)

      // 가설 검증 지점 1 — 피드백 표시 중 <input>이 DOM에 존재하는가(JSX
      // 436~476행 삼항 분기를 실제 브라우저에서 재확인).
      const feedbackInputCount = await page.locator('input').count()
      r.check(
        '(a) 피드백 표시 중 input 엘리먼트가 DOM에 없음(JSX 삼항 분기 — feedback 카드만 렌더)',
        feedbackInputCount === 0,
        `count=${feedbackInputCount}`
      )

      // 만약 위 가정이 틀려 input이 실제로 남아있다면, 그 안에 타이핑이
      // 들어가는지까지 확인한다(가설이 맞다면 이 블록은 실행되지 않음).
      if (feedbackInputCount > 0) {
        await page.locator('input').fill('xyz-during-feedback').catch(() => {})
      }
      // input이 없어도(정상 가정) 키 입력 자체는 보낸다 — 포커스된 요소가
      // 없으면(또는 body) 아무 데도 반영되지 않아야 한다.
      await page.keyboard.type('abc')

      // 피드백이 사라지고(900ms) 다음 문제로 전환될 때까지 폴링.
      await waitUntil(
        async () => !(await page.locator('.animate-slide-up').isVisible().catch(() => false)),
        { timeout: 3000, interval: 20 }
      )
      // focusInput()의 50ms 지연 포커스 + 리렌더 여유.
      await page.waitForTimeout(300)

      const q2InputVisible = await page.locator('input').isVisible().catch(() => false)
      r.check('(a) 다음 문제(Q2) input이 다시 나타남', q2InputVisible)
      const q2Value = await page.locator('input').inputValue().catch(() => null)
      r.check(
        "(a) 피드백 중 타이핑('abc')이 Q2 input에 섞여 들어가지 않음(빈 문자열로 시작)",
        q2Value === '',
        `q2Value=${JSON.stringify(q2Value)}`
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [(a) 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [(a) 진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    allUnmocked.push(...unmockedRequests)
    allTtsFallback.push(...ttsFallbackRequests)
    allMockErrors.push(...db.errors)
  }

  // ── (b) 시간 초과 경로 — 입력했지만 제출(Enter/확인)하지 않은 답이 채점에
  //     반영되면 안 된다(현재 동작 문서화 목적 — 반드시 "버그"는 아님) ──
  {
    const { context, page, db, unmockedRequests, ttsFallbackRequests, testWords } =
      await setupEntranceContext(browser, { id: 'e2e-entrance-timeout', timeLimitSeconds: 2, wordCount: 1 })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await openAndStartEntranceTest(page)

      const { promptText, word } = await readCurrentPromptWord(page, testWords)
      r.check('(b) 유일한 문제의 프롬프트에 대응하는 fixture 단어를 찾음', !!word, promptText)

      // 정답을 입력만 하고 제출(Enter/확인)은 하지 않는다.
      await page.locator('input').fill(word.word)
      const typedButUnsubmitted = await page.locator('input').inputValue().catch(() => null)
      r.check('(b) 제출 전 input에 정답이 실제로 입력되어 있음(제출 안 함)', typedButUnsubmitted === word.word, `typed=${JSON.stringify(typedButUnsubmitted)}`)

      // time_limit_seconds=2 — 250ms tick이 deadline 초과를 감지해
      // finishTest()를 자동 호출할 때까지 폴링(결과 화면 진입 신호: "내 점수").
      const reachedResult = await waitUntil(
        () => page.getByText('내 점수', { exact: true }).isVisible().catch(() => false),
        { timeout: 8000, interval: 100 }
      )
      r.check('(b) 시간 초과 후 자동으로 결과 화면에 진입함', !!reachedResult)

      const scoreText = (await page.locator('p.text-5xl.font-black.my-1').textContent().catch(() => null))?.trim()
      // 마크업: {score}<span> / {total}</span> — 렌더된 텍스트는 "0 / 1" 형태.
      const scoreMatch = scoreText?.match(/^(\d+)\s*\/\s*(\d+)$/)
      const score = scoreMatch ? Number(scoreMatch[1]) : null
      r.check(
        '(b) 제출하지 않은(Enter/확인 안 누른) 답은 채점에 포함되지 않음(정답을 입력해뒀어도 점수 0)',
        score === 0,
        `scoreText=${JSON.stringify(scoreText)} typedAnswer=${JSON.stringify(typedButUnsubmitted)}(정답과 동일=${typedButUnsubmitted === word.word})`
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [(b) 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [(b) 진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    allUnmocked.push(...unmockedRequests)
    allTtsFallback.push(...ttsFallbackRequests)
    allMockErrors.push(...db.errors)
  }

  // ── (c) 리마운트 경로 — 피드백 종료 직후(50ms 지연 포커스/재마운트 구간)
  //     새 문제 input에 곧바로 입력한 값이 유지되는가 ──
  {
    const { context, page, db, unmockedRequests, ttsFallbackRequests, testWords } =
      await setupEntranceContext(browser, { id: 'e2e-entrance-remount', timeLimitSeconds: 600, wordCount: 3 })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await openAndStartEntranceTest(page)

      const { promptText, word } = await readCurrentPromptWord(page, testWords)
      r.check('(c) Q1 프롬프트에 대응하는 fixture 단어를 찾음', !!word, promptText)

      await page.locator('input').fill(word.word)
      await page.locator('input').press('Enter')

      // 피드백 카드가 사라지고 input이 DOM에서 사라졌다가(언마운트) 다시
      // 나타나는(리마운트) 순간을 최대한 촘촘히 폴링한다 — "재등장 후 100ms
      // 이내" 조건을 흉내내기 위해 interval을 짧게 유지.
      await waitUntil(async () => (await page.locator('input').count()) === 0, { timeout: 2000, interval: 10 })
      const reappeared = await waitUntil(async () => (await page.locator('input').count()) > 0, { timeout: 3000, interval: 10 })
      r.check('(c) 피드백 종료 후 새 문제(Q2) input이 다시 나타남(리마운트)', !!reappeared)

      // 재등장 직후 곧바로 타이핑 — pressSequentially(옛 type())로 키 단위
      // 이벤트를 보낸다(fill()은 onChange 1회 합성이라 리마운트 race를
      // 놓칠 수 있어 실제 타이핑에 가까운 경로를 쓴다).
      await page.locator('input').pressSequentially('xy', { delay: 0 })

      await page.waitForTimeout(1000)
      const finalValue = await page.locator('input').inputValue().catch(() => null)
      r.check(
        "(c) 리마운트 직후 타이핑한 값('xy')이 1초 후에도 그대로 보존됨(50ms 지연 포커스가 값을 지우지 않음)",
        finalValue === 'xy',
        `finalValue=${JSON.stringify(finalValue)}`
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      err.message += `\n  [(c) 진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [(c) 진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
      throw err
    } finally {
      await context.close()
    }
    allUnmocked.push(...unmockedRequests)
    allTtsFallback.push(...ttsFallbackRequests)
    allMockErrors.push(...db.errors)
  }

  return { results: r.results, unmockedRequests: allUnmocked, mockErrors: allMockErrors, ttsFallbackRequests: allTtsFallback }
}
