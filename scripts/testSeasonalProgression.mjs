// Seasonal Progression — 순수 함수 단위 테스트(scripts/testHouseSystem.mjs/
// testTicketEconomy.mjs와 같은 패턴). ticketEconomy.js의 sumTicketBalanceSince
// / houseSystem.js의 computeHouseSeasonScores는 둘 다 React/import.meta.env/
// 네트워크가 전혀 없는 순수 함수라 esbuild 번들 없이 Node에서 바로 import
// 가능. 가장 중요한 회귀 방지 포인트(GAME_DESIGN.md 9번 섹션 원칙): 시즌
// 경계 전/후 데이터가 정확히 분리되고, 레벨/뱃지/스트릭류 값은 이 두
// 함수가 애초에 다루지도 않는다는 것(=구조적으로 절대 안 바뀜)을 함께
// 확인한다.
import { sumTicketBalance, sumTicketBalanceSince } from '../src/utils/ticketEconomy.js'
import { HOUSES, computeHouseWeeklyScores, computeHouseSeasonScores } from '../src/utils/houseSystem.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. sumTicketBalanceSince — 시즌 경계 이후 항목만 합산(원장은 그대로, 파생 계산만)')
{
  const ledger = [
    { id: 'a', delta: 5, at: '2026-06-01T00:00:00.000Z' }, // 이전 시즌
    { id: 'b', delta: 3, at: '2026-06-15T00:00:00.000Z' }, // 이전 시즌
    { id: 'c', delta: 2, at: '2026-07-19T00:00:00.000Z' }, // 새 시즌 경계 그 시각
    { id: 'd', delta: 4, at: '2026-07-20T00:00:00.000Z' }, // 새 시즌 이후
    { id: 'e', delta: -1, at: '2026-07-21T00:00:00.000Z' }, // 새 시즌 소비(음수도 포함)
  ]
  const seasonStartedAt = '2026-07-19T00:00:00.000Z'
  check('시즌 경계 이후만 합산(2+4-1=5)', sumTicketBalanceSince(ledger, seasonStartedAt) === 5)
  check('전체 누적(sumTicketBalance)은 시즌과 무관하게 그대로(5+3+2+4-1=13)', sumTicketBalance(ledger) === 13)
  check('원장 자체는 절대 잘리지 않음(길이 불변)', ledger.length === 5)
  check('경계 시각 정확히 그 항목도 포함(>= 비교, 원문 " 이후" 원칙)', sumTicketBalanceSince([{ id: 'x', delta: 9, at: seasonStartedAt }], seasonStartedAt) === 9)
  check('경계 1ms 이전 항목은 제외', sumTicketBalanceSince([{ id: 'x', delta: 9, at: '2026-07-18T23:59:59.999Z' }], seasonStartedAt) === 0)
  check('seasonStartedAt 없음(null/undefined) -> 전체 누적으로 안전 폴백(시즌 없음 상태 = 기존 동작)', sumTicketBalanceSince(ledger, null) === 13 && sumTicketBalanceSince(ledger, undefined) === 13)
  check('seasonStartedAt이 짧은 이상한 문자열 -> 전체 누적 폴백', sumTicketBalanceSince(ledger, '2026') === 13)
  check('배열 아닌 ledger -> 0', sumTicketBalanceSince(null, seasonStartedAt) === 0 && sumTicketBalanceSince(undefined, seasonStartedAt) === 0)
  check('at 필드가 없거나 이상한 항목은 안전하게 제외(크래시 없음)', sumTicketBalanceSince([{ id: 'y', delta: 5 }, { id: 'z' }], seasonStartedAt) === 0)
}

console.log('\n1.5. 회귀 방지 — PostgREST timestamptz 형식(+00:00, 마이크로초) vs JS toISOString(Z, 밀리초) 문자열 비교 버그 (2026-07-20 발견/수정)')
{
  // seasons.started_at은 Postgres timestamptz라 PostgREST가 "+00:00" 오프셋
  // + 최대 마이크로초 정밀도로 직렬화한다(예: 아래 pgStyleSeasonStart) —
  // JS `new Date().toISOString()`의 "Z" + 밀리초 형식과 다르다. 수정 전
  // 코드는 두 문자열을 그대로 사전식(lexical) 비교해서, 실제로는 시즌
  // 시작 "이전"에 적립된 항목을 "이후"로 잘못 포함시켰다(재현: entry.at의
  // 접미사 "Z"(문자코드 90)가 seasonStartedAt 접미사의 숫자보다 커서 entry
  // 가 항상 더 "큰" 문자열로 오판정됨 — GAME_DESIGN.md 문서화된 KST
  // toISOString() 오탐 사고(handoff.md 2026-07-10)와 같은 클래스의 버그).
  const pgStyleSeasonStart = '2026-07-19T10:00:00.500000+00:00' // 실제 순간: 10:00:00.500
  const ledger = [
    // 실제로는 이 항목이 시즌 시작보다 1분 먼저 적립됐다(09:59:xx) —
    // 반드시 제외돼야 한다.
    { id: 'genuinely-before', delta: 40, at: '2026-07-19T09:59:00.000Z' },
    { id: 'genuinely-after', delta: 6, at: '2026-07-19T10:01:00.000Z' },
  ]
  check('PostgREST 형식 시즌 경계와 비교해도 시각 이전 항목은 정확히 제외됨', sumTicketBalanceSince(ledger, pgStyleSeasonStart) === 6)

  // 핵심 재현 케이스 — 밀리초 단위까지는 정확히 같고 그 이후(마이크로초)만
  // 다른 두 시각. entry(123ms)는 JS Date가 밀리초 정밀도까지만 다루므로
  // season(123.456ms)과 같은 값으로 환산된다 — 경계 포함(>=) 규칙에 따라
  // 포함되는 게 맞다. 이 케이스는 "밀리초 미만 차이는 크래시/역전 없이
  // 결정적으로 처리됨"만 확인(정밀도 한계 자체를 문서화, 버그 아님).
  const tieBoundary = '2026-07-19T09:15:22.123456+00:00'
  check('밀리초까지 동일한 경계 케이스도 크래시 없이 결정적으로 처리됨(포함)', sumTicketBalanceSince([{ id: 't', delta: 3, at: '2026-07-19T09:15:22.123Z' }], tieBoundary) === 3)
}

console.log('\n2. computeHouseSeasonScores — House 누적 팀 점수(시즌 시작~지금), 원문 "양수 delta만" 규칙 유지')
{
  const students = [
    { id: 's1', houseId: 1 },
    { id: 's2', houseId: 1 },
    { id: 's3', houseId: 2 },
    { id: 's4', houseId: null }, // 하우스 미배정(제외)
  ]
  const seasonStartedAt = '2026-07-19T00:00:00.000Z'
  const now = new Date('2026-07-26T00:00:00.000Z')
  const ledgerByStudentId = {
    s1: [
      { id: 'a', delta: 5, at: '2026-07-01T00:00:00.000Z' }, // 이전 시즌 — 제외
      { id: 'b', delta: 2, at: '2026-07-20T00:00:00.000Z' }, // 새 시즌 — 포함
      { id: 'c', delta: -1, at: '2026-07-21T00:00:00.000Z' }, // 소비 — 팀 점수에서 제외(양수만)
    ],
    s2: [
      { id: 'd', delta: 3, at: '2026-07-22T00:00:00.000Z' }, // 새 시즌 — 포함
      { id: 'e', delta: 100, at: '2026-08-01T00:00:00.000Z' }, // now 이후 미래(비정상 데이터 방어) — 제외
    ],
    s3: [
      { id: 'f', delta: 7, at: '2026-07-23T00:00:00.000Z' },
    ],
  }
  const scores = computeHouseSeasonScores(students, ledgerByStudentId, seasonStartedAt, now)
  check('HOUSES 전체 4개 키 포함(빈 하우스도 0)', HOUSES.every((h) => Object.prototype.hasOwnProperty.call(scores, h.id)))
  check('house 1 시즌 점수 = 2(s1 새시즌분) + 3(s2) = 5(이전시즌/소비/미래 전부 제외)', scores[1] === 5)
  check('house 2 시즌 점수 = 7', scores[2] === 7)
  check('배정 안 된 하우스(3,4)는 0', scores[3] === 0 && scores[4] === 0)

  // 같은 데이터를 "주간(월~일)" 함수에 넣으면 다른 결과가 나와야 한다 —
  // 두 축(시즌 누적 vs 주간)이 서로 다른 목적의 별도 계산임을 확인.
  const weekNow = new Date('2026-07-22T00:00:00.000Z') // 이 주(2026-07-20~26) 기준
  const weeklyScores = computeHouseWeeklyScores(students, ledgerByStudentId, weekNow)
  check('시즌 누적과 주간 집계는 서로 다른 함수(계산 결과가 우연히 같을 필요 없음, 둘 다 정상 계산됨만 확인)', typeof weeklyScores[1] === 'number' && typeof scores[1] === 'number')

  check('seasonStartedAt 없음 -> 전부 0(시즌 없음 상태, 크래시 없음)', Object.values(computeHouseSeasonScores(students, ledgerByStudentId, null, now)).every((v) => v === 0))
  check('students/ledger 없음 -> 전부 0(크래시 없음)', Object.values(computeHouseSeasonScores(null, null, seasonStartedAt, now)).every((v) => v === 0))

  // 2.5. 회귀 방지 — PostgREST timestamptz 형식(+00:00, 마이크로초) vs
  // JS toISOString(Z, 밀리초) 문자열 비교 버그(2026-07-20 발견/수정,
  // sumTicketBalanceSince와 동일한 클래스 — 이 함수도 같은 entry.at 필드를
  // 같은 방식으로 비교하므로 같은 버그가 있었다).
  const pgStyleSeasonStart = '2026-07-19T10:00:00.500000+00:00'
  const houseScores = computeHouseSeasonScores(
    [{ id: 'hs1', houseId: 3 }],
    { hs1: [
      { id: 'before', delta: 40, at: '2026-07-19T09:59:00.000Z' }, // 시즌 시작 1분 전 — 제외돼야 함
      { id: 'after', delta: 6, at: '2026-07-19T10:01:00.000Z' }, // 시즌 시작 1분 후 — 포함
    ] },
    pgStyleSeasonStart,
    new Date('2026-07-20T00:00:00.000Z'),
  )
  check('PostgREST 형식 시즌 경계와 비교해도 시각 이전 항목은 정확히 제외됨(house 3 = 6)', houseScores[3] === 6)
}

console.log('\n3. 회귀 방지 — 원장 불변(mutation 없음) + 레벨/뱃지/스트릭류 필드는 이 파일들이 애초에 다루지 않음')
{
  const ledger = [{ id: 'a', delta: 5, at: '2026-07-20T00:00:00.000Z' }]
  const before = JSON.stringify(ledger)
  sumTicketBalanceSince(ledger, '2026-07-19T00:00:00.000Z')
  check('sumTicketBalanceSince 호출 후 원장 내용 불변(append-only 원칙 — 이 함수는 읽기 전용)', JSON.stringify(ledger) === before)

  // 레벨/뱃지/스트릭류 필드가 섞인 학생 객체를 넣어도 그 필드들을 절대
  // 참조/변형하지 않는다는 것을 실측 확인 — "시즌 전환에도 절대 안 바뀐다"
  // 를 코드 수준에서 보장하는 가장 직접적인 방법은 애초에 이 계산 경로가
  // 그 필드를 읽지도 쓰지도 않는 것(paulRankShared.js/xp_ledger는 이 파일이
  // import조차 하지 않음, 파일 상단 import 목록 참고).
  const studentsWithExtraFields = [
    { id: 's1', houseId: 1, level: 7, badges: ['gold'], streak: 42, totalXp: 999 },
  ]
  const scores = computeHouseSeasonScores(
    studentsWithExtraFields,
    { s1: [{ id: 'a', delta: 3, at: '2026-07-20T00:00:00.000Z' }] },
    '2026-07-19T00:00:00.000Z',
    new Date('2026-07-21T00:00:00.000Z'),
  )
  check('레벨/뱃지/스트릭 필드가 있어도 결과는 오직 티켓 원장 기반(3)', scores[1] === 3)
  check('입력 학생 객체의 레벨/뱃지/스트릭 필드 자체도 불변(참조 그대로)', studentsWithExtraFields[0].level === 7 && studentsWithExtraFields[0].badges.length === 1 && studentsWithExtraFields[0].streak === 42)
}

console.log(failures === 0 ? '\n전부 PASS' : `\n${failures}개 FAIL`)
process.exit(failures === 0 ? 0 : 1)
