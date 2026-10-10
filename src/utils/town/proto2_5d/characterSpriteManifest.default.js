// src/utils/town/proto2_5d/characterSpriteManifest.default.js — Paul 캐릭터
// v2 스프라이트 매니페스트의 프로덕션 기본값(Phase 6C, 2026-09-24).
//
// 이 파일 하나만 `src/assets/town/character/index.js`(PNG 8장 + @2x 8장을
// import하는 에셋 레지스트리)를 import한다 — 청크 격리 규칙(ASTRA_HANDOFF
// §0.10): `src/assets/town/index.js`(V1 TOWN_ASSETS)도, 어떤 V1/V2 town
// 화면 파일도 이 레지스트리를 직접 import하지 않는다. Paul 캐릭터
// 스프라이트 PNG 문자열(`paul-idle-front`, `paul-sit` 등)이 번들에 등장하는
// 곳은 이 모듈을 import하는 화면의 청크(오늘은 `Proto25DScreen.jsx`, React
// lazy 청크) 하나뿐이어야 한다.
//
// `buildPaulSpriteManifest`(paulSpriteManifest.js)는 `sources2x` 파라미터를
// 아직 모른다(2026-09-24 시점, 이 파일 작성 중 그 파라미터를 추가로 받도록
// 최소 확장했다 — src2x가 없으면 frame.src2x가 기존과 동일하게 undefined로
// 남아 다른 호출부의 동작은 전혀 바뀌지 않는다). 이 파일은 그 결과로 만든
// manifest에 `PAUL_SPRITE_SOURCES_2X`를 src2x로 얹어 반환한다.

import {
  PAUL_SPRITE_SOURCES,
  PAUL_SPRITE_SOURCES_2X,
  PAUL_SPRITE_MEASURED,
} from '../../../assets/town/character/index.js'
import { buildPaulSpriteManifest } from './paulSpriteManifest.js'
import { validateSpriteManifest } from './characterSpriteContract.js'

export const PAUL_SPRITE_MANIFEST = buildPaulSpriteManifest({
  sources: PAUL_SPRITE_SOURCES,
  sources2x: PAUL_SPRITE_SOURCES_2X,
  canvas: PAUL_SPRITE_MEASURED.canvas,
  anchors: PAUL_SPRITE_MEASURED.anchors,
  pixelRatio: PAUL_SPRITE_MEASURED.pixelRatio,
  frameDurationMs: 150,
  license: {
    source: 'ChatGPT image generation, operator-directed (2026-09-24)',
    author: 'Paul Easy Voca (operator)',
    licenseName: 'proprietary — operator-owned generated artwork',
    generatedBy: 'ChatGPT (image generation), 2026-09-24',
    approvedBy: 'operator',
    approvedAt: '2026-09-24',
  },
})

// 계약 준수 확인(주석) — `node scripts/spriteIngestPaul.mjs --check`의
// h단계(걷기/앉기 상태 연결)가 repo-relative 경로 문자열로 이미
// `validateSpriteManifest(...).ok === true`를 검증했고, 이 파일이 실제로
// import하는 PNG 기반 소스로도 esbuild 번들(`.png:'dataurl'` 로더,
// scripts/testProto25dSceneFixture.mjs의 `.webp:'dataurl'` 패턴과 동일)을
// 통해 별도로 `validateSpriteManifest(PAUL_SPRITE_MANIFEST).ok === true`를
// 확인했다(2026-09-24, 스크래치 검증 — 결과는 이 커밋의 리뷰 코멘트/핸드오프
// 참고, 이 파일 자체는 순수 배선이라 별도 assert 코드를 넣지 않는다).
