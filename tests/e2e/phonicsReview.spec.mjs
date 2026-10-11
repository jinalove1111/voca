// tests/e2e/phonicsReview.spec.mjs — PAUL PHONICS 관리자 검토 탭(255차). 읽기 전용: 저장 0, 쓰기 요청 0. 네트워크 mock.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { ADMIN_PIN } from './fixtures/index.mjs'

const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const keys = (page) => page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].sort())
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

async function openPanel(page) {
  await page.locator('button', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 90000 })
  await page.locator('button', { hasText: '⚙️ 관리자' }).click()
  await page.getByPlaceholder('비밀번호').fill(ADMIN_PIN)
  await page.locator('button', { hasText: '로그인' }).click()
  await page.locator('h1', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('button', { hasText: '🔤 파닉스 검토' }).click()
  await T(page, 'phr-root').waitFor({ state: 'visible', timeout: 30000 })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[phonics-review]')
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const { db, unmockedRequests, ttsFallbackRequests } = await installMocks(page)
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  const net = []
  page.on('request', (q) => net.push({ method: q.method(), url: q.url() }))
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
    await openPanel(page)
    const netStart = net.length
    const keysStart = await keys(page)

    const sum = await txt(page, 'phr-summary')
    r.check('헤더 문구: 구조만 승인, 모든 Unit 임시', ((await T(page, 'phr-root').innerText()) || '').includes('PAUL PHONICS 관리자 검토 자료 — 구조만 승인, 모든 Unit 임시'))
    const chip = async (k) => txt(page, `phr-chip-${k}`)
    r.check('요약: Unit 43 · 승인 0 · 단어 210', (await chip('unit')) === 'Unit 43' && (await chip('approved')) === '승인 0' && (await chip('words')) === '단어 210', sum)
    r.check('요약: 이미지 제작 대기 105 · 그림 없이 학습 73 · 그림 준비 32 (105 + 73 + 32 = 210)', (await chip('needed')) === '이미지 제작 대기 105' && (await chip('free')) === '그림 없이 학습 73' && (await chip('ready')) === '그림 준비 32', sum)
    r.check('요약: 녹음 필요 42 · 녹음 승인 0 · 배우지 않은 소리가 필요한 단어 0', (await chip('rec')) === '녹음 필요 42' && (await chip('recok')) === '녹음 승인 0' && (await chip('unlearned')) === '배우지 않은 소리가 필요한 단어 0', sum)

    const counts = []
    for (const [b, n] of [['b1', 5], ['b2', 7], ['b3', 6], ['b4', 11], ['b5', 14]]) {
      counts.push((await page.locator(`[data-testid="phr-book-${b}"] tbody tr`).count()) === n && (await page.locator(`[data-testid^="phr-unit-${b}-"]`).count()) === n)
    }
    r.check('표 5개: 행 5/7/6/11/14', (await page.locator('[data-testid^="phr-book-b"]').count()) === 5 && counts.every(Boolean), JSON.stringify(counts))
    const rowTexts = await page.locator('[data-testid^="phr-unit-b"]').evaluateAll((l) => l.map((e) => e.innerText))
    r.check('43행 모두 "임시" 표시', rowTexts.length === 43 && rowTexts.every((t) => t.includes('임시')), String(rowTexts.length))
    const row = async (id) => ((await T(page, `phr-unit-${id}`).innerText()) || '')
    r.check('b2-u6 행: ck 보조 철자 표시 + 겹자음 녹음 불필요', (await row('b2-u6')).includes('ck 보조') && (await row('b2-u6')).includes('녹음 불필요'), await row('b2-u6'))
    const cl = await Promise.all(['b4-u8', 'b4-u9', 'b4-u10', 'b4-u11'].map(row))
    r.check('b4 자음군 4행: "녹음 불필요" + Bubble Pop 없음 + Word Train 있음', cl.every((t) => t.includes('녹음 불필요') && !t.includes('Bubble Pop') && t.includes('Word Train')), JSON.stringify(cl.map((t) => t.slice(0, 40))))
    const r1 = await row('b5-u12')
    r.check('b5-u12 행: Word Train + 철자 게임 둘(Bubble Pop 없음), 음성 승인 0 / 필요 1', !r1.includes('Bubble Pop') && r1.includes('Word Train') && r1.includes('Alphabet Hammer') && r1.includes('승인 0 / 필요 1'), r1)
    const markers = await T(page, 'phr-unit-b2-u1').locator('[data-image]').evaluateAll((l) => l.map((e) => `${e.getAttribute('data-image')}:${e.textContent.trim()}`))
    r.check('b2-u1 대표 단어 5개: 전부 🔤/⏳ 표시(그림 준비 0), 이미지 준비 0 / 5', markers.length === 5 && markers.every((m) => !m.startsWith('ready')) && (await row('b2-u1')).includes('0 / 5'), JSON.stringify(markers))
    r.check('b5-u7 행: ou /uː/ 예외 철자와 재사용 /uː/ 표시', (await row('b5-u7')).includes('soup, group, you') && (await row('b5-u7')).includes('재사용'), await row('b5-u7'))
    r.check('b2-u4 선수 학습 문구 "Book 1 전체 + Book 2 Unit 1–3"', (await row('b2-u4')).includes('Book 1 전체 + Book 2 Unit 1–3'))

    const need = await page.locator('[data-testid="phr-need-image-item"]').allTextContents()
    const free = await page.locator('[data-testid="phr-no-image-item"]').allTextContents()
    r.check('이미지 제작 대기 105개(cat, zoo 포함, this 없음)', need.length === 105 && need.includes('cat') && need.includes('zoo') && !need.includes('this') && (await txt(page, 'phr-need-image-count')) === '105', String(need.length))
    r.check('그림 없이 학습 73개(this 포함, cat 없음)', free.length === 73 && free.includes('this') && !free.includes('cat') && (await txt(page, 'phr-no-image-count')) === '73', String(free.length))
    const recs = await page.locator('[data-testid="phr-recording"]').evaluateAll((l) => l.map((e) => ({ s: e.getAttribute('data-status'), t: e.innerText })))
    r.check('녹음 필요 42행 전부 상태 대기', recs.length === 42 && recs.every((x) => x.s === 'pending' && x.t.includes('대기')) && (await txt(page, 'phr-recordings-count')) === '42', String(recs.length))
    r.check('방언 메모 11개', (await page.locator('[data-testid="phr-dialect"] li').count()) === 11)
    r.check('편집 컨트롤 없음(input/textarea/select 0, 승인·저장 버튼 0)', (await T(page, 'phr-root').locator('input, textarea, select').count()) === 0 && (await T(page, 'phr-root').locator('button').count()) === 0)

    r.check('1280px 가로 넘침 없음', (await overflow(page)) <= 0, String(await overflow(page)))
    await page.setViewportSize({ width: 360, height: 640 })
    r.check('360px 페이지 가로 넘침 없음(표는 안쪽에서 스크롤)', (await overflow(page)) <= 0, String(await overflow(page)))
    const inner = await T(page, 'phr-book-b5').evaluate((t) => { const w = t.parentElement; return { scroll: w.scrollWidth, client: w.clientWidth, ox: getComputedStyle(w).overflowX } })
    r.check('360px 표 컨테이너는 안쪽 가로 스크롤(overflow-x:auto, 내용 > 폭)', inner.ox === 'auto' && inner.scroll > inner.client, JSON.stringify(inner))

    const writes = net.slice(netStart).filter((q) => q.method !== 'GET' && q.method !== 'HEAD' && q.method !== 'OPTIONS')
    r.check('패널 사용 중 GET 아닌 요청 0건', writes.length === 0, JSON.stringify(writes.slice(0, 3)))
    r.check('패널 사용 중 저장소 키 변화 0건', JSON.stringify(await keys(page)) === JSON.stringify(keysStart), JSON.stringify(await keys(page)))
    r.check('콘솔 오류 0건', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)))
  } catch (err) {
    const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
    err.message += `\n  [진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
    throw err
  } finally {
    await context.close()
  }
  return { results: r.results, unmockedRequests, mockErrors: db.errors, ttsFallbackRequests }
}
