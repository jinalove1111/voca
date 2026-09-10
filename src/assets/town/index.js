// src/assets/town/index.js — Paul Town V1 일러스트 자산 매핑(2026-09-11).
//
// 최종 일러스트가 준비되면 여기(assetKey별 import 추가)에서만 교체한다 —
// 지금은 TOWN_ASSETS가 비어 있고, 어떤 assetKey를 조회해도 townAsset()은
// null을 반환한다. 호출부(TownGrid/TownShopPanel/TownInventory)는
// townAsset(item.assetKey)가 null이면 항상 이모지(item.emoji)로 폴백한다
// (기능이 이미지 부재로 깨지지 않음).
//
// 브랜드 마스코트 캐릭터 이미지는 여기 절대 두지 않는다(별도 리액션
// 레지스트리 + 공용 프레젠테이션 컴포넌트로만 렌더) — 이 파일/이 폴더는
// 마을 건물·자연·동물·장식 에셋 전용이다.
export const TOWN_ASSETS = {}

/**
 * assetKey -> 이미지 URL. 등록되지 않은 키는 null(이모지 폴백 신호).
 * @param {string} assetKey
 * @returns {string|null}
 */
export function townAsset(assetKey) {
  if (typeof assetKey !== 'string' || assetKey.length === 0) return null
  return TOWN_ASSETS[assetKey] || null
}
