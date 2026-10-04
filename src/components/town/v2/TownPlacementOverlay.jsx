// src/components/town/v2/TownPlacementOverlay.jsx — Paul Town V2 배치 가능
// 칸 오버레이(2026-09-13, 2026-09-18 재작성 — 작업 지시서 STEP 7).
//
// 부모(TownScene.jsx)가 mode.kind !== 'idle'일 때만 렌더한다 — 이 파일
// 자체는 모드를 판정하지 않고 넘겨받은 anchors(worldRender.freeWorldAnchors()
// 의 결과, 이미 부모가 47칸 배치 계약으로 걸러 넘겨줌)를 그대로 그린다.
// 각 앵커는 44px 이상 원형 버튼으로, 탭하면 onAnchorTap(x,y)를 호출(부모가
// 실제 배치/이동을 수행) — 상호작용 로직은 이번 재작성에서 전혀 바뀌지
// 않았다.
//
// 2026-09-18 — anchorFor(x,y,level)(옛 district-stack 좌표계) 대신
// worldRender.cellAnchor(x,y)(placementContract.js 47칸 계약이 원천, level
// 인자 불필요 — 그 칸이 유효한지는 이미 freeWorldAnchors가 걸렀다)로
// 좌표를 구한다. z는 sceneZ.js의 OVERLAY_Z(씬 로컬 UI 상수, 세계 전체
// 오브젝트보다 항상 위 — 옛 Z_LAYERS.overlay는 depthOrder.js 값보다 훨씬
// 작아 Step 4~6 동안 세계 오브젝트에 가려지는 과도기가 있었다, 이번
// 전환으로 해소).
//
// 2026-09-18 D5 정정(같은 날, 추가 패스) — 좁은 화면(360px)에서는 서로
// 가까운 두 앵커의 44x44 탭 버튼이 겹쳐 나중 버튼이 앞 버튼의 포인터
// 이벤트를 가로채는 문제가 있었다(worldRender.js 헤더의 layoutPlacementControls
// 주석 참고). 44x44 버튼 자체를 worldRender.layoutPlacementControls()가
// 정한(중심 배제) 위치로 옮긴다. 씬 박스 크기는 이 루트 엘리먼트 자신이
// absolute inset-0(부모 TownScene 씬과 동일 크기)이므로 ref+ResizeObserver
// 로 직접 측정한다(초기 렌더/리사이즈 모두 대응) — 측정 실패 시(첫 페인트
// 전 등) 하네스 기본 캔버스(390x741, worldRender.REF_WIDTH_PX 기준)로
// 안전 폴백, 스타일은 여전히 %로만 표현되므로(resolver 출력이 %) 실제
// 크기가 조금 달라도 다음 리사이즈 측정에서 스스로 보정된다.
//
// 2026-09-18 D5 2차 정정(오너 리뷰) — 1차 구현은 "마커(28px 펄스 원)는
// 항상 참 앵커에, 44x44 버튼은 옮긴 자리에" 구조라, 탭 가능한 영역이
// 눈에 보이는 펄스 원과 다른 자리에 있어(오프셋될 때) "탭 대상이 어디
// 보이는지" 시각적으로 모호했다 — 오너 지적. 이제 28px 펄스 링을
// 44x44 버튼 "안"(옮겨진 자리, D5 이전과 동일한 구조)으로 되돌리고,
// 옮겨졌을 때만(offset:true) 참 앵커에 작은 8px 점(같은 amber, 클릭
// 불가)을 남겨 "이 칸이 원래 여기였다"는 걸 보여준다 — 옮겨지지 않았으면
// (offset:false) 앵커에 아무것도 추가로 안 그린다(펄스 링이 이미 앵커
// 위에 있으므로 중복 마커가 불필요). 리더 라인(오프셋일 때만, 버튼
// 중심→앵커)은 그대로 유지.
// 2026-09-20 — data-anchor-left-pct/data-anchor-top-pct(테스트 전용 훅,
// data-anchor/data-cell와 같은 관례) — 참 앵커(world %) 좌표를 DOM에
// 노출해, E2E 테스트가 (오프셋될 수 있는) 44px 컨트롤 위치가 아니라 실제
// 스냅 판정 기준(TownScene.jsx computeNearestAnchor와 동일한 cellAnchor
// 좌표)으로 드래그 목표를 잡을 수 있게 한다 — src/utils/town/worldRender.js
// 를 테스트 파일에서 직접 import하면 그 내부의 확장자 없는 상대 import
// (`from './worldContract'`)가 Vite 번들러 밖(plain Node ESM)에서 깨지므로
// (scripts/testTownWorldRender.mjs가 esbuild로 우회하는 이유와 동일), DOM
// data attribute로 노출하는 편이 이 저장소의 기존 테스트 훅 관례에도 맞고
// 더 안전하다. 렌더링/상호작용에는 영향 없음(순수 읽기 전용 노출).
//
// 2026-09-20 — 자석 드래그 배치. highlightCell({x,y}|null, TownScene.jsx가
// 드래그 중 가장 가까운 "유효한"(스냅 거리 이내) 앵커만 전달 — 유효하지
// 않으면 항상 null이라 이 파일은 "초록 강조"만 신경 쓰면 된다)이 가리키는
// 컨트롤 하나만 색을 초록으로 바꾼다. 무효(스냅 범위 밖) 상태는 별도
// 표시를 만들지 않는다(브리프가 명시적으로 허용한 두 선택지 중 "아무것도
// 강조하지 않음" 쪽을 택함 — 이미 펄스 원이 47개 다 떠 있는 화면에
// 빨간 표시까지 추가하면 산만해져 "restrained" 요구에 어긋난다고 판단).
// 기존 탭-투-앵커 onAnchorTap/44x44 클릭 판정은 전혀 바뀌지 않았다.
import { useEffect, useRef, useState } from 'react'
import { layoutPlacementControls } from '../../../utils/town/worldRender'
import { OVERLAY_Z } from './sceneZ'

const FALLBACK_SCENE = { w: 390, h: 741 }

export default function TownPlacementOverlay({ anchors, onAnchorTap, highlightCell }) {
  const list = Array.isArray(anchors) ? anchors : []
  const rootRef = useRef(null)
  const [sceneSize, setSceneSize] = useState(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    function measure() {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setSceneSize({ w: rect.width, h: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = sceneSize || FALLBACK_SCENE
  const controls = layoutPlacementControls(list, w, h)

  return (
    <div ref={rootRef} className="absolute inset-0 pointer-events-none opacity-90" style={{ zIndex: OVERLAY_Z }}>
      {/* 참 앵커 점 — 버튼이 겹침 해소로 옮겨진(offset:true) 칸만, 작은
          8px 점으로 "원래 이 칸이었다"를 표시(클릭 불가/스크린리더 무시). */}
      {controls.filter((c) => c.offset).map((c) => (
        <span
          key={c.cellId}
          aria-hidden="true"
          className="absolute block w-2 h-2 rounded-full bg-[#e0a73a]/80 pointer-events-none"
          style={{ left: `${c.anchorLeftPct}%`, top: `${c.anchorTopPct}%`, transform: 'translate(-50%, -50%)' }}
        />
      ))}

      {/* 리더 라인 — 버튼 중심(옮겨진 자리) → 참 앵커, offset:true만. */}
      <svg aria-hidden="true" className="absolute inset-0 pointer-events-none" width="100%" height="100%" preserveAspectRatio="none">
        {controls.filter((c) => c.offset).map((c) => (
          <line
            key={c.cellId}
            x1={`${c.controlLeftPct}%`}
            y1={`${c.controlTopPct}%`}
            x2={`${c.anchorLeftPct}%`}
            y2={`${c.anchorTopPct}%`}
            stroke="#e0a73a"
            strokeOpacity="0.45"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {/* 44x44 탭 컨트롤 — layoutPlacementControls가 정한(중심 배제) 위치.
          28px 펄스 링을 버튼 "안"에 그려(D5 이전과 동일 구조) 탭 가능한
          자리와 보이는 자리가 항상 일치하게 한다. 드래그 중 가장 가까운
          유효 앵커(highlightCell)만 초록 halo로 바꾼다(2026-09-20). */}
      {controls.map((c) => {
        const isHighlighted = !!highlightCell && highlightCell.x === c.x && highlightCell.y === c.y
        return (
          <button
            key={c.cellId}
            type="button"
            onClick={() => onAnchorTap && onAnchorTap(c.x, c.y)}
            aria-label={`여기에 놓기 (${c.x + 1}, ${c.y + 1})`}
            data-anchor={`${c.x},${c.y}`}
            data-drag-highlight={isHighlighted ? 'true' : undefined}
            data-anchor-left-pct={c.anchorLeftPct}
            data-anchor-top-pct={c.anchorTopPct}
            className="absolute min-h-[44px] min-w-[44px] flex items-center justify-center bg-transparent pointer-events-auto"
            style={{ left: `${c.controlLeftPct}%`, top: `${c.controlTopPct}%`, transform: 'translate(-50%, -50%)' }}
          >
            <span
              aria-hidden="true"
              className={isHighlighted
                ? 'block w-9 h-9 rounded-full border-4 border-emerald-500 bg-emerald-200/70'
                : 'block w-7 h-7 rounded-full border-2 border-[#e0a73a]/70 bg-[#fdebd0]/60 motion-safe:animate-pulse'}
            />
          </button>
        )
      })}
    </div>
  )
}
