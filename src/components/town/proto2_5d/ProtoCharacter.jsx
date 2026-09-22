// src/components/town/proto2_5d/ProtoCharacter.jsx — Paul Town 2.5D 캐릭터
// 프로토타입(Stage 1 + Stage 3, 2026-09-22 + Stage 4, 2026-09-23) 캐릭터
// 프레젠테이션.
//
// Stage 4(벤치 walk-to-sit) 추가분 — facing/depthY 두 개의 선택적 prop만
// 얹는다(재구현 없음):
//  - facing(1|-1, 기본 1) — 좌우 미러링. 아래 JSX의 "facing 래퍼" 전용
//    중간 엘리먼트(새로 추가, outer 앵커/inner bob div 둘 다 아님)에만
//    static transform:scaleX(-1)로 건다. outer 앵커에 걸면 위 Stage3 스케일
//    증명(앵커가 항상 (0,0)으로 귀결)이 "s"가 스칼라라는 전제를 벗어나
//    다시 검증해야 하고, inner bob div에 걸면 그 div가 이미 키프레임
//    애니메이션으로 매 프레임 transform 전체를 새로 쓰므로(townWalkBob/
//    townCatIdle이 둘 다 `transform:` 축약형을 씀, tailwind.config.js) 정적
//    inline transform이 애니메이션 프레임마다 덮여 사라진다(이 파일이 원래
//    bob을 outer 앵커와 분리해 둔 것과 같은 이유의 충돌). 그래서 outer(위치/
//    스케일 전용)와 inner(bob 애니메이션 전용) 사이에 facing 전용 레이어를
//    하나 더 끼워 넣는다 — 이 레이어는 static scaleX(-1)만 소유하고 절대
//    애니메이션되지 않으므로 위 두 충돌 모두를 피한다.
//  - depthY(number, 선택) — 주어지면 z-index 계산에 topPct 대신 이 값을
//    쓴다(스케일은 여전히 topPct 기준 — 시각적 크기는 실제 위치를 따라야
//    자연스럽다). Proto25DScreen.jsx가 'sitting' 단계에서만 벤치의 y1을
//    넘겨 캐릭터가 항상 벤치보다 앞에 렌더되도록 강제한다(착석 좌표
//    benchSeatPoint의 y가 벤치 y1보다 작아 topPct 그대로 쓰면 depthKey가
//    더 작아져 오히려 벤치 뒤로 밀려나기 때문 — depthOrder.js는 y가 작을수록
//    더 뒤로 배정하는 모델이라, "벤치 위에 앉아 있다"는 논리적 사실과
//    "벤치보다 화면 앞에 그려져야 한다"는 시각 요구가 seat.y 하나만으로는
//    동시에 만족되지 않는다. 새 depth 모델을 만들지 않고, 이미 있는
//    characterZIndex(y)에 넣는 y 값만 상황별로 고르는 최소 변경으로 해결).
//
// Stage 3(Y-기반 스케일 + depth occlusion) — depthVisual.js(신규,
// worldContract.depthScale/depthOrder.cssZIndex에 위임만 하는 순수 헬퍼)를
// 통해 topPct(발 앵커 y)로부터 매 렌더 스케일/z-index를 파생한다. 새 스케일
// 공식/새 depth 모델은 없다 — 이미 배치 아이템/TownCharacter.jsx가 쓰는
// 것과 동일한 depthScale을 재사용하고, z-index는 depthOrder.js의
// 'character' 레이어(Stage 3에 추가, 콘텐츠 티어 내부 Y-랭킹)로 계산한다.
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
//
// Stage 3 스케일 합성 — 왜 bob(아래 JSX 주석)과 다른 방식인가: bob은 별도
// keyframe *애니메이션*(무한 반복, 좌표 state와 무관하게 계속 도는 CSS
// animation)이라 그 자체가 transform을 소유해야 해서 앵커 소유 엘리먼트와
// 분리했다. 반면 Y-기반 스케일은 좌표(topPct)에서 결정론적으로 파생되는
// 값이고 애니메이션이 아니라 "transform 안의 값 하나"일 뿐이다 — bob처럼
// 경쟁하는 별도 CSS animation이 아니므로, 앵커(translate(-50%,-100%))를
// 소유한 바로 그 엘리먼트의 같은 transform 문자열에 scale()을 이어 붙여도
// 그 앵커를 대체/충돌시키지 않는다(오히려 별도 엘리먼트로 분리하면 스케일이
// 발 앵커가 아니라 그 하위 박스의 중심을 기준으로 일어나 발이 좌우로
// 미끄러져 보이는 문제가 생긴다). transformOrigin을 '50% 100%'(박스 자신의
// 하단-중앙, translate(-50%,-100%)가 겨냥하는 것과 동일한 로컬 좌표)로
// 맞추면, CSS가 transform-origin을 "리스트 전체"에 적용하므로(개별 함수가
// 아니라) 스케일 값이 무엇이든 이 로컬 앵커점은 항상 정확히 (left%,top%)로
// 귀결된다(발이 고정된 채로 몸통만 자라거나 줄어든다) — 증명: 로컬 좌표
// p=origin(박스 자신의 (w/2,h))일 때 합성 변환 결과는 origin + t(고정
// translate 벡터, %는 박스 자신의 크기 기준이라 origin과 무관) = (w/2,h) +
// (-w/2,-h) = (0,0) = 박스 자신의 top-left(=CSS left/top이 배치하는 바로 그
// 점) — s에 전혀 의존하지 않는다. 그림자(아래 JSX)는 이 스케일된 박스 안에
// 그대로 중첩돼 있어 별도 계산 없이 캐릭터와 함께 자동으로 스케일된다.
import { characterScale, characterZIndex } from '../../../utils/town/proto2_5d/depthVisual'

const CHARACTER_TRANSFORM_ORIGIN = '50% 100%'

// 걷기 이동 transition 시간 — TownCharacter.jsx의 CHARACTER_WALK_MS(650ms)와
// 동일 값(새 타이밍을 발명하지 않는다, 두 프로토타입이 서로 다른 "걷는
// 느낌"을 주지 않게).
export const WALK_TRANSITION_MS = 650
// reduced-motion에서의 이동 transition 시간 — TownCharacter.jsx의
// CHARACTER_FADE_MS(220ms)와 동일 값. 0ms(순간이동)는 "목적지 변화를 이해할
// 수 있어야 한다"는 스펙 요구를 깨므로, 아주 짧지만 0은 아닌 값을 쓴다.
export const REDUCED_MOTION_TRANSITION_MS = 220

export default function ProtoCharacter({ phase, leftPct, topPct, reducedMotion, facing = 1, depthY }) {
  const isWalking = phase === 'walking'
  const isSitting = phase === 'sitting'
  const durationMs = reducedMotion ? REDUCED_MOTION_TRANSITION_MS : WALK_TRANSITION_MS
  // motion-safe: 접두사가 prefers-reduced-motion을 CSS 미디어 쿼리 레벨에서
  // 이미 걸러준다(idle 숨쉬기/걷기 bob 둘 다 reduced-motion에서 자동으로
  // 꺼짐, JS 분기 불필요) — 인라인 left/top transition만 JS(reducedMotion
  // prop)로 직접 분기해야 한다(Tailwind 유틸리티가 아닌 인라인 style이라
  // motion-safe:가 적용되지 않으므로, TownCharacter.jsx와 동일 관례).
  const idleOrWalkClass = isWalking ? ' motion-safe:animate-town-walk-bob' : ' motion-safe:animate-town-cat-idle'

  // Stage 3 — depthVisual.js(worldContract.depthScale/depthOrder.cssZIndex에
  // 위임만 하는 순수 헬퍼)로 매 렌더 topPct(발 앵커 y)에서 스케일/z-index를
  // 다시 계산한다. reduced-motion에서도 이 계산 자체는 절대 건너뛰지 않는다
  // (운영자 지시 — "필수 정보인 depth/scale까지 제거하면 안 된다") — 오직
  // 아래 transitionParts의 transform 보간 시간만 reduced-motion이면 더 짧아질
  // 뿐, 최종 scale/zIndex 값은 reducedMotion과 무관하게 항상 동일한 공식으로
  // 계산된 정확한 값이다.
  const scale = characterScale(topPct)
  const zIndex = characterZIndex(depthY != null ? depthY : topPct)
  const transitionParts = [
    `left ${durationMs}ms ease-in-out`,
    `top ${durationMs}ms ease-in-out`,
    `transform ${durationMs}ms ease-in-out`,
  ]
  // Stage 4 — ★플레이스홀더, 실제 아트 필요★. 앉은 상태를 구분할 실제
  // 캐릭터 아트가 없어 이모지를 하나 더 바꿔 끼우는 최소 표시만 한다(위
  // 파일 헤더의 플레이스홀더 원칙과 동일).
  const glyph = isSitting ? '🧘' : '🚶'

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
        transform: `translate(-50%, -100%) scale(${scale})`,
        transformOrigin: CHARACTER_TRANSFORM_ORIGIN,
        transition: transitionParts.join(', '),
        zIndex,
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
        {/* Stage 4 — facing 전용 레이어(위 헤더 주석 참고). 이 bob div(위
            className, 매 프레임 transform이 통째로 바뀌는 keyframe 애니메이션
            소유)의 *자식*으로 한 겹 더 끼워, static scaleX(-1)이 애니메이션과
            같은 엘리먼트의 transform을 두고 경합하지 않게 한다 — bob div
            자신은 계속 "이 캐릭터의 첫 번째 div"로 남아(townProto25d.spec.mjs
            S5의 `character.locator('div').first()` 기존 계약 무변경), 그
            내부에서 facing만 별도로 뒤집는다. 이 div는 static이라(position
            지정 없음) 아래 그림자 span의 absolute 기준(가장 가까운 positioned
            조상)은 여전히 바깥 bob div 그대로다(레이아웃 영향 없음). */}
        <div style={{ transform: facing === -1 ? 'scaleX(-1)' : undefined }}>
          {/* Stage 4 — 그림자 정제(더 납작하고 옅고 부드럽게). foot-anchor
              (absolute bottom-0 left-1/2 -translate-x-1/2)는 그대로 유지해
              Stage 3 스케일을 그대로 상속한다. pointer-events-none은 조상
              (outer/inner 둘 다 pointer-events-none)에서 이미 상속되지만,
              "그림자를 클릭해도 바닥 이동 판정을 가로채지 않는다"는 계약을
              이 엘리먼트 자체에도 명시적으로 걸어 둔다(상속에만 의존하지
              않음). */}
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[85%] h-[5px] rounded-full bg-[#1e2a5a]/10 blur-[3px] pointer-events-none"
          />
          <span
            aria-hidden="true"
            className="relative inline-flex items-center justify-center w-full leading-none drop-shadow-sm text-[clamp(1.4rem,7vw,2.2rem)]"
          >
            {glyph}
          </span>
        </div>
      </div>
    </div>
  )
}
