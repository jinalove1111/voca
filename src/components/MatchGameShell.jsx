import { useState, useMemo, useRef, useEffect } from 'react'
import { playWordAudio, stopCurrentAudio, playSuccessSound, unlockAudio } from '../utils/speech'
import { ROUNDS, STAR_PER_CORRECT, pickNextTarget, buildOptions, TIER } from '../utils/matchGame'
import { pickReaction } from '../utils/paulReactions'
import HeroReaction from './HeroReaction'

// Generic "hear the word, tap the matching meaning" mini-game shell shared
// by every themed game (balloon/fishing/pizza/train) — only `theme` differs
// between them. words: the CURRENT class+unit's word list only (caller
// scopes this). onContinue: if provided, this was opened mid-lesson (bonus
// checkpoint) — its result screen offers "다음 단어 공부하기" using it, and
// "그만하기" resumes the lesson too. If omitted (opened from Dashboard or
// the auto-recommendation banner directly), it behaves standalone.
export default function MatchGameShell({ theme, words, onBack, onGrantReward, onContinue }) {
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
  const [answerPaul, setAnswerPaul] = useState(null)
  const lastWordRef = useRef(null)
  const advanceTimerRef = useRef(null)
  const shakeTimerRef = useRef(null)
  // 별 지급 단일 경로(2026-07-28) — 이 플레이 세션(시작하기~결과 화면) 전체를
  // 가리키는 고유 id. startGame()에서 새로 발급(diaryPlacements의
  // placementId와 동일한 timestamp+random 패턴). round별 star 지급의
  // dedupKey에 이 id + round 인덱스를 함께 써서, "같은 세션의 같은 라운드
  // 슬롯"에 대해서만 재지급을 막는다 — "한 번 더 하기"/재입장으로 만드는
  // 새 세션은 항상 새 sessionId를 받으므로 반복 플레이로 별을 다시 얻는
  // 기존 게임 설계(의도된 반복 보상)는 그대로 유지되고, 오직 "같은 라운드
  // 인스턴스에 대한 우발적 중복 호출"(예: 더블탭 레이스)만 차단된다.
  const sessionIdRef = useRef(null)

  // 정답 후 다음 라운드로 넘어가는 setTimeout, 오답 흔들림 표시를 되돌리는
  // setTimeout 둘 다 컴포넌트가 언마운트되면(예: 정답 직후 바로 "그만하기"
  // 연타) 취소 — 이미 사라진 화면에 setState가 뒤늦게 걸리는 일이 없게 함.
  useEffect(() => () => {
    clearTimeout(advanceTimerRef.current)
    clearTimeout(shakeTimerRef.current)
  }, [])

  const eligible = useMemo(() => (words || []).filter(w => w.word && w.meaning), [words])
  const canPlay = eligible.length >= 4

  const startGame = () => {
    unlockAudio()
    sessionIdRef.current = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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
    setAnswerPaul(null)
    setRound(roundIdx)
    if (t) {
      stopCurrentAudio()
      playWordAudio(t.wordAudioUrl, t.word, { times: 1, source: 'matchgame-round' })
    }
  }

  const replay = () => {
    if (!target) return
    stopCurrentAudio()
    playWordAudio(target.wordAudioUrl, target.word, { times: 1, source: 'matchgame-replay' })
  }

  const handleTap = (opt) => {
    if (locked || !target || wrongMeanings.includes(opt.meaning)) return

    if (opt.correct) {
      setLocked(true)
      setPicked(opt.meaning)
      setAnswerPaul(pickReaction('success'))
      playSuccessSound()
      if (!firstTryUsed) {
        setScore(s => s + 1)
        onGrantReward?.(STAR_PER_CORRECT, `matchgame:${sessionIdRef.current}:${round}:${target?.dbId || target?.word}`)
      }
      advanceTimerRef.current = setTimeout(() => {
        const next = round + 1
        if (next >= ROUNDS) setPhase('result')
        else nextRound(next)
      }, 1100)
    } else {
      setFirstTryUsed(true)
      setShakeMeaning(opt.meaning)
      setAnswerPaul(pickReaction('encourage'))
      setWrongMeanings(prev => [...prev, opt.meaning])
      shakeTimerRef.current = setTimeout(() => setShakeMeaning(null), 500)
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
    // 표시되는 별 개수는 실제 지급된 별(onGrantReward로 지급된 라운드별 STAR_PER_CORRECT)만
    // 반영한다 — 예전엔 올클리어 보너스를 화면에 보여주면서 실제로는 지급하지 않아
    // 학생에게 실제보다 더 많이 받은 것처럼 오해를 줬다(실제 보너스 지급 여부는
    // 별도 제품 결정 필요, 여기서는 구현하지 않음).
    const totalStars = score * STAR_PER_CORRECT
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
                <div className={`${theme.colors[i % theme.colors.length]} ${theme.itemShape} aspect-square w-full flex items-center justify-center text-white font-black text-sm px-2 text-center shadow-lg btn-press overflow-hidden`}>
                  <span className="max-w-full break-words [word-break:keep-all] leading-tight">{theme.itemEmoji} {opt.meaning}</span>
                </div>
              </button>
            )
          })}
        </div>

        {picked && (
          <div className="mt-8 text-center animate-slide-up">
            {/* playSuccessSound()가 이미 재생함 — HeroReaction은 효과음을
                재생하지 않으므로 중복 걱정 없음. 게임 고유의 테마 연출
                (풍선 터짐 등)은 그대로 유지하고 폴은 그 위에 함께 보여줌. */}
            <HeroReaction image={answerPaul?.image} size="md" />
            <p className="text-4xl mb-1">{theme.correctFx.emoji}</p>
            <p className="text-2xl font-black text-yellow-300">{theme.correctFx.label}</p>
            {!firstTryUsed && <p className="text-white font-bold">⭐ +{STAR_PER_CORRECT}</p>}
          </div>
        )}
        {shakeMeaning && !picked && (
          <div className="mt-8 text-center animate-slide-up">
            <HeroReaction image={answerPaul?.image} size="md" />
            <p className="text-3xl mb-1">{theme.wrongFx.emoji}</p>
            <p className="text-xl font-black text-white">{theme.wrongFx.label}</p>
          </div>
        )}
      </div>
    </div>
  )
}
