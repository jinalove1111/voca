import { useState, useMemo, useRef } from 'react'
import { playWordAudio, stopCurrentAudio, playSuccessSound, unlockAudio } from '../utils/speech'

const ROUNDS = 10
const BALLOON_COLORS = ['bg-red-400', 'bg-blue-400', 'bg-yellow-400', 'bg-green-400', 'bg-pink-400', 'bg-purple-400']
// Only used as filler if the current unit has fewer than 4 words — never
// mixed in with AI/network content, just a small fixed English word list.
const FILLER_WORDS = ['apple', 'happy', 'river', 'music', 'sunny', 'friend', 'tiger', 'cloud', 'brave', 'quiet']

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

function buildBalloons(target, words) {
  const others = words.filter(w => w.word !== target.word)
  const distractorWords = shuffle(others).slice(0, 3).map(w => w.word)
  let fi = 0
  while (distractorWords.length < 3 && fi < FILLER_WORDS.length) {
    const fw = FILLER_WORDS[fi++]
    if (fw !== target.word && !distractorWords.includes(fw)) distractorWords.push(fw)
  }
  const all = shuffle([target.word, ...distractorWords])
  return all.map((word, i) => ({ word, color: BALLOON_COLORS[i % BALLOON_COLORS.length], correct: word === target.word }))
}

const TIER = (score) =>
  score === ROUNDS ? { emoji: '🏆', msg: 'Excellent!!' } :
  score >= 7        ? { emoji: '🎉', msg: 'Great Job!' } :
                       { emoji: '💪', msg: 'Keep Going!' }

export default function BalloonGame({ words, onBack, onAddStars }) {
  const [phase, setPhase] = useState('intro') // intro | playing | result
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [target, setTarget] = useState(null)
  const [balloons, setBalloons] = useState([])
  const [popped, setPopped] = useState(null) // { word, correct }
  const [shakeWord, setShakeWord] = useState(null)
  const [locked, setLocked] = useState(false)
  const lastWordRef = useRef(null)

  const eligible = useMemo(() => (words || []).filter(w => w.word), [words])

  const startGame = () => {
    unlockAudio()
    setScore(0)
    setRound(0)
    nextRound(0)
    setPhase('playing')
  }

  const nextRound = (roundIdx) => {
    const t = pickNextTarget(eligible, lastWordRef.current)
    lastWordRef.current = t?.word || null
    setTarget(t)
    setBalloons(buildBalloons(t, eligible))
    setPopped(null)
    setShakeWord(null)
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
    if (locked || !target) return
    setLocked(true)
    if (b.correct) {
      setPopped({ word: b.word, correct: true })
      playSuccessSound()
      setScore(s => s + 1)
      onAddStars?.(10)
    } else {
      setShakeWord(b.word)
    }
    setTimeout(() => {
      const next = round + 1
      if (next >= ROUNDS) setPhase('result')
      else nextRound(next)
    }, 1100)
  }

  if (phase === 'intro') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-sky-400 to-indigo-500">
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="text-7xl mb-4 animate-bounce">🎈</div>
          <h1 className="text-2xl font-black text-gray-800 mb-2">보너스 게임 시작!</h1>
          <p className="text-gray-500 text-sm mb-6">발음을 듣고 맞는 단어 풍선을 터치하세요!</p>
          {eligible.length < 2 ? (
            <p className="text-red-400 text-sm font-bold mb-4">이 유닛에 단어가 너무 적어요 😢</p>
          ) : (
            <button onClick={startGame}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black py-4 rounded-2xl btn-press text-lg">
              🎮 시작하기
            </button>
          )}
          <button onClick={onBack} className="mt-3 text-gray-400 text-sm font-bold btn-press">← 홈으로</button>
        </div>
      </div>
    )
  }

  if (phase === 'result') {
    const { emoji, msg } = TIER(score)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-sky-400 to-indigo-500">
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="text-6xl mb-2">{emoji}</div>
          <p className="text-3xl mb-2">⭐⭐⭐⭐⭐</p>
          <p className="text-4xl font-black text-indigo-600 mb-1">{score}/{ROUNDS}</p>
          <p className="text-3xl mb-2">⭐⭐⭐⭐⭐</p>
          <p className="text-xl font-black text-gray-700 mb-6">{msg}</p>
          <div className="flex gap-2">
            <button onClick={onBack}
              className="flex-1 border-2 border-gray-200 text-gray-500 font-bold py-3 rounded-2xl btn-press">홈으로</button>
            <button onClick={startGame}
              className="flex-1 bg-indigo-500 text-white font-black py-3 rounded-2xl btn-press">다시 하기</button>
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
          {round + 1} / {ROUNDS} · ⭐ {score * 10}
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
            const isPopped = popped?.word === b.word
            const isShaking = shakeWord === b.word
            return (
              <button
                key={b.word}
                onClick={() => handleTap(b)}
                disabled={locked}
                className={`relative transition-all duration-300 ${isPopped ? 'scale-150 opacity-0' : 'scale-100'} ${isShaking ? 'animate-wiggle' : ''}`}
              >
                <div className={`${b.color} rounded-full aspect-square w-full flex items-center justify-center text-white font-black text-lg shadow-lg btn-press`}
                  style={{ borderRadius: '50% 50% 50% 50% / 55% 55% 45% 45%' }}>
                  🎈 {b.word}
                </div>
              </button>
            )
          })}
        </div>

        {popped?.correct && (
          <div className="mt-8 text-center animate-slide-up">
            <p className="text-4xl mb-1">🎉🎊✨</p>
            <p className="text-2xl font-black text-yellow-300">야르!!</p>
            <p className="text-white font-bold">⭐ +10점</p>
          </div>
        )}
        {shakeWord && !popped && (
          <div className="mt-8 text-center animate-slide-up">
            <p className="text-3xl mb-1">😆</p>
            <p className="text-xl font-black text-white">다시 한번!</p>
          </div>
        )}
      </div>
    </div>
  )
}
