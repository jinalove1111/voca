// src/utils/paulRankShared.js — Paul Rank System (Word King 이전 단계): 순수
// 설정 + 순수 함수 전용 모듈. 2026-07-19.
//
// ⚠️ 이 파일은 브라우저(Vite, src/hooks/usePaulRank.js 경유)와 서버리스
// 함수(Node, api/grant-xp.js가 상대경로로 직접 import) 양쪽에서 그대로
// import된다 — 그래서 반드시 "완전히 순수"해야 한다: React 없음,
// `import.meta.env` 없음, `window`/`document` 없음, 네트워크 호출 없음.
// (api/_pinAuth.js가 이미 이 패턴을 쓰고 있음 — 서버가 클라이언트와 같은
// 순수 로직을 재구현 없이 그대로 재사용하는 이 저장소의 확립된 방식.)
//
// ── 설계 판단: "별을 조용히 XP로 변환하지 말라" ────────────────────────────
// 이 저장소는 이미 `student_progress.total_xp` 컬럼을 갖고 있고,
// `wordLibrary.js`의 `syncStudentProgress()`가 `progressRow.total_xp =
// totalStars`로 매 동기화마다 그대로 덮어쓴다(순수 산술 사본, 감사
// 추적 없음, 이벤트 단위 기록 없음). 운영자가 이번에 명시적으로 요구한
// "별을 조용히 XP로 변환하지 말라"는 정확히 이 기존 패턴을 새 Rank
// 시스템에서는 반복하지 말라는 뜻으로 읽었다 — 그래서:
//   1) 이 Rank 시스템의 XP는 `total_xp`/`totalStars`를 전혀 읽지 않는다.
//      완전히 새로운, 독립적으로 누적되는 값이다.
//   2) 대신 기존에 별을 지급하던 "같은 학습 이벤트"(useStudent.js의
//      addStars() 호출 지점 4곳 — 레벨업 미션 클리어/오늘의 미션 4/4
//      보너스/중복 스티커 환전/쓰기시험 콤보 보너스)를 XP 지급의
//      트리거로 재사용한다 — 같은 학습 신호를 "재사용"하되, 별 총합에서
//      산수로 XP를 뽑아내지 않는다(트리거 재사용 ≠ 값 파생).
//   3) 각 트리거의 XP 지급액은 아래 XP_EVENT_TABLE에 독립적으로 고정
//      값으로 정의한다(별 지급액과 우연히 같은 숫자를 쓰더라도, 그
//      숫자는 "별 총합의 함수"가 아니라 "이벤트 종류의 함수"다 — 별을
//      나중에 리밸런싱해도 XP 곡선은 전혀 흔들리지 않는다는 뜻).
//   4) 지급 자체는 감사 가능한 원장(xp_ledger, 이벤트별 unique 제약)에만
//      기록되고, 클라이언트는 절대 원장에 직접 쓰지 않는다(api/grant-xp.js
//      가 유일한 쓰기 경로 — 아래 API 문서 참고).
// 기존 total_xp 컬럼은 건드리지 않는다(레거시 표시값, DebugPage.jsx가
// 그대로 참조 — 삭제/의미변경 금지, CLAUDE.md 부록: 기존 데이터/필드
// 보존 원칙).
//
// ── v2.3.1(2026-07-19) 갱신 — "addStars() 호출 4곳과 XP 트리거가 1:1"은
// 더 이상 사실이 아니다 ────────────────────────────────────────────────
// 위 2)번 문단은 v2.3 최초 설계 당시 판단이었다. 운영자가 실제 프로덕션
// 테스트에서 "XP가 단어 단위로 지급된다"(레벨업 미션 클리어가 wordId를
// source_event_id에 그대로 씀 — 무한 파밍 가능)를 발견해 행동(Action)
// 단위로 재설계했다. 지금은 addStars() 4곳 중 레벨업 미션 클리어/중복
// 스티커 환전 2곳은 XP를 전혀 지급하지 않고(별만 그대로 지급), 나머지
// (오늘의 미션 4/4/쓰기시험)는 트리거 자체가 "일별 카테고리 완료" 신호로
// 대체됐다 — 상세는 아래 4)번 XP_EVENT_TABLE 헤더 주석 참고.

// ── 1) Hat Stage(모자 크기) — 정확히 5단계, 운영자 지정 scale 그대로.
// "순수 설정 데이터"만 — 시각/애니메이션 구현은 이번 범위 밖(PAUL_BIBLE.md
// §8이 DESIGN DIRECTION으로 표기해 둔 부분).
export const HAT_STAGES = [
  { id: 'tiny', order: 0, name: 'Tiny', scale: 0.88 },
  { id: 'small', order: 1, name: 'Small', scale: 0.94 },
  { id: 'growing', order: 2, name: 'Growing', scale: 1.0 },
  { id: 'big', order: 3, name: 'Big', scale: 1.07 },
  { id: 'max', order: 4, name: 'Max', scale: 1.14 },
]

// ── 2) Rank(모자 색) — 메이저 축. minXp는 "이 Rank가 시작되는 누적 XP".
// 임계값은 이번 세션의 최초 판단(아래 XP_EVENT_TABLE 기준 학습량 추정)이며,
// 운영자가 실제 데이터를 보고 이 배열만 고치면 전체(계산/표시/관리자 조회)
// 에 즉시 반영된다 — 여러 컴포넌트에 하드코딩하지 않고 한 곳에만 정의하는
// 것이 이번 구현 범위의 핵심 요구사항.
export const RANKS = [
  { id: 'sprout', order: 0, name: '새싹모자', hatColor: '#8BC34A', minXp: 0 },
  { id: 'beanie', order: 1, name: '비니', hatColor: '#4FC3F7', minXp: 50 },
  { id: 'explorer', order: 2, name: '탐험모자', hatColor: '#A1887F', minXp: 150 },
  { id: 'wizard', order: 3, name: '마법모자', hatColor: '#9575CD', minXp: 400 },
  { id: 'crown', order: 4, name: '왕관모자', hatColor: '#FFD54F', minXp: 800 },
]

// ── 3) 경험 언락 설정(Experience-unlock configuration) — forward-compatible
// 스키마만. 지금은 어떤 실제 기능도 이 설정을 "소비"하지 않는다(운영자
// 지시: "실제 게임/티켓을 만들지 않는다" — 매핑 자체만 코드로 표현).
// status: 'active'(지금 이미 실제로 열려있는 것) | 'planned'(이 자리에
// 미래에 무엇이 연결될지 표시만 한 것, 아직 아무 코드도 읽지 않음).
export const EXPERIENCE_UNLOCKS = {
  tiny: {
    hatStageId: 'tiny',
    label: '핵심 학습',
    unlocks: [
      { id: 'core-learning', type: 'core', status: 'active', description: '단어 학습 / 퀴즈 / 발음 / 쓰기 등 핵심 학습 기능 — 모든 학생에게 항상 열려있음(Rank/Hat Stage와 무관)' },
    ],
  },
  small: {
    hatStageId: 'small',
    label: '보너스 활동 미리보기',
    unlocks: [
      { id: 'bonus-preview', type: 'preview', status: 'planned', description: '보너스 활동(미니게임 등) 미리보기 — 미구현, 자리만 표시' },
    ],
  },
  growing: {
    hatStageId: 'growing',
    label: '첫 미니게임 접근',
    unlocks: [
      { id: 'first-minigame-access', type: 'minigame', status: 'planned', description: '첫 미니게임 접근 — 미구현, 자리만 표시' },
    ],
  },
  big: {
    hatStageId: 'big',
    label: '추가 게임 선택 / 도전',
    unlocks: [
      { id: 'extra-game-choice', type: 'minigame', status: 'planned', description: '추가 미니게임 선택 — 미구현, 자리만 표시' },
      { id: 'challenge-mode', type: 'challenge', status: 'planned', description: '도전 모드 — 미구현, 자리만 표시' },
    ],
  },
  max: {
    hatStageId: 'max',
    label: '승급 도전 + 특별 티켓 기회',
    unlocks: [
      { id: 'promotion-challenge', type: 'challenge', status: 'planned', description: '다음 Rank 승급 도전 — 미구현, 자리만 표시' },
      { id: 'special-ticket-chance', type: 'ticket', status: 'planned', description: '특별 티켓 획득 기회 — 미구현, GAME_DESIGN.md §4 Ticket Economy와 연결 예정' },
    ],
  },
}

// ── 4) XP 이벤트 테이블(서버가 신뢰하는 유일한 금액 원천) ───────────────
// v2.3.1(2026-07-19, 행동 단위 리팩터링) — **운영자가 실제 프로덕션에서
// 발견**: v2.3의 `mission-clear`(레벨업 미션 클리어, `useStudent.js`
// `answerMission()`)가 `source_event_id`에 `wordId`를 그대로 썼다
// (구 코드: `` `mission-clear:${wordId}` ``) — 학생이 (특히 오답으로
// 미션 큐에 들어간) 단어를 계속 넘기며 미션을 깨면 **단어 개수만큼** XP가
// 무한히 쌓이는 파밍 경로였다. `duplicate-sticker-bonus`(중복 스티커
// 환전)도 같은 성격의 구멍이었다 — 무작위 키(`randEventId()`)를 써서
// "네트워크 재시도 중복"은 막았지만, 오늘의 미션(4/4)이 하루 여러 번
// 반복 완료될 때마다(설계상 의도된 동작, 아래 `daily-mission-complete`
// 주석 참고) 매번 새 무작위 키로 별개 지급이 일어나 사실상 무제한이었다.
// `spelling-combo-N`도 `source_event_id`가 `날짜:wordId` 조합이라 같은
// 날 서로 다른 단어에서 콤보 마일스톤에 반복 도달할 때마다 별개 지급이
// 가능했다(운영자가 함께 의심 지목).
//
// 새 설계 원칙: **XP는 "단어"가 아니라 "행동(그날의 학습 카테고리 완료)"
// 단위로만 지급한다.** 아래 4개 일별(day) 이벤트는 기존
// `useStudent.js`의 `categoriesCompleted`(그날 단어보기/예문/퀴즈/발음
// 4개 카테고리 중 몇 개를 채웠는지, 0~4) 개념을 그대로 재사용한다 —
// "카테고리 완료"는 이미 "여러 단어를 거쳐야 도달하는 일별 1회성
// 이벤트"라 구조적으로 파밍 방지가 된다(운영자 설계 힌트). 단, 4번째
// 카테고리는 그대로 재사용하지 않았다 — 실측 재확인 결과
// `categoriesCompleted`의 실제 4개 카테고리는 단어보기/예문/퀴즈/**발음**
// (`countCategoriesCompleted()`, `useStudent.js`)이고 "쓰기(spelling
// test)"는 그 4개에 포함되지 않는다(별도의 `history.spellingCorrect`
// 일별 카운터로 이미 추적 중). 운영자가 8개 이벤트 이름에 "발음"이 아니라
// "writing-complete"를 지정했으므로, 발음은 기존처럼 `daily-mission-
// complete`(4/4 게이트)에만 계속 기여하게 두고(그 자체는 그대로 유지),
// `writing-complete`는 발음이 아니라 **쓰기시험**의 같은 "오늘 처음 GOAL
// 도달" 신호로 새로 정의했다(`useStudent.js` `recordSpellingAnswer()`
// 참고) — 근거는 이 판단 자체를 결정 문서(`wiki/decisions.md` #10)에
// 남긴다.
//
// `source_event_id` 패턴은 전부 `{eventType}:{기간키}` — 일별 이벤트는
// 날짜 문자열(이 저장소 기존 `todayStr()` 포맷, `toDateString()`을 그대로
// 재사용 — 새 포맷 발명 금지, `history`/`round.date`가 이미 이 포맷으로
// 키잉되어 있어 원장과 진행기록을 사람이 대조하기도 쉽다). `student_id`는
// `xp_ledger`의 별도 컬럼이라 문자열에 중복으로 넣지 않는다(unique 제약이
// `(student_id, source_event_id)` 조합이라 학생 안에서만 유일하면 충분).
//
// `status: 'active'`(지금 실제로 클라이언트가 트리거) | `'planned'`(스키마
// 슬롯만 예약, 아직 아무 코드도 이 이벤트를 만들지 않음 — EXPERIENCE_UNLOCKS
// 의 status 패턴을 그대로 재사용, 운영자 지시: "Word King을 실제로
// 구현하지 마라, 이벤트 타입 이름만 예약"). `resolveXpAmount()`가
// `status !== 'active'`이면 null을 반환하므로, `api/grant-xp.js`가 이
// 3개 이벤트를 **지금은 어떤 요청이 와도 전부 거부**한다(엔드포인트
// 자체는 공개돼 있으므로, "스키마에 슬롯만 있고 서버는 아직 지급하지
// 않는다"까지 구현해야 진짜로 안전 — 슬롯만 두고 서버가 받아주면 그
// 자체가 새 파밍 구멍이 된다).
// `period`: `'day'`(날짜 문자열 기간키, 아래 `isValidDayPeriodKey()`로
// 서버가 "오늘 근방"인지까지 검증) | `'week'`(ISO 주차 등 — `weekly-
// streak`가 실제 구현될 때 정의) | `'admin-event'`(관리자가 지정하는
// 이벤트 ID — `word-king-complete`/`special-event`가 실제 구현될 때
// 정의). `'day'` 외 나머지는 지금 `status:'planned'`라 이 필드가 실제로
// 검증에 쓰이는 코드 경로에 도달하지 않는다(아래 `isValidSourceEventIdForEvent`
// 주석 참고) — 미래 세션이 하나씩 `'active'`로 전환할 때 그 이벤트 성격에
// 맞는 기간키 검증을 채워 넣으면 된다(스키마/API 변경 없이).
export const XP_EVENT_TABLE = {
  'word-view-complete': { amount: 2, period: 'day', status: 'active' }, // 오늘 단어보기(round.wordsViewed) 카테고리 첫 GOAL 도달
  'listening-complete': { amount: 2, period: 'day', status: 'active' }, // 오늘 예문 청취(round.examplesHeard) 카테고리 첫 GOAL 도달
  'writing-complete': { amount: 2, period: 'day', status: 'active' }, // 오늘 쓰기시험 정답(history.spellingCorrect) 카테고리 첫 GOAL 도달
  'quiz-complete': { amount: 2, period: 'day', status: 'active' }, // 오늘 퀴즈(round.quizSolved) 카테고리 첫 GOAL 도달
  'daily-mission-complete': { amount: 10, period: 'day', status: 'active' }, // 기존 mission-bonus-4of4 재명명/표준화 — 오늘의 미션(4/4)은 하루 여러 번 반복 완료 가능(별/스티커는 매번 지급, 기존 동작 유지)하지만 XP는 날짜 기간키라 오늘 첫 완료 1회만
  // ↓ 예약 슬롯만 — 실제로 트리거하는 코드 없음(운영자 지시). amount는
  // 잠정값(실제 기능 설계 시 재산정), status가 'planned'인 한 서버가
  // 무조건 거부하므로 지금은 어떤 값이어도 지급되지 않는다.
  'word-king-complete': { amount: 15, period: 'admin-event', status: 'planned' }, // Word King(주간 대표) — 미구현, 이벤트 타입만 예약
  'weekly-streak': { amount: 5, period: 'week', status: 'planned' }, // 주간 스트릭 보너스 — 미구현, 이벤트 타입만 예약
  'special-event': { amount: 10, period: 'admin-event', status: 'planned' }, // 관리자 특별 이벤트(시즌 등) — 미구현, 이벤트 타입만 예약
}

// 서버(api/grant-xp.js)와 클라이언트(usePaulRank.js pre-check)가 공유하는
// 순수 조회 함수 — 알 수 없는 eventType이거나 아직 'active'가 아닌
// (planned) 이벤트는 null(거부).
export function resolveXpAmount(eventType) {
  const config = Object.prototype.hasOwnProperty.call(XP_EVENT_TABLE, eventType)
    ? XP_EVENT_TABLE[eventType]
    : null
  return (config && config.status === 'active') ? config.amount : null
}

// ── 5) 순수 계산 — Rank / Hat Stage / 다음 단계까지 진행률 ─────────────
// 입력은 오직 누적 XP(숫자) 하나뿐이다(Unit/반/시간 등 어떤 것도 입력에
// 없음 — "Rank는 Unit 전환에 전혀 영향받지 않는다"는 요구사항이 이 함수의
// 시그니처 자체로 구조적으로 보장됨). 결정적(deterministic) — 같은 xp면
// 항상 같은 결과, 테스트로 증명 가능(scripts/testPaulRank.mjs).
export function computeRankState(xpInput) {
  const xp = Math.max(0, Number(xpInput) || 0)

  let rankIndex = 0
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].minXp) rankIndex = i
    else break
  }
  const rank = RANKS[rankIndex]
  const nextRank = RANKS[rankIndex + 1] || null

  const xpIntoRank = xp - rank.minXp
  const xpForNextRank = nextRank ? nextRank.minXp - rank.minXp : null
  const isMaxRank = !nextRank
  // progressRatio: 이번 Rank 안에서 다음 Rank까지 얼마나 왔는지(0~1).
  // 최고 Rank(왕관모자)는 "다음"이 없으므로 항상 1(=Max hat stage 고정).
  const progressRatio = isMaxRank ? 1 : Math.min(1, Math.max(0, xpIntoRank / xpForNextRank))

  // 진행률 [0,1)을 5개 균등 구간으로 나눠 Hat Stage(모자 크기) 인덱스를
  // 결정 — [0,.2)=Tiny [.2,.4)=Small [.4,.6)=Growing [.6,.8)=Big [.8,1]=Max.
  const hatStageIndex = Math.min(HAT_STAGES.length - 1, Math.floor(progressRatio * HAT_STAGES.length))
  const hatStage = HAT_STAGES[hatStageIndex]

  return {
    xp,
    rank,
    rankIndex,
    nextRank,
    isMaxRank,
    xpIntoRank,
    xpForNextRank,
    xpRemainingToNextRank: isMaxRank ? 0 : Math.max(0, xpForNextRank - xpIntoRank),
    progressRatio,
    hatStage,
    hatStageIndex,
    experienceUnlock: EXPERIENCE_UNLOCKS[hatStage.id] || null,
  }
}

// xp_ledger 행 배열 -> 합계(pure). 클라이언트/관리자 화면 어디서 읽든
// "저장된 합계 컬럼"이 아니라 항상 이 함수로 그 자리에서 파생시켜야
// 화면마다 다른 숫자가 나오는 걸 원천 차단한다(computeStudentStats 공유
// 패턴과 같은 정신).
export function sumXpLedger(rows) {
  if (!Array.isArray(rows)) return 0
  return rows.reduce((sum, r) => sum + (Number(r?.amount) || 0), 0)
}

// ── 6) 입력 검증 헬퍼(서버/클라이언트 공유) ────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isValidStudentId(id) {
  return typeof id === 'string' && UUID_RE.test(id)
}
export function isValidSourceEventId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200
}
export function isValidEventType(eventType) {
  return resolveXpAmount(eventType) !== null
}

// v2.3.1 — "행동 단위" 기간키 검증. 서버(api/grant-xp.js)가 클라이언트가
// 보낸 sourceEventId를 eventType 화이트리스트뿐 아니라 **기간키 형식/범위**
// 까지 확인해야, "같은 eventType에 매번 다른 무작위/조작된 기간키를 붙여
// 무한히 재요청"하는 우회 파밍이 막힌다(XP_EVENT_TABLE 헤더 주석의
// mission-clear/duplicate-sticker-bonus 사고 재발 방지 — 이번엔 wordId
// 대신 "가짜 날짜"로 같은 구멍이 재발하지 않도록 서버가 직접 검증).
//
// "오늘과 리터럴 일치"가 아니라 관대한 허용 폭(±2일)만 확인한다 — 서버
// (Vercel, UTC 근방)와 학생 클라이언트(한국시간 KST, UTC+9)의 타임존이
// 달라 자정 근처 정상 요청까지 오탐 차단할 위험이 있기 때문(안정성
// 최우선, CLAUDE.md 규칙 1). 이 폭 안에서는 여전히 서로 다른 날짜 키를
// 몇 개 만들어낼 수 있어 "완전히 0"은 아니지만, 하루 기준 이벤트당
// 최대 2~3일치(수 XP)로 유계(bounded)된다 — "단어를 계속 넘기면 무한정
// 쌓이는" 이전 사고와는 질적으로 다른, 실용적 절충(문서화된 판단).
const DAY_KEY_TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000
export function isValidDayPeriodKey(periodKey, now = new Date()) {
  if (typeof periodKey !== 'string' || periodKey.length === 0) return false
  const parsed = new Date(periodKey)
  if (Number.isNaN(parsed.getTime())) return false
  return Math.abs(now.getTime() - parsed.getTime()) <= DAY_KEY_TOLERANCE_MS
}

// eventType별로 source_event_id가 "{eventType}:{그 이벤트 성격에 맞는
// 기간키}" 형태인지 전체 확인 — api/grant-xp.js가 유일하게 쓰는 진입점.
// status:'planned'인 이벤트(word-king-complete/weekly-streak/special-event)
// 는 resolveXpAmount()가 이미 null을 반환해 api/grant-xp.js가 이 함수까지
// 오기 전에 거부하므로, 아래 'week'/'admin-event' 분기는 지금은 실행되지
// 않는 전방호환 스캐폴딩이다(각 이벤트가 실제 구현되어 status:'active'로
// 전환되는 시점에, 그 이벤트 성격에 맞는 검증(ISO 주차 형식/관리자 이벤트ID
// 화이트리스트 등)으로 채워야 한다 — 지금 값을 대충 채우면 나중에 그
// 이벤트가 활성화되는 순간 조용히 취약해지므로, 최소한(빈 문자열만 거부)만
// 두고 TODO로 명시).
export function isValidSourceEventIdForEvent(eventType, sourceEventId, now = new Date()) {
  if (!isValidSourceEventId(sourceEventId)) return false
  const config = XP_EVENT_TABLE[eventType]
  if (!config) return false
  const prefix = `${eventType}:`
  if (!sourceEventId.startsWith(prefix)) return false
  const periodKey = sourceEventId.slice(prefix.length)
  if (config.period === 'day') return isValidDayPeriodKey(periodKey, now)
  // TODO(week/admin-event 실제 구현 시): ISO 주차 형식 검증 / 관리자
  // 이벤트ID 화이트리스트 검증으로 교체. 지금은 도달 불가능(status가
  // 'planned'인 한 resolveXpAmount가 먼저 거부) — 최소 방어만.
  return periodKey.length > 0
}
