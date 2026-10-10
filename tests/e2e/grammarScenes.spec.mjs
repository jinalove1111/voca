// 2026-10-10 문법 그림 장면 v2 (mode 'add') 브라우저 시나리오 — 장면이 붙은 모든 단원을 카드 덱 그대로 끝까지 걷는다.
// 단원·카드·정답은 전부 src(GRAMMAR_UNITS + buildDeck + sceneMission)에서 가져온다(하드코딩 금지) — 단원이 늘어도 그대로 통과해야 한다.
// 장면 카드(scene-card-*)마다: 그림 있음·가로 넘침 없음·다음 버튼 닿음, 종류별로 답 전 미노출 → 틀림/다시 → 맞음 → 설명. 저장·REST 쓰기 0, 네트워크 전체 mock.
// 시범 g-easy-05(mode 'full')의 9단계는 grammarScene.spec.mjs가 맡는다. 화면 testid는 SceneCards.jsx / Stage.jsx 소스에서 그대로 가져왔다.
import { mkdirSync } from 'node:fs'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { recordsKey } from '../../src/utils/curriculum/unitRecords.js'
import { UNITS } from '../../src/utils/curriculum/units.js'
import { GRAMMAR_COURSES } from '../../src/utils/grammar/grammarCourses.js'
import { GRAMMAR_UNITS } from '../../src/utils/grammar/grammarUnits.js'
import { buildDeck, deckCounts } from '../../src/utils/grammar/grammarDeck.js'
import { buildFrame, viewOf } from '../../src/utils/grammar/sceneMission.js'

const SHOTS_DIR = process.env.GRAMMAR_SHOTS_DIR || 'C:\\Users\\jinal\\AppData\\Local\\Temp\\claude\\C--voca\\4dd777a3-9f93-4c78-a984-4f4ee328e279\\scratchpad\\shots'
const MOBILE = { width: 360, height: 640 }
const DESKTOP = { width: 1280, height: 800 }
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()
// 보기 글자를 데이터 번호 순으로 읽는다(scene-opt-<번호>의 번호 = 데이터 번호, 화면 순서와 무관) — 렌더된 집합이 데이터와 같고 번호마다 option[번호]를 담는지 한 번에 본다
const optsByIndex = async (card) => (await card.locator('[data-testid^="scene-opt-"]').evaluateAll((els) => { const a = []; for (const e of els) a[+e.getAttribute('data-testid').split('-').pop()] = e.textContent; return a })).map(norm)
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const clipped = (page, rootId) => page.locator(`[data-testid="${rootId}"] *`).evaluateAll((els) =>
  // SVG children are clipped by the outermost <svg> (cropped viewBox), so use rect∩svg rect, not the raw child rect
  els.map((el) => { let s = el.ownerSVGElement; while (s && s.ownerSVGElement) s = s.ownerSVGElement; return [el, Math.min(el.getBoundingClientRect().right, s ? s.getBoundingClientRect().right : Infinity)] }).filter(([el, r]) => el.offsetParent !== null && r > window.innerWidth + 1).slice(0, 3).map(([el, r]) => `${el.tagName}:${Math.round(r)}`))
const smallButtons = (page, rootId) => page.locator(`[data-testid="${rootId}"] button`).evaluateAll((els) =>
  els.filter((el) => el.offsetParent !== null).map((el) => [el.textContent.trim().slice(0, 20), el.getBoundingClientRect().height]).filter(([, h]) => h < 44).map(([t, h]) => `${t}:${Math.round(h)}`))
const speakLog = (page) => page.evaluate(() => window.__speak || [])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitUntil(fn, { timeout = 15000, interval = 100 } = {}) {
  const start = Date.now(); let last
  while (Date.now() - start < timeout) { last = await fn(); if (last) return last; await sleep(interval) }
  return last
}
async function loginOnly(page) {
  const home = T(page, 'student-home'); const input = page.getByPlaceholder('이름 입력...')
  await Promise.race([home.waitFor({ state: 'visible', timeout: 90000 }), input.waitFor({ state: 'visible', timeout: 90000 })])
  if (await home.isVisible()) return
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}
// grammar.spec과 같은 방식: speak 호출을 센다(합격 판정은 "클릭당 정확히 +N")
async function installSpeakCounter(page) {
  await page.addInitScript(() => {
    window.__speak = []; window.__cancel = 0
    const s = window.speechSynthesis; if (!s) return
    const orig = s.speak.bind(s); s.speak = (u) => { if ((u.text || '').trim()) window.__speak.push(u.text); return orig(u) }
    const oc = s.cancel.bind(s); s.cancel = () => { window.__cancel += 1; return oc() }
  })
}
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)
const snap = (page) => page.evaluate((rk) => ({ keys: Object.keys(localStorage).sort(), rec: localStorage.getItem(rk) }), recordsKey(QA_STUDENT_ID))
const storageUnchanged = (a, b) => {
  const added = b.keys.filter((k) => !a.keys.includes(k) && !/^(paul_easy_|paulEasyVoca_currentStudent)/.test(k))
  return { ok: added.length === 0 && !b.keys.some((k) => /grammar|gu-|course|selection|scene|park/i.test(k)) && a.rec === b.rec, added }
}
async function speaksExactly(page, base, want) {
  await waitUntil(async () => (await speakLog(page)).length >= base + want.length, { timeout: 3000 })
  await sleep(250)
  const lg = await speakLog(page)
  return lg.length === base + want.length && want.every((w, k) => lg[base + k] === w)
}

// ---- 데이터 ----
const deckOf = (u) => buildDeck(u, UNITS)
const ADD_UNITS = GRAMMAR_UNITS.filter((u) => u.status === 'ready' && u.scene?.mode === 'add')
const correctSet = (c) => (Array.isArray(c) ? c : [c])
const fillIn = (frame, o) => frame.replace('___', o)
// 한 카드가 그리는 그림들(SceneCards의 Pic 호출과 같은 순서): discover=step, compare=left·right, choose=item, build=layout(위치 놓기는 ref), read=pairs, listen=선택지들
const picsOf = (c) => {
  const st = c.step
  switch (c.sceneKind) {
    case 'discover': return [st]
    case 'compare': return [st.left, st.right]
    case 'choose': return [st.items[c.itemIndex]]
    case 'read': return st.pairs
    case 'listen': return st.items[c.itemIndex].options
    case 'build': return [{ layout: st.layout || (st.place.ref !== undefined ? [{ obj: st.place.ref }] : []) }]
    default: return []
  }
}

// ---- 덱 조작 헬퍼 ----
const idxOf = async (page) => Number(await T(page, 'gd-root').getAttribute('data-idx'))
async function nextCard(page, deck) {
  const i = await idxOf(page)
  if (!(await T(page, 'gd-next').isEnabled())) throw new Error(`gd-next 비활성(idx ${i}, ${deck[i]?.id})`)
  await T(page, 'gd-next').click()
  if (!(await waitUntil(async () => (await idxOf(page)) === i + 1, { timeout: 5000 }))) throw new Error(`다음 카드로 안 넘어감(idx ${i}, ${deck[i]?.id})`)
}
// 장면이 아닌 카드: 다음이 열릴 만큼만 맞게 끝낸다(grammar.spec의 completeCard와 같은 접근)
async function tapOrder(page, words, seq) {
  const used = new Set()
  for (const w of seq) { const j = words.findIndex((x, k) => x === w && !used.has(k)); used.add(j); await T(page, `gd-order-word-${j}`).click() }
}
async function completePlain(page, c) {
  if ((await T(page, 'gd-next').count()) === 0 || (await T(page, 'gd-next').isEnabled())) return
  if (c.kind === 'choice') await T(page, `gd-choice-0-opt-${correctSet(c.q.correct)[0]}`).click()
  else if (c.kind === 'blank') { await T(page, `gd-blank-opt-${c.q.correct}`).click(); await T(page, 'gd-check').click() }
  else if (c.kind === 'order') { await tapOrder(page, c.q.words, c.q.answers[0]); await T(page, 'gd-check').click() }
  else if (c.kind === 'build') { await T(page, 'gd-build-input').fill('my own sentence'); await T(page, 'gd-build-compare').click() }
  else if (c.kind === 'use' && c.use) {
    if (c.use.kind === 'speaking') await T(page, 'gd-use-done').click()
    else { await T(page, 'gd-use-input').fill('my own sentence'); await T(page, 'gd-use-compare').click() }
  }
}

// ---- 장면 카드 공통 불변식 ----
// 그림 개수·방식이 데이터와 같은지: park-scene 요소 = 그림 수, timeline 래퍼 수·패널 그림 수, dialogue 래퍼·말풍선 수
async function pictureProblems(page, c) {
  const bad = []; const pics = picsOf(c); const card = T(page, 'gd-card')
  const got = await card.locator('[data-testid="park-scene"]').count()
  if (got !== pics.length) bad.push(`그림 ${got}개≠데이터 ${pics.length}개`)
  const views = pics.map(viewOf)
  const tl = views.filter((v) => v === 'timeline').length, dl = views.filter((v) => v === 'dialogue').length
  const gotTl = await card.locator('[data-testid="park-scene"][data-view="timeline"]').count()
  const gotDl = await card.locator('[data-testid="scene-dialogue"]').count()
  if (gotTl !== tl) bad.push(`timeline ${gotTl}≠${tl}`)
  if (gotDl !== dl) bad.push(`dialogue ${gotDl}≠${dl}`)
  const panelN = pics.reduce((n, p) => n + (viewOf(p) === 'timeline' ? p.panels.length : 0), 0)
  if ((await card.locator('[data-testid^="scene-panel-art-"]').count()) !== panelN) bad.push(`패널 그림 수≠${panelN}`)
  const lineN = pics.reduce((n, p) => n + (viewOf(p) === 'dialogue' ? p.lines.length : 0), 0)
  if ((await card.locator('[data-testid^="scene-line-"]').count()) !== lineN) bad.push(`말풍선 수≠${lineN}`)
  const sizes = await card.locator('[data-testid="park-scene"]').evaluateAll((els) => els.map((el) => { const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)] }))
  if (sizes.some(([w, h]) => w < 20 || h < 20)) bad.push(`그림이 너무 작음 ${JSON.stringify(sizes)}`)
  return bad
}
// 가로 넘침·잘림·작은 버튼, 그림이 카드 폭 안, 이전/다음이 뷰포트 안에 있고 다른 것에 가려지지 않음
async function layoutProblems(page, vp) {
  const bad = []
  if (!(await noOverflow(page))) bad.push('문서 가로 넘침')
  const cl = await clipped(page, 'gd-root'); if (cl.length) bad.push(`뷰포트 밖 요소 ${cl.join(',')}`)
  const small = await smallButtons(page, 'gd-root'); if (small.length) bad.push(`버튼 <44px ${small.join(',')}`)
  const art = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="gd-card"]'); const out = []
    if (!card) return ['gd-card 없음']
    const cr = card.getBoundingClientRect()
    card.querySelectorAll('[data-testid="park-scene"]').forEach((s, k) => { const b = s.getBoundingClientRect(); if (b.width > cr.width + 1 || b.left < cr.left - 1 || b.right > cr.right + 1) out.push(`그림#${k} 가로 밖 ${Math.round(b.left)}~${Math.round(b.right)} / 카드 ${Math.round(cr.left)}~${Math.round(cr.right)}`) })
    return out
  })
  bad.push(...art)
  const navs = await page.evaluate(() => {
    const out = []
    for (const id of ['gd-prev', 'gd-next']) {
      const el = document.querySelector(`[data-testid="${id}"]`); if (!el) continue
      const b = el.getBoundingClientRect()
      const inView = b.bottom <= window.innerHeight + 1 && b.top >= -1 && b.left >= -1 && b.right <= window.innerWidth + 1
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      if (b.height < 56) out.push(`${id}: 높이 ${Math.round(b.height)}<56`)
      if (!inView) out.push(`${id}: 뷰포트 밖 bottom ${Math.round(b.bottom)}/${window.innerHeight}`)
      else if (!(hit && (hit === el || el.contains(hit)))) out.push(`${id}: 다른 요소에 가려짐(${hit?.tagName}.${hit?.getAttribute?.('data-testid') || ''})`)
    }
    return out
  })
  bad.push(...navs)
  if (vp.width <= 390 && (await T(page, 'gd-next').count()) > 0) {
    const nb = await T(page, 'gd-next').evaluate((el) => ({ bottom: el.getBoundingClientRect().bottom, ih: window.innerHeight }))
    if (nb.bottom > nb.ih - 84) bad.push(`gd-next 위젯과 겹침 bottom ${Math.round(nb.bottom)} > ${nb.ih - 84}`)
  }
  return bad
}

export async function run(browser, baseURL) {
  const r = createRecorder('[grammar-scenes]')
  const unmockedRequests = []
  const mockErrors = []
  if (!ADD_UNITS.length) { r.skip('add 장면 단원', "unit.scene.mode === 'add' 인 ready 단원이 아직 없음"); return { results: r.results, unmockedRequests, mockErrors } }
  try { mkdirSync(SHOTS_DIR, { recursive: true }) } catch { /* 폴더를 못 만들면 스크린샷만 건너뜀 */ }

  async function scenario(label, vp, body) {
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const { unmockedRequests: u, apiCallLog } = await installMocks(page)
    await installSpeakCounter(page)
    const name = `${label} [${vp.width}x${vp.height}]`
    const toCourses = async () => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-menu-grammar').click()
      await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 }); await T(page, 'gv-to-courses').click()
      await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 20000 })
    }
    const recover = async () => { await page.goto(baseURL, { waitUntil: 'domcontentloaded' }); await loginOnly(page); await toCourses() }
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, vp, toCourses, recover })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
  }

  // 클릭이 막히면(다른 요소가 가림 등) 실패를 기록하고 dispatchEvent로 이어 간다 — 한 곳의 문제가 단원 전체 순회를 멈추지 않게
  async function tap(loc, tag, what) {
    try { await loc.click({ timeout: 4000 }) } catch (e) { tag(`${what}: 누를 수 없음(${String(e.message).split('\n')[0].slice(0, 90)})`); await loc.dispatchEvent('click') }
  }

  // 장면 카드 하나: 도착 불변식 → 종류별 상호작용(맞게 끝냄) → 끝난 뒤 레이아웃. 문제는 bad에 모은다
  async function sceneCard(page, u, c, i, deck, vp, bad, shots) {
    const st = c.step
    const tag = (m) => bad.push(`${c.id}: ${m}`)
    const card = T(page, 'gd-card')
    const html = async () => norm(await card.innerHTML())
    if (!(await waitUntil(async () => (await T(page, 'gd-card').count()) === 1 && (await idxOf(page)) === i, { timeout: 5000 }))) tag(`도착 실패 idx ${await idxOf(page)}`)
    if ((await T(page, `scene-card-${c.sceneKind}`).count()) !== 1) tag(`scene-card-${c.sceneKind} 없음`)
    if ((await txt(page, 'gd-step')) !== c.stepKo) tag(`단계 이름 ${await txt(page, 'gd-step')}≠${c.stepKo}`)
    for (const m of await pictureProblems(page, c)) tag(m)
    for (const m of await layoutProblems(page, vp)) tag(`도착 ${m}`)
    if ((await T(page, 'scene-result').count()) > 0) tag('답하기 전에 scene-result가 보임')
    if (shots) await shots(c)
    const hint = async () => (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1
    switch (c.sceneKind) {
      case 'discover': {
        if ((await T(page, 'scene-caption').count()) !== 0) tag('탭 전 캡션이 보임')
        if ((await html()).includes(norm(st.tap.en))) tag('탭 전 카드 HTML에 정답 문장이 있음')
        if (!(await hint())) tag('탭 전 다음이 잠김+힌트 아님')
        const obj = st.tap.obj
        let loc
        if (st.panels) { // timeline: focus 칸(그 칸에 대상이 없으면 대상이 있는 첫 칸)에서 누른다
          const has = (p) => p.layout.some((x) => x.obj === obj)
          const pi = st.focus !== undefined && has(st.panels[st.focus]) ? st.focus : st.panels.findIndex(has)
          loc = T(page, `scene-panel-${pi}`).locator(`[data-testid="scene-obj-${obj}-0"]`)
        } else loc = card.locator(`[data-testid="scene-obj-${obj}-0"]`)
        if ((await loc.count()) !== 1) throw new Error(`${c.id}: 탭 대상 scene-obj-${obj}-0 이 그림에 ${await loc.count()}개`)
        const b0 = (await speakLog(page)).length
        await tap(loc, tag, `scene-obj-${obj}-0`)
        if (!(await waitUntil(async () => (await T(page, 'scene-caption').count()) === 1, { timeout: 4000 }))) tag('탭 뒤 캡션이 안 생김')
        else if ((await txt(page, 'scene-caption')) !== st.tap.en) tag(`캡션 '${await txt(page, 'scene-caption')}'≠'${st.tap.en}'`)
        if ((await loc.getAttribute('data-hl')) !== 'true') tag('탭한 물건 강조(data-hl) 안 켜짐')
        if (!(await speaksExactly(page, b0, [st.tap.en]))) tag('탭 speak 정확히 +1·정답 문장 아님')
        if (st.noteKo && !norm(await card.textContent()).includes(norm(st.noteKo))) tag('noteKo 미표시')
        break
      }
      case 'compare': {
        if ((await T(page, 'gd-next').isDisabled())) tag('비교 카드는 다음이 열려 있어야 함')
        if ((await card.locator('[data-testid^="scene-compare-"]').count()) !== 2) tag('비교 그림 칸이 2개 아님')
        for (const [k, s] of [st.left, st.right].entries()) {
          if ((await txt(page, `scene-caption-${k}`)) !== s.en) tag(`캡션 ${k} '${await txt(page, `scene-caption-${k}`)}'≠'${s.en}'`)
        }
        const all = norm(await card.textContent())
        for (const l of st.explainKo || []) if (!all.includes(norm(l))) tag(`explainKo 미표시 '${l}'`)
        for (const [k, s] of [st.left, st.right].entries()) {
          const b0 = (await speakLog(page)).length
          await T(page, `scene-listen-${k}`).click()
          if (!(await speaksExactly(page, b0, [s.en]))) tag(`듣기 ${k} speak 정확히 +1·영어 아님`)
        }
        break
      }
      case 'choose': {
        const it = st.items[c.itemIndex]; const good = fillIn(it.frame, it.options[it.correct]); const w = it.options.findIndex((_, j) => j !== it.correct)
        if ((await txt(page, 'scene-frame')) !== it.frame) tag(`틀 '${await txt(page, 'scene-frame')}'≠'${it.frame}'`)
        if ((await html()).includes(norm(good))) tag('답 전 카드 HTML에 채워진 정답 문장이 있음')
        const opts = await optsByIndex(card) // add 카드는 displayOrder로 섞어 보여 주므로 화면 순서가 아니라 번호(scene-opt-<데이터 번호>)로 맞춘다
        if (JSON.stringify(opts) !== JSON.stringify(it.options)) tag(`보기(번호순) ${JSON.stringify(opts)}≠${JSON.stringify(it.options)}`)
        if (!(await T(page, 'scene-check').isDisabled()) || !(await hint())) tag('고르기 전 확인 활성/다음 열림')
        await T(page, `scene-opt-${w}`).click()
        if ((await txt(page, 'scene-frame')) !== fillIn(it.frame, it.options[w])) tag('오답을 고르면 틀이 그 보기로 채워져야 함')
        await T(page, 'scene-check').click()
        if ((await T(page, 'scene-result').getAttribute('data-ok')) !== 'false') tag('오답 확인 → data-ok=false 아님')
        if ((await T(page, 'scene-retry').count()) !== 1) tag('오답 → 다시 풀기 버튼 없음')
        await T(page, 'scene-retry').click()
        if ((await T(page, 'scene-result').count()) !== 0 || !(await T(page, 'scene-check').isDisabled())) tag('다시 풀기 → 결과 사라짐·확인 비활성이어야 함')
        await T(page, `scene-opt-${it.correct}`).click(); await T(page, 'scene-check').click()
        if ((await T(page, 'scene-result').getAttribute('data-ok')) !== 'true') tag('정답 확인 → data-ok=true 아님')
        if (it.whyKo && !(await txt(page, 'scene-why')).includes(it.whyKo)) tag('whyKo가 설명에 없음')
        if ((await txt(page, 'scene-frame')) !== good) tag('정답 뒤 틀이 채워진 정답 문장이 아님')
        break
      }
      case 'build': {
        const { place } = st; const pos = place.ref !== undefined
        if (!(await hint())) tag('만들기 전 다음이 잠김+힌트 아님')
        if ((await T(page, `scene-tray-${place.obj}`).count()) !== 1) tag('트레이 없음')
        if (pos) {
          const rels = place.relations
          if ((await txt(page, 'scene-frame')) !== st.frameEn) tag(`틀 '${await txt(page, 'scene-frame')}'≠'${st.frameEn}'`)
          const opts = await optsByIndex(card)
          if (JSON.stringify(opts) !== JSON.stringify(rels)) tag(`보기 ${JSON.stringify(opts)}≠relations ${JSON.stringify(rels)}`)
          const sp = await card.locator('[data-testid^="scene-spot-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-relation')))
          if (JSON.stringify([...sp].sort()) !== JSON.stringify([...rels].sort())) tag(`빈 자리 ${JSON.stringify(sp)}≠relations ${JSON.stringify(rels)}`)
          if (!norm(await txt(page, 'scene-placed-count')).includes('0 / 1')) tag('처음 놓은 수가 0 / 1 아님')
          const place1 = async (rel) => { await T(page, `scene-tray-${place.obj}`).click(); await tap(card.locator(`[data-testid^="scene-spot-"][data-relation="${rel}"]`), tag, `빈 자리 ${rel}`) }
          const other = rels.find((x) => x !== rels[0])
          await place1(rels[0])
          if (!norm(await txt(page, 'scene-placed-count')).includes('1 / 1')) tag('놓은 뒤 1 / 1 아님')
          await T(page, `scene-opt-${rels.indexOf(other)}`).click(); await T(page, 'scene-check').click() // 놓은 자리와 다른 관계 → 틀림
          if ((await T(page, 'scene-result').getAttribute('data-ok')) !== 'false') tag('놓은 자리와 다른 관계를 고르면 틀려야 함')
          await T(page, 'scene-retry').click()
          if ((await T(page, 'scene-result').count()) !== 0 || !norm(await txt(page, 'scene-placed-count')).includes('0 / 1')) tag('다시 풀기 → 결과 사라짐·놓은 수 0 / 1이어야 함')
          await place1(rels[0])
          await T(page, `scene-opt-${rels.indexOf(rels[0])}`).click(); await T(page, 'scene-check').click() // 놓은 자리의 관계 → 맞음
        } else {
          for (let k = 0; k < place.n; k++) { await T(page, `scene-tray-${place.obj}`).click(); await tap(T(page, 'scene-spot-0'), tag, 'scene-spot-0') }
          if (!norm(await txt(page, 'scene-placed-count')).includes(`${place.n} / ${place.n}`)) tag(`놓은 수 ${await txt(page, 'scene-placed-count')}`)
          await T(page, `scene-opt-${buildFrame(u.scene, st, place.n).correct}`).click(); await T(page, 'scene-check').click()
        }
        if ((await T(page, 'scene-result').getAttribute('data-ok')) !== 'true') tag('놓은 자리/수에 맞는 문장을 골랐는데 data-ok=true 아님')
        if (st.whyKo && pos && !(await txt(page, 'scene-why')).includes(st.whyKo)) tag('whyKo가 설명에 없음')
        break
      }
      case 'read': {
        const n = st.pairs.length
        const sents = (await card.locator('[data-testid^="scene-sent-"]').allTextContents()).map(norm)
        if (sents.length !== n || !st.pairs.every((p, k) => (sents[k] || '').startsWith(norm(p.en)))) tag('문장 버튼이 데이터와 다름')
        if ((await card.locator('[data-testid^="scene-pic-"]').count()) !== n) tag('그림 버튼 수≠문장 수')
        if (!(await hint())) tag('짝짓기 전 다음이 잠김+힌트 아님')
        for (let k = 0; k < n; k++) { await T(page, `scene-sent-${k}`).click(); await T(page, `scene-pic-${k}`).click() } // 그림 k는 (k+1)번째 문장의 장면이라 k↔k는 일부러 틀린 짝
        await T(page, 'scene-check').click()
        if ((await T(page, 'scene-result').getAttribute('data-ok')) !== 'false') tag('엇갈린 짝 → data-ok=false 아님')
        await T(page, 'scene-retry').click()
        if ((await T(page, 'scene-result').count()) !== 0 || (await T(page, 'scene-sent-0').isDisabled())) tag('다시 풀기 → 결과 사라짐·문장 활성이어야 함')
        for (let k = 0; k < n; k++) { await T(page, `scene-sent-${k}`).click(); await T(page, `scene-pic-${(k - 1 + n) % n}`).click() }
        await T(page, 'scene-check').click()
        if ((await T(page, 'scene-result').getAttribute('data-ok')) !== 'true') tag('모든 짝이 맞는데 data-ok=true 아님')
        for (let k = 0; k < n; k++) if ((await T(page, `scene-sent-${k}`).getAttribute('data-ok')) !== 'true') tag(`문장 ${k} data-ok≠true`)
        break
      }
      case 'listen': {
        const it = st.items[c.itemIndex]; const w = it.options.findIndex((_, j) => j !== it.correct)
        if ((await T(page, 'scene-sentence').count()) !== 0) tag('확인 전 scene-sentence가 보임')
        if ((await html()).includes(norm(it.en))) tag('확인 전 카드 HTML에 듣기 문장이 있음')
        if ((await card.locator('[data-testid^="scene-pic-"]').count()) !== it.options.length) tag('그림 보기 수≠데이터')
        if (!(await T(page, 'scene-check').isDisabled()) || !(await hint())) tag('고르기 전 확인 활성/다음 열림')
        const b0 = (await speakLog(page)).length
        await T(page, 'scene-listen-play').click()
        if (!(await speaksExactly(page, b0, [it.en]))) tag('문장 듣기 speak 정확히 +1·문장 아님')
        if ((await T(page, 'scene-sentence').count()) !== 0 || (await html()).includes(norm(it.en))) tag('문장을 들은 뒤에도 확인 전에는 화면에 문장이 없어야 함')
        await T(page, `scene-pic-${w}`).click(); await T(page, 'scene-check').click()
        if ((await T(page, 'scene-result').getAttribute('data-ok')) !== 'false') tag('오답 그림 → data-ok=false 아님')
        if ((await T(page, 'scene-sentence').count()) !== 1 || (await txt(page, 'scene-sentence')) !== it.en) tag('확인 뒤 문장 공개 안 됨')
        await T(page, 'scene-retry').click()
        if ((await T(page, 'scene-sentence').count()) !== 0 || (await T(page, 'scene-result').count()) !== 0) tag('다시 풀기 → 문장 다시 숨김·결과 없음이어야 함')
        await T(page, `scene-pic-${it.correct}`).click(); await T(page, 'scene-check').click()
        if ((await T(page, 'scene-result').getAttribute('data-ok')) !== 'true') tag('정답 그림 → data-ok=true 아님')
        if ((await txt(page, 'scene-sentence')) !== it.en) tag('정답 뒤 문장 표시')
        if (it.whyKo && !(await txt(page, 'scene-why')).includes(it.whyKo)) tag('whyKo가 설명에 없음')
        break
      }
      default: tag(`add 장면에서 쓰지 않는 종류 ${c.sceneKind}`)
    }
    if (!(await T(page, 'gd-next').isEnabled())) tag('끝낸 뒤에도 다음이 잠김')
    for (const m of await layoutProblems(page, vp)) tag(`끝난 뒤 ${m}`)
  }

  // 한 단원: 열기 → 덱 전체 순회(장면 카드는 sceneCard, 나머지는 최소 완료) → 요약 확인. 문제는 모아서 한 번에 판정한다
  async function walkUnit(page, u, vp, shotsOn) {
    const deck = deckOf(u); const bad = []
    await T(page, `grammar-unit-${u.id}`).click(); await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 10000 })
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
    if ((await T(page, 'gd-root').getAttribute('data-total')) !== String(deck.length)) bad.push(`data-total≠${deck.length}`)
    const sceneCount = deck.filter((c) => c.kind === 'scene').length
    let firstExplain = true, firstPractice = true
    const shots = shotsOn ? async (c) => {
      const kind = c.slot === 'practice' ? (firstPractice ? 'practice' : null) : (firstExplain ? 'explain' : null)
      if (!kind) return
      if (kind === 'practice') firstPractice = false; else firstExplain = false
      await page.evaluate(() => { document.querySelector('[data-testid="gd-card"]')?.scrollTo(0, 0); window.scrollTo(0, 0) })
      await waitUntil(() => page.evaluate(() => document.getAnimations().every((a) => a.playState !== 'running')), { timeout: 3000 })
      await page.screenshot({ path: `${SHOTS_DIR}\\scenes-${u.id}-${kind}.png`, fullPage: true }).catch(() => {})
    } : null
    for (let i = 0; i < deck.length; i++) {
      const c = deck[i]
      const shown = await T(page, 'gd-card').getAttribute('data-id')
      if (shown !== c.id) throw new Error(`카드 불일치: 화면 ${shown} / 덱 ${c.id}`)
      if (c.kind === 'summary') break
      if (c.kind === 'scene') await sceneCard(page, u, c, i, deck, vp, bad, shots)
      else await completePlain(page, c)
      await nextCard(page, deck)
    }
    const sum = norm(await txt(page, 'gd-summary-counts').catch(() => ''))
    if (!(await T(page, 'gd-summary').isVisible().catch(() => false))) bad.push('마지막 카드가 요약이 아님')
    else if (!sum.includes('틀림 0') || !sum.includes(`맞힘 ${deckCounts(deck).practice}`)) bad.push(`요약 '${sum}' (틀림 0·맞힘 ${deckCounts(deck).practice} 기대)`)
    return { bad, sceneCount, total: deck.length }
  }

  // 단원들을 과정 순서대로 걷는다. 한 단원이 예외로 멈추면 그 단원만 실패로 적고 홈부터 다시 들어가 이어 간다
  async function walkUnits({ page, name, vp, toCourses, recover }, units, shotsOn) {
    await toCourses()
    const before = await snap(page)
    let course = null
    for (const u of units) {
      if (course !== u.courseId) {
        if (course) await T(page, 'grammar-units-back').click()
        await T(page, `grammar-course-${u.courseId}`).click(); await T(page, 'grammar-units').waitFor({ state: 'visible', timeout: 10000 })
        course = u.courseId
      }
      try {
        const { bad, sceneCount, total } = await walkUnit(page, u, vp, shotsOn)
        r.check(`${name} ${u.id}: 덱 ${total}장 중 장면 카드 ${sceneCount}장 — 그림·넘침·다음 버튼·종류별 상호작용·요약 전부 통과`, bad.length === 0 && sceneCount > 0, bad.slice(0, 6).join(' | '))
        await T(page, 'gu-back').click(); await T(page, 'grammar-units').waitFor({ state: 'visible', timeout: 10000 })
      } catch (err) {
        r.check(`${name} ${u.id}: 시나리오 예외 없음`, false, String(err.message).split('\n')[0].slice(0, 300))
        await recover(); course = null
      }
    }
    if (course) await T(page, 'grammar-units-back').click()
    await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 10000 })
    const su = storageUnchanged(before, await snap(page))
    r.check(`${name} 전부 푼 뒤 문법·장면 관련 새 localStorage 키 없음, Unit 기록 불변(앱 자체 키 허용)`, su.ok, su.added.join(','))
  }

  r.check(`add 장면 단원 ${ADD_UNITS.length}개를 데이터에서 찾음(과정 ${[...new Set(ADD_UNITS.map((u) => u.courseId))].join(',')})`, ADD_UNITS.every((u) => deckOf(u).some((c) => c.kind === 'scene')))
  const ordered = GRAMMAR_COURSES.flatMap((c) => ADD_UNITS.filter((u) => u.courseId === c.id))
  r.check('순회 대상이 add 단원 전부와 같음(과정 순서로 재배열했을 뿐)', ordered.length === ADD_UNITS.length)

  // 모바일 360x640: 모든 add 단원, 단원마다 첫 설명 장면·첫 연습 장면 전체 화면 캡처
  await scenario('a 모든 add 장면 단원 순회', MOBILE, async (ctx) => { await walkUnits(ctx, ordered, true) })
  // 데스크톱 1280x800: 과정마다 첫 add 단원 하나
  const firsts = GRAMMAR_COURSES.map((c) => ordered.find((u) => u.courseId === c.id)).filter(Boolean)
  await scenario('b 데스크톱 과정별 첫 단원', DESKTOP, async (ctx) => { await walkUnits(ctx, firsts, false) })

  return { results: r.results, unmockedRequests, mockErrors }
}
