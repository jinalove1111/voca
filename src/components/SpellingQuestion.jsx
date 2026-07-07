import { useState, useEffect, useRef } from 'react'
import { playRepeating, stopCurrentAudio, playSuccessSound } from '../utils/speech'
import { isSpellingCorrect, spellingHintFor } from '../utils/spelling'

// 초등학생이 발음을 듣고 철자를 떠올릴 수 있을 만큼 천천히, 그러나
// 로봇처럼 부자연스럽게 들리지 않는 속도. 앱 전체 재생 속도 설정
// (SpeedBtn, 학생이 바꿀 수 있음)과 무관하게 쓰기 시험은 항상 이 속도로
// 고정 — 이미 이 앱의 "🐢 천천히" 프리셋으로 검증된 값(0.6)을 그대로 재사용.
const SPELLING_RATE = 0.6
const SPELLING_GAP_MS = 1000 // 반복 사이 약 1초 대기

// 쓰기 시험 한 문제 — 영국식 발음으로 3번(반복 사이 1초 간격, 20~30%
// 느린 자연스러운 속도) 들려주고 영어 단어는 절대 보여주지 않음, 한글
// 뜻만 표시. 학생이 철자를 입력해 제출하면 대소문자/앞뒤 공백을 무시하고
// 채점. 틀리면 정답을 보여주고 같은 방식(3번, 1초 간격)으로 다시
// 들려준 뒤, 학생이 직접 다시 입력해서 정확히 맞혀야 이 문제를 통과함.
// 단어 카드/스피커를 언제 탭해도 진행 중이던 재생을 즉시 멈추고 처음부터
// 다시 3번 재생 — speech.js의 TTS singleton(claimTtsCall)이 겹쳐 들리는
// 것을 구조적으로 막아줘서 여기서 따로 잠금 처리할 필요 없음.
export default function SpellingQuestion({ word, meaning, wordAudioUrl, hintEnabled, onResult, onDone }) {
  const [phase, setPhase] = useState('listening') // listening | answer | wrong | correct
  const [replaying, setReplaying] = useState(false) // 재생 중 표시만 — 이미 입력한 답은 화면에 그대로 유지됨
  const [input, setInput] = useState('')
  const [retryInput, setRetryInput] = useState('')
  const [showHint, setShowHint] = useState(false)
  const reportedRef = useRef(false)
  const cancelRef = useRef(null)
  const inputRef = useRef(null)
  const retryInputRef = useRef(null)

  const playSequence = (onAllDone) => {
    cancelRef.current?.() // 재생 중 다시 터치 -> 기존 재생을 먼저 멈추고 처음부터 다시
    setReplaying(true)
    cancelRef.current = playRepeating(wordAudioUrl, word, {
      times: 3,
      gapMs: SPELLING_GAP_MS,
      rate: SPELLING_RATE,
      source: 'spelling',
      onAllDone: () => { setReplaying(false); onAllDone?.() },
      onError: () => { setReplaying(false); onAllDone?.() },
    })
  }

  // 문제 등장(마운트/단어 변경) — 3번 들려준 뒤 입력창에 자동 포커스.
  useEffect(() => {
    setPhase('listening')
    setInput('')
    setRetryInput('')
    setShowHint(false)
    reportedRef.current = false

    playSequence(() => {
      setPhase('answer')
      // 모바일에서 키보드가 바로 뜨도록 포커스 — 단, iOS Safari는 사용자
      // 제스처 밖(비동기 콜백)에서 호출된 focus()는 키보드를 안 띄울 수도
      // 있음(플랫폼 자체 제약이라 100% 보장은 어려움).
      setTimeout(() => inputRef.current?.focus(), 50)
    })

    return () => { cancelRef.current?.(); stopCurrentAudio() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, wordAudioUrl])

  // 오답 → 정답 공개 화면에서도 같은 방식(3번, 1초 간격, 같은 속도)으로
  // 다시 들려준 뒤 재입력 칸에 포커스 — "정답 스펠링을 보면서 정확한
  // 발음도 함께 복습"하도록.
  useEffect(() => {
    if (phase !== 'wrong') return
    playSequence(() => {
      setTimeout(() => retryInputRef.current?.focus(), 50)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const playAgain = () => {
    // phase(입력 상태)는 그대로 유지 — 재생 중이어도 이미 쓴 답이 안 사라짐.
    playSequence(() => {
      setTimeout(() => {
        if (phase === 'wrong') retryInputRef.current?.focus()
        else inputRef.current?.focus()
      }, 50)
    })
  }

  // 정답이면 효과음을 먼저 들려주고, 0.7초 후에 다음 문제로 — 효과음이
  // 잘리지 않고 다 들리도록 onDone을 곧바로 부르지 않음.
  const markCorrect = () => {
    setPhase('correct')
    playSuccessSound()
    setTimeout(() => onDone?.(), 700)
  }

  const submitFirst = () => {
    if (!input.trim()) return
    const correct = isSpellingCorrect(input, word)
    if (!reportedRef.current) { reportedRef.current = true; onResult?.(correct) }
    if (correct) markCorrect()
    else setPhase('wrong')
  }

  const submitRetry = () => {
    if (!retryInput.trim()) return
    if (isSpellingCorrect(retryInput, word)) markCorrect()
    // 틀리면 재입력 화면에 계속 머무름 — 맞을 때까지 다시 시도.
  }

  const hint = spellingHintFor(word)

  return (
    <div className="bg-white rounded-3xl card-shadow p-6 space-y-4">
      <p className="text-center text-gray-500 font-bold text-sm">✏️ 철자 쓰기</p>

      <button onClick={playAgain} disabled={phase === 'correct'}
        className="w-full bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-6 text-center text-white btn-press">
        <p className={`text-4xl mb-2 ${replaying ? 'animate-pulse' : ''}`}>🔊</p>
        <p className="text-3xl font-black">{meaning}</p>
        <p className="text-teal-100 text-xs mt-2">탭하면 발음을 다시 들려줘요 (3번, 천천히)</p>
      </button>

      {hintEnabled && phase !== 'correct' && (
        <div className="text-center">
          {showHint ? (
            <p className="text-gray-400 font-black tracking-widest text-lg">{hint}</p>
          ) : (
            <button onClick={() => setShowHint(true)} className="text-xs text-teal-500 font-bold btn-press">💡 힌트 보기</button>
          )}
        </div>
      )}

      {phase === 'listening' && (
        <p className="text-center text-gray-400 text-sm animate-pulse">🔊 잘 들어보세요... (3번 들려드려요)</p>
      )}

      {phase === 'answer' && (
        <div className="space-y-3">
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitFirst()}
            placeholder="영어로 철자를 입력하세요" autoFocus autoCapitalize="off" autoCorrect="off" spellCheck="false"
            className="w-full border-2 border-teal-200 rounded-xl px-4 py-4 text-xl font-black text-center focus:outline-none focus:border-teal-500" />
          <button onClick={submitFirst}
            className="w-full bg-teal-500 hover:bg-teal-600 text-white font-black py-4 rounded-2xl btn-press text-lg">
            확인
          </button>
        </div>
      )}

      {phase === 'wrong' && (
        <div className="space-y-3 animate-slide-up">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-center">
            <p className="text-red-500 font-bold text-sm mb-1">아쉬워요! 정답은:</p>
            <p className="text-red-600 font-black text-2xl tracking-wide">{word}</p>
          </div>
          <p className="text-center text-xs text-gray-400">정답을 보고 똑같이 한 번 더 입력해봐요</p>
          <input ref={retryInputRef} type="text" value={retryInput} onChange={e => setRetryInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitRetry()}
            placeholder="다시 입력하세요" autoFocus autoCapitalize="off" autoCorrect="off" spellCheck="false"
            className="w-full border-2 border-red-200 rounded-xl px-4 py-4 text-xl font-black text-center focus:outline-none focus:border-red-500" />
          <button onClick={submitRetry}
            className="w-full bg-red-400 hover:bg-red-500 text-white font-black py-4 rounded-2xl btn-press text-lg">
            확인
          </button>
        </div>
      )}

      {phase === 'correct' && (
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 text-center animate-slide-up">
          <p className="text-3xl mb-1">✅</p>
          <p className="text-green-600 font-black text-lg">정답이에요! &ldquo;{word}&rdquo;</p>
        </div>
      )}
    </div>
  )
}
