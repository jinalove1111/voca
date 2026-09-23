// src/utils/town/proto2_5d/sceneFixture.js — Paul Town 2.5D 캐릭터
// 프로토타입(Phase 6A, 2026-09-23) 씬 구성 단일 진실 원천.
//
// 순수 데이터 + 파생 함수만 — React/DOM 의존 없음, Math.random/Date.now
// 없음(walkGrid.js/pathfinding.js/benchInteraction.js와 동일 관례). V2
// 컴포넌트/상태는 여전히 import하지 않는다(격리 유지,
// ASTRA_HANDOFF_2026-09-21.md §12/§19). depthScale(worldContract.js)만
// 재사용한다 — walkGrid.js가 이미 같은 모듈에서 WORLD를 가져다 쓰는 것과
// 동일한 "순수 유틸 재사용"이지 "V2 실데이터와 결합"이 아니다
// (depthVisual.js 헤더 주석과 동일 구분 기준).
//
// townAsset()(src/assets/town/index.js)는 일부러 여기서 import하지 않는다
// — walkGrid.js가 이 파일을 import해 OBSTACLES를 파생하므로(아래
// deriveObstacles), 여기서 townAsset을 끌어오면 walkGrid.js의 import
// 그래프에 .webp 정적 asset이 섞여 scripts/testProto25dWalkGrid.mjs/
// testProto25dDepth.mjs/testProto25dBench.mjs(전부 esbuild로 walkGrid.js를
// 번들)가 매번 '.webp':'dataurl' 로더를 추가로 요구하게 된다(회귀 위험 —
// p6a_A_assets.md §3이 경고한 "지연 로드 모듈이 공유 모듈을 끌어들여 번들
// 판별이 꼬이는" 문제와 같은 종류의 결합을 walkGrid.js에 새로 만들지
// 않는다). assetKey는 문자열 데이터로만 들고 있고, 실제 URL 해석은 호출부
// (Proto25DScreen.jsx, 이미 townAsset을 import 중 — 헤더:76)와 테스트
// (scripts/testProto25dSceneFixture.mjs, 자체적으로 assets/town/index.js를
// 별도 번들)가 각자 한다.
import { depthScale } from '../worldContract'

// ── 씬 픽스처(단일 진실 원천) ─────────────────────────────────────────────
// 각 항목의 anchor는 world-%(bottom-center, 지면 접점) —
// ProtoCharacter.jsx의 translate(-50%,-100%) 앵커와 동일 관례. 기존 3개
// (demo-building/demo-bench/demo-tree)는 walkGrid.js OBSTACLES의 기존
// 좌표를 collisionRect로 그대로 고정한다(byte-identical — 아래
// deriveObstacles가 이 필드를 그대로 반환하므로 회귀 없음, 팀장 지시
// "pinned"). 나머지(house-annex/tree-plaza-nw/ne/shrub-sw/se)는
// footprintDepthPct(앵커 y에서 아래로 뻗는 깊이, world-%, anchor.y와 같은
// 축 — Y_RATIO 보정 없음, p6a_B_composition.md §0의 핵심 발견: proto2_5d의
// x/y는 placementContract.js와 달리 이미 순수 0~100 world-%라 그 파일의
// h*0.45/Y_RATIO 공식을 그대로 베끼면 안 된다)로 collisionRect를
// 대신한다. naturalAspect는 실제 아트 파일의 h/w(assetManifest.js 실측
// 픽셀 — my-house/british-cottage 128x160, tree 96x128, bench 72x48,
// flower-garden 96x64).
export const SCENE_FIXTURE = Object.freeze([
  Object.freeze({
    id: 'demo-building',
    assetKey: 'buildings/my-house',
    anchor: Object.freeze({ x: 50, y: 40 }),
    widthPct: 24,
    minWidthPx: undefined,
    naturalAspect: 160 / 128,
    obstacle: true,
    collisionRect: Object.freeze({ x0: 38, x1: 62, y0: 24, y1: 40 }),
    footprintDepthPct: undefined,
    depthLayer: 'objects',
    shadow: true,
    interaction: null,
  }),
  Object.freeze({
    id: 'demo-bench',
    // 벤치는 기존 전용 렌더 블록(Proto25DScreen.jsx, BENCH_ASSET_MIN_WIDTH_PX/
    // benchRenderedSizePx 등 benchInteraction.js 계약)을 그대로 유지하고
    // 이 SCENE_FIXTURE의 범용 렌더 루프에서는 건너뛴다(팀장 지시 — "keep
    // the bench block and skip it in the generic map"). 이 항목은 그래도
    // deriveObstacles(OBSTACLES 파생)의 진실 원천으로는 계속 참여해야 하므로
    // (walkGrid.js가 이 배열 전체를 소스로 쓴다) 픽스처에는 남겨 둔다 —
    // assetKey/naturalAspect/minWidthPx는 benchInteraction.js의 동일 상수
    // (BENCH_ASSET_MIN_WIDTH_PX=44, BENCH_ASSET_ASPECT=48/72)와 값만
    // 맞춰 문서화용으로 채운다(실제 렌더 경로는 여전히 그 상수들 자신).
    assetKey: 'decorations/bench',
    anchor: Object.freeze({ x: 23.5, y: 63 }),
    widthPct: 7,
    minWidthPx: 44,
    naturalAspect: 48 / 72,
    obstacle: true,
    collisionRect: Object.freeze({ x0: 20, x1: 27, y0: 58, y1: 63 }),
    footprintDepthPct: undefined,
    depthLayer: 'objects',
    shadow: true,
    interaction: 'bench',
  }),
  Object.freeze({
    id: 'demo-tree',
    assetKey: 'nature/tree',
    anchor: Object.freeze({ x: 73, y: 62 }),
    widthPct: 6,
    minWidthPx: undefined,
    naturalAspect: 128 / 96,
    obstacle: true,
    collisionRect: Object.freeze({ x0: 70, x1: 76, y0: 56, y1: 62 }),
    footprintDepthPct: undefined,
    depthLayer: 'objects',
    shadow: true,
    interaction: null,
  }),
  Object.freeze({
    id: 'house-annex',
    assetKey: 'buildings/british-cottage',
    anchor: Object.freeze({ x: 13, y: 42 }),
    widthPct: 14,
    minWidthPx: undefined,
    naturalAspect: 160 / 128,
    obstacle: true,
    collisionRect: undefined,
    footprintDepthPct: 14,
    depthLayer: 'objects',
    shadow: true,
    interaction: null,
  }),
  Object.freeze({
    id: 'tree-plaza-nw',
    assetKey: 'nature/tree',
    anchor: Object.freeze({ x: 43, y: 56 }),
    widthPct: 6,
    minWidthPx: undefined,
    naturalAspect: 128 / 96,
    obstacle: true,
    collisionRect: undefined,
    footprintDepthPct: 6,
    depthLayer: 'objects',
    shadow: true,
    interaction: null,
  }),
  Object.freeze({
    id: 'tree-plaza-ne',
    assetKey: 'nature/tree',
    anchor: Object.freeze({ x: 59, y: 54 }),
    widthPct: 6,
    minWidthPx: undefined,
    naturalAspect: 128 / 96,
    obstacle: true,
    collisionRect: undefined,
    footprintDepthPct: 6,
    depthLayer: 'objects',
    shadow: true,
    interaction: null,
  }),
  Object.freeze({
    id: 'shrub-sw',
    assetKey: 'nature/flower-garden',
    anchor: Object.freeze({ x: 32, y: 72 }),
    widthPct: 4,
    minWidthPx: 28,
    naturalAspect: 64 / 96,
    obstacle: true,
    collisionRect: undefined,
    footprintDepthPct: 4,
    depthLayer: 'objects',
    shadow: true,
    interaction: null,
  }),
  Object.freeze({
    id: 'shrub-se',
    assetKey: 'nature/flower-garden',
    anchor: Object.freeze({ x: 66, y: 72 }),
    widthPct: 4,
    minWidthPx: 28,
    naturalAspect: 64 / 96,
    obstacle: true,
    collisionRect: undefined,
    footprintDepthPct: 4,
    depthLayer: 'objects',
    shadow: true,
    interaction: null,
  }),
])

/**
 * anchor(bottom-center world-%) + widthPct + footprintDepthPct(anchor.y
 * 기준 아래로 뻗는 깊이, world-%)에서 장애물 사각형을 파생한다 —
 * collisionRect가 없는 신규 오브젝트 전용(p6a_B_composition.md §1.1).
 * @param {{x:number,y:number}} anchor
 * @param {number} widthPct
 * @param {number} footprintDepthPct
 * @returns {{x0:number,x1:number,y0:number,y1:number}}
 */
export function footprintRect(anchor, widthPct, footprintDepthPct) {
  return {
    x0: anchor.x - widthPct / 2,
    x1: anchor.x + widthPct / 2,
    y0: anchor.y - footprintDepthPct,
    y1: anchor.y,
  }
}

/**
 * SCENE_FIXTURE -> walkGrid.js OBSTACLES 형태({id,x0,x1,y0,y1}[]) 파생.
 * collisionRect가 있는 항목(기존 3개)은 그 값을 그대로 쓴다(byte-identical
 * — 회귀 없음). 없는 항목은 footprintRect로 계산한다. obstacle:false인
 * 항목(현재 없음, 픽스처 shape는 허용)은 제외한다.
 * @param {ReadonlyArray<object>} fixture
 * @returns {ReadonlyArray<{id:string,x0:number,x1:number,y0:number,y1:number}>}
 */
export function deriveObstacles(fixture) {
  return Object.freeze(
    fixture
      .filter((o) => o.obstacle)
      .map((o) => Object.freeze({
        id: o.id,
        ...(o.collisionRect || footprintRect(o.anchor, o.widthPct, o.footprintDepthPct)),
      })),
  )
}

// ── 렌더 크기 파생(Proto25DScreen.jsx 범용 오브젝트 레이어 전용) ─────────
// 바닥(proto25d-ground) 엘리먼트는 실제로 뷰포트를 그대로 채우고 CSS
// aspectRatio가 실효 없다는 사실(ASTRA_HANDOFF_2026-09-21.md §0.3,
// walkGrid.js 헤더 주석과 동일 발견)이 여기서도 그대로 적용된다 — 이
// 함수들은 항상 groundRect(getBoundingClientRect 실측)를 받아 계산한다.

/**
 * "씬 단위(scene unit) px" — 가로 폭을 그대로 쓰되, 세로가 그보다 훨씬
 * 짧은 뷰포트(가로로 넓은 데스크톱)에서 24%-폭 건물이 바닥 높이를
 * 넘어서지 않도록 세로 기준 상한을 둔다(1.2배 여유 — 완전히 세로=가로를
 * 강제하지 않고, 세로가 극단적으로 짧을 때만 캡이 발동).
 * @param {{width:number,height:number}} groundRect
 * @returns {number}
 */
export function sceneUnitPx(groundRect) {
  const w = (groundRect && groundRect.width) || 0
  const h = (groundRect && groundRect.height) || 0
  return Math.min(w, 1.2 * h)
}

/**
 * 오브젝트 하나의 렌더 폭(px) — depth-scale(앵커 y)까지 반영한 뒤
 * minWidthPx 하한을 강제한다. height는 호출부가 naturalAspect를 곱해
 * 구한다(이 함수는 폭만 계산 — 벤치의 기존 width-only-then-auto-height
 * 관례와 동일 정신, benchRenderedSizePx 참고).
 * @param {{widthPct:number,minWidthPx?:number,anchor:{x:number,y:number}}} obj
 * @param {{width:number,height:number}} groundRect
 * @returns {number}
 */
export function objectRenderedWidthPx(obj, groundRect) {
  const unit = sceneUnitPx(groundRect)
  const scale = depthScale(obj.anchor.y)
  const nominalPx = (obj.widthPct / 100) * unit * scale
  return Math.max(obj.minWidthPx || 0, nominalPx)
}
