// Ticket Economy — 순수 함수 단위 테스트(scripts/testPaulRank.mjs와 같은
// 패턴). src/utils/ticketEconomy.js는 React/import.meta.env/네트워크가
// 전혀 없는 순수 모듈이라 esbuild 번들 없이 Node에서 바로 import 가능.
import {
  appendTicketEntry, sumTicketBalance, mergeTicketLedgers,
  TICKET_GRANT_TABLE, resolveTicketGrantAmount, grantTicket,
  REWARD_CATALOG, findReward, canRedeemReward, redeemReward,
} from '../src/utils/ticketEconomy.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. appendTicketEntry — append-only, id 기준 idempotent(중복 지급 방지)')
{
  const l1 = appendTicketEntry([], { id: 'a', delta: 1, reason: 'x' })
  check('빈 원장에 1개 추가', l1.length === 1 && l1[0].id === 'a' && l1[0].delta === 1)
  const l2 = appendTicketEntry(l1, { id: 'a', delta: 1, reason: 'x' })
  check('같은 id 재추가는 no-op(중복 지급 방지의 핵심)', l2.length === 1 && l2 === l1)
  const l3 = appendTicketEntry(l1, { id: 'b', delta: -1, reason: 'spend' })
  check('다른 id는 정상 추가(소비도 새 항목 추가로 표현)', l3.length === 2 && l3[1].delta === -1)
  check('entry 없음/잘못된 id는 원본 그대로', appendTicketEntry(l1, null) === l1 && appendTicketEntry(l1, { delta: 1 }) === l1)
  check('배열 아닌 ledger 입력도 안전(빈 배열 취급)', appendTicketEntry(null, { id: 'z', delta: 1 }).length === 1)
  const l4 = appendTicketEntry([], { id: 'c' }) // delta 없음
  check('delta 누락은 0으로 안전 처리', l4[0].delta === 0)
}

console.log('\n2. sumTicketBalance — 원시 잔액을 저장하지 않고 항상 파생 계산')
{
  check('빈 배열 -> 0', sumTicketBalance([]) === 0)
  check('양수/음수 합산(획득 + 소비)', sumTicketBalance([{ delta: 5 }, { delta: -2 }, { delta: 1 }]) === 4)
  check('delta가 이상한 값이어도 크래시 없이 0 취급', sumTicketBalance([{ delta: 'oops' }, {}, { delta: 3 }]) === 3)
  check('배열 아닌 입력도 안전하게 0', sumTicketBalance(null) === 0 && sumTicketBalance(undefined) === 0)
}

console.log('\n3. mergeTicketLedgers — id 기준 합집합(diaryPlacements 병합과 같은 정신, tombstone 불필요)')
{
  const local = [{ id: 'a', delta: 1 }, { id: 'b', delta: 1 }]
  const cloud = [{ id: 'b', delta: 1 }, { id: 'c', delta: 1 }]
  const merged = mergeTicketLedgers(local, cloud)
  check('local + cloud만 있던 항목만 추가(3개, 중복 없음)', merged.length === 3)
  check('local 우선(같은 id는 local 버전 유지)', merged.find(e => e.id === 'b') === local[1])
  check('양쪽 다 빈 배열이면 빈 배열', mergeTicketLedgers([], []).length === 0)
  check('한쪽이 배열이 아니어도 안전(빈 배열 취급)', mergeTicketLedgers(null, cloud).length === 2)
  // 실유실 시나리오 재현: 기기A가 소비(음수 delta)를 추가한 뒤 기기B의
  // 옛 스냅샷(소비 전)과 병합해도, maxNum()이 아니라 id 합집합이라 소비
  // 항목이 절대 사라지지 않는다(= "쓴 티켓이 부활"하는 버그가 구조적으로
  // 불가능함을 직접 증명).
  const afterSpend = [{ id: 'earn1', delta: 5 }, { id: 'redeem:x:1', delta: -3 }]
  const staleCloudSnapshot = [{ id: 'earn1', delta: 5 }] // 소비 전 옛 스냅샷
  const reMerged = mergeTicketLedgers(afterSpend, staleCloudSnapshot)
  check('소비(음수 delta) 항목이 옛 클라우드 스냅샷과 병합해도 사라지지 않음(부활 버그 없음)',
    sumTicketBalance(reMerged) === 2 && reMerged.some(e => e.id === 'redeem:x:1'))
}

console.log('\n4. TICKET_GRANT_TABLE / resolveTicketGrantAmount — daily-mission-complete만 active')
{
  check('daily-mission-complete만 active(나머지는 GAME_DESIGN.md 미구현 기능 예약 슬롯)',
    resolveTicketGrantAmount('daily-mission-complete') === 1)
  check('planned 슬롯(weekly-event-complete/word-king-complete/house-contribution)은 전부 null(아직 지급 불가)',
    resolveTicketGrantAmount('weekly-event-complete') === null &&
    resolveTicketGrantAmount('word-king-complete') === null &&
    resolveTicketGrantAmount('house-contribution') === null)
  check('planned 슬롯이 테이블엔 존재(스키마 예약, paulRankShared.js와 같은 패턴)',
    ['weekly-event-complete', 'word-king-complete', 'house-contribution'].every(k => k in TICKET_GRANT_TABLE && TICKET_GRANT_TABLE[k].status === 'planned'))
  check('알 수 없는 eventType은 null', resolveTicketGrantAmount('made-up') === null && resolveTicketGrantAmount('') === null)
}

console.log('\n5. grantTicket — 하루 1회만(day 기간키 idempotent), missions repeat all day에도 무한 지급 안 됨')
{
  const today = new Date().toDateString()
  let ledger = []
  ledger = grantTicket(ledger, 'daily-mission-complete', today)
  check('첫 지급 성공(잔액 1)', sumTicketBalance(ledger) === 1)
  // 실제 useStudent.js 시나리오: 오늘의 미션(4/4)이 하루 여러 번 반복
  // 완료되어 이 useEffect가 여러 번 더 실행돼도(missions repeat all day),
  // 같은 day 기간키라 두 번째 호출부터는 아무 일도 안 일어남.
  ledger = grantTicket(ledger, 'daily-mission-complete', today)
  ledger = grantTicket(ledger, 'daily-mission-complete', today)
  ledger = grantTicket(ledger, 'daily-mission-complete', today)
  check('같은 날 몇 번을 더 호출해도 잔액은 여전히 1(무한 파밍 방지)', sumTicketBalance(ledger) === 1)
  check('원장에는 정확히 1개 항목만 존재', ledger.length === 1)

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString()
  const ledgerNextDay = grantTicket(ledger, 'daily-mission-complete', yesterday === today ? 'other-day-key' : yesterday)
  check('다른 날짜 키로는 별개로 다시 지급(날짜가 바뀌면 다시 1장)', sumTicketBalance(ledgerNextDay) === 2)

  check('status가 planned인 이벤트는 grantTicket을 호출해도 원장이 그대로', grantTicket([], 'word-king-complete', today).length === 0)
  check('periodKey가 비어있으면 원장 그대로(방어)', grantTicket([], 'daily-mission-complete', '').length === 0)
}

console.log('\n6. REWARD_CATALOG / findReward — 전부 결정론적(비확률) 구매, 실결제 0')
{
  check('카탈로그가 최소 1개 이상, 전부 stickerId/cost 보유', REWARD_CATALOG.length >= 1 && REWARD_CATALOG.every(r => typeof r.stickerId === 'string' && Number.isInteger(r.cost) && r.cost > 0))
  check('카탈로그에 확률/가챠 관련 필드(weight/probability/rarity) 없음(결정론적 구매만 원칙)',
    REWARD_CATALOG.every(r => !('weight' in r) && !('probability' in r) && !('rarity' in r)))
  check('실결제 관련 필드(price/currency/paymentUrl 등) 카탈로그 어디에도 없음',
    JSON.stringify(REWARD_CATALOG).toLowerCase().includes('price') === false &&
    JSON.stringify(REWARD_CATALOG).toLowerCase().includes('payment') === false)
  check('findReward가 존재하는 id는 찾고 없는 id는 null', findReward(REWARD_CATALOG[0].id) !== null && findReward('nope') === null)
}

console.log('\n7. canRedeemReward / redeemReward — 잔액/소유 여부 검증(pure)')
{
  const reward = REWARD_CATALOG[0]
  const cheapLedger = [{ id: 'x', delta: reward.cost - 1 }]
  const enoughLedger = [{ id: 'x', delta: reward.cost }]

  check('잔액 부족이면 거부', canRedeemReward(cheapLedger, [], reward.id).ok === false)
  check('잔액 부족 사유가 insufficient-balance', canRedeemReward(cheapLedger, [], reward.id).reason === 'insufficient-balance')
  check('잔액 충분하면 허용', canRedeemReward(enoughLedger, [], reward.id).ok === true)
  check('이미 보유 중이면 잔액이 충분해도 거부(중복 구매 방지)', canRedeemReward(enoughLedger, [reward.stickerId], reward.id).ok === false)
  check('이미 보유 사유가 already-owned', canRedeemReward(enoughLedger, [reward.stickerId], reward.id).reason === 'already-owned')
  check('존재하지 않는 rewardId는 unknown-reward', canRedeemReward(enoughLedger, [], 'nope').reason === 'unknown-reward')

  const result = redeemReward(enoughLedger, [], reward.id, new Date())
  check('구매 성공 시 ok=true, 새 원장에 음수 delta 항목 추가', result.ok === true && sumTicketBalance(result.ledger) === 0)
  check('구매 실행 후 원본 잔액에서 정확히 cost만큼 차감', enoughLedger.reduce((s, e) => s + e.delta, 0) - sumTicketBalance(result.ledger) === reward.cost)

  const fail = redeemReward(cheapLedger, [], reward.id, new Date())
  check('실패 시 원장이 원본 그대로(부작용 없음)', fail.ok === false && fail.ledger === cheapLedger)

  const alreadyOwned = redeemReward(enoughLedger, [reward.stickerId], reward.id, new Date())
  check('이미 보유 중이면 실행도 거부(원장 그대로)', alreadyOwned.ok === false && alreadyOwned.ledger === enoughLedger)
}

console.log('\n8. 데이터 무결성(GAME_DESIGN.md 4번 섹션 핵심 요구) — 잔액이 저장된 컬럼이 아니라 항상 원장에서 파생됨을 구조적으로 증명')
{
  // sumTicketBalance/appendTicketEntry/mergeTicketLedgers 어디에도 "합계를
  // 별도 필드에 캐시"하는 코드가 없다 — 함수 시그니처 자체가 항상 원장
  // 배열을 받아 그 자리에서 계산한다는 것을 반복 호출로 증명(캐시가 있었다면
  // 원장을 바꾼 뒤 재계산 없이 옛 값을 반환했을 것).
  let ledger = grantTicket([], 'daily-mission-complete', 'day-1')
  const before = sumTicketBalance(ledger)
  ledger = appendTicketEntry(ledger, { id: 'bonus-1', delta: 10, reason: 'test' })
  const after = sumTicketBalance(ledger)
  check('원장에 새 항목을 추가하면 합계가 즉시 반영됨(캐시된 옛 값 아님)', after === before + 10)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
