// 2026-10-08(225차) 시범 Unit 목록(QA 전용). 새 Unit은 여기에만 추가한다 — 화면(UnitScreen)·App은 목록을 그대로 쓴다
import { UNIT_BORROW } from './unitBorrow.js'
import { UNIT_LOST_BAG } from './unitLostBag.js'
import { UNIT_FIND_AGAIN } from './unitFindAgain.js'
// 227차: C2(발전) — C1 Unit 2와 같은 목표·상황 가족, 인접 단계 수행 차이 검증용
export const UNITS = [UNIT_BORROW, UNIT_LOST_BAG, UNIT_FIND_AGAIN]
export const unitById = (id) => UNITS.find((u) => u.id === id) || null
