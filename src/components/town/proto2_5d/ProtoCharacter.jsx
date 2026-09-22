// src/components/town/proto2_5d/ProtoCharacter.jsx — Paul Town 2.5D 캐릭터
// 프로토타입(Stage 1, 2026-09-22) 캐릭터 프레젠테이션.
//
// 기존 src/components/town/v2/TownCharacter.jsx(벤치 앉기 파일럿)를 import도
// 수정도 하지 않는다 — 그 파일이 쓰는 "이모지 + 흐린 그림자 타원" 폴백
// 시각 언어(docs/design/town/ASTRA_ASSET_AUDIT_2026-09-21.md §5.6이 확인한
// 이 저장소의 기존 "캐릭터 아트 없음" 관례)만 새 파일로 복제한다. 순수
// 프레젠테이션(phase/좌표만 받는다) — walk 타이밍/포인터 처리는
// Proto25DScreen.jsx가 소유한다(소유권 분리, TownCharacter.jsx와 동일 정신).
//
// 캐릭터 아트 — ★플레이스홀더, 실제 아트 필요★. src/assets/paul/*.png는
// 대화상자용 대형 얼굴/상반신 리액션이라 지도 아이콘 크기로 축소하면
// 원근/프레이밍이 안 맞아(위 감사 문서 §5.6) 재사용하지 않는다. 실제
// 캐릭터 아트가 생기면 이 파일 하나만 바꾸면 된다.
//
// TownCharacter.jsx와 달리 이 캐릭터는 마운트 시점부터 씬이 살아있는 한
// 계속 마운트돼 있다(항상 보임, Stage 1 요구사항) — 그래서 TownCharacter가
// 쓰는 "2-프레임 rAF로 시작좌표 강제 후 다음 프레임에 목표로 이동" 기법이
// 필요 없다. 그 기법은 새로 DOM에 삽입되는 노드가 같은 커밋에서 시작좌표와
// transition을 동시에 갖게 되는 경우에만 필요하다(브라우저는 새로 삽입된
// 노드의 "첫 스타일 적용"은 절대 transition하지 않는다 — 전이할 이전 상태가
// 없으므로). 이 캐릭터는 항상 기존 DOM 노드이므로 좌표 state가 바뀌면
// 이미 걸려 있는 CSS transition이 그대로, 별다른 기법 없이 정상 관측된다.

// 걷기 이동 transition 시간 — TownCharacter.jsx의 CHARACTER_WALK_MS(650ms)와
// 동일 값(새 타이밍을 발명하지 않는다, 두 프로토타입이 서로 다른 "걷는
// 느낌"을 주지 않게).
export const WALK_TRANSITION_MS = 650
// reduced-motion에서의 이동 transition 시간 — TownCharacter.jsx의
// CHARACTER_FADE_MS(220ms)와 동일 값. 0ms(순간이동)는 "목적지 변화를 이해할
// 수 있어야 한다"는 스펙 요구를 깨므로, 아주 짧지만 0은 아닌 값을 쓴다.
export const REDUCED_MOTION_TRANSITION_MS = 220

export default function ProtoCharacter({ phase, leftPct, topPct, reducedMotion }) {
  const isWalking = phase === 'walking'
  const durationMs = reducedMotion ? REDUCED_MOTION_TRANSITION_MS : WALK_TRANSITION_MS
  // motion-safe: 접두사가 prefers-reduced-motion을 CSS 미디어 쿼리 레벨에서
  // 이미 걸러준다(idle 숨쉬기/걷기 bob 둘 다 reduced-motion에서 자동으로
  // 꺼짐, JS 분기 불필요) — 인라인 left/top transition만 JS(reducedMotion
  // prop)로 직접 분기해야 한다(Tailwind 유틸리티가 아닌 인라인 style이라
  // motion-safe:가 적용되지 않으므로, TownCharacter.jsx와 동일 관례).
  const idleOrWalkClass = isWalking ? ' motion-safe:animate-town-walk-bob' : ' motion-safe:animate-town-cat-idle'

  return (
    <div
      aria-hidden="true"
      data-proto-character=""
      data-character-phase={phase}
      className="absolute pointer-events-none"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: '8%',
        transform: 'translate(-50%, -100%)',
        transition: `left ${durationMs}ms ease-in-out, top ${durationMs}ms ease-in-out`,
        zIndex: 500,
      }}
    >
      {/* bob/숨쉬기는 안쪽 엘리먼트에만 건다 — 바깥 div의 transform은 앵커
          위치(translate(-50%,-100%))를 소유하므로, 같은 엘리먼트에 keyframe
          animation을 얹으면 그 transform을 대체해 앵커가 깨진다
          (TownCharacter.jsx와 동일 관례). 높이를 고정하지 않는다(w-full만,
          h-full/aspect-ratio 없음) — TownCharacter.jsx와 동일하게 글리프
          텍스트 크기에 맞춰 상자가 저절로 줄어들어야(shrink-wrap) 그림자
          (absolute bottom-0)가 글리프 발밑에 바로 붙는다. 고정 aspect-ratio를
          썼더니 글리프가 상자 중앙에 뜨고 그림자만 훨씬 아래에 남는 육안
          결함이 실측 스크린샷에서 확인돼(2026-09-22 Phase 4 시각 게이트)
          이 방식으로 되돌렸다. */}
      <div className={`relative w-full pointer-events-none${idleOrWalkClass}`}>
        <span aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-2 rounded-full bg-[#1e2a5a]/15 blur-[2px]" />
        <span
          aria-hidden="true"
          className="relative inline-flex items-center justify-center w-full leading-none drop-shadow-sm text-[clamp(1.4rem,7vw,2.2rem)]"
        >
          🚶
        </span>
      </div>
    </div>
  )
}
