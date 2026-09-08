// 쓰기 연습(studyMode==='write') 항상 양방향(mixed) 회귀 테스트
// (2026-09-09, 운영자 결정 — handoff 118차)
//
// 확정된 규칙: "쓰기 연습(학생 학습 모드 studyMode === 'write')만 반 설정
// spellingDirection과 무관하게 항상 양방향(mixed, 50:50)으로 출제한다."
// 문제 하나는 여전히 한쪽 언어만 보여준다(kr2en: 한글 제시→영어 입력,
// en2kr: 영어 제시→한글 입력) — 방향을 "미리" 50:50으로 섞어 배정할 뿐,
// 한 문제 안에서 두 언어를 동시에 노출하는 게 아니다. 종합(comprehensive)
// 모드 쓰기 단계/복습(SpellingReview)/일일 의식(GuidedSession)/입실시험은
// 오늘과 동일하게 반 설정을 그대로 따른다(변경 없음) — 이 스위트가 그
// "무변경"도 함께 고정한다.
//
// 검증 방법: resolveSessionSpellingDirection(순수 함수)은 실제 실행,
// App.jsx/SpellingQuestion.jsx/WordDetail.jsx 배선은 소스 정적 계약
// (testWritingDirectionResolution.mjs 9~14절과 동일 관례). 네트워크 0,
// DB 0, React 렌더 0.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// ════════════════════════════════════════════════════════════════════════
// A. resolveSessionSpellingDirection 단위 테스트
// ════════════════════════════════════════════════════════════════════════
console.log('\nA. resolveSessionSpellingDirection — 쓰기 연습은 항상 mixed, 그 외 모드는 반 설정 그대로')
let resolveSessionSpellingDirection
try {
  const mod = await import(pathToFileURL(path.resolve('src/utils/writePracticeDirection.js')).href)
  resolveSessionSpellingDirection = mod.resolveSessionSpellingDirection
} catch (err) {
  check('src/utils/writePracticeDirection.js 임포트 성공(전제)', false, err.message)
}
check('resolveSessionSpellingDirection이 함수로 export됨(전제)', typeof resolveSessionSpellingDirection === 'function')

const safeResolve = (studyMode, classDirection) => {
  try { return resolveSessionSpellingDirection(studyMode, classDirection) }
  catch (err) { return `__threw__:${err.message}` }
}

for (const classDirection of ['kr2en', 'en2kr', 'mixed', 'random', undefined]) {
  check(`write + ${String(classDirection)} → mixed`, safeResolve('write', classDirection) === 'mixed', { classDirection })
}
for (const studyMode of ['comprehensive', 'quiz', 'study', undefined]) {
  for (const classDirection of ['kr2en', 'en2kr', 'mixed', 'random']) {
    check(`${String(studyMode)} + ${classDirection} → ${classDirection}(반 설정 그대로, 무변경)`,
      safeResolve(studyMode, classDirection) === classDirection, { studyMode, classDirection })
  }
}
check('순수 함수 — 같은 입력을 두 번 호출해도 같은 결과(부작용/전역 상태 없음)',
  safeResolve('write', 'kr2en') === safeResolve('write', 'kr2en') &&
  safeResolve('comprehensive', 'en2kr') === safeResolve('comprehensive', 'en2kr'))

// ════════════════════════════════════════════════════════════════════════
// B. assignDirections 균형 배정 — 쓰기 연습이 실제로 50:50에 가깝게(±1) 나오는지
// ════════════════════════════════════════════════════════════════════════
console.log('\nB. assignDirections(n, \'mixed\') 균형 검증 — kr2en/en2kr 개수 차이 ≤1, 합계 = n')
let assignDirections
try {
  const entranceMod = await import(pathToFileURL(path.resolve('src/utils/entranceTest.js')).href)
  assignDirections = entranceMod.assignDirections
} catch (err) {
  console.log('  (entranceTest.js를 Node에서 직접 임포트 불가 — App.jsx 정적 배선 계약으로 대체)', err.message)
}

if (typeof assignDirections === 'function') {
  for (const n of [10, 20, 40, 41]) {
    let allBalanced = true
    for (let seed = 1; seed <= 20; seed++) {
      let s = seed * 7919 + 13
      const rng = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
      const dirs = assignDirections(n, 'mixed', { rng })
      const kr2en = dirs.filter((d) => d === 'kr2en').length
      const en2kr = dirs.filter((d) => d === 'en2kr').length
      if (dirs.length !== n || kr2en + en2kr !== n || Math.abs(kr2en - en2kr) > 1) { allBalanced = false; break }
    }
    check(`n=${n} — 20회 시드에 걸쳐 kr2en/en2kr 차이 ≤1, 합계=n`, allBalanced, { n })
  }
} else {
  const app = readFileSync('src/App.jsx', 'utf8')
  check('(대체) App.jsx가 assignDirections(sessionWords.length, \'mixed\')를 호출',
    /assignDirections\(sessionWords\.length, 'mixed'\)/.test(app))
}

// ════════════════════════════════════════════════════════════════════════
// C. App.jsx 정적 배선 계약
// ════════════════════════════════════════════════════════════════════════
console.log('\nC. App.jsx — mixedDirections 배선이 resolveSessionSpellingDirection을 쓰고, guided/review는 무변경')
const app = readFileSync('src/App.jsx', 'utf8')

check('App.jsx가 resolveSessionSpellingDirection을 ./utils/writePracticeDirection에서 import',
  /import\s*\{\s*resolveSessionSpellingDirection\s*\}\s*from\s*['"]\.\/utils\/writePracticeDirection['"]/.test(app))

const mixedBlockMatch = app.match(/const mixedDirections = useMemo\(\(\) => \{([\s\S]*?)\}, \[([\s\S]*?)\]\)/)
check('mixedDirections useMemo 블록을 소스에서 추출 성공(전제)', !!mixedBlockMatch)
const mixedBody = mixedBlockMatch ? mixedBlockMatch[1] : ''
const mixedDeps = mixedBlockMatch ? mixedBlockMatch[2] : ''

check('mixedDirections 블록이 resolveSessionSpellingDirection(studyMode, spellingSettings.spellingDirection)을 호출',
  /resolveSessionSpellingDirection\(\s*studyMode\s*,\s*spellingSettings\.spellingDirection\s*\)/.test(mixedBody))
check('mixedDirections 블록의 조기 반환이 sessionDirection !== \'mixed\'로 비교',
  /sessionDirection !== 'mixed'/.test(mixedBody))
check('mixedDirections 블록이 여전히 mixedDirectionsRef = useRef 패턴 유지',
  /mixedDirectionsRef\.current/.test(mixedBody))
check('mixedDirections 블록이 여전히 extendStableDirections( 호출 유지',
  /extendStableDirections\(/.test(mixedBody))
check('mixedDirections 블록이 여전히 assignDirections( 호출 유지',
  /assignDirections\(/.test(mixedBody))
check('mixedDirections useMemo deps 배열에 studyMode 포함',
  /\bstudyMode\b/.test(mixedDeps), { mixedDeps })

const guidedBlockMatch = app.match(/const guidedMixedDirections = useMemo\(\(\) => \{([\s\S]*?)\}, \[([\s\S]*?)\]\)/)
check('guidedMixedDirections useMemo 블록을 소스에서 추출 성공(전제)', !!guidedBlockMatch)
const guidedBody = guidedBlockMatch ? guidedBlockMatch[1] : ''
check('guidedMixedDirections 블록은 여전히 spellingSettings.spellingDirection !== \'mixed\' 리터럴 사용(무변경)',
  /spellingSettings\.spellingDirection !== 'mixed'/.test(guidedBody))
check('guidedMixedDirections 블록은 resolveSessionSpellingDirection을 호출하지 않음(무변경)',
  !/resolveSessionSpellingDirection/.test(guidedBody))

const reviewBlockMatch = app.match(/const reviewMixedDirections = useMemo\(\(\) => \{([\s\S]*?)\}, \[([\s\S]*?)\]\)/)
check('reviewMixedDirections useMemo 블록을 소스에서 추출 성공(전제)', !!reviewBlockMatch)
const reviewBody = reviewBlockMatch ? reviewBlockMatch[1] : ''
check('reviewMixedDirections 블록은 여전히 spellingSettings.spellingDirection !== \'mixed\' 리터럴 사용(무변경)',
  /spellingSettings\.spellingDirection !== 'mixed'/.test(reviewBody))
check('reviewMixedDirections 블록은 resolveSessionSpellingDirection을 호출하지 않음(무변경)',
  !/resolveSessionSpellingDirection/.test(reviewBody))

check('spellingDirectionOverride 배선(WordDetail 전달부)이 여전히 그대로 존재',
  /spellingDirectionOverride=\{mixedDirections \? mixedDirections\[selectedWordIdx\] \|\| 'kr2en' : null\}/.test(app))

// ════════════════════════════════════════════════════════════════════════
// D. SpellingQuestion.jsx — 질문 단계(phase==='answer')는 정답/반대언어 미노출(무변경 재확인)
// ════════════════════════════════════════════════════════════════════════
console.log('\nD. SpellingQuestion.jsx — phase===answer 블록은 pairedText/targetAnswer 미참조')
const spellingQSrc = readFileSync('src/components/SpellingQuestion.jsx', 'utf8')
const answerBlockMatch = spellingQSrc.match(/\{phase === 'answer' && \(([\s\S]*?)\)\}\s*\{phase === 'reveal'/)
check('phase===answer 블록을 소스에서 추출 성공(전제)', !!answerBlockMatch)
const answerBlock = answerBlockMatch ? answerBlockMatch[1] : ''
check('질문 단계(phase===answer) JSX는 pairedText를 참조하지 않음(정답 언어 사전 노출 0)',
  answerBlockMatch != null && !/pairedText/.test(answerBlock))
check('질문 단계(phase===answer) JSX는 targetAnswer도 참조하지 않음(정답 자체 사전 노출 0)',
  answerBlockMatch != null && !/targetAnswer/.test(answerBlock))

// ════════════════════════════════════════════════════════════════════════
// E. WordDetail.jsx — SpellingQuestion에 넘기는 direction 배선 무변경
// ════════════════════════════════════════════════════════════════════════
console.log('\nE. WordDetail.jsx — direction={spellingDirectionOverride || spellingSettings?.spellingDirection || \'kr2en\'} 유지')
const wordDetailSrc = readFileSync('src/components/WordDetail.jsx', 'utf8')
check('WordDetail.jsx가 여전히 spellingDirectionOverride 우선, 없으면 반 설정, 최종 폴백 kr2en으로 배선',
  /direction=\{spellingDirectionOverride \|\| spellingSettings\?\.spellingDirection \|\| 'kr2en'\}/.test(wordDetailSrc))

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failing check(s)`)
process.exit(failures ? 1 : 0)
