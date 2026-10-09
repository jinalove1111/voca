// 2026-10-10 문법 과정 화면(QA 전용 홈 📘) 브라우저 시나리오 — 과정 5개 → 단원 목록 → 단원 9단계(예문·설명·구조·비교·오류·연습 4종·직접 사용·다시 풀기).
// 개수·id·문항은 전부 src 데이터(GRAMMAR_COURSES/GRAMMAR_UNITS/UNITS)에서 계산한다(하드코딩 금지). 네트워크 전체 mock, 저장·REST 쓰기 0.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { recordsKey } from '../../src/utils/curriculum/unitRecords.js'
import { UNITS } from '../../src/utils/curriculum/units.js'
import { GRAMMAR_COURSES } from '../../src/utils/grammar/grammarCourses.js'
import { GRAMMAR_UNITS, unitsForCourse, courseCounts, resolveChoice, grammarUnitById, reviewStatusOf, FUNCTION_WORDS, SCHOOL_GRAMMAR_NOTE_KO } from '../../src/utils/grammar/grammarUnits.js'

const VP = { width: 390, height: 844 }
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
// 화면 컨테이너가 overflow-x-hidden이라 문서 스크롤만으로는 잘림을 못 잡는다 — 요소가 뷰포트 오른쪽 밖으로 나갔는지도 본다
const clipped = (page, rootId) => page.locator(`[data-testid="${rootId}"] *`).evaluateAll((els) =>
  els.filter((el) => el.offsetParent !== null && el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map((el) => `${el.tagName}:${Math.round(el.getBoundingClientRect().right)}`))
const smallButtons = (page, rootId) => page.locator(`[data-testid="${rootId}"] button`).evaluateAll((els) =>
  els.filter((el) => el.offsetParent !== null).map((el) => [el.textContent.trim().slice(0, 20), el.getBoundingClientRect().height]).filter(([, h]) => h < 44).map(([t, h]) => `${t}:${Math.round(h)}`))
const speakLog = (page) => page.evaluate(() => window.__speak || [])
async function waitUntil(fn, { timeout = 15000, interval = 100 } = {}) {
  const start = Date.now(); let last
  while (Date.now() - start < timeout) { last = await fn(); if (last) return last; await new Promise((r) => setTimeout(r, interval)) }
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
async function installSpeakCounter(page) {
  await page.addInitScript(() => { window.__speak = []; const s = window.speechSynthesis; if (!s) return; const orig = s.speak.bind(s); s.speak = (u) => { if ((u.text || '').trim()) window.__speak.push(u.text); return orig(u) } })
}
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)

// 앱 자체 키(paul_easy_ 동기화 메타, paulEasyVoca_currentStudent)는 허용 — 문법 관련 새 키가 없고 Unit 기록 값이 그대로인지만 본다
const snap = (page) => page.evaluate((rk) => ({ keys: Object.keys(localStorage).sort(), rec: localStorage.getItem(rk) }), recordsKey(QA_STUDENT_ID))
const storageUnchanged = (a, b) => {
  const added = b.keys.filter((k) => !a.keys.includes(k) && !/^(paul_easy_|paulEasyVoca_currentStudent)/.test(k))
  return { ok: added.length === 0 && !b.keys.some((k) => /grammar|gu-|course|selection/i.test(k)) && a.rec === b.rec, added }
}
const idsInOrder = (page, rootId, wanted) => page.evaluate(([root, w]) => [...document.querySelectorAll(`[data-testid="${root}"] [data-testid]`)].map((e) => e.getAttribute('data-testid')).filter((t) => w.includes(t)), [rootId, wanted])
const countIds = (page, re) => page.evaluate((src) => { const r = new RegExp(src); return [...document.querySelectorAll('[data-testid]')].filter((e) => r.test(e.getAttribute('data-testid'))).length }, re.source)
const correctSet = (c) => (Array.isArray(c) ? c : [c])
const SECTION_IDS = ['gu-goal', 'gu-examples', 'gu-explain', 'gu-structure', 'gu-compare', 'gu-errors', 'gu-practice', 'gu-use', 'gu-feedback']
const STEP_IDS = ['gu-step-choice', 'gu-step-blank', 'gu-step-order', 'gu-step-build']
const expectedSections = (u) => SECTION_IDS.filter((s) => s !== 'gu-compare' || u.compare)

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
    // 홈 📘 → 과정 목록 (lazy 청크 + pilotUnits 로드 대기)
    const toCourses = async () => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-grammar').click()
      await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 20000 })
    }
    const toUnits = async (courseId) => { await T(page, `grammar-course-${courseId}`).click(); await T(page, 'grammar-units').waitFor({ state: 'visible', timeout: 10000 }) }
    const toUnit = async (courseId, unitId) => { await toUnits(courseId); await T(page, `grammar-unit-${unitId}`).click(); await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 }) }
    const status = async () => txt(page, 'gu-practice-status')
    // 순서 배열: answers[0] 순서대로 단어 칩을 누른다(같은 단어가 둘이어도 안 쓴 인덱스를 고름)
    const tapOrder = async (i, words, seq) => {
      const used = new Set()
      for (const w of seq) { const j = words.findIndex((x, k) => x === w && !used.has(k)); used.add(j); await T(page, `gu-order-${i}-word-${j}`).click() }
    }
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, toCourses, toUnits, toUnit, status, tapOrder })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
  }

  // 단원 화면 공통 검증: 섹션 DOM 순서·예문 수·듣기 1회·구조 칩·오류 수·연습 단계 순서
  async function checkUnitView(page, name, u, { listen = true } = {}) {
    r.check(`${name} ${u.id} 화면: data-unit, 준비 중 아님`, (await T(page, 'grammar-unit').getAttribute('data-unit')) === u.id && (await T(page, 'gu-preparing').count()) === 0)
    const order = await idsInOrder(page, 'grammar-unit', SECTION_IDS)
    r.check(`${name} ${u.id} 섹션 DOM 순서${u.compare ? '(비교 포함)' : '(비교 없음)'}`, JSON.stringify(order) === JSON.stringify(expectedSections(u)), order.join(','))
    r.check(`${name} ${u.id} 연습 단계 순서 선택→빈칸→순서→만들기`, JSON.stringify(await idsInOrder(page, 'gu-practice', STEP_IDS)) === JSON.stringify(STEP_IDS))
    r.check(`${name} ${u.id} 예문 ${u.examples.length}개 + 듣기 버튼 각각`, (await countIds(page, /^gu-example-\d+$/)) === u.examples.length && (await countIds(page, /^gu-example-\d+-listen$/)) === u.examples.length)
    r.check(`${name} ${u.id} 오류 ${u.errors.length}개`, (await countIds(page, /^gu-error-\d+$/)) === u.errors.length)
    r.check(`${name} ${u.id} 구조 ${u.structure.length}행: S·V 칩${u.structure.some((s) => s.rest) ? '·+ 칩' : ''}`, (await countIds(page, /^gu-structure-\d+$/)) === u.structure.length &&
      (await Promise.all(u.structure.map(async (s, i) => { const t = await txt(page, `gu-structure-${i}`); return t.includes('S') && t.includes(s.s) && t.includes('V') && t.includes(s.v) && (!s.rest || (t.includes('+') && t.includes(s.rest))) }))).every(Boolean))
    r.check(`${name} ${u.id} 예문 텍스트 = 데이터`, (await Promise.all(u.examples.map(async (e, i) => (await txt(page, `gu-example-${i}`)).includes(e.en)))).every(Boolean))
    if (listen) {
      const before = (await speakLog(page)).length
      await T(page, 'gu-example-0-listen').click()
      r.check(`${name} ${u.id} 예문 0 🔊 → speak(영어) 1회`, !!(await waitUntil(async () => (await speakLog(page)).length === before + 1, { timeout: 3000 })) && (await speakLog(page))[before] === u.examples[0].en)
    }
  }

  // 연습 전체 흐름(단원 공통): 선택(틀림 1회 후 전부 맞힘) → 빈칸(틀림→다시 풀기→맞음) → 순서(지우기·틀림·다시·맞음) → 만들기(예시 비교, 판정 없음) → 직접 사용 → 전체 다시 풀기
  async function practiceFlow({ page, name: n0, toCourses, toUnit, status, tapOrder }, U, { choiceCount } = {}) {
    const name = `${n0} ${U.id}`
    await toCourses()
    const before0 = await snap(page)
    await toUnit(U.courseId, U.id)
    const choice = resolveChoice(U, UNITS), p = U.practice
    const M = choice.length + p.blank.length + p.order.length
    r.check(`${name} 선택 ${choice.length}문항 + 빈칸 ${p.blank.length} + 순서 ${p.order.length} + 만들기 ${p.build.length} = 데이터`,
      (choiceCount === undefined || choice.length === choiceCount) && (await countIds(page, /^gu-choice-\d+$/)) === choice.length && (await countIds(page, /^gu-blank-\d+$/)) === p.blank.length && (await countIds(page, /^gu-order-\d+$/)) === p.order.length && (await countIds(page, /^gu-build-\d+$/)) === p.build.length)
    r.check(`${name} 시작 상태 '풀이 0/${M}', 완료 문구 없음`, (await status()) === `풀이 0/${M}` && (await T(page, 'gu-practice-done').count()) === 0, await status())
    // ① 선택: 첫 문항은 틀린 보기 → 맞는 보기 순
    const wrong0 = choice[0].options.findIndex((_, j) => !correctSet(choice[0].correct).includes(j))
    if (wrong0 >= 0) { await T(page, `gu-choice-0-opt-${wrong0}`).click(); r.check(`${name} 선택 0 틀린 보기: 풀이 0/${M} 유지 + 설명`, (await status()) === `풀이 0/${M}` && (await T(page, 'gu-choice-0-why').isVisible()), await status()) }
    for (let i = 0; i < choice.length; i++) await T(page, `gu-choice-${i}-opt-${correctSet(choice[i].correct)[0]}`).click()
    r.check(`${name} 선택 ${choice.length}개 맞히면 '풀이 ${choice.length}/${M}'`, !!(await waitUntil(async () => (await status()) === `풀이 ${choice.length}/${M}`, { timeout: 3000 })), await status())
    // ② 빈칸: 0번 틀림 → 이유+다시 풀기 → 초기화 → 맞음, 나머지 맞음
    const b0 = p.blank[0], wb = b0.options.findIndex((_, j) => j !== b0.correct)
    await T(page, `gu-blank-0-opt-${wb}`).click()
    r.check(`${name} 빈칸 0 틀림: 이유+'다시 풀기' 표시, 풀이 수 그대로`, (await T(page, 'gu-blank-0-why').isVisible()) && (await T(page, 'gu-blank-0-retry').isVisible()) && (await status()) === `풀이 ${choice.length}/${M}` && (await T(page, 'gu-blank-0-opt-0').isDisabled()))
    await T(page, 'gu-blank-0-retry').click()
    r.check(`${name} 다시 풀기 → 초기화(why 없음, 보기 활성)`, (await T(page, 'gu-blank-0').getAttribute('data-answered')) === 'false' && (await T(page, 'gu-blank-0-why').count()) === 0 && (await T(page, 'gu-blank-0-opt-0').isEnabled()))
    await T(page, `gu-blank-0-opt-${b0.correct}`).click()
    r.check(`${name} 빈칸 0 맞음: '맞아요' + 풀이 +1`, (await txt(page, 'gu-blank-0-why')).includes('맞아요') && (await T(page, 'gu-blank-0-retry').count()) === 0 && (await status()) === `풀이 ${choice.length + 1}/${M}`, await status())
    for (let i = 1; i < p.blank.length; i++) await T(page, `gu-blank-${i}-opt-${p.blank[i].correct}`).click()
    r.check(`${name} 빈칸 ${p.blank.length}개 후 '풀이 ${choice.length + p.blank.length}/${M}'`, (await status()) === `풀이 ${choice.length + p.blank.length}/${M}`, await status())
    // ③ 순서: 0번 틀린 순서 → 이유+다시 풀기, 지우기 동작, 맞는 순서, 나머지 맞음
    const o0 = p.order[0], good0 = o0.answers[0]
    const isGood = (seq) => o0.answers.some((a) => a.join(' ') === seq.join(' '))
    let bad0 = [...good0].reverse(); if (isGood(bad0)) bad0 = [...good0.slice(1), good0[0]]
    r.check(`${name} 순서 0 시작: 확인·지우기 비활성, 답 칸 비어 있음`, (await T(page, 'gu-order-0-check').isDisabled()) && (await T(page, 'gu-order-0-clear').isDisabled()) && (await txt(page, 'gu-order-0-answer')) === '')
    await tapOrder(0, o0.words, bad0)
    r.check(`${name} 순서 0 틀린 순서로 놓으면 답 칸에 단어가 쌓이고 칩은 비활성`, (await txt(page, 'gu-order-0-answer')) === bad0.join(' ') && (await T(page, 'gu-order-0-word-0').isDisabled()))
    await T(page, 'gu-order-0-clear').click()
    r.check(`${name} 지우기 → 답 칸 비움, 칩 다시 활성`, (await txt(page, 'gu-order-0-answer')) === '' && (await T(page, 'gu-order-0-word-0').isEnabled()))
    await tapOrder(0, o0.words, bad0)
    await T(page, 'gu-order-0-check').click()
    r.check(`${name} 순서 0 틀림: 이유+다시 풀기, 풀이 수 그대로`, (await T(page, 'gu-order-0-why').isVisible()) && (await T(page, 'gu-order-0-retry').isVisible()) && !(await txt(page, 'gu-order-0-why')).includes('맞아요') && (await status()) === `풀이 ${choice.length + p.blank.length}/${M}`)
    await T(page, 'gu-order-0-retry').click()
    r.check(`${name} 순서 다시 풀기 → 답 칸 비움·확인 버튼 복귀`, (await txt(page, 'gu-order-0-answer')) === '' && (await T(page, 'gu-order-0-check').count()) === 1 && (await T(page, 'gu-order-0').getAttribute('data-answered')) === 'false')
    await tapOrder(0, o0.words, good0)
    await T(page, 'gu-order-0-check').click()
    r.check(`${name} 순서 0 맞음: '맞아요'`, (await txt(page, 'gu-order-0-why')).includes('맞아요') && (await T(page, 'gu-order-0-retry').count()) === 0)
    for (let i = 1; i < p.order.length; i++) {
      r.check(`${name} 마지막 문항 전에는 '연습 다 했어요' 없음 (순서 ${i})`, (await T(page, 'gu-practice-done').count()) === 0)
      await tapOrder(i, p.order[i].words, p.order[i].answers[0])
      await T(page, `gu-order-${i}-check`).click()
    }
    r.check(`${name} 풀이 ${M}/${M} + '연습 다 했어요'`, !!(await waitUntil(async () => (await status()) === `풀이 ${M}/${M}`, { timeout: 3000 })) && (await T(page, 'gu-practice-done').isVisible()), await status())
    // ④ 만들기: 입력 전 비교 비활성 → 입력 → 예시 비교(판정 없음)
    const JUDGE = /점수|틀렸|맞았어요|정답이에요|정답!|✅|❌/
    for (let i = 0; i < p.build.length; i++) {
      const q = p.build[i]
      r.check(`${name} 만들기 ${i} 입력 전 '예시와 비교' 비활성, 비교 영역 없음`, (await T(page, `gu-build-${i}-reveal`).isDisabled()) && (await T(page, `gu-build-${i}-compare`).count()) === 0)
      await T(page, `gu-build-${i}-input`).fill('my own sentence')
      await T(page, `gu-build-${i}-reveal`).click()
      const c = await txt(page, `gu-build-${i}-compare`)
      r.check(`${name} 만들기 ${i} 비교: 내 문장+예시(${q.exampleEn})+'하나의 답'+허용 안내, 판정 단어 없음`, c.includes('my own sentence') && c.includes(q.exampleEn) && c.includes('하나의 답') && c.includes(q.acceptNoteKo) && !JUDGE.test(c), c.slice(0, 120))
    }
    r.check(`${name} 만들기는 풀이 수에 안 들어감(여전히 ${M}/${M})`, (await status()) === `풀이 ${M}/${M}`)
    // 직접 사용
    const use = U.use
    if (use.kind === 'speaking') {
      r.check(`${name} 직접 사용(speaking): 안내문·예시 표시, 완료 문구 아직 없음`, (await txt(page, 'gu-use')).includes(use.promptKo) && (await txt(page, 'gu-use')).includes(use.exampleEn) && (await T(page, 'gu-use-done-note').count()) === 0)
      const before = (await speakLog(page)).length
      await T(page, 'gu-use-listen').click()
      r.check(`${name} 직접 사용 🔊 → 예시 speak`, !!(await waitUntil(async () => (await speakLog(page)).length > before, { timeout: 3000 })) && (await speakLog(page))[before] === use.exampleEn)
      await T(page, 'gu-use-done').click()
      r.check(`${name} '말해 봤어요' → 완료 안내(판정 없음)`, (await txt(page, 'gu-use-done-note')).includes('괜찮아요') && !/정답|점수|틀렸/.test(await txt(page, 'gu-use')))
    } else {
      await T(page, 'gu-use-input').fill('my own sentence')
      await T(page, 'gu-use-reveal').click()
      const c = await txt(page, 'gu-use-compare')
      r.check(`${name} 직접 사용(writing): 내 문장+예시 비교, 판정 단어 없음`, c.includes('my own sentence') && c.includes(use.exampleEn) && !JUDGE.test(c), c.slice(0, 120))
    }
    // 피드백 + 전체 다시 풀기
    r.check(`${name} 피드백 섹션 + 전체 다시 풀기 버튼`, (await T(page, 'gu-feedback').isVisible()) && (await T(page, 'gu-reset-all').isVisible()))
    await T(page, 'gu-reset-all').click()
    r.check(`${name} 전체 다시 풀기 → '풀이 0/${M}', 완료 문구·비교·답 사라짐`, (await status()) === `풀이 0/${M}` && (await T(page, 'gu-practice-done').count()) === 0 && (await T(page, 'gu-choice-0').getAttribute('data-answered')) === 'false' && (await T(page, 'gu-build-0-compare').count()) === 0 && (await T(page, 'gu-blank-0').getAttribute('data-answered')) === 'false' && (await T(page, 'gu-order-0').getAttribute('data-answered')) === 'false', await status())
    const su = storageUnchanged(before0, await snap(page))
    r.check(`${name} 전체 흐름 뒤 문법 관련 새 키 없음, Unit 기록 불변(앱 자체 키 허용)`, su.ok, su.added.join(','))
  }

  const EASY = unitsForCourse('easy')
  const U1 = grammarUnitById('g-easy-01')
  const UI1 = grammarUnitById('g-int-01')

  await scenario('a 과정 5개·배지·개수', VP, async ({ page, name, toCourses }) => {
    await toCourses()
    r.check(`${name} 첫 화면 data-view=courses, ← 홈 버튼`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'courses' && (await T(page, 'grammar-courses-home').isVisible()))
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

  await scenario('b Easy 단원 목록·준비 중 비활성·g-easy-01 진입·섹션 순서', VP, async ({ page, name, toCourses, toUnits }) => {
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
    await T(page, `grammar-unit-${U1.id}`).click()
    await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} data-view=unit, 제목 '${U1.order}. ${U1.titleKo}'`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'unit' && (await txt(page, 'grammar-unit')).includes(`${U1.order}. ${U1.titleKo}`))
    await checkUnitView(page, name, U1)
    r.check(`${name} ${U1.id} 검수 배지 data-review=${reviewStatusOf(U1)}`, (await T(page, 'gu-review-status').getAttribute('data-review')) === reviewStatusOf(U1) && (await txt(page, 'gu-review-status')) === (reviewStatusOf(U1) === 'reviewed' ? '검수 완료' : '검수 전'))
    r.check(`${name} 학습 목표 카드 = 데이터`, (await txt(page, 'gu-goal')).includes(U1.goalKo))
    r.check(`${name} 기초 링크·비교 섹션 없음(g-easy-01)`, (await T(page, 'gu-basics-link').count()) === 0 && (await T(page, 'gu-compare').count()) === 0)
    await T(page, 'gu-back').click()
    r.check(`${name} ← 단원 목록 → 같은 과정(easy) 목록`, (await T(page, 'grammar-units').getAttribute('data-course')) === 'easy' && (await T(page, 'grammar-unit').count()) === 0)
  })

  await scenario('c g-easy-01 연습 전체·직접 사용·전체 다시 풀기', VP, (ctx) => practiceFlow(ctx, U1, { choiceCount: 6 }))

  await scenario('d g-int-01 비교 섹션·되묻기 순서 문항', VP, async ({ page, name, toCourses, toUnits, toUnit, status, tapOrder }) => {
    await toCourses()
    await toUnits('intermediate')
    const list = unitsForCourse('intermediate')
    r.check(`${name} Intermediate 목록: ready만 활성, 나머지 비활성+'준비 중'`, (await Promise.all(list.map(async (u) => (u.status === 'ready' ? await T(page, `grammar-unit-${u.id}`).isEnabled() : (await T(page, `grammar-unit-${u.id}`).isDisabled()) && (await txt(page, `grammar-unit-${u.id}`)).includes('준비 중'))))).every(Boolean))
    await T(page, `grammar-unit-${UI1.id}`).click()
    await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 })
    await checkUnitView(page, name, UI1, { listen: false })
    r.check(`${name} 비교 섹션: 긍정·부정·의문 = 데이터`, (await Promise.all(['aff', 'neg', 'q'].map(async (k) => (await txt(page, `gu-compare-${k}`)).includes(UI1.compare[k].en)))).every(Boolean) && (await idsInOrder(page, 'grammar-unit', ['gu-structure', 'gu-compare', 'gu-errors'])).join() === 'gu-structure,gu-compare,gu-errors')
    // prereq(g-easy-02)는 화면에 렌더되지 않는다 — 렌더되더라도 이름이 깨지지 않아야 하므로 있으면 제목을 포함하는지만 본다
    const prereq = grammarUnitById(UI1.prereqIds[0])
    if (await T(page, 'gu-prereq').count()) r.check(`${name} 선수 단원 표시에 ${prereq.titleKo}`, (await txt(page, 'gu-prereq')).includes(prereq.titleKo))
    const choice = resolveChoice(UI1, UNITS), M = choice.length + UI1.practice.blank.length + UI1.practice.order.length
    r.check(`${name} 시작 '풀이 0/${M}', 선택 ${choice.length}문항`, (await status()) === `풀이 0/${M}` && (await countIds(page, /^gu-choice-\d+$/)) === choice.length)
    const rq = UI1.practice.order.findIndex((o) => o.answers[0][0] === 'What')
    r.check(`${name} 되묻기(What about …?) 순서 문항이 데이터에 있음`, rq >= 0)
    if (rq >= 0) {
      const o = UI1.practice.order[rq]
      await tapOrder(rq, o.words, o.answers[0])
      await T(page, `gu-order-${rq}-check`).click()
      r.check(`${name} 되묻기 순서 문항 맞음: '맞아요' + 풀이 1/${M}`, (await txt(page, `gu-order-${rq}-why`)).includes('맞아요') && (await status()) === `풀이 1/${M}`, await status())
    }
    const bq = UI1.practice.blank.findIndex((b) => b.options[b.correct] === "isn't")
    if (bq >= 0) {
      const b = UI1.practice.blank[bq]
      await T(page, `gu-blank-${bq}-opt-${b.options.findIndex((_, j) => j !== b.correct)}`).click()
      r.check(`${name} No, it ___ 빈칸 틀림 → 이유(isn't) + 다시 풀기`, (await txt(page, `gu-blank-${bq}-why`)).includes("isn't") && (await T(page, `gu-blank-${bq}-retry`).isVisible()))
    }
    r.check(`${name} 직접 사용(말하기) 🔊 있음`, UI1.use.kind === 'speaking' && (await T(page, 'gu-use-listen').isVisible()))
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

  await scenario('f 저장 없음·← 경로 복귀', VP, async ({ page, name, toCourses, toUnits, toUnit }) => {
    await toCourses()
    const before0 = await snap(page)
    await toUnit('easy', U1.id)
    await T(page, 'gu-choice-0-opt-0').click()
    await T(page, 'gu-blank-0-opt-0').click()
    await T(page, 'gu-back').click()
    r.check(`${name} 단원 ← 단원 목록(easy)`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'units' && (await T(page, 'grammar-units').getAttribute('data-course')) === 'easy')
    await T(page, `grammar-unit-${U1.id}`).click()
    await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 단원을 다시 열면 풀이 상태는 화면 상태일 뿐 — 처음부터(저장 안 함)`, (await T(page, 'gu-choice-0').getAttribute('data-answered')) === 'false' && (await T(page, 'gu-practice-status').textContent()).startsWith('풀이 0/'))
    await T(page, 'gu-back').click()
    await T(page, 'grammar-units-back').click()
    r.check(`${name} 목록 ← 과정 → 과정 선택`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'courses' && (await T(page, 'grammar-course-easy').isVisible()))
    await T(page, 'grammar-courses-home').click()
    r.check(`${name} ← 홈 → 학생 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 10000 })) && (await T(page, 'grammar-courses').count()) === 0)
    // 다시 들어오면 항상 과정 선택부터, 중간(단원 목록)에서 ← 홈도 바로 홈
    await T(page, 'student-home-grammar').click()
    await T(page, 'grammar-courses').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 재진입 시 과정 선택부터(선택 저장 없음)`, (await T(page, 'grammar-courses').getAttribute('data-view')) === 'courses')
    await toUnits('intermediate')
    await T(page, 'grammar-courses-home').click()
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
    await scenario(`h ${c.id} ready 단원 전부 진입·9섹션·문항 수·검수 배지·어휘`, VP, async ({ page, name, toCourses, toUnits }) => {
      await toCourses()
      await toUnits(c.id)
      const readyUnits = readyOf(c.id)
      r.check(`${name} ${c.id} ready 단원 ${readyUnits.length}개(데이터), 과정 카운트와 일치`, readyUnits.length === courseCounts(c.id).ready && readyUnits.length >= 1, String(readyUnits.length))
      for (const u of readyUnits) {
        const n = `${name} ${u.id}`
        await T(page, `grammar-unit-${u.id}`).click()
        await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 })
        await checkUnitView(page, name, u, { listen: false })
        const p = u.practice, choice = resolveChoice(u, UNITS)
        r.check(`${n} 문항 수: 예문 ${u.examples.length}·오류 ${u.errors.length}·선택 ${choice.length}·빈칸 ${p.blank.length}·순서 ${p.order.length}·만들기 ${p.build.length} = 데이터`,
          (await countIds(page, /^gu-example-\d+$/)) === u.examples.length && (await countIds(page, /^gu-error-\d+$/)) === u.errors.length && (await countIds(page, /^gu-choice-\d+$/)) === choice.length &&
          (await countIds(page, /^gu-blank-\d+$/)) === p.blank.length && (await countIds(page, /^gu-order-\d+$/)) === p.order.length && (await countIds(page, /^gu-build-\d+$/)) === p.build.length)
        const want = reviewStatusOf(u) === 'reviewed' ? '검수 완료' : '검수 전'
        r.check(`${n} 검수 배지 '${want}'(data-review=${reviewStatusOf(u)})${want === '검수 전' ? ', 화면 어디에도 검수 완료 없음' : ''}`,
          (await T(page, 'gu-review-status').getAttribute('data-review')) === reviewStatusOf(u) && (await txt(page, 'gu-review-status')) === want && (want === '검수 완료' || !(await page.locator('body').innerText()).includes('검수 완료')))
        // 어휘(선수 단원 사슬 기준): 예문 en, 단원 자체 선택 정답 보기, 순서 칩 단어는 허용 어휘 안에서만
        const ok = allowedFor(u)
        const seen = []
        for (let i = 0; i < u.examples.length; i++) seen.push(await T(page, `gu-example-${i}`).locator('p').first().textContent())
        for (let i = 0; i < (p.choice || []).length; i++) for (const j of correctSet(p.choice[i].correct)) if (typeof p.choice[i].options[j] === 'string') seen.push(await txt(page, `gu-choice-${i}-opt-${j}`)) // 오답 보기는 배운 단어의 틀린 형태라 검증기처럼 제외
        for (let i = 0; i < p.order.length; i++) for (let j = 0; j < p.order[i].words.length; j++) seen.push(await txt(page, `gu-order-${i}-word-${j}`))
        const unknown = [...new Set(seen.flatMap(tokenize).filter((w) => !ok.has(w)))]
        r.check(`${n} 어휘 규칙: 화면의 영어 예문·선택 보기·순서 칩이 배운 단어만 사용`, unknown.length === 0, unknown.join(', '))
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

  await scenario('k 기초 설명 링크(basicsUnitId)', VP, async ({ page, name, toCourses, toUnit }) => {
    const withBasics = GRAMMAR_UNITS.filter((u) => u.status === 'ready' && u.basicsUnitId)
    if (withBasics.length === 0) { r.skip(`${name} 기초 설명 링크`, 'basicsUnitId가 있는 ready 단원이 아직 없음(학교 문법 과정 단원이 ready가 되면 자동 실행)'); return }
    await toCourses()
    for (const u of withBasics) {
      const b = grammarUnitById(u.basicsUnitId); const n = `${name} ${u.id}→${b.id}`
      await toUnit(u.courseId, u.id)
      r.check(`${n} 기초 링크 표시 + 기초 단원 제목 '${b.titleKo}'`, (await T(page, 'gu-basics-link').isVisible()) && (await txt(page, 'gu-basics-link')).includes(b.titleKo), await txt(page, 'gu-basics-link').catch(() => ''))
      await T(page, 'gu-basics-link').click()
      await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 })
      r.check(`${n} 링크 → data-unit=${b.id}, 돌아가기 버튼(단원 목록 버튼 없음)`, (await T(page, 'grammar-unit').getAttribute('data-unit')) === b.id && (await T(page, 'gu-basics-back').isVisible()) && (await T(page, 'gu-back').count()) === 0)
      if (b.status === 'ready') {
        const order = await idsInOrder(page, 'grammar-unit', SECTION_IDS)
        r.check(`${n} 기초 단원(ready) 전체 섹션 표시`, JSON.stringify(order) === JSON.stringify(expectedSections(b)) && (await T(page, 'gu-preparing').count()) === 0, order.join(','))
      } else {
        r.check(`${n} 기초 단원(준비 중) 안전 표시: data-status=preparing + gu-preparing`, (await T(page, 'grammar-unit').getAttribute('data-status')) === 'preparing' && (await T(page, 'gu-preparing').isVisible()))
      }
      await T(page, 'gu-basics-back').click()
      await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 })
      r.check(`${n} 돌아가기 → 원래 단원(${u.id}) 복원, 단원 목록 버튼 복귀`, (await T(page, 'grammar-unit').getAttribute('data-unit')) === u.id && (await T(page, 'gu-back').isVisible()) && (await T(page, 'gu-basics-back').count()) === 0)
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
    await T(page, 'student-home-grammar').click()
    const didReload = await reloaded
    const safeEval = (fn) => page.evaluate(fn).catch(() => null)
    r.check(`${name} 1차 실패 → stale-chunk 가드 기록 + 자동 새로고침(홈 복원)`, didReload && !!(await waitUntil(async () => (await safeEval(() => performance.getEntriesByType('navigation')[0]?.type)) === 'reload' && !!(await safeEval(() => sessionStorage.getItem('paulEasyVoca_staleChunkReloadAt'))) && (await T(page, 'student-home').isVisible().catch(() => false)), { timeout: 20000 })))
    // 2차 실패(가드 활성 → 새로고침 안 함): 안내 화면
    await T(page, 'student-home-grammar').click()
    r.check(`${name} 2차 실패 → 빈 화면 대신 안내(grammar-load-failed) + 새로고침·홈 버튼`, !!(await waitUntil(() => T(page, 'grammar-load-failed').isVisible(), { timeout: 15000 })) && (await txt(page, 'grammar-load-failed')).includes('불러오지 못했어요') && (await txt(page, 'grammar-load-failed')).includes('새로고침') && (await T(page, 'grammar-load-reload').isVisible()) && (await T(page, 'grammar-load-home').isVisible()))
    await T(page, 'grammar-load-home').click()
    r.check(`${name} ← 홈으로 → 학생 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 10000 })))
    await T(page, 'student-home-grammar').click()
    r.check(`${name} 같은 페이지에서 다시 열면 여전히 안내(브라우저 모듈 캐시) — 빈 화면 아님`, !!(await waitUntil(() => T(page, 'grammar-load-failed').isVisible(), { timeout: 15000 })))
    await page.unroute('**/assets/units-*.js')
    const reloaded2 = page.waitForEvent('framenavigated', { timeout: 20000 }).then(() => true).catch(() => false)
    await T(page, 'grammar-load-reload').click()
    r.check(`${name} 🔄 새로고침 → 홈 복원`, (await reloaded2) && !!(await waitUntil(() => T(page, 'student-home').isVisible().catch(() => false), { timeout: 20000 })))
    await T(page, 'student-home-grammar').click()
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

  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 1280, height: 800 }]) {
    await scenario('g 레이아웃', vp, async ({ page, name, toCourses, toUnits }) => {
      const check = async (label) => {
        const small = await smallButtons(page, 'grammar-courses'); const cl = await clipped(page, 'grammar-courses')
        r.check(`${name} ${label} 가로 스크롤·잘림 없음/버튼 >=44px`, (await noOverflow(page)) && cl.length === 0 && small.length === 0, `${small.join(',')} ${cl.join(',')}`)
      }
      await toCourses(); await check('과정 목록')
      await toUnits('easy'); await check('Easy 단원 목록')
      await T(page, `grammar-unit-${U1.id}`).click()
      await T(page, 'grammar-unit').waitFor({ state: 'visible', timeout: 10000 })
      await check(`${U1.id} 단원 화면`)
      await T(page, 'gu-build-0-input').fill('Can I borrow a very long sentence about my favourite pencil case please?')
      await T(page, 'gu-build-0-reveal').click()
      await check(`${U1.id} 만들기 비교 펼침`)
    })
  }

  return { results: r.results, unmockedRequests, mockErrors }
}
