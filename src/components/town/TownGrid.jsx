// src/components/town/TownGrid.jsx — Paul Town V1 8x6 마을 격자(2026-09-11,
// 2026-09-15 마을 장면 비주얼 업그레이드 — 격자(checkerboard) 인상 제거,
// 2026-09-15b 환경 아트워크 배선 — 사용자 승인 콘셉트 이미지 기반).
//
// 좌표/클릭 판정은 그대로 8x6 격자다 — 바뀐 건 오직 겉모습이다. 1차
// 업그레이드(CSS-only 그라데이션+점무늬)에 이어, 이번엔 사용자가 승인한
// 콘셉트 이미지를 참고해 실제 환경 아트워크 4종(하늘/원경 마을, 돌담+
// 산울타리, 자갈길 텍스처, 정원 장식 스프라이트 3개)을 이 grid 컨테이너
// 밑 절대배치 "바닥" 레이어 안에 깐다 — 전부 순수 장식(aria-hidden +
// pointer-events-none), 구매/소유/배치 가능한 오브젝트는 단 하나도 이
// 레이어에 포함하지 않는다(칸 버튼/CellSprite가 여전히 유일한 배치
// 표현). 칸(버튼)은 idle일 땐 투명해 바닥이 그대로 비쳐 보이고,
// placing/moving일 때만 빈 칸에 점선 원 안내가 뜬다(V2
// TownPlacementOverlay.jsx와 같은 원리) — 배치 완료/취소 즉시 mode가
// idle로 돌아가므로 안내도 함께 사라진다. ambientClassFor/depthClassFor
// (townAmbient.js, 2026-09-12에 이미 만들어졌지만 그 세션엔 배선하지
// 않았던 순수 함수)로 칸마다 미묘한 톤 차이를 줘 격자 리듬이 보이지
// 않게 한다.
// HOME_CELL(고정 🏠 My House)은 절대 탭 불가. 다른 칸은 mode(idle/
// placing/moving)에 따라 탭 동작이 달라진다:
//   - idle: 빈 칸은 반응 없음, 놓인 아이템은 이동/보관 미니 액션 스트립을
//     연다(로컬 open 상태, 부모 상태 변경 없음).
//   - placing/moving: 빈 칸을 탭하면 onCellTap(x,y)를 호출(부모가 실제
//     배치/이동을 수행). 놓인 칸은 이 모드에서 탭 무시(충돌 방지).
import { useState, useEffect } from 'react'
import { TOWN_GRID, HOME_CELL } from '../../utils/town/townLayout'
import { townAsset } from '../../assets/town'
import { ambientClassFor, depthClassFor } from '../../utils/town/townAmbient'
import skyBackdrop from '../../assets/town/backgrounds/village-sky-backdrop.webp'
import hedgeBorder from '../../assets/town/backgrounds/village-hedge-border.webp'
import cobblestoneTile from '../../assets/town/backgrounds/village-cobblestone-tile.webp'
import gardenAccent1 from '../../assets/town/backgrounds/garden-accent-1.webp'
import gardenAccent2 from '../../assets/town/backgrounds/garden-accent-2.webp'
import gardenAccent3 from '../../assets/town/backgrounds/garden-accent-3.webp'

// 2026-09-15b — 실제 자갈길 텍스처 타일(사용자 승인, village-cobblestone-tile.webp).
// 타일 자체 비율(320x213 ≈ 1.5:1)을 유지한 채 칸 크기에 맞는 스케일로
// repeat — CSS radial-gradient 점무늬(1차 업그레이드)를 대체한다.
const COBBLE_STYLE = {
  backgroundImage: `url(${cobblestoneTile})`,
  backgroundRepeat: 'repeat',
  backgroundSize: '96px 64px',
}

// 정원 장식 스프라이트 3개(사용자 승인) — 전부 장식용, aria-hidden +
// pointer-events-none. 칸 좌표와 무관한 퍼센트 위치라 8x6 격자 리듬과
// 섞이지 않는다. HOME_CELL/자갈길 밴드/하늘·산울타리 밴드와 겹치지
// 않는 잔디 영역에만 배치.
const GARDEN_ACCENTS = [
  { src: gardenAccent1, left: 9, top: 80, width: 9 },
  { src: gardenAccent2, left: 84, top: 76, width: 11 },
  { src: gardenAccent3, left: 80, top: 32, width: 13 },
]

// 2026-09-15 — TownSprite.jsx(V2)에 이미 있는 런타임 이미지 로드 실패
// 폴백을 V1에도 미러링(전체 여정 감사에서 발견된 기존 격차, P2) — 해시
// 자산이 배포 이후 사라져도 깨진 이미지 아이콘 대신 이모지로 전환한다.
function CellSprite({ assetKey, asset, emoji }) {
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => { setLoadFailed(false) }, [assetKey])
  if (asset && !loadFailed) {
    return (
      <img
        src={asset}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setLoadFailed(true)}
        className="relative w-full h-full object-contain"
      />
    )
  }
  return <span aria-hidden="true" className="relative">{emoji || '🎁'}</span>
}

export default function TownGrid({ placements, itemById, mode, onCellTap, onStartMove, onStore }) {
  const [openPlacementId, setOpenPlacementId] = useState(null)
  const modeKind = (mode && mode.kind) || 'idle'
  const midRow = Math.floor(TOWN_GRID.rows / 2)
  const list = Array.isArray(placements) ? placements : []
  const byCell = {}
  for (const p of list) {
    if (p) byCell[`${p.x},${p.y}`] = p
  }

  function isHomeCell(x, y) {
    return x === HOME_CELL.x && y === HOME_CELL.y
  }

  function handleCellClick(x, y) {
    if (isHomeCell(x, y)) return
    const placed = byCell[`${x},${y}`]
    if (placed) {
      if (modeKind === 'idle') {
        setOpenPlacementId((cur) => (cur === placed.placementId ? null : placed.placementId))
      }
      return
    }
    setOpenPlacementId(null)
    if (modeKind === 'placing' || modeKind === 'moving') {
      onCellTap && onCellTap(x, y)
    }
  }

  const cells = []
  for (let y = 0; y < TOWN_GRID.rows; y++) {
    for (let x = 0; x < TOWN_GRID.cols; x++) cells.push({ x, y })
  }

  // 자갈길 밴드 위치(가운데 행) — V2 TownPathLayer.jsx와 동일한 퍼센트 계산.
  const laneTopPct = (midRow / TOWN_GRID.rows) * 100
  const laneHeightPct = (1 / TOWN_GRID.rows) * 100

  return (
    <div className="max-w-lg mx-auto">
      {/* 2026-09-11 터치 타겟 40px 보장 — 8칸을 각각 40px 이상으로 확보하면
          360~390px 폭 화면에서는 그리드가 뷰포트보다 넓어진다. 페이지 전체가
          가로로 밀리지 않도록 이 wrapper 안에서만 가로 스크롤되게 하고(모바일
          규칙: 넓은 콘텐츠는 자기 컨테이너 안에서 스크롤), 마지막 줄의 이동/
          보관 액션 스트립이 잘리지 않도록 아래 여백(pb-16)을 넉넉히 둔다. */}
      <div className="overflow-x-auto -mx-2 px-2 pb-16">
        <div className="rounded-3xl overflow-hidden border-4 border-[#8fb37a]/60">
          {/* 2026-09-15b — 하늘/원경 마을 + 돌담·산울타리를 grid 칸 위에
              절대배치로 겹치지 않고, 격자 "위"의 별도 헤더 띠로 분리한다.
              1차 배선(칸 내부에 겹쳐 그림)은 0행(y=0)에 배치한 아이템이
              하늘 배경의 나뭇가지 그림과 완전히 겹쳐 안 보이는 실제
              버그였다(시각 QA 스크린샷으로 발견) — 헤더를 grid 바깥으로
              분리해 8x6 어느 칸과도 절대 겹치지 않게 고쳤다. */}
          <div className="relative h-16 sm:h-20 md:h-24" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{ backgroundImage: `url(${skyBackdrop})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
            />
            <div
              className="absolute inset-x-0 bottom-0 h-[62%]"
              style={{ backgroundImage: `url(${hedgeBorder})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
            />
          </div>
          <div
            className="relative grid gap-1 rounded-3xl p-2"
            style={{ gridTemplateColumns: `repeat(${TOWN_GRID.cols}, minmax(40px, 1fr))` }}
          >
          {/* 마을 바닥(장식) — 칸과 무관한 연속 레이어 하나. overflow-hidden으로
              모든 장식 요소를 rounded-3xl 안에 가둔다(부모 grid 컨테이너
              자체엔 overflow-hidden을 안 둬 아래 이동/보관 팝오버가 안 잘림).
              자갈길 텍스처 + 정원 장식 스프라이트(둘 다 사용자 승인
              아트워크)만 여기 배선한다 — 전부 구매/배치 불가능한 순수
              배경이고, 실제 소유 아이템은 여전히 칸 버튼(CellSprite)에서만
              렌더된다. */}
          <div
            className="absolute inset-0 rounded-3xl overflow-hidden bg-gradient-to-b from-[#fdebd0] via-[#f6e3c8] to-[#cfe3c0] pointer-events-none"
            aria-hidden="true"
          >
            {/* 정원 장식 스프라이트 — HOME_CELL/자갈길과 겹치지 않는 잔디
                영역에만. 구매 불가, 완전히 장식용. alt 속성을 아예 두지
                않는다(aria-hidden="true"만으로 이미 보조기술에서 완전히
                숨겨짐) — alt=""도 img[alt] 셀렉터엔 걸려, "화면에 폴
                이미지 정확히 1장"을 세는 기존 회귀 테스트(townV1.spec.mjs)
                의 카운트를 실제로 깨뜨렸다(발견·수정, 2026-09-15b). */}
            {GARDEN_ACCENTS.map((a, i) => (
              <img
                key={i}
                src={a.src}
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="absolute pointer-events-none select-none"
                style={{ left: `${a.left}%`, top: `${a.top}%`, width: `${a.width}%`, height: 'auto' }}
              />
            ))}
            {/* 자갈길(가운데 행) — 실제 텍스처 타일로 연속 렌더, 칸 사이
                gap에도 끊기지 않는다. */}
            <div
              className="absolute left-0 right-0 border-y-2 border-[#1e2a5a]/10"
              style={{ top: `${laneTopPct}%`, height: `${laneHeightPct}%`, ...COBBLE_STYLE }}
            />
            <div className="absolute inset-0 rounded-3xl shadow-[inset_0_0_0_6px_rgba(143,179,122,0.45)]" />
          </div>
          {cells.map(({ x, y }) => {
          const home = isHomeCell(x, y)
          const placed = !home ? byCell[`${x},${y}`] : null
          const item = placed ? itemById && itemById[placed.itemId] : null
          const isPath = !home && y === midRow
          const isOpen = !!placed && openPlacementId === placed.placementId
          const isEmpty = !home && !placed
          const showPlacementGuide = isEmpty && (modeKind === 'placing' || modeKind === 'moving')
          const asset = item ? townAsset(item.assetKey) : null
          const ambientTint = (!home && !isPath) ? (ambientClassFor(x, y) || '') : ''
          const depthTone = !home ? depthClassFor(y, TOWN_GRID.rows) : ''
          const label = home
            ? 'My House'
            : placed
              ? `${item ? item.name : placed.itemId} — 눌러서 이동하거나 보관해요`
              : `빈 칸 (${x + 1}, ${y + 1})`

          return (
            <div key={`${x},${y}`} className="relative aspect-square">
              <button
                type="button"
                onClick={() => handleCellClick(x, y)}
                aria-label={label}
                disabled={home}
                className={`relative w-full h-full rounded-xl flex items-center justify-center leading-none ${depthTone} ${
                  home
                    ? 'bg-[radial-gradient(circle,rgba(253,235,208,0.85)_0%,transparent_72%)]'
                    : `bg-transparent ${ambientTint}`
                }`}
                style={{ fontSize: 'clamp(0.85rem, 4vw, 1.5rem)' }}
              >
                {home && <span aria-hidden="true">🏠</span>}
                {/* 2026-09-15 — 배치 안내는 칸 전체를 채우는 점선 사각형이
                    아니라 V2 TownPlacementOverlay.jsx와 동일하게 칸 중앙의
                    작은 원 하나로 최소화한다("체스판처럼 보이지 않게" —
                    코디네이터 지시). */}
                {showPlacementGuide && (
                  <span aria-hidden="true" className="absolute w-[45%] h-[45%] max-w-7 max-h-7 rounded-full border-2 border-dashed border-[#e0a73a]/70 bg-[#fdebd0]/50 motion-safe:animate-pulse" />
                )}
                {!home && placed && (
                  <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3/5 h-1.5 rounded-full bg-black/15 blur-[1px]" />
                )}
                {!home && placed && (
                  <CellSprite assetKey={placed.itemId} asset={asset} emoji={item ? item.emoji : '🎁'} />
                )}
              </button>
              {isOpen && (
                <div className="absolute z-10 left-1/2 top-full -translate-x-1/2 mt-1 flex gap-1 bg-white rounded-2xl card-shadow p-1 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => { setOpenPlacementId(null); onStartMove && onStartMove(placed.placementId) }}
                    className="min-h-[44px] px-3 rounded-xl bg-purple-100 text-purple-600 text-xs font-black btn-press"
                  >
                    이동
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpenPlacementId(null); onStore && onStore(placed.placementId) }}
                    className="min-h-[44px] px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-black btn-press"
                  >
                    보관
                  </button>
                </div>
              )}
            </div>
          )
        })}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">🏠 My House · 아이템을 눌러 이동하거나 보관해요</p>
    </div>
  )
}
