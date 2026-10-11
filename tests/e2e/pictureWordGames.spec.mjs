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

// 연속 빠른 탭: 앞의 두 글자 타일을 기다리지 않고 연달아 눌러 두 칸이 순서대로 채워지는지 보고 나머지는 이어서 끝낸다.
async function rapidWord(page, w) {
  const letters = [...w.en].map((ch, i) => [ch, i]).filter(([ch]) => isLetter(ch))
  const ts = await tiles(page)
  const a = ts.find((x) => lc(x.t) === lc(letters[0][0]))
  const b = ts.find((x) => x.id !== a.id && lc(x.t) === lc(letters[1][0]))
  await T(page, a.id).click(); await T(page, b.id).click()
  const filled = await page.waitForFunction(({ i0, i1 }) => ['pwh-slot-' + i0, 'pwh-slot-' + i1].every((id) => document.querySelector(`[data-testid="${id}"]`)?.getAttribute('data-filled') === 'true'), { i0: letters[0][1], i1: letters[1][1] }, { timeout: 3000 }).then(() => true).catch(() => false)
  const rest = await hammerWord(page, w, { skip: 2 })
  return { ...rest, rapidOk: filled && !!a && !!b }
}
// 알파벳 망치 한 단어를 정답 순서로 끝낸다(오답 1번을 먼저 누르는 옵션).
async function hammerWord(page, w, { wrongFirst = false, touch = false, probeFly = false, skip = 0 } = {}) {
  const info = { wrongOk: true, slotsOk: true, fly: null, flyGone: null }
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
  let seen = 0
  for (let i = 0; i < cells.length; i++) {
    if (!isLetter(cells[i])) continue
    if (seen++ < skip) continue
    const t = (await tiles(page)).find((x) => !x.used && lc(x.t) === lc(cells[i]))
    await click(page, T(page, t.id), touch)
    if (probeFly && info.fly === null) {
      info.fly = (await T(page, 'pwh-fly').count()) > 0 || (await T(page, t.id).evaluate((e) => getComputedStyle(e).transform !== 'none'))
    }
    await page.waitForFunction(({ id, i2 }) => document.querySelector(`[data-testid="pwh-slot-${i2}"]`)?.getAttribute('data-filled') === 'true', { id: t.id, i2: i }, { timeout: 3000 })
    if (probeFly && info.flyGone === null) info.flyGone = await page.waitForFunction(() => document.querySelectorAll('[data-testid="pwh-fly"]').length === 0, null, { timeout: 1000 }).then(() => true).catch(() => false)
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

  async function scenario(label, vp, body, { studentId = null, hasTouch = false, reduced = false } = {}) {
    const context = await browser.newContext({ viewport: vp, hasTouch, reducedMotion: reduced ? 'reduce' : 'no-preference' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const reqUrls = []
    page.on('request', (q) => reqUrls.push(q.url()))
    const { unmockedRequests: u, apiCallLog, ttsFallbackRequests } = await installMocks(page, studentId ? { studentId } : {})
    await page.addInitScript(() => {
      window.__speak = []
      window.__speakT = []
      const s = window.speechSynthesis
      if (s) {
        const orig = s.speak.bind(s)
        s.speak = (x) => { if ((x.text || '').trim()) { window.__speak.push(x.text); window.__speakT.push(performance.now()) } return orig(x) }
      }
      // 252차: 효과음 관찰 — 앱 코드는 그대로 두고 AudioContext.createOscillator의 start()만 감싸 시작 시각/주파수/파형을 기록한다.
      window.__osc = []
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) {
        const co = AC.prototype.createOscillator
        AC.prototype.createOscillator = function (...a) {
          const o = co.apply(this, a)
          const st = o.start
          o.start = function (...b) { window.__osc.push({ t: performance.now(), f: o.frequency.value, type: o.type }); return st.apply(this, b) }
          return o
        }
      }
      // 애니메이션 클래스(pw-shake / pw-glow / 반짝이 / 날아가기)가 켜지고 꺼지는 시각을 rAF로 기록
      const blank = () => ({ shake: [], glow: [], sparkMax: 0, sparkOn: null, sparkOff: null, flyMax: 0 })
      window.__fx = blank()
      window.__fxReset = () => { window.__fx = blank() }
      let s0 = false, g0 = false
      const tick = () => {
        const t = performance.now(), fx = window.__fx
        const sh = !!document.querySelector('.pw-shake'), gl = !!document.querySelector('.pw-card.pw-glow')
        if (sh && !s0) fx.shake.push({ on: t, off: null }); if (!sh && s0 && fx.shake.length) fx.shake[fx.shake.length - 1].off = t; s0 = sh
        if (gl && !g0) fx.glow.push({ on: t, off: null }); if (!gl && g0 && fx.glow.length) fx.glow[fx.glow.length - 1].off = t; g0 = gl
        const sp = document.querySelectorAll('[data-testid="pw-sparkle"]').length
        fx.sparkMax = Math.max(fx.sparkMax, sp)
        if (sp > 0 && fx.sparkOn == null) fx.sparkOn = t
        if (sp === 0 && fx.sparkOn != null && fx.sparkOff == null) fx.sparkOff = t
        fx.flyMax = Math.max(fx.flyMax, document.querySelectorAll('[data-testid="pwh-fly"]').length)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
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
        const attrs = await T(page, 'pwh-root').evaluate((root) => [...root.querySelectorAll('*'), root].flatMap((el) => [...el.attributes].filter((a) => !(a.name === 'aria-label' && /^글자 \S$/.test(a.value))).map((a) => a.name)).filter((n) => /correct|answer|right|aria-label/i.test(n)))
        const labels = await page.locator('[data-testid^="pwh-tile-"]').evaluateAll((l) => l.map((e) => [e.getAttribute('aria-label'), e.textContent]))
        r.check(`${name} 259차: 망치 타일마다 aria-label "글자 x"(자기 글자만, 정답 순서 정보 없음)`, labels.length > 0 && labels.every(([a, t]) => a === `글자 ${t}`), JSON.stringify(labels))
        r.check(`${name} 완성 전: pwh-word 0개 / 화면 글에 단어 없음 / 정답 속성 0 / alt 그림`, (await T(page, 'pwh-word').count()) === 0 && !txt.includes(w.en) && attrs.length === 0 && (await T(page, 'pwh-picture').getAttribute('alt')) === '그림', JSON.stringify({ attrs, txt: txt.slice(0, 80) }))
        r.check(`${name} 타일·빈 칸 56px 이상(1280) + 한국어 뜻 표시`, await page.locator('[data-testid^="pwh-tile-"]').evaluateAll((l) => l.every((e) => { const b = e.getBoundingClientRect(); return b.height >= 55.9 && b.width >= 55.9 })) && (await page.locator('[data-testid^="pwh-slot-"][data-filled="false"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().height >= 55.9 && e.getBoundingClientRect().width >= 55.9))) && ((await T(page, 'pwh-ko').textContent()) === w.ko))
        r.check(`${name} 시작만으로는 소리 재생 없음(자동재생 없음)`, (await page.evaluate(() => window.__speak.length)) === 0)
      }
      const info = i === 1 ? await rapidWord(page, w) : await hammerWord(page, w, { wrongFirst: i === 0, probeFly: i === 0 })
      if (i === 0) r.check(`${name} 맞는 탭 직후 글자가 날아감(pwh-fly 또는 타일 transform) → 1초 안에 칸 채움 + pwh-fly 사라짐`, info.fly === true && info.flyGone === true, JSON.stringify(info))
      if (i === 1) r.check(`${name} 빠르게 연속 두 번 탭해도 칸 두 개가 순서대로 채워짐`, info.rapidOk === true, JSON.stringify(info))
      if (i === 0) r.check(`${name} 오답 타일 → data-result=wrong, 칸 변화 없음, 부드러운 안내`, info.wrongOk)
      await T(page, 'pwh-word').waitFor({ state: 'visible', timeout: 5000 })
      r.check(`${name} 단어 ${i + 1}: 모든 칸 채움 → 단어/완료 표시`, (await T(page, 'pwh-word').textContent()) === w.en && (await T(page, 'pwh-root').getAttribute('data-done')) === 'true' && (await T(page, 'pwh-feedback').getAttribute('data-result')) === 'right')
      await page.waitForFunction((en) => window.__speak.includes(en), w.en, { timeout: 4000 }).catch(() => {})
      if (i === 0) r.check(`${name} 259차: 완성하면 "다음 단어" 버튼에 포커스`, await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'pwh-next', null, { timeout: 2000 }).then(() => true).catch(() => false))
      const sp = await page.evaluate(() => window.__speak)
      r.check(`${name} 단어 ${i + 1}: 완성 후 발음 요청(speak 해당 단어)`, sp.includes(w.en), JSON.stringify(sp.slice(-2)))
      await T(page, 'pwh-next').click()
    }
    await T(page, 'pwg-summary').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 6단어 서로 다름 + 요약 표시(처음에 맞힌 단어 수) 버튼 5개(시험 보기 포함)`, new Set(seen.map((x) => x.id)).size === 6 && ((await T(page, 'pwg-first-try').textContent()) || '').replace(/\s/g, '') === '5/6' && (await T(page, 'pwg-again').count()) + (await T(page, 'pwg-other').count()) + (await T(page, 'pwg-to-practice').count()) + (await T(page, 'pwg-to-test').count()) + (await T(page, 'pwg-exit').count()) === 5, await T(page, 'pwg-summary').innerText())
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
    await T(page, 'pwp-start-practice-food').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible' })
    const seed = Number(await T(page, 'pwp-root').getAttribute('data-seed'))
    const food = SETS.find((s) => s.shop === 'food')
    const words = buildSession(food.words, { size: 6, seed })
    const step = async (s) => page.waitForFunction((x) => document.querySelector('[data-testid="pwp-root"]')?.getAttribute('data-step') === x, s, { timeout: 10000 })
    for (let i = 0; i < 6; i++) await T(page, 'pwp-next').click()
    await step('end')
    r.check(`${name} 연습 끝 카드에 "알파벳 망치로/숨은 글자로" 버튼`, ((await T(page, 'pwp-game-hammer').textContent()) || '').includes('알파벳 망치로') && ((await T(page, 'pwp-game-hidden').textContent()) || '').includes('숨은 글자로'))
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
    r.check(`${name} 알파벳 망치: 넘침 0 / 타일 가림 0 / 타일 48px 이상`, (await overflow(page)) <= 0 && !anyCovered && (await page.locator('[data-testid^="pwh-tile-"], [data-testid^="pwh-slot-"][data-filled="false"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().height >= 47.9 && e.getBoundingClientRect().width >= 47.9))), `${await overflow(page)}/${anyCovered}`)
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

  // ================= 252차: 효과음 + 공통 디자인 =================
  const SFX_KEY = 'paulEasyVoca_pictureWordSfx'
  const bits = async (page) => (await slotsFilled(page)).replace(/true/g, '1').replace(/false/g, '0')
  const osc = (page) => page.evaluate(() => window.__osc.slice())
  const resetFx = (page) => page.evaluate(() => { window.__osc.length = 0; window.__speakT.length = 0; window.__fxReset() })
  const sig = (list) => JSON.stringify([...new Set(list.map((o) => `${o.type}:${Math.round(o.f)}`))].sort())
  const wordLetters = (w) => [...w.en].filter(isLetter)
  // 다음 단어로 넘기며 글자가 minLen 이상인 단어를 만난다(요약에 닿으면 다시 하기).
  async function wordWithLetters(page, minLen) {
    for (let guard = 0; guard < 14; guard++) {
      const w = await shownWord(page, 'pwh-picture')
      if (wordLetters(w).length >= minLen) return w
      await hammerWord(page, w)
      await T(page, 'pwh-next').click()
      await page.locator('[data-testid="pwh-root"], [data-testid="pwg-summary"]').first().waitFor({ state: 'visible', timeout: 5000 })
      if ((await T(page, 'pwg-summary').count()) > 0) { await T(page, 'pwg-again').click(); await T(page, 'pwh-root').waitFor({ state: 'visible', timeout: 5000 }) }
    }
    throw new Error('no word with enough letters')
  }
  const tileFor = async (page, ch, usedIds) => (await tiles(page)).find((x) => !x.used && !usedIds.includes(x.id) && lc(x.t) === lc(ch))

  // ---- (sx1) PC 마우스: 맞음/틀림 소리가 다르다 + 완성 → 성공음 → 영국식 발음 + 반짝이/빛
  await scenario('(sx1) 효과음', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await startGame(page, 'phonics', 'hammer')
    const w = await shownWord(page, 'pwh-picture')
    const letters = wordLetters(w)
    r.check(`${name} 소리 설정 컨트롤: 기본 켜짐 / 볼륨 60 / 토글 aria-pressed=true`, (await T(page, 'pwsfx-root').getAttribute('data-sfx-on')) === 'true' && (await T(page, 'pwsfx-root').getAttribute('data-sfx-volume')) === '60' && (await T(page, 'pwsfx-toggle').getAttribute('aria-pressed')) === 'true' && ((await T(page, 'pwsfx-toggle').textContent()) || '').includes('🔊'))
    r.check(`${name} 게임을 열기만 해서는 효과음 0 (진입·마운트는 소리 없음)`, (await osc(page)).length === 0)
    await resetFx(page)
    const bad = (await tiles(page)).find((x) => lc(x.t) !== lc(letters[0]))
    if (bad) {
      await T(page, bad.id).click()
      await T(page, 'pwh-feedback').waitFor({ state: 'visible', timeout: 3000 })
    }
    const wrongOsc = await osc(page)
    await resetFx(page)
    const t0 = await tileFor(page, letters[0], [])
    await T(page, t0.id).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="pwh-fly"]').length === 0, null, { timeout: 2000 })
    const rightOsc = await osc(page)
    r.check(`${name} (sx1) 틀린 탭 → 소리 ≥1, 맞은 탭 → 소리 ≥1, 두 소리의 주파수 구성이 다름`, (!bad || wrongOsc.length >= 1) && rightOsc.length >= 1 && (!bad || sig(wrongOsc) !== sig(rightOsc)), JSON.stringify({ wrong: sig(wrongOsc), right: sig(rightOsc) }))
    r.check(`${name} (sx1) 맞음=밝게 올라가는 팝(삼각파 660→) / 틀림=낮은 사인파(≤ 240Hz) — 거친 소리 없음`, rightOsc.some((o) => o.type === 'triangle' && o.f >= 600) && (!bad || (wrongOsc.every((o) => o.type === 'sine' && o.f <= 240))), JSON.stringify({ rightOsc, wrongOsc }))
    // 마지막 글자 직전까지 채우고, 마지막 탭에서 효과를 관찰한다
    const used = [t0.id]
    for (let k = 1; k < letters.length - 1; k++) { const t = await tileFor(page, letters[k], used); used.push(t.id); await T(page, t.id).click() }
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="pwh-fly"]').length === 0, null, { timeout: 2000 })
    await sleep(350)
    await resetFx(page)
    const last = await tileFor(page, letters[letters.length - 1], used)
    await T(page, last.id).click()
    await T(page, 'pwh-word').waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForFunction(() => window.__speakT.length >= 1, null, { timeout: 4000 }).catch(() => {})
    await page.waitForFunction(() => !document.querySelector('[data-testid="pw-sparkle"]'), null, { timeout: 1500 })
    const o = await osc(page)
    const st = await page.evaluate(() => ({ speakT: window.__speakT.slice(), fx: window.__fx }))
    const arp = o.filter((x) => x.type === 'triangle' && [523, 659, 784, 1047].includes(Math.round(x.f)))
    const gap = st.speakT.length ? st.speakT[0] - Math.min(...arp.map((x) => x.t)) : -1
    r.check(`${name} (sx1) 완성: 성공음(C5 E5 G5 C6 아르페지오 4음) 다음에 영국식 발음 요청, 간격 ≥ 300ms (${Math.round(gap)}ms)`, arp.length === 4 && st.speakT.length >= 1 && gap >= 300, JSON.stringify({ arp: arp.length, gap, speak: st.speakT.length }))
    r.check(`${name} (sx1) 반짝이 3~6개가 나타났다가 1초 안에 사라짐 + 카드 테두리 빛(pw-glow)이 잠깐 켜졌다 꺼짐`, st.fx.sparkMax >= 3 && st.fx.sparkMax <= 6 && st.fx.sparkOff != null && st.fx.sparkOff - st.fx.sparkOn <= 1000 && st.fx.glow.length >= 1 && st.fx.glow[0].off != null && st.fx.glow[0].off - st.fx.glow[0].on <= 1000, JSON.stringify(st.fx))
    r.check(`${name} (sx1) 완성 뒤 영어 단어 공개 + 다음 단어 버튼 (발음 중복 요청 아님)`, (await T(page, 'pwh-word').textContent()) === w.en && (await T(page, 'pwh-next').isVisible()) && (await page.evaluate(() => window.__speak.length)) >= 1)
  }, { studentId: TESTER_ONLY })

  // ---- (sx2) 음소거 / 볼륨 / 새로고침 후 유지 / 저장 키 1개
  await scenario('(sx2) 소리 켜기/끄기·볼륨', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    const pickerCtl = (await T(page, 'pwsfx-root').count()) === 1 && (await T(page, 'pwsfx-toggle').count()) === 1
    r.check(`${name} (sx2) 선택 화면에도 소리 컨트롤이 있음 + 슬라이더 높이 ≥ 44px`, pickerCtl && (await T(page, 'pwsfx-volume').evaluate((e) => e.getBoundingClientRect().height >= 43.9 && e.type === 'range' && e.min === '0' && e.max === '100')))
    const before = await storageSnap(page)
    await startGame(page, 'phonics', 'hammer')
    const w = await shownWord(page, 'pwh-picture')
    const letters = wordLetters(w)
    const used = []
    const slotOf = (k) => [...w.en].map((ch, i) => (isLetter(ch) ? i : -1)).filter((i) => i >= 0)[k]
    const tapNext = async (k) => { const t = await tileFor(page, letters[k], used); used.push(t.id); await T(page, t.id).click(); await page.waitForFunction((i) => document.querySelector(`[data-testid="pwh-slot-${i}"]`)?.getAttribute('data-filled') === 'true', slotOf(k), { timeout: 3000 }) }
    await T(page, 'pwsfx-toggle').click()
    r.check(`${name} (sx2) 끄면 data-sfx-on=false, aria-pressed=false, 🔇`, (await T(page, 'pwsfx-root').getAttribute('data-sfx-on')) === 'false' && (await T(page, 'pwsfx-toggle').getAttribute('aria-pressed')) === 'false' && ((await T(page, 'pwsfx-toggle').textContent()) || '').includes('🔇'))
    await resetFx(page)
    await tapNext(0)
    r.check(`${name} (sx2) 꺼짐: 탭해도 새 소리 0, 게임은 그대로 진행`, (await osc(page)).length === 0 && (await bits(page)).includes('1'))
    await T(page, 'pwsfx-toggle').click()
    await resetFx(page)
    await tapNext(1)
    const onOsc = (await osc(page)).length
    r.check(`${name} (sx2) 다시 켜면 소리가 돌아옴 (${onOsc})`, onOsc >= 1 && (await T(page, 'pwsfx-root').getAttribute('data-sfx-on')) === 'true')
    await T(page, 'pwsfx-volume').fill('0')
    r.check(`${name} (sx2) 슬라이더가 설정에 즉시 반영 (data-sfx-volume=0)`, (await T(page, 'pwsfx-root').getAttribute('data-sfx-volume')) === '0')
    await resetFx(page)
    if (letters.length > 3) await tapNext(2)
    r.check(`${name} (sx2) 볼륨 0: 소리 0`, (await osc(page)).length === 0)
    await T(page, 'pwsfx-volume').fill('40')
    await sleep(300)
    await resetFx(page)
    await T(page, 'pwsfx-volume').fill('45')
    r.check(`${name} (sx2) 볼륨을 바꾸면 짧은 미리듣기(tap) 소리`, (await osc(page)).length >= 1)
    await T(page, 'pwsfx-volume').fill('40')
    const stored = await page.evaluate((k) => localStorage.getItem(k), SFX_KEY)
    const after = await storageSnap(page)
    const pic = [...after.local, ...after.session].filter((k) => /picture|pw/i.test(k))
    r.check(`${name} (sx2) 설정이 저장 키 1개(${SFX_KEY})에 {on:true, volume:0.4}로 저장, 그림 단어 관련 새 키는 이것뿐`, !!stored && JSON.parse(stored).on === true && JSON.parse(stored).volume === 0.4 && pic.join() === SFX_KEY && !before.local.includes(SFX_KEY), JSON.stringify({ stored, pic }))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(2500)
    if (await page.getByPlaceholder('이름 입력...').isVisible().catch(() => false)) await loginToDashboard(page)
    await openScreen(page)
    r.check(`${name} (sx2) 새로고침 뒤에도 유지: 켜짐 / 볼륨 40 / 저장 값 그대로`, (await T(page, 'pwsfx-root').getAttribute('data-sfx-volume')) === '40' && (await T(page, 'pwsfx-root').getAttribute('data-sfx-on')) === 'true' && (await page.evaluate((k) => localStorage.getItem(k), SFX_KEY)) === stored)
  }, { studentId: TESTER_ONLY })

  // ---- (sx3) 빠른 연속 입력: PC 마우스 + 360x640 터치
  for (const touch of [false, true]) {
    await scenario(`(sx3) 빠른 연속 입력 ${touch ? '터치' : '마우스'}`, touch ? { width: 360, height: 640 } : { width: 1280, height: 800 }, async ({ page, name }) => {
      await openScreen(page)
      await startGame(page, 'phonics', 'hammer')
      const w = await wordWithLetters(page, 4)
      const letters = wordLetters(w)
      const used = [], ids = []
      for (let k = 0; k < 4; k++) { const t = await tileFor(page, letters[k], used); used.push(t.id); ids.push(t.id) }
      if (touch) await T(page, ids[0]).evaluate((e) => e.parentElement.parentElement.scrollIntoView({ block: 'center' }))
      const boxes = []
      for (const id of ids) boxes.push(await T(page, id).boundingBox())
      const inView = boxes.every((b) => b && b.y >= 0 && b.y + b.height <= (touch ? 640 : 800))
      await resetFx(page)
      const t0 = Date.now()
      for (const b of boxes) { const x = b.x + b.width / 2, y = b.y + b.height / 2; if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y) }
      const elapsed = Date.now() - t0
      await sleep(500)
      const filled = await bits(page)
      const cells = [...w.en]
      const expect = cells.map((ch, i) => (isLetter(ch) ? (cells.slice(0, i).filter(isLetter).length < 4 ? '1' : '0') : '1')).join('')
      const fb = await T(page, 'pwh-feedback').getAttribute('data-result').catch(() => null)
      const starts = (await osc(page)).length
      r.check(`${name} (sx3) 4번 연속 탭(${elapsed}ms, 모두 화면 안=${inView}) → 칸 정확히 4개가 순서대로 채워짐, 틀림 0(피드백 right)`, filled === expect && (fb === 'right') && inView, JSON.stringify({ filled, expect, fb }))
      r.check(`${name} (sx3) 소리 시작 ≥ 4 (${starts}) — 빠른 탭에도 소리가 빠지지 않음`, starts >= 4)
    }, { studentId: TESTER_ONLY, hasTouch: touch })
  }

  // ---- (sx4) 틀린 탭 애니메이션: 클래스가 나타났다 400ms 안에 사라지고, 타일은 계속 누를 수 있다
  await scenario('(sx4) 틀린 탭 흔들림', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await startGame(page, 'phonics', 'hammer')
    const w = await shownWord(page, 'pwh-picture')
    const letters = wordLetters(w)
    const bad = (await tiles(page)).find((x) => lc(x.t) !== lc(letters[0]))
    if (!bad) throw new Error('no wrong tile')
    await resetFx(page)
    await T(page, bad.id).click()
    await sleep(700)
    const fx1 = await page.evaluate(() => window.__fx.shake)
    r.check(`${name} (sx4) 틀린 타일에 흔들림 클래스(pw-shake)가 나타났다가 400ms 안에 사라짐`, fx1.length === 1 && fx1[0].off != null && fx1[0].off - fx1[0].on <= 400, JSON.stringify(fx1))
    r.check(`${name} (sx4) 흔들린 뒤에도 타일은 활성 상태이고 다시 누르면 같은 안내`, (await T(page, bad.id).isEnabled()))
    await T(page, bad.id).click()
    await sleep(700)
    const fx2 = await page.evaluate(() => window.__fx.shake.length)
    r.check(`${name} (sx4) 같은 타일을 다시 눌러도 다시 흔들림 + 칸 변화 없음`, fx2 === 2 && !(await bits(page)).includes('1') && fx2 === 2, String(fx2))
    await hammerWord(page, w)
    r.check(`${name} (sx4) 이어서 정답으로 끝까지 진행`, (await T(page, 'pwh-root').getAttribute('data-done')) === 'true')
  }, { studentId: TESTER_ONLY })

  // ---- (rm) 동작 줄이기: 날아가기/반짝이/빛 없음, 완성되고 소리는 설정대로 난다
  await scenario('(rm) 동작 줄이기', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await startGame(page, 'phonics', 'hammer')
    const w = await shownWord(page, 'pwh-picture')
    await resetFx(page)
    await hammerWord(page, w, { wrongFirst: true })
    await T(page, 'pwh-word').waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForFunction(() => window.__speakT.length >= 1, null, { timeout: 4000 }).catch(() => {})
    await sleep(700)
    const st = await page.evaluate(() => ({ fx: window.__fx, osc: window.__osc.length, hammer: document.querySelectorAll('[data-testid="pwh-hammer"]').length }))
    r.check(`${name} (rm) 동작 줄이기: pwh-fly 0 / 반짝이 0 / 빛 0 / 흔들림 0 / 망치 휘두름 0`, st.fx.flyMax === 0 && st.fx.sparkMax === 0 && st.fx.glow.length === 0 && st.fx.shake.length === 0 && st.hammer === 0, JSON.stringify(st.fx))
    r.check(`${name} (rm) 동작 줄이기에서도 완성되고(단어 공개) 소리는 그대로 난다 (${st.osc})`, (await T(page, 'pwh-word').textContent()) === w.en && st.osc >= 4)
  }, { studentId: TESTER_ONLY, reduced: true })

  // ---- (d1) 디자인: 3개 화면 크기 x (알파벳 망치, 숨은 글자, 연습 카드, 시험 문제)
  for (const vp of [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await scenario('(d1) 디자인', vp, async ({ page, name }) => {
      const minTile = vp.width <= 360 ? 47.9 : 55.9
      const covered = (loc) => loc.evaluate((el) => { el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(top === el || el.contains(top)) })
      const cardInfo = (picId) => page.evaluate((id) => {
        const img = document.querySelector(`[data-testid="${id}"]`), card = img.closest('.pw-card'), cs = getComputedStyle(card)
        const inner = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        return { border: cs.borderTopColor, radius: parseFloat(cs.borderTopLeftRadius), ratio: img.getBoundingClientRect().width / inner, imgW: img.getBoundingClientRect().width, cropped: getComputedStyle(img).objectFit !== 'contain', bg: cs.backgroundImage.includes('linear-gradient') }
      }, picId)
      const check = async (label, picId, progressId, progressText, tileSel, primary) => {
        const c = await cardInfo(picId)
        const prog = ((await T(page, progressId).textContent()) || '').trim()
        const tl = tileSel ? await page.locator(tileSel).evaluateAll((l) => l.map((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height] })) : []
        let cov = false
        for (const p of primary) if (await covered(T(page, p))) cov = true
        const ov = await overflow(page)
        r.check(`${name} (d1) ${label}: 카드 테두리 #F472B6 / 둥근 모서리 ≥ 12 / 그림 ≥ 70% / 그림 ≤ 384px / contain / 그라데이션 배경`, c.border === 'rgb(244, 114, 182)' && c.radius >= 12 && c.ratio >= 0.7 && c.imgW <= 384 && !c.cropped && c.bg, JSON.stringify(c))
        r.check(`${name} (d1) ${label}: 진행 "${progressText}" + 진행 막대 / 타일 ≥ ${Math.round(minTile + 0.1)}px / 가로 넘침 0 / 주요 버튼 가림 0`, prog.endsWith(progressText) && (await T(page, progressId).locator('.pw-bar-fill').count()) === 1 && tl.every(([w2, h2]) => w2 >= minTile && h2 >= minTile) && ov <= 0 && !cov, JSON.stringify({ prog, small: tl.filter(([w2, h2]) => w2 < minTile || h2 < minTile), ov, cov }))
      }
      await openScreen(page)
      await startGame(page, 'phonics', 'hammer')
      await check('알파벳 망치', 'pwh-picture', 'pwh-progress', '1 / 6', '[data-testid^="pwh-tile-"]', ['pwh-listen', 'pwh-tile-0', 'pwg-quit'])
      await T(page, 'pwg-quit').click()
      await T(page, 'pwp-root').waitFor({ state: 'visible' })
      await startGame(page, 'conversation', 'hidden')
      await check('숨은 글자', 'pwl-picture', 'pwl-progress', '1 / 6', '[data-testid^="pwl-opt-"]', ['pwl-listen', 'pwl-opt-0', 'pwl-opt-3', 'pwg-quit'])
      await T(page, 'pwg-quit').click()
      await T(page, 'pwp-root').waitFor({ state: 'visible' })
      await T(page, 'pwp-start-practice-food').click()
      await T(page, 'pwp-card').waitFor({ state: 'visible', timeout: 10000 })
      await check('연습 카드', 'pwp-picture', 'pwp-progress', '1 / 6', null, ['pwp-listen', 'pwp-rec-record', 'pwp-next'])
      for (let i = 0; i < 6; i++) await T(page, 'pwp-next').click()
      await T(page, 'pwp-go-test').click()
      await T(page, 'pwp-quiz').waitFor({ state: 'visible', timeout: 10000 })
      await check('시험 문제', 'pwp-picture', 'pwp-quiz-progress', '1 / 6', '[data-testid^="pwp-opt-"]', ['pwp-opt-0', 'pwp-opt-3'])
      const sm = await page.locator('button:visible').evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 43.9).length)
      r.check(`${name} (d1) 시험 문제: 작은 버튼(<44px) 0`, sm === 0, String(sm))
    }, { studentId: TESTER_ONLY })
  }

  const okTts = (u) => { try { const x = new URL(typeof u === 'string' ? u : u.url); return x.hostname === 'translate.googleapis.com' && x.pathname === '/translate_tts' && x.searchParams.get('tl') === 'en-GB' } catch { return false } }
  r.check('듣기/발음의 네트워크 폴백은 mock된 translate_tts(tl=en-GB) GET뿐', ttsAll.every(okTts), JSON.stringify(ttsAll.filter((u) => !okTts(u)).slice(0, 2)))
  return { results: r.results, unmockedRequests, mockErrors }
}
