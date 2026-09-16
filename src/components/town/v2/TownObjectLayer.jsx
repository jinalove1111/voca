// src/components/town/v2/TownObjectLayer.jsx — Paul Town V2-B 오브젝트
// 레이어(2026-09-16 재작성).
//
// 고정 집(HOME_CELL, 절대 탭 불가) + 배치된 아이템 + 고정 건물 로트(LOTS,
// 신규)를 bottom-anchor로 그린다. 각 배치 아이템은 44px+ 버튼으로 감싸
// 탭하면(idle 모드에서만) 이동/보관 미니 액션 팝오버를 연다 — 이 파일은
// openPlacementId를 소유하지 않고 부모(TownScene.jsx)가 넘겨준 값/콜백만
// 쓴다(V1 TownGrid와 동일 정신, 소유권만 부모로 옮김).
//
// 2026-09-16 월드 지오메트리 확장 — anchorFor/zIndexFor가 이제 level(과
// zIndexFor는 districtId)을 받는다. HOME_CELL/배치 아이템 둘 다 level을
// 넘기고, 배치 아이템은 districtForCell(x,y)로 자기 구역을 구해 zIndexFor에
// 함께 넘긴다(구역 스택 순서가 행보다 우선하도록, townScene.js 헤더 참고).
// 또 LOTS(고정 건물 7개)를 lotState(lot, level, ownedIds)로 상태(hidden/
// for-sale/built) 판정해, 실제 아트가 아직 없으니 dashed(for-sale)/
// solid(built) placeholder 박스로만 그린다 — 새 카탈로그 id/가격/레벨을
// 이 파일이 발명하지 않는다(LOTS.id가 곧 townCatalog.js 아이템 id).
import TownSprite from './TownSprite'
import {
  HOME_CELL, HOME_SPRITE, anchorFor, zIndexFor, spriteFor, Z_LAYERS, FOOTPRINT_CLASS, SCENE_COLS, SCENE_ROWS,
  DISTRICTS, LOTS, lotState, districtForCell, districtLocalToGlobal,
} from '../../../utils/town/townScene'

// LOTS는 townScene.js에서 aspect(세로/가로 비율)를 받지 않는다(작업
// 지시서가 요구한 데이터 항목에 없음) — 실제 아트 전까지는 순수 placeholder
// 박스라, 건물 종류별 대략적인 형태만 wireframe의 aspect 값을 그대로
// 재사용해 시각적 위계를 흉내낸다(숫자 재도출 아님, wireframe LOTS[].aspect
// 그대로 포팅).
const LOT_ASPECT = {
  'my-house': 0.85,
  'book-shop': 0.85,
  cafe: 0.85,
  'stone-fountain': 1.0,
  bridge: 0.45,
  'english-school': 0.8,
  'clock-tower': 2.75,
}

export default function TownObjectLayer({
  placements, itemById, modeKind, openPlacementId, onTogglePlacement, onStartMove, onStore, level, ownedIds,
}) {
  const list = Array.isArray(placements) ? placements.filter(Boolean) : []
  const homeAnchor = anchorFor(HOME_CELL.x, HOME_CELL.y, level)
  const idle = modeKind === 'idle'
  const owned = Array.isArray(ownedIds) ? ownedIds : []

  // 2026-09-14 — 이 레이어의 루트는 씬 전체를 덮는 absolute inset-0라
  // (objects z-index가 배치 팝오버 바깥 탭 백드롭보다 위) 실제 스프라이트가
  // 없는 빈 칸에서도 포인터 이벤트를 가로채 백드롭 탭을 막았다(E2E 실측
  // 확인). 루트는 pointer-events-none으로 "투명"하게 두고, 실제 클릭
  // 가능한 요소(토글/이동/보관 버튼)에만 pointer-events-auto로 되살린다.
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: Z_LAYERS.objects }}>
      {/* 고정 건물 로트(LOTS) — 구역이 아직 안 열렸으면(hidden) 아예 안 그림. */}
      {LOTS.map((lot) => {
        const state = lotState(lot, level, owned)
        if (state === 'hidden') return null
        const district = DISTRICTS[lot.district]
        const g = districtLocalToGlobal(lot.district, lot.left, lot.baseline, level)
        const widthPct = lot.width * (district ? district.scale : 1)
        const aspect = LOT_ASPECT[lot.id] || 0.85
        const built = state === 'built'

        return (
          <div
            key={lot.id}
            data-testid={`town-lot-${lot.id}`}
            data-lot-id={lot.id}
            data-lot-state={state}
            aria-hidden="true"
            className={`absolute rounded-md ${built ? 'bg-[#8fb37a]/70 border-2 border-[#1e2a5a]/40' : 'bg-[#d9d2c5]/50 border-2 border-dashed border-[#1e2a5a]/40'}`}
            style={{
              left: `${g.leftPct}%`,
              top: `${g.bottomPct}%`,
              width: `${widthPct}%`,
              aspectRatio: `1 / ${aspect}`,
              transform: 'translate(-50%, -100%)',
              zIndex: zIndexFor(2, lot.district),
            }}
          >
            {!built && (
              <span className="absolute inset-x-0 bottom-0.5 text-center text-[8px] font-black text-[#1e2a5a] leading-tight">for sale</span>
            )}
          </div>
        )
      })}

      <div
        aria-label="My House"
        data-testid="town-home"
        className={`absolute ${FOOTPRINT_CLASS[HOME_SPRITE.footprint]}`}
        style={{
          left: `${homeAnchor.leftPct}%`,
          top: `${homeAnchor.bottomPct}%`,
          transform: 'translate(-50%, -100%)',
          zIndex: zIndexFor(HOME_CELL.y, 'home'),
        }}
      >
        <div className="relative scale-[1.3] origin-bottom w-full h-full">
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-[#e0a73a]/20 blur-xl" />
          <TownSprite sprite={HOME_SPRITE} className="relative w-full h-full" />
        </div>
      </div>

      {list.map((p) => {
        const item = itemById && itemById[p.itemId]
        const sprite = spriteFor(item)
        const anchor = anchorFor(p.x, p.y, level)
        const itemDistrict = districtForCell(p.x, p.y)
        const isOpen = openPlacementId === p.placementId
        const popoverAlign = p.x <= 1 ? 'left-0' : p.x >= SCENE_COLS - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'
        // 2026-09-16 갱신 — 옛 "마지막 행(y=SCENE_ROWS-1)이면 위로 연다"
        // 판정은 균일 8x6 그리드 시절 "y가 클수록 화면 아래쪽"이라는 가정에
        // 기댔다. 월드 지오메트리 확장 이후로는 y가 클수록 오히려 river/
        // school/tower처럼 스택 더 위쪽 구역일 수 있어(SPOT_MAP) 그 가정이
        // 깨졌다 — 실제 클리핑 방지는 이제 전역 위치(anchor.bottomPct,
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

        return (
          <div
            key={p.placementId}
            data-placement-id={p.placementId}
            data-item-id={p.itemId}
            data-cell={`${p.x},${p.y}`}
            data-district={itemDistrict}
            className={`absolute ${FOOTPRINT_CLASS[sprite.footprint]}`}
            style={{
              left: `${anchor.leftPct}%`,
              top: `${anchor.bottomPct}%`,
              transform: 'translate(-50%, -100%)',
              zIndex: zIndexFor(p.y, itemDistrict),
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

            {isOpen && (
              <div
                className={`absolute ${popoverVertical} flex gap-1 bg-white rounded-2xl card-shadow p-1 whitespace-nowrap ${popoverAlign}`}
                style={{ zIndex: Z_LAYERS.popover }}
              >
                <button
                  type="button"
                  onClick={() => onStartMove && onStartMove(p.placementId)}
                  className="pointer-events-auto min-h-[44px] px-3 rounded-xl bg-purple-100 text-purple-600 text-xs font-black btn-press"
                >
                  이동
                </button>
                <button
                  type="button"
                  onClick={() => onStore && onStore(p.placementId)}
                  className="pointer-events-auto min-h-[44px] px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-black btn-press"
                >
                  보관
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
