// tests/e2e/phonicsProgress.spec.mjs — PAUL PHONICS 학습 발달 샘플 화면(257차): 학생 미리보기(테스터 전용) + 관리자 탭. 가상의 `샘플반` 데이터만, 저장 0, 쓰기 요청 0. 네트워크 mock.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { ADMIN_PIN, QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'

const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const txt = async (page, id) => ((await T(page, id).innerText()) || '').trim()
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const storageSnap = (page) => page.evaluate(() => [...Object.keys(localStorage).map((k) => `local:${k}`), ...Object.keys(sessionStorage).map((k) => `session:${k}`)].sort())
const TESTER_ONLY = 'e2e00000-0000-4000-8000-00000000a002'
const GENERAL = 'e2e00000-0000-4000-8000-00000000b001'
const LOGIN_PATHS = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress', '/api/grant-xp']
const SAMPLE = '샘플 데이터 — 실제 학생 기록이 아닙니다'
const nonGet = (reqs) => reqs.filter((q) => q.method !== 'GET' && q.method !== 'HEAD' && q.method !== 'OPTIONS').filter((q) => { try { return !LOGIN_PATHS.includes(new URL(q.url).pathname) } catch { return true } })

async function loginStudent(page) {
  const input = page.getByPlaceholder('이름 입력...')
  await input.waitFor({ state: 'visible', timeout: 90000 })
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await input.waitFor({ state: 'hidden', timeout: 20000 })
  await sleep(1500)
  await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 20000 })
  await T(page, 'dash-picture-words').click()
  await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 20000 })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[phonics-progress]')
  const unmocked = []
  const mockErrors = []
  const tts = []

  async function session(label, viewport, studentId, body) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const reqs = []
    page.on('request', (q) => reqs.push({ url: q.url(), method: q.method() }))
    const mocks = await installMocks(page, studentId ? { studentId } : {})
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await body({ page, reqs, label })
      r.check(`${label} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${label} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmocked.push(...mocks.unmockedRequests)
    mockErrors.push(...mocks.db.errors)
    tts.push(...mocks.ttsFallbackRequests)
  }

  // ---- 학생: 테스터만 진입 버튼이 있고, 샘플 학생 A만 보인다
  await session('학생 [360x640]', { width: 360, height: 640 }, TESTER_ONLY, async ({ page, reqs, label }) => {
    await loginStudent(page)
    await T(page, 'pwg-open-phonics').click()
    await T(page, 'pph-main').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${label} 책장에 "나의 학습 발달상황 (샘플)" 버튼`, (await txt(page, 'pph-open-progress')) === '나의 학습 발달상황 (샘플)')
    const base = await storageSnap(page)
    const mark = reqs.length
    await T(page, 'pph-open-progress').click()
    await T(page, 'ppg-root').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${label} 샘플 배너 보임: "${SAMPLE}"`, (await txt(page, 'ppg-sample-notice')) === SAMPLE)
    const bars = await page.locator('[data-testid="ppg-book"]').evaluateAll((l) => l.map((e) => ({ b: e.getAttribute('data-book'), p: e.getAttribute('data-percent'), w: e.querySelector('span > span[style]')?.style.width })))
    r.check(`${label} Book 막대 5개(b1~b5)`, bars.length === 5 && bars.map((b) => b.b).join() === 'b1,b2,b3,b4,b5' && bars.every((b) => b.w === `${b.p}%`), JSON.stringify(bars))
    r.check(`${label} 시험 결과·반복 오답 소리·복습 단어·최근 활동이 비어 있지 않음`, (await T(page, 'ppg-test').count()) > 0 && (await T(page, 'ppg-weak-item').count()) > 0 && (await T(page, 'ppg-review-word').count()) > 0 && (await T(page, 'ppg-recent-item').count()) === 5)
    const root = await txt(page, 'ppg-root')
    r.check(`${label} 로그인한 학생의 이름이 화면 안에 없음, 샘플 학생 A만`, !root.includes(QA_STUDENT_NAME) && root.includes('샘플 학생 A') && !/샘플 학생 [B-F]/.test(root), QA_STUDENT_NAME)
    const chips = await page.locator('[data-testid="ppg-unit"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-state')))
    r.check(`${label} Unit 상태 칸 43개, 상태는 4종 안, 하는 중/했어요/아직 섞여 있음, 범례`, chips.length === 43 && chips.every((c) => ['not-started', 'in-progress', 'done', 'needs-review'].includes(c)) && chips.includes('done') && chips.includes('not-started') && ['아직', '하는 중', '했어요', '다시 보기'].every((t) => root.includes(t)), JSON.stringify(chips))
    const trend = await txt(page, 'ppg-trend')
    r.check(`${label} 시험 변화 문구 (+n / 같아요 / 다시 해 보면 좋아요 / 첫 시험)`, /^(지난번보다 \+\d+|지난번과 같아요|다시 해 보면 좋아요|첫 시험)$/.test(trend), trend)
    r.check(`${label} 복습 추천 1~3개, 어린이 화면에 발음기호 없음`, (await T(page, 'ppg-recommend').locator('li').count()) >= 1 && (await T(page, 'ppg-recommend').locator('li').count()) <= 3 && !/[ɪæɒʌðθʃʒŋɔəɜɑʊɛː]/.test(root), root.slice(0, 80))
    r.check(`${label} "지금은 점수가 저장되지 않아요" 문구`, root.includes('지금은 점수가 저장되지 않아요'))
    await T(page, 'ppg-sample-G').click()
    await T(page, 'ppg-empty').waitFor({ state: 'visible', timeout: 5000 })
    const emptyTxt = await txt(page, 'ppg-root')
    r.check(`${label} 샘플 G → 빈 상태 문구만, 막대·시험·숫자 기록 없음`, (await txt(page, 'ppg-empty')) === '아직 학습 기록이 없어요 — 첫 Unit을 시작해 볼까요?' && (await T(page, 'ppg-book').count()) === 0 && (await T(page, 'ppg-test').count()) === 0 && !/\d+ ?\/ ?\d+|\d+%/.test(emptyTxt), emptyTxt.slice(0, 120))
    r.check(`${label} 빈 상태 360px 가로 넘침 없음`, (await overflow(page)) <= 0)
    await T(page, 'ppg-sample-A').click()
    await T(page, 'ppg-books').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${label} 순위·랭킹 문구 없음`, !/순위|랭킹/.test(root))
    r.check(`${label} 360px 가로 넘침 없음`, (await overflow(page)) <= 0, String(await overflow(page)))
    for (const [w, h] of [[768, 900], [1280, 800]]) { await page.setViewportSize({ width: w, height: h }); r.check(`${label} ${w}px 가로 넘침 없음`, (await overflow(page)) <= 0, String(await overflow(page))) }
    await page.setViewportSize({ width: 360, height: 640 })
    await T(page, 'ppg-back').click()
    await T(page, 'pph-main').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${label} 돌아가기 → 책장`, (await T(page, 'pph-root').getAttribute('data-screen')) === 'main')
    const added = (await storageSnap(page)).filter((k) => !base.includes(k) && k !== 'local:paul_easy_sync_meta')
    r.check(`${label} 새 저장소 키 0건, GET 아닌 요청 0건`, added.length === 0 && nonGet(reqs.slice(mark)).length === 0, JSON.stringify([added, nonGet(reqs.slice(mark)).slice(0, 2)]))
  })

  await session('일반 학생 [360x640]', { width: 360, height: 640 }, GENERAL, async ({ page, label }) => {
    const input = page.getByPlaceholder('이름 입력...')
    await input.waitFor({ state: 'visible', timeout: 90000 })
    await input.fill(QA_STUDENT_NAME)
    await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
    await page.getByRole('button', { name: '시작하기!' }).click()
    await input.waitFor({ state: 'hidden', timeout: 20000 })
    await sleep(1500)
    r.check(`${label} 그림 단어/파닉스 진입 버튼 없음(따라서 샘플 화면도 없음)`, (await T(page, 'dash-picture-words').count()) === 0 && (await T(page, 'pwg-open-phonics').count()) === 0 && (await T(page, 'pph-open-progress').count()) === 0 && (await T(page, 'ppg-root').count()) === 0)
  })

  // ---- 관리자 탭
  for (const [w, h] of [[1280, 900], [768, 900], [360, 640]]) {
    await session(`관리자 [${w}x${h}]`, { width: w, height: h }, null, async ({ page, reqs, label }) => {
      await page.locator('button', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 90000 })
      await page.locator('button', { hasText: '⚙️ 관리자' }).click()
      await page.getByPlaceholder('비밀번호').fill(ADMIN_PIN)
      await page.locator('button', { hasText: '로그인' }).click()
      await page.locator('h1', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 30000 })
      const base = await storageSnap(page)
      const mark = reqs.length
      await page.locator('button', { hasText: '📈 파닉스 발달 (샘플)' }).click()
      await T(page, 'ppa-root').waitFor({ state: 'visible', timeout: 30000 })
      r.check(`${label} 샘플 배너`, (await txt(page, 'ppa-sample-notice')).startsWith(SAMPLE))
      r.check(`${label} 반별 학생 목록: 샘플반, 7행(G는 "기록 없음"), 이름이 모두 "샘플 학생"`, (await txt(page, 'ppa-class')).includes('샘플반') && (await T(page, 'ppa-class-row').count()) === 7 && (await T(page, 'ppa-class-row').nth(6).innerText()).includes('기록 없음') && (await T(page, 'ppa-class-row').allTextContents()).every((t) => t.startsWith('샘플 학생')))
      r.check(`${label} 처음에는 학생 현황이 비어 있음`, (await T(page, 'ppa-student').innerText()).includes('학생을 선택하세요'))
      await T(page, 'ppa-class-row').nth(2).click()
      await T(page, 'ppa-student-books').waitFor({ state: 'visible', timeout: 5000 })
      r.check(`${label} 행 선택 → 학생별 현황(C): Book 5개, 시험, 취약 소리, 복습 단어, 최근 활동`, (await T(page, 'ppa-student').innerText()).includes('샘플 학생 C') && (await T(page, 'ppa-student-book').count()) === 5 && (await T(page, 'ppa-student-test').count()) > 0 && (await T(page, 'ppa-student-weak-item').count()) > 0 && (await T(page, 'ppa-student-review-word').count()) > 0 && (await T(page, 'ppa-student-recent-item').count()) === 5)
      r.check(`${label} 선택 행 표시(data-selected)`, (await T(page, 'ppa-class-row').nth(2).getAttribute('data-selected')) === 'true')
      r.check(`${label} 시험 결과 비교: 7행`, (await T(page, 'ppa-compare-row').count()) === 7)
      const weak = await T(page, 'ppa-phoneme-row').allTextContents()
      const rates = await page.locator('[data-testid="ppa-phoneme-row"] td:nth-child(4)').allTextContents().then((l) => l.map((t) => parseInt(t, 10)))
      r.check(`${label} 음소별 오답 분석 표: 비어 있지 않고 오답률 내림차순`, weak.length > 0 && rates.every((v, i) => i === 0 || rates[i - 1] >= v), JSON.stringify(rates.slice(0, 8)))
      r.check(`${label} 취약 영역(C): /θ/ 포함`, (await txt(page, 'ppa-weak-areas')).includes('/θ/'), await txt(page, 'ppa-weak-areas'))
            r.check(`${label} 복습 추천: 학생 7명`, (await T(page, 'ppa-recommend-item').count()) === 7)
      const parent = await txt(page, 'ppa-parent-text')
      r.check(`${label} 학부모 요약: 비어 있지 않고 "샘플" 포함, 문장 3~5개`, parent.length > 20 && parent.includes('샘플') && (await txt(page, 'ppa-parent')).includes('샘플 —') && parent.split('. ').length >= 3 && parent.split('. ').length <= 5, parent)
      r.check(`${label} 편집 컨트롤 없음(input/textarea/select/button 0)`, (await T(page, 'ppa-root').locator('input, textarea, select, button').count()) === 0)
      r.check(`${label} 페이지 가로 넘침 없음`, (await overflow(page)) <= 0, String(await overflow(page)))
      const added = (await storageSnap(page)).filter((k) => !base.includes(k))
      r.check(`${label} 새 저장소 키 0건, GET 아닌 요청 0건`, added.length === 0 && nonGet(reqs.slice(mark)).length === 0, JSON.stringify([added, nonGet(reqs.slice(mark)).slice(0, 2)]))
    })
  }

  return { results: r.results, unmockedRequests: unmocked, mockErrors, ttsFallbackRequests: tts }
}
