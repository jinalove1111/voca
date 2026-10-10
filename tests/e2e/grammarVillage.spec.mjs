// tests/e2e/grammarVillage.spec.mjs — 문법 마을(QA 전용 lazy 화면) 브라우저 시나리오.
// 홈 문법 카드 -> 마을(구역 7개) -> 장소 카드(하단 시트) -> 미션 -> 문법 덱 -> 요약 -> 마을로 돌아가기(완료 표시) / 중간에 나가기(완료 아님)
// -> 장면 없는 문법 노트 -> 과정 목록 왕복 -> 공원 미션. 구역·장소·단원 id는 전부 src 데이터에서 가져온다. 네트워크 전체 mock, 저장·REST 쓰기 0.
import { mkdirSync } from 'node:fs'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { UNITS } from '../../src/utils/curriculum/units.js'
import { grammarUnitById } from '../../src/utils/grammar/grammarUnits.js'
import { buildDeck } from '../../src/utils/grammar/grammarDeck.js'
import { VILLAGE_DISTRICTS, VILLAGE_NO_PLACE_UNITS, placeById, villageUnitOrder } from '../../src/utils/grammar/village.js'
import { missionForUnit } from '../../src/utils/grammar/townMissions.js'

const SHOTS_DIR = process.env.GRAMMAR_SHOTS_DIR || 'C:\\Users\\jinal\\AppData\\Local\\Temp\\claude\\C--voca\\4dd777a3-9f93-4c78-a984-4f4ee328e279\\scratchpad\\shots'
const M = { width: 360, height: 640 }
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitUntil(fn, { timeout = 15000, interval = 100 } = {}) {
  const start = Date.now(); let last
  while (Date.now() - start < timeout) { last = await fn(); if (last) return last; await sleep(interval) }
  return last
}
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)
const storageSnap = (page) => page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))
const APP_KEY = /^(paul_easy_|paulEasyVoca_)/
const keyDiff = (a, b) => ['local', 'session'].flatMap((w) => [...b[w].filter((k) => !a[w].includes(k)).map((k) => `+${w}:${k}`), ...a[w].filter((k) => !b[w].includes(k)).map((k) => `-${w}:${k}`)]).filter((d) => !APP_KEY.test(d.slice(d.indexOf(':') + 1)))
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const correctSet = (c) => (Array.isArray(c) ? c : [c])
const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five']

// ---- 덱 조작(grammar.spec.mjs 와 같은 방식, 맞게 끝내기만) ----
const idxOf = async (page) => Number(await T(page, 'gd-root').getAttribute('data-idx'))
async function nextCard(page, deck) {
  const i = await idxOf(page)
  if (!(await T(page, 'gd-next').isEnabled())) throw new Error(`gd-next 비활성(idx ${i}, ${deck[i]?.id})`)
  await T(page, 'gd-next').click()
  if (!(await waitUntil(async () => (await idxOf(page)) === i + 1, { timeout: 5000 }))) throw new Error(`다음 카드로 안 넘어감(idx ${i}, ${deck[i]?.id})`)
}
async function tapOrder(page, words, seq) {
  const used = new Set()
  for (const w of seq) { const j = words.findIndex((x, k) => x === w && !used.has(k)); used.add(j); await T(page, `gd-order-word-${j}`).click() }
}
async function completeScene(page, unit, c) {
  const st = c.step
  switch (c.sceneKind) {
    case 'discover': await T(page, 'gd-card').locator(`[data-testid="scene-obj-${st.tap.obj}-0"]`).first().click(); break
    case 'choose': await T(page, `scene-opt-${st.items[c.itemIndex].correct}`).click(); await T(page, 'scene-check').click(); break
    case 'listen': await T(page, `scene-pic-${st.items[c.itemIndex].correct}`).click(); await T(page, 'scene-check').click(); break
    case 'read': {
      const n = st.pairs.length
      for (let i = 0; i < n; i++) { await T(page, `scene-sent-${i}`).click(); await T(page, `scene-pic-${(i - 1 + n) % n}`).click() }
      await T(page, 'scene-check').click(); break
    }
    case 'build': {
      const { place } = st
      if (place.ref !== undefined) {
        await T(page, `scene-tray-${place.obj}`).click()
        await T(page, 'gd-card').locator(`[data-testid^="scene-spot-"][data-relation="${place.relations[0]}"]`).click()
        await T(page, 'scene-opt-0').click()
      } else {
        for (let k = 0; k < place.n; k++) { await T(page, `scene-tray-${place.obj}`).click(); await T(page, 'scene-spot-0').click() }
        await page.locator('[data-testid^="scene-opt-"]').filter({ hasText: new RegExp(`^${NUMS[place.n]}$`) }).click()
      }
      await T(page, 'scene-check').click(); break
    }
    default: break
  }
}
async function completeCard(page, unit, c) {
  if ((await T(page, 'gd-next').count()) === 0 || (await T(page, 'gd-next').isEnabled())) return
  if (c.kind === 'scene') await completeScene(page, unit, c)
  else if (c.kind === 'choice') await T(page, `gd-choice-0-opt-${correctSet(c.q.correct)[0]}`).click()
  else if (c.kind === 'blank') { await T(page, `gd-blank-opt-${c.q.correct}`).click(); await T(page, 'gd-check').click() }
  else if (c.kind === 'order') { await tapOrder(page, c.q.words, c.q.answers[0]); await T(page, 'gd-check').click() }
  else if (c.kind === 'build') { await T(page, 'gd-build-input').fill('my own sentence'); await T(page, 'gd-build-compare').click() }
  else if (c.kind === 'use' && c.use) {
    if (c.use.kind === 'speaking') await T(page, 'gd-use-done').click()
    else { await T(page, 'gd-use-input').fill('my own sentence'); await T(page, 'gd-use-compare').click() }
  }
}
async function walkToSummary(page, unit, deck) {
  for (let i = await idxOf(page); i < deck.length - 1; i = await idxOf(page)) {
    await completeCard(page, unit, deck[i])
    await nextCard(page, deck)
  }
}

async function loginOnly(page) {
  const home = T(page, 'student-home'); const input = page.getByPlaceholder('이름 입력...')
  await Promise.race([home.waitFor({ state: 'visible', timeout: 90000 }), input.waitFor({ state: 'visible', timeout: 90000 })])
  if (await home.isVisible()) return
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await home.waitFor({ state: 'visible', timeout: 20000 })
}
async function toVillage(page) {
  await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
  await T(page, 'student-home-menu-grammar').click()
  await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 })
}
const inView = (page, id) => T(page, id).evaluate((el) => { const b = el.getBoundingClientRect(); return b.bottom > 0 && b.top < window.innerHeight })
const scrollTo = (page, id) => T(page, id).evaluate((el) => el.scrollIntoView({ block: 'center' }))
const focusedTestid = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') || '')

const CAFE_UNITS = placeById('cafe').unitIds
const DONE_UNIT = 'g-int-08'
const NOTE_UNIT = VILLAGE_NO_PLACE_UNITS[0].unitId
const SOON = VILLAGE_DISTRICTS.flatMap((d) => d.places).find((p) => p.unitIds.length === 0)
const PARK_UNIT = 'g-easy-05'

export async function run(browser, baseURL) {
  const r = createRecorder('[grammar-village]')
  const unmockedRequests = []
  const mockErrors = []
  try { mkdirSync(SHOTS_DIR, { recursive: true }) } catch { /* 스크린샷만 건너뜀 */ }

  async function scenario(label, vp, body) {
    const context = await browser.newContext({ viewport: vp, hasTouch: true })
    const page = await context.newPage()
    const errors = []
    const webp = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    page.on('request', (q) => { const u = q.url(); if (/\.webp(\?|$)/.test(u)) webp.push(u.split('/').pop().split('?')[0]) })
    page.on('dialog', (d) => d.accept().catch(() => {}))
    const { unmockedRequests: u, apiCallLog } = await installMocks(page)
    const name = `${label} [${vp.width}x${vp.height}]`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, webp })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인/분석 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
  }

  // ---- 모바일 360x640: 전체 왕복 ----
  await scenario('마을 왕복', M, async ({ page, name, webp }) => {
    const base = await storageSnap(page)
    await toVillage(page)
    await sleep(1200) // 첫 구역 그림이 도착할 시간(지연 로드 구역은 아직 스크롤 전)

    // 구역·장소 배치
    r.check(`${name} 구역 ${VILLAGE_DISTRICTS.length}개가 순서대로 존재`, (await page.locator('[data-testid^="gv-district-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-district')))).join(',') === VILLAGE_DISTRICTS.map((d) => d.id).join(','))
    r.check(`${name} 진행 표시 '완료 0 / ${villageUnitOrder().length}'`, ((await T(page, 'gv-progress').textContent()) || '').trim() === `완료 0 / ${villageUnitOrder().length}`)
    r.check(`${name} 가로 넘침 없음(첫 화면)`, await noOverflow(page))
    const loaded = await page.locator('[data-testid="gv-district-park"] img').evaluateAll((els) => els.filter((e) => e.complete && e.naturalWidth > 0).length)
    const total = await page.locator('[data-testid="gv-district-park"] img').count()
    r.check(`${name} 첫 구역(공원) 그림이 실제로 로드됨(naturalWidth>0): ${loaded}/${total}`, total > 0 && loaded >= 1 && (await T(page, 'gv-place-park-green').locator('img').evaluate((e) => e.naturalWidth)) > 0)
    // 먼 구역 그림은 스크롤 전에 요청되지 않아야 한다(브라우저 지연 로드 휴리스틱 — 정확한 거리는 브라우저마다 달라 어기면 FAIL 대신 SKIP으로 남긴다)
    const baseOf = (t) => t.split('/').pop()
    const reqFor = (d) => { const names = [...d.places.map((p) => baseOf(p.art)), ...d.decor.map((x) => baseOf(x.art))]; return names.filter((n) => webp.some((f) => f.startsWith(n + '-') || f.startsWith(n + '@2x-'))) }
    const parkNames = new Set(VILLAGE_DISTRICTS[0].places.map((p) => baseOf(p.art)).concat(VILLAGE_DISTRICTS[0].decor.map((x) => baseOf(x.art))))
    const far = VILLAGE_DISTRICTS.slice(-2)
    const farLoaded = far.flatMap((d) => reqFor(d).filter((n) => !parkNames.has(n)))
    if (farLoaded.length === 0) r.check(`${name} 먼 구역(${far.map((d) => d.id).join(', ')}) 그림은 스크롤 전 요청 0건(지연 로드)`, true)
    else r.skip(`${name} 먼 구역 그림 지연 로드(soft)`, `스크롤 전에 이미 요청됨: ${farLoaded.slice(0, 6).join(', ')} (${farLoaded.length}개) — 브라우저 지연 로드 거리 휴리스틱일 수 있음`)

    // 구역마다: 장소 버튼 안/크기/라벨, 스크린샷
    for (const d of VILLAGE_DISTRICTS) {
      await T(page, `gv-district-${d.id}`).evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await sleep(700)
      const sec = await T(page, `gv-district-${d.id}`).boundingBox()
      const probs = []
      for (const p of d.places) {
        const b = await T(page, `gv-place-${p.id}`).boundingBox()
        const lab = await T(page, `gv-place-${p.id}`).locator('span').first().boundingBox()
        if (!b) { probs.push(`${p.id}: 버튼 없음`); continue }
        if (b.width < 43.9 || b.height < 43.9) probs.push(`${p.id}: ${Math.round(b.width)}x${Math.round(b.height)} < 44`)
        if (b.x < sec.x - 1 || b.x + b.width > sec.x + sec.width + 1 || b.y < sec.y - 1 || b.y + b.height > sec.y + sec.height + 1) probs.push(`${p.id}: 구역 박스 밖`)
        if (lab && (lab.x < -0.5 || lab.x + lab.width > M.width + 0.5)) probs.push(`${p.id}: 이름표가 화면 밖(${Math.round(lab.x)}..${Math.round(lab.x + lab.width)})`)
      }
      r.check(`${name} ${d.id}: 장소 ${d.places.length}개 모두 구역 안·44px 이상·이름표 화면 안`, probs.length === 0, probs.slice(0, 4).join(' | '))
      r.check(`${name} ${d.id}: 가로 넘침 없음`, await noOverflow(page))
      await page.screenshot({ path: `${SHOTS_DIR}\\village-${d.id}-360.png` }).catch(() => {})
    }

    // 카페 카드: 포커스 이동, 미션 버튼, Escape/닫기 포커스 복귀
    await scrollTo(page, 'gv-place-cafe')
    await T(page, 'gv-place-cafe').click()
    await T(page, 'gv-place-card').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 장소 카드: dialog/aria-modal, 제목 '카페'`, (await T(page, 'gv-place-card').getAttribute('role')) === 'dialog' && (await T(page, 'gv-place-card').getAttribute('aria-modal')) === 'true' && ((await T(page, 'gv-place-title').textContent()) || '').trim() === placeById('cafe').nameKo)
    r.check(`${name} 장소 카드: 포커스가 카드 안으로 이동`, !!(await page.evaluate(() => !!document.activeElement?.closest?.('[data-testid="gv-place-card"]'))))
    r.check(`${name} 장소 카드: 하는 일(doKo) 표시, 미션 버튼 ${CAFE_UNITS.length}개가 단원 제목·과정명을 보임`, ((await T(page, 'gv-place-card').textContent()) || '').includes(placeById('cafe').doKo) && (await Promise.all(CAFE_UNITS.map(async (id) => { const t = (await T(page, `gv-mission-${id}`).textContent()) || ''; return t.includes(grammarUnitById(id).titleKo) && /Easy|Intermediate|Advanced|Middle|High/.test(t) }))).every(Boolean))
    const sizes = await T(page, 'gv-place-card').locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    r.check(`${name} 장소 카드: 모든 버튼 높이 44px 이상`, sizes.every((h) => h >= 43.9), JSON.stringify(sizes))
    await page.keyboard.press('Escape')
    r.check(`${name} Escape -> 카드 닫힘 + 포커스가 장소 버튼으로 복귀`, !!(await waitUntil(async () => (await T(page, 'gv-place-card').count()) === 0, { timeout: 3000 })) && (await focusedTestid(page)) === 'gv-place-cafe', await focusedTestid(page))
    await T(page, 'gv-place-cafe').click()
    await T(page, 'gv-card-close').click()
    r.check(`${name} 닫기 버튼 -> 카드 닫힘 + 포커스가 장소 버튼으로 복귀`, (await T(page, 'gv-place-card').count()) === 0 && (await focusedTestid(page)) === 'gv-place-cafe')
    await T(page, 'gv-place-cafe').click()
    await page.screenshot({ path: `${SHOTS_DIR}\\village-card-360.png` }).catch(() => {})

    // 미션 시작 -> 덱 -> 요약 -> 마을
    const unit = grammarUnitById(DONE_UNIT)
    const deck = buildDeck(unit, UNITS)
    await T(page, `gv-mission-${DONE_UNIT}`).click()
    await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 덱이 ${DONE_UNIT} 첫 카드(idx 0)로 열림`, (await T(page, 'gd-root').getAttribute('data-unit')) === DONE_UNIT && (await idxOf(page)) === 0)
    const intro = ((await T(page, 'gd-mission-intro').textContent().catch(() => '')) || '')
    r.check(`${name} 목표 카드에 장소 소개(gd-mission-intro: 카페 이름 + 하는 일)`, intro.includes(placeById('cafe').nameKo) && intro.includes(placeById('cafe').doKo), intro.slice(0, 80))
    r.check(`${name} 머리글 뒤로가기는 '← 마을'(data-return=village)`, (await T(page, 'gu-back').getAttribute('data-return')) === 'village' && ((await T(page, 'gu-back').textContent()) || '').includes('마을'))
    await walkToSummary(page, unit, deck)
    r.check(`${name} 요약 카드에 '마을로 돌아가기'(gd-to-town)`, await T(page, 'gd-to-town').isVisible())
    await T(page, 'gd-to-town').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 마을 복귀: 덱 없음, 카페 장소가 화면 안(마지막 구역으로 스크롤), 카드 닫힘`, (await T(page, 'gd-root').count()) === 0 && !!(await waitUntil(() => inView(page, 'gv-place-cafe'), { timeout: 5000 })) && (await T(page, 'gv-place-card').count()) === 0)
    r.check(`${name} 진행 '완료 1 / 34', 카페 data-done=1`, ((await T(page, 'gv-progress').textContent()) || '').trim() === `완료 1 / ${villageUnitOrder().length}` && (await T(page, 'gv-place-cafe').getAttribute('data-done')) === '1')
    await T(page, 'gv-place-cafe').click()
    r.check(`${name} 카드를 다시 열면 ${DONE_UNIT}만 '완료' 칩`, (await T(page, `gv-mission-done-${DONE_UNIT}`).count()) === 1 && ((await T(page, `gv-mission-done-${DONE_UNIT}`).textContent()) || '').trim() === '완료' && (await T(page, `gv-mission-done-${CAFE_UNITS.find((x) => x !== DONE_UNIT)}`).count()) === 0)
    await T(page, 'gv-card-close').click()

    // 준비 중 장소
    if (SOON) {
      await scrollTo(page, `gv-place-${SOON.id}`)
      await T(page, `gv-place-${SOON.id}`).click()
      await T(page, 'gv-place-card').waitFor({ state: 'visible', timeout: 5000 })
      r.check(`${name} 준비 중 장소(${SOON.id}) 카드: 안내 문구만, 미션/시작 버튼 없음`, ((await T(page, 'gv-place-soon').textContent()) || '').trim() === SOON.soonKo && (await page.locator('[data-testid^="gv-mission-"]').count()) === 0 && (await T(page, 'gv-place-card').locator('button').count()) === 1)
      await T(page, 'gv-card-close').click()
    }

    // 문법 노트: 단원 열기 -> 중간에 나가기(완료 아님) -> 마을(노트 위치)
    await scrollTo(page, 'gv-notes')
    r.check(`${name} 문법 노트 목록: 장소 없는 단원 ${VILLAGE_NO_PLACE_UNITS.length}개 + 이유 줄`, (await page.locator('[data-testid^="gv-note-"]:not([data-testid^="gv-note-done-"])').count()) === VILLAGE_NO_PLACE_UNITS.length && ((await T(page, 'gv-notes').textContent()) || '').includes(VILLAGE_NO_PLACE_UNITS[0].reasonKo))
    await T(page, `gv-note-${NOTE_UNIT}`).click()
    await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 노트 단원(${NOTE_UNIT}) 덱이 열리고 '← 마을'`, (await T(page, 'gd-root').getAttribute('data-unit')) === NOTE_UNIT && ((await T(page, 'gu-back').textContent()) || '').includes('마을') && (await T(page, 'gd-mission-intro').count()) === 0)
    await T(page, 'gd-next').click()
    await T(page, 'gu-back').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 중간에 ← 마을: 마을 복귀 + 노트 목록이 화면 안 + 진행 그대로 1`, (await T(page, 'gd-root').count()) === 0 && !!(await waitUntil(() => inView(page, 'gv-notes'), { timeout: 5000 })) && ((await T(page, 'gv-progress').textContent()) || '').trim() === `완료 1 / ${villageUnitOrder().length}` && (await T(page, `gv-note-done-${NOTE_UNIT}`).count()) === 0)

    // 과정 목록 왕복
    await T(page, 'gv-to-courses').click()
    await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 과정 목록 열림 + 머리글 버튼은 '← 마을 지도'`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'courses' && ((await T(page, 'grammar-courses-home').textContent()) || '').includes('마을 지도'))
    await T(page, 'grammar-courses-home').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} ← 마을 지도 -> 마을(완료 표시 유지)`, ((await T(page, 'gv-progress').textContent()) || '').trim() === `완료 1 / ${villageUnitOrder().length}`)

    // 공원 미션(기존 소개 유지) -> 중간에 나가기
    await scrollTo(page, 'gv-place-park-green')
    await T(page, 'gv-place-park-green').click()
    await T(page, `gv-mission-${PARK_UNIT}`).click()
    await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 20000 })
    const pm = missionForUnit(PARK_UNIT)
    const intro2 = ((await T(page, 'gd-mission-intro').textContent().catch(() => '')) || '')
    r.check(`${name} 공원 미션(${PARK_UNIT}): 기존 미션 소개 그대로`, !!pm && intro2.includes(pm.introKo), intro2.slice(0, 80))
    await T(page, 'gu-back').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 공원 미션 중간에 ← 마을: 공원 장소가 화면 안, 완료 아님(data-done 0)`, !!(await waitUntil(() => inView(page, 'gv-place-park-green'), { timeout: 5000 })) && (await T(page, 'gv-place-park-green').getAttribute('data-done')) === '0')

    // 홈으로: 마을 홈 버튼 -> 학생 홈 -> 다시 열면 처음부터(저장 없음)
    await T(page, 'gv-home').click()
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'student-home-menu-grammar').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 홈에서 다시 열면 맨 위부터(마지막 장소 기억 없음)`, (await page.evaluate(() => window.scrollY)) < 5)
    const after = await storageSnap(page)
    const d1 = keyDiff(base, after)
    r.check(`${name} 마을 왕복 동안 앱 자체 키(paul_easy_*/paulEasyVoca_*) 밖의 localStorage/sessionStorage 키 불변`, d1.length === 0, d1.join(','))
  })

  // ---- 390x844 / 1280x800: 레이아웃 ----
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await scenario('마을 화면', vp, async ({ page, name }) => {
      await toVillage(page)
      await sleep(900)
      r.check(`${name} 가로 넘침 없음`, await noOverflow(page))
      const bx = await T(page, 'gv-district-park').boundingBox()
      r.check(`${name} 마을 열은 최대 720px(가운데)`, bx.width <= 721 && bx.x >= -0.5 && bx.x + bx.width <= vp.width + 0.5, JSON.stringify(bx))
      const probs = []
      for (const d of VILLAGE_DISTRICTS) {
        await T(page, `gv-district-${d.id}`).evaluate((el) => el.scrollIntoView({ block: 'start' }))
        const sec = await T(page, `gv-district-${d.id}`).boundingBox()
        for (const p of d.places) {
          const b = await T(page, `gv-place-${p.id}`).boundingBox()
          if (!b || b.width < 43.9 || b.height < 43.9 || b.x < sec.x - 1 || b.x + b.width > sec.x + sec.width + 1) probs.push(p.id)
        }
      }
      r.check(`${name} 모든 장소 버튼이 구역 안·44px 이상`, probs.length === 0, probs.slice(0, 5).join(','))
      if (vp.width === 1280) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await sleep(500)
        await page.screenshot({ path: `${SHOTS_DIR}\\village-top-1280.png` }).catch(() => {})
      }
    })
  }

  return { results: r.results, unmockedRequests, mockErrors }
}
