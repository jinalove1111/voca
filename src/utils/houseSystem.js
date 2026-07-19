// src/utils/houseSystem.js — House System(GAME_DESIGN.md 6번) + Weekly
// Events 설정 슬롯(GAME_DESIGN.md 8번) 순수 함수 전용 모듈. 2026-07-19.
// PROJECT_BOARD.md 게임화 하위카드 8번.
//
// paulRankShared.js/ticketEconomy.js/wordKing.js와 같은 순수성 원칙 —
// React 없음, `import.meta.env` 없음, `window`/`document` 없음, 네트워크
// 없음, 다른 src/utils 파일 import도 없음(이 저장소 게임화 순수 계산
// 모듈들이 이미 확립한 관례 — 각 파일이 완전히 독립적으로 Node에서 바로
// import 가능해야 esbuild 번들 없이 scripts/testXxx.mjs가 돌아간다. 짧은
// 로직은 파일마다 재구현하는 편을 택한다 — wordKing.js 헤더의 같은 판단).
//
// ── 설계 판단 1: houses 테이블을 만들지 않는다(PAUL_BIBLE.md §10 원문과
// 다른 점) ────────────────────────────────────────────────────────────
// PAUL_BIBLE.md §10 원문은 "신규 houses 테이블"을 제안했지만, 이번 구현은
// 코드 상수(HOUSES)로 대체한다. 근거: 이 저장소가 이미 반복적으로 확립한
// "자주 안 바뀌는 소규모 목록은 정적 JS 객체, DB 테이블 아님" 관례
// (TICKET_GRANT_TABLE/REWARD_CATALOG, XP_EVENT_TABLE, 그리고 GAME_DESIGN.md
// 8번 섹션 자신도 Weekly Events 콘텐츠에 "신규 이벤트 정의 테이블을
// 만들지 않는다"고 명시) — 하우스 4개는 학원 운영상 자주 바뀔 목록이
// 아니고(§9 Seasonal Progression도 레벨/뱃지/스트릭처럼 정체성은 시즌을
// 넘어 유지된다), 관리자가 웹 UI로 하우스를 추가/삭제하는 요구가 실제로
// 생기기 전까지 테이블+CRUD API를 미리 만들면 과설계다(YAGNI). 목록이
// 실제로 바뀌면 이 배열 + supabase_v2_7_house_system.sql의 CHECK 제약만
// 함께 수정하면 된다(두 파일이 유일한 커플링 지점 — 서로 헤더에 명시).
//
// ── 설계 판단 2: house_id는 FK가 아니라 smallint(1~4) ────────────────────
// 참조할 테이블이 없으므로 FK 자체가 불가능 — 대신 DB CHECK 제약
// (supabase_v2_7_house_system.sql)이 아래 HOUSES.id 범위와 반드시 일치해야
// 한다.

export const HOUSES = Object.freeze([
  Object.freeze({ id: 1, name: '레드 하우스', emoji: '🔴', colorHex: '#ef4444' }),
  Object.freeze({ id: 2, name: '블루 하우스', emoji: '🔵', colorHex: '#3b82f6' }),
  Object.freeze({ id: 3, name: '그린 하우스', emoji: '🟢', colorHex: '#22c55e' }),
  Object.freeze({ id: 4, name: '옐로우 하우스', emoji: '🟡', colorHex: '#eab308' }),
])

export function getHouseById(houseId) {
  const id = Number(houseId)
  return HOUSES.find((h) => h.id === id) || null
}

// ── 1) 자동 배정: 라운드로빈 균형(가장 인원이 적은 하우스에 배정) ────────
// counts: {houseId: count} — 부분/전체/빈 객체 다 무관, 없는 id는 0으로
// 취급. 동률이면 id가 가장 작은 하우스로 결정론적으로 배정한다(난수 없음
// — 테스트 가능해야 하고, "왜 이 학생이 이 하우스에 배정됐는지" 항상
// 재현 가능해야 하기 때문). 신규 학생 생성 시 이미 메모리에 있는 학생
// 캐시(wordLibrary.js의 _students)로 counts를 계산해 넘기면 별도 DB
// 집계 쿼리 없이 배정할 수 있다.
export function assignBalancedHouseId(counts = {}) {
  let best = HOUSES[0]
  let bestCount = Number(counts[best.id]) || 0
  for (let i = 1; i < HOUSES.length; i++) {
    const h = HOUSES[i]
    const c = Number(counts[h.id]) || 0
    if (c < bestCount) { best = h; bestCount = c }
  }
  return best.id
}

// students: [{houseId}, ...] (다른 필드는 무시) -> {houseId: count}. 항상
// HOUSES의 모든 id 키를 포함(빈 하우스도 0으로 명시) — assignBalancedHouseId
// 가 안전하게 바로 소비할 수 있게.
export function computeHouseCounts(students) {
  const counts = {}
  for (const h of HOUSES) counts[h.id] = 0
  for (const s of (students || [])) {
    const id = s && s.houseId != null ? Number(s.houseId) : null
    if (id != null && Object.prototype.hasOwnProperty.call(counts, id)) counts[id] += 1
  }
  return counts
}

// ── 2) 주간 경계(월요일 시작~일요일 종료, ISO 주 관례) ────────────────────
// wordKing.js의 getWeekPeriod()와 동일한 규칙을 의도적으로 재구현했다(위
// 파일 헤더 "순수 계산 모듈은 서로 import하지 않는다" 원칙 그대로 —
// wordKing.js 자신도 이 15줄짜리 로직을 다른 곳에서 가져오지 않고 자체
// 정의했다). 서버(Vercel, UTC 근방)와 학생 타임존(KST)의 미세한 경계
// 차이는 paulRankShared.js의 day 기간키(±2일 허용)와 같은 이유로 "날짜
// 단위" 정밀도까지만 다룬다 — 학원 내부 팀 소속감 표시라 초 단위 경계
// 다툼이 실질적 이득으로 이어지지 않는다.
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

// ── 3) 팀 점수 집계: 티켓 "획득"만 합산(소비/구매 delta<0은 제외) ────────
// 원칙 근거(PAUL_PRINCIPLES.md 3번, GAME_DESIGN.md 6번, PAUL_BIBLE.md §10):
// 팀 점수는 "그냥 오래 누른 개인이 캐리"하는 왜곡을 피하려 별(XP, 파밍
// 가능)이 아니라 티켓(저빈도·비파밍성 행동) 합산으로 설계됐다. 티켓
// 상점에서 개인이 코스메틱을 사는 행위(delta<0, ticketEconomy.js의
// redeemReward)는 팀 기여와 무관한 개인 소비다 — 이 소비가 팀 점수를
// 깎으면 "내가 스티커를 사면 우리 팀 점수가 내려간다"는 의도치 않은
// 벌칙이 생긴다. 그래서 이 함수는 양수 delta(실제 획득 이벤트)만 그 주
// 범위로 필터링해 합산한다 — appendTicketEntry가 만드는 개별 entry.delta/
// entry.at 필드를 그대로 읽는다(ticketEconomy.js의 원장 스키마 재사용,
// 새 필드 없음. 이 파일이 ticketEconomy.js를 import하지 않는 것은 위
// "순수 모듈 간 무의존" 원칙 때문 — entry 모양(id/delta/reason/at)만
// 문서 계약으로 공유한다).
//
// students: [{id, houseId}], ledgerByStudentId: {studentId: ticketLedger}.
// 반환: {houseId: score}(HOUSES의 모든 id 키 포함, 항상 정수 >= 0).
export function computeHouseWeeklyScores(students, ledgerByStudentId, now = new Date()) {
  const { periodStart, periodEnd } = getWeekPeriod(now)
  const scores = {}
  for (const h of HOUSES) scores[h.id] = 0
  for (const s of (students || [])) {
    const houseId = s && s.houseId != null ? Number(s.houseId) : null
    if (houseId == null || !Object.prototype.hasOwnProperty.call(scores, houseId)) continue
    const ledger = (ledgerByStudentId && ledgerByStudentId[s.id]) || []
    if (!Array.isArray(ledger)) continue
    for (const entry of ledger) {
      if (!entry || typeof entry.at !== 'string' || entry.at.length < 10) continue
      const delta = Number(entry.delta) || 0
      if (delta <= 0) continue // 소비/구매는 팀 점수에서 제외(위 원칙 근거)
      const dateStr = entry.at.slice(0, 10)
      if (dateStr >= periodStart && dateStr <= periodEnd) scores[houseId] += delta
    }
  }
  return scores
}

// 학생 화면의 "우리 하우스: OO · 이번 주 팀 점수: N" 최소 표시 전용 헬퍼 —
// 개인 순위/타 하우스 비교를 절대 넣지 않는다(PAUL_PRINCIPLES.md 3번
// "하위권 개인 공개 망신 없음" + "House는 팀 단위로만 비교" 원칙 그대로).
// student가 하우스 미배정(houseId null)이면 null 반환.
export function getOwnHouseWeeklyDisplay(studentId, students, ledgerByStudentId, now = new Date()) {
  const student = (students || []).find((s) => s && s.id === studentId)
  if (!student || student.houseId == null) return null
  const scores = computeHouseWeeklyScores(students, ledgerByStudentId, now)
  const house = getHouseById(student.houseId)
  if (!house) return null
  return { house, weeklyScore: scores[house.id] || 0 }
}

// ── 4) Weekly Events — 설정 슬롯만(GAME_DESIGN.md 8번, 실제 이벤트 정의/
// 트리거는 이번 범위 아님) ────────────────────────────────────────────
// ticketEconomy.js TICKET_GRANT_TABLE의 'weekly-event-complete'
// (status:'planned')와 같은 예약 패턴 — 실제 이벤트 유형을 정의할 배열
// 자리만 만든다. §8 원문("정적 JS 객체로 주 유형을 정의, 신규 이벤트
// 정의 테이블 없음")을 그대로 반영해 지금은 빈 배열이다. 실제 착수 시
// { id, label, checkFn(studentDailyHistory) } 형태 항목만 이 배열에
// 추가하면 되는 구조 — Word King이 이미 증명한 "확장은 이 파일의 공식/
// 상수만 바꾸면 되고 스키마 변경은 필요 없다" 패턴을 그대로 따른다.
// classes.weekly_event_enabled(SQL, 기본 false)가 교사별 on/off 슬롯이고,
// 이 배열이 "무엇을 켤지"의 콘텐츠 슬롯이다 — 둘 다 이번 라운드엔 아무
// 코드도 읽지 않는다(죽은 컬럼/빈 배열처럼 보이는 것은 의도된 결과 —
// "확장 가능한 구조로 자리만" 만들라는 지시 그대로).
export const WEEKLY_EVENT_TYPES = Object.freeze([])
