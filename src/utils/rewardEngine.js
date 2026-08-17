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
