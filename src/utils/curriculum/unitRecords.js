import { UUID_RE } from '../situation/situationStore.js'
import { APP_SETTABLE_FLAGS, SUPPORT_AREAS, SUPPORT_STAGES } from './courseModel.js'

// 2026-10-08(224차) Unit 활동 기록 — QA용 기기 임시 저장(순수 로직 + 주입된 storage). 키 = students.id(UUID)만(규칙 4).
// 레코드: { [unitId]: { activities: { [activityId]: { completed, selfChecked, teacherObserved, demonstratedIndependent, reviewNeeded, updatedAt } },
//                      support: { speaking: stageId|null, literacy: stageId|null } } }
// 앱은 completed·selfChecked만 켠다(클릭·녹음·예문 확인으로 점수·숙달·진급을 만들지 않는다). teacherObserved·demonstratedIndependent는
// 교사 확인 수단이 생기기 전까지 항상 false(이 모듈은 쓰기 API를 두지 않는다). 선생님에게 자동 전송되지 않는다.
export const recordsKey = (studentId) => (UUID_RE.test(studentId || '') ? `paulEasyVoca_unitRecords_${studentId}` : null)
const EMPTY_ACT = { completed: false, selfChecked: false, teacherObserved: false, demonstratedIndependent: false, reviewNeeded: false }

export function loadUnitRecords(storage, studentId) {
  const key = recordsKey(studentId)
  if (!key) return {}
  try {
    const parsed = JSON.parse(storage.getItem(key) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

// 활동 플래그 갱신 — 앱이 켤 수 있는 플래그만 받는다(그 외 키는 무시). 실패·잘못된 id는 false
export function markActivity(storage, studentId, unitId, activityId, patch) {
  const key = recordsKey(studentId)
  if (!key || !unitId || !activityId) return false
  const safe = Object.fromEntries(Object.entries(patch || {}).filter(([k, v]) => APP_SETTABLE_FLAGS.includes(k) && typeof v === 'boolean'))
  if (Object.keys(safe).length === 0) return false
  try {
    const all = loadUnitRecords(storage, studentId)
    const unit = all[unitId] || { activities: {}, support: { speaking: null, literacy: null } }
    unit.activities[activityId] = { ...EMPTY_ACT, ...(unit.activities[activityId] || {}), ...safe, updatedAt: new Date().toISOString() }
    all[unitId] = unit
    storage.setItem(key, JSON.stringify(all))
    return true
  } catch { return false }
}

// 영역별 지원 단계(말하기/읽기·쓰기 따로) — 학생이 고른 "오늘 도움 정도"일 뿐 수준 판정이 아니다
export function setSupportStage(storage, studentId, unitId, area, stageId) {
  const key = recordsKey(studentId)
  if (!key || !unitId || !SUPPORT_AREAS.includes(area) || (stageId !== null && !SUPPORT_STAGES.some((s) => s.id === stageId))) return false
  try {
    const all = loadUnitRecords(storage, studentId)
    const unit = all[unitId] || { activities: {}, support: { speaking: null, literacy: null } }
    unit.support = { ...unit.support, [area]: stageId }
    all[unitId] = unit
    storage.setItem(key, JSON.stringify(all))
    return true
  } catch { return false }
}

export const activityState = (records, unitId, activityId) => ({ ...EMPTY_ACT, ...((records[unitId]?.activities || {})[activityId] || {}) })

// 다음에 할 활동 = 아직 completed가 아닌 첫 활동(순서는 Unit의 activities 순서). 전부 끝나면 null
export const nextActivityId = (records, unitId, activityIds) => activityIds.find((id) => !activityState(records, unitId, id).completed) || null
