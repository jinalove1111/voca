import { useState, useCallback, useEffect } from 'react'

// Student roster + class assignment live in Supabase (shared across every
// device) — see utils/wordLibrary.js. Only per-student progress (stars,
// pets, missions, daily counters) stays device-local below.
export { getStudents, addStudent, removeStudent } from '../utils/wordLibrary'

const PREFIX = 'paulEasyVoca'
const sk = (name, type) => `${PREFIX}_${name}_${type}`
const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def } }
const loadArr = (key) => { const v = load(key, []); return Array.isArray(v) ? v : [] }
const loadNum = (key) => { const v = load(key, 0); return typeof v === 'number' ? v : 0 }
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val))

const todayStr = () => new Date().toDateString()
const freshDaily = () => ({
  date: todayStr(),
  wordsViewed: [],
  examplesHeard: 0,
  quizSolved: 0,
  pronunciationOk: 0,
  missionDone: false,
  eggPicked: false,
})

export function useStudent(name) {
  const [stars, _setStars] = useState(() => loadNum(sk(name, 'stars')))
  const [pets, _setPets] = useState(() => loadArr(sk(name, 'pets')))
  const [missions, _setMissions] = useState(() => loadArr(sk(name, 'missions')))
  const [cleared, _setCleared] = useState(() => loadArr(sk(name, 'cleared')))
  const [daily, _setDaily] = useState(() => {
    const s = load(sk(name, 'daily'), null)
    if (s && typeof s === 'object' && !Array.isArray(s) && s.date === todayStr()) return s
    return freshDaily()
  })

  const setStars = useCallback(v => {
    _setStars(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'stars'), n); return n })
  }, [name])
  const setPets = useCallback(v => {
    _setPets(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'pets'), n); return n })
  }, [name])
  const setMissions = useCallback(v => {
    _setMissions(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'missions'), n); return n })
  }, [name])
  const setCleared = useCallback(v => {
    _setCleared(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'cleared'), n); return n })
  }, [name])
  const setDaily = useCallback(v => {
    _setDaily(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'daily'), n); return n })
  }, [name])

  // Missions reset at midnight even if the app is left open across the day
  // boundary — the mount-time check above only catches "reopened on a new
  // day", not "still open when midnight passes". A light periodic check is
  // simpler and just as reliable as computing exact ms-until-midnight.
  useEffect(() => {
    const checkNewDay = () => {
      if (daily.date !== todayStr()) setDaily(freshDaily())
    }
    const t = setInterval(checkNewDay, 30000)
    return () => clearInterval(t)
  }, [daily.date, setDaily])

  const addStars = useCallback((n = 1) => setStars(s => s + n), [setStars])

  const addMission = useCallback((wordId) => {
    setMissions(prev => prev.some(m => m.wordId === wordId) ? prev : [...prev, { wordId, correctCount: 0, done: false }])
  }, [setMissions])

  const answerMission = useCallback((wordId) => {
    let didClear = false
    setMissions(prev => prev.map(m => {
      if (m.wordId !== wordId || m.done) return m
      const next = m.correctCount + 1
      if (next >= 3) { didClear = true; return { ...m, correctCount: 3, done: true } }
      return { ...m, correctCount: next }
    }))
    if (didClear) {
      setCleared(prev => prev.includes(wordId) ? prev : [...prev, wordId])
      addStars(3)
    }
    return didClear
  }, [setMissions, setCleared, addStars])

  const addPet = useCallback((pet) => {
    setPets(prev => [...prev, { ...pet, obtainedAt: new Date().toISOString() }])
  }, [setPets])

  const markWordViewed = useCallback((wordId) => {
    setDaily(prev => prev.wordsViewed.includes(wordId) ? prev : { ...prev, wordsViewed: [...prev.wordsViewed, wordId] })
  }, [setDaily])

  const markExampleHeard = useCallback(() => {
    setDaily(prev => ({ ...prev, examplesHeard: prev.examplesHeard + 1 }))
  }, [setDaily])

  const markQuizSolved = useCallback(() => {
    setDaily(prev => ({ ...prev, quizSolved: prev.quizSolved + 1 }))
  }, [setDaily])

  const markPronunciationOk = useCallback(() => {
    setDaily(prev => ({ ...prev, pronunciationOk: (prev.pronunciationOk || 0) + 1 }))
  }, [setDaily])

  const completeDailyMission = useCallback(() => {
    setDaily(prev => ({ ...prev, missionDone: true }))
    addStars(20)
  }, [setDaily, addStars])

  // Egg pick is separate from the +20★ daily bonus above — both require all
  // 4 daily categories done, but claiming one doesn't consume the other.
  // Duplicates don't add a second copy to the collection — they convert
  // into a +20★ bonus instead, so a pick is never wasted.
  const claimEgg = useCallback((pet) => {
    const isDuplicate = pets.some(p => p.id === pet.id)
    setDaily(prev => ({ ...prev, eggPicked: true }))
    if (isDuplicate) addStars(20)
    else addPet(pet)
    return isDuplicate
  }, [pets, setDaily, addStars, addPet])

  const GOAL = 5
  const dailyProgress = {
    words:          Math.min(daily.wordsViewed.length, GOAL),
    examples:       Math.min(daily.examplesHeard, GOAL),
    quizzes:        Math.min(daily.quizSolved, GOAL),
    pronunciations: Math.min(daily.pronunciationOk || 0, GOAL),
    done:           daily.missionDone,
  }

  // The 4 completion conditions: word study, example study, quiz, pronunciation.
  const allDailyDone = (
    dailyProgress.words >= GOAL &&
    dailyProgress.examples >= GOAL &&
    dailyProgress.quizzes >= GOAL &&
    dailyProgress.pronunciations >= GOAL
  )
  const eggReady = allDailyDone && !daily.eggPicked

  return {
    stars, pets, missions,
    activeMissions: missions.filter(m => !m.done),
    cleared, daily, dailyProgress, allDailyDone, eggReady,
    addStars, addMission, answerMission, addPet, claimEgg,
    markWordViewed, markExampleHeard, markQuizSolved,
    markPronunciationOk, completeDailyMission,
  }
}
