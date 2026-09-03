// src/utils/rewardSummary.js — Session Reward Summary(P1 "즉각적인 보상
// 피드백", 2026-09-03).
//
// rewardEngine.js/paulRankShared.js/ticketEconomy.js와 동일한 순수성 원칙
// — import 0개(완전 순수, plain Node에서 바로 import 가능), React 없음,
// `window`/`document`/`localStorage` 없음, 네트워크 호출 없음. 시각은
// 인자로만 받는다는 원칙도 동일하되(다른 모듈 참고), 이 모듈은 애초에
// 시각을 전혀 쓰지 않는다(순수 숫자 요약 계산이라 Date 자체가 입력에
// 없음) — 결정론은 입력이 같으면 출력이 같다는 뜻 그대로 성립.
//
// ── 이 모듈이 하는 일 / 하지 않는 일 ────────────────────────────────────
// "한 세션에서 실제로 무슨 보상이 있었는지" 숫자를 그러모아 화면에 보여줄
// ≤4줄짜리 요약으로 바꾸는 순수 변환만 한다. 별/XP/스티커/티켓을 실제로
// 지급하는 어떤 경로도 이 모듈은 갖지 않는다(grantReward/grantLedgerReward/
// grantXp는 useStudent.js에 이미 있는 유일한 지급 경로, CLAUDE.md 규칙 3
// "완료로 선언된 작업 재구현 금지" — 이 모듈은 그 결과값만 입력으로 받아
// 표시 문구를 만들 뿐, 그 자체로는 어떤 부수효과도 없다).
//
// ── 레벨 임계값 중복(의도적) ──────────────────────────────────────────
// LEVEL_THRESHOLDS는 rewardEngine.js의 LEVELS를 import하지 않고 값만
// 그대로 옮겨 적는다 — "zero-import" 원칙(이 파일 헤더) 때문에 import할
// 수 없어서다. 이 저장소에는 이미 같은 패턴이 있다: paulRankShared.js의
// XP_EVENT_TABLE 금액도 rewardEngine.js의 REWARD_STARS를 import하지 않고
// "독립적으로 고정 값으로 정의"한다(파일 헤더 주석 인용: "각 트리거의
// XP 지급액은 아래 XP_EVENT_TABLE에 독립적으로 고정값으로 정의"). 드리프트
// 위험은 scripts/testSessionRewardSummary.mjs가 두 소스(이 파일과
// rewardEngine.js)를 직접 import해 값을 상호 비교하는 회귀 가드로 막는다
// (테스트 파일은 zero-import 제약이 없으므로 이 비교가 가능).
const LEVEL_THRESHOLDS = [0, 20, 50, 100, 200]

// 누적 별(totalStars) 기준 "다음 레벨까지 남은 별" — rewardEngine.js의
// starsToNextLevel과 정확히 같은 계산(값만 독립 복제, 위 주석 참고).
// 이미 최고 레벨이면 null.
function starsToNextLevel(totalStars) {
  const stars = Math.max(0, Number(totalStars) || 0)
  let index = 0
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (stars >= LEVEL_THRESHOLDS[i]) index = i
    else break
  }
  const next = LEVEL_THRESHOLDS[index + 1]
  return next === undefined ? null : next - stars
}

// 양수 유한값만 합산 — 손상된/음수 입력이 요약을 음수로 만들지 않는다
// (rewardEngine.earnedStars와 동일한 방어적 판단).
function sumPositive(list, pick) {
  if (!Array.isArray(list)) return 0
  return list.reduce((sum, item) => {
    const v = Number(pick ? pick(item) : item)
    return (Number.isFinite(v) && v > 0) ? sum + v : sum
  }, 0)
}

/**
 * 한 세션(한 번의 "의미있는 학습 완료" 순간)에 실제로 있었던 보상을 모아
 * 요약으로 만든다. 어떤 숫자도 여기서 지어내지 않는다 — 전부 호출부가
 * 이미 지급 경로(grantReward/grantLedgerReward/grantXp)를 거쳐 실제로
 * 만든 결과값을 그대로 넘겨받는다.
 *
 * @param {object} args
 * @param {Array<{stars_delta:number}>} args.entries - 이번 세션에 새로
 *   append된 reward_ledger 항목(들). buildRewardEntry() 산출물 형태.
 * @param {number[]} args.xpEvents - 이번 세션에 실제로 발화된 grantXp
 *   금액(들, XP_EVENT_TABLE에서 resolveXpAmount로 조회된 실제 값). 캡처
 *   못 했으면 빈 배열 — 그러면 xp는 0(발명하지 않음).
 * @param {number} [args.gardenBefore] - (레거시) 세션 시작 시점 정원 "단계"
 *   총합(스테이지 랭크 합 — worldProgress.gardenStageTotal() 같은 파생값).
 *   주어지면 gardenGrowth를 여기서 바로 계산한다.
 * @param {number} [args.gardenAfter] - (레거시) 지금(세션 끝) 같은 축의
 *   정원 단계 총합.
 * @param {number} [args.gardenRawBefore] - (원시, 2026-09-03 레이어 계약
 *   수정) 세션 시작 시점 정원 성장 원시값(학습한 서로 다른 단어 수, 단계
 *   변환 이전 — 이 모듈은 zero-import라 gardenPlots/gardenStageTotal을
 *   직접 계산할 수 없으므로, "단계 변환"은 호출부(SessionRewardCard.jsx,
 *   withGardenGrowth 참고)가 한다). 주어지면 그대로 요약에 실어 보낸다.
 * @param {number} [args.gardenRawAfter] - 세션 끝 시점 같은 원시값.
 * @param {number} args.streak - calcStreak(history) 그대로.
 * @param {number} args.totalStars - 이 세션의 별 지급까지 반영된 누적
 *   총 별(totalStars). 다음 레벨 계산에만 쓰인다.
 * @returns {{stars:number, xp:number, gardenGrowth:number|null,
 *   gardenRawBefore:number|null, gardenRawAfter:number|null,
 *   streak:number, nextGoal:{kind:'level', remaining:number|null, label:string|null}}}
 */
export function buildSessionRewardSummary({ entries, xpEvents, gardenBefore, gardenAfter, gardenRawBefore, gardenRawAfter, streak, totalStars } = {}) {
  const stars = sumPositive(entries, (e) => e && e.stars_delta)
  const xp = sumPositive(xpEvents)

  // 레거시 경로 — 호출부가 이미 "단계" 총합을 계산해 넘겼으면(예: 옛
  // useStudent.js 배선, 또는 이 모듈을 단계 총합만으로 직접 쓰는 다른
  // 호출부) 여기서 바로 gardenGrowth를 계산한다. 하나도 안 왔으면(원시값
  // 경로) null로 남겨 presenter(withGardenGrowth)가 채우게 한다 — "0"과
  // "아직 모름"을 구분하기 위해 명시적으로 null.
  const hasStageTotals = gardenBefore !== undefined || gardenAfter !== undefined
  let gardenGrowth = null
  if (hasStageTotals) {
    const before = Number.isFinite(Number(gardenBefore)) ? Number(gardenBefore) : 0
    const after = Number.isFinite(Number(gardenAfter)) ? Number(gardenAfter) : 0
    gardenGrowth = Math.max(0, after - before)
  }

  const rawBefore = Number.isFinite(Number(gardenRawBefore)) ? Number(gardenRawBefore) : null
  const rawAfter = Number.isFinite(Number(gardenRawAfter)) ? Number(gardenRawAfter) : null

  const streakNum = Number(streak)
  const streakDays = (Number.isFinite(streakNum) && streakNum > 0) ? streakNum : 0

  const remaining = starsToNextLevel(totalStars)
  const nextGoal = (remaining !== null && remaining > 0)
    ? { kind: 'level', remaining, label: `다음 레벨까지 별 ${remaining}개` }
    : { kind: 'level', remaining: null, label: null }

  return { stars, xp, gardenGrowth, gardenRawBefore: rawBefore, gardenRawAfter: rawAfter, streak: streakDays, nextGoal }
}

/**
 * gardenGrowth가 null인 요약(원시 정원 성장값만 실려온 경우)에, 호출부가
 * (attachment 레이어에서) 계산한 "단계" 총합 before/after를 넣어 gardenGrowth를
 * 확정한 "새" 요약을 반환하는 순수 헬퍼. 이 모듈은 zero-import 계약이라
 * worldProgress.gardenStageTotal 자체를 여기서 부를 수 없다 — 그래서 호출부가
 * 이미 계산해온 숫자만 받는다(재구현 아님, presenter 조립일 뿐).
 * @param {object} summary - buildSessionRewardSummary() 결과.
 * @param {number} stageBefore - 세션 시작 시점 정원 단계 총합.
 * @param {number} stageAfter - 세션 끝 시점 정원 단계 총합.
 * @returns {object} summary와 동일하되 gardenGrowth만 채워진 새 객체.
 */
export function withGardenGrowth(summary, stageBefore, stageAfter) {
  const before = Number.isFinite(Number(stageBefore)) ? Number(stageBefore) : 0
  const after = Number.isFinite(Number(stageAfter)) ? Number(stageAfter) : 0
  return { ...(summary || {}), gardenGrowth: Math.max(0, after - before) }
}

/**
 * 요약 -> 화면에 보여줄 ≤4줄 한국어 문자열 배열. 0이거나 없는 항목은
 * 줄 자체를 생략한다(zero-omission) — "0개" 같은 문구를 보여주지 않는다.
 * 별/XP는 한 줄에 합쳐 보여준다(예: "+1 ⭐   +2 XP") — 둘 다 0이면 그
 * 줄 전체를 생략.
 */
export function formatRewardLines(summary) {
  const s = summary || {}
  const lines = []

  const starsPart = (Number(s.stars) > 0) ? `+${s.stars} ⭐` : ''
  const xpPart = (Number(s.xp) > 0) ? `+${s.xp} XP` : ''
  if (starsPart || xpPart) {
    lines.push([starsPart, xpPart].filter(Boolean).join('   '))
  }

  if (Number(s.gardenGrowth) > 0) {
    lines.push(`🌱 정원 +${s.gardenGrowth}`)
  }

  if (Number(s.streak) > 0) {
    lines.push(`🔥 ${s.streak}일 연속!`)
  }

  if (s.nextGoal && typeof s.nextGoal.remaining === 'number' && s.nextGoal.remaining > 0 && s.nextGoal.label) {
    lines.push(`🎁 ${s.nextGoal.label}`)
  }

  return lines.slice(0, 4)
}
