// src/utils/town/townLevel.js — Paul Town V1 마을 레벨(순수 도메인, 2026-09-11).
//
// import 0. rewardEngine.js의 LEVELS(별 5단계 학업 보상 레벨)와는 별개
// 축이다 — 마을 레벨은 더 긴 여정(10단계)을 위한 것이지만, 앞 5단계는
// 학생이 이미 아는 별 임계값과 숫자가 어긋나면 혼란스러우므로 의도적으로
// rewardEngine.LEVELS와 값을 동일하게 맞춘다(scripts/testTownLevelLock.mjs
// 가 이 동등성을 소스에서 직접 assert). 이 파일 자체는 rewardEngine.js를
// import하지 않는다 — 두 상수를 우연히 같은 값으로 "복제"해 둔 것이고,
// 드리프트는 테스트가 잡는다(파일당 소유권 원칙, CLAUDE.md 규칙 16).
export const TOWN_LEVELS = [
  { level: 1, min: 0 },
  { level: 2, min: 20 },
  { level: 3, min: 50 },
  { level: 4, min: 100 },
  { level: 5, min: 200 },
  { level: 6, min: 350 },
  { level: 7, min: 550 },
  { level: 8, min: 800 },
  { level: 9, min: 1100 },
  { level: 10, min: 1500 },
]

// 레벨별 잠금 해제 표시 문구(운영자 확정 문구, 순수 표시용).
export const TOWN_LEVEL_UNLOCKS = {
  1: 'My House · 길 · 나무 · 마을 입구',
  3: 'Book Shop · Garden',
  5: 'Café · 장식 업그레이드',
  8: 'Clock Tower',
}

function normalizeStars(starsEarned) {
  const n = Number(starsEarned)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/**
 * 누적 별(starsEarned) -> 마을 레벨. 음수는 0으로 클램프, 비유한값
 * (NaN/Infinity/undefined 등)은 레벨 1로 취급(둘 다 결과적으로 레벨 1).
 */
export function townLevelForStars(starsEarned) {
  const stars = normalizeStars(starsEarned)
  let level = TOWN_LEVELS[0].level
  for (const entry of TOWN_LEVELS) {
    if (stars >= entry.min) level = entry.level
    else break
  }
  return level
}

/**
 * 다음 마을 레벨까지 남은 별. 최고 레벨이면 { nextLevel: null, remaining: 0 }.
 */
export function starsToNextTownLevel(starsEarned) {
  const stars = normalizeStars(starsEarned)
  const level = townLevelForStars(stars)
  const idx = TOWN_LEVELS.findIndex((e) => e.level === level)
  const next = idx >= 0 ? TOWN_LEVELS[idx + 1] : undefined
  if (!next) return { nextLevel: null, remaining: 0 }
  return { nextLevel: next.level, remaining: next.min - stars }
}

/** minLevel <= 현재 마을 레벨이면 잠금 해제. */
export function isUnlocked(minLevel, starsEarned) {
  const level = townLevelForStars(starsEarned)
  const min = Number.isFinite(Number(minLevel)) ? Number(minLevel) : 1
  return level >= min
}
