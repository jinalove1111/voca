// tests/e2e/lib/mockRoutes.mjs
//
// 한 페이지의 모든 네트워크를 mock으로 가로챈다 — 실제 Supabase/Vercel에
// 나가는 요청 0건이 이 파일의 유일한 존재 이유다. 절대 규칙(브라우저 E2E
// 작업 지시): Production DB WRITE 0, SQL 실행 0, push 금지와 나란히 —
// 이 하네스는 애초에 실제 네트워크에 닿지 않는다.
//
// 가로채는 것:
//   /rest/v1/**      PostgREST — tests/e2e/lib/postgrestMock.mjs 에 위임
//   /auth/v1/**      Supabase Auth — 차단(빈 세션 응답)
//   /realtime/**     Supabase Realtime(WebSocket 포함) — 차단
//   /api/verify-student-pin   학생 로그인 — 성공 fixture 응답
//   /api/verify-admin-pin     관리자 로그인 — 성공 fixture 응답
//   /api/**          그 외 서버리스 함수 — 무해한 성공/실패 응답(호출부가
//                     실패를 견디는 fire-and-forget 경로이므로 500이어도
//                     화면이 깨지지 않음, 실제로 호출되면 callLog에 기록)
//
// 가드: 위 어느 패턴에도 안 걸리는 요청이 하나라도 나가면 unmockedRequests
// 배열에 쌓인다 — 각 spec 마지막에 이 배열이 비어있는지 반드시 확인한다
// (fail-closed: "mock을 깜빡한 새 요청"이 조용히 실제 네트워크로 새나가는
// 것을 테스트가 스스로 잡아낸다).
import { createDb, handleRestRequest } from './postgrestMock.mjs'
import { buildFixtureTables, EMBEDS, QA_STUDENT_ID, QA_STUDENT_NAME, ADMIN_PIN, QA_LOGIN_PIN } from '../fixtures/index.mjs'

// 학생/관리자 화면이 정상적으로 쓰는 공개 폰트 CDN — Supabase/Vercel과
// 무관한 순수 정적 에셋(민감정보 0, production 앱/DB 요청이 아님)이라
// "실제 Supabase/Vercel에 요청 0건" 가드의 대상이 아니다. 여기 나열된
// 호스트로 나가는 요청은 허용하고 unmockedRequests에는 넣지 않는다 —
// 그 외 호스트(Supabase 프로젝트/Vercel 등)는 전부 위반으로 기록한다.
const ALLOWED_EXTERNAL_ASSET_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net']

export async function installMocks(page, { tables } = {}) {
  const db = createDb(tables || buildFixtureTables(), EMBEDS)
  const unmockedRequests = []
  const externalAssetRequests = []
  const apiCallLog = []
  const ttsFallbackRequests = []

  // headless chromium(CI, ubuntu)은 speechSynthesis voice가 0개라 src/utils/
  // speech.js의 _rawSpeak()가 매번 onerror로 실패하고, playWordAudio()가 tier
  // 3(네트워크 TTS, translate.googleapis.com)로 넘어간다 — Windows 로컬(voice
  // 있음)에서는 tier 2(device TTS)에서 항상 성공해 이 경로 자체가 실행되지
  // 않았다(로컬 56/56 PASS, CI 미mock 요청 FAIL의 원인, 2026-09-05 실측).
  // 로컬/CI 조건을 통일해 이 tier 3 경로가 항상 검증되도록, getVoices()를
  // 빈 배열로 고정하고 speak()도 항상 onerror로 실패하게 만들어 모든 실행
  // 환경(OS/voice 유무 무관)에서 device TTS가 실패 → 네트워크 TTS 폴백으로
  // 넘어가는 동일한 경로를 강제한다(voice 존재 여부에 따라 로컬/CI 결과가
  // 갈리는 플레이크를 구조적으로 제거).
  await page.addInitScript(() => {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.getVoices = () => []
      synth.speak = (utterance) => {
        setTimeout(() => {
          try { utterance.onerror?.({ error: 'e2e-no-voices-stub' }) } catch { /* 무시 */ }
        }, 0)
      }
    } catch { /* 무시 — 스텁 실패해도 테스트 자체는 계속 진행 */ }
  })

  // 가드를 먼저 등록한다 — Playwright는 여러 route()가 같은 요청에 매치될 때
  // "나중에 등록된 것부터" 실행한다. 아래에서 등록할 구체적 패턴(rest/v1,
  // auth, api/**)이 실제로 매치되는 요청에 대해서는 항상 먼저 실행되도록,
  // 무엇에나 매치되는 이 catch-all은 반드시 제일 먼저 등록해야 한다(나중
  // 등록 = 먼저 실행이므로, 이게 마지막 순번 = 아무 구체적 패턴도 안 걸린
  // 요청만 여기로 떨어진다).
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)
    if (!isLocalhost) {
      let host = ''
      try { host = new URL(url).hostname } catch { /* 무시 */ }
      if (ALLOWED_EXTERNAL_ASSET_HOSTS.includes(host)) {
        externalAssetRequests.push({ url, method: route.request().method() })
      } else {
        unmockedRequests.push({ url, method: route.request().method() })
      }
    }
    await route.continue()
  })

  // 발음 재생 tier 3(src/utils/speech.js networkTtsUrl()) — 위 addInitScript로
  // device TTS(tier 2)가 항상 실패하도록 만들었으니 이 tier가 항상 실행된다.
  // 실제 Google 서버에는 절대 나가지 않게 여기서 가로채되(catch-all보다
  // 나중에 등록해 우선 적용), "허용 목록에 조용히 추가"하지는 않는다 — 이
  // 카운터(ttsFallbackRequests)로 몇 번 불렸는지 항상 드러나게 남겨서, 이후
  // 다른 미mock 외부 호스트가 새로 생기면 여전히 가드가 FAIL로 잡아낸다.
  await page.route('https://translate.googleapis.com/translate_tts**', async (route) => {
    const req = route.request()
    ttsFallbackRequests.push({ url: req.url(), method: req.method() })
    console.log(`[mockRoutes] TTS 폴백 호출 가로챔(mock 응답) #${ttsFallbackRequests.length}: ${req.url()}`)
    // 빈 body — src/utils/speech.js의 playAudioUrl()이 이미 audio.onerror를
    // 처리하는 코드 경로(giveUp → onError/onEnd 호출, 화면 진행 계속)라
    // 실제 mp3 바이트를 만들 필요 없이 그 경로를 그대로 검증할 수 있다.
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(0) })
  })

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    const headers = await req.allHeaders()
    let postDataJSON = null
    try { postDataJSON = req.postDataJSON() } catch { /* GET/HEAD엔 body 없음 */ }
    try {
      const { status, body } = handleRestRequest(db, { url: req.url(), method: req.method(), headers, postDataJSON })
      await route.fulfill({ status, contentType: 'application/json', body: body === null ? '' : JSON.stringify(body) })
    } catch (err) {
      db.errors.push({ url: req.url(), method: req.method(), message: err.message })
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: err.message }) })
    }
  })

  await page.route('**/auth/v1/**', async (route) => {
    apiCallLog.push({ url: route.request().url(), method: route.request().method() })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })
  await page.route('**/realtime/**', async (route) => { await route.abort() })

  // 그 외 /api/** — 학생/관리자 화면이 백그라운드로 부를 수 있는 나머지
  // 서버리스 함수(예: PIN 상태 배치 조회, 세션 인증 보상 API 등). 전부
  // fire-and-forget 또는 실패를 견디는 호출부라 500이어도 화면이 깨지지
  // 않는다 — 실제 프로덕션 호출이 나가지 않게 막는 것이 유일한 목적.
  //
  // 아래의 verify-student-pin/verify-admin-pin보다 먼저 등록해야 한다 —
  // Playwright는 "나중에 등록된 route일수록 먼저 실행"되므로, 이 넓은
  // /api/** 패턴을 먼저 등록해 둬야 나중에 등록되는 두 구체적 패턴이
  // 실제로 그 URL에 대해 우선 실행된다(반대로 등록하면 이 넓은 패턴이
  // 항상 먼저 가로채 구체적 mock이 죽은 코드가 된다 — 실제로 이 순서
  // 버그로 로그인 자체가 깨졌던 적이 있어 순서를 明示적으로 강제한다).
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    apiCallLog.push({ url: req.url(), method: req.method() })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'not_mocked_in_e2e' }) })
  })

  await page.route('**/api/verify-student-pin', async (route) => {
    const req = route.request()
    let body = {}
    try { body = req.postDataJSON() || {} } catch { /* ignore */ }
    apiCallLog.push({ url: req.url(), method: req.method(), body })
    const ok = body.name?.trim()?.toLowerCase() === QA_STUDENT_NAME.toLowerCase() && body.pin === QA_LOGIN_PIN
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(ok
        ? { ok: true, studentId: QA_STUDENT_ID, name: QA_STUDENT_NAME, className: 'MS Advanced Class', unitName: 'Unit 2', token: 'e2e-mock-token' }
        : { ok: false, reason: 'wrong_pin' }),
    })
  })

  await page.route('**/api/verify-admin-pin', async (route) => {
    const req = route.request()
    let body = {}
    try { body = req.postDataJSON() || {} } catch { /* ignore */ }
    apiCallLog.push({ url: req.url(), method: req.method(), body })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: body.pin === ADMIN_PIN }) })
  })

  return { db, unmockedRequests, externalAssetRequests, apiCallLog, ttsFallbackRequests }
}
