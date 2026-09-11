// scripts/testFeaturePanelAdminSession.mjs — 2026-09-12
//
// 관리자 PIN 세션(AdminScreen의 authed React state) ↔ FeatureManagementPanel
// 접근 권한 연결 회귀 테스트. 실사고: FeatureManagementPanel.jsx가
// hasPermission(PERMS.MANAGE_FEATURES)만으로 게이트를 걸었는데, 이는
// localStorage 'paulEasyVoca_userRole'(rbac.js getUserRole, 기본값
// 'student')만 읽는다. 실제 관리자 인증은 AdminScreen의 PIN 검증 후
// setAuthed(true)로 세팅되는 React state이고, 이 role 키에는 아무도 값을
// 쓰지 않는다 — 새 기기에서 PIN을 맞게 입력해 authed=true가 돼도
// FeatureManagementPanel은 "student" 역할로 보고 접근을 거부했다.
//
// 수정: src/config/rbac.js에 canManageFeatures(adminSession) 순수 헬퍼를
// 추가(adminSession===true OR 기존 hasPermission 하위호환 OR) —
// localStorage에 절대 쓰지 않는다(세션은 React state로만 전달, 화면을
// 나가면 사라짐). FeatureManagementPanel이 adminSession prop을 받아 이
// 헬퍼로 게이트하고, AdminScreen이 <FeatureManagementPanel
// adminSession={authed} />로 배선한다.
//
// 이 스크립트는 scripts/testUiStabilityGuards.mjs와 동일한 패턴:
// 순수 함수 단위 테스트 + 정적 소스 검사만. React 렌더/네트워크 없음.
//
// 운영자 회귀 시나리오(A~E) → 아래 어느 섹션이 커버하는지 매핑:
//   A. 역할 키 없음 + adminSession 없음/false → 학생은 여전히 접근 불가
//      → 섹션 1a
//   B. 역할 키 없음 + adminSession=true(AdminScreen PIN 인증 통과) →
//      접근 허용(이번 수정의 핵심 목적) → 섹션 1b
//   C. adminSession이 true가 아닌 값(문자열 'true', 1, 객체 등)으로 와도
//      느슨하게 통과시키지 않음(정확히 boolean true만 인정) → 섹션 1c
//   D. 기존 paulEasyVoca_userRole='admin' 경로(하위 호환)는 계속 동작 →
//      섹션 1d
//   E. 이 연결이 어떤 형태로도 localStorage/sessionStorage에 관리자 role/
//      세션을 "기록"하는 부작용을 만들지 않음(세션은 순수 React state로만
//      전달) → 섹션 2, 3h
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let failures = 0
let checks = 0
function check(label, cond) {
  checks++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}
function section(title) {
  console.log(`\n${title}`)
}

// ── localStorage 인메모리 스텁(import 전에 globalThis에 심어야 rbac.js가
//    브라우저 환경으로 오인해 정상 동작 — features.js처럼 try/catch로
//    감싸져 있지만, 이 스텁은 실제 동작을 검증하려는 목적) ─────────────────
const storageBacking = new Map()
const setItemCalls = []
globalThis.localStorage = {
  getItem(key) {
    return storageBacking.has(key) ? storageBacking.get(key) : null
  },
  setItem(key, value) {
    setItemCalls.push(key)
    storageBacking.set(key, String(value))
  },
  removeItem(key) {
    storageBacking.delete(key)
  },
  clear() {
    storageBacking.clear()
  },
}

const rbac = await import('../src/config/rbac.js')
const { canManageFeatures, getUserRole, setUserRole, ROLES, PERMISSIONS } = rbac

// ── 1. canManageFeatures 순수 판정 ──────────────────────────────────────
section('1. rbac.js — canManageFeatures(adminSession) 순수 판정')
{
  // 1a. 역할 키 없음 + adminSession 없음/false → 학생은 접근 불가(시나리오 A)
  storageBacking_reset()
  check(
    '1a. 역할 키 없음, adminSession 미지정 → false',
    canManageFeatures() === false
  )
  check(
    '1a. 역할 키 없음, adminSession=false → false',
    canManageFeatures(false) === false
  )
  check(
    '1a. 역할 키 없음, adminSession=undefined 명시 → false',
    canManageFeatures(undefined) === false
  )

  // 1b. 역할 키 없음 + adminSession=true → 접근 허용(시나리오 B, 이번 수정 핵심)
  storageBacking_reset()
  check(
    '1b. 역할 키 없음(student 기본값), adminSession=true → true',
    canManageFeatures(true) === true
  )

  // 1c. adminSession이 정확히 boolean true가 아니면 통과시키지 않음(시나리오 C)
  storageBacking_reset()
  check("1c. adminSession='true'(문자열) → false", canManageFeatures('true') === false)
  check('1c. adminSession=1(숫자) → false', canManageFeatures(1) === false)
  check('1c. adminSession={}(객체, truthy) → false', canManageFeatures({}) === false)
  check('1c. adminSession=[](배열, truthy) → false', canManageFeatures([]) === false)

  // 1d. 기존 paulEasyVoca_userRole 기반 하위 호환(시나리오 D)
  storageBacking_reset()
  setUserRole(ROLES.ADMIN)
  check(
    "1d. 역할 키='admin', adminSession 없음 → true(하위 호환)",
    canManageFeatures() === true
  )
  storageBacking_reset()
  setUserRole(ROLES.STUDENT)
  check(
    "1d. 역할 키='student', adminSession=true → true(OR 조건)",
    canManageFeatures(true) === true
  )
  check(
    "1d. 역할 키='student', adminSession 없음 → false(학생 기본값 그대로)",
    canManageFeatures() === false
  )
}

function storageBacking_reset() {
  storageBacking.clear()
}

// ── 2. 부작용 없음: setItem 호출 0, getUserRole 기본값 불변(시나리오 E) ──
section('2. 부작용 없음 — localStorage 기록 0, getUserRole 기본값 불변')
{
  storageBacking.clear()
  setItemCalls.length = 0

  // 섹션 1의 모든 canManageFeatures 호출 재현(호출 자체가 setItem을 유발하는지)
  canManageFeatures()
  canManageFeatures(false)
  canManageFeatures(true)
  canManageFeatures('true')
  canManageFeatures(1)
  canManageFeatures({})

  const userRoleSetCalls = setItemCalls.filter(k => k === 'paulEasyVoca_userRole')
  const featuresSetCalls = setItemCalls.filter(k => k === 'paulEasyVoca_features')
  check(
    "canManageFeatures 호출들이 'paulEasyVoca_userRole'에 setItem 0회",
    userRoleSetCalls.length === 0
  )
  check(
    "canManageFeatures 호출들이 'paulEasyVoca_features'에 setItem 0회",
    featuresSetCalls.length === 0
  )
  check(
    '역할 키가 없는 상태에서 getUserRole()은 여전히 student 기본값',
    getUserRole() === ROLES.STUDENT
  )
}

// ── 3. 정적 소스 검사 ────────────────────────────────────────────────────
const featurePanelJsx = fs.readFileSync(
  path.join(repoRoot, 'src/components/FeatureManagementPanel.jsx'), 'utf8'
)
const adminScreenJsx = fs.readFileSync(
  path.join(repoRoot, 'src/components/AdminScreen.jsx'), 'utf8'
)
const appJsx = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8')
const studentSelectJsx = fs.readFileSync(
  path.join(repoRoot, 'src/components/StudentSelect.jsx'), 'utf8'
)
const rbacSrc = fs.readFileSync(path.join(repoRoot, 'src/config/rbac.js'), 'utf8')
const featuresSrc = fs.readFileSync(path.join(repoRoot, 'src/config/features.js'), 'utf8')

section('3. FeatureManagementPanel.jsx — canManageFeatures 배선')
{
  check(
    "FeatureManagementPanel.jsx가 rbac에서 canManageFeatures를 import",
    /import\s*\{[^}]*canManageFeatures[^}]*\}\s*from\s*['"]\.\.\/config\/rbac['"]/.test(featurePanelJsx)
  )
  check(
    '게이트 조건이 정확히 !canManageFeatures(adminSession)',
    /if\s*\(\s*!canManageFeatures\(adminSession\)\s*\)/.test(featurePanelJsx)
  )
  check(
    '컴포넌트 시그니처가 adminSession을 destructure',
    /export default function FeatureManagementPanel\(\s*\{\s*adminSession\s*=\s*false\s*\}\s*\)/.test(featurePanelJsx)
  )
}

section('4. AdminScreen.jsx — authed → adminSession 배선 + 기존 상태 보존')
{
  check(
    "AdminScreen.jsx가 <FeatureManagementPanel adminSession={authed} /> 로 렌더",
    /<FeatureManagementPanel\s+adminSession=\{authed\}\s*\/>/.test(adminScreenJsx)
  )
  check(
    "AdminScreen.jsx가 여전히 const [authed, setAuthed] = useState(false) 를 선언(spacing 무관)",
    /const\s*\[\s*authed\s*,\s*setAuthed\s*\]\s*=\s*useState\(false\)/.test(adminScreenJsx)
  )
}

section('5. 관리자 role 영구 저장 없음 — 로그인 플로우에 setUserRole/역할 키 리터럴 없음')
{
  for (const [name, src] of [
    ['AdminScreen.jsx', adminScreenJsx],
    ['App.jsx', appJsx],
    ['StudentSelect.jsx', studentSelectJsx],
  ]) {
    check(`${name}에 setUserRole( 호출 없음`, !/setUserRole\(/.test(src))
    check(`${name}에 'paulEasyVoca_userRole' 리터럴 없음`, !src.includes('paulEasyVoca_userRole'))
  }
}

section('6. authed/관리자 role을 storage에 기록하는 코드 없음')
{
  const suspiciousPattern = /(local|session)Storage\.setItem\(\s*['"][^'"]*(authed|userRole)/
  for (const [name, src] of [
    ['AdminScreen.jsx', adminScreenJsx],
    ['App.jsx', appJsx],
  ]) {
    const matches = src.match(new RegExp(suspiciousPattern, 'g')) || []
    check(`${name} — authed/userRole 키에 대한 storage.setItem 0건`, matches.length === 0)
  }
}

section('7. 기존 기능 무변경 확인(회귀 아님)')
{
  check(
    "features.js의 setFeatureEnabled는 여전히 'paulEasyVoca_features'에 저장",
    /setFeatureEnabled[\s\S]*?localStorage\.setItem\(\s*['"]paulEasyVoca_features['"]/.test(featuresSrc)
  )
  check(
    'rbac.js의 canManageFeatures 본문에는 setItem이 없음(순수 판정만)',
    (() => {
      const m = rbacSrc.match(/export const canManageFeatures = \([\s\S]*?\n\}/)
      return !!m && !/setItem/.test(m[0])
    })()
  )
  check(
    'rbac.js가 hasPermission을 여전히 export(기존 소비자 무변경)',
    /export const hasPermission = /.test(rbacSrc)
  )
}

console.log(`\n${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.log(`\nFAIL — ${failures}건 실패`)
  process.exitCode = 1
} else {
  console.log('\nPASS — 전체 통과')
}
