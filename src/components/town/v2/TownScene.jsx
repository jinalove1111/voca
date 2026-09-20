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

// 2026-09-20 — 자석 드래그 배치(magnetic drag placement). 탭-투-앵커
// 배치/이동은 그대로 두고(회귀 없음), "이동" 모드에서 아이템을 직접
// 끌어 기존 47칸 배치 계약 앵커 중 가장 가까운 곳에 스냅하는 대안 입력을
// 추가한다. 드래그 진행 상태는 이 컴포넌트(TownScene)가 소유한다 —
// TownObjectLayer(드래그 대상 아이템을 그림)와 TownPlacementOverlay(가장
// 가까운 앵커를 초록으로 강조)의 가장 가까운 공통 조상이라, 두 형제
// 컴포넌트가 공유해야 하는 상태를 여기 한 곳에서만 계산한다(중복 계산
// 없음). 실제 pointerdown/move/up/cancel 이벤트 배선(setPointerCapture
// 포함)은 여전히 TownObjectLayer의 개별 아이템 wrapper가 소유하고
// (DiaryPage.jsx PlacedSticker와 동일 Pointer Events 관례), 이 파일은
// 그 원시 이벤트를 콜백으로 전달받아 "드래그 상태"(파생값: 씬 % 좌표,
// 가장 가까운 앵커, 유효 여부)만 계산·보유한다. 실제 이동 커밋은 새 API를
// 만들지 않고 기존 tap-to-anchor가 쓰는 것과 정확히 같은 경로
// (handleAnchorTap → onCellTap → TownScreenV2.handleCellTap →
// studentData.moveTownItem)를 그대로 재사용한다(CLAUDE.md 규칙 3).
import { useState, useEffect, useRef } from 'react'
import TownGroundLayer from './TownGroundLayer'
import TownWaterLayer from './TownWaterLayer'
import TownPathLayer from './TownPathLayer'
import TownSceneryLayer from './TownSceneryLayer'
import TownAmbientLayer from './TownAmbientLayer'
import TownObjectLayer from './TownObjectLayer'
import TownFogLayer from './TownFogLayer'
import TownPlacementOverlay from './TownPlacementOverlay'
import { SCENE_ASPECT_RATIO, freeWorldAnchors, cellAnchor } from '../../../utils/town/worldRender'
import { BACKDROP_Z } from './sceneZ'

const EMPTY_ANCHORS = []

// 드래그 시작 판정 임계값(px) — 브리프 권장 범위(6~8px) 상단값. 이동
// 모드에서 아이템 wrapper를 그냥 탭(움직임 없음)했을 때 드래그 시각
// 효과가 우발적으로 번쩍이지 않도록 한다(순수 탭과 드래그 시작을 구분).
const DRAG_THRESHOLD_PX = 8

// 스냅 최대 거리(px) — worldRender.layoutPlacementControls가 쓰는 44px
// 최소 탭 타깃(child가 직접 눌러 도달할 수 있는 반경)과 같은 값을
// 재사용한다(새 상수를 발명하지 않고 이미 있는 접근성 기준에 묶는다) —
// 포인터가 어떤 앵커의 실제 화면 위치로부터 44px(실 스크린 px, %가 아님
// — 가로/세로 물리 스케일이 달라 % 거리로는 왜곡된다) 이내면 그 앵커로
// 스냅한다.
const MAX_SNAP_DISTANCE_PX = 44

export default function TownScene({
  placements, occupancyPlacements, itemById, mode, onCellTap, onStartMove, onStore, onDragToast, richness, gardenPoints, fog, level, ownedIds,
}) {
  const [openPlacementId, setOpenPlacementId] = useState(null)
  const [drag, setDrag] = useState(null)
  const modeKind = (mode && mode.kind) || 'idle'
  const movingPlacementId = modeKind === 'moving' ? ((mode && mode.placementId) ?? null) : null
  const triggerRef = useRef(null)
  const sceneRef = useRef(null)
  const latestPointerRef = useRef({ x: 0, y: 0 })
  const rafIdRef = useRef(null)
  const capturedRef = useRef(null)
  const dragActive = drag != null

  // 이동 모드일 때만 의미 있는 빈 칸 목록 — 배치 오버레이 렌더와 드래그
  // 스냅 계산이 정확히 같은 목록(freeWorldAnchors, occupancyPlacements
  // 기준 — 걸러지지 않은 전체 목록으로 점유 판정)을 공유한다(중복 계산/
  // 서로 다른 결과 방지).
  const anchors = modeKind !== 'idle' ? freeWorldAnchors(occupancyPlacements, level) : EMPTY_ANCHORS

  // 포인터의 clientX/clientY → 씬 안에서 가장 가까운 유효 앵커(실 px 거리
  // 기준, cellAnchor의 world % 좌표를 씬 실측 박스 크기로 환산). 드래그
  // 중 rAF 플러시와 pointerup(드롭 확정) 양쪽이 이 하나의 함수만 쓴다
  // (서로 다른 계산이 갈라지지 않도록).
  function computeNearestAnchor(clientX, clientY) {
    const sceneEl = sceneRef.current
    if (!sceneEl) return { nearestAnchor: null, valid: false }
    const rect = sceneEl.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return { nearestAnchor: null, valid: false }
    const pointerPxX = clientX - rect.left
    const pointerPxY = clientY - rect.top
    let nearestAnchor = null
    let nearestDist = Infinity
    for (const a of anchors) {
      const ap = cellAnchor(a.x, a.y)
      const ax = (ap.leftPct / 100) * rect.width
      const ay = (ap.topPct / 100) * rect.height
      const d = Math.hypot(pointerPxX - ax, pointerPxY - ay)
      if (d < nearestDist) { nearestDist = d; nearestAnchor = a }
    }
    return { nearestAnchor, valid: nearestAnchor != null && nearestDist <= MAX_SNAP_DISTANCE_PX }
  }

  function flushDrag() {
    rafIdRef.current = null
    setDrag((cur) => {
      if (!cur) return cur
      const { x: clientX, y: clientY } = latestPointerRef.current
      const sceneEl = sceneRef.current
      if (!sceneEl) return cur
      const rect = sceneEl.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return cur
      let phase = cur.phase
      if (phase === 'pending') {
        const dist = Math.hypot(clientX - cur.downX, clientY - cur.downY)
        if (dist < DRAG_THRESHOLD_PX) return cur
        phase = 'dragging'
      }
      const leftPct = ((clientX - rect.left) / rect.width) * 100
      const topPct = ((clientY - rect.top) / rect.height) * 100
      const { nearestAnchor, valid } = computeNearestAnchor(clientX, clientY)
      return { ...cur, phase, leftPct, topPct, nearestAnchor, valid }
    })
  }

  function scheduleFlush() {
    if (rafIdRef.current != null) return
    rafIdRef.current = requestAnimationFrame(flushDrag)
  }

  function cancelDrag() {
    if (rafIdRef.current != null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
    if (capturedRef.current) {
      const { el, pointerId } = capturedRef.current
      try { el && el.releasePointerCapture && el.releasePointerCapture(pointerId) } catch { /* 이미 해제됨 — 무시 */ }
      capturedRef.current = null
    }
    setDrag(null)
  }

  function handleDragPointerDown(placementId, e) {
    if (drag) return // 이미 드래그 중 — 두 번째 포인터 무시(secondary touch)
    capturedRef.current = { el: e.currentTarget, pointerId: e.pointerId }
    latestPointerRef.current = { x: e.clientX, y: e.clientY }
    setDrag({
      placementId,
      pointerId: e.pointerId,
      phase: 'pending',
      downX: e.clientX,
      downY: e.clientY,
      leftPct: null,
      topPct: null,
      nearestAnchor: null,
      valid: false,
    })
  }

  function handleDragPointerMove(placementId, e) {
    if (!drag || drag.placementId !== placementId || drag.pointerId !== e.pointerId) return
    latestPointerRef.current = { x: e.clientX, y: e.clientY }
    scheduleFlush()
  }

  function handleDragPointerUp(placementId, e) {
    if (!drag || drag.placementId !== placementId || drag.pointerId !== e.pointerId) return
    if (rafIdRef.current != null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
    capturedRef.current = null
    const wasDragging = drag.phase === 'dragging'
    setDrag(null)
    if (!wasDragging) return // 임계값 넘기기 전 탭/릴리즈 — 드래그 자체가 시작 안 됨, 아무 동작 없음.
    const { nearestAnchor, valid } = computeNearestAnchor(e.clientX, e.clientY)
    if (valid && nearestAnchor) {
      handleAnchorTap(nearestAnchor.x, nearestAnchor.y) // tap-to-anchor와 완전히 같은 경로 재사용.
    } else {
      onDragToast && onDragToast('여기에는 놓을 수 없어요.')
    }
  }

  function handleDragPointerCancel(placementId, e) {
    if (!drag || drag.placementId !== placementId || drag.pointerId !== e.pointerId) return
    cancelDrag()
  }

  // Escape로 드래그 취소(팝오버 Escape와 별개 effect — 서로 다른 상태를
  // 감시한다). dragActive(boolean)에만 의존해 드래그 중 프레임마다(좌표가
  // 바뀔 때마다) 리스너를 재등록하지 않는다.
  useEffect(() => {
    if (!dragActive) return undefined
    function onKeyDown(e) { if (e.key === 'Escape') cancelDrag() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActive])

  // 탭 전환/화면 숨김 중 드래그 방치 방지 — 다시 보일 때 이미 커밋된
  // 상태가 없으므로(모든 커밋은 pointerup 시점에 동기적으로 끝남) 그냥
  // 취소한다.
  useEffect(() => {
    if (!dragActive) return undefined
    function onVisibility() { if (document.hidden) cancelDrag() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActive])

  // 외부에서 모드가 바뀌면(예: TownScreenV2의 "취소" 배너 버튼, 또는 다른
  // 경로로 이동 모드를 벗어남) 진행 중인 드래그를 취소한다 — moveTownItem
  // 호출 없이 원래 자리로 남는다(placements 데이터 자체를 안 건드렸으므로
  // drag state만 지우면 자동으로 원래 위치 렌더로 돌아간다).
  useEffect(() => {
    if (!drag) return undefined
    if (modeKind !== 'moving' || (mode && mode.placementId) !== drag.placementId) {
      cancelDrag()
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeKind, mode && mode.placementId])

  // 언마운트 시 예약된 rAF 정리(메모리 누수/setState-after-unmount 방지).
  useEffect(() => () => {
    if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
  }, [])

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
        ref={sceneRef}
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
          movingPlacementId={movingPlacementId}
          drag={drag}
          onDragPointerDown={handleDragPointerDown}
          onDragPointerMove={handleDragPointerMove}
          onDragPointerUp={handleDragPointerUp}
          onDragPointerCancel={handleDragPointerCancel}
        />
        <TownFogLayer fog={fog} level={level} ownedIds={ownedIds} />
        {modeKind !== 'idle' && (
          <TownPlacementOverlay
            anchors={anchors}
            onAnchorTap={handleAnchorTap}
            highlightCell={drag && drag.phase === 'dragging' && drag.valid ? drag.nearestAnchor : null}
          />
        )}
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">🏡 My House · 아이템을 눌러 이동하거나 보관해요</p>
    </div>
  )
}
