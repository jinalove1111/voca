// src/components/town/v2/TownSceneryLayer.jsx — Paul Town V2 마을 경관
// (scenery) 레이어(2026-09-18, 작업 지시서 STEP 6).
//
// worldScenery.js의 세 데이터 소스를 그린다: 1) ENV_PLACEMENTS group
// 'fenceHedge'(울타리·생울타리·문·화단 테두리 16개) + 'cluster'(관목·꽃
// 클러스터·화분 25개) — 둘 다 TownEnvPlacement(TownWaterLayer.jsx/
// TownPathLayer.jsx와 동일 공유 컴포넌트, 재구현 없음)로 그린다. 2)
// PROP_PLACEMENTS(항상 보이는 소품 20개 — 나무/가로등/담쟁이/화단/벤치/
// 우체통 + 일부 그림자) — 하네스의 `scene()`/`sceneShadow()`/ivy 인라인
// 블록을 그대로 포팅했다(재도출 없음): 소품 자체는 `.obj` CSS와 동일하게
// bottom-center 앵커(translate(-50%,-100%)) + width만 %, height는 이미지
// 고유 종횡비를 따르는 auto, filter/opacity가 있으면 wrapper에 그대로
// 적용한다. 그림자는 `.shadow` CSS와 동일하게 translate(-50%,-35%) +
// 방사형 그라디언트 타원(오브젝트와 같은 z를 쓰고 DOM에서 오브젝트보다
// 먼저 그려 항상 그 밑에 깔린다). 3) SIGNS.myHouse/SIGNS.sea(월드에 항상
// 보이는 두 표지판 — "My House"/"To the Sea →") — `.sign` CSS와 동일하게
// bottom-center 앵커로 그리되, 이 둘만 스크린리더에 노출한다(role="img"
// aria-label=표지판 텍스트) — 오너 결정: 승인된 카피만 접근성 있게
// 노출하고(worldScenery.js SIGNS가 유일한 원천), 4-arm 안내판(Learn/Grow/
// Be Kind/Go Further)·Paul 본체·"Welcome to Paul Town!" 말풍선은 이
// 레이어/worldScenery.js 어디에도 없다(둘 다 오너 결정으로 범위 밖 —
// worldScenery.js 모듈 헤더 참고, PaulGuide.jsx가 Paul 렌더링 유일
// 지점으로 남는다).
//
// 레벨 무관(worldScenery.js ENV_PLACEMENTS/PROP_PLACEMENTS/SIGNS 전부
// "항상 표시" 전제, TownWaterLayer.jsx/TownPathLayer.jsx와 동일 이유) —
// level prop은 다른 레이어와 시그니처만 맞춘다.
//
// z-index — fenceHedge/cluster는 TownEnvPlacement가 entry.depthLayer로
// 직접 계산한다(화분류는 'scenery', 나머지 클러스터는 'foregroundVegetation'
// — worldScenery.js 모듈 헤더의 depthLayer 오버라이드 설명 참고). 이
// 레이어가 직접 그리는 나머지(PROP_PLACEMENTS/SIGNS)는 y-랭킹 레이어
// 'scenery'로 계산한다(depthOrder.js Y_RANKED_LAYERS) — 데이터 자체에
// depthLayer 필드가 없어(PROP_PLACEMENTS/SIGNS는 ENV_PLACEMENTS와 다른
// 셰이프) 이 파일이 'scenery' 하나로 고정한다. 레이어 래퍼는 자체
// z-index를 갖지 않는다(TownGroundLayer.jsx 헤더와 동일 이유 — 스태킹
// 컨텍스트를 만들지 않아야 y-랭킹 항목들이 다른 레이어(추후 Step 7의
// architecture/objects)와 전역적으로 올바르게 섞인다).
//
// 접근성 — fenceHedge/cluster/PROP_PLACEMENTS는 전부 순수 장식이라 하나의
// aria-hidden + pointer-events-none 래퍼 안에 둔다. 두 표지판(SIGNS)은
// 그 래퍼 "바깥"의 형제로 렌더해야 한다 — aria-hidden 조상 안에 두면
// role="img"/aria-label을 줘도 접근성 트리에서 전부 제외되므로
// (TownAmbientLayer.jsx의 sr-only 문장이 같은 이유로 aria-hidden 밖에
// 있는 것과 동일한 패턴). 표지판 자신은 개별적으로 pointer-events-none을
// 준다(레이어 전체가 클릭 불가여야 한다는 지시서 요구를 그대로 지키되,
// aria-hidden은 표지판 자신에는 주지 않는다).
import { useEffect, useState } from 'react'
import { useDocumentHidden } from '../../../hooks/useDocumentHidden'
import { ENV_PLACEMENTS, PROP_PLACEMENTS, SIGNS } from '../../../utils/town/worldScenery'
import { worldZIndex } from '../../../utils/town/worldRender'
import { townAsset } from '../../../assets/town'
import TownEnvPlacement from './TownEnvPlacement'

const FENCE_HEDGE = ENV_PLACEMENTS.filter((p) => p.group === 'fenceHedge')
const CLUSTERS = ENV_PLACEMENTS.filter((p) => p.group === 'cluster')

// 2026-09-20 — 초목 흔들림(vegetation sway) ambient 파일럿. 25개 클러스터
// 전체가 아니라(과제 지시서 "a small explicit subset... not all ~25")
// 자연스러운 낱개 식생(flower-cluster-*/shrub-*)만 골라 결정론적으로
// 고정한 소수(6개) — 화분류(flower-pot*, depthLayer 'scenery', 건물 옆
// 고정 화분이라 딱딱한 용기라는 인상이라 스웨이가 부자연스럽다)는 제외.
// 화면 전역에 고르게 흩어지도록 id를 듬성듬성 골랐다.
const SWAY_CLUSTER_IDS = new Set(['cluster-0', 'cluster-3', 'cluster-6', 'cluster-9', 'cluster-13', 'cluster-17'])
const SWAY_CLASS = 'origin-bottom motion-safe:animate-town-sway'

// 하네스 .shadow CSS 그대로(재도출 없음) — radial-gradient 타원.
const SHADOW_BACKGROUND = 'radial-gradient(ellipse at center, rgba(30,25,15,0.35) 0%, rgba(30,25,15,0.16) 55%, rgba(30,25,15,0) 75%)'

// PROP_PLACEMENTS(kind:'townAsset')의 유일한 이미지 해석 지점 — 등록되지
// 않은 키/런타임 로드 실패는 조용히 아무것도 렌더하지 않는다(TownEnvImage.jsx
// 와 동일 계약, 이모지 폴백 없음 — 순수 장식 소품이라 학생이 "아이템"으로
// 인지할 필요가 없다).
function TownPropImage({ townAssetKey, className }) {
  const url = townAsset(townAssetKey)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    setLoadFailed(false)
  }, [townAssetKey])

  if (!url || loadFailed) return null

  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      loading="lazy"
      data-town-asset={townAssetKey}
      onError={() => setLoadFailed(true)}
      className={className}
    />
  )
}

// PROP_PLACEMENTS 항목 하나(+있으면 그림자) — 하네스 scene()/sceneShadow()
// 산식 그대로. 그림자와 본체가 같은 z를 쓰고 그림자를 먼저 렌더해(DOM
// 순서) 같은 z에서는 항상 본체가 그 위에 그려진다(하네스가 sceneShadow()를
// scene()보다 먼저 호출하는 순서와 동일 정신).
function PropEntry({ prop }) {
  const z = worldZIndex('scenery', prop.yPct, prop.id)
  const wrapperStyle = {
    left: `${prop.xPct}%`,
    top: `${prop.yPct}%`,
    width: `${prop.wPct}%`,
    transform: 'translate(-50%, -100%)',
    zIndex: z,
  }
  if (prop.filter) wrapperStyle.filter = prop.filter
  if (prop.opacity != null) wrapperStyle.opacity = prop.opacity

  return (
    <>
      {prop.shadow && (
        <div
          className="absolute rounded-full"
          style={{
            left: `${prop.shadow.xPct}%`,
            top: `${prop.shadow.yPct}%`,
            width: `${prop.shadow.wPct}%`,
            height: `${prop.shadow.hPct}%`,
            transform: 'translate(-50%, -35%)',
            background: SHADOW_BACKGROUND,
            zIndex: z,
          }}
        />
      )}
      {prop.kind === 'ivy' ? (
        <div
          className="absolute [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
          style={wrapperStyle}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: prop.svgInner }}
        />
      ) : (
        <div className="absolute" style={wrapperStyle}>
          <TownPropImage townAssetKey={prop.townAssetKey} className="block w-full h-auto" />
        </div>
      )}
    </>
  )
}

// SIGNS.myHouse/SIGNS.sea 하나 — 승인된 카피(sign.text)를 접근성 있게
// 노출하는 유일한 지점(role="img" aria-label). svgInner는 동결된 리터럴
// 마크업(scripts/testTownWorldScenery.mjs가 하네스와 바이트 단위로 대조)
// 이라 dangerouslySetInnerHTML로 그대로 재사용한다(재도출/재파싱 없음).
function WorldSign({ sign }) {
  const z = worldZIndex('scenery', sign.yPct, `sign-${sign.text}`)
  return (
    <div
      role="img"
      aria-label={sign.text}
      className="absolute pointer-events-none [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
      style={{
        left: `${sign.xPct}%`,
        top: `${sign.yPct}%`,
        width: `${sign.wPct}%`,
        transform: 'translate(-50%, -100%)',
        zIndex: z,
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: sign.svgInner }}
    />
  )
}

export default function TownSceneryLayer({ level }) {
  void level // 경관 전부 레벨 무관(worldScenery.js 헤더) — 시그니처만 다른 레이어와 통일.
  const hidden = useDocumentHidden()

  return (
    <>
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {FENCE_HEDGE.map((p) => (
          <TownEnvPlacement key={p.id} entry={p} />
        ))}
        {CLUSTERS.map((p) => {
          const isSway = SWAY_CLUSTER_IDS.has(p.id)
          return (
            <TownEnvPlacement
              key={p.id}
              entry={p}
              animationClassName={isSway ? SWAY_CLASS : undefined}
              animationStyle={isSway ? { animationPlayState: hidden ? 'paused' : 'running' } : undefined}
            />
          )
        })}
        {PROP_PLACEMENTS.map((p) => (
          <PropEntry key={p.id} prop={p} />
        ))}
      </div>
      <WorldSign sign={SIGNS.myHouse} />
      <WorldSign sign={SIGNS.sea} />
      <WorldSign sign={SIGNS.fourWay} />
    </>
  )
}
