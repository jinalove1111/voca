// health check — SCA 배정 행이 유령 유닛을 가리키는 사각지대 (2026-08-30)
//
// 왜 필요한가 (라이브 실측)
//   유령 유닛 9개(유닛 50개 중)를 정리하려고 참조를 전수 조사한 결과,
//   student_class_assignments 41행이 그 유닛들을 가리키고 있었고 그중
//   **25행이 실학생 소유**였다(실학생 19명, 그중 17명이 is_primary).
//   그런데 `npm run health:students` 는 PASS 35 / WARN 0 / FAIL 0 이었다.
//
//   왜 못 잡았나 — 기존 규칙 두 개가 각자 "자기 관점"만 보기 때문이다:
//     · unit_not_ghost 는 students.current_unit_id(= 지금 쓰는 유닛)만 본다.
//       실학생 중 지금 유령 유닛을 쓰는 사람은 0명이라 전원 PASS.
//     · ASSIGNMENT_CONFLICT ② 는 "SCA 행의 유닛이 그 행의 교재 소속이
//       아닌가"를 본다. 그런데 유령 유닛은 **그 교재에 정상적으로 소속**돼
//       있다(엑셀 업로드가 그 교재 밑에 만들었으므로). 그래서 통과.
//   즉 "그 교재로 전환하면 1단어 화면을 보게 될 학생 19명"이 두 규칙
//   사이의 틈으로 조용히 빠져나갔다.
//
//   이건 이론이 아니라 장전된 상태다 — getStudentWords 의 usingOverride
//   분기가 SCA 의 current_unit_id 를 우선 사용하므로, 그 교재로 전환하는
//   순간 실제로 유령 유닛의 단어(헤더 라벨 1개)를 보게 된다. 실제로
//   word_status 에는 현다율 학생이 헤더 단어 "English" 를 known 으로
//   학습한 기록이 1건 남아 있다.
//
// 설계 원칙 (운영자 조건 그대로)
//   · **0단어라는 이유만으로 오류 판정하지 않는다.** 기존 isGhostUnit 을
//     그대로 재사용한다 — 그 함수는 "이름이 번호 없는 유닛 별칭(Unit)"
//     이거나 "단어가 전부 엑셀 헤더 라벨"일 때만 유령으로 본다. 이름이
//     정상(`Unit 1`)이고 단어만 0개인 유닛은 유령이 아니다(교사가 아직
//     업로드하지 않은 정상 유닛일 수 있다).
//   · GHOST_MAX_WORDS(3) 가드가 있어 26/40/50단어 정상 유닛은 구조적으로
//     유령이 될 수 없다.
//   · 기존 검사의 의미를 바꾸지 않는다 — 새 검사 1개만 추가한다.
//   · 테스트/아카이브 계정 분류 규칙은 그대로 둔다(실학생 결과 오염 방지).
//
// 등록: npm run verify:assignment-ghost
import { evaluateStudent, isGhostUnit, GHOST_MAX_WORDS, CHECK_CODES } from './lib/studentHealthRules.mjs'

let failures = 0, asserted = 0
function check(label, cond, detail) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); failures++ }
}

const CLS = 'c-1', TB_A = 'tb-a', TB_B = 'tb-b'
const U_OK = 'u-ok', U_GHOST = 'u-ghost', U_EMPTY = 'u-empty', U_SMALL = 'u-26'

// 라이브 실측 구조를 그대로 옮긴 픽스처:
//   U_OK    정상 40단어 유닛(교재 A)
//   U_GHOST 유령 — 이름 "Unit", 단어가 헤더 라벨 English/Korean(교재 B)
//   U_EMPTY 0단어인데 이름은 정상 "Unit 1" — **유령이 아니다**(교재 B)
//   U_SMALL 정상 26단어(고1 6월 학평에 실재하는 크기 — 오탐 방지 대조군)
function baseCtx() {
  const words = []
  for (let i = 0; i < 40; i++) words.push({ id: `w${i}`, unit_id: U_OK, word: `w${i}`, meaning: `뜻${i}` })
  for (let i = 0; i < 26; i++) words.push({ id: `s${i}`, unit_id: U_SMALL, word: `s${i}`, meaning: `뜻${i}` })
  words.push({ id: 'gw', unit_id: U_GHOST, word: 'English', meaning: 'Korean' })
  const unitById = new Map([
    [U_OK, { id: U_OK, name: 'Unit 6', textbook_id: TB_A, class_id: CLS }],
    [U_SMALL, { id: U_SMALL, name: 'Unit 1', textbook_id: TB_A, class_id: CLS }],
    [U_GHOST, { id: U_GHOST, name: 'Unit', textbook_id: TB_B, class_id: CLS }],
    [U_EMPTY, { id: U_EMPTY, name: 'Unit 1', textbook_id: TB_B, class_id: CLS }],
  ])
  // buildContext(studentHealthRules.mjs)가 실제로 만드는 형태를 그대로 맞춘다
  // — wordCountByUnit / nameCounts 를 빠뜨리면 정상 학생조차 unit_word_count /
  // chain_end_to_end 에서 FAIL 이 나서 "새 규칙이 잡았다"는 관찰이 오염된다
  // (이 테스트를 처음 쓸 때 실제로 그 오염이 났고, 여기서 바로잡았다).
  const wordsByUnit = new Map()
  const wordCountByUnit = new Map()
  for (const w of words) {
    const l = wordsByUnit.get(w.unit_id) || []; l.push(w); wordsByUnit.set(w.unit_id, l)
    wordCountByUnit.set(w.unit_id, (wordCountByUnit.get(w.unit_id) || 0) + 1)
  }
  return {
    unitById, wordsByUnit, wordCountByUnit,
    // 방향은 교재 소유 반 -> 홈 반 순으로 해석되므로 반에 직접 얹는다.
    classById: new Map([[CLS, { id: CLS, name: '실반', spelling_direction: 'kr2en' }]]),
    textbookById: new Map([[TB_A, { id: TB_A, name: '교재A', owner_class_id: CLS }], [TB_B, { id: TB_B, name: '교재B', owner_class_id: CLS }]]),
    assignmentsByStudent: new Map(),
    nameCounts: new Map([['실학생', 1]]),
  }
}

// 학생 1명 + 그 학생의 SCA 행들로 평가한다. 나머지 조건은 전부 정상이라
// 새 규칙 외의 코드로는 FAIL 이 나지 않는다(오염 없는 단독 관찰).
function evalWith(assignments, currentUnitId = U_OK) {
  const ctx = baseCtx()
  const student = { id: 'stu-1', name: '실학생', class_id: CLS, current_unit_id: currentUnitId }
  ctx.assignmentsByStudent.set('stu-1', assignments)
  return evaluateStudent(student, ctx)
}
// 코드는 checks[].code 가 아니라 별도 codes 배열에 `CODE:detail` 형태로 담긴다.
const codesOf = (r) => (r?.codes || []).map((c) => String(c).split(':')[0])
// 이 규칙의 심각도는 WARN 이다(FAIL 아님) — 코드 회귀가 아니라 운영자 SQL 이
// 필요한 데이터 부채라, FAIL 로 두면 Release Gate 가 모든 배포를 무기한 막는다.
const warnsOf = (r) => (r?.warnings || []).map((w) => String(w).split(':')[0])
const failedIds = (r) => (r?.checks || []).filter((c) => !c.ok).map((c) => c.id)

console.log('\n=== SCA 유령 유닛 참조 감지 규칙 ===\n')

console.log('0. 전제 — isGhostUnit 은 0단어만으로 유령 판정하지 않는다')
{
  const ctx = baseCtx()
  check('이름 "Unit"(번호 없음) + 헤더 라벨 단어 -> 유령',
    isGhostUnit(ctx.unitById.get(U_GHOST), ctx.wordsByUnit.get(U_GHOST) || []).ghost === true)
  check('이름 "Unit 1" + 0단어 -> 유령 아님(교사 미업로드 가능성)',
    isGhostUnit(ctx.unitById.get(U_EMPTY), []).ghost === false)
  check('26단어 정상 유닛 -> 유령 아님', isGhostUnit(ctx.unitById.get(U_SMALL), ctx.wordsByUnit.get(U_SMALL)).ghost === false)
  check('40단어 정상 유닛 -> 유령 아님', isGhostUnit(ctx.unitById.get(U_OK), ctx.wordsByUnit.get(U_OK)).ghost === false)
  check('GHOST_MAX_WORDS 가 작은 값이라 정상 유닛은 구조적으로 유령 불가', GHOST_MAX_WORDS <= 3, String(GHOST_MAX_WORDS))
}

console.log('\n1. [핵심 사각지대] 실측 25행 재현 — 보조 배정이 유령 유닛을 가리킴')
{
  // 지금 쓰는 유닛(U_OK)은 정상이고, 보조 교재 배정 행만 유령을 가리킨다.
  // 라이브에서 실학생 19명이 정확히 이 형태였다.
  const r = evalWith([
    { id: 'a1', textbook_id: TB_A, current_unit_id: U_OK, is_primary: true },
    { id: 'a2', textbook_id: TB_B, current_unit_id: U_GHOST, is_primary: false },
  ])
  check('감지된다(WARN 이 올라온다)', warnsOf(r).includes('ASSIGNMENT_GHOST_UNIT'), JSON.stringify(r?.warnings))
  check('경고 문구에 교재·유닛이 특정된다', /교재B.*Unit/.test(String(r?.warnings)), JSON.stringify(r?.warnings))
  check('전체 상태가 WARN 이다(FAIL 로 배포를 막지 않는다)', r?.status === 'WARN', String(r?.status))
  check('FAIL 코드는 올라오지 않는다', codesOf(r).length === 0, JSON.stringify(r?.codes))
}

console.log('\n2. primary 배정이 유령 유닛을 가리키는 경우 (실측 17명)')
{
  const r = evalWith([
    { id: 'a1', textbook_id: TB_B, current_unit_id: U_GHOST, is_primary: true },
  ], U_OK)
  check('감지된다(WARN)', warnsOf(r).includes('ASSIGNMENT_GHOST_UNIT'), JSON.stringify(r?.warnings))
}

console.log('\n3. [오탐 방지] 정상 배정은 영향 없음')
{
  const ok = evalWith([
    { id: 'a1', textbook_id: TB_A, current_unit_id: U_OK, is_primary: true },
    { id: 'a2', textbook_id: TB_A, current_unit_id: U_SMALL, is_primary: false },
  ])
  check('40단어 + 26단어 배정은 경고 대상이 아니다', !warnsOf(ok).includes('ASSIGNMENT_GHOST_UNIT'), JSON.stringify(ok?.warnings))
}

console.log('\n4. [핵심 조건] 0단어 유닛만으로는 오류가 아니다')
{
  const r = evalWith([
    { id: 'a1', textbook_id: TB_A, current_unit_id: U_OK, is_primary: true },
    { id: 'a2', textbook_id: TB_B, current_unit_id: U_EMPTY, is_primary: false },
  ])
  check('이름이 정상인 0단어 유닛 배정은 경고하지 않는다',
    !warnsOf(r).includes('ASSIGNMENT_GHOST_UNIT'), JSON.stringify(r?.warnings))
}

console.log('\n5. current_unit_id 가 없는 배정 행은 무해(오탐 방지)')
{
  const r = evalWith([
    { id: 'a1', textbook_id: TB_A, current_unit_id: U_OK, is_primary: true },
    { id: 'a2', textbook_id: TB_B, current_unit_id: null, is_primary: false },
  ])
  check('current_unit_id null 은 경고 대상이 아니다', !warnsOf(r).includes('ASSIGNMENT_GHOST_UNIT'), JSON.stringify(r?.warnings))
}

console.log('\n6. 기존 검사 의미 무변경 (회귀 방지)')
{
  const r = evalWith([{ id: 'a1', textbook_id: TB_A, current_unit_id: U_OK, is_primary: true }])
  check('완전 정상 학생은 여전히 PASS', r?.status === 'PASS', String(r?.status) + ' ' + JSON.stringify(failedIds(r)))
  const ids = (r?.checks || []).map((c) => c.id)
  for (const must of ['unit_not_ghost', 'no_assignment_conflict', 'unit_word_count', 'unit_belongs_to_textbook']) {
    check(`기존 검사 ${must} 가 그대로 존재`, ids.includes(must))
  }
  check('신규 검사가 별도 id 로 추가됐다', ids.includes('no_assignment_ghost_unit'), JSON.stringify(ids.slice(-4)))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — SCA 가 유령 유닛을 가리키면 감지되고, 0단어만으로는 오탐하지 않는다')
