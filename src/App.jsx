import React, { useState, useEffect, useMemo } from 'react'
import StudentSelect from './components/StudentSelect'
import Dashboard from './components/Dashboard'
import WordBrowser from './components/WordBrowser'
import WordDetail from './components/WordDetail'
import QuizGame from './components/QuizGame'
import LevelUpMission from './components/LevelUpMission'
import PetCollection from './components/PetCollection'
import EggReveal from './components/EggReveal'
import AdminScreen from './components/AdminScreen'
import { useStudent } from './hooks/useStudent'
import { getRandomPet } from './data/pets'
import { getStudentWords, initWordLibrary, refreshWordLibrary } from './utils/wordLibrary'
import { getSpeechRate, setSpeechRate, unlockAudio, primeSpeech } from './utils/speech'

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

const RATE_OPTIONS = [
  { label: '🐢 천천히', value: 0.6 },
  { label: '🙂 보통',   value: 0.8 },
  { label: '🚀 빠르게', value: 1.0 },
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
  const [eggPet, setEggPet]         = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const studentData                 = useStudent(student)
  const { cleared, addPet, answerMission, missions, addStars, markPronunciationOk } = studentData
  const classWords                  = useMemo(() => {
    try { return getStudentWords(student) || [] } catch { return [] }
  }, [student, refreshTick])

  useEffect(() => {
    if (cleared.length > 0 && cleared.length % 5 === 0) {
      const pet = getRandomPet()
      addPet(pet)
      setEggPet(pet)
    }
  }, [cleared.length])

  // Re-pull the latest word data from Supabase whenever the app regains focus
  // (e.g. switching back from another app on mobile) so a word added on
  // another device doesn't stay hidden behind stale cached data.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshWordLibrary().then(() => setRefreshTick((t) => t + 1)).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  const handleWordSelect = (w) => {
    const idx = classWords.findIndex(cw => cw.id === w.id)
    setWord(w)
    setWordIdx(idx >= 0 ? idx : 0)
    setScreen('wordDetail')
  }

  // Advance to next word in classWords; go back to browser after last word
  const handleNextWord = () => {
    const nextIdx = selectedWordIdx + 1
    if (nextIdx < classWords.length) {
      setWord(classWords[nextIdx])
      setWordIdx(nextIdx)
    } else {
      setScreen('wordBrowser')
    }
  }

  const handleAnswerMission = (wordId) => {
    const didClear = answerMission(wordId)
    if (didClear && cleared.length > 0 && (cleared.length + 1) % 5 === 0) {
      const pet = getRandomPet()
      addPet(pet)
      setEggPet(pet)
    }
    return didClear
  }

  return (
    <>
      {screen === 'dashboard'     && <Dashboard student={student} studentData={studentData} onGo={setScreen} onLogout={onLogout} />}
      {screen === 'wordBrowser'   && <WordBrowser words={classWords} cleared={cleared} onSelect={handleWordSelect} onBack={() => setScreen('dashboard')} />}
      {screen === 'wordDetail'    && selectedWord && (
        <WordDetail word={selectedWord}
          classWords={classWords}
          onBack={() => setScreen('wordBrowser')}
          onNext={handleNextWord}
          onMarkViewed={studentData.markWordViewed}
          onMarkExampleHeard={studentData.markExampleHeard}
          onMarkPronunciationOk={() => { markPronunciationOk(); addStars(1) }}
          onMarkQuizSolved={studentData.markQuizSolved} />
      )}
      {screen === 'quiz'          && (
        <QuizGame initWord={selectedWord} classWords={classWords}
          onBack={() => setScreen('dashboard')}
          onAddMission={studentData.addMission}
          onMarkQuizSolved={studentData.markQuizSolved}
          onMarkPronunciationOk={markPronunciationOk}
          onAddStars={addStars} />
      )}
      {screen === 'levelUpMission' && <LevelUpMission missions={missions} onAnswer={handleAnswerMission} onBack={() => setScreen('dashboard')} />}
      {screen === 'petCollection'  && <PetCollection pets={studentData.pets} onBack={() => setScreen('dashboard')} />}
      {eggPet && <EggReveal pet={eggPet} onClose={() => setEggPet(null)} />}
      <SpeedBtn />
    </>
  )
}

export default function App() {
  const [student, setStudent] = useState(() => localStorage.getItem('paulEasyVoca_currentStudent') || '')
  const [showAdmin, setAdmin] = useState(false)
  const [ready, setReady]     = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Load class/word data from Supabase before rendering anything that needs
  // it — guarantees every screen starts from the current DB state, not a
  // stale local cache.
  useEffect(() => {
    initWordLibrary().then(() => setReady(true)).catch((err) => setLoadError(err))
  }, [])

  // Unlock AudioContext + warm up speechSynthesis on the very first user
  // gesture (iOS/Android requirement). touchstart covers mobile; pointerdown
  // also covers PC mouse clicks, where touchstart never fires.
  useEffect(() => {
    const handler = () => { unlockAudio(); primeSpeech() }
    document.addEventListener('touchstart', handler, { once: true, passive: true })
    document.addEventListener('pointerdown', handler, { once: true, passive: true })
    return () => {
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('pointerdown', handler)
    }
  }, [])

  const handleSelect = (name) => { localStorage.setItem('paulEasyVoca_currentStudent', name); setStudent(name) }
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

  if (showAdmin) return <AppErrorBoundary><AdminScreen onBack={() => setAdmin(false)} /></AppErrorBoundary>
  if (!student)  return <AppErrorBoundary><StudentSelect onSelect={handleSelect} onAdmin={() => setAdmin(true)} /></AppErrorBoundary>
  return <AppErrorBoundary><AppInner student={student} onLogout={handleLogout} /></AppErrorBoundary>
}
