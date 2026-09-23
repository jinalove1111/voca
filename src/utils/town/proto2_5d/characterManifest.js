// src/utils/town/proto2_5d/characterManifest.js — Paul Town 2.5D 캐릭터
// 프로토타입(Phase 6A, 2026-09-23) 캐릭터 스프라이트 매니페스트 계약.
//
// 순수 데이터 + validator/adapter 함수만 — React/DOM 의존 없음, import 0개
// (benchInteraction.js와 동일 "의존성 0" 관례). throw 없음(호출부는 항상
// 반환값만 보고 emoji 폴백 여부를 정한다) — walkGrid.js/pathfinding.js/
// depthOrder.js/Proto25DScreen.jsx의 상태 머신·좌표 로직은 이 파일이 전혀
// 모른다(격리, scripts/.tmp/p6a_C_sprite_contract.md 설계 그대로 구현 —
// 새 구조 발명 없음).
//
// 오늘은 어떤 화면도 이 모듈에 실제 manifest를 넘기지 않는다(실 스프라이트
// 아트 없음, ASTRA_HANDOFF_2026-09-21.md §0-A) — ProtoCharacter.jsx가
// manifest=undefined로 호출하면 항상 emoji 경로만 타므로, 이 파일은 오늘
// 시각적으로 완전히 비활성 코드다(scripts/testProto25dCharacterManifest.mjs
// 로만 검증).

const REQUIRED_STATES = ['idle', 'walk', 'sit']

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

// state(또는 manifest 전역) frameCanvas에서 앵커 범위 검사용 폭/높이를
// 구한다 — 우선순위: state.frameCanvas > manifest.frameCanvas >
// state.frames[0](첫 프레임 자체의 w/h). 셋 다 없으면(구조 자체가 이미
// 무효라 다른 검사에서 이미 에러가 쌓였을 것) null을 반환해 범위 검사를
// 생략한다(정보 부족 시 크래시 대신 건너뛰는 이 프로토타입의 다른 "안전
// 폴백" 관례와 동일).
function anchorBounds(manifest, state) {
  const fromState = state && state.frameCanvas
  const fromManifest = manifest && manifest.frameCanvas
  const fromFirstFrame = state && Array.isArray(state.frames) ? state.frames[0] : null
  const w = (fromState && fromState.w) ?? (fromManifest && fromManifest.w) ?? (fromFirstFrame && fromFirstFrame.w) ?? null
  const h = (fromState && fromState.h) ?? (fromManifest && fromManifest.h) ?? (fromFirstFrame && fromFirstFrame.h) ?? null
  return { w, h }
}

function validateFrame(frame, stateName, index, errors) {
  if (!frame || typeof frame !== 'object') {
    errors.push(`states.${stateName}.frames[${index}]는 객체여야 함`)
    return
  }
  if (!(isFiniteNumber(frame.w) && frame.w > 0) || !(isFiniteNumber(frame.h) && frame.h > 0)) {
    errors.push(`states.${stateName}.frames[${index}]의 w/h는 0보다 큰 숫자여야 함`)
  }
  const hasSheetCoords = isFiniteNumber(frame.x) && frame.x >= 0 && isFiniteNumber(frame.y) && frame.y >= 0
  const hasOwnSrc = typeof frame.src === 'string' && frame.src.length > 0
  if (!hasSheetCoords && !hasOwnSrc) {
    errors.push(`states.${stateName}.frames[${index}]는 (시트 좌표 x/y) 또는 (개별 src) 중 하나를 가져야 함`)
  }
}

function validateAnchor(anchor, label, bounds, errors, { required }) {
  if (anchor == null) {
    if (required) errors.push(`${label}가 필요함`)
    return
  }
  if (typeof anchor !== 'object' || !isFiniteNumber(anchor.x) || !isFiniteNumber(anchor.y)) {
    errors.push(`${label}는 {x,y}(유한 숫자) 형태여야 함`)
    return
  }
  if (isFiniteNumber(bounds.w) && (anchor.x < 0 || anchor.x > bounds.w)) {
    errors.push(`${label}.x는 0..${bounds.w} 범위 안이어야 함(got ${anchor.x})`)
  }
  if (isFiniteNumber(bounds.h) && (anchor.y < 0 || anchor.y > bounds.h)) {
    errors.push(`${label}.y는 0..${bounds.h} 범위 안이어야 함(got ${anchor.y})`)
  }
}

/**
 * characterManifest 유효성 검사 — 절대 throw하지 않는다(호출부가 항상
 * 이 반환값만 보고 emoji 폴백 여부를 정한다). 여러 문제가 있으면 errors
 * 배열에 전부 누적한다(첫 실패에서 조기 반환하지 않음 — 매니페스트
 * 제작자가 한 번에 다 고칠 수 있도록).
 * @param {*} m
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateCharacterManifest(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return { ok: false, errors: ['manifest-not-object'] }
  }
  const errors = []
  for (const stateName of REQUIRED_STATES) {
    const state = m.states && m.states[stateName]
    if (!state || typeof state !== 'object') {
      errors.push(`states.${stateName}이 없음`)
      continue
    }
    if (!Array.isArray(state.frames) || state.frames.length < 1) {
      errors.push(`states.${stateName}.frames는 길이>=1 배열이어야 함`)
    } else {
      state.frames.forEach((frame, i) => validateFrame(frame, stateName, i, errors))
    }
    // 프레임 1개짜리 state는 fps 값 자체가 렌더에 전혀 쓰이지 않으므로
    // (애니메이션할 대상이 없음) 0이든 뭐든 무시해도 안전 — 검사하지
    // 않는다. frames.length>1인 state(walk처럼 실제 애니메이션이 필요한
    // state)만 "fps가 있으면 0보다 큰 유한수"를 강제한다 — fps:0은
    // "정지 애니메이션 의도인지 설정 오류인지" 모호하므로 명시적 에러,
    // 생략(undefined/null)만 허용한다.
    if (Array.isArray(state.frames) && state.frames.length > 1 &&
        state.fps != null && !(isFiniteNumber(state.fps) && state.fps > 0)) {
      errors.push(`states.${stateName}.fps는 프레임이 2개 이상이면 주어질 때 0보다 큰 유한수여야 함(0/음수는 애니메이션 의도 모호 — 생략만 허용)`)
    }
    const bounds = anchorBounds(m, state)
    validateAnchor(state.footAnchorPx, `states.${stateName}.footAnchorPx`, bounds, errors, { required: true })
    if (stateName === 'sit') {
      validateAnchor(state.seatAnchorPx, 'states.sit.seatAnchorPx', bounds, errors, { required: true })
    }
  }
  return { ok: errors.length === 0, errors }
}

/**
 * phase(Proto25DScreen.jsx character.phase) -> manifest.states 키. leaving은
 * 전용 아트가 없어 walk를 재사용한다(§0-A — Proto25DScreen.jsx의 walkPath가
 * phaseLabel만 다르게 받아 'walking'/'leaving' 둘 다 같은 이동 로직을
 * 공유하는 것과 동일 원칙).
 * @param {string} phase
 * @returns {'idle'|'walk'|'sit'}
 */
export function stateKeyForPhase(phase) {
  if (phase === 'sitting') return 'sit'
  if (phase === 'walking' || phase === 'leaving') return 'walk'
  return 'idle'
}

// ProtoCharacter.jsx가 manifest 없음/무효일 때 쓰는 것과 완전히 동일한
// glyph 규칙(오늘의 유일한 실제 렌더 경로) — 두 곳에서 하드코딩이 갈리지
// 않도록 이 상수 하나를 공유한다(설계 문서가 지적한 "중복 아니라 같은
// 상수를 공유해야 함" 요구 그대로).
export const EMOJI_GLYPH_BY_STATE = Object.freeze({ idle: '🚶', walk: '🚶', sit: '🧘' })

function emojiFallback(phase) {
  return { kind: 'emoji', glyph: EMOJI_GLYPH_BY_STATE[stateKeyForPhase(phase)] }
}

/**
 * manifest/validation/phase/frameIndex -> 렌더할 시각 표현. 절대 throw하지
 * 않는다 — 어떤 단계든 실패하면 emoji로 폴백한다.
 * @param {object} p
 * @param {*} p.manifest
 * @param {{ok:boolean, errors:string[]}} p.validation - validateCharacterManifest(manifest)의 결과(호출부가 캐싱해 넘김).
 * @param {string} p.phase - Proto25DScreen.jsx character.phase.
 * @param {number} [p.frameIndex]
 * @returns {{kind:'emoji',glyph:string}|{kind:'sprite',src:string,srcSet?:string,frame:object,footAnchorPx:object,seatAnchorPx?:object,isAnimated:boolean}}
 */
export function resolveCharacterVisual({ manifest, validation, phase, frameIndex = 0 }) {
  if (!manifest || !validation || validation.ok !== true) return emojiFallback(phase)
  const stateKey = stateKeyForPhase(phase)
  const state = manifest.states && manifest.states[stateKey]
  if (!state || !Array.isArray(state.frames) || state.frames.length === 0) return emojiFallback(phase)
  const len = state.frames.length
  const idx = ((Number(frameIndex) || 0) % len + len) % len
  const frame = state.frames[idx]
  if (!frame) return emojiFallback(phase)
  return {
    kind: 'sprite',
    src: frame.src ?? manifest.sheet?.src,
    srcSet: manifest.sheet?.srcSet,
    frame,
    footAnchorPx: state.footAnchorPx,
    seatAnchorPx: state.seatAnchorPx,
    isAnimated: len > 1,
  }
}
