// src/assets/town/index.js — Paul Town V1 일러스트 자산 매핑(2026-09-11).
//
// 최종 일러스트가 준비되면 여기(assetKey별 import 추가)에서만 교체한다 —
// 2026-09-13부로 8개 키(my-house/british-cottage/tree/garden-stage-0..4)가
// 채워졌고, 2026-09-14에 9번째 키(buildings/book-shop), 10번째 키
// (decorations/red-post-box), 11번째 키(animals/cat), 12번째 키
// (animals/owl), 13번째 키(animals/puppy), 14번째 키(buildings/cafe)가
// 추가됐다. 같은 날 Batch 3 첫 자산으로 15번째 키(special/bridge), 두 번째
// 자산으로 16번째 키(special/english-school), 세 번째 자산으로 17번째 키
// (decorations/town-sign), 네 번째 자산으로 18번째 키(special/clock-tower),
// 다섯 번째 자산으로 19번째 키(decorations/shop-lamp), 여섯 번째 자산으로
// 20번째 키(decorations/street-lamp), 일곱 번째 자산으로 21번째 키
// (decorations/stone-fountain)가 추가됐다 — Batch 3의 8개 목표 자산 중
// decorations/bench는 지속적인 baked 배경 글로우/비네트 결함(안전 처리로
// 제거 불가)으로 이번 배치에서 DEFERRED — V2 아트워크 백로그로 이월,
// 후속 배치에서 재시도한다(TOWN_ASSETS에 추가하지 않음, 이모지 폴백 유지).
// 2026-09-16(P0 Flower Bed 드롭인) — 22번째 키(nature/flower-garden)
// 추가. 이 키는 154/155차와 달리 기존 파일 교체가 아니라 신규 등록 —
// assetKeyFor()가 이미 'nature/flower-garden'을 정확히 파생하고 있었음이
// 153차에 확인됐으므로(townCatalog.js 무변경), 여기 import+키 한 줄만
// 추가하면 TownGrid/TownShopPanel/TownInventory/TownObjectLayer 등 이
// 파일을 거쳐가는 모든 호출부가 즉시 실제 이미지를 그린다(V1/V2 공용
// resolver라 V1도 함께 emoji→실제 이미지로 바뀜, 의도된 동작).
// townAsset()은 이제 이 22개 키에 대해서만 실제 이미지 URL을 반환한다.
// 그 외 모든 assetKey(bench 등 나머지 카탈로그 항목)는 여전히
// TOWN_ASSETS에 없어 townAsset()이 null을 반환한다.
// 호출부(TownGrid/TownShopPanel/TownInventory)는 townAsset(item.assetKey)가
// null이면 항상 이모지(item.emoji)로 폴백한다(기능이 이미지 부재로 깨지지
// 않음).
//
// 브랜드 마스코트 캐릭터 이미지는 여기 절대 두지 않는다(별도 리액션
// 레지스트리 + 공용 프레젠테이션 컴포넌트로만 렌더) — 이 파일/이 폴더는
// 마을 건물·자연·동물·장식 에셋 전용이다.
import myHouse from './buildings/my-house.webp'
import britishCottage from './buildings/british-cottage.webp'
import bookShop from './buildings/book-shop.webp'
import redPostBox from './decorations/red-post-box.webp'
import cat from './animals/cat.webp'
import owl from './animals/owl.webp'
import puppy from './animals/puppy.webp'
import cafe from './buildings/cafe.webp'
import bridge from './special/bridge.webp'
import englishSchool from './special/english-school.webp'
import townSign from './decorations/town-sign.webp'
import clockTower from './special/clock-tower.webp'
import shopLamp from './decorations/shop-lamp.webp'
import streetLamp from './decorations/street-lamp.webp'
import stoneFountain from './decorations/stone-fountain.webp'
import tree from './nature/tree.webp'
import flowerGarden from './nature/flower-garden.webp'
import gardenStage0 from './nature/garden-stage-0.webp'
import gardenStage1 from './nature/garden-stage-1.webp'
import gardenStage2 from './nature/garden-stage-2.webp'
import gardenStage3 from './nature/garden-stage-3.webp'
import gardenStage4 from './nature/garden-stage-4.webp'

export const TOWN_ASSETS = {
  'buildings/my-house': myHouse,
  'buildings/british-cottage': britishCottage,
  'buildings/book-shop': bookShop,
  'decorations/red-post-box': redPostBox,
  'animals/cat': cat,
  'animals/owl': owl,
  'animals/puppy': puppy,
  'buildings/cafe': cafe,
  'special/bridge': bridge,
  'special/english-school': englishSchool,
  'decorations/town-sign': townSign,
  'special/clock-tower': clockTower,
  'decorations/shop-lamp': shopLamp,
  'decorations/street-lamp': streetLamp,
  'decorations/stone-fountain': stoneFountain,
  'nature/tree': tree,
  'nature/flower-garden': flowerGarden,
  'nature/garden-stage-0': gardenStage0,
  'nature/garden-stage-1': gardenStage1,
  'nature/garden-stage-2': gardenStage2,
  'nature/garden-stage-3': gardenStage3,
  'nature/garden-stage-4': gardenStage4,
}

/**
 * assetKey -> 이미지 URL. 등록되지 않은 키는 null(이모지 폴백 신호).
 * @param {string} assetKey
 * @returns {string|null}
 */
export function townAsset(assetKey) {
  if (typeof assetKey !== 'string' || assetKey.length === 0) return null
  return TOWN_ASSETS[assetKey] || null
}
