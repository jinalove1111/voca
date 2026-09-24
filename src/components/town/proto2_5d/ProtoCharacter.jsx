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
//  - sitBenchHeightPx(number, 선택, 2026-09-23 좌석 접촉점 sink 보정 추가분)
//    — 'sitting' 동안 Proto25DScreen.jsx가 benchRenderedSizePx(BENCH,
//    groundWidthPx).heightPx(스크린 px, 캐릭터의 depth-scale과 무관한 실제
//    벤치 렌더 크기)를 넘긴다. 아래 seatSinkLocalPx 호출부가 이 값을
//    scale로 나눠 "로컬(스케일 적용 전)" 단위로 환산한 뒤 sink 상한 계산에
//    쓴다(벤치는 캐릭터처럼 depth-scale을 받지 않으므로 좌표계가 다르다 —
//    "왜 로컬 단위인가"는 아래 measureGlyphInk 주석 참고). 없으면(walking/
//    idle/leaving, 또는 측정 실패) sink 상한을 생략한다(seatSinkLocalPx의
//    안전 폴백).
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { characterScale, characterZIndex } from '../../../utils/town/proto2_5d/depthVisual'
import { SEAT_FRACTION, SEAT_CONTACT_FRACTION, seatSinkLocalPx } from '../../../utils/town/proto2_5d/benchInteraction'
import { validateCharacterManifest, resolveCharacterVisual, stateKeyForPhase } from '../../../utils/town/proto2_5d/characterManifest'
import {
  validateSpriteManifest,
  resolveSpriteFrame,
  spriteFrameSources,
  spriteStateForPhase,
  FRAME_SEQUENCE_BY_STATE,
} from '../../../utils/town/proto2_5d/characterSpriteContract'

const CHARACTER_TRANSFORM_ORIGIN = '50% 100%'

// 착석 시각 보정(2026-09-23) — 글리프 잉크 경계 실측(로컬/depth-scale 적용
// 전 px). canvas measureText(textBaseline='top')의 actualBoundingBoxDescent가
// "박스 상단에서 잉크 하단까지 거리"를 직접 준다(Chromium에서 이모지 잉크
// 경계에 신뢰할 만한 값 — 팀장 지시). font-size는 getComputedStyle에서 읽는
// CSS 값(로컬, depth-scale transform과 무관 — transform은 레이아웃 속성을
// 바꾸지 않는다)을 그대로 canvas 폰트로 써서, 이 함수가 반환하는 모든 값이
// 항상 "스케일 적용 전" 좌표계로 통일되게 한다(benchInteraction.js
// seatSinkLocalPx의 "로컬 px" 계약과 일치). 캔버스/측정 실패(구형 브라우저
// 등)면 스펙 요구대로 span rect(font-size 자체)로 폴백 — 잉크가 박스를 거의
// 채운다고 보수적으로 가정해(inkTop=0, inkBottom=박스높이) sink를 과도하게
// 만들지 않는다.
function measureGlyphInk(spanEl) {
  if (!spanEl || typeof window === 'undefined') return null
  const cs = window.getComputedStyle(spanEl)
  const fontSizePx = parseFloat(cs.fontSize)
  if (!(fontSizePx > 0)) return null
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no-2d-context')
    ctx.font = `${fontSizePx}px ${cs.fontFamily}`
    ctx.textBaseline = 'top'
    const m = ctx.measureText(spanEl.textContent || '')
    if (!(m.actualBoundingBoxDescent > 0)) throw new Error('no-ink-metrics')
    return {
      glyphBoxHeightPx: fontSizePx, // leading-none — 라인박스 높이 = font-size
      inkTopPx: Math.max(0, -m.actualBoundingBoxAscent),
      inkBottomPx: m.actualBoundingBoxDescent,
    }
  } catch {
    return { glyphBoxHeightPx: fontSizePx, inkTopPx: 0, inkBottomPx: fontSizePx }
  }
}

// 모바일 시각 보정(2026-09-23) — 캐릭터 기준 폭에 px 하한을 둔다(390px
// 이하 뷰포트에서 8%는 ~30px 미만이라 글리프가 읽기 어려움). depth
// scale(s)은 여전히 이 기준 폭 위에 곱으로만 적용된다(요구사항 — "바닥은
// base에, depth 계약은 무변경"). CSS max()로 처리해 컨테이너 크기를 몰라도
// (이 컴포넌트는 순수 % 좌표만 다루는 프레젠테이션이라 실제 px 폭을 알
// 방법이 없다) 브라우저가 매 리사이즈마다 알아서 재계산한다.
const CHARACTER_MIN_WIDTH_PX = 40

// ── 그림자(모바일 시각 보정, 2026-09-23) ─────────────────────────────────
// 이전 버전은 그림자가 depth-scale 박스 *안*에 중첩돼 있어(위 파일 헤더
// Stage3 주석) scale(s, [0.55,1.20])로 함께 줄었는데, 그 시작 크기 자체가
// w-[85%] h-[5px]·alpha 0.10·blur 3px로 이미 작고 옅어서, 모바일 좁은
// 뷰포트(360~412px, 캐릭터 기준폭 8%가 실 px로 30px 안팎)에서는 더 줄어들
// 실 렌더 높이가 2~3px까지 떨어져 사실상 안 보이는 회귀였다(2026-09-23
// 실기기 프리뷰 실측 보고). 그림자를 depth-scale 박스의 *형제*(아래 return의
// 최상위 두 엘리먼트 중 하나)로 분리해, scale을 CSS transform이 아니라 이
// 컴포넌트가 이미 계산해 둔 `scale` 값으로 직접(퍼센트 폭에) 곱해 준다 —
// 그러면 픽셀 하한(max())을 그 곱셈 결과에 적용할 수 있어, depth에 따라
// 작아지는 건 유지하면서도 "완전히 안 보이는" 바닥까지는 가지 않는다.
//
// 정책(팀장 지시 — phase별로 명시) — idle/walking/leaving/sitting 전부에서
// 항상 보이고 발/좌석 앵커(leftPct/topPct, sitting 중엔 이미 benchSeatPoint
// 좌표)를 그대로 따라간다("sitting에서도 더 작은 그림자를 좌석 아래 유지"
// 선택지를 택함 — phase별 분기가 없어 상태 수만큼 로직이 늘지 않고, 좌석
// 좌표를 이미 leftPct/topPct가 그대로 담고 있어 추가 계산도 필요 없다).
const SHADOW_WIDTH_PCT_BASE = 6.8 // 캐릭터 기준폭(8%)의 85% — 기존 w-[85%] 비율 유지
const SHADOW_WIDTH_FLOOR_PX = 22
const SHADOW_HEIGHT_PCT_BASE = 1.0 // height%(컨테이너 세로 기준) — 폭 대비 납작한 타원을 목표로 실측 조정
const SHADOW_HEIGHT_FLOOR_PX = 6
const SHADOW_BLUR_PX = 3

// 걷기 이동 transition 시간 — TownCharacter.jsx의 CHARACTER_WALK_MS(650ms)와
// 동일 값(새 타이밍을 발명하지 않는다, 두 프로토타입이 서로 다른 "걷는
// 느낌"을 주지 않게).
export const WALK_TRANSITION_MS = 650
// reduced-motion에서의 이동 transition 시간 — TownCharacter.jsx의
// CHARACTER_FADE_MS(220ms)와 동일 값. 0ms(순간이동)는 "목적지 변화를 이해할
// 수 있어야 한다"는 스펙 요구를 깨므로, 아주 짧지만 0은 아닌 값을 쓴다.
export const REDUCED_MOTION_TRANSITION_MS = 220

// Phase 6A(2026-09-23, 캐릭터 스프라이트 어댑터, scripts/.tmp/
// p6a_C_sprite_contract.md 설계 그대로 구현 — 새 구조 발명 없음) — 프레임
// 애니메이션(walk 2프레임 이상) 재생용 아주 작은 훅. resolveCharacterVisual
// (characterManifest.js)은 순수 함수라 시간을 모르므로, "지금 몇 번째
// 프레임인지"는 이 컴포넌트 쪽에서 별도 타이머로 스테핑한다 — 기존 bob
// keyframe 애니메이션(CSS, 무한 반복)과는 완전히 독립적인 관심사(bob은 y축
// 흔들림, 이건 프레임 교체)라 서로 경합하지 않는다. reduced-motion이거나
// 프레임이 1개 이하면 항상 freezeFrameIndex로 고정(정지) — Stage 3의
// "reduced-motion에서도 depth/scale은 생략 안 함" 원칙과 같은 정신으로,
// 정지는 하되 state 자체(sit/walk 구분)는 여전히 보인다.
function useSpriteFrameIndex(framesLength, fps, reducedMotion, freezeFrameIndex) {
  const [frameIndex, setFrameIndex] = useState(freezeFrameIndex || 0)
  useEffect(() => {
    if (reducedMotion || !(framesLength > 1) || !(fps > 0)) {
      setFrameIndex(freezeFrameIndex || 0)
      return undefined
    }
    setFrameIndex(0)
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % framesLength)
    }, 1000 / fps)
    return () => clearInterval(id)
  }, [framesLength, fps, reducedMotion, freezeFrameIndex])
  return frameIndex
}

// Phase 6B(2026-09-24, v2 스프라이트 어댑터) — characterSpriteContract.js(v2,
// idle/walk-front/walk-back/walk-side/sit 8프레임 + 방향 계약)를 이 컴포넌트에
// "휴면" 상태로 연결한다. 오늘 어떤 프로덕션 호출부도 `spriteManifest` prop을
// 넘기지 않으므로(App.jsx는 Proto25DScreen에 어떤 prop도 넘기지 않는다) 아래
// v2 분기는 실제로는 항상 타지 않는다 — validateSpriteManifest(undefined).ok는
// 항상 false이고, resolveSpriteFrame은 그 경우 항상 {kind:'emoji',...}로
// 폴백한다(characterSpriteContract.js resolveSpriteFrame 헤더 주석).
//
// 우선순위 — v2(spriteManifest 유효) > v1(manifest 유효, Phase 6A) > emoji.
// v1 분기(아래 `isSprite`)와 emoji 분기는 이 작업에서 한 줄도 바꾸지 않는다
// (재구현 금지 — 이미 72개 유닛 테스트로 검증된 v1 계약을 그대로 둔다).
//
// 퍼센트 앵커(anchorOffsetPct) — v1의 spriteOffsetDx/Dy(px, 캔버스 크기를
// 알아야 계산 가능)와 달리, v2는 characterSpriteContract.js의
// anchorOffsetPct()가 이미 "캔버스 자신의 크기 대비 %"로 환산해 반환한다.
// 아래 v2 렌더 분기의 앵커 래퍼가 shrink-wrap된 <img>(width:100%, height:auto)
// 를 감싸므로, translate(dxPct%, dyPct%)의 %가 그 img 자신의 렌더 크기를
// 기준으로 계산돼 뷰포트/캔버스 원본 px와 무관하게 항상 정확하다(위 파일
// 헤더의 Stage 3 스케일 증명과 같은 "퍼센트는 항상 자기 자신의 박스 기준"
// 원리).

export default function ProtoCharacter({
  phase,
  leftPct,
  topPct,
  reducedMotion,
  facing = 1,
  depthY,
  sitBenchHeightPx,
  // Phase 6A — 선택적 캐릭터 스프라이트 매니페스트(characterManifest.js
  // 계약). 기본값 undefined — 오늘 어떤 호출부(Proto25DScreen.jsx)도 이
  // prop을 넘기지 않는다(실 스프라이트 아트 없음, ASTRA_HANDOFF_2026-09-21.md
  // §0-A) — 즉 validateCharacterManifest(undefined).ok는 항상 false이고
  // resolveCharacterVisual은 항상 {kind:'emoji',...}를 반환하므로, 아래
  // "무엇도 재배선하지 않는다"는 이 prop이 실제로 쓰이는 날까지는 100%
  // 사실이다(오늘의 DOM은 이 prop 추가 이전과 완전히 동일).
  manifest,
  // Phase 6B — 선택적 v2 스프라이트 매니페스트(characterSpriteContract.js
  // 계약, 위 파일 헤더 "Phase 6B" 주석 참고). 기본값 undefined — 오늘 어떤
  // 호출부도 넘기지 않는다.
  spriteManifest,
  // Phase 6B — 논리 방향('front'|'back'|'side', 기본 'front'). emoji/v1
  // 분기에서는 전혀 읽지 않는다(v2 렌더 분기 전용) — Proto25DScreen.jsx는
  // 모든 모드에서 이 prop을 계산해 넘기지만(방향 계산 자체는 이동 로직
  // 소관이라 항상 최신으로 유지), 시각적으로는 v2가 비활성일 때 아무 효과가
  // 없다.
  direction = 'front',
}) {
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

  // Phase 6A(2026-09-23, 캐릭터 스프라이트 어댑터) — manifest가 undefined/
  // 무효면 validation.ok는 항상 false이고 resolveCharacterVisual은 항상
  // {kind:'emoji', glyph}를 반환한다(위 glyph 변수와 완전히 동일한 규칙 —
  // characterManifest.js의 EMOJI_GLYPH_BY_STATE가 그 상수를 공유). 오늘
  // 어떤 호출부도 manifest를 넘기지 않으므로(위 prop 주석 참고) 이 블록은
  // 항상 emoji 경로로만 귀결되고 아래 렌더의 emoji 분기는 이 prop 추가
  // 이전과 100% 동일한 DOM을 만든다.
  const validation = useMemo(() => validateCharacterManifest(manifest), [manifest])
  const manifestStateKey = stateKeyForPhase(phase)
  const manifestState = validation.ok && manifest && manifest.states ? manifest.states[manifestStateKey] : null
  const spriteFramesLength = manifestState ? manifestState.frames.length : 0
  const spriteFps = manifestState && manifestState.fps > 0 ? manifestState.fps : 0
  const spriteFreezeFrameIndex = (manifest && manifest.reducedMotion && manifest.reducedMotion.freezeFrameIndex) || 0
  const spriteFrameIndex = useSpriteFrameIndex(spriteFramesLength, spriteFps, reducedMotion, spriteFreezeFrameIndex)
  const resolvedVisual = resolveCharacterVisual({ manifest, validation, phase, frameIndex: spriteFrameIndex })

  // 런타임 이미지 로드 실패 폴백(매니페스트 자체 유효성 검사와는 별도 —
  // 네트워크/파일 문제로 특정 프레임 이미지가 깨질 수 있다) — 이 마운트
  // 에서만 emoji로 강제한다. manifest 참조가 바뀌면(사실상 오늘은 발생하지
  // 않음 — 정적 import) 새 매니페스트에게 다시 기회를 준다.
  const [spriteLoadFailed, setSpriteLoadFailed] = useState(false)
  useEffect(() => { setSpriteLoadFailed(false) }, [manifest])
  const visual = spriteLoadFailed ? { kind: 'emoji', glyph } : resolvedVisual
  const isSprite = visual.kind === 'sprite'

  // Phase 6B — v2 스프라이트(characterSpriteContract.js). validateSpriteManifest
  // 는 절대 throw하지 않고(계약), spriteManifest가 undefined/무효면 ok는 항상
  // false다 — 오늘 어떤 호출부도 spriteManifest를 넘기지 않으므로 이 블록
  // 전체가 실제로는 항상 emoji 폴백으로 귀결된다(위 파일 헤더 "Phase 6B"
  // 주석). 훅은 조건부로 호출하지 않는다 — framesLength/fps를 "비활성일 때
  // 0"으로 계산해 항상 같은 순서로 useSpriteFrameIndex를 호출한다.
  const spriteValidation = useMemo(() => validateSpriteManifest(spriteManifest), [spriteManifest])
  const spriteV2StateKey = spriteStateForPhase(phase, direction)
  const spriteV2FramesLength = FRAME_SEQUENCE_BY_STATE[spriteV2StateKey]
    ? FRAME_SEQUENCE_BY_STATE[spriteV2StateKey].length
    : 0
  const spriteV2Active = Boolean(spriteManifest) && spriteValidation.ok === true
  const spriteV2Fps = spriteV2Active && spriteManifest.frameDurationMs > 0 ? 1000 / spriteManifest.frameDurationMs : 0
  const spriteV2FreezeFrameIndex = (spriteV2Active && spriteManifest.reducedMotion && spriteManifest.reducedMotion.freezeFrameIndex) || 0
  const spriteV2FrameIndex = useSpriteFrameIndex(spriteV2FramesLength, spriteV2Fps, reducedMotion, spriteV2FreezeFrameIndex)
  const spriteVisual = resolveSpriteFrame({
    manifest: spriteManifest,
    validation: spriteValidation,
    phase,
    direction,
    facing,
    frameIndex: spriteV2FrameIndex,
    reducedMotion,
  })

  // 런타임 이미지 로드 실패 폴백(v1의 spriteLoadFailed와 동일 정신, 별도
  // state — v1/v2가 서로 다른 이미지 소스를 쓰므로 실패 여부도 독립적이어야
  // 한다). spriteManifest 참조가 바뀌면 새 매니페스트에게 다시 기회를 준다.
  //
  // Phase 6D(2026-09-25): @2x 실패 시 1x 강등 → 그다음 이모지. 2단계
  // 폴백이라 state도 2개(spriteV2SrcSetFailed → srcSet 제거, spriteV2LoadFailed
  // → 이모지 최종 폴백)로 분리한다 — 아래 img onError 참고.
  const [spriteV2SrcSetFailed, setSpriteV2SrcSetFailed] = useState(false)
  const [spriteV2LoadFailed, setSpriteV2LoadFailed] = useState(false)
  useEffect(() => {
    setSpriteV2SrcSetFailed(false)
    setSpriteV2LoadFailed(false)
  }, [spriteManifest])
  const isSpriteV2 = !spriteV2LoadFailed && spriteVisual.kind === 'sprite'

  // 프리로드(a/b 프레임 교대 시 빈 프레임이 보이지 않도록) — DOM에 삽입하지
  // 않는다(new Image()는 오프스크린 엘리먼트, 브라우저 캐시에만 적재).
  useEffect(() => {
    if (!spriteV2Active || typeof Image === 'undefined') return undefined
    spriteFrameSources(spriteManifest).forEach((src) => {
      const img = new Image()
      img.src = src
    })
    return undefined
  }, [spriteV2Active, spriteManifest])

  // anchor-offset 래퍼(sprite 전용) — outer 앵커(translate(-50%,-100%))는
  // "박스 자신의 (w/2,h)가 (leftPct,topPct)로 간다"만 보장하므로, 고정
  // 캔버스의 실제 foot/seatAnchorPx가 그 점(w/2,h)과 정확히 일치하지 않을
  // 수 있는 차이만큼 자식 레이어에서 보정 이동한다(설계 문서 §3 그대로).
  const spriteFrame = isSprite ? visual.frame : null
  const spriteCanvasW = (spriteFrame && spriteFrame.w) || (manifest && manifest.frameCanvas && manifest.frameCanvas.w) || 0
  const spriteCanvasH = (spriteFrame && spriteFrame.h) || (manifest && manifest.frameCanvas && manifest.frameCanvas.h) || 0
  const spriteActiveAnchor = isSprite ? (isSitting ? visual.seatAnchorPx : visual.footAnchorPx) : null
  const spriteOffsetDx = spriteActiveAnchor ? spriteCanvasW / 2 - spriteActiveAnchor.x : 0
  const spriteOffsetDy = spriteActiveAnchor ? spriteCanvasH - spriteActiveAnchor.y : 0

  // 좌석 접촉점 sink(2026-09-23, "붕 뜬" 회귀 수정) — sitting에 들어갈 때(와
  // 그 동안의 리사이즈/기기 회전마다, clamp() 폰트 크기가 뷰포트 폭에
  // 의존하므로) 글리프 잉크 경계를 실측한다. isSitting이 아니면 측정하지
  // 않고(불필요한 DOM 작업 회피) 이전 측정값도 버린다(다음 착석 때 stale
  // 값을 쓰지 않도록).
  const glyphRef = useRef(null)
  const [inkMetrics, setInkMetrics] = useState(null)
  useLayoutEffect(() => {
    if (!isSitting) {
      setInkMetrics(null)
      return undefined
    }
    const measure = () => setInkMetrics(measureGlyphInk(glyphRef.current))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isSitting, glyph])

  // benchRenderedHeightPx(스크린 px, Proto25DScreen.jsx가 측정)를 이
  // 캐릭터의 depth-scale로 나눠 "로컬" 단위로 맞춘다(위 파일 헤더 주석
  // "sitBenchHeightPx" 항목 참고) — scale<=0은 이론상 발생하지 않지만
  // (characterScale이 항상 양수 범위로 클램프, depthVisual.js) 0-나눗셈
  // 방어로 가드한다.
  const benchRenderedHeightLocalPx = isSitting && sitBenchHeightPx > 0 && scale > 0
    ? sitBenchHeightPx / scale
    : undefined
  const sinkPx = isSitting && inkMetrics
    ? seatSinkLocalPx({
        glyphBoxHeightPx: inkMetrics.glyphBoxHeightPx,
        inkTopPx: inkMetrics.inkTopPx,
        inkBottomPx: inkMetrics.inkBottomPx,
        benchRenderedHeightLocalPx,
        seatFraction: SEAT_FRACTION,
        contactFraction: SEAT_CONTACT_FRACTION,
      })
    : 0

  // 모바일 시각 보정 — 그림자 크기는 depth scale(s)을 퍼센트에 직접 곱한
  // 뒤 px 하한을 max()로 강제한다(위 파일 상단 "그림자" 주석 참고). scale이
  // 작을수록(뒤로 갈수록) 퍼센트 값도 작아지지만, 하한 밑으로는 절대
  // 내려가지 않는다.
  const shadowWidthPct = SHADOW_WIDTH_PCT_BASE * scale
  const shadowHeightPct = SHADOW_HEIGHT_PCT_BASE * scale
  const shadowTransition = [`left ${durationMs}ms ease-in-out`, `top ${durationMs}ms ease-in-out`].join(', ')

  return (
    <>
      {/* 모바일 시각 보정 — 그림자를 depth-scale 박스(아래 data-proto-character
          div)의 *형제*로 분리한다(위 파일 상단 "그림자" 주석 참고). leftPct/
          topPct는 아래 캐릭터 박스와 완전히 동일한 값이라(둘 다 같은 props를
          읽음), 발 앵커(또는 sitting 중엔 좌석 앵커)를 정확히 따라간다.
          translate(-50%,-50%)로 이 점이 그림자 자신의 중심에 오게 한다(발
          앵커 위에 타원 중심이 얹히는 모양 — 아래 박스의 "발 앵커 =
          bottom-center" 앵커링과는 다른 기준점이라 -50%,-100%가 아니라
          -50%,-50%를 쓴다). */}
      <span
        aria-hidden="true"
        data-proto-character-shadow=""
        className="absolute rounded-full bg-[#1e2a5a]/20 pointer-events-none"
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `max(${shadowWidthPct}%, ${SHADOW_WIDTH_FLOOR_PX}px)`,
          height: `max(${shadowHeightPct}%, ${SHADOW_HEIGHT_FLOOR_PX}px)`,
          filter: `blur(${SHADOW_BLUR_PX}px)`,
          transform: 'translate(-50%, -50%)',
          transition: shadowTransition,
          zIndex,
        }}
      />
      <div
        aria-hidden="true"
        data-proto-character=""
        data-character-phase={phase}
        data-character-direction={direction}
        className="absolute pointer-events-none"
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `max(8%, ${CHARACTER_MIN_WIDTH_PX}px)`,
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
            텍스트 크기에 맞춰 상자가 저절로 줄어들어야(shrink-wrap) 발
            위치가 글리프 발밑에 바로 맞는다. 고정 aspect-ratio를 썼더니
            글리프가 상자 중앙에 뜨는 육안 결함이 실측 스크린샷에서 확인돼
            (2026-09-22 Phase 4 시각 게이트) 이 방식으로 되돌렸다. */}
        <div className={`relative w-full pointer-events-none${idleOrWalkClass}`}>
          {/* Stage 4 — facing 전용 레이어(위 헤더 주석 참고). 이 bob div(위
              className, 매 프레임 transform이 통째로 바뀌는 keyframe 애니메이션
              소유)의 *자식*으로 한 겹 더 끼워, static scaleX(-1)이 애니메이션과
              같은 엘리먼트의 transform을 두고 경합하지 않게 한다 — bob div
              자신은 계속 "이 캐릭터의 첫 번째 div"로 남아(townProto25d.spec.mjs
              S5의 `character.locator('div').first()` 기존 계약 무변경), 그
              내부에서 facing만 별도로 뒤집는다.
              2026-09-23 좌석 접촉점 sink 추가 — 이 레이어는 여전히 static(키
              프레임 애니메이션이 아닌, 렌더마다 결정론적으로 계산되는 값)이라
              위 문단의 "애니메이션과 경합하지 않는다" 전제가 그대로 유지된다.
              translateY(sinkPx)와 scaleX(-1)는 서로 다른 축만 건드려(하나는
              y, 하나는 x) 어느 순서로 합성해도 최종 결과가 같다(교환 가능) —
              순서를 신경 쓸 필요 없음. sinkPx는 sitting에서만 0이 아니다.
              Phase 6A — isSprite가 true일 때만 이 자리에 다른 하위 레이어가
              들어간다(아래 분기). isSprite는 manifest가 없으면 항상 false
              라(위 "Phase 6A" 주석 블록 참고) 이 분기 자체가 오늘은 절대
              타지 않는다 — emoji 쪽(else)은 이 prop 추가 이전과 완전히
              동일한 DOM/로직이다.
              Phase 6B — isSpriteV2가 true일 때는 v1/emoji보다 우선해서 이
              자리에 v2 스프라이트 레이어가 들어간다(맨 위 새 분기). spriteManifest
              가 없으면 항상 false라(위 "Phase 6B" 주석 블록 참고) 이 분기도
              오늘은 절대 타지 않는다 — v1/emoji 두 분기는 한 글자도 바뀌지
              않았다. */}
          {isSpriteV2 ? (
            <div
              style={{ transform: spriteVisual.mirrorX ? 'scaleX(-1)' : undefined }}
              data-proto-character-facing-layer=""
            >
              <div
                style={{ transform: `translate(${spriteVisual.anchorOffsetPct.dxPct}%, ${spriteVisual.anchorOffsetPct.dyPct}%)` }}
                data-proto-character-anchor-layer=""
              >
                <img
                  src={spriteVisual.src}
                  srcSet={spriteV2SrcSetFailed ? undefined : spriteVisual.srcSet}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  data-proto-character-sprite=""
                  data-proto-character-sprite-frame={spriteVisual.frameId}
                  data-proto-character-sprite-state={spriteVisual.state}
                  data-proto-character-sprite-mirror={spriteVisual.mirrorX ? '1' : '0'}
                  {...(spriteV2SrcSetFailed ? { 'data-proto-character-sprite-degraded': '1' } : {})}
                  onError={() => {
                    // 1단계: srcSet(@2x 후보 포함)이 있고 아직 강등 전이면
                    // srcSet만 제거하고 1x(src)로 재시도(같은 엘리먼트, 같은
                    // onError 재사용). 2단계: srcSet이 애초에 없었거나 이미
                    // 강등된 뒤에도 또 실패하면(1x도 깨짐) 최종적으로 이모지로
                    // 폴백한다.
                    if (!spriteV2SrcSetFailed && spriteVisual.srcSet) {
                      setSpriteV2SrcSetFailed(true)
                    } else {
                      setSpriteV2LoadFailed(true)
                    }
                  }}
                  style={{ display: 'block', width: '100%', height: 'auto', imageRendering: 'auto' }}
                />
              </div>
            </div>
          ) : isSprite ? (
            <div style={{ transform: facing === -1 ? 'scaleX(-1)' : undefined }}>
              {/* anchor-offset 래퍼 — footAnchorPx/seatAnchorPx가 프레임의
                  (w/2,h)와 정확히 일치하지 않을 수 있는 차이만큼만 보정
                  이동한다(설계 문서 §3). seatSinkLocalPx/measureGlyphInk는
                  이 경로에서 전혀 호출하지 않는다(§5 — sprite 모드는 매니페스트
                  가 이미 정답(접촉점)을 알고 있어 런타임 잉크 실측이
                  불필요해진다). */}
              <div style={{ transform: `translate(${spriteOffsetDx}px, ${spriteOffsetDy}px)` }}>
                <img
                  src={visual.src}
                  srcSet={visual.srcSet}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  data-proto-character-sprite=""
                  onError={() => setSpriteLoadFailed(true)}
                  style={{
                    display: 'block',
                    width: spriteFrame ? spriteFrame.w : undefined,
                    height: spriteFrame ? spriteFrame.h : undefined,
                    objectFit: manifest && manifest.sheet ? 'none' : 'contain',
                    objectPosition: manifest && manifest.sheet && spriteFrame ? `-${spriteFrame.x || 0}px -${spriteFrame.y || 0}px` : undefined,
                  }}
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                transform: [
                  sinkPx > 0 ? `translateY(${sinkPx}px)` : '',
                  facing === -1 ? 'scaleX(-1)' : '',
                ].filter(Boolean).join(' ') || undefined,
              }}
            >
              <span
                aria-hidden="true"
                ref={glyphRef}
                data-proto-character-glyph=""
                className="relative inline-flex items-center justify-center w-full leading-none drop-shadow-sm text-[clamp(1.4rem,7vw,2.2rem)]"
              >
                {glyph}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
