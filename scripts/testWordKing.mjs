// Word King — 순수 함수 단위 테스트(scripts/testPaulRank.mjs와 같은 패턴).
// src/utils/wordKing.js는 React/import.meta.env/네트워크가 전혀 없는 순수
// 모듈이라 esbuild 번들 없이 Node에서 바로 import 가능(api/compute-word-
// king.js가 실제로도 이렇게 상대경로로 직접 import한다 — 이 테스트가 곧
// 서버가 쓰는 것과 100% 같은 소스를 검증).
import {
  WORD_KING_WEIGHTS, MIN_ACCURACY_SAMPLE, XP_SCORE_CAP,
  getWeekPeriod, computeCorrectedAccuracy, computeClassAverageAccuracy,
  computeXpScore, computeStudentWordKingScore, computeWeeklyWordKing,
  detectWordKingOutliers, isValidClassId,
} from '../src/utils/wordKing.js'

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

console.log('\n1. getWeekPeriod — 월요일 시작/일요일 종료, 결정적')
{
  // 2026-07-19는 일요일(달력 실측) — 그 주(월~일)는 2026-07-13(월) ~ 2026-07-19(일).
  const sunday = getWeekPeriod(new Date('2026-07-19T12:00:00Z'))
  check('일요일 -> 그 주 월요일 시작(07-13)', sunday.periodStart === '2026-07-13')
  check('일요일 -> 그 주 일요일 종료(자기 자신, 07-19)', sunday.periodEnd === '2026-07-19')

  const wednesday = getWeekPeriod(new Date('2026-07-15T03:00:00Z')) // 수요일
  check('수요일도 같은 주(07-13~07-19)로 계산', wednesday.periodStart === '2026-07-13' && wednesday.periodEnd === '2026-07-19')

  const a = getWeekPeriod(new Date('2026-07-15T00:00:00Z'))
  const b = getWeekPeriod(new Date('2026-07-15T23:59:59Z'))
  check('같은 날짜 안에서는 시각과 무관하게 같은 기간(날짜 단위 정밀도)', a.periodStart === b.periodStart && a.periodEnd === b.periodEnd)
}

console.log('\n2. computeCorrectedAccuracy — 소표본(작은 응시 수) 왜곡 보정(16.3, "학급 평균으로 완전 대체" 방식)')
{
  check('total=0 -> null(데이터 없음, 0%로 취급하지 않음)', computeCorrectedAccuracy(0, 0, 0.7) === null)
  check('total >= minSample -> 원본 비율 그대로', computeCorrectedAccuracy(9, 10, 0.5, 10) === 0.9)
  check('소표본(1/1=100%)은 원본 비율을 완전히 무시하고 학급 평균(0.7)으로 대체됨', computeCorrectedAccuracy(1, 1, 0.7, 10) === 0.7)
  check('소표본이면 응시 수(1 vs 9)와 무관하게 항상 학급 평균과 정확히 같음', computeCorrectedAccuracy(9, 9, 0.7, 10) === 0.7)
  check('score>total 같은 비정상 입력도 크래시 없이 1로 상한(대표본 경로)', computeCorrectedAccuracy(15, 10, 0.5, 10) === 1)
}

console.log('\n3. computeClassAverageAccuracy — pooled(전체 정답/전체 문항), 극단적 소표본에 왜곡되지 않음')
{
  const avg = computeClassAverageAccuracy([
    { accuracyCorrect: 45, accuracyTotal: 50 }, // 90%, 큰 표본
    { accuracyCorrect: 1, accuracyTotal: 1 },   // 100%, 소표본
  ])
  // pooled: (45+1)/(50+1) = 46/51 ≈ 0.902 — 산술평균(0.95)보다 큰 표본 쪽에 훨씬 가까움
  check('pooled 평균이 큰 표본(90%) 쪽에 가까움(산술평균 아님)', Math.abs(avg - 46 / 51) < 1e-9)
  check('활동 없는 반 -> 평균 0(division by zero 없음)', computeClassAverageAccuracy([]) === 0)
  check('전원 total=0 -> 평균 0', computeClassAverageAccuracy([{ accuracyTotal: 0 }, { accuracyTotal: 0 }]) === 0)
}

console.log('\n4. computeXpScore — 0~100 정규화, 상한 saturate')
{
  check('xp=0 -> 0점', computeXpScore(0) === 0)
  check(`xp=${XP_SCORE_CAP} -> 100점(정확히 상한)`, computeXpScore(XP_SCORE_CAP) === 100)
  check('상한 초과(xp=9999) -> 100 초과하지 않음(saturate)', computeXpScore(9999) === 100)
  check('음수/NaN도 크래시 없이 0으로 안전 처리', computeXpScore(-5) === 0 && computeXpScore(NaN) === 0)
}

console.log('\n5. computeStudentWordKingScore — 가중합 + eligible 판정')
{
  const s = computeStudentWordKingScore({ accuracyCorrect: 45, accuracyTotal: 50, xpEarned: 100 }, 0.9, WORD_KING_WEIGHTS, MIN_ACCURACY_SAMPLE)
  check('eligible: 활동 있음 -> true', s.eligible === true)
  check('accuracyComponent ≈ 90', Math.abs(s.accuracyComponent - 90) < 0.01)
  check('xpComponent = 100(xp=100=cap)', s.xpComponent === 100)
  const expectedScore = Math.round((WORD_KING_WEIGHTS.accuracy * 90 + WORD_KING_WEIGHTS.xp * 100) * 100) / 100
  check('score = 가중치*accuracyComponent + 가중치*xpComponent', Math.abs(s.score - expectedScore) < 0.02)

  const none = computeStudentWordKingScore({ accuracyCorrect: 0, accuracyTotal: 0, xpEarned: 0 }, 0.5)
  check('활동 전혀 없는 학생 -> eligible false, score 0', none.eligible === false && none.score === 0)

  const a = computeStudentWordKingScore({ accuracyCorrect: 8, accuracyTotal: 10, xpEarned: 20 }, 0.5)
  const b = computeStudentWordKingScore({ accuracyCorrect: 8, accuracyTotal: 10, xpEarned: 20 }, 0.5)
  check('결정적(deterministic) — 같은 입력이면 항상 같은 출력', JSON.stringify(a) === JSON.stringify(b))
}

console.log('\n6. computeWeeklyWordKing — 반 전체 랭킹, 16.3 소표본 왜곡 방지 회귀 케이스')
{
  // 핵심 회귀 시나리오(GAME_DESIGN.md 16.3 그대로, 3명 반): 소표본(1문제
  // 100%) 학생이 대표본(50문제 90%) 성실한 학생을 이겨서는 안 된다.
  // 3번째 학생(mediocre)을 함께 넣어 "학급 평균"이 diligent 한 명의
  // 점수와 우연히 같아지는 2인반 특수 케이스를 피하고, leave-one-out
  // 평균이 실제로 여러 학생의 데이터를 반영하는지도 함께 검증한다.
  const students = [
    { studentId: 'a-diligent', studentName: '성실한학생', accuracyCorrect: 45, accuracyTotal: 50, xpEarned: 20 },
    { studentId: 'b-lucky', studentName: '우연한학생', accuracyCorrect: 1, accuracyTotal: 1, xpEarned: 20 },
    { studentId: 'c-mediocre', studentName: '보통학생', accuracyCorrect: 30, accuracyTotal: 50, xpEarned: 5 },
  ]
  const result = computeWeeklyWordKing(students)
  check('소표본으로 우연히 100%를 받은 학생이 챔피언이 되지 않음', result.champion.studentId === 'a-diligent')
  const lucky = result.scores.find((s) => s.studentId === 'b-lucky')
  check('소표본 학생의 accuracyComponent가 100이 아니라 학급 평균(leave-one-out)으로 대체됨', lucky.accuracyComponent < 100 && lucky.accuracyComponent > 0)
  // leave-one-out: lucky를 제외한 나머지(a,c)의 pooled = (45+30)/(50+50) = 0.75 -> 75점
  check('leave-one-out 평균이 정확히 (45+30)/(50+50)=75%와 일치', Math.abs(lucky.accuracyComponent - 75) < 0.01)
  check('세 학생 모두 eligible(랭킹에 포함)', result.eligibleCount === 3)
  check('scores가 점수 내림차순으로 정렬됨', result.scores[0].score >= result.scores[1].score && result.scores[1].score >= result.scores[2].score)

  console.log('\n6b. 활동 전혀 없는 반 -> 챔피언 없음(우연한 1등 방지)')
  const empty = computeWeeklyWordKing([
    { studentId: 'x', studentName: 'X', accuracyCorrect: 0, accuracyTotal: 0, xpEarned: 0 },
    { studentId: 'y', studentName: 'Y', accuracyCorrect: 0, accuracyTotal: 0, xpEarned: 0 },
  ])
  check('전원 무활동 -> champion null', empty.champion === null)
  check('전원 무활동 -> eligibleCount 0', empty.eligibleCount === 0)

  console.log('\n6c. 빈 반(학생 0명) -> 크래시 없이 안전한 빈 결과')
  const nobody = computeWeeklyWordKing([])
  check('학생 배열이 비어도 크래시 없음', nobody.champion === null && nobody.scores.length === 0)

  console.log('\n6d. 동점 시 studentId로 결정적 tie-break(비결정적 요소 없음)')
  const tie = computeWeeklyWordKing([
    { studentId: 'zzz', studentName: 'Z', accuracyCorrect: 10, accuracyTotal: 10, xpEarned: 50 },
    { studentId: 'aaa', studentName: 'A', accuracyCorrect: 10, accuracyTotal: 10, xpEarned: 50 },
  ])
  check('완전 동점이면 studentId 사전순으로 결정적 tie-break', tie.champion.studentId === 'aaa')
  const tie2 = computeWeeklyWordKing([
    { studentId: 'zzz', studentName: 'Z', accuracyCorrect: 10, accuracyTotal: 10, xpEarned: 50 },
    { studentId: 'aaa', studentName: 'A', accuracyCorrect: 10, accuracyTotal: 10, xpEarned: 50 },
  ])
  check('재계산해도 항상 같은 챔피언(재현성)', tie2.champion.studentId === tie.champion.studentId)
}

console.log('\n7. detectWordKingOutliers — 16.6 이상치 표(관리자 조기 관측용)')
{
  const students = [
    { studentId: 'normal1', studentName: 'N1', xpEarned: 10, accuracyTotal: 10 },
    { studentId: 'normal2', studentName: 'N2', xpEarned: 12, accuracyTotal: 8 },
    { studentId: 'spike', studentName: 'Spike', xpEarned: 200, accuracyTotal: 9 }, // xp가 평균의 5배 이상
  ]
  const outliers = detectWordKingOutliers(students, { multiplier: 5 })
  check('비정상 급증(xp) 학생이 이상치로 감지됨', outliers.some((o) => o.studentId === 'spike' && o.metric === 'xpEarned'))
  check('정상 범위 학생은 이상치로 감지되지 않음', !outliers.some((o) => o.studentId === 'normal1'))

  check('활동 없는 반은 비교 자체를 스킵(division by zero 없음)', detectWordKingOutliers([{ studentId: 'x', xpEarned: 0, accuracyTotal: 0 }]).length === 0)
}

console.log('\n8. isValidClassId — UUID 형식만 허용')
{
  check('유효한 UUID -> true', isValidClassId('123e4567-e89b-12d3-a456-426614174000') === true)
  check('임의 문자열 -> false', isValidClassId('not-a-uuid') === false)
  check('null/undefined -> false(크래시 없음)', isValidClassId(null) === false && isValidClassId(undefined) === false)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
