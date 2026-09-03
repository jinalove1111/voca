// growthPoints(정원 성장 v2 보너스, P2, 2026-09-03) — zero-import, pure,
// deterministic. src/utils/attachment/*의 다른 모듈과 같은 규율(I/O 없음,
// React 없음, 저장 없음, 순수 함수만) — attachmentCore.js가 이 모듈을
// import해서 gardenPoints를 만들 것이므로, 이 파일 자체는 attachmentCore를
// import하지 않는다(순환 금지).
//
// 배경(docs/REWARD_LOOP_AUDIT_2026-09-03.md §7, §14 P2) — 정원 성장 포인트는
// 지금까지 "실제로 학습한 서로 다른 단어 수"(gardenSet.size, cleared ∪
// completedWords ∪ clearedWords) 하나뿐이었다. 이 모듈은 그 위에 학생의
// rewardLedger(서버 원장, useStudent.js의 grantLedgerReward가 append)에서
// "의미있는 학습 완료" 신호(오늘의 목표 달성/쓰기시험/입실시험/오답 복습/
// 유닛 완주)를 읽어 소량의 보너스를 얹는다 — 축을 새로 만드는 게 아니라
// 기존 단어 축(word axis)에 보너스(bonus axis)를 더하는 것.
//
// ── 산수(문서화, 운영자 검증용) ──────────────────────────────────────────
// POINTS_PER_STAGE = 2(worldProgress.js) → 정원 칸 하나 = 2포인트.
//   가벼운 날(단어 2개만 학습, 보너스 없음)              = 2포인트 = 1칸
//   중앙값(단어 2개 + 오늘의 목표 달성 1회)               = 2 + 2 = 4포인트 = 2칸
//   빡센 날(단어 8개 + 목표 1 + 쓰기 1 + 복습 상한 2회)   =
//     단어축 8 + 보너스(목표2 + 쓰기1 + 복습1×2=2) = 8 + 5 = 13포인트 = 6.5칸
//     (단어축만으로도 이미 4칸 — 기존 동작 그대로, 보너스는 그 위에 얹힘)
// 하루 보너스 상한은 설계상 ≤ 5(목표2+쓰기1+복습상한2) + 유닛완주 4 = 최대 9
// (unit-complete는 하루에 여러 번 나오기 어려운 이벤트라 실질 유닛당 1회).
// "하루 1타일 하드 캡"은 기존에도 없었고(§7) 이 모듈도 두지 않는다 —
// 보너스만 유형별로 자체 상한(PER_DAY_CAPS)을 가질 뿐, 정원 칸 성장
// 속도 자체에는 상한이 없다(2026-08-28 운영자 승인 결정, 기존 계약 유지).

// 플래그를 켜는 날짜(KST 기준 created_at 문자열 prefix 비교) — 운영자가
// attachmentGardenGrowthV2를 실제로 켜는 날짜에 맞춰 이 상수를 조정한다.
// 이 날짜 이전에 쌓인 ledger 항목은 보너스 0점 — 플래그를 켠 날 정원이
// 과거 누적분만큼 갑자기 점프하는 것을 방지(운영자 안심 조건, "오늘부터"
// 새로 시작).
export const GROWTH_V2_EPOCH = '2026-09-03'

// reward_type별 보너스 가중치. 0으로 명시된 항목은 "이미 단어 축에서
// 세거나(word-session-complete) 서버 원장이 없는 레거시(streak-bonus/
// word-mastered/review-session-bonus)라 이 축에서는 중복 가산하지 않는다"는
// 의도를 코드로 남기기 위한 것 — 목록에서 빼면 "실수로 빠졌나"와 구분이
// 안 된다.
export const BONUS_WEIGHTS = {
  'daily-goal-complete': 2,
  'writing-complete': 1,
  'exam-complete': 2,
  'wrong-word-recovered': 1,
  'unit-complete': 4,
  'word-session-complete': 0,
  'streak-bonus': 0,
  'word-mastered': 0,
  'review-session-bonus': 0,
}

// 같은 날짜(day-key) 안에서 이 이상은 가산하지 않는 유형 — wrong-word-
// recovered는 하루 상한이 서버(rewardEngine.js REWARD_DAILY_CAP)에서 60건
// 까지 허용되므로(스펠링 복습 큐 소진), 정원 보너스 쪽은 별도로 더 낮게
// 제한한다(과다 보너스로 "복습만 반복해도 정원이 폭발적으로 자란다"는
// 역설을 막기 위함).
export const PER_DAY_CAPS = {
  'wrong-word-recovered': 2,
}

// entry.source_id가 "<dayToken>:<나머지>" 형태면 dayToken을 day-key로 쓴다
// (useStudent.js의 실제 sourceId 관례 — 예: `${todayStr()}:${wordId}`,
// todayStr()는 new Date().toDateString() 이라 "Mon Sep 03 2026" 형태이지
// ISO가 아니다 — 이 함수는 어떤 문자열이든 콜론 앞부분을 그대로 그룹 키로
// 쓸 뿐 날짜로 파싱하지 않는다). 콜론이 없으면 created_at의 앞 10자
// ("YYYY-MM-DD" ISO prefix)로 폴백. 그마저 없으면 'unknown'(같은 그룹으로
// 묶여 상한을 보수적으로 적용).
function dayKeyOf(entry) {
  const sourceId = entry.source_id
  if (typeof sourceId === 'string' && sourceId.includes(':')) {
    return sourceId.slice(0, sourceId.indexOf(':'))
  }
  const createdAt = entry.created_at
  if (typeof createdAt === 'string' && createdAt.length >= 10) return createdAt.slice(0, 10)
  return 'unknown'
}

// epoch(예: '2026-09-03') 이상인지 — entry.created_at은 new Date().
// toISOString() 형태(UTC)를 그대로 문자열 prefix 비교한다(둘 다 YYYY-MM-DD...
// 이므로 사전식 비교 = 날짜 비교와 동일). created_at이 없거나 앞 10자가
// 유효한 날짜 형태가 아니면 "epoch 이전"으로 보수적으로 취급(보너스 0)
// — 신뢰할 수 없는 타임스탬프로 소급 보너스를 만들지 않기 위함.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/
function isOnOrAfterEpoch(entry, epoch) {
  const createdAt = entry.created_at
  if (typeof createdAt !== 'string' || !ISO_DATE_RE.test(createdAt)) return false
  return createdAt.slice(0, 10) >= epoch
}

/**
 * rewardLedger(배열)에서 정원 보너스 포인트를 계산한다. 순수·결정론.
 * @param {Array} rewardLedger — 학생 record.rewardLedger(없으면 [])
 * @param {{epoch?: string}} opts
 * @returns {number} 정수 ≥ 0
 */
export function bonusPointsFromLedger(rewardLedger, { epoch = GROWTH_V2_EPOCH } = {}) {
  const list = Array.isArray(rewardLedger) ? rewardLedger : []
  const seenKeys = new Set()
  // 1차 통과: 유효 + epoch 통과 + 알려진 타입 + idempotency_key 중복 제거
  const eligible = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const rewardType = entry.reward_type
    if (typeof rewardType !== 'string' || !(rewardType in BONUS_WEIGHTS)) continue
    if (!isOnOrAfterEpoch(entry, epoch)) continue
    const idKey = entry.idempotency_key
    if (typeof idKey === 'string' && idKey.length > 0) {
      if (seenKeys.has(idKey)) continue
      seenKeys.add(idKey)
    }
    eligible.push(entry)
  }

  // 2차: 유형별 일일 상한 적용(있는 유형만) — 같은 유형 + 같은 day-key로
  // 그룹핑해 등장 순서대로 상한까지만 인정.
  const perTypeDayCount = new Map() // `${rewardType}::${dayKey}` -> count
  let total = 0
  for (const entry of eligible) {
    const rewardType = entry.reward_type
    const weight = BONUS_WEIGHTS[rewardType] || 0
    const cap = PER_DAY_CAPS[rewardType]
    if (cap !== undefined) {
      const groupKey = `${rewardType}::${dayKeyOf(entry)}`
      const count = perTypeDayCount.get(groupKey) || 0
      if (count >= cap) continue
      perTypeDayCount.set(groupKey, count + 1)
    }
    total += weight
  }
  return total
}

/**
 * 정원 성장 포인트(v2) = 기존 단어 축(distinctWordPoints, 그대로 유지) +
 * ledger 보너스. distinctWordPoints가 여전히 유일한 "진짜" 학습량 지표이고,
 * 보너스는 그 위에 얹히는 가산치일 뿐이다(축 대체 아님).
 * @param {number} distinctWordPoints — attachmentCore.gardenSet.size
 * @param {Array} rewardLedger
 * @param {{epoch?: string}} opts
 */
export function growthPoints(distinctWordPoints, rewardLedger, opts) {
  const base = Number.isFinite(distinctWordPoints) ? distinctWordPoints : 0
  return base + bonusPointsFromLedger(rewardLedger, opts)
}
