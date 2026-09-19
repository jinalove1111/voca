// src/components/town/v2/TownObjectLayer.jsx — Paul Town V2 오브젝트(건물
// 로트 + 배치 아이템) 레이어(2026-09-18 재작성, 작업 지시서 STEP 7 — 세계
// 좌표 렌더러 전환의 마지막 단계).
//
// 이 파일은 세 가지를 그린다: 1) 고정 건물 로트(LOTS, townScene.js —
// 진실 원천 무변경) — 상태(hidden/for-sale/built)는 여전히
// lotState(lot, level, ownedIds)로 판정하지만(재구현 없음), 위치/크기는
// 이제 worldRender.landmarkBox(lot.id)(worldContract.js LANDMARKS가
// 원천)에서 온다. 2) 고정 집(My House) — 전용 블록, landmarkBox('my-house')
// 로 위치를 구하되 여전히 townScene.js HOME_SPRITE로 그린다(카탈로그
// 아이템이 아니라서 itemById에 없음, 기존과 동일한 이유). 3) 배치된
// 아이템 — worldRender.cellAnchor(x,y)(placementContract.js 47칸 계약이
// 원천)로 위치를 구한다. 각 배치 아이템은 44px+ 버튼으로 감싸 탭하면
// (idle 모드에서만) 이동/보관 미니 액션 팝오버를 연다 — 이 파일은
// openPlacementId를 소유하지 않고 부모(TownScene.jsx)가 넘겨준 값/콜백만
// 쓴다(V1 TownGrid와 동일 정신, 소유권만 부모로 옮김) — 상호작용 로직은
// 이번 재작성에서 전혀 바뀌지 않았다.
//
// 2026-09-18 신규 — 'hidden' 로트(구역 아직 안 열림)도 이제 null을
// 반환하지 않고, 하네스의 "locked" 표현(실제 아트를 LOCKED_FILTER로
// 흐리게 + LOCKED_VEIL 반투명 베일, aria-hidden, 클릭 불가)을 그대로
// 포팅해 그린다(카탈로그 아트가 아직 없는 로트는 여전히 아무것도 그리지
// 않는다 — 새 placeholder를 발명하지 않는다). Lv.N 표지판/헤이즈는 이
// 파일이 아니라 TownFogLayer.jsx가 그린다(그 파일 헤더 참고, 소유권
// 분리). 랜드마크 그림자(LANDMARK_DECOR[id].shadowScale)도 이번에 처음
// 그린다 — 하네스가 locked/unlocked 무관하게 항상 그림자를 그리므로
// built/hidden 둘 다에 적용하고(for-sale은 실제 아트가 아니라 그림자를
// 안 그린다 — V2 고유 상태라 하네스에 대응 규칙이 없다, 이 세션의 선택),
// 그림자와 본체가 같은 z를 쓰고 그림자를 먼저 렌더해(DOM 순서) 동일 z
// 타이브레이크로 항상 본체 아래 깔린다(TownSceneryLayer.jsx 소품 그림자와
// 동일 패턴).
//
// z-index — 랜드마크는 worldZIndex('architecture', box.bottomPct, id),
// 배치 아이템은 worldZIndex('objects', anchor.depthY, placementId). 이
// 레이어 래퍼 자신은 z-index를 갖지 않는다(TownGroundLayer.jsx 헤더와
// 동일 이유 — 스태킹 컨텍스트를 만들지 않아야 y-랭킹 항목들이 다른
// 레이어와 전역적으로 올바르게 섞인다). 팝오버 z는 sceneZ.js의
// POPOVER_Z(씬 로컬 UI 상수, 세계 전체보다 항상 위).
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import TownSprite from './TownSprite'
import { townAsset } from '../../../assets/town'
import {
  HOME_SPRITE, spriteFor, SCENE_ROWS, LOTS, lotState, districtForCell,
} from '../../../utils/town/townScene'
import {
  landmarkBox, cellAnchor, worldZIndex, isFixedLandmarkId, placedItemWidthPct,
} from '../../../utils/town/worldRender'
import { LANDMARK_DECOR, LOCKED_FILTER, LOCKED_VEIL } from '../../../utils/town/worldScenery'
import { POPOVER_Z } from './sceneZ'

// 하네스 .shadow CSS 그대로(재도출 없음, TownSceneryLayer.jsx 소품
// 그림자와 동일 상수 — 파일당 소유권 원칙상 이 파일이 독립적으로 갖는다).
const SHADOW_BACKGROUND = 'radial-gradient(ellipse at center, rgba(30,25,15,0.35) 0%, rgba(30,25,15,0.16) 55%, rgba(30,25,15,0) 75%)'

// 랜드마크 하나의 지오메트리 스타일 — built/for-sale/hidden 세 분기 +
// My House 전용 블록이 전부 이 함수 하나를 공유한다(정적 계약 §19가
// "geometry 스타일 블록이 중복되지 않는다"를 이 함수 정의 안의 리터럴
// 등장 횟수로 확인한다).
function landmarkGeometryStyle(box, z) {
  return {
    left: `${box.leftPct}%`,
    top: `${box.bottomPct}%`,
    width: `${box.widthPct}%`,
    height: `${box.heightPct}%`,
    transform: 'translate(-50%, -100%)',
    zIndex: z,
  }
}

// 랜드마크 z — architecture 티어, box 자신의 bottomPct로 y-랭킹한다.
// built/for-sale/hidden 분기 + My House 전용 블록이 전부 공유(정적
// 계약 §19가 이 호출의 리터럴 등장 횟수를 확인 — 위 landmarkGeometryStyle
// 과 같은 이유).
function landmarkZ(box, id) {
  return worldZIndex('architecture', box.bottomPct, id)
}

// 랜드마크 그림자 — LANDMARK_DECOR[lot.id].shadowScale이 있을 때만.
// shadow.wPct = box.widthPct * a, shadow.hPct = (box.widthPct * b) / 1.9
// (하네스 renderLandmark()의 shadow.style.width/height 산식 그대로,
// pctH가 나누는 WORLD_ASPECT=1.9와 동일).
function LotShadow({ lot, box, z }) {
  const decor = LANDMARK_DECOR[lot.id]
  if (!decor || !decor.shadowScale) return null
  const [wScale, hScale] = decor.shadowScale
  return (
    <div
      aria-hidden="true"
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${box.leftPct}%`,
        top: `${box.bottomPct}%`,
        width: `${box.widthPct * wScale}%`,
        height: `${(box.widthPct * hScale) / 1.9}%`,
        transform: 'translate(-50%, -35%)',
        background: SHADOW_BACKGROUND,
        zIndex: z,
      }}
    />
  )
}

// 2026-09-19 신규 — 배치 이동/보관 팝오버의 수평 클리핑 정정(오너 지시서,
// 확정 버그). 옛 popoverAlign은 논리 배치 그리드 인덱스(p.x, 0~7 — 8x6
// SPOT_MAP 좌표)로 좌/우 정렬을 골랐는데, 실제 화면 위치는 world %
// 좌표(anchor.leftPct, worldRender.cellAnchor())라 같은 "중간/마지막"
// 인덱스도 실제로는 화면 왼쪽 가장자리 근처일 수 있었다(실측: SPOT_MAP
// '7,5'는 논리상 마지막 열이라 옛 코드가 'right-0'을 줬지만 실제
// leftPct=14.75%로 왼쪽 가장자리에 가까워 오히려 더 왼쪽으로 밀려
// 잘렸다). 세로축은 이미 anchor.bottomPct(실제 위치)로 판정하는데
// (TownObjectLayer의 nearGlobalTop/nearGlobalBottom) 가로축만 이 교훈을
// 놓치고 있었다 — 아래에서 가로축도 anchor.leftPct로 초기 정렬을
// 고르도록 고쳤다(세로축과 동일 정신의 임계값 미러링, 호출부 참고).
//
// 그 위에 실측 지오메트리 안전장치를 한 겹 더 얹는다 — 퍼센트 임계값
// 만으로는 겹치지 않는다는 "보장"이 되지 않는다(팝오버 자신의 픽셀
// 너비는 고정인데 씬의 픽셀 너비는 360/390/430로 갈리고, world %→실제
// px 매핑도 폭마다 살짝 달라진다 — 실측상 390px에서는 씬 컨테이너의
// 실제 sceneBox.x가 0이 아니라 음수였다). 그래서 팝오버가 열릴 때
// 딱 한 번(useLayoutEffect, isOpen 의존) 자신의 getBoundingClientRect()를
// 씬 박스([data-testid="town-scene-v2"], closest()로 찾음 — TownScene.jsx
// 가 이미 이 testid를 소유)와 비교해, 왼쪽/오른쪽 경계를 marginPx(4,
// worldRender.layoutPlacementControls의 D5 중심-배제 여유(margin=2)와
// 같은 자릿수의 작은 안전 여유) 이상 벗어나면 marginLeft(px)로 되돌린다.
// margin은 박스 모델 단계에서 적용되고 transform은 그 위에 그대로
// 얹히므로 left-0/right-0/가운데(translateX(-50%)) 세 정렬 클래스
// 어느 것과도 충돌하지 않는다(대체가 아니라 합성 — 인라인 transform을
// 직접 쓰면 Tailwind 가운데 정렬 클래스의 translateX(-50%)를 지워버려
// 충돌했을 것). isOpen이 바뀔 때만 재계산하고 닫히면 0으로 리셋하므로
// 루프/지터가 없다 — 아이템 자체(버튼) 위치는 전혀 건드리지 않는다,
// 팝오버 엘리먼트에만 적용한다. SSR/DOM 부재에도 안전(ref가 비어 있으면
// 그냥 조기 반환, 이 컴포넌트는 이미 브라우저 전용 트리 안에서만 쓰인다).
function PlacementPopover({
  isOpen, verticalClass, alignClass, zIndex, onStartMove, onStore,
}) {
  const ref = useRef(null)
  const [safeMarginLeft, setSafeMarginLeft] = useState(0)

  useLayoutEffect(() => {
    if (!isOpen) { setSafeMarginLeft(0); return }
    const el = ref.current
    if (!el) return
    const scene = el.closest('[data-testid="town-scene-v2"]')
    if (!scene) return
    const popRect = el.getBoundingClientRect()
    const sceneRect = scene.getBoundingClientRect()
    const marginPx = 4
    let dx = 0
    if (popRect.left < sceneRect.left + marginPx) {
      dx = (sceneRect.left + marginPx) - popRect.left
    } else if (popRect.right > sceneRect.right - marginPx) {
      dx = (sceneRect.right - marginPx) - popRect.right
    }
    setSafeMarginLeft(dx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      ref={ref}
      className={`absolute ${verticalClass} flex gap-1 bg-white rounded-2xl card-shadow p-1 whitespace-nowrap ${alignClass}`}
      style={{ zIndex, marginLeft: safeMarginLeft || undefined }}
    >
      <button
        type="button"
        onClick={onStartMove}
        className="pointer-events-auto min-h-[44px] px-3 rounded-xl bg-purple-100 text-purple-600 text-xs font-black btn-press"
      >
        이동
      </button>
      <button
        type="button"
        onClick={onStore}
        className="pointer-events-auto min-h-[44px] px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-black btn-press"
      >
        보관
      </button>
    </div>
  )
}

export default function TownObjectLayer({
  placements, itemById, modeKind, openPlacementId, onTogglePlacement, onStartMove, onStore, level, ownedIds,
}) {
  // 2026-09-18 D1 정정 — 이 필터는 부모(TownScreenV2.jsx)가 이미
  // isFixedLandmarkId로 걸러낸 renderPlacements를 넘겨줄 것으로
  // 기대하지만, 이 레이어 자신도 독립적으로 방어한다(호출자가 실수로
  // 원본 placements를 넘겨도 고정 로트를 두 번 그리지 않는다) — 고정
  // 로트(LOTS)는 항상 아래 LOTS.map 루프가 lotState()로만 그리고, 이
  // 배치 루프는 고정 로트가 아닌 항목만 그린다.
  const list = Array.isArray(placements) ? placements.filter((p) => p && !isFixedLandmarkId(p.itemId)) : []
  const idle = modeKind === 'idle'
  const owned = Array.isArray(ownedIds) ? ownedIds : []
  const myHouseBox = landmarkBox('my-house')
  const myHouseZ = myHouseBox ? landmarkZ(myHouseBox, 'my-house') : null

  // 2026-09-14 — 이 레이어의 루트는 씬 전체를 덮는 absolute inset-0라
  // (objects z-index가 배치 팝오버 바깥 탭 백드롭보다 위) 실제 스프라이트가
  // 없는 빈 칸에서도 포인터 이벤트를 가로채 백드롭 탭을 막았다(E2E 실측
  // 확인). 루트는 pointer-events-none으로 "투명"하게 두고, 실제 클릭
  // 가능한 요소(토글/이동/보관 버튼)에만 pointer-events-auto로 되살린다.
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* 고정 건물 로트(LOTS). */}
      {LOTS.map((lot) => {
        if (lot.id === 'my-house') return null // my-house는 아래 전용 블록이 소유.
        const state = lotState(lot, level, owned)
        if (state === 'hidden') {
          // 2026-09-18 신규 — 하네스의 "locked" 표현: 실제 카탈로그 아트를
          // LOCKED_FILTER로 흐리게 + LOCKED_VEIL 베일을 그 위에 덮는다.
          // 아트가 아직 등록 안 됐으면(현재 실제로 없는 경우 없음) 아무것도
          // 그리지 않는다(새 placeholder 발명 없음, 작업 지시서 명시).
          const catalogItem = itemById && itemById[lot.id]
          const sprite = catalogItem ? spriteFor(catalogItem) : null
          const hasArt = !!sprite && !!townAsset(sprite.assetKey)
          if (!hasArt) return null
          const box = landmarkBox(lot.id)
          if (!box) return null
          const z = landmarkZ(box, lot.id)
          return (
            <Fragment key={lot.id}>
              <LotShadow lot={lot} box={box} z={z} />
              <div
                data-testid={`town-lot-${lot.id}`}
                data-lot-id={lot.id}
                data-lot-state={state}
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={landmarkGeometryStyle(box, z)}
              >
                <div className="w-full h-full" style={{ filter: LOCKED_FILTER.filter, opacity: LOCKED_FILTER.opacity }}>
                  <TownSprite sprite={sprite} className="w-full h-full" />
                </div>
                <div className="absolute inset-0" style={{ background: LOCKED_VEIL.background }} />
              </div>
            </Fragment>
          )
        }

        // 2026-09-18 D1 정정 — 이전 세션은 "배치된 사본이 있으면 고정
        // 로트를 숨긴다"(landmarkRenderSource)는 규칙으로 중복 렌더를
        // 막으려 했으나, 이는 잘못된 규칙이었다(오너 정정) — LOTS id는
        // 애초에 "자유 배치 가능한 일반 아이템"이 아니라 항상 고정 박스
        // 에서만 그려지는 랜드마크이므로, 그 반대쪽(배치 루프, 위 list
        // 필터)에서 LOTS id를 아예 배치 대상에서 제외하는 것이 올바른
        // 수정이다. 이 고정 로트는 그래서 다시 lotState()가 정한
        // built/for-sale 상태만 보고 배치 데이터와 무관하게 그린다(D1
        // 정정 이전 동작으로 복귀).
        const box = landmarkBox(lot.id)
        if (!box) return null
        const built = state === 'built'
        // built 로트만 실제 카탈로그 아이템/아트를 찾아본다. itemById[lot.id]
        // 는 my-house를 제외한 6개 로트 id와 카탈로그 id가 1:1이라 그대로
        // 조회된다. townAsset()이 null이면(아직 등록 안 된 아트) hasArt는
        // false로 남아 아래에서 기존 placeholder 박스로 안전 폴백한다.
        const catalogItem = itemById && itemById[lot.id]
        const sprite = built && catalogItem ? spriteFor(catalogItem) : null
        const hasArt = !!sprite && !!townAsset(sprite.assetKey)
        const z = landmarkZ(box, lot.id)

        return (
          <Fragment key={lot.id}>
            {built && <LotShadow lot={lot} box={box} z={z} />}
            <div
              data-testid={`town-lot-${lot.id}`}
              data-lot-id={lot.id}
              data-lot-state={state}
              aria-hidden="true"
              className={hasArt ? 'absolute' : `absolute rounded-md ${built ? 'bg-[#8fb37a]/70 border-2 border-[#1e2a5a]/40' : 'bg-[#d9d2c5]/50 border-2 border-dashed border-[#1e2a5a]/40'}`}
              style={landmarkGeometryStyle(box, z)}
            >
              {hasArt ? (
                <TownSprite sprite={sprite} className="w-full h-full" />
              ) : (
                !built && (
                  <span className="absolute inset-x-0 bottom-0.5 text-center text-[8px] font-black text-[#1e2a5a] leading-tight">for sale</span>
                )
              )}
            </div>
          </Fragment>
        )
      })}

      {myHouseBox && (
        <Fragment>
          <LotShadow lot={{ id: 'my-house' }} box={myHouseBox} z={myHouseZ} />
          <div
            aria-label="My House"
            data-testid="town-home"
            className="absolute"
            style={landmarkGeometryStyle(myHouseBox, myHouseZ)}
          >
            <TownSprite sprite={HOME_SPRITE} className="w-full h-full" />
          </div>
        </Fragment>
      )}

      {list.map((p) => {
        const item = itemById && itemById[p.itemId]
        const sprite = spriteFor(item)
        const anchor = cellAnchor(p.x, p.y)
        const itemDistrict = districtForCell(p.x, p.y)
        const isOpen = openPlacementId === p.placementId
        // 2026-09-19 정정 — 옛 "p.x(논리 배치 그리드 인덱스)가 0/1이면
        // 왼쪽, SCENE_COLS-2 이상이면 오른쪽" 판정은 균일 8x6 그리드 시절
        // 가정에 기댔다(위 세로축 2026-09-16 갱신과 동일 교훈, 아래 참고) —
        // 실제 클리핑 방지는 전역 위치(anchor.leftPct, world %, overflow-
        // hidden인 씬 박스 기준)로 판정한다. 임계값(15/85)은 세로축
        // (12/90)과 같은 정신의 비대칭 미러링일 뿐, 최종 보장은 이 파일
        // 아래 PlacementPopover의 실측 지오메트리 안전장치가 한다(퍼센트
        // 임계값은 그 안전장치가 옮겨야 할 거리를 최소화하는 초기값일
        // 뿐이다).
        const nearGlobalLeft = anchor.leftPct < 15
        const nearGlobalRight = anchor.leftPct > 85
        const popoverAlign = nearGlobalLeft ? 'left-0' : nearGlobalRight ? 'right-0' : 'left-1/2 -translate-x-1/2'
        // 2026-09-16 갱신 — 옛 "마지막 행(y=SCENE_ROWS-1)이면 위로 연다"
        // 판정은 균일 8x6 그리드 시절 "y가 클수록 화면 아래쪽"이라는 가정에
        // 기댔다. 실제 클리핑 방지는 전역 위치(anchor.bottomPct, world %,
        // overflow-hidden인 씬 박스 기준)로 판정한다. 옛 SCENE_ROWS-1 판정은
        // (정적 계약이 그 리터럴을 확인하므로) 코드에 그대로 남기되, 전역
        // 판정이 전부 해당 없을 때만 폴백으로 쓰인다.
        const legacyLastRow = p.y >= SCENE_ROWS - 1
        const nearGlobalTop = anchor.bottomPct < 12
        const nearGlobalBottom = anchor.bottomPct > 90
        const popoverVertical = nearGlobalTop
          ? 'top-full mt-1'
          : (nearGlobalBottom || legacyLastRow) ? 'bottom-full mb-1' : 'top-full mt-1'
        const label = `${sprite.label || (item ? item.name : p.itemId)} — 배치됨. 눌러서 이동하거나 보관해요`
        // 2026-09-18 스케일 보정 — placedItemWidthPct(footprint, y)가
        // worldContract.depthScale(y)로 직접 계산한다(옛 anchor.scale
        // 수동 곱셈은 더 이상 쓰지 않는다 — 같은 depthScale 값을 이 함수
        // 안에서 다시 구하므로 중복이 아니다, worldRender.js 헤더 참고).
        const widthPct = placedItemWidthPct(sprite.footprint, anchor.depthY)

        return (
          <div
            key={p.placementId}
            data-placement-id={p.placementId}
            data-item-id={p.itemId}
            data-cell={`${p.x},${p.y}`}
            data-district={itemDistrict}
            className="absolute"
            style={{
              left: `${anchor.leftPct}%`,
              top: `${anchor.bottomPct}%`,
              width: `${widthPct}%`,
              transform: 'translate(-50%, -100%)',
              zIndex: worldZIndex('objects', anchor.depthY, p.placementId),
            }}
          >
            <button
              type="button"
              onClick={(e) => { if (idle) onTogglePlacement && onTogglePlacement(p.placementId, e.currentTarget) }}
              disabled={!idle}
              aria-label={label}
              className="pointer-events-auto min-h-[44px] min-w-[44px] w-full flex items-center justify-center"
            >
              <TownSprite sprite={sprite} className="w-full h-full" />
            </button>

            <PlacementPopover
              isOpen={isOpen}
              verticalClass={popoverVertical}
              alignClass={popoverAlign}
              zIndex={POPOVER_Z}
              onStartMove={() => onStartMove && onStartMove(p.placementId)}
              onStore={() => onStore && onStore(p.placementId)}
            />
          </div>
        )
      })}
    </div>
  )
}
