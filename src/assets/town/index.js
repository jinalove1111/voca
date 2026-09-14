// src/assets/town/index.js — Paul Town V1 일러스트 자산 매핑(2026-09-11).
//
// 최종 일러스트가 준비되면 여기(assetKey별 import 추가)에서만 교체한다 —
// 2026-09-13부로 8개 키(my-house/british-cottage/tree/garden-stage-0..4)가
// 채워졌고, 2026-09-14에 9번째 키(buildings/book-shop), 10번째 키
// (decorations/red-post-box), 11번째 키(animals/cat), 12번째 키
// (animals/owl), 13번째 키(animals/puppy), 14번째 키(buildings/cafe)가
// 추가됐다. 같은 날 Batch 3 첫 자산으로 15번째 키(special/bridge), 두 번째
// 자산으로 16번째 키(special/english-school), 세 번째 자산으로 17번째 키
// (decorations/town-sign)가 추가됐다.
// townAsset()은 이 17개 키에 대해서만 실제 이미지 URL을 반환한다. 그 외
// 모든 assetKey(clock-tower 등 나머지 카탈로그 항목)는 여전히
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
import tree from './nature/tree.webp'
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
  'nature/tree': tree,
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
