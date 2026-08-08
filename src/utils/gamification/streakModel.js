// src/utils/gamification/streakModel.js — 연속 학습(streak) 계산(순수 모델)
//
// import 0개 순수 모듈(dailyMissionModel.js와 동일 관례). 규칙의 단일 원본:
// docs/GAME_REWARD_RULES.md §4.
//
// 핵심 규칙:
//   - "인정일" = 최소 학습 기준을 채운 날(categories_completed ≥ 1 또는
//     당일 퀴즈 정답 ≥ 10) — 단순 접속은 불인정. 인정일 판정은 호출부가
//     student_daily_progress 행으로 수행해 날짜 배열만 넘긴다.
//   - Freeze: 주(월~일) 1회 자동 보호 — 한 주 안에서 하루 공백은 streak을
//     끊지 않고 소모 표시만 한다(공백일 자체는 streak 수에 미포함).
//   - best(최고 기록)는 별도 반환 — 끊겨도 자산이 남는다(좌절 방지).
//   - 시간/랜덤 무의존: "오늘" 날짜도 인자로 받는다(테스트 결정론).

// 내부: 'YYYY-MM-DD' → UTC 자정 타임스탬프(날짜 산술용 — 표시 아님).
function dayTs(dateStr) {
  return Date.parse(dateStr + 'T00:00:00Z')
}
const ONE_DAY = 86400000

// ISO 주 키(월요일 시작) — freeze는 주당 1회.
function weekKey(dateStr) {
  const ts = dayTs(dateStr)
  const d = new Date(ts)
  const dow = (d.getUTCDay() + 6) % 7 // 월=0 … 일=6
  return new Date(ts - dow * ONE_DAY).toISOString().slice(0, 10)
}

// computeStreak(qualifiedDates, todayStr)
//   qualifiedDates: 인정일 'YYYY-MM-DD' 배열(중복/순서 무관)
//   todayStr: 오늘 날짜 'YYYY-MM-DD'
// 반환: { current, best, todayQualified, freezesUsed: ['YYYY-MM-DD'(공백일)],
//         nextMilestone: { day, remaining } | null }
export const MILESTONES = [3, 7, 14, 30, 60, 90]

export function computeStreak(qualifiedDates, todayStr) {
  const days = [...new Set((qualifiedDates || []).filter(Boolean))].sort()
  const set = new Set(days)
  const todayQualified = set.has(todayStr)

  // current: 오늘(또는 오늘 미인정이면 어제)에서 과거로 거슬러 연속 계산.
  // 공백 1일은 그 공백일이 속한 주(월~일)에서 freeze 미사용일 때만 1회 건너뜀.
  const anchor = todayQualified ? todayStr : new Date(dayTs(todayStr) - ONE_DAY).toISOString().slice(0, 10)
  let current = 0
  const freezesUsed = []
  const frozenWeeks = new Set()
  let cursorTs = dayTs(anchor)
  while (true) {
    const cursor = new Date(cursorTs).toISOString().slice(0, 10)
    if (set.has(cursor)) {
      current++
      cursorTs -= ONE_DAY
      continue
    }
    // 공백일 — freeze 시도(그 주에 아직 미사용일 때만, 연속 공백은 불가)
    const wk = weekKey(cursor)
    const prev = new Date(cursorTs - ONE_DAY).toISOString().slice(0, 10)
    if (!frozenWeeks.has(wk) && set.has(prev)) {
      frozenWeeks.add(wk)
      freezesUsed.push(cursor)
      cursorTs -= ONE_DAY
      continue
    }
    break
  }
  // best: 전체 이력에서 최장 연속(freeze 규칙 동일 적용).
  let best = 0
  {
    let run = 0
    const usedWeeks = new Set()
    for (let k = 0; k < days.length; k++) {
      if (k === 0) { run = 1; continue }
      const gap = Math.round((dayTs(days[k]) - dayTs(days[k - 1])) / ONE_DAY)
      if (gap === 1) run++
      else if (gap === 2) {
        const missed = new Date(dayTs(days[k]) - ONE_DAY).toISOString().slice(0, 10)
        const wk = weekKey(missed)
        if (!usedWeeks.has(wk)) { usedWeeks.add(wk); run += 1 } // 공백 1일은 freeze(수 미포함), 당일만 +1
        else { best = Math.max(best, run); run = 1 }
      } else { best = Math.max(best, run); run = 1 }
    }
    best = Math.max(best, run, current)
  }

  const next = MILESTONES.find((m) => m > current) || null
  return {
    current,
    best,
    todayQualified,
    freezesUsed,
    nextMilestone: next ? { day: next, remaining: next - current } : null,
  }
}

// 인정일 판정 — student_daily_progress 행 1개 기준(호출부 헬퍼).
export function isQualifiedDay(dailyRow) {
  const r = dailyRow || {}
  return (Number(r.categories_completed) || 0) >= 1 || (Number(r.quiz_correct) || 0) >= 10
}
