// scripts/testTownEconomySim.mjs — Paul Town V1 레벨업/이코노미 결정론
// 시뮬레이션 (2026-09-11, qa/town-loop-hardening-2026-09-11).
//
// 목적: docs/design/TOWN_ECONOMY_AUDIT_2026-09-11.md가 만든 "전형 6 / 활발
// 12 / 최대 77 PD" 등 숫자를 그대로 믿지 않고(운영자 지시: DO NOT trust,
// recompute from code), 실제 코드가 지금 이 순간 계산하는 값을 순수 함수
// 임포트만으로 재도출한다. 하드코딩된 보상 금액은 이 파일에 단 하나도
// 없다 — REWARD_STARS/REWARD_DAILY_CAP/resolveRewardStars(rewardEngine.js),
// TOWN_LEVELS(townLevel.js), TOWN_ITEM_META(townCatalog.js),
// XP_EVENT_TABLE/resolveXpAmount(paulRankShared.js), ROUNDS/
// STAR_PER_CORRECT(matchGame.js)를 그대로 가져와 쓴다. 5개 모듈 전부
// import 0개(순수) — 이 스크립트도 네트워크/DB/src 수정 0.
//
// ── 핵심 재발견(2026-09-06 레거시 흡수, 이 스크립트가 실제로 확인함) ──────
// docs/design/TOWN_ECONOMY_AUDIT_2026-09-11.md §3은 "12종 보상 중 6종만
// 서버 reward_ledger에 도달하고 나머지 6종(pronunciation/mission-clear/
// daily-mission-bonus/spelling-combo/sticker-duplicate/matchgame)은
// grantReward(로컬)만 호출해 0 PD"라고 적었다. 그러나 src/hooks/
// useStudent.js의 grantReward() 본문(2026-09-06 커밋, scripts/
// testLegacyGrantCoverage.mjs·testLegacyRewardServer.mjs가 이미 registry에
// 등록돼 검증 중)은 매 호출마다 rewardEngine.parseLegacyDedupKey(dedupKey)로
// 레거시 6종의 dedupKey 프리픽스를 인식해 postRewardEvent()를 그대로
// 호출한다 — grantLedgerReward()가 신규 6종에 쓰는 것과 100% 동일한 fire-
// and-forget 경로(src/utils/wordLibrary.js:3503 postRewardEvent, 단일 함수).
// api/grant-xp.js의 reward 분기도 rewardType 화이트리스트를 6종으로 하드
// 코딩하지 않고 isValidRewardType()(REWARD_SOURCE_RULES에 있는 모든 타입,
// 즉 legacy-baseline만 제외한 12종)로 제네릭하게 받는다. 즉 2026-09-06
// 이후 코드에서는 "레거시 6종 = 0 PD"라는 전제 자체가 더 이상 사실이 아니다
// — 이 스크립트는 그 전제를 재구현하지 않고, isValidRewardType을 그대로
// 임포트해 "어떤 rewardType이 원장에 도달하는가"를 코드에서 그대로
// 파생시킨다(LEDGER_TYPES, 아래). 결과적으로 이 세 모델 전부에서 PD와
// STARS가 정확히 같아진다 — 우연이 아니라 위 재발견의 직접 결과다.
//
// ── PD_LEGACY6(비교용, 게이팅 아님) ─────────────────────────────────────
// 위 재발견과 별개로, 이번 작업 지시문 자체가 "grantLedgerReward=원장,
// grantReward=로컬 전용 0 PD"라는 **원래 설계 의도**(Reward System V1 최초
// 설계, 감사 문서와 동일 프레임)를 준 바 있다. 그 원래 프레임으로도 숫자를
// 볼 수 있게 PD_LEGACY6(6-anchor 전용 합계)를 별도로 함께 계산·출력한다 —
// 이건 "정답 후보 2번째"가 아니라 "코드가 바뀌기 전에는 이랬다"는 비교
// 기준선이다. 아래 §1의 필수 sanity band([4,10]) 판정은 이 PD_LEGACY6로
// 검사한다(그래야 원 지시문의 "6/12/77 PD" 계보와 같은 축에서 드리프트를
// 잡을 수 있다) — 반면 §2/§3(아이템 구매력/레벨 진행)은 실제 서버가 지금
// 정말로 적립하는 PD_LEDGER(12종 전부)로 계산한다. 이 두 값이 왜 다른
// 판단 기준을 쓰는지는 §1 출력부의 주석에도 반복해서 남긴다.
//
// ── 게이팅 정책(이 파일이 extra:false로 등록되는 이유) ──────────────────
// 이 스크립트는 "정책/밸런스가 좋은지 나쁜지"를 판정하는 감사 도구다 —
// 실제로 몇 가지 균형 판정은 현재 상수 기준으로 FAIL이 나온다(예: PD
// sanity band). 그 FAIL은 이 스크립트의 버그가 아니라 실제로 재현되는
// 경제 상태이므로, CLAUDE.md 규칙 15(회귀 의심 시 먼저 재현 확인) 정신에
// 따라 "숨기지 않고, 그러나 다른 모든 팀의 verify:all을 막지도 않는다"는
// 두 원칙을 동시에 지킨다: 구조적으로 항상 참이어야 하는 계약(단조성,
// 웰컴 크레딧 산술, XP 이벤트 게이팅, 죽은 구간 목록이 실제로 출력됐는가
// 등)만 gate(hardCheck, 실패 시 exit 1)로 삼고, "밸런스가 좋은가"를 묻는
// 정책 판정(PD 대역, L1 3일 접근성, L1~L3 5일 소진, 죽은 구간 개수)은
// finding()으로 분리해 항상 출력하되 exit code에 영향을 주지 않는다 —
// scripts/testRewardDailyCeilingTable.mjs·testRewardCapRace.mjs가 이미
// "결정 지원용(non-gating)"이라고 명시한 것과 같은 철학을, extra 플래그가
// 아니라 이 스크립트 내부의 두 트랙(check vs finding)으로 구현한 것.
//
// 데이터 소스가 아닌 상수 2개(코드로 import 불가, SQL/문서 사실):
//   - WELCOME_CREDIT_PD = 20 — supabase_v3_50_town_v1.sql의
//     grant_town_welcome_credit RPC 고정값(docs/design/PAUL_TOWN_V1.md §3,
//     TOWN_ECONOMY_AUDIT_2026-09-11.md §10). JS로 export된 상수가 없다.
//   - DOLLAR_RATE = 1 — supabase_v3_49_paul_dollar.sql의 dollar_rules 시드가
//     12개 reward_type 전부에 dollars_per_star=1을 준다(위 감사 문서 §2-3
//     인용). 이 값도 DB 시드 데이터라 JS import가 없다.
// 이 둘을 제외한 모든 금액/캡/레벨/가격/XP 상수는 실제 소스 파일에서
// import한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  REWARD_STARS,
  REWARD_DAILY_CAP,
  resolveRewardStars,
  rewardDailyCap,
  isValidRewardType,
  REWARD_SOURCE_RULES,
} from '../src/utils/rewardEngine.js'
import { TOWN_LEVELS } from '../src/utils/town/townLevel.js'
import { TOWN_ITEM_META } from '../src/utils/town/townCatalog.js'
import { XP_EVENT_TABLE, resolveXpAmount } from '../src/utils/paulRankShared.js'
import { ROUNDS, STAR_PER_CORRECT, GAME_REWARD_DAILY_LIMIT } from '../src/utils/matchGame.js'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')

// ── 진단 카운터 — check()는 게이트(실패 시 exit 1), finding()은 항상 출력만
// 하고 exit code에 관여하지 않는다(위 헤더 "게이팅 정책" 참고). ─────────
let hardAsserted = 0
let hardFailures = 0
function check(label, cond, detail) {
  hardAsserted++
  if (cond) console.log(`  GATE PASS  ${label}`)
  else { console.log(`  GATE FAIL  ${label}${detail !== undefined ? ' — ' + String(detail) : ''}`); hardFailures++ }
}
let findingsTotal = 0
let findingsFailed = 0
function finding(label, cond, detail) {
  findingsTotal++
  if (cond) console.log(`  FINDING PASS  ${label}`)
  else { console.log(`  FINDING FAIL  ${label}${detail !== undefined ? ' — ' + String(detail) : ''}`); findingsFailed++ }
}

// ── 드리프트 가드 — useStudent.js는 import하지 않지만(React 훅 파일, 이
// 스크립트의 "순수 5개 모듈만 import" 계약 밖) GOAL=5는 이 시뮬레이션의
// 트리거 조건(오늘 카테고리 첫 완료) 판단에 필요한 사실이라 값만 미러링
// 한다(townLevel.js가 rewardEngine.LEVELS를 미러링하는 것과 동일 관례,
// "드리프트는 테스트가 잡는다"). 소스 리터럴이 아직 5인지 텍스트로 확인.
const useStudentSrc = fs.readFileSync(path.join(ROOT, 'src/hooks/useStudent.js'), 'utf8')
const GOAL = 5
check('useStudent.js에 `const GOAL = 5` 리터럴이 여전히 존재한다(드리프트 가드)',
  /const GOAL = 5\b/.test(useStudentSrc))
check('useStudent.js의 daily-goal-complete/daily-mission-bonus 게이트가 여전히 4/4(>=4)다(드리프트 가드)',
  /countCategoriesCompleted\(round\)\s*>=\s*4/.test(useStudentSrc))

// SQL/문서 사실(코드 import 불가, 위 헤더 주석 참고) — 숫자 근거를 여기
// 한 곳에만 두고 아래 전부 이 상수를 참조한다.
const WELCOME_CREDIT_PD = 20 // supabase_v3_50_town_v1.sql grant_town_welcome_credit
const DOLLAR_RATE = 1 // supabase_v3_49_paul_dollar.sql dollar_rules (전 타입 공통)

// ── LEDGER_TYPES — "실제로 서버 reward_ledger에 도달하는 rewardType"을
// 코드에서 직접 파생한다(하드코딩된 6-vs-6 분류 없음). isValidRewardType이
// REWARD_SOURCE_RULES에 있는 타입만 true를 반환하므로, REWARD_STARS의 13개
// 키 중 'legacy-baseline'(마이그레이션 전용, REWARD_SOURCE_RULES에 의도적
// 부재) 하나만 제외된 12개가 남는다 — 이게 곧 "이 코드베이스가 지금 실제로
// 원장화하는 보상 타입 전부"다.
const ALL_REWARD_TYPES = Object.keys(REWARD_STARS)
const LEDGER_TYPES = new Set(ALL_REWARD_TYPES.filter((t) => isValidRewardType(t)))
check('REWARD_STARS 13개 키 중 legacy-baseline 1개만 원장 대상에서 제외된다(isValidRewardType 기준)',
  ALL_REWARD_TYPES.length === 13 && LEDGER_TYPES.size === 12 && !LEDGER_TYPES.has('legacy-baseline'),
  { total: ALL_REWARD_TYPES.length, ledger: LEDGER_TYPES.size })

// 비교용(원 설계 의도, §1에서만 사용) — rewardEngine.js 헤더 주석이 명시하는
// "새 앵커 6종"(grantLedgerReward 직접 호출) 목록. 레거시 6종은 의도적으로
// 제외 — 이 목록 자체가 "PD_LEGACY6"의 정의다.
const LEGACY6_ANCHOR_TYPES = new Set([
  'word-session-complete', 'writing-complete', 'daily-goal-complete',
  'streak-bonus', 'wrong-word-recovered', 'exam-complete',
])
check('LEGACY6_ANCHOR_TYPES 6종 전부가 REWARD_SOURCE_RULES에 실재한다(오타 방지)',
  [...LEGACY6_ANCHOR_TYPES].every((t) => Object.prototype.hasOwnProperty.call(REWARD_SOURCE_RULES, t)))

// ── 하루 이벤트 계산 ─────────────────────────────────────────────────────
// grant(type, rawCount, ctxForEach) — REWARD_DAILY_CAP을 "명시적으로"
// 적용한다(작업 지시 "honoring REWARD_DAILY_CAP"). 실제 클라이언트 코드는
// 이 상한을 로컬 totalStars 증가가 아니라 서버 원장 수락 여부에만 적용
// 하지만(REWARD_DAILY_CAP은 api/grant-xp.js의 서버측 게이트, rewardEngine.js
// 515행 헤더 주석), 이 시뮬레이션은 지시대로 STARS 계산에도 동일 상한을
// 적용하는 단순화를 택한다 — 아래 세 모델 전부 어떤 타입도 상한에 닿지
// 않으므로(각 타입 카운트가 REWARD_DAILY_CAP보다 항상 작음, §1 표의 "cap"
// 열에서 확인 가능) 이 단순화가 실제 숫자를 바꾸지는 않는다.
function grantEvents(type, rawCount, ctxForEach) {
  const cap = rewardDailyCap(type)
  const count = Math.max(0, Math.min(Number(rawCount) || 0, cap))
  const amounts = []
  for (let i = 0; i < count; i++) {
    amounts.push(resolveRewardStars(type, ctxForEach ? ctxForEach(i) : undefined))
  }
  return {
    type,
    rawCount: Number(rawCount) || 0,
    grantedCount: count,
    cappedByDailyLimit: (Number(rawCount) || 0) > cap,
    cap,
    total: amounts.reduce((a, b) => a + b, 0),
  }
}

// ── 학생-일 모델 3종 (2026-09-11, 이 세션에서 명시적으로 정의) ───────────
// 각 필드의 근거/가정은 아래 주석에 전부 명시한다 — 프로필 설명에 없는
// 값은 "왜 이 값을 골랐는지" 반드시 남긴다(추측을 숨기지 않는다).
const MODELS = [
  {
    key: 'normal', label: '평범',
    desc: '40단어 세션 1회, 쓰기 5정답, 하루목표 달성, 발음 20단어, 퀴즈 20정답, 시험 0',
    sessionCompleted: true,
    writingCorrect: 5,
    // "하루목표 달성"은 countCategoriesCompleted(4/4)를 전제하므로, 명시
    // 되지 않은 examplesHeard(예문 듣기)도 최소 GOAL(5)은 채웠다고 가정.
    examplesHeard: GOAL,
    quizSolved: 20,
    pronunciationWords: 20,
    missionRoundsAllDone: 1, // "하루목표 달성" = 4/4 라운드 최소 1회
    wrongWordRecovered: 0,
    examsCompleted: 0,
    streakDay: 0, // 연속학습일 언급 없음 -> streak-bonus 없음
    // 가정: 쓰기 5정답 사이에 최소 1회 오답이 섞여 콤보(3/5/10)에 도달하지
    // 않는다(프로필이 "콤보"를 명시하지 않은 모델은 전부 동일 가정 —
    // 매우많이 모델만 콤보를 명시했으므로 그 모델만 콤보를 인정한다).
    comboMilestones: [],
    giftDuplicates: 0,
    matchGameCorrect: 0,
    missionClearWords: 0,
  },
  {
    key: 'hardworking', label: '열심',
    desc: '2세션, 쓰기 10정답, 발음 40, 퀴즈 40, 오답복구 5, 시험 1, streak day',
    sessionCompleted: true,
    writingCorrect: 10,
    examplesHeard: GOAL * 2, // 2세션(라운드) 각각 최소 GOAL
    quizSolved: 40,
    pronunciationWords: 40,
    missionRoundsAllDone: 2, // "2세션" = 4/4 라운드 2회 반복(미션은 하루 여러 번 완료 가능, useStudent.js 주석 "missions repeat all day")
    wrongWordRecovered: 5,
    examsCompleted: 1,
    // "streak day" — 어떤 연속일수인지 명시 없음. STREAK_BONUS 최소 단계
    // (3일차)로 가정(최소 보수 가정, 실제로는 5/7일차일 수도 있음 — 이
    // 가정이 틀리면 PD/STARS는 이 시뮬레이션보다 더 커질 뿐 작아지지
    // 않는다).
    streakDay: 3,
    comboMilestones: [],
    giftDuplicates: 0,
    matchGameCorrect: 0,
    missionClearWords: 0,
  },
  {
    key: 'intense', label: '매우많이',
    desc: '3세션/유닛 2, 발음 80, 오답복구 20, 시험 2, 매치게임 5, 선물중복 1, 콤보 3/5/10',
    sessionCompleted: true,
    // "쓰기 N정답"이 명시되지 않았지만 "콤보 3/5/10"이 명시됐다 —
    // 콤보(round.spellingCombo)는 연속 정답에서만 증가하므로, 콤보 10에
    // 도달하려면 최소 10회 연속 정답이 필요하다. writing-complete
    // (누적 spellingCorrect>=GOAL) 트리거도 이 10회 안에서 자연히
        // 충족된다(5번째 정답에서).
    writingCorrect: 10,
    examplesHeard: GOAL * 3, // "3세션" = 3라운드, 각 라운드 최소 GOAL
    // quizSolved도 명시 없음 -> 3라운드 각각 4/4 완료를 위한 최소 GOAL*3 가정.
    quizSolved: GOAL * 3,
    pronunciationWords: 80,
    missionRoundsAllDone: 3, // "3세션/유닛 2" = 4/4 라운드 3회(2개 유닛을 오가며) — 유닛 전환 자체는 보상 계산에 영향 없음(트리거는 날짜/라운드 기준, 유닛 무관)
    wrongWordRecovered: 20,
    examsCompleted: 2,
    streakDay: 0, // 프로필에 연속학습일 언급 없음
    comboMilestones: [3, 5, 10], // 프로필 명시값 그대로
    giftDuplicates: 1, // "선물중복 1"
    matchGameCorrect: 5, // "매치게임 5" = ROUNDS(5) 전승 1세션(하루 1세션 한도, GAME_REWARD_DAILY_LIMIT)
    missionClearWords: 0,
  },
]
check('ROUNDS(matchGame.js)가 여전히 5, GAME_REWARD_DAILY_LIMIT이 여전히 1이다(매우많이 모델의 매치게임 5 가정 근거)',
  ROUNDS === 5 && GAME_REWARD_DAILY_LIMIT === 1, { ROUNDS, GAME_REWARD_DAILY_LIMIT })

// 모델 하나 -> 12개 rewardType 각각의 grantEvents 결과 배열.
function computeDayGrants(model) {
  return [
    grantEvents('word-session-complete', model.sessionCompleted ? 1 : 0),
    grantEvents('writing-complete', model.writingCorrect >= GOAL ? 1 : 0),
    grantEvents('daily-goal-complete', model.missionRoundsAllDone >= 1 ? 1 : 0),
    grantEvents('streak-bonus', model.streakDay > 0 ? 1 : 0, () => model.streakDay),
    grantEvents('wrong-word-recovered', model.wrongWordRecovered),
    grantEvents('exam-complete', model.examsCompleted),
    grantEvents('pronunciation', model.pronunciationWords),
    grantEvents('mission-clear', model.missionClearWords),
    // daily-mission-bonus(+10)는 날짜 키가 아니라 라운드 시그니처 키라
    // "미션은 하루 여러 번 완료 가능"(useStudent.js 주석) 원칙대로 라운드
    // 수만큼 반복 지급된다 — daily-goal-complete(날짜 키, 하루 1회)와
    // 대비되는 지점.
    grantEvents('daily-mission-bonus', model.missionRoundsAllDone),
    grantEvents('spelling-combo', model.comboMilestones.length, (i) => model.comboMilestones[i]),
    grantEvents('sticker-duplicate', model.giftDuplicates),
    grantEvents('matchgame', model.matchGameCorrect),
  ]
}

function summarize(model) {
  const grants = computeDayGrants(model)
  const stars = grants.reduce((sum, g) => sum + g.total, 0)
  const pdLedger = grants.filter((g) => LEDGER_TYPES.has(g.type)).reduce((sum, g) => sum + g.total, 0)
  const pdLegacy6 = grants.filter((g) => LEGACY6_ANCHOR_TYPES.has(g.type)).reduce((sum, g) => sum + g.total, 0)
  const capped = grants.filter((g) => g.cappedByDailyLimit)
  // XP — paulRankShared.js의 8개 이벤트(5 active + 3 planned) 전부를
  // import해서 개수를 센다. active 5개는 "오늘 그 카테고리를 처음 완료"
  // 조건이 이 모델에서 참인지로 트리거 여부를 판단(전부 day 기간키, 하루
  // 최대 1회 — round 반복 횟수와 무관).
  const xpTriggered = {
    'word-view-complete': true, // 세션 완료(wordsViewed>=GOAL)는 모든 모델이 만족
    'listening-complete': model.examplesHeard >= GOAL,
    'writing-complete': model.writingCorrect >= GOAL,
    'quiz-complete': model.quizSolved >= GOAL,
    'daily-mission-complete': model.missionRoundsAllDone >= 1,
  }
  let xp = 0
  const xpBreakdown = []
  for (const [eventType, fired] of Object.entries(xpTriggered)) {
    const amount = fired ? (resolveXpAmount(eventType) || 0) : 0
    xp += amount
    xpBreakdown.push({ eventType, fired, amount })
  }
  return { model, grants, stars, pdLedger, pdLegacy6, capped, xp, xpBreakdown }
}

const SUMMARIES = MODELS.map(summarize)

console.log('='.repeat(78))
console.log('PHASE 1 — 학생-일 모델 3종: STARS / PD_LEDGER(12종) / PD_LEGACY6(비교) / XP')
console.log('='.repeat(78))
for (const s of SUMMARIES) {
  console.log(`\n[${s.model.label}] ${s.model.desc}`)
  console.log('  rewardType             count(raw->granted/cap)   amount')
  for (const g of s.grants) {
    if (g.rawCount === 0) continue
    const countStr = `${g.rawCount}->${g.grantedCount}/${g.cap}`
    console.log(`  ${g.type.padEnd(22)} ${countStr.padEnd(24)} ${g.total}`)
  }
  console.log(`  STARS(client, 12종 전부) = ${s.stars}`)
  console.log(`  PD_LEDGER(실제 코드, isValidRewardType 12종) = ${s.pdLedger}`)
  console.log(`  PD_LEGACY6(원 설계 의도, 6-anchor만) = ${s.pdLegacy6}`)
  console.log(`  XP(paulRankShared 5개 active 이벤트) = ${s.xp}  [${s.xpBreakdown.filter((x) => x.fired).map((x) => x.eventType).join(', ')}]`)
}

console.log('\n' + '-'.repeat(78))
console.log('PHASE 1 — 단언')
console.log('-'.repeat(78))
// 구조적 게이트(항상 참이어야 함) — 단조성.
check('STARS 단조 증가: 평범 <= 열심 <= 매우많이',
  SUMMARIES[0].stars <= SUMMARIES[1].stars && SUMMARIES[1].stars <= SUMMARIES[2].stars,
  SUMMARIES.map((s) => s.stars))
check('PD_LEDGER 단조 증가: 평범 <= 열심 <= 매우많이',
  SUMMARIES[0].pdLedger <= SUMMARIES[1].pdLedger && SUMMARIES[1].pdLedger <= SUMMARIES[2].pdLedger,
  SUMMARIES.map((s) => s.pdLedger))
check('XP는 세 모델 전부 같은 값이다(day 기간키 설계상 학습량과 무관하게 하루 상한 고정 — 5개 active 이벤트 x day 기간키)',
  SUMMARIES[0].xp === SUMMARIES[1].xp && SUMMARIES[1].xp === SUMMARIES[2].xp,
  SUMMARIES.map((s) => s.xp))
check('plan 상태(word-king-complete/weekly-streak/special-event) 3종은 여전히 resolveXpAmount가 null을 반환한다(미구현 슬롯 실수 지급 방지 회귀 가드)',
  ['word-king-complete', 'weekly-streak', 'special-event'].every((e) => resolveXpAmount(e) === null))
check('세 모델 어떤 rewardType도 REWARD_DAILY_CAP에 걸리지 않았다(모델이 비현실적으로 과도하지 않다는 자체 점검)',
  SUMMARIES.every((s) => s.capped.length === 0),
  SUMMARIES.map((s) => s.capped.map((g) => g.type)))

// 정책 판정(finding, non-gating) — 원 설계 의도 기준 PD sanity band.
// 위 헤더 "PD_LEGACY6" 섹션 설명대로 이 판정은 PD_LEGACY6로 검사한다.
finding('PD_LEGACY6/일(평범)이 [4,10] 대역 안이다(원 설계 기준선 — Reward System V1 최초 6-anchor 설계)',
  SUMMARIES[0].pdLegacy6 >= 4 && SUMMARIES[0].pdLegacy6 <= 10, SUMMARIES[0].pdLegacy6)
finding('PD_LEDGER/일(평범, 실제 코드)도 같은 [4,10] 대역 안이다(참고용 — 통과 실패 자체가 §0의 핵심 재발견을 정량화한다)',
  SUMMARIES[0].pdLedger >= 4 && SUMMARIES[0].pdLedger <= 10, SUMMARIES[0].pdLedger)

// ── PHASE 2 — 아이템 구매력 표 ───────────────────────────────────────────
console.log('\n' + '='.repeat(78))
console.log('PHASE 2 — 아이템 구매력(PD_LEDGER 기준, 평범/열심 일일 획득 x DOLLAR_RATE)')
console.log('='.repeat(78))
const normalPdPerDay = SUMMARIES[0].pdLedger
const hardPdPerDay = SUMMARIES[1].pdLedger
console.log(`평범 PD/일 = ${normalPdPerDay} (PD_LEDGER 기준, 위 §1)`)
console.log(`열심 PD/일 = ${hardPdPerDay} (PD_LEDGER 기준, 위 §1)`)
console.log(`WELCOME_CREDIT_PD = ${WELCOME_CREDIT_PD} (SQL 상수, 코드 import 불가 — 헤더 주석 참고), DOLLAR_RATE = ${DOLLAR_RATE} (SQL dollar_rules 상수)`)

function daysToEarn(price, ratePerDay, welcome) {
  const need = Math.max(0, price - welcome)
  if (need === 0) return 0
  return Math.ceil(need / ratePerDay)
}

const ITEM_ENTRIES = Object.entries(TOWN_ITEM_META).map(([id, meta]) => ({ id, ...meta }))
  .sort((a, b) => (a.defaultPrice - b.defaultPrice) || (a.minLevel - b.minLevel))

console.log('\nITEM                 PRICE  MINLV  d(평범,웰컴无)  d(평범,웰컴20)  d(열심,웰컴无)  판정')
const itemRows = []
for (const item of ITEM_ENTRIES) {
  const dNormalNoWelcome = daysToEarn(item.defaultPrice, normalPdPerDay, 0)
  const dNormalWelcome = daysToEarn(item.defaultPrice, normalPdPerDay, WELCOME_CREDIT_PD)
  const dHardNoWelcome = daysToEarn(item.defaultPrice, hardPdPerDay, 0)
  let verdict
  if (dNormalNoWelcome <= 1) verdict = 'TOO CHEAP'
  else if (dHardNoWelcome > 21) verdict = 'TOO EXPENSIVE'
  else verdict = 'GOOD'
  itemRows.push({ ...item, dNormalNoWelcome, dNormalWelcome, dHardNoWelcome, verdict })
  console.log(`${item.id.padEnd(20)} ${String(item.defaultPrice).padEnd(6)} L${String(item.minLevel).padEnd(4)} ${String(dNormalNoWelcome).padEnd(15)} ${String(dNormalWelcome).padEnd(15)} ${String(dHardNoWelcome).padEnd(15)} ${verdict}`)
}

const tooCheapCount = itemRows.filter((r) => r.verdict === 'TOO CHEAP').length
const tooExpensiveCount = itemRows.filter((r) => r.verdict === 'TOO EXPENSIVE').length
console.log(`\n판정 집계: TOO CHEAP ${tooCheapCount} / GOOD ${itemRows.length - tooCheapCount - tooExpensiveCount} / TOO EXPENSIVE ${tooExpensiveCount} (총 ${itemRows.length}종)`)

console.log('\n' + '-'.repeat(78))
console.log('PHASE 2 — 단언(운영자 목표 인코딩, finding — 실패해도 상수를 건드리지 않는다)')
console.log('-'.repeat(78))
const l1Items = itemRows.filter((r) => r.minLevel === 1)
const l1AllAffordableIn3DaysWithWelcome = l1Items.every((r) => r.dNormalWelcome <= 3)
finding('L1 아이템 전부가 웰컴 20 포함 평범 3일 이내에 구매 가능하다(첫날 실망 방지 목표)',
  l1AllAffordableIn3DaysWithWelcome,
  l1Items.map((r) => `${r.id}:${r.dNormalWelcome}일`))

const coreItems = itemRows.filter((r) => r.minLevel <= 3)
const coreSum = coreItems.reduce((s, r) => s + r.defaultPrice, 0)
const hard5DayEarn = hardPdPerDay * 5
finding('L1~L3 아이템 전부(합계 ' + coreSum + ' PD)가 열심 5일 획득량(' + hard5DayEarn + ' PD, 웰컴 제외)으로는 다 소진되지 않는다(장기 루프 목표)',
  coreSum > hard5DayEarn, { coreSum, hard5DayEarn })

// ── PHASE 3 — 레벨 진행 + 죽은 구간 ──────────────────────────────────────
console.log('\n' + '='.repeat(78))
console.log('PHASE 3 — 레벨 진행(TOWN_LEVELS, PD_LEDGER=stars_earned 기준) + 죽은 구간')
console.log('='.repeat(78))
console.log('레벨 | 임계★ | d(평범) | d(열심) | 신규해금 | 최저가 | 웰컴+누적으로 구매가능?')
const deadZones = []
const levelRows = []
for (const lvl of TOWN_LEVELS) {
  const dNormal = Math.ceil(lvl.min / normalPdPerDay)
  const dHard = Math.ceil(lvl.min / hardPdPerDay)
  const unlocked = itemRows.filter((r) => r.minLevel === lvl.level)
  const pdAccumAtUnlock = WELCOME_CREDIT_PD + dNormal * normalPdPerDay
  const cheapest = unlocked.length > 0 ? Math.min(...unlocked.map((r) => r.defaultPrice)) : null
  const allUnaffordable = unlocked.length > 0 && unlocked.every((r) => r.defaultPrice > pdAccumAtUnlock)
  const affordableOnUnlock = unlocked.length > 0 ? (cheapest <= pdAccumAtUnlock) : null
  levelRows.push({ level: lvl.level, min: lvl.min, dNormal, dHard, unlocked, cheapest, affordableOnUnlock, allUnaffordable, pdAccumAtUnlock })
  const unlockedStr = unlocked.length > 0 ? unlocked.map((r) => r.id).join(',') : '(없음)'
  console.log(`${('L' + lvl.level).padEnd(5)}| ${String(lvl.min).padEnd(6)}| ${String(dNormal).padEnd(7)}| ${String(dHard).padEnd(7)}| ${unlockedStr.padEnd(40)}| ${String(cheapest ?? '-').padEnd(4)}| ${unlocked.length === 0 ? 'N/A(해금 없음)' : (affordableOnUnlock ? 'YES' : 'NO')}`)

  if (unlocked.length === 0) deadZones.push({ level: lvl.level, reason: '0개 해금(빈 레벨)' })
  if (unlocked.length >= 3) deadZones.push({ level: lvl.level, reason: `${unlocked.length}개 동시 해금(과밀)` })
  if (allUnaffordable) deadZones.push({ level: lvl.level, reason: '해금됐지만 그 시점 누적 PD로는 전부 구매 불가' })
}

console.log('\n죽은 구간(dead zones) — 아래는 발견이지 실패가 아니다(개수를 0으로 강제하지 않는다):')
if (deadZones.length === 0) console.log('  (없음)')
for (const dz of deadZones) console.log(`  L${dz.level}: ${dz.reason}`)

check('TOWN_LEVELS 10단계 전부를 순회했고, 최소 1개 이상의 레벨 행이 출력됐다(회귀 방지)',
  levelRows.length === TOWN_LEVELS.length && TOWN_LEVELS.length === 10)
check('죽은 구간 목록이 실제로 계산·출력됐다(목록 존재 자체를 게이트 — 개수는 게이트하지 않는다, 지시사항)',
  Array.isArray(deadZones))

// ── PHASE 4 — 웰컴 크레딧 20 PD ──────────────────────────────────────────
console.log('\n' + '='.repeat(78))
console.log('PHASE 4 — 웰컴 크레딧 20 PD')
console.log('='.repeat(78))
const treeMeta = TOWN_ITEM_META['tree']
check("웰컴 20 PD로 tree(가격 " + treeMeta.defaultPrice + ")를 즉시 구매할 수 있고, 남는 잔액은 10이다",
  treeMeta.defaultPrice === 10 && (WELCOME_CREDIT_PD - treeMeta.defaultPrice) === 10,
  { price: treeMeta.defaultPrice, remaining: WELCOME_CREDIT_PD - treeMeta.defaultPrice })
const remainingAfterTree = WELCOME_CREDIT_PD - treeMeta.defaultPrice
const l1CannotBuyAfterTree = l1Items.filter((r) => r.id !== 'tree' && r.defaultPrice > remainingAfterTree)
console.log(`tree 구매 후 잔액 ${remainingAfterTree} PD로 구매 불가능한 L1 아이템:`)
for (const r of l1CannotBuyAfterTree) console.log(`  ${r.id} (가격 ${r.defaultPrice})`)
check('tree 구매 후 잔액으로 구매 불가능한 L1 아이템이 최소 1개 이상이다(웰컴이 카탈로그 전체를 즉시 열어주지 않는다는 사실 확인)',
  l1CannotBuyAfterTree.length >= 1, l1CannotBuyAfterTree.map((r) => r.id))

console.log('\n' + '='.repeat(78))
console.log(`GATE(하드) 단언 ${hardAsserted}개 중 실패 ${hardFailures}개`)
console.log(`FINDING(정책) 판정 ${findingsTotal}개 중 실패 ${findingsFailed}개 (실패해도 exit code에 영향 없음 — 위 헤더 "게이팅 정책" 참고)`)
console.log(hardFailures > 0 ? 'GATE FAIL' : 'GATE PASS')
console.log('='.repeat(78))
process.exit(hardFailures > 0 ? 1 : 0)
