// 2026-10-10(244차) 빠른 이동 대상 / 현재 구역. 순수.
import { ZONES, PLACES } from './worldMap.js'

/** zone id(ready) 또는 place id -> {x,y,zoneId}. 준비 중 구역/모르는 id는 null. */
export function travelTarget(id) {
  const z = ZONES.find((q) => q.id === id)
  if (z) return z.status === 'ready' && z.entrance ? { x: z.entrance.x, y: z.entrance.y, zoneId: z.id } : null
  const p = PLACES.find((q) => q.id === id)
  return p ? { x: p.entrance.x, y: p.entrance.y, zoneId: p.zone } : null
}

/** 좌표가 속한 구역 id(경계는 위/왼쪽 구역 우선이 아니라 먼저 매칭되는 구역). 월드 밖은 null. */
export function zoneAt(pos) {
  const z = ZONES.find(({ rect: r }) => pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h)
  return z ? z.id : null
}
