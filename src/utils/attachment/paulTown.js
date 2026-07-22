// Paul Town v2.0 (2026-07-22, 애착 시스템 확장) — 순수 파생 엔진.
//
// ── 아키텍처 규칙(운영자 확정, 2026-07-22) ──
// "Paul Town의 모든 것은 학습 이력에서 생성된다. 수동 상태는 꼭 필요한
//  경우가 아니면 절대 만들지 않는다. DB에는 사실(facts)만 담고, Paul Town은
//  그 사실에서 감정을 파생한다. 중복된 감정 상태 저장 금지, 결정론적 생성
//  우선."
//
// 이 모듈의 모든 함수는 순수 파생이다 — 저장 0, I/O 0, React 0, 무작위 0.
// 입력은 deriveAttachmentStats(attachmentCore.js)가 기존 진행 레코드
// (cleared/wordStatus/missions/history/streak/spellingReviewQueue)에서
// 파생한 stats + 호출자가 넘기는 ctx뿐이고, 같은 입력이면 항상 같은
// 출력이다. 새 DB 테이블/컬럼 없음, 새 화폐 없음. (이 파일은 DB 클라이언트
// /브라우저 저장소를 import조차 하지 않는다 — 하네스가 문자열 부재로 단언.)
//
// 허용되는 저장 상태는 기존 3가지 "사실"뿐이다(이 모듈 밖, useStudent
// 레코드): hatInventory(획득 이벤트 — earnedAt 보존·회수 없음 보장에
// 필요), equippedHatId(학생의 명시적 선택), milestones(타임스탬프 이벤트
// 로그 — 발생 시점은 집계에서 복원 불가). 그 외 — "오늘의 발견을 봤는지",
// "씨앗이 심겼는지" 같은 것 — 는 전부 dayKey 결정론 파생으로 해결하고
// 새 저장 필드를 절대 추가하지 않는다:
//   - 오늘의 발견: dayKey 해시로 그날의 메시지가 결정된다(하루 종일 동일,
//     날이 바뀌면 자동으로 바뀜 — "봤는지" 플래그가 필요 없다).
//   - 별→씨앗: history[오늘/어제].starsEarned에서 매번 파생("한 번 심으면
//     한 번 나타난다" = 날짜별 결정론 파생이지 심었다는 별도 기록이 아니다).
//
// 진실성 원칙은 폴의 기억(paulMemory.js)과 동일: 없는 데이터를 주장하지
// 않고, 죄책감/압박 언어("왜 안 왔어" 류)를 쓰지 않는다.
import { computeWorldState, gardenPlots } from './worldProgress.js'

// ── 결정론 시드 — dayKey 문자열 해시(djb2). 무작위 함수 사용 금지. ──
function hashString(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

const keyFor = (now, offsetDays = 0) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetDays)
  return d.toDateString()
}

// ── 오늘의 발견 — 하루 1개, 5초 안에 읽는 짧은 메시지 ──
// 하네스가 "템플릿 수 ≥ 8"을 단언하는 진실 원천.
export const TODAYS_DISCOVERY_TEMPLATE_IDS = [
  'discovery-mastered-word',
  'discovery-star-sprout',
  'discovery-today-planted',
  'discovery-garden-grew',
  'discovery-new-hat',
  'discovery-month-stars',
  'discovery-words-total',
  'discovery-comeback',
  'discovery-streak',
  'discovery-welcome', // 폴백(데이터 전무 시)
]

/**
 * 오늘의 발견 — 그날 하루 동안 동일한 메시지 하나(결정론).
 * 선택 규칙: 데이터가 실존하는 템플릿만 후보(eligible)로 모은 뒤,
 * dayKey 해시 % 후보 수로 그날의 하나를 고른다. 무작위 없음 — 같은
 * 날 + 같은 데이터면 항상 같은 메시지, 날이 바뀌면 바뀔 수 있다.
 * @param stats deriveAttachmentStats 결과
 * @param ctx { wordTextById: Map(slug→표시 단어), recentHatName }
 */
export function pickTodaysDiscovery(stats, ctx = {}, now = new Date()) {
  const wordText = (wid) => ctx.wordTextById?.get?.(wid) || null
  const todayKey = keyFor(now, 0)
  const yKey = keyFor(now, 1)
  const today = stats.history?.[todayKey]
  const yesterday = stats.history?.[yKey]

  const eligible = []

  // 1) 완전히 익힌 단어 — 레벨업 미션 완료(3연속 정답) 단어가 실존할 때만.
  //    "오늘 마스터했다"는 시각 데이터가 없으므로 시점 주장은 하지 않는다.
  for (const [wid, mission] of stats.missionByWordId || new Map()) {
    if (!mission?.done) continue
    const t = wordText(wid)
    eligible.push(
      t
        ? { id: 'discovery-mastered-word', emoji: '🏛️', text: `네가 완전히 익힌 단어 "${t}"가 Paul Town 박물관에서 반짝이고 있어!` }
        : { id: 'discovery-mastered-word', emoji: '🏛️', text: `네가 완전히 익힌 단어들이 Paul Town 박물관에서 반짝이고 있어!` },
    )
    break // 결정론: 미션 배열 순서(삽입 순서)의 첫 완료 단어 하나만
  }
  // 2) 어제 심은 별 → 오늘 새싹 (history[어제].starsEarned 실존 시에만)
  if ((Number(yesterday?.starsEarned) || 0) > 0) {
    eligible.push({ id: 'discovery-star-sprout', emoji: '🌱', text: `어제 심은 별에서 새싹이 나왔어! 어제 네 별이야.` })
  }
  // 3) 오늘 심은 별
  const starsToday = Number(today?.starsEarned) || 0
  if (starsToday > 0) {
    eligible.push({ id: 'discovery-today-planted', emoji: '⭐', text: `오늘 별 ${starsToday}개를 정원에 심었어. 내일 아침이 기대되지 않아?` })
  }
  // 4) 정원 성장 — clearedCount 파생(gardenPlots 재사용, 저장 없음)
  const plots = gardenPlots(stats)
  const blooming = plots.filter((p) => p.stage === 'flower' || p.stage === 'tree').length
  if (blooming > 0) {
    eligible.push({ id: 'discovery-garden-grew', emoji: '🌸', text: `정원의 ${blooming}칸에 꽃과 나무가 자랐어. 전부 네가 배운 단어들이야!` })
  }
  // 5) 새 모자 — 획득 순간에만 ctx.recentHatName이 존재
  if (ctx.recentHatName) {
    eligible.push({ id: 'discovery-new-hat', emoji: '🎩', text: `폴의 집 모자걸이에 새 모자 "${ctx.recentHatName}"가 걸렸어. 써볼래?` })
  }
  // 6) 이번 달 모은 별 — history가 실제 월 창을 지원하는 값만
  let monthStars = 0
  for (const { key, date } of stats.studiedDays || []) {
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
      monthStars += Number(stats.history?.[key]?.starsEarned) || 0
    }
  }
  if (monthStars > 0) {
    eligible.push({ id: 'discovery-month-stars', emoji: '🌟', text: `이번 달에 별을 ${monthStars}개나 모았어. Paul Town 하늘이 환해졌어!` })
  }
  // 7) 누적 단어 수 — 클리어 단어가 실제로 있을 때
  if ((stats.clearedCount || 0) >= 5) {
    eligible.push({ id: 'discovery-words-total', emoji: '📖', text: `지금까지 단어 ${stats.clearedCount}개를 배웠어. Paul Town이 그만큼 자란 거야!` })
  }
  // 8) 돌아온 것 환영 — 실제 공백일 수가 계산될 때만, 죄책감 언어 없이
  if (stats.absenceDays != null && stats.absenceDays >= 3) {
    eligible.push({ id: 'discovery-comeback', emoji: '🤗', text: `다시 와줘서 정말 반가워! Paul Town은 언제나 네 자리를 남겨두고 있어.` })
  }
  // 9) 이어지는 날들 — 이어지고 있는 사실만(끊겨도 아무 말 안 함)
  if ((stats.streak || 0) >= 2) {
    eligible.push({ id: 'discovery-streak', emoji: '🔥', text: `${stats.streak}일 연속으로 Paul Town에 왔어. 폴이 매일 기다리고 있었어!` })
  }

  if (eligible.length === 0) {
    // 정직한 폴백 — 아직 발견할 데이터가 없다(없는 발견을 지어내지 않는다)
    return { id: 'discovery-welcome', emoji: '🏘️', text: `Paul Town에 온 걸 환영해! 단어를 배울 때마다 마을이 자라날 거야.` }
  }
  return eligible[hashString(todayKey) % eligible.length]
}

/**
 * 별→씨앗 상태 — history에서 매번 파생(새 영속 상태 없음).
 * "심었다/새싹이 났다"는 별도 기록이 아니라 날짜별 결정론 파생이다:
 * 같은 날 같은 history면 항상 같은 결과 → "한 번 심으면 한 번 나타난다".
 */
export function starSeedState(stats, now = new Date()) {
  const todayStars = Number(stats.history?.[keyFor(now, 0)]?.starsEarned) || 0
  const yesterdayStars = Number(stats.history?.[keyFor(now, 1)]?.starsEarned) || 0
  return {
    todayPlanted: todayStars > 0,
    yesterdaySprouted: yesterdayStars > 0,
    sproutLabel: '어제 네 별이야.',
  }
}

/**
 * 홈 밴드 한 줄 요약 — 꽃 수(=masteredCount), 오늘 심은 별, 월드 단계.
 * computeWorldState(worldProgress.js) 재사용 — 별도 계산 중복 없음.
 */
export function gardenBandSummary(stats, ctx = {}, now = new Date()) {
  const world = computeWorldState(stats)
  const flowerCount = stats.masteredCount || 0
  const seedsToday = Number(stats.history?.[keyFor(now, 0)]?.starsEarned) || 0
  const currentStage = [...world.stages].reverse().find((s) => s.unlocked) || world.stages[0]
  return {
    flowerCount,
    seedsToday,
    growthPoints: world.growthPoints,
    stageName: currentStage.name,
    world,
    text: `🌷 꽃 ${flowerCount}송이 · 오늘 심은 별 ${seedsToday}개 · ${currentStage.name}`,
  }
}

/**
 * 기존 학생 소급 환영 — 이미 배운 단어가 실제로 있을 때만, 정직한 숫자로.
 * 신규 학생(clearedCount 0)은 null — 소급 환영을 지어내지 않는다.
 * growthLevel은 clearedCount 파생(computeWorldState 잠금해제 수 — 단조).
 */
export function retroWelcome(stats) {
  const n = stats.clearedCount || 0
  if (n <= 0) return null
  const world = computeWorldState(stats)
  return {
    id: 'retro-welcome',
    emoji: '🏘️',
    growthLevel: world.stages.filter((s) => s.unlocked).length,
    text: `네가 지금까지 배운 단어 ${n}개로 Paul Town이 벌써 이만큼 자랐어!`,
  }
}

// ── 시계탑(타임머신) — 실제 이력만 다시 보는 창(window) 파생 ──
// 창 4개: 어제 / 지난주 / 한 달 전 / 일 년 전 오늘. 각 창은 history에
// 실제로 있는 것만 집계하고, 없으면 present=false — UI는 정직한 빈 상태
// ("이때의 기록은 아직 없어요")를 그리거나(앞 3개), 아예 그리지 않는다
// (일 년 전 오늘 — hideWhenAbsent). 없는 창을 지어내지 않는다.
const TIME_WINDOW_DEFS = [
  { id: 'yesterday', label: '어제', emoji: '🌙', fromOffset: 1, toOffset: 1, hideWhenAbsent: false },
  { id: 'lastWeek', label: '지난주', emoji: '📅', fromOffset: 7, toOffset: 13, hideWhenAbsent: false },
  { id: 'monthAgo', label: '한 달 전', emoji: '🗓️', fromOffset: 28, toOffset: 34, hideWhenAbsent: false },
]

/**
 * 타임머신 창 — 순수 파생(저장 0, 무작위 0). 같은 stats + 같은 now →
 * 항상 같은 결과. overcomeWordIds = 그 창에서 틀렸지만 지금은 이겨낸
 * 단어(미션 완료 또는 클리어) — "틀린 적 있음"을 극복 서사로만 쓴다
 * (죄책감 언어 없음, 표시는 호출자가 실단어 해석 가능할 때만).
 * @returns [{ id, label, emoji, present, daysStudied, starsEarned,
 *             quizCorrect, quizTotal, accuracy, missedWordIds,
 *             overcomeWordIds, hideWhenAbsent }]
 */
export function timeWindows(stats, now = new Date()) {
  const history = stats.history || {}
  const isOvercome = (wid) =>
    (stats.missionByWordId?.get?.(wid)?.done === true) || (stats.clearedSet?.has?.(wid) === true)

  const aggregate = (keys) => {
    let daysStudied = 0
    let starsEarned = 0
    let quizCorrect = 0
    let quizTotal = 0
    const missed = []
    for (const key of keys) {
      const d = history[key]
      if (!d) continue
      if (d.studied) daysStudied += 1
      starsEarned += Number(d.starsEarned) || 0
      quizCorrect += Number(d.quizCorrect) || 0
      quizTotal += Number(d.quizTotal) || 0
      for (const wid of Array.isArray(d.missedWordIds) ? d.missedWordIds : []) {
        if (!missed.includes(wid)) missed.push(wid)
      }
    }
    return {
      present: daysStudied > 0,
      daysStudied,
      starsEarned,
      quizCorrect,
      quizTotal,
      accuracy: quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : null,
      missedWordIds: missed,
      overcomeWordIds: missed.filter(isOvercome),
    }
  }

  const windows = TIME_WINDOW_DEFS.map((def) => {
    const keys = []
    for (let off = def.fromOffset; off <= def.toOffset; off++) keys.push(keyFor(now, off))
    return { id: def.id, label: def.label, emoji: def.emoji, hideWhenAbsent: def.hideWhenAbsent, ...aggregate(keys) }
  })

  // 일 년 전 오늘 — 정확히 같은 달력 날짜(작년)만. 그 날짜의 기록이
  // 실존할 때만 present — 없으면 UI가 창 자체를 그리지 않는다.
  const yearAgoDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const yearAgoKey = yearAgoDate.toDateString()
  windows.push({
    id: 'yearAgo',
    label: '일 년 전 오늘',
    emoji: '🕰️',
    hideWhenAbsent: true,
    dateLabel: `${yearAgoDate.getFullYear()}년 ${yearAgoDate.getMonth() + 1}월 ${yearAgoDate.getDate()}일`,
    ...aggregate([yearAgoKey]),
  })
  return windows
}

// ── 폴의 집 방 꾸미기 — 진행에서만 파생되는 소품(저장 0) ──
// 전부 단조 증가 지표(clearedCount/masteredCount/studiedDayCount/
// totalStarsEarned)만 쓴다 — 한 번 나타난 소품은 절대 사라지지 않는다.
// 잠긴 소품 체크리스트는 없다 — 열린 것만 보여준다(점진 발견).
export const HOME_DECO_ITEMS = [
  { id: 'deco-pot', emoji: '🪴', name: '창가 화분', when: (s) => (s.clearedCount || 0) >= 5 },
  { id: 'deco-frame', emoji: '🖼️', name: '벽 그림', when: (s) => (s.masteredCount || 0) >= 3 },
  { id: 'deco-shelf-books', emoji: '📚', name: '선반의 책들', when: (s) => (s.masteredCount || 0) >= 10 },
  { id: 'deco-clock', emoji: '🕰️', name: '벽시계', when: (s) => (s.studiedDayCount || 0) >= 10 },
  { id: 'deco-trophy', emoji: '🏆', name: '작은 트로피', when: (s) => (s.totalStarsEarned || 0) >= 50 },
  { id: 'deco-teddy', emoji: '🧸', name: '곰인형', when: (s) => (s.studiedDayCount || 0) >= 30 },
]

/**
 * 폴의 집에 나타난 소품 — 순수 파생. 같은 stats → 같은 소품 목록.
 * 반환은 열린 소품만(잠긴 것 목록/개수 없음 — 방은 그냥 조금씩 차 있다).
 */
export function paulHomeDeco(stats) {
  return HOME_DECO_ITEMS.filter((d) => d.when(stats)).map(({ id, emoji, name }) => ({ id, emoji, name }))
}

// ── 마을 데이터 모델 — PaulTown.jsx(마을=내비게이션)가 소비 ──
// open: 처음부터 열려 있는 곳(마을 안 섹션). requiresFlag:
// 'paulTownBuildings'가 켜져야 노출되는 건물(도서관/박물관/시계탑 —
// 별도 화면으로 이동). minCleared: 점진 발견 임계(clearedCount 파생 —
// worldProgress 구역 임계와 정합). screen: 건물 카드가 이동할 화면 id
// (App.jsx setScreen 값 — null이면 마을 안 섹션).
export const TOWN_PLACES = [
  { id: 'garden', emoji: '🌷', name: '정원', open: true, requiresFlag: null, minCleared: 0, features: [], screen: null, desc: '단어를 배울 때마다 자라는 나의 정원' },
  { id: 'paulHome', emoji: '🏡', name: '폴의 집', open: true, requiresFlag: null, minCleared: 0, features: ['hatRack'], screen: null, desc: '폴이 사는 집 — 모자걸이에 내 모자들이 걸려 있어요' },
  { id: 'museum', emoji: '🏛️', name: '박물관', open: false, requiresFlag: 'paulTownBuildings', minCleared: 30, features: [], screen: 'wordMuseum', desc: '내가 수집한 단어들이 전시되는 곳' },
  { id: 'library', emoji: '📚', name: '도서관', open: false, requiresFlag: 'paulTownBuildings', minCleared: 100, features: [], screen: 'bookshelf', desc: '완주한 유닛이 책이 되어 꽂히는 곳' },
  { id: 'clockTower', emoji: '🕰️', name: '시계탑', open: false, requiresFlag: 'paulTownBuildings', minCleared: 150, features: [], screen: 'timeMachine', desc: '나의 학습 시간이 흐르는 마을의 중심' },
]

/**
 * 마을 장소별 발견 상태 — 순수 파생. 플래그 조회는 호출자 주입
 * (isFlagEnabled 콜백)으로 받는다: 이 모듈은 어떤 저장소도 직접 읽지
 * 않는다(features.js는 브라우저 저장소를 만지므로 여기서 import 금지).
 * @param {function(string):boolean} isFlagEnabled — 예: isFeatureEnabled
 */
export function townPlacesState(stats, isFlagEnabled = () => false) {
  const cleared = stats.clearedCount || 0
  return TOWN_PLACES.map((p) => ({
    ...p,
    discovered: (p.open || (p.requiresFlag ? isFlagEnabled(p.requiresFlag) : false)) && cleared >= p.minCleared,
  }))
}
