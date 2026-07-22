// tests/harness/runReading.mjs — Reading Foundation(v3.3) 순수 모델 하네스.
// runAnalytics.mjs와 같은 자기완결형 — Supabase/브라우저 없이
// src/utils/readingModel.js의 순수 함수만 단언한다(I/O 레이어
// readingApi.js는 수동/관리자 화면 검증 대상, TESTING.md 관례).
import { readFileSync } from 'node:fs'
import { validatePassage, normalizeSentences, movePosition, splitPassageText } from '../../src/utils/readingModel.js'

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:reading] Reading Foundation — 순수 모델 ===')

console.log('\n-- validatePassage')
const okCase = validatePassage({ title: 'Lesson 1', sentences: [{ english: 'Hello.', korean: '안녕.' }] })
check('정상 지문(제목 + 영어 문장 1개) 통과', okCase.ok && okCase.errors.length === 0)
check('korean 빈 문자열은 허용(선택 필드)', validatePassage({ title: 'T', sentences: [{ english: 'Hi.', korean: '' }] }).ok)
check('제목 없음 거부', !validatePassage({ title: '  ', sentences: [{ english: 'Hi.' }] }).ok)
check('문장 0개 거부', !validatePassage({ title: 'T', sentences: [] }).ok)
const emptyEng = validatePassage({ title: 'T', sentences: [{ english: 'Hi.' }, { english: '  ' }] })
check('영어 빈 문장 거부 + 몇 번째 문장인지 에러에 표시', !emptyEng.ok && emptyEng.errors.some((e) => e.includes('2번')))
check('인자 없음 → 크래시 없이 거부', !validatePassage().ok && !validatePassage({}).ok)

console.log('\n-- normalizeSentences')
const messy = [
  { id: 'c', position: 7, english: 'C.' },
  { id: 'a', position: 0, english: 'A.' },
  { id: 'b', position: 3, english: 'B.' },
]
const norm = normalizeSentences(messy)
check('position 오름차순 정렬', norm.map((r) => r.id).join('') === 'abc')
check('구멍 있는 position(0,3,7)을 0..n-1로 재색인', norm.map((r) => r.position).join(',') === '0,1,2')
check('입력 배열/객체를 변경하지 않음(순수)', messy[0].position === 7 && messy[0].id === 'c')
check('빈/비배열 입력 → []', normalizeSentences([]).length === 0 && normalizeSentences(null).length === 0)

console.log('\n-- movePosition')
const abc = ['a', 'b', 'c']
check('앞→뒤 이동(0→2)', movePosition(abc, 0, 2).join('') === 'bca')
check('뒤→앞 이동(2→0)', movePosition(abc, 2, 0).join('') === 'cab')
check('범위 밖(from=-1, to=3)은 no-op 복사본', movePosition(abc, -1, 1).join('') === 'abc' && movePosition(abc, 0, 3).join('') === 'abc')
check('입력 불변(순수) + 결정론', abc.join('') === 'abc' && movePosition(abc, 0, 2).join('') === movePosition(abc, 0, 2).join(''))

console.log('\n-- splitPassageText')
const split = splitPassageText('Hello there. How are you? I am fine!')
check('./?/! 경계로 3문장 분할(부호 유지)', split.length === 3 && split[0] === 'Hello there.' && split[1] === 'How are you?' && split[2] === 'I am fine!')
check('종결부호 없는 꼬리 문장도 보존', splitPassageText('First. second half').length === 2)
// 정직한 한계 문서화: 약어(Mr.) 뒤에서도 잘린다 — readingModel.js 주석
// 참고(관리자가 분할 결과를 눈으로 확인·수정하는 전제의 단순 분할기).
check('약어는 처리하지 않음(의도된 naive 분할 — 관리자 확인 전제)', splitPassageText('Mr. Kim smiled.').length === 2)
check('빈/공백/비문자열 입력 → []', splitPassageText('').length === 0 && splitPassageText('   ').length === 0 && splitPassageText(null).length === 0)
check('결정론(같은 입력 → 같은 출력)', JSON.stringify(splitPassageText('A. B.')) === JSON.stringify(splitPassageText('A. B.')))

console.log('\n-- 순수성(코드 레벨)')
const src = readFileSync(new URL('../../src/utils/readingModel.js', import.meta.url), 'utf8')
check('readingModel.js는 import 0 순수 모듈', !/^import /m.test(src))
check('Math.random 없음(결정론)', !src.includes('Math.random'))

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  reading — Reading Foundation 순수 모델 (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  reading — ${failed}건: ${failures.join(', ')}`); process.exit(1)
