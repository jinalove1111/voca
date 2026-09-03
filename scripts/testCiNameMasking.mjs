// CI 이름 마스킹 회귀 테스트 (2026-09-03, 보안수정 Track 12)
//
// 배경(보안 리뷰 High) — 이 저장소는 PUBLIC 이라 GitHub Actions 로그가
// 누구에게나 보인다.
//   (1) Gate 3b 는 scripts/prodCheck.mjs --json 출력을 stdout/보고서 파일로
//       받는데, 예전에는 --json 분기가 사람용 텍스트 마스킹을 건너뛰어
//       health.results[].name / invariants.findings[].studentName 이 원본
//       그대로 노출됐다.
//   (2) 기존 Gate 3(scripts/studentHealthCheck.mjs → scripts/verifyRelease.mjs)
//       도 WARN/FAIL 학생 실명을 stdout 에 그대로 찍어 왔다.
// 이 파일은 그 두 경로가 CI 에서 실제로 마스킹되는지, 그리고 로컬(비 CI)
// 에서는 --show-names 로 여전히 원본을 볼 수 있는지를 검증한다.
//
// 네트워크 0 — scripts/prodCheck.mjs 는 --fixture 로 라이브 접속 없이
// 실행한다. scripts/studentHealthCheck.mjs 는 --fixture 모드가 없는
// 라이브 전용 CLI 라(top-level 코드가 즉시 자격증명 조회/네트워크 호출/
// process.exit 로 이어진다) 여기서 import 하지 않는다 — 대신 (a) 마스킹
// 배선이 소스에 실제로 존재하는지 정적 단언과 (b) 동일 규칙의 독립 참조
// 구현(golden maskName)에 대한 단위 테스트로 계약을 고정한다.
//
// 실행: node scripts/testCiNameMasking.mjs
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== 1절. prodCheck.mjs --fixture --json — 기본 마스킹 / --show-names / CI 강제 ===')

// FAIL-first 로 먼저 확인한 사실(구현 전): 이 절의 "기본 마스킹" 단언들은
// 이번 수정 전 코드에서 실제로 FAIL 했다 — health.results[].name/
// invariants.findings[].studentName 에 "StudentA"/"StudentB" 원본이 그대로
// JSON stdout/보고서 파일에 실려 있었다(CLAUDE.md 규칙 15, 수정 전 되돌려
// 재확인함).
const FIXTURE_SRC = path.join(ROOT, 'scripts/prod/fixtures/ghost-unit-landing-20260902.json')
const fixture = JSON.parse(fs.readFileSync(FIXTURE_SRC, 'utf8'))
const TMP_DIR = path.join(ROOT, 'scripts/.tmp')
fs.mkdirSync(TMP_DIR, { recursive: true })
const beforeFixtureFile = path.join(TMP_DIR, 'testCiNameMasking.before.fixture.json')
fs.writeFileSync(beforeFixtureFile, JSON.stringify(fixture.before), 'utf8')
const reportDir = path.join(TMP_DIR, 'testCiNameMasking.reports')

function runProdCheck(args, envOverrides = {}) {
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts/prodCheck.mjs'), ...args],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...envOverrides } })
}
function latestReport() {
  if (!fs.existsSync(reportDir)) return null
  const files = fs.readdirSync(reportDir).filter((f) => f.endsWith('.prodcheck.json'))
  if (!files.length) return null
  return path.join(reportDir, files
    .map((f) => [f, fs.statSync(path.join(reportDir, f)).mtimeMs])
    .sort((a, b) => b[1] - a[1])[0][0])
}
const NOT_CI = { CI: '', GITHUB_ACTIONS: '' } // 이 테스트 자체가 실제 CI 위에서 돌 수도 있으므로 명시적으로 끈다.

{
  const res = runProdCheck(['--fixture', beforeFixtureFile, '--json', '--report-dir', reportDir], NOT_CI)
  check('기본(--show-names 없음, 비 CI) — stdout 에 원본 이름이 없다',
    !res.stdout.includes('StudentA') && !res.stdout.includes('StudentB'), res.stdout.slice(0, 300))
  check('기본 — stdout 의 health.results[].name 이 마스킹돼 있다',
    /"name":\s*"S\*\*\*"/.test(res.stdout), res.stdout.slice(0, 800))
  check('기본 — stdout 의 invariants.findings[].studentName 도 마스킹돼 있다',
    /"studentName":\s*"S\*\*\*"/.test(res.stdout), res.stdout.slice(0, 800))

  const reportFile = latestReport()
  check('기본 — 보고서 파일이 생성된다', !!reportFile, String(reportFile))
  if (reportFile) {
    const reportText = fs.readFileSync(reportFile, 'utf8')
    check('기본 — 보고서 파일에도 원본 이름이 없다',
      !reportText.includes('StudentA') && !reportText.includes('StudentB'))
    check('기본 — 보고서 파일의 name/studentName 도 마스킹돼 있다',
      /"name":\s*"S\*\*\*"/.test(reportText) && /"studentName":\s*"S\*\*\*"/.test(reportText))
  }
}

{
  const res = runProdCheck(['--fixture', beforeFixtureFile, '--json', '--show-names', '--report-dir', reportDir], NOT_CI)
  check('--show-names(비 CI) — stdout 에 원본 이름이 그대로 있다',
    res.stdout.includes('StudentA') || res.stdout.includes('StudentB'), res.stdout.slice(0, 300))
}

{
  // CI 감지 시 --show-names 를 줘도 강제로 마스킹돼야 한다(사람이 플래그를
  // 잘못 켜도 공개 로그에 원본이 새지 않게).
  const res = runProdCheck(['--fixture', beforeFixtureFile, '--json', '--show-names', '--report-dir', reportDir],
    { CI: 'true', GITHUB_ACTIONS: '' })
  check('CI=true + --show-names — stdout 에 원본 이름이 없다(강제 마스킹)',
    !res.stdout.includes('StudentA') && !res.stdout.includes('StudentB'), res.stdout.slice(0, 300))
  check('CI=true + --show-names — 마스킹 패턴이 있다', /"name":\s*"S\*\*\*"/.test(res.stdout))
}

{
  const res = runProdCheck(['--fixture', beforeFixtureFile, '--json', '--show-names', '--report-dir', reportDir],
    { CI: '', GITHUB_ACTIONS: 'true' })
  check('GITHUB_ACTIONS=true + --show-names — stdout 에 원본 이름이 없다(강제 마스킹)',
    !res.stdout.includes('StudentA') && !res.stdout.includes('StudentB'), res.stdout.slice(0, 300))
}

{
  // studentId(UUID) 는 PII 가 아니므로 마스킹 대상이 아니다 — 마스킹이
  // studentId 까지 지워버리는 과잉회귀가 없는지 확인한다.
  const res = runProdCheck(['--fixture', beforeFixtureFile, '--json', '--report-dir', reportDir], NOT_CI)
  let parsed = null
  try { parsed = JSON.parse(res.stdout) } catch { /* below check fails */ }
  const anyStudentId = parsed?.health?.results?.some((r) => typeof r.studentId === 'string' && r.studentId.length > 0)
  check('기본 마스킹 상태에서도 health.results[].studentId(UUID) 는 그대로 남는다', !!anyStudentId)
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== 2절. studentHealthCheck.mjs — 마스킹 배선(정적) + maskName 계약(golden) ===')

const HC_PATH = path.join(ROOT, 'scripts/studentHealthCheck.mjs')
const hc = fs.readFileSync(HC_PATH, 'utf8')

check('CI/GITHUB_ACTIONS 환경 감지 코드가 있다(IS_CI)',
  /const IS_CI = !!\(process\.env\.CI \|\| process\.env\.GITHUB_ACTIONS\)/.test(hc))
check('--mask-names 플래그가 있다', /flag\('--mask-names'\)/.test(hc))
check('MASK_NAMES 는 --mask-names 플래그 또는 IS_CI 중 하나만 참이어도 켜진다(OR)',
  /const MASK_NAMES = flag\('--mask-names'\) \|\| IS_CI/.test(hc))
check('displayName() 헬퍼가 MASK_NAMES 조건부로 마스킹한다',
  /const displayName = \(name\) => \(MASK_NAMES \? maskName\(name\) : name\)/.test(hc))

// 배선 지점 5곳 — 회귀 시 "마스킹 함수는 있는데 특정 출력 지점만 빠짐"을
// 개별적으로 잡기 위해 지점마다 따로 확인한다(2026-09-03 이전 실제로
// prodCheck.mjs 에서 --json 경로만 마스킹이 빠져 있었던 것과 같은 종류의
// 실수를 조기에 잡는 목적).
check('JSON students[] 출력에 displayName 이 쓰인다', /name: displayName\(r\.name\)/.test(hc))
check('사람용 표(pad) 출력에 displayName 이 쓰인다', /pad\(displayName\(r\.name\), 12\)/.test(hc))
check('FAIL 학생 요약 줄에 displayName 이 쓰인다', /\$\{displayName\(r\.name\)\}: \$\{r\.codes/.test(hc))
check('WARN 목록 줄에 displayName 이 쓰인다', /\$\{displayName\(r\.name\)\}: \$\{r\.warnings/.test(hc))
check('유령 유닛 인벤토리의 배정 실학생 이름에도 displayName 이 쓰인다',
  /\.map\(\(s\) => displayName\(s\.name\)\)/.test(hc))

// golden reference — maskName() 규칙(첫 글자 + ***, 빈 값은 "(이름없음)")을
// 이 테스트 파일 안에서 독립적으로 고정한다. studentHealthCheck.mjs 는
// 라이브 전용 CLI 라 직접 import 해 호출할 수 없으므로(위 헤더 설명),
// 동일 규칙의 참조 구현을 별도로 두고 그 동작을 못박는다 — 그리고 소스가
// 이 규칙의 핵심 리터럴(폴백 문자열, 마스킹 패턴)을 실제로 담고 있는지는
// 바로 아래에서 텍스트로 다시 확인한다.
function goldenMaskName(name) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return '(이름없음)'
  return `${n[0]}***`
}
check('golden maskName — 정상 한글 이름 → 첫 글자 + ***', goldenMaskName('박민준') === '박***')
check('golden maskName — 앞뒤 공백은 trim 후 마스킹', goldenMaskName('  김하은  ') === '김***')
check('golden maskName — 빈 문자열 → (이름없음)', goldenMaskName('') === '(이름없음)')
check('golden maskName — 공백만 → (이름없음)', goldenMaskName('   ') === '(이름없음)')
check('golden maskName — null/undefined → (이름없음)',
  goldenMaskName(null) === '(이름없음)' && goldenMaskName(undefined) === '(이름없음)')
check('golden maskName — 영문 이름도 동일 규칙', goldenMaskName('Irene') === 'I***')

check('소스 maskName() 이 "(이름없음)" 폴백을 갖는다(golden 과 동일 계약)',
  /return '\(이름없음\)'/.test(hc))
check('소스 maskName() 이 "첫 글자 + ***" 패턴을 만든다(golden 과 동일 계약)',
  /\$\{n\[0\]\}\*\*\*/.test(hc))

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== 3절. .github/workflows/release-gate.yml — Gate 3b stdout 에 JSON tee 없음 ===')

const WF_PATH = path.join(ROOT, '.github/workflows/release-gate.yml')
const y = fs.readFileSync(WF_PATH, 'utf8')
const gate3bBlock = (y.match(/name:\s*Gate 3b[\s\S]*?(?=\n {6}- name:|\njobs:|$)/i) || [''])[0]
check('Gate 3b 블록을 추출할 수 있다', gate3bBlock.length > 0)
check('Gate 3b 는 --json 출력을 stdout 로그에 tee 하지 않는다(파일로만 리다이렉트)',
  !/--json[^\n]*\|\s*tee/.test(gate3bBlock))
check('Gate 3b 는 npm run prod:check 의 표준출력을 파일로 리다이렉트한다(">")',
  /npm run prod:check[\s\S]*?>\s*\/tmp\/[^\s]+\.json/.test(gate3bBlock))
check('Gate 3b 는 여전히 --report-dir 로 별도 보고서 파일도 남긴다',
  /--report-dir\s+\/tmp\/prod-reports/.test(gate3bBlock))

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
