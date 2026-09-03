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
import { buildInvariantContext, evaluateInvariants, INVARIANT_CODES, CODE_META } from './lib/prodInvariants.mjs'
import { loadLearningBaseline, diffLearningBaseline, LEARNING_BASELINE_TABLES } from './lib/prodDataLoader.mjs'
import {
  makeScenario, makeCaseA, makeCaseB, makeCaseC, makeCaseD,
  makeCaseContainerOnly, makeCaseClassMoved, makeCaseStudentClassContainer,
} from './prod/fixtures/synth.mjs'

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

// ═══════════════════════════════════════════════════════════════════════
// Phase 8(2026-09-03) 확장 — invariant 8종 + impact/recommended + baseline
// 헬퍼 + synth 픽스처 빌더 + UX 출력. FAIL-first: 이 절들을 추가한 직후
// scripts/lib/prodInvariants.mjs / prodDataLoader.mjs / prodCheck.mjs /
// scripts/prod/fixtures/synth.mjs 를 아직 확장하지 않은 상태에서 먼저
// 실행해 import 에러 + 코드 미존재로 다수 FAIL 하는 것을 확인한 뒤
// 구현했다(CLAUDE.md 규칙 15).
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== 6절. CODE_META — 모든 INVARIANT_CODES 에 impact/recommended 존재 ===')
{
  const allowedRecommended = new Set(['READ-ONLY 조사', '운영자 결정', '코드 과제'])
  for (const code of Object.values(INVARIANT_CODES)) {
    const meta = CODE_META[code]
    check(`CODE_META.${code} — impact 비어있지 않음`, !!meta?.impact && meta.impact.length > 0)
    check(`CODE_META.${code} — recommended 가 허용값 중 하나`, allowedRecommended.has(meta?.recommended),
      JSON.stringify(meta?.recommended))
  }
  const { findings } = evalFixture(fixture.before.data)
  check('evaluateInvariants findings 각각에 impact/recommended 필드가 실제로 붙는다',
    findings.length > 0 && findings.every((f) => typeof f.impact === 'string' && typeof f.recommended === 'string'))
}

console.log('\n=== 7절. Phase 8 신규 invariant 코드 — 개별 양성/음성 ===')
{
  // STUDENT_TEXTBOOK_MISMATCH — 현재 유닛의 교재가 이 학생 SCA 어디에도 없음
  const fx = syntheticBase()
  fx.units.push({ id: 'u2', name: 'Unit2', textbook_id: 'tb2' })
  fx.words.push(...Array.from({ length: 20 }, (_, i) => ({ id: `u2w${i}`, unit_id: 'u2', word: `u2w${i}`, meaning: `뜻${i}` })))
  fx.students[0].current_unit_id = 'u2'
  fx.students[0].unit_name = 'Unit2'
  const { findings } = evalFixture(fx)
  check('STUDENT_TEXTBOOK_MISMATCH(양성) — 현재 유닛 교재(tb2)가 SCA(tb1)에 없음',
    hasCode(findings, 'STUDENT_TEXTBOOK_MISMATCH', 's1', 'WARN'), JSON.stringify(findings.map((f) => f.code)))
}
{
  const { findings } = evalFixture(syntheticBase())
  check('STUDENT_TEXTBOOK_MISMATCH(음성) — 기본 픽스처는 SCA 와 교재 일치',
    !hasCode(findings, 'STUDENT_TEXTBOOK_MISMATCH'))
}
{
  // SCA_TEXTBOOK_ORPHAN — 배정 행의 textbook_id 가 textbooks 에 없음
  const fx = syntheticBase()
  fx.assignments.push({ student_id: 's1', class_id: 'c1', textbook_id: 'tb-missing', is_primary: false, current_unit_id: null })
  const { findings } = evalFixture(fx)
  check('SCA_TEXTBOOK_ORPHAN(양성)', hasCode(findings, 'SCA_TEXTBOOK_ORPHAN', 's1', 'FAIL'),
    JSON.stringify(findings.map((f) => f.code)))
}
{
  const { findings } = evalFixture(syntheticBase())
  check('SCA_TEXTBOOK_ORPHAN(음성)', !hasCode(findings, 'SCA_TEXTBOOK_ORPHAN'))
}
{
  // SCA_UNIT_TEXTBOOK_MISMATCH — 배정 행의 유닛이 그 행의 교재 소속이 아님
  const fx = syntheticBase()
  fx.units.push({ id: 'u2', name: 'Unit2', textbook_id: 'tb2' })
  fx.words.push(...Array.from({ length: 20 }, (_, i) => ({ id: `u2w${i}`, unit_id: 'u2', word: `u2w${i}`, meaning: `뜻${i}` })))
  fx.assignments.push({ student_id: 's1', class_id: 'c1', textbook_id: 'tb1', is_primary: false, current_unit_id: 'u2' })
  const { findings } = evalFixture(fx)
  check('SCA_UNIT_TEXTBOOK_MISMATCH(양성) — 배정행 textbook_id(tb1) != 유닛의 textbook_id(tb2)',
    hasCode(findings, 'SCA_UNIT_TEXTBOOK_MISMATCH', 's1', 'WARN'), JSON.stringify(findings.map((f) => f.code)))
}
{
  const { findings } = evalFixture(syntheticBase())
  check('SCA_UNIT_TEXTBOOK_MISMATCH(음성) — 기본 픽스처는 배정행 유닛/교재 일치',
    !hasCode(findings, 'SCA_UNIT_TEXTBOOK_MISMATCH'))
}
{
  // MULTIPLE_PRIMARY — primary 2개 이상
  const fx = syntheticBase()
  fx.assignments.push({ student_id: 's1', class_id: 'c1', textbook_id: 'tb2', is_primary: true, current_unit_id: null })
  const { findings } = evalFixture(fx)
  check('MULTIPLE_PRIMARY(양성)', hasCode(findings, 'MULTIPLE_PRIMARY', 's1', 'FAIL'),
    JSON.stringify(findings.map((f) => f.code)))
}
{
  const { findings } = evalFixture(syntheticBase())
  check('MULTIPLE_PRIMARY(음성) — primary 1개', !hasCode(findings, 'MULTIPLE_PRIMARY'))
}
{
  // NO_PRIMARY — 배정은 있으나 primary 없음
  const fx = syntheticBase()
  fx.assignments[0].is_primary = false
  const { findings } = evalFixture(fx)
  check('NO_PRIMARY(양성)', hasCode(findings, 'NO_PRIMARY', 's1', 'WARN'), JSON.stringify(findings.map((f) => f.code)))
}
{
  const { findings } = evalFixture(syntheticBase())
  check('NO_PRIMARY(음성) — primary 존재', !hasCode(findings, 'NO_PRIMARY'))
}
{
  // UNIT_TEXTBOOK_ORPHAN — 유닛의 textbook_id 가 textbooks 에 없음(실학생이 참조하는 유닛만)
  const fx = syntheticBase()
  fx.units[0].textbook_id = 'tb-missing'
  const { findings } = evalFixture(fx)
  check('UNIT_TEXTBOOK_ORPHAN(양성)', hasCode(findings, 'UNIT_TEXTBOOK_ORPHAN', null, 'FAIL'),
    JSON.stringify(findings.map((f) => f.code)))
}
{
  const { findings } = evalFixture(syntheticBase())
  check('UNIT_TEXTBOOK_ORPHAN(음성)', !hasCode(findings, 'UNIT_TEXTBOOK_ORPHAN'))
}
{
  // UNIT_NAME_ABNORMAL — 번호 없는 별칭(비-유령, 단어 20개라 isGhostUnit=false)
  const fx = syntheticBase()
  fx.units[0].name = 'Unit'
  const { findings } = evalFixture(fx)
  check('UNIT_NAME_ABNORMAL(양성, 번호없는 별칭이지만 단어 많아 유령 아님)',
    hasCode(findings, 'UNIT_NAME_ABNORMAL', null, 'WARN'), JSON.stringify(findings.map((f) => f.code)))
  check('같은 유닛이 GHOST_UNIT_PRESENT 로는 잡히지 않는다(단어 20개, isGhostUnit=false)',
    !hasCode(findings, 'GHOST_UNIT_PRESENT'))
}
{
  // UNIT_NAME_ABNORMAL — 30자 초과
  const fx = syntheticBase()
  fx.units[0].name = 'A'.repeat(31)
  const { findings } = evalFixture(fx)
  check('UNIT_NAME_ABNORMAL(양성, 30자 초과)', hasCode(findings, 'UNIT_NAME_ABNORMAL', null, 'WARN'))
}
{
  // UNIT_NAME_ABNORMAL — 빈 값/공백
  const fx = syntheticBase()
  fx.units[0].name = '   '
  const { findings } = evalFixture(fx)
  check('UNIT_NAME_ABNORMAL(양성, 공백)', hasCode(findings, 'UNIT_NAME_ABNORMAL', null, 'WARN'))
}
{
  const { findings } = evalFixture(syntheticBase())
  check('UNIT_NAME_ABNORMAL(음성) — 기본 픽스처 "Unit1"은 정상', !hasCode(findings, 'UNIT_NAME_ABNORMAL'))
}
{
  // UNIT_NAME_ABNORMAL 은 유령 판정된 유닛과 중복 보고하지 않는다
  const fx = syntheticBase()
  fx.units.push({ id: 'u-ghost', name: 'Unit', textbook_id: 'tb1' })
  fx.words.push({ id: 'ghost-w1', unit_id: 'u-ghost', word: 'No.', meaning: '어휘·어구' }) // 헤더 라벨, 1개 -> 유령
  const { findings } = evalFixture(fx)
  check('유령 유닛은 GHOST_UNIT_PRESENT 로 잡힌다', hasCode(findings, 'GHOST_UNIT_PRESENT'))
  check('유령 유닛은 UNIT_NAME_ABNORMAL 로 중복 보고되지 않는다(refs.unitId=u-ghost 없음)',
    !findings.some((f) => f.code === 'UNIT_NAME_ABNORMAL' && f.refs?.unitId === 'u-ghost'))
}
{
  // CLASS_ASSIGNMENT_CONTRADICTION — 홈 반과 SCA 모순, 일치 행 없음
  const fx = syntheticBase()
  fx.classes.push({ id: 'c-other', name: '다른반', spelling_direction: 'kr2en' })
  fx.students[0].class_id = 'c-other'
  const { findings } = evalFixture(fx)
  check('CLASS_ASSIGNMENT_CONTRADICTION(양성)', hasCode(findings, 'CLASS_ASSIGNMENT_CONTRADICTION', 's1', 'WARN'),
    JSON.stringify(findings.map((f) => f.code)))
}
{
  const { findings } = evalFixture(syntheticBase())
  check('CLASS_ASSIGNMENT_CONTRADICTION(음성) — 홈 반과 primary class_id 일치', !hasCode(findings, 'CLASS_ASSIGNMENT_CONTRADICTION'))
}
{
  // 이동 학생 오탐 방지 — 과거 반 SCA 행이 남아있어 hasMatchingSCA 가 true
  const fx = syntheticBase()
  fx.classes.push({ id: 'c-old', name: '예전반', spelling_direction: 'kr2en' })
  fx.students[0].class_id = 'c-old' // 홈 반 갱신이 아직 안 된 레거시 상태를 재현
  fx.assignments.push({ student_id: 's1', class_id: 'c-old', textbook_id: 'tb1', is_primary: false, current_unit_id: null, created_at: '2026-01-01T00:00:00Z' })
  const { findings } = evalFixture(fx)
  check('이동 학생(과거 반 SCA 존재)은 CLASS_ASSIGNMENT_CONTRADICTION 으로 오탐되지 않는다',
    !hasCode(findings, 'CLASS_ASSIGNMENT_CONTRADICTION', 's1'), JSON.stringify(findings.map((f) => f.code)))
}

console.log('\n=== 8절. synth.mjs 빌더 — 케이스 A/B/C/D ===')
{
  const { healthResults, findings } = evalFixture(makeCaseA())
  check('케이스 A — STUDENT_GHOST_UNIT FAIL(synth-stu-x)',
    hasCode(findings, 'STUDENT_GHOST_UNIT', 'synth-stu-x', 'FAIL'), JSON.stringify(findings.map((f) => f.code)))
  check('케이스 A — UNIT_NAME_MISMATCH WARN(synth-stu-x, unit_name=Unit5 vs 실제 "Unit")',
    hasCode(findings, 'UNIT_NAME_MISMATCH', 'synth-stu-x', 'WARN'))
  check('케이스 A — health FAIL(synth-stu-x)', healthResults.find((r) => r.studentId === 'synth-stu-x')?.status === 'FAIL')
}
{
  const { healthResults, findings } = evalFixture(makeCaseB())
  check('케이스 B(A 핫픽스 후) — STUDENT_GHOST_UNIT 소멸', !hasCode(findings, 'STUDENT_GHOST_UNIT', 'synth-stu-x'))
  check('케이스 B — UNIT_NAME_MISMATCH 소멸(Unit5/Unit5 일치)', !hasCode(findings, 'UNIT_NAME_MISMATCH', 'synth-stu-x'))
  check('케이스 B — health PASS(synth-stu-x)', healthResults.find((r) => r.studentId === 'synth-stu-x')?.status === 'PASS')
}
{
  const { findings } = evalFixture(makeCaseC())
  check('케이스 C — SCA_GHOST_UNIT WARN(synth-stu-y, 비-primary 배정)',
    hasCode(findings, 'SCA_GHOST_UNIT', 'synth-stu-y', 'WARN'), JSON.stringify(findings.map((f) => f.code)))
  check('케이스 C — students 레코드 자체는 무접촉(STUDENT_GHOST_UNIT/STUDENT_UNIT_ORPHAN 없음)',
    !hasCode(findings, 'STUDENT_GHOST_UNIT', 'synth-stu-y') && !hasCode(findings, 'STUDENT_UNIT_ORPHAN', 'synth-stu-y'))
}
{
  const { findings } = evalFixture(makeCaseD())
  check('케이스 D(C 핫픽스 후) — SCA_GHOST_UNIT 소멸(비-primary 가 Unit1 로 재지정)',
    !hasCode(findings, 'SCA_GHOST_UNIT', 'synth-stu-y'))
}
{
  // makeScenario() 자체가 순수 함수임을 확인(같은 입력 -> 같은 구조)
  const a = makeScenario({ ghostUnit: false, students: [{ id: 's-x', assignments: [] }] })
  check('makeScenario — ghostUnit:false 면 유령 유닛이 생성되지 않는다',
    !a.units.some((u) => u.id === a.ghostUnitId))
}

console.log('\n=== 8b절. CLASS_ASSIGNMENT_CONTRADICTION 정정(2026-09-03, 코디네이터 지시) — 컨테이너 반 제외 ===')
{
  // E: 컨테이너 반(class_type=textbook)만 가리키는 SCA — 정상 설계이므로 오탐이 없어야 한다.
  const { findings } = evalFixture(makeCaseContainerOnly())
  check('케이스 E — 컨테이너 반 SCA만 있는 학생은 CLASS_ASSIGNMENT_CONTRADICTION 오탐 없음',
    !hasCode(findings, 'CLASS_ASSIGNMENT_CONTRADICTION', 'synth-stu-e'), JSON.stringify(findings.map((f) => f.code)))
  check('케이스 E — STUDENT_CLASS_IS_CONTAINER 도 발생하지 않는다(students.class_id 는 사람 반)',
    !hasCode(findings, 'STUDENT_CLASS_IS_CONTAINER', 'synth-stu-e'))
}
{
  // F: 진짜 반 이동(옛 사람 반 SCA만 남고 students.class_id 는 새 반) — 정당한 WARN.
  const { findings } = evalFixture(makeCaseClassMoved())
  check('케이스 F — regular 반 이동 학생(일치하는 SCA 없음) → CLASS_ASSIGNMENT_CONTRADICTION WARN',
    hasCode(findings, 'CLASS_ASSIGNMENT_CONTRADICTION', 'synth-stu-f', 'WARN'), JSON.stringify(findings.map((f) => f.code)))
}
{
  // G: students.class_id 자체가 컨테이너를 가리킴 — STUDENT_CLASS_IS_CONTAINER 단일 발생.
  const { findings } = evalFixture(makeCaseStudentClassContainer())
  check('케이스 G — students.class_id 가 컨테이너 → STUDENT_CLASS_IS_CONTAINER WARN',
    hasCode(findings, 'STUDENT_CLASS_IS_CONTAINER', 'synth-stu-g', 'WARN'), JSON.stringify(findings.map((f) => f.code)))
  check('케이스 G — 같은 학생에게 CLASS_ASSIGNMENT_CONTRADICTION 은 동시에 발생하지 않는다(SCA 도 컨테이너만 가리킴)',
    !hasCode(findings, 'CLASS_ASSIGNMENT_CONTRADICTION', 'synth-stu-g'))
}
{
  // class_type 미상(null) 반은 기존처럼(=사람 반으로) 취급된다 — 회귀 방지.
  const fx = syntheticBase() // c1/c2 모두 class_type 필드 없음(undefined)
  fx.classes.push({ id: 'c-other', name: '다른반', spelling_direction: 'kr2en' })
  fx.students[0].class_id = 'c-other'
  const { findings } = evalFixture(fx)
  const finding = findings.find((f) => f.code === 'CLASS_ASSIGNMENT_CONTRADICTION' && f.studentId === 's1')
  check('class_type 미상 반은 컨테이너로 취급되지 않아 여전히 CONTRADICTION 이 발생한다', !!finding)
  check('class_type 미상일 때 detail 에 "class_type 미상" 표기가 붙는다', !!finding && finding.detail.includes('class_type 미상'),
    finding?.detail)
}

console.log('\n=== 9절. loadLearningBaseline / diffLearningBaseline (fetch 모킹, 네트워크 0) ===')
{
  const originalFetch = globalThis.fetch
  const MOCK_COUNTS = {
    word_status: { 's-1': 12, 's-2': 3 },
    student_progress: { 's-1': 1, 's-2': 1 },
    student_daily_progress: { 's-1': 5, 's-2': 0 },
    spelling_review_queue: { 's-1': 0, 's-2': 0 },
    xp_ledger: { 's-1': 8, 's-2': 2 },
    entrance_test_results: { 's-1': 1, 's-2': 0 },
  }
  const MOCK_PROGRESS = {
    's-1': { updated_at: '2026-09-01T00:00:00Z', total_stars: 40 },
    's-2': { updated_at: '2026-08-20T00:00:00Z', total_stars: 5 },
  }
  let headRequests = 0
  globalThis.fetch = async (url, options) => {
    const u = new URL(url)
    const table = u.pathname.split('/').filter(Boolean).pop()
    const studentParam = u.searchParams.get('student_id') || ''
    const sid = studentParam.startsWith('eq.') ? studentParam.slice(3) : null
    if (options?.method === 'HEAD') {
      headRequests++
      const n = MOCK_COUNTS[table]?.[sid] ?? 0
      return { ok: true, status: 200, headers: { get: (k) => (k.toLowerCase() === 'content-range' ? `0-${Math.max(n - 1, 0)}/${n}` : null) } }
    }
    if (table === 'student_progress') {
      const row = MOCK_PROGRESS[sid]
      return { ok: true, status: 200, json: async () => (row ? [row] : []) }
    }
    return { ok: true, status: 200, json: async () => [] }
  }
  try {
    const supaLike = { base: 'https://mock-project.supabase.co', key: 'anon-mock-key' }
    const baseline = await loadLearningBaseline(supaLike, ['s-1', 's-2'])
    check('loadLearningBaseline — HEAD 요청만 보낸다(카운트 조회)', headRequests === 2 * LEARNING_BASELINE_TABLES.length,
      `headRequests=${headRequests}`)
    check('loadLearningBaseline — students 맵에 두 학생 모두 존재', !!baseline.students['s-1'] && !!baseline.students['s-2'])
    check('loadLearningBaseline — 테이블별 카운트가 모킹값과 일치',
      baseline.students['s-1'].counts.word_status === 12 && baseline.students['s-2'].counts.xp_ledger === 2,
      JSON.stringify(baseline.students))
    check('loadLearningBaseline — student_progress 는 updated_at/total_stars 값도 포함',
      baseline.students['s-1'].studentProgress.totalStars === 40 && baseline.students['s-2'].studentProgress.updatedAt === '2026-08-20T00:00:00Z')
    check('loadLearningBaseline — sha256 가 64자 hex', typeof baseline.sha256 === 'string' && /^[0-9a-f]{64}$/.test(baseline.sha256))

    const baselineAgain = await loadLearningBaseline(supaLike, ['s-1', 's-2'])
    check('loadLearningBaseline — 같은 입력이면 sha256 동일(결정론)', baseline.sha256 === baselineAgain.sha256)

    check('diffLearningBaseline — 변화 없는 두 baseline 은 빈 배열', diffLearningBaseline(baseline, baselineAgain).length === 0)

    MOCK_COUNTS.word_status['s-1'] = 13 // 학습기록이 실제로 늘어난 상황 재현
    const baselineAfter = await loadLearningBaseline(supaLike, ['s-1', 's-2'])
    const changes = diffLearningBaseline(baseline, baselineAfter)
    check('diffLearningBaseline — word_status 카운트 변화를 감지', changes.some((c) => c.studentId === 's-1' && c.field === 'counts.word_status' && c.before === 12 && c.after === 13),
      JSON.stringify(changes))

    const baselineMissing = { students: { 's-1': baseline.students['s-1'] } } // s-2 빠짐
    const presenceChanges = diffLearningBaseline(baseline, baselineMissing)
    check('diffLearningBaseline — 학생이 사라지면 _presence 변화로 잡힌다',
      presenceChanges.some((c) => c.studentId === 's-2' && c.field === '_presence' && c.after === 'missing'))
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\n=== 10절. UX 출력 — 마스킹/--show-names/Safe to continue ===')
{
  const res = runCli(['--fixture', beforeFixtureFile, '--report-dir', reportDir])
  check('기본 출력 — 학생 실명이 노출되지 않는다', !res.stdout.includes('StudentA') && !res.stdout.includes('StudentB'),
    res.stdout.slice(0, 400))
  check('기본 출력 — 마스킹 패턴(첫글자 + ***)이 보인다', /S\*\*\*/.test(res.stdout))
  check('FAIL 이 있는 픽스처는 "Safe to continue: NO" 를 출력한다', /Safe to continue: NO/.test(res.stdout))
}
{
  const res = runCli(['--fixture', beforeFixtureFile, '--show-names', '--report-dir', reportDir])
  check('--show-names — 학생 실명이 그대로 노출된다', res.stdout.includes('StudentA') || res.stdout.includes('StudentB'),
    res.stdout.slice(0, 400))
}
{
  const res = runCli(['--fixture', afterFixtureFile, '--report-dir', reportDir])
  check('FAIL 이 없는(after) 픽스처는 "Safe to continue: YES" 를 출력한다', /Safe to continue: YES/.test(res.stdout))
}
{
  // 같은 코드가 5건 넘게 쌓이면 5개까지만 나열하고 "외 n건"을 보여준다
  const N = 7
  const many = { classes: [{ id: 'c1', name: '반1', spelling_direction: 'kr2en' }],
    textbooks: [{ id: 'tb1', name: '교재1', owner_class_id: null }],
    units: [], words: [], students: [], assignments: [] }
  for (let i = 0; i < N; i++) {
    const uid = `u${i}`
    const sid = `s${i}`
    many.units.push({ id: uid, name: `Unit${i + 1}`, textbook_id: 'tb1' })
    many.words.push({ id: `${uid}-w0`, unit_id: uid, word: 'apple', meaning: '사과' }) // 단어 1개 -> UNIT_WORDS_ABNORMAL(WARN), health WORDS_ZERO 는 회피(1>0)
    many.students.push({ id: sid, name: `합성학생${i}`, class_id: 'c1', current_unit_id: uid, unit_name: `Unit${i + 1}` })
    many.assignments.push({ student_id: sid, class_id: 'c1', textbook_id: 'tb1', is_primary: true, current_unit_id: uid })
  }
  const manyFixtureFile = path.join(TMP_DIR, 'testProdCheck.many.fixture.json')
  fs.writeFileSync(manyFixtureFile, JSON.stringify({ data: many }), 'utf8')
  const res = runCli(['--fixture', manyFixtureFile, '--report-dir', reportDir])
  check('7건 동일 코드(UNIT_WORDS_ABNORMAL) — "외 2건" 요약이 출력된다', /외 2건/.test(res.stdout), res.stdout)
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
