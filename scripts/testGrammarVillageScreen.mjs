// 2026-10-10 문법 마을 화면(GrammarVillage.jsx) — SSR 렌더 스모크 + App/덱 소스 핀. 네트워크 0, 저장소 0.
// 렌더: esbuild로 실제 화면을 번들하되 villageArt(import.meta.glob)만 가상 스텁으로 치환(URL 문자열만 돌려줌), PNG는 dataurl.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VILLAGE_DISTRICTS, VILLAGE_NO_PLACE_UNITS, villageUnitOrder } from '../src/utils/grammar/village.js'

let fail = 0
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${!ok && d ? '  ' + d : ''}`); if (!ok) fail++ }
const read = (p) => fs.readFileSync(path.resolve(p), 'utf8')
const app = read('src/App.jsx'), gv = read('src/components/GrammarVillage.jsx'), gc = read('src/components/GrammarCourseScreen.jsx')

// ---- SSR 렌더 ----
const TMP = path.resolve('scripts/.tmp/village'); fs.mkdirSync(TMP, { recursive: true })
const out = path.join(TMP, 'GrammarVillage.mjs')
const STUB = "export const villageArt = (t) => ({ src: '/k/' + t + '.webp', src2x: '/k/' + t + '@2x.webp', w: 100, h: 100 })"
const stub = { name: 'village-art-stub', setup(b) {
  b.onResolve({ filter: /villageArt$/ }, () => ({ path: 'villageArt-stub', namespace: 'stub' }))
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ loader: 'js', contents: STUB }))
} }
await esbuild.build({ entryPoints: [path.resolve('src/components/GrammarVillage.jsx')], bundle: true, platform: 'node', format: 'esm', outfile: out, jsx: 'automatic', packages: 'external', loader: { '.png': 'dataurl' }, plugins: [stub], logLevel: 'silent' })
const GrammarVillage = (await import(pathToFileURL(out).href + '?t=' + Date.now())).default
const html = (props) => renderToStaticMarkup(React.createElement(GrammarVillage, { onStart() {}, onCourses() {}, onHome() {}, ...props }))
const h0 = html({})
const places = VILLAGE_DISTRICTS.flatMap((d) => d.places)
const total = villageUnitOrder().length
const btn = (h, id) => h.split(`data-testid="gv-place-${id}"`)[1].split('</button>')[0]

check('렌더: 루트 + 구역 7개 순서대로', h0.includes('data-testid="grammar-village"') && VILLAGE_DISTRICTS.length === 7 && VILLAGE_DISTRICTS.every((d) => h0.includes(`data-testid="gv-district-${d.id}"`)) && VILLAGE_DISTRICTS.every((d, i, a) => !i || h0.indexOf(`gv-district-${d.id}"`) > h0.indexOf(`gv-district-${a[i - 1].id}"`)))
check(`렌더: 모든 장소 버튼 ${places.length}개(aria-label=이름, data-missions=단원 수, data-done=0)`, places.every((p) => h0.includes(`data-testid="gv-place-${p.id}" data-missions="${p.unitIds.length}" data-done="0" aria-label="${p.nameKo}"`)))
check('렌더: 진행 표시 "완료 0 / 34", 과정 목록·홈 버튼', h0.includes(`완료 0 / ${total}`) && total === 34 && h0.includes('data-testid="gv-to-courses"') && h0.includes('과정 목록으로 보기') && h0.includes('data-testid="gv-home"'))
check('렌더: 문법 노트 단원 8개 + 이유 줄', VILLAGE_NO_PLACE_UNITS.length === 8 && VILLAGE_NO_PLACE_UNITS.every((n) => h0.includes(`data-testid="gv-note-${n.unitId}"`) && h0.includes(n.reasonKo)))
check('렌더: 준비 중 장소는 "준비 중" 칩, 미션 장소는 칩 없음', places.filter((p) => !p.unitIds.length).every((p) => btn(h0, p.id).includes('준비 중')) && !places.filter((p) => p.unitIds.length).some((p) => btn(h0, p.id).includes('준비 중')))
const secs = h0.split('<section').slice(1)
const eagerBy = Object.fromEntries(VILLAGE_DISTRICTS.map((d) => [d.id, (secs.find((s) => s.includes(`gv-district-${d.id}"`)).match(/loading="eager"/g) || []).length]))
check('이미지: 공원만 eager, 나머지 구역은 전부 lazy + decoding=async + srcSet', eagerBy.park > 0 && Object.entries(eagerBy).every(([k, n]) => k === 'park' || n === 0) && /<img[^>]*loading="lazy"[^>]*decoding="async"/.test(h0) && /srcSet="[^"]* 1x, [^"]* 2x"/.test(h0), JSON.stringify(eagerBy))
check('이미지: 모든 img에 alt·width·height', !/<img(?![^>]*alt=)/.test(h0) && !/<img(?![^>]*width=)/.test(h0) && !/<img(?![^>]*height=)/.test(h0))
const h1 = html({ completedUnitIds: ['g-int-08', 'g-easy-07', 'g-int-01'] })
check('완료 반영: 카페 data-done=2 + 장소 완료 칩, 노트 완료 칩, 진행 "완료 3 / 34"', h1.includes('data-testid="gv-place-cafe" data-missions="2" data-done="2"') && h1.includes('data-testid="gv-place-done-cafe"') && h1.includes('data-testid="gv-note-done-g-int-01"') && h1.includes('완료 3 / 34'))
const h2 = html({ completedUnitIds: ['g-int-08'] })
check('완료 반영: 카페 1/2는 장소 완료 칩 없음', h2.includes('data-testid="gv-place-cafe" data-missions="2" data-done="1"') && !h2.includes('gv-place-done-cafe'))
const h3 = html({ focusId: 'cafe' })
check('Paul 표시: 마지막 장소가 있을 때만 gv-paul 1개', h3.includes('data-testid="gv-paul"') && !h0.includes('gv-paul') && (h3.match(/gv-paul/g) || []).length === 1)
check('이모지 없음(새 UI)', !/\p{Extended_Pictographic}/u.test(gv))
check('저장소·네트워크 없음(localStorage/sessionStorage/fetch/supabase)', !/localStorage|sessionStorage|fetch\(|supabase/.test(gv))
check('학생 이름 매칭 없음', !/studentName/.test(gv))

// ---- 소스 핀 ----
for (const t of ['grammar-village', 'gv-district-', 'gv-place-', 'gv-place-card', 'gv-place-title', 'gv-mission-', 'gv-mission-done-', 'gv-place-soon', 'gv-card-close', 'gv-notes', 'gv-note-', 'gv-to-courses', 'gv-home', 'gv-progress']) check(`testid ${t}`, gv.includes(`data-testid="${t}`) || gv.includes('data-testid={`' + t))
check('접근성: role=dialog + aria-modal + aria-labelledby, Escape 닫기, 닫으면 장소로 포커스 복귀, 열면 첫 버튼 포커스', /role="dialog" aria-modal="true" aria-labelledby/.test(gv) && /e\.key === 'Escape'/.test(gv) && /returnFocus\.current\?\.focus/.test(gv) && /querySelector\('button'\)\?\.focus\(\)/.test(gv))
check('카드의 버튼은 높이 44 이상(장소 탭 박스 44px는 testGrammarVillage가 지킴)', /const BTN = 'min-h-\[44px\]/.test(gv) && /min-h-\[56px\]/.test(gv))
check('App: 마을 화면은 lazy(자체 청크) + QA_ONLY_SCREENS + qaTestStudent 게이팅', /const GrammarVillage = React\.lazy\(\(\) => import\('\.\/components\/GrammarVillage'\)\)/.test(app) && /QA_ONLY_SCREENS = \[[^\]]*'grammarVillage'\]/.test(app) && /qaTestStudent && screen === 'grammarVillage'/.test(app))
check('App: 홈 문법 카드 → grammarVillage, 마을 시작은 returnTo village + placeId, 과정 목록은 viaVillage', /t === 'grammar' \? 'grammarVillage'/.test(app) && /returnTo: 'village', placeId:/.test(app) && /viaVillage: true/.test(app))
check('App: 완료 단원 세션 상태(중복 제거) + 공원 미션 id와 서로 반영', /\[completedUnitIds, setCompletedUnitIds\] = useState\(\[\]\)/.test(app) && /s\.includes\(uid\) \? s : \[\.\.\.s, uid\]/.test(app) && /missionForUnit\(uid\)/.test(app) && /missionById\(id\)/.test(app))
check('App: 덱·목록을 나가면 마을로(villageBack), 속도 위젯은 마을에서 숨김, 목록 홈 버튼 라벨', /villageBack \? 'grammarVillage' : 'home'/.test(app) && /screen !== 'grammarVillage' && <SpeedBtn/.test(app) && /homeLabel=\{villageBack \? '← 마을 지도' : '← 홈'\}/.test(app))
check('App: 마을/villageArt 정적 import 없음(청크 분리)', !/import [^\n]*GrammarVillage[^\n]* from/.test(app) && !/import [^\n]*villageArt/.test(app))
check('덱: returnTo village는 town처럼 동작(← 마을, gd-to-town), data-return=village, 장소 소개 = 장소 이름 + doKo, 요약 도달 시 onUnitComplete', /returnTo === 'town' \|\| returnTo === 'village'/.test(gc) && /data-return=\{returnTown \? returnKind : undefined\}/.test(gc) && /place\.nameKo, introKo: place\.doKo/.test(gc) && /onUnitComplete\?\.\(unit\.id\)/.test(gc) && /homeLabel/.test(gc))
const importers = []
for (const f of fs.readdirSync('src', { recursive: true })) { const fp = path.join('src', f); if (/\.(jsx?|mjs)$/.test(f) && fs.statSync(fp).isFile() && /from '[^']*villageArt'/.test(fs.readFileSync(fp, 'utf8'))) importers.push(fp.replaceAll('\\', '/')) }
check('villageArt는 마을 화면만 import(main/StudentHome 금지)', importers.length === 1 && importers[0] === 'src/components/GrammarVillage.jsx', importers.join(','))
try { const idx = read('dist/index.html'); check('빌드 산출: index.html이 마을 청크를 modulepreload하지 않음', !/GrammarVillage/.test(idx)) } catch { console.log('SKIP dist/index.html 없음(빌드 전)') }
console.log(fail ? `FAILED ${fail}` : 'PASS grammar village screen')
process.exit(fail ? 1 : 0)
