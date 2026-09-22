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
import { useEffect, useRef, useState } from 'react'
import ProtoCharacter, { WALK_TRANSITION_MS, REDUCED_MOTION_TRANSITION_MS } from './ProtoCharacter'
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion'
import { WORLD } from '../../../utils/town/worldContract'
import { OBSTACLES, nearestWalkablePoint } from '../../../utils/town/proto2_5d/walkGrid'
import { findPath } from '../../../utils/town/proto2_5d/pathfinding'
import { obstacleZIndex } from '../../../utils/town/proto2_5d/depthVisual'
import { townAsset } from '../../../assets/town'
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

export default function Proto25DScreen() {
  const reducedMotion = usePrefersReducedMotion()
  // 마운트 시점 URL 쿼리 1회만 읽는다(세션 중 쿼리가 바뀔 일이 없어
  // useState lazy init으로 충분 — 매 렌더 재파싱 불필요).
  const [debugOverlaysEnabled] = useState(readDebugOverlaysEnabled)
  const [character, setCharacter] = useState({
    phase: 'idle',
    leftPct: INITIAL_LEFT_PCT,
    topPct: INITIAL_TOP_PCT,
    facing: 1, // 1=기본 방향, -1=좌우 미러링(ProtoCharacter.jsx facing prop)
    pendingSit: false, // 벤치를 향해 걷는 중(walking)인지 — 항목7 반복 탭 무시 판정용
    sitBenchHeightPx: undefined, // 2026-09-23 좌석 접촉점 sink 보정 — enterSitting에서만 채워짐(아래 참고)
  })
  const characterRef = useRef(character) // 헤더 주석 "characterRef" 참고 — setTimeout 콜백 전용 최신값 미러
  const [infoOpen, setInfoOpen] = useState(false)
  const groundRef = useRef(null)
  const pointerDownRef = useRef(null) // { pointerId, downX, downY } | null
  const walkTimerRef = useRef(null) // 걷기 구간(leg) 전이 타이머(Stage 1부터 — 항상 최대 1개)
  const holdTimerRef = useRef(null) // Stage 4 — 착석 유지(SIT_HOLD_MS) 전용 타이머(walkTimerRef와 별개 ref)
  const seqRef = useRef(0) // 헤더 주석 "seq 카운터" 참고

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
    applyIfActive(seq, (cur) => ({ ...cur, phase: phaseLabel, leftPct: target.x, topPct: target.y }))
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
      applyIfActive(seq, (cur) => ({ ...cur, phase: phaseLabel, leftPct: dest.x, topPct: dest.y }))
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
      // 도달 불가(사실상 발생하지 않음) — 그래도 phase는 leaving을 한 번
      // 거쳐 idle로 떨어진다(상태 머신 계약 일관성, 크래시/멈춘 상태 없음).
      applyIfActive(seq, (c) => ({ ...c, phase: 'leaving' }))
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
  // 둘 다 정리한다(Stage 4 — 착석 유지 타이머가 새로 추가됨).
  useEffect(() => () => { clearWalkTimer(); clearHoldTimer() }, [])

  function handleGroundPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointerDownRef.current = { pointerId: e.pointerId, downX: e.clientX, downY: e.clientY }
  }

  function handleGroundPointerUp(e) {
    const start = pointerDownRef.current
    pointerDownRef.current = null
    if (!start || start.pointerId !== e.pointerId) return
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch { /* 이미 해제됨 — 무시 */ }
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
    if (tappedBench) {
      startWalkToBench()
    } else {
      startPlainWalk(rawPoint)
    }
  }

  function handleGroundPointerCancel(e) {
    if (pointerDownRef.current && pointerDownRef.current.pointerId === e.pointerId) pointerDownRef.current = null
  }

  // Stage 4 — 'sitting' 단계에서만 z-index 계산에 topPct 대신 벤치의 y1을
  // 넘긴다(ProtoCharacter.jsx 헤더 주석 "depthY" 항목에 이유 정리 — 좌석
  // y가 벤치 y1보다 작아 topPct 그대로 쓰면 캐릭터가 벤치보다 뒤로 밀려나
  // 보인다). walking/leaving/idle에서는 undefined(=topPct 그대로, 기존
  // Stage 3 동작 무변경).
  const characterDepthY = character.phase === 'sitting' ? BENCH.y1 : undefined

  return (
    <div data-testid="proto25d-root" className="fixed inset-0 z-[9999] bg-[#dff3ea] flex flex-col">
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
          className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-purple-500 shadow"
        >
          ⓘ 2.5D 프로토타입 (Stage 1+2+3+4)
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

      {/* 바닥/씬 레이어 — 이동 핸들러가 붙는 유일한 엘리먼트(요구사항13).
          world % 좌표계는 worldContract.js WORLD(100 x 190)를 그대로
          가져다 쓴다(새 좌표계 재정의 금지). */}
      <div
        ref={groundRef}
        data-testid="proto25d-ground"
        role="group"
        aria-label="2.5D 프로토타입 바닥"
        className="relative flex-1 overflow-hidden touch-none"
        style={{ aspectRatio: `${WORLD.w} / ${WORLD.h}`, background: 'linear-gradient(180deg, #eaf7f0 0%, #cdebd8 100%)' }}
        onPointerDown={handleGroundPointerDown}
        onPointerUp={handleGroundPointerUp}
        onPointerCancel={handleGroundPointerCancel}
      >
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
            켠 뒤 기존 "장애물 디버그 엘리먼트가 정확히 3개, OBSTACLES_REF와
            좌표 일치" 회귀를 그대로 재확인한다(약화 없음, 조건부 실행으로만
            전환). demo-bench도 디버그 모드에서는 계속 그린다(팀장이 제시한
            두 선택지 중 "숨김"을 택하지 않았다) — 아래에 실제 벤치 아트를
            같은 위치/zIndex로 겹쳐 그려 넣는다(같은 zIndex는 DOM 순서로
            타이브레이크되므로, 이 map보다 뒤에 두면 아트가 디버그 박스 위에
            그려진다). */}
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

        <ProtoCharacter
          phase={character.phase}
          leftPct={character.leftPct}
          topPct={character.topPct}
          reducedMotion={reducedMotion}
          facing={character.facing}
          depthY={characterDepthY}
          sitBenchHeightPx={character.phase === 'sitting' ? character.sitBenchHeightPx : undefined}
        />
      </div>
    </div>
  )
}
