// tests/e2e/pictureWordGames.spec.mjs — 그림 단어 게임(250차: 알파벳 망치 / 숨은 글자 / 레벨 / 연결 진입 / 가게 선반). 네트워크 전체 mock, 저장 0, 보상 0.
// 화면의 단어는 그림 src의 asset 슬러그로만 알아낸다(DOM에는 정답 속성이 없다).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { buildSession, buildQuiz } from '../../src/utils/pictureWords/practice.js'
import { learnableWords, shopSets } from '../../src/data/pictureWords/index.js'
import { hiddenCount, playableCount } from '../../src/utils/pictureWords/games.js'

const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)
const storageSnap = (page) => page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))
const APP_KEY = /^(paul_easy_|paulEasyVoca_)/
const keyDiff = (a, b) => ['local', 'session'].flatMap((w) => [...b[w].filter((k) => !a[w].includes(k)).map((k) => `+${w}:${k}`), ...a[w].filter((k) => !b[w].includes(k)).map((k) => `-${w}:${k}`)]).filter((d) => !APP_KEY.test(d.slice(d.indexOf(':') + 1)))
const POOL = learnableWords()
const SETS = shopSets()
const TESTER_ONLY = 'e2e00000-0000-4000-8000-00000000a002'
const GENERAL = 'e2e00000-0000-4000-8000-00000000b001'
const lc = (s) => s.toLowerCase()
const isLetter = (ch) => /^[a-z]$/i.test(ch)

async function loginToDashboard(page) {
  const input = page.getByPlaceholder('이름 입력...')
  await input.waitFor({ state: 'visible', timeout: 90000 })
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await input.waitFor({ state: 'hidden', timeout: 20000 })
  await sleep(1500)
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
async function openScreen(page) {
  await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 20000 })
  await T(page, 'dash-picture-words').click()
  await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 20000 })
}
// 그림 src(<asset>-<hash8>.webp)로 단어를 찾는다.
async function shownWord(page, picId) {
  await T(page, picId).waitFor({ state: 'visible', timeout: 10000 })
  const src = await T(page, picId).getAttribute('src')
  const base = decodeURIComponent((src || '').split('?')[0].split('/').pop())
  const w = POOL.find((x) => base.startsWith(x.asset + '-') && base.length === x.asset.length + 1 + 8 + 5)
  if (!w) throw new Error(`cannot map picture src ${src}`)
  return w
}
async function startGame(page, level, mode) {
  await T(page, `pwg-level-${level}`).click()
  await T(page, `pwg-mode-${mode}`).click()
  await T(page, mode === 'hammer' ? 'pwh-root' : 'pwl-root').waitFor({ state: 'visible', timeout: 20000 })
}
const rootIndex = (page, root) => T(page, root).getAttribute('data-index')
const click = async (page, loc, touch) => {
  if (!touch) return loc.click()
  const b = await loc.boundingBox()
  return page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
}
const slotsFilled = (page) => page.locator('[data-testid^="pwh-slot-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-filled')).join(''))
const tiles = (page) => page.locator('[data-testid^="pwh-tile-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent, used: e.getAttribute('data-used') === 'true' })))

// 알파벳 망치 한 단어를 정답 순서로 끝낸다(오답 1번을 먼저 누르는 옵션).
async function hammerWord(page, w, { wrongFirst = false, touch = false } = {}) {
  const info = { wrongOk: true, slotsOk: true }
  if (wrongFirst) {
    const before = await slotsFilled(page)
    const need0 = [...w.en].find(isLetter)
    const bad = (await tiles(page)).find((x) => lc(x.t) !== lc(need0))
    if (bad) {
      await click(page, T(page, bad.id), touch)
      await T(page, 'pwh-feedback').waitFor({ state: 'visible', timeout: 3000 })
      info.wrongOk = (await T(page, 'pwh-feedback').getAttribute('data-result')) === 'wrong' && (await slotsFilled(page)) === before && ((await T(page, 'pwh-feedback').textContent()) || '').includes('괜찮아요')
    }
  }
  const cells = [...w.en]
  for (let i = 0; i < cells.length; i++) {
    if (!isLetter(cells[i])) continue
    const t = (await tiles(page)).find((x) => !x.used && lc(x.t) === lc(cells[i]))
    await click(page, T(page, t.id), touch)
    await page.waitForFunction(({ id, i2 }) => document.querySelector(`[data-testid="pwh-slot-${i2}"]`)?.getAttribute('data-filled') === 'true', { id: t.id, i2: i }, { timeout: 3000 })
  }
  return info
}

async function hiddenWord(page, w, touch = false) {
  const cells = [...w.en]
  for (let guard = 0; guard < 30; guard++) {
    if ((await T(page, 'pwl-root').getAttribute('data-done')) === 'true') return
    const idx = await page.locator('[data-testid^="pwl-cell-"]').evaluateAll((l) => l.findIndex((e) => e.getAttribute('data-blank') === 'true' && e.getAttribute('data-filled') === 'false'))
    const opts = await page.locator('[data-testid^="pwl-opt-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent })))
    const o = opts.find((x) => lc(x.t) === lc(cells[idx]))
    await click(page, T(page, o.id), touch)
    await sleep(60)
  }
}

export async function run(browser, baseURL) {
  const r = createRecorder('[picture-games]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsAll = []

  async function scenario(label, vp, body, { studentId = null, hasTouch = false } = {}) {
    const context = await browser.newContext({ viewport: vp, hasTouch })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const reqUrls = []
    page.on('request', (q) => reqUrls.push(q.url()))
    const { unmockedRequests: u, apiCallLog, ttsFallbackRequests } = await installMocks(page, studentId ? { studentId } : {})
    await page.addInitScript(() => {
      window.__speak = []
      const s = window.speechSynthesis
      if (!s) return
      const orig = s.speak.bind(s)
      s.speak = (x) => { if ((x.text || '').trim()) window.__speak.push(x.text); return orig(x) }
    })
    const name = `${label} [${vp.width}x${vp.height}]`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginToDashboard(page)
      const base = await storageSnap(page)
      await body({ page, name, reqUrls })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인/분석 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
      const after = await storageSnap(page)
      const d = keyDiff(base, after)
      const feat = [...after.local, ...after.session].filter((k) => /picture|pw/i.test(k) && !APP_KEY.test(k))
      r.check(`${name} 앱 자체 키 밖의 저장소 키 불변 + picture/pw 키 0`, d.length === 0 && feat.length === 0, JSON.stringify({ d, feat }))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
    ttsAll.push(...ttsFallbackRequests)
  }

  // ---- (a) 알파벳 망치 / phonics ----
  await scenario('(a) 알파벳 망치 phonics', { width: 1280, height: 800 }, async ({ page, name, reqUrls }) => {
    await openScreen(page)
    r.check(`${name} 게임을 열기 전에는 게임 청크 요청 0건`, !reqUrls.some((u) => /PictureGames/.test(u)))
    const lv = await Promise.all(['phonics', 'conversation', 'advanced'].map(async (l) => [l, await T(page, `pwg-level-${l}`).isDisabled()]))
    r.check(`${name} 레벨 칩: phonics/conversation 활성, advanced 비활성`, lv.map((x) => x[1]).join() === 'false,false,true', JSON.stringify(lv))
    await startGame(page, 'phonics', 'hammer')
    r.check(`${name} 게임을 열면 게임 청크 요청`, reqUrls.some((u) => /PictureGames/.test(u)))
    const seen = []
    for (let i = 0; i < 6; i++) {
      const w = await shownWord(page, 'pwh-picture')
      seen.push(w)
      if ((await rootIndex(page, 'pwh-root')) !== String(i)) throw new Error(`index ${i}`)
      if (i === 0) {
        r.check(`${name} phonics 단어(3~4글자)`, /^[a-z]{3,4}$/.test(w.en), w.en)
        const txt = (await T(page, 'pwh-root').innerText()).toLowerCase()
        const attrs = await T(page, 'pwh-root').evaluate((root) => [...root.querySelectorAll('*'), root].flatMap((el) => [...el.attributes].map((a) => a.name)).filter((n) => /correct|answer|right|aria-label/i.test(n)))
        r.check(`${name} 완성 전: pwh-word 0개 / 화면 글에 단어 없음 / 정답 속성 0 / alt 그림`, (await T(page, 'pwh-word').count()) === 0 && !txt.includes(w.en) && attrs.length === 0 && (await T(page, 'pwh-picture').getAttribute('alt')) === '그림', JSON.stringify({ attrs, txt: txt.slice(0, 80) }))
        r.check(`${name} 타일 높이/너비 48px 이상 + 한국어 뜻 표시`, await page.locator('[data-testid^="pwh-tile-"]').evaluateAll((l) => l.every((e) => { const b = e.getBoundingClientRect(); return b.height >= 47.9 && b.width >= 47.9 })) && ((await T(page, 'pwh-ko').textContent()) === w.ko))
        r.check(`${name} 시작만으로는 소리 재생 없음(자동재생 없음)`, (await page.evaluate(() => window.__speak.length)) === 0)
      }
      const info = await hammerWord(page, w, { wrongFirst: i === 0 })
      if (i === 0) r.check(`${name} 오답 타일 → data-result=wrong, 칸 변화 없음, 부드러운 안내`, info.wrongOk)
      await T(page, 'pwh-word').waitFor({ state: 'visible', timeout: 5000 })
      r.check(`${name} 단어 ${i + 1}: 모든 칸 채움 → 단어/완료 표시`, (await T(page, 'pwh-word').textContent()) === w.en && (await T(page, 'pwh-root').getAttribute('data-done')) === 'true' && (await T(page, 'pwh-feedback').getAttribute('data-result')) === 'right')
      await page.waitForFunction((en) => window.__speak.includes(en), w.en, { timeout: 4000 }).catch(() => {})
      const sp = await page.evaluate(() => window.__speak)
      r.check(`${name} 단어 ${i + 1}: 완성 후 발음 요청(speak 해당 단어)`, sp.includes(w.en), JSON.stringify(sp.slice(-2)))
      await T(page, 'pwh-next').click()
    }
    await T(page, 'pwg-summary').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 6단어 서로 다름 + 요약 표시(처음에 맞힌 단어 수) 버튼 4개`, new Set(seen.map((x) => x.id)).size === 6 && ((await T(page, 'pwg-first-try').textContent()) || '').replace(/\s/g, '') === '5/6' && (await T(page, 'pwg-again').count()) + (await T(page, 'pwg-other').count()) + (await T(page, 'pwg-to-practice').count()) + (await T(page, 'pwg-exit').count()) === 4, await T(page, 'pwg-summary').innerText())
    await T(page, 'pwg-exit').click()
    await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 나가기 → 대시보드`, (await T(page, 'pwp-root').count()) === 0)
  }, { studentId: TESTER_ONLY })

  // ---- (b) 숨은 글자 / conversation ----
  await scenario('(b) 숨은 글자 conversation', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await startGame(page, 'conversation', 'hidden')
    let w = await shownWord(page, 'pwl-picture')
    const allText = async () => page.locator('[data-testid^="pwl-cell-"]').evaluateAll((l) => l.map((e) => ({ b: e.getAttribute('data-blank'), f: e.getAttribute('data-filled'), t: e.textContent })))
    for (const d of ['easy', 'normal', 'hard']) {
      await T(page, `pwl-diff-${d}`).click()
      await page.waitForFunction((x) => document.querySelector('[data-testid="pwl-root"]')?.getAttribute('data-difficulty') === x, d, { timeout: 3000 })
      w = await shownWord(page, 'pwl-picture')
      const cs = await allText()
      const blanks = cs.filter((c) => c.b === 'true')
      r.check(`${name} ${d}: 빈칸 ${hiddenCount(playableCount(w.en), d)}개(규칙), 빈칸은 "_"만 보임`, blanks.length === hiddenCount(playableCount(w.en), d) && blanks.every((c) => c.t === '_' && c.f === 'false'), JSON.stringify(blanks))
      const attrs = await T(page, 'pwl-root').evaluate((root) => [...root.querySelectorAll('*'), root].flatMap((el) => [...el.attributes].map((a) => a.name)).filter((x) => /correct|answer|right|aria-label/i.test(x)))
      const txt = (await T(page, 'pwl-root').innerText()).toLowerCase()
      r.check(`${name} ${d}: pwl-word 0개 / 정답 속성 0 / 전체 단어가 화면 글에 없음 / alt 그림`, (await T(page, 'pwl-word').count()) === 0 && attrs.length === 0 && !txt.includes(w.en) && (await T(page, 'pwl-picture').getAttribute('alt')) === '그림', JSON.stringify(attrs))
    }
    // 오답: 옵션 비활성, 칸 그대로
    const cs0 = await allText()
    const first = cs0.findIndex((c) => c.b === 'true')
    const opts = await page.locator('[data-testid^="pwl-opt-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent })))
    r.check(`${name} 옵션 4개, 서로 다름, 정답 1개 포함`, opts.length === 4 && new Set(opts.map((o) => lc(o.t))).size === 4 && opts.filter((o) => lc(o.t) === lc(w.en[first])).length === 1, JSON.stringify(opts))
    const bad = opts.find((o) => lc(o.t) !== lc(w.en[first]))
    await T(page, bad.id).click()
    await T(page, 'pwl-feedback').waitFor({ state: 'visible', timeout: 3000 })
    r.check(`${name} 오답 옵션: 비활성 + data-result=wrong + 칸 진행 없음 + 부드러운 안내`, (await T(page, bad.id).isDisabled()) && (await T(page, 'pwl-feedback').getAttribute('data-result')) === 'wrong' && JSON.stringify(await allText()) === JSON.stringify(cs0) && ((await T(page, 'pwl-feedback').textContent()) || '').includes('괜찮아요'))
    await hiddenWord(page, w)
    await T(page, 'pwl-word').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 정답 선택으로 완성 → 단어 표시`, (await T(page, 'pwl-word').textContent()) === w.en)
    await page.waitForFunction((en) => window.__speak.includes(en), w.en, { timeout: 4000 }).catch(() => {})
    r.check(`${name} 완성 후 발음 요청`, (await page.evaluate(() => window.__speak)).includes(w.en))
    // 구분자(공백/하이픈) 단어: 여러 세션까지 찾아본다
    let sep = null
    const settle = () => page.locator('[data-testid="pwl-root"], [data-testid="pwg-summary"]').first().waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pwl-next').click()
    for (let session = 0; session < 8 && !sep; session++) {
      await settle()
      while ((await T(page, 'pwg-summary').count()) === 0) {
        const x = await shownWord(page, 'pwl-picture')
        if (/[^a-z]/i.test(x.en)) {
          const cs = await allText()
          sep = { word: x.en, okSep: [...x.en].every((ch, k) => isLetter(ch) || (cs[k].f === 'true' && cs[k].t === ch)) }
          break
        }
        await hiddenWord(page, x)
        await T(page, 'pwl-next').click()
        await settle()
      }
      if (!sep) await T(page, 'pwg-again').click()
    }
    r.check(`${name} 여러 단어 항목은 구분자가 미리 채워져 보임(${sep && sep.word})`, !!sep && sep.okSep, JSON.stringify(sep))
  }, { studentId: TESTER_ONLY })

  // ---- (c) 연결 진입: 연습 세션 → 이 단어로 알파벳 망치 ----
  await scenario('(c) 연결 진입', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await T(page, 'pwp-set-food').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible' })
    const seed = Number(await T(page, 'pwp-root').getAttribute('data-seed'))
    const food = SETS.find((s) => s.shop === 'food')
    const words = buildSession(food.words, { size: 6, seed })
    const quiz = buildQuiz(words, POOL, seed)
    const step = async (s) => page.waitForFunction((x) => document.querySelector('[data-testid="pwp-root"]')?.getAttribute('data-step') === x, s, { timeout: 10000 })
    for (const [, nxt] of [['look', 'listen'], ['listen', 'repeat'], ['repeat', 'quiz']]) {
      for (let i = 0; i < 6; i++) await T(page, 'pwp-next').click()
      await step(nxt)
    }
    for (let q = 0; q < 6; q++) {
      await T(page, `pwp-opt-${quiz[q].options.findIndex((o) => o.id === quiz[q].correctId)}`).click()
      await T(page, 'pwp-feedback').waitFor({ state: 'visible', timeout: 5000 })
      await T(page, 'pwp-next').click()
    }
    await step('review')
    await T(page, 'pwp-next').click()
    await step('summary')
    r.check(`${name} 요약에 "이 단어로 알파벳 망치/숨은 글자" 버튼`, ((await T(page, 'pwp-game-hammer').textContent()) || '').includes('이 단어로 알파벳 망치') && ((await T(page, 'pwp-game-hidden').textContent()) || '').includes('이 단어로 숨은 글자'))
    await T(page, 'pwp-game-hammer').click()
    await T(page, 'pwh-root').waitFor({ state: 'visible', timeout: 20000 })
    const ids = new Set(words.map((x) => x.id))
    const w0 = await shownWord(page, 'pwh-picture')
    await hammerWord(page, w0)
    await T(page, 'pwh-next').click()
    const w1 = await shownWord(page, 'pwh-picture')
    r.check(`${name} 알파벳 망치가 방금 연습한 단어로 시작(첫 두 단어가 세션 단어)`, ids.has(w0.id) && ids.has(w1.id), `${w0.en},${w1.en}`)
  }, { studentId: TESTER_ONLY })

  // ---- (d) 가게 선반 ----
  await scenario('(d) 가게 선반', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await T(page, 'pwg-mode-shelf').click()
    await T(page, 'pws-root').waitFor({ state: 'visible', timeout: 20000 })
    const shopIds = await page.locator('[data-testid^="pws-shop-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-testid').slice(9)))
    r.check(`${name} 가게 8개, 고정 순서`, shopIds.join() === SETS.map((s) => s.shop).join() && shopIds.length === 8, shopIds.join())
    const unready = SETS.filter((s) => !s.ready), ready = SETS.filter((s) => s.ready)
    let okU = unready.length >= 1
    for (const s of unready) {
      await T(page, `pws-shop-${s.shop}`).click()
      const txt = (await T(page, 'pws-root').innerText())
      const dis = await page.locator('[data-testid^="pws-practice-"]').evaluateAll((l) => l.every((e) => e.disabled))
      if (!txt.includes('준비 중') || !dis || (await T(page, 'pws-practice-all').isEnabled())) okU = false
    }
    r.check(`${name} 준비 안 된 가게(${unready.map((s) => s.shop)}): 준비 중 표시 + 연습 버튼 모두 비활성`, okU)
    const food = ready.find((s) => s.shop === 'food')
    await T(page, 'pws-shop-food').click()
    const item = food.words[2]
    await T(page, `pws-item-${item.asset}`).waitFor({ state: 'visible', timeout: 5000 })
    const itemTxt = await T(page, `pws-item-${item.asset}`).innerText()
    r.check(`${name} 선반 항목: 영어 단어와 뜻이 보임 + 그림 로드`, itemTxt.includes(item.en) && itemTxt.includes(item.ko))
    const money = await page.evaluate(() => ({ btn: [...document.querySelectorAll('button')].filter((b) => /구매|가격|코인|buy|price/i.test(b.textContent || '')).length, ids: document.querySelectorAll('[data-testid*="buy"],[data-testid*="price"],[data-testid*="coin"]').length, txt: /가격|코인|\d+\s*원/.test(document.body.innerText) }))
    r.check(`${name} 구매 버튼/가격/코인 요소 없음 + 안내 문구`, money.btn === 0 && money.ids === 0 && !money.txt && (await T(page, 'pws-root').innerText()).includes('구매는 아직 열리지 않았어요'), JSON.stringify(money))
    await T(page, `pws-practice-${item.asset}`).click()
    await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 10000 })
    const got = []
    for (let i = 0; i < 6; i++) { got.push(await T(page, 'pwp-word').textContent()); await T(page, 'pwp-next').click() }
    r.check(`${name} 단어 연습 버튼 → 그 단어를 포함한 6단어 연습 세션`, got.includes(item.en) && got.length === 6 && new Set(got).size === 6, JSON.stringify(got))
  }, { studentId: TESTER_ONLY })

  // ---- (e) 360x640 터치 ----
  await scenario('(e) 모바일 터치', { width: 360, height: 640 }, async ({ page, name }) => {
    const covered = (loc) => loc.evaluate((el) => { el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(top === el || el.contains(top)) })
    await openScreen(page)
    r.check(`${name} 선택 화면 가로 넘침 0`, (await overflow(page)) <= 0, String(await overflow(page)))
    await startGame(page, 'phonics', 'hammer')
    let w = await shownWord(page, 'pwh-picture')
    const tl = await tiles(page)
    let anyCovered = false
    for (const t of tl) if (await covered(T(page, t.id))) anyCovered = true
    r.check(`${name} 알파벳 망치: 넘침 0 / 타일 가림 0 / 타일 48px 이상`, (await overflow(page)) <= 0 && !anyCovered && (await page.locator('[data-testid^="pwh-tile-"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().height >= 47.9 && e.getBoundingClientRect().width >= 47.9))), `${await overflow(page)}/${anyCovered}`)
    const info = await hammerWord(page, w, { wrongFirst: true, touch: true })
    await T(page, 'pwh-word').waitFor({ state: 'visible', timeout: 5000 })
    const nextCovered = await covered(T(page, 'pwh-next'))
    r.check(`${name} 터치로 오답 처리 + 터치로 완성, 다음 버튼 가림 0, 넘침 0`, info.wrongOk && (await T(page, 'pwh-word').textContent()) === w.en && !nextCovered && (await overflow(page)) <= 0, `${info.wrongOk}/${nextCovered}/${await overflow(page)}`)
    await T(page, 'pwg-quit').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible' })
    await startGame(page, 'conversation', 'hidden')
    await T(page, 'pwl-diff-hard').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="pwl-root"]')?.getAttribute('data-difficulty') === 'hard')
    w = await shownWord(page, 'pwl-picture')
    let optCovered = false
    for (let k = 0; k < 4; k++) if (await covered(T(page, `pwl-opt-${k}`))) optCovered = true
    const small = await page.locator('button:visible').evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 43.9).length)
    r.check(`${name} 숨은 글자(어려움): 넘침 0 / 옵션 가림 0 / 작은 버튼 0`, (await overflow(page)) <= 0 && !optCovered && small === 0, `${await overflow(page)}/${optCovered}/${small}`)
    const first = await page.locator('[data-testid^="pwl-cell-"]').evaluateAll((l) => l.findIndex((e) => e.getAttribute('data-blank') === 'true'))
    const opts = await page.locator('[data-testid^="pwl-opt-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent })))
    const bad = opts.find((o) => lc(o.t) !== lc(w.en[first]))
    await click(page, T(page, bad.id), true)
    await T(page, 'pwl-feedback').waitFor({ state: 'visible', timeout: 3000 })
    const wrongOk = (await T(page, bad.id).isDisabled()) && (await T(page, 'pwl-feedback').getAttribute('data-result')) === 'wrong'
    await hiddenWord(page, w, true)
    await T(page, 'pwl-word').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 터치로 숨은 글자 오답/정답 선택 → 완성, 다음 버튼 가림 0, 넘침 0`, wrongOk && !(await covered(T(page, 'pwl-next'))) && (await overflow(page)) <= 0, String(await overflow(page)))
  }, { studentId: TESTER_ONLY, hasTouch: true })

  // ---- (f) 일반 학생 ----
  await scenario('(f) 일반 학생', { width: 1280, height: 800 }, async ({ page, name, reqUrls }) => {
    await sleep(1000)
    r.check(`${name} 그림 단어 진입 없음 / 화면·게임 마운트 안 됨`, (await T(page, 'dash-picture-words').count()) === 0 && (await T(page, 'pwp-root').count()) === 0 && (await T(page, 'pwh-root').count()) === 0)
    const chunk = reqUrls.filter((u) => /PictureWordPractice|PictureGames/i.test(u))
    r.check(`${name} 연습/게임 청크 요청 0건`, chunk.length === 0, chunk.slice(0, 2).join(','))
  }, { studentId: GENERAL })

  const okTts = (u) => { try { const x = new URL(typeof u === 'string' ? u : u.url); return x.hostname === 'translate.googleapis.com' && x.pathname === '/translate_tts' && x.searchParams.get('tl') === 'en-GB' } catch { return false } }
  r.check('듣기/발음의 네트워크 폴백은 mock된 translate_tts(tl=en-GB) GET뿐', ttsAll.every(okTts), JSON.stringify(ttsAll.filter((u) => !okTts(u)).slice(0, 2)))
  return { results: r.results, unmockedRequests, mockErrors }
}
