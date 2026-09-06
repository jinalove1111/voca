// src/utils/rewardEngine.js — Reward System V1: 별 지급 "규칙"의 단일
// 진실 원천. 2026-08-15.
//
// ticketEconomy.js/paulRankShared.js와 같은 순수성 원칙 — React 없음,
// `import.meta.env` 없음, `window`/`document` 없음, 네트워크 호출 없음,
// import 0개(완전 순수, plain Node에서 바로 import 가능). 시각은 절대
// Date.now()/new Date()로 내부에서 만들지 않고 항상 인자(`at`)로 받는다
// (scripts/testRewardEngine.mjs가 이 결정론을 소스 정적 검사로 고정).
//
// ── 이 모듈이 하는 일 / 하지 않는 일 ────────────────────────────────────
// 이 모듈은 "언제 몇 별을 줄지"만 순수 계산으로 정의한다(REWARD_STARS,
// STREAK_BONUS, LEVELS, buildRewardEntry). 실제로 학생의 totalStars를
// 증가시키는 단일 경로는 이미 존재하는 `useStudent.js`의 `grantReward()`
// 이다 — 이 모듈은 그 경로를 재구현하지 않고 그대로 재사용한다(CLAUDE.md
// 규칙 3, "완료로 선언된 작업 재구현 금지" — grantReward의 dedupKey 기반
// 중복 지급 방지는 이미 mission-clear/duplicate-sticker-bonus 파밍 사고를
// 겪고 확립된 경로, useStudent.js 945행 및 주변 주석 참고).
//
// xp_delta는 V1에서 항상 0이다 — XP는 기존 `xp_ledger`/`paulRankShared.js`
// 경로(Paul Rank System)가 별개로 담당하며, 이 모듈은 그 값을 전혀 읽거나
// 파생시키지 않는다("별을 조용히 XP로 변환하지 말라"는 기존 원칙,
// paulRankShared.js 헤더 참고 — Reward System V1도 같은 원칙을 유지).
//
// ── 서버 원장(reward_ledger, supabase_v3_36) 형태와의 관계 ──────────────
// buildRewardEntry()가 만드는 객체는 supabase_v3_36_reward_ledger.sql의
// reward_ledger 컬럼명(snake_case: reward_type/source_type/source_id/
// stars_delta/xp_delta/idempotency_key/created_at)과 1:1로 대응한다 —
// 이 SQL이 아직 미실행이어도(운영자 수동 실행 대기, CLAUDE.md 규칙 8)
// 클라이언트는 이 모듈이 만드는 원장 항목을 로컬 배열(progress_data 내
// ticketLedger와 동일한 위치 판단)에 append-only로 쌓아 그대로 쓸 수
// 있다 — 테이블이 나중에 생겨도 형태 변경이 필요 없다.

// ── 1) 보상 금액 표(REWARD_STARS) — 운영자 지정값 그대로. 'streak-bonus'
// 는 금액이 streakDays에 따라 달라지므로 여기 0으로 고정하고 실제 금액은
// streakBonusStars()가 결정한다. 'legacy-baseline'도 0 — 이 값은 실제
// 학습 이벤트가 아니라 supabase_v3_37 마이그레이션 전용이라, 클라이언트
// 코드가 이 rewardType으로 직접 지급을 시도하면 안 된다(그런 시도가 있어도
// 0별이 되도록 방어적으로 0을 둔다 — 실제 마이그레이션 금액은 SQL이
// student_progress.total_stars에서 직접 계산해 원장에 심는다).
export const REWARD_STARS = {
  'word-session-complete': 1,
  'writing-complete': 2,
  'exam-complete': 2,
  'wrong-word-recovered': 1,
  'daily-goal-complete': 3,
  'streak-bonus': 0,
  'legacy-baseline': 0,
  // ── 레거시 클라이언트 별 지급 경로 6종(2026-09-06, 서버 원장 흡수) ──────
  // useStudent.js/MatchGameShell.jsx가 이미 로컬로 지급해 온 금액 그대로
  // (한 글자도 바꾸지 않음) — 아래 값들의 유일한 출처는 이 파일들의 기존
  // 상수/리터럴이다: 'pronunciation'(markPronunciationOk, +1),
  // 'mission-clear'(answerMission, +3), 'daily-mission-bonus'
  // (MISSION_BONUS_STARS, +10), 'sticker-duplicate'(DUPLICATE_BONUS_STARS,
  // +20), 'matchgame'(STAR_PER_CORRECT, +4). 'spelling-combo'는 streak-bonus
  // 와 같은 이유로 0 고정 — 실제 금액은 combo(3/5/10)에 따라
  // resolveRewardStars가 LEGACY_SPELLING_COMBO_BONUS에서 조회한다.
  'pronunciation': 1,
  'mission-clear': 3,
  'daily-mission-bonus': 10,
  'spelling-combo': 0,
  'sticker-duplicate': 20,
  'matchgame': 4,
}

// 레거시 6종의 이름만 모은 목록 — 호출부가 "이 rewardType이 레거시 흡수
// 대상인가"를 REWARD_STARS/REWARD_SOURCE_RULES 키를 일일이 나열하지 않고
// 확인할 수 있게 한다(예: 리포트/로그에서 신규 앵커와 레거시 앵커를 구분).
export const LEGACY_REWARD_TYPES = [
  'pronunciation', 'mission-clear', 'daily-mission-bonus',
  'spelling-combo', 'sticker-duplicate', 'matchgame',
]

// useStudent.js 168행의 SPELLING_COMBO_BONUS 리터럴과 반드시 같은 값을
// 유지해야 한다(scripts/testRewardEngine.mjs가 useStudent.js 소스를 읽어
// 이 리터럴 존재를 정적으로 확인한다) — 클라이언트가 로컬로 이미 지급한
// 금액과 서버 원장 금액이 어긋나면 안 되기 때문.
export const LEGACY_SPELLING_COMBO_BONUS = { 3: 1, 5: 2, 10: 3 }

// ── 2) 연속 학습일 보너스 — V1은 이 3단계뿐. 새 단계를 추가하려면 이
// 상수만 바꾸면 되지만, 그 자체가 이번 범위 밖 결정(운영자 지시)이므로
// 임의로 늘리지 않는다.
export const STREAK_BONUS = { 3: 2, 5: 3, 7: 5 }

// ── 3) 레벨 경계 — min은 "이 레벨이 시작되는 누적 별". paulRankShared.js
// 의 RANKS와 같은 정신(하나의 배열이 계산/표시 전체의 단일 진실 원천).
export const LEVELS = [
  { level: 1, min: 0 },
  { level: 2, min: 20 },
  { level: 3, min: 50 },
  { level: 4, min: 100 },
  { level: 5, min: 200 },
]

// ── 4) idempotency key — 서버 reward_ledger의 전역 UNIQUE(idempotency_key)
// 와 정확히 같은 문자열이 되도록 studentId를 포함한다(두 학생이 우연히
// 같은 reward_type/source_type/source_id 조합을 가져도 서로의 지급을
// 막지 않기 위함 — supabase_v3_36 헤더 주석과 동일 판단).
export function rewardIdempotencyKey(studentId, rewardType, sourceType, sourceId) {
  return `${studentId}:${rewardType}:${sourceType}:${sourceId}`
}

// streakDays가 STREAK_BONUS의 키(3/5/7)가 아니면 0(V1은 추가 단계 없음
// 고정). 숫자가 아니거나 음수여도 크래시 없이 0.
export function streakBonusStars(streakDays) {
  const days = Number(streakDays)
  if (!Number.isFinite(days)) return 0
  return STREAK_BONUS[days] || 0
}

// 누적 별(totalStars) -> { level, min, nextMin }. 음수/비숫자는 0으로
// 취급. Level 5(최고 레벨)는 nextMin: null(더 이상 다음 단계 없음).
export function levelForStars(totalStars) {
  const stars = Math.max(0, Number(totalStars) || 0)
  let index = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (stars >= LEVELS[i].min) index = i
    else break
  }
  const current = LEVELS[index]
  const next = LEVELS[index + 1] || null
  return { level: current.level, min: current.min, nextMin: next ? next.min : null }
}

// 다음 레벨까지 남은 별 수. Level 5면 null(더 오를 레벨이 없음).
export function starsToNextLevel(totalStars) {
  const stars = Math.max(0, Number(totalStars) || 0)
  const state = levelForStars(stars)
  if (state.nextMin === null) return null
  return state.nextMin - stars
}

// ── 5) 원장 항목 생성(pure) — supabase_v3_36의 reward_ledger 컬럼과 1:1
// 대응하는 형태. starsDelta 미지정 시 REWARD_STARS[rewardType]에서 가져
// 온다(streak-bonus처럼 REWARD_STARS가 0으로 고정된 rewardType은 호출부가
// streakBonusStars()로 계산한 값을 반드시 명시 전달해야 한다 — 그렇지
// 않으면 0별로 기록된다, 의도된 방어적 동작).
export function buildRewardEntry({ studentId, rewardType, sourceType, sourceId, starsDelta, xpDelta = 0, at }) {
  const key = rewardIdempotencyKey(studentId, rewardType, sourceType, sourceId)
  const delta = (starsDelta === undefined || starsDelta === null)
    ? (Object.prototype.hasOwnProperty.call(REWARD_STARS, rewardType) ? REWARD_STARS[rewardType] : 0)
    : starsDelta
  return {
    id: key,
    reward_type: rewardType,
    source_type: sourceType,
    source_id: sourceId,
    stars_delta: delta,
    xp_delta: xpDelta,
    idempotency_key: key,
    created_at: at,
  }
}

// ── 6) 원장 조작(append-only, idempotency_key 기준 idempotent) —
// ticketEconomy.appendTicketEntry와 동일 의미론(id 기준 대신
// idempotency_key 기준). ledger는 배열|null|undefined 어느 쪽이든 안전.
export function hasRewardEntry(ledger, idempotencyKey) {
  if (!Array.isArray(ledger)) return false
  return ledger.some((e) => e && e.idempotency_key === idempotencyKey)
}

// 이미 같은 idempotency_key가 있으면 "기존 배열 그대로"(참조 동일) 반환
// (중복 지급 방지), 없으면 새 배열을 반환한다.
export function appendRewardEntry(ledger, entry) {
  const list = Array.isArray(ledger) ? ledger : []
  if (!entry || typeof entry.idempotency_key !== 'string' || entry.idempotency_key.length === 0) return list
  if (hasRewardEntry(list, entry.idempotency_key)) return list
  return [...list, entry]
}

// stars_delta 합(pure, 저장된 합계 컬럼이 아니라 항상 원장에서 파생) —
// 음수/비숫자 항목은 합산에서 무시한다(방어적 — 정상 경로에서는 stars_delta
// 가 항상 0 이상이어야 하지만, 손상된/외부 데이터를 만나도 잘못된 음수
// 합계로 별이 줄어드는 사고를 만들지 않기 위함).
export function earnedStars(ledger) {
  if (!Array.isArray(ledger)) return 0
  return ledger.reduce((sum, e) => {
    const v = Number(e?.stars_delta)
    return (Number.isFinite(v) && v >= 0) ? sum + v : sum
  }, 0)
}

// ── 7) 서버 쓰기 경로(api/grant-xp.js, ledger:'reward' 분기) 검증 헬퍼 ──
// 2026-08-18. 클라이언트 로컬 원장(위 5/6번)과는 신뢰 경계가 다르다 — 여기
// 아래 세 함수는 "서버가 클라이언트 요청을 얼마나 믿어도 되는지"를
// 결정하는 게이트라, api/grant-xp.js가 이 파일에서 직접 import해서 쓴다
// (paulRankShared.js의 isValidEventType/isValidSourceEventIdForEvent와
// 동일한 신뢰 모델 — 서버가 최종 권위, 클라이언트는 "무슨 일이 있었는지"
// 만 알린다).
//
// REWARD_SOURCE_RULES — rewardType별로 클라이언트가 함께 보낼 수 있는
// sourceType과 sourceId의 형식(pattern)을 화이트리스트로 고정한다.
// 'legacy-baseline'은 의도적으로 여기 없다 — REWARD_STARS에는 존재하지만
// (0으로 고정, 위 1번 섹션 주석) 마이그레이션 SQL(v3_37) 전용이라 클라이언트
// 요청 경로로는 절대 도달하면 안 된다. isValidRewardType이 "키가 여기
// 있는가"로 이를 걸러낸다.
export const REWARD_SOURCE_RULES = {
  'word-session-complete': { sourceType: 'daily-words', pattern: 'date' },
  'writing-complete': { sourceType: 'daily-writing', pattern: 'date' },
  'exam-complete': { sourceType: 'entrance-test', pattern: 'uuid' },
  'wrong-word-recovered': { sourceType: 'spelling-review', pattern: 'date:token' },
  'daily-goal-complete': { sourceType: 'daily-goal', pattern: 'date' },
  'streak-bonus': { sourceType: 'streak', pattern: 'date:streak' },
  // ── 레거시 6종(2026-09-06) — 클라이언트가 이미 만들던 dedupKey를
  // parseLegacyDedupKey가 그대로 쪼갠 형태. sourceType은 서버가 새로
  // 붙이는 이름이라 클라이언트의 기존 dedupKey 프리픽스와 문자열이 다를
  // 수 있다(예: 'daily-mission-bonus' rewardType의 sourceType은
  // 'daily-round') — 이 저장소 관례(rewardType != sourceType, 위 기존
  // 5종도 마찬가지)를 그대로 따른다.
  'pronunciation': { sourceType: 'pronunciation', pattern: 'token:date' },
  'mission-clear': { sourceType: 'mission', pattern: 'token' },
  'daily-mission-bonus': { sourceType: 'daily-round', pattern: 'date:tokens' },
  'spelling-combo': { sourceType: 'spelling-combo', pattern: 'token:combo:date' },
  'sticker-duplicate': { sourceType: 'gift', pattern: 'token:gift' },
  'matchgame': { sourceType: 'matchgame', pattern: 'session:round:word' },
}

// useStudent.js의 todayStr()가 실제로 만드는 형식(`new Date().toDateString()`)
// 은 ISO(YYYY-MM-DD)가 아니라 "Www Mmm dd yyyy"(예: "Sat Aug 15 2026") —
// 요일/월 약어 3글자, 일(day)은 2자리로 항상 0-padding됨(node로 실측:
// new Date(2026,0,1).toDateString() === 'Thu Jan 01 2026'). 서버 검증은
// 클라이언트가 실제로 보내는 값과 반드시 같은 형식이어야 하므로, ISO가
// 아니라 이 형식에 맞는 정규식을 쓴다.
const DATE_TOKEN_RE = /^[A-Za-z]{3} [A-Za-z]{3} \d{2} \d{4}$/
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WORD_TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/

// ── WORD_SLUG_TOKEN_RE(2026-09-06 커버리지 수정) ────────────────────────
// production READ-ONLY 실측: 'mission-clear'/'spelling-combo'의 wordId,
// 그리고 V1 'wrong-word-recovered'의 token은 실제로 uuid가 아니라
// wordLibrary.js:3588의 wordSlug(word) = `word.toLowerCase().replace(/\s+/g,
// '_')`다 — WORD_TOKEN_RE(/^[A-Za-z0-9_-]{1,64}$/)는 uuid만 염두에 둔
// 규칙이라 이 슬러그를 상당수 거부한다: 1,975개 production 단어 중 27개
// (1.4%)가 WORD_TOKEN_RE에 걸리는 문자를 포함한다 — 아포스트로피('/’),
// 괄호, 물결(~), 마침표/쉼표, 가운뎃점(·), 원문자(ⓥ), 한글 등(예:
// `do_one's_best`, `practice_(noun)`, `just_as_~_as`). 콜론(':')을 포함한
// 슬러그는 0건, 64자를 넘는 슬러그도 0건이었다 — 즉 실제 위험(구분자 충돌/
// 길이 폭주)은 없고 문자 클래스가 지나치게 좁았을 뿐이다. 그래서 이 세
// 위치(아래 'date:token'의 token 부분, 'token' 패턴 전체, 'token:combo:date'
// 의 token 부분)만 공백과 ':'만 금지하는 더 넓은 규칙으로 바꾼다 — 서버가
// 여전히 idempotency_key를 직접 조립하고 일일 상한(60/day 등)도 그대로라
// 순수한 커버리지 확장(화이트리스트를 넓히는 것)이지 새로운 신뢰 확장이
// 아니다. 'pronunciation'(word.dbId uuid)과 sticker id는 이미 uuid/영숫자
// 전용이라 WORD_TOKEN_RE를 그대로 유지한다(넓힐 이유가 없다 — 실제 값이
// 항상 uuid).
const WORD_SLUG_TOKEN_RE = /^[^\s:]{1,64}$/u

// ── 레거시 6종 전용 정규식(2026-09-06, 리뷰 지적으로 폭 수정) ──────────────
// 콤마로 이어붙인 단어 목록 — daily-mission-bonus의 sourceId
// (`${DATE}:${tokens}`)와 sticker-duplicate의 'round:' GIFT 변형
// (`round:${DATE}:${tokens}`) 둘 다 이 규칙을 쓴다. 처음엔 "uuid를 콤마로
// 이은 것"으로 짐작해 영숫자/_/-만 허용했지만(구 버전), 실측 결과 이
// tokens는 uuid가 아니라 useStudent.js의 round.wordsViewed(=wordSlug(word)
// 값들, wordLibrary.js:3588)를 정렬 후 콤마로 이은 것이다 — 즉 위
// WORD_SLUG_TOKEN_RE와 정확히 같은 문자 도메인(아포스트로피/괄호/물결/
// 한글 등 포함)이 콤마로 이어진 형태다. 그래서 같은 철학(공백/':'만 금지)
// 으로 폭을 넓힌다 — 콤마는 이 문자 클래스에서 별도로 금지하지 않으므로
// (구분자가 아니라 페이로드 자체의 일부, 콤마 자체를 포함한 슬러그는
// production에 없음) 그대로 통과한다. 날짜 부분(datePart)은 여전히
// DATE_TOKEN_RE로 엄격하게 검증 — 이 규칙은 tokens 부분에만 적용.
const TOKENS_LIST_RE = /^[^\s:]{1,600}$/u
// 콤보 마일스톤은 3/5/10 셋뿐(LEGACY_SPELLING_COMBO_BONUS와 동일 도메인).
const SPELLING_COMBO_VALUES_RE = /^(3|5|10)$/
// matchgame 세션 id — MatchGameShell.jsx startGame()의
// `${Date.now()}_${Math.random().toString(36).slice(2, 8)}` 형식(13자리 ms
// + '_' + base36 소문자/숫자 1~12자).
const MATCHGAME_SESSION_RE = /^\d{13}_[0-9a-z]{1,12}$/
// 라운드는 0~9 사이 정수(1~2자리 숫자 형식만 우선 확인, 상한은 아래
// isValidRewardSource에서 숫자값으로 재확인 — "round > 99 거부" 지시 반영).
const MATCHGAME_ROUND_RE = /^\d{1,2}$/
// 단어 토큰은 word.dbId(uuid, WORD_TOKEN_RE로 충분)이거나 단어 텍스트
// 폴백(공백/아포스트로피 포함 가능) — 유니코드 지원, ':' 금지(구분자와
// 충돌 방지).
const MATCHGAME_WORD_TOKEN_RE = /^[\p{L}\p{N}_' -]{1,64}$/u

function isValidDateToken(value) {
  return typeof value === 'string' && DATE_TOKEN_RE.test(value)
}

// sticker-duplicate의 GIFT 토큰 — round(라운드 완료 선물상자)/
// milestone(별 뱃지)/badge(그 외 고정 뱃지) 셋 중 하나. round만 내부에
// 날짜:토큰목록을 더 갖는 복합 형식이라 별도 파싱이 필요하다.
function isValidLegacyGiftToken(value) {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value.startsWith('round:')) {
    const rest = value.slice('round:'.length)
    const idx = rest.indexOf(':')
    if (idx <= 0) return false
    const datePart = rest.slice(0, idx)
    const tokensPart = rest.slice(idx + 1)
    return isValidDateToken(datePart) && TOKENS_LIST_RE.test(tokensPart)
  }
  if (value.startsWith('milestone:')) {
    return /^\d{1,4}$/.test(value.slice('milestone:'.length))
  }
  if (value.startsWith('badge:')) {
    return /^\d{1,6}$/.test(value.slice('badge:'.length))
  }
  return false
}

// rewardType이 REWARD_SOURCE_RULES의 키이고(=클라이언트가 지급 요청 가능한
// 앵커) REWARD_STARS에도 금액이 정의돼 있어야 한다. 'legacy-baseline'은
// REWARD_STARS에는 있지만 REWARD_SOURCE_RULES에는 없으므로 여기서 항상
// false — 클라이언트가 이 rewardType으로 서버에 지급을 요청할 방법이
// 없다(주석 위 참고).
export function isValidRewardType(rewardType) {
  if (typeof rewardType !== 'string') return false
  return Object.prototype.hasOwnProperty.call(REWARD_SOURCE_RULES, rewardType)
    && Object.prototype.hasOwnProperty.call(REWARD_STARS, rewardType)
}

// sourceType이 그 rewardType의 규칙과 정확히 일치하고, sourceId가 규칙의
// pattern에 맞는 형식인지 확인한다. rewardType 자체가 무효면(isValidRewardType
// false) 여기서도 항상 false.
export function isValidRewardSource(rewardType, sourceType, sourceId) {
  if (!isValidRewardType(rewardType)) return false
  const rule = REWARD_SOURCE_RULES[rewardType]
  if (typeof sourceType !== 'string' || sourceType !== rule.sourceType) return false
  if (typeof sourceId !== 'string' || sourceId.length === 0) return false

  if (rule.pattern === 'date') {
    return isValidDateToken(sourceId)
  }
  if (rule.pattern === 'uuid') {
    return UUID_V4_RE.test(sourceId)
  }
  if (rule.pattern === 'date:token') {
    // wrong-word-recovered: token 부분은 실제로 wordSlug(word)(uuid 아님,
    // 위 WORD_SLUG_TOKEN_RE 주석의 2026-09-06 커버리지 수정 참고) — 공백과
    // ':'만 금지하는 넓은 규칙을 쓴다(이 타입은 이미 production에서 이
    // 간극으로 지급 거부가 발생 중이었다).
    const idx = sourceId.indexOf(':')
    if (idx <= 0) return false
    const datePart = sourceId.slice(0, idx)
    const tokenPart = sourceId.slice(idx + 1)
    return isValidDateToken(datePart) && WORD_SLUG_TOKEN_RE.test(tokenPart)
  }
  if (rule.pattern === 'date:streak') {
    const idx = sourceId.indexOf(':')
    if (idx <= 0) return false
    const datePart = sourceId.slice(0, idx)
    const streakPart = sourceId.slice(idx + 1)
    if (!isValidDateToken(datePart)) return false
    if (!/^\d{1,4}$/.test(streakPart)) return false
    const streak = Number(streakPart)
    return Number.isInteger(streak) && streak >= 1 && streak <= 3650
  }
  // ── 레거시 6종 패턴(2026-09-06) — 아래부터 새로 추가 ────────────────────
  if (rule.pattern === 'token:date') {
    // pronunciation: `${wordId}:${DATE}` — wordId엔 ':'가 없으므로 첫
    // ':' 기준 분리로 충분(DATE 안의 공백은 문제되지 않음).
    const idx = sourceId.indexOf(':')
    if (idx <= 0) return false
    const tokenPart = sourceId.slice(0, idx)
    const datePart = sourceId.slice(idx + 1)
    return WORD_TOKEN_RE.test(tokenPart) && isValidDateToken(datePart)
  }
  if (rule.pattern === 'token') {
    // mission-clear: `${wordId}` 단독(날짜 없음 — 미션은 평생 1회만
    // 클리어되므로 기간키가 필요 없다는 설계, 상단 REWARD_SOURCE_RULES
    // 주석 참고). 실제 값은 wordSlug(word)(uuid 아님, 위 WORD_SLUG_TOKEN_RE
    // 주석 참고) — WORD_SLUG_TOKEN_RE가 이미 공백/':' 주입을 차단한다.
    return WORD_SLUG_TOKEN_RE.test(sourceId)
  }
  if (rule.pattern === 'date:tokens') {
    // daily-mission-bonus: `${DATE}:${tokens}` — DATE는 공백 포함이지만
    // ':'는 없으므로 첫 ':' 기준 분리로 충분.
    const idx = sourceId.indexOf(':')
    if (idx <= 0) return false
    const datePart = sourceId.slice(0, idx)
    const tokensPart = sourceId.slice(idx + 1)
    return isValidDateToken(datePart) && TOKENS_LIST_RE.test(tokensPart)
  }
  if (rule.pattern === 'token:combo:date') {
    // spelling-combo: `${wordId}:${combo}:${DATE}` — wordId는 실제로
    // wordSlug(word)(uuid 아님, 위 WORD_SLUG_TOKEN_RE 주석 참고)라 공백/':'
    // 만 금지하는 넓은 규칙을 쓴다. combo는 숫자 리터럴이라 ':'를 가질 수
    // 없으므로 앞의 두 ':' 기준 3분할이 여전히 안전하다.
    const firstIdx = sourceId.indexOf(':')
    if (firstIdx <= 0) return false
    const tokenPart = sourceId.slice(0, firstIdx)
    const rest = sourceId.slice(firstIdx + 1)
    const secondIdx = rest.indexOf(':')
    if (secondIdx <= 0) return false
    const comboPart = rest.slice(0, secondIdx)
    const datePart = rest.slice(secondIdx + 1)
    if (!WORD_SLUG_TOKEN_RE.test(tokenPart)) return false
    if (!SPELLING_COMBO_VALUES_RE.test(comboPart)) return false
    return isValidDateToken(datePart)
  }
  if (rule.pattern === 'token:gift') {
    // sticker-duplicate: `${stickerId}:${GIFT}` — GIFT 자체가 내부에
    // ':'를 더 가질 수 있으므로(round:date:tokens) 첫 ':'만 분리점으로
    // 쓰고 나머지 전체를 GIFT로 넘긴다.
    const idx = sourceId.indexOf(':')
    if (idx <= 0) return false
    const stickerId = sourceId.slice(0, idx)
    const gift = sourceId.slice(idx + 1)
    return WORD_TOKEN_RE.test(stickerId) && isValidLegacyGiftToken(gift)
  }
  if (rule.pattern === 'session:round:word') {
    // matchgame: `${sessionId}:${round}:${wordToken}` — sessionId/round
    // 둘 다 ':'가 없고 wordToken도 ':'를 금지하므로(MATCHGAME_WORD_TOKEN_RE)
    // 정확히 3분할이어야 한다(그 이상/이하는 형식 위반으로 거부).
    const parts = sourceId.split(':')
    if (parts.length !== 3) return false
    const [sessionId, roundPart, wordToken] = parts
    if (!MATCHGAME_SESSION_RE.test(sessionId)) return false
    if (!MATCHGAME_ROUND_RE.test(roundPart)) return false
    const round = Number(roundPart)
    if (!Number.isInteger(round) || round < 0 || round > 99) return false
    return MATCHGAME_WORD_TOKEN_RE.test(wordToken)
  }
  return false
}

// 서버가 실제로 지급할 별 개수를 결정하는 유일한 함수 — req.body의 금액
// 필드는 절대 신뢰하지 않고, 항상 이 함수(즉 이 파일의 REWARD_STARS/
// STREAK_BONUS)에서 조회한다. 'streak-bonus'만 streakDays에 따라 값이
// 달라지므로 streakBonusStars()로 위임(3/5/7이 아니면 0 — 이미 그 함수가
// 방어). 그 외 rewardType은 REWARD_STARS[rewardType] 그대로. 무효한
// rewardType(isValidRewardType false, legacy-baseline 포함)은 0.
// ctx 의미는 rewardType에 따라 다르다 — 'streak-bonus'면 streakDays,
// 'spelling-combo'면 combo(3/5/10), 그 외 타입은 ctx를 아예 쓰지 않는다
// (REWARD_STARS[rewardType] 고정값). 호출부(api/grant-xp.js)는 이 ctx를
// 손으로 파싱하지 않고 rewardVariantFromSource()로 sourceId에서 뽑아
// 그대로 넘긴다.
export function resolveRewardStars(rewardType, ctx) {
  if (!isValidRewardType(rewardType)) return 0
  if (rewardType === 'streak-bonus') return streakBonusStars(ctx)
  if (rewardType === 'spelling-combo') {
    const combo = Number(ctx)
    return LEGACY_SPELLING_COMBO_BONUS[combo] || 0
  }
  return REWARD_STARS[rewardType] || 0
}

// resolveRewardStars가 필요로 하는 "가변 금액 결정 변수"를 sourceId에서
// 직접 뽑아준다 — api/grant-xp.js가 rewardType별 sourceId 형식을 손으로
// 다시 파싱하지 않도록(이미 isValidRewardSource가 형식을 보장한 뒤
// 호출되므로 여기서는 안전하게 재분리만 한다). 해당 없는 rewardType은
// undefined(streakBonusStars/콤보 조회 모두 undefined를 안전하게 0으로
// 처리한다).
export function rewardVariantFromSource(rewardType, sourceId) {
  const id = String(sourceId)
  if (rewardType === 'streak-bonus') {
    // `${date}:${streakDays}` — 마지막 ':' 뒤가 streakDays.
    const idx = id.lastIndexOf(':')
    if (idx < 0) return undefined
    return Number(id.slice(idx + 1))
  }
  if (rewardType === 'spelling-combo') {
    // `${wordId}:${combo}:${date}` — 첫 ':' 다음부터 그다음 ':' 전까지.
    const firstIdx = id.indexOf(':')
    if (firstIdx < 0) return undefined
    const rest = id.slice(firstIdx + 1)
    const secondIdx = rest.indexOf(':')
    if (secondIdx < 0) return undefined
    return Number(rest.slice(0, secondIdx))
  }
  return undefined
}

// ── parseLegacyDedupKey(2026-09-06) — 클라이언트가 grantReward()에 실제로
// 넘기던 레거시 dedupKey 원문(useStudent.js/MatchGameShell.jsx 호출부
// 그대로)을 서버 원장 요청 형태 { rewardType, sourceType, sourceId }로
// 변환한다. 이 함수는 "형식이 그럴듯한가"만 보지 않고 마지막에
// isValidRewardSource로 결과를 재검증한다 — 파싱 로직 자체에 버그가 있어도
// (예: 분리 위치 실수) 최종적으로 화이트리스트를 통과 못 하면 null을
// 돌려주므로 서버가 절대 위조/손상된 값으로 지급하지 않는다.
//
// null을 돌려주는 경우(의도된 동작, 에러 아님):
//   · 'pronunciation-unidentified:...' — wordId를 특정할 수 없는 레거시
//     호출(production 실측 0건, 서버화 대상 아님).
//   · V1 키(studentId로 시작하는 `${uuid}:${type}:...`) — 이 프리픽스들
//     중 어느 것과도 문자열이 일치하지 않으므로 자연히 걸러진다.
//   · 알 수 없는 프리픽스 / 형식이 깨진 키.
export function parseLegacyDedupKey(dedupKey) {
  if (typeof dedupKey !== 'string' || dedupKey.length === 0) return null
  const firstIdx = dedupKey.indexOf(':')
  if (firstIdx <= 0) return null
  const prefix = dedupKey.slice(0, firstIdx)
  const rest = dedupKey.slice(firstIdx + 1)
  if (rest.length === 0) return null

  let result = null
  if (prefix === 'pronunciation') {
    // `pronunciation:${wordId}:${DATE}` -> sourceId = `${wordId}:${DATE}`
    result = { rewardType: 'pronunciation', sourceType: 'pronunciation', sourceId: rest }
  } else if (prefix === 'mission-clear') {
    // `mission-clear:${wordId}` -> sourceId = `${wordId}`
    result = { rewardType: 'mission-clear', sourceType: 'mission', sourceId: rest }
  } else if (prefix === 'daily-mission-bonus') {
    // `daily-mission-bonus:${DATE}:${tokens}` -> sourceId = `${DATE}:${tokens}`
    result = { rewardType: 'daily-mission-bonus', sourceType: 'daily-round', sourceId: rest }
  } else if (prefix === 'spelling-combo') {
    // `spelling-combo:${wordId}:${combo}:${DATE}` -> sourceId = `${wordId}:${combo}:${DATE}`
    result = { rewardType: 'spelling-combo', sourceType: 'spelling-combo', sourceId: rest }
  } else if (prefix === 'sticker-duplicate') {
    // `sticker-duplicate:${stickerId}:${GIFT}` -> sourceId = `${stickerId}:${GIFT}`
    result = { rewardType: 'sticker-duplicate', sourceType: 'gift', sourceId: rest }
  } else if (prefix === 'matchgame') {
    // `matchgame:${sessionId}:${round}:${wordToken}` -> sourceId = `${sessionId}:${round}:${wordToken}`
    result = { rewardType: 'matchgame', sourceType: 'matchgame', sourceId: rest }
  } else {
    // 'pronunciation-unidentified', V1 uuid-prefixed 키, 그 외 미지 프리픽스.
    return null
  }

  if (!isValidRewardSource(result.rewardType, result.sourceType, result.sourceId)) return null
  return result
}

// ── 서버측 일일 상한 (2026-08-23, 보안 감사 HIGH 4번 대응) ────────────────
// api/grant-xp.js에는 인증이 없다(POST면 누구나 호출 — 이 저장소에 세션 토큰
// 개념이 자체가 없어 이번 범위에서 닫지 못한다, HIGH 1은 BLOCKED). 금액과
// idempotency_key는 서버가 정하므로 1회당 지급액은 못 부풀리지만, sourceId가
// 클라이언트 제어라 'uuid'/'date:token' 패턴 타입은 값을 바꿔가며 무제한
// 반복 지급이 가능했다. 그래서 (student_id, reward_type)별 **하루 지급 건수**
// 상한을 서버가 강제한다 — 피해 반경을 무한에서 유한으로 바꾼다.
//
// 값 근거는 가정이 아니라 production 실측:
//   · wrong-word-recovered 60 — 유닛당 단어 수 실측 최대 50(중앙 40)이므로
//     한 학생이 하루에 오답을 전부 회복해도 50건. 여유 10을 더한다.
//   · exam-complete 10 — 반·날짜당 입실시험 실측 최대 8건(평균 2.0).
//     다만 이 타입의 1차 방어는 상한이 아니라 entrance_test_results 실재
//     검증이다(서버가 관측 가능한 진실). 상한은 2차 안전망.
//   · 나머지 4종은 sourceId가 날짜뿐이라 구조적으로 하루 1건.
//
// 화이트리스트에 없는 rewardType은 0 — fail-closed(지급 자체가 막힌다).
export const REWARD_DAILY_CAP = {
  'word-session-complete': 1,
  'writing-complete': 1,
  'exam-complete': 10,
  'wrong-word-recovered': 60,
  'daily-goal-complete': 1,
  'streak-bonus': 1,
  // ── 레거시 6종 상한(2026-09-06) — production 2026-09-06 READ-ONLY 실측
  // 근거: 하루 최대 총 별 74(=4/4 라운드 최대 7회 반복 기준). 유닛 최대
  // 50단어(중앙값 40)이므로 발음(pronunciation)은 여러 유닛을 넘나들며
  // 반복 연습이 가능해 120으로 여유를 둔다. mission-clear는 미션당 평생
  // 1회(단어 단위)이므로 유닛 최대 단어 수(50) 대비 여유를 둬 40. 콤보
  // 3/5/10 마일스톤은 라운드당 최대 3건(콤보가 끊기기 전까지 3단계뿐)이라
  // 여유 있게 60. daily-mission-bonus는 라운드 반복 자체가 의도된 게임
  // 경제(위 useStudent.js 주석 "missions repeat all day")라 7회 반복 기준
  // 여유를 둬 12. sticker-duplicate(기프트, 중복 스티커)는 라운드+마일스톤+
  // 배지 합이 하루 15건을 넘지 않는다는 판단으로 15. matchgame은
  // GAME_REWARD_DAILY_LIMIT=1(하루 1세션) x 5라운드(ROUNDS)로 구조적 상한
  // 자체가 5 — 세션당 5회 이상 지급될 수 없으므로 캡도 5로 고정.
  // 이 값들은 "실제 학생이 정상적으로 오늘 벌 수 있는 별을 절대 깎지
  // 않는다"는 원칙(위 규칙 5 "REWARD_DAILY_CAP additions" 지시) 하에
  // 여유를 크게 둔 것으로, 정확한 최종값은 운영자 확정 대상(OPEN DECISION)
  // 이다 — 이 구현은 구조를 여는 것이지 상한값 자체를 확정하는 결정이
  // 아니다.
  'pronunciation': 120,
  'mission-clear': 40,
  'daily-mission-bonus': 12,
  'spelling-combo': 60,
  'sticker-duplicate': 15,
  'matchgame': 5,
}

export function rewardDailyCap(rewardType) {
  if (!isValidRewardType(rewardType)) return 0
  return REWARD_DAILY_CAP[rewardType] || 0
}

// 상한 집계의 "오늘" 경계 — KST 자정에 해당하는 **epoch 밀리초**를 돌려준다.
// reward_ledger.created_at은 now()(UTC)로 저장되는데 학생의 하루는 KST라,
// UTC 자정으로 세면 09:00 KST에 상한이 리셋되는 엉뚱한 동작이 된다.
// 이 저장소가 날짜를 항상 로컬(한국) 기준으로 다루는 관례(wordLibrary.js
// localIsoDateStr 주석)를 서버측 집계에도 그대로 적용한다.
//
// 순수 함수 — 입력도 출력도 숫자다. 이 파일은 Date.now()/Math.random()/
// new Date()를 전혀 쓰지 않는 결정론 모듈이라는 계약이 있고
// (scripts/testRewardEngine.mjs 8절이 강제), Date 객체를 만들지 않으면
// 그 계약을 지키면서 같은 계산을 할 수 있다. ISO 문자열 변환은 Date를
// 자유롭게 쓸 수 있는 호출부(api/grant-xp.js)가 담당한다.
//
// KST는 서머타임이 없는 고정 UTC+9라 단순 오프셋 산술로 정확하다.
export function kstDayStartMs(nowMs) {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000
  const DAY_MS = 24 * 60 * 60 * 1000
  const n = Number(nowMs)
  if (!Number.isFinite(n)) return NaN
  // KST 시각축으로 옮겨 하루 단위로 내림한 뒤, 다시 UTC 축으로 되돌린다.
  return Math.floor((n + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS
}
