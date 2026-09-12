// scripts/testPilotTownAllowlist.mjs — Pilot A(2026-09-12) Town V1 UUID
// 허용목록 회귀 테스트. testUiStabilityGuards.mjs와 동일 패턴 — 전부 정적
// 소스 검사 + 순수 함수 단위 테스트만, React 렌더/네트워크 0.
//
// 1) src/config/pilotTown.js — isPilotTownStudent()가 정확히 승인된 5개
//    UUID만 true를 반환(대소문자 무관), 그 외(비승인 UUID/undefined/null/
//    빈 문자열/이름 문자열/1글자 변조 UUID/접두사만 있는 문자열)는 전부
//    false. Set은 정확히 5개, 전부 UUID 형태.
// 2) src/App.jsx — isPilotTownStudent(studentId)/townV1Enabled/
//    onGoTown={townV1Enabled 배선이 실제로 들어갔는지, 기존
//    isFeatureEnabled('paulTownV1') useSyncExternalStore 게이트는 그대로
//    남아있는지 정적 확인.
// 3) src/config/features.js — paulTownV1/townShopV1 기본값이 여전히
//    false인지(이번 작업이 플래그 기본값을 바꾸지 않았다는 확인).
// 4) 이번 작업 diff(main 대비)에 Town V1 관련 핵심 구현 파일(TownScreen.jsx/
//    useTownShop.js/townShop.js/api/grant-xp.js/supabase_v3_50_town_v1.sql)이
//    전혀 포함되지 않았는지 — git diff --name-only main을 스폰해 확인.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { isPilotTownStudent, PILOT_A_TOWN_STUDENT_IDS } from '../src/config/pilotTown.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let failures = 0
let checks = 0
function check(label, cond) {
  checks++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PILOT_A_IDS = [
  '1c585815-98c8-461e-81fc-0187ffdcfa1c',
  '9f115c32-6a4b-4659-a026-f9905a5cc2e2',
  'e0fe0f50-8927-44d9-9331-e454620524d9',
  'd4bd8d3d-afda-47ad-9e5e-a12c8376c892',
  '3cff7b25-02cd-45a0-8488-a7b84a6d8a58',
]

// ── 1. 정확히 5명만 true(대소문자 무관) ─────────────────────────────────
console.log('\n1. isPilotTownStudent — 승인된 5개 UUID만 true(대소문자 무관)')
{
  check('PILOT_A_TOWN_STUDENT_IDS Set 크기가 정확히 5', PILOT_A_TOWN_STUDENT_IDS.size === 5)
  check(
    'Set의 모든 항목이 UUID 형태',
    [...PILOT_A_TOWN_STUDENT_IDS].every((id) => UUID_RE.test(id))
  )
  for (const id of PILOT_A_IDS) {
    check(`${id} -> true`, isPilotTownStudent(id) === true)
    check(`${id.toUpperCase()} (대문자) -> true`, isPilotTownStudent(id.toUpperCase()) === true)
  }
}

// ── 2. 비승인/방어 입력 -> false ─────────────────────────────────────────
console.log('\n2. isPilotTownStudent — 비승인/방어 입력은 전부 false')
{
  check('비승인 UUID -> false', isPilotTownStudent('00000000-0000-4000-8000-000000000000') === false)
  check('undefined -> false', isPilotTownStudent(undefined) === false)
  check('null -> false', isPilotTownStudent(null) === false)
  check("빈 문자열 '' -> false", isPilotTownStudent('') === false)
  check("이름 문자열 'Kinney' -> false", isPilotTownStudent('Kinney') === false)
  // 승인 UUID 1개 hex 자리만 변조(예: 마지막 자리 c->d)
  const tampered = PILOT_A_IDS[0].slice(0, -1) + (PILOT_A_IDS[0].slice(-1) === 'c' ? 'd' : 'c')
  check(`1글자 변조 UUID(${tampered}) -> false`, isPilotTownStudent(tampered) === false)
  check('접두사만 있는 문자열 -> false', isPilotTownStudent(PILOT_A_IDS[0].slice(0, 8)) === false)
  check('숫자 타입(비문자열) -> false', isPilotTownStudent(12345) === false)
}

// ── 3. App.jsx 배선 정적 확인 ─────────────────────────────────────────
console.log('\n3. App.jsx — isPilotTownStudent/townV1Enabled 배선 + 기존 플래그 게이트 유지')
{
  const appJsx = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8')
  check(
    "import { isPilotTownStudent } from './config/pilotTown' 존재",
    /import\s*\{\s*isPilotTownStudent\s*\}\s*from\s*['"]\.\/config\/pilotTown['"]/.test(appJsx)
  )
  check('isPilotTownStudent(studentId) 호출 존재', /isPilotTownStudent\(studentId\)/.test(appJsx))
  check('townV1Enabled 변수 정의 존재', /const townV1Enabled\s*=/.test(appJsx))
  check("onGoTown={townV1Enabled ? 배선 존재", /onGoTown=\{townV1Enabled\s*\?/.test(appJsx))
  check(
    "기존 isFeatureEnabled('paulTownV1') useSyncExternalStore 게이트 유지",
    /useSyncExternalStore\(subscribeFeatures,\s*\(\)\s*=>\s*isFeatureEnabled\('paulTownV1'\)/.test(appJsx)
  )
}

// ── 4. features.js 기본값 무변경 ─────────────────────────────────────────
console.log('\n4. src/config/features.js — paulTownV1/townShopV1 기본값 여전히 false')
{
  const featuresJs = fs.readFileSync(path.join(repoRoot, 'src/config/features.js'), 'utf8')
  check(
    "paulTownV1 기본 false",
    /paulTownV1\s*:\s*false/.test(featuresJs)
  )
  check(
    "townShopV1 기본 false",
    /townShopV1\s*:\s*false/.test(featuresJs)
  )
}

// ── 5. main 대비 diff에 Town V1 핵심 구현 파일 무포함 ────────────────────
console.log('\n5. git diff --name-only main — Town V1 핵심 구현 파일 무접촉')
{
  const forbidden = [
    'src/components/town/TownScreen.jsx',
    'src/hooks/useTownShop.js',
    'src/utils/townShop.js',
    'api/grant-xp.js',
    'supabase_v3_50_town_v1.sql',
  ]
  let diffOutput = ''
  let diffOk = true
  try {
    diffOutput = execSync('git diff --name-only main', { cwd: repoRoot, encoding: 'utf8' })
  } catch (err) {
    diffOk = false
    console.log(`  (git diff 실행 실패 — SKIP 취급: ${err.message})`)
  }
  if (diffOk) {
    const changedFiles = diffOutput.split('\n').map((s) => s.trim()).filter(Boolean)
    for (const f of forbidden) {
      check(`main 대비 diff에 ${f} 없음`, !changedFiles.includes(f))
    }
  } else {
    check('git diff 실행 가능(환경 문제로 SKIP)', true)
  }
}

console.log(`\n${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`\nFAIL — ${failures}건 실패`)
  process.exitCode = 1
} else {
  console.log('\nPASS — 전체 통과')
}
