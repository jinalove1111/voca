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

// ── 3. TownDiscoveryCard.jsx / TownWoodenSignHeader.jsx — 미와이어링 확인 ─
section('3. 신규 프로토타입 컴포넌트 — 아직 미와이어링(기존 화면 무변화 확인)')
const cardSrc = readSrc('src/components/town/TownDiscoveryCard.jsx')
const signSrc = readSrc('src/components/town/TownWoodenSignHeader.jsx')
check('TownDiscoveryCard.jsx 존재', cardSrc !== null)
check('TownWoodenSignHeader.jsx 존재', signSrc !== null)

const EXISTING_TOWN_FILES = [
  'src/components/town/TownScreen.jsx',
  'src/components/town/TownGrid.jsx',
  'src/components/town/TownHeader.jsx',
  'src/components/town/TownShopPanel.jsx',
  'src/components/town/TownInventory.jsx',
  'src/App.jsx',
]
for (const f of EXISTING_TOWN_FILES) {
  const src = readSrc(f) || ''
  check(`${f} — TownDiscoveryCard를 import하지 않음(미와이어링 확인)`, !/TownDiscoveryCard/.test(src))
  check(`${f} — TownWoodenSignHeader를 import하지 않음(미와이어링 확인)`, !/TownWoodenSignHeader/.test(src))
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
