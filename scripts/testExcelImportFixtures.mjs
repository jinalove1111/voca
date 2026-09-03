// Excel 업로드 파서(parseExcelRows) — fixture 스위트 (2026-09-04, overnight QA T3)
//
// 목적: canonical(Unit|Word|Meaning)/legacy alias(No|번호, 단어, 뜻)/선택 컬럼
// (example/pronunciation/POS/level) 헤더, Unit 표기(Unit1/Unit 1/1/유닛 1)
// 정규화 여부, 40/미만/초과 행 절단·패딩 없음, invalid/fail-safe 케이스
// (빈 헤더, 헤더 없음, 숫자만 유닛, 빈 유닛 칸, 중복 단어, 빈 단어/뜻,
// 공백뿐 셀, 헤더 행 중복, "Unit" 1단어 유령 유닛)를 한 자리에서 고정한다.
//
// 이 하네스는 기존 scripts/testExcelHeaderGuard.mjs와 동일한 원칙을 쓴다 —
// parseExcelRows는 export되지 않은 순수 함수이고 AdminScreen.jsx는 거대
// 컴포넌트라 통째로 번들할 수 없으므로, 실제 소스 텍스트에서 해당 구간만
// 잘라내 그대로 실행한다(로직 재구현 0). src/utils/excelHeaderGuard.js의
// 실제 소스도 함께 합쳐 실행한다(단일 원천 준수).
//
// `check()`는 "현재 실제 동작"을 고정하는 단언 — 전부 PASS해야 정상이다.
// `gap()`은 규칙 15/작업 지시의 "명시적 경고 요구사항" 분석 전용 — invalid
// fixture가 admin에게 아무 경고 신호도 주지 못하면 FAIL로, 설계상 의도된
// 비일관성(예: Unit1 vs Unit 1 미정규화)은 WARN으로 기록한다. gap()은
// 현재 코드의 결함 여부를 판단하는 리포트용 태그일 뿐 exit code에 영향을
// 주지 않는다 — 여기서 드러난 FAIL/WARN은 코드를 고치지 않고(위험도가
// 낮지 않거나 운영자 판단이 필요) 최종 보고서에 원인과 최소 수정안만 남긴다.
//
// 네트워크 0 / Supabase 0 / DB 무접촉.
// 실행: node scripts/testExcelImportFixtures.mjs
import fs from 'node:fs'
import path from 'node:path'

let failures = 0
let asserted = 0
const check = (label, cond, extra) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const gapLog = []
const gap = (status, label, cause, fixProposal) => {
  gapLog.push({ status, label, cause, fixProposal })
  console.log(`  ${status}  [gap] ${label} — ${cause}`)
}

// ════════════════════════════════════════════════════════════════════════
// 실제 소스에서 HEADER_ALIASES ~ parseExcelRows 구간 추출 (testExcelHeaderGuard.mjs와 동일 기법)
// ════════════════════════════════════════════════════════════════════════
const SRC_PATH = path.resolve('src/components/AdminScreen.jsx')
const src = fs.readFileSync(SRC_PATH, 'utf8')

const GUARD_PATH = path.resolve('src/utils/excelHeaderGuard.js')
const guardSrcRaw = fs.readFileSync(GUARD_PATH, 'utf8')
const guardSrc = guardSrcRaw.replace(/^export\s+/gm, '')

const fnIdx = src.indexOf('function detectHeaderMap(')
const parseFnIdx = src.indexOf('function parseExcelRows(')
if (fnIdx === -1 || parseFnIdx === -1 || parseFnIdx < fnIdx) {
  console.log('  FAIL  AdminScreen.jsx에서 detectHeaderMap / parseExcelRows를 찾지 못함 — 테스트 전제 붕괴')
  process.exit(1)
}
const bodyStart = src.indexOf('{', parseFnIdx)
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
const extracted = src.slice(fnIdx, endIdx)

let parseExcelRows, detectHeaderMap, HEADER_ALIASES, sanitizeUnitLabel
try {
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${guardSrc}\n${extracted}\nreturn { parseExcelRows, detectHeaderMap, HEADER_ALIASES, sanitizeUnitLabel }`)
  ;({ parseExcelRows, detectHeaderMap, HEADER_ALIASES, sanitizeUnitLabel } = factory())
} catch (e) {
  console.log(`  FAIL  추출한 소스 실행 실패 — ${e.message}`)
  process.exit(1)
}

console.log('=== 소스 추출 검증 ===')
check('parseExcelRows 추출됨', typeof parseExcelRows === 'function')
check('detectHeaderMap 추출됨', typeof detectHeaderMap === 'function')
check('HEADER_ALIASES 추출됨', HEADER_ALIASES && typeof HEADER_ALIASES === 'object')
check('sanitizeUnitLabel 추출됨', typeof sanitizeUnitLabel === 'function')
check('추출 구간이 실제 소스와 동일(재구현 아님)', src.includes(extracted))
if (failures > 0) { console.log('\n전제 붕괴 — 중단'); process.exit(1) }

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Canonical 헤더 (Unit | Word | Meaning) ===')
// ════════════════════════════════════════════════════════════════════════
{
  const rows = [
    ['Unit', 'Word', 'Meaning'],
    ['Unit1', 'apple', '사과'],
    ['Unit1', 'book', '책'],
  ]
  const r = parseExcelRows(rows, '반')
  check('2행 모두 파싱', r.length === 2, { got: r })
  check('headerDetected=true', r.headerDetected === true)
  check('경고 없음(정상 파일)', (r.warnings || []).length === 0, { got: r.warnings })
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Legacy alias 헤더 (No/번호, 단어, 뜻) + 선택 컬럼 4종 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const rows = [
    ['No', '단원', '단어', '뜻', 'example', '해석', '품사', 'cefr'],
    ['1', 'Unit1', 'apple', '사과', 'I ate an apple.', '나는 사과를 먹었다.', 'noun', 'A1'],
  ]
  const r = parseExcelRows(rows, '반')
  check('legacy alias(No/단원/단어/뜻) 헤더 인식', r.headerDetected === true, { got: r })
  check('No 컬럼은 무시(word/meaning에 섞이지 않음)', r.length === 1 && r[0].word === 'apple' && r[0].meaning === '사과', { got: r[0] })
  check('선택 컬럼 4종 매핑', r[0].example === 'I ate an apple.' && r[0].exampleTranslation === '나는 사과를 먹었다.' && r[0].partOfSpeech === 'noun' && r[0].cefr === 'A1', { got: r[0] })

  // extra 컬럼 "pronunciation"은 HEADER_ALIASES 어디에도 없음 — 매핑되지
  // 않고 조용히 무시된다(어떤 필드에도 섞이지 않음). 현재 동작 그대로 고정.
  const rows2 = [
    ['unit', 'word', 'meaning', 'pronunciation'],
    ['Unit1', 'apple', '사과', 'ˈæpəl'],
  ]
  const r2 = parseExcelRows(rows2, '반')
  check('미지원 extra 컬럼("pronunciation")은 무시(word/meaning 오염 없음)',
    r2.length === 1 && r2[0].word === 'apple' && r2[0].meaning === '사과', { got: r2[0] })
  check('"pronunciation" 값이 다른 필드로 새지 않음',
    !Object.values(r2[0]).includes('ˈæpəl'), { got: r2[0] })

  // "POS" 대소문자 변형 — detectHeaderMap이 소문자화 후 매칭하므로 인식돼야 함
  const rows3 = [['unit', 'word', 'meaning', 'POS'], ['Unit1', 'apple', '사과', 'noun']]
  const r3 = parseExcelRows(rows3, '반')
  check('"POS"(대문자) 헤더도 partOfSpeech로 인식', r3[0].partOfSpeech === 'noun', { got: r3[0] })
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Unit 표기 정규화 여부 (Unit1 / Unit 1 / 1 / 유닛 1) ===')
// ════════════════════════════════════════════════════════════════════════
{
  const mk = (unitCell) => parseExcelRows([['unit', 'word', 'meaning'], [unitCell, 'apple', '사과']], '반')[0].unit
  const forms = { 'Unit1': mk('Unit1'), 'Unit 1': mk('Unit 1'), '1': mk('1'), '유닛 1': mk('유닛 1') }
  console.log('  관측된 unit 라벨:', JSON.stringify(forms))
  check('"Unit1" 원값 그대로 보존', forms['Unit1'] === 'Unit1')
  check('"Unit 1" 원값 그대로 보존', forms['Unit 1'] === 'Unit 1')
  check('숫자만("1") 원값 그대로 보존', forms['1'] === '1')
  check('"유닛 1" 원값 그대로 보존', forms['유닛 1'] === '유닛 1')

  const distinctLabels = new Set(Object.values(forms))
  const allSame = distinctLabels.size === 1
  if (allSame) {
    gap('OK', 'Unit 표기 정규화', '4가지 표기가 모두 같은 유닛 라벨로 합쳐짐', null)
  } else {
    gap('WARN', 'Unit 표기 미정규화',
      `"Unit1"/"Unit 1"/"1"/"유닛 1"이 서로 다른 유닛 라벨(${[...distinctLabels].join(' | ')})로 남는다 — 같은 유닛을 의도한 파일이 표기 차이로 별개 유닛 4개로 쪼개질 수 있다. 이는 이미 알려진 설계 선택이다: 실DB 유닛명 45행이 "Unit1"/"Unit 1" 두 표기를 서로 다른 실제 유닛으로 이미 쓰고 있어(verify:excel-header CASE C 주석), 여기서 자동 정규화(병합)하면 기존 정상 유닛을 잘못 합칠 위험이 더 크다.`,
      '(구현 안 함) 최소 수정안: 새 파일 업로드 시 sanitizeUnitLabel 이후 대소문자/공백 정규화 키로 그룹핑해 "Unit1"과 "Unit 1"이 같은 업로드 파일 안에 동시에 등장하면 result.warnings에 unit-label-inconsistent 경고를 추가(정규화 자체는 하지 않고, 관리자에게 확인만 요청). 기존 유닛 병합/rename은 범위 밖(DB 마이그레이션 필요, 규칙 8).')
  }
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Korean/English 혼용 헤더 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const r = parseExcelRows([['유닛', 'Word', '뜻'], ['Unit1', 'apple', '사과']], '반')
  check('한/영 혼용 헤더 인식', r.headerDetected === true && r.length === 1 && r[0].unit === 'Unit1' && r[0].word === 'apple' && r[0].meaning === '사과', { got: r })
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. 행 수 — 40 / 미만 / 초과 (절단·패딩 없음) ===')
// ════════════════════════════════════════════════════════════════════════
{
  const mkRows = (n) => [['unit', 'word', 'meaning'], ...Array.from({ length: n }, (_, i) => ['Unit1', `w${i}`, `뜻${i}`])]
  for (const n of [5, 40, 45]) {
    const r = parseExcelRows(mkRows(n), '반')
    check(`${n}행 입력 -> ${n}행 출력(절단/패딩 없음)`, r.length === n, { n, got: r.length })
    check(`${n}행: 첫/마지막 단어 보존`, r[0].word === 'w0' && r[n - 1].word === `w${n - 1}`, { first: r[0], last: r[n - 1] })
  }
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. Invalid — English/Korean 헤더는 헤더로 처리(데이터 아님) ===')
// ════════════════════════════════════════════════════════════════════════
{
  const r = parseExcelRows([['English', 'Korean'], ['fish', '물고기']], '반')
  check('헤더 행이 데이터로 남지 않음', !r.some((x) => x.word === 'English'), { got: r })
  check('실제 데이터 1행 보존', r.length === 1 && r[0].word === 'fish' && r[0].meaning === '물고기', { got: r })
  check('headerDetected=true', r.headerDetected === true)
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 7. Invalid — 헤더 없음: 위치 추정 + bare "Unit" 유닛명 거부 ===')
// ════════════════════════════════════════════════════════════════════════
{
  check("sanitizeUnitLabel('Unit') === '' (bare 유닛 라벨 거부)", sanitizeUnitLabel('Unit') === '')
  // ['Unit','Word','Meaning']는 세 칸 모두 HEADER_ALIASES 완전일치라
  // detectHeaderMap(rows[0])이 word/meaning 둘 다 찾아 hasHeader=true가
  // 된다(canonical 헤더 그 자체) — 이건 "헤더 없음" 케이스가 아니라
  // 정상 hasHeader 경로다. rows.slice(1)로 헤더 행이 그냥 제거되므로
  // header-label-row 경고는 뜨지 않는 게 맞다(그 경고는 hasHeader=false
  // 경로 전용, 아래 두 번째 픽스처가 실제로 그 경로를 겪는다).
  const r = parseExcelRows([['Unit', 'Word', 'Meaning'], ['apple', '사과']], '반')
  check('완전일치 3칸 헤더는 hasHeader=true 경로로 처리(제목행 취급 아님)', r.headerDetected === true, { got: r })
  check('헤더 행이 데이터로 안 남음(slice(1))', !r.some((x) => x.word === 'Word' || x.unit === 'Unit'), { got: r })
  check('canonical 헤더가 정상 인식된 경우 경고 없음', (r.warnings || []).length === 0, { got: r.warnings })

  // 진짜 "헤더 없음" 경로 — rows[0]이 제목 행(별칭 완전일치 없음)이라
  // hasHeader=false가 되고, 그 아래 반복된 헤더 유사 행("No"/"English"/
  // "Korean")이 선두 블록 안전망(leadingHeaderEnd)에 걸려 배제돼야 한다.
  const titled = parseExcelRows(
    [['2학년 천재소영순 Unit 8'], ['No', 'English', 'Korean'], ['1', 'learn', '배우다']],
    '반',
  )
  check('제목 행 뒤 헤더 유사 행("No"/"English"/"Korean")이 데이터로 안 남음(hasHeader=false 경로)',
    !titled.some((x) => x.word === 'No' || x.word === 'no'), { got: titled })
  check('실제 단어(learn/배우다)는 보존', titled.some((x) => x.word === 'learn' && x.meaning === '배우다'), { got: titled })
  check('hasHeader=false 경로에서 header-label-row 경고 발생', (titled.warnings || []).some((w) => w.code === 'header-label-row'), { got: titled.warnings })

  // 순수 위치 추정(진짜 헤더 없는 파일) — 컬럼이 word/meaning처럼 안
  // "보여도" 파서는 내용을 판단하지 않고 항상 위치로만 읽는다(설계 그대로).
  const junk = parseExcelRows([['xyz1', 'xyz2'], ['abc1', 'abc2']], '반')
  check('내용 검증 없이 항상 위치로 읽음(word/meaning "처럼 보이는지" 판단 안 함) — 현재 설계 그대로 고정',
    junk.length === 2 && junk[0].word === 'xyz1' && junk[0].meaning === 'xyz2', { got: junk })
  gap('WARN', '헤더 없음 + 내용 무검증 위치 추정',
    '헤더가 없으면 컬럼 내용이 word/meaning처럼 보이는지 전혀 검사하지 않고 항상 위치(0=word,1=meaning 또는 0=unit,1=word,2=meaning)로 읽는다. 순수 숫자 word(numeric-word)와 상수 번호열(constant-number-column) 2종 강신호만 사후 경고한다(2026-08-28 M3c) — "그 외 임의 텍스트"는 아무 경고 없이 그대로 word/meaning으로 저장된다.',
    '(구현 안 함) 이미 알려진 설계 트레이드오프 — verify:excel-header CASE I 주석("3열 파일에서 첫 칸이 행번호인지 유닛번호인지는 원리적으로 구분 불가")과 동일 이유로 일반적인 "내용이 사전에 있는 단어처럼 보이는지" 검증은 사전(dictionary) 의존이 필요해 범위 밖. 현행 2종 경고로 실사고 재현 패턴은 커버됨.')
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 8. Invalid — Unit 칸 숫자만 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const r = parseExcelRows([['unit', 'word', 'meaning'], ['5', 'apple', '사과']], '반')
  check('unit 칸이 순수 숫자면 원값 그대로("5") 유지 — "Unit 5"로 승격하지 않음',
    r.length === 1 && r[0].unit === '5', { got: r[0] })
  gap('WARN', 'unit 칸 숫자만 -> 원값 그대로("5")',
    '헤더로 unit 칸에 순수 숫자("5")가 들어오면 sanitizeUnitLabel이 손대지 않아 유닛 라벨이 문자 그대로 "5"가 된다. 같은 파일/다른 파일의 "Unit 5"/"Unit5"와 병합되지 않고 별개 유닛 "5"가 생길 수 있다.',
    '(구현 안 함) 위 3항목의 "Unit 표기 미정규화" 경고와 동일 계열 — 별도 정규화 로직 없이 unit-label-inconsistent 류 경고에 편입 검토 가능. 유닛 자동 생성/이름 변경은 운영 데이터에 직접 영향(규칙 1 안정성 최우선)이라 이번 테스트 세션 범위에서 구현하지 않는다.')
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 9. Invalid — 빈 Unit 칸 -> "Unit 1" 폴백 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const r = parseExcelRows([['unit', 'word', 'meaning'], ['', 'apple', '사과'], ['', 'book', '책']], '반')
  check('빈 unit 칸 -> "Unit 1" 기본값(문서화된 unit || \'Unit 1\' 폴백)',
    r.every((x) => x.unit === 'Unit 1'), { got: r })
  const allWarnings = r.warnings || []
  const hasEmptyUnitWarning = allWarnings.some((w) => /unit/i.test(w.code) && /empty|빈/i.test(w.message + ' ' + (w.code || '')))
  check('파일 전체 unit 칸이 비어도 경고는 없음(현재 동작 — 아래 gap 참고)', !hasEmptyUnitWarning, { got: allWarnings })
  gap('WARN', '전체 파일 unit 칸이 비어도 경고 없음',
    'unit 헤더 컬럼 자체가 없거나(헤더 없음) 헤더는 있지만 모든 행의 unit 칸이 빈 값이면, 모든 단어가 조용히 "Unit 1"로 저장된다. 관리자가 실제로는 여러 유닛으로 나눠 올리려던 파일(unit 칸을 깜빡 비운 경우)이 전부 Unit 1로 뭉쳐질 수 있는데 경고가 전혀 없다.',
    '(구현 안 함, 제안) parseExcelRows 끝부분 경고 집계 구간(1342행 부근, `if (!hasHeader)` 블록과 유사한 위치)에 "dataRows.length > 1 && result.every(r => 원본 unit 칸이 빈 값)"이면 all-empty-unit-column 경고 1건 추가 — 파싱 결과(unit=\'Unit 1\')는 바꾸지 않고 신호만 추가하는 낮은 위험의 변경이지만, 헤더 없는 2열(unit 칸 자체가 존재하지 않는 정상 파일 — 예: 5번 케이스의 순수 word/meaning 2열)까지 오탐하지 않도록 "unit 헤더가 감지됐는데 전부 빈 값"으로 조건을 좁혀야 한다. 이번 세션은 test-only 범위라 구현하지 않음.')
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 10. 중복 단어(같은 유닛 내) — 현재 동작: dedupe 없음 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const r = parseExcelRows([
    ['unit', 'word', 'meaning'],
    ['Unit1', 'apple', '사과'],
    ['Unit1', 'apple', '사과'],
    ['Unit1', 'apple', '다른뜻'],
  ], '반')
  check('중복 단어(word+meaning 동일) 3행 모두 보존 — dedupe 없음(현재 동작)', r.length === 3, { got: r })
  const dupWarning = (r.warnings || []).some((w) => /dup/i.test(w.code || ''))
  check('중복 단어 관련 경고 없음(현재 동작)', !dupWarning, { got: r.warnings })
  gap('WARN', '유닛 내 중복 단어 — dedupe/경고 둘 다 없음',
    '같은 유닛 안에 word+meaning이 완전히 같은 행이 여러 번 있어도(엑셀에서 흔한 붙여넣기 중복 실수) 그대로 전부 저장되고 경고도 없다. 다운스트림 저장 로직(setClassWords/ensureUnit)이 이후 어떻게 처리하는지는 이 파서 범위 밖.',
    '(구현 안 함) 파서 단계에서 dedupe를 넣으면 "의도적으로 같은 철자, 다른 뜻(동음이의어)"을 오삭제할 위험(예: bank=은행/bank=강둑)이 있어 자동 제거는 부적절 — 대신 word 완전일치 카운트가 2 이상이면 duplicate-word 경고만 추가하는 안이 안전하지만, 실제 저장 경로(ensureUnit 등)의 중복 허용/거부 정책을 먼저 확인해야 하므로 이번 세션(test-only)에서는 구현하지 않는다.')
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 11. 빈 word / 빈 meaning 행 — 조용히 filter, 경고 없음 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const rows = [
    ['unit', 'word', 'meaning'],
    ['Unit1', 'apple', '사과'],
    ['Unit1', '', '빈단어'],
    ['Unit1', 'noMean', ''],
    ['Unit1', '', ''],
    ['Unit1', 'book', '책'],
  ]
  const r = parseExcelRows(rows, '반')
  check('빈 word/meaning 행은 결과에서 제외됨(2행만 남음)', r.length === 2 && r[0].word === 'apple' && r[1].word === 'book', { got: r })
  const skipSignal = (r.warnings || []).length > 0 || typeof r.skipped === 'number' || typeof r.skippedCount === 'number'
  check('스킵된 행 수를 알려주는 어떤 신호도 없음(현재 동작 — 아래 gap 참고)', skipSignal === false, { warnings: r.warnings, skipped: r.skipped })
  gap('FAIL', '빈 word/meaning 행 — 스킵 신호(경고/카운트) 전혀 없음(silent)',
    '3행(빈 word 1건, 빈 meaning 1건, 둘 다 빈 1건)이 `.filter(r => r && r.word && r.meaning)`(AdminScreen.jsx parseExcelRows 끝부분)에서 조용히 제외되는데, result.warnings에도 별도 카운트 필드에도 이 사실이 전혀 남지 않는다. "invalid fixture는 반드시 비어있지 않은 경고/스킵 신호를 내야 한다"는 이번 작업 요구사항과 어긋나는 silent case.',
    '최소 수정안(미구현): parseExcelRows의 `.filter(r => r && r.word && r.meaning)` 직전/직후에 스킵된 행 수를 세어(원인별로 word 빈값/meaning 빈값 구분 불필요, 합산 1개 카운트면 충분) `result.warnings`에 empty-cell-row 경고(code, message, detail: 스킵 수)를 추가하는 낮은 위험의 변경 — 파싱 결과(살아남는 행)는 전혀 바꾸지 않는다. 다만 실제 엑셀 파일은 마지막 몇 행이 완전히 빈 셀(트레일링 blank row)인 경우가 매우 흔해(예: 40단어 파일 아래 관례적 공백행), 이 경고를 무조건 올리면 정상 업로드 대부분에서 경고가 뜨고 warnAck 체크박스를 매번 눌러야 하는 UX 회귀 위험이 크다(현재 UI는 `(preview.warnings||[]).length>0 && !warnAck`이면 저장 버튼을 disabled 함). 그래서 "완전히 빈 행"(모든 셀이 공백)은 카운트에서 제외하고 "word만 비었거나 meaning만 비었는데 다른 칸엔 값이 있는" 부분 결손 행만 경고 대상으로 좁혀야 안전하다 — 운영자 확인 후 별도 커밋으로 구현 권장, 이번 test-only 세션에서는 구현하지 않는다.')
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 12. 공백뿐인 셀 — trim 후 빈 값과 동일 취급 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const r = parseExcelRows([
    ['unit', 'word', 'meaning'],
    ['Unit1', '   ', '사과'],
    ['Unit1', 'apple', '   '],
    ['Unit1', 'book', '책'],
  ], '반')
  check('공백뿐 word/meaning 행은 trim 후 빈 값으로 취급돼 제외(1행만 남음)', r.length === 1 && r[0].word === 'book', { got: r })
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 13. 헤더 행이 파일 중간에 반복 ===')
// ════════════════════════════════════════════════════════════════════════
{
  const r = parseExcelRows([
    ['unit', 'word', 'meaning'],
    ['Unit1', 'apple', '사과'],
    ['Unit', 'Word', 'Meaning'],
    ['Unit1', 'book', '책'],
  ], '반')
  check('중간 반복 헤더 행이 데이터로 안 남음', !r.some((x) => x.word === 'Word'), { got: r })
  check('앞뒤 정상 단어 2행 보존', r.length === 2 && r[0].word === 'apple' && r[1].word === 'book', { got: r })
  check('header-residue-row 경고 발생', (r.warnings || []).some((w) => w.code === 'header-residue-row'), { got: r.warnings })
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 14. unit="Unit" 1단어 유령 유닛 재발 방지(핵심 회귀 고정) ===')
// ════════════════════════════════════════════════════════════════════════
{
  // 헤더가 있는 정상 파일인데, 유닛 칸에만 헤더 라벨("Unit")이 실수로
  // 들어간 경우 — word/meaning은 실제 어휘라 header-residue-row엔 안 걸림.
  // sanitizeUnitLabel이 유닛 칸만 비워 'Unit 1' 폴백으로 흡수해야 한다.
  const r = parseExcelRows([['unit', 'word', 'meaning'], ['Unit', 'ghost', '유령']], '반')
  check('유닛 칸="Unit"이어도 이름이 "Unit"인 유닛으로 저장되지 않음', r[0].unit !== 'Unit', { got: r[0] })
  check('대신 "Unit 1" 폴백으로 흡수', r[0].unit === 'Unit 1', { got: r[0] })
  check('실제 단어(ghost/유령)는 보존', r[0].word === 'ghost' && r[0].meaning === '유령', { got: r[0] })
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 15. 경고 노출 경로 확인(정적) ===')
// ════════════════════════════════════════════════════════════════════════
{
  const r = parseExcelRows([['unit', 'word', 'meaning'], ['Unit1', 'apple', '사과']], '반')
  check('result.warnings는 항상 배열', Array.isArray(r.warnings))
  check('result.headerDetected는 boolean', typeof r.headerDetected === 'boolean')
  const uiSrc = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  check('UI가 preview.warnings를 렌더한다(관리자에게 실제로 보임)', /preview\.warnings \|\| \[\]\)\.map\(/.test(uiSrc))
  check('경고 있으면 확인 전 저장 버튼 disabled(silent save 방지)',
    /disabled=\{saving \|\| !selectedClass \|\| \(\(preview\.warnings \|\| \[\]\)\.length > 0 && !warnAck\)\}/.test(uiSrc))
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log('\n=== gap 리포트 요약 (exit code 미반영 — 참고용) ===')
for (const g of gapLog) {
  console.log(`  [${g.status}] ${g.label}`)
}
if (failures > 0) {
  console.log('\nFAILED')
  process.exit(1)
}
console.log('\nALL PASS')
process.exit(0)
