import { useState, useEffect, useRef, useMemo } from 'react'
import {
  buildEntranceQuestions, gradeEntranceAnswer, computeTestResult,
  bestResultPerStudent, rankResults, pickMvps, formatSeconds,
} from '../utils/entranceTest'
import {
  fetchTodayTestsForClasses, fetchResultsForTests, submitEntranceResult,
} from '../utils/entranceTestApi'
import {
  getStudentEntranceClassIds, getStudentById,
  getStudentPrimaryTextbook, getStudentUnitId, getStudentAssignedTextbookIds,
  getStudentClassDefaultTextbookIds, resolveTestTextbookIdByClassId,
  inferUnitIdFromTestWords, getClassNameById,
} from '../utils/wordLibrary'
import { selectEntranceTest, resolvePickedTest, TIER_LABEL } from '../utils/entranceTestSelection'
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

// 참고: 대시보드 진입 배너(EntranceTestBanner)는 성능(Phase 3, 2026-07-18)
// 상 이유로 별도 파일(./EntranceTestBanner.jsx)로 분리됐다 — Dashboard.jsx가
// 이 무거운 파일(응시/채점/랭킹 전체 로직)을 정적으로 안 끌고 오게 하기
// 위함. App.jsx는 이 컴포넌트를 React.lazy로 로드한다.

// Reward System V1(2026-08-15, Phase 2) — onExamCompleted는 선택 prop
// (기본 undefined). App.jsx가 studentData.recordExamCompleted를 넘겨준다.
// 서버 저장이 실제로 성공했을 때만 부른다(아래 submitResultToServer의
// try 블록 끝, catch 경로에서는 절대 호출하지 않음).
export default function EntranceTest({ studentId, studentName, onBack, onExamCompleted }) {
  // 2026-08-10 — 배너와 동일하게 "이 학생이 속한 모든 반"(사람 반 ∪ 교재
  // 컨테이너 반)을 조회 기준으로 쓴다. null = 아직 해석 중(초기 phase가
  // 'loading'이므로 그동안 화면은 로딩 상태 그대로).
  const [classIds, setClassIds] = useState(null)
  useEffect(() => {
    let alive = true
    getStudentEntranceClassIds(studentId).then((ids) => { if (alive) setClassIds(ids) })
    return () => { alive = false }
  }, [studentId])

  // phase: loading | none | intro | running | result
  const [phase, setPhase] = useState('loading')
  const [activeTest, setActiveTest] = useState(null)
  const [rows, setRows] = useState([]) // 오늘 결과 전체(랭킹용)
  // 최상위 우선순위 시험이 2개 이상일 때 학생에게 보여줄 후보들
  // ([{ test, tier, textbookId, unitId }]) — entranceTestSelection 참고.
  const [pendingChoices, setPendingChoices] = useState([])
  const chosenIdRef = useRef(null)

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
  // advance()의 문제 사이 피드백 타이머(FEEDBACK_MS) id — 화면 이탈(뒤로가기
  // 등으로 언마운트) 시 정리하지 않으면 이미 떠난 뒤 늦게 발동해 finishTest/
  // submitResultToServer 같은 사이드이펙트가 예기치 않게 실행될 수 있다.
  const feedbackTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(feedbackTimerRef.current), [])
  // 시험용 입력창 자동완성 차단용 무작위 비표준 name(마운트당 1회 고정) —
  // SpellingQuestion과 동일한 조합(autoComplete=off는 Android 키보드가
  // 자주 무시해서, 저장된 폼 프로필 매칭을 깨는 무작위 name을 함께 씀).
  const antiFillNameRef = useRef(`et-${Math.random().toString(36).slice(2, 10)}`)

  // P7 감사(2026-07-16): 5초 폴링과 제출 직후 load()가 겹치면 응답 순서
  // 역전으로 더 오래된 랭킹이 최신 상태를 덮을 수 있었다(다음 폴링에서
  // 자가 수정되긴 하지만, 방금 제출한 내 점수가 잠깐 사라져 보일 수 있음).
  // 요청 번호 가드로 최신 요청의 응답만 반영.
  const loadReqIdRef = useRef(0)
  const load = async () => {
    const reqId = ++loadReqIdRef.current
    const t = await fetchTodayTestsForClasses(classIds)
    const r = await fetchResultsForTests(t.map((x) => x.id))
    if (loadReqIdRef.current !== reqId) return // 더 최신 load가 시작됨 — 버림
    setRows(r)

    // P0(2026-08-12) 예전엔 findActiveTest(t) — created_at이 가장 이른 active
    // 시험 하나를 학생의 실제 학습 교재와 무관하게 골랐다. 두 교재에 배정된
    // 학생은 아침에 열려 종료되지 않은 다른 교재 시험에 영영 가려졌다
    // (entranceTestSelection.js 헤더의 Song 실사고). 이제 교재/유닛 축으로
    // 우선순위를 매기고, 최상위가 동률이면 임의로 고르지 않고 학생이 고른다.
    const takenTestIds = r.filter((x) => x.studentId === studentId).map((x) => x.testId)
    const selection = selectEntranceTest({
      tests: t,
      takenTestIds,
      context: {
        currentTextbookId: getStudentPrimaryTextbook(studentId)?.id || null,
        currentUnitId: getStudentUnitId(studentId),
        assignedTextbookIds: getStudentAssignedTextbookIds(studentId),
        classDefaultTextbookIds: getStudentClassDefaultTextbookIds(studentId),
        resolveTestTextbookId: (test) => resolveTestTextbookIdByClassId(test.classId),
        resolveTestUnitId: (test) => inferUnitIdFromTestWords(test.classId, test.words),
      },
    })
    setPendingChoices(selection.needsChoice ? selection.pending : [])

    // 학생이 선택 UI에서 이미 고른 시험이 아직 유효하면 그 선택을 유지한다
    // (규칙은 순수 함수 resolvePickedTest — 폴링이 학생의 선택을 되돌리거나
    // 시험 도중 다른 시험으로 바꾸지 않게 하는 계약).
    const picked = resolvePickedTest(selection, chosenIdRef.current)
    if (!picked) chosenIdRef.current = null

    setActiveTest(picked)
    if (picked) {
      setPhase((p) => (p === 'running' ? p : 'intro')) // 응시 중 폴링이 상태를 되돌리지 않게
    } else if (selection.needsChoice) {
      setPhase((p) => (p === 'running' ? p : 'choose'))
    } else if (t.length > 0) {
      // 응시 대상이 남지 않음 = 오늘 것을 이미 다 봤거나 전부 종료됨.
      // 기존 정책 그대로 결과(랭킹) 화면. 내 결과는 가장 최근 제출분.
      const own = r
        .filter((x) => x.studentId === studentId)
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0]
      if (own) setMyResult((m) => m || { score: own.score, total: own.total, missed: own.missedWords })
      setPhase((p) => (p === 'running' ? p : 'result'))
    } else {
      setPhase((p) => (p === 'running' ? p : 'none'))
    }
  }

  // 학생이 선택 UI에서 시험을 고르면 그 시험으로 진입한다(폴링이 되돌리지
  // 않도록 ref에 기억 — 위 load()가 매 폴링마다 이 선택을 존중한다).
  const pickTest = (test) => {
    chosenIdRef.current = test.id
    setActiveTest(test)
    setPendingChoices([])
    setPhase('intro')
  }

  useEffect(() => {
    if (classIds === null) return // 아직 반 id 해석 중 — phase는 'loading' 유지
    if (classIds.length === 0) { setPhase('none'); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIds, studentId])

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

  // (2026-07-19, P1 보안 감사 후속) 서버 재검증 도입 — score/total/missedWords
  // 대신 실제로 푼 문제(word+direction)와 입력한 답(answers)만 보낸다. 화면에
  // 이미 표시 중인 result(로컬 계산)는 그대로 두고(즉시 결과 UX 불변), 저장은
  // questionsRef/answersRef(시험 시작 시 고정된 원본)를 그대로 서버에 넘겨
  // 서버가 entrance_tests.words로 재채점하게 한다 — 클라이언트 점수를
  // 신뢰하지 않는다.
  const submitResultToServer = async (result) => {
    setSaveError(null)
    try {
      await submitEntranceResult(activeTest.id, studentId, {
        questions: questionsRef.current,
        answers: answersRef.current,
        durationSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
      })
      load() // 저장 성공 -> 랭킹 즉시 갱신
      // Reward System V1 — 서버 저장이 실제로 확정된 시점에만 보상(테스트
      // 재시도로 여러 번 호출돼도 testId별 idempotency_key라 재지급 없음).
      onExamCompleted?.(activeTest.id)
    } catch (err) {
      // 점수는 로컬 state에 이미 있어서 학생이 결과를 못 보는 일은 없음 —
      // 저장만 실패한 것이므로 재시도 버튼을 보여준다.
      // P8(2026-08-13): 서버/DB 원본 에러 문자열(Supabase 메시지, HTTP 코드,
      // UUID 등)은 학생에게 노출하지 않는다 — 콘솔에만 남기고 화면에는
      // 아이가 읽을 수 있는 문구만. 원인 구분은 오프라인 여부 정도만 한다.
      console.warn('[entranceTest] 결과 저장 실패(재시도 버튼 표시):', err?.message || err)
      setSaveError(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? '인터넷 연결이 끊겨서 점수를 저장하지 못했어요. 연결을 확인하고 다시 눌러주세요.'
          : '점수 저장에 실패했어요. 아래 버튼을 눌러 다시 시도해주세요.'
      )
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
    clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = setTimeout(() => {
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
      <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 홈으로</button>
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

  // 우선순위가 같은 시험이 2개 이상 — 임의로 고르지 않고 학생이 고른다.
  // (entranceTestSelection.js의 needsChoice) 어느 교재 시험인지 이름으로
  // 보여줘야 학생이 자기가 공부한 쪽을 고를 수 있다.
  if (phase === 'choose') {
    return (
      <div className="min-h-screen p-4">{header}
        <div className="max-w-lg mx-auto bg-white rounded-3xl card-shadow p-6 space-y-3">
          <div className="text-center">
            <div className="text-5xl mb-2">🤔</div>
            <p className="font-black text-gray-800">오늘 볼 수 있는 시험이 여러 개예요</p>
            <p className="text-sm text-gray-500 mt-1">공부한 교재의 시험을 골라주세요!</p>
          </div>
          {pendingChoices.map(({ test, tier }) => {
            const tbName = getClassNameById(test.classId) || '교재'
            return (
              <button key={test.id} onClick={() => pickTest(test)}
                className="w-full text-left border-2 border-rose-200 hover:border-rose-500 rounded-2xl px-4 py-3 bg-white transition">
                <p className="font-black text-gray-800">{tbName}</p>
                <p className="text-xs font-bold text-rose-500 mt-0.5">{TIER_LABEL[tier]}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {Math.min(test.questionCount, test.words.length)}문제 · {Math.round(test.timeLimitSeconds / 60)}분
                </p>
              </button>
            )
          })}
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
                  autoFocus autoCapitalize="off" autoCorrect="off" spellCheck="false" autoComplete="off"
                  name={antiFillNameRef.current} inputMode="text" lang={q.direction === 'en2kr' ? 'ko' : 'en'}
                  onPaste={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}
                  className="w-full border-2 border-rose-200 rounded-xl px-4 py-4 text-xl font-black text-center focus:outline-none focus:border-rose-500" />
                <button onClick={() => input.trim() && advance(input)} disabled={!input.trim()}
                  className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white font-black py-4 rounded-2xl btn-press text-lg">
                  확인
                </button>
                <button onClick={() => advance('')}
                  className="w-full text-gray-400 font-bold text-sm btn-press py-3">
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
