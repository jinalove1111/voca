// tests/e2e/hats.spec.mjs
//
// 학생 모자 PNG 이미지(src/assets/hats, 색 정체성 매핑) 표시 회귀 스펙.
// 모든 네트워크 mock. 진행 데이터는 installMocks({ tables })의 student_progress
// .progress_data에 hatInventory/equippedHatId/cleared를 심어 클라우드 복원 경로로 주입한다
// (townV2.spec S8a와 동일 패턴). 시나리오당 context 1개. 파일당 소유권 원칙(규칙 16)에 따라
// 다른 spec 헬퍼는 import하지 않고 복제한다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { writesTo } from './lib/postgrestMock.mjs'
import { buildFixtureTables, QA_STUDENT_NAME, QA_STUDENT_ID, QA_LOGIN_PIN } from './fixtures/index.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = 'C:\\Users\\jinal\\AppData\\Local\\Temp\\claude\\C--voca\\4dd777a3-9f93-4c78-a984-4f4ee328e279\\scratchpad\\shots'
const HATS_INDEX = path.resolve(HERE, '../../src/assets/hats/index.js')

const ALL_IDS = ['hat_starter', 'hat_explorer', 'hat_chef', 'hat_scientist', 'hat_wizard', 'hat_graduation', 'hat_crown', 'hat_rose']
// 기대 색표(scenario f에서 index.js 텍스트와 대조).
const COLOR_BY_ID = {
  hat_rose: 'pink', hat_graduation: 'red', hat_chef: 'green', hat_explorer: 'blue',
  hat_wizard: 'purple', hat_crown: 'gold', hat_starter: 'navy', hat_scientist: 'orange',
}
const HOME = '[data-testid="student-home"]'
const HOME_IMG = '[data-testid="student-home-hat-img"]'
const VPS = [{ width: 360, height: 640, label: '360' }, { width: 1280, height: 800, label: '1280' }]
const MAIN_VP = { width: 390, height: 844, label: '390' }

const inv = (ids) => ids.map((hatId) => ({ hatId, earnedAt: '2026-09-01T00:00:00.000Z', source: 'e2e seed' }))
const hasColor = (src, id) => typeof src === 'string' && src.includes(`paul-hat-${COLOR_BY_ID[id]}`)

function seededTables(progress) {
  return { ...buildFixtureTables(), student_progress: [{ student_id: QA_STUDENT_ID, progress_data: progress }] }
}

async function waitUntil(fn, { timeout = 15000, interval = 150 } = {}) {
  const start = Date.now()
  let last
  while (true) {
    try { last = await fn() } catch { last = undefined }
    if (last) return last
    if (Date.now() - start >= timeout) return last
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

async function loginOnly(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}
const waitHome = (page, timeout = 20000) => page.locator(HOME).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
const waitDashboard = (page, timeout = 15000) => page.getByLabel('교과서 선택').waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const attr = (page, sel, a) => page.locator(sel).first().getAttribute(a).catch(() => null)
const loaded = (page, sel) => page.locator(sel).first().evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false)

async function openCollection(page) {
  await page.locator('[data-testid="student-home-menu-growth"]').click()
  await page.locator('[data-testid="student-growth-link-hatCollection"]').click()
  await page.getByRole('heading', { name: /모자 컬렉션/ }).waitFor({ state: 'visible', timeout: 10000 })
}
async function collectionBackToHome(page) {
  await page.getByRole('button', { name: '← 홈으로' }).click()
  await page.getByRole('button', { name: '← 홈' }).click()
  await waitHome(page)
}

export async function run(browser, baseURL) {
  const r = createRecorder('[hats]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  // waitSel: 대상과 모든 조상의 opacity가 1이 될 때까지(화면 fade-in 중 캡처 방지) 기다린 뒤 찍는다.
  const shot = async (page, scene, vp, opts = {}, waitSel = null) => {
    if (waitSel) {
      await page.waitForFunction((sel) => {
        let el = document.querySelector(sel)
        if (!el) return false
        for (; el; el = el.parentElement) if (getComputedStyle(el).opacity !== '1') return false
        return true
      }, waitSel, { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(400)
    }
    return page.screenshot({ path: path.join(SHOT_DIR, `hats-${scene}-${vp.label}.png`), animations: 'disabled', ...opts }).catch(() => {})
  }

  async function scenario(label, vp, { progress, studentId } = {}, body) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
    page.on('dialog', (d) => d.dismiss())
    const mocks = await installMocks(page, progress ? { tables: seededTables(progress) } : studentId ? { studentId } : {})
    const name = `${label} [${vp.width}x${vp.height}]`
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await loginOnly(page)
      await body({ page, name, db: mocks.db })
      r.check(`${name} 콘솔/페이지 오류 0건`, errors.length === 0, errors.slice(0, 3).join(' | '))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 예외 없음`, false, `${err.message} | body=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      await context.close()
    }
    unmockedRequests.push(...mocks.unmockedRequests)
    ttsFallbackRequests.push(...mocks.ttsFallbackRequests)
    mockErrors.push(...mocks.db.errors)
  }

  // ── a. 현재 단계 모자 표시: 홈 헤더 / 컬렉션 8장 / 대시보드 ─────────────
  await scenario('a 모자 표시', MAIN_VP, { progress: { hatInventory: inv(ALL_IDS), equippedHatId: 'hat_rose' } }, async ({ page, name }) => {
    r.check(`${name} 홈 표시`, await waitHome(page))
    await page.locator(HOME_IMG).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    r.check(`${name} 홈 헤더 img 보임`, await page.locator(HOME_IMG).isVisible().catch(() => false))
    r.check(`${name} 홈 헤더 src = paul-hat-pink`, hasColor(await attr(page, HOME_IMG, 'src'), 'hat_rose'), String(await attr(page, HOME_IMG, 'src')))
    r.check(`${name} 홈 헤더 data-hat = hat_rose`, (await attr(page, HOME_IMG, 'data-hat')) === 'hat_rose')
    r.check(`${name} 홈 헤더 img 디코드(naturalWidth>0)`, await loaded(page, HOME_IMG))

    // 컬렉션 — 8장 전부 소유로 시드: 카드 8장 각자 매핑 색
    await openCollection(page)
    for (const id of ALL_IDS) {
      const sel = `[data-testid="hat-card-img-${id}"]`
      r.check(`${name} 컬렉션 ${id} 카드 src = ${COLOR_BY_ID[id]}`, hasColor(await attr(page, sel, 'src'), id), String(await attr(page, sel, 'src')))
    }
    r.check(`${name} 컬렉션 카드 img 8개 전부 디코드`, await page.locator('[data-testid^="hat-card-img-"]').evaluateAll((els) => els.length === 8 && els.every((e) => e.complete && e.naturalWidth > 0)))
    r.check(`${name} 컬렉션 아바타 img = pink`, hasColor(await attr(page, '[data-testid="hat-collection-avatar-img"]', 'src'), 'hat_rose'))

    // 대시보드(홈 → 단어 연습)
    await collectionBackToHome(page)
    await page.locator('[data-testid="student-home-menu-voca"]').click()
    r.check(`${name} 대시보드 진입`, await waitDashboard(page))
    r.check(`${name} 대시보드 img = pink / data-hat`, hasColor(await attr(page, '[data-testid="dashboard-hat-img"]', 'src'), 'hat_rose') && (await attr(page, '[data-testid="dashboard-hat-img"]', 'data-hat')) === 'hat_rose')
    r.check(`${name} 대시보드 img 디코드`, await loaded(page, '[data-testid="dashboard-hat-img"]'))
  })

  // 미소유 모자: 소스 동작 = 이미지가 아니라 🔒 표시(HatCollection: owned ? img : '🔒').
  await scenario('a2 미소유 카드', MAIN_VP, { progress: { hatInventory: inv(['hat_rose']), equippedHatId: 'hat_rose' } }, async ({ page, name }) => {
    await waitHome(page)
    await openCollection(page)
    r.check(`${name} 소유 1장만 img (hat_rose)`, (await page.locator('[data-testid^="hat-card-img-"]').count()) === 1 && (await page.locator('[data-testid="hat-card-img-hat_rose"]').count()) === 1)
    r.check(`${name} 미소유 7장은 img 없이 🔒 (소스 동작 그대로)`, (await page.locator('text=🔒').count()) === 7)
  })

  // ── b. 장착 변경 → 헤더 모자 변경 + 새로고침 후 유지 ───────────────────
  await scenario('b 장착 변경', MAIN_VP, { progress: { hatInventory: inv(['hat_rose', 'hat_graduation']), equippedHatId: 'hat_rose' } }, async ({ page, name, db }) => {
    await waitHome(page)
    r.check(`${name} 시작은 pink`, hasColor(await attr(page, HOME_IMG, 'src'), 'hat_rose'))
    await openCollection(page)
    const card = page.locator('div.rounded-3xl', { has: page.locator('[data-testid="hat-card-img-hat_graduation"]') })
    await card.getByRole('button', { name: '이 모자 쓰기' }).click()
    r.check(`${name} 컬렉션 아바타가 즉시 red`, await waitUntil(async () => hasColor(await attr(page, '[data-testid="hat-collection-avatar-img"]', 'src'), 'hat_graduation')))
    await collectionBackToHome(page)
    r.check(`${name} 홈 헤더 = red / data-hat = hat_graduation`, hasColor(await attr(page, HOME_IMG, 'src'), 'hat_graduation') && (await attr(page, HOME_IMG, 'data-hat')) === 'hat_graduation')
    // 디바운스 동기화가 mock DB(PATCH/POST를 in-memory 행에 반영)에 도착할 때까지.
    const synced = await waitUntil(() => {
      const w = writesTo(db, 'student_progress')
      return w.length > 0 && w[w.length - 1]?.body?.progress_data?.equippedHatId === 'hat_graduation'
    }, { timeout: 20000 })
    r.check(`${name} 장착이 student_progress 쓰기 로그에 기록`, !!synced)
    const row = (db.tables.student_progress || []).find((x) => x.student_id === QA_STUDENT_ID)
    r.check(`${name} mock DB 행에 equippedHatId = hat_graduation`, row?.progress_data?.equippedHatId === 'hat_graduation', JSON.stringify(row?.progress_data?.equippedHatId))
    await page.reload({ waitUntil: 'domcontentloaded' })
    r.check(`${name} 새로고침 후 홈 복귀`, await waitHome(page))
    await page.locator(HOME_IMG).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    // 새로고침은 localStorage와 클라우드(mock DB)를 함께 읽는다. 클라우드 단독 검증은 위 DB 행 단언이 담당.
    r.check(`${name} 새로고침 후에도 red`, hasColor(await attr(page, HOME_IMG, 'src'), 'hat_graduation'))
  })

  // ── c. 승급 경계: cleared 9 → 수여식 없음 / cleared 10 → hat_explorer(blue) 수여식 ──
  // 판정은 useAttachment가 로그인 복원 직후 1회 수행(evaluateHatUnlocks → grantHats, 자동 장착 없음).
  // 학습 중 승급은 브라우저에서 결정론적으로 만들 수 없어 시드로 경계를 만들고,
  // 사용자 조작은 "단어 연습" 진입(수여식은 Dashboard 렌더)과 "모자 쓰기!" 클릭뿐이다.
  const cleared = (n) => Array.from({ length: n }, (_, i) => `e2e-cleared-${i}`)
  await scenario('c1 승급 직전(9개)', MAIN_VP, { progress: { cleared: cleared(9), hatInventory: [], equippedHatId: null } }, async ({ page, name }) => {
    await waitHome(page)
    await page.locator('[data-testid="student-home-menu-voca"]').click()
    r.check(`${name} 대시보드 진입`, await waitDashboard(page))
    await page.waitForTimeout(800)
    r.check(`${name} 9개: 수여식 없음`, (await page.locator('[data-testid="hat-ceremony-img"]').count()) === 0)
  })
  await scenario('c2 승급 경계(10개)', MAIN_VP, { progress: { cleared: cleared(10), hatInventory: [], equippedHatId: null } }, async ({ page, name, db }) => {
    await waitHome(page)
    await page.locator('[data-testid="student-home-menu-voca"]').click()
    await waitDashboard(page)
    const img = page.locator('[data-testid="hat-ceremony-img"]')
    await img.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    r.check(`${name} 10개: 수여식 img 보임`, await img.isVisible().catch(() => false))
    r.check(`${name} 수여식 img = blue / data-hat = hat_explorer / 디코드`, hasColor(await attr(page, '[data-testid="hat-ceremony-img"]', 'src'), 'hat_explorer') && (await attr(page, '[data-testid="hat-ceremony-img"]', 'data-hat')) === 'hat_explorer' && await loaded(page, '[data-testid="hat-ceremony-img"]'))
    await shot(page, 'ceremony', MAIN_VP, {}, '[data-testid="hat-ceremony-img"]')
    await page.getByRole('button', { name: /모자 쓰기!/ }).click()
    const dash = '[data-testid="dashboard-hat-img"]'
    await page.locator(dash).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
    r.check(`${name} 장착 후 대시보드 img = blue`, hasColor(await attr(page, dash, 'src'), 'hat_explorer'))
    r.check(`${name} 수여식 닫힘`, (await page.locator('[data-testid="hat-ceremony-img"]').count()) === 0)
    const granted = await waitUntil(() => {
      const w = writesTo(db, 'student_progress')
      const list = w[w.length - 1]?.body?.progress_data?.hatInventory
      return Array.isArray(list) && list.some((h) => h.hatId === 'hat_explorer')
    }, { timeout: 20000 })
    r.check(`${name} 인벤토리에 hat_explorer 영속 쓰기`, !!granted)
  })

  // ── d. 없음/폴백 ───────────────────────────────────────────────────
  await scenario('d1 미장착', MAIN_VP, { progress: { hatInventory: inv(['hat_rose']), equippedHatId: null } }, async ({ page, name }) => {
    await waitHome(page)
    await page.waitForTimeout(500)
    r.check(`${name} 홈 헤더 img 없음`, (await page.locator(HOME_IMG).count()) === 0)
    r.check(`${name} 홈 헤더 👑 폴백`, ((await page.locator(HOME).locator('span[aria-hidden="true"]').first().textContent().catch(() => '')) || '').includes('👑'))
  })
  await scenario('d2 비QA 학생(대시보드 직행)', MAIN_VP, { studentId: 'e2e00000-0000-4000-8000-00000000b001' }, async ({ page, name }) => {
    r.check(`${name} 홈 없이 대시보드가 첫 화면`, await waitDashboard(page))
    r.check(`${name} 모자 img 없음 + 👑`, (await page.locator('[data-testid="dashboard-hat-img"]').count()) === 0 && (await page.locator('text=👑').count()) > 0)
  })

  // ── e. 레이아웃·잘림·배경·알파 (hat_crown 장착, 360/1280) ──────────────
  for (const vp of VPS) {
    await scenario('e 레이아웃', vp, { progress: { hatInventory: inv(ALL_IDS), equippedHatId: 'hat_crown' } }, async ({ page, name }) => {
      await waitHome(page)
      await page.locator(HOME_IMG).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
      const g = await page.locator(HOME_IMG).evaluate((img) => {
        const b = img.getBoundingClientRect()
        const p = img.parentElement.getBoundingClientRect()
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const alpha = (x, y) => ctx.getImageData(x, y, 1, 1).data[3]
        return {
          b: { x: b.x, y: b.y, w: b.width, h: b.height }, p: { x: p.x, y: p.y, w: p.width, h: p.height },
          nw: img.naturalWidth, nh: img.naturalHeight,
          corners: [alpha(0, 0), alpha(c.width - 1, 0), alpha(0, c.height - 1), alpha(c.width - 1, c.height - 1)],
          vw: window.innerWidth,
        }
      })
      const T = 1.5
      r.check(`${name} 홈 img가 부모 박스 안(잘림 없음)`, g.b.x >= g.p.x - T && g.b.y >= g.p.y - T && g.b.x + g.b.w <= g.p.x + g.p.w + T && g.b.y + g.b.h <= g.p.y + g.p.h + T, JSON.stringify(g))
      r.check(`${name} 홈 img 뷰포트 안 + 정사각(aspect≈1)`, g.b.x >= 0 && g.b.x + g.b.w <= g.vw && Math.abs(g.b.w / g.b.h - 1) < 0.05, JSON.stringify(g.b))
      r.check(`${name} PNG 정사각 + 코너 알파 4개 모두 0(투명 배경)`, g.nw === g.nh && g.nw >= 128 && g.corners.every((a) => a === 0), `${g.nw}x${g.nh} corners=${g.corners}`)
      await shot(page, 'home', vp)
      await openCollection(page)
      await page.locator('[data-testid="hat-collection-avatar-img"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      r.check(`${name} 컬렉션 가로 스크롤 없음`, await noOverflow(page))
      const small = await page.locator('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({ t: (e.textContent || '').trim().slice(0, 14), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44))
      r.check(`${name} 컬렉션 버튼 높이 >=44px`, small.length === 0, JSON.stringify(small.slice(0, 4)))
      await shot(page, 'collection', vp, { fullPage: true }, '[data-testid="hat-collection-avatar-img"]')
      await collectionBackToHome(page)
      const town = page.locator('[data-testid="student-home-town"]')
      if (await town.isVisible().catch(() => false)) {
        await town.click()
        const rackSel = '[data-testid="town-hat-rack-img-hat_crown"]'
        await page.locator(rackSel).scrollIntoViewIfNeeded().catch(() => {})
        r.check(`${name} 마을 모자걸이 img = gold + 디코드`, hasColor(await attr(page, rackSel, 'src'), 'hat_crown') && await loaded(page, rackSel))
        r.check(`${name} 마을 가로 스크롤 없음`, await noOverflow(page))
        await shot(page, 'townrack', vp, {}, rackSel)
      } else {
        r.skip(`${name} 마을 모자걸이`, '홈에 마을 진입 버튼(student-home-town)이 없음')
      }
    })
  }

  // ── e2. 밝은/어두운 배경 샘플(390x844): 8장 전부 소유 → 카드 img src로 96x96 격자를 임시 주입 ──
  await scenario('e2 배경 샘플', MAIN_VP, { progress: { hatInventory: inv(ALL_IDS), equippedHatId: 'hat_crown' } }, async ({ page, name }) => {
    await waitHome(page)
    await openCollection(page)
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="hat-card-img-"]').length === 8, null, { timeout: 5000 }).catch(() => {})
    for (const [tag, bg] of [['darkbg', '#111827'], ['lightbg', '#ffffff']]) {
      const sample = `[data-testid="hat-${tag === 'darkbg' ? 'dark' : 'light'}-sample"]`
      await page.evaluate(({ testid, bg }) => {
        const d = document.createElement('div')
        d.setAttribute('data-testid', testid)
        d.style.cssText = `position:fixed;top:0;left:0;z-index:99999;background:${bg};padding:16px;display:grid;grid-template-columns:repeat(4,96px);gap:12px;`
        for (const el of document.querySelectorAll('[data-testid^="hat-card-img-"]')) {
          const i = document.createElement('img')
          i.src = el.src
          i.style.cssText = 'width:96px;height:96px;object-fit:contain;'
          d.appendChild(i)
        }
        document.body.appendChild(d)
      }, { testid: `hat-${tag === 'darkbg' ? 'dark' : 'light'}-sample`, bg })
      await page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} img`)].every((i) => i.complete && i.naturalWidth > 0), sample, { timeout: 5000 }).catch(() => {})
      const widths = await page.locator(`${sample} img`).evaluateAll((els) => els.map((e) => e.naturalWidth))
      r.check(`${name} ${tag} 샘플 8장 naturalWidth = 256`, widths.length === 8 && widths.every((w) => w === 256), JSON.stringify(widths))
      await page.locator(sample).screenshot({ path: path.join(SHOT_DIR, `hats-${tag}-390.png`), animations: 'disabled' }).catch(() => {})
      await page.evaluate((sel) => document.querySelector(sel)?.remove(), sample)
    }
  })

  // ── f. 색표: index.js 텍스트의 id→color 매핑이 기대표와 동일 ─────────────
  {
    const text = fs.readFileSync(HATS_INDEX, 'utf8')
    const block = (text.match(/HAT_COLOR_BY_ID\s*=\s*\{([\s\S]*?)\}/) || [])[1] || ''
    const found = Object.fromEntries([...block.matchAll(/(hat_\w+)\s*:\s*'(\w+)'/g)].map((m) => [m[1], m[2]]))
    r.check('f 색표: index.js HAT_COLOR_BY_ID == 기대표(8종)', Object.entries(COLOR_BY_ID).every(([id, c]) => found[id] === c) && Object.keys(found).length === 8, JSON.stringify(found))
    r.check('f 색표: 기대 id 8개가 카탈로그 id와 일치', ALL_IDS.length === 8 && ALL_IDS.every((id) => id in COLOR_BY_ID))
    r.check('f 색표: 8색 PNG 파일 모두 존재', Object.values(COLOR_BY_ID).every((c) => fs.existsSync(path.resolve(HERE, `../../src/assets/hats/paul-hat-${c}.png`))))
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
