// src/assets/town/env/index.js — Paul Town V2 환경(environment) 아트 전용
// 격리 레지스트리(2026-09-18).
//
// ../index.js의 TOWN_ASSETS(V1/V2 공용 건물·동물·장식 23개 키)와 이 파일은
// 의도적으로 완전히 분리돼 있다 — scripts/testTownV2Static.mjs §3이 그
// ../index.js TOWN_ASSETS를 정확히 23개 키로 고정(pin)하고 있어, 이 파일의
// 35개 환경 에셋(잔디/패치/길/울타리/생울타리/관목/꽃/강)을 거기 섞으면 그
// 계약이 깨진다. 그래서 별도 파일 + 별도 export(TOWN_ENV_ASSETS)로 둔다.
//
// import 제약: 이 레지스트리는 src/components/town/v2/*(paulTownV2 뒤에서만
// 로드되는 lazy 청크, App.jsx의 React.lazy(() => import('./components/town/v2/TownScreenV2')))
// 에서만 import해야 한다 — V1(TownScreen.jsx 등 8x6 격자 화면)이나 이 파일을
// 거치지 않는 다른 어떤 경로도 이 모듈을 import하면 안 된다. paulTownV2
// 플래그가 꺼져 있는 한(현재 기본값 false) V2 청크 자체가 로드되지 않으므로,
// 이 제약이 지켜지는 한 학생에게는 어떤 env 이미지도 요청되지 않는다
// (scripts/testTownEnvAssets.mjs가 src 트리 전체에서 'assets/town/env'
// 문자열이 v2 디렉터리 밖에 없는지 grep으로 강제한다).
//
// 35개 키는 docs/design/town/manifest/env-art-manifest.json의 status
// "staged" 항목과 정확히 같다(Batch 1 A/B/C, 2026-09-18 승인본). shrub-wide는
// 현재 승인본(sha 5dc24710…)이 등록돼 있고, 미승격 교체 후보 56.png는 여기
// 없다. Batch E 3종(fence-post/fence-gate-closed/hedge-corner, status
// "missing")도 의도적으로 이 레지스트리 범위 밖이다.
import skyHills from './sky-hills.webp'
import grassBase from './grass-base.webp'
import grassPatchLight from './grass-patch-light.webp'
import grassPatchDark from './grass-patch-dark.webp'
import grassPatchWorn from './grass-patch-worn.webp'
import wildflowerScatter from './wildflower-scatter.webp'
import pathStraight from './path-straight.webp'
import pathStraightNarrow from './path-straight-narrow.webp'
import pathCurveGentle from './path-curve-gentle.webp'
import pathCurveStrong from './path-curve-strong.webp'
import pathFork from './path-fork.webp'
import pathJunction from './path-junction.webp'
import pathEnd from './path-end.webp'
import pathEndEntrance from './path-end-entrance.webp'
import fenceStraight from './fence-straight.webp'
import fenceStraightShort from './fence-straight-short.webp'
import fenceCorner from './fence-corner.webp'
import fenceGate from './fence-gate.webp'
import hedgeStraight from './hedge-straight.webp'
import hedgeStraightTall from './hedge-straight-tall.webp'
import hedgeEnd from './hedge-end.webp'
import shrubRound from './shrub-round.webp'
import shrubRoundSmall from './shrub-round-small.webp'
import shrubWide from './shrub-wide.webp'
import flowerClusterPink from './flower-cluster-pink.webp'
import flowerClusterYellow from './flower-cluster-yellow.webp'
import flowerClusterMixed from './flower-cluster-mixed.webp'
import flowerBedBorder from './flower-bed-border.webp'
import flowerPot from './flower-pot.webp'
import flowerPotTall from './flower-pot-tall.webp'
import riverStraight from './river-straight.webp'
import riverBend from './river-bend.webp'
import riverHighlight from './river-highlight.webp'
import riverbankReeds from './riverbank-reeds.webp'
import riverbankReedsStones from './riverbank-reeds-stones.webp'

export const TOWN_ENV_ASSETS = Object.freeze({
  'sky-hills': skyHills,
  'grass-base': grassBase,
  'grass-patch-light': grassPatchLight,
  'grass-patch-dark': grassPatchDark,
  'grass-patch-worn': grassPatchWorn,
  'wildflower-scatter': wildflowerScatter,
  'path-straight': pathStraight,
  'path-straight-narrow': pathStraightNarrow,
  'path-curve-gentle': pathCurveGentle,
  'path-curve-strong': pathCurveStrong,
  'path-fork': pathFork,
  'path-junction': pathJunction,
  'path-end': pathEnd,
  'path-end-entrance': pathEndEntrance,
  'fence-straight': fenceStraight,
  'fence-straight-short': fenceStraightShort,
  'fence-corner': fenceCorner,
  'fence-gate': fenceGate,
  'hedge-straight': hedgeStraight,
  'hedge-straight-tall': hedgeStraightTall,
  'hedge-end': hedgeEnd,
  'shrub-round': shrubRound,
  'shrub-round-small': shrubRoundSmall,
  'shrub-wide': shrubWide,
  'flower-cluster-pink': flowerClusterPink,
  'flower-cluster-yellow': flowerClusterYellow,
  'flower-cluster-mixed': flowerClusterMixed,
  'flower-bed-border': flowerBedBorder,
  'flower-pot': flowerPot,
  'flower-pot-tall': flowerPotTall,
  'river-straight': riverStraight,
  'river-bend': riverBend,
  'river-highlight': riverHighlight,
  'riverbank-reeds': riverbankReeds,
  'riverbank-reeds-stones': riverbankReedsStones,
})

/**
 * asset_key -> 이미지 URL. 등록되지 않은 키는 null(이모지/CSS 폴백 신호,
 * ../index.js의 townAsset()과 동일한 계약).
 * @param {string} key
 * @returns {string|null}
 */
export function townEnvAsset(key) {
  if (typeof key !== 'string' || key.length === 0) return null
  return TOWN_ENV_ASSETS[key] || null
}
