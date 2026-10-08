// 2026-10-08(224차, 225차 Unit 2·격리 추가) 통합 과정 시범 Unit(교실에서 물건 빌리기·잃어버린 물건 위치 묻기) 브라우저 시나리오 — QA 홈 [오늘의 학습] → Unit → 활동 7종 연결,
// 복습 답 숨김, 자기 확인·완료 기록(기기, UUID 키)·재진입, 말하기/쓰기 왕복, 360/390/412/1280. 네트워크 전체 mock.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { UNIT_BORROW } from '../../src/utils/curriculum/unitBorrow.js'
import { UNIT_LOST_BAG } from '../../src/utils/curriculum/unitLostBag.js'
import { UNIT_FIND_AGAIN } from '../../src/utils/curriculum/unitFindAgain.js'
import { recordsKey } from '../../src/utils/curriculum/unitRecords.js'
import { COURSES } from '../../src/utils/curriculum/courseModel.js'
import { listCatalog, catalogCounts, courseCount, EMPTY_LABEL_KO } from '../../src/utils/curriculum/catalog.js'

const VP = { width: 390, height: 844 }
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const smallButtons = (page, rootId) => page.locator(`[data-testid="${rootId}"] button`).evaluateAll((els) =>
  els.filter((el) => el.offsetParent !== null).map((el) => [el.textContent.trim().slice(0, 20), el.getBoundingClientRect().height]).filter(([, h]) => h < 44).map(([t, h]) => `${t}:${Math.round(h)}`))
const inDom = (page, text) => page.evaluate((t) => document.documentElement.outerHTML.includes(t), text)
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
const U = UNIT_BORROW
const U2 = UNIT_LOST_BAG
const U3 = UNIT_FIND_AGAIN
const act = (kind) => U.activities.find((a) => a.kind === kind)
const act2 = (kind) => U2.activities.find((a) => a.kind === kind)
// 228차: 선택기 항목 수는 카탈로그(실제 Unit + 이야기 회차)에서 계산한다(하드코딩 금지)
const UNITS_ALL = [U, U2, U3]
const CONV_COUNTS = catalogCounts(UNITS_ALL, 'conversation')
const EMPTY_COURSES = COURSES.filter((c) => courseCount(UNITS_ALL, c.id) === 0).map((c) => c.id)

// Unit 개요 → ← 목록 → 선택기 ← 홈
async function goHomeFromUnit(page) {
  await T(page, 'unit-home').click()
  await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 10000 })
  await T(page, 'unit-list-home').click()
  await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[unit]')
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
    const openUnit = async (unitId = U.id) => {
      const u = [U, U2, U3].find((x) => x.id === unitId)
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-unit').click()
      await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 15000 })
      await T(page, `unit-course-${u.course}`).click()
      await T(page, `unit-block-${u.block}`).click()
      await T(page, `unit-pick-${unitId}`).click()
      await T(page, 'unit-screen').waitFor({ state: 'visible', timeout: 15000 })
    }
    // Unit 화면 ← 목록 → 목록 ← 홈
    const goHome = async () => {
      await T(page, 'unit-home').click()
      await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 10000 })
      await T(page, 'unit-list-home').click()
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    }
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, openUnit, goHome })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인 외 REST 쓰기 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
  }

  await scenario('a Unit 개요·어휘·듣기·읽기·문형', VP, async ({ page, name, openUnit }) => {
    await openUnit()
    r.check(`${name} 제목·상황·활동 7개·다음 활동=어휘`, (await txt(page, 'unit-title')) === U.titleKo && (await page.locator('[data-testid^="unit-act-"]').count()) === 7 && (await T(page, 'unit-screen').getAttribute('data-next')) === act('vocab').id)
    r.check(`${name} 임시 저장·점수 아님 안내`, (await txt(page, 'unit-storage-note')).includes('자동 전송되지 않아요') && (await txt(page, 'unit-storage-note')).includes('점수나 진급은 아니에요'))
    await T(page, 'unit-next').click()
    r.check(`${name} 어휘 활동: 단어 ${U.vocab.length}개 + 🔊`, (await T(page, 'unit-activity').getAttribute('data-kind')) === 'vocab' && (await page.locator('[data-testid^="unit-vocab-listen-"]').count()) === U.vocab.length)
    await page.locator('[data-testid^="unit-vocab-listen-"]').first().click()
    r.check(`${name} 🔊 → speak 1회(영어)`, !!(await waitUntil(async () => (await speakLog(page)).length === 1, { timeout: 3000 })) && /[A-Za-z]/.test((await speakLog(page))[0]))
    await T(page, 'unit-activity-done').click()
    r.check(`${name} 어휘 끝 → 다음 활동=듣기`, (await T(page, 'unit-screen').getAttribute('data-next')) === act('listening').id && (await T(page, `unit-act-${act('vocab').id}`).getAttribute('data-completed')) === 'true')
    await T(page, 'unit-next').click()
    r.check(`${name} 듣기: 대본은 '글로 보기' 전 숨김, 문항 ${U.listening.questions.length}개`, (await T(page, 'unit-listen-script').count()) === 0 && (await page.locator('[data-testid^="unit-listen-q-"][data-answered]').count()) === U.listening.questions.length)
    const before = (await speakLog(page)).length
    await T(page, 'unit-listen-play').click()
    r.check(`${name} 대화 듣기 → 첫 문장 speak(자동 재생 아님)`, !!(await waitUntil(async () => (await speakLog(page)).length > before, { timeout: 3000 })) && (await speakLog(page))[before] === U.listening.turns[0].en)
    await T(page, `unit-listen-q-0-opt-${(U.listening.questions[0].correct + 1) % 3}`).click()
    await T(page, `unit-listen-q-0-opt-${U.listening.questions[0].correct}`).click()
    r.check(`${name} 한 문항을 두 번 눌러도 끝나지 않음(첫 응답만 카운트)`, !!!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })))
    for (let i = 1; i < U.listening.questions.length; i++) await T(page, `unit-listen-q-${i}-opt-${U.listening.questions[i].correct}`).click()
    r.check(`${name} 문항 다 답하면 끝남(점수 없음), 근거 표시`, !!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })) && (await txt(page, 'unit-listen-q-0-why')).includes('맞아요') && !/점수|%/.test(await txt(page, 'unit-activity')))
    r.check(`${name} 자기 확인: 고르기 전엔 둘 다 강조 없음`, (await T(page, 'unit-self-ok').getAttribute('aria-pressed')) === 'false' && (await T(page, 'unit-self-hard').getAttribute('aria-pressed')) === 'false')
    await T(page, 'unit-self-ok').click()
    await T(page, 'unit-activity-return').click()
    await T(page, 'unit-next').click()
    r.check(`${name} 읽기: 본문·문항 ${U.reading.items.length}개`, (await T(page, 'unit-activity').getAttribute('data-kind')) === 'reading' && (await txt(page, 'unit-reading-text')).includes(U.reading.text.slice(0, 30)))
    for (let i = 0; i < U.reading.items.length; i++) { const q = U.reading.items[i]; await T(page, `unit-reading-q-${i}-opt-${q.type === 'tf' ? (q.answer ? 1 : 0) : (q.correct + 1) % 3}`).click() }
    r.check(`${name} 틀린 보기 골라도 '다시 보세요'+근거만(오답·점수 없음), 활동은 끝남`, (await txt(page, 'unit-reading-q-0-why')).includes('근거') && !/오답|틀렸습니다|점수/.test(await txt(page, 'unit-activity')) && !!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })))
    await T(page, 'unit-activity-return').click()
    r.check(`${name} 다음 활동=말하기(기존 흐름)`, (await T(page, 'unit-screen').getAttribute('data-next')) === act('speaking').id)
    await T(page, `unit-act-${act('grammar').id}`).click()
    r.check(`${name} 문형: 관찰 ${U.grammar.noticing.length}개(확인 전 설명 숨김) + 문항 ${U.grammar.items.length}개`, (await T(page, 'unit-grammar-notice-0-answer').count()) === 0 && (await page.locator('[data-testid^="unit-grammar-q-"][data-answered]').count()) === U.grammar.items.length)
    await T(page, 'unit-grammar-notice-0-open').click()
    r.check(`${name} 생각한 뒤 확인 → 설명`, (await txt(page, 'unit-grammar-notice-0-answer')).length > 0)
    for (let i = 0; i < U.grammar.items.length; i++) { const c = U.grammar.items[i].correct; await T(page, `unit-grammar-q-${i}-opt-${Array.isArray(c) ? c[0] : c}`).click() }
    r.check(`${name} 정답이 둘인 문항: Could I…도 맞음으로 표시`, (await txt(page, `unit-grammar-q-2-why`)).includes('맞아요'))
    r.check(`${name} 문형 활동 끝`, !!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })), await txt(page, 'unit-activity-status'))
    await T(page, 'unit-activity-return').click()
    const rec = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), recordsKey(QA_STUDENT_ID))
    const acts = rec[U.id]?.activities || {}
    r.check(`${name} 기록: UUID 키, completed/selfChecked만 true, teacherObserved·demonstratedIndependent는 false`, acts[act('vocab').id]?.completed === true && acts[act('listening').id]?.selfChecked === true && Object.values(acts).every((a) => a.teacherObserved === false && a.demonstratedIndependent === false) && !/score|level/.test(JSON.stringify(rec)))
    r.check(`${name} 이름 키 없음`, !(await page.evaluate((n) => Object.keys(localStorage).some((k) => k.includes(n)), QA_STUDENT_NAME)))
  })

  await scenario('b 복습(답 숨김)·도움 정도·재진입', VP, async ({ page, name, openUnit, goHome }) => {
    await openUnit()
    await T(page, `unit-act-${act('review').id}`).click()
    r.check(`${name} 복습: 공개 전 영어 모범·듣기 DOM 없음`, !(await inDom(page, U.review[0].model)) && (await T(page, 'unit-review-0-listen').count()) === 0 && (await txt(page, 'unit-review-0')).includes(U.review[0].situationKo))
    r.check(`${name} 공개 전 speak 0회`, (await speakLog(page)).length === 0)
    await T(page, 'unit-review-0-reveal').click()
    r.check(`${name} 답 확인 → 모범·대체·듣기`, (await txt(page, 'unit-review-0-answer')).includes(U.review[0].model) && (await T(page, 'unit-review-0-listen').isVisible()))
    await T(page, 'unit-review-1-reveal').click()
    r.check(`${name} 둘 다 확인하면 활동 끝(판정 없음)`, !!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })) && !/정답|숙달|점수/.test(await txt(page, 'unit-activity')), await txt(page, 'unit-activity-status'))
    await T(page, 'unit-activity-return').click()
    await T(page, 'unit-support-speaking-with-cues').click()
    await T(page, 'unit-support-literacy-alone').click()
    r.check(`${name} 말하기/읽기·쓰기 도움 정도를 따로 고름`, (await T(page, 'unit-support-speaking-with-cues').getAttribute('aria-pressed')) === 'true' && (await T(page, 'unit-support-literacy-alone').getAttribute('aria-pressed')) === 'true')
    await goHome()
    await openUnit()
    r.check(`${name} 재진입: 복습 완료·도움 정도 복원, 다음 활동=어휘(처음)`, (await T(page, `unit-act-${act('review').id}`).getAttribute('data-completed')) === 'true' && (await T(page, 'unit-support-speaking-with-cues').getAttribute('aria-pressed')) === 'true' && (await T(page, 'unit-screen').getAttribute('data-next')) === act('vocab').id)
  })

  await scenario('c 말하기·쓰기 왕복', VP, async ({ page, name, openUnit, goHome }) => {
    await openUnit()
    await T(page, `unit-act-${act('speaking').id}`).click()
    await T(page, 'key-flow').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 말하기 → 기존 2화 한 문장 흐름(spoon 장면)`, (await T(page, 'key-scene').getAttribute('data-variant')) === 'spoon')
    await T(page, 'key-back').click()
    r.check(`${name} ← 메뉴 → Unit 화면으로 복귀`, !!(await waitUntil(() => T(page, 'unit-screen').isVisible(), { timeout: 10000 })))
    await waitUntil(async () => (await T(page, `unit-act-${act('speaking').id}`).getAttribute('data-completed')) === 'true', { timeout: 5000 }) // 복귀 직후 기록 반영(returnedFrom effect) 대기
    r.check(`${name} 복귀 시 말하기 '해 봤어요'(참여 기록, 점수 아님), 다른 활동은 그대로 미완료`, (await T(page, `unit-act-${act('speaking').id}`).getAttribute('data-completed')) === 'true' && (await T(page, `unit-act-${act('vocab').id}`).getAttribute('data-completed')) === 'false' && (await T(page, 'unit-screen').getAttribute('data-next')) === act('vocab').id)
    await T(page, `unit-act-${act('writing').id}`).click()
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 쓰기 → 기존 w-s02-03 문항`, (await T(page, 'writing-flow').getAttribute('data-item')) === act('writing').writingItemId)
    await T(page, 'writing-input').fill('can i borrow pencil')
    await T(page, 'writing-compare').click()
    r.check(`${name} 비교 뒤 버튼은 '다음 문장'이 아니라 '← 이 단원으로'(226차)`, (await txt(page, 'writing-next')) === '← 이 단원으로')
    await T(page, 'writing-next').click()
    r.check(`${name} '← 이 단원으로' → Unit 화면`, !!(await waitUntil(() => T(page, 'unit-screen').isVisible(), { timeout: 10000 })))
    await T(page, `unit-act-${act('writing').id}`).click()
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'writing-back').click()
    r.check(`${name} ← 목록 → Unit 화면으로 복귀`, !!(await waitUntil(() => T(page, 'unit-screen').isVisible(), { timeout: 10000 })))
    await waitUntil(async () => (await T(page, `unit-act-${act('writing').id}`).getAttribute('data-completed')) === 'true', { timeout: 5000 }) // 복귀 직후 기록 반영(returnedFrom effect) 대기
    r.check(`${name} 복귀 시 쓰기 '해 봤어요'`, (await T(page, `unit-act-${act('writing').id}`).getAttribute('data-completed')) === 'true')
    await goHome()
    await T(page, 'student-home-menu-speaking').click()
    r.check(`${name} 홈에서 말하기 → 통합 선택기 처음(과정 선택, Unit 링크·선택 초기화; 228차 진입 변경)`, !!(await waitUntil(() => T(page, 'unit-list').isVisible(), { timeout: 10000 })) && (await T(page, 'unit-list').getAttribute('data-intent')) === 'speaking' && (await T(page, 'unit-list').getAttribute('data-level')) === 'course' && (await T(page, 'speaking-topics').count()) === 0)
  })

  await scenario('e 두 번째 Unit(잃어버린 물건) Unit 안 말하기 3단계·쓰기', VP, async ({ page, name, openUnit, goHome }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'student-home-unit').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 과정 선택: 6과정, 회화만 열림, 나머지 ${EMPTY_COURSES.length}과정은 '${EMPTY_LABEL_KO}'(비활성, '미제작' 아님), 뉴스는 '병행 가능'`, (await T(page, 'unit-list').getAttribute('data-level')) === 'course' && (await page.locator('button[data-testid^="unit-course-"]').count()) === COURSES.length && COURSES.length === 6 && (await T(page, 'unit-course-conversation').isEnabled()) && (await page.locator('[data-testid^="unit-course-"][aria-disabled="true"]').count()) === EMPTY_COURSES.length && EMPTY_COURSES.length === 5 && !EMPTY_COURSES.includes('conversation') && (await txt(page, 'unit-course-phonics')).includes(EMPTY_LABEL_KO) && !(await txt(page, 'unit-course-phonics')).includes('미제작') && (await txt(page, 'unit-course-news')).includes('병행 가능') && (await txt(page, 'unit-course-conversation')).includes(`항목 ${courseCount(UNITS_ALL, 'conversation')}개`))
    await T(page, 'unit-course-conversation').click()
    const emptyBlocks = Object.entries(CONV_COUNTS).filter(([, n]) => n === 0).map(([b]) => b)
    r.check(`${name} 단계 선택: 항목 수 = 카탈로그(Unit+이야기; C1 ${CONV_COUNTS.C1}개·C2 ${CONV_COUNTS.C2}개), 이야기가 있는 3~6단계도 열림, 빈 단계는 '${EMPTY_LABEL_KO}', 기간은 운영 계획 안내`, (await T(page, 'unit-list').getAttribute('data-level')) === 'block' && CONV_COUNTS.C1 === 4 && CONV_COUNTS.C2 === 2 && (await txt(page, 'unit-block-C1')).includes(`항목 ${CONV_COUNTS.C1}개`) && (await txt(page, 'unit-block-C2')).includes(`항목 ${CONV_COUNTS.C2}개`) && (await page.locator('[data-testid^="unit-block-"][aria-disabled="true"]').count()) === emptyBlocks.length && (await txt(page, 'unit-list')).includes('운영 계획') && (await txt(page, 'unit-block-C1')).includes('1단계') && (await txt(page, 'unit-block-C1')).includes('(제안)'), JSON.stringify(CONV_COUNTS))
    for (const b of ['C3', 'C4', 'C5', 'C6']) r.check(`${name} ${b}: 이야기 회차가 있어 '미제작' 아님(항목 ${CONV_COUNTS[b]}개)`, CONV_COUNTS[b] > 0 ? (await T(page, `unit-block-${b}`).isEnabled()) && (await txt(page, `unit-block-${b}`)).includes(`항목 ${CONV_COUNTS[b]}개`) : (await T(page, `unit-block-${b}`).isDisabled()) && (await txt(page, `unit-block-${b}`)).includes(EMPTY_LABEL_KO))
    await T(page, 'unit-block-C1').click()
    const c1 = listCatalog(UNITS_ALL, 'conversation', 'C1')
    r.check(`${name} 목록: Unit 버튼 2개(빌리기·위치 묻기) + 이야기 카드 ${c1.filter((x) => x.kind === 'story').length}개(ep01·ep02, 주제 배지) + 말하기·쓰기 수행 수준 표기`, (await page.locator('button[data-testid^="unit-pick-"]').count()) === 2 && (await page.locator('[data-testid^="unit-pick-"][data-kind="story"]').count()) === c1.filter((x) => x.kind === 'story').length && (await T(page, 'unit-pick-ep01').count()) === 1 && (await T(page, 'unit-pick-ep02').count()) === 1 && (await txt(page, 'unit-pick-ep02')).includes('학교생활') && (await txt(page, `unit-pick-${U2.id}`)).includes(U2.titleKo) && (await txt(page, `unit-pick-${U2.id}`)).includes('말하기 기초 · 쓰기 기초'))
    await T(page, `unit-pick-${U2.id}`).click()
    await T(page, 'unit-screen').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} Unit 2 개요: 제목·활동 7개·다음=어휘`, (await txt(page, 'unit-title')) === U2.titleKo && (await page.locator('[data-testid^="unit-act-"]').count()) === 7 && (await T(page, 'unit-screen').getAttribute('data-next')) === 'vocab')
    await T(page, `unit-act-speaking`).click()
    const steps = act2('speaking').steps
    r.check(`${name} 말하기 1단계 따라 하기: 문장 ${steps[0].lines.length}개 + 🔊, 녹음 버튼(선택)`, (await T(page, 'unit-speaking').getAttribute('data-step')) === 'repeat' && (await page.locator('[data-testid^="unit-speaking-line-"]').count()) === steps[0].lines.length && (await txt(page, 'unit-speaking-line-0')) === steps[0].lines[0].en)
    await T(page, 'unit-speaking-listen-0').click()
    r.check(`${name} 🔊 → 그 문장만 speak`, !!(await waitUntil(async () => (await speakLog(page)).length === 1, { timeout: 3000 })) && (await speakLog(page))[0] === steps[0].lines[0].en)
    await T(page, 'unit-speaking-next').click()
    const sw = steps[1]
    r.check(`${name} 2단계 물건 바꾸기: 첫 칩 문장`, (await T(page, 'unit-speaking').getAttribute('data-step')) === 'swap' && (await txt(page, 'unit-speaking-swap-en')) === sw.frameEn.replace('___', sw.slots[0].en))
    await T(page, 'unit-speaking-slot-1').click()
    await T(page, 'unit-speaking-rslot-1').click()
    r.check(`${name} 칩 바꾸면 질문·대답 문장이 바뀜`, (await txt(page, 'unit-speaking-swap-en')) === sw.frameEn.replace('___', sw.slots[1].en) && (await txt(page, 'unit-speaking-swap-reply')).includes(sw.replyFrame.replace('___', sw.replySlots[1].en)))
    await T(page, 'unit-speaking-swap-listen').click()
    r.check(`${name} 질문 듣기 → 바꾼 문장 speak`, !!(await waitUntil(async () => (await speakLog(page)).length === 2, { timeout: 3000 })) && (await speakLog(page))[1] === sw.frameEn.replace('___', sw.slots[1].en))
    await T(page, 'unit-speaking-next').click()
    const rc = steps[2]
    r.check(`${name} 3단계 모범 없이: 한국어 상황만, 영어 모범·대답 DOM 없음`, (await T(page, 'unit-speaking').getAttribute('data-step')) === 'recall' && (await txt(page, 'unit-speaking')).includes(rc.situationKo) && !(await inDom(page, rc.model)) && !(await inDom(page, rc.reply.en)) && (await T(page, 'unit-speaking-answer').count()) === 0)
    r.check(`${name} 답 확인 전 speak 추가 없음`, (await speakLog(page)).length === 2)
    r.check(`${name} 답 확인 전엔 활동 미완료`, !!!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })))
    await T(page, 'unit-speaking-reveal').click()
    r.check(`${name} 답 확인 → 모범·대체·대답, 활동 '해 봤어요'(판정 없음)`, (await txt(page, 'unit-speaking-answer-en')) === rc.model && (await txt(page, 'unit-speaking-answer')).includes(rc.alternatives[0]) && (await txt(page, 'unit-speaking-answer-reply')).includes(rc.reply.en) && !!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })) && !/정답|숙달|점수/.test(await txt(page, 'unit-activity')))
    await T(page, 'unit-speaking-to-writing').click()
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 말하기 답 확인 뒤 [이 표현 써보기] → 이 Unit의 쓰기 문항(같은 수준)`, (await T(page, 'writing-flow').getAttribute('data-item')) === act2('writing').writingItemId)
    await T(page, 'writing-back').click()
    await waitUntil(() => T(page, 'unit-screen').isVisible(), { timeout: 10000 })
    await waitUntil(async () => (await T(page, 'unit-act-speaking').getAttribute('data-completed')) === 'true', { timeout: 5000 }) // 복귀 직후 기록 반영(returnedFrom effect) 대기
    r.check(`${name} 말하기 완료 기록, 다음=어휘(순서 유지)`, (await T(page, 'unit-act-speaking').getAttribute('data-completed')) === 'true' && (await T(page, 'unit-screen').getAttribute('data-next')) === 'vocab')
    await T(page, 'unit-act-writing').click()
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 쓰기 → Unit 전용 문항 ${act2('writing').writingItemId}`, (await T(page, 'writing-flow').getAttribute('data-item')) === act2('writing').writingItemId)
    await T(page, 'writing-back').click()
    await waitUntil(async () => (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'true', { timeout: 5000 }) // 복귀 직후 기록 반영(returnedFrom effect) 대기
    r.check(`${name} ← 목록 → Unit 2 화면(쓰기 '해 봤어요')`, !!(await waitUntil(() => T(page, 'unit-screen').isVisible(), { timeout: 10000 })) && (await T(page, 'unit-screen').getAttribute('data-unit')) === U2.id && (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'true')
    await T(page, 'unit-act-grammar').click()
    for (let i = 0; i < U2.grammar.items.length; i++) { const c = U2.grammar.items[i].correct; await T(page, `unit-grammar-q-${i}-opt-${Array.isArray(c) ? c[0] : c}`).click() }
    r.check(`${name} Unit 2 문형 ${U2.grammar.items.length}문항 끝`, !!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })), await txt(page, 'unit-activity-status'))
    await T(page, 'unit-activity-return').click()
    // Unit 간 격리: Unit 1 기록은 비어 있고, Unit 1 화면은 처음 상태
    const rec = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), recordsKey(QA_STUDENT_ID))
    r.check(`${name} 기록은 Unit id별로 분리(Unit 2만 있음)`, !!rec[U2.id]?.activities?.speaking?.completed && !!rec[U2.id]?.activities?.writing?.completed && !rec[U.id])
    await T(page, 'unit-home').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} ← 목록은 같은 단계의 Unit 목록으로(선택은 세션 상태, 저장 안 함)`, (await T(page, 'unit-list').getAttribute('data-level')) === 'unit' && !(await page.evaluate(() => Object.keys(localStorage).some((k) => /level|block|course/i.test(k)))))
    await T(page, `unit-pick-${U.id}`).click()
    await T(page, 'unit-screen').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} Unit 1 화면: 제목·다음=어휘·말하기/쓰기 미완료(섞이지 않음)`, (await txt(page, 'unit-title')) === U.titleKo && (await T(page, 'unit-screen').getAttribute('data-next')) === 'vocab' && (await T(page, 'unit-act-speaking').getAttribute('data-completed')) === 'false' && (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'false', `next=${await T(page, 'unit-screen').getAttribute('data-next')} sp=${await T(page, 'unit-act-speaking').getAttribute('data-completed')} wr=${await T(page, 'unit-act-writing').getAttribute('data-completed')}`)
    await T(page, 'unit-act-review').click()
    r.check(`${name} Unit 1 복습 문항은 Unit 1 것(Unit 2 문장 없음)`, (await txt(page, 'unit-review-0')).includes(U.review[0].situationKo) && !(await inDom(page, U2.speaking.steps[2].model)))
    await T(page, 'unit-activity-back').click()
    await T(page, 'unit-home').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, `unit-pick-${U2.id}`).click()
    await T(page, 'unit-screen').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} Unit 2 재진입: 말하기·쓰기·문형 완료 유지`, (await T(page, 'unit-act-speaking').getAttribute('data-completed')) === 'true' && (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'true' && (await T(page, 'unit-act-grammar').getAttribute('data-completed')) === 'true')
    // 새로고침 뒤에도 기기 기록 유지, 다른 학생 UUID 기록은 보이지 않음
    await page.evaluate(([k, uid]) => localStorage.setItem(k, JSON.stringify({ [uid]: { activities: { vocab: { completed: true } } } })), [recordsKey('e2e00000-0000-4000-8000-0000000000ff'), U2.id])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await loginOnly(page)
    await openUnit(U2.id)
    r.check(`${name} 새로고침 뒤 Unit 2 기록 유지, 다른 UUID의 어휘 완료는 섞이지 않음`, (await T(page, 'unit-act-speaking').getAttribute('data-completed')) === 'true' && (await T(page, 'unit-act-vocab').getAttribute('data-completed')) === 'false' && (await T(page, 'unit-screen').getAttribute('data-next')) === 'vocab')
    await goHome()
  })

  for (const vp of [{ width: 360, height: 640 }, { width: 412, height: 915 }]) {
    await scenario('f Unit 2 레이아웃', vp, async ({ page, name, openUnit }) => {
      await openUnit(U2.id)
      r.check(`${name} Unit 2 화면 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'unit-screen')).length === 0, (await smallButtons(page, 'unit-screen')).join(','))
      await T(page, 'unit-act-speaking').click()
      await T(page, 'unit-speaking-next').click()
      r.check(`${name} 물건 바꾸기 단계 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'unit-activity')).length === 0, (await smallButtons(page, 'unit-activity')).join(','))
    })
  }

  await scenario('h 인접 단계: C1 기초(Unit 2) vs C2 발전(Unit 3) — 같은 목표, 다른 수행', VP, async ({ page, name, openUnit, goHome }) => {
    await openUnit(U3.id)
    r.check(`${name} Unit 3 개요: C2·궁금한 것 묻기·말하기 발전·쓰기 발전`, (await txt(page, 'unit-title')) === U3.titleKo && (await txt(page, 'unit-screen')).includes('2단계') && (await txt(page, 'unit-screen')).includes(U3.goalTitleKo))
    await T(page, 'unit-act-speaking').click()
    const st3 = U3.speaking.steps
    r.check(`${name} 1단계 따라 하기: 3턴(질문→짧은 답→되묻기)`, (await page.locator('[data-testid^="unit-speaking-line-"]').count()) === 3 && (await txt(page, 'unit-speaking-line-1')).startsWith("No, it isn't"))
    await T(page, 'unit-speaking-next').click()
    r.check(`${name} 2단계: Is it ___? 틀 + 되묻기 틀`, (await txt(page, 'unit-speaking-swap-en')).startsWith('Is it ') && (await txt(page, 'unit-speaking-swap-reply')).includes('What about'))
    await T(page, 'unit-speaking-next').click()
    const rc = st3[2]
    r.check(`${name} 3단계: 한국어 상황만, 모범·대답·후속 답 영어 전부 DOM 없음`, !(await inDom(page, rc.model)) && !(await inDom(page, rc.reply.en)) && !(await inDom(page, rc.followUp.model)) && (await T(page, 'unit-speaking-followup').count()) === 0)
    await T(page, 'unit-speaking-reveal').click()
    r.check(`${name} 1차 답 확인: 모범·미아 되묻기 보임, 후속 답은 아직 숨김`, (await txt(page, 'unit-speaking-answer-en')) === rc.model && (await txt(page, 'unit-speaking-answer-reply')).includes(rc.reply.en) && (await T(page, 'unit-speaking-followup').getAttribute('data-revealed')) === 'false' && !(await inDom(page, rc.followUp.model)))
    await T(page, 'unit-speaking-followup-reveal').click()
    r.check(`${name} 2차 답 확인: 되물음에 대한 답 + 대체`, (await txt(page, 'unit-speaking-followup-en')) === rc.followUp.model && (await txt(page, 'unit-speaking-followup')).includes(rc.followUp.alternatives[0]))
    await T(page, 'unit-speaking-to-writing').click()
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 쓰기: Unit 3 전용 문항(2~3문장), Unit 2 문항 아님`, (await T(page, 'writing-flow').getAttribute('data-item')) === 'w-c2-find' && (await txt(page, 'writing-flow')).includes('2~3문장'))
    await T(page, 'writing-input').fill("It isn't under the desk. It's in the bag.")
    await T(page, 'writing-compare').click()
    r.check(`${name} 비교: 예시는 비교용 하나, 판정 없음`, (await txt(page, 'writing-flow')).includes(U3.activities.find((a) => a.kind === 'writing') ? "It isn't under the desk." : '') && !/점수|합격|틀렸/.test(await txt(page, 'writing-flow')))
    await T(page, 'writing-next').click()
    await waitUntil(() => T(page, 'unit-screen').isVisible(), { timeout: 10000 })
    await waitUntil(async () => (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'true', { timeout: 5000 }) // 복귀 직후 기록 반영(returnedFrom effect) 대기
    r.check(`${name} '← 이 단원으로' → Unit 3, 쓰기 '해 봤어요'`, (await T(page, 'unit-screen').getAttribute('data-unit')) === U3.id && (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'true')
    // 같은 상황 가족의 C1 Unit 2는 그대로(기록·문항 안 섞임)
    await T(page, 'unit-home').click()
    await T(page, 'unit-list-back').click()
    await T(page, 'unit-block-C1').click()
    await T(page, `unit-pick-${U2.id}`).click()
    await T(page, 'unit-screen').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} Unit 2(C1 기초) 화면: 말하기·쓰기 미완료, 목록 표기 기초`, (await T(page, 'unit-act-speaking').getAttribute('data-completed')) === 'false' && (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'false')
    await T(page, 'unit-act-speaking').click()
    await T(page, 'unit-speaking-next').click(); await T(page, 'unit-speaking-next').click()
    r.check(`${name} Unit 2 회상: Where's my …? 한 문장, followUp 없음(기초)`, (await T(page, 'unit-speaking-followup').count()) === 0 && !(await inDom(page, U3.speaking.steps[2].model)))
    await T(page, 'unit-speaking-reveal').click()
    r.check(`${name} Unit 2 모범은 Unit 2 것`, (await txt(page, 'unit-speaking-answer-en')) === U2.speaking.steps[2].model && (await T(page, 'unit-speaking-followup').count()) === 0)
    const rec = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), recordsKey(QA_STUDENT_ID))
    r.check(`${name} 기록은 Unit별 분리(Unit 3 쓰기·Unit 2 말하기만)`, !!rec[U3.id]?.activities?.writing?.completed && !rec[U3.id]?.activities?.speaking?.completed === false && !!rec[U2.id]?.activities?.speaking?.completed && !rec[U2.id]?.activities?.writing)
    await T(page, 'unit-activity-return').click()
    await goHome()
  })

  await scenario('i 오늘의 학습(의도 없음): 이야기 카드 연습+쓰기 버튼, ← 홈이 선택을 지움', VP, async ({ page, name }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'student-home-unit').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 오늘의 학습 선택기: 의도 없음(data-intent=none), 과정 단계에서 시작`, (await T(page, 'unit-list').getAttribute('data-intent')) === 'none' && (await T(page, 'unit-list').getAttribute('data-level')) === 'course')
    await T(page, 'unit-course-conversation').click()
    await T(page, 'unit-block-C1').click()
    r.check(`${name} 이야기 카드 ep01: 연습 시작 + 한 문장 이야기 + 문장 쓰기 버튼이 모두 보임(의도 없음)`, (await T(page, 'story-practice-ep01').isVisible()) && (await T(page, 'story-key-ep01').isVisible()) && (await T(page, 'story-write-ep01').isEnabled()))
    await T(page, 'unit-list-home').click()
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'student-home-unit').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} ← 홈 뒤 다시 들어오면 과정 선택부터(선택 지워짐)`, (await T(page, 'unit-list').getAttribute('data-level')) === 'course' && (await T(page, 'unit-block-C1').count()) === 0)
    r.check(`${name} 선택 저장 키 없음`, !(await page.evaluate(() => Object.keys(localStorage).some((k) => /level|block|course|selection/i.test(k)))))
  })

  await scenario('j 홈 말하기·쓰기 의도로 Unit을 바로 열기, 기록은 Unit별 분리', VP, async ({ page, name }) => {
    const pickFromHome = async (menu, courseId, blockId, entryId) => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, `student-home-menu-${menu}`).click()
      await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 15000 })
      await T(page, `unit-course-${courseId}`).click()
      await T(page, `unit-block-${blockId}`).click()
      await T(page, `unit-pick-${entryId}`).click()
    }
    // 말하기 의도 + Unit 1(빌리기): 2화 한 문장 흐름이 바로 열리고 ← 메뉴는 Unit 개요로
    await pickFromHome('speaking', 'conversation', 'C1', U.id)
    await T(page, 'key-flow').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 말하기 의도 + Unit 1 → Unit 개요를 거치지 않고 한 문장 흐름(spoon)`, (await T(page, 'key-scene').getAttribute('data-variant')) === 'spoon' && (await T(page, 'unit-screen').count()) === 0)
    await T(page, 'key-back').click()
    r.check(`${name} ← 메뉴 → Unit 1 개요(활동을 다시 열지 않음)`, !!(await waitUntil(() => T(page, 'unit-screen').isVisible(), { timeout: 10000 })) && (await T(page, 'unit-activity').count()) === 0 && (await T(page, 'key-flow').count()) === 0)
    await goHomeFromUnit(page)
    // 말하기 의도 + Unit 2(잃어버린 물건): Unit 안 3단계 말하기가 바로 열린다
    await pickFromHome('speaking', 'conversation', 'C1', U2.id)
    await T(page, 'unit-activity').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 말하기 의도 + Unit 2 → 이 Unit의 말하기 활동(unit-activity speaking, 3단계 중 1번째)`, (await T(page, 'unit-activity').getAttribute('data-kind')) === 'speaking' && (await T(page, 'unit-speaking').getAttribute('data-step')) === 'repeat' && (await T(page, 'unit-screen').count()) === 0)
    await T(page, 'unit-speaking-next').click(); await T(page, 'unit-speaking-next').click()
    await T(page, 'unit-speaking-reveal').click()
    r.check(`${name} 3단계 답 확인 → 말하기 '해 봤어요'`, !!(await waitUntil(async () => (await txt(page, 'unit-activity-status')).includes('해 봤어요'), { timeout: 5000 })))
    await T(page, 'unit-activity-back').click()
    r.check(`${name} ← 단원 → Unit 2 개요(말하기 다시 열리지 않음)`, (await T(page, 'unit-screen').isVisible()) && (await T(page, 'unit-activity').count()) === 0 && (await T(page, 'unit-screen').getAttribute('data-unit')) === U2.id)
    await T(page, 'unit-home').click()
    r.check(`${name} ← 목록 → 같은 과정·단계(회화 1단계) 목록`, (await T(page, 'unit-list').getAttribute('data-level')) === 'unit' && (await txt(page, 'unit-list-crumb')).includes('Conversation') && (await txt(page, 'unit-list-crumb')).includes('1단계'))
    await T(page, 'unit-list-home').click()
    // 쓰기 의도 + Unit 3(함께 찾기, C2): 쓰기 문항이 바로 열린다
    await pickFromHome('writing', 'conversation', 'C2', U3.id)
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 쓰기 의도 + Unit 3 → Unit 개요 없이 쓰기 문항 w-c2-find`, (await T(page, 'writing-flow').getAttribute('data-item')) === 'w-c2-find' && (await T(page, 'unit-screen').count()) === 0)
    await T(page, 'writing-input').fill("It isn't under the desk. It's in the bag.")
    await T(page, 'writing-compare').click()
    r.check(`${name} 비교 뒤 버튼은 '← 이 단원으로'`, (await txt(page, 'writing-next')) === '← 이 단원으로')
    await T(page, 'writing-next').click()
    await waitUntil(async () => (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'true', { timeout: 5000 }) // 복귀 직후 기록 반영(returnedFrom effect) 대기
    r.check(`${name} '← 이 단원으로' → Unit 3 개요(쓰기 다시 열리지 않음)`, !!(await waitUntil(() => T(page, 'unit-screen').isVisible(), { timeout: 10000 })) && (await T(page, 'unit-screen').getAttribute('data-unit')) === U3.id && (await T(page, 'writing-flow').count()) === 0 && (await T(page, 'unit-act-writing').getAttribute('data-completed')) === 'true')
    const rec = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), recordsKey(QA_STUDENT_ID))
    r.check(`${name} 기록은 Unit별 분리(Unit 1 말하기, Unit 2 말하기, Unit 3 쓰기만; 서로 섞이지 않음)`, !!rec[U.id]?.activities?.speaking?.completed && !!rec[U2.id]?.activities?.speaking?.completed && !rec[U2.id]?.activities?.writing && !!rec[U3.id]?.activities?.writing?.completed && !rec[U3.id]?.activities?.speaking && !rec[U.id]?.activities?.writing, JSON.stringify(Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, Object.keys(v.activities || {})]))))
    r.check(`${name} 이름·선택 키 없음(localStorage)`, !(await page.evaluate((n) => Object.keys(localStorage).some((k) => k.includes(n) || /level|block|course|selection/i.test(k)), QA_STUDENT_NAME)))
  })

  const toGrammarList = async (page) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'student-home-grammar').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 15000 })
  }

  await scenario('k 문법 진입(홈 📘 → 과정 → 레벨 → 단원 → 문형 활동 바로)', VP, async ({ page, name }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort())
    await toGrammarList(page)
    r.check(`${name} 문법 선택기: data-intent=grammar, 과정 단계, 제목 '문법'`, (await T(page, 'unit-list').getAttribute('data-intent')) === 'grammar' && (await T(page, 'unit-list').getAttribute('data-level')) === 'course' && (await txt(page, 'unit-list')).includes('문법'))
    r.check(`${name} 회화 과정만 활성`, await T(page, 'unit-course-conversation').isEnabled())
    for (const c of EMPTY_COURSES) {
      r.check(`${name} 과정 ${c}: 비활성 + '${EMPTY_LABEL_KO}'`, (await T(page, `unit-course-${c}`).isDisabled()) && (await txt(page, `unit-course-${c}`)).includes(EMPTY_LABEL_KO))
    }
    r.check(`${name} 비활성 과정이 5개`, EMPTY_COURSES.length === 5, String(EMPTY_COURSES.length))
    await T(page, 'unit-course-conversation').click()
    r.check(`${name} 레벨 C1·C2 활성`, (await T(page, 'unit-block-C1').isEnabled()) && (await T(page, 'unit-block-C2').isEnabled()))
    for (const b of ['C3', 'C4', 'C5', 'C6']) {
      r.check(`${name} 레벨 ${b}: 비활성 + '${EMPTY_LABEL_KO}'(이야기는 문법에서 제외)`, (await T(page, `unit-block-${b}`).isDisabled()) && (await txt(page, `unit-block-${b}`)).includes(EMPTY_LABEL_KO))
    }
    await T(page, 'unit-block-C1').click()
    r.check(`${name} 단원 목록 안내 문구 '어떤 단원의 문법을 볼까요?'`, (await txt(page, 'unit-list')).includes('어떤 단원의 문법을 볼까요?'))
    const picks = await page.locator('[data-testid^="unit-pick-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    r.check(`${name} C1 목록은 Unit 2개만(이야기 카드 없음)`, JSON.stringify([...picks].sort()) === JSON.stringify([`unit-pick-${U.id}`, `unit-pick-${U2.id}`].sort()) && (await page.locator('[data-kind="story"]').count()) === 0, picks.join(','))
    const sub = await txt(page, `unit-pick-${U.id}`)
    r.check(`${name} 보조 줄: 📘 문형 제목 · 관찰 ${U.grammar.noticing.length} · 문항 ${U.grammar.items.length}`, sub.includes('📘') && sub.includes(act("grammar").titleKo) && sub.includes(`관찰 ${U.grammar.noticing.length}`) && sub.includes(`문항 ${U.grammar.items.length}`) && sub.includes('Can I borrow'), sub)
    await T(page, `unit-pick-${U.id}`).click()
    await T(page, 'unit-activity').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 단원 선택 → 개요 없이 문형 활동(data-kind=grammar)`, (await T(page, 'unit-activity').getAttribute('data-kind')) === 'grammar' && (await T(page, 'unit-screen').count()) === 0)
    r.check(`${name} 진짜 GrammarActivity: 관찰 ${U.grammar.noticing.length}개 + 문항 ${U.grammar.items.length}개`, (await page.locator('[data-testid^="unit-grammar-notice-"][data-testid$="-open"]').count()) === U.grammar.noticing.length && (await page.locator('[data-testid^="unit-grammar-q-"][data-answered]').count()) === U.grammar.items.length)
    await T(page, 'unit-grammar-q-0-opt-0').click()
    r.check(`${name} 문항 1개 답하면 data-answered=true + 해설 표시`, (await T(page, 'unit-grammar-q-0').getAttribute('data-answered')) === 'true' && (await T(page, 'unit-grammar-q-0-why').isVisible()))
    await T(page, 'unit-activity-back').click()
    await T(page, 'unit-screen').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} ← 단원 → 개요(data-unit=${U.id}), 활동 다시 열리지 않음`, (await T(page, 'unit-screen').getAttribute('data-unit')) === U.id && (await T(page, 'unit-activity').count()) === 0)
    await T(page, 'unit-home').click()
    await T(page, 'unit-list').waitFor({ state: 'visible', timeout: 10000 })
    const crumb = await txt(page, 'unit-list-crumb')
    r.check(`${name} ← 목록 → 같은 선택(회화 1단계), 의도 grammar 유지`, (await T(page, 'unit-list').getAttribute('data-level')) === 'unit' && (await T(page, 'unit-list').getAttribute('data-intent')) === 'grammar' && crumb.includes('Conversation') && crumb.includes('1단계'), crumb)
    await T(page, 'unit-list-home').click()
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} ← 홈 → 학생 홈`, await T(page, 'student-home-grammar').isVisible())
    const keysAfter = await page.evaluate(() => Object.keys(localStorage).sort())
    const added = keysAfter.filter((k) => !keysBefore.includes(k))
    r.check(`${name} localStorage 새 키는 Unit 기록 키뿐(선택 저장 없음)`, added.every((k) => k === recordsKey(QA_STUDENT_ID)) && !keysAfter.some((k) => /level|block|course|selection/i.test(k)), added.join(','))
  })

  for (const vp of [{ width: 360, height: 640 }, { width: 412, height: 915 }]) {
    await scenario('k 문법 선택기 레이아웃', vp, async ({ page, name }) => {
      await toGrammarList(page)
      const check = async (label) => r.check(`${name} ${label} 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'unit-list')).length === 0, (await smallButtons(page, 'unit-list')).join(','))
      await check('과정')
      await T(page, 'unit-course-conversation').click(); await check('레벨')
      await T(page, 'unit-block-C1').click(); await check('단원(문법 보조 줄)')
    })
  }

  await scenario('g Unit 청크 로드 실패 → 안내·홈 복귀', VP, async ({ page, name }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    await page.route('**/assets/units-*.js', (route) => route.abort())
    // 1차 실패: 기존 stale-chunk 자동 복구(main.jsx vite:preloadError → 가드 기록 → 새로고침)가 먼저 동작한다 — 세션 복원으로 홈이 다시 뜬다
    const reloaded = page.waitForEvent('framenavigated', { timeout: 20000 }).then(() => true).catch(() => false)
    await T(page, 'student-home-unit').click()
    const didReload = await reloaded
    const safeEval = (fn) => page.evaluate(fn).catch(() => null)
    r.check(`${name} 1차 실패 → 기존 stale-chunk 가드 기록 + 자동 새로고침(홈 복원)`, didReload && !!(await waitUntil(async () => (await safeEval(() => performance.getEntriesByType('navigation')[0]?.type)) === 'reload' && !!(await safeEval(() => sessionStorage.getItem('paulEasyVoca_staleChunkReloadAt'))) && (await T(page, 'student-home').isVisible().catch(() => false)), { timeout: 20000 })))
    // 2차 실패(가드 활성 → 새로고침 안 함): 226차 안내 화면
    await T(page, 'student-home-unit').click()
    r.check(`${name} 2차 실패 → 빈 화면 대신 안내(unit-load-failed) + 홈 버튼`, !!(await waitUntil(() => T(page, 'unit-load-failed').isVisible(), { timeout: 15000 })) && (await txt(page, 'unit-load-failed')).includes('불러오지 못했어요') && (await T(page, 'unit-load-home').isVisible()))
    r.check(`${name} 안내는 '새로고침'(한 번 실패한 import는 새로고침 전까지 실패로 남음) + 새로고침 버튼`, (await txt(page, 'unit-load-failed')).includes('새로고침') && (await T(page, 'unit-load-reload').isVisible()))
    await T(page, 'unit-load-home').click()
    r.check(`${name} ← 홈으로 → 학생 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 10000 })))
    await T(page, 'student-home-unit').click()
    r.check(`${name} 같은 페이지에서 다시 열면 여전히 안내(브라우저 모듈 캐시) — 빈 화면 아님`, !!(await waitUntil(() => T(page, 'unit-load-failed').isVisible(), { timeout: 15000 })))
    await page.unroute('**/assets/units-*.js')
    const reloaded2 = page.waitForEvent('framenavigated', { timeout: 20000 }).then(() => true).catch(() => false)
    await T(page, 'unit-load-reload').click()
    r.check(`${name} 🔄 새로고침 → 홈 복원`, (await reloaded2) && !!(await waitUntil(() => T(page, 'student-home').isVisible().catch(() => false), { timeout: 20000 })))
    await T(page, 'student-home-unit').click()
    r.check(`${name} 새로고침 뒤 다시 열면 목록 로드`, !!(await waitUntil(() => T(page, 'unit-list').isVisible(), { timeout: 15000 })))
  })

  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 1280, height: 800 }]) {
    await scenario('d 레이아웃', vp, async ({ page, name, openUnit }) => {
      await openUnit()
      r.check(`${name} Unit 화면 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'unit-screen')).length === 0, (await smallButtons(page, 'unit-screen')).join(','))
      await T(page, `unit-act-${act('reading').id}`).click()
      r.check(`${name} 읽기 활동 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'unit-activity')).length === 0, (await smallButtons(page, 'unit-activity')).join(','))
      await T(page, 'unit-activity-back').click()
      await T(page, `unit-act-${act('listening').id}`).click()
      r.check(`${name} 듣기 활동 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'unit-activity')).length === 0)
    })
  }

  return { results: r.results, unmockedRequests, mockErrors }
}
