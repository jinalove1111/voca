// src/components/town/v2/TownWaterLayer.jsx — Paul Town V2 강(river) 레이어
// (2026-09-18, 작업 지시서 STEP 5).
//
// worldScenery.js ENV_PLACEMENTS의 group:'river' 항목(25개 — river-straight/
// river-bend 타일, river-highlight 반짝임 오버레이, riverbank-reeds/
// riverbank-reeds-stones 둑 식생)을 TownEnvPlacement로 그린다. 앵커/회전/
// 미러/피더(50% 겹침 이음매) 변환은 전부 TownEnvPlacement가 소유한다(재구현
// 없음, CLAUDE.md 규칙 3·16) — 이 파일은 river 그룹만 골라 넘기는 얇은
// 레이어일 뿐이다.
//
// 오너 결정 4(2026-09-18) — 강은 "배치 가능한 오브젝트"가 아니라 항상
// 보이는 씬(scenery)이다: Lv1부터 화면에 보이고, 어떤 level에서도 가려지지
// 않는다(riverApproach 3칸(오브젝트 배치 자체)이 Lv6부터 열리는 것과는
// 완전히 별개 — placementContract.js RIVER_CELLS_UNLOCK 주석 참고, 그
// 잠금은 "그 칸에 아이템을 놓을 수 있는가"만 다루고 강 자체의 가시성은
// 다루지 않는다). 그래서 이 레이어는 level prop을 받되 아무 필터링도
// 하지 않는다(worldScenery.js ENV_PLACEMENTS 헤더의 "Batch 1 자산은 항상
// 표시" 전제와 동일).
//
// z-index는 항목마다 worldZIndex(entry.depthLayer, entry.yPct, entry.id)로
// 매긴다 — river-straight/-bend/-highlight는 depthLayer 'water'(y-랭킹
// 아님, 흐름 순서 무관하게 항상 같은 상수), riverbank-reeds(-stones)는
// 'foregroundVegetation'(y-랭킹 — 물보다 항상 앞에 그려져 둑 위 식생처럼
// 보인다, worldScenery.js 모듈 헤더의 depthLayer 오버라이드 설명 참고).
// 레이어 래퍼 자신은 z-index를 갖지 않는다(TownGroundLayer.jsx 헤더 설명과
// 동일 이유 — 스태킹 컨텍스트를 만들지 않아야 다른 레이어와 전역적으로
// 올바르게 섞인다).
//
// 2026-09-20 — 강 반짝임(river shimmer) ambient 파일럿. 하네스는 정적
// 배치였지만(placePx 호출부에 transition/animation 없음), 이 세션은
// river-highlight 타일(6개, 물 위 반짝임 오버레이)에만 은은한 opacity
// 펄스를 추가한다 — river-straight/river-bend(물 자체) 타일은 건드리지
// 않는다(과제 지시서 "animate the existing river-highlight tile(s) only").
// 애니메이션은 TownEnvPlacement의 animationClassName/animationStyle을
// 통해 내부 <img> 자신에만 걸린다(래퍼의 anchor transform과 절대 같은
// 엘리먼트를 공유하지 않는다 — TownEnvPlacement.jsx 헤더 참고). 탭이
// 백그라운드(document.hidden)면 useDocumentHidden으로 pause한다.
import { useDocumentHidden } from '../../../hooks/useDocumentHidden'
import { ENV_PLACEMENTS } from '../../../utils/town/worldScenery'
import TownEnvPlacement from './TownEnvPlacement'

const RIVER_PLACEMENTS = ENV_PLACEMENTS.filter((p) => p.group === 'river')
const SHIMMER_CLASS = 'motion-safe:animate-town-shimmer'

export default function TownWaterLayer({ level }) {
  void level // 강은 레벨 무관(항상 보임) — 시그니처만 다른 레이어와 통일(오너 결정 4).
  const hidden = useDocumentHidden()

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {RIVER_PLACEMENTS.map((p) => {
        const isShimmer = p.assetKey === 'river-highlight'
        return (
          <TownEnvPlacement
            key={p.id}
            entry={p}
            animationClassName={isShimmer ? SHIMMER_CLASS : undefined}
            animationStyle={isShimmer ? { animationPlayState: hidden ? 'paused' : 'running' } : undefined}
          />
        )
      })}
    </div>
  )
}
