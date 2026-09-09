// scripts/testSpellingImeGuard.mjs — 쓰기 시험 IME 조합 중 Enter 오제출
// 회귀 테스트 (2026-09-09, QA 세션 Finding 1, MED).
//
// 실사고 패턴: en2kr(한글 뜻을 입력) 문제에서 한글 IME로 조합 중일 때
// Enter를 누르면, 브라우저 keydown이 e.key === 'Enter'로 들어와도 아직
// 완성되지 않은 음절이 input.value에 반영돼 있어(예: "사" 조합 중 Enter
// -> "사"만 제출) 잘린 답으로 채점된다. src/components/EntranceTest.jsx는
// 이미 동일 패턴에 `!e.nativeEvent.isComposing` 가드를 쓰고 있는데
// (WordDetail/QuizGame과 달리 EntranceTest도 Korean 답 입력을 받음),
// src/components/SpellingQuestion.jsx의 두 onKeyDown(answer/reveal 단계)
// 에는 이 가드가 없었다.
//
// 검증 방법: 실제 keydown 이벤트를 발생시키려면 jsdom 등 DOM 환경이
// 필요한데(규칙 6, 외부 의존성 최소화 — 이 저장소에는 jsdom/
// react-test-renderer가 없음), 이 컴포넌트의 두 핸들러는 순수 JSX 인라인
// 함수라 로직을 분리해 import할 수도 없다. 그래서 이 저장소의 기존 관례
// (scripts/testWritingDirectionResolution.mjs 9~15절, testAdminUnitEdit.mjs
// D/E절 — jsdom 없이 소스 정적 검사로 배선을 고정)를 그대로 따라 소스
// 텍스트에서 두 onKeyDown 핸들러를 정확히 추출해 isComposing 가드가
// 있는지 정규식으로 단언한다. EntranceTest.jsx의 동일 패턴이 여전히
// 그대로인지(패리티, 회귀 가드)도 함께 확인한다.
//
// 실행: node scripts/testSpellingImeGuard.mjs
// 수정 전(원래 소스) 실행 결과: SpellingQuestion.jsx의 answer/reveal 두
// 핸들러 모두 isComposing 가드 부재로 FAIL(아래 리포트에 실측 로그 별첨).
import { readFileSync } from 'node:fs'

let failures = 0, asserted = 0
const check = (label, cond, detail) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failures++ }
}

const sqSrc = readFileSync('src/components/SpellingQuestion.jsx', 'utf8')
const etSrc = readFileSync('src/components/EntranceTest.jsx', 'utf8')

console.log('\n1. SpellingQuestion.jsx — answer 단계(phase===answer) 입력창의 onKeyDown')
{
  // phase==='answer' 블록만 추출(testWritingDirectionResolution.mjs 9~10절과
  // 동일 관례) — 이 블록 안의 첫 번째 onKeyDown이 대상.
  const answerBlockMatch = sqSrc.match(/\{phase === 'answer' && \(([\s\S]*?)\)\}\s*\{phase === 'reveal'/)
  check('phase===answer 블록을 소스에서 추출 성공(전제)', !!answerBlockMatch)
  const answerBlock = answerBlockMatch ? answerBlockMatch[1] : ''
  const onKeyDownMatch = answerBlock.match(/onKeyDown=\{[^}]*\}/)
  check('answer 단계 입력창에 onKeyDown 핸들러 존재(전제)', !!onKeyDownMatch, onKeyDownMatch)
  check("answer 단계 onKeyDown이 e.key === 'Enter' 조건을 그대로 유지(기존 제출 로직 무변경)",
    !!onKeyDownMatch && /e\.key === 'Enter'/.test(onKeyDownMatch[0]))
  check('answer 단계 onKeyDown에 IME 조합 가드(isComposing) 존재 — 조합 중 Enter로 잘린 답 제출 방지',
    !!onKeyDownMatch && /isComposing/.test(onKeyDownMatch[0]), onKeyDownMatch && onKeyDownMatch[0])
  check('answer 단계 onKeyDown이 조합 중이 아닐 때(!isComposing)만 submitAnswer 호출 — 로직 반전 아님',
    !!onKeyDownMatch && /!e\.nativeEvent\.isComposing/.test(onKeyDownMatch[0]) && /submitAnswer\(\)/.test(onKeyDownMatch[0]))
}

console.log('\n2. SpellingQuestion.jsx — reveal 단계(phase===reveal) 입력창의 onKeyDown')
{
  const revealBlockMatch = sqSrc.match(/\{phase === 'reveal' && \(([\s\S]*?)\)\}\s*\{phase === 'correct'/)
  check('phase===reveal 블록을 소스에서 추출 성공(전제)', !!revealBlockMatch)
  const revealBlock = revealBlockMatch ? revealBlockMatch[1] : ''
  const onKeyDownMatch = revealBlock.match(/onKeyDown=\{[^}]*\}/)
  check('reveal 단계 입력창에 onKeyDown 핸들러 존재(전제)', !!onKeyDownMatch, onKeyDownMatch)
  check("reveal 단계 onKeyDown이 e.key === 'Enter' 조건을 그대로 유지(기존 제출 로직 무변경)",
    !!onKeyDownMatch && /e\.key === 'Enter'/.test(onKeyDownMatch[0]))
  check('reveal 단계 onKeyDown에도 IME 조합 가드(isComposing) 존재 — answer 단계와 대칭 적용',
    !!onKeyDownMatch && /isComposing/.test(onKeyDownMatch[0]), onKeyDownMatch && onKeyDownMatch[0])
  check('reveal 단계 onKeyDown이 조합 중이 아닐 때(!isComposing)만 submitAnswer 호출',
    !!onKeyDownMatch && /!e\.nativeEvent\.isComposing/.test(onKeyDownMatch[0]) && /submitAnswer\(\)/.test(onKeyDownMatch[0]))
}

console.log('\n3. EntranceTest.jsx — 기존 IME 가드 패턴 무변경(패리티/회귀 가드, 이 세션에서 손대지 않은 로직)')
{
  check("EntranceTest.jsx의 답안 입력 onKeyDown이 여전히 !e.nativeEvent.isComposing && input.trim() 가드를 유지",
    /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter' && !e\.nativeEvent\.isComposing && input\.trim\(\)\) advance\(input\) \}\}/.test(etSrc))
}

console.log('\n4. 참고 — src/components/*.jsx 내 그 외 key===\'Enter\' 텍스트 제출 핸들러 목록(이번 assert 대상 아님, 보고용)')
{
  // 이 스크립트는 SpellingQuestion/EntranceTest 외에는 assert하지 않는다
  // (작업 지시 범위) — 아래는 순수 정보성 스캔·출력.
  const files = [
    'src/components/AdminScreen.jsx',
    'src/components/ParentScreen.jsx',
    'src/components/SentenceLearningFlow.jsx',
    'src/components/StudentSelect.jsx',
    'src/components/WordDetail.jsx',
  ]
  for (const f of files) {
    const s = readFileSync(f, 'utf8')
    const lines = s.split('\n')
    lines.forEach((line, i) => {
      if (/key === 'Enter'/.test(line)) {
        const hasGuard = /isComposing/.test(line)
        console.log(`  INFO  ${f}:${i + 1} — ${hasGuard ? '가드 있음' : '가드 없음(미조사, 보고만)'} — ${line.trim()}`)
      }
    })
  }
  check('참고 스캔 완료(assert 없음, 정보 출력만)', true)
}

console.log(failures === 0
  ? `\n모든 단언 통과(${asserted}개) — SpellingQuestion IME 가드 적용 확인 ✅`
  : `\n${failures}/${asserted}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
