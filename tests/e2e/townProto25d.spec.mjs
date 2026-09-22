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
