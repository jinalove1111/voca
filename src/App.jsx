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
import { useStudent } from './hooks/useStudent'
import { pickNextGame } from './utils/matchGame'
import { getStudentWords, initWordLibrary, refreshWordLibrary, refreshStudents, refreshClassSettings, findStudentByName, getStudentClass, getStudentUnit, getClassSettings, filterWordsByScope } from './utils/wordLibrary'
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

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-lg">
            <div className="text-5xl mb-4">😵</div>
            <h2 className="font-black text-xl text-gray-800 mb-2">앱 오류가 발생했어요</h2>
            <p className="text-xs text-red-400 mb-6 break-all bg-red-50 p-3 rounded-xl">{String(this.state.error)}</p>
            <button
              onClick={() => {
                localStorage.removeItem('paulEasyVoca_currentStudent')
                this.setState({ hasError: false, error: null })
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

function AppInner({ student, onLogout }) {
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
  const studentData                 = useStudent(student)
  const { cleared, answerMission, missions, addStars, markPronunciationOk, pendingGift, dismissGift, lastGamePlayed, setLastGamePlayed, recordGamePlayed, spellingWrongToday, clearSpellingReviewWord, wordStatus, setWordKnown, setWordUnknown } = studentData

  // 선물상자를 닫은 직후, 오늘 틀린 스펠링 단어가 남아있으면 자동으로
  // "오늘 틀린 단어 복습"을 시작 — 맞을 때까지 반복(SpellingReview 참고).
  const handleDismissGift = () => {
    dismissGift()
    if (spellingWrongToday.length > 0) setScreen('spellingReview')
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
    try { return getStudentWords(student) || [] } catch { return [] }
  }, [student, refreshTick])
  // v1.5 이번 세션에서 실제로 공부할 단어 목록 — studyScope에 따라
  // classWords(반 전체 단어, 퀴즈 오답 보기 생성 등에는 항상 이 전체
  // 목록을 그대로 씀)를 걸러낸 서브셋. "복습 단어만"은 이 Skip 기능의
  // '모르겠어요' 표시뿐 아니라 기존 레벨업 미션 대기 단어 + 오늘 오답노트
  // 단어까지 합쳐서 보여줌(기존 복습 신호를 그대로 재사용, 새로 안 만듦).
  const reviewWordIds = useMemo(() => {
    const ids = new Set(missions.filter(m => !m.done).map(m => m.wordId))
    spellingWrongToday.forEach(id => ids.add(id))
    return ids
  }, [missions, spellingWrongToday])
  const sessionWords = useMemo(
    () => filterWordsByScope(classWords, studyScope, wordStatus, reviewWordIds),
    [classWords, studyScope, wordStatus, reviewWordIds]
  )
  // 쓰기 시험 반별 설정 — 관리자가 켜지 않았으면 항상 안전한 기본값(전부
  // 꺼짐)이 돌아오므로, 스키마 SQL을 아직 안 돌렸어도 이 값은 절대
  // 에러나지 않음 (getClassSettings 참고).
  const spellingSettings            = useMemo(() => {
    try { return getClassSettings(getStudentClass(student)) } catch { return { spellingTestEnabled: false, spellingHintEnabled: false, wrongAnswerRepeatCount: 3 } }
  }, [student, refreshTick])

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
    studentData.setLastWordIndex(safeIdx)
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
    studentData.setLastWordIndex(idx)
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
      studentData.setLastWordIndex(nextIdx)
    } else {
      setScreen('wordBrowser')
    }
  }

  const goToPendingWord = () => {
    setWord(sessionWords[pendingNextIdx])
    setWordIdx(pendingNextIdx)
    studentData.setLastWordIndex(pendingNextIdx)
    setScreen('wordDetail')
  }

  const handleAnswerMission = (wordId) => answerMission(wordId)

  return (
    <>
      {screen === 'dashboard'     && (
        <Dashboard student={student} studentData={studentData} classWords={classWords}
          onGo={setScreen} onLogout={onLogout} onPlayGame={startRandomGame}
          onResumeWord={goToWordIndex} />
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
          onSpellingAnswer={studentData.recordSpellingAnswer}
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
      {screen === 'spellingReview' && (
        <SpellingReview
          wrongWordIds={spellingWrongToday}
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

export default function App() {
  const [student, setStudent] = useState(() => localStorage.getItem('paulEasyVoca_currentStudent') || '')
  const [showAdmin, setAdmin] = useState(false)
  const [showParent, setParent] = useState(false)
  const [ready, setReady]     = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [removedNotice, setRemovedNotice] = useState(false)

  // Load class/word data from Supabase before rendering anything that needs
  // it — guarantees every screen starts from the current DB state, not a
  // stale local cache.
  useEffect(() => {
    initWordLibrary().then(() => {
      setReady(true)
      // [진단 로그 4-b] 캐시된 로그인(페이지 새로고침으로 재입장)의 경우도
      // 여기서 Home 진입 직전 상태를 확인할 수 있음.
      if (student) {
        console.log('[App] initWordLibrary 완료 — 캐시된 currentStudent:', {
          name: student, class: getStudentClass(student), unit: getStudentUnit(student),
        })
      }
    }).catch((err) => setLoadError(err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If an admin deleted this student's account from another device while
  // this one was still logged in, don't silently fall through to an empty
  // "0 words" dashboard under a name that no longer exists — log out with a
  // clear explanation instead.
  useEffect(() => {
    if (ready && student && !findStudentByName(student)) {
      localStorage.removeItem('paulEasyVoca_currentStudent')
      setStudent('')
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
  const handleSelect = async (name) => {
    try { await refreshStudents() } catch {}
    // [진단 로그 4] Home(Dashboard) 진입 직전 currentStudent + 그 시점의 반/유닛
    console.log('[App] handleSelect — Home 진입 직전 currentStudent:', {
      name, class: getStudentClass(name), unit: getStudentUnit(name),
    })
    localStorage.setItem('paulEasyVoca_currentStudent', name)
    setRemovedNotice(false)
    setStudent(name)
  }
  const handleLogout = () => { localStorage.removeItem('paulEasyVoca_currentStudent'); setStudent('') }

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
  if (!student)  return <AppErrorBoundary><StudentSelect onSelect={handleSelect} onAdmin={() => setAdmin(true)} onParent={() => setParent(true)} removedNotice={removedNotice} /></AppErrorBoundary>
  return <AppErrorBoundary><AppInner student={student} onLogout={handleLogout} /></AppErrorBoundary>
}
