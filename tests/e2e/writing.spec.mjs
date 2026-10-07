// 2026-10-07(222차) Writing 첫 버전 브라우저 시나리오 — QA 계정 홈 ✍️ → 주제 → 문항 → 직접 쓰기 → 예시 비교 → 고치기,
// 재진입·계정 분리(UUID 키)·Speaking [이 표현 써보기] 왕복·360/390/412/1280 레이아웃. 네트워크 전체 mock(installMocks).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { WRITING_ITEMS, writingItem } from '../../src/utils/writing/writingItems.js'
import { draftsKey } from '../../src/utils/writing/writingDrafts.js'

const VP = { width: 390, height: 844 }
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const smallButtons = (page, rootId) => page.locator(`[data-testid="${rootId}"] button`).evaluateAll((els) =>
  els.filter((el) => el.offsetParent !== null).map((el) => [el.textContent.trim().slice(0, 20), el.getBoundingClientRect().height]).filter(([, h]) => h < 44).map(([t, h]) => `${t}:${Math.round(h)}`))
const inDom = (page, text) => page.evaluate((t) => document.documentElement.outerHTML.includes(t), text)
async function waitUntil(fn, { timeout = 15000, interval = 100 } = {}) {
  const start = Date.now(); let last
  while (Date.now() - start < timeout) { last = await fn(); if (last) return last; await new Promise((r) => setTimeout(r, interval)) }
  return last
}
async function loginOnly(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
function badWrites(apiCallLog) {
  const path = (u) => { try { return new URL(u).pathname } catch { return u.split('?')[0] } }
  return apiCallLog.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => !LOGIN_WRITES.includes(path(c.url))).map((c) => `${c.method} ${path(c.url)}`)
}
const W = writingItem('w-s02-03')

export async function run(browser, baseURL) {
  const r = createRecorder('[writing]')
  const unmockedRequests = []
  const mockErrors = []

  async function scenario(label, vp, { seed = null } = {}, body) {
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    if (seed) await page.addInitScript((s) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v) } catch { /* 무시 */ } }, seed)
    const { unmockedRequests: u, apiCallLog } = await installMocks(page)
    const name = `${label} [${vp.width}x${vp.height}]`
    const openTopics = async () => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-menu-writing').click()
      await T(page, 'writing-topics').waitFor({ state: 'visible', timeout: 15000 })
    }
    const openItem = async (topic, wId) => {
      await openTopics()
      await T(page, `writing-topic-${topic}`).click()
      await T(page, `writing-item-${wId}`).click()
      await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 5000 })
    }
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, openTopics, openItem })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인 외 REST 쓰기 0건(답안·이름 외부 전송 없음)`, bad.length === 0, bad.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      await context.close()
    }
    unmockedRequests.push(...u)
  }

  // ── a. 주제·문항 목록 ──
  await scenario('a 주제·문항', VP, {}, async ({ page, name, openTopics }) => {
    await openTopics()
    const ids = await page.locator('[data-testid^="writing-topic-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    r.check(`${name} 주제는 학교생활·쇼핑 2개뿐(빈 주제 없음)`, ids.join(',') === 'writing-topic-school,writing-topic-shopping')
    r.check(`${name} 임시 저장·미전송 안내`, (await txt(page, 'writing-storage-note')).includes('자동 전송되지 않아요'))
    await T(page, 'writing-topic-school').click()
    r.check(`${name} 학교생활 문항 5개, 영어 없음(안내만)`, (await page.locator('[data-testid^="writing-item-"]').count()) === 5 && !/[A-Za-z]/.test(await txt(page, 'writing-items')))
    await T(page, 'writing-items-back').click()
    r.check(`${name} ← 주제`, await T(page, 'writing-topics').isVisible())
    await T(page, 'writing-home').click()
    r.check(`${name} ← 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 5000 })))
  })

  // ── b. 쓰기 → 비교 → 고치기 ──
  await scenario('b 쓰기 흐름', VP, {}, async ({ page, name, openItem }) => {
    await openItem('school', 'w-s02-03')
    r.check(`${name} 상황·안내 보임, 예시 영어·대체 답안·듣기는 DOM에 없음`, (await txt(page, 'writing-situation')).includes(W.situationKo) && (await txt(page, 'writing-prompt')).includes(W.promptKo) && !(await inDom(page, W.en)) && (await T(page, 'writing-listen').count()) === 0 && !(await inDom(page, W.alternatives[0])))
    r.check(`${name} 빈 입력: 비교 버튼 비활성`, await T(page, 'writing-compare').isDisabled())
    await T(page, 'writing-input').fill('   \n ')
    r.check(`${name} 공백만: 비교 버튼 비활성`, await T(page, 'writing-compare').isDisabled())
    await T(page, 'writing-help-btn').click()
    r.check(`${name} 도움 보기 → 단어만(문장 전체 아님)`, (await txt(page, 'writing-help')).includes(W.hintWords[0]) && !(await inDom(page, W.en)))
    await T(page, 'writing-input').fill('can i borrow pencil')
    r.check(`${name} 입력 후 비교 가능`, await T(page, 'writing-compare').isEnabled())
    await T(page, 'writing-compare').click()
    r.check(`${name} 비교: 내 문장 유지(도움 보고 썼어요) + 예시·뜻·듣기·대체 답안·설명·상대 대답`, (await txt(page, 'writing-first')) === 'can i borrow pencil' && (await txt(page, 'writing-mine')).includes('도움 보고 썼어요') && (await txt(page, 'writing-example-en')) === W.en && (await T(page, 'writing-listen').isVisible()) && (await txt(page, 'writing-alternatives')).includes(W.alternatives[0]) && (await txt(page, 'writing-note')).length > 0 && (await txt(page, 'writing-reply')).includes(W.reply.en))
    r.check(`${name} 예시는 유일한 정답 아님·채점 문구 없음·선생님 확인은 안내만`, (await txt(page, 'writing-same')).includes('다른 말도 괜찮아요') && !/정답|합격|숙달|점수|오답|틀렸/.test(await txt(page, 'writing-flow')) && (await txt(page, 'writing-teacher-note')).includes('확인 기록을 저장하지 않아요'))
    await T(page, 'writing-revise').click()
    r.check(`${name} 고치기: 입력창에 내 문장 미리 채움`, (await T(page, 'writing-revise-input').inputValue()) === 'can i borrow pencil')
    await T(page, 'writing-revise-input').fill('Can I borrow a pencil?')
    await T(page, 'writing-revise-save').click()
    r.check(`${name} 저장 후 수정 전/후 함께 보임, 예시와 같은 문장 표시`, (await txt(page, 'writing-first')) === 'can i borrow pencil' && (await txt(page, 'writing-revised')) === 'Can I borrow a pencil?' && (await txt(page, 'writing-same')).includes('같은 문장'))
    const d = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), draftsKey(QA_STUDENT_ID))
    r.check(`${name} 기기 저장: UUID 키, first/revised/helped/compared만`, d['w-s02-03']?.first === 'can i borrow pencil' && d['w-s02-03']?.revised === 'Can I borrow a pencil?' && d['w-s02-03']?.helped === true && d['w-s02-03']?.compared === true && !/score|correct|pass|teacher/i.test(JSON.stringify(d)))
    r.check(`${name} 이름 키 없음`, !(await page.evaluate((n) => Object.keys(localStorage).some((k) => k.includes(n)), QA_STUDENT_NAME)))
    await T(page, 'writing-next').click()
    r.check(`${name} 다음 문장 → 다음 문항(예시 다시 숨김)`, (await T(page, 'writing-flow').getAttribute('data-item')) === 'w-s02-08' && (await T(page, 'writing-flow').getAttribute('data-step')) === 'write' && (await T(page, 'writing-example').count()) === 0)
    await T(page, 'writing-back').click()
    await T(page, 'writing-item-w-s02-08').click()
    await T(page, 'writing-input').fill('How do you spell')
    await T(page, 'writing-back').click()
    await T(page, 'writing-item-w-s02-08').click()
    r.check(`${name} 비교 전 ← 목록 → 쓰던 문장 보관(비교 안 함 상태)`, (await T(page, 'writing-flow').getAttribute('data-step')) === 'write' && (await T(page, 'writing-input').inputValue()) === 'How do you spell')
    await T(page, 'writing-back').click()
    r.check(`${name} ← 목록 → 문항 목록, 쓴 문장 표시`, (await T(page, 'writing-items').isVisible()) && (await page.locator('[data-testid="writing-item-w-s02-03"] [data-testid="writing-item-saved"]').textContent()).includes('비교했어요'))
    await T(page, 'writing-item-w-s02-03').click()
    r.check(`${name} 재진입: 비교 상태 복원(내 문장·고친 문장)`, (await T(page, 'writing-flow').getAttribute('data-step')) === 'compare' && (await txt(page, 'writing-first')) === 'can i borrow pencil' && (await txt(page, 'writing-revised')) === 'Can I borrow a pencil?')
  })

  // ── c. 혼자 쓰기 + 계정 분리 ──
  const otherSeed = JSON.stringify({ 'w-s02-03': { first: 'OTHER STUDENT', revised: '', helped: false, compared: true } })
  await scenario('c 혼자 쓰기·계정 분리', VP, { seed: { [draftsKey('e2e00000-0000-4000-8000-00000000a002')]: otherSeed } }, async ({ page, name, openItem }) => {
    await openItem('school', 'w-s02-03')
    r.check(`${name} 다른 학생(UUID) 초안은 보이지 않음(새로 쓰기)`, (await T(page, 'writing-flow').getAttribute('data-step')) === 'write' && !(await inDom(page, 'OTHER STUDENT')))
    await T(page, 'writing-input').fill('Can I use your pencil?')
    await T(page, 'writing-compare').click()
    r.check(`${name} 혼자 썼어요 표시, 예시와 다른 문장이어도 오답 아님`, (await txt(page, 'writing-mine')).includes('혼자 썼어요') && (await txt(page, 'writing-same')).includes('다른 말도 괜찮아요') && !/오답|틀렸/.test(await txt(page, 'writing-flow')))
    const other = await page.evaluate((k) => localStorage.getItem(k), draftsKey('e2e00000-0000-4000-8000-00000000a002'))
    r.check(`${name} 다른 학생 초안 무변경`, other === otherSeed)
  })

  // ── d. Speaking 연습 끝 → 이 표현 써보기 → 돌아오기 ──
  await scenario('d Speaking 연결', VP, {}, async ({ page, name }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'student-home-menu-speaking').click()
    await T(page, 'speaking-topics').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'topic-school').click()
    await T(page, 'story-start-ep02').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    for (let i = 0; i < 12; i++) await T(page, 'practice-next').click()
    r.check(`${name} 2화 연습 끝: [이 표현 써보기]`, await T(page, 'practice-write').isVisible())
    await T(page, 'practice-write').click()
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} → 2화 핵심 표현의 Writing 문항(w-s02-03)`, (await T(page, 'writing-flow').getAttribute('data-item')) === 'w-s02-03')
    await T(page, 'writing-back').click()
    r.check(`${name} ← 목록 → 원래 Speaking 2화 연습 끝 화면`, !!(await waitUntil(() => T(page, 'practice-done').isVisible(), { timeout: 10000 })) && ((await T(page, 'speaking-practice').getAttribute('data-expr')) || '').startsWith('s02-'))
    // 링크로 다시 들어가 다음 문항 → ← 목록 → ← 주제 → ← 홈은 홈으로(Speaking이 아님)
    await T(page, 'practice-write').click()
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'writing-input').fill('Can I borrow a pencil?')
    await T(page, 'writing-compare').click()
    await T(page, 'writing-next').click()
    await T(page, 'writing-back').click()
    await T(page, 'writing-items-back').click()
    await T(page, 'writing-home').click()
    r.check(`${name} 링크 진입 뒤 주제 화면 ← 홈 → 학생 홈`, !!(await waitUntil(() => T(page, 'student-home').isVisible(), { timeout: 10000 })))
    await T(page, 'student-home-menu-speaking').click()
    await T(page, 'speaking-topics').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'topic-school').click()
    await T(page, 'story-start-ep02').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    for (let i = 0; i < 12; i++) await T(page, 'practice-next').click()
    await T(page, 'practice-write').click()
    await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'writing-back').click()
    r.check(`${name} ← 목록 → 원래 Speaking 2화 연습 끝 화면`, !!(await waitUntil(() => T(page, 'practice-done').isVisible(), { timeout: 10000 })) && ((await T(page, 'speaking-practice').getAttribute('data-expr')) || '').startsWith('s02-'))
    await T(page, 'practice-back-menu').click()
    await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'speaking-menu-practice').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 복귀 뒤 같은 세트 연습을 다시 열면 1번부터(끝 화면 아님)`, (await T(page, 'practice-done').count()) === 0 && (await T(page, 'speaking-practice').getAttribute('data-expr')) === 's02-01')
    await T(page, 'speaking-back').click()
    await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'speaking-menu-home').click()
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'student-home-menu-writing').click()
    r.check(`${name} 홈에서 문장 쓰기 → 주제 화면(링크 초기화)`, !!(await waitUntil(() => T(page, 'writing-topics').isVisible(), { timeout: 10000 })))
    await T(page, 'writing-home').click()
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'student-home-menu-speaking').click()
    await T(page, 'speaking-topics').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'topic-friends').click()
    await T(page, 'story-start-ep03').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    for (let i = 0; i < 11; i++) await T(page, 'practice-next').click()
    r.check(`${name} 3화(Writing 문항 없음) 연습 끝: [이 표현 써보기] 없음`, (await T(page, 'practice-done').isVisible()) && (await T(page, 'practice-write').count()) === 0)
  })

  // ── e. 레이아웃 ──
  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 1280, height: 800 }]) {
    await scenario('e 레이아웃', vp, {}, async ({ page, name, openTopics }) => {
      await openTopics()
      r.check(`${name} 주제 화면 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'writing-topics')).length === 0)
      await T(page, 'writing-topic-shopping').click()
      await T(page, 'writing-item-w-s05-09').click()
      await T(page, 'writing-flow').waitFor({ state: 'visible', timeout: 5000 })
      r.check(`${name} 쓰기 화면 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'writing-flow')).length === 0, (await smallButtons(page, 'writing-flow')).join(','))
      await T(page, 'writing-input').fill('Can we pay for these please this is a very long sentence that should wrap nicely on a narrow screen')
      await T(page, 'writing-compare').click()
      r.check(`${name} 긴 문장 비교 화면 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'writing-flow')).length === 0)
      const btn = await T(page, 'writing-next').boundingBox()
      r.check(`${name} 다음 버튼이 화면 안에`, !!btn && btn.x >= 0 && btn.x + btn.width <= vp.width + 1)
    })
  }

  return { results: r.results, unmockedRequests, mockErrors }
}
