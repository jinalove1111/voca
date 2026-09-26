// src/components/town/proto2_5d/Proto25DScreen.jsx — Paul Town 2.5D 캐릭터
// 프로토타입(Stage 1 2026-09-22 + Stage 2 2026-09-22 + Stage 3 2026-09-22 +
// Stage 4 2026-09-23) 씬 컨테이너.
//
// Stage 4(벤치 walk-to-sit, 그 이상 만들지 않는다 — Stage 5는 이 세션 범위
// 밖) — 상태 머신을 idle/walking 2개에서 idle/walking/sitting/leaving 4개로
// 확장한다. 기존 src/components/town/v2/TownScene.jsx의 벤치 앉기 상태 머신
// *패턴*(seq 가드 타이머 체인, "이미 실행 중이면 새 탭 무시" 정책)만
// 재사용하고 그 파일/TownCharacter.jsx/townInteractions.js는 여전히 전혀
// import/수정하지 않는다(격리 유지). 새 기하/타이밍 상수는
// src/utils/town/proto2_5d/benchInteraction.js(신규, 순수 함수)가 소유—
// 이 파일은 그 결과를 상태로 옮기고 타이머를 예약하는 오케스트레이션만
// 한다.
//
// seq 카운터(seqRef) — TownScene.jsx interactionSeqRef와 동일 정신: 사용자가
// 새 탭으로 명령을 낼 때마다 증가하는 단조 카운터. 모든 예약된 타이머
// 콜백은 실행 시점에 "내가 예약됐을 때의 seq === 지금의 seqRef.current"를
// 먼저 확인하고, 다르면 아무 것도 하지 않는다(스테일 타이머가 최신 상태를
// 덮어쓰는 사고 방지 — 이 세션이 재사용하는 유일한 새 관례, 나머지는 전부
// Stage 1~3에서 이미 쓰던 것 그대로).
//
// characterRef — setTimeout 콜백은 "예약된 시점의 컴포넌트 렌더"를 클로저로
// 붙잡으므로, 그 안에서 component-scope의 `character` state 변수를 직접
//읽으면 오래된(stale) 값을 볼 수 있다(예: enterLeaving이 "지금 캐릭터가
// 어디 앉아있는지"를 알아야 그 지점에서부터 걸어 나가는 경로를 계산할 수
// 있는데, 이 함수 자체는 enterSitting이 걸어둔 타이머가 나중에 호출하므로
// 그 사이 렌더가 여러 번 일어났을 수 있다). updateCharacter()가 setState와
// 동시에 이 ref도 항상 최신으로 유지해(TownScene.jsx interactionRef와 동일
// 정신) 타이머 콜백은 character가 아니라 characterRef.current를 읽는다.
//
// 정책(항목7/8, 팀장 지시 원문 그대로 구현) — 아래 handleGroundPointerUp
// 참고:
//  - sitting/leaving 동안은 어떤 탭(벤치든 바닥이든)도 무시(idle 복귀까지
//    입력 잠금).
//  - walking 동안 벤치를 향해 걷는 중(pendingSit)에 같은 벤치를 다시 탭하면
//    중복 시퀀스를 만들지 않고 무시(항목7).
//  - 그 외의 walking 중 새 탭(바닥이든, 다른/같은 벤치든 원래 목적지가
//    벤치가 아니었다면)은 항상 현재 시퀀스를 취소하고 새 목적지로
//    재지정한다(항목8 — Stage 2의 "최신 탭이 항상 우선" 원칙을 그대로
//    확장).
//
// Stage 3 — 데모 장애물(OBSTACLES)도 depthOrder.js의 Y-랭킹 콘텐츠 티어에
// 편입한다(고정 zIndex:100 제거). 그렇지 않으면 캐릭터(ProtoCharacter.jsx가
// 'character' 레이어로 Y-랭킹된 z-index를 계산)가 무엇과도 비교할 Y-랭킹된
// 대상이 없어 "Y에 따라 가려지고 가린다"는 이 단계의 요구 자체를 시각적으로
// 검증할 방법이 없다(고정 z-index 장애물은 캐릭터의 y와 무관하게 항상
// 위거나 항상 아래에만 있게 된다). 각 장애물의 바운딩 박스 하단(y1, 지면
// 접점)을 depth y로 쓴다 — worldRender.js의 landmarkBox/worldZIndex가
// 랜드마크의 bottom-center y를 depth 기준으로 쓰는 것과 동일한 "바닥 접점이
// Y-sort 기준" 관례(읽기 전용 참고, V2 코드는 import하지 않는다).
//
// 완전히 격리된 실험 — 기존 src/components/town/v2/* 파일을 하나도
// import/수정하지 않는다(docs/design/town/ASTRA_HANDOFF_2026-09-21.md §12
// 권장 구조). paulTownV1/paulTownV2/파일럿 허용목록과 무관하게 자체 플래그
// (paulTown2_5d)로만 게이팅된다. 구매/저장 API 호출 없음 — 전부 마운트
// 스코프 로컬 state(영속화 없음, 새로고침하면 초기 위치로 리셋).
//
// Stage 1 요구사항(그대로 유지):
//  1. 캐릭터 1명, 마운트 즉시 항상 보임(idle).
//  2. 유효한 바닥(ground) 탭 → 그 지점까지 점진적으로 걸어감(순간이동 없음).
//  3. UI(정보 배지 버튼 등) 클릭은 캐릭터를 움직이지 않음 — 이동 핸들러를
//     바닥 레이어 엘리먼트에만 직접 건다(문서 레벨/광역 delegation 금지).
//
// Stage 2 추가 요구사항(장애물 회피): 탭 지점이 world 경계 밖이면 clamp,
// 장애물 안이면 가장 가까운 걸을 수 있는 지점으로 보정, 시작 위치에서
// 보정된 목적지까지 장애물을 우회하는 경로(pathfinding.js)를 따라
// 웨이포인트별로 순차 이동한다. 경로가 없으면(완전히 도달 불가) 아무 것도
// 하지 않는다(제자리 유지, 크래시 없음).
//
// Phase 6B(2026-09-24, v2 스프라이트 방향/facing 어댑터) — 두 가지를
// 추가한다:
//  1. `character.direction`('front'|'back'|'side', 기본 'front') — 모든
//     걷기 구간(walkLeg, 그리고 walkPath의 reduced-motion 점프)에서 이동
//     벡터(dx,dy)로부터 characterSpriteContract.js `directionForMove`를
//     불러 매 구간마다 갱신한다. **모드와 무관하게(emoji든 v2든) 항상
//     계산**한다 — 방향 계산 자체는 순수 이동 로직 소관이라 항상 최신으로
//     유지해 두고, emoji 모드에서는 ProtoCharacter.jsx가 이 값을 전혀
//     읽지 않으므로(v2 렌더 분기 전용) 시각적으로 아무 효과가 없다.
//  2. `character.facing` 갱신을 일반 바닥 탭(startPlainWalk가 부르는
//     walkLeg/walkPath)에도 추가하되, **v2 스프라이트 매니페스트가 실제로
//     유효할 때만**(`spriteManifest` prop + validateSpriteManifest(...).ok)
//     `facingForMove`를 적용한다. 게이팅 이유 — 오늘 emoji 모드에서 일반
//     걷기 중 facing이 전혀 바뀌지 않는 게 기존 동작이고(벤치 접근
//     startWalkToBench만 facingToward로 facing을 세팅, 아래 그 함수 그대로
//     유지), 왼쪽으로 걷는 순간 이모지가 좌우 반전되면 오늘 시각적으로
//     눈에 띄는 변화가 생긴다 — spriteManifest가 없는 한(오늘 모든
//     프로덕션 호출부) 이 게이트가 항상 막아 emoji 모드의 기존 렌더가
//     100% 그대로 유지된다.
// facingToward(벤치 접근 전용, benchInteraction.js)는 이 작업이 손대지
// 않는다 — 그 함수가 세팅하는 pendingSit walking 구간의 facing과 이번에
// 새로 추가한 "일반 걷기 facing"은 서로 다른 코드 경로(startWalkToBench vs
// startPlainWalk)라 충돌하지 않는다.
//
// Phase 6A(2026-09-23, 씬 구성) — 장애물 3개짜리 회색 점선 상자 + 벤치 하나
// 뿐이던 "빈 마당"을 sceneFixture.js SCENE_FIXTURE(씬 구성 단일 진실
// 원천) 기반 범용 오브젝트 레이어로 확장한다. walkGrid.js OBSTACLES는 이제
// 이 SCENE_FIXTURE에서 파생되고(byte-identical, walkGrid.js 헤더 주석
// 참고), 이 파일은 그 각 항목을 실제 아트(townAsset)+그림자로 렌더한다 —
// 벤치는 기존 전용 블록(BENCH_ASSET_MIN_WIDTH_PX 등)을 그대로 두고 범용
// 루프에서는 건너뛴다(sceneFixture.js 'demo-bench' 항목 주석 참고, 기존
// 계약 무변경). 상태 머신/워크그리드/경로탐색/좌석 상호작용 로직은 전혀
// 손대지 않았다(위 Stage 1~4/Stage5 감사 절 전부 그대로 유효).
//
// Phase 6C(2026-09-24, 기본 매니페스트 배선) — 운영자 승인 Paul 캐릭터
// 스프라이트 8장(+@2x)이 도착해 `scripts/spriteIngestPaul.mjs --check`
// 68개 항목 전부 PASS했다. `spriteManifest` prop이 이제
// `characterSpriteManifest.default.js`의 `PAUL_SPRITE_MANIFEST`를
// 기본값으로 갖는다 — 즉 이 파일 위 Phase 6B 주석의 "오늘 모든 프로덕션
// 호출부에서 spriteManifest는 undefined"라는 전제가 더 이상 참이 아니며,
// `isSpriteV2ManifestActive`가 기본적으로 true가 된다(App.jsx가 여전히
// prop을 넘기지 않아도 이 기본값이 적용된다 — App.jsx는 수정하지 않음).
// 새 플래그는 추가하지 않았다 — 기존 `paulTown2_5d` 플래그 게이팅 하나로만
// 계속 제어된다. `spriteManifest`를 명시적으로 넘기면(예: 테스트) 여전히
// 그 값이 기본값을 덮어쓴다.
// - Phase 6C-1(2026-09-25): facing 갱신 조건 — side 구간 & |dx|≥1.0%만.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import ProtoCharacter, { WALK_TRANSITION_MS, REDUCED_MOTION_TRANSITION_MS } from './ProtoCharacter'
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion'
import { WORLD } from '../../../utils/town/worldContract'
import { OBSTACLES, nearestWalkablePoint } from '../../../utils/town/proto2_5d/walkGrid'
import { findPath } from '../../../utils/town/proto2_5d/pathfinding'
import { obstacleZIndex } from '../../../utils/town/proto2_5d/depthVisual'
import { SCENE_FIXTURE, objectRenderedWidthPx } from '../../../utils/town/proto2_5d/sceneFixture'
import { townAsset } from '../../../assets/town'
import { validateSpriteManifest, directionForMove, facingForMove } from '../../../utils/town/proto2_5d/characterSpriteContract'
import {
  SIT_HOLD_MS,
  REDUCED_MOTION_SIT_HOLD_MS,
  BENCH_ASSET_MIN_WIDTH_PX,
  benchArrivalPoint,
  benchSeatPoint,
  benchRenderedSizePx,
  isBenchTap,
  benchTapPad,
  facingToward,
} from '../../../utils/town/proto2_5d/benchInteraction'
import { PAUL_SPRITE_MANIFEST } from '../../../utils/town/proto2_5d/characterSpriteManifest.default'
import {
  computeWorldSizePx,
  computeCameraTarget,
  stepCamera,
  readWalkModePreference,
  writeWalkModePreference,
} from '../../../utils/town/proto2_5d/camera'
import { isNearShopEntrance, SHOP_PRODUCTS } from '../../../utils/town/proto2_5d/shopInteraction'
import ProtoShopScreen from './ProtoShopScreen'

// 2026-09-26(Phase 2, 가게 경험 v1) — 마을 산책 -> 가게 발견 -> 가게 내부
// -> 마을로 복귀 흐름. shopInteraction.js가 입장 지점/반경/상품 데이터를
// 소유하고(재구현 없음), 이 파일은 그 위에 "언제 입장 버튼을 보여줄지"와
// "오버레이 열기/닫기를 브라우저 뒤로가기와 어떻게 맞물릴지"만 오케스트
// 레이션한다. 새 씬 오브젝트/걷기/충돌 로직 없음 — 기존 데모 건물(가게로
// 재해석)에 입장 반경만 얹는다.

// 2026-09-26 — "산책 모드" v1(신규, 팀장 지시). 지금까지 바닥(ground)은 항상
// 뷰포트 전체와 정확히 같은 크기였다(WORLD 종횡비를 그대로 aspectRatio로
// 강제) — 세계=화면이라 카메라 개념 자체가 없었다. 산책 모드는 세계를
// 뷰포트보다 크게 그리고(camera.js computeWorldSizePx, WALK_OVERSCAN=1.6)
// 캐릭터를 부드럽게 뒤따라가는 카메라(camera.js stepCamera)를 도입한다.
// 걷기/충돌/좌석/깊이/스프라이트 등 기존 로직은 전부 world-% 좌표 기준이라
// (walkGrid.js/pathfinding.js/benchInteraction.js/depthVisual.js 순수 함수)
// 이 기능은 그 위에 "바닥을 얼마나 크게 그리고 어디로 이동시킬지"만
// 얹는다 — 재구현 없음(CLAUDE.md 규칙 3). 기본 ON(camera.js
// readWalkModePreference 기본값), HUD 토글로 언제든 끌 수 있고(끄면 이전
// 동작과 완전히 동일 — 아래 walkMode 분기 참고) localStorage에 남는다.

// 모바일 시각 보정(2026-09-23) — 장애물 디버그 플레이스홀더(점선 상자 +
// "demo-…" 라벨)는 기본적으로 렌더하지 않는다(실기기 프리뷰에서 벤치 실제
// 아트와 겹쳐 보여 상호작용을 읽기 어렵다는 회귀 보고). URL 쿼리 파라미터
// (`?proto25dDebug=1`)로만 켠다 — localStorage 대신 쿼리를 택한 이유: 이
// 화면 자체가 플래그(paulTown2_5d) 하나로 게이팅되는 격리 프로토타입이라,
// "이 세션에서만 잠깐 켜고 끄기 쉬운" 쿼리 파라미터가 더 어울린다(값이
// 세션을 넘어 남아 다음 로그인에도 실수로 디버그 오버레이가 계속 보이는
// 사고를 피함). 장애물 히트박스(walkGrid.js OBSTACLES) 자체는 변경하지
// 않는다 — 이 스위치는 오직 시각적 표시 여부만 제어한다.
function readDebugOverlaysEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('proto25dDebug') === '1'
  } catch {
    return false
  }
}

// 탭 vs 스와이프/스크롤 제스처 구분 임계값(px) — TownScene.jsx의
// DRAG_THRESHOLD_PX(8, 브리프 권장 범위 6~8px 상단값)와 동일 값. Stage 1은
// 경쟁하는 드래그 제스처가 없어(아이템 드래그 배치 없음) 그 파일의 전체
// pending/dragging 상태 머신까지는 필요 없다 — down/up 두 지점 거리 비교로
// 충분하다(팀장 지시 — "단순 click/pointerup 임계값 체크로 충분").
const DRAG_THRESHOLD_PX = 8

const INITIAL_LEFT_PCT = 50
const INITIAL_TOP_PCT = 62

// walkGrid.js OBSTACLES(불변 픽스처)에서 벤치 하나만 꺼내 모듈 스코프에
// 고정한다 — 이 프로토타입엔 상호작용 가능한 오브젝트가 벤치 하나뿐이다.
const BENCH = OBSTACLES.find((ob) => ob.id === 'demo-bench')

// Phase 6A — 범용 오브젝트 레이어가 그릴 SCENE_FIXTURE 항목(벤치 제외,
// sceneFixture.js 'demo-bench' 항목 주석 참고 — 벤치는 위 BENCH 전용
// 블록이 계속 그린다). assetKey가 없는 항목은 없지만(현재 픽스처 전부
// 실제 아트를 가짐) 방어적으로 필터링한다(등록되지 않은 assetKey는
// townAsset()이 null을 반환 — 그 경우도 렌더 루프에서 조용히 건너뛴다).
const RENDER_OBJECTS = SCENE_FIXTURE.filter((obj) => obj.id !== 'demo-bench')

// V2 TownObjectLayer.jsx/TownSceneryLayer.jsx의 그림자 상수를 그대로
// 복제한다(재도출 없음 — 파일당 소유권 원칙상 이 파일이 독립적으로
// 갖는다, 그 두 파일도 서로 각자 복제해 갖고 있는 것과 동일 관례).
const SHADOW_BACKGROUND = 'radial-gradient(ellipse at center, rgba(30,25,15,0.35) 0%, rgba(30,25,15,0.16) 55%, rgba(30,25,15,0) 75%)'

// 씬 오브젝트 그림자의 세로 비율 — 그림자 높이(widthPx 대비)와 세로 중심
// 보정(translate의 y%) 양쪽에 같은 0.35를 쓴다(납작한 타원 그림자를 만드는
// 의도적 비율, ProtoCharacter.jsx의 SHADOW_* 상수와 동일한 관례로 이름을
// 붙여둔다).
const SCENE_OBJECT_SHADOW_HEIGHT_RATIO = 0.35

// 초목 흔들림(ambient sway) — 새 keyframe을 만들지 않고 TownSceneryLayer.jsx
// 가 이미 쓰는 town-sway(tailwind.config.js, rotate ±1.5deg 5s)를 그대로
// 재사용한다(팀장 지시 — "기존 sway keyframe이 있으면 그걸 쓴다"). 나무/
// 관목 assetKey에만 적용(건물/벤치는 흔들리지 않음).
const SWAY_ASSET_KEYS = new Set(['nature/tree', 'nature/flower-garden'])
const SWAY_CLASS = ' origin-bottom motion-safe:animate-town-sway'

// 탭 리플 — CSS 애니메이션(450ms, tailwind.config.js townProtoRipple)이
// 끝난 뒤 DOM에서 제거할 때까지의 여유(애니메이션 종료 시점과 JS 타이머
// 발화 시점의 시계 차를 흡수 — Astra 핸드오프 §0.16 S9/S3 교훈과 동일
// 이유로, 애니메이션이 실제로 끝나기 전에 지워 깜빡이지 않게 살짝 더 김).
const TAP_RIPPLE_ANIM_MS = 450
const TAP_RIPPLE_REMOVE_MS = TAP_RIPPLE_ANIM_MS + 80
// 2026-09-26(가게 경험 v1, 오버레이 재등장 더블클릭 수정) — 가게가 닫힌
// 직후 "가게 들어가기" 버튼이 같은 화면 위치(하단-중앙)에 다시 나타나는데,
// 뒤로가기 버튼과 겹쳐 있어 빠른 더블클릭의 두 번째 클릭이 이 버튼에
// 떨어져 가게가 곧바로 재오픈되는 문제(verify:e2e S18 항목f)가 있었다.
// 닫힘 직후 이 시간(ms) 동안은 클릭/탭/키보드 활성화를 전부 무시한다.
const SHOP_REENTRY_GUARD_MS = 400
// depthOrder.js LAYER_BASE.objects(6002)~character(6004)의 y-랭킹 최댓값
// (6904)보다는 크고 paul(8000)보다는 작은 고정값 — 리플은 Y-랭킹 대상이
// 아니라(바닥 오브젝트/캐릭터와 가리고 가려질 필요가 없는 순간적 UI 장식)
// depthOrder 시스템에 참여시키지 않고 이 파일 로컬 상수로만 고정한다.
const TAP_RIPPLE_Z = 7000

// Phase 6C-1(2026-09-25, 경로 종료 지점 facing 깜빡임 수정) — 긴 LEFT 이동
// 경로(예: (90,20)→(20,20))의 마지막 구간이 pathfinding/walkGrid 스냅으로
// 아주 작은(때로는 반대 부호) dx를 가질 수 있다. 그 결과 idle 전환 직전
// ~한 프레임 동안 facing이 반대로 튀었다가 되돌아오는 깜빡임이 E2E로
// 재현됐다. 수/세로 이동(direction!=='side')이거나 dx가 이 임계값보다
// 작은 미세 스냅 구간은 facing을 갱신하지 않는다(직전 값 유지).
const FACING_MIN_DX_PCT = 1.0

// Phase 6B — spriteManifest는 선택적 prop이다.
// Phase 6C(2026-09-24) — 기본값이 이제 `PAUL_SPRITE_MANIFEST`(승인된 Paul
// 스프라이트 8장 기반)다. App.jsx는 여전히 어떤 prop도 넘기지 않으므로
// (현재 유일한 프로덕션 호출부) 이 기본값이 그대로 적용되어
// `isSpriteV2ManifestActive`가 true가 된다 — 아래 모든 v2 관련 분기가 이제
// 실제로 실행된다(위 파일 헤더 "Phase 6C" 주석 참고). 호출부가 명시적으로
// `spriteManifest={undefined}` 등 다른 값을 넘기면 그 값이 우선한다.
export default function Proto25DScreen({ spriteManifest = PAUL_SPRITE_MANIFEST } = {}) {
  const reducedMotion = usePrefersReducedMotion()
  // 마운트 시점 URL 쿼리 1회만 읽는다(세션 중 쿼리가 바뀔 일이 없어
  // useState lazy init으로 충분 — 매 렌더 재파싱 불필요).
  const [debugOverlaysEnabled] = useState(readDebugOverlaysEnabled)
  // Phase 6B — v2 스프라이트 매니페스트가 실제로 유효한지(spriteManifest가
  // 있고 validateSpriteManifest(...).ok===true) 한 번만 계산해 아래 facing
  // 게이팅에 재사용한다(위 파일 헤더 "Phase 6B" 주석 참고).
  const isSpriteV2ManifestActive = useMemo(
    () => Boolean(spriteManifest) && validateSpriteManifest(spriteManifest).ok === true,
    [spriteManifest],
  )
  const [character, setCharacter] = useState({
    phase: 'idle',
    leftPct: INITIAL_LEFT_PCT,
    topPct: INITIAL_TOP_PCT,
    facing: 1, // 1=기본 방향, -1=좌우 미러링(ProtoCharacter.jsx facing prop)
    direction: 'front', // Phase 6B — 논리 방향('front'|'back'|'side'), v2 스프라이트 전용(위 파일 헤더 참고)
    pendingSit: false, // 벤치를 향해 걷는 중(walking)인지 — 항목7 반복 탭 무시 판정용
    sitBenchHeightPx: undefined, // 2026-09-23 좌석 접촉점 sink 보정 — enterSitting에서만 채워짐(아래 참고)
  })
  const characterRef = useRef(character) // 헤더 주석 "characterRef" 참고 — setTimeout 콜백 전용 최신값 미러
  const [infoOpen, setInfoOpen] = useState(false)

  // 2026-09-26(Phase 2, 가게 경험 v1) — 가게 오버레이 열림 여부. shopBusyRef
  // 는 open/close 두 액션 모두가 공유하는 재진입 가드(seqRef와 같은 정신 —
  // "진행 중인 전이가 있으면 새 명령을 무시"). 열기(handleEnterShop)는
  // 다음 tick에 곧바로 풀린다(같은 tick 안의 중복 클릭만 막음). 닫기
  // (requestCloseShop)는 history.back()이 비동기(popstate)로 도착할 때까지
  // 계속 걸어둔다 — 아래 requestCloseShop/closeShopNow 주석 참고(리뷰 수정
  // 1차 — 이전엔 여기도 setTimeout(0)로 즉시 풀어 popstate 도착 전 빠른
  // 재탭/Escape가 history.back()을 한 번 더 호출해 히스토리 엔트리를
  // 이중으로 소비하는 경쟁이 있었다).
  const [shopOpen, setShopOpen] = useState(false)
  const shopBusyRef = useRef(false)
  // 뒤로가기가 실제로 닫힐 때까지의 비동기 창(리뷰 수정 1차) — React state로
  // 노출해 ProtoShopScreen의 뒤로가기 버튼을 그 사이 disabled+aria-busy로
  // 보여준다(shopBusyRef는 ref라 렌더에 반영되지 않으므로 별도 state 필요).
  const [shopClosing, setShopClosing] = useState(false)
  // requestCloseShop이 history.back()을 호출한 뒤 popstate가 끝내 도착하지
  // 않는 드문 환경(히스토리 API가 부분적으로만 동작하는 브라우저/기기 등)을
  // 대비한 세이프티 타이머 — closeShopNow가 이미 닫았으면(popstate가
  // 정상 도착) 이 타이머는 이 ref를 통해 취소된다.
  const shopCloseFallbackTimerRef = useRef(null)
  function clearShopCloseFallbackTimer() {
    if (shopCloseFallbackTimerRef.current != null) {
      clearTimeout(shopCloseFallbackTimerRef.current)
      shopCloseFallbackTimerRef.current = null
    }
  }
  // 2026-09-26(가게 경험 v1, 재진입 가드) — closeShopNow가 실제로 닫히는
  // 순간에 세팅되는 타임스탬프(performance.now() 기준, SHOP_REENTRY_GUARD_MS
  // 동안 유효). handleEnterShop이 ref로 즉시 비교해 클릭/키보드 어느 경로로
  // 오든 막고, shopReentryBlocked(state)는 버튼을 disabled+inert로 보이게
  // 렌더링하는 용도(ref만으로는 재렌더가 안 돼 시각적으로 눌리는 것처럼
  // 보일 수 있음 — shopClosing과 같은 이유).
  const shopReentryBlockedUntilRef = useRef(0)
  const [shopReentryBlocked, setShopReentryBlocked] = useState(false)
  const shopReentryTimerRef = useRef(null)
  function clearShopReentryTimer() {
    if (shopReentryTimerRef.current != null) {
      clearTimeout(shopReentryTimerRef.current)
      shopReentryTimerRef.current = null
    }
  }
  useEffect(() => clearShopReentryTimer, [])

  // 2026-09-26 — 산책 모드 on/off. 마운트 시점 저장된 선호를 1회만 읽는다
  // (localStorage 부재/예외 환경에서도 camera.js readWalkModePreference가
  // 항상 안전한 기본값(true)을 반환 — 위 파일 헤더 "산책 모드" 주석 참고).
  const [walkMode, setWalkMode] = useState(() => (
    readWalkModePreference(typeof window !== 'undefined' ? window.localStorage : undefined)
  ))
  function toggleWalkMode() {
    setWalkMode((prev) => {
      const next = !prev
      writeWalkModePreference(typeof window !== 'undefined' ? window.localStorage : undefined, next)
      return next
    })
  }

  const groundRef = useRef(null)
  const pointerDownRef = useRef(null) // { pointerId, downX, downY } | null
  const walkTimerRef = useRef(null) // 걷기 구간(leg) 전이 타이머(Stage 1부터 — 항상 최대 1개)
  const holdTimerRef = useRef(null) // Stage 4 — 착석 유지(SIT_HOLD_MS) 전용 타이머(walkTimerRef와 별개 ref)
  const seqRef = useRef(0) // 헤더 주석 "seq 카운터" 참고

  // Phase 6A — 바닥의 실측 렌더 크기(px). objectRenderedWidthPx(sceneFixture.js)
  // 가 depth-scale까지 반영한 실제 화면 px 폭을 계산하려면 매 렌더 이
  // 값이 필요하다(고정 world 종횡비를 가정하지 않는다 — benchInteraction.js
  // 헤더 주석과 동일 이유). TownPlacementOverlay.jsx의 ref+ResizeObserver
  // 관례를 그대로 재사용(초기 렌더/리사이즈 모두 대응, 측정 실패 시엔
  // {width:0,height:0} 그대로 둬 objectRenderedWidthPx가 minWidthPx(있으면)
  // 로 안전 폴백하게 한다 — 크래시 없음).
  const [groundSize, setGroundSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = groundRef.current
    if (!el) return undefined
    function measure() {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setGroundSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 2026-09-26 — 산책 모드 뷰포트 측정. groundSize와 별개 ref/state다(위
  // groundSize 주석 참고 — groundSize는 "바닥 자신의 렌더 크기"를 재는
  // 반면, 이 값은 "그 바닥을 담는 창(뷰포트)의 크기"를 잰다 — 산책 모드
  // ON이면 두 값이 서로 다르다: 바닥은 세계 전체 크기(worldSize)로 커지고
  // 뷰포트는 여전히 화면 크기다). 동일한 ref+ResizeObserver 관례 재사용
  // (재구현 없음).
  const viewportRef = useRef(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return undefined
    function measure() {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setViewportSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 세계(바닥) px 크기 — 뷰포트 크기가 바뀔 때만 다시 계산한다(camera.js
  // computeWorldSizePx, 순수 함수 — 매 렌더 재계산해도 비용이 없지만
  // useMemo로 참조 안정성까지 얻어 아래 rAF effect의 의존성 배열이 불필요한
  // 재시작을 하지 않게 한다).
  const worldSize = useMemo(
    () => computeWorldSizePx({ viewportW: viewportSize.width, viewportH: viewportSize.height }),
    [viewportSize.width, viewportSize.height],
  )

  // 2026-09-26 — 산책 모드 카메라 rAF 루프. React state가 아니라 ref(카메라
  // 현재 위치)+DOM 직접 쓰기(transform)로 구현한다 — 매 프레임 React
  // setState/재렌더를 거치면(60fps 기준 프레임당 수백 개 엘리먼트 재조정)
  // 불필요한 비용이 크다는 점은 이 저장소의 다른 "매 프레임 값" 관례
  // (ProtoCharacter.jsx bob/숨쉬기 CSS keyframe, 이 파일 자체의 walkLeg
  // CSS transition)와 동일한 이유 — camera.js가 순수 계산만 맡고 이
  // effect가 그 결과를 어디에 쓸지(imperative DOM)만 오케스트레이션한다.
  const cameraPosRef = useRef(null) // null=아직 초기화 전(다음 프레임에 target으로 즉시 스냅, 부드러운 팬 없이 모드 진입).
  useEffect(() => {
    // OFF로 전환(또는 애초에 OFF) — 다음에 다시 켜질 때 항상 새로 스냅하도록
    // 리셋하고, 바닥의 transform을 명시적으로 되돌려 전환 잔상이 남지 않게
    // 한다(이 효과가 없으면 ON→OFF 전환 시 마지막 translate3d가 인라인
    // style에 그대로 남아, OFF 전용 렌더 분기(transform 미지정)와 실제
    // DOM이 어긋난다).
    if (!walkMode) {
      cameraPosRef.current = null
      if (groundRef.current) groundRef.current.style.transform = 'none'
      return undefined
    }
    // 뷰포트/세계 크기를 아직 측정하지 못했으면(마운트 직후 ResizeObserver
    // 발화 전) 루프를 시작하지 않는다 — 위 groundSize 패턴과 동일하게
    // 크기가 갱신되면 이 effect가 재실행(의존성 배열)돼 그때 시작한다.
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return undefined
    if (worldSize.worldW <= 0 || worldSize.worldH <= 0) return undefined

    let rafId = null
    cameraPosRef.current = null // 모드 진입/뷰포트 변경마다 첫 프레임은 항상 즉시 스냅.

    function frame() {
      const groundEl = groundRef.current
      const charEl = groundEl ? groundEl.querySelector('[data-proto-character]') : null
      if (groundEl && charEl) {
        // charWorldPx — ProtoCharacter.jsx의 앵커 관례(translate(-50%,-100%),
        // 이 파일 헤더 "characterRef" 주석 근처 참고)상 실제 렌더 박스의
        // 가로 중심 = world-x 앵커, 세로 하단 = world-y(발) 앵커. 바닥 자신은
        // transform(translate만, scale 없음)만 받으므로 groundRect도 이미
        // 카메라가 적용된 화면 좌표다 — 두 rect를 빼면 카메라 오프셋이
        // 상쇄되어 "카메라와 무관한 세계 고정 px 좌표"가 남는다(설계 그대로).
        const groundRect = groundEl.getBoundingClientRect()
        const charRect = charEl.getBoundingClientRect()
        const charWorldX = charRect.left + charRect.width / 2 - groundRect.left
        const charWorldY = charRect.bottom - groundRect.top
        const target = computeCameraTarget({
          charX: charWorldX,
          charY: charWorldY,
          viewportW: viewportSize.width,
          viewportH: viewportSize.height,
          worldW: worldSize.worldW,
          worldH: worldSize.worldH,
        })
        const next = cameraPosRef.current == null
          ? target // 첫 프레임 — 부드러운 팬 없이 즉시 목표 위치로(모드 진입/리사이즈 직후 어색한 장거리 팬 방지).
          : stepCamera(cameraPosRef.current, target, reducedMotion ? 1 : undefined) // reduced-motion이면 t=1(매 프레임 즉시 스냅).
        cameraPosRef.current = next
        groundEl.style.transform = `translate3d(${-next.x}px, ${-next.y}px, 0)`
        // 테스트 계측용(townProto25d.spec.mjs S17) — 카메라 현재 위치를
        // DOM 속성으로도 노출한다(반올림 — px 서브픽셀 차이로 단언이
        // 흔들리지 않게).
        groundEl.dataset.cameraX = String(Math.round(next.x))
        groundEl.dataset.cameraY = String(Math.round(next.y))
      }
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [walkMode, viewportSize.width, viewportSize.height, worldSize.worldW, worldSize.worldH, reducedMotion])

  // Phase 6A — 탭 리플(순수 장식, 상태 머신 seq/타이머 체계와 완전히
  // 독립 — 위 헤더 주석 "seq 카운터"의 대상이 아니다, 걷기/착석 로직을
  // 전혀 건드리지 않는다). 각 리플은 자기 자신의 타이머로 스스로를
  // 제거한다(여러 개가 겹쳐도 서로 간섭하지 않음 — walkTimerRef처럼
  // "항상 최대 1개" 제약이 이 장식에는 적용되지 않는다, 의도적으로 다른
  // 규율). 언마운트 시 전부 정리(rippleTimersRef)만 지켜 setState-after-
  // unmount를 피한다.
  const [ripples, setRipples] = useState([])
  const rippleIdRef = useRef(0)
  const rippleTimersRef = useRef(new Set())
  function showTapRipple(point) {
    if (reducedMotion) return // 항목C1 — reduced-motion에서는 아예 렌더하지 않음(motion-safe: 이중 방어와 별개로 DOM 자체를 안 만듦).
    const id = ++rippleIdRef.current
    setRipples((cur) => [...cur, { id, x: point.x, y: point.y }])
    const timerId = setTimeout(() => {
      rippleTimersRef.current.delete(timerId)
      setRipples((cur) => cur.filter((rp) => rp.id !== id))
    }, TAP_RIPPLE_REMOVE_MS)
    rippleTimersRef.current.add(timerId)
  }
  useEffect(() => () => {
    for (const t of rippleTimersRef.current) clearTimeout(t)
    rippleTimersRef.current.clear()
  }, [])

  function clearWalkTimer() {
    if (walkTimerRef.current != null) {
      clearTimeout(walkTimerRef.current)
      walkTimerRef.current = null
    }
  }
  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  // character state와 characterRef(타이머 콜백용 최신값 미러)를 항상 함께
  // 갱신하는 유일한 통로 — 이 함수를 거치지 않고 setCharacter를 직접
  // 호출하지 않는다(두 값이 갈라지는 사고 방지).
  function updateCharacter(patch) {
    setCharacter((cur) => {
      const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch }
      characterRef.current = next
      return next
    })
  }
  // seq 가드 — 타이머 콜백 전용(헤더 주석 참고). 예약 시점 이후 새 명령이
  // 들어와 seqRef가 앞서갔으면 조용히 무시한다.
  function applyIfActive(seq, patch) {
    if (seq !== seqRef.current) return
    updateCharacter(patch)
  }

  // 단일 구간(leg) 이동 — 목표 좌표로 전이 후 transition 지속시간이 지나면
  // onArrive(마지막 구간이면) 또는 다음 구간으로 넘어간다(Stage 1의 "예약된
  // 타이머 1개만 활성" 관례를 그대로 유지 — walkTimerRef는 항상 최대 1개의
  // 타이머만 가리킨다). onArrive는 "다 걸었을 때 무엇을 할지"를 호출부가
  // 결정한다(Stage 4부터 idle로 직행하는 경로와 sitting으로 들어가는 경로
  // 둘 다 이 함수 하나를 공유하기 위한 일반화 — 재구현 아님). phaseLabel —
  // 이 구간 동안 표시할 phase 문자열('walking' 또는 Stage 4의 'leaving').
  // 하드코딩하지 않는 이유(실측으로 발견한 버그, 아래 참고): enterLeaving이
  // 먼저 phase:'leaving'을 세팅한 뒤 같은 동기 호출 스택 안에서 곧바로
  // walkPath -> walkLeg를 부르면, walkLeg가 하드코딩된 'walking'으로 다시
  // setState하는 것까지 React가 한 배치로 묶어(자동 배칭) 커밋 — 그 결과
  // 'leaving'은 화면에 단 한 프레임도 그려지지 못하고 곧장 'walking'으로
  // 덮인다(townProto25d.spec.mjs S8/S8b가 이 문제를 실측 FAIL로 재현했다 —
  // 이 세션의 CLAUDE.md 규칙15 "회귀 의심 시 실제 FAIL 확인" 그대로).
  // walkLeg/walkPath에 phaseLabel을 받아 그대로 쓰게 하면(enterLeaving은
  // 'leaving'을 넘긴다) 배칭이 일어나도 최종 커밋값 자체가 'leaving'이라
  // 문제가 없다.
  function walkLeg(path, index, seq, phaseLabel, onArrive) {
    const target = path[index]
    const isLast = index === path.length - 1
    // Phase 6B — direction은 모든 모드에서 항상 갱신(위 파일 헤더 참고).
    // facing은 v2 스프라이트 매니페스트가 실제로 유효할 때만 갱신한다(게이트
    // — emoji 모드의 기존 "일반 걷기는 facing을 바꾸지 않는다" 동작 보존).
    applyIfActive(seq, (cur) => {
      const dx = target.x - cur.leftPct
      const dy = target.y - cur.topPct
      const direction = directionForMove(dx, dy, cur.direction, WORLD)
      const next = { ...cur, phase: phaseLabel, leftPct: target.x, topPct: target.y, direction }
      // Phase 6C-1 — 진짜 좌우 이동 구간에서만 facing 갱신(위 파일 상단
      // FACING_MIN_DX_PCT 주석 참고). 세로/미세 스냅 구간은 직전 facing 유지.
      if (isSpriteV2ManifestActive && direction === 'side' && Math.abs(dx) >= FACING_MIN_DX_PCT) {
        next.facing = facingForMove(dx, cur.facing)
      }
      return next
    })
    walkTimerRef.current = setTimeout(() => {
      walkTimerRef.current = null
      if (seq !== seqRef.current) return // 스테일 타이머 — 그 사이 새 명령이 들어옴(헤더 주석 seq 카운터).
      if (isLast) onArrive()
      else walkLeg(path, index + 1, seq, phaseLabel, onArrive)
    }, WALK_TRANSITION_MS)
  }

  // 경로(웨이포인트 배열) 하나를 따라 걷는다. reduced-motion이면 각
  // 웨이포인트를 순서대로 보여주는 대신, 경로가 유효(=pathfinding이 검증한
  // 걸을 수 있는 목적지)함을 그대로 신뢰해 마지막 웨이포인트로 즉시(짧은
  // transition 1회) 이동한다 — "경로의 최종 보행 가능 위치로 즉시 이동"
  // 요구사항(운영자 원문) 그대로. 순간이동(0ms)은 아니다 — Stage 1과 동일한
  // 이유로 목적지 변화를 지각할 수 있는 최소 지속시간(REDUCED_MOTION_
  // TRANSITION_MS)을 유지한다. phaseLabel — walkLeg 주석 참고.
  function walkPath(path, seq, phaseLabel, onArrive) {
    clearWalkTimer()
    if (!path || path.length === 0) { onArrive(); return }
    if (reducedMotion) {
      const dest = path[path.length - 1]
      // Phase 6B — walkLeg와 동일한 direction/facing 갱신(위 주석 참고).
      applyIfActive(seq, (cur) => {
        const dx = dest.x - cur.leftPct
        const dy = dest.y - cur.topPct
        const direction = directionForMove(dx, dy, cur.direction, WORLD)
        const next = { ...cur, phase: phaseLabel, leftPct: dest.x, topPct: dest.y, direction }
        // Phase 6C-1 — walkLeg와 동일 가드(위 파일 상단 FACING_MIN_DX_PCT 주석 참고).
        if (isSpriteV2ManifestActive && direction === 'side' && Math.abs(dx) >= FACING_MIN_DX_PCT) {
          next.facing = facingForMove(dx, cur.facing)
        }
        return next
      })
      walkTimerRef.current = setTimeout(() => {
        walkTimerRef.current = null
        if (seq !== seqRef.current) return
        onArrive()
      }, REDUCED_MOTION_TRANSITION_MS)
      return
    }
    walkLeg(path, 0, seq, phaseLabel, onArrive)
  }

  // 일반 바닥 탭 — Stage 1~3과 동일한 걷기(벤치 상호작용 아님). 도착하면
  // idle로 복귀한다.
  function startPlainWalk(rawPoint) {
    const cur = characterRef.current
    const path = findPath({ x: cur.leftPct, y: cur.topPct }, rawPoint)
    if (!path || path.length === 0) return // 경로 없음(완전히 도달 불가) — 제자리 유지, 크래시 없음.
    const seq = ++seqRef.current
    clearWalkTimer()
    clearHoldTimer()
    updateCharacter({ pendingSit: false })
    walkPath(path, seq, 'walking', () => applyIfActive(seq, (c) => ({ ...c, phase: 'idle' })))
  }

  // Stage 4 — 벤치 탭. 벤치 앞 도착 지점까지 걸어간 뒤 enterSitting으로
  // 넘어간다. 도착 지점이 도달 불가면(병적인 경우) 아무 것도 하지 않는다
  // (Stage 2와 동일한 "안전한 no-op" 원칙).
  function startWalkToBench() {
    const cur = characterRef.current
    const rawArrival = benchArrivalPoint(BENCH)
    const arrival = nearestWalkablePoint(rawArrival.x, rawArrival.y)
    const path = findPath({ x: cur.leftPct, y: cur.topPct }, arrival)
    if (!path || path.length === 0) return
    const seq = ++seqRef.current
    clearWalkTimer()
    clearHoldTimer()
    // facing은 "걷기 시작 시점의 이동 방향"으로 한 번만 정해 sitting까지
    // 그대로 들고 간다(팀장 문구 "도착 시 facing 설정"과 결과적으로 동일 —
    // 도착 지점의 x가 시작 x와 같은 방향이므로 어느 시점에 계산해도 부호가
    // 같다. dx===0이면 facingToward가 0을 반환해 기존 facing을 그대로 둔다
    // — "벤치가 정확히 위에 있으면 현재 방향 유지" 요구 그대로).
    const dir = facingToward({ x: cur.leftPct, y: cur.topPct }, arrival)
    updateCharacter((c) => ({ ...c, pendingSit: true, facing: dir !== 0 ? dir : c.facing }))
    walkPath(path, seq, 'walking', () => enterSitting(seq))
  }

  // Stage 4 — 착석. 논리 좌표를 좌석 지점(benchSeatPoint)으로 옮기고
  // SIT_HOLD_MS(또는 reduced-motion이면 REDUCED_MOTION_SIT_HOLD_MS) 뒤
  // enterLeaving을 예약한다. depthY는 ProtoCharacter.jsx에 별도로 넘긴다
  // (아래 렌더 부분 참고 — 왜 topPct 그대로 z-index에 쓰면 안 되는지는 그
  // 파일의 헤더 주석에 정리). 모바일 시각 보정(2026-09-23) —
  // benchSeatPoint가 이제 바닥 엘리먼트의 실제 렌더 크기(groundWidthPx/
  // groundHeightPx)를 받아야 한다(benchInteraction.js 헤더 주석 — 고정
  // world 종횡비를 가정하지 않음). handleGroundPointerUp과 동일하게
  // groundRef에서 직접 측정한다.
  //
  // 2026-09-23(좌석 접촉점 sink 보정, 두 번째 패스) — 같은 groundRect 측정
  // 김에 benchRenderedSizePx(BENCH, groundRect?.width).heightPx(벤치의 실제
  // 스크린 px 렌더 높이)도 같이 구해 character state에 실어 보낸다.
  // ProtoCharacter.jsx가 이 값을 자신의 depth-scale로 나눠 sink 상한(좌석선
  // ~ 벤치 바닥까지의 여유) 계산에 쓴다(그 파일 헤더 주석 "sitBenchHeightPx"
  // 항목 참고). 벤치 좌표/기하 자체는 전혀 바꾸지 않는다 — benchSeatPoint가
  // 이미 계산해 둔 seat.x/seat.y는 그대로.
  function enterSitting(seq) {
    if (seq !== seqRef.current) return
    const groundRect = groundRef.current ? groundRef.current.getBoundingClientRect() : null
    const seat = benchSeatPoint(BENCH, groundRect?.width, groundRect?.height)
    const benchHeightPx = benchRenderedSizePx(BENCH, groundRect?.width).heightPx
    applyIfActive(seq, (c) => ({
      ...c,
      phase: 'sitting',
      pendingSit: false,
      leftPct: seat.x,
      topPct: seat.y,
      sitBenchHeightPx: benchHeightPx,
    }))
    clearHoldTimer()
    const holdMs = reducedMotion ? REDUCED_MOTION_SIT_HOLD_MS : SIT_HOLD_MS
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null
      if (seq !== seqRef.current) return
      enterLeaving(seq)
    }, holdMs)
  }

  // Stage 4 — 기립 후 벤치 앞 도착 지점으로 되돌아 걸어 나간 뒤 idle.
  // characterRef.current(좌석 지점)에서 출발하는 경로를 findPath에 맡긴다
  // — findPath가 내부적으로 시작점도 nearestWalkablePoint로 보정하므로
  // (좌석은 벤치 박스 안이라 그 자체로는 걸을 수 없는 칸) 이 함수가 따로
  // 보정할 필요가 없다. 경로를 못 찾는 병적인 경우에도(사실상 발생하지
  // 않음 — arrival은 항상 걸을 수 있는 점) 도착 지점으로 좌표만 맞추고
  // idle로 안전하게 떨어진다(크래시/멈춘 상태 없음).
  function enterLeaving(seq) {
    if (seq !== seqRef.current) return
    const cur = characterRef.current
    const rawArrival = benchArrivalPoint(BENCH)
    const arrival = nearestWalkablePoint(rawArrival.x, rawArrival.y)
    const path = findPath({ x: cur.leftPct, y: cur.topPct }, arrival)
    if (!path || path.length === 0) {
      // 도달 불가 — Stage 5 감사(2026-09-23)로 확인: benchSeatPoint의 좌석
      // 좌표는 findPath 내부에서 항상 nearestWalkablePoint로 먼저 보정되고,
      // arrival도 이미 걸을 수 있는 칸(benchInteraction.js 계약)이라, 현재
      // OBSTACLES 픽스처(walkGrid.js)로는 이 분기가 실제로 실행되지 않는다
      // (증명 불가능한 이론상 방어 코드 — walkGrid.js OBSTACLES가 바뀌어
      // 좌석 주변을 완전히 봉쇄하는 경우에만 도달). 이전 버전은 이 분기에서
      // phase:'leaving'과 phase:'idle'을 두 번의 별도 setState로 나눠
      // 호출했는데, 같은 동기 스택 안의 연속 setState는 React 18 자동
      // 배칭으로 한 커밋에 묶여 'leaving'이 화면에 단 한 프레임도 그려지지
      // 못하고 idle로 즉시 덮인다(walkLeg 주석의 phaseLabel 버그와 동일
      // 클래스 — 그 버그는 실측 FAIL로 확인·수정했지만 이 분기는 현재
      // 도달 불가라 같은 방식으로 재현할 수 없다). 이 분기가 실제로
      // 실행되더라도 'leaving' 프레임이 안 보이는 것 자체가 사용자에게
      // 관측 가능한 오류는 아니다(최종 idle 위치는 정확) — 그래도 실행되지
      // 않는 setState 두 번을 남겨 미래에 혼동을 주지 않도록 단일 호출로
      // 정리한다(동작 변화 없음, 도달 시나리오가 없어 스스로 검증도 못하는
      // 코드를 놔두지 않는다).
      applyIfActive(seq, (c) => ({ ...c, phase: 'idle', leftPct: arrival.x, topPct: arrival.y }))
      return
    }
    // phase:'leaving'은 walkPath의 phaseLabel 인자로만 세팅한다(walkLeg 주석
    // 참고 — 별도로 미리 setState하면 곧바로 뒤따르는 walkPath의 setState와
    // 같은 배치로 묶여 화면에 한 번도 그려지지 못하고 덮이는 버그가 있었다,
    // 실측 FAIL로 발견).
    walkPath(path, seq, 'leaving', () => applyIfActive(seq, (c) => ({ ...c, phase: 'idle' })))
  }

  // 언마운트 시 예약된 타이머 정리(setState-after-unmount 방지, TownScene.jsx
  // interactionTimerRef cleanup과 동일 관례) — walkTimerRef/holdTimerRef
  // 둘 다 정리한다(Stage 4 — 착석 유지 타이머가 새로 추가됨). 리뷰 수정
  // 1차 — shopCloseFallbackTimerRef(가게 닫기 세이프티 타이머)도 함께
  // 정리한다.
  useEffect(() => () => { clearWalkTimer(); clearHoldTimer(); clearShopCloseFallbackTimer() }, [])

  function handleGroundPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointerDownRef.current = { pointerId: e.pointerId, downX: e.clientX, downY: e.clientY }
  }

  function handleGroundPointerUp(e) {
    const start = pointerDownRef.current
    pointerDownRef.current = null
    if (!start || start.pointerId !== e.pointerId) return
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch { /* 이미 해제됨 — 무시 */ }
    // 2026-09-26(Phase 2, 가게 경험 v1) — 가게가 열려있는 동안은 바닥 탭이
    // 이동을 전혀 일으키지 않는다(요구사항 — 오버레이가 위에 떠 있어도
    // 바닥 포인터 핸들러 자체는 여전히 등록돼 있으므로 여기서 명시적으로
    // 막는다). 캐릭터 위치/방향은 이 return으로 인해 전혀 갱신되지 않아
    // 그대로 보존된다.
    if (shopOpen) return
    const dist = Math.hypot(e.clientX - start.downX, e.clientY - start.downY)
    if (dist >= DRAG_THRESHOLD_PX) return // 스와이프/스크롤 제스처로 판정 — 걷기 시작 안 함.
    const rect = groundRef.current ? groundRef.current.getBoundingClientRect() : null
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const rawLeftPct = ((e.clientX - rect.left) / rect.width) * 100
    const rawTopPct = ((e.clientY - rect.top) / rect.height) * 100
    const rawPoint = { x: rawLeftPct, y: rawTopPct }

    // Stage 4 정책(헤더 주석 참고, 항목7/8) — sitting/leaving 동안은 모든
    // 탭을 무시한다(idle로 돌아올 때까지 입력 잠금).
    const cur = characterRef.current
    if (cur.phase === 'sitting' || cur.phase === 'leaving') return

    // 벤치 hit-test는 항상 world 좌표로만 한다(벤치 이미지 자체는
    // pointer-events:none — 별도 onClick 경로를 만들지 않는다는 요구사항,
    // 아래 렌더 부분 참고). 패딩은 고정값이 아니라 이 탭에서 이미 구한
    // 바닥 레이어의 실제 렌더 픽셀 크기(rect)로 매번 다시 계산한다(모바일
    // 시각 보정 — 벤치 렌더 크기가 44px 미만인 좁은 뷰포트에서도 유효 탭
    // 타겟이 44x44px 이상이 되도록, 새 이벤트 경로 없이 이 hit-test 단계의
    // 패딩 크기만 조정한다).
    const tapPad = benchTapPad(BENCH, { groundWidthPx: rect.width, groundHeightPx: rect.height })
    const tappedBench = isBenchTap(rawPoint, BENCH, tapPad)

    // 항목7 — 이미 벤치를 향해 걷는 중(pendingSit)에 같은 벤치를 다시 탭하면
    // 중복 시퀀스를 만들지 않고 무시한다.
    if (cur.phase === 'walking' && cur.pendingSit && tappedBench) return

    // 그 외의 모든 경우(idle에서의 첫 탭이든, walking 중 재지정이든) — 새
    // 탭이 항상 우선한다: clamp(월드 경계) + 장애물 보정 + 경로탐색은
    // findPath(일반 바닥)/nearestWalkablePoint(벤치)에 위임한다(이 컴포넌트는
    // 좌표만 계산해 넘긴다 — 소유권 분리, walkGrid.js/pathfinding.js/
    // benchInteraction.js가 유일한 진실 원천).
    //
    // Phase 6A — 이 지점까지 도달한 탭은(sitting/leaving 잠금·pendingSit
    // 중복 무시를 이미 통과) "걷기를 실제로 시작시키는 유효한 탭"이므로
    // 여기서 탭 리플을 띄운다(항목C2 — startPlainWalk/startWalkToBench와
    // 같은 지점, 마우스/터치 공용 — 이 핸들러가 두 입력 모두를 받는다).
    showTapRipple({ x: rawLeftPct, y: rawTopPct })
    if (tappedBench) {
      startWalkToBench()
    } else {
      startPlainWalk(rawPoint)
    }
  }

  function handleGroundPointerCancel(e) {
    if (pointerDownRef.current && pointerDownRef.current.pointerId === e.pointerId) pointerDownRef.current = null
  }

  // Stage 5 감사(2026-09-23) 추가 — pointercancel과 동일한 정리를
  // lostpointercapture에도 건다. 브라우저가 setPointerCapture(위
  // handleGroundPointerDown)로 얻은 캡처를 pointerup/pointercancel 없이
  // 스스로 회수하는 경로(예: 동시 터치 중 다른 엘리먼트가 캡처를 가로채는
  // 드문 케이스)가 있으면, pointerDownRef가 그 down 시점 좌표를 계속 들고
  // 있다가 나중에 무관한 pointerup과 잘못 짝지어질 수 있다 — 이 핸들러가
  // 없어도 다음 pointerdown이 항상 pointerDownRef를 덮어써 자가 치유되긴
  // 하지만(요구사항13 무변경, 새 이동 경로 아님), 캡처 상실 시점에 즉시
  // 정리해 그 좁은 창을 없앤다.
  function handleGroundLostPointerCapture(e) {
    if (pointerDownRef.current && pointerDownRef.current.pointerId === e.pointerId) pointerDownRef.current = null
  }

  // 2026-09-26(Phase 2, 가게 경험 v1) — 가게 열기. shopBusyRef로 같은 tick
  // 안의 중복 호출(빠른 더블클릭)만 막는다 — 정상적인 "닫았다가 다시
  // 열기"는 막지 않는다(다음 tick에 자동 해제). history.pushState로 "가게
  // 화면"이라는 새 히스토리 항목을 만들어, 브라우저/기기의 뒤로가기로도
  // 가게가 닫히게 한다(모바일 하드웨어 백 버튼 등). pushState 자체가
  // 실패해도(사설/구식 환경) 오버레이는 그대로 연다 — history 연동은
  // "있으면 더 좋은" 부가 기능이지 열기 자체의 전제조건이 아니다.
  function handleEnterShop() {
    if (shopBusyRef.current || shopOpen || performance.now() < shopReentryBlockedUntilRef.current) return
    shopBusyRef.current = true
    setShopOpen(true)
    try { window.history.pushState({ proto25dShop: true }, '') } catch { /* 무시 — 오버레이 자체는 그대로 열린다 */ }
    setTimeout(() => { shopBusyRef.current = false }, 0)
  }

  // 실제로 오버레이를 닫는 지점 — popstate 경로와 직접 호출 경로(+ 세이프티
  // 타이머 경로, 리뷰 수정 1차)가 모두 이 함수 하나로 수렴한다(여러 갈래가
  // 각자 setShopOpen을 부르면 상태가 갈라질 위험이 있어 단일 통로로 합침).
  // cameraPosRef를 null로 리셋해 "산책 모드" rAF 루프가 다음 프레임에 즉시
  // 재스냅하게 한다(walkMode OFF 전환 effect와 동일한 이유 — 인라인
  // transform 잔상 방지, 위 walkMode effect 주석 참고). 함수형 업데이터로
  // 이미 닫혀있으면 아무 것도 하지 않는다(멱등 — popstate가 중복 발화해도
  // 안전). 리뷰 수정 1차 — 재진입 가드(shopBusyRef)는 이제 "실제로 닫히는
  // 시점"(이 함수가 cur:true -> false로 전이시킬 때)에만 풀린다 — 열기
  // (handleEnterShop)는 그대로 다음 tick에 풀리므로 무관.
  function closeShopNow() {
    clearShopCloseFallbackTimer()
    setShopOpen((cur) => {
      if (!cur) return cur
      cameraPosRef.current = null
      shopBusyRef.current = false
      return false
    })
    setShopClosing(false)
    // 2026-09-26 수정 3차 — 위 setShopOpen 함수형 업데이터 내부에서 세팅한
    // 지역 변수(예: didClose)는 React 18 배칭 하에서 업데이터가 나중에(이
    // 호출이 끝난 뒤) 실행되므로, 그 결과를 이 자리에서 동기적으로 읽을 수
    // 없다 — 그렇게 짜여 있던 이전 버전은 재진입 가드가 죽은 코드였다(항상
    // false로 보여 아래 블록이 실행되지 않음, verify:e2e S18 항목f 회귀).
    // 그래서 이 블록을 조건 없이 매번 실행한다. closeShopNow가 이미 닫힌
    // 상태에서 중복 호출돼도(popstate 중복 발화 등) 400ms 입장 차단을 한 번
    // 더 거는 것은 무해하다(가게가 이미 닫혀 있으니 재진입을 막는 것 자체가
    // 목적에 부합, 창만 살짝 늘어날 뿐).
    shopReentryBlockedUntilRef.current = performance.now() + SHOP_REENTRY_GUARD_MS
    setShopReentryBlocked(true)
    clearShopReentryTimer()
    shopReentryTimerRef.current = setTimeout(() => {
      shopReentryTimerRef.current = null
      setShopReentryBlocked(false)
    }, SHOP_REENTRY_GUARD_MS)
  }

  // 뒤로가기 버튼(ProtoShopScreen)/Escape 키가 공유하는 닫기 요청 — 우리가
  // pushState로 쌓아둔 히스토리 항목이 여전히 맨 위(history.state에 우리
  // 마커가 있음)면 history.back()으로 "진짜 뒤로가기"를 흉내내(popstate가
  // 발화해 closeShopNow를 부른다) 다음에 사용자가 또 뒤로가도 엉뚱한
  // 화면으로 튀지 않게 한다. 마커가 없으면(예: pushState가 애초에 실패한
  // 환경) history.back() 없이 바로 닫는다(직접 닫기).
  //
  // 리뷰 수정 1차(코드 리뷰 지적 — history.back()이 비동기 popstate로
  // 도착하는데 이전엔 shopBusyRef를 setTimeout(0)로 즉시 풀어버려, popstate
  // 도착 전에 빠른 재탭/Escape가 history.back()을 한 번 더 호출해 히스토리
  // 엔트리를 이중으로 소비하는 경쟁이 있었다) — history.back() 분기에서는
  // shopBusyRef를 여기서 풀지 않는다. 대신 popstate가 실제로 도착해
  // closeShopNow가 닫힐 때(위 함수)에만 풀린다. popstate가 끝내 오지 않는
  // 드문 환경을 대비해 ~600ms 세이프티 타이머로 강제로 직접 닫는다(그
  // 시점에도 closeShopNow를 거치므로 busy 해제는 여전히 그 함수 하나가
  // 담당 — 두 갈래가 각자 풀지 않음). 동기적으로 끝나는 나머지 두 경로
  // (마커 없음/history.back() 자체가 throw)는 closeShopNow를 이 자리에서
  // 바로 호출하므로 busy도 그 즉시 풀린다(비동기 창이 없어 추가 처리 불필요).
  function requestCloseShop() {
    if (shopBusyRef.current || !shopOpen) return
    shopBusyRef.current = true
    let ourStateOnTop = false
    try { ourStateOnTop = !!(window.history.state && window.history.state.proto25dShop) } catch { ourStateOnTop = false }
    if (ourStateOnTop) {
      try {
        window.history.back()
        setShopClosing(true)
        clearShopCloseFallbackTimer()
        shopCloseFallbackTimerRef.current = setTimeout(() => {
          shopCloseFallbackTimerRef.current = null
          closeShopNow() // popstate가 안 왔다 — 세이프티 폴백(위 주석 참고). busy/closing 해제는 closeShopNow가 담당.
        }, 600)
      } catch {
        closeShopNow() // history.back() 자체가 던짐 — 동기 폴백, busy는 closeShopNow가 즉시 해제.
      }
    } else {
      closeShopNow() // 히스토리 마커 없음 — 동기 직접 닫기, busy는 closeShopNow가 즉시 해제.
    }
  }

  // popstate(브라우저/기기 뒤로가기, 또는 위 requestCloseShop의
  // history.back() 호출) — 항상 "닫기"만 한다(새 pushState 없음, 요구사항
  // 그대로). 의존성 배열 없이 마운트 시 1회만 등록 — closeShopNow가 함수형
  // setShopOpen 업데이터를 쓰므로 클로저가 최신 shopOpen을 몰라도 안전하다
  // (updateCharacter/applyIfActive와 동일한 "최신값은 업데이터 인자로"
  // 원칙).
  useEffect(() => {
    function onPopState() { closeShopNow() }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Escape 키 — 가게가 열려있을 때만 닫기를 요청한다(요구사항). shopOpen에
  // 의존해 매번 최신 requestCloseShop 클로저로 다시 배선한다(리스너 자체는
  // 가벼워 재등록 비용이 무시할 만함, 이 파일의 다른 effect들과 동일 관례
  // 수준).
  useEffect(() => {
    if (!shopOpen) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') requestCloseShop()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shopOpen])

  // Stage 4 — 'sitting' 단계에서만 z-index 계산에 topPct 대신 벤치의 y1을
  // 넘긴다(ProtoCharacter.jsx 헤더 주석 "depthY" 항목에 이유 정리 — 좌석
  // y가 벤치 y1보다 작아 topPct 그대로 쓰면 캐릭터가 벤치보다 뒤로 밀려나
  // 보인다). walking/leaving/idle에서는 undefined(=topPct 그대로, 기존
  // Stage 3 동작 무변경).
  const characterDepthY = character.phase === 'sitting' ? BENCH.y1 : undefined

  // 2026-09-26(Phase 2, 가게 경험 v1) — 입장 버튼 표시 여부(shopInteraction.js
  // isNearShopEntrance가 유일한 판정 로직, 재구현 없음). sitting 중엔 굳이
  // 보여줄 필요가 없다(요구사항 — 벤치와 가게 입장 반경이 겹칠 이론상
  // 경우까지 방어).
  const nearShop = isNearShopEntrance(character.leftPct, character.topPct)

  return (
    <div
      data-testid="proto25d-root"
      // Phase 6A — 장애물 개수를 하드코딩된 리터럴 없이 DOM에서 직접
      // 읽을 수 있게 노출한다(E2E가 "OBSTACLES_REF 3개" 같은 고정 상수
      // 대신 이 속성으로 실제 개수를 재확인 — walkGrid.js 헤더 주석의
      // "단일 진실 원천" 원칙과 동일 정신, 값 복제가 아니라 실제 소스를
      // 그대로 반영).
      data-proto25d-obstacle-count={OBSTACLES.length}
      // 2026-09-26(Phase 2, 가게 경험 v1) — 가게 오버레이가 열려있는지
      // 테스트가 DOM에서 직접 읽을 수 있게 노출(state 재질의 대신 단일
      // 진실 원천, 위 data-proto25d-obstacle-count와 동일 정신). 닫혀
      // 있을 때는 속성 자체를 안 붙인다(값이 "false"인 채로 남는 것보다
      // "속성 부재"가 더 명확한 계약).
      {...(shopOpen ? { 'data-shop-open': 'true' } : {})}
      // Phase 6D(2026-09-25) — 오버레이 역할/이름만 부여(포커스 관리 없음).
      role="region"
      aria-label="Paul Town 2.5D 프로토타입"
      className="fixed inset-0 z-[9999] bg-[#dff3ea] flex flex-col"
    >
      {/* UI 배지(항목8/12 테스트용 UI 엘리먼트) — 바닥 레이어의 형제
          엘리먼트로, 그 하위에 중첩하지 않는다. 포인터 이벤트는 바닥
          레이어 엘리먼트에만 직접 걸려 있으므로(버블링 경로가 아니라 그
          엘리먼트 자신이 타깃일 때만 발화), 이 배지를 눌러도 구조적으로
          바닥의 onPointerDown/onPointerUp에는 절대 닿지 않는다. */}
      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1">
        <button
          type="button"
          data-testid="proto25d-info-toggle"
          onClick={() => setInfoOpen((v) => !v)}
          // Stage 5 감사(2026-09-23) — min-h-[44px] 추가(WCAG 2.5.5/iOS HIG
          // 탭 타겟 하한, 이 저장소 기존 관례 — testTownV2Static.mjs가 이미
          // V2 컴포넌트 전체 버튼에 강제하는 것과 동일 기준). 이전 px-3 py-1
          // + text-xs만으로는 실측 높이가 ~24px로 하한 미달이었다(로직/좌표
          // 무변경, 시각적 패딩만 조정).
          className="min-h-[44px] flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-purple-500 shadow"
        >
          ⓘ 2.5D 프로토타입 (Stage 1+2+3+4)
        </button>
        {/* 2026-09-26 — 산책 모드 HUD 토글. 기존 정보 배지와 같은 컬럼(항상
            좌상단, 바닥 중앙을 가리지 않음)에 둔다 — 이 배지 컬럼 자체가
            바닥 pointer 핸들러의 형제 엘리먼트라(위 "UI 배지" 주석 참고)
            이 버튼을 눌러도 구조적으로 바닥의 이동 핸들러에는 닿지 않는다.
            min-h-[44px] — 위 정보 배지와 동일한 탭 타겟 하한 관례. */}
        <button
          type="button"
          data-testid="proto25d-walkmode-toggle"
          onClick={toggleWalkMode}
          className="min-h-[44px] flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-emerald-600 shadow"
        >
          산책 모드 {walkMode ? 'ON' : 'OFF'}
        </button>
        {infoOpen && (
          <p className="rounded-xl bg-white/90 px-3 py-2 text-[11px] text-gray-500 shadow max-w-[220px]">
            바닥을 탭하면 캐릭터가 걸어갑니다. 회색 상자를 탭하면 안까지
            들어가지 않고 앞에서 멈추거나 돌아갑니다. 벤치를 탭하면 걸어가
            잠시 앉았다가 다시 일어납니다. 실제 아트/저장 기능 없는 내부
            프로토타입입니다.
          </p>
        )}
      </div>

      {/* 2026-09-26 — 뷰포트 래퍼(신규, 산책 모드 전용 새 엘리먼트). 항상
          렌더된다(walkMode와 무관 — 뷰포트 크기를 모드 전환 전에도 미리
          알고 있어야 토글 즉시 카메라가 정확한 값으로 시작할 수 있다).
          바닥이 예전처럼 이 컬럼의 flex-1 아이템 역할을 그대로 하도록
          "flex flex-col"도 추가한다(OFF 모드에서 바닥 자신의 flex-1
          유틸리티가 여전히 효과를 내려면 부모가 flex 컨테이너여야 한다 —
          안 그러면 flex-1은 아무 것도 하지 않는 클래스가 된다) — 이
          래퍼가 root의 flex-col 안에서 flex-1로 남은 세로 공간 전체를
          차지하고(이전에 바닥이 하던 역할 그대로), 그 안에서 다시
          flex-col을 열어 바닥 하나를 자식으로 꽉 채운다 — 순수하게
          레이아웃을 보존하기 위한 중간 계층일 뿐 시각적으로 아무 것도
          그리지 않는다(배경/테두리 없음). overflow-hidden — 산책 모드에서
          세계가 이 창보다 커도 창 밖은 잘려서 보이지 않는다(요구사항 —
          "world larger than viewport"). */}
      <div ref={viewportRef} data-testid="proto25d-viewport" className="relative flex-1 overflow-hidden touch-none flex flex-col">
        {/* 바닥/씬 레이어 — 이동 핸들러가 붙는 유일한 엘리먼트(요구사항13).
            world % 좌표계는 worldContract.js WORLD(100 x 190)를 그대로
            가져다 쓴다(새 좌표계 재정의 금지).
            2026-09-26 — walkMode OFF는 예전과 완전히 동일한 className/
            style(같은 문자열, transform 없음) — S1~S16이 이 렌더 분기에서
            byte-equivalent임을 보장한다. walkMode ON은 흐름에서 빠져
            (absolute) 세계 전체 크기(worldSize, computeWorldSizePx)로
            그려지고, 매 프레임 transform만 위 rAF effect가 imperative하게
            쓴다(React style에는 transform을 아예 넣지 않는다 — effect가
            유일한 소유자). */}
      <div
        ref={groundRef}
        data-testid="proto25d-ground"
        role="group"
        aria-label="2.5D 프로토타입 바닥"
        className={walkMode ? 'absolute top-0 left-0 touch-none' : 'relative flex-1 overflow-hidden touch-none'}
        style={walkMode
          ? { width: `${worldSize.worldW}px`, height: `${worldSize.worldH}px`, willChange: 'transform', background: 'linear-gradient(180deg, #eaf7f0 0%, #cdebd8 100%)' }
          : { aspectRatio: `${WORLD.w} / ${WORLD.h}`, background: 'linear-gradient(180deg, #eaf7f0 0%, #cdebd8 100%)' }}
        onPointerDown={handleGroundPointerDown}
        onPointerUp={handleGroundPointerUp}
        onPointerCancel={handleGroundPointerCancel}
        onLostPointerCapture={handleGroundLostPointerCapture}
      >
        {/* Phase 6A — 정적 길/광장(path/plaza) 표시. 이미지 파일 없이 CSS
            radial-gradient 2장만으로 스폰(50,62)에서 벤치 쪽(23.5,63)으로,
            그리고 광장 아래(50,88 부근)로 "닳은 길" 느낌을 준다
            (p6a_B_composition.md §2 "Path/plaza treatment" 그대로). 장애물이
            아니다 — walkGrid.js OBSTACLES에 전혀 관여하지 않고, z-index를
            주지 않아(auto) 아래의 모든 명시적 z-index 엘리먼트(오브젝트/
            캐릭터/디버그 박스)보다 항상 뒤에 그려진다(DOM 순서상으로도 가장
            먼저 — 두 조건이 함께 이를 보장). pointer-events-none — 탭
            판정에 전혀 관여하지 않는다(요구사항13 무변경). */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: [
              'radial-gradient(ellipse 40% 10% at 23.5% 63%, rgba(214,196,150,0.35) 0%, rgba(214,196,150,0) 70%)',
              'radial-gradient(ellipse 30% 45% at 50% 88%, rgba(214,196,150,0.30) 0%, rgba(214,196,150,0) 70%)',
              'linear-gradient(180deg, rgba(214,196,150,0) 0%, rgba(214,196,150,0.22) 55%, rgba(214,196,150,0) 100%)',
            ].join(', '),
            backgroundRepeat: 'no-repeat',
          }}
        />

        {/* Phase 6A — 범용 오브젝트 레이어(sceneFixture.js SCENE_FIXTURE,
            벤치 제외 — 아래 기존 벤치 전용 블록이 계속 그린다). 각 항목을
            bottom-center 앵커(translate(-50%,-100%))로 배치하고, shadow:true
            면 같은 zIndex의 그림자를 본체보다 먼저(DOM 순서) 그려 항상 그
            아래 깔리게 한다(V2 TownObjectLayer.jsx LotShadow와 동일 패턴).
            폭은 objectRenderedWidthPx(sceneFixture.js — depth-scale +
            minWidthPx 하한 반영, groundSize 실측), 높이는 naturalAspect로
            역산(벤치의 기존 "width만 %, height는 이미지 종횡비" 관례와
            동일 정신). townAsset(assetKey)가 null이면(등록 안 된 키) 조용히
            건너뛴다(townAsset() 기존 계약 — 이미지 부재로 기능이 깨지지
            않음). pointer-events-none — 탭 판정은 여전히 bench와 마찬가지로
            새 이벤트 경로를 만들지 않는다. 앵커 배치(left/top/transform)는
            래퍼 div가 전담하고 img는 안에서 100%/100%로만 채운다 — sway
            애니메이션(motion-safe:animate-town-sway)이 자신이 걸린
            엘리먼트의 인라인 transform을 매 프레임 통째로 덮어써서,
            img 자신에 배치용 translate(-50%,-100%)를 같이 걸면 애니메이션이
            그 배치를 지우고 top-left 앵커처럼 밀려 보이는 버그가 있었다
            (나무/관목 5개, 그림자·hitbox와 어긋남) — 배치는 래퍼가,
            흔들림 회전은 img가 따로 맡아 서로 덮어쓰지 않게 분리했다. */}
        {RENDER_OBJECTS.map((obj) => {
          const url = townAsset(obj.assetKey)
          if (!url) return null
          const collision = OBSTACLES.find((ob) => ob.id === obj.id)
          const depthY = collision ? collision.y1 : obj.anchor.y
          const z = obstacleZIndex(obj.id, depthY)
          const widthPx = objectRenderedWidthPx(obj, groundSize)
          const heightPx = widthPx * obj.naturalAspect
          const swayClass = SWAY_ASSET_KEYS.has(obj.assetKey) ? SWAY_CLASS : ''
          return (
            <Fragment key={obj.id}>
              {obj.shadow && (
                <div
                  aria-hidden="true"
                  data-testid="proto25d-object-shadow"
                  data-object-id={obj.id}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${obj.anchor.x}%`,
                    top: `${obj.anchor.y}%`,
                    width: `${widthPx}px`,
                    height: `${widthPx * SCENE_OBJECT_SHADOW_HEIGHT_RATIO}px`,
                    transform: `translate(-50%, -${SCENE_OBJECT_SHADOW_HEIGHT_RATIO * 100}%)`,
                    background: SHADOW_BACKGROUND,
                    zIndex: z,
                  }}
                />
              )}
              <div
                aria-hidden="true"
                data-testid="proto25d-object"
                data-object-id={obj.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${obj.anchor.x}%`,
                  top: `${obj.anchor.y}%`,
                  width: `${widthPx}px`,
                  height: `${heightPx}px`,
                  transform: 'translate(-50%, -100%)',
                  transformOrigin: '50% 100%',
                  zIndex: z,
                }}
              >
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  data-proto25d-object-img=""
                  className={`block w-full h-full${swayClass}`}
                />
              </div>
            </Fragment>
          )
        })}

        {/* Stage 4 — 실제 벤치 아트(src/assets/town/decorations/bench.webp,
            townAsset('decorations/bench')). 하단-중앙을 장애물 박스의
            하단-중앙((x0+x1)/2, y1)에 맞춘다(요구사항1 그대로 — width는
            장애물 폭, height는 이미지 자체 비율에 맡긴다/aspect-ratio 강제
            없음). pointer-events-none + alt="" + aria-hidden — 탭 판정은
            여전히 바닥 레이어의 hit-test(isBenchTap, world 좌표)만 쓰고 이
            엘리먼트 자체에는 어떤 이벤트 핸들러도 걸지 않는다(요구사항2 —
            새 이벤트 경로를 만들지 않는다). 모바일 시각 보정(2026-09-23) —
            width에 px 하한(44px, ProtoCharacter.jsx CHARACTER_MIN_WIDTH_PX와
            같은 취지)을 CSS max()로 둔다 — walkGrid.js OBSTACLES 좌표(x0/x1)
            자체는 무변경, 시각 렌더 크기만 좁은 뷰포트에서 더 이상 줄어들지
            않게 한다. */}
        {BENCH && townAsset('decorations/bench') && (
          <img
            src={townAsset('decorations/bench')}
            alt=""
            aria-hidden="true"
            data-testid="proto25d-bench-art"
            className="absolute pointer-events-none"
            style={{
              left: `${(BENCH.x0 + BENCH.x1) / 2}%`,
              top: `${BENCH.y1}%`,
              width: `max(${BENCH.x1 - BENCH.x0}%, ${BENCH_ASSET_MIN_WIDTH_PX}px)`,
              transform: 'translate(-50%, -100%)',
              zIndex: obstacleZIndex(BENCH.id, BENCH.y1),
            }}
          />
        )}

        {/* 장애물 디버그 플레이스홀더(Stage 2) — 실제 아트 아님, Phase E
            육안 검증(탭이 상자 안으로 들어가지 않는지/뒤로 돌아가는지)을
            가능하게 하기 위한 단순 색상 사각형 + 라벨. pointer-events-none
            — 탭 핸들러는 여전히 바닥(groundRef) 엘리먼트에만 걸려 있고
            이 오버레이는 그 판정에 관여하지 않는다(요구사항13 무변경).
            zIndex(Stage 3) — 고정값이 아니라 obstacleZIndex(id, y1)로 매
            렌더 계산한다(depthOrder.js 'objects' 레이어, y1=바운딩 박스
            하단/지면 접점) — 캐릭터('character' 레이어, 위 Proto25DScreen
            헤더 주석 참고)와 Y 기준으로 서로 가리고 가려지게 하기 위함.
            모바일 시각 보정(2026-09-23) — 기본적으로 렌더하지 않는다
            (debugOverlaysEnabled, 위 readDebugOverlaysEnabled 주석 참고).
            실기기 프리뷰에서 이 점선 상자+라벨이 벤치 실제 아트와 겹쳐
            상호작용을 읽기 어렵다는 회귀가 보고됐다 — walkGrid.js
            OBSTACLES(히트박스 자체)는 그대로 두고 시각 표시만 끈다.
            townProto25d.spec.mjs S6은 `?proto25dDebug=1` 쿼리로 이 스위치를
            켠 뒤 기존 "장애물 디버그 엘리먼트가 OBSTACLES_REF와 좌표
            일치" 회귀를 그대로 재확인한다(약화 없음, 조건부 실행으로만
            전환).
            Phase 6A(DOM 순서 변경) — 이 map을 범용 오브젝트 레이어/벤치
            아트보다 "뒤"(이 위치)로 옮겼다(이전엔 오브젝트/벤치보다 앞에
            있었다). 같은 id는 아트와 디버그 박스가 정확히 같은
            obstacleZIndex(id,y1)를 쓰므로(zIndex 동률), DOM에서 더 뒤에
            있는 엘리먼트가 항상 위에 그려진다 — 디버그 모드에서는 "장애물
            히트박스가 실제 아트 위에 겹쳐 보여야 육안 검증이 쉽다"는
            요구(팀장 지시)에 맞춰 디버그 박스가 항상 아트 위에 오도록
            바꿨다(일반 모드는 이 블록 자체가 렌더되지 않아 영향 없음). */}
        {debugOverlaysEnabled && OBSTACLES.map((ob) => (
          <div
            key={ob.id}
            aria-hidden="true"
            data-testid="proto25d-obstacle"
            data-obstacle-id={ob.id}
            className="absolute pointer-events-none border-2 border-dashed border-slate-500/70 bg-slate-500/25 flex items-center justify-center overflow-hidden"
            style={{
              left: `${ob.x0}%`,
              top: `${ob.y0}%`,
              width: `${ob.x1 - ob.x0}%`,
              height: `${ob.y1 - ob.y0}%`,
              zIndex: obstacleZIndex(ob.id, ob.y1),
            }}
          >
            <span className="text-[9px] text-slate-700/80 font-bold px-0.5 text-center leading-tight">
              {ob.id}
            </span>
          </div>
        ))}

        {/* Phase 6A — 탭 리플(항목C2). pointer-events-none, aria-hidden.
            reduced-motion이면 showTapRipple 자체가 state를 채우지 않아
            (컴포넌트 헤더의 ripple state 선언부 주석 참고) ripples는 항상
            빈 배열이라 이 map은 아무것도 렌더하지 않는다(이중 방어 —
            motion-safe: 클래스도 함께 건다). */}
        {ripples.map((rp) => (
          <div
            key={rp.id}
            aria-hidden="true"
            data-testid="proto25d-tap-ripple"
            className="absolute rounded-full border-2 border-purple-400/70 motion-safe:animate-town-proto-ripple pointer-events-none"
            style={{
              left: `${rp.x}%`,
              top: `${rp.y}%`,
              width: '36px',
              height: '36px',
              zIndex: TAP_RIPPLE_Z,
            }}
          />
        ))}

        <ProtoCharacter
          phase={character.phase}
          leftPct={character.leftPct}
          topPct={character.topPct}
          reducedMotion={reducedMotion}
          facing={character.facing}
          depthY={characterDepthY}
          sitBenchHeightPx={character.phase === 'sitting' ? character.sitBenchHeightPx : undefined}
          spriteManifest={spriteManifest}
          direction={character.direction}
        />
      </div>

      {/* 2026-09-26(Phase 2, 가게 경험 v1) — "가게 들어가기" 버튼. 뷰포트
          래퍼의 형제(바닥의 형제, 바닥 안이 아님)라 산책 모드의 카메라
          transform(바닥에만 걸림)에 영향받지 않고 항상 화면(뷰포트) 기준
          하단-중앙에 고정된다. pointer-events-auto — 부모 뷰포트 래퍼가
          touch-none이라도 이 버튼 자체는 눌려야 한다. z는 바닥 내부
          최댓값(TAP_RIPPLE_Z=7000)보다 낮아도 무방 — DOM상 바닥의 형제로
          이후에 그려지므로 항상 그 위에 쌓인다(stacking context가 같은
          가장 가까운 z:auto가 아닌 조상 기준이라 안전, 이 파일의 UI 배지
          컬럼과 동일 원리). */}
      {!shopOpen && nearShop && character.phase !== 'sitting' && (
        <button
          type="button"
          data-testid="proto25d-shop-enter"
          onClick={handleEnterShop}
          disabled={shopReentryBlocked}
          aria-disabled={shopReentryBlocked ? 'true' : undefined}
          className={
            'absolute left-1/2 bottom-6 z-20 -translate-x-1/2 min-h-[52px] px-6 rounded-full bg-emerald-500 text-white text-sm font-black shadow-lg pointer-events-auto'
            + (shopReentryBlocked ? ' pointer-events-none' : '')
          }
        >
          🏪 가게 들어가기
        </button>
      )}
      </div>

      {/* 2026-09-26(Phase 2, 가게 경험 v1) — 가게 내부 오버레이. root(이
          fixed inset-0 z-[9999] 전체 화면)의 형제 레벨 마지막 자식으로 둬
          DOM 순서만으로 항상 최상단에 그려지고(뷰포트/바닥/HUD 배지 전부
          이 오버레이보다 먼저 등장), ProtoShopScreen 자신도 absolute
          inset-0 + 명시적 z-index로 이중 방어한다. */}
      {shopOpen && (
        <ProtoShopScreen products={SHOP_PRODUCTS} onBack={requestCloseShop} closing={shopClosing} />
      )}
    </div>
  )
}
