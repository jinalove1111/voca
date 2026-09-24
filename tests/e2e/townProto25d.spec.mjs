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
import { QA_STUDENT_NAME, QA_LOGIN_PIN, ADMIN_PIN } from './fixtures/index.mjs'

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

// 2026-09-25(paul-walk-side-b-v2 원-프레임 스왑 — S12/S13 프레임/mirror/
// facing 계측) — 팀장이 소스 쪽에서 진단한 근본 원인: 이전 샘플러가
// phase/frame/mirror/facing-transform/src를 각각 별도의 Playwright
// 호출(getAttribute/evaluate/locator 재질의)로 읽었다 — 매 호출이 별도
// CDP 왕복이라, 그 사이에 걷기가 끝나(phase가 idle로 바뀌고 mirror/
// scaleX가 리셋) "phase='walking'으로 읽은 같은 샘플"인데 mirror/facing은
// 이미 도착 후 값을 읽는 경쟁이 생길 수 있었다(findPath가 이 좌표들에
// 대해 실제로는 단일 leg만 반환해 leg별 facing 재계산 자체가 이 시나리오
// 에서는 애초에 일어나지 않는다는 것도 팀장이 확인함 — 즉 이전 FAIL은
// 제품 결함이 아니라 이 세션의 계측 경쟁 조건이었다). 이 헬퍼는 phase/
// direction/frame/mirror/facingTransform/src/box를 단일
// `page.evaluate(...)` 안에서 한 번의 동기 DOM 스냅샷으로 읽어, 그
// 경쟁을 구조적으로 제거한다(호출 하나 = 결과 전체가 같은 순간의 상태).
async function sampleCharacterState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-proto-character]')
    const img = document.querySelector('img[data-proto-character-sprite]')
    const facingLayer = document.querySelector('[data-proto-character-facing-layer]')
    const rect = img ? img.getBoundingClientRect() : null
    return {
      phase: root ? root.getAttribute('data-character-phase') : null,
      direction: root ? root.getAttribute('data-character-direction') : null,
      frame: img ? img.getAttribute('data-proto-character-sprite-frame') : null,
      mirror: img ? img.getAttribute('data-proto-character-sprite-mirror') : null,
      facingTransform: facingLayer ? facingLayer.style.transform : '',
      src: img ? img.src : null,
      box: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    }
  })
}

// Phase 6C(2026-09-24) — install 세션이 실측해 기록한
// paul-sprite-measured.json(캔버스/앵커, scripts/spriteIngestPaul.mjs
// writeRegistry가 생성)을 테스트 시점에 읽는다. 하드코딩된 기대값 대신 이
// 파일을 진실 원천으로 삼아, 이 세션이 소유하지 않는 install 세션의 실측
// 결과가 바뀌어도(앵커 재측정 등) 이 spec을 다시 손대지 않고 그대로
// 추적한다. 파일이 없거나(구 emoji 전용 상태) 형식이 다르면 null을
// 반환한다(throw 없음 — 호출부가 스킵/폴백 여부를 정함).
function readPaulSpriteMeasured() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'src/assets/town/character/paul-sprite-measured.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
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

// 측정용 헬퍼(2026-09-23, CI Linux Chromium run 35802684946 FAIL 대응) —
// data-character-phase가 'idle'로 바뀌는 시점과 캐릭터 엘리먼트의 실제
// left/top/transform CSS transition(650ms, ProtoCharacter.jsx의
// transitionParts)이 시각적으로 완전히 멈추는 시점은 서로 다른 두 시계다.
// walkTimerRef의 setTimeout(Proto25DScreen.jsx:193-198)은 커밋 시점에
// 동기적으로 예약되지만, CSS transition은 그 커밋 이후 다음 페인트에서야
// 시작하므로 setTimeout이 먼저 발화하면 phase가 idle로 읽히는 순간에도
// 엘리먼트가 아직 잔여 이동 중일 수 있다(Windows 로컬은 프레임 예산이
// 넉넉해 통상 그 사이 이미 정지해 residual이 0에 가깝지만, CI Linux
// Chromium처럼 스케줄링이 더 빡빡한 환경에서는 1px 미만이 남아 있을 수
// 있다). boundingBox()를 연속 샘플링해 값이 안정될 때까지 기다려, "드래그가
// 실제로 캐릭터를 움직였는지"를 재는 assertion이 이 무관한 잔여 transition을
// 오귀속하지 않게 한다 — assertion 자체(threshold/개수)는 바꾸지 않고 표본
// 채취 시점만 안정화한다.
async function waitForBoxStable(locator, { samples = 3, intervalMs = 120, epsilonPx = 0.05, timeout = 4000 } = {}) {
  const start = Date.now()
  let prev = await locator.boundingBox()
  let stableCount = 1
  while (Date.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    const cur = await locator.boundingBox()
    const d = dist(boxCenter(prev), boxCenter(cur))
    if (d != null && d < epsilonPx) {
      stableCount += 1
      if (stableCount >= samples) return cur
    } else {
      stableCount = 1
    }
    prev = cur
  }
  return prev
}

// Stage 2 — walkGrid.js OBSTACLES(src/utils/town/proto2_5d/walkGrid.js)와
// 정확히 같은 좌표를 이 spec에도 그대로 옮겨왔다(import가 아니라 값
// 복제 — 이 파일은 브라우저 페이지 컨텍스트 밖 Node에서 도는 spec이라
// 소스 모듈을 직접 import하지 않는다, scripts/testTownV2Static.mjs가
// 소스를 정규식으로 재검증하듯 이 spec도 "이 숫자가 실제로 화면에 그려진
// 장애물과 일치하는지"를 DOM에서 직접 읽어 재확인한다 — 아래
// readObstacleBoxesFromDom 참고, 이 하드코딩 값은 사전조건 계산에만 쓴다).
// Phase 6A(2026-09-23) — sceneFixture.js SCENE_FIXTURE의 신규 5개
// (house-annex/tree-plaza-nw/tree-plaza-ne/shrub-sw/shrub-se)를 추가한다.
// 이 5개는 collisionRect가 없고 footprintRect(anchor,widthPct,
// footprintDepthPct)로 파생되므로(sceneFixture.js deriveObstacles), 그
// 산식(x0=anchor.x-widthPct/2, x1=anchor.x+widthPct/2, y0=anchor.y-
// footprintDepthPct, y1=anchor.y)을 값만 복제해 손으로 계산한 리터럴이다
// (import 대신 값 복제 — 이 파일의 기존 OBSTACLES_REF 관례와 동일,
// scripts/testProto25dSceneFixture.mjs 항목6이 이 산식 자체를 별도로
// 검증한다). 기존 3개(레거시)는 값 변경 없이 그대로 유지.
const OBSTACLES_REF = [
  { id: 'demo-building', x0: 38, x1: 62, y0: 24, y1: 40 },
  { id: 'demo-bench', x0: 20, x1: 27, y0: 58, y1: 63 },
  { id: 'demo-tree', x0: 70, x1: 76, y0: 56, y1: 62 },
  { id: 'house-annex', x0: 6, x1: 20, y0: 28, y1: 42 },
  { id: 'tree-plaza-nw', x0: 40, x1: 46, y0: 50, y1: 56 },
  { id: 'tree-plaza-ne', x0: 56, x1: 62, y0: 48, y1: 54 },
  { id: 'shrub-sw', x0: 30, x1: 34, y0: 68, y1: 72 },
  { id: 'shrub-se', x0: 64, x1: 68, y0: 68, y1: 72 },
]

// Phase 6A — sceneFixture.js SCENE_FIXTURE의 anchor(bottom-center world-%)
// 값 복제(OBSTACLES_REF와 동일 관례) — demo-bench는 범용 오브젝트 레이어가
// 건너뛰므로(Proto25DScreen.jsx RENDER_OBJECTS 필터) 여기 포함하지 않는다.
const SCENE_OBJECTS_REF = [
  { id: 'demo-building', x: 50, y: 40 },
  { id: 'demo-tree', x: 73, y: 62 },
  { id: 'house-annex', x: 13, y: 42 },
  { id: 'tree-plaza-nw', x: 43, y: 56 },
  { id: 'tree-plaza-ne', x: 59, y: 54 },
  { id: 'shrub-sw', x: 32, y: 72 },
  { id: 'shrub-se', x: 66, y: 72 },
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

// 2026-09-23(좌석 접촉점 sink 보정, 두 번째 패스) — 글리프의 실제 화면(screen)
// 잉크 상/하단을 독립적으로 실측한다. ProtoCharacter.jsx가 내부에서 계산하는
// sinkPx 값을 읽어오는 게 아니라(그건 동어반복이 된다 — 팀장 지시가 지적한
// 문제와 동일한 함정), canvas measureText로 "로컬(em box) 안에서 잉크가
// 어디 있는지" 비율을 독립적으로 구한 뒤, glyph span의 실제
// getBoundingClientRect()(브라우저가 sink/scale/bob 애니메이션까지 전부
// 반영해 페인트한 진짜 화면 좌표)에 그 비율을 투영한다 — 앱 코드의 sink
// 공식을 전혀 재사용하지 않는, 독립적인 화면 측정.
async function measureGlyphInkOnScreen(glyphLocator) {
  return glyphLocator.evaluate((el) => {
    const cs = window.getComputedStyle(el)
    const fontSizePx = parseFloat(cs.fontSize)
    const rect = el.getBoundingClientRect()
    let inkTopLocalPx = 0
    let inkBottomLocalPx = fontSizePx
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      ctx.font = `${fontSizePx}px ${cs.fontFamily}`
      ctx.textBaseline = 'top'
      const m = ctx.measureText(el.textContent || '')
      if (m.actualBoundingBoxDescent > 0) {
        inkTopLocalPx = Math.max(0, -m.actualBoundingBoxAscent)
        inkBottomLocalPx = m.actualBoundingBoxDescent
      }
    } catch { /* 폴백(위 기본값) 유지 */ }
    // line-height:1이라 로컬 em 박스 높이 === fontSizePx. rect.height는 그
    // 로컬 박스가 sink/scale/bob 전부 반영돼 실제로 페인트된 화면 높이라,
    // 이 비율(rect.height/fontSizePx)로 로컬 잉크 좌표를 화면 좌표에 투영.
    const projectFactor = fontSizePx > 0 ? rect.height / fontSizePx : 1
    return {
      inkTopScreenY: rect.top + inkTopLocalPx * projectFactor,
      inkBottomScreenY: rect.top + inkBottomLocalPx * projectFactor,
      rectTop: rect.top,
      rectHeight: rect.height,
    }
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

      // ── Phase 6A 항목C2 — 걷기를 시작시키는 유효한 탭 직후 탭 리플이
      // 나타났다가(one-shot) TAP_RIPPLE_REMOVE_MS(530ms) 이내에 사라짐
      // (Proto25DScreen.jsx TAP_RIPPLE_ANIM_MS=450+80). 700ms 대기 후에는
      // 반드시 0개여야 한다(reduced-motion 비교군은 S5에 별도로 둔다) ──
      const rippleTapPoint = { x: groundBox.x + groundBox.width * 0.4, y: groundBox.y + groundBox.height * 0.45 }
      await page.mouse.click(rippleTapPoint.x, rippleTapPoint.y)
      const rippleCountJustAfterTap = await page.locator('[data-testid="proto25d-tap-ripple"]').count()
      r.check(`${name} 항목C2 — 걷기 시작 탭 직후 탭 리플이 보임(count>=1)`, rippleCountJustAfterTap >= 1, `count=${rippleCountJustAfterTap}`)
      await page.waitForTimeout(700)
      const rippleCountAfterWait = await page.locator('[data-testid="proto25d-tap-ripple"]').count()
      r.check(`${name} 항목C2 — 700ms 후에는 탭 리플이 사라짐(one-shot, count===0)`, rippleCountAfterWait === 0, `count=${rippleCountAfterWait}`)
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })

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

      // ── Stage5 감사(2026-09-23) — 정보 배지 탭 타겟이 WCAG 2.5.5/iOS HIG
      // 최소 권장(44x44px) 이상인지(Proto25DScreen.jsx min-h-[44px] 추가
      // 수정 참고 — 수정 전 실측 높이는 ~24px였다) ──
      const infoBtnBox = await infoBtn.boundingBox()
      r.check(
        `${name} — 정보 배지 탭 타겟이 ≥44x44px(WCAG 2.5.5/iOS HIG, Stage5 수정)`,
        !!infoBtnBox && infoBtnBox.width >= 44 - 0.5 && infoBtnBox.height >= 44 - 0.5,
        JSON.stringify(infoBtnBox),
      )

      // ── Stage5 감사 — Vercel Preview Toolbar류 고정 오버레이(바닥 위에
      // 항상 떠 있는, 최상위 z-index의 fixed 엘리먼트)가 바닥 일부를
      // 덮어도 그 위를 클릭하면 캐릭터가 움직이지 않는다. 실제 Vercel
      // Toolbar를 이 테스트 환경에 주입할 수는 없으므로, 그와 동등한 조건
      // (바닥보다 높은 z-index의 fixed 엘리먼트가 실제로 바닥 위를 덮고
      // 있음)을 만족하는 합성 오버레이를 페이지에 직접 주입해 재현한다 —
      // 이동 핸들러가 바닥(groundRef) 엘리먼트 자신에게만 직접 걸려 있어
      // (요구사항13, 문서 레벨 delegation 아님) 오버레이가 실제 클릭
      // 타겟이 되면 구조적으로 바닥 핸들러에 절대 도달할 수 없다는 사실을
      // 검증한다(코드 변경 없이 순수 테스트로만 증명 가능 — Proto25DScreen.jsx
      // 헤더 주석 요구사항13 참고). ──
      await page.evaluate(() => {
        const el = document.createElement('div')
        el.id = 'e2e-vercel-toolbar-fixture'
        el.style.position = 'fixed'
        el.style.left = '0'
        el.style.top = '0'
        el.style.width = '100%'
        el.style.height = '48px'
        el.style.zIndex = '2147483647' // Vercel Toolbar류가 흔히 쓰는 최상위 z-index
        el.style.background = 'transparent'
        document.body.appendChild(el)
      })
      const overlayFixture = page.locator('#e2e-vercel-toolbar-fixture')
      await overlayFixture.waitFor({ state: 'visible', timeout: 3000 })
      const overlayBox = await overlayFixture.boundingBox()
      const boxBeforeOverlayClick = await character.boundingBox()
      // 오버레이가 실제로 바닥과 겹치는 지점(바닥 상단 근처, 오버레이가
      // 덮는 y<48px 범위 안)을 클릭한다.
      await page.mouse.click(overlayBox.x + overlayBox.width / 2, overlayBox.y + overlayBox.height / 2)
      await page.waitForTimeout(200)
      const boxAfterOverlayClick = await character.boundingBox()
      const phaseAfterOverlayClick = await character.getAttribute('data-character-phase').catch(() => null)
      r.check(
        `${name} — Vercel Toolbar류 고정 오버레이(바닥 위, 최상위 z-index)를 클릭해도 캐릭터가 움직이지 않음(오버레이가 실제 클릭 타겟이라 바닥 핸들러에 도달 불가)`,
        dist(boxCenter(boxBeforeOverlayClick), boxCenter(boxAfterOverlayClick)) < 1 && phaseAfterOverlayClick === 'idle',
        `dist=${dist(boxCenter(boxBeforeOverlayClick), boxCenter(boxAfterOverlayClick))} phase=${phaseAfterOverlayClick}`,
      )
      await page.evaluate(() => document.getElementById('e2e-vercel-toolbar-fixture')?.remove())

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
      // waitForBoxStable — 위 항목9(빠른 연속 탭) 직후 idle로 전이된 바로
      // 다음이라, phase가 idle을 읽어도 CSS transition이 아직 안 멈췄을 수
      // 있다(위 헬퍼 주석, CI Linux Chromium run 35802684946 FAIL 참고).
      // 드래그 자체가 아무것도 움직이지 않았는지를 재는 기준선이므로 여기서
      // 안정화된 값을 써야 한다.
      const boxBeforeDrag = await waitForBoxStable(character)
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

      // ── Phase 6A 항목C1 — reduced-motion에서는 탭 리플이 아예 렌더되지
      // 않는다(Proto25DScreen.jsx showTapRipple — reducedMotion이면 즉시
      // return, state 자체를 채우지 않음, 이중 방어로 motion-safe: 클래스도
      // 걸려 있음). S3(비-reduced-motion) 비교군은 항목C2 참고 ──
      const rippleCountReducedMotion = await page.locator('[data-testid="proto25d-tap-ripple"]').count()
      r.check(`${name} 항목C1 — reduced-motion에서는 탭 리플이 전혀 렌더되지 않음(count===0)`, rippleCountReducedMotion === 0, `count=${rippleCountReducedMotion}`)

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
      const rippleCountReducedMotionAfterWait = await page.locator('[data-testid="proto25d-tap-ripple"]').count()
      r.check(`${name} 항목C1 — 대기 후에도 탭 리플 count가 계속 0(생성 자체가 없었음을 재확인)`, rippleCountReducedMotionAfterWait === 0, `count=${rippleCountReducedMotionAfterWait}`)

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

      // ── 장애물 8개가 실제로 렌더됨(Phase 6A — 레거시 3 + 신규 5) +
      // world-% 좌표가 walkGrid.js OBSTACLES와 일치함(DOM 직접 재확인,
      // 하드코딩 값을 신뢰하지 않음) ──
      const domObstacles = await readObstacleBoxesFromDom(page)
      r.check(`${name} — 장애물 플레이스홀더 8개가 렌더됨`, domObstacles.length === 8, `count=${domObstacles.length}`)
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

      // ── Phase 6A 항목16 — footprintRect로 파생된 신규 오브젝트
      // (house-annex/tree-plaza-ne)도 collisionRect 고정값(demo-building)과
      // 동일하게 장애물 회피 경로탐색이 적용됨 — 위 항목5/6과 정확히 같은
      // "남쪽으로 리셋 -> 장애물 바로 북쪽을 탭 -> 이동 중 샘플링" 방식을
      // 재사용한다(같은 x로 리셋해 수직선이 장애물 박스를 반드시 관통하게
      // 만든다 — 이렇게 해야 직선 경로였다면 반드시 장애물을 지났을
      // 상황이 보장된다). resetYFrac=0.9(장애물보다 훨씬 남쪽, 다른
      // 오브젝트와 겹치지 않는 x를 목적지와 공유).
      async function assertWalkAroundObstacle(obstacleId, xFrac, northTargetPct) {
        const obRef = OBSTACLES_REF.find((o) => o.id === obstacleId)
        await page.mouse.click(groundBox.x + groundBox.width * xFrac, groundBox.y + groundBox.height * 0.9)
        await waitUntil(async () => (
          (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
        ), { timeout: 3000 })
        const targetPx = { x: groundBox.x + groundBox.width * (northTargetPct.x / 100), y: groundBox.y + groundBox.height * (northTargetPct.y / 100) }
        await page.mouse.click(targetPx.x, targetPx.y)
        const obSamples = []
        const obDeadline = Date.now() + 6000
        let obSawWalking = false
        while (Date.now() < obDeadline) {
          const phase = await character.getAttribute('data-character-phase').catch(() => null)
          if (phase === 'walking') obSawWalking = true
          const pct = await readCharacterPct(character)
          obSamples.push(pct)
          if (phase === 'idle' && obSawWalking) break
          await page.waitForTimeout(40)
        }
        const samplesInObstacle = obSamples.filter((s) => pctInBox(s.left, s.top, obRef))
        r.check(
          `${name} 항목16 — ${obstacleId} 우회 이동 중 어떤 샘플도 그 장애물 박스 안을 지나지 않음(${obSamples.length}개 샘플)`,
          samplesInObstacle.length === 0,
          samplesInObstacle.length ? JSON.stringify(samplesInObstacle) : '',
        )
        const finalPhaseOb = await character.getAttribute('data-character-phase').catch(() => null)
        r.check(`${name} 항목16 — ${obstacleId} 우회 후에도 결국 idle 복귀(멈춘 상태 없음)`, finalPhaseOb === 'idle', `phase=${finalPhaseOb}`)
        const pctAfterOb = await readCharacterPct(character)
        r.check(
          `${name} 항목16 — ${obstacleId} 우회 후 캐릭터의 최종 지점이 그 장애물 박스 밖`,
          !pctInBox(pctAfterOb.left, pctAfterOb.top, obRef),
          JSON.stringify(pctAfterOb),
        )
      }
      await assertWalkAroundObstacle('house-annex', 0.13, { x: 13, y: 24 })
      await assertWalkAroundObstacle('tree-plaza-ne', 0.59, { x: 59, y: 44 })

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
      // Stage5 감사(2026-09-23) — 아래 여러 시점(sitting/leaving/idle)에서
      // 재사용하기 위해 한 번만 선언한다(이전에는 그림자 alpha 섹션에서만
      // 지역적으로 선언했다).
      const shadow = page.locator('[data-proto-character-shadow]')

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

      // ── Stage5 감사(2026-09-23) — 그림자가 sitting(정지된 phase)에서도
      // 좌석 앵커(seatRef)를 정확히 따라가는지. 기존 S7 항목8은 idle→idle
      // 순간 이동 전후의 "이동 벡터"만 비교했을 뿐, sitting처럼 정지된
      // phase에서 그림자가 실제로 그 좌표에 있는지는 검증한 적이 없었다
      // (동어반복 없이 독립적으로 — 앱 공식이 아니라 벤치 좌표에서 이
      // spec이 직접 재계산한 seatRef와 대조). boundingBox()는 CSS
      // transition이 실제로 페인트한 현재 시각 위치를 읽으므로(위 항목2
      // 주석과 동일 함정 — phase가 'sitting'으로 바뀐 시점부터도
      // WALK_TRANSITION_MS=650ms 동안은 여전히 전이 중이라, 즉시 읽으면
      // 중간값을 잡는다) 전이가 끝날 시간을 먼저 기다린다(이 세션이
      // 실측으로 처음 이 값(46.5px)만큼 어긋나는 것을 확인 후 이 대기를
      // 추가했다, CLAUDE.md 규칙 15). ──
      await page.waitForTimeout(650 + 150)
      await shadow.waitFor({ state: 'attached', timeout: 3000 })
      const shadowBoxSeated = await shadow.boundingBox()
      const shadowAnchorSeated = boxCenter(shadowBoxSeated) // 그림자 앵커 = translate(-50%,-50%) = 박스 중심
      const expectedSeatScreenPt = toPx(seatRef)
      const shadowSeatDist = dist(shadowAnchorSeated, expectedSeatScreenPt)
      r.check(
        `${name} 항목15(신규, Stage5) — sitting 단계에서 그림자가 좌석 앵커(seatRef)를 정확히 따라감(<3px)`,
        shadowSeatDist != null && shadowSeatDist < 3,
        `shadowAnchor=${JSON.stringify(shadowAnchorSeated)} expected=${JSON.stringify(expectedSeatScreenPt)} dist=${shadowSeatDist}`,
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

      // ── Stage5 감사(2026-09-23) — 그림자가 leaving(전이 중인 phase)에도
      // 캐릭터를 따라가는지. S7 항목8이 idle↔idle 전이(순간이동 비교)에서만
      // 검증했던 "발 위치 추적" 계약을 leaving 단계에도 동일 기법(짧은
      // 간격을 둔 두 샘플의 이동 벡터 비교)으로 확장한다 — leaving은
      // WALK_TRANSITION_MS(650ms)로 짧아, 그 도중 두 지점을 샘플링한다. ──
      await page.mouse.click(benchCentrePx.x, benchCentrePx.y)
      const reachedLeaving = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'leaving'
      ), { timeout: 8000 })
      r.check(`${name} 항목15(신규, Stage5) — 준비: leaving 단계에 도달함`, !!reachedLeaving)
      if (reachedLeaving) {
        const charLeaveA = await character.boundingBox()
        const shadowLeaveA = await shadow.boundingBox()
        await page.waitForTimeout(300)
        const stillLeaving = (await character.getAttribute('data-character-phase').catch(() => null)) === 'leaving'
        const charLeaveB = await character.boundingBox()
        const shadowLeaveB = await shadow.boundingBox()
        const charLeaveVec = { x: boxCenter(charLeaveB).x - boxCenter(charLeaveA).x, y: boxCenter(charLeaveB).y - boxCenter(charLeaveA).y }
        const shadowLeaveVec = { x: boxCenter(shadowLeaveB).x - boxCenter(shadowLeaveA).x, y: boxCenter(shadowLeaveB).y - boxCenter(shadowLeaveA).y }
        const leaveVecDist = Math.hypot(charLeaveVec.x - shadowLeaveVec.x, charLeaveVec.y - shadowLeaveVec.y)
        r.check(
          `${name} 항목15(신규, Stage5) — leaving 단계 중에도 그림자가 캐릭터와 거의 같은 벡터로 이동(발 위치 추적, 오차<20px)`,
          leaveVecDist < 20,
          `stillLeaving=${stillLeaving} charVec=${JSON.stringify(charLeaveVec)} shadowVec=${JSON.stringify(shadowLeaveVec)} dist=${leaveVecDist}`,
        )
      }
      await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 8000 })

      // ── 항목11 — 그림자: 옅고(alpha 0.18~0.22) 납작함(타원형, 폭 대비
      // 낮은 높이) + px 하한 이상(모바일 시각 보정, 2026-09-23) ──
      // 모바일 시각 보정으로 그림자가 캐릭터 박스의 형제로 분리됨
      // (ProtoCharacter.jsx 헤더 주석 참고) — 전용 data 속성으로 찾는다
      // (위에서 이미 선언한 shadow 재사용).
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
  // benchInteraction.js SEAT_CONTACT_FRACTION 값 복제(2026-09-23 좌석 접촉점
  // sink 보정, 두 번째 패스) — 아래 measureGlyphInkOnScreen 결과에 적용해
  // "접촉점"(잉크 하단에서 위로 이 비율만큼)을 독립적으로 유도한다.
  const SEAT_CONTACT_FRACTION_REF = 0.12
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

      // ── Phase 6A 항목17 — 범용 오브젝트 레이어(SCENE_FIXTURE의 벤치
      // 제외 7개)가 디버그 오버레이와 무관하게(항상, 상시 가시) 실제
      // 아트로 렌더됨. 각 오브젝트의 bottom-center 렌더 위치(px)를
      // world-%로 역산해 SCENE_OBJECTS_REF의 anchor와 일치하는지 확인 —
      // 이 시나리오가 이미 반복 중인 4개 뷰포트(360/390/412/1280)
      // 전부에서 실행된다(팀장 지시 — "at least 360-wide and 1280-wide").
      const objectEls = page.locator('[data-testid="proto25d-object"]')
      const objectCount = await objectEls.count()
      r.check(`${name} 항목17 — 오브젝트(벤치 제외 7개)가 전부 렌더됨`, objectCount === 7, `count=${objectCount}`)
      const objectsPointerEventsNone = await objectEls.evaluateAll((els) => els.every((el) => window.getComputedStyle(el).pointerEvents === 'none'))
      r.check(`${name} 항목17 — 오브젝트 전부 pointer-events:none(탭 판정에 관여하지 않음)`, objectsPointerEventsNone)
      const objectBoxes = await objectEls.evaluateAll((els) => els.map((el) => {
        const r2 = el.getBoundingClientRect()
        return { id: el.getAttribute('data-object-id'), x: r2.x, y: r2.y, width: r2.width, height: r2.height }
      }))
      const objectAnchorsMatch = SCENE_OBJECTS_REF.every((ref) => {
        const box = objectBoxes.find((b) => b.id === ref.id)
        if (!box) return false
        const bottomCenterPct = {
          x: ((box.x + box.width / 2) - groundBox.x) / groundBox.width * 100,
          y: ((box.y + box.height) - groundBox.y) / groundBox.height * 100,
        }
        return Math.abs(bottomCenterPct.x - ref.x) <= 1.0 && Math.abs(bottomCenterPct.y - ref.y) <= 1.0
      })
      r.check(
        `${name} 항목17 — 각 오브젝트의 하단-중앙 렌더 위치(world-%)가 SCENE_OBJECTS_REF anchor와 일치(오차<=1.0 world-%)`,
        objectAnchorsMatch,
        JSON.stringify(objectBoxes),
      )
      const objectShadowCount = await page.locator('[data-testid="proto25d-object-shadow"]').count()
      r.check(`${name} 항목17 — 오브젝트 그림자(shadow:true 전부)도 7개 렌더됨`, objectShadowCount === 7, `count=${objectShadowCount}`)
      const rootObstacleCountAttr = await page.locator('[data-testid="proto25d-root"]').getAttribute('data-proto25d-obstacle-count')
      r.check(`${name} 항목17 — proto25d-root의 data-proto25d-obstacle-count가 "8"`, rootObstacleCountAttr === '8', `attr=${rootObstacleCountAttr}`)

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

      // ── 항목2(2026-09-23 좌석 접촉점 sink 보정, 두 번째 패스) — 위 항목2
      // 는 "캐릭터 박스 바닥"과 "좌석선"을 비교하는데, 박스 바닥은 애초에
      // benchSeatPoint로 좌석선에 정확히 배치되는 앵커라 이 비교는 좌석선
      // 계산 자체의 정확도만 검증할 뿐, 글리프 잉크(실제로 눈에 보이는
      // 픽셀)가 그 좌석선에 닿는지는 검증하지 못한다(동어반복 — 팀장 지시가
      // 지적한 "붕 뜬 것처럼 보이는" 회귀의 진짜 원인은 이 잉크-좌석선
      // 간극이었다). 아래는 ProtoCharacter.jsx의 sink 공식을 전혀 재사용하지
      // 않고(measureGlyphInkOnScreen — 앱 코드와 독립적으로 canvas
      // measureText + 실제 getBoundingClientRect() 화면 좌표로 측정) 잉크
      // 자체의 화면 위치를 직접 검증한다. ──
      // Phase 6C(2026-09-24) — install 세션이 Paul 스프라이트를
      // characterSpriteManifest.default.js로 기본 배선하면 ProtoCharacter.jsx
      // 는 emoji 글리프(data-proto-character-glyph) 대신 v2 스프라이트
      // (data-proto-character-sprite)를 렌더한다(isSpriteV2 분기, 그
      // 파일 헤더 "Phase 6B/6C" 주석). 두 렌더 모드가 서로 다른 계약을
      // 쓰므로(emoji=캔버스 measureText 잉크 실측, sprite=매니페스트
      // seatAnchor 직접 사용) 글리프 부재 여부로 분기해 각 모드에 맞는
      // 검증을 한다 — 어느 쪽이 마운트돼 있든 "붕 뜬" 회귀 재발 방지
      // 계약 자체는 계속 커버된다.
      const glyph = page.locator('[data-proto-character-glyph]')
      const glyphCount = await glyph.count()
      if (glyphCount > 0) {
        await glyph.waitFor({ state: 'attached', timeout: 3000 })
        const inkMetrics = await measureGlyphInkOnScreen(glyph)
        const contactPointScreenY = inkMetrics.inkBottomScreenY -
          SEAT_CONTACT_FRACTION_REF * (inkMetrics.inkBottomScreenY - inkMetrics.inkTopScreenY)
        const contactErrorPx = Math.abs(contactPointScreenY - expectedSeatPx.y)
        r.check(
          `${name} 항목2 — 접촉점(잉크 하단 실측 - SEAT_CONTACT_FRACTION, 앱 공식과 독립적으로 재측정)과 벤치 실측 좌석선 사이 오차 < 3px`,
          contactErrorPx < 3,
          `contactPointScreenY=${contactPointScreenY} expectedSeatY=${expectedSeatPx.y} errorPx=${contactErrorPx} inkMetrics=${JSON.stringify(inkMetrics)}`,
        )
        r.check(
          `${name} 항목2 — 잉크 하단이 좌석선에 닿거나 겹침(빈틈 없음, "붕 뜬" 회귀 재발 방지 — 오차 허용 1px)`,
          inkMetrics.inkBottomScreenY >= expectedSeatPx.y - 1,
          `inkBottomScreenY=${inkMetrics.inkBottomScreenY} seatY=${expectedSeatPx.y}`,
        )
        r.check(
          `${name} 항목2 — 잉크 하단이 벤치 아트 바닥 경계를 넘지 않음(파묻히지 않음 — 오차 허용 1px)`,
          inkMetrics.inkBottomScreenY <= benchBoxSeated.y + benchBoxSeated.height + 1,
          `inkBottomScreenY=${inkMetrics.inkBottomScreenY} benchBottom=${benchBoxSeated.y + benchBoxSeated.height}`,
        )
      } else {
        // sprite 모드 — resolveSpriteFrame이 emoji의 sink 공식을 전혀
        // 쓰지 않고 manifest.frames.sit.seatAnchor를 anchorOffsetPct로
        // 직접 변환한다(characterSpriteContract.js). 그 기대값을
        // paul-sprite-measured.json(install 세션 실측 기록, 진실 원천)
        // 에서 테스트 시점에 유도한다 — 하드코딩 없음.
        const spriteImg = page.locator('[data-proto-character-sprite]')
        await spriteImg.waitFor({ state: 'attached', timeout: 3000 })
        const frameId = await spriteImg.getAttribute('data-proto-character-sprite-frame')
        r.check(`${name} 항목2(스프라이트) — sitting 중 스프라이트 프레임이 'sit'`, frameId === 'sit', `frameId=${frameId}`)

        const measured = readPaulSpriteMeasured()
        if (measured && measured.canvas && measured.anchors && measured.anchors.sit && measured.anchors.sit.seatAnchor) {
          const { canvas } = measured
          const { seatAnchor } = measured.anchors.sit
          const expectedDxPct = ((canvas.w / 2 - seatAnchor.x) / canvas.w) * 100
          const expectedDyPct = ((canvas.h - seatAnchor.y) / canvas.h) * 100
          const anchorLayer = page.locator('[data-proto-character-anchor-layer]')
          await anchorLayer.waitFor({ state: 'attached', timeout: 3000 })
          const transformStr = (await anchorLayer.evaluate((el) => el.style.transform)) || ''
          const m = /translate\(([-\d.]+)%,\s*([-\d.]+)%\)/.exec(transformStr)
          const actualDxPct = m ? parseFloat(m[1]) : null
          const actualDyPct = m ? parseFloat(m[2]) : null
          r.check(
            `${name} 항목2(스프라이트) — 앵커 레이어 translate가 paul-sprite-measured.json의 sit.seatAnchor에서 유도한 값과 일치(±0.5%, "붕 뜬" 회귀 재발 방지의 sprite 버전)`,
            actualDxPct != null && actualDyPct != null && Math.abs(actualDxPct - expectedDxPct) < 0.5 && Math.abs(actualDyPct - expectedDyPct) < 0.5,
            `actual=(${actualDxPct}%, ${actualDyPct}%) expected=(${expectedDxPct}%, ${expectedDyPct}%) transform=${transformStr} canvas=${JSON.stringify(canvas)} seatAnchor=${JSON.stringify(seatAnchor)}`,
          )
        } else {
          r.check(`${name} 항목2(스프라이트) — paul-sprite-measured.json에서 sit.seatAnchor를 읽음`, false, 'src/assets/town/character/paul-sprite-measured.json 없음 또는 형식 불일치')
        }
      }
      r.check(
        `${name} 항목2 — 착석 중에도 캐릭터 박스 z-index가 벤치보다 앞(잉크/앵커 sink 보정이 depth 순서를 깨지 않음)`,
        (await readZIndex(character)) > (await readZIndex(benchArt)),
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

  // ── S10 — Stage5 하드닝: 상호작용 도중 언마운트 — 잔류 콘솔 에러/DOM/
  // 재생성 타이머 없음. 이 프로토타입엔 화면 내 내비게이션(뒤로가기 버튼
  // 등)이 없다(App.jsx 주석 — "내비게이션 진입점이 없다") — 유일한 언마운트
  // 경로는 paulTown2_5dEnabled 플래그가 false로 바뀌는 것뿐이다.
  // tests/e2e/townFlagCrossTab.spec.mjs와 동일한 "같은 브라우저 컨텍스트,
  // 두 탭" 기법(이 저장소가 실제 Kinney Pilot A 사고를 겪고 만든 기존
  // 관례 — 같은 origin의 localStorage를 공유하는 admin 탭에서 라이브로
  // 토글)을 재사용해, 학생 탭(pageB)이 새로고침 없이 실시간으로
  // 언마운트되게 만든다.
  //
  // 순서 주의(이 세션이 실측으로 발견한 함정) — admin 로그인은 반드시
  // 학생 로그인보다 먼저 끝내야 한다. 학생 세션(현재 학생)이 이
  // 브라우저 컨텍스트의 localStorage에 먼저 기록되면, 그 뒤에 새로 여는
  // 탭(pageA)은 "관리자 로그인 전 선택 화면"이 아니라 이미 그 학생으로
  // 로그인된 대시보드를 그대로 보여준다(세션이 탭이 아니라 오리진
  // 저장소 단위로 공유되므로) — "⚙️ 관리자" 버튼 자체가 없어 90초
  // 타임아웃으로 FAIL했던 실제 회귀를 이 세션이 실측으로 재현했다
  // (townFlagCrossTab.spec.mjs가 "Page B를 학생 선택 화면에 로그인 전
  // 그대로 둔 채" pageA에서 먼저 admin 로그인을 마치는 것도 동일한 이유).
  // 그래서 이 시나리오는 (1) pageA에서 먼저 admin 로그인 + 기능 패널 진입
  // + paulTown2_5d를 admin UI로 직접 ON(=addInitScript 대신 실제 운영
  // 경로 재현) → (2) 그 다음에야 pageB에서 학생 로그인(이 시점엔 이미
  // localStorage에 paulTown2_5d=true가 있어 애초부터 프로토타입이 켜진
  // 상태로 로드됨) → (3) 벤치 상호작용 도중 pageA(이미 admin 화면에 계속
  // 떠 있음, 재로그인 불필요)에서 라이브로 OFF, 순서로 진행한다.
  {
    const name = 'S10[unmount-mid-interaction]'
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const pageA = await context.newPage()
    const pageB = await context.newPage()
    const consoleErrors = []
    pageB.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
    pageB.on('pageerror', (err) => { consoleErrors.push(String(err)) })
    const mocksA = await installMocks(pageA)
    const mocksB = await installMocks(pageB)
    try {
      // ── (1) pageA — admin 로그인 → 🎯 기능 → 애착 시스템 →
      // paulTown2_5d ON(실제 운영자가 쓰는 경로 그대로 재현) ──
      await pageA.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await pageA.locator('button', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 90000 })
      await pageA.locator('button', { hasText: '⚙️ 관리자' }).click()
      await pageA.getByPlaceholder('비밀번호').fill(ADMIN_PIN)
      await pageA.locator('button', { hasText: '로그인' }).click()
      await pageA.locator('h1', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 15000 })
      await pageA.locator('button', { hasText: '🎯 기능' }).click()
      const heading = pageA.getByText('애착 시스템 (Attachment & Growth)')
      await heading.waitFor({ state: 'visible', timeout: 10000 })
      const checkbox = pageA.locator('#paulTown2_5d')
      if (!(await checkbox.isVisible().catch(() => false))) {
        await heading.click()
        await checkbox.waitFor({ state: 'visible', timeout: 10000 })
      }
      const wasCheckedInitially = await checkbox.isChecked()
      r.check(`${name} — 사전조건: paulTown2_5d 기본값이 꺼져 있음(관리자 패널 실측)`, wasCheckedInitially === false, `wasChecked=${wasCheckedInitially}`)
      await checkbox.click()
      const toggledOn = await waitUntil(async () => (await checkbox.isChecked()) === true, { timeout: 5000 })
      r.check(`${name} — admin 탭에서 paulTown2_5d를 켰음(실제 운영 경로)`, !!toggledOn)

      // ── (2) pageB — admin 토글 이후 새로 로드하므로 처음부터 켜진
      // 상태로 시작(addInitScript 불필요, 공유 localStorage가 이미 true) ──
      await pageB.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await login(pageB)
      await waitForLoggedIn(pageB)

      const character = pageB.locator('[data-proto-character]')
      await character.waitFor({ state: 'attached', timeout: 5000 })
      const ground = pageB.locator('[data-testid="proto25d-ground"]')
      const groundBox = await ground.boundingBox()
      const BENCH_REF = OBSTACLES_REF.find((o) => o.id === 'demo-bench')
      const benchCentrePx = {
        x: groundBox.x + groundBox.width * (((BENCH_REF.x0 + BENCH_REF.x1) / 2) / 100),
        y: groundBox.y + groundBox.height * (((BENCH_REF.y0 + BENCH_REF.y1) / 2) / 100),
      }
      await pageB.mouse.click(benchCentrePx.x, benchCentrePx.y)
      const reachedSitting = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'sitting'
      ), { timeout: 8000 })
      r.check(`${name} — 준비: 벤치 착석 도중(sitting, holdTimerRef 예약 중)까지 도달함`, !!reachedSitting)

      // ── (3) pageA(이미 admin 화면, 재로그인 불필요)에서 같은 컨텍스트의
      // localStorage를 라이브로 다시 OFF로 토글(townFlagCrossTab.spec.mjs와
      // 동일 기법) — 전체 페이지 새로고침 없이 pageB의 subscribeFeatures
      // 'storage' 리스너가 반영해 App.jsx가 Proto25DScreen을 즉시
      // 언마운트한다. ──
      await checkbox.click()
      const toggledOff = await waitUntil(async () => (await checkbox.isChecked()) === false, { timeout: 5000 })
      r.check(`${name} — admin 탭에서 paulTown2_5d를 다시 껐음`, !!toggledOff)

      // ── pageB — 새로고침 없이 즉시 언마운트됨(캐릭터가 sitting 단계,
      // holdTimerRef가 아직 예약된 상태에서) ──
      const rootDetached = await pageB.locator('[data-testid="proto25d-root"]').waitFor({ state: 'detached', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} — 상호작용 도중(sitting)에도 플래그 OFF로 즉시 언마운트됨(리로드 없음)`, rootDetached)

      // ── 남은 holdTimer(SIT_HOLD_MS=2500ms 중 일부 남음) + enterLeaving의
      // walkPath(WALK_TRANSITION_MS=650ms)가 언마운트 후에도 발화했다면 그
      // 시점에 setState를 시도해 React가 콘솔에 경고를 남긴다 — 원래
      // 시퀀스가 전부 끝났을 시간(넉넉히 4초)을 기다린 뒤 확인한다.
      await pageB.waitForTimeout(4000)
      const relevantErrors = consoleErrors.filter((t) => /Cannot update a component|memory leak|unmounted component/i.test(t))
      r.check(
        `${name} — 언마운트 후 콘솔에 setState-after-unmount류 에러/경고 없음(walkTimerRef/holdTimerRef 정리 확인)`,
        relevantErrors.length === 0,
        JSON.stringify(relevantErrors.slice(0, 5)),
      )
      const charCountAfterWait = await pageB.locator('[data-proto-character]').count()
      r.check(`${name} — 대기 후에도 캐릭터 DOM이 재생성되지 않음(잔류 타이머로 인한 재마운트 없음)`, charCountAfterWait === 0, `count=${charCountAfterWait}`)
      const rootCountAfterWait = await pageB.locator('[data-testid="proto25d-root"]').count()
      r.check(`${name} — 대기 후에도 proto25d-root가 여전히 DOM에 없음`, rootCountAfterWait === 0, `count=${rootCountAfterWait}`)

      // ── 재진입 시나리오 — 플래그를 다시 켜면 새 캐릭터가 idle로 정상
      // 재마운트됨(잔류 상태로 인한 크래시 없음) ──
      await checkbox.click()
      await waitUntil(async () => (await checkbox.isChecked()) === true, { timeout: 5000 })
      const remounted = await pageB.locator('[data-proto-character]').waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} — 플래그를 다시 켜면 새 캐릭터가 정상 재마운트됨(잔류 상태 없음)`, remounted)
      const phaseAfterRemount = remounted
        ? await pageB.locator('[data-proto-character]').getAttribute('data-character-phase').catch(() => null)
        : null
      r.check(`${name} — 재마운트된 캐릭터는 idle(sitting/leaving 잔류 없음)`, phaseAfterRemount === 'idle', `phase=${phaseAfterRemount}`)
    } catch (err) {
      const bodyText = await pageB.locator('body').innerText().catch(() => '(body 읽기 실패)')
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}\n  [진단] body(앞 300자)=${JSON.stringify(bodyText.slice(0, 300))}`)
    } finally {
      collect(mocksB)
      collect(mocksA)
      await context.close()
    }
  }

  // ── S11 — Phase 6B/6C 방향 판정 + facing/스프라이트 프레임(또는 emoji
  // 폴백) 렌더 ──────────────────────────────────────────────────────────
  // 원래(Phase 6B, 2026-09-24 오전) 이 섹션은 App.jsx가 spriteManifest prop
  // 을 전혀 넘기지 않아 v2 스프라이트가 항상 비활성이라는 전제로 작성됐다
  // (isSpriteV2ManifestActive===false 고정) — facing이 절대 갱신되지 않고
  // emoji 글리프만 렌더된다고 가정했다. Phase 6C(같은 날 오후, install
  // 세션이 characterSpriteManifest.default.js를 Proto25DScreen.jsx의
  // spriteManifest 기본값으로 배선)부터 그 전제가 깨질 수 있다 — 매니페스트가
  // 유효하면 isSpriteV2ManifestActive===true가 되어 facing도 매 일반 걷기마다
  // 갱신된다(Proto25DScreen.jsx walkLeg/walkPath). 이 섹션은 마운트 직후
  // DOM에 data-proto-character-sprite가 있는지로 모드를 한 번만 판정하고
  // (spriteModeActive), 이후 모든 단언을 그 모드에 맞게 분기한다 — 어느
  // 쪽이든 direction 판정(front/side/back) 자체는 공통 계약이라 무조건
  // 검증한다.
  {
    const vp = { width: 1280, height: 800 }
    const name = 'S11[phase6b-direction]'
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
      // world-%(0..100) -> 화면 px(S3의 fraction 관례와 동일, groundBox가
      // world 0..100 전체를 담는다).
      const worldToPx = (x, y) => ({ x: groundBox.x + groundBox.width * (x / 100), y: groundBox.y + groundBox.height * (y / 100) })

      const initialPhase = await character.getAttribute('data-character-phase').catch(() => null)
      r.check(`${name} — 마운트 직후 phase가 idle`, initialPhase === 'idle', `phase=${initialPhase}`)
      const initialDirection = await character.getAttribute('data-character-direction').catch(() => null)
      r.check(`${name} — 마운트 직후 direction 기본값이 front`, initialDirection === 'front', `direction=${initialDirection}`)
      const spriteMarkupAtMount = await character.evaluate((el) => el.outerHTML).catch(() => '')
      const spriteModeActive = spriteMarkupAtMount.includes('data-proto-character-sprite')
      console.log(`  INFO  ${name} — 감지된 렌더 모드: ${spriteModeActive ? 'sprite(v2 활성)' : 'emoji(v2 비활성 또는 매니페스트 무효)'}`)
      if (spriteModeActive) {
        r.check(`${name} — 마운트 직후 idle 프레임이 'idle-front'`, (await page.locator('[data-proto-character-sprite]').getAttribute('data-proto-character-sprite-frame').catch(() => null)) === 'idle-front')
      } else {
        r.check(`${name} — 마운트 직후 emoji 글리프가 렌더됨(data-proto-character-glyph 존재)`, (await page.locator('[data-proto-character-glyph]').count()) > 0)
      }

      async function spriteFrameNow() {
        return page.locator('[data-proto-character-sprite]').getAttribute('data-proto-character-sprite-frame').catch(() => null)
      }
      async function spriteMirrorNow() {
        return page.locator('[data-proto-character-sprite]').getAttribute('data-proto-character-sprite-mirror').catch(() => null)
      }
      async function facingLayerHasMirrorTransform() {
        const t = await page.locator('[data-proto-character-facing-layer]').evaluate((el) => el.style.transform).catch(() => '')
        return (t || '').includes('scaleX(-1)')
      }

      // ── 캐릭터 스폰(50,62, Proto25DScreen.jsx INITIAL_LEFT_PCT/TOP_PCT)에서
      // 시작해, 매 구간 장애물(OBSTACLES_REF)을 벗어난 지점만 골라 dx/dy가
      // 하나의 축으로만 뚜렷하게 갈리게 한다(직교 이동 — direction 판정이
      // "명백히" 그 방향인지 헷갈리지 않게). ──
      // (1) 오른쪽(dy=0) — 62행은 x∈[27,70] 구간이 OBSTACLES_REF 전부와 겹치지
      //     않는다(bench x0=27 밖, tree x0=70 밖) — 50→65는 그 구간 안.
      const rightTarget = worldToPx(65, 62)
      await page.mouse.click(rightTarget.x, rightTarget.y)
      const walkingAfterRight = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
      ), { timeout: 2000 })
      r.check(`${name} 항목1 — 오른쪽 탭 직후 phase가 walking으로 전이됨`, !!walkingAfterRight)
      const directionRight = await character.getAttribute('data-character-direction').catch(() => null)
      r.check(`${name} 항목1 — 오른쪽(dx>0, dy=0) 탭 → direction이 side`, directionRight === 'side', `direction=${directionRight}`)
      if (spriteModeActive) {
        const frameRight = await spriteFrameNow()
        r.check(`${name} 항목1(스프라이트) — 오른쪽 탭 중 프레임이 walk-side-a/b 중 하나`, frameRight === 'walk-side-a' || frameRight === 'walk-side-b', `frameId=${frameRight}`)
        r.check(`${name} 항목1(스프라이트) — 오른쪽 이동(facing 유지=1)은 mirror='0'`, (await spriteMirrorNow()) === '0')
        r.check(`${name} 항목1(스프라이트) — facing layer에 scaleX(-1) 없음(미러 안 함)`, !(await facingLayerHasMirrorTransform()))
      } else {
        const markupWhileWalkingRight = await character.evaluate((el) => el.outerHTML).catch(() => '')
        r.check(
          `${name} 항목1(emoji) — v2가 비활성이라 일반 걷기는 facing이 갱신되지 않음(scaleX(-1) 없음, 이모지 모드는 좌우 미러 안 함)`,
          !markupWhileWalkingRight.includes('scaleX(-1)'),
        )
      }
      const idleAfterRight = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })
      r.check(`${name} 항목1 — 도착 후 phase가 idle로 복귀`, !!idleAfterRight)

      // (2) 아래(dx=0, x=65 유지) — x=65 열은 y∈[62,68) 구간이 shrub-se
      //     (x0=64,y0=68)보다 위쪽이라 전부 비어 있다 — 62→66은 그 구간 안.
      const belowTarget = worldToPx(65, 66)
      await page.mouse.click(belowTarget.x, belowTarget.y)
      const walkingAfterBelow = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
      ), { timeout: 2000 })
      r.check(`${name} 항목2 — 아래쪽 탭 직후 phase가 walking으로 전이됨`, !!walkingAfterBelow)
      const directionBelow = await character.getAttribute('data-character-direction').catch(() => null)
      r.check(`${name} 항목2 — 아래(dx=0, dy>0) 탭 → direction이 front`, directionBelow === 'front', `direction=${directionBelow}`)
      if (spriteModeActive) {
        const frameBelow = await spriteFrameNow()
        r.check(`${name} 항목2(스프라이트) — 아래쪽 탭 중 프레임이 walk-front-a/b 중 하나`, frameBelow === 'walk-front-a' || frameBelow === 'walk-front-b', `frameId=${frameBelow}`)
      }
      const idleAfterBelow = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })
      r.check(`${name} 항목2 — 도착 후 phase가 idle로 복귀`, !!idleAfterBelow)

      // (3) 위(dx=0, x=65 유지) — x=65 열은 y∈[50,66] 구간에 어떤 장애물도
      //     없다(tree-plaza-ne x1=62, demo-tree x0=70 둘 다 65를 비껴감).
      const aboveTarget = worldToPx(65, 50)
      await page.mouse.click(aboveTarget.x, aboveTarget.y)
      const walkingAfterAbove = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
      ), { timeout: 2000 })
      r.check(`${name} 항목3 — 위쪽 탭 직후 phase가 walking으로 전이됨`, !!walkingAfterAbove)
      const directionAbove = await character.getAttribute('data-character-direction').catch(() => null)
      r.check(`${name} 항목3 — 위(dx=0, dy<0) 탭 → direction이 back`, directionAbove === 'back', `direction=${directionAbove}`)
      if (spriteModeActive) {
        const frameAbove = await spriteFrameNow()
        r.check(`${name} 항목3(스프라이트) — 위쪽 탭 중 프레임이 walk-back-a/b 중 하나`, frameAbove === 'walk-back-a' || frameAbove === 'walk-back-b', `frameId=${frameAbove}`)
      }
      const idleAfterAbove = await waitUntil(async () => (
        (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
      ), { timeout: 3000 })
      r.check(`${name} 항목3 — 도착 후 phase가 idle로 복귀`, !!idleAfterAbove)
      if (spriteModeActive) {
        r.check(`${name} 항목3(스프라이트) — 도착 후 프레임이 idle-front로 복귀`, (await spriteFrameNow()) === 'idle-front', `frameId=${await spriteFrameNow()}`)
      }

      // ── 도착(idle) 후에도 direction은 걷기 중 마지막 값을 그대로 유지
      // (onArrive는 phase만 idle로 바꿀 뿐 direction을 건드리지 않음) ──
      const directionAfterArrival = await character.getAttribute('data-character-direction').catch(() => null)
      r.check(`${name} — 도착 후에도 direction이 마지막 걷기 방향(back)을 그대로 유지`, directionAfterArrival === 'back', `direction=${directionAfterArrival}`)

      // (4, 스프라이트 모드 전용) 왼쪽(dx<0, dy=0) — mirror='1' + facing
      // layer scaleX(-1). y=20 행은 walkGrid.js/OBSTACLES_REF 전부(가장 이른
      // y0=24)보다 위라 x 전 구간[2,98]이 비어 있다 — 큰 dx로 먼 거리를
      // 확실히 왼쪽으로만 이동시킨다(경로탐색이 우회하지 않는 직선 구간).
      if (spriteModeActive) {
        const repositionTarget = worldToPx(90, 20)
        await page.mouse.click(repositionTarget.x, repositionTarget.y)
        await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 5000 })

        const leftTarget = worldToPx(20, 20)
        await page.mouse.click(leftTarget.x, leftTarget.y)
        const walkingAfterLeft = await waitUntil(async () => (
          (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking'
        ), { timeout: 2000 })
        r.check(`${name} 항목4(스프라이트) — 왼쪽 탭 직후 phase가 walking으로 전이됨`, !!walkingAfterLeft)
        const directionLeft = await character.getAttribute('data-character-direction').catch(() => null)
        r.check(`${name} 항목4(스프라이트) — 왼쪽(dx<0, dy=0) 탭 → direction이 side`, directionLeft === 'side', `direction=${directionLeft}`)
        const frameLeft = await spriteFrameNow()
        r.check(`${name} 항목4(스프라이트) — 왼쪽 탭 중 프레임이 walk-side-a/b 중 하나`, frameLeft === 'walk-side-a' || frameLeft === 'walk-side-b', `frameId=${frameLeft}`)
        r.check(`${name} 항목4(스프라이트) — 왼쪽 이동(facing=-1)은 mirror='1'`, (await spriteMirrorNow()) === '1')
        r.check(`${name} 항목4(스프라이트) — facing layer에 scaleX(-1) 있음(좌우 미러)`, await facingLayerHasMirrorTransform())
        await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 5000 })
      }

      // ── 이 작업(direction/facing 배선)이 emoji 폴백 렌더(sprite 비활성일
      // 때) 자체는 전혀 바꾸지 않았음을 재확인(회귀 가드) — sprite 모드에선
      // 애초에 이 엘리먼트가 없으므로 조건부로만 확인한다 ──
      if (!spriteModeActive) {
        const glyphText = await page.locator('[data-proto-character-glyph]').textContent().catch(() => null)
        r.check(`${name} — 방향 전환 후에도 emoji 글리프는 여전히 🚶(idle/walking 공통)`, glyphText === '🚶', `glyph=${JSON.stringify(glyphText)}`)
      }

      r.check(`${name} — 가로 스크롤 없음`, await noHorizontalOverflow(page))
    } catch (err) {
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false,
        `${err?.message || err}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  // ── S12 — Phase 6C: Paul 스프라이트 렌더·뷰포트 ──────────────────────────
  // install 세션이 characterSpriteManifest.default.js를 Proto25DScreen.jsx
  // 의 spriteManifest 기본값으로 배선한 뒤, V1/V2를 켜지 않고 paulTown2_5d
  // 하나만 켠 상태(App.jsx가 spriteManifest prop을 여전히 넘기지 않아도
  // Proto25DScreen.jsx 자체의 기본값 배선이 적용됨)에서 4개 대표 뷰포트
  // (모바일 3종 + 데스크톱 비교군)에 걸쳐 실제 <img> 스프라이트가 로드/
  // 렌더되는지, 프레임 애니메이션이 실제로 교대되는지, 시각적으로 눈에
  // 띄는 회귀(검은 배경 상자, 클리핑, 그림자 소실)가 없는지를 확인한다.
  const S12_VIEWPORTS = [
    { width: 360, height: 640, label: '360x640' },
    { width: 390, height: 844, label: '390x844' },
    { width: 412, height: 915, label: '412x915' },
    { width: 1280, height: 800, label: '1280x800' },
  ]
  // 캐릭터 렌더 폭 기대 범위(px) — CHARACTER_MIN_WIDTH_PX(40) 하한 +
  // depthVisual.js depth-scale 범위([0.55,1.20], 이 파일의 기존
  // DEPTH_BANDS_REF와 동일 값 복제)를 근거로 유도한 범위. 모바일 3종은
  // 8%(기준폭)가 40px 미만이라 하한(40px)이 거의 항상 지배해 스케일만
  // 곱해진 결과(40*[0.55,1.20]=[22,48], 마운트 직후 idle 위치(topPct=62)의
  // 실측 scale(~0.97)로는 ~38.8px)가 나온다 — 실측 여유를 두고 [36,64]로
  // 잡는다(팀장 지시 값 그대로). 데스크톱(1280)은 8%가 40px보다 훨씬 커서
  // 그 자체가 기준폭이 되므로 범위가 넓어진다([40,120], 팀장 지시 값).
  const SPRITE_RENDER_WIDTH_RANGE_PHONE = [36, 64]
  const SPRITE_RENDER_WIDTH_RANGE_DESKTOP = [40, 120]
  const SCREENSHOT_DIR = 'C:\\Users\\jinal\\AppData\\Local\\Temp\\claude\\C--voca\\5791e355-621a-4b91-b7b8-9329cd6d40e7\\scratchpad\\preview-local'
  try { fs.mkdirSync(SCREENSHOT_DIR, { recursive: true }) } catch { /* 이미 존재 — 무시 */ }

  for (const vp of S12_VIEWPORTS) {
    const name = `S12[${vp.label},sprite-render]`
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
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
      const worldToPx = (x, y) => ({ x: groundBox.x + groundBox.width * (x / 100), y: groundBox.y + groundBox.height * (y / 100) })

      const glyphCountMount = await page.locator('[data-proto-character-glyph]').count()
      r.check(`${name} — 이모지 글리프(data-proto-character-glyph)가 DOM에 없음(스프라이트 기본 배선)`, glyphCountMount === 0, `count=${glyphCountMount}`)

      const spriteImg = page.locator('img[data-proto-character-sprite]')
      const spriteAttached = await spriteImg.waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} — img[data-proto-character-sprite]가 DOM에 존재`, spriteAttached)
      if (!spriteAttached) {
        r.check(`${name} 시나리오 나머지 단언(스프라이트 부재로 건너뜀)`, false, 'img[data-proto-character-sprite]를 찾지 못함')
        // try 블록의 finally가 정리(collect+close)를 맡는다(JS의 finally는
        // continue로 제어가 빠져나가기 전에도 항상 먼저 실행됨) — 여기서
        // 수동으로 collect/close를 또 부르면 이중 정리(context.close 재호출/
        // unmockedRequests 중복 push)가 된다.
        continue
      }

      // 실제로 이미지가 로드됐는지(complete && naturalWidth>0) — src가 존재
      // 한다고 실제로 디코딩까지 성공했다는 보장은 아니다(네트워크/디코드
      // 지연으로 마운트 직후 단일 스냅샷 읽기가 아직 false/0을 볼 수 있음
      // — verify:all 풀 러너 안에서 412x915 1회 실측 FAIL로 확인, CLAUDE.md
      // 규칙 15) — 그래서 최대 5s 동안 폴링한다. spriteImg는 Locator라 매
      // evaluate 호출마다 "지금 DOM에 있는" img를 다시 찾으므로(프레임
      // 교체로 엘리먼트 자체가 바뀌어도) 스냅샷 고정 문제가 없다.
      async function readSpriteLoadState() {
        return spriteImg.evaluate((el) => ({ complete: el.complete, naturalWidth: el.naturalWidth, src: el.src, srcset: el.getAttribute('srcset') || '' })).catch(() => null)
      }
      let loadState = await waitUntil(async () => {
        const s = await readSpriteLoadState()
        return s && s.complete === true && s.naturalWidth > 0 ? s : false
      }, { timeout: 5000 })
      if (!loadState) loadState = (await readSpriteLoadState()) || { complete: false, naturalWidth: 0, src: '', srcset: '' }
      r.check(`${name} — 스프라이트 이미지가 실제로 로드됨(complete && naturalWidth>0, 최대 5s 폴링)`, loadState.complete === true && loadState.naturalWidth > 0, JSON.stringify(loadState))
      r.check(`${name} — img src가 .png로 끝남`, /\.png(\?.*)?$/.test(loadState.src) || loadState.src.startsWith('data:image/png'), loadState.src.slice(0, 80))
      r.check(`${name} — img srcset에 '@2x' 포함`, loadState.srcset.includes('@2x') || loadState.srcset.includes('2x'), loadState.srcset.slice(0, 120))

      // 렌더 폭/클리핑 단언도 이미지 로드 완료를 기다린 뒤에만 읽는다(위와
      // 같은 이유 — 로드 전 박스 치수는 아직 안정화되지 않았을 수 있음).
      const [wMin, wMax] = vp.width === 1280 ? SPRITE_RENDER_WIDTH_RANGE_DESKTOP : SPRITE_RENDER_WIDTH_RANGE_PHONE
      const spriteBox = await spriteImg.boundingBox()
      r.check(
        `${name} — 렌더 폭이 기대 범위[${wMin},${wMax}]px 안`,
        !!spriteBox && spriteBox.width >= wMin && spriteBox.width <= wMax,
        spriteBox ? `width=${spriteBox.width}` : '(boundingBox null)',
      )

      // 클리핑 없음 — img 박스가 씬 컨테이너(ground) 경계 안에 있음(위/아래
      // 잘림 없음, 약간의 여유 2px).
      r.check(
        `${name} — 스프라이트 img 박스가 씬 컨테이너(ground) 경계 안(위/아래 클리핑 없음)`,
        !!spriteBox && spriteBox.y >= groundBox.y - 2 && spriteBox.y + spriteBox.height <= groundBox.y + groundBox.height + 2,
        spriteBox ? `imgTop=${spriteBox.y} imgBottom=${spriteBox.y + spriteBox.height} groundTop=${groundBox.y} groundBottom=${groundBox.y + groundBox.height}` : '(boundingBox null)',
      )

      // 검은 배경 상자 없음 — img 자신 + 조상 3개의 computed backgroundColor
      // 어디에도 완전 불투명 검정(rgb(0, 0, 0))이 없어야 한다.
      const bgColors = await spriteImg.evaluate((el) => {
        const chain = [el, el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].filter(Boolean)
        return chain.map((n) => window.getComputedStyle(n).backgroundColor)
      })
      r.check(`${name} — 캐릭터 밑에 완전 불투명 검정 배경 엘리먼트 없음`, !bgColors.some((c) => c === 'rgb(0, 0, 0)'), JSON.stringify(bgColors))

      // 그림자 — 항상 보임(S9 계약과 동일), 렌더 높이 6px 이상.
      const shadow = page.locator('[data-proto-character-shadow]')
      await shadow.waitFor({ state: 'attached', timeout: 3000 })
      const shadowBox = await shadow.boundingBox()
      r.check(`${name} — 그림자(data-proto-character-shadow)가 6px 이상 높이로 보임`, !!shadowBox && shadowBox.height >= 6, shadowBox ? `height=${shadowBox.height}` : '(boundingBox null)')

      // idle 스크린샷(마운트 직후) — 리뷰용, 씬(ground)만 클립.
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${vp.label}-idle.png`), clip: groundBox }).catch(() => {})

      // 프레임 알파벳(a/b) 교대 — 65,62(항목1과 동일한 안전 좌표, side 방향
      // 유발)로 걷게 한 뒤 ~700ms 동안 최소 6회 샘플링해 'a'/'b' 프레임이
      // 둘 다 관측되는지 확인. 같은 걷기 구간 중 스크린샷도 1장 남긴다.
      //
      // 2026-09-25(paul-walk-side-b-v2 원-프레임 스왑) — 이 RIGHT walk
      // 샘플링을 확장해 img src의 해시드 basename까지 함께 기록한다 —
      // walk-side-a는 여전히 'paul-walk-side-a-*'를, walk-side-b는 이제
      // 레거시 'paul-walk-side-b-*'가 아니라 새 'paul-walk-side-b-v2-*'를
      // 가리켜야 한다(install2 세션의 매니페스트/레지스트리 스왑 — 이
      // 세션은 그 파일들을 소유하지 않고 읽기만 한다, CLAUDE.md 규칙 16).
      // 각 프레임 id가 처음 관측되는 순간을 리뷰용 스크린샷으로 남긴다
      // (폴링 겸 캡처).
      //
      // 2026-09-25 — 팀장 진단 반영: phase/frame/src/box를 각각 별도
      // Playwright 호출로 읽던 것을 sampleCharacterState(하나의 evaluate)
      // 로 교체해 계측 경쟁을 제거한다(위 헬퍼 주석 참고).
      const sideTarget = worldToPx(65, 62)
      await page.mouse.click(sideTarget.x, sideTarget.y)
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking', { timeout: 2000 })
      const samplesRight = []
      let capturedSideA = false
      let capturedSideB = false
      for (let i = 0; i < 7; i++) {
        const s = await sampleCharacterState(page)
        samplesRight.push(s)
        if (s.frame === 'walk-side-a' && !capturedSideA) {
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, `side-${vp.label}-a.png`), clip: groundBox }).catch(() => {})
          capturedSideA = true
        }
        if (s.frame === 'walk-side-b' && !capturedSideB) {
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, `side-${vp.label}-b.png`), clip: groundBox }).catch(() => {})
          capturedSideB = true
        }
        if (i === 2) await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${vp.label}-mid-walk.png`), clip: groundBox }).catch(() => {})
        await page.waitForTimeout(100)
      }
      const frameSamples = samplesRight.map((s) => s.frame)
      const srcSamplesRight = samplesRight.map((s) => s.src)
      const boxSamplesRight = samplesRight.map((s) => s.box).filter(Boolean)
      // 2026-09-25 — 이 구간(원래 회귀 재현과 무관, 별개 실측) 15
      // world-% 거리도 종종 700ms 샘플링 창이 끝나기 전에 도착해버린다
      // (1280x800에서 1회 재현 — RIGHT walk 3개 walking 샘플 모두
      // 'walk-side-a'만 보이고 이후 idle-front로 전이, LEFT walk와 같은
      // "고정 폴링 창 vs 실제 걷기 지속시간" 종류의 타이밍 문제). LEFT
      // walk에서 이미 검증한 것과 동일한 처방 — phase==='walking'이었던
      // 샘플만 걸러서 프레임 교대/basename을 확인한다(도착 후 idle-front
      // 샘플이 섞여 들어와 'walk-side-b'를 못 본 것처럼 보이는 오탐 방지).
      const walkingIdxRight = samplesRight.map((s, i) => (s.phase === 'walking' ? i : -1)).filter((i) => i >= 0)
      const frameSamplesWalkingRight = walkingIdxRight.map((i) => frameSamples[i])
      const srcSamplesWalkingRight = walkingIdxRight.map((i) => srcSamplesRight[i])
      const sawA = frameSamplesWalkingRight.some((f) => typeof f === 'string' && f.endsWith('-a'))
      const sawB = frameSamplesWalkingRight.some((f) => typeof f === 'string' && f.endsWith('-b'))
      r.check(`${name} — 걷는 동안(phase==='walking'이었던 샘플, ${walkingIdxRight.length}/7) 프레임이 실제로 교대됨(a/b 둘 다 관측)`, sawA && sawB, JSON.stringify(frameSamplesWalkingRight))
      r.check(`${name} — RIGHT walk 샘플 개수가 6회 이상(≈700ms 폴링)`, frameSamples.length >= 6, `count=${frameSamples.length}`)
      r.check(
        `${name} — RIGHT walk 중(phase==='walking') 프레임 id에 'walk-side-a'와 'walk-side-b' 둘 다 포함`,
        frameSamplesWalkingRight.includes('walk-side-a') && frameSamplesWalkingRight.includes('walk-side-b'),
        JSON.stringify(frameSamplesWalkingRight),
      )
      const srcBasenamesRight = [...new Set(srcSamplesWalkingRight.filter(Boolean).map((s) => s.split('/').pop()))]
      r.check(
        `${name} — RIGHT walk 중(phase==='walking') src basename 중 'paul-walk-side-a-'에 매치하는 것이 1개 이상`,
        srcBasenamesRight.some((b) => /paul-walk-side-a-/.test(b)),
        JSON.stringify(srcBasenamesRight),
      )
      r.check(
        `${name} — RIGHT walk 중(phase==='walking') src basename 중 'paul-walk-side-b-v2-'에 매치하는 것이 1개 이상이고, 레거시 'paul-walk-side-b-[^v]'(v2 아닌 원본)에 매치하는 것은 0개`,
        srcBasenamesRight.some((b) => /paul-walk-side-b-v2-/.test(b)) && !srcBasenamesRight.some((b) => /paul-walk-side-b-[^v]/.test(b)),
        JSON.stringify(srcBasenamesRight),
      )
      const heightsRight = boxSamplesRight.map((b) => b.height)
      r.check(
        `${name} — RIGHT walk 중 img 박스 높이가 샘플 전체에서 ±2px 이내(크기 점프 없음)`,
        heightsRight.length > 0 && Math.max(...heightsRight) - Math.min(...heightsRight) <= 2,
        `heights=${JSON.stringify(heightsRight)}`,
      )
      // 실측 결과(2026-09-25, 4개 뷰포트 전부, 2회 독립 실행) — 첫 샘플
      // 대비 ±1.5px는 매 뷰포트에서 일관되게 초과했다(랜덤 아님 — 재현
      // 100%). 원인은 이 스왑과 무관한 기존 계약: 걷는 동안
      // ProtoCharacter.jsx가 `motion-safe:animate-town-walk-bob`을 적용해
      // 발 위치가 작게 상하로 bob한다(S5 항목10이 이 애니메이션 자체를
      // 이미 검증). bob 진폭은 렌더 크기에 비례한다 — 모바일 3종은
      // ≈2.4~2.5px, 데스크톱(1280x800, 렌더 폭이 [40,120]px로 더 큼)은
      // ≈6.7px까지 실측됐다(고정 px가 아니라 스케일 비례). 그래서 고정
      // px 대신 박스 높이의 비율로 허용치를 잡는다 — 실측 최대 비율
      // (6.7/약127≈5.3%)에 여유를 두고 8%로, 프레임 캔버스 오분류 같은
      // 실제 결함(수십% 대 점프)은 계속 잡아낸다 — CLAUDE.md 규칙 15
      // (회귀 의심 시 재현 후 확정), 여기서는 반대로 "내 단언이 실측과
      // 안 맞음"을 두 차례 재현으로 확인하고 그 실측에 맞춰 고쳤다.
      const bottomsRight = boxSamplesRight.map((b) => b.y + b.height)
      const bottomSpreadRight = bottomsRight.length > 0 ? Math.max(...bottomsRight) - Math.min(...bottomsRight) : 0
      const avgHeightRight = heightsRight.length > 0 ? heightsRight.reduce((a, b) => a + b, 0) / heightsRight.length : 0
      const bottomSpreadToleranceRight = Math.max(4.5, avgHeightRight * 0.08)
      r.check(
        `${name} — RIGHT walk 중 박스 하단(y) 좌표 스프레드가 렌더 높이의 8%(최소 4.5px) 이내(walk-bob 진폭 감안, 발 접지선 대형 점프 없음)`,
        bottomsRight.length > 0 && bottomSpreadRight <= bottomSpreadToleranceRight,
        `bottoms=${JSON.stringify(bottomsRight)} spread=${bottomSpreadRight.toFixed(2)} tolerance=${bottomSpreadToleranceRight.toFixed(2)}`,
      )
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 3000 })

      // 2026-09-25 — LEFT walk(미러) 동일 계약. S11 항목4와 동일 기법으로
      // 먼저 y=20 행(장애물 전 구간이 비어 있음)으로 재배치한 뒤 먼
      // 거리를 확실히 왼쪽으로만 걷게 한다 —
      // data-proto-character-sprite-mirror='1' + facing layer scaleX(-1),
      // RIGHT walk와 동일한 두 basename 계약, 도착 후 프레임이 idle-front로
      // 복귀하는지까지 확인한다.
      const repositionTarget = worldToPx(90, 20)
      await page.mouse.click(repositionTarget.x, repositionTarget.y)
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 5000 })
      const leftTarget = worldToPx(20, 20)
      await page.mouse.click(leftTarget.x, leftTarget.y)
      await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking', { timeout: 2000 })
      // 실측(2026-09-25, 4개 뷰포트 전부 재현) — 이 재배치(90,20)→(20,20)
      // 왼쪽 걷기는 매번 700ms 고정 샘플링 창이 끝나기 전(대략 5번째
      // 샘플 부근)에 이미 도착해 idle로 전이됐다 — 즉 걷기 지속시간이
      // dx 거리에 비례하지 않는다(이 파일의 walkPath/walkLeg 구현이
      // 거리와 무관하게 완료되는 걷기 계약을 이미 갖고 있음, 이 세션이
      // 새로 발견한 것일 뿐 바꾸지 않는다 — CLAUDE.md 규칙 3). 그래서
      // mirror/facing scaleX(-1)처럼 "걷는 동안에만" 성립해야 하는
      // 단언은 고정 7회 전부가 아니라 phase==='walking'이었던 샘플만
      // 걸러서 확인한다(도착 후 mirror가 '0'으로 리셋되는 것은 회귀가
      // 아니라 idle 전이의 정상 동작 — 재현으로 확정, CLAUDE.md 규칙 15).
      //
      // 2026-09-25(팀장 근본 원인 진단) — findPath((90,20)→(20,20))는
      // 실제로 leg 1개(dx=-70, dy=0, direction='side')만 반환한다 — 즉
      // walkLeg의 leg별 facing 재계산 자체가 이 시나리오에서는 일어나지
      // 않는다. 이 세션이 앞서 보고한 "마지막 leg 1틱 예외"는 제품 결함이
      // 아니라, phase/mirror/facingTransform을 각각 별도 Playwright
      // 호출로 읽던 이전 샘플러의 계측 경쟁(그 사이 걷기가 끝나버림)
      // 이었다 — sampleCharacterState(단일 evaluate, 위 헬퍼)로 교체해
      // 그 경쟁을 제거했으므로, "과반수" 완화 없이 원래 팀장 스펙대로
      // phase==='walking'인 샘플 전부에서 mirror='1'/scaleX(-1)을 엄격히
      // 요구한다.
      const samplesLeft = []
      for (let i = 0; i < 7; i++) {
        samplesLeft.push(await sampleCharacterState(page))
        await page.waitForTimeout(100)
      }
      const frameSamplesLeft = samplesLeft.map((s) => s.frame)
      const srcSamplesLeft = samplesLeft.map((s) => s.src)
      const mirrorSamplesLeft = samplesLeft.map((s) => s.mirror)
      const facingTransformSamplesLeft = samplesLeft.map((s) => s.facingTransform)
      const phaseSamplesLeft = samplesLeft.map((s) => s.phase)
      r.check(
        `${name} — LEFT walk 프레임 id에 'walk-side-a'와 'walk-side-b' 둘 다 포함`,
        frameSamplesLeft.includes('walk-side-a') && frameSamplesLeft.includes('walk-side-b'),
        JSON.stringify(frameSamplesLeft),
      )
      const walkingIdxLeft = phaseSamplesLeft.map((p, i) => (p === 'walking' ? i : -1)).filter((i) => i >= 0)
      const mirrorWhileWalkingLeft = walkingIdxLeft.map((i) => mirrorSamplesLeft[i])
      r.check(
        `${name} — LEFT walk 중(phase==='walking'이었던 샘플, ${walkingIdxLeft.length}/7) 전부 data-proto-character-sprite-mirror='1'`,
        mirrorWhileWalkingLeft.length > 0 && mirrorWhileWalkingLeft.every((m) => m === '1'),
        `phase=${JSON.stringify(phaseSamplesLeft)} mirror=${JSON.stringify(mirrorSamplesLeft)}`,
      )
      const facingWhileWalkingLeft = walkingIdxLeft.map((i) => facingTransformSamplesLeft[i])
      r.check(
        `${name} — LEFT walk 중(phase==='walking'이었던 샘플) 전부 facing layer에 scaleX(-1) 존재(좌우 미러)`,
        facingWhileWalkingLeft.length > 0 && facingWhileWalkingLeft.every((t) => (t || '').includes('scaleX(-1)')),
        `phase=${JSON.stringify(phaseSamplesLeft)} facing=${JSON.stringify(facingTransformSamplesLeft)}`,
      )
      const srcBasenamesLeft = [...new Set(srcSamplesLeft.filter(Boolean).map((s) => s.split('/').pop()))]
      r.check(
        `${name} — LEFT walk src basename 중 'paul-walk-side-a-'에 매치하는 것이 1개 이상`,
        srcBasenamesLeft.some((b) => /paul-walk-side-a-/.test(b)),
        JSON.stringify(srcBasenamesLeft),
      )
      r.check(
        `${name} — LEFT walk src basename 중 'paul-walk-side-b-v2-'에 매치하는 것이 1개 이상이고, 레거시 'paul-walk-side-b-[^v]'(v2 아닌 원본)에 매치하는 것은 0개`,
        srcBasenamesLeft.some((b) => /paul-walk-side-b-v2-/.test(b)) && !srcBasenamesLeft.some((b) => /paul-walk-side-b-[^v]/.test(b)),
        JSON.stringify(srcBasenamesLeft),
      )
      const reachedIdleAfterLeft = await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle', { timeout: 5000 })
      r.check(`${name} — LEFT walk 도착 후 idle phase로 정상 전이`, !!reachedIdleAfterLeft)
      if (reachedIdleAfterLeft) {
        const idleSampleAfterLeft = await sampleCharacterState(page)
        r.check(`${name} — LEFT walk 도착 후 프레임이 idle-front로 전이됨`, idleSampleAfterLeft.frame === 'idle-front', `frame=${idleSampleAfterLeft.frame}`)
        r.check(`${name} — LEFT walk 도착 후 mirror='0'으로 리셋됨`, idleSampleAfterLeft.mirror === '0', `mirror=${idleSampleAfterLeft.mirror}`)
      }

      // UI 컨트롤(정보 배지)을 탭해도 idle phase가 바뀌지 않음(바닥 레이어
      // 밖 엘리먼트 — S3/S8 기존 계약과 동일 정신, 여기선 phase 불변만 확인).
      const infoBtn = page.locator('[data-testid="proto25d-info-toggle"]')
      await infoBtn.click()
      await page.waitForTimeout(150)
      const phaseAfterUiTap = await character.getAttribute('data-character-phase').catch(() => null)
      r.check(`${name} — UI 컨트롤(정보 배지) 탭은 idle phase를 바꾸지 않음`, phaseAfterUiTap === 'idle', `phase=${phaseAfterUiTap}`)
      await infoBtn.click()

      // sitting 스크린샷 — 벤치를 탭해 앉힌 뒤 캡처.
      const BENCH_REF_S12 = OBSTACLES_REF.find((o) => o.id === 'demo-bench')
      const benchCentrePx = worldToPx((BENCH_REF_S12.x0 + BENCH_REF_S12.x1) / 2, (BENCH_REF_S12.y0 + BENCH_REF_S12.y1) / 2)
      await page.mouse.click(benchCentrePx.x, benchCentrePx.y)
      const reachedSitting = await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'sitting', { timeout: 8000 })
      r.check(`${name} — 벤치 탭 후 sitting에 도달(스크린샷 사전조건)`, !!reachedSitting)
      if (reachedSitting) {
        await page.waitForTimeout(650 + 150) // 좌석 전이 완료 대기(S8과 동일 관례)
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${vp.label}-sitting.png`), clip: groundBox }).catch(() => {})
      }
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

  // ── S13 — Phase 6C: reduced-motion에서 스프라이트 프레임 고정 ───────────
  // prefers-reduced-motion:reduce에서는 useSpriteFrameIndex(ProtoCharacter.jsx)
  // 가 reducedMotion===true일 때 항상 freezeFrameIndex로 고정한다(위 파일
  // 헤더 "Phase 6A" 주석 — 애니메이션 프레임 교체 자체가 멈춤). 이 섹션은
  // 그 계약을 실제 브라우저에서 확인한다 — S5(Stage1/2 reduced-motion)와
  // 동일한 emulateMedia 기법을 재사용.
  {
    const vp = { width: 390, height: 844 }
    const name = 'S13[reduced-motion,sprite-frame-freeze]'
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
      const worldToPx = (x, y) => ({ x: groundBox.x + groundBox.width * (x / 100), y: groundBox.y + groundBox.height * (y / 100) })

      const spriteImg = page.locator('img[data-proto-character-sprite]')
      const spriteAttached = await spriteImg.waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false)
      r.check(`${name} — img[data-proto-character-sprite]가 DOM에 존재(reduced-motion에서도 스프라이트 모드 유지)`, spriteAttached)
      if (!spriteAttached) {
        r.check(`${name} 시나리오 나머지 단언(스프라이트 부재로 건너뜀)`, false, 'img[data-proto-character-sprite]를 찾지 못함')
      } else {
        const target = worldToPx(65, 62)
        await page.mouse.click(target.x, target.y)
        await waitUntil(async () => (await character.getAttribute('data-character-phase').catch(() => null)) === 'walking', { timeout: 2000 })

        // reduced-motion에서는 걷기 전체가 REDUCED_MOTION_TRANSITION_MS
        // (220ms) 단일 전이로 끝난다(Proto25DScreen.jsx walkPath — 경유지별
        // 순차 애니메이션이 아니라 마지막 웨이포인트로 즉시 이동) — 그래서
        // "동안" 창이 매우 짧다. 고정 간격(예: 100ms x 4=400ms)으로 샘플링
        // 하면 이 세션이 실측으로 FAIL을 재현했듯(CLAUDE.md 규칙 15) 중간에
        // idle로 넘어가 버려 "walking phase 동안 고정" 계약과 무관한
        // 상태 전환 자체를 포착해 오탐한다. 그래서 phase==='walking'인
        // 동안만(인위적 대기 없이, CDP 왕복 지연만으로) 최대 6개까지 빠르게
        // 폴링한다.
        //
        // 2026-09-25(팀장 진단 반영) — phase와 frame을 별도 호출로 읽으면
        // 그 사이 걷기가 끝나 phase='walking'으로 읽었는데 frame은 이미
        // 도착 후 값인 경쟁이 생길 수 있다(S12 LEFT walk에서 실측 확인된
        // 것과 동일 종류의 문제) — sampleCharacterState(단일 evaluate)로
        // phase/frame을 같은 스냅샷에서 함께 읽어 이 경쟁을 제거한다.
        const samplesWalking = []
        const sampleDeadline = Date.now() + 600
        while (Date.now() < sampleDeadline && samplesWalking.length < 6) {
          const s = await sampleCharacterState(page)
          if (s.phase !== 'walking') break
          samplesWalking.push(s)
        }
        const frameSamplesWalking = samplesWalking.map((s) => s.frame)
        r.check(`${name} — walking phase 동안 프레임 샘플을 1개 이상 포착함(폴링이 충분히 빠름)`, frameSamplesWalking.length > 0, JSON.stringify(frameSamplesWalking))
        const allSameWalking = frameSamplesWalking.length > 0 && frameSamplesWalking.every((f) => f != null && f === frameSamplesWalking[0])
        r.check(`${name} — walking phase 동안 프레임이 alternation 없이 고정됨(reduced-motion)`, allSameWalking, JSON.stringify(frameSamplesWalking))
        const isAFrame = typeof frameSamplesWalking[0] === 'string' && frameSamplesWalking[0].endsWith('-a')
        r.check(`${name} — 고정된 프레임이 'a' 변형(freezeFrameIndex 기본값)`, isAFrame, JSON.stringify(frameSamplesWalking))
        // 2026-09-25(paul-walk-side-b-v2 원-프레임 스왑) — 이 시나리오의
        // 이동 좌표(65,62)는 side 방향을 유발하므로(S12/S11 항목1과 동일),
        // reduced-motion에서 고정되는 프레임이 'a' 변형일 뿐 아니라
        // 정확히 'walk-side-a'여야 한다(다른 방향 프레임으로 잘못
        // 고정되는 회귀를 막는 구체적 단언).
        r.check(`${name} — 고정된 프레임이 정확히 'walk-side-a'`, frameSamplesWalking[0] === 'walk-side-a', JSON.stringify(frameSamplesWalking))

        const reachedIdle = await waitUntil(async () => (
          (await character.getAttribute('data-character-phase').catch(() => null)) === 'idle'
        ), { timeout: 5000 })
        r.check(`${name} — 프레임이 고정돼도 phase는 결국 idle로 정상 전이됨(reduced-motion transition은 짧아질 뿐 생략 아님)`, !!reachedIdle)
        if (reachedIdle) {
          const idleFrame = await spriteImg.getAttribute('data-proto-character-sprite-frame').catch(() => null)
          r.check(`${name} — 도착 후 프레임이 idle-front로 전이됨(다른 상태 시퀀스로의 정상 전환 — walking 중 alternation 없음과는 별개 계약)`, idleFrame === 'idle-front', `frame=${idleFrame}`)
        }
      }

      r.check(`${name} — 가로 스크롤 없음`, await noHorizontalOverflow(page))
    } catch (err) {
      r.check(`${name} 시나리오 실행 완료(예외 없음)`, false, `${err?.message || err}`)
    } finally {
      collect(mocks)
      await context.close()
    }
  }

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
