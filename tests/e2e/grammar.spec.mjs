// 2026-10-10 문법 과정 화면(QA 전용 홈 📘) 브라우저 시나리오 — 과정 5개 → 단원 목록 → 단원 "한 장에 하나씩" 카드 덱(목표·예문·설명·구조·비교·오류·연습 4종·활용·마무리).
// 개수·id·문항·카드 순서는 전부 src 데이터(GRAMMAR_COURSES/GRAMMAR_UNITS/UNITS + buildDeck)에서 계산한다(하드코딩 금지). 네트워크 전체 mock, 저장·REST 쓰기 0.
import { mkdirSync } from 'node:fs'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { recordsKey } from '../../src/utils/curriculum/unitRecords.js'
import { UNITS } from '../../src/utils/curriculum/units.js'
import { GRAMMAR_COURSES } from '../../src/utils/grammar/grammarCourses.js'
import { GRAMMAR_UNITS, unitsForCourse, courseCounts, resolveChoice, grammarUnitById, reviewStatusOf, FUNCTION_WORDS, SCHOOL_GRAMMAR_NOTE_KO } from '../../src/utils/grammar/grammarUnits.js'
import { buildDeck, deckSteps, isPractice, deckCounts } from '../../src/utils/grammar/grammarDeck.js'
import { buildFrame } from '../../src/utils/grammar/sceneMission.js'

const VP = { width: 390, height: 844 }
const SHOTS_DIR = process.env.GRAMMAR_SHOTS_DIR || 'C:\\Users\\jinal\\AppData\\Local\\Temp\\claude\\C--voca\\4dd777a3-9f93-4c78-a984-4f4ee328e279\\scratchpad\\shots'
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
// 화면 컨테이너가 overflow-x-hidden이라 문서 스크롤만으로는 잘림을 못 잡는다 — 요소가 뷰포트 오른쪽 밖으로 나갔는지도 본다
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
// speak 호출 수와 speechSynthesis.cancel 호출 수를 센다. 주의: speech.js는 재생 중/대기 중일 때만 cancel하는데
// mockRoutes 스텁은 speaking을 켜지 않으므로 cancel 수는 참고용이고, 합격 판정은 speak 로그가 "클릭당 정확히 +1"인지로 한다.
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

// 앱 자체 키(paul_easy_ 동기화 메타, paulEasyVoca_currentStudent)는 허용 — 문법 관련 새 키가 없고 Unit 기록 값이 그대로인지만 본다
const snap = (page) => page.evaluate((rk) => ({ keys: Object.keys(localStorage).sort(), rec: localStorage.getItem(rk) }), recordsKey(QA_STUDENT_ID))
const storageUnchanged = (a, b) => {
  const added = b.keys.filter((k) => !a.keys.includes(k) && !/^(paul_easy_|paulEasyVoca_currentStudent)/.test(k))
  return { ok: added.length === 0 && !b.keys.some((k) => /grammar|gu-|course|selection/i.test(k)) && a.rec === b.rec, added }
}
const correctSet = (c) => (Array.isArray(c) ? c : [c])
const JUDGE = /점수|틀렸|맞았어요|정답이에요|정답!|✅|❌/
const deckOf = (id) => buildDeck(grammarUnitById(id), UNITS)

// ---- 카드 덱 조작 헬퍼(전부 화면 data-* / testid만 사용) ----
const idxOf = async (page) => Number(await T(page, 'gd-root').getAttribute('data-idx'))
const kindOf = (page) => T(page, 'gd-root').getAttribute('data-kind')
async function nextCard(page) {
  const i = await idxOf(page)
  if (!(await T(page, 'gd-next').isEnabled())) throw new Error(`gd-next 비활성(idx ${i})`)
  await T(page, 'gd-next').click()
  if (!(await waitUntil(async () => (await idxOf(page)) === i + 1, { timeout: 5000 }))) throw new Error(`다음 카드로 안 넘어감(idx ${i})`)
}
async function prevCard(page) {
  const i = await idxOf(page)
  await T(page, 'gd-prev').click()
  if (!(await waitUntil(async () => (await idxOf(page)) === i - 1, { timeout: 5000 }))) throw new Error(`이전 카드로 안 넘어감(idx ${i})`)
}
// 순서 배열: seq 순서대로 단어 칩을 누른다(같은 단어가 둘이어도 안 쓴 인덱스를 고름)
async function tapOrder(page, words, seq) {
  const used = new Set()
  for (const w of seq) { const j = words.findIndex((x, k) => x === w && !used.has(k)); used.add(j); await T(page, `gd-order-word-${j}`).click() }
}
const orderPair = (q) => {
  const good = q.answers[0]; const isGood = (s) => q.answers.some((a) => a.join(' ') === s.join(' '))
  let bad = [...good].reverse(); if (isGood(bad)) bad = [...good.slice(1), good[0]]
  return { good, bad: isGood(bad) ? null : bad }
}
const wrongChoiceIdx = (q) => q.options.findIndex((_, j) => !correctSet(q.correct).includes(j))
const wrongBlankIdx = (q) => q.options.findIndex((_, j) => j !== q.correct)
async function answered(page, c) {
  switch (c.kind) {
    case 'choice': return (await T(page, 'gd-choice-0').getAttribute('data-answered')) === 'true'
    case 'blank': case 'order': return (await T(page, 'gd-result').count()) > 0
    case 'build': return (await T(page, 'gd-build-example').count()) > 0
    case 'use': return !c.use ? true : c.use.kind === 'speaking' ? (await T(page, 'gd-use-done-note').count()) > 0 : (await T(page, 'gd-use-example').count()) > 0
    case 'scene': return (await T(page, 'gd-next').count()) === 0 || (await T(page, 'gd-next').isEnabled()) // 장면 카드는 "다음이 열렸는지"가 곧 답한 것(sceneCanAdvance)
    default: return true
  }
}
// 카드 하나를 "맞게" 끝낸다(이미 답했으면 그대로 둠)
// 장면(scene) 카드 하나를 "맞게" 끝내는 최소 동작(add 모드 단원의 discover/compare/choose/build/read/listen). 자세한 검증은 grammarScenes.spec.mjs가 맡는다
async function completeSceneCard(page, c) {
  const st = c.step
  const unit = grammarUnitById(await T(page, 'gd-root').getAttribute('data-unit'))
  switch (c.sceneKind) {
    case 'discover': await T(page, 'gd-card').locator(`[data-testid="scene-obj-${st.tap.obj}-0"]`).first().click(); break
    case 'choose': await T(page, `scene-opt-${st.items[c.itemIndex].correct}`).click(); await T(page, 'scene-check').click(); break
    case 'listen': await T(page, `scene-pic-${st.items[c.itemIndex].correct}`).click(); await T(page, 'scene-check').click(); break
    case 'read': {
      const n = st.pairs.length
      for (let i = 0; i < n; i++) { await T(page, `scene-sent-${i}`).click(); await T(page, `scene-pic-${(i - 1 + n) % n}`).click() } // 그림 j는 (j+1)%n번째 문장의 장면
      await T(page, 'scene-check').click(); break
    }
    case 'build': {
      const { place } = st
      if (place.ref !== undefined) { // 위치 놓기: 첫 관계 자리에 놓고 그 관계를 고른다
        await T(page, `scene-tray-${place.obj}`).click()
        await T(page, 'gd-card').locator(`[data-testid^="scene-spot-"][data-relation="${place.relations[0]}"]`).click()
        await T(page, 'scene-opt-0').click()
      } else { // 개수 놓기: place.n개를 놓고 놓은 수에 맞는 숫자를 고른다
        for (let k = 0; k < place.n; k++) { await T(page, `scene-tray-${place.obj}`).click(); await T(page, 'scene-spot-0').click() }
        await T(page, `scene-opt-${buildFrame(unit.scene, st, place.n).correct}`).click()
      }
      await T(page, 'scene-check').click(); break
    }
    default: break // compare 등은 열려 있음
  }
}
async function completeCard(page, c) {
  if (await answered(page, c)) return
  if (c.kind === 'scene') await completeSceneCard(page, c)
  else if (c.kind === 'choice') await T(page, `gd-choice-0-opt-${correctSet(c.q.correct)[0]}`).click()
  else if (c.kind === 'blank') { await T(page, `gd-blank-opt-${c.q.correct}`).click(); await T(page, 'gd-check').click() }
  else if (c.kind === 'order') { await tapOrder(page, c.q.words, c.q.answers[0]); await T(page, 'gd-check').click() }
  else if (c.kind === 'build') { await T(page, 'gd-build-input').fill('my own sentence'); await T(page, 'gd-build-compare').click() }
  else if (c.kind === 'use' && c.use) {
    if (c.use.kind === 'speaking') await T(page, 'gd-use-done').click()
    else { await T(page, 'gd-use-input').fill('my own sentence'); await T(page, 'gd-use-compare').click() }
  }
}
// 현재 카드부터 targetIdx 카드까지 차례로(필요한 답은 맞게) 넘어간다. hook(card)은 각 카드를 끝내기 전에 불린다
async function advanceTo(page, deck, targetIdx, hook) {
  for (let i = await idxOf(page); i < targetIdx; i = await idxOf(page)) {
    const c = deck[i]
    const shown = await T(page, 'gd-card').getAttribute('data-id')
    if (shown !== c.id) throw new Error(`카드 불일치: 화면 ${shown} / 덱 ${c.id}`)
    if (hook) await hook(c)
    await completeCard(page, c)
    await nextCard(page)
  }
}
const firstIdx = (deck, pred) => deck.findIndex(pred)

export async function run(browser, baseURL) {
  const r = createRecorder('[grammar]')
  const unmockedRequests = []
  const mockErrors = []
  async function scenario(label, vp, body) {
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const { unmockedRequests: u, apiCallLog } = await installMocks(page)
    await installSpeakCounter(page) // mockRoutes의 speechSynthesis 스텁 뒤에 등록해야 센다
    const name = `${label} [${vp.width}x${vp.height}]`
    // 홈 문법 카드 → 과정 목록 (lazy 청크 + pilotUnits 로드 대기)
    const toCourses = async () => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-menu-grammar').click()
      await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 }); await T(page, 'gv-to-courses').click()
      await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 20000 })
    }
    const toUnits = async (courseId) => { await T(page, `grammar-course-${courseId}`).click(); await T(page, 'grammar-units').waitFor({ state: 'visible', timeout: 10000 }) }
    const openUnit = async (unitId) => { await T(page, `grammar-unit-${unitId}`).click(); await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 }); await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 10000 }) }
    const toUnit = async (courseId, unitId) => { await toUnits(courseId); await openUnit(unitId) }
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, toCourses, toUnits, toUnit, openUnit })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
  }

  // 카드 하나의 공통 불변식(한 장만 DOM에 있음, data-*가 덱과 일치, 제목 포커스, 맨 위 스크롤, 답/설명 미노출). 문제 목록을 돌려준다
  async function cardProblems(page, deck, i) {
    const c = deck[i]; const bad = []
    if (!(await waitUntil(async () => (await T(page, 'gd-card').count()) === 1 && (await idxOf(page)) === i, { timeout: 5000 }))) bad.push(`gd-card 수 ${await T(page, 'gd-card').count()}/idx ${await idxOf(page)}`)
    if ((await T(page, 'gd-card').getAttribute('data-kind')) !== c.kind || (await T(page, 'gd-card').getAttribute('data-id')) !== c.id) bad.push('card data-kind/id 불일치')
    if ((await kindOf(page)) !== c.kind || (await T(page, 'gd-root').getAttribute('data-total')) !== String(deck.length)) bad.push('root data-kind/total 불일치')
    if ((await txt(page, 'gd-step')) !== c.stepKo) bad.push(`step ${await txt(page, 'gd-step')}≠${c.stepKo}`)
    if ((await txt(page, 'gd-progress')) !== `${i + 1} / ${deck.length}`) bad.push(`progress ${await txt(page, 'gd-progress')}`)
    if (!(await waitUntil(() => page.evaluate(() => !!document.activeElement?.closest?.('[data-testid="gd-card"]')), { timeout: 3000 }))) bad.push('제목 포커스 아님')
    if ((await page.evaluate(() => window.scrollY)) !== 0) bad.push('scrollY≠0')
    // 아직 아무 답도 하지 않은 새 카드에서만 부른다 — 정답·설명·비교 결과가 미리 보이면 안 된다
    for (const id of ['gd-why', 'gd-result', 'gd-choice-0-why', 'gd-build-example', 'gd-use-example', 'gd-use-done-note']) if ((await T(page, id).count()) > 0) bad.push(`미리 보이면 안 되는 ${id}`)
    return bad
  }

  await scenario('a 과정 5개·배지·개수', VP, async ({ page, name, toCourses }) => {
    await toCourses()
    r.check(`${name} 첫 화면 data-view=courses, 마을에서 열었으니 ← 마을 지도 버튼`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'courses' && (await T(page, 'grammar-courses-home').isVisible()) && ((await T(page, 'grammar-courses-home').textContent()) || '').includes('마을 지도'))
    const ids = await page.locator('button[data-testid^="grammar-course-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('grammar-course-', '')))
    r.check(`${name} 과정 ${GRAMMAR_COURSES.length}개, 순서 = 데이터(easy, intermediate, advanced, middleSchool, highSchool)`, JSON.stringify(ids) === JSON.stringify(GRAMMAR_COURSES.map((c) => c.id)) && JSON.stringify(ids) === JSON.stringify(['easy', 'intermediate', 'advanced', 'middleSchool', 'highSchool']), ids.join(','))
    for (const c of GRAMMAR_COURSES) {
      const t = await txt(page, `grammar-course-${c.id}`); const { ready, total, reviewed } = courseCounts(c.id)
      r.check(`${name} ${c.id}: 제목 ${c.titleEn}·${c.titleKo}, 배지 '${c.kind === 'school' ? '학교 문법 (제안)' : '숙련도'}', ready ${ready}/${total} · 검수 ${reviewed}`,
        t.includes(c.titleEn) && t.includes(c.titleKo) && t.includes(c.kind === 'school' ? '학교 문법 (제안)' : '숙련도') && (c.kind === 'school' || !t.includes('(제안)')) && t.includes(`ready ${ready}/${total} · 검수 ${reviewed}`) && !t.includes('검수 완료') && (await T(page, `grammar-course-${c.id}`).isEnabled()), t)
    }
    const sum = GRAMMAR_COURSES.reduce((s, c) => s + courseCounts(c.id).total, 0)
    r.check(`${name} 과정별 total 합 = 전체 단원 수(${GRAMMAR_UNITS.length}), 단원마다 과정 소속`, sum === GRAMMAR_UNITS.length && GRAMMAR_UNITS.every((u) => GRAMMAR_COURSES.some((c) => c.id === u.courseId)), String(sum))
  })


  const EASY = unitsForCourse('easy')
  const U1 = grammarUnitById('g-easy-01')
  const UI1 = grammarUnitById('g-int-01')
  const DECK1 = deckOf(U1.id)

  await scenario('b Easy 단원 목록·준비 중 비활성·g-easy-01 덱 전 카드 순회', VP, async ({ page, name, toCourses, toUnits, openUnit }) => {
    await toCourses()
    await toUnits('easy')
    r.check(`${name} data-view=units, data-course=easy, 학교 문법 안내 없음`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'units' && (await T(page, 'grammar-units').getAttribute('data-course')) === 'easy' && (await T(page, 'grammar-school-note').count()) === 0)
    r.check(`${name} 이동 표시(crumb)에 Easy·쉬움`, (await txt(page, 'grammar-units-crumb')).includes('Easy') && (await txt(page, 'grammar-units-crumb')).includes('쉬움'))
    const ids = await page.locator('button[data-testid^="grammar-unit-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('grammar-unit-', '')).filter((x) => x !== 'back'))
    r.check(`${name} 단원 ${EASY.length}개, 순서 = order`, JSON.stringify(ids) === JSON.stringify(EASY.map((u) => u.id)), ids.join(','))
    for (const u of EASY) {
      const t = await txt(page, `grammar-unit-${u.id}`); const ready = u.status === 'ready'
      r.check(`${name} ${u.id}: ${u.order}번·제목·학습 목표 표시, ${ready ? '활성(준비 중 표시 없음)' : "비활성+'준비 중'"}`,
        t.includes(`${u.order}.`) && t.includes(u.titleKo) && t.includes(u.goalKo) && (ready ? !t.includes('준비 중') && t.includes(reviewStatusOf(u) === 'reviewed' ? '검수 완료' : '검수 전') && (await T(page, `grammar-unit-${u.id}`).isEnabled()) : t.includes('준비 중') && (await T(page, `grammar-unit-${u.id}`).isDisabled()) && (await T(page, `grammar-unit-${u.id}`).getAttribute('aria-disabled')) === 'true'), t)
    }
    await openUnit(U1.id)
    const N = DECK1.length
    r.check(`${name} data-view=unit, gd-root: data-unit=${U1.id}, data-total=${N}(buildDeck), data-idx=0, 첫 카드 goal, 진행 '1 / ${N}'`,
      (await T(page, 'grammar-courses').getAttribute('data-view')) === 'unit' && (await T(page, 'gd-root').getAttribute('data-unit')) === U1.id && (await T(page, 'gd-root').getAttribute('data-total')) === String(N) &&
      (await idxOf(page)) === 0 && DECK1[0].kind === 'goal' && (await kindOf(page)) === 'goal' && (await txt(page, 'gd-step')) === DECK1[0].stepKo && (await txt(page, 'gd-progress')) === `1 / ${N}`, await txt(page, 'gd-progress'))
    r.check(`${name} ${U1.id} 검수 배지 '${reviewStatusOf(U1) === 'reviewed' ? '검수 완료' : '검수 전'}'(data-review=${reviewStatusOf(U1)})`, (await T(page, 'gu-review-status').getAttribute('data-review')) === reviewStatusOf(U1) && (await txt(page, 'gu-review-status')) === (reviewStatusOf(U1) === 'reviewed' ? '검수 완료' : '검수 전'))
    r.check(`${name} 목표 카드 = 데이터(목표·상황), 기초 링크 없음(Easy)`, (await txt(page, 'gd-goal')).includes(U1.goalKo) && (await T(page, 'gu-basics-link').count()) === 0 && (await T(page, 'gd-prev').isDisabled()))
    r.check(`${name} 단계 목록(deckSteps) = ${deckSteps(DECK1).join('→')}`, deckSteps(DECK1).length >= 5 && deckSteps(DECK1)[0] === '목표' && deckSteps(DECK1).at(-1) === '마무리')

    // 모든 카드를 차례로 — 카드마다 불변식 + 종류별 내용 검증, 연습은 맞게 풀고 다음으로
    const visited = []
    for (let i = 0; i < N; i++) {
      const c = DECK1[i]; visited.push(c.id)
      const bad = await cardProblems(page, DECK1, i)
      if (c.kind === 'examples') {
        const shown = await page.locator('[data-testid^="gd-example-"]').evaluateAll((els) => els.filter((e) => /^gd-example-\d+$/.test(e.getAttribute('data-testid'))).map((e) => e.textContent))
        const lis = await page.locator('[data-testid^="gd-example-"][data-testid$="-listen"]').count()
        if (shown.length !== c.examples.length || lis !== c.examples.length || !c.examples.every((e, k) => (shown[k] || '').includes(e.en))) bad.push(`예문 ${shown.length}/${lis}≠${c.examples.length}`)
        // 듣기: 클릭마다 speak 정확히 +1, 카드를 넘겨도 자동 재생·대기열 없음
        const b0 = (await speakLog(page)).length
        for (let k = 0; k < Math.min(2, c.examples.length); k++) {
          await T(page, `gd-example-${k}-listen`).click()
          if (!(await waitUntil(async () => (await speakLog(page)).length === b0 + k + 1, { timeout: 3000 }))) bad.push(`듣기 ${k} speak +1 아님`)
          await sleep(250)
          const lg = await speakLog(page)
          if (lg.length !== b0 + k + 1 || lg[b0 + k] !== c.examples[k].en) bad.push(`듣기 ${k} 정확히 +1/영어 아님(${lg.length - b0})`)
        }
      }
      if (c.kind === 'explain') {
        const k = Number(c.id.split('-')[1]); const line = (U1.explainKo || [])[k]
        if (c.line !== line || !(await txt(page, 'gd-explain')).includes(line)) bad.push(`설명 줄 ${k} ≠ explainKo`)
        if (c.example) {
          const b0 = (await speakLog(page)).length
          await T(page, 'gd-explain-listen').click()
          if (!(await waitUntil(async () => (await speakLog(page)).length === b0 + 1, { timeout: 3000 }))) bad.push('설명 듣기 speak +1 아님')
          await sleep(250)
          if ((await speakLog(page)).length !== b0 + 1) bad.push('설명 듣기 2회 이상 재생')
        }
      }
      if (c.kind === 'structure' && (await page.locator('[data-testid^="gd-structure-"]').count()) !== c.structure.length) bad.push('구조 행 수')
      if (c.kind === 'compare' && !(await Promise.all(['aff', 'neg', 'q'].map(async (kk) => !c.compare[kk] || (await txt(page, `gd-compare-${kk}`)).includes(c.compare[kk].en)))).every(Boolean)) bad.push('비교 텍스트')
      if (c.kind === 'error' && !((await txt(page, 'gd-error')).includes(c.wrong) && (await txt(page, 'gd-error')).includes(c.right))) bad.push('오류 카드 내용')
      if (c.kind === 'summary') {
        if ((await T(page, 'gd-next').count()) !== 0) bad.push('마지막 카드에 다음 버튼')
        if (!(await T(page, 'gd-prev').isEnabled())) bad.push('마지막 카드 이전 비활성')
      } else {
        if (isPractice(c) || c.kind === 'build' || (c.kind === 'use' && c.use) || (c.kind === 'scene' && c.sceneKind === 'discover')) { // discover는 탭해야 열린다
          if (!(await T(page, 'gd-next').isDisabled()) || (await T(page, 'gd-next-hint').count()) !== 1) bad.push('답 전 다음 버튼 잠금/힌트 아님')
        } else if (!(await T(page, 'gd-next').isEnabled())) bad.push('설명 카드 다음 버튼 비활성')
      }
      r.check(`${name} 카드 ${i + 1}/${N} ${c.id}: 한 장만·data 일치·제목 포커스·scrollY 0·미리 답 없음`, bad.length === 0, bad.join('; '))
      if (c.kind === 'summary') break
      await completeCard(page, c)
      const logLen = (await speakLog(page)).length
      await nextCard(page)
      await sleep(100)
      if ((await speakLog(page)).length !== logLen) r.check(`${name} 카드 이동 시 자동 재생 없음`, false, c.id)
    }
    r.check(`${name} 방문한 카드 ${visited.length}장 = 덱 ${N}장, 순서 일치`, JSON.stringify(visited) === JSON.stringify(DECK1.map((c) => c.id)))
    await T(page, 'gu-back').click()
    r.check(`${name} ← 단원 목록 → 같은 과정(easy) 목록`, (await T(page, 'grammar-units').getAttribute('data-course')) === 'easy' && (await T(page, 'grammar-unit').count()) === 0)
  })

  // 연습 전체 흐름(단원 공통): 모든 카드를 차례로. 선택/빈칸/순서는 틀림→다시 풀기→맞음, 한 카드(첫 빈칸)는 틀린 채로 두고 요약에서 확인
  async function practiceFlow({ page, name: n0, toCourses, toUnit }, U, { choiceCount } = {}) {
    const name = `${n0} ${U.id}`
    const deck = buildDeck(U, UNITS); const N = deck.length; const counts = deckCounts(deck)
    await toCourses()
    const before0 = await snap(page)
    await toUnit(U.courseId, U.id)
    const choice = resolveChoice(U, UNITS), p = U.practice
    const byKind = (k) => deck.filter((c) => c.kind === k).length
    r.check(`${name} 덱 선택 ${choice.length} + 빈칸 ${p.blank.length} + 순서 ${p.order.length} + 만들기 ${p.build.length} = 데이터, 총 ${N}장`,
      (choiceCount === undefined || choice.length === choiceCount) && byKind('choice') === choice.length && byKind('blank') === p.blank.length && byKind('order') === p.order.length && byKind('build') === p.build.length &&
      (await T(page, 'gd-root').getAttribute('data-total')) === String(N) && counts.practice === choice.length + p.blank.length + p.order.length + deck.filter((c) => c.kind === 'scene' && isPractice(c)).length)
    const leave = deck.find((c) => c.kind === 'blank') || deck.find((c) => c.kind === 'order') || deck.find((c) => c.kind === 'choice')
    let rightN = 0
    const wrongIds = []
    for (let i = 0; i < N; i++) {
      const c = deck[i]
      if (c.kind === 'summary') break
      const id = `${name} [${c.id}]`
      const nextDisabled = async () => (await T(page, 'gd-next').isDisabled()) && (await T(page, 'gd-next-hint').count()) === 1
      if (c.kind === 'choice') {
        const q = c.q, w = wrongChoiceIdx(q)
        r.check(`${id} 답 전: 다음 잠김 + 힌트, 설명 없음`, (await nextDisabled()) && (await T(page, 'gd-choice-0-why').count()) === 0)
        const leaveThis = leave.id === c.id
        if (w >= 0) {
          await T(page, `gd-choice-0-opt-${w}`).click()
          r.check(`${id} 틀린 보기: 설명(gd-choice-0-why)·다시 풀기 표시, 고른 보기 pressed`, (await T(page, 'gd-choice-0-why').isVisible()) && (await T(page, 'gd-retry').isVisible()) && (await T(page, `gd-choice-0-opt-${w}`).getAttribute('aria-pressed')) === 'true' && (await T(page, 'gd-result').count()) === 0)
          if (!leaveThis) {
            await T(page, 'gd-retry').click()
            r.check(`${id} 다시 풀기 → 설명·다시 풀기 사라짐, 다음 여전히 잠김`, (await T(page, 'gd-choice-0-why').count()) === 0 && (await T(page, 'gd-retry').count()) === 0 && (await nextDisabled()) && (await T(page, 'gd-choice-0').getAttribute('data-answered')) === 'false')
          }
        }
        if (leaveThis && w >= 0) wrongIds.push(c.id)
        else { await T(page, `gd-choice-0-opt-${correctSet(q.correct)[0]}`).click(); rightN++ }
        r.check(`${id} ${leaveThis && w >= 0 ? '틀린 채로 두기' : '맞는 보기'}: 다음 활성`, await T(page, 'gd-next').isEnabled())
      } else if (c.kind === 'blank') {
        const q = c.q, w = wrongBlankIdx(q)
        r.check(`${id} 답 전: 다음 잠김 + 힌트, 확인 비활성`, (await nextDisabled()) && (await T(page, 'gd-check').isDisabled()))
        await T(page, `gd-blank-opt-${w}`).click()
        await T(page, 'gd-check').click()
        r.check(`${id} 틀림: gd-result data-ok=false + gd-why + 다시 풀기, 보기 잠김`, (await T(page, 'gd-result').getAttribute('data-ok')) === 'false' && (await T(page, 'gd-why').isVisible()) && (await T(page, 'gd-retry').isVisible()) && (await T(page, 'gd-blank-opt-0').isDisabled()))
        await T(page, 'gd-retry').click()
        r.check(`${id} 다시 풀기 → 결과 사라짐, 보기 활성, 다음 잠김`, (await T(page, 'gd-result').count()) === 0 && (await T(page, 'gd-blank-opt-0').isEnabled()) && (await nextDisabled()))
        if (leave.id === c.id) {
          await T(page, `gd-blank-opt-${w}`).click(); await T(page, 'gd-check').click(); wrongIds.push(c.id)
          r.check(`${id} 틀린 채로 두기(확인함): data-ok=false, 다음 활성`, (await T(page, 'gd-result').getAttribute('data-ok')) === 'false' && (await T(page, 'gd-next').isEnabled()))
        } else {
          await T(page, `gd-blank-opt-${q.correct}`).click(); await T(page, 'gd-check').click(); rightN++
          r.check(`${id} 맞음: data-ok=true, 다시 풀기 없음, 다음 활성`, (await T(page, 'gd-result').getAttribute('data-ok')) === 'true' && (await T(page, 'gd-retry').count()) === 0 && (await T(page, 'gd-next').isEnabled()))
        }
      } else if (c.kind === 'order') {
        const q = c.q, { good, bad } = orderPair(q)
        r.check(`${id} 답 전: 다음 잠김, 확인·지우기 비활성, 답 칸 비어 있음`, (await nextDisabled()) && (await T(page, 'gd-check').isDisabled()) && (await T(page, 'gd-order-clear').isDisabled()) && (await txt(page, 'gd-order-answer')) === '')
        if (bad) {
          await tapOrder(page, q.words, bad)
          r.check(`${id} 틀린 순서: 답 칸에 쌓임`, (await txt(page, 'gd-order-answer')) === bad.join(' '))
          await T(page, 'gd-order-clear').click()
          r.check(`${id} 지우기 → 답 칸 비움, 칩 활성`, (await txt(page, 'gd-order-answer')) === '' && (await T(page, 'gd-order-word-0').isEnabled()))
          await tapOrder(page, q.words, bad)
          await T(page, 'gd-check').click()
          r.check(`${id} 틀림: gd-result data-ok=false + gd-why + 다시 풀기, 칩 잠김`, (await T(page, 'gd-result').getAttribute('data-ok')) === 'false' && (await T(page, 'gd-why').isVisible()) && (await T(page, 'gd-retry').isVisible()) && (await T(page, 'gd-order-word-0').isDisabled()))
          await T(page, 'gd-retry').click()
          r.check(`${id} 다시 풀기 → 답 칸 비움·확인 복귀·결과 없음, 다음 잠김`, (await txt(page, 'gd-order-answer')) === '' && (await T(page, 'gd-check').count()) === 1 && (await T(page, 'gd-result').count()) === 0 && (await nextDisabled()))
        }
        if (leave.id === c.id && bad) {
          await tapOrder(page, q.words, bad); await T(page, 'gd-check').click(); wrongIds.push(c.id)
          r.check(`${id} 틀린 채로 두기: data-ok=false, 다음 활성`, (await T(page, 'gd-result').getAttribute('data-ok')) === 'false' && (await T(page, 'gd-next').isEnabled()))
        } else {
          await tapOrder(page, q.words, good); await T(page, 'gd-check').click(); rightN++
          r.check(`${id} 맞음: data-ok=true, 다음 활성`, (await T(page, 'gd-result').getAttribute('data-ok')) === 'true' && (await T(page, 'gd-next').isEnabled()))
        }
      } else if (c.kind === 'build') {
        const q = c.q
        r.check(`${id} 입력 전: 다음 잠김, '예시와 비교' 비활성, 예시 없음`, (await nextDisabled()) && (await T(page, 'gd-build-compare').isDisabled()) && (await T(page, 'gd-build-example').count()) === 0)
        await T(page, 'gd-build-input').fill('my own sentence')
        await T(page, 'gd-build-compare').click()
        const t = await txt(page, 'gd-build-example')
        r.check(`${id} 비교: 내 문장+예시(${q.exampleEn})+'하나의 답'${q.acceptNoteKo ? '+허용 안내' : ''}, 판정 단어 없음, 다음 활성`, t.includes('my own sentence') && t.includes(q.exampleEn) && t.includes('하나의 답') && (!q.acceptNoteKo || t.includes(q.acceptNoteKo)) && !JUDGE.test(t) && (await T(page, 'gd-next').isEnabled()), t.slice(0, 120))
      } else if (c.kind === 'scene') {
        // add 장면 카드(있으면): 한 장만·단계 이름은 위 공통 불변식이 보고, 여기서는 잠금 규칙과 맞게 풀기만 본다
        const lockedFirst = ['discover', 'choose', 'read', 'listen', 'build'].includes(c.sceneKind)
        r.check(`${id} 장면 카드 ${c.sceneKind}: scene-card-${c.sceneKind} 한 장, 다음 ${lockedFirst ? '잠김+힌트' : '열림'}`, (await T(page, `scene-card-${c.sceneKind}`).count()) === 1 && (lockedFirst ? await nextDisabled() : await T(page, 'gd-next').isEnabled()))
        await completeCard(page, c)
        r.check(`${id} 장면 카드 맞게 풀기 → 다음 활성`, await T(page, 'gd-next').isEnabled())
        if (isPractice(c)) rightN++
      } else if (c.kind === 'use') {
        const use = c.use
        if (!use) r.check(`${id} 직접 사용 없음 → 안내 문구, 다음 활성`, (await T(page, 'gd-next').isEnabled()))
        else if (use.kind === 'speaking') {
          r.check(`${id} speaking: 안내문·예시 표시, 다음 잠김, 완료 문구 아직 없음`, (await txt(page, 'gd-use')).includes(use.promptKo) && (await txt(page, 'gd-use')).includes(use.exampleEn) && (await nextDisabled()) && (await T(page, 'gd-use-done-note').count()) === 0)
          const b0 = (await speakLog(page)).length
          await T(page, 'gd-use-listen').click()
          r.check(`${id} 🔊 → 예시 speak 1회`, !!(await waitUntil(async () => (await speakLog(page)).length === b0 + 1, { timeout: 3000 })) && (await speakLog(page))[b0] === use.exampleEn)
          await T(page, 'gd-use-done').click()
          r.check(`${id} '말해 봤어요' → 완료 안내(판정 없음), 다음 활성`, (await txt(page, 'gd-use-done-note')).includes('괜찮아요') && !/정답|점수|틀렸/.test(await txt(page, 'gd-use')) && (await T(page, 'gd-next').isEnabled()))
        } else {
          r.check(`${id} writing: 다음 잠김, 비교 비활성`, (await nextDisabled()) && (await T(page, 'gd-use-compare').isDisabled()))
          await T(page, 'gd-use-input').fill('my own sentence')
          await T(page, 'gd-use-compare').click()
          const t = await txt(page, 'gd-use-example')
          r.check(`${id} writing: 내 문장+예시 비교, 판정 단어 없음, 다음 활성`, t.includes('my own sentence') && t.includes(use.exampleEn) && !JUDGE.test(t) && (await T(page, 'gd-next').isEnabled()), t.slice(0, 120))
        }
      }
      await nextCard(page)
    }
    // 요약
    r.check(`${name} 마지막 카드 = 요약(gd-summary), 다음 버튼 없음`, (await kindOf(page)) === 'summary' && (await T(page, 'gd-summary').isVisible()) && (await T(page, 'gd-next').count()) === 0)
    const sum0 = await txt(page, 'gd-summary-counts')
    r.check(`${name} 요약 참여 기록: 설명 카드 ${counts.explain} · 문제 ${counts.practice} · 맞힘 ${rightN} · 틀림 ${wrongIds.length}`, sum0.includes(`설명 카드 ${counts.explain}`) && sum0.includes(`문제 ${counts.practice}`) && sum0.includes(`맞힘 ${rightN}`) && sum0.includes(`틀림 ${wrongIds.length}`) && rightN + wrongIds.length === counts.practice, sum0)
    const wrongShown = await page.locator('[data-testid^="gd-summary-wrong-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('gd-summary-wrong-', '')))
    r.check(`${name} 틀린 문제 목록 = 내가 틀린 채로 둔 ${wrongIds.length}개(${wrongIds.join(',')})`, JSON.stringify(wrongShown) === JSON.stringify(wrongIds), wrongShown.join(','))
    // 틀린 문제 다시 풀기 → 그 카드로 점프(답 지워짐) → 맞게 풀고 요약까지 → 틀린 목록 비어 있음
    await T(page, 'gd-retry-wrong').click()
    const target = wrongIds[0]
    r.check(`${name} 틀린 문제 다시 풀기 → ${target} 카드로 이동, 답 지워짐`, !!(await waitUntil(async () => (await T(page, 'gd-card').getAttribute('data-id')) === target, { timeout: 5000 })) && !(await answered(page, deck.find((c) => c.id === target))))
    await completeCard(page, deck.find((c) => c.id === target))
    while ((await kindOf(page)) !== 'summary') { const c = deck[await idxOf(page)]; await completeCard(page, c); await nextCard(page) }
    const sum1 = await txt(page, 'gd-summary-counts')
    r.check(`${name} 다시 푼 뒤 요약: 틀림 0 · 맞힘 ${counts.practice}, 틀린 문제 목록·다시 풀기 버튼 없음`, sum1.includes('틀림 0') && sum1.includes(`맞힘 ${counts.practice}`) && (await page.locator('[data-testid^="gd-summary-wrong-"]').count()) === 0 && (await T(page, 'gd-retry-wrong').count()) === 0, sum1)
    await T(page, 'gd-to-list').click()
    r.check(`${name} 단원 목록으로 → grammar-units, 덱 없음`, !!(await waitUntil(() => T(page, 'grammar-units').isVisible(), { timeout: 5000 })) && (await T(page, 'gd-root').count()) === 0)
    const su = storageUnchanged(before0, await snap(page))
    r.check(`${name} 전체 흐름 뒤 문법 관련 새 키 없음, Unit 기록 불변(앱 자체 키 허용)`, su.ok, su.added.join(','))
  }

  await scenario('c g-easy-01 연습 전체·직접 사용·요약·틀린 문제 다시 풀기', VP, (ctx) => practiceFlow(ctx, U1, { choiceCount: 6 }))

  await scenario('d g-int-01 비교 카드·답 유지(뒤로 가도)·입력 유지', VP, async ({ page, name, toCourses, toUnits, openUnit }) => {
    await toCourses()
    await toUnits('intermediate')
    const list = unitsForCourse('intermediate')
    r.check(`${name} Intermediate 목록: ready만 활성, 나머지 비활성+'준비 중'`, (await Promise.all(list.map(async (u) => (u.status === 'ready' ? await T(page, `grammar-unit-${u.id}`).isEnabled() : (await T(page, `grammar-unit-${u.id}`).isDisabled()) && (await txt(page, `grammar-unit-${u.id}`)).includes('준비 중'))))).every(Boolean))
    await openUnit(UI1.id)
    const deck = deckOf(UI1.id)
    const ci = firstIdx(deck, (c) => c.kind === 'compare')
    r.check(`${name} ${UI1.id} 비교 카드가 덱에 있음(데이터)`, ci > 0 && !!UI1.compare)
    if (ci > 0) {
      await advanceTo(page, deck, ci)
      r.check(`${name} 비교 카드: 긍정·부정·의문 = 데이터`, (await kindOf(page)) === 'compare' && (await Promise.all(['aff', 'neg', 'q'].map(async (k) => (await txt(page, `gd-compare-${k}`)).includes(UI1.compare[k].en)))).every(Boolean))
    }
    const rq = deck.findIndex((c) => c.kind === 'order' && c.q.answers[0][0] === 'What')
    r.check(`${name} 되묻기(What about …?) 순서 문항이 덱에 있음`, rq >= 0)
    const bq = deck.findIndex((c) => c.kind === 'blank' && c.q.options[c.q.correct] === "isn't")
    let isntChecked = false
    // choice-0: 맞게 답 → 다음 두 번 → 이전 두 번 → 답 유지
    const c0 = firstIdx(deck, (c) => c.kind === 'choice')
    await advanceTo(page, deck, c0)
    const q0 = deck[c0].q, good0 = correctSet(q0.correct)[0]
    await T(page, `gd-choice-0-opt-${good0}`).click()
    await nextCard(page)
    await completeCard(page, deck[c0 + 1])
    await nextCard(page)
    await prevCard(page); await prevCard(page)
    r.check(`${name} 뒤로 와도 선택 0: 고른 보기 pressed, 설명 보임, 다음 활성`, (await idxOf(page)) === c0 && (await T(page, `gd-choice-0-opt-${good0}`).getAttribute('aria-pressed')) === 'true' && (await T(page, 'gd-choice-0-why').isVisible()) && (await T(page, 'gd-next').isEnabled()))
    // 빈칸 isn't: 틀림 → 이유에 isn't, 그 뒤 만들기 카드 직전까지 진행
    const bi = firstIdx(deck, (c) => c.kind === 'build')
    r.check(`${name} 만들기 카드가 덱에 있음`, bi > 0)
    await advanceTo(page, deck, bi, async (c) => {
      if (bq >= 0 && c.id === deck[bq].id) {
        await T(page, `gd-blank-opt-${wrongBlankIdx(c.q)}`).click(); await T(page, 'gd-check').click()
        isntChecked = (await txt(page, 'gd-why')).includes("isn't") && (await T(page, 'gd-retry').isVisible())
        await T(page, 'gd-retry').click()
      }
    })
    r.check(`${name} No, it ___ 빈칸 틀림 → 이유에 isn't + 다시 풀기`, bq < 0 || isntChecked)
    // 만들기: 입력 → 이전 → 다음 → 입력 유지, 비교 → 이전 → 다음 → 예시 유지
    await T(page, 'gd-build-input').fill('Typed before leaving')
    await prevCard(page); await nextCard(page)
    r.check(`${name} 만들기 입력 후 이전→다음: 입력한 글 유지`, (await T(page, 'gd-build-input').inputValue()) === 'Typed before leaving')
    await T(page, 'gd-build-compare').click()
    await prevCard(page); await nextCard(page)
    r.check(`${name} 비교한 뒤 이전→다음: 입력·예시 비교 유지, 다음 활성`, (await T(page, 'gd-build-input').inputValue()) === 'Typed before leaving' && (await T(page, 'gd-build-example').isVisible()) && (await T(page, 'gd-next').isEnabled()))
    r.check(`${name} 직접 사용(말하기) 카드 있음`, UI1.use.kind === 'speaking' && deck.some((c) => c.kind === 'use' && c.use?.kind === 'speaking'))
  })

  await scenario('e 학교 문법(중등·고등) 목록: 안내·ready만 활성·나머지 준비 중 비활성', VP, async ({ page, name, toCourses, toUnits }) => {
    await toCourses()
    for (const c of GRAMMAR_COURSES.filter((x) => x.kind === 'school')) {
      const list = unitsForCourse(c.id)
      const card = await txt(page, `grammar-course-${c.id}`)
      r.check(`${name} ${c.id} 카드: '학교 문법 (제안)' 배지·'숙련도' 아님`, card.includes('학교 문법 (제안)') && !card.includes('숙련도'), card)
      await toUnits(c.id)
      r.check(`${name} ${c.id}: 안내 '${SCHOOL_GRAMMAR_NOTE_KO}'`, (await txt(page, 'grammar-school-note')).includes('학년·교육과정 대응 미확인') && (await txt(page, 'grammar-school-note')) === SCHOOL_GRAMMAR_NOTE_KO)
      r.check(`${name} ${c.id}: 단원 ${list.length}개, ready는 활성·그 외는 비활성+'준비 중'+제목`, (await Promise.all(list.map(async (u) => u.status === 'ready' ? await T(page, `grammar-unit-${u.id}`).isEnabled() : (await T(page, `grammar-unit-${u.id}`).isDisabled()) && (await txt(page, `grammar-unit-${u.id}`)).includes('준비 중') && (await txt(page, `grammar-unit-${u.id}`)).includes(u.titleKo)))).every(Boolean))
      const prep = list.find((u) => u.status !== 'ready')
      if (prep) await T(page, `grammar-unit-${prep.id}`).click({ force: true, timeout: 2000 }).catch(() => {})
      r.check(`${name} ${c.id}: 비활성 단원을 눌러도 열리지 않음(목록 유지, 빈 화면 없음)`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'units' && (await T(page, 'grammar-unit').count()) === 0 && (await T(page, 'grammar-units').isVisible()))
      await T(page, 'grammar-units-back').click()
      await T(page, `grammar-course-${c.id}`).waitFor({ state: 'visible', timeout: 5000 })
    }
    await toUnits('advanced')
    r.check(`${name} 숙련도 과정(advanced)엔 학교 문법 안내 없음`, (await T(page, 'grammar-school-note').count()) === 0)
  })


  await scenario('f 저장 없음·← 경로 복귀', VP, async ({ page, name, toCourses, toUnits, toUnit, openUnit }) => {
    await toCourses()
    const before0 = await snap(page)
    await toUnit('easy', U1.id)
    const c0 = firstIdx(DECK1, (c) => c.kind === 'choice')
    await advanceTo(page, DECK1, c0)
    await T(page, 'gd-choice-0-opt-0').click()
    r.check(`${name} 선택 0 답함(화면 상태)`, (await T(page, 'gd-choice-0').getAttribute('data-answered')) === 'true')
    await T(page, 'gu-back').click()
    r.check(`${name} 단원 ← 단원 목록(easy)`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'units' && (await T(page, 'grammar-units').getAttribute('data-course')) === 'easy')
    await openUnit(U1.id)
    r.check(`${name} 단원을 목록에서 다시 열면 처음 카드(idx 0), 풀이는 저장 안 함`, (await idxOf(page)) === 0 && (await kindOf(page)) === 'goal')
    await advanceTo(page, DECK1, c0)
    r.check(`${name} 선택 0 카드 다시 도착: 답 안 한 상태(저장 안 함)`, (await T(page, 'gd-choice-0').getAttribute('data-answered')) === 'false')
    await T(page, 'gu-back').click()
    await T(page, 'grammar-units-back').click()
    r.check(`${name} 목록 ← 과정 → 과정 선택`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'courses' && (await T(page, 'grammar-course-easy').isVisible()))
    await T(page, 'grammar-courses-home').click(); await T(page, 'gv-home').click()
    r.check(`${name} ← 홈 → 학생 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 10000 })) && (await T(page, 'grammar-courses').count()) === 0)
    // 다시 들어오면 항상 과정 선택부터, 중간(단원 목록)에서 ← 홈도 바로 홈
    await T(page, 'student-home-menu-grammar').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 }); await T(page, 'gv-to-courses').click()
    await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 재진입 시 과정 선택부터(선택 저장 없음)`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'courses')
    await toUnits('intermediate')
    await T(page, 'grammar-courses-home').click(); await T(page, 'gv-home').click()
    r.check(`${name} 단원 목록에서 ← 홈 → 학생 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 10000 })))
    const su = storageUnchanged(before0, await snap(page))
    r.check(`${name} 문법 관련 새 키 없음, Unit 기록 불변(앱 자체 키 허용)`, su.ok, su.added.join(','))
  })

  // 어휘 규칙(validateGrammarUnit의 allowedTokens와 같은 규칙. 그 헬퍼는 export가 없어 여기서 같은 규칙으로 재계산): 함수어 ∪ 단원 words ∪ 선수 단원 words ∪ g-easy-01/02 words ∪ {paul, mia}
  const tokenize = (t) => String(t ?? '').toLowerCase().split(/\s+/).map((w) => w.replace(/^[^a-z']+|[^a-z']+$/g, '')).filter((w) => /[a-z]/.test(w))
  const wordsOf = (u) => (u?.words || []).flatMap((w) => tokenize(w.en))
  const allowedFor = (u) => {
    const ok = new Set([...FUNCTION_WORDS, 'paul', 'mia', ...wordsOf(u), ...wordsOf(grammarUnitById('g-easy-01')), ...wordsOf(grammarUnitById('g-easy-02'))])
    const seen = new Set(); const walk = (id) => { if (seen.has(id)) return; seen.add(id); const p = grammarUnitById(id); if (!p) return; wordsOf(p).forEach((w) => ok.add(w)); (p.prereqIds || []).forEach(walk) }
    ;(u.prereqIds || []).forEach(walk)
    return ok
  }

  const readyOf = (courseId) => unitsForCourse(courseId).filter((u) => u.status === 'ready')


  for (const c of GRAMMAR_COURSES.filter((x) => readyOf(x.id).length > 0)) {
    const COURSE_UNITS = unitsForCourse(c.id)
    await scenario(`h ${c.id} ready 단원 전부 덱으로 열림·단계 순서·검수 배지·어휘`, VP, async ({ page, name, toCourses, toUnits, openUnit }) => {
      await toCourses()
      await toUnits(c.id)
      const readyUnits = readyOf(c.id)
      r.check(`${name} ${c.id} ready 단원 ${readyUnits.length}개(데이터), 과정 카운트와 일치`, readyUnits.length === courseCounts(c.id).ready && readyUnits.length >= 1, String(readyUnits.length))
      for (const u of readyUnits) {
        const n = `${name} ${u.id}`
        await openUnit(u.id)
        const deck = deckOf(u.id)
        r.check(`${n} 덱 ${deck.length}장: gd-root total·idx 0·첫 카드 goal·진행 '1 / ${deck.length}'`, (await T(page, 'gd-root').getAttribute('data-unit')) === u.id && (await T(page, 'gd-root').getAttribute('data-total')) === String(deck.length) && (await idxOf(page)) === 0 && deck[0].kind === 'goal' && (await kindOf(page)) === 'goal' && (await txt(page, 'gd-progress')) === `1 / ${deck.length}` && (await T(page, 'gu-preparing').count()) === 0)
        const want = reviewStatusOf(u) === 'reviewed' ? '검수 완료' : '검수 전'
        r.check(`${n} 검수 배지 '${want}'(data-review=${reviewStatusOf(u)})${want === '검수 전' ? ', 화면 어디에도 검수 완료 없음' : ''}`,
          (await T(page, 'gu-review-status').getAttribute('data-review')) === reviewStatusOf(u) && (await txt(page, 'gu-review-status')) === want && (want === '검수 완료' || !(await page.locator('body').innerText()).includes('검수 완료')))
        // 시범 그림 미션 단원(scene.mode 'full')은 덱이 장면 카드뿐이라 설명 카드 순회·어휘 규칙이 맞지 않는다 — 단계 순회는 grammarScene.spec.mjs가 맡는다. mode 'add' 단원은 표준 덱이라 아래에서 장면 카드를 풀며 지나간다(자세한 검증: grammarScenes.spec.mjs)
        if (u.scene?.mode === 'full') { await T(page, 'gu-back').click(); await T(page, 'grammar-units').waitFor({ state: 'visible', timeout: 10000 }); continue }
        // 설명 카드들을 첫 연습 카드까지 차례로 — 단계 이름 순서, 어휘 규칙
        const fp = firstIdx(deck, isPractice)
        const ok = allowedFor(u)
        const seen = []; const steps = []
        for (let i = 0; i <= fp; i++) {
          const card = deck[i]
          const st = await txt(page, 'gd-step'); if (steps[steps.length - 1] !== st) steps.push(st)
          if (card.kind === 'examples') for (let k = 0; k < card.examples.length; k++) seen.push(await T(page, `gd-example-${k}`).locator('p').first().textContent())
          if (card.kind === 'explain' && card.example) seen.push(await T(page, 'gd-explain').locator('p').first().textContent())
          if (card.kind === 'choice' && i === fp) for (const j of correctSet(card.q.correct)) if (typeof card.q.options[j] === 'string') seen.push(await txt(page, `gd-choice-0-opt-${j}`)) // 오답 보기는 배운 단어의 틀린 형태라 검증기처럼 제외
          if (i < fp) { if (card.kind === 'scene') await completeCard(page, card); await nextCard(page) }
        }
        const wantSteps = deckSteps(deck.slice(0, fp + 1))
        r.check(`${n} 설명 구간 gd-step 순서 = deckSteps(${wantSteps.join('→')})`, JSON.stringify(steps) === JSON.stringify(wantSteps), steps.join('→'))
        r.check(`${n} 첫 연습 카드(${deck[fp].id})에서 멈춤: 다음 잠김`, (await T(page, 'gd-card').getAttribute('data-id')) === deck[fp].id && (await T(page, 'gd-next').isDisabled()))
        const unknown = [...new Set(seen.flatMap(tokenize).filter((w) => !ok.has(w)))]
        r.check(`${n} 어휘 규칙: 예문·설명 카드 영어·첫 선택 정답 보기가 배운 단어만 사용(${seen.length}개 문장)`, seen.length > 0 && unknown.length === 0, unknown.join(', '))
        await T(page, 'gu-back').click()
        await T(page, 'grammar-units').waitFor({ state: 'visible', timeout: 10000 })
      }
      r.check(`${name} ${c.id} ready가 아닌 단원은 '준비 중'+비활성, 검수 문구 없음`, (await Promise.all(COURSE_UNITS.filter((u) => u.status !== 'ready').map(async (u) => { const t = await txt(page, `grammar-unit-${u.id}`); return t.includes('준비 중') && !t.includes('검수') && (await T(page, `grammar-unit-${u.id}`).isDisabled()) }))).every(Boolean))
    })
  }

  // i: 과정마다 첫 ready 단원 연습 전체 (Easy의 g-easy-01은 시나리오 c가 이미 함)
  for (const c of GRAMMAR_COURSES) {
    const first = readyOf(c.id)[0]
    if (!first || first.id === U1.id) continue
    await scenario(`i ${c.id} 첫 ready 단원(${first.id}) 연습 전체`, VP, (ctx) => practiceFlow(ctx, first))
  }

  // k: 기초 설명 링크는 목표 카드(idx 0)에만 있다. 다녀와도 같은 단원·같은 카드, 그리고 풀어 둔 답이 남는다
  await scenario('k 기초 설명 링크(basicsUnitId) 왕복', VP, async ({ page, name, toCourses, toUnit }) => {
    const withBasics = GRAMMAR_UNITS.filter((u) => u.status === 'ready' && u.basicsUnitId)
    if (withBasics.length === 0) { r.skip(`${name} 기초 설명 링크`, 'basicsUnitId가 있는 ready 단원이 아직 없음(학교 문법 과정 단원이 ready가 되면 자동 실행)'); return }
    await toCourses()
    const trip = async (u, b, n) => {
      r.check(`${n} 목표 카드에 기초 링크 표시 + 기초 단원 제목 '${b.titleKo}'`, (await kindOf(page)) === 'goal' && (await T(page, 'gu-basics-link').isVisible()) && (await txt(page, 'gu-basics-link')).includes(b.titleKo), await txt(page, 'gu-basics-link').catch(() => ''))
      await T(page, 'gu-basics-link').click()
      await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 })
      r.check(`${n} 링크 → data-unit=${b.id}, 돌아가기 버튼(단원 목록 버튼 없음)`, (await T(page, 'grammar-unit').getAttribute('data-unit')) === b.id && (await T(page, 'gu-basics-back').isVisible()) && (await T(page, 'gu-back').count()) === 0)
      if (b.status === 'ready') {
        const bd = deckOf(b.id)
        r.check(`${n} 기초 단원(ready) 덱: data-unit=${b.id}, idx 0, total ${bd.length}, 목표 카드`, (await T(page, 'gd-root').getAttribute('data-unit')) === b.id && (await idxOf(page)) === 0 && (await T(page, 'gd-root').getAttribute('data-total')) === String(bd.length) && (await kindOf(page)) === 'goal' && (await T(page, 'gu-preparing').count()) === 0)
      } else {
        r.check(`${n} 기초 단원(준비 중) 안전 표시: data-status=preparing + gu-preparing`, (await T(page, 'grammar-unit').getAttribute('data-status')) === 'preparing' && (await T(page, 'gu-preparing').isVisible()))
      }
      await T(page, 'gu-basics-back').click()
      await T(page, 'gd-root').waitFor({ state: 'visible', timeout: 10000 })
      r.check(`${n} 돌아가기 → 원래 단원(${u.id}) 같은 카드(idx 0), 단원 목록 버튼 복귀`, (await T(page, 'gd-root').getAttribute('data-unit')) === u.id && (await idxOf(page)) === 0 && (await T(page, 'gu-back').isVisible()) && (await T(page, 'gu-basics-back').count()) === 0)
    }
    for (const u of withBasics) {
      const b = grammarUnitById(u.basicsUnitId); const n = `${name} ${u.id}→${b.id}`
      const deck = deckOf(u.id)
      await toUnit(u.courseId, u.id)
      await trip(u, b, n)
      // 첫 연습 카드를 풀고 목표 카드로 되돌아가 한 번 더 다녀온다 — 풀어 둔 답이 남아 있어야 한다
      const fp = firstIdx(deck, isPractice)
      await advanceTo(page, deck, fp)
      await completeCard(page, deck[fp])
      const wasChoice = deck[fp].kind === 'choice'
      const pick = wasChoice ? correctSet(deck[fp].q.correct)[0] : null
      while ((await idxOf(page)) > 0) await prevCard(page)
      await trip(u, b, `${n} (2회차)`)
      await advanceTo(page, deck, fp)
      r.check(`${n} 기초 설명을 다녀온 뒤에도 ${deck[fp].id} 답이 남아 있음`, (await answered(page, deck[fp])) && (!wasChoice || ((await T(page, `gd-choice-0-opt-${pick}`).getAttribute('aria-pressed')) === 'true' && (await T(page, 'gd-choice-0-why').isVisible()))) && (await T(page, 'gd-next').isEnabled()))
      while ((await idxOf(page)) > 0) await prevCard(page)
      await T(page, 'gu-back').click()
      await T(page, 'grammar-units-back').click()
      await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 5000 })
    }
  })
  // l: 문법 로드 실패 — App.jsx에서 문법 📘은 pilotUnits(units-*.js 청크)를 loadPilotUnits로 불러오고 실패하면 grammar-load-failed. unit.spec g와 같은 기법
  await scenario('l 문법 로드 실패 → 안내·홈 복귀·새로고침 복구', VP, async ({ page, name }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    await page.route('**/assets/units-*.js', (route) => route.abort())
    // 1차 실패: stale-chunk 자동 복구(새로고침)가 먼저 동작 — 세션 복원으로 홈이 다시 뜬다
    const reloaded = page.waitForEvent('framenavigated', { timeout: 20000 }).then(() => true).catch(() => false)
    await T(page, 'student-home-menu-grammar').click()
    const didReload = await reloaded
    const safeEval = (fn) => page.evaluate(fn).catch(() => null)
    r.check(`${name} 1차 실패 → stale-chunk 가드 기록 + 자동 새로고침(홈 복원)`, didReload && !!(await waitUntil(async () => (await safeEval(() => performance.getEntriesByType('navigation')[0]?.type)) === 'reload' && !!(await safeEval(() => sessionStorage.getItem('paulEasyVoca_staleChunkReloadAt'))) && (await T(page, 'student-home').isVisible().catch(() => false)), { timeout: 20000 })))
    // 2차 실패(가드 활성 → 새로고침 안 함): 안내 화면
    await T(page, 'student-home-menu-grammar').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 }); await T(page, 'gv-to-courses').click()
    r.check(`${name} 2차 실패 → 빈 화면 대신 안내(grammar-load-failed) + 새로고침·홈 버튼`, !!(await waitUntil(() => T(page, 'grammar-load-failed').isVisible(), { timeout: 15000 })) && (await txt(page, 'grammar-load-failed')).includes('불러오지 못했어요') && (await txt(page, 'grammar-load-failed')).includes('새로고침') && (await T(page, 'grammar-load-reload').isVisible()) && (await T(page, 'grammar-load-home').isVisible()))
    await T(page, 'grammar-load-home').click()
    await T(page, 'gv-home').click() // 마을 경유로 들어왔으니 마을로 돌아온 뒤 홈
    r.check(`${name} ← 홈으로 → 마을 → 학생 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 10000 })))
    await T(page, 'student-home-menu-grammar').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 }); await T(page, 'gv-to-courses').click()
    r.check(`${name} 같은 페이지에서 다시 열면 여전히 안내(브라우저 모듈 캐시) — 빈 화면 아님`, !!(await waitUntil(() => T(page, 'grammar-load-failed').isVisible(), { timeout: 15000 })))
    await page.unroute('**/assets/units-*.js')
    const reloaded2 = page.waitForEvent('framenavigated', { timeout: 20000 }).then(() => true).catch(() => false)
    await T(page, 'grammar-load-reload').click()
    r.check(`${name} 🔄 새로고침 → 홈 복원`, (await reloaded2) && !!(await waitUntil(() => T(page, 'student-home').isVisible().catch(() => false), { timeout: 20000 })))
    await T(page, 'student-home-menu-grammar').click()
    await T(page, 'grammar-village').waitFor({ state: 'visible', timeout: 20000 }); await T(page, 'gv-to-courses').click()
    r.check(`${name} 새로고침 뒤 다시 열면 과정 목록 로드`, !!(await waitUntil(() => T(page, 'grammar-courses').isVisible().catch(() => false), { timeout: 15000 })))
  })

  await scenario('m 준비 중 단원 안전 표시(과정별)', VP, async ({ page, name, toCourses, toUnits }) => {
    await toCourses()
    let tested = 0
    for (const c of GRAMMAR_COURSES) {
      const prep = unitsForCourse(c.id).find((u) => u.status !== 'ready')
      if (!prep) continue
      tested++
      const { ready, total, reviewed } = courseCounts(c.id)
      r.check(`${name} ${c.id} 카드 'ready ${ready}/${total} · 검수 ${reviewed}', ready < total`, ready < total && (await txt(page, `grammar-course-${c.id}`)).includes(`ready ${ready}/${total} · 검수 ${reviewed}`))
      await toUnits(c.id)
      const t = await txt(page, `grammar-unit-${prep.id}`)
      r.check(`${name} ${c.id} ${prep.id}: 비활성+'준비 중'+제목, 검수 배지 없음`, (await T(page, `grammar-unit-${prep.id}`).isDisabled()) && t.includes('준비 중') && t.includes(prep.titleKo) && !t.includes('검수'), t)
      await T(page, 'grammar-units-back').click()
      await T(page, `grammar-course-${c.id}`).waitFor({ state: 'visible', timeout: 5000 })
    }
    if (tested === 0) r.skip(`${name} 준비 중 단원`, '모든 과정의 모든 단원이 ready — 준비 중 단원 없음')
  })


  try { mkdirSync(SHOTS_DIR, { recursive: true }) } catch { /* 스크린샷 폴더를 못 만들면 스크린샷만 건너뜀 */ }
  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 1280, height: 800 }]) {
    await scenario('g 레이아웃', vp, async ({ page, name, toCourses, toUnits, openUnit }) => {
      const shot = async (kind) => {
        if (!((vp.width === 360) || (vp.width === 1280 && kind === 'goal'))) return
        await page.screenshot({ path: `${SHOTS_DIR}\\grammar-${kind}-${vp.width}.png` }).catch(() => {})
      }
      const check = async (label) => {
        const small = await smallButtons(page, 'grammar-courses'); const cl = await clipped(page, 'grammar-courses')
        r.check(`${name} ${label} 가로 스크롤·잘림 없음/버튼 >=44px`, (await noOverflow(page)) && cl.length === 0 && small.length === 0, `${small.join(',')} ${cl.join(',')}`)
      }
      // 덱 카드 하나: 가로 스크롤·잘림 없음, 작은 버튼 없음, 이전/다음 높이 >=56, 둘 다 가로 스크롤 없이 닿을 수 있음
      const checkCard = async (label) => {
        const small = await smallButtons(page, 'gd-root'); const cl = await clipped(page, 'gd-root')
        // 플로팅 속도 위젯(top = innerHeight-76)에서 8px 이상 위: 스크롤 없이 다음 버튼 바닥이 위젯 위에 있어야 함(폰 폭만)
        let widgetBad = ''
        if (vp.width <= 390 && (await T(page, 'gd-next').count()) > 0) {
          const nb = await T(page, 'gd-next').evaluate((el) => ({ bottom: el.getBoundingClientRect().bottom, right: el.getBoundingClientRect().right, ih: window.innerHeight, iw: window.innerWidth }))
          if (nb.bottom > nb.ih - 84 || nb.right > nb.iw) widgetBad = `gd-next 위젯과 겹침 bottom ${Math.round(nb.bottom)} > ${nb.ih - 84}`
        }
        const navs = []
        for (const id of ['gd-prev', 'gd-next']) {
          if ((await T(page, id).count()) === 0) continue
          await T(page, id).scrollIntoViewIfNeeded()
          navs.push([id, await T(page, id).evaluate((el) => { const b = el.getBoundingClientRect(); return { h: b.height, ok: b.bottom <= window.innerHeight + 1 && b.top >= -1 && b.left >= -1 && b.right <= window.innerWidth + 1 } })])
        }
        const badNav = navs.filter(([, v]) => v.h < 56 || !v.ok).map(([id, v]) => `${id}:h${Math.round(v.h)}${v.ok ? '' : ':뷰포트 밖'}`)
        r.check(`${name} ${label} 가로 스크롤·잘림 없음/버튼 >=44px/이전·다음 >=56px·닿을 수 있음`, (await noOverflow(page)) && cl.length === 0 && small.length === 0 && badNav.length === 0 && !widgetBad && navs.length >= 1, `${small.join(',')} ${cl.join(',')} ${badNav.join(',')} ${widgetBad}`)
      }
      if (vp.width === 360) { await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 }); await shot('home') }
      await toCourses(); await check('과정 목록')
      await toUnits('easy'); await check('Easy 단원 목록')
      await openUnit(U1.id)
      const deck = DECK1
      await checkCard(`${U1.id} 목표 카드`); await shot('goal')
      const ex = firstIdx(deck, (c) => c.kind === 'explain')
      await advanceTo(page, deck, ex); await checkCard(`${U1.id} 설명 카드`); await shot('explain')
      const ch = firstIdx(deck, (c) => c.kind === 'choice')
      await advanceTo(page, deck, ch); await checkCard(`${U1.id} 선택 카드(답 전)`)
      await T(page, `gd-choice-0-opt-${wrongChoiceIdx(deck[ch].q) >= 0 ? wrongChoiceIdx(deck[ch].q) : correctSet(deck[ch].q.correct)[0]}`).click()
      await checkCard(`${U1.id} 선택 카드(틀린 답 확인 후: 설명·다시 풀기)`); await shot('choice-checked')
      await T(page, 'gd-retry').click().catch(() => {})
      const od = firstIdx(deck, (c) => c.kind === 'order')
      await advanceTo(page, deck, od); await checkCard(`${U1.id} 순서 카드`)
      const bd = firstIdx(deck, (c) => c.kind === 'build')
      await advanceTo(page, deck, bd)
      await T(page, 'gd-build-input').fill('Can I borrow a very long sentence about my favourite pencil case please?')
      await T(page, 'gd-build-compare').click()
      await checkCard(`${U1.id} 만들기 비교 펼침`)
      await advanceTo(page, deck, deck.length - 1); await checkCard(`${U1.id} 마무리 카드`); await shot('summary')
    })
  }

  return { results: r.results, unmockedRequests, mockErrors }
}
