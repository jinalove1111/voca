// scripts/town-art/shootRenderer.mjs — Paul Town V2 world-coordinate 렌더러
// 스크린샷 도구(2026-09-18, 작업 지시서 STEP 4).
//
// scripts/testBrowserE2E.mjs와 동일한 방식으로 빌드 산출물을 vite
// preview로 띄우고(dist/ 없으면 먼저 build), tests/e2e/lib/mockRoutes.mjs의
// 전체 네트워크 mock(installMocks — 실 Supabase/Vercel 요청 0건)으로 QA
// 픽스처 학생을 로그인시킨 뒤, 그 Playwright 컨텍스트의 localStorage에만
// paulTownV1+paulTownV2 플래그를 심는다(tests/e2e/townV2.spec.mjs가 이미
// 쓰는 것과 정확히 같은 setDeviceFlags 패턴 — 실제 배포본 플래그 기본값은
// 건드리지 않는다). 마을 레벨/보유 랜드마크는 mockRoutes.mjs의
// townState(starsEarned/owned)로 제어한다.
//
// 이 도구는 순수 개발/QA 보조 스크립트다 — npm run verify:*에 등록되지
// 않고(tests/harness/registry.mjs 미등록), 통과/실패를 자동 판정하는
// 테스트가 아니라 사람이 스크린샷을 눈으로 확인하기 위한 것이다. 다만
// 명백한 구조적 결함(가로 스크롤/페이지 에러/환경 자산 요청 실패)은 exit
// code 1 + 콘솔 라인으로 fail-closed 신호를 준다.
//
// CLI:
//   node scripts/town-art/shootRenderer.mjs --levels 1,3,4,5,8 --widths 360,390,430 [--zoom2] [--owned all|none] [--out <dir>] [--place "<x>,<y>=<itemId>,..."] [--legacy "<x>,<y>=<itemId>,..."] [--fullpage]
// 기본값: --levels 4 --widths 390 --owned all --out art-staging/renderer-previews/
// (--out 기본 디렉터리는 .gitignore의 art-staging/ 아래라 커밋되지 않는다.)
//
// 2026-09-18(D1 정정 증거용) — --legacy "<x>,<y>=<itemId>,..."는 --place와
// 달리 실제 UI를 밟지 않는다(구 8x6 시절 이미 배치돼 저장돼 있던 레거시
// 기록을 재현하는 것이 목적이라, "지금 이 세션에서 새로 배치"하는 --place
// 흐름과 의미가 다르다) — installMocks()의 tables 오버라이드로
// student_progress.progress_data.townPlacements에 직접 심는다
// (tests/e2e/townV2.spec.mjs S8a와 동일한 시딩 방식, src/utils/wordLibrary.js
// fetchFullProgress()가 읽는 정확한 shape — 재구현 아니라 그대로 재사용).
// itemId가 고정 랜드마크(LOTS)면 owned 목록에도 자동으로 포함시킨다(그래야
// visiblePlacements가 걸러내지 않고 병합 복원 대상에 남는다 — townLayout.js
// 재구현 없음).
//
// 2026-09-18(D1/사인/스케일 보정 패스 사전조사) — --place "<x>,<y>=<itemId>,..."
// 는 실제 상점/보관함 UI를 그대로 밟아(mock 잔액 999, tests/e2e/townV2.spec.mjs
// S4와 동일 셀렉터 관례) 각 아이템을 구매→배치한다 — 좌표/가격/카탈로그를
// 새로 발명하지 않고 townCatalog.js(TOWN_ITEM_META/TOWN_CATEGORIES, import 0
// 순수 모듈이라 plain node import 가능)를 그대로 읽는다. --owned all이 이미
// 소유한 랜드마크 아이템(book-shop 등)은 구매 단계를 건너뛰고 바로 보관함에서
// 배치한다. --fullpage는 씬 요소뿐 아니라 페이지 전체도 추가로 찍는다(참고용).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { TOWN_ITEM_META, TOWN_CATEGORIES } from '../../src/utils/town/townCatalog.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const PORT = Number(process.env.SHOOT_PREVIEW_PORT) || 4174
const BASE_URL = `http://localhost:${PORT}`

function log(msg) { console.log(`[shootRenderer] ${msg}`) }

// "1,1=book-shop,5,4=cafe,0,3=tree" -> [{x,y,itemId}, ...]. 아이템 id는
// kebab-case만 허용(카탈로그 id 형식) — 구분자로 쓰는 콤마와 절대 안
// 겹치므로 정규식이 "<숫자>,<숫자>=<id>" 패턴만 반복해서 뽑아내는 방식으로
// 안전하게 파싱한다(엔트리 사이 콤마를 별도로 split하지 않는다).
function parsePlaceArg(str) {
  const out = []
  if (!str) return out
  const re = /(\d+),(\d+)=([a-zA-Z0-9-]+)/g
  let m
  while ((m = re.exec(str))) out.push({ x: Number(m[1]), y: Number(m[2]), itemId: m[3] })
  return out
}

function parseArgs(argv) {
  const out = { levels: [4], widths: [390], zoom2: false, owned: 'all', out: 'art-staging/renderer-previews', place: [], legacy: [], fullpage: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--levels') out.levels = argv[++i].split(',').map((s) => Number(s.trim())).filter(Number.isFinite)
    else if (a === '--widths') out.widths = argv[++i].split(',').map((s) => Number(s.trim())).filter(Number.isFinite)
    else if (a === '--zoom2') out.zoom2 = true
    else if (a === '--owned') out.owned = argv[++i] === 'none' ? 'none' : 'all'
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--place') out.place = parsePlaceArg(argv[++i])
    else if (a === '--legacy') out.legacy = parsePlaceArg(argv[++i])
    else if (a === '--fullpage') out.fullpage = true
  }
  if (out.levels.length === 0) out.levels = [4]
  if (out.widths.length === 0) out.widths = [390]
  return out
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return true
    } catch { /* 아직 준비 안 됨 — 재시도 */ }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

function killTree(child) {
  if (!child || child.killed) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try { child.kill('SIGTERM') } catch { /* 이미 종료됨 — 무시 */ }
  }
}

// townScene.js/townLevel.js는 확장자 없는 상대 import를 쓰므로(다른 town
// 테스트 스크립트와 동일 이유) plain node import가 안 된다 — esbuild로
// 한 번 번들해서 LOTS/DISTRICTS/TOWN_LEVELS만 가져온다(재구현이 아니라
// 그대로 읽기만 함, 이 파일이 마을 레벨/랜드마크 잠금 규칙을 새로
// 발명하지 않는다).
async function loadTownPureModules() {
  const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const sceneOut = path.join(TMP_DIR, 'townSceneForShootRenderer.bundle.mjs')
  const levelOut = path.join(TMP_DIR, 'townLevelForShootRenderer.bundle.mjs')
  await esbuild.build({ entryPoints: ['src/utils/town/townScene.js'], bundle: true, format: 'esm', platform: 'node', outfile: sceneOut, absWorkingDir: ROOT })
  await esbuild.build({ entryPoints: ['src/utils/town/townLevel.js'], bundle: true, format: 'esm', platform: 'node', outfile: levelOut, absWorkingDir: ROOT })
  const t = Date.now()
  const scene = await import(`${pathToFileURL(sceneOut).href}?t=${t}`)
  const level = await import(`${pathToFileURL(levelOut).href}?t=${t}`)
  return { LOTS: scene.LOTS, DISTRICTS: scene.DISTRICTS, TOWN_LEVELS: level.TOWN_LEVELS }
}

function minStarsForLevel(level, TOWN_LEVELS) {
  const entry = TOWN_LEVELS.find((e) => e.level === level)
  return entry ? entry.min : 0
}

// 요청된 레벨에서 실제로 열린(unlock <= level) 랜드마크(my-house 제외 —
// 카탈로그 아이템이 아니라 항상 built)만 owned로 채운다 — TownObjectLayer.jsx
// 의 lotState() 판정과 동일한 규칙(townScene.js LOTS/DISTRICTS)을 그대로
// 읽어서 쓸 뿐, 새 규칙을 만들지 않는다.
function ownedIdsForLevel(level, LOTS, DISTRICTS) {
  return LOTS
    .filter((l) => l.id !== 'my-house' && DISTRICTS[l.district].unlock <= level)
    .map((l) => l.id)
}

// 이 스크린샷이 다루는 5개 지형 레이어(TownGroundLayer.jsx)가 실제로
// 요청하는 자산 URL만 "환경 자산 요청 실패"로 집계한다(다른 무관한 요청
// 실패까지 fail-closed에 섞지 않기 위함) — src/assets/town/env/index.js의
// 35개 키와 동일한 목록(scripts/testBundleBudget.mjs ENV_ART_KEYS와 동일
// 원천, 이 파일도 독립적으로 같은 값을 든다 — CLAUDE.md 규칙 16처럼 이
// 파일 하나의 소유이므로 공유 모듈을 새로 만들지 않는다).
const ENV_ART_KEYS = [
  'sky-hills', 'grass-base', 'grass-patch-light', 'grass-patch-dark', 'grass-patch-worn',
  'wildflower-scatter', 'path-straight', 'path-straight-narrow', 'path-curve-gentle',
  'path-curve-strong', 'path-fork', 'path-junction', 'path-end', 'path-end-entrance',
  'fence-straight', 'fence-straight-short', 'fence-corner', 'fence-gate',
  'hedge-straight', 'hedge-straight-tall', 'hedge-end',
  'shrub-round', 'shrub-round-small', 'shrub-wide',
  'flower-cluster-pink', 'flower-cluster-yellow', 'flower-cluster-mixed', 'flower-bed-border',
  'flower-pot', 'flower-pot-tall',
  'river-straight', 'river-bend', 'river-highlight', 'riverbank-reeds', 'riverbank-reeds-stones',
]
function isEnvAssetUrl(url) {
  return ENV_ART_KEYS.some((k) => url.includes(`/${k}-`) && url.endsWith('.webp'))
}

// 실제 상점/보관함 UI를 그대로 밟아 아이템 하나를 구매(이미 소유 중이면
// 생략)→배치한다 — tests/e2e/townV2.spec.mjs S4와 동일한 셀렉터 관례
// (카드 = div.bg-white.rounded-2xl.card-shadow, 카테고리 버튼 aria-label
// "${label} 카테고리", 구매→사기, 마을에 놓기→[data-anchor]). 카탈로그
// id/한글 이름/카테고리는 townCatalog.js(TOWN_ITEM_META/TOWN_CATEGORIES)
// 그대로 읽는다(새로 발명 없음). alreadyOwned 배열(호출부가 이번 세션의
// mock owned 목록을 넘김)에 있으면 구매 단계를 건너뛴다(랜드마크는
// --owned all로 이미 소유 상태).
async function buyAndPlaceItem(page, { x, y, itemId }, ownedList) {
  const meta = TOWN_ITEM_META[itemId]
  if (!meta) throw new Error(`shootRenderer --place: 알 수 없는 카탈로그 id "${itemId}"(townCatalog.js TOWN_ITEM_META에 없음)`)
  const alreadyOwned = Array.isArray(ownedList) && ownedList.includes(itemId)

  if (!alreadyOwned) {
    await page.locator('[data-testid="town-open-shop"]').click()
    await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
    const catEntry = TOWN_CATEGORIES.find((c) => c.id === meta.category)
    const catLabel = catEntry ? catEntry.label : TOWN_CATEGORIES[0].label
    await page.getByRole('button', { name: `${catLabel} 카테고리` }).click()
    const shopCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText(meta.nameKo, { exact: true }) }).first()
    await shopCard.waitFor({ state: 'visible', timeout: 10000 })
    await shopCard.getByRole('button', { name: '구매' }).click()
    const confirmSheet = page.locator('div.animate-slide-up')
    await confirmSheet.waitFor({ state: 'visible', timeout: 10000 })
    await page.getByRole('button', { name: '사기' }).click()
    await confirmSheet.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
    await page.locator('[data-testid="town-sheet-close"]').click()
    await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }

  await page.locator('[data-testid="town-open-inventory"]').click()
  await page.locator('[data-testid="town-sheet"]').waitFor({ state: 'visible', timeout: 10000 })
  const invCard = page.locator('div.bg-white.rounded-2xl.card-shadow', { has: page.getByText(meta.nameKo, { exact: true }) }).first()
  await invCard.waitFor({ state: 'visible', timeout: 10000 })
  await invCard.getByRole('button', { name: '마을에 놓기' }).click()
  // "마을에 놓기" 클릭 시 시트가 자동으로 닫힌다(TownScreenV2 onPlaceStart).
  await page.locator(`[data-anchor="${x},${y}"]`).waitFor({ state: 'visible', timeout: 10000 })
  await page.locator(`[data-anchor="${x},${y}"]`).click()
  await page.locator(`[data-item-id="${itemId}"][data-cell="${x},${y}"]`).waitFor({ state: 'visible', timeout: 10000 })

  const info = await page.locator(`[data-item-id="${itemId}"][data-cell="${x},${y}"]`).evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return {
      wCss: rect.width, hCss: rect.height,
      xPct: el.style.left, yPct: el.style.top,
      zIndex: style.zIndex,
    }
  })
  console.log(`  [place] item=${itemId} cell=${x},${y} wCss=${info.wCss.toFixed(1)}px hCss=${info.hCss.toFixed(1)}px xPct=${info.xPct} yPct=${info.yPct} z=${info.zIndex}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  log(`levels=${args.levels.join(',')} widths=${args.widths.join(',')} zoom2=${args.zoom2} owned=${args.owned} out=${args.out}`)

  const distIndex = path.join(ROOT, 'dist', 'index.html')
  if (!fs.existsSync(distIndex)) {
    log('dist/index.html 없음 — npm run build 실행')
    const res = spawnSync(npmCmd, ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    if (res.status !== 0) {
      console.error('FAIL — npm run build 실패, 스크린샷을 찍을 수 없습니다.')
      process.exit(1)
    }
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch (err) {
    console.error('FAIL — playwright 패키지를 불러올 수 없습니다:', err?.message || err)
    process.exit(1)
  }

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (err) {
    console.error('FAIL — Playwright chromium 브라우저를 실행할 수 없습니다:', err?.message || err)
    console.error('  로컬에서: npx playwright install chromium')
    process.exit(1)
  }

  const { LOTS, DISTRICTS, TOWN_LEVELS } = await loadTownPureModules()
  const { installMocks } = await import('../../tests/e2e/lib/mockRoutes.mjs')
  const { QA_STUDENT_NAME, QA_LOGIN_PIN, QA_STUDENT_ID, buildFixtureTables } = await import('../../tests/e2e/fixtures/index.mjs')
  const fixedLandmarkIds = new Set(LOTS.map((l) => l.id))

  const outDir = path.join(ROOT, args.out)
  fs.mkdirSync(outDir, { recursive: true })

  log(`vite preview 기동 중 (포트 ${PORT})...`)
  const preview = spawn(npmCmd, ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  })
  let previewOutput = ''
  preview.stdout.on('data', (d) => { previewOutput += d.toString() })
  preview.stderr.on('data', (d) => { previewOutput += d.toString() })

  let exitCode = 0

  try {
    const ready = await waitForServer(BASE_URL)
    if (!ready) {
      console.error('FAIL — vite preview 서버가 준비되지 않았습니다(타임아웃).')
      console.error(previewOutput.split('\n').slice(-40).join('\n'))
      process.exit(1)
    }
    log(`preview 서버 준비 완료 — ${BASE_URL}`)

    const shots = []
    for (const level of args.levels) {
      for (const width of args.widths) shots.push({ level, width, zoom: 1 })
    }
    if (args.zoom2) shots.push({ level: 4, width: 390, zoom: 2 })

    for (const shot of shots) {
      const { level, width, zoom } = shot
      const height = Math.max(844, Math.round(width * 2.2))
      // 2026-09-18(리드 리뷰 지적 — lv8-390.png가 색이 바랜(washed-out)
      // 상태로 찍혔음: TownScreenV2의 motion-safe:animate-fade-in
      // wrapper(0.4s ease-in, 0%→opacity:0)가 아직 진행 중일 때 셔터가
      // 눌렸다) — Playwright 컨텍스트에 reducedMotion:'reduce'를 주면
      // prefers-reduced-motion:reduce가 참이 돼 motion-safe: 변형 클래스
      // 자체가 아예 적용되지 않는다(Tailwind motion-safe: = "no-preference"
      // 미디어쿼리) — fade-in 애니메이션이 처음부터 걸리지 않아 opacity가
      // 항상 기본값(1)이다. 벨트+서스펜더로, 아래에서 실제로 opacity 체인이
      // 1인지까지 한 번 더 폴링해 확인한다(앱 코드에 새 테스트 훅을 추가하지
      // 않고 이 도구가 스스로 기다린다).
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
      const page = await context.newPage()
      const pageErrors = []
      const failedRequests = []
      page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)))
      page.on('requestfailed', (req) => failedRequests.push(req.url()))

      await page.addInitScript((flagsJson) => {
        try { localStorage.setItem('paulEasyVoca_features', flagsJson) } catch { /* 무시 */ }
      }, JSON.stringify({ paulTownV1: true, paulTownV2: true }))

      const starsEarned = minStarsForLevel(level, TOWN_LEVELS)
      const owned = args.owned === 'none' ? [] : ownedIdsForLevel(level, LOTS, DISTRICTS)
      // --legacy 항목의 itemId가 고정 랜드마크면 owned에도 포함시킨다(그래야
      // townLayout.visiblePlacements가 걸러내지 않고 병합 복원 결과에 남음).
      for (const l of args.legacy) {
        if (fixedLandmarkIds.has(l.itemId) && !owned.includes(l.itemId)) owned.push(l.itemId)
      }
      const installOpts = {
        townState: { starsEarned, dollars: { available: 999, earned: 999, spent: 0 }, owned, welcomeClaimed: true },
      }
      if (args.legacy.length > 0) {
        const legacyPlacements = args.legacy.map((l, i) => ({
          placementId: `legacy-${l.itemId}-${i}`, itemId: l.itemId, x: l.x, y: l.y, placedAt: 1, updatedAt: 1,
        }))
        installOpts.tables = {
          ...buildFixtureTables(),
          student_progress: [
            { student_id: QA_STUDENT_ID, progress_data: { townPlacements: legacyPlacements, townRemovedIds: [] } },
          ],
        }
      }
      const mocks = await installMocks(page, installOpts)

      let overflow = false
      let brokenEnvImgCount = 0
      const placedSuffix = args.place.length > 0 ? '-placed' : ''
      const legacySuffix = args.legacy.length > 0 ? '-legacy' : ''
      let fileName = `level${level}-w${width}${zoom === 2 ? '-zoom2' : ''}${placedSuffix}${legacySuffix}.png`

      try {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
        // 앱 코드를 건드리지 않고 이 도구 안에서만 고정 UI 크롬(발음 재생
        // 속도 위젯, App.jsx SpeedBtn — fixed bottom-5 right-5 z-40)을
        // 숨긴다. 씬 스크린샷 바운딩박스와 겹쳐 하네스 프리뷰와 비교하기
        // 어려웠다(리드 리뷰 지적) — 실제 학생 화면 동작에는 영향 없음
        // (addStyleTag는 이 Playwright 컨텍스트/페이지에만 적용됨).
        await page.addStyleTag({ content: 'button[aria-label="발음 재생 속도"] { display: none !important; }' })

        await page.getByPlaceholder('이름 입력...').waitFor({ state: 'visible', timeout: 30000 })
        await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
        await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
        await page.getByRole('button', { name: '시작하기!' }).click()
        await page.getByRole('button', { name: '구경가기' }).waitFor({ state: 'visible', timeout: 20000 })
        await page.getByRole('button', { name: '구경가기' }).click()
        const card = page.locator('button', { hasText: '들어가기' })
        await card.waitFor({ state: 'visible', timeout: 15000 })
        await card.click()
        const scene = page.locator('[data-testid="town-scene-v2"]')
        await scene.waitFor({ state: 'visible', timeout: 15000 })

        // --legacy — 클라우드 백업 병합 복원(useStudent.js fetchFullProgress)
        // 이 비동기라, 첫 레거시 항목의 고정 로트가 실제로 뜰 때까지 대기
        // 한다(tests/e2e/townV2.spec.mjs S8a와 동일 폴링 관례).
        if (args.legacy.length > 0) {
          const firstLotId = args.legacy[0].itemId
          await page.waitForFunction(
            (id) => document.querySelector(`[data-lot-id="${id}"]`) != null,
            firstLotId,
            { timeout: 15000 },
          ).catch(() => {})
        }

        for (const p of args.place) {
          await buyAndPlaceItem(page, p, owned)
        }

        if (zoom === 2) await page.evaluate(() => { document.documentElement.style.zoom = '2' })

        // 벨트+서스펜더 — reducedMotion:'reduce'로 fade-in이 애초에 걸리지
        // 않아야 하지만, 실제로 씬 자신 + 조상 체인의 computed opacity가
        // 전부 1이 될 때까지, 그리고 env 자산 <img> 전부가 완료(성공/실패
        // 무관, .complete)될 때까지 한 번 더 폴링한 뒤에만 셔터를 누른다.
        await page.waitForFunction(() => {
          const scene = document.querySelector('[data-testid="town-scene-v2"]')
          if (!scene) return false
          let el = scene
          while (el && el !== document.body) {
            const opacity = Number(window.getComputedStyle(el).opacity)
            if (Number.isFinite(opacity) && opacity < 1) return false
            el = el.parentElement
          }
          const imgs = Array.from(document.querySelectorAll('img[data-env-asset]'))
          return imgs.every((img) => img.complete)
        }, { timeout: 15000 })

        overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        brokenEnvImgCount = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img[data-env-asset]'))
          return imgs.filter((img) => img.complete && img.naturalWidth === 0).length
        })

        const filePath = path.join(outDir, fileName)
        await scene.screenshot({ path: filePath })
        if (args.fullpage) {
          const fullpagePath = path.join(outDir, fileName.replace(/\.png$/, '-fullpage.png'))
          await page.screenshot({ path: fullpagePath, fullPage: true })
        }
      } catch (err) {
        console.log(`level=${level} width=${width} zoom=${zoom} FAILED(예외): ${err?.message || err}`)
        exitCode = 1
        await context.close()
        continue
      }

      const failedEnvRequests = failedRequests.filter(isEnvAssetUrl)
      const line = `level=${level} width=${width} zoom=${zoom} overflow=${overflow} pageErrors=${pageErrors.length} `
        + `failedEnvRequests=${failedEnvRequests.length} brokenEnvImg=${brokenEnvImgCount} -> ${fileName}`
      console.log(line)
      if (pageErrors.length > 0) console.log(`  pageErrors: ${JSON.stringify(pageErrors.slice(0, 3))}`)
      if (failedEnvRequests.length > 0) console.log(`  failedEnvRequests: ${JSON.stringify(failedEnvRequests.slice(0, 5))}`)
      if (overflow || pageErrors.length > 0 || failedEnvRequests.length > 0) exitCode = 1

      void mocks
      await context.close()
    }
  } finally {
    await browser.close().catch(() => {})
    killTree(preview)
  }

  console.log(`\n스크린샷 저장 위치: ${outDir}`)
  process.exit(exitCode)
}

main().catch((err) => {
  console.error('FAIL — shootRenderer 러너 자체가 예외로 종료됨:', err?.stack || err)
  process.exit(1)
})
