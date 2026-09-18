// src/components/town/v2/TownScene.jsx — Paul Town V2-A 스토리북 마을 장면
// (2026-09-13).
//
// 기존 8x6 좌표계(townLayout.js)와 경제/배치 데이터는 전부 부모
// (TownScreenV2.jsx)가 소유·전달한다 — 이 컴포넌트는 좌표를 퍼센트
// 앵커로 바꿔 레이어 순서대로 쌓아 그리는 순수 렌더러다. openPlacementId
// (어느 아이템 팝오버가 열려 있는지)만 이 화면 스코프에서 로컬로
// 소유한다(V1 TownGrid와 동일 정신).
//
// 2026-09-14 — 배치 팝오버 바깥 탭 닫기(V2B_V2C_ROADMAP.md 1.3절, 이전엔
// 같은 아이템 재탭만 닫혔음). objects 레이어(z=10)보다 낮은 z-index(8)의
// 투명 백드롭을 팝오버가 열려 있을 때만 깔아, 아이템 버튼 자체는 그대로
// 위에서 클릭되고(다른 아이템 직접 전환 유지) 빈 공간 탭만 백드롭에
// 잡혀 닫히게 한다. Escape로도 닫히고(TownSheet.jsx와 동일 관례), 닫힐 때
// 그 팝오버를 열었던 버튼으로 포커스를 복귀한다(TownSheet.jsx의 포커스
// 복귀 패턴과 동일 정신).
//
// 2026-09-16 월드 지오메트리 확장 — 고정 8/13 박스를 "구역(district) 세로
// 스택"으로 교체한다(docs/design/town/WORLD_LAYOUT_REDESIGN_2026-09-16.md,
// wireframe/paul-town-world-wireframe.html). 새 `level` prop을 받아 모든
// 하위 레이어에 그대로 전달한다 — 상호작용 로직(팝오버 열기/닫기/Escape/
// 바깥 탭/핸들러 위임)은 전혀 바꾸지 않고, 그 아래 시각 레이어 5개만
// 구역 스택을 인식하도록 바뀐다.
//
// 2026-09-18 — 세계 좌표(world-coordinate) 렌더러로 전환 1단계(작업
// 지시서 STEP 4). 루트의 inline aspectRatio가 이제 레벨에 따라 달라지던
// `1 / sceneHeightUnits(level)`이 아니라, worldContract.js가 동결한 세계
// 물리 비율(100:190) 그대로인 `SCENE_ASPECT_RATIO`(worldRender.js 파생,
// 상수)다 — 정적 계약은 "aspectRatio 문자열 존재"만 확인하므로 이 상수화도
// 계약을 그대로 만족한다. 오너 결정 5(전체 화면 bleed) — 씬을 카드
// 프레이밍(rounded-[28px] + card-shadow)에서 빼고, 부모(TownScreenV2.jsx,
// 고정)의 p-4 패딩을 `-mx-4 w-[calc(100%+2rem)]`로 상쇄해 폰 화면폭에서
// 가장자리까지 꽉 차게 만든다(TownScreenV2 자신의 max-w-lg mx-auto 칼럼은
// 그대로 두고, 이 씬의 중복 max-w-lg mx-auto 래퍼만 제거 — 구 8x6 그리드
// 시절부터 있던 이중 래핑이었다).
//
// STEP 5(같은 날) — TownWaterLayer.jsx(강) 추가, TownPathLayer.jsx를 옛
// district-stack SVG 스트로크에서 ENV_PLACEMENTS 'path' 그룹 타일
// 렌더러로 교체. 하네스 DOM 순서 그대로 ground → river → path 순으로
// 쌓는다(TownGroundLayer/TownWaterLayer/TownPathLayer.jsx 헤더 참고).
//
// STEP 6(같은 날) — TownSceneryLayer.jsx(울타리·생울타리·클러스터·항상
// 보이는 소품·My House/To the Sea 표지판) 추가, path 다음에 쌓는다(하네스
// DOM 순서: grassPatch→river→path→fenceHedge→cluster→objLayer, 이
// 레이어가 fenceHedge/cluster/소품/표지판을 전부 소유).
//
// STEP 7(같은 날, 세계 좌표 렌더러 전환 마지막 단계) — Ambient/Object/
// Fog/Overlay 레이어를 전부 세계 좌표(worldRender.js/worldScenery.js)로
// 옮긴다. 이 파일 자신이 그리는 상호작용 UI(팝오버 바깥 탭 백드롭/배치
// 오버레이)의 z는 이제 옛 townScene.js Z_LAYERS(0~100, depthOrder.js
// 값보다 훨씬 작아 Step 4~6 동안 세계 오브젝트에 항상 가려졌었다) 대신
// sceneZ.js의 씬 로컬 UI 상수를 쓴다. 배치 오버레이 앵커도
// townScene.freeAnchors(옛 SPOT_MAP 47칸)가 아니라
// worldRender.freeWorldAnchors(placementContract.js 47칸 배치 계약,
// riverApproach 3칸은 Lv6부터 열림)에서 온다 — 상호작용 로직(팝오버
// 열기/닫기/Escape/바깥 탭/핸들러 위임) 자체는 전혀 바뀌지 않았다.
//
// 2026-09-18 D1 정정 — placements(렌더용, 부모가 이미 isFixedLandmarkId로
// 고정 랜드마크를 걸러낸 renderPlacements)와 occupancyPlacements(점유
// 판정용, 걸러내지 않은 전체 목록) 두 prop으로 분리한다. 이유:
// townLayout.placeItem/moveItem은 그 칸에 이미 어떤 placement든(고정
// 랜드마크 레거시 항목 포함) 있으면 'cell_occupied'로 배치를 거부하는
// 데이터 계층 규칙을 갖고 있다(재구현 없음, 그 규칙 자체는 townLayout.js
// 소유) — 그런데 이 화면은 고정 랜드마크를 "배치 가능한 빈 칸"으로 잘못
// 보여주면 안 되므로(TownObjectLayer는 렌더하지 않음) freeWorldAnchors가
// occupancyPlacements(전체, 데이터 진실)로 계산해야 그 칸을 애초에
// 빈 앵커 후보에서 제외한다 — placements(렌더용, 걸러진 목록)로 계산하면
// 실제로는 점유된 그 칸이 빈 앵커처럼 보여 탭이 조용히 실패하는
// 회귀가 생긴다.

import { useState, useEffect, useRef } from 'react'
import TownGroundLayer from './TownGroundLayer'
import TownWaterLayer from './TownWaterLayer'
import TownPathLayer from './TownPathLayer'
import TownSceneryLayer from './TownSceneryLayer'
import TownAmbientLayer from './TownAmbientLayer'
import TownObjectLayer from './TownObjectLayer'
import TownFogLayer from './TownFogLayer'
import TownPlacementOverlay from './TownPlacementOverlay'
import { SCENE_ASPECT_RATIO, freeWorldAnchors } from '../../../utils/town/worldRender'
import { BACKDROP_Z } from './sceneZ'

export default function TownScene({
  placements, occupancyPlacements, itemById, mode, onCellTap, onStartMove, onStore, richness, gardenPoints, fog, level, ownedIds,
}) {
  const [openPlacementId, setOpenPlacementId] = useState(null)
  const modeKind = (mode && mode.kind) || 'idle'
  const triggerRef = useRef(null)

  function closePopover() {
    setOpenPlacementId(null)
    const el = triggerRef.current
    if (el && typeof el.focus === 'function' && document.contains(el)) el.focus()
    triggerRef.current = null
  }

  function handleTogglePlacement(placementId, triggerEl) {
    setOpenPlacementId((cur) => {
      if (cur === placementId) {
        triggerRef.current = null
        return null
      }
      triggerRef.current = triggerEl || null
      return placementId
    })
  }

  // Escape로 팝오버 닫기(열려 있을 때만 리스너 부착 — TownSheet.jsx와 동일 관례)
  useEffect(() => {
    if (openPlacementId == null) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') closePopover()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPlacementId])

  function handleStartMove(placementId) {
    triggerRef.current = null
    setOpenPlacementId(null)
    onStartMove && onStartMove(placementId)
  }

  function handleStore(placementId) {
    triggerRef.current = null
    setOpenPlacementId(null)
    onStore && onStore(placementId)
  }

  function handleAnchorTap(x, y) {
    triggerRef.current = null
    setOpenPlacementId(null)
    onCellTap && onCellTap(x, y)
  }

  return (
    <div>
      <div
        data-testid="town-scene-v2"
        role="group"
        aria-label="내 마을"
        className="relative overflow-hidden -mx-4 w-[calc(100%+2rem)]"
        style={{ aspectRatio: SCENE_ASPECT_RATIO }}
      >
        <TownGroundLayer level={level} />
        <TownWaterLayer level={level} />
        <TownPathLayer level={level} />
        <TownSceneryLayer level={level} />
        <TownAmbientLayer richness={richness} gardenPoints={gardenPoints} level={level} />
        {openPlacementId != null && (
          <button
            type="button"
            data-testid="town-scene-backdrop"
            aria-label="팝오버 닫기"
            onClick={closePopover}
            className="absolute inset-0 w-full h-full cursor-default"
            style={{ zIndex: BACKDROP_Z }}
          />
        )}
        <TownObjectLayer
          placements={placements}
          itemById={itemById}
          modeKind={modeKind}
          openPlacementId={openPlacementId}
          onTogglePlacement={handleTogglePlacement}
          onStartMove={handleStartMove}
          onStore={handleStore}
          level={level}
          ownedIds={ownedIds}
        />
        <TownFogLayer fog={fog} level={level} ownedIds={ownedIds} />
        {modeKind !== 'idle' && (
          <TownPlacementOverlay
            anchors={freeWorldAnchors(occupancyPlacements, level)}
            onAnchorTap={handleAnchorTap}
          />
        )}
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">🏡 My House · 아이템을 눌러 이동하거나 보관해요</p>
    </div>
  )
}
