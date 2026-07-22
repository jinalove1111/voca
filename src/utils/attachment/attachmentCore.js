// 애착 시스템(Attachment & Growth, 2026-07-22) — 공유 파생 데이터 레이어.
//
// 폴의 기억 / 모자 컬렉션 / 단어 박물관 / 성장 앨범 / 잉글리시 월드 /
// 책장·이야기 파운데이션이 전부 이 모듈이 만드는 "derived stats" 하나를
// 입력으로 쓴다 — 서로 무관한 미니 기능이 아니라 같은 학생 진행 데이터를
// 공유하는 한 시스템이라는 요구사항을 코드 구조로 강제하는 지점.
//
// 설계 원칙 (진실 원천 중복 금지):
// - 이 모듈은 순수 함수만 있다. I/O 없음, React 없음, 저장 없음.
// - 입력은 useStudent.js record의 기존 필드들 그대로(cleared/wordStatus/
//   missions/history/streak/spellingReviewQueue). 어떤 값도 여기서 새로
//   저장하지 않는다 — 전부 매번 파생 계산(xp_totals VIEW와 같은 정신).
// - 단어 식별: record.cleared/missions는 word 텍스트 슬러그(word.id),
//   record.wordStatus는 words.id UUID(word.dbId) 키다(wordLibrary.js
//   mapWordRow 참고). 두 체계를 여기서 명시적으로 구분해 다룬다.
// - 날짜: history 키는 Date.toDateString() 포맷("Mon Jul 21 2026") —
//   useStudent.js todayStr()와 동일. 여기서도 그대로 따른다.

const dayMs = 24 * 60 * 60 * 1000

// history 키("Mon Jul 21 2026")를 로컬 자정 Date로. 파싱 실패는 null.
export function parseHistoryKey(key) {
  const d = new Date(key)
  return Number.isNaN(d.getTime()) ? null : d
}

// 단어별 숙달 티어 — 박물관의 실버/골드 상태.
//   gold   : wordStatus 'mastered' 또는 레벨업 미션 완료(3연속 정답)
//   silver : cleared(첫 학습 완료) 또는 wordStatus 'known'
//   none   : 아직 수집 전(박물관에서 실루엣으로 표시)
export function masteryTierFor(word, { clearedSet, wordStatus, missionByWordId }) {
  const st = word.dbId ? wordStatus[word.dbId] : undefined
  const mission = missionByWordId.get(word.id)
  if (st === 'mastered' || (mission && mission.done)) return 'gold'
  if (st === 'known' || clearedSet.has(word.id)) return 'silver'
  return 'none'
}

/**
 * 공유 파생 통계. 모든 애착 기능의 단일 입력.
 * @param {object} rec — useStudent record 필드 부분집합:
 *   { cleared, wordStatus, missions, history, streak, spellingReviewQueue }
 * @param {Date} now — 테스트 주입용(기본 현재 시각)
 */
export function deriveAttachmentStats(rec, now = new Date()) {
  const cleared = Array.isArray(rec.cleared) ? rec.cleared : []
  const wordStatus = rec.wordStatus && typeof rec.wordStatus === 'object' ? rec.wordStatus : {}
  const missions = Array.isArray(rec.missions) ? rec.missions : []
  const history = rec.history && typeof rec.history === 'object' ? rec.history : {}
  const spellingReviewQueue = Array.isArray(rec.spellingReviewQueue) ? rec.spellingReviewQueue : []

  const clearedSet = new Set(cleared)
  const missionByWordId = new Map(missions.map((m) => [m.wordId, m]))
  const masteredCount = Object.values(wordStatus).filter((s) => s === 'mastered').length

  // history 전체 합산(퀴즈 정답/시도, 학습한 날짜들, 단어별 누적 오답 수)
  let totalQuizCorrect = 0
  let totalQuizTotal = 0
  let totalStarsEarned = 0
  let firstMissionDayKey = null // categoriesCompleted>=4를 처음 달성한 날
  const missedCounts = {} // wordId(slug) -> 역대 오답 횟수(빈도)
  const studiedDays = [] // {key, date} 학습한 날만, 시간순 정렬됨
  for (const [key, day] of Object.entries(history)) {
    if (!day) continue
    const d = parseHistoryKey(key)
    if (!d) continue
    if (day.studied) studiedDays.push({ key, date: d })
    totalQuizCorrect += Number(day.quizCorrect) || 0
    totalQuizTotal += Number(day.quizTotal) || 0
    totalStarsEarned += Number(day.starsEarned) || 0
    if ((Number(day.categoriesCompleted) || 0) >= 4) {
      if (!firstMissionDayKey || d < parseHistoryKey(firstMissionDayKey)) firstMissionDayKey = key
    }
    for (const wid of Array.isArray(day.missedWordIds) ? day.missedWordIds : []) {
      missedCounts[wid] = (missedCounts[wid] || 0) + 1
    }
  }
  studiedDays.sort((a, b) => a.date - b.date)

  // 최근 학습일/공백일 — "돌아온 것 환영" 판정의 원천. 오늘 학습했다면 0.
  const lastStudied = studiedDays.length ? studiedDays[studiedDays.length - 1] : null
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const absenceDays = lastStudied
    ? Math.max(0, Math.round((todayMidnight - lastStudied.date) / dayMs))
    : null // 학습 기록 자체가 없으면 null — "공백"이라는 주장 자체를 하지 않는다

  // 이번 주 vs 지난주(월요일 시작) — 타임머신/향상 비교의 원천
  const dow = (todayMidnight.getDay() + 6) % 7 // 월=0
  const thisWeekStart = new Date(todayMidnight.getTime() - dow * dayMs)
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * dayMs)
  const weekBucket = () => ({ daysStudied: 0, quizCorrect: 0, quizTotal: 0, starsEarned: 0 })
  const thisWeek = weekBucket()
  const lastWeek = weekBucket()
  for (const { key, date } of studiedDays) {
    const day = history[key]
    const bucket = date >= thisWeekStart ? thisWeek : date >= lastWeekStart ? lastWeek : null
    if (!bucket) continue
    bucket.daysStudied += 1
    bucket.quizCorrect += Number(day.quizCorrect) || 0
    bucket.quizTotal += Number(day.quizTotal) || 0
    bucket.starsEarned += Number(day.starsEarned) || 0
  }

  // "극복한 단어" — 역대 2회 이상 틀렸거나 복습 큐에 있었는데 지금은
  // gold 티어인 단어(슬러그 기준). 밀스톤/폴의 기억이 공유.
  const strugglingIds = new Set([
    ...Object.entries(missedCounts).filter(([, n]) => n >= 2).map(([wid]) => wid),
    ...spellingReviewQueue.map((q) => (typeof q === 'object' ? q.wordId : q)).filter(Boolean),
  ])
  const improvedWordIds = [...strugglingIds].filter((wid) => {
    const mission = missionByWordId.get(wid)
    return (mission && mission.done) || clearedSet.has(wid)
  })

  return {
    clearedCount: cleared.length,
    clearedSet,
    masteredCount,
    missionByWordId,
    wordStatus,
    missedCounts,
    totalQuizCorrect,
    totalQuizTotal,
    totalStarsEarned,
    streak: Number(rec.streak) || 0,
    studiedDays,
    studiedDayCount: studiedDays.length,
    firstMissionDayKey,
    lastStudiedKey: lastStudied?.key ?? null,
    absenceDays,
    thisWeek,
    lastWeek,
    improvedWordIds,
    spellingReviewQueue,
    history,
  }
}

/**
 * 유닛 완료 판정 — 유닛의 모든 단어 슬러그가 cleared에 포함되면 완료.
 * wordsByUnit: [{unitName, unitId, words:[{id, dbId, ...}]}] (호출자가
 * wordLibrary getClassUnits/getClassWords로 구성 — 이 모듈은 I/O 없음).
 * 단어가 0개인 유닛은 "완료"로 치지 않는다(빈 유닛 방어).
 */
export function completedUnits(wordsByUnit, clearedSet) {
  const out = []
  for (const u of Array.isArray(wordsByUnit) ? wordsByUnit : []) {
    const words = Array.isArray(u.words) ? u.words : []
    if (words.length === 0) continue
    if (words.every((w) => clearedSet.has(w.id))) out.push(u)
  }
  return out
}
