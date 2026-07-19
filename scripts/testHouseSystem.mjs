// House System — 순수 함수 단위 테스트(scripts/testTicketEconomy.mjs와
// 같은 패턴). src/utils/houseSystem.js는 React/import.meta.env/네트워크가
// 전혀 없는 순수 모듈이라 esbuild 번들 없이 Node에서 바로 import 가능.
import {
  HOUSES, getHouseById,
  assignBalancedHouseId, computeHouseCounts,
  getWeekPeriod, computeHouseWeeklyScores, getOwnHouseWeeklyDisplay,
  WEEKLY_EVENT_TYPES,
} from '../src/utils/houseSystem.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. HOUSES / getHouseById — 고정 4개, id 1~4')
{
  check('HOUSES 4개', HOUSES.length === 4)
  check('id가 1~4 연속', HOUSES.map(h => h.id).join(',') === '1,2,3,4')
  check('getHouseById(1)이 첫 하우스', getHouseById(1) === HOUSES[0])
  check('getHouseById(99)는 null(존재하지 않는 id)', getHouseById(99) === null)
  check('getHouseById(null)/getHouseById(undefined)도 안전하게 null', getHouseById(null) === null && getHouseById(undefined) === null)
  check('문자열 id("2")도 숫자로 변환해 조회', getHouseById('2')?.id === 2)
  check('각 항목이 freeze되어 있음(실수로 mutate 방지)', Object.isFrozen(HOUSES) && Object.isFrozen(HOUSES[0]))
}

console.log('\n2. assignBalancedHouseId — 라운드로빈 균형, 동률은 id 오름차순 결정론')
{
  check('빈 counts는 id 1부터 채움', assignBalancedHouseId({}) === 1)
  check('id 1만 많으면 id 2 배정', assignBalancedHouseId({ 1: 10, 2: 0, 3: 0, 4: 0 }) === 2)
  check('전부 동률이면 가장 작은 id(1) — 결정론(난수 없음)', assignBalancedHouseId({ 1: 5, 2: 5, 3: 5, 4: 5 }) === 1)
  check('id 1,2,3 동률로 많고 4만 적으면 4 배정', assignBalancedHouseId({ 1: 9, 2: 9, 3: 9, 4: 3 }) === 4)
  // 실제 배정 흐름 재현: 20명을 순서대로 배정하면 최종 인원이 균형(±1 이내)에 수렴하는지.
  {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (let i = 0; i < 20; i++) {
      const id = assignBalancedHouseId(counts)
      counts[id] += 1
    }
    const values = Object.values(counts)
    check('20명 배정 후 4개 하우스 전부 정확히 5명씩(완전 균형)', values.every(v => v === 5))
  }
  // 21명(4로 안 나눠떨어짐) — 최대-최소 차이가 1을 넘지 않아야 함.
  {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (let i = 0; i < 21; i++) {
      const id = assignBalancedHouseId(counts)
      counts[id] += 1
    }
    const values = Object.values(counts)
    check('21명 배정 후 최대-최소 차이 <= 1(균형 유지)', Math.max(...values) - Math.min(...values) <= 1)
  }
}

console.log('\n3. computeHouseCounts — students 배열에서 houseId별 카운트')
{
  const counts = computeHouseCounts([{ houseId: 1 }, { houseId: 1 }, { houseId: 3 }])
  check('houseId 1은 2명', counts[1] === 2)
  check('houseId 2는 0명(명시적으로 0)', counts[2] === 0)
  check('houseId 3은 1명', counts[3] === 1)
  check('houseId 4는 0명', counts[4] === 0)
  check('빈 배열/null/undefined도 안전(전부 0)', Object.values(computeHouseCounts([])).every(v => v === 0) && Object.values(computeHouseCounts(null)).every(v => v === 0))
  check('houseId가 null/미배정인 학생은 카운트에서 제외', computeHouseCounts([{ houseId: null }, { houseId: undefined }, {}])[1] === 0)
}

console.log('\n4. getWeekPeriod — 월요일 시작/일요일 종료(ISO 주)')
{
  // 2026-07-19는 일요일(달력 확인) — 그 주의 월요일은 2026-07-13.
  const sunday = new Date('2026-07-19T12:00:00Z')
  const { periodStart, periodEnd } = getWeekPeriod(sunday)
  check('일요일 기준 주 시작이 그 주 월요일(2026-07-13)', periodStart === '2026-07-13')
  check('일요일 기준 주 종료가 자기 자신(2026-07-19)', periodEnd === '2026-07-19')
  // 화요일(2026-07-14) 기준도 같은 주여야 함.
  const tuesday = new Date('2026-07-14T03:00:00Z')
  const period2 = getWeekPeriod(tuesday)
  check('같은 주의 다른 요일도 같은 periodStart/End', period2.periodStart === '2026-07-13' && period2.periodEnd === '2026-07-19')
}

console.log('\n5. computeHouseWeeklyScores — 양수 delta(획득)만 그 주 범위로 합산, 소비(음수)는 제외')
{
  const now = new Date('2026-07-19T12:00:00Z') // 주: 2026-07-13 ~ 2026-07-19
  const students = [
    { id: 's1', houseId: 1 },
    { id: 's2', houseId: 1 },
    { id: 's3', houseId: 2 },
  ]
  const ledgerByStudentId = {
    s1: [
      { id: 'a', delta: 1, at: '2026-07-14T00:00:00.000Z' }, // 이번 주, 획득
      { id: 'b', delta: -1, at: '2026-07-14T01:00:00.000Z' }, // 이번 주, 소비 — 제외돼야 함
    ],
    s2: [
      { id: 'c', delta: 2, at: '2026-07-10T00:00:00.000Z' }, // 지난 주 — 제외돼야 함
      { id: 'd', delta: 1, at: '2026-07-19T00:00:00.000Z' }, // 이번 주, 획득
    ],
    s3: [
      { id: 'e', delta: 5, at: '2026-07-15T00:00:00.000Z' }, // 이번 주, 획득(하우스 2)
    ],
  }
  const scores = computeHouseWeeklyScores(students, ledgerByStudentId, now)
  check('하우스 1 점수 = s1의 획득(1) + s2의 이번 주 획득(1) = 2(소비/지난주 제외)', scores[1] === 2)
  check('하우스 2 점수 = 5', scores[2] === 5)
  check('학생이 없는 하우스 3/4는 0', scores[3] === 0 && scores[4] === 0)
  check('결과에 HOUSES의 모든 id가 키로 존재', Object.keys(scores).length === 4)

  check('원장이 배열이 아니거나 학생 목록이 비어도 크래시 없이 전부 0', Object.values(computeHouseWeeklyScores([], {}, now)).every(v => v === 0))
  check('houseId 미배정 학생은 집계에서 제외(크래시 없음)', computeHouseWeeklyScores([{ id: 'x', houseId: null }], { x: [{ id: 'z', delta: 1, at: now.toISOString() }] }, now)[1] === 0)
}

console.log('\n6. getOwnHouseWeeklyDisplay — 학생 화면 최소 표시 전용(개인/타하우스 비교 없음)')
{
  const now = new Date('2026-07-19T12:00:00Z')
  const students = [{ id: 's1', houseId: 1 }, { id: 's2', houseId: 2 }]
  const ledgerByStudentId = { s1: [{ id: 'a', delta: 3, at: '2026-07-14T00:00:00.000Z' }] }
  const display = getOwnHouseWeeklyDisplay('s1', students, ledgerByStudentId, now)
  check('본인 하우스 정보 반환', display?.house?.id === 1)
  check('본인 하우스의 이번 주 점수만 반환(다른 하우스 점수는 노출 안 함 — 반환 shape에 house/weeklyScore 2개 필드만)', Object.keys(display).sort().join(',') === 'house,weeklyScore' && display.weeklyScore === 3)
  check('하우스 미배정 학생은 null', getOwnHouseWeeklyDisplay('nope', students, ledgerByStudentId, now) === null)
  const noHouseStudents = [{ id: 's9', houseId: null }]
  check('houseId가 null인 학생도 null', getOwnHouseWeeklyDisplay('s9', noHouseStudents, {}, now) === null)
}

console.log('\n7. WEEKLY_EVENT_TYPES — 설정 슬롯만(콘텐츠 0개, 확장 가능한 구조)')
{
  check('빈 배열(이번 라운드는 실제 이벤트 정의 없음)', Array.isArray(WEEKLY_EVENT_TYPES) && WEEKLY_EVENT_TYPES.length === 0)
  check('freeze되어 있음(실수로 mutate 방지)', Object.isFrozen(WEEKLY_EVENT_TYPES))
}

console.log(failures === 0 ? '\nHouse System: ALL PASS' : `\nHouse System: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
