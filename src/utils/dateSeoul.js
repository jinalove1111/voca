// src/utils/dateSeoul.js
//
// Asia/Seoul 고정 UTC+9 오프셋 기반 날짜 계산 공용 유틸(코드품질 감사
// 2026-07-24 §1-2 통합) — writingAnswerStatsApi.js의 SEOUL_OFFSET_MS 기반
// seoulShiftedNow/seoulMondayBoundary/seoulDateStr()와 spellingReviewAiApi.js
// 의 자체 오늘-날짜 문자열 계산(todayLocalDateStr, 비용 상한 일일 카운터용)
// 을 이 파일 하나로 추출/통합했다. 한국은 DST가 없으므로 UTC+9 고정
// 오프셋으로 서버(Vercel)/브라우저의 실제 로컬 타임존 설정과 무관하게 항상
// 정확한 "서울 벽시계 기준" 값을 계산할 수 있다.
//
// 절대 건드리지 않는 것: src/hooks/useStudent.js의 todayStr()(toDateString()
// 기반)는 모든 학생의 캘린더/스트릭/기록 저장 키 포맷이라 09-audit이
// 명시적으로 High-risk로 지정했다 — 이 파일과 무관한 별개 로직이며, 이
// 파일이 그쪽을 import하거나 대체하지 않는다.

export const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

// 반환값의 UTC 게터(getUTCFullYear/getUTCMonth/getUTCDate/getUTCDay 등)를
// 읽으면 "서울 벽시계 기준" 값이 나오는 트릭 — 실제 유효한 timestamptz
// 경계(DB 쿼리용 ISO 문자열 등)를 만들 때는 다시 SEOUL_OFFSET_MS를 빼서
// 진짜 UTC 순간으로 되돌려야 한다(아래 seoulMondayBoundary 참고).
export function seoulShiftedNow() {
  return new Date(Date.now() + SEOUL_OFFSET_MS)
}

// "YYYY-MM-DD"(서울 기준 오늘) — localStorage 일별 카운터 키 등에 사용.
export function getSeoulDateString() {
  const shifted = seoulShiftedNow()
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

// weeksAgo=0 → 이번 주 월요일 00:00(서울 기준)의 실제 UTC Date, weeksAgo=1
// → 지난 주 월요일 00:00. DB의 timestamptz 컬럼과 직접 비교 가능한 실제
// UTC 순간을 반환한다(getSeoulDateString과 달리 문자열이 아님).
export function seoulMondayBoundary(weeksAgo = 0) {
  const shifted = seoulShiftedNow()
  const day = shifted.getUTCDay() // 0=일 ~ 6=토(서울 벽시계 기준)
  const diffToMonday = day === 0 ? 6 : day - 1
  const mondayShifted = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(),
    shifted.getUTCDate() - diffToMonday - weeksAgo * 7,
  ))
  return new Date(mondayShifted.getTime() - SEOUL_OFFSET_MS)
}
