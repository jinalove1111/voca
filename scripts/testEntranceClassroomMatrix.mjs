// 입실시험 실전 수업 시나리오 회귀 매트릭스 (2026-08-13, CASE 1~20)
//
// 목적: "내일 수업에서 또 안 돼요"가 나오지 않게, 실제 교실에서 발생하는
// 상황을 코드 계약으로 고정한다. 전부 mock 픽스처 — 라이브 DB 무접촉,
// 학생 데이터 무변경(운영자 절대규칙 5·6).
//
// 검증 대상(전부 순수 모듈, import 0 또는 순수 의존):
//   src/utils/entranceTestSelection.js  — 어느 시험을 볼 것인가 + 출제 범위
//   src/utils/entranceEligibility.js    — 누가 볼 수 있는가
//   src/utils/accountStatus.js          — 테스트/아카이브 계정 판별
//   src/utils/entranceTest.js           — 문항 생성/채점/랭킹 순수 로직
// DB 계약(unique 제약, upsert onConflict)은 소스 레벨 단언으로 고정한다 —
// 라이브 쓰기 없이 "그 방어가 코드에 실재하는가"를 확인하기 위해서다.
import { readFileSync } from 'node:fs'
import {
  selectEntranceTest, resolvePickedTest, computeEntranceSourceWords, TIER,
} from '../src/utils/entranceTestSelection.js'
import {
  entranceScopeClassIds, entranceEligibilitySource, isInEntranceScope,
  isArchivedOrFixtureStudentName,
} from '../src/utils/entranceEligibility.js'
import { isTestAccountStudent, isRealStudentAccount } from '../src/utils/accountStatus.js'
import { buildEntranceQuestions, computeTestResult, summarizeClassResults } from '../src/utils/entranceTest.js'

let failures = 0
const caseFailures = {}
let current = '-'
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else {
    console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : '')
    failures++
    caseFailures[current] = (caseFailures[current] || 0) + 1
  }
}
const head = (n, title) => { current = n; console.log(`\n${n}. ${title}`) }

// ── 공통 픽스처 ───────────────────────────────────────────────────────
const TB = { ymb: 'tb-ymb', kim: 'tb-kim', hak: 'tb-hak' }
const CLS = { ymb: 'cls-ymb', kim: 'cls-kim', hak: 'cls-hak', people: 'cls-people' }
const OWNER = { [CLS.ymb]: TB.ymb, [CLS.kim]: TB.kim, [CLS.hak]: TB.hak }
const U = { ymb4: 'u-ymb4', ymb5: 'u-ymb5', kim6: 'u-kim6', hak1: 'u-hak1' }

const mkTest = (id, classId, unitId, createdAt, status = 'active', extra = {}) => ({
  id, classId, status, createdAt, questionCount: 20, timeLimitSeconds: 600,
  words: [{ word: `${unitId}-a`, meaning: '뜻a' }, { word: `${unitId}-b`, meaning: '뜻b' }],
  __unitId: unitId, ...extra,
})
const ctx = (over = {}) => ({
  resolveTestTextbookId: (t) => OWNER[t.classId] || null,
  resolveTestUnitId: (t) => t.__unitId || null,
  currentTextbookId: null, currentUnitId: null,
  assignedTextbookIds: [], classDefaultTextbookIds: [],
  ...over,
})
const mkWords = (prefix, n) => Array.from({ length: n }, (_, i) => ({
  id: `${prefix}-${i}`, word: `${prefix}_${i}`, meaning: `${prefix} 뜻 ${i}`, unitId: prefix,
}))

// ── CASE 1 ────────────────────────────────────────────────────────────
head('CASE 1', '학생에게 시험 1개만 있음 → 바로 그 시험 표시')
{
  const t = mkTest('t1', CLS.ymb, U.ymb5, '2026-08-13T09:00:00Z')
  const s = selectEntranceTest({ tests: [t], takenTestIds: [], context: ctx({ assignedTextbookIds: [TB.ymb] }) })
  check('chosen이 그 시험', s.chosen?.id === 't1')
  check('선택 UI 안 뜸', s.needsChoice === false)
  check('후보 1개', s.pending.length === 1)
}

// ── CASE 2 ────────────────────────────────────────────────────────────
head('CASE 2', '두 교재를 공부함 → 현재 학습 textbook+unit 시험 우선')
{
  const kim = mkTest('t-kim', CLS.kim, U.kim6, '2026-08-13T08:00:00Z') // 더 먼저 생성
  const ymb = mkTest('t-ymb', CLS.ymb, U.ymb5, '2026-08-13T12:00:00Z')
  const s = selectEntranceTest({
    tests: [kim, ymb], takenTestIds: [],
    context: ctx({ currentTextbookId: TB.ymb, currentUnitId: U.ymb5, assignedTextbookIds: [TB.ymb, TB.kim] }),
  })
  check('현재 학습 교재 시험 선택(생성이 더 늦어도)', s.chosen?.id === 't-ymb')
  check('1순위로 분류', s.topTier === TIER.CURRENT_TEXTBOOK_AND_UNIT)
  check('예전 동작(first-created)을 고르지 않음', s.chosen?.id !== 't-kim')
}

// ── CASE 3 ────────────────────────────────────────────────────────────
head('CASE 3', '중2 학생이 고1 교재 추가 학습 → 학년/반 이름으로 차단되지 않음')
{
  const s = selectEntranceTest({
    tests: [mkTest('t-hak', CLS.hak, U.hak1, '2026-08-13T09:00:00Z')], takenTestIds: [],
    context: ctx({ currentTextbookId: TB.hak, currentUnitId: U.hak1, assignedTextbookIds: [TB.hak], classDefaultTextbookIds: [TB.ymb] }),
  })
  check('고1 시험 정상 선택', s.chosen?.id === 't-hak')
  check('1순위', s.topTier === TIER.CURRENT_TEXTBOOK_AND_UNIT)
  const src = readFileSync('src/utils/entranceTestSelection.js', 'utf8')
  check('선택 모듈이 학년/반 이름 문자열을 판정에 쓰지 않음',
    !/(중\d|고\d)\s*['"`]/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')))
}

// ── CASE 4 ────────────────────────────────────────────────────────────
head('CASE 4', '동일 우선순위 시험 2개 → 임의 선택 금지, 학생이 고름')
{
  const s = selectEntranceTest({
    tests: [mkTest('a', CLS.kim, U.kim6, '2026-08-13T08:00:00Z'), mkTest('b', CLS.ymb, U.ymb4, '2026-08-13T12:00:00Z')],
    takenTestIds: [], context: ctx({ assignedTextbookIds: [TB.kim, TB.ymb] }),
  })
  check('chosen=null', s.chosen === null)
  check('needsChoice=true', s.needsChoice === true)
  check('후보 2개 모두 제시', s.pending.length === 2)
  check('둘 다 같은 티어', new Set(s.pending.map((p) => p.tier)).size === 1)
}

// ── CASE 5 ────────────────────────────────────────────────────────────
head('CASE 5', '이미 제출한 시험 + 새 시험 → 완료 시험이 새 시험을 가리지 않음')
{
  const done = mkTest('done', CLS.kim, U.kim6, '2026-08-13T08:00:00Z')
  const fresh = mkTest('fresh', CLS.ymb, U.ymb4, '2026-08-13T12:00:00Z')
  const s = selectEntranceTest({
    tests: [done, fresh], takenTestIds: ['done'],
    context: ctx({ assignedTextbookIds: [TB.kim, TB.ymb] }),
  })
  check('새 시험이 chosen', s.chosen?.id === 'fresh')
  check('완료 시험은 후보에서 제외', s.pending.every((p) => p.test.id !== 'done'))
  check('선택 UI 안 뜸(후보 1개)', s.needsChoice === false)
  check('완료 시험은 completed로 보존(결과 화면용)', s.completed.some((t) => t.id === 'done'))
}

// ── CASE 6 ────────────────────────────────────────────────────────────
head('CASE 6', '같은 시험 재접속 → 중복 제출 없음(정책대로 유지)')
{
  const t = mkTest('t1', CLS.ymb, U.ymb5, '2026-08-13T09:00:00Z')
  const after = selectEntranceTest({ tests: [t], takenTestIds: ['t1'], context: ctx({ assignedTextbookIds: [TB.ymb] }) })
  check('제출 후 재접속하면 응시 후보 0(재응시 유도 없음)', after.pending.length === 0)
  check('chosen=null -> 호출부가 결과 화면', after.chosen === null && after.needsChoice === false)

  // DB/서버 계층의 중복 방지 계약이 실재하는지 소스로 확인
  const sql = readFileSync('supabase_v1_8_entrance_test.sql', 'utf8')
  check('DB에 unique(test_id, student_id) 제약 존재', /unique\s*\(\s*test_id\s*,\s*student_id\s*\)/.test(sql))
  const api = readFileSync('api/submit-entrance-result.js', 'utf8')
  check('서버가 upsert + onConflict(test_id,student_id) 사용', /upsert\(/.test(api) && /onConflict:\s*'test_id,student_id'/.test(api))
  const ui = readFileSync('src/components/EntranceTest.jsx', 'utf8')
  check('클라이언트에 이중 제출 가드(finishedRef) 존재', /finishedRef\.current\s*\)\s*return/.test(ui))
}

// ── CASE 7 ────────────────────────────────────────────────────────────
head('CASE 7', '시험 도중 새로고침 → 시험이 사라지거나 다른 시험으로 바뀌지 않음')
{
  const kim = mkTest('t-kim', CLS.kim, U.kim6, '2026-08-13T08:00:00Z')
  const ymb = mkTest('t-ymb', CLS.ymb, U.ymb4, '2026-08-13T12:00:00Z')
  const sel = selectEntranceTest({ tests: [kim, ymb], takenTestIds: [], context: ctx({ assignedTextbookIds: [TB.kim, TB.ymb] }) })
  check('선택 전에는 chosen=null(동률)', sel.chosen === null)
  check('학생이 고른 시험이 폴링 후에도 유지', resolvePickedTest(sel, 't-ymb')?.id === 't-ymb')
  check('다른 시험으로 바뀌지 않음', resolvePickedTest(sel, 't-ymb')?.id !== 't-kim')
  // 고른 시험이 종료되면 선택을 버리고 일반 규칙으로
  const closedSel = selectEntranceTest({
    tests: [kim, { ...ymb, status: 'closed' }], takenTestIds: [],
    context: ctx({ assignedTextbookIds: [TB.kim, TB.ymb] }),
  })
  check('고른 시험이 종료되면 남은 시험으로 폴백', resolvePickedTest(closedSel, 't-ymb')?.id === 't-kim')
  check('선택 id가 null이어도 크래시 없음', resolvePickedTest(sel, null) === null)

  const ui = readFileSync('src/components/EntranceTest.jsx', 'utf8')
  check("응시 중(running)에는 폴링이 phase를 되돌리지 않음", /p === 'running' \? p :/.test(ui))
}

// ── CASE 8 ────────────────────────────────────────────────────────────
head('CASE 8', '시험 도중 앱을 닫고 재로그인 → 정책에 맞게 처리(미제출이면 다시 응시 가능)')
{
  const t = mkTest('t1', CLS.ymb, U.ymb5, '2026-08-13T09:00:00Z')
  const s = selectEntranceTest({ tests: [t], takenTestIds: [], context: ctx({ assignedTextbookIds: [TB.ymb] }) })
  check('미제출 상태면 같은 시험이 그대로 후보', s.chosen?.id === 't1')
  const submitted = selectEntranceTest({ tests: [t], takenTestIds: ['t1'], context: ctx({ assignedTextbookIds: [TB.ymb] }) })
  check('제출을 마쳤으면 다시 응시 대상이 아님', submitted.chosen === null)
  check('제출 기록은 completed로 남아 결과를 볼 수 있음', submitted.completed.length === 1)
}

// ── CASE 9 는 별도 정적 점검(아래 MOBILE 섹션) ────────────────────────

// ── CASE 10 / 11 ──────────────────────────────────────────────────────
head('CASE 10', '40개 단어 Unit → 1~40번 전부 출제 pool에 들어감')
{
  const words = mkWords('u40', 40)
  const src = computeEntranceSourceWords({ unitWords: words, unitName: 'Unit 6', assignedSlugs: [] })
  check('출제 pool 40개', src.words.length === 40)
  check('라벨이 실제 유닛 이름 + 40개', src.label === 'Unit 6 전체 (40개)')
  check('1번(첫 단어) 포함', src.words.some((w) => w.word === 'u40_0'))
  check('40번(마지막 단어) 포함', src.words.some((w) => w.word === 'u40_39'))
  check('mode=unit', src.mode === 'unit')
  // 문항 생성이 pool 전체에서 뽑는지(count가 pool보다 크면 pool 크기로 제한)
  let seed = 1
  const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const qs = buildEntranceQuestions(src.words, { count: 40, direction: 'en2kr', rng })
  check('40문제 요청 시 40문제 생성', qs.length === 40)
  check('생성된 문항이 pool 밖 단어를 쓰지 않음', qs.every((q) => src.words.some((w) => w.word === q.word)))
  check('중복 문항 없음', new Set(qs.map((q) => q.word)).size === qs.length)
}

head('CASE 11', '38개였던 회귀 사례 → 마지막 5개 단어까지 정상 노출')
{
  const words = mkWords('tail', 40)
  const src = computeEntranceSourceWords({ unitWords: words, unitName: 'Unit4', assignedSlugs: [] })
  const last5 = ['tail_35', 'tail_36', 'tail_37', 'tail_38', 'tail_39']
  check('마지막 5개 단어 전부 pool에 존재', last5.every((w) => src.words.some((x) => x.word === w)))
  check('38개로 줄지 않음(1000행 절단 회귀 고정)', src.words.length === 40)
  // meaning 없는 단어만 제외되고, 그 외에는 절대 잘리지 않는다
  const withHole = [...words]
  withHole[39] = { ...withHole[39], meaning: '' }
  const src2 = computeEntranceSourceWords({ unitWords: withHole, unitName: 'Unit4', assignedSlugs: [] })
  check('meaning 결측 단어만 제외(39개), 임의 slice 없음', src2.words.length === 39)
  check('그 경우 라벨도 39개로 정직하게 표시', src2.label === 'Unit4 전체 (39개)')
}

// ── CASE 12 ───────────────────────────────────────────────────────────
head('CASE 12', 'Unit 변경 → 이전 Unit 단어가 조용히 섞이지 않음')
{
  const u4 = mkWords('ymb_u4', 40)
  const u5 = mkWords('ymb_u5', 40)
  const a = computeEntranceSourceWords({ unitWords: u4, unitName: 'Unit4', assignedSlugs: [] })
  const b = computeEntranceSourceWords({ unitWords: u5, unitName: 'Unit 5', assignedSlugs: [] })
  check('Unit4 pool은 전부 u4 단어', a.words.every((w) => w.word.startsWith('ymb_u4_')))
  check('Unit 5 pool은 전부 u5 단어', b.words.every((w) => w.word.startsWith('ymb_u5_')))
  check('두 pool 교집합 0', a.words.every((w) => !b.words.some((x) => x.id === w.id)))
  check('라벨이 각자의 유닛 이름', a.label.startsWith('Unit4') && b.label.startsWith('Unit 5'))
  // wordLibrary가 이름이 아니라 unit_id로 단어를 준다는 계약(소스 단언)
  const lib = readFileSync('src/utils/wordLibrary.js', 'utf8')
  check('getWordsByUnitId(unit UUID) 경로 존재', /export const getWordsByUnitId/.test(lib))
  // getClassWords 본문에 임의 폴백이 되살아나지 않았는지만 본다. 다른
  // 함수의 `|| units[0]`(resolveStudentUnitObj의 학생 유닛 폴백 등)은 이
  // 검사 대상이 아니다 — 그건 "학생의 현재 유닛"을 정하는 별개 규칙이고
  // 단어 조회 경로가 아니다.
  const getClassWordsBody = (lib.match(/export const getClassWords[\s\S]*?\n\}/) || [''])[0]
  check('getClassWords 본문에 임의 units[0] 폴백이 없음',
    getClassWordsBody.length > 0 && !/units\[0\]/.test(getClassWordsBody))
  check('getClassWords가 resolveClassUnit 경유', /resolveClassUnit\(className, unitName\)/.test(getClassWordsBody))
  const admin = readFileSync('src/components/EntranceTestAdmin.jsx', 'utf8')
  check('관리자가 unit_id로 단어를 가져옴(이름 조회 아님)', /getWordsByUnitId\(resolved\.id\)/.test(admin))
}

// ── CASE 13 ───────────────────────────────────────────────────────────
head('CASE 13', '교재 변경 → 이전 교재 시험이 현재 시험보다 우선되지 않음')
{
  const old = mkTest('t-old', CLS.kim, U.kim6, '2026-08-13T08:00:00Z')
  const now = mkTest('t-now', CLS.ymb, U.ymb5, '2026-08-13T09:00:00Z')
  const s = selectEntranceTest({
    tests: [old, now], takenTestIds: [],
    context: ctx({ currentTextbookId: TB.ymb, currentUnitId: U.ymb5, assignedTextbookIds: [TB.ymb, TB.kim] }),
  })
  check('현재 교재 시험이 선택됨', s.chosen?.id === 't-now')
  check('이전 교재 시험은 하위 티어',
    s.pending.find((p) => p.test.id === 't-old').tier > s.pending.find((p) => p.test.id === 't-now').tier)
  // 반 기본 교재가 이전 교재여도 현재 학습 교재가 이긴다
  const s2 = selectEntranceTest({
    tests: [old, now], takenTestIds: [],
    context: ctx({ currentTextbookId: TB.ymb, currentUnitId: U.ymb5, assignedTextbookIds: [TB.ymb], classDefaultTextbookIds: [TB.kim] }),
  })
  check('반 기본이 이전 교재여도 현재 학습 교재 우선', s2.chosen?.id === 't-now')
}

// ── CASE 14 ───────────────────────────────────────────────────────────
head('CASE 14', '시험 재시작 → 새 snapshot이 이전 시험 snapshot과 섞이지 않음')
{
  // 시험 words는 생성 시점 스냅샷(entrance_tests.words). 새 시험은 그 시점의
  // 출제 범위만 담아야 한다.
  const first = computeEntranceSourceWords({ unitWords: mkWords('ymb_u4', 40), unitName: 'Unit4', assignedSlugs: [] })
  const second = computeEntranceSourceWords({ unitWords: mkWords('ymb_u5', 40), unitName: 'Unit 5', assignedSlugs: [] })
  const snap = (s) => s.words.map((w) => ({ word: w.word, meaning: w.meaning }))
  check('두 snapshot 크기 각 40', snap(first).length === 40 && snap(second).length === 40)
  check('두 snapshot 단어 교집합 0', snap(first).every((w) => !snap(second).some((x) => x.word === w.word)))
  check('snapshot은 {word, meaning}만 담음(내부 id 미노출)',
    snap(second).every((w) => Object.keys(w).length === 2 && 'word' in w && 'meaning' in w))
  const api = readFileSync('src/utils/entranceTestApi.js', 'utf8')
  check('생성 시 같은 반 오늘자 active 시험을 먼저 닫음(반당 1개 계약)',
    /update\(\{ status: 'closed' \}\)[\s\S]{0,200}eq\('status', 'active'\)/.test(api))
  check('insert 시 words를 {word, meaning}로 정규화', /words: \(words \|\| \[\]\)\.map\(\(w\) => \(\{ word: w\.word, meaning: w\.meaning \}\)\)/.test(api))
}

// ── CASE 15 ───────────────────────────────────────────────────────────
head('CASE 15', '관리자가 시험 종료 → 학생에게 active로 계속 나오지 않음')
{
  const closed = mkTest('t-closed', CLS.ymb, U.ymb5, '2026-08-13T09:00:00Z', 'closed')
  const s = selectEntranceTest({ tests: [closed], takenTestIds: [], context: ctx({ assignedTextbookIds: [TB.ymb] }) })
  check('종료된 시험은 후보 0', s.pending.length === 0)
  check('chosen=null', s.chosen === null)
  check('선택 UI도 안 뜸', s.needsChoice === false)
  const mixed = selectEntranceTest({
    tests: [closed, mkTest('t-open', CLS.kim, U.kim6, '2026-08-13T10:00:00Z')], takenTestIds: [],
    context: ctx({ assignedTextbookIds: [TB.ymb, TB.kim] }),
  })
  check('종료 시험은 빼고 진행 중 시험만 후보', mixed.chosen?.id === 't-open' && mixed.pending.length === 1)
}

// ── CASE 16 ───────────────────────────────────────────────────────────
head('CASE 16', '동시에 여러 학생 접속 → 한 학생 상태가 다른 학생에게 영향 없음')
{
  const tests = [mkTest('a', CLS.kim, U.kim6, '2026-08-13T08:00:00Z'), mkTest('b', CLS.ymb, U.ymb5, '2026-08-13T09:00:00Z')]
  const songCtx = ctx({ assignedTextbookIds: [TB.kim, TB.ymb] })                                  // 동률
  const lukeCtx = ctx({ currentTextbookId: TB.ymb, currentUnitId: U.ymb5, assignedTextbookIds: [TB.ymb] })
  // 교차 호출로 상태 누수 확인
  const s1 = selectEntranceTest({ tests, takenTestIds: [], context: songCtx })
  const l1 = selectEntranceTest({ tests, takenTestIds: ['b'], context: lukeCtx })
  const s2 = selectEntranceTest({ tests, takenTestIds: [], context: songCtx })
  check('Song 결과가 Luke 호출 전후로 동일', JSON.stringify(s1.pending.map((p) => p.test.id)) === JSON.stringify(s2.pending.map((p) => p.test.id)))
  check('Song은 선택 UI, Luke는 별개 결과', s2.needsChoice === true && l1.chosen?.id === 'a')
  check('Luke가 b를 제출해도 Song의 b 후보는 그대로', s2.pending.some((p) => p.test.id === 'b'))
  check('입력 tests 배열이 변형되지 않음(부작용 0)', tests.length === 2 && tests[0].id === 'a')
  // 모듈 스코프(들여쓰기 0칸) 가변 상태가 있으면 학생 간 상태 누수가 가능해진다.
  // 함수 내부의 지역 let은 정상이므로 최상위 선언만 본다.
  const src = readFileSync('src/utils/entranceTestSelection.js', 'utf8')
  check('선택 모듈에 모듈 스코프 가변 상태 없음(최상위 let/var 0)',
    !/^(let|var)\s+/m.test(src.replace(/\/\/.*$/gm, '')))
}

// ── CASE 17 ───────────────────────────────────────────────────────────
head('CASE 17', '테스트 계정 Barry/Jinaa → QA 응시 가능, 실제 학생 집계에서는 제외')
{
  const barry = { id: 'u-barry', name: 'Barry' }
  const jinaa = { id: 'u-jinaa', name: 'Jinaa' }
  const real = { id: 'u-real', name: '권교빈' }
  check('Barry는 테스트 계정으로 판별', isTestAccountStudent(barry) === true)
  check('Jinaa도 테스트 계정', isTestAccountStudent(jinaa) === true)
  check('실제 학생은 아님', isTestAccountStudent(real) === false)
  check('실제 학생 집계에서 Barry 제외', isRealStudentAccount(barry) === false)
  check('실제 학생 집계에 권교빈 포함', isRealStudentAccount(real) === true)

  // 응시 자격/선택에는 계정 종류가 개입하지 않아야 한다
  const s = selectEntranceTest({
    tests: [mkTest('t1', CLS.kim, U.kim6, '2026-08-13T09:00:00Z')], takenTestIds: [],
    context: ctx({ currentTextbookId: TB.kim, currentUnitId: U.kim6, assignedTextbookIds: [TB.kim] }),
  })
  check('Barry 컨텍스트로도 시험 정상 진입', s.chosen?.id === 't1')
  const selSrc = readFileSync('src/utils/entranceTestSelection.js', 'utf8')
  check('선택 모듈이 accountStatus를 import하지 않음', !selSrc.includes('accountStatus'))
  const eligSrc = readFileSync('src/utils/entranceEligibility.js', 'utf8')
  check('eligibility 모듈도 테스트계정 이름으로 자격을 막지 않음',
    !/cookie|jinaa|barry/i.test(eligSrc.replace(/\/\/.*$/gm, '')))

  // 랭킹/통계에서는 빠진다(관리자 호출부가 걸러 넘기는 계약)
  const rows = [
    { studentId: 'u-real', score: 8, total: 10, missedWords: ['a'] },
    { studentId: 'u-barry', score: 10, total: 10, missedWords: [] },
  ]
  const filtered = rows.filter((r) => isRealStudentAccount([barry, jinaa, real].find((s2) => s2.id === r.studentId)))
  const sum = summarizeClassResults(filtered)
  check('통계 응시자 수(participants)에 테스트 계정 미포함', sum.participants === 1)
  check('필터 전에는 2명이었음(필터가 실제로 작동함을 대조)', summarizeClassResults(rows).participants === 2)
  const admin = readFileSync('src/components/EntranceTestAdmin.jsx', 'utf8')
  check('관리자 요약이 isTestAccountStudent로 사전 필터', /filter\(\(r\) => !isTestAccountStudent\(getStudentById\(r\.studentId\)\)\)/.test(admin))
}

// ── CASE 18 ───────────────────────────────────────────────────────────
head('CASE 18', '실제 학생 이름이 테스트 계정과 비슷 → 이름 문자열이 아니라 명시적 상태 기준')
{
  check('"Barry Kim"은 테스트 계정이 아님(부분일치 금지)', isTestAccountStudent({ name: 'Barry Kim' }) === false)
  check('"Barryn"도 아님', isTestAccountStudent({ name: 'Barryn' }) === false)
  check('"Jinaah"도 아님', isTestAccountStudent({ name: 'Jinaah' }) === false)
  check('"바리"도 아님', isTestAccountStudent({ name: '바리' }) === false)
  check('공백/대소문자만 다른 "  barry "는 테스트 계정', isTestAccountStudent({ name: '  barry ' }) === true)
  check('is_test 컬럼이 있으면 이름보다 우선(false)', isTestAccountStudent({ name: 'Barry', is_test: false }) === false)
  check('is_test=true면 이름과 무관하게 테스트 계정', isTestAccountStudent({ name: '권교빈', is_test: true }) === true)
  check('archived 컬럼도 이름보다 우선', isRealStudentAccount({ name: '권교빈', archived: true }) === false)
  check('아카이브 이름 규칙은 접미사 기준', isArchivedOrFixtureStudentName('Song_DUP2_4577ae_INACTIVE') === true)
  check('정상 이름은 아카이브 아님', isArchivedOrFixtureStudentName('Song') === false)
}

// ── CASE 19 ───────────────────────────────────────────────────────────
head('CASE 19', '반 이동 이력 학생 → 과거 class_id 때문에 잘못된 시험이 노출되지 않음')
{
  const resolveOwner = (tbId) => ({ [TB.ymb]: CLS.ymb, [TB.kim]: CLS.kim, [TB.hak]: CLS.hak })[tbId] || null
  // 현재: 사람 반 people + YMB 개별 배정. 과거 김기택 반 배정은 이미 제거된 상태.
  const scope = entranceScopeClassIds({
    primaryClassId: CLS.people,
    assignments: [{ classId: CLS.ymb, textbookId: TB.ymb }],
    resolveTextbookOwnerClassId: resolveOwner,
  })
  check('현재 소속/배정만 scope에 포함', scope.includes(CLS.people) && scope.includes(CLS.ymb))
  check('과거 반(김기택)은 scope에 없음', !scope.includes(CLS.kim))
  check('과거 반 시험은 대상 아님', isInEntranceScope(scope, CLS.kim) === false)
  check('현재 교재 반 시험은 대상', isInEntranceScope(scope, CLS.ymb) === true)
  check('판정 근거가 INDIVIDUAL_CLASS로 명확',
    entranceEligibilitySource({ primaryClassId: CLS.people, assignments: [{ classId: CLS.ymb, textbookId: TB.ymb }], resolveTextbookOwnerClassId: resolveOwner }, CLS.ymb) === 'INDIVIDUAL_CLASS')
  check('과거 반에 대한 판정 근거는 null',
    entranceEligibilitySource({ primaryClassId: CLS.people, assignments: [{ classId: CLS.ymb, textbookId: TB.ymb }], resolveTextbookOwnerClassId: resolveOwner }, CLS.kim) === null)
}

// ── CASE 20 ───────────────────────────────────────────────────────────
head('CASE 20', '교재 추가 배정 → 그 학생만 대상, 같은 반 전체로 확산되지 않음')
{
  const resolveOwner = (tbId) => ({ [TB.hak]: CLS.hak, [TB.ymb]: CLS.ymb })[tbId] || null
  const withExtra = entranceScopeClassIds({
    primaryClassId: CLS.people,
    assignments: [{ classId: CLS.ymb, textbookId: TB.ymb }, { classId: null, textbookId: TB.hak }],
    resolveTextbookOwnerClassId: resolveOwner,
  })
  const classmate = entranceScopeClassIds({
    primaryClassId: CLS.people,
    assignments: [{ classId: CLS.ymb, textbookId: TB.ymb }],
    resolveTextbookOwnerClassId: resolveOwner,
  })
  check('추가 배정 학생은 고1 시험 대상', isInEntranceScope(withExtra, CLS.hak) === true)
  check('같은 반 다른 학생은 고1 시험 대상 아님', isInEntranceScope(classmate, CLS.hak) === false)
  check('추가 배정 근거가 INDIVIDUAL_TEXTBOOK',
    entranceEligibilitySource({ primaryClassId: CLS.people, assignments: [{ classId: null, textbookId: TB.hak }], resolveTextbookOwnerClassId: resolveOwner }, CLS.hak) === 'INDIVIDUAL_TEXTBOOK')
  // class_textbooks(반 기본 교재)는 eligibility에 넣지 않는다는 설계 계약
  const eligSrc = readFileSync('src/utils/entranceEligibility.js', 'utf8')
  check('class_textbooks가 eligibility 판정에 쓰이지 않음(설계 계약)',
    !/class_textbooks/.test(eligSrc.replace(/\/\/.*$/gm, '').replace(/^_.*$/gm, '')))
}

// ── CASE 9 (모바일) — 정적 점검 ───────────────────────────────────────
head('CASE 9', '모바일 화면 — 시험 카드/문항/제출 버튼 정상 표시(정적 점검)')
{
  const ui = readFileSync('src/components/EntranceTest.jsx', 'utf8')
  const html = readFileSync('index.html', 'utf8')
  check('viewport meta 존재(모바일 스케일)', /<meta[^>]+name=["']viewport["']/.test(html))
  check('시험 화면이 고정폭이 아니라 max-w + mx-auto 반응형', /max-w-lg mx-auto/.test(ui))
  check('선택 UI 버튼이 w-full(작은 화면에서 잘리지 않음)', /w-full text-left border-2/.test(ui))
  check('제출/다음 버튼이 w-full', /<button[^>]*className="w-full/.test(ui))
  check('입력창에 자동완성 차단(안드로이드 키보드 대응)', /antiFillNameRef/.test(ui))
  check('빈 입력일 때 진행 버튼 비활성(연타 방지)', /disabled=\{!input\.trim\(\)\}/.test(ui))
  check('가로 스크롤 유발 고정 px 폭이 시험 화면에 없음', !/className="[^"]*w-\[\d+px\]/.test(ui))
}

// ── 채점/결과 불변식 (보너스) ─────────────────────────────────────────
head('EXTRA', '채점/결과 불변식 — 시험 응시가 별도 보상 이벤트를 만들지 않음')
{
  const words = mkWords('g', 5)
  let seed = 7
  const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const qs = buildEntranceQuestions(words, { count: 5, direction: 'en2kr', rng })
  const r = computeTestResult(qs, qs.map((q) => q.answer))
  check('전부 정답이면 score=total', r.score === r.total && r.total === 5)
  const r0 = computeTestResult(qs, qs.map(() => ''))
  check('전부 오답이면 score=0', r0.score === 0)
  check('결과 객체에 별/보상 필드가 없음(시험이 보상을 만들지 않음)',
    !('stars' in r) && !('reward' in r) && !('xp' in r))
  const ui = readFileSync('src/components/EntranceTest.jsx', 'utf8')
  check('시험 화면이 grantReward/addStars를 호출하지 않음', !/grantReward|addStars/.test(ui))
  check('시험 화면이 useStudent 진행도 훅을 import하지 않음', !/from '\.\.\/hooks\/useStudent'/.test(ui))
}

console.log('\n─── 결과 요약 ───')
const keys = ['CASE 1', 'CASE 2', 'CASE 3', 'CASE 4', 'CASE 5', 'CASE 6', 'CASE 7', 'CASE 8', 'CASE 9',
  'CASE 10', 'CASE 11', 'CASE 12', 'CASE 13', 'CASE 14', 'CASE 15', 'CASE 16', 'CASE 17', 'CASE 18',
  'CASE 19', 'CASE 20', 'EXTRA']
for (const k of keys) console.log(`${k} 실패 수: ${caseFailures[k] || 0} (0이어야 정상)`)
console.log(failures === 0
  ? '\n모든 단언 통과 — 입실시험 실전 시나리오 21개 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
