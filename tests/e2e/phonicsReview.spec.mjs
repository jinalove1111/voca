// tests/e2e/phonicsReview.spec.mjs — PAUL PHONICS 관리자 검토 탭(255차). 읽기 전용: 저장 0, 쓰기 요청 0. 네트워크 mock.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { ADMIN_PIN, QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'

const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const keys = (page) => page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].sort())
const TESTER_ONLY = 'e2e00000-0000-4000-8000-00000000a002'
const wav = (sec, rate = 8000) => { const n = Math.round(sec * rate); const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), 44 + i * 2); return b }
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
    r.check('녹음 표: 열 8개(no·id·소리·대표 철자·예시 단어·파일 이름 규칙·상태·미리보기), 파일 이름 규칙 ph-01-a.mp3 / ph-31-th-thin.mp3', (await page.locator('[data-testid="phr-recordings"] thead th').count()) === 8 && recs[0].t.includes('ph-01-a.mp3') && recs[30].t.includes('ph-31-th-thin.mp3'), JSON.stringify(recs[0]))
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
    r.check('편집 컨트롤 없음(미리보기 파일 입력 42개 외 input/textarea/select 0, 필터 버튼 6개 외 승인·저장 버튼 0)', (await T(page, 'phr-root').locator('input:not([data-testid^="phr-rec-file-"]), textarea, select').count()) === 0 && (await T(page, 'phr-root').locator('input[type=file]').count()) === 42 && (await T(page, 'phr-root').locator('button').count()) === 6 && (await T(page, 'phr-filter').locator('button').count()) === 6)

    // ---- 260차 녹음 등록 미리보기 (메모리 전용)
    await page.setViewportSize({ width: 1280, height: 900 })
    const netBefore = net.length
    const keysBefore = await keys(page)
    r.check('미리보기 안내 문구 + 실제 등록 0 / 42 · 승인 0 / 42 + 행 42개 + 파일 입력 accept', (await txt(page, 'phr-rec-notice')).startsWith('Preview 전용 — 선택한 파일은 이 브라우저 메모리에만 있고 저장·업로드되지 않습니다.') && (await txt(page, 'phr-rec-real')) === '실제 등록 0 / 42 · 승인 0 / 42' && (await T(page, 'phr-rec-row').count()) === 42 && (await T(page, 'phr-rec-file-a').getAttribute('accept')) === '.mp3,.m4a,.wav' && (await txt(page, 'phr-rec-preview-summary')) === '선택 0 · 검증 통과 0 · 승인(미리보기) 0')
    await T(page, 'phr-rec-file-a').setInputFiles({ name: 'ph-01-a.wav', mimeType: 'audio/wav', buffer: wav(0.5) })
    await T(page, 'phr-rec-play-a').waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForFunction(() => { const a = document.querySelector('[data-testid="phr-rec-result-a"] audio'); return a && a.readyState >= 1 }, null, { timeout: 5000 })
    const okRes = await T(page, 'phr-rec-result-a').getAttribute('data-ok')
    r.check('유효한 wav(0.5초): 검증 통과, 상태 "검수 대기", 이름 경고 없음', okRes === 'true' && (await txt(page, 'phr-rec-verdict-a')) === '검수 대기' && !(await txt(page, 'phr-rec-result-a')).includes('파일 이름이 달라요'), await txt(page, 'phr-rec-result-a'))
    await T(page, 'phr-rec-play-a').click()
    const played = await page.waitForFunction(() => { const a = document.querySelector('[data-testid="phr-rec-result-a"] audio'); return a.currentTime > 0 || a.ended }, null, { timeout: 5000 }).then(() => true).catch(() => false)
    r.check('재생 버튼: audio currentTime 증가 또는 ended', played)
    await T(page, 'phr-rec-approved-a').click()
    r.check('승인(미리보기) → 카운터 선택 1 · 검증 통과 1 · 승인(미리보기) 1, 실제 줄은 그대로 0 / 42, 행 상태는 계속 "파일 없음"', (await txt(page, 'phr-rec-preview-summary')) === '선택 1 · 검증 통과 1 · 승인(미리보기) 1' && (await txt(page, 'phr-rec-real')) === '실제 등록 0 / 42 · 승인 0 / 42' && (await txt(page, 'phr-rec-verdict-a')) === '승인(미리보기)' && (await T(page, 'phr-recording').first().getAttribute('data-status')) === 'missing')
    await T(page, 'phr-rec-rejected-a').click()
    r.check('반려(미리보기)로 바꾸면 승인 카운터 0', (await txt(page, 'phr-rec-preview-summary')) === '선택 1 · 검증 통과 1 · 승인(미리보기) 0' && (await txt(page, 'phr-rec-verdict-a')) === '반려(미리보기)')
    await T(page, 'phr-rec-file-e').setInputFiles({ name: 'ph-02-e.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(1024) })
    await T(page, 'phr-rec-result-e').waitFor({ state: 'visible', timeout: 5000 })
    r.check('1 KB 파일 → 크기 오류, 승인 버튼 비활성, 상태 검수 대기', (await txt(page, 'phr-rec-result-e')).includes('크기는 2~500KB') && (await T(page, 'phr-rec-approved-e').isDisabled()) && (await txt(page, 'phr-rec-verdict-e')) === '검수 대기', await txt(page, 'phr-rec-result-e'))
    await T(page, 'phr-rec-file-i').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello'.repeat(1000)) })
    await T(page, 'phr-rec-result-i').waitFor({ state: 'visible', timeout: 5000 })
    r.check('.txt 파일 → 형식 오류', (await txt(page, 'phr-rec-result-i')).includes('형식은 mp3/m4a/wav만 가능해요') && (await T(page, 'phr-rec-approved-i').isDisabled()), await txt(page, 'phr-rec-result-i'))
    await T(page, 'phr-rec-file-o').setInputFiles({ name: 'my-voice.wav', mimeType: 'audio/wav', buffer: wav(0.5) })
    await T(page, 'phr-rec-result-o').waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForFunction(() => { const a = document.querySelector('[data-testid="phr-rec-result-o"] audio'); return a && a.readyState >= 1 }, null, { timeout: 5000 })
    r.check('이름이 다른 파일 → 경고(기대 이름 ph-04-o.mp3 표시), 차단 아님', (await txt(page, 'phr-rec-result-o')).includes('기대: ph-04-o.mp3') && (await T(page, 'phr-rec-result-o').getAttribute('data-ok')) === 'true' && !(await T(page, 'phr-rec-approved-o').isDisabled()), await txt(page, 'phr-rec-result-o'))
    r.check('미리보기 중 GET 아닌 요청 0건, 새 저장소 키 0건, 콘솔 오류 0건', net.slice(netBefore).filter((q) => q.method !== 'GET' && q.method !== 'HEAD' && q.method !== 'OPTIONS').length === 0 && JSON.stringify(await keys(page)) === JSON.stringify(keysBefore) && consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 2)))
    // 같은 브라우저 컨텍스트의 학생 화면: 미리보기가 새어 나가지 않아 2단계는 계속 잠김
    const netEnd = net.length
    const keysEnd = await keys(page)
    const sp = await context.newPage()
    await installMocks(sp, { studentId: TESTER_ONLY })
    await sp.goto(baseURL, { waitUntil: 'domcontentloaded' })
    const nameInput = sp.getByPlaceholder('이름 입력...')
    await nameInput.waitFor({ state: 'visible', timeout: 90000 })
    await nameInput.fill(QA_STUDENT_NAME)
    await sp.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
    await sp.getByRole('button', { name: '시작하기!' }).click()
    await nameInput.waitFor({ state: 'hidden', timeout: 20000 })
    await T(sp, 'dash-picture-words').waitFor({ state: 'visible', timeout: 20000 })
    await T(sp, 'dash-picture-words').click()
    await T(sp, 'pwg-open-phonics').click()
    await T(sp, 'pph-book-b1').click()
    await T(sp, 'pph-unit-u2').click()
    await T(sp, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    const st2 = await T(sp, 'pph-step-2').getAttribute('data-state')
    r.check('학생 PAUL PHONICS Book 1 Unit 2: 2단계는 계속 잠김, 오디오 요소 0 (미리보기 누출 없음)', st2 === 'locked' && (await sp.locator('audio').count()) === 0, String(st2))
    await sp.close()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openPanel(page)
    r.check('새로고침 후 미리보기 전부 사라짐: 선택 0, 모든 행 파일 없음', (await txt(page, 'phr-rec-preview-summary')) === '선택 0 · 검증 통과 0 · 승인(미리보기) 0' && (await T(page, 'phr-rec-result-a').count()) === 0 && (await page.locator('[data-testid="phr-recording"][data-status="missing"]').count()) === 42)

    r.check('1280px 가로 넘침 없음', (await overflow(page)) <= 0, String(await overflow(page)))
    await page.setViewportSize({ width: 360, height: 640 })
    r.check('360px 페이지 가로 넘침 없음(표는 안쪽에서 스크롤)', (await overflow(page)) <= 0, String(await overflow(page)))
    for (const id of ['phr-words', 'phr-recordings']) {
      const o = await T(page, id).evaluate((t) => { let w = t.parentElement; return { ox: getComputedStyle(w).overflowX, scroll: w.scrollWidth, client: w.clientWidth } })
      r.check(`360px ${id} 표는 안쪽 스크롤(overflow auto, 내용 > 폭)`, /auto|scroll/.test(o.ox) && o.scroll > o.client, JSON.stringify(o))
    }
    const inner = await T(page, 'phr-book-b5').evaluate((t) => { const w = t.parentElement; return { scroll: w.scrollWidth, client: w.clientWidth, ox: getComputedStyle(w).overflowX } })
    r.check('360px 표 컨테이너는 안쪽 가로 스크롤(overflow-x:auto, 내용 > 폭)', inner.ox === 'auto' && inner.scroll > inner.client, JSON.stringify(inner))

    const writes = net.slice(netStart, netEnd).filter((q) => q.method !== 'GET' && q.method !== 'HEAD' && q.method !== 'OPTIONS')
    r.check('패널 사용 중 GET 아닌 요청 0건', writes.length === 0, JSON.stringify(writes.slice(0, 3)))
    r.check('패널 사용 중 저장소 키 변화 0건', JSON.stringify(keysEnd) === JSON.stringify(keysStart), JSON.stringify(keysEnd))
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
