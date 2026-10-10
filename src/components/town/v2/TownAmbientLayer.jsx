// src/components/town/v2/TownAmbientLayer.jsx — Paul Town V2 정원 앰비언트
// 레이어(2026-09-13, 2026-09-18 재작성 — 작업 지시서 STEP 7).
//
// gardenRichness(gardenPoints)의 stage/windowsLit/ivy/birds만 읽어 집
// 주변에 결정론적으로 장식(꽃/창문 불빛/담쟁이/새)을 더한다 — 경제
// 데이터(별/달러/카탈로그)는 이 레이어에서 전혀 다루지 않는다(무변경).
// 순수 장식이라 aria-hidden + pointer-events-none(스크린리더용 sr-only
// 문장 하나만 예외, aria-hidden 밖의 형제로 렌더 — TownSceneryLayer.jsx의
// 표지판과 동일 이유).
//
// 2026-09-18 — windowsLit/ivy/birds 앵커를 옛 anchorFor(HOME_CELL...)
// (district-stack 좌표계)에서 worldRender.landmarkBox('my-house')로
// 옮긴다. 화단(garden-bed, stage 스프라이트 + stage emoji 군집)도 my-house
// 로트 옆 임의 위치 대신, 하네스의 front-garden flower-garden 소품
// (worldScenery.js PROP_PLACEMENTS prop-11, TownSceneryLayer.jsx가 이미
// 그 실제 아트를 그린다) 자리(world 10,58, 폭 16.4%)를 그대로 재사용해
// 그 위에 단계별 장식을 겹쳐 그린다(작업 지시서 지정값 — "동결되지 않은
// 위치 선택"으로 보고 대상). 기존 타원 테두리/배경(bg-[#c9a227]/15
// border rounded-[50%])은 제거한다 — 밑에 깔린 실제 화단 아트를 가리지
// 않기 위함(작업 지시서 명시).
import {
  gardenStageSprite,
} from '../../../utils/town/townScene'
import { townAsset } from '../../../assets/town'
import TownSprite from './TownSprite'
import { landmarkBox, worldZIndex } from '../../../utils/town/worldRender'

const STAGE_EMOJI = {
  0: [],
  1: ['🌱', '🌱'],
  2: ['🌷', '🌱', '🌷'],
  3: ['🌷', '🌻', '🌷', '🌼'],
  4: ['🌳', '🌷', '🌻', '🌼', '🐦'],
}

// 화단(garden-bed) 위치 — 오너 결정 재확인 대기(아직 동결되지 않은
// 선택): worldScenery.js에 "garden-bed" 전용 좌표가 없어, 하네스의
// front-garden flower-garden 소품(PROP_PLACEMENTS prop-11, 이미
// TownSceneryLayer.jsx가 그 자리에 실제 꽃밭 아트를 그린다)과 같은 자리
// (world 10,58, 폭 16.4%)를 재사용해 그 위에 단계별 장식(스프라이트+
// 이모지)을 겹쳐 그린다 — 작업 지시서가 명시한 값 그대로.
const GARDEN_BED_X_PCT = 10
const GARDEN_BED_Y_PCT = 58
const GARDEN_BED_WIDTH_PCT = 16.4
const GARDEN_BED_HEIGHT_PCT = 14

export default function TownAmbientLayer({ richness, gardenPoints, level = 1 }) {
  void level // 화단/집 앵커는 이제 landmarkBox()에서 오는 고정 세계 좌표라 level 무관 — 시그니처만 다른 레이어와 통일.
  const r = richness || { stage: 0, windowsLit: false, ivy: false, birds: false }
  const emojis = STAGE_EMOJI[r.stage] || []
  const points = Number.isFinite(Number(gardenPoints)) && Number(gardenPoints) > 0 ? Number(gardenPoints) : 0
  const gardenBgSprite = gardenStageSprite(r.stage)
  const gardenBgAsset = townAsset(gardenBgSprite.assetKey)

  // my-house 랜드마크 박스 — windowsLit/ivy/birds가 그 집 자체 주변에
  // 붙는다. topPct는 박스의 세로 중앙(창문 높이 부근)으로 근사한다(옛
  // anchorFor 시절엔 topPct===bottomPct인 "점" 앵커라 창문 표시가 사실상
  // 집의 밑동 지점에 그려졌었다 — landmarkBox가 실제 박스를 주므로 이번에
  // 중앙으로 살짝 개선, 시각적 의미는 동일하게 "집 위에 얹힌 장식").
  const homeBox = landmarkBox('my-house')
  const homeAnchor = homeBox
    ? { leftPct: homeBox.leftPct, bottomPct: homeBox.bottomPct, topPct: homeBox.bottomPct - homeBox.heightPct / 2 }
    : { leftPct: 50, topPct: 50, bottomPct: 50 }

  // 2026-09-18 — 이 장식들은 집(architecture 티어) 위에 얹혀야 하므로
  // scenery 티어(architecture보다 1 높음)를 쓴다 — my-house 자체와 같은
  // y 근방이라 architecture 티어를 쓰면 TownObjectLayer.jsx가 이 레이어
  // "뒤"에 렌더되는 DOM 순서상 동일 z 타이브레이크에서 집이 오히려 이
  // 장식들을 가릴 수 있다(TownScene.jsx가 TownAmbientLayer를
  // TownObjectLayer보다 먼저 렌더). scenery 티어를 쓰면 DOM 순서와
  // 무관하게 항상 집 위에 그려진다 — TownScene.jsx를 재배선하지 않고도
  // 정확한 결과를 얻는 이 세션의 선택(보고서에 기록).
  const decorZ = homeBox ? worldZIndex('scenery', homeAnchor.topPct, 'my-house-decor') : 0
  const gardenZ = worldZIndex('scenery', 58.01, 'garden-bed')

  return (
    <>
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* 집 옆 화단(garden bed) — 항상 그린다. stage emoji들을 여기 안에
            모아 담아(flex-wrap) "화단"으로 읽히게 한다 — stage 0(아직
            아무것도 안 자람)은 옅은 새싹 하나만 보여줘 "자랄 준비가 된
            빈 화단"임을 알린다. */}
        <div
          className="absolute -translate-x-1/2 -translate-y-full flex flex-wrap items-center justify-center gap-0.5 overflow-hidden"
          style={{
            left: `${GARDEN_BED_X_PCT}%`,
            top: `${GARDEN_BED_Y_PCT}%`,
            width: `${GARDEN_BED_WIDTH_PCT}%`,
            height: `${GARDEN_BED_HEIGHT_PCT}%`,
            zIndex: gardenZ,
          }}
        >
          {gardenBgAsset && (
            <div className="absolute inset-0 -z-10">
              <TownSprite sprite={gardenBgSprite} className="w-full h-full" />
            </div>
          )}
          {r.stage === 0 ? (
            <span className="text-lg opacity-40">🌱</span>
          ) : (
            emojis.map((emoji, i) => (
              <span key={i} className="text-base leading-none">{emoji}</span>
            ))
          )}
        </div>

        {r.windowsLit && (
          <div
            className="absolute w-[16%] h-[10%] bg-[#e0a73a]/40 blur-md rounded-full motion-safe:animate-pulse"
            style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.topPct}%`, transform: 'translate(-50%, -50%)', zIndex: decorZ }}
          />
        )}
        {r.ivy && (
          <span
            className="absolute text-base"
            style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.bottomPct}%`, transform: 'translate(40%, -30%)', zIndex: decorZ }}
          >
            🌿
          </span>
        )}
        {r.birds && (
          <span
            className="absolute text-base motion-safe:animate-bounce"
            style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.topPct}%`, transform: 'translate(120%, -120%)', zIndex: decorZ }}
          >
            🐦
          </span>
        )}
      </div>
      <p className="sr-only">배운 단어 {points}개로 정원이 자라고 있어요</p>
    </>
  )
}
