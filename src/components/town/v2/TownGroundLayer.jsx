// src/components/town/v2/TownGroundLayer.jsx — Paul Town V2 월드 지형(terrain)
// 합성 레이어(2026-09-18 재작성, worldRender.js/worldScenery.js 기반 세계
// 좌표 렌더러로 교체).
//
// 2026-09-16 district-stack 버전(DISTRICTS 세로 스택 + repeating-radial-
// gradient 스캘럽 헤지)을 폐기하고, 운영자 승인 하네스(docs/design/town/
// mockup/paul-town-recompose.html)가 실제로 그리는 지형을 그대로 데이터
// (worldScenery.js)로 포팅한 렌더러로 교체한다(CLAUDE.md 규칙 3 — 이미
// 승인된 디자인을 재도출하지 않는다). 이 파일이 그리는 것(하네스 DOM
// 순서 그대로, 뒤→앞): 1) grass-base 타일 배경(CSS 다중 배경 — 이미지
// 레이어 실패 시 GROUND.grassBase.fallbackBackground 그라디언트가 그대로
// 비쳐 보인다, <img> onError 불필요) 2) 배경 채움 나무 10그루
// (BG_FILLER_TREES, 순수 SVG 도형, Batch 1 범위 아님) 3) sky-hills 밴드
// (상단 12%, object-fit cover) 4) ENV_PLACEMENTS의 grassPatch 그룹(잔디
// 패치/야생화 스캐터 16개, TownEnvPlacement로 그림). 강/길/울타리·
// 생울타리/클러스터/항상-보이는 소품/표지판은 이 파일 소관이 아니다
// (TownWaterLayer.jsx/TownPathLayer.jsx/후속 TownSceneryLayer.jsx 몫).
//
// grid-cols/gridTemplateColumns/aspect-square 금지(격자 인상 금지,
// scripts/testTownV2Static.mjs 섹션 9) — 이 파일은 전부 absolute % 좌표만
// 쓴다(격자 없음).
//
// 2026-09-18(작업 지시서 STEP 5) — 공유 프레젠테이션 컴포넌트
// TownEnvPlacement.jsx 도입에 맞춰 grassPatch 렌더를 그 컴포넌트로
// 옮긴다(앵커/회전/미러/피더 변환을 여러 레이어 파일에 중복 구현하지
// 않기 위함, CLAUDE.md 규칙 3·16). 동시에 이 레이어 래퍼 div가 갖고
// 있던 "레이어 전체 하나의 z-index"를 없애고, 안의 4개 요소 각각에
// 개별 z-index(worldZIndex)를 매긴다 — 레이어 래퍼가 z-index를 갖는
// 순간 새 스태킹 컨텍스트가 생겨 그 자식들이 다른 레이어(TownWaterLayer/
// TownPathLayer 등)의 자식들과 전역적으로 올바르게 섞이지 못하게 된다
// (y-랭킹 레이어가 늘어나는 Step 6/7에서 특히 중요 — depthOrder.js
// 헤더의 "Y_RANKED_LAYERS만 y로 보정, 나머지는 레이어 자체가 전역 순서를
// 결정" 설계를 그대로 지키려면 레이어 컨테이너는 투명해야 한다). terrain
// 레이어는 Y_RANKED_LAYERS에 없어 넘기는 y 값(아래 50)은 임의값이어도
// 안전하다(결과가 항상 같은 상수).
//
// 과도기 알림(2026-09-18) — Ambient/Object/Fog/Overlay 레이어(이 세션
// 범위 밖)는 아직 옛 district-stack 좌표계(townScene.js의 Z_LAYERS,
// 0~100 범위)를 쓴다. 이 레이어(그리고 TownWaterLayer/TownPathLayer)는
// 새 depthOrder.js 체계(z-index 수천 단위)를 쓰므로, 그 옛 레이어들
// "위"에 그려지는 과도기적 화면 붕괴가 여전히 있다(작업 지시서가 명시적
// 으로 허용한 중간 상태, paulTownV2 플래그 기본 OFF라 학생에게는 노출되지
// 않는다) — 나머지 레이어가 같은 depthOrder 체계로 이전되면(Step 7)
// 자연히 해소된다.
import { GROUND, ENV_PLACEMENTS, BG_FILLER_TREES, bgFillerTreeShapes } from '../../../utils/town/worldScenery'
import { worldZIndex } from '../../../utils/town/worldRender'
import { townEnvAsset } from '../../../assets/town/env'
import TownEnvImage from './TownEnvImage'
import TownEnvPlacement from './TownEnvPlacement'

// grassPatch 그룹(잔디 패치/야생화 스캐터) 16개.
const GRASS_PATCHES = ENV_PLACEMENTS.filter((p) => p.group === 'grassPatch')

export default function TownGroundLayer({ level }) {
  void level // 지형 자체는 레벨 무관(worldScenery.js sceneryFor() 헤더 참고) — 시그니처만 다른 레이어와 통일.
  const grassBaseUrl = townEnvAsset(GROUND.grassBase.assetKey)
  const terrainZ = worldZIndex('terrain', 50, 'ground-layer')

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* 1) grass-base 타일 배경 — CSS 다중 배경(이미지 레이어 + 그 아래
          그라디언트 레이어). 이미지가 실패해도 아래 그라디언트 레이어가
          그대로 비쳐 보이므로 별도 onError 처리가 필요 없다. */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: terrainZ,
          backgroundImage: grassBaseUrl
            ? `url(${grassBaseUrl}), ${GROUND.grassBase.fallbackBackground}`
            : GROUND.grassBase.fallbackBackground,
          backgroundRepeat: grassBaseUrl ? 'repeat, no-repeat' : 'no-repeat',
          backgroundSize: grassBaseUrl
            ? `${GROUND.grassBase.tileWidthPct}% ${GROUND.grassBase.tileHeightPct}%, 100% 100%`
            : '100% 100%',
        }}
      />

      {/* 2) 배경 채움 나무 10그루 — Batch 1 범위 아님, 순수 SVG(하네스
          bgTreeSpecs와 동일 산식, worldScenery.bgFillerTreeShapes 공유). */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: terrainZ }} viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <filter id="townBgTreeBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.28" />
          </filter>
        </defs>
        {BG_FILLER_TREES.map((tree) => {
          const shapes = bgFillerTreeShapes(tree)
          return (
            <g key={tree.id} filter="url(#townBgTreeBlur)" opacity="0.62">
              <ellipse cx={shapes.trunk.cx} cy={shapes.trunk.cy} rx={shapes.trunk.rx} ry={shapes.trunk.ry} fill={shapes.trunk.fill} />
              <circle cx={shapes.body.cx} cy={shapes.body.cy} r={shapes.body.r} fill={shapes.body.fill} />
              <circle cx={shapes.highlight.cx} cy={shapes.highlight.cy} r={shapes.highlight.r} fill={shapes.highlight.fill} />
            </g>
          )
        })}
      </svg>

      {/* 3) sky-hills 밴드 — 상단 12%, object-fit cover, 최초 페인트에
          바로 필요하므로 eager 로드. */}
      <div className="absolute left-0 top-0 w-full overflow-hidden" style={{ height: `${GROUND.skyHills.hPct}%`, zIndex: terrainZ }}>
        <TownEnvImage assetKey={GROUND.skyHills.assetKey} className="w-full h-full object-cover" eager />
      </div>

      {/* 4) ENV_PLACEMENTS grassPatch 그룹 — 잔디 패치/야생화 스캐터 16개. */}
      {GRASS_PATCHES.map((p) => (
        <TownEnvPlacement key={p.id} entry={p} />
      ))}
    </div>
  )
}
