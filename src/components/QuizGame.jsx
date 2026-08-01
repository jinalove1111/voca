import { useState, useRef, useEffect } from 'react'
import { playWordAudio, stopCurrentAudio, getMicStream, recordWithAutoStop, speakPraise, unlockAudio, playSuccessSound } from '../utils/speech'
import { requestAudioGeneration } from '../utils/wordLibrary'
import { isInAppBrowser } from '../utils/browserDetect'
import InAppBrowserNotice from './InAppBrowserNotice'
import { pickReaction } from '../utils/paulReactions'
import HeroReaction from './HeroReaction'

// 개발 중에만 찍히는 진단 로그(녹음 상태 등) — 프로덕션 콘솔을 어지럽히지
// 않도록 DEV 빌드에서만 활성화. console.error/warn은 그대로 유지(사용자
// 실기기 문제 진단에 필요).
const devLog = import.meta.env?.DEV ? console.log : () => {}

const KO_PRAISE = [
  '야르~ 정답!', '야르! 이건 그냥 맞추네!', '와 대박! 단어 고수인데?',
  '완전 잘했어!', '레전드! 또 맞췄어!', '이야~ 오늘 컨디션 좋은데?',
  '와우! 영어 천재 등장!', '아주 잘했어! 정답이야!', '좋아! 경험치 획득!', '최고다! 다음 문제 가자!',
]

// Fisher-Yates — Array.prototype.sort(() => Math.random()-0.5)는 정렬
// 알고리즘 구현에 따라 특정 원소가 앞/뒤에 쏠리는 편향이 생긴다(브라우저마다
// 다름). 이 셔플은 균등 분포를 보장하며 원본 배열은 변경하지 않는다.
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeOptions(correctWord, allWords) {
  const others = allWords.filter(w => w.id !== correctWord.id)
  const wrong  = shuffle(others).slice(0, 3).map(w => w.meaning)
  const opts   = shuffle([correctWord.meaning, ...wrong])
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
        devLog('[QuizGame] recorder stop, blob.size =', blob.size)
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
    devLog('[QuizGame] record button clicked')
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
          <button onClick={() => playWordAudio(wordAudioUrl, word, { source: 'quiz-pronstep-replay' })}
            className="flex-1 min-h-[44px] bg-blue-100 text-blue-700 font-bold py-3 rounded-xl text-xs btn-press">
            🔊 원어민
          </button>
          {myRecUrl && (
            <button onClick={() => new Audio(myRecUrl).play()}
              className="flex-1 min-h-[44px] bg-purple-100 text-purple-700 font-bold py-3 rounded-xl text-xs btn-press">
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
export default function QuizGame({ onBack, onAddMission, onMarkQuizSolved, onMarkPronunciationOk, onQuizAnswer, onPronunciationAttempt, initWord, classWords }) {
  // 퀴즈 풀은 마운트 시 1회만 고정 — classWords는 visibilitychange/focus 복귀
  // 시 App.jsx refreshTick으로 새 참조가 되는데, 이를 의존성으로 두면 퀴즈
  // 도중 백그라운드→복귀 때 문항/보기가 몰래 재섞여 idx/selected/results와
  // 어긋난다. screen!=='quiz'가 되면 언마운트되므로 다음 퀴즈는 새 마운트에서
  // 새 풀을 받는다(정상 재섞임).
  const [pool] = useState(() => {
    const all  = classWords && classWords.length > 0 ? classWords : []
    const base = initWord
      ? [initWord, ...shuffle(all.filter(w => w.id !== initWord.id)).slice(0, 9)]
      : shuffle(all).slice(0, 10)
    return buildQuiz(base, all)
  })

  const [idx, setIdx]           = useState(0)
  const [selected, setSelect]   = useState(null)
  const [results, setResults]   = useState([])
  const [done, setDone]         = useState(false)
  const [showPron, setShowP]    = useState(false)
  const [pronDone, setPronD]    = useState(false)
  const [praiseMsg, setPraise]  = useState('')
  const [canRecord, setCanRec]  = useState(false)  // unlocks after praise voice ends
  const [answerPaul, setAnswerPaul] = useState(null) // 이번 문제 정답/오답에 대해 뽑힌 폴 리액션
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
    setAnswerPaul(pickReaction(correct ? 'success' : 'encourage'))

    if (correct) {
      const msg = KO_PRAISE[Math.floor(Math.random() * KO_PRAISE.length)]
      setPraise(msg)
      onMarkQuizSolved()
      setShowP(true)
      // 칭찬 음성은 배경 재생이므로 녹음 버튼을 기다리게 할 필요 없음 —
      // 별 지급은 handlePronSuccess -> markPronunciationOk의 dedupKey
      // (`pronunciation:${wordId}:${오늘}`)가 전담하므로 버튼을 언제
      // 눌러도 보상 경제에는 영향이 없다.
      setCanRec(true)
      speakPraise('Yar! Correct!', undefined, 'quiz-praise')
    } else {
      setPraise('')
      onAddMission(current.word.id)
    }

    processing.current = false
  }

  // 별 지급 단일 경로(2026-07-28) — 예전엔 onMarkPronunciationOk?.()를
  // wordId 없이 불러(마니게임 체크포인트라 word.dbId 배선이 없었음)
  // useStudent의 "레거시 항상 지급" 분기를 타면서, 곧바로 onAddStars?.(1)
  // 도 별도로 호출해 발음 성공 하나당 별 2개(레거시 지급 1 + 여기서 직접
  // 1)가 나갈 수 있었다. current.word.dbId를 실어 보내면
  // markPronunciationOk가 WordDetail 경로와 동일한
  // `pronunciation:${wordId}:${오늘}` dedupKey로 grantReward를 거치므로,
  // 이 화면도 "오늘 이 단어 발음 성공"이라는 같은 이벤트를 공유하게 되고
  // (하루 한 번만 지급), 별도 star 지급 호출 자체가 필요 없어져 제거.
  const handlePronSuccess = () => {
    setPronD(true)
    playSuccessSound()
    onMarkPronunciationOk?.(current?.word?.dbId)
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
    setAnswerPaul(null)
  }

  // 오답 시 자동으로 다음 문제로 넘어가던 2초 타이머 제거(2026-08-02) —
  // 오답 피드백을 다 읽기 전에 화면이 넘어가버린다는 지적으로, 아래
  // "다음 문제 →" 버튼(항상 표시됨)이 유일한 전진 경로가 되도록 함.
  // 정답 시에는 발음 녹음(PronStep)을 위해 원래도 자동 전환이 없었으므로
  // 그 쪽 동작은 변경 없음.

  const handleRestart = () => {
    window.speechSynthesis?.cancel()
    stopCurrentAudio()
    setIdx(0); setSelect(null); setResults([])
    setDone(false); setShowP(false); setPronD(false)
    setPraise(''); setCanRec(false); setAnswerPaul(null)
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
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-600 font-bold btn-press">← 홈</button>
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

          <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-6 text-center text-white mb-6 word-card">
            <button onClick={() => playWordAudio(current.word.wordAudioUrl, current.word.word, { source: 'quiz-word' })} className="btn-press max-w-full">
              <p className="word-text font-black hover:scale-110 transition-transform">{current.word.word}</p>
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
            <div className="mt-4 p-4 rounded-2xl border-2 bg-red-50 border-red-200 text-red-700 text-center animate-slide-up">
              <HeroReaction image={answerPaul?.image} title="아깝다! 거의 다 왔어! 💪" theme="inherit" size="md" />
              <p className="text-sm mt-1">정답: <span className="font-black">{current.word.meaning}</span> → 레벨업 미션 추가! ⚔️</p>
            </div>
          )}

          {/* Correct: praise banner */}
          {isCorrect && praiseMsg && (
            <div className="mt-4 p-4 rounded-2xl border-2 bg-yellow-50 border-yellow-300 text-center animate-slide-up">
              {/* speakPraise()가 이미 음성으로 축하해줌 — HeroReaction은 효과음을
                  재생하지 않으므로 중복 걱정 없음 */}
              <HeroReaction image={answerPaul?.image} size="md" />
              <p className="font-black text-yellow-800 text-lg mt-1">{praiseMsg}</p>
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
