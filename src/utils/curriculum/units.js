// 2026-10-08(225차) 시범 Unit 목록(QA 전용) — 공통 템플릿이 Unit 두 개에서 재사용되는지 검증한다. 순수 모듈.
// 실제 학생 배정·교사 배정은 범위 밖(설계안 §12) — 지금은 고정 목록에서 학생이 고른다.
import { UNIT_BORROW } from './unitBorrow.js'

export const UNITS = [UNIT_BORROW]
export const unitById = (id) => UNITS.find((u) => u.id === id) || null
