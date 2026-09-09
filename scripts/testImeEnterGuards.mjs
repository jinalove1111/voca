// scripts/testImeEnterGuards.mjs — 한글 IME 입력 가능 텍스트 입력의 Enter
// 핸들러 isComposing 가드 중앙 계약 (2026-09-09, QA 세션 후속).
//
// 실사고 패턴: c9dd262가 SpellingQuestion.jsx의 두 onKeyDown(answer/reveal)
// 에 `!e.nativeEvent.isComposing` 가드를 추가했다(EntranceTest.jsx:456의
// 기존 패턴과 동일) — 한글 IME 조합 중 Enter를 누르면 keydown이
// e.key === 'Enter'로 들어와도 아직 완성되지 않은 음절이 input.value에
// 반영돼 있어 잘린 값으로 제출/이동된다.
//
// 이 스크립트가 확인하는 것: SpellingQuestion/EntranceTest 외에도 한글을
// 입력할 수 있는 텍스트 입력에 Enter 핸들러가 걸려 있는 곳이 세 군데 더
// 있었다 — StudentSelect.jsx 로그인 이름 입력, SentenceLearningFlow.jsx
// 빈칸 답 입력, AdminScreen.jsx 반/유닛 이름 변경 입력. 이 셋 모두 조합
// 중 Enter로 포커스 이동/제출/저장이 발생하면 마지막 음절이 잘린 채
// 처리된다(로그인 이름 케이스는 "학생을 찾을 수 없음" P0 경로로 이어짐).
//
// 검증 방법: jsdom 등 실제 keydown 이벤트 발생 환경이 이 저장소에
// 없으므로(규칙 6), 기존 관례(scripts/testSpellingImeGuard.mjs 등)를
// 그대로 따라 소스 텍스트에서 각 input 요소의 onKeyDown 핸들러 문자열을
// 정확히 추출해 isComposing 가드 존재를 정규식으로 단언한다. 숫자
// PIN/비밀번호 입력이나 버튼형(role="button") Enter/Space 핸들러는
// 한글 IME 조합과 무관하므로 이번 가드 대상이 아니며, 이 스크립트는
// 그 핸들러 문자열이 이 세션에서 변경되지 않았음을 스냅샷으로 고정한다.
//
// 실행: node scripts/testImeEnterGuards.mjs
// 수정 전(원래 소스) 실행 결과: StudentSelect/SentenceLearningFlow/
// AdminScreen 세 핸들러 모두 isComposing 가드 부재로 FAIL(3개, 아래
// 리포트에 실측 로그 별첨). SpellingQuestion/EntranceTest는 이미
// c9dd262로 가드가 적용돼 있어 PASS.
import { readFileSync } from 'node:fs'

let failures = 0, asserted = 0
const check = (label, cond, detail) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failures++ }
}

// CRLF 정규화 — Windows 체크아웃 대비(regex의 [^}] 등은 CRLF와 무관하지만
// 저장소 관례를 따라 통일).
const readSrc = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const files = {
  spelling: readSrc('src/components/SpellingQuestion.jsx'),
  entrance: readSrc('src/components/EntranceTest.jsx'),
  studentSelect: readSrc('src/components/StudentSelect.jsx'),
  sentenceFlow: readSrc('src/components/SentenceLearningFlow.jsx'),
  admin: readSrc('src/components/AdminScreen.jsx'),
  wordDetail: readSrc('src/components/WordDetail.jsx'),
  parent: readSrc('src/components/ParentScreen.jsx'),
}

// 각 대상의 <input .../> 전체 마크업(속성 순서 무관하게 onKeyDown을 찾기
// 위해 여는 태그부터 '/>' 또는 '>'까지)을 추출하는 헬퍼. anchor로 주변의
// 고유 문자열(placeholder/value 등)을 넘겨 해당 input을 특정한다.
function extractInputTag(src, anchor) {
  const anchorIdx = src.indexOf(anchor)
  if (anchorIdx === -1) return null
  // anchor 앞쪽으로 가장 가까운 '<input'을 찾는다.
  const tagStart = src.lastIndexOf('<input', anchorIdx)
  if (tagStart === -1) return null
  // anchor 뒤쪽으로 가장 가까운 '/>' 를 태그의 끝으로 본다(이 저장소
  // 관례상 input은 self-closing).
  const tagEnd = src.indexOf('/>', anchorIdx)
  if (tagEnd === -1) return null
  return src.slice(tagStart, tagEnd + 2)
}

function extractOnKeyDown(tag) {
  if (!tag) return null
  const m = tag.match(/onKeyDown=\{[^}]*\}/)
  return m ? m[0] : null
}

console.log('\n1. SpellingQuestion.jsx — answer 단계 입력창 (이미 적용됨, 회귀 가드)')
{
  const tag = extractInputTag(files.spelling, "placeholder='정답 입력...'".replace(/'/g, '"')) ||
    extractInputTag(files.spelling, 'submitAnswer()')
  // 위 앵커가 불안정할 수 있어, 더 견고하게: 첫 번째와 두 번째
  // onKeyDown={...submitAnswer()...} 를 직접 정규식으로 순서대로 찾는다.
  const matches = [...files.spelling.matchAll(/onKeyDown=\{[^}]*submitAnswer\(\)[^}]*\}/g)]
  check('SpellingQuestion.jsx에 submitAnswer onKeyDown 핸들러 2개 존재(answer/reveal, 전제)', matches.length === 2, matches.length)
  const [answerKd, revealKd] = matches.map(m => m[0])
  check('answer 단계 onKeyDown이 isComposing 가드 보유', !!answerKd && /isComposing/.test(answerKd), answerKd)
  console.log('\n2. SpellingQuestion.jsx — reveal 단계 입력창 (이미 적용됨, 회귀 가드)')
  check('reveal 단계 onKeyDown이 isComposing 가드 보유', !!revealKd && /isComposing/.test(revealKd), revealKd)
}

console.log('\n3. EntranceTest.jsx — 답안 입력 onKeyDown (이미 적용됨, 회귀 가드)')
{
  const m = files.entrance.match(/onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter' && !e\.nativeEvent\.isComposing && input\.trim\(\)\) advance\(input\) \}\}/)
  check("EntranceTest.jsx 답안 입력 onKeyDown이 !isComposing && input.trim() 가드를 유지", !!m)
}

console.log('\n4. StudentSelect.jsx — 로그인 이름(한글) 입력 onKeyDown')
{
  const tag = extractInputTag(files.studentSelect, 'placeholder="이름 입력...')
  check('로그인 이름 <input> 태그 추출 성공(전제)', !!tag)
  check('로그인 이름 input이 type="text"(전제, 한글 입력 가능)', !!tag && /type="text"/.test(tag))
  const kd = extractOnKeyDown(tag || '')
  check('로그인 이름 onKeyDown 핸들러 존재(전제)', !!kd, kd)
  check("로그인 이름 onKeyDown이 e.key === 'Enter' 조건 유지(기존 포커스 이동 로직 무변경)",
    !!kd && /e\.key === 'Enter'/.test(kd))
  check('로그인 이름 onKeyDown에 IME 조합 가드(isComposing) 존재 — 조합 중 Enter로 포커스 이동 시 이름 잘림 방지',
    !!kd && /isComposing/.test(kd), kd)
  check('로그인 이름 onKeyDown이 조합 중이 아닐 때만 loginPinRef 포커스 이동(로직 반전 아님)',
    !!kd && /!e\.nativeEvent\.isComposing/.test(kd) && /loginPinRef\.current\?\.focus\(\)/.test(kd))
}

console.log('\n5. SentenceLearningFlow.jsx — 빈칸 답(한글 가능) 입력 onKeyDown')
{
  const tag = extractInputTag(files.sentenceFlow, 'placeholder="빈칸에 들어갈 단어"')
  check('빈칸 답 <input> 태그 추출 성공(전제)', !!tag)
  check('빈칸 답 input이 type="text"(전제)', !!tag && /type="text"/.test(tag))
  const kd = extractOnKeyDown(tag || '')
  check('빈칸 답 onKeyDown 핸들러 존재(전제)', !!kd, kd)
  check("빈칸 답 onKeyDown이 e.key === 'Enter' 조건 유지(기존 제출 로직 무변경)",
    !!kd && /e\.key === 'Enter'/.test(kd))
  check('빈칸 답 onKeyDown에 IME 조합 가드(isComposing) 존재 — 조합 중 Enter로 잘린 답 제출 방지',
    !!kd && /isComposing/.test(kd), kd)
  check('빈칸 답 onKeyDown이 조합 중이 아닐 때만 submitBlank 호출',
    !!kd && /!e\.nativeEvent\.isComposing/.test(kd) && /submitBlank\(\)/.test(kd))
}

console.log('\n6. AdminScreen.jsx — 반/유닛 이름 변경(한글) 입력 onKeyDown')
{
  const tag = extractInputTag(files.admin, 'value={renameValue}')
  check('이름 변경 <input> 태그 추출 성공(전제)', !!tag)
  check('이름 변경 input이 type="text"(전제)', !!tag && /type="text"/.test(tag))
  const kd = extractOnKeyDown(tag || '')
  check('이름 변경 onKeyDown 핸들러 존재(전제)', !!kd, kd)
  check("이름 변경 onKeyDown이 e.key === 'Enter' 조건 유지(기존 저장 로직 무변경)",
    !!kd && /e\.key === 'Enter'/.test(kd))
  check('이름 변경 onKeyDown에 IME 조합 가드(isComposing) 존재 — 조합 중 Enter로 잘린 이름 저장 방지',
    !!kd && /isComposing/.test(kd), kd)
  check('이름 변경 onKeyDown이 조합 중이 아닐 때만 saveRename 호출',
    !!kd && /!e\.nativeEvent\.isComposing/.test(kd) && /saveRename\(\)/.test(kd))
}

console.log('\n7. 범위 밖(out-of-scope) 핸들러 — 숫자 PIN/비밀번호/버튼형은 무변경 스냅샷')
{
  // StudentSelect.jsx — PIN 입력(숫자 전용, 한글 조합 불가능)
  {
    const tag = extractInputTag(files.studentSelect, 'placeholder="PIN 4자리"')
    const kd = extractOnKeyDown(tag || '')
    check('StudentSelect PIN input이 type="password"(숫자 전용, 전제)', !!tag && /type="password"/.test(tag))
    check("StudentSelect PIN onKeyDown 스냅샷 무변경: e.key === 'Enter' && handleLogin()",
      kd === "onKeyDown={e => e.key === 'Enter' && handleLogin()}", kd)
  }
  // ParentScreen.jsx — PIN 입력(숫자 전용)
  {
    const tag = extractInputTag(files.parent, 'placeholder="PIN 4자리"')
    const kd = extractOnKeyDown(tag || '')
    check('ParentScreen PIN input이 type="password"(숫자 전용, 전제)', !!tag && /type="password"/.test(tag))
    check("ParentScreen PIN onKeyDown 스냅샷 무변경: e.key === 'Enter' && handleSearch()",
      kd === "onKeyDown={e => e.key === 'Enter' && handleSearch()}", kd)
  }
  // AdminScreen.jsx — 관리자 비밀번호 입력(숫자 아니지만 admin 전용
  // 비밀번호, 학생/한글 이름 입력이 아니므로 범위 밖 — 스냅샷 무변경만 확인)
  {
    const tag = extractInputTag(files.admin, 'placeholder="비밀번호"')
    const kd = extractOnKeyDown(tag || '')
    check('AdminScreen 비밀번호 input이 type="password"(전제)', !!tag && /type="password"/.test(tag))
    check("AdminScreen 비밀번호 onKeyDown 스냅샷 무변경: e.key === 'Enter' && !checkingPin && handlePin()",
      kd === "onKeyDown={e => e.key === 'Enter' && !checkingPin && handlePin()}", kd)
  }
  // WordDetail.jsx — 버튼형(role="button") Enter/Space 핸들러 2개(발음
  // 카드/퀴즈 카드) — 텍스트 입력이 아니므로 IME 조합과 무관, 스냅샷만.
  {
    const matches = [...files.wordDetail.matchAll(/onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{ e\.preventDefault\(\); \w+\(\) \} \}\}/g)]
    check('WordDetail.jsx 버튼형 Enter/Space 핸들러 2개(발음/퀴즈 카드) 무변경', matches.length === 2, matches.map(m => m[0]))
  }
}

console.log(failures === 0
  ? `\n모든 단언 통과(${asserted}개) — IME Enter 가드 중앙 계약 확인 완료 ✅`
  : `\n${failures}/${asserted}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
