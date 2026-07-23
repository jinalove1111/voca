import React, { useState, useEffect } from 'react'
import { fetchLearningRecommendations, registerRecommendation, dismissRecommendation } from '../../utils/writingAnswerStatsApi'

// AdminScreen.jsx → src/components/admin/LearningRecommendationsCard.jsx로
// 이동(2026-07-24, 코드 품질 감사 대응 — StudentDirectory.jsx(2026-07-22)와
// 동일한 순수 이동, 로직 변경 없음).
//
// ── "선생님이 같은 검토를 두 번 하지 않는" 자동 학습 시스템(2026-07-24) ───
//
// 이 카드는 writing_answer_statistics(다른 세션이 준비 중인
// supabase_v3_9_*.sql로 생성)를 쓴다 — SQL 미실행이면 조회 함수가 null을
// 반환하고, "SQL 실행 필요" 안내로 폴백한다(콘솔 에러 없음, 헌법 규칙 9).
// SpellingReviewQueuePanel(별도 파일)과 데이터 소스가 완전히 달라 독립
// 컴포넌트로 분리했다.
//
// AI 추천 학습 카드(요구사항 2·4) — 반복 제출된 대기 답안 패턴 Top N을
// 보여주고, 한 번의 클릭으로 인정/무시할 수 있게 한다.
export default function LearningRecommendationsCard() {
  const [rows, setRows] = useState(undefined) // undefined=로딩 중, null=테이블 없음, []=없음
  const [minCount, setMinCountState] = useState(() => {
    try { return Math.max(1, parseInt(localStorage.getItem('voca_learning_reco_min_count') || '3', 10) || 3) } catch { return 3 }
  })
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const load = async (mc = minCount) => {
    setRows(undefined)
    setRows(await fetchLearningRecommendations({ minCount: mc }))
  }
  useEffect(() => { load(minCount) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateMinCount = (raw) => {
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) return
    setMinCountState(n)
    try { localStorage.setItem('voca_learning_reco_min_count', String(n)) } catch { /* 조용히 무시 */ }
    load(n)
  }

  const accept = async (row) => {
    setBusyId(row.id)
    try {
      await registerRecommendation(row)
      setRows((prev) => (Array.isArray(prev) ? prev.filter((r) => r.id !== row.id) : prev))
      setToast(`"${row.word}" 답안 등록 완료`)
    } catch (err) {
      alert('등록 처리 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }
  const dismiss = async (row) => {
    setBusyId(row.id)
    try {
      await dismissRecommendation(row.id)
      setRows((prev) => (Array.isArray(prev) ? prev.filter((r) => r.id !== row.id) : prev))
    } catch (err) {
      alert('무시 처리 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-sm font-black text-gray-700">🎓 AI 추천 학습 {Array.isArray(rows) && rows.length > 0 && <span className="text-orange-500">({rows.length}건)</span>}</p>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-gray-500 font-bold">
            최소 반복 횟수
            <input type="number" min={1} value={minCount} onChange={(e) => updateMinCount(e.target.value)}
              className="w-14 border-2 border-gray-200 rounded-lg px-1.5 py-0.5" />
          </label>
          <button onClick={() => load(minCount)} className="text-purple-500 font-bold btn-press py-1 px-1">새로고침</button>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">여러 학생이 반복해서 낸 같은 오답 패턴이에요 — 한 번 등록하면 그 다음부터 자동으로 정답 처리돼요(같은 검토를 두 번 하지 않기).</p>

      {toast && <p className="text-xs font-bold text-green-600 bg-green-50 rounded-xl p-2 mb-2">✅ {toast}</p>}

      {rows === undefined ? (
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      ) : rows === null ? (
        <p className="text-xs text-orange-500 font-bold bg-orange-50 rounded-xl p-3">⚠️ 준비 중 — supabase_v3_9 SQL 실행 필요(Supabase SQL Editor).</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-400 text-sm">아직 추천할 만큼 반복된 답안이 없어요.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="border-2 border-gray-100 rounded-xl p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-gray-700">
                <p className="font-black text-sm text-gray-800">{r.word} <span className="text-gray-400 font-normal">→</span> "{r.submittedAnswer}"</p>
                <p className="text-gray-500 mt-0.5">
                  {r.count}회 · {r.distinctStudentCount}명
                  {typeof r.lastConfidence === 'number' && <> · 최근 신뢰도 {Math.round(r.lastConfidence * 100)}%</>}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => accept(r)} disabled={busyId === r.id}
                  className="bg-green-500 hover:bg-green-600 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press disabled:opacity-50">등록</button>
                <button onClick={() => dismiss(r)} disabled={busyId === r.id}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold px-3 py-1.5 rounded-lg text-xs btn-press disabled:opacity-50">무시</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
