// src/utils/ticketEconomy.js — Ticket Economy(GAME_DESIGN.md 4번) +
// Daily Missions 티켓 후킹(7번) + Rewards 티켓 상점(10번) 순수 함수 전용
// 모듈. 2026-07-19.
//
// paulRankShared.js와 같은 순수성 원칙 — React 없음, `import.meta.env`
// 없음, `window`/`document` 없음, 네트워크 호출 없음. useStudent.js(브라우저)
// 와 scripts/testTicketEconomy.mjs(Node) 양쪽에서 그대로 import된다.
//
// ── 왜 원시 잔액이 아니라 append-only 원장인가 (GAME_DESIGN.md 4번 섹션) ──
// 별(XP)은 "한 번도 소비된 적 없는 단조증가 값"이지만 티켓은 정의상
// 소비되는(감소하는) 값이다. useStudent.js의 mergeProgressRecords()가 쓰는
// maxNum()(단조증가 가정) 병합 정책을 티켓 잔액에 그대로 적용하면, 한
// 기기에서 티켓을 쓰고 다른 기기의 옛 스냅샷과 병합될 때 "쓴 티켓이
// 부활"하는 실제 버그가 생긴다(v2.2가 정확히 이런 부류의 유실/부활 버그를
// 잡으려고 만든 병합 정책이므로 여기서 새로 그 버그를 재발시키면 안 됨).
// 그래서 diaryPlacements가 이미 쓰는 "append-only 이벤트 로그 + id 기준
// 합집합" 패턴을 재사용한다 — 잔액은 절대 저장하지 않고 항상
// sumTicketBalance()로 그 자리에서 계산한다(Paul Rank의 sumXpLedger와
// 동일한 정신, "저장된 합계 컬럼"이 화면마다 다른 숫자를 만드는 사고를
// 원천 차단).
//
// diaryPlacements와의 차이 하나: 티켓 원장은 "삭제"가 없다(획득도 소비도
// 전부 새 항목 추가일 뿐 — 소비는 음수 delta 항목을 추가하는 것으로
// 표현한다). 그래서 diaryRemovedIds 같은 별도 tombstone 리스트가 필요
// 없고, id 기준 합집합만으로 두 기기가 서로 다른 항목을 추가해도 유실도
// 부활도 없다.
//
// ── 저장 위치 판단(SQL 불필요) ────────────────────────────────────────
// ticketLedger는 새 Supabase 컬럼/테이블을 만들지 않고 기존
// student_progress.progress_data(JSON blob, useStudent.js의 단일 통합
// 레코드가 그대로 직렬화되는 자리)에 다른 필드(stickers/diaryPlacements 등)
// 와 똑같이 얹힌다 — doSync가 이미 record 전체를 fullRecord로 업로드하므로
// 추가 배선이 필요 없다. Paul Rank XP(xp_ledger, 신규 서버 테이블)와 달리
// 이 파일은 CLAUDE.md 규칙 8(DDL 금지)/규칙 10(GRANT)이 적용될 신규
// 스키마가 전혀 없다.
//
// ── 서버 검증 필요 여부 판단(운영자 지시 4번 항목에 대한 답) ────────────
// GAME_DESIGN.md 11번(Anti-cheat) 섹션이 이미 이 판단 기준을 내려뒀다:
// "Daily Missions의 4/4 완료 티켓 지급처럼 저빈도·저가치이고, 지금의 별
// 시스템과 동일한 위협수준(학생이 자기 로컬 데이터를 조작해도 실질적
// 이득이 없음 — 소비처가 코스메틱뿐)인 경로는 기존 student_progress
// anon-write 관례를 그대로 유지해도 무방하다(모든 경로를 서버화하면
// 과설계)." 이 파일의 소스(daily-mission-complete)도 싱크(REWARD_CATALOG
// 코스메틱 스티커 상점)도 정확히 이 카테고리에 든다 — 실결제 0, 확률형
// 0, House/Word King 같은 경쟁 시스템과의 연동 0(그 둘은 여전히 미구현).
// Paul Rank XP가 서버 전용 원장인 이유(다른 학생과 비교되는 랭크라 감사
// 가능성이 필요)와 티켓이 로컬 우선이어도 안전한 이유(이 학생 개인의
// 다이어리 스티커 언락에만 쓰이고 비교/경쟁에 전혀 개입하지 않음)가
// 서로 다르다 — 그래서 기존 stars/stickers(addStars/grantSticker)와
// 동일하게 로컬 우선 + 클라우드 백업(progress_data) 관례를 그대로 따른다
// (새 api/*.js 없음). House/Word King이 실제로 티켓을 소스/싱크로 쓰게
//되는 시점에는 GAME_DESIGN.md 11번 섹션의 "보상이 걸린 모든 신규 쓰기
// 경로는 서버 재계산" 원칙이 그 확장분에는 다시 적용되어야 한다(지금
// 이 판단은 이번 배포 범위인 daily-mission-complete 소스 + 코스메틱
// 스티커 싱크에만 유효).

// ── 1) 원장 조작(append-only, id 기준 idempotent) ─────────────────────
export function appendTicketEntry(ledger, entry) {
  const list = Array.isArray(ledger) ? ledger : []
  if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) return list
  if (list.some((e) => e && e.id === entry.id)) return list // 이미 있으면 그대로(중복 지급 방지)
  return [...list, {
    id: entry.id,
    delta: Number(entry.delta) || 0,
    reason: typeof entry.reason === 'string' ? entry.reason : '',
    at: entry.at || new Date().toISOString(),
  }]
}

export function sumTicketBalance(ledger) {
  if (!Array.isArray(ledger)) return 0
  return ledger.reduce((sum, e) => sum + (Number(e?.delta) || 0), 0)
}

// ── Seasonal Progression(GAME_DESIGN.md 9번 섹션, 2026-07-19) ─────────────
// 시즌 경계(seasonStartedAt, ISO 문자열 — src/utils/seasonApi.js
// fetchCurrentSeason()의 startedAt) 이후에 발생한 항목만 합산한 "이번 시즌
// 잔액". sumTicketBalance()(전체 누적)는 그대로 두고 이 함수를 별도로
// 추가한 이유: 원장(ledger)은 절대 자르거나 지우지 않는다는 append-only
// 원칙(파일 헤더 참고, supabase_v2_8_seasonal_progression.sql 헤더의 "리셋의
// 실제 의미"와 동일 판단)을 지키면서도, "시즌이 바뀌면 잔액이 새로
// 시작된 것처럼 보인다"를 파생 계산만으로 구현하기 위함 — 저장 형태
// 변경 없음.
//
// seasonStartedAt이 없으면(시즌이 아직 시작 안 됐거나 SQL 미실행)
// sumTicketBalance()와 동일하게 전체 누적을 반환한다 — "시즌 개념이 아직
// 없을 때는 기존 동작 그대로"라는 이 저장소의 확립된 안전한 기본값 관례
// (CLAUDE.md 규칙 9)를 그대로 따른다.
export function sumTicketBalanceSince(ledger, seasonStartedAt) {
  if (!Array.isArray(ledger)) return 0
  if (typeof seasonStartedAt !== 'string' || seasonStartedAt.length < 10) return sumTicketBalance(ledger)
  return ledger.reduce((sum, e) => {
    if (!e || typeof e.at !== 'string' || e.at < seasonStartedAt) return sum
    return sum + (Number(e.delta) || 0)
  }, 0)
}

// 두 기기의 원장을 id 기준 합집합(local 우선, cloud에만 있는 항목 추가) —
// diaryPlacements 병합과 같은 정신이지만 tombstone이 필요 없다(삭제가
// 없으므로).
export function mergeTicketLedgers(localLedger, cloudLedger) {
  const local = Array.isArray(localLedger) ? localLedger : []
  const cloud = Array.isArray(cloudLedger) ? cloudLedger : []
  const localIds = new Set(local.map((e) => e && e.id))
  return [...local, ...cloud.filter((e) => e && !localIds.has(e.id))]
}

// ── 2) 소스: 무엇이 티켓을 지급하는가 (GAME_DESIGN.md 4번 섹션) ────────
// XP_EVENT_TABLE(paulRankShared.js)과 같은 status 패턴 재사용 —
// 'active'만 실제로 지급, 'planned'는 스키마 슬롯만 예약(아직 아무 코드도
// 이 이벤트를 만들지 않음). Weekly Events(8번)/Word King(5번)/House(6번)는
// 여전히 미구현이라 이 파일 범위에서 'active'로 전환하지 않는다 — 그
// 기능들이 실제로 붙는 시점엔 위 "서버 검증" 판단도 함께 재확인해야 한다.
export const TICKET_GRANT_TABLE = {
  'daily-mission-complete': { amount: 1, period: 'day', status: 'active' }, // 기존 오늘의 미션 4/4 완료 useEffect에 병행 후킹(useStudent.js) — 새 트래킹 없음
  'weekly-event-complete': { amount: 2, period: 'week', status: 'planned' }, // GAME_DESIGN.md 8번 — 미구현, 이벤트 타입만 예약
  'word-king-complete': { amount: 3, period: 'admin-event', status: 'planned' }, // GAME_DESIGN.md 5번 — Anti-cheat 서버 검증 전제, 미구현
  'house-contribution': { amount: 1, period: 'admin-event', status: 'planned' }, // GAME_DESIGN.md 6번 — 미구현
}
export function resolveTicketGrantAmount(eventType) {
  const config = Object.prototype.hasOwnProperty.call(TICKET_GRANT_TABLE, eventType)
    ? TICKET_GRANT_TABLE[eventType]
    : null
  return (config && config.status === 'active') ? config.amount : null
}

// 호출부(useStudent.js)가 "오늘 이미 지급했는지"를 별도로 계산하지 않고
// eventType + periodKey만 넘기면 되도록 — id를 `${eventType}:${periodKey}`
// 로 고정해 appendTicketEntry의 idempotent 특성을 그대로 활용한다(Paul
// Rank XP가 day 기간키로 서버 unique 제약을 거는 것과 같은 원리, 여기선
// 서버 대신 로컬 배열의 id 유일성으로 구현 — 위 "서버 검증 판단" 문단 근거).
// status가 'planned'인 이벤트는 언제나 원장을 그대로 반환(무조건 거부).
export function grantTicket(ledger, eventType, periodKey, extra = {}) {
  const amount = resolveTicketGrantAmount(eventType)
  if (amount === null || typeof periodKey !== 'string' || periodKey.length === 0) return ledger
  const id = `${eventType}:${periodKey}`
  return appendTicketEntry(ledger, { id, delta: amount, reason: eventType, at: extra.at })
}

// ── 3) 싱크: Rewards 티켓 상점 (GAME_DESIGN.md 10번 섹션) ──────────────
// "결정론적(비확률) 구매만" 원칙 — 확률형(가챠) 요소 절대 없음, 실결제
// 요소 0개. GAME_DESIGN.md 10번이 제안한 카탈로그(모자 재스킨/House 점수
// 기부/Word King 타이틀 플레어)는 Hat 실제 시각화·House·Word King이 전부
// 아직 미구현이라 이번 범위에서 못 쓴다 — 운영자 지시대로 기존 스티커
// 컬렉션 패턴을 재사용해, 가챠 풀에서 제외된 상점 전용 스티커 2종
// (data/stickers.js `shopExclusive: true`)을 언락하는 최소 카탈로그로
// 대체했다. House/Word King이 실제로 붙으면 이 배열에 항목만 추가하면
// 되는 구조(재스킨/기부/타이틀 항목 추가 시 UI/redeemReward 로직 변경 불필요).
export const REWARD_CATALOG = [
  { id: 'ticket-shop-medal', stickerId: 'ticket_medal1', cost: 8, label: '폴 선생님 메달 스티커' },
  { id: 'ticket-shop-hat', stickerId: 'ticket_hat1', cost: 15, label: '황금 모자 스티커' },
]

export function findReward(rewardId) {
  return REWARD_CATALOG.find((r) => r.id === rewardId) || null
}

// 구매 가능 여부(pure, side-effect 없음) — 이미 보유한 스티커는 다시 살
// 수 없다(gacha 중복처럼 별로 환전하는 게 아니라 "언락" 개념이라 소유
// 여부만 확인하면 충분).
export function canRedeemReward(ledger, ownedStickerIds, rewardId) {
  const reward = findReward(rewardId)
  if (!reward) return { ok: false, reason: 'unknown-reward' }
  if ((ownedStickerIds || []).includes(reward.stickerId)) return { ok: false, reason: 'already-owned', reward }
  if (sumTicketBalance(ledger) < reward.cost) return { ok: false, reason: 'insufficient-balance', reward }
  return { ok: true, reward }
}

// 구매 실행(pure) — 새 원장만 반환한다. 스티커를 실제로 stickers 배열에
// 추가하는 것은 호출부(useStudent.js)의 몫 — grantSticker()의 "중복이면
// 별로 환전" gacha 전용 분기와 의도적으로 분리해, 상점 구매 흐름이 gacha
// 로직에 영향을 주지 않게 한다.
export function redeemReward(ledger, ownedStickerIds, rewardId, now = new Date()) {
  const check = canRedeemReward(ledger, ownedStickerIds, rewardId)
  if (!check.ok) return { ok: false, reason: check.reason, reward: check.reward || null, ledger }
  const id = `redeem:${rewardId}:${now.getTime()}`
  const nextLedger = appendTicketEntry(ledger, { id, delta: -check.reward.cost, reason: `redeem:${rewardId}`, at: now.toISOString() })
  return { ok: true, ledger: nextLedger, reward: check.reward }
}
