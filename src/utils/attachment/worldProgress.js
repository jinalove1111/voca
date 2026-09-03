// 잉글리시 월드(2026-07-22, 애착 시스템) — 진행 잠금해제 엔진 + 정원 MVP.
//
// 범용 여행 지도가 아니라 "학습 진행이 세계를 점점 연다"는 데이터 모델.
// 저장값 없음 — 잠금해제는 전부 deriveAttachmentStats에서 매번 파생
// 계산되는 결정론 함수다(진실 원천 중복 금지). 그래서 롤백/복원/기기
// 전환에도 상태가 어긋날 수 없다.
//
// v1 노출 범위: 정원(garden)만 실제 화면(EnglishGarden.jsx)이 있고,
// 이후 구역(집/다리/도서관/마을/왕국)은 이 엔진이 계산만 해두고 UI는
// attachmentWorldFull 플래그(기본 OFF) 뒤에 있다 — 별도 게임 인터페이스를
// 만들지 않는다는 운영자 지시 그대로.
//
// growthPoints = gardenPoints. 별/XP/티켓과 무관한 순수 학습 진행 지표를
// 쓰는 이유: 화폐/보상 경제와 완전히 분리(모자와 같은 원칙 — 코스메틱
// 세계는 학습량만으로 자란다).
//
// 2026-08-28 축 교정 — 예전엔 growthPoints = clearedCount였다. clearedCount는
// "퀴즈를 틀린 뒤 레벨업 미션에서 3연속 정답으로 되찾은 단어 수"라서(유일한
// 쓰기 지점 useStudent.answerMission, 진입 조건 QuizGame 오답), 단어 학습
// 완료·퀴즈 정답·쓰기·유닛 완주·데일리 진행 중 어느 것도 정원을 키우지
// 못했다. 라이브 실측(2026-08-28): progress 보유 190명 중 170명(89%)이 영구
// 0칸, 전 학생 cleared 합계 178 vs 퀴즈 정답 6,307. 열심히 한 아이일수록
// 오답이 적어 정원이 덜 자라는 역인센티브였다.
// 이제 attachmentCore가 파생하는 gardenPoints(= cleared ∪ completedWords ∪
// clearedWords, 실제로 학습한 서로 다른 단어 수)를 읽는다. clearedCount는
// 모자/밀스톤 전용으로 그대로 남는다 — 여기서 절대 다시 쓰지 않는다.
//
// `?? stats.clearedCount` 폴백: gardenPoints가 없는 입력(구 progress 백업,
// DebugPage의 mock stats 등)에서도 예전과 똑같이 동작한다(헌법 규칙 9).
//
// 음수/NaN 클램프(2026-08-28, testGardenGrowthFlow.mjs 13번 시나리오에서 발견):
// 클램프가 없으면 points<0 이나 NaN일 때 아래 gardenPlots의 units가 음수/NaN이
// 되어 PLOT_STAGES[음수]가 undefined가 되고, 화면에 이모지 없는 빈 타일이
// 그려진다. 실데이터로는 도달할 수 없지만(gardenPoints는 Set.size, clearedCount는
// 배열 length라 항상 ≥0이고 DebugPage의 mock 입력도 0으로 클램프한다) 이 함수
// 하나만 보고도 안전이 보장되도록 여기서 막는다 — 호출자 신뢰에 기대지 않는다.
const pointsOf = (stats) => {
  const n = stats?.gardenPoints ?? stats?.clearedCount ?? 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const WORLD_STAGES = [
  { id: 'garden', emoji: '🌱', name: '나의 정원', minPoints: 0, desc: '단어를 배울 때마다 정원이 자라나요' },
  // desc 문구: 축이 "레벨업 미션 클리어"에서 "배운 단어"로 바뀌었으므로
  // 문구도 실제 조건과 맞춘다(2026-08-28). 임계값(minPoints)은 무변경.
  { id: 'house', emoji: '🏠', name: '나의 집', minPoints: 30, desc: '단어 30개를 배우면 집이 지어져요' },
  { id: 'bridge', emoji: '🌉', name: '다리', minPoints: 60, desc: '단어 60개를 배우면 다리가 놓여요' },
  { id: 'library', emoji: '📚', name: '도서관', minPoints: 100, desc: '단어 100개를 배우면 도서관이 열려요' },
  { id: 'village', emoji: '🏘️', name: '마을', minPoints: 150, desc: '단어 150개를 배우면 마을이 생겨요' },
  { id: 'kingdom', emoji: '🏰', name: '왕국', minPoints: 250, desc: '단어 250개를 배우면 왕국이 완성돼요' },
]

/**
 * 월드 전체 상태 — 각 구역의 unlocked/진행률.
 * @returns { growthPoints, stages: [{...stage, unlocked, progress(0~1)}], nextStage }
 */
export function computeWorldState(stats) {
  const growthPoints = pointsOf(stats)
  const stages = WORLD_STAGES.map((s, i) => {
    const next = WORLD_STAGES[i + 1]
    const span = next ? next.minPoints - s.minPoints : 1
    return {
      ...s,
      unlocked: growthPoints >= s.minPoints,
      progress: growthPoints >= s.minPoints
        ? Math.min(1, next ? (growthPoints - s.minPoints) / span : 1)
        : 0,
    }
  })
  const nextStage = stages.find((s) => !s.unlocked) || null
  return { growthPoints, stages, nextStage }
}

// ── 정원 — 4x4 텃밭 격자 ──
// 칸당 성장 단계: 학습한 단어 수가 칸을 순서대로 채우며 자란다.
//   empty(0) → seed(1~) → sprout → flower → tree
// 칸 i의 성장은 growthPoints에서 결정론적으로 파생(무작위/저장 없음).
//
// 2026-08-28 속도 재조정(운영자 승인) — 9칸/3점 → 16칸/2점.
//   · 1칸이 눈에 보이게 변하는 비용 = 새 단어 2개.
//     라이브 실측 "학습한 하루당 새 단어" 중앙값 1.9개 → 약 0.94칸/일 =
//     학습한 날마다 최소 한 번은 눈에 보이는 변화가 생긴다(요청 기준).
//   · 만개(16칸 전부 나무)까지 16×4×2 = 128포인트. 중앙값 페이스로 약
//     67 학습일(주 3회면 5개월) — 며칠 만에 끝나지 않는다.
//   · 9칸/3점을 유지하면 만개가 108포인트라 상위 학생이 즉시 천장에
//     닿아 더 자랄 곳이 없었다(실측: 현재 데이터로 만개 3명).
export const PLOT_COUNT = 16
export const POINTS_PER_STAGE = 2 // 칸 하나가 한 단계 자라는 데 필요한 학습 단어 수
const PLOT_STAGES = ['empty', 'seed', 'sprout', 'flower', 'tree']
export const PLOT_STAGE_EMOJI = { empty: '🟫', seed: '🌰', sprout: '🌱', flower: '🌸', tree: '🌳' }

export function gardenPlots(stats) {
  const points = pointsOf(stats)
  // 라운드로빈 분배: 포인트가 PLOT_COUNT칸에 골고루 돌아가며 쌓인다 — 칸 하나만
  // 먼저 다 자라는 게 아니라 정원 전체가 서서히 무성해지는 연출.
  const perPlotUnits = Math.floor(points / POINTS_PER_STAGE)
  return Array.from({ length: PLOT_COUNT }, (_, i) => {
    const units = Math.floor(perPlotUnits / PLOT_COUNT) + (i < perPlotUnits % PLOT_COUNT ? 1 : 0)
    const stage = PLOT_STAGES[Math.min(units, PLOT_STAGES.length - 1)]
    return { index: i, stage, emoji: PLOT_STAGE_EMOJI[stage] }
  })
}

// Session Reward Summary(P1, 2026-09-03) — gardenPlots()가 반환하는 16칸
// 배열을 "정원이 전체적으로 얼마나 자랐는지" 하나의 숫자로 접는다(각 칸의
// 성장 단계 인덱스 합) — "세션 시작 대비 gardenPlots() 스테이지 변화량"을
// 계산하려면 두 시점을 같은 숫자축으로 비교할 수 있어야 하는데, gardenPlots()
// 자체는 배열이라 그대로는 뺄셈이 안 된다. 이 파일이 정원 "단계" 계산의
// 유일한 소유자이므로(레이어 계약, useStudent.js는 attachment/* import
// 금지 — scripts/testGardenGrowthFlow.mjs 10번 시나리오) 이 헬퍼도 여기
// 둔다(호출부: SessionRewardCard.jsx). gardenPoints는 computeGardenPoints
// (useStudent.js, cleared∪completedWords∪clearedWords 크기) 같은 원시
// 숫자를 그대로 받는다 — pointsOf() 방어(음수/NaN 클램프)는 gardenPlots()가
// 이미 적용하므로 여기서 다시 클램프하지 않는다.
const GARDEN_STAGE_RANK = { empty: 0, seed: 1, sprout: 2, flower: 3, tree: 4 }
export function gardenStageTotal(gardenPoints) {
  return gardenPlots({ gardenPoints }).reduce((sum, p) => sum + (GARDEN_STAGE_RANK[p.stage] || 0), 0)
}
