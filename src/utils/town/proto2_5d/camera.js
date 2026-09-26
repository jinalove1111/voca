// src/utils/town/proto2_5d/camera.js — Paul Town 2.5D 캐릭터 프로토타입
// (paulTown2_5d, 기본 false) "산책 모드" v1(2026-09-26) 카메라 순수 함수.
//
// 지금까지 이 프로토타입의 "바닥(ground)"은 항상 뷰포트 전체와 정확히
// 같은 크기였다(WORLD 100x190 종횡비를 그대로 aspectRatio로 강제,
// Proto25DScreen.jsx 헤더 주석 참고) — 즉 "세계 = 화면"이라 카메라라는
// 개념 자체가 없었다. 산책 모드는 이 전제를 깨고 세계를 뷰포트보다 크게
// 그린 뒤(overscan), 캐릭터를 따라가는 카메라(translate)를 도입한다.
// 기존 걷기/충돌/좌석/깊이/스프라이트 로직은 전부 "world-% 좌표" 기준으로
// 이미 뷰포트 크기와 무관하게 동작하므로(walkGrid.js/pathfinding.js/
// benchInteraction.js/depthVisual.js 전부 순수 world-% 함수) 이 모듈은
// 그 위에 "world px 크기 계산"과 "카메라 위치 계산"만 순수 함수로 얹는다
// (재구현 없음 — CLAUDE.md 규칙 3).
//
// React/DOM 의존성 0(순수 함수만, Proto25DScreen.jsx가 rAF 루프 안에서
// 소비). worldContract.js WORLD 상수 1개만 좌표계 원점으로 재사용한다
// (walkGrid.js와 동일 관례).
import { WORLD } from '../worldContract'

// 오버스캔 배율 — 세계를 뷰포트보다 이만큼 크게 그린다(가로/세로 동일
// 배율, WORLD.h/WORLD.w 종횡비는 항상 유지). 1.6은 팀장 지시 값(운영자
// 승인 설계) — 모바일 세로 화면에서도 캐릭터 주변에 뷰포트 밖 여백이
// 충분히 남아 "산책하는 느낌"을 주면서, 데스크톱 와이드 화면에서 세계
// 폭이 뷰포트 폭보다 지나치게 좁아지지 않는 절충값(재도출 없음).
export const WALK_OVERSCAN = 1.6

// computeWorldSizePx — 뷰포트 px 크기 + 오버스캔 배율로부터 "세계"(ground
// 엘리먼트가 실제로 렌더될) px 크기를 계산한다. WORLD.w:WORLD.h(100:190)
// 종횡비를 항상 유지한다(worldContract.js 헤더 주석 — 새 좌표계 재정의
// 금지). unit은 "세계가 뷰포트를 오버스캔 배율만큼 덮는 데 필요한 세계
// 가로 폭(px)"으로, 가로/세로 중 더 제약적인 축(min)을 기준으로 삼는다
// (더 넓은 화면 비율에서 세로가 남아돌지 않게, 더 좁은 화면 비율에서
// 가로가 남아돌지 않게 — letterbox 없이 항상 뷰포트 전체를 덮는다).
// 입력이 non-finite/0 이하이면(측정 실패, 마운트 직후 ResizeObserver
// 발화 전 등) {worldW:0, worldH:0}으로 안전 폴백한다(호출부가 이 값으로
// 루프를 시작하지 않게 가드).
export function computeWorldSizePx({ viewportW, viewportH }, overscan = WALK_OVERSCAN) {
  if (
    !Number.isFinite(viewportW) || !Number.isFinite(viewportH) ||
    !Number.isFinite(overscan) || viewportW <= 0 || viewportH <= 0 || overscan <= 0
  ) {
    return { worldW: 0, worldH: 0 }
  }
  const ratio = WORLD.h / WORLD.w // 세로:가로 비율(1.9) — worldContract.js WORLD 그대로.
  const unit = Math.min(viewportW, viewportH / ratio) * overscan
  return { worldW: unit, worldH: unit * ratio }
}

// computeCameraTarget — 캐릭터의 world px 위치(발 앵커, charX/charY)를
// 뷰포트 중앙에 오게 하되 세계 경계 밖을 보여주지 않도록 클램프한 카메라
// 목표 위치(translate에 쓸 -x,-y의 양수 오프셋)를 반환한다. 세계가
// 뷰포트보다 좁은 축은(데스크톱 와이드 화면의 가로축 등) 캐릭터를 따라가지
// 않고 항상 중앙 정렬한다(오프셋이 음수가 되어 letterbox 여백이 좌우/
// 상하에 균등하게 남는다 — 팀장 지시 "world <= viewport → 중앙 정렬"
// 그대로). 축마다 독립적으로 계산(가로/세로 서로 영향 없음). 입력이
// non-finite면 그 축은 0(카메라 이동 없음)으로 안전 폴백한다.
export function computeCameraTarget({ charX, charY, viewportW, viewportH, worldW, worldH }) {
  return {
    x: cameraAxisTarget(charX, viewportW, worldW),
    y: cameraAxisTarget(charY, viewportH, worldH),
  }
}

function cameraAxisTarget(charPos, viewport, world) {
  if (!Number.isFinite(charPos) || !Number.isFinite(viewport) || !Number.isFinite(world)) return 0
  if (world <= viewport) return (world - viewport) / 2 // <=0 — 중앙 정렬(letterbox).
  const clamped = Math.min(Math.max(charPos - viewport / 2, 0), world - viewport)
  return clamped
}

// lerp — 표준 선형 보간(교환 없음, a→b 방향 고정).
export function lerp(a, b, t) {
  return a + (b - a) * t
}

// CAMERA_LERP — 매 프레임 목표로 수렴하는 비율(0~1, 클수록 즉각 반응·
// 작을수록 부드럽게 뒤따라옴). 0.15는 팀장 지시 값 — 캐릭터가 걷는 구간
// (WALK_TRANSITION_MS=650ms, ProtoCharacter.jsx) 동안 카메라가 눈에 띄게
// 뒤처지지 않으면서도 순간이동처럼 보이지 않는 절충값(재도출 없음).
export const CAMERA_LERP = 0.15

// stepCamera — 이전 카메라 위치(prev)에서 목표(target)로 t 비율만큼
// 보간한다. 지수적 감쇠(lerp)는 수학적으로 정확히 0에 수렴하지 않으므로
// (매 프레임 남은 거리의 (1-t)배만 남는다), 두 축 모두 목표와의 거리가
// 0.5px 미만이면 목표를 그대로 반환해(스냅) rAF 루프가 무한히 미세하게
// 흔들리지 않고 실제로 "정지"할 수 있게 한다(reduced-motion에서 t=1을
// 넘기면 이 스냅 없이도 첫 프레임에 정확히 도달 — 아래 호출부 참고).
export function stepCamera(prev, target, t = CAMERA_LERP) {
  const next = { x: lerp(prev.x, target.x, t), y: lerp(prev.y, target.y, t) }
  if (Math.abs(next.x - target.x) < 0.5 && Math.abs(next.y - target.y) < 0.5) {
    return { x: target.x, y: target.y }
  }
  return next
}

// 산책 모드 on/off 사용자 선호 — localStorage에 남기되(세션을 넘어 유지,
// HUD 토글이 값을 직접 쓴다) 값이 없거나(최초 방문) 손상된 값이면 항상
// ON으로 기본값을 잡는다(팀장 지시 — "기본 ON"). 저장소 접근은 항상
// try/catch로 감싼다(privacy 모드/квота 초과 등으로 localStorage 자체가
// 던질 수 있는 환경 — 이 저장소의 다른 localStorage 접근부와 동일 관례,
// 예: readDebugOverlaysEnabled의 URLSearchParams try/catch).
export const WALK_MODE_STORAGE_KEY = 'paulEasyVoca_proto25dWalkMode'

export function readWalkModePreference(storage) {
  try {
    if (!storage) return true
    return storage.getItem(WALK_MODE_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function writeWalkModePreference(storage, on) {
  try {
    if (!storage) return
    storage.setItem(WALK_MODE_STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    /* 무시 — privacy 모드 등에서 저장 실패해도 이번 세션의 토글 자체는
       React state로 계속 동작한다(영속화만 실패, 크래시 없음). */
  }
}
