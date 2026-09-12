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
// api/submit-entrance-result.js 실 서버와 동일한 순수 채점 함수 재사용(새 채점
// 로직 발명 아님) — 아래 '/api/submit-entrance-result' mock이 그 서버의
// entrance_test_results upsert 부작용까지 흉내낼 때 쓴다.
import { computeTestResult } from '../../../src/utils/entranceTest.js'
// Paul Town V1(townV1.spec.mjs, 2026-09-11) — 상점 아이템 메타(가격/최소
// 레벨/카테고리)의 유일한 소스. 이 mock은 새 가격 정책을 발명하지 않고
// 클라이언트가 이미 쓰는 초안 메타를 그대로 서버 응답 모양으로 옮긴다.
import { TOWN_ITEM_META } from '../../../src/utils/town/townCatalog.js'

// 학생/관리자 화면이 정상적으로 쓰는 공개 폰트 CDN — Supabase/Vercel과
// 무관한 순수 정적 에셋(민감정보 0, production 앱/DB 요청이 아님)이라
// "실제 Supabase/Vercel에 요청 0건" 가드의 대상이 아니다. 여기 나열된
// 호스트로 나가는 요청은 허용하고 unmockedRequests에는 넣지 않는다 —
// 그 외 호스트(Supabase 프로젝트/Vercel 등)는 전부 위반으로 기록한다.
const ALLOWED_EXTERNAL_ASSET_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net']

// Pilot A Town V1 허용목록(2026-09-12, tests/e2e/townPilotAllowlist.spec.mjs) —
// QA fixture 학생(QA_STUDENT_ID)을 그대로 로그인시키는 대신, 다른 UUID로
// "재발급"해서 그 UUID로 로그인한 것처럼 만들고 싶을 때 쓰는 opt-in 헬퍼.
// QA_STUDENT_ID를 참조하는 테이블은 지금 정확히 2개(students/
// student_class_assignments) — 나머지는 buildFixtureTables()가 전부 빈
// 배열로 반환해 remap이 필요 없다(2026-09-12 확인). 원본 tables 객체는
// 변경하지 않는다(얕은 복제 + 배열 map으로 새 객체만 반환).
function withOverriddenStudentId(baseTables, studentId) {
  return {
    ...baseTables,
    students: (baseTables.students || []).map((s) => (
      s.id === QA_STUDENT_ID ? { ...s, id: studentId } : s
    )),
    student_class_assignments: (baseTables.student_class_assignments || []).map((row) => (
      row.student_id === QA_STUDENT_ID ? { ...row, student_id: studentId } : row
    )),
  }
}

export async function installMocks(page, { tables, townWelcomeDisabled = false, slowGrantXpMs = 0, studentId } = {}) {
  // studentId는 호출자가 tables를 직접 넘기지 않은 경우에만 적용한다 — 이미
  // 자기만의 fixture를 만든 호출자의 studentId 배정을 이 옵션이 조용히
  // 덮어쓰지 않게 하기 위함(additive, 기본 동작 무변화).
  const effectiveStudentId = studentId && !tables ? studentId : null
  const baseTables = tables || buildFixtureTables()
  const finalTables = effectiveStudentId ? withOverriddenStudentId(baseTables, effectiveStudentId) : baseTables
  const loginStudentId = effectiveStudentId || QA_STUDENT_ID
  const db = createDb(finalTables, EMBEDS)
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
        ? { ok: true, studentId: loginStudentId, name: QA_STUDENT_NAME, className: 'MS Advanced Class', unitName: 'Unit 2', token: 'e2e-mock-token' }
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

  // 입실 단어시험 결과 제출(2026-09-11, entranceInputLoss.spec.mjs 추가) —
  // 위 넓은 '**/api/**'가 기본으로 { ok:false }를 돌려주면 EntranceTest.jsx의
  // submitResultToServer가 항상 실패 경로(재시도 버튼)를 타 시험 흐름을 끝까지
  // 밟아볼 수 없다. 단순히 { ok:true }만 고정 응답하면 안 되는 이유(2026-09-11
  // 실측) — 실 서버(api/submit-entrance-result.js)는 성공 시 반드시
  // entrance_test_results에 upsert하는데, 그 부작용까지 흉내내지 않으면
  // 제출 직후 EntranceTest.jsx의 load() 재조회가 "아직 응시 안 함"으로 오인해
  // (entranceTestSelection.js가 이 시험을 여전히 pending으로 봄) 방금 표시된
  // 결과 화면에서 시작 화면으로 되돌아가 버린다 — 이 파일이 검증하려는
  // 입력유실 여부와 무관한, mock 불완전성이 만든 가짜 결함이었다. 그래서 여기도
  // 실 서버와 동일하게 entrance_tests.words 스냅샷으로 재채점(computeTestResult
  // 재사용 — 새 채점 로직 발명 아님) 후 entrance_test_results에 upsert한다.
  await page.route('**/api/submit-entrance-result', async (route) => {
    const req = route.request()
    let body = {}
    try { body = req.postDataJSON() || {} } catch { /* ignore */ }
    apiCallLog.push({ url: req.url(), method: req.method(), body })

    const test = (db.tables.entrance_tests || []).find((t) => t.id === body.testId)
    const wordMap = new Map((test?.words || []).filter((w) => w?.word && w?.meaning).map((w) => [w.word, w.meaning]))
    const answers = Array.isArray(body.answers) ? body.answers : []
    const questions = answers.map((a) => {
      const meaning = wordMap.get(a.word)
      return { word: a.word, meaning, direction: a.direction, answer: a.direction === 'en2kr' ? meaning : a.word }
    })
    const inputs = answers.map((a) => a.input)
    const result = computeTestResult(questions, inputs)

    if (body.testId && body.studentId) {
      const table = db.tables.entrance_test_results || (db.tables.entrance_test_results = [])
      const existing = table.find((row) => row.test_id === body.testId && row.student_id === body.studentId)
      const row = {
        id: existing?.id || `mock-entrance-result-${body.testId}-${body.studentId}`,
        test_id: body.testId,
        student_id: body.studentId,
        score: result.score,
        total: result.total,
        missed_words: result.missed,
        duration_seconds: body.durationSeconds ?? null,
        submitted_at: new Date().toISOString(),
      }
      if (existing) Object.assign(existing, row)
      else table.push(row)
    }

    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, score: result.score, total: result.total, missed: result.missed }),
    })
  })

  // Paul Town V1(townV1.spec.mjs, 2026-09-11) — get_town_shop_state/
  // purchase_town_item/claim_town_welcome 전용 stateful mock. api/grant-xp.js
  // 실 서버 응답 shape을 그대로 흉내낸다(새 계약 발명 아님, CLAUDE.md 규칙
  // 3) — 학생 식별은 세션 토큰(verify-student-pin mock이 항상 내려주는
  // 'e2e-mock-token')으로만 하고, 클라이언트가 보낼 수 있는 price/balance/
  // studentId 등은 실 서버와 마찬가지로 이 핸들러도 참조하지 않는다.
  // 이 세 action이 아니면(reward/xp/reconcile 등 기존 action) 위 넓은
  // '**/api/**'(기본 {ok:false, reason:'not_mocked_in_e2e'})가 그대로
  // 처리하도록 route.fallback()으로 넘긴다 — 기존 student/admin/mobile/
  // entrance 스펙의 grant-xp 관련 동작을 절대 바꾸지 않는다(파일당 소유권
  // 원칙, 다른 세션이 이미 그 응답에 의존).
  const TOWN_LEVEL_THRESHOLDS = [0, 20, 50, 100, 200, 350, 550, 800, 1100, 1500]
  function townLevelForStarsMock(stars) {
    let level = 1
    for (let i = 0; i < TOWN_LEVEL_THRESHOLDS.length; i++) {
      if (stars >= TOWN_LEVEL_THRESHOLDS[i]) level = i + 1
    }
    return level
  }
  // townCatalog.js(TOWN_ITEM_META)를 그대로 소스로 써서 서버 town_items
  // 응답(camelCase, api/grant-xp.js 신형 shape)을 흉내낸다 — 가격/최소
  // 레벨/카테고리를 이 mock이 새로 발명하지 않는다(17개 전부 노출).
  const TOWN_MOCK_ITEMS = Object.entries(TOWN_ITEM_META).map(([id, m]) => ({
    id, name: m.nameKo, emoji: m.emoji, price: m.defaultPrice, priceCurrency: 'dollars',
    category: m.category, sortOrder: m.sortOrder, minLevel: m.minLevel, assetKey: `${m.category}/${id}`,
  }))
  db._townCalls = { get_town_shop_state: 0, claim_town_welcome: 0, purchase_town_item: {} }
  // PHASE 4/10(townV1.spec.mjs, 2026-09-11) — 두 신규 회귀(빈 지갑 안내
  // 카드/느린 네트워크)를 결정론적으로 재현하려면 mock 옵션이 꼭 필요했다
  // (townShopV1 useEffect의 마운트당 1회 가드 + 실 네트워크 타이밍 때문에
  // 기존 mock만으로는 "잔액 0을 계속 유지" / "응답 지연"을 안정적으로
  // 만들 수 없다). db._townWelcomeDisabled는 installMocks() 호출 뒤에도
  // spec 쪽에서 그대로 덮어쓸 수 있게 db 프로퍼티로 노출한다.
  db._townWelcomeDisabled = !!townWelcomeDisabled
  const townStates = {}
  // advisory lock 흉내 — 실 서버(purchase_town_item RPC)의 원자성 가정을
  // 재현한다. .catch(()=>{})로 체인 꼬리를 항상 비-거부 상태로 유지해,
  // 한 요청이 실패해도 이후 요청의 직렬화 체인이 영구히 끊기지 않게 한다.
  let townLock = Promise.resolve()
  function getTownMockState(studentId) {
    if (!townStates[studentId]) {
      // starsEarned=20 -> townLevelForStarsMock(20)===2 — tree(minLevel1)/
      // cat(minLevel2)는 레벨 조건 충족, flower-garden(minLevel3)은 잠김
      // 상태로 남는다(townV1.spec.mjs 시나리오 전제, 과제 지시 그대로).
      townStates[studentId] = { starsEarned: 20, dollars: { available: 0, earned: 0, spent: 0 }, owned: [], welcomeClaimed: false }
    }
    return townStates[studentId]
  }

  await page.route('**/api/grant-xp', async (route) => {
    const req = route.request()
    let body = {}
    try { body = req.postDataJSON() || {} } catch { /* ignore */ }
    const action = body.action
    if (action !== 'get_town_shop_state' && action !== 'purchase_town_item' && action !== 'claim_town_welcome') {
      await route.fallback()
      return
    }
    apiCallLog.push({ url: req.url(), method: req.method(), body })

    // PHASE 10(2026-09-11) SLOW-NETWORK — 실 네트워크 지연을 흉내내는 순수
    // 딜레이. townLock 직렬화 체인보다 먼저 기다려, 여러 요청이 겹쳐도
    // 각 요청이 최소 slowGrantXpMs만큼 걸리는 실제 "느린 네트워크"에 더
    // 가깝게 만든다.
    if (slowGrantXpMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, slowGrantXpMs))
    }

    const resultPromise = townLock.then(async () => {
      const studentId = body.token === 'e2e-mock-token' ? QA_STUDENT_ID : null
      if (!studentId) return { ok: false, reason: 'unauthorized' }
      const state = getTownMockState(studentId)

      if (action === 'get_town_shop_state') {
        db._townCalls.get_town_shop_state += 1
        return {
          ok: true,
          starsEarned: state.starsEarned,
          dollarsAvailable: state.dollars.available,
          dollarsEarned: state.dollars.earned,
          dollarsSpent: state.dollars.spent,
          owned: [...state.owned],
          items: TOWN_MOCK_ITEMS,
          level: townLevelForStarsMock(state.starsEarned),
        }
      }

      if (action === 'purchase_town_item') {
        const itemId = body.itemId
        db._townCalls.purchase_town_item[itemId] = (db._townCalls.purchase_town_item[itemId] || 0) + 1
        const item = TOWN_MOCK_ITEMS.find((it) => it.id === itemId)
        if (!item) return { ok: false, reason: 'invalid_item', balanceAfter: state.dollars.available }
        if (state.owned.includes(itemId)) {
          return { ok: true, reason: 'already_owned', dollarsSpent: 0, balanceAfter: state.dollars.available, duplicate: true }
        }
        const level = townLevelForStarsMock(state.starsEarned)
        if (level < item.minLevel) {
          return { ok: false, reason: 'locked', balanceAfter: state.dollars.available }
        }
        if (state.dollars.available < item.price) {
          return { ok: false, reason: 'insufficient', balanceAfter: state.dollars.available }
        }
        state.dollars.available -= item.price
        state.dollars.spent += item.price
        state.owned.push(itemId)
        return { ok: true, reason: 'purchased', dollarsSpent: item.price, balanceAfter: state.dollars.available, duplicate: false }
      }

      // action === 'claim_town_welcome'
      db._townCalls.claim_town_welcome += 1
      // PHASE 4(2026-09-11) EMPTY-WALLET — db._townWelcomeDisabled이면 항상
      // granted:false만 돌려줘 잔액 0·보유 0 상태를 안정적으로 유지한다
      // (townV1.spec.mjs의 빈 지갑 상점 안내 카드 검증 전용).
      if (db._townWelcomeDisabled) {
        return { ok: true, granted: false, balanceAfter: state.dollars.available }
      }
      if (state.welcomeClaimed) {
        return { ok: true, granted: false, balanceAfter: state.dollars.available }
      }
      state.welcomeClaimed = true
      state.dollars.available += 20
      state.dollars.earned += 20
      return { ok: true, granted: true, balanceAfter: state.dollars.available }
    })
    townLock = resultPromise.catch(() => {})

    let result
    try {
      result = await resultPromise
    } catch (err) {
      db.errors.push({ url: req.url(), method: req.method(), message: err.message })
      result = { ok: false, reason: 'mock_error' }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })

  return { db, unmockedRequests, externalAssetRequests, apiCallLog, ttsFallbackRequests }
}
