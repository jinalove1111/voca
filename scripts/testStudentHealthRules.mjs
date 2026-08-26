// Student Health Check — 순수 판정 규칙 단위 테스트 (2026-08-26, P1)
//
// 왜 이 규칙이 필요한가(실사고 이력, 재조사 없이 인용):
//   최근 반복된 회귀는 코드 버그가 아니라 "학생별 해석 체인이 끊기는 것"
//   이었다. 로그인 → 반 → 주교재 → 유닛 → 단어 → 쓰기 방향으로 이어지는
//   체인 중 한 칸만 어긋나도 그 학생만 조용히 망가지는데, 코드 단위
//   테스트는 코드가 정상이므로 절대 못 잡는다.
//     · 전하은 — 중복 정리 리네임으로 로그인 ID("Haeun")가 사라져 not_found
//     · Song   — current_unit_id가 단어 0개 유닛을 가리켜 "단어 0개"
//     · Dain/문지유 — 엑셀 헤더가 만든 유령 유닛("Unit", 단어 1개)에 배정
//     · Presentation 6 — 주교재 소유 반이 kr2en이라 쓰기가 한 방향 고정
//
// 이 파일은 그 판정 규칙(순수 함수)만 검증한다. 네트워크 0, DB 0 —
// 픽스처로 8개 FAIL 코드를 각각 재현하고, 정상 학생이 오탐되지 않는지를
// 반증 테스트로 고정한다.
//
// 라이브 검사는 scripts/studentHealthCheck.mjs 가 담당한다(SELECT 전용).
//
// 실행: node scripts/testStudentHealthRules.mjs   (npm run verify:health-rules)
import * as rules from './lib/studentHealthRules.mjs'

const {
  CHECK_CODES,
  VALID_DIRECTIONS,
  buildContext,
  evaluateStudent,
  classifyAccount,
  summarize,
} = rules

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const has = (res, code) => Array.isArray(res?.codes) && res.codes.some((c) => c === code || String(c).startsWith(code + ':'))

// ── 정상 픽스처: 이 학생은 어떤 코드도 나오면 안 된다(오탐 반증 기준선) ──
const baseFixture = () => ({
  classes: [
    { id: 'c-home', name: '홈반', spelling_direction: 'kr2en' },
    { id: 'c-own', name: '교재소유반', spelling_direction: 'mixed' },
  ],
  textbooks: [{ id: 'tb-1', name: '교재1', owner_class_id: 'c-own' }],
  units: [{ id: 'u-1', name: 'Unit1', textbook_id: 'tb-1' }],
  words: [{ id: 'w1', unit_id: 'u-1' }, { id: 'w2', unit_id: 'u-1' }, { id: 'w3', unit_id: 'u-1' }],
  assignments: [{ student_id: 's-1', class_id: 'c-home', textbook_id: 'tb-1', is_primary: true }],
  students: [{ id: 's-1', name: '정상학생', class_id: 'c-home', current_unit_id: 'u-1' }],
})
const evalOne = (fx, id = 's-1') => {
  const ctx = buildContext(fx)
  return evaluateStudent(fx.students.find((s) => s.id === id), ctx)
}

console.log('\n=== 1절. 모듈 계약 ===')
check('buildContext / evaluateStudent / classifyAccount / summarize 가 export된 함수다',
  [buildContext, evaluateStudent, classifyAccount, summarize].every((f) => typeof f === 'function'))
check('CHECK_CODES에 9개 FAIL 코드가 전부 있다',
  ['LOGIN_FAIL', 'CLASS_INVALID', 'TEXTBOOK_MISSING', 'UNIT_INVALID', 'WORDS_ZERO',
    'ORPHAN_ASSIGNMENT', 'DUPLICATE', 'DIRECTION_INVALID', 'GHOST_UNIT'].every((c) => CHECK_CODES?.[c] === c),
  JSON.stringify(CHECK_CODES))
check('VALID_DIRECTIONS가 앱과 동일한 4종이다(wordLibrary.js VALID_SPELLING_DIRECTIONS)',
  VALID_DIRECTIONS instanceof Set
  && ['kr2en', 'en2kr', 'random', 'mixed'].every((d) => VALID_DIRECTIONS.has(d))
  && VALID_DIRECTIONS.size === 4)

console.log('\n=== 2절. 정상 학생은 어떤 코드도 나오지 않는다(오탐 반증) ===')
{
  const res = evalOne(baseFixture())
  check('정상 학생 status === PASS', res?.status === 'PASS', JSON.stringify(res?.codes))
  check('정상 학생 codes 배열이 비어 있다', Array.isArray(res?.codes) && res.codes.length === 0)
  check('해석된 반이 홈반이 아니라 교재 소유 반이다(앱 리졸버와 동일)',
    res?.resolved?.directionClassName === '교재소유반', JSON.stringify(res?.resolved))
  check('해석된 방향이 교재 소유 반의 mixed다', res?.resolved?.direction === 'mixed')
  check('단어 수가 3으로 집계된다', res?.resolved?.wordCount === 3)
  check('17개 체인 검사가 전부 기록된다', Array.isArray(res?.checks) && res.checks.length >= 17,
    `checks=${res?.checks?.length}`)
}

console.log('\n=== 3절. FAIL 코드 8종을 각각 재현 ===')
{
  const fx = baseFixture(); fx.students[0].name = ''
  check('LOGIN_FAIL — 빈 이름', has(evalOne(fx), 'LOGIN_FAIL'))
}
{
  const fx = baseFixture(); fx.students[0].name = ' 정상학생 '
  check('LOGIN_FAIL — 앞뒤 공백(서버 trim 후 ilike라 DB값과 불일치)', has(evalOne(fx), 'LOGIN_FAIL'))
}
{
  const fx = baseFixture(); fx.students[0].name = '100%'
  check('LOGIN_FAIL — ilike 와일드카드(%) 포함', has(evalOne(fx), 'LOGIN_FAIL'))
}
{
  const fx = baseFixture(); fx.students[0].name = 'a_b'
  check('LOGIN_FAIL — ilike 와일드카드(_) 포함', has(evalOne(fx), 'LOGIN_FAIL'))
}
{
  const fx = baseFixture()
  fx.students.push({ id: 's-2', name: '정상학생', class_id: 'c-home', current_unit_id: 'u-1' })
  fx.assignments.push({ student_id: 's-2', class_id: 'c-home', textbook_id: 'tb-1', is_primary: true })
  check('DUPLICATE — 같은 이름 활성 계정 2개(로그인 duplicate_accounts 예측)',
    has(evalOne(fx), 'DUPLICATE'))
}
{
  const fx = baseFixture(); fx.students[0].class_id = null
  check('CLASS_INVALID — class_id 없음', has(evalOne(fx), 'CLASS_INVALID'))
}
{
  const fx = baseFixture(); fx.students[0].class_id = 'c-nope'
  check('CLASS_INVALID — 존재하지 않는 반(orphan FK)', has(evalOne(fx), 'CLASS_INVALID'))
}
{
  const fx = baseFixture(); fx.assignments = []
  check('TEXTBOOK_MISSING — primary 배정 없음', has(evalOne(fx), 'TEXTBOOK_MISSING'))
}
{
  const fx = baseFixture(); fx.assignments[0].textbook_id = 'tb-nope'
  const res = evalOne(fx)
  check('TEXTBOOK_MISSING — 존재하지 않는 교재(orphan)', has(res, 'TEXTBOOK_MISSING'))
  check('ORPHAN_ASSIGNMENT — 같은 상황에서 배정 고아도 함께 표시', has(res, 'ORPHAN_ASSIGNMENT'))
}
{
  const fx = baseFixture()
  fx.assignments.push({ student_id: 's-1', class_id: 'c-nope', textbook_id: 'tb-1', is_primary: false })
  check('ORPHAN_ASSIGNMENT — 비-primary 배정의 반이 고아', has(evalOne(fx), 'ORPHAN_ASSIGNMENT'))
}
{
  const fx = baseFixture(); fx.students[0].current_unit_id = null
  check('UNIT_INVALID — current_unit_id 없음', has(evalOne(fx), 'UNIT_INVALID'))
}
{
  const fx = baseFixture(); fx.students[0].current_unit_id = 'u-nope'
  check('UNIT_INVALID — 존재하지 않는 유닛(orphan)', has(evalOne(fx), 'UNIT_INVALID'))
}
{
  // 교재를 바꿨는데 current_unit_id가 옛 교재 유닛에 남은 상태(실사고 유형)
  const fx = baseFixture()
  fx.textbooks.push({ id: 'tb-2', name: '교재2', owner_class_id: 'c-own' })
  fx.units.push({ id: 'u-2', name: 'OtherUnit', textbook_id: 'tb-2' })
  fx.words.push({ id: 'w9', unit_id: 'u-2' }, { id: 'w10', unit_id: 'u-2' })
  fx.students[0].current_unit_id = 'u-2'
  check('UNIT_INVALID — 유닛이 현재 주교재 소속이 아님(교재 전환 후 stale)',
    has(evalOne(fx), 'UNIT_INVALID'))
}
{
  const fx = baseFixture(); fx.words = []
  check('WORDS_ZERO — 유닛 단어 0개(Song 실사고 유형)', has(evalOne(fx), 'WORDS_ZERO'))
}
{
  const fx = baseFixture(); fx.classes[1].spelling_direction = 'korean'
  check('DIRECTION_INVALID — 허용되지 않는 값', has(evalOne(fx), 'DIRECTION_INVALID'))
}
{
  // mixed인데 단어가 1개 → assignDirections(1,'mixed')는 동전던지기 1개라
  // 한 세션 안에서 양방향이 구조적으로 불가능(Dain/문지유 실사고 유형).
  const fx = baseFixture(); fx.words = [{ id: 'w1', unit_id: 'u-1' }]
  const res = evalOne(fx)
  check('DIRECTION_INVALID — mixed인데 단어 1개라 양방향 생성 불가',
    has(res, 'DIRECTION_INVALID'), JSON.stringify(res?.codes))
}
{
  const fx = baseFixture(); fx.words = [{ id: 'w1', unit_id: 'u-1' }, { id: 'w2', unit_id: 'u-1' }]
  check('반증 — mixed + 단어 2개는 양방향 가능하므로 DIRECTION_INVALID 아님',
    !has(evalOne(fx), 'DIRECTION_INVALID'))
}
{
  const fx = baseFixture(); fx.classes[1].spelling_direction = 'kr2en'; fx.words = [{ id: 'w1', unit_id: 'u-1' }]
  check('반증 — kr2en은 단어 1개여도 방향 문제 아님(설정대로 단방향)',
    !has(evalOne(fx), 'DIRECTION_INVALID'))
}

console.log('\n=== 4절. 앱 리졸버와 동일한 우선순위 (교재 소유 반 → 홈 반 → 기본값) ===')
{
  const fx = baseFixture(); fx.assignments = []   // primary 없음 → 홈 반으로 폴백
  const res = evalOne(fx)
  check('primary 교재가 없으면 홈 반 설정으로 폴백한다', res?.resolved?.direction === 'kr2en',
    JSON.stringify(res?.resolved))
}
{
  const fx = baseFixture(); fx.assignments = []; fx.students[0].class_id = null
  const res = evalOne(fx)
  check('홈 반도 없으면 안전한 기본값 kr2en (mixed로 흡수하지 않는다)',
    res?.resolved?.direction === 'kr2en', JSON.stringify(res?.resolved))
}
{
  const fx = baseFixture()   // 홈반 kr2en, 교재소유반 mixed → 교재 쪽이 이겨야 함
  check('홈 반과 교재 소유 반이 다르면 교재 소유 반이 이긴다',
    evalOne(fx)?.resolved?.direction === 'mixed')
}

console.log('\n=== 5절. 계정 분류(실학생 / 아카이브 / 테스트 / QA반 픽스처) ===')
{
  const fx = baseFixture()
  fx.classes.push({ id: 'c-qa', name: 'QA_SelfSetupTest', spelling_direction: 'kr2en' })
  const ctx = buildContext(fx)
  const cls = (name, class_id) => classifyAccount({ id: 'x', name, class_id }, ctx)
  check('실학생 → REAL', cls('전하은', 'c-home') === 'REAL')
  check('_INACTIVE 접미 → ARCHIVED', cls('전하은_DUP_20260716_4486d4_INACTIVE', 'c-home') === 'ARCHIVED')
  check('_DUP2 접미 → ARCHIVED', cls('Irene_DUP2_145397_INACTIVE', 'c-home') === 'ARCHIVED')
  check('QA_ 접두 이름 → TEST', cls('QA_SyncTest', 'c-home') === 'TEST')
  check('accountStatus.js TEST_ACCOUNT_NAMES(cookie) → TEST', cls('Cookie', 'c-home') === 'TEST')
  check('accountStatus.js TEST_ACCOUNT_NAMES(barry) → TEST', cls('Barry', 'c-home') === 'TEST')
  // 조사에서 발견한 갭 — 이름은 평범한데 소속 반이 QA_* 인 픽스처
  // (Cksa/QACombo1). 이름만 보는 기존 규칙으로는 "실학생"으로 샜다.
  check('이름은 평범하나 소속 반이 QA_* → QA_FIXTURE (이름만 보던 갭 보완)',
    cls('Cksa', 'c-qa') === 'QA_FIXTURE')
  check('반이 QA_*가 아니면 같은 이름도 REAL', cls('Cksa', 'c-home') === 'REAL')
}

console.log('\n=== 6절. 등급 — DIRECTION random은 WARN(운영자 결정 대기), FAIL 아님 ===')
{
  const fx = baseFixture(); fx.classes[1].spelling_direction = 'random'
  const res = evalOne(fx)
  check('random은 유효값이라 FAIL이 아니다', res?.status !== 'FAIL', JSON.stringify(res?.codes))
  check('random은 WARN으로 표시된다(총량 균형 미보장 — 20/0 가능)',
    res?.status === 'WARN' && res.warnings?.some((w) => String(w).startsWith('DIRECTION_RANDOM')),
    JSON.stringify(res?.warnings))
}

console.log('\n=== 7절. summarize — 집계/exit 판정 ===')
{
  const fx = baseFixture()
  fx.students.push({ id: 's-bad', name: '문제학생', class_id: 'c-home', current_unit_id: null })
  fx.assignments.push({ student_id: 's-bad', class_id: 'c-home', textbook_id: 'tb-1', is_primary: true })
  const ctx = buildContext(fx)
  const results = fx.students.map((s) => evaluateStudent(s, ctx))
  const sum = summarize(results)
  check('summarize.total = 2', sum?.total === 2)
  check('summarize.pass = 1', sum?.pass === 1)
  check('summarize.fail = 1', sum?.fail === 1)
  check('summarize.byCode에 UNIT_INVALID 1건', sum?.byCode?.UNIT_INVALID === 1, JSON.stringify(sum?.byCode))
  check('summarize.ok === false (FAIL이 있으면 게이트 실패)', sum?.ok === false)
  check('FAIL이 없으면 ok === true', summarize([evaluateStudent(fx.students[0], ctx)])?.ok === true)
}

console.log('\n=== 8절. 방어 — 잘못된 입력에도 throw하지 않는다 ===')
for (const bad of [null, undefined, {}, { id: 'x' }]) {
  check(`evaluateStudent(${JSON.stringify(bad)}) 가 throw하지 않는다`,
    (() => { try { evaluateStudent(bad, buildContext(baseFixture())); return true } catch { return false } })())
}
check('buildContext가 빈 입력에도 throw하지 않는다',
  (() => { try { buildContext({}); return true } catch { return false } })())
check('순수 모듈 — 네트워크/DB import가 없다',
  !/supabase|createClient|node:fs|fetch\s*\(/.test(
    (await import('node:fs')).readFileSync(new URL('./lib/studentHealthRules.mjs', import.meta.url), 'utf8')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')))

console.log('\n=== 9절. 유령 유닛(ghost unit) 탐지 ===')
// 2026-08-26 P1 결함 수정. 엑셀 헤더 행이 데이터로 편입돼 만들어진 가짜
// 유닛이 실데이터에 7개 남아 있다(교재 6개의 "Unit" + 중1 동아 윤정미의
// "Unit1"). 그 유닛의 "단어"는 전부 헤더 라벨이다:
//     "English"="Korean" / "Word / Phrase"="뜻" / "No."="어휘·어구"
// 최초 구현은 이들을 DIRECTION_INVALID(mixed인데 단어 1개)로 **간접**
// 검출만 했다. 방향이 kr2en이면 단어 1개 > 0 이라 WORDS_ZERO도 아니고
// 방향도 유효해서 조용히 PASS가 된다 — 학생이 헤더 라벨을 단어라고
// 공부하는데 헬스체크는 정상이라고 답한다. 그게 이 절이 고정하는 결함이다.
//
// 판정 근거는 앱의 정의를 그대로 쓴다(재발명 금지):
//   AdminScreen.jsx HEADER_ALIASES / isHeaderLabel (커밋 4379a4d)
{
  const ghostFixture = (unitName, wordsIn) => {
    const fx = baseFixture()
    fx.classes[1].spelling_direction = 'kr2en'   // ★ mixed가 아니어도 잡혀야 한다
    fx.units = [{ id: 'u-1', name: unitName, textbook_id: 'tb-1' }]
    fx.words = wordsIn.map((w, i) => ({ id: `w${i}`, unit_id: 'u-1', word: w[0], meaning: w[1] }))
    return fx
  }
  check('isGhostUnit / findGhostUnits 가 export된 함수다',
    typeof rules.isGhostUnit === 'function' && typeof rules.findGhostUnits === 'function')

  // (A) 이름에 숫자가 없는 unit 별칭 — 실데이터 6/6 적중, 오탐 0
  const byName = ghostFixture('Unit', [['English', 'Korean']])
  check('GHOST_UNIT — 이름이 "Unit"(숫자 없음)이고 kr2en이어도 FAIL로 잡힌다',
    has(evalOne(byName), 'GHOST_UNIT'), JSON.stringify(evalOne(byName).codes))
  check('GHOST_UNIT — "유닛"(한글 별칭, 숫자 없음)도 잡힌다',
    has(evalOne(ghostFixture('유닛', [['English', 'Korean']])), 'GHOST_UNIT'))

  // (B) 이름은 정상인데 내용이 헤더 라벨 — 실데이터 "Unit1" / "No."="어휘·어구"
  check('GHOST_UNIT — 이름이 "Unit1"이어도 내용이 헤더쌍이면 잡힌다("No."="어휘·어구")',
    has(evalOne(ghostFixture('Unit1', [['No.', '어휘·어구']])), 'GHOST_UNIT'))
  check('GHOST_UNIT — "Word / Phrase"="뜻" 헤더쌍도 잡힌다',
    has(evalOne(ghostFixture('Unit1', [['Word / Phrase', '뜻']])), 'GHOST_UNIT'))

  // 오탐 반증 — 정상 유닛은 절대 ghost가 아니어야 한다
  check('반증 — 정상 유닛(Unit1, 실제 어휘 3개)은 ghost 아님',
    !has(evalOne(baseFixture()), 'GHOST_UNIT'))
  const bigUnit = ghostFixture('Unit1', Array.from({ length: 40 }, (_, i) => [`word${i}`, `뜻${i}`]))
  check('반증 — 40단어 정상 유닛은 ghost 아님', !has(evalOne(bigUnit), 'GHOST_UNIT'))
  // 실제 어휘가 우연히 헤더 라벨과 같을 수 있다("word"="단어"는 진짜 단어다).
  // 큰 유닛이면 절대 ghost로 보지 않는다 — 오탐 방지 핵심 가드.
  const realWordUnit = ghostFixture('Unit2',
    [['word', '단어'], ...Array.from({ length: 39 }, (_, i) => [`w${i}`, `뜻${i}`])])
  check('반증 — 40단어 유닛에 "word"="단어"가 섞여 있어도 ghost 아님(오탐 방지)',
    !has(evalOne(realWordUnit), 'GHOST_UNIT'))
  check('반증 — 단어 0개 유닛은 WORDS_ZERO이지 GHOST_UNIT이 아니다',
    !has(evalOne(ghostFixture('Unit1', [])), 'GHOST_UNIT'))

  // 저장소 전체 유령 유닛 인벤토리 — 학생이 배정되지 않은 것까지 찾는다
  {
    const fx = baseFixture()
    fx.units = [
      { id: 'g1', name: 'Unit', textbook_id: 'tb-1' },
      { id: 'g2', name: 'Unit1', textbook_id: 'tb-1' },
      { id: 'ok', name: 'Unit2', textbook_id: 'tb-1' },
    ]
    fx.words = [
      { id: 'a', unit_id: 'g1', word: 'English', meaning: 'Korean' },
      { id: 'b', unit_id: 'g2', word: 'No.', meaning: '어휘·어구' },
      ...Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, unit_id: 'ok', word: `w${i}`, meaning: `뜻${i}` })),
    ]
    const ghosts = rules.findGhostUnits(buildContext(fx))
    check('findGhostUnits — 학생 배정과 무관하게 유령 유닛 2개를 찾는다',
      Array.isArray(ghosts) && ghosts.length === 2, JSON.stringify(ghosts?.map((g) => g.name)))
    check('findGhostUnits — 정상 유닛은 포함하지 않는다',
      !ghosts?.some((g) => g.id === 'ok'))
    check('findGhostUnits — 사유(reason)를 함께 돌려준다',
      ghosts?.every((g) => typeof g.reason === 'string' && g.reason.length > 0))
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('ALL PASS')
