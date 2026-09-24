// scripts/testProto25dSpriteAdapter.mjs — Paul Town 2.5D 캐릭터
// 프로토타입 Phase 6B(2026-09-24) ProtoCharacter.jsx v2 스프라이트 어댑터
// React SSR 단위 테스트.
//
// 실제 컴포넌트(ProtoCharacter.jsx)를 esbuild로 번들(jsx:automatic,
// react/react-dom external)해 react-dom/server의 renderToStaticMarkup으로
// 렌더한 정적 마크업을 단언한다 — scripts/.tmp/phase4Ssr.mjs(Phase 6B
// 사전 스크래치, 이 세션이 먼저 증명한 패턴)와
// scripts/testPaulTownProgression.mjs의 EnglishGarden.jsx SSR 구간과 동일
// 기법(새 하네스 기법 발명 없음). jsdom/브라우저 없이 문자열 마크업만
// 검증하므로 네트워크 0, DOM API 0.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

const esbuild = (await import('esbuild')).default
await esbuild.build({
  entryPoints: ['src/components/town/proto2_5d/ProtoCharacter.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: 'scripts/.tmp/protoSpriteAdapterSsr',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
})

const React = (await import('react')).default
const { renderToStaticMarkup } = await import('react-dom/server')
const mod = await import(pathToFileURL(path.resolve('scripts/.tmp/protoSpriteAdapterSsr/ProtoCharacter.js')).href)
const ProtoCharacter = mod.default

const { EXAMPLE_SPRITE_MANIFEST, makeSpriteManifest, withoutFrame } =
  await import(pathToFileURL(path.resolve('tests/fixtures/proto2_5d/spriteManifest.example.mjs')).href)

// v1 계약(characterManifest.js) 유효 매니페스트 — 값 재사용이 아니라
// scripts/testProto25dCharacterManifest.mjs VALID_MANIFEST를 그대로 복사한
// 대조군(그 파일 자체의 export가 아니므로 값 복제, 그 파일의 §1 예시와
// byte-identical — 새 shape 발명 아님).
const VALID_V1_MANIFEST = {
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

function render(props) {
  return renderToStaticMarkup(React.createElement(ProtoCharacter, {
    phase: 'idle', leftPct: 50, topPct: 60, reducedMotion: false, ...props,
  }))
}

/** 바깥 [data-proto-character] div의 style="..." 값만 뽑아낸다. */
function extractOuterStyle(html) {
  const m = html.match(/<div[^>]*\bdata-proto-character=""[^>]*\bstyle="([^"]*)"/)
  return m ? m[1] : null
}

/** [data-proto-character-shadow] span 태그 전체(여는 태그)를 뽑아낸다. */
function extractShadowTag(html) {
  const m = html.match(/<span[^>]*\bdata-proto-character-shadow=""[^>]*>/)
  return m ? m[0] : null
}

function countOccurrences(html, needle) {
  return html.split(needle).length - 1
}

// ── 항목1 — emoji 폴백 기본(매니페스트 없음) ──────────────────────────
section('항목1 — emoji 폴백 기본(spriteManifest 없음)')
{
  const phaseGlyph = [['idle', '🚶'], ['walking', '🚶'], ['leaving', '🚶'], ['sitting', '🧘']]
  for (const [phase, glyph] of phaseGlyph) {
    const html = render({ phase })
    check(`phase:'${phase}' — data-proto-character-glyph 존재`, html.includes('data-proto-character-glyph'))
    check(`phase:'${phase}' — glyph 텍스트가 '${glyph}'`, html.includes(`>${glyph}<`), html.slice(0, 0))
  }

  const htmlIdle = render({ phase: 'idle' })
  check('매니페스트 없음 — data-proto-character-sprite 마크업 없음', !htmlIdle.includes('data-proto-character-sprite'))
  check("매니페스트 없음 — data-character-direction 기본값 'front'", htmlIdle.includes('data-character-direction="front"'), htmlIdle)
  check('그림자 span(data-proto-character-shadow)이 정확히 1개', countOccurrences(htmlIdle, 'data-proto-character-shadow=""') === 1)

  const bobDivMatch = htmlIdle.match(/<div[^>]*\bdata-proto-character=""[^>]*>(<div)/)
  check('bob div가 [data-proto-character]의 첫 번째 자식 div(S5 계약 유지)', !!bobDivMatch, htmlIdle)
}

// ── 항목2 — 무효 manifest → emoji와 동일 마크업 ───────────────────────
section('항목2 — 무효 spriteManifest → 매니페스트 없음과 완전히 동일한 마크업')
{
  const baseline = render({ phase: 'idle' })

  const missingSit = withoutFrame(EXAMPLE_SPRITE_MANIFEST, 'sit')
  const htmlMissingSit = render({ phase: 'idle', spriteManifest: missingSit })
  check("sit 프레임 누락(무효 매니페스트) — 마크업이 매니페스트 없음과 문자열 완전 일치", htmlMissingSit === baseline)

  const wrongVersion = makeSpriteManifest({ version: 1 })
  const htmlWrongVersion = render({ phase: 'idle', spriteManifest: wrongVersion })
  check('version:1(무효 매니페스트) — 마크업이 매니페스트 없음과 문자열 완전 일치', htmlWrongVersion === baseline)
}

// ── 항목3 — 유효 manifest: phase/direction/facing별 프레임 ────────────
section('항목3 — 유효한 v2 매니페스트: phase/direction/facing별 프레임 선택')
{
  const manifest = EXAMPLE_SPRITE_MANIFEST

  {
    const html = render({ phase: 'idle', spriteManifest: manifest, direction: 'front', facing: 1 })
    check("idle → frameId 'idle-front'", html.includes('data-proto-character-sprite-frame="idle-front"'), html)
    check("idle → mirror '0'", html.includes('data-proto-character-sprite-mirror="0"'))
    check('idle → scaleX(-1) 없음(facing layer 미미러)', !html.includes('scaleX(-1)'))
  }
  {
    const html = render({ phase: 'walking', spriteManifest: manifest, direction: 'front', facing: 1 })
    check("walking+front → frameId 'walk-front-a'", html.includes('data-proto-character-sprite-frame="walk-front-a"'), html)
  }
  {
    const html = render({ phase: 'walking', spriteManifest: manifest, direction: 'back', facing: 1 })
    check("walking+back → frameId 'walk-back-a'", html.includes('data-proto-character-sprite-frame="walk-back-a"'), html)
  }
  {
    const html = render({ phase: 'walking', spriteManifest: manifest, direction: 'side', facing: 1 })
    check("walking+side facing:1 → frameId 'walk-side-a'", html.includes('data-proto-character-sprite-frame="walk-side-a"'), html)
    check("walking+side facing:1 → mirror '0'", html.includes('data-proto-character-sprite-mirror="0"'))
  }
  {
    const html = render({ phase: 'walking', spriteManifest: manifest, direction: 'side', facing: -1 })
    check("walking+side facing:-1 → mirror '1'", html.includes('data-proto-character-sprite-mirror="1"'), html)
    check('walking+side facing:-1 → facing layer에 scaleX(-1)', html.includes('scaleX(-1)'))
  }
  {
    const html = render({ phase: 'leaving', spriteManifest: manifest, direction: 'side', facing: 1 })
    check("leaving+side → walkSide 재사용(frameId 'walk-side-a')", html.includes('data-proto-character-sprite-frame="walk-side-a"'), html)
  }
  {
    const html = render({ phase: 'sitting', spriteManifest: manifest, direction: 'front', facing: 1 })
    check("sitting → frameId 'sit'", html.includes('data-proto-character-sprite-frame="sit"'), html)
    check('sitting → anchor layer translate(0%, 25%)(seatAnchor 기준)', html.includes('translate(0%, 25%)'), html)
  }
  {
    const html = render({ phase: 'idle', spriteManifest: manifest, direction: 'front', facing: -1 })
    check("idle facing:-1 → mirror '0'(front는 절대 미러 안 됨)", html.includes('data-proto-character-sprite-mirror="0"'), html)
  }
  {
    const html = render({ phase: 'walking', spriteManifest: manifest, direction: 'front', facing: 1, reducedMotion: true })
    check("reducedMotion:true(freeze 기본 0) walking → frameId 'walk-front-a'", html.includes('data-proto-character-sprite-frame="walk-front-a"'), html)
  }
  {
    const m2 = makeSpriteManifest({ reducedMotion: { freezeFrameIndex: 1 } })
    const html = render({ phase: 'walking', spriteManifest: m2, direction: 'front', facing: 1, reducedMotion: true })
    check("reducedMotion:true freezeFrameIndex:1 walking → frameId 'walk-front-b'", html.includes('data-proto-character-sprite-frame="walk-front-b"'), html)
  }
}

// ── 항목4 — 앵커/외곽 스타일(emoji ↔ sprite 모드 간 불변) ────────────
section('항목4 — 앵커 레이어 퍼센트 + 외곽(outer) 발-앵커 스타일이 모드 간 불변')
{
  const idleFootAnchorOverride = makeSpriteManifest()
  idleFootAnchorOverride.frames['idle-front'].footAnchor = { x: 24, y: 128 }
  const htmlIdleOverride = render({ phase: 'idle', spriteManifest: idleFootAnchorOverride, direction: 'front', facing: 1 })
  check('idle footAnchor{24,128}(canvas 96x128) → anchor layer translate(25%, 0%)', htmlIdleOverride.includes('translate(25%, 0%)'), htmlIdleOverride)

  const htmlWalkingDefault = render({ phase: 'walking', spriteManifest: EXAMPLE_SPRITE_MANIFEST, direction: 'front', facing: 1 })
  check('walking 기본 footAnchor{48,128}(canvas 96x128) → anchor layer translate(0%, 0%)', htmlWalkingDefault.includes('translate(0%, 0%)'), htmlWalkingDefault)

  const sameProps = { phase: 'idle', leftPct: 50, topPct: 60, reducedMotion: false, direction: 'front', facing: 1 }
  const htmlEmoji = render(sameProps)
  const htmlSprite = render({ ...sameProps, spriteManifest: EXAMPLE_SPRITE_MANIFEST })
  const styleEmoji = extractOuterStyle(htmlEmoji)
  const styleSprite = extractOuterStyle(htmlSprite)
  check('outer [data-proto-character] style 속성이 emoji/sprite 모드 간 완전히 동일 문자열', styleEmoji != null && styleEmoji === styleSprite, `emoji=${styleEmoji}\n  sprite=${styleSprite}`)
  check("outer style에 left:50% 포함(두 모드 공통)", /left:50%/.test(styleEmoji || ''), styleEmoji)
  check("outer style에 top:60% 포함(두 모드 공통)", /top:60%/.test(styleEmoji || ''), styleEmoji)
  check('outer style에 translate(-50%, -100%) scale( 포함(발 앵커 논리 위치 불변)', (styleEmoji || '').includes('translate(-50%, -100%) scale('), styleEmoji)
}

// ── 항목5 — depth(z-index/scale)·그림자 마크업이 모드 간 불변 ─────────
section('항목5 — z-index/scale/그림자 마크업이 emoji ↔ sprite 모드 간 동일')
{
  const sameProps = { phase: 'idle', leftPct: 50, topPct: 60, reducedMotion: false, direction: 'front', facing: 1 }
  const htmlEmoji = render(sameProps)
  const htmlSprite = render({ ...sameProps, spriteManifest: EXAMPLE_SPRITE_MANIFEST })
  const styleEmoji = extractOuterStyle(htmlEmoji) || ''
  const styleSprite = extractOuterStyle(htmlSprite) || ''
  const zEmoji = (styleEmoji.match(/z-index:([0-9]+)/) || [])[1]
  const zSprite = (styleSprite.match(/z-index:([0-9]+)/) || [])[1]
  check('z-index 값이 emoji/sprite 모드 간 동일(같은 topPct)', zEmoji != null && zEmoji === zSprite, `emoji=${zEmoji} sprite=${zSprite}`)
  const scaleEmoji = (styleEmoji.match(/scale\(([^)]+)\)/) || [])[1]
  const scaleSprite = (styleSprite.match(/scale\(([^)]+)\)/) || [])[1]
  check('scale 값이 emoji/sprite 모드 간 동일(같은 topPct)', scaleEmoji != null && scaleEmoji === scaleSprite, `emoji=${scaleEmoji} sprite=${scaleSprite}`)

  const shadowEmoji = extractShadowTag(htmlEmoji)
  const shadowSprite = extractShadowTag(htmlSprite)
  check('그림자(span[data-proto-character-shadow]) 마크업이 emoji/sprite 모드 간 완전히 동일', shadowEmoji != null && shadowEmoji === shadowSprite, `emoji=${shadowEmoji}\n  sprite=${shadowSprite}`)
}

// ── 항목6 — 모바일 최소 폭 하한 ────────────────────────────────────────
section('항목6 — 모바일 시각 보정(캐릭터 기준폭 px 하한)이 두 모드 모두 유지')
{
  const htmlEmoji = render({ phase: 'idle' })
  const htmlSprite = render({ phase: 'idle', spriteManifest: EXAMPLE_SPRITE_MANIFEST })
  check('emoji 모드 outer width 스타일에 max(8%, 40px) 포함', htmlEmoji.includes('max(8%, 40px)'), htmlEmoji)
  check('sprite 모드 outer width 스타일에 max(8%, 40px) 포함(모드와 무관한 outer 속성)', htmlSprite.includes('max(8%, 40px)'), htmlSprite)
}

// ── 항목7 — img 속성(src/width/srcSet) ────────────────────────────────
section('항목7 — v2 <img> 속성(src/width/srcSet)')
{
  const expectedSrc = EXAMPLE_SPRITE_MANIFEST.frames['idle-front'].src
  const htmlWithSrc2x = render({ phase: 'idle', spriteManifest: EXAMPLE_SPRITE_MANIFEST, direction: 'front', facing: 1 })
  check('img src가 fixture 데이터 URI와 정확히 일치', htmlWithSrc2x.includes(`src="${expectedSrc}"`), htmlWithSrc2x.slice(0, 200))
  check('img style에 width:100% 포함', /width:100%/.test(htmlWithSrc2x), htmlWithSrc2x)
  // React 서버 렌더러는 srcSet prop을 그대로 srcSet="..." 속성으로 직렬화한다
  // (실측 — 소문자 srcset이 아님, 표준 HTML 소문자 관례와 다름).
  check('src2x가 있는 fixture → srcSet 속성 존재', htmlWithSrc2x.includes('srcSet='), htmlWithSrc2x)

  const noSrc2x = makeSpriteManifest()
  delete noSrc2x.frames['idle-front'].src2x
  const htmlNoSrc2x = render({ phase: 'idle', spriteManifest: noSrc2x, direction: 'front', facing: 1 })
  check('src2x가 없는 프레임 → srcSet 속성 없음', !htmlNoSrc2x.includes('srcSet='), htmlNoSrc2x)
}

// ── 항목8 — v1 manifest prop 무변경 + v2 우선순위 ──────────────────────
section('항목8 — v1 manifest prop은 그대로 동작, v2가 있으면 v2 우선')
{
  const htmlV1 = render({ phase: 'idle', manifest: VALID_V1_MANIFEST })
  check('v1 manifest → data-proto-character-sprite 존재', htmlV1.includes('data-proto-character-sprite'), htmlV1)
  check('v1 manifest → data-proto-character-sprite-frame는 없음(v1은 이 속성을 렌더하지 않음)', !htmlV1.includes('data-proto-character-sprite-frame'), htmlV1)

  const htmlBoth = render({ phase: 'idle', manifest: VALID_V1_MANIFEST, spriteManifest: EXAMPLE_SPRITE_MANIFEST, direction: 'front', facing: 1 })
  check('v1 manifest + v2 spriteManifest 둘 다 있으면 v2가 우선(data-proto-character-sprite-frame 존재)', htmlBoth.includes('data-proto-character-sprite-frame='), htmlBoth)
}

// ── 항목9 — direction 값 전달 ───────────────────────────────────────────
section('항목9 — direction prop이 data-character-direction으로 그대로 전달')
{
  for (const direction of ['front', 'back', 'side']) {
    const html = render({ phase: 'idle', direction })
    check(`direction:'${direction}' → data-character-direction="${direction}"`, html.includes(`data-character-direction="${direction}"`), html)
  }
}

// ── 항목10 — Phase 6D(2026-09-25) 계약 잠금 ────────────────────────────
// 런타임 cadence(프레임 간격 = frameDurationMs), @2x→1x→이모지 2단계 강등,
// overlay role/aria-label을 소스 정규식 + SSR로 고정한다. 새 하네스 기법
// 발명 없음 — 이 파일이 이미 import/사용 중인 fs/path로 소스 문자열을 직접
// 읽어 regex로 단언한다(react-dom/server는 hooks 내부 setInterval 실행 시점
// 값을 관측할 방법이 없어 SSR로는 검증 불가능한 항목이라 SOURCE 방식을 쓴다).
section('항목10 — Phase 6D 계약 잠금(cadence/degradation/overlay)')
{
  const protoCharacterSrc = fs.readFileSync(
    path.resolve('src/components/town/proto2_5d/ProtoCharacter.jsx'), 'utf8',
  )
  const protoScreenSrc = fs.readFileSync(
    path.resolve('src/components/town/proto2_5d/Proto25DScreen.jsx'), 'utf8',
  )

  // (a) 런타임 cadence — spriteV2Fps = 1000 / frameDurationMs, 재생 간격도
  // 동일 공식(1000 / fps) → 결과적으로 간격 == frameDurationMs.
  const fpsFormulaMatches = protoCharacterSrc.match(/1000\s*\/\s*spriteManifest\.frameDurationMs/g) || []
  check('SOURCE — spriteV2Fps = 1000 / spriteManifest.frameDurationMs 가 정확히 1회 등장', fpsFormulaMatches.length === 1, `matches=${fpsFormulaMatches.length}`)

  const intervalMatches = protoCharacterSrc.match(/setInterval\(\(\) => \{[\s\S]*?\}, 1000 \/ fps\)/g) || []
  check('SOURCE — useSpriteFrameIndex의 setInterval(…, 1000 / fps)가 정확히 1회 등장(간격 = frameDurationMs)', intervalMatches.length === 1, `matches=${intervalMatches.length}`)

  // (b) SSR — walking+side, t=0(마운트 직후, useEffect 미실행) → 항상
  // frameIndex 0(freeze 기본값과 동일) → 'walk-side-a'. 정상 렌더에는
  // degraded 속성이 없어야 한다(2단계 강등 이전 상태).
  {
    const html = render({ phase: 'walking', spriteManifest: EXAMPLE_SPRITE_MANIFEST, direction: 'side', facing: 1 })
    check("SSR — walking+side(t=0) → frameId 'walk-side-a'(index 0)", html.includes('data-proto-character-sprite-frame="walk-side-a"'), html)
    check('SSR — 정상(비강등) 렌더에는 data-proto-character-sprite-degraded 속성 없음', !html.includes('data-proto-character-sprite-degraded'), html)
  }

  // (c) Proto25DScreen.jsx SSR은 hooks/DOM 의존이라 이 하네스로 렌더하지
  // 않는다(파일 헤더 주석 그대로) — overlay root 근처(data-testid=
  // "proto25d-root" 이후 900자, 그 사이의 긴 한글 주석 블록을 포함해도
  // role="region"/aria-label까지 닿도록 여유를 둔다)에 role="region"/
  // aria-label이 있는지 정규식으로만 확인한다.
  const overlayRootMatch = protoScreenSrc.match(/data-testid="proto25d-root"[\s\S]{0,900}/)
  check('SOURCE — overlay root(data-testid="proto25d-root") 근처에 role="region"', !!overlayRootMatch && /role="region"/.test(overlayRootMatch[0]), overlayRootMatch ? overlayRootMatch[0] : '(no match)')
  check('SOURCE — overlay root 근처에 aria-label="Paul Town 2.5D 프로토타입"', !!overlayRootMatch && overlayRootMatch[0].includes('aria-label="Paul Town 2.5D 프로토타입"'), overlayRootMatch ? overlayRootMatch[0] : '(no match)')

  // (d) v2 img의 onError 핸들러 + 2단계 강등 state 이름 존재.
  check('SOURCE — v2 sprite 2단계 강등 state: spriteV2SrcSetFailed 존재', protoCharacterSrc.includes('spriteV2SrcSetFailed'))
  check('SOURCE — v2 sprite 2단계 강등 state: spriteV2LoadFailed 존재', protoCharacterSrc.includes('spriteV2LoadFailed'))
  const v2ImgBlockMatch = protoCharacterSrc.match(/data-proto-character-sprite-mirror=\{spriteVisual\.mirrorX[\s\S]{0,500}/)
  check('SOURCE — v2 <img>에 onError 핸들러 존재', !!v2ImgBlockMatch && /onError=\{/.test(v2ImgBlockMatch[0]), v2ImgBlockMatch ? v2ImgBlockMatch[0] : '(no match)')
  check('SOURCE — srcSet이 spriteV2SrcSetFailed일 때 undefined로 치환(1x 전용 재시도)', protoCharacterSrc.includes('srcSet={spriteV2SrcSetFailed ? undefined : spriteVisual.srcSet}'))
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
