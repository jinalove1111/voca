// tests/e2e/phonicsGames.spec.mjs — PAUL PHONICS(폴 파닉스, 254차 → 255차 43 Unit): 5권 → Unit → 7단계 허브 + Sound Bubble Pop / Word Train / 기존 연습·시험·철자 게임 연결. 네트워크 전체 mock, 저장 0, 보상 0.
// Bubble Pop은 정답 전에 단어가 DOM에 없으므로 어떤 단어인지는 발음 요청(speechSynthesis.speak 텍스트)으로만 알아낸다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { learnableWords } from '../../src/data/pictureWords/index.js'
import { PHONICS_ITEMS } from '../../src/data/phonics/phonicsWords.js'
import { unitWords, learnedPairs, readyWords } from '../../src/utils/phonics/curriculum.js'
import { POSITION_KO } from '../../src/utils/phonics/games.js'

const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)
const storageSnap = (page) => page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))
const SFX_KEY = 'paulEasyVoca_pictureWordSfx'
const POOL = learnableWords()
const WORDS = PHONICS_ITEMS.map((i) => i.word)
const TESTER_ONLY = 'e2e00000-0000-4000-8000-00000000a002'
const GENERAL = 'e2e00000-0000-4000-8000-00000000b001'
const names = (list) => list.map((w) => w.word).sort().join()
const gset = (b, u) => new Set(learnedPairs(b, u).map((p) => p.split('|')[0]))

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
const click = async (page, loc, touch) => {
  // 풍선은 계속 둥실 떠 있어 Playwright의 "안정됨" 대기에 걸리므로 마우스는 force로 누른다(실제 사용자 클릭엔 영향 없음)
  if (!touch) return loc.click({ force: ((await loc.getAttribute('data-testid')) || '').startsWith('pbp-bubble') })
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  const b = await loc.boundingBox()
  return page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
}
const covered = (loc) => loc.evaluate((el) => { el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(top === el || el.contains(top)) })
const speakLen = (page) => page.evaluate(() => window.__speak.length)
const osc = (page) => page.evaluate(() => window.__osc.slice())
const resetFx = (page) => page.evaluate(() => { window.__osc.length = 0; window.__fxReset() })
const smallButtons = (page) => page.locator('button:visible').evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 43.9).length)

// 그림 src(<asset>-<hash8>.webp)로 항목을 찾는다.
async function shownItem(page, picId) {
  await T(page, picId).waitFor({ state: 'visible', timeout: 10000 })
  const src = await T(page, picId).getAttribute('src')
  const base = decodeURIComponent((src || '').split('?')[0].split('/').pop())
  const w = POOL.find((x) => base.startsWith(x.asset + '-') && base.length === x.asset.length + 1 + 8 + 5)
  const it = w && PHONICS_ITEMS.find((x) => x.id === w.id)
  if (!it) throw new Error(`cannot map picture src ${src}`)
  return it
}
const leakState = (page, root, item) => page.evaluate(({ root, item }) => {
  const el = document.querySelector(`[data-testid="${root}"]`)
  const txt = el.innerText.toLowerCase()
  const attrs = [...el.querySelectorAll('*'), el].flatMap((e) => [...e.attributes].map((a) => a.name)).filter((n) => /correct|answer|right|aria-label/i.test(n))
  return { imgs: el.querySelectorAll('img').length, cards: el.querySelectorAll('.pw-card').length, hasWord: txt.includes(item.word), hasKo: !!item.ko && txt.includes(item.ko), attrs }
}, { root, item: { word: item.word, ko: item.ko } })

// ---- 네비게이션(허브 화면)
const hubState = (page) => page.evaluate(() => [1, 2, 3, 4, 5, 6, 7].map((n) => { const e = document.querySelector(`[data-testid="pph-step-${n}"]`); return { st: e && e.getAttribute('data-state'), txt: e ? e.innerText : '' } }))
async function openPhonics(page, touch = false) {
  await click(page, T(page, 'pwg-open-phonics'), touch)
  await T(page, 'pph-main').waitFor({ state: 'visible', timeout: 20000 })
}
async function toUnit(page, book, unit, touch = false) {
  await click(page, T(page, `pph-book-${book}`), touch)
  await T(page, 'pph-book').waitFor({ state: 'visible', timeout: 5000 })
  await click(page, T(page, `pph-unit-${unit}`), touch)
  await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
}

// ---- Sound Bubble Pop 한 항목
const bubbleList = (page) => page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent, tried: e.getAttribute('data-tried'), dis: e.disabled })))
// 아직 누르지 않은 풍선은 글자 외에 아무 것도 다르지 않아야 한다(색 클래스 pw-cN 제외).
const untriedSig = (page) => page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => l.filter((e) => e.getAttribute('data-tried') === 'false').map((e) => JSON.stringify({
  attrs: [...e.attributes].map((a) => a.name).filter((n) => n !== 'data-testid').sort(), cls: e.className.replace(/pw-c\d/, '').replace(/\s+/g, ' ').trim(), style: e.getAttribute('style'), dis: e.disabled,
  wrapCls: e.parentElement.className,
})))
async function bubbleItem(page, i, { words, allowed = null, vowelOnly = false, touch = false, wrongFirst = false, hint = false, probe = false, autoFrom = null } = {}) {
  const info = {}
  if ((await T(page, 'pbp-root').getAttribute('data-item-index')) !== String(i)) throw new Error(`bubble index ${i}`)
  const mark = info.mark = await speakLen(page)
  if (autoFrom !== null) { // 자동 재생은 마운트 직후라, 다음 버튼을 누르기 전의 길이(autoFrom)와 비교한다
    await page.waitForFunction((m) => window.__speak.length > m, autoFrom, { timeout: 3000 }).catch(() => {})
    info.auto = (await speakLen(page)) > autoFrom
  }
  if (i === 0) { await sleep(600); info.noAuto = (await speakLen(page)) === mark }
  const before = await speakLen(page)
  await click(page, T(page, 'pbp-listen'), touch)
  await page.waitForFunction((m) => window.__speak.length > m, before, { timeout: 4000 })
  const spoken = await page.evaluate(() => window.__speak.slice())
  const word = spoken[spoken.length - 1]
  const item = PHONICS_ITEMS.find((x) => x.word === word)
  if (!item) throw new Error(`spoken text is not a whole phonics word: ${JSON.stringify(spoken.slice(-3))}`)
  const uw = words.find((x) => x.id === item.id)
  info.item = item
  info.inUnit = !!uw
  if (!uw) return info
  const tg = info.tg = uw.graphemes[uw.targetIndex]
  const pos = uw.targetIndex === 0 ? 'initial' : uw.targetIndex === uw.graphemes.length - 1 ? 'final' : 'medial'
  info.pos = (await T(page, 'pbp-root').getAttribute('data-position')) === pos && ((await T(page, 'pbp-root').innerText()) || '').includes(`잘 듣고 ${POSITION_KO[pos]} 소리 풍선을 터뜨려요`)
  const L0 = await leakState(page, 'pbp-root', item)
  info.leak0 = L0.imgs === 0 && L0.cards === 0 && !L0.hasWord && !L0.hasKo && L0.attrs.length === 0 && (await T(page, 'pbp-word').count()) === 0 && (await T(page, 'pbp-ko').count()) === 0
  const bs = await bubbleList(page)
  const nOpt = uw.optionPairs ? 2 : 4
  info.opts = bs.length === nOpt && new Set(bs.map((b) => b.t)).size === nOpt && bs.filter((b) => b.t === tg).length === 1 && bs.every((b) => b.t === b.t.toLowerCase())
    && (!vowelOnly || bs.every((b) => 'aeiou'.includes(b.t))) && (!allowed || bs.every((b) => allowed.has(b.t)))
  if (hint) {
    await T(page, 'pbp-hint').click()
    await T(page, 'pbp-reveal').waitFor({ state: 'visible', timeout: 3000 })
    info.hint = (await T(page, 'pbp-word').textContent()) === item.word && (await T(page, 'pbp-hint').count()) === 0 && (await T(page, 'pbp-root').getAttribute('data-done')) === 'false'
  }
  if (wrongFirst) {
    const bad = bs.find((b) => b.t !== tg)
    const sigBefore = await untriedSig(page)
    await click(page, T(page, bad.id), touch)
    await T(page, 'pbp-feedback').waitFor({ state: 'visible', timeout: 3000 })
    const sig = await untriedSig(page)
    const L = await leakState(page, 'pbp-root', item)
    const b2 = (await bubbleList(page)).find((b) => b.id === bad.id)
    info.wrong = (await T(page, 'pbp-feedback').getAttribute('data-result')) === 'wrong' && ((await T(page, 'pbp-feedback').textContent()) || '').includes('다시 들어 볼까요?') && b2.tried === 'true' && b2.dis === true
    info.sameSig = sig.length === nOpt - 1 && new Set(sig).size === 1 && sigBefore.length === nOpt && new Set(sigBefore).size === 1
    info.leak1 = L.imgs === 0 && L.cards === 0 && !L.hasWord && !L.hasKo && L.attrs.filter((n) => /correct|answer/i.test(n)).length === 0 && (await T(page, 'pbp-word').count()) === 0
    info.wrongCount = await T(page, 'pbp-root').getAttribute('data-wrong')
    if (probe) info.pulse = await page.locator('[data-testid="pbp-listen"].pbp-pulse').count() === 1
  }
  await resetFx(page)
  const t0 = await page.evaluate(() => performance.now())
  await page.evaluate(() => { window.__speakT.length = 0 })
  const good = (await bubbleList(page)).find((b) => b.t === tg)
  await click(page, T(page, good.id), touch)
  await T(page, 'pbp-next').waitFor({ state: 'visible', timeout: 3000 })
  info.popClass = await T(page, good.id).evaluate((e) => e.classList.contains('pbp-pop'))
  // 그림이 있는 단어는 카드 1개 + 뜻, 그림 없는 단어는 <img>·카드 0개이고 뜻은 있을 때만
  info.card = (await T(page, 'pbp-reveal').locator('.pw-card').count()) === (item.picture ? 1 : 0) && (await T(page, 'pbp-reveal').locator('img').count()) === (item.picture ? 1 : 0) && (await T(page, 'pbp-word').textContent()) === item.word
    && ((await T(page, 'pbp-ko').count()) === (item.ko ? 1 : 0)) && (!item.ko || (await T(page, 'pbp-ko').textContent()) === item.ko) && (item.picture || (await T(page, 'pbp-root').locator('img').count()) === 0)
  info.hl = await T(page, 'pbp-word').evaluate((e) => [...e.querySelectorAll('[data-hl]')].map((x) => x.textContent).join(''))
  info.hlOk = info.hl === tg.replace('_', '')
  await page.waitForFunction(() => window.__speakT.length >= 1, null, { timeout: 4000 }).catch(() => {})
  info.speakDelay = (await page.evaluate(() => window.__speakT[0])) - t0
  const o = await osc(page)
  info.osc = o.length
  info.popHz = o.some((x) => Math.round(x.f) === 880)
  info.rightHz = o.some((x) => Math.round(x.f) === 660)
  return info
}
// 세션 전체: n개를 풀고 요약까지. 한 항목씩 배열로 돌려준다.
async function bubbleSession(page, words, n, opts = {}) {
  const out = []
  let preNext = 0
  for (let i = 0; i < n; i++) {
    out.push(await bubbleItem(page, i, { words, ...opts, wrongFirst: i === opts.wrongAt, hint: i === opts.hintAt, probe: i === opts.wrongAt, autoFrom: i > 0 ? preNext : null }))
    preNext = await speakLen(page)
    await click(page, T(page, 'pbp-next'), opts.touch)
    await page.waitForFunction(() => !!document.querySelector('[data-testid="pbp-root"], [data-testid="pha-summary"]'), null, { timeout: 5000 })
    if (i < n - 1) await sleep(700) // 이전 발음이 끝나도록 — 다음 문제의 자동 재생과 구분
  }
  await T(page, 'pha-summary').waitFor({ state: 'visible', timeout: 5000 })
  return out
}
const allOk = (infos, key) => infos.every((x) => x[key] === true)

// ---- Word Train 한 항목
const trainTiles = (page) => page.locator('[data-testid^="pwt-tile-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent, used: e.getAttribute('data-used') === 'true' })))
const carsFilled = (page) => page.locator('[data-testid^="pwt-car-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-filled') === 'true' ? '1' : '0').join(''))
async function trainItem(page, i, { allowed = null, touch = false, wrongFirst = false, rapid = false } = {}) {
  const info = {}
  // 그림이 있으면 그림으로, 없으면(듣기 전용 안내) 듣기 버튼이 읽는 단어 전체로 항목을 알아낸다
  const hasPic = (await T(page, 'pwt-picture').count()) > 0
  let item
  if (hasPic) item = await shownItem(page, 'pwt-picture')
  else {
    const before = await speakLen(page)
    await click(page, T(page, 'pwt-listen'), touch)
    await page.waitForFunction((m) => window.__speak.length > m, before, { timeout: 4000 })
    const w = await page.evaluate(() => window.__speak.slice(-1)[0])
    item = PHONICS_ITEMS.find((x) => x.word === w)
    if (!item) throw new Error(`spoken text is not a whole phonics word: ${w}`)
  }
  info.item = item
  info.hasPic = hasPic
  if ((await T(page, 'pwt-root').getAttribute('data-item-index')) !== String(i)) throw new Error(`train index ${i}`)
  const L = await leakState(page, 'pwt-root', item)
  info.leak0 = !L.hasWord && L.attrs.length === 0 && (await T(page, 'pwt-word').count()) === 0 && (await T(page, 'pwt-spelled').count()) === 0
    && (hasPic ? (await T(page, 'pwt-picture').getAttribute('alt')) === '그림' && L.hasKo === !!item.ko : L.imgs === 0 && (await T(page, 'pwt-listen-only').count()) === 1 && ((await T(page, 'pwt-listen-only').textContent()) || '').includes('잘 듣고 소리 블록을 이어 보세요') && (await T(page, 'pwt-ko').count()) === (item.ko ? 1 : 0))
  const ts0 = await trainTiles(page)
  info.tiles = ts0.length === item.graphemes.length + 1 && item.graphemes.every((g) => ts0.some((t) => t.t === g)) && ts0.filter((t) => !item.graphemes.includes(t.t)).length === 1
  info.learnedTiles = !allowed || ts0.every((t) => allowed.has(t.t))
  if (wrongFirst) {
    await resetFx(page)
    const bad = ts0.find((t) => t.t !== item.graphemes[0])
    await click(page, T(page, bad.id), touch)
    await T(page, 'pwt-feedback').waitFor({ state: 'visible', timeout: 3000 })
    info.shake = await page.waitForFunction(() => window.__fx.shake.length > 0, null, { timeout: 1500 }).then(() => true).catch(() => false)
    info.wrong = (await T(page, 'pwt-root').getAttribute('data-wrong')) === '1' && /^0+$/.test(await carsFilled(page)) && ((await T(page, 'pwt-feedback').textContent()) || '').includes('다시 해 볼까요?') && (await T(page, 'pwt-word').count()) === 0
  }
  await resetFx(page)
  const t0 = await page.evaluate(() => performance.now())
  await page.evaluate(() => { window.__speakT.length = 0 })
  const need = item.graphemes
  const order = []
  for (let k = 0; k < need.length; k++) {
    const t = (await trainTiles(page)).find((x) => !x.used && x.t === need[k] && !order.includes(x.id))
    order.push(t.id)
    await click(page, T(page, t.id), touch)
    if (rapid && k === 0) continue // 첫 칸 확인을 기다리지 않고 바로 다음 타일
    await page.waitForFunction(({ k }) => document.querySelector(`[data-testid="pwt-car-${k}"]`)?.getAttribute('data-filled') === 'true', { k }, { timeout: 3000 })
    info.inOrder = (info.inOrder ?? true) && (await carsFilled(page)).startsWith('1'.repeat(k + 1)) && !(await carsFilled(page)).slice(k + 1).includes('1')
    if (k < need.length - 1) info.spelledHidden = (info.spelledHidden ?? true) && (await T(page, 'pwt-spelled').count()) === 0
  }
  await T(page, 'pwt-word').waitFor({ state: 'visible', timeout: 5000 })
  info.word = (await T(page, 'pwt-word').textContent()) === need.join(' · ')
  info.spelled = (await T(page, 'pwt-spelled').textContent()) === item.word
  info.cars = (await page.locator('[data-testid^="pwt-car-"]').evaluateAll((l) => l.map((e) => e.textContent).join('|'))) === need.join('|') && (await carsFilled(page)) === '1'.repeat(need.length)
  info.depart = await T(page, 'pwt-train').evaluate((e) => ({ cls: e.classList.contains('pwt-depart'), dur: getComputedStyle(e).transitionDuration, delay: getComputedStyle(e).transitionDelay }))
  await page.waitForFunction(() => window.__speakT.length >= 1, null, { timeout: 4000 }).catch(() => {})
  const sp = await page.evaluate(() => ({ s: window.__speak.slice(-1)[0], t: window.__speakT[0] }))
  info.speak = sp.s === item.word
  info.speakDelay = sp.t - t0
  const o = await osc(page)
  info.osc = o.length
  return info
}
async function trainSession(page, n, opts = {}) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(await trainItem(page, i, { ...opts, wrongFirst: i === opts.wrongAt, rapid: i === opts.rapidAt }))
    await click(page, T(page, 'pwt-next'), opts.touch)
    await page.waitForFunction(() => !!document.querySelector('[data-testid="pwt-root"], [data-testid="pha-summary"]'), null, { timeout: 5000 })
    await page.waitForFunction((k) => !document.querySelector('[data-testid="pwt-root"]') || document.querySelector('[data-testid="pwt-root"]').getAttribute('data-item-index') === String(k), i + 1, { timeout: 5000 })
  }
  await T(page, 'pha-summary').waitFor({ state: 'visible', timeout: 5000 })
  return out
}
const firstTry = async (page) => ((await T(page, 'pha-first-try').textContent()) || '').replace(/\s/g, '')

export async function run(browser, baseURL) {
  const r = createRecorder('[phonics-games]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsAll = []

  async function scenario(label, vp, body, { studentId = null, hasTouch = false, reduced = false } = {}) {
    const context = await browser.newContext({ viewport: vp, hasTouch, reducedMotion: reduced ? 'reduce' : 'no-preference' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const reqs = []
    page.on('request', (q) => reqs.push({ url: q.url(), method: q.method() }))
    const { unmockedRequests: u, apiCallLog, ttsFallbackRequests } = await installMocks(page, studentId ? { studentId } : {})
    await page.addInitScript(() => {
      window.__speak = []
      window.__speakT = []
      const s = window.speechSynthesis
      if (s) {
        const orig = s.speak.bind(s)
        s.speak = (x) => { if ((x.text || '').trim()) { window.__speak.push(x.text); window.__speakT.push(performance.now()) } return orig(x) }
      }
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
      const blank = () => ({ shake: [], flyMax: 0, float: 0 })
      window.__fx = blank()
      window.__fxReset = () => { window.__fx = blank() }
      let s0 = false
      const tick = () => {
        const t = performance.now(), fx = window.__fx
        const sh = !!document.querySelector('.pw-shake')
        if (sh && !s0) fx.shake.push({ on: t }); s0 = sh
        fx.flyMax = Math.max(fx.flyMax, document.querySelectorAll('[data-testid="pwt-fly"]').length)
        fx.float = Math.max(fx.float, [...document.querySelectorAll('.pbp-float')].filter((e) => getComputedStyle(e).animationName !== 'none').length)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const name = `${label} [${vp.width}x${vp.height}]`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginToDashboard(page)
      const base = await storageSnap(page)
      const mark = reqs.length
      await body({ page, name, reqs })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인/분석 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
      // /api/grant-xp = 로그인 직후 비동기로 나가는 앱 기본 호출(일반 학생 시나리오에도 똑같이 나감) — 이 화면과 무관
      const nonGet = reqs.slice(mark).filter((q) => q.method !== 'GET' && !(() => { try { const p = new URL(q.url).pathname; return LOGIN_WRITES.includes(p) || p === '/api/grant-xp' } catch { return false } })())
      r.check(`${name} 화면 진입 뒤 GET 아닌 요청 0건`, nonGet.length === 0, nonGet.slice(0, 3).map((q) => q.method + ' ' + q.url).join(' | '))
      const after = await storageSnap(page)
      const added = ['local', 'session'].flatMap((w) => after[w].filter((k) => !base[w].includes(k)).map((k) => `${w}:${k}`))
      // paul_easy_sync_meta = 로그인 직후 앱 동기화가 쓰는 기존 키(일반 학생 시나리오에도 똑같이 생김)
      const mine = added.filter((k) => k !== 'local:paul_easy_sync_meta')
      r.check(`${name} 새 저장소 키는 기존 효과음 키뿐(없거나 ${SFX_KEY})`, mine.every((k) => k === `local:${SFX_KEY}`), JSON.stringify(added))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
    ttsAll.push(...ttsFallbackRequests)
  }

  // ---- (a) 책장 → Book 1 → Unit 2 허브 → Sound Bubble Pop → 틀린 소리 복습
  await scenario('(a) Book 1 Unit 2', { width: 1280, height: 800 }, async ({ page, name, reqs }) => {
    await openScreen(page)
    r.check(`${name} 진입 전에는 파닉스 청크 요청 0건, 진입 버튼 1개(옛 버튼 없음)`, !reqs.some((q) => /PaulPhonics/.test(q.url)) && (await T(page, 'pwg-open-phonics').isVisible()) && (await T(page, 'pwg-open-phonics').textContent()) === 'PAUL PHONICS (폴 파닉스)' && (await T(page, 'pwg-mode-bubble').count()) === 0 && (await T(page, 'pwg-mode-train').count()) === 0 && (await T(page, 'pha-entry').count()) === 0)
    await openPhonics(page)
    r.check(`${name} 진입하면 파닉스 청크 요청`, reqs.some((q) => /PaulPhonics/.test(q.url)))
    const main = (await T(page, 'pph-main').innerText()) || ''
    r.check(`${name} 책장: 제목 + 임시 구성 안내 + 5권 표지(제목 영/한)`, main.includes('PAUL PHONICS · 폴 파닉스') && ((await T(page, 'pph-draft-notice').textContent()) || '').includes('기본 구조만 승인된 임시 교육과정입니다 — 단어·소리·그림·녹음은 승인 전입니다')
      && (await page.locator('[data-testid^="pph-book-b"]').count()) === 5, main)
    const covers = []
    for (const [b, en, ko, nu] of [['b1', 'Short Vowels', '단모음', 5], ['b2', 'Single Consonants', '단자음', 7], ['b3', 'Long Vowels', '장모음', 6], ['b4', 'Consonant Teams', '이중자음', 11], ['b5', 'Vowel Teams', '모음 조합 및 확장 음가', 14]]) {
      const t = (await T(page, `pph-book-${b}`).innerText()) || ''
      covers.push(t.includes(en) && t.includes(ko) && t.includes(`Book ${b.slice(1)}`) && t.includes(`Unit ${nu}개`) && /단어 \d+개/.test(t))
    }
    r.check(`${name} 책 표지 5개: Book 번호·영문·한글 제목·Unit 수(5/7/6/11/14)·단어 수`, covers.every(Boolean), JSON.stringify(covers))
    await T(page, 'pph-book-b1').click()
    await T(page, 'pph-book').waitFor({ state: 'visible', timeout: 5000 })
    const u1 = await page.locator('[data-testid^="pph-unit-u"]:not([data-testid$="-badge"]):not([data-testid$="-count"]):not([data-testid$="-media"])').count()
    const badges = await page.locator('[data-testid$="-badge"]').evaluateAll((l) => l.map((e) => e.textContent))
    r.check(`${name} Book 1: Unit 5개 + Book 전체 연습, 전부 "임시" 배지, 단어 수 표시`, u1 === 5 && (await T(page, 'pph-unit-review').count()) === 1 && badges.length === 6 && badges.every((b) => b === '임시') && ((await T(page, 'pph-unit-u2-count').textContent()) === '단어 5개') && ((await T(page, 'pph-unit-u1-count').textContent()) === '단어 5개') && ((await T(page, 'pph-unit-u2-media').textContent()) === '그림 3 · 듣기 2') && (await page.locator('[data-testid="pph-unit-difficulty"]').count()) === 5, JSON.stringify(badges))
    await T(page, 'pph-unit-u2').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    const words = unitWords('b1', 'u2')
    r.check(`${name} Unit 2 허브: data-book/unit, 임시 배지, 단어 5개`, (await T(page, 'pph-unit').getAttribute('data-book')) === 'b1' && (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u2' && (await T(page, 'pph-unit-status').textContent()) === '임시' && (await T(page, 'pph-unit-words').textContent()) === '단어 5개' && words.length === 5 && ((await T(page, 'pph-unit-objective').textContent()) || '').includes('모음') && ((await T(page, 'pph-unit-prereq').textContent()) || '').includes('Book 1 Unit 1'))
    const st = await hubState(page)
    r.check(`${name} 7단계 순서대로: 1·2 잠김("선생님 녹음 준비 중" — 소리 하나는 TTS로 읽지 않음), 3·4 준비됨(그림 3개), 5 잠김("Book 2부터"), 6 잠김(그림 4개 미만), 7 잠김("틀린 소리가 없어요")`,
      st.map((x) => x.st).join() === 'locked,locked,ready,ready,locked,locked,locked' && st[5].txt.includes('4개 이상일 때 열려요') && st[0].txt.includes('선생님 녹음 준비 중') && st[1].txt.includes('선생님 녹음 준비 중') && st[4].txt.includes('Book 2부터') && st[6].txt.includes('틀린 소리가 없어요') && st[3].txt.includes('Sound Bubble Pop') && st[4].txt.includes('Word Train') && st[5].txt.includes('Unit Test'), JSON.stringify(st.map((x) => x.st)))
    r.check(`${name} 소리 듣기: 모든 소리가 잠금 상태이고 오디오/녹음 컨트롤 0개 + 발음 요청 0건`, (await T(page, 'pph-phoneme').count()) === 1 && (await page.locator('[data-testid="pph-phoneme"][data-state="locked"]').count()) === 1 && (await T(page, 'pph-clip-audio').count()) === 0 && (await speakLen(page)) === 0)
    r.check(`${name} Book 1은 Bubble Pop 전용이라 철자 게임 버튼 없음 + 진행 요약은 아직 비어 있음(data-records=0)`, (await T(page, 'pph-extra-hammer').count()) === 0 && (await T(page, 'pph-extra-hidden').count()) === 0 && (await T(page, 'pph-progress').getAttribute('data-records')) === '0' && !((await T(page, 'pph-progress').innerText()) || '').includes('다시 볼 소리'))

    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} Bubble Pop: 기본 연습 모드 + 힌트 + SfxControl + "잘 듣고 … 소리 풍선" 안내`, (await T(page, 'pbp-mode').getAttribute('data-mode')) === 'practice' && (await T(page, 'pbp-hint').count()) === 1 && (await T(page, 'pwsfx-root').count()) === 1 && /잘 듣고 (첫|가운데|끝) 소리 풍선을 터뜨려요/.test((await T(page, 'pbp-root').innerText()) || ''))
    await T(page, 'pbp-mode-challenge').click()
    r.check(`${name} 도전 모드: 힌트 버튼이 마운트되지 않음`, (await T(page, 'pbp-mode').getAttribute('data-mode')) === 'challenge' && (await T(page, 'pbp-hint').count()) === 0)
    await T(page, 'pbp-mode-practice').click()
    const infos = await bubbleSession(page, words, 5, { vowelOnly: true, wrongAt: 0, hintAt: 1 })
    const seen = infos.map((x) => x.item)
    r.check(`${name} 5항목 모두 Unit 2의 단어, 서로 다름 (${seen.map((x) => x.word)})`, infos.every((x) => x.inUnit) && new Set(seen.map((x) => x.id)).size === 5 && names(seen) === names(words))
    r.check(`${name} 모든 풍선은 단모음 글자(a e i o u)뿐이고 정답 1개 포함·서로 다른 소문자 4개`, allOk(infos, 'opts'), JSON.stringify(infos.map((x) => x.opts)))
    r.check(`${name} 안내 문구/data-position이 단어 속 소리 위치(첫/가운데/끝)와 일치`, allOk(infos, 'pos'), JSON.stringify(infos.map((x) => [x.item.word, x.pos])))
    r.check(`${name} 첫 문제 자동 재생 없음, 정답 전 그림·단어·뜻 0개`, infos[0].noAuto === true && allOk(infos, 'leak0'))
    r.check(`${name} 오답: 풍선 비활성+data-tried, "다시 들어 볼까요?", pulse, 안 누른 풍선 3개 동일, 정답 전 공개 0`, infos[0].wrong && infos[0].pulse && infos[0].sameSig && infos[0].leak1, JSON.stringify(infos[0]))
    r.check(`${name} 힌트: 그림+단어 공개, 버튼 사라짐, 아직 완료 아님`, infos[1].hint === true)
    r.check(`${name} 정답: pop 클래스 + 카드 공개 + 목표 글자("e" 등) 강조(data-hl) + pop/right 효과음, 발음은 정답 후 ≥ 300ms`, infos.every((x) => x.popClass && x.card && x.hlOk && x.osc >= 2 && x.popHz && x.rightHz && x.speakDelay >= 300 && x.speakDelay < 2500), JSON.stringify(infos.map((x) => [x.popClass, x.card, x.hl, x.osc, Math.round(x.speakDelay)])))
    r.check(`${name} 항목 2~4: 이전 듣기 이후 자동 재생`, infos.slice(1).every((x) => x.auto === true))
    r.check(`${name} 요약: 3 / 5(오답 1 + 힌트 1 제외), data-records=5, 버튼 2개`, (await firstTry(page)) === '3/5' && (await T(page, 'pha-summary').getAttribute('data-records')) === '5' && (await T(page, 'pha-again').count()) + (await T(page, 'pha-exit').count()) === 2, await T(page, 'pha-summary').innerText())
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 세션에서 돌아오면 같은 Unit 허브(data-unit=u2)`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u2' && (await T(page, 'pph-unit').getAttribute('data-book')) === 'b1')
    const st2 = await hubState(page)
    const prog = (await T(page, 'pph-progress').innerText()) || ''
    r.check(`${name} 틀린 단어가 생기면 7단계가 준비됨(다시 볼 단어 2개) + "다시 볼 소리" 요약, data-records=5`, st2[6].st === 'ready' && st2[6].txt.includes('다시 볼 단어 2개') && prog.includes('다시 볼 소리') && prog.includes('/e/') && (await T(page, 'pph-progress').getAttribute('data-records')) === '5', JSON.stringify([st2[6], prog]))
    await T(page, 'pph-step-7-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 복습 세션: step=review, 항목은 놓친 2개뿐`, (await T(page, 'pha-root').getAttribute('data-step')) === 'review')
    const missedWords = [infos[0].item.word, infos[1].item.word].sort().join()
    const rev = await bubbleSession(page, words, 2, { vowelOnly: true })
    r.check(`${name} 복습 항목 = 틀린 단어 2개와 정확히 일치 (${rev.map((x) => x.item.word)})`, rev.map((x) => x.item.word).sort().join() === missedWords && allOk(rev, 'opts') && (await firstTry(page)) === '2/2' && (await T(page, 'pha-summary').getAttribute('data-records')) === '2')
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    const st3 = await hubState(page)
    const prog3 = (await T(page, 'pph-progress').innerText()) || ''
    r.check(`${name} 복습에서 모두 맞히면 7단계는 다시 잠기고 "다시 볼 소리"가 사라짐(data-records=7)`, st3[6].st === 'locked' && st3[6].txt.includes('틀린 소리가 없어요') && !prog3.includes('다시 볼 소리') && (await T(page, 'pph-progress').getAttribute('data-records')) === '7', JSON.stringify([st3[6], prog3]))
    await T(page, 'pph-back').click()
    await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click()
    await T(page, 'pph-main').waitFor({ state: 'visible' })
    await T(page, 'pph-exit').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 나가기 → 그림 단어 선택 화면(진입 버튼 다시 보임)`, await T(page, 'pwg-open-phonics').isVisible())
    await T(page, 'pwp-exit').click()
    await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 10000 })
  }, { studentId: TESTER_ONLY })

  // ---- (b) Book 2 Unit 3: Word Train 전체 세션 + Bubble Pop(익힌 글자 안에서만) + 단어 3개 → 시험 잠김
  await scenario('(b) Book 2 Unit 3', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    await toUnit(page, 'b2', 'u3')
    const words = unitWords('b2', 'u3')
    const allowed = gset('b2', 'u3')
    const st = await hubState(page)
    r.check(`${name} Unit 3 단어 5개(${names(words)}), 3·4·5 준비됨(그림 1개), 6 잠김("4개 이상일 때 열려요")`, words.length === 5 && st[2].st === 'ready' && st[3].st === 'ready' && st[4].st === 'ready' && st[5].st === 'locked' && st[5].txt.includes('4개 이상일 때 열려요') && (await T(page, 'pph-step-6-go').isDisabled()), JSON.stringify(st.map((x) => x.st)))
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} Word Train 시작만으로는 발음 재생 없음 + 목표 문구/SfxControl`, (await speakLen(page)) === 0 && (await T(page, 'pwsfx-root').count()) === 1 && ((await T(page, 'pwt-root').innerText()) || '').includes('소리 블록을 차례로 이어 보세요'))
    const tr = await trainSession(page, 5, { allowed, wrongAt: 0, rapidAt: 1 })
    r.check(`${name} Word Train 5항목 = Unit 단어 전체(${tr.map((x) => x.item.word)})`, names(tr.map((x) => x.item)) === names(words))
    r.check(`${name} 모든 타일(방해 타일 포함)이 익힌 글자 안에서만 나옴`, allOk(tr, 'learnedTiles') && allOk(tr, 'tiles'))
    r.check(`${name} 완성 전 철자 0개·정답 속성 0·alt 그림(그림 없는 단어는 듣기 전용 안내), 완성 뒤에만 단어 + 철자, 칸 내용=자소`, allOk(tr, 'leak0') && allOk(tr, 'word') && allOk(tr, 'spelled') && allOk(tr, 'cars') && tr.every((x) => x.inOrder !== false && x.spelledHidden !== false), JSON.stringify(tr.map((x) => [x.leak0, x.word, x.spelled, x.cars])))
    r.check(`${name} 오답 타일: 흔들림 + 오답 1 + "다시 해 볼까요?" + 칸 변화 없음`, tr[0].shake && tr[0].wrong, JSON.stringify(tr[0]))
    r.check(`${name} 기차 출발 클래스, 전환 ≤ 900ms, 성공음 후 발음 ≥ 300ms`, tr.every((x) => x.depart.cls && x.depart.dur.startsWith('0.6s') && x.depart.delay.startsWith('0.25s') && x.speak && x.speakDelay >= 300 && x.osc >= 2), JSON.stringify(tr.map((x) => [x.depart, x.speak, Math.round(x.speakDelay)])))
    r.check(`${name} 요약: 4 / 5(오답 1 제외), data-records=5`, (await firstTry(page)) === '4/5' && (await T(page, 'pha-summary').getAttribute('data-records')) === '5', await T(page, 'pha-summary').innerText())
    await T(page, 'pha-again').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 다시 하기 → 1번째 항목, 완성 상태 초기화`, (await T(page, 'pwt-root').getAttribute('data-item-index')) === '0' && (await T(page, 'pwt-root').getAttribute('data-done')) === 'false')
    await T(page, 'pha-quit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 그만하기 → 같은 Unit 허브`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u3' && (await T(page, 'pph-unit').getAttribute('data-book')) === 'b2')
    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const infos = await bubbleSession(page, words, 5, { allowed })
    r.check(`${name} Bubble Pop 5항목 = Unit 단어 전체, 모든 풍선이 익힌 글자 안에서만, 안내가 위치와 일치`, names(infos.map((x) => x.item)) === names(words) && allOk(infos, 'inUnit') && allOk(infos, 'opts') && allOk(infos, 'pos') && allOk(infos, 'leak0') && infos.every((x) => x.card && x.hlOk), JSON.stringify(infos.map((x) => [x.item.word, x.inUnit, x.opts, x.pos, x.hl])))
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
  }, { studentId: TESTER_ONLY })

  // ---- (c) Book 3 Unit 1: 분리 이중자음(a_e) Word Train
  await scenario('(c) Book 3 Unit 1', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    await toUnit(page, 'b3', 'u1')
    const words = unitWords('b3', 'u1')
    r.check(`${name} Unit 1 단어 = cake, game, gate, name, tape`, names(words) === 'cake,game,gate,name,tape')
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const tr = await trainSession(page, 5, { allowed: gset('b3', 'u1') })
    r.check(`${name} Word Train: a_e는 한 타일, 완성되면 "c · a_e · k"처럼 나눠 보이고 철자 "cake"는 완성 뒤에만`, allOk(tr, 'word') && allOk(tr, 'spelled') && tr.every((x) => x.item.graphemes.includes('a_e') && x.spelledHidden !== false && x.learnedTiles && x.tiles) && tr.some((x) => x.item.word === 'cake'), JSON.stringify(tr.map((x) => [x.item.graphemes.join(' · '), x.word, x.spelled])))
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const infos = await bubbleSession(page, words, 5, { allowed: gset('b3', 'u1') })
    r.check(`${name} Bubble Pop: 목표 a_e(가운데 소리), 풍선 중 정답 1개, 공개된 철자에서 a와 e가 강조됨`, allOk(infos, 'inUnit') && allOk(infos, 'opts') && allOk(infos, 'pos') && infos.every((x) => x.tg === 'a_e' && x.hl === 'ae' && x.card), JSON.stringify(infos.map((x) => [x.item.word, x.tg, x.hl])))
  }, { studentId: TESTER_ONLY })

  // ---- (d) Book 1 전체 연습: 시험 · 그림과 단어 → 허브로 복귀 / Book 2 전체 연습: 철자 게임 / 그림 0개 Unit 잠금
  await scenario('(d) 연결된 단계', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    await toUnit(page, 'b1', 'review')
    const words = unitWords('b1', 'review')
    const ready = readyWords(words)
    const ids = new Set(ready.map((w) => w.id))
    const st0 = await hubState(page)
    r.check(`${name} Book 1 전체 연습: 단어 ${words.length}개(그림 ${ready.length}), 3·6단계 준비됨, 철자 게임 버튼 없음(Book 1은 Bubble Pop 전용)`, words.length === 25 && ready.length >= 4 && st0[2].st === 'ready' && st0[5].st === 'ready' && ((await T(page, 'pph-unit-words').textContent()) === '단어 25개') && (await T(page, 'pph-extra-hammer').count()) === 0 && (await T(page, 'pph-extra-hidden').count()) === 0, JSON.stringify(st0.map((x) => x.st)))
    await T(page, 'pph-step-6-go').click()
    await T(page, 'pwp-quiz').waitFor({ state: 'visible', timeout: 10000 })
    let allIn = true
    for (let q = 0; q < 6; q++) {
      const it = await shownItem(page, 'pwp-picture')
      if (!ids.has(it.id)) allIn = false
      const opts = await page.locator('[data-testid^="pwp-opt-"]').evaluateAll((l) => l.map((e) => e.textContent))
      await T(page, `pwp-opt-${opts.indexOf(it.word)}`).click()
      await T(page, 'pwp-next').click()
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pwp-quiz"], [data-testid="pwp-review-card"], [data-testid="pwp-summary"]'), null, { timeout: 5000 })
    }
    r.check(`${name} Unit Test = 기존 그림 시험 화면, 문제 6개의 그림이 모두 그림이 준비된 이 Unit 단어`, allIn)
    await T(page, 'pwp-next').click() // 모두 맞힘 → 결과 보기
    await T(page, 'pwp-summary').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pwp-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 시험을 마치고 나가면 같은 Unit 허브로 돌아옴`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'review' && (await T(page, 'pph-unit').getAttribute('data-book')) === 'b1')

    await T(page, 'pph-step-3-go').click()
    await T(page, 'pwp-card').waitFor({ state: 'visible', timeout: 10000 })
    const w0 = await shownItem(page, 'pwp-picture')
    r.check(`${name} 3단계: 기존 연습 카드(단어 듣기·녹음 컨트롤)가 그림 준비된 단어로 열림`, ids.has(w0.id) && (await T(page, 'pwp-listen').isVisible()) && (await T(page, 'pwp-rec-record').count()) === 1)
    for (let k = 0; k < 6; k++) {
      await T(page, 'pwp-next').click()
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pwp-card"], [data-testid="pwp-end"]'), null, { timeout: 5000 })
    }
    await T(page, 'pwp-end').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pwp-skip').click()
    await T(page, 'pwp-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 연습을 끝내면 같은 Unit 허브로 돌아옴`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'review')

    await T(page, 'pph-back').click()
    await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click()
    await T(page, 'pph-main').waitFor({ state: 'visible' })
    await toUnit(page, 'b2', 'review')
    const ready2 = readyWords(unitWords('b2', 'review'))
    const ids2 = new Set(ready2.map((w) => w.id))
    await T(page, 'pph-extra-hammer').click()
    await T(page, 'pwh-root').waitFor({ state: 'visible', timeout: 10000 })
    const hw = await shownItem(page, 'pwh-picture')
    r.check(`${name} Book 2 전체 연습: 철자 게임(알파벳 망치)이 그림 준비된 단어(${ready2.length}개)로만 열림`, ids2.has(hw.id))
    await T(page, 'pwg-quit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-extra-hidden').click()
    await T(page, 'pwg-quit').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'pwg-quit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 숨은 글자 게임을 그만하면 같은 Unit 허브로 돌아옴`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'review' && (await T(page, 'pph-unit').getAttribute('data-book')) === 'b2')

    await T(page, 'pph-back').click()
    await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click()
    await T(page, 'pph-main').waitFor({ state: 'visible' })
    await toUnit(page, 'b2', 'u1')
    const st = await hubState(page)
    r.check(`${name} 그림 0개 Unit(Book 2 Unit 1): 3·6단계 잠김(안내 문구) + 시작 버튼 비활성 + 철자 게임 버튼 없음, 4·5단계는 준비됨, 1·2단계 잠김`,
      st.map((x) => x.st).join() === 'locked,locked,locked,ready,ready,locked,locked' && st[2].txt.includes('그림이 준비된 단어가 없어요') && st[5].txt.includes('4개 이상일 때 열려요') && (await T(page, 'pph-step-3-go').isDisabled()) && (await T(page, 'pph-step-6-go').isDisabled())
      && (await T(page, 'pph-extra-hammer').count()) === 0 && (await T(page, 'pph-extra-hidden').count()) === 0 && ((await T(page, 'pph-unit-words').textContent()) === '단어 5개'), JSON.stringify(st.map((x) => x.st)))
  }, { studentId: TESTER_ONLY })

  // ---- (j) 43 Unit 구조: Book 4 그룹 / 자음군·겹자음·끝 -er·철자 비교 Unit의 게임 가용성
  await scenario('(j) 43 Unit 구조', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    const counts = []
    const ROWS = '[data-testid^="pph-unit-u"]:not([data-testid$="-badge"]):not([data-testid$="-count"]):not([data-testid$="-media"])'
    for (const [b, nu] of [['b1', 5], ['b2', 7], ['b3', 6], ['b4', 11], ['b5', 14]]) {
      await click(page, T(page, `pph-book-${b}`))
      await T(page, 'pph-book').waitFor({ state: 'visible', timeout: 5000 })
      const rows = await page.locator(ROWS).count()
      const badges = await page.locator('[data-testid$="-badge"]').evaluateAll((l) => l.every((e) => e.textContent === '임시'))
      counts.push(rows === nu && badges)
      if (b === 'b4') {
        const ga = await T(page, 'pph-group-a').locator(ROWS).count()
        const gb = await T(page, 'pph-group-b').locator(ROWS).count()
        r.check(`${name} Book 4: A 글자 둘·소리 하나 7개 / B 자음군 4개 두 묶음, 제목 문구`, ga === 7 && gb === 4 && ((await T(page, 'pph-group-a').innerText()) || '').includes('글자 둘, 소리 하나') && ((await T(page, 'pph-group-b').innerText()) || '').includes('자음군'))
      }
      await T(page, 'pph-back').click()
      await T(page, 'pph-main').waitFor({ state: 'visible' })
    }
    r.check(`${name} Unit 수 5/7/6/11/14 + 전부 "임시" 배지`, counts.every(Boolean), JSON.stringify(counts))

    // 자음군 Unit(Book 4 Unit 8): Bubble Pop 잠김(이유) + Word Train 가능, 타일은 낱글자
    await toUnit(page, 'b4', 'u8')
    const stC = await hubState(page)
    r.check(`${name} 자음군 Unit: 1·2 잠김, 4 잠김("이 Unit은 Word Train으로 연습해요"), 5 준비됨`, stC[0].st === 'locked' && stC[1].st === 'locked' && stC[3].st === 'locked' && stC[3].txt.includes('이 Unit은 Word Train으로 연습해요') && stC[4].st === 'ready' && (await T(page, 'pph-step-4-go').isDisabled()) && ((await T(page, 'pph-unit-objective').textContent()) || '').includes('자음군'), JSON.stringify(stC.map((x) => x.st)))
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const trC = await trainSession(page, 5, { allowed: gset('b4', 'u8') })
    const CL = new Set(['bl', 'cl', 'fl', 'gl', 'pl', 'sl'])
    r.check(`${name} 자음군 Word Train: 5항목 Unit 단어, 타일은 자음군 묶음이 아닌 낱글자(bl·cl·fl 등 타일 0)`, names(trC.map((x) => x.item)) === names(unitWords('b4', 'u8')) && trC.every((x) => x.tiles && x.learnedTiles && x.item.graphemes.every((g) => !CL.has(g))) && allOk(trC, 'word') && allOk(trC, 'spelled'), JSON.stringify(trC.map((x) => [x.item.word, x.tiles])))
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click(); await T(page, 'pph-main').waitFor({ state: 'visible' })

    // Book 2 Unit 6(겹자음 + ck 보조): Bubble 잠김, Word Train에 sock
    await toUnit(page, 'b2', 'u6')
    const w6 = unitWords('b2', 'u6')
    const st6 = await hubState(page)
    r.check(`${name} Book 2 Unit 6: sock·duck 포함 7단어, 목표 줄에 ck(미리 만나요), Bubble 잠김, Word Train 준비됨`, w6.length === 7 && w6.some((w) => w.word === 'sock') && ((await T(page, 'pph-unit').innerText()) || '').includes('ck (미리 만나요)') && st6[3].st === 'locked' && st6[3].txt.includes('이 Unit은 Word Train으로 연습해요') && st6[4].st === 'ready' && st6[2].st === 'ready' && st6[5].st === 'locked', JSON.stringify(st6.map((x) => x.st)))
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const tr6 = await trainSession(page, 6, { allowed: gset('b2', 'u6') })
    r.check(`${name} Book 2 Unit 6 Word Train: 6항목 모두 Unit 단어, 중복 없음, 겹자음·ck는 한 타일`, tr6.every((x) => w6.some((w) => w.id === x.item.id)) && new Set(tr6.map((x) => x.item.id)).size === 6 && allOk(tr6, 'tiles') && allOk(tr6, 'word') && allOk(tr6, 'spelled'), JSON.stringify(tr6.map((x) => x.item.word)))
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click(); await T(page, 'pph-main').waitFor({ state: 'visible' })

    // Book 5: Unit 7(oo /uː/)과 Unit 8(oo /ʊ/)은 따로, Unit 12는 철자 게임만, Unit 14는 Word Train
    await toUnit(page, 'b5', 'u7')
    const t7 = (await T(page, 'pph-unit').innerText()) || ''
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-unit-u8').click(); await T(page, 'pph-unit').waitFor({ state: 'visible' })
    const t8 = (await T(page, 'pph-unit').innerText()) || ''
    r.check(`${name} Book 5 Unit 7 = oo /uː/ (+ou 예외), Unit 8 = oo /ʊ/ 로 따로 있음`, t7.includes('oo /uː/') && t7.includes('ou /uː/') && t8.includes('oo /ʊ/') && !t8.includes('oo /uː/') && (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u8')
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-unit-u12').click(); await T(page, 'pph-unit').waitFor({ state: 'visible' })
    const st12 = await hubState(page)
    r.check(`${name} Book 5 Unit 12(끝 -er): Bubble·Word Train 잠김("철자 게임으로 연습해요"), 철자 게임 2개, 그림 4개라 6단계 준비됨, 1·2 잠김`, st12[3].st === 'locked' && st12[4].st === 'locked' && st12[3].txt.includes('철자 게임으로 연습해요') && st12[4].txt.includes('철자 게임으로 연습해요') && st12[5].st === 'ready' && st12[0].st === 'locked' && st12[1].st === 'locked' && (await T(page, 'pph-extra-hammer').isVisible()) && (await T(page, 'pph-extra-hidden').isVisible()), JSON.stringify(st12.map((x) => x.st)))
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-unit-u14').click(); await T(page, 'pph-unit').waitFor({ state: 'visible' })
    const st14 = await hubState(page)
    r.check(`${name} Book 5 Unit 14(같은 철자, 다른 소리): Bubble 잠김, Word Train 준비됨, 목표 줄에 철자 비교, 소리 구별 복습`, st14[3].st === 'locked' && st14[4].st === 'ready' && ((await T(page, 'pph-unit').innerText()) || '').includes('ow snow/cow') && ((await T(page, 'pph-unit-objective').textContent()) || '').includes('소리 구별 복습'))
  }, { studentId: TESTER_ONLY })

  // ---- (k) 그림 없는 단어: Book 2 Unit 1(그림 0개)의 Bubble Pop · Word Train 전체 세션
  await scenario('(k) 그림 없는 단어', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    await toUnit(page, 'b2', 'u1')
    const words = unitWords('b2', 'u1')
    const allowed = gset('b2', 'u1')
    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const infos = await bubbleSession(page, words, 5, { allowed, wrongAt: 0, hintAt: 1 })
    r.check(`${name} 그림 없는 Bubble Pop 5항목: Unit 단어 전체, 풍선은 익힌 글자뿐, 정답 전 단어·뜻 공개 0, 정답 뒤 단어만(그림·뜻 없음, <img> 0)`, names(infos.map((x) => x.item)) === names(words) && allOk(infos, 'inUnit') && allOk(infos, 'opts') && allOk(infos, 'pos') && allOk(infos, 'leak0') && infos.every((x) => x.card && x.hlOk), JSON.stringify(infos.map((x) => [x.item.word, x.inUnit, x.opts, x.card, x.hl])))
    r.check(`${name} 그림 없는 Bubble Pop: 힌트는 단어만 공개하고 <img> 0, 오답 흐름 정상, 요약 3 / 5`, infos[0].wrong && infos[0].sameSig && infos[1].hint === true && (await firstTry(page)) === '3/5' && (await T(page, 'pha-summary').locator('img').count()) === 0)
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const tr = await trainSession(page, 5, { allowed, wrongAt: 0 })
    r.check(`${name} 그림 없는 Word Train 5항목: 듣기 전용 안내("잘 듣고 소리 블록을 이어 보세요"), <img> 0, 뜻 없음, 완성 뒤 단어·철자`, names(tr.map((x) => x.item)) === names(words) && tr.every((x) => x.hasPic === false) && allOk(tr, 'leak0') && allOk(tr, 'tiles') && allOk(tr, 'learnedTiles') && allOk(tr, 'word') && allOk(tr, 'spelled') && allOk(tr, 'cars'), JSON.stringify(tr.map((x) => [x.item.word, x.hasPic, x.leak0])))
    r.check(`${name} 그림 없는 Word Train: 오답 흔들림 + 요약 4 / 5, 발음은 단어 전체`, tr[0].shake && tr[0].wrong && tr.every((x) => x.speak) && (await firstTry(page)) === '4/5', JSON.stringify(tr[0]))
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    const st = await hubState(page)
    r.check(`${name} 그림 없는 Unit 허브: 1·2 잠김(녹음 준비 중), 3·6 잠김`, st[0].st === 'locked' && st[1].st === 'locked' && st[0].txt.includes('선생님 녹음 준비 중') && st[2].st === 'locked' && st[5].st === 'locked' && (await T(page, 'pph-clip-audio').count()) === 0)
  }, { studentId: TESTER_ONLY })

  // ---- (e) 360x640 터치: 책장 → Book → Unit → Bubble Pop
  await scenario('(e) 모바일 터치', { width: 360, height: 640 }, async ({ page, name }) => {
    await openScreen(page)
    r.check(`${name} 선택 화면 가로 넘침 0, 진입 버튼 44px 이상`, (await overflow(page)) <= 0 && (await T(page, 'pwg-open-phonics').evaluate((e) => e.getBoundingClientRect().height >= 43.9)))
    await openPhonics(page, true)
    r.check(`${name} 책장: 가로 넘침 0, 작은 버튼 0, 책 5개 표지 높이 ≥ 96px`, (await overflow(page)) <= 0 && (await smallButtons(page)) === 0 && (await page.locator('[data-testid^="pph-book-b"]').evaluateAll((l) => l.length === 5 && l.every((e) => e.getBoundingClientRect().height >= 95.9))))
    await click(page, T(page, 'pph-book-b1'), true)
    await T(page, 'pph-book').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} Book: 가로 넘침 0, 작은 버튼 0`, (await overflow(page)) <= 0 && (await smallButtons(page)) === 0)
    await click(page, T(page, 'pph-unit-u2'), true)
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    let cov = false
    for (const n of [3, 4, 6]) if (await covered(T(page, `pph-step-${n}-go`))) cov = true
    r.check(`${name} 허브: 가로 넘침 0, 작은 버튼 0, 시작 버튼 가림 0`, (await overflow(page)) <= 0 && (await smallButtons(page)) === 0 && !cov, `${await overflow(page)}/${cov}`)
    await click(page, T(page, 'pph-step-4-go'), true)
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    cov = false
    for (const id of ['pbp-listen', 'pbp-bubble-0', 'pbp-bubble-1', 'pbp-bubble-2', 'pbp-bubble-3', 'pha-quit']) if (await covered(T(page, id))) cov = true
    r.check(`${name} Bubble Pop: 넘침 0 / 가림 0 / 풍선 ≥ 96px / 작은 버튼 0`, (await overflow(page)) <= 0 && !cov && (await page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().width >= 95.9 && e.getBoundingClientRect().height >= 95.9))) && (await smallButtons(page)) === 0, `${await overflow(page)}/${cov}`)
    const b = await bubbleItem(page, 0, { words: unitWords('b1', 'u2'), vowelOnly: true, touch: true, wrongFirst: true })
    r.check(`${name} 터치로 오답 → 정답: 공개는 정답 뒤에만, 안 누른 풍선 동일, 다음 버튼 가림 0`, b.wrong && b.sameSig && b.leak0 && b.opts && b.card && !(await covered(T(page, 'pbp-next'))) && (await overflow(page)) <= 0, JSON.stringify({ ...b, item: b.item.word }))
    await click(page, T(page, 'pha-quit'), true)
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 터치로 그만하기 → 같은 Unit 허브`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u2')
  }, { studentId: TESTER_ONLY, hasTouch: true })

  // ---- (f) 3개 화면 크기 레이아웃: 책장 / Book / 허브
  for (const vp of [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await scenario('(f) 레이아웃', vp, async ({ page, name }) => {
      await openScreen(page)
      await openPhonics(page)
      const shots = {}
      const probe = async (key, ids) => {
        let cov = false
        for (const id of ids) if (await covered(T(page, id))) cov = true
        shots[key] = { ov: await overflow(page), small: await smallButtons(page), cov }
      }
      await probe('main', ['pph-book-b1', 'pph-book-b5', 'pph-exit'])
      const cards = await page.locator('[data-testid^="pph-book-b"]').evaluateAll((l) => l.map((e) => { const b = e.getBoundingClientRect(); return { r: b.right, w: b.width, t: b.top, l: b.left, bt: b.bottom } }))
      const noOverlap = cards.every((a, i) => cards.every((b, j) => i === j || a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.bt <= b.t + 0.5 || b.bt <= a.t + 0.5))
      await T(page, 'pph-book-b2').click()
      await T(page, 'pph-book').waitFor({ state: 'visible' })
      await probe('book', ['pph-unit-u1', 'pph-unit-u4', 'pph-unit-review', 'pph-back'])
      await T(page, 'pph-unit-u1').click()
      await T(page, 'pph-unit').waitFor({ state: 'visible' })
      await probe('hub', ['pph-step-3-go', 'pph-step-4-go', 'pph-step-5-go', 'pph-back'])
      const card = await T(page, 'pph-step-3').evaluate((e) => { const cs = getComputedStyle(e); return { radius: parseFloat(cs.borderTopLeftRadius), w: e.getBoundingClientRect().width } })
      r.check(`${name} 허브 단계 카드: 둥근 모서리 + 화면 안(너비 ≤ ${vp.width})`, card.radius >= 12 && card.w <= vp.width)
      await T(page, 'pph-back').click()
      await T(page, 'pph-book').waitFor({ state: 'visible' })
      await T(page, 'pph-back').click()
      await T(page, 'pph-main').waitFor({ state: 'visible' })
      await T(page, 'pph-book-b4').click()
      await T(page, 'pph-book').waitFor({ state: 'visible' })
      await probe('book4', ['pph-unit-u1', 'pph-unit-u8', 'pph-unit-u11', 'pph-unit-review', 'pph-back'])
      const bad = Object.entries(shots).filter(([, v]) => v.ov > 0 || v.small > 0 || v.cov)
      r.check(`${name} 책장·Book·허브·Book 4(11 Unit 두 묶음): 가로 넘침 0, 44px 미만 버튼 0, 컨트롤 가림 0, 표지끼리 겹침 0`, bad.length === 0 && noOverlap, JSON.stringify({ shots, noOverlap }))
    }, { studentId: TESTER_ONLY })
  }

  // ---- (g) 소리 끔: 효과음 시작 0, 발음은 그대로
  await scenario('(g) 소리 끔', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await T(page, 'pwsfx-toggle').click()
    await openPhonics(page)
    await toUnit(page, 'b2', 'u3')
    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 소리 컨트롤이 꺼짐 상태로 이어짐`, (await T(page, 'pwsfx-root').getAttribute('data-sfx-on')) === 'false')
    await resetFx(page)
    const b = await bubbleItem(page, 0, { words: unitWords('b2', 'u3'), wrongFirst: true })
    r.check(`${name} Bubble Pop 오답+정답 동안 오실레이터 시작 0 (${b.osc})`, b.osc === 0 && (await osc(page)).length === 0)
    await T(page, 'pbp-next').click()
    await sleep(300)
    await T(page, 'pha-quit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible' })
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    await resetFx(page)
    const t = await trainItem(page, 0, { wrongFirst: true })
    r.check(`${name} Word Train 오답+완성 동안 오실레이터 시작 0 (${t.osc}), 단어 발음은 즉시 난다`, t.osc === 0 && (await osc(page)).length === 0 && t.speak)
  }, { studentId: TESTER_ONLY })

  // ---- (h) 동작 줄이기
  await scenario('(h) 동작 줄이기', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    await toUnit(page, 'b2', 'u3')
    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const b = await bubbleItem(page, 0, { words: unitWords('b2', 'u3'), wrongFirst: true })
    const fx1 = await page.evaluate(() => ({ float: document.querySelectorAll('.pbp-float').length, wobble: document.querySelectorAll('.pbp-wobble').length, glow: document.querySelectorAll('.pw-glow').length, fx: window.__fx }))
    r.check(`${name} Bubble Pop: 둥둥 float/흔들림/빛 0 이어도 완료되고 공개됨(소리는 설정대로, ${b.osc})`, fx1.float === 0 && fx1.wobble === 0 && fx1.glow === 0 && fx1.fx.float === 0 && b.card && b.wrong && b.osc >= 2, JSON.stringify(fx1))
    await T(page, 'pha-quit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible' })
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const t = await trainItem(page, 0, { wrongFirst: true })
    const fx2 = await page.evaluate(() => ({ fx: window.__fx, depart: getComputedStyle(document.querySelector('[data-testid="pwt-train"]')).transitionDuration, tf: getComputedStyle(document.querySelector('[data-testid="pwt-train"]')).transform }))
    r.check(`${name} Word Train: 날아가기 0 / 흔들림 0 / 출발 전환 없음 이어도 완성되고 단어 공개(소리 ${t.osc})`, fx2.fx.flyMax === 0 && fx2.fx.shake.length === 0 && /^0s/.test(fx2.depart) && t.word && t.cars && t.osc >= 2, JSON.stringify(fx2))
  }, { studentId: TESTER_ONLY, reduced: true })

  // ---- (i) 일반 학생
  await scenario('(i) 일반 학생', { width: 1280, height: 800 }, async ({ page, name, reqs }) => {
    await sleep(1000)
    r.check(`${name} 그림 단어 진입 없음 / 파닉스 버튼·화면 마운트 0`, (await T(page, 'dash-picture-words').count()) === 0 && (await T(page, 'pwg-open-phonics').count()) === 0 && (await T(page, 'pph-root').count()) === 0 && (await T(page, 'pbp-root').count()) === 0 && (await T(page, 'pwt-root').count()) === 0)
    const chunk = reqs.filter((q) => /PictureWordPractice|PictureGames|PaulPhonics|PhonicsAdventure/i.test(q.url))
    r.check(`${name} 연습/게임/파닉스 청크 요청 0건`, chunk.length === 0, chunk.slice(0, 2).map((q) => q.url).join(','))
  }, { studentId: GENERAL })

  const ttsOk = (u) => { try { const x = new URL(typeof u === 'string' ? u : u.url); return x.hostname === 'translate.googleapis.com' && x.pathname === '/translate_tts' && x.searchParams.get('tl') === 'en-GB' && WORDS.includes(x.searchParams.get('q')) } catch { return false } }
  r.check(`음성 네트워크 폴백은 translate_tts GET(tl=en-GB)뿐이고 q는 항상 단어 전체(글자/소리 단독 0) — ${ttsAll.length}건`, ttsAll.length > 0 && ttsAll.every(ttsOk), JSON.stringify(ttsAll.filter((u) => !ttsOk(u)).slice(0, 3)))
  return { results: r.results, unmockedRequests, mockErrors }
}
