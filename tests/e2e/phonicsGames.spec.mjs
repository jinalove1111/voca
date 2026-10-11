// tests/e2e/phonicsGames.spec.mjs — PAUL PHONICS(폴 파닉스, 254차 → 255차 43 Unit → 256차 품질 개선: 풍선 복습 섞기, 기차 출발 고정, Book 1 시험 잠금): 5권 → Unit → 7단계 허브 + Sound Bubble Pop / Word Train / 기존 연습·시험·철자 게임 연결. 네트워크 전체 mock, 저장 0, 보상 0.
// Bubble Pop은 정답 전에 단어가 DOM에 없으므로 어떤 단어인지는 발음 요청(speechSynthesis.speak 텍스트)으로만 알아낸다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { learnableWords } from '../../src/data/pictureWords/index.js'
import { PHONICS_ITEMS, PROPOSED_KO } from '../../src/data/phonics/phonicsWords.js'
import { unitWords, learnedPairs, readyWords, unitContext, bubbleReviewPool } from '../../src/utils/phonics/curriculum.js'
import { POSITION_KO, spellParts } from '../../src/utils/phonics/games.js'
import { BOOKS } from '../../src/data/phonics/curriculum.js'

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
// 풍선 세션의 항목 후보 = 그 Unit의 단어 + 이전 Unit 복습 후보(복습 문제는 자기 Unit의 목표 글자를 가진다)
const bubbleWords = (b, u) => [...unitContext(b, u).words, ...bubbleReviewPool(b, u)]
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
  // 풍선은 계속 둥실 떠 있고 듣기 버튼은 처음 듣기 전까지 맥박(259차)이라 Playwright의 "안정됨" 대기에 걸리므로 마우스는 force로 누른다(실제 사용자 클릭엔 영향 없음)
  if (!touch) return loc.click({ force: /^pbp-(bubble|listen)/.test((await loc.getAttribute('data-testid')) || '') })
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
const hubState = (page) => page.evaluate(() => [1, 2, 3, 4, 5, 6, 7].map((n) => { const e = document.querySelector(`[data-testid="pph-step-${n}"]`); const st = e && e.getAttribute('data-state'); return { st: st === 'next' || st === 'done' ? 'ready' : st, raw: st, txt: e ? e.innerText : '' } }))
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
async function bubbleItem(page, i, { words, allowed = null, vowelOnly = false, touch = false, wrongFirst = false, hint = false, probe = false, autoFrom = null, ctr = null } = {}) {
  const info = {}
  if ((await T(page, 'pbp-root').getAttribute('data-item-index')) !== String(i)) throw new Error(`bubble index ${i}`)
  const mark = info.mark = await speakLen(page)
  if (autoFrom !== null) { // 자동 재생은 마운트 직후라, 다음 버튼을 누르기 전의 길이(autoFrom)와 비교한다
    await page.waitForFunction((m) => window.__speak.length > m, autoFrom, { timeout: 3000 }).catch(() => {})
    info.auto = (await speakLen(page)) > autoFrom
  }
  if (i === 0) {
    await sleep(600)
    info.noAuto = (await speakLen(page)) === mark
    const b0 = await bubbleList(page)
    info.locked = b0.length > 0 && b0.every((b) => b.dis) && (await page.locator('[data-testid="pbp-listen"].pbp-pulse').count()) === 1
  }
  const before = await speakLen(page)
  await click(page, T(page, 'pbp-listen'), touch)
  await page.waitForFunction((m) => window.__speak.length > m, before, { timeout: 4000 })
  const spoken = await page.evaluate(() => window.__speak.slice())
  const word = spoken[spoken.length - 1]
  if (i === 0) info.relabel = ((await T(page, 'pbp-listen').textContent()) || '').includes('다시 듣기') && (await bubbleList(page)).every((b) => !b.dis)
  const item = PHONICS_ITEMS.find((x) => x.word === word)
  if (!item) throw new Error(`spoken text is not a whole phonics word: ${JSON.stringify(spoken.slice(-3))}`)
  const uw = words.find((x) => x.id === item.id)
  info.item = item
  info.inUnit = !!uw
  if (!uw) return info
  info.own = !uw.origin && (!ctr || ctr.own.has(item.id))
  if (ctr && info.own) { const k = ctr.n++; wrongFirst = k === ctr.wrongAt; hint = k === ctr.hintAt; probe = wrongFirst } // wrongAt/hintAt는 "이 Unit 자기 단어" 순서
  info.listenSound = await T(page, 'pbp-listen-sound').count()
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
  // 풍선 칸은 답한 뒤 0.5초에 접힌다 — pop 클래스는 관찰자로 잡아 둔다(느린 기계에서도 흔들리지 않게)
  await page.evaluate((id) => { const el = document.querySelector(`[data-testid="${id}"]`); window.__popSeen = false; new MutationObserver(() => { if (el.classList.contains('pbp-pop')) window.__popSeen = true }).observe(el, { attributes: true, attributeFilter: ['class'] }) }, good.id)
  await click(page, T(page, good.id), touch)
  await T(page, 'pbp-next').waitFor({ state: 'visible', timeout: 3000 })
  info.popClass = await page.evaluate(() => window.__popSeen)
  info.praise = await T(page, 'pbp-feedback').textContent()
  // 그림이 있는 단어는 그림 카드 1개 + 뜻, 그림 없는 단어는 <img> 0개의 글자 카드(pw-card--text) 1개이고 뜻은 있을 때만
  const cardBox = await T(page, 'pbp-reveal').evaluate((el, hasPic) => {
    // 257차: 그림 없는 단어도 같은 pw-card 가족(pw-card--text, 분홍 테두리, "듣기 단어" 태그, <img> 없음); 그림 단어는 정사각 그림 상자(object-fit: contain)
    const c = el.querySelector('.pw-card')
    if (!c) return false
    const text = c.classList.contains('pw-card--text')
    if (hasPic) { const img = c.querySelector('img'); const b = img.getBoundingClientRect(); return !text && Math.abs(b.width - b.height) <= 1 && getComputedStyle(img).objectFit === 'contain' }
    return text && getComputedStyle(c).borderTopColor === 'rgb(244, 114, 182)' && c.textContent.includes('듣기 단어') && !c.querySelector('img') && c.getBoundingClientRect().right <= window.innerWidth + 0.5
  }, !!item.picture)
  info.card = cardBox && (await T(page, 'pbp-reveal').locator('.pw-card').count()) === 1 && (await T(page, 'pbp-reveal').locator('img').count()) === (item.picture ? 1 : 0) && (await T(page, 'pbp-word').textContent()) === item.word
    && ((await T(page, 'pbp-ko').count()) === (item.ko ? 1 : 0)) && (!item.ko || (await T(page, 'pbp-ko').textContent()) === item.ko) && (item.picture || (await T(page, 'pbp-root').locator('img').count()) === 0)
  info.hl = await T(page, 'pbp-word').evaluate((e) => [...e.querySelectorAll('[data-hl]')].map((x) => x.textContent).join(''))
  info.hlOk = info.hl === tg.replace('_', '')
  await page.waitForFunction(() => window.__speakT.length >= 1, null, { timeout: 4000 }).catch(() => {})
  info.speakDelay = (await page.evaluate(() => window.__speakT[0])) - t0
  const o = await osc(page)
  info.osc = o.length
  info.popHz = o.some((x) => Math.round(x.f) === 880)
  info.rightHz = o.some((x) => Math.round(x.f) === 660)
  info.nb = await nextBottom(page)
  return info
}
// 세션 전체: n개를 풀고 요약까지. 한 항목씩 배열로 돌려준다.
async function bubbleSession(page, words, n, opts = {}) {
  const out = []
  let preNext = 0
  const ctr = opts.own ? { n: 0, wrongAt: opts.wrongAt, hintAt: opts.hintAt, own: opts.own } : null
  for (let i = opts.start || 0; i < (n ?? 99); i++) {
    out.push(await bubbleItem(page, i, { words, ...opts, ctr, wrongFirst: !ctr && i === opts.wrongAt, hint: !ctr && i === opts.hintAt, probe: !ctr && i === opts.wrongAt, autoFrom: i > 0 ? preNext : null }))
    preNext = await speakLen(page)
    await click(page, T(page, 'pbp-next'), opts.touch)
    await page.waitForFunction(() => !!document.querySelector('[data-testid="pbp-root"], [data-testid="pha-summary"]'), null, { timeout: 5000 })
    if (!(await T(page, 'pbp-root').count())) break
    await sleep(700) // 이전 발음이 끝나도록 — 다음 문제의 자동 재생과 구분
  }
  await T(page, 'pha-summary').waitFor({ state: 'visible', timeout: 5000 })
  return out
}
const allOk = (infos, key) => infos.every((x) => x[key] === true)

// ---- Word Train 한 항목
const trainTiles = (page) => page.locator('[data-testid^="pwt-tile-"]').evaluateAll((l) => l.map((e) => ({ id: e.getAttribute('data-testid'), t: e.textContent, used: e.getAttribute('data-used') === 'true' })))
const carsFilled = (page) => page.locator('[data-testid^="pwt-car-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-filled') === 'true' ? '1' : '0').join(''))
async function trainItem(page, i, { allowed = null, touch = false, wrongFirst = false, rapid = false, settle = false } = {}) {
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
    && (hasPic ? (await T(page, 'pwt-picture').getAttribute('alt')) === '그림' && L.hasKo === !!item.ko : L.imgs === 0 && (await T(page, 'pwt-text-card').count()) === 1 && (await T(page, 'pwt-text-card').evaluate((c) => c.classList.contains('pw-card--text') && c.textContent.includes('듣기 단어'))) && (await T(page, 'pwt-listen-only').count()) === 1 && ((await T(page, 'pwt-listen-only').textContent()) || '').includes('잘 듣고 소리 블록을 이어 보세요') && (await T(page, 'pwt-ko').count()) === 0) // 그림 없는 단어의 뜻(승인돼 있어도)은 완성 전에는 안 보인다
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
  info.spelledText = await T(page, 'pwt-spelled').textContent()
  info.spelled = info.spelledText === item.display && (item.ko ? (await T(page, 'pwt-ko').textContent()) === item.ko : (await T(page, 'pwt-ko').count()) === 0) // 완성 뒤: 뜻이 있으면 그 뜻 그대로, 없으면 줄 자체가 없음
  info.cars = (await page.locator('[data-testid^="pwt-car-"]').evaluateAll((l) => l.map((e) => e.textContent).join('|'))) === need.join('|') && (await carsFilled(page)) === '1'.repeat(need.length)
  info.depart = await T(page, 'pwt-train').evaluate((e) => { const c = getComputedStyle(e); return { cls: e.classList.contains('pwt-depart'), name: c.animationName, dur: c.animationDuration, delay: c.animationDelay, fill: c.animationFillMode } })
  if (settle) info.btnY0 = await T(page, 'pwt-next').evaluate((e) => e.getBoundingClientRect().top)
  await page.waitForFunction(() => window.__speakT.length >= 1, null, { timeout: 4000 }).catch(() => {})
  const sp = await page.evaluate(() => ({ s: window.__speak.slice(-1)[0], t: window.__speakT[0] }))
  info.speak = sp.s === item.word
  info.speakDelay = sp.t - t0
  const o = await osc(page)
  info.osc = o.length
  if (settle) { // 출발한 기차는 돌아오지 않고, 같은 자리에 완성한 단어(pwt-result)가 남고, 다음 버튼은 움직이지 않는다
    await sleep(1500)
    info.settle = await page.evaluate(() => {
      const tr = document.querySelector('[data-testid="pwt-train"]'), res = document.querySelector('[data-testid="pwt-result"]'), nx = document.querySelector('[data-testid="pwt-next"]')
      const cs = getComputedStyle(tr), tb = tr.getBoundingClientRect(), track = tr.parentElement.getBoundingClientRect()
      return { gone: cs.visibility === 'hidden' || tb.left >= track.right - 1, vis: cs.visibility, resultOpacity: res ? getComputedStyle(res).opacity : null, resultText: res ? [...res.children].map((c) => c.textContent).join('|') : null, btnY1: nx.getBoundingClientRect().top }
    })
    info.settleOk = info.settle.gone && info.settle.resultOpacity === '1' && info.settle.resultText === need.join('|') && Math.abs(info.settle.btnY1 - info.btnY0) <= 8
  }
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
// ---- 259차: Book 1 허브 / 소리 찾기(detect) / 모음 Word Train / 소리 확인
const IPA_RE = /[æɪɒʌəʊʃʒθðŋɑɔɜ]/
const PRAISE = ['좋아요!', '잘 들었어요!', '바로 그 소리예요!']
const OTHER = '다른 소리'
const hub1 = (page) => page.evaluate(() => ({
  chunkTitles: [...document.querySelectorAll('[data-testid^="pph-chunk-"]')].map((c) => c.querySelector('p').textContent),
  rows: [...document.querySelectorAll('[data-testid^="pph-step-"]')].filter((e) => /^pph-step-\d+$/.test(e.getAttribute('data-testid'))).map((e) => ({
    n: Number(e.getAttribute('data-testid').slice(9)), st: e.getAttribute('data-state'), txt: e.innerText, covers: e.getAttribute('data-covers'), btn: e.querySelectorAll('button').length,
    chunk: e.closest('[data-testid^="pph-chunk-"]')?.getAttribute('data-testid') || null,
  })),
}))
const nextBottom = async (page) => { await sleep(650); return T(page, 'pbp-next').evaluate((e) => { const b = e.getBoundingClientRect(); return { bottom: b.bottom, top: b.top, vh: window.innerHeight } }) }
const spokenWord = async (page, listenId, touch) => {
  const before = await speakLen(page)
  await click(page, T(page, listenId), touch)
  await page.waitForFunction((m) => window.__speak.length > m, before, { timeout: 4000 })
  const w = await page.evaluate(() => window.__speak.slice(-1)[0])
  const item = PHONICS_ITEMS.find((x) => x.word === w)
  if (!item) throw new Error(`spoken text is not a whole phonics word: ${w}`)
  return item
}
// Book 1 첫 Unit: 두 풍선 [a, 다른 소리] — 단어에 a가 있으면 a, 없으면 "다른 소리"
async function detectItem(page, i, { touch = false, wrongFirst = false } = {}) {
  const info = {}
  if ((await T(page, 'pbp-root').getAttribute('data-item-index')) !== String(i)) throw new Error(`detect index ${i}`)
  info.attr = (await T(page, 'pbp-root').getAttribute('data-detect')) === 'true'
  if (i === 0) {
    await sleep(500)
    const b0 = await bubbleList(page)
    info.locked = b0.length === 2 && b0.every((b) => b.dis) && (await page.locator('[data-testid="pbp-listen"].pbp-pulse').count()) === 1
  }
  const item = await spokenWord(page, 'pbp-listen', touch)
  info.item = item
  info.has = item.graphemes.includes('a')
  const bs = await bubbleList(page)
  info.opts = bs.length === 2 && bs.map((b) => b.t).sort().join() === ['a', OTHER].sort().join() && (await T(page, 'pbp-bubble-other').count()) === 1 && bs.every((b) => !b.dis)
  info.noHelpers = bs.every((b) => b.t === 'a' || b.t === OTHER)
  const good = bs.find((b) => b.t === (info.has ? 'a' : OTHER))
  const bad = bs.find((b) => b !== good)
  if (wrongFirst) {
    await click(page, T(page, bad.id), touch)
    await T(page, 'pbp-feedback').waitFor({ state: 'visible', timeout: 3000 })
    info.wrong = (await T(page, 'pbp-feedback').getAttribute('data-result')) === 'wrong' && (await T(page, 'pbp-root').getAttribute('data-wrong')) === '1' && (await T(page, 'pbp-word').count()) === 0
  }
  await click(page, T(page, good.id), touch)
  await T(page, 'pbp-next').waitFor({ state: 'visible', timeout: 3000 })
  info.right = (await T(page, 'pbp-feedback').getAttribute('data-result')) === 'right' && (await T(page, 'pbp-word').textContent()) === item.word
  info.nb = await nextBottom(page)
  return info
}
async function detectSession(page, n, opts = {}) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(await detectItem(page, i, { ...opts, wrongFirst: i === opts.wrongAt }))
    await click(page, T(page, 'pbp-next'), opts.touch)
    await page.waitForFunction(() => !!document.querySelector('[data-testid="pbp-root"], [data-testid="pha-summary"]'), null, { timeout: 5000 })
    await sleep(500)
  }
  await T(page, 'pha-summary').waitFor({ state: 'visible', timeout: 5000 })
  return out
}
// Book 1 Word Train: 자음은 회색 도우미 칸, 모음 칸 하나만 비어 있고 타일은 모음 5개
async function vowelTrainItem(page, i, { touch = false, wrongFirst = false } = {}) {
  const info = {}
  if ((await T(page, 'pwt-root').getAttribute('data-item-index')) !== String(i)) throw new Error(`vowel train index ${i}`)
  const item = await spokenWord(page, 'pwt-listen', touch)
  info.item = item
  const vi = item.graphemes.findIndex((g) => 'aeiou'.includes(g))
  const cars = () => page.locator('[data-testid^="pwt-car-"]').evaluateAll((l) => l.map((e) => ({ t: e.textContent, f: e.getAttribute('data-filled'), h: e.getAttribute('data-helper'), grey: e.className.includes('text-gray-400') })))
  const c0 = await cars()
  info.cars = c0.length === item.graphemes.length && c0.every((c, k) => (k === vi ? c.t === '' && c.f === 'false' && c.h === null : c.t === item.graphemes[k] && c.h === 'true' && c.grey)) && c0.filter((c) => c.f === 'false').length === 1
  const ts = await trainTiles(page)
  info.tiles = ts.length === 5 && ts.map((t) => t.t).sort().join('') === 'aeiou'
  info.noReveal = (await T(page, 'pwt-word').count()) === 0 && (await T(page, 'pwt-spelled').count()) === 0
  if (wrongFirst) {
    await resetFx(page)
    const bad = ts.find((t) => t.t !== item.graphemes[vi])
    await click(page, T(page, bad.id), touch)
    await T(page, 'pwt-feedback').waitFor({ state: 'visible', timeout: 3000 })
    info.shake = await page.waitForFunction(() => window.__fx.shake.length > 0, null, { timeout: 1500 }).then(() => true).catch(() => false)
    const c1 = await cars()
    info.wrong = (await T(page, 'pwt-root').getAttribute('data-wrong')) === '1' && c1.filter((c) => c.f === 'false').length === 1 && (await T(page, 'pwt-word').count()) === 0 && (await T(page, 'pwt-result').count()) === 0
  }
  const good = (await trainTiles(page)).find((t) => t.t === item.graphemes[vi])
  await resetFx(page)
  await page.evaluate(() => { window.__speakT.length = 0 })
  await click(page, T(page, good.id), touch)
  await T(page, 'pwt-word').waitFor({ state: 'visible', timeout: 5000 })
  info.word = (await T(page, 'pwt-word').textContent()) === item.graphemes.join(' · ')
  await page.waitForFunction(() => window.__speakT.length >= 1, null, { timeout: 4000 }).catch(() => {})
  info.speak = (await page.evaluate(() => window.__speak.slice(-1)[0])) === item.word
  await sleep(1500)
  info.result = (await T(page, 'pwt-result').evaluate((e) => [...e.children].map((c) => c.textContent).join('|'))) === item.graphemes.join('|')
  info.gone = await T(page, 'pwt-train').evaluate((e) => getComputedStyle(e).visibility === 'hidden')
  info.focus = (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'pwt-next'
  return info
}
async function vowelTrainSession(page, n, opts = {}) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(await vowelTrainItem(page, i, { ...opts, wrongFirst: i === opts.wrongAt }))
    await click(page, T(page, 'pwt-next'), opts.touch)
    await page.waitForFunction(() => !!document.querySelector('[data-testid="pwt-root"], [data-testid="pha-summary"]'), null, { timeout: 5000 })
    await page.waitForFunction((k) => !document.querySelector('[data-testid="pwt-root"]') || document.querySelector('[data-testid="pwt-root"]').getAttribute('data-item-index') === String(k), i + 1, { timeout: 5000 })
  }
  await T(page, 'pha-summary').waitFor({ state: 'visible', timeout: 5000 })
  return out
}
// 소리 확인: 5문제, 힌트 없음, 한 번 고르면 끝(다시 고르기 없음)
async function testItem(page, i, { words, touch = false, pickWrong = false, detect = false } = {}) {
  const info = {}
  if ((await T(page, 'pbp-root').getAttribute('data-item-index')) !== String(i)) throw new Error(`test index ${i}`)
  info.label = ((await T(page, 'pbp-progress').textContent()) || '') === `소리 확인 ${i + 1} / 5`
  info.mode = (await T(page, 'pbp-root').getAttribute('data-mode')) === 'challenge' && (await T(page, 'pbp-hint').count()) === 0
  const item = await spokenWord(page, 'pbp-listen', touch)
  info.item = item
  const uw = detect ? null : words.find((x) => x.id === item.id)
  const expected = detect ? (item.graphemes.includes('a') ? 'a' : OTHER) : uw.graphemes[uw.targetIndex]
  const bs = await bubbleList(page)
  const good = bs.find((b) => b.t === expected)
  const bad = bs.find((b) => b !== good)
  info.opts = !!good && bs.every((b) => !b.dis)
  await click(page, T(page, pickWrong ? bad.id : good.id), touch)
  await T(page, 'pbp-next').waitFor({ state: 'visible', timeout: 3000 })
  info.once = (await T(page, 'pbp-root').getAttribute('data-done')) === 'true' && (await T(page, 'pbp-root').getAttribute('data-wrong')) === (pickWrong ? '1' : '0')
    && (await T(page, 'pbp-feedback').getAttribute('data-result')) === (pickWrong ? 'wrong' : 'right') && (await T(page, 'pbp-word').textContent()) === item.word
  await sleep(650)
  info.collapsed = (await page.locator('[data-testid^="pbp-bubble-"]').count()) === 0 // 한 번 고른 뒤에는 풍선 칸이 접힌다(다시 고를 수 없다)
  return info
}
async function testSessionRun(page, words, opts = {}) {
  const out = []
  for (let i = 0; i < 5; i++) {
    out.push(await testItem(page, i, { words, ...opts, pickWrong: [].concat(opts.wrongAt).includes(i) }))
    await click(page, T(page, 'pbp-next'), opts.touch)
    await page.waitForFunction(() => !!document.querySelector('[data-testid="pbp-root"], [data-testid="pha-summary"]'), null, { timeout: 5000 })
    await sleep(500)
  }
  await T(page, 'pha-summary').waitFor({ state: 'visible', timeout: 5000 })
  return out
}
const firstTry = async (page) => ((await T(page, 'pha-first-try').getAttribute('data-score')) || '').replace(/\s/g, '')

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

  // ---- (a) 책장 → Book 1 → Unit 2 허브(10단계·3묶음) → 소개·갤러리·연습 → Sound Bubble Pop → 틀린 소리 복습
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
    const hubTxt = (await T(page, 'pph-unit').innerText()) || ''
    r.check(`${name} Unit 2 허브: data-book/unit, book1 배치, 임시 배지(작게), 큰 글자 e, 단어 5개, 먼저 배운 것 줄 없음, 발음 기호 0`, (await T(page, 'pph-unit').getAttribute('data-book')) === 'b1' && (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u2' && (await T(page, 'pph-unit').getAttribute('data-layout')) === 'book1' && (await T(page, 'pph-unit-status').textContent()) === '임시' && (await T(page, 'pph-unit-words').textContent()) === '단어 5개' && words.length === 5 && ((await T(page, 'pph-unit-objective').textContent()) || '').includes('모음') && (await T(page, 'pph-unit-prereq').count()) === 0 && (await T(page, 'pph-unit-target').textContent()) === 'e' && !IPA_RE.test(hubTxt), hubTxt.slice(0, 200))
    const h = await hub1(page)
    const byN = Object.fromEntries(h.rows.map((x) => [x.n, x]))
    r.check(`${name} 10단계가 3묶음(만나요 1·2 / 말해요 3–5·6 / 놀아요 7·8·9·10)으로 보이고 3–5는 한 줄(data-covers=3,4,5)`, h.rows.map((x) => x.n).join() === '1,2,3,6,7,8,9,10' && byN[1].chunk === 'pph-chunk-1' && byN[2].chunk === 'pph-chunk-1' && byN[3].chunk === 'pph-chunk-2' && byN[6].chunk === 'pph-chunk-2' && [7, 8, 9, 10].every((n) => byN[n].chunk === 'pph-chunk-3') && byN[3].covers === '3,4,5' && ['만나요', '말해요', '놀아요'].every((t, k) => h.chunkTitles[k] === t), JSON.stringify(h.rows.map((x) => [x.n, x.chunk])))
    r.check(`${name} 처음에는 next가 정확히 1개(1단계 "시작하기"), 2 잠김, 3·6·7·8·9 준비됨, 10 잠김("게임을 하면 열려요")`, h.rows.filter((x) => x.st === 'next').map((x) => x.n).join() === '1' && byN[2].st === 'locked' && [3, 6, 7, 8, 9].every((n) => byN[n].st === 'ready') && byN[10].st === 'locked' && byN[10].txt.includes('게임을 하면 열려요') && ((await T(page, 'pph-step-1-go').textContent()) || '').trim() === '시작하기' && ((await T(page, 'pph-step-7-go').textContent()) || '').trim() === '하기', JSON.stringify(h.rows.map((x) => [x.n, x.st])))
    r.check(`${name} 2단계: 조용한 한 줄 "선생님 목소리는 곧 만나요", 버튼·오디오 0, 발음 요청 0건 / 3–5 "단어로 따라 말해요" / 6 "읽기는 Book 2에서" / 잠긴 행에 비활성 버튼 0`, byN[2].txt.includes('선생님 목소리는 곧 만나요') && byN[2].btn === 0 && (await T(page, 'pph-clip-audio').count()) === 0 && (await T(page, 'pph-phoneme').count()) === 0 && (await speakLen(page)) === 0 && byN[3].txt.includes('단어로 따라 말해요') && byN[6].txt.includes('읽기는 Book 2에서') && (await page.locator('[data-testid="pph-unit"] button:disabled').count()) === 0)
    r.check(`${name} 소리 찾기 표시: 7·8·9단계에만 "소리 찾기" 3개, Book 1은 철자 게임 버튼 없음, 진행 요약은 비어 있음(data-records=0)`, (await T(page, 'pph-skill').count()) === 3 && (await T(page, 'pph-skill').first().textContent()) === '소리 찾기' && (await T(page, 'pph-step-7').locator('[data-testid="pph-skill"]').count()) === 1 && (await T(page, 'pph-extra-hammer').count()) === 0 && (await T(page, 'pph-extra-hidden').count()) === 0 && (await T(page, 'pph-progress').getAttribute('data-records')) === '0')

    // 1단계: 소개 카드
    await T(page, 'pph-step-1-go').click()
    await T(page, 'pph-intro').waitFor({ state: 'visible', timeout: 3000 })
    const keyWordsExpected = [...words].sort((a, b) => (b.image === 'ready') - (a.image === 'ready')).slice(0, 2)
    const introWords = await T(page, 'pph-intro-word').evaluateAll((l) => l.map((e) => ({ pic: e.getAttribute('data-picture'), imgs: e.querySelectorAll('img').length, txt: e.innerText })))
    const sp0 = await speakLen(page)
    await T(page, 'pph-intro-play').first().click()
    await page.waitForFunction((m) => window.__speak.length > m, sp0, { timeout: 4000 })
    const spokenIntro = await page.evaluate(() => window.__speak.slice(-1)[0])
    r.check(`${name} 소개 카드: 큰 글자 e + 핵심 단어 2개(그림 있으면 그림 카드) + 입 모양 한 줄(pph-tip), 🔊는 단어 전체만 읽음 (${spokenIntro})`, (await T(page, 'pph-intro-letter').textContent()) === 'e' && introWords.length === 2 && introWords.every((x, k) => x.pic === (keyWordsExpected[k].image === 'ready' ? 'true' : 'false') && x.imgs === (keyWordsExpected[k].image === 'ready' ? 1 : 0)) && ((await T(page, 'pph-tip').textContent()) || '') === BOOKS[0].units[1].intro.tipKo && keyWordsExpected.some((w) => w.word === spokenIntro) && !IPA_RE.test((await T(page, 'pph-intro').innerText()) || ''), JSON.stringify(introWords))
    const h1 = await hub1(page)
    r.check(`${name} 소개를 열면 1단계에 "오늘 했어요" 표시(저장·완료라는 말 없음)가 붙고 next가 3단계로 옮겨감`, h1.rows.find((x) => x.n === 1).st === 'done' && ((await T(page, 'pph-step-1-done').textContent()) || '').includes('오늘 했어요') && h1.rows.filter((x) => x.st === 'next').map((x) => x.n).join() === '3' && !/완료|저장/.test((await T(page, 'pph-unit').innerText()) || ''), JSON.stringify(h1.rows.map((x) => [x.n, x.st])))

    // 6단계: 그림과 단어 갤러리
    await T(page, 'pph-step-6-go').click()
    await T(page, 'pph-gallery').waitFor({ state: 'visible', timeout: 3000 })
    const gal = await T(page, 'pph-gallery-word').evaluateAll((l) => l.map((e) => ({ imgs: e.querySelectorAll('img').length, hl: [...e.querySelectorAll('[data-hl="true"]')].map((x) => x.textContent).join(''), greyOthers: [...e.querySelectorAll('span.font-black > span:not([data-hl])')].every((x) => x.className.includes('text-gray-400')), others: e.querySelectorAll('span.font-black > span:not([data-hl])').length })))
    const sp1 = await speakLen(page)
    await T(page, 'pph-gallery-play').nth(1).click()
    await page.waitForFunction((m) => window.__speak.length > m, sp1, { timeout: 4000 })
    const spokenGal = await page.evaluate(() => window.__speak.slice(-1)[0])
    r.check(`${name} 갤러리: 단어 5개, 모음 e만 강조·자음은 회색, 그림은 승인된 3개뿐, 🔊는 단어 전체 (${spokenGal})`, gal.length === 5 && gal.every((g) => g.hl === 'e' && g.greyOthers && g.others >= 1) && gal.filter((g) => g.imgs === 1).length === 3 && words.some((w) => w.word === spokenGal), JSON.stringify(gal))

    // 3–5단계: 기존 연습 카드(녹음 포함)
    await T(page, 'pph-step-3-go').click()
    await T(page, 'pwp-card').waitFor({ state: 'visible', timeout: 10000 })
    const shown0 = (await T(page, 'pwp-picture').count()) ? await shownItem(page, 'pwp-picture') : null // 263차: 3–5단계는 Unit 단어 5개 전부(그림 없는 단어는 글자 카드)
    r.check(`${name} 3–5단계: 연습 카드가 열리고 단어 듣기·녹음 컨트롤이 있음(그림 또는 글자 카드)`, (await T(page, 'pwp-listen').isVisible()) && (await T(page, 'pwp-rec-record').count()) === 1 && (shown0 ? readyWords(words).some((w) => w.id === shown0.id) : (await T(page, 'pwp-text-card').count()) === 1))
    for (let k = 0; k < 8 && !(await T(page, 'pwp-end').count()); k++) {
      await T(page, 'pwp-next').click()
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pwp-card"], [data-testid="pwp-end"]'), null, { timeout: 5000 })
    }
    await T(page, 'pwp-end').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pwp-skip').click()
    await T(page, 'pwp-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    const h2 = await hub1(page)
    r.check(`${name} 소개·3–5·갤러리를 하고 돌아오면 세 줄에 "오늘 했어요", next는 7단계(Sound Bubble Pop)`, [1, 3, 6].every((n) => h2.rows.find((x) => x.n === n).st === 'done') && h2.rows.filter((x) => x.st === 'next').map((x) => x.n).join() === '7' && (await page.locator('[data-testid$="-done"]').count()) === 3, JSON.stringify(h2.rows.map((x) => [x.n, x.st])))

    await T(page, 'pph-step-7-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} Bubble Pop: 연습/도전 토글 없음(data-mode=practice 속성만) + 힌트 + SfxControl + "잘 듣고 … 소리 풍선" 안내`, (await T(page, 'pbp-mode-practice').count()) === 0 && (await T(page, 'pbp-mode-challenge').count()) === 0 && (await T(page, 'pbp-root').getAttribute('data-mode')) === 'practice' && (await T(page, 'pbp-hint').count()) === 1 && (await T(page, 'pwsfx-root').count()) === 1 && /잘 듣고 (첫|가운데|끝) 소리 풍선을 터뜨려요/.test((await T(page, 'pbp-root').innerText()) || ''))
    const own = new Set(words.map((w) => w.id))
    const infos = await bubbleSession(page, bubbleWords('b1', 'u2'), null, { vowelOnly: true, wrongAt: 0, hintAt: 1, own })
    const seen = infos.filter((x) => x.own).map((x) => x.item)
    r.check(`${name} 첫 문제: 단어를 한 번 듣기 전에는 풍선이 모두 잠기고 듣기 버튼이 맥박(pbp-pulse), 듣고 나면 "🔊 다시 듣기"로 바뀌고 풍선이 열림`, infos[0].locked === true && infos[0].relabel === true)
    r.check(`${name} 세션 = Unit 2 단어 5개 + 이전 Unit 복습 1개(Book 1 Unit 1의 a), 서로 다름 (${infos.map((x) => x.item.word)})`, infos.length === 6 && infos.every((x) => x.inUnit) && new Set(infos.map((x) => x.item.id)).size === 6 && names(seen) === names(words) && infos.filter((x) => !x.own).length === 1)
    r.check(`${name} 단일 목표 Unit인데도 정답 글자가 2종류 이상(e + 복습 a): ${[...new Set(infos.map((x) => x.tg))]}, 소리 듣기 버튼 0개`, new Set(infos.map((x) => x.tg)).size >= 2 && infos.every((x) => x.listenSound === 0) && (await T(page, 'pbp-listen-sound').count()) === 0)
    r.check(`${name} 모든 풍선은 단모음 글자(a e i o u)뿐이고 정답 1개 포함·서로 다른 소문자 4개`, allOk(infos, 'opts'), JSON.stringify(infos.map((x) => x.opts)))
    r.check(`${name} 안내 문구/data-position이 단어 속 소리 위치(첫/가운데/끝)와 일치`, allOk(infos, 'pos'), JSON.stringify(infos.map((x) => [x.item.word, x.pos])))
    r.check(`${name} 첫 문제 자동 재생 없음, 정답 전 그림·단어·뜻 0개`, infos[0].noAuto === true && allOk(infos, 'leak0'))
    const ownInfos = infos.filter((x) => x.own)
    r.check(`${name} 오답: 풍선 비활성+data-tried, "다시 들어 볼까요?", pulse, 안 누른 풍선 3개 동일, 정답 전 공개 0`, ownInfos[0].wrong && ownInfos[0].pulse && ownInfos[0].sameSig && ownInfos[0].leak1, JSON.stringify(ownInfos[0]))
    r.check(`${name} 힌트: 그림+단어 공개, 버튼 사라짐, 아직 완료 아님`, ownInfos[1].hint === true)
    r.check(`${name} 정답: pop 클래스 + 작은 카드 공개 + 목표 글자("e" 등) 강조(data-hl) + pop/right 효과음, 발음은 정답 후 ≥ 300ms, 칭찬 문구는 3개 중 하나`, infos.every((x) => x.popClass && x.card && x.hlOk && x.osc >= 2 && x.popHz && x.rightHz && x.speakDelay >= 300 && x.speakDelay < 2500 && PRAISE.includes(x.praise)), JSON.stringify(infos.map((x) => [x.popClass, x.card, x.hl, x.osc, Math.round(x.speakDelay), x.praise])))
    r.check(`${name} 항목 2~6: 이전 듣기 이후 자동 재생(= 들은 것으로 쳐서 풍선이 바로 열림)`, infos.slice(1).every((x) => x.auto === true))
    r.check(`${name} 요약: "한 번에 맞힌 풍선 4개", data-score "4 / 6"·"4/6"(오답 1 + 힌트 1 제외), data-records=6, 버튼 3개(다음: Word Train / 다시 하기 / 돌아가기)`, (await firstTry(page)) === '4/6' && ((await T(page, 'pha-summary').innerText()) || '').includes('한 번에 맞힌 풍선 4개') && (await T(page, 'pha-summary').getAttribute('data-score')) === '4/6' && (await T(page, 'pha-summary').getAttribute('data-records')) === '6' && ((await T(page, 'pha-next-step').textContent()) || '') === '다음: Word Train' && (await T(page, 'pha-again').count()) + (await T(page, 'pha-exit').count()) === 2, await T(page, 'pha-summary').innerText())
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 세션에서 돌아오면 같은 Unit 허브(data-unit=u2)`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u2' && (await T(page, 'pph-unit').getAttribute('data-book')) === 'b1')
    const h3 = await hub1(page)
    const prog = (await T(page, 'pph-progress').innerText()) || ''
    r.check(`${name} 풍선을 하면 7단계 "오늘 했어요", next는 8단계(Word Train), 틀린 단어가 생겨 10단계가 준비됨(다시 볼 단어 2개), data-records=5`, h3.rows.find((x) => x.n === 7).st === 'done' && h3.rows.filter((x) => x.st === 'next').map((x) => x.n).join() === '8' && h3.rows.find((x) => x.n === 10).st === 'ready' && h3.rows.find((x) => x.n === 10).txt.includes('다시 볼 단어 2개') && (await T(page, 'pph-progress').getAttribute('data-records')) === '5' && !prog.includes('다시 볼 소리'), JSON.stringify([h3.rows.map((x) => [x.n, x.st]), prog]))
    await T(page, 'pph-step-10-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 다시 만나는 소리 세션: step=review`, (await T(page, 'pha-root').getAttribute('data-step')) === 'review')
    const missedWords = infos.filter((x) => x.own).slice(0, 2).map((x) => x.item.word).sort().join()
    const rev = await bubbleSession(page, words, 2, { vowelOnly: true })
    r.check(`${name} 복습 항목 = 틀린 단어 2개와 정확히 일치 (${rev.map((x) => x.item.word)})`, rev.map((x) => x.item.word).sort().join() === missedWords && allOk(rev, 'opts') && (await firstTry(page)) === '2/2' && (await T(page, 'pha-summary').getAttribute('data-records')) === '2' && (await T(page, 'pha-next-step').count()) === 0)
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    const h4 = await hub1(page)
    r.check(`${name} 복습에서 모두 맞히면 10단계는 다시 잠기고("틀린 소리가 없어요", 게임을 한 뒤라서) data-records=7`, h4.rows.find((x) => x.n === 10).st === 'locked' && h4.rows.find((x) => x.n === 10).txt.includes('틀린 소리가 없어요') && (await T(page, 'pph-progress').getAttribute('data-records')) === '7', JSON.stringify(h4.rows.find((x) => x.n === 10)))
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
    r.check(`${name} Unit 3 단어 5개(${names(words)}), 3·4·5 준비됨(그림 1개), 6 잠김("4개 이상일 때 열려요")`, words.length === 5 && st[2].st === 'ready' && st[3].st === 'ready' && st[4].st === 'ready' && st[5].st === 'locked' && st[5].txt.includes('4개 이상일 때 열려요') && (await T(page, 'pph-step-6-go').count()) === 0, JSON.stringify(st.map((x) => x.st)))
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} Word Train 시작만으로는 발음 재생 없음 + 목표 문구/SfxControl`, (await speakLen(page)) === 0 && (await T(page, 'pwsfx-root').count()) === 1 && ((await T(page, 'pwt-root').innerText()) || '').includes('소리 블록을 차례로 이어 보세요'))
    const tr = await trainSession(page, 5, { allowed, wrongAt: 0, rapidAt: 1, settle: true })
    r.check(`${name} Word Train 5항목 = Unit 단어 전체(${tr.map((x) => x.item.word)})`, names(tr.map((x) => x.item)) === names(words))
    r.check(`${name} 모든 타일(방해 타일 포함)이 익힌 글자 안에서만 나옴`, allOk(tr, 'learnedTiles') && allOk(tr, 'tiles'))
    r.check(`${name} 완성 전 철자 0개·정답 속성 0·alt 그림(그림 없는 단어는 듣기 전용 안내), 완성 뒤에만 단어 + 철자, 칸 내용=자소`, allOk(tr, 'leak0') && allOk(tr, 'word') && allOk(tr, 'spelled') && allOk(tr, 'cars') && tr.every((x) => x.inOrder !== false && x.spelledHidden !== false), JSON.stringify(tr.map((x) => [x.leak0, x.word, x.spelled, x.cars])))
    r.check(`${name} 오답 타일: 흔들림 + 오답 1 + "다시 해 볼까요?" + 칸 변화 없음`, tr[0].shake && tr[0].wrong, JSON.stringify(tr[0]))
    r.check(`${name} 기차 출발 애니메이션(pwt-go 0.6s, 지연 0.25s, fill forwards), 성공음 후 발음 ≥ 300ms`, tr.every((x) => x.depart.cls && x.depart.name === 'pwt-go' && x.depart.dur === '0.6s' && x.depart.delay === '0.25s' && x.depart.fill === 'forwards' && x.speak && x.speakDelay >= 300 && x.osc >= 2), JSON.stringify(tr.map((x) => [x.depart, x.speak, Math.round(x.speakDelay)])))
    r.check(`${name} 출발한 기차는 1.5초 뒤에도 돌아오지 않고(숨김/화면 밖), 같은 자리에 완성한 단어 칸(pwt-result)이 보이며, 다음 버튼 y는 8px 이상 움직이지 않음`, allOk(tr, 'settleOk'), JSON.stringify(tr.map((x) => x.settle)))
    r.check(`${name} 소리 하나 녹음은 없어서 Word Train은 효과음/단어 발음 외 오디오 요소 0개`, (await page.locator('audio').count()) === 0)
    r.check(`${name} 요약: 4 / 5(오답 1 제외), data-records=5`, (await firstTry(page)) === '4/5' && (await T(page, 'pha-summary').getAttribute('data-records')) === '5', await T(page, 'pha-summary').innerText())
    await T(page, 'pha-again').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 다시 하기 → 1번째 항목, 완성 상태 초기화`, (await T(page, 'pwt-root').getAttribute('data-item-index')) === '0' && (await T(page, 'pwt-root').getAttribute('data-done')) === 'false')
    await T(page, 'pha-quit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 그만하기 → 같은 Unit 허브`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u3' && (await T(page, 'pph-unit').getAttribute('data-book')) === 'b2')
    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const infos = await bubbleSession(page, bubbleWords('b2', 'u3'), null, { allowed })
    r.check(`${name} Bubble Pop = Unit 단어 5개 + 이전 Unit 복습 3개(각자 자기 목표 글자), 모든 풍선이 익힌 글자 안에서만, 안내가 위치와 일치`, infos.length === 8 && names(infos.filter((x) => x.own).map((x) => x.item)) === names(words) && infos.filter((x) => !x.own).length === 3 && new Set(infos.map((x) => x.tg)).size >= 2 && allOk(infos, 'inUnit') && allOk(infos, 'opts') && allOk(infos, 'pos') && allOk(infos, 'leak0') && infos.every((x) => x.card && x.hlOk), JSON.stringify(infos.map((x) => [x.item.word, x.inUnit, x.opts, x.pos, x.hl])))
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
    const infos = await bubbleSession(page, bubbleWords('b3', 'u1'), null, { allowed: gset('b3', 'u1') })
    const mine = infos.filter((x) => x.own)
    r.check(`${name} Bubble Pop: 이 Unit 단어 5개는 목표 a_e(가운데 소리)로 풍선 중 정답 1개, 공개된 철자에서 a와 e가 강조됨 (+ 복습 ${infos.length - mine.length}개)`, mine.length === 5 && infos.length > 5 && allOk(infos, 'inUnit') && allOk(infos, 'opts') && allOk(infos, 'pos') && mine.every((x) => x.tg === 'a_e' && x.hl === 'ae' && x.card), JSON.stringify(infos.map((x) => [x.item.word, x.tg, x.hl])))
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
    r.check(`${name} Book 1 전체 연습: 단어 ${words.length}개(그림 ${ready.length}), 3단계 준비됨, 6단계(Unit Test) 잠김, 철자 게임 버튼 없음(Book 1은 Bubble Pop 전용)`, words.length === 25 && ready.length >= 4 && st0[2].st === 'ready' && st0[5].st === 'locked' && st0[5].txt.includes('Book 1은 소리 풍선으로 확인해요') && ((await T(page, 'pph-unit-words').textContent()) === '단어 25개') && (await T(page, 'pph-extra-hammer').count()) === 0 && (await T(page, 'pph-extra-hidden').count()) === 0, JSON.stringify(st0.map((x) => x.st)))
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
    await T(page, 'pph-step-6-go').click()
    await T(page, 'pwp-quiz').waitFor({ state: 'visible', timeout: 10000 })
    let allIn = true
    for (let q = 0; q < 6; q++) {
      const it = await shownItem(page, 'pwp-picture')
      if (!ids2.has(it.id)) allIn = false
      const opts = await page.locator('[data-testid^="pwp-opt-"]').evaluateAll((l) => l.map((e) => e.textContent))
      await T(page, `pwp-opt-${opts.indexOf(it.word)}`).click()
      await T(page, 'pwp-next').click()
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pwp-quiz"], [data-testid="pwp-review-card"], [data-testid="pwp-summary"]'), null, { timeout: 5000 })
    }
    r.check(`${name} Book 2 전체 연습의 Unit Test = 기존 그림 시험 화면, 문제 6개의 그림이 모두 그림이 준비된 이 Unit 단어`, allIn)
    await T(page, 'pwp-next').click() // 모두 맞힘 → 결과 보기
    await T(page, 'pwp-summary').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pwp-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 시험을 마치고 나가면 같은 Unit 허브로 돌아옴`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'review' && (await T(page, 'pph-unit').getAttribute('data-book')) === 'b2')

    await T(page, 'pph-extra-hammer').click()
    await T(page, 'pwh-root').waitFor({ state: 'visible', timeout: 10000 })
    const hw = await shownItem(page, 'pwh-picture')
    r.check(`${name} Book 2 전체 연습: 철자 게임(알파벳 망치)이 그림 준비된 단어(${ready2.length}개)로만 열림`, ids2.has(hw.id))
    await T(page, 'pwg-quit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-extra-hidden').click()
    await T(page, 'pwl-root').waitFor({ state: 'visible', timeout: 10000 })
    const hi = await shownItem(page, 'pwl-picture')
    const hu = unitWords('b2', 'review').find((x) => x.id === hi.id)
    const wantIdx = []
    if (hu && hu.targetIndex >= 0) { let pos = 0; for (const p of spellParts(hu.graphemes, hu.targetIndex)) { if (p.hl) for (let k = 0; k < p.t.length; k++) wantIdx.push(pos + k); pos += p.t.length } }
    const blankIdx = await page.locator('[data-testid^="pwl-cell-"][data-blank="true"]').evaluateAll((l) => l.map((e) => Number(e.getAttribute('data-testid').slice(9))))
    r.check(`${name} 숨은 글자(파닉스 Unit에서 시작): 이 Unit의 목표 글자 칸을 먼저 가림 (${hi.word}: 가려진 칸 ${blankIdx}, 목표 ${wantIdx})`, blankIdx.length >= 1 && (wantIdx.length === 0 || blankIdx.every((i) => wantIdx.includes(i))))
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
      st.map((x) => x.st).join() === 'locked,locked,locked,ready,ready,locked,locked' && st[2].txt.includes('그림이 준비된 단어가 없어요') && st[5].txt.includes('4개 이상일 때 열려요') && (await T(page, 'pph-step-3-go').count()) === 0 && (await T(page, 'pph-step-6-go').count()) === 0
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
        const list = (await T(page, 'pph-book').innerText()) || ''
        r.check(`${name} Book 4 목록에 th (thin) 와 th (this) 가 따로 보임`, list.includes('th (thin)') && list.includes('th (this)'), list.slice(0, 200))
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
    r.check(`${name} 자음군 Unit: 1·2 잠김, 4 잠김("이 Unit은 Word Train으로 연습해요"), 5 준비됨`, stC[0].st === 'locked' && stC[1].st === 'locked' && stC[3].st === 'locked' && stC[3].txt.includes('이 Unit은 Word Train으로 연습해요') && stC[4].st === 'ready' && (await T(page, 'pph-step-4-go').count()) === 0 && ((await T(page, 'pph-unit-objective').textContent()) || '').includes('자음군'), JSON.stringify(stC.map((x) => x.st)))
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const trC = await trainSession(page, 6, { allowed: gset('b4', 'u8') })
    const CL = new Set(['bl', 'cl', 'fl', 'gl', 'pl', 'sl'])
    r.check(`${name} 자음군 Word Train: 6항목 Unit 단어, 타일은 자음군 묶음이 아닌 낱글자(bl·cl·fl 등 타일 0)`, names(trC.map((x) => x.item)) === names(unitWords('b4', 'u8')) && trC.every((x) => x.tiles && x.learnedTiles && x.item.graphemes.every((g) => !CL.has(g))) && allOk(trC, 'word') && allOk(trC, 'spelled'), JSON.stringify(trC.map((x) => [x.item.word, x.tiles])))
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click(); await T(page, 'pph-main').waitFor({ state: 'visible' })

    // Book 2 Unit 6(겹자음 + ck 보조): Bubble 잠김, Word Train에 sock
    await toUnit(page, 'b2', 'u6')
    const w6 = unitWords('b2', 'u6')
    const st6 = await hubState(page)
    r.check(`${name} Book 2 Unit 6: sock·duck 포함 9단어, 목표 줄에 ck(미리 만나요), Bubble 잠김, Word Train 준비됨`, w6.length === 9 && w6.some((w) => w.word === 'sock') && ((await T(page, 'pph-unit').innerText()) || '').includes('ck (미리 만나요)') && st6[3].st === 'locked' && st6[3].txt.includes('이 Unit은 Word Train으로 연습해요') && st6[4].st === 'ready' && st6[2].st === 'ready' && st6[5].st === 'locked', JSON.stringify(st6.map((x) => x.st)))
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
    r.check(`${name} Book 5 Unit 12(끝 -er): Bubble 잠김("이 Unit은 Word Train으로 연습해요"), Word Train 준비됨, 철자 게임 2개, 그림 4개라 6단계 준비됨, 1·2 잠김`, st12[3].st === 'locked' && st12[4].st === 'ready' && st12[3].txt.includes('이 Unit은 Word Train으로 연습해요') && st12[5].st === 'ready' && st12[0].st === 'locked' && st12[1].st === 'locked' && (await T(page, 'pph-extra-hammer').isVisible()) && (await T(page, 'pph-extra-hidden').isVisible()), JSON.stringify(st12.map((x) => x.st)))
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    const list5 = (await T(page, 'pph-book').innerText()) || ''
    await T(page, 'pph-unit-u14').click(); await T(page, 'pph-unit').waitFor({ state: 'visible' })
    const st14 = await hubState(page)
    r.check(`${name} Book 5 Unit 14 = ea /e/ (bread): 목록에 "ea (bread)", Sound Bubble Pop·Word Train 준비됨, 소리 구별 복습 아님`, list5.includes('ea (bread)') && st14[3].st === 'ready' && st14[4].st === 'ready' && ((await T(page, 'pph-unit').innerText()) || '').includes('ea /e/') && !((await T(page, 'pph-unit-objective').textContent()) || '').includes('소리 구별 복습'))
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-unit-review').click(); await T(page, 'pph-unit').waitFor({ state: 'visible' })
    const note5 = (await T(page, 'pph-unit').innerText()) || ''
    r.check(`${name} Book 5 전체 연습에 같은 철자·다른 소리 안내(snow/cow · moon/book · sea/bread · cloud/soup)`, ['snow/cow', 'moon/book', 'sea/bread', 'cloud/soup'].every((t) => note5.includes(t)))
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
    const infos = await bubbleSession(page, bubbleWords('b2', 'u1'), null, { allowed, wrongAt: 0, hintAt: 1, own: new Set(words.map((w) => w.id)) })
    r.check(`${name} 그림 없는 Bubble Pop(Unit 5 + 복습 3): 풍선은 익힌 글자뿐, 정답 전 단어·뜻 공개 0, 정답 뒤 단어만(그림·뜻 없음, <img> 0)`, infos.length === 8 && names(infos.filter((x) => x.own).map((x) => x.item)) === names(words) && allOk(infos, 'inUnit') && allOk(infos, 'opts') && allOk(infos, 'pos') && allOk(infos, 'leak0') && infos.every((x) => x.card && x.hlOk), JSON.stringify(infos.map((x) => [x.item.word, x.inUnit, x.opts, x.card, x.hl])))
    r.check(`${name} 그림 없는 Bubble Pop: 힌트는 단어만 공개하고 <img> 0, 오답 흐름 정상, 요약 6 / 8`, infos.filter((x) => x.own)[0].wrong && infos.filter((x) => x.own)[0].sameSig && infos.filter((x) => x.own)[1].hint === true && (await firstTry(page)) === '6/8' && (await T(page, 'pha-summary').locator('img').count()) === 0)
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const tr = await trainSession(page, 5, { allowed, wrongAt: 0 })
    r.check(`${name} 그림 없는 Word Train 5항목: 듣기 전용 안내("잘 듣고 소리 블록을 이어 보세요"), <img> 0, 완성 전 뜻 없음, 완성 뒤 단어·철자(+승인된 뜻)`, names(tr.map((x) => x.item)) === names(words) && tr.every((x) => x.hasPic === false) && allOk(tr, 'leak0') && allOk(tr, 'tiles') && allOk(tr, 'learnedTiles') && allOk(tr, 'word') && allOk(tr, 'spelled') && allOk(tr, 'cars'), JSON.stringify(tr.map((x) => [x.item.word, x.hasPic, x.leak0])))
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
    for (const n of [1, 3, 6, 7]) if (await covered(T(page, `pph-step-${n}-go`))) cov = true
    r.check(`${name} 허브: 가로 넘침 0, 작은 버튼 0, 시작 버튼 가림 0`, (await overflow(page)) <= 0 && (await smallButtons(page)) === 0 && !cov, `${await overflow(page)}/${cov}`)
    await click(page, T(page, 'pph-step-7-go'), true)
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    cov = false
    for (const id of ['pbp-listen', 'pbp-bubble-0', 'pbp-bubble-1', 'pbp-bubble-2', 'pbp-bubble-3', 'pha-quit']) if (await covered(T(page, id))) cov = true
    r.check(`${name} Bubble Pop: 넘침 0 / 가림 0 / 풍선 ≥ 96px / 작은 버튼 0`, (await overflow(page)) <= 0 && !cov && (await page.locator('[data-testid^="pbp-bubble-"]').evaluateAll((l) => l.every((e) => e.getBoundingClientRect().width >= 95.9 && e.getBoundingClientRect().height >= 95.9))) && (await smallButtons(page)) === 0, `${await overflow(page)}/${cov}`)
    const b = await bubbleItem(page, 0, { words: bubbleWords('b1', 'u2'), vowelOnly: true, touch: true, wrongFirst: true })
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
      await probe('hub', ['pph-step-4-go', 'pph-step-5-go', 'pph-back'])
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
    const b = await bubbleItem(page, 0, { words: bubbleWords('b2', 'u3'), wrongFirst: true })
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
    const b = await bubbleItem(page, 0, { words: bubbleWords('b2', 'u3'), wrongFirst: true })
    const fx1 = await page.evaluate(() => ({ float: document.querySelectorAll('.pbp-float').length, wobble: document.querySelectorAll('.pbp-wobble').length, glow: document.querySelectorAll('.pw-glow').length, fx: window.__fx }))
    r.check(`${name} Bubble Pop: 둥둥 float/흔들림/빛 0 이어도 완료되고 공개됨(소리는 설정대로, ${b.osc})`, fx1.float === 0 && fx1.wobble === 0 && fx1.glow === 0 && fx1.fx.float === 0 && b.card && b.wrong && b.osc >= 2, JSON.stringify(fx1))
    await T(page, 'pha-quit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible' })
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const t = await trainItem(page, 0, { wrongFirst: true, settle: true })
    const fx2 = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('[data-testid="pwt-train"]')); return { fx: window.__fx, anim: c.animationName, vis: c.visibility, resultOp: getComputedStyle(document.querySelector('[data-testid="pwt-result"]')).opacity } })
    r.check(`${name} Word Train: 날아가기 0 / 흔들림 0 / 출발 애니메이션 없음 이어도 완성되고 단어 공개, 기차는 바로 사라지고 완성한 단어 칸이 즉시 보임(소리 ${t.osc})`, fx2.fx.flyMax === 0 && fx2.fx.shake.length === 0 && fx2.anim === 'none' && fx2.vis === 'hidden' && fx2.resultOp === '1' && t.settleOk && t.word && t.cars && t.osc >= 2, JSON.stringify(fx2))
  }, { studentId: TESTER_ONLY, reduced: true })

  // ---- (l) 256차 품질: Book 1 시험 잠금 / nk 단어 제외 / 급속 클릭 / June 대문자 / 출발한 기차
  await scenario('(l) 256차 품질', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    await toUnit(page, 'b1', 'review')
    const stR = await hubState(page)
    r.check(`${name} Book 1 전체 연습도 Unit Test 잠김("Book 1은 소리 풍선으로 확인해요"), 3단계는 열림`, stR[5].st === 'locked' && stR[5].txt.includes('Book 1은 소리 풍선으로 확인해요') && stR[2].st === 'ready' && (await T(page, 'pph-step-6-go').count()) === 0)
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click(); await T(page, 'pph-main').waitFor({ state: 'visible' })

    // Book 4 Unit 7: ng 단어만 풍선(ink·pink는 nk = 소리 둘)
    await toUnit(page, 'b4', 'u7')
    const own7 = new Set(unitWords('b4', 'u7').filter((w) => w.games.includes('B')).map((w) => w.id))
    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const i7 = await bubbleSession(page, bubbleWords('b4', 'u7'), null, { allowed: gset('b4', 'u7'), own: own7 })
    r.check(`${name} Book 4 Unit 7 풍선: 이 Unit 단어는 ng 단어 4개뿐(${i7.filter((x) => x.own).map((x) => x.item.word)}), ink·pink(nk)는 한 번도 안 나옴, 복습 ${i7.filter((x) => !x.own).length}개`, names(i7.filter((x) => x.own).map((x) => x.item)) === 'king,ring,song,wing' && i7.every((x) => !['ink', 'pink'].includes(x.item.word) && x.inUnit))
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click(); await T(page, 'pph-main').waitFor({ state: 'visible' })

    // 빠르게 연타: 같은 오답 풍선 반복 + 정답 뒤 클릭
    await toUnit(page, 'b2', 'u3')
    await T(page, 'pph-step-4-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const W3 = bubbleWords('b2', 'u3')
    const before = await speakLen(page)
    const tMark = await page.evaluate(() => performance.now())
    await click(page, T(page, 'pbp-listen'))
    await page.waitForFunction((m) => window.__speak.length > m, before, { timeout: 4000 })
    const spoken = await page.evaluate(() => window.__speak.slice(-1)[0])
    await sleep(250) // 사람 속도로 한 번 듣고 나서 연타(듣기와 다음 사이는 150ms 이상)
    const uw = W3.find((x) => x.word === spoken)
    const tg = uw.graphemes[uw.targetIndex]
    const bs = await bubbleList(page)
    const wrong = bs.filter((b) => b.t !== tg)
    const good = bs.find((b) => b.t === tg)
    const seq = [wrong[0].id, wrong[0].id, wrong[1].id, good.id, good.id, wrong[2].id]
    await page.evaluate((ids) => { for (const id of ids) document.querySelector(`[data-testid="${id}"]`).click() }, seq)
    const after = await bubbleList(page)
    r.check(`${name} 연타 6번(같은 오답 2번 · 정답 · 정답 뒤 클릭 2번): 오답 수 = 서로 다른 오답 풍선 2개, 완료 1번, 정답 뒤에 누른 풍선은 안 눌린 상태`, (await T(page, 'pbp-root').getAttribute('data-wrong')) === '2' && (await T(page, 'pbp-root').getAttribute('data-done')) === 'true' && (await T(page, 'pbp-next').count()) === 1 && (await T(page, 'pbp-feedback').getAttribute('data-result')) === 'right' && after.find((b) => b.id === wrong[2].id).tried === 'false', JSON.stringify(after))
    await page.evaluate(() => { const b = document.querySelector('[data-testid="pbp-next"]'); b.click(); b.click() })
    await page.waitForFunction(() => document.querySelector('[data-testid="pbp-root"]')?.getAttribute('data-item-index') === '1', null, { timeout: 5000 })
    await sleep(700)
    const gaps = await page.evaluate((m) => window.__speakT.filter((t) => t >= m).map((t, k, a) => (k ? t - a[k - 1] : Infinity)), tMark)
    r.check(`${name} 연타 구간: 정답 뒤 예약된 발음은 다음을 누르면 취소되고(듣기 1 + 다음 문제 자동 재생 1 = ${gaps.length}건), 발음 요청은 서로 150ms 이상 떨어져 시작함(겹침 없음)`, gaps.length === 2 && gaps.slice(1).every((g) => g >= 150), JSON.stringify(gaps))
    const rest = await bubbleSession(page, W3, null, { allowed: gset('b2', 'u3'), start: 1 })
    r.check(`${name} 연타 뒤에도 기록은 항목마다 정확히 1건(요약 data-records = 항목 수 ${rest.length + 1})`, (await T(page, 'pha-summary').getAttribute('data-records')) === String(rest.length + 1) && rest.length + 1 === 8)
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' })
    await T(page, 'pph-back').click(); await T(page, 'pph-main').waitFor({ state: 'visible' })

    // Book 3 Unit 5: June은 대문자로 보이고, 출발한 기차는 돌아오지 않음
    await toUnit(page, 'b3', 'u5')
    await T(page, 'pph-step-5-go').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const tr = await trainSession(page, 5, { allowed: gset('b3', 'u5'), settle: true })
    const june = tr.find((x) => x.item.word === 'june')
    r.check(`${name} Book 3 Unit 5 Word Train: June은 결과에 "June"(대문자)로 보이고 나머지는 소문자 철자`, !!june && june.spelledText === 'June' && tr.filter((x) => x !== june).every((x) => x.spelledText === x.item.word), JSON.stringify(tr.map((x) => x.spelledText)))
    r.check(`${name} Book 3 Unit 5: 기차는 출발 뒤 돌아오지 않고 완성한 단어 칸이 남으며 다음 버튼은 안 움직임`, allOk(tr, 'settleOk'), JSON.stringify(tr.map((x) => x.settle)))
  }, { studentId: TESTER_ONLY })

  // ---- (m) 360x640 터치: 자음군 Unit(Book 4 Unit 8) Word Train 전체 세션 (black = b · l · a · ck)
  await scenario('(m) 모바일 자음군', { width: 360, height: 640 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page, true)
    await toUnit(page, 'b4', 'u8', true)
    await click(page, T(page, 'pph-step-5-go'), true)
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 자음군 Word Train 시작: 가로 넘침 0, 작은 버튼 0`, (await overflow(page)) <= 0 && (await smallButtons(page)) === 0, `${await overflow(page)}`)
    const tr = await trainSession(page, 6, { touch: true, allowed: gset('b4', 'u8'), settle: true })
    const black = tr.find((x) => x.item.word === 'black')
    r.check(`${name} 터치로 6단어 완주(${tr.map((x) => x.item.word)}): black은 b·l·a·ck 낱글자 타일, 완성 단어·철자·칸 정상, 기차는 돌아오지 않음`, names(tr.map((x) => x.item)) === names(unitWords('b4', 'u8')) && !!black && black.item.graphemes.join() === 'b,l,a,ck' && allOk(tr, 'tiles') && allOk(tr, 'word') && allOk(tr, 'spelled') && allOk(tr, 'cars') && allOk(tr, 'settleOk'), JSON.stringify(tr.map((x) => [x.item.word, x.tiles, x.settleOk])))
    r.check(`${name} 요약 화면 가로 넘침 0`, (await overflow(page)) <= 0)
  }, { studentId: TESTER_ONLY, hasTouch: true })

  // ---- (n) Book 1 Unit 1: 소리 찾기(두 풍선) → Word Train(빈 모음 칸) → 소리 확인 → 다시 만나기
  await scenario('(n) Book 1 Unit 1', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    await toUnit(page, 'b1', 'u1')
    const words = unitWords('b1', 'u1')
    r.check(`${name} 허브: 큰 글자 a, 발음 기호 0, next 1개(1단계), 7·8·9 준비됨 / 소개 카드의 입 모양 한 줄`, (await T(page, 'pph-unit-target').textContent()) === 'a' && !IPA_RE.test((await T(page, 'pph-unit').innerText()) || ''))
    await T(page, 'pph-step-1-go').click()
    r.check(`${name} 소개 카드 팁 = 초안 문구(a)`, ((await T(page, 'pph-tip').textContent()) || '') === BOOKS[0].units[0].intro.tipKo && (await T(page, 'pph-intro-letter').textContent()) === 'a')

    await T(page, 'pph-step-7-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const det = await detectSession(page, 8, { wrongAt: 0 })
    r.check(`${name} 첫 Unit은 소리 찾기: 8문제 = a가 있는 단어 5 + 없는 단어 3, 모든 문제의 풍선은 정확히 [a, 다른 소리] 둘뿐(자음 풍선 0)`, det.length === 8 && det.every((x) => x.attr && x.opts && x.noHelpers) && det.filter((x) => x.has).length === 5 && det.filter((x) => !x.has).length === 3 && new Set(det.map((x) => x.item.id)).size === 8, JSON.stringify(det.map((x) => [x.item.word, x.has])))
    r.check(`${name} 소리 찾기: 정답이 a인 문제와 "다른 소리"인 문제가 모두 나옴, 첫 문제는 듣기 전 풍선 잠김+맥박, 오답 → 다시 들어 볼까요, 정답 뒤 단어 공개`, det[0].locked && det[0].wrong && det.every((x) => x.right))
    r.check(`${name} 소리 찾기 요약: "한 번에 맞힌 풍선 7개", data-score 7/8, "다음: Word Train"`, (await T(page, 'pha-summary').getAttribute('data-score')) === '7/8' && (await T(page, 'pha-first-try').getAttribute('data-score')) === '7 / 8' && ((await T(page, 'pha-summary').innerText()) || '').includes('한 번에 맞힌 풍선 7개') && ((await T(page, 'pha-next-step').textContent()) || '') === '다음: Word Train')

    await T(page, 'pha-next-step').click()
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} Word Train(Book 1): 빈 모음 칸 안내 문구 + SfxControl`, ((await T(page, 'pwt-root').innerText()) || '').includes('회색 글자는 도우미예요') && (await T(page, 'pwsfx-root').count()) === 1)
    const vt = await vowelTrainSession(page, 5, { wrongAt: 1 })
    r.check(`${name} Book 1 Word Train 5단어 = Unit 1 단어 전체, 자음 칸은 회색 도우미로 채워져 있고 모음 칸 하나만 비어 있음(${vt.map((x) => x.item.word)})`, names(vt.map((x) => x.item)) === names(words) && allOk(vt, 'cars'))
    r.check(`${name} 타일은 항상 모음 5개(a e i o u)뿐이고 완성 전에는 단어·철자가 없음`, allOk(vt, 'tiles') && allOk(vt, 'noReveal'))
    r.check(`${name} 오답 모음: 흔들림 + 오답 1 + 빈 칸 그대로 + 정답 안 알려 줌`, vt[1].shake && vt[1].wrong, JSON.stringify(vt[1]))
    r.check(`${name} 완성: 기차는 출발해 돌아오지 않고, 결과 칸이 남고, 단어 전체를 읽고, 다음 버튼에 포커스`, allOk(vt, 'word') && allOk(vt, 'speak') && allOk(vt, 'result') && allOk(vt, 'gone') && allOk(vt, 'focus'), JSON.stringify(vt.map((x) => [x.word, x.speak, x.result, x.gone, x.focus])))
    r.check(`${name} Word Train 요약: "한 번에 만든 단어 4개", "다음: 소리 확인"`, ((await T(page, 'pha-summary').innerText()) || '').includes('한 번에 만든 단어 4개') && (await T(page, 'pha-summary').getAttribute('data-score')) === '4/5' && ((await T(page, 'pha-next-step').textContent()) || '') === '다음: 소리 확인')

    await T(page, 'pha-next-step').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const t1 = await testSessionRun(page, words, { detect: true, wrongAt: 2 })
    const testWrong = t1[2].item
    r.check(`${name} 소리 확인: 5문제, 진행 "소리 확인 n / 5", 힌트 없음(data-mode=challenge), 한 문제에 한 번만 고르고(고른 뒤 풍선 칸이 접힘) 틀리면 부드럽게 알려 줌`, t1.length === 5 && allOk(t1, 'label') && allOk(t1, 'mode') && allOk(t1, 'opts') && allOk(t1, 'once') && allOk(t1, 'collapsed'), JSON.stringify(t1.map((x) => [x.label, x.mode, x.once, x.collapsed])))
    r.check(`${name} 소리 확인 요약: data-score 4/5, "한 번에 맞힌 소리 4개", "다시 만나기" 있음, 다음 단계 버튼 없음`, (await T(page, 'pha-summary').getAttribute('data-score')) === '4/5' && ((await T(page, 'pha-summary').innerText()) || '').includes('한 번에 맞힌 소리 4개') && (await T(page, 'pha-review').count()) === 1 && (await T(page, 'pha-next-step').count()) === 0)
    const sm1 = await T(page, 'pha-summary').innerText()
    r.check(`${name} 4/5 = 통과: data-passed=true, data-pass-mark=4, "통과! 5문제 중 4개 이상 맞혔어요", 다시 만나기는 보조 버튼(보라색 아님)`, (await T(page, 'pha-summary').getAttribute('data-passed')) === 'true' && (await T(page, 'pha-summary').getAttribute('data-pass-mark')) === '4' && sm1.includes('통과! 5문제 중 4개 이상 맞혔어요') && !((await T(page, 'pha-review').getAttribute('class')) || '').includes('bg-purple-600') && (await T(page, 'pha-retest').count()) === 0, sm1)
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 허브 9단계: 이번에 한 결과 "통과"`, ((await T(page, 'pph-step-9').innerText()) || '').includes('통과') && !((await T(page, 'pph-step-9').innerText()) || '').includes('다시 도전'))
    const missedIds = new Set([det[0].item.id, vt[1].item.id, testWrong.id])
    const h = await hub1(page)
    r.check(`${name} 허브: 7·8·9단계 "오늘 했어요", 10단계 준비됨(다시 볼 단어 ${missedIds.size}개 = 놓친 소리만)`, [7, 8, 9].every((n) => h.rows.find((x) => x.n === n).st === 'done') && h.rows.find((x) => x.n === 10).st !== 'locked' && h.rows.find((x) => x.n === 10).txt.includes(`다시 볼 단어 ${missedIds.size}개`), JSON.stringify(h.rows.map((x) => [x.n, x.st])))
    await T(page, 'pph-step-10-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const rv = await detectSession(page, missedIds.size)
    r.check(`${name} 다시 만나는 소리: 놓친 소리 ${missedIds.size}개만 (${rv.map((x) => x.item.word)})`, rv.length === missedIds.size && rv.every((x) => missedIds.has(x.item.id)) && new Set(rv.map((x) => x.item.id)).size === missedIds.size)
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    const h2 = await hub1(page)
    r.check(`${name} 모두 맞히면 10단계는 다시 잠김("틀린 소리가 없어요")`, h2.rows.find((x) => x.n === 10).st === 'locked' && h2.rows.find((x) => x.n === 10).txt.includes('틀린 소리가 없어요'))

    // 소리 확인을 한 번 더: 2개 틀리면 아직 통과 전 — 보라색 주 버튼은 틀린 소리 복습, 복습 뒤에는 다시 확인
    await T(page, 'pph-step-9-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const t2 = await testSessionRun(page, words, { detect: true, wrongAt: [0, 3] })
    const sm2 = await T(page, 'pha-summary').innerText()
    r.check(`${name} 3/5 = 아직: data-passed=false, data-pass-mark=4, "조금만 더! 4개를 맞히면 통과예요", 실패 문구 없음, 주 버튼 = 틀린 소리 다시 만나기`, (await T(page, 'pha-summary').getAttribute('data-score')) === '3/5' && (await T(page, 'pha-summary').getAttribute('data-passed')) === 'false' && (await T(page, 'pha-summary').getAttribute('data-pass-mark')) === '4' && sm2.includes('조금만 더! 4개를 맞히면 통과예요') && !/실패|불합격/.test(sm2) && ((await T(page, 'pha-review').getAttribute('class')) || '').includes('bg-purple-600') && (await T(page, 'pha-retest').count()) === 0, sm2)
    await T(page, 'pha-exit').click()
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    const h3 = await hub1(page)
    r.check(`${name} 허브 9단계: 최근 결과 "다시 도전", 10단계는 시험에서 틀린 소리로 열려 있음, 2단계(선생님 소리)는 여전히 잠김`, ((await T(page, 'pph-step-9').innerText()) || '').includes('다시 도전') && h3.rows.find((x) => x.n === 10).st !== 'locked' && h3.rows.find((x) => x.n === 2).st === 'locked', JSON.stringify(h3.rows.map((x) => [x.n, x.st])))
    await T(page, 'pph-step-9-go').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const t3 = await testSessionRun(page, words, { detect: true, wrongAt: [1, 2] })
    const miss3 = new Set([t3[1].item.id, t3[2].item.id])
    await T(page, 'pha-review').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const total = Number((((await T(page, 'pbp-progress').textContent()) || '').match(/\/\s*(\d+)/) || [])[1])
    const rv3 = await detectSession(page, total)
    r.check(`${name} 복습 ${total}문제(3~6): 틀린 소리 ${miss3.size}개를 모두 포함하고, 모든 문제의 풍선은 [a, 다른 소리] 둘뿐`, total >= 3 && total <= 6 && [...miss3].every((id) => rv3.some((x) => x.item.id === id)) && rv3.every((x) => x.opts), JSON.stringify(rv3.map((x) => x.item.word)))
    r.check(`${name} 복습 요약에 "소리 확인 다시 하기"(pha-retest)가 보임`, (await T(page, 'pha-retest').count()) === 1 && (await T(page, 'pha-summary').getAttribute('data-passed')) === null)
    await T(page, 'pha-retest').click()
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 다시 확인 = 새 5문제 소리 확인`, ((await T(page, 'pbp-progress').textContent()) || '').includes('소리 확인 1 / 5') && (await T(page, 'pbp-root').getAttribute('data-mode')) === 'challenge')
    const t4 = await testSessionRun(page, words, { detect: true })
    r.check(`${name} 모두 맞히면 5/5 통과, 복습 버튼 없음`, (await T(page, 'pha-summary').getAttribute('data-passed')) === 'true' && (await T(page, 'pha-summary').getAttribute('data-score')) === '5/5' && (await T(page, 'pha-review').count()) === 0 && allOk(t4, 'once'))
  }, { studentId: TESTER_ONLY })

  // ---- (o) 360x640 터치: Book 1 Unit 3 허브 · 소개 · 풍선 · Word Train
  await scenario('(o) 모바일 Book 1', { width: 360, height: 640 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page, true)
    await toUnit(page, 'b1', 'u3', true)
    let cov = false
    for (const n of [1, 3, 6, 7, 8, 9]) if (await covered(T(page, `pph-step-${n}-go`))) cov = true
    r.check(`${name} Book 1 허브: 가로 넘침 0, 44px 미만 버튼 0, 시작 버튼 가림 0`, (await overflow(page)) <= 0 && (await smallButtons(page)) === 0 && !cov, `${await overflow(page)}/${cov}`)
    await click(page, T(page, 'pph-step-1-go'), true)
    await T(page, 'pph-intro').waitFor({ state: 'visible', timeout: 3000 })
    await click(page, T(page, 'pph-step-6-go'), true)
    await T(page, 'pph-gallery').waitFor({ state: 'visible', timeout: 3000 })
    r.check(`${name} 소개·갤러리를 열어도 가로 넘침 0, 44px 미만 버튼 0`, (await overflow(page)) <= 0 && (await smallButtons(page)) === 0)
    await click(page, T(page, 'pph-step-7-go'), true)
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const infos = await bubbleSession(page, bubbleWords('b1', 'u3'), null, { vowelOnly: true, touch: true })
    const pic = infos.filter((x) => x.item.picture), txt = infos.filter((x) => !x.item.picture)
    r.check(`${name} 정답 뒤 "다음" 버튼이 스크롤 없이 한 화면 안(bottom ≤ ${640}): 그림 단어 ${pic.length}개·글자 카드 단어 ${txt.length}개 모두`, pic.length >= 1 && txt.length >= 1 && infos.every((x) => x.nb && x.nb.bottom <= x.nb.vh && x.nb.top >= 0), JSON.stringify(infos.map((x) => [x.item.word, !!x.item.picture, x.nb && Math.round(x.nb.bottom)])))
    r.check(`${name} 풍선 세션 요약 가로 넘침 0, 다음 단계 버튼 있음`, (await overflow(page)) <= 0 && ((await T(page, 'pha-next-step').textContent()) || '') === '다음: Word Train' && (await smallButtons(page)) === 0)
    await click(page, T(page, 'pha-next-step'), true)
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const vt = await vowelTrainSession(page, 5, { touch: true, wrongAt: 0 })
    r.check(`${name} 터치로 Book 1 Word Train 5단어 완주: 칸·타일·오답·결과 정상, 넘침 0, 요약 다음 버튼(소리 확인)`, allOk(vt, 'cars') && allOk(vt, 'tiles') && allOk(vt, 'word') && allOk(vt, 'result') && vt[0].wrong && (await overflow(page)) <= 0 && ((await T(page, 'pha-next-step').textContent()) || '') === '다음: 소리 확인', JSON.stringify(vt.map((x) => [x.item.word, x.cars, x.tiles, x.word, x.result])))
    await click(page, T(page, 'pha-exit'), true)
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 터치로 돌아오면 같은 Unit 허브(data-unit=u3), 가로 넘침 0`, (await T(page, 'pph-unit').getAttribute('data-unit')) === 'u3' && (await overflow(page)) <= 0)
  }, { studentId: TESTER_ONLY, hasTouch: true })


  // ---- (p) 263차: Book 1 3–5단계는 Unit 단어 5개 전부 — 그림 없는 단어는 글자 카드(녹음 포함)
  await scenario('(p) Book 1 따라 말하기 5단어', { width: 1280, height: 800 }, async ({ page, name }) => {
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext(); await ctx.resume().catch(() => {})
        const osc = ctx.createOscillator(), dest = ctx.createMediaStreamDestination()
        osc.connect(dest); osc.start()
        return dest.stream
      }
    })
    await openScreen(page)
    await openPhonics(page)
    for (const u of ['u1', 'u2', 'u3', 'u4', 'u5']) {
      if (u !== 'u1') { await T(page, 'pph-back').click(); await T(page, 'pph-book').waitFor({ state: 'visible' }) } else await T(page, 'pph-book-b1').click()
      await click(page, T(page, `pph-unit-${u}`), false)
      await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
      const words = unitWords('b1', u)
      const nPic = readyWords(words).length
      await T(page, 'pph-step-3-go').click()
      await T(page, 'pwp-card').waitFor({ state: 'visible', timeout: 10000 })
      const seen = []
      let imgOnText = 0, listenOk = true, recOk = true
      for (let k = 0; k < 5; k++) {
        const pic = (await T(page, 'pwp-picture').count()) === 1
        const txt = (await T(page, 'pwp-text-card').count()) === 1
        if (pic === txt) throw new Error(`card ${k + 1}: pic=${pic} text=${txt}`)
        if (txt) imgOnText += await T(page, 'pwp-text-card').locator('img').count()
        const shown = (await T(page, 'pwp-word').textContent()) || ''
        seen.push({ shown, pic })
        const before = await speakLen(page)
        await T(page, 'pwp-listen').click()
        await page.waitForFunction((m) => window.__speak.length > m, before, { timeout: 4000 })
        if (!(await page.evaluate((m) => window.__speak.slice(m).join() , before)).split(',').every((x) => x === shown)) listenOk = false
        if (txt && k === 0) {
          await T(page, 'pwp-rec-record').click()
          await T(page, 'pwp-rec-stop').waitFor({ state: 'visible', timeout: 10000 })
          await sleep(1100)
          await T(page, 'pwp-rec-stop').click()
          await T(page, 'pwp-rec-play').waitFor({ state: 'visible', timeout: 8000 })
          await T(page, 'pwp-rec-play').click()
          await T(page, 'pwp-rec-retake').click()
          recOk = (await T(page, 'pwp-rec-record').count()) === 1 && (await T(page, 'pwp-rec-play').count()) === 0
        }
        await T(page, 'pwp-next').click()
        await page.waitForFunction(() => !!document.querySelector('[data-testid="pwp-card"], [data-testid="pwp-end"]'), null, { timeout: 5000 })
      }
      r.check(`${name} ${u}: 3–5단계 카드 5장 = Unit 단어 5개(순서 무관), 그림 카드 ${nPic}장·글자 카드 ${5 - nPic}장, 글자 카드에 img 0, 듣기는 보이는 단어 하나만`, seen.length === 5 && seen.map((x) => x.shown).sort().join() === words.map((w) => w.word).sort().join() && seen.filter((x) => x.pic).length === nPic && imgOnText === 0 && listenOk, JSON.stringify(seen))
      r.check(`${name} ${u}: 글자 카드에서 녹음 → 재생 → 다시 말하기 동작`, recOk)
      await T(page, 'pwp-end').waitFor({ state: 'visible', timeout: 5000 })
      await T(page, 'pwp-skip').click()
      await T(page, 'pwp-exit').click()
      await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    }
  }, { studentId: TESTER_ONLY })

  // ---- (q) 264차: 글자 카드 = 그림 카드와 같은 크기·디자인, 단어를 누르면 전체 단어 소리, 안 승인된 뜻은 보이지 않음 (360 / 768 / 1280)
  const B1_ITEMS = BOOKS[0].units.flatMap((u) => unitWords('b1', u.id))
  const B1_WORDS = B1_ITEMS.map((w) => w.word)
  const B1_KO = [...new Set([...B1_WORDS.map((w) => PROPOSED_KO[w]), ...B1_ITEMS.map((w) => w.ko)].filter(Boolean))]
  for (const vp of [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    const touch = vp.width < 768
    await scenario('(q) 글자 카드 크기·디자인·탭', vp, async ({ page, name }) => {
      await openScreen(page)
      await openPhonics(page, touch)
      await toUnit(page, 'b1', 'u4', touch)
      await click(page, T(page, 'pph-step-3-go'), touch)
      await T(page, 'pwp-card').waitFor({ state: 'visible', timeout: 10000 })
      const geo = []
      let tapOk = true, dblOk = true, koCount = 0
      const kos = []
      for (let k = 0; k < 5; k++) {
        const g = await page.evaluate(() => {
          const c = document.querySelector('[data-testid="pwp-text-card"],[data-testid="pwp-picture-card"]'), cs = getComputedStyle(c), b = c.getBoundingClientRect()
          const mat = c.querySelector('.pw-pic'), mb = mat.getBoundingClientRect(), ms = getComputedStyle(mat)
          const w = c.querySelector('[data-testid="pwp-word"]'), wb = w && w.getBoundingClientRect()
          return { text: c.dataset.testid === 'pwp-text-card', w: b.width, h: b.height, mw: mb.width, mh: mb.height, border: cs.borderTopColor + cs.borderTopWidth, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, bg: cs.backgroundImage, matBg: ms.backgroundColor + ms.boxShadow + ms.borderTopLeftRadius,
            inside: !w || (wb.left >= mb.left - 0.5 && wb.right <= mb.right + 0.5 && wb.top >= mb.top - 0.5 && wb.bottom <= mb.bottom + 0.5 && w.scrollWidth <= w.clientWidth + 1 && mat.scrollWidth <= mat.clientWidth + 1 && getComputedStyle(w).textOverflow !== 'ellipsis'), fits: b.left >= 0 && b.right <= innerWidth + 0.5, ko: document.querySelectorAll('[data-testid="pwp-ko"]').length }
        })
        geo.push(g); koCount += g.ko
        if (g.text) kos.push(`${(await T(page, 'pwp-word').textContent())}:${(await T(page, 'pwp-ko').textContent().catch(() => ''))}`)
        const shown = (await T(page, 'pwp-word').textContent()) || ''
        const before = await speakLen(page)
        await click(page, T(page, 'pwp-word'), touch)
        await page.waitForFunction((m) => window.__speak.length > m, before, { timeout: 4000 })
        await sleep(300)
        const one = await page.evaluate((m) => window.__speak.slice(m), before)
        if (one.length !== 1 || one[0] !== shown) tapOk = false
        const b2 = await speakLen(page)
        await T(page, 'pwp-word').dblclick()
        await sleep(400)
        const two = await page.evaluate((m) => window.__speak.slice(m), b2)
        if (two.length < 1 || two.length > 2 || two.some((x) => x !== shown)) dblOk = false
        await click(page, T(page, 'pwp-next'), touch)
        await page.waitForFunction(() => !!document.querySelector('[data-testid="pwp-card"], [data-testid="pwp-end"]'), null, { timeout: 5000 })
      }
      const P = geo.filter((x) => !x.text), X = geo.filter((x) => x.text)
      const same = (a, b) => Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1 && Math.abs(a.mw - b.mw) <= 1 && Math.abs(a.mh - b.mh) <= 1 && a.border === b.border && a.radius === b.radius && a.shadow === b.shadow && a.bg === b.bg && a.matBg === b.matBg
      r.check(`${name} Unit 4: 그림 카드 ${P.length}장 + 글자 카드 ${X.length}장, 겉 크기(±1px)·테두리·모서리·그림자·배경·안쪽 매트가 같음`, P.length === 1 && X.length === 4 && geo.every((x) => same(x, P[0])) && P[0].border.startsWith('rgb(244, 114, 182)'), JSON.stringify(geo.map((x) => [x.text, Math.round(x.w), Math.round(x.h)])))
      r.check(`${name} 큰 단어가 매트 안에 전부 보임(잘림·말줄임·가로 넘침 0), 카드가 화면 안`, geo.every((x) => x.inside && x.fits) && (await overflow(page)) <= 0, JSON.stringify(geo.map((x) => x.inside)))
      r.check(`${name} 단어를 누르면 그 단어 전체 소리가 정확히 1번(5장 모두); 빠르게 두 번 눌러도 같은 단어만, 최대 2번`, tapOk && dblOk, `${tapOk}/${dblOk}`)
      r.check(`${name} 승인된 뜻이 글자 카드 4장에 보임(box 상자·pot 냄비·hot 뜨거운·dog 개) + 그림 단어 뜻 1개 = 5줄, 자리표시 문구 없음`, koCount === 5 && ['box:상자', 'pot:냄비', 'hot:뜨거운', 'dog:개'].every((x) => kos.includes(x)) && !/준비 중|뜻 없음/.test(await T(page, 'pwp-root').innerText()), kos.join())
    }, { studentId: TESTER_ONLY, hasTouch: touch })
  }

  // ---- (r) 264차: 시험·게임 화면은 답하기 전에 영어 단어·뜻을 글자·aria·alt 어디에도 내놓지 않는다(Book 1 Unit 4 한 세션 전체)
  await scenario('(r) 답 전 단어·뜻 숨김', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openScreen(page)
    await openPhonics(page)
    await toUnit(page, 'b1', 'u4')
    const leak = () => page.evaluate(({ words, kos }) => {
      const root = document.querySelector('[data-testid="pph-root"]') || document.body
      const blob = [root.innerText, ...[...root.querySelectorAll('[aria-label],[alt],[title],[placeholder]')].map((e) => ['aria-label', 'alt', 'title', 'placeholder'].map((a) => e.getAttribute(a) || '').join(' '))].join(' ')
      return [...words.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(blob)), ...kos.filter((k) => blob.includes(k))]
    }, { words: B1_WORDS, kos: B1_KO })
    await click(page, T(page, 'pph-step-7-go'), false)
    await T(page, 'pbp-root').waitFor({ state: 'visible', timeout: 20000 })
    const leaks = [], shown = []
    const nB = +(await T(page, 'pbp-progress').getAttribute('data-total'))
    for (let i = 0; i < nB; i++) {
      await T(page, 'pbp-listen').waitFor({ state: 'visible' })
      leaks.push(...(await leak()))
      await click(page, T(page, 'pbp-listen'), false)
      await page.waitForFunction(() => !document.querySelector('[data-testid="pbp-bubble-0"]')?.disabled, null, { timeout: 5000 })
      leaks.push(...(await leak()))
      for (const id of ['pbp-bubble-0', 'pbp-bubble-1', 'pbp-bubble-2', 'pbp-bubble-3', 'pbp-bubble-other']) { if (await T(page, 'pbp-next').count()) break; if (await T(page, id).count()) await click(page, T(page, id), false); await sleep(150) }
      await T(page, 'pbp-next').waitFor({ state: 'visible', timeout: 5000 })
      shown.push((await T(page, 'pbp-word').textContent()) || '')
      await click(page, T(page, 'pbp-next'), false)
      await sleep(100)
    }
    r.check(`${name} Sound Bubble Pop: ${nB}문제 모두 답하기 전(듣기 전·후) 단어·뜻 노출 0, 답한 뒤에는 단어가 보임(${shown.join(' ')})`, leaks.length === 0 && nB >= 5 && shown.length === nB && shown.every((x) => x), JSON.stringify(leaks))
    await T(page, 'pha-exit').waitFor({ state: 'visible', timeout: 5000 })
    await click(page, T(page, 'pha-exit'), false)
    await T(page, 'pph-unit').waitFor({ state: 'visible', timeout: 5000 })
    await click(page, T(page, 'pph-step-8-go'), false)
    await T(page, 'pwt-root').waitFor({ state: 'visible', timeout: 20000 })
    const tl = [], done = []
    const nT = +(await T(page, 'pwt-progress').getAttribute('data-total'))
    for (let i = 0; i < nT; i++) {
      await T(page, 'pwt-listen').waitFor({ state: 'visible' })
      const pic = (await T(page, 'pwt-picture').count()) > 0
      const lk = await leak()
      // 그림 단어는 그림이 이미 보이므로 기존 동작(뜻 표시)을 그대로 두고, 그림 없는 단어만 엄격히 본다
      if (!pic) tl.push(...lk, ...((await T(page, 'pwt-ko').count()) ? ['ko'] : []))
      for (const t of await T(page, 'pwt-root').locator('[data-testid^="pwt-tile-"]').all()) { if (await T(page, 'pwt-next').count()) break; await t.click().catch(() => {}); await sleep(120) }
      await T(page, 'pwt-next').waitFor({ state: 'visible', timeout: 8000 })
      done.push(pic ? 'P' : 'T')
      await click(page, T(page, 'pwt-next'), false)
      await sleep(100)
    }
    r.check(`${name} Word Train: 그림 없는 단어는 답하기 전 단어·뜻 노출 0 (${done.join('')})`, tl.length === 0 && done.includes('T'), JSON.stringify(tl))
  }, { studentId: TESTER_ONLY })

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
