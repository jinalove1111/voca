// tests/e2e/situation.spec.mjs
//
// 상황 보고 말하기(SituationRecall.jsx, 2026-10-04) 회귀 스펙. 말하기 화면의
// `speaking-go-situation` 버튼으로 진입한다. 마이크는 speaking.spec과 같이
// addInitScript로 합성 MediaStream을 쓰고, 기기 로컬 기록은 localStorage 시드로 만든다.
// 실제 네트워크 0건. 파일당 소유권 원칙(규칙 16)에 따라 다른 spec의 헬퍼는 복제한다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { SITUATION_EXPRESSIONS, hintText } from '../../src/utils/situation/situationContent.js'

const VP = { width: 390, height: 844 }
const SMALL = { width: 360, height: 640 }
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const KEY = (id) => `paulEasyVoca_situationRecall_${id}`
const OTHER_ID = 'e2e00000-0000-4000-8000-00000000b002'
const HELLO = SITUATION_EXPRESSIONS[0]
const FORBIDDEN = ['완료', '숙달', '✅', '점수', '⭐']

const ymd = (offsetDays) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const sess = (date, stage, selfReport, hintLevel = 0) => ({ date, scene: stage === 'transfer' ? 'hello-b' : 'hello-a', stage, hintLevel, selfReport, recorded: false })
const rec = (date, sessions) => ({ hello: { lastPracticedDate: date, sessions } })

async function waitUntil(fn, { timeout = 15000, interval = 100 } = {}) {
  const start = Date.now()
  let last
  while (true) {
    try { last = await fn() } catch { last = undefined }
    if (last) return last
    if (Date.now() - start >= timeout) return last
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function installMic(page) {
  await page.addInitScript(() => {
    window.__micTracks = []
    const md = navigator.mediaDevices
    if (!md) return
    md.getUserMedia = async () => {
      const ctx = new AudioContext()
      await ctx.resume().catch(() => {})
      const osc = ctx.createOscillator()
      const dest = ctx.createMediaStreamDestination()
      osc.connect(dest)
      osc.start()
      dest.stream.getTracks().forEach((t) => window.__micTracks.push(t))
      return dest.stream
    }
  })
}

// 시드는 키가 비어 있을 때만 심는다(앱이 쓴 기록을 새 문서 로드가 덮어쓰지 않도록)
async function seedStorage(page, entries) {
  await page.addInitScript((e) => {
    try { for (const [k, v] of Object.entries(e)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v) } catch { /* 무시 */ }
  }, entries)
}

async function setDeviceFlags(page, flags) {
  await page.addInitScript((j) => { try { localStorage.setItem('paulEasyVoca_features', j) } catch { /* 무시 */ } }, JSON.stringify(flags))
}

async function loginOnly(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

const noOverflow = (page, w) => page.evaluate((x) => document.documentElement.scrollWidth <= x, w)
const stage = (page) => T(page, 'situation-recall').getAttribute('data-stage')
const exprId = (page) => T(page, 'situation-recall').getAttribute('data-expr')
const micState = (page) => T(page, 'situation-recall').getAttribute('data-mic-state')
const statusText = async (page) => ((await T(page, 'situation-status').textContent()) || '').trim()
const bodyText = (page) => page.locator('body').innerText()
const tracksEnded = (page) => page.evaluate(() => (window.__micTracks || []).length > 0 && window.__micTracks.every((t) => t.readyState === 'ended'))
const readStore = (page, id = QA_STUDENT_ID) => page.evaluate((k) => localStorage.getItem(k), KEY(id)).then((s) => (s === null ? null : JSON.parse(s)))
const forbiddenIn = (text) => FORBIDDEN.filter((w) => text.includes(w))

export async function run(browser, baseURL) {
  const r = createRecorder('[situation]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  async function scenario(label, vp, { seed, flags, reduced = false } = {}, body) {
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    await installMic(page)
    if (seed) await seedStorage(page, seed)
    if (flags) await setDeviceFlags(page, flags)
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    const { db, unmockedRequests: u, ttsFallbackRequests: t } = await installMocks(page)
    const name = `${label} [${vp.width}x${vp.height}]`
    const openSpeaking = async () => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-menu-speaking').click()
      await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    }
    const openSituation = async () => {
      await openSpeaking()
      await T(page, 'speaking-go-situation').click()
      await T(page, 'situation-recall').waitFor({ state: 'visible', timeout: 10000 })
    }
    const next = () => T(page, 'situation-next').click()
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, openSpeaking, openSituation, next, errors })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
    } catch (err) {
      const text = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(text.slice(0, 300))}`)
    } finally {
      await context.close()
    }
    unmockedRequests.push(...u)
    ttsFallbackRequests.push(...t)
    mockErrors.push(...db.errors)
  }

  // ── 1. 진입/복귀 ─────────────────────────────────────────────────────
  await scenario('1 진입', VP, {}, async ({ page, name, openSpeaking }) => {
    await openSpeaking()
    const b = T(page, 'speaking-go-situation')
    r.check(`${name} 플래그 ON — 버튼 보임`, await b.isVisible())
    const h = (await b.boundingBox())?.height ?? 0
    r.check(`${name} 버튼 높이 >=44px`, h >= 43.5, String(h))
    await b.click()
    await T(page, 'situation-recall').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 진입 → data-stage="intro"`, (await stage(page)) === 'intro', String(await stage(page)))
    await T(page, 'situation-back').click()
    r.check(`${name} situation-back → 말하기 화면`, !!(await waitUntil(() => T(page, 'speaking-practice').isVisible(), { timeout: 5000 })))
    r.check(`${name} 상황 화면 사라짐`, (await T(page, 'situation-recall').count()) === 0)
  })

  // ── 2. 인트로 ────────────────────────────────────────────────────────
  await scenario('2 인트로', VP, {}, async ({ page, name, openSituation }) => {
    await openSituation()
    const ex = (await T(page, 'situation-expression').textContent()) || ''
    r.check(`${name} 첫 표현 EN+KO 표시`, ex.includes(HELLO.en) && ex.includes(HELLO.ko), ex)
    r.check(`${name} data-expr="hello"`, (await exprId(page)) === 'hello')
    const card = T(page, 'scene-card')
    r.check(`${name} scene-card data-final="false"`, (await card.getAttribute('data-final')) === 'false')
    r.check(`${name} 임시 그림 배지 보임 + 문구`, (await T(page, 'scene-temp-badge').isVisible()) && ((await T(page, 'scene-temp-badge').textContent()) || '').includes('임시 그림'))
    r.check(`${name} scene-card aria-label이 "임시 그림."로 시작`, ((await card.getAttribute('aria-label')) || '').startsWith('임시 그림.'), String(await card.getAttribute('aria-label')))
    r.check(`${name} 인트로엔 힌트/자기 보고 없음`, (await T(page, 'situation-hints').count()) === 0 && (await T(page, 'situation-self-can').count()) === 0)
  })

  // ── 3. 회상(힌트) ────────────────────────────────────────────────────
  await scenario('3 회상 힌트', VP, {}, async ({ page, name, openSituation, next }) => {
    await openSituation()
    await next()
    r.check(`${name} data-stage="recall"`, (await stage(page)) === 'recall', String(await stage(page)))
    const txt = await bodyText(page)
    r.check(`${name} 본문에 EN 문장 없음`, !txt.includes(HELLO.en))
    r.check(`${name} 본문에 KO 뜻 없음`, !txt.includes(HELLO.ko))
    r.check(`${name} hint-text 없음`, (await T(page, 'situation-hint-text').count()) === 0)
    r.check(`${name} hint-1 활성, hint-2/3 비활성`, (await T(page, 'situation-hint-1').isEnabled()) && (await T(page, 'situation-hint-2').isDisabled()) && (await T(page, 'situation-hint-3').isDisabled()))
    await T(page, 'situation-hint-1').click()
    const h1 = ((await T(page, 'situation-hint-text').textContent()) || '').trim()
    r.check(`${name} 힌트 1 = 첫 단어 + 밑줄`, h1 === hintText(HELLO.en, 1) && h1.startsWith('Hello!') && h1.includes('___') && !h1.includes('Nice'), h1)
    r.check(`${name} 힌트 1 후 hint-2만 활성`, (await T(page, 'situation-hint-2').isEnabled()) && (await T(page, 'situation-hint-3').isDisabled()))
    await T(page, 'situation-hint-2').click()
    r.check(`${name} 힌트 2 = EN 전체`, ((await T(page, 'situation-hint-text').textContent()) || '').trim() === HELLO.en)
    await T(page, 'situation-hint-3').click()
    r.check(`${name} 힌트 3 = KO 뜻`, ((await T(page, 'situation-hint-text').textContent()) || '').trim() === HELLO.ko)
    r.check(`${name} 힌트 3 후 모든 힌트 비활성`, (await T(page, 'situation-hint-1').isDisabled()) && (await T(page, 'situation-hint-2').isDisabled()) && (await T(page, 'situation-hint-3').isDisabled()))
  })

  // ── 4. 다음 항상 가능 / 자기 보고 / 금지 단어 ────────────────────────
  await scenario('4 다음·자기보고·금지어', VP, {}, async ({ page, name, openSituation, next }) => {
    await openSituation()
    r.check(`${name} 인트로 다음 활성`, await T(page, 'situation-next').isEnabled())
    r.check(`${name} 인트로 금지어 없음`, forbiddenIn(await bodyText(page)).length === 0)
    await next()
    await T(page, 'situation-hint-1').click()
    r.check(`${name} 힌트 중간 + 보고 없음 → 다음 활성`, await T(page, 'situation-next').isEnabled())
    const can = T(page, 'situation-self-can')
    const hard = T(page, 'situation-self-hard')
    r.check(`${name} 보고 전 둘 다 aria-pressed=false`, (await can.getAttribute('aria-pressed')) === 'false' && (await hard.getAttribute('aria-pressed')) === 'false')
    await can.click()
    r.check(`${name} can 선택 → can=true/hard=false`, (await can.getAttribute('aria-pressed')) === 'true' && (await hard.getAttribute('aria-pressed')) === 'false')
    await hard.click()
    r.check(`${name} hard 선택 → can=false/hard=true`, (await can.getAttribute('aria-pressed')) === 'false' && (await hard.getAttribute('aria-pressed')) === 'true')
    r.check(`${name} 회상 금지어 없음`, forbiddenIn(await bodyText(page)).length === 0, forbiddenIn(await bodyText(page)).join(','))
    await next()
    r.check(`${name} data-stage="transfer"`, (await stage(page)) === 'transfer', String(await stage(page)))
    r.check(`${name} 전이 다음 활성`, await T(page, 'situation-next').isEnabled())
    r.check(`${name} 전이 금지어 없음`, forbiddenIn(await bodyText(page)).length === 0, forbiddenIn(await bodyText(page)).join(','))
    await next() // help intro
    await next() // help recall
    r.check(`${name} 새 단계 자기 보고 초기화(aria-pressed=false)`, (await T(page, 'situation-self-hard').getAttribute('aria-pressed')) === 'false')
    for (let i = 0; i < 20 && (await stage(page)) !== 'summary'; i++) await next()
    r.check(`${name} 요약 도달`, (await stage(page)) === 'summary')
    r.check(`${name} 요약 금지어 없음`, forbiddenIn(await bodyText(page)).length === 0, forbiddenIn(await bodyText(page)).join(','))
  })

  // ── 5. 합성 마이크 ───────────────────────────────────────────────────
  await scenario('5 마이크', VP, {}, async ({ page, name, openSituation, next }) => {
    await openSituation()
    await next() // hello recall
    r.check(`${name} 초기 data-mic-state="idle"`, (await micState(page)) === 'idle', String(await micState(page)))
    const idleText = await statusText(page)
    r.check(`${name} 대기 status 비어 있지 않음(단계 안내)`, idleText.length > 0 && !idleText.includes('녹음 중'), idleText)
    await T(page, 'situation-record').click()
    r.check(`${name} 녹음 중 status`, !!(await waitUntil(async () => (await statusText(page)).startsWith('녹음 중이에요'), { timeout: 8000 })), await statusText(page))
    r.check(`${name} data-mic-state="live"`, (await micState(page)) === 'live', String(await micState(page)))
    r.check(`${name} 녹음 중 다음 비활성`, await T(page, 'situation-next').isDisabled())
    r.check(`${name} 녹음 중 돌아가기 비활성`, await T(page, 'situation-back').isDisabled())
    await sleep(1200)
    await T(page, 'situation-stop').click()
    r.check(`${name} 그만 → status "잘했어요"`, !!(await waitUntil(async () => (await statusText(page)).startsWith('잘했어요'), { timeout: 8000 })), await statusText(page))
    r.check(`${name} audio src blob:`, !!(await waitUntil(async () => (await T(page, 'situation-audio').evaluate((a) => a.getAttribute('src') || '')).startsWith('blob:'), { timeout: 5000 })))
    r.check(`${name} 녹음 후 다음/돌아가기 다시 활성`, (await T(page, 'situation-next').isEnabled()) && (await T(page, 'situation-back').isEnabled()))
    await T(page, 'situation-play').click()
    r.check(`${name} 들어보기 → 재생 후 버튼 복귀`, !!(await waitUntil(async () => (await T(page, 'situation-play').isEnabled()) && (await T(page, 'situation-retake').isEnabled()), { timeout: 8000 })))
    await T(page, 'situation-retake').click()
    r.check(`${name} 다시 녹음 → src 비워짐`, (await T(page, 'situation-audio').evaluate((a) => a.getAttribute('src') || '')) === '')
    r.check(`${name} 다시 녹음 → 녹음 버튼 복귀`, !!(await waitUntil(() => T(page, 'situation-record').isVisible(), { timeout: 5000 })))
    await T(page, 'situation-record').click()
    await T(page, 'situation-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(900)
    await T(page, 'situation-stop').click()
    await waitUntil(async () => (await statusText(page)).startsWith('잘했어요'), { timeout: 8000 })
    await T(page, 'situation-back').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 떠난 뒤 모든 트랙 ended`, !!(await waitUntil(() => tracksEnded(page), { timeout: 3000 })))
    await T(page, 'speaking-go-situation').click()
    await T(page, 'situation-recall').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 재진입 시 data-mic-state="idle"(새 화면)`, (await micState(page)) === 'idle', String(await micState(page)))
  })

  // ── 6. 영속성 ────────────────────────────────────────────────────────
  await scenario('6 복습·기록', VP, { seed: { [KEY(QA_STUDENT_ID)]: JSON.stringify(rec(ymd(-1), [sess(ymd(-1), 'recall', 'hard', 1)])) } }, async ({ page, name, openSituation, next }) => {
    await openSituation()
    r.check(`${name} 복습 배너 보임`, await T(page, 'situation-review-banner').isVisible().catch(() => false))
    r.check(`${name} data-stage="recall" (hello 인트로 없음)`, (await stage(page)) === 'recall', String(await stage(page)))
    r.check(`${name} data-expr="hello"`, (await exprId(page)) === 'hello')
    await T(page, 'situation-hint-1').click()
    await T(page, 'situation-self-can').click()
    await next()
    const store = await readStore(page)
    const sessions = store?.hello?.sessions || []
    const last = sessions[sessions.length - 1] || {}
    r.check(`${name} hello 세션 1개 추가(시드 1 → 2)`, sessions.length === 2, JSON.stringify(store))
    r.check(`${name} 새 세션 키가 정확히 date/scene/stage/hintLevel/selfReport/recorded`,
      JSON.stringify(Object.keys(last).sort()) === JSON.stringify(['date', 'hintLevel', 'recorded', 'scene', 'selfReport', 'stage']), Object.keys(last).join(','))
    r.check(`${name} 새 세션 stage==='recall', hintLevel 1, can, 오늘`, last.stage === 'recall' && last.hintLevel === 1 && last.selfReport === 'can' && last.date === ymd(0), JSON.stringify(last))
    r.check(`${name} mastered/completed/done 키 없음`, !/mastered|completed|done/i.test(JSON.stringify(store)))
    r.check(`${name} 레코드 최상위 키 = lastPracticedDate/sessions`, JSON.stringify(Object.keys(store.hello).sort()) === JSON.stringify(['lastPracticedDate', 'sessions']))
  })
  await scenario('6 다른 UUID 시드', VP, { seed: { [KEY(OTHER_ID)]: JSON.stringify(rec(ymd(-1), [sess(ymd(-1), 'recall', 'hard', 1)])) } }, async ({ page, name, openSituation }) => {
    await openSituation()
    r.check(`${name} 복습 배너 없음`, (await T(page, 'situation-review-banner').count()) === 0)
    r.check(`${name} data-stage="intro"`, (await stage(page)) === 'intro', String(await stage(page)))
  })

  // ── 7. 복습 규칙 ─────────────────────────────────────────────────────
  await scenario('7a 오늘 기록', VP, { seed: { [KEY(QA_STUDENT_ID)]: JSON.stringify(rec(ymd(0), [sess(ymd(0), 'recall', 'hard', 1)])) } }, async ({ page, name, openSituation }) => {
    await openSituation()
    r.check(`${name} 같은 날 기록 → 배너 없음`, (await T(page, 'situation-review-banner').count()) === 0)
    r.check(`${name} 인트로로 시작`, (await stage(page)) === 'intro', String(await stage(page)))
  })
  await scenario('7b 어제 같은 날 recall+transfer', VP, { seed: { [KEY(QA_STUDENT_ID)]: JSON.stringify(rec(ymd(-1), [sess(ymd(-1), 'recall', 'can'), sess(ymd(-1), 'transfer', 'can')])) } }, async ({ page, name, openSituation }) => {
    await openSituation()
    r.check(`${name} 3일 규칙 미발동 → 오늘 복습 대상(배너)`, await T(page, 'situation-review-banner').isVisible().catch(() => false))
    r.check(`${name} data-stage="recall"`, (await stage(page)) === 'recall', String(await stage(page)))
  })
  await scenario('7c 2일 전 recall can x2', VP, { seed: { [KEY(QA_STUDENT_ID)]: JSON.stringify(rec(ymd(-2), [sess(ymd(-2), 'recall', 'can'), sess(ymd(-2), 'recall', 'can')])) } }, async ({ page, name, openSituation }) => {
    await openSituation()
    r.check(`${name} 3일 미만 → 복습 대상 아님(배너 없음)`, (await T(page, 'situation-review-banner').count()) === 0)
    r.check(`${name} 인트로로 시작`, (await stage(page)) === 'intro', String(await stage(page)))
  })

  // ── 8. 상호작용 없이 끝까지 ──────────────────────────────────────────
  await scenario('8 무조작 완주', VP, {}, async ({ page, name, openSituation, next }) => {
    await openSituation()
    let steps = 0
    while ((await stage(page)) !== 'summary' && steps < 30) { await next(); steps++ }
    r.check(`${name} 15단계(5표현 x 3) 후 요약`, steps === 15 && (await stage(page)) === 'summary', String(steps))
    const rows = T(page, 'situation-summary').locator('li')
    const texts = await rows.allTextContents()
    r.check(`${name} 요약 5행 전부 "미기록"`, texts.length === 5 && texts.every((t) => t.includes('미기록')), JSON.stringify(texts))
    const store = await readStore(page)
    const n = store ? Object.values(store).reduce((a, v) => a + (Array.isArray(v?.sessions) ? v.sessions.length : 0), 0) : 0
    r.check(`${name} 무조작 실행은 기록 0건(키 없음 또는 세션 0)`, n === 0, JSON.stringify(store))
    await T(page, 'situation-done').click()
    r.check(`${name} situation-done → 말하기 화면`, !!(await waitUntil(() => T(page, 'speaking-practice').isVisible(), { timeout: 5000 })))
  })

  // ── 9. 360x640 + 모션 감소 ───────────────────────────────────────────
  await scenario('9 소형 화면·접근성', SMALL, { reduced: true }, async ({ page, name, openSituation, next }) => {
    await openSituation()
    const smallBtns = () => page.locator('[data-testid="situation-recall"] button').evaluateAll((els) =>
      els.filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height < 44 - 0.5 }).map((el) => el.textContent.trim()))
    const animCount = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="situation-recall"], [data-testid="situation-recall"] *')].reduce((a, el) => a + el.getAnimations().length, 0))
    const h1Focused = () => page.evaluate(() => { const a = document.activeElement; return !!a && a.tagName === 'H1' && !!a.closest('[data-testid="situation-recall"]') })
    const badOverflow = []
    const badBtns = []
    const badFocus = []
    for (let i = 0; i < 20; i++) {
      const s = await stage(page)
      if (!(await noOverflow(page, SMALL.width))) badOverflow.push(`${i}:${s}`)
      const sb = await smallBtns()
      if (sb.length) badBtns.push(`${i}:${s}:${sb.join('/')}`)
      if (i === 1) { // 회상 단계에서 녹음 중 모든 버튼/애니메이션도 점검
        await T(page, 'situation-record').click()
        await T(page, 'situation-stop').waitFor({ state: 'visible', timeout: 10000 })
        await sleep(600)
        const sb2 = await smallBtns()
        if (sb2.length) badBtns.push(`${i}:recording:${sb2.join('/')}`)
        r.check(`${name} 녹음 중 running animation 0개(모션 감소)`, (await waitUntil(async () => (await animCount()) === 0, { timeout: 2000 })) === true, String(await animCount()))
        await T(page, 'situation-stop').click()
        await waitUntil(async () => (await statusText(page)).startsWith('잘했어요'), { timeout: 8000 })
      }
      if (s === 'summary') break
      await next()
      if (!(await waitUntil(h1Focused, { timeout: 2000 }))) badFocus.push(`${i}`)
    }
    r.check(`${name} 전 단계 scrollWidth <= 360`, badOverflow.length === 0, badOverflow.join(','))
    r.check(`${name} 전 단계 보이는 버튼 높이 >=44px`, badBtns.length === 0, badBtns.join(' | '))
    r.check(`${name} 다음 누를 때마다 h1 포커스`, badFocus.length === 0, badFocus.join(','))
    r.check(`${name} 요약 도달`, (await stage(page)) === 'summary')
    r.check(`${name} 요약 done 버튼 높이 >=44px`, (await smallBtns()).length === 0)
    r.check(`${name} 모션 감소 — 화면 전체 running animation 0개`, !!(await waitUntil(async () => (await animCount()) === 0, { timeout: 2000 })), String(await animCount()))
  })

  // ── 10. 손상된 시드 ──────────────────────────────────────────────────
  await scenario('10 손상된 기록', VP, { seed: { [KEY(QA_STUDENT_ID)]: JSON.stringify({ ghost: { lastPracticedDate: ymd(-5), sessions: [] }, hello: { lastPracticedDate: ymd(-1), sessions: 'x' } }) } }, async ({ page, name, openSituation, next }) => {
    await openSituation()
    r.check(`${name} 크래시 없이 렌더(intro/recall)`, ['intro', 'recall'].includes(await stage(page)), String(await stage(page)))
    r.check(`${name} data-expr가 ghost가 아님`, (await exprId(page)) !== 'ghost' && (await exprId(page)) === 'hello', String(await exprId(page)))
    r.check(`${name} AppErrorBoundary 문구 없음`, !(await bodyText(page)).includes('앱 오류가 발생했어요'))
    if ((await stage(page)) === 'recall') await T(page, 'situation-hint-1').click()
    await next()
    r.check(`${name} 단계 완료 후 다음 단계로 진행`, (await stage(page)) !== 'summary' && (await exprId(page)) === 'hello' && (await stage(page)) === 'transfer', `${await stage(page)}/${await exprId(page)}`)
    const store = await readStore(page)
    r.check(`${name} 손상된 sessions 대신 새 배열로 저장`, Array.isArray(store?.hello?.sessions) && store.hello.sessions.length === 1, JSON.stringify(store))
    r.check(`${name} 여전히 AppErrorBoundary 없음`, !(await bodyText(page)).includes('앱 오류가 발생했어요'))
  })

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
