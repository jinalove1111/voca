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
// rewardBlockedReason(2026-08-23 운영자 확정) — 'goal-not-met'이면 오늘
// 미션 4개 중 3개를 아직 못 채운 것이고, 'daily-limit'이면 오늘 보상 1세션을
// 이미 받은 것. null이면 평소대로 지급된다. **플레이 자체는 어떤 경우에도
// 막지 않는다** — 게임을 금지하는 게 아니라 보상 자격만 분리하는 설계라,
// 이 값은 오직 "별을 보여줄지 / 왜 없는지 설명할지"에만 쓰인다.
// 이 prop은 실시간 값이지만 판 안에서는 startGame()이 굳힌 sessionBlocked를
// 쓴다(아래 sessionBlockedRef 주석 — 한도 1에서 필수).
// 화면에 실제 지급액과 다른 별을 표시하지 않는다는 기존 원칙(아래 결과
// 화면 주석)을 그대로 따른다 — 차단 상태에서 ⭐+N을 띄우면 그게 곧 거짓말.
export default function MatchGameShell({ theme, words, onBack, onGrantReward, onContinue, rewardBlockedReason = null }) {
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
  // 2026-08-23 — 이 판이 "보상 세션"인지를 startGame() 시점에 굳힌다(latch).
  // 왜 필요한가: 일일 한도가 1이 되면, 1라운드에서 별을 받는 순간
  // countRewardedGameSessions가 1이 되어 gameRewardEligibility가 즉시
  // false로 뒤집힌다 — 실시간 prop으로 매 라운드 판정하면 같은 판의
  // 2~5라운드가 막혀 "하루 1회"가 "하루 1라운드"로 붕괴한다. 자격은 판
  // 단위로 결정되는 게 정책의 의미이므로, 시작 시점 값을 세션 내내 쓴다.
  // (결과 화면 표시도 같은 latch 값을 봐야 지급액과 어긋나지 않는다.)
  const sessionBlockedRef = useRef(null)
  const [sessionBlocked, setSessionBlocked] = useState(rewardBlockedReason)

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
    // 이 판의 보상 자격을 지금 확정한다(위 sessionBlockedRef 주석 참고).
    // "한 번 더 하기"로 새 판을 시작할 때도 여기를 다시 지나므로, 그 시점의
    // 최신 rewardBlockedReason(직전 판으로 한도가 찼으면 'daily-limit')이
    // 그대로 굳는다.
    sessionBlockedRef.current = rewardBlockedReason
    setSessionBlocked(rewardBlockedReason)
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
        // 점수(score)는 자격과 무관하게 항상 오른다 — 보상이 없어도 학생은
        // 자기 실력을 확인할 수 있어야 한다. 별만 latch된 자격을 따른다.
        setScore(s => s + 1)
        if (!sessionBlockedRef.current) {
          onGrantReward?.(STAR_PER_CORRECT, `matchgame:${sessionIdRef.current}:${round}:${target?.dbId || target?.word}`)
        }
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
    // 2026-08-22 — 보상이 차단된 세션은 0으로 표시한다(위 헤더 주석).
    const totalStars = sessionBlocked ? 0 : score * STAR_PER_CORRECT
    const blockedMsg = sessionBlocked === 'goal-not-met'
      ? { icon: '📚', title: '오늘 공부를 먼저 하면 별을 받아요!', sub: '오늘의 미션 4개 중 3개를 끝내고 다시 오면 ⭐을 줘요' }
      : sessionBlocked === 'daily-limit'
        ? { icon: '🌙', title: '오늘 게임 별은 다 받았어요!', sub: '내일 또 줄게요 — 지금은 연습으로 얼마든지 놀아도 좋아요' }
        : null
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br ${theme.bgGradient}`}>
        <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="text-6xl mb-2">{theme.icon}</div>
          <p className="font-black text-gray-700 mb-4">{theme.title} 완료!</p>
          <div className="text-5xl mb-2">{emoji}</div>
          <p className="text-4xl font-black text-indigo-600 mb-1">{score}/{ROUNDS}</p>
          <p className="text-xl font-black text-gray-700 mb-4">{msg}</p>
          {blockedMsg ? (
            <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-3 mb-6">
              <p className="text-sky-700 font-black">{blockedMsg.icon} {blockedMsg.title}</p>
              <p className="text-sky-500 text-xs font-bold mt-1">{blockedMsg.sub}</p>
            </div>
          ) : (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-3 mb-6">
              <p className="text-yellow-700 font-black">⭐ +{totalStars}</p>
            </div>
          )}
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
