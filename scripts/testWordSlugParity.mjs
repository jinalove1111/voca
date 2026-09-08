// wordSlug 3중 사본 바이트 동일성 회귀 테스트 (2026-09-09, 야간 QA)
//
// 배경: 단어 슬러그(앱 전역 표시용 id — 미션/퀴즈 중복 제거/오답노트가
// 전부 이 값 기준)를 계산하는 동일한 함수가 세 곳에 존재한다:
//   1) src/utils/wordLibrary.js:3702 (export const wordSlug = ...)
//   2) src/utils/assignmentPlanner.js:15 (로컬 const wordSlug = ...)
//   3) src/components/EntranceTestAdmin.jsx:27 (로컬 const wordSlug = ...)
// 세 곳 모두 "절대 바꾸지 말 것"이라는 주석이 있고, 세 정의가 조금이라도
// 갈라지면(공백 처리 방식, 대소문자 변환 순서 등) 같은 단어가 파일마다
// 다른 슬러그로 계산되어 배정 매칭/진행도가 조용히 어긋난다.
//
// 이 테스트는 3곳의 산출물(리팩터링) 코드를 만들지 않고 — 운영자 지시
// 범위 밖 — 각 파일의 소스 텍스트에서 정규식으로 화살표 함수 "본문"만
// 추출해 문자열 그대로 비교하고, 추출한 본문을 실제로 실행해 몇 가지
// 입력에 대해 동일한 출력을 내는지도 확인한다(정적 비교 + 동적 실행 이중
// 검증). PASS/FAIL + exit code 스타일은 scripts/testWritingDirectionResolution.mjs
// 와 동일.
//
// 실행: node scripts/testWordSlugParity.mjs
import { readFileSync } from 'node:fs'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const norm = (s) => s.replace(/\r\n?/g, '\n')

// 세 정의 모두 `(word) => word.toLowerCase().replace(/\s+/g, '_')` 형태의
// 단일 표현식 화살표 함수다 — 변수명(wordSlug)에 할당되는 화살표 함수의
// 파라미터 목록과 본문(개행 전까지)을 추출한다.
const ARROW_RE = /wordSlug\s*=\s*(\([^)]*\)\s*=>[^\n]*)/

function extractArrowSource(filePath) {
  const src = norm(readFileSync(filePath, 'utf8'))
  const m = src.match(ARROW_RE)
  if (!m) return null
  // 후행 세미콜론/공백 제거해서 순수 표현식 텍스트만 비교
  return m[1].trim().replace(/;\s*$/, '')
}

const SOURCES = {
  'src/utils/wordLibrary.js': 'src/utils/wordLibrary.js',
  'src/utils/assignmentPlanner.js': 'src/utils/assignmentPlanner.js',
  'src/components/EntranceTestAdmin.jsx': 'src/components/EntranceTestAdmin.jsx',
}

const extracted = {}
for (const [label, filePath] of Object.entries(SOURCES)) {
  extracted[label] = extractArrowSource(filePath)
}

console.log('\n1. 세 파일 모두에서 wordSlug 화살표 함수 본문 추출 성공(전제)')
for (const [label, body] of Object.entries(extracted)) {
  check(`${label} — 추출 성공`, typeof body === 'string' && body.length > 0, body)
}

console.log('\n2. 세 본문 텍스트가 CRLF 정규화 후 바이트(문자) 단위로 완전히 동일')
{
  const labels = Object.keys(extracted)
  const [first, ...rest] = labels
  const firstBody = extracted[first]
  for (const label of rest) {
    check(`${first} === ${label}`, extracted[label] === firstBody, { [first]: firstBody, [label]: extracted[label] })
  }
}

console.log('\n3. 추출한 본문을 실제로 실행 — 대표 입력 3종에 대해 세 파일 모두 동일한 출력')
{
  const fns = {}
  for (const [label, body] of Object.entries(extracted)) {
    if (!body) continue
    try {
      // eslint-disable-next-line no-new-func
      fns[label] = new Function('word', `return (${body})(word)`)
    } catch (err) {
      check(`${label} — 본문을 함수로 컴파일 가능`, false, err.message)
    }
  }
  const inputs = ['Ice Cream', '  a  b ', 'Hello']
  for (const input of inputs) {
    const outputs = {}
    for (const [label, fn] of Object.entries(fns)) {
      try { outputs[label] = fn(input) } catch (err) { outputs[label] = `__threw__:${err.message}` }
    }
    const values = Object.values(outputs)
    const allSame = values.every((v) => v === values[0])
    check(`입력 ${JSON.stringify(input)} → 세 파일 출력 동일(${JSON.stringify(values[0])})`, allSame, outputs)
  }
}

console.log(failures === 0
  ? '\n모든 단언 통과 — wordSlug 3중 사본 바이트 동일성 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
