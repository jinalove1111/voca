import { useState, useCallback, useEffect, useRef } from 'react'
import { getRandomSticker, getMilestoneSticker, STICKERS } from '../data/stickers'

// Student roster + class assignment live in Supabase (shared across every
// device) — see utils/wordLibrary.js. Per-student progress (stars, stickers,
// diary, missions, daily history) is keyed by student NAME and stored
// device-local (localStorage) as the fast/primary copy — every value here is
// 100% private per student and never shared with other students.
//
// 2026-07-09: localStorage does NOT travel with the student (a new phone, a
// cleared browser, or a wiped app has none of it) — an earlier version of
// this comment claimed re-logging in "restores fresh from whatever device is
// used," which was never actually true and was the root cause of reports of
// progress "disappearing." Every change is now ALSO backed up to Supabase
// (student_progress.full_record, fire-and-forget, see syncStudentProgress),
// and if a login's local record ever comes up empty, restoreFromCloudBackup()
// below tries that backup before assuming this is a genuinely brand-new
// student. Local storage stays authoritative whenever it actually has data —
// the cloud copy is a safety net, never a silent overwrite.
export { getStudents, addStudent, removeStudent, findStudentByName } from '../utils/wordLibrary'
import { syncStudentProgress, fetchFullProgress, setWordStatus as syncWordStatus } from '../utils/wordLibrary'

// ── Single unified progress store ───────────────────────────────────────
// Every per-student value the app tracks (stars, stickers, today's mission
// progress, permanent calendar history, streak bookkeeping, diary, level-up
// missions...) lives under ONE localStorage key, keyed by student name. This
// replaces the old scattered paulEasyVoca_{name}_{field} keys — the bug
// where the Dashboard, calendar, and reward popup could show different
// numbers for "today" came from those being read/written independently;
// one record read by every screen makes that impossible by construction.
const STORE_KEY = 'paul_easy_progress'
const OLD_PREFIX = 'paulEasyVoca'
const oldKey = (name, type) => `${OLD_PREFIX}_${name}_${type}`

function loadStore() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY))
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}
  } catch { return {} }
}
function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}
function readOld(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def }
}

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
  spellingWrongToday: [], // wordIds missed at least once in a spelling test today (deduped) — the "오답노트" queue the end-of-day review cycles through
})
const freshHistoryDay = () => ({
  studied: true,
  categoriesCompleted: 0, // 0-4: how many of today's 4 mission categories reached goal — THE single "완료한 미션" number shown everywhere
  giftsToday: 0,          // how many full 4/4 rounds were completed today (missions repeat all day) — internal bookkeeping only, never shown as "완료한 미션"
  starsEarned: 0,
  stickersEarned: [],
  gamesPlayed: {},        // gameId -> play count today, e.g. { balloon: 2, fishing: 1 }
  quizCorrect: 0,         // v1.3 admin analytics — every quiz answer, right or wrong (see recordQuizAnswer)
  quizTotal: 0,
  pronunciationAttempts: 0, // every pronunciation recording attempt, success or fail (see markPronunciationAttempt)
  missedWordIds: [],      // wordIds answered wrong today (duplicates allowed — frequency = how often missed)
  spellingCorrect: 0,     // spelling test analytics — first-try correct count
  spellingTotal: 0,       // spelling test analytics — total first attempts
})

function freshRecord(name) {
  return {
    studentId: name,
    totalStars: 0,
    stickers: [],          // owned sticker ids — badges (star/streak milestones) are just specific sticker ids granted via a guaranteed (non-gacha) path, tracked in this same collection rather than a separate list
    diaryPlacements: [],
    missions: [],          // level-up boss missions
    cleared: [],
    round: freshRound(),
    history: {},            // date string -> freshHistoryDay()
    milestoneStreak: 0,      // highest streak milestone already celebrated
    starBadgeThreshold: 0,   // highest star badge already granted
    lastGamePlayed: null,
    lastWordIndex: 0,
    wordStatus: {},          // v1.5 Skip 기능 — word.dbId -> 'known' | 'unknown' | 'skipped' | 'mastered'
  }
}

// One-time migration from the old scattered paulEasyVoca_{name}_{field} keys
// into the unified record, so existing students' progress isn't lost. Old
// keys are left in place untouched (harmless, just unused going forward).
function migrateOldData(name) {
  const rec = freshRecord(name)
  rec.totalStars = readOld(oldKey(name, 'stars'), 0) || 0
  rec.stickers = readOld(oldKey(name, 'stickerTypes'), [])
  rec.diaryPlacements = readOld(oldKey(name, 'diaryPlacements'), [])
  rec.missions = readOld(oldKey(name, 'missions'), [])
  rec.cleared = readOld(oldKey(name, 'cleared'), [])
  const oldRound = readOld(oldKey(name, 'round'), null)
  if (oldRound && oldRound.date === todayStr()) rec.round = { spellingWrongToday: [], ...oldRound }
  const oldHistory = readOld(oldKey(name, 'history'), {})
  // Old history used `missionsCompleted` as a repeat counter — map it onto
  // the new fields as a best-effort guess (>=1 repeat implies all 4
  // categories were completed at least once that day).
  rec.history = Object.fromEntries(Object.entries(oldHistory).map(([date, day]) => [date, {
    studied: true,
    categoriesCompleted: (day.missionsCompleted || 0) > 0 ? 4 : 0,
    giftsToday: day.missionsCompleted || 0,
    starsEarned: day.starsEarned || 0,
    stickersEarned: day.stickersEarned || [],
    gamesPlayed: {},
    quizCorrect: 0,
    quizTotal: 0,
    pronunciationAttempts: 0,
    missedWordIds: [],
    spellingCorrect: 0,
    spellingTotal: 0,
  }]))
  rec.milestoneStreak = readOld(oldKey(name, 'milestoneStreak'), 0) || 0
  rec.starBadgeThreshold = readOld(oldKey(name, 'starBadgeThreshold'), 0) || 0
  rec.lastGamePlayed = readOld(oldKey(name, 'lastGamePlayed'), null)
  rec.lastWordIndex = readOld(oldKey(name, 'lastWordIndex'), 0) || 0
  return rec
}

function loadRecord(name) {
  const store = loadStore()
  if (store[name]) return store[name]
  const migrated = migrateOldData(name)
  store[name] = migrated
  saveStore(store)
  return migrated
}

// Streak = consecutive days (walking back from today) with a fully
// completed mission (4/4 categories). If today has nothing yet, today
// isn't counted but doesn't zero out an existing streak either.
function calcStreak(history) {
  let streak = 0
  const d = new Date()
  if (!(history[d.toDateString()]?.categoriesCompleted >= 4)) d.setDate(d.getDate() - 1)
  while (history[d.toDateString()]?.categoriesCompleted >= 4) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// 0-4: how many of today's 4 mission categories (단어/예문/퀴즈/발음) are at
// or above GOAL right now — the single formula behind "완료한 미션",
// computed identically wherever it's needed (Dashboard, calendar, tests).
function countCategoriesCompleted(round) {
  return [
    round.wordsViewed.length >= GOAL,
    round.examplesHeard >= GOAL,
    round.quizSolved >= GOAL,
    (round.pronunciationOk || 0) >= GOAL,
  ].filter(Boolean).length
}

// "이 기기에 실제로 진행도가 있는가?" — 진짜 신규 학생과 "로컬스토리지가
// 비워져서 신규처럼 보이는" 학생을 구분할 수는 없지만(둘 다 이 함수 기준
// true), 어느 쪽이든 클라우드 백업을 확인해보는 게 안전하다 — 진짜
// 신규라면 백업도 없을 테니 조회만 하고 아무 일도 안 일어난다.
function isEmptyRecord(rec) {
  return rec.totalStars === 0 &&
    rec.stickers.length === 0 &&
    rec.missions.length === 0 &&
    rec.cleared.length === 0 &&
    rec.diaryPlacements.length === 0 &&
    Object.keys(rec.history).length === 0 &&
    Object.keys(rec.wordStatus || {}).length === 0
}

// Pure helpers exported for testing (see scripts/testProgress.mjs) — no
// behavior change, just visibility into the same logic the hook uses.
export { freshRecord, freshRound, freshHistoryDay, migrateOldData, calcStreak, countCategoriesCompleted, todayStr, GOAL, isEmptyRecord }

export function useStudent(name) {
  const [record, _setRecord] = useState(() => loadRecord(name))
  const handledRoundRef = useRef(null)

  // Every mutation goes through here — one place that both updates React
  // state and persists the ENTIRE record back to the one unified key, so no
  // field can ever be written to a stale/partial place.
  const patch = useCallback((patchFn) => {
    _setRecord(prev => {
      const next = { ...prev, ...patchFn(prev) }
      const store = loadStore()
      store[name] = next
      saveStore(store)
      return next
    })
  }, [name])

  // 이 로그인(마운트) 시점에 로컬 기록이 비어있으면(진짜 신규이거나,
  // 기기가 초기화/교체됐거나) 딱 한 번 클라우드 백업을 확인해서 복구를
  // 시도한다 — 로컬에 이미 데이터가 있으면 절대 건드리지 않음(덮어쓰기
  // 위험 없음). AppInner는 학생이 바뀔 때마다 통째로 마운트/언마운트되므로
  // (App.jsx의 `!student` 분기 참고) 이 useEffect는 로그인마다 정확히
  // 한 번씩 실행된다.
  useEffect(() => {
    if (!isEmptyRecord(record)) return
    let cancelled = false
    fetchFullProgress(name).then((backup) => {
      if (cancelled || !backup) return
      patch((prev) => (isEmptyRecord(prev) ? backup : {}))
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const { round, history, stickers: stickerTypes, diaryPlacements, missions, cleared, milestoneStreak, starBadgeThreshold, lastGamePlayed, lastWordIndex, totalStars: stars, wordStatus } = record

  const [giftQueue, setGiftQueue] = useState([])

  // Mission round resets at midnight even mid-session (not just on reopen).
  useEffect(() => {
    const check = () => { if (round.date !== todayStr()) patch(() => ({ round: freshRound() })) }
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [round.date, patch])

  const bumpHistory = useCallback((patchFn) => {
    const today = todayStr()
    patch(prev => {
      const day = prev.history[today] || freshHistoryDay()
      return { history: { ...prev.history, [today]: { ...day, ...patchFn(day) } } }
    })
  }, [patch])

  // Every star gain (quiz, pronunciation, level-up mission, mission bonus,
  // duplicate sticker) funnels through here, so the daily history's
  // starsEarned total is always accurate without touching every call site.
  const addStars = useCallback((n = 1) => {
    patch(prev => ({ totalStars: prev.totalStars + n }))
    bumpHistory(day => ({ starsEarned: day.starsEarned + n }))
  }, [patch, bumpHistory])

  const addMission = useCallback((wordId) => {
    patch(prev => ({
      missions: prev.missions.some(m => m.wordId === wordId)
        ? prev.missions
        : [...prev.missions, { wordId, correctCount: 0, done: false }],
    }))
  }, [patch])

  const answerMission = useCallback((wordId) => {
    let didClear = false
    patch(prev => ({
      missions: prev.missions.map(m => {
        if (m.wordId !== wordId || m.done) return m
        const next = m.correctCount + 1
        if (next >= 3) { didClear = true; return { ...m, correctCount: 3, done: true } }
        return { ...m, correctCount: next }
      }),
    }))
    if (didClear) {
      patch(prev => ({ cleared: prev.cleared.includes(wordId) ? prev.cleared : [...prev.cleared, wordId] }))
      addStars(3)
    }
    return didClear
  }, [patch, addStars])

  const markWordViewed = useCallback((wordId) => {
    patch(prev => prev.round.wordsViewed.includes(wordId)
      ? {}
      : { round: { ...prev.round, wordsViewed: [...prev.round.wordsViewed, wordId] } })
  }, [patch])

  const markExampleHeard = useCallback(() => {
    patch(prev => ({ round: { ...prev.round, examplesHeard: prev.round.examplesHeard + 1 } }))
  }, [patch])

  const markQuizSolved = useCallback(() => {
    patch(prev => ({ round: { ...prev.round, quizSolved: prev.round.quizSolved + 1 } }))
  }, [patch])

  const markPronunciationOk = useCallback(() => {
    patch(prev => ({ round: { ...prev.round, pronunciationOk: (prev.round.pronunciationOk || 0) + 1 } }))
  }, [patch])

  // Grants a sticker directly, bypassing the gift-box gacha (used for
  // guaranteed streak/star-badge rewards). Duplicates still convert to
  // stars so a guaranteed pull is never wasted either.
  const grantSticker = useCallback((sticker) => {
    const isDuplicate = stickerTypes.includes(sticker.id)
    if (isDuplicate) addStars(DUPLICATE_BONUS_STARS)
    else {
      patch(prev => ({ stickers: [...prev.stickers, sticker.id] }))
      bumpHistory(day => ({ stickersEarned: [...day.stickersEarned, sticker.id] }))
    }
    return isDuplicate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickerTypes, addStars, patch, bumpHistory])

  // Keeps today's "완료한 미션" (0-4 categories) as a running high-water
  // mark, independent of the round auto-resetting after a full completion —
  // this is the ONE value the Dashboard, calendar, and reward popup all read,
  // so they can never disagree about how many of today's 4 categories are done.
  useEffect(() => {
    const count = countCategoriesCompleted(round)
    const today = todayStr()
    const existing = history[today]?.categoriesCompleted || 0
    if (count > existing) bumpHistory(() => ({ categoriesCompleted: count }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  // Full round completion: all 4 daily categories reached goal → open a
  // gift box (rarity-weighted random sticker, duplicates become bonus stars
  // instead of a second copy), award a flat completion bonus, log it in
  // today's history (feeds the diary calendar + streak), then immediately
  // start the next round — missions repeat all day, not once.
  useEffect(() => {
    const allDone = countCategoriesCompleted(round) >= 4
    if (!allDone) return
    const signature = `${round.date}:${round.wordsViewed.length}:${round.examplesHeard}:${round.quizSolved}:${round.pronunciationOk}`
    if (handledRoundRef.current === signature) return
    handledRoundRef.current = signature

    addStars(MISSION_BONUS_STARS)
    bumpHistory(day => ({ giftsToday: day.giftsToday + 1 }))
    const sticker = getRandomSticker()
    const isDuplicate = grantSticker(sticker)
    setGiftQueue(q => [...q, { sticker, isDuplicate, isMilestone: false }])
    patch(() => ({ round: freshRound() }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  // Streak milestones (3/7/14/30 consecutive fully-completed days) —
  // checked whenever history changes, guarded by the highest milestone
  // already celebrated so it only fires once per threshold, ever.
  useEffect(() => {
    const streak = calcStreak(history)
    const nextMilestone = STREAK_MILESTONES.find(m => streak >= m && m > milestoneStreak)
    if (!nextMilestone) return
    patch(() => ({ milestoneStreak: nextMilestone }))
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
    patch(() => ({ starBadgeThreshold: nextBadge.threshold }))
    const sticker = STICKERS.find(s => s.id === nextBadge.stickerId)
    if (!sticker) return
    const isDuplicate = grantSticker(sticker)
    setGiftQueue(q => [...q, { sticker, isDuplicate, isBadge: true, badgeThreshold: nextBadge.threshold }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars])

  const dismissGift = useCallback(() => setGiftQueue(q => q.slice(1)), [])

  const placeSticker = useCallback((stickerId, x, y) => {
    patch(prev => ({
      diaryPlacements: [...prev.diaryPlacements, {
        placementId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        stickerId, x, y, rotation: 0, scale: 1,
      }],
    }))
  }, [patch])

  const updatePlacement = useCallback((placementId, patchFields) => {
    patch(prev => ({
      diaryPlacements: prev.diaryPlacements.map(p => p.placementId === placementId ? { ...p, ...patchFields } : p),
    }))
  }, [patch])

  const removePlacement = useCallback((placementId) => {
    patch(prev => ({ diaryPlacements: prev.diaryPlacements.filter(p => p.placementId !== placementId) }))
  }, [patch])

  const setLastGamePlayed = useCallback((gameId) => patch(() => ({ lastGamePlayed: gameId })), [patch])

  // Logs one play of a mini-game into today's history (calendar "게임 결과
  // 히스토리") — separate from setLastGamePlayed, which only tracks the most
  // recent game for the no-repeat rotation, not a per-day count.
  const recordGamePlayed = useCallback((gameId) => {
    bumpHistory(day => ({
      gamesPlayed: { ...(day.gamesPlayed || {}), [gameId]: (day.gamesPlayed?.[gameId] || 0) + 1 },
    }))
  }, [bumpHistory])

  // v1.3 admin-dashboard analytics — deliberately separate from
  // markQuizSolved (which only fires on a CORRECT answer and drives the
  // existing mission/round logic, unchanged). This fires on every answer,
  // right or wrong, purely for the "퀴즈 정답률"/"많이 틀린 단어" admin view.
  const recordQuizAnswer = useCallback((wordId, correct) => {
    bumpHistory(day => ({
      quizTotal: (day.quizTotal || 0) + 1,
      quizCorrect: (day.quizCorrect || 0) + (correct ? 1 : 0),
      missedWordIds: correct ? (day.missedWordIds || []) : [...(day.missedWordIds || []), wordId],
    }))
  }, [bumpHistory])

  // v1.3 admin-dashboard analytics ("발음 연습 횟수") — every attempted
  // recording, success or fail. Separate from markPronunciationOk, which
  // only fires on success and still drives the star/mission logic unchanged.
  const markPronunciationAttempt = useCallback(() => {
    bumpHistory(day => ({ pronunciationAttempts: (day.pronunciationAttempts || 0) + 1 }))
  }, [bumpHistory])

  // 쓰기 시험(Spelling Test) — 정답률 통계는 history(오늘 하루 누적)에,
  // 오답노트 큐는 round(오늘 하루치, 자정에 초기화)에 따로 둠. 큐는
  // "오늘 학습이 끝나면 자동 복습" 화면이 그대로 순회할 목록이라 굳이
  // history에 겹쳐 넣지 않고 round 쪽에만 둠 — 두 값 모두 자정 리셋
  // 타이밍이 같아서 항상 같은 날짜 범위를 가리킴.
  const recordSpellingAnswer = useCallback((wordId, correct) => {
    bumpHistory(day => ({
      spellingTotal: (day.spellingTotal || 0) + 1,
      spellingCorrect: (day.spellingCorrect || 0) + (correct ? 1 : 0),
    }))
    if (!correct) {
      patch(prev => prev.round.spellingWrongToday.includes(wordId)
        ? {}
        : { round: { ...prev.round, spellingWrongToday: [...prev.round.spellingWrongToday, wordId] } })
    }
  }, [bumpHistory, patch])

  // 복습 화면에서 한 단어를 맞히면 오답노트 큐에서 제거 — 큐가 비면
  // "오늘 틀린 단어 복습"이 끝난 것.
  const clearSpellingReviewWord = useCallback((wordId) => {
    patch(prev => ({
      round: { ...prev.round, spellingWrongToday: prev.round.spellingWrongToday.filter(id => id !== wordId) },
    }))
  }, [patch])

  const setLastWordIndex = useCallback((idx) => patch(() => ({ lastWordIndex: idx })), [patch])

  // v1.5 "알아요"/"모르겠어요" (Skip 기능) — 로컬(즉시, 새로고침에도 안전)
  // 과 Supabase word_status 테이블(관리자 조회용) 둘 다에 반영한다. 로컬
  // 기록은 patch()가 항상 하던 대로 즉시 저장되고, Supabase 쪽은 기존
  // syncStudentProgress와 동일하게 실패해도 학습 흐름을 막지 않도록
  // fire-and-forget으로 던진다. wordDbId가 없으면(아직 감사/생성 중인
  // 단어 등) 조용히 무시 — 로컬 상태도 안 바뀜.
  const setWordKnownState = useCallback((wordDbId, status) => {
    if (!wordDbId) return
    patch((prev) => ({ wordStatus: { ...prev.wordStatus, [wordDbId]: status } }))
    syncWordStatus(name, wordDbId, status).catch(() => {})
  }, [patch, name])
  const setWordKnown = useCallback((wordDbId) => setWordKnownState(wordDbId, 'known'), [setWordKnownState])
  const setWordUnknown = useCallback((wordDbId) => setWordKnownState(wordDbId, 'unknown'), [setWordKnownState])

  const dailyProgress = {
    words:          Math.min(round.wordsViewed.length, GOAL),
    examples:       Math.min(round.examplesHeard, GOAL),
    quizzes:        Math.min(round.quizSolved, GOAL),
    pronunciations: Math.min(round.pronunciationOk || 0, GOAL),
  }
  const today = todayStr()
  const todayHistory = history[today]
  const missionsCompletedToday = todayHistory?.categoriesCompleted || 0 // 0-4, THE "완료한 미션" number
  const missionFullyDoneToday = missionsCompletedToday >= 4
  const giftsToday = todayHistory?.giftsToday || 0 // how many full 4/4 rounds today — for "studied a lot" nudges only, never displayed as "완료한 미션"
  const todayStars = todayHistory?.starsEarned || 0
  const streak = calcStreak(history)

  // v1.3 admin dashboard — fire-and-forget sync to Supabase so the admin can
  // see a student's progress from a different device, WITHOUT changing how
  // progress is stored locally (localStorage stays the source of truth for
  // this student's own device; a sync failure here must never affect it).
  // Debounced 2s after the record settles so rapid successive updates (e.g.
  // a quiz streak) don't fire a network write per keystroke.
  // v1.4: also sends the full record as a cloud backup (fullRecord) — see
  // the restore-on-mount effect above and fetchFullProgress() in
  // wordLibrary.js. Same fire-and-forget/never-blocks guarantee.
  useEffect(() => {
    const t = setTimeout(() => {
      syncStudentProgress(name, {
        totalStars: record.totalStars,
        clearedCount: record.cleared.length,
        streak,
        stickersCount: record.stickers.length,
        fullRecord: record,
        daily: {
          categoriesCompleted: todayHistory?.categoriesCompleted || 0,
          starsEarned: todayHistory?.starsEarned || 0,
          quizCorrect: todayHistory?.quizCorrect || 0,
          quizTotal: todayHistory?.quizTotal || 0,
          pronunciationAttempts: todayHistory?.pronunciationAttempts || 0,
          missedWordIds: todayHistory?.missedWordIds || [],
        },
      }).catch(() => {})
    }, 2000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, record])

  return {
    stars, stickerTypes, diaryPlacements, missions,
    activeMissions: missions.filter(m => !m.done),
    cleared, round, dailyProgress,
    missionsCompletedToday, missionFullyDoneToday, giftsToday, todayStars,
    history, streak,
    lastGamePlayed, setLastGamePlayed, recordGamePlayed,
    recordQuizAnswer, markPronunciationAttempt,
    recordSpellingAnswer, clearSpellingReviewWord, spellingWrongToday: round.spellingWrongToday,
    lastWordIndex, setLastWordIndex,
    pendingGift: giftQueue[0] || null, dismissGift,
    addStars, addMission, answerMission,
    markWordViewed, markExampleHeard, markQuizSolved, markPronunciationOk,
    placeSticker, updatePlacement, removePlacement,
    wordStatus, setWordKnown, setWordUnknown,
  }
}
