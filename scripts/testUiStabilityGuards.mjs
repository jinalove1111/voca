// scripts/testUiStabilityGuards.mjs — overnight T7b(2026-09) UI 안정성 가드
// 3종 회귀 테스트. 전부 정적 소스 검사 + 순수 함수 단위 테스트만 — 실제
// React 렌더/네트워크는 하나도 안 함(House/PureUtils 스크립트와 동일 패턴).
//
// 1) App.jsx의 <GuidedSession> 이 currentUnitId 를 key로 못박고 있는지
//    (유닛 전환 시 이전 유닛 내부 state가 새 유닛으로 새 상태 그대로
//    넘어가는 걸 막는 안전망 — 지금은 유닛 전환이 항상 대시보드 경유
//    리마운트라 실질 영향은 없지만, 구조적 회귀를 막는다).
// 2) 포그라운드 복귀 재조회 쿨다운 — 순수 판정 함수
//    src/utils/foregroundRefreshGate.js 의 shouldRefreshOnForeground 동작 +
//    App.jsx의 visibility/focus 핸들러가 실제로 그 함수를 쓰는지.
// 3) 관리자 학생 검색 결과 렌더 상한 — 순수 함수 src/utils/listCap.js 의
//    capList 동작 + StudentDirectory.jsx가 필터 결과 렌더 분기에서 그
//    함수를 쓰는지(선택/필터 로직 자체는 건드리지 않았다는 것도 함께 확인
//    — filteredGroups/matchesStudent 문자열이 여전히 존재해야 함).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldRefreshOnForeground } from '../src/utils/foregroundRefreshGate.js'
import { capList } from '../src/utils/listCap.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let failures = 0
let checks = 0
function check(label, cond) {
  checks++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const appJsx = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8')
const studentDirectoryJsx = fs.readFileSync(
  path.join(repoRoot, 'src/components/admin/StudentDirectory.jsx'), 'utf8'
)

// ── 1. GuidedSession unit-id key ────────────────────────────────────────
console.log('\n1. App.jsx — <GuidedSession> 이 currentUnitId를 key로 사용')
{
  const guidedSessionBlockMatch = appJsx.match(/<GuidedSession\s+([\s\S]*?)\n\s*\/>/)
  check('GuidedSession JSX 블록을 찾음', !!guidedSessionBlockMatch)
  const block = guidedSessionBlockMatch ? guidedSessionBlockMatch[1] : ''
  check(
    'key={currentUnitId ?? ...} 형태로 유닛 id를 key로 못박음',
    /key=\{\s*currentUnitId\s*(\?\?|\|\|)/.test(block)
  )
}

// ── 2. 포그라운드 복귀 쿨다운 ────────────────────────────────────────────
console.log('\n2. foregroundRefreshGate.js — shouldRefreshOnForeground 순수 로직')
{
  check('최초 복귀(lastMs=0)는 쿨다운 무관 항상 true', shouldRefreshOnForeground(0, 1_000_000) === true)
  check('최초 복귀(lastMs=null)도 항상 true', shouldRefreshOnForeground(null, 5) === true)
  check(
    '쿨다운(10초) 이내 재복귀는 false(재조회 스킵)',
    shouldRefreshOnForeground(100_000, 105_000) === false // 5초 경과 < 10초
  )
  check(
    '쿨다운 경계값(정확히 10초)은 true(허용, 배타적 미만 아님)',
    shouldRefreshOnForeground(100_000, 110_000) === true
  )
  check(
    '쿨다운(10초) 초과 후 재복귀는 true(재조회 허용)',
    shouldRefreshOnForeground(100_000, 111_000) === true
  )
  check(
    '커스텀 cooldownMs 인자도 존중',
    shouldRefreshOnForeground(100_000, 102_000, 1_000) === true &&
    shouldRefreshOnForeground(100_000, 100_500, 1_000) === false
  )
}
console.log('\n2b. App.jsx — visibility/focus 핸들러가 shouldRefreshOnForeground를 실제로 사용')
{
  check(
    'App.jsx가 foregroundRefreshGate에서 shouldRefreshOnForeground를 import',
    /import\s*\{\s*shouldRefreshOnForeground\s*\}\s*from\s*['"].*foregroundRefreshGate(\.js)?['"]/.test(appJsx)
  )
  const visibilityEffectMatch = appJsx.match(
    /useEffect\(\(\) => \{[\s\S]*?let inFlight = false[\s\S]*?\}, \[\]\)/
  )
  check('visibility/focus useEffect 블록을 찾음', !!visibilityEffectMatch)
  const effectBody = visibilityEffectMatch ? visibilityEffectMatch[0] : ''
  check('그 블록 안에서 shouldRefreshOnForeground를 호출', /shouldRefreshOnForeground\(/.test(effectBody))
  check(
    '기존 inFlight 근접중복 가드 문구가 그대로 남아있음(리팩터 아님, 추가만)',
    /if \(document\.visibilityState === 'visible' && !inFlight\)/.test(effectBody)
  )
}

// ── 3. 검색 결과 렌더 상한 ───────────────────────────────────────────────
console.log('\n3. listCap.js — capList 순수 로직')
{
  const r1 = capList(Array.from({ length: 500 }, (_, i) => i), 200)
  check('500개 중 200개만 남기고 나머지는 remaining', r1.items.length === 200 && r1.remaining === 300)
  check('앞에서부터 순서 보존', r1.items[0] === 0 && r1.items[199] === 199)
  const r2 = capList([1, 2, 3], 200)
  check('한도 이하면 전부 반환, remaining 0', r2.items.length === 3 && r2.remaining === 0)
  const r3 = capList([], 200)
  check('빈 배열도 안전(items:[], remaining:0)', r3.items.length === 0 && r3.remaining === 0)
  const r4 = capList(null, 200)
  check('list가 배열이 아니면(null 등) 빈 배열로 방어', r4.items.length === 0 && r4.remaining === 0)
}
console.log('\n3b. StudentDirectory.jsx — 검색/필터 렌더 분기가 capList를 사용, 필터 로직은 미변경')
{
  check(
    'StudentDirectory.jsx가 listCap에서 capList를 import',
    /import\s*\{\s*capList\s*\}\s*from\s*['"].*listCap(\.js)?['"]/.test(studentDirectoryJsx)
  )
  check('capList( 호출이 실제로 존재', /capList\(/.test(studentDirectoryJsx))
  check(
    '기존 filteredGroups/matchesStudent 필터링 로직 문구가 그대로 남아있음(리팩터 아님)',
    /const filteredGroups = isFiltering/.test(studentDirectoryJsx) &&
    /const matchesStudent = \(s\) => \{/.test(studentDirectoryJsx)
  )
  check(
    '"더 보기" 상한 해제 버튼 문구가 존재',
    /더 보기/.test(studentDirectoryJsx)
  )
}

console.log(`\n${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`\nFAIL — ${failures}건 실패`)
  process.exitCode = 1
} else {
  console.log('\nPASS — 전체 통과')
}
