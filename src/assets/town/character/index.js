// src/assets/town/character/index.js — Paul 캐릭터 스프라이트 에셋
// 레지스트리(scripts/spriteIngestPaul.mjs --write가 실측 통과 후 생성,
// 2026-09-24).
//
// import 제약: env 레지스트리(V2 환경 아트 index.js)와 동일한 격리 규칙 — 이
// 레지스트리는 오직
// src/utils/town/proto2_5d/characterSpriteManifest.default.js에서만
// import한다(절대 src/assets/town/index.js에서 import하지 않고, 절대
// V1/V2 town 화면 파일에서 직접 import하지 않는다 — 청크 격리 규칙,
// ASTRA_HANDOFF §0.10). src/assets/town/index.js(V1 TOWN_ASSETS)는 이
// 파일을 import하지 않고, 이 파일도 그쪽을 import하지 않는다.
import paulIdleFront from './paul-idle-front.png'
import paulWalkFrontA from './paul-walk-front-a.png'
import paulWalkFrontB from './paul-walk-front-b.png'
import paulWalkBackA from './paul-walk-back-a.png'
import paulWalkBackB from './paul-walk-back-b.png'
import paulWalkSideA from './paul-walk-side-a.png'
import paulWalkSideB from './paul-walk-side-b.png'
import paulSit from './paul-sit.png'
import paulIdleFront2x from './paul-idle-front@2x.png'
import paulWalkFrontA2x from './paul-walk-front-a@2x.png'
import paulWalkFrontB2x from './paul-walk-front-b@2x.png'
import paulWalkBackA2x from './paul-walk-back-a@2x.png'
import paulWalkBackB2x from './paul-walk-back-b@2x.png'
import paulWalkSideA2x from './paul-walk-side-a@2x.png'
import paulWalkSideB2x from './paul-walk-side-b@2x.png'
import paulSit2x from './paul-sit@2x.png'

export const PAUL_SPRITE_SOURCES = Object.freeze({
  'idle-front': paulIdleFront,
  'walk-front-a': paulWalkFrontA,
  'walk-front-b': paulWalkFrontB,
  'walk-back-a': paulWalkBackA,
  'walk-back-b': paulWalkBackB,
  'walk-side-a': paulWalkSideA,
  'walk-side-b': paulWalkSideB,
  'sit': paulSit,
})

export const PAUL_SPRITE_SOURCES_2X = Object.freeze({
  'idle-front': paulIdleFront2x,
  'walk-front-a': paulWalkFrontA2x,
  'walk-front-b': paulWalkFrontB2x,
  'walk-back-a': paulWalkBackA2x,
  'walk-back-b': paulWalkBackB2x,
  'walk-side-a': paulWalkSideA2x,
  'walk-side-b': paulWalkSideB2x,
  'sit': paulSit2x,
})

export const PAUL_SPRITE_MEASURED = Object.freeze({
  "canvas": {
    "w": 96,
    "h": 128
  },
  "pixelRatio": 1,
  "anchors": {
    "idle-front": {
      "footAnchor": {
        "x": 48,
        "y": 128
      }
    },
    "walk-front-a": {
      "footAnchor": {
        "x": 48,
        "y": 128
      }
    },
    "walk-front-b": {
      "footAnchor": {
        "x": 48,
        "y": 128
      }
    },
    "walk-back-a": {
      "footAnchor": {
        "x": 48,
        "y": 128
      }
    },
    "walk-back-b": {
      "footAnchor": {
        "x": 48,
        "y": 128
      }
    },
    "walk-side-a": {
      "footAnchor": {
        "x": 48,
        "y": 128
      }
    },
    "walk-side-b": {
      "footAnchor": {
        "x": 48,
        "y": 128
      }
    },
    "sit": {
      "footAnchor": {
        "x": 48,
        "y": 128
      },
      "seatAnchor": {
        "x": 48,
        "y": 85
      }
    }
  },
  "measuredAt": "2026-09-24T11:48:52.030Z"
})
