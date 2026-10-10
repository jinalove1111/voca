// src/components/town/v2/TownFogLayer.jsx — Paul Town V2 잠금(locked) 랜드마크
// 헤이즈 + Lv.N 표지판 레이어(2026-09-18 재작성, 작업 지시서 STEP 7).
//
// 2026-09-16 버전은 "현재 보이는 구역 스택 맨 위"에 얹히는 가로 안개
// 밴드였다(옛 district-stack 지오메트리, 구역 전체를 흐릿하게 암시).
// 세계 좌표 렌더러(Step 4~7)에서는 그 개념이 사라진다 — 대신 하네스가
// 실제로 그리는 표현 그대로, "잠긴(hidden) 랜드마크 각각"에 대해 헤이즈
// 타원(LANDMARK_DECOR[id].hazeBox) + Lv.N 나무 표지판
// (LANDMARK_DECOR[id].signAnchor, SIGNS.lvSign)을 그린다. 잠금 판정 자체는
// townScene.js의 lotState(lot, level, ownedIds)에 그대로 위임한다(재구현
// 없음, 그 함수가 유일한 잠금해제 진실 원천) — 표지판에 찍는 숫자도
// LANDMARK_DECOR[id].unlockLevel이 아니라 DISTRICTS[lot.district].unlock을
// 쓴다(작업 지시서 명시 — LANDMARK_DECOR.unlockLevel은 하네스 대조용
// 참고값일 뿐 판정에 쓰라는 값이 아니다, worldScenery.js 모듈 헤더 참고).
//
// hazeBox가 null인 로트(stone-fountain — cafe의 헤이즈를 공유)는 헤이즈를
// 안 그리지만 signAnchor가 있으면 표지판은 독립적으로 그린다(하네스
// renderLandmark() 호출부와 동일 — cafe/stone-fountain 각각 hazeBox/
// signAnchor를 따로 받는다).
//
// z-index — 헤이즈는 worldZIndex('distantLocked', …)(depthOrder.js
// LAYER_BASE.distantLocked=2000, Y_RANKED_LAYERS 아님 — 항상 상수라
// objects/architecture 티어(6000+)보다 훨씬 아래, "소유/배치된 아이템을
// 절대 가리지 않는다"는 요구를 자동으로 만족한다). Lv.N 표지판은
// worldZIndex('scenery', …)를 쓴다 — 표지판 자신의 y(signAnchor[1])가
// 항상 그 랜드마크 자신의 y보다 크고(신호주는 "출입구" 지점이라 랜드마크
// 본체보다 조금 앞/아래) scenery(6001) > architecture(6000) 티어라, 잠긴
// 랜드마크(TownObjectLayer.jsx가 architecture 티어로 그리는 흐린 실루엣)
// 위에 표지판이 항상 올라오는 하네스의 실제 페인트 순서(헤이즈 → 그림자
// → 랜드마크 이미지 → locked 베일 → Lv.N 표지판)를 그대로 재현한다(이
// 세션의 z 티어 선택 — 지시서가 표지판 자체의 티어를 명시하지 않아 이
// 세션이 architecture보다 위인 scenery로 정했다, 보고서에 기록).
//
// 컨테이너는 data-testid="town-fog"를 유지하고, 잠긴 로트가 하나라도
// 있으면 항상 보이며 "Lv."를 포함한 텍스트(표지판 SVG 안의 실제 텍스트
// 노드)를 담는다 — 없으면(레벨8, 전부 열림) 아예 null을 반환한다. fog
// prop은 호환을 위해 시그니처에 남기되 실제 렌더는 lotState에서 파생한다
// (더 이상 fogState()의 실루엣/칩 텍스트를 쓰지 않는다 — 새 표현이
// 하네스와 1:1이라 그 옛 표시를 대체한다). 잠긴 랜드마크마다 sr-only
// 문장 하나("잠긴 구역: Lv.N")를 남겨 스크린리더에도 같은 정보를 준다
// (시각 카피는 표지판 SVG 텍스트 하나뿐 — 새 카피를 발명하지 않는다).
import { Fragment } from 'react'
import { LOTS, lotState, DISTRICTS } from '../../../utils/town/townScene'
import { worldZIndex } from '../../../utils/town/worldRender'
import { LANDMARK_DECOR, SIGNS } from '../../../utils/town/worldScenery'

// 하네스 .haze CSS 그대로(재도출 없음) — 배경 그라디언트만 고정, 실제
// blur/opacity는 호출부(LANDMARK_DECOR[*].hazeBox)가 매 항목마다 override.
const HAZE_BACKGROUND = 'radial-gradient(ellipse at center, rgba(255,250,232,0.62) 0%, rgba(255,250,232,0.30) 55%, rgba(255,250,232,0) 78%)'

export default function TownFogLayer({ fog, level, ownedIds }) {
  void fog // 호환성을 위해 시그니처 유지 — 실제 렌더는 lotState(하단)에서 파생한다.
  const owned = Array.isArray(ownedIds) ? ownedIds : []
  const hiddenLots = LOTS.filter((lot) => lotState(lot, level, owned) === 'hidden')
  if (hiddenLots.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="town-fog">
      {hiddenLots.map((lot) => {
        const decor = LANDMARK_DECOR[lot.id]
        const unlockLevel = DISTRICTS[lot.district] ? DISTRICTS[lot.district].unlock : null
        const signText = SIGNS.lvSign.svgTemplate.replace('{n}', String(unlockLevel))

        return (
          <Fragment key={lot.id}>
            {decor.hazeBox && (
              <div
                aria-hidden="true"
                className="absolute rounded-full"
                style={{
                  left: `${decor.hazeBox.xPct}%`,
                  top: `${decor.hazeBox.yPct}%`,
                  width: `${decor.hazeBox.wPct}%`,
                  height: `${decor.hazeBox.hPct}%`,
                  background: HAZE_BACKGROUND,
                  filter: `blur(${decor.hazeBox.blur}px)`,
                  opacity: decor.hazeBox.opacity,
                  zIndex: worldZIndex('distantLocked', decor.hazeBox.yPct, `${lot.id}-haze`),
                }}
              />
            )}
            {decor.signAnchor && (
              <div
                aria-hidden="true"
                className="absolute [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
                style={{
                  left: `${decor.signAnchor[0]}%`,
                  top: `${decor.signAnchor[1]}%`,
                  width: `${SIGNS.lvSign.wPct}%`,
                  transform: 'translate(-50%, -100%)',
                  zIndex: worldZIndex('scenery', decor.signAnchor[1], `${lot.id}-lvsign`),
                }}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: signText }}
              />
            )}
            <p className="sr-only">잠긴 구역: Lv.{unlockLevel}</p>
          </Fragment>
        )
      })}
    </div>
  )
}
