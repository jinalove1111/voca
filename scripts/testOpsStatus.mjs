// Ops Status / Report — 회귀 테스트 (2026-09-04, Track D)
//
// 네트워크 0 — 전부 합성 픽스처로 돈다. scripts/prodReport.mjs CLI를
// spawnSync(--from-dir)로 실행하는 절만 예외적으로 프로세스를 띄우지만,
// --from-dir 모드는 gh/fetch를 구조적으로 생략한다(prodReport.mjs 참고).
//
// FAIL-first: scripts/lib/opsStatus.mjs / scripts/prodReport.mjs가 없던
// 시점에는 이 파일의 import 문 자체가 에러라 전부 FAIL했다(CLAUDE.md 규칙 15).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  STATUS, worstStatus, severityToStatus, assertFinding,
  recommendedActionFor, writeRequiredFor, approvalRequiredFor,
  fromProdCheckReport, fromHealthReport, renderSummary, HEALTH_ONLY_CODES,
} from './lib/opsStatus.mjs'
import { INVARIANT_CODES } from './lib/prodInvariants.mjs'
import { SECTION_TITLES } from './prodReport.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}

console.log('\n=== 1절. STATUS enum / worstStatus / severityToStatus ===')
check('STATUS === [PASS,WARN,FAIL,BLOCKED_NEEDS_APPROVAL] (순서 고정)',
  JSON.stringify(STATUS) === JSON.stringify(['PASS', 'WARN', 'FAIL', 'BLOCKED_NEEDS_APPROVAL']), JSON.stringify(STATUS))
check('worstStatus([]) === PASS', worstStatus([]) === 'PASS')
check('worstStatus 무효값만 있으면 PASS', worstStatus(['NOPE', undefined, null]) === 'PASS')
check('worstStatus([PASS]) === PASS', worstStatus(['PASS']) === 'PASS')
check('worstStatus([PASS,WARN]) === WARN', worstStatus(['PASS', 'WARN']) === 'WARN')
check('worstStatus([WARN,FAIL]) === FAIL', worstStatus(['WARN', 'FAIL']) === 'FAIL')
check('worstStatus([FAIL,BLOCKED_NEEDS_APPROVAL]) === BLOCKED_NEEDS_APPROVAL',
  worstStatus(['FAIL', 'BLOCKED_NEEDS_APPROVAL']) === 'BLOCKED_NEEDS_APPROVAL')
check('worstStatus 순서 무관(BLOCKED가 먼저 와도 동일)',
  worstStatus(['BLOCKED_NEEDS_APPROVAL', 'PASS']) === 'BLOCKED_NEEDS_APPROVAL')
check('severityToStatus(FAIL) === FAIL', severityToStatus('FAIL') === 'FAIL')
check('severityToStatus(WARN) === WARN', severityToStatus('WARN') === 'WARN')
check('severityToStatus(PASS) === PASS', severityToStatus('PASS') === 'PASS')
check('severityToStatus(미상값) === WARN(조용한 PASS 금지, 규칙 18)', severityToStatus('???') === 'WARN')
check('severityToStatus(undefined) === WARN', severityToStatus(undefined) === 'WARN')

console.log('\n=== 2절. assertFinding — 유효/누락 필드 ===')
const VALID_FINDING = {
  check_id: 'invariant:STUDENT_UNIT_ORPHAN', timestamp: '2026-01-01T00:00:00.000Z',
  environment: 'production', entity_type: 'student', entity_id: 's1', entity_label: 'H***',
  expected: '정상', actual: '문제', severity: 'FAIL', status: 'FAIL',
  recommended_action: '운영자 결정', write_required: true, approval_required: true, source: 'prod:check',
}
check('유효한 finding — ok:true, errors:[]', assertFinding(VALID_FINDING).ok === true
  && assertFinding(VALID_FINDING).errors.length === 0, JSON.stringify(assertFinding(VALID_FINDING)))
check('null — ok:false', assertFinding(null).ok === false)
for (const key of Object.keys(VALID_FINDING)) {
  const broken = { ...VALID_FINDING }
  delete broken[key]
  const res = assertFinding(broken)
  check(`필드 누락(${key}) — ok:false`, res.ok === false, JSON.stringify(res))
}
check('environment 잘못된 값 — ok:false', assertFinding({ ...VALID_FINDING, environment: 'staging' }).ok === false)
check('entity_type 잘못된 값 — ok:false', assertFinding({ ...VALID_FINDING, entity_type: 'teacher' }).ok === false)
check('status 잘못된 값 — ok:false', assertFinding({ ...VALID_FINDING, status: 'OK' }).ok === false)
check('entity_id: null은 허용(키만 있으면 됨)', assertFinding({ ...VALID_FINDING, entity_id: null }).ok === true)

console.log('\n=== 3절. recommendedActionFor / writeRequiredFor / approvalRequiredFor — 전 코드 커버리지 ===')
const UNKNOWN_ACTION = '확인 필요'
for (const code of Object.values(INVARIANT_CODES)) {
  check(`invariant ${code} — recommendedActionFor 가 unknown 폴백이 아니다`,
    recommendedActionFor(code) !== UNKNOWN_ACTION, recommendedActionFor(code))
  check(`invariant ${code} — writeRequiredFor/approvalRequiredFor 는 boolean이고 서로 같다`,
    typeof writeRequiredFor(code) === 'boolean' && writeRequiredFor(code) === approvalRequiredFor(code))
}
for (const code of HEALTH_ONLY_CODES) {
  check(`health ${code} — recommendedActionFor 가 unknown 폴백이 아니다`,
    recommendedActionFor(code) !== UNKNOWN_ACTION, recommendedActionFor(code))
  check(`health ${code} — writeRequiredFor/approvalRequiredFor 는 boolean이고 서로 같다`,
    typeof writeRequiredFor(code) === 'boolean' && writeRequiredFor(code) === approvalRequiredFor(code))
}
check('recommendedActionFor(미상 코드) === unknown 폴백', recommendedActionFor('NOT_A_REAL_CODE') === UNKNOWN_ACTION)
check('recommendedActionFor(null) === unknown 폴백', recommendedActionFor(null) === UNKNOWN_ACTION)
check('writeRequiredFor(미상 코드) === true(보수적 기본값, 조용한 false 금지)', writeRequiredFor('NOT_A_REAL_CODE') === true)
check('writeRequiredFor(READ-ONLY 조사 코드, 예: UNIT_WORDS_ABNORMAL) === false',
  writeRequiredFor('UNIT_WORDS_ABNORMAL') === false)
check('writeRequiredFor(운영자 결정 코드, 예: STUDENT_GHOST_UNIT) === true',
  writeRequiredFor('STUDENT_GHOST_UNIT') === true)
check('writeRequiredFor(DIRECTION_RANDOM) === false(display-only)', writeRequiredFor('DIRECTION_RANDOM') === false)

console.log('\n=== 4절. fromProdCheckReport — 합성 prodCheck.json 픽스처 ===')
const TS = '2026-09-04T00:00:00.000Z'
const synthProdCheck = {
  runAt: TS, runId: '20260904000000-abcd',
  env: { host: 'xyz.supabase.co', projectRef: 'xyz', source: 'live' },
  verdict: 'FAIL',
  health: {
    summary: { total: 2, pass: 0, warn: 1, fail: 1, byCode: { WORDS_ZERO: 1 }, ok: false },
    results: [
      {
        studentId: 's1', name: 'H***', accountType: 'REAL', status: 'FAIL',
        codes: ['WORDS_ZERO:단어0개'], warnings: [], checks: [],
        resolved: { homeClassName: '반1', textbookName: '교재1', unitName: '유닛1', wordCount: 0, direction: 'kr2en' },
      },
      {
        studentId: 's2', name: 'K***', accountType: 'REAL', status: 'WARN',
        codes: [], warnings: ['DIRECTION_RANDOM:반1 — 총량 균형 미보장'], checks: [],
        resolved: { homeClassName: '반1', textbookName: '교재1', unitName: '유닛2', wordCount: 20, direction: 'random' },
      },
    ],
  },
  invariants: {
    summary: { fail: 1, warn: 2, pass: 0, checked: 2 },
    findings: [
      {
        code: 'STUDENT_UNIT_ORPHAN', severity: 'FAIL', studentId: 's3', studentName: 'L***',
        detail: 'students.current_unit_id(u-x)가 units에 존재하지 않음', refs: { unitId: 'u-x' },
        impact: '학습 화면 진입 실패 가능', recommended: '운영자 결정',
      },
      {
        code: 'TEXTBOOK_NAME_DUPLICATE', severity: 'WARN', studentId: null, studentName: null,
        detail: '교재명 동일 2개', refs: { textbookIds: ['tb-a', 'tb-b'], normalizedName: '교재1' },
        impact: '관리자 화면 혼동', recommended: 'READ-ONLY 조사',
      },
      {
        code: 'UNIT_TEXTBOOK_CONTAINER_MISMATCH', severity: 'WARN', studentId: null, studentName: null,
        detail: '컨테이너 소속 유닛 교재 불일치', refs: { unitId: 'u-y' },
        impact: '전환 시 다른 교재 섞임', recommended: '운영자 결정',
      },
    ],
  },
  ux: { criticalCount: 1, needsReviewCount: 2, dataDebtCount: 0 },
  baseline: null, dbWrite: 0,
}
const prodFindings = fromProdCheckReport(synthProdCheck, { environment: 'ci', timestamp: TS })
check('fromProdCheckReport — 5건(health FAIL 1 + WARN 1 + invariants 3)', prodFindings.length === 5, String(prodFindings.length))
check('전부 assertFinding 통과', prodFindings.every((f) => assertFinding(f).ok),
  JSON.stringify(prodFindings.map((f) => assertFinding(f))))
check('health WORDS_ZERO — entity_type student, status FAIL, source prod:check',
  prodFindings.some((f) => f.check_id === 'health:WORDS_ZERO' && f.entity_type === 'student'
    && f.status === 'FAIL' && f.source === 'prod:check' && f.entity_label === 'H***'))
check('health DIRECTION_RANDOM — status WARN, write_required=false',
  prodFindings.some((f) => f.check_id === 'health:DIRECTION_RANDOM' && f.status === 'WARN' && f.write_required === false))
check('invariant STUDENT_UNIT_ORPHAN — entity_type student(studentId 우선), status FAIL',
  prodFindings.some((f) => f.check_id === 'invariant:STUDENT_UNIT_ORPHAN' && f.entity_type === 'student' && f.status === 'FAIL'))
check('invariant TEXTBOOK_NAME_DUPLICATE — entity_type textbook(studentId 없음), write_required=false(READ-ONLY 조사)',
  prodFindings.some((f) => f.check_id === 'invariant:TEXTBOOK_NAME_DUPLICATE' && f.entity_type === 'textbook' && f.write_required === false))
check('invariant UNIT_TEXTBOOK_CONTAINER_MISMATCH — entity_type unit, write_required=true',
  prodFindings.some((f) => f.check_id === 'invariant:UNIT_TEXTBOOK_CONTAINER_MISMATCH' && f.entity_type === 'unit' && f.write_required === true))
check('environment/timestamp 옵션이 전 finding에 반영된다',
  prodFindings.every((f) => f.environment === 'ci' && f.timestamp === TS))

console.log('\n=== 5절. fromHealthReport — 합성 studentHealthCheck.json 픽스처(ghostUnits 포함) ===')
const synthHealth = {
  ok: false, summary: { total: 1, pass: 0, warn: 0, fail: 1, byCode: { GHOST_UNIT: 1 }, ok: false },
  excluded: { ARCHIVED: 2, TEST: 4, QA_FIXTURE: 1 },
  ghostUnits: [{ id: 'gu1', name: 'Unit', textbookId: 'tb1', wordCount: 1, reason: '이름이 번호 없는 유닛 별칭("Unit")' }],
  pinChecked: false, fetchMs: 10, totalMs: 12,
  students: [
    {
      studentId: 's4', name: 'M***', accountType: 'REAL', status: 'FAIL',
      codes: ['GHOST_UNIT:이름이 번호 없는 유닛 별칭("Unit")'], warnings: [], checks: [],
      resolved: { homeClassName: '반2', textbookName: '교재2', unitName: 'Unit', wordCount: 1, direction: 'kr2en' },
    },
  ],
}
const healthFindings = fromHealthReport(synthHealth, { environment: 'ci', timestamp: TS })
check('fromHealthReport — 2건(학생 GHOST_UNIT FAIL 1 + ghostUnits 인벤토리 1)', healthFindings.length === 2, String(healthFindings.length))
check('전부 assertFinding 통과', healthFindings.every((f) => assertFinding(f).ok))
check('학생 GHOST_UNIT — source health, entity_type student', healthFindings.some((f) =>
  f.check_id === 'health:GHOST_UNIT' && f.source === 'health' && f.entity_type === 'student' && f.entity_label === 'M***'))
check('ghostUnits — invariant:GHOST_UNIT_PRESENT, entity_type unit, entity_label=유닛명(PII 아님), source health',
  healthFindings.some((f) => f.check_id === `invariant:${INVARIANT_CODES.GHOST_UNIT_PRESENT}`
    && f.entity_type === 'unit' && f.entity_label === 'Unit' && f.source === 'health'))

console.log('\n=== 6절. renderSummary ===')
const summaryText = renderSummary(prodFindings)
check('renderSummary — 카운트 라인 포함', /PASS \d+ · WARN \d+ · FAIL \d+/.test(summaryText), summaryText.slice(0, 200))
check('renderSummary — Approval queue 섹션 포함', summaryText.includes('Approval queue'))
check('renderSummary — approval_required 항목이 큐에 실제로 나열된다(STUDENT_UNIT_ORPHAN)',
  summaryText.includes('invariant:STUDENT_UNIT_ORPHAN'))
check('renderSummary([]) — 빈 입력도 안전(없음 표시)', /없음/.test(renderSummary([])))

console.log('\n=== 7절. prodReport.mjs CLI(--from-dir, 네트워크 0) ===')
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp', 'testOpsStatus.fromdir')
fs.mkdirSync(TMP_DIR, { recursive: true })
fs.writeFileSync(path.join(TMP_DIR, 'prodcheck.json'), JSON.stringify(synthProdCheck), 'utf8')
// health.json 최상위에 "unmasked decoy" 필드를 심어 리포트 생성기가 입력
// 객체를 통째로 dump하지 않는지(마스킹 우회 경로가 새로 생기지 않는지)
// 검증한다 — 실제 studentHealthCheck.mjs --json 출력에는 없는 필드다.
const synthHealthWithDecoy = { ...synthHealth, unmaskedDecoyName: '정말진짜학생이름아무개' }
fs.writeFileSync(path.join(TMP_DIR, 'health.json'), JSON.stringify(synthHealthWithDecoy), 'utf8')
fs.writeFileSync(path.join(TMP_DIR, 'security-regressions.txt'),
  '  KNOWN api/grant-xp.js 레거시 XP 분기 인증부재\n  PASS 뭔가\n  KNOWN anon DELETE student_class_assignments(phantom)\n', 'utf8')

const cliRes = spawnSync(process.execPath, [path.join(ROOT, 'scripts/prodReport.mjs'), '--from-dir', TMP_DIR],
  { cwd: ROOT, encoding: 'utf8' })
check('CLI — exit 0', cliRes.status === 0, `status=${cliRes.status} stderr=${cliRes.stderr}`)
check('CLI stdout — DB WRITE: 0', /DB WRITE: 0/.test(cliRes.stdout))

const mdPath = path.join(ROOT, 'docs', 'qa', 'ops-report', 'ops-report-latest.md')
const jsonPath = path.join(ROOT, 'docs', 'qa', 'ops-report', 'ops-report-latest.json')
check('ops-report-latest.md 생성됨', fs.existsSync(mdPath))
check('ops-report-latest.json 생성됨', fs.existsSync(jsonPath))
const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
const jsonOut = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : null

check('13개 섹션 헤더가 정확한 순서로 전부 등장', (() => {
  let cursor = -1
  for (const title of SECTION_TITLES) {
    const idx = md.indexOf(title)
    if (idx === -1 || idx < cursor) return false
    cursor = idx
  }
  return true
})(), md.slice(0, 300))
check('SECTION_TITLES 길이 === 13', SECTION_TITLES.length === 13, String(SECTION_TITLES.length))

check('마스킹 우회 없음 — decoy 원문(정말진짜학생이름아무개)이 출력에 없다', !md.includes('정말진짜학생이름아무개'))
check('마스킹된 이름은 정상적으로 표시된다(H***)', md.includes('H***'))
check('security KNOWN 2건이 반영된다', md.includes('레거시 XP 분기 인증부재') && md.includes('anon DELETE student_class_assignments'))
check('Garden 절에 WORLD_STAGES minPoints 값이 보인다(garden=0 포함)', md.includes('garden=0'))
check('DB WRITE: 0 푸터', md.includes('DB WRITE: 0'))
check('JSON 산출물 — dbWrite:0', jsonOut?.dbWrite === 0)
check('JSON 산출물 — findings 배열이 전부 assertFinding 통과', Array.isArray(jsonOut?.findings) && jsonOut.findings.every((f) => assertFinding(f).ok))

const historyFiles = fs.existsSync(path.join(ROOT, 'docs', 'qa', 'ops-report', 'history'))
  ? fs.readdirSync(path.join(ROOT, 'docs', 'qa', 'ops-report', 'history'))
  : []
check('history 디렉토리에 dated copy(.md/.json) 존재', historyFiles.some((f) => f.endsWith('.md')) && historyFiles.some((f) => f.endsWith('.json')))

console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
