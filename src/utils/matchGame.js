// Shared "hear the word, pick the matching meaning among 4" mechanic used
// by every mini-game (balloon pop, fishing, pizza, train) — only the visual
// theme differs between them. Keeping this logic in one place means the 4
// games can never drift out of sync on scoring/anti-repeat rules.
export const ROUNDS = 5
export const STAR_PER_CORRECT = 10
export const PERFECT_BONUS = 10

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
  return pool[Math.floor(Math.random() * pool.length)]
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
