import { useState, useMemo, useRef } from 'react'
import { playWordAudio, stopCurrentAudio, playSuccessSound, unlockAudio } from '../utils/speech'
import { ROUNDS, STAR_PER_CORRECT, PERFECT_BONUS, pickNextTarget, buildOptions, TIER } from '../utils/matchGame'

// Generic "hear the word, tap the matching meaning" mini-game shell shared
// by every themed game (balloon/fishing/pizza/train) — only `theme` differs
// between them. words: the CURRENT class+unit's word list only (caller
// scopes this). onContinue: if provided, this was opened mid-lesson (bonus
// checkpoint) — its result screen offers "다음 단어 공부하기" using it, and
// "그만하기" resumes the lesson too. If omitted (opened from Dashboard or
// the auto-recommendation banner directly), it behaves standalone.
export default function MatchGameShell({ theme, words, onBack, onAddStars, onContinue }) {
  const [phase, setPhase] = useState('intro') // intro | playing | result
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0) // rounds correct on the first try
  const [target, setTarget] = useState(null)
  const [options, setOptions] = useState([])
  const [picked, setPicked] = useState(null)
  const [shakeMeaning, setShakeMeaning] = useState(null)
  const [wrongMeanings, setWrongMeanings] = useState([])
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
    setOptions(buildOptions(t, eligible))
    setPicked(null)
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

  const handleTap = (opt) => {
    if (locked || !target || wrongMeanings.includes(opt.meaning)) return

    if (opt.correct) {
      setLocked(true)
      setPicked(opt.meaning)
      playSuccessSound()
      if (!firstTryUsed) { setScore(s => s + 1); onAddStars?.(STAR_PER_CORRECT) }
      setTimeout(() => {
        const next = round + 1
        if (next >= ROUNDS) setPhase('result')
        else nextRound(next)
      }, 1100)
    } else {
      setFirstTryUsed(true)
      setShakeMeaning(opt.meaning)
      setWrongMeanings(prev => [...prev, opt.meaning])
      setTimeout(() => setShakeMeaning(null), 500)
    }
  }

  if (phase === 'intro') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br ${theme.bgGradient}`}>
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="text-7xl mb-4 animate-bounce">{theme.icon}</div>
          <h1 className="text-2xl font-black text-gray-800 mb-2">{theme.title}</h1>
          <p className="text-gray-500 text-sm mb-6">{theme.instructionText} (5문제)</p>
          {!canPlay ? (
            <p className="text-red-400 text-sm font-bold mb-4">단어가 부족해요. 선생님이 단어를 추가하면 게임을 할 수 있어요.</p>
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
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br ${theme.bgGradient}`}>
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="text-6xl mb-2">{theme.icon}</div>
          <p className="font-black text-gray-700 mb-4">{theme.title} 완료!</p>
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
    <div className={`min-h-screen p-4 flex flex-col bg-gradient-to-br ${theme.bgGradient}`}>
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
          {options.map((opt, i) => {
            const isPicked = picked === opt.meaning
            const isShaking = shakeMeaning === opt.meaning
            const isWrongDisabled = wrongMeanings.includes(opt.meaning)
            return (
              <button
                key={opt.meaning}
                onClick={() => handleTap(opt)}
                disabled={locked || isWrongDisabled}
                className={`relative transition-all duration-300 ${isPicked ? 'scale-150 opacity-0' : 'scale-100'} ${isShaking ? 'animate-wiggle' : ''} ${isWrongDisabled ? 'opacity-30' : ''}`}
              >
                <div className={`${theme.colors[i % theme.colors.length]} ${theme.itemShape} aspect-square w-full flex items-center justify-center text-white font-black text-sm px-2 text-center shadow-lg btn-press`}>
                  {theme.itemEmoji} {opt.meaning}
                </div>
              </button>
            )
          })}
        </div>

        {picked && (
          <div className="mt-8 text-center animate-slide-up">
            <p className="text-4xl mb-1">{theme.correctFx.emoji}</p>
            <p className="text-2xl font-black text-yellow-300">{theme.correctFx.label}</p>
            {!firstTryUsed && <p className="text-white font-bold">⭐ +{STAR_PER_CORRECT}</p>}
          </div>
        )}
        {shakeMeaning && !picked && (
          <div className="mt-8 text-center animate-slide-up">
            <p className="text-3xl mb-1">{theme.wrongFx.emoji}</p>
            <p className="text-xl font-black text-white">{theme.wrongFx.label}</p>
          </div>
        )}
      </div>
    </div>
  )
}
