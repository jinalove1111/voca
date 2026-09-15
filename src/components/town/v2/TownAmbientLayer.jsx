// src/components/town/v2/TownAmbientLayer.jsx — Paul Town V2-A 정원 앰비언트
// 레이어(2026-09-13).
//
// gardenRichness(gardenPoints)의 stage/windowsLit/ivy/birds만 읽어 집
// 주변에 결정론적으로 장식(꽃/창문 불빛/담쟁이/새)을 더한다 — 경제
// 데이터(별/달러/카탈로그)는 이 레이어에서 전혀 다루지 않는다. 순수
// 장식이라 aria-hidden + pointer-events-none(스크린리더용 sr-only 문장
// 하나만 예외).
//
// 2026-09-13 최종 리뷰 결함 수정 — sr-only 문장이 예전엔 aria-hidden="true"
// 루트 div 안에 있어 스크린리더가 절대 못 읽었다(aria-hidden 자식은 접근성
// 트리에서 통째로 제외됨). 장식 div는 그대로 aria-hidden 유지하고, sr-only
// 문장만 그 div 밖(형제, aria-hidden 아님)으로 뺀다 — 이 파일이 순수 장식
// 레이어에서 유일하게 스크린리더에 노출해야 하는 문장이라 Fragment로 감싼다.
//
// 2026-09-13 드롭인 아트 준비(시각 변화 없음) — 화단(garden-bed) 박스
// 안쪽에, 기존 STAGE_EMOJI 군집(장식 flavor, 그대로 유지) "뒤"에 화단 배경
// 스프라이트를 조건부로 추가한다. 오늘은 `TOWN_ASSETS`가 비어 있어
// `townAsset(...)`이 항상 null을 반환하므로 이 레이어는 아무것도 렌더하지
// 않고(출력이 기존과 byte-for-byte 동일), 실제 `nature/garden-stage-N`
// 아트가 `TOWN_ASSETS`에 채워지는 순간 코드 변경 없이 자동으로 나타난다.
//
// 2026-09-16 월드 지오메트리 확장 — 화단 박스의 위치를 씬 좌상단 고정
// 2%/12% 박스(구 8x6 균일 그리드 시절 값)에서 my-house 로트 자신 바로
// 옆으로 옮긴다. LOTS의 my-house 항목(left/baseline)을
// districtLocalToGlobal('home', ...)로 변환해 그 로트의 왼쪽에 약간의
// 여백을 두고 배치한다 — gardenRichness(gardenPoints) 데이터 흐름과
// windowsLit/ivy/birds가 my-house 자체(HOME_CELL 앵커) 주변에 붙는 로직은
// 그대로 유지한다(props 시그니처 무변경 — richness/gardenPoints 그대로).
import {
  HOME_CELL, anchorFor, Z_LAYERS, gardenStageSprite, districtLocalToGlobal, LOTS,
} from '../../../utils/town/townScene'
import { townAsset } from '../../../assets/town'
import TownSprite from './TownSprite'

const STAGE_EMOJI = {
  0: [],
  1: ['🌱', '🌱'],
  2: ['🌷', '🌱', '🌷'],
  3: ['🌷', '🌻', '🌷', '🌼'],
  4: ['🌳', '🌷', '🌻', '🌼', '🐦'],
}

export default function TownAmbientLayer({ richness, gardenPoints, level = 1 }) {
  const r = richness || { stage: 0, windowsLit: false, ivy: false, birds: false }
  const emojis = STAGE_EMOJI[r.stage] || []
  const homeAnchor = anchorFor(HOME_CELL.x, HOME_CELL.y, level)
  const points = Number.isFinite(Number(gardenPoints)) && Number(gardenPoints) > 0 ? Number(gardenPoints) : 0
  const gardenBgSprite = gardenStageSprite(r.stage)
  const gardenBgAsset = townAsset(gardenBgSprite.assetKey)

  // my-house 로트 왼쪽에 화단을 붙인다 — 로트 자체 폭(LOTS my-house.width)
  // 의 절반만큼 로트 중심(left)에서 왼쪽으로 더 간 자리를 화단 박스의
  // 앵커(오른쪽 가장자리)로 삼는다(겹치지 않으면서 바로 옆에 붙는 배치).
  const homeLot = LOTS.find((l) => l.id === 'my-house')
  const gardenWidthPct = 20
  const gardenHeightPct = 14
  const gardenLocalLeft = homeLot ? Math.max(0, homeLot.left - homeLot.width / 2 - gardenWidthPct / 2 - 2) : 12
  const gardenLocalTop = homeLot ? homeLot.baseline - 4 : 62
  const gardenAnchor = districtLocalToGlobal('home', gardenLocalLeft, gardenLocalTop, level)

  return (
    <>
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ zIndex: Z_LAYERS.patches }}>
        {/* 집 옆 화단(garden bed) — 항상 그린다. stage emoji들을 여기 안에
            모아 담아(flex-wrap) "화단"으로 읽히게 한다 — stage 0(아직
            아무것도 안 자람)은 옅은 새싹 하나만 보여줘 "자랄 준비가 된
            빈 화단"임을 알린다. 2026-09-16 — 위치를 씬 좌상단 고정 박스에서
            my-house 로트(homeLot) 바로 옆으로 옮김(districtLocalToGlobal). */}
        <div
          className="absolute -translate-x-1/2 -translate-y-full rounded-[50%] bg-[#c9a227]/15 border border-[#8fb37a]/40 flex flex-wrap items-center justify-center gap-0.5 overflow-hidden"
          style={{
            left: `${gardenAnchor.leftPct}%`,
            top: `${gardenAnchor.bottomPct}%`,
            width: `${gardenWidthPct}%`,
            height: `${gardenHeightPct}%`,
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
            style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.topPct}%`, transform: 'translate(-50%, -50%)' }}
          />
        )}
        {r.ivy && (
          <span
            className="absolute text-base"
            style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.bottomPct}%`, transform: 'translate(40%, -30%)' }}
          >
            🌿
          </span>
        )}
        {r.birds && (
          <span
            className="absolute text-base motion-safe:animate-bounce"
            style={{ left: `${homeAnchor.leftPct}%`, top: `${homeAnchor.topPct}%`, transform: 'translate(120%, -120%)' }}
          >
            🐦
          </span>
        )}
      </div>
      <p className="sr-only">배운 단어 {points}개로 정원이 자라고 있어요</p>
    </>
  )
}
