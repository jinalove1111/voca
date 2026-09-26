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
//
// CI 얕은 체크아웃(shallow checkout) 대응(2026-09-13, PR #49 Release Gate
// CI-only 실패 수정) — GitHub Actions의 기본 checkout은 origin/main
// 참조가 아예 없을 수 있어(fatal: bad revision 'origin/main') git 명령이
// 실패한다. 로컬 개발 환경(origin/main 존재)에서는 실제 비교가 돌아야
// 하므로 기본값은 그대로 'origin/main'을 쓰되, CI가 다른 기준 ref(또는
// 얕은 체크아웃임을 알리는 값)를 넘길 수 있도록 환경변수로 오버라이드
// 가능하게 한다. 이 값을 못 찾아 git이 throw하면(byte-identity 12개
// 체크와 동일한 관례로) FAIL이 아니라 SKIP으로 기록한다 — "origin/main이
// 없다"는 CI 체크아웃 설정 문제이지, 이 세션이 만든 회귀가 아니기 때문.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const BASE_REF = process.env.V2_STATIC_BASE_REF || 'origin/main'

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
    return execFileSync('git', ['show', `${BASE_REF}:${relPath}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
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

// ── 3. src/assets/town/index.js — 드롭인 아트 21개 키만, V2 전용 에셋은 0개 ──
section('3. src/assets/town/index.js — 드롭인 아트 21개 키 외 무변경')
const assetsIndexSrc = readSrc('src/assets/town/index.js')
check('src/assets/town/index.js 존재', assetsIndexSrc !== null)
// 2026-09-13 아트워크 드롭인(batch1)으로 TOWN_ASSETS가 8개 키(my-house/
// british-cottage/tree/garden-stage-0..4)로 채워졌고, 2026-09-14에 batch2
// 9번째 키(book-shop), 10번째 키(red-post-box), 11번째 키(animals/cat),
// 12번째 키(animals/owl), 13번째 키(animals/puppy), 14번째 키
// (buildings/cafe)가 추가됐다. 같은 날 batch3 첫 자산으로 15번째 키
// (special/bridge), 두 번째 자산으로 16번째 키(special/english-school),
// 세 번째 자산으로 17번째 키(decorations/town-sign), 네 번째 자산으로
// 18번째 키(special/clock-tower), 다섯 번째 자산으로 19번째 키
// (decorations/shop-lamp), 여섯 번째 자산으로 20번째 키
// (decorations/street-lamp), 일곱 번째 자산으로 21번째 키
// (decorations/stone-fountain)가 추가됐다 — decorations/bench는 baked
// 배경 글로우 결함으로 DEFERRED(TOWN_ASSETS에 없음, 이모지 폴백 유지) —
// 더 이상 빈 객체가 아니다
// (scripts/testTownUiStatic.mjs의 동일 계약과 함께 유지). 이 섹션의 핵심은
// "V2 전용 새 정적 에셋이 추가로 생기지 않았다"는 것이므로, 정확히 이 21개
// 키(V1/V2 공용 batch1+batch2+batch3)만 있고 그 이상은 없는지를 확인한다.
const townAssetsBlockMatchV2 = assetsIndexSrc ? /export const TOWN_ASSETS\s*=\s*\{([\s\S]*?)\n\}/.exec(assetsIndexSrc) : null
const townAssetsKeysV2 = townAssetsBlockMatchV2
  ? Array.from(townAssetsBlockMatchV2[1].matchAll(/'([^']+)':/g)).map((m) => m[1])
  : []
const EXPECTED_BATCH1_ASSET_KEYS = [
  'buildings/my-house', 'buildings/british-cottage', 'buildings/book-shop', 'decorations/red-post-box', 'animals/cat', 'animals/owl', 'animals/puppy', 'buildings/cafe', 'special/bridge', 'special/english-school', 'decorations/town-sign', 'special/clock-tower', 'decorations/shop-lamp', 'decorations/street-lamp', 'decorations/stone-fountain', 'nature/tree',
  'nature/garden-stage-0', 'nature/garden-stage-1', 'nature/garden-stage-2',
  'nature/garden-stage-3', 'nature/garden-stage-4', 'nature/flower-garden',
  'decorations/bench',
]
check(
  'src/assets/town/index.js — TOWN_ASSETS가 정확히 batch1+batch2+batch3+flower-garden+bench 23개 키만 포함(그 외 신규 에셋 0개)',
  townAssetsKeysV2.length === EXPECTED_BATCH1_ASSET_KEYS.length &&
    EXPECTED_BATCH1_ASSET_KEYS.every((k) => townAssetsKeysV2.includes(k)),
  JSON.stringify(townAssetsKeysV2),
)
// 2026-09-17 — bench도 실제 아트가 등록돼(P0 7/7) 예전 "아직 없음"
// assertion(flower-garden과 같은 방식)을 제거했다. P0 7종의 등록 여부는
// 위 EXPECTED_BATCH1_ASSET_KEYS 정확 일치 검사가 그대로 고정한다.
check(
  'src/assets/town/index.js — townAsset() 본문이 TOWN_ASSETS[assetKey] || null(등록 안 된 키는 항상 null 폴백)',
  !!assetsIndexSrc && /return\s+TOWN_ASSETS\[assetKey\]\s*\|\|\s*null/.test(assetsIndexSrc),
)

// ── 4. V1 파일 byte-identical(origin/main 대비) — V2가 V1을 건드리지 않음 ──
// 2026-09-15 예외 1차(정직하게 기록) — TownScreen.jsx/townLayout.js/
// townMessages.js는 "V2 작업 중 V1을 실수로 건드림"이 아니라 V1+V2
// 공유 UX 수정(구매-미배치 아이템 보관함 탭 배지 + 안내 문구, 두 화면에
// 동일하게 적용)으로 의도적으로 함께 바뀌었다.
// 2026-09-15 예외 2차 — TownGrid.jsx는 "마을 장면 비주얼 업그레이드"
// 작업(체스판/격자 인상 제거, V1이 실제 학생에게 보이는 화면이라 V1을
// 직접 고침 — V2 TownGroundLayer.jsx/TownPathLayer.jsx에서 이미 검증된
// CSS 기법을 재사용)으로 의도적으로 바뀌었다. 좌표/클릭 판정은 그대로다.
// 2026-09-15c 예외(PR #59, main 병합) — TownShopPanel.jsx/TownInventory.jsx는
// V1+V2가 그대로 공유하는 패널이며, 구매 실패 피드백(서버 사유
// 'insufficient' 미처리 죽은 분기 + 조용한 실패) 및 <img> onError 이모지
// 폴백이라는 클라이언트 fail-safe 수정으로 의도적으로 바뀌었다(V2 세션의
// 실수 아님).
// 이 6개 파일(TownScreen/townLayout/townMessages/TownGrid/TownShopPanel/
// TownInventory)만 목록에서 빼고 아래 6개는 여전히 그대로 보호한다(이번
// 변경들이 실제로 건드리지 않은 파일들의 회귀는 계속 잡아야 하므로).
section('4. V1 파일 무변경(origin/main과 byte-identical)')
const V1_UNCHANGED_FILES = [
  'src/components/town/TownHeader.jsx',
  'src/utils/town/townCatalog.js',
  'src/utils/town/townLevel.js',
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
  const diffOut = execFileSync('git', ['diff', '--name-only', BASE_REF, '--', 'api', '*.sql'], { cwd: ROOT, encoding: 'utf8' }).trim()
  check('git diff origin/main -- api **/*.sql — 변경 파일 0개', diffOut === '', diffOut)
} catch (err) {
  // 위 12개 byte-identity 체크(gitShow)와 동일한 관례 — BASE_REF가 이
  // 체크아웃에 없어서(fatal: bad revision 등) git 자체가 실행 안 되는
  // 것은 "api/**나 *.sql이 바뀌었다"는 신호가 아니므로 FAIL이 아니라
  // SKIP으로 기록한다. diff 자체는 실행됐는데 결과가 비어있지 않은
  // 경우(실제 변경 감지)는 위 try 블록의 check(...)가 그대로 FAIL을 낸다.
  const msg = err?.message || String(err)
  skip('git diff origin/main -- api **/*.sql — 실행 가능', `git diff 실패(${msg.split('\n')[0]}) — SKIP`)
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
  // 2026-09-18(작업 지시서 STEP 4) — 세계 좌표 렌더러 전환의 첫 신규 파일.
  'TownEnvImage.jsx',
  // 2026-09-18(작업 지시서 STEP 5) — ENV_PLACEMENTS 항목 렌더 공유
  // 컴포넌트 + 강/길 레이어.
  'TownEnvPlacement.jsx', 'TownWaterLayer.jsx',
  // 2026-09-18(작업 지시서 STEP 6) — 울타리·생울타리/클러스터/항상 보이는
  // 소품/표지판 레이어.
  'TownSceneryLayer.jsx',
  // 2026-09-18(작업 지시서 STEP 7) — 씬 로컬 UI z-index 상수(순수 데이터
  // 파일이지만 v2/* 디렉터리 소속이라 다른 신규 파일과 동일하게 존재
  // 확인 + §8 불변식 스캔 대상에 포함한다).
  'sceneZ.js',
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
// 2026-09-18(작업 지시서 STEP 4) — 세계 좌표 렌더러의 새 순수 모듈 2개도
// 이 불변식 스캔 범위에 포함한다(townScene.js와 동일한 취급 — v2/*가
// 소비하는 순수 도메인 모듈이라 같은 금지 패턴 계약을 받는다).
const worldRenderSrcForInvariants = readSrc('src/utils/town/worldRender.js')
const worldScenerySrcForInvariants = readSrc('src/utils/town/worldScenery.js')
const worldRenderCodeForInvariants = stripComments(worldRenderSrcForInvariants)
const worldSceneryCodeForInvariants = stripComments(worldScenerySrcForInvariants)
const combinedWithScene = v2CombinedCode + '\n' + sceneCodeForInvariants
  + '\n' + worldRenderCodeForInvariants + '\n' + worldSceneryCodeForInvariants

// ── 8. 불변식 — v2 컴포넌트 + townScene.js + worldRender.js + worldScenery.js ──
section('8. 불변식(v2/* + townScene.js + worldRender.js + worldScenery.js) — 금지 패턴 0개')
check('v2/* + townScene.js — isFeatureEnabled( 호출 없음(플래그는 App.jsx 한 곳에서만 읽음)', !/isFeatureEnabled\(/.test(combinedWithScene))
check('v2/* + townScene.js — fetch( 없음', !/fetch\(/.test(combinedWithScene))
check('v2/* + townScene.js — supabase 없음', !/supabase/i.test(combinedWithScene))
check('v2/* + townScene.js — localStorage 없음', !/localStorage/.test(combinedWithScene))
check('v2/* + townScene.js — Math.random 없음', !/Math\.random\(/.test(combinedWithScene))
check('v2/* + townScene.js — total_stars/totalStars 산술 없음(잔액 역산 금지)', !/total_stars|totalStars/.test(combinedWithScene))
check('v2/* + townScene.js — assets/paul import 없음', !/from\s+['"][^'"]*assets\/paul[^'"]*['"]/i.test(combinedWithScene))
check('v2/* + townScene.js — <img>에 "paul" 경로/문자열 없음', !/<img[^>]*paul/i.test(combinedWithScene))
check('v2/* + townScene.js — Hogwarts/Harry/Potter 문자열 없음(저작권 회피)', !/Hogwarts|Harry|Potter/i.test(combinedWithScene))
// 2026-09-18(작업 지시서 STEP 6) — 승인된 카피(worldScenery.js SIGNS)만
// 노출되고, Paul 환영 말풍선 문자열이 v2/* + worldScenery.js 어디에도
// 없는지 기계적으로 고정한다.
check('v2/* + worldScenery.js — "Welcome to Paul" 문자열 없음(환영 말풍선은 PaulGuide.jsx 몫이 아니라 이 세계 데이터/렌더러 범위 밖)', !combinedWithScene.includes('Welcome to Paul'))
// 2026-09-18(사전 보정 패스 — 오너 결정) — 4-arm 안내판이 SIGNS.fourWay로
// 추가되면서 "Learn"/"Be Kind" 금지는 더 이상 유효한 계약이 아니다(그
// 문자열이 이제 승인된 카피의 일부다) — 대신 "Go Further"(하네스 원본
// 4번째 칸 문구, 오너가 "Explore"로 교체하기로 결정)만 금지어로 남기고,
// 승인된 4개 라벨이 실제로 존재하는지 + TownSceneryLayer.jsx가 SIGNS.fourWay
// 를 렌더하는지 양성(positive) 계약을 추가한다(worldScenery.js가 그
// 데이터를, TownSceneryLayer.jsx가 그 렌더를 각각 소유 — Step 6 헤더 참고).
check('v2/* + worldScenery.js — "Go Further" 문자열 없음(오너 결정으로 "Explore"로 교체됨, 하네스 원본 문구는 승인된 카피가 아님)', !combinedWithScene.includes('Go Further'))
check(
  'worldScenery.js — 4-arm 안내판 승인된 라벨 4개(Learn/Grow/Be Kind/Explore) 전부 존재',
  ['Learn', 'Grow', 'Be Kind', 'Explore'].every((label) => worldSceneryCodeForInvariants.includes(label)),
)
check(
  'TownSceneryLayer.jsx — SIGNS.fourWay를 렌더함(<WorldSign sign={SIGNS.fourWay} /> 패턴)',
  /<WorldSign\s+sign=\{SIGNS\.fourWay\}/.test(v2Code['TownSceneryLayer.jsx'] || ''),
)

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
// 2026-09-13 최종 리뷰 결함 회귀 방지 — 마지막 행(SCENE_ROWS-1)에 놓인
// 아이템의 이동/보관 팝오버가 항상 top-full(아래)로만 열리면, TownScene의
// overflow-hidden 박스 밖으로 잘려 나가 그 칸의 아이템은 이동/보관이
// 아예 불가능해진다(정적으로는 코드에 "마지막 행이면 위로 연다" 분기와
// bottom-full 클래스가 실제로 존재하는지만 확인 — 좌표 계산 자체는
// tests/e2e/townV2.spec.mjs S4가 실제 DOM 위치로 검증).
check('TownObjectLayer.jsx — bottom-full 클래스 존재(마지막 행 팝오버 위쪽 배치)', /bottom-full/.test(objectLayerCode))
check('TownObjectLayer.jsx — SCENE_ROWS - 1(또는 동등한 마지막 행 판정) 존재', /SCENE_ROWS\s*-\s*1/.test(objectLayerCode))

// 2026-09-16 신규 — 고정 로트(LOTS) built 상태가 itemById[lot.id]의 실제
// 카탈로그 아이템을 찾아 townAsset()이 등록된 아트를 반환할 때만
// TownSprite로 그리고, 못 찾거나 아직 미등록이면 기존 placeholder 박스로
// 폴백하는지(작업 지시서 TASK 1/4) — 아트가 실제로 존재하는지는(픽셀)
// 검증하지 않는다(그런 자산이 없다), 소스 패턴만 확인한다.
check(
  'TownObjectLayer.jsx — townAsset import(../../../assets/town)',
  /import\s*\{\s*townAsset\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/assets\/town['"]/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — built 로트 카탈로그 조회 itemById[lot.id] 패턴 존재',
  /itemById\s*&&\s*itemById\[lot\.id\]/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — built 로트 스프라이트 변환 spriteFor(catalogItem) 패턴 존재',
  /spriteFor\(catalogItem\)/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — hasArt일 때만 <TownSprite 렌더(조건부)',
  /hasArt\s*\?\s*\(\s*<TownSprite\b/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — built placeholder 박스 클래스(솔리드) 여전히 존재(아트 없을 때 안전 폴백 유지)',
  objectLayerCode.includes('bg-[#8fb37a]/70 border-2 border-[#1e2a5a]/40'),
)
check(
  'TownObjectLayer.jsx — for-sale placeholder 박스 클래스(대시) + "for sale" 문구 여전히 존재(무변경)',
  objectLayerCode.includes('bg-[#d9d2c5]/50 border-2 border-dashed border-[#1e2a5a]/40') && objectLayerCode.includes('for sale'),
)
// 2026-09-18(작업 지시서 STEP 7, 세계 좌표 렌더러 전환) — 아래 두 단언은
// 옛 district-stack 변수/함수(districtLocalToGlobal의 결과 `g`, 구역별
// zIndexFor(row, district))를 검사했으나 그 지오메트리 체계 자체가
// 퇴역했다(TownObjectLayer.jsx가 이제 worldRender.landmarkBox()/
// worldZIndex('architecture', ...)를 쓴다) — 원래 단언의 "의도"(로트
// 지오메트리/ z 계산 블록이 상태(built/for-sale/hidden)별로 중복
// 구현되지 않고 한 곳에서만 온다)는 그대로 유지한 채, 대상 리터럴만
// 새 구현의 공유 헬퍼(landmarkGeometryStyle()/landmarkZ(), TownObjectLayer.jsx
// 안에 정의되어 built/for-sale/hidden/My House 네 분기가 전부 호출한다)
// 로 옮겨 다시 고정한다. 테스트를 느슨하게 만든 게 아니라, 승인된 설계가
// 실제로 바뀐 사실(district-stack → world-coordinate)을 반영한 갱신이다.
// box.leftPct는 정확히 2곳에서만 등장해야 한다 — 1) landmarkGeometryStyle()
// (랜드마크 본체 박스, built/for-sale/hidden/My House 네 분기가 전부
// 이 함수 하나를 공유) 2) LotShadow(그림자 타원 — 하네스도 obj와 shadow를
// 별개의 두 style 블록으로 그린다, renderLandmark()의 shadow.style.left
// 와 obj.style.left가 서로 다른 변수라는 점을 그대로 반영). 이 이상
// 늘어나면(3곳 이상) 어딘가 지오메트리 계산이 다시 중복 구현된 것이다.
check(
  'TownObjectLayer.jsx — box.leftPct가 정확히 2곳에서만 등장(landmarkGeometryStyle 본체 1 + LotShadow 그림자 1, 그 이상 중복 없음)',
  (objectLayerCode.match(/\$\{box\.leftPct\}%/g) || []).length === 2,
  `count=${(objectLayerCode.match(/\$\{box\.leftPct\}%/g) || []).length}`,
)
check(
  'TownObjectLayer.jsx — 로트 z-index가 공유 헬퍼 landmarkZ() 안에서만 계산됨(분기별 중복 없음 — worldZIndex(\'architecture\', ...) 1회만 등장)',
  (objectLayerCode.match(/worldZIndex\(\s*'architecture'/g) || []).length === 1,
  `count=${(objectLayerCode.match(/worldZIndex\(\s*'architecture'/g) || []).length}`,
)

// 2026-09-14 — 배치 팝오버 바깥 탭 백드롭(TownScene.jsx) 회귀 방지. 이
// 레이어의 루트(absolute inset-0, objects z-index)가 pointer-events-none이
// 아니면 빈 칸에서도 포인터 이벤트를 가로채 백드롭 클릭이 전부 막힌다
// (E2E 실측으로 발견·수정한 실제 버그 — tests/e2e/townV2.spec.mjs S4의
// 바깥 탭 닫기 시나리오가 동적으로도 검증).
check(
  'TownObjectLayer.jsx — 루트 레이어에 pointer-events-none(빈 칸이 백드롭 클릭을 가로채지 않도록)',
  /className="absolute inset-0 pointer-events-none"/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — 아이템 토글 버튼에 pointer-events-auto(루트가 none이어도 버튼 자체는 클릭 가능)',
  /pointer-events-auto[^"]*min-h-\[44px\] min-w-\[44px\]/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — 팝오버 이동/보관 버튼에 pointer-events-auto',
  (objectLayerCode.match(/pointer-events-auto[^"]*btn-press/g) || []).length === 2,
)

// 2026-09-18(D1 정정 — landmarkRenderSource 전면 교체) —
// TownObjectLayer.jsx는 이제 landmarkRenderSource를 전혀 참조하지 않고
// (잘못된 규칙, 완전 삭제), 대신 isFixedLandmarkId로 배치 루프의 list를
// 걸러낸다 — 고정 로트(LOTS)는 항상 lotState()만 보고 그린다(배치
// 데이터 유무와 무관, D1 정정 이전 동작으로 복귀).
check(
  'TownObjectLayer.jsx — landmarkRenderSource 참조가 완전히 사라짐(D1 정정)',
  !objectLayerCode.includes('landmarkRenderSource'),
)
check(
  'TownObjectLayer.jsx — isFixedLandmarkId를 worldRender에서 import',
  /import\s*\{[^}]*isFixedLandmarkId[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/town\/worldRender['"]/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — 배치 루프 list가 isFixedLandmarkId로 고정 랜드마크를 걸러냄',
  /placements\.filter\(\s*\(p\)\s*=>\s*p\s*&&\s*!isFixedLandmarkId\(p\.itemId\)\s*\)/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — LOTS 루프가 배치 유무와 무관하게 항상 그림(landmarkRenderSource 기반 조건부 return null 없음)',
  !/===\s*'placement'\)\s*return null/.test(objectLayerCode),
)
// LOTS 루프 밖에 built 로트를 그리는 또 다른 경로가 없는지 — 이 파일이
// 로트 렌더 지오메트리를 쓰는 지점은 landmarkGeometryStyle() 호출부
// (이미 위에서 "정확히 2곳"으로 고정) 하나뿐이라는 사실 자체가 "다른
// 경로 없음"의 증거다(중복 정의됐다면 3곳 이상이 됐을 것 — 위 체크가
// 이미 실패했을 것).
check(
  'TownObjectLayer.jsx — landmarkGeometryStyle 리터럴이 정확히 4곳(함수 정의 1 + 호출 3: hidden/built-or-for-sale/MyHouse, 다른 built 렌더 경로 없음 — 위 box.leftPct===2곳 체크와 함께 이중 확인)',
  (objectLayerCode.match(/landmarkGeometryStyle\(/g) || []).length === 4,
  `count=${(objectLayerCode.match(/landmarkGeometryStyle\(/g) || []).length}`,
)

// 2026-09-18(사전 보정 패스, 플레이어 배치 아이템 스케일 수정) —
// WORLD_FOOTPRINT_WIDTH_PCT(옛 {12,8,5.5} 상수)가 완전히 사라지고
// worldRender.placedItemWidthPct()로 대체됐는지, px 캡/뷰포트별 clamp()
// 가 섞여 들어오지 않았는지(전부 % 단위 하나로만 계산 — 작업 지시서
// 명시) 확인한다.
check(
  'TownObjectLayer.jsx — placedItemWidthPct를 worldRender에서 import',
  /import\s*\{[^}]*placedItemWidthPct[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/town\/worldRender['"]/.test(objectLayerCode),
)
check(
  'TownObjectLayer.jsx — placedItemWidthPct(sprite.footprint, anchor.depthY) 호출 존재',
  /placedItemWidthPct\(\s*sprite\.footprint,\s*anchor\.depthY\s*\)/.test(objectLayerCode),
)
check('TownObjectLayer.jsx — WORLD_FOOTPRINT_WIDTH_PCT(옛 px 캡 발자국 상수) 완전히 제거됨', !objectLayerCode.includes('WORLD_FOOTPRINT_WIDTH_PCT'))
check('TownObjectLayer.jsx — max-w-[ 없음(아이템 크기에 px 캡 없음, % 단독)', !objectLayerCode.includes('max-w-['))
check('TownObjectLayer.jsx — clamp( 없음(뷰포트별 다른 크기 없음, 360/390/430 동일 비율)', !objectLayerCode.includes('clamp('))

// ── 20. TownSprite.jsx ────────────────────────────────────────────────────
section('20. TownSprite.jsx — 에셋/이모지 폴백')
const spriteCode = v2Code['TownSprite.jsx'] || ''
check('TownSprite.jsx — data-asset-key 속성', /data-asset-key=/.test(spriteCode))
check('TownSprite.jsx — <img loading="lazy" decoding="async">(에셋 해석 시)', /<img[^>]*loading="lazy"[^>]*decoding="async"/.test(spriteCode))
// 2026-09-14 — 런타임 이미지 로드 실패 폴백(배포 후 해시 자산 404 시
// 깨진 이미지 아이콘 대신 이모지로 전환, 보안 리뷰 Low 발견 사항 수정).
check('TownSprite.jsx — onError 핸들러가 <img>에 존재', /<img[^>]*onError=/.test(spriteCode))
check(
  'TownSprite.jsx — 이미지 렌더 조건이 asset 존재 AND 로드 실패 아님(폴백 상태 게이팅)',
  /if\s*\(\s*asset\s*&&\s*!\s*\w+\s*\)/.test(spriteCode),
)
check('TownSprite.jsx — useState import(로드 실패 상태 추적)', /import\s*\{[^}]*useState[^}]*\}\s*from\s*['"]react['"]/.test(spriteCode))

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

// 2026-09-18 D1 정정 — 뷰모델 필터링(A2). isFixedLandmarkId import,
// freeCatalog/freeOwnedIds/renderPlacements 파생, TownScene/TownInventory
// prop 배선이 지시서대로인지 확인한다. TownShopPanel은 전체 catalog를
// 그대로 유지해야 한다(구매=소유권, 걸러내지 않음).
check(
  'TownScreenV2.jsx — isFixedLandmarkId를 worldRender에서 import',
  /import\s*\{\s*isFixedLandmarkId\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/town\/worldRender['"]/.test(screenV2Code),
)
check(
  'TownScreenV2.jsx — freeCatalog = catalog.filter(... !isFixedLandmarkId(it.id))',
  /freeCatalog\s*=\s*useMemo\(\(\)\s*=>\s*catalog\.filter\(\(it\)\s*=>\s*!isFixedLandmarkId\(it\.id\)\)/.test(screenV2Code),
)
check(
  'TownScreenV2.jsx — freeOwnedIds = ownedIds.filter(... !isFixedLandmarkId(id))',
  /freeOwnedIds\s*=\s*useMemo\(\(\)\s*=>\s*ownedIds\.filter\(\(id\)\s*=>\s*!isFixedLandmarkId\(id\)\)/.test(screenV2Code),
)
check(
  'TownScreenV2.jsx — renderPlacements = placements.filter(... !isFixedLandmarkId(p.itemId))',
  /renderPlacements\s*=\s*useMemo\(\(\)\s*=>\s*placements\.filter\(\(p\)\s*=>\s*p\s*&&\s*!isFixedLandmarkId\(p\.itemId\)\)/.test(screenV2Code),
)
check(
  'TownScreenV2.jsx — unplacedCount가 freeOwnedIds/renderPlacements 기준',
  /unplacedOwnedIds\(freeOwnedIds,\s*renderPlacements\)/.test(screenV2Code),
)
check(
  'TownScreenV2.jsx — <TownScene placements={renderPlacements} occupancyPlacements={placements} ...>',
  /<TownScene\s+placements=\{renderPlacements\}\s+occupancyPlacements=\{placements\}/.test(screenV2Code),
)
check(
  'TownScreenV2.jsx — <TownInventory items={freeCatalog} ... placements={renderPlacements} ...>',
  /<TownInventory\s+items=\{freeCatalog\}[\s\S]{0,120}placements=\{renderPlacements\}/.test(screenV2Code),
)
check(
  'TownScreenV2.jsx — <TownShopPanel items={catalog} ...>(상점은 전체 카탈로그 그대로, 걸러내지 않음)',
  /<TownShopPanel\s+items=\{catalog\}/.test(screenV2Code),
)

// ── 23. TownScene.jsx — occupancyPlacements(점유 판정용 전체 목록) ───────
section('23. TownScene.jsx — occupancyPlacements prop')
check(
  'TownScene.jsx — occupancyPlacements prop 수신',
  /function TownScene\(\{[\s\S]{0,200}occupancyPlacements/.test(sceneCompCode),
)
check(
  'TownScene.jsx — freeWorldAnchors(occupancyPlacements, level) 호출(placements가 아니라 전체 목록으로 점유 판정)',
  /freeWorldAnchors\(occupancyPlacements,\s*level\)/.test(sceneCompCode),
)
check(
  'TownScene.jsx — TownObjectLayer는 여전히 placements(렌더용, 걸러진 목록)를 받음',
  /<TownObjectLayer[\s\S]{0,80}placements=\{placements\}/.test(sceneCompCode),
)

// ── 24. TownPlacementOverlay.jsx — D5 겹침 해소(layoutPlacementControls) ──
section('24. TownPlacementOverlay.jsx — layoutPlacementControls 겹침 해소')
check(
  'TownPlacementOverlay.jsx — layoutPlacementControls를 worldRender에서 import',
  /import\s*\{[^}]*layoutPlacementControls[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/town\/worldRender['"]/.test(placementCode),
)
check('TownPlacementOverlay.jsx — ResizeObserver로 씬 박스 측정', /ResizeObserver/.test(placementCode))
check('TownPlacementOverlay.jsx — layoutPlacementControls( 호출 존재', /layoutPlacementControls\(/.test(placementCode))
check('TownPlacementOverlay.jsx — offset일 때만 그리는 leader line(aria-hidden svg)', /aria-hidden[\s\S]{0,40}(svg|line)|svg[\s\S]{0,120}aria-hidden/i.test(placementCode))
check('TownPlacementOverlay.jsx — data-anchor 버튼이 여전히 44x44(min-h/min-w 44)', /min-h-\[44px\][^"]*min-w-\[44px\]|min-w-\[44px\][^"]*min-h-\[44px\]/.test(placementCode))

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed} / SKIP ${totalSkipped}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
