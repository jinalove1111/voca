// src/components/town/v2/TownCharacter.jsx — Paul Town V2 아이템 상호작용
// 캐릭터(2026-09-21, 벤치 앉기 파일럿).
//
// townInteractions.js ITEM_INTERACTIONS이 등록한 아이템(현재 벤치 하나)을
// idle 모드에서 탭하면 TownScene.jsx가 소유한 상태 머신(idle -> walking ->
// sitting -> leaving -> idle)이 이 컴포넌트 하나를 마운트/언마운트한다 —
// 이 파일 자신은 타이밍을 전혀 모르고, 매 렌더 그 순간의 phase/좌표만
// 받아 그리는 순수 프레젠테이션이다(상태 소유는 TownScene.jsx, V1
// TownGrid/openPlacementId와 동일 정신 — 소유권 분리).
//
// 캐릭터 아트 — ★플레이스홀더, 실제 아트 필요★. 이 저장소엔 "지도용
// 소형 전신" 에셋이 아직 없다 — src/assets/paul/index.js는 PaulGuide.jsx
// 대화상자용 대형 얼굴/상반신 리액션 PNG뿐이라(HeroReaction 컴포넌트
// 전용, 지도 아이콘 크기로 축소하면 "줄어든 큰 얼굴"처럼 보여 부적절)
// 여기서 재사용하지 않는다. 대신 TownSprite.jsx가 미등록 자산에 이미
// 쓰는 "이모지 + 흐린 그림자 타원" 폴백 패턴을 그대로 재사용한다(새
// 시각 언어를 발명하지 않는다). 실제 캐릭터 아트가 생기면 이 파일
// 하나만 바꾸면 된다 — 호출부(TownScene.jsx)는 phase/좌표만 안다.
import { useEffect, useState } from 'react'
import { placedItemWidthPct } from '../../../utils/town/worldRender'
import { CHARACTER_Z } from './sceneZ'

// 걷기(비-reduced-motion에서만) 좌/우 이동에 걸리는 시간 — TownScene.jsx가
// 상태 머신의 'walking' 보유 시간으로도 그대로 재사용한다(두 파일이 서로
// 다른 값을 쓰면 위치 transition이 끝나기 전에 'sitting'으로 전환돼
// 점프처럼 보인다 — 값을 export해 단일 원천으로 공유).
export const CHARACTER_WALK_MS = 650
// 등장/퇴장 opacity fade 시간 — reduced-motion에서도 동일하게 쓴다("아주
// 짧은 fade"라는 스펙 요구를 이미 만족하는 값이라 별도로 더 줄이지
// 않는다). TownScene.jsx가 'leaving' 보유 시간으로도 재사용한다.
export const CHARACTER_FADE_MS = 220

export default function TownCharacter({
  phase, startLeftPct, startTopPct, targetLeftPct, targetTopPct, depthY, reducedMotion,
}) {
  const isWalking = phase === 'walking' && !reducedMotion
  const [pos, setPos] = useState(() => (
    isWalking ? { left: startLeftPct, top: startTopPct } : { left: targetLeftPct, top: targetTopPct }
  ))
  // 등장 fade(항상, reduced-motion 포함) — mount 직후엔 opacity 0, 다음
  // 프레임에 1로 올려 fade-in transition이 실제로 재생되게 한다(reduced-
  // motion에서는 걷기 단계 자체가 없어 이 fade가 "이미 앉은 채 짧게
  // 나타난다"는 스펙 요구를 그대로 구현한다).
  const [visible, setVisible] = useState(false)

  // phase가 바뀔 때(walking -> sitting -> leaving)만 좌표를 갱신한다 —
  // 'walking'으로 처음 진입할 때만 시작점으로 순간 이동한 뒤 다음
  // 프레임에 목표(벤치 옆 착석 지점)로 옮겨 CSS left/top transition이
  // 실제 "걷기"로 보이게 한다(mount와 목표 이동을 같은 페인트에서 하면
  // transition이 관측되지 않는다 — 표준 2-프레임 기법). reduced-motion
  // 이거나 phase가 이미 walking이 아니면 곧바로 목표 좌표(=벤치 착석
  // 지점)로 고정한다(걷기 transition 없음 — 스펙 요구).
  useEffect(() => {
    if (phase === 'walking' && !reducedMotion) {
      setPos({ left: startLeftPct, top: startTopPct })
      const raf = requestAnimationFrame(() => setPos({ left: targetLeftPct, top: targetTopPct }))
      return () => cancelAnimationFrame(raf)
    }
    setPos({ left: targetLeftPct, top: targetTopPct })
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reducedMotion, startLeftPct, startTopPct, targetLeftPct, targetTopPct])

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // 벤치(sm 발자국)와 동일한 depth-scale 계산을 그대로 재사용한다(새 depth
  // 공식을 만들지 않는다) — 캐릭터는 벤치 옆으로 오프셋되어 그려지므로
  // (TownScene.jsx의 targetLeftPct 계산) 같은 'sm' 크기라도 벤치 전체를
  // 덮지 않는다.
  const widthPct = placedItemWidthPct('sm', depthY)
  const opacity = phase === 'leaving' ? 0 : (visible ? 1 : 0)
  const transitionParts = [`opacity ${CHARACTER_FADE_MS}ms ease-out`]
  if (!reducedMotion) transitionParts.push(`left ${CHARACTER_WALK_MS}ms ease-in-out`, `top ${CHARACTER_WALK_MS}ms ease-in-out`)

  return (
    <div
      aria-hidden="true"
      data-town-character=""
      data-character-phase={phase}
      className="absolute pointer-events-none"
      style={{
        left: `${pos.left}%`,
        top: `${pos.top}%`,
        width: `${widthPct}%`,
        transform: 'translate(-50%, -100%)',
        transition: transitionParts.join(', '),
        opacity,
        zIndex: CHARACTER_Z,
      }}
    >
      {/* bob은 이 안쪽 엘리먼트에만 건다 — 바깥 div의 transform은 앵커
          위치(translate(-50%,-100%))를 소유하므로, 같은 엘리먼트에
          keyframe animation을 얹으면 그 transform을 대체해 앵커가
          깨진다(TownObjectLayer.jsx의 wrapper/button transform 분리와
          동일 관례). */}
      <div className={`relative w-full h-full pointer-events-none${isWalking ? ' motion-safe:animate-town-walk-bob' : ''}`}>
        <span aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-2 rounded-full bg-[#1e2a5a]/15 blur-[2px]" />
        <span
          aria-hidden="true"
          className="relative inline-flex items-center justify-center w-full h-full leading-none drop-shadow-sm text-[clamp(1.4rem,7vw,2.2rem)]"
        >
          🧒
        </span>
      </div>
    </div>
  )
}
