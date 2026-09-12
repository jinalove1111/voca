// scripts/testTownV2Static.mjs — Paul Town V2-A(스토리북 마을 장면) 정적 계약
// (2026-09-13).
//
// src/config/features.js, src/App.jsx, src/components/town/v2/*.jsx,
// src/utils/town/townScene.js, src/assets/town/index.js를 소스 정규식만으로
// 검증한다(React 렌더 0, 네트워크 0). 이 스위트의 핵심 전제는 "V2는 V1을
// 재구현하지 않는다"(CLAUDE.md 규칙 3) — paulTownV2 플래그가 꺼져 있거나
// townV1Enabled가 false면 기존 V1 격자 화면(TownScreen.jsx)이 오늘과
// 바이트 단위로 동일하게 남아야 한다는 것을, App.jsx의 V1 렌더 분기
// 문자열이 origin/main과 정확히 같은지 + TownScreen.jsx/TownGrid.jsx 등
// V1 파일 자체가 origin/main과 byte-identical한지로 이중 확인한다.
//
// CRLF 안전화: Windows(core.autocrlf=true) 워킹카피는 \r\n일 수 있으므로
// 모든 소스를 읽는 즉시 LF로 정규화한다(scripts/testTownUiStatic.mjs와
// 동일 관례). git show(origin/main) 출력은 저장소 정규화(LF)로 오므로
// byte-identical 비교 시에도 양쪽을 LF로 맞춘 뒤 비교한다(플랫폼 줄바꿈
// 차이를 "실제 변경"으로 오인하지 않기 위함).
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()

let totalPassed = 0
let totalFailed = 0
let totalSkipped = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function skip(label, reason) {
  totalSkipped++
  console.log(`  SKIP  ${label}  ${reason}`)
}
function section(name) { console.log(`\n-- ${name} --`) }

function readSrc(rel) {
  const full = path.join(ROOT, rel)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf8').replace(/\r\n?/g, '\n')
}
function normalizeLF(s) { return typeof s === 'string' ? s.replace(/\r\n?/g, '\n') : s }
function stripComments(src) {
  if (!src) return ''
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}
function gitShow(relPath) {
  try {
    return execFileSync('git', ['show', `origin/main:${relPath}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  } catch (err) {
    return { __error: err?.message || String(err) }
  }
}

// ── 1. features.js — paulTownV2 플래그/카테고리 ─────────────────────────
section('1. src/config/features.js — paulTownV2 플래그')
const featuresSrc = readSrc('src/config/features.js')
const featuresCode = stripComments(featuresSrc)
check('features.js 존재', featuresSrc !== null)
check('features.js — paulTownV2: false 기본값', /paulTownV2\s*:\s*false\b/.test(featuresCode))
check('features.js — paulTownV1: false 여전히 존재(무변경)', /paulTownV1\s*:\s*false\b/.test(featuresCode))
check('features.js — townShopV1: false 여전히 존재(무변경)', /townShopV1\s*:\s*false\b/.test(featuresCode))
const attachmentArrayMatch = featuresCode.match(/attachment:\s*\[([^\]]*)\]/)
check('features.js — attachment 카테고리 배열을 찾을 수 있음', !!attachmentArrayMatch)
check(
  "features.js — attachment 카테고리 배열에 'paulTownV2' 포함",
  !!attachmentArrayMatch && /['"]paulTownV2['"]/.test(attachmentArrayMatch[1]),
  attachmentArrayMatch ? attachmentArrayMatch[1].slice(-200) : '(no match)',
)

// ── 2. App.jsx — paulTownV2 게이팅/lazy/렌더 분기 ────────────────────────
section('2. App.jsx — paulTownV2 게이팅/lazy/렌더 분기')
const appSrc = readSrc('src/App.jsx')
const appCode = stripComments(appSrc)
check('App.jsx 존재', appSrc !== null)
check(
  "App.jsx — paulTownV2Enabled가 useSyncExternalStore(subscribeFeatures, ()=>isFeatureEnabled('paulTownV2'))로 게이팅됨",
  /const\s+paulTownV2Enabled\s*=\s*useSyncExternalStore\(\s*subscribeFeatures\s*,\s*\(\)\s*=>\s*isFeatureEnabled\(\s*['"]paulTownV2['"]\s*\)/.test(appCode),
)
check(
  "App.jsx — townV2Active = townV1Enabled && paulTownV2Enabled",
  /const\s+townV2Active\s*=\s*townV1Enabled\s*&&\s*paulTownV2Enabled/.test(appCode),
)
check(
  "App.jsx — V1 렌더 분기 문자열이 byte-identical로 보존됨(<TownScreen studentData={studentData} townShop={townShop} onBack=)",
  appCode.includes('<TownScreen studentData={studentData} townShop={townShop} onBack='),
)
check(
  "App.jsx — TownScreenV2 React.lazy import(./components/town/v2/TownScreenV2)",
  /React\.lazy\(\s*\(\)\s*=>\s*import\(\s*['"]\.\/components\/town\/v2\/TownScreenV2['"]\s*\)\s*\)/.test(appCode),
)
const townScreenV2TagMatch = appCode.match(/<TownScreenV2\b[^>]*>/)
check('App.jsx — <TownScreenV2 ...> 렌더 태그 존재', !!townScreenV2TagMatch)
check(
  'App.jsx — <TownScreenV2>에 studentData={studentData} 전달',
  !!townScreenV2TagMatch && /studentData=\{studentData\}/.test(townScreenV2TagMatch[0]),
)
check(
  'App.jsx — <TownScreenV2>에 townShop={townShop} 전달',
  !!townScreenV2TagMatch && /townShop=\{townShop\}/.test(townScreenV2TagMatch[0]),
)
check(
  "App.jsx — townV2Active ? <TownScreenV2 .../> : <TownScreen ...> 삼항 분기 존재(townV2Active ? 리터럴, 괄호/줄바꿈 허용)",
  /townV2Active\s*\?\s*\(?\s*<TownScreenV2\b/.test(appCode),
)
check(
  "App.jsx — V2를 isFeatureEnabled('paulTownV1') && isFeatureEnabled('paulTownV2') 형태로 이중 게이팅하지 않음(진실원천은 townV1Enabled 하나)",
  !/isFeatureEnabled\(\s*['"]paulTownV1['"]\s*\)\s*&&\s*isFeatureEnabled\(\s*['"]paulTownV2['"]\s*\)/.test(appCode),
)

// ── 3. src/assets/town/index.js — 무변경(TOWN_ASSETS 여전히 빈 객체) ─────
section('3. src/assets/town/index.js — 무변경')
const assetsIndexSrc = readSrc('src/assets/town/index.js')
check('src/assets/town/index.js 존재', assetsIndexSrc !== null)
check(
  'src/assets/town/index.js — TOWN_ASSETS는 여전히 빈 객체(V2도 새 정적 에셋 0개)',
  !!assetsIndexSrc && /export const TOWN_ASSETS\s*=\s*\{\s*\}/.test(assetsIndexSrc),
)

// ── 4. V1 파일 byte-identical(origin/main 대비) — V2가 V1을 건드리지 않음 ──
section('4. V1 파일 무변경(origin/main과 byte-identical)')
const V1_UNCHANGED_FILES = [
  'src/components/town/TownScreen.jsx',
  'src/components/town/TownGrid.jsx',
  'src/components/town/TownHeader.jsx',
  'src/components/town/TownShopPanel.jsx',
  'src/components/town/TownInventory.jsx',
  'src/utils/town/townLayout.js',
  'src/utils/town/townCatalog.js',
  'src/utils/town/townLevel.js',
  'src/utils/town/townMessages.js',
  'src/hooks/useTownShop.js',
  'src/hooks/useStudent.js',
  'api/grant-xp.js',
]
for (const rel of V1_UNCHANGED_FILES) {
  const remote = gitShow(rel)
  if (remote && typeof remote === 'object' && remote.__error) {
    skip(`${rel} — origin/main과 byte-identical`, `git show 실패(${remote.__error.split('\n')[0]}) — SKIP`)
    continue
  }
  const local = readSrc(rel)
  if (local === null) {
    check(`${rel} — origin/main과 byte-identical`, false, '로컬 파일 없음')
    continue
  }
  check(`${rel} — origin/main과 byte-identical(V2가 V1을 수정하지 않음)`, normalizeLF(local) === normalizeLF(remote))
}

// ── 5. api/**, *.sql — origin/main 대비 무변경(DDL/서버 로직 무접촉) ──────
section('5. api/** 및 *.sql — origin/main 대비 무변경')
try {
  const diffOut = execFileSync('git', ['diff', '--name-only', 'origin/main', '--', 'api', '*.sql'], { cwd: ROOT, encoding: 'utf8' }).trim()
  check('git diff origin/main -- api **/*.sql — 변경 파일 0개', diffOut === '', diffOut)
} catch (err) {
  check('git diff origin/main -- api **/*.sql — 실행 가능', false, err?.message || String(err))
}

// ── 6. registry.mjs / testBrowserE2E.mjs 등록 ────────────────────────────
section('6. 러너 등록 — registry.mjs / testBrowserE2E.mjs')
const registrySrc = readSrc('tests/harness/registry.mjs')
check("tests/harness/registry.mjs에 'scripts/testTownSceneV2.mjs' 등록됨", !!registrySrc && /scripts\/testTownSceneV2\.mjs/.test(registrySrc))
check("tests/harness/registry.mjs에 'scripts/testTownV2Static.mjs' 등록됨", !!registrySrc && /scripts\/testTownV2Static\.mjs/.test(registrySrc))
const browserE2ESrc = readSrc('scripts/testBrowserE2E.mjs')
check("scripts/testBrowserE2E.mjs에 'tests/e2e/townV2.spec.mjs' 등록됨", !!browserE2ESrc && /tests\/e2e\/townV2\.spec\.mjs/.test(browserE2ESrc))
check("scripts/testBrowserE2E.mjs — '[town-v2]' 스펙 이름 등록됨", !!browserE2ESrc && /\[town-v2\]/.test(browserE2ESrc))

// ── 7. V2 컴포넌트 파일 존재 ──────────────────────────────────────────────
section('7. src/components/town/v2/* 파일 존재')
const V2_DIR = 'src/components/town/v2/'
const V2_FILE_NAMES = [
  'TownScreenV2.jsx', 'TownHud.jsx', 'PaulGuide.jsx', 'TownSheet.jsx',
  'TownScene.jsx', 'TownGroundLayer.jsx', 'TownPathLayer.jsx', 'TownAmbientLayer.jsx',
  'TownFogLayer.jsx', 'TownPlacementOverlay.jsx', 'TownObjectLayer.jsx', 'TownSprite.jsx',
]
const v2Raw = {}
for (const name of V2_FILE_NAMES) {
  const rel = V2_DIR + name
  v2Raw[name] = readSrc(rel)
  check(`${rel} 존재`, v2Raw[name] !== null)
}
const v2Code = {}
for (const name of V2_FILE_NAMES) v2Code[name] = stripComments(v2Raw[name])
const v2CombinedCode = Object.values(v2Code).join('\n')

const townSceneSrcForInvariants = readSrc('src/utils/town/townScene.js')
const sceneCodeForInvariants = stripComments(townSceneSrcForInvariants)
const combinedWithScene = v2CombinedCode + '\n' + sceneCodeForInvariants

// ── 8. 불변식 — v2 컴포넌트 + townScene.js 전체 ──────────────────────────
section('8. 불변식(v2/* + townScene.js) — 금지 패턴 0개')
check('v2/* + townScene.js — isFeatureEnabled( 호출 없음(플래그는 App.jsx 한 곳에서만 읽음)', !/isFeatureEnabled\(/.test(combinedWithScene))
check('v2/* + townScene.js — fetch( 없음', !/fetch\(/.test(combinedWithScene))
check('v2/* + townScene.js — supabase 없음', !/supabase/i.test(combinedWithScene))
check('v2/* + townScene.js — localStorage 없음', !/localStorage/.test(combinedWithScene))
check('v2/* + townScene.js — Math.random 없음', !/Math\.random\(/.test(combinedWithScene))
check('v2/* + townScene.js — total_stars/totalStars 산술 없음(잔액 역산 금지)', !/total_stars|totalStars/.test(combinedWithScene))
check('v2/* + townScene.js — assets/paul import 없음', !/from\s+['"][^'"]*assets\/paul[^'"]*['"]/i.test(combinedWithScene))
check('v2/* + townScene.js — <img>에 "paul" 경로/문자열 없음', !/<img[^>]*paul/i.test(combinedWithScene))
check('v2/* + townScene.js — Hogwarts/Harry/Potter 문자열 없음(저작권 회피)', !/Hogwarts|Harry|Potter/i.test(combinedWithScene))

// ── 9. TownScene.jsx / TownGroundLayer.jsx — 격자(grid) 레이아웃 금지 ────
section('9. TownScene.jsx / TownGroundLayer.jsx — grid-cols류 금지(스토리북 장면, 격자 아님)')
for (const name of ['TownScene.jsx', 'TownGroundLayer.jsx']) {
  const code = v2Code[name] || ''
  check(`${name} — grid-cols 클래스 없음`, !/grid-cols/.test(code))
  check(`${name} — gridTemplateColumns 없음`, !/gridTemplateColumns/.test(code))
  check(`${name} — aspect-square 없음`, !/aspect-square/.test(code))
}

// ── 10. 버튼 터치 타겟 — v2 전 파일 min-h-[44px] ─────────────────────────
section('10. v2/* — 모든 <button>이 min-h-[44px]')
function findButtonBlocks(src) {
  const blocks = []
  const re = /<button[^>]*>[\s\S]*?<\/button>/g
  let m
  while ((m = re.exec(src))) blocks.push(m[0])
  return blocks
}
const allButtonBlocks = V2_FILE_NAMES.flatMap((name) => findButtonBlocks(v2Code[name] || ''))
check(
  'v2/* — <button> 블록이 하나 이상 발견됨',
  allButtonBlocks.length > 0,
  `count=${allButtonBlocks.length}`,
)
check(
  'v2/* — 발견된 모든 <button> 블록이 min-h-[44px]를 포함',
  allButtonBlocks.length > 0 && allButtonBlocks.every((b) => /min-h-\[44px\]/.test(b)),
  `count=${allButtonBlocks.length}, 위반=${allButtonBlocks.filter((b) => !/min-h-\[44px\]/.test(b)).length}`,
)

// ── 11. motion-safe: — animate- 클래스는 항상 motion-safe: 접두 ──────────
section('11. v2/* — animate- 클래스는 항상 motion-safe: 접두')
const bareAnimateMatches = combinedWithScene.match(/(?<!motion-safe:)animate-[a-zA-Z0-9-]+/g) || []
check(
  'v2/* — animate- 클래스 사용이 있다면 전부 motion-safe: 접두가 붙음(bare animate- 0개)',
  bareAnimateMatches.length === 0,
  JSON.stringify(bareAnimateMatches.slice(0, 10)),
)

// ── 12. 상태변경 호출 집합 — V1(TownScreen.jsx) 밖으로 새지 않음 ─────────
section('12. studentData./townShop. 메서드 호출 — V1 집합의 부분집합')
function extractMutationCalls(code) {
  const set = new Set()
  const re = /\b(studentData|townShop)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g
  let m
  while ((m = re.exec(code))) set.add(`${m[1]}.${m[2]}`)
  return set
}
const v1TownScreenSrc = readSrc('src/components/town/TownScreen.jsx')
const v1TownScreenCode = stripComments(v1TownScreenSrc)
const v1MutationSet = extractMutationCalls(v1TownScreenCode)
const v2MutationSet = extractMutationCalls(v2CombinedCode)
check('V1(TownScreen.jsx)에서 studentData./townShop. 호출 집합을 추출할 수 있음(비어있지 않음)', v1MutationSet.size > 0, JSON.stringify([...v1MutationSet]))
const v2ExtraCalls = [...v2MutationSet].filter((c) => !v1MutationSet.has(c))
check(
  'v2/* studentData./townShop. 호출 — V1이 쓰지 않는 새 메서드 이름 0개(부분집합)',
  v2ExtraCalls.length === 0,
  `v2=${JSON.stringify([...v2MutationSet])} extra=${JSON.stringify(v2ExtraCalls)}`,
)
const EXPECTED_MUTATION_NAMES = ['placeTownItem', 'moveTownItem', 'storeTownItem', 'townShop.purchase', 'townShop.claimWelcome']
check(
  'V1 호출 집합에 계약이 나열한 5개 변형 메서드가 전부 존재(스펙 전제 검증)',
  EXPECTED_MUTATION_NAMES.every((n) => (n.startsWith('townShop.') ? v1MutationSet.has(n) : [...v1MutationSet].some((c) => c.endsWith(`.${n}`)))),
  JSON.stringify([...v1MutationSet]),
)

// ── 13. PaulGuide.jsx — 폴더 안 유일한 <HeroReaction> ────────────────────
section('13. PaulGuide.jsx — 폴 렌더 유일 지점')
const paulGuideCode = v2Code['PaulGuide.jsx'] || ''
check('PaulGuide.jsx — <HeroReaction 렌더 존재', /<HeroReaction/.test(paulGuideCode))
check(
  'PaulGuide.jsx — getReactionById import(../../../utils/paulReactions)',
  /import\s*\{\s*getReactionById\s*\}\s*from\s+['"]\.\.\/\.\.\/\.\.\/utils\/paulReactions['"]/.test(paulGuideCode),
)
const heroReactionCountOutsidePaulGuide = V2_FILE_NAMES
  .filter((n) => n !== 'PaulGuide.jsx')
  .reduce((sum, n) => sum + ((v2Code[n] || '').split('<HeroReaction').length - 1), 0)
check('v2/* — PaulGuide.jsx를 제외한 나머지 파일에는 <HeroReaction 렌더 없음', heroReactionCountOutsidePaulGuide === 0, `count=${heroReactionCountOutsidePaulGuide}`)

// ── 14. TownSheet.jsx ─────────────────────────────────────────────────────
section('14. TownSheet.jsx — dialog 계약')
const sheetCode = v2Code['TownSheet.jsx'] || ''
check('TownSheet.jsx — role="dialog"', /role="dialog"/.test(sheetCode))
check('TownSheet.jsx — data-testid="town-sheet"', /data-testid="town-sheet"/.test(sheetCode))
check('TownSheet.jsx — 닫기 버튼 data-testid="town-sheet-close" + "닫기" 텍스트', /data-testid="town-sheet-close"/.test(sheetCode) && /닫기/.test(sheetCode))

// ── 15. TownScene.jsx — 루트 계약 ─────────────────────────────────────────
section('15. TownScene.jsx — 루트 계약')
const sceneCompCode = v2Code['TownScene.jsx'] || ''
check('TownScene.jsx — data-testid="town-scene-v2"', /data-testid="town-scene-v2"/.test(sceneCompCode))
check('TownScene.jsx — role="group"', /role="group"/.test(sceneCompCode))
check('TownScene.jsx — aria-label="내 마을"', /aria-label="내 마을"/.test(sceneCompCode))
check('TownScene.jsx — inline aspectRatio 스타일', /aspectRatio/.test(sceneCompCode))

// ── 16. TownAmbientLayer.jsx — sr-only 정원 문장 ─────────────────────────
section('16. TownAmbientLayer.jsx — sr-only 정원 문장')
const ambientLayerCode = v2Code['TownAmbientLayer.jsx'] || ''
check('TownAmbientLayer.jsx — sr-only 클래스 존재', /sr-only/.test(ambientLayerCode))
check('TownAmbientLayer.jsx — "정원" 단어를 포함한 문장 존재', /정원/.test(ambientLayerCode))

// ── 17. TownFogLayer.jsx ──────────────────────────────────────────────────
section('17. TownFogLayer.jsx')
check('TownFogLayer.jsx — data-testid="town-fog"', /data-testid="town-fog"/.test(v2Code['TownFogLayer.jsx'] || ''))

// ── 18. TownPlacementOverlay.jsx ─────────────────────────────────────────
section('18. TownPlacementOverlay.jsx — 배치 앵커 버튼')
const placementCode = v2Code['TownPlacementOverlay.jsx'] || ''
check('TownPlacementOverlay.jsx — "여기에 놓기" aria-label 문구 존재', /여기에 놓기/.test(placementCode))
check('TownPlacementOverlay.jsx — data-anchor 속성 존재', /data-anchor=/.test(placementCode))

// ── 19. TownObjectLayer.jsx — 집/배치 래퍼 계약 ──────────────────────────
section('19. TownObjectLayer.jsx — 집/배치 래퍼 계약')
const objectLayerCode = v2Code['TownObjectLayer.jsx'] || ''
check('TownObjectLayer.jsx — data-testid="town-home"(집 래퍼)', /data-testid="town-home"/.test(objectLayerCode))
check('TownObjectLayer.jsx — data-placement-id 속성', /data-placement-id=/.test(objectLayerCode))
check('TownObjectLayer.jsx — data-item-id 속성', /data-item-id=/.test(objectLayerCode))
check('TownObjectLayer.jsx — data-cell 속성', /data-cell=/.test(objectLayerCode))
check('TownObjectLayer.jsx — 버튼 aria-label "눌러서 이동하거나 보관해요" 문구', /눌러서 이동하거나 보관해요/.test(objectLayerCode))

// ── 20. TownSprite.jsx ────────────────────────────────────────────────────
section('20. TownSprite.jsx — 에셋/이모지 폴백')
const spriteCode = v2Code['TownSprite.jsx'] || ''
check('TownSprite.jsx — data-asset-key 속성', /data-asset-key=/.test(spriteCode))
check('TownSprite.jsx — <img loading="lazy" decoding="async">(에셋 해석 시)', /<img[^>]*loading="lazy"[^>]*decoding="async"/.test(spriteCode))

// ── 21. TownHud.jsx — 레벨/잔액/목표/상점·보관함 진입 ────────────────────
section('21. TownHud.jsx')
const hudCode = v2Code['TownHud.jsx'] || ''
check('TownHud.jsx — "⭐ Lv." 칩', /⭐\s*Lv\./.test(hudCode))
check('TownHud.jsx — "💵" 칩', /💵/.test(hudCode))
check('TownHud.jsx — "공부하면 💵가 생겨요" 캡션', hudCode.includes('공부하면 💵가 생겨요'))
check('TownHud.jsx — data-testid="town-goal"', /data-testid="town-goal"/.test(hudCode))
check('TownHud.jsx — "🛒 상점" 버튼 문구', hudCode.includes('🛒 상점'))
check('TownHud.jsx — data-testid="town-open-shop"', /data-testid="town-open-shop"/.test(hudCode))
check('TownHud.jsx — "🎁 보관함" 버튼 문구', hudCode.includes('🎁 보관함'))
check('TownHud.jsx — data-testid="town-open-inventory"', /data-testid="town-open-inventory"/.test(hudCode))

// ── 22. TownScreenV2.jsx — 루트/뒤로가기/모드 배너 ───────────────────────
section('22. TownScreenV2.jsx')
const screenV2Code = v2Code['TownScreenV2.jsx'] || ''
check('TownScreenV2.jsx — data-testid="town-screen-v2"', /data-testid="town-screen-v2"/.test(screenV2Code))
check('TownScreenV2.jsx — "← Paul Town" 뒤로가기 버튼 텍스트', screenV2Code.includes('← Paul Town'))
check('TownScreenV2.jsx — 모드 배너 "취소" 버튼', /취소/.test(screenV2Code))

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed} / SKIP ${totalSkipped}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
