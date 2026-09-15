// src/components/town/v2/TownGroundLayer.jsx — Paul Town V2-B 월드 바닥
// 레이어(2026-09-16 재작성).
//
// 2026-09-13 버전(단일 8/13 박스 + 블러 블롭 6개)을 폐기하고, docs/design/
// town/WORLD_LAYOUT_REDESIGN_2026-09-16.md §2/§3 + wireframe/
// paul-town-world-wireframe.html의 "구역(district) 세로 스택" 구조를
// 그대로 포팅한다 — home(맨 아래) -> lane -> square -> river -> school ->
// tower(맨 위) 순으로, 각 구역마다 고정 폭 배경 그라데이션 + 좌우(홈은
// 좌우+하단) 스캘럽 헤지 테두리를 그린다. 안개(fog) 밴드는 이 파일이 아니라
// TownFogLayer.jsx가 그린다(둘 중 어느 파일이 소유해도 되는 항목 —
// 작업 지시서 6번, 이 세션은 TownFogLayer.jsx로 결정해 중복 없이 관리).
//
// 색상은 이 저장소 town v2 파일들이 이미 쓰던 팔레트에서만 가져온다(새
// hex 없음) — #fdebd0(크림)/#e8ecd2(옛 TownGroundLayer 중간톤)/
// #cfe3c0(모스)/#8fb37a(세이지)/#d9d2c5(스톤)/#1e2a5a(네이비).
//
// grid-cols/gridTemplateColumns/aspect-square 금지(격자 인상 금지,
// scripts/testTownV2Static.mjs 섹션 9) — flexbox 없이도 절대 위치(%)만으로
// 스택을 쌓는다(모든 레이어가 같은 townScene.js 파생 함수를 공유해 정렬이
// 어긋나지 않는다).
import {
  DISTRICTS, districtsVisible, districtOffsetUnits, sceneHeightUnits, Z_LAYERS,
} from '../../../utils/town/townScene'

const DISTRICT_BG = {
  tower: 'linear-gradient(to bottom, #d9d2c5, #1e2a5a)',
  school: 'linear-gradient(to bottom, #d9d2c5, #cfe3c0)',
  river: 'linear-gradient(to bottom, #cfe3c0, #d9d2c5)',
  square: 'linear-gradient(to bottom, #e8ecd2, #d9d2c5)',
  lane: 'linear-gradient(to bottom, #fdebd0, #cfe3c0)',
  home: 'linear-gradient(to bottom, #fdebd0, #e8ecd2, #cfe3c0)',
}

// 스캘럽(반원 물결) 헤지 텍스처 — repeating-radial-gradient만 사용(새 이미지
// 없음). 좌우 세로 띠와 하단 가로 띠에 동일 톤(세이지)을 쓰되 반복 방향만
// 바꾼다.
const HEDGE_VERTICAL_STYLE = {
  backgroundImage: 'repeating-radial-gradient(circle at 50% 50%, rgba(143,179,122,0.65) 0 42%, transparent 48% 100%)',
  backgroundSize: '10px 16px',
}
const HEDGE_HORIZONTAL_STYLE = {
  backgroundImage: 'repeating-radial-gradient(circle at 50% 50%, rgba(143,179,122,0.65) 0 42%, transparent 48% 100%)',
  backgroundSize: '16px 10px',
}

export default function TownGroundLayer({ level }) {
  const visible = districtsVisible(level)
  const total = sceneHeightUnits(level)

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: Z_LAYERS.ground }}
      aria-hidden="true"
    >
      {visible.map((id) => {
        const d = DISTRICTS[id]
        const topPct = total > 0 ? (districtOffsetUnits(id, level) / total) * 100 : 0
        const heightPct = total > 0 ? (d.heightUnits / total) * 100 : 0
        const isHome = id === 'home'

        return (
          <div
            key={id}
            data-testid={`town-district-${id}`}
            className="absolute inset-x-0"
            style={{ top: `${topPct}%`, height: `${heightPct}%`, background: DISTRICT_BG[id] || DISTRICT_BG.home }}
          >
            <span className="absolute left-0 top-0 bottom-0 w-[10px]" style={HEDGE_VERTICAL_STYLE} />
            <span className="absolute right-0 top-0 bottom-0 w-[10px]" style={HEDGE_VERTICAL_STYLE} />
            {isHome && (
              <span className="absolute left-0 right-0 bottom-0 h-[10px]" style={HEDGE_HORIZONTAL_STYLE} />
            )}
          </div>
        )
      })}
    </div>
  )
}
