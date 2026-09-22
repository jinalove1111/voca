// tests/e2e/townProto25d.spec.mjs
//
// Paul Town 2.5D 캐릭터 프로토타입(paulTown2_5d, Stage 1, 2026-09-22) 회귀 —
// src/components/town/proto2_5d/*가 기존 Paul Town V1/V2와 완전히 독립된
// 격리 실험(공유 상태/게이팅 없음)으로 동작하는지 검증한다. townV2.spec.mjs와
// 동일한 mock 전체 가로채기(installMocks) + 결정론 폴링(waitUntil) 관례를
// 따르되, 새 파일이라 필요한 소규모 헬퍼는 복제한다(파일당 소유권 원칙,
// CLAUDE.md 규칙 16 — 다른 spec과 동시에 같은 파일을 건드리지 않게).
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
    const name = 'S6[1280x800,flag-ON,obstacles]'
    const context = await browser.newContext({ viewport: vp })
    const page = await context.newPage()
    await setDeviceFlags(page, { paulTown2_5d: true })
    const mocks = await installMocks(page)
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
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

  return { results: r.results, unmockedRequests, mockErrors, ttsFallbackRequests }
}
