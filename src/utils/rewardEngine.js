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
}

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

function isValidDateToken(value) {
  return typeof value === 'string' && DATE_TOKEN_RE.test(value)
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
    const idx = sourceId.indexOf(':')
    if (idx <= 0) return false
    const datePart = sourceId.slice(0, idx)
    const tokenPart = sourceId.slice(idx + 1)
    return isValidDateToken(datePart) && WORD_TOKEN_RE.test(tokenPart)
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
  return false
}

// 서버가 실제로 지급할 별 개수를 결정하는 유일한 함수 — req.body의 금액
// 필드는 절대 신뢰하지 않고, 항상 이 함수(즉 이 파일의 REWARD_STARS/
// STREAK_BONUS)에서 조회한다. 'streak-bonus'만 streakDays에 따라 값이
// 달라지므로 streakBonusStars()로 위임(3/5/7이 아니면 0 — 이미 그 함수가
// 방어). 그 외 rewardType은 REWARD_STARS[rewardType] 그대로. 무효한
// rewardType(isValidRewardType false, legacy-baseline 포함)은 0.
export function resolveRewardStars(rewardType, streakDays) {
  if (!isValidRewardType(rewardType)) return 0
  if (rewardType === 'streak-bonus') return streakBonusStars(streakDays)
  return REWARD_STARS[rewardType] || 0
}
