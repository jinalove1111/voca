// src/utils/town/proto2_5d/paulSpriteManifest.js — Paul Town 2.5D "Paul"
// 캐릭터 전용 v2 스프라이트 매니페스트 빌더(2026-09-24).
//
// 목적: `characterSpriteContract.js`(v2 계약, validator/resolver)는
// 캐릭터를 특정하지 않는 범용 계약이다. 이 파일은 그 계약 위에서 "Paul"
// 캐릭터 하나에 특화된 파일명/기본 앵커/기본 캔버스/라이선스 골격을
// 고정해두는 얇은 어댑터다 — 계약 자체(validateSpriteManifest 등)는
// 재구현하지 않고 그대로 가져다 쓴다(CLAUDE.md 규칙 3).
//
// 이미지 import 0 — 이 파일 어디에도 `.png`/`.webp` import가 없다. 즉
// 실제 스프라이트 PNG 8장이 아직 `src/assets/town/character/`에 없는
// 동안에도 이 모듈은 정상적으로 로드되고, `npm run build`에 아무 영향을
// 주지 않는다(이미지가 없으면 `buildPaulSpriteManifest`가 만드는 manifest의
// `frames.*.src`가 비어 있을 뿐 — `validateSpriteManifest`가 그 매니페스트를
// 무효 판정하고, 호출부(`resolveSpriteFrame`)가 항상 하던 대로 이모지로
// 폴백한다. 이것이 "의도된 안전망"이다 — throw도, 빌드 실패도 없다).
//
// 흐름(전부 미래형 — 오늘 어떤 프로덕션 파일도 아래 어댑터를 참조하지
// 않는다): (미래) `src/assets/town/character/index.js`(에셋 레지스트리,
// `src/assets/town/env/index.js`와 동일한 격리 패턴 — PNG 8장을 import해
// `PAUL_SPRITE_SOURCES` 맵으로 노출)
//   → `buildPaulSpriteManifest({ sources: PAUL_SPRITE_SOURCES, ... })`
//   → 완성된 v2 manifest를 `Proto25DScreen.jsx`의 (아직 존재하지 않는,
//     선택적) `spriteManifest` prop으로 전달.
// 이 파일은 그 경로의 가운데 단계만 구현한다 — 레지스트리도, prop 배선도
// 이 작업 범위 밖이다(`PAUL_TOWN_CHARACTER_SPRITE_SPEC_2026-09-24.md` §10).
//
// PROPOSED 표시가 붙은 수치(캔버스 크기, 프레임 지속시간, footAnchor,
// sitSeatAnchor)는 전부 스펙 §4/§5의 제안값을 그대로 가져온 것으로, 실제
// 8장의 PNG가 도착해 `scripts/spriteIngestPaul.mjs --check`가 알파 채널을
// 실측하기 전까지는 잠정값이다 — 실측 결과가 이 값과 다르면(특히 sit의
// seatAnchor는 스펙 §5.2가 "기본값 없음, 사람 확정 필요"라고 명시)
// 실측값으로 교체해야 한다.

import { SPRITE_FRAME_IDS, EXPECTED_FRAME_META } from './characterSpriteContract.js'

// PAUL_TOWN_CHARACTER_SPRITE_SPEC_2026-09-24.md §10 "v2 매니페스트 최소
// 필드" 표의 characterId 관례(카탈로그 캐릭터 하나당 안정적 문자열 id) —
// 새 명명 규칙 발명 없이 townAsset류 key와 같은 kebab-case를 따른다.
export const PAUL_CHARACTER_ID = 'paul-town-paul-v1'

// 문서화용 상수(repo-relative) — 실제 import 경로는 코드가 아니라 사람이
// 읽는 참고용. §8 라이선스 문서(LICENSE.txt/NOTICE.md)도 같은 디렉터리에
// 놓인다.
export const PAUL_SPRITE_DIR = 'src/assets/town/character'

// frameId -> 파일명(stem, §2 표 그대로). SPRITE_FRAME_IDS를 순회하며
// 구성해서 "PAUL_SPRITE_FILES의 key 순서가 SPRITE_FRAME_IDS와 정확히
// 같다"는 불변식을 하드코딩된 리터럴 순서에 기대지 않고 구조적으로
// 보장한다(테스트가 `Object.keys(PAUL_SPRITE_FILES)`를
// `SPRITE_FRAME_IDS`와 deep-equal 비교하면 이 불변식을 그대로 검증할 수
// 있음) — SPRITE_FRAME_IDS 자체의 순서가 바뀌면 이 맵의 키 순서도 자동으로
// 따라간다.
const PAUL_SPRITE_FILENAME_BY_FRAME_ID = Object.freeze({
  'idle-front': 'paul-idle-front.png',
  'walk-front-a': 'paul-walk-front-a.png',
  'walk-front-b': 'paul-walk-front-b.png',
  'walk-back-a': 'paul-walk-back-a.png',
  'walk-back-b': 'paul-walk-back-b.png',
  'walk-side-a': 'paul-walk-side-a.png',
  'walk-side-b': 'paul-walk-side-b.png',
  sit: 'paul-sit.png',
})

export const PAUL_SPRITE_FILES = Object.freeze(
  SPRITE_FRAME_IDS.reduce((acc, frameId) => {
    acc[frameId] = PAUL_SPRITE_FILENAME_BY_FRAME_ID[frameId]
    return acc
  }, {}),
)

// §4/§5의 PROPOSED 기본값 그대로(측정 전 잠정치). canvas/footAnchor는
// walk-front-a 실측이 96x128과 다르면 교체, sitSeatAnchor는 §5.2가
// "기본값 없음, 사람 확정 필요"라고 명시하므로 여기 값은 순수
// placeholder다 — `spriteIngestPaul.mjs --check`의 "사람 확정 필요"
// 라벨이 붙은 출력을 사람이 보고 교체하기 전까지만 쓴다.
export const PAUL_SPRITE_DEFAULTS = Object.freeze({
  canvas: Object.freeze({ w: 96, h: 128 }), // PROPOSED — 실측 전
  pixelRatio: 1,
  frameDurationMs: 150, // PROPOSED — §3 참고, 실측/사람 확정 전
  mirrorX: true,
  reducedMotion: Object.freeze({ freezeFrameIndex: 0 }),
  footAnchor: Object.freeze({ x: 48, y: 128 }), // PROPOSED — §5.1, 실측 전
  sitSeatAnchor: Object.freeze({ x: 48, y: 96 }), // PROPOSED — §5.2, 반드시 사람 확정 필요
  license: Object.freeze({
    source: 'ChatGPT image generation (operator-directed), 2026-09',
    author: 'Paul Easy Voca (operator) — TO FILL',
    licenseName: 'proprietary — TO FILL',
    generatedBy: 'ChatGPT — TO FILL model/version',
    approvedBy: '',
    approvedAt: '',
  }),
})

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * frameId -> {src, src2x?, state, direction, footAnchor, seatAnchor?} 형태의
 * v2 manifest(`characterSpriteContract.js`의 `validateSpriteManifest`가
 * 기대하는 shape)를 조립한다. 절대 throw하지 않는다 — `sources`에 프레임이
 * 빠져 있으면(오늘 항상 그렇다, 이미지가 없으므로) 그 프레임의 `src`가
 * 비어 반환되고, 이후 `validateSpriteManifest`가 그 매니페스트를 무효
 * 판정해 호출부가 이모지로 폴백하는 것이 의도된 안전망이다.
 * @param {object} [p]
 * @param {Record<string,string>} [p.sources] - frameId -> url(미래의 에셋 레지스트리가 공급). 비어있거나 일부 누락이어도 안전.
 * @param {{w:number,h:number}} [p.canvas]
 * @param {Record<string,{footAnchor?:{x:number,y:number},seatAnchor?:{x:number,y:number}}>} [p.anchors] - frameId -> 앵커 override.
 * @param {number} [p.frameDurationMs]
 * @param {object} [p.license] - PAUL_SPRITE_DEFAULTS.license 위에 shallow-merge.
 * @param {1|2} [p.pixelRatio]
 * @returns {object} v2 manifest(항상 객체를 반환, throw 없음)
 */
export function buildPaulSpriteManifest(p) {
  const opts = isPlainObject(p) ? p : {}
  const { sources, canvas, anchors, frameDurationMs, license, pixelRatio } = opts
  const safeSources = isPlainObject(sources) ? sources : {}
  const safeAnchors = isPlainObject(anchors) ? anchors : {}
  const safeCanvas = isPlainObject(canvas) ? canvas : PAUL_SPRITE_DEFAULTS.canvas
  const safeLicense = isPlainObject(license)
    ? { ...PAUL_SPRITE_DEFAULTS.license, ...license }
    : PAUL_SPRITE_DEFAULTS.license

  const frames = {}
  for (const frameId of SPRITE_FRAME_IDS) {
    const meta = EXPECTED_FRAME_META[frameId]
    const anchorOverride = isPlainObject(safeAnchors[frameId]) ? safeAnchors[frameId] : {}
    const frame = {
      src: safeSources[frameId],
      state: meta.state,
      direction: meta.direction,
      footAnchor: anchorOverride.footAnchor || PAUL_SPRITE_DEFAULTS.footAnchor,
      file: PAUL_SPRITE_FILES[frameId],
    }
    if (frameId === 'sit') {
      frame.seatAnchor = anchorOverride.seatAnchor || PAUL_SPRITE_DEFAULTS.sitSeatAnchor
    }
    frames[frameId] = frame
  }

  return {
    version: 2,
    characterId: PAUL_CHARACTER_ID,
    license: safeLicense,
    canvas: safeCanvas,
    pixelRatio: pixelRatio === 1 || pixelRatio === 2 ? pixelRatio : PAUL_SPRITE_DEFAULTS.pixelRatio,
    frameDurationMs:
      typeof frameDurationMs === 'number' && Number.isFinite(frameDurationMs) && frameDurationMs > 0
        ? frameDurationMs
        : PAUL_SPRITE_DEFAULTS.frameDurationMs,
    mirrorX: PAUL_SPRITE_DEFAULTS.mirrorX,
    reducedMotion: PAUL_SPRITE_DEFAULTS.reducedMotion,
    frames,
  }
}

/**
 * `sources`(frameId -> url)를 8개 필수 프레임과 대조해, 비어 있는 프레임마다
 * `BLOCKED_BY_ASSET: ...` 문자열을 하나씩 반환한다. 전부 채워져 있으면 빈
 * 배열 — 오늘(이미지 0장) 기준 이 함수는 항상 8개짜리 배열을 반환한다.
 * @param {Record<string,string>} [sources]
 * @returns {string[]}
 */
export function paulSpriteBlockers(sources) {
  const safeSources = isPlainObject(sources) ? sources : {}
  const blockers = []
  for (const frameId of SPRITE_FRAME_IDS) {
    const src = safeSources[frameId]
    if (typeof src !== 'string' || src.length === 0) {
      blockers.push(`BLOCKED_BY_ASSET: ${frameId} (${PAUL_SPRITE_FILES[frameId]}) 없음`)
    }
  }
  return blockers
}
