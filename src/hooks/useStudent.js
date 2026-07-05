import { useState, useCallback, useEffect, useRef } from 'react'
import { getRandomSticker, getMilestoneSticker, STICKERS } from '../data/stickers'

// Student roster + class assignment live in Supabase (shared across every
// device) — see utils/wordLibrary.js. Only per-student progress (stars,
// stickers, diary, missions, daily history) stays device-local below, keyed
// by student NAME — every value here is 100% private per student and never
// shared, and survives logging in from a different phone (same name = same
// localStorage key, restored fresh from whatever device is used, since the
// student roster/class itself is already shared via Supabase).
export { getStudents, addStudent, removeStudent } from '../utils/wordLibrary'

const PREFIX = 'paulEasyVoca'
const sk = (name, type) => `${PREFIX}_${name}_${type}`
const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def } }
const loadArr = (key) => { const v = load(key, []); return Array.isArray(v) ? v : [] }
const loadNum = (key) => { const v = load(key, 0); return typeof v === 'number' ? v : 0 }
const loadObj = (key) => { const v = load(key, {}); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {} }
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val))

const GOAL = 5
const MISSION_BONUS_STARS = 10
const DUPLICATE_BONUS_STARS = 20
const STREAK_MILESTONES = [3, 7, 14, 30]
// Star-count badges — guaranteed special stickers awarded once per
// threshold, independent of the gacha/streak systems (never duplicated).
const STAR_BADGES = [
  { threshold: 100,  stickerId: 'ukflag1' },
  { threshold: 300,  stickerId: 'crown1' },
  { threshold: 500,  stickerId: 'guard1' },
  { threshold: 1000, stickerId: 'lion' },
]

const todayStr = () => new Date().toDateString()
const freshRound = () => ({
  date: todayStr(),
  wordsViewed: [],
  examplesHeard: 0,
  quizSolved: 0,
  pronunciationOk: 0,
})
const freshHistoryDay = () => ({ missionsCompleted: 0, starsEarned: 0, stickersEarned: [] })

// Consecutive days (walking back from today) with at least 1 mission
// completed. If today has nothing yet, today isn't counted but doesn't
// zero out an existing streak either — it's just "not extended yet".
function calcStreak(history) {
  let streak = 0
  const d = new Date()
  if (!(history[d.toDateString()]?.missionsCompleted > 0)) d.setDate(d.getDate() - 1)
  while (history[d.toDateString()]?.missionsCompleted > 0) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function useStudent(name) {
  const [stars, _setStars] = useState(() => loadNum(sk(name, 'stars')))
  const [stickerTypes, _setStickerTypes] = useState(() => loadArr(sk(name, 'stickerTypes')))
  const [diaryPlacements, _setDiaryPlacements] = useState(() => loadArr(sk(name, 'diaryPlacements')))
  const [missions, _setMissions] = useState(() => loadArr(sk(name, 'missions')))
  const [cleared, _setCleared] = useState(() => loadArr(sk(name, 'cleared')))
  const [round, _setRound] = useState(() => {
    const s = load(sk(name, 'round'), null)
    if (s && typeof s === 'object' && !Array.isArray(s) && s.date === todayStr()) return s
    return freshRound()
  })
  const [history, _setHistory] = useState(() => loadObj(sk(name, 'history')))
  const [milestoneStreak, _setMilestoneStreak] = useState(() => loadNum(sk(name, 'milestoneStreak')))
  const [starBadgeThreshold, _setStarBadgeThreshold] = useState(() => loadNum(sk(name, 'starBadgeThreshold')))
  const [lastGamePlayed, _setLastGamePlayed] = useState(() => load(sk(name, 'lastGamePlayed'), null))
  // Where to resume word study — the "이어서 학습하기" recommendation reads
  // this instead of always restarting from word 1.
  const [lastWordIndex, _setLastWordIndex] = useState(() => loadNum(sk(name, 'lastWordIndex')))
  // A queue, not a single slot — a round completion and a streak milestone
  // can land in the same instant (finishing today's first round can push
  // the streak past a threshold at the same time), and neither should get
  // silently dropped in favor of the other.
  const [giftQueue, setGiftQueue] = useState([])
  const handledRoundRef = useRef(null)

  const setStars = useCallback(v => {
    _setStars(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'stars'), n); return n })
  }, [name])
  const setStickerTypes = useCallback(v => {
    _setStickerTypes(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'stickerTypes'), n); return n })
  }, [name])
  const setDiaryPlacements = useCallback(v => {
    _setDiaryPlacements(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'diaryPlacements'), n); return n })
  }, [name])
  const setMissions = useCallback(v => {
    _setMissions(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'missions'), n); return n })
  }, [name])
  const setCleared = useCallback(v => {
    _setCleared(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'cleared'), n); return n })
  }, [name])
  const setRound = useCallback(v => {
    _setRound(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'round'), n); return n })
  }, [name])
  const setHistory = useCallback(v => {
    _setHistory(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'history'), n); return n })
  }, [name])
  const setMilestoneStreak = useCallback(v => {
    _setMilestoneStreak(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'milestoneStreak'), n); return n })
  }, [name])
  const setStarBadgeThreshold = useCallback(v => {
    _setStarBadgeThreshold(prev => { const n = typeof v === 'function' ? v(prev) : v; save(sk(name, 'starBadgeThreshold'), n); return n })
  }, [name])
  const setLastGamePlayed = useCallback((gameId) => {
    _setLastGamePlayed(gameId)
    save(sk(name, 'lastGamePlayed'), gameId)
  }, [name])
  const setLastWordIndex = useCallback((idx) => {
    _setLastWordIndex(idx)
    save(sk(name, 'lastWordIndex'), idx)
  }, [name])

  // Mission round resets at midnight even mid-session (not just on reopen).
  useEffect(() => {
    const check = () => { if (round.date !== todayStr()) setRound(freshRound()) }
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [round.date, setRound])

  const bumpHistory = useCallback((patchFn) => {
    const today = todayStr()
    setHistory(prev => {
      const day = prev[today] || freshHistoryDay()
      return { ...prev, [today]: { ...day, ...patchFn(day) } }
    })
  }, [setHistory])

  // Every star gain (quiz, pronunciation, level-up mission, mission bonus,
  // duplicate sticker) funnels through here, so the daily history's
  // starsEarned total is always accurate without touching every call site.
  const addStars = useCallback((n = 1) => {
    setStars(s => s + n)
    bumpHistory(day => ({ starsEarned: day.starsEarned + n }))
  }, [setStars, bumpHistory])

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

  const markWordViewed = useCallback((wordId) => {
    setRound(prev => prev.wordsViewed.includes(wordId) ? prev : { ...prev, wordsViewed: [...prev.wordsViewed, wordId] })
  }, [setRound])

  const markExampleHeard = useCallback(() => {
    setRound(prev => ({ ...prev, examplesHeard: prev.examplesHeard + 1 }))
  }, [setRound])

  const markQuizSolved = useCallback(() => {
    setRound(prev => ({ ...prev, quizSolved: prev.quizSolved + 1 }))
  }, [setRound])

  const markPronunciationOk = useCallback(() => {
    setRound(prev => ({ ...prev, pronunciationOk: (prev.pronunciationOk || 0) + 1 }))
  }, [setRound])

  // Grants a sticker directly, bypassing the gift-box gacha (used for the
  // guaranteed streak-milestone reward). Duplicates still convert to stars
  // so a milestone pull is never wasted either.
  const grantSticker = useCallback((sticker) => {
    const isDuplicate = stickerTypes.includes(sticker.id)
    if (isDuplicate) addStars(DUPLICATE_BONUS_STARS)
    else {
      setStickerTypes(prev => [...prev, sticker.id])
      bumpHistory(day => ({ stickersEarned: [...day.stickersEarned, sticker.id] }))
    }
    return isDuplicate
  }, [stickerTypes, addStars, setStickerTypes, bumpHistory])

  // Round completion: all 4 daily categories reached goal → open a gift box
  // (rarity-weighted random sticker, duplicates become bonus stars instead
  // of a second copy), award a flat completion bonus, log it in today's
  // history (feeds the diary calendar + streak), then immediately start
  // the next round — missions repeat all day, not once.
  useEffect(() => {
    const allDone = (
      round.wordsViewed.length >= GOAL &&
      round.examplesHeard >= GOAL &&
      round.quizSolved >= GOAL &&
      (round.pronunciationOk || 0) >= GOAL
    )
    if (!allDone) return
    const signature = `${round.date}:${round.wordsViewed.length}:${round.examplesHeard}:${round.quizSolved}:${round.pronunciationOk}`
    if (handledRoundRef.current === signature) return
    handledRoundRef.current = signature

    addStars(MISSION_BONUS_STARS)
    bumpHistory(day => ({ missionsCompleted: day.missionsCompleted + 1 }))
    const sticker = getRandomSticker()
    const isDuplicate = grantSticker(sticker)
    setGiftQueue(q => [...q, { sticker, isDuplicate, isMilestone: false }])
    setRound(freshRound())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  // Streak milestones (3/7/14/30 consecutive days) — checked whenever
  // history changes, guarded by the highest milestone already celebrated so
  // it only fires once per threshold, ever, per student.
  useEffect(() => {
    const streak = calcStreak(history)
    const nextMilestone = STREAK_MILESTONES.find(m => streak >= m && m > milestoneStreak)
    if (!nextMilestone) return
    setMilestoneStreak(nextMilestone)
    const sticker = getMilestoneSticker()
    const isDuplicate = grantSticker(sticker)
    setGiftQueue(q => [...q, { sticker, isDuplicate, isMilestone: true, streakDays: nextMilestone }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  // Star-count badges (100/300/500/1000⭐) — same guaranteed-once pattern as
  // streak milestones, just gated by total stars instead of days.
  useEffect(() => {
    const nextBadge = STAR_BADGES.find(b => stars >= b.threshold && b.threshold > starBadgeThreshold)
    if (!nextBadge) return
    setStarBadgeThreshold(nextBadge.threshold)
    const sticker = STICKERS.find(s => s.id === nextBadge.stickerId)
    if (!sticker) return
    const isDuplicate = grantSticker(sticker)
    setGiftQueue(q => [...q, { sticker, isDuplicate, isBadge: true, badgeThreshold: nextBadge.threshold }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars])

  const dismissGift = useCallback(() => setGiftQueue(q => q.slice(1)), [])

  const placeSticker = useCallback((stickerId, x, y) => {
    setDiaryPlacements(prev => [...prev, {
      placementId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      stickerId, x, y, rotation: 0, scale: 1,
    }])
  }, [setDiaryPlacements])

  const updatePlacement = useCallback((placementId, patch) => {
    setDiaryPlacements(prev => prev.map(p => p.placementId === placementId ? { ...p, ...patch } : p))
  }, [setDiaryPlacements])

  const removePlacement = useCallback((placementId) => {
    setDiaryPlacements(prev => prev.filter(p => p.placementId !== placementId))
  }, [setDiaryPlacements])

  const dailyProgress = {
    words:          Math.min(round.wordsViewed.length, GOAL),
    examples:       Math.min(round.examplesHeard, GOAL),
    quizzes:        Math.min(round.quizSolved, GOAL),
    pronunciations: Math.min(round.pronunciationOk || 0, GOAL),
  }
  const missionsCompletedToday = history[todayStr()]?.missionsCompleted || 0
  const streak = calcStreak(history)

  return {
    stars, stickerTypes, diaryPlacements, missions,
    activeMissions: missions.filter(m => !m.done),
    cleared, round, dailyProgress, missionsCompletedToday, history, streak,
    lastGamePlayed, setLastGamePlayed,
    lastWordIndex, setLastWordIndex,
    pendingGift: giftQueue[0] || null, dismissGift,
    addStars, addMission, answerMission,
    markWordViewed, markExampleHeard, markQuizSolved, markPronunciationOk,
    placeSticker, updatePlacement, removePlacement,
  }
}
