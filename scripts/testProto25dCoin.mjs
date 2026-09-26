// scripts/testProto25dCoin.mjs — Paul Town 2.5D 캐릭터 프로토타입
// (paulTown2_5d, 기본 false) 경제 단계 A(2026-09-26, 코인 잔액 표시 v1)
// coinDisplay.js(신규, 순수 표시 헬퍼 2개) 단위 테스트.
//
// React/DOM/네트워크 0. coinDisplay.js가 townShop.js를 확장자 없는 상대
// import로 참조하므로(walkGrid.js/camera.js/shopInteraction.js와 동일
// 패턴), plain `node`로 직접 import하면 ERR_MODULE_NOT_FOUND로 죽는다 —
// esbuild로 scripts/.tmp/(gitignore 대상)에 번들해 그 산출물을 import한다.
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const BUNDLE_PATH = path.join(TMP_DIR, 'proto25dCoin.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/coinDisplay.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDLE_PATH,
})
const { coinBadgeText, coinBadgeAriaLabel } = await import(`${pathToFileURL(BUNDLE_PATH).href}?t=${Date.now()}`)

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

// ── 1. coinBadgeText — 표시 불가 입력 전부 null ─────────────────────────
section('1. coinBadgeText — wallet 부재/비정상 값은 전부 null(배지 자체를 렌더하지 않음)')
{
  check('wallet=null — null', coinBadgeText(null) === null)
  check('wallet=undefined — null', coinBadgeText(undefined) === null)
  check('wallet={} (dollarsAvailable 없음) — null', coinBadgeText({}) === null)
  check('dollarsAvailable=NaN — null', coinBadgeText({ dollarsAvailable: NaN }) === null)
  check('dollarsAvailable=undefined — null', coinBadgeText({ dollarsAvailable: undefined }) === null)
  check('dollarsAvailable=Infinity — null', coinBadgeText({ dollarsAvailable: Infinity }) === null)
  check('dollarsAvailable=-Infinity — null', coinBadgeText({ dollarsAvailable: -Infinity }) === null)
  check('dollarsAvailable=-1(음수) — null', coinBadgeText({ dollarsAvailable: -1 }) === null)
  check('dollarsAvailable="37"(문자열, 강제형변환 없음) — null', coinBadgeText({ dollarsAvailable: '37' }) === null)
  check('dollarsAvailable=null — null', coinBadgeText({ dollarsAvailable: null }) === null)
  check('wallet="37"(객체 아님) — null', coinBadgeText('37') === null)
  check('wallet=37(객체 아님) — null', coinBadgeText(37) === null)
}

// ── 2. coinBadgeText — 유효한 잔액은 formatDollars와 동일한 형식 ─────────
section('2. coinBadgeText — 유효한 잔액(0 포함)은 formatDollars(n)과 정확히 동일한 문자열')
{
  check('dollarsAvailable=0 — "0"류 텍스트(null 아님, 유효한 0원 잔액)', coinBadgeText({ dollarsAvailable: 0 }) === '$0', coinBadgeText({ dollarsAvailable: 0 }))
  check('dollarsAvailable=37 — "$37"', coinBadgeText({ dollarsAvailable: 37 }) === '$37', coinBadgeText({ dollarsAvailable: 37 }))
  check('dollarsAvailable=1234567(큰 수) — "$1234567"(정수, 자릿수 구분자 없이 formatDollars 그대로)', coinBadgeText({ dollarsAvailable: 1234567 }) === '$1234567', coinBadgeText({ dollarsAvailable: 1234567 }))
  check('dollarsAvailable=12.9(소수) — formatDollars 반올림 규칙 그대로 위임("$13")', coinBadgeText({ dollarsAvailable: 12.9 }) === '$13', coinBadgeText({ dollarsAvailable: 12.9 }))
  check('결정론 — 같은 입력을 두 번 호출해도 같은 결과', coinBadgeText({ dollarsAvailable: 37 }) === coinBadgeText({ dollarsAvailable: 37 }))
}

// ── 3. coinBadgeAriaLabel — text가 null이면 label도 null, 아니면 "코인 N개" ──
section('3. coinBadgeAriaLabel — coinBadgeText와 표시 여부 계약이 일치, 유효 시 "코인 N개"')
{
  check('wallet=null — null(배지가 없으니 label도 없음)', coinBadgeAriaLabel(null) === null)
  check('dollarsAvailable=NaN — null', coinBadgeAriaLabel({ dollarsAvailable: NaN }) === null)
  check('dollarsAvailable=-1 — null', coinBadgeAriaLabel({ dollarsAvailable: -1 }) === null)
  check('dollarsAvailable=0 — "코인 0개"', coinBadgeAriaLabel({ dollarsAvailable: 0 }) === '코인 0개', coinBadgeAriaLabel({ dollarsAvailable: 0 }))
  check('dollarsAvailable=37 — "코인 37개"', coinBadgeAriaLabel({ dollarsAvailable: 37 }) === '코인 37개', coinBadgeAriaLabel({ dollarsAvailable: 37 }))
  check('dollarsAvailable=1234567 — "코인 1234567개"', coinBadgeAriaLabel({ dollarsAvailable: 1234567 }) === '코인 1234567개', coinBadgeAriaLabel({ dollarsAvailable: 1234567 }))
}

// ── 4. import 그래프 — 네트워크/쓰기 경로 부재 확인 ──────────────────────
section('4. import 그래프 — coinDisplay.js가 network/write를 수행하는 어떤 모듈도 import하지 않음')
{
  const src = readFileSync(path.join(ROOT, 'src/utils/town/proto2_5d/coinDisplay.js'), 'utf8')
  const importLines = src.split('\n').filter((line) => /^import\b/.test(line.trim()))
  check('import 문이 정확히 1개(townShop.js formatDollars만)', importLines.length === 1, JSON.stringify(importLines))
  check('그 import가 ../../townShop을 가리킴(shopInteraction/구매/보상 모듈 아님)', importLines[0]?.includes("'../../townShop'"), JSON.stringify(importLines))
  const forbidden = ['fetch(', 'supabase', 'claimWelcome', 'purchase', 'api/', 'XMLHttpRequest', 'axios']
  const hits = forbidden.filter((needle) => src.includes(needle))
  check('네트워크/구매/보상/API 관련 토큰이 소스에 전혀 없음', hits.length === 0, JSON.stringify(hits))

  const shopSrc = readFileSync(path.join(ROOT, 'src/utils/townShop.js'), 'utf8')
  const shopImportLines = shopSrc.split('\n').filter((line) => /^import\b/.test(line.trim()))
  check('townShop.js(재사용 대상)도 자신은 어떤 것도 import하지 않는 순수 모듈(전이 의존성 0)', shopImportLines.length === 0, JSON.stringify(shopImportLines))
}

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
