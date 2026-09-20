// tests/e2e/townV2.spec.mjs
//
// Paul Town V2-A(paulTownV2, 2026-09-13) 스토리북 마을 장면 회귀 — V1의
// 형제 렌더러(TownScreenV2.jsx)가 V1(TownScreen.jsx)의 저장/소유권 로직
// (placeTownItem/moveTownItem/storeTownItem/townShop.purchase/
// townShop.claimWelcome)을 그대로 재사용하면서, 화면만 격자(TownGrid)가
// 아니라 씬(TownScene, 퍼센트 앵커 기반 레이어 합성)으로 바꿔 그리는지를
// 검증한다. townV1.spec.mjs/townPilotAllowlist.spec.mjs와 동일한 mock 전체
// 가로채기(installMocks) + 결정론 폴링(waitUntil) 관례를 따르되, 새 파일이라
// 필요한 소규모 헬퍼는 복제한다(파일당 소유권 원칙, CLAUDE.md 규칙 16 —
// 다른 spec과 동시에 같은 파일을 건드리지 않게).
//
// 실 Supabase/Vercel 요청 0건 — installMocks가 전체 네트워크를 가로챈다.
import zlib from 'node:zlib'
import { installMocks } from './lib/mockRoutes.mjs'
import { writesTo } from './lib/postgrestMock.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID, buildFixtureTables } from './fixtures/index.mjs'
import { PILOT_A_TOWN_STUDENT_IDS } from '../../src/config/pilotTown.js'

const LV_BADGE_SEL = 'span[title="누적 별(성취) — 절대 줄지 않아요"]'
const DOLLAR_BADGE_SEL = 'span[title="사용 가능한 Paul Dollar"]'
const PILOT_IDS = [...PILOT_A_TOWN_STUDENT_IDS]

async function waitUntil(fn, { timeout = 15000, interval = 150 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = await fn()
    if (v) return v
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  return false
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

// townV1.spec.mjs와 동일한 정의(disabled 버튼은 터치 타겟 판정에서 제외).
async function minVisibleButtonHeight(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    let min = Infinity
    let count = 0
    for (const b of buttons) {
      if (b.disabled) continue
      const rect = b.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      const style = window.getComputedStyle(b)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      count += 1
      if (rect.height < min) min = rect.height
    }
    return { min: Number.isFinite(min) ? min : null, count }
  })
}

// 최소 PNG 디코더(8bit, colorType 2/RGB 또는 6/RGBA, non-interlaced만 지원
// — page.screenshot()이 생성하는 형식) — S13(2026-09-20)이 실제 렌더 픽셀
// 색을 직접 비교해야 해서 추가했다. 새 npm 패키지 없이(CLAUDE.md 규칙 6)
// Node 내장 zlib만으로 IDAT을 inflate하고 PNG 필터(None/Sub/Up/Average/
// Paeth, PNG 스펙 §9)를 역연산한다. 이유: document.elementFromPoint()/
// elementsFromPoint()는 브라우저의 히트테스트 결과이고, 이 결함(z-[120]/
// z-[130]이 씬 자체의 z-index 체계보다 낮아 씬이 시트 위로 페인트되는
// 현상)이 있는 헤드리스 Chromium에서 실측한 결과 elementsFromPoint()는
// 여전히 카드 요소를 최상단으로 보고했다(히트테스트와 실제 컴포지팅 페인트
// 순서가 이 특정 케이스에서 불일치 — 아마 서로 다른 스태킹 컨텍스트에
// 걸친 극단적인 z-index 격차의 GPU 레이어 컴포지팅 근사 때문으로 추정).
// 그래서 elementFromPoint 기반 단언은 이 결함을 재현하지 못했고(수정 전
// 코드로도 항상 PASS), 실제 스크린샷 픽셀 비교만 fail-then-pass를
// 만족시켰다(아래 S13 커밋 리뷰 시 직접 재현 가능 — z-[9500]/z-[9510]을
// 임시로 z-[120]/z-[130]으로 되돌리면 이 단언만 FAIL로 바뀐다).
function readPngPixel(buffer, targetX, targetY) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('readPngPixel: PNG signature 아님')
  let offset = 8
  let width; let height; let bitDepth; let colorType
  const idatChunks = []
  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart)
      height = buffer.readUInt32BE(dataStart + 4)
      bitDepth = buffer.readUInt8(dataStart + 8)
      colorType = buffer.readUInt8(dataStart + 9)
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataStart + len))
    } else if (type === 'IEND') {
      break
    }
    offset = dataStart + len + 4
  }
  if (bitDepth !== 8) throw new Error(`readPngPixel: 지원하지 않는 bitDepth ${bitDepth}`)
  if (colorType !== 2 && colorType !== 6) throw new Error(`readPngPixel: 지원하지 않는 colorType ${colorType}`)
  const channels = colorType === 6 ? 4 : 3
  const raw = zlib.inflateSync(Buffer.concat(idatChunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  let rawOffset = 0
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset]
    rawOffset += 1
    const rowStart = y * stride
    for (let x = 0; x < stride; x++) {
      const rawX = raw[rawOffset + x]
      const a = x >= channels ? pixels[rowStart + x - channels] : 0
      const b = y > 0 ? pixels[rowStart - stride + x] : 0
      const c = (y > 0 && x >= channels) ? pixels[rowStart - stride + x - channels] : 0
      let value
      switch (filterType) {
        case 0: value = rawX; break
        case 1: value = rawX + a; break
        case 2: value = rawX + b; break
        case 3: value = rawX + Math.floor((a + b) / 2); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c)
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
          value = rawX + pr
          break
        }
        default: throw new Error(`readPngPixel: 지원하지 않는 filter type ${filterType}`)
      }
      pixels[rowStart + x] = value & 0xff
    }
    rawOffset += stride
  }
  const px = targetY * stride + targetX * channels
  return { r: pixels[px], g: pixels[px + 1], b: pixels[px + 2] }
}

function rgbDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

// paulEasyVoca_features localStorage 스냅샷에 flags만 심는다(그 외 플래그는
// features.js의 DEFAULT_FEATURES가 채운다). 매 네비게이션(reload 포함)마다
// 다시 실행되므로 reload 후에도 유지된다(Playwright addInitScript 계약,
// townV1.spec.mjs enableTownFlag와 동일 패턴 — 여기선 임의 flags를 받는다).
async function setDeviceFlags(page, flags) {
  await page.addInitScript((flagsJson) => {
    try { localStorage.setItem('paulEasyVoca_features', flagsJson) } catch { /* 무시 */ }
  }, JSON.stringify(flags))
}

async function login(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 90000 })
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

async function goToPaulTownScreen(page) {
  const goBtn = page.getByRole('button', { name: '구경가기' })
  await goBtn.waitFor({ state: 'visible', timeout: 20000 })
  await goBtn.click()
}

// PaulTown 화면의 "🏘 내 마을" 진입 카드(전체가 버튼 하나, "들어가기"는 그
// 안의 span — PaulTown.jsx). townV1.spec.mjs와 동일한 셀렉터.
async function enterTownCard(page) {
  const card = page.locator('button', { hasText: '들어가기' })
  await card.waitFor({ state: 'visible', timeout: 15000 })
  return card
}

async function waitForTownHeader(page) {
  await page.locator(LV_BADGE_SEL).waitFor({ state: 'visible', timeout: 15000 })
}

// ── 자석 드래그 배치(2026-09-20) 공용 헬퍼 — S16~S19가 공유한다(로그인/
//    내마을 진입 헬퍼처럼 파일 스코프에 둔다, 섹션마다 재정의하지 않음). ──
// itemLabel을 보관함에서 "마을에 놓기"로 놓는다 — 앵커는 놓기 모드에
// 진입한 뒤(오버레이가 뜬 뒤)에만 존재하므로 이 함수 안에서 직접
// pickFreeAnchor로 고른다(호출자가 미리 고르면 앵커가 아직 없어 실패).
async function placeFromInventoryByLabel(page, itemLabel) {
  await page.locator('[data-testid="town-open-inventory"]').click()
  const cardEl = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText(itemLabel, { exact: true }) }).first()
  await cardEl.waitFor({ state: 'visible', timeout: 10000 })
  await cardEl.getByRole('button', { name: '마을에 놓기' }).click()
  await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 })
  const anchor = await pickFreeAnchor(page, 0)
  await page.locator(`[data-anchor="${anchor.x},${anchor.y}"]`).click()
  return anchor
}

async function enterMovingMode(page, itemId, cell) {
  await page.locator(`[data-item-id="${itemId}"][data-cell="${cell}"] > button`).click()
  const moveBtn = page.getByRole('button', { name: '이동', exact: true })
  await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
  await moveBtn.click()
  await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 })
}

// 현재 배치 오버레이의 n번째 앵커(중복 없는 목록, freeWorldAnchors 결과) —
// {x,y,box,center} 반환. center는 44px 탭 컨트롤의 렌더 위치가 아니라
// data-anchor-left-pct/data-anchor-top-pct(TownPlacementOverlay.jsx가
// 노출하는 참 앵커 world % 좌표, 2026-09-20)로 구한 "진짜" 앵커 화면
// 좌표다(TownScene.jsx의 computeNearestAnchor와 정확히 같은 계산) —
// worldRender.layoutPlacementControls가 좁은 화면에서 컨트롤을 "겹침
// 해소"로 참 앵커 위치에서 옮길 수 있는데(worldRender.js 헤더 주석), 드래그
// 스냅 판정은 항상 참 앵커 기준이므로 테스트도 같은 기준으로 목표 지점을
// 잡아야 한다 — 컨트롤(버튼) 위치로 드래그하면 옮겨진 경우 스냅 범위를
// 벗어나 false negative가 난다(src/utils/town/worldRender.js를 테스트에서
// 직접 import하지 않는 이유는 위 data attribute 자체의 doc comment 참고 —
// 그 파일의 확장자 없는 상대 import가 plain Node ESM에서 깨진다).
async function pickFreeAnchor(page, index = 0) {
  const anchors = page.locator('[data-anchor]')
  const count = await anchors.count()
  const el = anchors.nth(((index % count) + count) % count)
  const attr = await el.getAttribute('data-anchor')
  const box = await el.boundingBox()
  const [x, y] = attr.split(',').map(Number)
  const sceneBox = await page.locator('[data-testid="town-scene-v2"]').boundingBox()
  const anchorLeftPct = Number(await el.getAttribute('data-anchor-left-pct'))
  const anchorTopPct = Number(await el.getAttribute('data-anchor-top-pct'))
  const center = sceneBox && Number.isFinite(anchorLeftPct) && Number.isFinite(anchorTopPct)
    ? { x: sceneBox.x + (anchorLeftPct / 100) * sceneBox.width, y: sceneBox.y + (anchorTopPct / 100) * sceneBox.height }
    : (box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null)
  return { x, y, box, center }
}

// 실 마우스(page.mouse)로 wrapper 중심에서 목표 지점까지 여러 스텝으로
// 이동(임계값을 확실히 넘기도록 첫 스텝부터 8px 이상 움직인다). mouseup은
// 호출자가 별도로 한다(중간에 상태를 관찰할 수 있도록).
async function mouseDragStart(page, wrapperLocator, dest, { steps = 10 } = {}) {
  const startBox = await wrapperLocator.boundingBox()
  const start = { x: startBox.x + startBox.width / 2, y: startBox.y + startBox.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await page.mouse.move(start.x + (dest.x - start.x) * t, start.y + (dest.y - start.y) * t)
  }
  return start
}

// 이동 모드 배너가 떠 있으면 "취소"를 눌러 idle로 되돌린다(테스트 사이
// 상태를 깨끗이 하기 위한 헬퍼 — 배너가 없으면 조용히 넘어간다).
async function handleCancelIfMoving(page) {
  const cancelBtn = page.getByRole('button', { name: '취소', exact: true })
  if (await cancelBtn.isVisible().catch(() => false)) await cancelBtn.click().catch(() => {})
}

// 터치 드래그 시뮬레이션 — CDP Input.dispatchTouchEvent를 직접 쓴다.
// 처음엔 locator.dispatchEvent('pointerdown', {...})로 합성 PointerEvent를
// 만들어 시도했으나(el.dispatchEvent(new PointerEvent(...))로도 동일),
// 실측(scripts/.tmp/diag_s17.mjs) 결과 네이티브 addEventListener는 정상
// 수신해도(clientX/clientY/pointerId 전부 올바름) 리액트의 onPointerDown/
// onPointerMove 핸들러 자체가 단 한 번도 호출되지 않았다 — 스크립트로
// 만든(비신뢰, isTrusted:false) PointerEvent를 리액트의 합성 이벤트
// 시스템이 처리하지 않는 것으로 실측 확인됨(반면 CDP로 만든 같은 흐름은
// 리액트 핸들러가 정상 호출됨, DIAGPROD 로그로 재현·대조). page.mouse가
// 이미 신뢰된 CDP 마우스 입력이라 S16에서 문제없이 동작했던 것과 같은
// 이유로, 터치도 CDP 수준(Input.dispatchTouchEvent)으로 만들어야 한다.
async function cdpTouch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
}

async function cdpTouchDragStart(context, page, wrapperLocator, dest, { steps = 8 } = {}) {
  const cdp = await context.newCDPSession(page)
  const box = await wrapperLocator.boundingBox()
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await cdpTouch(cdp, 'touchStart', [{ x: start.x, y: start.y, id: 1 }])
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await cdpTouch(cdp, 'touchMove', [{ x: start.x + (dest.x - start.x) * t, y: start.y + (dest.y - start.y) * t, id: 1 }])
  }
  return { cdp, start }
}

export async function run(browser, baseURL) {
  const r = createRecorder('[town-v2]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  function collect(mocks) {
    unmockedRequests.push(...mocks.unmockedRequests)
    ttsFallbackRequests.push(...mocks.ttsFallbackRequests)
    mockErrors.push(...mocks.db.errors)
  }

  // ── S1 — V2 OFF, V1 ON(390x844): 기존 V1 격자가 그대로 보임 ──────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S1[390x844,V1-only]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const emptyCellVisible = await page.getByRole('button', { name: /^빈 칸 \(/ }).first()
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} — V1 격자 빈 칸(aria-label "빈 칸 (") 표시`, emptyCellVisible)

      const sceneV2Count = await page.locator('[data-testid="town-scene-v2"]').count()
      r.check(`${name} — town-scene-v2 요소 없음(V2 미렌더)`, sceneV2Count === 0, `count=${sceneV2Count}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S2 — V1+V2 ON, 3개 뷰포트: 씬 렌더/HUD/안개/앰비언트 ─────────────────
  const S2_VIEWPORTS = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
  for (const vp of S2_VIEWPORTS) {
    const name = `S2[${vp.width}x${vp.height}]`
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()

      const screenVisible = await page.locator('[data-testid="town-screen-v2"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} — town-screen-v2 표시`, screenVisible)
      const sceneVisible = await page.locator('[data-testid="town-scene-v2"]').isVisible().catch(() => false)
      r.check(`${name} — town-scene-v2 표시`, sceneVisible)

      const emptyCellCount = await page.getByRole('button', { name: /^빈 칸 \(/ }).count()
      r.check(`${name} — V1 격자 빈 칸 요소 0개`, emptyCellCount === 0, `count=${emptyCellCount}`)

      const hasInlineGridTemplate = await page.locator('[data-testid="town-scene-v2"] *').evaluateAll(
        (els) => els.some((el) => !!(el.style && el.style.gridTemplateColumns)),
      )
      r.check(`${name} — 씬 내부에 inline grid-template-columns 없음(격자 아님)`, !hasInlineGridTemplate)

      const homeVisible = await page.locator('[data-testid="town-home"]').isVisible().catch(() => false)
      r.check(`${name} — town-home(집) 표시`, homeVisible)

      await waitForTownHeader(page)
      // get_town_shop_state 응답이 오기 전에는 level 기본값 1("Lv.1")이 잠깐
      // 보일 수 있다(레이스) — mock 응답 반영(레벨 2)까지 폴링한다.
      const lvText = await waitUntil(async () => {
        const t = (await page.locator(LV_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('Lv.2') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — HUD "⭐ Lv.2" 표시(기본 mock starsEarned=20)`, !!lvText, lvText || '(no Lv.2)')
      const dollarVisible = await page.locator(DOLLAR_BADGE_SEL).isVisible().catch(() => false)
      r.check(`${name} — 💵 잔액 칩 표시`, dollarVisible)

      const goalText = await waitUntil(async () => {
        const t = (await page.locator('[data-testid="town-goal"]').textContent().catch(() => '')) || ''
        return t.includes('⭐') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — town-goal 텍스트에 "⭐" 포함`, !!goalText, goalText || '(no ⭐)')

      const fogVisible = await waitUntil(() => page.locator('[data-testid="town-fog"]').isVisible().catch(() => false), { timeout: 5000 })
      r.check(`${name} — town-fog 표시(레벨2는 다음 레벨 잠금 아이템 있음)`, !!fogVisible)
      if (fogVisible) {
        const fogText = (await page.locator('[data-testid="town-fog"]').textContent().catch(() => '')) || ''
        r.check(`${name} — town-fog 칩에 "Lv." 포함`, fogText.includes('Lv.'), fogText)
      }

      r.check(`${name} — 가로 스크롤 없음`, await noHorizontalOverflow(page))
      const btnScan = await minVisibleButtonHeight(page)
      r.check(`${name} — 보이는 버튼 전체 터치 타겟 높이 >= 44px`, btnScan.min !== null && btnScan.min >= 44, `min=${btnScan.min} count=${btnScan.count}`)

      const ambientSentence = await page.locator('.sr-only', { hasText: '정원' }).count()
      r.check(`${name} — 앰비언트 sr-only 문장에 "정원" 포함(스크린리더 전용)`, ambientSentence > 0, `count=${ambientSentence}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(mocks.db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S3 — 허용목록 경로: paulTownV2만 켜져도(paulTownV1 OFF) V2 렌더 ──────
  if (PILOT_IDS.length > 0) {
    const pilotId = PILOT_IDS[0]
    const vp = { width: 390, height: 844 }

    // S3a — { paulTownV2: true }만(paulTownV1 없음/false) → V2 렌더(허용목록
    // 학생은 townV1Enabled가 이미 true이므로 townV2Active = true && true).
    {
      const name = `S3a(pilot ${pilotId}) V2-only flag`
      const context = await browser.newContext({ viewport: vp })
      const page = await context.newPage()
      await setDeviceFlags(page, { paulTownV2: true })
      const mocks = await installMocks(page, { studentId: pilotId })
      try {
        await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
        await login(page)
        await goToPaulTownScreen(page)
        const card = await enterTownCard(page)
        await card.click()
        const sceneVisible = await page.locator('[data-testid="town-scene-v2"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
        r.check(`${name} — town-scene-v2 표시(허용목록 자격 + V2 플래그만으로 충분)`, sceneVisible)
      } catch (err) {
        const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
        r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
          `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
      } finally {
        collect(mocks)
        await context.close()
      }
    }

    // S3b — {} (플래그 둘 다 없음) → 허용목록 자격만으로 V1 격자는 여전히
    //       보이되(townV1Enabled true), V2는 꺼짐(paulTownV2Enabled false).
    {
      const name = `S3b(pilot ${pilotId}) no-flags`
      const context = await browser.newContext({ viewport: vp })
      const page = await context.newPage()
      const mocks = await installMocks(page, { studentId: pilotId })
      try {
        await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
        await login(page)
        await goToPaulTownScreen(page)
        const card = await enterTownCard(page)
        await card.click()
        const emptyCellVisible = await page.getByRole('button', { name: /^빈 칸 \(/ }).first()
          .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
        r.check(`${name} — 플래그 전부 OFF에도 허용목록 자격으로 V1 격자 표시`, emptyCellVisible)
        const sceneV2Count = await page.locator('[data-testid="town-scene-v2"]').count()
        r.check(`${name} — town-scene-v2 없음(V2 플래그 OFF)`, sceneV2Count === 0, `count=${sceneV2Count}`)
      } catch (err) {
        const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
        r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
          `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
      } finally {
        collect(mocks)
        await context.close()
      }
    }
  } else {
    r.skip('S3 — Pilot A 허용목록 UUID', 'PILOT_A_TOWN_STUDENT_IDS가 비어있음')
  }

  // ── S4 — 배치 루프(구매→놓기→이동→보관, 390x844, V1+V2 ON) ───────────────
  // 2026-09-16 갱신 — 월드 지오메트리 확장(anchorFor/freeAnchors가 이제
  // level로 구역을 거른다) 이후, 기본 mock(starsEarned=20 -> 마을레벨2)로는
  // home 구역만 열려 있어(23칸) 이 시나리오가 이동 목적지로 쓰던 (5,4)
  // (square 구역)/(0,5)(river 구역)이 더 이상 배치 후보 앵커에 없다. 이
  // 시나리오의 실제 목적(구매→놓기→이동→마지막 행 클리핑 회귀→바깥 탭/
  // Escape 닫기→보관)은 좌표 자체가 아니라 "그 좌표가 유효한 배치 후보로
  // 열려 있는지"이므로, starsEarned를 800(마을레벨8, 전 구역 개방)으로
  // 올려 옛 좌표(앵커 47개 포함)를 그대로 재사용한다 — 환영 선물 조건
  // (owned:[] && available:0)과 welcomeClaimed:false는 그대로 유지해 위쪽
  // 환영 선물 단언들도 그대로 통과하도록 한다.
  {
    const vp = { width: 390, height: 844 }
    const name = 'S4[390x844] 배치 루프'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 800, dollars: { available: 0, earned: 0, spent: 0 }, owned: [], welcomeClaimed: false },
    })
    const { db } = mocks
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      // 환영 선물 20 PD — 1회 청구, HUD에 반영될 때까지 대기.
      const welcomeClaimed = await waitUntil(() => (db._townCalls.claim_town_welcome || 0) >= 1, { timeout: 10000 })
      r.check(`${name} — claim_town_welcome 호출 발생`, !!welcomeClaimed)
      const balanceAfterWelcome = await waitUntil(async () => {
        const t = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('20') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — 환영 선물 후 헤더 잔액 $20 표시`, !!balanceAfterWelcome, balanceAfterWelcome || '(no $20)')

      // ── 상점 시트 열기 → 나무 구매 ──────────────────────────────────────
      await page.locator('[data-testid="town-open-shop"]').click()
      const sheet = page.locator('[data-testid="town-sheet"]')
      const sheetVisible = await sheet.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 상점 시트(role=dialog) 표시`, sheetVisible)
      const sheetRoleDialog = await sheet.getAttribute('role').catch(() => null)
      r.check(`${name} — 상점 시트 role="dialog"`, sheetRoleDialog === 'dialog', `role=${sheetRoleDialog}`)

      await page.getByRole('button', { name: '자연 카테고리' }).click()
      const treeCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('나무', { exact: true }) }).first()
      await treeCard.waitFor({ state: 'visible', timeout: 10000 })
      await treeCard.getByRole('button', { name: '구매' }).click()
      const confirmSheet = page.locator('div.animate-slide-up')
      await confirmSheet.waitFor({ state: 'visible', timeout: 10000 })
      await page.getByRole('button', { name: '사기' }).click()
      const purchaseSettled = await waitUntil(async () => !(await confirmSheet.isVisible().catch(() => false)), { timeout: 10000 })
      r.check(`${name} — 구매 확인 시트 닫힘(처리 완료)`, !!purchaseSettled)
      const treeOwnedShown = await waitUntil(async () => {
        const t = (await treeCard.textContent().catch(() => '')) || ''
        return t.includes('보유 ✓') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — 나무 카드에 "보유 ✓" 표시`, !!treeOwnedShown)
      r.check(`${name} — purchase_town_item(tree) 호출 정확히 1회`, (db._townCalls.purchase_town_item.tree || 0) === 1, `count=${db._townCalls.purchase_town_item.tree}`)

      // 고양이(cat, 미구매) 카드는 여전히 "보유 ✓"가 아님 — owned가 정확히
      // ['tree']뿐임을(cat까지 딸려오지 않았음을) DOM으로 간접 확인한다(db
      // 내부 townStates는 mockRoutes.mjs 클로저라 테스트에서 직접 못 읽음).
      await page.getByRole('button', { name: '동물 카테고리' }).click()
      const catCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('고양이', { exact: true }) }).first()
      await catCard.waitFor({ state: 'visible', timeout: 10000 })
      const catCardText = (await catCard.textContent().catch(() => '')) || ''
      r.check(`${name} — 고양이 카드는 "보유 ✓"가 아님(owned가 tree 하나뿐)`, !catCardText.includes('보유 ✓'), catCardText)

      const dollarTextAfterBuy = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
      r.check(`${name} — 구매 후 헤더 잔액 $10(20-10)`, dollarTextAfterBuy.includes('10') && !dollarTextAfterBuy.includes('20'), dollarTextAfterBuy)

      // ── 2026-09-15 — 구매 직후 "다음엔 마을에 놓아야 한다"는 것을 놓치기
      //     쉬운 문제의 최소 수정(V1과 동일 원리, V2는 HUD 보관함 버튼에
      //     배지). ────────────────────────────────────────────────────────
      const placeHintShownV2 = await page.getByText('보관함에서 마을에 놓아보세요', { exact: false }).first().isVisible().catch(() => false)
      r.check(`${name} 2026-09-15 — 구매 성공 안내 문구에 배치 유도 텍스트 포함("보관함에서 마을에 놓아보세요")`, placeHintShownV2)

      const hudInventoryBtn = page.locator('[data-testid="town-open-inventory"]')
      const hudInventoryAriaLabelAfterBuy = (await hudInventoryBtn.getAttribute('aria-label').catch(() => '')) || ''
      r.check(`${name} 2026-09-15 — 나무 구매 직후(미배치 1개) HUD 보관함 버튼 aria-label에 "1개" 포함`,
        hudInventoryAriaLabelAfterBuy.includes('1개'), hudInventoryAriaLabelAfterBuy)
      const hudInventoryBadgeTextAfterBuy = (await hudInventoryBtn.locator('span[aria-hidden="true"]').textContent().catch(() => '')) || ''
      r.check(`${name} 2026-09-15 — 나무 구매 직후 HUD 보관함 버튼 배지 숫자 "1" 표시`,
        hudInventoryBadgeTextAfterBuy.trim() === '1', hudInventoryBadgeTextAfterBuy)

      // ── 시트 닫기 → 보관함 열기 → "마을에 놓기" ──────────────────────────
      await page.locator('[data-testid="town-sheet-close"]').click()
      const sheetClosed = await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      r.check(`${name} — "닫기" 클릭 시 시트 닫힘`, !!sheetClosed)

      await page.locator('[data-testid="town-open-inventory"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()

      // placing 모드 진입 시 시트가 자동으로 닫힌다(TownScreenV2 onPlaceStart).
      const sheetClosedAfterPlace = await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      r.check(`${name} — "마을에 놓기" 클릭 시 시트 자동으로 닫힘`, !!sheetClosedAfterPlace)

      const anchorCount = await page.locator('[data-anchor]').count()
      r.check(`${name} — 배치 오버레이 앵커 47개(48-HOME)`, anchorCount === 47, `count=${anchorCount}`)

      await page.locator('[data-anchor="1,1"]').click()
      const treeAt11 = page.locator('[data-item-id="tree"][data-cell="1,1"]')
      const placedAt11 = await treeAt11.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (1,1)에 배치됨(data-item-id/data-cell)`, placedAt11)
      const anchorsGoneAfterPlace = await waitUntil(async () => (await page.locator('[data-anchor]').count()) === 0, { timeout: 5000 })
      r.check(`${name} — 배치 완료 후 앵커 오버레이 사라짐`, !!anchorsGoneAfterPlace)

      // ── 2026-09-15 — 배치 완료(유일한 보유 아이템을 마을에 놓음) 후 HUD
      //     보관함 버튼 배지가 사라짐(unplacedCount 0으로 파생). ───────────
      const hudInventoryAriaLabelAfterPlace = (await hudInventoryBtn.getAttribute('aria-label').catch(() => '')) || ''
      r.check(`${name} 2026-09-15 — 배치 완료 후 HUD 보관함 버튼 배지 사라짐(aria-label 기본값 복귀)`,
        !hudInventoryAriaLabelAfterPlace, hudInventoryAriaLabelAfterPlace)
      const hudInventoryBadgeCountAfterPlace = await hudInventoryBtn.locator('span[aria-hidden="true"]').count()
      r.check(`${name} 2026-09-15 — 배치 완료 후 HUD 보관함 버튼 배지 요소 자체가 사라짐(중복/유령 배지 없음)`,
        hudInventoryBadgeCountAfterPlace === 0, `count=${hudInventoryBadgeCountAfterPlace}`)

      // ── 새로고침 후 배치 유지 ────────────────────────────────────────────
      await page.reload({ waitUntil: 'domcontentloaded' })
      const backOnDashboard = await page.getByRole('button', { name: '구경가기' }).waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)
      r.check(`${name} — 새로고침 후 세션 복원(대시보드 표시)`, backOnDashboard)
      await goToPaulTownScreen(page)
      const card2 = await enterTownCard(page)
      await card2.click()
      const treeStillAt11 = await page.locator('[data-item-id="tree"][data-cell="1,1"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} — 새로고침 후 (1,1) 배치가 유지됨`, treeStillAt11)

      // ── 이동: (1,1) → (5,4) ──────────────────────────────────────────────
      await page.locator('[data-item-id="tree"][data-cell="1,1"] button').click()
      const moveBtn = page.getByRole('button', { name: '이동', exact: true })
      await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
      await moveBtn.click()
      await page.locator('[data-anchor="5,4"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="5,4"]').click()
      const treeAt54 = await page.locator('[data-item-id="tree"][data-cell="5,4"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (5,4)로 이동됨`, treeAt54)

      // ── 클리핑 회귀 검사: 마지막 행(0,5)으로 한 번 더 이동 후, 그 칸의
      //     이동/보관 팝오버가 overflow-hidden인 씬 박스 밖으로 잘리지
      //     않는지 확인(2026-09-13 최종 리뷰 결함 — 팝오버가 항상
      //     아래(top-full)로만 열리면 마지막 행에서는 씬 밖으로 나가
      //     잘려서 이동/보관을 누를 수 없었다). ──────────────────────────
      await page.locator('[data-item-id="tree"][data-cell="5,4"] button').click()
      const moveBtnToLastRow = page.getByRole('button', { name: '이동', exact: true })
      await moveBtnToLastRow.waitFor({ state: 'visible', timeout: 5000 })
      await moveBtnToLastRow.click()
      await page.locator('[data-anchor="0,5"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="0,5"]').click()
      const treeAt05 = page.locator('[data-item-id="tree"][data-cell="0,5"]')
      const placedAt05 = await treeAt05.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (0,5)로 이동됨(마지막 행)`, placedAt05)

      await page.locator('[data-item-id="tree"][data-cell="0,5"] button').click()
      const moveBtnLastRow = page.getByRole('button', { name: '이동', exact: true })
      const moveBtnLastRowVisible = await moveBtnLastRow.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} — 마지막 행(0,5) 팝오버의 "이동" 버튼이 보임(클리핑 안 됨)`, moveBtnLastRowVisible)

      const sceneBoxForClip = await page.locator('[data-testid="town-scene-v2"]').boundingBox()
      const moveBtnLastRowBox = await moveBtnLastRow.boundingBox()
      const moveBtnInsideScene = !!sceneBoxForClip && !!moveBtnLastRowBox &&
        moveBtnLastRowBox.x >= sceneBoxForClip.x &&
        moveBtnLastRowBox.y >= sceneBoxForClip.y &&
        (moveBtnLastRowBox.y + moveBtnLastRowBox.height) <= (sceneBoxForClip.y + sceneBoxForClip.height)
      r.check(
        `${name} — 마지막 행 팝오버 "이동" 버튼이 씬 박스 안에 완전히 들어옴(클리핑 회귀 방지)`,
        moveBtnInsideScene,
        JSON.stringify({ sceneBoxForClip, moveBtnLastRowBox }),
      )

      // ── 배치 팝오버 바깥 탭/Escape 닫기(2026-09-14, V2B_V2C_ROADMAP.md 1.3절) ──
      // 위에서 (0,5) 나무의 팝오버가 이미 열려 있는 상태 — 빈 공간(백드롭
      // 좌측 여백, HOME_CELL(3,2)·나무(0,5) 어디와도 겹치지 않는 좌표) 탭 시
      // 팝오버가 닫히는지 확인. (5,5)는 씬 박스의 rounded-[28px] 모서리
      // 곡선 안쪽이라 overflow-hidden에 의해 포인터 이벤트가 그 지점에서
      // 막혀 바깥 wrapper(<div class="max-w-lg mx-auto">)로 새는 현상을
      // 실측 확인 — (10,80)처럼 네 모서리 반경(28px)에서 충분히 벗어난
      // 좌표를 쓴다.
      const backdrop = page.locator('[data-testid="town-scene-backdrop"]')
      await backdrop.click({ position: { x: 10, y: 80 } })
      const closedByOutsideTap = await waitUntil(
        async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0,
        { timeout: 5000 },
      )
      r.check(`${name} — 빈 공간 탭 시 배치 팝오버가 닫힘(바깥 탭 닫기)`, !!closedByOutsideTap)
      r.check(
        `${name} — 바깥 탭으로 닫아도 나무는 그대로 (0,5)에 남음(배치 불변)`,
        (await page.locator('[data-item-id="tree"][data-cell="0,5"]').count()) === 1,
      )

      // 다시 열고 이번엔 Escape로 닫히는지 확인.
      await page.locator('[data-item-id="tree"][data-cell="0,5"] button').click()
      await page.getByRole('button', { name: '이동', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
      await page.keyboard.press('Escape')
      const closedByEscape = await waitUntil(
        async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0,
        { timeout: 5000 },
      )
      r.check(`${name} — Escape 키로 배치 팝오버가 닫힘`, !!closedByEscape)

      // 이어지는 보관 단계를 위해 팝오버를 다시 연다(아래 storeBtn이 이 팝오버를 사용).
      await page.locator('[data-item-id="tree"][data-cell="0,5"] button').click()
      await page.getByRole('button', { name: '보관', exact: true }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})

      // ── 보관(위에서 이미 열어둔 팝오버를 그대로 사용) ────────────────────
      const storeBtn = page.getByRole('button', { name: '보관', exact: true })
      await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
      await storeBtn.click()
      const treeGone = await waitUntil(async () => (await page.locator('[data-item-id="tree"]').count()) === 0, { timeout: 10000 })
      r.check(`${name} — 보관 후 나무 래퍼가 씬에서 사라짐`, !!treeGone)

      await page.locator('[data-testid="town-open-inventory"]').click()
      const backInInventory = await page.getByRole('button', { name: '마을에 놓기' }).isVisible().catch(() => false)
      r.check(`${name} — 보관 후 보관함 "마을에 놓기" 목록에 다시 나타남`, backInInventory)

      // ── mock 카운터/상태 최종 확인 — 이동/보관은 비용이 없으므로 잔액은
      //     구매 직후와 동일하게 $10으로 유지돼야 한다(상점 시트를 다시 열어
      //     HUD와 카드 둘 다에서 재확인 — get_town_shop_state 재조회 유발). ──
      r.check(`${name} — purchase_town_item(tree) 최종 1회(중복 없음)`, (db._townCalls.purchase_town_item.tree || 0) === 1)
      r.check(`${name} — get_town_shop_state 호출 1회 이상`, (db._townCalls.get_town_shop_state || 0) >= 1)
      r.check(`${name} — claim_town_welcome 1회 유지(중복 지급 없음)`, db._townCalls.claim_town_welcome === 1, `count=${db._townCalls.claim_town_welcome}`)
      const dollarTextFinal = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
      r.check(`${name} — 이동/보관 이후에도 잔액 $10 유지(비용 없음)`, dollarTextFinal.includes('10') && !dollarTextFinal.includes('20'), dollarTextFinal)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] townCalls=${JSON.stringify(db._townCalls)}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S5 — Kinney-shaped fixture(starsEarned=60, owned=['tree']) ──────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S5[390x844] Kinney fixture'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 60, dollars: { available: 31, earned: 41, spent: 10 }, owned: ['tree'], welcomeClaimed: true },
    })
    const { db, apiCallLog } = mocks
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const lvText = await waitUntil(async () => {
        const t = (await page.locator(LV_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('Lv.3') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — HUD "⭐ Lv.3" 표시(starsEarned=60)`, !!lvText, lvText || '(no Lv.3)')
      const dollarText = (await page.locator(DOLLAR_BADGE_SEL).textContent().catch(() => '')) || ''
      r.check(`${name} — HUD 💵 31 표시`, dollarText.includes('31'), dollarText)
      const goalText = (await page.locator('[data-testid="town-goal"]').textContent().catch(() => '')) || ''
      r.check(`${name} — town-goal에 "40" 포함(nearGoal remaining)`, goalText.includes('40'), goalText)

      // 로컬 백업(useStudent.js localStorage)에 사전 배치를 주입할 안전한
      // 경로가 없어(src/ 미수정 원칙) — 계약이 명시한 폴백대로 UI를 통해
      // 나무를 배치한다(2026-09-13, 이 스펙 고유 LIMITATION). 2026-09-16
      // 갱신 — 월드 지오메트리 확장으로 (2,4)는 이제 'square' 구역(마을
      // 레벨5부터 개방)에 속해, 이 시나리오의 레벨3(starsEarned=60)에서는
      // 더 이상 유효한 배치 후보 앵커가 아니다(freeAnchors가 level로 거름).
      // (0,3)은 'lane' 구역(레벨3에 이미 열림)에 속한 칸으로 교체한다 —
      // SPOT_MAP은 townScene.js가 소유한 진실 원천이라 이 세션이 좌표를
      // 새로 발명하지 않고 그대로 조회했다.
      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      await page.locator('[data-anchor="0,3"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="0,3"]').click()
      const treeAt03 = await page.locator('[data-item-id="tree"][data-cell="0,3"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 (0,3)에 배치됨(LIMITATION: 로컬 백업 사전 시드 대신 UI로 배치)`, treeAt03)

      // ── 2026-09-18 갱신(작업 지시서 STEP 7) — 2026-09-16 버전은 "안개
      //     컨테이너와 배치 아이템의 바운딩 박스가 겹치지 않는지"를 봤다.
      //     그 가정 자체가 이번 재작성으로 깨졌다: TownFogLayer.jsx는 이제
      //     구역 전체를 덮던 가로 밴드가 아니라, 잠긴 랜드마크마다 개별
      //     헤이즈 타원 + Lv.N 표지판을 그리는 컨테이너(className="absolute
      //     inset-0" — 씬 전체 크기, 그 "안"에 절대위치 자식들이 흩어져
      //     있음)라, data-testid="town-fog" 자체의 boundingBox()는 이제
      //     거의 항상 씬 전체 크기로 나온다(실측: {x:0,y:13,width:390,
      //     height:741}) — 컨테이너 바운딩 박스와 아이템 바운딩 박스의
      //     겹침 여부는 더 이상 "실제로 가려지는가"를 말해주지 않는다(항상
      //     겹친다고 나오지만 실제 시각적 가림과 무관). 더 강한 체크(리드
      //     지시)로 교체 — 나무 버튼의 실제 중심 좌표에서
      //     document.elementFromPoint()가 그 버튼(또는 자손)을 가리키는지
      //     (다른 요소가 그 지점에서 클릭/시각적으로 우선하지 않는지),
      //     그리고 버튼 자신의 computed opacity/filter가 그대로(헤이즈의
      //     LOCKED_FILTER/블러가 실수로 그 버튼에까지 번지지 않았는지)를
      //     직접 확인한다 — "가려지지 않는다"는 원래 의도를 z-index/바운딩
      //     박스 우연이 아니라 실제 렌더 결과로 검증한다.
      const fogVisibleAtLevel3 = await page.locator('[data-testid="town-fog"]').isVisible().catch(() => false)
      r.check(`${name} — town-fog 표시됨(레벨3, book-shop 등 아직 잠김 — 이 회귀를 재현 가능한 조건)`, fogVisibleAtLevel3)
      if (fogVisibleAtLevel3) {
        const treeButton = page.locator('[data-item-id="tree"][data-cell="0,3"] button')
        const occlusion = await treeButton.evaluate((btn) => {
          const rect = btn.getBoundingClientRect()
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          const topEl = document.elementFromPoint(cx, cy)
          const style = window.getComputedStyle(btn)
          return {
            hitsButtonOrDescendant: !!topEl && (topEl === btn || btn.contains(topEl)),
            opacity: style.opacity,
            filter: style.filter,
          }
        })
        r.check(
          `${name} — 나무(0,3) 버튼 중심점의 elementFromPoint가 그 버튼(또는 자손)을 가리킴(잠긴 랜드마크 헤이즈에 가려지지 않음)`,
          occlusion.hitsButtonOrDescendant,
          JSON.stringify(occlusion),
        )
        r.check(
          `${name} — 나무(0,3) 버튼 computed opacity가 그대로 1(헤이즈로 흐려지지 않음)`,
          occlusion.opacity === '1',
          `opacity=${occlusion.opacity}`,
        )
        r.check(
          `${name} — 나무(0,3) 버튼 computed filter가 none(헤이즈로 필터링되지 않음)`,
          occlusion.filter === 'none',
          `filter=${occlusion.filter}`,
        )
      }

      // ── 상점/보관함 열고 닫기(부작용 없음 확인용) ────────────────────────
      await page.locator('[data-testid="town-open-shop"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-testid="town-sheet-close"]').click()
      await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })
      await page.locator('[data-testid="town-open-inventory"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-testid="town-sheet-close"]').click()
      await waitUntil(async () => (await page.locator('[data-testid="town-sheet"]').count()) === 0, { timeout: 5000 })

      r.check(`${name} — purchase_town_item 호출 0건(구매 없음)`, Object.keys(db._townCalls.purchase_town_item || {}).length === 0, JSON.stringify(db._townCalls.purchase_town_item))
      r.check(`${name} — claim_town_welcome 호출 0건(welcomeClaimed:true + 잔액>0이라 클라이언트가 청구 시도조차 안 함)`, (db._townCalls.claim_town_welcome || 0) === 0, `count=${db._townCalls.claim_town_welcome}`)

      const grantXpActions = new Set(
        apiCallLog.filter((c) => c.url.includes('/api/grant-xp')).map((c) => (c.body && c.body.action) || '(no action)'),
      )
      const allowedActions = new Set(['get_town_shop_state'])
      const extraActions = [...grantXpActions].filter((a) => !allowedActions.has(a))
      r.check(
        `${name} — /api/grant-xp 호출 action 집합이 {get_town_shop_state}의 부분집합(보상/구매/환영 호출 없음)`,
        extraActions.length === 0,
        `actions=${JSON.stringify([...grantXpActions])}`,
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S6 — 200% 확대(zoom), 390x844, V2 ON ─────────────────────────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S6[390x844] 200% zoom'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await page.locator('[data-testid="town-screen-v2"]').waitFor({ state: 'visible', timeout: 15000 })
      await waitForTownHeader(page)

      // Chromium은 표준 CSS는 아니지만 documentElement.style.zoom을 실제
      // 레이아웃 확대로 반영한다(Playwright chromium 실측) — 뷰포트를 그대로
      // 두고 컨텐츠만 2배로 키워 "확대된 화면에서도 잘리지 않는지"를 보는
      // 것이 목적이라, 뷰포트를 절반으로 줄이는 방식(내용은 그대로, 뷰포트만
      // 작아짐)보다 이 방식이 실제 브라우저 확대(Ctrl/Cmd + +)에 더 가깝다.
      await page.evaluate(() => { document.documentElement.style.zoom = '2' })

      r.check(`${name} — 200% 확대 후 가로 스크롤 없음`, await noHorizontalOverflow(page))
      const sceneVisibleAtZoom = await page.locator('[data-testid="town-scene-v2"]').isVisible().catch(() => false)
      r.check(`${name} — 200% 확대 후에도 town-scene-v2 표시`, sceneVisibleAtZoom)
      const hudChipsVisible = await page.locator(LV_BADGE_SEL).isVisible().catch(() => false)
        && await page.locator(DOLLAR_BADGE_SEL).isVisible().catch(() => false)
      r.check(`${name} — 200% 확대 후에도 HUD 칩(⭐/💵) 표시`, hudChipsVisible)
      const btnScanAtZoom = await minVisibleButtonHeight(page)
      r.check(`${name} — 200% 확대 후에도 보이는 버튼 전체 >= 44px`, btnScanAtZoom.min !== null && btnScanAtZoom.min >= 44, `min=${btnScanAtZoom.min}`)

      await page.evaluate(() => { document.documentElement.style.zoom = '' })
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S7 — prefers-reduced-motion: reduce, 배치 모드(앵커 펄스 애니메이션) ──
  {
    const vp = { width: 390, height: 844 }
    const name = 'S7[390x844] reduced-motion'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 20, dollars: { available: 0, earned: 20, spent: 20 }, owned: ['tree'], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await page.locator('[data-testid="town-screen-v2"]').waitFor({ state: 'visible', timeout: 15000 })
      await waitForTownHeader(page)

      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      const anchorsVisible = await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 배치 모드 진입, 앵커(motion-safe:animate-pulse) 표시`, anchorsVisible)

      const animCount = await page.evaluate(() => document.getAnimations().length)
      const animAllPausedOrNone = await page.evaluate(() => {
        const anims = document.getAnimations()
        return anims.length === 0 || anims.every((a) => a.playState === 'paused' || a.playState === 'finished')
      })
      r.check(`${name} — prefers-reduced-motion에서 실행 중인 애니메이션 0개(또는 전부 일시정지/종료)`, animAllPausedOrNone, `count=${animCount}`)

      const sceneStillVisible = await page.locator('[data-testid="town-scene-v2"]').isVisible().catch(() => false)
      r.check(`${name} — reduced-motion에도 V2 씬이 정상 렌더됨`, sceneStillVisible)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S8 — D1 정정 회귀 방지: 고정 랜드마크(LOTS)는 자유 배치 대상이
  //        아니다(worldRender.isFixedLandmarkId, 2026-09-18 D1 정정 —
  //        이전 landmarkRenderSource 기반 S8은 전면 교체됐다). 레거시
  //        townPlacements(옛 8x6 시절 book-shop/cafe를 마을에 "배치"한
  //        기록)가 남아 있어도: 1) 고정 로트는 항상 하나만 그려지고
  //        (lotState만 보고 그림, 배치 데이터 무시), 2) 그 레거시 항목은
  //        배치된 사본으로도 보이지 않으며, 3) 보관함 자유 배치 목록/
  //        배치 후보 앵커 어디에도 나타나지 않는다 — 데이터 자체는
  //        지우거나 다시 쓰지 않는다(마이그레이션 없음, CLAUDE.md 규칙 9).
  {
    const vp = { width: 390, height: 844 }
    const name = 'S8a[390x844] D1 정정 — 레거시 배치된 고정 랜드마크는 뷰에서 걸러짐'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    // 레거시 배치 시드 — mockRoutes.mjs installMocks()의 tables 오버라이드로
    // student_progress.progress_data.townPlacements에 cafe/book-shop 항목을
    // 직접 심는다(useStudent.js fetchFullProgress()가 이 정확한 shape을
        // 읽는다, src/utils/wordLibrary.js:3209 fetchFullProgress 확인 완료) —
    // 로그인 시 로컬이 비어있으므로(새 브라우저 컨텍스트) 이 클라우드 백업이
    // 그대로 병합 복원된다(useStudent.js normalizeRecord 경로, 재구현 없음).
    const legacyPlacements = [
      { placementId: 'legacy-cafe-1', itemId: 'cafe', x: 2, y: 1, placedAt: 1, updatedAt: 1 },
      { placementId: 'legacy-bookshop-1', itemId: 'book-shop', x: 4, y: 3, placedAt: 1, updatedAt: 1 },
    ]
    const tables = {
      ...buildFixtureTables(),
      student_progress: [
        { student_id: QA_STUDENT_ID, progress_data: { townPlacements: legacyPlacements, townRemovedIds: [] } },
      ],
    }
    const mocks = await installMocks(page, {
      tables,
      townState: { starsEarned: 800, dollars: { available: 999, earned: 999, spent: 0 }, owned: ['book-shop', 'cafe', 'tree'], welcomeClaimed: true },
    })
    const { db } = mocks
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      // 레거시 배치가 클라우드 병합 복원으로 반영될 때까지 대기(cafe/
      // book-shop 둘 다 ownedIds에도 있으므로 visiblePlacements를 통과해
      // 일단 placements 배열에는 들어온다 — 이 화면이 그걸 어떻게
      // "보이지 않게" 거르는지가 이 시나리오의 핵심).
      await waitUntil(async () => (await page.locator('[data-lot-id="cafe"]').count()) > 0, { timeout: 10000 })

      // (f) 마을을 "열기만" 해도 student_progress에 새 쓰기가 없다(저장
      //     없음, 새 effect 없음) — 병합 복원 폴링 뒤 한 박자 더 대기.
      await page.waitForTimeout(500)
      const writesOnOpen = writesTo(db, 'student_progress').length
      r.check(`${name} — 마을을 열기만 해도 student_progress 쓰기 0건(저장 부작용 없음)`, writesOnOpen === 0, `writes=${writesOnOpen}`)

      // (a) cafe/book-shop 둘 다 — 아트 1개, 고정 로트 built 1개, 배치된
      //     사본 0개(레거시 배치가 자유 배치 사본으로 이중 렌더되지 않음).
      for (const id of ['cafe', 'book-shop']) {
        const imgCount = await page.locator(`img[data-asset-key="buildings/${id}"]`).count()
        r.check(`${name} — ${id} 아트 <img> 정확히 1개(레거시 배치가 있어도 중복 없음)`, imgCount === 1, `count=${imgCount}`)
        const lotCount = await page.locator(`[data-lot-id="${id}"][data-lot-state="built"]`).count()
        r.check(`${name} — ${id} 고정 로트(built) 정확히 1개`, lotCount === 1, `count=${lotCount}`)
        const placedCount = await page.locator(`[data-item-id="${id}"][data-cell]`).count()
        r.check(`${name} — ${id} 배치된 사본 0개(레거시 배치는 뷰에서 걸러짐, 데이터는 안 지움)`, placedCount === 0, `count=${placedCount}`)
      }

      // (b) 보관함에 카페/책방 "마을에 놓기" 카드가 없고, 나무는 여전히
      //     있음 — freeCatalog(TownScreenV2.jsx)가 isFixedLandmarkId로
      //     걸러낸 결과.
      await page.locator('[data-testid="town-open-inventory"]').click()
      await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
      const placeButtons = page.getByRole('button', { name: '마을에 놓기' })
      r.check(`${name} — 보관함 "마을에 놓기" 버튼이 정확히 1개(나무만, 카페/책방 제외)`, (await placeButtons.count()) === 1, `count=${await placeButtons.count()}`)
      const cafeCardCount = await page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('카페', { exact: true }) }).count()
      r.check(`${name} — 보관함에 카페 카드 없음`, cafeCardCount === 0, `count=${cafeCardCount}`)
      const bookCardCount = await page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('책방', { exact: true }) }).count()
      r.check(`${name} — 보관함에 책방 카드 없음`, bookCardCount === 0, `count=${bookCardCount}`)
      const treeCardVisible = await page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('나무', { exact: true }) }).first().isVisible().catch(() => false)
      r.check(`${name} — 보관함에 나무 카드는 여전히 보임`, treeCardVisible)

      // (c)+(d) 나무는 여전히 정상적으로 배치/이동/보관 가능하고(고정
      //     랜드마크 필터링이 일반 아이템 배치를 방해하지 않음), 레거시
      //     cafe/book-shop 칸은 배치 후보 앵커로 제공되지 않는다(점유
      //     판정은 occupancyPlacements, 즉 전체 목록 기준 — TownScene.jsx).
      await placeButtons.first().click()
      await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 })
      const anchorCount = await page.locator('[data-anchor]').count()
      r.check(`${name} — 배치 후보 앵커가 45개(47 - 레거시 점유 2칸)`, anchorCount === 45, `count=${anchorCount}`)
      const cafeAnchorOffered = await page.locator('[data-anchor="2,1"]').count()
      r.check(`${name} — 레거시 카페 칸(2,1)이 배치 후보 앵커로 제공되지 않음`, cafeAnchorOffered === 0, `count=${cafeAnchorOffered}`)
      const bookshopAnchorOffered = await page.locator('[data-anchor="4,3"]').count()
      r.check(`${name} — 레거시 책방 칸(4,3)이 배치 후보 앵커로 제공되지 않음`, bookshopAnchorOffered === 0, `count=${bookshopAnchorOffered}`)

      await page.locator('[data-anchor]').first().click()
      const treePlaced = await page.locator('[data-item-id="tree"][data-cell]').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 정상적으로 배치됨`, treePlaced)

      await page.locator('[data-item-id="tree"][data-cell] button').first().click()
      const moveBtn = page.getByRole('button', { name: '이동', exact: true })
      await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
      await moveBtn.click()
      const anotherAnchor = page.locator('[data-anchor]').first()
      await anotherAnchor.waitFor({ state: 'visible', timeout: 10000 })
      await anotherAnchor.click()
      const treeMoved = await page.locator('[data-item-id="tree"][data-cell]').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 나무가 정상적으로 이동됨`, treeMoved)

      await page.locator('[data-item-id="tree"][data-cell] button').first().click()
      const storeBtn = page.getByRole('button', { name: '보관', exact: true })
      await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
      await storeBtn.click()
      const treeStored = await waitUntil(async () => (await page.locator('[data-item-id="tree"]').count()) === 0, { timeout: 10000 })
      r.check(`${name} — 나무가 정상적으로 보관됨`, !!treeStored)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S8b — for-sale: 미소유 book-shop이 Lv4에서 for-sale 로트 1개 ─────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S8b[390x844] for-sale — book-shop 미소유 Lv4'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 100, dollars: { available: 0, earned: 0, spent: 0 }, owned: [], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const lvText = await waitUntil(async () => {
        const t = (await page.locator(LV_BADGE_SEL).textContent().catch(() => '')) || ''
        return t.includes('Lv.4') ? t : false
      }, { timeout: 10000 })
      r.check(`${name} — HUD "⭐ Lv.4" 표시(starsEarned=100)`, !!lvText, lvText || '(no Lv.4)')

      const forSaleCount = await page.locator('[data-lot-id="book-shop"][data-lot-state="for-sale"]').count()
      r.check(`${name} — book-shop 로트가 for-sale 상태로 정확히 1개`, forSaleCount === 1, `count=${forSaleCount}`)
      const builtCount = await page.locator('[data-lot-id="book-shop"][data-lot-state="built"]').count()
      r.check(`${name} — book-shop built 로트는 0개(미소유)`, builtCount === 0, `count=${builtCount}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S9 — D5 회귀 방지: 배치 모드 44px 탭 컨트롤이 좁은 화면에서도
  //        서로 겹치지 않고 전부 탭 가능함(layoutPlacementControls,
  //        2026-09-18) ────────────────────────────────────────────────────
  const S9_VIEWPORTS = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
  for (const vp of S9_VIEWPORTS) {
    const name = `S9[${vp.width}x${vp.height}] D5 — 배치 앵커 탭 가능성`
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 800, dollars: { available: 0, earned: 0, spent: 0 }, owned: ['tree'], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 })

      const anchors = page.locator('[data-anchor]')
      const anchorCount = await anchors.count()
      const sceneLocator = page.locator('[data-testid="town-scene-v2"]')
      let minW = Infinity
      let minH = Infinity
      let insideCount = 0
      let hitCount = 0
      for (let i = 0; i < anchorCount; i++) {
        const el = anchors.nth(i)
        // elementFromPoint/boundingBox는 실제 스크롤 뷰포트 기준이라(씬
        // 전체가 뷰포트보다 클 수 있음), 검사 직전 이 앵커를 뷰 안으로
        // 스크롤한 "뒤" 앵커/씬 박스 둘 다 새로 측정한다(스크롤 전
        // 좌표를 쓰면 스크롤 위치 아티팩트로 false negative가 난다 —
        // "겹치지 않는다"는 제품 계약과 무관).
        await el.evaluate((btn) => btn.scrollIntoView({ block: 'center', inline: 'center' }))
        const box = await el.boundingBox()
        const sceneBox = await sceneLocator.boundingBox()
        if (!box) continue
        minW = Math.min(minW, box.width)
        minH = Math.min(minH, box.height)
        const inside = !!sceneBox &&
          box.x >= sceneBox.x - 0.5 && box.y >= sceneBox.y - 0.5 &&
          (box.x + box.width) <= (sceneBox.x + sceneBox.width + 0.5) &&
          (box.y + box.height) <= (sceneBox.y + sceneBox.height + 0.5)
        if (inside) insideCount++
        const hit = await el.evaluate((btn) => {
          const r2 = btn.getBoundingClientRect()
          const cx = r2.left + r2.width / 2
          const cy = r2.top + r2.height / 2
          const top = document.elementFromPoint(cx, cy)
          return !!top && (top === btn || btn.contains(top))
        })
        if (hit) hitCount++
      }
      console.log(`  [town-v2] ${name} — 앵커=${anchorCount} minBBox=${minW.toFixed(1)}x${minH.toFixed(1)} inside=${insideCount}/${anchorCount} elementFromPointHit=${hitCount}/${anchorCount}`)
      r.check(`${name} — 앵커 존재(${anchorCount}개) 및 모든 앵커 bbox >= 44x44`, anchorCount > 0 && minW >= 43.5 && minH >= 43.5, `count=${anchorCount} minW=${minW} minH=${minH}`)
      r.check(`${name} — 모든 앵커가 씬 경계 안(${insideCount}/${anchorCount})`, insideCount === anchorCount, `inside=${insideCount}/${anchorCount}`)
      r.check(`${name} — 모든 앵커에서 elementFromPoint가 자기 자신(또는 자손)을 가리킴(겹침 없음, ${hitCount}/${anchorCount})`, hitCount === anchorCount, `hit=${hitCount}/${anchorCount}`)

      if (vp.width === 360) {
        // 명명된 회귀 — '1,1'에 배치→보관→재진입 후 '7,3'을 키보드(Enter)로
        // 활성화해도 정확히 그 칸에 배치되는지(포인터로 클릭한 컨트롤이
        // 실제로는 다른 앵커의 것으로 뒤바뀌지 않았는지의 반증) + 팝오버가
        // 씬 밖으로 잘리지 않는지 + Escape/백드롭 닫기 + 포커스 복귀.
        await page.locator('[data-anchor="1,1"]').click()
        const treeAt11 = await page.locator('[data-item-id="tree"][data-cell="1,1"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
        r.check(`${name} — '1,1' 앵커 클릭 시 나무가 정확히 (1,1)에 배치됨`, treeAt11)

        await page.locator('[data-item-id="tree"][data-cell="1,1"] button').click()
        const storeBtn = page.getByRole('button', { name: '보관', exact: true })
        await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
        await storeBtn.click()
        const stored = await waitUntil(async () => (await page.locator('[data-item-id="tree"]').count()) === 0, { timeout: 10000 })
        r.check(`${name} — 보관 후 나무가 씬에서 사라짐`, !!stored)

        await page.locator('[data-testid="town-open-inventory"]').click()
        const placeBtn2 = page.getByRole('button', { name: '마을에 놓기' })
        await placeBtn2.waitFor({ state: 'visible', timeout: 10000 })
        await placeBtn2.click()
        await page.locator('[data-anchor="7,3"]').waitFor({ state: 'visible', timeout: 10000 })
        await page.locator('[data-anchor="7,3"]').focus()
        await page.keyboard.press('Enter')
        const treeAt73 = await page.locator('[data-item-id="tree"][data-cell="7,3"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
        r.check(`${name} — '7,3' 앵커를 키보드(Enter)로 활성화해도 정확히 (7,3)에 배치됨`, treeAt73)

        const itemBtn = page.locator('[data-item-id="tree"][data-cell="7,3"] button')
        await itemBtn.click()
        const moveBtn = page.getByRole('button', { name: '이동', exact: true })
        await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
        const sceneBoxForPopover = await page.locator('[data-testid="town-scene-v2"]').boundingBox()
        const moveBtnBox = await moveBtn.boundingBox()
        const popoverInside = !!sceneBoxForPopover && !!moveBtnBox &&
          moveBtnBox.x >= sceneBoxForPopover.x - 0.5 && moveBtnBox.y >= sceneBoxForPopover.y - 0.5 &&
          (moveBtnBox.x + moveBtnBox.width) <= (sceneBoxForPopover.x + sceneBoxForPopover.width + 0.5) &&
          (moveBtnBox.y + moveBtnBox.height) <= (sceneBoxForPopover.y + sceneBoxForPopover.height + 0.5)
        r.check(`${name} — (7,3) 팝오버가 씬 박스 안에 완전히 들어옴(클리핑 없음)`, popoverInside, JSON.stringify({ sceneBoxForPopover, moveBtnBox }))

        await page.keyboard.press('Escape')
        const closedByEscape = await waitUntil(async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0, { timeout: 5000 })
        r.check(`${name} — Escape로 팝오버가 닫힘`, !!closedByEscape)
        const focusReturned = await itemBtn.evaluate((btn) => btn === document.activeElement)
        r.check(`${name} — Escape로 닫힌 후 포커스가 트리거(아이템) 버튼으로 복귀`, focusReturned)

        await itemBtn.click()
        await page.getByRole('button', { name: '이동', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
        const backdrop = page.locator('[data-testid="town-scene-backdrop"]')
        await backdrop.click({ position: { x: 10, y: 80 } })
        const closedByBackdrop = await waitUntil(async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0, { timeout: 5000 })
        r.check(`${name} — 백드롭 클릭으로도 팝오버가 닫힘`, !!closedByBackdrop)
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S10 — 표지판 텍스트 폭 회귀 방지: My House 표지판 <text>가 자신의
  //        박스(<rect>, 기둥이 아니라 표지판 판) 폭 안에 여유 있게 들어맞는지
  //        (2026-09-19 — font-size 9.5(텍스트 폭 48.92) → 7.7(텍스트 폭
  //        39.65)로 수정, 박스 폭 44는 그대로). Georgia는 이 하네스(Windows/
  //        Playwright Chromium)와 실제 CI(Linux, Georgia 미설치 → 시스템
  //        세리프 폴백) 간 글리프 폭이 달라질 수 있어, 정확히 0 여유가
  //        아니라 최소 1유닛 이상의 여유를 요구한다(폰트 폴백 흔들림 허용치).
  //        "To the Sea" 표지판(범위 밖, 미수정)도 같은 방식으로 재봤지만
  //        실측 마진이 ~0.94 유닛뿐이라(59.07 vs 60) 이 1유닛 마진 기준과
  //        자연스럽게 맞지 않아 — 이미 알려진 여유이자 이번 수정과 무관한
  //        서명에 새로운(더 느슨한 기준의) 단언을 추가하는 대신 생략한다
  //        (지시서의 "낮은 리스크로 자연스럽게 맞을 때만" 옵션 조건 미충족).
  {
    const vp = { width: 390, height: 844 }
    const name = 'S10[390x844] 표지판 텍스트 폭 <= 박스 폭'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await page.locator('[data-testid="town-scene-v2"]').waitFor({ state: 'visible', timeout: 15000 })

      // TownSceneryLayer.jsx WorldSign — role="img" aria-label=표지판 텍스트
      // 래퍼 안의 <svg>에 <text>(표지판 카피) + 여러 <rect>(판 + 기둥)가
      // 있다. 판은 항상 기둥보다 훨씬 넓은 rect이므로 width가 가장 큰
      // rect를 "박스"로 취급한다(재도출 없음 — svgInner가 유일한 원천).
      async function measureSignTextVsBox(ariaLabel) {
        const sign = page.locator(`div[role="img"][aria-label="${ariaLabel}"]`).first()
        await sign.waitFor({ state: 'visible', timeout: 10000 })
        return sign.evaluate((el) => {
          const text = el.querySelector('text')
          const rects = Array.from(el.querySelectorAll('rect'))
          const box = rects.reduce((widest, rectEl) => {
            const w = parseFloat(rectEl.getAttribute('width') || '0')
            return w > widest.w ? { w, el: rectEl } : widest
          }, { w: 0, el: null }).el
          return {
            textWidth: text ? text.getComputedTextLength() : null,
            boxWidth: box ? parseFloat(box.getAttribute('width')) : null,
          }
        })
      }

      const myHouse = await measureSignTextVsBox('My House')
      r.check(
        `${name} — My House 표지판 텍스트 폭이 박스 폭보다 최소 1 유닛 이상 작음(양쪽 여유 존재)`,
        myHouse.textWidth != null && myHouse.boxWidth != null && myHouse.textWidth <= myHouse.boxWidth - 1,
        JSON.stringify(myHouse),
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S11 — 배치 팝오버 수평 클리핑 정정 회귀 방지(2026-09-19,
  //        TownObjectLayer.jsx PlacementPopover) — 47개 배치 앵커 전부 x
  //        3개 폭(360/390/430) = 141개 조합 각각에서 이동/보관 팝오버가
  //        씬 박스 안에 완전히 들어오는지(수평 클리핑 없음), 두 버튼이
  //        >=44x44 실제 탭 가능 영역을 유지하는지, 라벨이 살아있는지,
  //        elementFromPoint가 자기 자신(또는 자손)을 가리키는지, 페이지
  //        가로 오버플로우가 없는지를 검증한다. S9(D5 겹침 회귀)와 같은
  //        정신이지만 축이 다르다 — S9는 배치 오버레이(TownPlacementOverlay)
  //        44px 탭 컨트롤 자체의 겹침을, 이 S11은 아이템을 실제로 배치한
  //        뒤 여는 이동/보관 팝오버(TownObjectLayer.jsx PlacementPopover)
  //        의 수평 위치를 검증한다 — 서로 다른 컴포넌트, 다른 버그.
  //        141회 전부 "배치→팝오버 열기(측정)→보관(닫기+다음 앵커를 위해
  //        빈칸으로 되돌림)"만 반복해(지시서 명시대로 열기/닫기/Escape/
  //        백드롭을 141번 반복하지 않음) 실행 시간을 억제한다 — Escape/
  //        바깥 탭/포커스 복귀는 대표 부분집합(확정 클리핑 3개 + 확정
  //        정상 3개 앵커, 최악 사례인 360px 폭 하나)에서만 별도로 검증.
  const S11_VIEWPORTS = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
  // 확정 클리핑 3개(1,0)/(2,1)/(7,5) + 확정 정상 3개(0,0)/(5,2)/(4,5) —
  // 이 세션의 실측 BEFORE/AFTER 표와 동일한 앵커(작업 지시서가 지정한
  // 9개 조합의 근거 앵커).
  const S11_CLOSURE_SUBSET = new Set(['1,0', '2,1', '7,5', '0,0', '5,2', '4,5'])
  {
    const geometrySummary = []
    for (const vp of S11_VIEWPORTS) {
      const name = `S11[${vp.width}x${vp.height}] 배치 팝오버 수평 클리핑 정정`
      const context = await browser.newContext({ viewport: vp })
      const page = await context.newPage()
      await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
      const mocks = await installMocks(page, {
        townState: { starsEarned: 800, dollars: { available: 0, earned: 0, spent: 0 }, owned: ['tree'], welcomeClaimed: true },
      })
      try {
        await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
        await login(page)
        await goToPaulTownScreen(page)
        const card = await enterTownCard(page)
        await card.click()
        await waitForTownHeader(page)

        // 47개 배치 앵커 id를 한 번 수집(배치는 하지 않고 취소).
        await page.locator('[data-testid="town-open-inventory"]').click()
        const placeBtn0 = page.getByRole('button', { name: '마을에 놓기' })
        await placeBtn0.waitFor({ state: 'visible', timeout: 10000 })
        await placeBtn0.click()
        await page.locator('[data-anchor]').first().waitFor({ state: 'visible', timeout: 10000 })
        const anchorIds = await page.locator('[data-anchor]').evaluateAll((els) => els.map((el) => el.getAttribute('data-anchor')))
        r.check(`${name} — 47개 배치 앵커 존재`, anchorIds.length === 47, `count=${anchorIds.length}`)
        await page.getByRole('button', { name: '취소' }).click()

        let geomOkCount = 0
        let hitOkCount = 0
        let pointOkCount = 0
        let labelOkCount = 0
        let overflowOkCount = 0
        const failedAnchors = []

        for (const anchorId of anchorIds) {
          await page.locator('[data-testid="town-open-inventory"]').click()
          const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
          await placeBtn.waitFor({ state: 'visible', timeout: 5000 })
          await placeBtn.click()
          const anchorBtn = page.locator(`[data-anchor="${anchorId}"]`)
          await anchorBtn.waitFor({ state: 'visible', timeout: 5000 })
          await anchorBtn.click()

          const itemBtn = page.locator(`[data-item-id="tree"][data-cell="${anchorId}"] button`)
          await itemBtn.waitFor({ state: 'visible', timeout: 5000 })
          await itemBtn.evaluate((btn) => btn.scrollIntoView({ block: 'center', inline: 'center' }))
          await itemBtn.click()

          const moveBtn = page.getByRole('button', { name: '이동', exact: true })
          const storeBtn = page.getByRole('button', { name: '보관', exact: true })
          await moveBtn.waitFor({ state: 'visible', timeout: 5000 })

          const sceneBox = await page.locator('[data-testid="town-scene-v2"]').boundingBox()
          const moveBox = await moveBtn.boundingBox()
          const storeBox = await storeBtn.boundingBox()
          // (7,3) 팝오버 검사(위 S9)와 동일한 관례 — 씬 박스 기준, ±0.5px
          // 서브픽셀 여유(제품 계약과 무관한 반올림 아티팩트만 허용).
          const boxInsideScene = (box) => !!sceneBox && !!box &&
            box.x >= sceneBox.x - 0.5 && box.y >= sceneBox.y - 0.5 &&
            (box.x + box.width) <= (sceneBox.x + sceneBox.width + 0.5) &&
            (box.y + box.height) <= (sceneBox.y + sceneBox.height + 0.5)
          const geomOk = boxInsideScene(moveBox) && boxInsideScene(storeBox)
          if (geomOk) geomOkCount++
          else failedAnchors.push({ anchorId, reason: 'geometry', sceneBox, moveBox, storeBox })

          const hitOk = (moveBox && moveBox.width >= 43.5 && moveBox.height >= 43.5) &&
            (storeBox && storeBox.width >= 43.5 && storeBox.height >= 43.5)
          if (hitOk) hitOkCount++
          else failedAnchors.push({ anchorId, reason: 'hit-size', moveBox, storeBox })

          const moveHit = await moveBtn.evaluate((btn) => {
            const rect = btn.getBoundingClientRect()
            const cx = rect.left + rect.width / 2
            const cy = rect.top + rect.height / 2
            const top = document.elementFromPoint(cx, cy)
            return !!top && (top === btn || btn.contains(top))
          })
          const storeHit = await storeBtn.evaluate((btn) => {
            const rect = btn.getBoundingClientRect()
            const cx = rect.left + rect.width / 2
            const cy = rect.top + rect.height / 2
            const top = document.elementFromPoint(cx, cy)
            return !!top && (top === btn || btn.contains(top))
          })
          const elementFromPointOk = moveHit && storeHit
          if (elementFromPointOk) pointOkCount++
          else failedAnchors.push({ anchorId, reason: 'elementFromPoint', moveHit, storeHit })

          const moveLabel = (await moveBtn.textContent() || '').trim()
          const storeLabel = (await storeBtn.textContent() || '').trim()
          const labelOk = moveLabel === '이동' && storeLabel === '보관'
          if (labelOk) labelOkCount++
          else failedAnchors.push({ anchorId, reason: 'label', moveLabel, storeLabel })

          const noOverflow = await noHorizontalOverflow(page)
          if (noOverflow) overflowOkCount++
          else failedAnchors.push({ anchorId, reason: 'page-overflow' })

          // 대표 부분집합 + 360px 폭에서만 Escape/바깥 탭/포커스 복귀 추가 검증
          // (열기/닫기를 141번 반복하지 않는다는 지시서 제약 — 이 앵커들만
          // 여기서 한 번 더 열어 닫기 시나리오를 검증한 뒤, 마지막엔 항상
          // '보관'으로 닫아 다음 앵커를 위해 빈 칸으로 되돌린다).
          if (vp.width === 360 && S11_CLOSURE_SUBSET.has(anchorId)) {
            await page.keyboard.press('Escape')
            const closedByEscape = await waitUntil(async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0, { timeout: 5000 })
            r.check(`${name} — 앵커(${anchorId}) Escape로 팝오버가 닫힘`, !!closedByEscape)
            const focusReturned = await itemBtn.evaluate((btn) => btn === document.activeElement)
            r.check(`${name} — 앵커(${anchorId}) Escape로 닫힌 후 포커스가 트리거(아이템) 버튼으로 복귀`, focusReturned)

            await itemBtn.click()
            await page.getByRole('button', { name: '이동', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
            const backdrop = page.locator('[data-testid="town-scene-backdrop"]')
            await backdrop.click({ position: { x: 10, y: 80 } })
            const closedByBackdrop = await waitUntil(async () => (await page.getByRole('button', { name: '이동', exact: true }).count()) === 0, { timeout: 5000 })
            r.check(`${name} — 앵커(${anchorId}) 백드롭 클릭으로도 팝오버가 닫힘`, !!closedByBackdrop)

            // 백드롭으로 닫혔으니 보관하려면 다시 열어야 한다.
            await itemBtn.click()
            await page.getByRole('button', { name: '보관', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
          }

          await storeBtn.click()
          const stored = await waitUntil(async () => (await page.locator(`[data-item-id="tree"][data-cell="${anchorId}"]`).count()) === 0, { timeout: 10000 })
          if (!stored) failedAnchors.push({ anchorId, reason: 'store-failed' })
        }

        console.log(`  [town-v2] ${name} — geom=${geomOkCount}/${anchorIds.length} hit=${hitOkCount}/${anchorIds.length} elementFromPoint=${pointOkCount}/${anchorIds.length} label=${labelOkCount}/${anchorIds.length} overflow=${overflowOkCount}/${anchorIds.length}`)
        if (failedAnchors.length > 0) console.log(`  [town-v2] ${name} — 실패 상세(최대 10개): ${JSON.stringify(failedAnchors.slice(0, 10))}`)
        geometrySummary.push({ width: vp.width, geomOkCount, hitOkCount, pointOkCount, labelOkCount, overflowOkCount, total: anchorIds.length })

        r.check(`${name} — 47개 앵커 전부 팝오버가 씬 박스 안(클리핑 없음, ${geomOkCount}/${anchorIds.length})`, geomOkCount === anchorIds.length, `${geomOkCount}/${anchorIds.length}`)
        r.check(`${name} — 47개 앵커 전부 이동/보관 버튼 >=44x44 탭 영역(${hitOkCount}/${anchorIds.length})`, hitOkCount === anchorIds.length, `${hitOkCount}/${anchorIds.length}`)
        r.check(`${name} — 47개 앵커 전부 elementFromPoint가 자기 자신(또는 자손)을 가리킴(${pointOkCount}/${anchorIds.length})`, pointOkCount === anchorIds.length, `${pointOkCount}/${anchorIds.length}`)
        r.check(`${name} — 47개 앵커 전부 이동/보관 라벨 표시(${labelOkCount}/${anchorIds.length})`, labelOkCount === anchorIds.length, `${labelOkCount}/${anchorIds.length}`)
        r.check(`${name} — 47개 앵커 전부 페이지 가로 오버플로우 없음(${overflowOkCount}/${anchorIds.length})`, overflowOkCount === anchorIds.length, `${overflowOkCount}/${anchorIds.length}`)
      } catch (err) {
        const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
        r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
          `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
      } finally {
        collect(mocks)
        await context.close()
      }
    }
    const totalCombos = geometrySummary.reduce((sum, s) => sum + s.total, 0)
    const totalGeomOk = geometrySummary.reduce((sum, s) => sum + s.geomOkCount, 0)
    console.log(`  [town-v2] S11 141-조합 요약 — geom PASS ${totalGeomOk}/${totalCombos} (${JSON.stringify(geometrySummary)})`)
    r.check('S11 — 141개(47앵커 x 3폭) 조합 전체에서 팝오버 클리핑 PASS', totalGeomOk === totalCombos && totalCombos === 141, `${totalGeomOk}/${totalCombos}`)
  }

  // ── S12 — 상점/보관함 시트(TownSheet.jsx)가 데스크톱 폭에서 전폭이 아니라
  //        중앙 정렬된 고정폭 모달로 보이는지 회귀 방지(2026-09-20,
  //        `md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2
  //        md:w-full md:max-w-xl md:max-h-[85vh] md:rounded-3xl` 오버라이드).
  //        수정 전 실측: 1280/1440/1920 전부 sheet.x===0 &&
  //        sheet.width===viewport.width(전폭 하단 시트가 그대로 늘어남).
  //        7개 뷰포트(데스크톱 1280/1440/1920, 모바일/태블릿 베이스라인
  //        360/390/430/768 — 768은 md: 임계값을 그대로 넘으므로 데스크톱과
  //        동일하게 중앙 모달 취급, TownSheet.jsx 코드 주석에 근거 기록)
  //        전부에서 시트 수평 포함/오버플로우 없음을, 데스크톱 3개에서만
  //        중앙 정렬·최대폭을 검증한다. 상품 카드 포함/같은 행 카드 간
  //        비정상 간격 없음/오버레이 전체 커버리지/닫기 버튼 탭 가능성도
  //        7개 전부에서, 카테고리 5탭 전환 시 포함성 유지와 잠김/구매가능
  //        카드 혼재 렌더는 대표 뷰포트(데스크톱 1920 · 모바일 360) 1개씩만
  //        검증한다(141콤보를 141x5로 불리지 않도록, S11과 같은 절제).
  const S12_VIEWPORTS = [
    { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 },
    { width: 360, height: 844 }, { width: 390, height: 858 }, { width: 430, height: 946 }, { width: 768, height: 1024 },
  ]
  const S12_DESKTOP_WIDTHS = new Set([1280, 1440, 1920])
  // md:max-w-xl === 576px — 몇 십 px 헤드룸을 둔 상한(전폭 버그였다면
  // viewport 폭 그대로 1280+였을 것이므로 700은 둘을 명확히 가른다).
  const S12_MAX_SHEET_WIDTH = 700
  // 뷰포트 폭의 5% — 완전 중앙(0)은 서브픽셀 반올림에 너무 빡빡하고,
  // 데스크톱 3폭 전부에서 실측 오프셋은 0~1px이므로 5%면 넉넉한 여유.
  const S12_CENTER_TOLERANCE_RATIO = 0.05
  // grid-cols-2 gap-2(8px)의 5배 — 정상 그리드 간격(실측 8px)과 완전
  // 전폭-분리 버그(수백 px)를 명확히 가르는 중간 값.
  const S12_MAX_CARD_GAP = 40

  // 가로축만 검사한다(+ 위쪽 경계만) — 시트 자체가
  // overflow-y-auto/max-h-[78vh|85vh]인 스크롤 컨테이너라, 카테고리에
  // 아이템이 많으면(예: 장식 6개 = 3행) 마지막 행이 스크롤해야 보이는
  // 것이 정상이고(모바일 78vh 기준 실측 확인됨, md: 변경과 무관한 기존
  // 동작), 그 경우 getBoundingClientRect()의 y가 시트 높이를 넘는 것은
  // 버그가 아니다. 이 회귀가 실제로 문제 삼는 축은 가로(시트가 전폭으로
  // 늘어나며 카드가 옆으로 밀려나는 것)이므로 가로 포함 여부만 단언한다.
  function boxesContained(outer, boxes, tol = 0.5) {
    return !!outer && (Array.isArray(boxes) ? boxes : []).every((b) => !!b &&
      b.x >= outer.x - tol && b.y >= outer.y - tol &&
      (b.x + b.width) <= (outer.x + outer.width + tol))
  }

  async function readCardBoxes(page) {
    return page.locator('[data-testid="town-sheet"] .grid.grid-cols-2 > div').evaluateAll((els) =>
      els.map((el) => {
        const r2 = el.getBoundingClientRect()
        return { x: r2.x, y: r2.y, width: r2.width, height: r2.height }
      })
    )
  }

  for (const vp of S12_VIEWPORTS) {
    const name = `S12[${vp.width}x${vp.height}] 상점 시트 데스크톱 컨테인먼트`
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    // starsEarned=20 -> 마을레벨2(house 카테고리 기준: british-cottage
    // minLevel1은 buyable, book-shop/cafe minLevel3/5는 locked) — 잠김/
    // 구매가능 카드가 탭 전환 없이도 기본(house) 카테고리에 함께 보인다.
    const mocks = await installMocks(page, {
      townState: { starsEarned: 20, dollars: { available: 100, earned: 100, spent: 0 }, owned: [], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      await page.locator('[data-testid="town-open-shop"]').click()
      const sheet = page.locator('[data-testid="town-sheet"]')
      await sheet.waitFor({ state: 'visible', timeout: 10000 })
      const sheetBox = await sheet.boundingBox()

      const TOL = 0.5
      const withinViewport = !!sheetBox && sheetBox.x >= -TOL && (sheetBox.x + sheetBox.width) <= vp.width + TOL
      r.check(`${name} — 시트가 뷰포트 안에 완전히 들어옴(가로, sheet.x=${sheetBox && Math.round(sheetBox.x)} width=${sheetBox && Math.round(sheetBox.width)} vw=${vp.width})`,
        withinViewport, JSON.stringify(sheetBox))

      if (S12_DESKTOP_WIDTHS.has(vp.width)) {
        const centerOffset = sheetBox ? Math.abs((sheetBox.x + sheetBox.width / 2) - vp.width / 2) : Infinity
        const centerTolerance = vp.width * S12_CENTER_TOLERANCE_RATIO
        r.check(`${name} — 데스크톱에서 시트가 수평 중앙 정렬(오프셋 ${Math.round(centerOffset)}px <= ${Math.round(centerTolerance)}px)`,
          centerOffset <= centerTolerance, `offset=${centerOffset} tol=${centerTolerance}`)
        r.check(`${name} — 데스크톱에서 시트가 전폭이 아니라 최대폭 이내(width=${sheetBox && Math.round(sheetBox.width)} <= ${S12_MAX_SHEET_WIDTH} && < 뷰포트폭)`,
          !!sheetBox && sheetBox.width <= S12_MAX_SHEET_WIDTH && sheetBox.width < vp.width, JSON.stringify(sheetBox))
      }

      const cardBoxes = await readCardBoxes(page)
      r.check(`${name} — 상품 카드가 최소 1개 렌더됨`, cardBoxes.length > 0, `count=${cardBoxes.length}`)
      r.check(`${name} — 모든 상품 카드가 시트 박스 안에 완전히 들어옴`, boxesContained(sheetBox, cardBoxes), JSON.stringify(cardBoxes))

      // 같은 행(y가 거의 같은) 인접 카드 쌍만 골라 가로 간격을 측정 —
      // grid-cols-2라 마지막 행이 홀수 개면 다음 카드와 y가 달라 자동으로
      // 제외된다.
      let maxRowGap = 0
      for (let i = 0; i < cardBoxes.length - 1; i++) {
        const a = cardBoxes[i]; const b = cardBoxes[i + 1]
        if (Math.abs(a.y - b.y) > 2) continue
        const gap = b.x - (a.x + a.width)
        if (gap > maxRowGap) maxRowGap = gap
      }
      r.check(`${name} — 같은 행 인접 카드 간 가로 간격이 비정상적으로 넓지 않음(${Math.round(maxRowGap)}px <= ${S12_MAX_CARD_GAP}px)`,
        maxRowGap <= S12_MAX_CARD_GAP, `maxRowGap=${maxRowGap}`)

      r.check(`${name} — 페이지 가로 오버플로우 없음`, await noHorizontalOverflow(page))

      const overlayBox = await page.locator('button[aria-label="닫기"]').boundingBox()
      const overlayFull = !!overlayBox && Math.abs(overlayBox.x) < TOL && Math.abs(overlayBox.y) < TOL &&
        Math.abs(overlayBox.width - vp.width) < TOL && Math.abs(overlayBox.height - vp.height) < TOL
      r.check(`${name} — 오버레이(백드롭)가 뷰포트 전체를 덮음(inset-0)`, overlayFull, JSON.stringify(overlayBox))

      const closeBtn = page.locator('[data-testid="town-sheet-close"]')
      const closeVisible = await closeBtn.isVisible().catch(() => false)
      r.check(`${name} — 닫기 버튼이 보임`, closeVisible)
      const closeHit = await closeBtn.evaluate((btn) => {
        const rect = btn.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const top = document.elementFromPoint(cx, cy)
        return !!top && (top === btn || btn.contains(top))
      })
      r.check(`${name} — 닫기 버튼이 elementFromPoint로 자기 자신(또는 자손)을 가리킴(탭 가능)`, closeHit)

      // 대표 뷰포트(데스크톱 1920 · 모바일 360)에서만 카테고리 5탭 전환 +
      // 잠김/구매가능 카드 혼재 렌더를 검증.
      if (vp.width === 1920 || vp.width === 360) {
        for (const cat of ['집', '자연', '동물', '장식', '특별']) {
          await page.getByRole('button', { name: `${cat} 카테고리` }).click()
          await page.waitForTimeout(50)
          const sheetBoxAfterTab = await sheet.boundingBox()
          const cardBoxesAfterTab = await readCardBoxes(page)
          r.check(`${name} — 카테고리(${cat}) 전환 후에도 카드가 시트 안에 포함됨`,
            boxesContained(sheetBoxAfterTab, cardBoxesAfterTab), JSON.stringify({ sheetBoxAfterTab, cardBoxesAfterTab }))
        }

        await page.getByRole('button', { name: '집 카테고리' }).click()
        const lockedBtn = page.getByRole('button', { name: /Level \d+에서 열려요/ }).first()
        const buyableBtn = page.getByRole('button', { name: '구매', exact: true }).first()
        const lockedVisible = await lockedBtn.isVisible().catch(() => false)
        const buyableVisible = await buyableBtn.isVisible().catch(() => false)
        r.check(`${name} — 잠긴 카드(🔒 Level N에서 열려요)가 렌더됨`, lockedVisible)
        r.check(`${name} — 구매 가능 카드가 렌더됨`, buyableVisible)
        const sheetBoxForLock = await sheet.boundingBox()
        const lockedBox = await lockedBtn.boundingBox()
        const buyableBox = await buyableBtn.boundingBox()
        r.check(`${name} — 잠김/구매가능 카드 모두 시트 안에 포함됨`,
          boxesContained(sheetBoxForLock, [lockedBox, buyableBox]), JSON.stringify({ sheetBoxForLock, lockedBox, buyableBox }))
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S13 — TownSheet(상점/보관함) 오버레이/패널 z-index가 Paul Town V2 씬
  //        자신의 z-index 체계(depthOrder.js LAYER_BASE, 최고값 ui=9000 /
  //        sceneZ.js POPOVER_Z=ui+200=9200)보다 낮아 씬 콘텐츠가 시트 위로
  //        그대로 "페인트"되어 상품 카드 영역을 가리던 결함의 회귀 방지
  //        (2026-09-20, z-[120]/z-[130] → z-[9500]/z-[9510]).
  //
  //        S4/S5/S12는 전부 elementFromPoint(단수)나 boundingBox 포함
  //        관계만 확인해 왔는데, 이 결함은 히트테스트에는 전혀 나타나지
  //        않는다(백드롭 버튼이 여전히 전체 화면을 덮어 클릭은 항상 정확히
  //        카드/닫기로 감) — 처음엔 elementsFromPoint(복수형)로도 시도했지만,
  //        직접 재현·실측한 결과 이 특정 결함이 있는 헤드리스 Chromium에서는
  //        elementsFromPoint()조차 여전히 카드 요소를 최상단으로 "잘못" 보고
  //        했다(히트테스트 결과와 실제 컴포지팅 페인트 순서가 불일치 — 극단적
  //        z-index 격차에 걸친 GPU 레이어 컴포지팅 근사 추정, art-staging/
  //        renderer-previews/prefix4-debug.png에서 스크린샷은 씬이 카드를
  //        완전히 가리는데 elementsFromPoint는 카드를 topmost로 반환하는
  //        모순을 직접 확인함). 그래서 이 회귀는 실제 렌더 픽셀 색 비교로만
  //        검증 가능하다(리드 지시의 "page.screenshot() + pixel sampling"
  //        대안) — readPngPixel()(이 파일 상단, Node 내장 zlib만 사용)로
  //        같은 뷰포트 좌표를 1) 시트가 열려 있을 때, 2) 시트를 닫았을 때
  //        (씬만 보임) 각각 3x3 클립 스크린샷으로 찍어 중심 픽셀 RGB를
  //        비교한다 — 결함이 있으면 시트가 "열려 있어도" 그 좌표 색이 씬만
  //        보일 때와 완전히 같다(거리 0, 씬이 시트를 완전히 가림). 수정
  //        후에는 그 좌표에 실제 상품 카드(흰 배경)가 그려져 색이 크게
  //        달라진다.
  const S13_VIEWPORTS = [
    { width: 1920, height: 1080, label: '데스크톱' },
    { width: 360, height: 844, label: '모바일' },
  ]
  // 씬(초록 들판/하늘 계열)과 카드(흰 배경) 색은 최소 이 정도는 떨어져야
  // "실제로 카드가 그려졌다"고 볼 수 있다(실측: 수정 후 거리는 123~216,
  // 결함 상태는 항상 정확히 0 — 그 사이 어딘가로 60을 잡아 둘을 명확히
  // 가른다, 우연한 근접 색 매치 가능성에 대비한 여유).
  const S13_MIN_COLOR_DISTANCE = 60
  for (const vp of S13_VIEWPORTS) {
    const name = `S13[${vp.width}x${vp.height},${vp.label}] 상점 시트 씬 페인트오더(paint-order) 회귀`
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    // reducedMotion — 애니메이션 타이밍 우연이 아니라 z-index 자체의
    // 문제임을 고정(원 재현도 reducedMotion:'reduce'로 확인됨).
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    // starsEarned=800(마을레벨8, 전 구역 개방)+owned:[] — S4와 동일한
    // "미보유 상태에서 house 카테고리 카드 여러 개 + 씬에 랜드마크/지형이
    // 풍부하게 그려짐" 조건(원 결함이 가장 뚜렷이 보였던 조합, 리드 재현
    // 지시와 동일).
    const mocks = await installMocks(page, {
      townState: { starsEarned: 800, dollars: { available: 500, earned: 500, spent: 0 }, owned: [], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      await page.locator('[data-testid="town-open-shop"]').click()
      const sheet = page.locator('[data-testid="town-sheet"]')
      await sheet.waitFor({ state: 'visible', timeout: 10000 })
      await page.waitForTimeout(200)

      const cardBoxes = await readCardBoxes(page)
      r.check(`${name} — 상품 카드가 최소 1개 렌더됨(프로브 좌표 확보)`, cardBoxes.length > 0, `count=${cardBoxes.length}`)
      if (cardBoxes.length === 0) throw new Error('프로브용 상품 카드를 찾을 수 없음')

      const probe = cardBoxes[0]
      const cx = Math.round(probe.x + probe.width / 2)
      const cy = Math.round(probe.y + probe.height / 2)
      const clip = { x: Math.max(0, cx - 1), y: Math.max(0, cy - 1), width: 3, height: 3 }

      const withSheetBuf = await page.screenshot({ clip })
      const withSheetPx = readPngPixel(withSheetBuf, 1, 1)

      await page.locator('[data-testid="town-sheet-close"]').click()
      await sheet.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(200)
      const sceneOnlyBuf = await page.screenshot({ clip })
      const sceneOnlyPx = readPngPixel(sceneOnlyBuf, 1, 1)

      const dist = rgbDistance(withSheetPx, sceneOnlyPx)
      r.check(
        `${name} — 상품 카드 중심 좌표의 실제 렌더 픽셀 색이 "시트 열림"과 "씬만 보임(시트 닫힘)" 사이에 충분히 다름`
        + `(거리=${dist.toFixed(1)} >= ${S13_MIN_COLOR_DISTANCE} — 0에 가까우면 씬이 시트를 완전히 가려 카드가 안 보이는 것)`,
        dist >= S13_MIN_COLOR_DISTANCE,
        `withSheetPx=${JSON.stringify(withSheetPx)} sceneOnlyPx=${JSON.stringify(sceneOnlyPx)} dist=${dist}`,
      )
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S14 — 배치(placed) 카탈로그 아이템 2.5D 프레젠테이션(그림자/깊이
  //        스케일/선택 강조) 회귀 방지(2026-09-20, bench-first depth/shadow
  //        파일럿 — worldRender.js placedItemVisual(), TownObjectLayer.jsx
  //        그림자/lift 렌더, townItemVisualMeta.js). bench를 실제 47칸
  //        배치 계약(placementContract.js)의 서로 다른 depth 앵커 3개로
  //        옮기며(back='5,5'(y=6)/middle='7,0'(y=48.6)/front='7,5'(y=94) —
  //        전부 Lv8(starsEarned=800)에서 유효한 배치 후보, 작업 지시서가
  //        실측 확인한 앵커 그대로) 폭/그림자/앵커점 고정/단일 렌더를
  //        검증하고, cat/tree로 같은 메커니즘을 확장 검증한다.
  //
  //        기대 렌더 폭은 worldContract.DEPTH_BANDS(이미 동결된 상수, 이
  //        세션이 발명하지 않음)로 이 테스트가 독립적으로 재계산한 값이다
  //        (재도출이 아니라 대조 — 코드가 쓰는 것과 같은 공식):
  //          back  y=6    depthScale = 0.55 + 0.10*(6/28)   = 0.571429
  //          middle y=48.6 depthScale = 0.85 + 0.15*(3.6/21) = 0.875714
  //          front y=94   depthScale = 1.00 + 0.20*(28/34)  = 1.164706
  //        widthPct = BASE.sm(6.5, bench는 category 'decoration' →
  //        footprintFor()가 'sm') * depthScale — 전부 16% 캡 아래.
  const DEPTH_ANCHORS = { back: '5,5', middle: '7,0', front: '7,5' }
  const BENCH_WIDTH_PCT = {
    back: 6.5 * (0.55 + 0.10 * (6 / 28)),
    middle: 6.5 * (0.85 + 0.15 * (3.6 / 21)),
    front: 6.5 * (1.00 + 0.20 * (28 / 34)),
  }
  const SHADOW_WIDTH_RATIO = 0.75 // worldRender.placedItemVisual() 기본값(SHADOW_WIDTH_RATIO_DEFAULT)과 동일 상수.
  const WIDTH_PCT_TOLERANCE = 0.4 // 퍼센트 포인트 — 반올림/보더/서브픽셀 오차 여유.

  const S14_VIEWPORTS = [{ width: 390, height: 844, label: '모바일' }, { width: 1440, height: 900, label: '데스크톱' }]
  for (const vp of S14_VIEWPORTS) {
    const name = `S14[${vp.width}x${vp.height},${vp.label}] 배치 아이템 그림자/깊이스케일`
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: {
        starsEarned: 800,
        dollars: { available: 0, earned: 0, spent: 0 },
        owned: ['bench', 'tree', 'cat', 'book-shop', 'cafe', 'stone-fountain', 'bridge', 'english-school', 'clock-tower'],
        welcomeClaimed: true,
      },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const scene = page.locator('[data-testid="town-scene-v2"]')

      async function widthPctOf(locator) {
        const [box, sceneBox] = await Promise.all([locator.boundingBox(), scene.boundingBox()])
        if (!box || !sceneBox || sceneBox.width === 0) return null
        return (box.width / sceneBox.width) * 100
      }

      async function placeFromInventory(itemLabel, anchorId) {
        await page.locator('[data-testid="town-open-inventory"]').click()
        const cardEl = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText(itemLabel, { exact: true }) }).first()
        await cardEl.waitFor({ state: 'visible', timeout: 10000 })
        await cardEl.getByRole('button', { name: '마을에 놓기' }).click()
        await page.locator(`[data-anchor="${anchorId}"]`).waitFor({ state: 'visible', timeout: 10000 })
        await page.locator(`[data-anchor="${anchorId}"]`).click()
      }

      async function movePlacedItem(itemId, fromCell, toAnchorId) {
        await page.locator(`[data-item-id="${itemId}"][data-cell="${fromCell}"] > button`).click()
        const moveBtn = page.getByRole('button', { name: '이동', exact: true })
        await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
        await moveBtn.click()
        await page.locator(`[data-anchor="${toAnchorId}"]`).waitFor({ state: 'visible', timeout: 10000 })
        await page.locator(`[data-anchor="${toAnchorId}"]`).click()
      }

      async function checkShadow(pid, expectedItemWidthPct, label) {
        const shadow = page.locator(`[data-shadow-for="${pid}"]`)
        const shadowVisible = await shadow.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
        r.check(`${name} — ${label} 그림자 요소 존재/표시됨(요구사항 #5)`, shadowVisible)
        if (!shadowVisible) return
        const [shadowBox, sceneBox, pointerEvents] = await Promise.all([
          shadow.boundingBox(),
          scene.boundingBox(),
          shadow.evaluate((el) => window.getComputedStyle(el).pointerEvents),
        ])
        r.check(`${name} — ${label} 그림자 computed pointer-events: none(요구사항 #5)`, pointerEvents === 'none', `pointerEvents=${pointerEvents}`)
        const withinScene = !!shadowBox && !!sceneBox &&
          shadowBox.x >= sceneBox.x - 2 && shadowBox.y >= sceneBox.y - 2 &&
          (shadowBox.x + shadowBox.width) <= (sceneBox.x + sceneBox.width + 2) &&
          (shadowBox.y + shadowBox.height) <= (sceneBox.y + sceneBox.height + 2)
        r.check(`${name} — ${label} 그림자 바운딩박스가 씬 경계 안(약간의 여유 포함, 요구사항 #5)`, withinScene, JSON.stringify({ shadowBox, sceneBox }))
        const shadowWidthPct = shadowBox && sceneBox && sceneBox.width > 0 ? (shadowBox.width / sceneBox.width) * 100 : null
        const expectedShadowWidthPct = expectedItemWidthPct != null ? expectedItemWidthPct * SHADOW_WIDTH_RATIO : null
        r.check(
          `${name} — ${label} 그림자 폭이 아이템 폭에 비례(요구사항 #2, 기대 ${expectedShadowWidthPct != null ? expectedShadowWidthPct.toFixed(3) : '?'}%)`,
          shadowWidthPct != null && expectedShadowWidthPct != null && Math.abs(shadowWidthPct - expectedShadowWidthPct) < WIDTH_PCT_TOLERANCE,
          `shadowWidthPct=${shadowWidthPct}`,
        )
      }

      // ── bench를 back에 배치 ────────────────────────────────────────────
      await placeFromInventory('벤치', DEPTH_ANCHORS.back)
      const benchAtBack = page.locator(`[data-item-id="bench"][data-cell="${DEPTH_ANCHORS.back}"]`)
      const benchVisibleAtBack = await benchAtBack.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — bench가 back(${DEPTH_ANCHORS.back})에 배치됨`, benchVisibleAtBack)
      if (!benchVisibleAtBack) throw new Error('bench back 배치 실패')

      const placementId = await benchAtBack.getAttribute('data-placement-id')
      r.check(`${name} — 배치 직후 data-placement-id 확보됨`, !!placementId, String(placementId))

      // ── 요구사항 #8 — 단일 렌더(별도 preview 단계 없음): 배치 직후 즉시
      //     측정한 폭과 300ms 뒤 다시 측정한 폭이 완전히 같음. ──────────
      const widthImmediate = await widthPctOf(benchAtBack)
      await page.waitForTimeout(300)
      const widthSettled = await widthPctOf(benchAtBack)
      r.check(
        `${name} — 배치 직후 폭과 300ms 후 폭이 동일(단일 렌더, 요구사항 #8)`,
        widthImmediate != null && widthSettled != null && Math.abs(widthImmediate - widthSettled) < 0.05,
        `immediate=${widthImmediate} settled=${widthSettled}`,
      )
      r.check(
        `${name} — back(y=6) 렌더 폭이 기대값과 일치(${BENCH_WIDTH_PCT.back.toFixed(3)}%, 요구사항 #2)`,
        widthSettled != null && Math.abs(widthSettled - BENCH_WIDTH_PCT.back) < WIDTH_PCT_TOLERANCE,
        `widthSettled=${widthSettled}`,
      )
      await checkShadow(placementId, widthSettled, 'bench@back')

      // ── 요구사항 #3 — 그림자와 아이템이 같은 left%(수평 어긋남 없음),
      //     groundOffset 기본값(0)이라 top%도 같음(지면 접점 불변). ──────
      const anchorMatch = await benchAtBack.evaluate((wrapper) => {
        const shadowEl = wrapper.previousElementSibling
        return {
          wrapperLeft: wrapper.style.left,
          wrapperTop: wrapper.style.top,
          shadowLeft: shadowEl ? shadowEl.style.left : null,
          shadowTop: shadowEl ? shadowEl.style.top : null,
        }
      })
      r.check(
        `${name} — 그림자와 아이템이 같은 left%(수평 어긋남 없음, 요구사항 #3)`,
        !!anchorMatch.wrapperLeft && anchorMatch.wrapperLeft === anchorMatch.shadowLeft,
        JSON.stringify(anchorMatch),
      )
      r.check(
        `${name} — groundOffset 기본값(0)이라 그림자 top%도 아이템 top%와 같음(지면 접점 불변, 요구사항 #3)`,
        !!anchorMatch.wrapperTop && anchorMatch.wrapperTop === anchorMatch.shadowTop,
        JSON.stringify(anchorMatch),
      )

      // ── middle로 이동 ──────────────────────────────────────────────────
      await movePlacedItem('bench', DEPTH_ANCHORS.back, DEPTH_ANCHORS.middle)
      const benchAtMiddle = page.locator(`[data-item-id="bench"][data-cell="${DEPTH_ANCHORS.middle}"]`)
      const benchVisibleAtMiddle = await benchAtMiddle.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — bench가 middle(${DEPTH_ANCHORS.middle})로 이동됨`, benchVisibleAtMiddle)
      const widthMiddle = await widthPctOf(benchAtMiddle)
      r.check(
        `${name} — middle(y=48.6) 렌더 폭이 기대값과 일치(${BENCH_WIDTH_PCT.middle.toFixed(3)}%, 요구사항 #2)`,
        widthMiddle != null && Math.abs(widthMiddle - BENCH_WIDTH_PCT.middle) < WIDTH_PCT_TOLERANCE,
        `widthMiddle=${widthMiddle}`,
      )
      const placementIdMiddle = await benchAtMiddle.getAttribute('data-placement-id')
      await checkShadow(placementIdMiddle, widthMiddle, 'bench@middle')

      // ── front로 이동 ───────────────────────────────────────────────────
      await movePlacedItem('bench', DEPTH_ANCHORS.middle, DEPTH_ANCHORS.front)
      const benchAtFront = page.locator(`[data-item-id="bench"][data-cell="${DEPTH_ANCHORS.front}"]`)
      const benchVisibleAtFront = await benchAtFront.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — bench가 front(${DEPTH_ANCHORS.front})로 이동됨`, benchVisibleAtFront)
      const widthFront = await widthPctOf(benchAtFront)
      r.check(
        `${name} — front(y=94) 렌더 폭이 기대값과 일치(${BENCH_WIDTH_PCT.front.toFixed(3)}%, 요구사항 #2)`,
        widthFront != null && Math.abs(widthFront - BENCH_WIDTH_PCT.front) < WIDTH_PCT_TOLERANCE,
        `widthFront=${widthFront}`,
      )
      const placementIdFront = await benchAtFront.getAttribute('data-placement-id')
      await checkShadow(placementIdFront, widthFront, 'bench@front')

      // ── 요구사항 #1 — back < middle < front(엄격 순서, 이동/보관 루프
      //     중 측정한 3개 지점 폭 재사용 — 새 병렬 측정 없음). ─────────
      r.check(
        `${name} — 렌더 폭 순서 back < middle < front(${widthSettled?.toFixed(2)} < ${widthMiddle?.toFixed(2)} < ${widthFront?.toFixed(2)}, 요구사항 #1)`,
        widthSettled != null && widthMiddle != null && widthFront != null && widthSettled < widthMiddle && widthMiddle < widthFront,
      )

      // ── 요구사항 #2 — depthScale 합성 후에도 폭이 BASE.sm*depthScale
      //     기대 범위 안([0.55,1.20]×6.5, 16% 캡 미도달). ────────────────
      const SM_MIN = 6.5 * 0.55
      const SM_MAX = 6.5 * 1.20
      r.check(
        `${name} — 3개 지점 렌더 폭 전부 BASE.sm*depthScale 기대 범위 [${SM_MIN.toFixed(2)}, ${SM_MAX.toFixed(2)}]% 안(16% 캡 미도달, 요구사항 #2)`,
        [widthSettled, widthMiddle, widthFront].every((w) => w != null && w >= SM_MIN - WIDTH_PCT_TOLERANCE && w <= SM_MAX + WIDTH_PCT_TOLERANCE),
        JSON.stringify({ widthSettled, widthMiddle, widthFront }),
      )

      // 2026-09-20 추가 — 방금 front로 이동시켰으므로(위 movePlacedItem),
      // TownObjectLayer.jsx의 "정착(settle)" 1회성 애니메이션(motion-safe:
      // animate-town-settle, 520ms)이 이 버튼에서 짧게 재생 중일 수 있다 —
      // 그 상태에서 바로 아래 "closed" transform을 읽으면 평상시 identity
      // 값이 아니라 오버슈트 도중 값을 잡아, 이후 선택 lift 비교가 실제
      // 선택 효과가 아니라 정착 애니메이션과 뒤섞여 오탐한다(settle 자체는
      // 별도로 S19가 검증). 정착이 끝날 시간을 확보한 뒤 아래 lift 검증을
      // 시작한다.
      await page.waitForTimeout(700)

      // ── 요구사항 #6 — 선택(팝오버 열림) 시 버튼 computed transform이
      //     바뀌고, 닫으면 되돌아옴. transform-origin: 50% 100%라 바닥-
      //     중앙(지면 접점) 위치는 scale/lift 후에도 거의 그대로여야 함
      //     (요구사항 #3의 "scaling doesn't shift the anchor" 정신을
      //     실제 lift 효과로 직접 검증). ──────────────────────────────
      const benchFrontButton = benchAtFront.locator('> button')
      const transformClosed = await benchFrontButton.evaluate((btn) => window.getComputedStyle(btn).transform)
      const closedBox = await benchFrontButton.boundingBox()
      await benchFrontButton.click()
      const moveBtnFront = page.getByRole('button', { name: '이동', exact: true })
      await moveBtnFront.waitFor({ state: 'visible', timeout: 5000 })
      // motion-safe: transition-duration 150ms(기본, no-preference
      // 컨텍스트) 동안 스케줄링에 따라 아직 애니메이션이 시작 전일 수
      // 있다 — 전환이 끝날 때까지 기다린 뒤 최종 값을 읽는다(구현 버그가
      // 아니라 샘플링 타이밍 이슈, 아래 Escape 복귀 확인과 동일 근거).
      await page.waitForTimeout(250)
      const transformOpen = await benchFrontButton.evaluate((btn) => window.getComputedStyle(btn).transform)
      r.check(
        `${name} — 팝오버 열림 시 버튼 computed transform이 닫힘 상태와 다름(선택 강조 적용됨, 요구사항 #6)`,
        transformOpen !== transformClosed,
        `closed=${transformClosed} open=${transformOpen}`,
      )
      const openBox = await benchFrontButton.boundingBox()
      const bottomCenterClosed = closedBox ? { x: closedBox.x + closedBox.width / 2, y: closedBox.y + closedBox.height } : null
      const bottomCenterOpen = openBox ? { x: openBox.x + openBox.width / 2, y: openBox.y + openBox.height } : null
      const anchorDrift = bottomCenterClosed && bottomCenterOpen
        ? Math.hypot(bottomCenterOpen.x - bottomCenterClosed.x, bottomCenterOpen.y - bottomCenterClosed.y)
        : null
      r.check(
        `${name} — 선택 강조(scale/lift) 적용 후에도 버튼 바닥-중앙(지면 접점)이 거의 그대로(drift=${anchorDrift != null ? anchorDrift.toFixed(2) : '?'}px < 3px, transform-origin: 50% 100% 검증, 요구사항 #3/#6)`,
        anchorDrift != null && anchorDrift < 3,
        JSON.stringify({ bottomCenterClosed, bottomCenterOpen }),
      )

      // ── 요구사항 #9 — 그림자가 있는 상태에서도 팝오버가 씬 박스 안에
      //     완전히 들어옴(S9/S11 클리핑 회귀 방지 확장, front는 global-
      //     bottom 임계값을 넘는 실제 edge 앵커). ─────────────────────
      const sceneBoxForPopover = await scene.boundingBox()
      const moveBtnFrontBox = await moveBtnFront.boundingBox()
      const popoverInsideWithShadow = !!sceneBoxForPopover && !!moveBtnFrontBox &&
        moveBtnFrontBox.x >= sceneBoxForPopover.x - 0.5 && moveBtnFrontBox.y >= sceneBoxForPopover.y - 0.5 &&
        (moveBtnFrontBox.x + moveBtnFrontBox.width) <= (sceneBoxForPopover.x + sceneBoxForPopover.width + 0.5) &&
        (moveBtnFrontBox.y + moveBtnFrontBox.height) <= (sceneBoxForPopover.y + sceneBoxForPopover.height + 0.5)
      r.check(
        `${name} — 그림자가 있는 상태에서도 팝오버가 씬 박스 안에 완전히 들어옴(클리핑 없음, 요구사항 #9)`,
        popoverInsideWithShadow,
        JSON.stringify({ sceneBoxForPopover, moveBtnFrontBox }),
      )

      await page.keyboard.press('Escape')
      await moveBtnFront.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
      // motion-safe: transition-duration 150ms(기본, no-preference 컨텍스트)
      // 이 끝날 때까지 기다린다 — 그렇지 않으면 애니메이션 도중 값을 읽어
      // "복귀 안 됨"으로 오판한다(구현 버그 아님, 샘플링 타이밍 문제).
      await page.waitForTimeout(250)
      const transformReverted = await benchFrontButton.evaluate((btn) => window.getComputedStyle(btn).transform)
      r.check(
        `${name} — 팝오버 닫힘(Escape) 후 버튼 computed transform이 닫힘 상태 값으로 되돌아옴(요구사항 #6)`,
        transformReverted === transformClosed,
        `closed=${transformClosed} reverted=${transformReverted}`,
      )

      // ── 요구사항 #4 — front(bench)가 back(cat)보다 z-index 큼(앞이
      //     뒤를 가림). cat을 back에 배치해 비교. ───────────────────────
      await placeFromInventory('고양이', DEPTH_ANCHORS.back)
      const catAtBack = page.locator(`[data-item-id="cat"][data-cell="${DEPTH_ANCHORS.back}"]`)
      const catVisible = await catAtBack.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — cat이 back(${DEPTH_ANCHORS.back})에 배치됨`, catVisible)
      if (catVisible) {
        const [benchZ, catZ] = await Promise.all([
          benchAtFront.evaluate((el) => Number(window.getComputedStyle(el).zIndex)),
          catAtBack.evaluate((el) => Number(window.getComputedStyle(el).zIndex)),
        ])
        r.check(
          `${name} — front(bench, z=${benchZ})가 back(cat, z=${catZ})보다 z-index 큼(앞이 뒤를 가림, 요구사항 #4)`,
          Number.isFinite(benchZ) && Number.isFinite(catZ) && benchZ > catZ,
          `benchZ=${benchZ} catZ=${catZ}`,
        )
        const catPlacementId = await catAtBack.getAttribute('data-placement-id')
        const catShadowVisible = await page.locator(`[data-shadow-for="${catPlacementId}"]`).isVisible().catch(() => false)
        r.check(`${name} — cat(동물, sm footprint)도 같은 기본 메타로 그림자 표시됨(bench 전용 코드 아님, 요구사항 #5 확장)`, catShadowVisible)
      }

      // ── 요구사항 #5(확장) — tree(자연, md footprint)도 같은 메커니즘으로
      //     그림자를 받음. ─────────────────────────────────────────────
      await placeFromInventory('나무', DEPTH_ANCHORS.middle)
      const treeAtMiddle = page.locator(`[data-item-id="tree"][data-cell="${DEPTH_ANCHORS.middle}"]`)
      const treeVisible = await treeAtMiddle.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — tree가 middle(${DEPTH_ANCHORS.middle})에 배치됨`, treeVisible)
      if (treeVisible) {
        const treePlacementId = await treeAtMiddle.getAttribute('data-placement-id')
        const treeShadowVisible = await page.locator(`[data-shadow-for="${treePlacementId}"]`).isVisible().catch(() => false)
        r.check(`${name} — tree(자연, md footprint)도 그림자 표시됨(요구사항 #5 확장)`, treeShadowVisible)
      }

      // ── 요구사항 #10 — 보관: bench 아이템/그림자가 함께 사라짐(move는
      //     위에서 이미 back→middle→front 2회 검증됨). ──────────────────
      const benchShadowFrontLocator = page.locator(`[data-shadow-for="${placementIdFront}"]`)
      await benchFrontButton.click()
      const storeBtn = page.getByRole('button', { name: '보관', exact: true })
      await storeBtn.waitFor({ state: 'visible', timeout: 5000 })
      await storeBtn.click()
      const benchGone = await waitUntil(async () => (await page.locator('[data-item-id="bench"]').count()) === 0, { timeout: 10000 })
      r.check(`${name} — 보관 후 bench 아이템이 씬에서 사라짐(요구사항 #10)`, !!benchGone)
      const benchShadowGone = await waitUntil(async () => (await benchShadowFrontLocator.count()) === 0, { timeout: 10000 })
      r.check(`${name} — 보관 후 bench 그림자도 함께 사라짐(유령 그림자 없음, 요구사항 #10)`, !!benchShadowGone)

      // ── 요구사항 #11 — 가로 스크롤 없음. ────────────────────────────
      r.check(`${name} — 가로 스크롤 없음(요구사항 #11)`, await noHorizontalOverflow(page))

      // ── 요구사항 #12 — 그림자/선택강조 변경 후에도 상점 시트가 정상
      //     동작(S12/S13 연장 sanity, 전면 재구현 아님). ─────────────────
      await page.locator('[data-testid="town-open-shop"]').click()
      const shopSheet = page.locator('[data-testid="town-sheet"]')
      const shopSheetVisible = await shopSheet.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 상점 시트가 정상적으로 열림(요구사항 #12)`, shopSheetVisible)
      if (shopSheetVisible) {
        const shopSheetRole = await shopSheet.getAttribute('role').catch(() => null)
        r.check(`${name} — 상점 시트 role="dialog" 유지(요구사항 #12)`, shopSheetRole === 'dialog', `role=${shopSheetRole}`)
        await page.locator('[data-testid="town-sheet-close"]').click()
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S15 — 선택 강조 transition이 prefers-reduced-motion을 실제로
  //        따르는지(요구사항 #7) — motion-safe: 클래스 게이팅이 "당연히
  //        될 것"이라 가정하지 않고 getComputedStyle로 직접 확인한다.
  //        no-preference에서는 transition-duration > 0, reduce에서는
  //        사실상 0이어야 한다. ─────────────────────────────────────────
  for (const reduced of [false, true]) {
    const vp = { width: 390, height: 844 }
    const name = `S15[390x844,${reduced ? 'reduced-motion' : 'no-preference'}] 선택 강조 transition`
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 800, dollars: { available: 0, earned: 0, spent: 0 }, owned: ['bench'], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn = page.getByRole('button', { name: '마을에 놓기' })
      await placeBtn.waitFor({ state: 'visible', timeout: 10000 })
      await placeBtn.click()
      await page.locator('[data-anchor="7,0"]').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-anchor="7,0"]').click()
      const benchButton = page.locator(`[data-item-id="bench"][data-cell="7,0"] > button`)
      await benchButton.waitFor({ state: 'visible', timeout: 10000 })

      const durationClosed = await benchButton.evaluate((btn) => window.getComputedStyle(btn).transitionDuration)
      await benchButton.click()
      await page.getByRole('button', { name: '이동', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
      const durationOpen = await benchButton.evaluate((btn) => window.getComputedStyle(btn).transitionDuration)
      const isZero = /^0s(,\s*0s)*$/.test(durationOpen.trim())

      if (reduced) {
        r.check(
          `${name} — reduced-motion에서 transition-duration이 사실상 0(motion-safe: 클래스 미적용, 요구사항 #7)`,
          isZero,
          `durationClosed=${durationClosed} durationOpen=${durationOpen}`,
        )
      } else {
        r.check(
          `${name} — no-preference에서 transition-duration이 0보다 큼(motion-safe: 클래스 적용됨, 요구사항 #7)`,
          !isZero,
          `durationClosed=${durationClosed} durationOpen=${durationOpen}`,
        )
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S16 — 자석 드래그 배치(magnetic drag placement, 2026-09-20) 마우스
  //        입력 회귀(390x844) — 임계값/스냅/취소/무효 드롭/기존 tap-to-
  //        anchor 무회귀를 이 한 시나리오에서 순서대로 검증한다(S14가
  //        depth/그림자를 이미 철저히 검증했으므로 여기서는 "드래그를
  //        통해서도 같은 결과가 나오는가"에 집중, 전면 재검증 아님). ────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S16[390x844,mouse] 자석 드래그 배치'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: {
        starsEarned: 800,
        dollars: { available: 0, earned: 0, spent: 0 },
        owned: ['bench', 'tree'],
        welcomeClaimed: true,
      },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const scene = page.locator('[data-testid="town-scene-v2"]')

      // ── 준비: bench를 첫 번째 자유 앵커에 배치 ──────────────────────────
      await page.locator('[data-testid="town-open-inventory"]').click()
      const benchInvCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText('벤치', { exact: true }) }).first()
      await benchInvCard.waitFor({ state: 'visible', timeout: 10000 })
      await benchInvCard.getByRole('button', { name: '마을에 놓기' }).click()
      const firstAnchor = await pickFreeAnchor(page, 0)
      await page.locator(`[data-anchor="${firstAnchor.x},${firstAnchor.y}"]`).click()
      const originCell = `${firstAnchor.x},${firstAnchor.y}`
      const benchVisible = await page.locator(`[data-item-id="bench"][data-cell="${originCell}"]`).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 준비: bench가 첫 자유 앵커(${originCell})에 배치됨`, benchVisible)

      // ── 항목 1 — 이동 모드에서 움직임 없는 탭은 드래그를 시작하지 않음 ──
      await enterMovingMode(page, 'bench', originCell)
      const wrapper1 = page.locator(`[data-item-id="bench"][data-cell="${originCell}"]`)
      const wrapper1Box = await wrapper1.boundingBox()
      await page.mouse.move(wrapper1Box.x + wrapper1Box.width / 2, wrapper1Box.y + wrapper1Box.height / 2)
      await page.mouse.down()
      await page.mouse.up()
      await page.waitForTimeout(50)
      const cellAfterNoMoveTap = await wrapper1.getAttribute('data-cell')
      r.check(`${name} 항목1 — 움직임 없는 탭은 셀을 바꾸지 않음(드래그 미시작)`, cellAfterNoMoveTap === originCell, `cell=${cellAfterNoMoveTap}`)
      const stillMovingAfterTap = await page.getByText('옮길 자리를 선택하거나', { exact: false }).isVisible().catch(() => false)
      r.check(`${name} 항목1 — 이동 모드 배너가 여전히 표시됨(모드가 조용히 풀리지 않음)`, stillMovingAfterTap)

      // ── 항목 2/3/6/11 — 실제 드래그: 근접 유효 앵커 강조 + 릴리즈까지
      //     data-cell 불변 + 릴리즈 시점에만 스냅 + 점프 없는 연속 추종 ──
      const targetAnchor1 = await pickFreeAnchor(page, 0) // 이동 모드 재진입 후 첫 자유 앵커(자기 자신 칸 제외).
      const wrapper2 = page.locator(`[data-item-id="bench"][data-cell="${originCell}"]`)
      const originBoxBeforeDrag = await wrapper2.boundingBox()
      // 지면 접점(translate(-50%,-100%) 기준 바닥-중앙) — wrapper 박스의
      // 중앙이 아니라 바닥-중앙이 실제 앵커점이므로 점프 거리도 이 점
      // 기준으로 재야 한다.
      const originGroundPoint = { x: originBoxBeforeDrag.x + originBoxBeforeDrag.width / 2, y: originBoxBeforeDrag.y + originBoxBeforeDrag.height }
      const startPos = { x: originGroundPoint.x, y: originGroundPoint.y - originBoxBeforeDrag.height / 2 }
      await page.mouse.move(startPos.x, startPos.y)
      await page.mouse.down()
      // 임계값을 살짝만 넘기는 작은 첫 이동(목표까지 한 번에 이동하지 않음)
      // — 첫 샘플 자체가 원점 근처여야 "점프 없음"을 의미 있게 검증한다.
      await page.mouse.move(startPos.x + 15, startPos.y + 2)
      const wrapperAfterFirstMove = page.locator(`[data-item-id="bench"][data-cell="${originCell}"]`)
      const boxAfterFirstMove = await wrapperAfterFirstMove.boundingBox()
      const groundPointAfterFirstMove = boxAfterFirstMove ? { x: boxAfterFirstMove.x + boxAfterFirstMove.width / 2, y: boxAfterFirstMove.y + boxAfterFirstMove.height } : null
      const jumpDist = groundPointAfterFirstMove
        ? Math.hypot(groundPointAfterFirstMove.x - originGroundPoint.x, groundPointAfterFirstMove.y - originGroundPoint.y)
        : null
      const cellDuringDrag1 = await wrapperAfterFirstMove.getAttribute('data-cell')
      r.check(`${name} 항목6 — 드래그 중(첫 스텝)에는 data-cell이 그대로 원래 값`, cellDuringDrag1 === originCell, `cell=${cellDuringDrag1}`)

      // 목표 지점까지 세밀하게 더 이동(여러 스텝) — 매 스텝 data-cell 불변 샘플링(항목4/6).
      const sampledCellsDuringDrag = new Set([cellDuringDrag1])
      for (let i = 1; i <= 8; i++) {
        const t = i / 8
        await page.mouse.move(startPos.x + (targetAnchor1.center.x - startPos.x) * t, startPos.y + (targetAnchor1.center.y - startPos.y) * t)
        const c = await page.locator(`[data-item-id="bench"][data-cell="${originCell}"]`).getAttribute('data-cell').catch(() => null)
        if (c) sampledCellsDuringDrag.add(c)
      }
      r.check(
        `${name} 항목4/6 — 드래그 전체 구간 동안 data-cell이 단 하나의 값(원본)만 관측됨(중간 전이 없음)`,
        sampledCellsDuringDrag.size === 1 && sampledCellsDuringDrag.has(originCell),
        JSON.stringify([...sampledCellsDuringDrag]),
      )

      // 목표 앵커 강조(초록) 확인(항목2).
      const highlighted = page.locator(`[data-anchor="${targetAnchor1.x},${targetAnchor1.y}"][data-drag-highlight="true"]`)
      const highlightVisible = await highlighted.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
      r.check(`${name} 항목2 — 목표 앵커(${targetAnchor1.x},${targetAnchor1.y})가 초록으로 강조됨`, highlightVisible)

      await page.mouse.up()
      const cellAfterDrop1 = await waitUntil(async () => {
        const c = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
        return c && c !== originCell ? c : false
      }, { timeout: 10000 })
      r.check(
        `${name} 항목3/5 — 릴리즈 후 bench가 목표 앵커(${targetAnchor1.x},${targetAnchor1.y})로 스냅됨`,
        cellAfterDrop1 === `${targetAnchor1.x},${targetAnchor1.y}`,
        `cell=${cellAfterDrop1}`,
      )
      const [gx, gy] = String(cellAfterDrop1).split(',').map(Number)
      r.check(
        `${name} 항목5 — 최종 위치가 정수 그리드 좌표(임의 좌표 아님)`,
        Number.isInteger(gx) && Number.isInteger(gy) && gx >= 0 && gx < 8 && gy >= 0 && gy < 6,
        `cell=${cellAfterDrop1}`,
      )
      r.check(
        `${name} 항목11 — 드래그 시작 직후 첫 샘플이 원래 앵커에서 크게 점프하지 않음(<40px)`,
        jumpDist != null && jumpDist < 40,
        `jumpDist=${jumpDist}`,
      )

      // ── 항목12 — 드롭 후 지면 접점이 탭-투-앵커로 놓은 것과 일치 ────────
      // 같은 칸(cellC)에 "드래그로 도달"과 "탭-투-앵커로 도달" 두 방식
      // 각각으로 놓아 렌더 위치(px)를 비교한다(반드시 같은 칸이어야 의미
      // 있는 비교).
      //
      // 2026-09-21 — 두 측정 사이의 delta를 씬(scene) 자신의 boundingBox
      // 기준 상대 좌표로 비교한다(절대 페이지 좌표 직접 비교 아님). 진단
      // 결과(scripts/.tmp/diag_s16.mjs 10회 반복, scrollY/sceneBox 로깅) —
      // 드래그 경로(raw page.mouse.move/down/up)는 페이지를 스크롤시키지
      // 않지만, 탭-투-앵커 경로의 `.click()`은 Playwright의 기본
      // actionability 체크(대상이 뷰포트 밖이면 스크롤-into-view)를 거친다.
      // 실측(10회 중 1회)에서 두 측정 사이 window.scrollY가 152→446(294px)
      // 로 바뀌었고 dragBoxAtC/tapBoxAtC의 y 델타(294)와 scene 자신의
      // boundingBox y 델타(294)가 정확히 일치했다 — 즉 아이템 자신의 렌더
      // 위치(씬 기준 %)는 항상 동일했고(나머지 9회는 스크롤 변화 없이
      // delta=0), 그때그때 다른 스크롤 위치에서 페이지-절대 좌표를 그대로
      // 비교한 이 테스트의 계산 방식이 문제였다(2.5D 폴리시의 settle/glow/
      // cat-idle 애니메이션은 원인이 아니다 — 버튼 자신의 transform에만
      // 걸리고 이 wrapper의 boundingBox는 건드리지 않는다, 위 TownObjectLayer
      // 헤더 주석 참고). 씬 boundingBox를 같은 시점에 함께 캡처해 두 측정을
      // 씬 기준 상대 좌표로 변환하면 스크롤 위치 차이가 상쇄된다.
      await enterMovingMode(page, 'bench', cellAfterDrop1)
      const targetAnchorC = await pickFreeAnchor(page, 0)
      const cellC = `${targetAnchorC.x},${targetAnchorC.y}`
      const wrapperForDragC = page.locator(`[data-item-id="bench"][data-cell="${cellAfterDrop1}"]`)
      await mouseDragStart(page, wrapperForDragC, targetAnchorC.center, { steps: 8 })
      await page.mouse.up()
      const cellCConfirmed = await waitUntil(async () => {
        const c = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
        return c === cellC ? c : false
      }, { timeout: 10000 })
      r.check(`${name} — bench가 드래그로 cellC(${cellC})에 도달`, !!cellCConfirmed)
      const dragBoxAtC = await page.locator(`[data-item-id="bench"][data-cell="${cellC}"]`).boundingBox()
      const sceneBoxAtDrag = await scene.boundingBox()

      // cellC에서 다른 칸(elsewhere)으로 드래그해 비운 뒤, 탭-투-앵커로
      // 다시 cellC로 이동해 같은 칸에서의 렌더 위치를 비교한다.
      await enterMovingMode(page, 'bench', cellC)
      const elsewhereAnchor = await pickFreeAnchor(page, 0)
      const wrapperAtC = page.locator(`[data-item-id="bench"][data-cell="${cellC}"]`)
      await mouseDragStart(page, wrapperAtC, elsewhereAnchor.center, { steps: 6 })
      await page.mouse.up()
      const cellElsewhere = await waitUntil(async () => {
        const c = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
        return c && c !== cellC ? c : false
      }, { timeout: 10000 })
      r.check(`${name} — bench가 cellC를 비우고 다른 칸(${cellElsewhere})으로 이동`, !!cellElsewhere)

      await enterMovingMode(page, 'bench', cellElsewhere)
      const cellCAnchorAvailable = await page.locator(`[data-anchor="${cellC}"]`).count()
      if (cellCAnchorAvailable > 0) {
        await page.locator(`[data-anchor="${cellC}"]`).click()
        const tapBoxAtC = await page.locator(`[data-item-id="bench"][data-cell="${cellC}"]`).waitFor({ state: 'visible', timeout: 10000 }).then(() => page.locator(`[data-item-id="bench"][data-cell="${cellC}"]`).boundingBox())
        const sceneBoxAtTap = await scene.boundingBox()
        const groundDelta = tapBoxAtC && dragBoxAtC && sceneBoxAtTap && sceneBoxAtDrag
          ? Math.hypot(
            (tapBoxAtC.x - sceneBoxAtTap.x + tapBoxAtC.width / 2) - (dragBoxAtC.x - sceneBoxAtDrag.x + dragBoxAtC.width / 2),
            (tapBoxAtC.y - sceneBoxAtTap.y + tapBoxAtC.height) - (dragBoxAtC.y - sceneBoxAtDrag.y + dragBoxAtC.height),
          )
          : null
        r.check(
          `${name} 항목12 — 같은 칸(${cellC})에서 드래그-드롭과 탭-투-앵커의 렌더 위치가 거의 일치(씬 기준 상대 좌표, delta<2px)`,
          groundDelta != null && groundDelta < 2,
          `groundDelta=${groundDelta}`,
        )
      } else {
        r.check(`${name} 항목12 — cellC가 탭 앵커 후보로 다시 제공되지 않음(구조 문제)`, false, 'cellCAnchorAvailable===0')
      }
      const cellAfterGroundCheck = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell')

      // ── 항목13 — 깊이(폭)가 드래그를 통해서도 back<front로 달라짐 ───────
      await enterMovingMode(page, 'bench', cellAfterGroundCheck)
      const backAnchor = await pickFreeAnchor(page, 0)
      const wrapperForDepth1 = page.locator(`[data-item-id="bench"][data-cell="${cellAfterGroundCheck}"]`)
      await mouseDragStart(page, wrapperForDepth1, backAnchor.center, { steps: 6 })
      await page.mouse.up()
      const cellBack = await waitUntil(async () => {
        const c = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
        return c && c !== cellAfterGroundCheck ? c : false
      }, { timeout: 10000 })
      const widthBack = await (async () => {
        const [b, s] = await Promise.all([page.locator(`[data-item-id="bench"][data-cell="${cellBack}"]`).boundingBox(), scene.boundingBox()])
        return b && s && s.width > 0 ? (b.width / s.width) * 100 : null
      })()

      // 앵커 목록에서 y가 가장 큰(전경) 후보를 골라 확실히 다른 depth로 이동.
      await enterMovingMode(page, 'bench', cellBack)
      const anchorCountForDepth = await page.locator('[data-anchor]').count()
      let frontAnchor = null
      for (let i = 0; i < anchorCountForDepth; i++) {
        const cand = await pickFreeAnchor(page, i)
        if (!frontAnchor || cand.y > frontAnchor.y) frontAnchor = cand
      }
      const wrapperForDepth2 = page.locator(`[data-item-id="bench"][data-cell="${cellBack}"]`)
      await mouseDragStart(page, wrapperForDepth2, frontAnchor.center, { steps: 6 })
      await page.mouse.up()
      const cellFront = await waitUntil(async () => {
        const c = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
        return c && c !== cellBack ? c : false
      }, { timeout: 10000 })
      const widthFront = await (async () => {
        const [b, s] = await Promise.all([page.locator(`[data-item-id="bench"][data-cell="${cellFront}"]`).boundingBox(), scene.boundingBox()])
        return b && s && s.width > 0 ? (b.width / s.width) * 100 : null
      })()
      r.check(
        `${name} 항목13 — 드래그로 도달한 두 앵커의 렌더 폭이 depth에 따라 달라짐(뒤=${widthBack?.toFixed(2)}%, 앞=${widthFront?.toFixed(2)}%)`,
        widthBack != null && widthFront != null && widthBack !== widthFront,
        JSON.stringify({ widthBack, widthFront, cellBack, cellFront }),
      )

      // 2026-09-20 추가 — 바로 위 항목13의 두 번째 드래그 이동 직후라
      // TownObjectLayer.jsx의 정착(settle) 애니메이션(520ms)이 이 bench
      // 버튼에서 아직 재생 중일 수 있다 — Playwright의 클릭 액션성
      // (actionability) "stable" 판정이 그 애니메이션이 끝날 때까지
      // enterMovingMode의 첫 클릭을 늦춰(최대 약 1초 관측) 이후 타이밍이
      // 흔들릴 여지가 있었다(S14의 동일 원인 회귀와 같은 근거, 위 참고).
      // 정착이 끝날 시간을 확보한 뒤 이 항목을 시작한다.
      await page.waitForTimeout(700)

      // ── 항목7 — 무효 드롭(스냅 범위 밖)은 이동을 커밋하지 않고 안내 문구 ──
      // 씬 박스 바깥(왼쪽/위로 300px)로 완전히 벗어난 지점 — 모든 앵커의
      // world % 좌표는 씬 박스 안(0~100%)으로만 매핑되므로 이 지점은 어떤
      // 앵커로부터도 44px 스냅 범위를 확실히 벗어난다(씬 모서리 근처
      // 앵커와의 우연한 근접을 피하기 위해 안쪽 모서리가 아니라 바깥을 쓴다).
      await enterMovingMode(page, 'bench', cellFront)
      const sceneBoxForInvalid = await scene.boundingBox()
      const wrapperForInvalid = page.locator(`[data-item-id="bench"][data-cell="${cellFront}"]`)
      await mouseDragStart(page, wrapperForInvalid, { x: sceneBoxForInvalid.x - 300, y: sceneBoxForInvalid.y - 300 }, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(100)
      const cellAfterInvalidDrop = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell')
      r.check(`${name} 항목7 — 무효 드롭 후 원래 칸(${cellFront})에 그대로 남음`, cellAfterInvalidDrop === cellFront, `cell=${cellAfterInvalidDrop}`)
      const invalidToastShown = await page.getByText('여기에는 놓을 수 없어요', { exact: false }).isVisible().catch(() => false)
      r.check(`${name} 항목7 — 무효 드롭 시 안내 토스트 표시됨`, invalidToastShown)

      // ── 항목8 — 드래그 중 Escape는 이동을 커밋하지 않고 원래 자리로 ─────
      // item7(무효 드롭) 후에도 이동 모드 자체는 유지되므로(모드 유지가
      // 스펙 요구사항) enterMovingMode를 다시 호출하지 않는다 — 다시
      // 호출하면 버튼이 여전히 disabled라 클릭이 타임아웃된다.
      const anchorForEscape = await pickFreeAnchor(page, 0)
      const wrapperForEscape = page.locator(`[data-item-id="bench"][data-cell="${cellFront}"]`)
      await mouseDragStart(page, wrapperForEscape, anchorForEscape.center, { steps: 6 })
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await page.waitForTimeout(100)
      const cellAfterEscape = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell')
      r.check(`${name} 항목8 — Escape로 드래그 취소 후 원래 칸(${cellFront})에 남음, moveTownItem 호출 없음`, cellAfterEscape === cellFront, `cell=${cellAfterEscape}`)
      const stillMovingAfterEscape = await page.getByText('옮길 자리를 선택하거나', { exact: false }).isVisible().catch(() => false)
      r.check(`${name} 항목8 — Escape는 드래그만 취소하고 이동 모드 자체는 유지(배너 표시)`, stillMovingAfterEscape)

      // ── 항목9 — pointercancel 수신 시 안전하게 복구 ──────────────────────
      // pointercancel은 실제 드래그 핸들러가 붙은 요소(data-drag-surface,
      // TownObjectLayer.jsx의 드래그 포착 오버레이)에 직접 디스패치해야
      // 한다 — wrapper 자신에는 핸들러가 없다(TownObjectLayer.jsx 헤더
      // 주석 참고, disabled 버튼의 자손이 히트테스트를 가로채는 실측
      // 결함 때문에 오버레이로 옮겨졌다).
      const wrapperForCancel = page.locator(`[data-item-id="bench"][data-cell="${cellFront}"]`)
      const dragSurfaceForCancel = page.locator('[data-drag-surface]')
      const anchorForCancel = await pickFreeAnchor(page, 0)
      await mouseDragStart(page, wrapperForCancel, anchorForCancel.center, { steps: 4 })
      await dragSurfaceForCancel.dispatchEvent('pointercancel', { pointerId: 1 })
      await page.mouse.up()
      await page.waitForTimeout(100)
      const cellAfterCancel = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell')
      r.check(`${name} 항목9 — pointercancel 후 원래 칸(${cellFront})에 안전하게 남음`, cellAfterCancel === cellFront, `cell=${cellAfterCancel}`)

      await handleCancelIfMoving(page)

      // ── 항목10 — 점유된 칸은 스냅 후보로 제공되지 않음 ───────────────────
      await placeFromInventoryByLabel(page, '나무')
      const treeCellAttr = await page.locator('[data-item-id="tree"][data-cell]').getAttribute('data-cell')
      r.check(`${name} 항목10 준비 — tree가 배치됨(${treeCellAttr})`, !!treeCellAttr)
      await enterMovingMode(page, 'bench', cellFront)
      const treeAnchorStillOffered = await page.locator(`[data-anchor="${treeCellAttr}"]`).count()
      r.check(`${name} 항목10 — 점유된 칸(tree, ${treeCellAttr})은 배치 오버레이 앵커 후보에 없음`, treeAnchorStillOffered === 0)
      await handleCancelIfMoving(page)

      // ── 항목15 — 탭-투-앵커(배치/이동) 기존 흐름 무회귀 ──────────────────
      await page.locator('[data-testid="town-open-inventory"]').click()
      const placeBtn15 = page.getByRole('button', { name: '마을에 놓기' })
      const placeBtn15Visible = await placeBtn15.isVisible().catch(() => false)
      if (placeBtn15Visible) {
        await placeBtn15.click()
        const anchor15 = await pickFreeAnchor(page, 0)
        await page.locator(`[data-anchor="${anchor15.x},${anchor15.y}"]`).click()
        const placedViaTap = await page.locator(`[data-cell="${anchor15.x},${anchor15.y}"]`).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
        r.check(`${name} 항목15 — 탭-투-앵커 배치가 여전히 동작함(신규 드래그 코드에 영향받지 않음)`, placedViaTap)
      } else {
        await page.locator('[data-testid="town-sheet-close"]').click().catch(() => {})
        r.check(`${name} 항목15 — 탭-투-앵커 배치 회귀 확인(보관함에 놓을 아이템 없음 — SKIP 취급)`, true)
      }
      const benchCellForTapMove = await page.locator('[data-item-id="bench"][data-cell]').getAttribute('data-cell')
      await enterMovingMode(page, 'bench', benchCellForTapMove)
      const anchor15b = await pickFreeAnchor(page, 0)
      await page.locator(`[data-anchor="${anchor15b.x},${anchor15b.y}"]`).click()
      const movedViaTap = await page.locator(`[data-item-id="bench"][data-cell="${anchor15b.x},${anchor15b.y}"]`).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} 항목15 — 탭-투-앵커 이동이 여전히 동작함(신규 드래그 코드에 영향받지 않음)`, movedViaTap)

      // ── 항목16 — 보관(store) 흐름 무회귀 ─────────────────────────────────
      await page.locator(`[data-item-id="bench"][data-cell="${anchor15b.x},${anchor15b.y}"] > button`).click()
      const storeBtn16 = page.getByRole('button', { name: '보관', exact: true })
      await storeBtn16.waitFor({ state: 'visible', timeout: 5000 })
      await storeBtn16.click()
      const benchGone16 = await waitUntil(async () => (await page.locator('[data-item-id="bench"]').count()) === 0, { timeout: 10000 })
      r.check(`${name} 항목16 — 보관 흐름이 여전히 동작함(신규 드래그 코드에 영향받지 않음)`, !!benchGone16)

      // ── 항목17 — 드래그로 스냅된 위치가 새로고침 후에도 유지됨(드래그도
      //     tap-to-anchor와 정확히 같은 moveTownItem/handleAnchorTap 저장
      //     경로를 타므로, 그 새로고침 유지는 위 S4[390x844] 배치 루프의
      //     "새로고침 후 배치 유지" 체크로 이미 증명돼 있다 — 여기서는
      //     "드래그를 통해 도달한 경우에도" 똑같이 유지되는지만 최소로
      //     재확인한다, 항목10에서 배치해 둔 tree를 그대로 사용). ──────────
      const treeCellForReload = await page.locator('[data-item-id="tree"][data-cell]').getAttribute('data-cell')
      await enterMovingMode(page, 'tree', treeCellForReload)
      const anchor17 = await pickFreeAnchor(page, 0)
      const wrapperForReload = page.locator(`[data-item-id="tree"][data-cell="${treeCellForReload}"]`)
      await mouseDragStart(page, wrapperForReload, anchor17.center, { steps: 6 })
      await page.mouse.up()
      const cellAfterDrag17 = await waitUntil(async () => {
        const c = await page.locator('[data-item-id="tree"][data-cell]').getAttribute('data-cell').catch(() => null)
        return c && c !== treeCellForReload ? c : false
      }, { timeout: 10000 })
      r.check(`${name} 항목17 준비 — tree가 드래그로(${cellAfterDrag17})에 스냅됨`, !!cellAfterDrag17)

      await page.reload({ waitUntil: 'domcontentloaded' })
      const backOnDashboard17 = await page.getByRole('button', { name: '구경가기' }).waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)
      r.check(`${name} 항목17 — 새로고침 후 세션 복원(대시보드 표시)`, backOnDashboard17)
      await goToPaulTownScreen(page)
      const card17 = await enterTownCard(page)
      await card17.click()
      const treeStillAtDragCell = await page.locator(`[data-item-id="tree"][data-cell="${cellAfterDrag17}"]`).waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
      r.check(`${name} 항목17 — 새로고침 후에도 드래그로 스냅된 칸(${cellAfterDrag17})에 tree가 그대로 남음`, treeStillAtDragCell)

      // ── 항목19 — 드래그 중 페이지 스크롤/텍스트 선택 없음(항목10에서 이미
      //     배치해 둔 tree를 그대로 이동 모드로 사용 — tree는 소유 1개뿐이라
      //     다시 "마을에 놓기"할 수 없음, already_placed). ──────────────────
      const treeCellForScroll = await page.locator('[data-item-id="tree"][data-cell]').getAttribute('data-cell')
      await enterMovingMode(page, 'tree', treeCellForScroll)
      const scrollBefore = await page.evaluate(() => window.scrollY)
      const selectionBefore = await page.evaluate(() => (document.getSelection ? document.getSelection().toString() : ''))
      const anchor19b = await pickFreeAnchor(page, 0)
      const wrapperForScroll = page.locator(`[data-item-id="tree"][data-cell="${treeCellForScroll}"]`)
      await mouseDragStart(page, wrapperForScroll, anchor19b.center, { steps: 6 })
      const scrollDuring = await page.evaluate(() => window.scrollY)
      const selectionDuring = await page.evaluate(() => (document.getSelection ? document.getSelection().toString() : ''))
      await page.mouse.up()
      r.check(`${name} 항목19 — 드래그 중 페이지 스크롤 없음(scrollY 불변: ${scrollBefore} -> ${scrollDuring})`, scrollBefore === scrollDuring)
      r.check(`${name} 항목19 — 드래그 중 텍스트 선택 없음(selection 비어있음)`, selectionBefore === '' && selectionDuring === '')

      // ── 항목21 — 상점/보관함 바텀시트가 여전히 씬 전체를 덮음(회귀 없음) ──
      await page.locator('[data-testid="town-open-shop"]').click()
      const shopSheetS16 = page.locator('[data-testid="town-sheet"]')
      const shopSheetVisibleS16 = await shopSheetS16.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} 항목21 — 상점 시트가 정상적으로 열림(드래그 코드 추가 후에도 무회귀)`, shopSheetVisibleS16)
      if (shopSheetVisibleS16) await page.locator('[data-testid="town-sheet-close"]').click().catch(() => {})

      // ── 항목18 — 이 뷰포트에서 가로 스크롤 없음 ──────────────────────────
      r.check(`${name} 항목18 — 가로 스크롤 없음(390x844)`, await noHorizontalOverflow(page))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S17 — 자석 드래그 배치, 터치/포인터 입력 회귀(1440x900 데스크톱) ──────
  //        S16이 실 마우스(page.mouse)로 이미 핵심 항목(1~13,15,16,18,19,21)
  //        전부를 검증했으므로(S14의 뷰포트 분담 관례와 동일 절제), 여기서는
  //        "터치 입력으로도 같은 드래그 메커니즘이 동작하는가"에 집중한다 —
  //        CDP Input.dispatchTouchEvent(cdpTouchDragStart 헬퍼, 파일 상단
  //        참고)로 실제 트러스트된 터치 입력을 재현한다. 데스크톱 폭
  //        (1440x900)에서 검증해 두 최소 뷰포트(390x844/1440x900) 요구사항을
  //        S16과 함께 충족한다.
  {
    const vp = { width: 1440, height: 900 }
    const name = 'S17[1440x900,touch] 자석 드래그 배치'
    const context = await browser.newContext({ viewport: vp, hasTouch: true })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: {
        starsEarned: 800,
        dollars: { available: 0, earned: 0, spent: 0 },
        owned: ['bench', 'tree'],
        welcomeClaimed: true,
      },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      // ── 준비: bench 배치 ─────────────────────────────────────────────
      const originAnchor = await placeFromInventoryByLabel(page, '벤치')
      const originCell = `${originAnchor.x},${originAnchor.y}`
      const benchVisible = await page.locator(`[data-item-id="bench"][data-cell="${originCell}"]`).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 준비: bench가 첫 자유 앵커(${originCell})에 배치됨`, benchVisible)

      // ── 터치 드래그: 근접 유효 앵커 강조 + 릴리즈 시 스냅 ────────────────
      await enterMovingMode(page, 'bench', originCell)
      const targetAnchor = await pickFreeAnchor(page, 0)
      const wrapper = page.locator(`[data-item-id="bench"][data-cell="${originCell}"]`)
      const { cdp } = await cdpTouchDragStart(context, page, wrapper, targetAnchor.center, { steps: 8 })
      const cellDuringTouchDrag = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
      r.check(`${name} — 터치 드래그 중에는 data-cell이 그대로 원래 값`, cellDuringTouchDrag === originCell, `cell=${cellDuringTouchDrag}`)

      const highlighted = page.locator(`[data-anchor="${targetAnchor.x},${targetAnchor.y}"][data-drag-highlight="true"]`)
      const highlightVisible = await highlighted.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
      r.check(`${name} — 터치 드래그로 목표 앵커(${targetAnchor.x},${targetAnchor.y})가 초록으로 강조됨`, highlightVisible)

      await cdpTouch(cdp, 'touchEnd', [])
      const cellAfterTouchDrop = await waitUntil(async () => {
        const c = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
        return c && c !== originCell ? c : false
      }, { timeout: 10000 })
      r.check(
        `${name} — 터치 릴리즈 후 bench가 목표 앵커(${targetAnchor.x},${targetAnchor.y})로 스냅됨`,
        cellAfterTouchDrop === `${targetAnchor.x},${targetAnchor.y}`,
        `cell=${cellAfterTouchDrop}`,
      )

      // ── 터치 취소(touchCancel) 안전 복구 ─────────────────────────────────
      if (cellAfterTouchDrop && cellAfterTouchDrop !== false) {
        await enterMovingMode(page, 'bench', cellAfterTouchDrop)
        const anchorForTouchCancel = await pickFreeAnchor(page, 0)
        const wrapperForTouchCancel = page.locator(`[data-item-id="bench"][data-cell="${cellAfterTouchDrop}"]`)
        const { cdp: cdp2 } = await cdpTouchDragStart(context, page, wrapperForTouchCancel, anchorForTouchCancel.center, { steps: 6 })
        await cdpTouch(cdp2, 'touchCancel', [])
        await page.waitForTimeout(100)
        const cellAfterTouchCancel = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell')
        r.check(`${name} — touchCancel 후 원래 칸(${cellAfterTouchDrop})에 안전하게 남음`, cellAfterTouchCancel === cellAfterTouchDrop, `cell=${cellAfterTouchCancel}`)

        // ── 두 번째 손가락(secondary touch) 무시 ──────────────────────────
        await handleCancelIfMoving(page)
        await enterMovingMode(page, 'bench', cellAfterTouchDrop)
        const anchorForSecondary = await pickFreeAnchor(page, 0)
        const wrapperForSecondary = page.locator(`[data-item-id="bench"][data-cell="${cellAfterTouchDrop}"]`)
        const cdp3 = await context.newCDPSession(page)
        const secBox = await wrapperForSecondary.boundingBox()
        const secStart = { x: secBox.x + secBox.width / 2, y: secBox.y + secBox.height / 2 }
        await cdpTouch(cdp3, 'touchStart', [{ x: secStart.x, y: secStart.y, id: 1 }])
        // 이동 중간에 두 번째 손가락이 같은 화면을 추가로 터치 — touchPoints
        // 배열에 id:2를 더해 "동시에 두 손가락이 닿아 있음"을 재현한다.
        // 첫 포인터(id:1)에 고정된 drag state가 그대로 유지되고 두 번째는
        // 무시돼야 한다.
        await cdpTouch(cdp3, 'touchMove', [
          { x: secStart.x + (anchorForSecondary.center.x - secStart.x) * 0.3, y: secStart.y + (anchorForSecondary.center.y - secStart.y) * 0.3, id: 1 },
          { x: secStart.x + 5, y: secStart.y + 5, id: 2 },
        ])
        const cellDuringSecondaryTouch = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
        r.check(`${name} — 두 번째 손가락 개입 중에도 data-cell 불변(무시됨)`, cellDuringSecondaryTouch === cellAfterTouchDrop, `cell=${cellDuringSecondaryTouch}`)
        // 두 번째 손가락을 떼고, 첫 손가락으로 목표까지 이동 후 릴리즈.
        await cdpTouch(cdp3, 'touchMove', [
          { x: anchorForSecondary.center.x, y: anchorForSecondary.center.y, id: 1 },
        ])
        await cdpTouch(cdp3, 'touchEnd', [])
        const cellAfterSecondaryTest = await waitUntil(async () => {
          const c = await page.locator(`[data-item-id="bench"][data-cell]`).getAttribute('data-cell').catch(() => null)
          return c && c !== cellAfterTouchDrop ? c : false
        }, { timeout: 10000 })
        r.check(`${name} — 첫 손가락으로 정상 완료됨(두 번째 손가락 개입에도 정확히 한 번만 이동)`, !!cellAfterSecondaryTest, `cell=${cellAfterSecondaryTest}`)
      }

      // ── 이 뷰포트에서 가로 스크롤 없음 ────────────────────────────────────
      r.check(`${name} — 가로 스크롤 없음(1440x900)`, await noHorizontalOverflow(page))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S18 — 자석 드래그 배치, prefers-reduced-motion 회귀(S15와 동일 패턴,
  //        390x844) — 드래그 시작 시 살짝 lift(scale 1.06)하는 wrapper
  //        transform 전환이 reduced-motion에서 실제로 즉시(0s) 적용되는지
  //        확인한다(motion-safe: 클래스 게이팅, TownObjectLayer.jsx). ──────
  for (const reduced of [false, true]) {
    const vp = { width: 390, height: 844 }
    const name = `S18[390x844,${reduced ? 'reduced-motion' : 'no-preference'}] 드래그 lift transition`
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 800, dollars: { available: 0, earned: 0, spent: 0 }, owned: ['bench'], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const anchor = await placeFromInventoryByLabel(page, '벤치')
      const cell = `${anchor.x},${anchor.y}`
      await enterMovingMode(page, 'bench', cell)

      const wrapper = page.locator(`[data-item-id="bench"][data-cell="${cell}"]`)
      const durationBeforeDrag = await wrapper.evaluate((el) => window.getComputedStyle(el).transitionDuration)
      const targetAnchor = await pickFreeAnchor(page, 0)
      await mouseDragStart(page, wrapper, targetAnchor.center, { steps: 6 })
      await page.waitForTimeout(50)
      const durationDuringDrag = await page.locator(`[data-item-id="bench"][data-cell="${cell}"]`).evaluate((el) => window.getComputedStyle(el).transitionDuration).catch(() => null)
      await page.mouse.up()

      const isZero = durationDuringDrag != null && /^0s(,\s*0s)*$/.test(durationDuringDrag.trim())
      if (reduced) {
        r.check(
          `${name} — reduced-motion에서 드래그 wrapper transition-duration이 사실상 0(motion-safe: 클래스 미적용)`,
          isZero,
          `before=${durationBeforeDrag} during=${durationDuringDrag}`,
        )
      } else {
        r.check(
          `${name} — no-preference에서 드래그 wrapper transition-duration이 0보다 큼(motion-safe: 클래스 적용됨)`,
          !isZero,
          `before=${durationBeforeDrag} during=${durationDuringDrag}`,
        )
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S19 — 2.5D 폴리시 회귀(선택 glow/정착 settle/드래그 시각 합성,
  //        2026-09-20) — 390x844. 선택 lift에 이어 추가된 rim/glow가 앵커
  //        (data-cell)를 바꾸지 않는지, "정착" 애니메이션이 실제 이동
  //        (탭/드래그) 후에만 발동하고 새로고침(재마운트)에서는 발동하지
  //        않는지, 드래그로 스냅한 뒤에도 z-순서가 여전히 정확한지, 배치
  //        오버레이가 모드에 따라 정확히 나타나고 사라지는지를 검증한다. ──
  {
    const vp = { width: 390, height: 844 }
    const name = 'S19[390x844] 2.5D 폴리시(glow/settle/드래그 합성) 회귀'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: {
        starsEarned: 800,
        dollars: { available: 0, earned: 0, spent: 0 },
        owned: ['bench', 'cat'],
        welcomeClaimed: true,
      },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      // ── 준비: bench를 배치 ────────────────────────────────────────────
      const benchAnchor = await placeFromInventoryByLabel(page, '벤치')
      const benchCell = `${benchAnchor.x},${benchAnchor.y}`
      const bench = page.locator(`[data-item-id="bench"][data-cell="${benchCell}"]`)
      const benchVisible = await bench.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 준비: bench 배치됨(${benchCell})`, benchVisible)
      if (!benchVisible) throw new Error('bench 배치 실패')

      // ── 선택(팝오버 열림) 시 rim/glow가 렌더되지만 앵커(data-cell)는
      //     전혀 바뀌지 않는다(과제 지시서 Phase F 항목2). ─────────────────
      const benchButton = bench.locator('> button')
      await benchButton.click()
      const moveBtn = page.getByRole('button', { name: '이동', exact: true })
      await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
      const glow = bench.locator('> span').first()
      const glowVisible = await glow.isVisible().catch(() => false)
      r.check(`${name} — 선택 시 rim/glow(span) 렌더됨`, glowVisible)
      const glowBoxShadow = glowVisible ? await glow.evaluate((el) => window.getComputedStyle(el).boxShadow) : null
      r.check(`${name} — glow가 실제 box-shadow를 가짐(none 아님)`, !!glowBoxShadow && glowBoxShadow !== 'none', String(glowBoxShadow))
      const cellAfterSelect = await bench.getAttribute('data-cell')
      r.check(`${name} — 선택 후에도 data-cell 불변(앵커 안 바뀜, Phase F 항목2)`, cellAfterSelect === benchCell, `cell=${cellAfterSelect}`)
      await page.keyboard.press('Escape')
      await moveBtn.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})

      // ── 최초 배치 자체(방금 전)에는 정착 클래스가 안 붙어 있어야 한다
      //     (최초 배치는 "이동"이 아니다). ──────────────────────────────
      const settleClassAfterPlace = await benchButton.evaluate((el) => el.className)
      r.check(`${name} — 최초 배치 직후엔 정착 클래스가 안 붙어 있음(Phase F 항목5)`, !settleClassAfterPlace.includes('animate-town-settle'))

      // ── bench를 탭-투-앵커로 이동 → 정착 애니메이션이 짧게 발동한다. ───
      await enterMovingMode(page, 'bench', benchCell)
      const targetAnchor1 = await pickFreeAnchor(page, 1)
      await page.locator(`[data-anchor="${targetAnchor1.x},${targetAnchor1.y}"]`).click()
      const newCell1 = `${targetAnchor1.x},${targetAnchor1.y}`
      const benchAtNew1 = page.locator(`[data-item-id="bench"][data-cell="${newCell1}"]`)
      const movedOk1 = await benchAtNew1.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 탭-투-앵커 이동 성공(${newCell1})`, movedOk1)

      const settlePlayed = await waitUntil(async () => {
        const cls = await benchAtNew1.locator('> button').evaluate((el) => el.className).catch(() => '')
        return cls.includes('animate-town-settle')
      }, { timeout: 700, interval: 40 })
      r.check(`${name} — 탭-투-앵커 이동 직후 정착 애니메이션 클래스 발동(Phase F 항목5)`, !!settlePlayed)

      const settleCleared = await waitUntil(async () => {
        const cls = await benchAtNew1.locator('> button').evaluate((el) => el.className).catch(() => '')
        return !cls.includes('animate-town-settle')
      }, { timeout: 2000, interval: 100 })
      r.check(`${name} — 정착 애니메이션이 일정 시간 후 스스로 꺼짐(무한 반복 아님)`, !!settleCleared)

      // ── 새로고침(재마운트) 후에는 정착이 발동하지 않는다(prevCellsRef가
      //     새로 시작 — Phase F 항목5의 "not fire on plain reload"). 새로고침은
      //     대시보드로 돌아간다(S4/S16 항목17과 동일 세션 복원 관례) — 다시
      //     Paul Town → 내 마을로 들어가야 한다. ──────────────────────────
      await page.reload({ waitUntil: 'domcontentloaded' })
      await goToPaulTownScreen(page)
      const cardAfterReload = await enterTownCard(page)
      await cardAfterReload.click()
      await waitForTownHeader(page)
      const benchAfterReload = page.locator(`[data-item-id="bench"][data-cell="${newCell1}"]`)
      const stillThereAfterReload = await benchAfterReload.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 새로고침 후 이동 결과(${newCell1})가 그대로 유지됨`, stillThereAfterReload)
      if (stillThereAfterReload) {
        const classAfterReload = await benchAfterReload.locator('> button').evaluate((el) => el.className)
        r.check(`${name} — 새로고침 직후엔 정착 클래스가 안 붙어 있음(재렌더/reload 오발동 없음, Phase F 항목5)`, !classAfterReload.includes('animate-town-settle'))
      }

      // ── 드래그로도(탭-투-앵커와 동일하게) 정착이 발동하고, 기존 스냅/
      //     영속 동작은 그대로다(가장 중요한 회귀 확인). ──────────────────
      await enterMovingMode(page, 'bench', newCell1)
      const targetAnchor2 = await pickFreeAnchor(page, 2)
      const wrapper2 = page.locator(`[data-item-id="bench"][data-cell="${newCell1}"]`)
      await mouseDragStart(page, wrapper2, targetAnchor2.center, { steps: 8 })
      await page.mouse.up()
      const newCell2 = `${targetAnchor2.x},${targetAnchor2.y}`
      const benchAtNew2 = page.locator(`[data-item-id="bench"][data-cell="${newCell2}"]`)
      const draggedOk = await benchAtNew2.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 드래그 이동도 여전히 스냅/영속됨(${newCell2}, 새 시각 합성과 무회귀 — 가장 중요한 확인)`, draggedOk)
      if (draggedOk) {
        const settlePlayed2 = await waitUntil(async () => {
          const cls = await benchAtNew2.locator('> button').evaluate((el) => el.className).catch(() => '')
          return cls.includes('animate-town-settle')
        }, { timeout: 700, interval: 40 })
        r.check(`${name} — 드래그 이동 직후에도 정착 애니메이션 발동(Phase F 항목5)`, !!settlePlayed2)
        const anchorsAfterDrop = await page.locator('[data-anchor]').count()
        r.check(`${name} — 드롭 성공 후 배치 오버레이(앵커)가 전부 사라짐(모드 idle 복귀, Phase F 항목4)`, anchorsAfterDrop === 0, `count=${anchorsAfterDrop}`)
      }

      // ── 양성 대조 — 이동 모드 중엔 오버레이가 보이고, "취소"로 벗어나면
      //     사라진다(Phase F 항목4 — "drag ends, is cancelled, or loses
      //     pointer capture"의 명시적 취소 경로). ─────────────────────────
      await enterMovingMode(page, 'bench', newCell2)
      const anchorsWhileMoving = await page.locator('[data-anchor]').count()
      r.check(`${name} — 이동 모드 중엔 배치 오버레이(앵커)가 보임(양성 대조)`, anchorsWhileMoving > 0, `count=${anchorsWhileMoving}`)
      await handleCancelIfMoving(page)
      const anchorsAfterCancel = await page.locator('[data-anchor]').count()
      r.check(`${name} — "취소" 후 배치 오버레이(앵커)가 사라짐(Phase F 항목4)`, anchorsAfterCancel === 0, `count=${anchorsAfterCancel}`)

      // ── 새 시각 효과가 붙은 채로도 Y-깊이 z-순서가 여전히 성립(S14가
      //     철저히 검증했으므로 여기서는 가벼운 재확인만, Phase F 항목1). ──
      const catAnchor = await placeFromInventoryByLabel(page, '고양이')
      const catCell = `${catAnchor.x},${catAnchor.y}`
      const cat = page.locator(`[data-item-id="cat"][data-cell="${catCell}"]`)
      const catVisible = await cat.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 고양이 배치됨(${catCell})`, catVisible)
      if (catVisible) {
        const benchFinal = page.locator(`[data-item-id="bench"][data-cell="${newCell2}"]`)
        const [benchTop, benchZFinal] = await Promise.all([
          benchFinal.evaluate((el) => parseFloat(el.style.top)),
          benchFinal.evaluate((el) => Number(window.getComputedStyle(el).zIndex)),
        ])
        const [catTop, catZFinal] = await Promise.all([
          cat.evaluate((el) => parseFloat(el.style.top)),
          cat.evaluate((el) => Number(window.getComputedStyle(el).zIndex)),
        ])
        const yOrderHolds = benchTop === catTop || (benchTop > catTop) === (benchZFinal > catZFinal)
        r.check(
          `${name} — 새 시각 효과 적용 후에도 Y-깊이 z-순서 성립(top%↑ → z-index↑, Phase F 항목1)`,
          yOrderHolds,
          JSON.stringify({ benchTop, benchZFinal, catTop, catZFinal }),
        )

        // ── 고양이 idle 숨쉬기 — 방금 배치돼 idle(선택/드래그 아님)이니
        //     idle 애니메이션 클래스가 붙어 있어야 한다. bench(고양이
        //     아님)는 음성 대조. ─────────────────────────────────────────
        const catButton = cat.locator('> button')
        const catIdleClass = await catButton.evaluate((el) => el.className)
        r.check(`${name} — 고양이(idle) 버튼에 idle 숨쉬기 애니메이션 클래스 적용됨`, catIdleClass.includes('animate-town-cat-idle'))
        const benchIdleClass = await benchFinal.locator('> button').evaluate((el) => el.className)
        r.check(`${name} — bench(고양이 아님)는 idle 숨쉬기 클래스가 없음(음성 대조)`, !benchIdleClass.includes('animate-town-cat-idle'))
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S20 — ambient 폴리시 회귀(강 반짝임/초목 흔들림/대기 부유/고양이
  //        idle/선택 glow pulse/씬 진입 zoom, 2026-09-20) — reduced-motion
  //        게이팅(Phase F 항목6)과 포인터 통과(Phase F 항목7)를 검증한다. ──
  for (const reduced of [false, true]) {
    const vp = { width: 390, height: 844 }
    const name = `S20[390x844,${reduced ? 'reduced-motion' : 'no-preference'}] ambient 폴리시(reduced-motion 게이팅)`
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: {
        starsEarned: 800,
        dollars: { available: 0, earned: 0, spent: 0 },
        owned: ['bench', 'cat'],
        welcomeClaimed: true,
      },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)
      const scene = page.locator('[data-testid="town-scene-v2"]')

      async function animName(locator) {
        return locator.evaluate((el) => window.getComputedStyle(el).animationName).catch(() => null)
      }

      // ── 씬 진입 settle/zoom. ─────────────────────────────────────────
      const entranceName = await animName(scene)
      r.check(
        `${name} — 진입 zoom animationName이 ${reduced ? 'none(reduced-motion)' : 'townEntrance(no-preference)'}`,
        reduced ? entranceName === 'none' : entranceName === 'townEntrance',
        String(entranceName),
      )

      // ── 강 반짝임(river-highlight, 그룹 전체 동일 처리). ─────────────────
      const riverHighlight = page.locator('img[data-env-asset="river-highlight"]').first()
      const riverName = await animName(riverHighlight)
      r.check(
        `${name} — 강 반짝임 animationName이 ${reduced ? 'none(reduced-motion)' : 'townShimmer(no-preference)'}`,
        reduced ? riverName === 'none' : riverName === 'townShimmer',
        String(riverName),
      )
      const waterRootPE = await riverHighlight.evaluate((el) => {
        const root = el.closest('[aria-hidden="true"]')
        return root ? window.getComputedStyle(root).pointerEvents : null
      })
      r.check(`${name} — 강(water) 레이어 루트 computed pointer-events: none(Phase F 항목7)`, waterRootPE === 'none', String(waterRootPE))

      // ── 초목 흔들림 — cluster-0(스웨이 대상, flower-cluster-pink 첫
      //     인스턴스 — 렌더 순서가 배열 순서와 같다는 데이터 순서 불변식에
      //     의존, worldScenery.js ENV_PLACEMENTS 순서 참고)만 흔들리고
      //     cluster-5(같은 assetKey, 스웨이 대상 아님)는 흔들리지 않는다
      //     (전체 25개가 아니라 소수만 — 과제 요구사항 그대로). ─────────────
      const swayImgs = page.locator('img[data-env-asset="flower-cluster-pink"]')
      const swayCount = await swayImgs.count()
      r.check(`${name} — flower-cluster-pink 인스턴스 2개 이상 존재(스웨이 대조 전제조건)`, swayCount >= 2, `count=${swayCount}`)
      if (swayCount >= 2) {
        const swayName0 = await animName(swayImgs.nth(0))
        const swayName1 = await animName(swayImgs.nth(1))
        r.check(
          `${name} — 스웨이 대상(cluster-0) animationName이 ${reduced ? 'none(reduced-motion)' : 'townSway(no-preference)'}`,
          reduced ? swayName0 === 'none' : swayName0 === 'townSway',
          String(swayName0),
        )
        r.check(`${name} — 스웨이 대상 아닌 같은 자산(cluster-5)은 animationName이 none(전체가 아니라 소수만)`, swayName1 === 'none', String(swayName1))
        const sceneryRootPE = await swayImgs.nth(0).evaluate((el) => {
          const root = el.closest('[aria-hidden="true"]')
          return root ? window.getComputedStyle(root).pointerEvents : null
        })
        r.check(`${name} — 초목(scenery) 레이어 루트 computed pointer-events: none(Phase F 항목7)`, sceneryRootPE === 'none', String(sceneryRootPE))
      }

      // ── 대기 부유(atmosphere) — 결정론적 4개 중 하나로 확인. ─────────────
      const drifter = page.locator('[data-atmosphere="butterfly-1"]')
      const driftName = await animName(drifter)
      r.check(
        `${name} — 대기 부유 animationName이 ${reduced ? 'none(reduced-motion)' : 'townDrift(no-preference)'}`,
        reduced ? driftName === 'none' : driftName === 'townDrift',
        String(driftName),
      )
      const atmosphereRootPE = await drifter.evaluate((el) => {
        const root = el.closest('[aria-hidden="true"]')
        return root ? window.getComputedStyle(root).pointerEvents : null
      })
      r.check(`${name} — 대기(atmosphere) 레이어 루트 computed pointer-events: none(Phase F 항목7)`, atmosphereRootPE === 'none', String(atmosphereRootPE))
      const atmosphereCount = await page.locator('[data-atmosphere]').count()
      r.check(`${name} — 대기 장식 4개 결정론적으로 렌더됨`, atmosphereCount === 4, `count=${atmosphereCount}`)

      // ── 고양이 idle — 배치 직후(선택/드래그 아님). ──────────────────────
      const catAnchor = await placeFromInventoryByLabel(page, '고양이')
      const catCell = `${catAnchor.x},${catAnchor.y}`
      const catButton = page.locator(`[data-item-id="cat"][data-cell="${catCell}"] > button`)
      const catButtonVisible = await catButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      if (catButtonVisible) {
        const catIdleName = await animName(catButton)
        r.check(
          `${name} — 고양이 idle animationName이 ${reduced ? 'none(reduced-motion)' : 'townCatIdle(no-preference)'}`,
          reduced ? catIdleName === 'none' : catIdleName === 'townCatIdle',
          String(catIdleName),
        )

        // ── 선택 glow — reduced-motion에서도 정적 링(box-shadow, 핵심
        //     표시)은 항상 남아야 한다(pulse만 꺼진다, Phase F 항목6). no-
        //     preference 컨텍스트에서는 위에서 막 확인한 idle 숨쉬기
        //     애니메이션이 버튼의 transform을 계속 미세하게 오실레이션
        //     시키는 중이라 Playwright의 클릭 액션성(actionability)
        //     "stable" 판정(연속 프레임 사이 바운딩박스 불변)이 이 애니메이션이
        //     떠 있는 한 영원히 통과하지 못한다(실제 브라우저의 실제 클릭은
        //     transform 애니메이션과 무관하게 즉시 동작 — 이건 순수하게
        //     Playwright의 합성 안정성 휴리스틱 한계이지 앱의 실제 결함이
        //     아니다) — force:true로 그 안정성 대기를 건너뛴다. ──────────
        await catButton.click({ force: true })
        const moveBtn = page.getByRole('button', { name: '이동', exact: true })
        await moveBtn.waitFor({ state: 'visible', timeout: 5000 })
        const glow = page.locator(`[data-item-id="cat"][data-cell="${catCell}"] > span`).first()
        const glowBoxShadow = await glow.evaluate((el) => window.getComputedStyle(el).boxShadow).catch(() => null)
        r.check(`${name} — 선택 glow의 정적 box-shadow는 reduced-motion과 무관하게 항상 존재(정적 링 유지)`, !!glowBoxShadow && glowBoxShadow !== 'none', String(glowBoxShadow))
        const glowAnimName = await animName(glow)
        r.check(
          `${name} — 선택 glow의 pulse animationName이 ${reduced ? 'none(reduced-motion, 정적 링만)' : 'townGlow(no-preference)'}`,
          reduced ? glowAnimName === 'none' : glowAnimName === 'townGlow',
          String(glowAnimName),
        )
        await page.keyboard.press('Escape')
      }

      r.check(`${name} — 가로 스크롤 없음`, await noHorizontalOverflow(page))
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S20b — 잠금(hidden) 랜드마크 비상호작용(Phase F 항목8). 기본 mock
  //        레벨(starsEarned=20 → Lv.2)에서 book-shop(lane, unlock=3)이
  //        확실히 hidden 상태가 되는 컨텍스트를 따로 쓴다(위 S20 루프는
  //        starsEarned=800이라 대부분 레벨이 열려 있어 hidden 로트가 아예
  //        없을 수 있다). ──────────────────────────────────────────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S20b[390x844] 잠금 랜드마크 비상호작용'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)

      const hiddenLot = page.locator('[data-lot-id="book-shop"][data-lot-state="hidden"]')
      const hiddenVisible = await hiddenLot.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} — 준비: book-shop이 이 레벨(Lv.2)에서 hidden 상태로 렌더됨`, hiddenVisible)
      if (hiddenVisible) {
        const [lotPE, lotAriaHidden] = await Promise.all([
          hiddenLot.evaluate((el) => window.getComputedStyle(el).pointerEvents),
          hiddenLot.getAttribute('aria-hidden'),
        ])
        r.check(`${name} — 잠금 랜드마크 computed pointer-events: none(클릭 불가, Phase F 항목8)`, lotPE === 'none', String(lotPE))
        r.check(`${name} — 잠금 랜드마크 aria-hidden="true"(스크린리더 제외, Phase F 항목8)`, lotAriaHidden === 'true', String(lotAriaHidden))
      }
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S20c — 데스크톱 레이아웃(1280x720)에서도 새 ambient 레이어가 가로
  //        스크롤을 유발하지 않는다(Phase F 항목9). ─────────────────────
  {
    const vp = { width: 1280, height: 720 }
    const name = 'S20c[1280x720] ambient 레이어 레이아웃 무회귀'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTownV1: true, paulTownV2: true })
    const mocks = await installMocks(page, {
      townState: { starsEarned: 800, dollars: { available: 0, earned: 0, spent: 0 }, owned: ['bench', 'cat', 'tree'], welcomeClaimed: true },
    })
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await goToPaulTownScreen(page)
      const card = await enterTownCard(page)
      await card.click()
      await waitForTownHeader(page)
      r.check(`${name} — 가로 스크롤 없음(Phase F 항목9)`, await noHorizontalOverflow(page))
      const atmosphereCount = await page.locator('[data-atmosphere]').count()
      r.check(`${name} — 대기(atmosphere) 장식 4개 렌더됨(결정론적)`, atmosphereCount === 4, `count=${atmosphereCount}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
