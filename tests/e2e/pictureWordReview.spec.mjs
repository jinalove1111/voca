// tests/e2e/pictureWordReview.spec.mjs — 그림 단어 승인 검토 패널(248차). 관리자 전용, 네트워크 mock, 패널은 localStorage만 쓴다.
import fs from 'node:fs'
import path from 'node:path'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { ADMIN_PIN } from './fixtures/index.mjs'

const ROOT = path.resolve(import.meta.dirname, '../..')
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/pictureWords/pictureWords.json'), 'utf8'))
const BY = (s) => DATA.entries.filter((e) => e.status === s)
const KEY = 'paulEasyVoca_pictureWordReview'
const T = (page, id) => page.locator(`[data-testid="${id}"]`)
const txt = async (page, id) => ((await T(page, id).textContent()) || '').trim()

async function openPanel(page) {
  await page.locator('button', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 90000 })
  await page.locator('button', { hasText: '⚙️ 관리자' }).click()
  await page.getByPlaceholder('비밀번호').fill(ADMIN_PIN)
  await page.locator('button', { hasText: '로그인' }).click()
  await page.locator('h1', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('button', { hasText: '🖼 그림단어' }).click()
  await T(page, 'pwr-root').waitFor({ state: 'visible', timeout: 30000 })
}
const keys = (page) => page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].sort())
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const DOUBTFUL = '[data-testid^="pwr-card-"]:not([data-status="UNUSABLE"])'

export async function run(browser, baseURL) {
  const r = createRecorder('[picture-words]')
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } })
  const page = await context.newPage()
  const { db, unmockedRequests, ttsFallbackRequests } = await installMocks(page)
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  const net = []
  page.on('request', (q) => net.push({ method: q.method(), url: q.url() }))
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
    await page.locator('button', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 90000 })
    const before = await keys(page)
    await openPanel(page)
    const netStart = net.length

    r.check('로컬 저장 안내 문구', (await txt(page, 'pwr-local-notice')).includes('이 브라우저에만 저장됩니다'))
    const cards = page.locator('[data-testid^="pwr-card-"]')
    r.check('카드 32장 = 승인 필요 31 + 사용 불가 1', (await cards.count()) === 32, String(await cards.count()))
    const st = async (s) => page.locator(`[data-testid^="pwr-card-"][data-status="${s}"]`).count()
    r.check('불일치 16 / 불확실 10 / 여러 개 5 / 사용 불가 1', (await st('MISMATCH')) === 16 && (await st('UNCERTAIN')) === 10 && (await st('MULTIPLE')) === 5 && (await st('UNUSABLE')) === 1)
    r.check('카운터 초기 승인 0 / 제외 0 / 남음 31', (await txt(page, 'pwr-count-approved')) === '0' && (await txt(page, 'pwr-count-excluded')) === '0' && (await txt(page, 'pwr-count-pending')) === '31')
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="pwr-img-"]')].every((i) => i.complete), null, { timeout: 30000 }).catch(() => {})
    const widths = await page.locator('[data-testid^="pwr-img-"]').evaluateAll((l) => l.map((i) => i.naturalWidth))
    r.check('검토 탭 이미지 32개 모두 naturalWidth > 0', widths.length === 32 && widths.every((w) => w > 0), String(widths.filter((w) => !(w > 0)).length))

    const [m1, m2, m3] = BY('MISMATCH'), un = BY('UNCERTAIN')[0], uz = BY('UNUSABLE')[0]
    await T(page, `pwr-approve-${m1.asset}`).click()
    r.check('승인 → data-decision=approve', (await T(page, `pwr-card-${m1.asset}`).getAttribute('data-decision')) === 'approve')
    r.check('카운터 승인 1 / 남음 30', (await txt(page, 'pwr-count-approved')) === '1' && (await txt(page, 'pwr-count-pending')) === '30')
    await T(page, `pwr-edit-${m2.asset}`).click()
    await T(page, `pwr-en-${m2.asset}`).fill('edited-word')
    await T(page, `pwr-ko-${m2.asset}`).fill('수정된뜻')
    await T(page, `pwr-approve-${m2.asset}`).click()
    await T(page, `pwr-exclude-${m3.asset}`).click()
    r.check('제외 → data-decision=exclude, 카운터 제외 1', (await T(page, `pwr-card-${m3.asset}`).getAttribute('data-decision')) === 'exclude' && (await txt(page, 'pwr-count-excluded')) === '1')
    await T(page, `pwr-exclude-${un.asset}`).click()
    await T(page, `pwr-reset-${un.asset}`).click()
    r.check('보류 → data-decision=none', (await T(page, `pwr-card-${un.asset}`).getAttribute('data-decision')) === 'none')
    r.check('사용 불가 카드는 승인 버튼 없음', (await T(page, `pwr-approve-${uz.asset}`).count()) === 0 && (await T(page, `pwr-exclude-${uz.asset}`).count()) === 1)
    await T(page, 'pwr-fd-approve').click()
    r.check('결정 필터(승인) → 2장', (await page.locator(DOUBTFUL).count()) === 2)
    await T(page, 'pwr-fd-ALL').click()
    await T(page, 'pwr-fs-UNCERTAIN').click()
    r.check('상태 필터(불확실) → 10장 + 사용 불가 1', (await cards.count()) === 11)
    await T(page, 'pwr-fs-ALL').click()

    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    await T(page, 'pwr-export').click()
    const exp = await T(page, 'pwr-export-text').inputValue()
    let parsed = null; try { parsed = JSON.parse(exp) } catch { /* */ }
    r.check('내보내기 텍스트에 수정값 포함', !!parsed && parsed.v === 1 && parsed.decisions[m2.id]?.en === 'edited-word' && parsed.decisions[m2.id]?.ko === '수정된뜻' && parsed.decisions[m1.id]?.action === 'approve' && parsed.decisions[m3.id]?.action === 'exclude' && !parsed.decisions[un.id])
    const stored = await page.evaluate((k) => localStorage.getItem(k), KEY)
    r.check('localStorage 키 저장', !!stored && JSON.parse(stored).v === 1)
    const preReload = net.length // 새로고침은 앱 부팅(관리자 화면 자체의 반/유닛 조회)을 다시 일으키므로 패널 구간에서 뺀다
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openPanel(page)
    const postReopen = net.length
    r.check('새로고침 후 결정 유지', (await T(page, `pwr-card-${m1.asset}`).getAttribute('data-decision')) === 'approve' && (await T(page, `pwr-card-${m3.asset}`).getAttribute('data-decision')) === 'exclude' && (await txt(page, 'pwr-count-approved')) === '2')

    await T(page, 'pwr-tab-result').click()
    const gc = await page.locator('[data-testid^="pwr-phonics-group-"]').count()
    const pw = await page.locator('[data-testid^="pwr-phonics-group-"] img').count()
    r.check('Phonics 그룹 13개 / 단어 33개', gc === 13 && pw === 33, `${gc}/${pw}`)
    r.check('학습 순서 미확정 안내', (await txt(page, 'pwr-phonics-order-notice')).includes('학습 순서 미확정'))
    r.check('샵 그룹 8개', (await page.locator('[data-testid^="pwr-shop-"]').count()) === 8)
    r.check('재사용 18 / 신규 후보 101', (await txt(page, 'pwr-reuse-count')) === '18' && (await txt(page, 'pwr-new-count')) === '101')
    r.check('설계 — 미구현 표기', (await page.locator('body').innerText()).includes('설계 — 미구현'))

    await page.setViewportSize({ width: 360, height: 640 })
    r.check('360px 가로 넘침 없음(결과 탭)', (await overflow(page)) <= 0, String(await overflow(page)))
    await T(page, 'pwr-tab-review').click()
    r.check('360px 가로 넘침 없음(검토 탭)', (await overflow(page)) <= 0, String(await overflow(page)))
    const small = await page.locator('[data-testid^="pwr-approve-"], [data-testid^="pwr-exclude-"], [data-testid^="pwr-reset-"], [data-testid^="pwr-edit-"]').evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 44).length)
    r.check('버튼 높이 ≥ 44px', small === 0, String(small))

    await T(page, 'pwr-clear').click()
    r.check('초기화 전 확인 단계 노출', (await T(page, 'pwr-clear-confirm').count()) === 1 && (await txt(page, 'pwr-count-approved')) === '2')
    await T(page, 'pwr-clear-confirm').click()
    r.check('전체 초기화 → 승인 0 / 남음 31', (await txt(page, 'pwr-count-approved')) === '0' && (await txt(page, 'pwr-count-pending')) === '31')

    const after = await keys(page)
    const added = after.filter((k) => !before.includes(k))
    r.check('추가된 저장소 키는 paulEasyVoca_pictureWordReview 뿐', added.length === 1 && added[0] === KEY, JSON.stringify(added))
    const panelNet = [...net.slice(netStart, preReload), ...net.slice(postReopen)]
    const bad = panelNet.filter((q) => q.method !== 'GET' || /supabase|\/api\//.test(q.url))
    const writes = net.slice(netStart).filter((q) => q.method !== 'GET' && q.method !== 'HEAD' && q.method !== 'OPTIONS' && !q.url.includes('/api/verify-admin-pin')) // 새로고침 뒤 관리자 재로그인(mock)은 데이터 쓰기가 아니다
    r.check('새로고침 포함 전 구간 데이터 쓰기 요청 0건', writes.length === 0, JSON.stringify(writes.slice(0, 3)))
    r.check('패널 사용 중 쓰기/Supabase//api 요청 0건', bad.length === 0, JSON.stringify(bad.slice(0, 3)))
    r.check('콘솔 오류 0건', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)))
  } catch (err) {
    const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
    err.message += `\n  [진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
    throw err
  } finally {
    await context.close()
  }
  return { results: r.results, unmockedRequests, mockErrors: db.errors, ttsFallbackRequests }
}
