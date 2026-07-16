import { useState, useEffect, useMemo } from 'react'
import {
  getClassNames, getClassIdByName, getClassUnitNames, getClassWords,
  getTodaysAssignmentWordIds, getStudentsInClass,
} from '../utils/wordLibrary'
import { summarizeClassResults } from '../utils/entranceTest'
import {
  checkEntranceTestAvailable, fetchTodayTests, findActiveTest,
  createEntranceTest, closeEntranceTest, fetchResultsForTests,
} from '../utils/entranceTestApi'
import { RankingList, toRanked } from './EntranceTest'

// ── 입실 단어시험 (교사/관리자 패널) ─────────────────────────────────────
// 반 선택 -> 출제 범위 확인(오늘의 단어 배정이 있으면 그것, 없으면 유닛
// 전체 — getStudentWords의 v1.3 폴백 규칙과 동일) -> 문항 수/방향/제한시간
// 설정 -> 시험 시작. 시작 후에는 실시간 현황(5초 폴링): 응시자/점수/랭킹/
// VIP/평균 정답률/많이 틀린 단어 요약 + 시험 종료 버튼.
//
// supabase_v1_8_entrance_test.sql이 아직 실행 안 됐으면 "준비 중" 안내만
// 표시(크래시 없음) — 실행 후 새로고침하면 바로 사용 가능.
const wordSlug = (word) => word.toLowerCase().replace(/\s+/g, '_')
const ADMIN_POLL_MS = 5000

const DIRECTION_OPTIONS = [
  ['en2kr', '영어 → 한글 뜻'],
  ['kr2en', '한글 뜻 → 영어'],
  ['random', '랜덤 (문제마다 영↔한 섞임)'],
]
const TIME_OPTIONS = [
  [60, '1분'], [90, '1분 30초'], [120, '2분'], [180, '3분'], [300, '5분'],
]

export default function EntranceTestAdmin() {
  const [available, setAvailable] = useState(null) // null=확인 중
  const [cls, setCls] = useState('')
  const [unit, setUnit] = useState('')
  const [questionCount, setQuestionCount] = useState(10)
  const [direction, setDirection] = useState('en2kr')
  const [timeLimit, setTimeLimit] = useState(120)
  const [starting, setStarting] = useState(false)
  const [tests, setTests] = useState([])
  const [results, setResults] = useState([])

  useEffect(() => { checkEntranceTestAvailable().then(setAvailable) }, [])

  const classId = cls ? getClassIdByName(cls) : null

  // 출제 범위 — 오늘의 단어 배정(slug)이 있고 유닛 단어와 교집합이 있으면
  // 그 서브셋, 아니면 유닛 전체(v1.3 getStudentWords 폴백과 같은 규칙).
  const { sourceWords, sourceLabel } = useMemo(() => {
    if (!cls || !unit) return { sourceWords: [], sourceLabel: '' }
    const unitWords = (getClassWords(cls, unit) || []).filter((w) => w && w.word && w.meaning)
    const assigned = new Set(getTodaysAssignmentWordIds(cls))
    if (assigned.size > 0) {
      const filtered = unitWords.filter((w) => assigned.has(wordSlug(w.word)))
      if (filtered.length > 0) return { sourceWords: filtered, sourceLabel: `오늘의 단어 배정 (${filtered.length}개)` }
    }
    return { sourceWords: unitWords, sourceLabel: `${unit} 전체 (${unitWords.length}개)` }
  }, [cls, unit])

  // 반 선택 시 오늘의 시험 현황 로드 + 5초 폴링(탭이 보일 때만).
  const loadStatus = async (targetClassId) => {
    if (!targetClassId) { setTests([]); setResults([]); return }
    const t = await fetchTodayTests(targetClassId)
    const r = await fetchResultsForTests(t.map((x) => x.id))
    setTests(t)
    setResults(r)
  }

  useEffect(() => {
    if (!classId || available !== true) return undefined
    loadStatus(classId)
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') loadStatus(classId)
    }, ADMIN_POLL_MS)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, available])

  const activeTest = findActiveTest(tests)
  const ranked = useMemo(() => toRanked(results), [results])
  const summary = useMemo(
    () => summarizeClassResults(results.map((r) => ({ ...r, missedWords: r.missedWords }))),
    [results]
  )
  const roster = cls ? getStudentsInClass(cls) : []

  const handleStart = async () => {
    if (!classId) return alert('반을 선택해주세요!')
    if (sourceWords.length === 0) return alert('출제할 단어가 없어요. 반/유닛에 단어를 먼저 등록해주세요.')
    const count = Math.max(1, Math.min(Number(questionCount) || 10, sourceWords.length))
    if (activeTest && !window.confirm('이미 진행 중인 시험이 있어요. 종료하고 새 시험을 시작할까요?')) return
    setStarting(true)
    try {
      await createEntranceTest(classId, {
        direction,
        questionCount: count,
        timeLimitSeconds: Number(timeLimit),
        words: sourceWords.map((w) => ({ word: w.word, meaning: w.meaning })),
      })
      await loadStatus(classId)
      alert(`"${cls}" 반 입실시험을 시작했어요! 학생들 홈 화면에 배너가 떠요 (최대 20초 안에 표시).`)
    } catch (err) {
      alert('시험 시작 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setStarting(false)
    }
  }

  const handleClose = async () => {
    if (!activeTest) return
    if (!window.confirm('시험을 종료할까요? 아직 제출 안 한 학생은 더 이상 응시할 수 없어요.')) return
    try {
      await closeEntranceTest(activeTest.id)
      await loadStatus(classId)
    } catch (err) {
      alert('시험 종료 중 오류가 발생했어요: ' + (err.message || err))
    }
  }

  if (available === null) {
    return <div className="bg-white rounded-3xl card-shadow p-8 text-center text-gray-400 font-bold">확인 중...</div>
  }

  if (available === false) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-6 text-center space-y-2">
        <div className="text-4xl">🚧</div>
        <p className="font-black text-amber-700">입실시험 기능 준비 중</p>
        <p className="text-sm text-amber-600">
          Supabase SQL Editor에서 <code className="font-black">supabase_v1_8_entrance_test.sql</code>을 실행한 뒤
          이 페이지를 새로고침하면 바로 사용할 수 있어요.
        </p>
        <p className="text-xs text-amber-500">SQL 실행 전까지 학생 화면에는 아무 변화 없음 (안전)</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 1. 반/출제 범위 선택 */}
      <div className="bg-white rounded-3xl card-shadow p-5 space-y-3">
        <p className="font-black text-gray-800">🏁 입실 단어시험 시작하기</p>
        <select value={cls}
          onChange={(e) => { const c = e.target.value; setCls(c); setUnit(getClassUnitNames(c)[0] || '') }}
          className="w-full border-2 border-rose-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-rose-500 bg-white">
          <option value="">-- 반을 선택하세요 --</option>
          {getClassNames().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {cls && (
          <>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}
              className="w-full border-2 border-rose-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-rose-500 bg-white">
              {getClassUnitNames(cls).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <div className="bg-rose-50 rounded-xl px-3 py-2 text-xs font-bold text-rose-600">
              출제 범위: {sourceLabel || '단어 없음'}
              {getTodaysAssignmentWordIds(cls).length > 0 && sourceLabel.startsWith('오늘') && ' — 오늘의 단어가 배정돼 있어 그 단어들만 출제돼요'}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-gray-600 space-y-1">
                <span>문항 수 (최대 {sourceWords.length})</span>
                <input type="number" min={1} max={Math.max(1, sourceWords.length)} value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 font-black text-center bg-white" />
              </label>
              <label className="text-xs font-bold text-gray-600 space-y-1">
                <span>제한 시간</span>
                <select value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 font-black bg-white">
                  {TIME_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold text-gray-600 space-y-1">
              <span>출제 방향</span>
              <select value={direction} onChange={(e) => setDirection(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 font-black bg-white">
                {DIRECTION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            <button onClick={handleStart} disabled={starting || sourceWords.length === 0}
              className="w-full bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black py-4 rounded-2xl btn-press disabled:opacity-50">
              {starting ? '⏳ 시작 중...' : activeTest ? '🔄 새 시험으로 다시 시작' : '🔥 시험 시작!'}
            </button>
          </>
        )}
      </div>

      {/* 2. 진행 중 시험 현황 + 오늘의 결과 */}
      {cls && tests.length > 0 && (
        <div className="bg-white rounded-3xl card-shadow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-black text-gray-800">
              {activeTest ? '🟢 시험 진행 중' : '⚪ 오늘 시험 종료됨'}
            </p>
            <span className="text-[10px] font-bold text-gray-300">5초마다 자동 갱신</span>
          </div>

          {activeTest && (
            <div className="flex items-center justify-between bg-green-50 border-2 border-green-200 rounded-xl px-3 py-2">
              <p className="text-xs font-bold text-green-700">
                제출 {results.filter((r) => r.testId === activeTest.id).length}명 / 반 전체 {roster.length}명
              </p>
              <button onClick={handleClose}
                className="bg-red-400 hover:bg-red-500 text-white font-black text-xs px-4 py-2 rounded-xl btn-press">
                시험 종료
              </button>
            </div>
          )}

          {/* 반별 통계 */}
          {summary.participants > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-indigo-50 rounded-xl p-3 text-center">
                <p className="font-black text-indigo-600 text-xl">{summary.participants}명</p>
                <p className="text-[10px] font-bold text-indigo-400">오늘 응시</p>
              </div>
              <div className="bg-indigo-50 rounded-xl p-3 text-center">
                <p className="font-black text-indigo-600 text-xl">{Math.round(summary.avgAccuracy * 100)}%</p>
                <p className="text-[10px] font-bold text-indigo-400">평균 정답률</p>
              </div>
            </div>
          )}

          <RankingList ranked={ranked} />

          {summary.mostMissed.length > 0 && (
            <div className="bg-red-50 rounded-2xl p-3">
              <p className="text-xs font-black text-red-600 mb-2">📌 많이 틀린 단어 TOP {summary.mostMissed.length}</p>
              <div className="space-y-1">
                {summary.mostMissed.map((m) => (
                  <div key={m.word} className="flex justify-between text-sm px-2">
                    <span className="font-black text-red-500">{m.word}</span>
                    <span className="font-bold text-gray-500 text-xs">{m.meaning}</span>
                    <span className="font-black text-red-400 text-xs">{m.count}명 틀림</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {cls && tests.length === 0 && (
        <div className="bg-white rounded-3xl card-shadow p-5 text-center text-sm font-bold text-gray-400">
          오늘 이 반의 시험 기록이 아직 없어요
        </div>
      )}
    </div>
  )
}
