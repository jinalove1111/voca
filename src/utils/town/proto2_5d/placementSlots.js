// src/utils/town/proto2_5d/placementSlots.js — Paul Town 2.5D 프로토타입
// Phase C(2026-09-28, 구매한 아이템 1회 배치) 고정 배치 슬롯 + 배치물
// 장애물 파생 순수 헬퍼.
//
// 자유 배치가 아니라 미리 검증된 고정 슬롯 목록만 쓴다(운영자 승인 범위).
// 순수 데이터/함수 — React/DOM 없음. townAsset()은 import하지 않는다
// (shopInteraction.js 헤더 주석과 동일 이유 — walkGrid.js 번들 그래프에
// .webp 자산을 섞지 않는다). 배치 상태 자체는 Proto25DScreen.jsx의 로컬
// state(새로고침하면 리셋)이며 이 파일은 저장/네트워크를 전혀 하지 않는다.
import { OBSTACLES } from './walkGrid'
import { footprintRect } from './sceneFixture'

// anchor = bottom-center(world-%), 벤치(demo-bench)와 같은 7x5 발자국.
// 각 슬롯이 기존 장애물/스폰/가게 입구/벤치 도착점/경로를 막지 않는지는
// scripts/testProto25dPlacedObstacles.mjs가 실제 격자로 검증한다.
export const PLACEMENT_SLOTS = Object.freeze([
  Object.freeze({ id: 'A', anchor: Object.freeze({ x: 30, y: 50 }), widthPct: 7, footprintDepthPct: 5 }),
  Object.freeze({ id: 'B', anchor: Object.freeze({ x: 72, y: 46 }), widthPct: 7, footprintDepthPct: 5 }),
  Object.freeze({ id: 'C', anchor: Object.freeze({ x: 50, y: 80 }), widthPct: 7, footprintDepthPct: 5 }),
])

/** 슬롯 1개의 장애물 사각형({id,x0,x1,y0,y1}, id='placed-<slotId>'). */
export function placedObstacleRect(slot) {
  return Object.freeze({ id: `placed-${slot.id}`, ...footprintRect(slot.anchor, slot.widthPct, slot.footprintDepthPct) })
}

/**
 * 정적 OBSTACLES + 배치물 사각형. placements: [{itemId, slotId}] — 알 수
 * 없는 slotId는 조용히 무시한다.
 */
export function obstaclesWithPlacements(placements) {
  if (!Array.isArray(placements) || placements.length === 0) return OBSTACLES
  const rects = []
  for (const pl of placements) {
    const slot = PLACEMENT_SLOTS.find((s) => s.id === pl?.slotId)
    if (slot) rects.push(placedObstacleRect(slot))
  }
  return [...OBSTACLES, ...rects]
}
