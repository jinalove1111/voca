// src/components/town/proto2_5d/Proto25DScreen.jsx — Paul Town 2.5D 캐릭터
// 프로토타입(Stage 1 2026-09-22 + Stage 2 2026-09-22) 씬 컨테이너.
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
// Stage 2 추가 요구사항(장애물 회피 — 그 이상 만들지 않는다, Y기반
// scale/depth/occlusion/그림자 폴리시는 Stage 3, 벤치 상호작용은 Stage 4,
// 둘 다 이 세션 범위 밖): 탭 지점이 world 경계 밖이면 clamp, 장애물 안이면
// 가장 가까운 걸을 수 있는 지점으로 보정, 시작 위치에서 보정된 목적지까지
// 장애물을 우회하는 경로(src/utils/town/proto2_5d/pathfinding.js)를 따라
// 웨이포인트별로 순차 이동한다. 경로가 없으면(완전히 도달 불가) 아무 것도
// 하지 않는다(제자리 유지, 크래시 없음).
import { useEffect, useRef, useState } from 'react'
import ProtoCharacter, { WALK_TRANSITION_MS, REDUCED_MOTION_TRANSITION_MS } from './ProtoCharacter'
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion'
import { WORLD } from '../../../utils/town/worldContract'
import { OBSTACLES } from '../../../utils/town/proto2_5d/walkGrid'
import { findPath } from '../../../utils/town/proto2_5d/pathfinding'

// 탭 vs 스와이프/스크롤 제스처 구분 임계값(px) — TownScene.jsx의
// DRAG_THRESHOLD_PX(8, 브리프 권장 범위 6~8px 상단값)와 동일 값. Stage 1은
// 경쟁하는 드래그 제스처가 없어(아이템 드래그 배치 없음) 그 파일의 전체
// pending/dragging 상태 머신까지는 필요 없다 — down/up 두 지점 거리 비교로
// 충분하다(팀장 지시 — "단순 click/pointerup 임계값 체크로 충분").
const DRAG_THRESHOLD_PX = 8

const INITIAL_LEFT_PCT = 50
const INITIAL_TOP_PCT = 62

export default function Proto25DScreen() {
  const reducedMotion = usePrefersReducedMotion()
  const [character, setCharacter] = useState({ phase: 'idle', leftPct: INITIAL_LEFT_PCT, topPct: INITIAL_TOP_PCT })
  const [infoOpen, setInfoOpen] = useState(false)
  const groundRef = useRef(null)
  const pointerDownRef = useRef(null) // { pointerId, downX, downY } | null
  const walkTimerRef = useRef(null)

  function clearWalkTimer() {
    if (walkTimerRef.current != null) {
      clearTimeout(walkTimerRef.current)
      walkTimerRef.current = null
    }
  }

  // 단일 구간(leg) 이동 — 목표 좌표로 전이 후 transition 지속시간이 지나면
  // idle 또는 다음 구간으로 넘어간다. isLast가 아니면 타이머 콜백에서
  // walkLeg(path, index+1)을 호출해 다음 웨이포인트로 체이닝한다(Stage 1의
  // "예약된 타이머 1개만 활성" 관례를 그대로 유지 — walkTimerRef는 항상
  // 최대 1개의 타이머만 가리킨다, clearWalkTimer가 매 구간 시작 시 이전
  // 타이머를 정리한다).
  function walkLeg(path, index) {
    const target = path[index]
    const isLast = index === path.length - 1
    setCharacter({ phase: 'walking', leftPct: target.x, topPct: target.y })
    walkTimerRef.current = setTimeout(() => {
      walkTimerRef.current = null
      setCharacter((cur) => {
        if (cur.leftPct !== target.x || cur.topPct !== target.y) return cur
        return isLast ? { ...cur, phase: 'idle' } : cur
      })
      if (!isLast) walkLeg(path, index + 1)
    }, WALK_TRANSITION_MS)
  }

  // 경로(웨이포인트 배열) 하나를 따라 걷는다. reduced-motion이면 각
  // 웨이포인트를 순서대로 보여주는 대신, 경로가 유효(=pathfinding이 검증한
  // 걸을 수 있는 목적지)함을 그대로 신뢰해 마지막 웨이포인트로 즉시(짧은
  // transition 1회) 이동한다 — "경로의 최종 보행 가능 위치로 즉시 이동"
  // 요구사항(운영자 원문) 그대로. 순간이동(0ms)은 아니다 — Stage 1과 동일한
  // 이유로 목적지 변화를 지각할 수 있는 최소 지속시간(REDUCED_MOTION_
  // TRANSITION_MS)을 유지한다.
  function walkPath(path) {
    clearWalkTimer()
    if (!path || path.length === 0) return
    if (reducedMotion) {
      const dest = path[path.length - 1]
      setCharacter({ phase: 'walking', leftPct: dest.x, topPct: dest.y })
      walkTimerRef.current = setTimeout(() => {
        walkTimerRef.current = null
        setCharacter((cur) => (cur.leftPct === dest.x && cur.topPct === dest.y ? { ...cur, phase: 'idle' } : cur))
      }, REDUCED_MOTION_TRANSITION_MS)
      return
    }
    walkLeg(path, 0)
  }

  // 언마운트 시 예약된 타이머 정리(setState-after-unmount 방지, TownScene.jsx
  // interactionTimerRef cleanup과 동일 관례) — 다중 웨이포인트 체이닝 중에도
  // walkTimerRef는 항상 "현재 예약된 다음 1개 타이머"만 가리키므로, 이
  // cleanup 하나로 언마운트/새 걷기 명령 모두에서 안전하게 취소된다.
  useEffect(() => () => clearWalkTimer(), [])

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
    // clamp(world 경계) + 장애물 보정 + 경로 탐색은 전부
    // pathfinding.js(findPath)에 위임한다 — 이 컴포넌트는 좌표만 계산해
    // 넘긴다(소유권 분리, walkGrid.js/pathfinding.js가 유일한 진실 원천).
    const path = findPath(
      { x: character.leftPct, y: character.topPct },
      { x: rawLeftPct, y: rawTopPct },
    )
    if (!path || path.length === 0) return // 경로 없음(완전히 도달 불가) — 제자리 유지, 크래시 없음.
    walkPath(path)
  }

  function handleGroundPointerCancel(e) {
    if (pointerDownRef.current && pointerDownRef.current.pointerId === e.pointerId) pointerDownRef.current = null
  }

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
          ⓘ 2.5D 프로토타입 (Stage 1+2)
        </button>
        {infoOpen && (
          <p className="rounded-xl bg-white/90 px-3 py-2 text-[11px] text-gray-500 shadow max-w-[220px]">
            바닥을 탭하면 캐릭터가 걸어갑니다. 회색 상자를 탭하면 안까지
            들어가지 않고 앞에서 멈추거나 돌아갑니다. 실제 아트/저장 기능
            없는 내부 프로토타입입니다.
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
            이 오버레이는 그 판정에 관여하지 않는다(요구사항13 무변경). */}
        {OBSTACLES.map((ob) => (
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
              zIndex: 100,
            }}
          >
            <span className="text-[9px] text-slate-700/80 font-bold px-0.5 text-center leading-tight">
              {ob.id}
            </span>
          </div>
        ))}

        <ProtoCharacter
          phase={character.phase}
          leftPct={character.leftPct}
          topPct={character.topPct}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  )
}
