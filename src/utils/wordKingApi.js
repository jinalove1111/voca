// src/utils/wordKingApi.js — Word King(주간·서버 전용 계산) 클라이언트
// 접근 레이어. entranceTestApi.js와 같은 분리 원칙: 순수 로직
// (src/utils/wordKing.js)과 완전히 분리, 이 파일만 DB/서버 API를 안다.
//
// 읽기(anon SELECT, word_king_history는 anon read-only — RLS 참고)와
// 쓰기(관리자 재인증이 필요한 /api/compute-word-king 트리거) 둘 다 이
// 파일에 있다 — entranceTestApi.js가 조회+제출을 한 파일에 두는 것과
// 같은 관례.
//
// 핵심 안전 원칙(supabase_v2_6_word_king.sql이 아직 실행 안 된 상태로 이
// 코드가 먼저 배포돼도 앱이 절대 깨지지 않아야 함): 조회 계열은 에러
// (테이블 없음 포함)를 절대 던지지 않고 안전한 빈 결과로 폴백 —
// Dashboard.jsx의 "이번 주 챔피언" 텍스트는 그냥 안 보일 뿐.
import { supabase } from './supabaseClient'

// 이 반의 가장 최근 계산된 기간(period)의 전체 학생 점수/순위. 관리자
// 화면(계산 직후 새로고침해도 결과를 다시 볼 수 있게)과 학생 화면(챔피언
// 텍스트) 둘 다 이 함수 하나를 공유한다 — 같은 데이터를 두 화면이 각자
// 다시 계산하지 않는다(weeklyReport.js computeStudentStats와 같은 "공용
// 파생 함수" 원칙).
export async function fetchLatestWordKingPeriod(classId) {
  const empty = { periodStart: null, periodEnd: null, scores: [] }
  if (!classId) return empty
  const { data: latest, error: latestErr } = await supabase
    .from('word_king_history')
    .select('period_start, period_end')
    .eq('class_id', classId)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr || !latest) return empty

  const { data, error } = await supabase
    .from('word_king_history')
    .select('student_id, student_name, score, rank_position, score_breakdown')
    .eq('class_id', classId)
    .eq('period_start', latest.period_start)
    .eq('period_end', latest.period_end)
    .order('rank_position', { ascending: true })
  if (error) return { periodStart: latest.period_start, periodEnd: latest.period_end, scores: [] }

  return {
    periodStart: latest.period_start,
    periodEnd: latest.period_end,
    scores: (data || []).map((r) => ({
      studentId: r.student_id,
      studentName: r.student_name,
      score: Number(r.score),
      rank: r.rank_position,
      breakdown: r.score_breakdown,
    })),
  }
}

// 가장 최근 계산된 챔피언(rank===1) 1명만 — 학생 화면(Dashboard.jsx)의
// 최소 텍스트 표시 전용. 위 fetchLatestWordKingPeriod를 그대로 재사용
// (새 쿼리 발명 없음).
export async function fetchWeeklyChampion(classId) {
  const { scores } = await fetchLatestWordKingPeriod(classId)
  return scores.find((s) => s.rank === 1) || null
}

// 관리자 "이번 주 Word King 계산" 버튼 — 실제 쓰기는 서버(service_role,
// api/compute-word-king.js)가 전부 수행. 에러는 던짐(관리자 alert가 이미
// StudentManagement 등 다른 관리자 액션과 같은 방식으로 처리).
export async function triggerComputeWordKing({ classId, adminPin }) {
  const res = await fetch('/api/compute-word-king', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId, adminPin }),
  })
  let body = null
  try { body = await res.json() } catch { /* JSON 아닌 응답도 아래에서 처리 */ }
  if (!res.ok || !body || body.ok === false) {
    throw new Error(body?.reason || body?.error || `계산 실패 (HTTP ${res.status})`)
  }
  return body // { ok:true, periodStart, periodEnd, champion, scores, eligibleCount, classAverageAccuracy, outliers }
}
