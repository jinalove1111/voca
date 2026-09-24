// src/utils/town/proto2_5d/characterSpriteContract.js — Paul Town 2.5D
// 캐릭터 스프라이트 매니페스트 계약 v2(2026-09-24) — 아직 존재하지 않는
// 커스텀 8프레임 캐릭터(idle/walk-front/walk-back/walk-side/sit, 방향별
// 프레임 분리)를 위한 새 계약.
//
// v1(`characterManifest.js`, 3-state: idle/walk/sit, 방향 구분 없음)은 이
// 파일이 건드리지 않는다 — 그 파일의 72개 유닛 테스트
// (`scripts/testProto25dCharacterManifest.mjs`)는 오늘도 그대로 통과해야
// 한다(CLAUDE.md 규칙 1/3 — 이미 검증된 로직 재구현 금지). v2가 별도
// 파일인 이유: `docs/design/town/PAUL_TOWN_CHARACTER_SPRITE_SPEC_2026-09-24.md`
// §2.1이 지적하듯 `walkFront`/`walkBack`은 v1 계약(`SPRITE_CONTRACT_2026-09-24.md`
// §4.2)에 이미 optional로 정의만 됐을 뿐 방향 판정 함수(`directionForMove`
// 등)가 미구현이었다 — v1의 `states`/`REQUIRED_STATES` shape을 건드리지
// 않고 그 확장을 별도 모듈로 구현해 v1 회귀 위험을 0으로 만든다.
//
// 오늘 기준 어떤 프로덕션 파일도 이 모듈을 import하지 않는다(실 스프라이트
// 아트 없음 — 위 스펙 문서 §0 "최종 이미지는 아직 승인되지 않았다"). 즉 이
// 파일은 전부 미사용 코드이며 `scripts/`의 별도 테스트로만 검증된다.
//
// v1과 동일한 관례를 그대로 따른다: 순수 데이터 + validator/adapter
// 함수만(React/DOM 의존 없음), import는 v1의 공유 상수/함수
// (`EMOJI_GLYPH_BY_STATE`, `stateKeyForPhase`)를 가져오는 것 하나뿐, throw
// 없음(모든 함수는 항상 값을 반환하고 호출부가 emoji 폴백 여부를 정한다).
//
// 퍼센트 앵커 설계(`anchorOffsetPct`): v1의 `footAnchorPx`/`seatAnchorPx`는
// 절대 px 좌표라 렌더 쪽에서 캔버스 크기별로 따로 환산해야 했다. v2는
// 캔버스 크기와 앵커를 여기서 미리 %로 합성해 반환한다 — 호출부(미래의
// 렌더 컴포넌트)가 캔버스 원본 px 크기를 몰라도 CSS transform(예:
// `translate(dxPct%, dyPct%)`)에 바로 꽂을 수 있게 하기 위함(퍼센트 좌표계
// 통일은 `worldContract.js`/`walkGrid.js`가 이미 world-%로 일관되게 쓰는
// 것과 같은 정신).

import { EMOJI_GLYPH_BY_STATE, stateKeyForPhase } from './characterManifest.js'

export const SPRITE_MANIFEST_VERSION = 2

// PAUL_TOWN_CHARACTER_SPRITE_SPEC_2026-09-24.md §2 "프레임 목록" 표의
// 파일명(stem) 그대로 — 새 이름 발명 없음.
export const SPRITE_FRAME_IDS = Object.freeze([
  'idle-front',
  'walk-front-a',
  'walk-front-b',
  'walk-back-a',
  'walk-back-b',
  'walk-side-a',
  'walk-side-b',
  'sit',
])

// §2.1 "manifest state 키 매핑" — walkSide/walkFront/walkBack을 별도 논리
// state로 분리(v1의 단일 'walk'를 대체하는 v2 전용 shape).
export const SPRITE_STATES = Object.freeze(['idle', 'walkFront', 'walkBack', 'walkSide', 'sit'])

export const SPRITE_DIRECTIONS = Object.freeze(['front', 'back', 'side'])

// state -> 재생 순서(프레임 id 배열). walk 계열은 a→b 교대(§3), idle/sit은
// 단독 정지 프레임.
export const FRAME_SEQUENCE_BY_STATE = Object.freeze({
  idle: Object.freeze(['idle-front']),
  walkFront: Object.freeze(['walk-front-a', 'walk-front-b']),
  walkBack: Object.freeze(['walk-back-a', 'walk-back-b']),
  walkSide: Object.freeze(['walk-side-a', 'walk-side-b']),
  sit: Object.freeze(['sit']),
})

// 프레임 id -> 기대 {state, direction}. side 프레임은 항상 오른쪽을 바라보는
// 모습으로 그리고(§2 표), 좌측 이동은 facing=-1 + mirrorX로 재사용한다(v1
// ProtoCharacter.jsx 관례와 동일, 아래 resolveSpriteFrame 참고).
export const EXPECTED_FRAME_META = Object.freeze({
  'idle-front': Object.freeze({ state: 'idle', direction: 'front' }),
  'walk-front-a': Object.freeze({ state: 'walkFront', direction: 'front' }),
  'walk-front-b': Object.freeze({ state: 'walkFront', direction: 'front' }),
  'walk-back-a': Object.freeze({ state: 'walkBack', direction: 'back' }),
  'walk-back-b': Object.freeze({ state: 'walkBack', direction: 'back' }),
  'walk-side-a': Object.freeze({ state: 'walkSide', direction: 'side' }),
  'walk-side-b': Object.freeze({ state: 'walkSide', direction: 'side' }),
  sit: Object.freeze({ state: 'sit', direction: 'front' }),
})

const FRAME_ID_SET = new Set(SPRITE_FRAME_IDS)

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

function isNonEmptyString(s) {
  return typeof s === 'string' && s.length > 0
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function validatePointInBounds(point, label, canvas, errors, { required }) {
  if (point == null) {
    if (required) errors.push(`${label}가 필요함`)
    return
  }
  if (!isPlainObject(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
    errors.push(`${label}는 {x,y}(유한 숫자) 형태여야 함`)
    return
  }
  if (isFiniteNumber(canvas?.w) && (point.x < 0 || point.x > canvas.w)) {
    errors.push(`${label}.x는 0..${canvas.w} 범위 안이어야 함(got ${point.x})`)
  }
  if (isFiniteNumber(canvas?.h) && (point.y < 0 || point.y > canvas.h)) {
    errors.push(`${label}.y는 0..${canvas.h} 범위 안이어야 함(got ${point.y})`)
  }
}

function validateInkBounds(inkBounds, label, canvas, errors) {
  if (inkBounds == null) return
  if (!isPlainObject(inkBounds) || !isFiniteNumber(inkBounds.x) || !isFiniteNumber(inkBounds.y) ||
      !isFiniteNumber(inkBounds.w) || !isFiniteNumber(inkBounds.h)) {
    errors.push(`${label}는 {x,y,w,h}(유한 숫자) 형태여야 함`)
    return
  }
  if (!(inkBounds.w > 0) || !(inkBounds.h > 0)) {
    errors.push(`${label}.w/h는 0보다 커야 함`)
  }
  if (isFiniteNumber(canvas?.w) && isFiniteNumber(canvas?.h)) {
    const withinX = inkBounds.x >= 0 && inkBounds.x + inkBounds.w <= canvas.w
    const withinY = inkBounds.y >= 0 && inkBounds.y + inkBounds.h <= canvas.h
    if (!withinX || !withinY) {
      errors.push(`${label}는 캔버스(0..${canvas.w} x 0..${canvas.h}) 내부에 완전히 있어야 함`)
    }
  }
}

function validateFrameEntry(frameId, frame, canvas, errors) {
  const meta = EXPECTED_FRAME_META[frameId]
  if (!isPlainObject(frame)) {
    errors.push(`frames.${frameId}는 객체여야 함`)
    return
  }
  if (!isNonEmptyString(frame.src)) {
    errors.push(`frames.${frameId}.src는 비어있지 않은 문자열이어야 함`)
  }
  if (frame.src2x != null && !isNonEmptyString(frame.src2x)) {
    errors.push(`frames.${frameId}.src2x는 주어질 때 비어있지 않은 문자열이어야 함`)
  }
  if (frame.state !== meta.state) {
    errors.push(`frames.${frameId}.state는 '${meta.state}'여야 함(got ${JSON.stringify(frame.state)})`)
  }
  if (frame.direction !== meta.direction) {
    errors.push(`frames.${frameId}.direction은 '${meta.direction}'여야 함(got ${JSON.stringify(frame.direction)})`)
  }
  validatePointInBounds(frame.footAnchor, `frames.${frameId}.footAnchor`, canvas, errors, { required: true })
  if (frameId === 'sit') {
    validatePointInBounds(frame.seatAnchor, 'frames.sit.seatAnchor', canvas, errors, { required: true })
  }
  validateInkBounds(frame.inkBounds, `frames.${frameId}.inkBounds`, canvas, errors)
}

/**
 * spriteManifest(v2) 유효성 검사 — 절대 throw하지 않는다(v1
 * `validateCharacterManifest`와 동일 계약). 여러 문제가 있으면 errors
 * 배열에 전부 누적한다(첫 실패에서 조기 반환하지 않음).
 * @param {*} m
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateSpriteManifest(m) {
  if (!isPlainObject(m)) {
    return { ok: false, errors: ['manifest-not-object'] }
  }
  const errors = []

  if (m.version !== 2) {
    errors.push(`version은 2여야 함(got ${JSON.stringify(m.version)})`)
  }
  if (!isNonEmptyString(m.characterId)) {
    errors.push('characterId는 비어있지 않은 문자열이어야 함')
  }

  if (!isPlainObject(m.license)) {
    errors.push('license 객체가 필요함')
  } else {
    for (const key of ['source', 'author', 'licenseName']) {
      if (!isNonEmptyString(m.license[key])) {
        errors.push(`license.${key}는 비어있지 않은 문자열이어야 함`)
      }
    }
    for (const key of ['generatedBy', 'approvedBy', 'approvedAt']) {
      if (m.license[key] != null && typeof m.license[key] !== 'string') {
        errors.push(`license.${key}는 주어질 때 문자열이어야 함`)
      }
    }
  }

  const canvas = isPlainObject(m.canvas) ? m.canvas : null
  if (!canvas || !isFiniteNumber(canvas.w) || !(canvas.w > 0) || !isFiniteNumber(canvas.h) || !(canvas.h > 0)) {
    errors.push('canvas는 {w,h}(0보다 큰 유한 숫자) 형태여야 함')
  }

  if (m.pixelRatio !== 1 && m.pixelRatio !== 2) {
    errors.push(`pixelRatio는 1 또는 2여야 함(got ${JSON.stringify(m.pixelRatio)})`)
  }

  if (!isFiniteNumber(m.frameDurationMs) || !(m.frameDurationMs > 0)) {
    errors.push('frameDurationMs는 0보다 큰 유한 숫자여야 함')
  }

  if (typeof m.mirrorX !== 'boolean') {
    errors.push('mirrorX는 boolean이어야 함')
  }

  if (m.reducedMotion != null) {
    if (!isPlainObject(m.reducedMotion) ||
        !Number.isInteger(m.reducedMotion.freezeFrameIndex) ||
        m.reducedMotion.freezeFrameIndex < 0) {
      errors.push('reducedMotion.freezeFrameIndex는 주어질 때 0 이상 정수여야 함')
    }
  }

  if (!isPlainObject(m.frames)) {
    errors.push('frames 객체가 필요함')
  } else {
    for (const frameId of SPRITE_FRAME_IDS) {
      if (!(frameId in m.frames)) {
        errors.push(`frames.${frameId}가 없음`)
      }
    }
    for (const key of Object.keys(m.frames)) {
      if (!FRAME_ID_SET.has(key)) {
        errors.push(`frames.${key}는 알 수 없는 프레임 id`)
      }
    }
    for (const frameId of SPRITE_FRAME_IDS) {
      if (frameId in m.frames) {
        validateFrameEntry(frameId, m.frames[frameId], canvas, errors)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

/**
 * 이동 벡터(dx,dy, world-% 단위) -> 캐릭터가 바라볼 논리 방향. world의
 * 가로/세로 비율이 다르므로(`worldContract.js` WORLD.w:WORLD.h≈100:190)
 * 정규화 후 비교한다 — 그렇지 않으면 세로로 조금만 움직여도 가로 이동보다
 * 커 보여 부정확하게 'front'/'back'으로 판정될 수 있다.
 * @param {number} dx
 * @param {number} dy
 * @param {'front'|'back'|'side'} [prevDirection]
 * @param {{w:number,h:number}} [world]
 * @returns {'front'|'back'|'side'}
 */
export function directionForMove(dx, dy, prevDirection = 'front', world = { w: 100, h: 190 }) {
  const fallback = SPRITE_DIRECTIONS.includes(prevDirection) ? prevDirection : 'front'
  if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) return fallback
  if (dx === 0 && dy === 0) return fallback
  const w = isFiniteNumber(world?.w) && world.w > 0 ? world.w : 100
  const h = isFiniteNumber(world?.h) && world.h > 0 ? world.h : 190
  const dxN = dx / w
  const dyN = dy / h
  if (Math.abs(dyN) > Math.abs(dxN)) {
    return dyN > 0 ? 'front' : 'back'
  }
  return 'side'
}

/**
 * 가로 이동량 -> 좌우 반전 계수(1=오른쪽 향함/기본, -1=왼쪽 향함,
 * `mirrorX` 적용 대상). side 프레임은 항상 오른쪽을 바라보는 모습으로만
 * 그려지므로(§2) 왼쪽 이동은 이 값으로 `scaleX(-1)` 미러링한다.
 * @param {number} dx
 * @param {1|-1} [prevFacing]
 * @returns {1|-1}
 */
export function facingForMove(dx, prevFacing = 1) {
  if (isFiniteNumber(dx) && dx > 0) return 1
  if (isFiniteNumber(dx) && dx < 0) return -1
  return prevFacing === 1 || prevFacing === -1 ? prevFacing : 1
}

/**
 * phase(Proto25DScreen.jsx character.phase) + direction -> v2 논리 state.
 * v1 `stateKeyForPhase`와 동일한 phase 규칙(leaving은 walk 계열 재사용)을
 * 따르되, walk 계열을 direction별로 분리한다(§2.1).
 * @param {string} phase
 * @param {'front'|'back'|'side'} [direction]
 * @returns {'idle'|'walkFront'|'walkBack'|'walkSide'|'sit'}
 */
export function spriteStateForPhase(phase, direction = 'front') {
  if (phase === 'sitting') return 'sit'
  if (phase === 'walking' || phase === 'leaving') {
    if (direction === 'back') return 'walkBack'
    if (direction === 'side') return 'walkSide'
    return 'walkFront'
  }
  return 'idle'
}

/**
 * 경과 시간(ms) -> 프레임 배열 인덱스(loop). v1
 * `resolveCharacterVisual`(호출부가 frameIndex를 미리 계산해 넘기던 방식)과
 * 달리, v2는 이 계산 자체를 계약 함수로 노출해 렌더 쪽 로직 중복을 막는다.
 * @param {number} elapsedMs
 * @param {number} frameDurationMs
 * @param {number} framesLength
 * @returns {number}
 */
export function frameIndexAt(elapsedMs, frameDurationMs, framesLength) {
  if (!isFiniteNumber(elapsedMs) || !isFiniteNumber(frameDurationMs) || !isFiniteNumber(framesLength)) return 0
  if (framesLength <= 1) return 0
  if (frameDurationMs <= 0) return 0
  if (elapsedMs < 0) return 0
  return Math.floor(elapsedMs / frameDurationMs) % framesLength
}

/**
 * 캔버스 크기 + 앵커(px) -> 캔버스 기준 퍼센트 오프셋. dxPct는 앵커가
 * 캔버스 가로 중심에서 얼마나 벗어났는지(양수=중심보다 왼쪽에 있음,
 * CSS translateX(dxPct%)로 캔버스를 오른쪽으로 밀어 앵커를 중심에 맞추는
 * 부호), dyPct는 앵커가 캔버스 하단에서 얼마나 위에 있는지.
 * @param {{w:number,h:number}} canvas
 * @param {{x:number,y:number}} anchor
 * @returns {{dxPct:number,dyPct:number}}
 */
export function anchorOffsetPct(canvas, anchor) {
  if (!isPlainObject(canvas) || !isFiniteNumber(canvas.w) || !(canvas.w > 0) ||
      !isFiniteNumber(canvas.h) || !(canvas.h > 0)) {
    return { dxPct: 0, dyPct: 0 }
  }
  if (!isPlainObject(anchor) || !isFiniteNumber(anchor.x) || !isFiniteNumber(anchor.y)) {
    return { dxPct: 0, dyPct: 0 }
  }
  return {
    dxPct: ((canvas.w / 2 - anchor.x) / canvas.w) * 100,
    dyPct: ((canvas.h - anchor.y) / canvas.h) * 100,
  }
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

function emojiFallback(phase) {
  return { kind: 'emoji', glyph: EMOJI_GLYPH_BY_STATE[stateKeyForPhase(phase)] }
}

/**
 * manifest/validation/phase/direction/facing/frameIndex -> 렌더할 시각
 * 표현. 절대 throw하지 않는다 — 어떤 단계든 실패하면 v1과 동일한 emoji
 * glyph로 폴백한다(공유 상수 `EMOJI_GLYPH_BY_STATE`, 중복 정의 없음).
 * @param {object} p
 * @param {*} p.manifest
 * @param {{ok:boolean, errors:string[]}} p.validation - validateSpriteManifest(manifest)의 결과(호출부가 캐싱해 넘김).
 * @param {string} p.phase - Proto25DScreen.jsx character.phase.
 * @param {'front'|'back'|'side'} [p.direction]
 * @param {1|-1} [p.facing]
 * @param {number} [p.frameIndex]
 * @param {boolean} [p.reducedMotion]
 * @returns {{kind:'emoji',glyph:string}|{kind:'sprite',frameId:string,state:string,direction:string,src:string,src2x?:string,srcSet?:string,mirrorX:boolean,footAnchor:object,seatAnchor?:object,activeAnchor:object,anchorOffsetPct:{dxPct:number,dyPct:number},isAnimated:boolean,frameIndex:number,frameDurationMs:number}}
 */
export function resolveSpriteFrame({
  manifest,
  validation,
  phase,
  direction = 'front',
  facing = 1,
  frameIndex = 0,
  reducedMotion = false,
} = {}) {
  if (!manifest || !validation || validation.ok !== true) return emojiFallback(phase)

  const state = spriteStateForPhase(phase, direction)
  const seq = FRAME_SEQUENCE_BY_STATE[state]
  if (!Array.isArray(seq) || seq.length === 0) return emojiFallback(phase)

  const len = seq.length
  let idx
  if (reducedMotion) {
    const freeze = manifest.reducedMotion?.freezeFrameIndex ?? 0
    idx = clamp(Number.isFinite(freeze) ? Math.trunc(freeze) : 0, 0, len - 1)
  } else {
    const fi = Number.isFinite(frameIndex) ? Math.trunc(frameIndex) : 0
    idx = ((fi % len) + len) % len
  }

  const frameId = seq[idx]
  const frame = manifest.frames && manifest.frames[frameId]
  if (!frame) return emojiFallback(phase)

  const mirrorX = state === 'walkSide' && facing === -1 && manifest.mirrorX === true
  const activeAnchor = (state === 'sit' && frame.seatAnchor) ? frame.seatAnchor : frame.footAnchor

  return {
    kind: 'sprite',
    frameId,
    state,
    direction: frame.direction,
    src: frame.src,
    src2x: frame.src2x,
    srcSet: frame.src2x ? `${frame.src} 1x, ${frame.src2x} 2x` : undefined,
    mirrorX,
    footAnchor: frame.footAnchor,
    seatAnchor: frame.seatAnchor,
    activeAnchor,
    anchorOffsetPct: anchorOffsetPct(manifest.canvas, activeAnchor),
    isAnimated: seq.length > 1 && !reducedMotion,
    frameIndex: idx,
    frameDurationMs: manifest.frameDurationMs,
  }
}

/**
 * manifest의 모든 프레임 src/src2x를 중복 없이 모은다(프리로드용). 잘못된
 * 입력이면 빈 배열을 반환한다(throw 없음).
 * @param {*} manifest
 * @returns {string[]}
 */
export function spriteFrameSources(manifest) {
  if (!isPlainObject(manifest) || !isPlainObject(manifest.frames)) return []
  const seen = new Set()
  for (const frame of Object.values(manifest.frames)) {
    if (!isPlainObject(frame)) continue
    if (isNonEmptyString(frame.src)) seen.add(frame.src)
    if (isNonEmptyString(frame.src2x)) seen.add(frame.src2x)
  }
  return Array.from(seen)
}
