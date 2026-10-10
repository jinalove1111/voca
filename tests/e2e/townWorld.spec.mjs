// tests/e2e/townWorld.spec.mjs — 하이브리드 2.5D 월드(townWorld) 브라우저 시나리오. 네트워크 전체 mock, 저장 0.
// 가정(배선 에이전트): 플래그 paulTownWorld + QA 계정이면 홈의 별도 버튼(student-home-town-world)이 town-world를 연다(기존 student-home-town은 기존 경로 유지).
// (g) 마을 전용 테스터(id …a002, 기본 플래그) 대시보드 진입 (h) 일반 학생 진입 없음(245차). 로그인 학생 id 덮어쓰기: installMocks(page, { studentId }) — verify-student-pin mock이 그 id를 내려준다.
// (a) 데스크톱 이동/충돌/공원 걷기 (b) 지도 빠른 이동 (c) 미션 왕복(문법·쓰기·발표) (d) 모바일 조이스틱/HUD/문 (e) 준비 중 구역 (f) 쓰기 0/저장소 불변/콘솔 오류 0.
import { mkdirSync } from 'node:fs'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { UNITS } from '../../src/utils/curriculum/units.js'
import { grammarUnitById } from '../../src/utils/grammar/grammarUnits.js'
import { buildDeck } from '../../src/utils/grammar/grammarDeck.js'
import { solids, ZONES, PLACES, SPAWN, pxPerUnit } from '../../src/utils/town/proto2_5d/world/worldMap.js'
import { stepMove } from '../../src/utils/town/proto2_5d/world/freeMove.js'
import { isStandable } from '../../src/utils/town/proto2_5d/world/clickMove.js'

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
const storageSnap = (page) => page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))
const APP_KEY = /^(paul_easy_|paulEasyVoca_)/
const keyDiff = (a, b) => ['local', 'session'].flatMap((w) => [...b[w].filter((k) => !a[w].includes(k)).map((k) => `+${w}:${k}`), ...a[w].filter((k) => !b[w].includes(k)).map((k) => `-${w}:${k}`)]).filter((d) => !APP_KEY.test(d.slice(d.indexOf(':') + 1)))

const U = grammarUnitById(UNIT_ID)
const DECK = U?.scene ? buildDeck(U, UNITS) : []
const S = (kind) => U.scene.steps.find((s) => s.kind === kind)
const SOLIDS = solids()
const SOON = ZONES.filter((z) => z.status === 'soon')
const BODY = 1.4 // data-x/y 는 0.1 반올림 — 몸 반지름(1.5)보다 조금 작게 잡아 반올림 오차로 오탐하지 않게
const inside = (p, s) => p.x + BODY > s.x0 && p.x - BODY < s.x1 && p.y + BODY > s.y0 && p.y - BODY < s.y1
const hitsAnySolid = (p) => SOLIDS.some((s) => inside(p, s))
const inSoon = (p) => SOON.some((z) => p.x > z.rect.x && p.x < z.rect.x + z.rect.w && p.y > z.rect.y && p.y < z.rect.y + z.rect.h)

// ---- 덱 조작(townMission.spec.mjs 와 같은 방식, 맞게 끝내기만) ----
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

// ---- 월드 헬퍼 ----
async function loginOnly(page) {
  const home = T(page, 'student-home'); const input = page.getByPlaceholder('이름 입력...')
  await Promise.race([home.waitFor({ state: 'visible', timeout: 90000 }), input.waitFor({ state: 'visible', timeout: 90000 })])
  if (await home.isVisible()) return
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await home.waitFor({ state: 'visible', timeout: 20000 })
}
// 기본 플래그(localStorage 시딩 없음)로 로그인하고 대시보드가 뜰 때까지 기다린다 — 학생 홈 메뉴 없이 일반 대시보드로 착지.
async function loginToDashboard(page) {
  const input = page.getByPlaceholder('이름 입력...')
  await input.waitFor({ state: 'visible', timeout: 90000 })
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await input.waitFor({ state: 'hidden', timeout: 20000 })
  await sleep(1500)
}
async function enterWorld(page) {
  await T(page, 'student-home-town-world').waitFor({ state: 'visible', timeout: 15000 })
  await T(page, 'student-home-town-world').click()
  await T(page, 'town-world').waitFor({ state: 'visible', timeout: 20000 })
}
const pos = (page) => page.evaluate(() => { const e = document.querySelector('[data-testid="town-world"]'); return { x: Number(e.dataset.x), y: Number(e.dataset.y), zone: e.dataset.zone } })
const paulAttr = (page, a) => T(page, 'tw-paul').getAttribute(a)
const near = (a, b, d) => Math.abs(a.x - b.x) <= d && Math.abs(a.y - b.y) <= d
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight && document.body.scrollHeight <= window.innerHeight)

// 키를 누른 채 mutate 없이 샘플링(충돌 박스 검사용). samples에 모든 위치를 모은다.
async function holdSampling(page, key, ms, samples) {
  await page.keyboard.down(key)
  const t0 = Date.now()
  try { while (Date.now() - t0 < ms) { samples.push(await pos(page)); await sleep(25) } } finally { await page.keyboard.up(key) }
  samples.push(await pos(page))
}
// 한 축으로 목표까지 걷기(오버슈트하면 반대 방향으로 보정). timeout 20 s.
async function walkAxis(page, axis, to, samples = [], tol = 1.2, timeout = 20000) {
  const t0 = Date.now()
  for (;;) {
    const p = await pos(page)
    const d = to - p[axis]
    if (Math.abs(d) <= tol) return true
    if (Date.now() - t0 > timeout) return false
    const key = axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : (d > 0 ? 'ArrowDown' : 'ArrowUp')
    await page.keyboard.down(key)
    try {
      while (Date.now() - t0 < timeout) {
        const q = await pos(page); samples.push(q)
        const rest = (to - q[axis]) * Math.sign(d)
        if (rest <= 1.0) break
        await sleep(20)
      }
    } finally { await page.keyboard.up(key) }
    await sleep(60)
  }
}
// route = [['x', 128], ['y', 112], ...] — 한 축씩. 순수 시뮬레이션으로 먼저 검증한 경로만 쓴다.
async function walkTo(page, route, samples = []) {
  for (const [axis, v] of route) if (!(await walkAxis(page, axis, v, samples))) return false
  return true
}
function simulate(route, from = SPAWN) {
  let p = { x: from.x, y: from.y }
  for (const [axis, v] of route) {
    for (let i = 0; i < 4000 && Math.abs(v - p[axis]) > 0.3; i++) {
      const r = stepMove(p, axis === 'x' ? { x: Math.sign(v - p.x), y: 0 } : { x: 0, y: Math.sign(v - p.y) }, 16, { solids: SOLIDS })
      if (!r.moved) return { ok: false, p }
      p = { x: r.x, y: r.y }
    }
  }
  return { ok: true, p }
}
// SPAWN에서 각 장소 입구까지(순수 시뮬레이션으로 도달 확인). 길(PATHS)을 따라 한 축씩.
const ROUTES = {
  'park-green': [['x', 128], ['y', 112], ['x', 88]],
  'school-main': [['x', 192], ['y', 112], ['x', 268], ['y', 95]],
  'plaza-hall': [['x', 128], ['y', 96], ['x', 142], ['y', 91]],
  market: [['x', 128], ['y', 96], ['x', 160]],
}

export async function run(browser, baseURL) {
  const r = createRecorder('[town-world]')
  const unmockedRequests = []
  const mockErrors = []
  try { mkdirSync(SHOTS_DIR, { recursive: true }) } catch { /* 스크린샷만 건너뜀 */ }

  async function scenario(label, vp, body, { hasTouch = false, studentId = null, defaultFlags = false } = {}) {
    const context = await browser.newContext({ viewport: vp, hasTouch })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    page.on('dialog', (d) => d.accept().catch(() => {}))
    const reqUrls = []
    page.on('request', (q) => reqUrls.push(q.url()))
    if (!defaultFlags) {
      await page.addInitScript(() => {
        try { localStorage.setItem('paulEasyVoca_features', JSON.stringify({ studentHomeMenu: true, paulTown2_5d: true, paulTownWorld: true })) } catch { /* 무시 */ }
      })
    }
    const { unmockedRequests: u, apiCallLog } = await installMocks(page, studentId ? { studentId } : {})
    const name = `${label} [${vp.width}x${vp.height}]`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await (defaultFlags ? loginToDashboard(page) : loginOnly(page))
      const base = await storageSnap(page)
      await body({ page, context, name, apiCallLog, reqUrls })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인/분석 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
      const d = keyDiff(base, await storageSnap(page))
      r.check(`${name} 앱 자체 키(paul_easy_*/paulEasyVoca_*) 밖의 localStorage/sessionStorage 키 불변`, d.length === 0, d.join(','))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
  }
  const shot = (page, file) => page.waitForTimeout(500).then(() => page.screenshot({ path: `${SHOTS_DIR}\\${file}` })).catch(() => {})

  // 경로 사전 검증(브라우저 밖): 시뮬레이션에서 도달 못 하면 아래 걷기 단언이 무의미하다.
  for (const [id, route] of Object.entries(ROUTES)) {
    const s = simulate(route)
    const place = PLACES.find((p) => p.id === id)
    r.check(`경로 시뮬레이션: SPAWN -> ${id} ${place ? '입구 7 이내' : '(시장 문 앞까지)'}`, s.ok && (place ? Math.hypot(s.p.x - place.entrance.x, s.p.y - place.entrance.y) <= 7 : true), JSON.stringify(s))
  }

  // ---- (a) 데스크톱: 이동 / 충돌 / 공원 걷기 ----
  await scenario('데스크톱 이동', { width: 1280, height: 800 }, async ({ page, name }) => {
    await enterWorld(page)
    const p0 = await pos(page)
    r.check(`${name} 광장에서 시작(data-zone=plaza), SPAWN 좌표`, p0.zone === 'plaza' && near(p0, SPAWN, 0.2), JSON.stringify(p0))
    r.check(`${name} 구역 칩 "중앙 광장 · Presentation"`, ((await T(page, 'tw-zone-chip').textContent()) || '').replace(/\s+/g, ' ').trim() === '중앙 광장 · Presentation')
    r.check(`${name} 조이스틱은 데스크톱(마우스)에서 숨김`, (await T(page, 'tw-joystick').count()) === 0)
    await shot(page, 'world-plaza-1280.png')

    await page.keyboard.down('ArrowLeft')
    await sleep(450)
    const moving = await paulAttr(page, 'data-moving'), face = await paulAttr(page, 'data-facing'), p1 = await pos(page)
    await page.keyboard.up('ArrowLeft')
    await sleep(200)
    const p2 = await pos(page), stopped = await paulAttr(page, 'data-moving')
    await sleep(150)
    const p3 = await pos(page)
    r.check(`${name} ArrowLeft 누르는 동안 data-x 감소 + 왼쪽을 봄 + data-moving=true`, p1.x < p0.x - 3 && face === 'left' && moving === 'true', JSON.stringify({ p0, p1, face, moving }))
    r.check(`${name} 키를 떼면 data-moving=false, 위치 고정`, stopped === 'false' && p3.x === p2.x && p3.y === p2.y, JSON.stringify({ stopped, p2, p3 }))
    await page.keyboard.down('d'); await sleep(450)
    const pd = await pos(page), fd = await paulAttr(page, 'data-facing')
    await page.keyboard.up('d')
    r.check(`${name} WASD: d 로 오른쪽 이동 + 오른쪽을 봄`, pd.x > p2.x + 3 && fd === 'right', JSON.stringify({ p2, pd, fd }))
    await page.keyboard.down('w'); await sleep(250); const fw = await paulAttr(page, 'data-facing'); await page.keyboard.up('w')
    await page.keyboard.down('s'); await sleep(250); const fs = await paulAttr(page, 'data-facing'); await page.keyboard.up('s')
    r.check(`${name} WASD: w=뒤(back), s=앞(front) 방향`, fw === 'back' && fs === 'front', `${fw}/${fs}`)

    // 공원 표지판까지 걷기
    await T(page, 'tw-map-open').click(); await T(page, 'tw-map-zone-plaza').click()
    const samples = []
    r.check(`${name} 길을 따라 공원 표지판까지 걷기(20 s 이내)`, await walkTo(page, ROUTES['park-green'], samples))
    r.check(`${name} 걷는 내내 몸이 어떤 충돌 박스 안에도 들어가지 않음(${samples.length}샘플)`, samples.every((q) => !hitsAnySolid(q)), JSON.stringify(samples.find(hitsAnySolid)))
    await T(page, 'tw-mission-enter').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 표지판 근처: "공원 잔디밭 미션 보기"`, ((await T(page, 'tw-mission-enter').textContent()) || '').trim() === '공원 잔디밭 미션 보기' && (await T(page, 'tw-place-park-green').getAttribute('data-near')) === 'true')
    r.check(`${name} 구역 칩 "공원 · Grammar"`, ((await T(page, 'tw-zone-chip').textContent()) || '').replace(/\s+/g, ' ').trim() === '공원 · Grammar' && (await pos(page)).zone === 'park')
    await T(page, 'tw-mission-enter').click()
    await T(page, 'tw-place-sheet').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 장소 시트: 제목 + 문법 미션 4개`, ((await T(page, 'tw-place-title').textContent()) || '').trim() === '공원 잔디밭' && (await page.locator('button[data-testid^="tw-mission-"][data-kind="grammar"]').count()) === 4)
    await page.keyboard.press('Escape')
    r.check(`${name} Escape로 시트 닫힘`, await waitUntil(async () => (await T(page, 'tw-place-sheet').count()) === 0, { timeout: 3000 }))

    // 분수 / 마을회관에 부딪히면 멈춘다
    await T(page, 'tw-map-open').click(); await T(page, 'tw-map-zone-plaza').click()
    const s2 = []
    await holdSampling(page, 'ArrowUp', 1800, s2)
    const pf = await pos(page)
    r.check(`${name} 분수에 막혀 멈춤(y≈111.5 아래), 충돌 박스 침범 없음`, pf.y >= 111 && pf.y <= 112.5 && s2.every((q) => !hitsAnySolid(q)), JSON.stringify(pf))
    await page.keyboard.down('ArrowUp'); await sleep(250); const blockedMoving = await paulAttr(page, 'data-moving'), blockedFace = await paulAttr(page, 'data-facing'); await page.keyboard.up('ArrowUp')
    r.check(`${name} 벽을 밀 때는 걷기 애니메이션 정지(data-moving=false) + 벽을 계속 봄(back)`, blockedMoving === 'false' && blockedFace === 'back', `${blockedMoving}/${blockedFace}`)
    await T(page, 'tw-map-open').click(); await T(page, 'tw-map-zone-plaza').click()
    const s3 = []
    r.check(`${name} 마을회관 앞까지 걷기`, await walkTo(page, [['x', 128], ['y', 96], ['x', 142]], s3))
    await holdSampling(page, 'ArrowUp', 1500, s3)
    const ph = await pos(page)
    r.check(`${name} 마을회관에 막혀 멈춤, 충돌 박스 침범 없음`, ph.y >= 87 && ph.y <= 91.6 && s3.every((q) => !hitsAnySolid(q)), JSON.stringify(ph))
    r.check(`${name} 가로/세로 페이지 스크롤 없음`, await noOverflow(page))
  })

  // ---- (b) 지도 빠른 이동 (모바일 360x640) ----
  await scenario('지도 빠른 이동', { width: 360, height: 640 }, async ({ page, name }) => {
    await enterWorld(page)
    await T(page, 'tw-map-open').click()
    await T(page, 'tw-map').waitFor({ state: 'visible', timeout: 5000 })
    const st = await page.locator('[data-testid^="tw-map-zone-"]').evaluateAll((els) => els.map((e) => ({ id: e.dataset.testid.replace('tw-map-zone-', ''), status: e.dataset.status, disabled: e.disabled, text: e.textContent })))
    r.check(`${name} 지도: 구역 7개, ready 3 / soon 4(비활성 + 준비 중)`, st.length === 7 && st.filter((z) => z.status === 'ready' && !z.disabled).length === 3 && st.filter((z) => z.status === 'soon' && z.disabled && z.text.includes('준비 중')).length === 4, JSON.stringify(st))
    r.check(`${name} 지도: 구역마다 이름 + 과목`, ZONES.every((z) => { const t = st.find((q) => q.id === z.id)?.text || ''; return t.includes(z.nameKo) && t.includes(z.subject) }))
    r.check(`${name} 지도: 현재 구역(광장)에 '여기' 표시 1개`, (await T(page, 'tw-map-here').count()) === 1 && ((await T(page, 'tw-map-zone-plaza').locator('xpath=..').textContent()) || '').includes('여기'))
    const mb = await page.locator('[data-testid="tw-map"] button').evaluateAll((els) => els.filter((e) => !e.disabled).map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < 44))
    r.check(`${name} 지도: 활성 버튼 높이 44px 이상`, mb.length === 0, JSON.stringify(mb))
    await shot(page, 'world-map-360.png')
    // 준비 중 구역: 클릭해도 이동하지 않는다
    const before = await pos(page)
    await T(page, 'tw-map-zone-market').dispatchEvent('click')
    r.check(`${name} 준비 중 구역 선택 불가(지도 그대로, 위치 불변)`, (await T(page, 'tw-map').count()) === 1 && near(await pos(page), before, 0.01))
    // 학교 장소로 이동
    await T(page, 'tw-map-place-school-main').click()
    r.check(`${name} 장소 선택 -> 지도 닫힘 + data-zone=school`, await waitUntil(async () => (await T(page, 'tw-map').count()) === 0 && (await pos(page)).zone === 'school', { timeout: 3000 }))
    await T(page, 'tw-mission-enter').waitFor({ state: 'visible', timeout: 3000 })
    r.check(`${name} 학교: 이동 직후 미션 버튼 보임 "학교 미션 보기"`, ((await T(page, 'tw-mission-enter').textContent()) || '').trim() === '학교 미션 보기')
    await shot(page, 'world-school-360.png')
    await T(page, 'tw-mission-enter').click()
    r.check(`${name} 학교 시트: 쓰기 미션 1개(Writing)`, ((await T(page, 'tw-mission-0').textContent()) || '').includes('쓰기 연습 고르기') && ((await T(page, 'tw-mission-0').textContent()) || '').includes('Writing') && (await page.locator('button[data-testid^="tw-mission-"]').count()) === 1)
    await shot(page, 'world-sheet-360.png')
    await T(page, 'tw-sheet-close').click()
    r.check(`${name} 시트 닫기 버튼`, (await T(page, 'tw-place-sheet').count()) === 0)
    // 광장 구역 -> 입구
    await page.keyboard.press('m')
    r.check(`${name} M 키로 지도 열림`, await waitUntil(async () => (await T(page, 'tw-map').count()) === 1, { timeout: 3000 }))
    await T(page, 'tw-map-zone-plaza').click()
    const pp = await pos(page)
    r.check(`${name} 광장 구역 선택 -> 광장 입구(160,122) 근처`, pp.zone === 'plaza' && near(pp, { x: 160, y: 122 }, 1), JSON.stringify(pp))
    await page.keyboard.press('m'); await page.keyboard.press('Escape')
    r.check(`${name} Escape로 지도 닫힘`, await waitUntil(async () => (await T(page, 'tw-map').count()) === 0, { timeout: 3000 }))
    // 공원
    await T(page, 'tw-map-open').click(); await T(page, 'tw-map-place-park-green').click()
    await T(page, 'tw-mission-enter').waitFor({ state: 'visible', timeout: 3000 })
    await shot(page, 'world-park-360.png')
    r.check(`${name} 가로/세로 페이지 스크롤 없음`, await noOverflow(page))
  }, { hasTouch: true })

  // ---- (c) 미션 왕복 (390x844) ----
  await scenario('미션 왕복', { width: 390, height: 844 }, async ({ page, name }) => {
    if (!U?.scene) { r.skip(`${name} 문법 미션 왕복`, `${UNIT_ID}에 scene 데이터가 없음`); return }
    await enterWorld(page)
    const openPlace = async (placeId) => {
      await T(page, 'tw-map-open').click(); await T(page, `tw-map-place-${placeId}`).click()
      await T(page, 'tw-mission-enter').waitFor({ state: 'visible', timeout: 5000 })
      await T(page, 'tw-mission-enter').click()
      await T(page, 'tw-place-sheet').waitFor({ state: 'visible', timeout: 5000 })
    }
    await openPlace('park-green')
    const before = await pos(page)
    r.check(`${name} 공원 시트: g-easy-05 아직 완료 칩 없음`, (await T(page, 'tw-mission-done-0').count()) === 0)
    await T(page, 'tw-mission-0').click()
    await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 미션 0 -> 문법 덱 g-easy-05 첫 카드`, (await T(page, 'gd-root').getAttribute('data-unit')) === UNIT_ID && (await idxOf(page)) === 0)
    r.check(`${name} 덱 머리글 뒤로가기 '← 마을'`, ((await T(page, 'gu-back').textContent()) || '').includes('마을'))
    await T(page, 'gd-next').click(); await waitUntil(async () => (await idxOf(page)) === 1, { timeout: 5000 })
    await T(page, 'gu-back').click()
    await T(page, 'town-world').waitFor({ state: 'visible', timeout: 20000 })
    const back = await pos(page)
    r.check(`${name} ← 마을 -> town-world, Paul 위치 1 이내 복원, 같은 장소 근처(미션 버튼)`, near(back, before, 1) && (await T(page, 'tw-mission-enter').count()) === 1, JSON.stringify({ before, back }))
    // 끝까지 완료
    await T(page, 'tw-mission-enter').click(); await T(page, 'tw-mission-0').click()
    await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 20000 })
    await advanceTo(page, DECK.length - 1)
    await T(page, 'gd-to-town').click()
    await T(page, 'town-world').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'tw-mission-enter').click()
    r.check(`${name} 완료 후 시트: tw-mission-done-0 '완료'`, ((await T(page, 'tw-mission-done-0').textContent().catch(() => '')) || '').trim() === '완료' && (await T(page, 'tw-mission-done-1').count()) === 0)
    await T(page, 'tw-sheet-close').click()
    // 쓰기
    await openPlace('school-main')
    const beforeW = await pos(page)
    await T(page, 'tw-mission-0').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 학교 미션 -> 쓰기 선택기(intent=writing)`, (await T(page, 'unit-list').getAttribute('data-intent')) === 'writing')
    await T(page, 'unit-list-home').click()
    await T(page, 'town-world').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 쓰기 선택기 뒤로 -> town-world(위치 복원)`, near(await pos(page), beforeW, 1))
    // 발표
    await openPlace('plaza-hall')
    r.check(`${name} 회관 시트: 발표 과정 열기(Presentation)`, ((await T(page, 'tw-mission-0').textContent()) || '').includes('발표 과정 열기'))
    await T(page, 'tw-mission-0').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 20000 })
    const crumb = ((await T(page, 'unit-list-crumb').textContent().catch(() => '')) || '')
    r.check(`${name} 회관 미션 -> 단원 선택기가 Presentation 과정으로 열림(과정 선택 단계 건너뜀)`, /presentation/i.test(crumb) && (await T(page, 'unit-list').getAttribute('data-intent')) === 'none', crumb)
    await T(page, 'unit-list-home').click()
    await T(page, 'town-world').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 발표 선택기 뒤로 -> town-world`, (await T(page, 'tw-paul').count()) === 1)
    await T(page, 'tw-mission-enter').click()
    r.check(`${name} 쓰기/발표처럼 완료 신호 없는 미션은 '완료'가 아니라 '다녀옴'`, ((await T(page, 'tw-mission-done-0').textContent().catch(() => '')) || '').trim() === '다녀옴')
    await T(page, 'tw-sheet-close').click()
    await T(page, 'tw-home').click()
    r.check(`${name} 홈 버튼 -> 학생 홈`, !!(await waitUntil(async () => (await T(page, 'student-home').count()) === 1, { timeout: 8000 })))
  }, { hasTouch: true })

  // ---- (d)(e) 모바일: 조이스틱 / HUD / 문 / 준비 중 구역 ----
  await scenario('모바일 조이스틱', { width: 360, height: 640 }, async ({ page, name }) => {
    await enterWorld(page)
    await T(page, 'tw-joystick').waitFor({ state: 'visible', timeout: 5000 })
    const jb = await T(page, 'tw-joystick').boundingBox()
    r.check(`${name} 조이스틱 96px 베이스, 화면 안(왼쪽 아래)`, Math.abs(jb.width - 96) < 1 && jb.x >= 0 && jb.y + jb.height <= 640 && jb.x < 180 && jb.y > 320, JSON.stringify(jb))
    const hud = {}
    for (const id of ['tw-home', 'tw-map-open']) hud[id] = await T(page, id).boundingBox()
    r.check(`${name} HUD 버튼 44px 이상 + 화면 안`, Object.values(hud).every((b) => b.width >= 43.9 && b.height >= 43.9 && b.x >= 0 && b.y >= 0 && b.x + b.width <= 360 && b.y + b.height <= 640), JSON.stringify(hud))
    const cb = await T(page, 'tw-zone-chip').boundingBox()
    r.check(`${name} 구역 칩이 HUD 버튼과 겹치지 않음`, !overlap(cb, hud['tw-home']) && !overlap(cb, hud['tw-map-open']), JSON.stringify({ cb, hud }))
    r.check(`${name} 가로/세로 페이지 스크롤 없음`, await noOverflow(page))
    const p0 = await pos(page)
    const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy, { steps: 4 })
    await sleep(500)
    const p1 = await pos(page), kb = await T(page, 'tw-joystick-knob').boundingBox()
    r.check(`${name} 노브를 오른쪽으로 끌면 Paul이 오른쪽으로 이동 + 노브가 손가락을 따라감`, p1.x > p0.x + 3 && (await paulAttr(page, 'data-facing')) === 'right' && kb.x + kb.width / 2 > cx + 15, JSON.stringify({ p0, p1, kb }))
    await page.mouse.up()
    await sleep(250)
    const p2 = await pos(page); await sleep(200); const p3 = await pos(page)
    const k2 = await T(page, 'tw-joystick-knob').boundingBox()
    r.check(`${name} 놓으면 멈춤 + 노브 중앙 복귀`, p2.x === p3.x && p2.y === p3.y && (await paulAttr(page, 'data-moving')) === 'false' && Math.abs(k2.x + k2.width / 2 - cx) <= 3 && Math.abs(k2.y + k2.height / 2 - cy) <= 3 /* 테두리 2px 포함 */, JSON.stringify({ p2, p3, k2 }))
    // 조이스틱을 누른 채 HUD 버튼 탭(멀티터치 안전): 지도 버튼은 별개 요소
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 30, cy, { steps: 3 })
    await T(page, 'tw-map-open').dispatchEvent('click')
    r.check(`${name} 조이스틱을 쥔 채로도 HUD 지도 버튼이 눌림`, (await T(page, 'tw-map').count()) === 1)
    await page.mouse.up()
    await page.keyboard.press('Escape')
    // 미션 버튼은 조이스틱 아래로 가리지 않는다
    await T(page, 'tw-map-open').click(); await T(page, 'tw-map-place-park-green').click()
    await T(page, 'tw-mission-enter').waitFor({ state: 'visible', timeout: 3000 })
    const eb = await T(page, 'tw-mission-enter').boundingBox()
    r.check(`${name} 미션 버튼이 조이스틱과 겹치지 않고 화면 안, 높이 44px 이상`, !overlap(eb, jb) && eb.x >= 0 && eb.x + eb.width <= 360 && eb.height >= 43.9 && eb.y + eb.height <= jb.y, JSON.stringify({ eb, jb }))

    // 닫힌 문: 시장 문(tw-gate-market)은 북쪽으로 못 나간다
    await T(page, 'tw-map-open').click(); await T(page, 'tw-map-zone-plaza').click()
    r.check(`${name} 닫힌 문 4개 + '준비 중'`, (await page.locator('[data-testid^="tw-gate-"]').count()) === 4 && ((await T(page, 'tw-gate-market').textContent()) || '').includes('준비 중'))
    const samples = []
    r.check(`${name} 시장 문 앞 길(x=160)까지 걷기`, await walkTo(page, ROUTES.market, samples))
    await holdSampling(page, 'ArrowUp', 5000, samples)
    const pg = await pos(page)
    r.check(`${name} 시장 문에서 막힘(y>60, 광장 구역), 준비 중 구역/충돌 박스 침범 없음(${samples.length}샘플)`, pg.y > 60 && pg.zone === 'plaza' && samples.every((q) => !inSoon(q) && !hitsAnySolid(q)), JSON.stringify(pg))
    await shot(page, 'world-gate-360.png')
    // 서쪽 끝(집·연못 문/월드 가장자리)으로도 준비 중 구역에 들어가지 못한다
    const s2 = []
    await holdSampling(page, 'ArrowLeft', 2500, s2); await holdSampling(page, 'ArrowDown', 2500, s2)
    r.check(`${name} (e) 걸어서 어떤 준비 중 구역 사각형 안에도 들어가지 못함(${s2.length}샘플)`, s2.every((q) => !inSoon(q) && !hitsAnySolid(q)), JSON.stringify(s2.find(inSoon)))
  }, { hasTouch: true })

  // ---- 246차: 새 마을 버튼은 첫 화면(스크롤 전) 안에 있어야 한다 ----
  const fullyIn = (b, vp) => !!b && b.width > 0 && b.height >= 43.9 && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height
  for (const vp of [{ width: 1280, height: 800 }, { width: 360, height: 640 }]) {
    await scenario('(j) 대시보드 새 마을 버튼 첫 화면', vp, async ({ page, name }) => {
      await T(page, 'dash-town-world').waitFor({ state: 'visible', timeout: 15000 })
      const b = await T(page, 'dash-town-world').boundingBox()
      r.check(`${name} dash-town-world가 스크롤 없이 첫 화면 안(높이 44px 이상)`, fullyIn(b, vp), JSON.stringify(b))
    }, { studentId: 'e2e00000-0000-4000-8000-00000000a002', defaultFlags: true })
    await scenario('(k) 홈 메뉴 새 마을 버튼 첫 화면', vp, async ({ page, name }) => {
      await T(page, 'student-home-town-world').waitFor({ state: 'visible', timeout: 15000 })
      const b = await T(page, 'student-home-town-world').boundingBox()
      r.check(`${name} student-home-town-world가 스크롤 없이 첫 화면 안(높이 44px 이상)`, fullyIn(b, vp), JSON.stringify(b))
    })
  }

  // ---- (i) 기존 홈 '내 마을' 버튼은 새 마을을 열지 않는다(기존 경로 보존) ----
  await scenario('(i) 기존 내 마을 버튼 보존', { width: 1280, height: 800 }, async ({ page, name }) => {
    await T(page, 'student-home-town').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'student-home-town').click()
    await sleep(1500)
    r.check(`${name} student-home-town 클릭해도 town-world 안 열림(기존 허브/2.5D 경로)`, (await T(page, 'town-world').count()) === 0)
  })

  // ---- (g) 마을 전용 테스터(…a002): 기본 플래그, 대시보드 버튼으로 새 마을 진입 ----
  const PARK = ZONES.find((z) => z.id === 'park')
  const SCHOOL_PLACE = PLACES.find((p) => p.zone === 'school').id
  const inRect = (p, z) => p.x > z.rect.x && p.x < z.rect.x + z.rect.w && p.y > z.rect.y && p.y < z.rect.y + z.rect.h
  const inVp = (b, vp) => !!b && b.width > 0 && b.height > 0 && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height
  await scenario('(g) 마을 전용 테스터', { width: 1280, height: 800 }, async ({ page, name }) => {
    const vp = { width: 1280, height: 800 }
    await T(page, 'dash-town-world').waitFor({ state: 'visible', timeout: 15000 })
    const bb0 = await T(page, 'dash-town-world').boundingBox() // 스크롤 전
    r.check(`${name} 로그인 직후(스크롤 전) 새 마을 버튼이 뷰포트 안`, !!bb0 && bb0.y >= 0 && bb0.y + bb0.height <= vp.height && bb0.x >= 0 && bb0.x + bb0.width <= vp.width, JSON.stringify(bb0))
    const bb = await T(page, 'dash-town-world').boundingBox()
    r.check(`${name} 대시보드에 새 마을 버튼 보임(높이 44px 이상, 홈 메뉴 없이)`, bb && bb.height >= 43.9 && (await T(page, 'student-home').count()) === 0, JSON.stringify(bb))
    await T(page, 'dash-town-world').click()
    await T(page, 'town-world').waitFor({ state: 'visible', timeout: 20000 })
    const pb = await T(page, 'tw-paul').boundingBox()
    r.check(`${name} 캐릭터(tw-paul)가 화면 안에 0 아닌 크기로 보임`, inVp(pb, vp), JSON.stringify(pb))
    const p0 = await pos(page)
    await page.keyboard.down('ArrowRight'); await sleep(450); await page.keyboard.up('ArrowRight')
    const p1 = await pos(page)
    await page.keyboard.down('ArrowDown'); await sleep(450); await page.keyboard.up('ArrowDown')
    const p2 = await pos(page)
    r.check(`${name} 화살표 오른쪽/아래로 data-x/data-y 변함`, p1.x > p0.x + 2 && p2.y > p1.y + 2, JSON.stringify({ p0, p1, p2 }))
    await page.keyboard.down('a'); await sleep(450); await page.keyboard.up('a')
    const p3 = await pos(page)
    await page.keyboard.down('w'); await sleep(450); await page.keyboard.up('w')
    const p4 = await pos(page)
    r.check(`${name} WASD(a/w)로 data-x/data-y 변함`, p3.x < p2.x - 2 && p4.y < p3.y - 2, JSON.stringify({ p2, p3, p4 }))
    const pb2 = await T(page, 'tw-paul').boundingBox()
    r.check(`${name} 걸은 뒤에도 캐릭터가 화면 안(카메라 추적)`, inVp(pb2, vp), JSON.stringify(pb2))
    // 건물(충돌 박스)로 걸어 들어가도 통과하지 못함
    const sm = []
    await holdSampling(page, 'ArrowUp', 3000, sm); await holdSampling(page, 'ArrowLeft', 3000, sm); await holdSampling(page, 'ArrowDown', 3000, sm)
    r.check(`${name} 건물/충돌 박스를 침범하지 않음(${sm.length}샘플)`, sm.every((q) => !hitsAnySolid(q)), JSON.stringify(sm.find(hitsAnySolid)))
    // 지도로 공원 이동
    // 충돌 걷기가 공원에서 끝날 수 있으므로 먼저 지도로 학교에 가서 출발 구역을 고정한다
    await T(page, 'tw-map-open').click(); await T(page, `tw-map-place-${SCHOOL_PLACE}`).click()
    await waitUntil(async () => (await pos(page)).zone === 'school', { timeout: 5000 })
    const ps = await pos(page)
    r.check(`${name} 지도로 학교 이동: 위치가 학교 구역 안`, inRect(ps, ZONES.find((z) => z.id === 'school')), JSON.stringify(ps))
    const chip0 = ((await T(page, 'tw-zone-chip').textContent()) || '').trim()
    await T(page, 'tw-map-open').click(); await T(page, 'tw-map-place-park-green').click()
    await waitUntil(async () => (await pos(page)).zone === 'park', { timeout: 5000 })
    await T(page, 'tw-mission-enter').waitFor({ state: 'visible', timeout: 5000 })
    const pp = await pos(page), chip1 = ((await T(page, 'tw-zone-chip').textContent()) || '').trim()
    r.check(`${name} 지도로 공원 이동: 위치가 공원 구역 안 + 구역 칩 변경`, inRect(pp, PARK) && chip1 !== chip0, JSON.stringify({ pp, chip0, chip1 }))
    // 장소 시트: 미션 비활성 + 안내 문구
    await T(page, 'tw-mission-enter').click()
    await T(page, 'tw-place-sheet').waitFor({ state: 'visible', timeout: 5000 })
    const btns = page.locator('button[data-testid^="tw-mission-"][data-kind]')
    const nBtn = await btns.count(); let allDisabled = nBtn > 0
    for (let i = 0; i < nBtn; i++) if (!(await btns.nth(i).isDisabled())) allDisabled = false
    r.check(`${name} 장소 시트: 안내 문구(tw-missions-closed) 보임 + 미션 버튼 ${nBtn}개 모두 disabled`, (await T(page, 'tw-missions-closed').isVisible()) && ((await T(page, 'tw-missions-closed').textContent()) || '').includes('이 계정은 마을 걷기와 지도 이동만 테스트해요.') && allDisabled, String(nBtn))
    await T(page, 'tw-sheet-close').click()
    // 홈 버튼 -> 대시보드(홈 메뉴 아님)
    await T(page, 'tw-home').click()
    await T(page, 'dash-town-world').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} ← 홈은 대시보드로 복귀(홈 메뉴 아님)`, (await T(page, 'town-world').count()) === 0 && (await T(page, 'student-home').count()) === 0)
    // 허브(paulTown)에서도 진입 카드 — 홈 밴드의 "구경가기"가 있을 때만(밴드는 별도 플래그라 기본 상태에서는 없을 수 있음)
    const hub = page.getByRole('button', { name: '구경가기' })
    if ((await hub.count()) > 0) {
      await hub.first().click()
      await T(page, 'paul-town-world-entry').waitFor({ state: 'visible', timeout: 10000 })
      r.check(`${name} 허브(paulTown)에 새 마을 걷기 카드 보임`, true)
    } else console.log(`${name} (참고) 홈 밴드가 없어 허브 진입 카드 확인 생략`)
  }, { studentId: 'e2e00000-0000-4000-8000-00000000a002', defaultFlags: true })

  // ---- (h) 일반 학생(두 목록 모두에 없는 id): 진입점 없음, 청크 요청 없음 ----
  await scenario('(h) 일반 학생', { width: 1280, height: 800 }, async ({ page, name, reqUrls }) => {
    await sleep(1000)
    r.check(`${name} 대시보드에 새 마을 버튼 없음`, (await T(page, 'dash-town-world').count()) === 0)
    r.check(`${name} 허브 진입 카드 없음`, (await T(page, 'paul-town-world-entry').count()) === 0)
    r.check(`${name} town-world가 마운트되지 않음`, (await T(page, 'town-world').count()) === 0)
    const chunk = reqUrls.filter((u) => /TownWorld/i.test(u))
    r.check(`${name} TownWorld 청크 요청 0건`, chunk.length === 0, chunk.slice(0, 2).join(','))
  }, { studentId: 'e2e00000-0000-4000-8000-00000000b001', defaultFlags: true })


  // ---- 247차 클릭/탭 이동 (l)~(q) ----
  const WORLD_LAYER = '[data-testid="town-world"] > div:first-child'
  const worldRect = (page) => page.locator(WORLD_LAYER).first().boundingBox()
  // 월드 좌표 -> 화면 좌표(월드 레이어의 실제 rect + px-per-unit; 카메라 위치와 무관)
  const toScreen = async (page, wp, vp) => { const b = await worldRect(page); const sc = pxPerUnit(vp.width, vp.height); return { x: b.x + wp.x * sc, y: b.y + wp.y * sc } }
  const fromScreen = async (page, sp, vp) => { const b = await worldRect(page); const sc = pxPerUnit(vp.width, vp.height); return { x: (sp.x - b.x) / sc, y: (sp.y - b.y) / sc } }
  const destAttr = (page) => T(page, 'town-world').getAttribute('data-dest')
  const firstStandable = (cands) => cands.find((c) => isStandable(c))
  // 목적지가 비워질 때까지(도착/취소) 위치를 표본 추출한다.
  async function sampleUntilArrived(page, timeout = 25000) {
    const samples = []; const t0 = Date.now()
    for (;;) {
      samples.push(await pos(page))
      if ((await destAttr(page)) === '') break
      if (Date.now() - t0 > timeout) return { samples, timedOut: true }
      await sleep(25)
    }
    await sleep(80); samples.push(await pos(page))
    return { samples, timedOut: false }
  }
  const pathLen = (ss) => ss.reduce((a, q, i) => (i ? a + Math.hypot(q.x - ss[i - 1].x, q.y - ss[i - 1].y) : 0), 0)

  const VP_D = { width: 1280, height: 800 }
  await scenario('(l) 클릭 이동: 빈 땅', VP_D, async ({ page, name }) => {
    await enterWorld(page)
    const t = firstStandable([{ x: 178, y: 118 }, { x: 150, y: 132 }, { x: 176, y: 132 }, { x: 146, y: 116 }])
    const sp = await toScreen(page, t, VP_D)
    await page.mouse.click(sp.x, sp.y)
    await T(page, 'tw-dest').waitFor({ state: 'visible', timeout: 3000 })
    const d0 = await destAttr(page)
    r.check(`${name} 클릭하면 data-dest가 설정되고 tw-dest 마커가 보임(aria-hidden)`, /^-?\d+(\.\d)?,-?\d+(\.\d)?$/.test(d0) && (await T(page, 'tw-dest').getAttribute('aria-hidden')) === 'true', d0)
    const { samples, timedOut } = await sampleUntilArrived(page)
    const end = await pos(page)
    r.check(`${name} 도착: 목표에서 1.5 이내, 도착 후 data-dest 비워지고 마커 사라짐`, !timedOut && Math.hypot(end.x - t.x, end.y - t.y) <= 1.5 && (await T(page, 'tw-dest').count()) === 0, JSON.stringify({ end, t }))
    r.check(`${name} 걷는 동안 충돌 박스 침범 없음(${samples.length}샘플)`, samples.every((q) => !hitsAnySolid(q)), JSON.stringify(samples.find(hitsAnySolid)))
  })

  await scenario('(m) 클릭 이동: 건물 반대편', VP_D, async ({ page, name }) => {
    await enterWorld(page)
    const crosses = (a, b, s) => { for (let k = 0; k <= 80; k++) { const x = a.x + (b.x - a.x) * k / 80, y = a.y + (b.y - a.y) * k / 80; if (x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return true } return false }
    let pick = null
    for (const sd of SOLIDS.filter((q) => !q.id.startsWith('zone-') && !q.id.startsWith('gate-'))) {
      const c = { x: (sd.x0 + sd.x1) / 2, y: (sd.y0 + sd.y1) / 2 }
      const t = { x: 2 * c.x - SPAWN.x, y: 2 * c.y - SPAWN.y }
      if (Math.hypot(c.x - SPAWN.x, c.y - SPAWN.y) < 8 || Math.hypot(c.x - SPAWN.x, c.y - SPAWN.y) > 24) continue
      if (isStandable(t) && crosses(SPAWN, t, sd)) { pick = { sd, t }; break }
    }
    r.check(`${name} (준비) 직선이 건물을 가로지르는 목표를 찾음`, !!pick)
    if (!pick) return
    const sp = await toScreen(page, pick.t, VP_D)
    await page.mouse.click(sp.x, sp.y)
    const { samples, timedOut } = await sampleUntilArrived(page)
    const end = await pos(page)
    const straight = Math.hypot(pick.t.x - SPAWN.x, pick.t.y - SPAWN.y)
    r.check(`${name} 건물(${pick.sd.id}) 반대편에 도착(1.5 이내), 침범 0, 경로가 직선보다 김`, !timedOut && Math.hypot(end.x - pick.t.x, end.y - pick.t.y) <= 1.5 && samples.every((q) => !hitsAnySolid(q)) && pathLen(samples) > straight + 0.5, JSON.stringify({ end, t: pick.t, len: pathLen(samples), straight }))
  })

  await scenario('(n) 클릭 이동: 건물 클릭 -> 입구 앞', VP_D, async ({ page, name }) => {
    await enterWorld(page)
    const sp = await toScreen(page, { x: 142, y: 82 }, VP_D)
    await page.mouse.click(sp.x, sp.y)
    const { timedOut } = await sampleUntilArrived(page)
    const end = await pos(page)
    await T(page, 'tw-mission-enter').waitFor({ state: 'visible', timeout: 3000 })
    r.check(`${name} 마을회관 클릭 -> 입구 근처에서 멈추고 tw-mission-enter(plaza-hall) 표시`, !timedOut && (await T(page, 'tw-mission-enter').getAttribute('data-place')) === 'plaza-hall' && !hitsAnySolid(end), JSON.stringify(end))
  })

  await scenario('(o) 클릭 이동: 카메라가 움직인 뒤 좌표 일치', VP_D, async ({ page, name }) => {
    await enterWorld(page)
    await T(page, 'tw-map-open').click(); await T(page, 'tw-map-place-park-green').click()
    await sleep(600) // 카메라 수렴
    const t = firstStandable([{ x: 72, y: 126 }, { x: 100, y: 124 }, { x: 64, y: 120 }, { x: 76, y: 100 }])
    const sp = await toScreen(page, t, VP_D)
    const back = await fromScreen(page, sp, VP_D)
    r.check(`${name} 화면<->월드 좌표 왕복이 일치(테스트 헬퍼 검증)`, Math.hypot(back.x - t.x, back.y - t.y) < 0.01)
    await page.mouse.click(sp.x, sp.y)
    const { timedOut } = await sampleUntilArrived(page)
    const end = await pos(page)
    r.check(`${name} 공원에서 클릭한 월드 좌표에 1.5 이내로 도착`, !timedOut && Math.hypot(end.x - t.x, end.y - t.y) <= 1.5, JSON.stringify({ end, t }))
  })

  await scenario('(p) 클릭 이동: 방향키가 취소', VP_D, async ({ page, name }) => {
    await enterWorld(page)
    const t = firstStandable([{ x: 184, y: 134 }, { x: 180, y: 138 }, { x: 186, y: 130 }])
    const sp = await toScreen(page, t, VP_D)
    await page.mouse.click(sp.x, sp.y)
    await sleep(150)
    r.check(`${name} 걷는 중 data-dest 설정됨`, (await destAttr(page)) !== '')
    const p0 = await pos(page)
    await page.keyboard.down('ArrowLeft')
    await sleep(60)
    const cleared = (await destAttr(page)) === ''
    await sleep(350)
    const p1 = await pos(page)
    await page.keyboard.up('ArrowLeft')
    r.check(`${name} ArrowLeft 누르자 data-dest 즉시 비워지고 왼쪽으로 이동`, cleared && p1.x < p0.x - 1.5, JSON.stringify({ cleared, p0, p1 }))
    await sleep(300)
    const p2 = await pos(page); await sleep(200); const p3 = await pos(page)
    r.check(`${name} 키를 뗀 뒤 옛 경로를 이어 걷지 않음`, p2.x === p3.x && p2.y === p3.y, JSON.stringify({ p2, p3 }))
  })

  const VP_M = { width: 360, height: 640 }
  await scenario('(q) 탭 이동: 모바일', VP_M, async ({ page, name }) => {
    await enterWorld(page)
    const t = firstStandable([{ x: 170, y: 128 }, { x: 150, y: 130 }, { x: 172, y: 116 }])
    const sp = await toScreen(page, t, VP_M)
    await page.touchscreen.tap(sp.x, sp.y)
    await T(page, 'tw-dest').waitFor({ state: 'visible', timeout: 3000 })
    const { samples, timedOut } = await sampleUntilArrived(page)
    const end = await pos(page)
    r.check(`${name} 땅을 탭하면 그곳까지 걸어감(1.5 이내, 침범 0)`, !timedOut && Math.hypot(end.x - t.x, end.y - t.y) <= 1.5 && samples.every((q) => !hitsAnySolid(q)), JSON.stringify({ end, t }))
    const jb = await T(page, 'tw-joystick').boundingBox()
    await page.touchscreen.tap(jb.x + jb.width / 2, jb.y + jb.height / 2)
    await sleep(200)
    r.check(`${name} 조이스틱 영역 탭은 이동 경로를 만들지 않음`, (await destAttr(page)) === '')
    const mb = await T(page, 'tw-map-open').boundingBox()
    await page.touchscreen.tap(mb.x + mb.width / 2, mb.y + mb.height / 2)
    await T(page, 'tw-map').waitFor({ state: 'visible', timeout: 3000 })
    r.check(`${name} HUD 버튼 탭은 지도만 열고 이동 경로 없음`, (await destAttr(page)) === '')
    await page.keyboard.press('Escape')
    const p0 = await pos(page)
    const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy, { steps: 4 })
    await sleep(500)
    const p1 = await pos(page)
    await page.mouse.up()
    r.check(`${name} 조이스틱 드래그는 여전히 이동시키고 경로를 만들지 않음`, p1.x > p0.x + 3 && (await destAttr(page)) === '', JSON.stringify({ p0, p1 }))
  }, { hasTouch: true })

  return { results: r.results, unmockedRequests, mockErrors }
}
