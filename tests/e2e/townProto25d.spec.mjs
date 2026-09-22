// tests/e2e/townProto25d.spec.mjs
//
// Paul Town 2.5D 캐릭터 프로토타입(paulTown2_5d, Stage 1 2026-09-22 + Stage 2
// 2026-09-22 + Stage 3 2026-09-22) 회귀 — src/components/town/proto2_5d/*가
// 기존 Paul Town V1/V2와 완전히 독립된 격리 실험(공유 상태/게이팅 없음)으로
// 동작하는지 검증한다. townV2.spec.mjs와 동일한 mock 전체 가로채기
// (installMocks) + 결정론 폴링(waitUntil) 관례를 따르되, 새 파일이라 필요한
// 소규모 헬퍼는 복제한다(파일당 소유권 원칙, CLAUDE.md 규칙 16 — 다른
// spec과 동시에 같은 파일을 건드리지 않게). S1~S6은 Stage 1/2, S7은 Stage 3
// (Y-기반 스케일/depth occlusion/그림자) 전용 — 기존 S1~S6은 값 변경 없이
// 그대로 유지했다(Stage 1/2 회귀 방지, S5에는 항목12 reduced-motion 최종
// 스케일 검증만 추가).
//
// 실 Supabase/Vercel 요청 0건 — installMocks가 전체 네트워크를 가로챈다.
// 이 프로토타입 자체는 구매/저장 API를 전혀 호출하지 않으므로(마운트
// 스코프 로컬 state뿐), installMocks는 로그인/기존 화면 렌더에만 필요하다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN } from './fixtures/index.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function waitUntil(fn, { timeout = 15000, interval = 60 } = {}) {
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

// townV2.spec.mjs의 setDeviceFlags와 동일 패턴(paulEasyVoca_features
// localStorage 스냅샷에 flags만 심는다 — 나머지는 features.js의
// DEFAULT_FEATURES가 채운다).
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

// 로그인 후 대시보드가 실제로 그려질 때까지 대기(화면 전환 안정화) —
// "오늘의 학습 시작"류 CTA 대신, 이 저장소 다른 spec들이 이미 쓰는 관례와
// 달리 이 프로토타입은 screen 상태와 무관하므로 body에 로그인 폼이 사라진
// 시점만 확인하면 충분하다.
async function waitForLoggedIn(page) {
  await page.getByPlaceholder('이름 입력...').waitFor({ state: 'detached', timeout: 20000 })
}

// 터치 탭(이동 없는 touchStart -> touchEnd) — townV2.spec.mjs의 cdpTouch/
// cdpTouchDragStart와 동일한 이유(합성 PointerEvent는 React 핸들러가 받지
// 못함, CDP 신뢰 입력만 정상 수신됨, 그 파일 S17 주석 참고)로 CDP 수준
// Input.dispatchTouchEvent를 쓴다. touchMove 없이 같은 지점에서 곧바로
// touchEnd — "이동 없는 탭"을 흉내낸다(드래그 제스처 없음, Stage 1 스펙).
async function cdpTouchTap(context, page, x, y) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

function boxCenter(box) {
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null
}

// ProtoCharacter.jsx의 앵커는 transform: translate(-50%,-100%) — 즉
// boundingBox의 "중심"이 아니라 "하단-중앙"이 실제 world 좌표(left%/top%)
// 지점이다(TownCharacter.jsx와 동일 관례, bottom-center anchor). 탭 지점과
// 비교할 때는 이 앵커 지점을 써야 한다(boxCenter는 "이동량" 같은 상대
// 비교에서만 유효 — 오프셋이 두 샘플 모두에 동일하게 섞여 상쇄되므로).
function boxAnchor(box) {
  return box ? { x: box.x + box.width / 2, y: box.y + box.height } : null
}

function dist(a, b) {
  if (!a || !b) return null
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Stage 2 — walkGrid.js OBSTACLES(src/utils/town/proto2_5d/walkGrid.js)와
// 정확히 같은 좌표를 이 spec에도 그대로 옮겨왔다(import가 아니라 값
// 복제 — 이 파일은 브라우저 페이지 컨텍스트 밖 Node에서 도는 spec이라
// 소스 모듈을 직접 import하지 않는다, scripts/testTownV2Static.mjs가
// 소스를 정규식으로 재검증하듯 이 spec도 "이 숫자가 실제로 화면에 그려진
// 장애물과 일치하는지"를 DOM에서 직접 읽어 재확인한다 — 아래
// readObstacleBoxesFromDom 참고, 이 하드코딩 값은 사전조건 계산에만 쓴다).
const OBSTACLES_REF = [
  { id: 'demo-building', x0: 38, x1: 62, y0: 24, y1: 40 },
  { id: 'demo-bench', x0: 20, x1: 27, y0: 58, y1: 63 },
  { id: 'demo-tree', x0: 70, x1: 76, y0: 56, y1: 62 },
]

function pctInBox(x, y, box) {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
}

function pctInAnyObstacle(x, y) {
  return OBSTACLES_REF.some((ob) => pctInBox(x, y, ob))
}

/** 캐릭터 엘리먼트의 인라인 style left/top(%)을 world-% 좌표로 파싱. */
async function readCharacterPct(character) {
  return character.evaluate((el) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }))
}

/** 실제 DOM에 그려진 장애물 박스(proto25d-obstacle)를 world-%로 재확인. */
async function readObstacleBoxesFromDom(page) {
  return page.locator('[data-testid="proto25d-obstacle"]').evaluateAll((els) => els.map((el) => ({
    id: el.getAttribute('data-obstacle-id'),
    left: parseFloat(el.style.left),
    top: parseFloat(el.style.top),
    width: parseFloat(el.style.width),
    height: parseFloat(el.style.height),
  })))
}

// Stage 3 — worldContract.js DEPTH_BANDS와 정확히 같은 값을 이 spec에도
// 그대로 옮겨왔다(OBSTACLES_REF와 동일한 이 파일의 기존 관례 — import가
// 아니라 값 복제, 이 spec은 브라우저 페이지 컨텍스트 밖 Node에서 도는
// spec이라 소스 모듈을 직접 import하지 않는다. 실제 렌더된 scale이 이
// 복제값으로 재계산한 depthScaleRef와 일치하는지 DOM에서 직접 재확인한다).
const DEPTH_BANDS_REF = [
  { maxY: 28, scale: [0.55, 0.65] },
  { maxY: 45, scale: [0.70, 0.82] },
  { maxY: 66, scale: [0.85, 1.00] },
  { maxY: 100, scale: [1.00, 1.20] },
]
function depthScaleRef(y) {
  const clamped = Math.max(0, Math.min(100, Number(y) || 0))
  let minY = 0
  for (const band of DEPTH_BANDS_REF) {
    if (clamped <= band.maxY) {
      const [s0, s1] = band.scale
      const span = band.maxY - minY
      const frac = span === 0 ? 1 : (clamped - minY) / span
      return s0 + (s1 - s0) * frac
    }
    minY = band.maxY
  }
  return DEPTH_BANDS_REF[DEPTH_BANDS_REF.length - 1].scale[1]
}

/** 캐릭터 엘리먼트의 computed transform matrix에서 scale 성분(a)을 읽는다
 * (translate(-50%,-100%) scale(s)는 회전이 없어 matrix(a,b,c,d,e,f)의
 * a===d===s로 귀결된다 — a를 읽으면 충분). transform이 없으면 null. */
async function readCharacterScale(character) {
  return character.evaluate((el) => {
    const t = window.getComputedStyle(el).transform
    if (!t || t === 'none') return null
    const m = t.match(/^matrix\(([^)]+)\)$/)
    if (!m) return null
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
    return Number.isFinite(parts[0]) ? parts[0] : null
  })
}

/** 엘리먼트의 computed z-index를 정수로 읽는다(파싱 불가면 null). */
async function readZIndex(locator) {
  return locator.evaluate((el) => {
    const z = window.getComputedStyle(el).zIndex
    const n = parseInt(z, 10)
    return Number.isFinite(n) ? n : null
  })
}

export async function run(browser, baseURL) {
  const r = createRecorder('[town-proto2.5d]')
  const unmockedRequests = []
  const mockErrors = []
  const ttsFallbackRequests = []

  function collect(mocks) {
    unmockedRequests.push(...mocks.unmockedRequests)
    ttsFallbackRequests.push(...mocks.ttsFallbackRequests)
    mockErrors.push(...mocks.db.errors)
  }

  // ── S1 — 소스 직접 확인: paulTown2_5d 기본값이 false ────────────────────
  {
    const name = 'S1[source] paulTown2_5d 기본값'
    try {
      const src = fs.readFileSync(path.join(ROOT, 'src/config/features.js'), 'utf8')
      const m = src.match(/paulTown2_5d:\s*(true|false)/)
      r.check(`${name} — features.js DEFAULT_FEATURES.paulTown2_5d === false`, !!m && m[1] === 'false', m ? m[0] : '매칭 없음')
    } catch (err) {
      r.check(`${name} 실행 완료(예외 없음)`, false, String(err?.message || err))
    }
  }

  // ── S2 — 플래그 OFF(기본)일 때 프로토타입 DOM 자체가 없음(항목2) ────────
  {
    const vp = { width: 390, height: 844 }
    const name = 'S2[390x844,flag-OFF]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)
      // 단발성 스냅샷이 아니라 일정 시간 동안 지속적으로 부재함을 확인한다
      // (한 번의 타이밍에만 우연히 없는 것과 구분 — 3회 샘플, 600ms 간격).
      let rootCount = 0
      let charCount = 0
      for (let i = 0; i < 3; i++) {
        rootCount = Math.max(rootCount, await page.locator('[data-testid="proto25d-root"]').count())
        charCount = Math.max(charCount, await page.locator('[data-proto-character]').count())
        await page.waitForTimeout(600)
      }
      r.check(`${name} 항목2 — 플래그 OFF(기본)일 때 proto25d-root DOM이 없음(3회 샘플)`, rootCount === 0, `maxCount=${rootCount}`)
      r.check(`${name} 항목2 — 플래그 OFF일 때 캐릭터 엘리먼트도 없음(3회 샘플)`, charCount === 0, `maxCount=${charCount}`)
    } catch (err) {
      const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S3 — 플래그 ON, 데스크톱 마우스 경로(1280x800): 항목1/3/4/5/6/7/8/9 ──
  {
    const vp = { width: 1280, height: 800 }
    const name = 'S3[1280x800,flag-ON,mouse]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const root = page.locator('[data-testid="proto25d-root"]')
      const rootVisible = await root.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
      r.check(`${name} 항목3 — 플래그 ON이면 proto25d-root가 (진입 없이) 즉시 보임`, rootVisible)

      const character = page.locator('[data-proto-character]')
      const charAttached = await character.waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} 항목3 — 캐릭터가 마운트 직후(탭 없이) 이미 존재함`, charAttached)

      const initialPhase = charAttached ? await character.getAttribute('data-character-phase') : null
      r.check(`${name} 항목4 — 캐릭터 초기 phase가 idle`, initialPhase === 'idle', `phase=${initialPhase}`)

      // ── 항목5/6 — 유효 바닥 탭 -> walking 전이 -> 점진적 이동 -> 목적지 도착 -> idle 복귀 ──
      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()
      const tapPoint = { x: groundBox.x + groundBox.width * 0.75, y: groundBox.y + groundBox.height * 0.35 }
      await page.mouse.click(tapPoint.x, tapPoint.y)
      // "다음 프레임" 샘플 — walking으로 전이된 직후, 아직 목적지에 도달하기 전.
      const boxJustAfterTap = await character.boundingBox()
      const phaseJustAfterTap = await character.getAttribute('data-character-phase').catch(() => null)
      r.check(`${name} 항목5 — 탭 직후 phase가 walking으로 전이됨`, phaseJustAfterTap === 'walking', `phase=${phaseJustAfterTap}`)

      const idleAgain = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })
      r.check(`${name} 항목5 — 걷기 완료 후 phase가 다시 idle로 복귀`, !!idleAgain)
      const boxFinal = await character.boundingBox()
      const finalAnchor = boxAnchor(boxFinal)
      const finalDistFromTap = dist(finalAnchor, tapPoint)
      r.check(`${name} 항목5 — 걷기 완료 후 캐릭터가 탭 지점 근처에 도착(<30px)`, finalDistFromTap != null && finalDistFromTap < 30, `dist=${finalDistFromTap}`)

      const earlyVsFinalDist = dist(boxCenter(boxJustAfterTap), boxCenter(boxFinal))
      r.check(
        `${name} 항목6 — 탭 직후 샘플이 이미 최종 위치가 아님(순간이동 아님, 점진적 이동 확인)`,
        earlyVsFinalDist != null && earlyVsFinalDist > 3,
        `dist=${earlyVsFinalDist}`,
      )

      // ── 항목7 — 가장자리 근접 탭에도 목적지가 world 경계(2~98%) 안으로 clamp됨 ──
      const edgeTapPoint = { x: groundBox.x + 1, y: groundBox.y + 1 }
      await page.mouse.click(edgeTapPoint.x, edgeTapPoint.y)
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
      ), { timeout: 1000 })
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })
      const styleAfterEdgeTap = await character.evaluate((el) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }))
      r.check(
        `${name} 항목7 — 가장자리 근접 탭에도 목적지가 world 경계(2~98%) 안으로 clamp됨`,
        styleAfterEdgeTap.left >= 2 && styleAfterEdgeTap.left <= 98 && styleAfterEdgeTap.top >= 2 && styleAfterEdgeTap.top <= 98,
        JSON.stringify(styleAfterEdgeTap),
      )

      // ── 항목8 — UI(정보 배지) 클릭은 캐릭터를 움직이지 않음 ──────────────
      const boxBeforeUIClick = await character.boundingBox()
      const infoBtn = page.locator('[data-testid="proto25d-info-toggle"]')
      await infoBtn.click()
      await page.waitForTimeout(200)
      const boxAfterUIClick = await character.boundingBox()
      const uiClickMovedDist = dist(boxCenter(boxBeforeUIClick), boxCenter(boxAfterUIClick))
      r.check(
        `${name} 항목8 — 정보 배지(UI) 클릭은 캐릭터를 움직이지 않음`,
        uiClickMovedDist != null && uiClickMovedDist < 1,
        `dist=${uiClickMovedDist}`,
      )
      const phaseAfterUIClick = await character.getAttribute('data-character-phase').catch(() => null)
      r.check(`${name} 항목8 — UI 클릭 후에도 phase가 idle 그대로(걷기 트리거 안 됨)`, phaseAfterUIClick === 'idle', `phase=${phaseAfterUIClick}`)
      const captionVisible = await page.getByText('바닥을 탭하면 캐릭터가 걸어갑니다').isVisible().catch(() => false)
      r.check(`${name} — 정보 배지 자체는 정상 동작(클릭 시 캡션 토글됨)`, captionVisible)
      await infoBtn.click() // 캡션 닫기(다음 단언에 영향 없게 정리)

      // ── 항목9 — 빠른 연속 탭에도 캐릭터 DOM이 중복 생성되지 않음 ─────────
      const rapidPoints = [0.3, 0.5, 0.65].map((f) => ({ x: groundBox.x + groundBox.width * f, y: groundBox.y + groundBox.height * 0.5 }))
      for (const p of rapidPoints) await page.mouse.click(p.x, p.y)
      await page.waitForTimeout(100)
      const charCountAfterRapid = await page.locator('[data-proto-character]').count()
      r.check(`${name} 항목9 — 빠른 연속 탭 후에도 캐릭터 엘리먼트가 정확히 1개`, charCountAfterRapid === 1, `count=${charCountAfterRapid}`)
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })

      // ── Stage2 항목11 — 드래그/스와이프 제스처는 이동 명령으로 해석되지 않음 ──
      // DRAG_THRESHOLD_PX(8px)를 확실히 넘는 이동(60px)을 가진 포인터
      // down->move->up 시퀀스를 CDP가 아니라 Playwright mouse API로 직접
      // 재현한다(마우스 경로라 CDP 트릭이 필요 없음, 모바일 터치 경로의
      // 동일 취지 비교군은 S4에 별도로 둔다).
      const boxBeforeDrag = await character.boundingBox()
      const dragStart = { x: groundBox.x + groundBox.width * 0.2, y: groundBox.y + groundBox.height * 0.2 }
      const dragEnd = { x: dragStart.x + 60, y: dragStart.y + 60 } // 대각선 60px — 8px 임계값을 훨씬 초과
      await page.mouse.move(dragStart.x, dragStart.y)
      await page.mouse.down()
      await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(200)
      const phaseAfterDrag = await character.getAttribute('data-character-phase').catch(() => null)
      r.check(`${name} 항목11 — 드래그 제스처(60px, 임계값 초과) 후에도 phase가 idle 그대로`, phaseAfterDrag === 'idle', `phase=${phaseAfterDrag}`)
      const boxAfterDrag = await character.boundingBox()
      const dragMovedDist = dist(boxCenter(boxBeforeDrag), boxCenter(boxAfterDrag))
      r.check(`${name} 항목11 — 드래그 제스처는 캐릭터를 움직이지 않음`, dragMovedDist != null && dragMovedDist < 1, `dist=${dragMovedDist}`)

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

  // ── S4 — 플래그 ON, 모바일 터치 경로(390x844, CDP 신뢰 터치): 항목11(비교군)/12 ──
  {
    const vp = { width: 390, height: 844 }
    const name = 'S4[390x844,flag-ON,touch]'
    const context = await browser.newContext({ viewport: vp, hasTouch: true })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const character = page.locator('[data-proto-character]')
      const charAttached = await character.waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} — 모바일 뷰포트에서도 캐릭터가 마운트 즉시 존재함`, charAttached)

      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()
      const tapPoint = { x: groundBox.x + groundBox.width * 0.65, y: groundBox.y + groundBox.height * 0.4 }
      const boxBeforeTouch = await character.boundingBox()
      await cdpTouchTap(context, page, tapPoint.x, tapPoint.y)

      const phaseAfterTouch = await waitUntil(async () => {
        const p = await character.getAttribute('data-character-phase').catch(() => null)
        return p === 'walking' ? p : false
      }, { timeout: 1500 })
      r.check(`${name} 항목12 — 터치 탭(CDP Input.dispatchTouchEvent)으로 phase가 walking으로 전이됨`, phaseAfterTouch === 'walking', String(phaseAfterTouch))

      const idleAgain = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })
      r.check(`${name} 항목12 — 터치 걷기 완료 후 phase가 idle로 복귀`, !!idleAgain)
      const boxFinal = await character.boundingBox()
      const finalDistFromTap = dist(boxAnchor(boxFinal), tapPoint)
      r.check(`${name} 항목12 — 터치 탭으로 캐릭터가 탭 지점 근처에 도착(<30px)`, finalDistFromTap != null && finalDistFromTap < 30, `dist=${finalDistFromTap}`)
      const movedFromStart = dist(boxCenter(boxBeforeTouch), boxCenter(boxFinal))
      r.check(`${name} 항목12 — 터치 탭 전후로 실제로 위치가 이동함(제자리 아님)`, movedFromStart != null && movedFromStart > 5, `dist=${movedFromStart}`)

      // ── Stage2 항목12(장애물 결합) — 터치 경로에서도 장애물 보정이 동작 ──
      // demo-tree(70~76,56~62 world-%) 중심을 정확히 터치 탭 — 새 경로탐색
      // 로직이 마우스 경로뿐 아니라 터치 입력 경로에서도 똑같이 동작하는지
      // (좌표 정규화 자체는 안 건드렸으므로 동등해야 함, §11 확인 취지) 확인.
      const treeCenter = { x: groundBox.x + groundBox.width * 0.73, y: groundBox.y + groundBox.height * 0.59 }
      await cdpTouchTap(context, page, treeCenter.x, treeCenter.y)
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
      ), { timeout: 1500 })
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 4000 })
      const pctAfterTreeTouch = await readCharacterPct(character)
      r.check(
        `${name} 항목12 — 장애물(demo-tree) 터치 탭 후 캐릭터가 장애물 박스 밖에 착지함`,
        !pctInAnyObstacle(pctAfterTreeTouch.left, pctAfterTreeTouch.top),
        JSON.stringify(pctAfterTreeTouch),
      )

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

  // ── S5 — prefers-reduced-motion: reduce(390x844): 항목10 ────────────────
  //        townV2.spec.mjs S21b와 동일 정신 — 걷기 이동이 훨씬 짧은
  //        transition으로 대체되고(순간이동은 아님), idle 숨쉬기 루프
  //        애니메이션은 완전히 꺼진다(motion-safe: 클래스가 적용되지
  //        않음 — animationName computed style로 직접 확인).
  {
    const vp = { width: 390, height: 844 }
    const name = 'S5[390x844,reduced-motion]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const character = page.locator('[data-proto-character]')
      const charAttached = await character.waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} 항목10 — reduced-motion에서도 캐릭터가 마운트 즉시 보임`, charAttached)

      // idle 숨쉬기 루프(motion-safe:animate-town-cat-idle)가 reduced-motion
      // 에서 실제로 비활성화됐는지 — computed animationName으로 직접 확인
      // (townV2.spec.mjs S21b의 bobAnimationName 패턴과 동일).
      const idleBobAnimationName = charAttached
        ? await character.locator('div').first().evaluate((el) => window.getComputedStyle(el).animationName).catch(() => null)
        : null
      r.check(
        `${name} 항목10 — idle 숨쉬기 루프 animationName이 none(reduced-motion, motion-safe: 클래스 미적용)`,
        idleBobAnimationName === 'none',
        String(idleBobAnimationName),
      )

      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()
      const tapPoint = { x: groundBox.x + groundBox.width * 0.7, y: groundBox.y + groundBox.height * 0.4 }
      await page.mouse.click(tapPoint.x, tapPoint.y)

      // reduced-motion의 이동 transition은 훨씬 짧다(순간이동은 아님) —
      // 아주 짧은 대기 후에도 이미 목적지 근처에 도착해 있어야 한다.
      await page.waitForTimeout(400)
      const boxSoonAfterTap = await character.boundingBox()
      const distSoonAfterTap = dist(boxAnchor(boxSoonAfterTap), tapPoint)
      r.check(
        `${name} 항목10 — reduced-motion에서는 짧은 대기(400ms) 만으로도 목적지 근처에 도착(<30px, 훨씬 짧은 transition)`,
        distSoonAfterTap != null && distSoonAfterTap < 30,
        `dist=${distSoonAfterTap}`,
      )

      const walkBobAnimationNameWhileMoving = await character.locator('div').first().evaluate((el) => window.getComputedStyle(el).animationName).catch(() => null)
      r.check(
        `${name} 항목10 — 걷기 bob(motion-safe:animate-town-walk-bob)도 reduced-motion에서 animationName none`,
        walkBobAnimationNameWhileMoving === 'none',
        String(walkBobAnimationNameWhileMoving),
      )

      // ── Stage2 항목13 — reduced-motion에서도 장애물 보정/경로탐색이
      // 적용된 "최종 보행 가능 위치"로 즉시 이동한다(원문 요구: 순진한 탭
      // 지점이 장애물 안이면 그 raw 지점으로 순간이동하지 않고, 전체
      // 동작(full-motion) 사용자가 도착했을 최종 목적지와 동일한 곳으로
      // 즉시 이동해야 함). demo-building 중심(50,32 world-%, 장애물 안)을
      // 정확히 탭한다.
      const buildingCenter = { x: groundBox.x + groundBox.width * 0.5, y: groundBox.y + groundBox.height * ((24 + 40) / 2 / 100) }
      await page.mouse.click(buildingCenter.x, buildingCenter.y)
      // reduced-motion 이동 transition(REDUCED_MOTION_TRANSITION_MS=220ms)
      // 이 끝날 시간을 넉넉히 기다린 뒤 idle 복귀까지 확인(다중 웨이포인트를
      // 순차 애니메이션하지 않고 단일 짧은 전이로 끝나야 하므로 매우 빨리
      // idle로 돌아와야 한다 — 만약 코드가 실수로 웨이포인트마다 순차
      // 애니메이션했다면 이 타임아웃 안에 idle로 못 돌아올 수 있다).
      const idleAfterObstacleTapReducedMotion = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 800 })
      r.check(
        `${name} 항목13 — 장애물 탭 후 reduced-motion에서도 매우 빠르게(800ms 안) idle로 복귀(단일 짧은 전이, 웨이포인트별 순차 애니메이션 아님)`,
        !!idleAfterObstacleTapReducedMotion,
      )
      const pctAfterObstacleTapReducedMotion = await readCharacterPct(character)
      r.check(
        `${name} 항목13 — reduced-motion에서도 장애물 안이 아니라 경로탐색이 검증한 걸을 수 있는 지점에 착지함`,
        !pctInAnyObstacle(pctAfterObstacleTapReducedMotion.left, pctAfterObstacleTapReducedMotion.top),
        JSON.stringify(pctAfterObstacleTapReducedMotion),
      )

      // ── Stage3 항목12 — reduced-motion에서도 depth/scale은 절대 생략되지
      // 않는다(운영자 지시 — "필수 정보인 depth/scale까지 제거하면 안 된다",
      // 오직 그 사이의 보간 애니메이션만 짧아질 뿐) — idle 정착 후 최종
      // 스케일이 depthScaleRef(y)와 정확히 일치하는지 확인한다.
      const finalScaleReducedMotion = await readCharacterScale(character)
      const expectedScaleReducedMotion = depthScaleRef(pctAfterObstacleTapReducedMotion.top)
      r.check(
        `${name} 항목12 — reduced-motion에서도 최종 스케일이 depthScaleRef(y)와 정확히 일치(오차<0.01, 생략되지 않음)`,
        finalScaleReducedMotion != null && Math.abs(finalScaleReducedMotion - expectedScaleReducedMotion) < 0.01,
        `scale=${finalScaleReducedMotion} expected=${expectedScaleReducedMotion} y=${pctAfterObstacleTapReducedMotion.top}`,
      )

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

  // ── S6 — Stage2 핵심: 장애물 회피(플래그 ON, 데스크톱 마우스 1280x800) ──
  // 항목4/5/6/9(회귀) — 장애물 안 탭 보정, 경로가 장애물 셀을 지나지
  // 않음, 장애물 뒤 목적지 우회, HUD 클릭 무이동 회귀 확인.
  {
    const vp = { width: 1280, height: 800 }
    const name = 'S6[1280x800,flag-ON,obstacles,debug]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      // 모바일 시각 보정(2026-09-23) — 장애물 디버그 플레이스홀더(점선 상자
      // +라벨)는 기본적으로 렌더하지 않는다(Proto25DScreen.jsx
      // readDebugOverlaysEnabled 주석 참고). 이 시나리오는 그 디버그
      // 오버레이 자체(좌표/개수)를 검증하는 게 목적이라 `?proto25dDebug=1`
      // 쿼리로 명시적으로 켠다(기존 회귀 계약 약화 없음 — 조건부 실행으로만
      // 전환). "기본값(디버그 미지정)일 때 안 보임"은 아래 S9에서 별도로
      // 확인한다.
      await page.goto(`${baseURL}?proto25dDebug=1`, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const root = page.locator('[data-testid="proto25d-root"]')
      await root.waitFor({ state: 'visible', timeout: 10000 })
      const character = page.locator('[data-proto-character]')
      await character.waitFor({ state: 'attached', timeout: 5000 })
      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()

      // ── 장애물 3개가 실제로 렌더됨 + world-% 좌표가 walkGrid.js
      // OBSTACLES와 일치함(DOM 직접 재확인, 하드코딩 값을 신뢰하지 않음) ──
      const domObstacles = await readObstacleBoxesFromDom(page)
      r.check(`${name} — 장애물 플레이스홀더 3개가 렌더됨`, domObstacles.length === 3, `count=${domObstacles.length}`)
      const obstaclesMatchRef = OBSTACLES_REF.every((ref) => {
        const found = domObstacles.find((d) => d.id === ref.id)
        if (!found) return false
        const eps = 0.05
        return Math.abs(found.left - ref.x0) < eps && Math.abs(found.top - ref.y0) < eps &&
          Math.abs(found.width - (ref.x1 - ref.x0)) < eps && Math.abs(found.height - (ref.y1 - ref.y0)) < eps
      })
      r.check(`${name} — DOM에 그려진 장애물 좌표가 이 spec의 OBSTACLES_REF와 정확히 일치함`, obstaclesMatchRef, JSON.stringify(domObstacles))
      const obstaclesPointerEventsNone = await page.locator('[data-testid="proto25d-obstacle"]').evaluateAll((els) => els.every((el) => window.getComputedStyle(el).pointerEvents === 'none'))
      r.check(`${name} — 장애물 플레이스홀더 전부 pointer-events:none(탭 판정에 관여하지 않음, 요구사항13 무변경)`, obstaclesPointerEventsNone)

      // ── 항목4 — 장애물 안(demo-building 중심)을 탭하면 그 안이 아니라
      // 가장 가까운 걸을 수 있는 지점으로 보정돼 이동함 ──
      const buildingCenterPct = { x: 50, y: 32 } // (demo-building x0:38,x1:62,y0:24,y1:40의 중심)
      const buildingCenterPx = { x: groundBox.x + groundBox.width * (buildingCenterPct.x / 100), y: groundBox.y + groundBox.height * (buildingCenterPct.y / 100) }
      await page.mouse.click(buildingCenterPx.x, buildingCenterPx.y)
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
      ), { timeout: 1500 })
      const idleAfterObstacleTap = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 5000 })
      r.check(`${name} 항목4 — 장애물 탭 후에도 결국 idle로 복귀(멈춘 상태 없음)`, !!idleAfterObstacleTap)
      const pctAfterObstacleTap = await readCharacterPct(character)
      r.check(
        `${name} 항목4 — 장애물 중심을 탭해도 캐릭터가 장애물 박스 밖(가장 가까운 걸을 수 있는 지점)에 착지함`,
        !pctInAnyObstacle(pctAfterObstacleTap.left, pctAfterObstacleTap.top),
        JSON.stringify(pctAfterObstacleTap),
      )

      // ── 항목5/6 — 장애물 바로 뒤(반대편) 목적지를 탭하면 직선이 아니라
      // 우회 경로로 이동하고, 이동 중 어떤 샘플도 장애물 박스 안을 지나지
      // 않음 ──
      // 캐릭터를 먼저 장애물 아래(시작 위치 방향)로 되돌려 두고(장애물
      // 바로 위 지점을 목표로 삼는 이번 시나리오의 "시작점"을 명확히 하기
      // 위함), 그 다음 장애물 바로 위(반대편)를 탭한다.
      await page.mouse.click(groundBox.x + groundBox.width * 0.5, groundBox.y + groundBox.height * 0.62)
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })
      const behindBuildingPct = { x: 50, y: 20 } // demo-building(y0:24~y1:40) 바로 위 — 직선 경로면 반드시 building을 관통
      const behindBuildingPx = { x: groundBox.x + groundBox.width * (behindBuildingPct.x / 100), y: groundBox.y + groundBox.height * (behindBuildingPct.y / 100) }
      await page.mouse.click(behindBuildingPx.x, behindBuildingPx.y)

      // 이동이 끝날 때까지(idle 복귀) 짧은 간격으로 샘플링 — 그 사이 어떤
      // 샘플도 장애물 박스 안이면 안 된다("경로가 장애물 셀을 절대 지나지
      // 않는다"를 코드 재호출 없이 DOM에서 직접 재검증).
      const samples = []
      const sampleDeadline = Date.now() + 6000
      let sawWalking = false
      while (Date.now() < sampleDeadline) {
        const phase = await character.getAttribute('data-character-phase').catch(() => null)
        if (phase === 'walking') sawWalking = true
        const pct = await readCharacterPct(character)
        samples.push(pct)
        if (phase === 'idle' && sawWalking) break
        await page.waitForTimeout(40)
      }
      const anySampleInObstacle = samples.some((s) => pctInAnyObstacle(s.left, s.top))
      r.check(
        `${name} 항목5 — 이동 중 어떤 샘플도 장애물 박스 안을 지나지 않음(${samples.length}개 샘플)`,
        !anySampleInObstacle,
        anySampleInObstacle ? JSON.stringify(samples.filter((s) => pctInAnyObstacle(s.left, s.top))) : '',
      )
      const finalPhaseBehind = await character.getAttribute('data-character-phase').catch(() => null)
      r.check(`${name} 항목5/6 — 장애물 뒤 목적지로도 결국 idle 복귀(멈춘 상태 없음)`, finalPhaseBehind === 'idle', `phase=${finalPhaseBehind}`)
      const pctBehindBuilding = await readCharacterPct(character)
      const behindBuildingDist = Math.hypot(pctBehindBuilding.left - behindBuildingPct.x, pctBehindBuilding.top - behindBuildingPct.y)
      r.check(
        `${name} 항목6 — 우회 후 최종적으로 원래 탭 지점(장애물 밖이라 보정 불필요) 근처에 정확히 도착(<3 world-%)`,
        behindBuildingDist < 3,
        `dist=${behindBuildingDist} pct=${JSON.stringify(pctBehindBuilding)}`,
      )

      // ── 항목9(회귀) — 이 Stage2 컨텍스트에서도 UI(정보 배지) 클릭은
      // 캐릭터를 움직이지 않음(Stage 1에서 이미 검증됐지만, 장애물
      // 오버레이 추가 후에도 여전히 그런지 이 시나리오에서 다시 확인) ──
      const boxBeforeUIClick2 = await character.boundingBox()
      const infoBtn2 = page.locator('[data-testid="proto25d-info-toggle"]')
      await infoBtn2.click()
      await page.waitForTimeout(200)
      const boxAfterUIClick2 = await character.boundingBox()
      const uiClickMovedDist2 = dist(boxCenter(boxBeforeUIClick2), boxCenter(boxAfterUIClick2))
      r.check(
        `${name} 항목9(회귀) — 장애물 오버레이 추가 후에도 UI(정보 배지) 클릭은 캐릭터를 움직이지 않음`,
        uiClickMovedDist2 != null && uiClickMovedDist2 < 1,
        `dist=${uiClickMovedDist2}`,
      )

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

  // ── S7 — Stage3 핵심: Y-기반 스케일/깊이 occlusion/그림자(플래그 ON,
  // 데스크톱 마우스 1280x800) ──
  {
    const vp = { width: 1280, height: 800 }
    const name = 'S7[1280x800,flag-ON,depth-scale,debug]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      // 모바일 시각 보정(2026-09-23) — 이 시나리오는 장애물 디버그
      // 엘리먼트(demo-tree)의 z-index를 직접 읽어 occlusion을 검증하므로
      // `?proto25dDebug=1`로 디버그 오버레이를 명시적으로 켠다(기본값은
      // 이제 꺼짐 — S6과 동일 이유, 위 S6 주석 참고).
      await page.goto(`${baseURL}?proto25dDebug=1`, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const character = page.locator('[data-proto-character]')
      await character.waitFor({ state: 'attached', timeout: 5000 })
      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()

      async function tapAndSettle(xFrac, yFrac) {
        await page.mouse.click(groundBox.x + groundBox.width * xFrac, groundBox.y + groundBox.height * yFrac)
        await waitUntil(async () => (
          (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
        ), { timeout: 1500 })
        await waitUntil(async () => (
          (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
        ), { timeout: 5000 })
      }

      // ── 항목1/2/3 — 스케일이 depthScaleRef(worldContract.js 값 복제)와
      // 일치하고, 뒤(작은 y)보다 앞(큰 y)이 더 크며, 항상 [0.55,1.20] 범위 ──
      await tapAndSettle(0.5, 0.1) // 뒤(작은 y) — 장애물 밖 열린 구역
      const pctBack = await readCharacterPct(character)
      const scaleBack = await readCharacterScale(character)
      const expectedScaleBack = depthScaleRef(pctBack.top)
      r.check(
        `${name} 항목1/3 — 뒤(y=${pctBack.top.toFixed(1)}) 스케일이 depthScaleRef와 일치(오차<0.01)+[0.55,1.20] 범위`,
        scaleBack != null && Math.abs(scaleBack - expectedScaleBack) < 0.01 && scaleBack >= 0.55 && scaleBack <= 1.20,
        `scale=${scaleBack} expected=${expectedScaleBack}`,
      )

      await tapAndSettle(0.15, 0.92) // 앞(큰 y) — 장애물 밖 열린 구역
      const pctFront = await readCharacterPct(character)
      const scaleFront = await readCharacterScale(character)
      const expectedScaleFront = depthScaleRef(pctFront.top)
      r.check(
        `${name} 항목1/3 — 앞(y=${pctFront.top.toFixed(1)}) 스케일이 depthScaleRef와 일치(오차<0.01)+[0.55,1.20] 범위`,
        scaleFront != null && Math.abs(scaleFront - expectedScaleFront) < 0.01 && scaleFront >= 0.55 && scaleFront <= 1.20,
        `scale=${scaleFront} expected=${expectedScaleFront}`,
      )
      r.check(
        `${name} 항목2 — 앞(y=${pctFront.top.toFixed(1)}) 스케일이 뒤(y=${pctBack.top.toFixed(1)})보다 큼(더 가까울수록 커짐)`,
        scaleFront != null && scaleBack != null && scaleFront > scaleBack,
        `back=${scaleBack} front=${scaleFront}`,
      )

      // ── 항목10 — 스케일이 바뀌어도 "논리 좌표"(style.left/top, 걷기/
      // 충돌 판정이 실제로 읽는 값)는 순수 % 문자열 그대로(스케일에 오염되지
      // 않음 — 시각 효과가 좌표 계산으로 새어 들어가지 않는다는 요구사항) ──
      const rawLeftTop = await character.evaluate((el) => ({ left: el.style.left, top: el.style.top }))
      const pureLeftTopFormat = /^-?\d+(\.\d+)?%$/.test(rawLeftTop.left) && /^-?\d+(\.\d+)?%$/.test(rawLeftTop.top)
      r.check(
        `${name} 항목10 — 스케일 적용 중에도 style.left/top이 순수 %값 그대로(스케일이 논리 좌표에 섞이지 않음)`,
        pureLeftTopFormat,
        JSON.stringify(rawLeftTop),
      )

      // ── 항목5/6 — depth occlusion: 캐릭터가 장애물(demo-tree,
      // x0:70,x1:76,y0:56,y1:62)보다 뒤/앞일 때 z-index 대소 관계가
      // 뒤바뀜(depthOrder.js 'character' vs 'objects' 레이어, y 기준) ──
      const treeEl = page.locator('[data-testid="proto25d-obstacle"][data-obstacle-id="demo-tree"]')
      await treeEl.waitFor({ state: 'attached', timeout: 5000 })

      await tapAndSettle(0.73, 0.50) // 나무 바로 위(더 작은 y) — 나무보다 뒤
      const pctBehindTree = await readCharacterPct(character)
      const zCharBehind = await readZIndex(character)
      const zTreeA = await readZIndex(treeEl)
      r.check(
        `${name} 항목5 — 캐릭터(y=${pctBehindTree.top.toFixed(1)}, 나무 뒤)의 z-index가 나무보다 작음(가려짐)`,
        zCharBehind != null && zTreeA != null && zCharBehind < zTreeA,
        `char=${zCharBehind} tree=${zTreeA}`,
      )

      await tapAndSettle(0.73, 0.70) // 나무 바로 아래(더 큰 y) — 나무보다 앞
      const pctFrontTree = await readCharacterPct(character)
      const zCharFront = await readZIndex(character)
      const zTreeB = await readZIndex(treeEl)
      r.check(
        `${name} 항목6 — 캐릭터(y=${pctFrontTree.top.toFixed(1)}, 나무 앞)의 z-index가 나무보다 큼(가림)`,
        zCharFront != null && zTreeB != null && zCharFront > zTreeB,
        `char=${zCharFront} tree=${zTreeB}`,
      )

      // ── 항목8/9 — 그림자: 발 위치를 따라가고, pointer-events:none이며,
      // 그림자를 클릭해도 바닥 이동 판정을 가로채지 않음(클릭 관통) ──
      // 모바일 시각 보정(2026-09-23)으로 그림자가 캐릭터 박스의 형제로
      // 분리돼(ProtoCharacter.jsx 헤더 주석 참고) 더 이상 character의
      // 자손이 아니다 — 전용 data 속성으로 최상위에서 직접 찾는다.
      const shadow = page.locator('[data-proto-character-shadow]')
      await shadow.waitFor({ state: 'attached', timeout: 5000 })
      const shadowPointerEvents = await shadow.evaluate((el) => window.getComputedStyle(el).pointerEvents)
      r.check(`${name} 항목9 — 그림자 span이 pointer-events:none`, shadowPointerEvents === 'none', shadowPointerEvents)

      const charBoxA = await character.boundingBox()
      const shadowBoxA = await shadow.boundingBox()
      await tapAndSettle(0.30, 0.85)
      const charBoxB = await character.boundingBox()
      const shadowBoxB = await shadow.boundingBox()
      const charMoveVec = { x: boxCenter(charBoxB).x - boxCenter(charBoxA).x, y: boxCenter(charBoxB).y - boxCenter(charBoxA).y }
      const shadowMoveVec = { x: boxCenter(shadowBoxB).x - boxCenter(shadowBoxA).x, y: boxCenter(shadowBoxB).y - boxCenter(shadowBoxA).y }
      const moveVecDist = Math.hypot(charMoveVec.x - shadowMoveVec.x, charMoveVec.y - shadowMoveVec.y)
      r.check(
        `${name} 항목8 — 그림자가 두 위치 이동 동안 캐릭터와 거의 같은 벡터로 이동(발 위치 추적, 오차<20px)`,
        moveVecDist < 20,
        `charVec=${JSON.stringify(charMoveVec)} shadowVec=${JSON.stringify(shadowMoveVec)} dist=${moveVecDist}`,
      )

      // 그림자 영역을 직접 클릭해도 바닥 이동 판정을 가로채지 않고 그대로
      // 걷기가 시작됨(그림자가 클릭을 가로채 아무 일도 안 일어나는 회귀 방지).
      const shadowBoxForClick = await shadow.boundingBox()
      if (shadowBoxForClick) {
        await page.mouse.click(shadowBoxForClick.x + shadowBoxForClick.width / 2, shadowBoxForClick.y + shadowBoxForClick.height / 2)
      }
      const walkingAfterShadowClick = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
      ), { timeout: 1500 })
      r.check(
        `${name} 항목9 — 그림자 영역을 클릭해도 바닥 이동 판정을 가로채지 않고 걷기가 시작됨(클릭 관통)`,
        !!walkingAfterShadowClick,
        `shadowBox=${JSON.stringify(shadowBoxForClick)}`,
      )
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 5000 })

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

  // ── S8 — Stage4 핵심: 벤치 walk-to-sit(플래그 ON, 데스크톱 마우스
  // 1280x800) — 상태 머신(walking->sitting->leaving->idle), 반복 탭 무시,
  // walking 중 바닥 탭 재지정, sitting 중 탭 무시, z-index 역전, 그림자
  // 정제 ──
  {
    const vp = { width: 1280, height: 800 }
    const name = 'S8[1280x800,flag-ON,bench-sit]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const character = page.locator('[data-proto-character]')
      await character.waitFor({ state: 'attached', timeout: 5000 })
      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()
      const benchArt = page.locator('[data-testid="proto25d-bench-art"]')

      // walkGrid.js OBSTACLES/benchInteraction.js 상수를 이 spec에도 값
      // 복제(OBSTACLES_REF/DEPTH_BANDS_REF와 동일한 이 파일의 기존 관례 —
      // import가 아니라 값 복제, Node 페이지 컨텍스트 밖 spec이라).
      const BENCH_REF = OBSTACLES_REF.find((o) => o.id === 'demo-bench')
      const ARRIVAL_GAP_REF = 2
      // 모바일 시각 보정(2026-09-23) — 착석 지점은 더 이상 고정 오프셋이
      // 아니라 벤치의 실제 렌더 기하에서 유도된다(benchInteraction.js
      // benchSeatPoint/benchRenderedSizePx 값 복제 — SEAT_FRACTION_REF/
      // BENCH_ASSET_ASPECT_REF/BENCH_ASSET_MIN_WIDTH_PX_REF). 이 spec은
      // 브라우저 페이지 컨텍스트 밖 Node에서 도는 spec이라 소스 모듈을
      // import하지 않고(OBSTACLES_REF/DEPTH_BANDS_REF와 동일한 이 파일의
      // 기존 관례) 실측 groundBox.width/height로 직접 재계산한다.
      const SEAT_FRACTION_REF = 0.55
      const BENCH_ASSET_ASPECT_REF = 48 / 72
      const BENCH_ASSET_MIN_WIDTH_PX_REF = 44
      const arrivalRef = { x: (BENCH_REF.x0 + BENCH_REF.x1) / 2, y: BENCH_REF.y1 + ARRIVAL_GAP_REF }
      const benchNominalWidthPxRef = groundBox.width * (BENCH_REF.x1 - BENCH_REF.x0) / 100
      const benchRenderedWidthPxRef = Math.max(benchNominalWidthPxRef, BENCH_ASSET_MIN_WIDTH_PX_REF)
      const benchRenderedHeightPxRef = benchRenderedWidthPxRef * BENCH_ASSET_ASPECT_REF
      const benchRenderedHeightYRef = (benchRenderedHeightPxRef / groundBox.height) * 100
      const seatRef = {
        x: (BENCH_REF.x0 + BENCH_REF.x1) / 2,
        y: BENCH_REF.y1 - benchRenderedHeightYRef * SEAT_FRACTION_REF,
      }
      function toPx(pct) { return { x: groundBox.x + groundBox.width * (pct.x / 100), y: groundBox.y + groundBox.height * (pct.y / 100) } }
      const benchCentrePct = { x: (BENCH_REF.x0 + BENCH_REF.x1) / 2, y: (BENCH_REF.y0 + BENCH_REF.y1) / 2 }
      const benchCentrePx = toPx(benchCentrePct)

      // 위상(phase) 타임라인 샘플러 — data-character-phase를 짧은 간격으로
      // 폴링해 "연속 중복 제거"한 배열을 만든다(예: idle,walking,sitting,
      // leaving,idle). 인덱스 비교로 순서를 단언한다.
      async function samplePhaseTimeline({ timeoutMs = 9000, interval = 40, stopAtIdleAfter = 1 } = {}) {
        const timeline = []
        const deadline = Date.now() + timeoutMs
        let lastPhase = null
        let idleCount = 0
        while (Date.now() < deadline) {
          const phase = await character.getAttribute('data-character-phase').catch(() => null)
          if (phase !== lastPhase) {
            timeline.push(phase)
            lastPhase = phase
            if (phase === 'idle') idleCount++
          }
          if (idleCount >= stopAtIdleAfter && timeline.length > 1) break
          await page.waitForTimeout(interval)
        }
        return timeline
      }

      r.check(`${name} 항목1 — 벤치 실제 아트(decorations/bench)가 렌더됨`, await benchArt.waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false))

      // ── 벤치 탭 -> walking -> sitting -> leaving -> idle, 이 순서로만
      // 관측됨(반복 탭도 함께 섞어 쏴서 "중복 사이클 없음"까지 같이 확인) ──
      await page.mouse.click(benchCentrePx.x, benchCentrePx.y)
      // 항목7 — 반복 벤치 탭(같은 지점, walking 도중) — 무시돼야 한다.
      await page.waitForTimeout(60)
      await page.mouse.click(benchCentrePx.x, benchCentrePx.y)
      await page.mouse.click(benchCentrePx.x, benchCentrePx.y)

      const timeline = await samplePhaseTimeline({ timeoutMs: 12000 })
      const iWalk = timeline.indexOf('walking')
      const iSit = timeline.indexOf('sitting')
      const iLeave = timeline.indexOf('leaving')
      const iIdleAfter = timeline.lastIndexOf('idle')
      r.check(`${name} 항목6 — 벤치 탭 후 walking으로 전이됨`, iWalk >= 0, JSON.stringify(timeline))
      r.check(`${name} 항목6 — walking 다음에 sitting으로 전이됨`, iSit > iWalk, JSON.stringify(timeline))
      r.check(`${name} 항목6 — sitting 다음에 leaving으로 전이됨`, iLeave > iSit, JSON.stringify(timeline))
      r.check(`${name} 항목6 — leaving 다음에 idle로 복귀함`, iIdleAfter > iLeave, JSON.stringify(timeline))
      r.check(
        `${name} 항목7 — 반복 벤치 탭에도 sitting/leaving이 정확히 1번씩만 관측됨(중복 사이클 없음)`,
        timeline.filter((p) => p === 'sitting').length === 1 && timeline.filter((p) => p === 'leaving').length === 1,
        JSON.stringify(timeline),
      )
      const charCountAfterRepeatBenchTaps = await page.locator('[data-proto-character]').count()
      r.check(`${name} 항목7 — 반복 벤치 탭 후에도 캐릭터 엘리먼트가 정확히 1개`, charCountAfterRepeatBenchTaps === 1, `count=${charCountAfterRepeatBenchTaps}`)

      // ── 착석 지점 — 논리 좌표(style.left/top)가 benchSeatPoint와 정확히
      // 일치(발 앵커가 벤치 박스 안, 붕 뜨지 않음). 이 시점엔 이미 idle까지
      // 끝났으므로, 별도로 다시 한 번 탭해 sitting 단계에서 직접 샘플링한다 ──
      await page.mouse.click(benchCentrePx.x, benchCentrePx.y)
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'sitting', { timeout: 6000 })
      const pctSeated = await readCharacterPct(character)
      r.check(
        `${name} 항목4 — 착석 좌표(style.left/top)가 benchSeatPoint와 정확히 일치(붕 뜨지 않음)`,
        Math.abs(pctSeated.left - seatRef.x) < 0.01 && Math.abs(pctSeated.top - seatRef.y) < 0.01,
        `seated=${JSON.stringify(pctSeated)} expected=${JSON.stringify(seatRef)}`,
      )
      r.check(
        `${name} 항목4/9 — 착석 중 캐릭터 z-index가 벤치보다 앞(depthY 오버라이드)`,
        (await readZIndex(character)) > (await readZIndex(benchArt)),
        `char=${await readZIndex(character)} bench=${await readZIndex(benchArt)}`,
      )

      // ── 항목8 — sitting 동안 바닥 탭은 무시됨(idle로 돌아올 때까지 입력
      // 잠금) ──
      const groundPointDuringSit = toPx({ x: 70, y: 20 })
      await page.mouse.click(groundPointDuringSit.x, groundPointDuringSit.y)
      await page.waitForTimeout(150)
      const phaseSoonAfterGroundTapDuringSit = await character.getAttribute('data-character-phase').catch(() => null)
      r.check(
        `${name} 항목8 — sitting 동안 바닥 탭은 무시됨(phase가 여전히 sitting)`,
        phaseSoonAfterGroundTapDuringSit === 'sitting',
        `phase=${phaseSoonAfterGroundTapDuringSit}`,
      )
      const pctStillSeated = await readCharacterPct(character)
      r.check(
        `${name} 항목8 — sitting 동안 바닥 탭으로 좌표가 바뀌지 않음(좌석 그대로)`,
        Math.abs(pctStillSeated.left - seatRef.x) < 0.01 && Math.abs(pctStillSeated.top - seatRef.y) < 0.01,
        JSON.stringify(pctStillSeated),
      )

      // 이번 사이클이 자연스럽게 idle까지 끝나도록 기다려 둔다(다음
      // 시나리오가 idle에서 시작하도록).
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 8000 })

      // ── 항목8 — walking(벤치를 향해 걷는 중) 동안 바닥(비-벤치) 탭은
      // 현재 sit 의도를 취소하고 새 목적지로 재지정한다(sitting 발생 안 함) ──
      await page.mouse.click(benchCentrePx.x, benchCentrePx.y)
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking', { timeout: 1500 })
      const redirectPointPct = { x: 75, y: 15 }
      const redirectPointPx = toPx(redirectPointPct)
      await page.mouse.click(redirectPointPx.x, redirectPointPx.y)
      const redirectTimeline = await samplePhaseTimeline({ timeoutMs: 8000 })
      r.check(
        `${name} 항목8 — walking 중 바닥 탭으로 재지정되면 sitting이 전혀 발생하지 않음`,
        !redirectTimeline.includes('sitting'),
        JSON.stringify(redirectTimeline),
      )
      const pctAfterRedirect = await readCharacterPct(character)
      r.check(
        `${name} 항목8 — 재지정된 목적지(바닥 탭 지점) 근처에 최종 도착함(<3 world-%)`,
        Math.hypot(pctAfterRedirect.left - redirectPointPct.x, pctAfterRedirect.top - redirectPointPct.y) < 3,
        JSON.stringify(pctAfterRedirect),
      )

      // ── 항목9 — z-index 역전: 벤치보다 뒤(작은 y)/앞(큰 y)일 때 대소
      // 관계가 뒤바뀜(장애물 3개 전부에서 이미 검증된 depthVisual.js 계약을
      // 벤치 아트 엘리먼트로도 재확인) ──
      const behindBenchPx = toPx({ x: 23.5, y: BENCH_REF.y0 - 8 })
      await page.mouse.click(behindBenchPx.x, behindBenchPx.y)
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 5000 })
      const zCharBehindBench = await readZIndex(character)
      const zBenchA = await readZIndex(benchArt)
      r.check(
        `${name} 항목9 — 벤치보다 뒤(y=${BENCH_REF.y0 - 8})일 때 캐릭터 z-index가 벤치보다 작음(가려짐)`,
        zCharBehindBench < zBenchA,
        `char=${zCharBehindBench} bench=${zBenchA}`,
      )
      const frontBenchPx = toPx({ x: 23.5, y: BENCH_REF.y1 + 8 })
      await page.mouse.click(frontBenchPx.x, frontBenchPx.y)
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 5000 })
      const zCharFrontBench = await readZIndex(character)
      const zBenchB = await readZIndex(benchArt)
      r.check(
        `${name} 항목9 — 벤치보다 앞(y=${BENCH_REF.y1 + 8})일 때 캐릭터 z-index가 벤치보다 큼(가림)`,
        zCharFrontBench > zBenchB,
        `char=${zCharFrontBench} bench=${zBenchB}`,
      )

      // ── 항목11 — 그림자: 옅고(alpha 0.18~0.22) 납작함(타원형, 폭 대비
      // 낮은 높이) + px 하한 이상(모바일 시각 보정, 2026-09-23) ──
      // 모바일 시각 보정으로 그림자가 캐릭터 박스의 형제로 분리됨
      // (ProtoCharacter.jsx 헤더 주석 참고) — 전용 data 속성으로 찾는다.
      const shadow = page.locator('[data-proto-character-shadow]')
      await shadow.waitFor({ state: 'attached', timeout: 5000 })
      // alpha는 기존 0.10(<=0.12 검증)에서 0.20으로 올렸다 — 그 값 자체가
      // "모바일에서 사실상 안 보임" 회귀의 원인 중 하나였다(팀장 지시 —
      // 가시성 목표 opacity 0.18~0.22). 높이<10px 같은 고정 px 상한 대신
      // "폭의 절반 미만(납작한 타원)" + "px 하한 이상(완전히 사라지지
      // 않음)"으로 바꾼 이유 — 이제 그림자 크기가 depth scale과 뷰포트에
      // 따라 달라져(ProtoCharacter.jsx SHADOW_WIDTH_PCT_BASE/HEIGHT_PCT_BASE
      // 참고) 고정 px 상한은 뷰포트별로 깨지기 쉽다(뷰포트별 정밀 측정은
      // 아래 S9에서 별도로 한다).
      const shadowStyle = await shadow.evaluate((el) => {
        const cs = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return { backgroundColor: cs.backgroundColor, width: rect.width, height: rect.height, pointerEvents: cs.pointerEvents }
      })
      const alphaMatch = shadowStyle.backgroundColor.match(/rgba?\(([^)]+)\)/)
      const alphaParts = alphaMatch ? alphaMatch[1].split(',').map((s) => parseFloat(s.trim())) : []
      const shadowAlpha = alphaParts.length === 4 ? alphaParts[3] : 1
      r.check(
        `${name} 항목11 — 그림자 alpha가 가시성 목표 범위(0.18~0.22)`,
        shadowAlpha >= 0.18 && shadowAlpha <= 0.22,
        `backgroundColor=${shadowStyle.backgroundColor} alpha=${shadowAlpha}`,
      )
      r.check(
        `${name} 항목11 — 그림자가 납작함(높이가 폭의 절반 미만, 타원형)`,
        shadowStyle.height < shadowStyle.width * 0.5,
        `width=${shadowStyle.width} height=${shadowStyle.height}`,
      )
      r.check(
        `${name} 항목11 — 그림자 렌더 높이가 px 하한(6px, 오차 허용 0.5px) 이상 — 모바일에서 사실상 안 보이던 회귀 방지`,
        shadowStyle.height >= 5.5,
        `height=${shadowStyle.height}`,
      )
      r.check(`${name} 항목11 — 그림자는 여전히 pointer-events:none`, shadowStyle.pointerEvents === 'none', shadowStyle.pointerEvents)

      // ── Stage1~3 회귀 — 벤치 상호작용 도입 후에도 일반 바닥 탭/UI 클릭이
      // 정상 동작함 ──
      const boxBeforeUIClick = await character.boundingBox()
      const infoBtn = page.locator('[data-testid="proto25d-info-toggle"]')
      await infoBtn.click()
      await page.waitForTimeout(150)
      const boxAfterUIClick = await character.boundingBox()
      r.check(
        `${name} 회귀 — 정보 배지 클릭은 여전히 캐릭터를 움직이지 않음`,
        dist(boxCenter(boxBeforeUIClick), boxCenter(boxAfterUIClick)) < 1,
      )
      await infoBtn.click()

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

  // ── S8b — Stage4 reduced-motion(390x844): 걷기 transition은 스킵돼도
  // walking->sitting->leaving->idle 4단계 모두 관측되고, sit-hold가
  // REDUCED_MOTION_SIT_HOLD_MS(400ms)로 단축됨(생략 아님) ──
  {
    const vp = { width: 390, height: 844 }
    const name = 'S8b[390x844,reduced-motion,bench-sit]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const character = page.locator('[data-proto-character]')
      await character.waitFor({ state: 'attached', timeout: 5000 })
      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()
      const BENCH_REF = OBSTACLES_REF.find((o) => o.id === 'demo-bench')
      const benchCentrePx = {
        x: groundBox.x + groundBox.width * (((BENCH_REF.x0 + BENCH_REF.x1) / 2) / 100),
        y: groundBox.y + groundBox.height * (((BENCH_REF.y0 + BENCH_REF.y1) / 2) / 100),
      }

      const timeline = []
      let lastPhase = null
      const deadline = Date.now() + 4000
      await page.mouse.click(benchCentrePx.x, benchCentrePx.y)
      while (Date.now() < deadline) {
        const phase = await character.getAttribute('data-character-phase').catch(() => null)
        if (phase !== lastPhase) { timeline.push(phase); lastPhase = phase }
        if (phase === 'idle' && timeline.includes('sitting')) break
        await page.waitForTimeout(30)
      }
      const iWalk = timeline.indexOf('walking')
      const iSit = timeline.indexOf('sitting')
      const iLeave = timeline.indexOf('leaving')
      const iIdleAfter = timeline.lastIndexOf('idle')
      r.check(
        `${name} 항목10 — reduced-motion에서도 4단계(walking->sitting->leaving->idle) 전부 관측됨(생략 없음)`,
        iWalk >= 0 && iSit > iWalk && iLeave > iSit && iIdleAfter > iLeave,
        JSON.stringify(timeline),
      )
      r.check(
        `${name} 항목10 — reduced-motion에서도 매우 빠르게(4초 안) 전체 사이클 완료(sit-hold 단축, 생략 아님)`,
        timeline[timeline.length - 1] === 'idle',
        JSON.stringify(timeline),
      )

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

  // ── S8c — Stage4 모바일 터치 경로(390x844, CDP 신뢰 터치, S4와 동일
  // 기법): 터치 탭으로도 벤치 walk-to-sit이 동작함(부분 커버리지 — S4가
  // Stage2에 대해 그랬듯, 데스크톱 S8에서 이미 전부 검증한 항목을 터치
  // 경로에서 전부 재검증하지 않고 핵심 전이만 확인) ──
  {
    const vp = { width: 390, height: 844 }
    const name = 'S8c[390x844,flag-ON,touch,bench-sit]'
    const context = await browser.newContext({ viewport: vp, hasTouch: true })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const character = page.locator('[data-proto-character]')
      await character.waitFor({ state: 'attached', timeout: 5000 })
      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()
      const BENCH_REF = OBSTACLES_REF.find((o) => o.id === 'demo-bench')
      const benchCentrePx = {
        x: groundBox.x + groundBox.width * (((BENCH_REF.x0 + BENCH_REF.x1) / 2) / 100),
        y: groundBox.y + groundBox.height * (((BENCH_REF.y0 + BENCH_REF.y1) / 2) / 100),
      }

      await cdpTouchTap(context, page, benchCentrePx.x, benchCentrePx.y)
      const walkingAfterTouch = await waitUntil(async () => {
        const p = await character.getAttribute('data-character-phase').catch(() => null)
        return p === 'walking' ? p : false
      }, { timeout: 1500 })
      r.check(`${name} 항목12 — 터치 탭(CDP)으로 벤치를 향해 walking으로 전이됨`, walkingAfterTouch === 'walking', String(walkingAfterTouch))

      const sittingAfterTouch = await waitUntil(async () => {
        const p = await character.getAttribute('data-character-phase').catch(() => null)
        return p === 'sitting' ? p : false
      }, { timeout: 6000 })
      r.check(`${name} 항목12 — 터치 경로에서도 sitting으로 전이됨`, sittingAfterTouch === 'sitting', String(sittingAfterTouch))

      const idleAfterTouch = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 6000 })
      r.check(`${name} 항목12 — 터치 경로에서도 결국 idle로 복귀함(leaving 경유)`, !!idleAfterTouch)

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

  // ── S9 — 모바일 시각 보정(2026-09-23) 회귀: 그림자 가시성/좌석 앵커 오차/
  // 탭 타겟 크기/최소 렌더 크기/디버그 오버레이 기본 숨김을 360x800,
  // 390x844, 412x915(실기기 프리뷰가 보고된 뷰포트 대역) + 기존 1280x800
  // (비교군)에서 실측한다. 팀장 지시의 "실제 측정값을 보고에 기록" 요구에
  // 맞춰 각 단언 detail에 실측 px/opacity 값을 그대로 남긴다.
  const S9_VIEWPORTS = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 1280, height: 800 },
  ]
  // benchInteraction.js 상수 값 복제(이 파일의 기존 OBSTACLES_REF/
  // DEPTH_BANDS_REF와 동일 관례) — 벤치 아트 원본 종횡비/폭 하한/좌석 비율.
  const BENCH_ASSET_ASPECT_REF = 48 / 72
  const BENCH_ASSET_MIN_WIDTH_PX_REF = 44
  const SEAT_FRACTION_REF = 0.55
  const MIN_TAP_TARGET_PX_REF = 44
  // ProtoCharacter.jsx 상수 값 복제 — 그림자 px 하한(SHADOW_*_FLOOR_PX),
  // 캐릭터 렌더 폭 px 하한(CHARACTER_MIN_WIDTH_PX).
  const SHADOW_WIDTH_FLOOR_PX_REF = 22
  const SHADOW_HEIGHT_FLOOR_PX_REF = 6
  const CHARACTER_MIN_WIDTH_PX_REF = 40

  for (const vp of S9_VIEWPORTS) {
    const name = `S9[${vp.width}x${vp.height},mobile-visual-fix]`
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      // ── 디버그 오버레이 기본 숨김 — 쿼리 없이(baseURL 그대로) 로그인 ──
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(page)
      await waitForLoggedIn(page)

      const character = page.locator('[data-proto-character]')
      await character.waitFor({ state: 'attached', timeout: 5000 })
      const ground = page.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()
      const benchArt = page.locator('[data-testid="proto25d-bench-art"]')
      await benchArt.waitFor({ state: 'attached', timeout: 5000 })

      // ── 항목3 — 디버그 오버레이는 기본(쿼리 없음)일 때 DOM에 없음(이전
      // S2 관례와 동일하게 부재 자체를 확인 — 숨김 CSS가 아니라 렌더 자체를
      // 안 함, Proto25DScreen.jsx debugOverlaysEnabled 조건부 렌더) ──
      const debugObstacleCount = await page.locator('[data-testid="proto25d-obstacle"]').count()
      r.check(`${name} 항목3 — 기본(디버그 쿼리 없음)일 때 장애물 디버그 점선 상자/라벨이 DOM에 없음`, debugObstacleCount === 0, `count=${debugObstacleCount}`)

      // ── 항목1 — 그림자 크기/가시성(idle) ──
      const shadow = page.locator('[data-proto-character-shadow]')
      await shadow.waitFor({ state: 'attached', timeout: 5000 })
      const shadowMetrics = await shadow.evaluate((el) => {
        const cs = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return { width: rect.width, height: rect.height, opacity: cs.opacity, backgroundColor: cs.backgroundColor, display: cs.display, visibility: cs.visibility }
      })
      const shadowAlphaMatch = shadowMetrics.backgroundColor.match(/rgba?\(([^)]+)\)/)
      const shadowAlphaParts = shadowAlphaMatch ? shadowAlphaMatch[1].split(',').map((s) => parseFloat(s.trim())) : []
      const shadowAlpha = shadowAlphaParts.length === 4 ? shadowAlphaParts[3] : 1
      r.check(
        `${name} 항목1 — 그림자 렌더 폭이 px 하한(${SHADOW_WIDTH_FLOOR_PX_REF}px, 오차 허용 0.5px) 이상`,
        shadowMetrics.width >= SHADOW_WIDTH_FLOOR_PX_REF - 0.5,
        `width=${shadowMetrics.width}`,
      )
      r.check(
        `${name} 항목1 — 그림자 렌더 높이가 px 하한(${SHADOW_HEIGHT_FLOOR_PX_REF}px, 오차 허용 0.5px) 이상`,
        shadowMetrics.height >= SHADOW_HEIGHT_FLOOR_PX_REF - 0.5,
        `height=${shadowMetrics.height}`,
      )
      r.check(
        `${name} 항목1 — 그림자 alpha가 가시성 목표(0.18~0.22)이고 display/visibility가 실제로 보이는 상태`,
        shadowAlpha >= 0.18 && shadowAlpha <= 0.22 && shadowMetrics.display !== 'none' && shadowMetrics.visibility !== 'hidden',
        JSON.stringify(shadowMetrics),
      )

      // ── 항목4 — 캐릭터/벤치 렌더 px 크기가 하한 이상(idle 상태) ──
      // 캐릭터는 getComputedStyle().width(레이아웃 폭, CSS max(8%,40px)가
      // 그대로 반영됨)로 하한을 확인한다 — boundingBox()(getBoundingClientRect
      // 기반)는 depth scale(transform: scale(s), s는 [0.55,1.20]이라 1
      // 미만일 수 있음)까지 곱해진 "최종 시각 크기"라 하한보다 작게 보일 수
      // 있다(팀장 지시 원문 그대로 — "depth scale(s)은 base 위에 곱으로만
      // 적용, 하한은 base에 적용" — s<1이면 최종 시각 크기가 하한보다 작은
      // 게 의도된 동작).
      const charComputedWidth = await character.evaluate((el) => parseFloat(window.getComputedStyle(el).width))
      const benchBoxIdle = await benchArt.boundingBox()
      r.check(
        `${name} 항목4 — 캐릭터 base 레이아웃 폭(getComputedStyle, depth scale 적용 전)이 px 하한(${CHARACTER_MIN_WIDTH_PX_REF}px, 오차 허용 0.5px) 이상`,
        charComputedWidth >= CHARACTER_MIN_WIDTH_PX_REF - 0.5,
        `computedWidth=${charComputedWidth}`,
      )
      r.check(
        `${name} 항목4 — 벤치 아트 렌더 폭이 px 하한(${BENCH_ASSET_MIN_WIDTH_PX_REF}px, 오차 허용 0.5px) 이상`,
        benchBoxIdle.width >= BENCH_ASSET_MIN_WIDTH_PX_REF - 0.5,
        `width=${benchBoxIdle.width}`,
      )

      // ── 항목4 — 벤치 유효 탭 타겟 >= 44x44px, 패딩 가장자리를 탭해도
      // walk-to-sit이 시작됨(중심 탭은 S8/S8c가 이미 검증 — 여기서는 새로
      // 늘어난 패딩 가장자리를 탭) ──
      const BENCH_REF = OBSTACLES_REF.find((o) => o.id === 'demo-bench')
      const nominalWidthPxRef = groundBox.width * (BENCH_REF.x1 - BENCH_REF.x0) / 100
      const nominalHeightPxRef = groundBox.height * (BENCH_REF.y1 - BENCH_REF.y0) / 100
      const baseTapPadPct = 2 // benchInteraction.js BENCH_TAP_PAD_PCT 값 복제
      const neededPadXPx = Math.max(0, (MIN_TAP_TARGET_PX_REF - nominalWidthPxRef) / 2)
      const neededPadYPx = Math.max(0, (MIN_TAP_TARGET_PX_REF - nominalHeightPxRef) / 2)
      const padXPct = Math.max(baseTapPadPct, groundBox.width > 0 ? (neededPadXPx / groundBox.width) * 100 : 0)
      const padYPct = Math.max(baseTapPadPct, groundBox.height > 0 ? (neededPadYPx / groundBox.height) * 100 : 0)
      const effectiveWidthPx = ((BENCH_REF.x1 - BENCH_REF.x0) + 2 * padXPct) / 100 * groundBox.width
      const effectiveHeightPx = ((BENCH_REF.y1 - BENCH_REF.y0) + 2 * padYPct) / 100 * groundBox.height
      r.check(
        `${name} 항목4 — 벤치 유효 탭 타겟 폭이 ${MIN_TAP_TARGET_PX_REF}px 이상`,
        effectiveWidthPx >= MIN_TAP_TARGET_PX_REF - 0.5,
        `effectiveWidthPx=${effectiveWidthPx} padXPct=${padXPct}`,
      )
      r.check(
        `${name} 항목4 — 벤치 유효 탭 타겟 높이가 ${MIN_TAP_TARGET_PX_REF}px 이상`,
        effectiveHeightPx >= MIN_TAP_TARGET_PX_REF - 0.5,
        `effectiveHeightPx=${effectiveHeightPx} padYPct=${padYPct}`,
      )
      // 패딩 가장자리(원본 rect의 x0 바로 바깥, 패딩 안쪽 지점)를 탭해도
      // walk-to-sit 시퀀스가 시작되는지 확인.
      const paddedEdgePct = { x: BENCH_REF.x0 - (padXPct / 2), y: (BENCH_REF.y0 + BENCH_REF.y1) / 2 }
      const paddedEdgePx = { x: groundBox.x + groundBox.width * (paddedEdgePct.x / 100), y: groundBox.y + groundBox.height * (paddedEdgePct.y / 100) }
      await page.mouse.click(paddedEdgePx.x, paddedEdgePx.y)
      const walkingAfterPaddedTap = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
      ), { timeout: 1500 })
      r.check(
        `${name} 항목4 — 패딩 가장자리(벤치 박스 바로 바깥, 확장된 탭 여백 안)를 탭해도 walking(벤치 방향)으로 전이됨`,
        !!walkingAfterPaddedTap,
        `paddedEdgePct=${JSON.stringify(paddedEdgePct)}`,
      )
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'sitting', { timeout: 6000 })

      // ── 항목2 — 착석 지점 오차: 캐릭터의 실제 렌더 발 앵커(px)와, 벤치
      // 아트의 실측 boundingBox에서 독립적으로 유도한 "좌석선"(px) 사이의
      // 거리. app 내부 공식이 아니라 DOM에서 실측한 벤치 아트 크기로 다시
      // 계산해 앱의 seatFraction 적용이 실제 화면과 일치하는지 교차 검증
      // 한다 ── boundingBox()는 CSS transition이 실제로 페인트한 현재
      // 시각 위치를 읽으므로(style.left/top처럼 즉시 최종값이 되는 것과
      // 다름), sitting phase 감지 직후가 아니라 left/top 전이(ProtoCharacter.jsx
      // WALK_TRANSITION_MS=650ms)가 끝날 때까지 충분히 기다린 뒤 측정한다
      // (150ms만 기다렸을 때 전이 중간값을 읽어 오차가 실제로 27~39px까지
      // 크게 잘못 측정되는 것을 실측으로 확인 — 이 파일 세션 내 회귀 재현).
      await page.waitForTimeout(650 + 150)
      const benchBoxSeated = await benchArt.boundingBox()
      const charBoxSeated = await character.boundingBox()
      const expectedSeatPx = {
        x: benchBoxSeated.x + benchBoxSeated.width / 2,
        y: benchBoxSeated.y + benchBoxSeated.height - benchBoxSeated.height * SEAT_FRACTION_REF,
      }
      const actualFootAnchorPx = boxAnchor(charBoxSeated)
      const seatErrorPx = dist(expectedSeatPx, actualFootAnchorPx)
      r.check(
        `${name} 항목2 — 착석 시 캐릭터 발 앵커와 벤치 아트 실측 기반 좌석선 사이 오차 < 3px`,
        seatErrorPx != null && seatErrorPx < 3,
        `expectedSeatPx=${JSON.stringify(expectedSeatPx)} actualFootAnchorPx=${JSON.stringify(actualFootAnchorPx)} errorPx=${seatErrorPx}`,
      )
      r.check(
        `${name} 항목2 — 착석 지점이 벤치 아트의 세로 렌더 범위 안(붕 뜨지 않음)`,
        actualFootAnchorPx.y >= benchBoxSeated.y && actualFootAnchorPx.y <= benchBoxSeated.y + benchBoxSeated.height,
        `footY=${actualFootAnchorPx.y} benchTop=${benchBoxSeated.y} benchBottom=${benchBoxSeated.y + benchBoxSeated.height}`,
      )

      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 8000 })

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

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
