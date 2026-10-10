// src/utils/town/proto2_5d/missionSpots.js — Paul Town 2.5D 미션 표지판 좌표/판정.
// 순수 데이터 + 함수만(React/DOM/townAsset/storage 없음). 표지판은 장애물이
// 아니다(OBSTACLES 불변): 기존 걷기 경로/벤치/가게/배치 슬롯을 건드리지 않는다.
import { CELL_W_PCT, CELL_H_PCT, nearestWalkablePoint } from './walkGrid'
import { isBenchTap, benchTapPad } from './benchInteraction'

// 벤치(20~27, 58~63) 왼쪽 앞 빈 잔디. 집 별채(x6~20, y28~42), 슬롯 A(26.5~33.5, 45~50),
// 벤치 도착점(≈23.5, 65), 나무/관목과 겹치지 않고, 기존 e2e 탭 지점(스폰 50,62 등)과도 멀다.
export const MISSION_SPOTS = Object.freeze([
  Object.freeze({
    id: 'park',
    labelKo: '공원 미션',
    assetKey: 'props/signpost', // kit/townMission.js MISSION_ART 키
    anchor: Object.freeze({ x: 11, y: 66 }), // bottom-center world-%
    widthPct: 7, // 높이 = 7*256/168 = 10.7% unit ≈ Paul(8% 폭 * 128/96) 키
    minWidthPx: 44,
    naturalAspect: 256 / 168, // kit signpost 168x256
    // Cookie — 표지판 왼쪽 앞의 비상호작용 동반자(무릎~허리 높이 ≈ Paul의 0.45배). 탭/장애물 없음.
    companion: Object.freeze({
      assetKey: 'character/cookie-stand',
      anchor: Object.freeze({ x: 3.8, y: 67.5 }),
      widthPct: 4,
      minWidthPx: 20,
      naturalAspect: 256 / 213, // kit cookie-stand 213x256
    }),
    hitRect: Object.freeze({ x0: 7.5, x1: 14.5, y0: 60, y1: 66 }),
    arrivalRaw: Object.freeze({ x: 17, y: 68 }), // 표지판 오른쪽 앞
  }),
])

// 도착 지점(보정 후) — 정적 OBSTACLES 기준, 모듈 로드 시 1회 계산.
const ARRIVALS = new Map(MISSION_SPOTS.map((s) => [s.id, Object.freeze(nearestWalkablePoint(s.arrivalRaw.x, s.arrivalRaw.y))]))

export const MISSION_NEAR_RADIUS = Object.freeze({ x: 2 * CELL_W_PCT, y: 2 * CELL_H_PCT })

export function missionSpotById(id) {
  return MISSION_SPOTS.find((s) => s.id === id) || null
}

export function missionArrival(spot) {
  return ARRIVALS.get(spot?.id) || null
}

/** (x,y)가 spot 도착 지점 타원 반경 안인지(경계 포함). 비정상 입력은 false. */
export function isNearMissionSpot(spot, x, y) {
  const a = missionArrival(spot)
  if (!a || !Number.isFinite(x) || !Number.isFinite(y)) return false
  return ((x - a.x) / MISSION_NEAR_RADIUS.x) ** 2 + ((y - a.y) / MISSION_NEAR_RADIUS.y) ** 2 <= 1
}

/** 탭(world-%)이 candidates 중 어느 표지판 위인지(44px 하한 패딩). 없으면 null. */
export function findTappedMissionSpot(rawPoint, groundPx, candidates = MISSION_SPOTS) {
  for (const s of candidates) {
    if (isBenchTap(rawPoint, s.hitRect, benchTapPad(s.hitRect, groundPx))) return s
  }
  return null
}
