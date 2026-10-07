// 2026-10-08(225차) 시범 Unit 목록(QA 전용). 새 Unit은 여기에만 추가한다 — 화면(UnitScreen)·App은 목록을 그대로 쓴다
import { UNIT_BORROW } from './unitBorrow.js'
import { UNIT_LOST_BAG } from './unitLostBag.js'
export const UNITS = [UNIT_BORROW, UNIT_LOST_BAG]
export const unitById = (id) => UNITS.find((u) => u.id === id) || null
