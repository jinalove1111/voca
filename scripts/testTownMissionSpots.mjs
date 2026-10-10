// scripts/testTownMissionSpots.mjs — missionSpots.js(미션 표지판 좌표/판정) 순수 단위 + Proto25DScreen 소스 핀.
// 네트워크/DB/브라우저 0. walkGrid.js 번들은 기존 testProto25d*.mjs 관례(esbuild, scripts/.tmp).
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP, { recursive: true })
async function bundle(entry, name) {
  const out = path.join(TMP, name)
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out })
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`)
}
const M = await bundle('src/utils/town/proto2_5d/missionSpots.js', 'missionSpots.bundle.mjs')
const G = await bundle('src/utils/town/proto2_5d/walkGrid.js', 'missionSpotsWalkGrid.bundle.mjs')
const P = await bundle('src/utils/town/proto2_5d/pathfinding.js', 'missionSpotsPath.bundle.mjs')
const S = await bundle('src/utils/town/proto2_5d/shopInteraction.js', 'missionSpotsShop.bundle.mjs')
const B = await bundle('src/utils/town/proto2_5d/placementSlots.js', 'missionSpotsSlots.bundle.mjs')
const BI = await import(pathToFileURL(path.join(ROOT, 'src/utils/town/proto2_5d/benchInteraction.js')).href)

let pass = 0, fail = 0
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}`) } else { fail++; console.log(`  FAIL  ${label} ${detail}`) }
}
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

const spot = M.missionSpotById('park')
check('park 표지판이 존재하고 알 수 없는 id는 null', !!spot && M.missionSpotById('nope') === null)
const KIT_MANIFEST = JSON.parse(readFileSync('src/assets/town/kit/manifest.json', 'utf8')).targets
const ART_SRC = readFileSync('src/assets/town/kit/townMission.js', 'utf8')
const artW = (k) => KIT_MANIFEST[k].w, artH = (k) => KIT_MANIFEST[k].h
check('표지판 assetKey는 키트 props/signpost, 비율은 manifest와 동일', spot.assetKey === 'props/signpost'
  && Math.abs(spot.naturalAspect - artH('props/signpost') / artW('props/signpost')) < 1e-9)
const cookie = spot.companion
check('Cookie는 키트 character/cookie-stand, 비율은 manifest와 동일(왜곡 없음)', cookie.assetKey === 'character/cookie-stand'
  && Math.abs(cookie.naturalAspect - artH('character/cookie-stand') / artW('character/cookie-stand')) < 1e-9)
for (const k of ['props/signpost', 'character/cookie-stand']) {
  check(`townMission.js가 ${k} 1x/@2x를 import하고 w/h가 manifest와 같음`,
    ART_SRC.includes(`'./${k}.webp'`) && ART_SRC.includes(`'./${k}@2x.webp'`)
    && ART_SRC.includes(`'${k}': Object.freeze({ src: `) && ART_SRC.includes(`w: ${artW(k)}, h: ${artH(k)} })`))
}
check('townMission.js: devicePixelRatio>1일 때만 @2x, window 없으면 1x(SSR-safe)', /typeof window !== 'undefined'/.test(ART_SRC) && /dpr > 1 \? art\.src2x : art\.src/.test(ART_SRC))
check('townMission.js 이모지 없음', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ART_SRC))

const arrival = M.missionArrival(spot)
check('도착 지점이 걸을 수 있는 칸', G.classifyPoint(arrival.x, arrival.y) === 'walkable', JSON.stringify(arrival))
check('도착 지점이 표지판 앵커 오른쪽 앞(x 큼, y 큼)', arrival.x > spot.anchor.x && arrival.y >= spot.anchor.y)

// 기존 장애물/슬롯/가게/벤치와 비충돌
for (const ob of G.OBSTACLES) check(`표지판 히트박스가 ${ob.id}와 겹치지 않음`, !overlap(spot.hitRect, ob))
for (const sl of B.PLACEMENT_SLOTS) check(`표지판 히트박스가 슬롯 ${sl.id}와 겹치지 않음`, !overlap(spot.hitRect, B.placedObstacleRect(sl)))
for (const sl of B.PLACEMENT_SLOTS) check(`도착 지점이 슬롯 ${sl.id} 안이 아님`, !overlap({ x0: arrival.x, x1: arrival.x + 0.01, y0: arrival.y, y1: arrival.y + 0.01 }, B.placedObstacleRect(sl)))
check('OBSTACLES에 표지판이 없다(장애물 불변)', !G.OBSTACLES.some((o) => /mission|sign/.test(o.id)))

// 근접 반경 분리
const BENCH = G.OBSTACLES.find((o) => o.id === 'demo-bench')
const benchArr = BI.benchArrivalPoint(BENCH)
check('벤치 도착점은 미션 근접 반경 밖', !M.isNearMissionSpot(spot, benchArr.x, benchArr.y), JSON.stringify(benchArr))
check('가게 입구는 미션 근접 반경 밖', !M.isNearMissionSpot(spot, S.SHOP_ENTRANCE.x, S.SHOP_ENTRANCE.y))
check('스폰(50,62)은 미션 근접 반경 밖', !M.isNearMissionSpot(spot, 50, 62))
check('도착 지점에서는 근접', M.isNearMissionSpot(spot, arrival.x, arrival.y))
check('NaN/없는 spot은 false', !M.isNearMissionSpot(spot, NaN, 1) && !M.isNearMissionSpot(null, arrival.x, arrival.y))

// 스폰에서 도착 지점까지 경로 존재
const path1 = P.findPath({ x: 50, y: 62 }, arrival, G.OBSTACLES)
check('스폰 -> 도착 지점 경로 존재', Array.isArray(path1) && path1.length > 0)

// 탭 판정(44px 하한 패딩) — 뷰포트별
for (const [w, h] of [[360, 640], [390, 844], [1280, 800]]) {
  const gp = { groundWidthPx: w, groundHeightPx: h }
  const c = { x: (spot.hitRect.x0 + spot.hitRect.x1) / 2, y: (spot.hitRect.y0 + spot.hitRect.y1) / 2 }
  check(`${w}x${h}: 표지판 중심 탭은 표지판`, M.findTappedMissionSpot(c, gp) === spot)
  check(`${w}x${h}: 스폰 탭은 표지판 아님`, M.findTappedMissionSpot({ x: 50, y: 62 }, gp) === null)
  check(`${w}x${h}: 기존 e2e 탭 지점 4곳은 표지판 아님`, [[50, 10], [15, 92], [30, 85], [73, 70]].every(([x, y]) => M.findTappedMissionSpot({ x, y }, gp) === null))
  check(`${w}x${h}: 빈 후보면 null`, M.findTappedMissionSpot(c, gp, []) === null)
  const bp = BI.benchTapPad(BENCH, gp)
  const sp = BI.benchTapPad(spot.hitRect, gp)
  const padded = (r, p) => ({ x0: r.x0 - p.padX, x1: r.x1 + p.padX, y0: r.y0 - p.padY, y1: r.y1 + p.padY })
  check(`${w}x${h}: 표지판 탭 영역이 벤치 도착점을 덮지 않음`, M.findTappedMissionSpot(benchArr, gp) === null)
  check(`${w}x${h}: 패딩된 표지판 영역 가로폭 >= 44px`, ((padded(spot.hitRect, sp).x1 - padded(spot.hitRect, sp).x0) / 100) * w >= 43.9)
  void bp
}

// Cookie 박스(px) — 표지판 탭 영역 중심/도착 지점/e2e 탭 지점을 덮지 않고, 화면 안에 있다.
// depthScale은 Paul/표지판/Cookie 모두 y가 비슷해 생략한 근사(상대 비율만 본다).
const PAUL_H_RATIO = 128 / 96 // Paul 스프라이트 h/w
for (const [w, h] of [[360, 640], [390, 844], [1280, 800]]) {
  const unit = Math.min(w, 1.2 * h)
  const px = (o) => Math.max(o.minWidthPx || 0, (o.widthPct / 100) * unit)
  const boxOf = (o) => { const bw = px(o); const bh = bw * o.naturalAspect; return { x0: (o.anchor.x / 100) * w - bw / 2, x1: (o.anchor.x / 100) * w + bw / 2, y0: (o.anchor.y / 100) * h - bh, y1: (o.anchor.y / 100) * h } }
  const cb = boxOf(cookie), sb = boxOf(spot)
  const inside = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
  const cx = (((spot.hitRect.x0 + spot.hitRect.x1) / 2) / 100) * w, cy = (((spot.hitRect.y0 + spot.hitRect.y1) / 2) / 100) * h
  const paulW = Math.max(0.08 * w, 40), paulH = paulW * PAUL_H_RATIO
  check(`${w}x${h}: Cookie 박스가 화면 안`, cb.x0 >= 0 && cb.y0 >= 0 && cb.y1 <= h, JSON.stringify(cb))
  check(`${w}x${h}: Cookie가 표지판 탭 영역 중심을 덮지 않음`, !inside(cb, cx, cy))
  check(`${w}x${h}: Cookie와 표지판 이미지의 가로 겹침은 Cookie 폭의 35% 이하`, cb.x1 - sb.x0 <= 0.35 * (cb.x1 - cb.x0), `${cb.x1} vs ${sb.x0}`)
  check(`${w}x${h}: Cookie가 도착 지점을 덮지 않음`, !inside(cb, (arrival.x / 100) * w, (arrival.y / 100) * h))
  check(`${w}x${h}: Cookie가 기존 e2e 탭 지점 4곳+스폰을 덮지 않음`, [[50, 10], [15, 92], [30, 85], [73, 70], [50, 62]].every(([x, y]) => !inside(cb, (x / 100) * w, (y / 100) * h)))
  check(`${w}x${h}: Cookie 높이는 Paul의 0.3~0.65배`, cb.y1 - cb.y0 >= 0.3 * paulH && cb.y1 - cb.y0 <= 0.65 * paulH, `cookieH=${(cb.y1 - cb.y0).toFixed(1)} paulH=${paulH.toFixed(1)}`)
  check(`${w}x${h}: 표지판 높이는 Paul의 0.7~1.5배`, sb.y1 - sb.y0 >= 0.7 * paulH && sb.y1 - sb.y0 <= 1.5 * paulH, `signH=${(sb.y1 - sb.y0).toFixed(1)} paulH=${paulH.toFixed(1)}`)
  console.log(`    ${w}x${h}: sign ${(sb.x1 - sb.x0).toFixed(0)}x${(sb.y1 - sb.y0).toFixed(0)}px, cookie ${(cb.x1 - cb.x0).toFixed(0)}x${(cb.y1 - cb.y0).toFixed(0)}px, paul ${paulW.toFixed(0)}x${paulH.toFixed(0)}px`)
}
check('Cookie는 OBSTACLES에 없고 anchor가 월드 안', !G.OBSTACLES.some((o) => /cookie|companion/.test(o.id)) && cookie.anchor.x > 0 && cookie.anchor.x < 100)

// Proto25DScreen 소스 핀
const src = readFileSync('src/components/town/proto2_5d/Proto25DScreen.jsx', 'utf8')
for (const [label, re] of [
  ['props missions/completedMissionIds/onStartMission', /missions = NO_MISSIONS, completedMissionIds = NO_MISSIONS, onStartMission = null/],
  ['spot testid', /proto25d-mission-spot-\$\{sp\.id\}/],
  ['enter testid', /data-testid="proto25d-mission-enter"/],
  ['done chip testid', /proto25d-mission-done-\$\{sp\.id\}/],
  ['role=button + aria-label', /role="button"[\s\S]{0,80}aria-label=\{sp\.labelKo\}/],
  ['Enter/Space', /e\.key !== 'Enter' && e\.key !== ' '/],
  ['onStartMission 호출', /onStartMission\(nearMission\.id\)/],
  ['오버레이 중 숨김', /missionUiOpen = !shopOpen && !placingItemId && !myItemsOpen/],
  ['Cookie testid', /proto25d-mission-companion-\$\{sp\.id\}/],
  ['Cookie 깊이 z는 앵커 y 기반 obstacleZIndex', /obstacleZIndex\(`mission-\$\{sp\.id\}-companion`, cp\.anchor\.y\)/],
  ['키트 아트는 townMission 모듈 경유', /from '\.\.\/\.\.\/\.\.\/assets\/town\/kit\/townMission'/],
  ['onStartMission 없으면 비활성', /typeof onStartMission === 'function'/],
]) check(`소스 핀: ${label}`, re.test(src))
check('Proto25DScreen은 미션 이미지를 직접 import하지 않음(townMission 모듈 경유)', !/mission.*\.(webp|png)/i.test(src))
check('이모지 없음(missionSpots.js, 신규 JSX 블록)', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(readFileSync('src/utils/town/proto2_5d/missionSpots.js', 'utf8')))

console.log(`\n총 ${pass + fail}개 단언 — PASS ${pass} / FAIL ${fail}`)
if (fail) process.exitCode = 1
