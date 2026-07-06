import { useState, useEffect, useRef } from 'react'
import { playWordAudio, stopCurrentAudio, playSuccessSound } from '../utils/speech'
import { isSpellingCorrect, spellingHintFor } from '../utils/spelling'

// 쓰기 시험 한 문제 — 발음만 2~3번 들려주고 영어 단어는 절대 보여주지
// 않음, 한글 뜻만 표시. 학생이 철자를 입력해 제출하면 대소문자/앞뒤
// 공백을 무시하고 채점. 틀리면 정답을 빨간색으로 보여준 뒤, 학생이
// 직접 다시 입력해서 정확히 맞혀야 이 문제를 통과함(재입력도 동일하게
// 대소문자/공백 무시). onResult(correct)는 첫 시도 결과만 분석용으로
// 한 번 보고하고, onDone()은 (첫 시도든 재입력 후든) 최종적으로 통과한
// 순간에 정답 효과음이 끝난 뒤 호출됨 — 부모가 onDone을 받아야 다음으로 넘어감.
export default function SpellingQuestion({ word, meaning, wordAudioUrl, hintEnabled, onResult, onDone }) {
  const [phase, setPhase] = useState('listening') // listening | answer | wrong | correct
  const [input, setInput] = useState('')
  const [retryInput, setRetryInput] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [manualPlaying, setManualPlaying] = useState(false)
  const reportedRef = useRef(false)

  // 처음 들어왔을 때 발음을 3번 들려주는 루프를 컴포넌트가 직접 취소
  // 가능하게 관리 — playWordAudio(times:3)에 내부적으로 맡기면 그
  // setTimeout 체인을 외부에서 취소할 방법이 없어서, StrictMode의
  // effect 이중 실행이나 이 화면이 빠르게 재마운트되는 경우 이전 재생과
  // 새 재생이 겹쳐 "에코"처럼 두 번 들리는 문제가 있었음. cancelled
  // 플래그로 매 단계마다 취소 여부를 확인해 이전 루프의 잔여 재생이
  // 이후에 끼어들지 못하게 함.
  useEffect(() => {
    setPhase('listening')
    setInput('')
    setRetryInput('')
    setShowHint(false)
    setManualPlaying(false)
    reportedRef.current = false

    let cancelled = false
    let played = 0
    const playOnce = () => {
      if (cancelled) return
      playWordAudio(wordAudioUrl, word, {
        times: 1,
        onEnd: () => {
          if (cancelled) return
          played += 1
          if (played < 3) setTimeout(() => { if (!cancelled) playOnce() }, 400)
          else setPhase('answer')
        },
        onError: () => {
          if (cancelled) return
          setPhase('answer') // 재생이 계속 실패해도 학생이 입력 자체는 할 수 있게
        },
      })
    }
    playOnce()

    return () => { cancelled = true; stopCurrentAudio() }
  }, [word, wordAudioUrl])

  const playAgain = () => {
    if (manualPlaying || phase === 'listening') return
    setManualPlaying(true)
    playWordAudio(wordAudioUrl, word, {
      times: 1,
      onEnd: () => setManualPlaying(false),
      onError: () => setManualPlaying(false),
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

      <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-6 text-center text-white">
        <button onClick={playAgain} className="btn-press" disabled={phase === 'listening' || manualPlaying}>
          <p className="text-4xl mb-2">🔊</p>
        </button>
        <p className="text-3xl font-black">{meaning}</p>
        <p className="text-teal-100 text-xs mt-2">탭하면 발음을 다시 들려줘요</p>
      </div>

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
        <p className="text-center text-gray-400 text-sm animate-pulse">🔊 잘 들어보세요...</p>
      )}

      {phase === 'answer' && (
        <div className="space-y-3">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
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
          <input type="text" value={retryInput} onChange={e => setRetryInput(e.target.value)}
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
