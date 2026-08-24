// Excel 업로드 — 헤더 행이 가짜 "Unit" 유닛으로 생성되는 재발 방지 계약
// (2026-08-25, 실사고 6건 전수 확인 후)
//
// ── 사고 요약 ───────────────────────────────────────────────────────────
// 교재 9개 중 6개에 이름이 정확히 "Unit"이고 단어가 1개뿐인 유닛이 있었다.
// 그 1개 단어의 정체는 전부 엑셀 헤더 라벨이었다:
//   "English"/"Korean"      — 중2 천재 이상기 / 중2 능률 김기택 /
//                             중2 YMB 박준원 / 중1 동아 윤정미 / 고1 능률 민병천
//   "Word / Phrase"/"뜻"    — 2학년 천재소영순
// 생성 타임라인(2학년 천재소영순, UTC):
//   14:19:05 unit "Unit" 생성 -> 14:19:07 단어 1개 -> 14:19:11 unit "Unit1"
//   -> 14:19:13 단어 40개  = 한 번의 업로드 안에서 연속 발생.
//
// ── 코드 경로 ───────────────────────────────────────────────────────────
// detectHeaderMap이 완전 일치만 인정해 "Word / Phrase"/"English"를 헤더로
// 못 알아본다 -> hasHeader=false -> rows.slice(1)이 적용되지 않아 헤더 행이
// 데이터로 편입 -> 위치 추정 분기의 isUnit 정규식 /^(unit|유닛)\s*\d*/i 이
// \d* 로 "숫자 0자리"를 허용해 헤더 라벨 "Unit" 자체를 유닛 값으로 인정
// -> unit="Unit", word="Word / Phrase", meaning="뜻" 행이 만들어지고
// -> AdminScreen 저장 루프가 byUnit["Unit"] 그룹을 만들어 setClassWords ->
//    wordLibrary.ensureUnit이 "Unit" 유닛을 실제로 DB에 생성한다.
//
// ── 이 파일이 고정하는 계약(B안 — 범위 한정) ───────────────────────────
//   ① 헤더 라벨("Unit"/"유닛"/"단원")은 유닛 값으로 인정하지 않는다.
//      정상 유닛 이름(Unit1 / Unit 2 / 유닛3 / Unit 10 ...)은 전부 유지.
//   ② 위치 추정 경로의 첫 행이 word·meaning **둘 다** 헤더 라벨이면 그
//      행을 버린다(가짜 단어 방지). 둘 중 하나만 헤더 라벨인 행은 실제
//      단어일 수 있으므로 절대 버리지 않는다.
//   ③ hasHeader 판정식 자체는 건드리지 않는다(운영자 지시 — B안).
//      AND -> OR 전환은 "meaning만 매칭되는 파일의 첫 데이터 행이 잘리는"
//      회귀 위험이 실재해 이번 범위에서 의도적으로 제외한다.
//
// ── 테스트 방식 ─────────────────────────────────────────────────────────
// parseExcelRows는 export되지 않은 모듈 내부 함수지만 import가 하나도 없는
// 순수 함수다(React/xlsx/wordLibrary 무의존). AdminScreen.jsx는 412KB짜리
// 거대 컴포넌트라 통째로 번들하면 브라우저 API 때문에 Node에서 못 돈다.
// 그래서 **실제 소스 텍스트에서 해당 구간만 잘라내 그대로 실행**한다 —
// 로직을 재구현하지 않는다(TESTING.md 원칙). 소스가 바뀌어 추출에 실패하면
// 조용히 통과하지 않고 즉시 FAIL한다.
//
// 네트워크 0 / Supabase 0 / DB 무접촉.
// 실행: node scripts/testExcelHeaderGuard.mjs
import fs from 'node:fs'
import path from 'node:path'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// ════════════════════════════════════════════════════════════════════════
// 실제 소스에서 HEADER_ALIASES ~ parseExcelRows 구간 추출
// ════════════════════════════════════════════════════════════════════════
const SRC_PATH = path.resolve('src/components/AdminScreen.jsx')
const src = fs.readFileSync(SRC_PATH, 'utf8')

const startIdx = src.indexOf('const HEADER_ALIASES = {')
const fnIdx = src.indexOf('function parseExcelRows(')
if (startIdx === -1 || fnIdx === -1 || fnIdx < startIdx) {
  console.log('  FAIL  AdminScreen.jsx에서 HEADER_ALIASES / parseExcelRows를 찾지 못함 — 테스트 전제 붕괴')
  process.exit(1)
}
// parseExcelRows의 본문 끝을 중괄호 균형으로 찾는다(문자열/주석 안의
// 중괄호까지 정확히 세지는 않지만, 이 함수 본문에는 그런 케이스가 없다 —
// 아래 추출 검증 단언이 실패하면 즉시 드러난다).
const bodyStart = src.indexOf('{', fnIdx)
let depth = 0, endIdx = -1
for (let i = bodyStart; i < src.length; i++) {
  const ch = src[i]
  if (ch === '{') depth++
  else if (ch === '}') { depth--; if (depth === 0) { endIdx = i + 1; break } }
}
if (endIdx === -1) {
  console.log('  FAIL  parseExcelRows 본문의 끝을 찾지 못함 — 테스트 전제 붕괴')
  process.exit(1)
}
const extracted = src.slice(startIdx, endIdx)

let parseExcelRows, detectHeaderMap, HEADER_ALIASES
try {
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${extracted}\nreturn { parseExcelRows, detectHeaderMap, HEADER_ALIASES }`)
  ;({ parseExcelRows, detectHeaderMap, HEADER_ALIASES } = factory())
} catch (e) {
  console.log(`  FAIL  추출한 소스 실행 실패 — ${e.message}`)
  process.exit(1)
}

console.log('=== 소스 추출 검증 ===')
check('parseExcelRows 추출됨', typeof parseExcelRows === 'function')
check('detectHeaderMap 추출됨', typeof detectHeaderMap === 'function')
check('HEADER_ALIASES 추출됨', HEADER_ALIASES && typeof HEADER_ALIASES === 'object')
check('추출 구간이 실제 소스와 동일(재구현 아님)', src.includes(extracted))
if (failures > 0) { console.log('\n전제 붕괴 — 중단'); process.exit(1) }

const units = (rows) => parseExcelRows(rows, '테스트반').map((r) => r.unit)
const hasFakeUnit = (rows) => units(rows).some((u) => /^(unit|유닛|단원)$/i.test(String(u).trim()))

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE A — 실사고 재현: "Word / Phrase" 헤더 (2학년 천재소영순) ===')
// ════════════════════════════════════════════════════════════════════════
const soyRows = [
  ['Unit', 'Word / Phrase', '뜻'],
  ['Unit1', 'apple', '사과'],
  ['Unit1', 'book', '책'],
  ['Unit1', 'cat', '고양이'],
]
const soy = parseExcelRows(soyRows, '2학년 천재소영순')
check('가짜 유닛 "Unit"이 생성되지 않는다', !hasFakeUnit(soyRows), { units: units(soyRows) })
check('헤더 행이 단어로 저장되지 않는다', !soy.some((r) => r.word === 'Word / Phrase'), { words: soy.map((r) => r.word) })
check('정상 단어 3개는 그대로 통과', soy.filter((r) => r.unit === 'Unit1').length === 3, { got: soy.length })

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE B — 실사고 재현: "English"/"Korean" 헤더 (교재 5종) ===')
// ════════════════════════════════════════════════════════════════════════
const engRows = [
  ['Unit', 'English', 'Korean'],
  ['Unit6', 'dog', '개'],
  ['Unit6', 'egg', '달걀'],
]
const eng = parseExcelRows(engRows, '중2 천재 이상기')
check('가짜 유닛 "Unit"이 생성되지 않는다', !hasFakeUnit(engRows), { units: units(engRows) })
check('헤더 행이 단어로 저장되지 않는다', !eng.some((r) => r.word === 'English'), { words: eng.map((r) => r.word) })
check('정상 단어 2개는 그대로 통과', eng.filter((r) => r.unit === 'Unit6').length === 2, { got: eng.length })

// 유닛 컬럼 없는 2열 헤더 파일도 같은 결과여야 한다
const eng2 = parseExcelRows([['English', 'Korean'], ['fish', '물고기']], '반')
check('2열 파일에서도 헤더 행이 단어로 저장되지 않는다', !eng2.some((r) => r.word === 'English'), { words: eng2.map((r) => r.word) })
check('2열 파일의 정상 단어는 통과', eng2.some((r) => r.word === 'fish'), { rows: eng2 })

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE C — 정상 유닛 이름 무회귀 (실DB 유닛명 전수) ===')
// ════════════════════════════════════════════════════════════════════════
// 2026-08-25 실측: units 45행에서 관측된 이름 형태 전부
const REAL_UNIT_NAMES = [
  'Unit1', 'Unit2', 'Unit3', 'Unit4', 'Unit5', 'Unit6', 'Unit7', 'Unit8', 'Unit9', 'Unit10',
  'Unit 1', 'Unit 2', 'Unit 4', 'Unit 5', 'Unit 6', 'Unit 9',
]
for (const name of REAL_UNIT_NAMES) {
  const r = parseExcelRows([[name, 'apple', '사과']], '반')
  check(`"${name}" -> 유닛으로 인정 (단어 apple/사과 유지)`,
    r.length === 1 && r[0].unit === name && r[0].word === 'apple' && r[0].meaning === '사과',
    { got: r })
}
// 한글/변형 표기도 기존대로 유지
for (const name of ['유닛3', 'unit 01', 'UNIT 12']) {
  const r = parseExcelRows([[name, 'book', '책']], '반')
  check(`"${name}" -> 유닛으로 인정`, r.length === 1 && r[0].unit === name, { got: r })
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE D — 헤더가 정상 인식되는 파일 무회귀 (hasHeader 경로) ===')
// ════════════════════════════════════════════════════════════════════════
const okHeader = parseExcelRows([
  ['unit', 'word', 'meaning'],
  ['Unit1', 'apple', '사과'],
  ['Unit2', 'book', '책'],
], '반')
check('헤더 행이 데이터에서 제외됨', okHeader.length === 2, { got: okHeader.length })
check('headerDetected 플래그 true 유지', okHeader.headerDetected === true)
check('유닛 매핑 정상', okHeader[0].unit === 'Unit1' && okHeader[1].unit === 'Unit2', { got: okHeader.map((r) => r.unit) })
check('단어/뜻 매핑 정상', okHeader[0].word === 'apple' && okHeader[0].meaning === '사과', { got: okHeader[0] })

// 한글 헤더
const krHeader = parseExcelRows([['유닛', '단어', '뜻'], ['Unit3', 'cat', '고양이']], '반')
check('한글 헤더도 정상 인식', krHeader.length === 1 && krHeader[0].unit === 'Unit3' && krHeader[0].word === 'cat', { got: krHeader })

// 선택 컬럼 4종(M3c 계약) — 헤더 감지 시에만 읽힌다
const optHeader = parseExcelRows([
  ['unit', 'word', 'meaning', 'example', '해석', '품사', 'cefr'],
  ['Unit1', 'apple', '사과', 'I ate an apple.', '나는 사과를 먹었다.', 'noun', 'A1'],
], '반')
check('example/exampleTranslation/pos/cefr 매핑 유지',
  optHeader[0].example === 'I ate an apple.' && optHeader[0].exampleTranslation === '나는 사과를 먹었다.'
  && optHeader[0].partOfSpeech === 'noun' && optHeader[0].cefr === 'A1', { got: optHeader[0] })

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE E — 헤더 없는 순수 데이터 파일 무회귀 (위치 추정 경로) ===')
// ════════════════════════════════════════════════════════════════════════
const plain = parseExcelRows([['apple', '사과'], ['book', '책'], ['cat', '고양이']], '반')
check('3행 전부 통과(첫 행이 잘리지 않음)', plain.length === 3, { got: plain.length })
check('첫 행 apple 보존 — 헤더로 오인되지 않음', plain[0].word === 'apple' && plain[0].meaning === '사과', { got: plain[0] })
check('유닛 기본값 "Unit 1"', plain.every((r) => r.unit === 'Unit 1'), { units: plain.map((r) => r.unit) })
check('headerDetected 플래그 false', plain.headerDetected === false)

// 유닛 컬럼이 있는 헤더 없는 파일
const plainUnit = parseExcelRows([['Unit5', 'dog', '개'], ['Unit5', 'egg', '달걀']], '반')
check('유닛 컬럼 있는 헤더 없는 파일 정상', plainUnit.length === 2 && plainUnit.every((r) => r.unit === 'Unit5'), { got: plainUnit })

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE F — 번호 열 경로 무회귀 (A6 수정, 2026-08-02) ===')
// ════════════════════════════════════════════════════════════════════════
const numbered = parseExcelRows([['1', 'apple', '사과'], ['2', 'book', '책']], '반')
check('번호 열이 word로 읽히지 않음', numbered.every((r) => !/^\d+$/.test(r.word)), { words: numbered.map((r) => r.word) })
check('번호 열 건너뛰고 단어/뜻 정상', numbered.length === 2 && numbered[0].word === 'apple' && numbered[1].word === 'book', { got: numbered })

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE G — 과잉 차단 방지 (실제 단어를 버리지 않는다) ===')
// ════════════════════════════════════════════════════════════════════════
// word 쪽만 헤더 라벨과 같은 실제 단어 — 반드시 살아남아야 한다
const realWord = parseExcelRows([['word', '말'], ['unit', '단위'], ['no', '아니오']], '반')
check('"word"/"말" 실제 단어 보존', realWord.some((r) => r.word === 'word' && r.meaning === '말'), { got: realWord })
check('"unit"/"단위" 실제 단어 보존', realWord.some((r) => r.word === 'unit' && r.meaning === '단위'), { got: realWord })
check('"no"/"아니오" 실제 단어 보존', realWord.some((r) => r.word === 'no' && r.meaning === '아니오'), { got: realWord })
check('3행 모두 보존', realWord.length === 3, { got: realWord.length })

// 헤더성 라벨이 첫 행이 아닌 위치에 있으면 건드리지 않는다(실제 단어일 수 있음)
const midRow = parseExcelRows([['apple', '사과'], ['english', 'korean']], '반')
check('첫 행이 아닌 헤더성 행은 버리지 않음', midRow.length === 2, { got: midRow })

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CASE H — B안 범위 준수: hasHeader 판정식 무변경 (정적) ===')
// ════════════════════════════════════════════════════════════════════════
const codeOnly = src
  .split('\n')
  .map((l) => l.replace(/\r$/, '').replace(/\/\/.*$/, ''))
  .join('\n')
check('hasHeader가 word && meaning AND 조건 그대로',
  /hasHeader\s*=\s*headerMap\.word\s*!==\s*undefined\s*&&\s*headerMap\.meaning\s*!==\s*undefined/.test(codeOnly))
check('hasHeader를 OR로 바꾸지 않았다(B안 범위)',
  !/hasHeader\s*=\s*headerMap\.word\s*!==\s*undefined\s*\|\|/.test(codeOnly))
check('dataRows 분기 유지', /dataRows\s*=\s*hasHeader\s*\?\s*rows\.slice\(1\)\s*:\s*rows/.test(codeOnly))
check('isUnit 정규식이 숫자를 필수로 요구(\\d+)', /\/\^\(unit\|유닛[^/]*\)\\s\*\\d\+\//.test(codeOnly),
  { hint: 'isUnit 정규식에 \\d* 가 남아있으면 헤더 라벨 "Unit"이 유닛으로 인정됨' })

// ════════════════════════════════════════════════════════════════════════
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
