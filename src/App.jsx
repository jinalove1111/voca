import React, { useState, useEffect, useMemo } from 'react'
import StudentSelect from './components/StudentSelect'
import Dashboard from './components/Dashboard'
import WordBrowser from './components/WordBrowser'
import WordDetail from './components/WordDetail'
import QuizGame from './components/QuizGame'
import LevelUpMission from './components/LevelUpMission'
import DiaryPage from './components/DiaryPage'
import StudyCalendar from './components/StudyCalendar'
import BalloonGame from './components/BalloonGame'
import FishingGame from './components/FishingGame'
import PizzaGame from './components/PizzaGame'
import TrainGame from './components/TrainGame'
import BonusChoiceScreen from './components/BonusChoiceScreen'
import GiftReveal from './components/GiftReveal'
import SpellingReview from './components/SpellingReview'
import SpellingSessionResult from './components/SpellingSessionResult'
import { useStudent } from './hooks/useStudent'
import { pickNextGame } from './utils/matchGame'
import { assignDirections } from './utils/entranceTest'
import { logSpellingReview } from './utils/spellingReviewApi'
import { getStudentWords, initWordLibrary, refreshWordLibrary, refreshStudents, refreshClassSettings, getStudentById, getStudentClass, getStudentUnit, getStudentUnitId, setStudentUnit, getClassSettings, filterWordsByScope, getStudentClassAssignments, setPrimaryAssignment } from './utils/wordLibrary'
import { getSpeechRate, setSpeechRate, unlockAudio, primeSpeech, getMicStream } from './utils/speech'

// 2026-07-10 성능 최적화: AdminScreen은 xlsx(엑셀 업로드)를 포함해 학생은
// 절대 안 쓰는 무거운 라이브러리를 물고 있는데, 정적 import라 학생용
// 메인 번들에도 항상 같이 딸려가고 있었다(매일 앱을 여는 학생 전원이
// 한 번도 안 쓸 관리자 코드를 매번 다운로드). React.lazy로 바꿔서
// "⚙️ 관리자" 버튼을 실제로 눌렀을 때만 그 코드가 로드되게 분리 —
// AdminScreen 자체의 동작/로직은 전혀 안 바뀜, 로딩 시점만 바뀜.
const AdminScreen = React.lazy(() => import('./components/AdminScreen'))
// 학부모 화면도 같은 이유로 lazy — 학생/관리자 어느 쪽도 매일 안 쓰는
// 코드를 학생 메인 번들에 얹지 않는다.
const ParentScreen = React.lazy(() => import('./components/ParentScreen'))
// 입실시험 응시 화면도 같은 이유로 lazy — 학생이 홈 화면 배너를 보는 것과
// 별개로, "참여하기"를 눌러 실제로 들어갈 때만 로드(Phase 3 성능,
// 2026-07-18). 배너는 이제 별도 파일(EntranceTestBanner.jsx)이라 이 lazy
// 전환이 실제로 메인 번들에서 코드를 빼낸다(전엔 Dashboard의 정적 import가
// 같은 파일을 끌고 와서 lazy로 감싸도 효과가 없었음).
const EntranceTest = React.lazy(() => import('./components/EntranceTest'))

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  // P0(2026-07-17) — 프로덕션에서는 내부 에러 문구를 학생에게 그대로
  // 노출하지 않는다(아래 render). 대신 진단에 필요한 정보는 전부 콘솔에
  // 남긴다. 주의: PIN/pin_hash는 어떤 형태로도 절대 로그 금지 — 여기서
  // 읽는 것은 세션의 student id뿐.
  componentDidCatch(error, info) {
    let studentId = null
    try { studentId = JSON.parse(localStorage.getItem(SESSION_KEY))?.id || null } catch { /* 세션 파싱 실패는 무시 */ }
    console.error('[AppErrorBoundary] 앱 크래시', {
      message: error?.message || String(error),
      stack: error?.stack || null,
      componentStack: info?.componentStack || null,
      studentId,
      href: typeof location !== 'undefined' ? location.href : null,
      mode: import.meta.env.MODE,
      timestamp: new Date().toISOString(),
    })
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-lg">
            <div className="text-5xl mb-4">😵</div>
            <h2 className="font-black text-xl text-gray-800 mb-2">앱 오류가 발생했어요</h2>
            <p className="text-sm text-gray-500 mb-6">
              데이터를 불러오는 중 문제가 발생했어요.<br />다시 시도하거나 로그아웃 후 로그인해주세요.
            </p>
            {import.meta.env.DEV && (
              <p className="text-xs text-red-400 mb-6 break-all bg-red-50 p-3 rounded-xl">{String(this.state.error)}</p>
            )}
            <button
              onClick={() => {
                // 세션 정리 후 전체 리로드 — setState만으로 복귀하면 App의
                // student 상태가 그대로 남아 같은 크래시를 즉시 반복할 수
                // 있다. 리로드가 유일하게 확실한 초기화.
                try { localStorage.removeItem('paulEasyVoca_currentStudent') } catch { /* noop */ }
                window.location.reload()
              }}
              className="w-full bg-purple-500 text-white font-black py-3 rounded-2xl mb-2"
            >
              로그아웃 후 다시 시작
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="w-full border-2 border-gray-200 text-gray-500 font-bold py-3 rounded-2xl"
            >
              그냥 다시 시도
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// 0.6/0.8/1.0(40% 구간)에서는 체감 속도차가 잘 안 느껴진다는 피드백 —
// 구간을 넓혀서(0.5~1.2, 140%) 세 단계가 확실히 다르게 들리도록 조정.
const RATE_OPTIONS = [
  { label: '🐢 천천히', value: 0.5 },
  { label: '🙂 보통',   value: 0.85 },
  { label: '🚀 빠르게', value: 1.2 },
]

function SpeedBtn() {
  const [rate, setRate] = useState(() => getSpeechRate())
  const cur = RATE_OPTIONS.find(o => o.value === rate) || RATE_OPTIONS[0]
  const next = () => {
    const idx = RATE_OPTIONS.findIndex(o => o.value === rate)
    const n = RATE_OPTIONS[(idx + 1) % RATE_OPTIONS.length]
    setSpeechRate(n.value)
    setRate(n.value)
  }
  return (
    <button onClick={next}
      className="fixed bottom-5 right-5 z-40 bg-white border-2 border-purple-200 text-purple-600 font-black text-xs px-3 py-2 rounded-2xl card-shadow btn-press hover:border-purple-400 transition-colors">
      {cur.label}
    </button>
  )
}

// P0(2026-07-15): studentId(식별자, Supabase students.id)와 studentName
// (표시/legacy 마이그레이션용)을 따로 받는다 — 이름만으로는 더 이상 학생을
// 유일하게 식별할 수 없다(동명이인 허용).
function AppInner({ studentId, studentName, onLogout }) {
  const [screen, setScreen]         = useState('dashboard')
  const [selectedWord, setWord]     = useState(null)
  const [selectedWordIdx, setWordIdx] = useState(0)
  const [pendingNextIdx, setPendingNextIdx] = useState(0)
  // Whether the balloon game was entered mid-lesson (bonus checkpoint) vs.
  // directly from the Dashboard nav button — changes what its result
  // screen offers ("다음 단어 공부하기" vs. just "홈으로"). Always false
  // again once back on the dashboard, so a later direct-from-dashboard
  // play never inherits a stale lesson context.
  const [balloonFromLesson, setBalloonFromLesson] = useState(false)
  useEffect(() => { if (screen === 'dashboard') setBalloonFromLesson(false) }, [screen])
  const [currentGameId, setCurrentGameId] = useState('balloon')
  const [refreshTick, setRefreshTick] = useState(0)
  // 학습 모드(듣기/말하기/쓰기/종합) — 세션 동안만 유지, 매번 앱을 새로
  // 열면 종합으로 돌아옴(기존 기본 동작과 가장 가까운 모드).
  const [studyMode, setStudyMode] = useState('comprehensive')
  // v1.5 "학습 범위"(Skip 기능) — 전체/모르는 단어만/안 본 단어만/복습
  // 단어만. studyMode(HOW: 듣기/말하기/쓰기/종합)와는 완전히 별개 축이라
  // 별도 상태로 관리 — 마찬가지로 세션 동안만 유지.
  const [studyScope, setStudyScope] = useState('all')
  const studentData                 = useStudent(studentId, studentName)
  const { cleared, answerMission, missions, addStars, markPronunciationOk, pendingGift, dismissGift, lastGamePlayed, setLastGamePlayed, recordGamePlayed, spellingWrongToday, clearSpellingReviewWord, wordStatus, setWordKnown, setWordUnknown, spellingReviewQueue, setLastTextbookClassId } = studentData

  // 선물상자를 닫은 직후, 오늘 틀린 스펠링 단어나 영구 복습 대기열
  // (Writing MVP, 2026-07-20 — 적어도 하루 전에 놓친 단어)이 남아있으면
  // 자동으로 "틀린 단어 복습"을 시작 — 맞을 때까지 반복(SpellingReview 참고).
  const handleDismissGift = () => {
    dismissGift()
    if (spellingWrongToday.length > 0 || spellingReviewQueue.length > 0) setScreen('spellingReview')
  }

  // Rotates through the 4 mini-games, never repeating whichever was played
  // last (across the whole app, not just this checkpoint) — used both by
  // the mid-lesson bonus checkpoint and the Dashboard's direct game button.
  const startRandomGame = () => {
    const game = pickNextGame(lastGamePlayed)
    setCurrentGameId(game.id)
    setLastGamePlayed(game.id)
    recordGamePlayed(game.id)
    setScreen('game')
  }
  const GAME_COMPONENTS = { balloon: BalloonGame, fishing: FishingGame, pizza: PizzaGame, train: TrainGame }
  const CurrentGame = GAME_COMPONENTS[currentGameId] || BalloonGame
  const classWords                  = useMemo(() => {
    try { return getStudentWords(studentId) || [] } catch { return [] }
  }, [studentId, refreshTick])
  // v2.1 — 지금 보고 있는 유닛의 실제 DB id(해석 결과). 유닛별 "이어서
  // 학습" 위치의 키로만 쓰며, null이어도(캐시 미비/마이그레이션 전) 전부
  // 기존 전역 lastWordIndex 동작으로 폴백된다.
  const currentUnitId = useMemo(() => {
    try { return getStudentUnitId(studentId) } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, refreshTick])
  // v2.1 — Dashboard 유닛 선택기: 전환은 setStudentUnit(id 우선 저장) →
  // refreshTick으로 단어 목록/설정 재계산. 진행도 레코드(useStudent)는
  // 아무것도 건드리지 않는다 — 별/스트릭/스티커/오늘 미션이 유닛 전환으로
  // 리셋되지 않는 구조적 보장.
  const handleUnitSwitch = async (unitName) => {
    await setStudentUnit(studentId, unitName)
    setRefreshTick((t) => t + 1)
  }
  // v2.9(2026-07-21, decision 0004 다중 교재) — 학생의 전체 교재 배정
  // 목록. getStudentClassAssignments는 테이블 부재/배정 0~1건 모두 "합성
  // 단일 배정" 1개로 안전하게 폴백하므로(wordLibrary.js 주석 참고), 이
  // state는 오늘 마이그레이션 실행 전(그리고 실행 후에도 아직 두 번째
  // 교재를 안 받은) 학생 전원에게 항상 length===1로 남는다 —
  // TextbookSelector는 length<=1이면 스스로 아무것도 렌더하지 않는다
  // (요구사항 2, 7 — 기존 학생 화면 변화 0). 로그인 직후(studentId 변경
  // 시) 1회 fetch하며, 이 호출이 getStudentWords의 classId override
  // 검증용 캐시도 함께 채운다(현재는 override를 쓰지 않지만 — 아래
  // handleTextbookSwitch 주석 참고 — wordLibrary.js의 명시된 계약이라
  // 그대로 지킨다).
  const [textbookAssignments, setTextbookAssignments] = useState([])
  useEffect(() => {
    let cancelled = false
    getStudentClassAssignments(studentId).then((list) => {
      if (!cancelled) setTextbookAssignments(list)
    }).catch(() => { /* 조회 실패는 조용히 무시 — 선택기가 안 보일 뿐 학습 화면엔 영향 없음(이 파일 전체의 fail-open 원칙) */ })
    return () => { cancelled = true }
  }, [studentId])
  // 교재 선택기(TextbookSelector, Dashboard.jsx) → setPrimaryAssignment(주
  // 교재를 서버에 영구 전환) → 배정 목록/단어 목록 재조회.
  //
  // 설계 선택(구현 세션, docs/agent-decisions/0004-multi-textbook-
  // architecture.md 근거): getStudentWords의 classId override(임시 조회,
  // students.class_id는 안 바뀜)가 아니라 setPrimaryAssignment(영구 전환)를
  // 쓴다 — Current Unit/숙제/게임화 스위치/입실시험 배너/쓰기시험 설정 등
  // classWords/currentUnitId 말고도 15개 이상의 기존 호출부가 전부
  // students.class_id(주 반) 하나만 읽는다. override만 쓰면 단어 목록만
  // 선택한 교재를 따라가고 나머지 화면은 계속 이전 교재를 가리켜(요구사항
  // 6 위반) 반쪽짜리로 일관성이 깨진다. setPrimaryAssignment는 단 한 번의
  // 쓰기로 이 모든 기존 호출부를 자동으로 같은 교재에 맞춰준다(코드 변경
  // 0 — wordLibrary.js "5) 쓰기 — 주 교재 전환" 주석에 명시된 설계 의도
  // 그대로). handleUnitSwitch와 마찬가지로 진행도 레코드(별/스트릭/스티커/
  // 오늘 미션/XP/코인/티켓)는 전혀 건드리지 않는다 — 그 자산들은 계정
  // 전역이라 교재 전환으로 리셋되지 않는다(요구사항 6).
  const handleTextbookSwitch = async (classId) => {
    await setPrimaryAssignment(studentId, classId)
    // 요구사항 5 — "마지막으로 쓴 교재"를 로컬 진행도 블롭에 기억
    // (ticketLedger와 동일 패턴, 새 DB 컬럼 없음). 서버(students.class_id/
    // is_primary)가 이미 권위 있는 값이므로 이 호출이 실패해도(예: 저장
    // 공간 부족) 기능은 전혀 깨지지 않는다 — 다음 로그인 첫 렌더 힌트용.
    setLastTextbookClassId(classId)
    const list = await getStudentClassAssignments(studentId)
    setTextbookAssignments(list)
    setRefreshTick((t) => t + 1)
  }
  // v1.5 이번 세션에서 실제로 공부할 단어 목록 — studyScope에 따라
  // classWords(반 전체 단어, 퀴즈 오답 보기 생성 등에는 항상 이 전체
  // 목록을 그대로 씀)를 걸러낸 서브셋. "복습 단어만"은 이 Skip 기능의
  // '모르겠어요' 표시뿐 아니라 기존 레벨업 미션 대기 단어 + 오늘 오답노트
  // 단어까지 합쳐서 보여줌(기존 복습 신호를 그대로 재사용, 새로 안 만듦).
  const reviewWordIds = useMemo(() => {
    const ids = new Set(missions.filter(m => !m.done).map(m => m.wordId))
    spellingWrongToday.forEach(id => ids.add(id))
    // Writing MVP(2026-07-20) — 영구 복습 대기열도 "복습 단어만" 스코프에
    // 자동으로 포함(기존 스코프 선택 UI 그대로 재사용, 새 화면 없음).
    spellingReviewQueue.forEach(id => ids.add(id))
    return ids
  }, [missions, spellingWrongToday, spellingReviewQueue])
  const sessionWords = useMemo(
    () => filterWordsByScope(classWords, studyScope, wordStatus, reviewWordIds),
    [classWords, studyScope, wordStatus, reviewWordIds]
  )
  // 쓰기 시험 반별 설정 — 관리자가 켜지 않았으면 항상 안전한 기본값(전부
  // 꺼짐)이 돌아오므로, 스키마 SQL을 아직 안 돌렸어도 이 값은 절대
  // 에러나지 않음 (getClassSettings 참고).
  const spellingSettings            = useMemo(() => {
    try { return getClassSettings(getStudentClass(studentId)) } catch { return { spellingTestEnabled: false, spellingHintEnabled: false, wrongAnswerRepeatCount: 3 } }
  }, [studentId, refreshTick])

  // v2.0 혼합(mixed) 방향 — 반 설정이 'mixed'일 때만, 이번 세션 단어
  // 목록(sessionWords) 전체에 kr2en/en2kr을 정확히 50:50으로 미리 배정
  // (입실시험과 같은 assignDirections — 중복 구현 금지). 단어별 방향은
  // 인덱스로 조회. 다른 방향(kr2en/en2kr/random)은 null — 기존 흐름
  // (SpellingQuestion이 direction prop을 그대로 해석) 완전 동일.
  // 주의: scope가 'review'면 오답이 쌓이며 sessionWords가 세션 도중 자랄
  // 수 있어 그때 재배정되지만, 방향은 문제 시작 시점에만 읽으므로 이미
  // 푼 문제에는 영향 없음(50:50 균형이 약간 흔들리는 정도 — 허용).
  const mixedDirections = useMemo(() => {
    if (spellingSettings.spellingDirection !== 'mixed') return null
    return assignDirections(sessionWords.length, 'mixed')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spellingSettings, sessionWords.length])

  // v2.0 쓰기 모드 세션 성적 집계(방향별) — 첫 시도 기준. 쓰기 모드로
  // 단어 목록에서 세션을 시작할 때 비우고, 마지막 단어까지 끝나면 결과
  // 화면(spellingResult)에서 요약해 보여준다. 저장은 안 함(요약 표시 전용
  // — 영구 기록은 기존 recordSpellingAnswer가 이미 담당).
  const [writeSessionStats, setWriteSessionStats] = useState([])

  // 쓰기 채점 1건 처리 — ①기존 영구 기록 ②세션 집계(쓰기 모드만)
  // ③애매한 오답(영→한인데 한글로 답함)은 교사 검토 큐에 기록
  // (fire-and-forget, 테이블 없으면 조용히 스킵 — spellingReviewApi 참고).
  const handleSpellingAnswer = (wordId, correct, direction, submitted) => {
    studentData.recordSpellingAnswer(wordId, correct)
    const w = classWords.find((cw) => cw.id === wordId)
    if (studyMode === 'write') {
      setWriteSessionStats((prev) => [...prev, {
        wordId, correct,
        direction: direction === 'en2kr' ? 'en2kr' : 'kr2en',
        word: w?.word || wordId, meaning: w?.meaning || '',
      }])
    }
    if (!correct && direction === 'en2kr' && w?.dbId && /[ㄱ-ㆎ가-힣]/.test(submitted || '')) {
      logSpellingReview(w.dbId, studentId, submitted, 'en2kr')
    }
  }

  // Re-pull the latest word AND student data from Supabase whenever the app
  // regains focus (e.g. switching back from another app on mobile) so a word
  // added on another device — or a class/unit reassignment an admin made on
  // a different device while this tab stayed open — doesn't stay hidden
  // behind stale cached data. refreshStudents() is included here because
  // _students (unlike _cache) was previously only ever populated once at
  // initWordLibrary() and never refreshed again for a tab's whole lifetime,
  // which is exactly what let a student's re-assigned unit silently revert
  // to whatever it was when the tab first loaded.
  useEffect(() => {
    // 2026-07-10 성능 최적화: visibilitychange와 focus는 같은 "앱으로
    // 돌아옴" 순간에 거의 동시에(모바일에서는 둘 다) 발생하는 경우가
    // 많아서, 이 핸들러가 두 번 연달아 불리며 6개 Supabase 쿼리
    // (refreshWordLibrary 4개 + refreshStudents 1개 + refreshClassSettings
    // 1개)를 두 번, 총 12개를 쏘고 있었다. 이미 진행 중인 새로고침이
    // 있으면 겹쳐 시작하지 않도록 가드 — 실제 새로고침 자체(최초 트리거
    // 시점, 어떤 데이터를 가져오는지)는 전혀 안 바뀜, 근접 중복 호출만
    // 제거.
    let inFlight = false
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !inFlight) {
        inFlight = true
        Promise.all([refreshWordLibrary(), refreshStudents(), refreshClassSettings()])
          .then(() => setRefreshTick((t) => t + 1))
          .catch(() => {})
          .finally(() => { inFlight = false })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // v1.5: 단어 목록에서 클릭한 단어와 "다음 단어" 진행은 지금 활성화된
  // 학습 범위(sessionWords — 전체일 땐 classWords와 동일)를 기준으로
  // 인덱싱한다. 그래야 "모르는 단어만" 등에서 다음으로 넘어갈 때 필터링
  // 안 된 단어를 건너뛰지 않고, 정확히 그 범위 안에서만 순환한다.
  const handleWordSelect = (w) => {
    const idx = sessionWords.findIndex(cw => cw.id === w.id)
    const safeIdx = idx >= 0 ? idx : 0
    setWord(w)
    setWordIdx(safeIdx)
    studentData.setLastWordIndex(safeIdx, currentUnitId)
    setWriteSessionStats([]) // 새 세션 시작 — 쓰기 성적 집계 초기화
    setScreen('wordDetail')
  }

  // Jumps straight into word study at a specific index — used by the
  // Dashboard's "이어서 학습하기" recommendation, which reads
  // studentData.lastWordIndex instead of always restarting from word 1.
  // 항상 반 전체 단어 기준(scope와 무관) — "이어서 학습하기"는 필터링과
  // 상관없이 지난번에 멈춘 그 자리부터 이어가는 게 맞는 의미라서.
  const goToWordIndex = (idx) => {
    if (idx < 0 || idx >= classWords.length) return
    setWord(classWords[idx])
    setWordIdx(idx)
    studentData.setLastWordIndex(idx, currentUnitId)
    setWriteSessionStats([]) // 새 세션 시작 — 쓰기 성적 집계 초기화
    setScreen('wordDetail')
  }

  // Advance to next word in sessionWords; go back to browser after last word.
  // Every 5th completed word (and only if there's a next word to continue
  // to), offer the balloon-game bonus screen instead of jumping straight to
  // the next word — the student picks whether to play or keep going.
  const handleNextWord = () => {
    const nextIdx = selectedWordIdx + 1
    const completedCount = selectedWordIdx + 1
    if (completedCount % 5 === 0 && nextIdx < sessionWords.length) {
      setPendingNextIdx(nextIdx)
      setScreen('bonusChoice')
      return
    }
    if (nextIdx < sessionWords.length) {
      setWord(sessionWords[nextIdx])
      setWordIdx(nextIdx)
      studentData.setLastWordIndex(nextIdx, currentUnitId)
    } else if (studyMode === 'write' && writeSessionStats.length > 0) {
      // v2.0 쓰기 모드 — 마지막 단어까지 끝나면 목록 대신 방향별 성적
      // 요약("한→영 8/10 · 영→한 9/10 · 총점 17/20")을 먼저 보여줌.
      setScreen('spellingResult')
    } else {
      setScreen('wordBrowser')
    }
  }

  const goToPendingWord = () => {
    setWord(sessionWords[pendingNextIdx])
    setWordIdx(pendingNextIdx)
    studentData.setLastWordIndex(pendingNextIdx, currentUnitId)
    setScreen('wordDetail')
  }

  const handleAnswerMission = (wordId) => answerMission(wordId)

  // P0(2026-07-17) 로그인 직후 로딩 게이트 — 이 기기에 로컬 기록이 없는
  // 학생(신규/기기 교체/PIN 초기화 후 재로그인)은 클라우드 백업 복원
  // 확인이 끝날 때까지(성공/실패/5s 타임아웃 무관) Dashboard를 렌더하지
  // 않는다. 복원 전의 빈 record로 화면이 먼저 그려졌다가 데이터가 뒤늦게
  // 갈아끼워지는 깜빡임/불일치 방지. 로컬에 기록이 있는 학생은
  // restoreChecked가 처음부터 true라 이 화면을 전혀 거치지 않는다.
  // (반드시 위의 모든 훅 호출 뒤에 있어야 함 — 훅 순서 규칙.)
  if (!studentData.restoreChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-bounce">📖</div>
          <p className="text-purple-400 font-bold">학습 기록을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {screen === 'dashboard'     && (
        <Dashboard studentId={studentId} studentName={studentName} studentData={studentData} classWords={classWords}
          onGo={setScreen} onLogout={onLogout} onPlayGame={startRandomGame}
          onResumeWord={goToWordIndex}
          resumeIndex={studentData.getResumeIndexForUnit(currentUnitId)}
          onUnitSwitch={handleUnitSwitch}
          textbookAssignments={textbookAssignments} onTextbookSwitch={handleTextbookSwitch} />
      )}
      {screen === 'wordBrowser'   && (
        <WordBrowser words={classWords} cleared={cleared} onSelect={handleWordSelect} onBack={() => setScreen('dashboard')}
          mode={studyMode} onModeChange={setStudyMode}
          scope={studyScope} onScopeChange={setStudyScope} wordStatus={wordStatus} reviewWordIds={reviewWordIds} />
      )}
      {screen === 'wordDetail'    && selectedWord && (
        <WordDetail word={selectedWord}
          classWords={classWords}
          mode={studyMode}
          spellingSettings={spellingSettings}
          onSpellingAnswer={handleSpellingAnswer}
          spellingDirectionOverride={mixedDirections ? mixedDirections[selectedWordIdx] || 'kr2en' : null}
          spellingCombo={studentData.spellingCombo}
          spellingReviewQueue={spellingReviewQueue}
          sessionProgress={{ current: selectedWordIdx + 1, total: sessionWords.length }}
          onBack={() => setScreen('wordBrowser')}
          onNext={handleNextWord}
          onMarkViewed={studentData.markWordViewed}
          onMarkExampleHeard={studentData.markExampleHeard}
          onMarkPronunciationOk={() => { markPronunciationOk(); addStars(1) }}
          onMarkQuizSolved={studentData.markQuizSolved}
          onQuizAnswer={studentData.recordQuizAnswer}
          onPronunciationAttempt={studentData.markPronunciationAttempt}
          wordStatus={wordStatus} onWordKnown={setWordKnown} onWordUnknown={setWordUnknown} />
      )}
      {screen === 'quiz'          && (
        <QuizGame initWord={selectedWord} classWords={classWords}
          onBack={() => setScreen('dashboard')}
          onAddMission={studentData.addMission}
          onMarkQuizSolved={studentData.markQuizSolved}
          onMarkPronunciationOk={markPronunciationOk}
          onAddStars={addStars}
          onQuizAnswer={studentData.recordQuizAnswer}
          onPronunciationAttempt={studentData.markPronunciationAttempt} />
      )}
      {screen === 'levelUpMission' && <LevelUpMission missions={missions} words={classWords} onAnswer={handleAnswerMission} onBack={() => setScreen('dashboard')} />}
      {screen === 'diary'         && <DiaryPage studentData={studentData} onBack={() => setScreen('dashboard')} />}
      {screen === 'studyCalendar' && <StudyCalendar studentData={studentData} onBack={() => setScreen('dashboard')} />}
      {screen === 'bonusChoice'   && (
        <BonusChoiceScreen
          completedCount={pendingNextIdx}
          wordCount={sessionWords.length}
          onPlayGame={() => { setBalloonFromLesson(true); startRandomGame() }}
          onContinue={goToPendingWord}
        />
      )}
      {screen === 'game'          && (
        <CurrentGame
          words={classWords}
          onBack={balloonFromLesson ? goToPendingWord : () => setScreen('dashboard')}
          onAddStars={addStars}
          onContinue={balloonFromLesson ? goToPendingWord : null}
        />
      )}
      {pendingGift && (
        <GiftReveal
          key={`${pendingGift.sticker.id}-${pendingGift.isMilestone ? 'm' : pendingGift.isBadge ? 'b' : 'r'}-${pendingGift.streakDays || pendingGift.badgeThreshold || 0}`}
          sticker={pendingGift.sticker}
          isDuplicate={pendingGift.isDuplicate}
          isMilestone={pendingGift.isMilestone}
          streakDays={pendingGift.streakDays}
          isBadge={pendingGift.isBadge}
          badgeThreshold={pendingGift.badgeThreshold}
          onClose={handleDismissGift}
        />
      )}
      {screen === 'entranceTest' && (
        <React.Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-5xl mb-3 animate-bounce">📝</div>
              <p className="text-gray-400 font-bold">시험 화면을 불러오는 중...</p>
            </div>
          </div>
        }>
          <EntranceTest studentId={studentId} studentName={studentName} onBack={() => setScreen('dashboard')} />
        </React.Suspense>
      )}
      {screen === 'spellingResult' && (
        <SpellingSessionResult
          stats={writeSessionStats}
          onDone={() => { setWriteSessionStats([]); setScreen('wordBrowser') }}
        />
      )}
      {screen === 'spellingReview' && (
        <SpellingReview
          // Writing MVP(2026-07-20) — 오늘치 오답노트 + 영구 복습 대기열을
          // 합쳐서(중복 제거) 한 번에 순회. SpellingReview 자체는 이 구분을
          // 몰라도 되고, comebackWordIds만 별도로 받아 배지 판단에 쓴다.
          wrongWordIds={Array.from(new Set([...spellingWrongToday, ...spellingReviewQueue]))}
          comebackWordIds={spellingReviewQueue}
          classWords={classWords}
          onClearWord={clearSpellingReviewWord}
          onDone={() => setScreen('dashboard')}
          hintEnabled={spellingSettings.spellingHintEnabled}
          direction={spellingSettings.spellingDirection}
        />
      )}
      <SpeedBtn />
    </>
  )
}

const SESSION_KEY = 'paulEasyVoca_currentStudent'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// P0(2026-07-15) identity 리팩터링 — 세션은 이제 { id, name } JSON을
// 저장한다(예전엔 이름 문자열 그대로). 예전 형식(순수 이름 문자열, 또는
// UUID가 아닌 값)이 남아있는 기기는 "레거시 세션"으로 간주해 안전하게
// 로그아웃 처리한다 — PIN 없이는 그 세션을 어느 학생 것인지 확인할 방법이
// 없으므로(동명이인 가능), 자동으로 아무 계정에나 로그인시키지 않는다.
// 크래시 없이 그냥 로그인 화면으로 돌려보내는 게 유일하게 안전한 선택.
function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && UUID_RE.test(parsed.id || '')) return parsed
    return null // 형식이 안 맞음 — legacy 취급
  } catch {
    return null // JSON.parse 실패 = 예전의 순수 이름 문자열이었던 경우 포함 — legacy 취급
  }
}

export default function App() {
  const [student, setStudent] = useState(() => readSession()) // null | { id, name, className, unitName }
  const [showAdmin, setAdmin] = useState(false)
  const [showParent, setParent] = useState(false)
  const [ready, setReady]     = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [removedNotice, setRemovedNotice] = useState(false)
  // 로그인 방식이 이름 전용 → 이름+PIN으로 바뀌면서, 예전 형식(이름 문자열
  // 또는 구버전 세션)이 저장돼 있던 기기는 최초 로드 시 한 번 여기로 걸린다.
  const [legacySessionNotice, setLegacySessionNotice] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return !!raw && !readSession()
    } catch { return false }
  })

  // Load class/word data from Supabase before rendering anything that needs
  // it — guarantees every screen starts from the current DB state, not a
  // stale local cache. Legacy(형식 안 맞는) 세션은 여기서 정리.
  useEffect(() => {
    initWordLibrary().then(() => {
      setReady(true)
      if (!readSession() && localStorage.getItem(SESSION_KEY)) {
        localStorage.removeItem(SESSION_KEY)
      }
      // [진단 로그 4-b] 캐시된 로그인(페이지 새로고침으로 재입장)의 경우도
      // 여기서 Home 진입 직전 상태를 확인할 수 있음.
      if (student) {
        console.log('[App] initWordLibrary 완료 — 캐시된 currentStudent:', {
          id: student.id, name: student.name, class: getStudentClass(student.id), unit: getStudentUnit(student.id),
        })
      }
    }).catch((err) => setLoadError(err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If an admin deleted this student's account from another device while
  // this one was still logged in, don't silently fall through to an empty
  // "0 words" dashboard under an id that no longer exists — log out with a
  // clear explanation instead.
  useEffect(() => {
    if (ready && student && !getStudentById(student.id)) {
      localStorage.removeItem(SESSION_KEY)
      setStudent(null)
      setRemovedNotice(true)
    }
  }, [ready, student])

  // Unlock AudioContext + warm up speechSynthesis + ask for microphone
  // permission, all on the very first user gesture in the whole app
  // (iOS/Android requirement — must happen inside a gesture handler).
  // getMicStream() caches the granted stream module-wide, so no later
  // getUserMedia() call — on any word, on any screen — asks again.
  // touchstart covers mobile; pointerdown also covers PC mouse clicks.
  useEffect(() => {
    const handler = () => { unlockAudio(); primeSpeech(); getMicStream().catch(() => {}) }
    document.addEventListener('touchstart', handler, { once: true, passive: true })
    document.addEventListener('pointerdown', handler, { once: true, passive: true })
    return () => {
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('pointerdown', handler)
    }
  }, [])

  // Always re-pull this student's class/unit from Supabase at the exact
  // moment of login — logout->re-login is a pure client-side state change
  // (no page reload), so without this, a unit reassignment an admin made
  // earlier in the same tab's lifetime would keep being invisible, since
  // _students was otherwise only ever loaded once when the tab first opened.
  // `sel`은 StudentSelect.jsx가 로그인/등록 성공 시 넘기는 { id, name,
  // className, unitName } — PIN 서버 검증(로그인) 또는 addStudent+set-
  // student-pin(등록) 둘 다 이 모양으로 통일해서 넘긴다.
  const handleSelect = async (sel) => {
    try { await refreshStudents() } catch {}
    // [진단 로그 4] Home(Dashboard) 진입 직전 currentStudent + 그 시점의 반/유닛
    console.log('[App] handleSelect — Home 진입 직전 currentStudent:', {
      id: sel.id, name: sel.name, class: getStudentClass(sel.id), unit: getStudentUnit(sel.id),
    })
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: sel.id, name: sel.name }))
    setRemovedNotice(false)
    setLegacySessionNotice(false)
    setStudent(sel)
  }
  const handleLogout = () => { localStorage.removeItem(SESSION_KEY); setStudent(null) }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-lg">
          <div className="text-5xl mb-4">📡</div>
          <h2 className="font-black text-xl text-gray-800 mb-2">단어 서버에 연결할 수 없어요</h2>
          <p className="text-xs text-red-400 mb-6 break-all bg-red-50 p-3 rounded-xl">{String(loadError.message || loadError)}</p>
          <button onClick={() => window.location.reload()} className="w-full bg-purple-500 text-white font-black py-3 rounded-2xl">
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-bounce">📚</div>
          <p className="text-purple-400 font-bold">단어를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (showAdmin) return (
    <AppErrorBoundary>
      <React.Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-5xl mb-3 animate-bounce">⚙️</div>
            <p className="text-gray-400 font-bold">관리자 화면을 불러오는 중...</p>
          </div>
        </div>
      }>
        <AdminScreen onBack={() => setAdmin(false)} />
      </React.Suspense>
    </AppErrorBoundary>
  )
  if (showParent) return (
    <AppErrorBoundary>
      <React.Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-5xl mb-3 animate-bounce">👨‍👩‍👧</div>
            <p className="text-gray-400 font-bold">학부모 화면을 불러오는 중...</p>
          </div>
        </div>
      }>
        <ParentScreen onBack={() => setParent(false)} />
      </React.Suspense>
    </AppErrorBoundary>
  )
  if (!student)  return (
    <AppErrorBoundary>
      <StudentSelect onSelect={handleSelect} onAdmin={() => setAdmin(true)} onParent={() => setParent(true)}
        removedNotice={removedNotice || legacySessionNotice} />
    </AppErrorBoundary>
  )
  return <AppErrorBoundary><AppInner studentId={student.id} studentName={student.name} onLogout={handleLogout} /></AppErrorBoundary>
}
