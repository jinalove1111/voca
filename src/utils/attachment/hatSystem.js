// 모자 컬렉션(2026-07-22, 애착 시스템) — 학생 아바타가 수집·장착하는
// 코스메틱 모자 8종의 카탈로그 + 결정론적 획득 규칙.
//
// 브랜드 규칙: 폴(Paul)은 항상 자신의 상징인 검은 모자를 쓴다 — 이
// 컬렉션은 "학생 아바타"의 모자다. 폴의 모자/이미지는 절대 안 바꾼다.
//
// Paul Town v2.0 리컬러(2026-07-22): 학생 모자는 전부 "영국 신사 폴"과
// 같은 톱햇(🎩) 디자인에 색만 다른 컬러 라인업이다 — 서로 다른 모양
// 이모지 7종 대신 같은 디자인 + colorName/colorHex로 표현한다. 기존 7종
// id(hat_starter…hat_crown)는 프로덕션 인벤토리에 이미 영속돼 있으므로
// 절대 바꾸지 않는다(id를 바꾸면 이미 획득한 모자가 고아가 됨). 획득
// 규칙/sourceLabel도 그대로 — 바뀌는 건 표현(이름/이모지/색)뿐이다.
//
// Paul Rank의 HAT_STAGES(paulRankShared.js — 새싹모자~왕관모자, XP 진행
// 표시기)와는 완전히 별개 시스템이다: HAT_STAGES는 Rank 진행률의 "표시"
// 일 뿐 수집/장착 개념이 없고, 이 컬렉션은 영구 소장 코스메틱이다.
// 이름 충돌을 피하려고 여기 모자들은 별도 id 네임스페이스(hat_*)를 쓴다.
//
// 획득 규칙 원칙(운영자 지시 그대로):
// - 무작위 없음, 뽑기 없음, 화폐 없음, 결제 없음, 스트릭 징벌 없음,
//   희소성 연출 없음 — 모든 아이는 모든 모자를 얻을 수 있다.
// - 오직 의미 있는 학습 성취로만 획득. 규칙은 전부 attachmentCore의
//   파생 통계(실제 학습 데이터)만 읽는 순수 함수 — 같은 데이터면 항상
//   같은 결과(결정론).
// - 임계값은 코드 상수(HAT_THRESHOLDS)로 한 곳에 모아 조정 가능.
// - 한 번 획득한 모자는 회수되지 않는다(인벤토리는 append-only —
//   스트릭이 끊겨도 초록색 모자를 뺏지 않는다 = 스트릭 징벌 금지.
//   같은 이유로 hat_rose도 "이번 주 5일"이 다음 주에 리셋돼도 유지).

export const HAT_THRESHOLDS = {
  explorerCleared: 10,
  chefStreak: 7,
  scientistQuizCorrect: 100,
  wizardMastered: 30,
  crownCleared: 200,
  roseWeekDays: 5, // 한 주(월~일)에 5일 학습하면 분홍색 모자
}

// unlock(stats, ctx): stats = deriveAttachmentStats 결과,
// ctx = { completedUnits } (유닛 완료 목록 — 호출자가 wordLibrary로 구성)
export const HAT_CATALOG = [
  {
    id: 'hat_starter', emoji: '🎩', name: '검은색 폴 모자',
    colorName: '검은색', colorHex: '#2d2d2d',
    desc: '첫 데일리 미션(4/4)을 완료하면 획득',
    sourceLabel: '첫 데일리 미션 완료',
    unlock: (stats) => !!stats.firstMissionDayKey,
  },
  {
    id: 'hat_explorer', emoji: '🎩', name: '파란색 폴 모자',
    colorName: '파란색', colorHex: '#4FC3F7',
    desc: `단어 ${HAT_THRESHOLDS.explorerCleared}개를 클리어하면 획득`,
    sourceLabel: `단어 ${HAT_THRESHOLDS.explorerCleared}개 클리어`,
    unlock: (stats) => stats.clearedCount >= HAT_THRESHOLDS.explorerCleared,
  },
  {
    id: 'hat_chef', emoji: '🎩', name: '초록색 폴 모자',
    colorName: '초록색', colorHex: '#66BB6A',
    desc: `${HAT_THRESHOLDS.chefStreak}일 연속 학습하면 획득 — 매일 꾸준히!`,
    sourceLabel: `${HAT_THRESHOLDS.chefStreak}일 연속 학습`,
    unlock: (stats) => stats.streak >= HAT_THRESHOLDS.chefStreak,
  },
  {
    id: 'hat_scientist', emoji: '🎩', name: '하얀색 폴 모자',
    colorName: '하얀색', colorHex: '#ECEFF1',
    desc: `퀴즈 정답을 ${HAT_THRESHOLDS.scientistQuizCorrect}개 모으면 획득`,
    sourceLabel: `퀴즈 정답 ${HAT_THRESHOLDS.scientistQuizCorrect}개`,
    unlock: (stats) => stats.totalQuizCorrect >= HAT_THRESHOLDS.scientistQuizCorrect,
  },
  {
    id: 'hat_wizard', emoji: '🎩', name: '보라색 폴 모자',
    colorName: '보라색', colorHex: '#9575CD',
    desc: `단어 ${HAT_THRESHOLDS.wizardMastered}개를 마스터하면 획득`,
    sourceLabel: `단어 ${HAT_THRESHOLDS.wizardMastered}개 마스터`,
    unlock: (stats) => stats.masteredCount >= HAT_THRESHOLDS.wizardMastered,
  },
  {
    id: 'hat_graduation', emoji: '🎩', name: '빨간색 폴 모자',
    colorName: '빨간색', colorHex: '#E57373',
    desc: '유닛 하나를 완전히 끝내면 획득',
    sourceLabel: '유닛 완주',
    unlock: (stats, ctx) => (ctx?.completedUnits?.length || 0) >= 1,
  },
  {
    id: 'hat_crown', emoji: '🎩', name: '금색 폴 모자',
    colorName: '금색', colorHex: '#FFD54F',
    desc: `단어 ${HAT_THRESHOLDS.crownCleared}개를 클리어한 진짜 단어왕의 모자`,
    sourceLabel: `단어 ${HAT_THRESHOLDS.crownCleared}개 클리어`,
    unlock: (stats) => stats.clearedCount >= HAT_THRESHOLDS.crownCleared,
  },
  {
    // 8번째 모자(Paul Town v2.0 신규). 규칙 선택 문서화: 후보였던
    // "누적 학습일 60일" 대신 "한 주 5일 학습"을 채택 — 아이가 한 주
    // 단위로 체감·도전할 수 있는 목표라서다. thisWeek는 attachmentCore가
    // history에서 매번 파생하는 월요일 시작 주간 버킷(실데이터, 무작위
    // 없음)이고, 주가 바뀌어 버킷이 리셋돼도 인벤토리는 append-only라
    // 획득한 모자는 유지된다(회수 없음 원칙).
    id: 'hat_rose', emoji: '🎩', name: '분홍색 폴 모자',
    colorName: '분홍색', colorHex: '#F48FB1',
    desc: `한 주에 ${HAT_THRESHOLDS.roseWeekDays}일 학습하면 획득`,
    sourceLabel: `한 주 ${HAT_THRESHOLDS.roseWeekDays}일 학습`,
    unlock: (stats) => (stats.thisWeek?.daysStudied || 0) >= HAT_THRESHOLDS.roseWeekDays,
  },
]

export const hatById = (id) => HAT_CATALOG.find((h) => h.id === id) || null

// UI용 색 스타일 헬퍼 — 모자 id → { colorName, colorHex }. 톱햇 디자인은
// 전부 동일(🎩)하고 색만 다르므로, UI는 이 값으로 틴트/배경을 입힌다.
export const HAT_COLOR_STYLE = Object.fromEntries(
  HAT_CATALOG.map((h) => [h.id, { colorName: h.colorName, colorHex: h.colorHex }]),
)

// ── 이모지 틴트 스타일(표시 전용 · 단일 진실 원천) ────────────────────────
// 2026-08-26 — 모자 이름과 화면 색이 어긋나던 실사고 수정(Irene: 저장값은
// 'hat_scientist'(하얀색)인데 화면엔 검은 톱햇). 8종이 전부 같은 🎩
// (U+1F3A9, 모든 이모지 폰트에서 검은색)를 쓰고 색은 colorHex 틴트로만
// 구분하는 설계인데, 그 틴트가 HatCollection/Dashboard 4개 렌더 지점에
// 적용돼 있지 않았다. 기법 자체는 HatCeremony/PaulTown이 이미 쓰던 것을
// 그대로 함수로 끌어올린 것뿐 — 새 기법을 발명하지 않는다.
//
// 원리: 이모지는 CSS color로 물들지 않으므로 color:transparent로 원본
// 글리프를 지우고, 오프셋 0 그림자로 같은 실루엣을 원하는 색으로 다시
// 칠한다(순수 CSS, 라이브러리 0).
//
// 밝은 색 처리: 하얀색(#ECEFF1)·금색(#FFD54F)은 흰 카드나 밝은 배경에
// 묻힌다. fill은 요구사항대로 colorHex를 그대로 두고, 그 "뒤에" 1px
// 어두운 외곽선만 깔아 실루엣을 살린다. 밝음 판정은 모자별 하드코딩이
// 아니라 colorHex에서 sRGB 상대휘도를 계산해 내린다 — 카탈로그에 새 색을
// 추가해도 규칙이 자동으로 따라온다.
const DEFAULT_HAT_HEX = '#2d2d2d'
const LIGHT_LUMINANCE_THRESHOLD = 0.6
const HAT_OUTLINE_COLOR = 'rgba(0,0,0,0.45)'

// '#abc' / '#aabbcc' → '#aabbcc'. 그 외(null/빈문자/잘못된 형식)는 null.
export function normalizeHexColor(hex) {
  if (typeof hex !== 'string') return null
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const v = m[1]
  return `#${v.length === 3 ? v.split('').map((c) => c + c).join('') : v}`
}

// sRGB 상대휘도(WCAG 정의) 0(검정)~1(흰색). 잘못된 입력은 기본색 기준.
export function hatColorLuminance(hex) {
  const norm = normalizeHexColor(hex) || DEFAULT_HAT_HEX
  const channel = (i) => {
    const c = parseInt(norm.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

/**
 * 모자 이모지에 입힐 인라인 스타일. 모든 렌더 지점(HatCollection 카드/
 * 아바타, Dashboard 홈 아바타/착용 라벨, HatCeremony 수여식, PaulTown
 * 모자걸이)이 이 함수 하나만 쓴다.
 * @param {string} colorHex HAT_CATALOG의 colorHex. 잘못된 값이면 검은색 폴백.
 * @returns {{color: string, textShadow: string}} React style 객체
 */
export function hatTintStyle(colorHex) {
  const hex = normalizeHexColor(colorHex) || DEFAULT_HAT_HEX
  // fill은 항상 첫 레이어 — CSS text-shadow는 앞선 그림자가 위에 그려지므로
  // 외곽선을 뒤에 둬야 colorHex가 덮이지 않는다.
  const layers = [`0 0 0 ${hex}`]
  if (hatColorLuminance(hex) >= LIGHT_LUMINANCE_THRESHOLD) {
    layers.push(
      `-1px 0 0 ${HAT_OUTLINE_COLOR}`,
      `1px 0 0 ${HAT_OUTLINE_COLOR}`,
      `0 -1px 0 ${HAT_OUTLINE_COLOR}`,
      `0 1px 0 ${HAT_OUTLINE_COLOR}`,
    )
  }
  return { color: 'transparent', textShadow: layers.join(', ') }
}

/**
 * 아직 인벤토리에 없는데 규칙을 충족한 모자 목록(획득 이벤트 페이로드).
 * 결정론·멱등: 같은 입력이면 같은 출력, 이미 가진 모자는 절대 다시 안 나옴.
 * @returns [{hatId, earnedAt, source}]
 */
export function evaluateHatUnlocks(stats, ctx, ownedHatIds, now = new Date()) {
  const owned = new Set(ownedHatIds || [])
  const earnedAt = now.toISOString()
  return HAT_CATALOG
    .filter((h) => !owned.has(h.id) && h.unlock(stats, ctx))
    .map((h) => ({ hatId: h.id, earnedAt, source: h.sourceLabel }))
}
