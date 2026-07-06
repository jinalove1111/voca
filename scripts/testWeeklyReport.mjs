// Verifies buildWeeklyReport() (src/utils/weeklyReport.js) — pure template
// logic, no AI/network involved (project standard: no paid-API text
// generation). Zero dependencies, so it's importable directly, no bundling
// or stubbing needed.
import { buildWeeklyReport } from '../src/utils/weeklyReport.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. 잘한 점: 숙제 매일 완료 + 높은 정답률')
{
  const report = buildWeeklyReport({
    name: '테스트학생',
    last7: Array.from({ length: 7 }, (_, i) => ({ date: `2026-07-0${i + 1}`, categories_completed: 4 })),
    quizAccuracy: 90, quizCorrect: 18, quizTotal: 20, pronAttempts: 15,
    progress: { streak: 10, total_stars: 500, cleared_count: 40 },
    topMissed: [], wordLookup: {},
  })
  check('학생 이름 포함', report.includes('테스트학생'))
  check('숙제 완료 7/7일 언급', report.includes('7/7일'))
  check('연속 10일 칭찬 포함', report.includes('연속 10일째 꾸준히'))
  check('정답률 90% 칭찬 포함', report.includes('90%로 아주 높아요'))
  check('부족한 점에 기본 문구(특별히 부족한 점 없음) 포함', report.includes('특별히 부족한 점은 없어요'))
}

console.log('\n2. 부족한 점: 숙제 미완료 + 낮은 정답률 + 자주 틀린 단어')
{
  const report = buildWeeklyReport({
    name: '테스트학생2',
    last7: [
      { date: '2026-07-01', categories_completed: 4 },
      { date: '2026-07-02', categories_completed: 0 },
      { date: '2026-07-03', categories_completed: 2 },
    ],
    quizAccuracy: 40, quizCorrect: 4, quizTotal: 10, pronAttempts: 2,
    progress: { streak: 1, total_stars: 30, cleared_count: 3 },
    topMissed: [['apple', 5], ['banana', 3]],
    wordLookup: { apple: { word: 'apple' }, banana: { word: 'banana' } },
  })
  check('숙제 완료 1/3일 언급', report.includes('1/3일'))
  check('미완료일수 언급 (안 한 날이 2일)', report.includes('안 한 날이 2일'))
  check('정답률 개선 필요 문구 포함', report.includes('40%'))
  check('자주 틀리는 단어 이름(apple, banana) 포함', report.includes('apple') && report.includes('banana'))
}

console.log('\n3. 기록이 아예 없는 학생 (동기화 전) — 크래시 없이 처리')
{
  const report = buildWeeklyReport({
    name: '신규학생', last7: [], quizAccuracy: null, quizCorrect: 0, quizTotal: 0, pronAttempts: 0,
    progress: null, topMissed: [], wordLookup: {},
  })
  check('기록 없어도 문자열 생성됨 (크래시 없음)', typeof report === 'string' && report.length > 0)
  check('퀴즈 기록 없음 문구 포함', report.includes('퀴즈: 최근 기록 없음'))
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
