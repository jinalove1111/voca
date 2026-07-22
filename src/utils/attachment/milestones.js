// 성장 앨범 밀스톤(2026-07-22, 애착 시스템) — 학습 여정의 자동 이정표.
//
// 각 밀스톤은 고유 id(중복 방지 키)를 가진 append-only 이벤트다. 저장은
// useStudent record.milestones(진행도 블롭)에 하고, 이 모듈은 "지금
// 데이터 기준으로 새로 달성된 밀스톤" 목록만 순수 계산한다(결정론).
//
// 정직성 원칙: `at`은 "달성이 확인된 시각"이다. 과거에 이미 달성돼 있던
// 것을 최초 실행 시점에 소급 감지하면 backfilled:true로 표시한다 —
// 앨범 UI는 backfilled 이벤트에 대해 정확한 달성 날짜를 주장하지 않고
// "이미 달성!"으로만 보여준다(가짜 날짜 금지, 폴의 기억과 같은 원칙).
// 판별 규칙: 계정의 학습 첫날이 아닌데(=기존 데이터가 있는데) 처음
// 감지되는 누적형 밀스톤은 과거 달성일 수 있으므로 backfilled로 본다.

export const CLEARED_MILESTONES = [10, 50, 100, 200]
export const STREAK_MILESTONES = [7, 30]
export const COMEBACK_GAP_DAYS = 7

// 정적 정의(동적 id 계열 — unit/textbook/hat/improved — 는 아래 detect에서 생성)
const label = {
  firstMission: { emoji: '🌟', title: '첫 데일리 미션 완료!', desc: '처음으로 하루 미션 4개를 모두 완료했어요' },
  cleared: (n) => ({ emoji: '📖', title: `단어 ${n}개 클리어!`, desc: `클리어한 단어가 ${n}개를 넘었어요` }),
  streak: (n) => ({ emoji: '🔥', title: `${n}일 연속 학습!`, desc: `${n}일 동안 하루도 빠짐없이 공부했어요` }),
  unit: (name) => ({ emoji: '🎓', title: `${name} 완주!`, desc: '유닛의 모든 단어를 클리어했어요' }),
  textbook: (name) => ({ emoji: '🏆', title: `${name} 교재 완주!`, desc: '교재의 모든 유닛을 끝냈어요' }),
  hat: (hatName, hatEmoji) => ({ emoji: hatEmoji, title: `${hatName} 획득!`, desc: '새로운 모자를 얻었어요' }),
  comeback: { emoji: '🤗', title: '다시 돌아왔어요!', desc: '쉬었다가 다시 공부를 시작했어요 — 돌아온 게 제일 멋져요' },
  improved: (n) => ({ emoji: '💪', title: '어려웠던 단어 극복!', desc: `힘들었던 단어 ${n}개를 이제 완전히 알게 됐어요` }),
}

/**
 * 새로 달성된 밀스톤 이벤트 목록.
 * @param stats deriveAttachmentStats 결과
 * @param ctx { completedUnits:[{unitId,unitName}], completedTextbooks:[{classId,className}], newHats:[{hatId,name,emoji}] }
 * @param existingIds 이미 기록된 밀스톤 id Set/배열
 * @returns [{id, type, at, backfilled, emoji, title, desc, data}]
 */
export function detectNewMilestones(stats, ctx, existingIds, now = new Date()) {
  const existing = new Set(existingIds || [])
  const at = now.toISOString()
  const out = []
  // 계정에 오늘 이전의 학습 기록이 있으면, 처음 감지되는 누적형 밀스톤은
  // 과거에 이미 달성돼 있었을 수 있다 → backfilled(소급) 표시.
  const todayKey = now.toDateString()
  const hasOlderHistory = stats.studiedDays.some((d) => d.key !== todayKey)
  const push = (id, type, meta, data = {}, backfillable = true) => {
    if (existing.has(id)) return
    out.push({ id, type, at, backfilled: backfillable && hasOlderHistory, ...meta, data })
  }

  if (stats.firstMissionDayKey) {
    // 첫 미션 완료일은 history에 실제 날짜가 남아있어 소급이어도 날짜가 정확하다
    push('first-mission-day', 'firstMission', label.firstMission, { dayKey: stats.firstMissionDayKey }, false)
  }
  for (const n of CLEARED_MILESTONES) {
    if (stats.clearedCount >= n) push(`cleared-${n}`, 'cleared', label.cleared(n), { threshold: n })
  }
  for (const n of STREAK_MILESTONES) {
    if (stats.streak >= n) push(`streak-${n}`, 'streak', label.streak(n), { threshold: n })
  }
  for (const u of ctx?.completedUnits || []) {
    if (u.unitId) push(`unit-complete-${u.unitId}`, 'unit', label.unit(u.unitName), { unitId: u.unitId, unitName: u.unitName })
  }
  for (const t of ctx?.completedTextbooks || []) {
    if (t.classId) push(`textbook-complete-${t.classId}`, 'textbook', label.textbook(t.className), { classId: t.classId, className: t.className })
  }
  for (const h of ctx?.newHats || []) {
    // 모자 획득은 지금 이 순간 일어난 이벤트 — 소급 아님(정확한 시각)
    push(`hat-${h.hatId}`, 'hat', label.hat(h.name, h.emoji), { hatId: h.hatId }, false)
  }
  // 컴백: 마지막 학습일과 오늘 사이 공백이 기준 이상이고 오늘 학습했을 때.
  // id에 오늘 날짜를 넣어 "이번 컴백"당 1회만 기록(다음 공백 후 컴백은 새 id).
  const studiedToday = stats.lastStudiedKey === todayKey
  if (studiedToday && stats.studiedDays.length >= 2) {
    const prev = stats.studiedDays[stats.studiedDays.length - 2]
    const gapDays = Math.round((stats.studiedDays[stats.studiedDays.length - 1].date - prev.date) / (24 * 60 * 60 * 1000))
    if (gapDays >= COMEBACK_GAP_DAYS) {
      push(`comeback-${todayKey}`, 'comeback', label.comeback, { gapDays }, false)
    }
  }
  // 극복한 단어 — 새로 극복된 단어들을 하나의 이벤트로 묶는다(개별 단어당
  // 이벤트를 만들면 앨범이 도배됨). id에 누적 극복 수를 넣어 증가할 때만
  // 새 이벤트가 생긴다.
  const improvedCount = stats.improvedWordIds.length
  if (improvedCount > 0) {
    push(`improved-${improvedCount}`, 'improved', label.improved(improvedCount), { wordIds: stats.improvedWordIds.slice(0, 50) })
  }
  return out
}

// 앨범 표시용 정렬 — 최신이 위(성장 앨범 카드 타임라인)
export function sortMilestonesForAlbum(milestones) {
  return [...(milestones || [])].sort((a, b) => new Date(b.at) - new Date(a.at))
}
