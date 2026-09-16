// src/components/town/v2/TownPathLayer.jsx — Paul Town V2-B 월드 경로
// 레이어(2026-09-16 재작성).
//
// 2026-09-13 버전(LANE_ROW를 가로지르는 전체 폭 자갈길 밴드)을 폐기하고,
// docs/design/town/WORLD_LAYOUT_REDESIGN_2026-09-16.md의 "경로 연속성
// (snake)" + wireframe/paul-town-world-wireframe.html의 `PATHS`/`STUBS`
// 구역별 베지어 세그먼트를 그대로 포팅한다. 구역(district)마다 정문/로트를
// 피해 굽이치는 하나의 연속 SVG <path>(M + Q/L 연속, 세그먼트별로 쪼개
// 그리지 않음 — "소시지 이음매" 문제 회피, 와이어프레임의 pathToGlobal()/
// renderPathSvg() 기법 그대로)로 그린다. home에만 있는 디딤돌 스텁도 별도
// 짧은 <path>로 함께 그린다.
//
// 각 구역의 SVG는 viewBox="0 0 100 100" + preserveAspectRatio="none"을 쓴다
// (작업 지시서 명시 — 구역 밴드가 정사각형이 아니라 stroke가 가로/세로로
// 약간 다르게 늘어날 수 있지만, 지시서가 "이렇게 하면 된다"고 명시적으로
// 승인한 방식이라 그대로 따른다 — 실제 아트 이전 placeholder 단계라 시각적
// 미세 왜곡은 허용 범위).
import {
  DISTRICTS, districtsVisible, districtOffsetUnits, sceneHeightUnits,
  PATHS, STUBS, STUB_WIDTH_PCT, MAIN_PATH_WIDTH_PCT, Z_LAYERS,
} from '../../../utils/town/townScene'

// 세그먼트 배열(from/c?/to) -> 하나의 SVG path 'd' 문자열(M + 연속 Q/L).
function segmentsToPathD(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return ''
  let d = ''
  segments.forEach((seg, i) => {
    if (i === 0) d += `M ${seg.from.x} ${seg.from.y} `
    if (seg.c) d += `Q ${seg.c.x} ${seg.c.y} ${seg.to.x} ${seg.to.y} `
    else d += `L ${seg.to.x} ${seg.to.y} `
  })
  return d.trim()
}

export default function TownPathLayer({ level }) {
  const visible = districtsVisible(level)
  const total = sceneHeightUnits(level)

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: Z_LAYERS.path }} aria-hidden="true">
      {visible.map((id) => {
        const d = DISTRICTS[id]
        const topPct = total > 0 ? (districtOffsetUnits(id, level) / total) * 100 : 0
        const heightPct = total > 0 ? (d.heightUnits / total) * 100 : 0
        const mainD = segmentsToPathD(PATHS[id])
        const mainWidth = MAIN_PATH_WIDTH_PCT * d.scale
        const stubD = STUBS[id] ? segmentsToPathD(STUBS[id]) : ''

        return (
          <svg
            key={id}
            data-testid={`town-path-${id}`}
            className="absolute inset-x-0"
            style={{ top: `${topPct}%`, height: `${heightPct}%`, width: '100%' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {mainD && (
              <path
                d={mainD}
                fill="none"
                stroke="#b9ab95"
                strokeWidth={mainWidth + 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
            )}
            {mainD && (
              <path
                d={mainD}
                fill="none"
                stroke="#d9d2c5"
                strokeWidth={Math.max(1, mainWidth)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {stubD && (
              <path
                d={stubD}
                fill="none"
                stroke="#d9d2c5"
                strokeWidth={STUB_WIDTH_PCT}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        )
      })}
    </div>
  )
}
