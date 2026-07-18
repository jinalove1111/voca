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
// 클라이언트는 "이 이벤트가 일어났다"만 알리고, 금액은 여기서만 결정된다
// (api/grant-xp.js가 그대로 import해서 씀 — 클라이언트가 보낸 amount는
// 절대 신뢰하지 않는다는 운영자 지시의 직접 구현).
// 기존 addStars() 호출 4곳과 정확히 1:1 대응(useStudent.js 참고).
export const XP_EVENT_TABLE = {
  'mission-clear': 3, // answerMission — 레벨업 보스미션 클리어(기존 addStars(3)과 동일 트리거)
  'mission-bonus-4of4': 10, // 오늘의 미션 4/4 완료 보너스(기존 MISSION_BONUS_STARS)
  'duplicate-sticker-bonus': 20, // 중복 스티커 환전(기존 DUPLICATE_BONUS_STARS)
  'spelling-combo-3': 1, // 쓰기시험 콤보 3 도달(기존 SPELLING_COMBO_BONUS[3])
  'spelling-combo-5': 2, // 콤보 5 도달(기존 SPELLING_COMBO_BONUS[5])
  'spelling-combo-10': 3, // 콤보 10 도달(기존 SPELLING_COMBO_BONUS[10])
}

// 서버(api/grant-xp.js)와 클라이언트(usePaulRank.js pre-check)가 공유하는
// 순수 조회 함수 — 알 수 없는 eventType은 null(거부).
export function resolveXpAmount(eventType) {
  return Object.prototype.hasOwnProperty.call(XP_EVENT_TABLE, eventType)
    ? XP_EVENT_TABLE[eventType]
    : null
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
