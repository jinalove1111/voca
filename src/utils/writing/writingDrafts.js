import { UUID_RE } from '../situation/situationStore.js'

// 2026-10-07(222차) Writing 첫 버전 — 학생이 쓴 문장의 기기 임시 저장(순수 로직 + 주입된 storage).
// 키에는 students.id(UUID)만 쓴다(규칙 4 — 이름 키 금지). 점수·정답·숙달·선생님 확인 같은 판정 값은 저장하지 않는다.
// 선생님에게 자동 전송되지 않는다(DB·업로드 0). 레코드: { [writingItemId]: { first, revised, helped, compared, updatedAt } }
//   first    — 예시를 보기 전 처음 쓴 문장(혼자/도움 보고)      helped   — [도움 보기]를 누른 뒤 썼는지(true/false)
//   revised  — 예시와 비교한 뒤 고친 문장(없으면 '')            compared — 예시와 비교했는지(true/false, 선생님 확인과 다름)
export const draftsKey = (studentId) => (UUID_RE.test(studentId || '') ? `paulEasyVoca_writingDrafts_${studentId}` : null)

export function loadDrafts(storage, studentId) {
  const key = draftsKey(studentId)
  if (!key) return {}
  try {
    const parsed = JSON.parse(storage.getItem(key) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

// 한 문항의 초안을 덮어쓴다(부분 갱신). 잘못된 id·저장 실패는 false(화면은 계속 동작).
export function saveDraft(storage, studentId, writingItemId, patch) {
  const key = draftsKey(studentId)
  if (!key || !writingItemId) return false
  try {
    const all = loadDrafts(storage, studentId)
    const prev = all[writingItemId] || { first: '', revised: '', helped: false, compared: false }
    all[writingItemId] = { ...prev, ...patch, updatedAt: new Date().toISOString() }
    storage.setItem(key, JSON.stringify(all))
    return true
  } catch { return false }
}

// 빈 입력·공백만 있는 입력은 완료로 치지 않는다
export const hasContent = (text) => typeof text === 'string' && text.trim().length > 0

// 비교 표시용 정규화(대소문자·문장부호·공백 차이는 "다르다"로 세지 않는다) — 채점이 아니라 "예시와 같은 문장인지" 표시만
export const sameSentence = (a, b) => norm(a) === norm(b)
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
