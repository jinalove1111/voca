// 입실시험 다중 대상 선택 회귀 테스트 (2026-08-12, P0)
//
// 재현하는 실사고: 학생 화면이 findActiveTest()로 created_at이 가장 이른
// active 시험 하나를 학생의 실제 학습 교재와 무관하게 골랐다. Song
// (4f3e0b72…)은 "중2 능률 김기택"·"중2 YMB 박준원" 두 교재에 배정돼 있었고,
// 아침 08:25에 열려 종료되지 않은 김기택 시험이 12:20의 YMB 시험을 영영
// 가려서, 반 친구들과 다른 시험을 보고 0/10을 받았다.
//
// 검증 대상은 src/utils/entranceTestSelection.js — import 0개의 순수 모듈
// (네트워크/DB 무접촉)이라 plain Node가 소스를 직접 읽는다. 번들 불필요.
import {
  selectEntranceTest, classifyEntranceTest, TIER,
} from '../src/utils/entranceTestSelection.js'

let failures = 0
const scenarioFailures = {}
let current = 'init'
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else {
    console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : '')
    failures++
    scenarioFailures[current] = (scenarioFailures[current] || 0) + 1
  }
}

// ── 픽스처: 실측 구조를 그대로 축소 ───────────────────────────────────
// 교재(=컨테이너 반)와 그 반이 여는 시험. 실제 이름을 그대로 쓴다.
const TB = {
  ymb: 'tb-ymb',   // 중2 YMB 박준원
  kim: 'tb-kim',   // 중2 능률 김기택
  hak: 'tb-hak',   // 고1 6월 학평 (중2 학생이 배정받는 상위 교재)
  dong: 'tb-dong', // 중1 동아 윤정미
}
const CLS = { ymb: 'cls-ymb', kim: 'cls-kim', hak: 'cls-hak', dong: 'cls-dong' }
const OWNER = { [CLS.ymb]: TB.ymb, [CLS.kim]: TB.kim, [CLS.hak]: TB.hak, [CLS.dong]: TB.dong }
const UNIT = { ymb4: 'u-ymb4', ymb5: 'u-ymb5', kim6: 'u-kim6', hak1: 'u-hak1' }

const mkTest = (id, classId, unitId, createdAt, status = 'active') => ({
  id, classId, status, createdAt,
  questionCount: 20, timeLimitSeconds: 600,
  words: [{ word: `${unitId}-w1` }, { word: `${unitId}-w2` }],
  __unitId: unitId, // 픽스처 편의 — 아래 resolveTestUnitId가 읽는다
})

// 실제 앱에서는 wordLibrary의 resolveTestTextbookIdByClassId /
// inferUnitIdFromTestWords가 주입된다. 여기서는 같은 계약의 픽스처 버전.
const baseCtx = {
  resolveTestTextbookId: (t) => OWNER[t.classId] || null,
  resolveTestUnitId: (t) => t.__unitId || null,
}

// ── A. 시험 1개만 대상 → 기존처럼 바로 진입 ──────────────────────────
current = 'A'
console.log('\nA. 시험이 1개뿐이면 기존처럼 바로 진입한다(선택 UI 없음)')
{
  const only = mkTest('t1', CLS.ymb, UNIT.ymb5, '2026-08-12T12:20:32Z')
  const s = selectEntranceTest({
    tests: [only], takenTestIds: [],
    context: { ...baseCtx, currentTextbookId: TB.ymb, currentUnitId: UNIT.ymb5, assignedTextbookIds: [TB.ymb], classDefaultTextbookIds: [] },
  })
  check('chosen이 그 시험', s.chosen?.id === 't1')
  check('needsChoice=false(선택 UI 안 뜸)', s.needsChoice === false)
  check('1순위로 분류(현재 학습 교재+유닛 일치)', s.topTier === TIER.CURRENT_TEXTBOOK_AND_UNIT)

  // 교재/유닛 정보를 아무것도 모르는 학생이라도 1개면 그대로 진입해야 한다.
  const s2 = selectEntranceTest({
    tests: [only], takenTestIds: [],
    context: { ...baseCtx, currentTextbookId: null, currentUnitId: null, assignedTextbookIds: [], classDefaultTextbookIds: [] },
  })
  check('컨텍스트가 비어도 1개면 그대로 진입', s2.chosen?.id === 't1' && s2.needsChoice === false)
  check('그 경우 4순위(자격만 있음)로 분류', s2.topTier === TIER.IN_SCOPE_ONLY)
}

// ── B. 반 기본교재 ≠ 현재 학습교재 → 현재 학습교재 시험 선택 ─────────
current = 'B'
console.log('\nB. 반 기본교재와 현재 학습교재가 다르면 현재 학습교재 시험을 고른다')
{
  // 실사고 재현: 김기택 시험이 08:25로 더 먼저 생성됐다(예전 코드는 이것을
  // 골랐다). 학생의 현재 학습 교재/유닛은 YMB Unit 5.
  const kimTest = mkTest('t-kim', CLS.kim, UNIT.kim6, '2026-08-12T08:25:58Z')
  const ymbTest = mkTest('t-ymb', CLS.ymb, UNIT.ymb5, '2026-08-12T12:20:32Z')
  const s = selectEntranceTest({
    tests: [kimTest, ymbTest], takenTestIds: [],
    context: {
      ...baseCtx,
      currentTextbookId: TB.ymb, currentUnitId: UNIT.ymb5,
      assignedTextbookIds: [TB.ymb, TB.kim],
      classDefaultTextbookIds: [TB.kim], // 반 기본은 김기택
    },
  })
  check('현재 학습교재(YMB) 시험을 고름 — created_at이 더 늦어도', s.chosen?.id === 't-ymb')
  check('예전 동작(가장 이른 created_at=김기택)을 고르지 않음', s.chosen?.id !== 't-kim')
  check('1순위로 분류', s.topTier === TIER.CURRENT_TEXTBOOK_AND_UNIT)
  check('needsChoice=false(1순위가 유일)', s.needsChoice === false)
  check('김기택 시험도 후보 목록에는 남음(2순위)', s.pending.some((p) => p.test.id === 't-kim' && p.tier === TIER.ASSIGNED_TEXTBOOK))

  // 같은 교재지만 유닛이 다르면 1순위가 아니다 — 개별 배정(2순위)으로 내려감.
  const wrongUnit = selectEntranceTest({
    tests: [mkTest('t-ymb4', CLS.ymb, UNIT.ymb4, '2026-08-12T12:00:00Z')], takenTestIds: [],
    context: { ...baseCtx, currentTextbookId: TB.ymb, currentUnitId: UNIT.ymb5, assignedTextbookIds: [TB.ymb], classDefaultTextbookIds: [] },
  })
  check('교재는 같고 유닛이 다르면 1순위가 아님(2순위)', wrongUnit.topTier === TIER.ASSIGNED_TEXTBOOK)

  // 유닛 역추적이 실패(null)해도 1순위를 거짓으로 만들지 않는다.
  const unknownUnit = selectEntranceTest({
    tests: [mkTest('t-x', CLS.ymb, null, '2026-08-12T12:00:00Z')], takenTestIds: [],
    context: { ...baseCtx, currentTextbookId: TB.ymb, currentUnitId: UNIT.ymb5, assignedTextbookIds: [TB.ymb], classDefaultTextbookIds: [] },
  })
  check('유닛을 알 수 없으면 1순위로 올리지 않음(모르면 끼워맞추지 않음)',
    unknownUnit.topTier === TIER.ASSIGNED_TEXTBOOK)
}

// ── C. 개별 고1 교재 배정된 중2 학생 → 고1 시험 정상 선택 ────────────
current = 'C'
console.log('\nC. 중2 학생이 개별 배정받은 고1 교재 시험을 정상적으로 본다')
{
  // 운영 원칙: 학년/반 이름으로 제한하지 않는다. 반 기본은 중2(YMB)지만
  // 개별 배정된 고1 학평이 현재 학습 교재라면 그쪽이 1순위다.
  const s = selectEntranceTest({
    tests: [
      mkTest('t-ymb', CLS.ymb, UNIT.ymb4, '2026-08-12T09:00:00Z'),
      mkTest('t-hak', CLS.hak, UNIT.hak1, '2026-08-12T10:00:00Z'),
    ],
    takenTestIds: [],
    context: {
      ...baseCtx,
      currentTextbookId: TB.hak, currentUnitId: UNIT.hak1,
      assignedTextbookIds: [TB.hak],
      classDefaultTextbookIds: [TB.ymb], // 소속 반은 중2
    },
  })
  check('고1 학평 시험을 고름', s.chosen?.id === 't-hak')
  check('1순위(현재 학습 교재+유닛)', s.topTier === TIER.CURRENT_TEXTBOOK_AND_UNIT)
  check('반 기본(중2 YMB) 시험은 3순위로 밀림',
    s.pending.find((p) => p.test.id === 't-ymb')?.tier === TIER.CLASS_DEFAULT_TEXTBOOK)

  // 현재 학습 교재가 아직 중2인데 고1이 개별 배정만 된 경우:
  // 개별 배정(2순위)이 반 기본(3순위)보다 우선한다.
  const s2 = selectEntranceTest({
    tests: [
      mkTest('t-ymb', CLS.ymb, UNIT.ymb4, '2026-08-12T09:00:00Z'),
      mkTest('t-hak', CLS.hak, UNIT.hak1, '2026-08-12T10:00:00Z'),
    ],
    takenTestIds: [],
    context: {
      ...baseCtx,
      currentTextbookId: null, currentUnitId: null,
      assignedTextbookIds: [TB.hak],
      classDefaultTextbookIds: [TB.ymb],
    },
  })
  check('개별 배정(고1) > 반 기본(중2)', s2.chosen?.id === 't-hak' && s2.topTier === TIER.ASSIGNED_TEXTBOOK)
  check('학년/반 이름으로 고1 시험을 막지 않음', s2.chosen?.classId === CLS.hak)
}

// ── D. 동일 우선순위 시험 2개 → 선택 UI 노출 ─────────────────────────
current = 'D'
console.log('\nD. 같은 우선순위 시험이 2개면 임의 선택하지 않고 선택 UI를 띄운다')
{
  const s = selectEntranceTest({
    tests: [
      mkTest('t-kim', CLS.kim, UNIT.kim6, '2026-08-12T08:25:58Z'),
      mkTest('t-ymb', CLS.ymb, UNIT.ymb4, '2026-08-12T12:20:32Z'),
    ],
    takenTestIds: [],
    context: {
      ...baseCtx,
      currentTextbookId: null, currentUnitId: null,
      assignedTextbookIds: [TB.kim, TB.ymb], // 둘 다 개별 배정(동률)
      classDefaultTextbookIds: [],
    },
  })
  check('chosen=null(임의 선택 금지)', s.chosen === null)
  check('needsChoice=true(선택 UI)', s.needsChoice === true)
  check('후보 2개 모두 제시', s.pending.length === 2)
  check('둘 다 같은 티어(2순위)', s.pending.every((p) => p.tier === TIER.ASSIGNED_TEXTBOOK))
  check('후보 순서는 created_at 오름차순(기존 동작 유지)',
    s.pending[0].test.id === 't-kim' && s.pending[1].test.id === 't-ymb')

  // 동률이 3개여도 마찬가지
  const s3 = selectEntranceTest({
    tests: [
      mkTest('a', CLS.kim, UNIT.kim6, '2026-08-12T08:00:00Z'),
      mkTest('b', CLS.ymb, UNIT.ymb4, '2026-08-12T09:00:00Z'),
      mkTest('c', CLS.hak, UNIT.hak1, '2026-08-12T10:00:00Z'),
    ],
    takenTestIds: [],
    context: { ...baseCtx, assignedTextbookIds: [TB.kim, TB.ymb, TB.hak], classDefaultTextbookIds: [] },
  })
  check('3개 동률도 선택 UI', s3.needsChoice === true && s3.chosen === null && s3.pending.length === 3)

  // 동률이지만 하나가 1순위면 선택 UI 없이 그것으로 확정
  const s1 = selectEntranceTest({
    tests: [
      mkTest('t-kim', CLS.kim, UNIT.kim6, '2026-08-12T08:25:58Z'),
      mkTest('t-ymb', CLS.ymb, UNIT.ymb5, '2026-08-12T12:20:32Z'),
    ],
    takenTestIds: [],
    context: {
      ...baseCtx, currentTextbookId: TB.ymb, currentUnitId: UNIT.ymb5,
      assignedTextbookIds: [TB.kim, TB.ymb], classDefaultTextbookIds: [],
    },
  })
  check('1순위가 유일하면 선택 UI 없이 확정', s1.needsChoice === false && s1.chosen?.id === 't-ymb')
}

// ── E. 이미 응시 완료한 시험은 제외 ──────────────────────────────────
current = 'E'
console.log('\nE. 이미 응시한 시험은 후보에서 제외(재응시 유도 금지) — 기존 정책')
{
  const kim = mkTest('t-kim', CLS.kim, UNIT.kim6, '2026-08-12T08:25:58Z')
  const ymb = mkTest('t-ymb', CLS.ymb, UNIT.ymb5, '2026-08-12T12:20:32Z')
  const s = selectEntranceTest({
    tests: [kim, ymb], takenTestIds: ['t-ymb'],
    context: {
      ...baseCtx, currentTextbookId: TB.ymb, currentUnitId: UNIT.ymb5,
      assignedTextbookIds: [TB.kim, TB.ymb], classDefaultTextbookIds: [],
    },
  })
  check('이미 본 1순위 시험은 후보에서 빠짐', s.pending.every((p) => p.test.id !== 't-ymb'))
  check('남은 시험이 chosen', s.chosen?.id === 't-kim')
  check('completed에 응시한 시험이 기록됨(결과 화면용)', s.completed.some((t) => t.id === 't-ymb'))

  const allTaken = selectEntranceTest({
    tests: [kim, ymb], takenTestIds: ['t-kim', 't-ymb'],
    context: { ...baseCtx, assignedTextbookIds: [TB.kim, TB.ymb] },
  })
  check('전부 응시했으면 chosen=null(호출부가 결과 화면으로)', allTaken.chosen === null)
  check('전부 응시했으면 needsChoice=false(선택 UI 안 뜸)', allTaken.needsChoice === false)
  check('전부 응시했으면 completed 2건', allTaken.completed.length === 2)

  // closed 시험은 애초에 후보가 아니다(기존 findActiveTest 계약 유지)
  const closed = selectEntranceTest({
    tests: [mkTest('t-closed', CLS.ymb, UNIT.ymb5, '2026-08-12T07:00:00Z', 'closed'), kim],
    takenTestIds: [],
    context: { ...baseCtx, assignedTextbookIds: [TB.kim, TB.ymb] },
  })
  check('closed 시험은 후보에서 제외', closed.pending.every((p) => p.test.status === 'active'))
  check('closed만 있고 active가 없으면 chosen=null', selectEntranceTest({
    tests: [mkTest('t-c', CLS.ymb, UNIT.ymb5, '2026-08-12T07:00:00Z', 'closed')], takenTestIds: [],
    context: baseCtx,
  }).chosen === null)
}

// ── F. 테스트 계정(Barry/Jinaa)도 QA용 접근 유지 ─────────────────────
current = 'F'
console.log('\nF. 테스트/QA 계정(Barry/Jinaa)도 정상 응시 경로를 그대로 유지한다')
{
  // 이 모듈은 계정 이름/종류를 **입력으로 받지 않는다**. 즉 구조적으로
  // 테스트 계정을 걸러낼 수 없다(accountStatus는 집계 전용이라는 운영자
  // 확정 원칙 — accountStatus.js 헤더 주석). 아래는 그 계약의 회귀 고정.
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync('src/utils/entranceTestSelection.js', 'utf8'))
  check('선택 모듈이 accountStatus를 import하지 않음', !src.includes('accountStatus'))
  check('선택 모듈이 학생 이름/계정 종류를 참조하지 않음',
    !/isTestAccount|barry|jinaa|cookie/i.test(src.replace(/\/\/.*$/gm, '')))

  // Barry의 컨텍스트로도 동일하게 동작(입력이 같으면 결과가 같다).
  const barryCtx = { ...baseCtx, currentTextbookId: TB.kim, currentUnitId: UNIT.kim6, assignedTextbookIds: [TB.kim], classDefaultTextbookIds: [] }
  const s = selectEntranceTest({
    tests: [mkTest('t-kim', CLS.kim, UNIT.kim6, '2026-08-12T08:00:00Z')],
    takenTestIds: [], context: barryCtx,
  })
  check('Barry도 자기 교재 시험에 정상 진입', s.chosen?.id === 't-kim' && s.topTier === TIER.CURRENT_TEXTBOOK_AND_UNIT)
}

// ── G. 다른 학생 노출에 변화 없음 ────────────────────────────────────
current = 'G'
console.log('\nG. 단일 교재 학생(대다수)의 노출은 예전과 완전히 동일하다')
{
  // 예전 findActiveTest = "created_at 오름차순 중 첫 active".
  const legacyPick = (tests) => tests.filter((t) => t.status === 'active')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null

  // 한 교재에만 걸린 학생 — 시험이 몇 개든 결과가 예전과 같아야 한다.
  const cases = [
    [mkTest('x1', CLS.ymb, UNIT.ymb4, '2026-08-12T09:00:00Z')],
    [mkTest('x1', CLS.ymb, UNIT.ymb4, '2026-08-12T09:00:00Z', 'closed'),
     mkTest('x2', CLS.ymb, UNIT.ymb5, '2026-08-12T10:00:00Z')],
    [mkTest('x1', CLS.ymb, UNIT.ymb4, '2026-08-12T09:00:00Z'),
     mkTest('x2', CLS.ymb, UNIT.ymb5, '2026-08-12T10:00:00Z', 'closed')],
  ]
  let same = 0
  for (const tests of cases) {
    const s = selectEntranceTest({
      tests, takenTestIds: [],
      context: { ...baseCtx, currentTextbookId: TB.ymb, currentUnitId: UNIT.ymb4, assignedTextbookIds: [TB.ymb], classDefaultTextbookIds: [TB.ymb] },
    })
    if (s.chosen?.id === legacyPick(tests)?.id && !s.needsChoice) same++
  }
  check(`단일 교재 학생 ${cases.length}개 시나리오 전부 예전 선택과 동일`, same === cases.length)

  // 오늘 시험이 아예 없으면 예전처럼 아무것도 없다.
  const none = selectEntranceTest({ tests: [], takenTestIds: [], context: baseCtx })
  check('시험 0건이면 chosen=null/needsChoice=false/pending 0',
    none.chosen === null && none.needsChoice === false && none.pending.length === 0)

  // 방어: 잘못된 입력에도 크래시하지 않는다.
  check('인자 없이 호출해도 크래시 없음', selectEntranceTest().pending.length === 0)
  check('null 시험이 섞여도 크래시 없음',
    selectEntranceTest({ tests: [null, mkTest('ok', CLS.ymb, UNIT.ymb4, '2026-08-12T09:00:00Z')], context: baseCtx }).pending.length === 1)
  check('classifyEntranceTest(null)도 크래시 없음', classifyEntranceTest(null).tier === TIER.IN_SCOPE_ONLY)
}

console.log('\n─── 결과 요약 ───')
for (const k of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
  console.log(`시나리오 ${k} 실패 수: ${scenarioFailures[k] || 0} (0이어야 정상)`)
}
console.log(failures === 0
  ? '\n모든 단언 통과 — 입실시험 다중 대상 우선순위 선택 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
