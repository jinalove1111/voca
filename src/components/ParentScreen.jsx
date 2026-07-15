import { useState, useMemo } from 'react'
import { getStudentClass, getClassUnits, fetchDashboardData, fetchWordStatusSummary } from '../utils/wordLibrary'
import { computeStudentStats, buildWeeklyReport } from '../utils/weeklyReport'
import HeroReaction from './HeroReaction'
import { getReactionById } from '../utils/paulReactions'

// v1.5.1 학부모 화면 — P0(2026-07-15) 운영자 지시로 "자녀 이름만 입력"에서
// "이름 + PIN"(학생 본인 PIN 그대로 재사용, 별도 학부모 전용 PIN은 과도한
// 설계라 판단해 만들지 않음)으로 강화. student_id가 데이터 식별자라는 점은
// 학생 화면과 동일 — 이름만으론 더 이상 동명이인을 구분할 수 없으므로
// PIN으로 정확히 한 학생을 확인한다(api/verify-student-pin.js, 학생
// 로그인과 완전히 같은 서버 엔드포인트 재사용). 쓰기 동작은 전혀 없음
// (진행 기록을 절대 바꿀 수 없음) — fetchDashboardData/
// fetchWordStatusSummary/computeStudentStats 전부 AdminScreen의 관리자
// 대시보드가 이미 쓰던 것을 그대로 재사용해서, 관리자 화면과 학부모
// 화면이 절대 다른 숫자를 보여주지 않는다.
export default function ParentScreen({ onBack }) {
  const [input, setInput] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [resolvedId, setResolvedId] = useState(null)
  const [resolvedName, setResolvedName] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null) // { row, wordLookup }
  const [showReport, setShowReport] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = async (studentId, name, className) => {
    setLoading(true)
    setError('')
    setShowReport(false)
    setCopied(false)
    try {
      const [rows, wsSummary] = await Promise.all([
        fetchDashboardData([studentId]),
        fetchWordStatusSummary([studentId]).catch(() => ({})),
      ])
      const row = rows[0]
      const units = className ? getClassUnits(className) : []
      const wordLookup = {}
      units.forEach(u => (u.words || []).forEach(w => {
        wordLookup[w.word.toLowerCase().replace(/\s+/g, '_')] = w
      }))
      setData({ row, wordLookup })
      setResolvedId(studentId)
      setResolvedName(name)
    } catch (err) {
      setError('조회 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    const name = input.trim()
    if (!name) { setError('자녀 이름을 입력해주세요!'); return }
    if (!/^\d{4}$/.test(pinInput)) { setError('PIN은 숫자 4자리예요. (자녀가 로그인할 때 쓰는 PIN과 같아요)'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/verify-student-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin: pinInput }),
      })
      const resData = await res.json()
      if (!resData.ok) {
        const MESSAGES = {
          not_found: '해당 이름의 학생을 찾을 수 없어요. 이름을 다시 확인해주세요.',
          invalid_format: 'PIN은 숫자 4자리예요.',
          wrong_pin: '이름 또는 PIN이 올바르지 않아요.',
          locked: '⚠️ PIN을 여러 번 틀려서 잠시 조회할 수 없어요. 5분 후 다시 시도해주세요.',
          no_pin_setup: '아직 PIN이 설정되지 않은 계정이에요. 선생님(관리자)에게 문의해주세요.',
        }
        setError(MESSAGES[resData.reason] || '조회에 실패했어요. 다시 시도해주세요.')
        setLoading(false)
        return
      }
      await load(resData.studentId, resData.name, resData.className)
    } catch (err) {
      setError('조회 중 오류가 발생했어요: ' + (err.message || err))
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResolvedId(null)
    setResolvedName(null)
    setData(null)
    setInput('')
    setPinInput('')
    setError('')
  }

  const stats = useMemo(() => {
    if (!data?.row) return null
    return computeStudentStats(data.row, {})
  }, [data])

  if (!resolvedId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-pink-50 to-purple-50">
        <div className="text-center mb-6">
          <HeroReaction image={getReactionById('love')?.image} size="sm" />
          <h1 className="text-2xl font-black text-purple-700 mt-1">학부모 화면</h1>
          <p className="text-purple-400 font-medium mt-1 text-sm">자녀 이름과 PIN(자녀 로그인 PIN과 동일)을 입력하면 오늘 학습 현황을 볼 수 있어요</p>
        </div>
        <div className="w-[calc(100vw-2rem)] max-w-sm bg-white rounded-3xl card-shadow p-6 space-y-3">
          <input type="text" value={input} onChange={e => { setInput(e.target.value); setError('') }}
            placeholder="자녀 이름 입력..." maxLength={10}
            className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold text-center focus:outline-none focus:border-purple-500"
            autoFocus />
          <input type="password" inputMode="numeric" pattern="[0-9]*" value={pinInput}
            onChange={e => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="PIN 4자리"
            className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold text-center tracking-[0.5em] focus:outline-none focus:border-purple-500" />
          {error && <p className="text-red-500 text-xs text-center font-bold">⚠️ {error}</p>}
          <button onClick={handleSearch} disabled={loading}
            className="w-full bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600 disabled:opacity-50">
            {loading ? '⏳ 조회하는 중...' : '조회하기'}
          </button>
        </div>
        <button onClick={onBack} className="mt-6 text-gray-400 text-xs font-bold btn-press hover:text-gray-600">
          ← 처음 화면으로
        </button>
      </div>
    )
  }

  const { row, wordLookup } = data
  const { studiedToday, homeworkDone, last7, quizCorrect, quizTotal, quizAccuracy, pronAttempts, topMissed } = stats

  return (
    <div className="min-h-screen p-4 pb-8 bg-gray-50">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 pt-2 mb-4">
          <button onClick={handleReset} className="text-purple-500 font-bold btn-press flex-shrink-0 whitespace-nowrap">← 다른 학생</button>
          <h1 className="text-xl font-black text-gray-800 min-w-0 break-words">👨‍👩‍👧 {resolvedName} 학생 학습 현황</h1>
        </div>

        {!row.progress ? (
          <div className="bg-white rounded-2xl card-shadow p-6 text-center text-gray-400 text-sm">
            아직 학습 기록이 동기화되지 않았어요. 아이가 앱에서 공부를 시작하면 여기에 기록이 보여요.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl card-shadow p-4">
              <p className="text-xs font-black text-gray-500 mb-2">📅 오늘 학습</p>
              <div className="flex gap-2">
                <span className={`flex-1 text-center py-2 rounded-xl text-sm font-bold ${studiedToday ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {studiedToday ? '✅ 오늘 공부함' : '⬜ 오늘 아직 안 함'}
                </span>
                <span className={`flex-1 text-center py-2 rounded-xl text-sm font-bold ${homeworkDone ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'}`}>
                  {homeworkDone ? '✅ 숙제 완료' : '⬜ 숙제 미완료'}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl card-shadow p-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-black text-yellow-600">⭐ {row.progress.total_stars ?? 0}</p>
                <p className="text-[10px] text-gray-400 font-bold">누적 별</p>
              </div>
              <div>
                <p className="text-xl font-black text-orange-500">🔥 {row.progress.streak ?? 0}일</p>
                <p className="text-[10px] text-gray-400 font-bold">연속 학습</p>
              </div>
              <div>
                <p className="text-xl font-black text-blue-500">📖 {row.progress.cleared_count ?? 0}개</p>
                <p className="text-[10px] text-gray-400 font-bold">클리어 단어</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl card-shadow p-4">
              <p className="text-xs font-black text-gray-500 mb-2">📈 최근 7일 학습 그래프 (미션 0~4개 완료)</p>
              {last7.length === 0 ? (
                <p className="text-gray-400 text-xs">아직 기록이 없어요.</p>
              ) : (
                <div className="flex items-end gap-1.5 h-20">
                  {/* 퍼센트 높이(%)는 부모 flex 항목의 실제 높이가 정의돼
                      있어야만 의미가 있는데, items-end 정렬에서는 각 막대의
                      래퍼 div가 늘어나지 않아 height:%가 항상 0으로
                      계산되던 버그가 있었다(막대가 안 보임) — 고정 px로
                      계산해서 h-20(80px) 컨테이너 안에서 항상 정확히 그려지게 함. */}
                  {[...last7].reverse().map(d => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={d.date}>
                      <div className={`w-full rounded-t-md ${d.categories_completed >= 4 ? 'bg-green-400' : d.categories_completed > 0 ? 'bg-yellow-300' : 'bg-gray-200'}`}
                        style={{ height: `${Math.max(6, (d.categories_completed / 4) * 62)}px` }} />
                      <span className="text-[9px] text-gray-400 font-bold whitespace-nowrap">{d.date.slice(5).replace('-', '/')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl card-shadow p-4">
              <p className="text-xs font-black text-gray-500 mb-1">📝 퀴즈 정답률</p>
              <p className="font-bold text-gray-800">{quizAccuracy !== null ? `${quizAccuracy}% (${quizCorrect}/${quizTotal})` : '최근 기록 없음'}</p>
              <p className="text-xs font-black text-gray-500 mb-1 mt-3">🗣️ 발음 연습 횟수</p>
              <p className="font-bold text-gray-800">{pronAttempts}회</p>
            </div>

            <div className="bg-red-50 rounded-2xl p-4 border-2 border-red-100">
              <p className="text-xs font-black text-red-600 mb-2">😅 취약 단어 (자주 틀린 단어)</p>
              {topMissed.length === 0 ? (
                <p className="text-gray-400 text-xs">최근 자주 틀린 단어가 없어요. 아주 잘하고 있어요!</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {topMissed.map(([slug, count]) => (
                    <span key={slug} className="bg-white text-red-600 rounded-lg px-2 py-1 text-xs font-bold border border-red-200">
                      {wordLookup[slug]?.word || slug} ×{count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { setShowReport(v => !v); setCopied(false) }}
              className="w-full bg-pink-100 text-pink-600 font-bold py-2.5 rounded-xl text-sm btn-press">
              📝 {showReport ? '주간 리포트 닫기' : '주간 리포트 전체 보기'}
            </button>
            {showReport && (() => {
              const report = buildWeeklyReport({
                name: resolvedName, last7, quizAccuracy, quizCorrect, quizTotal, pronAttempts,
                progress: row.progress, topMissed, wordLookup,
              })
              return (
                <div className="bg-pink-50 rounded-xl p-3">
                  <pre className="whitespace-pre-wrap text-xs text-gray-700 font-sans mb-2">{report}</pre>
                  <button onClick={() => navigator.clipboard?.writeText(report).then(() => setCopied(true)).catch(() => {})}
                    className="w-full bg-pink-500 text-white font-bold py-2 rounded-xl text-xs btn-press">
                    {copied ? '✅ 복사됨!' : '📋 복사하기'}
                  </button>
                </div>
              )
            })()}
          </div>
        )}

        <button onClick={onBack} className="w-full mt-4 text-gray-400 text-xs font-bold btn-press hover:text-gray-600">
          ← 처음 화면으로
        </button>
      </div>
    </div>
  )
}
