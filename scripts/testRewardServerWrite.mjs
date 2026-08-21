// scripts/testRewardServerWrite.mjs
//
// Reward System V1 — 서버 쓰기 경로(api/grant-xp.js의 `ledger:'reward'`
// 분기, service_role 전용) 검증. 네트워크 0, Supabase 접촉 0.
//
// 커버리지 경계(정직하게 명시): 이 프로젝트에는 Vercel 서버리스 핸들러를
// 가짜 req/res + 가짜 supabase 클라이언트로 직접 구동하는 하네스가 아직
// 없다(api/grant-xp.js가 `@supabase/supabase-js`의 실제 createClient를
// 모듈 최상단에서 import해서 호출하므로, 순수 함수 계약처럼 인메모리로
// 완전히 격리하려면 별도 모듈 모킹 인프라가 필요 — 이번 작업 범위 밖).
// 그래서 이 파일은 두 층으로 검증한다:
//   1) 순수 결정 함수 계약 — src/utils/rewardEngine.js의
//      isValidRewardType/isValidRewardSource/resolveRewardStars를 직접
//      호출(실제 supabase-js/네트워크 전혀 관여 안 함, 완전한 화이트박스
//      단위 테스트).
//   2) 핸들러 소스 정적 검사 — api/grant-xp.js의 `ledger === 'reward'`
//      분기 텍스트를 파일에서 그대로 잘라내 문자열/정규식으로 확인한다
//      (예: "req.body에서 금액을 읽지 않는다"는 걸 런타임으로 증명하려면
//      모든 가능한 입력을 실행해야 하지만, 정적 검사는 "그런 코드 자체가
//      소스에 없다"는 걸 확인 — 코드가 없으면 실행될 수도 없다는 논리로
//      런타임 증명을 대체한다. 완전한 대체는 아니다: 예를 들어 난독화된
//      우회(`req['bo' + 'dy']`)까지는 잡지 못한다 — 이 프로젝트 코드
//      스타일에서 그런 우회가 나올 가능성은 낮다고 판단해 범위에서 뺐다).
//
// CLAUDE.md 규칙 15(FAIL-first) — 이 파일을 작성한 시점에는
// api/grant-xp.js에 `ledger === 'reward'` 분기가 아직 없고,
// src/hooks/useStudent.js의 grantLedgerReward도 postRewardEvent를 호출하지
// 않았다. 그 상태로 먼저 1회 실행해 정적 검사 단언들이 실제로 FAIL하는지
// 확인했다(원문은 최종 보고에 기록) — 순수 함수 계약(rewardEngine.js는
// 이미 이 작업의 일부로 먼저 구현됨) 부분만 선행 PASS였고, 핸들러
// 분기/클라이언트 배선 부분은 전부 FAIL이었다. 이후 api/grant-xp.js +
// src/utils/wordLibrary.js(postRewardEvent) + src/hooks/useStudent.js
// (grantLedgerReward 배선)를 구현해 전체 PASS로 전환했다.
import fs from 'node:fs'
import {
  REWARD_STARS, REWARD_SOURCE_RULES,
  isValidRewardType, isValidRewardSource, resolveRewardStars,
} from '../src/utils/rewardEngine.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// 실제 useStudent.js의 todayStr() 형식(`new Date().toDateString()`)과
// 정확히 같은 모양의 고정 문자열 — 오늘 날짜에 의존하지 않는 결정론적
// 테스트 픽스처(rewardEngine.js가 이 형식을 검증 대상으로 삼는 근거는
// 그 파일 주석 "todayStr()가 실제로 만드는 형식" 참고).
const FIXED_DATE = 'Sat Aug 15 2026'
const FIXED_UUID_V4 = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

console.log('\n1. isValidRewardType — 앵커 5+1종 true / legacy-baseline false / 임의 문자열 false')
{
  const anchors = ['word-session-complete', 'writing-complete', 'exam-complete', 'wrong-word-recovered', 'daily-goal-complete', 'streak-bonus']
  check('앵커 6종(5개 고정금액+1개 가변) 전부 true', anchors.every((t) => isValidRewardType(t) === true))
  check("'legacy-baseline'은 false(마이그레이션 전용, 클라이언트 요청 불가)", isValidRewardType('legacy-baseline') === false)
  check('임의 문자열은 false', isValidRewardType('made-up-reward-type') === false && isValidRewardType('') === false)
  check('비문자열 입력도 안전하게 false', isValidRewardType(null) === false && isValidRewardType(undefined) === false && isValidRewardType(123) === false)
  check('REWARD_SOURCE_RULES에 legacy-baseline 키가 없음(화이트리스트 자체에서 원천 배제)', !Object.prototype.hasOwnProperty.call(REWARD_SOURCE_RULES, 'legacy-baseline'))
}

console.log('\n2. isValidRewardSource — 정상 조합 true')
{
  check('word-session-complete + daily-words + 날짜', isValidRewardSource('word-session-complete', 'daily-words', FIXED_DATE) === true)
  check('writing-complete + daily-writing + 날짜', isValidRewardSource('writing-complete', 'daily-writing', FIXED_DATE) === true)
  check('exam-complete + entrance-test + uuid', isValidRewardSource('exam-complete', 'entrance-test', FIXED_UUID_V4) === true)
  check('wrong-word-recovered + spelling-review + 날짜:토큰', isValidRewardSource('wrong-word-recovered', 'spelling-review', `${FIXED_DATE}:word-42_A`) === true)
  check('daily-goal-complete + daily-goal + 날짜', isValidRewardSource('daily-goal-complete', 'daily-goal', FIXED_DATE) === true)
  check('streak-bonus + streak + 날짜:3(형식만 검증, 금액은 resolveRewardStars 담당)', isValidRewardSource('streak-bonus', 'streak', `${FIXED_DATE}:3`) === true)
  check('streak-bonus + streak + 날짜:5', isValidRewardSource('streak-bonus', 'streak', `${FIXED_DATE}:5`) === true)
  check('streak-bonus + streak + 날짜:7', isValidRewardSource('streak-bonus', 'streak', `${FIXED_DATE}:7`) === true)
}

console.log('\n3. isValidRewardSource — sourceType 뒤바꿈 → false')
{
  check('exam-complete에 daily-words sourceType(뒤바꿈) → false', isValidRewardSource('exam-complete', 'daily-words', FIXED_UUID_V4) === false)
  check('word-session-complete에 entrance-test sourceType(뒤바꿈) → false', isValidRewardSource('word-session-complete', 'entrance-test', FIXED_DATE) === false)
  check('daily-goal-complete에 streak sourceType(뒤바꿈) → false', isValidRewardSource('daily-goal-complete', 'streak', `${FIXED_DATE}:3`) === false)
}

console.log('\n4. isValidRewardSource — 날짜 형식 위조 → false')
{
  const badDates = ['2026-8-1', '2026-08-01', 'abc', '', '2026/08/15', 'Sat Aug 15', 'Sat Aug 5 2026']
  check(`날짜 위조 ${badDates.length}종 전부 false(word-session-complete)`, badDates.every((d) => isValidRewardSource('word-session-complete', 'daily-words', d) === false))
  check('undefined/null sourceId → false', isValidRewardSource('word-session-complete', 'daily-words', undefined) === false && isValidRewardSource('word-session-complete', 'daily-words', null) === false)
}

console.log('\n5. isValidRewardSource — uuid 아닌 exam sourceId → false')
{
  const badUuids = ['not-a-uuid', '12345', FIXED_DATE, '3fa85f64-5717-4562-b3fc', '']
  check(`uuid 위조 ${badUuids.length}종 전부 false(exam-complete)`, badUuids.every((id) => isValidRewardSource('exam-complete', 'entrance-test', id) === false))
}

console.log('\n6. isValidRewardSource — streak 범위/형식 이상 → false, resolveRewardStars는 별도로 0')
{
  check('streak가 정수 아님("abc") → false', isValidRewardSource('streak-bonus', 'streak', `${FIXED_DATE}:abc`) === false)
  check('streak가 0 → false(1~3650 범위 밖)', isValidRewardSource('streak-bonus', 'streak', `${FIXED_DATE}:0`) === false)
  check('streak가 3651 → false(1~3650 범위 밖)', isValidRewardSource('streak-bonus', 'streak', `${FIXED_DATE}:3651`) === false)
  check('구분자 : 없음 → false', isValidRewardSource('streak-bonus', 'streak', FIXED_DATE) === false)
  check('streak가 3/5/7이 아닌 유효 정수(4)는 형식상 true(범위 안)지만', isValidRewardSource('streak-bonus', 'streak', `${FIXED_DATE}:4`) === true)
  check('resolveRewardStars로는 0(3/5/7만 지급 대상)', resolveRewardStars('streak-bonus', 4) === 0)
}

console.log('\n7. resolveRewardStars — 서버 금액 결정의 유일한 경로')
{
  check('word-session-complete = 1', resolveRewardStars('word-session-complete') === 1 && resolveRewardStars('word-session-complete') === REWARD_STARS['word-session-complete'])
  check('writing-complete = 2', resolveRewardStars('writing-complete') === 2)
  check('exam-complete = 2', resolveRewardStars('exam-complete') === 2)
  check('wrong-word-recovered = 1', resolveRewardStars('wrong-word-recovered') === 1)
  check('daily-goal-complete = 3', resolveRewardStars('daily-goal-complete') === 3)
  check('streak-bonus(3) = 2 / (5) = 3 / (7) = 5', resolveRewardStars('streak-bonus', 3) === 2 && resolveRewardStars('streak-bonus', 5) === 3 && resolveRewardStars('streak-bonus', 7) === 5)
  check('streak-bonus(4) = 0(3/5/7 아님)', resolveRewardStars('streak-bonus', 4) === 0)
  check("알 수 없는 rewardType = 0", resolveRewardStars('made-up-reward-type') === 0)
  check("'legacy-baseline' = 0(REWARD_STARS엔 있지만 isValidRewardType이 false라 여기서도 0)", resolveRewardStars('legacy-baseline') === 0)
}

// ── 8) api/grant-xp.js 정적 검사 ────────────────────────────────────────
console.log('\n8. api/grant-xp.js — 기존 XP 경로 하위호환(무변경) 확인')
{
  const src = fs.readFileSync('api/grant-xp.js', 'utf8')
  check("resolveXpAmount 기반 기존 XP 결정 경로 존재", /resolveXpAmount\(/.test(src))
  check("xp_ledger insert 경로 존재(기존 XP 원장 무변경)", /\.from\(\s*['"]xp_ledger['"]\s*\)/.test(src))
  check("_pinAuth.js의 service_role 헬퍼 사용(anon key 하드코딩 아님)", /supabaseAdminUrl\(\)/.test(src) && /supabaseAdminKey\(\)/.test(src))
}

console.log('\n9. api/grant-xp.js — ledger:\'reward\' 분기 존재 + 내용 검사')
{
  const src = fs.readFileSync('api/grant-xp.js', 'utf8')
  const hasBranch = /ledger\s*===\s*['"]reward['"]/.test(src)
  check("req.body.ledger === 'reward' 분기 문자열 존재", hasBranch)

  // 분기 텍스트만 잘라서 검사(가능하면) — 분기가 없으면 파일 전체를 그대로
  // 써서 이하 단언이 전부 정직하게 FAIL 하도록(빈 문자열을 검사 대상으로
  // 만들어 우연히 PASS하는 것을 방지).
  let block = ''
  if (hasBranch) {
    const startIdx = src.search(/ledger\s*===\s*['"]reward['"]/)
    block = src.slice(startIdx)
  }

  check("rewardEngine.js에서 isValidRewardType/isValidRewardSource/resolveRewardStars import", /isValidRewardType/.test(src) && /isValidRewardSource/.test(src) && /resolveRewardStars/.test(src))
  check("rewardIdempotencyKey를 서버가 직접 호출해 idempotency_key 조립(클라이언트 값 신뢰 안 함)", /rewardIdempotencyKey\(/.test(block))
  check("reward_ledger insert 경로 존재", /\.from\(\s*['"]reward_ledger['"]\s*\)/.test(block))
  check("stars_delta를 resolveRewardStars 결과로 채움(하드코딩/req.body 아님)", /stars_delta\s*:\s*stars\b/.test(block) || /stars_delta\s*:\s*resolveRewardStars\(/.test(block))
  check("xp_delta는 0 고정", /xp_delta\s*:\s*0\b/.test(block))
  check("23505(DUPLICATE_KEY_VIOLATION) 분기 존재", /23505/.test(block) || /DUPLICATE_KEY_VIOLATION/.test(block))
  check("42P01/PGRST205(table_missing) 분기 존재", /42P01/.test(block) && /PGRST205/.test(block))
  check("zero_reward 거부 분기 존재(stars <= 0)", /stars\s*<=\s*0/.test(block) && /zero_reward/.test(block))
  check("invalid_student_id / unknown_reward_type / invalid_reward_source reason 문자열 존재", /invalid_student_id/.test(block) && /unknown_reward_type/.test(block) && /invalid_reward_source/.test(block))
}

console.log("\n10. api/grant-xp.js — 클라이언트 금액/키 신뢰 금지(req.body에서 금액/클라이언트 idempotency_key를 읽지 않음)")
{
  const src = fs.readFileSync('api/grant-xp.js', 'utf8')
  // 주석 안의 서술(예: "req.body.amount는 어디서도 읽지 않음")까지 코드로
  // 오탐되지 않도록, 각 줄에서 `//` 이후(줄 전체 주석 + 줄 끝 인라인 주석
  // 둘 다)를 잘라낸 코드만 검사한다(scripts/testRewardEngine.mjs의
  // codeOnly 패턴을 인라인 주석까지 확장 — 이 파일은 `//`가 문자열 리터럴/
  // 정규식 안에 등장하지 않으므로 안전하게 적용 가능).
  // 2026-08-22 — CRLF 환경 수정. JS 정규식에서 `.`은 `\r`을 매치하지 않아,
  // CRLF 파일(Windows 체크아웃)에서는 줄이 `...// 주석\r`로 끝나 `//.*$`가
  // 끝까지 닿지 못하고 주석 제거가 통째로 실패했다 — 그 결과 api/grant-xp.js
  // 173행의 주석("req.body.amount는 어디서도 읽지 않음")이 코드로 오탐돼
  // 이 단언이 거짓 FAIL을 냈다(제품 코드는 정상). 줄 끝 `\r`을 먼저 떼고
  // 주석을 제거해 LF/CRLF 양쪽에서 동일하게 동작하게 한다.
  const codeOnly = src.split('\n').map((line) => line.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n')
  const forbiddenAmountReads = ['body.stars', 'body.amount', 'body.starsDelta', 'body.stars_delta', 'req.body.stars']
  check('req.body에서 금액 필드를 직접 읽는 코드 0건(주석 제외)', forbiddenAmountReads.every((needle) => !codeOnly.includes(needle)))
  const forbiddenKeyReads = ['body.idempotencyKey', 'body.idempotency_key']
  check('req.body에서 클라이언트가 보낸 idempotency_key를 읽는 코드 0건(주석 제외)', forbiddenKeyReads.every((needle) => !codeOnly.includes(needle)))
}

console.log('\n11. api/grant-xp.js — student_progress/students UPDATE·DELETE 금지')
{
  const src = fs.readFileSync('api/grant-xp.js', 'utf8')
  const destructivePattern = /\.from\(\s*['"](student_progress|students)['"]\s*\)\s*\.\s*(update|delete)\s*\(/
  check('student_progress/students 대상 update/delete 호출 0건', !destructivePattern.test(src))
}

// ── 12) 클라이언트 배선 정적 검사 ───────────────────────────────────────
console.log('\n12. src/utils/wordLibrary.js — postRewardEvent(fire-and-forget, 실패 삼킴)')
{
  const src = fs.readFileSync('src/utils/wordLibrary.js', 'utf8')
  const hasFn = /export\s+async\s+function\s+postRewardEvent\s*\(/.test(src)
  check('postRewardEvent export 존재', hasFn)

  let body = ''
  if (hasFn) {
    const startIdx = src.search(/export\s+async\s+function\s+postRewardEvent\s*\(/)
    // 다음 top-level export 선언 전까지를 함수 본문으로 취급(대략적이지만
    // 이 파일의 함수들이 전부 top-level export로 구분되는 스타일이라 충분).
    const rest = src.slice(startIdx + 10)
    const nextExportIdx = rest.search(/\nexport\s/)
    body = nextExportIdx === -1 ? src.slice(startIdx) : src.slice(startIdx, startIdx + 10 + nextExportIdx)
  }
  check("ledger:'reward' 요청을 /api/grant-xp로 POST", /ledger\s*:\s*['"]reward['"]/.test(body) && /\/api\/grant-xp/.test(body))
  check('catch 블록으로 네트워크 실패를 삼킴', /catch\s*\{/.test(body) || /catch\s*\([^)]*\)\s*\{/.test(body))
}

console.log('\n13. src/hooks/useStudent.js — grantLedgerReward가 postRewardEvent를 fire-and-forget 호출')
{
  const src = fs.readFileSync('src/hooks/useStudent.js', 'utf8')
  const startIdx = src.indexOf('const grantLedgerReward = useCallback(')
  check('grantLedgerReward 정의 존재', startIdx !== -1)
  let body = ''
  if (startIdx !== -1) {
    // 다음 useCallback 정의 시작 전까지(대략)를 본문으로 취급 — 이 파일의
    // 다른 훅 콜백 정의부와 확실히 구분됨(테스트 목적의 근사 파싱).
    const rest = src.slice(startIdx + 40)
    const nextIdx = rest.search(/\n\s*const \w+ = useCallback\(/)
    body = nextIdx === -1 ? src.slice(startIdx) : src.slice(startIdx, startIdx + 40 + nextIdx)
  }
  check('postRewardEvent 호출 존재', /postRewardEvent\(/.test(body))
  check('await 없이 fire-and-forget 호출(앞에 await 토큰이 붙지 않음)', /(^|[^a-zA-Z])postRewardEvent\(/.test(body) && !/await\s+postRewardEvent\(/.test(body))
}

console.log(failures === 0
  ? '\n모든 단언 통과 — Reward System V1 서버 쓰기 경로(api/grant-xp.js ledger:reward) 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
