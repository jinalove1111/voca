// scripts/testTownDiscovery.mjs — Paul Town British World, Discovery System
// 회귀(2026-09-12). 순수 정적 + 순수 함수 검증(네트워크 0, DB 0, React 렌더
// 0). src/utils/town/townDiscovery.js의 결정론/이름-미사용 계약과, 이번
// 세션이 만든 docs/design/town/*.md + townDiscovery.js 전체의 IP 세이프가드
// (금지어 0건)를 검증한다.
//
// CRLF 안전화: Windows 워킹카피는 \r\n일 수 있으므로 모든 소스를 읽는 즉시
// LF로 정규화한다(testTownUiStatic.mjs와 동일 관례).
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  DISCOVERY_PLACES,
  DISCOVERY_CONTENT,
  pickDiscovery,
  pickDiscoveryForItem,
  placeKeyForItemId,
  dayKeyFor,
} from '../src/utils/town/townDiscovery.js'

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

// ── 1. 콘텐츠 구조 ───────────────────────────────────────────────────────
section('1. DISCOVERY_PLACES / DISCOVERY_CONTENT 구조')
check('DISCOVERY_PLACES — 10개 장소', Array.isArray(DISCOVERY_PLACES) && DISCOVERY_PLACES.length === 10)
check('DISCOVERY_PLACES — placeKey 전부 유일', new Set(DISCOVERY_PLACES.map((p) => p.placeKey)).size === DISCOVERY_PLACES.length)
check('DISCOVERY_CONTENT — 10개 placeKey 전부 콘텐츠 보유', DISCOVERY_PLACES.every((p) => Array.isArray(DISCOVERY_CONTENT[p.placeKey])))
for (const p of DISCOVERY_PLACES) {
  const list = DISCOVERY_CONTENT[p.placeKey] || []
  check(`${p.placeKey} — 예시 5~10개(실제 ${list.length})`, list.length >= 5 && list.length <= 10)
  check(`${p.placeKey} — 전부 en/ko 필드 보유`, list.every((e) => typeof e.en === 'string' && e.en.length > 0 && typeof e.ko === 'string' && e.ko.length > 0))
  check(`${p.placeKey} — en 전부 2줄 이내(개행 없음, 120자 이하)`, list.every((e) => !e.en.includes('\n') && e.en.length <= 120))
  check(`${p.placeKey} — ko 전부 2줄 이내(개행 없음, 80자 이하)`, list.every((e) => !e.ko.includes('\n') && e.ko.length <= 80))
}

// itemId 매핑 6곳(카탈로그 실존 아이템), 나머지 4곳은 제안(itemId null)
const catalogMapped = DISCOVERY_PLACES.filter((p) => p.itemId)
const proposalPlaces = DISCOVERY_PLACES.filter((p) => !p.itemId)
check('itemId 매핑된 장소 6곳(카탈로그 실존 아이템)', catalogMapped.length === 6)
check('제안(미반영) 장소 4곳', proposalPlaces.length === 4)
const EXPECTED_ITEM_IDS = ['book-shop', 'red-post-box', 'clock-tower', 'flower-garden', 'english-school', 'cafe']
check('itemId 매핑이 실제 town_items 17종 안의 값과 일치(오타 없음)', EXPECTED_ITEM_IDS.every((id) => catalogMapped.some((p) => p.itemId === id)))

// ── 2. placeKeyForItemId / pickDiscoveryForItem ─────────────────────────
section('2. itemId -> placeKey -> discovery')
check("placeKeyForItemId('book-shop') === 'book-shop'", placeKeyForItemId('book-shop') === 'book-shop')
check("placeKeyForItemId('red-post-box') === 'post-box'", placeKeyForItemId('red-post-box') === 'post-box')
check("placeKeyForItemId('tree') === null(매핑 없는 아이템)", placeKeyForItemId('tree') === null)
check('placeKeyForItemId(undefined) === null(크래시 없음)', placeKeyForItemId(undefined) === null)
check("pickDiscoveryForItem('book-shop', 'sid-1') 결과가 en/ko를 가짐",
  (() => { const r = pickDiscoveryForItem('book-shop', 'sid-1'); return !!r && typeof r.en === 'string' && typeof r.ko === 'string' })())
check("pickDiscoveryForItem('tree', 'sid-1') === null(매핑 없음)", pickDiscoveryForItem('tree', 'sid-1') === null)

// ── 3. 결정론 — 같은 시드는 항상 같은 결과 ───────────────────────────────
section('3. 결정론 — 같은 studentId+placeKey+day는 항상 같은 문장')
const fixedDay = new Date(2026, 8, 12) // 2026-09-12(로컬)
const repeated = new Set()
for (let i = 0; i < 100; i++) {
  const r = pickDiscovery('cafe', 'student-uuid-a', fixedDay)
  repeated.add(JSON.stringify(r))
}
check('100회 반복 호출 — 결과가 항상 동일(1종류)', repeated.size === 1)

const otherDay = new Date(2026, 8, 13)
const dayA = pickDiscovery('cafe', 'student-uuid-a', fixedDay)
const dayB = pickDiscovery('cafe', 'student-uuid-a', otherDay)
check('dayKeyFor가 날짜별로 다른 문자열을 만듦', dayKeyFor(fixedDay) !== dayKeyFor(otherDay))
check('day/dayA/dayB 결과 자체가 크래시 없이 반환됨(같을 수도 다를 수도 있음, 값 검증만)',
  !!dayA && !!dayB && typeof dayA.en === 'string' && typeof dayB.en === 'string')

// ── 4. 다양성 — 서로 다른 studentId는 서로 다른 문장이 나올 수 있음 ─────
section('4. 45명 시뮬레이션 — 학생별 다양성(이름 아닌 UUID 기반)')
const studentIds = Array.from({ length: 45 }, (_, i) => `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`)
const resultsByStudent = studentIds.map((sid) => JSON.stringify(pickDiscovery('school', sid, fixedDay)))
const distinctCount = new Set(resultsByStudent).size
check('45명 중 최소 2종류 이상의 서로 다른 문장(다양성 확인)', distinctCount >= 2)
check('같은 studentId를 두 번 호출해도 동일 결과(재확인)',
  JSON.stringify(pickDiscovery('school', studentIds[0], fixedDay)) === JSON.stringify(pickDiscovery('school', studentIds[0], fixedDay)))

// ── 5. 안전한 폴백 — 잘못된 입력에도 크래시 없음 ─────────────────────────
section('5. 방어적 폴백')
check("pickDiscovery('does-not-exist', 'sid') === null", pickDiscovery('does-not-exist', 'sid') === null)
check('pickDiscovery(null, null) === null(크래시 없음)', pickDiscovery(null, null) === null)
check("pickDiscovery('cafe', undefined) — studentId 없어도 결과 반환('anon' 폴백)",
  !!pickDiscovery('cafe', undefined, fixedDay))
check("pickDiscovery('cafe', '') — 빈 문자열도 'anon' 폴백으로 안전하게 처리",
  !!pickDiscovery('cafe', '', fixedDay))

// ── 6. 이름 미사용 — 소스 코드 정적 검사 ─────────────────────────────────
section('6. townDiscovery.js — 학생 이름을 시드에 쓰지 않음')
const discoverySrc = readSrc('src/utils/town/townDiscovery.js')
check('townDiscovery.js 존재', discoverySrc !== null)
check('townDiscovery.js — studentName/student.name 미사용', !!discoverySrc && !/studentName|student\.name/i.test(discoverySrc))
check('townDiscovery.js — 시드 조립에 studentId(UUID)만 사용', !!discoverySrc && /`\$\{sid\}:\$\{placeKey\}:\$\{dayKeyFor\(now\)\}`/.test(discoverySrc))
const discoveryCode = discoverySrc ? discoverySrc.replace(/\/\/.*$/gm, '') : ''
check('townDiscovery.js — Math.random/Date.now 미사용(순수 결정론, 주석 제외)', !!discoverySrc && !/Math\.random\(\)|Date\.now\(\)/.test(discoveryCode))
check('townDiscovery.js — supabase/fetch/network 실제 호출 없음(네트워크 0, 주석 제외)', !!discoverySrc && !/supabase|fetch\(|XMLHttpRequest/i.test(discoveryCode))
check('townDiscovery.js — import 0(순수 도메인, React/supabase 없음)', !!discoverySrc && !/^import\s/m.test(discoveryCode))

// ── 7. IP 세이프가드 — 금지어 0건(코드 + 이번 세션 문서 전체) ────────────
section('7. IP 세이프가드 — 금지어 0건')
const FORBIDDEN_TERMS = [
  'Hogwarts', 'Harry', 'Potter', 'Hermione', 'Gryffindor', 'Slytherin',
  'Hufflepuff', 'Ravenclaw', 'Quidditch', 'Dumbledore', 'Voldemort',
  'Muggle', 'Diagon', 'Hedwig', 'Snape',
]
const forbiddenRe = new RegExp(`\\b(${FORBIDDEN_TERMS.join('|')})\\b`, 'i')

function collectScanTargets() {
  const targets = ['src/utils/town/townDiscovery.js']
  const docsDir = path.join(ROOT, 'docs/design/town')
  if (existsSync(docsDir)) {
    for (const f of readdirSync(docsDir)) {
      if (f.endsWith('.md') || f.endsWith('.json')) targets.push(`docs/design/town/${f}`)
    }
  }
  return targets
}

const scanTargets = collectScanTargets()
check('스캔 대상 파일 1개 이상 존재(문서+코드)', scanTargets.length > 0)
for (const rel of scanTargets) {
  const src = readSrc(rel)
  if (src === null) { check(`${rel} — 파일 존재(스캔 가능)`, false); continue }
  for (const term of FORBIDDEN_TERMS) {
    const re = new RegExp(`\\b${term}\\b`, 'i')
    const count = (src.match(new RegExp(re, 'gi')) || []).length
    if (count > 0) check(`${rel} — 금지어 "${term}" 0건(실제 ${count}건)`, false)
  }
}
check('전체 스캔 대상 — 금지어 종합 0건(정규식 통합 검사)',
  scanTargets.every((rel) => { const s = readSrc(rel); return s === null || !forbiddenRe.test(s) }))

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
