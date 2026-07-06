import { useState, useRef, useEffect, useMemo } from 'react'
import { playWordAudio, stopCurrentAudio, getMicStream, recordWithAutoStop, speakPraise, unlockAudio, playSuccessSound } from '../utils/speech'
import { requestAudioGeneration } from '../utils/wordLibrary'
import { isInAppBrowser } from '../utils/browserDetect'
import InAppBrowserNotice from './InAppBrowserNotice'

const KO_PRAISE = [
  '야르~ 정답!', '야르! 이건 그냥 맞추네!', '와 대박! 단어 고수인데?',
  '폼 미쳤다!', '레전드! 또 맞췄어!', '이야~ 오늘 컨디션 좋은데?',
  '와우! 영어 천재 등장!', '개꿀! 정답이야!', '좋아! 경험치 획득!', '최고다! 다음 문제 가자!',
]

function makeOptions(correctWord, allWords) {
  const others = allWords.filter(w => w.id !== correctWord.id)
  const wrong  = others.sort(() => Math.random() - 0.5).slice(0, 3).map(w => w.meaning)
  const opts   = [correctWord.meaning, ...wrong].sort(() => Math.random() - 0.5)
  return { opts, correctIdx: opts.indexOf(correctWord.meaning) }
}

function buildQuiz(wordList, all) {
  return wordList.map(w => ({ word: w, ...makeOptions(w, all) }))
}

// Returns the best supported audio mime type for MediaRecorder
function getAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}

// ─── PronStep ───────────────────────────────────────────────────────────────
function PronStep({ word, wordAudioUrl, canRecord, onSuccess, onAttempt }) {
  const [phase, setPhase]      = useState('wait')
  // wait | listening | success | fail
  const [msg, setMsg]          = useState('')
  const [micError, setMicErr]  = useState('')
  const [tries, setTries]      = useState(0)
  const [myRecUrl, setUrl]     = useState(null)
  const [processing, setProc]  = useState(false)

  const mrRef      = useRef(null)   // { stop } handle from recordWithAutoStop
  const timersRef  = useRef([])     // setTimeout ids
  const settledRef = useRef(true)   // true = not currently waiting on a recording result

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  const stopAll = () => {
    clearTimers()
    window.speechSynthesis?.cancel()
    try { mrRef.current?.stop?.() } catch {}
  }

  // Cleanup on unmount or word change
  useEffect(() => () => stopAll(), [word])

  // Grading is just "did a recording actually happen" — blob.size > 0 = the
  // student practiced the pronunciation, so it counts as success. This app
  // doesn't grade pronunciation accuracy (no STT/Whisper/Azure): recording
  // successfully IS the pronunciation practice being complete.
  const startListening = () => {
    if (processing) return
    setProc(true)
    setMicErr('')
    unlockAudio()
    stopAll()
    setUrl(null)
    setPhase('listening')
    settledRef.current = false

    if (!navigator.mediaDevices?.getUserMedia) {
      settledRef.current = true
      setPhase('fail')
      setMsg('이 브라우저는 녹음을 지원하지 않아요 😢')
      setProc(false)
      return
    }

    // Safety net: if getMicStream()/recordWithAutoStop's promise never
    // settles (a real device hang — permission dialog dismissed without a
    // choice, mic contention, etc.), this is the ONLY way out. Without it,
    // the button stays stuck on "지금 말해보세요!" forever (see
    // WordDetail.jsx's SpeechBtn, which already has this same net + a
    // tap-to-cancel escape hatch below).
    const hangTimer = setTimeout(() => {
      if (settledRef.current) return
      console.warn('[QuizGame] recording timed out')
      settledRef.current = true
      try { mrRef.current?.stop?.() } catch {}
      setProc(false)
      setPhase('fail')
      setMsg('시간이 오래 걸려요. 다시 시도해봐요! 🗣️')
    }, 9000)
    timersRef.current.push(hangTimer)

    const mimeType = getAudioMimeType()
    getMicStream()
      .then((stream) => {
        const rec = recordWithAutoStop(stream, { maxMs: 5000, minMs: 2000, silenceMs: 1000, mimeType })
        mrRef.current = rec
        return rec.promise
      })
      .then((blob) => {
        if (settledRef.current) return
        settledRef.current = true
        console.log('[QuizGame] recorder stop, blob.size =', blob.size)
        setUrl(URL.createObjectURL(blob))
        setProc(false)
        onAttempt?.()
        if (blob.size > 0) {
          setPhase('success')
          setMsg('발음 성공! ⭐ 1개 획득!')
          onSuccess()
        } else {
          setTries(prev => {
            const n = prev + 1
            setMsg(n >= 3 ? '괜찮아! 다음에 다시 해보자! 💪' : '다시 시도해보세요!')
            return n
          })
          setPhase('fail')
        }
      })
      .catch((err) => {
        if (settledRef.current) return
        settledRef.current = true
        console.error('[QuizGame] recording error:', err)
        // Mic genuinely unavailable — don't dead-end the quiz on it.
        setMicErr('녹음은 나중에 하고 먼저 듣기와 퀴즈를 해볼까요? 🎧')
        setPhase('fail')
        setProc(false)
      })
  }

  // Escape hatch: tapping the button while it's genuinely stuck on
  // "listening" cancels and lets the student retry immediately, instead of
  // waiting out the 9s hang timer — mirrors WordDetail.jsx's cancelListen().
  const cancelListening = () => {
    if (settledRef.current) return
    settledRef.current = true
    clearTimers()
    try { mrRef.current?.stop?.() } catch {}
    setProc(false)
    setPhase('fail')
    setMsg('다시 눌러서 시도해봐요! 🎤')
  }

  const handleClick = () => {
    console.log('[QuizGame] record button clicked')
    if (!canRecord) return   // praise voice still playing
    if (phase === 'listening') { cancelListening(); return }
    if (processing) return

    // Retry: reset to re-listen
    startListening()
  }

  const btnColor =
    !canRecord             ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
    phase === 'listening'  ? 'bg-yellow-400 text-white animate-pulse cursor-not-allowed' :
    phase === 'success'    ? 'bg-green-500 text-white' :
    phase === 'fail'       ? 'bg-orange-400 text-white' :
                             'bg-purple-500 hover:bg-purple-600 text-white'

  const btnLabel =
    !canRecord            ? '⏳ 잠깐만요...' :
    phase === 'listening' ? '👂 지금 말해보세요!' :
    phase === 'success'   ? '✅ 발음 성공!' :
    phase === 'fail'      ? '🔄 다시 시도' :
                            '🎤 발음하기 (탭하면 단어 먼저 들려줘요)'

  return (
    <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-4 mt-3 space-y-3">
      <p className="text-center font-black text-purple-700 text-sm">
        🎤 발음도 성공하면 ⭐ 1개!
      </p>

      <button
        onClick={handleClick}
        disabled={!canRecord || (processing && phase !== 'listening')}
        className={`w-full py-3 rounded-xl font-black btn-press transition-colors text-sm ${btnColor}`}
      >
        {btnLabel}
      </button>

      {micError && (
        <p className="text-center text-xs font-bold text-red-500 bg-red-50 rounded-xl px-3 py-2">
          ⚠️ {micError}
        </p>
      )}

      {msg && (
        <p className={`text-center text-sm font-bold ${phase === 'success' ? 'text-green-600' : 'text-orange-500'}`}>
          {msg}
        </p>
      )}

      {(phase === 'success' || phase === 'fail') && (
        <div className="flex gap-2">
          <button onClick={() => playWordAudio(wordAudioUrl, word)}
            className="flex-1 bg-blue-100 text-blue-700 font-bold py-2 rounded-xl text-xs btn-press">
            🔊 원어민
          </button>
          {myRecUrl && (
            <button onClick={() => new Audio(myRecUrl).play()}
              className="flex-1 bg-purple-100 text-purple-700 font-bold py-2 rounded-xl text-xs btn-press">
              🎧 내 발음
            </button>
          )}
        </div>
      )}

      {tries > 0 && phase !== 'success' && (
        <p className="text-center text-xs text-gray-400">{tries}번 시도 · 성공해야 ⭐ 받아요</p>
      )}
    </div>
  )
}

// ─── QuizGame ───────────────────────────────────────────────────────────────
export default function QuizGame({ onBack, onAddMission, onMarkQuizSolved, onMarkPronunciationOk, onAddStars, onQuizAnswer, onPronunciationAttempt, initWord, classWords }) {
  const pool = useMemo(() => {
    const all  = classWords && classWords.length > 0 ? classWords : []
    const base = initWord
      ? [initWord, ...all.filter(w => w.id !== initWord.id).sort(() => Math.random() - 0.5).slice(0, 9)]
      : all.slice().sort(() => Math.random() - 0.5).slice(0, 10)
    return buildQuiz(base, all)
  }, [initWord, classWords])

  const [idx, setIdx]           = useState(0)
  const [selected, setSelect]   = useState(null)
  const [results, setResults]   = useState([])
  const [done, setDone]         = useState(false)
  const [showPron, setShowP]    = useState(false)
  const [pronDone, setPronD]    = useState(false)
  const [praiseMsg, setPraise]  = useState('')
  const [canRecord, setCanRec]  = useState(false)  // unlocks after praise voice ends
  const processing              = useRef(false)     // guard against double-select

  const current    = pool[idx] || pool[0]
  const isAnswered = selected !== null
  const isCorrect  = isAnswered && selected === current?.correctIdx

  // Lazily backfill audio AND example text for words that never got either
  // (e.g. the admin's save-time request got cut off, or Anthropic example
  // generation failed while TTS still succeeded — see WordDetail.jsx for the
  // matching fix and full rationale). de-duped and idempotent server-side.
  useEffect(() => {
    const w = current?.word
    if (w && (!w.wordAudioUrl || !w.exampleText) && w.dbId) {
      requestAudioGeneration(w.dbId, w.word, w.meaning, w.exampleText)
    }
  }, [current?.word?.id])

  const handleSelect = (optIdx) => {
    if (isAnswered || !current || processing.current) return
    processing.current = true

    // Cancel any ongoing speech/recognition immediately
    window.speechSynthesis?.cancel()
    stopCurrentAudio()

    setSelect(optIdx)
    const correct = optIdx === current.correctIdx
    setResults(prev => [...prev, { word: current.word, correct }])
    onQuizAnswer?.(current.word.id, correct)

    if (correct) {
      const msg = KO_PRAISE[Math.floor(Math.random() * KO_PRAISE.length)]
      setPraise(msg)
      setCanRec(false)
      onMarkQuizSolved()
      setShowP(true)
      // Play praise — activate record button AFTER it finishes
      speakPraise('Yar! Correct!', () => setCanRec(true))
    } else {
      setPraise('')
      onAddMission(current.word.id)
    }

    processing.current = false
  }

  const handlePronSuccess = () => {
    setPronD(true)
    playSuccessSound()
    onMarkPronunciationOk?.()
    onAddStars?.(1)
  }

  const handleNext = () => {
    // Cancel everything before advancing
    window.speechSynthesis?.cancel()
    stopCurrentAudio()
    if (idx + 1 >= pool.length) { setDone(true); return }
    setIdx(i => i + 1)
    setSelect(null)
    setShowP(false)
    setPronD(false)
    setPraise('')
    setCanRec(false)
  }

  // Auto-advance on a WRONG answer only — a correct answer offers a bonus
  // pronunciation recording (PronStep) for +1 star, so auto-advancing there
  // would yank the screen away mid-recording and cost the student that star.
  // Wrong answers have nothing further to do on this screen, so it's safe.
  useEffect(() => {
    if (!isAnswered || isCorrect) return
    const t = setTimeout(() => handleNext(), 2000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswered, isCorrect])

  const handleRestart = () => {
    window.speechSynthesis?.cancel()
    stopCurrentAudio()
    setIdx(0); setSelect(null); setResults([])
    setDone(false); setShowP(false); setPronD(false)
    setPraise(''); setCanRec(false)
  }

  if (pool.length === 0) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-5xl mb-4">📭</div>
        <p className="font-black text-gray-600 mb-4">단어가 없어요!</p>
        <button onClick={onBack} className="bg-purple-500 text-white font-bold px-6 py-3 rounded-2xl btn-press">← 홈으로</button>
      </div>
    </div>
  )

  if (done) {
    const correct = results.filter(r => r.correct).length
    const total   = results.length
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl card-shadow p-8 text-center animate-slide-up">
          <div className="text-7xl mb-4">{correct === total ? '🏆' : correct >= total / 2 ? '😊' : '💪'}</div>
          <h2 className="text-3xl font-black text-purple-700 mb-2">{correct === total ? '완벽해요!' : '수고했어요!'}</h2>
          <p className="text-gray-500 text-lg mb-6">
            {total}문제 중 <span className="font-black text-purple-600">{correct}개</span> 정답!
          </p>
          <div className="flex justify-center gap-1 mb-6">
            {results.map((r, i) => (
              <span key={i} className={`text-2xl ${r.correct ? 'opacity-100' : 'opacity-20'}`}>⭐</span>
            ))}
          </div>
          {total - correct > 0 && (
            <div className="bg-red-50 rounded-2xl p-3 mb-5 border-2 border-red-100">
              <p className="text-red-600 text-sm font-bold">⚔️ 틀린 단어 {total - correct}개가 레벨업 미션에 추가됐어요!</p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <button onClick={handleRestart} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black py-4 rounded-2xl btn-press">🔄 다시 퀴즈</button>
            <button onClick={onBack} className="text-gray-500 font-bold py-3 btn-press">← 홈으로</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="flex items-center justify-between max-w-lg mx-auto mb-4 pt-2">
        <button onClick={onBack} className="text-purple-600 font-bold btn-press">← 홈</button>
        <div className="flex gap-1">
          {pool.map((_, i) => (
            <div key={i} className={`w-7 h-7 rounded-full text-xs flex items-center justify-center font-black transition-all ${
              i < idx ? 'bg-purple-500 text-white' : i === idx ? 'bg-yellow-400 text-white scale-110' : 'bg-gray-200 text-gray-400'
            }`}>{i + 1}</div>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto animate-fade-in">
        <div className="bg-white rounded-3xl card-shadow p-6 mb-4">
          <p className="text-center text-gray-400 text-sm font-bold mb-4">이 단어의 뜻은? 🤔</p>

          <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-6 text-center text-white mb-6">
            <button onClick={() => playWordAudio(current.word.wordAudioUrl, current.word.word)} className="btn-press">
              <p className="text-5xl font-black hover:scale-110 transition-transform">{current.word.word}</p>
            </button>
            <p className="text-purple-200 text-xs mt-1">탭하면 발음 🔊</p>
          </div>

          <div className="space-y-3">
            {current.opts.map((opt, i) => {
              const isThis  = selected === i
              const isRight = i === current.correctIdx
              let cls = 'border-2 border-gray-200 bg-gray-50 text-gray-700 hover:border-purple-300'
              if (isAnswered) {
                if (isRight)     cls = 'border-2 border-green-400 bg-green-50 text-green-800'
                else if (isThis) cls = 'border-2 border-red-400 bg-red-50 text-red-700'
                else             cls = 'border-2 border-gray-200 bg-gray-50 text-gray-400'
              }
              return (
                <button key={i} onClick={() => handleSelect(i)} disabled={isAnswered}
                  className={`w-full p-4 rounded-2xl font-bold flex items-center gap-3 text-left transition-all btn-press ${cls}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                    isAnswered ? (isRight ? 'bg-green-400 text-white' : isThis ? 'bg-red-400 text-white' : 'bg-gray-200 text-gray-500') : 'bg-purple-100 text-purple-600'
                  }`}>
                    {isAnswered ? (isRight ? '✓' : isThis ? '✗' : String.fromCharCode(65 + i)) : String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-base">{opt}</span>
                </button>
              )
            })}
          </div>

          {/* Wrong answer feedback */}
          {isAnswered && !isCorrect && (
            <div className="mt-4 p-4 rounded-2xl border-2 bg-red-50 border-red-200 text-red-700 animate-slide-up">
              <p className="font-black">아깝다! 거의 다 왔어! 💪</p>
              <p className="text-sm mt-1">정답: <span className="font-black">{current.word.meaning}</span> → 레벨업 미션 추가! ⚔️</p>
            </div>
          )}

          {/* Correct: praise banner */}
          {isCorrect && praiseMsg && (
            <div className="mt-4 p-4 rounded-2xl border-2 bg-yellow-50 border-yellow-300 text-center animate-slide-up">
              <p className="text-2xl mb-1">🎉</p>
              <p className="font-black text-yellow-800 text-lg">{praiseMsg}</p>
            </div>
          )}

          {/* Pronunciation step — skipped in in-app browsers (KakaoTalk etc.),
              where mic permission is unreliable; everything else still works. */}
          {isCorrect && showPron && !pronDone && (
            isInAppBrowser() ? (
              <InAppBrowserNotice compact />
            ) : (
              <PronStep
                key={current.word.word}
                word={current.word.word}
                wordAudioUrl={current.word.wordAudioUrl}
                canRecord={canRecord}
                onSuccess={handlePronSuccess}
                onAttempt={onPronunciationAttempt}
              />
            )
          )}

          {/* Star earned */}
          {pronDone && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 mt-4 text-center animate-slide-up">
              <p className="font-black text-green-700 text-lg">⭐ 별 1개 획득!</p>
              <p className="text-green-600 text-sm">정답 + 발음 성공!</p>
            </div>
          )}
        </div>

        {/* Next button — always visible once answered */}
        {isAnswered && (
          <button onClick={handleNext}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black text-xl py-5 rounded-3xl btn-press animate-slide-up card-shadow">
            {idx + 1 >= pool.length ? '🏆 결과 보기' : '다음 문제 →'}
          </button>
        )}
      </div>
    </div>
  )
}
