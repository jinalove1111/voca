// 모자 컬렉션(2026-07-22, 애착 시스템) — 학생 아바타가 수집·장착하는
// 코스메틱 모자 7종의 카탈로그 + 결정론적 획득 규칙.
//
// 브랜드 규칙: 폴(Paul)은 항상 자신의 상징인 검은 모자를 쓴다 — 이
// 컬렉션은 "학생 아바타"의 모자다. 폴의 모자/이미지는 절대 안 바꾼다.
//
// Paul Rank의 HAT_STAGES(paulRankShared.js — 새싹모자~왕관모자, XP 진행
// 표시기)와는 완전히 별개 시스템이다: HAT_STAGES는 Rank 진행률의 "표시"
// 일 뿐 수집/장착 개념이 없고, 이 컬렉션은 영구 소장 코스메틱이다.
// 이름 충돌을 피하려고 여기 모자들은 별도 id 네임스페이스(hat_*)를 쓴다.
//
// 획득 규칙 원칙(운영자 지시 그대로):
// - 무작위 없음, 뽑기 없음, 화폐 없음, 결제 없음, 스트릭 징벌 없음.
// - 오직 의미 있는 학습 성취로만 획득. 규칙은 전부 attachmentCore의
//   파생 통계(실제 학습 데이터)만 읽는 순수 함수 — 같은 데이터면 항상
//   같은 결과(결정론).
// - 임계값은 코드 상수(HAT_THRESHOLDS)로 한 곳에 모아 조정 가능.
// - 한 번 획득한 모자는 회수되지 않는다(인벤토리는 append-only —
//   스트릭이 끊겨도 요리사 모자를 뺏지 않는다 = 스트릭 징벌 금지).

export const HAT_THRESHOLDS = {
  explorerCleared: 10,
  chefStreak: 7,
  scientistQuizCorrect: 100,
  wizardMastered: 30,
  crownCleared: 200,
}

// unlock(stats, ctx): stats = deriveAttachmentStats 결과,
// ctx = { completedUnits } (유닛 완료 목록 — 호출자가 wordLibrary로 구성)
export const HAT_CATALOG = [
  {
    id: 'hat_starter', emoji: '🧢', name: '스타터 모자',
    desc: '첫 데일리 미션(4/4)을 완료하면 획득',
    sourceLabel: '첫 데일리 미션 완료',
    unlock: (stats) => !!stats.firstMissionDayKey,
  },
  {
    id: 'hat_explorer', emoji: '🎒', name: '탐험가 모자',
    desc: `단어 ${HAT_THRESHOLDS.explorerCleared}개를 클리어하면 획득`,
    sourceLabel: `단어 ${HAT_THRESHOLDS.explorerCleared}개 클리어`,
    unlock: (stats) => stats.clearedCount >= HAT_THRESHOLDS.explorerCleared,
  },
  {
    id: 'hat_chef', emoji: '👨‍🍳', name: '요리사 모자',
    desc: `${HAT_THRESHOLDS.chefStreak}일 연속 학습하면 획득 — 매일 꾸준히!`,
    sourceLabel: `${HAT_THRESHOLDS.chefStreak}일 연속 학습`,
    unlock: (stats) => stats.streak >= HAT_THRESHOLDS.chefStreak,
  },
  {
    id: 'hat_scientist', emoji: '🥼', name: '과학자 모자',
    desc: `퀴즈 정답을 ${HAT_THRESHOLDS.scientistQuizCorrect}개 모으면 획득`,
    sourceLabel: `퀴즈 정답 ${HAT_THRESHOLDS.scientistQuizCorrect}개`,
    unlock: (stats) => stats.totalQuizCorrect >= HAT_THRESHOLDS.scientistQuizCorrect,
  },
  {
    id: 'hat_wizard', emoji: '🧙', name: '마법사 모자',
    desc: `단어 ${HAT_THRESHOLDS.wizardMastered}개를 마스터하면 획득`,
    sourceLabel: `단어 ${HAT_THRESHOLDS.wizardMastered}개 마스터`,
    unlock: (stats) => stats.masteredCount >= HAT_THRESHOLDS.wizardMastered,
  },
  {
    id: 'hat_graduation', emoji: '🎓', name: '졸업 모자',
    desc: '유닛 하나를 완전히 끝내면 획득',
    sourceLabel: '유닛 완주',
    unlock: (stats, ctx) => (ctx?.completedUnits?.length || 0) >= 1,
  },
  {
    id: 'hat_crown', emoji: '👑', name: '보카 왕관',
    desc: `단어 ${HAT_THRESHOLDS.crownCleared}개를 클리어한 진짜 단어왕의 왕관`,
    sourceLabel: `단어 ${HAT_THRESHOLDS.crownCleared}개 클리어`,
    unlock: (stats) => stats.clearedCount >= HAT_THRESHOLDS.crownCleared,
  },
]

export const hatById = (id) => HAT_CATALOG.find((h) => h.id === id) || null

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
