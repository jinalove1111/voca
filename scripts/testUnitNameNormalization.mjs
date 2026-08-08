// scripts/testUnitNameNormalization.mjs — unitNameKey(wordLibrary.js) 순수
// 로직 검증 (2026-08-09, 77차 야간).
//
// 배경: ensureUnit이 유닛 이름 "정확 일치"로만 기존 유닛을 찾아 "Unit 1"
// (반 생성 시 자동 생성)과 "Unit1"(Excel 업로드 입력)이 형제 유닛으로
// 갈라졌고, 교재마다 "빈 Unit 1 + 실단어 Unit1" 쌍이 쌓였다(2026-08-09
// 전수 감사 → v3_29/v3_30 정리). 재발 방지로 ensureUnit이 unitNameKey
// 정규화 키 일치로 기존 유닛을 재사용하게 됐다 — 이 스크립트는 그 판정
// 키의 등가/비등가 계약을 고정한다(네트워크 0 — 순수 함수만 단언).
//
// 실행: WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testUnitNameNormalization.mjs
import { pathToFileURL } from 'node:url'

const bundle = process.env.WORDLIB_BUNDLE
if (!bundle) {
  console.error('WORDLIB_BUNDLE env가 필요합니다 (scripts/buildWordLibBundle.mjs 먼저 실행)')
  process.exit(1)
}
const { unitNameKey } = await import(pathToFileURL(bundle).href)

let passed = 0, failed = 0
const failures = []
const check = (n, c) => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}`) } }
const same = (a, b) => unitNameKey(a) === unitNameKey(b)

console.log('\n=== unitNameKey — 등가(같은 유닛으로 판정해야 함) ===')
check('"Unit 1" ≡ "Unit1"', same('Unit 1', 'Unit1'))
check('"Unit 1" ≡ "unit 1" (대소문자)', same('Unit 1', 'unit 1'))
check('"Unit 1" ≡ "Unit 01" (선행 0)', same('Unit 1', 'Unit 01'))
check('"Unit 1" ≡ "UNIT001"', same('Unit 1', 'UNIT001'))
check('"Unit 1" ≡ "  Unit  1  " (공백 변형)', same('Unit 1', '  Unit  1  '))
check('"Unit 10" ≡ "Unit10"', same('Unit 10', 'Unit10'))
check('실사고 재현: 감사에서 갈라졌던 "Unit 1"/"Unit1" 쌍이 같은 키', same('Unit 1', 'Unit1'))

console.log('\n=== unitNameKey — 비등가(다른 유닛으로 남아야 함) ===')
check('"Unit 1" ≢ "Unit 2"', !same('Unit 1', 'Unit 2'))
check('"Unit 1" ≢ "Unit 10" (1 vs 10)', !same('Unit 1', 'Unit 10'))
check('"Unit 1" ≢ "Unit 12"', !same('Unit 1', 'Unit 12'))
check('"Unit" ≢ "Unit 1" (숫자 없는 이름)', !same('Unit', 'Unit 1'))
check('"Unit 1" ≢ "Lesson 1" (접두 단어 다름)', !same('Unit 1', 'Lesson 1'))
check('"Unit 21" ≢ "Unit 2"', !same('Unit 21', 'Unit 2'))

console.log('\n=== 경계/방어 ===')
check('빈 문자열/undefined/null 크래시 없음',
  (() => { try { unitNameKey(''); unitNameKey(null); unitNameKey(undefined); return true } catch { return false } })())
check('숫자 아닌 접미("Unit A")는 소문자+공백 제거만', unitNameKey('Unit A') === 'unita')
check('선행 0 제거는 말미 숫자에만 적용("U0nit 1" 내부 0 보존)', unitNameKey('U0nit 1') === 'u0nit1')

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  unit-name-normalization (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  unit-name-normalization — ${failed}건: ${failures.join(', ')}`)
process.exit(1)
