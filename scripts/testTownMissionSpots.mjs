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
check('assetKey는 기존 decorations/town-sign', spot.assetKey === 'decorations/town-sign'
  && /entry\('decorations\/town-sign'/.test(readFileSync('src/assets/town/assetManifest.js', 'utf8')))

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
  ['onStartMission 없으면 비활성', /typeof onStartMission === 'function'/],
]) check(`소스 핀: ${label}`, re.test(src))
check('표지판은 기존 town-sign만 사용(missionSpots 경유, 신규 import 이미지 없음)', !/mission.*\.(webp|png)/i.test(src))
check('이모지 없음(missionSpots.js, 신규 JSX 블록)', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(readFileSync('src/utils/town/proto2_5d/missionSpots.js', 'utf8')))

console.log(`\n총 ${pass + fail}개 단언 — PASS ${pass} / FAIL ${fail}`)
if (fail) process.exitCode = 1
