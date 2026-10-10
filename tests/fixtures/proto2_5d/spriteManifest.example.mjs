// tests/fixtures/proto2_5d/spriteManifest.example.mjs — Paul Town 2.5D
// 캐릭터 스프라이트 매니페스트 v2
// (`src/utils/town/proto2_5d/characterSpriteContract.js`) 테스트 픽스처.
//
// 이 파일의 `src`/`src2x`는 전부 1x1 투명 PNG data URI다 — **실제 아트가
// 아니다**. `docs/design/town/PAUL_TOWN_CHARACTER_SPRITE_SPEC_2026-09-24.md`
// §0가 명시하듯 커스텀 캐릭터 이미지는 아직 승인되지 않았고 어떤
// 에이전트도 이 문서/픽셀 데이터를 근거로 실 이미지를 채택해서는 안 된다.
// 이 픽스처는 오직 `characterSpriteContract.js`의 검증/해석 함수를
// 유닛 테스트에서 exercise하기 위한 최소 플레이스홀더이며, `src/` 어디서도
// import되어서는 안 된다(테스트 전용).

const TRANSPARENT_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function frame(state, direction, extra = {}) {
  return {
    src: TRANSPARENT_PNG_DATA_URI,
    src2x: TRANSPARENT_PNG_DATA_URI,
    state,
    direction,
    footAnchor: { x: 48, y: 128 },
    ...extra,
  }
}

/**
 * 유효한 v2 매니페스트(대조군) — 8프레임 전부 포함, footAnchor/seatAnchor/
 * inkBounds 전부 캔버스(96x128) 범위 내.
 */
export const EXAMPLE_SPRITE_MANIFEST = Object.freeze({
  version: 2,
  characterId: 'paul-town-child-example',
  license: {
    source: 'tests/fixtures (placeholder, not real art)',
    author: 'fixture',
    licenseName: 'fixture-only',
  },
  canvas: { w: 96, h: 128 },
  pixelRatio: 1,
  frameDurationMs: 150,
  mirrorX: true,
  reducedMotion: { freezeFrameIndex: 0 },
  frames: {
    'idle-front': frame('idle', 'front', { inkBounds: { x: 16, y: 32, w: 64, h: 96 } }),
    'walk-front-a': frame('walkFront', 'front', { inkBounds: { x: 16, y: 32, w: 64, h: 96 } }),
    'walk-front-b': frame('walkFront', 'front', { inkBounds: { x: 16, y: 32, w: 64, h: 96 } }),
    'walk-back-a': frame('walkBack', 'back', { inkBounds: { x: 16, y: 32, w: 64, h: 96 } }),
    'walk-back-b': frame('walkBack', 'back', { inkBounds: { x: 16, y: 32, w: 64, h: 96 } }),
    'walk-side-a': frame('walkSide', 'side', { inkBounds: { x: 16, y: 32, w: 64, h: 96 } }),
    'walk-side-b': frame('walkSide', 'side', { inkBounds: { x: 16, y: 32, w: 64, h: 96 } }),
    sit: frame('sit', 'front', {
      footAnchor: { x: 48, y: 128 },
      seatAnchor: { x: 48, y: 96 },
      inkBounds: { x: 16, y: 32, w: 64, h: 96 },
    }),
  },
})

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

/**
 * `EXAMPLE_SPRITE_MANIFEST`를 deep-clone한 뒤 top-level 키를 overrides로
 * shallow-merge한다(예: `makeSpriteManifest({ pixelRatio: 2 })`). frames
 * 하위 개별 프레임을 바꾸려면 overrides.frames에 전체 frames 객체를
 * 넘긴다(shallow merge이므로 top-level 키 단위로만 치환됨).
 * @param {object} [overrides]
 * @returns {object}
 */
export function makeSpriteManifest(overrides = {}) {
  const clone = deepClone(EXAMPLE_SPRITE_MANIFEST)
  return { ...clone, ...overrides }
}

/**
 * `EXAMPLE_SPRITE_MANIFEST`를 deep-clone한 뒤 지정한 frameId 하나를 제거한
 * 매니페스트를 반환한다(필수 프레임 누락 케이스 테스트용).
 * @param {object} manifest
 * @param {string} frameId
 * @returns {object}
 */
export function withoutFrame(manifest, frameId) {
  const clone = deepClone(manifest)
  if (clone && clone.frames) {
    delete clone.frames[frameId]
  }
  return clone
}
