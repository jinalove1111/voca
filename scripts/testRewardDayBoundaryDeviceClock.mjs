// scripts/testRewardDayBoundaryDeviceClock.mjs
//
// QA 감사(2026-09-10, qa/reward-audit-2026-09-10) — "하루 경계/기기 시계
// 오차(device clock skew)"에서 reward 날짜 토큰과 XP 기간키가 실제로
// 어떻게 다르게 동작하는지 순수 함수 계약으로 고정한다. 이 파일은 정책을
// 주장하지 않는다 — "지금 코드가 실제로 하는 일"만 문서화 단언으로
// 고정하고, 정책적 판단이 섞인 단언에는 전부 `현재 계약(문서화)` 라벨을
// 붙인다(운영자 지시). production 코드는 한 글자도 바꾸지 않는다(TEST-ONLY
// 세션).
//
// 대상:
//   · src/utils/rewardEngine.js — isValidRewardSource / rewardDailyCap /
//     REWARD_SOURCE_RULES(날짜 패턴 3종: 'date' / 'date:token' /
//     'date:streak') / kstDayStartMs. DATE_TOKEN_RE 자체는 export되지
//     않는 모듈 내부 상수라 직접 import할 수 없다 — isValidRewardSource를
//     통해 그 정규식이 실제로 강제하는 동작을 간접 관측한다(재구현 없음).
//   · src/utils/paulRankShared.js — isValidDayPeriodKey. DAY_KEY_TOLERANCE_MS
//     도 마찬가지로 비-export 내부 상수라, 소스 정적 읽기로 "지금 선언된
//     리터럴 값"만 인용하고(그 값 자체가 맞는지는 판단하지 않음) 실제
//     허용 폭은 isValidDayPeriodKey 호출로 행동 관측한다.
//
// 핵심 대비(이 파일이 고정하는 사실):
//   reward 날짜 토큰(REWARD_SOURCE_RULES 'date'/'date:token'/'date:streak')은
//   **형식만** 검사한다(DATE_TOKEN_RE, "Www Mmm dd yyyy" 정규식 매치 여부) —
//   그 날짜가 "오늘 근방"인지는 전혀 보지 않는다. 반면 XP 기간키
//   (isValidDayPeriodKey, paulRankShared.js)는 형식(Date 파싱 가능 여부)뿐
//   아니라 **서버 시각 기준 ±DAY_KEY_TOLERANCE_MS 이내인지**까지 확인한다.
//   즉 reward 쪽은 "미래/과거 날짜를 자유롭게 골라도 형식만 맞으면 통과",
//   XP 쪽은 "형식이 맞아도 서버 시각에서 너무 멀면 거부"라는 서로 다른
//   계약이다 — reward 쪽의 무제한 파밍은 REWARD_DAILY_CAP(하루 지급 "건수"
//   상한, sourceId 값 자체와 무관)이 별도로 막는다(이 파일이 아니라
//   scripts/testRewardServerHardening.mjs/testRewardCapRace.mjs 소관).
//
// 순수 함수 호출만 한다 — esbuild 번들/네트워크/DB 전부 없음(두 대상 모듈
// 모두 이미 plain Node ESM으로 바로 import 가능, "완전 순수" 계약 — 각
// 파일 헤더 주석 참고).
//
// 등록: npm run verify:reward-day-boundary (rewardSystem 그룹, extra:false)
// 네트워크 0, DB 0, product 코드 무수정.

import fs from 'node:fs'
import {
  isValidRewardSource, rewardDailyCap, REWARD_SOURCE_RULES, kstDayStartMs,
} from '../src/utils/rewardEngine.js'
import { isValidDayPeriodKey } from '../src/utils/paulRankShared.js'

let failures = 0
let asserted = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const dateToken = (ms) => new Date(ms).toDateString() // DATE_TOKEN_RE가 강제하는 실제 형식(Www Mmm dd yyyy)과 동일 생성 경로(useStudent.js todayStr()와 동일 관례)
const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.now()

console.log('=== Reward 날짜 토큰 vs XP 기간키 — 하루 경계/기기 시계 오차 계약 (문서화, 네트워크 0) ===')

console.log('\n0. 픽스처 — REWARD_SOURCE_RULES 날짜 관련 패턴 3종 확인(재구현 없이 실제 export를 그대로 읽음)')
{
  check("word-session-complete 패턴 == 'date'", REWARD_SOURCE_RULES['word-session-complete']?.pattern === 'date')
  check("wrong-word-recovered 패턴 == 'date:token'", REWARD_SOURCE_RULES['wrong-word-recovered']?.pattern === 'date:token')
  check("streak-bonus 패턴 == 'date:streak'", REWARD_SOURCE_RULES['streak-bonus']?.pattern === 'date:streak')
}

console.log("\n1(a). 현재 계약(문서화): reward date 토큰(pattern:'date')은 형식만 검사 — 미래 날짜도 통과")
{
  const cases = [
    ['오늘', dateToken(now)],
    ['어제(-24h)', dateToken(now - DAY_MS)],
    ['내일(+24h)', dateToken(now + DAY_MS)],
    ['+25h(다음날 새벽 근처, 기기 시계가 25시간 빠름)', dateToken(now + 25 * 60 * 60 * 1000)],
    ['-25h(기기 시계가 25시간 느림)', dateToken(now - 25 * 60 * 60 * 1000)],
    ['먼 미래(+365일)', dateToken(now + 365 * DAY_MS)],
    ['먼 과거(-365일)', dateToken(now - 365 * DAY_MS)],
  ]
  for (const [label, token] of cases) {
    check(
      `현재 계약(문서화): '${label}' 날짜 토큰(${token})도 형식만 맞으면 word-session-complete 통과`,
      isValidRewardSource('word-session-complete', 'daily-words', token) === true,
    )
  }
}

console.log("\n1(b). 말형식 위조는 여전히 거부 — 위 '형식만 검사'가 '아무 문자열이나 통과'는 아님을 대조")
{
  const malformed = [
    ['ISO 형식(YYYY-MM-DD)', '2026-09-10'],
    ['요일/월만 있고 연도 없음', 'Sat Aug 15'],
    ['연도 2자리', 'Sat Aug 15 26'],
    ['숫자만', '20260910'],
    ['임의 문자열', 'not-a-date'],
    ['빈 문자열', ''],
    ['요일 약어가 4글자', 'Satu Aug 15 2026'],
  ]
  for (const [label, token] of malformed) {
    check(`말형식(${label} = ${JSON.stringify(token)})은 여전히 거부`, isValidRewardSource('word-session-complete', 'daily-words', token) === false)
  }
}

console.log("\n2(a). 현재 계약(문서화): wrong-word-recovered('date:token')도 날짜 부분은 형식만 검사 — 미래 날짜 허용")
{
  const cases = [
    ['오늘', dateToken(now)],
    ['내일(+24h)', dateToken(now + DAY_MS)],
    ['+25h', dateToken(now + 25 * 60 * 60 * 1000)],
    ['-25h', dateToken(now - 25 * 60 * 60 * 1000)],
  ]
  for (const [label, datePart] of cases) {
    const sourceId = `${datePart}:my_word`
    check(`현재 계약(문서화): '${label}' 날짜의 wrong-word-recovered(${sourceId})도 통과`, isValidRewardSource('wrong-word-recovered', 'spelling-review', sourceId) === true)
  }
}

console.log('\n2(b). ★ 설계상 문서화 — 같은 단어, 서로 다른(연속) 이틀치 date:token은 둘 다 개별적으로 유효(하루당 별도 키)')
{
  const day1 = dateToken(now)
  const day2 = dateToken(now + DAY_MS)
  const word = 'stubborn_word'
  const id1 = `${day1}:${word}`
  const id2 = `${day2}:${word}`
  check('day1 유효', isValidRewardSource('wrong-word-recovered', 'spelling-review', id1) === true)
  check('day2 유효', isValidRewardSource('wrong-word-recovered', 'spelling-review', id2) === true)
  check(
    '현재 계약(문서화): 두 날짜의 sourceId 문자열 자체가 다르므로(day1 !== day2) 서버 idempotency_key도 서로 달라 ' +
    '"같은 단어를 이틀 연속 회복"이 정상적으로 각각 1회씩 지급된다(재지급 버그 아님 — 날짜가 곧 기간키인 설계) — ' +
    '단, 하루에 서로 다른 단어를 몇 개나 이 방식으로 지급받을 수 있는지의 상한은 이 파일이 아니라 rewardDailyCap(아래 3절)이 담당',
    id1 !== id2,
  )
}

console.log("\n2(c). streak-bonus('date:streak')도 날짜 부분은 형식만 검사 — streak 값 자체는 1~3650 범위로 별도 제한")
{
  check('현재 계약(문서화): 미래 날짜 + 유효 streak(5) 통과', isValidRewardSource('streak-bonus', 'streak', `${dateToken(now + DAY_MS)}:5`) === true)
  check('streak 0은 범위 밖 거부(문서화 대상 아님 — 기존 범위 검증, 무회귀 확인용)', isValidRewardSource('streak-bonus', 'streak', `${dateToken(now)}:0`) === false)
  check('streak 3651은 범위 밖 거부(무회귀 확인용)', isValidRewardSource('streak-bonus', 'streak', `${dateToken(now)}:3651`) === false)
}

console.log('\n3. XP 기간키(isValidDayPeriodKey) — 서버 시각 기준 허용 폭(tolerance) 안에서만 통과, 밖이면 형식이 맞아도 거부')
{
  // DAY_KEY_TOLERANCE_MS는 paulRankShared.js의 비-export 내부 상수다(정의는
  // 그 파일 몫, 이 파일은 재구현하지 않는다) — 여기서는 "지금 선언된 리터럴
  // 값"만 소스에서 그대로 인용해(값이 맞다고 주장하지 않음) 아래 행동
  // 관측과 대조한다.
  const src = fs.readFileSync('src/utils/paulRankShared.js', 'utf8')
  const m = src.match(/DAY_KEY_TOLERANCE_MS\s*=\s*([^\n]+)/)
  check('소스에 DAY_KEY_TOLERANCE_MS 리터럴 선언이 있음(인용 대상 확보)', !!m)
  // eslint 없는 plain Node이므로 안전하게 숫자 표현식만 있는지 확인 후 eval 없이 직접 계산.
  const literalText = m ? m[1].trim().replace(/\s*$/, '') : ''
  check("리터럴이 숫자 곱셈 표현식 형태(예: '2 * 24 * 60 * 60 * 1000')", /^[\d\s*]+$/.test(literalText))
  const TOLERANCE_MS = literalText.split('*').map((s) => Number(s.trim())).reduce((a, b) => a * b, 1)
  console.log(`  (참고) 소스에서 읽은 DAY_KEY_TOLERANCE_MS = ${TOLERANCE_MS}ms(${TOLERANCE_MS / DAY_MS}일)`)

  const refNow = new Date(now)
  check('오늘(ISO) — 통과', isValidDayPeriodKey(new Date(now).toISOString(), refNow) === true)
  check('허용 폭 정확히 경계(now - TOLERANCE) — 통과(<=)', isValidDayPeriodKey(new Date(now - TOLERANCE_MS).toISOString(), refNow) === true)
  check('허용 폭 정확히 경계(now + TOLERANCE) — 통과(<=)', isValidDayPeriodKey(new Date(now + TOLERANCE_MS).toISOString(), refNow) === true)
  check('허용 폭 1ms 초과(과거 방향) — 거부', isValidDayPeriodKey(new Date(now - TOLERANCE_MS - 1).toISOString(), refNow) === false)
  check('허용 폭 1ms 초과(미래 방향) — 거부', isValidDayPeriodKey(new Date(now + TOLERANCE_MS + 1).toISOString(), refNow) === false)
  check(
    '현재 계약(문서화): +25h(기기 시계 오차 시나리오)는 허용 폭(±2일) 안이라 통과 — reward 날짜 토큰과 결과는 같지만 이유가 다름' +
    '(reward는 애초에 안 봄, XP는 봤지만 폭 안이라 통과)',
    isValidDayPeriodKey(new Date(now + 25 * 60 * 60 * 1000).toISOString(), refNow) === true,
  )
  check('형식 자체가 깨지면(Date 파싱 불가) 폭 안이어도 거부', isValidDayPeriodKey('not-a-date', refNow) === false)
  check('빈 문자열 거부', isValidDayPeriodKey('', refNow) === false)
  check('null/undefined/숫자 등 비문자열 거부(방어)', isValidDayPeriodKey(null, refNow) === false && isValidDayPeriodKey(undefined, refNow) === false && isValidDayPeriodKey(12345, refNow) === false)
}

console.log('\n4. 서버 상한(L3) 창 — kstDayStartMs가 "서버 현재 시각"에서 파생되는지 정적으로 확인(클라이언트가 창의 시작점을 결정하지 못함)')
{
  // kstDayStartMs 자체는 순수 함수라 인자로 무엇이든 받을 수 있다(테스트
  // 가능성을 위해 의도적으로 시각을 주입받음, 파일 헤더 주석) — "실제
  // 운영에서 무엇을 넘기는가"는 api/grant-xp.js 호출부가 결정한다. 그
  // 호출부가 클라이언트 입력(sourceId/token 등)이 아니라 서버 자신의
  // Date.now()를 넘기는지를 소스 정적 검사로 고정한다(회귀 시 사람이
  // "상한 창을 클라이언트가 조작 가능한 값으로 바꿔도" 이 파일이 못
  // 잡는 걸 막기 위함 — kstDayStartMs 자체를 직접 호출해서는 이 사실을
  // 검증할 수 없다, 순수 함수는 인자를 안 가리기 때문).
  const src = fs.readFileSync('api/grant-xp.js', 'utf8')
  const capBlockStart = src.indexOf("// L3) 일일 상한")
  check('api/grant-xp.js에 L3(일일 상한) 주석 블록 존재(인용 대상 확보)', capBlockStart !== -1)
  const capBlock = capBlockStart !== -1 ? src.slice(capBlockStart, capBlockStart + 1200) : ''
  check(
    "L3 블록이 gte('created_at', new Date(kstDayStartMs(Date.now())).toISOString())로 상한 창을 계산 " +
    '(서버 자신의 Date.now() 기준 — sourceId/req.body의 어떤 필드도 이 창의 시작점 계산에 쓰이지 않음)',
    /gte\(\s*'created_at'\s*,\s*new Date\(kstDayStartMs\(Date\.now\(\)\)\)\.toISOString\(\)\s*\)/.test(capBlock),
  )
  check(
    'L3 블록에 req.body 참조가 없음(상한 창 계산이 클라이언트 입력을 전혀 읽지 않음)',
    !/req\.body/.test(capBlock),
  )

  // kstDayStartMs 자체의 순수 계산 회귀(무회귀 확인용, 이 파일이 새로 만든
  // 계약이 아니라 기존 함수의 정상 동작을 재확인) — KST 자정 경계.
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000
  const midnightKstUtcMs = Date.UTC(2026, 8, 10) - KST_OFFSET_MS // 2026-09-10 00:00 KST를 UTC ms로
  check('KST 자정 정각 -> 그 자신(하루 시작)', kstDayStartMs(midnightKstUtcMs) === midnightKstUtcMs)
  check('KST 자정 1ms 전(전날 23:59:59.999 KST) -> 전날 KST 자정', kstDayStartMs(midnightKstUtcMs - 1) === midnightKstUtcMs - DAY_MS)
  check('KST 자정 1ms 후 -> 같은 날 KST 자정(그대로)', kstDayStartMs(midnightKstUtcMs + 1) === midnightKstUtcMs)
  check(
    '현재 계약(문서화): UTC 자정(KST 09:00)은 KST 하루 경계가 아니므로 여전히 "전날" 버킷 — ' +
    'UTC 기준으로 상한을 리셋하면 09:00 KST에 일찍 풀리는 오탐이 생기는 걸 막기 위한 설계(파일 헤더 주석 근거)',
    kstDayStartMs(midnightKstUtcMs - KST_OFFSET_MS) === midnightKstUtcMs - DAY_MS,
  )
}

console.log('\n5. rewardDailyCap — sourceId(날짜 값)와 무관하게 (student,type) 조합당 "건수"로만 유계(reward 쪽의 실제 방어선)')
{
  check("word-session-complete cap === 1(하루 1건, 구조 자체가 서로 다른 날짜의 재지급을 막는 최종선)", rewardDailyCap('word-session-complete') === 1)
  check('wrong-word-recovered cap > 1(여러 단어 지급 허용 설계)', rewardDailyCap('wrong-word-recovered') > 1)
  check('legacy-baseline(REWARD_SOURCE_RULES에 없는 타입) cap === 0(fail-closed)', rewardDailyCap('legacy-baseline') === 0)
  check('미지 rewardType cap === 0', rewardDailyCap('never-defined-type') === 0)
}

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0
  ? '\n모든 단언 통과 — reward 날짜 토큰(형식만) vs XP 기간키(±허용 폭) 계약 문서화 확인 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
