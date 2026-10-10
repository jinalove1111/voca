// 2026-10-10(244차) 하이브리드 월드 화면(src/components/town/proto2_5d/world/*) — 소스 핀 + SSR 렌더 스모크. 네트워크 0, 저장소 0.
// 렌더: esbuild로 실제 화면 트리(스프라이트/키트 에셋 포함)를 번들(.png/.webp는 dataurl) → renderToStaticMarkup. 브라우저는 쓰지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { activeArts, EXCLUDED_ART, SOON_OBJECTS, PLACES, GATES, ZONES } from '../src/utils/town/proto2_5d/world/worldMap.js'

let fail = 0
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${!ok && d ? '  ' + d : ''}`); if (!ok) fail++ }
const DIR = 'src/components/town/proto2_5d/world'
const read = (p) => fs.readFileSync(path.resolve(p), 'utf8')
const files = Object.fromEntries(['TownWorld.jsx', 'WorldJoystick.jsx', 'WorldMap.jsx', 'PlaceSheet.jsx', 'worldArt.js'].map((f) => [f, read(`${DIR}/${f}`)]))
const comp = ['TownWorld.jsx', 'WorldJoystick.jsx', 'WorldMap.jsx', 'PlaceSheet.jsx'].map((f) => files[f]).join('\n')
const all = Object.values(files).join('\n')
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ---- 소스 핀 ----
const ids = ['town-world', 'tw-paul', 'tw-zone-chip', 'tw-home', 'tw-map-open', 'tw-joystick', 'tw-joystick-knob', 'tw-mission-enter', 'tw-place-sheet', 'tw-place-title', 'tw-sheet-close', 'tw-map', 'tw-map-close', 'tw-map-here']
for (const id of ids) check(`testid ${id}`, comp.includes(`"${id}"`))
for (const p of ['tw-place-${p.id}', 'tw-mission-${i}', 'tw-mission-done-${i}', 'tw-gate-${g.zone}', 'tw-map-zone-${z.id}', 'tw-map-place-${p.id}']) check(`testid 템플릿 ${p}`, comp.includes('`' + p + '`'), p)
check('보상/저장 접근 없음(rewardEngine/grantReward/localStorage/sessionStorage)', !/rewardEngine|grantReward|localStorage|sessionStorage/.test(code(all)))
check('reward 모듈 import 없음', !/import[^\n]*reward/i.test(all))
check('옛 환경 타일(assets/town/env) / V1·V2 town 화면 import 없음', !/assets\/town\/env|TownScreen|townV2/.test(code(all)))
check('screens 상위(App/features) import 없음', !/from '(\.\.\/)+(App|config\/features)/.test(comp))
// worldArt: import하는 키트 target == activeArts() (1x + @2x), 제외 art/준비 중 전용 art 없음
const imported = [...files['worldArt.js'].matchAll(/kit\/([a-z0-9/-]+?)(@2x)?\.webp'/g)].map((m) => ({ t: m[1], x2: !!m[2] }))
const arts = activeArts()
check('worldArt 1x import == activeArts()', JSON.stringify([...new Set(imported.filter((i) => !i.x2).map((i) => i.t))].sort()) === JSON.stringify(arts))
check('worldArt @2x import == activeArts()', JSON.stringify(imported.filter((i) => i.x2).map((i) => i.t).sort()) === JSON.stringify(arts))
check('worldArt: 제외 art import 없음', EXCLUDED_ART.every((e) => !imported.some((i) => i.t === e.art)))
const soonOnly = [...new Set(SOON_OBJECTS.map((o) => o.art))].filter((a) => !arts.includes(a))
check(`worldArt: 준비 중 전용 art(${soonOnly.length}종) import 없음`, soonOnly.every((a) => !imported.some((i) => i.t === a)))
check('worldArt import는 ?url 없이 정적 import(청크 분석 가능)', !/import\.meta\.glob/.test(files['worldArt.js']))
// 루프 / 입력
check('rAF 루프 취소(cancelAnimationFrame) + 언마운트 정리', /cancelAnimationFrame/.test(files['TownWorld.jsx']) && /requestAnimationFrame/.test(files['TownWorld.jsx']))
check('언마운트 시 마지막 위치 emit', /useEffect\(\(\) => \(\) => emit\(\), \[emit\]\)/.test(files['TownWorld.jsx']))
check('keydown/keyup/blur/visibilitychange 리스너 해제', ['keydown', 'keyup', 'blur'].every((k) => new RegExp(`removeEventListener\\('${k}'`).test(files['TownWorld.jsx'])) && /removeEventListener\('visibilitychange'|document\.removeEventListener\('visibilitychange'/.test(files['TownWorld.jsx']))
check('키 핸들러: input/textarea/dialog 무시', /input, textarea, select, \[contenteditable="true"\], \[role="dialog"\]/.test(files['TownWorld.jsx']))
check('방향키만 preventDefault', /startsWith\('arrow'\)\) e\.preventDefault\(\)/.test(files['TownWorld.jsx']))
check('조이스틱: 포인터 캡처 + touchAction none + 놓으면 중앙 복귀', /setPointerCapture/.test(files['WorldJoystick.jsx']) && /touchAction: 'none'/.test(files['WorldJoystick.jsx']) && /onPointerCancel/.test(files['WorldJoystick.jsx']) && /onLostPointerCapture/.test(files['WorldJoystick.jsx']))
check('루트: 100dvh, 텍스트 선택/콜아웃/드래그 차단', /100dvh/.test(files['TownWorld.jsx']) && /WebkitTouchCallout: 'none'/.test(files['TownWorld.jsx']) && /onDragStart/.test(files['TownWorld.jsx']) && /draggable=\{false\}/.test(files['TownWorld.jsx']))
check('이미지: lazy + async decode + alt="" aria-hidden + 1x/2x srcSet', /loading="lazy"/.test(files['TownWorld.jsx']) && /decoding="async"/.test(files['TownWorld.jsx']) && /alt=""/.test(files['TownWorld.jsx']) && /1x, .*2x/.test(files['TownWorld.jsx']))
check('다이얼로그: role=dialog + aria-modal (시트/지도)', /role="dialog"/.test(files['PlaceSheet.jsx']) && /role="dialog"/.test(files['WorldMap.jsx']) && /aria-modal="true"/.test(files['PlaceSheet.jsx']))
check('시트/지도 닫기 44px 이상 버튼', /minHeight: 48/.test(files['PlaceSheet.jsx']) && /minHeight: 48/.test(files['WorldMap.jsx']))
check('이모지 없음', !/\p{Extended_Pictographic}/u.test(code(all)))
check('Paul 스프라이트: 기존 매니페스트/계약 재사용(resolveSpriteFrame)', /characterSpriteManifest\.default/.test(files['TownWorld.jsx']) && /resolveSpriteFrame/.test(files['TownWorld.jsx']))

// ---- SSR 렌더 ----
const TMP = path.resolve('scripts/.tmp/townworld'); fs.mkdirSync(TMP, { recursive: true })
const out = path.join(TMP, 'bundle.mjs')
await esbuild.build({
  stdin: { contents: `export { default as TownWorld } from './TownWorld.jsx'\nexport { default as PlaceSheet } from './PlaceSheet.jsx'\nexport { default as WorldMap } from './WorldMap.jsx'`, resolveDir: path.resolve(DIR), loader: 'js' },
  bundle: true, platform: 'node', format: 'esm', outfile: out, jsx: 'automatic', packages: 'external', loader: { '.png': 'dataurl', '.webp': 'dataurl' }, logLevel: 'silent',
})
const { TownWorld, PlaceSheet, WorldMap } = await import(pathToFileURL(out).href + '?t=' + Date.now())
const html = (props) => renderToStaticMarkup(React.createElement(TownWorld, props))
const count = (h, re) => (h.match(re) || []).length
let h0 = ''
try { h0 = html({}) } catch (e) { check('SSR: <TownWorld /> 기본 props 렌더 예외 없음', false, e.message) }
check('SSR: 기본 props 렌더', h0.length > 1000)
check('SSR: 루트 + 구역 plaza + 시작 좌표(SPAWN)', /data-testid="town-world"[^>]*data-zone="plaza"[^>]*data-x="160"[^>]*data-y="122"/.test(h0))
check('SSR: HUD(홈/지도/구역 칩) + Paul', ['tw-home', 'tw-map-open', 'tw-zone-chip', 'tw-paul'].every((i) => h0.includes(`data-testid="${i}"`)))
check('SSR: 구역 칩 문구 "중앙 광장 · Presentation"', /data-testid="tw-zone-chip"[^>]*>중앙 광장 · Presentation</.test(h0))
check(`SSR: 장소 이름 칩 ${PLACES.length}개`, PLACES.every((p) => h0.includes(`data-testid="tw-place-${p.id}"`)) && count(h0, /data-testid="tw-place-[a-z-]+"/g) === PLACES.length)
check(`SSR: 닫힌 문 ${GATES.length}개 + "준비 중"`, count(h0, /data-testid="tw-gate-[a-z]+"/g) === GATES.length && count(h0, />준비 중</g) >= GATES.length)
check('SSR: 준비 중 구역 이름표(' + ZONES.filter((z) => z.status === 'soon').length + '개) 표시', ZONES.filter((z) => z.status === 'soon').every((z) => h0.includes(`${z.nameKo} · 준비 중`)))
check('SSR: 시트/지도는 닫힌 채 시작, 근처가 아니면 미션 버튼 없음', !h0.includes('tw-place-sheet') && !h0.includes('data-testid="tw-map"') && !h0.includes('tw-mission-enter'))
check('SSR: 이미지 전부 alt="" aria-hidden, draggable=false', !/<img(?![^>]*alt="")/.test(h0) && !/<img(?![^>]*aria-hidden="true")/.test(h0) && !/<img(?![^>]*draggable="false")/.test(h0))
const hPark = html({ initial: { pos: { x: 88, y: 112 }, visited: ['park-green'], done: [] } })
check('SSR: initial.pos(공원 입구 근처) 복원 → data-zone=park + 근처 장소 표시', /data-zone="park"[^>]*data-x="88"[^>]*data-y="112"/.test(hPark) && hPark.includes('data-testid="tw-mission-enter"') && hPark.includes('공원 잔디밭 미션 보기') && /data-testid="tw-place-park-green" data-near="true"/.test(hPark))
const hBad = html({ initial: { pos: { x: 160, y: 110 } } })
check('SSR: 막힌 좌표(분수 안)는 SPAWN으로 폴백', /data-x="160"[^>]*data-y="122"/.test(hBad))
const hNaN = html({ initial: { pos: { x: 'a', y: null } } })
check('SSR: 잘못된 initial.pos도 SPAWN 폴백', /data-x="160"[^>]*data-y="122"/.test(hNaN))
const place = PLACES.find((p) => p.id === 'park-green')
const hs = renderToStaticMarkup(React.createElement(PlaceSheet, { place, completedUnitIds: ['g-easy-05'], wasVisited: false }))
check('PlaceSheet: 문법 미션 4개 + 닫기 + 완료 칩은 g-easy-05만', count(hs, /data-testid="tw-mission-\d"/g) === 4 && hs.includes('tw-sheet-close') && /data-testid="tw-mission-done-0"[^>]*>완료</.test(hs) && count(hs, /tw-mission-done-/g) === 1)
check('PlaceSheet: 모든 문법 미션에 Grammar 라벨', count(hs, />Grammar</g) === 4)
const school = PLACES.find((p) => p.id === 'school-main')
const hw1 = renderToStaticMarkup(React.createElement(PlaceSheet, { place: school, wasVisited: false }))
const hw2 = renderToStaticMarkup(React.createElement(PlaceSheet, { place: school, wasVisited: true }))
check('PlaceSheet: 쓰기 미션 라벨 + 처음에는 "다녀옴" 없음, 다녀온 뒤에만 표시', hw1.includes('쓰기 연습 고르기') && hw1.includes('Writing') && !hw1.includes('다녀옴') && hw2.includes('다녀옴'))
const hp = renderToStaticMarkup(React.createElement(PlaceSheet, { place: PLACES.find((p) => p.id === 'plaza-hall'), wasVisited: false }))
check('PlaceSheet: 발표 과정 라벨', hp.includes('발표 과정 열기') && hp.includes('Presentation'))
const hm = renderToStaticMarkup(React.createElement(WorldMap, { currentZone: 'plaza' }))
check('WorldMap: 구역 7개(ready 3, soon 4 비활성) + 여기 표시 + 장소 3개', count(hm, /data-testid="tw-map-zone-[a-z]+"/g) === 7 && count(hm, /data-status="ready"/g) === 3 && count(hm, /data-status="soon"/g) === 4 && count(hm, /disabled=""/g) === 4 && hm.includes('tw-map-here') && count(hm, /data-testid="tw-map-place-/g) === 3)

// ---- 247차 클릭/탭 이동 핀 ----
{
  const tw = code(files['TownWorld.jsx'])
  check('탭 판정 상수: 10px / 500ms / 정지 400ms', /TAP_MAX_PX = 10/.test(tw) && /TAP_MAX_MS = 500/.test(tw) && /STUCK_MS = 400/.test(tw))
  check('왼쪽 버튼만 + HUD/조이스틱/미션/시트/지도/dialog 제외', /e\.button !== 0/.test(tw) && /NO_TAP = '[^\n]*button[^\n]*tw-joystick[^\n]*role="dialog"[^\n]*tw-map[^\n]*tw-mission-enter[^\n]*tw-place-sheet/.test(tw))
  check('키보드/조이스틱이 경로를 취소(틱 + keydown)', /if \(active \|\| lockRef\.current\) clearPath\(\)/.test(tw) && /clearPath\(\) \/\/ 키보드가/.test(tw))
  check('stepMove 호출은 1곳뿐(경로도 같은 이동기 + 충돌)', (tw.match(/stepMove\(/g) || []).length === 1)
  check('화면 -> 월드 좌표는 월드 레이어 rect + sRef', /worldRef\.current\?\.getBoundingClientRect\(\)/.test(tw) && /\(e\.clientX - rect\.left\) \/ sc/.test(tw) && /const sc = sRef\.current/.test(tw))
  check('목적지 마커: tw-dest aria-hidden + pointerEvents none', /data-testid="tw-dest" aria-hidden="true"[\s\S]{0,400}pointerEvents: 'none'/.test(tw))
  check('data-dest 루트 속성 + 시트/지도/travel/blur에서 경로 취소', /data-dest=\{dest/.test(tw) && (tw.match(/clearPath\(\)/g) || []).length >= 6)
}

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS')
process.exit(fail ? 1 : 0)
