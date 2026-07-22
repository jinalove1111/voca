// 익명 관찰 대시보드(2026-07-23) — "어떤 기능이 아이를 자발적으로 돌아오게
// 하는가"에 답하는 관리자 섹션. product_events(익명, 개인정보 0) + 기존
// 데이터의 평균 지표. 테이블 미실행 시 정직한 안내만(크래시 없음).
// 숫자 라벨은 전부 "실제로 측정하는 것"을 그대로 말한다(근사는 근사라고).
import { useEffect, useState } from 'react'
import { supabase } from '../../utils/supabaseClient'
import { EV, computeReturnRates, computeGardenRevisits, computeAvgSessionMinutes, computeFeatureCounts } from '../../utils/analyticsMath'

const EV_LABEL = {
  [EV.appOpened]: '앱 열람', [EV.paulMemoryViewed]: '폴의 기억', [EV.todaysDiscoveryViewed]: '오늘의 발견',
  [EV.gardenOpened]: '정원', [EV.hatEarned]: '모자 획득', [EV.hatEquipped]: '모자 장착',
  [EV.paulTownOpened]: 'Paul Town', [EV.bookshelfOpened]: '책장', [EV.museumOpened]: '박물관', [EV.timeMachineOpened]: '타임머신',
}
const pct = (v) => `${Math.round(v * 100)}%`

export default function AnalyticsPanel() {
  const [state, setState] = useState({ loading: true, missing: false, rows: [], avgs: null })
  useEffect(() => {
    let gone = false
    ;(async () => {
      const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      const { data, error } = await supabase.from('product_events')
        .select('anon_id,event,day,created_at').gte('day', since).limit(20000)
      if (gone) return
      if (error) { setState({ loading: false, missing: true, rows: [], avgs: null }); return }
      // 평균 지표 — 기존 데이터에서 파생(정직 라벨: 각각 무엇의 평균인지 명시)
      let avgs = null
      try {
        const [prog, ws, asg] = await Promise.all([
          supabase.from('student_progress').select('progress_data'),
          supabase.from('word_status').select('student_id,status').eq('status', 'mastered'),
          supabase.from('student_class_assignments').select('student_id'),
        ])
        const blobs = (prog.data || []).map((r) => r.progress_data).filter(Boolean)
        const n = blobs.length || 1
        const masteredByStudent = {}
        for (const r of ws.data || []) masteredByStudent[r.student_id] = (masteredByStudent[r.student_id] || 0) + 1
        const mVals = Object.values(masteredByStudent)
        const tbByStudent = {}
        for (const r of asg.data || []) tbByStudent[r.student_id] = (tbByStudent[r.student_id] || 0) + 1
        const tVals = Object.values(tbByStudent)
        avgs = {
          hats: blobs.reduce((a, b) => a + (Array.isArray(b.hatInventory) ? b.hatInventory.length : 0), 0) / n,
          mastered: mVals.length ? mVals.reduce((a, b) => a + b, 0) / mVals.length : 0,
          textbooks: tVals.length ? tVals.reduce((a, b) => a + b, 0) / tVals.length : 0,
        }
      } catch { /* 평균 실패해도 이벤트 섹션은 보여준다 */ }
      setState({ loading: false, missing: false, rows: data || [], avgs })
    })()
    return () => { gone = true }
  }, [])

  if (state.loading) return <p className="text-sm text-gray-400 p-4">불러오는 중…</p>
  if (state.missing) return (
    <div className="bg-white rounded-3xl card-shadow p-5 text-center">
      <p className="font-black text-gray-600">아직 데이터가 없어요</p>
      <p className="text-sm text-gray-400 mt-1">supabase_v3_2_product_events.sql 실행 후 수집이 시작돼요</p>
    </div>
  )
  const rates = computeReturnRates(state.rows)
  const rev = computeGardenRevisits(state.rows)
  const counts = computeFeatureCounts(state.rows)
  const session = computeAvgSessionMinutes(state.rows)
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl card-shadow p-5">
        <h3 className="font-black text-gray-800 mb-2">🔁 기능별 복귀율 — 핵심 질문</h3>
        <p className="text-xs text-gray-400 mb-3">그 기능을 본 날 기준, 1/3/7일 뒤에 다시 온(아무 활동) 비율 — 익일 복귀율 내림차순</p>
        {rates.length === 0 ? <p className="text-sm text-gray-400">아직 이벤트가 없어요</p> : (
          <table className="w-full text-sm"><tbody>
            {rates.map((r, i) => (
              <tr key={r.event} className={i === 0 ? 'bg-purple-50 font-black' : ''}>
                <td className="py-1.5 px-2">{i === 0 ? '👑 ' : ''}{EV_LABEL[r.event] || r.event}</td>
                <td className="text-right px-2 text-gray-400">{r.opens}회</td>
                <td className="text-right px-2">{pct(r.d1)}</td>
                <td className="text-right px-2 text-gray-500">{pct(r.d3)}</td>
                <td className="text-right px-2 text-gray-500">{pct(r.d7)}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
      <div className="bg-white rounded-3xl card-shadow p-5">
        <h3 className="font-black text-gray-800 mb-2">🌱 정원 재방문</h3>
        <p className="text-sm text-gray-600">1일 뒤 {pct(rev.d1)} · 3일 뒤 {pct(rev.d3)} · 7일 뒤 {pct(rev.d7)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-3xl card-shadow p-4 text-center">
          <p className="font-black text-xl text-gray-800">{session.toFixed(1)}분</p>
          <p className="text-xs text-gray-400">평균 세션(이벤트 간격 근사)</p>
        </div>
        {state.avgs && (<>
          <div className="bg-white rounded-3xl card-shadow p-4 text-center">
            <p className="font-black text-xl text-gray-800">{state.avgs.mastered.toFixed(1)}</p>
            <p className="text-xs text-gray-400">평균 마스터 단어(word_status 기준)</p>
          </div>
          <div className="bg-white rounded-3xl card-shadow p-4 text-center">
            <p className="font-black text-xl text-gray-800">{state.avgs.textbooks.toFixed(1)}</p>
            <p className="text-xs text-gray-400">평균 배정 교재 수(완주 아님 — 배정)</p>
          </div>
          <div className="bg-white rounded-3xl card-shadow p-4 text-center">
            <p className="font-black text-xl text-gray-800">{state.avgs.hats.toFixed(1)}</p>
            <p className="text-xs text-gray-400">평균 획득 모자</p>
          </div>
        </>)}
      </div>
      <div className="bg-white rounded-3xl card-shadow p-5">
        <h3 className="font-black text-gray-800 mb-2">👀 기능별 열람 수(60일)</h3>
        <p className="text-sm text-gray-600">{Object.entries(counts).map(([e, c]) => `${EV_LABEL[e] || e} ${c}`).join(' · ') || '없음'}</p>
      </div>
    </div>
  )
}
