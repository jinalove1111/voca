// src/learning/memory/leitner.js — Leitner 메모리 모델(박스 0~5, 6단계)
// 채택 설계 근거: docs/research/memory-engine.md §6.2(SM-2/Anki 이지팩터보다
// 순수 Leitner 채택 이유) + §6.3(권장 알고리즘 명세, 아래 규칙은 그 문서
// 그대로 옮긴 것 — 파라미터를 여기서 임의로 바꾸지 않는다).
//
// 순수 함수만 export한다(import 0 — React/Supabase/네트워크/"지금 시각"
// 조회 전부 무의존). "오늘 날짜"는 항상 호출부가 문자열(YYYY-MM-DD)로
// 넘긴다 — applyResult가 내부에서 현재 시각 API로 "지금"을 추측하지
// 않는다. addDays/diffDays는 그 문자열 자체에 대한 날짜 산술만 한다(UTC
// 고정 — 로컬 타임존에 따라 결과가 흔들리면 결정론이 깨진다).
//
// 6단계 간격 표(§6.3) — 이 배열이 유일한 "파라미터"다:
export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30]
export const MAX_BOX = BOX_INTERVALS_DAYS.length - 1 // 5

// ── 날짜 문자열 산술(UTC 고정, 현재 시각 API 미사용) ────────────────────────
function parseDateStr(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}

function formatDateStr(utcMs) {
  const d = new Date(utcMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// addDays(dateStr, days) — dateStr(YYYY-MM-DD) + days(정수, 음수 허용)일 뒤의
// 날짜 문자열. 입력이 이미 문자열로 고정돼 있으므로 결정론적(같은 입력 →
// 항상 같은 출력).
export function addDays(dateStr, days) {
  return formatDateStr(parseDateStr(dateStr) + Number(days) * 86400000)
}

// diffDays(aStr, bStr) — a - b(일 단위, a가 미래면 양수).
function diffDays(aStr, bStr) {
  return Math.round((parseDateStr(aStr) - parseDateStr(bStr)) / 86400000)
}

// emptyEntry() — 아직 한 번도 복습 기록이 없는 단어의 기본 박스 항목.
// 저장 계약(memory/storage/reviewDataCodec.js와 동일 shape):
//   { level, nextReviewAt, lastResult, lastReviewedAt, correctStreak }
export function emptyEntry() {
  return { level: 0, nextReviewAt: null, lastResult: null, lastReviewedAt: null, correctStreak: 0 }
}

// applyResult(entry, correct, todayStr, opts={}) — §6.3 규칙 그대로:
//   정답: 박스 +1(최대 5). 오답: 박스 -1(0 미만 방지) — 원본 Leitner의
//   "무조건 0으로 리셋"이 아니라 한 단계만 강등하는 완화형(문서 §6.3
//   "규칙" 항목, 아동의 실패 경험 손실 최소화 원칙과 일치). 오답을 여러 번
//   반복해도 한 번에 -1씩만 내려가지, 절대 0으로 순간이동하지 않는다.
//
// opts.promoteGate(entry, proposedLevel) — 승급을 추가로 막을 수 있는 훅
// (memory/difficulty.js의 promoteGateFor가 만드는 게이트를 여기 꽂는 자리).
// 기본값은 항상 true를 돌려주는 no-op(승급을 절대 막지 않음) — 이 파일
// 자체는 게이트 정책을 모르고 "꽂을 자리"만 제공한다.
export function applyResult(entry, correct, todayStr, opts = {}) {
  const e = entry || emptyEntry()
  const promoteGate = typeof opts.promoteGate === 'function' ? opts.promoteGate : () => true
  const currentLevel = Number.isFinite(e.level) ? e.level : 0

  let newLevel
  let correctStreak
  if (correct) {
    const proposedLevel = Math.min(MAX_BOX, currentLevel + 1)
    const allowed = promoteGate(e, proposedLevel)
    newLevel = allowed ? proposedLevel : currentLevel
    correctStreak = (Number(e.correctStreak) || 0) + 1
  } else {
    newLevel = Math.max(0, currentLevel - 1) // 한 단계만 강등 — 절대 0으로 리셋하지 않음
    correctStreak = 0
  }

  return {
    level: newLevel,
    nextReviewAt: addDays(todayStr, BOX_INTERVALS_DAYS[newLevel]),
    lastResult: correct ? 'correct' : 'incorrect',
    lastReviewedAt: todayStr,
    correctStreak,
  }
}

// isDue(entry, todayStr) — 아직 한 번도 리뷰 안 한 단어(nextReviewAt 없음)
// 또는 next_review_date가 오늘 이전/당일이면 복습 대상(§6.3 "동률/우선순위"
// 규칙의 1단계 — 여기서는 판정만, 정렬은 memory/reviewQueue.js 몫).
export function isDue(entry, todayStr) {
  if (!entry || !entry.nextReviewAt) return true
  return entry.nextReviewAt <= todayStr
}

// daysOverdue(entry, todayStr) — "오래 묵은 순" 정렬 키. 안 밀렸으면 0.
export function daysOverdue(entry, todayStr) {
  if (!isDue(entry, todayStr)) return 0
  if (!entry || !entry.nextReviewAt) return 0 // 한 번도 안 본 단어는 "밀림"이 아니라 "신규" — reviewQueue.js가 별도 취급
  const d = diffDays(todayStr, entry.nextReviewAt)
  return d > 0 ? d : 0
}
