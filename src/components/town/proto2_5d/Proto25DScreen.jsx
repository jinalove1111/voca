// src/components/town/proto2_5d/Proto25DScreen.jsx — Paul Town 2.5D 캐릭터
// 프로토타입(Stage 1, 2026-09-22) 씬 컨테이너.
//
// 완전히 격리된 실험 — 기존 src/components/town/v2/* 파일을 하나도
// import/수정하지 않는다(docs/design/town/ASTRA_HANDOFF_2026-09-21.md §12
// 권장 구조). paulTownV1/paulTownV2/파일럿 허용목록과 무관하게 자체 플래그
// (paulTown2_5d)로만 게이팅된다. 구매/저장 API 호출 없음 — 전부 마운트
// 스코프 로컬 state(영속화 없음, 새로고침하면 초기 위치로 리셋).
//
// Stage 1 요구사항(그 이상 만들지 않는다 — Stage 2 장애물 회피/Stage 4
// 벤치 상호작용은 이 세션 범위 밖):
//  1. 캐릭터 1명, 마운트 즉시 항상 보임(idle).
//  2. 유효한 바닥(ground) 탭 → 그 지점까지 점진적으로 걸어감(순간이동 없음).
//  3. UI(정보 배지 버튼 등) 클릭은 캐릭터를 움직이지 않음 — 이동 핸들러를
//     바닥 레이어 엘리먼트에만 직접 건다(문서 레벨/광역 delegation 금지).
import { useEffect, useRef, useState } from 'react'
import ProtoCharacter, { WALK_TRANSITION_MS, REDUCED_MOTION_TRANSITION_MS } from './ProtoCharacter'
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion'
import { WORLD } from '../../../utils/town/worldContract'

// 탭 vs 스와이프/스크롤 제스처 구분 임계값(px) — TownScene.jsx의
// DRAG_THRESHOLD_PX(8, 브리프 권장 범위 6~8px 상단값)와 동일 값. Stage 1은
// 경쟁하는 드래그 제스처가 없어(아이템 드래그 배치 없음) 그 파일의 전체
// pending/dragging 상태 머신까지는 필요 없다 — down/up 두 지점 거리 비교로
// 충분하다(팀장 지시 — "단순 click/pointerup 임계값 체크로 충분").
const DRAG_THRESHOLD_PX = 8

// 세계 좌표(0~100 %) 경계 — TownScene.jsx의 clampPct(Math.max(2,
// Math.min(98, v)))와 동일 값을 그대로 재사용한다(새 경계를 발명하지 않는다).
function clampPct(v) {
  return Math.max(2, Math.min(98, v))
}

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

  function walkTo(leftPct, topPct) {
    clearWalkTimer()
    setCharacter({ phase: 'walking', leftPct, topPct })
    const duration = reducedMotion ? REDUCED_MOTION_TRANSITION_MS : WALK_TRANSITION_MS
    walkTimerRef.current = setTimeout(() => {
      walkTimerRef.current = null
      setCharacter((cur) => (cur.leftPct === leftPct && cur.topPct === topPct ? { ...cur, phase: 'idle' } : cur))
    }, duration)
  }

  // 언마운트 시 예약된 타이머 정리(setState-after-unmount 방지, TownScene.jsx
  // interactionTimerRef cleanup과 동일 관례).
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
    const leftPct = clampPct(((e.clientX - rect.left) / rect.width) * 100)
    const topPct = clampPct(((e.clientY - rect.top) / rect.height) * 100)
    walkTo(leftPct, topPct)
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
          ⓘ 2.5D 프로토타입 (Stage 1)
        </button>
        {infoOpen && (
          <p className="rounded-xl bg-white/90 px-3 py-2 text-[11px] text-gray-500 shadow max-w-[220px]">
            바닥을 탭하면 캐릭터가 걸어갑니다. 실제 아트/저장 기능 없는
            내부 프로토타입입니다.
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
