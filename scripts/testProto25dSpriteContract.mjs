// scripts/testProto25dSpriteContract.mjs — Paul Town 2.5D 캐릭터
// 프로토타입 characterSpriteContract.js(v2 스프라이트 매니페스트 계약,
// 2026-09-24) 순수 단위 테스트.
//
// React/DOM/네트워크 0. characterSpriteContract.js는 v1 characterManifest.js
// (의존성 0)만 import하는 순수 모듈이라 esbuild 번들 없이 plain `node`로
// 직접 import한다(scripts/testProto25dCharacterManifest.mjs와 동일 관례 —
// 확장자 없는 상대 import 문제가 애초에 없음).
import {
  SPRITE_FRAME_IDS,
  SPRITE_STATES,
  SPRITE_DIRECTIONS,
  FRAME_SEQUENCE_BY_STATE,
  EXPECTED_FRAME_META,
  SPRITE_MANIFEST_VERSION,
  validateSpriteManifest,
  directionForMove,
  facingForMove,
  spriteStateForPhase,
  frameIndexAt,
  anchorOffsetPct,
  resolveSpriteFrame,
  spriteFrameSources,
} from '../src/utils/town/proto2_5d/characterSpriteContract.js'
import {
  EMOJI_GLYPH_BY_STATE,
  stateKeyForPhase,
} from '../src/utils/town/proto2_5d/characterManifest.js'
import { buildPaulSpriteManifest } from '../src/utils/town/proto2_5d/paulSpriteManifest.js'
import {
  EXAMPLE_SPRITE_MANIFEST,
  makeSpriteManifest,
  withoutFrame,
} from '../tests/fixtures/proto2_5d/spriteManifest.example.mjs'

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isFrozen(v) {
  return Object.isFrozen(v)
}

// ── 항목1 — 상수 ──────────────────────────────────────────────────────
section('항목1 — 상수(SPRITE_FRAME_IDS/SPRITE_STATES/SPRITE_DIRECTIONS/FRAME_SEQUENCE_BY_STATE/EXPECTED_FRAME_META)')
{
  const expectedIds = [
    'idle-front', 'walk-front-a', 'walk-front-b',
    'walk-back-a', 'walk-back-b',
    'walk-side-a', 'walk-side-b',
    'sit',
  ]
  check('SPRITE_FRAME_IDS가 정확히 8개 id, 순서까지 일치, frozen',
    deepEqual(SPRITE_FRAME_IDS, expectedIds) && isFrozen(SPRITE_FRAME_IDS), JSON.stringify(SPRITE_FRAME_IDS))

  check('SPRITE_STATES가 5개, 내용 일치, frozen',
    deepEqual(SPRITE_STATES, ['idle', 'walkFront', 'walkBack', 'walkSide', 'sit']) && isFrozen(SPRITE_STATES), JSON.stringify(SPRITE_STATES))

  check('SPRITE_DIRECTIONS가 3개, 내용 일치, frozen',
    deepEqual(SPRITE_DIRECTIONS, ['front', 'back', 'side']) && isFrozen(SPRITE_DIRECTIONS), JSON.stringify(SPRITE_DIRECTIONS))

  // FRAME_SEQUENCE_BY_STATE가 8개 프레임 id 전부를 정확히 한 번씩 커버.
  const allFramesInSequences = Object.values(FRAME_SEQUENCE_BY_STATE).flat()
  check('FRAME_SEQUENCE_BY_STATE가 8개 프레임 id를 각각 정확히 1번씩 커버(전체 수도 8)',
    allFramesInSequences.length === 8 && SPRITE_FRAME_IDS.every(id => allFramesInSequences.filter(x => x === id).length === 1),
    JSON.stringify(allFramesInSequences))
  check('FRAME_SEQUENCE_BY_STATE 및 모든 state 값이 frozen',
    isFrozen(FRAME_SEQUENCE_BY_STATE) && SPRITE_STATES.every(state => isFrozen(FRAME_SEQUENCE_BY_STATE[state])))
  const expectedSequences = {
    idle: ['idle-front'],
    walkFront: ['walk-front-a', 'walk-front-b'],
    walkBack: ['walk-back-a', 'walk-back-b'],
    walkSide: ['walk-side-a', 'walk-side-b'],
    sit: ['sit'],
  }
  check('FRAME_SEQUENCE_BY_STATE 각 state의 시퀀스 내용이 기대값과 일치',
    deepEqual(FRAME_SEQUENCE_BY_STATE, expectedSequences), JSON.stringify(FRAME_SEQUENCE_BY_STATE))

  const expectedMeta = {
    'idle-front': { state: 'idle', direction: 'front' },
    'walk-front-a': { state: 'walkFront', direction: 'front' },
    'walk-front-b': { state: 'walkFront', direction: 'front' },
    'walk-back-a': { state: 'walkBack', direction: 'back' },
    'walk-back-b': { state: 'walkBack', direction: 'back' },
    'walk-side-a': { state: 'walkSide', direction: 'side' },
    'walk-side-b': { state: 'walkSide', direction: 'side' },
    sit: { state: 'sit', direction: 'front' },
  }
  check('EXPECTED_FRAME_META가 8개 id 전부에 대해 state/direction 일치',
    deepEqual(EXPECTED_FRAME_META, expectedMeta), JSON.stringify(EXPECTED_FRAME_META))
  check('EXPECTED_FRAME_META 및 8개 id 값 전부가 frozen',
    isFrozen(EXPECTED_FRAME_META) && SPRITE_FRAME_IDS.every(id => isFrozen(EXPECTED_FRAME_META[id])))
}

// ── 항목2 — 유효 manifest 통과 ────────────────────────────────────────
section('항목2 — 유효한 manifest → ok:true')
{
  const v = validateSpriteManifest(EXAMPLE_SPRITE_MANIFEST)
  check('EXAMPLE_SPRITE_MANIFEST → ok:true', v.ok === true, JSON.stringify(v))
  check('EXAMPLE_SPRITE_MANIFEST → errors:[]', Array.isArray(v.errors) && v.errors.length === 0, JSON.stringify(v))

  // src2x가 전부 있는 변형(원본이 이미 그렇지만 명시적으로 재확인).
  const withSrc2x = makeSpriteManifest()
  const vSrc2x = validateSpriteManifest(withSrc2x)
  check('모든 프레임에 src2x가 있는 변형 → ok:true', vSrc2x.ok === true, JSON.stringify(vSrc2x))

  // reducedMotion 생략 변형도 유효(optional 필드).
  const noReducedMotion = makeSpriteManifest({ reducedMotion: undefined })
  delete noReducedMotion.reducedMotion
  const vNoRM = validateSpriteManifest(noReducedMotion)
  check('reducedMotion 생략 변형 → ok:true', vNoRM.ok === true, JSON.stringify(vNoRM))

  // makeSpriteManifest가 deep clone을 반환(원본 불변).
  const clone1 = makeSpriteManifest()
  clone1.frames['idle-front'].src = 'MUTATED'
  check('makeSpriteManifest는 deep clone — clone 변형이 EXAMPLE_SPRITE_MANIFEST에 영향 없음',
    EXAMPLE_SPRITE_MANIFEST.frames['idle-front'].src !== 'MUTATED')
  const clone2 = makeSpriteManifest()
  check('두 번째 clone은 첫 clone의 변형을 물려받지 않음', clone2.frames['idle-front'].src !== 'MUTATED')
}

// ── 항목3 — 누락 frame 거부 ───────────────────────────────────────────
section('항목3 — 누락/알 수 없는 frame 거부')
{
  for (const frameId of SPRITE_FRAME_IDS) {
    const m = withoutFrame(EXAMPLE_SPRITE_MANIFEST, frameId)
    const v = validateSpriteManifest(m)
    check(`frames.${frameId} 누락 → ok:false, errors에 '${frameId}' 언급`,
      v.ok === false && v.errors.some(e => e.includes(frameId)), JSON.stringify(v))
  }

  const extraFrame = makeSpriteManifest()
  extraFrame.frames['unknown-frame'] = { src: 'x', state: 'idle', direction: 'front', footAnchor: { x: 1, y: 1 } }
  const vExtra = validateSpriteManifest(extraFrame)
  check("알 수 없는 프레임 id 추가 → ok:false, errors에 'unknown-frame' 언급",
    vExtra.ok === false && vExtra.errors.some(e => e.includes('unknown-frame')), JSON.stringify(vExtra))

  const framesNotObject = makeSpriteManifest({ frames: 'not-an-object' })
  const vNotObj = validateSpriteManifest(framesNotObject)
  check('frames가 객체가 아님 → ok:false, errors 비어있지 않음',
    vNotObj.ok === false && vNotObj.errors.length > 0, JSON.stringify(vNotObj))
}

// ── 항목4 — 잘못된 anchor 거부 ────────────────────────────────────────
section('항목4 — 잘못된 anchor/기타 필드 거부(throw 없음)')
{
  // 잘 정의된 shape(필드 값만 잘못됨)인 케이스는 throw 위험이 낮으므로 결과
  // 하나로 압축 검증한다. manifest 자체가 null/문자열/배열인 "쓰레기 타입"
  // 케이스만 아래에서 별도로 throw-safety까지 3중 검증한다(요구사항 §4).
  function expectInvalid(label, manifest) {
    const v = validateSpriteManifest(manifest)
    check(`${label} — ok:false, errors 비어있지 않음`,
      v.ok === false && Array.isArray(v.errors) && v.errors.length > 0, JSON.stringify(v))
  }

  function expectInvalidGarbage(label, manifest) {
    let v
    let threw = false
    try {
      v = validateSpriteManifest(manifest)
    } catch {
      threw = true
      v = { ok: false, errors: ['threw'] }
    }
    check(`${label} — throw 없음, ok:false, errors 비어있지 않음`,
      !threw && v.ok === false && Array.isArray(v.errors) && v.errors.length > 0, JSON.stringify(v))

    let visual
    let threwOnResolve = false
    try {
      visual = resolveSpriteFrame({ manifest, validation: v, phase: 'idle', frameIndex: 0 })
    } catch {
      threwOnResolve = true
    }
    check(`${label} — resolveSpriteFrame도 throw 없이 emoji 폴백`,
      !threwOnResolve && visual && visual.kind === 'emoji', JSON.stringify(visual))
  }

  {
    const m = makeSpriteManifest()
    delete m.frames['idle-front'].footAnchor
    expectInvalid('footAnchor 누락(idle-front)', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames['idle-front'].footAnchor = { x: NaN, y: 128 }
    expectInvalid('footAnchor.x가 NaN', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames['idle-front'].footAnchor = { x: -1, y: 128 }
    expectInvalid('footAnchor.x < 0', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames['idle-front'].footAnchor = { x: 999, y: 128 }
    expectInvalid('footAnchor.x > canvas.w', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames['idle-front'].footAnchor = { x: 48, y: 999 }
    expectInvalid('footAnchor.y > canvas.h', m)
  }
  {
    const m = makeSpriteManifest()
    delete m.frames.sit.seatAnchor
    expectInvalid('sit.seatAnchor 누락', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames.sit.seatAnchor = { x: 48, y: 999 }
    expectInvalid('sit.seatAnchor out of bounds', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames['idle-front'].inkBounds = { x: 80, y: 32, w: 64, h: 96 }
    expectInvalid('inkBounds가 캔버스 밖으로 일부 벗어남', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames['idle-front'].inkBounds = { x: 16, y: 32, w: 0, h: 96 }
    expectInvalid('inkBounds.w = 0', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames['idle-front'].state = 'walkFront'
    expectInvalid('잘못된 state 문자열(idle-front에 walkFront)', m)
  }
  {
    const m = makeSpriteManifest()
    m.frames['idle-front'].direction = 'back'
    expectInvalid('잘못된 direction 문자열(idle-front에 back)', m)
  }
  {
    const m = makeSpriteManifest({ version: 1 })
    expectInvalid('version이 1', m)
  }
  {
    const m = makeSpriteManifest({ pixelRatio: 3 })
    expectInvalid('pixelRatio가 3', m)
  }
  {
    const m = makeSpriteManifest({ frameDurationMs: 0 })
    expectInvalid('frameDurationMs가 0', m)
  }
  {
    const m = makeSpriteManifest({ frameDurationMs: -10 })
    expectInvalid('frameDurationMs가 음수', m)
  }
  {
    const m = makeSpriteManifest({ frameDurationMs: '150' })
    expectInvalid('frameDurationMs가 문자열', m)
  }
  {
    const m = makeSpriteManifest({ mirrorX: 'yes' })
    expectInvalid("mirrorX가 'yes'(boolean 아님)", m)
  }
  {
    const m = makeSpriteManifest()
    delete m.license.author
    expectInvalid('license.author 누락', m)
  }
  {
    const m = makeSpriteManifest({ reducedMotion: { freezeFrameIndex: -1 } })
    expectInvalid('reducedMotion.freezeFrameIndex가 -1', m)
  }
  {
    const m = makeSpriteManifest({ reducedMotion: { freezeFrameIndex: 1.5 } })
    expectInvalid('reducedMotion.freezeFrameIndex가 1.5(정수 아님)', m)
  }
  expectInvalidGarbage('manifest가 null', null)
  expectInvalidGarbage('manifest가 문자열', 'not-a-manifest')
  expectInvalidGarbage('manifest가 배열', [])
}

// ── 항목5 — 경로(src) 누락 시 fallback ────────────────────────────────
section('항목5 — 프레임 src 누락/무효 → emoji 폴백')
{
  const phaseGlyphCases = [
    ['idle', '🚶'],
    ['walking', '🚶'],
    ['leaving', '🚶'],
    ['sitting', '🧘'],
  ]
  for (const [phase, expectedGlyph] of phaseGlyphCases) {
    check(`emoji 폴백 glyph는 characterManifest.js EMOJI_GLYPH_BY_STATE[stateKeyForPhase('${phase}')]와 동일해야 함(사전 확인)`,
      EMOJI_GLYPH_BY_STATE[stateKeyForPhase(phase)] === expectedGlyph)
  }

  for (const srcOverride of ['', undefined]) {
    const m = makeSpriteManifest()
    if (srcOverride === undefined) delete m.frames['idle-front'].src
    else m.frames['idle-front'].src = srcOverride
    const v = validateSpriteManifest(m)
    check(`src ${JSON.stringify(srcOverride)} → validateSpriteManifest ok:false`, v.ok === false, JSON.stringify(v))

    for (const [phase, expectedGlyph] of phaseGlyphCases) {
      const visual = resolveSpriteFrame({ manifest: m, validation: v, phase, direction: 'front', facing: 1, frameIndex: 0 })
      check(`src ${JSON.stringify(srcOverride)}, phase:'${phase}' → emoji 폴백(glyph:'${expectedGlyph}')`,
        visual.kind === 'emoji' && visual.glyph === expectedGlyph, JSON.stringify(visual))
    }
  }
}

// ── 항목6 — 방향 판정(directionForMove) ───────────────────────────────
section('항목6 — directionForMove')
{
  const cases = [
    [[0, 5], 'front'],
    [[0, -5], 'back'],
    [[5, 0], 'side'],
    [[-5, 0], 'side'],
    [[3, 1], 'side'],
    [[1, 3], 'front'],
  ]
  for (const [[dx, dy], expected] of cases) {
    const got = directionForMove(dx, dy)
    check(`directionForMove(${dx}, ${dy}) → '${expected}'`, got === expected, `got '${got}'`)
  }

  check("directionForMove(0, 0, 'back') → 'back'(prev 유지)", directionForMove(0, 0, 'back') === 'back')
  check("directionForMove(0, 0, 'bogus') → 'front'(잘못된 prev는 기본값으로 폴백)", directionForMove(0, 0, 'bogus') === 'front')
  check("directionForMove(NaN, 1, 'side') → 'side'(비유한 dx는 prev로 폴백)", directionForMove(NaN, 1, 'side') === 'side')

  const customWorld = { w: 100, h: 100 }
  check('커스텀 world{100,100}: directionForMove(3,4) → front', directionForMove(3, 4, 'front', customWorld) === 'front')
  check('커스텀 world{100,100}: directionForMove(4,3) → side', directionForMove(4, 3, 'front', customWorld) === 'side')

  // 정규화 후 정확히 |dxN| === |dyN|인 타이 케이스 → side(Math.abs(dyN) > Math.abs(dxN) 조건이 false이므로).
  const tieWorld = { w: 100, h: 100 }
  check('정규화 후 |dxN|==|dyN| 정확 타이 → side', directionForMove(5, 5, 'front', tieWorld) === 'side')
}

// ── 항목7 — facing ────────────────────────────────────────────────────
section('항목7 — facingForMove')
{
  check('facingForMove(5) → 1', facingForMove(5) === 1)
  check('facingForMove(-5) → -1', facingForMove(-5) === -1)
  check('facingForMove(0, -1) → -1(prev 유지)', facingForMove(0, -1) === -1)
  check('facingForMove(0, 7) → 1(잘못된 prev는 기본값 1로 폴백)', facingForMove(0, 7) === 1)
  check('facingForMove(NaN, -1) → -1(prev 유지)', facingForMove(NaN, -1) === -1)
}

// ── 항목8 — state 매핑(spriteStateForPhase) ───────────────────────────
section('항목8 — spriteStateForPhase')
{
  const table = [
    ['idle', 'front', 'idle'],
    ['idle', 'back', 'idle'],
    ['idle', 'side', 'idle'],
    ['idle', undefined, 'idle'],
    ['idle', 'bogus', 'idle'],
    ['walking', 'front', 'walkFront'],
    ['walking', 'back', 'walkBack'],
    ['walking', 'side', 'walkSide'],
    ['walking', undefined, 'walkFront'],
    ['walking', 'bogus', 'walkFront'],
    ['leaving', 'front', 'walkFront'],
    ['leaving', 'back', 'walkBack'],
    ['leaving', 'side', 'walkSide'],
    ['leaving', undefined, 'walkFront'],
    ['leaving', 'bogus', 'walkFront'],
    ['sitting', 'front', 'sit'],
    ['sitting', 'back', 'sit'],
    ['sitting', 'side', 'sit'],
    ['sitting', undefined, 'sit'],
    ['sitting', 'bogus', 'sit'],
  ]
  for (const [phase, direction, expected] of table) {
    const got = direction === undefined ? spriteStateForPhase(phase) : spriteStateForPhase(phase, direction)
    check(`spriteStateForPhase('${phase}', ${JSON.stringify(direction)}) → '${expected}'`, got === expected, `got '${got}'`)
  }
}

// ── 항목9 — 프레임 인덱스(frameIndexAt) ───────────────────────────────
section('항목9 — frameIndexAt')
{
  const cases = [
    [[0, 150, 2], 0],
    [[149, 150, 2], 0],
    [[150, 150, 2], 1],
    [[300, 150, 2], 0],
    [[450, 150, 2], 1],
  ]
  for (const [[elapsed, dur, len], expected] of cases) {
    const got = frameIndexAt(elapsed, dur, len)
    check(`frameIndexAt(${elapsed}, ${dur}, ${len}) → ${expected}`, got === expected, `got ${got}`)
  }
  check('frameIndexAt(임의 elapsed, 150, 1) → 0(단일 프레임)', frameIndexAt(9999, 150, 1) === 0)
  check('frameIndexAt(elapsed, 0, 2) → 0(duration 0)', frameIndexAt(500, 0, 2) === 0)
  check('frameIndexAt(elapsed, -10, 2) → 0(duration 음수)', frameIndexAt(500, -10, 2) === 0)
  check('frameIndexAt(elapsed, NaN, 2) → 0(duration NaN)', frameIndexAt(500, NaN, 2) === 0)
  check('frameIndexAt(-100, 150, 2) → 0(elapsed 음수)', frameIndexAt(-100, 150, 2) === 0)
  check('frameIndexAt(450, 150, 3) → 0(3프레임 wrap, 450/150=3 % 3=0)', frameIndexAt(450, 150, 3) === 0)
  check('frameIndexAt(300, 150, 3) → 2(3프레임 wrap, 300/150=2 % 3=2)', frameIndexAt(300, 150, 3) === 2)
}

// ── 항목10 — 앵커 퍼센트(anchorOffsetPct) ─────────────────────────────
section('항목10 — anchorOffsetPct')
{
  const canvas = { w: 96, h: 128 }
  check('anchorOffsetPct({96,128},{48,128}) → {0,0}', deepEqual(anchorOffsetPct(canvas, { x: 48, y: 128 }), { dxPct: 0, dyPct: 0 }))
  check('anchorOffsetPct({96,128},{48,96}) → {0,25}', deepEqual(anchorOffsetPct(canvas, { x: 48, y: 96 }), { dxPct: 0, dyPct: 25 }))
  check('anchorOffsetPct({96,128},{24,128}) → {25,0}', deepEqual(anchorOffsetPct(canvas, { x: 24, y: 128 }), { dxPct: 25, dyPct: 0 }))
  check('anchorOffsetPct({96,128},{72,64}) → {-25,50}', deepEqual(anchorOffsetPct(canvas, { x: 72, y: 64 }), { dxPct: -25, dyPct: 50 }))

  check('anchorOffsetPct(invalid canvas, valid anchor) → {0,0}', deepEqual(anchorOffsetPct({ w: 0, h: 128 }, { x: 48, y: 64 }), { dxPct: 0, dyPct: 0 }))
  check('anchorOffsetPct(valid canvas, invalid anchor) → {0,0}', deepEqual(anchorOffsetPct(canvas, { x: NaN, y: 64 }), { dxPct: 0, dyPct: 0 }))
  check('anchorOffsetPct(null, null) → {0,0}', deepEqual(anchorOffsetPct(null, null), { dxPct: 0, dyPct: 0 }))
}

// ── 항목11 — resolveSpriteFrame ───────────────────────────────────────
section('항목11 — resolveSpriteFrame')
{
  const manifest = EXAMPLE_SPRITE_MANIFEST
  const validation = validateSpriteManifest(manifest)
  check('사전 확인 — EXAMPLE_SPRITE_MANIFEST ok:true', validation.ok === true, JSON.stringify(validation))

  // idle
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'idle', direction: 'front', facing: 1, frameIndex: 0 })
    check("idle → frameId 'idle-front'", v.frameId === 'idle-front', JSON.stringify(v))
    check('idle → mirrorX:false', v.mirrorX === false)
    check('idle → isAnimated:false', v.isAnimated === false)
  }

  // walking + front, frameIndex 0/1/2/-1
  {
    const idxToFrame = { 0: 'walk-front-a', 1: 'walk-front-b', 2: 'walk-front-a', [-1]: 'walk-front-b' }
    for (const [idx, expectedId] of Object.entries(idxToFrame)) {
      const v = resolveSpriteFrame({ manifest, validation, phase: 'walking', direction: 'front', facing: 1, frameIndex: Number(idx) })
      check(`walking+front frameIndex:${idx} → '${expectedId}'`, v.frameId === expectedId, JSON.stringify(v))
    }
  }

  // walking + back
  {
    const idxToFrame = { 0: 'walk-back-a', 1: 'walk-back-b' }
    for (const [idx, expectedId] of Object.entries(idxToFrame)) {
      const v = resolveSpriteFrame({ manifest, validation, phase: 'walking', direction: 'back', facing: 1, frameIndex: Number(idx) })
      check(`walking+back frameIndex:${idx} → '${expectedId}'`, v.frameId === expectedId, JSON.stringify(v))
    }
  }

  // walking + side, facing 1 → walk-side-a, mirrorX false
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'walking', direction: 'side', facing: 1, frameIndex: 0 })
    check("walking+side facing:1 → frameId 'walk-side-a'", v.frameId === 'walk-side-a', JSON.stringify(v))
    check('walking+side facing:1 → mirrorX:false', v.mirrorX === false)
  }
  // walking + side, facing -1 → mirrorX true (manifest.mirrorX === true)
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'walking', direction: 'side', facing: -1, frameIndex: 0 })
    check('walking+side facing:-1 → mirrorX:true', v.mirrorX === true, JSON.stringify(v))
  }
  // walking + side, facing -1, manifest.mirrorX:false → mirrorX false
  {
    const m2 = makeSpriteManifest({ mirrorX: false })
    const v2 = validateSpriteManifest(m2)
    const v = resolveSpriteFrame({ manifest: m2, validation: v2, phase: 'walking', direction: 'side', facing: -1, frameIndex: 0 })
    check('walking+side facing:-1 with manifest.mirrorX:false → mirrorX:false', v.mirrorX === false, JSON.stringify(v))
  }

  // leaving + side → walkSide 재사용
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'leaving', direction: 'side', facing: 1, frameIndex: 0 })
    check("leaving+side → walkSide 재사용(frameId 'walk-side-a')", v.frameId === 'walk-side-a' && v.state === 'walkSide', JSON.stringify(v))
  }

  // idle facing -1 → mirrorX false (front never mirrored)
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'idle', direction: 'front', facing: -1, frameIndex: 0 })
    check('idle facing:-1 → mirrorX:false(front never mirrored)', v.mirrorX === false, JSON.stringify(v))
  }

  // sitting
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'sitting', direction: 'front', facing: 1, frameIndex: 0 })
    check("sitting → frameId 'sit'", v.frameId === 'sit', JSON.stringify(v))
    check('sitting → activeAnchor === seatAnchor', v.activeAnchor === v.seatAnchor, JSON.stringify(v))
    check('sitting → anchorOffsetPct {0,25}(seatAnchor {48,96} vs canvas {96,128})', deepEqual(v.anchorOffsetPct, { dxPct: 0, dyPct: 25 }), JSON.stringify(v.anchorOffsetPct))
    check('sitting → isAnimated:false', v.isAnimated === false)
  }

  // reducedMotion true, freezeFrameIndex 1 → frameIndex 1, isAnimated false
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'walking', direction: 'front', facing: 1, frameIndex: 0, reducedMotion: true })
    check('reducedMotion:true freezeFrameIndex:0(매니페스트 기본) → frameIndex:0', v.frameIndex === 0, JSON.stringify(v))
    check('reducedMotion:true → isAnimated:false', v.isAnimated === false)

    const m2 = makeSpriteManifest({ reducedMotion: { freezeFrameIndex: 1 } })
    const v2 = validateSpriteManifest(m2)
    const vv = resolveSpriteFrame({ manifest: m2, validation: v2, phase: 'walking', direction: 'front', facing: 1, frameIndex: 0, reducedMotion: true })
    check('reducedMotion:true freezeFrameIndex:1 → frameIndex:1', vv.frameIndex === 1, JSON.stringify(vv))
    check('reducedMotion:true freezeFrameIndex:1 → isAnimated:false', vv.isAnimated === false)

    const m3 = makeSpriteManifest({ reducedMotion: { freezeFrameIndex: 5 } })
    const v3 = validateSpriteManifest(m3)
    const vvv = resolveSpriteFrame({ manifest: m3, validation: v3, phase: 'walking', direction: 'front', facing: 1, frameIndex: 0, reducedMotion: true })
    check('reducedMotion:true freezeFrameIndex:5(2프레임 walkFront 범위 초과) → clamp되어 frameIndex:1', vvv.frameIndex === 1, JSON.stringify(vvv))
  }

  // srcSet
  {
    const vWith = resolveSpriteFrame({ manifest, validation, phase: 'idle', direction: 'front', facing: 1, frameIndex: 0 })
    check('src2x 있음 → srcSet = "<src> 1x, <src2x> 2x"', vWith.srcSet === `${vWith.src} 1x, ${vWith.src2x} 2x`, JSON.stringify(vWith))

    const m2 = makeSpriteManifest()
    delete m2.frames['idle-front'].src2x
    const v2val = validateSpriteManifest(m2)
    const vWithout = resolveSpriteFrame({ manifest: m2, validation: v2val, phase: 'idle', direction: 'front', facing: 1, frameIndex: 0 })
    check('src2x 없음 → srcSet undefined', vWithout.srcSet === undefined, JSON.stringify(vWithout))
  }

  // footAnchor/seatAnchor는 manifest의 객체 그대로(참조 동일)
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'idle', direction: 'front', facing: 1, frameIndex: 0 })
    check('footAnchor는 manifest.frames["idle-front"].footAnchor와 동일 참조', v.footAnchor === manifest.frames['idle-front'].footAnchor)
    const vSit = resolveSpriteFrame({ manifest, validation, phase: 'sitting', direction: 'front', facing: 1, frameIndex: 0 })
    check('sitting의 seatAnchor는 manifest.frames.sit.seatAnchor와 동일 참조', vSit.seatAnchor === manifest.frames.sit.seatAnchor)
  }

  // frameDurationMs 전달
  {
    const v = resolveSpriteFrame({ manifest, validation, phase: 'idle', direction: 'front', facing: 1, frameIndex: 0 })
    check('frameDurationMs가 manifest 값 그대로 전달', v.frameDurationMs === manifest.frameDurationMs)
  }

  // validation.ok false → emoji
  {
    const invalidValidation = { ok: false, errors: ['x'] }
    const v = resolveSpriteFrame({ manifest, validation: invalidValidation, phase: 'idle', direction: 'front', facing: 1, frameIndex: 0 })
    check('validation.ok:false → emoji 폴백', v.kind === 'emoji', JSON.stringify(v))
  }

  // manifest undefined → emoji
  {
    const v = resolveSpriteFrame({ manifest: undefined, validation, phase: 'idle', direction: 'front', facing: 1, frameIndex: 0 })
    check('manifest undefined → emoji 폴백', v.kind === 'emoji', JSON.stringify(v))
  }

  // 인자 없이 호출해도 throw 없음
  {
    let threw = false
    let v
    try {
      v = resolveSpriteFrame()
    } catch {
      threw = true
    }
    check('resolveSpriteFrame() 인자 없이 호출 — throw 없음', !threw)
    check('resolveSpriteFrame() 인자 없이 호출 — emoji 폴백', !threw && v.kind === 'emoji', JSON.stringify(v))
  }
}

// ── 항목12 — 상태 전환 시 anchor 불변 ─────────────────────────────────
section('항목12 — 상태 전환 시 footAnchor 불변, sitting만 seatAnchor로 전환')
{
  const manifest = EXAMPLE_SPRITE_MANIFEST
  const validation = validateSpriteManifest(manifest)
  const expectedFoot = { x: 48, y: 128 }

  const idleV = resolveSpriteFrame({ manifest, validation, phase: 'idle', direction: 'front', facing: 1, frameIndex: 0 })
  const walkFrontV = resolveSpriteFrame({ manifest, validation, phase: 'walking', direction: 'front', facing: 1, frameIndex: 0 })
  const walkBackV = resolveSpriteFrame({ manifest, validation, phase: 'walking', direction: 'back', facing: 1, frameIndex: 0 })
  const walkSideV = resolveSpriteFrame({ manifest, validation, phase: 'walking', direction: 'side', facing: 1, frameIndex: 0 })
  const leavingV = resolveSpriteFrame({ manifest, validation, phase: 'leaving', direction: 'front', facing: 1, frameIndex: 0 })
  const sittingV = resolveSpriteFrame({ manifest, validation, phase: 'sitting', direction: 'front', facing: 1, frameIndex: 0 })

  for (const [label, v] of [
    ['idle', idleV], ['walking(front)', walkFrontV], ['walking(back)', walkBackV],
    ['walking(side)', walkSideV], ['leaving', leavingV],
  ]) {
    check(`${label} → footAnchor === {48,128}(모든 프레임 동일 footAnchor 픽스처)`, deepEqual(v.footAnchor, expectedFoot), JSON.stringify(v.footAnchor))
    check(`${label} → activeAnchor === footAnchor(sitting 아님)`, v.activeAnchor === v.footAnchor)
  }
  check('sitting → activeAnchor는 footAnchor가 아니라 seatAnchor', sittingV.activeAnchor === sittingV.seatAnchor && sittingV.activeAnchor !== sittingV.footAnchor)
}

// ── 항목13 — spriteFrameSources ───────────────────────────────────────
section('항목13 — spriteFrameSources')
{
  const sources = spriteFrameSources(EXAMPLE_SPRITE_MANIFEST)
  check('EXAMPLE_SPRITE_MANIFEST(모든 프레임이 같은 data URI 공유) → 고유 src 1개', sources.length === 1, JSON.stringify(sources))

  const distinctManifest = makeSpriteManifest()
  let i = 0
  for (const frameId of Object.keys(distinctManifest.frames)) {
    i += 1
    distinctManifest.frames[frameId].src = `data:image/png;base64,SRC${i}`
    distinctManifest.frames[frameId].src2x = `data:image/png;base64,SRC${i}_2x`
  }
  const distinctSources = spriteFrameSources(distinctManifest)
  check('프레임마다 고유 src+src2x → 16개(8 * 2)', distinctSources.length === 16, `got ${distinctSources.length}`)

  check('spriteFrameSources(null) → []', deepEqual(spriteFrameSources(null), []))
  check('spriteFrameSources("x") → []', deepEqual(spriteFrameSources('x'), []))
  check('spriteFrameSources({}) → []', deepEqual(spriteFrameSources({}), []))
}

// ── 항목14 — v1 무변경 ────────────────────────────────────────────────
section('항목14 — v1 characterManifest.js 무변경(회귀 가드)')
{
  check("EMOJI_GLYPH_BY_STATE 여전히 {idle:'🚶',walk:'🚶',sit:'🧘'}",
    deepEqual(EMOJI_GLYPH_BY_STATE, { idle: '🚶', walk: '🚶', sit: '🧘' }), JSON.stringify(EMOJI_GLYPH_BY_STATE))
  check("stateKeyForPhase('leaving') === 'walk'", stateKeyForPhase('leaving') === 'walk')
}

// ── 항목15 — SPRITE_MANIFEST_VERSION 상수 사용(2026-09-25 Q4 코드 품질 정리) ──
// validateSpriteManifest는 이제 리터럴 2가 아니라 SPRITE_MANIFEST_VERSION을
// 참조한다(동작은 그대로, 매직넘버만 제거) — 상수 값 자체가 바뀌어도 검사
// 로직이 자동으로 따라가는지, 그리고 빌드된 Paul manifest의 version이 같은
// 상수를 쓰는지 확인한다.
section('항목15 — SPRITE_MANIFEST_VERSION 상수 사용(리터럴 2 제거 회귀 가드)')
{
  check('SPRITE_MANIFEST_VERSION === 2', SPRITE_MANIFEST_VERSION === 2, `got ${SPRITE_MANIFEST_VERSION}`)

  const validWithConstant = makeSpriteManifest({ version: SPRITE_MANIFEST_VERSION })
  const vOk = validateSpriteManifest(validWithConstant)
  check('version: SPRITE_MANIFEST_VERSION → ok:true', vOk.ok === true, JSON.stringify(vOk))

  const rejectedV3 = makeSpriteManifest({ version: 3 })
  const vRejected = validateSpriteManifest(rejectedV3)
  check('version: 3(SPRITE_MANIFEST_VERSION과 다름) → ok:false', vRejected.ok === false, JSON.stringify(vRejected))
  check('version: 3 → errors에 SPRITE_MANIFEST_VERSION 값 언급', vRejected.errors.some(e => e.includes(String(SPRITE_MANIFEST_VERSION))), JSON.stringify(vRejected))

  // buildPaulSpriteManifest(paulSpriteManifest.js)도 리터럴 2가 아니라 같은
  // 상수를 써서 만든다 — 두 파일이 상수를 공유하지 않고 각자 리터럴을
  // 하드코딩했다면 이 단언이 상수 값 변경 시 깨져서 드리프트를 잡아낸다.
  const built = buildPaulSpriteManifest()
  check('buildPaulSpriteManifest().version === SPRITE_MANIFEST_VERSION', built.version === SPRITE_MANIFEST_VERSION, `got ${built.version}`)
}

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
