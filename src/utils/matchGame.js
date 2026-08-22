// Shared "hear the word, pick the matching meaning among 4" mechanic used
// by every mini-game (balloon pop, fishing, pizza, train) — only the visual
// theme differs between them. Keeping this logic in one place means the 4
// games can never drift out of sync on scoring/anti-repeat rules.
export const ROUNDS = 5
// 2026-08-23 운영자 확정: 10 -> 4. 야간 감사 실측 — 게임이 별 경제의
// 69~78%를 찍어내고 학생 6명은 별의 100%를 게임으로만 벌었다(실학생 37명/
// 학생-일자 313건, 최다 사례는 하루 게임 18회 935별).
// 값 근거(가정이 아니라 18조합 전수 시뮬레이션 결과):
//   4/4 · 3별 · 2세션 -> 게임비중 11%, 접근 46%, 체감 1:0.81 (목표대역 미달)
//   3/4 · 3별 · 2세션 -> 게임비중 21%, 접근 81%, 체감 1:1.43 (달성일 역전)
//   3/4 · 4별 · 1세션 -> 게임비중 20%, 접근 81%, 체감 1:0.96 (채택)
// "게임 비중 20~30% + 달성일 역전 없음"을 동시에 만족하는 유일 조합이다.
// 보조 근거: 게임한 날의 54%가 1판으로 끝나므로, 세션 한도보다 라운드당
// 별이 실제로 작동하는 레버였다.
export const STAR_PER_CORRECT = 4
export const PERFECT_BONUS = 10

// 하루에 "보상을 받을 수 있는" 게임 세션 수(2026-08-23 운영자 확정).
// 플레이 횟수 자체는 제한하지 않는다 — 게임을 막는 게 아니라 보상 자격만
// 분리한다는 설계. 2판째부터는 그냥 재미로 하는 연습이 된다.
// 1인 이유: 2세션이면 하루 상한이 38별이 되어 3/4 달성일의 학습 유래 별
// 중앙값(20별)을 넘어 게임이 역전한다.
export const GAME_REWARD_DAILY_LIMIT = 1

// 보상 해금에 필요한 "오늘의 미션" 카테고리 수(4개 중 몇 개 — 2026-08-23
// 운영자 확정으로 4 -> 3 완화). 4/4는 실측 접근률이 46%(중등은 27%,
// 중등의 4/4 달성일은 전체의 5%)에 그쳐 대다수에게 닿지 않는 보상이었다.
// 3/4로 낮추면 접근률이 81%(초등 86% / 중등 73%)로 올라간다.
export const GAME_REWARD_GOAL_CATEGORIES = 3

// 게임 라운드 별 지급의 dedupKey 접두사 — MatchGameShell이 만드는
// `matchgame:<sessionId>:<round>:<word>` 형식과 한 곳에서 공유한다.
const GAME_DEDUP_PREFIX = 'matchgame:'

// 오늘 "보상을 받은" 게임 세션 수 — round.starGrantLog에서 파생한다.
// 새 영속 필드를 만들지 않는 이유: useStudent.js가 날짜가 바뀌면
// freshRound()로 round를 통째로 갈아끼우고 그때 starGrantLog가 []가 되므로,
// 이 배열은 이미 "오늘치"라는 의미를 갖는다. 마이그레이션/기존 레코드
// 변경이 전혀 필요 없다(규칙 9).
//
// 주의: 플레이 횟수(history[today].gamesPlayed)가 아니라 **지급된 세션**을
// 센다. 목표 달성 전에 연습으로 몇 판을 하든 보상 한도를 깎지 않는다.
export function countRewardedGameSessions(starGrantLog) {
  const sessions = new Set()
  for (const key of Array.isArray(starGrantLog) ? starGrantLog : []) {
    if (typeof key !== 'string' || !key.startsWith(GAME_DEDUP_PREFIX)) continue
    // `matchgame:<sessionId>:<round>:<word>` — sessionId는 startGame()이
    // 만드는 `${Date.now()}_${random}` 형식이라 콜론을 포함하지 않는다.
    // 형식이 어긋나도(빈 문자열 등) Set이 흡수하므로 절대 throw하지 않는다.
    sessions.add(key.slice(GAME_DEDUP_PREFIX.length).split(':')[0])
  }
  return sessions.size
}

// 지금 이 학생이 게임 보상을 받을 자격이 있는가(순수 함수).
// 반환: { eligible, reason } — reason은 'goal-not-met' | 'daily-limit' | null.
// 우선순위는 goal-not-met이 먼저다: 둘 다 해당하면 학생에게는 "먼저 오늘
// 공부를 끝내자"가 더 정확하고 행동 가능한 안내이기 때문.
export function gameRewardEligibility({ categoriesCompleted, starGrantLog } = {}) {
  const done = Number(categoriesCompleted) || 0
  if (done < GAME_REWARD_GOAL_CATEGORIES) return { eligible: false, reason: 'goal-not-met' }
  if (countRewardedGameSessions(starGrantLog) >= GAME_REWARD_DAILY_LIMIT) {
    return { eligible: false, reason: 'daily-limit' }
  }
  return { eligible: true, reason: null }
}

// Only used as filler if the current unit has fewer than 4 words with
// distinct meanings — never mixed in with AI/network content, just a small
// fixed set of simple Korean meaning strings.
export const FILLER_MEANINGS = ['사과', '행복한', '강', '음악', '화창한', '친구', '호랑이', '구름', '용감한', '조용한']

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pickNextTarget(words, lastWord) {
  const pool = words.length > 1 ? words.filter(w => w.word !== lastWord) : words
  // 방어: words에 lastWord와 같은 word 텍스트를 가진 항목만 있으면(예: 같은
  // 철자 중복 등록) pool이 비어 undefined를 반환해 호출부에서 null-deref가
  // 날 수 있다. MatchGameShell이 이미 eligible words>=4를 보장해 실제로는
  // 거의 발생하지 않지만, 비었을 때 words[0]로 폴백해 항상 유효한 단어를
  // 반환하도록 방어.
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : words[0]
}

// The question is spoken as the English word; the options are Korean
// meanings — the student matches sound to meaning, not sound to spelling.
export function buildOptions(target, words) {
  const others = words.filter(w => w.word !== target.word && w.meaning !== target.meaning)
  const distractorMeanings = [...new Set(shuffle(others).map(w => w.meaning))].slice(0, 3)
  let fi = 0
  while (distractorMeanings.length < 3 && fi < FILLER_MEANINGS.length) {
    const fm = FILLER_MEANINGS[fi++]
    if (fm !== target.meaning && !distractorMeanings.includes(fm)) distractorMeanings.push(fm)
  }
  return shuffle([target.meaning, ...distractorMeanings]).map((meaning) => ({ meaning, correct: meaning === target.meaning }))
}

export const TIER = (score) =>
  score === ROUNDS ? { emoji: '🏆', msg: 'Excellent!' } :
  score === ROUNDS - 1 ? { emoji: '🎉', msg: 'Great Job!' } :
  score === ROUNDS - 2 ? { emoji: '👍', msg: 'Good!' } :
                          { emoji: '💪', msg: 'Keep Going!' }

// ── Game rotation (no back-to-back repeat) ──────────────────────────────
export const GAMES = [
  { id: 'balloon', label: '뜻 찾기 풍선 게임', emoji: '🎈' },
  { id: 'fishing', label: '단어 낚시',         emoji: '🎣' },
  { id: 'pizza',   label: '피자 만들기',       emoji: '🍕' },
  { id: 'train',   label: '기차 태우기',       emoji: '🚂' },
]

export function pickNextGame(lastGameId) {
  const pool = GAMES.length > 1 ? GAMES.filter(g => g.id !== lastGameId) : GAMES
  return pool[Math.floor(Math.random() * pool.length)]
}
