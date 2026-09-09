// scripts/testEntranceTestPadding.mjs — EntranceTest 'running' 단계 하단
// 여백(pb-24) 회귀 테스트 (2026-09-09, QA 세션 Finding 2, LOW-MED).
//
// 실사고 배경: App.jsx:997의 <SpeedBtn/>은 모든 화면에 고정(fixed
// bottom-right, z-40)으로 뜬다. 2026-09-06 야간 QA가 Dashboard/
// WordDetail/QuizGame/SpellingReview와 EntranceTest의 'result' 단계에는
// pb-24를 추가했지만(App.jsx SpeedBtn 겹침 수정), EntranceTest의
// 'running' 단계(실제로 문제를 풀며 전체 폭 "확인"/"모르겠어요, 다음
// 문제 →" 버튼이 있는 화면)는 그 커밋 범위에서 빠졌다. 360x640 같은
// 좁은 화면에서 이 버튼들이 고정 SpeedBtn 아래 가려질 수 있었다.
//
// 검증 방법: EntranceTest.jsx는 다수 모듈(entranceTest 엔진 등)을 실제
// import하고 useEffect 게이트로 단계가 갈리는 컴포넌트라 SSR로 'running'
// 단계 렌더 분기까지 안전하게 도달시키는 비용/위험이 이 국소 className
// 수정 대비 과함(규칙 1, testTextbookGradeLabel.mjs의 f절과 동일한 판단
// 근거) — 소스 정적 검사로 'running' 단계 JSX 블록을 추출해 pb-24가
// 붙었는지 확인한다. 'result' 단계의 기존 pb-24는 그대로인지(회귀 가드)도
// 함께 확인한다. 'loading'/'none'/'choose'/'intro' 단계는 이번 작업
// 범위가 아니므로 assert하지 않고 보고만 한다(지시사항).
//
// 실행: node scripts/testEntranceTestPadding.mjs
// 수정 전(원래 소스) 실행 결과: 'running' 단계 컨테이너에 pb-24가 없어
// FAIL(아래 리포트에 실측 로그 별첨).
import { readFileSync } from 'node:fs'

let failures = 0, asserted = 0
const check = (label, cond, detail) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failures++ }
}

// 저장소 소스 파일은 CRLF(\r\n)로 저장돼 있음 — 정규식에 리터럴 \n을 쓰면
// 매치가 조용히 실패하므로, 읽자마자 LF로 정규화해 순수 정적 검사만 한다
// (파일을 다시 쓰지 않으므로 실제 SpellingQuestion/EntranceTest 파일의
// CRLF는 전혀 건드리지 않음 — 이 스크립트 안의 문자열 처리에만 적용).
const src = readFileSync('src/components/EntranceTest.jsx', 'utf8').replace(/\r\n/g, '\n')

console.log("\n1. 'running' 단계 — 문제 풀이 화면 루트 컨테이너에 pb-24 적용")
{
  const runningMatch = src.match(/if \(phase === 'running'\) \{([\s\S]*?)\n  \}\n\n  \/\/ phase === 'result'/)
  check("phase==='running' 블록을 소스에서 추출 성공(전제)", !!runningMatch, runningMatch === null)
  const runningBlock = runningMatch ? runningMatch[1] : ''
  const rootDivMatch = runningBlock.match(/return \(\s*(?:\/\/[^\n]*\n\s*)*<div className="([^"]*)">/)
  check('running 단계 return문의 루트 <div> className을 추출 성공(전제)', !!rootDivMatch, rootDivMatch)
  const rootClassName = rootDivMatch ? rootDivMatch[1] : ''
  check('running 단계 루트 컨테이너가 min-h-screen 컨테이너임(전제, 다른 div를 잘못 집지 않았는지)',
    /min-h-screen/.test(rootClassName), rootClassName)
  check('running 단계 루트 컨테이너 className에 pb-24 토큰 포함(SpeedBtn 겹침 방지)',
    rootClassName.split(/\s+/).includes('pb-24'), rootClassName)
}

console.log("\n2. 회귀 가드 — 'result' 단계의 기존 pb-24는 그대로 유지")
{
  check("phase==='result' 화면(반환문 바로 위 주석 + return) 루트 컨테이너가 여전히 min-h-screen p-4 pb-24",
    /return \(\s*<div className="min-h-screen p-4 pb-24">\{header\}/.test(src))
}

console.log('\n3. 참고 — 이번 assert 대상이 아닌 다른 단계(loading/none/choose/intro)의 컨테이너 className (보고용)')
{
  for (const phase of ['loading', 'none', 'choose', 'intro']) {
    const re = new RegExp(`phase === '${phase}'[\\s\\S]{0,400}?<div className="([^"]*)">`)
    const m = src.match(re)
    console.log(`  INFO  phase==='${phase}' 첫 컨테이너 className 근사치: ${m ? JSON.stringify(m[1]) : '패턴 미검출(수동 확인 필요)'}`)
  }
  check('참고 스캔 완료(assert 없음, 정보 출력만)', true)
}

console.log(failures === 0
  ? `\n모든 단언 통과(${asserted}개) — EntranceTest running 단계 pb-24 적용 확인 ✅`
  : `\n${failures}/${asserted}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
