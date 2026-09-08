// scripts/testTownShop.mjs
//
// Paul Town 별 상점 V1(townShopV1, 2026-09-06) + Paul Dollar V1(2026-09-08,
// DOLLAR_DESIGN_COMPLETE 2재화 분리) — 클라이언트 슬라이스 회귀 스위트.
// 네트워크 0, Supabase 0 — 서버 계약(api/grant-xp.js)은 다른 세션 소유라
// 여기서는 그 응답 "모양"을 흉내 낸 순수 값만 쓴다.
//
// 2재화 분리 핵심 계약: ⭐ starsEarned(누적 성취, 상점 소비로 절대 안
// 줄어듦) vs 💵 dollars.available(상점 화폐, 구매 때마다 줄어듦). 서버
// 응답은 { starsEarned, dollarsAvailable, dollarsEarned, dollarsSpent,
// owned, items }이고 레거시 { available, earned, spent }는 더 이상 오지
// 않는다 — normalizeShopState가 혹시 남은 레거시 응답도 안전하게 흡수하는지
// 별도로 검사한다.
//
// 구성:
//   1. townShop.js 순수 함수(shopItemState/applyPurchaseResult/
//      normalizeShopState/purchasedDeco/formatDollars) — 경계값/멱등성/
//      불변 계약 + 별-달러 분리 계약(별은 구매로 절대 안 바뀜).
//   2. 정적 배선 검사(주석 제거 후 정규식) — features.js 플래그,
//      wordLibrary.js 두 헬퍼의 액션명/필드 배제/토큰 단락평가,
//      useTownShop.js in-flight 가드 + useStudent 비참조,
//      useStudent.js 레코드 오염 0, PaulTown.jsx/App.jsx/Dashboard.jsx 배선
//      (wallet prop, ⭐/💵 배지 분리).
//   3. esbuild + react-dom/server SSR — PaulTown.jsx/Dashboard.jsx를 실제로
//      렌더해 플래그 OFF 시 오늘과 바이트 단위 동일 출력을, ON 시 상점
//      상태 4종 + wallet 배지 분리를 확인.
//
// 실행: node scripts/testTownShop.mjs
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { TOWN_SHOP_ITEMS, FIRST_ITEM_ID, shopItemState, applyPurchaseResult, normalizeShopState, purchasedDeco, formatDollars } from '../src/utils/townShop.js'

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

function stripComments(src) {
  // CRLF 안전화: Windows(core.autocrlf=true) 워킹카피는 \r\n인데, 아래
  // split('\n') 후 각 줄 끝에 남는 \r 때문에 /\/\/.*$/(m 플래그 없음, `.`가
  // 줄바꿈 문자를 소비 못함)가 `$`(문자열 끝)에 도달하지 못해 라인 주석이
  // 전혀 제거되지 않는 실사고가 있었다(예: useTownShop.js의 useStudent
  // 언급 주석이 안 지워져 "import 안 함" 단정이 오탐 FAIL). 정규식들을
  // 그대로 두고 입력을 먼저 LF로 정규화하는 단일 지점으로 고친다 — LF/CRLF
  // 어느 워킹카피에서도 동일한 결과를 보장.
  return src
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// 1. 순수 함수 — src/utils/townShop.js
// ══════════════════════════════════════════════════════════════════════
section('1. shopItemState — 4가지 상태 + 우선순위 (dollarsAvailable 기준)')
{
  const lamp = TOWN_SHOP_ITEMS[0]
  check('카탈로그 첫 아이템은 shop-lamp/책상 램프/💡/60/dollars', lamp.id === 'shop-lamp' && lamp.name === '책상 램프' && lamp.emoji === '💡' && lamp.price === 60 && lamp.priceCurrency === 'dollars')
  check('FIRST_ITEM_ID === shop-lamp', FIRST_ITEM_ID === 'shop-lamp')

  check('dollarsAvailable 충분 + 미보유 + 비구매중 → buyable', shopItemState(lamp, { dollarsAvailable: 100, owned: [], purchasing: false }).kind === 'buyable')
  check('dollarsAvailable 정확히 price → buyable(경계값)', shopItemState(lamp, { dollarsAvailable: 60, owned: [], purchasing: false }).kind === 'buyable')
  check('dollarsAvailable 1 부족 → insufficient, missing=1', (() => {
    const s = shopItemState(lamp, { dollarsAvailable: 59, owned: [], purchasing: false })
    return s.kind === 'insufficient' && s.missing === 1
  })())
  check('dollarsAvailable 0 → insufficient, missing=price', (() => {
    const s = shopItemState(lamp, { dollarsAvailable: 0, owned: [], purchasing: false })
    return s.kind === 'insufficient' && s.missing === 60
  })())
  check('purchasing=true(미보유) → purchasing', shopItemState(lamp, { dollarsAvailable: 100, owned: [], purchasing: true }).kind === 'purchasing')
  check('owned가 purchasing/insufficient보다 우선(owned wins)', (() => {
    const s1 = shopItemState(lamp, { dollarsAvailable: 0, owned: ['shop-lamp'], purchasing: true })
    const s2 = shopItemState(lamp, { dollarsAvailable: 0, owned: ['shop-lamp'], purchasing: false })
    return s1.kind === 'owned' && s2.kind === 'owned'
  })())
  check('dollarsAvailable 음수 → Math.max(0,·) 처리로 insufficient(missing=price)', (() => {
    const s = shopItemState(lamp, { dollarsAvailable: -5, owned: [], purchasing: false })
    return s.kind === 'insufficient' && s.missing === 60
  })())
  check('dollarsAvailable NaN/문자열 쓰레기 → 0 취급(insufficient)', (() => {
    const s1 = shopItemState(lamp, { dollarsAvailable: NaN, owned: [], purchasing: false })
    const s2 = shopItemState(lamp, { dollarsAvailable: 'abc', owned: [], purchasing: false })
    return s1.kind === 'insufficient' && s1.missing === 60 && s2.kind === 'insufficient' && s2.missing === 60
  })())
  check('owned 누락(undefined) → 크래시 없이 buyable/insufficient 판정', shopItemState(lamp, { dollarsAvailable: 100, purchasing: false }).kind === 'buyable')
  check('레거시 파라미터명 available도 하위호환 별칭으로 동작', (() => {
    const s = shopItemState(lamp, { available: 100, owned: [], purchasing: false })
    return s.kind === 'buyable'
  })())
  check('dollarsAvailable과 available 둘 다 있으면 dollarsAvailable 우선', (() => {
    const s = shopItemState(lamp, { dollarsAvailable: 0, available: 100, owned: [], purchasing: false })
    return s.kind === 'insufficient' && s.missing === 60
  })())
}

section('2. applyPurchaseResult — 순수 리듀서 (별-달러 분리 계약)')
{
  const base = { starsEarned: 223, dollars: { available: 100, earned: 100, spent: 0 }, owned: [] }
  {
    const res = { ok: true, reason: 'purchased', dollarsSpent: 60, balanceAfter: 40, duplicate: false }
    const next = applyPurchaseResult(base, 'shop-lamp', res)
    check('purchased → owned에 아이템 추가', next.owned.includes('shop-lamp'))
    check('purchased → dollars.available = balanceAfter', next.dollars.available === 40)
    check('purchased → starsEarned는 절대 안 바뀜(별은 상점에서 소비 안 됨)', next.starsEarned === 223)
    check('purchased → 원본 state는 불변(다른 참조, 값도 그대로)', base.owned.length === 0 && base.dollars.available === 100 && base.starsEarned === 223)
  }
  {
    const owned1 = { starsEarned: 223, dollars: { available: 40, earned: 100, spent: 60 }, owned: ['shop-lamp'] }
    const res = { ok: true, reason: 'already_owned', duplicate: true, balanceAfter: 40 }
    const next1 = applyPurchaseResult(owned1, 'shop-lamp', res)
    const next2 = applyPurchaseResult(next1, 'shop-lamp', res)
    check('already_owned → owned 중복 없이 그대로(멱등)', next1.owned.filter((i) => i === 'shop-lamp').length === 1)
    check('already_owned 두 번 적용해도 같은 내용(멱등)', JSON.stringify(next1) === JSON.stringify(next2))
    check('already_owned → starsEarned 불변', next1.starsEarned === 223)
  }
  {
    const res = { ok: false, reason: 'insufficient', balanceAfter: 5 }
    const next = applyPurchaseResult(base, 'shop-lamp', res)
    check('insufficient 실패 → dollars.available만 갱신', next.dollars.available === 5)
    check('insufficient 실패 → owned는 그대로(빈 배열)', next.owned.length === 0)
    check('insufficient 실패 → starsEarned 불변', next.starsEarned === 223)
  }
  {
    const res = { ok: false, reason: 'insufficient', balanceAfter: -3 }
    const next = applyPurchaseResult(base, 'shop-lamp', res)
    check('insufficient balanceAfter 음수 → 0으로 클램프', next.dollars.available === 0)
  }
  {
    const res = { ok: false, reason: 'unauthorized' }
    const next = applyPurchaseResult(base, 'shop-lamp', res)
    check('그 외 실패(unauthorized 등) → state가 정확히 같은 참조(불변 계약)', next === base)
  }
  {
    const res = { ok: false, reason: 'relogin_required' }
    const next = applyPurchaseResult(base, 'shop-lamp', res)
    check('relogin_required 실패 → 같은 참조 반환', next === base)
  }
  {
    const next = applyPurchaseResult(base, 'shop-lamp', null)
    check('res=null(네트워크 실패 등) → 같은 참조 반환, 크래시 없음', next === base)
  }
  {
    const res = { ok: true, reason: 'purchased', balanceAfter: 40 }
    const next = applyPurchaseResult(null, 'shop-lamp', res)
    check('state=null(초기 미로드) → 크래시 없이 안전 기본값에서 시작', next.owned.includes('shop-lamp') && next.dollars.available === 40 && next.starsEarned === 0)
  }
}

section('3. normalizeShopState — 새 서버 계약 + 레거시 방어')
{
  check('정상 응답 정규화(새 계약: starsEarned/dollarsAvailable/dollarsEarned/dollarsSpent)', (() => {
    const n = normalizeShopState({ ok: true, starsEarned: 223, dollarsAvailable: 40, dollarsEarned: 100, dollarsSpent: 60, owned: ['shop-lamp'], items: TOWN_SHOP_ITEMS })
    return n.starsEarned === 223 && n.dollars.available === 40 && n.dollars.earned === 100 && n.dollars.spent === 60 && n.owned.length === 1 && n.owned[0] === 'shop-lamp' && n.items.length === 1
  })())
  check('undefined → 크래시 없이 안전 기본값', (() => {
    const n = normalizeShopState(undefined)
    return n.starsEarned === 0 && n.dollars.available === 0 && Array.isArray(n.owned) && n.owned.length === 0 && Array.isArray(n.items) && n.items.length === 0
  })())
  check('null → 크래시 없이 안전 기본값', (() => {
    const n = normalizeShopState(null)
    return n.starsEarned === 0 && n.dollars.available === 0 && n.owned.length === 0
  })())
  check('dollarsAvailable 음수/NaN → 0', (() => {
    const n1 = normalizeShopState({ dollarsAvailable: -10, owned: [] })
    const n2 = normalizeShopState({ dollarsAvailable: 'garbage', owned: [] })
    return n1.dollars.available === 0 && n2.dollars.available === 0
  })())
  check('starsEarned 음수/NaN → 0', (() => {
    const n1 = normalizeShopState({ starsEarned: -10, owned: [] })
    const n2 = normalizeShopState({ starsEarned: 'garbage', owned: [] })
    return n1.starsEarned === 0 && n2.starsEarned === 0
  })())
  check('레거시 응답(available만 있고 dollarsAvailable 없음) → dollars.available로 안전 흡수', (() => {
    const n = normalizeShopState({ available: 40, spent: 60, earned: 100, owned: [] })
    return n.dollars.available === 40
  })())
  check('레거시 raw 응답(starsEarned/dollarsAvailable 둘 다 없음, earned/available만) → earned→starsEarned, available→dollars.available', (() => {
    const n = normalizeShopState({ earned: 223, spent: 60, available: 163, owned: [] })
    return n.starsEarned === 223 && n.dollars.available === 163
  })())
  check('새 응답(starsEarned/dollarsAvailable 둘 다 존재) → earned/available 필드는 무시하고 새 필드 그대로 사용(변경 없음)', (() => {
    const n = normalizeShopState({ starsEarned: 300, dollarsAvailable: 50, dollarsEarned: 80, dollarsSpent: 30, earned: 999, available: 999, owned: [] })
    return n.starsEarned === 300 && n.dollars.available === 50 && n.dollars.earned === 80 && n.dollars.spent === 30
  })())
  check('legacyShape:true 응답 — 이미 새 필드명으로 매핑돼 온 값을 그대로 통과(별도 분기 없이 일반 경로)', (() => {
    const n = normalizeShopState({ legacyShape: true, starsEarned: 223, dollarsAvailable: 163, dollarsEarned: 0, dollarsSpent: 0, owned: [] })
    return n.starsEarned === 223 && n.dollars.available === 163
  })())
  check('owned 중복 제거', normalizeShopState({ dollarsAvailable: 1, owned: ['shop-lamp', 'shop-lamp', 'shop-lamp'] }).owned.length === 1)
  check('owned 안의 숫자/객체/null 등 문자열 아닌 값 필터링', (() => {
    const n = normalizeShopState({ dollarsAvailable: 1, owned: ['shop-lamp', 42, null, {}, undefined] })
    return n.owned.length === 1 && n.owned[0] === 'shop-lamp'
  })())
  check('items가 배열이 아니면 빈 배열로', normalizeShopState({ dollarsAvailable: 1, owned: [], items: 'not-an-array' }).items.length === 0)
}

section('4. purchasedDeco — 카탈로그 순서/중복 제거')
{
  check('빈 owned → 빈 배열', purchasedDeco([]).length === 0)
  check('owned=[shop-lamp] → 1개, 💡 포함', (() => {
    const d = purchasedDeco(['shop-lamp'])
    return d.length === 1 && d[0].id === 'shop-lamp' && d[0].emoji === '💡' && d[0].name === '책상 램프'
  })())
  check('owned에 미지정 id 섞여도 무시(크래시 없음)', purchasedDeco(['shop-lamp', 'not-a-real-item']).length === 1)
  check('owned undefined/null → 빈 배열(크래시 없음)', purchasedDeco(undefined).length === 0 && purchasedDeco(null).length === 0)
  check('카탈로그 순서 고정(다중 아이템 카탈로그를 넣어도 카탈로그 순서를 따름)', (() => {
    const catalog = [{ id: 'a', emoji: '1', name: 'A' }, { id: 'b', emoji: '2', name: 'B' }]
    const d = purchasedDeco(['b', 'a'], catalog)
    return d.map((x) => x.id).join(',') === 'a,b'
  })())
}

section('5. formatDollars — 정수 통화 포맷')
{
  check('formatDollars(60) === "$60"', formatDollars(60) === '$60')
  check('formatDollars(0) === "$0"', formatDollars(0) === '$0')
  check('formatDollars(음수) → 0으로 클램프', formatDollars(-5) === '$0')
  check('formatDollars(NaN/문자열 쓰레기) → "$0"', formatDollars(NaN) === '$0' && formatDollars('abc') === '$0')
  check('formatDollars(소수) → 반올림 정수', formatDollars(59.6) === '$60')
}

// ══════════════════════════════════════════════════════════════════════
// 6. 정적 배선 검사
// ══════════════════════════════════════════════════════════════════════
section('6. 정적 배선 — features.js / wordLibrary.js / useTownShop.js / useStudent.js / PaulTown.jsx / App.jsx / Dashboard.jsx')
{
  const featuresSrc = stripComments(readFileSync(path.join(ROOT, 'src/config/features.js'), 'utf8'))
  check('features.js에 townShopV1: false 존재', /townShopV1\s*:\s*false/.test(featuresSrc))

  const wordLibSrc = readFileSync(path.join(ROOT, 'src/utils/wordLibrary.js'), 'utf8')
  const wordLibStripped = stripComments(wordLibSrc)
  check('fetchTownShopState 존재', /export\s+async\s+function\s+fetchTownShopState\s*\(/.test(wordLibStripped))
  check('postTownPurchase 존재', /export\s+async\s+function\s+postTownPurchase\s*\(/.test(wordLibStripped))
  // 함수별 본문만 잘라서 검사(다른 함수의 코드가 오검출되지 않도록).
  const sliceFn = (src, fnName) => {
    const start = src.indexOf(`function ${fnName}(`)
    if (start < 0) return ''
    // 다음 top-level export까지(대략) — 이 파일 함수들은 짧고 서로 붙어있다.
    const nextExport = src.indexOf('\nexport ', start + 10)
    return nextExport > 0 ? src.slice(start, nextExport) : src.slice(start, start + 800)
  }
  const fetchStateBody = sliceFn(wordLibStripped, 'fetchTownShopState')
  const postPurchaseBody = sliceFn(wordLibStripped, 'postTownPurchase')
  check('fetchTownShopState: /api/grant-xp로 POST', /fetch\(\s*'\/api\/grant-xp'/.test(fetchStateBody))
  check("fetchTownShopState: action:'get_town_shop_state' 포함", /action:\s*'get_town_shop_state'/.test(fetchStateBody))
  check('fetchTownShopState: token 필드 포함', /token:\s*_sessionToken/.test(fetchStateBody))
  check('fetchTownShopState: studentId를 바디에 싣지 않음', !/studentId/.test(fetchStateBody))
  check('fetchTownShopState: price를 바디에 싣지 않음', !/price/i.test(fetchStateBody))
  check('fetchTownShopState: 토큰 없으면 네트워크 호출 전에 조기 반환', /if\s*\(\s*!_sessionToken\s*\)\s*return/.test(fetchStateBody))

  check('postTownPurchase: /api/grant-xp로 POST', /fetch\(\s*'\/api\/grant-xp'/.test(postPurchaseBody))
  check("postTownPurchase: action:'purchase_town_item' 포함", /action:\s*'purchase_town_item'/.test(postPurchaseBody))
  check('postTownPurchase: token 필드 포함', /token:\s*_sessionToken/.test(postPurchaseBody))
  check('postTownPurchase: studentId를 바디에 싣지 않음', !/studentId/.test(postPurchaseBody))
  check('postTownPurchase: price를 바디에 싣지 않음(itemId는 허용)', !/\bprice\b/i.test(postPurchaseBody))
  check('postTownPurchase: 토큰 없으면 네트워크 호출 전에 조기 반환', /if\s*\(\s*!_sessionToken\s*\)\s*return/.test(postPurchaseBody))

  const useTownShopSrc = readFileSync(path.join(ROOT, 'src/hooks/useTownShop.js'), 'utf8')
  const useTownShopStripped = stripComments(useTownShopSrc)
  check('useTownShop.js: in-flight ref 가드(useRef) 존재', /useRef\s*\(\s*false\s*\)/.test(useTownShopStripped) && /purchasingRef\.current/.test(useTownShopStripped))
  check('useTownShop.js: useStudent를 import하지 않음', !/useStudent/.test(useTownShopStripped))
  check('useTownShop.js: applyPurchaseResult/normalizeShopState를 townShop.js에서 import', /from\s+['"]\.\.\/utils\/townShop['"]/.test(useTownShopStripped))

  const useStudentSrc = stripComments(readFileSync(path.join(ROOT, 'src/hooks/useStudent.js'), 'utf8'))
  check("useStudent.js에 'townInventory' 문자열 없음(레코드 무오염)", !/townInventory/.test(useStudentSrc))
  check("useStudent.js에 'townShop' 문자열 없음(레코드 무오염)", !/townShop/.test(useStudentSrc))

  const paulTownSrc = stripComments(readFileSync(path.join(ROOT, 'src/components/PaulTown.jsx'), 'utf8'))
  check('PaulTown.jsx: shopEnabled && shop 조건으로만 상점 블록 렌더', /shopEnabled\s*&&\s*shop\s*&&/.test(paulTownSrc))
  check('PaulTown.jsx: shopItemState/purchasedDeco/formatDollars를 townShop.js에서 import', /from\s+['"]\.\.\/utils\/townShop['"]/.test(paulTownSrc) && /formatDollars/.test(paulTownSrc))
  check('PaulTown.jsx: relogin_required 문구 존재', /다시 로그인 후 이용해 주세요/.test(paulTownSrc))
  check('PaulTown.jsx: 기타 오류 문구 존재', /지금은 상점을 열 수 없어요/.test(paulTownSrc))
  check('PaulTown.jsx: 상점 블록에서 shopItemState 호출은 dollarsAvailable을 씀(별 아님)', /shopItemState\(shopItem,\s*\{\s*dollarsAvailable/.test(paulTownSrc))

  const appSrc = stripComments(readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8'))
  check("App.jsx: townShopEnabled = isFeatureEnabled('townShopV1')", /townShopEnabled\s*=\s*isFeatureEnabled\(\s*'townShopV1'\s*\)/.test(appSrc))
  check('App.jsx: useTownShop(studentId, ...) 호출', /useTownShop\(\s*studentId\s*,/.test(appSrc))
  check('App.jsx: <PaulTown ...> 에 shopEnabled prop 전달', /<PaulTown[\s\S]{0,400}?shopEnabled=\{townShopEnabled\}/.test(appSrc))
  check('App.jsx: <Dashboard ...> 에 wallet prop 전달(starsEarned + dollars.available)', /wallet=\{townShopEnabled[\s\S]{0,200}?starsEarned:\s*townShop\.state\.starsEarned[\s\S]{0,200}?dollarsAvailable:\s*townShop\.state\.dollars\.available/.test(appSrc))
  check('App.jsx: walletAvailable(레거시 prop명) 잔존 없음', !/walletAvailable/.test(appSrc))

  const dashSrc = stripComments(readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8'))
  check('Dashboard.jsx: wallet !== null 삼항 사용', /wallet\s*!==\s*null\s*\?/.test(dashSrc))
  check('Dashboard.jsx: wallet 기본값 null', /wallet\s*=\s*null/.test(dashSrc))
  check('Dashboard.jsx: walletAvailable(레거시 prop명) 잔존 없음', !/walletAvailable/.test(dashSrc))
  check('Dashboard.jsx: 💵 배지 렌더 조건(wallet !== null)', /wallet\s*!==\s*null[\s\S]{0,300}?💵/.test(dashSrc))
  check('Dashboard.jsx: formatDollars를 townShop.js에서 import', /formatDollars.*from\s+['"]\.\.\/utils\/townShop['"]/.test(dashSrc))
}

// ══════════════════════════════════════════════════════════════════════
// 7. SSR — 실제 PaulTown.jsx / Dashboard.jsx 렌더
// ══════════════════════════════════════════════════════════════════════
section('7. SSR — PaulTown.jsx 플래그 OFF/ON 렌더 동등성 + 상점 상태 4종 + Dashboard wallet 배지')
let ssrAttempted = false
try {
  const esbuild = (await import('esbuild')).default
  const VIRTUAL_FEATURES = {
    contents: `export const isFeatureEnabled = (name) => (globalThis.__SSR_FLAGS__ || {})[name] === true`,
    loader: 'js',
  }
  await esbuild.build({
    entryPoints: ['src/components/PaulTown.jsx'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: 'scripts/.tmp/townShopSsr',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    plugins: [{
      name: 'features-stub',
      setup(build) {
        build.onResolve({ filter: /config[\\/]features$/ }, () => ({ path: 'v:features', namespace: 'v' }))
        build.onLoad({ filter: /^v:features$/, namespace: 'v' }, () => VIRTUAL_FEATURES)
      },
    }],
  })
  ssrAttempted = true
  const React = (await import('react')).default
  const { renderToStaticMarkup } = await import('react-dom/server')
  const mod = await import(pathToFileURL(path.resolve('scripts/.tmp/townShopSsr/PaulTown.js')).href)
  const PaulTown = mod.default

  // paulTownGarden/paulTownBuildings 등 다른 플래그는 실제 기본값(true)과
  // 맞춰서 렌더 형태가 오늘의 실제 화면과 최대한 가깝도록 한다 — 이 검사의
  // 관심사(townShopV1)와 무관한 차이를 만들지 않기 위해.
  globalThis.__SSR_FLAGS__ = { paulTownGarden: true, paulTownBuildings: true, attachmentBookshelf: true }

  const baseProps = {
    stats: { clearedCount: 0, masteredCount: 0, studiedDayCount: 0, totalStarsEarned: 0 },
    hatInventory: [],
    equippedHatId: null,
    onEquip: () => {},
    onGo: () => {},
    onBack: () => {},
  }

  // 7a. 플래그 OFF(shopEnabled=false, shop=null) — 오늘과 바이트 단위 동일.
  const htmlOff = renderToStaticMarkup(React.createElement(PaulTown, { ...baseProps, shopEnabled: false, shop: null }))
  const htmlOmitted = renderToStaticMarkup(React.createElement(PaulTown, { ...baseProps }))
  check('SSR OFF: "책상 램프" 텍스트가 렌더되지 않음', !htmlOff.includes('책상 램프'))
  check('SSR OFF: "💵" 텍스트가 렌더되지 않음', !htmlOff.includes('💵'))
  check('SSR OFF: shop/shopEnabled prop을 아예 생략한 렌더와 바이트 단위로 동일', htmlOff === htmlOmitted)

  // 7b. 플래그 ON + dollars.available=100, owned=[] → '구매' 버튼.
  const shopBuyable = { state: { starsEarned: 223, dollars: { available: 100, earned: 100, spent: 0 }, owned: [], items: TOWN_SHOP_ITEMS }, error: null, purchasing: false, purchase: () => {}, refresh: () => {} }
  const htmlBuyable = renderToStaticMarkup(React.createElement(PaulTown, { ...baseProps, shopEnabled: true, shop: shopBuyable }))
  check('SSR ON(dollars=100, 미보유): "책상 램프 — $60" 렌더', htmlBuyable.includes('책상 램프') && htmlBuyable.includes('$60'))
  check('SSR ON(dollars=100, 미보유): "구매" 버튼 렌더', htmlBuyable.includes('구매') && !htmlBuyable.includes('구매 중'))
  check('SSR ON(dollars=100, 미보유): "💵 $100" 잔액 배지 렌더', htmlBuyable.includes('💵') && htmlBuyable.includes('$100'))
  check('SSR ON: 상점 줄에 ⭐가 전혀 없음(별-달러 분리)', !htmlBuyable.includes('⭐'))

  // 7c. owned=['shop-lamp'] → '보유 중' + 방 소품에 💡 타일.
  const shopOwned = { state: { starsEarned: 223, dollars: { available: 40, earned: 100, spent: 60 }, owned: ['shop-lamp'], items: TOWN_SHOP_ITEMS }, error: null, purchasing: false, purchase: () => {}, refresh: () => {} }
  const htmlOwned = renderToStaticMarkup(React.createElement(PaulTown, { ...baseProps, shopEnabled: true, shop: shopOwned }))
  check('SSR ON(owned): "보유 중" 렌더', htmlOwned.includes('보유 중'))
  check('SSR ON(owned): 방 소품 섹션에 💡 타일 렌더', htmlOwned.includes('💡'))

  // 7d. dollars.available=10(price 60) → "💵 $50 더 필요".
  const shopInsufficient = { state: { starsEarned: 223, dollars: { available: 10, earned: 10, spent: 0 }, owned: [], items: TOWN_SHOP_ITEMS }, error: null, purchasing: false, purchase: () => {}, refresh: () => {} }
  const htmlInsufficient = renderToStaticMarkup(React.createElement(PaulTown, { ...baseProps, shopEnabled: true, shop: shopInsufficient }))
  check('SSR ON(dollars=10): "💵 $50 더 필요" 렌더', htmlInsufficient.includes('💵 $50 더 필요'))

  // 7e. purchasing=true(미보유) → "구매 중…".
  const shopPurchasing = { state: { starsEarned: 223, dollars: { available: 100, earned: 100, spent: 0 }, owned: [], items: TOWN_SHOP_ITEMS }, error: null, purchasing: true, purchase: () => {}, refresh: () => {} }
  const htmlPurchasing = renderToStaticMarkup(React.createElement(PaulTown, { ...baseProps, shopEnabled: true, shop: shopPurchasing }))
  check('SSR ON(purchasing): "구매 중…" 렌더', htmlPurchasing.includes('구매 중'))

  // 7f. error='relogin_required' → 안내 문구, 버튼 없음.
  const shopRelogin = { state: null, error: 'relogin_required', purchasing: false, purchase: () => {}, refresh: () => {} }
  const htmlRelogin = renderToStaticMarkup(React.createElement(PaulTown, { ...baseProps, shopEnabled: true, shop: shopRelogin }))
  check('SSR ON(relogin_required): 안내 문구 렌더', htmlRelogin.includes('다시 로그인 후 이용해 주세요'))

  // 7g. 기타 오류.
  const shopOtherErr = { state: null, error: 'table_missing', purchasing: false, purchase: () => {}, refresh: () => {} }
  const htmlOtherErr = renderToStaticMarkup(React.createElement(PaulTown, { ...baseProps, shopEnabled: true, shop: shopOtherErr }))
  check('SSR ON(기타 오류): "지금은 상점을 열 수 없어요" 렌더', htmlOtherErr.includes('지금은 상점을 열 수 없어요'))

  // ── Dashboard.jsx SSR — wallet prop 분리 배지 검증 ──────────────────
  // Dashboard.jsx는 studentData/attachmentStats 등 무거운 props를 요구하는
  // 화면 전체 컴포넌트라, 여기서는 필요한 최소 필드만 채운 스텁으로 렌더한다
  // (다른 배지/섹션의 존재 유무는 이 스위트의 관심사가 아니다 — wallet 배지
  // 분리 자체만 좁게 검증).
  await esbuild.build({
    entryPoints: ['src/components/Dashboard.jsx'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: 'scripts/.tmp/townShopSsr',
    jsx: 'automatic',
    // Dashboard.jsx → HeroReaction → src/assets/paul/*.png(정적 이미지) —
    // esbuild 기본 로더는 .png를 모른다. SSR은 이미지 실제 표시와 무관
    // (renderToStaticMarkup은 <img src> 문자열만 만들면 됨)하므로 dataurl로
    // 충분 — 실제 프로덕션 빌드(vite)는 이 스텁과 무관하게 그대로 동작.
    loader: { '.png': 'dataurl' },
    // Dashboard.jsx → wordLibrary.js → supabaseClient.js가 모듈 평가
    // 시점에 `import.meta.env.VITE_SUPABASE_URL`을 읽는다(Vite 전용 문법).
    // plain Node ESM에는 `.env`가 없어(import.meta는 실존하지만 `.env`는
    // Vite가 주입하는 것) 그대로 두면 "Cannot read properties of
    // undefined" 로 즉시 크래시한다 — 이 SSR 검증은 네트워크/DB를 전혀
    // 안 쓰므로 빈 문자열로 안전하게 치환(scripts/testHatColorRendering.mjs
    // 계열의 다른 순수 SSR 스크립트와 달리 이 파일만 wordLibrary.js를
    // 통째로 물고 오기 때문에 처음 필요해진 정의).
    // createClient(url, anonKey)가 모듈 평가 시점에 URL 형식을 검증하므로
    // (실제 연결은 시도하지 않음 — SSR 중 어떤 fetch도 호출부에서 안 부름)
    // 빈 문자열이 아니라 형식만 유효한 더미 값을 준다.
    define: {
      'import.meta.env': JSON.stringify({ DEV: false, MODE: 'test', BASE_URL: '/', VITE_SUPABASE_URL: 'https://ssr-stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'ssr-stub-anon-key' }),
    },
    external: ['react', 'react/jsx-runtime'],
    plugins: [{
      name: 'features-stub',
      setup(build) {
        build.onResolve({ filter: /config[\\/]features$/ }, () => ({ path: 'v:features', namespace: 'v' }))
        build.onLoad({ filter: /^v:features$/, namespace: 'v' }, () => VIRTUAL_FEATURES)
      },
    }],
  })
  const dashMod = await import(pathToFileURL(path.resolve('scripts/.tmp/townShopSsr/Dashboard.js')).href)
  const Dashboard = dashMod.default
  globalThis.__SSR_FLAGS__ = {}

  const dashBaseProps = {
    studentId: 'stub-student-id',
    studentName: '테스트학생',
    studentData: {
      stars: 223, starsDisplay: 223, clearedStars: 0, stickerTypes: [], activeMissions: [],
      dailyProgress: { words: 0, examples: 0, quizzes: 0, pronunciations: 0 },
      liveMissionsCompleted: 0, streak: 0, cleared: [], ticketBalance: 0,
      redeemTicketReward: () => ({ ok: false }), equippedHatId: null,
      rewardLevel: { level: 1 }, rewardStarsToNext: null,
      hatInventory: [], round: { wordsViewed: [] }, history: {},
    },
    classWords: [],
    onGo: () => {}, onLogout: () => {}, onPlayGame: () => {}, onResumeWord: () => {},
    resumeIndex: 0, onUnitSwitch: null, onStartGuided: () => {},
    attachmentStats: null, wordTextById: new Map(),
    completedUnits: [], completedTextbooks: [],
    pendingCeremonyHat: null, onDismissCeremony: () => {},
    textbookOptions: [], currentTextbookId: null, onTextbookSwitch: null,
  }

  const htmlWalletNull = renderToStaticMarkup(React.createElement(Dashboard, { ...dashBaseProps, wallet: null }))
  const htmlWalletOmitted = renderToStaticMarkup(React.createElement(Dashboard, dashBaseProps))
  check('Dashboard SSR: wallet=null → wallet prop 생략 렌더와 바이트 단위 동일(레거시 동일)', htmlWalletNull === htmlWalletOmitted)
  check('Dashboard SSR: wallet=null → "💵" 없음', !htmlWalletNull.includes('💵'))
  check('Dashboard SSR: wallet=null → ⭐ 배지에 starsDisplay(223) 렌더', htmlWalletNull.includes('⭐') && htmlWalletNull.includes('223'))

  const htmlWallet = renderToStaticMarkup(React.createElement(Dashboard, { ...dashBaseProps, wallet: { starsEarned: 223, dollarsAvailable: 163 } }))
  check('Dashboard SSR: wallet 제공 → ⭐ + 223(누적 성취) 렌더', htmlWallet.includes('⭐') && htmlWallet.includes('223'))
  check('Dashboard SSR: wallet 제공 → 💵 + $163 렌더', htmlWallet.includes('💵') && htmlWallet.includes('$163'))
  check('Dashboard SSR: wallet 제공 시 "(실력 별 N 포함)" 줄 숨김', !htmlWallet.includes('실력 별'))
} catch (e) {
  console.log(`   [SSR] 실행 실패 — 정적 검사로 대체(솔직히 기록): ${e?.stack || e}`)
  if (!ssrAttempted) console.log('   [SSR] esbuild 빌드 단계에서 실패했거나 react-dom/server를 불러올 수 없음')
  check('SSR 블록 — 실패(정적 검사만으로 대체됨, 위 6번 절 참고)', false)
}

// ══════════════════════════════════════════════════════════════════════
console.log(`\n=== 결과: PASS ${totalPassed} / FAIL ${totalFailed} ===`)
if (totalFailed > 0) {
  console.log('실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
