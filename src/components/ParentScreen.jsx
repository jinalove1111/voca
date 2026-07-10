import { useState, useMemo } from 'react'
import { findStudentByName, getStudentClass, getStudentUnit, getClassUnits, fetchDashboardData, fetchWordStatusSummary } from '../utils/wordLibrary'
import { computeStudentStats, buildWeeklyReport } from '../utils/weeklyReport'
import HeroReaction from './HeroReaction'
import { getReactionById } from '../utils/paulReactions'

// v1.5.1 학부모 화면 — 자녀 이름만 입력하면 보이는 읽기 전용 조회 화면.
// 접근 방식은 기존 학생 로그인과 동일한 신뢰 모델(비밀번호 없음, 이름
// 하나로 식별) — 이 앱은 처음부터 소규모 공부방 대상이라 학생 본인도
// 이름만으로 자기 기록에 들어갈 수 있고, 이미 "학부모 리포트"를 관리자가
// 복사해서 그대로 전달하는 기능도 있었으므로 노출 범위가 새로 넓어지는
// 게 아니다. 쓰기 동작은 전혀 없음(진행 기록을 절대 바꿀 수 없음) —
// fetchDashboardData/fetchWordStatusSummary/computeStudentStats 전부
// AdminScreen의 관리자 대시보드가 이미 쓰던 것을 그대로 재사용해서, 관리자
// 화면과 학부모 화면이 절대 다른 숫자를 보여주지 않는다.
export default function ParentScreen({ onBack }) {
  const [input, setInput] = useState('')
  const [resolvedName, setResolvedName] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null) // { row, wordStatusSummary, wordLookup }
  const [showReport, setShowReport] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = async (name) => {
    setLoading(true)
    setError('')
    setShowReport(false)
    setCopied(false)
    try {
      const [rows, wsSummary] = await Promise.all([
        fetchDashboardData([name]),
        fetchWordStatusSummary([name]).catch(() => ({})),
      ])
      const row = rows[0]
      const className = getStudentClass(name)
      const units = className ? getClassUnits(className) : []
      const wordLookup = {}
      units.forEach(u => (u.words || []).forEach(w => {
        wordLookup[w.word.toLowerCase().replace(/\s+/g, '_')] = w
      }))
      setData({ row, wordLookup })
      setResolvedName(name)
    } catch (err) {
      setError('조회 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    const name = input.trim()
    if (!name) { setError('이름을 입력해주세요!'); return }
    const existing = findStudentByName(name)
    if (!existing) { setError('해당 이름의 학생을 찾을 수 없어요. 이름을 다시 확인해주세요.'); return }
    load(existing)
  }

  const handleReset = () => {
    setResolvedName(null)
    setData(null)
    setInput('')
    setError('')
  }

  const stats = useMemo(() => {
    if (!data?.row) return null
    return computeStudentStats(data.row, {})
  }, [data])

  if (!resolvedName) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-pink-50 to-purple-50">
        <div className="text-center mb-6">
          <HeroReaction image={getReactionById('love')?.image} size="sm" />
          <h1 className="text-2xl font-black text-purple-700 mt-1">학부모 화면</h1>
          <p className="text-purple-400 font-medium mt-1 text-sm">자녀 이름을 입력하면 오늘 학습 현황을 볼 수 있어요</p>
        </div>
        <div className="w-[calc(100vw-2rem)] max-w-sm bg-white rounded-3xl card-shadow p-6 space-y-3">
          <input type="text" value={input} onChange={e => { setInput(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="자녀 이름 입력..." maxLength={10}
            className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold text-center focus:outline-none focus:border-purple-500"
            autoFocus />
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
