// src/utils/gamification/streakAdapter.js — Streak V2 배선 어댑터
// (P6, docs/REWARD_LOOP_AUDIT_2026-09-03.md §14, 2026-09-03).
//
// streakModel.js(freeze 포함, 완성돼 있었지만 어디에도 배선되지 않았던
// 죽은 모듈, 위 감사 5·6절)를 실제 Dashboard 표시에 연결하는 유일한
// 접착 계층. import는 streakModel 하나뿐(그 자신도 import 0개 순수
// 모듈) — 이 어댑터도 순수 함수만 export하고 부작용이 없다(history
// 객체를 읽기만 함, 아무 것도 쓰지 않음).
//
// 타임존: 레거시 calcStreak(useStudent.js:762 `calcStreak`)와 정확히
// 같은 "로컬(기기) 자정 기준 날짜"를 쓴다 — 학생 기기가 한국에 있으므로
// 사실상 KST, `Date.toDateString()`/`new Date()`의 로컬 필드(getFullYear/
// getMonth/getDate)와 동일 기준. attachmentCore.parseHistoryKey와 같은
// 파싱(new Date(key))을 쓰되, 이 파일은 attachmentCore를 import하지
// 않는다(오너십 분리 + 순수성 유지 — 3줄만 재구현, 값도 attachmentCore와
// 100% 동일하게 나온다: 둘 다 `new Date(key)`).
//
// 보상 없음: 이 파일은 어떤 별/XP/스티커도 지급하지 않는다(순수 표시
// 파생). 레거시 STREAK_BONUS(useStudent.js:1491)가 여전히 유일한 스트릭
// 보상 지급 경로 — 이 어댑터를 배선해도 이중 지급이 생기지 않는다.

import { computeStreak, isQualifiedDay, MILESTONES } from './streakModel.js'

// history key(다양한 과거 포맷 — 'YYYY-M-D', Date.toDateString() 등,
// attachmentCore.parseHistoryKey 참고) → 'YYYY-MM-DD' 로컬 날짜 문자열.
// 파싱 실패(Invalid Date)면 null.
export function toLocalDateStr(input) {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 오늘(로컬) 'YYYY-MM-DD' — Dashboard 등 호출부가 computeStreakV2(history,
// todayIso)에 넘길 기본값으로 쓰기 편하도록 노출.
export function localTodayStr() {
  return toLocalDateStr(new Date())
}

// history(useStudent.js record.history, key: 날짜 문자열, value:
// { categoriesCompleted, quizCorrect, ... } camelCase) → streakModel이
// 요구하는 인정일('YYYY-MM-DD') 배열. isQualifiedDay는 snake_case
// (categories_completed/quiz_correct)를 기대하므로 여기서 필드명만
// 변환해 그대로 재사용한다(판정 로직 자체는 손으로 베끼지 않음 —
// isQualifiedDay를 그대로 호출).
export function historyToQualifiedDates(history) {
  const dates = []
  for (const [key, day] of Object.entries(history || {})) {
    const dateStr = toLocalDateStr(key)
    if (!dateStr) continue
    const row = {
      categories_completed: Number(day?.categoriesCompleted) || 0,
      quiz_correct: Number(day?.quizCorrect) || 0,
    }
    if (isQualifiedDay(row)) dates.push(dateStr)
  }
  return dates
}

// 'YYYY-MM-DD'의 ISO 주(월요일 시작) 키 — streakModel.weekKey와 동일한
// 정의(월=0 기준 주 시작일)를 여기서 다시 계산한다(streakModel이 그
// 내부 함수를 export하지 않으므로, freezesUsed 배열에서 "이번 주에 쓴
// freeze인지"만 별도로 판정하기 위해 필요).
function isoWeekKeyOf(dateStr) {
  const ts = Date.parse(dateStr + 'T00:00:00Z')
  const d = new Date(ts)
  const dow = (d.getUTCDay() + 6) % 7 // 월=0 … 일=6
  return new Date(ts - dow * 86400000).toISOString().slice(0, 10)
}

// computeStreakV2(history, todayIso) — Dashboard 등 표시 계층의 단일
// 진입점. history: useStudent record.history(camelCase) 그대로 넘기면
// 됨. todayIso: 'YYYY-MM-DD'(로컬) — 생략 시 localTodayStr()로 채운다.
// 반환: computeStreak(...) 결과(current/best/todayQualified/freezesUsed/
// nextMilestone) + { protectedThisWeek, milestoneLabel }.
export function computeStreakV2(history, todayIso) {
  const today = todayIso || localTodayStr()
  const qualifiedDates = historyToQualifiedDates(history)
  const result = computeStreak(qualifiedDates, today)
  const thisWeek = isoWeekKeyOf(today)
  // freezesUsed에 담긴 날짜(공백일) 중 "이번 주"에 속한 것이 있으면
  // 오늘 기준 보호가 이번 주에 실제로 발동했다는 뜻 — best는 별도로
  // 항상 보존되므로(streakModel.js 주석), 하루 결석이 이번 세션에서
  // current를 깎지 않았음을 그대로 알려주는 표시 전용 파생값.
  const protectedThisWeek = (result.freezesUsed || []).some((d) => isoWeekKeyOf(d) === thisWeek)
  const milestoneLabel = result.nextMilestone
    ? `${result.nextMilestone.day}일까지 ${result.nextMilestone.remaining}일 남음`
    : null
  return { ...result, protectedThisWeek, milestoneLabel }
}

export { MILESTONES }
