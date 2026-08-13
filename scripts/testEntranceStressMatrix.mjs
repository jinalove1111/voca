// 입실시험 조합 스트레스 매트릭스 (2026-08-14, P4) — 결정론적 100+ 시나리오
//
// mock/fixture 전용(라이브 DB 무접촉, 학생 데이터 생성/변경 0). 순수 모듈
// (entranceEligibility/entranceTestSelection/accountStatus/entranceTest)을
// 조합 축으로 돌려 실전에서 마주칠 상태 공간을 기계적으로 훑는다:
//   학생 수      × 1/5/8/12/20
//   시험 수      × 0/1/2(동시)/종료 후 신규
//   교재 배정     × 1개/2개/3개/반 기본+개인
//   계정 오염     × 테스트 계정/아카이브/중복 이름/동일 영어 이름
//   세션 상태     × 새 로그인(fresh)/stale(배정 직후 미반영 상황)
// 각 셀에서 검증: 대상 학생 수 / 선택 시험 / 유닛 / 단어 수 / 중복 제출 /
// 점수·랭킹 / 다른 학생 비오염.
import {
  entranceScopeClassIds, isInEntranceScope, isArchivedOrFixtureStudentName,
} from '../src/utils/entranceEligibility.js'
import { isTestAccountStudent, isRealStudentAccount } from '../src/utils/accountStatus.js'
import { selectEntranceTest, TIER } from '../src/utils/entranceTestSelection.js'
import { buildEntranceQuestions, computeTestResult, rankResults, bestResultPerStudent } from '../src/utils/entranceTest.js'

let failures = 0
let scenarios = 0
let assertions = 0
const failedScenarios = []
function check(scenario, label, cond, extra) {
  assertions++
  if (!cond) {
    failures++
    if (!failedScenarios.includes(scenario)) failedScenarios.push(scenario)
    console.log(`  FAIL [${scenario}] ${label}`, extra !== undefined ? JSON.stringify(extra) : '')
  }
}

// ── 결정론 rng ────────────────────────────────────────────────────────
const mkRng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

// ── 조합 축 정의 ──────────────────────────────────────────────────────
const TB = (i) => `tb-${i}`
const CLS_TB = (i) => `clstb-${i}` // 교재 컨테이너 반
const PEOPLE = 'cls-people'
const OWNER = {}
for (let i = 0; i < 4; i++) OWNER[CLS_TB(i)] = TB(i)
const resolveOwner = (tbId) => Object.keys(OWNER).find((c) => OWNER[c] === tbId) || null
const UNITS = {}
for (let i = 0; i < 4; i++) UNITS[TB(i)] = `unit-${i}`

const mkStudent = (idx, opts = {}) => ({
  id: `uuid-s${String(idx).padStart(3, '0')}`,
  name: opts.name || `학생${idx}`,
  classId: PEOPLE,
  assignments: (opts.textbooks || [0]).map((t) => ({ classId: CLS_TB(t), textbookId: TB(t) })),
  ...opts,
})
const mkTest = (id, tbIdx, createdAt, status = 'active') => ({
  id, classId: CLS_TB(tbIdx), status, createdAt,
  questionCount: 10, timeLimitSeconds: 600,
  words: Array.from({ length: 40 }, (_, i) => ({ word: `${TB(tbIdx)}-w${i}`, meaning: `뜻${i}` })),
  __unitId: UNITS[TB(tbIdx)],
})
const baseCtx = (s, { stale = false, staleAssignments = null } = {}) => {
  // stale = 배정 직후 캐시 미반영 상황을 흉내: staleAssignments(이전 배정)로 scope 계산
  const assignments = stale && staleAssignments ? staleAssignments : s.assignments
  return {
    assignments,
    scope: entranceScopeClassIds({ primaryClassId: s.classId, assignments, resolveTextbookOwnerClassId: resolveOwner }),
    ctx: {
      currentTextbookId: s.currentTb !== undefined ? TB(s.currentTb) : null,
      currentUnitId: s.currentTb !== undefined ? UNITS[TB(s.currentTb)] : null,
      assignedTextbookIds: assignments.map((a) => a.textbookId).filter(Boolean),
      classDefaultTextbookIds: (s.classDefaults || []).map((t) => TB(t)),
      resolveTestTextbookId: (t) => OWNER[t.classId] || null,
      resolveTestUnitId: (t) => t.__unitId || null,
    },
  }
}

// ── 축 1×2: 학생 수 × 시험 구성 ──────────────────────────────────────
console.log('축 A — 학생 수(1/5/8/12/20) × 시험 구성(1개/2개 동시/종료 후 신규)')
for (const n of [1, 5, 8, 12, 20]) {
  const students = Array.from({ length: n }, (_, i) => mkStudent(i, { textbooks: [0] }))
  // 오염 요소 상시 주입: 테스트 계정 + 아카이브 (같은 교재 배정)
  const barry = mkStudent(900, { name: 'Barry', textbooks: [0] })
  const dup = mkStudent(901, { name: `학생0_DUP2_x_INACTIVE`, textbooks: [0] })
  const everyone = [...students, barry, dup]

  for (const testShape of ['no-test', 'single', 'two-active', 'closed-then-new']) {
    scenarios++
    const S = `A:${n}명:${testShape}`
    const tests = testShape === 'no-test' ? []
      : testShape === 'single' ? [mkTest('t1', 0, '2026-08-14T09:00:00Z')]
      : testShape === 'two-active' ? [mkTest('t1', 0, '2026-08-14T09:00:00Z'), mkTest('t2', 1, '2026-08-14T10:00:00Z')]
      : [mkTest('t-old', 0, '2026-08-14T08:00:00Z', 'closed'), mkTest('t-new', 0, '2026-08-14T09:30:00Z')]

    // 대상 학생 수(관리자 분모와 같은 규칙)
    const eligible = everyone.filter((s) => {
      const { scope } = baseCtx(s)
      return tests.some((t) => isInEntranceScope(scope, t.classId))
    }).filter((s) => !isArchivedOrFixtureStudentName(s.name) && !isTestAccountStudent(s))
    // 시험이 없으면 "시험 대상"도 정의상 0명이다(분모는 시험별 개념).
    const expectedEligible = testShape === 'no-test' ? 0 : n
    check(S, `실학생 대상 수 = ${expectedEligible}(테스트/아카이브 제외)`, eligible.length === expectedEligible, eligible.length)

    // 각 학생의 선택 결과
    for (const s of students.slice(0, Math.min(n, 3))) { // 대표 3명만 상세(결정론 유지)
      const { scope, ctx } = baseCtx(s)
      const mine = tests.filter((t) => scope.includes(t.classId))
      const r = selectEntranceTest({ tests: mine, takenTestIds: [], context: ctx })
      if (testShape === 'no-test') {
        check(S, '시험 0건 -> chosen=null/선택UI 없음/후보 0', r.chosen === null && !r.needsChoice && r.pending.length === 0)
      } else if (testShape === 'single') {
        check(S, '단일 시험 즉시 진입', r.chosen?.id === 't1' && !r.needsChoice)
        check(S, '단어 40개 스냅샷', r.chosen?.words.length === 40)
      } else if (testShape === 'two-active') {
        // 교재 1개 학생 -> 자기 교재 시험만 scope에 있음 -> 즉시 진입
        check(S, '교재 1개 학생은 자기 교재 시험만 보임', r.chosen?.id === 't1' && r.pending.length === 1)
      } else {
        check(S, '종료된 시험은 무시하고 새 시험 진입', r.chosen?.id === 't-new')
        check(S, '이전 시험 데이터가 후보에 없음', r.pending.every((p) => p.test.id !== 't-old'))
      }
    }
  }
}

// ── 축 B: 교재 조합 × 세션 상태 ──────────────────────────────────────
console.log('축 B — 교재 배정(1/2/3개, 반기본+개인) × 세션(fresh/stale)')
for (const tbCount of [1, 2, 3, 4]) {
  for (const withClassDefault of [false, true]) {
    for (const session of ['fresh', 'stale']) {
      scenarios++
      const S = `B:교재${tbCount}:반기본${withClassDefault ? 'O' : 'X'}:${session}`
      const textbooks = Array.from({ length: tbCount }, (_, i) => i)
      const s = mkStudent(1, {
        textbooks, currentTb: tbCount - 1,
        classDefaults: withClassDefault ? [0] : [],
      })
      const tests = textbooks.map((i) => mkTest(`t${i}`, i, `2026-08-14T0${8 + i}:00:00Z`))
      // stale: 마지막 교재 배정이 캐시에 없던 시점 시뮬레이션
      const staleAssignments = s.assignments.slice(0, -1)
      const { scope, ctx } = baseCtx(s, { stale: session === 'stale', staleAssignments })
      const mine = tests.filter((t) => scope.includes(t.classId))
      const r = selectEntranceTest({ tests: mine, takenTestIds: [], context: ctx })

      if (session === 'fresh') {
        // 현재 학습 교재(마지막) 시험이 1순위로 선택돼야 함
        check(S, '현재 학습 교재 시험 선택', r.chosen?.id === `t${tbCount - 1}`)
        check(S, '1순위 판정', r.topTier === TIER.CURRENT_TEXTBOOK_AND_UNIT)
        check(S, `후보 수 = 교재 수(${tbCount})`, r.pending.length === tbCount)
        check(S, '선택 시험의 유닛 일치', r.pending.find((p) => p.test.id === r.chosen.id)?.unitId === UNITS[TB(tbCount - 1)])
      } else {
        // stale: 마지막 배정이 안 보임 -> 그 교재 시험은 scope 밖(=Amin 상황).
        // 계약: 보이는 시험 안에서는 올바르게 동작하고, 마지막 교재 시험이
        // "잘못" 선택되는 일은 없다(안 보일 뿐). fresh 재해석(97차 수정)이
        // 이 상태를 60초 내 해소한다 — 그 회귀는 fresh-scope 테스트가 고정.
        check(S, 'stale scope에 마지막 교재 시험 없음(잘못 선택 아님)', !mine.some((t) => t.id === `t${tbCount - 1}`) || tbCount === 1)
        if (tbCount > 1) {
          check(S, 'stale에서도 보이는 시험은 정상 선택', r.chosen !== null || r.needsChoice || mine.length === 0)
        }
      }
    }
  }
}

// ── 축 C: 계정 오염 조합 ─────────────────────────────────────────────
console.log('축 C — 테스트/아카이브/중복 이름/동일 영어 이름 조합')
{
  const combos = [
    ['barry-real', mkStudent(1, { name: 'Barry' }), false],
    ['jinaa-real', mkStudent(2, { name: 'Jinaa' }), false],
    ['barry-lookalike', mkStudent(3, { name: 'Barry Kim' }), true],
    ['korean-real', mkStudent(4, { name: '권교빈' }), true],
    ['dup-suffix', mkStudent(5, { name: '권교빈_DUP2_ab_INACTIVE' }), false],
    ['qa-prefix', mkStudent(6, { name: 'QA_Fixture' }), false],
    ['same-eng-1', mkStudent(7, { name: 'Nana' }), true],
    ['same-eng-2', mkStudent(8, { name: 'nana' }), true], // 동일 영어 이름 소문자 — 실학생으로 취급(이름 유일성은 UUID가 책임)
    ['is-test-override', { ...mkStudent(9, { name: '권교빈' }), is_test: true }, false],
    ['archived-override', { ...mkStudent(10, { name: 'Nana' }), archived: true }, false],
    ['whitespace-name', mkStudent(11, { name: '  권교빈  ' }), true],
    ['paul-exact', mkStudent(12, { name: 'Paul' }), false],
    ['paul-prefix', mkStudent(13, { name: 'Paula' }), true],
    ['cookie-case', mkStudent(14, { name: 'COOKIE' }), false],
  ]
  for (const [key, s, expectReal] of combos) {
    scenarios++
    const S = `C:${key}`
    const real = isRealStudentAccount(s) && !isArchivedOrFixtureStudentName(s.name)
    check(S, `실학생 판정 = ${expectReal}`, real === expectReal, { name: s.name, real })
    // 어떤 계정이든 응시 자격 자체(eligibility)는 배정 기준 — 이름 무관
    const { scope } = baseCtx(s)
    check(S, '응시 scope는 계정 종류와 무관(배정 기준)', scope.includes(CLS_TB(0)))
  }
}

// ── 축 D: 제출/점수/랭킹 무결성 ──────────────────────────────────────
console.log('축 D — 중복 제출/점수/랭킹 (20명 시뮬레이션)')
{
  scenarios++
  const S = 'D:ranking-20'
  const rng = mkRng(7)
  const test = mkTest('t-rank', 0, '2026-08-14T09:00:00Z')
  const rows = []
  for (let i = 0; i < 20; i++) {
    const qs = buildEntranceQuestions(test.words, { count: 10, direction: 'en2kr', rng })
    const correct = i % 11 // 0~10 다양한 점수
    const answers = qs.map((q, j) => (j < correct ? q.answer : '오답'))
    const r = computeTestResult(qs, answers)
    check(S, `학생${i} 점수 = ${correct}`, r.score === correct)
    rows.push({ studentId: `uuid-s${i}`, testId: 't-rank', score: r.score, total: r.total, durationSeconds: 60 + i, submittedAt: `2026-08-14T09:${String(10 + i).padStart(2, '0')}:00Z` })
    // 중복 제출 시뮬레이션: 같은 학생이 또 제출 -> bestResultPerStudent가 1행으로
    if (i % 5 === 0) rows.push({ ...rows[rows.length - 1], score: Math.max(0, r.score - 1), submittedAt: `2026-08-14T09:40:00Z` })
  }
  const best = bestResultPerStudent(rows)
  check(S, '중복 제출은 학생당 1행으로 수렴', best.length === 20, best.length)
  // 화면 경로(EntranceTest.toRanked)와 동일한 합성: dedup -> 정렬.
  // rankResults 단독은 정렬 전용(중복 제거는 bestResultPerStudent 소관)이라
  // 원시 rows를 직접 넣으면 안 된다 — 그 계약 자체도 아래에서 고정한다.
  const ranked = rankResults(best)
  check(S, '랭킹(합성 경로)도 학생당 1행', ranked.length === 20)
  check(S, 'rankResults 단독은 정렬 전용(중복을 지우지 않음 — 계약 고정)', rankResults(rows).length === rows.length)
  for (let i = 1; i < ranked.length; i++) {
    check(S, `랭킹 정렬 불변식(${i})`, ranked[i - 1].score >= ranked[i].score)
  }
  // 다른 학생 상태 비오염: 한 학생 결과 제거가 남에게 영향 없음
  const without = rankResults(bestResultPerStudent(rows.filter((r) => r.studentId !== 'uuid-s0')))
  check(S, '한 학생 제거해도 다른 학생 점수 불변',
    without.every((r) => ranked.find((x) => x.studentId === r.studentId)?.score === r.score))
}

// ── 축 E: 반 ≠ 교재 원칙(P9) ─────────────────────────────────────────
console.log('축 E — CLASS ≠ TEXTBOOK 원칙(중2가 고1 교재, 반 불변)')
{
  scenarios++
  const S = 'E:class-neq-textbook'
  // 중2 학생이 고1 교재(3번)를 추가 배정 — classId는 PEOPLE 그대로
  const s = mkStudent(1, { textbooks: [0, 3], currentTb: 3 })
  check(S, '교재 추가 배정 후에도 학생 classId 불변', s.classId === PEOPLE)
  const { scope, ctx } = baseCtx(s)
  check(S, '고1 교재 반이 scope에 포함', scope.includes(CLS_TB(3)))
  check(S, '사람 반도 그대로 scope에 포함', scope.includes(PEOPLE))
  const r = selectEntranceTest({
    tests: [mkTest('t-mid2', 0, '2026-08-14T08:00:00Z'), mkTest('t-high1', 3, '2026-08-14T09:00:00Z')],
    takenTestIds: [], context: ctx,
  })
  check(S, '현재 학습(고1) 시험이 선택됨 — 학년으로 차단 안 됨', r.chosen?.id === 't-high1')
  // 같은 반 다른 학생(고1 배정 없음)에게 확산되지 않음
  const mate = mkStudent(2, { textbooks: [0] })
  const mateScope = baseCtx(mate).scope
  check(S, '반 친구에게 고1 시험이 확산되지 않음', !mateScope.includes(CLS_TB(3)))
}

// ── 축 F: 전수 조합 스윕 — 교재 수 × 시험 수 × 기제출 수 × 학습교재 인지 ──
console.log('축 F — 전수 조합 스윕(교재 1~3 × 시험 1~3 × 기제출 0~2 × currentTb O/X)')
for (const tbCount of [1, 2, 3]) {
  for (const testCount of [1, 2, 3]) {
    for (const takenCount of [0, 1, 2]) {
      for (const knowsCurrent of [true, false]) {
        // testCount > tbCount 인 조합은 "미배정 교재(타반) 시험"이 존재하는
        // 상황 — 그 시험은 절대 학생에게 보이면 안 된다(축의 검증 대상).
        const ownTestCount = Math.min(testCount, tbCount)
        if (takenCount > ownTestCount) continue
        scenarios++
        const S = `F:tb${tbCount}:test${testCount}:taken${takenCount}:cur${knowsCurrent ? 'O' : 'X'}`
        const s = mkStudent(1, {
          textbooks: Array.from({ length: tbCount }, (_, i) => i),
          ...(knowsCurrent ? { currentTb: 0 } : {}),
        })
        const tests = Array.from({ length: testCount }, (_, i) => mkTest(`t${i}`, i, `2026-08-14T0${8 + i}:00:00Z`))
        const taken = tests.slice(0, Math.min(takenCount, ownTestCount)).map((t) => t.id)
        const { scope, ctx } = baseCtx(s)
        const mine = tests.filter((t) => scope.includes(t.classId))
        // 불변식 0: 미배정 교재(타반) 시험은 scope에서 걸러진다
        check(S, '미배정 교재 시험은 학생에게 보이지 않음',
          mine.every((t) => tests.indexOf(t) < tbCount) && mine.length === ownTestCount)
        const r = selectEntranceTest({ tests: mine, takenTestIds: taken, context: ctx })
        const remaining = mine.filter((t) => !taken.includes(t.id))

        // 불변식 1: 기제출 시험은 절대 후보가 아니다
        check(S, '기제출 시험 후보 제외', r.pending.every((p) => !taken.includes(p.test.id)))
        // 불변식 2: 후보 수 = 남은 active 시험 수
        check(S, `후보 수 = 남은 시험 수(${remaining.length})`, r.pending.length === remaining.length)
        // 불변식 3: 남은 게 없으면 chosen=null(결과 화면), 있으면 chosen 또는 선택 UI
        if (remaining.length === 0) {
          check(S, '전부 제출 -> chosen=null/선택UI 없음', r.chosen === null && !r.needsChoice)
        } else if (knowsCurrent && remaining.some((t) => t.classId === CLS_TB(0))) {
          check(S, '학습교재 인지 + 그 시험 미제출 -> 1순위 확정', r.chosen?.classId === CLS_TB(0))
        } else if (remaining.length === 1) {
          check(S, '남은 시험 1개 -> 즉시 그 시험', r.chosen?.id === remaining[0].id)
        } else {
          check(S, '동률 복수 -> 임의 선택 금지', r.chosen === null && r.needsChoice === true)
        }
        // 불변식 4: 모든 후보의 단어 스냅샷 40개(절단 없음)
        check(S, '후보 전원 단어 40개', r.pending.every((p) => p.test.words.length === 40))
        // 불변식 5: completed 집계 정확
        check(S, `completed = ${takenCount}`, r.completed.length === takenCount)
      }
    }
  }
}

// ── 축 G: 다인원 격리 스윕 — 8/12/20명이 같은 시험 풀에서 서로 불간섭 ──
console.log('축 G — 다인원 격리(8/12/20명 × 시험 2개, 절반 제출 상태)')
for (const n of [5, 8, 12, 20]) {
  scenarios++
  const S = `G:${n}명 격리`
  const tests = [mkTest('g1', 0, '2026-08-14T08:00:00Z'), mkTest('g2', 1, '2026-08-14T09:00:00Z')]
  const students = Array.from({ length: n }, (_, i) => mkStudent(i, { textbooks: [0, 1], currentTb: i % 2 }))
  const results = students.map((s, i) => {
    const { scope, ctx } = baseCtx(s)
    const mine = tests.filter((t) => scope.includes(t.classId))
    // 짝수 학생은 첫 시험 제출 완료 상태
    return selectEntranceTest({ tests: mine, takenTestIds: i % 2 === 0 ? ['g1'] : [], context: ctx })
  })
  // 각자 자기 상태만 반영: 짝수(g1 제출, currentTb=0) -> 남은 g2로, 홀수(미제출, currentTb=1) -> g2가 1순위
  check(S, '짝수 학생 전원 g2로 진행', results.every((r, i) => i % 2 !== 0 || r.chosen?.id === 'g2'))
  check(S, '홀수 학생 전원 1순위 g2 확정', results.every((r, i) => i % 2 === 0 || (r.chosen?.id === 'g2' && r.topTier === TIER.CURRENT_TEXTBOOK_AND_UNIT)))
  check(S, '서로의 taken 상태가 섞이지 않음(짝수만 completed 1)', results.every((r, i) => r.completed.length === (i % 2 === 0 ? 1 : 0)))
}

console.log(`\n─── 결과 ───`)
console.log(`시나리오 ${scenarios}개 / 단언 ${assertions}개 / 실패 ${failures}개`)
if (failedScenarios.length) console.log('실패 시나리오:', failedScenarios.join(', '))
console.log(failures === 0 ? '모든 조합 통과 ✅' : '실패 있음 ❌')
process.exit(failures > 0 ? 1 : 0)
