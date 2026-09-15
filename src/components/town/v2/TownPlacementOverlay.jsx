// src/components/town/v2/TownPlacementOverlay.jsx — Paul Town V2-A 배치
// 가능 칸 오버레이(2026-09-13).
//
// 부모(TownScene.jsx)가 mode.kind !== 'idle'일 때만 렌더한다 — 이 파일
// 자체는 모드를 판정하지 않고 넘겨받은 anchors(freeAnchors()의 결과, 이미
// 부모가 level로 걸러 넘겨줌)를 그대로 그린다. 각 앵커는 44px 이상 원형
// 버튼으로, 탭하면 onAnchorTap(x,y)를 호출(부모가 실제 배치/이동을 수행).
//
// 2026-09-16 — anchorFor(x,y,level)에 level을 함께 넘긴다(구역별 세계
// 지오메트리 좌표 변환에 필요, townScene.js 헤더 참고).
import { anchorFor, Z_LAYERS } from '../../../utils/town/townScene'

export default function TownPlacementOverlay({ anchors, onAnchorTap, level }) {
  const list = Array.isArray(anchors) ? anchors : []

  return (
    <div className="absolute inset-0 pointer-events-none opacity-90" style={{ zIndex: Z_LAYERS.overlay }}>
      {list.map(({ x, y }) => {
        const { leftPct, topPct } = anchorFor(x, y, level)
        return (
          <button
            key={`${x},${y}`}
            type="button"
            onClick={() => onAnchorTap && onAnchorTap(x, y)}
            aria-label={`여기에 놓기 (${x + 1}, ${y + 1})`}
            data-anchor={`${x},${y}`}
            className="absolute min-h-[44px] min-w-[44px] flex items-center justify-center bg-transparent pointer-events-auto"
            style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: 'translate(-50%, -50%)' }}
          >
            <span aria-hidden="true" className="block w-7 h-7 rounded-full border-2 border-[#e0a73a]/70 bg-[#fdebd0]/60 motion-safe:animate-pulse" />
          </button>
        )
      })}
    </div>
  )
}
