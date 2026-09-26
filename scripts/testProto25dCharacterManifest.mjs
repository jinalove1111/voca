// scripts/testProto25dCharacterManifest.mjs — Paul Town 2.5D 캐릭터
// 프로토타입(Phase 6A, 2026-09-23) characterManifest.js(캐릭터 스프라이트
// 매니페스트 계약) 순수 단위 테스트.
//
// React/DOM/네트워크 0. characterManifest.js 자체는 아무 것도 import하지
// 않는(의존성 0) 순수 모듈이라 esbuild 번들 없이 plain `node`로 직접
// import한다(scripts/testProto25dBench.mjs가 benchInteraction.js를 같은
// 이유로 직접 import하는 것과 동일 관례 — 확장자 없는 상대 import 문제가
// 애초에 없음).
import {
  validateCharacterManifest,
  resolveCharacterVisual,
  stateKeyForPhase,
  EMOJI_GLYPH_BY_STATE,
} from '../src/utils/town/proto2_5d/characterManifest.js'

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

// scripts/.tmp/p6a_C_sprite_contract.md §1의 예시 매니페스트 그대로(새
// shape 발명 아님) — 유효한 대조군.
const VALID_MANIFEST = {
  version: 1,
  sheet: { src: 'character-sheet.webp', srcSet: 'character-sheet.webp 1x, character-sheet@2x.webp 2x' },
  frameCanvas: { w: 96, h: 128 },
  states: {
    idle: { frames: [{ x: 0, y: 0, w: 96, h: 128 }], fps: 0, footAnchorPx: { x: 48, y: 126 } },
    walk: { frames: [{ x: 96, y: 0, w: 96, h: 128 }, { x: 192, y: 0, w: 96, h: 128 }], fps: 4, footAnchorPx: { x: 48, y: 126 } },
    sit: { frames: [{ x: 288, y: 0, w: 96, h: 96 }], fps: 0, footAnchorPx: { x: 48, y: 94 }, seatAnchorPx: { x: 48, y: 70 } },
  },
  reducedMotion: { freezeFrameIndex: 0 },
}

// ── 항목13 — 매니페스트 없음 → emoji 폴백(모든 phase) ───────────────────
section('항목13 — 매니페스트 없음/무효 → emoji 폴백')
{
  const noManifestValidation = validateCharacterManifest(undefined)
  check('validateCharacterManifest(undefined) → ok:false', noManifestValidation.ok === false)
  check('validateCharacterManifest(undefined) → errors 비어있지 않음', noManifestValidation.errors.length > 0)

  const phases = ['idle', 'walking', 'sitting', 'leaving']
  for (const phase of phases) {
    const visual = resolveCharacterVisual({ manifest: undefined, validation: noManifestValidation, phase, frameIndex: 0 })
    const expectedGlyph = EMOJI_GLYPH_BY_STATE[stateKeyForPhase(phase)]
    check(`resolveCharacterVisual(manifest:undefined, phase:'${phase}') → {kind:'emoji', glyph:'${expectedGlyph}'}`,
      visual.kind === 'emoji' && visual.glyph === expectedGlyph, JSON.stringify(visual))
  }
  // ProtoCharacter.jsx L202의 규칙과 100% 동일해야 함(설계 문서 요구) —
  // sitting만 🧘, 그 외(idle/walking/leaving)는 전부 🚶.
  check("ProtoCharacter.jsx 규칙과 동일 — sitting → '🧘'", EMOJI_GLYPH_BY_STATE[stateKeyForPhase('sitting')] === '🧘')
  check("ProtoCharacter.jsx 규칙과 동일 — idle/walking/leaving → '🚶'",
    EMOJI_GLYPH_BY_STATE[stateKeyForPhase('idle')] === '🚶' &&
    EMOJI_GLYPH_BY_STATE[stateKeyForPhase('walking')] === '🚶' &&
    EMOJI_GLYPH_BY_STATE[stateKeyForPhase('leaving')] === '🚶')
}

// ── 항목14 — 잘못된 매니페스트 → 안전 폴백(throw 없음) ───────────────────
section('항목14 — 잘못된 매니페스트(a~g) → ok:false + errors 비어있지 않음, throw 없음')
{
  const invalidCases = [
    ['(a) states 없음', {}],
    ['(b) states.sit만 있고 idle/walk 없음', { states: { sit: { frames: [{ x: 0, y: 0, w: 10, h: 10 }], footAnchorPx: { x: 5, y: 10 }, seatAnchorPx: { x: 5, y: 8 } } } }],
    ['(c) sit.seatAnchorPx 누락', {
      states: {
        idle: { frames: [{ x: 0, y: 0, w: 10, h: 10 }], footAnchorPx: { x: 5, y: 10 } },
        walk: { frames: [{ x: 0, y: 0, w: 10, h: 10 }], footAnchorPx: { x: 5, y: 10 } },
        sit: { frames: [{ x: 0, y: 0, w: 10, h: 10 }], footAnchorPx: { x: 5, y: 10 } },
      },
    }],
    ['(d) frames:[](빈 배열)', {
      states: {
        idle: { frames: [], footAnchorPx: { x: 5, y: 10 } },
        walk: { frames: [{ x: 0, y: 0, w: 10, h: 10 }], footAnchorPx: { x: 5, y: 10 } },
        sit: { frames: [{ x: 0, y: 0, w: 10, h: 10 }], footAnchorPx: { x: 5, y: 10 }, seatAnchorPx: { x: 5, y: 8 } },
      },
    }],
    ['(e) footAnchorPx.x가 음수', {
      frameCanvas: { w: 96, h: 128 },
      states: {
        idle: { frames: [{ x: 0, y: 0, w: 96, h: 128 }], footAnchorPx: { x: -5, y: 126 } },
        walk: { frames: [{ x: 0, y: 0, w: 96, h: 128 }], footAnchorPx: { x: 48, y: 126 } },
        sit: { frames: [{ x: 0, y: 0, w: 96, h: 96 }], footAnchorPx: { x: 48, y: 94 }, seatAnchorPx: { x: 48, y: 70 } },
      },
    }],
    ['(e) footAnchorPx.x가 NaN', {
      frameCanvas: { w: 96, h: 128 },
      states: {
        idle: { frames: [{ x: 0, y: 0, w: 96, h: 128 }], footAnchorPx: { x: NaN, y: 126 } },
        walk: { frames: [{ x: 0, y: 0, w: 96, h: 128 }], footAnchorPx: { x: 48, y: 126 } },
        sit: { frames: [{ x: 0, y: 0, w: 96, h: 96 }], footAnchorPx: { x: 48, y: 94 }, seatAnchorPx: { x: 48, y: 70 } },
      },
    }],
    ['(f) fps:0인데 frames.length>1', {
      frameCanvas: { w: 96, h: 128 },
      states: {
        idle: { frames: [{ x: 0, y: 0, w: 96, h: 128 }], footAnchorPx: { x: 48, y: 126 } },
        walk: { frames: [{ x: 0, y: 0, w: 96, h: 128 }, { x: 96, y: 0, w: 96, h: 128 }], fps: 0, footAnchorPx: { x: 48, y: 126 } },
        sit: { frames: [{ x: 0, y: 0, w: 96, h: 96 }], footAnchorPx: { x: 48, y: 94 }, seatAnchorPx: { x: 48, y: 70 } },
      },
    }],
    ['(g) manifest가 null', null],
    ['(g) manifest가 문자열', 'not-a-manifest'],
    ['(g) manifest가 배열', []],
  ]

  for (const [label, manifest] of invalidCases) {
    let validation
    let threwOnValidate = false
    try {
      validation = validateCharacterManifest(manifest)
    } catch {
      threwOnValidate = true
      validation = { ok: false, errors: ['threw'] }
    }
    check(`${label} — validateCharacterManifest이 throw하지 않음`, !threwOnValidate)
    check(`${label} — ok:false`, validation.ok === false, JSON.stringify(validation))
    check(`${label} — errors 비어있지 않음`, Array.isArray(validation.errors) && validation.errors.length > 0, JSON.stringify(validation))

    let threwOnResolve = false
    let visual
    try {
      visual = resolveCharacterVisual({ manifest, validation, phase: 'idle', frameIndex: 0 })
    } catch {
      threwOnResolve = true
    }
    check(`${label} — resolveCharacterVisual이 throw하지 않음`, !threwOnResolve)
    check(`${label} — resolveCharacterVisual이 emoji로 폴백`, !threwOnResolve && visual && visual.kind === 'emoji', JSON.stringify(visual))
  }
}

// ── 대조군 — §1 유효 매니페스트는 ok:true ────────────────────────────────
section('대조군 — 유효한 §1 예시 매니페스트')
{
  const validation = validateCharacterManifest(VALID_MANIFEST)
  check('유효한 매니페스트 → ok:true', validation.ok === true, JSON.stringify(validation))
  check('유효한 매니페스트 → errors:[]', Array.isArray(validation.errors) && validation.errors.length === 0, JSON.stringify(validation))

  const idleVisual = resolveCharacterVisual({ manifest: VALID_MANIFEST, validation, phase: 'idle', frameIndex: 0 })
  check("phase:'idle' → kind:'sprite'", idleVisual.kind === 'sprite', JSON.stringify(idleVisual))
  check("phase:'idle' → footAnchorPx가 매니페스트 idle 상태 값과 일치", JSON.stringify(idleVisual.footAnchorPx) === JSON.stringify({ x: 48, y: 126 }))

  const walkVisual0 = resolveCharacterVisual({ manifest: VALID_MANIFEST, validation, phase: 'walking', frameIndex: 0 })
  const walkVisual1 = resolveCharacterVisual({ manifest: VALID_MANIFEST, validation, phase: 'walking', frameIndex: 1 })
  check("phase:'walking' frameIndex:0 → walk 첫 프레임(x:96)", walkVisual0.kind === 'sprite' && walkVisual0.frame.x === 96, JSON.stringify(walkVisual0))
  check("phase:'walking' frameIndex:1 → walk 두 번째 프레임(x:192)", walkVisual1.kind === 'sprite' && walkVisual1.frame.x === 192, JSON.stringify(walkVisual1))
  const walkVisual2 = resolveCharacterVisual({ manifest: VALID_MANIFEST, validation, phase: 'walking', frameIndex: 2 })
  check('frameIndex가 frames.length를 넘어가도 modulo로 감싸 크래시 없음(2 → 0번 프레임)', walkVisual2.kind === 'sprite' && walkVisual2.frame.x === 96, JSON.stringify(walkVisual2))

  const leavingVisual = resolveCharacterVisual({ manifest: VALID_MANIFEST, validation, phase: 'leaving', frameIndex: 0 })
  check("phase:'leaving' → walk state 재사용(전용 아트 없음, §0-A)", leavingVisual.kind === 'sprite' && leavingVisual.frame.x === 96, JSON.stringify(leavingVisual))

  const sitVisual = resolveCharacterVisual({ manifest: VALID_MANIFEST, validation, phase: 'sitting', frameIndex: 0 })
  check("phase:'sitting' → kind:'sprite'", sitVisual.kind === 'sprite', JSON.stringify(sitVisual))
  check("phase:'sitting' → seatAnchorPx가 매니페스트 sit 상태 값과 일치", JSON.stringify(sitVisual.seatAnchorPx) === JSON.stringify({ x: 48, y: 70 }))
  check("phase:'sitting' → isAnimated:false(프레임 1개)", sitVisual.isAnimated === false)
  check("phase:'walking' → isAnimated:true(프레임 2개)", walkVisual0.isAnimated === true)

  check('sheet.src가 있으면 src로 그대로 전달', idleVisual.src === 'character-sheet.webp')
  check('sheet.srcSet이 있으면 srcSet으로 그대로 전달', idleVisual.srcSet === VALID_MANIFEST.sheet.srcSet)
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
