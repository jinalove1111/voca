// src/utils/wordKing.js — Word King(주간·서버 전용 계산) 순수 함수 모듈.
// 2026-07-19. PROJECT_BOARD.md 게임화 하위카드 7번, GAME_DESIGN.md 5번
// 섹션(최초 설계) + 16.3(소표본 왜곡 보정)/16.6(이상치 표) 리뷰 반영.
//
// ⚠️ paulRankShared.js/ticketEconomy.js와 같은 이유로 완전히 순수해야
// 한다(React 없음, `import.meta.env` 없음, `window`/`document` 없음, 네트워크
// 없음) — api/compute-word-king.js가 상대경로로 그대로 import해서 서버에서
// 쓴다(entranceTest.js의 computeTestResult()를 submit-entrance-result.js가
// 재사용하는 것과 같은 이 저장소의 확립된 패턴).
//
// ── 설계 판단: GAME_DESIGN.md §5 원안에서 의도적으로 벗어난 점 ────────────
// 원안(§5)은 "① 입실시험 정확도 ② 쓰기시험 첫시도 정답률
// (spellingCorrect/spellingTotal) ③ mastered 단어 수(word_status)" 3개
// 신호의 가중합을 제안했다. 이번 구현은 ②③을 의도적으로 제외하고 ①
// (entrance_test_results — 이번 세션에 서버 재검증이 도입 완료됨)과
// xp_ledger 합계(행동 단위, 이미 서버 전용 쓰기, api/grant-xp.js) 2개
// 신호만 쓴다.
//
// 이유: 이번 작업 지시가 "점수 산정은 반드시 이미 서버에서 검증된 데이터만
// 사용해라", "새로운 클라이언트-신뢰 지점을 만들지 마라"를 명시했다.
// ②(실제로는 `student_daily_progress`가 아니라 `student_progress.
// calendar_data` — useStudent.js recordSpellingAnswer()가 로컬 history를
// 그대로 syncStudentProgress()로 업로드)와 ③(`word_status`)은 둘 다 anon
// `"allow anon all"` RLS로 학생 브라우저가 직접 쓰는 테이블/컬럼이다
// (GAME_DESIGN.md §11 Anti-cheat 자신이 이미 "부차적 갭"으로 지목한 값과
// 정확히 같다). 이 갭 위에 Word King 점수를 얹으면 "서버 전용 계산"이라는
// 이 기능의 핵심 전제가 갭을 그대로 상속해 깨진다 — XP 시스템이
// `total_xp` 재사용안을 버리고 독립 원장으로 새로 설계했던 것과 같은
// 종류의 판단이다(paulRankShared.js 헤더 참고, 선례 재사용). §11의 부차
// 갭이 나중에 해소되면 그때 ②③을 가중치로 추가하는 건 이 파일의 공식만
// 바꾸면 되므로(가중치 상수 + 입력 필드 추가) 스키마 변경 없이 가능하다.
//
// ── 16.3 리뷰 반영: 소표본(작은 응시 수) 왜곡 보정 ────────────────────────
// 입실시험 정확도도 spellingCorrect/spellingTotal과 같은 계열의 왜곡
// 위험이 있다 — 그 주에 시험을 1회만 봐서 우연히 만점을 받은 학생이,
// 여러 번 응시해 90%대를 꾸준히 유지한 학생보다 높은 점수를 받을 수
// 있다. `computeCorrectedAccuracy()`가 베이지안 평균(사전 확률 = 학급
// 평균 정확도, 응시 문항 수가 늘수록 실제 정확도로 수렴)으로 보정한다.
//
// ── 16.6 리뷰 반영: 이상치 표(부차 Anti-cheat 갭 조기 관측) ───────────────
// `detectWordKingOutliers()` — 서버 검증을 추가하지 않고도 관리자가 수동
// 트리거 결과 화면에서 "이번 주 유난히 튄 학생"을 눈으로 훑어볼 수 있는
// 저비용 완화책(신규 쿼리 없이 이미 집계한 값을 정렬만 다르게 보여줌).

// ── 1) 가중치/상수 — 이 파일 한 곳에서만 정의(GAME_DESIGN.md §2 인플레이션
// 방지 원칙과 같은 "숫자는 한 곳에만" 관례). 운영자가 실제 데이터를 보고
// 이 값만 조정하면 전체(계산/저장/표시)에 즉시 반영된다.
export const WORD_KING_WEIGHTS = Object.freeze({ accuracy: 0.6, xp: 0.4 })

// 16.3 — 이 문항 수 미만이면 학급 평균 쪽으로 shrink. GAME_DESIGN.md 16.3
// 예시("10문항 이상")를 그대로 채택.
export const MIN_ACCURACY_SAMPLE = 10

// XP축 점수는 0~100으로 정규화한다 — 이 주의 XP가 이 상한 이상이면 만점
// (100)으로 saturate시켜, 이례적으로 활동량이 극단적으로 큰 학생 한 명이
// XP축 전체를 지배하지 않게 한다(예: 매크로/부정 사용 의심 케이스가
// 있어도 점수 영향은 유계됨 — §11 "레이트리밋 일반화" 정신과 같은 방향).
export const XP_SCORE_CAP = 100

// ── 2) 주간 기간(period) 계산 — 월요일 시작, 일요일 종료(ISO 주 관례).
// 서버(Vercel, UTC 근방)와 학생 타임존(KST)의 미세한 경계 차이는
// paulRankShared.js의 day 기간키(±2일 허용)와 같은 이유로 여기서도
// "날짜 단위" 정밀도까지만 다룬다(초 단위 경계 다툼은 이 기능의 위협모델
// 밖 — 학원 내부 주간 랭킹이라 하루 이틀 경계 오차가 실질적 이득으로
// 이어지지 않음).
function toIsoDateStr(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function getWeekPeriod(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = d.getUTCDay() // 0=일 ... 6=토
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return { periodStart: toIsoDateStr(monday), periodEnd: toIsoDateStr(sunday) }
}

// ── 3) 소표본 보정 정확도 ────────────────────────────────────────────────
// total===0 -> null(이 학생은 이번 주 입실시험 신호가 아예 없음 — 0%가
// 아니라 "데이터 없음"으로 구분해야 "시험을 안 봤는데 0점 취급돼 감점"
// 되는 왜곡을 피한다).
//
// GAME_DESIGN.md 16.3은 두 방법을 제안했다 — "① 최소 임계값 미달 시 0
// 또는 학급 평균으로 대체, ② 베이지안 가중 평균(원본 비율과 학급 평균을
// 표본 크기에 비례해 블렌딩)". 이번 구현은 ①(학급 평균으로 완전 대체)을
// 택했다 — ②를 먼저 구현해 실측 테스트(scripts/testWordKing.mjs 6번
// 케이스: "1문제 풀어 100%인 학생 vs 50문제 풀어 90%인 성실한 학생")로
// 검증한 결과, 응시 수가 극소(1~2문항)일 때는 블렌딩 가중치가 아무리
// 작아도 100% 같은 극단값이 조금이라도 섞이면 "소표본 학생이 학급
// 평균보다 낮거나 같아야 한다"는 이 보정의 목적 자체가 흔들릴 수 있음을
// 직접 확인했다(90% 성실 학생을 91%로 여전히 앞서는 결과가 나왔음). 완전
// 대체는 참여 자체는 인정(0점이 아니라 학급 평균 점수를 받음)하면서도
// 소표본 우연값의 영향을 완전히 제거하므로 이 기능의 핵심 요구사항
// ("소표본 왜곡 방지")에 더 정확히 부합한다.
export function computeCorrectedAccuracy(correct, total, classAverage, minSample = MIN_ACCURACY_SAMPLE) {
  const c = Math.max(0, Number(correct) || 0)
  const t = Math.max(0, Number(total) || 0)
  if (t <= 0) return null
  if (t >= minSample) return Math.min(1, c / t) // score<=total이 정상이지만 방어적으로 상한
  return Number.isFinite(classAverage) ? Math.min(1, Math.max(0, classAverage)) : 0
}

// 전체 학생 pooled(전체 정답/전체 문항) 정확도 — 내부 헬퍼. 단순 평균
// (학생별 비율의 산술평균)이 아니라 pooled를 쓰는 이유: 학생 수가 적은
// 반에서 극단적 소표본 학생 한 명의 비율이 "평균"에 과대 영향을 주지
// 않게 하기 위함(사전확률 자체가 왜곡되면 보정의 의미가 없어짐).
function poolAccuracy(students) {
  let sumCorrect = 0
  let sumTotal = 0
  for (const s of students || []) {
    const t = Math.max(0, Number(s?.accuracyTotal) || 0)
    if (t <= 0) continue
    sumCorrect += Math.max(0, Number(s?.accuracyCorrect) || 0)
    sumTotal += t
  }
  return { sumCorrect, sumTotal }
}

// 반 전체 정확도(표시용 통계) — computeWeeklyWordKing 내부는 이 함수를
// 그대로 쓰지 않고 "본인을 제외한" leave-one-out 버전을 쓴다(아래 참고,
// 자기 자신의 소표본 극단값이 자신의 보정 기준 자체를 오염시키는 것을
// 방지하기 위함) — 이 함수는 관리자 화면에 보여줄 "학급 평균" 숫자
// 하나를 계산할 때만 쓰인다.
export function computeClassAverageAccuracy(students) {
  const { sumCorrect, sumTotal } = poolAccuracy(students)
  return sumTotal > 0 ? Math.min(1, sumCorrect / sumTotal) : 0
}

// XP -> 0~100 정규화(상한 saturate).
export function computeXpScore(xpEarned, cap = XP_SCORE_CAP) {
  const xp = Math.max(0, Number(xpEarned) || 0)
  if (cap <= 0) return 0
  return Math.min(100, (xp / cap) * 100)
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ── 4) 학생 1명의 최종 점수 ──────────────────────────────────────────────
// eligible: 이번 주 신호가 하나도 없는 학생(입실시험 미응시 + XP 0)은
// score=0으로 순위에 끼워넣지 않는다 — "그 주 활동이 거의 없는 학생이
// 우연히 1등이 되는 것을 방지"하라는 지시의 직접 구현(전원이 0점인 반은
// 챔피언 없음으로 처리, 아래 computeWeeklyWordKing 참고).
export function computeStudentWordKingScore(input, classAverageAccuracy, weights = WORD_KING_WEIGHTS, minSample = MIN_ACCURACY_SAMPLE) {
  const accuracyCorrect = Math.max(0, Number(input?.accuracyCorrect) || 0)
  const accuracyTotal = Math.max(0, Number(input?.accuracyTotal) || 0)
  const xpEarned = Math.max(0, Number(input?.xpEarned) || 0)

  const correctedAccuracy = computeCorrectedAccuracy(accuracyCorrect, accuracyTotal, classAverageAccuracy, minSample)
  const accuracyComponent = correctedAccuracy === null ? 0 : correctedAccuracy * 100
  const xpComponent = computeXpScore(xpEarned)
  const score = round2(weights.accuracy * accuracyComponent + weights.xp * xpComponent)
  const eligible = accuracyTotal > 0 || xpEarned > 0

  return {
    accuracyCorrect,
    accuracyTotal,
    xpEarned,
    correctedAccuracy,
    accuracyComponent: round2(accuracyComponent),
    xpComponent: round2(xpComponent),
    score,
    eligible,
  }
}

// ── 5) 반 전체 주간 계산 — 이 파일의 진입점, api/compute-word-king.js가
// 직접 호출. 결정적(deterministic): 같은 입력이면 항상 같은 champion/순위
// (동점 시 studentId 문자열 비교로 tie-break — Math.random 등 비결정적
// 요소 전혀 없음, 서버 재계산 재현성 보장).
export function computeWeeklyWordKing(students, options = {}) {
  const weights = options.weights || WORD_KING_WEIGHTS
  const minSample = options.minSample ?? MIN_ACCURACY_SAMPLE
  const list = Array.isArray(students) ? students : []

  // 표시용 학급 평균(전체 pooled) — 응답에 그대로 반환해 관리자 화면에
  // "학급 평균 정확도"로 보여준다.
  const { sumCorrect: totalCorrect, sumTotal: totalTotal } = poolAccuracy(list)
  const classAverageAccuracy = totalTotal > 0 ? Math.min(1, totalCorrect / totalTotal) : 0

  // 보정 기준(prior)은 "본인을 제외한" leave-one-out 평균을 쓴다 — 소표본
  // 학생 본인의 극단값이 그 학생 자신의 보정 기준을 오염시키는 걸 막기
  // 위함(학생 수가 적은 반일수록 이 자기오염 효과가 커진다 — 예를 들어
  // 2명뿐인 반에서 소표본 학생을 포함해 평균을 내면 그 학생 자신의
  // 극단값이 평균 절반을 차지해 보정이 사실상 무력화된다. 실측 확인:
  // scripts/testWordKing.mjs 6번 케이스).
  const scored = list.map((s) => {
    const t = Math.max(0, Number(s?.accuracyTotal) || 0)
    const c = Math.max(0, Number(s?.accuracyCorrect) || 0)
    let priorAvg = classAverageAccuracy
    if (t > 0 && totalTotal - t > 0) priorAvg = Math.min(1, (totalCorrect - c) / (totalTotal - t))
    else if (t > 0) priorAvg = 0 // 본인 말고는 이번 주 응시 데이터가 아무도 없음 — 비교 기준이 없으므로 중립값
    return {
      studentId: s.studentId,
      studentName: s.studentName || '',
      ...computeStudentWordKingScore(s, priorAvg, weights, minSample),
    }
  })

  const sortFn = (a, b) => b.score - a.score || String(a.studentId).localeCompare(String(b.studentId))
  const eligible = scored.filter((s) => s.eligible).sort(sortFn)
  const ineligible = scored.filter((s) => !s.eligible)

  // rank는 eligible 학생에게만 부여(1부터) — 활동이 아예 없는 학생은
  // 순위 자체가 없다(0등/꼴찌로 낙인 찍지 않음, GAME_DESIGN.md §12
  // Retention Psychology "하위권 개인 공개 망신 방지" 원칙과 같은 방향).
  const ranked = eligible.map((s, i) => ({ ...s, rank: i + 1 }))
  const champion = ranked[0] || null

  return {
    classAverageAccuracy: round2(classAverageAccuracy * 100),
    champion,
    scores: [...ranked, ...ineligible.map((s) => ({ ...s, rank: null }))],
    eligibleCount: ranked.length,
  }
}

// ── 6) 16.6 이상치 표 — 관리자가 눈으로 훑어볼 저비용 완화책(신규 쿼리
// 없음, 이미 집계한 값을 정렬만 다르게). "본인을 제외한" 나머지 학생
// 평균(leave-one-out, computeWeeklyWordKing과 같은 이유 — 본인의 극단값이
// 자신의 비교 기준을 오염시키지 않게)의 multiplier배를 초과하면 표시.
// 비교할 다른 학생이 없으면(그 지표에 값이 있는 학생이 1명뿐) 스킵.
export function detectWordKingOutliers(students, options = {}) {
  const multiplier = options.multiplier ?? 5
  const list = Array.isArray(students) ? students : []
  const metrics = ['xpEarned', 'accuracyTotal']
  const outliers = []

  for (const metric of metrics) {
    const values = list.map((s) => Math.max(0, Number(s?.[metric]) || 0))
    const withDataIdx = values.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)
    if (withDataIdx.length < 2) continue
    const sum = withDataIdx.reduce((a, i) => a + values[i], 0)
    withDataIdx.forEach((i) => {
      const v = values[i]
      const avgExcludingSelf = (sum - v) / (withDataIdx.length - 1)
      if (avgExcludingSelf > 0 && v > avgExcludingSelf * multiplier) {
        outliers.push({
          studentId: list[i].studentId,
          studentName: list[i].studentName || '',
          metric,
          value: v,
          classAverage: round2(avgExcludingSelf),
          multiple: round2(v / avgExcludingSelf),
        })
      }
    })
  }
  return outliers
}

// ── 7) 입력 검증(서버 공유) — submit-entrance-result.js/grant-xp.js와 같은
// UUID 형식 검증 관례를 이 파일 안에서 자체 보유(entranceTest.js/
// weeklyReport.js처럼 "다른 파일에 굳이 결합하지 않고 작은 정규식은 각자
// 보유"하는 이 저장소 관례 재사용).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isValidClassId(id) {
  return typeof id === 'string' && UUID_RE.test(id)
}
