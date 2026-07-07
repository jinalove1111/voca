import { useState, useEffect, useRef } from 'react'
import { playWordAudio, playRepeating, stopCurrentAudio, playSuccessSound } from '../utils/speech'
import { isSpellingCorrect, spellingHintFor } from '../utils/spelling'

// 초등학생이 발음을 듣고 철자를 떠올릴 수 있을 만큼 천천히, 그러나
// 로봇처럼 부자연스럽게 들리지 않는 속도. 앱 전체 재생 속도 설정
// (SpeedBtn, 학생이 바꿀 수 있음)과 무관하게 쓰기 시험은 항상 이 속도로
// 고정. 기존 0.6(이 앱의 "🐢 천천히" 프리셋)이 답답하다는 피드백을 받아
// 약 15~20% 올림 — 영국 원어민 선생님이 또박또박 읽어주는 속도를 목표.
const SPELLING_RATE = 0.7
const SPELLING_GAP_MS = 1000 // 반복 사이 약 1초 대기
const UNLOCK_AT = 3 // 이 오답 횟수부터 '발음 듣기' 버튼이 활성화됨

// 쓰기는 받아쓰기가 아니라 "기억 속 철자를 꺼내는 훈련(Active Recall)".
// 그래서 문제를 시작할 때 발음을 자동 재생하지 않고, 한글 뜻만 보여준
// 상태에서 학생이 순수하게 기억으로 입력하게 함. 오답 단계별 대응:
//   1번째 오답: "❌ 다시 한번 생각해보세요!" — 발음/정답 모두 비공개
//   2번째 오답: "❌ 조금만 더 생각해보세요!" — 여전히 비공개
//   3번째 오답: 그제서야 '발음 듣기' 버튼이 활성화(자동 재생은 아님 —
//               학생이 직접 눌러야만 들림)
//   4번째(+) 오답: 정답 철자 공개 + 발음 1번 자동 재생, 그대로 한 번
//               입력해야 다음 문제로 넘어감(받아쓰기 확인 단계)
const WRONG_MSGS = {
  1: '❌ 다시 한번 생각해보세요!',
  2: '❌ 조금만 더 생각해보세요!',
  3: '❌ 정말 모르겠으면 아래 🔊 버튼을 눌러 들어보세요',
}

// 쓰기 시험 한 문제 — 영어 단어는 절대 보여주지 않고 한글 뜻만 표시.
// 학생이 철자를 입력해 제출하면 대소문자/앞뒤 공백을 무시하고 채점.
// 위 오답 단계 로직을 따라 진행하다가 맞히면 통과. '발음 듣기'가 활성화된
// 뒤에는 언제 탭해도 진행 중이던 재생을 멈추고 처음부터 다시 재생 —
// speech.js의 TTS singleton(claimTtsCall)이 겹쳐 들리는 것을 구조적으로
// 막아줘서 여기서 따로 잠금 처리할 필요 없음.
export default function SpellingQuestion({ word, meaning, wordAudioUrl, hintEnabled, onResult, onDone }) {
  const [phase, setPhase] = useState('answer') // answer | reveal | correct
  const [wrongCount, setWrongCount] = useState(0)
  const [replaying, setReplaying] = useState(false) // 재생 중 표시만 — 이미 입력한 답은 화면에 그대로 유지됨
  const [input, setInput] = useState('')
  const [showHint, setShowHint] = useState(false)
  const reportedRef = useRef(false)
  const cancelRef = useRef(null)
  const inputRef = useRef(null)

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

  const playOnce = (source, onDone) => {
    cancelRef.current?.()
    cancelRef.current = null
    setReplaying(true)
    playWordAudio(wordAudioUrl, word, {
      times: 1,
      rate: SPELLING_RATE,
      source,
      onEnd: () => { setReplaying(false); onDone?.() },
      onError: () => { setReplaying(false); onDone?.() },
    })
  }

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 50)

  // 문제 등장(마운트/단어 변경) — 발음 자동 재생 없음. 한글 뜻만 보여주고
  // 바로 입력창에 포커스(모바일 키보드도 바로 뜨도록 — iOS Safari는
  // 사용자 제스처 밖 focus()를 무시할 수 있어 100% 보장은 어려움).
  useEffect(() => {
    setPhase('answer')
    setWrongCount(0)
    setInput('')
    setShowHint(false)
    reportedRef.current = false
    focusInput()

    return () => { cancelRef.current?.(); stopCurrentAudio() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, wordAudioUrl])

  const playAgain = () => {
    if (wrongCount < UNLOCK_AT || phase === 'correct') return // 잠금 해제 전엔 무시(버튼도 비활성 상태)
    playSequence(focusInput)
  }

  // 정답이면 효과음을 먼저 들려주고, 0.7초 후에 다음 문제로 — 효과음이
  // 잘리지 않고 다 들리도록 onDone을 곧바로 부르지 않음.
  const markCorrect = () => {
    setPhase('correct')
    playSuccessSound()
    setTimeout(() => onDone?.(), 700)
  }

  const submitAnswer = () => {
    if (!input.trim()) return
    const correct = isSpellingCorrect(input, word)
    if (!reportedRef.current) { reportedRef.current = true; onResult?.(correct) }
    if (correct) { markCorrect(); return }

    setInput('')
    const next = wrongCount + 1
    setWrongCount(next)

    if (next >= 4) {
      // 네 번째(이후) 오답 — 정답 공개 + 발음 1번 자동 재생, 그대로 한 번 입력해야 통과
      setPhase('reveal')
      playOnce('spelling-reveal', focusInput)
    } else {
      // 1~3번째 오답 — 발음/정답 모두 비공개, 스스로 다시 떠올려 입력
      // (3번째부터는 '발음 듣기' 버튼만 활성화되고, 자동 재생은 안 됨)
      focusInput()
    }
  }

  const hint = spellingHintFor(word)
  const wrongMsg = WRONG_MSGS[wrongCount]
  const speakerUnlocked = wrongCount >= UNLOCK_AT

  return (
    <div className="bg-white rounded-3xl card-shadow p-6 space-y-4">
      <p className="text-center text-gray-500 font-bold text-sm">✏️ 철자 쓰기</p>

      {speakerUnlocked ? (
        <button onClick={playAgain} disabled={phase === 'correct'}
          className="w-full bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-6 text-center text-white btn-press">
          <p className={`text-4xl mb-2 ${replaying ? 'animate-pulse' : ''}`}>🔊</p>
          <p className="text-3xl font-black">{meaning}</p>
          <p className="text-teal-100 text-xs mt-2">탭하면 발음을 들려줘요 (3번, 천천히)</p>
        </button>
      ) : (
        <div className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-6 text-center">
          <p className="text-3xl font-black text-gray-700">{meaning}</p>
        </div>
      )}

      {hintEnabled && phase !== 'correct' && (
        <div className="text-center">
          {showHint ? (
            <p className="text-gray-400 font-black tracking-widest text-lg">{hint}</p>
          ) : (
            <button onClick={() => setShowHint(true)} className="text-xs text-teal-500 font-bold btn-press">💡 힌트 보기</button>
          )}
        </div>
      )}

      {phase === 'answer' && (
        <div className="space-y-3 animate-slide-up">
          {wrongMsg && (
            <p className="text-center text-red-500 font-bold text-sm">{wrongMsg}</p>
          )}
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAnswer()}
            placeholder="영어로 철자를 입력하세요" autoFocus autoCapitalize="off" autoCorrect="off" spellCheck="false"
            className="w-full border-2 border-teal-200 rounded-xl px-4 py-4 text-xl font-black text-center focus:outline-none focus:border-teal-500" />
          <button onClick={submitAnswer}
            className="w-full bg-teal-500 hover:bg-teal-600 text-white font-black py-4 rounded-2xl btn-press text-lg">
            확인
          </button>
        </div>
      )}

      {phase === 'reveal' && (
        <div className="space-y-3 animate-slide-up">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-center">
            <p className="text-red-500 font-bold text-sm mb-1">정답은</p>
            <p className="text-red-600 font-black text-2xl tracking-wide">{word}</p>
            <p className="text-red-500 font-bold text-sm mt-1">입니다</p>
          </div>
          <p className="text-center text-xs text-gray-400">정답을 보고 똑같이 한 번 입력해봐요</p>
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAnswer()}
            placeholder="다시 입력하세요" autoFocus autoCapitalize="off" autoCorrect="off" spellCheck="false"
            className="w-full border-2 border-red-200 rounded-xl px-4 py-4 text-xl font-black text-center focus:outline-none focus:border-red-500" />
          <button onClick={submitAnswer}
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
