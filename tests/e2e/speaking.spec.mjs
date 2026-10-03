// tests/e2e/speaking.spec.mjs
//
// Speaking 첫 체험(SpeakingPractice.jsx, 2026-10-04) 회귀 스펙. headless Chromium엔
// 마이크가 없으므로 launch 플래그 대신 addInitScript로 navigator.mediaDevices.
// getUserMedia를 시나리오별로 대체한다(synth=AudioContext 오실레이터의 실제
// MediaStream, denied/nodevice/busy=오류, hang=영원히 대기). 실제 네트워크 0건.
// 파일당 소유권 원칙(규칙 16)에 따라 다른 spec의 헬퍼는 복제한다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { SPEAKING_QUESTIONS, SPEAKING_MESSAGES } from '../../src/utils/speaking/speakingSession.js'

const VP = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }
const HOME = '[data-testid="student-home"]'
const T = (page, id) => page.locator(`[data-testid="${id}"]`)

const MSG = {
  recording: '녹음 중이에요… 끝나면 그만을 눌러요',
  requesting: '마이크를 켜는 중이에요. 허용을 눌러 주세요',
  recorded: '잘했어요! 들어보거나 다시 녹음해요',
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

async function installMic(page, mode) {
  await page.addInitScript((m) => {
    window.__micTracks = []
    const md = navigator.mediaDevices
    if (!md) return
    const errOf = (name) => Promise.reject(Object.assign(new Error('e2e-' + name), { name }))
    md.getUserMedia = async () => {
      if (m === 'denied') return errOf('NotAllowedError')
      if (m === 'nodevice') return errOf('NotFoundError')
      if (m === 'busy') return errOf('NotReadableError')
      if (m === 'hang') return new Promise(() => {})
      const ctx = new AudioContext()
      await ctx.resume().catch(() => {})
      const osc = ctx.createOscillator()
      const dest = ctx.createMediaStreamDestination()
      osc.connect(dest)
      osc.start()
      dest.stream.getTracks().forEach((t) => window.__micTracks.push(t))
      return dest.stream
    }
  }, mode)
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
  // 업로드/STT 계열 엔드포인트로 나간 요청은 메서드 무관하게 위반
  const upload = apiCallLog.filter((c) => /upload|stt|transcri|speech-to-text|storage\/v1/i.test(c.url)).map((c) => `${c.method} ${path(c.url)}`)
  return [...rest, ...upload]
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const state = (page) => T(page, 'speaking-practice').getAttribute('data-mic-state')
const statusText = async (page) => ((await T(page, 'speaking-status').textContent()) || '').trim()
const audioSrc = (page) => T(page, 'speaking-audio').evaluate((a) => a.getAttribute('src') || '')
const tracksEnded = (page) => page.evaluate(() => (window.__micTracks || []).length > 0 && window.__micTracks.every((t) => t.readyState === 'ended'))
const tracksCount = (page) => page.evaluate(() => (window.__micTracks || []).length)

export async function run(browser, baseURL) {
  const r = createRecorder('[speaking]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  async function scenario(label, vp, { mic = 'synth', flags, userAgent, writeGuard = true } = {}, body) {
    const context = await browser.newContext({ viewport: vp, ...(userAgent ? { userAgent } : {}) })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    await installMic(page, mic)
    if (flags) await setDeviceFlags(page, flags)
    const { db, unmockedRequests: u, ttsFallbackRequests: t, apiCallLog } = await installMocks(page)
    const name = `${label} [${vp.width}x${vp.height}]`
    // 홈 → 말하기 카드(활성) → 말하기 화면
    const openSpeaking = async () => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-menu-speaking').click()
      await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    }
    const home = () => T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, openSpeaking, home })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      if (writeGuard) {
        const bad = badWrites(apiCallLog)
        r.check(`${name} 로그인 외 REST 쓰기/업로드·STT 요청 0건`, bad.length === 0, bad.slice(0, 3).join(' | '))
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
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

  // ── a. 진입 ──────────────────────────────────────────────────────────
  for (const vp of [VP, DESKTOP]) {
    await scenario('a 진입', vp, {}, async ({ page, name, openSpeaking, home }) => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      const c = T(page, 'student-home-menu-speaking')
      r.check(`${name} 말하기 카드 활성(aria-disabled 없음, 준비 중 배지 없음)`,
        (await c.getAttribute('aria-disabled')) === null && !((await c.textContent()) || '').includes('준비 중'))
      await openSpeaking()
      r.check(`${name} h1 "말하기 연습"`, await page.getByRole('heading', { name: '말하기 연습', level: 1 }).isVisible())
      const q = ((await T(page, 'speaking-question').textContent()) || '')
      r.check(`${name} 질문 1/3 + 영어/한글 힌트`, q.includes('1/3') && q.includes(SPEAKING_QUESTIONS[0].en) && q.includes(SPEAKING_QUESTIONS[0].ko), q)
      r.check(`${name} status 비어 있음`, (await statusText(page)) === '')
      r.check(`${name} data-mic-state="idle"`, (await state(page)) === 'idle')
      r.check(`${name} SpeedBtn 없음`, (await page.locator('button[aria-label="발음 재생 속도"]').count()) === 0)
      r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
      const small = await page.locator('[data-testid="speaking-practice"] button').evaluateAll((els) =>
        els.filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height < 44 - 0.5 }).map((el) => el.textContent.trim()))
      r.check(`${name} 보이는 버튼 전부 높이 >=44px`, small.length === 0, small.join(','))
      await page.getByRole('button', { name: '← 홈' }).click()
      r.check(`${name} "← 홈" → 학생 홈`, await home())
      const focused = await waitUntil(async () => (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'student-home-menu-speaking', { timeout: 3000 })
      r.check(`${name} 포커스가 말하기 카드로 복귀`, !!focused)
    })
  }

  // ── b. 정상 흐름 ─────────────────────────────────────────────────────
  await scenario('b 정상 녹음/재생', VP, {}, async ({ page, name, openSpeaking }) => {
    await openSpeaking()
    await T(page, 'speaking-record').click()
    r.check(`${name} 녹음 중 — status "${MSG.recording}"`, !!(await waitUntil(async () => (await statusText(page)) === MSG.recording, { timeout: 8000 })), await statusText(page))
    r.check(`${name} 타이머 표시`, await T(page, 'speaking-timer').isVisible().catch(() => false))
    r.check(`${name} data-mic-state="live"`, (await state(page)) === 'live')
    await sleep(1200)
    await T(page, 'speaking-stop').click()
    r.check(`${name} 그만 → status "잘했어요…"`, !!(await waitUntil(async () => (await statusText(page)) === MSG.recorded, { timeout: 8000 })), await statusText(page))
    r.check(`${name} audio src가 blob:`, (await audioSrc(page)).startsWith('blob:'), await audioSrc(page))
    r.check(`${name} 녹음 중 타이머/그만 사라짐`, (await T(page, 'speaking-stop').count()) === 0)

    await T(page, 'speaking-play').click()
    const playing = await waitUntil(() => T(page, 'speaking-audio').evaluate((a) => !a.paused), { timeout: 800, interval: 40 })
    r.check(`${name} 들어보기 → audio 재생 중(paused===false)`, !!playing)
    const done = await waitUntil(async () => (await T(page, 'speaking-play').isEnabled()) && (await T(page, 'speaking-retake').isEnabled()), { timeout: 8000 })
    r.check(`${name} 재생 끝 → 버튼 다시 활성`, !!done)

    const srcBefore = await audioSrc(page)
    await T(page, 'speaking-retake').click()
    r.check(`${name} 다시 녹음 → 이전 src 비워짐`, (await audioSrc(page)) === '')
    await recordFor(page, 1000)
    await waitUntil(async () => (await audioSrc(page)).startsWith('blob:'), { timeout: 8000 })
    const srcAfter = await audioSrc(page)
    r.check(`${name} 두 번째 녹음 후 새 src`, srcAfter.startsWith('blob:') && srcAfter !== srcBefore, `${srcBefore} -> ${srcAfter}`)

    await T(page, 'speaking-next').click()
    const q2 = ((await T(page, 'speaking-question').textContent()) || '')
    r.check(`${name} 다음 → 질문 2/3`, q2.includes('2/3') && q2.includes(SPEAKING_QUESTIONS[1].en), q2)
    r.check(`${name} 다음 → src 비워짐 + status 초기화`, (await audioSrc(page)) === '' && (await statusText(page)) === '')
    await T(page, 'speaking-prev').click()
    r.check(`${name} 이전 → 질문 1/3`, ((await T(page, 'speaking-question').textContent()) || '').includes('1/3'))
  })

  // ── c. 빈 녹음 ───────────────────────────────────────────────────────
  await scenario('c 빈 녹음', VP, {}, async ({ page, name, openSpeaking }) => {
    await openSpeaking()
    await T(page, 'speaking-record').click()
    await T(page, 'speaking-stop').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'speaking-stop').click() // 즉시 — 500ms 미만
    r.check(`${name} 즉시 그만 → status "${SPEAKING_MESSAGES.empty}"`, !!(await waitUntil(async () => (await statusText(page)) === SPEAKING_MESSAGES.empty, { timeout: 5000 })), await statusText(page))
    r.check(`${name} 빈 녹음은 src 없음`, (await audioSrc(page)) === '')
    const retake = T(page, 'speaking-retake')
    r.check(`${name} 다시 녹음 활성`, await retake.isEnabled().catch(() => false))
    await retake.click()
    await recordFor(page, 1200)
    r.check(`${name} 다시 해서 정상 녹음됨`, !!(await waitUntil(async () => (await statusText(page)) === MSG.recorded && (await audioSrc(page)).startsWith('blob:'), { timeout: 8000 })), await statusText(page))
  })

  // ── d. 마이크 오류 3종 ───────────────────────────────────────────────
  for (const [mic, code] of [['denied', 'denied'], ['nodevice', 'nodevice'], ['busy', 'busy']]) {
    await scenario(`d 마이크 ${mic}`, VP, { mic }, async ({ page, name, openSpeaking, home }) => {
      await openSpeaking()
      await T(page, 'speaking-record').click()
      r.check(`${name} status = "${SPEAKING_MESSAGES[code]}"`, !!(await waitUntil(async () => (await statusText(page)) === SPEAKING_MESSAGES[code], { timeout: 8000 })), await statusText(page))
      r.check(`${name} data-mic-state가 live 아님`, (await state(page)) !== 'live', String(await state(page)))
      const retake = T(page, 'speaking-retake')
      r.check(`${name} 다시 녹음 버튼 사용 가능`, await retake.isEnabled().catch(() => false))
      await retake.click()
      r.check(`${name} 다시 녹음 → 녹음 시작 버튼 복귀`, await T(page, 'speaking-record').isVisible().catch(() => false))
      await page.getByRole('button', { name: '← 홈' }).click()
      r.check(`${name} "← 홈" → 학생 홈`, await home())
    })
  }

  // ── e. 떠나면 마이크 해제 ────────────────────────────────────────────
  await scenario('e 이탈 시 마이크 해제', VP, {}, async ({ page, name, openSpeaking, home }) => {
    await openSpeaking()
    await recordFor(page, 1000)
    await waitUntil(async () => (await statusText(page)) === MSG.recorded, { timeout: 8000 })
    r.check(`${name} 녹음 후 트랙 보유(live)`, (await tracksCount(page)) > 0 && !(await tracksEnded(page)))
    await page.getByRole('button', { name: '← 홈' }).click()
    await home()
    r.check(`${name} 정상 종료 후 "← 홈" → 모든 트랙 ended`, await tracksEnded(page))
    // 녹음 도중 이탈
    await T(page, 'student-home-menu-speaking').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'speaking-record').click()
    await T(page, 'speaking-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(400)
    await page.getByRole('button', { name: '← 홈' }).click()
    r.check(`${name} 녹음 도중 "← 홈" → 학생 홈`, await home())
    r.check(`${name} 녹음 도중 이탈 → 모든 트랙 ended`, !!(await waitUntil(() => tracksEnded(page), { timeout: 3000 })))
  })

  // ── f. 녹음 중 탭 숨김 ───────────────────────────────────────────────
  await scenario('f 탭 숨김', VP, {}, async ({ page, name, openSpeaking }) => {
    await openSpeaking()
    await T(page, 'speaking-record').click()
    await T(page, 'speaking-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(900)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const stopped = await waitUntil(async () => (await T(page, 'speaking-stop').count()) === 0, { timeout: 5000 })
    r.check(`${name} 숨김 → 녹음 중단(그만 버튼 사라짐)`, !!stopped)
    const st = await statusText(page)
    r.check(`${name} 상태 문구가 녹음 중이 아님(녹음됨/빈 녹음)`, st !== MSG.recording && (st === MSG.recorded || st === SPEAKING_MESSAGES.empty), st)
    r.check(`${name} 트랙 ended`, !!(await waitUntil(() => tracksEnded(page), { timeout: 3000 })))
    r.check(`${name} data-mic-state="released"`, (await state(page)) === 'released', String(await state(page)))
  })

  // ── g. getUserMedia가 영원히 대기 ────────────────────────────────────
  await scenario('g 마이크 요청 대기', VP, { mic: 'hang' }, async ({ page, name, openSpeaking, home }) => {
    await openSpeaking()
    await T(page, 'speaking-record').click()
    r.check(`${name} status "${MSG.requesting}"`, !!(await waitUntil(async () => (await statusText(page)) === MSG.requesting, { timeout: 5000 })), await statusText(page))
    await page.getByRole('button', { name: '← 홈' }).click({ timeout: 5000 })
    r.check(`${name} 대기 중에도 "← 홈" → 학생 홈`, await home())
  })

  // ── h. 플래그 OFF — 준비 중 ──────────────────────────────────────────
  await scenario('h speakingPracticeV1 OFF', VP, { flags: { speakingPracticeV1: false } }, async ({ page, name }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    const c = T(page, 'student-home-menu-speaking')
    r.check(`${name} 말하기 카드 aria-disabled="true"`, (await c.getAttribute('aria-disabled')) === 'true')
    r.check(`${name} "준비 중" 배지`, ((await c.textContent()) || '').includes('준비 중'))
    await c.click({ force: true }) // Playwright는 aria-disabled를 disabled로 취급 — 실제 DOM click 핸들러는 그대로 실행
    r.check(`${name} 누르면 준비 중 안내`, !!(await waitUntil(async () => ((await T(page, 'student-home-notice').textContent()) || '').trim() === '말하기는 곧 열려요! 조금만 기다려요', { timeout: 2000 })))
    r.check(`${name} 말하기 화면으로 이동하지 않음`, (await T(page, 'speaking-practice').count()) === 0)
  })

  // ── i. 인앱 브라우저 ─────────────────────────────────────────────────
  // browserDetect.js IN_APP_UA_PATTERNS — /KAKAOTALK/i
  await scenario('i 인앱 브라우저', VP, { userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 KAKAOTALK 2510' }, async ({ page, name, openSpeaking, home }) => {
    await openSpeaking()
    r.check(`${name} 인앱 브라우저 안내 표시`, await page.getByText('지금 카카오톡(또는 다른 앱) 브라우저로 열려있어요').isVisible().catch(() => false))
    r.check(`${name} 녹음 시작 버튼 없음`, (await T(page, 'speaking-record').count()) === 0)
    await page.getByRole('button', { name: '← 홈' }).click()
    r.check(`${name} "← 홈" → 학생 홈`, await home())
  })

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
