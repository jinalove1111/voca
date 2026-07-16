import { useState, useEffect, useRef, useMemo } from 'react'
import {
  buildEntranceQuestions, gradeEntranceAnswer, computeTestResult,
  bestResultPerStudent, rankResults, pickMvps, formatSeconds,
} from '../utils/entranceTest'
import {
  fetchTodayTests, findActiveTest, fetchResultsForTests, submitEntranceResult,
} from '../utils/entranceTestApi'
import { getStudentClassId, getStudentById } from '../utils/wordLibrary'
import { playSuccessSound } from '../utils/speech'

// ── 입실 단어시험 (학생 화면) ────────────────────────────────────────────
// 수업 시작과 동시에 반 전체가 각자 폰으로 참여하는 시험. 교사가 관리자
// 화면에서 시험을 시작하면 Dashboard의 EntranceTestBanner가 진입점을 열고,
// 이 화면이 응시(제한시간/진행률/자동 채점) -> 즉시 결과 -> 결과 자동 저장
// (student_id 기준) -> 실시간 반별 랭킹/오늘의 VIP까지 담당한다.
//
// 안전 원칙: supabase_v1_8 테이블이 아직 없으면 entranceTestApi의 조회가
// 전부 빈 값으로 폴백 -> 배너 자체가 안 뜨고, 이 화면에 직접 들어와도
// "오늘은 시험이 없어요"만 보임(크래시/콘솔 에러 없음).
//
// 실시간성: 폴링(랭킹 화면이 보일 때만 5초 간격, 화면을 벗어나면 즉시
// 중단). Supabase Realtime은 대시보드에서 publication 활성화가 필요해
// 도입하지 않음 — entranceTestApi.js 상단 주석 참고.
//
// 참고: 한 줄 말줄임에 Tailwind 단축 클래스 대신 풀어 쓴 조합(overflow-
// hidden text-ellipsis whitespace-nowrap)을 쓴다 — 동작은 완전히 동일.
const ELLIPSIS = 'overflow-hidden text-ellipsis whitespace-nowrap'
const RANKING_POLL_MS = 5000
const FEEDBACK_MS = 900 // 문제 사이 정답/오답 피드백 표시 시간

const RANK_EMOJI = { 1: '🥇', 2: '🥈', 3: '🥉' }

// 랭킹 리스트 — 결과 화면과 교사 화면(EntranceTestAdmin)이 같은 모양을 재사용.
export function RankingList({ ranked, myStudentId }) {
  if (!ranked || ranked.length === 0) {
    return <p className="text-center text-sm text-gray-400 font-bold py-4">아직 제출한 친구가 없어요</p>
  }
  const mvps = pickMvps(ranked)
  return (
    <div className="space-y-3">
      {mvps.length > 0 && (
        <div className="bg-gradient-to-br from-amber-300 to-yellow-500 rounded-2xl p-4 text-center">
          <p className="text-3xl mb-1">👑</p>
          <p className="text-white font-black text-sm drop-shadow">오늘의 VIP</p>
          <p className="text-white font-black text-xl drop-shadow">
            {mvps.map((m) => m.name || '(알 수 없음)').join(' · ')}
          </p>
        </div>
      )}
      <div className="space-y-1">
        {ranked.map((r) => {
          const mine = myStudentId && r.studentId === myStudentId
          return (
            <div key={r.studentId}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${mine ? 'bg-purple-100 border-2 border-purple-300' : 'bg-gray-50'}`}>
              <span className="w-8 text-center font-black text-lg">
                {RANK_EMOJI[r.rank] || <span className="text-sm text-gray-400">{r.rank}</span>}
              </span>
              <span className={`flex-1 font-black text-sm ${ELLIPSIS} ${mine ? 'text-purple-700' : 'text-gray-700'}`}>
                {r.name || '(알 수 없음)'}{mine && ' (나)'}
              </span>
              <span className="font-black text-sm text-gray-600">{r.score}/{r.total}</span>
              <span className="text-xs font-bold text-gray-400 w-10 text-right">{Math.round(r.accuracy * 100)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 결과 행 배열 -> 이름 붙은 랭킹 (학생당 오늘 최고 기록 1개만)
export function toRanked(rows) {
  const withNames = bestResultPerStudent(rows).map((r) => ({
    ...r,
    name: getStudentById(r.studentId)?.name || '(알 수 없음)',
  }))
  return rankResults(withNames)
}

export default function EntranceTest({ studentId, studentName, onBack }) {
  const classId = getStudentClassId(studentId)

  // phase: loading | none | intro | running | result
  const [phase, setPhase] = useState('loading')
  const [activeTest, setActiveTest] = useState(null)
  const [rows, setRows] = useState([]) // 오늘 결과 전체(랭킹용)

  // 응시 진행 상태
  const [questions, setQuestions] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState(null) // { correct, answer } — 문제 사이 잠깐 표시
  const [remaining, setRemaining] = useState(0)
  const [myResult, setMyResult] = useState(null) // 방금 본(또는 이미 제출된) 내 결과
  const [saveError, setSaveError] = useState(null)

  const answersRef = useRef([])
  const questionsRef = useRef([])
  const deadlineRef = useRef(0)
  const startedAtRef = useRef(0)
  const finishedRef = useRef(false)
  const inputRef = useRef(null)

  // P7 감사(2026-07-16): 5초 폴링과 제출 직후 load()가 겹치면 응답 순서
  // 역전으로 더 오래된 랭킹이 최신 상태를 덮을 수 있었다(다음 폴링에서
  // 자가 수정되긴 하지만, 방금 제출한 내 점수가 잠깐 사라져 보일 수 있음).
  // 요청 번호 가드로 최신 요청의 응답만 반영.
  const loadReqIdRef = useRef(0)
  const load = async () => {
    const reqId = ++loadReqIdRef.current
    const t = await fetchTodayTests(classId)
    const r = await fetchResultsForTests(t.map((x) => x.id))
    if (loadReqIdRef.current !== reqId) return // 더 최신 load가 시작됨 — 버림
    setRows(r)
    const active = findActiveTest(t)
    setActiveTest(active)
    const ownActive = active ? r.find((x) => x.testId === active.id && x.studentId === studentId) : null
    if (active && !ownActive) {
      setPhase((p) => (p === 'running' ? p : 'intro')) // 응시 중 폴링이 상태를 되돌리지 않게
    } else if (t.length > 0) {
      if (ownActive) setMyResult((m) => m || { score: ownActive.score, total: ownActive.total, missed: ownActive.missedWords })
      setPhase((p) => (p === 'running' ? p : 'result'))
    } else {
      setPhase((p) => (p === 'running' ? p : 'none'))
    }
  }

  useEffect(() => {
    if (!classId) { setPhase('none'); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, studentId])

  // 결과(랭킹) 화면에서만 폴링 — 탭이 백그라운드면 건너뛰어 배터리/API 절약.
  useEffect(() => {
    if (phase !== 'result') return undefined
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, RANKING_POLL_MS)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 시험 진행 타이머 — deadline 기준으로 남은 초 표시, 0이 되면 자동 제출.
  useEffect(() => {
    if (phase !== 'running') return undefined
    const tick = setInterval(() => {
      const left = Math.ceil((deadlineRef.current - Date.now()) / 1000)
      setRemaining(Math.max(0, left))
      if (left <= 0) finishTest()
    }, 250)
    return () => clearInterval(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 50)

  const startTest = () => {
    const qs = buildEntranceQuestions(activeTest.words, {
      count: activeTest.questionCount,
      direction: activeTest.direction,
    })
    if (qs.length === 0) return // 단어 스냅샷이 비어있으면 시작 불가(관리자 화면이 애초에 못 만들게 막음)
    questionsRef.current = qs
    answersRef.current = []
    finishedRef.current = false
    startedAtRef.current = Date.now()
    deadlineRef.current = Date.now() + activeTest.timeLimitSeconds * 1000
    setQuestions(qs)
    setQIdx(0)
    setInput('')
    setFeedback(null)
    setRemaining(activeTest.timeLimitSeconds)
    setSaveError(null)
    setPhase('running')
    focusInput()
  }

  const submitResultToServer = async (result) => {
    setSaveError(null)
    try {
      await submitEntranceResult(activeTest.id, studentId, {
        score: result.score,
        total: result.total,
        missedWords: result.missed,
        durationSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
      })
      load() // 저장 성공 -> 랭킹 즉시 갱신
    } catch (err) {
      // 점수는 로컬 state에 이미 있어서 학생이 결과를 못 보는 일은 없음 —
      // 저장만 실패한 것이므로 재시도 버튼을 보여준다.
      setSaveError(err.message || String(err))
    }
  }

  // 시험 종료(마지막 문제 제출 또는 시간 초과) — 중복 호출 가드 필수:
  // 타이머 tick과 마지막 문제 제출이 거의 동시에 올 수 있다.
  const finishTest = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    const result = computeTestResult(questionsRef.current, answersRef.current)
    setMyResult(result)
    setPhase('result')
    submitResultToServer(result)
  }

  const advance = (answerText) => {
    if (feedback || finishedRef.current) return // 피드백 표시 중 중복 제출 방지
    const q = questionsRef.current[qIdx]
    answersRef.current[qIdx] = answerText
    const correct = gradeEntranceAnswer(q, answerText)
    if (correct) playSuccessSound()
    setFeedback({ correct, answer: q.answer })
    setTimeout(() => {
      setFeedback(null)
      setInput('')
      if (qIdx + 1 < questionsRef.current.length) {
        setQIdx(qIdx + 1)
        focusInput()
      } else {
        finishTest()
      }
    }, FEEDBACK_MS)
  }

  const ranked = useMemo(() => toRanked(rows), [rows])

  const header = (
    <div className="max-w-lg mx-auto pt-2 mb-4 flex items-center gap-3">
      <button onClick={onBack} className="text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 홈으로</button>
      <h1 className="text-xl font-black text-gray-800">🏁 입실 단어시험</h1>
    </div>
  )

  if (phase === 'loading') {
    return (
      <div className="min-h-screen p-4">{header}
        <div className="max-w-lg mx-auto bg-white rounded-3xl card-shadow p-8 text-center">
          <div className="text-4xl mb-2 animate-bounce">📝</div>
          <p className="text-gray-400 font-bold">시험 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (phase === 'none') {
    return (
      <div className="min-h-screen p-4">{header}
        <div className="max-w-lg mx-auto bg-white rounded-3xl card-shadow p-8 text-center">
          <div className="text-5xl mb-3">😴</div>
          <p className="font-black text-gray-700">오늘은 아직 입실시험이 없어요</p>
          <p className="text-sm text-gray-400 mt-1">선생님이 시험을 시작하면 홈 화면에 알려드릴게요!</p>
        </div>
      </div>
    )
  }

  if (phase === 'intro') {
    const dirLabel = { en2kr: '영어 → 한글 뜻', kr2en: '한글 뜻 → 영어', random: '랜덤 (영↔한 섞어서)' }[activeTest.direction] || activeTest.direction
    const count = Math.min(activeTest.questionCount, activeTest.words.length)
    return (
      <div className="min-h-screen p-4">{header}
        <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
          <div className="bg-gradient-to-br from-rose-500 to-orange-500 rounded-3xl p-6 text-white text-center card-shadow">
            <div className="text-5xl mb-2">🚨</div>
            <h2 className="text-2xl font-black">오늘의 입실시험이 있어요!</h2>
            <p className="text-rose-100 text-sm mt-1">{studentName} 준비됐나요?</p>
          </div>
          <div className="bg-white rounded-3xl card-shadow p-5 space-y-2">
            <div className="flex justify-between text-sm font-bold text-gray-600"><span>문항 수</span><span className="font-black text-gray-800">{count}문제</span></div>
            <div className="flex justify-between text-sm font-bold text-gray-600"><span>출제 방향</span><span className="font-black text-gray-800">{dirLabel}</span></div>
            <div className="flex justify-between text-sm font-bold text-gray-600"><span>제한 시간</span><span className="font-black text-gray-800">{formatSeconds(activeTest.timeLimitSeconds)}</span></div>
            <p className="text-xs text-gray-400 pt-2">시작하면 멈출 수 없어요. 답을 입력하고 확인을 누르면 다음 문제로 넘어가요. 시간이 다 되면 자동으로 제출돼요!</p>
          </div>
          <button onClick={startTest}
            className="w-full bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black py-5 rounded-3xl text-xl btn-press card-shadow">
            🔥 시험 시작!
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'running') {
    const q = questions[qIdx]
    const urgent = remaining <= 10
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-lg mx-auto space-y-4">
          {/* 진행률 + 타이머 */}
          <div className="flex items-center justify-between pt-2">
            <span className="font-black text-gray-600 text-sm">{qIdx + 1} / {questions.length}</span>
            <span className={`font-black text-lg px-3 py-1 rounded-xl ${urgent ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-purple-100 text-purple-600'}`}>
              ⏱ {formatSeconds(remaining)}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-rose-400 to-orange-400 rounded-full transition-all duration-300"
              style={{ width: `${((qIdx + (feedback ? 1 : 0)) / questions.length) * 100}%` }} />
          </div>

          {/* 문제 카드 */}
          <div className="bg-white rounded-3xl card-shadow p-6 space-y-4">
            <p className="text-center text-gray-400 font-bold text-xs">
              {q.direction === 'en2kr' ? '이 단어의 뜻을 한글로 쓰세요' : '이 뜻의 영어 단어를 쓰세요'}
            </p>
            <div className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-6 text-center">
              <p className="text-3xl font-black text-gray-800 break-words">{q.prompt}</p>
            </div>

            {feedback ? (
              <div className={`rounded-2xl p-4 text-center animate-slide-up ${feedback.correct ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
                {feedback.correct ? (
                  <p className="text-green-600 font-black text-xl">⭕ 정답!</p>
                ) : (
                  <>
                    <p className="text-red-500 font-black text-xl">❌ 아쉬워요</p>
                    <p className="text-red-600 font-bold text-sm mt-1 break-words">정답: {feedback.answer}</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && input.trim()) advance(input) }}
                  placeholder={q.direction === 'en2kr' ? '한글로 뜻 입력' : '영어로 입력'}
                  autoFocus autoCapitalize="off" autoCorrect="off" spellCheck="false"
                  className="w-full border-2 border-rose-200 rounded-xl px-4 py-4 text-xl font-black text-center focus:outline-none focus:border-rose-500" />
                <button onClick={() => input.trim() && advance(input)} disabled={!input.trim()}
                  className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white font-black py-4 rounded-2xl btn-press text-lg">
                  확인
                </button>
                <button onClick={() => advance('')}
                  className="w-full text-gray-400 font-bold text-sm btn-press py-1">
                  모르겠어요, 다음 문제 →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // phase === 'result' — 내 결과(있으면) + 오늘의 반 랭킹/VIP
  const pct = myResult && myResult.total > 0 ? Math.round((myResult.score / myResult.total) * 100) : null
  return (
    <div className="min-h-screen p-4 pb-8">{header}
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        {myResult && (
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white text-center card-shadow">
            <p className="text-indigo-200 text-sm font-bold">내 점수</p>
            <p className="text-5xl font-black my-1">{myResult.score}<span className="text-2xl text-indigo-200"> / {myResult.total}</span></p>
            {pct !== null && <p className="font-black text-indigo-100">{pct}점{pct === 100 ? ' — 만점! 🎉' : ''}</p>}
          </div>
        )}

        {saveError && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-center">
            <p className="text-red-500 font-bold text-sm mb-2">점수 저장에 실패했어요 (점수는 화면에 안전하게 남아있어요)</p>
            <p className="text-xs text-red-400 mb-2 break-all">{saveError}</p>
            <button onClick={() => submitResultToServer(myResult)}
              className="bg-red-400 hover:bg-red-500 text-white font-black px-6 py-2 rounded-xl btn-press text-sm">
              다시 저장하기
            </button>
          </div>
        )}

        {myResult && myResult.missed && myResult.missed.length > 0 && (
          <div className="bg-white rounded-3xl card-shadow p-5">
            <p className="font-black text-gray-700 text-sm mb-2">📌 틀린 단어 — 꼭 다시 보기!</p>
            <div className="space-y-1">
              {myResult.missed.map((m, i) => (
                <div key={i} className="flex justify-between bg-red-50 rounded-xl px-3 py-2 text-sm">
                  <span className="font-black text-red-600">{m.word}</span>
                  <span className={`font-bold text-gray-600 ml-3 ${ELLIPSIS}`}>{m.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-gray-800">🏆 오늘의 반 랭킹</p>
            <span className="text-[10px] font-bold text-gray-300">5초마다 자동 갱신</span>
          </div>
          <RankingList ranked={ranked} myStudentId={studentId} />
          <p className="text-center text-[10px] text-gray-300 mt-3">랭킹은 오늘 하루만 보여요 — 내일 다시 도전!</p>
        </div>

        <button onClick={onBack} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-black py-4 rounded-2xl btn-press">
          홈으로 돌아가기
        </button>
      </div>
    </div>
  )
}

// ── Dashboard 진입 배너 ──────────────────────────────────────────────────
// 오늘 이 반의 시험이 하나라도 있으면 표시: active면 "참여하기"(빨강 강조),
// 종료됐으면 "오늘의 랭킹 보기"(차분한 톤). 테이블이 없거나 시험이 없으면
// 아무것도 렌더하지 않음(기존 대시보드에 영향 0). 20초 간격 폴링은 이
// 배너가 마운트된 동안(=대시보드에 있는 동안)만, 탭이 보일 때만 돈다.
const BANNER_POLL_MS = 20000

export function EntranceTestBanner({ studentId, onGo }) {
  const classId = getStudentClassId(studentId)
  const [tests, setTests] = useState([])

  useEffect(() => {
    if (!classId) return undefined
    let alive = true
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const t = await fetchTodayTests(classId)
      if (alive) setTests(t)
    }
    check()
    const iv = setInterval(check, BANNER_POLL_MS)
    return () => { alive = false; clearInterval(iv) }
  }, [classId])

  if (tests.length === 0) return null
  const active = findActiveTest(tests)

  if (active) {
    return (
      <button onClick={() => onGo('entranceTest')}
        className="w-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-3xl p-5 text-white text-left card-shadow btn-press animate-pulse">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🚨</span>
          <div className="flex-1">
            <p className="font-black text-lg leading-tight">오늘의 입실시험이 시작됐어요!</p>
            <p className="text-rose-100 text-xs mt-0.5">지금 바로 참여하세요</p>
          </div>
          <span className="font-black text-xl">→</span>
        </div>
      </button>
    )
  }
  return (
    <button onClick={() => onGo('entranceTest')}
      className="w-full bg-white border-2 border-amber-200 rounded-3xl p-4 text-left card-shadow btn-press">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🏆</span>
        <div className="flex-1">
          <p className="font-black text-gray-800 text-sm">오늘의 입실시험 랭킹</p>
          <p className="text-gray-400 text-xs">우리 반 VIP는 누구일까요?</p>
        </div>
        <span className="font-black text-amber-500">보기 →</span>
      </div>
    </button>
  )
}
