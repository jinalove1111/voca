import { useState, useMemo, useRef } from 'react'
import { playWordAudio, stopCurrentAudio, playSuccessSound, unlockAudio } from '../utils/speech'

const ROUNDS = 5
const STAR_PER_CORRECT = 10
const PERFECT_BONUS = 10
const BALLOON_COLORS = ['bg-red-400', 'bg-blue-400', 'bg-yellow-400', 'bg-green-400', 'bg-pink-400', 'bg-purple-400']
// Only used as filler if the current unit has fewer than 4 words with
// distinct meanings — never mixed in with AI/network content, just a small
// fixed set of simple Korean meaning strings.
const FILLER_MEANINGS = ['사과', '행복한', '강', '음악', '화창한', '친구', '호랑이', '구름', '용감한', '조용한']

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickNextTarget(words, lastWord) {
  const pool = words.length > 1 ? words.filter(w => w.word !== lastWord) : words
  return pool[Math.floor(Math.random() * pool.length)]
}

// The question is spoken as the English word; the balloons are Korean
// meanings — the student matches sound to meaning, not sound to spelling.
function buildBalloons(target, words) {
  const others = words.filter(w => w.word !== target.word && w.meaning !== target.meaning)
  const distractorMeanings = [...new Set(shuffle(others).map(w => w.meaning))].slice(0, 3)
  let fi = 0
  while (distractorMeanings.length < 3 && fi < FILLER_MEANINGS.length) {
    const fm = FILLER_MEANINGS[fi++]
    if (fm !== target.meaning && !distractorMeanings.includes(fm)) distractorMeanings.push(fm)
  }
  const all = shuffle([target.meaning, ...distractorMeanings])
  return all.map((meaning, i) => ({ meaning, color: BALLOON_COLORS[i % BALLOON_COLORS.length], correct: meaning === target.meaning }))
}

const TIER = (score) =>
  score === ROUNDS ? { emoji: '🏆', msg: 'Excellent!' } :
  score === ROUNDS - 1 ? { emoji: '🎉', msg: 'Great Job!' } :
  score === ROUNDS - 2 ? { emoji: '👍', msg: 'Good!' } :
                          { emoji: '💪', msg: 'Keep Going!' }

// words: the CURRENT class+unit's word list only (caller scopes this).
// onContinue: if provided, this game was opened mid-lesson (bonus
// checkpoint) — its result screen offers "다음 단어 공부하기" using it,
// and "그만하기" resumes the lesson too instead of leaving the game.
// If omitted (opened from the Dashboard directly), it behaves standalone.
export default function BalloonGame({ words, onBack, onAddStars, onContinue }) {
  const [phase, setPhase] = useState('intro') // intro | playing | result
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0) // rounds correct on the first try
  const [target, setTarget] = useState(null)
  const [balloons, setBalloons] = useState([])
  const [popped, setPopped] = useState(null)
  const [shakeMeaning, setShakeMeaning] = useState(null)
  const [wrongMeanings, setWrongMeanings] = useState([]) // tapped-wrong balloons this round, disabled
  const [firstTryUsed, setFirstTryUsed] = useState(false)
  const [locked, setLocked] = useState(false)
  const lastWordRef = useRef(null)

  const eligible = useMemo(() => (words || []).filter(w => w.word && w.meaning), [words])
  const canPlay = eligible.length >= 4

  const startGame = () => {
    unlockAudio()
    setScore(0)
    nextRound(0)
    setPhase('playing')
  }

  const nextRound = (roundIdx) => {
    const t = pickNextTarget(eligible, lastWordRef.current)
    lastWordRef.current = t?.word || null
    setTarget(t)
    setBalloons(buildBalloons(t, eligible))
    setPopped(null)
    setShakeMeaning(null)
    setWrongMeanings([])
    setFirstTryUsed(false)
    setLocked(false)
    setRound(roundIdx)
    if (t) {
      stopCurrentAudio()
      playWordAudio(t.wordAudioUrl, t.word, { times: 1 })
    }
  }

  const replay = () => {
    if (!target) return
    stopCurrentAudio()
    playWordAudio(target.wordAudioUrl, target.word, { times: 1 })
  }

  const handleTap = (b) => {
    if (locked || !target || wrongMeanings.includes(b.meaning)) return

    if (b.correct) {
      setLocked(true)
      setPopped({ meaning: b.meaning })
      playSuccessSound()
      if (!firstTryUsed) { setScore(s => s + 1); onAddStars?.(STAR_PER_CORRECT) }
      setTimeout(() => {
        const next = round + 1
        if (next >= ROUNDS) setPhase('result')
        else nextRound(next)
      }, 1100)
    } else {
      setFirstTryUsed(true)
      setShakeMeaning(b.meaning)
      setWrongMeanings(prev => [...prev, b.meaning])
      setTimeout(() => setShakeMeaning(null), 500)
    }
  }

  if (phase === 'intro') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-sky-400 to-indigo-500">
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="text-7xl mb-4 animate-bounce">🎈</div>
          <h1 className="text-2xl font-black text-gray-800 mb-2">뜻 찾기 풍선 게임</h1>
          <p className="text-gray-500 text-sm mb-6">발음을 듣고 맞는 뜻 풍선을 터치하세요! (5문제)</p>
          {!canPlay ? (
            <p className="text-red-400 text-sm font-bold mb-4">단어가 4개 이상일 때 게임을 할 수 있어요.</p>
          ) : (
            <button onClick={startGame}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black py-4 rounded-2xl btn-press text-lg">
              🎮 시작하기
            </button>
          )}
          <button onClick={onBack} className="mt-3 text-gray-400 text-sm font-bold btn-press">
            {onContinue ? '← 학습으로 돌아가기' : '← 홈으로'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'result') {
    const { emoji, msg } = TIER(score)
    const bonus = score === ROUNDS ? PERFECT_BONUS : 0
    const totalStars = score * STAR_PER_CORRECT + bonus
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-sky-400 to-indigo-500">
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="text-6xl mb-2">🎉</div>
          <p className="font-black text-gray-700 mb-4">풍선 게임 완료!</p>
          <div className="text-5xl mb-2">{emoji}</div>
          <p className="text-4xl font-black text-indigo-600 mb-1">{score}/{ROUNDS}</p>
          <p className="text-xl font-black text-gray-700 mb-4">{msg}</p>
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-3 mb-6">
            <p className="text-yellow-700 font-black">⭐ +{totalStars}</p>
            {bonus > 0 && <p className="text-yellow-600 text-xs">(정답 {score * STAR_PER_CORRECT} + 올클리어 보너스 {bonus})</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={startGame}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl btn-press">한 번 더 하기</button>
            <button onClick={onContinue || onBack}
              className="flex-1 bg-indigo-500 text-white font-black py-3 rounded-2xl btn-press">
              {onContinue ? '다음 단어 공부하기' : '홈으로'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 flex flex-col bg-gradient-to-br from-sky-400 to-indigo-500">
      <div className="flex items-center justify-between max-w-lg mx-auto w-full pt-2 mb-4">
        <button onClick={onBack} className="text-white font-bold btn-press">← 그만하기</button>
        <div className="bg-white/90 rounded-2xl px-4 py-2 font-black text-indigo-600">
          {round + 1} / {ROUNDS} · ⭐ {score * STAR_PER_CORRECT}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
        <button onClick={replay} disabled={locked}
          className="bg-white/90 rounded-3xl px-6 py-4 mb-8 btn-press card-shadow">
          <span className="text-3xl">🔊</span>
          <p className="text-indigo-500 text-xs font-bold mt-1">다시 듣기</p>
        </button>

        <div className="grid grid-cols-2 gap-6 w-full px-6">
          {balloons.map((b) => {
            const isPopped = popped?.meaning === b.meaning
            const isShaking = shakeMeaning === b.meaning
            const isWrongDisabled = wrongMeanings.includes(b.meaning)
            return (
              <button
                key={b.meaning}
                onClick={() => handleTap(b)}
                disabled={locked || isWrongDisabled}
                className={`relative transition-all duration-300 ${isPopped ? 'scale-150 opacity-0' : 'scale-100'} ${isShaking ? 'animate-wiggle' : ''} ${isWrongDisabled ? 'opacity-30' : ''}`}
              >
                <div className={`${b.color} rounded-full aspect-square w-full flex items-center justify-center text-white font-black text-sm px-2 text-center shadow-lg btn-press`}
                  style={{ borderRadius: '50% 50% 50% 50% / 55% 55% 45% 45%' }}>
                  🎈 {b.meaning}
                </div>
              </button>
            )
          })}
        </div>

        {popped && (
          <div className="mt-8 text-center animate-slide-up">
            <p className="text-4xl mb-1">🎉🎊✨</p>
            <p className="text-2xl font-black text-yellow-300">야르!! 🎉</p>
            {!firstTryUsed && <p className="text-white font-bold">⭐ +{STAR_PER_CORRECT}</p>}
          </div>
        )}
        {shakeMeaning && !popped && (
          <div className="mt-8 text-center animate-slide-up">
            <p className="text-3xl mb-1">😆</p>
            <p className="text-xl font-black text-white">다시 한번!</p>
          </div>
        )}
      </div>
    </div>
  )
}
