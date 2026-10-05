// tests/e2e/speaking.spec.mjs
//
// Speaking UX v2(2026-10-04) 회귀 스펙 — 메뉴(회화 연습/그림 시험) + 회화 연습 모드.
// 설계: docs/design/SPEAKING_UX_V2_2026-10-04.md. 시험 모드는 speakingExam.spec.mjs.
// headless Chromium엔 마이크가 없으므로 addInitScript로 navigator.mediaDevices.getUserMedia를
// 시나리오별로 대체한다(synth=AudioContext 오실레이터의 실제 MediaStream, denied/nodevice/busy=오류,
// hang=영원히 대기). 🔊 듣기는 speechSynthesis.speak를 감싸 호출 횟수/문장을 센다. 실제 네트워크 0건.
// 파일당 소유권 원칙(규칙 16)에 따라 다른 spec의 헬퍼는 복제한다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID } from './fixtures/index.mjs'
import { SPEAKING_MESSAGES } from '../../src/utils/speaking/speakingSession.js'
import { SITUATION_EXPRESSIONS, sceneFor } from '../../src/utils/situation/situationContent.js'
import { itemsForSet, keySentenceFor, lastSetKey, DEFAULT_SET_ID } from '../../src/utils/situation/speakingSets.js'

const VP = { width: 390, height: 844 }
const VPS = [{ width: 360, height: 640 }, VP, { width: 412, height: 915 }]
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const E = SITUATION_EXPRESSIONS

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
const speakLog = (page) => page.evaluate(() => window.__speak || [])
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()
const smallButtons = (page, rootId) => page.locator(`[data-testid="${rootId}"] button`).evaluateAll((els) =>
  els.filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height < 44 - 0.5 }).map((el) => el.textContent.trim()))

export async function run(browser, baseURL) {
  const r = createRecorder('[speaking]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  async function scenario(label, vp, { mic = 'synth', flags, userAgent, writeGuard = true, reduced = false, fresh = false } = {}, body) {
    const context = await browser.newContext({ viewport: vp, ...(userAgent ? { userAgent } : {}) })
    const page = await context.newPage()
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    // 기존 시나리오 = '기본 표현 5개'를 이전에 고른 학생(첫 방문 기본값 2화는 fresh:true 시나리오가 검사). 이미 값이 있으면 덮지 않는다(새로고침 유지 검사용)
    if (!fresh) await page.addInitScript((k) => { try { if (localStorage.getItem(k) === null) localStorage.setItem(k, 'basic') } catch { /* 무시 */ } }, lastSetKey(QA_STUDENT_ID))
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    await installMic(page, mic)
    if (flags) await setDeviceFlags(page, flags)
    const { db, unmockedRequests: u, ttsFallbackRequests: t, apiCallLog } = await installMocks(page)
    await installSpeakCounter(page)
    const name = `${label} [${vp.width}x${vp.height}]`
    // 홈 → 말하기 카드 → 메뉴
    const openMenu = async () => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      await T(page, 'student-home-menu-speaking').click()
      await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 15000 })
    }
    const openPractice = async () => {
      await openMenu()
      await T(page, 'speaking-menu-practice').click()
      await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    }
    const home = () => T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
    // 연습 → 메뉴 → 홈
    const leaveToHome = async () => {
      await T(page, 'speaking-back').click({ timeout: 5000 })
      await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 10000 })
      await T(page, 'speaking-menu-home').click()
      return home()
    }
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, openMenu, openPractice, home, leaveToHome, tts: t })
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

  // ── a. 메뉴: 동일 크기 큰 버튼 2개 ───────────────────────────────────
  for (const vp of VPS) {
    await scenario('a 메뉴', vp, {}, async ({ page, name, openMenu, home }) => {
      await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
      const c = T(page, 'student-home-menu-speaking')
      r.check(`${name} 말하기 카드 활성(aria-disabled 없음, 준비 중 배지 없음)`,
        (await c.getAttribute('aria-disabled')) === null && !((await c.textContent()) || '').includes('준비 중'))
      await openMenu()
      r.check(`${name} 메뉴 진입 시 회화 연습/시험 버튼 보임`, (await T(page, 'speaking-menu-practice').isVisible()) && (await T(page, 'speaking-menu-exam').isVisible()))
      const bp = await T(page, 'speaking-menu-practice').boundingBox()
      const be = await T(page, 'speaking-menu-exam').boundingBox()
      r.check(`${name} 두 버튼 높이 동일(±1px)`, !!bp && !!be && Math.abs(bp.height - be.height) <= 1, `${bp?.height} vs ${be?.height}`)
      r.check(`${name} 두 버튼 높이 >=44px`, !!bp && !!be && bp.height >= 43.5 && be.height >= 43.5, `${bp?.height}/${be?.height}`)
      r.check(`${name} 두 버튼 너비 동일`, !!bp && !!be && Math.abs(bp.width - be.width) <= 1, `${bp?.width} vs ${be?.width}`)
      const full = await page.evaluate(() => ['speaking-menu-practice', 'speaking-menu-exam'].map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        return el.getBoundingClientRect().width >= el.parentElement.clientWidth - 1
      }))
      r.check(`${name} 두 버튼 모두 컨테이너 전체 너비`, full.every(Boolean), JSON.stringify(full))
      r.check(`${name} 시험 진입이 작은 우회 버튼이 아님(둘 다 같은 클래스 크기)`, !!bp && !!be && be.height >= bp.height - 1)
      r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
      r.check(`${name} 메뉴 보이는 버튼 전부 높이 >=44px`, (await smallButtons(page, 'speaking-menu')).length === 0)
      await T(page, 'speaking-menu-home').click()
      r.check(`${name} 메뉴 "← 홈" → 학생 홈`, await home())
      const focused = await waitUntil(async () => (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'student-home-menu-speaking', { timeout: 3000 })
      r.check(`${name} 포커스가 말하기 카드로 복귀`, !!focused)
    })
  }

  // ── b. 연습 문항: 한글 상황+문장+뜻+듣기 한 화면(207차: 임시 그림 숨김) ──────────────────────────
  for (const vp of VPS) {
    await scenario('b 연습 문항', vp, {}, async ({ page, name, openPractice }) => {
      await openPractice()
      const root = T(page, 'speaking-practice')
      r.check(`${name} data-index=0 / data-expr=${E[0].id}`, (await root.getAttribute('data-index')) === '0' && (await root.getAttribute('data-expr')) === E[0].id)
      const vis = await Promise.all(['situation-guide', 'practice-sentence', 'practice-meaning', 'practice-listen'].map((id) => T(page, id).isVisible()))
      r.check(`${name} 상황/문장/뜻/듣기 추가 클릭 없이 모두 보임`, vis.every(Boolean), JSON.stringify(vis))
      r.check(`${name} situation-guide data-scene="hello-a"`, (await T(page, 'situation-guide').getAttribute('data-scene')) === 'hello-a', String(await T(page, 'situation-guide').getAttribute('data-scene')))
      r.check(`${name} 한글 상황 = 연습 장면 A situationKo`, (await txt(page, 'situation-text')) === sceneFor('hello', 'a').situationKo, await txt(page, 'situation-text'))
      r.check(`${name} 임시 그림(scene-card) 없음 — 최종 일러스트 전까지 숨김`, (await T(page, 'scene-card').count()) === 0)
      r.check(`${name} 문장 = EN`, (await txt(page, 'practice-sentence')) === E[0].en, await txt(page, 'practice-sentence'))
      r.check(`${name} 뜻 = KO`, (await txt(page, 'practice-meaning')) === E[0].ko, await txt(page, 'practice-meaning'))
      const sc = await T(page, 'situation-guide').boundingBox()
      const se = await T(page, 'practice-sentence').boundingBox()
      r.check(`${name} 한글 상황이 영어 문장보다 위(y 순서)`, !!sc && !!se && sc.y + sc.height <= se.y + 1, `${sc?.y}+${sc?.height} vs ${se?.y}`)
      const fs = await T(page, 'practice-sentence').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
      r.check(`${name} 영어 문장 font-size >=24px`, fs >= 24, String(fs))
      r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
      const small = await smallButtons(page, 'speaking-practice')
      r.check(`${name} 보이는 버튼 전부 높이 >=44px`, small.length === 0, small.join(','))
      r.check(`${name} SpeedBtn 없음`, (await page.locator('button[aria-label="발음 재생 속도"]').count()) === 0)
      r.check(`${name} 정답 숨김 요소 없음(연습엔 exam-* 없음)`, (await page.locator('[data-testid^="exam-"]').count()) === 0)
    })
  }
  await scenario('b 연습 문항 1280', { width: 1280, height: 800 }, {}, async ({ page, name, openPractice }) => {
    await openPractice()
    const vis = await Promise.all(['situation-guide', 'practice-sentence', 'practice-meaning', 'practice-listen'].map((id) => T(page, id).isVisible()))
    r.check(`${name} 상황/문장/뜻/듣기 모두 보임`, vis.every(Boolean))
    r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
  })

  // ── c. 듣기 ──────────────────────────────────────────────────────────
  await scenario('c 듣기', VP, {}, async ({ page, name, openPractice, tts }) => {
    await openPractice()
    r.check(`${name} 진입만으로는 speak 호출 0`, (await speakLog(page)).length === 0)
    await T(page, 'practice-listen').click()
    const log = await waitUntil(async () => { const l = await speakLog(page); return l.length >= 1 ? l : null }, { timeout: 3000 })
    r.check(`${name} 듣기 → speechSynthesis.speak 호출 >=1`, !!log, JSON.stringify(log))
    r.check(`${name} 호출 문장 = EN`, !!log && log[log.length - 1] === E[0].en, JSON.stringify(log))
    r.check(`${name} 듣기 중 화면 유지(연습 루트 그대로)`, await T(page, 'speaking-practice').isVisible())
    await T(page, 'practice-next').click()
    await T(page, 'practice-listen').click()
    const log2 = await waitUntil(async () => { const l = await speakLog(page); return l.length >= 2 ? l : null }, { timeout: 3000 })
    r.check(`${name} 2번 문항 듣기 → 문장 = 2번 EN`, !!log2 && log2[log2.length - 1] === E[1].en, JSON.stringify(log2))
    r.check(`${name} 합성 음성 없음 환경에서도 TTS 네트워크 폴백 요청 0건(speak 경로)`, tts.length === 0, JSON.stringify(tts.slice(0, 2)))
  })

  // ── d. 정상 흐름: 녹음→그만→들어보기→다시 녹음→다음 ──────────────────
  await scenario('d 정상 녹음/재생', VP, {}, async ({ page, name, openPractice }) => {
    await openPractice()
    r.check(`${name} 초기 status 비어 있음 + data-mic-state="idle"`, (await statusText(page)) === '' && (await state(page)) === 'idle')
    await T(page, 'speaking-record').click()
    r.check(`${name} 녹음 중 — status "${MSG.recording}"`, !!(await waitUntil(async () => (await statusText(page)) === MSG.recording, { timeout: 8000 })), await statusText(page))
    r.check(`${name} 타이머 표시`, await T(page, 'speaking-timer').isVisible().catch(() => false))
    r.check(`${name} data-mic-state="live"`, (await state(page)) === 'live')
    r.check(`${name} 녹음 중 다음/이전/메뉴/듣기 비활성`, (await T(page, 'practice-next').isDisabled()) && (await T(page, 'practice-prev').isDisabled()) && (await T(page, 'speaking-back').isDisabled()) && (await T(page, 'practice-listen').isDisabled()))
    await sleep(1200)
    await T(page, 'speaking-stop').click()
    r.check(`${name} 그만 → status "잘했어요…"`, !!(await waitUntil(async () => (await statusText(page)) === MSG.recorded, { timeout: 8000 })), await statusText(page))
    r.check(`${name} audio src가 blob:`, (await audioSrc(page)).startsWith('blob:'), await audioSrc(page))
    r.check(`${name} 녹음 후 타이머/그만 사라짐`, (await T(page, 'speaking-stop').count()) === 0)

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

    await T(page, 'practice-next').click()
    r.check(`${name} 다음 → 2번 문항(data-index=1, 문장=2번 EN)`, (await T(page, 'speaking-practice').getAttribute('data-index')) === '1' && (await txt(page, 'practice-sentence')) === E[1].en)
    r.check(`${name} 다음 → src 비워짐 + status 초기화`, (await audioSrc(page)) === '' && (await statusText(page)) === '')
    r.check(`${name} 다음 → situation-guide data-scene="help-a"`, (await T(page, 'situation-guide').getAttribute('data-scene')) === 'help-a', String(await T(page, 'situation-guide').getAttribute('data-scene')))
    await T(page, 'practice-prev').click()
    r.check(`${name} 이전 → 1번 문항`, (await T(page, 'speaking-practice').getAttribute('data-index')) === '0' && (await txt(page, 'practice-sentence')) === E[0].en)
    r.check(`${name} 1번에서 이전 비활성`, await T(page, 'practice-prev').isDisabled())
  })

  // ── e. 빈 녹음 ───────────────────────────────────────────────────────
  await scenario('e 빈 녹음', VP, {}, async ({ page, name, openPractice }) => {
    await openPractice()
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

  // ── f. 마이크 오류 3종 ───────────────────────────────────────────────
  for (const mic of ['denied', 'nodevice', 'busy']) {
    await scenario(`f 마이크 ${mic}`, VP, { mic }, async ({ page, name, openPractice, home, leaveToHome }) => {
      await openPractice()
      await T(page, 'speaking-record').click()
      r.check(`${name} status = "${SPEAKING_MESSAGES[mic]}"`, !!(await waitUntil(async () => (await statusText(page)) === SPEAKING_MESSAGES[mic], { timeout: 8000 })), await statusText(page))
      r.check(`${name} data-mic-state가 live 아님`, (await state(page)) !== 'live', String(await state(page)))
      r.check(`${name} 오류에도 상황/문장/듣기 그대로 보임`, (await T(page, 'situation-guide').isVisible()) && (await T(page, 'practice-sentence').isVisible()) && (await T(page, 'practice-listen').isEnabled()))
      const retake = T(page, 'speaking-retake')
      r.check(`${name} 다시 녹음 버튼 사용 가능`, await retake.isEnabled().catch(() => false))
      await retake.click()
      r.check(`${name} 다시 녹음 → 녹음 시작 버튼 복귀`, await T(page, 'speaking-record').isVisible().catch(() => false))
      r.check(`${name} 메뉴 경유 "← 홈" → 학생 홈`, await leaveToHome())
    })
  }

  // ── g. 떠나면 마이크 해제 ────────────────────────────────────────────
  await scenario('g 이탈 시 마이크 해제', VP, {}, async ({ page, name, openPractice, home, leaveToHome }) => {
    await openPractice()
    await recordFor(page, 1000)
    await waitUntil(async () => (await statusText(page)) === MSG.recorded, { timeout: 8000 })
    r.check(`${name} 녹음 후 트랙 보유(live)`, (await tracksCount(page)) > 0 && !(await tracksEnded(page)))
    await T(page, 'speaking-back').click()
    await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 정상 종료 후 "← 메뉴" → 모든 트랙 ended`, !!(await waitUntil(() => tracksEnded(page), { timeout: 3000 })))
    await T(page, 'speaking-menu-home').click()
    await home()
    // 녹음 도중 이탈: 녹음 중엔 ← 메뉴가 비활성이라 홈 화면 전환(메뉴 홈)으로는 갈 수 없다 — 그만 후 이탈
    await T(page, 'student-home-menu-speaking').click()
    await T(page, 'speaking-menu-practice').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    await T(page, 'speaking-record').click()
    await T(page, 'speaking-stop').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(400)
    r.check(`${name} 녹음 도중 "← 메뉴" 비활성`, await T(page, 'speaking-back').isDisabled())
    await T(page, 'speaking-stop').click()
    await waitUntil(async () => !(await T(page, 'speaking-stop').count()), { timeout: 5000 })
    r.check(`${name} 그만 후 메뉴 경유 홈`, await leaveToHome())
    r.check(`${name} 이탈 후 모든 트랙 ended`, !!(await waitUntil(() => tracksEnded(page), { timeout: 3000 })))
  })

  // ── h. 녹음 중 탭 숨김 ───────────────────────────────────────────────
  await scenario('h 탭 숨김', VP, {}, async ({ page, name, openPractice }) => {
    await openPractice()
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

  // ── i. getUserMedia가 영원히 대기 ────────────────────────────────────
  await scenario('i 마이크 요청 대기', VP, { mic: 'hang' }, async ({ page, name, openPractice, leaveToHome }) => {
    await openPractice()
    await T(page, 'speaking-record').click()
    r.check(`${name} status "${MSG.requesting}"`, !!(await waitUntil(async () => (await statusText(page)) === MSG.requesting, { timeout: 5000 })), await statusText(page))
    r.check(`${name} 대기 중에도 "← 메뉴" → 메뉴 → 홈`, await leaveToHome())
  })

  // ── j. 플래그 OFF — 준비 중 ──────────────────────────────────────────
  await scenario('j speakingPracticeV1 OFF', VP, { flags: { speakingPracticeV1: false } }, async ({ page, name }) => {
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 20000 })
    const c = T(page, 'student-home-menu-speaking')
    r.check(`${name} 말하기 카드 aria-disabled="true"`, (await c.getAttribute('aria-disabled')) === 'true')
    r.check(`${name} "준비 중" 배지`, ((await c.textContent()) || '').includes('준비 중'))
    await c.click({ force: true }) // Playwright는 aria-disabled를 disabled로 취급 — 실제 DOM click 핸들러는 그대로 실행
    r.check(`${name} 누르면 준비 중 안내`, !!(await waitUntil(async () => ((await T(page, 'student-home-notice').textContent()) || '').trim() === '말하기는 곧 열려요! 조금만 기다려요', { timeout: 2000 })))
    r.check(`${name} 메뉴/연습 화면으로 이동하지 않음`, (await T(page, 'speaking-menu').count()) === 0 && (await T(page, 'speaking-practice').count()) === 0)
  })

  // ── k. 인앱 브라우저 ─────────────────────────────────────────────────
  // browserDetect.js IN_APP_UA_PATTERNS — /KAKAOTALK/i. 메뉴/그림/문장/듣기는 그대로 쓰고
  // 녹음 영역만 안내로 대체된다(마이크 없이도 연습·시험 전 과정 사용 가능).
  const KAKAO = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 KAKAOTALK 2510'
  const NOTICE = '지금 카카오톡(또는 다른 앱) 브라우저로 열려있어요'
  await scenario('k 인앱 브라우저', VP, { userAgent: KAKAO }, async ({ page, name, openMenu, home }) => {
    await openMenu()
    r.check(`${name} 메뉴는 정상(회화 연습/시험 버튼 보임)`, (await T(page, 'speaking-menu-practice').isVisible()) && (await T(page, 'speaking-menu-exam').isVisible()))
    await T(page, 'speaking-menu-practice').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 연습: 인앱 브라우저 안내 표시`, await page.getByText(NOTICE).isVisible().catch(() => false))
    r.check(`${name} 연습: 녹음 시작 버튼 없음`, (await T(page, 'speaking-record').count()) === 0)
    r.check(`${name} 연습: 상황/문장/뜻/듣기는 그대로 보임`, (await Promise.all(['situation-guide', 'practice-sentence', 'practice-meaning', 'practice-listen'].map((id) => T(page, id).isVisible()))).every(Boolean))
    await T(page, 'practice-next').click()
    r.check(`${name} 연습: 다음 문항으로 진행 가능`, (await T(page, 'speaking-practice').getAttribute('data-index')) === '1')
    await T(page, 'speaking-back').click()
    await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'speaking-menu-exam').click()
    await T(page, 'speaking-exam').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 시험: 안내 표시 + 녹음 버튼 없음`, (await page.getByText(NOTICE).isVisible().catch(() => false)) && (await T(page, 'speaking-record').count()) === 0)
    await T(page, 'exam-reveal').click()
    r.check(`${name} 시험: 마이크 없이 답 확인 가능`, (await T(page, 'exam-answer').isVisible()) && (await T(page, 'exam-next').isEnabled()))
    await T(page, 'exam-back').click()
    await T(page, 'speaking-menu').waitFor({ state: 'visible', timeout: 10000 })
    await T(page, 'speaking-menu-home').click()
    r.check(`${name} 메뉴 "← 홈" → 학생 홈`, await home())
  })

  // ── m. 5문항 끝 → 큰 "한글 보고 말하기 시작" → 시험 1번 ─────────────────────
  await scenario('m 연습 완료', VP, {}, async ({ page, name, openPractice }) => {
    await openPractice()
    const seen = []
    for (let i = 0; i < E.length; i++) {
      seen.push(await txt(page, 'practice-sentence'))
      r.check(`${name} ${i + 1}번 문항 h1 "${i + 1}/5"`, ((await page.getByRole('heading', { level: 1 }).textContent()) || '').includes(`${i + 1}/5`))
      await T(page, 'practice-next').click()
    }
    r.check(`${name} 5문항 문장이 표현 5개 순서대로`, JSON.stringify(seen) === JSON.stringify(E.map((e) => e.en)), JSON.stringify(seen))
    await T(page, 'practice-done').waitFor({ state: 'visible', timeout: 5000 })
    r.check(`${name} practice-done 보임 + 문항 UI 사라짐`, (await T(page, 'practice-sentence').count()) === 0)
    const bs = await T(page, 'practice-start-exam').boundingBox()
    const parentW = await T(page, 'practice-start-exam').evaluate((el) => { const p = el.parentElement; const cs = getComputedStyle(p); return p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) })
    r.check(`${name} 한글 보고 말하기 시작 버튼 높이 >=56px`, !!bs && bs.height >= 55.5, String(bs?.height))
    r.check(`${name} 한글 보고 말하기 시작 버튼 카드 안 전체 너비`, !!bs && bs.width >= parentW - 1, `${bs?.width} vs ${parentW}`)
    const bb = await T(page, 'practice-back-menu').boundingBox()
    r.check(`${name} 시험 시작이 메뉴로 버튼보다 큼`, !!bs && !!bb && bs.height > bb.height, `${bs?.height} vs ${bb?.height}`)
    r.check(`${name} 완료 화면 가로 스크롤 없음 + 버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'speaking-practice')).length === 0)
    await T(page, 'practice-start-exam').click()
    await T(page, 'speaking-exam').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 시험 시작 → speaking-exam 1번(data-index=0, 미공개)`, (await T(page, 'speaking-exam').getAttribute('data-index')) === '0' && (await T(page, 'speaking-exam').getAttribute('data-revealed')) === 'false')
    r.check(`${name} 연습 화면 사라짐`, (await T(page, 'speaking-practice').count()) === 0)
  })
  await scenario('m 연습 완료 → 메뉴로', VP, {}, async ({ page, name, openPractice }) => {
    await openPractice()
    for (let i = 0; i < E.length; i++) await T(page, 'practice-next').click()
    await T(page, 'practice-done').waitFor({ state: 'visible', timeout: 5000 })
    await T(page, 'practice-back-menu').click()
    r.check(`${name} 메뉴로 → speaking-menu`, !!(await waitUntil(() => T(page, 'speaking-menu').isVisible(), { timeout: 5000 })))
    r.check(`${name} 연습 화면 사라짐`, (await T(page, 'speaking-practice').count()) === 0)
  })

  // ── n. 뒤로 → 메뉴 → 재진입 = 1번 ────────────────────────────────────
  await scenario('n 뒤로/재진입', VP, {}, async ({ page, name, openPractice }) => {
    await openPractice()
    await T(page, 'practice-next').click()
    await T(page, 'practice-next').click()
    r.check(`${name} 3번 문항 도달`, (await T(page, 'speaking-practice').getAttribute('data-index')) === '2')
    await T(page, 'speaking-back').click()
    r.check(`${name} 3번에서 뒤로 → speaking-menu`, !!(await waitUntil(() => T(page, 'speaking-menu').isVisible(), { timeout: 5000 })))
    await T(page, 'speaking-menu-practice').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 재진입 → 1번 문항(data-index=0, EN=${E[0].id})`, (await T(page, 'speaking-practice').getAttribute('data-index')) === '0' && (await txt(page, 'practice-sentence')) === E[0].en)
    r.check(`${name} 재진입 → 마이크 idle`, (await state(page)) === 'idle')
  })

  // ── s. 세트 선택(기본 / 이야기 회차) ─────────────────────────────────
  const EP = itemsForSet('ep01')
  const pressed = (page, id) => T(page, `speaking-set-${id}`).getAttribute('aria-pressed')
  const selectEp = async (page) => { await T(page, 'speaking-set-ep01').click() }
  for (const vp of [...VPS, { width: 1280, height: 800 }]) {
    await scenario('s1 세트 선택', vp, {}, async ({ page, name, openMenu }) => {
      await openMenu()
      r.check(`${name} 기본: basic aria-pressed=true / ep01 false`, (await pressed(page, 'basic')) === 'true' && (await pressed(page, 'ep01')) === 'false')
      await selectEp(page)
      r.check(`${name} ep01 클릭 → ep01 true / basic false`, (await pressed(page, 'ep01')) === 'true' && (await pressed(page, 'basic')) === 'false')
      const small = await page.locator('[data-testid^="speaking-set-"]').evaluateAll((els) =>
        els.filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height < 44 - 0.5 }).map((el) => el.textContent.trim()))
      r.check(`${name} 세트 버튼 전부 높이 >=44px`, small.length === 0, small.join(','))
      r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
    })
  }
  for (const vp of [...VPS, { width: 1280, height: 800 }]) {
    await scenario('s2 이야기 연습 ep01', vp, {}, async ({ page, name, openMenu }) => {
      await openMenu()
      await selectEp(page)
      await T(page, 'speaking-menu-practice').click()
      await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
      const N = EP.length
      const it = EP[0]
      const root = T(page, 'speaking-practice')
      r.check(`${name} 헤더 1/${N}`, ((await page.getByRole('heading', { level: 1 }).textContent()) || '').includes(`1/${N}`))
      r.check(`${name} speaking-set-label 보임`, await T(page, 'speaking-set-label').isVisible())
      r.check(`${name} data-expr=${it.exprId}`, (await root.getAttribute('data-expr')) === it.exprId)
      r.check(`${name} 상황 = situationKo`, (await txt(page, 'situation-text')) === it.practiceScene.situationKo, await txt(page, 'situation-text'))
      r.check(`${name} 역할에 roleKo 포함`, (await txt(page, 'situation-role')).includes(it.roleKo), await txt(page, 'situation-role'))
      r.check(`${name} 문장 = EN`, (await txt(page, 'practice-sentence')) === it.en, await txt(page, 'practice-sentence'))
      r.check(`${name} 뜻 = KO`, (await txt(page, 'practice-meaning')) === it.ko, await txt(page, 'practice-meaning'))
      const reply = await txt(page, 'practice-reply')
      r.check(`${name} 상대 대사 보임 + reply EN/KO 포함`, (await T(page, 'practice-reply').isVisible()) && reply.includes(it.reply.en) && reply.includes(it.reply.ko), reply)
      r.check(`${name} scene-card 없음`, (await T(page, 'scene-card').count()) === 0)
      await T(page, 'practice-listen').click()
      const l1 = await waitUntil(async () => { const l = await speakLog(page); return l.length >= 1 ? l : null }, { timeout: 3000 })
      r.check(`${name} 내 문장 듣기 → speak EN`, !!l1 && l1[l1.length - 1] === it.en, JSON.stringify(l1))
      await T(page, 'practice-reply-listen').click()
      const l2 = await waitUntil(async () => { const l = await speakLog(page); return l.length >= 2 ? l : null }, { timeout: 3000 })
      r.check(`${name} 상대 대사 듣기 → speak reply EN`, !!l2 && l2[l2.length - 1] === it.reply.en, JSON.stringify(l2))
      r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
      const small = await smallButtons(page, 'speaking-practice')
      r.check(`${name} 보이는 버튼 전부 높이 >=44px`, small.length === 0, small.join(','))
      await T(page, 'practice-next').click()
      r.check(`${name} 다음 → data-index=1 / data-expr=${EP[1].exprId}`, (await root.getAttribute('data-index')) === '1' && (await root.getAttribute('data-expr')) === EP[1].exprId)
      r.check(`${name} 다음 → 상황 갱신`, (await txt(page, 'situation-text')) === EP[1].practiceScene.situationKo, await txt(page, 'situation-text'))
      for (let i = 1; i < N; i++) await T(page, 'practice-next').click()
      r.check(`${name} ${N}문항 끝 → practice-done`, !!(await waitUntil(() => T(page, 'practice-done').isVisible(), { timeout: 5000 })))
    })
  }
  await scenario('s3 기본 세트 회귀', VP, {}, async ({ page, name, openMenu }) => {
    await openMenu()
    await selectEp(page)
    await T(page, 'speaking-set-basic').click()
    r.check(`${name} basic 다시 선택 → true`, (await pressed(page, 'basic')) === 'true' && (await pressed(page, 'ep01')) === 'false')
    await T(page, 'speaking-menu-practice').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    r.check(`${name} 헤더 1/${E.length}`, ((await page.getByRole('heading', { level: 1 }).textContent()) || '').includes(`1/${E.length}`))
    r.check(`${name} data-expr=${E[0].id}`, (await T(page, 'speaking-practice').getAttribute('data-expr')) === E[0].id)
    r.check(`${name} 세트 라벨/상대 대사/역할 없음`, (await T(page, 'speaking-set-label').count()) === 0 && (await T(page, 'practice-reply').count()) === 0 && (await T(page, 'situation-role').count()) === 0)
  })

  // ── k. 오늘 기억할 한 문장(ep02 QA 전용): 메뉴 카드 → 보기 → 상황만 보고 → 새 친구 → 끝 ─────────────
  const KS = keySentenceFor('ep02')
  const FORBID_K = /✅|정답|합격|완료|숙달|마스터|점수|⭐|기억했어요/
  const bodyText = (page) => page.locator('body').innerText()
  const flowStep = (page) => T(page, 'key-flow').getAttribute('data-step')
  const sceneAttr = (page, a) => T(page, 'key-scene').getAttribute(a)
  const openKey = async (page, openMenu) => {
    await openMenu()
    await T(page, 'speaking-set-ep02').click()
    await T(page, 'speaking-menu-key').click()
    await T(page, 'key-flow').waitFor({ state: 'visible', timeout: 15000 })
  }
  // 목표 단계까지 진행(recall/transfer는 [답 확인] 후에만 다음이 활성)
  const toStep = async (page, step) => {
    for (let i = 0; i < 4 && (await flowStep(page)) !== step; i++) {
      if ((await T(page, 'key-reveal').count()) > 0) await T(page, 'key-reveal').click()
      await T(page, 'key-next').click()
    }
  }
  const hiddenBeforeReveal = async (page, name) => {
    const t = await bodyText(page)
    r.check(`${name} 공개 전 본문에 영어 문장 없음`, !t.includes('Can I borrow'), t.slice(0, 120))
    r.check(`${name} 공개 전 듣기/정답 영역 마운트 없음`, (await T(page, 'key-listen').count()) === 0 && (await T(page, 'key-answer').count()) === 0)
    r.check(`${name} 공개 전 DOM 어디에도 영어 문장 없음(숨김 렌더 금지)`, !(await page.evaluate((en) => document.documentElement.outerHTML.includes(en), KS.en)))
  }
  // 장면(key-scene) 안 애니메이션만 센다 — 앱 공통 btn-press 버튼의 opacity 전환은 이 장면과 무관
  // 주인공 = 승인된 Paul 마스코트(src/assets/paul) — 단계별 포즈와 실제 로드된 이미지 확인
  const hero = async (page) => T(page, 'key-scene-hero').evaluate((el) => { const href = el.getAttribute('href') || ''; const img = new Image(); img.src = href; return new Promise((res) => { const done = () => res({ pose: el.closest('[data-testid="key-scene"]').getAttribute('data-hero-pose'), href, ok: img.naturalWidth > 0, h: el.getBoundingClientRect().height }); if (img.complete) done(); else { img.onload = done; img.onerror = done } }) })
  const partner = async (page) => T(page, 'key-scene-partner').evaluate((el) => { const href = el.getAttribute('href') || ''; const img = new Image(); img.src = href; return new Promise((res) => { const done = () => res({ pose: el.closest('[data-testid="key-scene"]').getAttribute('data-partner-pose'), href, ok: img.naturalWidth > 0, h: el.getBoundingClientRect().height }); if (img.complete) done(); else { img.onload = done; img.onerror = done } }) })
  const partnerIs = async (page, pose, file) => { const p = await partner(page); return p.pose === pose && p.href.includes(file) && p.ok }
  // 216차: Paul은 기준 그림 한 장(paul_speaking) — 'asking'(묻는 순간 '?' 말풍선) / 'paul'(그 외)
  const heroIs = async (page, pose) => { const h = await hero(page); return h.pose === pose && h.href.includes('paul_speaking') && h.ok && ((await T(page, 'key-scene-asking').count()) === (pose === 'asking' ? 1 : 0)) }
  const running = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('[data-testid="key-scene"]')).length)
  const runningNames = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${a.animationName || a.transitionProperty || '?'}@${a.effect?.target?.getAttribute?.('class') || a.effect?.target?.tagName}`).join(','))

  await scenario('k1 메뉴 카드(첫 방문 2화 기본·선택 기억)', VP, { fresh: true }, async ({ page, name, openMenu }) => {
    await openMenu()
    r.check(`${name} 첫 방문: ${DEFAULT_SET_ID} 선택됨 + 오늘의 이야기 카드 바로 보임`, DEFAULT_SET_ID === 'ep02' && (await T(page, 'speaking-set-ep02').getAttribute('aria-pressed')) === 'true' && (await T(page, 'speaking-menu-key').isVisible()))
    const box = async (id) => (await T(page, id).boundingBox())?.y ?? -1
    r.check(`${name} 카드가 세트 선택보다 위`, (await box('speaking-menu-key-card')) < (await box('speaking-set-basic')))
    const card = await txt(page, 'speaking-menu-key-card')
    r.check(`${name} 카드에 오늘의 이야기·2화 제목·한글 목표 있고 영어 글자 없음`, card.includes('오늘의 이야기') && card.includes('2화 숟가락이 든 필통') && card.includes(KS.goalKo) && !/[A-Za-z]/.test(card), card)
    r.check(`${name} 회화 연습·한글 보고 말하기 버튼 유지`, (await T(page, 'speaking-menu-practice').isVisible()) && (await T(page, 'speaking-menu-exam').isVisible()))
    r.check(`${name} 10화 + 기본 세트 칩 전부 보임`, (await page.locator('[data-testid^="speaking-set-"]').count()) === 11)
    r.check(`${name} 메뉴 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'speaking-menu')).length === 0)
    await T(page, 'speaking-set-ep04').click()
    r.check(`${name} ep04 선택: 카드 사라짐(핵심 문장 없음), ep04 선택 유지`, (await T(page, 'speaking-menu-key').count()) === 0 && (await T(page, 'speaking-set-ep04').getAttribute('aria-pressed')) === 'true')
    r.check(`${name} 선택은 UUID 키로만 기록`, (await page.evaluate((k) => localStorage.getItem(k), lastSetKey(QA_STUDENT_ID))) === 'ep04' && !(await page.evaluate((n) => Object.keys(localStorage).some((k) => k.includes(n)), QA_STUDENT_NAME)))
    // 홈으로 나갔다가 다시 진입 — SpeakingPractice가 새로 마운트되어 저장된 선택을 읽는다
    await T(page, 'speaking-menu-home').click()
    await openMenu()
    r.check(`${name} 다시 들어와도 ep04 선택 존중(2화로 되돌리지 않음)`, (await T(page, 'speaking-set-ep04').getAttribute('aria-pressed')) === 'true' && (await T(page, 'speaking-menu-key').count()) === 0)
    await T(page, 'speaking-set-ep02').click()
    r.check(`${name} 2화 다시 고르면 카드 다시 보임`, await T(page, 'speaking-menu-key').isVisible())
  })

  await scenario('k2 보기 단계', VP, {}, async ({ page, name, openMenu }) => {
    await openKey(page, openMenu)
    r.check(`${name} data-step=watch, 진행 1 / 3, 제목`, (await flowStep(page)) === 'watch' && (await txt(page, 'key-progress')) === '1 / 3' && ((await page.getByRole('heading', { level: 1 }).textContent()) || '').includes('오늘 기억할 한 문장'))
    r.check(`${name} 장면 variant=spoon`, (await sceneAttr(page, 'data-variant')) === 'spoon')
    r.check(`${name} 시작: 내 자리 빈 윤곽(연필 없음)·미아 생각 포즈`, (await sceneAttr(page, 'data-my-spot')) === 'empty' && (await T(page, 'key-scene-empty-spot').count()) === 1 && (await partnerIs(page, 'think', 'mia_think')))
    const surprised = await waitUntil(async () => (await sceneAttr(page, 'data-phase')) === 'spoon', { timeout: 3000 })
    r.check(`${name} 숟가락 순간: Paul(기준 그림)·미아 놀람(surprise)`, !!surprised && (await heroIs(page, 'paul')) && (await partnerIs(page, 'surprise', 'mia_surprise')), JSON.stringify(await partner(page)))
    const done = await waitUntil(async () => (await sceneAttr(page, 'data-phase')) === 'handed', { timeout: 7000 })
    r.check(`${name} 7초 안에 data-phase=handed`, !!done, await sceneAttr(page, 'data-phase'))
    r.check(`${name} 끝 장면: Paul 엄지·내 책상에 연필·미아 빈 손 인사(greet)`, (await heroIs(page, 'paul')) && (await sceneAttr(page, 'data-my-spot')) === 'pencil' && (await partnerIs(page, 'greet', 'mia_greet')), JSON.stringify([await hero(page), await partner(page)]))
    r.check(`${name} 이름표 나/미아, 임시 인물(제이미) 없음`, ((await T(page, 'key-scene').textContent()) || '').replace(/\s/g, '') === '나미아' && !(await txt(page, 'key-flow')).includes('제이미'))
    r.check(`${name} 보기 단계: 한국어 상황 + 영어 + 뜻이 함께 보임`, (await txt(page, 'situation-text')) === KS.watch.situationKo && (await txt(page, 'key-sentence')).includes(KS.en) && (await txt(page, 'key-sentence')).includes(KS.ko))
    r.check(`${name} 장면 안에 영어 글자 없음`, !(await T(page, 'key-scene').evaluate((el) => /[A-Za-z]/.test(el.textContent || ''))))
    r.check(`${name} 기억할 문장 카드 EN/KO 보임`, (await txt(page, 'key-sentence')).includes(KS.en) && (await txt(page, 'key-sentence')).includes(KS.ko))
    r.check(`${name} 듣기 누르기 전 speak 0회`, (await speakLog(page)).length === 0, JSON.stringify(await speakLog(page)))
    await T(page, 'key-listen').click()
    const l = await waitUntil(async () => { const x = await speakLog(page); return x.length >= 1 ? x : null }, { timeout: 3000 })
    r.check(`${name} 듣기 → speak 정확히 1회(EN)`, !!l && l.length === 1 && l[0] === KS.en, JSON.stringify(l))
    await sleep(1500)
    r.check(`${name} 대기 후에도 speak 1회(자동 재생 없음)`, (await speakLog(page)).length === 1)
    r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
  })

  await scenario('k3 상황만 보고 말하기', VP, {}, async ({ page, name, openMenu }) => {
    await openKey(page, openMenu)
    await T(page, 'key-next').click()
    r.check(`${name} data-step=recall, 진행 2 / 3`, (await flowStep(page)) === 'recall' && (await txt(page, 'key-progress')) === '2 / 3')
    r.check(`${name} 짧은 대화 + 상황/역할 보임`, (await txt(page, 'key-intro')).includes('짧은 대화') && (await txt(page, 'situation-text')) === KS.recall.situationKo && (await txt(page, 'situation-role')).includes(KS.recall.roleKo))
    r.check(`${name} 장면 variant=ask`, (await sceneAttr(page, 'data-variant')) === 'ask')
    r.check(`${name} 짧은 대화 상대 이름 = 미아(제이미 없음)·내 자리 부러진 연필`, (await txt(page, 'key-intro')).includes('미아:') && !(await txt(page, 'key-intro')).includes('제이미') && (await sceneAttr(page, 'data-my-spot')) === 'broken' && (await T(page, 'key-scene-broken').count()) === 1)
    r.check(`${name} 공개 전 Paul 묻기 '?' 말풍선`, await heroIs(page, 'asking'), JSON.stringify(await hero(page)))
    r.check(`${name} 공개 전 상대 = 미아 그림(생각 포즈)·이름표 미아`, (await partnerIs(page, 'think', 'mia_think')) && (await T(page, 'key-scene').textContent()).includes('미아'), JSON.stringify(await partner(page)))
    await hiddenBeforeReveal(page, name)
    r.check(`${name} 공개 전 다음 버튼 비활성`, await T(page, 'key-next').isDisabled())
    await T(page, 'key-reveal').click()
    r.check(`${name} 공개 후 라벨/EN/KO/다른 말 문구`, (await txt(page, 'key-answer-label')) === '이렇게 말할 수 있어요' && (await txt(page, 'key-answer-en')) === KS.en && (await txt(page, 'key-answer')).includes(KS.ko) && (await txt(page, 'key-other-ways')).includes('다른 말로 말해도'))
    r.check(`${name} 공개 후 미아 대사`, (await txt(page, 'key-reply')).includes('Sure! Here you are.'))
    r.check(`${name} 공개 후 장면 variant=handover-mia`, !!(await waitUntil(async () => (await sceneAttr(page, 'data-variant')) === 'handover-mia', { timeout: 3000 })))
    r.check(`${name} 연필 받은 뒤 Paul 엄지(기준 그림) + 연필이 내 책상 자리로`, !!(await waitUntil(async () => (await heroIs(page, 'paul')) && (await sceneAttr(page, 'data-my-spot')) === 'pencil', { timeout: 3000 })), JSON.stringify(await hero(page)))
    r.check(`${name} 건넨 뒤 미아 인사 포즈(빈 손)`, await partnerIs(page, 'greet', 'mia_greet'), JSON.stringify(await partner(page)))
    const before = (await speakLog(page)).length
    await T(page, 'key-listen').click()
    const l = await waitUntil(async () => { const x = await speakLog(page); return x.length >= 1 ? x : null }, { timeout: 3000 })
    r.check(`${name} 공개 전 speak 0회, 듣기 → 1회 EN`, before === 0 && !!l && l.length === 1 && l[0] === KS.en, JSON.stringify(l))
    r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
  })

  await scenario('k4 새 친구에게', VP, {}, async ({ page, name, openMenu }) => {
    await openKey(page, openMenu)
    await toStep(page, 'transfer')
    r.check(`${name} data-step=transfer, 진행 3 / 3, 안내 문구`, (await flowStep(page)) === 'transfer' && (await txt(page, 'key-progress')) === '3 / 3' && (await bodyText(page)).includes('이번엔 다른 상황에서'))
    r.check(`${name} 상황/역할 = transfer 텍스트, variant=forgot(필통 없는 점선 자리)·미아 생각`, (await txt(page, 'situation-text')) === KS.transfer.situationKo && (await txt(page, 'situation-role')).includes(KS.transfer.roleKo) && (await sceneAttr(page, 'data-variant')) === 'forgot' && (await T(page, 'key-scene-no-case').count()) === 1 && (await partnerIs(page, 'think', 'mia_think')))
    r.check(`${name} 공개 전 Paul 묻기 '?' 말풍선`, await heroIs(page, 'asking'))
    await hiddenBeforeReveal(page, name)
    await T(page, 'key-reveal').click()
    r.check(`${name} 연필 받은 뒤 Paul 엄지(기준 그림)`, !!(await waitUntil(() => heroIs(page, 'paul'), { timeout: 3000 })))
    r.check(`${name} 공개 후 라벨/EN/다른 말 문구`, (await txt(page, 'key-answer-label')) === '이렇게 말할 수 있어요' && (await txt(page, 'key-answer-en')) === KS.en && (await txt(page, 'key-other-ways')).includes('다른 말로 말해도'))
    r.check(`${name} 공개 후 미아 대사 + variant=handover-forgot + 미아 인사`, (await txt(page, 'key-reply')).includes(KS.transfer.reply.en) && !!(await waitUntil(async () => (await sceneAttr(page, 'data-variant')) === 'handover-forgot' && (await partnerIs(page, 'greet', 'mia_greet')), { timeout: 3000 })))
    r.check(`${name} 3단계 전체에 제이미 없음`, !(await txt(page, 'key-flow')).includes('제이미'))
    r.check(`${name} 가로 스크롤 없음`, await noOverflow(page))
  })

  await scenario('k5 끝 화면', VP, {}, async ({ page, name, openMenu }) => {
    await openKey(page, openMenu)
    const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))
    await toStep(page, 'end')
    r.check(`${name} key-end 보임 + 연습≠기억 문구`, (await T(page, 'key-end').isVisible()) && (await txt(page, 'key-end')).includes('연습을 마쳤어요') && (await txt(page, 'key-end')).includes('다음 수업에서 영어 없이 상황만'))
    const t = await bodyText(page)
    r.check(`${name} 흐름 전체 금지 문구 없음`, !FORBID_K.test(t), t.match(FORBID_K)?.[0])
    const after = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))
    r.check(`${name} 흐름 중 localStorage 키 변화 없음`, before === after, `${before} -> ${after}`)
    await T(page, 'key-restart').click()
    r.check(`${name} 처음부터 다시 → watch`, (await flowStep(page)) === 'watch')
    await toStep(page, 'end')
    await T(page, 'key-menu').click()
    r.check(`${name} 메뉴로 → speaking-menu`, await T(page, 'speaking-menu').isVisible())
  })

  await scenario('k6 모션 감소', VP, { reduced: true }, async ({ page, name, openMenu }) => {
    await openKey(page, openMenu)
    r.check(`${name} spoon 장면 즉시 data-phase=handed`, (await sceneAttr(page, 'data-phase')) === 'handed' && (await sceneAttr(page, 'data-variant')) === 'spoon')
    r.check(`${name} 모션 없이도 같은 결과 장면: 열린 필통 속 숟가락·내 책상의 연필·Paul 엄지·미아 빈 손`, (await heroIs(page, 'paul')) && (await sceneAttr(page, 'data-my-spot')) === 'pencil' && (await partnerIs(page, 'greet', 'mia_greet')))
    r.check(`${name} 실행 중 애니메이션/전환 0개`, (await running(page)) === 0)
    await T(page, 'key-next').click()
    await T(page, 'key-reveal').click()
    r.check(`${name} 공개 후 handover도 즉시 최종 장면(애니메이션 0)`, (await sceneAttr(page, 'data-phase')) === 'handed' && (await running(page)) === 0, `${await sceneAttr(page, 'data-phase')} ${await runningNames(page)}`)
  })

  // ── k8. 2화 일반 회화 연습·시험이 Paul·미아 이야기와 일치(제이미 없음), 정지 장면은 연습에만 ─────────────
  const EP2 = itemsForSet('ep02')
  await scenario('k8 2화 연습·시험 연결', { width: 360, height: 640 }, {}, async ({ page, name, openMenu }) => {
    await openMenu()
    await T(page, 'speaking-set-ep02').click()
    await T(page, 'speaking-menu-practice').click()
    await T(page, 'speaking-practice').waitFor({ state: 'visible', timeout: 15000 })
    const bad = []
    for (let i = 0; i < EP2.length; i++) {
      const it = EP2[i]
      const root = T(page, 'speaking-practice')
      await waitUntil(async () => (await root.getAttribute('data-expr')) === it.exprId, { timeout: 3000 })
      const t = await txt(page, 'speaking-practice')
      if (/제이미|Jamie/.test(t)) bad.push(`${it.id}:jamie`)
      if ((await txt(page, 'situation-text')) !== it.practiceScene.situationKo || (await txt(page, 'practice-sentence')) !== it.en) bad.push(`${it.id}:text`)
      if (!(await txt(page, 'practice-reply')).includes(it.reply.en)) bad.push(`${it.id}:reply`)
      const sc = T(page, 'key-scene')
      if (it.practiceScene.pencil) {
        const ok = await waitUntil(async () => (await sc.count()) === 1 && (await sc.getAttribute('data-still')) === it.practiceScene.pencil.still && (await sc.getAttribute('data-variant')) === it.practiceScene.pencil.variant, { timeout: 5000 })
        if (!ok) bad.push(`${it.id}:scene`)
        else if (/[A-Za-z]/.test((await sc.textContent()) || '')) bad.push(`${it.id}:scene-english`)
      } else if ((await sc.count()) !== 0) bad.push(`${it.id}:unexpected-scene`)
      if (i < EP2.length - 1) await T(page, 'practice-next').click()
    }
    r.check(`${name} 2화 연습 12문항: 상황·문장·미아 대사 일치, 제이미 없음, 정지 장면 5문항(s02-01·02·03·09·10)만`, bad.length === 0 && EP2.filter((it) => it.practiceScene.pencil).map((it) => it.id).join(',') === 's02-01,s02-02,s02-03,s02-09,s02-10', bad.join(' '))
    await T(page, 'speaking-back').click()
    await T(page, 'speaking-menu-exam').click()
    await T(page, 'exam-progress').waitFor({ state: 'visible', timeout: 15000 })
    const first = EP2[0]
    r.check(`${name} 2화 시험 1번: 공개 전 정지 장면·영어 문장·듣기 없음(한국어 상황만)`, (await T(page, 'key-scene').count()) === 0 && (await T(page, 'exam-listen').count()) === 0 && !(await page.evaluate((en) => document.documentElement.outerHTML.includes(en), first.en)) && (await txt(page, 'situation-text')) === first.examScene.situationKo)
    await T(page, 'exam-reveal').click()
    r.check(`${name} 2화 시험 1번: 공개 후 모범 표현·미아 대사`, (await txt(page, 'exam-answer')) === first.en && (await txt(page, 'speaking-exam')).includes(first.reply.en))
  })

  // ── k9. 217차 1·3화 오늘 기억할 한 문장(기존 Paul·미아 그림만) — 보기 → 영어 숨기고 회상 → 다른 상황 → 끝 ─────────────
  for (const [epId, ex] of [['ep01', { watch: 'whisper', recall: ['quiet', 'quiet-loud'], transfer: ['noisy', 'noisy-loud'], asking: true }], ['ep03', { watch: 'idea', recall: ['poster', 'poster-yes'], transfer: ['snack', 'snack-yes'], asking: false }]]) {
    const K = keySentenceFor(epId)
    await scenario(`k9 ${epId} 한 문장`, { width: 360, height: 640 }, {}, async ({ page, name, openMenu }) => {
      await openMenu()
      await T(page, `speaking-set-${epId}`).click()
      const card = await txt(page, 'speaking-menu-key-card')
      r.check(`${name} 메뉴 카드: 한글 목표만(영어 없음)`, card.includes(K.goalKo) && !/[A-Za-z]/.test(card), card)
      await T(page, 'speaking-menu-key').click()
      await T(page, 'key-flow').waitFor({ state: 'visible', timeout: 15000 })
      r.check(`${name} 보기: 장면 ${ex.watch}·상황·EN/KO`, (await sceneAttr(page, 'data-variant')) === ex.watch && (await txt(page, 'situation-text')) === K.watch.situationKo && (await txt(page, 'key-sentence')).includes(K.en) && (await txt(page, 'key-sentence')).includes(K.ko))
      r.check(`${name} 보기: 장면 끝까지 재생(미아 그림 로드)·장면에 영어 없음`, !!(await waitUntil(async () => (await sceneAttr(page, 'data-phase')) === (ex.watch === 'whisper' ? 'loud' : 'go'), { timeout: 5000 })) && (await partner(page)).ok && !/[A-Za-z]/.test((await T(page, 'key-scene').textContent()) || ''))
      r.check(`${name} 보기: 듣기 누르기 전 speak 0회`, (await speakLog(page)).length === 0)
      for (const [step, sc, part] of [['recall', ex.recall, K.recall], ['transfer', ex.transfer, K.transfer]]) {
        await T(page, 'key-next').click()
        r.check(`${name} ${step}: 장면 ${sc[0]}·상황/역할`, (await flowStep(page)) === step && (await sceneAttr(page, 'data-variant')) === sc[0] && (await txt(page, 'situation-text')) === part.situationKo && (await txt(page, 'situation-role')).includes(part.roleKo))
        r.check(`${name} ${step}: 묻는 말풍선 ${ex.asking ? '있음' : '없음'}`, (await T(page, 'key-scene-asking').count()) === (ex.asking ? 1 : 0))
        r.check(`${name} ${step}: 공개 전 DOM에 영어 문장·듣기·답 없음, 다음 비활성`, !(await page.evaluate((en) => document.documentElement.outerHTML.includes(en), K.en)) && (await T(page, 'key-listen').count()) === 0 && (await T(page, 'key-answer').count()) === 0 && (await T(page, 'key-next').isDisabled()))
        await T(page, 'key-reveal').click()
        const rep = part.reply || itemsForSet(epId).find((i) => i.id === K.itemId).reply
        r.check(`${name} ${step}: 공개 후 모범 표현·미아 대사·장면 ${sc[1]}`, (await txt(page, 'key-answer-en')) === K.en && (await txt(page, 'key-reply')).includes(rep.en) && (await txt(page, 'key-reply')).includes('미아') && !!(await waitUntil(async () => (await sceneAttr(page, 'data-variant')) === sc[1], { timeout: 3000 })))
        r.check(`${name} ${step}: 가로 스크롤 없음`, await noOverflow(page))
      }
      await T(page, 'key-next').click()
      const t = await bodyText(page)
      r.check(`${name} 끝: 연습≠기억 문구, 금지 문구 없음`, (await T(page, 'key-end').isVisible()) && t.includes('연습을 마쳤어요') && !FORBID_K.test(t))
    })
  }

  for (const vp of [{ width: 360, height: 640 }, { width: 412, height: 915 }, { width: 1280, height: 800 }]) {
    await scenario('k7 레이아웃', vp, {}, async ({ page, name, openMenu }) => {
      await openKey(page, openMenu)
      for (const step of ['watch', 'recall', 'transfer']) {
        await toStep(page, step)
        r.check(`${name} ${step} 가로 스크롤 없음`, await noOverflow(page))
        r.check(`${name} ${step} 버튼 전부 높이 >=44px`, (await smallButtons(page, 'key-flow')).length === 0, (await smallButtons(page, 'key-flow')).join(','))
        const sw = await T(page, 'key-scene').boundingBox()
        r.check(`${name} ${step} Paul 기준 그림 로드·높이 >=140px(얼굴·손 식별)`, await hero(page).then((h) => h.ok && h.h >= 140), JSON.stringify(await hero(page)))
        r.check(`${name} ${step} 장면이 화면 안에서 충분히 큼(>=300px)`, !!sw && sw.width >= 300 && sw.x >= 0 && sw.x + sw.width <= vp.width + 1, JSON.stringify(sw))
        if (step !== 'watch') {
          await T(page, 'key-reveal').click()
          r.check(`${name} ${step} 공개 후 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'key-flow')).length === 0)
        }
      }
      await toStep(page, 'end')
      r.check(`${name} 끝 가로 스크롤 없음/버튼 >=44px`, (await noOverflow(page)) && (await smallButtons(page, 'key-flow')).length === 0)
    })
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
