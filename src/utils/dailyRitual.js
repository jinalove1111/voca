// utils/dailyRitual.js — "3분 데일리 리추얼" 순수 세션 플래너 (v1, 2026-07-22)
//
// 선생님이 배정한 오늘의 단어 목록(10~100개)을 한 번에 다 시키지 않고,
// 3~5분짜리 "마이크로 세션" 여러 개로 나누기 위한 크기 계산 모듈.
// React/네트워크/스토리지 의존 없음 — 완전 순수 함수라 Node에서 직접
// import해 테스트한다(TESTING.md 카테고리 1, verify:daily-ritual 하네스).
//
// ── 불변 조건 (코드에서도 강제) ─────────────────────────────────────────
// 1. 모든 세션의 합집합은 배정된 단어 전체를 정확히 한 번씩 덮는다 —
//    단어를 조용히 줄이거나 건너뛰지 않는다. remainingWords >= 1이면
//    planSessionSize()는 항상 1 이상을 반환하므로, 호출부가 "다음 세션 =
//    직전 세션 끝 인덱스부터 계산된 크기만큼 연속 슬라이스" 규칙만 지키면
//    구조적으로 손실이 불가능하다.
// 2. 선생님이 배정한 총량(totalWords)은 절대 바꾸지 않는다 — 세션 경계는
//    표시/페이스 조절 전용이며, 학습 대상 자체를 재정의하지 않는다.
// 3. 세션 크기는 해당 밴드의 [minSize, maxSize]를 절대 벗어나지 않는다
//    (단, 남은 단어가 밴드 최소보다 적으면 남은 것 전부 = 그보다 작을 수
//    있음 — 이건 "남은 단어보다 많이 시키지 않는다"가 우선이라서).
// 4. 진행 표시(sessionProgressDisplay)는 절대 K > N, M > T를 렌더하지
//    않는다(적응형 크기 변화로 N이 중간에 약간 흔들리는 것은 정상).
//
// ── 학년(grade) 적응에 대한 설계 노트 ──────────────────────────────────
// 스키마에 학년/레벨 컬럼은 존재하지 않으며 이번 작업에서 추가하지도
// 않는다(운영자 승인 결정). 대신 밴드 구조 자체가 학년의 프록시다 —
// 저학년 반은 애초에 배정 단어 수가 적고(~10-40) 그 밴드의 세션 크기도
// 작으며, 고학년 반은 배정이 많고(~50-100) 세션도 크다. 선생님이 배정량을
// 조절하는 것만으로 학년별 난이도가 자동으로 따라온다.
//
// 튜닝 포인트: 아래 SESSION_SIZE_BANDS / ADAPTATION_THRESHOLDS 상수만
// 고치면 로직 변경 없이 밴드/임계값을 조절할 수 있다.

// 운영자가 정한 시작 규칙 — "배정 총량 → 세션당 단어 수" 밴드.
// minTotal/maxTotal: 이 밴드가 적용되는 배정 총량 구간(포함).
// minSize/maxSize: 그 구간에서 허용되는 세션당 단어 수 범위(포함).
export const SESSION_SIZE_BANDS = [
  { minTotal: 10, maxTotal: 20,  minSize: 5,  maxSize: 10 },
  { minTotal: 21, maxTotal: 40,  minSize: 8,  maxSize: 12 },
  { minTotal: 41, maxTotal: 70,  minSize: 10, maxSize: 15 },
  { minTotal: 71, maxTotal: 100, minSize: 12, maxSize: 20 },
]

// 적응 임계값 — 직전 세션의 정답률/페이스로 다음 세션 크기를 밴드 안에서
// 조절한다. 힘들어하면(정답률 낮음 OR 페이스 느림) 밴드 최소로 줄이고,
// 잘하면(정답률 높음 AND 페이스 빠름 — 둘 다 확인돼야) 밴드 최대로 늘린다.
export const ADAPTATION_THRESHOLDS = {
  lowAccuracy: 0.7,        // 이보다 낮으면 "힘들어함"
  highAccuracy: 0.9,       // 이보다 높아야 "잘함" 후보
  slowPaceMsPerWord: 45000, // 단어당 45초 초과면 "느림"
  fastPaceMsPerWord: 20000, // 단어당 20초 미만이어야 "빠름"
}

// 배정 총량에 맞는 밴드를 찾는다.
// - 총량 < 10: null (밴드 미적용 — 한 세션에 전부, planSessionSize 참고)
// - 총량 > 100: 최상위 밴드로 클램프
export function bandForTotal(totalWords) {
  const n = Math.floor(Number(totalWords))
  if (!Number.isFinite(n) || n < SESSION_SIZE_BANDS[0].minTotal) return null
  const top = SESSION_SIZE_BANDS[SESSION_SIZE_BANDS.length - 1]
  if (n > top.maxTotal) return top
  return SESSION_SIZE_BANDS.find((b) => n >= b.minTotal && n <= b.maxTotal) || top
}

// 다음 세션의 단어 수를 계산한다.
// - totalWords: 선생님이 배정한 오늘 단어 총량(절대 바뀌지 않음)
// - remainingWords: 아직 학습하지 않은 단어 수(현재 세션 계획 시점 기준)
// - recentAccuracy: 직전 세션 정답률(0~1) — 오늘 첫 세션이면 null
// - recentPaceMsPerWord: 직전 세션 단어당 소요 ms — 오늘 첫 세션이면 null
// 반환: 0(남은 게 없음) 또는 1 이상(남은 게 있으면 절대 0이 아님 —
// 불변 조건 1). 반환값은 remainingWords를 절대 초과하지 않는다.
export function planSessionSize({ totalWords, remainingWords, recentAccuracy = null, recentPaceMsPerWord = null }) {
  const total = Math.max(0, Math.floor(Number(totalWords)) || 0)
  const remaining = Math.min(Math.max(0, Math.floor(Number(remainingWords)) || 0), total)
  if (remaining === 0) return 0

  const band = bandForTotal(total)
  // 배정이 10개 미만 — 나눌 이유가 없다. 한 세션에 전부.
  if (!band) return remaining

  const T = ADAPTATION_THRESHOLDS
  const mid = Math.round((band.minSize + band.maxSize) / 2)
  const hasAccuracy = typeof recentAccuracy === 'number' && Number.isFinite(recentAccuracy)
  const hasPace = typeof recentPaceMsPerWord === 'number' && Number.isFinite(recentPaceMsPerWord)

  // 축소: 신호 하나만 나빠도 줄인다(아이를 지치게 하지 않는 쪽으로 보수적).
  const struggling =
    (hasAccuracy && recentAccuracy < T.lowAccuracy) ||
    (hasPace && recentPaceMsPerWord > T.slowPaceMsPerWord)
  // 확대: 정답률과 페이스가 둘 다 측정됐고 둘 다 좋아야 늘린다.
  const cruising =
    hasAccuracy && recentAccuracy > T.highAccuracy &&
    hasPace && recentPaceMsPerWord < T.fastPaceMsPerWord

  let size = mid
  if (struggling) size = band.minSize
  else if (cruising) size = band.maxSize

  // 불변 조건 3 — 어떤 계산 결과든 밴드 밖으로는 절대 못 나간다
  // (위 로직상 이미 보장되지만, 상수 튜닝 실수에도 안전하도록 이중 방어).
  size = Math.min(band.maxSize, Math.max(band.minSize, size))

  // 남은 단어보다 많이 시키지 않는다 — remaining >= 1이므로 결과도 >= 1.
  return Math.min(size, remaining)
}

// 남은 단어를 주어진 세션 크기로 나눴을 때 앞으로 몇 세션이 남는지.
// 적응형 크기가 세션마다 달라질 수 있으므로 이 값은 "현재 계획 기준
// 추정치"다 — N이 진행 중 약간 변하는 것은 설계상 허용(헤더 주석 참고).
export function planSessionCount(remainingWords, sessionSize) {
  const remaining = Math.max(0, Math.floor(Number(remainingWords)) || 0)
  if (remaining === 0) return 0
  const size = Math.max(1, Math.floor(Number(sessionSize)) || 1)
  return Math.ceil(remaining / size)
}

// "세션 K / N · 오늘 M / T 단어" 표시값 계산.
// - sessionsCompleted: 이번 실행에서 이미 완료한 세션 수
// - wordsCompleted: 오늘 목록에서 완료 위치까지의 단어 수(이어하기 오프셋 포함 가능)
// - totalWords: 배정 총량 T
// - plannedSessionSize: 현재(또는 직전) 계획된 세션 크기 — 남은 세션 수 추정용
// 불변 조건 4: 반환값은 항상 K <= N, 0 <= M <= T를 만족한다.
export function sessionProgressDisplay({ sessionsCompleted, wordsCompleted, totalWords, plannedSessionSize }) {
  const T = Math.max(0, Math.floor(Number(totalWords)) || 0)
  const M = Math.min(Math.max(0, Math.floor(Number(wordsCompleted)) || 0), T)
  const done = Math.max(0, Math.floor(Number(sessionsCompleted)) || 0)
  const K = done + 1
  const remaining = T - M
  let N = done + planSessionCount(remaining, plannedSessionSize)
  if (N < K) N = K // 절대 K > N을 렌더하지 않는다(전부 완료 직후 포함)
  return { sessionNumber: K, sessionCount: N, wordsCompleted: M, totalWords: T }
}
