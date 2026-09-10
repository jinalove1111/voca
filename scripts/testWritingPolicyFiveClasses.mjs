// 쓰기(spelling) 정책 — 5개 반 픽스처, 두 방향(한→영/영→한) 모두 연습
// 가능해야 한다는 정책의 실제 코드 계약 검증 — 2026-09-11
//
// 배경(운영자 지시): "쓰기 학습은 두 방향(한→영, 영→한) 모두 연습 가능해야
// 한다". 이 스위트는 그 정책이 실제로 어떤 화면 조건에서 지켜지고 어떤
// 조건에서는 지켜지지 않는지(정책의 자연스러운 귀결)를 5개 반 픽스처로
// 고정한다.
//
// 범위/제약: NO git 상태 변경, NO 네트워크, src 무수정(버그 발견 시
// 수정하지 않고 여기 보고). Pure/offline — esbuild 번들·DB 접촉 전혀
// 없음. WordDetail.jsx의 buildSteps(비공개 함수)와 wordLibrary.js의
// extendStableDirections는 소스에서 함수 본문만 정규식으로 추출해
// new Function으로 컴파일(scripts/testWordSlugParity.mjs가 이미 쓰는
// 관례 그대로 재사용 — 새 기법 발명 아님) — 무거운 React/Supabase 번들
// 없이도 "진짜 그 파일의 그 로직"을 그대로 실행해 검증한다.
//
// 읽은 소스: src/utils/writePracticeDirection.js(resolveSessionSpellingDirection),
// src/components/WordDetail.jsx(buildSteps ~758행, SpellingQuestion
// 호출부 direction ~938-955행), src/components/SpellingQuestion.jsx
// (promptText/targetAnswer/pairedText/hint 렌더 계약), src/utils/
// entranceTest.js(assignDirections), src/utils/wordLibrary.js
// (extendStableDirections), src/utils/spelling.js(isSpellingCorrect) —
// 전부 읽기만, 수정 없음.
import fs from 'node:fs'
import { resolveSessionSpellingDirection, WRITE_PRACTICE_MODE } from '../src/utils/writePracticeDirection.js'
import { assignDirections } from '../src/utils/entranceTest.js'
import { isSpellingCorrect } from '../src/utils/spelling.js'

let failures = 0, asserted = 0
const check = (label, cond, detail) => { asserted++; if (cond) console.log(`  PASS  ${label}`); else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); failures++ } }

// ── 실제 소스에서 순수 함수 본문 추출(testWordSlugParity.mjs와 동일 관례,
// new Function 컴파일 — 새 esbuild 번들 없이 "진짜 그 파일의 로직"을 실행) ──
const wordDetailSrc = fs.readFileSync('src/components/WordDetail.jsx', 'utf8')
const buildStepsMatch = wordDetailSrc.match(/function buildSteps\(mode, hasExample, spellingAllowed, hasCurriculumExample\) \{[\s\S]*?\n\}/)
if (!buildStepsMatch) throw new Error('WordDetail.jsx에서 buildSteps 함수를 추출하지 못함(정규식 불일치 — 파일이 바뀌었을 수 있음)')
// eslint-disable-next-line no-new-func
const buildSteps = new Function(`return (${buildStepsMatch[0]})`)()

const wordLibSrc = fs.readFileSync('src/utils/wordLibrary.js', 'utf8')
const extendMatch = wordLibSrc.match(/export function extendStableDirections\(prevDirs, targetLength, direction, assignFn = assignDirections\) \{[\s\S]*?\n\}/)
if (!extendMatch) throw new Error('wordLibrary.js에서 extendStableDirections 함수를 추출하지 못함')
// eslint-disable-next-line no-new-func
const extendStableDirectionsRaw = new Function('assignDirections', `return (${extendMatch[0].replace('export function', 'function')})`)(assignDirections)
// 실제 호출부(App.jsx)는 항상 기본 assignFn(=entranceTest.js의 진짜 assignDirections)을
// 쓴다 — 여기서도 항상 실제 assignDirections를 명시로 넘겨 기본 인자와
// 동일한 동작을 보장(추출 시 기본 파라미터의 클로저 스코프가 없어지므로).
const extendStableDirections = (prev, len, dir) => extendStableDirectionsRaw(prev, len, dir, assignDirections)

console.log('\n=== 0a. 소스 함수 추출 전제 확인(new Function 컴파일 대상이 실제로 함수인지) ===')
check('WordDetail.jsx에서 buildSteps 추출 성공 + 호출 가능한 함수', typeof buildSteps === 'function')
check('wordLibrary.js에서 extendStableDirections 추출 성공 + 호출 가능한 함수', typeof extendStableDirections === 'function')

console.log('\n=== 0. 5개 반 픽스처 — 프로덕션 유사 설정(초1~4: kr2en/testEnabled false/hint false, 초5: mixed/true/true 대조군) ===')
const FIXTURE_CLASSES = [
  { name: '초등1반', spellingDirection: 'kr2en', spellingTestEnabled: false, spellingHintEnabled: false },
  { name: '초등2반', spellingDirection: 'kr2en', spellingTestEnabled: false, spellingHintEnabled: false },
  { name: '초등3반', spellingDirection: 'kr2en', spellingTestEnabled: false, spellingHintEnabled: false },
  { name: '초등4반', spellingDirection: 'kr2en', spellingTestEnabled: false, spellingHintEnabled: false },
  { name: '초등5반(대조군)', spellingDirection: 'mixed', spellingTestEnabled: true, spellingHintEnabled: true },
]
check('픽스처 — 정확히 5개 반', FIXTURE_CLASSES.length === 5)
check('픽스처 — 4개 반은 production-like(kr2en/false/false), 1개 반은 대조군(mixed/true/true)',
  FIXTURE_CLASSES.filter((c) => c.spellingDirection === 'kr2en' && !c.spellingTestEnabled && !c.spellingHintEnabled).length === 4 &&
  FIXTURE_CLASSES.filter((c) => c.spellingDirection === 'mixed' && c.spellingTestEnabled && c.spellingHintEnabled).length === 1)

console.log('\n=== 1. studyMode \'write\' → 방향 항상 \'mixed\'(반 설정 무관, 운영자 결정 2026-09-09/handoff 118차) ===')
for (const cls of FIXTURE_CLASSES) {
  check(`${cls.name} — resolveSessionSpellingDirection('write', ${cls.spellingDirection}) = 'mixed'`,
    resolveSessionSpellingDirection(WRITE_PRACTICE_MODE, cls.spellingDirection) === 'mixed')
}

console.log("\n=== 1b. studyMode가 'write'가 아닌 모든 기존 모드는 이 함수가 손대지 않음(반 설정 그대로 pass-through, 회귀 방지) ===")
for (const mode of ['quiz', 'study', 'comprehensive', 'review', 'dailyRitual', 'entrance']) {
  for (const cls of FIXTURE_CLASSES) {
    check(`${cls.name} — resolveSessionSpellingDirection('${mode}', ${cls.spellingDirection}) = 그대로(${cls.spellingDirection})`,
      resolveSessionSpellingDirection(mode, cls.spellingDirection) === cls.spellingDirection)
  }
}

console.log("\n=== 2. 'comprehensive' + spellingTestEnabled=false → 'spelling' 단계 없음(정책 귀결: 일일 의식엔 쓰기 연습이 없다) ===")
for (const cls of FIXTURE_CLASSES.filter((c) => !c.spellingTestEnabled)) {
  const steps = buildSteps('comprehensive', true, cls.spellingTestEnabled, false)
  check(`${cls.name}(testEnabled=false) — buildSteps('comprehensive', ...)에 'spelling' 없음`, !steps.includes('spelling'), steps)
}
console.log('  정책 귀결(문서화) — 위 4개 반(초1~4, 운영자가 지정한 production-like 기본값)은 spellingTestEnabled=false라 종합(일일 의식) 모드 STEPS에 \'spelling\'이 전혀 안 들어간다. 즉 "두 방향 모두 연습 가능해야 한다"는 정책이 실제로 학생 화면에 도달하려면 최소 (a) 그 반의 spellingTestEnabled=true로 켜거나 (b) 별도 studyMode=\'write\' 진입 경로(항상 mixed)를 학생이 실제로 타야 한다 — 둘 다 아니면 정책은 코드상 옳아도 그 반 학생에게는 절대 노출되지 않는다.')

console.log("\n=== 3. 'comprehensive' + spellingTestEnabled=true → 'spelling' 단계 있음 + 방향 = 반 설정 ===")
{
  const cls = FIXTURE_CLASSES.find((c) => c.spellingTestEnabled)
  const steps = buildSteps('comprehensive', true, cls.spellingTestEnabled, false)
  check(`${cls.name}(testEnabled=true) — buildSteps('comprehensive', ...)에 'spelling' 포함`, steps.includes('spelling'), steps)
  check(`${cls.name} — resolveSessionSpellingDirection('comprehensive', ${cls.spellingDirection}) = 그대로(${cls.spellingDirection}) — 종합 모드는 이 함수가 손대지 않음(write 전용 강제)`,
    resolveSessionSpellingDirection('comprehensive', cls.spellingDirection) === cls.spellingDirection)
  // WordDetail.jsx의 실제 SpellingQuestion 호출부 direction 계약(정적 인용,
  // 758행대 buildSteps 아래 938-955행 근처) — override가 없으면 반 설정,
  // override(App.jsx의 mixedDirections, studyMode!=='write'여도 반 설정 자체가
  // 'mixed'면 여전히 매 단어 50:50으로 배정됨)가 있으면 그 값.
  check("WordDetail.jsx — SpellingQuestion에 direction={spellingDirectionOverride || spellingSettings?.spellingDirection || 'kr2en'} 계약 존재",
    /direction=\{spellingDirectionOverride \|\| spellingSettings\?\.spellingDirection \|\| 'kr2en'\}/.test(wordDetailSrc))
}

console.log("\n=== 3b. 가상 시나리오 — production-like 4개 반(kr2en 고정)에서 spellingTestEnabled만 켜면 어떻게 되는가(제안 9절의 근거 데이터) ===")
for (const cls of FIXTURE_CLASSES.filter((c) => !c.spellingTestEnabled)) {
  const hypo = { ...cls, spellingTestEnabled: true }
  const steps = buildSteps('comprehensive', true, hypo.spellingTestEnabled, false)
  check(`${cls.name} — spellingTestEnabled만 true로 바꾸면 'spelling' 단계가 즉시 생김(다른 코드 변경 불필요)`, steps.includes('spelling'), steps)
  check(`${cls.name} — 단, spellingDirection은 여전히 kr2en 고정이라 en2kr 문항은 절대 안 나옴(방향까지 바꿔야 "두 방향 모두" 정책이 완성됨, 제안 9절 두 번째 항목의 근거)`,
    resolveSessionSpellingDirection('comprehensive', hypo.spellingDirection) === 'kr2en')
}

console.log("\n=== 3c. buildSteps('study') — spelling 단계는 study 모드에 절대 포함되지 않음(회귀 방지, hasCurriculumExample/spellingAllowed 인자와 무관) ===")
for (const cls of FIXTURE_CLASSES) {
  const steps = buildSteps('study', true, cls.spellingTestEnabled, true)
  check(`${cls.name} — buildSteps('study', hasExample=true, spellingAllowed=${cls.spellingTestEnabled}, hasCurriculumExample=true)에 'spelling' 없음(study 모드 자체가 분기하지 않음)`,
    !steps.includes('spelling'), steps)
}

console.log("\n=== 4. buildSteps('write') = ['spelling'] (모든 반 공통, 반 설정과 무관) ===")
for (const cls of FIXTURE_CLASSES) {
  const steps = buildSteps('write', true, cls.spellingTestEnabled, true) // hasExample/hasCurriculumExample을 true로 줘도 무시되는지까지 확인
  check(`${cls.name} — buildSteps('write', ...) = ['spelling'] 정확히(다른 인자와 무관)`, JSON.stringify(steps) === JSON.stringify(['spelling']), steps)
}
check("buildSteps('quiz', ...) = ['quiz'] (회귀 방지, write와 혼동 없음)", JSON.stringify(buildSteps('quiz', true, true, true)) === JSON.stringify(['quiz']))

console.log('\n=== 5. mixed 배정 — 40단어 20/20 + extendStableDirections 성장 시 안정(기존 인덱스 재배정 없음) ===')
{
  let seed = 7
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const dirs40 = assignDirections(40, 'mixed', { rng })
  const kr = dirs40.filter((d) => d === 'kr2en').length
  const en = dirs40.filter((d) => d === 'en2kr').length
  check('40단어 mixed 배정 — 정확히 20 kr2en : 20 en2kr', kr === 20 && en === 20, { kr, en })
  const grown = extendStableDirections(dirs40, 46, 'mixed')
  check('46개로 성장 — 길이 46', grown.length === 46, grown.length)
  check('기존 40개 인덱스의 방향은 그대로(순서/값 불변, 재셔플 없음)', dirs40.every((d, i) => grown[i] === d))
  const shrink = extendStableDirections(grown, 10, 'mixed')
  check('축소 요청(46->10)은 무시 — 기존 46개 배열 그대로 반환', shrink.length === 46 && shrink.every((d, i) => d === grown[i]))
  check('빈 배열에서 시작해도 정상 확장(40개)', extendStableDirections([], 40, 'mixed').length === 40)
  const fixed = extendStableDirections([], 20, 'kr2en')
  check("direction='kr2en' 고정 배정도 여전히 지원(전부 kr2en)", fixed.every((d) => d === 'kr2en'))
}

console.log('\n=== 5b. 반별 실제 설정값으로 assignDirections를 그대로 호출 — kr2en 고정 4개 반은 20문제 전부 kr2en(en2kr 0문항, 제안 9절 근거 재확인), 대조군(mixed)만 en2kr 존재 ===')
for (const cls of FIXTURE_CLASSES) {
  const dirs = assignDirections(20, cls.spellingDirection)
  if (cls.spellingDirection === 'kr2en') {
    check(`${cls.name} — 실제 반 설정(kr2en)으로 20문제 배정 시 전부 kr2en(en2kr 0문항)`, dirs.every((d) => d === 'kr2en'), dirs)
  } else {
    check(`${cls.name} — 실제 반 설정(mixed)으로 20문제 배정 시 kr2en/en2kr 둘 다 존재(정확히 10:10)`,
      dirs.filter((d) => d === 'kr2en').length === 10 && dirs.filter((d) => d === 'en2kr').length === 10, dirs)
  }
}

console.log("\n=== 6. 정적 계약 — SpellingQuestion.jsx는 정답 노출 전 promptText만 렌더(한 언어만), targetAnswer/pairedText는 정답 화면 전용 ===")
{
  const src = fs.readFileSync('src/components/SpellingQuestion.jsx', 'utf8')
  check('promptText 계약 — isEn2Kr이면 word(영어 제시), 아니면 meaning(한글 제시) — 한 번에 한 언어만',
    /const promptText = isEn2Kr \? word : meaning/.test(src))
  check('targetAnswer 계약 — isEn2Kr이면 meaning(한글 정답), 아니면 word(영어 정답)',
    /const targetAnswer = isEn2Kr \? meaning : word/.test(src))
  check("입력 placeholder도 방향별로 분기(en2kr='한글로 뜻을 입력하세요', kr2en='영어로 철자를 입력하세요') — 학생이 어느 방향인지 화면에서 항상 구분 가능",
    /const inputPlaceholder = isEn2Kr \? '한글로 뜻을 입력하세요' : '영어로 철자를 입력하세요'/.test(src))
  const answerBlockMatch = src.match(/\{phase === 'answer' && \(([\s\S]*?)\)\}\s*\{phase === 'reveal'/)
  check('phase===answer 블록(문제 화면) 추출 성공(전제)', !!answerBlockMatch)
  const answerBlock = answerBlockMatch ? answerBlockMatch[1] : ''
  check('문제 화면(phase===answer)은 targetAnswer(정답 원문)를 참조하지 않음(정답 사전 노출 0)', !/targetAnswer/.test(answerBlock))
  check('문제 화면(phase===answer)은 pairedText(반대 언어 병기)도 참조하지 않음', !/pairedText/.test(answerBlock))
  // "문제(answer 단계) 렌더 몸통" — promptText만 표시하는 gray 박스(속도 잠금
  // 해제 전) + speakerUnlocked 박스(잠금 해제 후) 둘 다 promptText 기준.
  check('문제 텍스트 표시 자체는 promptText 하나로만(잠금 전/후 두 분기 모두 promptText 참조)',
    (src.match(/\{promptText\}/g) || []).length >= 2)

  console.log('  힌트 정책 관찰(hintEnabled=false 반에도 예외 존재) — spellingHintFor(target)는 "첫 글자 + 나머지 밑줄"만 노출(전체 정답 노출 아님, src/utils/spelling.js:111). hintEnabled가 true인 반에서만 학생이 직접 "힌트 보기"를 눌러야 노출되는 게 기본이지만, en2kr 방향 문항은 오답 3회 후 speakerUnlocked 잠금해제 시점에 hintEnabled 설정과 무관하게(소스 주석이 명시: "hintEnabled 설정과도 별개") 힌트가 자동 노출된다.')
  const speakerUnlockedBlock = (src.match(/speakerUnlocked \? \(([\s\S]*?)\) : \(/) || [])[1] || ''
  // 주석 안에 "hintEnabled 설정과도 별개"라는 문구가 정확히 있어(사람이
  // 이미 이 예외를 인지하고 남긴 주석) 순수 텍스트 검사로는 "코드가
  // hintEnabled를 참조하는지"와 "주석이 그 단어를 언급하는지"를 구분할 수
  // 없다 — 라인 주석을 먼저 제거한 뒤, 실제 JSX/JS 코드에만 hintEnabled
  // 조건이 없는지를 확인한다(코드 레벨에서 이 힌트 노출이 hintEnabled에
  // 게이팅되지 않음을 실측).
  const codeOnly = speakerUnlockedBlock.replace(/\/\/.*$/gm, '')
  check('힌트-무관 노출 경로 실측 — speakerUnlocked && isEn2Kr 분기의 실제 JSX/JS 코드(주석 제외)에는 hintEnabled 조건이 없음(정책 예외, 4개 production-like 반도 예외 대상)',
    /isEn2Kr \? \(/.test(codeOnly) && /💡 뜻 힌트/.test(codeOnly) && !/hintEnabled/.test(codeOnly))
}

console.log('\n=== 7. "~"(물결표) 정규화 — 양방향 모두 적용(2026-09-10 초등 5반 준비 수정, kr2en/en2kr 대칭) ===')
{
  check("kr2en 방향 — isSpellingCorrect('listen to', 'listen to ~') = true(영어 target 쪽 '~' 제거 허용)",
    isSpellingCorrect('listen to', 'listen to ~') === true)
  check("en2kr 방향 — isSpellingCorrect('주위에', '~ 주위에') = true(한글 target 쪽도 동일 허용)",
    isSpellingCorrect('주위에', '~ 주위에') === true)
}

console.log('\n=== 8. NBSP/내부 공백/끝 문장부호 — 현재 정책 무변경 확인(testSpelling.mjs §15 중 3건만 재인용, 전체 재복제 아님) ===')
{
  check('"공포\\u00a0영화" == "공포 영화"(한글 내부 NBSP는 공백 처리, testSpelling.mjs §15)', isSpellingCorrect('공포 영화', '공포 영화') === true)
  check('"horror  movie" != "horror movie"(영어 내부 이중 공백은 여전히 오답, testSpelling.mjs §15)', isSpellingCorrect('horror  movie', 'horror movie') === false)
  check('"enjoy." != "enjoy"(끝 마침표는 여전히 오답, testSpelling.mjs §15)', isSpellingCorrect('enjoy.', 'enjoy') === false)
}

console.log('\n=== 9. 제안 — 일일 의식(daily ritual) 안에 쓰기를 원할 경우의 반별 설정 변경안(출력 전용, DB 쓰기 0) ===')
{
  console.log('  ※ 아래는 이 스크립트가 어떤 DB/설정도 변경하지 않고 콘솔에만 출력하는 제안이다 — 실제 적용은 운영자 승인 후 관리자 화면(Teacher Controls)에서 수동으로.')
  console.log('  | 반(placeholder)     | 설정 항목              | 현재(before) | 제안(after) | 사유 |')
  console.log('  |---------------------|-------------------------|--------------|-------------|------|')
  for (const cls of FIXTURE_CLASSES.filter((c) => !c.spellingTestEnabled)) {
    console.log(`  | ${cls.name.padEnd(19)} | spellingTestEnabled     | false        | true        | 일일 의식(comprehensive)에 'spelling' 단계를 넣어야 두 방향 연습이 실제로 매일 노출됨(섹션2 정책 귀결) |`)
    console.log(`  | ${cls.name.padEnd(19)} | spellingDirection       | kr2en        | mixed       | "두 방향 모두 연습"을 반 설정 층위에서 보장(현재는 kr2en 고정이라 en2kr 문항이 전혀 안 나옴) |`)
  }
  check('제안 테이블 대상 — production-like 4개 반 전부 출력됨(스킵 없음)', FIXTURE_CLASSES.filter((c) => !c.spellingTestEnabled).length === 4)
}

console.log('\n' + '='.repeat(70))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 5개 반 쓰기(spelling) 정책 계약 고정')
