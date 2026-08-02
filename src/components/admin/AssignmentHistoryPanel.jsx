// 배정 이력 + 완료 현황 패널(2026-08-01) — 반 + 날짜 범위를 고르면
// daily_assignments 이력(날짜별로 어떤 단어를 배정했는지)과, 그 날짜에
// 학생들이 실제로 숙제를 완료했는지(student_daily_progress.
// categories_completed >= 4 — weeklyReport.js computeStudentStats의
// homeworkDone 규칙과 완전히 동일)를 같이 보여준다.
//
// 완전히 읽기 전용, admin-content-write Edge Function 배포 여부와 무관하게
// 항상 동작한다 — daily_assignments SELECT는 v3.12 락다운
// (supabase_v3_12_lockdown_daily_assignments.sql) 이후에도 anon 허용
// (fetchAssignmentHistory, wordLibrary.js), student_daily_progress는
// 애초에 락다운 대상이 아니다(supabase_v1_3_schema.sql). AnalyticsPanel.jsx
// 와 동일한 관례로 이 파일도 supabaseClient를 직접 사용(관리자 전용 읽기
// 전용 조회 — wordLibrary.js에 새 쓰기 경로를 추가하지 않음).
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../utils/supabaseClient'
import { getClassNames, getClassUnits, getStudentsInClass, fetchAssignmentHistory, localIsoDateStr, wordSlug, isoDaysAgoStr } from '../../utils/wordLibrary'

// 2026-08-02 — wordSlug/isoDaysAgoStr 로컬 사본(AdminScreen.jsx와 바이트
// 단위로 동일했던 정의)을 제거하고 wordLibrary.js의 단일 원본을 import한다
// (배정 매칭의 핵심 규칙이라 드리프트 시 숙제 배정이 깨질 수 있었음).

export default function AssignmentHistoryPanel() {
  const classList = getClassNames()
  const [selectedClass, setSelectedClass] = useState(classList[0] || '')
  const [fromDate, setFromDate] = useState(isoDaysAgoStr(14))
  const [toDate, setToDate] = useState(localIsoDateStr())
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([]) // [{ date, wordIds }]
  const [completion, setCompletion] = useState({}) // date -> { done, total }
  const [errorMsg, setErrorMsg] = useState('')

  // 2026-08-02 — stale-response 가드. 반/날짜 범위를 빠르게 바꾸면 먼저
  // 시작된 조회의 응답이 나중에 도착해 방금 바꾼 선택의 결과를 덮어쓸 수
  // 있었다(AdminScreen.jsx:499/734와 동일한 stale 응답 레이스 — P7 감사
  // 2026-07-16). 요청 번호로 최신 요청의 응답만 반영한다.
  const loadReqIdRef = useRef(0)

  const load = async () => {
    const reqId = ++loadReqIdRef.current
    if (!selectedClass) { setHistory([]); setCompletion({}); return }
    setLoading(true)
    setErrorMsg('')
    try {
      const rows = await fetchAssignmentHistory(selectedClass, fromDate, toDate)
      if (loadReqIdRef.current !== reqId) return // 더 최신 조회가 시작됨 — 이 응답은 버림
      setHistory(rows)
      const ids = getStudentsInClass(selectedClass).map((s) => s.id)
      if (ids.length === 0) { setCompletion({}); return }
      const { data, error } = await supabase.from('student_daily_progress')
        .select('student_id, date, categories_completed')
        .in('student_id', ids)
        .gte('date', fromDate)
        .lte('date', toDate)
      if (loadReqIdRef.current !== reqId) return
      if (error) {
        // 완료 현황만 실패해도 배정 이력(rows)은 이미 화면에 표시된 상태라
        // 화면 전체를 깨뜨리지 않는다 — 정직하게 안내만.
        setErrorMsg('완료 현황 조회 중 오류(배정 이력은 정상 표시돼요): ' + error.message)
        setCompletion({})
        return
      }
      const doneByDate = {}
      ;(data || []).forEach((r) => {
        if ((r.categories_completed || 0) >= 4) doneByDate[r.date] = (doneByDate[r.date] || 0) + 1
      })
      const comp = {}
      rows.forEach((r) => { comp[r.date] = { done: doneByDate[r.date] || 0, total: ids.length } })
      setCompletion(comp)
    } catch (err) {
      if (loadReqIdRef.current !== reqId) return
      setErrorMsg('배정 이력을 불러오는 중 오류가 발생했어요: ' + (err.message || err))
      setHistory([])
      setCompletion({})
    } finally {
      if (loadReqIdRef.current === reqId) setLoading(false)
    }
  }

  useEffect(() => { load() }, [selectedClass, fromDate, toDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // 단어 슬러그 -> { word, unitName } — 지금 그 단어가 속한 유닛으로 표시
  // (배정 당시 유닛이 아니라 "현재" 유닛 — 단어가 유닛을 옮긴 드문 경우도
  // 크래시 없이 최신 상태만 보여줌). 이 반에 더 이상 없는 slug(단어 삭제/
  // 이름 변경 등)는 조회에 안 걸려 원문 그대로 표시된다.
  const wordLookup = new Map()
  if (selectedClass) {
    (getClassUnits(selectedClass) || []).forEach((u) => {
      (u.words || []).forEach((w) => {
        if (w?.word) wordLookup.set(wordSlug(w.word), { word: w.word, unitName: u.name })
      })
    })
  }

  return (
    <div className="bg-white rounded-3xl card-shadow p-5 space-y-3">
      <p className="text-sm font-black text-gray-700">🗂️ 배정 이력 + 완료 현황</p>
      <div className="flex gap-2 flex-wrap items-center">
        <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}
          className="border-2 border-gray-200 rounded-xl px-3 py-2 text-xs font-bold bg-white">
          <option value="">반 선택</option>
          {classList.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="border-2 border-gray-200 rounded-xl px-2 py-2 text-xs font-bold bg-white" />
        <span className="text-xs text-gray-400">~</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="border-2 border-gray-200 rounded-xl px-2 py-2 text-xs font-bold bg-white" />
        <button onClick={load} disabled={loading}
          className="bg-purple-100 text-purple-600 font-bold px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-60">🔄</button>
      </div>
      {errorMsg && <p className="text-xs font-bold text-red-500">{errorMsg}</p>}
      {loading ? (
        <p className="text-xs text-gray-400">불러오는 중...</p>
      ) : !selectedClass ? (
        <p className="text-xs text-gray-400">반을 선택해주세요.</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-gray-400">이 기간에 배정 이력이 없어요.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {history.map(({ date, wordIds }) => {
            const chips = wordIds.map((slug) => {
              const info = wordLookup.get(slug)
              return { slug, label: info?.word || slug, unitName: info?.unitName || null }
            })
            const unitNames = [...new Set(chips.map((c) => c.unitName).filter(Boolean))]
            const comp = completion[date]
            return (
              <div key={date} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-xs font-black text-gray-700">
                    {date}{unitNames.length > 0 ? ` · ${unitNames.join(', ')}` : ''}
                  </p>
                  {comp && <p className="text-xs font-bold text-teal-600">완료 {comp.done} / {comp.total}명</p>}
                </div>
                {wordIds.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">배정 없음(유닛 전체 단어로 폴백)</p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {chips.map((c, i) => (
                      <span key={`${c.slug}-${i}`} className="px-2 py-0.5 rounded-lg text-xs font-bold bg-white border-2 border-gray-200 text-gray-600">
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
