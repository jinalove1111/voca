// tests/e2e/speakingExam.spec.mjs
//
// 한글 보고 말하기(207차: 그림 보고 말하기 시험에서 변경, SpeakingExam.jsx, Speaking UX v2 2026-10-04) 회귀 스펙 — situation.spec 대체.
// 설계: docs/design/SPEAKING_UX_V2_2026-10-04.md §4/§5/§7. 핵심 계약: 공개 전엔 EN 문장/KO 뜻/듣기/
// 자기 확인이 DOM에 아예 없고(숨김 렌더 금지) speak 호출도 0, 자기 확인은 UUID 키 localStorage에만 저장.
// 마이크는 addInitScript로 합성 MediaStream, 기기 로컬 기록은 localStorage 시드. 실제 네트워크 0건.
// 파일당 소유권 원칙(규칙 16)에 따라 다른 spec의 헬퍼는 복제한다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { SITUATION_EXPRESSIONS, sceneFor } from '../../src/utils/situation/situationContent.js'
import { itemsForSet } from '../../src/utils/situation/speakingSets.js'

const VP = { width: 390, height: 844 }
const VIEWPORTS = [{ width: 360, height: 640 }, VP, { width: 412, height: 915 }, { width: 1280, height: 800 }]
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const KEY = (id) => `paulEasyVoca_situationRecall_${id}`
const OTHER_ID = 'e2e00000-0000-4000-8000-00000000b002'
const E = SITUATION_EXPRESSIONS
const N = E.length
const FORBIDDEN = ['정답', '합격', '숙달', '점수', '⭐', '완료', '별']
const EXAM_ONLY_IDS = ['exam-answer-label', 'exam-answer', 'exam-meaning', 'exam-other-ways', 'exam-listen', 'exam-self-can', 'exam-self-hard', 'exam-retry', 'exam-practice-panel']

const ymd0 = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

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

// mockRoutes가 심은 speechSynthesis 스텁 "뒤"에 등록해 speak 호출(공백 제외)을 센다.
async function installSpeakCounter(page) {
  await page.addInitScript(() => {
    window.__speak = []
    const s = window.speechSynthesis
    if (!s) return
    const orig = s.speak.bind(s)
    s.speak = (u) => { if ((u.text || '').trim()) window.__speak.push(u.text); return orig(u) }
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

const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
function badWrites(apiCallLog) {
  const path = (u) => { try { return new URL(u).pathname } catch { return u.split('?')[0] } }
  const rest = apiCallLog
    .filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method))
    .filter((c) => !LOGIN_WRITES.includes(path(c.url)))
    .map((c) => `${c.method} ${path(c.url)}`)
  const upload = apiCallLog.filter((c) => /upload|stt|transcri|speech-to-text|storage\/v1/i.test(c.url)).map((c) => `${c.method} ${path(c.url)}`)
  return [...rest, ...upload]
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const root = (page) => T(page, 'speaking-exam')
const attr = (page, a) => root(page).getAttribute(a)
const index = (page) => attr(page, 'data-index')
const revealed = (page) => attr(page, 'data-revealed')
const micState = (page) => attr(page, 'data-mic-state')
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const statusText = (page) => txt(page, 'speaking-status')
const bodyText = (page) => page.locator('body').innerText()
const speakLog = (page) => page.evaluate(() => window.__speak || [])
const tracksEnded = (page) => page.evaluate(() => (window.__micTracks || []).length > 0 && window.__micTracks.every((t) => t.readyState === 'ended'))
const readStore = (page, id = QA_STUDENT_ID) => page.evaluate((k) => localStorage.getItem(k), KEY(id)).then((s) => (s === null ? null : JSON.parse(s)))
const forbiddenIn = (text) => FORBIDDEN.filter((w) => text.includes(w))
// 숨김 렌더까지 잡도록 textContent + 모든 접근성/속성 텍스트를 훑는다
const fullText = (page) => page.evaluate(() => {
  const attrs = [...document.querySelectorAll('*')].flatMap((el) => ['aria-label', 'alt', 'title', 'placeholder', 'value'].map((a) => el.getAttribute(a) || ''))
  return document.body.textContent + '\n' + attrs.join('\n')
})
const answerLeaks = async (page, upTo = N) => {
  const t = await fullText(page)
  return E.slice(0, upTo).flatMap((e) => [e.en, e.ko]).filter((s) => t.includes(s))
}
const smallButtons = (page) => page.locator('[data-testid="speaking-exam"] button').evaluateAll((els) =>
  els.filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height < 44 - 0.5 }).map((el) => el.textContent.trim()))
const h1Focused = (page) => page.evaluate(() => { const a = document.activeElement; return !!a && a.tagName === 'H1' && !!a.closest('[data-testid="speaking-exam"]') })

export async function run(browser, baseURL) {
  const r = createRecorder('[speaking-exam]')
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
    const { db, unmockedRequests: u, ttsFallbackRequests: t, apiCallLog } = await installMocks(page)
    await installSpeakCounter(page)
    const name = `${label} [${vp.width}x${vp.height}]`
    const openMenu = async () => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-menu-speaking').click()
      await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 15000 })
    }
    const openExam = async () => {
      await openMenu()
      await T(page, 'speaking-menu-exam').click()
      await root(page).waitFor({ state: 'visible', timeout: 15000 })
    }
    const reveal = () => T(page, 'exam-reveal').click()
    const next = () => T(page, 'exam-next').click()
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, openMenu, openExam, reveal, next, tts: t })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인 외 REST 쓰기/업로드·STT 요청 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
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

  const recordFor = async (page, ms) => {
    await T(page, 'speaking-record').click()
    await T(page, 'speaking-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(ms)
    await T(page, 'speaking-stop').click()
  }

  // ── 1. 공개 전: 정답 단서 0 ──────────────────────────────────────────
  await scenario('1 공개 전', VP, {}, async ({ page, name, openExam, tts }) => {
    await openExam()
    r.check(`${name} data-index=0 / data-revealed=false`, (await index(page)) === '0' && (await revealed(page)) === 'false')
    r.check(`${name} exam-progress "1 / 5"`, (await txt(page, 'exam-progress')) === `1 / ${N}`, await txt(page, 'exam-progress'))
    r.check(`${name} 제목 = 한글 보고 말하기`, ((await page.getByRole('heading', { level: 1 }).textContent()) || '').trim() === '한글 보고 말하기')
    r.check(`${name} situation-guide data-scene="hello-b"(전이 장면)`, (await T(page, 'situation-guide').getAttribute('data-scene')) === 'hello-b', String(await T(page, 'situation-guide').getAttribute('data-scene')))
    const label = await txt(page, 'situation-text')
    r.check(`${name} 한글 상황 = hello-b situationKo(누가 누구에게 왜)`, label === sceneFor('hello', 'b').situationKo, label)
    const speechActs = ['인사', '반가', '미안', '사과', '고마', '감사', '도와', '부탁', '놀자', '같이 놀'].filter((w) => label.includes(w))
    r.check(`${name} 한글 상황에 목표 뜻/말하기 행위 단어 없음`, speechActs.length === 0, speechActs.join(','))
    r.check(`${name} 한글 상황에 영어 글자 없음(첫 단어 힌트 없음)`, !/[A-Za-z]/.test(label), label)
    r.check(`${name} 임시 그림(scene-card) 없음`, (await T(page, 'scene-card').count()) === 0)
    const leaks = await answerLeaks(page)
    r.check(`${name} 본문/속성 어디에도 EN 5문장·KO 5뜻 없음`, leaks.length === 0, leaks.join(' | '))
    const inner = await bodyText(page)
    r.check(`${name} body innerText에 EN/KO 없음`, !E.some((e) => inner.includes(e.en) || inner.includes(e.ko)))
    const present = []
    for (const id of [...EXAM_ONLY_IDS, 'practice-sentence', 'practice-listen']) if ((await T(page, id).count()) > 0) present.push(id)
    r.check(`${name} 공개 전 DOM에 정답/듣기/자기 확인/다시 연습/연습 패널 없음`, present.length === 0, present.join(','))
    r.check(`${name} exam-reveal 보임 + 활성`, (await T(page, 'exam-reveal').isVisible()) && (await T(page, 'exam-reveal').isEnabled()))
    r.check(`${name} exam-next 비활성`, await T(page, 'exam-next').isDisabled())
    r.check(`${name} 녹음 버튼은 보임(선택 녹음) + idle`, (await T(page, 'speaking-record').isVisible()) && (await micState(page)) === 'idle')
    r.check(`${name} speechSynthesis.speak 호출 0`, (await speakLog(page)).length === 0, JSON.stringify(await speakLog(page)))
    r.check(`${name} TTS 네트워크 요청 0`, tts.length === 0, JSON.stringify(tts.slice(0, 2)))
    r.check(`${name} 금지어 없음`, forbiddenIn(await bodyText(page)).length === 0, forbiddenIn(await bodyText(page)).join(','))
  })

  // ── 2. 답 확인 후 ────────────────────────────────────────────────────
  await scenario('2 답 확인', VP, {}, async ({ page, name, openExam, reveal }) => {
    await openExam()
    await reveal()
    r.check(`${name} data-revealed=true`, (await revealed(page)) === 'true')
    r.check(`${name} exam-answer = EN`, (await txt(page, 'exam-answer')) === E[0].en, await txt(page, 'exam-answer'))
    r.check(`${name} exam-meaning = KO`, (await txt(page, 'exam-meaning')) === E[0].ko, await txt(page, 'exam-meaning'))
    r.check(`${name} 안내 라벨 "이렇게 말할 수 있어요"(정답 표현 아님)`, (await txt(page, 'exam-answer-label')) === '이렇게 말할 수 있어요', await txt(page, 'exam-answer-label'))
    r.check(`${name} 다른 표현 허용 문구 보임`, await T(page, 'exam-other-ways').isVisible())
    r.check(`${name} 공개 후에도 한글 상황 유지`, (await txt(page, 'situation-text')) === sceneFor('hello', 'b').situationKo)
    r.check(`${name} exam-reveal 사라지고 exam-retry 보임`, (await T(page, 'exam-reveal').count()) === 0 && (await T(page, 'exam-retry').isVisible()))
    r.check(`${name} 공개만으로는 speak 호출 0`, (await speakLog(page)).length === 0)
    await T(page, 'exam-listen').click()
    const log = await waitUntil(async () => { const l = await speakLog(page); return l.length >= 1 ? l : null }, { timeout: 3000 })
    r.check(`${name} 듣기 → speak 호출 1회`, !!log && log.length === 1, JSON.stringify(log))
    r.check(`${name} 호출 문장 = EN`, !!log && log[0] === E[0].en, JSON.stringify(log))
    const can = T(page, 'exam-self-can')
    const hard = T(page, 'exam-self-hard')
    r.check(`${name} 자기 확인 전 둘 다 aria-pressed=false`, (await can.getAttribute('aria-pressed')) === 'false' && (await hard.getAttribute('aria-pressed')) === 'false')
    await can.click()
    r.check(`${name} can → can=true/hard=false`, (await can.getAttribute('aria-pressed')) === 'true' && (await hard.getAttribute('aria-pressed')) === 'false')
    await hard.click()
    r.check(`${name} hard → can=false/hard=true`, (await can.getAttribute('aria-pressed')) === 'false' && (await hard.getAttribute('aria-pressed')) === 'true')
    r.check(`${name} exam-next 활성`, await T(page, 'exam-next').isEnabled())
    r.check(`${name} 금지어 없음`, forbiddenIn(await bodyText(page)).length === 0, forbiddenIn(await bodyText(page)).join(','))
  })

  // ── 3. 다시 연습(인라인) ─────────────────────────────────────────────
  await scenario('3 다시 연습', VP, {}, async ({ page, name, openExam, reveal, next }) => {
    await openExam()
    await reveal()
    await T(page, 'exam-retry').click()
    const panel = T(page, 'exam-practice-panel')
    r.check(`${name} exam-practice-panel 보임`, await panel.isVisible().catch(() => false))
    r.check(`${name} 패널 안 practice-sentence = EN, practice-listen 보임`, ((await panel.locator('[data-testid="practice-sentence"]').textContent()) || '').trim() === E[0].en && (await panel.locator('[data-testid="practice-listen"]').isVisible()))
    r.check(`${name} 패널 안 situation-guide = 연습 장면 hello-a`, (await panel.locator('[data-testid="situation-guide"]').getAttribute('data-scene')) === 'hello-a', String(await panel.locator('[data-testid="situation-guide"]').getAttribute('data-scene')))
    r.check(`${name} 시험 상황(hello-b)도 그대로`, (await T(page, 'situation-guide').first().getAttribute('data-scene')) === 'hello-b')
    r.check(`${name} 다시 연습 버튼 비활성(중복 방지)`, await T(page, 'exam-retry').isDisabled())
    r.check(`${name} 녹음 UI 1세트만(중복 마운트 없음)`, (await T(page, 'speaking-record').count()) === 1 && (await T(page, 'speaking-status').count()) === 1)
    await T(page, 'practice-listen').click()
    const log = await waitUntil(async () => { const l = await speakLog(page); return l.length >= 1 ? l : null }, { timeout: 3000 })
    r.check(`${name} 패널 듣기 → speak EN`, !!log && log[log.length - 1] === E[0].en, JSON.stringify(log))
    await recordFor(page, 1000)
    r.check(`${name} 패널 안 녹음 → "잘했어요" + blob`, !!(await waitUntil(async () => (await statusText(page)).startsWith('잘했어요') && (await T(page, 'speaking-audio').evaluate((a) => (a.getAttribute('src') || '').startsWith('blob:'))), { timeout: 8000 })), await statusText(page))
    r.check(`${name} 다시 연습 중에도 exam-next 활성`, await T(page, 'exam-next').isEnabled())
    await next()
    r.check(`${name} 다음 → 2번 문항(패널 닫힘)`, (await index(page)) === '1' && (await T(page, 'exam-practice-panel').count()) === 0)
  })

  // ── 4. 다음 → 미공개 복귀 ────────────────────────────────────────────
  await scenario('4 다음 문제', VP, {}, async ({ page, name, openExam, reveal, next }) => {
    await openExam()
    await reveal()
    await T(page, 'exam-self-can').click()
    await next()
    r.check(`${name} data-index=1 / data-revealed=false`, (await index(page)) === '1' && (await revealed(page)) === 'false')
    r.check(`${name} exam-progress "2 / 5"`, (await txt(page, 'exam-progress')) === `2 / ${N}`, await txt(page, 'exam-progress'))
    r.check(`${name} data-expr="${E[1].id}", situation-guide data-scene="help-b"`, (await attr(page, 'data-expr')) === E[1].id && (await T(page, 'situation-guide').getAttribute('data-scene')) === 'help-b', String(await T(page, 'situation-guide').getAttribute('data-scene')))
    const leaks = await answerLeaks(page)
    r.check(`${name} 2번 문항에서도 EN/KO 5+5 전부 본문에 없음`, leaks.length === 0, leaks.join(' | '))
    r.check(`${name} 정답/자기 확인 요소 없음`, (await Promise.all(EXAM_ONLY_IDS.map((id) => T(page, id).count()))).every((c) => c === 0))
    r.check(`${name} 녹음기 idle(녹음 버튼 보임, src 없음, status 안내)`, (await micState(page)) === 'idle' && (await T(page, 'speaking-record').isVisible()) && (await T(page, 'speaking-audio').evaluate((a) => a.getAttribute('src') || '')) === '')
    r.check(`${name} exam-next 다시 비활성`, await T(page, 'exam-next').isDisabled())
    await reveal()
    r.check(`${name} 다시 공개 → 자기 확인 초기화(aria-pressed 둘 다 false)`, (await T(page, 'exam-self-can').getAttribute('aria-pressed')) === 'false' && (await T(page, 'exam-self-hard').getAttribute('aria-pressed')) === 'false')
    r.check(`${name} 공개 → 2번 EN/KO`, (await txt(page, 'exam-answer')) === E[1].en && (await txt(page, 'exam-meaning')) === E[1].ko)
  })

  // ── 5. 마이크 없이 완주 ──────────────────────────────────────────────
  await scenario('5 무마이크 완주', VP, {}, async ({ page, name, openExam, reveal, next }) => {
    await openExam()
    const bad = []
    for (let i = 0; i < N; i++) {
      if ((await txt(page, 'exam-progress')) !== `${i + 1} / ${N}`) bad.push(`progress@${i}`)
      let f = forbiddenIn(await bodyText(page))
      if (f.length) bad.push(`unrevealed@${i}:${f}`)
      await reveal()
      if ((await txt(page, 'exam-answer')) !== E[i].en) bad.push(`answer@${i}`)
      f = forbiddenIn(await bodyText(page))
      if (f.length) bad.push(`revealed@${i}:${f}`)
      await next()
    }
    r.check(`${name} 5문항 reveal→next 완주(진행/정답/금지어 이상 없음)`, bad.length === 0, bad.join(' | '))
    await T(page, 'exam-summary').waitFor({ state: 'visible', timeout: 5000 })
    const rows = await T(page, 'exam-summary').locator('li').allTextContents()
    r.check(`${name} 요약 5행 전부 "미기록"`, rows.length === N && rows.every((t) => t.includes('미기록')), JSON.stringify(rows))
    r.check(`${name} 요약 금지어 없음`, forbiddenIn(await bodyText(page)).length === 0, forbiddenIn(await bodyText(page)).join(','))
    r.check(`${name} 요약엔 exam-reveal/exam-next 없음`, (await T(page, 'exam-reveal').count()) === 0 && (await T(page, 'exam-next').count()) === 0)
    r.check(`${name} 공개만 한 완주는 localStorage 기록 0(키 없음)`, (await readStore(page)) === null, JSON.stringify(await readStore(page)))
    await T(page, 'exam-done').click()
    r.check(`${name} exam-done → speaking-menu`, !!(await waitUntil(() => T(page, 'speaking-menu').isVisible(), { timeout: 5000 })))
    r.check(`${name} 시험 화면 사라짐`, (await root(page).count()) === 0)
  })

  // ── 6. 영속성(UUID 키, 정확한 스키마) ────────────────────────────────
  const otherSeed = JSON.stringify({ hello: { lastPracticedDate: '2026-01-01', sessions: [{ date: '2026-01-01', scene: 'hello-a', stage: 'recall', hintLevel: 1, selfReport: 'hard', recorded: false }] } })
  await scenario('6 자기 확인 저장', VP, { seed: { [KEY(OTHER_ID)]: otherSeed } }, async ({ page, name, openExam, reveal, next }) => {
    await openExam()
    await reveal()
    await T(page, 'exam-self-can').click()
    r.check(`${name} 다음 누르기 전엔 아직 저장 안 함`, (await readStore(page)) === null)
    await next()
    const store = await readStore(page)
    const sessions = store?.hello?.sessions || []
    const last = sessions[sessions.length - 1] || {}
    r.check(`${name} hello 세션 1개`, sessions.length === 1, JSON.stringify(store))
    r.check(`${name} 세션 키가 정확히 date/scene/stage/hintLevel/selfReport/recorded`,
      JSON.stringify(Object.keys(last).sort()) === JSON.stringify(['date', 'hintLevel', 'recorded', 'scene', 'selfReport', 'stage']), Object.keys(last).join(','))
    r.check(`${name} stage='exam', selfReport='can', scene='hello-b', hintLevel 0, recorded false, 오늘`,
      last.stage === 'exam' && last.selfReport === 'can' && last.scene === 'hello-b' && last.hintLevel === 0 && last.recorded === false && last.date === ymd0(), JSON.stringify(last))
    r.check(`${name} 레코드 최상위 키 = lastPracticedDate/sessions`, JSON.stringify(Object.keys(store.hello).sort()) === JSON.stringify(['lastPracticedDate', 'sessions']))
    r.check(`${name} mastered/completed/done/score 키 없음`, !/mastered|completed|done|score/i.test(JSON.stringify(store)))
    // 2번: 공개만(자기 확인·녹음 없음) → 기록 없음
    await reveal()
    await next()
    const store2 = await readStore(page)
    r.check(`${name} 공개만 한 2번 문항은 저장 안 함(help 키 없음)`, !!store2 && !('help' in store2) && Object.keys(store2).length === 1, JSON.stringify(store2))
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('paulEasyVoca_situationRecall_')))
    r.check(`${name} 기록 키는 UUID 키 2개뿐(QA + 시드된 다른 UUID)`, keys.length === 2 && keys.includes(KEY(QA_STUDENT_ID)) && keys.includes(KEY(OTHER_ID)), keys.join(','))
    r.check(`${name} 다른 UUID 기록 무영향`, (await page.evaluate((k) => localStorage.getItem(k), KEY(OTHER_ID))) === otherSeed)
    r.check(`${name} 이름 기반 키 없음`, !(await page.evaluate((n) => Object.keys(localStorage).some((k) => k.includes(n)), QA_STUDENT_NAME)))
  })

  // ── 7. 시험 중 녹음(합성 마이크) ─────────────────────────────────────
  await scenario('7 시험 녹음', VP, {}, async ({ page, name, openExam, reveal }) => {
    await openExam()
    await T(page, 'speaking-record').click()
    r.check(`${name} 녹음 중 status`, !!(await waitUntil(async () => (await statusText(page)) === '녹음 중이에요… 끝나면 그만을 눌러요', { timeout: 8000 })), await statusText(page))
    r.check(`${name} data-mic-state="live"`, (await micState(page)) === 'live', String(await micState(page)))
    r.check(`${name} 녹음 중 exam-reveal/exam-back 비활성`, (await T(page, 'exam-reveal').isDisabled()) && (await T(page, 'exam-back').isDisabled()))
    r.check(`${name} 녹음 중 exam-next 비활성`, await T(page, 'exam-next').isDisabled())
    await sleep(1200)
    await T(page, 'speaking-stop').click()
    r.check(`${name} 그만 → "잘했어요" + blob`, !!(await waitUntil(async () => (await statusText(page)).startsWith('잘했어요') && (await T(page, 'speaking-audio').evaluate((a) => (a.getAttribute('src') || '').startsWith('blob:'))), { timeout: 8000 })), await statusText(page))
    r.check(`${name} 녹음 후 exam-reveal/exam-back 다시 활성`, (await T(page, 'exam-reveal').isEnabled()) && (await T(page, 'exam-back').isEnabled()))
    r.check(`${name} 녹음만 해도 EN/KO는 여전히 본문에 없음(재생이 정답 노출 아님)`, (await answerLeaks(page)).length === 0)
    await T(page, 'speaking-play').click()
    r.check(`${name} 들어보기 → 재생 후 버튼 복귀`, !!(await waitUntil(async () => (await T(page, 'speaking-play').isEnabled()) && (await T(page, 'speaking-retake').isEnabled()), { timeout: 8000 })))
    await reveal()
    // 공개 후 다시 녹음 — 듣기/다시 연습/다음/뒤로 전부 잠김
    await T(page, 'speaking-retake').click()
    await T(page, 'speaking-record').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'speaking-record').click()
    await T(page, 'speaking-stop').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 공개 후 녹음 중 exam-listen/exam-retry/exam-next/exam-back 비활성`,
      (await T(page, 'exam-listen').isDisabled()) && (await T(page, 'exam-retry').isDisabled()) && (await T(page, 'exam-next').isDisabled()) && (await T(page, 'exam-back').isDisabled()))
    await sleep(900)
    await T(page, 'speaking-stop').click()
    await waitUntil(async () => (await statusText(page)).startsWith('잘했어요'), { timeout: 8000 })
    await T(page, 'exam-back').click()
    r.check(`${name} 뒤로 → speaking-menu`, !!(await waitUntil(() => T(page, 'speaking-menu').isVisible(), { timeout: 5000 })))
    r.check(`${name} 떠난 뒤 모든 트랙 ended`, !!(await waitUntil(() => tracksEnded(page), { timeout: 3000 })))
    const store = await readStore(page)
    const last = (store?.hello?.sessions || []).slice(-1)[0] || {}
    r.check(`${name} 녹음+공개 후 뒤로 → recorded=true, selfReport=null, stage 'exam'로 저장`, last.recorded === true && last.selfReport === null && last.stage === 'exam', JSON.stringify(store))
  })

  await scenario('6 녹음만(자기 확인 없음)', VP, {}, async ({ page, name, openExam, reveal, next }) => {
    await openExam()
    await recordFor(page, 1000)
    await waitUntil(async () => (await statusText(page)).startsWith('잘했어요'), { timeout: 8000 })
    await reveal()
    await next()
    const store = await readStore(page)
    const last = (store?.hello?.sessions || []).slice(-1)[0] || {}
    r.check(`${name} 녹음→공개→다음(자기 확인 없음) → recorded=true, selfReport=null`, last.recorded === true && last.selfReport === null && last.stage === 'exam', JSON.stringify(store))
  })

  // ── 8. 내비게이션 / 홈 직진입 / 플래그 ───────────────────────────────
  await scenario('8 뒤로/재진입', VP, {}, async ({ page, name, openExam, reveal, next }) => {
    await openExam()
    for (let i = 0; i < 2; i++) { await reveal(); await next() }
    await reveal()
    r.check(`${name} 3번 공개 상태 도달`, (await index(page)) === '2' && (await revealed(page)) === 'true')
    await T(page, 'exam-back').click()
    r.check(`${name} exam-back → speaking-menu`, !!(await waitUntil(() => T(page, 'speaking-menu').isVisible(), { timeout: 5000 })))
    r.check(`${name} 시험 화면 사라짐`, (await root(page).count()) === 0)
    await T(page, 'speaking-menu-exam').click()
    await root(page).waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 재진입 → 1번(data-index=0) + 미공개`, (await index(page)) === '0' && (await revealed(page)) === 'false')
    r.check(`${name} 재진입 후 EN/KO 본문에 없음`, (await answerLeaks(page)).length === 0)
    r.check(`${name} exam-progress "1 / 5"`, (await txt(page, 'exam-progress')) === `1 / ${N}`)
  })
  await scenario('8 홈 직진입', VP, {}, async ({ page, name }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'student-home-speaking-exam').click()
    await root(page).waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 홈 보조 버튼 → speaking-exam 직진입(메뉴 거치지 않음)`, (await T(page, 'speaking-menu').count()) === 0 && (await index(page)) === '0' && (await revealed(page)) === 'false')
    await T(page, 'exam-back').click()
    r.check(`${name} 직진입 시험에서 뒤로 → speaking-menu`, !!(await waitUntil(() => T(page, 'speaking-menu').isVisible(), { timeout: 5000 })))
    await T(page, 'speaking-menu-home').click()
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 직진입→뒤로→메뉴 홈 → 포커스가 말하기 카드로 복귀`, !!(await waitUntil(async () => (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'student-home-menu-speaking', { timeout: 3000 })), String(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))))
    // 메뉴에서 연 뒤 홈으로 나와, 홈 직진입을 한 번 더 — 모드가 메뉴에 고정되지 않아야 한다
    await T(page, 'student-home-menu-speaking').click()
    await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 말하기 카드는 여전히 메뉴로 진입`, (await root(page).count()) === 0)
  })
  await scenario('8 situationRecallV1 OFF', VP, { flags: { situationRecallV1: false } }, async ({ page, name, openMenu }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 홈 시험 바로 가기 없음`, (await T(page, 'student-home-speaking-exam').count()) === 0)
    await openMenu()
    r.check(`${name} 메뉴에 시험 버튼 없음 + 연습 버튼은 있음`, (await T(page, 'speaking-menu-exam').count()) === 0 && (await T(page, 'speaking-menu-practice').isVisible()))
    await T(page, 'speaking-menu-practice').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 10000 })
    for (let i = 0; i < N; i++) await T(page, 'practice-next').click()
    await T(page, 'practice-done').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} 완료 화면에 한글 보고 말하기 시작 버튼 없음(킬 스위치)`, (await T(page, 'practice-start-exam').count()) === 0)
    await T(page, 'practice-back-menu').click()
    r.check(`${name} 메뉴로 → 시험 아닌 메뉴`, !!(await waitUntil(() => T(page, 'speaking-menu').isVisible(), { timeout: 5000 })) && (await root(page).count()) === 0)
  })

  // ── 9. 뷰포트 / 접근성 / 모션 ────────────────────────────────────────
  for (const vp of VIEWPORTS) {
    await scenario('9 뷰포트', vp, {}, async ({ page, name, openExam, reveal, next }) => {
      await openExam()
      const badOverflow = []
      const badBtns = []
      const badFocus = []
      const check = async (tag) => {
        if (!(await noOverflow(page))) badOverflow.push(tag)
        const sb = await smallButtons(page)
        if (sb.length) badBtns.push(`${tag}:${sb.join('/')}`)
      }
      for (let i = 0; i < N; i++) {
        await check(`${i}:unrevealed`)
        await reveal()
        await check(`${i}:revealed`)
        if (i === 0) {
          await T(page, 'exam-retry').click()
          await check(`${i}:retry`)
        }
        await next()
        if (!(await waitUntil(() => h1Focused(page), { timeout: 2000 }))) badFocus.push(`${i}`)
      }
      await T(page, 'exam-summary').waitFor({ state: 'visible', timeout: 5000 })
      await check('summary')
      r.check(`${name} 전 단계 scrollWidth <= innerWidth`, badOverflow.length === 0, badOverflow.join(','))
      r.check(`${name} 전 단계 보이는 버튼 높이 >=44px`, badBtns.length === 0, badBtns.join(' | '))
      r.check(`${name} 다음 누를 때마다 h1 포커스`, badFocus.length === 0, badFocus.join(','))
      r.check(`${name} 요약 h1 유지(포커스)`, await h1Focused(page))
    })
  }
  await scenario('9 모션 감소', VP, { reduced: true }, async ({ page, name, openExam, reveal }) => {
    await openExam()
    const animCount = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="speaking-exam"], [data-testid="speaking-exam"] *')].reduce((a, el) => a + el.getAnimations().length, 0))
    await T(page, 'speaking-record').click()
    await T(page, 'speaking-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(600)
    r.check(`${name} 녹음 중 running animation 0개(모션 감소)`, !!(await waitUntil(async () => (await animCount()) === 0, { timeout: 2000 })), String(await animCount()))
    await T(page, 'speaking-stop').click()
    await waitUntil(async () => (await statusText(page)).startsWith('잘했어요'), { timeout: 8000 })
    await reveal()
    r.check(`${name} 공개 후 running animation 0개`, !!(await waitUntil(async () => (await animCount()) === 0, { timeout: 2000 })), String(await animCount()))
  })

  // ── 10. 손상된 시드 ──────────────────────────────────────────────────
  await scenario('10 손상된 기록', VP, { seed: { [KEY(QA_STUDENT_ID)]: JSON.stringify({ ghost: { lastPracticedDate: '2026-01-01', sessions: [] }, hello: { lastPracticedDate: '2026-01-02', sessions: 'x' } }) } }, async ({ page, name, openExam, reveal, next }) => {
    await openExam()
    r.check(`${name} 크래시 없이 렌더(1번, 미공개)`, (await index(page)) === '0' && (await revealed(page)) === 'false')
    r.check(`${name} AppErrorBoundary 문구 없음`, !(await bodyText(page)).includes('앱 오류가 발생했어요'))
    await reveal()
    await T(page, 'exam-self-hard').click()
    await next()
    const store = await readStore(page)
    r.check(`${name} 손상된 sessions 대신 새 배열로 저장(길이 1)`, Array.isArray(store?.hello?.sessions) && store.hello.sessions.length === 1 && store.hello.sessions[0].selfReport === 'hard', JSON.stringify(store))
    r.check(`${name} 다음 문항 정상 진행`, (await index(page)) === '1' && !(await bodyText(page)).includes('앱 오류가 발생했어요'))
  })
  await scenario('10 깨진 JSON', VP, { seed: { [KEY(QA_STUDENT_ID)]: '{{{not json' } }, async ({ page, name, openExam, reveal, next }) => {
    await openExam()
    await reveal()
    await T(page, 'exam-self-can').click()
    await next()
    const store = await readStore(page)
    r.check(`${name} 깨진 JSON도 크래시 없이 새 기록으로 덮어씀`, store?.hello?.sessions?.length === 1 && (await index(page)) === '1', JSON.stringify(store))
  })

  // ── e. 이야기 회차(ep01) 한글 보고 말하기 ────────────────────────────
  const EP = itemsForSet('ep01')
  const EPN = EP.length
  const GONE_IDS = ['exam-answer', 'exam-meaning', 'exam-listen', 'exam-reply', 'exam-answer-label', 'exam-other-ways', 'practice-reply']
  const epTexts = EP.flatMap((i) => [i.en, i.ko, i.reply.en, i.reply.ko])
  const openEpExam = async (page, openMenu) => {
    await openMenu()
    await T(page, 'speaking-set-ep01').click()
    await T(page, 'speaking-menu-exam').click()
    await root(page).waitFor({ state: 'visible', timeout: 15000 })
  }
  const epLeaks = async (page, items = EP) => {
    const inner = await bodyText(page)
    return items.flatMap((i) => [i.en, i.ko, i.reply.en, i.reply.ko]).filter((s) => inner.includes(s))
  }
  for (const vp of VIEWPORTS) {
    await scenario('e1 ep01 공개 전', vp, {}, async ({ page, name, openMenu }) => {
      await openEpExam(page, openMenu)
      r.check(`${name} exam-progress "1 / ${EPN}"`, (await txt(page, 'exam-progress')) === `1 / ${EPN}`, await txt(page, 'exam-progress'))
      r.check(`${name} situation-text = examScene.situationKo`, (await txt(page, 'situation-text')) === EP[0].examScene.situationKo, await txt(page, 'situation-text'))
      r.check(`${name} situation-role 보임`, await T(page, 'situation-role').isVisible())
      const present = []
      for (const id of GONE_IDS) if ((await T(page, id).count()) > 0) present.push(id)
      r.check(`${name} 공개 전 DOM에 정답/뜻/듣기/상대 대사 없음`, present.length === 0, present.join(','))
      const leaks = await epLeaks(page)
      r.check(`${name} body에 ep01 전 문항 EN/KO/상대 대사 없음`, leaks.length === 0, leaks.join(' | '))
      r.check(`${name} speak 호출 0`, (await speakLog(page)).length === 0, JSON.stringify(await speakLog(page)))
      r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
    })
  }
  await scenario('e2 ep01 공개', VP, {}, async ({ page, name, openMenu, reveal }) => {
    await openEpExam(page, openMenu)
    await reveal()
    const it = EP[0]
    r.check(`${name} 라벨 "이렇게 말할 수 있어요"`, (await txt(page, 'exam-answer-label')) === '이렇게 말할 수 있어요')
    r.check(`${name} exam-answer = EN`, (await txt(page, 'exam-answer')) === it.en, await txt(page, 'exam-answer'))
    r.check(`${name} exam-meaning = KO`, (await txt(page, 'exam-meaning')) === it.ko, await txt(page, 'exam-meaning'))
    r.check(`${name} exam-reply에 reply EN 포함`, (await txt(page, 'exam-reply')).includes(it.reply.en), await txt(page, 'exam-reply'))
    r.check(`${name} 공개만으로는 speak 0`, (await speakLog(page)).length === 0)
    await T(page, 'exam-listen').click()
    const log = await waitUntil(async () => { const l = await speakLog(page); return l.length >= 1 ? l : null }, { timeout: 3000 })
    r.check(`${name} 듣기 → speak 1회 = EN`, !!log && log.length === 1 && log[0] === it.en, JSON.stringify(log))
    r.check(`${name} exam-other-ways 보임`, await T(page, 'exam-other-ways').isVisible())
  })
  await scenario('e3 ep01 내비게이션', VP, {}, async ({ page, name, openMenu, reveal, next }) => {
    await openEpExam(page, openMenu)
    await reveal()
    await next()
    r.check(`${name} 다음 → data-index=1 / data-revealed=false`, (await index(page)) === '1' && (await revealed(page)) === 'false')
    const present = []
    for (const id of GONE_IDS) if ((await T(page, id).count()) > 0) present.push(id)
    r.check(`${name} 다음 문항에 정답 요소 없음`, present.length === 0, present.join(','))
    const inner = await bodyText(page)
    r.check(`${name} body에 2번 EN/상대 대사 없음`, !inner.includes(EP[1].en) && !inner.includes(EP[1].reply.en))
    await T(page, 'exam-back').click()
    await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 메뉴에서 ep01 선택 유지`, (await T(page, 'speaking-set-ep01').getAttribute('aria-pressed')) === 'true')
    await T(page, 'speaking-menu-exam').click()
    await root(page).waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 재진입 → data-index=0 / 미공개`, (await index(page)) === '0' && (await revealed(page)) === 'false')
  })
  await scenario('e4 ep01 다시 연습', VP, {}, async ({ page, name, openMenu, reveal }) => {
    await openEpExam(page, openMenu)
    await reveal()
    await T(page, 'exam-retry').click()
    const panel = T(page, 'exam-practice-panel')
    r.check(`${name} 패널 보임`, await panel.isVisible().catch(() => false))
    r.check(`${name} 패널 practice-sentence = EN`, ((await panel.locator('[data-testid="practice-sentence"]').textContent()) || '').trim() === EP[0].en)
    r.check(`${name} 패널 practice-reply 보임`, await panel.locator('[data-testid="practice-reply"]').isVisible().catch(() => false))
    r.check(`${name} exam-next 활성`, await T(page, 'exam-next').isEnabled())
  })
  const basicSeed = JSON.stringify({ hello: { lastPracticedDate: '2026-01-01', sessions: [{ date: '2026-01-01', scene: 'hello-a', stage: 'recall', hintLevel: 1, selfReport: 'hard', recorded: false }] } })
  await scenario('e5 ep01 저장', VP, { seed: { [KEY(QA_STUDENT_ID)]: basicSeed } }, async ({ page, name, openMenu, reveal, next }) => {
    await openEpExam(page, openMenu)
    await reveal()
    await T(page, 'exam-self-can').click()
    await next()
    const store = await readStore(page)
    const rec = store?.[EP[0].id]
    const last = (rec?.sessions || []).slice(-1)[0] || {}
    r.check(`${name} ${EP[0].id} 기록 stage='exam', selfReport='can'`, last.stage === 'exam' && last.selfReport === 'can', JSON.stringify(store))
    r.check(`${name} 기존 basic(hello) 기록 무영향`, JSON.stringify(store?.hello) === JSON.stringify(JSON.parse(basicSeed).hello))
  })

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
