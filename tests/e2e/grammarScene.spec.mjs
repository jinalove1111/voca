// 2026-10-10 문법 그림 상황 미션(Paul Town 공원, g-easy-05) 브라우저 시나리오 — 발견·비교·고르기·만들기·읽기·듣기·말하기·쓰기·마무리 카드.
// 장면 데이터·카드 순서·개수는 전부 src(grammarUnits + buildDeck + sceneMission)에서 가져온다(하드코딩 금지). 네트워크 전체 mock, 저장·REST 쓰기 0.
// 일반 grammar.spec.mjs의 단원 공통 시나리오는 g-easy-05(그림 덱)를 건너뛰고, 이 spec이 대신 맡는다.
import { mkdirSync } from 'node:fs'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { recordsKey } from '../../src/utils/curriculum/unitRecords.js'
import { UNITS } from '../../src/utils/curriculum/units.js'
import { grammarUnitById } from '../../src/utils/grammar/grammarUnits.js'
import { buildDeck, isPractice, deckCounts } from '../../src/utils/grammar/grammarDeck.js'
import { validateScene, countsMatch, buildFrame } from '../../src/utils/grammar/sceneMission.js'

const VP = { width: 390, height: 844 }
const SHOTS_DIR = process.env.GRAMMAR_SHOTS_DIR || 'C:\\Users\\jinal\\AppData\\Local\\Temp\\claude\\C--voca\\4dd777a3-9f93-4c78-a984-4f4ee328e279\\scratchpad\\shots'
const UNIT_ID = 'g-easy-05'
const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five']
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const clipped = (page, rootId) => page.locator(`[data-testid="${rootId}"] *`).evaluateAll((els) =>
  els.filter((el) => el.offsetParent !== null && el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map((el) => `${el.tagName}:${Math.round(el.getBoundingClientRect().right)}`))
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
// grammar.spec과 같은 허용 목록(로그인 직후 동기화·분석 이벤트만)
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)
const snap = (page) => page.evaluate((rk) => ({ keys: Object.keys(localStorage).sort(), rec: localStorage.getItem(rk) }), recordsKey(QA_STUDENT_ID))
const storageUnchanged = (a, b) => {
  const added = b.keys.filter((k) => !a.keys.includes(k) && !/^(paul_easy_|paulEasyVoca_currentStudent)/.test(k))
  return { ok: added.length === 0 && !b.keys.some((k) => /grammar|gu-|course|selection|scene|park/i.test(k)) && a.rec === b.rec, added }
}
const JUDGE = /점수|틀렸|맞았어요|정답이에요/

const U = grammarUnitById(UNIT_ID)
const DECK = U?.scene ? buildDeck(U, UNITS) : []
const S = (kind) => U.scene.steps.find((s) => s.kind === kind)
const cardIdx = (kind, item = 0, mode) => DECK.findIndex((c) => c.sceneKind === kind && c.itemIndex === item && (!mode || c.mode === mode))
const parseCounts = (s) => String(s || '').split(',').filter(Boolean).map((x) => x.split(':')).map(([obj, n]) => ({ obj, n: Number(n) }))
const countsOf = (page, nth = 0) => T(page, 'park-scene').nth(nth).getAttribute('data-counts')
const sceneMatches = async (page, layout, nth = 0) => countsMatch(parseCounts(await countsOf(page, nth)), layout)

// ---- 덱 조작 헬퍼 ----
const idxOf = async (page) => Number(await T(page, 'gd-root').getAttribute('data-idx'))
async function nextCard(page) {
  const i = await idxOf(page)
  if (!(await T(page, 'gd-next').isEnabled())) throw new Error(`gd-next 비활성(idx ${i}, ${DECK[i]?.id})`)
  await T(page, 'gd-next').click()
  if (!(await waitUntil(async () => (await idxOf(page)) === i + 1, { timeout: 5000 }))) throw new Error(`다음 카드로 안 넘어감(idx ${i})`)
}
async function prevCard(page) {
  const i = await idxOf(page)
  await T(page, 'gd-prev').click()
  if (!(await waitUntil(async () => (await idxOf(page)) === i - 1, { timeout: 5000 }))) throw new Error(`이전 카드로 안 넘어감(idx ${i})`)
}
const numOpt = (page, word) => page.locator('[data-testid^="scene-opt-"]').filter({ hasText: new RegExp(`^${word}$`) })
async function placeTrees(page, n, obj = S('build').place.obj) {
  for (let k = 0; k < n; k++) { await T(page, `scene-tray-${obj}`).click(); await T(page, 'scene-spot-0').click() }
}
async function buildCorrect(page) {
  const { place } = S('build')
  await placeTrees(page, place.n)
  await numOpt(page, NUMS[place.n]).click()
  await T(page, 'scene-check').click()
}
const readJ = (n, i, wrong) => (wrong ? i : (i - 1 + n) % n) // 그림 j는 (j+1)%n번째 문장의 장면 → 문장 i의 짝은 j=(i-1+n)%n
// 현재 카드를 "맞게" 끝낸다. leave에 든 카드 id는 일부러 틀린 채로 확인만 한다(고르기·읽기·듣기). 다음 버튼이 이미 열려 있으면 아무것도 안 한다
async function completeScene(page, c, leave) {
  if ((await T(page, 'gd-next').count()) === 0 || (await T(page, 'gd-next').isEnabled())) return
  const st = c.step; const wrong = !!leave?.has(c.id)
  switch (c.sceneKind) {
    case 'discover': await T(page, `scene-obj-${st.tap.obj}-0`).click(); break
    case 'choose': { const it = st.items[c.itemIndex]; await T(page, `scene-opt-${wrong ? 1 - it.correct : it.correct}`).click(); await T(page, 'scene-check').click(); break }
    case 'build': await buildCorrect(page); break
    case 'read': {
      const n = st.pairs.length
      for (let i = 0; i < n; i++) { await T(page, `scene-sent-${i}`).click(); await T(page, `scene-pic-${readJ(n, i, wrong)}`).click() }
      await T(page, 'scene-check').click(); break
    }
    case 'listen': { const it = st.items[c.itemIndex]; const w = it.options.findIndex((_, j) => j !== it.correct); await T(page, `scene-pic-${wrong ? w : it.correct}`).click(); await T(page, 'scene-check').click(); break }
    case 'speak': if (c.mode === 'exam') await T(page, 'scene-reveal').click(); else await T(page, 'scene-said').click(); break
    case 'write': await T(page, 'scene-write-input').fill('There is a bench.'); await T(page, 'scene-write-compare').click(); break
    default: break
  }
}
async function advanceTo(page, targetIdx, { hook, leave } = {}) {
  for (let i = await idxOf(page); i < targetIdx; i = await idxOf(page)) {
    const c = DECK[i]
    const shown = await T(page, 'gd-card').getAttribute('data-id')
    if (shown !== c.id) throw new Error(`카드 불일치: 화면 ${shown} / 덱 ${c.id}`)
    if (hook) await hook(c, i)
    await completeScene(page, c, leave)
    await nextCard(page)
  }
}
// 카드 하나의 공통 불변식(한 장만 DOM에 있음, data-*가 덱과 일치, 제목 포커스, 맨 위 스크롤, 답/정답 문장 미노출) — 아직 아무 답도 안 한 새 카드에서만 부른다
async function cardOk(page, i) {
  const c = DECK[i]; const bad = []
  if (!(await waitUntil(async () => (await T(page, 'gd-card').count()) === 1 && (await idxOf(page)) === i, { timeout: 5000 }))) bad.push(`gd-card 수 ${await T(page, 'gd-card').count()}/idx ${await idxOf(page)}`)
  if ((await T(page, 'gd-card').getAttribute('data-kind')) !== c.kind || (await T(page, 'gd-card').getAttribute('data-id')) !== c.id) bad.push('card data-kind/id 불일치')
  if ((await T(page, 'gd-root').getAttribute('data-total')) !== String(DECK.length)) bad.push('root data-total 불일치')
  if (c.kind === 'scene' && (await T(page, `scene-card-${c.sceneKind}`).count()) !== 1) bad.push(`scene-card-${c.sceneKind} 없음`)
  if ((await txt(page, 'gd-step')) !== c.stepKo) bad.push(`step ${await txt(page, 'gd-step')}≠${c.stepKo}`)
  if ((await txt(page, 'gd-progress')) !== `${i + 1} / ${DECK.length}`) bad.push(`progress ${await txt(page, 'gd-progress')}`)
  if (!(await waitUntil(() => page.evaluate(() => !!document.activeElement?.closest?.('[data-testid="gd-card"]')), { timeout: 3000 }))) bad.push('제목 포커스 아님')
  if ((await page.evaluate(() => window.scrollY)) !== 0) bad.push('scrollY≠0')
  const pre = c.kind !== 'scene' ? [] : ['scene-result', 'scene-why', 'scene-sentence', 'scene-write-example', ...(c.sceneKind === 'discover' ? ['scene-caption'] : []), ...(c.mode === 'exam' ? ['scene-model', 'scene-alternatives'] : [])]
  for (const id of pre) if ((await T(page, id).count()) > 0) bad.push(`미리 보이면 안 되는 ${id}`)
  return bad
}
// speak가 base 이후 정확히 want.length번 늘었고(기다린 뒤에도 더 늘지 않음) 그 문장들이 want와 같은지
async function speaksExactly(page, base, want) {
  await waitUntil(async () => (await speakLog(page)).length >= base + want.length, { timeout: 3000 })
  await sleep(250)
  const lg = await speakLog(page)
  return lg.length === base + want.length && want.every((w, k) => lg[base + k] === w)
}

export async function run(browser, baseURL) {
  const r = createRecorder('[grammar-scene]')
  const unmockedRequests = []
  const mockErrors = []
  if (!U?.scene) { r.skip('g-easy-05 그림 미션', `${UNIT_ID}에 scene 데이터가 아직 없음`); return { results: r.results, unmockedRequests, mockErrors } }

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
      await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 20000 })
    }
    const open = async () => {
      await toCourses()
      await T(page, 'grammar-course-easy').click(); await T(page, 'grammar-units').waitFor({ state: 'visible', timeout: 10000 })
      await T(page, `grammar-unit-${UNIT_ID}`).click(); await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 }); await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 10000 })
    }
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, open, toCourses })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
  }

  // ---------------- a 발견 ----------------
  await scenario('a 발견', VP, async ({ page, name, open }) => {
    const st = S('discover'); const di = cardIdx('discover')
    r.check(`${name} 장면 데이터 validateScene 오류 0`, validateScene(U.scene).length === 0, validateScene(U.scene).join(' / '))
    r.check(`${name} 덱: goal → 장면 카드 → summary, 발견 카드 위치 ${di}`, DECK[0].kind === 'goal' && DECK.at(-1).kind === 'summary' && di === 1 && DECK.slice(1, -1).every((c) => c.kind === 'scene'))
    await open()
    r.check(`${name} gd-root data-total=${DECK.length}(buildDeck), 첫 카드 goal`, (await T(page, 'gd-root').getAttribute('data-total')) === String(DECK.length) && (await T(page, 'gd-root').getAttribute('data-kind')) === 'goal' && (await T(page, 'gd-next').isEnabled()))
    await nextCard(page)
    const bad = await cardOk(page, di)
    r.check(`${name} 발견 카드 공통 불변식(한 장·data 일치·포커스·scrollY 0·캡션 미노출)`, bad.length === 0, bad.join('; '))
    const counts = await countsOf(page)
    r.check(`${name} park-scene data-counts='${counts}' = 데이터 layout, dog:1 포함, 폴 표시`, (await T(page, 'park-scene').count()) === 1 && counts.includes('dog:1') && (await sceneMatches(page, st.layout)) && (await T(page, 'scene-paul').count()) === 1)
    r.check(`${name} 그림 aria-label에 영어 문장 없음(한국어 설명만)`, !/there (is|are)/i.test((await T(page, 'park-scene').getAttribute('aria-label')) || ''))
    r.check(`${name} 탭 전: scene-caption 없음, 영어 문장이 카드에 없음, gd-next 비활성+힌트, 강아지 강조 꺼짐`,
      (await T(page, 'scene-caption').count()) === 0 && !(await T(page, 'gd-card').innerHTML()).includes(st.tap.en) && (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1 && (await T(page, 'scene-obj-dog-0').getAttribute('data-hl')) === 'false')
    const b0 = (await speakLog(page)).length
    await T(page, 'scene-obj-dog-0').focus()
    r.check(`${name} 키보드: 강아지 그림이 포커스를 받고 role=button`, (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'scene-obj-dog-0' && (await T(page, 'scene-obj-dog-0').getAttribute('role')) === 'button')
    await page.keyboard.press('Enter')
    r.check(`${name} Enter → 캡션 '${st.tap.en}' + 한국어 + speak 정확히 +1`, !!(await waitUntil(async () => (await T(page, 'scene-caption').count()) === 1, { timeout: 3000 })) && (await txt(page, 'scene-caption')) === st.tap.en && (await txt(page, 'gd-card')).includes(st.tap.ko) && (await speaksExactly(page, b0, [st.tap.en])))
    r.check(`${name} 탭 후: 다음 활성·힌트 없음, 강아지 강조(data-hl=true), 노트 표시`, (await T(page, 'gd-next').isEnabled()) && (await T(page, 'gd-next-hint').count()) === 0 && (await T(page, 'scene-obj-dog-0').getAttribute('data-hl')) === 'true' && (!st.noteKo || (await txt(page, 'gd-card')).includes(st.noteKo)))
    // 제품 규칙: 같은 그림을 다시 눌러도 다시 재생하지 않는다(재생은 🔊 버튼으로). 클릭 없이 시간이 가도 speak가 늘지 않는다
    await T(page, 'scene-obj-dog-0').click()
    r.check(`${name} 강아지를 다시 눌러도 speak 추가 없음(대기열 증가 없음)`, await speaksExactly(page, b0, [st.tap.en]))
    await T(page, 'scene-caption-listen').click()
    r.check(`${name} 캡션 🔊 클릭마다 speak 정확히 +1, 영어=${st.tap.en}`, await speaksExactly(page, b0, [st.tap.en, st.tap.en]))
    await sleep(400)
    r.check(`${name} 클릭 없이 시간이 지나도 speak 증가 없음`, (await speakLog(page)).length === b0 + 2)
  })

  // ---------------- b 비교 ----------------
  await scenario('b 비교', VP, async ({ page, name, open }) => {
    const st = S('compare'); const ci = cardIdx('compare')
    await open()
    await advanceTo(page, ci)
    const bad = await cardOk(page, ci)
    r.check(`${name} 비교 카드 공통 불변식`, bad.length === 0, bad.join('; '))
    r.check(`${name} 그림 2개, data-counts = 왼쪽 ${JSON.stringify(st.left.layout)} / 오른쪽 ${JSON.stringify(st.right.layout)} (dog:1, dog:3)`,
      (await T(page, 'park-scene').count()) === 2 && (await sceneMatches(page, st.left.layout, 0)) && (await sceneMatches(page, st.right.layout, 1)) && (await countsOf(page, 0)) === 'dog:1' && (await countsOf(page, 1)) === 'dog:3')
    r.check(`${name} 그림이 각 칸(scene-compare-0/1) 안에 하나씩 있음`, (await T(page, 'scene-compare-0').locator('[data-testid="park-scene"]').count()) === 1 && (await T(page, 'scene-compare-1').locator('[data-testid="park-scene"]').count()) === 1)
    r.check(`${name} 캡션 = 데이터(${st.left.en} / ${st.right.en}) + 한국어`, (await txt(page, 'scene-caption-0')) === st.left.en && (await txt(page, 'scene-caption-1')) === st.right.en && (await txt(page, 'gd-card')).includes(st.left.ko) && (await txt(page, 'gd-card')).includes(st.right.ko))
    r.check(`${name} 설명 줄 ${st.explainKo.length}개가 카드에 모두 표시`, (await Promise.all(st.explainKo.map(async (l) => norm(await txt(page, 'gd-card')).includes(norm(l))))).every(Boolean))
    r.check(`${name} 비교는 읽기 카드: 다음 활성(잠금 없음)`, (await T(page, 'gd-next').isEnabled()) && (await T(page, 'gd-next-hint').count()) === 0)
    const b0 = (await speakLog(page)).length
    await T(page, 'scene-listen-1').click()
    r.check(`${name} scene-listen-1 → speak +1 = ${st.right.en}`, await speaksExactly(page, b0, [st.right.en]))
    await T(page, 'scene-listen-0').click()
    r.check(`${name} scene-listen-0 → speak +1 = ${st.left.en}`, await speaksExactly(page, b0, [st.right.en, st.left.en]))
  })

  // ---------------- c 선택 ×3 ----------------
  await scenario('c 선택', VP, async ({ page, name, open }) => {
    const st = S('choose')
    await open()
    r.check(`${name} 선택 카드 ${st.items.length}장(데이터)`, DECK.filter((c) => c.sceneKind === 'choose').length === st.items.length)
    for (let k = 0; k < st.items.length; k++) {
      const it = st.items[k]; const idx = cardIdx('choose', k); const id = `${name} [선택 ${k + 1}/${st.items.length} ${it.frame}]`
      await advanceTo(page, idx)
      const bad = await cardOk(page, idx)
      r.check(`${id} 공통 불변식`, bad.length === 0, bad.join('; '))
      r.check(`${id} 그림 data-counts = layout ${JSON.stringify(it.layout)}, 틀(frame)에 ___ 그대로`, (await sceneMatches(page, it.layout)) && (await txt(page, 'scene-frame')) === it.frame && it.frame.includes('___'))
      r.check(`${id} 답 전: scene-why 없음, 확인 비활성, 다음 비활성+힌트, 보기 ${it.options.join('/')}`,
        (await T(page, 'scene-why').count()) === 0 && (await T(page, 'scene-check').isDisabled()) && (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1 &&
        (await Promise.all(it.options.map(async (o, j) => (await txt(page, `scene-opt-${j}`)) === o))).every(Boolean))
      const w = 1 - it.correct
      await T(page, `scene-opt-${w}`).click()
      r.check(`${id} 틀린 보기('${it.options[w]}') 고름: 틀에 반영, aria-pressed, 확인 활성, 아직 결과 없음`, (await txt(page, 'scene-frame')) === it.frame.replace('___', it.options[w]) && (await T(page, `scene-opt-${w}`).getAttribute('aria-pressed')) === 'true' && (await T(page, 'scene-check').isEnabled()) && (await T(page, 'scene-result').count()) === 0)
      await T(page, 'scene-check').click()
      r.check(`${id} 확인 → data-ok=false + scene-why(설명 포함) + 다시 풀기, 보기 잠김, 다음 활성(제품 규칙)`,
        (await T(page, 'scene-result').getAttribute('data-ok')) === 'false' && (await T(page, 'scene-why').isVisible()) && (await txt(page, 'scene-why')).includes(it.whyKo) && (await T(page, 'scene-retry').isVisible()) && (await T(page, 'scene-opt-0').isDisabled()) && (await T(page, 'gd-next').isEnabled()))
      await T(page, 'scene-retry').click()
      r.check(`${id} 다시 풀기 → 결과·설명 사라짐, 틀 원래대로, 보기 활성, 다음 비활성`, (await T(page, 'scene-result').count()) === 0 && (await T(page, 'scene-why').count()) === 0 && (await txt(page, 'scene-frame')) === it.frame && (await T(page, 'scene-opt-0').isEnabled()) && (await T(page, 'gd-next').isDisabled()))
      await T(page, `scene-opt-${it.correct}`).click(); await T(page, 'scene-check').click()
      r.check(`${id} 맞는 보기 → data-ok=true, 다시 풀기 없음, 다음 활성`, (await T(page, 'scene-result').getAttribute('data-ok')) === 'true' && (await T(page, 'scene-retry').count()) === 0 && (await txt(page, 'scene-frame')) === it.frame.replace('___', it.options[it.correct]) && (await T(page, 'gd-next').isEnabled()))
    }
  })

  // ---------------- d 만들기 (틀·보기는 "놓은 수"를 따른다: buildFrame) ----------------
  const HINT = /나무를 두\s?그루 심어 보세요/
  const enabledOpts = (page) => page.locator('[data-testid^="scene-opt-"]:enabled').count()
  const optTexts = (page) => page.locator('[data-testid^="scene-opt-"]').allTextContents().then((a) => a.map((x) => x.trim()))
  await scenario('d 만들기(0·1개: 틀·보기·힌트)', VP, async ({ page, name, open }) => {
    const st = S('build'); const bi = cardIdx('build'); const { obj, n } = st.place
    const ko = U.scene.objects[obj].ko
    const f0 = buildFrame(U.scene, st, 0); const f1 = buildFrame(U.scene, st, 1)
    const spots = () => page.locator('[data-testid^="scene-spot-"]').count()
    const placedText = async () => norm(await txt(page, 'scene-placed-count'))
    const card = async () => norm(await txt(page, 'gd-card'))
    await open()
    await advanceTo(page, bi)
    const bad = await cardOk(page, bi)
    r.check(`${name} 만들기 카드 공통 불변식`, bad.length === 0, bad.join('; '))
    r.check(`${name} 처음(0개): tray ${obj}(× ${n}), '놓은 ${ko}: 0 / ${n}', 빈 자리 ${st.slots}개, 그림 비어 있음, 틀 = 데이터 '${f0.frame}'`,
      (await T(page, `scene-tray-${obj}`).isEnabled()) && (await txt(page, `scene-tray-${obj}`)).includes(`× ${n}`) && (await placedText()).includes(`0 / ${n}`) && (await spots()) === st.slots && (await countsOf(page)) === '' && (await txt(page, 'scene-frame')) === f0.frame)
    r.check(`${name} 처음(0개): 고를 수 있는 보기 없음(활성 0), 안내 '먼저 놓아', 확인 비활성, 다음 비활성+힌트, 다시 놓기 없음`,
      (await enabledOpts(page)) === 0 && (await card()).includes('먼저 놓아') && (await T(page, 'scene-check').isDisabled()) && (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1 && (await T(page, 'scene-clear').count()) === 0)
    // 1개 놓기
    await T(page, 'scene-spot-0').click()
    r.check(`${name} 트레이를 안 누르고 빈 자리를 눌러도 놓이지 않음`, (await placedText()).includes(`0 / ${n}`) && (await countsOf(page)) === '')
    await T(page, `scene-tray-${obj}`).click()
    r.check(`${name} 트레이 누름 → aria-pressed=true`, (await T(page, `scene-tray-${obj}`).getAttribute('aria-pressed')) === 'true')
    await T(page, 'scene-spot-0').click()
    r.check(`${name} 1개 놓임: '1 / ${n}', data-counts=${obj}:1, 트레이 선택 해제, 빈 자리 ${st.slots - 1}개, 트레이 '× ${n - 1}', 다시 놓기 보임`,
      (await placedText()).includes(`1 / ${n}`) && (await countsOf(page)) === `${obj}:1` && (await T(page, `scene-tray-${obj}`).getAttribute('aria-pressed')) === 'false' && (await spots()) === st.slots - 1 && (await txt(page, `scene-tray-${obj}`)).includes(`× ${n - 1}`) && (await T(page, 'scene-clear').isVisible()))
    r.check(`${name} 1개: 틀 '${f1.frame}', 보기 ${f1.options.join('/')} 전부 활성, 힌트 '나무를 두 그루 심어 보세요' 표시, '먼저' 안내 사라짐`,
      (await txt(page, 'scene-frame')) === f1.frame && JSON.stringify(await optTexts(page)) === JSON.stringify(f1.options) && (await enabledOpts(page)) === f1.options.length && HINT.test(await card()) && !(await card()).includes('먼저 놓아'))
    // 보기를 고른 뒤 다시 놓기 → 고른 보기 초기화
    await T(page, `scene-opt-${f1.options.indexOf('two')}`).click()
    r.check(`${name} 1개 + 'two' 고름 → 틀에 반영, 확인 활성`, (await txt(page, 'scene-frame')) === f1.frame.replace('___', 'two') && (await T(page, 'scene-check').isEnabled()))
    await T(page, 'scene-clear').click()
    r.check(`${name} 다시 놓기 → 0개, 고른 보기 초기화(틀 = 데이터 틀), 보기 없음, 빈 자리 ${st.slots}개, 다시 놓기 버튼 사라짐`, (await placedText()).includes(`0 / ${n}`) && (await countsOf(page)) === '' && (await txt(page, 'scene-frame')) === f0.frame && (await enabledOpts(page)) === 0 && (await spots()) === st.slots && (await T(page, 'scene-clear').count()) === 0)
    // 불일치: 1개 + 'two' → 틀림
    await placeTrees(page, 1, obj)
    await T(page, `scene-opt-${f1.options.indexOf('two')}`).click(); await T(page, 'scene-check').click()
    r.check(`${name} 1개 + 'two' → data-ok=false, 설명에 '두 그루'(데이터 whyKo)·'달라요', 다시 풀기, 다음 활성, 다시 놓기 잠김`, (await T(page, 'scene-result').getAttribute('data-ok')) === 'false' && (await txt(page, 'scene-why')).includes('두 그루') && (await txt(page, 'scene-why')).includes('달라요') && (await T(page, 'scene-retry').isVisible()) && (await T(page, 'gd-next').isEnabled()) && (await T(page, 'scene-clear').count()) === 0)
    await T(page, 'scene-retry').click()
    r.check(`${name} 다시 풀기 → 놓은 ${obj} 0개로 처음 상태, 다음 비활성`, (await T(page, 'scene-result').count()) === 0 && (await placedText()).includes(`0 / ${n}`) && (await countsOf(page)) === '' && (await txt(page, 'scene-frame')) === f0.frame && (await spots()) === st.slots && (await T(page, 'gd-next').isDisabled()))
    // 일관된 문장: 1개 + 'a' → 맞음, 그래도 목표(두 그루) 힌트가 남는다
    await placeTrees(page, 1, obj)
    await T(page, `scene-opt-${f1.correct}`).click()
    r.check(`${name} 1개 + '${f1.options[f1.correct]}' 고름 → 틀 'There is a tree.'`, (await txt(page, 'scene-frame')) === f1.frame.replace('___', f1.options[f1.correct]))
    await T(page, 'scene-check').click()
    r.check(`${name} 1개 + 'a' → data-ok=true, 내 문장(There is a tree.), 힌트 '나무를 두 그루 심어 보세요' 표시, 다시 풀기 없음, 보기 잠김, 다음 활성`,
      (await T(page, 'scene-result').getAttribute('data-ok')) === 'true' && (await txt(page, 'scene-why')).includes('There is a tree.') && HINT.test(await txt(page, 'scene-why')) && (await T(page, 'scene-retry').count()) === 0 && (await T(page, 'scene-opt-0').isDisabled()) && (await T(page, 'gd-next').isEnabled()))
  })

  await scenario('d 만들기(2개: 정답·선택 초기화)', VP, async ({ page, name, open }) => {
    const st = S('build'); const { obj, n } = st.place
    const fn = buildFrame(U.scene, st, n)
    const placedText = async () => norm(await txt(page, 'scene-placed-count'))
    await open()
    await advanceTo(page, cardIdx('build'))
    // 1개 놓고 보기를 고른 뒤 한 개 더 놓으면 고른 보기가 초기화되고 틀·보기가 바뀐다
    await placeTrees(page, 1, obj)
    await T(page, 'scene-opt-0').click()
    r.check(`${name} 1개 + 보기 선택 상태`, (await T(page, 'scene-opt-0').getAttribute('aria-pressed')) === 'true')
    await T(page, `scene-tray-${obj}`).click(); await T(page, 'scene-spot-1').click()
    r.check(`${name} 2개째(spot-1) → '${n} / ${n}', data-counts=${obj}:${n}, 트레이 비활성, 빈 자리 숨김`,
      (await placedText()).includes(`${n} / ${n}`) && (await countsOf(page)) === `${obj}:${n}` && (await T(page, `scene-tray-${obj}`).isDisabled()) && (await page.locator('[data-testid^="scene-spot-"]').count()) === 0)
    r.check(`${name} 놓은 수가 바뀌면 고른 보기 초기화(어느 보기도 pressed 아님), 틀 '${fn.frame}', 보기 ${fn.options.join('/')}, 확인 비활성`,
      (await page.locator('[data-testid^="scene-opt-"][aria-pressed="true"]').count()) === 0 && (await txt(page, 'scene-frame')) === fn.frame && JSON.stringify(await optTexts(page)) === JSON.stringify(fn.options) && (await T(page, 'scene-check').isDisabled()))
    r.check(`${name} 2개: 목표 달성이라 힌트 '두 그루 심어 보세요' 없음`, !HINT.test(norm(await txt(page, 'gd-card'))))
    await T(page, `scene-opt-${fn.correct}`).click()
    r.check(`${name} '${fn.options[fn.correct]}' 고름 → 틀 '${st.answerEn}'`, (await txt(page, 'scene-frame')) === st.answerEn)
    await T(page, 'scene-check').click()
    r.check(`${name} 2개 + 'two' → data-ok=true, 설명(${st.whyKo}) + 내 문장, 힌트 없음, 다시 풀기 없음, 보기 잠김, 다음 활성`,
      (await T(page, 'scene-result').getAttribute('data-ok')) === 'true' && (await txt(page, 'scene-why')).includes(st.whyKo) && (await txt(page, 'scene-why')).includes(st.answerEn) && !HINT.test(await txt(page, 'scene-why')) && (await T(page, 'scene-retry').count()) === 0 && (await T(page, 'scene-opt-0').isDisabled()) && (await T(page, 'gd-next').isEnabled()) && (await T(page, 'scene-clear').count()) === 0)
  })

  // ---------------- d2 만들기: 키보드·드래그 ----------------
  await scenario('d 만들기(키보드·드래그)', VP, async ({ page, name, open }) => {
    const st = S('build'); const { obj, n } = st.place
    const placedText = async () => norm(await txt(page, 'scene-placed-count'))
    const center = async (id) => { const b = await T(page, id).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
    await open()
    await advanceTo(page, cardIdx('build'))
    // 놓을 곳이 아닌 데로 끌어다 놓기 → 아무것도 안 놓이고 트레이도 선택 안 됨
    const from = await center(`scene-tray-${obj}`); const miss = await center('gd-step')
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(miss.x, miss.y, { steps: 10 }); await page.mouse.up()
    await sleep(100)
    r.check(`${name} 빈 자리 밖으로 끌어 놓으면 놓이지 않고 트레이도 선택 안 됨`, (await placedText()).includes(`0 / ${n}`) && (await T(page, `scene-tray-${obj}`).getAttribute('aria-pressed')) === 'false' && (await countsOf(page)) === '')
    // 키보드: 트레이에 포커스 → Enter → spot-2에 포커스 → Enter
    await T(page, `scene-tray-${obj}`).focus(); await page.keyboard.press('Enter')
    r.check(`${name} 키보드: 트레이 Enter → aria-pressed=true`, (await T(page, `scene-tray-${obj}`).getAttribute('aria-pressed')) === 'true')
    await T(page, 'scene-spot-2').focus()
    r.check(`${name} 키보드: 빈 자리가 포커스 가능(role=button, 한국어 라벨)`, (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'scene-spot-2' && (await T(page, 'scene-spot-2').getAttribute('role')) === 'button' && (await T(page, 'scene-spot-2').getAttribute('aria-label')) === '여기에 놓기')
    await page.keyboard.press('Enter')
    r.check(`${name} 키보드: spot-2 Enter → 1개 놓임, data-counts=${obj}:1, 선택 해제`, (await placedText()).includes(`1 / ${n}`) && (await countsOf(page)) === `${obj}:1` && (await T(page, `scene-tray-${obj}`).getAttribute('aria-pressed')) === 'false')
    // 드래그: 트레이에서 pointer down → 빈 자리 위로 move → up
    const f2 = await center(`scene-tray-${obj}`); const s0 = await center('scene-spot-0')
    await page.mouse.move(f2.x, f2.y); await page.mouse.down(); await page.mouse.move(s0.x, s0.y, { steps: 12 }); await page.mouse.up()
    r.check(`${name} 드래그: 빈 자리에 놓으면 놓임('${n} / ${n}'), data-counts=${obj}:${n}, 클릭으로 선택되지 않음, 트레이 비활성`,
      !!(await waitUntil(async () => (await placedText()).includes(`${n} / ${n}`), { timeout: 3000 })) && (await countsOf(page)) === `${obj}:${n}` && (await T(page, `scene-tray-${obj}`).getAttribute('aria-pressed')) === 'false' && (await T(page, `scene-tray-${obj}`).isDisabled()))
    await numOpt(page, NUMS[n]).click(); await T(page, 'scene-check').click()
    r.check(`${name} 키보드+드래그로 만든 공원도 판정 data-ok=true`, (await T(page, 'scene-result').getAttribute('data-ok')) === 'true' && (await T(page, 'gd-next').isEnabled()))
  })

  // ---------------- e 읽기 ----------------
  await scenario('e 읽기', VP, async ({ page, name, open }) => {
    const st = S('read'); const n = st.pairs.length; const ri = cardIdx('read')
    await open()
    await advanceTo(page, ri)
    const bad = await cardOk(page, ri)
    r.check(`${name} 읽기 카드 공통 불변식`, bad.length === 0, bad.join('; '))
    r.check(`${name} 문장 ${n}개 = 데이터, 그림 ${n}개는 한 칸씩 어긋난 순서(그림 j = 문장 (j+1)%${n}의 장면)`,
      (await Promise.all(st.pairs.map(async (p, i) => (await txt(page, `scene-sent-${i}`)) === p.en))).every(Boolean) &&
      (await Promise.all(st.pairs.map(async (_, j) => sceneMatches(page, st.pairs[(j + 1) % n].layout, j)))).every(Boolean))
    r.check(`${name} 처음: 확인 비활성, 다음 비활성+힌트`, (await T(page, 'scene-check').isDisabled()) && (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1)
    const b0 = (await speakLog(page)).length
    await T(page, 'scene-sent-0').click()
    r.check(`${name} 문장 누르면 그 문장을 읽어 줌(speak +1 = ${st.pairs[0].en}), aria-pressed`, (await T(page, 'scene-sent-0').getAttribute('aria-pressed')) === 'true' && (await speaksExactly(page, b0, [st.pairs[0].en])))
    await T(page, `scene-pic-${readJ(n, 0, true)}`).click()
    r.check(`${name} 그림을 누르면 짝 표시('그림 N'), 문장 선택 해제`, (await txt(page, 'scene-sent-0')).includes(`그림 ${readJ(n, 0, true) + 1}`) && (await T(page, 'scene-sent-0').getAttribute('aria-pressed')) === 'false')
    for (let i = 1; i < n - 1; i++) { await T(page, `scene-sent-${i}`).click(); await T(page, `scene-pic-${readJ(n, i, true)}`).click() }
    r.check(`${name} ${n - 1}개만 짝지으면 확인 비활성`, n < 3 || (await T(page, 'scene-check').isDisabled()))
    await T(page, `scene-sent-${n - 1}`).click(); await T(page, `scene-pic-${readJ(n, n - 1, true)}`).click()
    r.check(`${name} 전부 짝지으면 확인 활성, 아직 결과 없음`, (await T(page, 'scene-check').isEnabled()) && (await T(page, 'scene-result').count()) === 0)
    await T(page, 'scene-check').click()
    r.check(`${name} 틀린 짝(문장 i ↔ 그림 i) → data-ok=false, 문장마다 data-ok=false, 설명, 다시 풀기, 다음 활성`,
      (await T(page, 'scene-result').getAttribute('data-ok')) === 'false' && (await Promise.all(st.pairs.map(async (_, i) => (await T(page, `scene-sent-${i}`).getAttribute('data-ok')) === 'false'))).every(Boolean) && (await T(page, 'scene-why').isVisible()) && (await T(page, 'scene-retry').isVisible()) && (await T(page, 'gd-next').isEnabled()))
    await T(page, 'scene-retry').click()
    r.check(`${name} 다시 풀기 → 결과 없음, 짝 표시 지워짐, 확인 비활성, 다음 비활성`, (await T(page, 'scene-result').count()) === 0 && (await T(page, 'scene-sent-0').getAttribute('data-ok')) === null && !(await txt(page, 'scene-sent-0')).includes('그림 ') && (await T(page, 'scene-check').isDisabled()) && (await T(page, 'gd-next').isDisabled()))
    for (let i = 0; i < n; i++) { await T(page, `scene-sent-${i}`).click(); await T(page, `scene-pic-${readJ(n, i, false)}`).click() }
    await T(page, 'scene-check').click()
    r.check(`${name} 맞는 짝 → data-ok=true, 문장마다 data-ok=true, 다시 풀기 없음, 문장·그림 잠김, 다음 활성`,
      (await T(page, 'scene-result').getAttribute('data-ok')) === 'true' && (await Promise.all(st.pairs.map(async (_, i) => (await T(page, `scene-sent-${i}`).getAttribute('data-ok')) === 'true'))).every(Boolean) && (await T(page, 'scene-retry').count()) === 0 && (await T(page, 'scene-sent-0').isDisabled()) && (await T(page, 'scene-pic-0').isDisabled()) && (await T(page, 'gd-next').isEnabled()))
  })

  // ---------------- f 듣기 ×2 ----------------
  await scenario('f 듣기', VP, async ({ page, name, open }) => {
    const st = S('listen')
    await open()
    for (let k = 0; k < st.items.length; k++) {
      const it = st.items[k]; const idx = cardIdx('listen', k); const id = `${name} [듣기 ${k + 1}/${st.items.length}]`
      await advanceTo(page, idx)
      const bad = await cardOk(page, idx)
      r.check(`${id} 공통 불변식`, bad.length === 0, bad.join('; '))
      r.check(`${id} 확인 전: 영어 문장이 DOM 어디에도 없음(scene-sentence 없음, 카드 HTML에 '${it.en}' 없음), 보기 그림 ${it.options.length}개 = 데이터`,
        (await T(page, 'scene-sentence').count()) === 0 && !(await T(page, 'gd-card').innerHTML()).includes(it.en) && !(await txt(page, 'gd-card')).includes(it.en) &&
        (await Promise.all(it.options.map(async (o, j) => sceneMatches(page, o.layout, j)))).every(Boolean) && (await T(page, 'park-scene').count()) === it.options.length)
      r.check(`${id} 확인 전: 확인 비활성, 다음 비활성+힌트`, (await T(page, 'scene-check').isDisabled()) && (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1)
      const b0 = (await speakLog(page)).length
      await T(page, 'scene-listen-play').click()
      r.check(`${id} 🔊 문장 듣기 → speak 정확히 +1, 텍스트 = '${it.en}'`, await speaksExactly(page, b0, [it.en]))
      await T(page, 'scene-listen-play').click()
      r.check(`${id} 다시 누르면 다시 +1(클릭당 1회)`, await speaksExactly(page, b0, [it.en, it.en]))
      const w = it.options.findIndex((_, j) => j !== it.correct)
      await T(page, `scene-pic-${w}`).click()
      r.check(`${id} 틀린 그림 고름: aria-pressed, 확인 활성, 문장 아직 안 보임`, (await T(page, `scene-pic-${w}`).getAttribute('aria-pressed')) === 'true' && (await T(page, 'scene-check').isEnabled()) && (await T(page, 'scene-sentence').count()) === 0)
      await T(page, 'scene-check').click()
      r.check(`${id} 확인 → data-ok=false, 문장 공개('${it.en}'), scene-why(설명), 다시 풀기, 그림 잠김, 다음 활성`,
        (await T(page, 'scene-result').getAttribute('data-ok')) === 'false' && (await txt(page, 'scene-sentence')) === it.en && (await txt(page, 'scene-why')).includes(it.whyKo) && (await T(page, 'scene-retry').isVisible()) && (await T(page, 'scene-pic-0').isDisabled()) && (await T(page, 'gd-next').isEnabled()))
      await T(page, 'scene-retry').click()
      r.check(`${id} 다시 풀기 → 문장 다시 숨김(DOM에 없음), 결과 없음, 그림 선택 해제, 다음 비활성`,
        (await T(page, 'scene-sentence').count()) === 0 && !(await T(page, 'gd-card').innerHTML()).includes(it.en) && (await T(page, 'scene-result').count()) === 0 && (await T(page, `scene-pic-${w}`).getAttribute('aria-pressed')) === 'false' && (await T(page, 'gd-next').isDisabled()))
      await T(page, `scene-pic-${it.correct}`).click(); await T(page, 'scene-check').click()
      r.check(`${id} 맞는 그림 → data-ok=true, 문장 공개, 다시 풀기 없음, 다음 활성`, (await T(page, 'scene-result').getAttribute('data-ok')) === 'true' && (await txt(page, 'scene-sentence')) === it.en && (await T(page, 'scene-retry').count()) === 0 && (await T(page, 'gd-next').isEnabled()))
    }
  })

  // ---------------- g 말하기 연습·시험 ----------------
  await scenario('g 말하기', VP, async ({ page, name, open }) => {
    const st = S('speak'); const pi = cardIdx('speak', 0, 'practice'); const ei = cardIdx('speak', 1, 'exam')
    const bs = S('build')
    await open()
    await advanceTo(page, pi) // 만들기에서 나무를 bs.place.n그루 놓은 채로 도착
    const bad = await cardOk(page, pi)
    r.check(`${name} 말하기 연습 카드 공통 불변식(제목 '말하기 연습')`, bad.length === 0 && (await txt(page, 'gd-card')).includes('말하기 연습'), bad.join('; '))
    r.check(`${name} 내 공원 그림: data-counts=${bs.place.obj}:${bs.place.n} (만들기에서 놓은 것)`, (await countsOf(page)) === `${bs.place.obj}:${bs.place.n}`)
    r.check(`${name} scene-model = '${st.practice.modelEn}' + 한국어, 다른 표현 안내 전부 표시`, (await txt(page, 'scene-model')) === st.practice.modelEn && (await txt(page, 'gd-card')).includes(st.practice.modelKo) && (await Promise.all(st.practice.alternatives.map(async (a) => (await txt(page, 'gd-card')).includes(a)))).every(Boolean))
    r.check(`${name} 녹음기 있음(선택 사항): scene-record 보임, 다음은 말해 봤어요 전까지 비활성+힌트`, (await T(page, 'scene-record').isVisible()) && (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1)
    const b0 = (await speakLog(page)).length
    await T(page, 'scene-model-listen').click()
    r.check(`${name} scene-model-listen → speak +1 = ${st.practice.modelEn}`, await speaksExactly(page, b0, [st.practice.modelEn]))
    await T(page, 'scene-said').click()
    r.check(`${name} 말해 봤어요 → 격려 문구, 다음 활성(녹음 안 해도 됨)`, (await T(page, 'gd-next').isEnabled()) && (await txt(page, 'gd-card')).includes('괜찮아요') && !JUDGE.test(await txt(page, 'gd-card')))
    await nextCard(page)
    // 시험
    const bad2 = await cardOk(page, ei)
    r.check(`${name} 말하기 시험 카드 공통 불변식(모범 답·다른 표현 미노출)`, bad2.length === 0 && (await txt(page, 'gd-card')).includes('말하기 시험'), bad2.join('; '))
    const html = await T(page, 'gd-card').innerHTML()
    r.check(`${name} 시험 공개 전: scene-model·scene-alternatives 없음, 영어 모범 답('${st.exam.modelEn}')·다른 표현이 DOM에 없음, 한국어 상황·내 공원·녹음기만`,
      (await T(page, 'scene-model').count()) === 0 && (await T(page, 'scene-alternatives').count()) === 0 && !html.includes(st.exam.modelEn) && st.exam.alternatives.every((a) => !html.includes(a)) && (await txt(page, 'gd-card')).includes(st.exam.situationKo) && (await countsOf(page)) === `${bs.place.obj}:${bs.place.n}` && (await T(page, 'scene-record').isVisible()))
    r.check(`${name} 시험 공개 전: 다음 비활성+힌트, 공개 버튼 보임, speak 증가 없음`, (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1 && (await T(page, 'scene-reveal').isVisible()) && (await speaksExactly(page, b0 + 1, [])))
    const b1 = (await speakLog(page)).length
    await T(page, 'scene-reveal').click()
    r.check(`${name} 공개 → scene-model('${st.exam.modelEn}')·scene-alternatives(전부) 보임, 공개 버튼 사라짐, 자동 재생 없음, 다음 활성`,
      (await txt(page, 'scene-model')) === st.exam.modelEn && (await T(page, 'scene-alternatives').isVisible()) && (await Promise.all(st.exam.alternatives.map(async (a) => (await txt(page, 'scene-alternatives')).includes(a)))).every(Boolean) && (await T(page, 'scene-reveal').count()) === 0 && (await T(page, 'gd-next').isEnabled()) && (await speaksExactly(page, b1, [])))
    await T(page, 'scene-model-listen').click()
    r.check(`${name} 공개 후 scene-model-listen → speak +1 = ${st.exam.modelEn}`, await speaksExactly(page, b1, [st.exam.modelEn]))
    r.check(`${name} 시험은 판정 단어 없음('달라도 괜찮아요' 안내)`, !JUDGE.test(await txt(page, 'gd-card')) && (await txt(page, 'gd-card')).includes('달라도 괜찮아요'))
  })

  // ---------------- h 쓰기 ----------------
  await scenario('h 쓰기', VP, async ({ page, name, open }) => {
    const st = S('write'); const wi = cardIdx('write'); const bs = S('build')
    await open()
    await advanceTo(page, wi)
    const bad = await cardOk(page, wi)
    r.check(`${name} 쓰기 카드 공통 불변식`, bad.length === 0, bad.join('; '))
    r.check(`${name} 내 공원 그림(${bs.place.obj}:${bs.place.n}), 입력창 비어 있음, 비교 비활성, 다음 비활성+힌트, 예시 없음`, (await countsOf(page)) === `${bs.place.obj}:${bs.place.n}` && (await T(page, 'scene-write-input').inputValue()) === '' && (await T(page, 'scene-write-compare').isDisabled()) && (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1 && (await T(page, 'scene-write-example').count()) === 0)
    await T(page, 'scene-write-input').fill('There is a bench.')
    r.check(`${name} 입력하면 비교 활성, 아직 다음 비활성`, (await T(page, 'scene-write-compare').isEnabled()) && (await T(page, 'gd-next').isDisabled()))
    await T(page, 'scene-write-compare').click()
    const t = await txt(page, 'scene-write-example')
    r.check(`${name} 예시와 비교: 내 문장 + 예시 '${st.exampleEn}' + 허용 안내(acceptNoteKo) 표시, 판정 단어 없음, 다음 활성`,
      t.includes('There is a bench.') && t.includes(st.exampleEn) && norm(t).includes(norm(st.acceptNoteKo)) && t.includes('하나의 답') && !JUDGE.test(t) && (await T(page, 'gd-next').isEnabled()), t.slice(0, 160))
  })

  // ---------------- i 마무리·요약 ----------------
  await scenario('i 마무리·요약', VP, async ({ page, name, open }) => {
    const st = S('finish'); const fi = cardIdx('finish'); const si = DECK.length - 1
    const listenWrong = DECK[cardIdx('listen', 1)]
    const leave = new Set([listenWrong.id])
    const practice = DECK.filter(isPractice)
    const rightExpected = practice.filter((c) => c.sceneKind !== 'speak' && c.id !== listenWrong.id).length
    const visited = []
    await open()
    await advanceTo(page, fi, { leave, hook: async (c, i) => { visited.push(c.id); const bad = await cardOk(page, i); r.check(`${name} 카드 ${i + 1}/${DECK.length} ${c.id}: 한 장만·data 일치·포커스·scrollY 0·미리 답 없음`, bad.length === 0, bad.join('; ')) } })
    r.check(`${name} 마무리 전까지 방문 카드 = 덱 순서(${visited.length}장)`, JSON.stringify(visited) === JSON.stringify(DECK.slice(0, fi).map((c) => c.id)))
    const bad = await cardOk(page, fi)
    r.check(`${name} 마무리 카드 공통 불변식`, bad.length === 0, bad.join('; '))
    r.check(`${name} scene-finish, 할 수 있어요 ${st.canDoKo.length}개(scene-cando-i) = 데이터`, (await T(page, 'scene-finish').isVisible()) && (await page.locator('[data-testid^="scene-cando-"]').count()) === st.canDoKo.length && (await Promise.all(st.canDoKo.map(async (l, i) => (await txt(page, `scene-cando-${i}`)).includes(l)))).every(Boolean))
    r.check(`${name} 폴 말풍선 = paulKo, 보상 안내(rewardNoteKo) 표시, 새 포인트 약속 문구 없음`, (await txt(page, 'scene-paul-bubble')) === st.paulKo && (!st.rewardNoteKo || (await txt(page, 'gd-card')).includes(st.rewardNoteKo)) && !/\+\s*\d+\s*(점|포인트|별)/.test(await txt(page, 'gd-card')))
    r.check(`${name} 마무리: 다음 활성(힌트 없음), 이전 활성`, (await T(page, 'gd-next').isEnabled()) && (await T(page, 'gd-next-hint').count()) === 0 && (await T(page, 'gd-prev').isEnabled()))
    await nextCard(page)
    const sum = norm(await txt(page, 'gd-summary-counts'))
    const want = `참여 기록: 설명 카드 ${deckCounts(DECK).explain} · 문제 ${practice.length} · 맞힘 ${rightExpected} · 틀림 1`
    r.check(`${name} 요약: '${want}' (듣기 2번을 틀린 채 둠, 시험은 판정 없음)`, sum === want, sum)
    r.check(`${name} 틀린 문제 목록 = 듣기 2번 카드만, 다시 풀기/단원 목록 버튼, 마지막 카드라 다음 없음`,
      (await page.locator('[data-testid^="gd-summary-wrong-"]').count()) === 1 && (await T(page, `gd-summary-wrong-${listenWrong.id}`).count()) === 1 && (await T(page, 'gd-retry-wrong').isVisible()) && (await T(page, 'gd-to-list').isVisible()) && (await T(page, 'gd-next').count()) === 0)
    await T(page, 'gd-retry-wrong').click()
    r.check(`${name} 틀린 문제 다시 풀기 → 그 카드(idx ${cardIdx('listen', 1)})로 이동, 답 초기화(확인 비활성·문장 숨김·다음 잠금)`,
      !!(await waitUntil(async () => (await idxOf(page)) === cardIdx('listen', 1), { timeout: 5000 })) && (await T(page, 'gd-card').getAttribute('data-id')) === listenWrong.id && (await T(page, 'scene-check').isDisabled()) && (await T(page, 'scene-sentence').count()) === 0 && (await T(page, 'gd-next').isDisabled()))
    await completeScene(page, listenWrong, null)
    await advanceTo(page, si)
    const sum2 = norm(await txt(page, 'gd-summary-counts'))
    r.check(`${name} 다시 맞힌 뒤 요약: 틀림 0, 틀린 문제 목록·다시 풀기 버튼 없음`, sum2.includes('틀림 0') && sum2.includes(`맞힘 ${rightExpected + 1}`) && (await T(page, 'gd-retry-wrong').count()) === 0 && (await page.locator('[data-testid^="gd-summary-wrong-"]').count()) === 0, sum2)
    await T(page, 'gd-to-list').click()
    r.check(`${name} 단원 목록으로 → 같은 과정(easy) 목록, 덱 사라짐`, !!(await waitUntil(async () => (await T(page, 'grammar-units').count()) === 1, { timeout: 5000 })) && (await T(page, 'grammar-units').getAttribute('data-course')) === 'easy' && (await T(page, 'gd-root').count()) === 0)
  })

  // ---------------- j 답안 유지 ----------------
  await scenario('j 답안 유지(이전↔다음)', VP, async ({ page, name, open }) => {
    const st = S('choose'); const bs = S('build'); const c0 = cardIdx('choose', 0); const bi = cardIdx('build')
    const it = st.items[0]
    await open()
    await advanceTo(page, c0)
    await T(page, `scene-opt-${it.correct}`).click(); await T(page, 'scene-check').click()
    await advanceTo(page, bi) // 선택 2·3을 맞게 풀고 만들기 도착
    await placeTrees(page, bs.place.n, bs.place.obj)
    await numOpt(page, NUMS[bs.place.n]).click() // 확인은 하지 않음
    for (let k = bi; k > c0; k--) await prevCard(page)
    r.check(`${name} 선택 1로 돌아옴: 고른 보기 aria-pressed=true, 결과(data-ok=true)·설명 보임, 다음 활성`,
      (await idxOf(page)) === c0 && (await T(page, `scene-opt-${it.correct}`).getAttribute('aria-pressed')) === 'true' && (await T(page, 'scene-result').getAttribute('data-ok')) === 'true' && (await T(page, 'scene-why').isVisible()) && (await T(page, 'gd-next').isEnabled()) && (await txt(page, 'scene-frame')) === it.frame.replace('___', it.options[it.correct]))
    for (let k = c0; k < bi; k++) await nextCard(page)
    r.check(`${name} 만들기로 다시 옴: 나무 ${bs.place.n}그루 그대로(data-counts=${bs.place.obj}:${bs.place.n}, '${bs.place.n} / ${bs.place.n}'), 숫자 '${NUMS[bs.place.n]}' 선택 유지(확인 전이라 결과 없음)`,
      (await idxOf(page)) === bi && (await countsOf(page)) === `${bs.place.obj}:${bs.place.n}` && norm(await txt(page, 'scene-placed-count')).includes(`${bs.place.n} / ${bs.place.n}`) && (await numOpt(page, NUMS[bs.place.n]).getAttribute('aria-pressed')) === 'true' && (await T(page, 'scene-result').count()) === 0 && (await T(page, 'scene-check').isEnabled()))
    await T(page, 'scene-check').click()
    await nextCard(page); await prevCard(page)
    r.check(`${name} 확인한 뒤 다음→이전: 결과 data-ok=true, 나무 유지, 트레이 잠김`, (await T(page, 'scene-result').getAttribute('data-ok')) === 'true' && (await countsOf(page)) === `${bs.place.obj}:${bs.place.n}` && (await T(page, `scene-tray-${bs.place.obj}`).isDisabled()))
    // 발견 카드: 눌러 둔 캡션도 유지
    while ((await idxOf(page)) > cardIdx('discover')) await prevCard(page)
    r.check(`${name} 발견 카드로 돌아옴: 캡션 그대로, 다음 활성`, (await T(page, 'scene-caption').count()) === 1 && (await T(page, 'gd-next').isEnabled()))
  })

  // ---------------- k 레이아웃 ----------------
  try { mkdirSync(SHOTS_DIR, { recursive: true }) } catch { /* 폴더를 못 만들면 스크린샷만 건너뜀 */ }
  for (const vp of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    await scenario('k 레이아웃', vp, async ({ page, name, open }) => {
      const shot = async (kind) => {
        if (!(vp.width === 360 || (vp.width === 1280 && kind === 'build'))) return
        await page.evaluate(() => { document.querySelector('[data-testid="gd-card"]')?.scrollTo(0, 0); window.scrollTo(0, 0) })
        await waitUntil(() => page.evaluate(() => { const c = document.querySelector('[data-testid="gd-card"]'); return !!c && getComputedStyle(c).opacity === '1' && document.getAnimations().every((a) => a.playState !== 'running') }), { timeout: 3000 })
        await page.screenshot({ path: `${SHOTS_DIR}\\scene-${kind}-${vp.width}.png` }).catch(() => {})
      }
      const chk = async (label) => {
        const small = await smallButtons(page, 'gd-root'); const cl = await clipped(page, 'gd-root')
        let widgetBad = ''
        if (vp.width <= 390 && (await T(page, 'gd-next').count()) > 0) {
          const nb = await T(page, 'gd-next').evaluate((el) => ({ bottom: el.getBoundingClientRect().bottom, right: el.getBoundingClientRect().right, ih: window.innerHeight, iw: window.innerWidth }))
          if (nb.bottom > nb.ih - 76 || nb.right > nb.iw) widgetBad = `gd-next 위젯과 겹침 bottom ${Math.round(nb.bottom)} > ${nb.ih - 76}`
        }
        // 그림은 카드 안(가로 전부, 세로는 카드 안에서 스크롤해 보이면 전부)에 있어야 하고 카드보다 넓으면 안 된다
        const sceneBad = await page.evaluate(() => {
          const card = document.querySelector('[data-testid="gd-card"]'); const bad = []
          card.querySelectorAll('[data-testid="park-scene"]').forEach((s, k) => {
            s.scrollIntoView({ block: 'nearest' })
            const b = s.getBoundingClientRect(); const cr = card.getBoundingClientRect()
            if (b.width > cr.width + 1) bad.push(`#${k} 너비 ${Math.round(b.width)}>${Math.round(cr.width)}`)
            if (b.left < cr.left - 1 || b.right > cr.right + 1) bad.push(`#${k} 가로 밖`)
            if (b.top < cr.top - 1 || b.bottom > cr.bottom + 1) bad.push(`#${k} 세로 잘림 ${Math.round(b.top)}~${Math.round(b.bottom)} / 카드 ${Math.round(cr.top)}~${Math.round(cr.bottom)}`)
            if (b.width < 20 || b.height < 20) bad.push(`#${k} 너무 작음`)
          })
          card.scrollTo(0, 0); window.scrollTo(0, 0)
          return bad
        })
        const navs = []
        for (const id of ['gd-prev', 'gd-next']) {
          if ((await T(page, id).count()) === 0) continue
          navs.push([id, await T(page, id).evaluate((el) => { const b = el.getBoundingClientRect(); return { h: b.height, ok: b.bottom <= window.innerHeight + 1 && b.top >= -1 && b.left >= -1 && b.right <= window.innerWidth + 1 } })])
        }
        const badNav = navs.filter(([, v]) => v.h < 56 || !v.ok).map(([id, v]) => `${id}:h${Math.round(v.h)}${v.ok ? '' : ':뷰포트 밖'}`)
        r.check(`${name} ${label}: 가로 스크롤·잘림 없음/버튼 >=44px/이전·다음 >=56px·닿음/위젯 안 가림/그림이 카드 안`,
          (await noOverflow(page)) && cl.length === 0 && small.length === 0 && badNav.length === 0 && !widgetBad && sceneBad.length === 0 && navs.length >= 1, `${small.join(',')} ${cl.join(',')} ${badNav.join(',')} ${widgetBad} ${sceneBad.join(',')}`)
      }
      await open()
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
      const bs = S('build')
      await advanceTo(page, cardIdx('discover')); await chk('발견(탭 전)')
      await T(page, `scene-obj-${S('discover').tap.obj}-0`).click(); await chk('발견(탭 후: 캡션)'); await shot('discover')
      await advanceTo(page, cardIdx('compare')); await chk('비교(그림 2개)')
      await advanceTo(page, cardIdx('choose', 0)); await chk('고르기 답 전')
      await T(page, 'scene-opt-0').click(); await T(page, 'scene-opt-1').click(); await T(page, 'scene-check').click(); await chk('고르기 확인 후(설명)')
      await advanceTo(page, cardIdx('build')); await chk('만들기 처음(빈 자리·트레이)')
      await buildCorrect(page); await chk('만들기 확인 후(나무·결과)'); await shot('build')
      await advanceTo(page, cardIdx('read')); await chk('읽기(문장 + 그림)')
      await advanceTo(page, cardIdx('listen', 0)); await chk('듣기 답 전(그림 보기)')
      const lit = S('listen').items[0]
      await T(page, `scene-pic-${lit.options.findIndex((_, j) => j !== lit.correct)}`).click(); await T(page, 'scene-check').click(); await chk('듣기 틀림(문장 공개·설명)'); await shot('listen')
      await advanceTo(page, cardIdx('speak', 0, 'practice')); await chk('말하기 연습')
      await T(page, 'scene-said').click(); await nextCard(page); await chk('말하기 시험(공개 전)')
      await T(page, 'scene-reveal').click(); await chk('말하기 시험(공개 후)'); await shot('exam')
      await advanceTo(page, cardIdx('write')); await T(page, 'scene-write-input').fill('There is a bench with a very long made up sentence about my park.'); await T(page, 'scene-write-compare').click(); await chk(`쓰기(비교 펼침, 나무 ${bs.place.n}그루 공원)`)
      await advanceTo(page, cardIdx('finish')); await chk('마무리'); await shot('finish')
    })
  }

  // ---------------- l 저장 없음 ----------------
  await scenario('l 저장 없음', VP, async ({ page, name, toCourses }) => {
    await toCourses()
    const before0 = await snap(page)
    await T(page, 'grammar-course-easy').click(); await T(page, 'grammar-units').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, `grammar-unit-${UNIT_ID}`).click(); await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 10000 })
    await advanceTo(page, DECK.length - 1)
    r.check(`${name} 끝(요약)까지 모두 풀기 완료`, (await T(page, 'gd-summary').isVisible()) && (await txt(page, 'gd-summary-counts')).includes('틀림 0'))
    const mid = storageUnchanged(before0, await snap(page))
    r.check(`${name} 푸는 동안 그림 미션 관련 새 localStorage 키 없음, Unit 기록 불변`, mid.ok, mid.added.join(','))
    await T(page, 'gd-to-list').click()
    await T(page, `grammar-unit-${UNIT_ID}`).click(); await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 단원을 목록에서 다시 열면 처음 카드(idx 0), 푼 답 저장 안 됨`, (await idxOf(page)) === 0)
    await advanceTo(page, cardIdx('choose', 0))
    r.check(`${name} 선택 1에 다시 도착: 답 안 한 상태(저장 안 함)`, (await T(page, 'scene-result').count()) === 0 && (await T(page, 'scene-check').isDisabled()))
    await T(page, 'gu-back').click(); await T(page, 'grammar-units-back').click(); await T(page, 'grammar-courses-home').click()
    r.check(`${name} ← 홈 → 학생 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 10000 })))
    const su = storageUnchanged(before0, await snap(page))
    r.check(`${name} 나간 뒤에도 문법·그림 미션 관련 새 키 없음(앱 자체 키 허용), Unit 기록 불변`, su.ok, su.added.join(','))
  })

  return { results: r.results, unmockedRequests, mockErrors }
}
