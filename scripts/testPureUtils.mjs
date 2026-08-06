// 순수 유틸 단위 테스트 모음(2026-08-08 야간) — scripts/testHouseSystem.mjs
// 등과 같은 패턴(check(label, cond) + exit code). 여기 묶인 5개 모듈은 전부
// React/import.meta.env/네트워크가 전혀 없는 순수 모듈이라 esbuild 번들 없이
// Node에서 바로 import 가능 — 라이브 Supabase에 어떤 접근도 하지 않는다.
//
// houseSystem.js/analyticsMath.js는 이미 각각 scripts/testHouseSystem.mjs
// (houseSystem 도메인)/tests/harness/runAnalytics.mjs(analytics 도메인)에
// 상세 전수 커버리지가 있다 — 여기서는 그 두 모듈을 통째로 재검증하지 않고,
// 지시받은 특정 경계 케이스(assignBalancedHouseId 최소인원/동률, computeHouseCounts
// 널/결측 무시, analyticsMath 대표 계산 1건)만 대표로 추가한다(중복 방지).
// matchGame.js/dateSeoul.js/entranceTest.js의 assignDirections 홀수 mixed는
// 기존 scripts/*.mjs 어디에도 없는 진짜 신규 커버리지다(grep으로 사전 확인).
import { assignBalancedHouseId, computeHouseCounts } from '../src/utils/houseSystem.js'
import { GAMES, pickNextGame } from '../src/utils/matchGame.js'
import { SEOUL_OFFSET_MS, getSeoulDateString, seoulMondayBoundary } from '../src/utils/dateSeoul.js'
import { EV, computeReturnRates, computeFeatureCounts } from '../src/utils/analyticsMath.js'
import { assignDirections } from '../src/utils/entranceTest.js'

let failures = 0
let checks = 0
function check(label, cond) {
  checks++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// ── 1. houseSystem.js — assignBalancedHouseId / computeHouseCounts 경계 케이스 ──
console.log('\n1. houseSystem.js — assignBalancedHouseId(최소 인원)·computeHouseCounts(널/결측 무시)')
{
  check('전부 0이면 id 1(최소·동률 시 최소 id)', assignBalancedHouseId({ 1: 0, 2: 0, 3: 0, 4: 0 }) === 1)
  check('id 2만 인원 적으면 id 2에 배정(최소 인원 하우스)', assignBalancedHouseId({ 1: 3, 2: 1, 3: 3, 4: 3 }) === 2)
  check('id 3,4가 동률로 최소면 더 작은 id(3) 배정', assignBalancedHouseId({ 1: 5, 2: 5, 3: 1, 4: 1 }) === 3)
  check('counts 완전 누락 키도 0 취급(빈 객체 -> id 1)', assignBalancedHouseId({}) === 1)

  const counts = computeHouseCounts([
    { houseId: 1 },
    { houseId: null },       // 결측(null) — 무시돼야 함
    { houseId: undefined },  // 결측(undefined) — 무시돼야 함
    {},                       // houseId 필드 자체 없음 — 무시돼야 함
    { houseId: 2 },
    { houseId: 99 },          // 존재하지 않는 하우스 id — 카운트에 반영되면 안 됨
  ])
  check('houseId 1은 1명만 카운트(널/결측 학생들은 미포함)', counts[1] === 1)
  check('houseId 2도 1명', counts[2] === 1)
  check('존재하지 않는 houseId(99)는 counts 어느 키에도 더해지지 않음', counts[3] === 0 && counts[4] === 0)
  check('반환 shape이 항상 HOUSES 4개 id 전부 포함', Object.keys(counts).sort().join(',') === '1,2,3,4')
}

// ── 2. matchGame.js — pickNextGame 직전 게임 미반복 + 전체 로테이션 ──
console.log('\n2. matchGame.js — pickNextGame(직전 게임 미반복, 전체 로테이션)')
{
  check('GAMES는 4종 고정', GAMES.length === 4)

  // 직전 게임과 절대 같은 걸 뽑지 않는지 — 충분히 많이 반복해 통계적으로 검증.
  let lastId = null
  let neverRepeated = true
  const seenOverall = new Set()
  for (let i = 0; i < 500; i++) {
    const picked = pickNextGame(lastId)
    seenOverall.add(picked.id)
    if (lastId !== null && picked.id === lastId) { neverRepeated = false; break }
    lastId = picked.id
  }
  check('500회 연속 pick 중 직전 게임과 동일한 적 없음', neverRepeated)
  check('충분히 반복하면 4종 전부 로테이션에 등장(치우침 없음)', seenOverall.size === 4)

  // lastGameId가 null(최초 호출)이어도 4종 중 하나를 정상 반환.
  const first = pickNextGame(null)
  check('lastGameId가 null이어도 GAMES 중 하나 반환', GAMES.some((g) => g.id === first.id))

  // lastGameId가 존재하지 않는 id(방어) — pool이 전체 GAMES로 폴백해도 크래시 없음.
  const unknown = pickNextGame('no-such-game')
  check('알 수 없는 lastGameId도 크래시 없이 GAMES 중 하나 반환', GAMES.some((g) => g.id === unknown.id))
}

// ── 3. dateSeoul.js — 서울 기준 날짜 포맷/자정 근처 UTC 입력 경계 ──
console.log('\n3. dateSeoul.js — 서울 기준 날짜 문자열 포맷/경계(자정 근처 UTC 입력)')
{
  check('SEOUL_OFFSET_MS는 UTC+9(밀리초)', SEOUL_OFFSET_MS === 9 * 60 * 60 * 1000)

  const originalNow = Date.now
  try {
    // 2026-08-07T14:59:59Z(UTC) = 2026-08-07T23:59:59+09:00(서울, 자정 1초 전)
    Date.now = () => new Date('2026-08-07T14:59:59.000Z').getTime()
    check('UTC 14:59:59(서울 자정 1초 전)는 여전히 2026-08-07', getSeoulDateString() === '2026-08-07')

    // 2026-08-07T15:00:00Z(UTC) = 2026-08-08T00:00:00+09:00(서울, 자정 정각)
    Date.now = () => new Date('2026-08-07T15:00:00.000Z').getTime()
    check('UTC 15:00:00(서울 자정 정각) 넘어가면 2026-08-08로 날짜 전환', getSeoulDateString() === '2026-08-08')

    // 2026-08-03(서울 기준)은 월요일 — 같은 주 수요일(서울 기준 2026-08-05)에서
    // seoulMondayBoundary(0)을 호출하면 그 주 월요일 00:00(서울) = 전날 15:00Z여야 함.
    Date.now = () => new Date('2026-08-05T10:00:00.000Z').getTime() // 서울 2026-08-05T19:00(수)
    const mondayThisWeek = seoulMondayBoundary(0)
    check('수요일(서울) 기준 이번 주 월요일 00:00(서울) = 2026-08-02T15:00:00.000Z(UTC)', mondayThisWeek.toISOString() === '2026-08-02T15:00:00.000Z')
    const mondayLastWeek = seoulMondayBoundary(1)
    check('weeksAgo=1은 정확히 7일 전 월요일', mondayLastWeek.toISOString() === '2026-07-26T15:00:00.000Z')

    // 일요일(서울 기준 dow=0) 특수 케이스 — diffToMonday 분기(dow===0 -> 6)가
    // 실제로 "그 주"(오늘이 속한 주)의 월요일로 되돌아가는지 확인.
    // 2026-08-09(서울)은 일요일(2026-08-03 월요일 기준 +6일).
    Date.now = () => new Date('2026-08-09T01:00:00.000Z').getTime() // 서울 2026-08-09T10:00(일)
    const mondayFromSunday = seoulMondayBoundary(0)
    check('일요일(서울, dow=0) 기준도 같은 주의 월요일(2026-08-03)로 계산', mondayFromSunday.toISOString() === '2026-08-02T15:00:00.000Z')
  } finally {
    Date.now = originalNow
  }
}

// ── 4. analyticsMath.js — 대표 계산 1건(전수 커버리지는 tests/harness/runAnalytics.mjs) ──
console.log('\n4. analyticsMath.js — 대표 케이스(복귀율/카운트 집계, 전수는 analytics 도메인 하네스 참고)')
{
  const row = (anon, event, day, hour = 12) => ({ anon_id: anon, event, day, created_at: `${day}T${String(hour).padStart(2, '0')}:00:00Z` })
  const rows = [
    row('s1', EV.gardenOpened, '2026-08-01'),
    row('s1', EV.appOpened, '2026-08-02'),
    row('s2', EV.gardenOpened, '2026-08-01'),
  ]
  const rates = computeReturnRates(rows)
  const garden = rates.find((r) => r.event === EV.gardenOpened)
  check('정원 열람 2회 중 익일 복귀 1회(s1만) = 1/2', garden.opens === 2 && Math.abs(garden.d1 - 0.5) < 1e-9)
  check('빈 입력은 크래시 없이 빈 배열', computeReturnRates([]).length === 0)
  check('이벤트별 카운트 집계 정확', computeFeatureCounts(rows)[EV.gardenOpened] === 2)
}

// ── 5. entranceTest.js — assignDirections mixed 50:50 배분(홀수 개수 포함) ──
console.log('\n5. entranceTest.js — assignDirections(mixed 50:50, 홀수 개수 포함)')
{
  const countBy = (dirs) => dirs.reduce((acc, d) => { acc[d] = (acc[d] || 0) + 1; return acc }, {})

  const even = assignDirections(20, 'mixed')
  check('짝수(20) mixed는 정확히 10:10', even.length === 20 && countBy(even).kr2en === 10 && countBy(even).en2kr === 10)

  // 홀수(15) — 남는 1개의 방향은 rng로 결정. rng를 고정해 양쪽 분기 모두 검증.
  const oddLowRng = assignDirections(15, 'mixed', { rng: () => 0.1 }) // 0.1 < 0.5 -> 남는 1개는 kr2en
  const cLow = countBy(oddLowRng)
  check('홀수(15) mixed, 남는 1개가 kr2en 쪽(rng<0.5)이면 kr2en 8 : en2kr 7', oddLowRng.length === 15 && cLow.kr2en === 8 && cLow.en2kr === 7)

  const oddHighRng = assignDirections(15, 'mixed', { rng: () => 0.9 }) // 0.9 >= 0.5 -> 남는 1개는 en2kr
  const cHigh = countBy(oddHighRng)
  check('홀수(15) mixed, 남는 1개가 en2kr 쪽(rng>=0.5)이면 kr2en 7 : en2kr 8', oddHighRng.length === 15 && cHigh.kr2en === 7 && cHigh.en2kr === 8)

  // 최소 경계 — 홀수 1개, 짝수 0개.
  const one = assignDirections(1, 'mixed', { rng: () => 0.1 })
  check('mixed, count=1(홀수 최소) -> 길이 1, kr2en(rng<0.5)', one.length === 1 && one[0] === 'kr2en')
  const zero = assignDirections(0, 'mixed')
  check('mixed, count=0 -> 빈 배열', Array.isArray(zero) && zero.length === 0)

  // 순수 방향/폴백 경계도 함께(mixed와 대조군).
  check('kr2en 고정 방향은 전부 kr2en', assignDirections(5, 'kr2en').every((d) => d === 'kr2en'))
  check('en2kr 고정 방향은 전부 en2kr', assignDirections(5, 'en2kr').every((d) => d === 'en2kr'))
  check('알 수 없는 방향 값은 fallback(기본 kr2en)으로 전부 배정', assignDirections(3, 'nope').every((d) => d === 'kr2en'))
  check('알 수 없는 방향 + 커스텀 fallback도 반영', assignDirections(3, 'nope', { fallback: 'en2kr' }).every((d) => d === 'en2kr'))
}

console.log(failures === 0
  ? `\nPure Utils: ALL PASS (${checks}개 단언)`
  : `\nPure Utils: ${failures}/${checks} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
