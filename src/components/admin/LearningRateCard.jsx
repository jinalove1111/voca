import React, { useState, useEffect } from 'react'
import { fetchLearningRateMetrics } from '../../utils/writingAnswerStatsApi'

// AdminScreen.jsx → src/components/admin/LearningRateCard.jsx로 이동
// (2026-07-24, 코드 품질 감사 대응 — StudentDirectory.jsx(2026-07-22)와
// 동일한 순수 이동, 로직 변경 없음).
//
// 학습률 카드(요구사항 8) — 이번 주/지난 주 자동 등록(accepted) 수 + 동의어
// 증가수. 각 지표는 number(0 포함) 또는 null("데이터 수집 중")을 정직하게
// 구분해 표시한다(§ 지어내지 않기).
export default function LearningRateCard() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    setMetrics(await fetchLearningRateMetrics())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const fmt = (v) => (typeof v === 'number' ? `${v}건` : '데이터 수집 중')

  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-black text-gray-700">📈 학습률</p>
        <button onClick={load} disabled={loading} className="text-xs font-bold text-purple-500 btn-press py-1 px-1">새로고침</button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">월요일(Asia/Seoul) 시작 기준 — 자동 등록은 반복 답안이 "AI 추천 학습"으로 등록된 수, 동의어 증가는 "이 단어 허용 답안으로 저장" 감사 이력 기준.</p>
      {loading ? (
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-gray-500 font-bold mb-1">이번 주</p>
            <p className="text-gray-700">자동 등록 {fmt(metrics?.thisWeek?.autoAcceptedCount)}</p>
            <p className="text-gray-700">동의어 증가 {fmt(metrics?.thisWeek?.synonymCount)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-gray-500 font-bold mb-1">지난 주</p>
            <p className="text-gray-700">자동 등록 {fmt(metrics?.lastWeek?.autoAcceptedCount)}</p>
            <p className="text-gray-700">동의어 증가 {fmt(metrics?.lastWeek?.synonymCount)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
