// Production Safety Harness — prod:check 회귀 테스트 (2026-09-03, Phase 1-A)
//
// 네트워크 0 — 전부 픽스처/합성 데이터로 돈다. 라이브 조회 1회는 이 파일이
// 아니라 이번 세션 handoff 보고서에 별도로 기록한다(운영자 검토용, 자동화 아님).
//
// FAIL-first: scripts/lib/prodInvariants.mjs / scripts/prodCheck.mjs 가
// 없던 시점에는 이 테스트가 import 에러로 전부 FAIL 했다 — 그 상태를 먼저
// 확인한 뒤 구현했다(CLAUDE.md 규칙 15).
//
// 1~3절은 scripts/lib/prodInvariants.mjs(순수 함수)를 직접 호출한다.
// 4절은 scripts/prodCheck.mjs CLI 를 spawnSync 로 실행한다(--fixture, 네트워크 0).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildContext, evaluateStudent, classifyAccount, summarize } from './lib/studentHealthRules.mjs'
import { buildInvariantContext, evaluateInvariants, INVARIANT_CODES } from './lib/prodInvariants.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const hasCode = (findings, code, studentId, severity) => findings.some((f) =>
  f.code === code && (studentId === undefined || f.studentId === studentId) && (severity === undefined || f.severity === severity))

const FIXTURE_PATH = path.join(ROOT, 'scripts/prod/fixtures/ghost-unit-landing-20260902.json')
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const STU_A = '2c6845fc-b30e-4e4d-b260-d13c13fe7b9a'
const STU_B = 'bf05032a-8210-4082-8584-7e1afdcc02e2'

function evalFixture(caseData) {
  const ctx = buildContext(caseData)
  const invCtx = buildInvariantContext(caseData)
  const realStudents = caseData.students.filter((s) => classifyAccount(s, ctx) === 'REAL')
  const healthResults = realStudents.map((s) => evaluateStudent(s, ctx))
  const healthSummary = summarize(healthResults)
  const { findings, summary: invariantsSummary } = evaluateInvariants(invCtx)
  return { healthResults, healthSummary, findings, invariantsSummary }
}

console.log('\n=== 1절. 모듈 계약 ===')
check('evaluateInvariants / buildInvariantContext 가 export된 함수다',
  typeof evaluateInvariants === 'function' && typeof buildInvariantContext === 'function')
check('INVARIANT_CODES 에 9개 코드가 전부 있다',
  ['STUDENT_UNIT_ORPHAN', 'SCA_UNIT_ORPHAN', 'STUDENT_GHOST_UNIT', 'SCA_GHOST_UNIT', 'UNIT_NAME_MISMATCH',
    'PRIMARY_UNIT_MISMATCH', 'PRIMARY_TEXTBOOK_MISMATCH', 'UNIT_WORDS_ABNORMAL', 'GHOST_UNIT_PRESENT']
    .every((c) => INVARIANT_CODES?.[c] === c),
  JSON.stringify(INVARIANT_CODES))
check('evaluateInvariants — 순수 함수(네트워크/DB import 없음)',
  !/supabase|createClient|node:fs|fetch\s*\(/.test(
    fs.readFileSync(path.join(ROOT, 'scripts/lib/prodInvariants.mjs'), 'utf8')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')))

console.log('\n=== 2절. 픽스처(2026-09-02 유령 유닛 착륙 실측 기반) — before ===')
{
  const { healthSummary, findings, invariantsSummary } = evalFixture(fixture.before.data)
  check('health — FAIL 학생 1명(StudentA, GHOST_UNIT)', healthSummary.fail === 1, JSON.stringify(healthSummary))
  check('invariants — STUDENT_GHOST_UNIT FAIL (StudentA)',
    hasCode(findings, 'STUDENT_GHOST_UNIT', STU_A, 'FAIL'), JSON.stringify(findings.map((f) => f.code)))
  check('invariants — SCA_GHOST_UNIT WARN (StudentB, 비-primary 배정이 유령 유닛 가리킴)',
    hasCode(findings, 'SCA_GHOST_UNIT', STU_B, 'WARN'))
  check('invariants — PRIMARY_UNIT_MISMATCH WARN (StudentB, primary Unit7 vs students Unit2 — 실측 기존 불일치)',
    hasCode(findings, 'PRIMARY_UNIT_MISMATCH', STU_B, 'WARN'))
  check('invariants 요약 FAIL >= 1', invariantsSummary.fail >= 1, JSON.stringify(invariantsSummary))
  check('StudentA 는 SCA_GHOST_UNIT 로 이중 보고되지 않는다(자기 자신의 primary는 STUDENT_GHOST_UNIT 이 이미 보고)',
    !hasCode(findings, 'SCA_GHOST_UNIT', STU_A))
}

console.log('\n=== 3절. 픽스처 — after(유령 유닛 착륙 SQL 핫픽스 반영 후) ===')
{
  const { healthSummary, findings, invariantsSummary } = evalFixture(fixture.after.data)
  check('health — FAIL 0', healthSummary.fail === 0, JSON.stringify(healthSummary))
  check('StudentA — health PASS(유령 탈출)',
    (() => {
      const ctx = buildContext(fixture.after.data)
      const a = fixture.after.data.students.find((s) => s.id === STU_A)
      return evaluateStudent(a, ctx).status === 'PASS'
    })())
  check('invariants — 요약 FAIL 0', invariantsSummary.fail === 0, JSON.stringify(invariantsSummary))
  check('invariants — STUDENT_GHOST_UNIT(StudentA) 소멸', !hasCode(findings, 'STUDENT_GHOST_UNIT', STU_A))
  check('invariants — SCA_GHOST_UNIT(StudentB) 소멸', !hasCode(findings, 'SCA_GHOST_UNIT', STU_B))
  check('invariants — PRIMARY_UNIT_MISMATCH(StudentB) 는 그대로 남는다(별도 과제, 이번 핫픽스 범위 아님)',
    hasCode(findings, 'PRIMARY_UNIT_MISMATCH', STU_B, 'WARN'))
}

console.log('\n=== 4절(a). 합성 케이스 — 개별 invariant 코드 재현 ===')
const syntheticBase = () => ({
  classes: [{ id: 'c1', name: '반1', spelling_direction: 'kr2en' }],
  textbooks: [{ id: 'tb1', name: '교재1', owner_class_id: null }, { id: 'tb2', name: '교재2', owner_class_id: null }],
  units: [
    { id: 'u1', name: 'Unit1', textbook_id: 'tb1' },
    ...Array.from({ length: 1 }, () => null).filter(Boolean),
  ],
  words: Array.from({ length: 20 }, (_, i) => ({ id: `w${i}`, unit_id: 'u1', word: `w${i}`, meaning: `뜻${i}` })),
  assignments: [{ student_id: 's1', class_id: 'c1', textbook_id: 'tb1', is_primary: true, current_unit_id: 'u1' }],
  students: [{ id: 's1', name: '합성학생', class_id: 'c1', current_unit_id: 'u1', unit_name: 'Unit1' }],
})
{
  const fx = syntheticBase(); fx.students[0].current_unit_id = 'u-orphan'
  const { findings } = evalFixture(fx)
  check('STUDENT_UNIT_ORPHAN — current_unit_id 가 units 에 없음',
    hasCode(findings, 'STUDENT_UNIT_ORPHAN', 's1', 'FAIL'), JSON.stringify(findings.map((f) => f.code)))
}
{
  const fx = syntheticBase()
  fx.assignments.push({ student_id: 's1', class_id: 'c1', textbook_id: 'tb2', is_primary: false, current_unit_id: 'u-orphan2' })
  const { findings } = evalFixture(fx)
  check('SCA_UNIT_ORPHAN — 배정 행의 current_unit_id 가 units 에 없음',
    hasCode(findings, 'SCA_UNIT_ORPHAN', 's1', 'FAIL'), JSON.stringify(findings.map((f) => f.code)))
}
{
  const fx = syntheticBase(); fx.students[0].unit_name = 'Unit2' // 실제 유닛은 Unit1
  const { findings } = evalFixture(fx)
  check('UNIT_NAME_MISMATCH — unit_name("Unit2") != 실제 유닛("Unit1")',
    hasCode(findings, 'UNIT_NAME_MISMATCH', 's1', 'WARN'), JSON.stringify(findings.map((f) => f.code)))
}
{
  const fx = syntheticBase()
  fx.classes.push({ id: 'c2', name: '반2', spelling_direction: 'kr2en' })
  fx.units.push({ id: 'u2', name: 'Unit2', textbook_id: 'tb2' })
  fx.words.push(...Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, unit_id: 'u2', word: `x${i}`, meaning: `뜻${i}` })))
  // 주교재는 tb2 인데 현재 유닛(u1)은 tb1 소속 — 교재 불일치
  fx.assignments = [{ student_id: 's1', class_id: 'c1', textbook_id: 'tb2', is_primary: true, current_unit_id: 'u2' }]
  const { findings } = evalFixture(fx)
  check('PRIMARY_TEXTBOOK_MISMATCH — 현재 유닛의 교재가 주교재 배정과 다름',
    hasCode(findings, 'PRIMARY_TEXTBOOK_MISMATCH', 's1', 'WARN'), JSON.stringify(findings.map((f) => f.code)))
}
{
  const fx = syntheticBase()
  fx.words = Array.from({ length: 101 }, (_, i) => ({ id: `y${i}`, unit_id: 'u1', word: `y${i}`, meaning: `뜻${i}` }))
  const { findings } = evalFixture(fx)
  check('UNIT_WORDS_ABNORMAL — 101단어(정상 범위 2~100 초과)',
    hasCode(findings, 'UNIT_WORDS_ABNORMAL', null, 'WARN'), JSON.stringify(findings.map((f) => f.code)))
}
{
  // QA_/_INACTIVE 계정은 invariants 에서도 제외된다(health 와 동일 classifyAccount 재사용)
  const fx = syntheticBase()
  fx.students[0].current_unit_id = 'u-orphan-excluded'
  fx.students[0].name = 'QA_고아학생'
  const { findings, invariantsSummary } = evalFixture(fx)
  check('QA_ 접두 계정은 STUDENT_UNIT_ORPHAN 대상에서 제외된다', !hasCode(findings, 'STUDENT_UNIT_ORPHAN'))
  check('QA_ 접두 계정은 checked 에도 포함되지 않는다', invariantsSummary.checked === 0, JSON.stringify(invariantsSummary))
}
{
  // opts.ghostUnitIds — isGhostUnit() 판정과 무관하게 회귀 픽스처에서 강제로 유령 취급
  const fx = syntheticBase() // u1 은 정상(20단어)이라 isGhostUnit() 은 false
  const ctx = buildInvariantContext(fx)
  const withOpt = evaluateInvariants(ctx, { ghostUnitIds: ['u1'] })
  const withoutOpt = evaluateInvariants(ctx)
  check('opts.ghostUnitIds — 지정하면 정상 유닛도 STUDENT_GHOST_UNIT 으로 취급된다(회귀 픽스처용)',
    hasCode(withOpt.findings, 'STUDENT_GHOST_UNIT', 's1', 'FAIL'))
  check('opts 없이는 같은 유닛이 유령으로 잡히지 않는다(반증)',
    !hasCode(withoutOpt.findings, 'STUDENT_GHOST_UNIT', 's1'))
}

console.log('\n=== 4절(b). 방어 — 잘못된 입력에도 throw하지 않는다 ===')
for (const bad of [null, undefined, {}, { students: [{ id: 'x' }] }]) {
  check(`buildInvariantContext/evaluateInvariants(${JSON.stringify(bad)}) 가 throw하지 않는다`,
    (() => { try { evaluateInvariants(buildInvariantContext(bad)); return true } catch { return false } })())
}

console.log('\n=== 5절. CLI(scripts/prodCheck.mjs) — --fixture / --json / --expect-ref ===')
const TMP_DIR = path.join(ROOT, 'scripts/.tmp')
fs.mkdirSync(TMP_DIR, { recursive: true })
const beforeFixtureFile = path.join(TMP_DIR, 'testProdCheck.before.fixture.json')
const afterFixtureFile = path.join(TMP_DIR, 'testProdCheck.after.fixture.json')
fs.writeFileSync(beforeFixtureFile, JSON.stringify(fixture.before), 'utf8')
fs.writeFileSync(afterFixtureFile, JSON.stringify(fixture.after), 'utf8')
const reportDir = path.join(TMP_DIR, 'testProdCheck.reports')

function runCli(args) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts/prodCheck.mjs'), ...args],
    { cwd: ROOT, encoding: 'utf8' })
  return res
}

{
  const res = runCli(['--fixture', beforeFixtureFile, '--json', '--report-dir', reportDir])
  check('before 픽스처 --json — exit 1', res.status === 1, `status=${res.status} stderr=${res.stderr}`)
  let parsed = null
  try { parsed = JSON.parse(res.stdout) } catch { /* below check fails */ }
  check('before 픽스처 --json — JSON 파싱 가능', !!parsed, res.stdout.slice(0, 300))
  check('before 픽스처 --json — verdict FAIL', parsed?.verdict === 'FAIL', JSON.stringify(parsed?.verdict))
  check('before 픽스처 --json — invariants.findings 에 STUDENT_GHOST_UNIT 포함',
    Array.isArray(parsed?.invariants?.findings) && parsed.invariants.findings.some((f) => f.code === 'STUDENT_GHOST_UNIT'))
}
{
  const res = runCli(['--fixture', afterFixtureFile, '--json', '--report-dir', reportDir])
  check('after 픽스처 --json — exit 0', res.status === 0, `status=${res.status} stderr=${res.stderr}`)
  const parsed = JSON.parse(res.stdout)
  check('after 픽스처 --json — health.summary.fail === 0', parsed?.health?.summary?.fail === 0)
  check('after 픽스처 --json — invariants.summary.fail === 0', parsed?.invariants?.summary?.fail === 0)
}
{
  const res = runCli(['--fixture', beforeFixtureFile, '--report-dir', reportDir])
  check('보고서 파일이 생성된다', fs.existsSync(reportDir) && fs.readdirSync(reportDir).some((f) => f.endsWith('.prodcheck.json')),
    `res.status=${res.status}`)
  const reportFiles = fs.readdirSync(reportDir).filter((f) => f.endsWith('.prodcheck.json'))
  const latest = reportFiles.map((f) => path.join(reportDir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
  const reportText = fs.readFileSync(latest, 'utf8')
  check('보고서에 "VITE_SUPABASE" 문자열이 없다', !reportText.includes('VITE_SUPABASE'))
  check('보고서에 키 값(anon key 패턴)이 없다 — env 는 host/ref 만', !/"key"\s*:/.test(reportText))
}
{
  const res = runCli(['--fixture', beforeFixtureFile, '--expect-ref', 'wrong-ref'])
  check('--expect-ref 불일치 — exit 2', res.status === 2, `status=${res.status} stderr=${res.stderr}`)
}

console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
