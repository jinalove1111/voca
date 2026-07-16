// 입실 단어시험 — Supabase 접근 레이어. 순수 로직(entranceTest.js)과 완전히
// 분리돼 있고, 이 파일만 DB를 안다.
//
// 핵심 안전 원칙 (supabase_v1_8_entrance_test.sql이 아직 실행 안 된 상태로
// 이 코드가 먼저 배포돼도 앱이 절대 깨지지 않아야 함 — refreshClassSettings/
// daily_assignments의 기존 폴백 패턴과 동일):
//   - 조회 계열은 에러(테이블 없음 포함)를 절대 던지지 않고 null/빈 배열로
//     폴백 — 학생 배너는 자동으로 숨겨지고, 콘솔에는 warn 1회만 남김.
//   - 쓰기 계열(시험 생성/종료/결과 제출)은 에러를 그대로 던짐 — 호출부
//     (관리자 패널 alert, 학생 결과 화면의 재시도 버튼)가 사용자에게 보여줌.
//   - 실시간성은 폴링으로 구현(수 초 간격, 호출부가 화면이 보일 때만 돌림).
//     Supabase Realtime은 대시보드에서 테이블별 publication 활성화가 필요해
//     "운영자 부재 중 코드만 먼저 배포" 제약과 충돌하므로 쓰지 않는다 —
//     50명 동시 응시 기준으로도 5초 폴링(초당 10요청 수준)은 문제 없음.
import { supabase } from './supabaseClient'
import { localIsoDateStr } from './wordLibrary'

// 테이블 존재 여부 캐시 — 최초 1회만 실제로 확인하고, 없으면 그 세션 동안
// 재확인하지 않는다(불필요한 에러 요청 반복 방지). 페이지 새로고침(운영자가
// SQL 실행 후) 시 자연스럽게 다시 확인됨.
let _available = null
let _warned = false

function warnOnce(err) {
  if (_warned) return
  _warned = true
  console.warn('[entranceTest] 조회 실패 — supabase_v1_8_entrance_test.sql이 아직 실행 안 됐을 수 있음(기능 자동 숨김, 앱 동작에는 영향 없음):', err?.message || err)
}

export async function checkEntranceTestAvailable() {
  if (_available !== null) return _available
  const { error } = await supabase.from('entrance_tests').select('id').limit(1)
  if (error) warnOnce(error)
  _available = !error
  return _available
}

// DB 행 -> 앱에서 쓰는 camelCase 시험 객체
function mapTest(row) {
  if (!row) return null
  return {
    id: row.id,
    classId: row.class_id,
    date: row.date,
    status: row.status,
    direction: row.direction,
    questionCount: row.question_count,
    timeLimitSeconds: row.time_limit_seconds,
    words: Array.isArray(row.words) ? row.words : [],
    createdAt: row.created_at,
  }
}

function mapResult(row) {
  if (!row) return null
  return {
    id: row.id,
    testId: row.test_id,
    studentId: row.student_id,
    score: row.score,
    total: row.total,
    missedWords: Array.isArray(row.missed_words) ? row.missed_words : [],
    durationSeconds: row.duration_seconds,
    submittedAt: row.submitted_at,
  }
}

// 오늘 이 반의 시험 전부(active + closed) — 학생 배너("시험 있어요!" 또는
// "오늘의 랭킹 보기")와 랭킹 화면("오늘만 표시, 다음날 자동 리셋"은 date
// 컬럼 조회 조건 그 자체로 구현됨)이 쓴다. 에러 -> 빈 배열(기능 숨김).
export async function fetchTodayTests(classId) {
  if (!classId) return []
  if (_available === false) return []
  const { data, error } = await supabase
    .from('entrance_tests')
    .select('*')
    .eq('class_id', classId)
    .eq('date', localIsoDateStr())
    .order('created_at', { ascending: true })
  if (error) { warnOnce(error); _available = false; return [] }
  _available = true
  return (data || []).map(mapTest)
}

export const findActiveTest = (tests) => (tests || []).find((t) => t.status === 'active') || null

// 시험 생성(교사 "시험 시작") — 같은 반의 오늘자 기존 active 시험은 먼저
// 전부 닫는다(반당 동시에 하나만 진행, 학생 쪽 분기 단순화). words는
// [{word, meaning}] 스냅샷 — 생성 이후 단어/유닛이 바뀌어도 응시자 전원이
// 같은 문제 풀을 받는다. 에러는 던짐(관리자 alert).
export async function createEntranceTest(classId, { direction, questionCount, timeLimitSeconds, words }) {
  const today = localIsoDateStr()
  const { error: closeErr } = await supabase
    .from('entrance_tests')
    .update({ status: 'closed' })
    .eq('class_id', classId)
    .eq('date', today)
    .eq('status', 'active')
  if (closeErr) throw closeErr
  const { data, error } = await supabase
    .from('entrance_tests')
    .insert({
      class_id: classId,
      date: today,
      status: 'active',
      direction,
      question_count: questionCount,
      time_limit_seconds: timeLimitSeconds,
      words: (words || []).map((w) => ({ word: w.word, meaning: w.meaning })),
    })
    .select()
    .single()
  if (error) throw error
  return mapTest(data)
}

export async function closeEntranceTest(testId) {
  const { error } = await supabase.from('entrance_tests').update({ status: 'closed' }).eq('id', testId)
  if (error) throw error
}

// 결과 제출 — 반드시 student_id(UUID) 기준(이름 금지). 같은 시험 재제출은
// upsert로 1행 유지(unique(test_id, student_id)). 에러는 던짐 — 학생 결과
// 화면이 "저장 재시도" 버튼을 보여준다(점수 자체는 로컬 state에 이미 있어
// 학생이 결과를 못 보는 일은 없음).
export async function submitEntranceResult(testId, studentId, { score, total, missedWords, durationSeconds }) {
  if (!testId || !studentId) throw new Error('testId/studentId 누락')
  const { error } = await supabase.from('entrance_test_results').upsert({
    test_id: testId,
    student_id: studentId,
    score,
    total,
    missed_words: missedWords || [],
    duration_seconds: durationSeconds ?? null,
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'test_id,student_id' })
  if (error) throw error
}

// 특정 시험들의 결과 전부 — 랭킹/교사 결과 페이지 폴링용. 에러 -> 빈 배열.
export async function fetchResultsForTests(testIds) {
  const ids = (testIds || []).filter(Boolean)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('entrance_test_results')
    .select('*')
    .in('test_id', ids)
  if (error) { warnOnce(error); return [] }
  return (data || []).map(mapResult)
}

// 이 학생이 이 시험을 이미 응시했는지 — 에러/없음 -> null.
export async function fetchOwnResult(testId, studentId) {
  if (!testId || !studentId) return null
  const { data, error } = await supabase
    .from('entrance_test_results')
    .select('*')
    .eq('test_id', testId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) { warnOnce(error); return null }
  return mapResult(data)
}
