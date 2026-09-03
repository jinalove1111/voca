// src/utils/nextGoals.js — P3 "다음 목표(Next Goals)" 순수 계산 모듈
// (2026-09-03, docs/REWARD_LOOP_AUDIT_2026-09-03.md §14 P3).
//
// rewardEngine.js/hatSystem.js와 같은 순수성 원칙 — React 없음, 저장소
// 접근 없음, Date.now()/Math.random()/new Date() 없음(시각 인자 자체가
// 필요 없다 — 이 모듈은 "지금 몇 시인지"가 아니라 "이미 파생된 통계
// 스냅샷"만 읽는다). import는 기존 순수 모듈 3개뿐(rewardEngine/hatSystem/
// worldProgress/paulTown) — CLAUDE.md 규칙 3(재구현 금지) 그대로, 새
// 인벤토리/보상 타입을 만들지 않고 기존 축(별/모자/정원/월드/마을)을
// 조합만 한다.
//
// "진행률 바는 절대 0%에서 시작하지 않는다"(연구 브리프 §4, endowed
// progress) — makeGoal()이 모든 목표에 최소 10% 선불을 준다:
//   pct = round(10 + 90 * clamp(current/target, 0, 1))
// target<=0(고장난 입력)이거나 이미 완료된 목표는 pct=100 고정.
//
// short(오늘) / medium(이번 주·다음) / long(장기) 3칸 — "먼 목표만 있는"
// 상태를 만들지 않는다(운영자 지시): short는 반드시 오늘 안에 닿을 수
// 있는 것(오늘의 미션 또는 정원 한 칸), medium은 다음 레벨/모자/별배지
// 중 가장 가까운 것, long은 월드 다음 구역(집/다리/도서관/마을/왕국) 또는
// Paul Town 다음 건물이다.

import { levelForStars } from './rewardEngine.js'
import { HAT_THRESHOLDS, hatById } from './attachment/hatSystem.js'
import { computeWorldState, POINTS_PER_STAGE } from './attachment/worldProgress.js'
import { TOWN_PLACES } from './attachment/paulTown.js'

// 숫자 임계값으로 판정되는 모자만(불리언 모자 hat_starter/hat_graduation은
// "다음 목표"로 진행률을 매길 수 없으므로 제외 — 감사 문서 §9 그대로).
const NUMERIC_HATS = [
  { id: 'hat_explorer', threshold: HAT_THRESHOLDS.explorerCleared, getCurrent: (s) => s?.clearedCount || 0 },
  { id: 'hat_chef', threshold: HAT_THRESHOLDS.chefStreak, getCurrent: (s) => s?.streak || 0 },
  { id: 'hat_scientist', threshold: HAT_THRESHOLDS.scientistQuizCorrect, getCurrent: (s) => s?.totalQuizCorrect || 0 },
  { id: 'hat_wizard', threshold: HAT_THRESHOLDS.wizardMastered, getCurrent: (s) => s?.masteredCount || 0 },
  { id: 'hat_crown', threshold: HAT_THRESHOLDS.crownCleared, getCurrent: (s) => s?.clearedCount || 0 },
  { id: 'hat_rose', threshold: HAT_THRESHOLDS.roseWeekDays, getCurrent: (s) => s?.thisWeek?.daysStudied || 0 },
]

// 공용 목표 빌더 — endowed progress(최소 10%) + remaining 계산을 한 곳에
// 고정한다. target<=0/음수 current는 방어적으로 0/완료 취급(크래시 없음).
function makeGoal({ kind, label, emoji, current, target }) {
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 0
  const safeCurrent = Number.isFinite(current) && current > 0 ? current : 0
  if (safeTarget <= 0) {
    return { kind, label, emoji, current: 0, target: 0, remaining: 0, pct: 100 }
  }
  const clamped = Math.min(1, Math.max(0, safeCurrent / safeTarget))
  const pct = Math.round(10 + 90 * clamped)
  const remaining = Math.max(0, safeTarget - safeCurrent)
  return { kind, label, emoji, current: safeCurrent, target: safeTarget, remaining, pct }
}

// short — 오늘 안에 닿는 목표만. 오늘의 미션(4/4)이 아직이면 그것부터,
// 이미 끝났으면 "정원 한 칸 성장"(단어 1~2개)으로 넘어간다 — 절대
// "오늘은 더 할 게 없음" 상태를 만들지 않는다.
function computeShortGoal({ todayHistory, gardenPoints }) {
  const completed = Number(todayHistory?.categoriesCompleted) || 0
  if (completed < 4) {
    return makeGoal({ kind: 'daily-goal', label: '오늘 미션', emoji: '🎯', current: completed, target: 4 })
  }
  const points = Number.isFinite(gardenPoints) && gardenPoints > 0 ? gardenPoints : 0
  const rem = points % POINTS_PER_STAGE
  const remaining = rem === 0 ? POINTS_PER_STAGE : POINTS_PER_STAGE - rem
  const current = POINTS_PER_STAGE - remaining
  return makeGoal({ kind: 'garden-stage', label: '정원 한 칸 성장', emoji: '🌱', current, target: POINTS_PER_STAGE })
}

// medium — 다음 레벨/미보유 모자(숫자 임계값만)/다음 별배지 중 남은 양이
// 가장 적은 것 하나. 전부 이미 달성했으면(레벨 최고 + 모자 전부 보유 +
// 별배지 전부 초과) kind:'maxed-medium'.
function computeMediumGoal({ totalStars, stats, hatInventory, starBadges }) {
  const candidates = []

  const lvl = levelForStars(totalStars)
  if (lvl.nextMin !== null) {
    candidates.push({
      priority: 0,
      goal: makeGoal({ kind: 'level-up', label: '다음 레벨', emoji: '⭐', current: totalStars, target: lvl.nextMin }),
    })
  }

  const owned = new Set((Array.isArray(hatInventory) ? hatInventory : []).map((h) => h?.hatId).filter(Boolean))
  for (const h of NUMERIC_HATS) {
    if (owned.has(h.id)) continue
    const hatMeta = hatById(h.id)
    candidates.push({
      priority: 1,
      goal: makeGoal({
        kind: 'hat',
        label: hatMeta?.name || '새 모자',
        emoji: '🎩',
        current: h.getCurrent(stats),
        target: h.threshold,
      }),
    })
  }

  const badges = Array.isArray(starBadges) ? starBadges : []
  const nextBadge = badges.find((b) => (Number(totalStars) || 0) < b.threshold)
  if (nextBadge) {
    candidates.push({
      priority: 2,
      goal: makeGoal({ kind: 'star-badge', label: '별 배지', emoji: '🎖️', current: totalStars, target: nextBadge.threshold }),
    })
  }

  const positive = candidates.filter((c) => c.goal.remaining > 0)
  if (positive.length === 0) {
    return { kind: 'maxed-medium', label: '다 모았어요!', emoji: '🏆', current: 1, target: 1, remaining: 0, pct: 100 }
  }
  positive.sort((a, b) => a.goal.remaining - b.goal.remaining || a.priority - b.priority)
  return positive[0].goal
}

// long — 월드(정원→집→다리→도서관→마을→왕국) 다음 구역. 월드가 전부
// 열렸으면(실데이터로는 사실상 도달 불가 — 왕국 250 > 시계탑 150이라
// 월드가 마지막 구역에 닿기 전에 마을 건물이 먼저 전부 열린다, 그래도
// 방어적으로 유지) Paul Town 다음 건물(minCleared)을 본다.
function computeLongGoal(stats) {
  const state = computeWorldState(stats)
  if (state.nextStage) {
    return makeGoal({
      kind: 'world-stage',
      label: state.nextStage.name,
      emoji: state.nextStage.emoji,
      current: state.growthPoints,
      target: state.nextStage.minPoints,
    })
  }
  const points = state.growthPoints
  const nextPlace = TOWN_PLACES.find((p) => points < p.minCleared)
  if (nextPlace) {
    return makeGoal({
      kind: 'town-place',
      label: nextPlace.name,
      emoji: nextPlace.emoji,
      current: points,
      target: nextPlace.minCleared,
    })
  }
  return { kind: 'world-complete', label: '월드 완성', emoji: '🏆', current: 1, target: 1, remaining: 0, pct: 100 }
}

/**
 * 단기(short)/중기(medium)/장기(long) 다음 목표 3개를 계산한다(순수,
 * 결정론 — 같은 입력이면 항상 같은 출력).
 * @param {object} params
 * @param {number} params.totalStars
 * @param {number} params.streak
 * @param {number} params.gardenPoints
 * @param {Array<{hatId:string}>} params.hatInventory
 * @param {object} params.stats deriveAttachmentStats 결과(clearedCount/
 *   masteredCount/totalQuizCorrect/streak/thisWeek 등)
 * @param {{categoriesCompleted:number}} params.todayHistory
 * @param {Array<{threshold:number, stickerId:string}>} params.starBadges
 * @returns {{ short: object, medium: object, long: object }}
 */
export function computeNextGoals({ totalStars, streak, gardenPoints, hatInventory, stats, todayHistory, starBadges }) {
  const safeStats = stats || {}
  return {
    short: computeShortGoal({ todayHistory, gardenPoints }),
    medium: computeMediumGoal({ totalStars, stats: safeStats, hatInventory, starBadges }),
    long: computeLongGoal(safeStats),
  }
}

// 화면에 그대로 쓸 한 줄(짧고 아이 친화적, 이모지 포함). 카드는 이 문자열
// + 진행률 바만 렌더한다(로직/판정은 이 함수 밖 makeGoal/compute*가 전담).
export function formatGoalLine(goal) {
  if (!goal) return ''
  const { kind, label, emoji, remaining } = goal
  if (!remaining || remaining <= 0) return `${emoji} ${label} 완료!`
  switch (kind) {
    case 'daily-goal':
      return `${emoji} ${label} ${remaining}개만 더 하면 끝!`
    case 'garden-stage':
      return `${emoji} 정원 한 칸 성장까지 단어 ${remaining}개`
    case 'level-up':
      return `${emoji} 다음 레벨까지 별 ${remaining}개`
    case 'hat':
      return `${emoji} ${remaining}만 더 모으면 ${label} 획득!`
    case 'star-badge':
      return `${emoji} 별 ${remaining}개만 더 모으면 특별 배지!`
    case 'world-stage':
      return `${emoji} ${label}까지 ${remaining}포인트`
    case 'town-place':
      return `${emoji} ${label} 발견까지 ${remaining}포인트`
    default:
      return `${emoji} ${label}`
  }
}
