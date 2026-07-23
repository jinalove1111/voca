import React, { useState, useEffect } from 'react'
import { readTodaySavings } from '../../utils/writingAnswerStatsApi'

// AdminScreen.jsx → src/components/admin/AiSavingsCard.jsx로 이동
// (2026-07-24, 코드 품질 감사 대응 — StudentDirectory.jsx(2026-07-22)와
// 동일한 순수 이동, 로직 변경 없음).
//
// 오늘 AI 절약 카드(요구사항 7) — SpellingReviewQueuePanel(별도 파일)의
// 미리보기/AI 확인 실행이 끝날 때마다 accumulateSavingsCounters가
// localStorage에 쌓은 값을 읽어 보여준다. refreshTick prop이 바뀔 때마다
// 다시 읽는다(부모 AdminScreen이 SpellingReviewQueuePanel의 onSavingsUpdate로
// tick을 올림).
export default function AiSavingsCard({ refreshTick }) {
  const [savings, setSavings] = useState(() => readTodaySavings())
  useEffect(() => { setSavings(readTodaySavings()) }, [refreshTick])

  const total = savings.rules + savings.cache + savings.variants + savings.statsSkips + savings.ai
  const savedCount = savings.rules + savings.cache + savings.variants + savings.statsSkips
  const savingsRate = total > 0 ? Math.round((savedCount / total) * 100) : null

  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-black text-gray-700">💰 오늘 AI 절약</p>
        <button onClick={() => setSavings(readTodaySavings())} className="text-xs font-bold text-purple-500 btn-press py-1 px-1">새로고침</button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">이 브라우저에서 오늘 실행한 쓰기 답안 검토 미리보기 기준(§ per-browser 집계 — 다른 관리자/기기 실행분은 포함 안 됨).</p>
      {total === 0 ? (
        <p className="text-gray-400 text-sm">오늘 실행 없음.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded-xl p-2"><p className="text-gray-500">규칙 기반</p><p className="font-black text-gray-800">{savings.rules}건</p></div>
          <div className="bg-gray-50 rounded-xl p-2"><p className="text-gray-500">캐시</p><p className="font-black text-gray-800">{savings.cache}건</p></div>
          <div className="bg-gray-50 rounded-xl p-2"><p className="text-gray-500">동의어 규칙</p><p className="font-black text-gray-800">{savings.variants}건</p></div>
          <div className="bg-gray-50 rounded-xl p-2"><p className="text-gray-500">통계 스킵</p><p className="font-black text-gray-800">{savings.statsSkips}건</p></div>
          <div className="bg-indigo-50 rounded-xl p-2 col-span-2"><p className="text-indigo-500">AI 호출</p><p className="font-black text-indigo-700">{savings.ai}건 / 전체 {total}건{savingsRate !== null && ` — 절약률 ${savingsRate}%`}</p></div>
        </div>
      )}
    </div>
  )
}
