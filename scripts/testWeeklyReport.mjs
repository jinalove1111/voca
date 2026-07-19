// Verifies buildWeeklyReport() (src/utils/weeklyReport.js) — pure template
// logic, no AI/network involved (project standard: no paid-API text
// generation). Zero dependencies, so it's importable directly, no bundling
// or stubbing needed.
//
// Parent Motivation(2026-07-19, 게임화 하위카드 10번) — computeStudentStats
// 도 여기서 함께 검증한다(별도 스크립트 없음, 이 파일이 weeklyReport.js
// 전체를 다루는 유일한 하네스). 새 3번째 인자(houseId)/새 반환 필드
// (ticketBalance/house)만 검증 — 기존 반환 필드는 위 1~3번 시나리오가 이미
// 값을 안 바꿨음을 증명한다(테스트 문자열 그대로 PASS).
import { buildWeeklyReport, computeStudentStats } from '../src/utils/weeklyReport.js'

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

console.log('\n4. computeStudentStats() — 기존 호출부(houseId 없이 2개 인자만)는 완전히 그대로')
{
  const r = { studentId: 's1', dailyRows: [], progress: { total_stars: 10 } }
  const stats = computeStudentStats(r, {})
  check('houseId 안 넘겨도 크래시 없음', stats.house === null)
  check('progress_data 없으면 ticketBalance 0', stats.ticketBalance === 0)
  check('기존 필드(ws) 그대로 존재', stats.ws.known === 0 && stats.ws.unknown === 0)
}

console.log('\n5. computeStudentStats() — 티켓 잔액은 progress_data.ticketLedger에서 새 쿼리 없이 파생')
{
  const r = {
    studentId: 's2', dailyRows: [],
    progress: { total_stars: 10, progress_data: { ticketLedger: [{ id: 'a', delta: 5, at: '2026-07-01T00:00:00Z' }, { id: 'b', delta: -2, at: '2026-07-02T00:00:00Z' }] } },
  }
  const stats = computeStudentStats(r, {})
  check('ticketLedger 합산(5-2=3)', stats.ticketBalance === 3)
}

console.log('\n6. computeStudentStats() — houseId를 3번째 인자로 넘기면 house 파생(HOUSES 상수 재사용, 새 로직 복붙 없음)')
{
  const r = { studentId: 's3', dailyRows: [], progress: null }
  const stats1 = computeStudentStats(r, {}, 2)
  check('houseId=2 → 블루 하우스로 정확히 파생', stats1.house?.name === '블루 하우스')
  const stats2 = computeStudentStats(r, {}, null)
  check('houseId=null → house는 null(미배정)', stats2.house === null)
  const stats3 = computeStudentStats(r, {}, 999)
  check('알 수 없는 houseId → 크래시 없이 null', stats3.house === null)
}

console.log('\n7. buildWeeklyReport() — ticketBalance/house 안 넘기면(기존 호출부) 출력 완전히 그대로')
{
  const base = {
    name: '테스트학생', last7: [], quizAccuracy: null, quizCorrect: 0, quizTotal: 0, pronAttempts: 0,
    progress: null, topMissed: [], wordLookup: {},
  }
  const withoutGrowth = buildWeeklyReport(base)
  check('성장 섹션 헤더 없음(기존 호출부 회귀 없음)', !withoutGrowth.includes('🌱 성장 현황'))
}

console.log('\n8. buildWeeklyReport() — house/ticketBalance 있으면 성장 섹션 조건부 추가(순위/경쟁 언급 없음)')
{
  const report = buildWeeklyReport({
    name: '테스트학생', last7: [], quizAccuracy: null, quizCorrect: 0, quizTotal: 0, pronAttempts: 0,
    progress: null, topMissed: [], wordLookup: {},
    ticketBalance: 12, house: { id: 3, name: '그린 하우스', emoji: '🟢', colorHex: '#22c55e' },
  })
  check('성장 섹션 헤더 포함', report.includes('🌱 성장 현황'))
  check('하우스 소속 문장 포함', report.includes('그린 하우스 소속으로 함께 하고 있어요'))
  check('티켓 잔액 문장 포함', report.includes('지금까지 모은 티켓: 12개'))
  check('등수/순위/경쟁 단어 없음(압박 방지 원칙)', !report.includes('등수') && !report.includes('순위') && !report.includes('1등'))
}

console.log('\n9. buildWeeklyReport() — ticketBalance가 0이면 티켓 줄은 안 생김(house만 있어도 섹션은 뜸)')
{
  const report = buildWeeklyReport({
    name: '테스트학생', last7: [], quizAccuracy: null, quizCorrect: 0, quizTotal: 0, pronAttempts: 0,
    progress: null, topMissed: [], wordLookup: {},
    ticketBalance: 0, house: { id: 1, name: '레드 하우스', emoji: '🔴', colorHex: '#ef4444' },
  })
  check('성장 섹션은 뜸(house만 있어도)', report.includes('🌱 성장 현황'))
  check('티켓 0개면 티켓 줄은 안 생김', !report.includes('모은 티켓'))
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
