// src/utils/town/proto2_5d/depthVisual.js — Paul Town 2.5D 캐릭터 프로토타입
// (Stage 3, 2026-09-22) Y-기반 스케일/깊이 순서 파생.
//
// 새 스케일 공식/새 depth 모델을 발명하지 않는다(CLAUDE.md 규칙 3) —
// worldContract.js의 depthScale(y)(기존 배치 아이템/TownCharacter.jsx가
// 이미 쓰는 유일한 깊이-스케일 진실 원천)와 depthOrder.js의
// depthKey/cssZIndex(기존 V2 worldRender.js worldZIndex가 이미 위임하는
// 유일한 z-index 진실 원천)를 그대로 재사용만 한다. 순수 함수만(React/DOM/
// Math.random/Date.now 없음).
//
// 격리 원칙(ASTRA_HANDOFF_2026-09-21.md §12/§19) — worldContract.js/
// depthOrder.js는 V2 컴포넌트가 아니라 이미 이 프로토타입의 다른 파일
// (Proto25DScreen.jsx)도 WORLD 상수를 재사용 중인 순수 유틸이라 이 import는
// "V2 실데이터와 결합"이 아니다(팀장 지시 — walkGrid.js 헤더 주석 참고,
// 구분 기준은 "V2 컴포넌트/상태를 import하는가"이지 "순수 유틸을 재사용
// 하는가"가 아니다).
import { depthScale } from '../worldContract'
import { depthKey, cssZIndex } from '../depthOrder'

// 캐릭터 전용 depthOrder.js 레이어 — depthOrder.js DEPTH_LAYERS/LAYER_BASE/
// Y_RANKED_LAYERS에 2026-09-22 Stage 3로 추가된 'character' 그대로.
export const CHARACTER_LAYER = 'character'
// 데모 장애물(walkGrid.js OBSTACLES)은 콘텐츠 티어의 기존 'objects'
// 레이어를 그대로 쓴다(장애물이 나무/벤치/건물 스케일의 배치 오브젝트와
// 개념적으로 동일 — 새 레이어를 발명하지 않는다, character만 신규 레이어가
// 필요한 이유는 캐릭터가 이동하는 유일한 엔티티라 그 자체의 안정적 id로
// tie-break해야 하기 때문).
export const OBSTACLE_LAYER = 'objects'
// 이 프로토타입에 캐릭터가 항상 1명뿐이라 고정 id로 충분(팀장 지시 — 안정적
// tieBreak 요구사항).
export const CHARACTER_ID = 'proto-character'

/**
 * 캐릭터의 Y-기반 시각 스케일 — worldContract.depthScale(y)를 그대로
 * 재사용한다(새 스케일 밴드 없음). 반환 범위는 depthScale과 동일하게
 * [0.55, 1.20].
 * @param {number} y — world y(0~100), 캐릭터의 topPct(발 앵커 좌표).
 * @returns {number}
 */
export function characterScale(y) {
  return depthScale(y)
}

/**
 * 캐릭터의 depth 정렬 키 — depthOrder.depthKey에 위임(재구현 없음).
 * @param {number} y
 * @returns {number}
 */
export function characterDepthKey(y) {
  return depthKey({ id: CHARACTER_ID, layer: CHARACTER_LAYER, y })
}

/**
 * 캐릭터의 CSS z-index — depthOrder.cssZIndex에 위임(재구현 없음).
 * @param {number} y
 * @returns {number}
 */
export function characterZIndex(y) {
  return cssZIndex({ id: CHARACTER_ID, layer: CHARACTER_LAYER, y })
}

/**
 * 장애물 하나의 depth 정렬 키 — 장애물의 지면 접점(바운딩 박스 하단 y1)을
 * depth y로 쓴다(worldRender.js landmarkBox/worldZIndex가 랜드마크의
 * bottom-center y를 depth 기준으로 쓰는 것과 동일 정신 — bottom edge가
 * "땅에 닿는 지점"이라는 2.5D Y-sort 관례).
 * @param {string} id
 * @param {number} y1 — 장애물 바운딩 박스의 y1(하단, walkGrid.js OBSTACLES 좌표).
 * @returns {number}
 */
export function obstacleDepthKey(id, y1) {
  return depthKey({ id, layer: OBSTACLE_LAYER, y: y1 })
}

/**
 * 장애물 하나의 CSS z-index — depthOrder.cssZIndex에 위임(재구현 없음).
 * @param {string} id
 * @param {number} y1
 * @returns {number}
 */
export function obstacleZIndex(id, y1) {
  return cssZIndex({ id, layer: OBSTACLE_LAYER, y: y1 })
}
