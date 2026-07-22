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
// growthPoints = clearedCount. 별/XP/티켓과 무관한 순수 학습 진행 지표를
// 쓰는 이유: 화폐/보상 경제와 완전히 분리(모자와 같은 원칙 — 코스메틱
// 세계는 학습량만으로 자란다).

export const WORLD_STAGES = [
  { id: 'garden', emoji: '🌱', name: '나의 정원', minPoints: 0, desc: '단어를 배울 때마다 정원이 자라나요' },
  { id: 'house', emoji: '🏠', name: '나의 집', minPoints: 30, desc: '단어 30개를 클리어하면 집이 지어져요' },
  { id: 'bridge', emoji: '🌉', name: '다리', minPoints: 60, desc: '단어 60개를 클리어하면 다리가 놓여요' },
  { id: 'library', emoji: '📚', name: '도서관', minPoints: 100, desc: '단어 100개를 클리어하면 도서관이 열려요' },
  { id: 'village', emoji: '🏘️', name: '마을', minPoints: 150, desc: '단어 150개를 클리어하면 마을이 생겨요' },
  { id: 'kingdom', emoji: '🏰', name: '왕국', minPoints: 250, desc: '단어 250개를 클리어하면 왕국이 완성돼요' },
]

/**
 * 월드 전체 상태 — 각 구역의 unlocked/진행률.
 * @returns { growthPoints, stages: [{...stage, unlocked, progress(0~1)}], nextStage }
 */
export function computeWorldState(stats) {
  const growthPoints = stats.clearedCount || 0
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

// ── 정원 MVP — 3x3 텃밭 격자 ──
// 칸당 성장 단계: 클리어 단어 수가 칸을 순서대로 채우며 자란다.
//   empty(0) → seed(1~) → sprout → flower → tree
// 칸 i의 성장은 growthPoints에서 결정론적으로 파생(무작위/저장 없음).
const PLOT_COUNT = 9
const POINTS_PER_STAGE = 3 // 칸 하나가 한 단계 자라는 데 필요한 클리어 수
const PLOT_STAGES = ['empty', 'seed', 'sprout', 'flower', 'tree']
export const PLOT_STAGE_EMOJI = { empty: '🟫', seed: '🌰', sprout: '🌱', flower: '🌸', tree: '🌳' }

export function gardenPlots(stats) {
  const points = stats.clearedCount || 0
  // 라운드로빈 분배: 포인트가 9칸에 골고루 돌아가며 쌓인다 — 칸 하나만
  // 먼저 다 자라는 게 아니라 정원 전체가 서서히 무성해지는 연출.
  const perPlotUnits = Math.floor(points / POINTS_PER_STAGE)
  return Array.from({ length: PLOT_COUNT }, (_, i) => {
    const units = Math.floor(perPlotUnits / PLOT_COUNT) + (i < perPlotUnits % PLOT_COUNT ? 1 : 0)
    const stage = PLOT_STAGES[Math.min(units, PLOT_STAGES.length - 1)]
    return { index: i, stage, emoji: PLOT_STAGE_EMOJI[stage] }
  })
}
