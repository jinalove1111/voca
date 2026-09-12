// scripts/testTownPrototypeStatic.mjs — Paul Town British World, 안전
// 프로토타입 회귀(2026-09-12). src/utils/town/townAmbient.js(순수 함수) +
// src/components/town/{TownDiscoveryCard,TownWoodenSignHeader}.jsx(정적
// 소스 검사)를 검증한다. 네트워크 0, DB 0, React 렌더 0(JSX 실행 없이
// 소스 정규식만) — 이 세션이 만든 파일이 (1) 어디에도 아직 import되지
// 않았음(=기존 화면 무변화, COMPONENT_ARCHITECTURE.md §6) (2) 실제
// 와이어링될 때 지켜야 할 계약(44px 터치 타겟, 새 <img> 0, paulTownV1
// 게이팅, 모달 아닌 인라인)을 이미 갖추고 있음을 확인한다.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { ambientTone, ambientClassFor, depthClassFor } from '../src/utils/town/townAmbient.js'

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

// ── 1. townAmbient.js — 순수 함수 결정론 ─────────────────────────────────
section('1. townAmbient.js — 결정론/범위')
check('ambientTone(0,0) === 0', ambientTone(0, 0) === 0)
check('ambientTone(1,0) === 1', ambientTone(1, 0) === 1)
check('ambientTone(2,0) === 2', ambientTone(2, 0) === 2)
check('ambientTone(3,0) === 0(순환)', ambientTone(3, 0) === 0)
check('ambientTone은 항상 0~2 범위(8x6 그리드 전수 확인)', (() => {
  for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
    const t = ambientTone(x, y)
    if (t < 0 || t > 2 || !Number.isInteger(t)) return false
  }
  return true
})())
check('ambientTone(NaN, NaN) 크래시 없이 0~2 범위 반환', (() => {
  const t = ambientTone(NaN, NaN)
  return Number.isInteger(t) && t >= 0 && t <= 2
})())
check('같은 좌표는 항상 같은 결과(순수 함수, 100회 반복)', (() => {
  const first = ambientTone(4, 3)
  for (let i = 0; i < 100; i++) if (ambientTone(4, 3) !== first) return false
  return true
})())
check('ambientClassFor(0,0) === ""(tone 0은 추가 클래스 없음)', ambientClassFor(0, 0) === '')
check('ambientClassFor가 반환하는 클래스는 기존 팔레트 색만 사용(#fdebd0/#cfe3c0)', (() => {
  for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
    const c = ambientClassFor(x, y)
    if (c !== '' && !c.includes('#fdebd0') && !c.includes('#cfe3c0')) return false
  }
  return true
})())
check('depthClassFor(0,6) — 상단 opacity-90', depthClassFor(0, 6) === 'opacity-90')
check('depthClassFor(5,6) — 하단 opacity-100', depthClassFor(5, 6) === 'opacity-100')
check('depthClassFor 방어적 처리(rows=0/음수 y도 크래시 없음)', (() => {
  const a = depthClassFor(-1, 6)
  const b = depthClassFor(3, 0)
  return typeof a === 'string' && typeof b === 'string'
})())

// ── 2. townAmbient.js — 순수성(소스 정적 검사) ───────────────────────────
section('2. townAmbient.js — import 0 / Math.random 미사용')
const ambientSrc = readSrc('src/utils/town/townAmbient.js')
check('townAmbient.js 존재', ambientSrc !== null)
const ambientCode = ambientSrc ? ambientSrc.replace(/\/\/.*$/gm, '') : ''
check('townAmbient.js — import 0', !!ambientSrc && !/^import\s/m.test(ambientCode))
check('townAmbient.js — Math.random 미사용(결정론)', !!ambientSrc && !/Math\.random\(\)/.test(ambientCode))

// ── 3. Phase 2(2026-09-12) — 실배선 확인: TownScreen 트리 내부에서만 ──────
section('3. 실배선 — TownScreen 트리 내부 import만, Dashboard/App/PaulTown 미import')
const cardSrc = readSrc('src/components/town/TownDiscoveryCard.jsx')
const signSrc = readSrc('src/components/town/TownWoodenSignHeader.jsx')
const ambientSrc2 = readSrc('src/utils/town/townAmbient.js')
check('TownDiscoveryCard.jsx 존재', cardSrc !== null)
check('TownWoodenSignHeader.jsx 존재', signSrc !== null)

const screenSrc2 = readSrc('src/components/town/TownScreen.jsx') || ''
const gridSrc2 = readSrc('src/components/town/TownGrid.jsx') || ''
const headerSrc2 = readSrc('src/components/town/TownHeader.jsx') || ''
const shopSrc2 = readSrc('src/components/town/TownShopPanel.jsx') || ''
const invSrc2 = readSrc('src/components/town/TownInventory.jsx') || ''
const appSrc2 = readSrc('src/App.jsx') || ''
const dashboardSrc2 = readSrc('src/components/Dashboard.jsx') || ''
const paulTownSrc2 = readSrc('src/components/PaulTown.jsx') || ''

// 실제로 와이어링된 지점(양성 확인) — TownScreen이 TownWoodenSignHeader를,
// TownGrid가 ambient/discovery를 실제로 import + 사용해야 한다.
check('TownScreen.jsx — TownWoodenSignHeader import', /import\s+TownWoodenSignHeader\s+from\s+['"]\.\/TownWoodenSignHeader['"]/.test(screenSrc2))
check('TownScreen.jsx — <TownWoodenSignHeader 렌더 최소 2곳(헤더+가이드 카드)', (screenSrc2.match(/<TownWoodenSignHeader/g) || []).length >= 2)
check('TownScreen.jsx — TownHeader에 넘기는 props(level/starsEarned/dollarsAvailable) 불변', /<TownHeader level=\{level\} starsEarned=\{starsEarned\} dollarsAvailable=\{balance\} \/>/.test(screenSrc2))
check('TownScreen.jsx — TownGrid에 studentId 전달', /<TownGrid[\s\S]*?studentId=\{studentId\}[\s\S]*?\/>/.test(screenSrc2))
check('TownGrid.jsx — ambientClassFor/depthClassFor import(townAmbient.js)', /import\s*\{\s*ambientClassFor,\s*depthClassFor\s*\}\s*from\s+['"]\.\.\/\.\.\/utils\/town\/townAmbient['"]/.test(gridSrc2))
check('TownGrid.jsx — ambientClassFor(x, y) 실제 호출', /ambientClassFor\(x,\s*y\)/.test(gridSrc2))
check('TownGrid.jsx — depthClassFor(y, TOWN_GRID.rows) 실제 호출', /depthClassFor\(y,\s*TOWN_GRID\.rows\)/.test(gridSrc2))
check('TownGrid.jsx — placeKeyForItemId import(townDiscovery.js)', /import\s*\{\s*placeKeyForItemId\s*\}\s*from\s+['"]\.\.\/\.\.\/utils\/town\/townDiscovery['"]/.test(gridSrc2))
check('TownGrid.jsx — TownDiscoveryCard import + 렌더', /import\s+TownDiscoveryCard\s+from\s+['"]\.\/TownDiscoveryCard['"]/.test(gridSrc2) && /<TownDiscoveryCard\b/.test(gridSrc2))
check('TownGrid.jsx — studentId prop 시그니처에 존재', /function TownGrid\(\{[^}]*studentId[^}]*\}\)/.test(gridSrc2))

// 게이팅 확인 — TownScreen은 App.jsx에서 paulTownV1Enabled로만 마운트되므로
// (App.jsx 5절, testTownUiStatic.mjs가 이미 고정) 그 트리 내부 컴포넌트는
// 전부 자동으로 같은 게이트 아래에 있다. 여기서는 "그 트리 밖(Dashboard/
// PaulTown/App 최상위)으로 새지 않았는지"만 추가로 검사한다.
const NOT_ALLOWED_FILES = {
  'src/App.jsx': appSrc2,
  'src/components/Dashboard.jsx': dashboardSrc2,
  'src/components/PaulTown.jsx': paulTownSrc2,
}
for (const [f, src] of Object.entries(NOT_ALLOWED_FILES)) {
  check(`${f} — TownDiscoveryCard를 import하지 않음(TownScreen 트리 밖 유출 금지)`, !/TownDiscoveryCard/.test(src))
  check(`${f} — TownWoodenSignHeader를 import하지 않음(TownScreen 트리 밖 유출 금지)`, !/TownWoodenSignHeader/.test(src))
  check(`${f} — townAmbient를 import하지 않음(TownScreen 트리 밖 유출 금지)`, !/townAmbient/.test(src))
}

// TownHeader.jsx/TownShopPanel.jsx/TownInventory.jsx는 이번 배선 범위 밖
// (헤더 데이터 컴포넌트 자체는 무수정, 래핑만 TownScreen이 담당) — 이
// 파일들이 새 프로토타입 모듈을 직접 import하지 않았는지도 재확인한다.
const OUT_OF_SCOPE_FILES = {
  'src/components/town/TownHeader.jsx': headerSrc2,
  'src/components/town/TownShopPanel.jsx': shopSrc2,
  'src/components/town/TownInventory.jsx': invSrc2,
}
for (const [f, src] of Object.entries(OUT_OF_SCOPE_FILES)) {
  check(`${f} — TownDiscoveryCard/TownWoodenSignHeader/townAmbient 미import(무수정 확인)`, !/TownDiscoveryCard|TownWoodenSignHeader|townAmbient/.test(src))
}

// ── 4. 계약 — paulTownV1 게이팅 / 새 <img> 0 / 모달 아님 / 44px+ ─────────
section('4. 프로토타입 계약 — 게이팅/이미지/모달/터치타겟')
check('TownDiscoveryCard.jsx — isFeatureEnabled(\'paulTownV1\') 게이팅', !!cardSrc && /isFeatureEnabled\(\s*['"]paulTownV1['"]\s*\)/.test(cardSrc))
check('TownWoodenSignHeader.jsx — isFeatureEnabled(\'paulTownV1\') 게이팅', !!signSrc && /isFeatureEnabled\(\s*['"]paulTownV1['"]\s*\)/.test(signSrc))
check('TownDiscoveryCard.jsx — 새 <img> 태그 없음', !!cardSrc && !/<img/.test(cardSrc))
check('TownWoodenSignHeader.jsx — 새 <img> 태그 없음', !!signSrc && !/<img/.test(signSrc))
check('TownDiscoveryCard.jsx — fixed/z-50 모달 오버레이 없음(인라인 카드)', !!cardSrc && !/fixed inset-0/.test(cardSrc))
const cardCodeOnly = cardSrc ? cardSrc.replace(/\/\/.*$/gm, '') : ''
check('TownDiscoveryCard.jsx — ⭐/💵 아이콘 실제 렌더 없음(주석 제외, flavor only)', !!cardSrc && !/⭐|💵/.test(cardCodeOnly))
check('TownDiscoveryCard.jsx — 닫기 버튼 44px+(min-h-[44px])', !!cardSrc && /min-h-\[44px\][^]*?닫기/.test(cardSrc))
check('TownDiscoveryCard.jsx — Hogwarts/Harry/Potter 계열 문자열 없음', !!cardSrc && !/Hogwarts|Harry|Potter/i.test(cardSrc))
check('TownWoodenSignHeader.jsx — Hogwarts/Harry/Potter 계열 문자열 없음', !!signSrc && !/Hogwarts|Harry|Potter/i.test(signSrc))
check('TownDiscoveryCard.jsx — pickDiscoveryForItem import(townDiscovery.js)', !!cardSrc && /import\s*\{\s*pickDiscoveryForItem\s*\}\s*from\s+['"]\.\.\/\.\.\/utils\/town\/townDiscovery['"]/.test(cardSrc))
check('TownDiscoveryCard.jsx — supabase 직접 import 없음', !!cardSrc && !/from\s+['"][^'"]*supabase[^'"]*['"]/i.test(cardSrc))
check('TownWoodenSignHeader.jsx — supabase 직접 import 없음', !!signSrc && !/from\s+['"][^'"]*supabase[^'"]*['"]/i.test(signSrc))

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
