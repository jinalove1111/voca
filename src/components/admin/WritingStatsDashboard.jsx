import { useState, useEffect } from 'react'
import { fetchStatsOverview } from '../../utils/writingAnswerStatsApi'
import { fetchPendingSpellingReviews } from '../../utils/spellingReviewApi'
import { aggregateStatsRows, summarizeQueue } from '../../utils/spellingReviewBulkPlan'

// src/components/admin/WritingStatsDashboard.jsx(2026-08-01, P3 — 자기학습형
// 검토 파이프라인 통계 대시보드)
//
// 목적: 관리자가 검수 큐(SpellingReviewQueuePanel)를 열기 "전"에 전체 현황을
// 한눈에 보게 하는 요약 카드. 이 카드는:
//   - writing_answer_statistics 전체(대기/승인/반려 건수, 승인율) —
//     fetchStatsOverview(이 작업 신규, additive) + aggregateStatsRows(순수
//     헬퍼, spellingReviewBulkPlan.js)
//   - 실수 유형 분포 — 검수 큐(spelling_review_queue pending) 행을 별도로
//     조회해 summarizeQueue(같은 순수 헬퍼 모듈)로 집계. SpellingReviewQueuePanel
//     내부 상태를 끌어올리지 않고(그 컴포넌트의 기존 구조를 안 건드림) 이
//     카드가 독립적으로 읽기 전용 조회를 한 번 더 한다 — 두 컴포넌트는
//     같은 테이블(spelling_review_queue)을 각자 SELECT만 하므로 상태 공유
//     없이도 항상 최신값과 일치한다.
//   - Top 반복 패턴(개별 등록/무시 액션)은 이 카드가 다루지 않는다 —
//     LearningRecommendationsCard.jsx(기존, Top 50 처리)가 이미 그 책임을
//     맡고 있어 중복 구현하지 않는다(헌법 규칙 3). 이 카드는 "요약"에만
//     집중하고, "더 보려면 아래 AI 추천 학습 카드로"라고 안내만 한다.
//
// writing_answer_statistics/spelling_review_queue 둘 다 이미 anon SELECT가
// GRANT돼 있다(supabase_v3_9_writing_answer_statistics.sql / supabase_v2_0_
// spelling_mixed.sql) — 새 SQL/GRANT 필요 없음. 테이블 미실행(v3_9 SQL
// 미실행)이면 fetchStatsOverview가 null을 반환해 "SQL 실행 필요" 안내로
// 폴백한다(기존 LearningRecommendationsCard/LearningRateCard와 동일 관례).
export default function WritingStatsDashboard() {
  const [statsRows, setStatsRows] = useState(undefined) // undefined=로딩 중, null=테이블 없음
  const [queueRows, setQueueRows] = useState(undefined) // undefined=로딩 중, null=테이블 없음
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [stats, queue] = await Promise.all([
      fetchStatsOverview({ limit: 500 }),
      fetchPendingSpellingReviews(),
    ])
    setStatsRows(stats)
    setQueueRows(queue)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const agg = Array.isArray(statsRows) ? aggregateStatsRows(statsRows) : null
  // 2026-08-02 — spellingReviewApi.fetchPendingSpellingReviews()가 이미
  // 붙여둔 __fetchError 마커(테이블 없음이 아닌 실제 조회 실패 표시, 그
  // 함수 헤더 주석 "후속 세션이 배너 문구를 분기하고 싶으면 이 마커를
  // 쓰면 됨" 참고)를 처음으로 소비한다 — 이전엔 실제 네트워크 오류도
  // "대기 중인 답안이 없어요"(빈 상태)로 오도됐다.
  const queueFetchFailed = Array.isArray(queueRows) && queueRows.__fetchError === true
  const queueSummary = Array.isArray(queueRows) && !queueFetchFailed ? summarizeQueue(queueRows) : null
  const nonEmptyTypeGroups = queueSummary ? queueSummary.groups.filter((g) => g.count > 0) : []

  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-black text-gray-700">📊 쓰기 검수 현황 요약</p>
        <button onClick={load} disabled={loading} className="text-xs font-bold text-purple-500 btn-press py-1 px-1">새로고침</button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">전체 반복 답안 패턴의 대기/승인/반려 현황이에요 — 개별 패턴 등록/무시는 아래 "AI 추천 학습" 카드에서 하세요.</p>

      {loading ? (
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      ) : statsRows === null ? (
        <p className="text-xs text-orange-500 font-bold bg-orange-50 rounded-xl p-3">⚠️ 준비 중 — supabase_v3_9 SQL 실행 필요(Supabase SQL Editor).</p>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-gray-500 font-bold mb-0.5">대기</p>
              <p className="text-lg font-black text-orange-500">{agg.totals.pending}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-gray-500 font-bold mb-0.5">승인</p>
              <p className="text-lg font-black text-green-600">{agg.totals.accepted}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-gray-500 font-bold mb-0.5">반려(무시)</p>
              <p className="text-lg font-black text-gray-500">{agg.totals.dismissed}</p>
            </div>
          </div>

          <p className="text-gray-600">
            승인율{' '}
            {agg.acceptRatio === null
              ? <span className="text-gray-400">(아직 판정된 건 없음)</span>
              : <span className="font-black text-indigo-600">{Math.round(agg.acceptRatio * 100)}%</span>}
            <span className="text-gray-400"> · 전체 {agg.totals.total}건</span>
          </p>

          {queueFetchFailed ? (
            <p className="text-red-500 font-bold bg-red-50 rounded-xl p-3">
              ⚠️ 실수 유형 분포를 불러오지 못했어요(네트워크/서버 오류).{' '}
              <button onClick={load} className="underline text-red-600">다시 시도</button>
            </p>
          ) : queueSummary === null ? (
            <p className="text-gray-400">실수 유형 분포: 검수 큐 준비 중(supabase_v2_0_spelling_mixed.sql 실행 필요).</p>
          ) : (
            <div>
              <p className="font-bold text-gray-700 mb-1">실수 유형 분포(현재 대기 {queueSummary.totalPending}건)</p>
              {nonEmptyTypeGroups.length === 0 ? (
                <p className="text-gray-400">대기 중인 답안이 없어요.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {nonEmptyTypeGroups.map((g) => (
                    <span key={g.type} className="bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded-lg">{g.label} {g.count}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-gray-400">Top 반복 패턴 등록/무시는 아래 "🎓 AI 추천 학습" 카드에서 진행하세요.</p>
        </div>
      )}
    </div>
  )
}
