// 2026-10-04 상황 보고 말하기 — 기기 로컬 연습 기록(순수 로직 + 주입된 storage).
// 키에는 students.id(UUID)만 쓴다(규칙 4 — 이름 키 금지). 오디오/점수/완료·숙달 플래그는 저장하지 않는다.
// 레코드: { [exprId]: { lastPracticedDate: 'YYYY-MM-DD', sessions: [{date, scene, hintLevel, stage: 'recall'|'transfer', selfReport, recorded}] } }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_SESSIONS = 10

export const storeKey = (studentId) => (UUID_RE.test(studentId || '') ? `paulEasyVoca_situationRecall_${studentId}` : null)

export function loadRecords(storage, studentId) {
  const key = storeKey(studentId)
  if (!key) return {}
  try {
    const parsed = JSON.parse(storage.getItem(key) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

// 같은 표현의 세션을 덧붙이고(최근 10개만 유지) 저장한다. 저장 실패/잘못된 id는 false(화면은 계속 동작).
export function saveSession(storage, studentId, exprId, session) {
  const key = storeKey(studentId)
  if (!key || !exprId) return false
  try {
    const records = loadRecords(storage, studentId)
    const prev = Array.isArray(records[exprId]?.sessions) ? records[exprId].sessions : []
    records[exprId] = {
      lastPracticedDate: session.date,
      sessions: [...prev, {
        date: session.date,
        scene: session.scene,
        stage: session.stage === 'transfer' ? 'transfer' : 'recall',
        hintLevel: session.hintLevel,
        selfReport: session.selfReport === 'can' || session.selfReport === 'hard' ? session.selfReport : null,
        recorded: !!session.recorded,
      }].slice(-MAX_SESSIONS),
    }
    storage.setItem(key, JSON.stringify(records))
    return true
  } catch { return false }
}

const dayNumber = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

// 2026-10-04 §6 휴리스틱(연구 도출 값 아님, 파일럿 후 조정): 마지막 연습일로부터 ≥1일이면 복습 대상,
// 마지막 두 번의 자기 보고가 모두 'can'이면 ≥3일. 같은 날은 제외. 오래된 순.
export function dueForReview(records, today) {
  const t = dayNumber(today)
  return Object.entries(records || {})
    .filter(([, r]) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.lastPracticedDate || ''))
    .filter(([, r]) => {
      const gap = t - dayNumber(r.lastPracticedDate)
      // 같은 날 recall+transfer가 한 번씩 쌓여도 3일 규칙이 켜지지 않도록 recall 세션만 본다
      const last2 = (Array.isArray(r.sessions) ? r.sessions : []).filter((s) => s && s.stage === 'recall').slice(-2)
      const steady = last2.length === 2 && last2.every((s) => s.selfReport === 'can')
      return gap >= (steady ? 3 : 1)
    })
    .sort((a, b) => dayNumber(a[1].lastPracticedDate) - dayNumber(b[1].lastPracticedDate))
    .map(([id]) => id)
}
