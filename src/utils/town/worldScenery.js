// src/utils/town/worldScenery.js — Paul Town V2 월드 배경/장식(scenery) 동결
// 데이터(순수, 2026-09-18).
//
// docs/design/town/mockup/paul-town-recompose.html(운영자 승인, 동결된
// 렌더링 하네스)가 실제로 그리는 Batch 1 환경 아트 배치(잔디 패치/강/
// 길/울타리-생울타리/클러스터), 하늘·잔디 베이스, 항상 보이는 마을 소품
// (나무/가로등/담쟁이 등), 표지판(My House/To the Sea/Lv.N), 랜드마크별
// 잠금 장식(헤이즈 박스/표지판 앵커/그림자 스케일)을 코드 데이터로
// "포팅"한 계약 모듈이다 — CLAUDE.md 규칙 3(이미 승인된 설계를 재구현/
// 재설계하지 않는다)에 따라 배치를 새로 고안하지 않고, 하네스가 실제로
// 계산해 낸 수치를 그대로 얼렸다(frozen). scripts/testTownWorldScenery.mjs가
// node:vm 안에서 하네스를 직접 실행해 이 데이터와 대조한다.
//
// 좌표 규약: 이 모듈의 모든 좌표/크기는 SCENERY_REF_WIDTH(=390, 세계
// 100x190 종횡비의 "px @ 390 baseline")가 아니라 이미 "장면 폭/높이에
// 대한 %"로 환산되어 있다 — xPct/wPct는 장면 WIDTH의 %, yPct/hPct는 장면
// HEIGHT의 %(HEIGHT = WIDTH * 1.9)다. 그래서 해상도(width 360/390/430)에
// 무관하게 그대로 쓸 수 있다(scripts/testTownWorldScenery.mjs 단언 2가
// 하네스를 여러 width로 실제 실행해 이를 검증한다). SCENERY_REF_WIDTH는
// "이 표를 뽑아낸 기준 px 폭"을 문서화하는 상수일 뿐, 렌더링 계산에는
// 쓰이지 않는다.
//
// depthLayer 필드는 기본적으로 하네스의 DOM 레이어(그룹)별 관례
// (grassPatch→terrain, river→water, path→path, fenceHedge→scenery,
// cluster→foregroundVegetation, src/utils/town/depthOrder.js의
// DEPTH_LAYERS 값)를 따르되, docs/design/town/manifest/
// env-art-manifest.json의 자산별 depthLayer가 이와 다른 경우 매니페스트
// 값을 우선한다(요청 사양) — 실제로 2개 키 그룹에서 불일치가 있었다:
//   - flower-pot / flower-pot-tall: clusterLayer(DOM)에 배치되지만
//     매니페스트 depthLayer는 'scenery'(cluster 그룹 기본값
//     'foregroundVegetation'이 아님) — 화분은 관목/꽃 클러스터보다 뒤에,
//     울타리/생울타리와 같은 티어에 그려지는 게 맞다는 의도로 보인다.
//   - riverbank-reeds / riverbank-reeds-stones: riverLayer(DOM)에
//     배치되지만 매니페스트 depthLayer는 'foregroundVegetation'(river
//     그룹 기본값 'water'가 아님) — 갈대는 수면보다 앞(둑 위 식생)에
//     그려져야 한다는 의도로 보인다.
// 이 두 그룹만 아래 ENV_PLACEMENTS에서 그룹 기본값 대신 매니페스트 값을
// 썼다(각 항목에도 표시).
//
// 알려진 겹침(오너 승인, "고치지 않고 그대로 이식"): flower-cluster 일부가
// My House/To the Sea 표지판과 부분적으로 겹치고, shrub-wide #0
// (cluster-4, world (6,58))은 anchor가 bottom-center라 왼쪽 가장자리가
// xPct(6) - wPct/2(6.154) ≈ -0.154%(390px 기준 약 -0.6px)로 화면 왼쪽
// 경계를 살짝 넘어간다 — 지시받은 대로 "고치거나 다시 배치하지 않고"
// 원본 수치를 그대로 옮겼다.
//
// Paul 본체/환영 말풍선("Welcome to Paul " + "Town!")은 이 모듈에 의도적으로
// 포함하지 않는다(오너 결정 2026-09-18: PaulGuide가 Paul 렌더링의
// 유일한 지점으로 남는다) — 이 파일 어디에도 그 문자열/자산 경로를
// 넣지 않는다.
//
// React/DOM/fetch/localStorage/Math.random/Date.now 없음 — 순수 데이터 +
// 선택적 파생 함수(sceneryFor)만 제공한다. import는 ./worldContract만
// 쓴다.
import { WORLD } from './worldContract'

// 이 표를 뽑아낸 기준 px 폭(세계 100x190 종횡비, 하네스의 K=SX/3.9
// baseline과 동일) — 문서화용 상수, 계산에는 쓰지 않는다(모든 좌표는
// 이미 %로 정규화됨).
export const SCENERY_REF_WIDTH = 390

// 세계 종횡비(WORLD.h/WORLD.w = 190/100 = 1.9) — px 폭 기준 값을 %-of-height로
// 환산할 때 쓴다(예: grassBase 타일의 세로 %). worldContract.js의 WORLD가
// 유일한 import 대상이라는 계약(이 모듈 헤더 참고)을 실제로 활용하는 지점.
const WORLD_ASPECT = WORLD.h / WORLD.w

// ---------------------------------------------------------------------
// ENV_PLACEMENTS — Batch 1 환경 아트(잔디 패치/강/길/울타리·생울타리/
// 클러스터) 배치, 하네스가 그리는 DOM/페인트 순서 그대로(각 그룹 내부는
// 하네스의 appendChild 순서, id는 `${group}-${index}`로 안정적).
// width=390, level=8(모든 랜드마크 잠금해제 — Batch 1 환경 아트 자체는
// 레벨에 무관함, 아래 참고), assets='batch1'(기본) 기준.
//
// 레벨 무관성: scripts/testTownWorldScenery.mjs가 level 1/3/4/5/8에서
// 하네스를 직접 실행해 이 배열과 완전히 동일함을 확인한다(잠금/헤이즈는
// LEVEL REVEAL 섹션이 objLayer/hazeLayer에만 쓰고 이 5개 배치 레이어에는
// 전혀 쓰지 않으므로 구조적으로 레벨 무관 — Batch 1 자산은 "항상 표시"
// 취급). 그래서 이 배열에 minLevel/maxLevel 필드를 두지 않았다.
//
// 해상도 무관성(참고, scripts/testTownWorldScenery.mjs 단언 2에 상세):
// width/height/rotationDeg는 360~430 사이에서 완전히 동일(0 오차)하다.
// xPct/yPct는 이론상으로도 동일해야 하지만(픽셀 공간 계산이 SX에 대해
// 균일하게 비례) 강(river) 체인의 마지막 타일(river-24,
// riverbank-reeds) 근처에서 하네스 자신의 누적 호장(arc-length) 부동
//소수점 오차로 최대 ~0.21%p까지 흔들리는 걸 실측했다 — 포팅 버그가
// 아니라 원본 하네스 자체의 특성이라 테스트에서 그 구간만 완화된
// 허용치로 문서화한다(코드 수정 대상 아님, 하네스가 "동결"이라
// 고치지 않는다).
export const ENV_PLACEMENTS = Object.freeze([
  Object.freeze({ id: 'grassPatch-0', assetKey: 'grass-patch-dark', group: 'grassPatch', depthLayer: 'terrain', xPct: 18.5, yPct: 33.1, wPct: 48.718, hPct: 17.949, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-1', assetKey: 'grass-patch-dark', group: 'grassPatch', depthLayer: 'terrain', xPct: 76.9, yPct: 25, wPct: 50, hPct: 18.421, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-2', assetKey: 'grass-patch-dark', group: 'grassPatch', depthLayer: 'terrain', xPct: 14.1, yPct: 81, wPct: 50, hPct: 18.421, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-3', assetKey: 'grass-patch-dark', group: 'grassPatch', depthLayer: 'terrain', xPct: 82.1, yPct: 81, wPct: 47.436, hPct: 17.476, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-4', assetKey: 'grass-patch-light', group: 'grassPatch', depthLayer: 'terrain', xPct: 38.5, yPct: 58, wPct: 43.59, hPct: 16.059, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-5', assetKey: 'grass-patch-light', group: 'grassPatch', depthLayer: 'terrain', xPct: 64.1, yPct: 67.5, wPct: 41.026, hPct: 15.115, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-6', assetKey: 'grass-patch-light', group: 'grassPatch', depthLayer: 'terrain', xPct: 46.2, yPct: 83.7, wPct: 48.718, hPct: 17.949, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-7', assetKey: 'grass-patch-worn', group: 'grassPatch', depthLayer: 'terrain', xPct: 26.9, yPct: 63.4, wPct: 38.462, hPct: 10.121, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-8', assetKey: 'grass-patch-worn', group: 'grassPatch', depthLayer: 'terrain', xPct: 55.1, yPct: 79.6, wPct: 38.462, hPct: 10.121, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-9', assetKey: 'grass-patch-worn', group: 'grassPatch', depthLayer: 'terrain', xPct: 76.9, yPct: 92.4, wPct: 35.897, hPct: 9.447, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-10', assetKey: 'wildflower-scatter', group: 'grassPatch', depthLayer: 'terrain', xPct: 15.4, yPct: 88.4, wPct: 24.359, hPct: 9.615, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-11', assetKey: 'wildflower-scatter', group: 'grassPatch', depthLayer: 'terrain', xPct: 85.9, yPct: 87.1, wPct: 23.077, hPct: 9.109, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-12', assetKey: 'wildflower-scatter', group: 'grassPatch', depthLayer: 'terrain', xPct: 33.3, yPct: 94.5, wPct: 25.641, hPct: 10.121, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-13', assetKey: 'wildflower-scatter', group: 'grassPatch', depthLayer: 'terrain', xPct: 65.4, yPct: 96.5, wPct: 24.359, hPct: 9.615, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-14', assetKey: 'grass-patch-light', group: 'grassPatch', depthLayer: 'terrain', xPct: 16.5, yPct: 55.5, wPct: 38.462, hPct: 14.17, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'grassPatch-15', assetKey: 'grass-patch-light', group: 'grassPatch', depthLayer: 'terrain', xPct: 31, yPct: 58, wPct: 35.897, hPct: 13.225, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'river-0', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 93, yPct: 12, wPct: 25, hPct: 13.158, rotationDeg: -169.2, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-1', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 90.639, yPct: 18.461, wPct: 25, hPct: 13.158, rotationDeg: -169.1, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-2', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 88.352, yPct: 24.928, wPct: 25, hPct: 13.158, rotationDeg: -169.7, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-3', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 86.041, yPct: 31.392, wPct: 25, hPct: 13.158, rotationDeg: -171.3, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-4', assetKey: 'river-bend', group: 'river', depthLayer: 'water', xPct: 87.769, yPct: 37.846, wPct: 25, hPct: 13.158, rotationDeg: 161.7, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'river-5', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 91.057, yPct: 44.184, wPct: 25, hPct: 13.158, rotationDeg: 170.1, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-6', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 92.865, yPct: 50.692, wPct: 25, hPct: 13.158, rotationDeg: 173.5, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-7', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 93.773, yPct: 57.253, wPct: 25, hPct: 13.158, rotationDeg: 176.8, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-8', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 94.21, yPct: 63.828, wPct: 25, hPct: 13.158, rotationDeg: 178.5, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-9', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 94.446, yPct: 70.405, wPct: 25, hPct: 13.158, rotationDeg: 179.1, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-10', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 94.609, yPct: 76.984, wPct: 25, hPct: 13.158, rotationDeg: 179.2, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-11', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 94.732, yPct: 83.562, wPct: 25, hPct: 13.158, rotationDeg: 179.4, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-12', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 94.836, yPct: 90.141, wPct: 25, hPct: 13.158, rotationDeg: 179.5, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-13', assetKey: 'river-straight', group: 'river', depthLayer: 'water', xPct: 94.937, yPct: 96.72, wPct: 25, hPct: 13.158, rotationDeg: 179.5, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'river-14', assetKey: 'river-highlight', group: 'river', depthLayer: 'water', xPct: 88.555, yPct: 17.145, wPct: 11.795, hPct: 3.104, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'river-15', assetKey: 'river-highlight', group: 'river', depthLayer: 'water', xPct: 89.976, yPct: 27.657, wPct: 11.795, hPct: 3.104, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'river-16', assetKey: 'river-highlight', group: 'river', depthLayer: 'water', xPct: 83.436, yPct: 34, wPct: 11.795, hPct: 3.104, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'river-17', assetKey: 'river-highlight', group: 'river', depthLayer: 'water', xPct: 92.765, yPct: 41.963, wPct: 11.795, hPct: 3.104, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'river-18', assetKey: 'river-highlight', group: 'river', depthLayer: 'water', xPct: 90.429, yPct: 51.328, wPct: 11.795, hPct: 3.104, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'river-19', assetKey: 'river-highlight', group: 'river', depthLayer: 'water', xPct: 97.173, yPct: 76.991, wPct: 11.795, hPct: 3.104, rotationDeg: 0, mirror: false, anchor: 'center', feather: false }),
  // riverbank-reeds/-stones: 매니페스트 depthLayer override('foregroundVegetation', river 그룹 기본값 'water' 아님) — 위 모듈 헤더 참고.
  Object.freeze({ id: 'river-20', assetKey: 'riverbank-reeds', group: 'river', depthLayer: 'foregroundVegetation', xPct: 86.887, yPct: 22.373, wPct: 10.256, hPct: 2.699, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'river-21', assetKey: 'riverbank-reeds-stones', group: 'river', depthLayer: 'foregroundVegetation', xPct: 83.904, yPct: 30.644, wPct: 10.256, hPct: 2.699, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'river-22', assetKey: 'riverbank-reeds', group: 'river', depthLayer: 'foregroundVegetation', xPct: 85.497, yPct: 38.102, wPct: 10.256, hPct: 2.699, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'river-23', assetKey: 'riverbank-reeds-stones', group: 'river', depthLayer: 'foregroundVegetation', xPct: 89.658, yPct: 47.204, wPct: 10.256, hPct: 2.699, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'river-24', assetKey: 'riverbank-reeds', group: 'river', depthLayer: 'foregroundVegetation', xPct: 91.85, yPct: 62.653, wPct: 10.256, hPct: 2.699, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'path-0', assetKey: 'path-end', group: 'path', depthLayer: 'path', xPct: 22, yPct: 53, wPct: 16.41, hPct: 5.398, rotationDeg: 153, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'path-1', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 24.931, yPct: 56.151, wPct: 14.669, hPct: 7.72, rotationDeg: 152.9, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-2', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 29.104, yPct: 59.304, wPct: 16.451, hPct: 8.658, rotationDeg: 134.5, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-3', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 64.335, yPct: 49.737, wPct: 16.18, hPct: 8.516, rotationDeg: 34.9, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-4', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 69.015, yPct: 46.264, wPct: 15.349, hPct: 8.078, rotationDeg: 35.7, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-5', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 73.708, yPct: 43.069, wPct: 14.239, hPct: 7.494, rotationDeg: 38.2, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-6', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 77.932, yPct: 40.053, wPct: 13.344, hPct: 7.023, rotationDeg: 34.7, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-7', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 81.971, yPct: 37.26, wPct: 13.315, hPct: 7.008, rotationDeg: 37.6, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-8', assetKey: 'path-straight-narrow', group: 'path', depthLayer: 'path', xPct: 68.506, yPct: 25.453, wPct: 10.514, hPct: 5.534, rotationDeg: -84.3, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-9', assetKey: 'path-straight-narrow', group: 'path', depthLayer: 'path', xPct: 63.252, yPct: 25.45, wPct: 10.027, hPct: 5.277, rotationDeg: -91.7, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-10', assetKey: 'path-straight-narrow', group: 'path', depthLayer: 'path', xPct: 58.251, yPct: 25.63, wPct: 9.593, hPct: 5.049, rotationDeg: -94.9, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-11', assetKey: 'path-straight-narrow', group: 'path', depthLayer: 'path', xPct: 53.477, yPct: 25.873, wPct: 9.231, hPct: 4.858, rotationDeg: -95.3, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-12', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 76.943, yPct: 63.898, wPct: 15.494, hPct: 8.155, rotationDeg: 30.2, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-13', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 47.611, yPct: 70.858, wPct: 20, hPct: 10.526, rotationDeg: -172.7, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-14', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 47.014, yPct: 76.106, wPct: 19.999, hPct: 10.526, rotationDeg: 177.8, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-15', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 49.109, yPct: 81.223, wPct: 19.841, hPct: 10.443, rotationDeg: 157.3, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-16', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 54.295, yPct: 85.656, wPct: 20.426, hPct: 10.751, rotationDeg: 142.6, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-17', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 61.78, yPct: 89.286, wPct: 21.967, hPct: 11.562, rotationDeg: 124.3, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-18', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 72.036, yPct: 91.166, wPct: 22.351, hPct: 11.763, rotationDeg: 98.6, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-19', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 82.884, yPct: 92.514, wPct: 22.222, hPct: 11.696, rotationDeg: 108.8, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-20', assetKey: 'path-straight', group: 'path', depthLayer: 'path', xPct: 93.266, yPct: 94.596, wPct: 22.222, hPct: 11.696, rotationDeg: 111.6, mirror: false, anchor: 'center', feather: true }),
  Object.freeze({ id: 'path-21', assetKey: 'path-curve-strong', group: 'path', depthLayer: 'path', xPct: 42.884, yPct: 57.444, wPct: 32, hPct: 16.842, rotationDeg: 124.6, mirror: true, anchor: 'center', feather: false }),
  Object.freeze({ id: 'path-22', assetKey: 'path-curve-strong', group: 'path', depthLayer: 'path', xPct: 74.044, yPct: 31.503, wPct: 25.6, hPct: 13.474, rotationDeg: 27.8, mirror: true, anchor: 'center', feather: false }),
  Object.freeze({ id: 'path-23', assetKey: 'path-curve-gentle', group: 'path', depthLayer: 'path', xPct: 64.351, yPct: 61.664, wPct: 28.444, hPct: 14.971, rotationDeg: 138.7, mirror: true, anchor: 'center', feather: false }),
  Object.freeze({ id: 'path-24', assetKey: 'path-fork', group: 'path', depthLayer: 'path', xPct: 56.162, yPct: 58.919, wPct: 34, hPct: 17.895, rotationDeg: 46.5, mirror: false, anchor: 'center', feather: false }),
  Object.freeze({ id: 'path-25', assetKey: 'path-end-entrance', group: 'path', depthLayer: 'path', xPct: 80, yPct: 92, wPct: 23.077, hPct: 8.35, rotationDeg: 17.1, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'fenceHedge-0', assetKey: 'fence-corner', group: 'fenceHedge', depthLayer: 'scenery', xPct: 8, yPct: 51, wPct: 8.205, hPct: 4.318, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'fenceHedge-1', assetKey: 'fence-corner', group: 'fenceHedge', depthLayer: 'scenery', xPct: 36, yPct: 53, wPct: 8.205, hPct: 4.318, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'fenceHedge-2', assetKey: 'fence-corner', group: 'fenceHedge', depthLayer: 'scenery', xPct: 20, yPct: 62, wPct: 8.205, hPct: 4.318, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'fenceHedge-3', assetKey: 'fence-corner', group: 'fenceHedge', depthLayer: 'scenery', xPct: 6, yPct: 61, wPct: 8.205, hPct: 4.318, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'fenceHedge-4', assetKey: 'fence-straight-short', group: 'fenceHedge', depthLayer: 'scenery', xPct: 10.266, yPct: 62.324, wPct: 8.205, hPct: 3.239, rotationDeg: -75.5, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-5', assetKey: 'fence-straight', group: 'fenceHedge', depthLayer: 'scenery', xPct: 4.604, yPct: 55.393, wPct: 16.41, hPct: 3.239, rotationDeg: 94.1, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-6', assetKey: 'fence-straight-short', group: 'fenceHedge', depthLayer: 'scenery', xPct: 15, yPct: 50, wPct: 8.205, hPct: 3.239, rotationDeg: 83.7, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-7', assetKey: 'fence-straight-short', group: 'fenceHedge', depthLayer: 'scenery', xPct: 31.617, yPct: 51.406, wPct: 8.205, hPct: 3.239, rotationDeg: 117.5, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-8', assetKey: 'fence-straight', group: 'fenceHedge', depthLayer: 'scenery', xPct: 41.102, yPct: 58.285, wPct: 16.41, hPct: 3.239, rotationDeg: 178.5, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-9', assetKey: 'fence-gate', group: 'fenceHedge', depthLayer: 'scenery', xPct: 33, yPct: 61, wPct: 12.308, hPct: 4.318, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'fenceHedge-10', assetKey: 'flower-bed-border', group: 'fenceHedge', depthLayer: 'scenery', xPct: 8.084, yPct: 60.945, wPct: 20.513, hPct: 3.779, rotationDeg: -53.7, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-11', assetKey: 'hedge-end', group: 'fenceHedge', depthLayer: 'scenery', xPct: 8.109, yPct: 62.649, wPct: 8.205, hPct: 4.318, rotationDeg: -66.3, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'fenceHedge-12', assetKey: 'hedge-straight', group: 'fenceHedge', depthLayer: 'scenery', xPct: 4.826, yPct: 54.729, wPct: 16.41, hPct: 4.318, rotationDeg: 23.7, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-13', assetKey: 'hedge-straight-tall', group: 'fenceHedge', depthLayer: 'scenery', xPct: 16.878, yPct: 49.233, wPct: 16.41, hPct: 5.398, rotationDeg: 86.6, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-14', assetKey: 'hedge-straight', group: 'fenceHedge', depthLayer: 'scenery', xPct: 12, yPct: 49.3, wPct: 16.41, hPct: 4.318, rotationDeg: -6, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'fenceHedge-15', assetKey: 'hedge-straight', group: 'fenceHedge', depthLayer: 'scenery', xPct: 30.5, yPct: 49.6, wPct: 16.41, hPct: 4.318, rotationDeg: 6, mirror: false, anchor: 'bottom-left', feather: false }),
  Object.freeze({ id: 'cluster-0', assetKey: 'flower-cluster-pink', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 9, yPct: 65, wPct: 8.718, hPct: 3.212, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-1', assetKey: 'flower-cluster-yellow', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 20, yPct: 66, wPct: 8.718, hPct: 3.212, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-2', assetKey: 'flower-cluster-mixed', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 33, yPct: 64, wPct: 10.256, hPct: 3.149, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-3', assetKey: 'shrub-round', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 40, yPct: 62, wPct: 8.718, hPct: 3.671, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  // shrub-wide #0(하네스 4번째 CLUSTERS 엔트리, world (6,58)) — anchor
  // bottom-center라 왼쪽 가장자리(xPct - wPct/2 ≈ -0.154%, 390px 기준 약
  // -0.6px)가 화면 왼쪽 경계를 살짝 넘어간다. 오너 승인 "알려진 겹침" —
  // 고치지 않고 원본 수치 그대로 이식.
  Object.freeze({ id: 'cluster-4', assetKey: 'shrub-wide', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 6, yPct: 58, wPct: 12.308, hPct: 3.239, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-5', assetKey: 'flower-cluster-pink', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 42, yPct: 57, wPct: 8.718, hPct: 3.212, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-6', assetKey: 'flower-cluster-yellow', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 24, yPct: 70, wPct: 8.718, hPct: 3.212, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-7', assetKey: 'flower-cluster-mixed', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 52, yPct: 66, wPct: 10.256, hPct: 3.149, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-8', assetKey: 'shrub-round-small', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 58, yPct: 72, wPct: 6.667, hPct: 2.632, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-9', assetKey: 'shrub-wide', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 70, yPct: 66, wPct: 12.308, hPct: 3.239, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-10', assetKey: 'flower-cluster-pink', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 66, yPct: 58, wPct: 8.718, hPct: 3.212, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-11', assetKey: 'flower-cluster-yellow', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 72, yPct: 72, wPct: 8.718, hPct: 3.212, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-12', assetKey: 'flower-cluster-mixed', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 82, yPct: 70, wPct: 10.256, hPct: 3.149, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-13', assetKey: 'shrub-round', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 15, yPct: 90, wPct: 8.718, hPct: 3.671, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-14', assetKey: 'shrub-wide', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 62, yPct: 80, wPct: 12.308, hPct: 3.239, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-15', assetKey: 'flower-cluster-pink', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 48, yPct: 95, wPct: 8.718, hPct: 3.212, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-16', assetKey: 'flower-cluster-yellow', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 88, yPct: 88, wPct: 8.718, hPct: 3.212, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-17', assetKey: 'flower-cluster-mixed', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 12, yPct: 56, wPct: 10.256, hPct: 3.149, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-18', assetKey: 'flower-cluster-mixed', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 18, yPct: 60.5, wPct: 10.256, hPct: 3.149, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-19', assetKey: 'flower-cluster-mixed', group: 'cluster', depthLayer: 'foregroundVegetation', xPct: 30.5, yPct: 57, wPct: 10.256, hPct: 3.149, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  // flower-pot / flower-pot-tall: 매니페스트 depthLayer override('scenery', cluster 그룹 기본값 'foregroundVegetation' 아님) — 위 모듈 헤더 참고.
  Object.freeze({ id: 'cluster-20', assetKey: 'flower-pot', group: 'cluster', depthLayer: 'scenery', xPct: 62, yPct: 50, wPct: 6.154, hPct: 3.239, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-21', assetKey: 'flower-pot', group: 'cluster', depthLayer: 'scenery', xPct: 70, yPct: 50, wPct: 6.154, hPct: 3.239, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-22', assetKey: 'flower-pot', group: 'cluster', depthLayer: 'scenery', xPct: 74, yPct: 66, wPct: 5.641, hPct: 2.969, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-23', assetKey: 'flower-pot', group: 'cluster', depthLayer: 'scenery', xPct: 82, yPct: 66, wPct: 5.641, hPct: 2.969, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
  Object.freeze({ id: 'cluster-24', assetKey: 'flower-pot-tall', group: 'cluster', depthLayer: 'scenery', xPct: 57, yPct: 60, wPct: 6.667, hPct: 3.509, rotationDeg: 0, mirror: false, anchor: 'bottom-center', feather: false }),
])

// ---------------------------------------------------------------------
// GROUND — 하늘·언덕 배경 밴드(sky-hills) + 잔디 베이스(grass-base) 타일.
// 이 둘은 하네스에서 placePx()가 아니라 각각 정적 <img>/CSS
// background-image로 그려지므로(=data-asset이 있어도 "배치 호출"의
// 산출물이 아님) ENV_PLACEMENTS에 넣지 않고 별도로 둔다.
export const GROUND = Object.freeze({
  skyHills: Object.freeze({
    assetKey: 'sky-hills',
    xPct: 0,
    yPct: 0,
    wPct: 100,
    hPct: 12, // .skyHills { height: 12% } — 세계 상단 12%(y 0~12) 밴드
    anchor: 'top-left',
    objectFit: 'cover', // .skyHills img { object-fit: cover }
  }),
  grassBase: Object.freeze({
    assetKey: 'grass-base',
    // CSS background-size: 128px 128px — 캔버스 %가 아니라 고정 px이므로,
    // SCENERY_REF_WIDTH(390) 기준으로 "장면 폭/높이의 %"로 환산해 둔다
    // (해상도가 달라지면 렌더러가 이 %를 다시 px로 곱산해야 함).
    tileWidthPct: 128 / 3.9,
    tileHeightPct: 128 / 3.9 / WORLD_ASPECT,
    repeat: 'xy',
    // .grassBase.fallback — 자산 로드 실패 시 CSS 그라디언트 폴백(장식용,
    // 데이터 무결성과 무관 — CLAUDE.md 규칙 9의 DB 폴백과는 별개 개념).
    fallbackBackground: 'linear-gradient(180deg, #c3dd93 0%, #94c268 35%, #6ea347 70%, #4d7f34 100%)',
  }),
})

// ---------------------------------------------------------------------
// PROP_PLACEMENTS — 항상 보이는(레벨 무관) 마을 소품: 나무/가로등/담쟁이/
// 화단(nature/flower-garden)/벤치/우체통. 하네스 DOM 순서 그대로(id
// prop-N). kind:'townAsset'인 항목은 townAssetKey로 src/assets/town/
// index.js의 TOWN_ASSETS를 그대로 찾아 쓴다 — 위임 지시문은 예시로
// 'nature/tree'|'decorations/street-lamp' 두 키만 들었지만, 하네스가
// 실제로 이 always-visible 섹션에서 쓰는 실자산은 그보다 많다
// (nature/flower-garden, decorations/bench, decorations/red-post-box도
// TOWN_ASSETS에 이미 등록돼 있다 — src/assets/town/index.js 확인) — 예시
// 두 키에 임의로 줄이지 않고 하네스가 실제로 그리는 항목을 전부 그대로
// 옮겼다. kind:'ivy'인 항목은 town 자산이 아니라 하네스 자체 인라인
// SVG(담쟁이 잎)라 townAssetKey 대신 svgInner(리터럴 SVG 마크업)를 담아
// React 레이어가 그대로 재사용할 수 있게 했다.
//
// 이 목록에 포함하지 않은 것(의도적):
// - 배경 채움 나무(bgTreeSpecs, SVG 타원 절차 생성) — "Batch 1 범위
//   아님"이라고 하네스 자신이 명시하며, 실제 town nature/tree 자산과도
//   무관(다른 스타일의 순수 장식 SVG)이라 이 소품 계약의 범위 밖.
// - Paul 본체 / 환영 말풍선("Welcome to Paul " + "Town!") — 위 모듈
//   헤더의 오너 결정 참고.
// 4-arm 안내판(Learn/Grow/Be Kind/원래 "Go Further")은 2026-09-18 오너
// 결정으로 카피 4번째 칸만 "Explore"로 바꿔 SIGNS.fourWay로 포함했다
// (아래 SIGNS 블록 참고) — PROP_PLACEMENTS가 아니라 SIGNS 스키마 확장이라
// 이 목록에는 여전히 없다.
export const PROP_PLACEMENTS = Object.freeze([
  Object.freeze({ id: 'prop-0', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 4, yPct: 30, wPct: 10.3, filter: null, opacity: null, shadow: Object.freeze({ xPct: 4, yPct: 30, wPct: 7.7, hPct: 0.8 }), svgInner: null }),
  Object.freeze({ id: 'prop-1', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 44, yPct: 36, wPct: 9.7, filter: null, opacity: null, shadow: Object.freeze({ xPct: 44, yPct: 36, wPct: 7.2, hPct: 0.8 }), svgInner: null }),
  Object.freeze({ id: 'prop-2', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 8, yPct: 46, wPct: 7.2, filter: 'saturate(.55) brightness(1.08)', opacity: 0.85, shadow: Object.freeze({ xPct: 8, yPct: 46, wPct: 5.1, hPct: 0.5 }), svgInner: null }),
  Object.freeze({ id: 'prop-3', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 18, yPct: 44, wPct: 6.7, filter: 'saturate(.55) brightness(1.08)', opacity: 0.82, shadow: Object.freeze({ xPct: 18, yPct: 44, wPct: 4.6, hPct: 0.5 }), svgInner: null }),
  Object.freeze({ id: 'prop-4', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 29, yPct: 45, wPct: 7.7, filter: 'saturate(.55) brightness(1.08)', opacity: 0.85, shadow: Object.freeze({ xPct: 29, yPct: 45, wPct: 5.6, hPct: 0.5 }), svgInner: null }),
  Object.freeze({ id: 'prop-5', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 39, yPct: 47, wPct: 6.9, filter: 'saturate(.55) brightness(1.08)', opacity: 0.82, shadow: Object.freeze({ xPct: 39, yPct: 47, wPct: 4.9, hPct: 0.5 }), svgInner: null }),
  Object.freeze({ id: 'prop-6', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 2, yPct: 60, wPct: 11.3, filter: null, opacity: null, shadow: Object.freeze({ xPct: 2, yPct: 60, wPct: 8.7, hPct: 0.9 }), svgInner: null }),
  Object.freeze({ id: 'prop-7', kind: 'townAsset', townAssetKey: 'decorations/street-lamp', xPct: 16, yPct: 50, wPct: 5.1, filter: null, opacity: null, shadow: null, svgInner: null }),
  Object.freeze({ id: 'prop-8', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 66, yPct: 58, wPct: 8.7, filter: null, opacity: null, shadow: Object.freeze({ xPct: 66, yPct: 58, wPct: 6.2, hPct: 0.6 }), svgInner: null }),
  Object.freeze({ id: 'prop-9', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 72, yPct: 72, wPct: 7.7, filter: null, opacity: null, shadow: Object.freeze({ xPct: 72, yPct: 72, wPct: 5.6, hPct: 0.6 }), svgInner: null }),
  Object.freeze({
    id: 'prop-10',
    kind: 'ivy',
    townAssetKey: null,
    xPct: 14,
    yPct: 48,
    wPct: 6.7,
    filter: null,
    opacity: null,
    shadow: null,
    svgInner: '<svg width="100%" height="100%" viewBox="0 0 26 26"><circle cx="6" cy="18" r="6" fill="#4a7a3c" opacity="0.75"/><circle cx="4" cy="10" r="4.5" fill="#568a45" opacity="0.7"/><circle cx="10" cy="6" r="3.6" fill="#4a7a3c" opacity="0.65"/></svg>',
  }),
  Object.freeze({ id: 'prop-11', kind: 'townAsset', townAssetKey: 'nature/flower-garden', xPct: 10, yPct: 58, wPct: 16.4, filter: null, opacity: null, shadow: null, svgInner: null }),
  Object.freeze({ id: 'prop-12', kind: 'townAsset', townAssetKey: 'nature/flower-garden', xPct: 34, yPct: 59, wPct: 15.4, filter: null, opacity: null, shadow: null, svgInner: null }),
  Object.freeze({ id: 'prop-13', kind: 'townAsset', townAssetKey: 'decorations/bench', xPct: 7, yPct: 53, wPct: 11.3, filter: null, opacity: null, shadow: null, svgInner: null }),
  Object.freeze({ id: 'prop-14', kind: 'townAsset', townAssetKey: 'decorations/red-post-box', xPct: 39, yPct: 60, wPct: 5.1, filter: null, opacity: null, shadow: null, svgInner: null }),
  Object.freeze({ id: 'prop-15', kind: 'townAsset', townAssetKey: 'decorations/street-lamp', xPct: 46, yPct: 64, wPct: 5.1, filter: null, opacity: null, shadow: null, svgInner: null }),
  Object.freeze({ id: 'prop-16', kind: 'townAsset', townAssetKey: 'decorations/bench', xPct: 47, yPct: 70, wPct: 11.8, filter: null, opacity: null, shadow: null, svgInner: null }),
  Object.freeze({ id: 'prop-17', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 49, yPct: 70, wPct: 12.3, filter: null, opacity: null, shadow: Object.freeze({ xPct: 49, yPct: 70, wPct: 9.2, hPct: 0.9 }), svgInner: null }),
  Object.freeze({ id: 'prop-18', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 80, yPct: 86, wPct: 14.4, filter: null, opacity: null, shadow: Object.freeze({ xPct: 80, yPct: 86, wPct: 11.3, hPct: 1.1 }), svgInner: null }),
  Object.freeze({ id: 'prop-19', kind: 'townAsset', townAssetKey: 'nature/tree', xPct: 3, yPct: 88, wPct: 14.9, filter: null, opacity: null, shadow: Object.freeze({ xPct: 3, yPct: 88, wPct: 11.8, hPct: 1.1 }), svgInner: null }),
])

// ---------------------------------------------------------------------
// BG_FILLER_TREES — 배경 채움 나무 10그루(하네스의 bgTreeSpecs, "Batch 1
// 범위 아님" 순수 SVG 도형, 실제 town nature/tree 자산과 무관한 별개
// 장식). 좌표는 하네스의 `<svg id="terrain" viewBox="0 0 100 100"
// preserveAspectRatio="none">` 안에서 그려지므로 이미 "장면 폭/높이 각각의
// %"다(viewBox가 preserveAspectRatio="none"으로 장면 전체(폭:높이=100:190)를
// 비균일 스트레치해 채우기 때문에, viewBox의 x 1단위 = 장면 폭 1%, y
// 1단위 = 장면 높이 1%가 그대로 성립 — WORLD_ASPECT 보정이 필요 없다).
// cx/cy/s/color 4개만 데이터로 얼리고(하네스 bgTreeSpecs 튜플 [cx, cy, s,
// color] 그대로), 실제 도형(밑동 타원 + 몸통 원 + 하이라이트 원) 산식은
// bgFillerTreeShapes()가 하네스의 forEach 블록 계산을 그대로 옮겨
// 적용한다 — TownGroundLayer.jsx와 scripts/testTownWorldScenery.mjs가 이
// 함수 하나를 공유해 렌더/검증이 어긋나지 않는다.
export const BG_FILLER_TREES = Object.freeze([
  Object.freeze({ id: 'bgTree-0', cx: 7, cy: 15, s: 1.15, color: '#4f7a4a' }),
  Object.freeze({ id: 'bgTree-1', cx: 18, cy: 20, s: 0.97, color: '#6a9459' }),
  Object.freeze({ id: 'bgTree-2', cx: 30, cy: 14, s: 1.08, color: '#3f6a3f' }),
  Object.freeze({ id: 'bgTree-3', cx: 56, cy: 30, s: 1.03, color: '#557f4d' }),
  Object.freeze({ id: 'bgTree-4', cx: 64, cy: 18, s: 0.87, color: '#729960' }),
  Object.freeze({ id: 'bgTree-5', cx: 66, cy: 16, s: 1.13, color: '#456e40' }),
  Object.freeze({ id: 'bgTree-6', cx: 62, cy: 22, s: 0.92, color: '#638a52' }),
  Object.freeze({ id: 'bgTree-7', cx: 22, cy: 32, s: 0.82, color: '#5c8a4b' }),
  Object.freeze({ id: 'bgTree-8', cx: 38, cy: 30, s: 0.92, color: '#3f6a3f' }),
  Object.freeze({ id: 'bgTree-9', cx: 50, cy: 32, s: 0.77, color: '#6a9459' }),
])

/**
 * BG_FILLER_TREES 항목 하나(cx/cy/s/color) -> 실제로 그릴 3개 도형(밑동
 * 타원 + 몸통 원 + 하이라이트 원) 서술. 하네스의
 * `bgTreeSpecs.forEach(function (t) { ... })` 블록 산식 그대로(재도출
 * 없음) — g.appendChild 순서(타원 → 몸통 원 → 하이라이트 원)와 동일한
 * 순서로 반환한다.
 * @param {{cx:number, cy:number, s:number, color:string}} tree
 * @returns {{
 *   trunk: {cx:number, cy:number, rx:number, ry:number, fill:string},
 *   body: {cx:number, cy:number, r:number, fill:string},
 *   highlight: {cx:number, cy:number, r:number, fill:string},
 * }}
 */
export function bgFillerTreeShapes(tree) {
  const cx = Number(tree && tree.cx) || 0
  const cy = Number(tree && tree.cy) || 0
  const s = Number(tree && tree.s) || 0
  const color = (tree && tree.color) || '#5c8a4b'
  return {
    trunk: { cx, cy: cy + s * 0.85, rx: s * 0.58, ry: s * 1.25, fill: '#5c4632' },
    body: { cx, cy, r: s, fill: color },
    highlight: { cx: cx - s * 0.5, cy: cy - s * 0.3, r: s * 0.55, fill: '#88ab6e' },
  }
}

// ---------------------------------------------------------------------
// SIGNS — My House / To the Sea → / Lv.N 표지판의 정확한 SVG 지오메트리
// (하네스 리터럴 마크업 그대로, 재도출 없음). svgInner는 `<svg
// viewBox="...">...</svg>` 전체 문자열(React 레이어가 그대로
// dangerouslySetInnerHTML 하거나 파싱해 재사용). lvSign은 위치가 랜드마크마다
// 달라 여기엔 크기/모양만 두고(위치는 LANDMARK_DECOR[*].signAnchor), 실제
// 텍스트는 textFormat('Lv.{n}')의 {n}을 unlockLevel로 치환해 만든다 —
// svgTemplate 안의 'Lv.{n}' 토큰도 동일한 자리표시자다.
export const SIGNS = Object.freeze({
  myHouse: Object.freeze({
    text: 'My House',
    xPct: 15,
    yPct: 67,
    wPct: 46 / 3.9,
    viewBox: '0 0 46 34',
    anchor: 'bottom-center',
    svgInner: '<svg viewBox="0 0 46 34"><rect x="21" y="16" width="4" height="18" fill="#7c5a34"/><rect x="1" y="1" width="44" height="17" rx="2" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1.4"/><text x="23" y="13" font-family="Georgia, serif" font-size="9.5" font-weight="700" fill="#4a2f16" text-anchor="middle">My House</text></svg>',
  }),
  sea: Object.freeze({
    text: 'To the Sea →',
    xPct: 80, // GEO.seaSign[0] — worldContract.js의 PROTECTED.seaSign/PATHS.sea 끝점과 동일 지점(80,92)
    yPct: 92,
    wPct: 70 / 3.9,
    viewBox: '0 0 70 50',
    anchor: 'bottom-center',
    svgInner: '<svg viewBox="0 0 70 50"><rect x="6" y="18" width="4.5" height="30" fill="#7c5a34"/><rect x="1" y="1" width="60" height="20" rx="2" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1.4"/><path d="M61,1 L69,11 L61,21 Z" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1.2"/><text x="31" y="15" font-family="Georgia, serif" font-size="9" font-weight="700" fill="#4a2f16" text-anchor="middle">To the Sea →</text></svg>',
  }),
  lvSign: Object.freeze({
    wPct: 26 / 3.9,
    viewBox: '0 0 26 36',
    anchor: 'bottom-center',
    textFormat: 'Lv.{n}',
    svgTemplate: '<svg viewBox="0 0 26 36"><rect x="11" y="12" width="3.4" height="24" fill="#7c5a34"/><rect x="1" y="1" width="22" height="14" rx="2" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1.3"/><text x="12" y="11" font-family="Georgia, serif" font-size="8" font-weight="700" fill="#4a2f16" text-anchor="middle">Lv.{n}</text></svg>',
  }),
  // 2026-09-18(오너 결정 — 사전 보정 패스) — 하네스의 4-arm 안내판
  // (Learn/Grow/Be Kind/Go Further, world (34,84))을 그대로 포팅하되
  // 4번째 칸 텍스트만 "Go Further"→"Explore"로 교체한다(그 외 좌표/
  // 크기/폰트-사이즈 속성/색상은 전부 하네스 리터럴 그대로, 재도출
  // 없음 — scripts/testTownWorldScenery.mjs가 이 단일 치환 규칙으로
  // 하네스 실측과 대조한다).
  fourWay: Object.freeze({
    text: 'Learn, Grow, Be Kind, Explore',
    xPct: 34,
    yPct: 84,
    wPct: 64 / 3.9,
    viewBox: '0 0 64 82',
    anchor: 'bottom-center',
    svgInner: '<svg viewBox="0 0 64 82"><rect x="29" y="14" width="5" height="66" fill="#7c5a34"/><rect x="6" y="16" width="34" height="11" rx="2" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1.2"/><path d="M40,16 L47,21.5 L40,27 Z" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1"/><text x="23" y="24.5" font-family="Georgia, serif" font-size="7.5" font-weight="700" fill="#4a2f16" text-anchor="middle">Learn</text><rect x="24" y="31" width="34" height="11" rx="2" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1.2"/><path d="M24,31 L17,36.5 L24,42 Z" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1"/><text x="41" y="39.5" font-family="Georgia, serif" font-size="7.5" font-weight="700" fill="#4a2f16" text-anchor="middle">Grow</text><rect x="6" y="46" width="38" height="11" rx="2" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1.2"/><path d="M44,46 L51,51.5 L44,57 Z" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1"/><text x="25" y="54.5" font-family="Georgia, serif" font-size="7" font-weight="700" fill="#4a2f16" text-anchor="middle">Be Kind</text><rect x="22" y="61" width="40" height="11" rx="2" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1.2"/><path d="M22,61 L15,66.5 L22,72 Z" fill="#c9a06a" stroke="#6e4d2a" stroke-width="1"/><text x="42" y="69.5" font-family="Georgia, serif" font-size="6.6" font-weight="700" fill="#4a2f16" text-anchor="middle">Explore</text></svg>',
  }),
})

// 잠금(locked) 랜드마크의 실루엣 필터/베일 — .locked img / .locked::after
// CSS 그대로(재도출 없음).
export const LOCKED_FILTER = Object.freeze({
  filter: 'grayscale(0.3) saturate(0.7) brightness(0.78)',
  opacity: 0.62,
})
export const LOCKED_VEIL = Object.freeze({
  background: 'radial-gradient(ellipse at center, rgba(255,250,232,0.5) 0%, rgba(255,250,232,0.32) 55%, rgba(255,250,232,0.14) 100%)',
})

// ---------------------------------------------------------------------
// LANDMARK_DECOR — LOTS id별(src/utils/town/townScene.js LOTS와 동일 id)
// 잠금 장식: 헤이즈 박스(hazeBox, locked일 때만 보임)/Lv.N 표지판 앵커
// (signAnchor)/그림자 스케일(shadowScale, world width % 기준 [wScale,
// hScale] — 실제 렌더 시 shadow.wPct = landmark.w * wScale, shadow.hPct
// = landmark.w * hScale / 1.9로 계산, worldContract.js LANDMARKS[*].w
// 참고). unlockLevel은 여기 값을 "잠금해제 판정에 쓰라"는 뜻이 아니다 —
// 그 판정은 townScene.js의 DISTRICTS[*].unlock/LOTS/lotState()에만
// 위임된 채 그대로 남아 있다(CLAUDE.md 규칙 3). 여기 unlockLevel은
// 오직 "하네스가 그 값으로 Lv.N 표지판을 그렸다"는 사실을 테스트가
// DISTRICTS[LOTS 대응 district].unlock과 대조하기 위한 참고값이다.
export const LANDMARK_DECOR = Object.freeze({
  'my-house': Object.freeze({ unlockLevel: 1, signAnchor: null, hazeBox: null, shadowScale: Object.freeze([0.9, 0.16]) }),
  'book-shop': Object.freeze({
    unlockLevel: 3,
    signAnchor: Object.freeze([66, 66]),
    hazeBox: Object.freeze({ xPct: 60, yPct: 44, wPct: 34, hPct: 26, blur: 9, opacity: 0.6 }),
    shadowScale: Object.freeze([0.87, 0.18]),
  }),
  cafe: Object.freeze({
    unlockLevel: 5,
    signAnchor: null, // Village Square 공용 헤이즈/표지판을 stone-fountain이 대표(같은 리전)
    hazeBox: Object.freeze({ xPct: 32, yPct: 28, wPct: 56, hPct: 42, blur: 9, opacity: 0.6 }),
    shadowScale: Object.freeze([0.87, 0.18]),
  }),
  'stone-fountain': Object.freeze({
    unlockLevel: 5,
    signAnchor: Object.freeze([52, 59]),
    hazeBox: null, // cafe의 hazeBox를 공유(Village Square 공용 헤이즈)
    shadowScale: null,
  }),
  bridge: Object.freeze({
    unlockLevel: 6,
    signAnchor: Object.freeze([80, 38]),
    hazeBox: Object.freeze({ xPct: 60, yPct: 20, wPct: 44, hPct: 24, blur: 9, opacity: 0.65 }),
    shadowScale: null,
  }),
  'english-school': Object.freeze({
    unlockLevel: 7,
    signAnchor: Object.freeze([50, 28]),
    hazeBox: Object.freeze({ xPct: 28, yPct: 5, wPct: 34, hPct: 22, blur: 9, opacity: 0.7 }),
    shadowScale: null,
  }),
  'clock-tower': Object.freeze({
    unlockLevel: 8,
    signAnchor: Object.freeze([74, 27]),
    hazeBox: Object.freeze({ xPct: 62, yPct: -1, wPct: 42, hPct: 30, blur: 9, opacity: 0.7 }),
    shadowScale: null,
  }),
})

/**
 * (선택) level로 ENV_PLACEMENTS를 거르는 헬퍼 — 현재 모든 항목이
 * 레벨 무관(minLevel/maxLevel 필드가 없음)이라 배열을 그대로 돌려준다.
 * 향후 레벨 종속 Batch 자산이 추가되면 이 함수만 갱신하면 된다(스키마
 * 변경 없이).
 * @param {number} _level (현재 미사용 — 모든 배치가 레벨 무관)
 * @returns {typeof ENV_PLACEMENTS}
 */
export function sceneryFor(_level) {
  return ENV_PLACEMENTS
}
