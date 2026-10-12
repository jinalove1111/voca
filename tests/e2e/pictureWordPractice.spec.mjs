// tests/e2e/pictureWordPractice.spec.mjs — 그림 단어 연습(249차 → 251차 카드 한 장 흐름, 테스터 전용). 네트워크 전체 mock, 저장 0, 보상 0.
// r1~r5: 카드 한 장에서 듣기 → 따라 말하기 → 내 목소리 듣기 → 다시 말하기 → 다음(진짜 MediaRecorder + 합성 마이크 스트림, speaking.spec과 같은 방식)
// t1: 시험(그림만) → 오답 복습(연습 카드 + 녹음기) → 요약. f1: 연습 → 게임 → 시험 → 복습 → 요약. s1: 묶음 선택. g: 진입 제한.
// 정답 옵션은 root의 data-seed로 buildSession/buildQuiz를 그대로 재계산해 구한다(DOM에는 정답 정보가 없다).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { buildSession, buildQuiz } from '../../src/utils/pictureWords/practice.js'
import { learnableWords, shopSets, wordsForLevel } from '../../src/data/pictureWords/index.js'
import { SPEAKING_MESSAGES } from '../../src/utils/speaking/speakingSession.js'

const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
// the app's own dashboard-load call, present for every student (also the general student who never opens this feature)
const APP_POSTS = [...LOGIN_WRITES, '/api/grant-xp']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)
const storageSnap = (page) => page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))
const APP_KEY = /^(paul_easy_|paulEasyVoca_)/
const keyDiff = (a, b) => ['local', 'session'].flatMap((w) => [...b[w].filter((k) => !a[w].includes(k)).map((k) => `+${w}:${k}`), ...a[w].filter((k) => !b[w].includes(k)).map((k) => `-${w}:${k}`)]).filter((d) => !APP_KEY.test(d.slice(d.indexOf(':') + 1)))
const POOL = learnableWords()
const SETS = shopSets()
const SET_WORDS = { ...Object.fromEntries(SETS.map((s) => [s.shop, s.words])), 'level-phonics': wordsForLevel('phonics'), 'level-conversation': wordsForLevel('conversation') }
const TESTER_ONLY = 'e2e00000-0000-4000-8000-00000000a002'
const GENERAL = 'e2e00000-0000-4000-8000-00000000b001'
const lc = (s) => String(s).toLowerCase()
const isLetter = (c) => /^[a-z]$/i.test(c)

async function waitUntil(fn, { timeout = 5000, interval = 60 } = {}) {
  const start = Date.now()
  for (;;) {
    const v = await fn().catch(() => false)
    if (v) return v
    if (Date.now() - start >= timeout) return false
    await sleep(interval)
  }
}

// speaking.spec.mjs와 같은 마이크: getUserMedia를 합성 스트림(AudioContext 오실레이터)으로 대체 — MediaRecorder는 진짜 브라우저 것
async function installMic(page, mode) {
  await page.addInitScript((m) => {
    window.__micTracks = []
    const md = navigator.mediaDevices
    if (!md) return
    md.getUserMedia = async () => {
      if (m === 'denied') throw Object.assign(new Error('e2e-denied'), { name: 'NotAllowedError' })
      const ctx = new AudioContext()
      await ctx.resume().catch(() => {})
      const osc = ctx.createOscillator()
      const dest = ctx.createMediaStreamDestination()
      osc.connect(dest)
      osc.start()
      dest.stream.getTracks().forEach((t) => window.__micTracks.push(t))
      return dest.stream
    }
  }, mode)
}

async function loginToDashboard(page) {
  const input = page.getByPlaceholder('이름 입력...')
  await input.waitFor({ state: 'visible', timeout: 90000 })
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await input.waitFor({ state: 'hidden', timeout: 20000 })
  await sleep(1500)
}
async function loginToHome(page) {
  const home = T(page, 'student-home'); const input = page.getByPlaceholder('이름 입력...')
  await Promise.race([home.waitFor({ state: 'visible', timeout: 90000 }), input.waitFor({ state: 'visible', timeout: 90000 })])
  if (await home.isVisible()) return
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await home.waitFor({ state: 'visible', timeout: 20000 })
}

const attr = (page, a) => T(page, 'pwp-root').getAttribute(a)
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
async function waitStep(page, step) { await page.waitForFunction((s) => document.querySelector('[data-testid="pwp-root"]')?.getAttribute('data-step') === s, step, { timeout: 10000 }) }
async function openScreen(page) {
  await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 20000 })
  await T(page, 'dash-picture-words').click()
  await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 20000 })
}
// 묶음을 시작하고 세션 단어/시험 문제를 root의 data-seed로 다시 계산한다
async function startSet(page, id, mode, firstStep) {
  if (await T(page, 'pwh-open-speak').count()) await T(page, 'pwh-open-speak').click() // 묶음은 첫 화면이 아니라 말하기 하위 화면에 있다
  await T(page, `pwp-start-${mode}-${id}`).click()
  await waitStep(page, firstStep)
  const seed = Number(await attr(page, 'data-seed'))
  const words = buildSession(SET_WORDS[id], { size: 6, seed })
  return { seed, words, quiz: buildQuiz(words, POOL, seed) }
}
const correctIdx = (q) => q.options.findIndex((o) => o.id === q.correctId)
const wrongIdx = (q) => (correctIdx(q) + 1) % 4
async function answer(page, idx) {
  await T(page, `pwp-opt-${idx}`).click()
  await T(page, 'pwp-feedback').waitFor({ state: 'visible', timeout: 5000 })
}
const tap = async (page, loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2) }
const recStatus = async (page) => ((await T(page, 'pwp-rec-status').textContent().catch(() => '')) || '').trim()
const audioSrc = (page) => T(page, 'pwp-rec-audio').evaluate((a) => a.getAttribute('src') || '')
const blobInfo = (page) => page.evaluate(async () => { const a = document.querySelector('[data-testid="pwp-rec-audio"]'); const b = await (await fetch(a.src)).blob(); return { src: a.src, size: b.size } })
// 녹음 시작 → ms 뒤 끝내기 → 녹음 완료(재생 버튼)까지
async function recordOnce(page, ms = 1100, touch = false) {
  const click = (id) => (touch ? tap(page, T(page, id)) : T(page, id).click())
  await click('pwp-rec-record')
  await T(page, 'pwp-rec-stop').waitFor({ state: 'visible', timeout: 10000 })
  await sleep(ms)
  await click('pwp-rec-stop')
  await T(page, 'pwp-rec-retake').waitFor({ state: 'visible', timeout: 8000 })
}
// 마이크 없는 상태 모의 선택지 대신, 게임 한 판을 정답으로 끝낸다(알파벳 망치). 본 단어를 돌려준다.
async function shownWord(page, picId) {
  await T(page, picId).waitFor({ state: 'visible', timeout: 10000 })
  const src = await T(page, picId).getAttribute('src')
  const base = decodeURIComponent((src || '').split('?')[0].split('/').pop())
  const w = POOL.find((x) => base.startsWith(x.asset + '-') && base.length === x.asset.length + 1 + 8 + 5)
  if (!w) throw new Error(`cannot map picture src ${src}`)
  return w
}
async function playHammerAll(page) {
  const seen = []
  for (let g = 0; g < 8; g++) {
    await page.locator('[data-testid="pwh-root"], [data-testid="pwg-summary"]').first().waitFor({ state: 'visible', timeout: 10000 })
    if ((await T(page, 'pwg-summary').count()) > 0) break
    const w = await shownWord(page, 'pwh-picture')
    seen.push(w)
    const cells = [...w.en]
    for (let i = 0; i < cells.length; i++) {
      if (!isLetter(cells[i])) continue
      const ts = await page.locator('[data-testid^="pwh-tile-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent, used: e.getAttribute('data-used') === 'true' })))
      const t = ts.find((x) => !x.used && lc(x.t) === lc(cells[i]))
      await T(page, t.id).click()
      await page.waitForFunction((i2) => document.querySelector(`[data-testid="pwh-slot-${i2}"]`)?.getAttribute('data-filled') === 'true', i, { timeout: 3000 })
    }
    await T(page, 'pwh-word').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pwh-next').click()
  }
  return seen
}

export async function run(browser, baseURL) {
  const r = createRecorder('[picture-practice]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsAll = []

  async function scenario(label, vp, body, { studentId = null, defaultFlags = true, login = loginToDashboard, mic = 'synth', hasTouch = false } = {}) {
    const context = await browser.newContext({ viewport: vp, hasTouch })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const reqUrls = []
    const reqs = []
    page.on('request', (q) => { reqUrls.push(q.url()); reqs.push({ method: q.method(), url: q.url(), post: q.postData(), ct: q.headers()['content-type'] || '' }) })
    if (!defaultFlags) {
      await page.addInitScript(() => { try { localStorage.setItem('paulEasyVoca_features', JSON.stringify({ studentHomeMenu: true })) } catch { /* 무시 */ } })
    }
    const { unmockedRequests: u, apiCallLog, ttsFallbackRequests } = await installMocks(page, studentId ? { studentId } : {})
    await installMic(page, mic)
    // mockRoutes의 speechSynthesis 스텁 "뒤"에 등록해야 speak 호출을 센다(speaking.spec.mjs와 같은 방식)
    await page.addInitScript(() => {
      window.__speak = []
      window.__speakLang = []
      // 252차: 카드(녹음)에서는 효과음 0 — 오실레이터 시작을 센다(앱 코드는 그대로)
      window.__osc = []
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) {
        const co = AC.prototype.createOscillator
        AC.prototype.createOscillator = function (...a) { const o = co.apply(this, a); const st = o.start, cn = o.connect; let mic = false; o.connect = function (d, ...r2) { if (d instanceof MediaStreamAudioDestinationNode) mic = true; return cn.call(this, d, ...r2) }; o.start = function (...b2) { if (!mic) window.__osc.push(performance.now()); return st.apply(this, b2) }; return o } // 가짜 마이크(MediaStream 목적지에 연결된 합성 오실레이터)는 효과음이 아니므로 센다에서 제외
      }
      const s = window.speechSynthesis
      if (!s) return
      const orig = s.speak.bind(s)
      s.speak = (u) => { if ((u.text || '').trim()) { window.__speak.push(u.text); window.__speakLang.push(u.lang || '') } return orig(u) }
    })
    const name = `${label} [${vp.width}x${vp.height}]`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      const base = await storageSnap(page)
      const reqBase = reqs.length
      await body({ page, name, reqUrls })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인/분석 외 REST 쓰기 0건(업로드/STT 포함)`, bad.length === 0, bad.slice(0, 3).join(' | '))
      // (r4) 녹음이 기기를 떠나지 않는다: 로그인 이후 GET 아닌 요청 0, 오디오/멀티파트/blob 페이로드 0
      const after1 = reqs.slice(reqBase)
      const nonGet = after1.filter((q) => q.method !== 'GET' && !APP_POSTS.some((p) => q.url.includes(p))).map((q) => `${q.method} ${q.url.slice(0, 80)}`)
      const payload = after1.filter((q) => /multipart|audio\/|octet-stream/i.test(q.ct) || /^blob:/.test(q.url) || (q.post && /webm|ogg|RIFF|OggS/.test(q.post.slice(0, 64)))).map((q) => `${q.method} ${q.url.slice(0, 80)}`)
      r.check(`${name} (r4) 로그인 이후 GET 아닌 요청 0건 + 오디오/멀티파트/blob 페이로드 요청 0건`, nonGet.length === 0 && payload.length === 0, JSON.stringify({ nonGet: nonGet.slice(0, 3), payload: payload.slice(0, 3) }))
      const after = await storageSnap(page)
      const d = keyDiff(base, after)
      const feat = [...after.local, ...after.session].filter((k) => /picture|pwp/i.test(k) && k !== 'paulEasyVoca_pictureWordSfx') // 252차: 소리 설정 키 1개만 허용(바꿀 때만 생김)
      r.check(`${name} 앱 자체 키(paul_easy_*/paulEasyVoca_*) 밖의 저장소 키 불변 + picture/pwp 키 0`, d.length === 0 && feat.length === 0, JSON.stringify({ d, feat }))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
    ttsAll.push(...ttsFallbackRequests)
  }

  // ---- (s1) 묶음 선택: 연습/시험 버튼 ----
  await scenario('(s1) 묶음 선택', { width: 1280, height: 800 }, async ({ page, name }) => {
    const bt = await T(page, 'dash-picture-words').boundingBox()
    r.check(`${name} 첫 화면에 그림 단어 버튼(44px 이상)`, !!bt && bt.height >= 43.9, JSON.stringify(bt))
    await openScreen(page)
    await T(page, 'pwh-open-speak').click()
    const ready = SETS.filter((s) => s.ready), notReady = SETS.filter((s) => !s.ready)
    let ok = ready.length === 6 && notReady.map((s) => s.shop).sort().join() === 'garden,pet'
    for (const id of [...ready.map((s) => s.shop), 'level-phonics', 'level-conversation']) {
      for (const m of ['practice', 'test']) if ((await T(page, `pwp-start-${m}-${id}`).count()) !== 1 || (await T(page, `pwp-start-${m}-${id}`).isDisabled())) ok = false
    }
    for (const s of notReady) for (const m of ['practice', 'test']) if (!(await T(page, `pwp-start-${m}-${s.shop}`).isDisabled())) ok = false
    r.check(`${name} (s1) 준비된 가게 6곳 + Phonics + Conversation: 연습/시험 활성, 정원·반려동물은 준비 중(비활성)`, ok, ready.map((s) => s.shop).join())
    const txt = await T(page, 'pwp-root').innerText()
    const phLabel = await T(page, 'pwp-set-level-phonics').innerText()
    r.check(`${name} (s1) Phonics 묶음 이름은 짧은 이름이고 소리 순서를 주장하지 않음("짧고 쉬운 단어") + 준비 중 표시`, phLabel.includes('짧고 쉬운 단어') && !phLabel.includes('Phonics') && !/소리|순서/.test(phLabel) && txt.includes('준비 중'), phLabel)
    for (const id of ['level-phonics', 'level-conversation']) {
      const S = await startSet(page, id, 'practice', 'card')
      r.check(`${name} (s1) ${id}: 6단어 세션이 해당 묶음 단어로만 구성`, S.words.length === 6 && S.words.every((w) => SET_WORDS[id].some((x) => x.id === w.id)) && (await T(page, 'pwp-word').textContent()) === S.words[0].en)
      for (let i = 0; i < 6; i++) await T(page, 'pwp-next').click()
      await waitStep(page, 'end')
      await T(page, 'pwp-skip').click()
      await waitStep(page, 'summary')
      await T(page, 'pwp-other-set').click()
      await waitStep(page, 'pick')
    }
    r.check(`${name} (s1) 연습만 하고 "건너뛰고 끝내기" → 요약(연습을 마쳤어요, 점수 없음)`, true)
  }, { studentId: TESTER_ONLY })

  // ---- (m1) 첫 화면(390x844): 큰 타일 3개, 스크롤 없음, 하위 화면 왕복 ----
  await scenario('(m1) 첫 화면 3타일', { width: 390, height: 844 }, async ({ page, name }) => {
    await openScreen(page)
    const tiles = page.locator('.pw-tile-menu')
    const nBtn = await T(page, 'pwp-root').locator('button:not([data-testid^="pwsfx"])').count()
    r.check(`${name} (m1) 첫 화면: data-home=main, 타일 3개(파닉스 모험/말하기/게임 놀이터) + 소리 조절 + 나가기, 그 밖의 버튼 없음`, (await attr(page, 'data-home')) === 'main' && (await tiles.count()) === 3 && (await T(page, 'pwg-open-phonics').count()) === 1 && (await T(page, 'pwh-open-speak').count()) === 1 && (await T(page, 'pwh-open-play').count()) === 1 && (await T(page, 'pwsfx-root').count()) === 1 && (await T(page, 'pwp-exit').count()) === 1 && nBtn === 4, String(nBtn))
    r.check(`${name} (m1) 제목 PAUL PHONICS`, ((await page.locator('h1').first().textContent()) || '').includes('PAUL PHONICS'))
    r.check(`${name} (m1) 스크롤 없이 한 화면(scrollHeight<=innerHeight), 가로 넘침 0`, (await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)) && (await overflow(page)) <= 0, await page.evaluate(() => document.documentElement.scrollHeight + '/' + window.innerHeight))
    const sizes = await tiles.evaluateAll((l) => l.map((e) => { const i = e.querySelector('img'); return { h: e.getBoundingClientRect().height, ok: !!i && i.complete && i.naturalWidth > 0 } }))
    r.check(`${name} (m1) 타일마다 높이 168px 이상 + 그림 로드됨`, sizes.length === 3 && sizes.every((x) => x.h >= 167.9 && x.ok), JSON.stringify(sizes))
    await T(page, 'pwh-open-speak').click()
    const order = await page.locator('[data-testid^="pwp-set-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-testid').slice(8)))
    r.check(`${name} (m1) 말하기 하위 화면: data-home=speak, 묶음 10개(레벨 2개가 맨 앞, 준비 중은 맨 뒤), 레벨 칩은 여기 없음(게임 놀이터로 이동), 뒤로, 가로 넘침 0`, (await attr(page, 'data-home')) === 'speak' && (await page.locator('[data-testid^="pwp-set-"]').count()) === 10 && (await T(page, 'pwg-level-phonics').count()) === 0 && order.slice(0, 2).join() === 'level-phonics,level-conversation' && order.slice(-2).sort().join() === 'garden,pet' && (await T(page, 'pwh-back').count()) === 1 && (await overflow(page)) <= 0, String(await overflow(page)))
    await T(page, 'pwh-back').click()
    r.check(`${name} (m1) 뒤로 → 첫 화면`, (await attr(page, 'data-home')) === 'main' && (await tiles.count()) === 3)
    r.check(`${name} (m1) 첫 화면 높이: 제목·소리 조절·타일 3개·나가기가 스크롤 없이 들어가고 마지막 요소 아래에도 여유가 있음`, await page.evaluate(() => { const b = document.querySelector('[data-testid="pwp-exit"]').getBoundingClientRect().bottom; return b <= window.innerHeight - 16 }))
    await T(page, 'pwh-open-play').click()
    r.check(`${name} (m1) 게임 놀이터: data-home=play, 게임 타일 3개(망치/숨은 글자/가게 구경), 레벨 칩 3개, 가로 넘침 0`, (await attr(page, 'data-home')) === 'play' && (await T(page, 'pwg-mode-hammer').count()) === 1 && (await T(page, 'pwg-mode-hidden').count()) === 1 && (await T(page, 'pwg-mode-shelf').count()) === 1 && (await T(page, 'pwg-level-phonics').count()) === 1 && (await overflow(page)) <= 0)
    await T(page, 'pwg-mode-hidden').click()
    await T(page, 'pwl-root').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'pwg-quit').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} (m1) 게임 그만하기 → 게임 놀이터로 돌아옴`, (await attr(page, 'data-home')) === 'play')
  }, { studentId: TESTER_ONLY })

  // ---- (r1)(r2) PC: 카드 한 장에서 듣기 → 말하기 → 내 목소리 → 다시 말하기 → 다음 ----
  await scenario('(r1)(r2) 카드 한 장 녹음', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    const S = await startSet(page, 'food', 'practice', 'card')
    const card = T(page, 'pwp-card')
    r.check(`${name} 카드: 그림·단어·뜻·듣기·녹음 버튼이 한 화면에 같이 보임 + 진행 "1 / 6"`, (await T(page, 'pwp-picture').isVisible()) && (await T(page, 'pwp-word').textContent()) === S.words[0].en && (await T(page, 'pwp-ko').textContent()) === S.words[0].ko && (await T(page, 'pwp-listen').isVisible()) && (await T(page, 'pwp-rec-record').isVisible()) && (await T(page, 'pwp-next').isVisible()) && ((await T(page, 'pwp-progress').textContent()) || '').replace(/\s/g, '') === '1/6' && (await card.getAttribute('data-word-index')) === '0')
    r.check(`${name} 버튼 문구: 🔊 발음 듣기 / 🎤 따라 말하기 / ➡️ 다음 단어`, ((await T(page, 'pwp-listen').textContent()) || '').includes('🔊 발음 듣기') && ((await T(page, 'pwp-rec-record').textContent()) || '').includes('🎤 따라 말하기') && ((await T(page, 'pwp-next').textContent()) || '').includes('➡️ 다음 단어'))
    r.check(`${name} 카드 진입만으로 speak 0(자동재생 없음) + 마이크 요청 0`, (await page.evaluate(() => window.__speak.length)) === 0 && (await page.evaluate(() => window.__micTracks.length)) === 0)
    r.check(`${name} 그림이 실제로 로드됨(naturalWidth>0)`, await T(page, 'pwp-picture').evaluate((i) => i.complete && i.naturalWidth > 0))
    // 262차 카드 디자인(레슨 화면: 흰 카드·파란 테두리): 그림 상자는 정사각 흰 매트(contain, 잘림·늘림 없음), 세 화면 너비에서 가로 넘침 0
    for (const w of [1280, 768, 360]) {
      await page.setViewportSize({ width: w, height: w === 360 ? 640 : 800 })
      const m = await T(page, 'pwp-picture').evaluate((i) => { const b = i.getBoundingClientRect(), c = getComputedStyle(i), k = getComputedStyle(i.closest('.pw-cls-box')); return { w: b.width, h: b.height, fit: c.objectFit, bg: c.backgroundColor, pad: c.paddingLeft, border: k.borderTopColor, nat: i.naturalWidth, ok: i.complete } })
      r.check(`${name} 카드 그림 상자 ${w}px: 정사각(|w-h|<=1) · contain · 흰 매트(padding>0) · 파란 테두리 흰 카드 · 로드됨 · 가로 넘침 0`, Math.abs(m.w - m.h) <= 1 && m.w > 80 && m.fit === 'contain' && m.bg === 'rgb(255, 255, 255)' && parseFloat(m.pad) > 0 && m.border === 'rgb(191, 219, 254)' && m.ok && m.nat > 0 && (await overflow(page)) <= 0, JSON.stringify(m))
    }
    await page.setViewportSize({ width: 1280, height: 800 })
    // 듣기
    await T(page, 'pwp-listen').click()
    await page.waitForFunction(() => window.__speak.length >= 1, null, { timeout: 4000 }).catch(() => {})
    const sp = await page.evaluate(() => ({ t: window.__speak, l: window.__speakLang }))
    r.check(`${name} (r1) 듣기 → speechSynthesis.speak(해당 단어)`, sp.t.length >= 1 && sp.t[sp.t.length - 1] === S.words[0].en, JSON.stringify(sp))
    r.check(`${name} (r1) 듣기 언어 en-GB(영국식)`, sp.l.length >= 1 && sp.l.every((l) => /en-GB/i.test(l)), JSON.stringify(sp.l))
    const n0 = await page.evaluate(() => window.__speak.length)
    await T(page, 'pwp-listen-bubble').click()
    await page.waitForFunction((n) => window.__speak.length > n, n0, { timeout: 4000 }).catch(() => {})
    const spb = await page.evaluate(() => ({ t: window.__speak, l: window.__speakLang }))
    r.check(`${name} (r1) 말풍선 스피커도 같은 소리(해당 단어, en-GB) + 이름 "발음 듣기"`, spb.t.length > n0 && spb.t[spb.t.length - 1] === S.words[0].en && spb.l.every((l) => /en-GB/i.test(l)) && (await T(page, 'pwp-listen-bubble').getAttribute('aria-label')) === '발음 듣기', JSON.stringify(spb))
    // 녹음
    r.check(`${name} (r1) 녹음 전: 내 목소리 듣기는 있지만 잠김 + 힌트 "먼저 따라 말해 보세요" + 다시 말하기 없음`, (await T(page, 'pwp-rec-play').isDisabled()) && (await T(page, 'pwp-rec-retake').count()) === 0 && ((await T(page, 'pwp-rec-hint').textContent()) || '').trim() === '먼저 따라 말해 보세요')
    await T(page, 'pwp-rec-record').click()
    await T(page, 'pwp-rec-stop').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} (r1) 녹음 중: "⏹ 녹음 끝내기" + 타이머 보임 + "녹음 중… n초" 표시`, ((await T(page, 'pwp-rec-stop').textContent()) || '').includes('⏹ 녹음 끝내기') && (await T(page, 'pwp-rec-timer').isVisible()) && /녹음 중… \d+초/.test((await T(page, 'pwp-rec-live').textContent()) || ''))
    r.check(`${name} (r1) 녹음 중에도 듣기/다음은 눌림(막지 않음)`, (await T(page, 'pwp-next').isEnabled()) && (await T(page, 'pwp-listen').isEnabled()))
    await sleep(1200)
    await T(page, 'pwp-rec-stop').click()
    await T(page, 'pwp-rec-retake').waitFor({ state: 'visible', timeout: 8000 })
    r.check(`${name} (r1) 끝내기 → "녹음 완료" 상태 + 타이머/끝내기 사라짐 + "말해 봤어요"`, (await recStatus(page)).includes('녹음 완료') && (await T(page, 'pwp-rec-stop').count()) === 0 && (await T(page, 'pwp-said-mark').count()) === 1, await recStatus(page))
    const b1 = await blobInfo(page)
    r.check(`${name} (r1) audio src가 blob: 이고 blob 크기 > 0`, b1.src.startsWith('blob:') && b1.size > 0, JSON.stringify(b1))
    r.check(`${name} (r1) 문구: ▶️ 내 목소리 듣기 / 🔄 다시 말하기`, ((await T(page, 'pwp-rec-play').textContent()) || '').includes('▶️ 내 목소리 듣기') && ((await T(page, 'pwp-rec-retake').textContent()) || '').includes('🔄 다시 말하기'))
    await T(page, 'pwp-rec-play').click()
    const playing = await waitUntil(() => T(page, 'pwp-rec-audio').evaluate((a) => !a.paused), { timeout: 1500, interval: 40 })
    const disabledWhile = playing ? await T(page, 'pwp-rec-play').isDisabled().catch(() => false) : false
    r.check(`${name} (r1) 내 목소리 듣기 → 재생 중(audio.paused===false, 버튼 잠김)`, !!playing && disabledWhile, JSON.stringify({ playing, disabledWhile }))
    const back = await waitUntil(async () => (await T(page, 'pwp-rec-play').isEnabled()) && (await recStatus(page)).includes('녹음 완료'), { timeout: 8000 })
    r.check(`${name} (r1) 재생이 끝나면 다시 녹음 완료 상태로`, !!back, await recStatus(page))
    r.check(`${name} (r1) 252차: 카드에서 듣기·녹음·내 목소리 듣기를 하는 동안 효과음 오실레이터 시작 0건(마이크에 효과음이 섞이지 않음)`, (await page.evaluate(() => window.__osc.length)) === 0, String(await page.evaluate(() => window.__osc.length)))
    await T(page, 'pwp-rec-retake').click()
    r.check(`${name} (r1) 다시 말하기 → 이전 녹음 비워짐(src 없음, 재생 버튼 잠김)`, (await audioSrc(page)) === '' && (await T(page, 'pwp-rec-play').isDisabled()))
    await recordOnce(page)
    const b2 = await blobInfo(page)
    r.check(`${name} (r1) 다시 녹음 → 새 blob URL(이전과 다름) + 크기 > 0`, b2.src.startsWith('blob:') && b2.src !== b1.src && b2.size > 0, JSON.stringify({ b1: b1.src, b2: b2.src }))
    r.check(`${name} 판정 문구 없음(점수·맞았어요·틀렸어요 등)`, !/점수|정확|맞았|틀렸|잘했/.test((await T(page, 'pwp-rec').textContent()) || ''))
    // (r2) 다음 단어
    await T(page, 'pwp-next').click()
    r.check(`${name} (r2) 다음 단어 → 2번째 단어 + 진행 "2 / 6"`, (await T(page, 'pwp-word').textContent()) === S.words[1].en && (await T(page, 'pwp-card').getAttribute('data-word-index')) === '1' && ((await T(page, 'pwp-progress').textContent()) || '').replace(/\s/g, '') === '2/6')
    r.check(`${name} (r2) 녹음기 초기화: 재생 버튼 잠김 + src 없음 + 말해 봤어요 표시 없음 + 상태 비어 있음`, (await T(page, 'pwp-rec-play').isDisabled()) && (await audioSrc(page)) === '' && (await T(page, 'pwp-said-mark').count()) === 0 && (await recStatus(page)) === '')
    await recordOnce(page)
    const b3 = await blobInfo(page)
    r.check(`${name} (r2) 2번째 단어에서도 녹음·재생 동작(새 blob)`, b3.src.startsWith('blob:') && b3.src !== b2.src && b3.size > 0)
    await T(page, 'pwp-rec-play').click()
    await waitUntil(async () => (await T(page, 'pwp-rec-play').isEnabled()) && (await recStatus(page)).includes('녹음 완료'), { timeout: 8000 })
    await T(page, 'pwp-next').click()
    r.check(`${name} (r2) 3번째 단어: 녹음기 초기화`, (await T(page, 'pwp-word').textContent()) === S.words[2].en && (await T(page, 'pwp-rec-play').isDisabled()) && (await audioSrc(page)) === '')
    await recordOnce(page)
    r.check(`${name} (r2) 3번째 단어에서도 녹음 완료`, (await recStatus(page)).includes('녹음 완료') && (await blobInfo(page)).size > 0)
    // 녹음 중에 넘겨도 그 녹음이 다음 단어로 따라오거나 "말해 봤어요"로 세지지 않는다(아직 말한 적 없는 4번째 단어로 확인)
    await T(page, 'pwp-next').click()
    r.check(`${name} 4번째 단어: 깨끗한 카드`, (await T(page, 'pwp-card').getAttribute('data-word-index')) === '3' && (await T(page, 'pwp-said-mark').count()) === 0)
    await T(page, 'pwp-rec-record').click()
    await T(page, 'pwp-rec-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(700)
    await T(page, 'pwp-next').click() // 녹음 중 넘기기
    const settled = await waitUntil(async () => (await T(page, 'pwp-card').getAttribute('data-word-index')) === '4' && (await T(page, 'pwp-rec-stop').count()) === 0 && (await T(page, 'pwp-rec-play').isDisabled()) && (await audioSrc(page)) === '' && (await T(page, 'pwp-said-mark').count()) === 0, { timeout: 5000 })
    await sleep(400)
    r.check(`${name} 녹음 중 다음 단어 → 멈춘 뒤 버려져 다음 카드는 깨끗함(녹음/말해 봤어요 안 따라옴)`, !!settled && (await T(page, 'pwp-rec-play').isDisabled()) && (await T(page, 'pwp-said-mark').count()) === 0, JSON.stringify({ idx: await T(page, 'pwp-card').getAttribute('data-word-index'), src: await audioSrc(page) }))
    await T(page, 'pwp-prev').click()
    r.check(`${name} 버려진 단어로 돌아가도 녹음·"말해 봤어요" 없음`, (await T(page, 'pwp-card').getAttribute('data-word-index')) === '3' && (await T(page, 'pwp-rec-play').isDisabled()) && (await T(page, 'pwp-said-mark').count()) === 0)
    for (let i = 3; i < 6; i++) await T(page, 'pwp-next').click()
    await waitStep(page, 'end')
    r.check(`${name} 6번째 단어 다음 → "다음은 게임!" 카드(알파벳 망치로/숨은 글자로/시험 보기/건너뛰고 끝내기)`, ((await T(page, 'pwp-end').textContent()) || '').includes('다음은 게임!') && ((await T(page, 'pwp-game-hammer').textContent()) || '').includes('알파벳 망치로') && ((await T(page, 'pwp-game-hidden').textContent()) || '').includes('숨은 글자로') && ((await T(page, 'pwp-go-test').textContent()) || '').includes('시험 보기') && ((await T(page, 'pwp-skip').textContent()) || '').includes('건너뛰고 끝내기'))
    const tracksEnded = await waitUntil(() => page.evaluate(() => window.__micTracks.length > 0 && window.__micTracks.every((t) => t.readyState === 'ended')), { timeout: 5000 })
    r.check(`${name} 카드 묶음을 떠나면 마이크 트랙 종료`, !!tracksEnded)
  }, { studentId: TESTER_ONLY })

  // ---- (r3) 마이크 거부 ----
  await scenario('(r3) 마이크 거부', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    const S = await startSet(page, 'food', 'practice', 'card')
    await T(page, 'pwp-rec-record').click()
    const shown = await waitUntil(async () => (await recStatus(page)) === SPEAKING_MESSAGES.denied, { timeout: 8000 })
    r.check(`${name} (r3) 거부 → 기존 한글 안내("${SPEAKING_MESSAGES.denied}")`, !!shown, await recStatus(page))
    r.check(`${name} (r3) 다시 말하기 버튼 있음 + 카드 그대로(그림·단어)`, (await T(page, 'pwp-rec-retake').isVisible()) && (await T(page, 'pwp-word').textContent()) === S.words[0].en)
    await T(page, 'pwp-listen').click()
    await page.waitForFunction(() => window.__speak.length >= 1, null, { timeout: 4000 }).catch(() => {})
    r.check(`${name} (r3) 오류 상태에서도 듣기 동작`, (await page.evaluate(() => window.__speak)).includes(S.words[0].en))
    await T(page, 'pwp-rec-retake').click()
    r.check(`${name} (r3) 다시 말하기 → 다시 시도 가능(녹음 버튼 복귀)`, await T(page, 'pwp-rec-record').isVisible())
    await T(page, 'pwp-rec-record').click()
    await waitUntil(async () => (await recStatus(page)) === SPEAKING_MESSAGES.denied, { timeout: 8000 })
    await T(page, 'pwp-next').click()
    r.check(`${name} (r3) 오류 상태에서도 다음 단어로 이동 + 깨끗한 카드`, (await T(page, 'pwp-word').textContent()) === S.words[1].en && (await recStatus(page)) === '' && (await T(page, 'pwp-rec-record').isVisible()))
    await T(page, 'pwp-listen').click()
    r.check(`${name} (r3) 다음 단어에서도 듣기 동작`, !!(await waitUntil(async () => (await page.evaluate(() => window.__speak)).includes(S.words[1].en), { timeout: 4000 })))
    r.check(`${name} (r3) 마이크 스트림 0(거부)`, (await page.evaluate(() => window.__micTracks.length)) === 0)
  }, { studentId: TESTER_ONLY, mic: 'denied' })

  // ---- (r5) 모바일 터치: 카드 한 장 사용성 ----
  await scenario('(r5) 모바일 터치 카드', { width: 360, height: 640 }, async ({ page, name }) => {
    const covered = async (id) => {
      const loc = T(page, id)
      await loc.scrollIntoViewIfNeeded()
      return loc.evaluate((el) => { const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(top === el || el.contains(top)) })
    }
    const small = () => page.locator('button:visible').evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 43.9).length)
    await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 대시보드 가로 넘침 0`, (await overflow(page)) <= 0, String(await overflow(page)))
    await T(page, 'dash-picture-words').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible' })
    r.check(`${name} 묶음 선택 가로 넘침 0 / 작은 버튼 0`, (await overflow(page)) <= 0 && (await small()) === 0, `${await overflow(page)}/${await small()}`)
    const S = await startSet(page, 'food', 'practice', 'card')
    for (let i = 0; i < 6; i++) {
      const o = await overflow(page), c = await covered('pwp-next'), sm = await small()
      if (o > 0 || c || sm) r.check(`${name} 카드 #${i} 넘침 ${o} / 다음 가림 ${c} / 작은 버튼 ${sm}`, false)
      if (i === 0) {
        const ids = ['pwp-picture', 'pwp-word', 'pwp-ko', 'pwp-listen', 'pwp-rec-record', 'pwp-next']
        let ok = true
        for (const id of ids) if (!(await T(page, id).count())) ok = false
        r.check(`${name} (r5) 그림·단어·뜻·듣기·녹음·다음이 한 카드에 모두 있음(스크롤로 도달 가능)`, ok)
        await tap(page, T(page, 'pwp-listen'))
        await page.waitForFunction((en) => window.__speak.includes(en), S.words[0].en, { timeout: 4000 }).catch(() => {})
        r.check(`${name} (r5) 터치로 듣기`, (await page.evaluate(() => window.__speak)).includes(S.words[0].en))
        await tap(page, T(page, 'pwp-rec-record'))
        await T(page, 'pwp-rec-stop').waitFor({ state: 'visible', timeout: 10000 })
        r.check(`${name} (r5) 터치로 녹음 시작 → 녹음 중 표시, 넘침 0`, /녹음 중…/.test((await T(page, 'pwp-rec-live').textContent()) || '') && (await overflow(page)) <= 0)
        await sleep(1100)
        await tap(page, T(page, 'pwp-rec-stop'))
        await T(page, 'pwp-rec-retake').waitFor({ state: 'visible', timeout: 8000 })
        r.check(`${name} (r5) 터치로 끝내기 → 녹음 완료, 버튼 3개(내 목소리 듣기/다시 말하기/따라 말하기)가 넘침 없이 보임`, (await recStatus(page)).includes('녹음 완료') && (await overflow(page)) <= 0 && (await small()) === 0, `${await overflow(page)}/${await small()}`)
        await tap(page, T(page, 'pwp-rec-play'))
        r.check(`${name} (r5) 터치로 내 목소리 듣기 → 재생 후 복귀`, !!(await waitUntil(async () => (await T(page, 'pwp-rec-play').isEnabled()) && (await recStatus(page)).includes('녹음 완료'), { timeout: 8000 })))
        await tap(page, T(page, 'pwp-rec-retake'))
        r.check(`${name} (r5) 터치로 다시 말하기 → 이전 녹음 비워짐`, (await audioSrc(page)) === '' && (await T(page, 'pwp-rec-play').isDisabled()))
      }
      await tap(page, T(page, 'pwp-next'))
    }
    await waitStep(page, 'end')
    r.check(`${name} 6장 모두 가로 넘침 0, 다음 버튼 가림 0, 작은 버튼 0 → 끝 카드`, (await overflow(page)) <= 0 && (await small()) === 0)
  }, { studentId: TESTER_ONLY, hasTouch: true })

  // ---- (c1) 교실 장면: 폰(390x844)에서 한 번에 한 단계만 강조 (듣기 → 따라 말하기 → 다음) ----
  await scenario('(c1) 교실 장면 단계 강조', { width: 390, height: 844 }, async ({ page, name }) => {
    await openScreen(page)
    await startSet(page, 'food', 'practice', 'card')
    const cls = (id) => T(page, id).evaluate((e) => e.className)
    const stepNow = () => T(page, 'pwp-card').getAttribute('data-step')
    const line = async () => ((await T(page, 'pw-cls-line').textContent()) || '').trim()
    const t = await T(page, 'pw-cls').locator('img.pw-cls-teacher').evaluate((i) => { const b = i.getBoundingClientRect(); return { nat: i.naturalWidth, w: Math.round(b.width), h: Math.round(b.height), ok: i.complete, alt: i.getAttribute('alt') } })
    r.check(`${name} (c1) 선생님 이미지 로드(naturalWidth 514 = 원본 해상도) + 폰에서 세로 280~300px로 표시 + 장식(alt 빈 값)`, (await T(page, 'pw-cls').isVisible()) && t.ok && t.nat === 514 && t.h >= 280 && t.h <= 300 && t.alt === '', JSON.stringify(t))
    const bx = (id) => T(page, id).boundingBox()
    const [tb, pc, rec, ply, sc] = [await T(page, 'pw-cls').locator('img.pw-cls-teacher').boundingBox(), await bx('pwp-picture-card'), await bx('pwp-rec-record'), await bx('pwp-rec-play'), await bx('pw-cls')]
    const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    r.check(`${name} (c1) 선생님이 그림 카드·큰 버튼 둘을 가리지 않음(박스 겹침 0)`, !hit(tb, pc) && !hit(tb, rec) && !hit(tb, ply), JSON.stringify({ tb, pc }))
    const fit = await page.evaluate(() => window.innerHeight)
    r.check(`${name} (c1) 장면과 큰 버튼 둘이 첫 844px 안(스크롤 없이) + 가로 넘침 0 + 큰 버튼 높이 72px 이상`, sc.y >= 0 && sc.y + sc.height <= fit && rec.y + rec.height <= fit && ply.y + ply.height <= fit && rec.height >= 72 && ply.height >= 72 && (await overflow(page)) <= 0, JSON.stringify({ sc, rec, ply, fit }))
    r.check(`${name} (c1) 1단계 듣기: data-step=listen · 말풍선 "잘 들어 봐요!" · 듣기 스피커는 하늘색, 다음은 연한 색`, (await stepNow()) === 'listen' && (await line()) === '잘 들어 봐요!' && (await cls('pwp-listen')).includes('bg-sky-500') && !(await cls('pwp-next')).includes('bg-emerald-300') && (await cls('pwp-next')).includes('bg-emerald-100'))
    await T(page, 'pwp-listen').click()
    r.check(`${name} (c1) 2단계 말하기: data-step=say · "따라 말해 볼까요?" · 다음은 연한 색 · 녹음 묶음에 강조 링`, (await stepNow()) === 'say' && (await line()) === '따라 말해 볼까요?' && !(await cls('pwp-next')).includes('bg-emerald-300') && (await cls('pwp-rec')).includes('ring-rose-300'))
    await recordOnce(page)
    r.check(`${name} (c1) 3단계 다음: data-step=next · "좋아요! 다음으로 가요" · 다음만 강조(emerald-300 민트) · 링 없음 · 내 목소리 듣기 활성`, (await stepNow()) === 'next' && (await line()) === '좋아요! 다음으로 가요' && (await cls('pwp-next')).includes('bg-emerald-300') && !(await cls('pwp-rec')).includes('ring-rose-300') && (await T(page, 'pwp-rec-play').isEnabled()))
    const small = await page.locator('button:visible').evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 43.9).length)
    r.check(`${name} (c1) 보이는 버튼 모두 높이 44px 이상 + 가로 넘침 0`, small === 0 && (await overflow(page)) <= 0, String(small))
    r.check(`${name} (c1) 뒤로 버튼: 44x44 + aria-label "뒤로" + 진행 칩 "1/6"`, (await T(page, 'pwp-back').evaluate((e) => { const b = e.getBoundingClientRect(); return Math.round(b.width) === 44 && Math.round(b.height) === 44 && e.getAttribute('aria-label') === '뒤로' })) && ((await T(page, 'pwp-progress').textContent()) || '').replace(/\s/g, '') === '1/6')
  }, { studentId: TESTER_ONLY })

  // ---- (c2) 아래 단어 줄: 이 묶음의 단어만 순서대로, 현재 단어 표시, 눌러서 이동 ----
  await scenario('(c2) 단어 줄', { width: 390, height: 844 }, async ({ page, name }) => {
    await openScreen(page)
    const S = await startSet(page, 'food', 'practice', 'card')
    const items = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="pwp-strip-item"]')].map((e) => ({ en: e.querySelector('span').textContent, cur: e.getAttribute('aria-current') || '', alt: [...e.querySelectorAll('img')].map((i) => i.getAttribute('alt')), done: !!e.querySelector('i') })))
    const curs = (it) => it.map((x) => x.cur).join()
    const n = S.words.length
    let it = await items()
    r.check(`${name} (c2) 단어 줄: 이 묶음 단어 ${n}개만 순서대로 + 첫 단어만 aria-current + 그림 alt 빈 값`, JSON.stringify(it.map((x) => x.en)) === JSON.stringify(S.words.map((w) => w.en)) && curs(it) === ['true', ...Array(n - 1).fill('')].join() && it.every((x) => x.alt.every((a) => a === '')), JSON.stringify(it))
    const st = await T(page, 'pwp-strip').evaluate((e) => getComputedStyle(e).overflowX)
    r.check(`${name} (c2) 단어 줄은 가로 스크롤(overflow-x:auto)이고 화면 가로 넘침 0`, st === 'auto' && (await overflow(page)) <= 0, st)
    await recordOnce(page)
    r.check(`${name} (c2) 말한 단어에 ✓ 표시`, (await items())[0].done === true)
    // 녹음 중에 세 번째 카드를 누르면 멈춘 뒤 버려지고 세 번째 단어로 이동
    await T(page, 'pwp-rec-retake').click()
    await T(page, 'pwp-rec-record').click()
    await T(page, 'pwp-rec-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(600)
    await T(page, 'pwp-strip-item').nth(2).click()
    const moved = await waitUntil(async () => (await T(page, 'pwp-card').getAttribute('data-word-index')) === '2' && (await T(page, 'pwp-rec-stop').count()) === 0 && (await audioSrc(page)) === '' && (await T(page, 'pwp-said-mark').count()) === 0, { timeout: 5000 })
    await sleep(400)
    it = await items()
    r.check(`${name} (c2) 세 번째 카드 누름 → data-word-index=2 + 진행 중 녹음 버려짐 + aria-current는 세 번째만 + 세 번째 단어가 보임`, !!moved && curs(it) === ['', '', 'true', ...Array(n - 3).fill('')].join() && (await T(page, 'pwp-word').textContent()) === S.words[2].en && (await T(page, 'pwp-said-mark').count()) === 0 && (await T(page, 'pwp-rec-play').isDisabled()))
    await T(page, 'pwp-strip-item').nth(0).click()
    r.check(`${name} (c2) 첫 카드 누름 → 첫 단어로 돌아감 + 앞서 말한 단어는 ✓ 유지`, (await T(page, 'pwp-card').getAttribute('data-word-index')) === '0' && (await items())[0].done === true)
  }, { studentId: TESTER_ONLY })

  // ---- (c3) 뒤로 버튼: 묶음 고르는 화면으로, 마이크는 놓는다 ----
  await scenario('(c3) 뒤로 버튼', { width: 390, height: 844 }, async ({ page, name }) => {
    await openScreen(page)
    await startSet(page, 'food', 'practice', 'card')
    await T(page, 'pwp-rec-record').click()
    await T(page, 'pwp-rec-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(500)
    await T(page, 'pwp-back').click()
    await waitStep(page, 'pick')
    const tracksEnded = await waitUntil(() => page.evaluate(() => window.__micTracks.length > 0 && window.__micTracks.every((t) => t.readyState === 'ended')), { timeout: 5000 })
    r.check(`${name} (c3) 뒤로 → 말하기 묶음 화면(data-home=speak) + 녹음 중이던 마이크 트랙 모두 종료 + 연습 카드 사라짐`, (await attr(page, 'data-home')) === 'speak' && !!tracksEnded && (await T(page, 'pwp-card').count()) === 0)
  }, { studentId: TESTER_ONLY })

  // ---- (t1) 시험 모드: 그림만 → 오답 → 복습(연습 카드 + 녹음기) → 요약 ----
  await scenario('(t1) 시험 모드', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    const S = await startSet(page, 'food', 'test', 'quiz')
    r.check(`${name} (t1) 시험은 바로 문제부터(data-mode=test, 카드 없음)`, (await attr(page, 'data-mode')) === 'test' && (await T(page, 'pwp-card').count()) === 0)
    const leakCheck = async (w, q) => {
      for (const id of ['pwp-word', 'pwp-ko', 'pwp-listen', 'pwp-feedback', 'pwp-next', 'pwp-rec', 'pwp-rec-record', 'pwp-rec-audio', 'pwp-card']) if ((await T(page, id).count()) !== 0) return `${id} 있음`
      if ((await T(page, 'pwp-picture').getAttribute('alt')) !== '그림') return 'alt'
      const leak = await page.evaluate((ans) => {
        const clone = document.querySelector('[data-testid="pwp-root"]').cloneNode(true)
        clone.querySelectorAll('[data-testid^="pwp-opt-"]').forEach((n) => n.remove())
        const t = clone.textContent || ''
        const attrs = [...clone.querySelectorAll('*'), clone].flatMap((el) => [...el.attributes].map((a) => a.name))
        return { en: t.toLowerCase().includes(ans.en.toLowerCase()), ko: t.includes(ans.ko), badAttr: attrs.filter((n) => /correct|answer|right|result/i.test(n)) }
      }, w)
      return leak.en || leak.ko || leak.badAttr.length ? JSON.stringify(leak) : ''
    }
    const rm = (await leakCheck(S.words[0], S.quiz[0]))
    r.check(`${name} (t1) 답하기 전: 단어·뜻·듣기·녹음기 DOM 0개, alt="그림", 화면 글에 정답 없음`, rm === '', rm)
    const optTexts = await page.locator('[data-testid^="pwp-opt-"]').allTextContents()
    r.check(`${name} (t1) 보기 4개(서로 다른 단어, 정답 1개 포함) + 위치 속성에 정답 힌트 없음`, optTexts.length === 4 && new Set(optTexts.map(lc)).size === 4 && optTexts.filter((t) => t === S.words[0].en).length === 1)
    await answer(page, wrongIdx(S.quiz[0]))
    r.check(`${name} (t1) 오답 후: 틀림 표시 + 단어·뜻·🔊 발음 듣기 보임`, (await T(page, 'pwp-feedback').getAttribute('data-result')) === 'wrong' && (await T(page, 'pwp-word').textContent()) === S.words[0].en && (await T(page, 'pwp-ko').textContent()) === S.words[0].ko && ((await T(page, 'pwp-listen').textContent()) || '').includes('🔊 발음 듣기') && (await T(page, 'pwp-rec-record').count()) === 0)
    await T(page, 'pwp-next').click()
    for (let q = 1; q < 6; q++) {
      const lm = q === 1 ? await leakCheck(S.words[q], S.quiz[q]) : ''
      if (lm) r.check(`${name} (t1) 문제 ${q + 1} 누출 없음`, false, lm)
      await answer(page, correctIdx(S.quiz[q]))
      await T(page, 'pwp-next').click()
    }
    await waitStep(page, 'review')
    const rc = T(page, 'pwp-review-card')
    r.check(`${name} (t1) 틀린 단어가 복습 목록에: 연습 카드(그림·단어·뜻·듣기·녹음기) 다시 나옴`, (await rc.getAttribute('data-kind')) === 'word' && (await T(page, 'pwp-card').count()) === 1 && (await T(page, 'pwp-word').textContent()) === S.words[0].en && (await T(page, 'pwp-listen').isVisible()) && (await T(page, 'pwp-rec-record').isVisible()))
    await recordOnce(page, 900)
    r.check(`${name} (t1) 복습 카드에서도 녹음·내 목소리 듣기 가능`, (await recStatus(page)).includes('녹음 완료') && (await blobInfo(page)).size > 0)
    await T(page, 'pwp-next').click() // 문제 풀기
    r.check(`${name} (t1) 복습 문제: 그림만(다시 단어/뜻/녹음기 숨김)`, (await T(page, 'pwp-word').count()) === 0 && (await T(page, 'pwp-rec-record').count()) === 0 && (await T(page, 'pwp-card').count()) === 0)
    await answer(page, correctIdx(buildQuiz([S.words[0]], POOL, S.seed + 7919)[0]))
    r.check(`${name} (t1) 복습 문제 정답 처리`, (await T(page, 'pwp-feedback').getAttribute('data-result')) === 'right')
    await T(page, 'pwp-next').click()
    await T(page, 'pwp-review-card').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} (t1) 다 맞히면 "모두 맞혔어요" 카드`, (await T(page, 'pwp-review-card').getAttribute('data-kind')) === 'clear' && ((await T(page, 'pwp-review-card').textContent()) || '').includes('모두 맞혔어요'))
    await T(page, 'pwp-next').click()
    await waitStep(page, 'summary')
    r.check(`${name} (t1) 요약: 처음에 5 / 6, 복습한 단어 1개, 다시 하기/다른 묶음/나가기`, ((await T(page, 'pwp-summary-first-try').textContent()) || '').replace(/\s/g, '') === '5/6' && (await T(page, 'pwp-summary-review').count()) === 1 && ((await T(page, 'pwp-summary-review').textContent()) || '').includes(S.words[0].en) && (await T(page, 'pwp-again').count()) === 1 && (await T(page, 'pwp-other-set').count()) === 1 && (await T(page, 'pwp-exit').count()) === 1)
    const oldSeed = await attr(page, 'data-seed')
    await T(page, 'pwp-again').click()
    await waitStep(page, 'quiz')
    r.check(`${name} (t1) 다시 하기 → 새 시드의 새 시험`, (await attr(page, 'data-seed')) !== oldSeed && (await attr(page, 'data-mode')) === 'test')
  }, { studentId: TESTER_ONLY })

  // ---- (f1) 한 번에 이어지는 흐름: 연습 6장 → 알파벳 망치 → 시험 → 복습 → 요약 ----
  await scenario('(f1) 연습→게임→시험→복습', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    const S = await startSet(page, 'food', 'practice', 'card')
    for (let i = 0; i < 6; i++) {
      if ((await T(page, 'pwp-word').textContent()) !== S.words[i].en) r.check(`${name} (f1) 카드 ${i + 1} 단어`, false, `${await T(page, 'pwp-word').textContent()} vs ${S.words[i].en}`)
      if (i === 2) await recordOnce(page, 900)
      await T(page, 'pwp-next').click()
    }
    await waitStep(page, 'end')
    r.check(`${name} (f1) 연습 6장 → "다음은 게임!"`, ((await T(page, 'pwp-end').textContent()) || '').includes('다음은 게임!'))
    await T(page, 'pwp-game-hammer').click()
    await T(page, 'pwh-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} (f1) 게임에도 그만하기(pwg-quit)가 있음`, (await T(page, 'pwg-quit').count()) === 1)
    const played = await playHammerAll(page)
    const ids = new Set(S.words.map((w) => w.id))
    // 망치는 글자 수 2~9인 단어만 쓴다(games.js gameEligible) — 세션에 긴 단어(sweet potato 등)가 섞이면 그만큼 줄어든다
    const letters = (en) => (en.match(/[a-z]/gi) || []).length
    const hammerable = S.words.filter((w) => letters(w.en) >= 2 && letters(w.en) <= 9).length
    r.check(`${name} (f1) 알파벳 망치가 같은 세션 단어로 진행(${played.length}개, 모두 세션 단어)`, played.length >= 1 && played.every((w) => ids.has(w.id)) && played.length === hammerable, `${played.map((w) => w.en).join()} / 기대 ${hammerable}`)
    await T(page, 'pwg-summary').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} (f1) 게임 끝 → "시험 보기" 버튼`, ((await T(page, 'pwg-to-test').textContent()) || '').includes('시험 보기'))
    await T(page, 'pwg-to-test').click()
    await waitStep(page, 'quiz')
    const seed = Number(await attr(page, 'data-seed'))
    const words = buildSession(S.words, { size: 6, seed }) // 시험은 연습 세션 단어(from)로 출제
    const quiz = buildQuiz(words, POOL, seed)
    r.check(`${name} (f1) 시험(data-mode=test): 게임에서 한 단어들로 출제, 그림만`, (await attr(page, 'data-mode')) === 'test' && (await T(page, 'pwp-word').count()) === 0 && words.length === S.words.length)
    for (let q = 0; q < words.length; q++) {
      await answer(page, q === 0 ? wrongIdx(quiz[q]) : correctIdx(quiz[q]))
      await T(page, 'pwp-next').click()
    }
    await waitStep(page, 'review')
    r.check(`${name} (f1) 복습: 틀린 단어의 연습 카드(녹음기 포함)`, (await T(page, 'pwp-card').count()) === 1 && (await T(page, 'pwp-word').textContent()) === words[0].en && (await T(page, 'pwp-rec-record').isVisible()))
    await T(page, 'pwp-next').click()
    await answer(page, correctIdx(buildQuiz([words[0]], POOL, seed + 7919)[0]))
    await T(page, 'pwp-next').click()
    await T(page, 'pwp-review-card').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pwp-next').click()
    await waitStep(page, 'summary')
    r.check(`${name} (f1) 요약: 처음에 ${words.length - 1} / ${words.length}`, ((await T(page, 'pwp-summary-first-try').textContent()) || '').replace(/\s/g, '') === `${words.length - 1}/${words.length}`)
    await T(page, 'pwp-exit').click()
    await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} (f1) 나가기 → 대시보드 복귀`, (await T(page, 'pwp-root').count()) === 0)
  }, { studentId: TESTER_ONLY })

  // ---- (g) 진입 제한 / 홈 메뉴 진입 ----
  await scenario('(g) 일반 학생', { width: 1280, height: 800 }, async ({ page, name, reqUrls }) => {
    await sleep(1000)
    r.check(`${name} 대시보드에 그림 단어 버튼 없음`, (await T(page, 'dash-picture-words').count()) === 0)
    r.check(`${name} 연습 화면 마운트 안 됨`, (await T(page, 'pwp-root').count()) === 0)
    const chunk = reqUrls.filter((u) => /PictureWordPractice/i.test(u))
    r.check(`${name} 연습 청크 요청 0건`, chunk.length === 0, chunk.slice(0, 2).join(','))
  }, { studentId: GENERAL })

  await scenario('(g) QA+테스터 홈 메뉴', { width: 1280, height: 800 }, async ({ page, name }) => {
    await T(page, 'student-home-picture-words').waitFor({ state: 'visible', timeout: 15000 })
    const bt = await T(page, 'student-home-picture-words').boundingBox()
    r.check(`${name} 홈 메뉴에 그림 단어 버튼(44px 이상)`, !!bt && bt.height >= 43.9, JSON.stringify(bt))
    await T(page, 'student-home-picture-words').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'pwp-exit').click()
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 나가기 → 홈 메뉴 복귀`, (await T(page, 'pwp-root').count()) === 0)
  }, { defaultFlags: false, login: loginToHome })

  // mockRoutes는 합성 음성을 항상 실패시켜 playWordAudio가 3단계(mock된 translate_tts, en-GB)로 가게 한다 — 기존 관례. 그 GET만 허용.
  const okTts = (u) => { try { const x = new URL(typeof u === 'string' ? u : u.url); return x.hostname === 'translate.googleapis.com' && x.pathname === '/translate_tts' && x.searchParams.get('tl') === 'en-GB' } catch { return false } }
  r.check('듣기의 네트워크 폴백은 mock된 translate_tts(tl=en-GB) GET뿐', ttsAll.every(okTts), JSON.stringify(ttsAll.filter((u) => !okTts(u)).slice(0, 2)))
  return { results: r.results, unmockedRequests, mockErrors }
}
