// tests/e2e/townMission.spec.mjs — 2.5D 마을 공원 미션(g-easy-05) 왕복 시나리오.
// 홈 -> 마을(proto25d) -> 표지판 탭 -> 걷기 -> "공원 미션 시작" -> 문법 덱(상황 소개) -> 요약 -> 마을로 돌아가기(완료 표시)
// -> 다시 들어갔다 중간에 ← 마을 -> 홈 문법 카드 경로(뒤로 가면 문법 화면, 마을 아님). 네트워크 전체 mock, 저장 0.
// 표지판은 pointer-events-none(벤치와 같은 관례, 탭은 바닥의 world 좌표 판정)이라 실제 좌표 터치(CDP)로 누른다.
import { mkdirSync } from 'node:fs'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { UNITS } from '../../src/utils/curriculum/units.js'
import { grammarUnitById } from '../../src/utils/grammar/grammarUnits.js'
import { buildDeck } from '../../src/utils/grammar/grammarDeck.js'

const VP = { width: 390, height: 844 }
const SHOTS_DIR = process.env.GRAMMAR_SHOTS_DIR || 'C:\\Users\\jinal\\AppData\\Local\\Temp\\claude\\C--voca\\4dd777a3-9f93-4c78-a984-4f4ee328e279\\scratchpad\\shots'
const UNIT_ID = 'g-easy-05'
const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five']
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitUntil(fn, { timeout = 15000, interval = 100 } = {}) {
  const start = Date.now(); let last
  while (Date.now() - start < timeout) { last = await fn(); if (last) return last; await sleep(interval) }
  return last
}
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)
const finishEvents = (log) => log.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/product_events') && JSON.stringify(c.body || '').includes('grammar_scene_finish')).length
const storageSnap = (page) => page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))

const U = grammarUnitById(UNIT_ID)
const DECK = U?.scene ? buildDeck(U, UNITS) : []
const S = (kind) => U.scene.steps.find((s) => s.kind === kind)

// ---- 덱 조작(grammarScene.spec.mjs 와 같은 방식, 맞게 끝내기만) ----
const idxOf = async (page) => Number(await T(page, 'gd-root').getAttribute('data-idx'))
async function nextCard(page) {
  const i = await idxOf(page)
  if (!(await T(page, 'gd-next').isEnabled())) throw new Error(`gd-next 비활성(idx ${i}, ${DECK[i]?.id})`)
  await T(page, 'gd-next').click()
  if (!(await waitUntil(async () => (await idxOf(page)) === i + 1, { timeout: 5000 }))) throw new Error(`다음 카드로 안 넘어감(idx ${i})`)
}
const numOpt = (page, word) => page.locator('[data-testid^="scene-opt-"]').filter({ hasText: new RegExp(`^${word}$`) })
async function buildCorrect(page) {
  const { place } = S('build')
  for (let k = 0; k < place.n; k++) { await T(page, `scene-tray-${place.obj}`).click(); await T(page, 'scene-spot-0').click() }
  await numOpt(page, NUMS[place.n]).click()
  await T(page, 'scene-check').click()
}
const readJ = (n, i) => (i - 1 + n) % n
async function completeScene(page, c) {
  if ((await T(page, 'gd-next').count()) === 0 || (await T(page, 'gd-next').isEnabled())) return
  const st = c.step
  switch (c.sceneKind) {
    case 'discover': await T(page, `scene-obj-${st.tap.obj}-0`).click(); break
    case 'choose': { const it = st.items[c.itemIndex]; await T(page, `scene-opt-${it.correct}`).click(); await T(page, 'scene-check').click(); break }
    case 'build': await buildCorrect(page); break
    case 'read': {
      const n = st.pairs.length
      for (let i = 0; i < n; i++) { await T(page, `scene-sent-${i}`).click(); await T(page, `scene-pic-${readJ(n, i)}`).click() }
      await T(page, 'scene-check').click(); break
    }
    case 'listen': { const it = st.items[c.itemIndex]; await T(page, `scene-pic-${it.correct}`).click(); await T(page, 'scene-check').click(); break }
    case 'speak': if (c.mode === 'exam') await T(page, 'scene-reveal').click(); else await T(page, 'scene-said').click(); break
    case 'write': await T(page, 'scene-write-input').fill('There is a bench.'); await T(page, 'scene-write-compare').click(); break
    default: break
  }
}
async function advanceTo(page, targetIdx) {
  for (let i = await idxOf(page); i < targetIdx; i = await idxOf(page)) {
    await completeScene(page, DECK[i])
    await nextCard(page)
  }
}

// ---- 마을 헬퍼 ----
async function loginOnly(page) {
  const home = T(page, 'student-home'); const input = page.getByPlaceholder('이름 입력...')
  await Promise.race([home.waitFor({ state: 'visible', timeout: 90000 }), input.waitFor({ state: 'visible', timeout: 90000 })])
  if (await home.isVisible()) return
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await home.waitFor({ state: 'visible', timeout: 20000 })
}
async function enterTown(page) {
  await T(page, 'student-home-town').waitFor({ state: 'visible', timeout: 15000 })
  await T(page, 'student-home-town').click()
  await T(page, 'proto25d-root').waitFor({ state: 'visible', timeout: 20000 })
}
async function tapSpot(context, page) {
  const spot = T(page, 'proto25d-mission-spot-park')
  await spot.waitFor({ state: 'attached', timeout: 15000 })
  const b = await spot.boundingBox()
  const cdp = await context.newCDPSession(page)
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach().catch(() => {})
}
async function startFromTown(context, page) {
  await tapSpot(context, page)
  await T(page, 'proto25d-mission-enter').waitFor({ state: 'visible', timeout: 20000 })
  await T(page, 'proto25d-mission-enter').click()
  await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 20000 })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[town-mission]')
  const unmockedRequests = []
  const mockErrors = []
  if (!U?.scene) { r.skip('공원 미션', `${UNIT_ID}에 scene 데이터가 없음`); return { results: r.results, unmockedRequests, mockErrors } }
  try { mkdirSync(SHOTS_DIR, { recursive: true }) } catch { /* 스크린샷만 건너뜀 */ }

  async function scenario(label, vp, body) {
    const context = await browser.newContext({ viewport: vp, hasTouch: true })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    page.on('dialog', (d) => d.accept().catch(() => {}))
    // 마을 플래그 ON + 산책 모드 OFF(고정 카메라, townProto25d.spec 와 같은 시드)
    await page.addInitScript(() => {
      try { localStorage.setItem('paulEasyVoca_features', JSON.stringify({ studentHomeMenu: true, paulTown2_5d: true })) } catch { /* 무시 */ }
      try { localStorage.setItem('paulEasyVoca_proto25dWalkMode', 'off') } catch { /* 무시 */ }
    })
    const { unmockedRequests: u, apiCallLog } = await installMocks(page)
    const name = `${label} [${vp.width}x${vp.height}]`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, context, name, apiCallLog })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인/분석 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
  }

  // ---- 전체 왕복 ----
  await scenario('왕복', VP, async ({ page, context, name, apiCallLog }) => {
    await enterTown(page)
    r.check(`${name} 마을: 표지판 role=button/aria-label 공원 미션, 완료 표시·시작 버튼 아직 없음`,
      (await T(page, 'proto25d-mission-spot-park').getAttribute('role')) === 'button' && (await T(page, 'proto25d-mission-spot-park').getAttribute('aria-label')) === '공원 미션'
      && (await T(page, 'proto25d-mission-done-park').count()) === 0 && (await T(page, 'proto25d-mission-enter').count()) === 0)
    const base = await storageSnap(page)

    // 1차: 마을 -> 덱 -> 요약 -> 마을
    await startFromTown(context, page)
    r.check(`${name} 덱이 ${UNIT_ID} 첫 카드(idx 0)로 열림`, (await T(page, 'gd-root').getAttribute('data-unit')) === UNIT_ID && (await idxOf(page)) === 0)
    const intro = ((await T(page, 'gd-mission-intro').textContent().catch(() => '')) || '')
    r.check(`${name} 첫 카드에 상황 소개(gd-mission-intro: 공원)`, intro.includes('공원'), intro.slice(0, 60))
    r.check(`${name} 머리글 뒤로가기는 '← 마을'(data-return=town)`, (await T(page, 'gu-back').getAttribute('data-return')) === 'town' && ((await T(page, 'gu-back').textContent()) || '').includes('마을'))
    await advanceTo(page, DECK.length - 1)
    r.check(`${name} 요약 카드에 '마을로 돌아가기'(gd-to-town)`, await T(page, 'gd-to-town').isVisible())
    await T(page, 'gd-to-town').click()
    await T(page, 'proto25d-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 마을로 복귀 + 표지판에 완료 표시`, !!(await waitUntil(async () => (await T(page, 'proto25d-mission-done-park').count()) === 1, { timeout: 5000 })) && ((await T(page, 'proto25d-mission-done-park').textContent()) || '').trim() === '완료')
    r.check(`${name} 복귀 후 덱은 사라짐`, (await T(page, 'gd-root').count()) === 0)

    // 2차: 다시 들어가 중간에 ← 마을
    await startFromTown(context, page)
    await T(page, 'gd-next').click()
    await waitUntil(async () => (await idxOf(page)) === 1, { timeout: 5000 })
    await T(page, 'gu-back').click()
    await T(page, 'proto25d-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 중간에 ← 마을 -> 마을로 복귀(완료 표시 유지)`, (await T(page, 'gd-root').count()) === 0 && (await T(page, 'proto25d-mission-done-park').count()) === 1)
    const afterTown = await storageSnap(page)
    r.check(`${name} 마을 왕복 동안 localStorage/sessionStorage 키 집합 불변`, JSON.stringify(afterTown) === JSON.stringify(base), JSON.stringify({ base, afterTown }))

    // 3차: 홈 -> 문법 카드 -> 폴타운 미션 -> 공원 미션 (뒤로 가면 문법 화면)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await loginOnly(page)
    await T(page, 'student-home-menu-grammar').click()
    await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'grammar-missions').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'grammar-mission-park').click()
    await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 20000 })
    const intro2 = ((await T(page, 'gd-mission-intro').textContent().catch(() => '')) || '')
    r.check(`${name} 문법 홈 경로: 같은 덱(idx 0)에 상황 소개`, (await T(page, 'gd-root').getAttribute('data-unit')) === UNIT_ID && (await idxOf(page)) === 0 && intro2.includes('공원'))
    r.check(`${name} 문법 홈 경로: 뒤로가기는 마을 표기가 아님`, (await T(page, 'gu-back').getAttribute('data-return')) === null && (await T(page, 'gd-to-town').count()) === 0)
    await advanceTo(page, DECK.length - 1)
    await T(page, 'gu-back').click()
    await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 문법 홈 경로: 뒤로 -> 문법 화면(마을 아님)`, (await T(page, 'proto25d-root').count()) === 0 && (await T(page, 'gd-root').count()) === 0)

    const n = finishEvents(apiCallLog)
    r.check(`${name} 두 번 끝까지 풀어도 grammar_scene_finish 분석 이벤트 POST ${n}건 (<=1)`, n <= 1)
  })

  // ---- 스크린샷: 표지판 + 시작 버튼 ----
  for (const vp of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    await scenario('화면', vp, async ({ page, context, name }) => {
      await enterTown(page)
      await T(page, 'proto25d-mission-spot-park').waitFor({ state: 'visible', timeout: 15000 })
      const b = await T(page, 'proto25d-mission-spot-park').boundingBox()
      r.check(`${name} 표지판 히트 영역 >= 44px, 화면 안`, b.width >= 43.9 && b.height >= 43.9 && b.x >= 0 && b.x + b.width <= vp.width && b.y >= 0 && b.y + b.height <= vp.height, JSON.stringify(b))
      await page.screenshot({ path: `${SHOTS_DIR}\\town-mission-sign-${vp.width}.png` }).catch(() => {})
      await tapSpot(context, page)
      await T(page, 'proto25d-mission-enter').waitFor({ state: 'visible', timeout: 20000 })
      const eb = await T(page, 'proto25d-mission-enter').boundingBox()
      r.check(`${name} '공원 미션 시작' 버튼 텍스트/높이 >= 44px/화면 안`, ((await T(page, 'proto25d-mission-enter').textContent()) || '').trim() === '공원 미션 시작' && eb.height >= 43.9 && eb.x >= 0 && eb.x + eb.width <= vp.width && eb.y + eb.height <= vp.height, JSON.stringify(eb))
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${SHOTS_DIR}\\town-mission-enter-${vp.width}.png` }).catch(() => {})
    })
  }

  return { results: r.results, unmockedRequests, mockErrors }
}
