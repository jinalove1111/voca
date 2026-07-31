// src/learning/memory/storage/reviewDataCodec.js — student_progress.review_data
// jsonb 컬럼의 인코딩/디코딩(schema v1) + 두 상태 병합. import 0(순수) —
// leitner.js와 같은 관례. 실제 읽기/쓰기 IO는 이 파일이 아니라 형제 파일
// reviewDataBackend.js가 한다(이 파일은 그 IO가 호출하는 순수 변환기).
//
// ── 왜 review_data 컬럼을 그대로 재사용하는가(신규 컬럼/마이그레이션 0) ──
// wordLibrary.js:1697(syncStudentProgress)이 이미 review_data 컬럼에
// { spellingWrongToday: [...] } 하나만 쓰고 있다(Writing MVP 시절 잔재).
// 여기 새 memoryEngine 서브키를 "추가"만 하면 CLAUDE.md 규칙 9(마이그레이션
// 순서 무관하게 안 깨짐)/규칙 10(신규 컬럼 GRANT)을 둘 다 자동으로
// 만족한다 — 컬럼 자체가 신규가 아니므로 SQL 파일이 필요 없다.
//
// ── 알려진 클로버(수정하지 않음, 플래그온 전제조건으로만 기록) ────────────
// wordLibrary.js:1697 `progressRow.review_data = { spellingWrongToday: ... }`
// 는 review_data 컬럼 전체를 이 한 줄로 **덮어쓴다**(read-merge-write가
// 아니라 write-only) — syncStudentProgress가 한 번이라도 실행되면 이
// 코덱이 써놓은 memoryEngine 서브키가 통째로 사라진다. wordLibrary.js는
// 다른 워크스트림 소유 파일이라 여기서 고치지 않는다(CLAUDE.md 규칙 16).
// 이 메모리 엔진을 실제로 켜기(flag-on) 전에 반드시 해결해야 할 선행
// 조건: wordLibrary.js:1697을
//   `progressRow.review_data = encodeReviewData(existingReviewData, state)`
// 형태의 read-merge-write 1줄로 바꿔야 한다(이 파일의 encodeReviewData가
// 정확히 그 병합을 하도록 이미 설계돼 있다). 이 사실은
// .ai-status/memory-engine-2026-08-01.json의 next_action에도 기록한다.
//
// ── 스키마 v1 shape ──────────────────────────────────────────────────────
// {
//   spellingWrongToday: [...],   // 레거시 필드, 있는 그대로(verbatim) 보존
//   memoryEngine: {
//     version: 1,
//     updatedAt: <YYYY-MM-DD 문자열 | null>,
//     boxes: { [wordId]: { level, nextReviewAt, lastResult, lastReviewedAt, correctStreak } }
//   }
//   // 그 외 알 수 없는 키는 전부 그대로 보존(encodeReviewData 참고) —
//   // 미래에 다른 워크스트림이 review_data에 새 서브키를 추가해도 이
//   // 코덱이 그걸 조용히 지우지 않는다.
// }

export function emptyState() {
  return { spellingWrongToday: [], memoryEngine: { version: 1, updatedAt: null, boxes: {} } }
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// decodeReviewData(raw) — raw(review_data 컬럼 원본 jsonb, 또는 null/undefined/
// 손상된 값)를 항상 유효한 State로 정규화한다. legacy(구 { spellingWrongToday }
// 만 있던 시절 값)/null/버전 불일치/손상 전부 emptyState() 수준으로 안전하게
// 폴백하되, 알 수 없는 키는 보존한다(read-merge-write 대비).
export function decodeReviewData(raw) {
  if (!isPlainObject(raw)) return emptyState()

  const spellingWrongToday = Array.isArray(raw.spellingWrongToday) ? raw.spellingWrongToday : []
  const me = raw.memoryEngine
  const validMemoryEngine = isPlainObject(me) && me.version === 1 && isPlainObject(me.boxes)

  return {
    ...raw,
    spellingWrongToday,
    memoryEngine: validMemoryEngine
      ? { version: 1, updatedAt: me.updatedAt ?? null, boxes: { ...me.boxes } }
      : emptyState().memoryEngine,
  }
}

// encodeReviewData(existingRaw, state) — read-merge-write: existingRaw(현재
// DB/로컬에 있는 원본 review_data, 알 수 없는 키 포함)를 베이스로 두고
// spellingWrongToday/memoryEngine만 state 값으로 갱신한 새 원본을 돌려준다.
// existingRaw의 다른 키(예: 미래에 다른 기능이 추가한 서브키)는 손대지
// 않고 그대로 남는다 — 위 "클로버" 노트가 지적하는 문제를 바로 이 함수가
// 해결하도록 설계돼 있다(호출부가 이 함수로 교체하는 날 자동 해결).
export function encodeReviewData(existingRaw, state) {
  const base = isPlainObject(existingRaw) ? existingRaw : {}
  const s = isPlainObject(state) ? state : emptyState()
  const me = isPlainObject(s.memoryEngine) ? s.memoryEngine : emptyState().memoryEngine

  return {
    ...base,
    spellingWrongToday: Array.isArray(s.spellingWrongToday)
      ? s.spellingWrongToday
      : (Array.isArray(base.spellingWrongToday) ? base.spellingWrongToday : []),
    memoryEngine: {
      version: 1,
      updatedAt: me.updatedAt ?? base.memoryEngine?.updatedAt ?? null,
      boxes: { ...(me.boxes || {}) },
    },
  }
}

// pickMoreProgressed(entryA, entryB) — 단어 하나의 두 박스 항목 중 "더
// 진전된 쪽" 선택: level이 높은 쪽 우선, 동률이면 lastReviewedAt이 더 최근인
// 쪽(useStudent.js:390-402 병합 원칙 "더 진전된 쪽 우선"과 같은 결).
function pickMoreProgressed(entryA, entryB) {
  if (!entryA) return entryB
  if (!entryB) return entryA
  const levelA = Number(entryA.level) || 0
  const levelB = Number(entryB.level) || 0
  if (levelA !== levelB) return levelA > levelB ? entryA : entryB
  const tA = entryA.lastReviewedAt || ''
  const tB = entryB.lastReviewedAt || ''
  return tB > tA ? entryB : entryA // 동률/판단불가 시 첫 인자(a) 우선
}

// mergeStates(a, b) — 두 State(예: 로컬 미러 vs 클라우드)를 파괴적 축소
// 없이 병합. boxes는 단어별 더-진전된-쪽-우선, spellingWrongToday는
// 합집합(레거시 필드 — 그대로 보존만 하면 되므로 유실 방지가 우선).
export function mergeStates(a, b) {
  const sa = isPlainObject(a) ? a : emptyState()
  const sb = isPlainObject(b) ? b : emptyState()
  const boxesA = sa.memoryEngine?.boxes || {}
  const boxesB = sb.memoryEngine?.boxes || {}

  const boxes = {}
  for (const wordId of new Set([...Object.keys(boxesA), ...Object.keys(boxesB)])) {
    boxes[wordId] = pickMoreProgressed(boxesA[wordId], boxesB[wordId])
  }

  const spellingWrongToday = Array.from(new Set([
    ...(Array.isArray(sa.spellingWrongToday) ? sa.spellingWrongToday : []),
    ...(Array.isArray(sb.spellingWrongToday) ? sb.spellingWrongToday : []),
  ]))

  const updatedAt = [sa.memoryEngine?.updatedAt, sb.memoryEngine?.updatedAt].filter(Boolean).sort().pop() || null

  return { ...sa, ...sb, spellingWrongToday, memoryEngine: { version: 1, updatedAt, boxes } }
}
