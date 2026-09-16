// scripts/testTownUiStatic.mjs — Paul Town V1 UI 정적 계약(2026-09-11).
//
// src/components/town/*.jsx + src/assets/town/index.js가 지켜야 할 계약을
// 소스 텍스트 정규식만으로 검증한다(네트워크 0, DB 0, React 렌더 0 —
// JSX/브라우저 실행 없이도 결정론적으로 도는 순수 정적 하네스). 폴
// 캐릭터는 이 마을 화면들 어디에서도 새 이미지로 렌더되지 않고 오직
// HeroReaction + getReactionById(src/utils/paulReactions.js)로만 표시돼야
// 한다는 것, ⭐(별)에서 💵(Paul Dollar 잔액)을 역산하지 않는다는 것,
// 44px 이상 터치 타겟, 화면 게이팅(paulTownV1)이 이 스위트의 핵심이다.
//
// CRLF 안전화: Windows(core.autocrlf=true) 워킹카피는 \r\n일 수 있으므로
// 모든 소스를 읽는 즉시 LF로 정규화한다(testTownShop.mjs와 동일 관례).
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond) {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(label); console.log(`  FAIL  ${label}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function readSrc(rel) {
  const full = path.join(ROOT, rel)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf8').replace(/\r\n?/g, '\n')
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

// 소스(주석 제거본) 안의 모든 <button ...>...</button> 블록을 추출한다
// (이 저장소의 버튼은 서로 중첩되지 않으므로 non-greedy 매칭으로 충분).
function findButtonBlocks(src) {
  const blocks = []
  const re = /<button[^>]*>[\s\S]*?<\/button>/g
  let m
  while ((m = re.exec(src))) blocks.push(m[0])
  return blocks
}

function hasTouchTarget(tag) {
  if (!tag) return false
  return /min-h-\[44px\]/.test(tag) || /\bpy-3\b/.test(tag) || /py-3\.5/.test(tag) || /\bpy-4\b/.test(tag)
}

// labelText를 담은 <button> 블록이 하나라도 44px+ 터치 타겟 class를
// 가지고 있으면 true(주석은 이미 제거된 소스를 넘겨받는다는 전제).
function buttonWithLabelHasTouchTarget(strippedSrc, labelText) {
  return findButtonBlocks(strippedSrc).some((b) => b.includes(labelText) && hasTouchTarget(b))
}

function countOccurrences(src, needle) {
  if (!src) return 0
  return src.split(needle).length - 1
}

const TOWN_COMPONENT_FILES = [
  'src/components/town/TownScreen.jsx',
  'src/components/town/TownGrid.jsx',
  'src/components/town/TownShopPanel.jsx',
  'src/components/town/TownInventory.jsx',
  'src/components/town/TownHeader.jsx',
]

const rawByFile = {}
for (const f of TOWN_COMPONENT_FILES) rawByFile[f] = readSrc(f)
const assetsIndexSrc = readSrc('src/assets/town/index.js')
const appSrc = readSrc('src/App.jsx')
const paulTownSrc = readSrc('src/components/PaulTown.jsx')
const paulReactionsSrc = readSrc('src/utils/paulReactions.js')
const townMessagesSrc = readSrc('src/utils/town/townMessages.js')
const registrySrc = readSrc('tests/harness/registry.mjs')

// ── 1. 파일/폴더 구조 ────────────────────────────────────────────────────
section('1. 파일/폴더 구조')
for (const f of TOWN_COMPONENT_FILES) {
  check(`${f} 존재`, rawByFile[f] !== null)
}
check('src/assets/town/index.js 존재', assetsIndexSrc !== null)
// TOWN_ASSETS는 2026-09-13부로 8개 키(my-house/british-cottage/tree/
// garden-stage-0..4)가 채워졌고, 2026-09-14에 9번째 키(book-shop),
// 10번째 키(red-post-box), 11번째 키(animals/cat), 12번째 키(animals/owl),
// 13번째 키(animals/puppy), 14번째 키(buildings/cafe)가 추가됐다. 같은 날
// Batch 3 첫 자산으로 15번째 키(special/bridge), 두 번째 자산으로 16번째
// 키(special/english-school), 세 번째 자산으로 17번째 키
// (decorations/town-sign), 네 번째 자산으로 18번째 키
// (special/clock-tower), 다섯 번째 자산으로 19번째 키
// (decorations/shop-lamp), 여섯 번째 자산으로 20번째 키
// (decorations/street-lamp), 일곱 번째 자산으로 21번째 키
// (decorations/stone-fountain)가 추가됐다 — decorations/bench는 지속된
// baked 배경 글로우 결함으로 이번 배치에서 DEFERRED(이모지 폴백 유지,
// V2 아트워크 백로그로 이월, PAUL_TOWN_ASSET_CONTRACT.md 참고)(더 이상
// 빈 객체가 아님) — 소스 텍스트에서 `TOWN_ASSETS = { ... }` 객체 리터럴
// 블록만 잘라내 그 안의 키 목록을 정규식으로 추출한다(plain Node는 .webp
// 정적 import를 해석 못 하므로 실제 import 대신 소스 텍스트 검사로 계약을
// 고정한다).
const townAssetsBlockMatch = assetsIndexSrc ? /export const TOWN_ASSETS\s*=\s*\{([\s\S]*?)\n\}/.exec(assetsIndexSrc) : null
const townAssetsKeys = townAssetsBlockMatch
  ? Array.from(townAssetsBlockMatch[1].matchAll(/'([^']+)':/g)).map((m) => m[1])
  : []
const EXPECTED_TOWN_ASSET_KEYS = [
  'buildings/my-house', 'buildings/british-cottage', 'buildings/book-shop', 'decorations/red-post-box', 'animals/cat', 'animals/owl', 'animals/puppy', 'buildings/cafe', 'special/bridge', 'special/english-school', 'decorations/town-sign', 'special/clock-tower', 'decorations/shop-lamp', 'decorations/street-lamp', 'decorations/stone-fountain', 'nature/tree',
  'nature/garden-stage-0', 'nature/garden-stage-1', 'nature/garden-stage-2',
  'nature/garden-stage-3', 'nature/garden-stage-4', 'nature/flower-garden',
]
// 2026-09-16(P0 Flower Bed 드롭인) — flower-garden에 실제 아트가 등록돼
// EXPECTED_TOWN_ASSET_KEYS로 옮김(이 파일 자체 주석이 예고한 대로 —
// TOWN_ASSETS는 V1/V2 공용 단일 resolver라 V1의 조회 결과도 함께
// emoji→실제 이미지로 바뀐다, 의도된 동작이지 V1 로직/JSX 변경 아님).
// bench는 이번에도 손대지 않아(작업 지시서 "Do NOT work on Bench yet")
// 계속 이모지 폴백 목록에 남는다.
const STILL_EMOJI_ONLY_ASSET_KEYS = [
  'decorations/bench',
]
check(
  'src/assets/town/index.js — TOWN_ASSETS가 정확히 22개 드롭인 키를 포함(flower-garden 추가 반영)',
  townAssetsKeys.length === EXPECTED_TOWN_ASSET_KEYS.length &&
    EXPECTED_TOWN_ASSET_KEYS.every((k) => townAssetsKeys.includes(k)),
  JSON.stringify(townAssetsKeys),
)
check(
  'src/assets/town/index.js — TOWN_ASSETS에 나머지 1개 카탈로그 키(bench, DEFERRED)는 여전히 없음(이모지 폴백 유지)',
  STILL_EMOJI_ONLY_ASSET_KEYS.every((k) => !townAssetsKeys.includes(k)),
  JSON.stringify(townAssetsKeys),
)
check('src/assets/town/index.js — townAsset() export', !!assetsIndexSrc && /export function townAsset\s*\(/.test(assetsIndexSrc))

const ASSET_FOLDERS = ['backgrounds', 'buildings', 'decorations', 'nature', 'animals', 'special', 'ui']
for (const folder of ASSET_FOLDERS) {
  check(`src/assets/town/${folder}/.gitkeep 존재`, existsSync(path.join(ROOT, 'src/assets/town', folder, '.gitkeep')))
}

// ── 2. 브랜드 마스코트(폴) 순수성 — 새 이미지 0, HeroReaction만 ─────────
section('2. 브랜드 마스코트 순수성 — 새 폴 이미지 0, HeroReaction/getReactionById만')
for (const f of TOWN_COMPONENT_FILES) {
  const src = rawByFile[f]
  const code = src ? stripComments(src) : ''
  check(`${f} — 폴 에셋 폴더(assets/paul) import 없음`, !/from\s+['"][^'"]*assets\/paul[^'"]*['"]/i.test(code))
  check(`${f} — <img>에 "paul" 경로/문자열 없음`, !/<img[^>]*paul/i.test(code))
}
check('src/assets/town/index.js — 폴 에셋(assets/paul, paulReactions) import 없음', !!assetsIndexSrc && !/(assets\/paul|paulReactions)/i.test(stripComments(assetsIndexSrc)))

check('TownScreen.jsx — HeroReaction import', !!rawByFile['src/components/town/TownScreen.jsx'] &&
  /import\s+HeroReaction\s+from\s+['"]\.\.\/HeroReaction['"]/.test(rawByFile['src/components/town/TownScreen.jsx']))
check('TownScreen.jsx — getReactionById import (paulReactions.js)', !!rawByFile['src/components/town/TownScreen.jsx'] &&
  /import\s*\{\s*getReactionById\s*\}\s*from\s+['"]\.\.\/\.\.\/utils\/paulReactions['"]/.test(rawByFile['src/components/town/TownScreen.jsx']))
check('TownScreen.jsx에는 <HeroReaction 렌더가 정확히 1곳', (rawByFile['src/components/town/TownScreen.jsx'] || '').split('<HeroReaction').length - 1 === 1)

// townMessages.js가 참조하는 reactionId 전부가 실제 PAUL_REACTIONS id 화이트리스트에 있는지
const allowedIds = new Set(
  (paulReactionsSrc ? stripComments(paulReactionsSrc) : '')
    .match(/id:\s*'[a-z_]+'/g)?.map((m) => m.match(/'([a-z_]+)'/)[1]) || []
)
check('paulReactions.js에서 허용 reactionId 목록을 추출할 수 있음(비어있지 않음)', allowedIds.size > 0)
const referencedIds = (townMessagesSrc ? stripComments(townMessagesSrc) : '')
  .match(/reactionId:\s*'[a-z_]+'/g)?.map((m) => m.match(/'([a-z_]+)'/)[1]) || []
check('townMessages.js에 reactionId 참조가 하나 이상 존재', referencedIds.length > 0)
check('townMessages.js의 모든 reactionId가 허용 목록 안에 있음', referencedIds.length > 0 && referencedIds.every((id) => allowedIds.has(id)))

// ── 3. ⭐(별)에서 💵(잔액) 역산 금지 ─────────────────────────────────────
section('3. total_stars/totalStars 산술 금지 — 잔액은 townShop.state.dollars.available만')
for (const f of TOWN_COMPONENT_FILES) {
  const code = rawByFile[f] ? stripComments(rawByFile[f]) : ''
  check(`${f} — total_stars/totalStars 참조 없음`, !/total_stars|totalStars/.test(code))
}

// ── 4. Supabase 직접 접근 금지 ───────────────────────────────────────────
section('4. src/components/town/* — supabase 직접 import 없음')
for (const f of TOWN_COMPONENT_FILES) {
  const code = rawByFile[f] ? stripComments(rawByFile[f]) : ''
  check(`${f} — supabase import 없음`, !/from\s+['"][^'"]*supabase[^'"]*['"]/i.test(code) && !/@supabase\/supabase-js/.test(code))
}

// ── 5. App.jsx 배선 — paulTownV1 게이팅 + lazy + Suspense ──────────────
section('5. App.jsx — paulTownV1 게이팅/lazy/Suspense')
const appCode = appSrc ? stripComments(appSrc) : ''
// 2026-09-12 Kinney Pilot A 사고 수정(fix/paul-town-v1-flag-entry) — 크로스탭
// 재조회를 위해 이 값이 이제 useSyncExternalStore로 subscribeFeatures를
// 구독하는 형태로 바뀌었다(단순 1회 읽기였던 이전 형태는 관리자가 다른
// 탭에서 플래그를 켜도 이미 열려 있던 탭이 갱신되지 않는 근본 원인이었음,
// src/config/features.js 헤더 주석 참고). 두 형태(레거시 직접 호출/신규
// useSyncExternalStore 구독) 중 하나만 있으면 통과하도록 완화한다 — 어느
// 쪽이든 실제로 isFeatureEnabled('paulTownV1')를 최종 진실 원천으로 쓰는
// 것은 동일하게 확인한다.
check(
  "App.jsx — paulTownV1Enabled가 isFeatureEnabled('paulTownV1')로 게이팅됨(직접 호출 또는 useSyncExternalStore 구독)",
  /const\s+paulTownV1Enabled\s*=\s*isFeatureEnabled\(\s*['"]paulTownV1['"]\s*\)/.test(appCode) ||
  /const\s+paulTownV1Enabled\s*=\s*useSyncExternalStore\(\s*subscribeFeatures\s*,\s*\(\)\s*=>\s*isFeatureEnabled\(\s*['"]paulTownV1['"]\s*\)/.test(appCode)
)
// 2026-09-12 Pilot A UUID 허용목록(feat/pilot-a-town-v1-allowlist) — 두
// 사용처(useTownShop enabled/onGoTown 게이팅)가 paulTownV1Enabled를 직접
// 참조하던 것을 townV1Enabled(= paulTownV1Enabled || isPilotTownStudent(studentId))로
// 바꿨다. 최종 진실 원천(isFeatureEnabled('paulTownV1'))은 위 체크에서 이미
// 확인하므로, 여기서는 두 변수명 중 하나만 있으면 통과하도록 완화한다.
check(
  'App.jsx — useTownShop enabled 조건에 paulTownV1Enabled/townV1Enabled 포함',
  /useTownShop\(\s*studentId\s*,\s*\(townShopEnabled\s*\|\|\s*paulTownV1Enabled\)/.test(appCode) ||
  /useTownShop\(\s*studentId\s*,\s*\(townShopEnabled\s*\|\|\s*townV1Enabled\)/.test(appCode)
)
check("App.jsx — TownScreen React.lazy import (components/town/TownScreen)", /React\.lazy\(\s*\(\)\s*=>\s*import\(\s*['"]\.\/components\/town\/TownScreen['"]\s*\)\s*\)/.test(appCode))
check("App.jsx — screen === 'town' 렌더 분기 존재", /screen\s*===\s*['"]town['"]/.test(appCode))
check("App.jsx — screen==='town' 블록이 React.Suspense로 감싸짐", /screen\s*===\s*'town'\s*&&\s*\(\s*<React\.Suspense/.test(appCode))
check(
  "App.jsx — onGoTown이 paulTownV1Enabled/townV1Enabled로 게이팅됨(OFF면 null)",
  /onGoTown=\{paulTownV1Enabled \? \(\) => setScreen\('town'\) : null\}/.test(appCode) ||
  /onGoTown=\{townV1Enabled \? \(\) => setScreen\('town'\) : null\}/.test(appCode)
)
check('App.jsx — TownScreen에 studentData/townShop/onBack 전달', /<TownScreen\s+studentData=\{studentData\}\s+townShop=\{townShop\}\s+onBack=/.test(appCode))

// ── 6. PaulTown.jsx — onGoTown 카드(플래그 OFF면 완전 무변화) ──────────
section('6. PaulTown.jsx — onGoTown 카드')
const paulTownCode = paulTownSrc ? stripComments(paulTownSrc) : ''
check('PaulTown.jsx — onGoTown prop 시그니처에 존재', /function PaulTown\(\{[^}]*onGoTown[^}]*\}\)/.test(paulTownCode))
check('PaulTown.jsx — onGoTown && 가드로 카드 렌더', /\{onGoTown\s*&&\s*\(/.test(paulTownCode))
check("PaulTown.jsx — '들어가기' 버튼 텍스트 존재", (paulTownSrc || '').includes('들어가기'))
check("PaulTown.jsx — '들어가기' 버튼/배지 44px 터치 타겟", /들어가기/.test(paulTownSrc || '') &&
  /min-h-\[44px\][^]*?들어가기/.test(paulTownSrc || ''))
check('PaulTown.jsx — onGoTown이 undefined/null이면 섹션 조건에 기존 showBuildings 분기 보존', /onGoTown\s*\|\|\s*\(showBuildings/.test(paulTownCode))

// ── 7. 터치 타겟(≥44px) — 주요 CTA 버튼 ─────────────────────────────────
section('7. 주요 CTA 버튼 — min-h-[44px] 또는 py-3+')
const shopSrc = rawByFile['src/components/town/TownShopPanel.jsx'] || ''
const invSrc = rawByFile['src/components/town/TownInventory.jsx'] || ''
const gridSrc = rawByFile['src/components/town/TownGrid.jsx'] || ''
const screenSrc = rawByFile['src/components/town/TownScreen.jsx'] || ''
const shopCode = stripComments(shopSrc)
const invCode = stripComments(invSrc)
const gridCode = stripComments(gridSrc)
const screenCode = stripComments(screenSrc)

check("TownShopPanel.jsx — '구매' 버튼 44px+", buttonWithLabelHasTouchTarget(shopCode, '구매'))
check("TownShopPanel.jsx — '사기' 버튼 44px+", buttonWithLabelHasTouchTarget(shopCode, '사기'))
check("TownShopPanel.jsx — '취소' 버튼 44px+", buttonWithLabelHasTouchTarget(shopCode, '취소'))
check("TownInventory.jsx — '마을에 놓기' 버튼 44px+", buttonWithLabelHasTouchTarget(invCode, '마을에 놓기'))
check("TownInventory.jsx — '위치 옮기기' 버튼 44px+", buttonWithLabelHasTouchTarget(invCode, '위치 옮기기'))
check("TownGrid.jsx — '이동' 액션 버튼 44px+", buttonWithLabelHasTouchTarget(gridCode, '이동'))
check("TownGrid.jsx — '보관' 액션 버튼 44px+", buttonWithLabelHasTouchTarget(gridCode, '보관'))
check('TownScreen.jsx — 탭 버튼(min-h-[44px]) 존재', /min-h-\[44px\][^]*?TABS\.map|TABS\.map[^]*?min-h-\[44px\]/.test(screenCode))

// ── 8. 이미지 lazy 로딩 ──────────────────────────────────────────────────
section('8. 에셋 <img> — loading="lazy"')
check('TownGrid.jsx — <img loading="lazy" decoding="async">', /<img[^>]*loading="lazy"[^>]*decoding="async"/.test(gridSrc))
check('TownShopPanel.jsx — <img loading="lazy" decoding="async">', /<img[^>]*loading="lazy"[^>]*decoding="async"/.test(shopSrc))
check('TownInventory.jsx — <img loading="lazy" decoding="async">', /<img[^>]*loading="lazy"[^>]*decoding="async"/.test(invSrc))

// ── 9. 브랜드 문구 — 파일당 최대 1회 ─────────────────────────────────────
section('9. 브랜드 문구(TOWN_PHRASES) — 파일당 최대 1회')
check('TownScreen.jsx — TOWN_PHRASES.brighter 최대 1회', countOccurrences(screenSrc, 'TOWN_PHRASES.brighter') <= 1)
check('TownScreen.jsx — TOWN_PHRASES.learnEarn 최대 1회', countOccurrences(screenSrc, 'TOWN_PHRASES.learnEarn') <= 1)
check('TownScreen.jsx — TOWN_PHRASES.smallSteps 최대 1회', countOccurrences(screenSrc, 'TOWN_PHRASES.smallSteps') <= 1)
check('TownShopPanel.jsx — TOWN_PHRASES.learnEarn 정확히 1회(헤더 문구)', countOccurrences(shopSrc, 'TOWN_PHRASES.learnEarn') === 1)

// ── 10. registry 등록 ────────────────────────────────────────────────────
section('10. registry.mjs 등록 확인')
check("tests/harness/registry.mjs에 'scripts/testTownUiStatic.mjs' 등록됨", !!registrySrc && /scripts\/testTownUiStatic\.mjs/.test(registrySrc))

// ── 11. PHASE 4(2026-09-11) — 학습→보상 연결 UI/카피 ────────────────────
section('11. PHASE 4 — 헤더 캡션/빈 상태/가이드 이벤트/잠금·부족 안내')
const headerSrc = rawByFile['src/components/town/TownHeader.jsx'] || ''
const headerCode = stripComments(headerSrc)

check('TownHeader.jsx — "공부하면 💵가 생겨요" 캡션 존재', headerSrc.includes('공부하면 💵가 생겨요'))
check('TownHeader.jsx — 캡션이 text-xs(12px) 이상 클래스를 씀', /<p className="text-xs[^"]*">\s*공부하면 💵가 생겨요\s*<\/p>/.test(headerSrc))
check('TownHeader.jsx — 캡션에 whitespace-nowrap(줄바꿈 없음)', /text-xs[^"]*whitespace-nowrap[^"]*"[^>]*>\s*공부하면 💵가 생겨요/.test(headerSrc))
check('TownHeader.jsx — 캡션에 text-[10px]/text-[9px] 같은 12px 미만 폰트 사용 안 함', !/text-\[(9|10|11)px\][^"]*"[^>]*>\s*공부하면 💵가 생겨요/.test(headerSrc))

check('TownShopPanel.jsx — rewardEngine의 REWARD_STARS import', /import\s*\{\s*REWARD_STARS\s*\}\s*from\s+['"]\.\.\/\.\.\/utils\/rewardEngine['"]/.test(shopCode))
check('TownShopPanel.jsx — 빈 상점 안내 카드 문구 존재("아직 💵가 없어요")', shopSrc.includes('아직 💵가 없어요'))
check('TownShopPanel.jsx — 빈 상점 안내 카드가 REWARD_STARS 변수 보간을 씀(하드코딩 아님)',
  /REWARD_STARS\['word-session-complete'\][\s\S]{0,80}REWARD_STARS\['writing-complete'\]/.test(shopCode))
check('TownShopPanel.jsx — 빈 상점 안내 문구에 "💵1," 같은 하드코딩 숫자 없음', !/💵1,|💵2!/.test(shopSrc))
check('TownShopPanel.jsx — 빈 상점 조건이 balance===0 && ownedIds 길이 0을 확인', /Number\(balance\)\s*===\s*0\s*&&[\s\S]{0,80}ownedIds\)\s*\?\s*ownedIds\.length\s*:\s*0\)\s*===\s*0/.test(shopCode))

check('TownShopPanel.jsx — TOWN_LEVELS import(townLevel.js)', /import\s*\{\s*TOWN_LEVELS\s*\}\s*from\s+['"]\.\.\/\.\.\/utils\/town\/townLevel['"]/.test(shopCode))
check('TownShopPanel.jsx — 잠김 카드 2번째 줄(목표 별 개수) 존재', /Level \{item\.minLevel\} = ⭐\{starsForLevel\(item\.minLevel\)\}/.test(shopSrc))
check('TownShopPanel.jsx — 부족액 카드에 "(공부하면 모여요)" 안내 추가', shopSrc.includes('(공부하면 모여요)'))
check('TownShopPanel.jsx — "💵 N 더 필요" 문구는 그대로 유지됨', /💵\s*\{shortfall\(item, balance\)\}\s*더 필요/.test(shopSrc))

check('TownInventory.jsx — 빈 보관함 안내 문구("상점에서 첫 아이템을 사보세요 🌳")', invSrc.includes('상점에서 첫 아이템을 사보세요 🌳'))
check('TownInventory.jsx — 빈 보관함 "상점으로 가기" 버튼 44px+', buttonWithLabelHasTouchTarget(invCode, '상점으로 가기'))
check('TownInventory.jsx — onGoShop prop 시그니처에 존재', /function TownInventory\(\{[^}]*onGoShop[^}]*\}\)/.test(invCode))

check('TownScreen.jsx — TownInventory에 onGoShop={() => setTab(\'shop\')} 전달', /onGoShop=\{\(\)\s*=>\s*setTab\('shop'\)\}/.test(screenCode))
check('TownScreen.jsx — earn_hint/welcome 분기(잔액0 & 보유0)', /noProgressYet[\s\S]{0,40}balance === 0 && ownedIds\.length === 0/.test(screenCode))
check('TownScreen.jsx — showGuide(noProgressYet ? \'earn_hint\' : \'welcome\') 호출', /showGuide\(noProgressYet \? 'earn_hint' : 'welcome'\)/.test(screenCode))

check('townMessages.js — earn_hint 이벤트 템플릿 존재(reactionId: study)', /earn_hint:\s*\{\s*reactionId:\s*'study'/.test(townMessagesSrc))
check('townMessages.js — level_progress 이벤트 템플릿 존재(reactionId: ponder)', /level_progress:\s*\{\s*reactionId:\s*'ponder'/.test(townMessagesSrc))
check('townMessages.js — 기존 이벤트(welcome/locked/levelup 등) 문구 불변', [
  "welcome: { reactionId: 'hello', text: 'Welcome to Paul Town! 오늘도 마을을 키워볼까요?' }",
  "locked: { reactionId: 'study', text: 'Level {level}에서 열려요' }",
  "levelup: { reactionId: 'levelup', text: 'Small Steps, Big Dreams. Level {level}!' }",
].every((line) => townMessagesSrc.includes(line)))
// 2026-09-15 — purchase_success는 의도적으로 변경됨(구매 직후 배치 안내
// 추가) — 위 "불변" 목록에서 분리해 새 문구를 직접 검증한다.
check(
  "townMessages.js — purchase_success 문구가 구매 확인 + 배치 안내를 함께 담음(2026-09-15 변경)",
  townMessagesSrc.includes("purchase_success: { reactionId: 'great', text: 'Great job! {name}을(를) 샀어요! 보관함에서 마을에 놓아보세요' }"),
)

// ── 12. 새 버튼/이미지 회귀 가드 ─────────────────────────────────────────
section('12. PHASE 4 — 새 <img> 없음 / 저작권 문구 없음 / 브랜드 문구 1회 유지')
// TownInventory.jsx는 기존에도 소유 아이템 에셋용 <img>가 있으므로(변경
// 대상 아님) 여기서는 이번 PHASE 4에서 새로 손댄 TownHeader.jsx만 검사한다.
check('src/components/town/TownHeader.jsx — 새 <img> 태그 없음(PHASE 4 추가분)', !/<img/.test(rawByFile['src/components/town/TownHeader.jsx'] || ''))
const allTownSrcForBrandCheck = TOWN_COMPONENT_FILES.map((f) => rawByFile[f] || '').join('\n') + '\n' + (townMessagesSrc || '')
check('마을 코드 전체 — "Hogwarts/Harry/Potter" 문자열 없음(저작권 회피)', !/Hogwarts|Harry|Potter/i.test(allTownSrcForBrandCheck))
check('TownShopPanel.jsx — TOWN_PHRASES.learnEarn 여전히 정확히 1회(PHASE 4로 늘지 않음)', countOccurrences(shopSrc, 'TOWN_PHRASES.learnEarn') === 1)

// ── 13. 구매 실패 fail-safe + <img> 폴백(2026-09-15c) ─────────────────
// 실측 결함 회귀 가드: (1) 서버 SQL(supabase_v3_47_town_shop.sql)·mock이
// 돌려주는 잔액 부족 사유는 'insufficient'인데 클라이언트는
// 'insufficient_funds'만 봐서 죽은 분기였다, (2) in_flight/network_failed
// 등 나머지 실패는 아무 안내 없이 확인 시트만 닫혔다, (3) V1 상점/보관함
// <img>에 onError 폴백이 없어 자산 404 시 깨진 아이콘이 노출됐다.
section('13. TownShopPanel/TownInventory — 구매 실패 피드백 + 이미지 폴백')
check("TownShopPanel.jsx — 서버 진실 사유 'insufficient'를 처리(죽은 분기 해소)", /res\.reason === 'insufficient'/.test(shopCode))
check("TownShopPanel.jsx — 부족액을 서버 balanceAfter 기준으로 계산(헤더 잔액과 일치)", /balanceAfter/.test(shopCode) && /shortfall\(item, knownBalance\)/.test(shopCode))
check("TownShopPanel.jsx — 'in_flight' → purchase_busy 안내", /'in_flight'[\s\S]{0,120}purchase_busy/.test(shopCode))
check("TownShopPanel.jsx — 그 외 모든 실패 → purchase_failed 안내(조용한 실패 없음)", /else\s*\{\s*onGuide && onGuide\('purchase_failed'/.test(shopCode))
check('TownShopPanel.jsx — onPurchase throw도 흡수(try/catch)', /try\s*\{\s*res = await onPurchase\(item\.id\)\s*\}\s*catch/.test(shopCode))
check("townMessages.js — purchase_busy 템플릿(reactionId ponder)", /purchase_busy:\s*\{\s*reactionId:\s*'ponder'/.test(townMessagesSrc || ''))
check("townMessages.js — purchase_failed 템플릿(reactionId almost, {name} 포함)", /purchase_failed:\s*\{\s*reactionId:\s*'almost',\s*text:\s*'[^']*\{name\}[^']*'/.test(townMessagesSrc || ''))
check('TownShopPanel.jsx — <img> onError → 이모지 폴백(ItemThumb)', /onError=\{\(\)\s*=>\s*setLoadFailed\(true\)\}/.test(shopSrc) && /function ItemThumb\(/.test(shopCode))
check('TownInventory.jsx — <img> onError → 이모지 폴백(ItemThumb)', /onError=\{\(\)\s*=>\s*setLoadFailed\(true\)\}/.test(invSrc) && /function ItemThumb\(/.test(invCode))
check('TownShopPanel.jsx/TownInventory.jsx — 폴백 상태가 assetKey 변경 시 리셋(useEffect)', /useEffect\(\(\) => \{ setLoadFailed\(false\) \}, \[assetKey\]\)/.test(shopCode) && /useEffect\(\(\) => \{ setLoadFailed\(false\) \}, \[assetKey\]\)/.test(invCode))

// ── 14. 마을 장면 비주얼 업그레이드(2026-09-15) — 체스판 인상 제거 ────────
section('14. TownGrid.jsx — 체스판(checkerboard) 제거 + 배치모드 전용 안내')
check('TownGrid.jsx — 칸 배경 bg-white/40 제거됨(체스판의 직접 원인)', !gridCode.includes('bg-white/40'))
check('TownGrid.jsx — HOME 칸 하드 박스(bg-purple-100 border-purple-300 조합) 제거됨', !gridSrc.includes('bg-purple-100 border-2 border-purple-300'))
check('TownGrid.jsx — 칸별 고정 자갈길 배경(bg-[#d9d2c5]) 삭제(연속 레이어로 대체)', !/isPath\s*\?\s*'bg-\[#d9d2c5\]'/.test(gridSrc))
check('TownGrid.jsx — 연속 바닥 레이어(그라데이션 + aria-hidden) 존재', /aria-hidden="true"[^]*?bg-gradient-to-b from-\[#fdebd0\]/.test(gridSrc) || /bg-gradient-to-b from-\[#fdebd0\][^]*?aria-hidden="true"/.test(gridSrc))
check('TownGrid.jsx — 자갈길 밴드가 COBBLE_STYLE(연속 텍스처 배경)로 렌더', /COBBLE_STYLE/.test(gridSrc) && /const COBBLE_STYLE = \{[^}]*backgroundImage/.test(gridSrc))
// 2026-09-15b — 사용자 승인 콘셉트 이미지 기반 환경 아트워크 4종 배선
// 회귀 가드. 실제 파일 import 존재 + 구매 가능한 카탈로그 아이템은 이
// 레이어에 절대 포함되지 않음(townAsset()/TOWN_ASSETS 미사용)을 확인.
check('TownGrid.jsx — 하늘/원경 배경 아트워크 import 존재', /import skyBackdrop from '\.\.\/\.\.\/assets\/town\/backgrounds\/village-sky-backdrop\.webp'/.test(gridSrc))
check('TownGrid.jsx — 돌담/산울타리 경계 아트워크 import 존재', /import hedgeBorder from '\.\.\/\.\.\/assets\/town\/backgrounds\/village-hedge-border\.webp'/.test(gridSrc))
check('TownGrid.jsx — 자갈길 텍스처 아트워크 import 존재', /import cobblestoneTile from '\.\.\/\.\.\/assets\/town\/backgrounds\/village-cobblestone-tile\.webp'/.test(gridSrc))
check('TownGrid.jsx — 정원 장식 스프라이트 3개 import 존재', /import gardenAccent1 from/.test(gridSrc) && /import gardenAccent2 from/.test(gridSrc) && /import gardenAccent3 from/.test(gridSrc))
check('TownGrid.jsx — 하늘/산울타리는 grid 칸과 분리된 헤더 띠(row 0과 절대 안 겹침, 카멜플라주 회귀 방지)', /<div className="relative h-16 sm:h-20 md:h-24" aria-hidden="true">/.test(gridSrc))
check('TownGrid.jsx — 환경 아트워크 레이어에 townAsset()/TOWN_ASSETS 카탈로그 참조 없음(구매 아이템 미포함)', !/GARDEN_ACCENTS[\s\S]{0,400}townAsset\(/.test(gridSrc))
check('TownGrid.jsx — 장식 스프라이트에 alt 속성 없음(aria-hidden만으로 숨김, img[alt] 카운트 오염 방지 — 2026-09-15b 실제 회귀 수정)', !/gardenAccent1[\s\S]{0,50}alt=/.test(gridSrc) && (() => {
  const m = gridSrc.match(/\{GARDEN_ACCENTS\.map[\s\S]*?\)\)\}/)
  return !!m && !/\balt=/.test(m[0])
})())
check('TownGrid.jsx — 빈 칸 배치 안내는 showPlacementGuide 조건에서만 렌더(평시엔 안 보임)', /showPlacementGuide\s*=\s*isEmpty\s*&&\s*\(modeKind === 'placing' \|\| modeKind === 'moving'\)/.test(gridCode))
check('TownGrid.jsx — 배치 안내는 점선(border-dashed)만 쓰고 강한 체스판 배색 없음', /border-dashed border-\[#e0a73a\]/.test(gridSrc))
check('TownGrid.jsx — ambientClassFor/depthClassFor(townAmbient.js 기존 순수 함수) 재사용, 새 팔레트 없음', /from '\.\.\/\.\.\/utils\/town\/townAmbient'/.test(gridSrc))
check('TownGrid.jsx — 좌표/클릭 판정 함수(handleCellClick/isHomeCell) 그대로 유지', /function handleCellClick\(x, y\)/.test(gridCode) && /function isHomeCell\(x, y\)/.test(gridCode))
check('TownGrid.jsx — 배치된 아이템에 접지 그림자(그라운딩) 요소 존재', /bg-black\/15 blur-\[1px\]/.test(gridSrc))
check('TownGrid.jsx — 이미지 로드 실패 시 이모지 폴백(onError, V2 TownSprite.jsx와 동일 원칙)', /onError=\{\(\)\s*=>\s*setLoadFailed\(true\)\}/.test(gridSrc))
// 2026-09-15 — 1차 구현에서 배치 안내를 칸 전체를 채우는 점선 사각형으로
// 그려 오히려 체스판이 더 강하게 보이는 회귀가 실제로 있었다(시각 QA
// 스크린샷으로 발견·수정). 재발 방지: 배치 안내는 버튼 자체 배경이
// 아니라 칸 중앙의 작은 원(w-[45%] 이하)이어야 한다.
check('TownGrid.jsx — 배치 안내가 칸 전체 배경이 아니라 중앙의 작은 원(회귀 방지)', !/showPlacementGuide\s*\?\s*'border-2 border-dashed/.test(gridCode) && /showPlacementGuide && \([\s\S]{0,200}rounded-full border-2 border-dashed/.test(gridSrc))

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
