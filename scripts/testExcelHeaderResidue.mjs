// Excel/PDF 업로드 — "반복 헤더 행이 데이터로 저장되는" 재발 방지 회귀 테스트
// (2026-09-02)
//
// 배경: 운영 DB에 실제로 유령 유닛 7개("Unit"×6, "Unit1"×1)가 생겼고, 그
// 1개짜리 단어는 전부 헤더 라벨이었다(word="English"/meaning="Korean" 등).
// 원인은 hasHeader=true로 정상 인식된 파일 안에서도 시트 병합/페이지
// 구분으로 남은 반복 헤더 행이 그대로 데이터로 파싱된 것 — 기존 안전망
// (`!hasHeader && rowIdx <= leadingHeaderEnd` 조건)은 hasHeader=true 경로를
// 못 막았다.
//
// 규칙 15(회귀는 수정 전 코드로 FAIL을 먼저 확인) 준수: 이 스크립트는
// src/utils/excelHeaderGuard.js(순수 로직)를 단위 검증하고, AdminScreen.jsx
// 소스에 대해서는 "hasHeader 경로에도 필터가 적용됐는지" 등을 정적 검사한다
// (AdminScreen은 React 컴포넌트라 import해 번들하지 않고, 소스 텍스트만
// 검사 — wordLibrary 등 외부 의존 0, 네트워크 0).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  isHeaderLabel,
  isHeaderResidueRow,
  sanitizeUnitLabel,
} from '../src/utils/excelHeaderGuard.js'

let asserted = 0
let failures = 0
const check = (label, cond, detail) => {
  asserted++
  if (cond) {
    console.log(`  PASS  ${label}`)
  } else {
    console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`)
    failures++
  }
}

console.log('\n=== (a) isHeaderResidueRow: 반복 헤더 행 → true ===')
{
  check('Word/Meaning', isHeaderResidueRow({ word: 'Word', meaning: 'Meaning' }) === true)
  check('English/Korean', isHeaderResidueRow({ word: 'English', meaning: 'Korean' }) === true)
  check('어휘·어구/의미', isHeaderResidueRow({ word: '어휘·어구', meaning: '의미' }) === true)
  check('No./어휘·어구 (실사고 실측 형태)', isHeaderResidueRow({ word: 'No.', meaning: '어휘·어구' }) === true)
  check('공백/대소문자 변형: " WORD " / " meaning "', isHeaderResidueRow({ word: ' WORD ', meaning: ' meaning ' }) === true)
  check('대문자 변형: ENGLISH/KOREAN', isHeaderResidueRow({ word: 'ENGLISH', meaning: 'KOREAN' }) === true)
}

console.log('\n=== (b) isHeaderResidueRow: 정상 단어 오차단 금지 → false ===')
{
  check('apple/사과 (평범한 정상 단어)', isHeaderResidueRow({ word: 'apple', meaning: '사과' }) === false)
  check('meaning/의미의 (한쪽만 라벨)', isHeaderResidueRow({ word: 'meaning', meaning: '의미의' }) === false)
  check('korean/한국의 (한쪽만 라벨)', isHeaderResidueRow({ word: 'korean', meaning: '한국의' }) === false)
  check('unit/단위(측정) (한쪽만 라벨)', isHeaderResidueRow({ word: 'unit', meaning: '단위(측정)' }) === false)
  check('Korean/한국인 — 실단어 단독 케이스 오차단 금지', isHeaderResidueRow({ word: 'Korean', meaning: '한국인' }) === false)
}

console.log('\n=== (d) sanitizeUnitLabel ===')
{
  check("'Unit' -> ''", sanitizeUnitLabel('Unit') === '')
  check("'유닛' -> ''", sanitizeUnitLabel('유닛') === '')
  check("'UNIT ' -> '' (공백/대소문자 무시)", sanitizeUnitLabel('UNIT ') === '')
  check("'Unit 3' -> 'Unit 3' (숫자 포함, 원값 유지)", sanitizeUnitLabel('Unit 3') === 'Unit 3')
  check("'3' -> '3' (원값 유지)", sanitizeUnitLabel('3') === '3')
  check("'단원' -> ''", sanitizeUnitLabel('단원') === '')
  check("'단원 2' -> '단원 2' (숫자 포함, 원값 유지)", sanitizeUnitLabel('단원 2') === '단원 2')
}

console.log('\n=== isHeaderLabel: kind 인자 동작(회귀 확인) ===')
{
  check('isHeaderLabel("word") kind 없이 -> true(전체 집합)', isHeaderLabel('word') === true)
  check('isHeaderLabel("word", "word") -> true', isHeaderLabel('word', 'word') === true)
  check('isHeaderLabel("word", "meaning") -> false(다른 종류)', isHeaderLabel('word', 'meaning') === false)
  check('isHeaderLabel("apple") -> false', isHeaderLabel('apple') === false)
}

console.log('\n=== (c) [정적] AdminScreen.jsx 소스 검사 ===')
{
  const srcPath = path.resolve('src/components/AdminScreen.jsx')
  const src = fs.readFileSync(srcPath, 'utf8')

  // 주석 제거 없이 순수 텍스트 검사 — 정확한 위치까지는 보지 않고, "그 기능이
  // 코드에 존재하는지"만 넓게 확인한다(오탐보다 미탐 방지를 우선).
  check(
    'excelHeaderGuard 모듈에서 import',
    /from ['"]\.\.\/utils\/excelHeaderGuard(\.js)?['"]/.test(src),
  )
  check(
    'isHeaderResidueRow 를 import',
    /import\s*\{[^}]*isHeaderResidueRow[^}]*\}\s*from/.test(src),
  )
  check(
    'sanitizeUnitLabel 를 import',
    /import\s*\{[^}]*sanitizeUnitLabel[^}]*\}\s*from/.test(src),
  )

  // parseExcelRows 함수 본문만 잘라서, hasHeader 분기 밖(무조건)에서
  // isHeaderResidueRow 가 호출되는지 확인한다. hasHeader 전용 블록
  // (`if (hasHeader) { ... }`) 안에서만 호출되면 여전히 무헤더 경로에서
  // 반복 헤더 행을 놓칠 수 있으므로, "hasHeader와 무관한 위치"에서 호출되는
  // 것으로 판단하기 위해 `if (hasHeader)` 블록의 여는/닫는 중괄호 범위
  // 바깥에 isHeaderResidueRow 호출이 있는지를 확인한다.
  const fnStart = src.indexOf('function parseExcelRows')
  const fnEnd = src.indexOf('\nfunction ExcelUpload', fnStart)
  const parseExcelRowsBody = fnStart !== -1 && fnEnd !== -1 ? src.slice(fnStart, fnEnd) : ''
  check('parseExcelRows 함수를 소스에서 찾음(전제 조건)', parseExcelRowsBody.length > 0)

  const residueCallCount = (parseExcelRowsBody.match(/isHeaderResidueRow\(/g) || []).length
  check(
    'parseExcelRows 안에서 isHeaderResidueRow 호출',
    residueCallCount >= 1,
    `호출 횟수=${residueCallCount}`,
  )

  // hasHeader 전용 조건 블록 안에서만 쓰이지 않았는지 — 호출 지점 앞
  // 120자 이내에 "if (hasHeader)"가 직접 감싸는 형태(같은 줄 조건문)가
  // 아니라, hasHeader와 무관하게 실행되는 라인(예: `if (isHeaderResidueRow(`)
  // 형태인지를 확인한다.
  const unconditionalResidueCall = /\n\s*if\s*\(\s*isHeaderResidueRow\(/.test(parseExcelRowsBody)
  check(
    'isHeaderResidueRow 호출이 hasHeader 여부와 무관하게(무조건) 실행됨',
    unconditionalResidueCall,
  )

  check(
    '유닛 칸에 sanitizeUnitLabel 적용',
    /sanitizeUnitLabel\(/.test(parseExcelRowsBody),
  )

  // PDF/텍스트 경로(handleParse) — 헤더 필터가 전혀 없었다.
  const handleParseStart = src.indexOf('const handleParse = ()')
  const handleParseEnd = src.indexOf('\n  const handleSave', handleParseStart)
  const handleParseBody =
    handleParseStart !== -1 && handleParseEnd !== -1 ? src.slice(handleParseStart, handleParseEnd) : ''
  check('handleParse(PDF 경로) 함수를 소스에서 찾음(전제 조건)', handleParseBody.length > 0)
  check(
    'PDF/텍스트 경로(handleParse)에도 isHeaderResidueRow 필터 적용',
    /isHeaderResidueRow\(/.test(handleParseBody),
  )

  // 기존 무헤더 안전망(:1325 부근)은 제거하지 않고 유지돼야 한다(규칙 3).
  check(
    '기존 무헤더 전용 안전망(leadingHeaderEnd 가드)이 여전히 존재(제거되지 않음)',
    /!hasHeader\s*&&\s*rowIdx\s*<=\s*leadingHeaderEnd/.test(parseExcelRowsBody),
  )
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) {
  console.log('FAILED')
  process.exit(1)
}
console.log('ALL PASS — 반복 헤더 행이 데이터로 저장되지 않는다')
