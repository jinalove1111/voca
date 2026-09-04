// 계정 분류 정책 회귀 (2026-09-04, Track E/F, wt-rules)
//
// 네트워크 0 — 전부 픽스처. classifyAccount(scripts/lib/studentHealthRules.mjs)
// 의 판정 규칙(REAL/TEST/ARCHIVED/QA_FIXTURE)을 픽스처로 고정하고, 그
// 판정이 실제로 studentHealthCheck.mjs 의 "FAIL 집계 대상"에서 비-REAL을
// 제외하는지, 그리고 TEST_ACCOUNT_NAMES 목록이 src/utils/accountStatus.js
// 와 정확히 같은지를 확인한다.
//
// 왜 필요한가: 2026-08-11 사고(고1 능률 민병천 반 입실시험 분모 오류)의
// 근본 원인이 "테스트 계정 판별이 여러 파일에 서로 다른 사본으로
// 하드코딩돼 있었던 것"이었다(src/utils/accountStatus.js 헤더 주석 참고).
// scripts/lib/studentHealthRules.mjs 의 TEST_ACCOUNT_NAMES 는 그 사본을
// 또 하나 늘린 것이라(파일 소유권 문제로 import 대신 값 복제, 같은 파일
// 34행 주석 "src/utils/accountStatus.js TEST_ACCOUNT_NAMES 와 동일해야
// 한다" 참고) 드리프트 위험이 구조적으로 존재한다 — 이 파일이 그 드리프트
// 를 회귀로 잡는다.
//
// 실행: node scripts/testAccountClassification.mjs (npm run verify:account-classification)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildContext, classifyAccount, evaluateStudent, summarize, TEST_ACCOUNT_NAMES as RULES_TEST_NAMES } from './lib/studentHealthRules.mjs'
import { TEST_ACCOUNT_NAMES as ACCOUNT_STATUS_TEST_NAMES } from '../src/utils/accountStatus.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}

// ── 공용 픽스처 ────────────────────────────────────────────────────────
const baseData = () => ({
  classes: [{ id: 'c1', name: '반1', spelling_direction: 'kr2en' }],
  textbooks: [], units: [], words: [], assignments: [],
  students: [],
})
const withStudents = (students, extraClasses = []) => {
  const d = baseData()
  d.classes.push(...extraClasses)
  d.students = students
  return d
}

console.log('\n=== 1절. 모듈 계약 ===')
check('classifyAccount / buildContext / evaluateStudent / summarize 가 export된 함수다',
  [classifyAccount, buildContext, evaluateStudent, summarize].every((f) => typeof f === 'function'))
check('TEST_ACCOUNT_NAMES 는 4개 배열이다', Array.isArray(RULES_TEST_NAMES) && RULES_TEST_NAMES.length === 4,
  JSON.stringify(RULES_TEST_NAMES))

console.log('\n=== 2절. TEST — Paul/Cookie/Jinaa/Barry (대소문자 무관) ===')
{
  const variants = ['Paul', 'PAUL', 'paul', 'Cookie', 'COOKIE', 'cookie',
    'Jinaa', 'JINAA', 'jinaa', 'Barry', 'BARRY', 'barry']
  const d = withStudents(variants.map((name, i) => ({ id: `s${i}`, name, class_id: 'c1' })))
  const ctx = buildContext(d)
  for (const s of d.students) {
    check(`classifyAccount("${s.name}") === TEST`, classifyAccount(s, ctx) === 'TEST', classifyAccount(s, ctx))
  }
}
{
  // 앞뒤 공백이 있어도 TEST — norm() 이 trim 하므로.
  const d = withStudents([{ id: 's1', name: '  Paul  ', class_id: 'c1' }])
  const ctx = buildContext(d)
  check('앞뒤 공백이 있는 "  Paul  "도 TEST로 분류된다', classifyAccount(d.students[0], ctx) === 'TEST')
}

console.log('\n=== 3절. QA_FIXTURE — 소속 반 이름이 QA_ 로 시작 ===')
{
  const d = withStudents(
    [{ id: 's1', name: 'Cksa', class_id: 'c-qa' }, { id: 's2', name: 'QACombo1', class_id: 'c-qa' }],
    [{ id: 'c-qa', name: 'QA_Combo테스트반', spelling_direction: 'kr2en' }],
  )
  const ctx = buildContext(d)
  check('평범한 이름("Cksa") + QA_ 반 → QA_FIXTURE', classifyAccount(d.students[0], ctx) === 'QA_FIXTURE',
    classifyAccount(d.students[0], ctx))
  check('"QACombo1"(이름이 QA_ 접두는 아님, "_" 없이 바로 시작하지 않음) + QA_ 반 → QA_FIXTURE',
    classifyAccount(d.students[1], ctx) === 'QA_FIXTURE', classifyAccount(d.students[1], ctx))
}
{
  // 대조: 이름 자체가 qa_/_qa_ 로 시작하면 반과 무관하게 TEST 가 먼저 이긴다
  // (classifyAccount 의 우선순위 — 이름 규칙이 반 규칙보다 먼저 평가됨).
  const d = withStudents([{ id: 's1', name: 'qa_학생1', class_id: 'c1' }])
  const ctx = buildContext(d)
  check('이름이 "qa_"로 시작하면 QA_FIXTURE 가 아니라 TEST(이름 규칙이 우선)',
    classifyAccount(d.students[0], ctx) === 'TEST', classifyAccount(d.students[0], ctx))
}

console.log('\n=== 4절. ARCHIVED — _dup / _inactive / Paul_DUP_* ===')
{
  const names = ['학생A_dup', '학생B_DUP', '학생C_inactive', '학생D_INACTIVE', 'Paul_DUP_1', 'Paul_DUP_2']
  const d = withStudents(names.map((name, i) => ({ id: `s${i}`, name, class_id: 'c1' })))
  const ctx = buildContext(d)
  for (const s of d.students) {
    check(`classifyAccount("${s.name}") === ARCHIVED`, classifyAccount(s, ctx) === 'ARCHIVED', classifyAccount(s, ctx))
  }
}
{
  // ARCHIVED 규칙이 TEST 이름 규칙보다 먼저 평가된다 — "Paul_DUP_2"는 이름에
  // "paul"을 포함해도 TEST_ACCOUNT_NAMES 정확 일치가 아니라 ARCHIVED 정규식이
  // 먼저 걸린다(classifyAccount 소스 순서: _dup/_inactive 검사가 최상단).
  const d = withStudents([{ id: 's1', name: 'Paul_DUP_2', class_id: 'c1' }])
  const ctx = buildContext(d)
  check('"Paul_DUP_2"는 TEST 이름과 부분 일치해도 ARCHIVED로 분류된다(정확 일치가 아니므로 TEST 조건 자체가 성립하지 않고, ARCHIVED 정규식이 먼저 걸림)',
    classifyAccount(d.students[0], ctx) === 'ARCHIVED')
}

console.log('\n=== 5절. REAL — 평범한 이름 + 평범한 반 ===')
{
  const d = withStudents([{ id: 's1', name: '김민준', class_id: 'c1' }])
  const ctx = buildContext(d)
  check('평범한 이름 + 평범한 반 → REAL', classifyAccount(d.students[0], ctx) === 'REAL')
}
{
  // 반이 아예 없어도(class_id null) 이름/반 규칙에 안 걸리면 REAL이다
  // (STUDENT_NO_CLASS 같은 다른 검사의 몫이지, 계정 "종류" 자체는 REAL).
  const d = withStudents([{ id: 's1', name: '이서연', class_id: null }])
  const ctx = buildContext(d)
  check('class_id 가 없어도 이름이 평범하면 REAL', classifyAccount(d.students[0], ctx) === 'REAL')
}

console.log('\n=== 6절. health FAIL 집계가 비-REAL 을 제외한다 ===')
{
  // scripts/studentHealthCheck.mjs 146-159행의 대상 선정 로직을 그대로
  // 재현한다(그 파일은 top-level 스크립트라 import 하면 즉시 라이브 fetch를
  // 시도해 네트워크 0 원칙이 깨진다 — 그래서 CLI를 spawn 하지 않고, 그
  // 필터링 로직 자체를 여기서 동일하게 재현해 단언한다):
  //   targets = data.students.filter(s => classifyAccount(s, ctx) === 'REAL')
  //   (INCLUDE_ALL/--name 미지정 시의 기본 경로)
  // 정상 배정 체인(교재/유닛/단어)은 4명 모두 동일하게 갖춘다 — 차이는
  // class_id 하나뿐이어야 FAIL 원인이 CLASS_INVALID(orphan) 하나로 고정된다
  // (assignments 를 아예 안 주면 primary_assignment_exists 자체가 별개의
  // 코드로 전원 FAIL 해버려 이 절의 의도(REAL만 집계)를 검증할 수 없다).
  const chainFor = (sid) => ({ student_id: sid, class_id: 'c1', textbook_id: 'tb-1', is_primary: true, current_unit_id: 'u-1' })
  const d = {
    classes: [{ id: 'c1', name: '반1', spelling_direction: 'kr2en' }],
    textbooks: [{ id: 'tb-1', name: '교재1', owner_class_id: null }],
    units: [{ id: 'u-1', name: 'Unit1', textbook_id: 'tb-1' }],
    words: [{ id: 'w1', unit_id: 'u-1' }, { id: 'w2', unit_id: 'u-1' }, { id: 'w3', unit_id: 'u-1' }],
    assignments: ['s-real-fail', 's-real-pass', 's-test-fail', 's-archived-fail'].map(chainFor),
    students: [
      { id: 's-real-fail', name: '김민준', class_id: 'c-missing', current_unit_id: 'u-1' }, // CLASS_INVALID(orphan) → FAIL
      { id: 's-real-pass', name: '이서연', class_id: 'c1', current_unit_id: 'u-1' }, // 정상
      { id: 's-test-fail', name: 'Paul', class_id: 'c-missing', current_unit_id: 'u-1' }, // TEST — 홈 반이 깨져도 집계 제외 대상
      { id: 's-archived-fail', name: '학생_dup', class_id: 'c-missing', current_unit_id: 'u-1' }, // ARCHIVED — 집계 제외 대상
    ],
  }
  const ctx = buildContext(d)

  const targets = d.students.filter((s) => classifyAccount(s, ctx) === 'REAL')
  check('REAL 필터 — 실학생 2명만 대상(TEST/ARCHIVED 제외)', targets.length === 2,
    JSON.stringify(targets.map((s) => s.name)))

  const results = targets.map((s) => evaluateStudent(s, ctx))
  const sum = summarize(results)
  check('REAL 만 대상으로 한 summarize — FAIL 1명(김민준, class_id orphan)만 집계된다',
    sum.fail === 1 && sum.total === 2, JSON.stringify(sum))

  // 반증: --all 경로(INCLUDE_ALL)처럼 전체를 넘기면 TEST/ARCHIVED 의 깨진
  // 홈 반도 FAIL로 잡힌다 — 즉 "제외"는 대상 선정 단계의 필터 때문이지
  // evaluateStudent 자체가 계정 종류를 봐서 봐주는 게 아니다(그렇게
  // 오해하면 다음 세션이 "ARCHIVED는 evaluateStudent 내부에서 안전하다"고
  // 잘못 일반화할 위험이 있어 명시적으로 반증해 둔다).
  const allResults = d.students.map((s) => evaluateStudent(s, ctx))
  const allSum = summarize(allResults)
  check('전체(--all 상당) 대상 — TEST/ARCHIVED 의 깨진 홈 반도 FAIL로 잡힌다(evaluateStudent 자체는 계정 종류를 안 봄)',
    allSum.fail === 3, JSON.stringify(allSum))
}

console.log('\n=== 7절. TEST_ACCOUNT_NAMES 정적 동일성 — studentHealthRules.mjs vs accountStatus.js ===')
{
  check('두 목록의 길이가 같다', RULES_TEST_NAMES.length === ACCOUNT_STATUS_TEST_NAMES.length,
    `rules=${JSON.stringify(RULES_TEST_NAMES)} accountStatus=${JSON.stringify(ACCOUNT_STATUS_TEST_NAMES)}`)
  check('두 목록이 원소까지 완전히 동일하다(정렬 후 비교 — 순서 무관 동일성)',
    JSON.stringify([...RULES_TEST_NAMES].sort()) === JSON.stringify([...ACCOUNT_STATUS_TEST_NAMES].sort()),
    `rules=${JSON.stringify(RULES_TEST_NAMES)} accountStatus=${JSON.stringify(ACCOUNT_STATUS_TEST_NAMES)}`)
}
{
  // 소스 레벨에서도 "동일해야 한다"는 상호 참조 주석이 양쪽에 실제로
  // 남아있는지 확인한다(드리프트 발생 시 다음 세션이 "왜 두 곳에 있나"를
  // 코드만 보고도 알 수 있어야 하므로 — 주석이 사라지면 이 회귀 테스트의
  // 존재 이유도 같이 흐려진다).
  const rulesSrc = fs.readFileSync(path.join(ROOT, 'scripts/lib/studentHealthRules.mjs'), 'utf8')
  const accountStatusSrc = fs.readFileSync(path.join(ROOT, 'src/utils/accountStatus.js'), 'utf8')
  check('studentHealthRules.mjs 에 accountStatus.js 상호 참조 주석이 있다',
    /accountStatus\.js[\s\S]{0,40}TEST_ACCOUNT_NAMES/.test(rulesSrc))
  check('accountStatus.js 도 자기 목적(테스트/QA 계정 판별) 헤더 주석을 유지한다',
    /테스트\s*\/\s*QA\s*계정/.test(accountStatusSrc) || /테스트\/QA\s*계정/.test(accountStatusSrc))
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
