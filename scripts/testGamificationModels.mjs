// scripts/testGamificationModels.mjs — 게임화 순수 모델 단위 테스트
// (2026-08-09 야간 5차). dailyMissionModel/streakModel — import 0 순수 모듈이라
// 플레인 Node ESM으로 직접 로드(네트워크/DB 0회).
import { buildDailyMissions, DEFAULT_TARGET_WORDS } from '../src/utils/gamification/dailyMissionModel.js'
import { computeStreak, isQualifiedDay, MILESTONES } from '../src/utils/gamification/streakModel.js'

let passed = 0, failed = 0
const failures = []
const check = (n, c) => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}`) } }

console.log('\n=== dailyMissionModel ===')
{
  const r = buildDailyMissions({ assignedWordCount: 10, learnedWordCount: 10, quizDone: true, writingDone: true, unknownTotal: 3, unknownRetried: 1 })
  check('전 미션 완료 → allDone', r.allDone === true && r.doneCount === 4 && r.total === 4)
}
{
  const r = buildDailyMissions({ assignedWordCount: null, learnedWordCount: 5, quizDone: false, writingDone: false, unknownTotal: 0, unknownRetried: 0 })
  check(`배정 없으면 기본 목표 ${DEFAULT_TARGET_WORDS}단어`, r.missions[0].label.includes(String(DEFAULT_TARGET_WORDS)))
  check('단어 5/20 → 미완료 + 진행 표시', r.missions[0].done === false && r.missions[0].progressText === '5/20')
  check('unknown 0개 → "오늘은 없음!" 자동 달성(불가능 미션 금지)', r.missions[3].done === true && r.missions[3].progressText === '오늘은 없음!')
  check('부분 완료 카운트 정확(1/4)', r.doneCount === 1 && r.allDone === false)
}
{
  const r = buildDailyMissions({ assignedWordCount: 20, learnedWordCount: 25, quizDone: true, writingDone: false, unknownTotal: 5, unknownRetried: 0 })
  check('초과 학습은 목표에서 캡(20/20)', r.missions[0].progressText === '20/20' && r.missions[0].done === true)
  check('unknown 대기 표시', r.missions[3].progressText.includes('5개'))
}
check('빈 입력 크래시 없음', (() => { try { return buildDailyMissions(null).total === 4 } catch { return false } })())

console.log('\n=== streakModel — 인정일 판정 ===')
check('categories_completed ≥ 1 → 인정', isQualifiedDay({ categories_completed: 1, quiz_correct: 0 }) === true)
check('퀴즈 정답 ≥ 10 → 인정', isQualifiedDay({ categories_completed: 0, quiz_correct: 10 }) === true)
check('접속만(둘 다 0) → 불인정', isQualifiedDay({ categories_completed: 0, quiz_correct: 3 }) === false)

console.log('\n=== streakModel — 연속 계산 ===')
{
  const r = computeStreak(['2026-08-05', '2026-08-06', '2026-08-07'], '2026-08-07')
  check('3일 연속(오늘 포함) → current 3, todayQualified', r.current === 3 && r.todayQualified === true)
  check('best ≥ current', r.best >= 3)
  check('다음 마일스톤 7일(remaining 4)', r.nextMilestone?.day === 7 && r.nextMilestone?.remaining === 4)
}
{
  // 하루 공백 — 주중 freeze 1회로 보호(8/6 공백)
  const r = computeStreak(['2026-08-04', '2026-08-05', '2026-08-07'], '2026-08-07')
  check('주중 하루 공백 → freeze로 보호(current 3, 공백일 미포함)', r.current === 3)
  check('freeze 사용일 기록(2026-08-06)', r.freezesUsed.includes('2026-08-06'))
}
{
  // 같은 주에 공백 2일 — 첫 공백(8/6)만 freeze, 두 번째 공백(8/4)에서 끊김.
  // freeze 일은 streak 수에 미포함이므로 current = 8/7 + 8/5 = 2.
  const r = computeStreak(['2026-08-03', '2026-08-05', '2026-08-07'], '2026-08-07')
  check('같은 주 공백 2회 → 두 번째에서 끊김(current 2 = 8/7+8/5, freeze일 미포함)', r.current === 2)
}
{
  // 오늘 아직 미학습 — 어제까지의 streak 유지 표시(오늘 하면 이어짐)
  const r = computeStreak(['2026-08-05', '2026-08-06'], '2026-08-07')
  check('오늘 미학습 → todayQualified false, current는 어제 기준 2', r.todayQualified === false && r.current === 2)
}
{
  // 완전 공백 2일 이상 → current 0, best는 과거 기록 보존
  const r = computeStreak(['2026-08-01', '2026-08-02', '2026-08-03'], '2026-08-07')
  check('오래 쉬면 current 0', r.current === 0)
  check('best 3 보존(끊겨도 자산 유지 — 좌절 방지)', r.best === 3)
}
{
  // 연속 공백 2일(8/9 일+8/10 월)은 주가 달라도 브리지 불가 — 끊김(설계:
  // freeze는 "하루" 공백만, 연속 공백은 보호 안 함).
  const r = computeStreak(['2026-08-07', '2026-08-08', '2026-08-11'], '2026-08-11')
  check('연속 공백 2일은 주가 달라도 끊김(current 1)', r.current === 1)
}
{
  // 주 경계 freeze 재충전: 비연속 공백 2회(8/9 일 = 그 주 freeze, 8/11 화 =
  // 새 주 freeze) — 각각 보호되어 streak 유지.
  const r = computeStreak(['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-10', '2026-08-12'], '2026-08-12')
  check('주가 바뀌면 freeze 재충전(비연속 공백 2회 각각 보호, current 6)', r.current === 6 && r.freezesUsed.length === 2)
}
check('빈 이력 크래시 없음 + current 0', (() => { try { const r = computeStreak([], '2026-08-07'); return r.current === 0 && r.best === 0 && r.nextMilestone.day === MILESTONES[0] } catch { return false } })())
check('중복 날짜 무해(멱등)', computeStreak(['2026-08-07', '2026-08-07'], '2026-08-07').current === 1)

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  gamification-models (${passed}개 단언, 네트워크 0)`); process.exit(0) }
console.log(`  FAIL  gamification-models — ${failed}건: ${failures.join(', ')}`)
process.exit(1)
