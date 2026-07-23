// src/utils/writingAnswerStatsApi.js
//
// "선생님이 같은 검토를 두 번 하지 않는" 자동 학습 시스템(2026-07-24) —
// writing_answer_statistics 조회/액션 레이어. 이 테이블/RPC는 다른 세션이
// 준비 중인 supabase_v3_9_*.sql이 실행돼야 존재한다(헌법 규칙 8 — 에이전트는
// DDL을 직접 실행할 수 없음). 그 전까지:
//   - 조회(fetchLearningRecommendations/fetchLearningRateMetrics)는 에러를
//     삼키고 null(또는 "수집 중" 표시용 null 카운트)로 폴백 — 콘솔 에러 없이
//     "SQL 실행 필요" 안내로만 이어진다(헌법 규칙 9).
//   - 쓰기(registerRecommendation/dismissRecommendation)는 애초에 테이블이
//     없으면 "AI 추천 학습" 카드 자체가 렌더링되지 않으므로(추천 목록이
//     null) 호출될 일이 없다 — 그래도 방어적으로 에러는 throw해 호출부가
//     alert로 안내한다(§ 인정 액션은 조용히 실패하면 안 됨).
//
// 학생 식별은 이 파일 어디서도 하지 않는다(테이블 자체가 학생별이 아니라
// 답안 패턴별 집계 — distinct_student_ids는 UUID 배열 그대로 통과시킬 뿐
// 이름으로 매칭하지 않는다, 헌법 규칙 4).
import { supabase } from './supabaseClient'
import { setWordAcceptedMeanings } from './wordLibrary'
import { planAccept, buildAcceptedVariantRecord } from './spellingReviewBulkPlan'

let _warned = false
function warnOnce(err) {
  if (_warned) return
  _warned = true
  console.warn('[writingAnswerStats] writing_answer_statistics 접근 실패 — supabase_v3_9_*.sql이 아직 실행 안 됐을 수 있음(패널이 "SQL 실행 필요" 안내로 폴백):', err?.message || err)
}

// 42P01 = undefined_table(Postgres), PGRST205 = PostgREST 스키마 캐시에
// 테이블 없음 — 둘 다 "아직 마이그레이션 미실행"과 동일하게 취급한다.
function isMissingRelationError(err) {
  const code = err?.code
  return code === '42P01' || code === 'PGRST205' || /schema cache|does not exist|relation .* does not exist/i.test(err?.message || '')
}

// ── 조회 ────────────────────────────────────────────────────────────────

// 관리자 "AI 추천 학습" 카드용 — 반복 제출된(count>=minCount) 대기(pending)
// 답안 패턴을 count 내림차순 Top N(기본 50)으로 반환. 새벽 배치 없이 라이브
// 쿼리로 즉시 반영(요구사항 6, 무료 우선 — 배치 인프라 불필요).
// words embed로 단어 원문/등록 뜻/현재 인정 목록까지 한 번에 가져온다.
// 반환하는 각 row는 spellingReviewBulkPlan.planAccept()가 기대하는 필드
// (id/wordId/acceptedMeanings/submittedAnswer)를 그대로 포함해, 인정 시
// registerRecommendation()이 기존 로직을 재사용할 수 있게 한다.
export async function fetchLearningRecommendations({ minCount = 3, limit = 50 } = {}) {
  try {
    const { data, error } = await supabase
      .from('writing_answer_statistics')
      .select('id,word_id,registered_meaning,student_answer,normalized_answer,count,accepted_count,rejected_count,distinct_student_ids,first_seen,last_seen,last_decision,last_confidence,status,status_changed_at,words(word,meaning,accepted_meanings)')
      .eq('status', 'pending')
      .gte('count', minCount)
      .order('count', { ascending: false })
      .limit(limit)
    if (error) {
      if (!isMissingRelationError(error)) warnOnce(error)
      return null
    }
    return (data || []).map((r) => ({
      id: r.id,
      wordId: r.word_id,
      // planAccept/buildAcceptedVariantRecord 재사용을 위한 호환 필드명
      submittedAnswer: r.student_answer,
      acceptedMeanings: Array.isArray(r.words?.accepted_meanings) ? r.words.accepted_meanings : [],
      meaning: r.registered_meaning || r.words?.meaning || '',
      // 표시/정렬용 추가 필드
      normalizedAnswer: r.normalized_answer,
      count: r.count,
      acceptedCount: r.accepted_count,
      rejectedCount: r.rejected_count,
      distinctStudentCount: Array.isArray(r.distinct_student_ids) ? r.distinct_student_ids.length : 0,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      lastDecision: r.last_decision,
      lastConfidence: typeof r.last_confidence === 'number' ? r.last_confidence : null,
      status: r.status,
      word: r.words?.word || '(삭제된 단어)',
    }))
  } catch (err) {
    if (!isMissingRelationError(err)) warnOnce(err)
    return null
  }
}

// ── 액션 ────────────────────────────────────────────────────────────────

// 원클릭 학습(요구사항 3) — 세 단계 순차 실행, ①이 실패하면 ②③은 절대
// 진행하지 않는다(부분 상태 방지). ①은 기존 "이 답 인정" 경로와 동일하게
// planAccept(spellingReviewBulkPlan.js, dedupe 로직 재사용)로 병합 목록을
// 계산해 setWordAcceptedMeanings로 저장 — 이 저장이 곧 기능적으로 유일하게
// 중요한 부분(단어 매칭에 실제로 쓰이는 원본, § spellingReviewAiApi.js와
// 동일 원칙). ②는 감사 이력(word_accepted_variants, v3_7 SQL 미실행이어도
// 무방 — best-effort)이고 ③은 이 통계 행 자체의 상태 갱신이다.
export async function registerRecommendation(row) {
  const plan = planAccept(row, { mode: 'answer_only' })
  // ① 실패하면 여기서 throw되어 함수가 즉시 종료 — ②③ 절대 실행 안 됨.
  await setWordAcceptedMeanings(plan.wordId, plan.mergedAcceptedMeanings)

  // ② 감사 이력 — created_by='stats_learning'으로 이 인정이 "AI 추천 학습"
  // 카드 경로에서 왔음을 남긴다(테이블에 별도 source 컬럼은 없음 — created_by가
  // 실질적인 출처 라벨, supabase_v3_7_word_accepted_variants.sql 참고).
  // v3_7 SQL 미실행/insert 실패는 조용히 무시(감사 기록은 최적화일 뿐).
  try {
    const record = buildAcceptedVariantRecord(row, { createdBy: 'stats_learning' })
    await supabase.from('word_accepted_variants').insert(record)
  } catch { /* 감사 이력 저장 실패 — 인정 자체는 이미 완료됐으므로 무시 */ }

  // ③ 통계 행 상태 갱신 — 실패하면 throw(호출부 alert). ①②는 이미 반영됐으니
  // 부분 상태가 남을 수 있지만(카드에서 재시도하면 ①은 중복 인정이라 무해,
  // ②는 (word_id, accepted_answer) 유니크 인덱스로 중복 무해), ③ 실패를
  // 숨기면 같은 항목이 계속 "대기"로 남아 관리자가 매번 다시 볼 수 있어
  // 정직하게 알린다.
  const { error } = await supabase
    .from('writing_answer_statistics')
    .update({ status: 'accepted', status_changed_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) throw error
}

export async function dismissRecommendation(id) {
  const { error } = await supabase
    .from('writing_answer_statistics')
    .update({ status: 'dismissed', status_changed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── 주간 학습률(요구사항 8) ─────────────────────────────────────────────
//
// Asia/Seoul 기준 월요일 00:00 시작 주. 서버 타임존 설정과 무관하게 항상
// 같은 결과가 나오도록 UTC+9 고정 오프셋으로 직접 계산한다(한국은 DST
// 없음 — 이 저장소 다른 곳의 getSeoulDateString과 동일한 전제).
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

function seoulShiftedNow() {
  // 반환값의 UTC 게터(getUTCFullYear 등)를 읽으면 "서울 벽시계 기준" 값이
  // 나오는 트릭 — 실제 유효한 timestamptz 경계를 만들 때는 다시
  // SEOUL_OFFSET_MS를 빼서 진짜 UTC 순간으로 되돌린다.
  return new Date(Date.now() + SEOUL_OFFSET_MS)
}

// weeksAgo=0 → 이번 주 월요일 00:00(서울 기준)의 실제 UTC Date, weeksAgo=1
// → 지난 주 월요일 00:00.
function seoulMondayBoundary(weeksAgo = 0) {
  const shifted = seoulShiftedNow()
  const day = shifted.getUTCDay() // 0=일 ~ 6=토(서울 벽시계 기준)
  const diffToMonday = day === 0 ? 6 : day - 1
  const mondayShifted = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(),
    shifted.getUTCDate() - diffToMonday - weeksAgo * 7,
  ))
  return new Date(mondayShifted.getTime() - SEOUL_OFFSET_MS)
}

// count-only 쿼리(head:true — 행 데이터는 안 받아옴). 테이블 없음/기타
// 오류는 null(= "수집 중" 표시)로, 정상 0건은 실제 숫자 0으로 구분해
// 반환한다(요구사항 8 — 지어내지 않기).
async function countRows(table, applyFilter) {
  try {
    let q = supabase.from(table).select('*', { count: 'exact', head: true })
    q = applyFilter(q)
    const { count, error } = await q
    if (error) {
      if (!isMissingRelationError(error)) warnOnce(error)
      return null
    }
    return typeof count === 'number' ? count : 0
  } catch (err) {
    if (!isMissingRelationError(err)) warnOnce(err)
    return null
  }
}

// 이번 주 / 지난 주 — 자동 등록(writing_answer_statistics.status='accepted'
// 로 바뀐 수, status_changed_at 기준) + 동의어 증가(word_accepted_variants
// created_at 기준, v3_7 anon select 가능). 각 카운트는 number(0 포함) 또는
// null("데이터 수집 중" — 테이블 미실행/조회 실패)이다.
export async function fetchLearningRateMetrics() {
  const thisWeekStartIso = seoulMondayBoundary(0).toISOString()
  const lastWeekStartIso = seoulMondayBoundary(1).toISOString()
  const lastWeekEndIso = thisWeekStartIso

  const [thisAccepted, lastAccepted, thisSynonym, lastSynonym] = await Promise.all([
    countRows('writing_answer_statistics', (q) => q.eq('status', 'accepted').gte('status_changed_at', thisWeekStartIso)),
    countRows('writing_answer_statistics', (q) => q.eq('status', 'accepted').gte('status_changed_at', lastWeekStartIso).lt('status_changed_at', lastWeekEndIso)),
    countRows('word_accepted_variants', (q) => q.gte('created_at', thisWeekStartIso)),
    countRows('word_accepted_variants', (q) => q.gte('created_at', lastWeekStartIso).lt('created_at', lastWeekEndIso)),
  ])

  return {
    thisWeek: { autoAcceptedCount: thisAccepted, synonymCount: thisSynonym },
    lastWeek: { autoAcceptedCount: lastAccepted, synonymCount: lastSynonym },
  }
}

// ── 오늘 AI 절약 카운터(요구사항 7) ────────────────────────────────────────
//
// per-browser(이 브라우저의 localStorage) 집계일 뿐이다 — 정직한 한계:
//   - 다른 관리자/다른 기기에서 실행한 미리보기의 절약분은 이 카드에
//     전혀 반영되지 않는다(그 브라우저의 localStorage에만 쌓임).
//   - 브라우저 데이터를 지우면(시크릿 모드 종료 등) 그 세션의 누적값도
//     함께 사라진다.
//   - 진짜 전역/영구 집계가 필요하면 서버 측 ai_usage_daily(등)를 봐야
//     한다 — 이 카드는 "지금 이 화면에서 대략 얼마나 아꼈는지" 참고용
//     표시일 뿐, 과금/감사 근거로 쓰면 안 된다.
const SAVINGS_KEY_PREFIX = 'voca_writing_ai_savings_'

function seoulDateStr() {
  const shifted = seoulShiftedNow()
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function emptySavings() {
  return { rules: 0, cache: 0, variants: 0, statsSkips: 0, ai: 0 }
}

function readSavingsRaw() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVINGS_KEY_PREFIX + seoulDateStr()) || 'null')
    if (raw && typeof raw === 'object') {
      return {
        rules: Number(raw.rules) || 0,
        cache: Number(raw.cache) || 0,
        variants: Number(raw.variants) || 0,
        statsSkips: Number(raw.statsSkips) || 0,
        ai: Number(raw.ai) || 0,
      }
    }
  } catch { /* localStorage 불가 환경/파싱 실패 — 아래 기본값으로 폴백 */ }
  return emptySavings()
}

/**
 * 미리보기(규칙 단계) 또는 AI 확인 실행 1회가 끝날 때마다 호출 — 오늘
 * (Asia/Seoul 기준) 누적 카운터에 이번 실행분을 더한다. runSummary의 각
 * 필드는 이번 실행 "1회분" 건수만 담아서 넘기면 된다(누적은 이 함수가
 * 담당):
 *   - rules: 규칙 기반(정확 일치/레벤슈타인 등)으로 해결된 건수
 *   - cache: AI 호출 없이 캐시로 해결된 건수
 *   - variants: 동의어 규칙(synonym)으로 해결된 건수
 *   - statsSkips: 서버가 writing_answer_statistics 근거로 AI 호출을
 *     건너뛴 건수(Edge Function 응답 summary.statsSkips)
 *   - ai: 실제로 AI를 호출해 처리한 건수
 *
 * per-browser 집계 한계는 이 섹션 상단 주석 참고.
 */
export function accumulateSavingsCounters(runSummary = {}) {
  const current = readSavingsRaw()
  const next = {
    rules: current.rules + (Number(runSummary.rules) || 0),
    cache: current.cache + (Number(runSummary.cache) || 0),
    variants: current.variants + (Number(runSummary.variants) || 0),
    statsSkips: current.statsSkips + (Number(runSummary.statsSkips) || 0),
    ai: current.ai + (Number(runSummary.ai) || 0),
  }
  try { localStorage.setItem(SAVINGS_KEY_PREFIX + seoulDateStr(), JSON.stringify(next)) } catch { /* localStorage 불가 환경 — 조용히 무시 */ }
  return next
}

// 오늘(Asia/Seoul) 누적 절약 카운터 읽기 전용 — 위 정직한 한계 동일 적용.
export function readTodaySavings() {
  return readSavingsRaw()
}
