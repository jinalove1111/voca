// tests/e2e/pictureWordPractice.spec.mjs — 그림 단어 연습(249차, 테스터 전용). 네트워크 전체 mock, 저장 0, 보상 0.
// (a) 전 과정 정답 (b) 일부러 오답 → 복습 → 다시 하기 (c) 답하기 전 정답 누출 0 (d) 듣기 (e) 마이크 없이 따라 말하기
// (f) 360x640 가로 넘침 0 / 다음 버튼 가림 0 (g) 일반 학생 진입 없음 + 홈 메뉴 진입.
// 정답 옵션은 root의 data-seed로 buildSession/buildQuiz를 그대로 재계산해 구한다(DOM에는 정답 정보가 없다).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'
import { buildSession, buildQuiz } from '../../src/utils/pictureWords/practice.js'
import { learnableWords, shopSets } from '../../src/data/pictureWords/index.js'

const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LOGIN_WRITES = ['/rest/v1/product_events', '/rest/v1/student_progress', '/rest/v1/student_daily_progress']
const badWrites = (log) => log.filter((c) => c.url.includes('/rest/v1/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)).filter((c) => { try { return !LOGIN_WRITES.includes(new URL(c.url).pathname) } catch { return true } }).map((c) => c.method + ' ' + c.url)
const storageSnap = (page) => page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }))
const POOL = learnableWords()
const SETS = shopSets()
const TESTER_ONLY = 'e2e00000-0000-4000-8000-00000000a002'
const GENERAL = 'e2e00000-0000-4000-8000-00000000b001'

async function loginToDashboard(page) {
  const input = page.getByPlaceholder('이름 입력...')
  await input.waitFor({ state: 'visible', timeout: 90000 })
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await input.waitFor({ state: 'hidden', timeout: 20000 })
  await sleep(1500)
}
async function loginToHome(page) {
  const home = T(page, 'student-home'); const input = page.getByPlaceholder('이름 입력...')
  await Promise.race([home.waitFor({ state: 'visible', timeout: 90000 }), input.waitFor({ state: 'visible', timeout: 90000 })])
  if (await home.isVisible()) return
  await input.fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
  await home.waitFor({ state: 'visible', timeout: 20000 })
}

const attr = (page, a) => T(page, 'pwp-root').getAttribute(a)
const stepOf = (page) => attr(page, 'data-step')
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
async function waitStep(page, step) { await page.waitForFunction((s) => document.querySelector('[data-testid="pwp-root"]')?.getAttribute('data-step') === s, step, { timeout: 10000 }) }
async function openFood(page) {
  await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 20000 })
  await T(page, 'dash-picture-words').click()
  await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 20000 })
}
async function pickSet(page, shop) {
  await T(page, `pwp-set-${shop}`).click()
  await waitStep(page, 'look')
  const seed = Number(await attr(page, 'data-seed'))
  const set = SETS.find((s) => s.shop === shop)
  const words = buildSession(set.words, { size: 6, seed })
  return { seed, words, quiz: buildQuiz(words, POOL, seed) }
}
// 한 단계의 모든 단어를 다음으로 넘겨 다음 단계로 간다.
async function passStep(page, step, n, next) {
  for (let i = 0; i < n; i++) {
    if ((await stepOf(page)) !== step) throw new Error(`expected step ${step}, got ${await stepOf(page)} at ${i}`)
    if ((await attr(page, 'data-index')) !== String(i)) throw new Error(`index mismatch ${step} ${i}`)
    await T(page, 'pwp-next').click()
  }
  await waitStep(page, next)
}
async function toQuiz(page) {
  await passStep(page, 'look', 6, 'listen')
  await passStep(page, 'listen', 6, 'repeat')
  await passStep(page, 'repeat', 6, 'quiz')
}
const correctIdx = (q) => q.options.findIndex((o) => o.id === q.correctId)
const wrongIdx = (q) => (correctIdx(q) + 1) % 4
async function answer(page, idx) {
  await T(page, `pwp-opt-${idx}`).click()
  await T(page, 'pwp-feedback').waitFor({ state: 'visible', timeout: 5000 })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[picture-practice]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsAll = []

  async function scenario(label, vp, body, { studentId = null, defaultFlags = true, login = loginToDashboard } = {}) {
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    const reqUrls = []
    page.on('request', (q) => reqUrls.push(q.url()))
    if (!defaultFlags) {
      await page.addInitScript(() => { try { localStorage.setItem('paulEasyVoca_features', JSON.stringify({ studentHomeMenu: true })) } catch { /* 무시 */ } })
    }
    const { unmockedRequests: u, apiCallLog, ttsFallbackRequests } = await installMocks(page, studentId ? { studentId } : {})
    // mockRoutes의 speechSynthesis 스텁 "뒤"에 등록해야 speak 호출을 센다(speaking.spec.mjs와 같은 방식)
    await page.addInitScript(() => {
      window.__speak = []
      const s = window.speechSynthesis
      if (!s) return
      const orig = s.speak.bind(s)
      s.speak = (u) => { if ((u.text || '').trim()) window.__speak.push(u.text); return orig(u) }
    })
    const name = `${label} [${vp.width}x${vp.height}]`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      const base = await storageSnap(page)
      await body({ page, name, reqUrls })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
      const bad = badWrites(apiCallLog)
      r.check(`${name} 로그인/분석 외 REST 쓰기 0건(업로드/STT 포함)`, bad.length === 0, bad.slice(0, 3).join(' | '))
      const after = await storageSnap(page)
      r.check(`${name} localStorage/sessionStorage 키 불변(새 키 0)`, JSON.stringify(base) === JSON.stringify(after), JSON.stringify({ base, after }))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally { await context.close() }
    unmockedRequests.push(...u)
    ttsAll.push(...ttsFallbackRequests)
  }

  // ---- (a) 전 과정, 모두 정답 ----
  await scenario('(a) 전 과정 정답', { width: 1280, height: 800 }, async ({ page, name }) => {
    const vp = { width: 1280, height: 800 }
    const bt = await T(page, 'dash-picture-words').boundingBox()
    const tw = T(page, 'dash-town-world')
    const bw = (await tw.count()) ? await tw.boundingBox() : null
    r.check(`${name} 첫 화면에 그림 단어 버튼(44px 이상)`, !!bt && bt.y >= 0 && bt.y + bt.height <= vp.height && bt.height >= 43.9, JSON.stringify(bt))
    r.check(`${name} 마을 버튼 바로 아래`, !bw || (bt.y > bw.y && bt.y - (bw.y + bw.height) < 40), JSON.stringify({ bt, bw }))
    await openFood(page)
    const ready = SETS.filter((s) => s.ready), notReady = SETS.filter((s) => !s.ready)
    let okDisabled = true
    for (const s of notReady) if (!(await T(page, `pwp-set-${s.shop}`).isDisabled())) okDisabled = false
    for (const s of ready) if (await T(page, `pwp-set-${s.shop}`).isDisabled()) okDisabled = false
    r.check(`${name} 묶음 선택: 준비된 ${ready.length}개 활성 / 준비 중 ${notReady.length}개 비활성`, okDisabled && notReady.length >= 1, notReady.map((s) => s.shop).join())
    const S = await pickSet(page, 'food')
    r.check(`${name} 6단어 세션 + 첫 단계 그림 보기 + 단어/뜻/그림 보임`, S.words.length === 6 && (await T(page, 'pwp-word').textContent()) === S.words[0].en && (await T(page, 'pwp-ko').textContent()) === S.words[0].ko && (await T(page, 'pwp-picture').isVisible()))
    r.check(`${name} 그림이 실제로 로드됨(naturalWidth>0)`, (await T(page, 'pwp-picture').evaluate((i) => i.complete && i.naturalWidth > 0)))
    await passStep(page, 'look', 6, 'listen')
    await passStep(page, 'listen', 6, 'repeat')
    await passStep(page, 'repeat', 6, 'quiz')
    for (let q = 0; q < 6; q++) {
      if ((await attr(page, 'data-index')) !== String(q)) throw new Error(`quiz index ${q}`)
      await answer(page, correctIdx(S.quiz[q]))
      const res = await T(page, 'pwp-feedback').getAttribute('data-result')
      const shown = await T(page, 'pwp-word').textContent()
      if (res !== 'right' || shown !== S.words[q].en) r.check(`${name} 문제 ${q + 1} 정답 처리/단어 공개`, false, `${res} ${shown} ${S.words[q].en}`)
      const opts = await page.locator('[data-testid^="pwp-opt-"]').evaluateAll((l) => l.map((b) => b.disabled))
      if (!opts.every(Boolean)) r.check(`${name} 답한 뒤 옵션 잠김`, false, JSON.stringify(opts))
      await T(page, 'pwp-next').click()
    }
    r.check(`${name} 6문제 모두 정답으로 통과`, true)
    await waitStep(page, 'review')
    r.check(`${name} 오답이 없으면 "모두 맞혔어요" 카드`, ((await T(page, 'pwp-review-card').textContent()) || '').includes('모두 맞혔어요') && (await T(page, 'pwp-review-card').getAttribute('data-kind')) === 'clear')
    await T(page, 'pwp-next').click()
    await waitStep(page, 'summary')
    r.check(`${name} 요약: 처음에 6 / 6`, ((await T(page, 'pwp-summary-first-try').textContent()) || '').replace(/\s/g, '') === '6/6')
    r.check(`${name} 요약 버튼 3개(다시 하기/다른 묶음/나가기)`, (await T(page, 'pwp-again').count()) === 1 && (await T(page, 'pwp-other-set').count()) === 1 && (await T(page, 'pwp-exit').count()) === 1)
    await T(page, 'pwp-other-set').click()
    await waitStep(page, 'pick')
    await T(page, 'pwp-exit').click()
    await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 나가기 → 대시보드 복귀`, (await T(page, 'pwp-root').count()) === 0)
  }, { studentId: TESTER_ONLY })

  // ---- (b) 일부러 오답 → 복습 → 다시 하기 ----
  await scenario('(b) 오답 복습', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openFood(page)
    const S = await pickSet(page, 'food')
    await toQuiz(page)
    const wrongWords = []
    for (let q = 0; q < 6; q++) {
      const bad = q < 2
      await answer(page, bad ? wrongIdx(S.quiz[q]) : correctIdx(S.quiz[q]))
      const res = await T(page, 'pwp-feedback').getAttribute('data-result')
      r.check(`${name} 문제 ${q + 1} ${bad ? '오답' : '정답'} → data-result=${bad ? 'wrong' : 'right'}`, res === (bad ? 'wrong' : 'right'), res)
      if (bad) wrongWords.push(S.words[q])
      await T(page, 'pwp-next').click()
    }
    await waitStep(page, 'review')
    let round = 0
    for (let k = 0; k < 2; k++) {
      const w = wrongWords[k]
      await T(page, 'pwp-review-card').waitFor({ state: 'visible', timeout: 5000 })
      const cardText = (await T(page, 'pwp-review-card').textContent()) || ''
      r.check(`${name} 복습 카드 ${k + 1}: 틀린 단어 ${w.en}를 먼저 보여줌`, (await T(page, 'pwp-word').textContent()) === w.en && cardText.includes(w.ko))
      await T(page, 'pwp-next').click() // 문제 풀기
      const rq = buildQuiz([w], POOL, S.seed + 7919 * (round + 1))[0]
      await answer(page, correctIdx(rq))
      r.check(`${name} 복습 문제 ${k + 1} 정답 처리`, (await T(page, 'pwp-feedback').getAttribute('data-result')) === 'right')
      await T(page, 'pwp-next').click()
      round++
    }
    await waitStep(page, 'summary')
    r.check(`${name} 요약: 처음에 4 / 6`, ((await T(page, 'pwp-summary-first-try').textContent()) || '').replace(/\s/g, '') === '4/6')
    const listed = await T(page, 'pwp-summary-review').allTextContents()
    r.check(`${name} 요약에 복습한 단어 2개 나열`, listed.length === 2 && wrongWords.every((w) => listed.some((t) => t.includes(w.en))), JSON.stringify(listed))
    const oldSeed = await attr(page, 'data-seed')
    await T(page, 'pwp-again').click()
    await waitStep(page, 'look')
    r.check(`${name} 다시 하기 → 새 세션(그림 보기부터, 새 시드)`, (await attr(page, 'data-index')) === '0' && (await attr(page, 'data-seed')) !== oldSeed)
  }, { studentId: TESTER_ONLY })

  // ---- (c)(d)(e) 누출 / 듣기 / 마이크 없이 따라 말하기 ----
  await scenario('(c)(d)(e) 누출·듣기·따라 말하기', { width: 1280, height: 800 }, async ({ page, name }) => {
    await openFood(page)
    const S = await pickSet(page, 'food')
    await passStep(page, 'look', 6, 'listen')
    // (d) 듣기
    r.check(`${name} (d) 듣기 단계 진입만으로는 speak 0 (자동재생 없음)`, (await page.evaluate(() => window.__speak.length)) === 0)
    await T(page, 'pwp-listen').click()
    await page.waitForFunction(() => window.__speak.length >= 1, null, { timeout: 4000 }).catch(() => {})
    const sp = await page.evaluate(() => window.__speak)
    r.check(`${name} (d) 듣기 버튼 → speechSynthesis.speak(해당 단어)`, sp.length >= 1 && sp[sp.length - 1] === S.words[0].en, JSON.stringify(sp))
    r.check(`${name} (d) 들었어요 표시`, ((await T(page, 'pwp-heard').textContent()) || '').includes('들었어요'))
    await passStep(page, 'listen', 6, 'repeat')
    // (e) 마이크 없이
    r.check(`${name} (e) 녹음 영역(pwp-rec) + 다 말했어요 버튼 존재`, (await T(page, 'pwp-rec').count()) === 1 && (await T(page, 'pwp-said').count()) === 1)
    await T(page, 'pwp-said').click()
    r.check(`${name} (e) 다 말했어요 → 표시만 바뀜(판정 문구 없음)`, ((await T(page, 'pwp-said').textContent()) || '').includes('다 말했어요') && !/맞|틀|점수|잘했/.test((await T(page, 'pwp-rec').textContent()) || ''))
    await passStep(page, 'repeat', 6, 'quiz')
    // (c) 누출
    for (const id of ['pwp-word', 'pwp-ko', 'pwp-listen', 'pwp-feedback', 'pwp-next']) {
      if ((await T(page, id).count()) !== 0) r.check(`${name} (c) 답하기 전 ${id} 없음`, false, String(await T(page, id).count()))
    }
    r.check(`${name} (c) 답하기 전 pwp-word/ko/listen/feedback/next DOM 0개`, true)
    r.check(`${name} (c) 그림 alt === "그림"`, (await T(page, 'pwp-picture').getAttribute('alt')) === '그림')
    const leak = await page.evaluate((ans) => {
      const root = document.querySelector('[data-testid="pwp-root"]')
      const clone = root.cloneNode(true)
      clone.querySelectorAll('[data-testid^="pwp-opt-"]').forEach((n) => n.remove())
      const text = clone.textContent || ''
      const attrs = [...root.querySelectorAll('*'), root].flatMap((el) => [...el.attributes].map((a) => a.name))
      const optAttrs = [...document.querySelectorAll('[data-testid^="pwp-opt-"]')].flatMap((el) => [...el.attributes].map((a) => a.name))
      return { hasEn: text.toLowerCase().includes(ans.en.toLowerCase()), hasKo: text.includes(ans.ko), badAttr: attrs.filter((n) => /correct|answer|right|result/i.test(n)), optAttrs }
    }, S.words[0])
    r.check(`${name} (c) 옵션을 뺀 화면 글에 정답 영어/뜻이 없음`, !leak.hasEn && !leak.hasKo, JSON.stringify(leak))
    r.check(`${name} (c) correct/answer 계열 속성 0 + 옵션 속성은 testid/type/class뿐`, leak.badAttr.length === 0 && leak.optAttrs.every((n) => ['data-testid', 'type', 'class'].includes(n)), JSON.stringify(leak))
    const optTexts = await page.locator('[data-testid^="pwp-opt-"]').allTextContents()
    r.check(`${name} (c) 옵션 4개, 서로 다른 단어, 정답 1개 포함`, optTexts.length === 4 && new Set(optTexts.map((t) => t.toLowerCase())).size === 4 && optTexts.filter((t) => t === S.words[0].en).length === 1, JSON.stringify(optTexts))
    const idxs = new Set(S.quiz.map(correctIdx))
    r.check(`${name} (c) 정답 위치가 문제마다 고정이 아님`, idxs.size >= 2, [...idxs].join())
    const sp2 = await page.evaluate(() => window.__speak.length)
    r.check(`${name} (c) 답하기 전 퀴즈에서 소리 재생 없음`, sp2 === sp.length, `${sp2} vs ${sp.length}`)
  }, { studentId: TESTER_ONLY })

  // ---- (f) 360x640 ----
  await scenario('(f) 모바일 레이아웃', { width: 360, height: 640 }, async ({ page, name }) => {
    const covered = async (id) => {
      const loc = T(page, id)
      await loc.scrollIntoViewIfNeeded()
      return loc.evaluate((el) => { const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(top === el || el.contains(top)) })
    }
    const small = async () => page.locator('button:visible').evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 43.9).length)
    await T(page, 'dash-picture-words').waitFor({ state: 'visible', timeout: 20000 })
    r.check(`${name} 대시보드 가로 넘침 0`, (await overflow(page)) <= 0, String(await overflow(page)))
    await T(page, 'dash-picture-words').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible' })
    r.check(`${name} 묶음 선택 가로 넘침 0 / 작은 버튼 0`, (await overflow(page)) <= 0 && (await small()) === 0, `${await overflow(page)}/${await small()}`)
    const S = await pickSet(page, 'food')
    for (const step of ['look', 'listen', 'repeat']) {
      for (let i = 0; i < 6; i++) {
        const o = await overflow(page), c = await covered('pwp-next'), sm = await small()
        if (o > 0 || c || sm) r.check(`${name} ${step} #${i} 넘침 ${o} / 다음 가림 ${c} / 작은 버튼 ${sm}`, false)
        await T(page, 'pwp-next').click()
      }
      await waitStep(page, { look: 'listen', listen: 'repeat', repeat: 'quiz' }[step])
    }
    r.check(`${name} 그림 보기/듣기/따라 말하기 6단어씩: 가로 넘침 0, 다음 버튼 가림 0, 작은 버튼 0`, true)
    const o0 = await overflow(page)
    await answer(page, wrongIdx(S.quiz[0]))
    const o1 = await overflow(page), c1 = await covered('pwp-next'), sm1 = await small()
    r.check(`${name} 퀴즈(답한 뒤): 넘침 0 / 다음 가림 0 / 작은 버튼 0 (답 전 넘침 ${o0})`, o0 <= 0 && o1 <= 0 && !c1 && sm1 === 0, `${o1}/${c1}/${sm1}`)
    await T(page, 'pwp-next').click()
    for (let q = 1; q < 6; q++) { await answer(page, correctIdx(S.quiz[q])); await T(page, 'pwp-next').click() }
    await waitStep(page, 'review')
    const oc = await overflow(page), cc = await covered('pwp-next')
    r.check(`${name} 복습 카드: 넘침 0 / 다음 가림 0`, oc <= 0 && !cc, `${oc}/${cc}`)
    await T(page, 'pwp-next').click()
    await answer(page, correctIdx(buildQuiz([S.words[0]], POOL, S.seed + 7919)[0]))
    await T(page, 'pwp-next').click()
    await waitStep(page, 'summary')
    r.check(`${name} 요약: 넘침 0 / 작은 버튼 0`, (await overflow(page)) <= 0 && (await small()) === 0)
  }, { studentId: TESTER_ONLY })

  // ---- (g) 진입 제한 / 홈 메뉴 진입 ----
  await scenario('(g) 일반 학생', { width: 1280, height: 800 }, async ({ page, name, reqUrls }) => {
    await sleep(1000)
    r.check(`${name} 대시보드에 그림 단어 버튼 없음`, (await T(page, 'dash-picture-words').count()) === 0)
    r.check(`${name} 연습 화면 마운트 안 됨`, (await T(page, 'pwp-root').count()) === 0)
    const chunk = reqUrls.filter((u) => /PictureWordPractice/i.test(u))
    r.check(`${name} 연습 청크 요청 0건`, chunk.length === 0, chunk.slice(0, 2).join(','))
  }, { studentId: GENERAL })

  await scenario('(g) QA+테스터 홈 메뉴', { width: 1280, height: 800 }, async ({ page, name }) => {
    await T(page, 'student-home-picture-words').waitFor({ state: 'visible', timeout: 15000 })
    const bt = await T(page, 'student-home-picture-words').boundingBox()
    r.check(`${name} 홈 메뉴에 그림 단어 버튼(44px 이상)`, !!bt && bt.height >= 43.9, JSON.stringify(bt))
    await T(page, 'student-home-picture-words').click()
    await T(page, 'pwp-root').waitFor({ state: 'visible', timeout: 20000 })
    await T(page, 'pwp-exit').click()
    await T(page, 'student-home').waitFor({ state: 'visible', timeout: 10000 })
    r.check(`${name} 나가기 → 홈 메뉴 복귀`, (await T(page, 'pwp-root').count()) === 0)
  }, { defaultFlags: false, login: loginToHome })

  r.check('TTS 네트워크 폴백 요청 0건(합성 음성 스텁 경로)', ttsAll.length === 0, JSON.stringify(ttsAll.slice(0, 2)))
  return { results: r.results, unmockedRequests, mockErrors }
}
