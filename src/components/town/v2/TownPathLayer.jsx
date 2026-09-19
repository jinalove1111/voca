// src/components/town/v2/TownPathLayer.jsx — Paul Town V2 자갈길(path) 타일
// 레이어(2026-09-18 재작성, 작업 지시서 STEP 5).
//
// 2026-09-16 district-stack 버전(구역별 SVG <path> 스트로크, viewBox
// "0 0 100 100" preserveAspectRatio="none")을 폐기하고, worldScenery.js
// ENV_PLACEMENTS의 group:'path' 항목(26개 — 직선/좁은직선/완만한 커브/
// 급커브/포크/길 끝/입구 타일)을 TownEnvPlacement로 그리는 렌더러로
// 교체한다(CLAUDE.md 규칙 3 — 승인된 하네스 배치를 재도출하지 않는다).
// 앵커/회전/미러(좌회전 커브 타일)/피더(50% 겹침 직선 타일 이음매) 변환은
// 전부 TownEnvPlacement가 소유한다 — 이 파일은 path 그룹만 골라 넘기는
// 얇은 레이어일 뿐이다. townScene.js의 PATHS/STUBS/DISTRICTS(옛 구역별
// 경로 좌표)는 더 이상 이 파일에서 import하지 않는다(옛 좌표계 완전
// 퇴역, my-house/LOTS 등 townScene.js의 다른 export는 여전히 다른
// 파일들이 쓴다).
//
// 옛 버전이 그리던 data-testid="town-path-${id}"는 grep 확인 결과
// scripts/나 tests/ 어디서도 참조하지 않아(정적 계약/E2E 둘 다 무의존)
// 새 항목 단위 구조에 맞는 새 계약을 발명하지 않고 그냥 생략했다.
//
// 레벨 무관(worldScenery.js ENV_PLACEMENTS 헤더의 "Batch 1 자산은 항상
// 표시" 전제와 동일 — river/grassPatch와 같은 이유) — level prop은 다른
// 레이어와 시그니처를 맞추기 위해서만 받는다.
//
// z-index는 항목마다 worldZIndex('path', entry.yPct, entry.id)로 매긴다
// (path는 depthOrder.js Y_RANKED_LAYERS에 없어 상수 하나로 수렴 — 그래도
// entry.depthLayer를 그대로 넘겨 데이터가 유일한 진실 원천이 되게 한다).
// 레이어 래퍼 자신은 z-index를 갖지 않는다(TownGroundLayer.jsx 헤더 설명과
// 동일 이유).
import { ENV_PLACEMENTS } from '../../../utils/town/worldScenery'
import TownEnvPlacement from './TownEnvPlacement'

const PATH_PLACEMENTS = ENV_PLACEMENTS.filter((p) => p.group === 'path')

export default function TownPathLayer({ level }) {
  void level // 길은 레벨 무관(항상 보임) — 시그니처만 다른 레이어와 통일.

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {PATH_PLACEMENTS.map((p) => (
        <TownEnvPlacement key={p.id} entry={p} />
      ))}
    </div>
  )
}
