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
    r.check('녹음 필요 42행 전부 상태 "파일 없음"', recs.length === 42 && recs.every((x) => x.s === 'missing' && x.t.includes('파일 없음')) && (await txt(page, 'phr-recordings-count')) === '42', String(recs.length))
    r.check('녹음 표: 열 7개(no·id·소리·대표 철자·예시 단어·파일 이름 규칙·상태), 파일 이름 규칙 ph-01-a.mp3 / ph-31-th-thin.mp3', (await page.locator('[data-testid="phr-recordings"] thead th').count()) === 7 && recs[0].t.includes('ph-01-a.mp3') && recs[30].t.includes('ph-31-th-thin.mp3'), JSON.stringify(recs[0]))
    r.check('요약: 새 이미지 제작 98 · 기존 에셋 후보 7 · 검토 필요 단어 17', (await chip('newimg')) === '새 이미지 제작 98' && (await chip('cand')) === '기존 에셋 후보 7' && (await chip('review')) === '검토 필요 단어 17', sum)

    // 단어 필터: 표 행 수가 바뀐다(메모리 상태뿐)
    const wc = async () => ({ rows: await page.locator('[data-testid="phr-word"]').count(), n: await txt(page, 'phr-words-count') })
    const fil = {}
    for (const k of ['all', 'ready', 'needed', 'candidate', 'free', 'review']) { await T(page, `phr-filter-${k}`).click(); fil[k] = await wc() }
    r.check('필터: 전체 210 / 그림 준비 32 / 제작 대기 105 / 기존 후보 7 / 그림 없이 73 / 검토 필요 17', Object.entries({ all: 210, ready: 32, needed: 105, candidate: 7, free: 73, review: 17 }).every(([k, v]) => fil[k].rows === v && fil[k].n === String(v)), JSON.stringify(fil))
    await T(page, 'phr-filter-review').click()
    const rv = await page.locator('[data-testid="phr-word"]').evaluateAll((l) => l.map((e) => e.innerText))
    r.check('검토 필요 표: 모든 행에 "검토 필요" 배지와 이유, jumper = sweater 메모', rv.every((t) => t.includes('검토 필요 ·')) && rv.some((t) => t.includes('jumper') && t.includes('sweater')), rv[0])
    await T(page, 'phr-filter-candidate').click()
    const cw = await page.locator('[data-testid="phr-word"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-word')).sort().join())
    r.check('기존 후보 표 = cat,duck,fox,gate,lamp,tent,tree', cw === 'cat,duck,fox,gate,lamp,tent,tree', cw)
    await T(page, 'phr-filter-all').click()
    const row1 = await page.locator('[data-testid="phr-word"][data-word="ship"]').innerText()
    r.check('단어 표 열: ship = Book·Unit, 철자 분해 sh · i · p, 음가 /ʃ/ /ɪ/ /p/, 난이도, 그림 상태', /Book 4 · Unit/.test(row1) && row1.includes('sh · i · p') && row1.includes('/ʃ/ /ɪ/ /p/') && row1.includes('제작 대기'), row1)

    // 기존 에셋 후보 7개: 썸네일이 실제로 로드됐고 "승인 필요" 표시
    const cands = await page.locator('[data-testid="phr-candidate"]').evaluateAll((l) => l.map((e) => { const i = e.querySelector('img'); const b = i ? i.getBoundingClientRect() : {}; return { w: e.getAttribute('data-word'), nat: i ? i.naturalWidth : null, bw: b.width, bh: b.height, fit: i ? getComputedStyle(i).objectFit : '', t: e.innerText } }))
    r.check('기존 에셋 후보 7개(썸네일 3 + kit 경로만 4): 썸네일 로드(naturalWidth>0), 같은 정사각 상자(object-fit: contain), "승인 필요 — 학생 화면에 사용 안 함"', cands.length === 7 && (await txt(page, 'phr-candidates-count')) === '7' && cands.filter((c) => c.nat != null).length === 3 && cands.every((c) => (c.nat == null || (c.nat > 0 && c.bw === c.bh && c.fit === 'contain')) && c.t.includes('승인 필요 — 학생 화면에 사용 안 함') && c.t.includes('src/assets/town/')), JSON.stringify(cands.map((c) => [c.w, c.nat, c.bw, c.bh])))
    const unitRv = await page.locator('[data-testid="phr-unit-review"]').count()
    r.check('Unit 표 단어에 검토 배지(⚠)가 보임', unitRv > 0, String(unitRv))
    r.check('방언 메모 11개', (await page.locator('[data-testid="phr-dialect"] li').count()) === 11)
    r.check('편집 컨트롤 없음(input/textarea/select 0, 필터 버튼 6개 외 승인·저장 버튼 0)', (await T(page, 'phr-root').locator('input, textarea, select').count()) === 0 && (await T(page, 'phr-root').locator('button').count()) === 6 && (await T(page, 'phr-filter').locator('button').count()) === 6)

    r.check('1280px 가로 넘침 없음', (await overflow(page)) <= 0, String(await overflow(page)))
    await page.setViewportSize({ width: 360, height: 640 })
    r.check('360px 페이지 가로 넘침 없음(표는 안쪽에서 스크롤)', (await overflow(page)) <= 0, String(await overflow(page)))
    for (const id of ['phr-words', 'phr-recordings']) {
      const o = await T(page, id).evaluate((t) => { let w = t.parentElement; return { ox: getComputedStyle(w).overflowX, scroll: w.scrollWidth, client: w.clientWidth } })
      r.check(`360px ${id} 표는 안쪽 스크롤(overflow auto, 내용 > 폭)`, /auto|scroll/.test(o.ox) && o.scroll > o.client, JSON.stringify(o))
    }
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
