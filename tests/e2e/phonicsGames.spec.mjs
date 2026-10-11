// tests/e2e/phonicsGames.spec.mjs — 파닉스 어드벤처 시제품(253차: Sound Bubble Pop / Word Train). 네트워크 전체 mock, 저장 0, 보상 0.
// Bubble Pop은 정답 전에 단어가 DOM에 없으므로 어떤 단어인지는 발음 요청(speechSynthesis.speak 텍스트)으로만 알아낸다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { learnableWords } from '../../src/data/pictureWords/index.js'
import { PHONICS_ITEMS } from '../../src/data/phonics/phonicsWords.js'

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
  return { imgs: el.querySelectorAll('img').length, cards: el.querySelectorAll('.pw-card').length, hasWord: txt.includes(item.word), hasKo: txt.includes(item.ko), attrs }
}, { root, item: { word: item.word, ko: item.ko } })

// ---- Sound Bubble Pop 한 항목
const bubbleList = (page) => page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent, tried: e.getAttribute('data-tried'), dis: e.disabled })))
// 아직 누르지 않은 풍선은 글자 외에 아무 것도 다르지 않아야 한다(색 클래스 pw-cN 제외).
const untriedSig = (page) => page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => l.filter((e) => e.getAttribute('data-tried') === 'false').map((e) => JSON.stringify({
  attrs: [...e.attributes].map((a) => a.name).filter((n) => n !== 'data-testid').sort(), cls: e.className.replace(/pw-c\d/, '').replace(/\s+/g, ' ').trim(), style: e.getAttribute('style'), dis: e.disabled,
  wrapCls: e.parentElement.className,
})))
async function bubbleItem(page, i, { touch = false, wrongFirst = false, hint = false, probe = false, autoFrom = null } = {}) {
  const info = { wordOk: true }
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
  info.item = item
  const L0 = await leakState(page, 'pbp-root', item)
  info.leak0 = L0.imgs === 0 && L0.cards === 0 && !L0.hasWord && !L0.hasKo && L0.attrs.length === 0 && (await T(page, 'pbp-word').count()) === 0 && (await T(page, 'pbp-ko').count()) === 0
  const bs = await bubbleList(page)
  info.opts = bs.length === 4 && new Set(bs.map((b) => b.t)).size === 4 && bs.filter((b) => b.t === item.graphemes[0]).length === 1 && bs.every((b) => b.t === b.t.toLowerCase())
  if (hint) {
    await T(page, 'pbp-hint').click()
    await T(page, 'pbp-reveal').waitFor({ state: 'visible', timeout: 3000 })
    info.hint = (await T(page, 'pbp-word').textContent()) === item.word && (await T(page, 'pbp-hint').count()) === 0 && (await T(page, 'pbp-root').getAttribute('data-done')) === 'false'
  }
  if (wrongFirst) {
    const bad = bs.find((b) => b.t !== item.graphemes[0])
    const sigBefore = await untriedSig(page)
    await click(page, T(page, bad.id), touch)
    await T(page, 'pbp-feedback').waitFor({ state: 'visible', timeout: 3000 })
    const sig = await untriedSig(page)
    const L = await leakState(page, 'pbp-root', item)
    const b2 = (await bubbleList(page)).find((b) => b.id === bad.id)
    info.wrong = (await T(page, 'pbp-feedback').getAttribute('data-result')) === 'wrong' && ((await T(page, 'pbp-feedback').textContent()) || '').includes('다시 들어 볼까요?') && b2.tried === 'true' && b2.dis === true
    info.sameSig = sig.length === 3 && new Set(sig).size === 1 && sigBefore.length === 4 && new Set(sigBefore).size === 1
    info.leak1 = L.imgs === 0 && L.cards === 0 && !L.hasWord && !L.hasKo && L.attrs.filter((n) => /correct|answer/i.test(n)).length === 0 && (await T(page, 'pbp-word').count()) === 0
    info.wrongCount = await T(page, 'pbp-root').getAttribute('data-wrong')
    if (probe) info.pulse = await page.locator('[data-testid="pbp-listen"].pbp-pulse').count() === 1
  }
  await resetFx(page)
  const t0 = await page.evaluate(() => performance.now())
  await page.evaluate(() => { window.__speakT.length = 0 })
  const good = (await bubbleList(page)).find((b) => b.t === item.graphemes[0])
  await click(page, T(page, good.id), touch)
  await T(page, 'pbp-next').waitFor({ state: 'visible', timeout: 3000 })
  info.popClass = await T(page, good.id).evaluate((e) => e.classList.contains('pbp-pop'))
  info.card = (await T(page, 'pbp-reveal').locator('.pw-card').count()) === 1 && (await T(page, 'pbp-word').textContent()) === item.word && (await T(page, 'pbp-ko').textContent()) === item.ko
  info.hl = await T(page, 'pbp-word').evaluate((e) => e.firstElementChild?.textContent)
  await page.waitForFunction(() => window.__speakT.length >= 1, null, { timeout: 4000 }).catch(() => {})
  info.speakDelay = (await page.evaluate(() => window.__speakT[0])) - t0
  const o = await osc(page)
  info.osc = o.length
  info.popHz = o.some((x) => Math.round(x.f) === 880)
  info.rightHz = o.some((x) => Math.round(x.f) === 660)
  return info
}

// ---- Word Train 한 항목
const trainTiles = (page) => page.locator('[data-testid^="pwt-tile-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent, used: e.getAttribute('data-used') === 'true' })))
const carsFilled = (page) => page.locator('[data-testid^="pwt-car-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-filled') === 'true' ? '1' : '0').join(''))
async function trainItem(page, i, { touch = false, wrongFirst = false, rapid = false } = {}) {
  const info = {}
  const item = info.item = await shownItem(page, 'pwt-picture')
  if ((await T(page, 'pwt-root').getAttribute('data-item-index')) !== String(i)) throw new Error(`train index ${i}`)
  const L = await leakState(page, 'pwt-root', item)
  info.leak0 = !L.hasWord && L.attrs.length === 0 && (await T(page, 'pwt-word').count()) === 0 && (await T(page, 'pwt-picture').getAttribute('alt')) === '그림' && L.hasKo
  const ts0 = await trainTiles(page)
  info.tiles = ts0.length === item.graphemes.length + 1 && item.graphemes.every((g) => ts0.some((t) => t.t === g)) && ts0.filter((t) => !item.graphemes.includes(t.t)).length === 1
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
  }
  await T(page, 'pwt-word').waitFor({ state: 'visible', timeout: 5000 })
  info.word = (await T(page, 'pwt-word').textContent()) === need.join(' · ')
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

  // ---- (a) Sound Bubble Pop, PC 마우스, 6항목 세션
  await scenario('(a) Sound Bubble Pop', { width: 1280, height: 800 }, async ({ page, name, reqs }) => {
    await openScreen(page)
    r.check(`${name} 게임을 열기 전에는 파닉스 청크 요청 0건`, !reqs.some((q) => /PhonicsAdventure/.test(q.url)))
    r.check(`${name} 진입: 제목 + 묶음 라벨 + 버튼 2개`, ((await T(page, 'pha-entry').innerText()) || '').includes('Phonics Adventure (시제품)') && ((await T(page, 'pha-entry').innerText()) || '').includes('시제품 묶음 (교재 순서 아님)') && (await T(page, 'pwg-mode-bubble').isVisible()) && (await T(page, 'pwg-mode-train').isVisible()))
    await T(page, 'pwg-mode-bubble').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 게임을 열면 파닉스 청크 요청`, reqs.some((q) => /PhonicsAdventure/.test(q.url)))
    r.check(`${name} 기본 모드 연습 + 힌트 버튼 있음 + SfxControl + 안내 문구`, (await T(page, 'pbp-mode').getAttribute('data-mode')) === 'practice' && (await T(page, 'pbp-hint').count()) === 1 && (await T(page, 'pwsfx-root').count()) === 1 && ((await T(page, 'pbp-root').innerText()) || '').includes('잘 듣고 첫 소리 풍선을 터뜨려요'))
    await T(page, 'pbp-mode-challenge').click()
    r.check(`${name} 도전 모드: 힌트 버튼이 마운트되지 않음`, (await T(page, 'pbp-mode').getAttribute('data-mode')) === 'challenge' && (await T(page, 'pbp-hint').count()) === 0)
    const seen = []
    let preNext = 0
    for (let i = 0; i < 6; i++) {
      if (i === 1) { await T(page, 'pbp-mode-practice').click(); r.check(`${name} 연습으로 되돌리면 힌트 버튼이 다시 나옴`, (await T(page, 'pbp-hint').count()) === 1) }
      const info = await bubbleItem(page, i, { wrongFirst: i === 0, hint: i === 1, probe: i === 0, autoFrom: i > 0 ? preNext : null })
      seen.push(info.item)
      if (i === 0) {
        r.check(`${name} 첫 문제는 자동 재생하지 않음, 듣기 탭 후 단어 전체 발음`, info.noAuto === true)
        r.check(`${name} 첫 문제 답하기 전: 그림·단어·뜻 0개, 정답 속성 0, 풍선 4개 서로 다른 소문자 글자(정답 1개 포함)`, info.leak0 && info.opts, JSON.stringify(info))
        r.check(`${name} 오답: 풍선 비활성+data-tried, "다시 들어 볼까요?", 듣기 버튼 pulse`, info.wrong && info.pulse, JSON.stringify(info))
        r.check(`${name} 오답 뒤: 안 누른 풍선 3개가 클래스/속성/스타일 모두 동일(정답 표시 없음) + 그림/단어 여전히 0`, info.sameSig && info.leak1, JSON.stringify(info))
      } else r.check(`${name} 항목 ${i + 1}: 이전 듣기 이후 다음 문제는 자동 재생 1회 이상`, info.auto === true, JSON.stringify({ mark: info.mark }))
      if (i === 1) r.check(`${name} 연습 힌트: 그림+단어(철자) 공개, 버튼 사라짐, 아직 완료 아님`, info.hint === true)
      r.check(`${name} 항목 ${i + 1}: 정답 → 풍선 pop 클래스 + 카드(그림·단어·뜻) 공개 + 첫 글자 "${info.item.graphemes[0]}" 강조`, info.popClass && info.card && info.hl === info.item.graphemes[0], JSON.stringify({ ...info, item: info.item.word }))
      r.check(`${name} 항목 ${i + 1}: pop(880Hz)+right(660Hz) 효과음, 단어 발음은 정답 후 ≥ 300ms`, info.osc >= 2 && info.popHz && info.rightHz && info.speakDelay >= 300 && info.speakDelay < 2500, `osc=${info.osc} pop=${info.popHz} right=${info.rightHz} delay=${Math.round(info.speakDelay)}`)
      preNext = await speakLen(page)
      await T(page, 'pbp-next').click()
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pbp-root"], [data-testid="pha-summary"]'), null, { timeout: 5000 })
      if (i < 5) await sleep(700) // 이전 발음이 끝나도록 — 다음 문제의 자동 재생과 구분
    }
    r.check(`${name} 6항목 서로 다름`, new Set(seen.map((x) => x.id)).size === 6)
    await T(page, 'pha-summary').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 요약: n / 6 = 4 / 6(오답 1 + 힌트 1 제외), data-records=6, 버튼 3개`, ((await T(page, 'pha-first-try').textContent()) || '').replace(/\s/g, '') === '4/6' && (await T(page, 'pha-summary').getAttribute('data-records')) === '6' && (await T(page, 'pha-again').count()) + (await T(page, 'pha-other').count()) + (await T(page, 'pha-exit').count()) === 3, await T(page, 'pha-summary').innerText())
    await T(page, 'pha-other').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 다른 게임 → Word Train 1 / 6`, ((await T(page, 'pwt-progress').textContent()) || '').replace(/\s/g, '').endsWith('1/6'))
    await T(page, 'pha-quit').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 그만하기 → 선택 화면`, (await T(page, 'pwg-mode-bubble').isVisible()))
    await T(page, 'pwg-mode-bubble').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible' })
    await T(page, 'pha-quit').click()
    await T(page, 'pwp-exit').click()
    await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 10000 })
  }, { studentId: TESTER_ONLY })

  // ---- (b) Word Train, PC 마우스, 6항목 세션
  await scenario('(b) Word Train', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await T(page, 'pwg-mode-train').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 시작만으로는 발음 재생 없음 + 목표 문구/SfxControl`, (await speakLen(page)) === 0 && (await T(page, 'pwsfx-root').count()) === 1 && ((await T(page, 'pwt-root').innerText()) || '').includes('소리 블록을 차례로 이어 보세요'))
    const seen = []
    for (let i = 0; i < 6; i++) {
      const info = await trainItem(page, i, { wrongFirst: i === 0, rapid: i === 1 })
      seen.push(info.item)
      if (i === 0) {
        r.check(`${name} 완성 전: 철자 0개(pwt-word 없음), 정답 속성 0, alt 그림, 뜻 표시, 타일 = 자소 + 방해 1`, info.leak0 && info.tiles, JSON.stringify(info))
        r.check(`${name} 오답 타일: 흔들림 + 오답 카운터 1 + "다시 해 볼까요?" + 칸 변화 없음 + 공개 없음`, info.shake && info.wrong, JSON.stringify(info))
      }
      r.check(`${name} 항목 ${i + 1}: 자소 순서대로 칸이 채워짐 → 단어 "${info.item.graphemes.join(' · ')}" 공개, 칸 내용=자소`, info.inOrder !== false && info.word && info.cars, JSON.stringify(info))
      r.check(`${name} 항목 ${i + 1}: 기차 출발 클래스, 전환 ≤ 900ms(0.6s+0.25s), 성공음 후 발음 ≥ 300ms`, info.depart.cls && info.depart.dur.startsWith('0.6s') && info.depart.delay.startsWith('0.25s') && info.speak && info.speakDelay >= 300 && info.osc >= 2, JSON.stringify({ d: info.depart, speak: info.speak, delay: Math.round(info.speakDelay), osc: info.osc }))
      if (i === 1) r.check(`${name} 빠른 연속 탭: 첫 칸 확인 없이 이어 눌러도 칸이 순서대로 채워짐`, info.word && info.cars)
      await T(page, 'pwt-next').click()
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pwt-root"], [data-testid="pha-summary"]'), null, { timeout: 5000 })
      await page.waitForFunction((n) => !document.querySelector('[data-testid="pwt-root"]') || document.querySelector('[data-testid="pwt-root"]').getAttribute('data-item-index') === String(n), i + 1, { timeout: 5000 })
    }
    r.check(`${name} 6항목 서로 다름`, new Set(seen.map((x) => x.id)).size === 6)
    await T(page, 'pha-summary').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 요약: n / 6 = 5 / 6(오답 1 제외), data-records=6`, ((await T(page, 'pha-first-try').textContent()) || '').replace(/\s/g, '') === '5/6' && (await T(page, 'pha-summary').getAttribute('data-records')) === '6', await T(page, 'pha-summary').innerText())
    await T(page, 'pha-again').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 다시 하기 → 1 / 6, 완성 상태 초기화`, (await T(page, 'pwt-root').getAttribute('data-item-index')) === '0' && (await T(page, 'pwt-root').getAttribute('data-done')) === 'false')
  }, { studentId: TESTER_ONLY })

  // ---- (c) 360x640 터치: 두 게임
  await scenario('(c) 모바일 터치', { width: 360, height: 640 }, async ({ page, name }) => {
    await openScreen(page)
    r.check(`${name} 선택 화면 가로 넘침 0, 진입 버튼 44px 이상`, (await overflow(page)) <= 0 && (await page.locator('[data-testid="pwg-mode-bubble"], [data-testid="pwg-mode-train"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().height >= 43.9))))
    await click(page, T(page, 'pwg-mode-bubble'), true)
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    let cov = false
    for (const id of ['pbp-listen', 'pbp-bubble-0', 'pbp-bubble-1', 'pbp-bubble-2', 'pbp-bubble-3', 'pha-quit']) if (await covered(T(page, id))) cov = true
    r.check(`${name} Bubble Pop: 넘침 0 / 주요 컨트롤 가림 0 / 풍선 ≥ 96px / 작은 버튼(<44px) 0`, (await overflow(page)) <= 0 && !cov && (await page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().width >= 95.9 && e.getBoundingClientRect().height >= 95.9))) && (await page.locator('button:visible').evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 43.9).length)) === 0, `${await overflow(page)}/${cov}`)
    const b = await bubbleItem(page, 0, { touch: true, wrongFirst: true })
    r.check(`${name} 터치로 Bubble Pop 오답 → 정답: 공개는 정답 뒤에만, 안 누른 풍선 동일, 다음 버튼 가림 0`, b.wrong && b.sameSig && b.leak0 && b.card && !(await covered(T(page, 'pbp-next'))) && (await overflow(page)) <= 0, JSON.stringify({ ...b, item: b.item.word }))
    await click(page, T(page, 'pha-quit'), true)
    await T(page, 'pwp-root').waitFor({ state: 'visible' })
    await click(page, T(page, 'pwg-mode-train'), true)
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const tiles0 = await trainTiles(page)
    cov = false
    for (const t of tiles0) if (await covered(T(page, t.id))) cov = true
    for (const id of ['pwt-listen', 'pha-quit']) if (await covered(T(page, id))) cov = true
    r.check(`${name} Word Train: 넘침 0 / 타일·듣기 가림 0 / 타일·칸 ≥ 48px / 기차가 화면 안 / 작은 버튼 0`, (await overflow(page)) <= 0 && !cov
      && (await page.locator('[data-testid^="pwt-tile-"], [data-testid^="pwt-car-"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().width >= 47.9 && e.getBoundingClientRect().height >= 47.9)))
      && (await page.locator('[data-testid^="pwt-car-"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5)))
      && (await page.locator('button:visible').evaluateAll((l) => l.filter((x) => x.getBoundingClientRect().height < 43.9).length)) === 0, `${await overflow(page)}/${cov}`)
    const t = await trainItem(page, 0, { touch: true, wrongFirst: true })
    r.check(`${name} 터치로 Word Train 오답 → 완성, 다음 버튼 가림 0, 넘침 0`, t.wrong && t.word && t.cars && !(await covered(T(page, 'pwt-next'))) && (await overflow(page)) <= 0, JSON.stringify({ ...t, item: t.item.word }))
  }, { studentId: TESTER_ONLY, hasTouch: true })

  // ---- (d) 3개 화면 크기 레이아웃
  for (const vp of [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await scenario('(d) 레이아웃', vp, async ({ page, name }) => {
      const minTile = vp.width <= 360 ? 47.9 : 55.9
      await openScreen(page)
      await T(page, 'pwg-mode-bubble').click()
      await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
      let cov = false
      for (const id of ['pbp-listen', 'pbp-bubble-0', 'pbp-bubble-3', 'pha-quit']) if (await covered(T(page, id))) cov = true
      r.check(`${name} Bubble Pop: 가로 넘침 0 / 풍선 ≥ 96px / 컨트롤 가림 0 / 진행 "1 / 6"+막대 / 팔레트 4색 클래스`, (await overflow(page)) <= 0 && !cov
        && (await page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().width >= 95.9))) && ((await T(page, 'pbp-progress').textContent()) || '').replace(/\s/g, '').endsWith('1/6') && (await T(page, 'pbp-progress').locator('.pw-bar-fill').count()) === 1
        && (await page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => new Set(l.map((e) => (e.className.match(/pw-c\d/) || [''])[0])).size === 4)), String(await overflow(page)))
      await T(page, 'pha-quit').click()
      await T(page, 'pwp-root').waitFor({ state: 'visible' })
      await T(page, 'pwg-mode-train').click()
      await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
      cov = false
      for (const t of await trainTiles(page)) if (await covered(T(page, t.id))) cov = true
      if (await covered(T(page, 'pwt-listen'))) cov = true
      const card = await T(page, 'pwt-picture-card').evaluate((e) => { const cs = getComputedStyle(e); return { border: cs.borderTopColor, radius: parseFloat(cs.borderTopLeftRadius) } })
      r.check(`${name} Word Train: 가로 넘침 0 / 타일·칸 ≥ ${Math.round(minTile + 0.1)}px / 가림 0 / 카드 테두리 #F472B6 + 둥근 모서리 / 진행 "1 / 6"`, (await overflow(page)) <= 0 && !cov
        && (await page.locator('[data-testid^="pwt-tile-"], [data-testid^="pwt-car-"]').evaluateAll((l, m) => l.every((e) => e.getBoundingClientRect().width >= m && e.getBoundingClientRect().height >= m), minTile))
        && card.border === 'rgb(244, 114, 182)' && card.radius >= 12 && ((await T(page, 'pwt-progress').textContent()) || '').replace(/\s/g, '').endsWith('1/6'), JSON.stringify({ ov: await overflow(page), cov, card }))
    }, { studentId: TESTER_ONLY })
  }

  // ---- (e) 소리 끔: 효과음 시작 0, 발음은 설정과 무관하게 그대로
  await scenario('(e) 소리 끔', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await T(page, 'pwsfx-toggle').click()
    await T(page, 'pwg-mode-bubble').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 소리 컨트롤이 꺼짐 상태로 이어짐`, (await T(page, 'pwsfx-root').getAttribute('data-sfx-on')) === 'false')
    await resetFx(page)
    const b = await bubbleItem(page, 0, { wrongFirst: true })
    r.check(`${name} Bubble Pop 오답+정답 동안 오실레이터 시작 0 (${b.osc})`, b.osc === 0 && (await osc(page)).length === 0)
    await T(page, 'pbp-next').click()
    await sleep(300)
    await T(page, 'pha-quit').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible' })
    await T(page, 'pwg-mode-train').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    await resetFx(page)
    const t = await trainItem(page, 0, { wrongFirst: true })
    r.check(`${name} Word Train 오답+완성 동안 오실레이터 시작 0 (${t.osc}), 단어 발음은 즉시 난다`, t.osc === 0 && (await osc(page)).length === 0 && t.speak)
  }, { studentId: TESTER_ONLY })

  // ---- (f) 동작 줄이기
  await scenario('(f) 동작 줄이기', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await T(page, 'pwg-mode-bubble').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const b = await bubbleItem(page, 0, { wrongFirst: true })
    const fx1 = await page.evaluate(() => ({ float: document.querySelectorAll('.pbp-float').length, wobble: document.querySelectorAll('.pbp-wobble').length, glow: document.querySelectorAll('.pw-glow').length, fx: window.__fx }))
    r.check(`${name} Bubble Pop: 둥둥 float/흔들림/빛 0 이어도 완료되고 공개됨(소리는 설정대로, ${b.osc})`, fx1.float === 0 && fx1.wobble === 0 && fx1.glow === 0 && fx1.fx.float === 0 && b.card && b.wrong && b.osc >= 2, JSON.stringify(fx1))
    await T(page, 'pha-quit').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible' })
    await T(page, 'pwg-mode-train').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const t = await trainItem(page, 0, { wrongFirst: true })
    const fx2 = await page.evaluate(() => ({ fx: window.__fx, depart: getComputedStyle(document.querySelector('[data-testid="pwt-train"]')).transitionDuration, tf: getComputedStyle(document.querySelector('[data-testid="pwt-train"]')).transform }))
    r.check(`${name} Word Train: 날아가기 0 / 흔들림 0 / 출발 전환 없음 이어도 완성되고 단어 공개(소리 ${t.osc})`, fx2.fx.flyMax === 0 && fx2.fx.shake.length === 0 && /^0s/.test(fx2.depart) && t.word && t.cars && t.osc >= 2, JSON.stringify(fx2))
  }, { studentId: TESTER_ONLY, reduced: true })

  // ---- (g) 일반 학생
  await scenario('(g) 일반 학생', { width: 1280, height: 800 }, async ({ page, name, reqs }) => {
    await sleep(1000)
    r.check(`${name} 그림 단어 진입 없음 / 파닉스 버튼·화면 마운트 0`, (await T(page, 'dash-picture-words').count()) === 0 && (await T(page, 'pwg-mode-bubble').count()) === 0 && (await T(page, 'pwg-mode-train').count()) === 0 && (await T(page, 'pbp-root').count()) === 0 && (await T(page, 'pwt-root').count()) === 0)
    const chunk = reqs.filter((q) => /PictureWordPractice|PictureGames|PhonicsAdventure/i.test(q.url))
    r.check(`${name} 연습/게임/파닉스 청크 요청 0건`, chunk.length === 0, chunk.slice(0, 2).map((q) => q.url).join(','))
  }, { studentId: GENERAL })

  const ttsOk = (u) => { try { const x = new URL(typeof u === 'string' ? u : u.url); return x.hostname === 'translate.googleapis.com' && x.pathname === '/translate_tts' && x.searchParams.get('tl') === 'en-GB' && WORDS.includes(x.searchParams.get('q')) } catch { return false } }
  r.check(`음성 네트워크 폴백은 translate_tts GET(tl=en-GB)뿐이고 q는 항상 단어 전체(글자/소리 단독 0) — ${ttsAll.length}건`, ttsAll.length > 0 && ttsAll.every(ttsOk), JSON.stringify(ttsAll.filter((u) => !ttsOk(u)).slice(0, 3)))
  return { results: r.results, unmockedRequests, mockErrors }
}
