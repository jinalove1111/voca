// src/components/town/v2/sceneZ.js — Paul Town V2 씬 로컬 UI z-index 상수
// (순수, 2026-09-18, 작업 지시서 STEP 7).
//
// TownScene.jsx 자신이 그리는 상호작용 UI(팝오버 바깥 탭 백드롭/배치
// 오버레이/이동·보관 미니 팝오버)는 세계 오브젝트(worldZIndex 기반,
// depthOrder.js LAYER_BASE 최대 ui=9000)와 같은 z 공간을 공유해야 한다 —
// 옛 townScene.js Z_LAYERS(0~100)는 depthOrder.js 값보다 훨씬 작아 Step
// 4~6 동안 세계 오브젝트에 항상 가려졌다(과도기 붕괴, 이번 Step 7의
// TownObjectLayer/TownFogLayer/TownPlacementOverlay 전환으로 해소된다).
// townScene.js 자체는 수정하지 않는다(이 상수들의 소유자가 아니고, 다른
// 아직 옛 체계를 쓰는 코드가 있을 수도 있다) — 대신 이 작은 씬 전용
// 파일이 depthOrder.js의 LAYER_BASE에서 "세계 전체보다 항상 위"인 UI
// 전용 상수 3개만 파생한다.
import { LAYER_BASE } from '../../../utils/town/depthOrder'

// 팝오버 바깥 탭 백드롭 — 모든 오브젝트(architecture/scenery/objects/
// foregroundVegetation, 최저값 LAYER_BASE.architecture=6000)보다 낮아야
// 아이템 버튼 자체는 여전히 클릭된다(그 버튼만 pointer-events-auto라
// 백드롭 자신의 z가 그 외 pointer-events-none 배경/장식 레이어들과
// 어떤 관계든 클릭 판정에는 영향이 없다 — 오직 "버튼보다 낮은가"만
// 중요하다).
export const BACKDROP_Z = LAYER_BASE.architecture - 1

// 배치 가능 칸 오버레이(TownPlacementOverlay) — 모든 세계 오브젝트(paul
// 포함, 최고값 LAYER_BASE.paul=8000대)보다 위, UI 티어(9000) 안에서도
// 팝오버보다는 아래.
export const OVERLAY_Z = LAYER_BASE.ui + 100

// 이동/보관 미니 팝오버 — 이 씬에서 항상 최상단.
export const POPOVER_Z = LAYER_BASE.ui + 200
