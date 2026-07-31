// src/learning/memory/storage/reviewDataBackend.js — review_data 컬럼용
// 저장/복원 IO(로컬스토리지 미러 + Supabase 자가치유 병합). 지금은 어떤
// 화면/훅도 이 파일을 호출하지 않는다("called by nothing") — 실제 연결은
// 이 파일 상단 "플래그온 전제조건"이 해결된 뒤, 다른 워크스트림이
// wordLibrary.js/useStudent.js에서 명시적으로 배선해야 한다.
//
// import는 형제 순수 모듈(reviewDataCodec.js, 명시적 .js 확장자)만 —
// supabaseClient.js를 여기서 직접 import하지 않는다. 이유: supabaseClient.js
// 는 모듈 스코프에서 즉시 createClient(import.meta.env.VITE_*)를 실행하는데,
// plain Node(하네스)에서 그 값이 없으면 import 시점에 그대로 크래시한다
// (직접 실측 확인). 그래서 client는 항상 호출부가 주입한다(deps.client) —
// 프로덕션에서는 나중에 배선하는 쪽이 `{ client: supabase }`(실제
// supabaseClient.js의 supabase 싱글턴)를 넘기면 되고, 이 설계 덕분에
// 하네스는 가짜 client 객체만으로 전체 로직(merge/fail-open)을 안전하게
// 실행/검증할 수 있다.
//
// ── 플래그온 전제조건(이 파일을 실제로 켜기 전에 반드시 필요) ────────────
// reviewDataCodec.js 헤더의 "알려진 클로버" 노트 참고: wordLibrary.js:1697
// (syncStudentProgress)이 review_data 컬럼을 { spellingWrongToday } 하나로
// 통째로 덮어쓰므로, 이 백엔드가 저장한 memoryEngine 서브키가 다음 진행도
// 동기화 때 사라진다. 다른 워크스트림 소유 파일이라 여기서 고치지 않는다
// (CLAUDE.md 규칙 16) — 실제 배선 전에 그 1줄을
// `encodeReviewData(existingReviewData, state)` 기반 read-merge-write로
// 바꾸는 작업이 선행돼야 한다. 이 사실은
// .ai-status/memory-engine-2026-08-01.json의 next_action에도 기록한다.
//
// ── 향후 신규 테이블 대안(SQL 미작성, 설계 참고용) ────────────────────────
// docs/research/memory-engine.md §7.2가 스케치하는 `word_review_schedule`
// 전용 테이블(student_id/word_id UUID FK, box_level, next_review_date 등)
// 로 백엔드를 교체할 수도 있다 — 그 경우 이 파일의 load/save 시그니처는
// 그대로 두고 내부 구현만 그 테이블을 쓰도록 바꾸면 된다(호출부 영향 0).
// CLAUDE.md 규칙 8(에이전트는 DDL 직접 실행 불가)에 따라 그 테이블의 SQL
// 파일은 이번 작업 범위에서 의도적으로 작성하지 않는다.
import { decodeReviewData, encodeReviewData, emptyState, mergeStates } from './reviewDataCodec.js'

const LOCAL_KEY_PREFIX = 'paulvoca_memory_v1_'
const NOT_READY_CODES = new Set(['42703', '42P01', 'PGRST204', 'PGRST205']) // 컬럼/테이블 부재 등 — wordLibrary.js/seasonApi.js와 동일 관례

function localKey(studentId) {
  return `${LOCAL_KEY_PREFIX}${studentId}`
}

function defaultStorage() {
  // 브라우저 환경이 아니면(Node 하네스 등) null — load/save가 이를 감지해
  // 로컬 단계를 조용히 건너뛴다(절대 throw하지 않는다).
  return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null
}

function readLocalRaw(storage, studentId) {
  if (!storage) return null
  try {
    const raw = storage.getItem(localKey(studentId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null // 파싱 실패도 "로컬 없음"과 동일하게 취급 — 절대 throw 안 함
  }
}

function writeLocalRaw(storage, studentId, rawObj) {
  if (!storage) return
  try {
    storage.setItem(localKey(studentId), JSON.stringify(rawObj))
  } catch {
    /* 저장 실패(용량 초과 등)도 조용히 무시 — 학습 흐름을 막지 않는다 */
  }
}

// load(studentId, deps={ client, storage }) → State(reviewDataCodec.js
// emptyState() shape). deps.client 없으면 로컬만으로 반환(클라우드 스킵).
// select 실패(테이블/컬럼 부재 포함) 또는 행 없음은 전부 "클라우드 없음"
// 으로 취급 — 절대 throw하지 않는다(호출부는 항상 유효한 State를 받는다).
export async function load(studentId, deps = {}) {
  if (!studentId) return emptyState()
  const storage = deps.storage ?? defaultStorage()
  const localState = decodeReviewData(readLocalRaw(storage, studentId))

  const client = deps.client ?? null
  if (!client) return localState

  let cloudState = null
  try {
    const { data, error } = await client.from('student_progress').select('review_data').eq('student_id', studentId).maybeSingle()
    if (!error && data && data.review_data) cloudState = decodeReviewData(data.review_data)
    else if (error && !NOT_READY_CODES.has(error.code)) {
      // 예상 밖 에러도 "클라우드 없음" 취급 — 학습 흐름을 절대 막지 않는다
      cloudState = null
    }
  } catch {
    cloudState = null // 네트워크 등 실패 — 로컬만으로 계속 진행
  }

  return cloudState ? mergeStates(localState, cloudState) : localState
}

// save(studentId, state, nowIso, deps={ client, storage }) — 1) 로컬스토리지
// 먼저 동기 반영(항상 성공적으로 시도), 2) client가 있으면 fire-and-forget
// 으로 기존 행이 있을 때만 UPDATE(행 없으면 클라우드는 조용히 스킵 — 새
// 행을 만들지 않는다, "다른 동기화 경로가 아직 그 학생 행을 만들기 전"
// 레이스를 피하기 위함). 반환 promise는 테스트에서 await해 완료를 확인할
// 수 있도록 넘겨주되, 실제 호출부는 기다리지 않아도 무방하다(관례는
// trackEvent와 동일 fire-and-forget).
export async function save(studentId, state, nowIso, deps = {}) {
  if (!studentId) return
  const storage = deps.storage ?? defaultStorage()
  const localRaw = readLocalRaw(storage, studentId)
  const nextLocalRaw = encodeReviewData(localRaw, state)
  writeLocalRaw(storage, studentId, nextLocalRaw)

  const client = deps.client ?? null
  if (!client) return undefined

  return (async () => {
    try {
      const { data, error } = await client.from('student_progress').select('review_data').eq('student_id', studentId).maybeSingle()
      if (error || !data) return // 행 없음/조회 실패 → 클라우드 스킵(로컬은 이미 저장됨)
      const nextCloudRaw = encodeReviewData(data.review_data, state)
      await client.from('student_progress').update({ review_data: nextCloudRaw, updated_at: nowIso }).eq('student_id', studentId)
    } catch {
      /* 절대 throw하지 않는다 — 클라우드 실패는 로컬 저장을 무효화하지 않음 */
    }
  })()
}
