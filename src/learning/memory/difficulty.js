// src/learning/memory/difficulty.js — 단어별 난이도 점수(0~1) 계산 + 승급
// 게이트 튜닝 자리. import 0(순수) — leitner.js와 같은 관례.
//
// computeDifficulty(input) — 여러 신호를 고정 가중치로 합산해 0~1 사이
// 점수를 낸다. 가중치는 이 파일이 유일한 출처(export DIFFICULTY_WEIGHTS)
// — 다른 모듈이 자체 계산식을 복제하지 않는다.
//
// 신호별 근거:
//   - missedCount(누적 오답 횟수, attachment/attachmentCore.js:61 missedCounts
//     shape과 동일한 "wordId -> 횟수" 신호를 정규화해 사용): 포화 함수
//     m/(m+k)로 정규화 — 오답이 늘수록 단조 증가하되 무한정 커지지 않게
//     막는다(한두 번 틀린 단어와 스무 번 틀린 단어를 억지로 20배 차이
//     나게 벌리지 않음).
//   - wrongToday(오늘 이미 틀림), inReviewQueue(기존 spellingReviewQueue/
//     복습 큐에 이미 있음), status==='unknown'(자기 신고 "모르겠어요"),
//     level<=1(아직 안 익은 박스) — 전부 불리언 가산.
export const DIFFICULTY_WEIGHTS = Object.freeze({
  missedCount: 0.45,
  wrongToday: 0.25,
  inReviewQueue: 0.15,
  statusUnknown: 0.10,
  lowLevel: 0.05,
})

const MISSED_SATURATION = 3 // missedCount=3일 때 missedCount 가중치의 절반 반영

function normalizeMissedCount(missedCount) {
  const m = Math.max(0, Number(missedCount) || 0)
  return m / (m + MISSED_SATURATION)
}

// computeDifficulty({missedCount, wrongToday, inReviewQueue, status, level})
// → 0..1. 가중치 합이 1.0이고 각 항이 0~1이므로 결과도 항상 0~1(클램프는
// 방어적으로만 적용). missedCount 외 모든 입력이 같을 때 missedCount만
// 늘리면 점수는 절대 줄지 않는다(단조 증가) — 하네스가 실측.
export function computeDifficulty(input = {}) {
  const missedCount = input.missedCount
  const wrongToday = !!input.wrongToday
  const inReviewQueue = !!input.inReviewQueue
  const status = input.status ?? null
  const level = Number.isFinite(input.level) ? input.level : null

  let score = 0
  score += DIFFICULTY_WEIGHTS.missedCount * normalizeMissedCount(missedCount)
  score += DIFFICULTY_WEIGHTS.wrongToday * (wrongToday ? 1 : 0)
  score += DIFFICULTY_WEIGHTS.inReviewQueue * (inReviewQueue ? 1 : 0)
  score += DIFFICULTY_WEIGHTS.statusUnknown * (status === 'unknown' || status == null ? 1 : 0)
  score += DIFFICULTY_WEIGHTS.lowLevel * (level == null || level <= 1 ? 1 : 0)

  return Math.max(0, Math.min(1, score))
}

// ── 승급 게이트 튜닝(미래용, 기본 OFF) ──────────────────────────────────
// 계획된 미래 튜닝: "difficulty>=0.7 이고 level>=3이면 correctStreak>=2
// 여야 승급 허용" — 즉 이미 여러 번 틀렸던 어려운 단어가 중간 박스 이상
// 올라갈 때는 연속 정답을 한 번 더 요구해 "우연한 한 번 정답으로 어려운
// 단어가 너무 쉽게 승급"하는 것을 막는 정책. 지금은 enabled:false라
// 아래 promoteGateFor()가 항상 identity(무조건 허용)로 동작한다 — 운영
// 데이터가 쌓여 튜닝 필요성이 실증되면 enabled만 true로 바꾸면 된다
// (leitner.js는 이 상수를 전혀 모른다 — 게이트는 항상 difficulty.js가
// 만들어서 leitner.applyResult의 opts.promoteGate에 꽂는 쪽 책임).
export const PROMOTE_GATE_TUNING = Object.freeze({
  enabled: false,
  difficultyThreshold: 0.7,
  levelThreshold: 3,
  requiredStreak: 2,
})

// promoteGateFor(difficulty) — leitner.applyResult(entry, correct, today,
// { promoteGate }) 에 그대로 꽂을 수 있는 게이트 함수를 만들어 돌려준다.
// 기본(enabled:false)은 이름 그대로 identity 게이트 — entry/proposedLevel이
// 무엇이든 항상 true.
export function promoteGateFor(difficulty) {
  return function promoteGate(entry, proposedLevel) {
    void proposedLevel
    if (!PROMOTE_GATE_TUNING.enabled) return true
    const level = Number(entry?.level) || 0
    if (difficulty >= PROMOTE_GATE_TUNING.difficultyThreshold && level >= PROMOTE_GATE_TUNING.levelThreshold) {
      return (Number(entry?.correctStreak) || 0) >= PROMOTE_GATE_TUNING.requiredStreak
    }
    return true
  }
}
