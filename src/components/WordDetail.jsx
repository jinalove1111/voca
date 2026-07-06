import { useState, useEffect, useRef, useMemo } from 'react'
import { playWordAudio, stopCurrentAudio, getMicStream, recordWithAutoStop, transcribeViaServerSTT, SUCCESS_MSGS, FAIL_MSGS, rndMsg, unlockAudio } from '../utils/speech'
import { requestAudioGeneration } from '../utils/wordLibrary'
import { isInAppBrowser } from '../utils/browserDetect'
import InAppBrowserNotice from './InAppBrowserNotice'
import SpellingQuestion from './SpellingQuestion'
import { useMicReady } from '../hooks/useMicReady'

function getAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}

// ── SpeechBtn ─────────────────────────────────────────────────────────────────
// onAnyResult fires when: pronunciation success OR tries >= 2 (fail)
// This lets the parent know it's safe to show a "계속" button.
function SpeechBtn({ target, wordAudioUrl, label = '따라 말하기', maxMs = 5000, onSuccess, onAnyResult, onAttempt }) {
  const [phase, setPhase] = useState('idle')
  const [msg, setMsg]     = useState('')
  const [myRecUrl, setUrl] = useState(null)
  const [tries, setTries]  = useState(0)
  const micReady = useMicReady()
  const [transcript, setTranscript] = useState('')
  const [ungraded, setUngraded] = useState(false) // true = recorded OK but no STT grading available
  const mrRef              = useRef(null)
  const settledRef         = useRef(true) // true = not currently waiting on a result
  const hangTimerRef       = useRef(null)

  useEffect(() => () => {
    try { mrRef.current?.stop?.() } catch {}
  }, [])

  // In-app browsers (KakaoTalk etc.) handle mic permission unreliably — skip
  // the recording step there instead of letting students hit a flaky/
  // repeating permission prompt, but still let them move on with the lesson.
  const inApp = isInAppBrowser()
  useEffect(() => {
    if (inApp) onAnyResult?.()
  }, [inApp])
  if (inApp) return <InAppBrowserNotice compact />

  // Real grading: transcribe what the student said and compare it against
  // the target word — blob.size>0 only proved the mic captures audio, it
  // never proved the word was said correctly. MediaRecorder still runs in
  // parallel purely to power "내 발음 듣기" playback, not to judge anything.
  // Grading is done from the RECORDED BLOB, sent to a server-side STT
  // (Whisper or similar) — never from the live Web Speech API. Running
  // Web Speech API's own live mic capture at the same time as MediaRecorder
  // was fighting over the microphone on real devices (recording worked,
  // recognition just hung with no event ever firing). Web Speech API is
  // for real-time mic input, not for judging an already-recorded clip, so
  // it has no role here anymore.
  //
  // transcribeViaServerSTT() is currently a stub (no STT provider wired up
  // — that's a paid API and needs its own setup) — until it's live, a
  // successful recording is just recording: no accuracy grading, no
  // pass/fail, just "here's what you sound like, compare it yourself."
  const startListen = () => {
    console.log('[WordDetail] startRecording called')
    setPhase('listening')
    setUrl(null)
    setMsg('')
    setTranscript('')
    setUngraded(false)
    settledRef.current = false

    const finish = (nextPhase, message, { countTry = false, success = false } = {}) => {
      if (settledRef.current) return
      settledRef.current = true
      console.log('[WordDetail] STEP7 Success or Fail:', nextPhase)
      clearTimeout(hangTimerRef.current)
      try { mrRef.current?.stop?.() } catch {}
      if (countTry || success) onAttempt?.()
      if (success) { onSuccess?.(); onAnyResult?.() }
      if (countTry) {
        setTries(prev => {
          const next = prev + 1
          if (next >= 2) onAnyResult?.()
          return next
        })
      }
      setPhase(nextPhase)
      setMsg(message)
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      finish('fail', '이 브라우저는 녹음을 지원하지 않아요 😢', { countTry: true })
      return
    }

    // Safety net sized to the recording's own max length (+ buffer for the
    // STT stub call) — must never be shorter than maxMs itself, or a long
    // (e.g. 15s example) recording would get cut off by this timeout before
    // it ever gets a chance to finish on its own.
    hangTimerRef.current = setTimeout(() => {
      console.warn('[WordDetail] recording+grading timed out')
      finish('fail', '시간이 오래 걸려요. 다시 시도해봐요! 🗣️', { countTry: true })
    }, maxMs + 4000)

    const mimeType = getAudioMimeType()
    getMicStream()
      .then(async (stream) => {
        console.log('[WordDetail] mic stream received')
        console.log('[WordDetail] STEP1 Recording Started (maxMs:', maxMs, ')')
        let blob
        try {
          // Volume-only auto-stop (no STT/AI) — never ends before minMs
          // (2s), ends as soon as 1s of silence follows any speech, and
          // never runs past maxMs regardless.
          const rec = recordWithAutoStop(stream, { maxMs, minMs: 2000, silenceMs: 1000, mimeType })
          mrRef.current = rec // exposes .stop() for cancelListen()/the hang timer
          blob = await rec.promise
        } catch (err) {
          console.error('[WordDetail] recordWithAutoStop error:', err)
          finish('fail', `녹음 오류 (${err.name}: ${err.message})`, { countTry: true })
          return
        }
        console.log('[WordDetail] STEP2 Recording Stopped')
        console.log('[WordDetail] STEP3 Blob Created — blob.size =', blob.size)
        setUrl(URL.createObjectURL(blob))

        if (blob.size === 0) {
          finish('fail', '소리가 안 들렸어요. 다시 시도해봐요! 🗣️', { countTry: true })
          return
        }

        console.log('[WordDetail] STEP4 Send blob to server STT')
        try {
          const heard = await transcribeViaServerSTT(blob)
          console.log('[WordDetail] STEP5 STT Result:', heard)
          if (heard) {
            console.log('[WordDetail] STEP6 Compare — heard:', heard, 'target:', target)
            setTranscript(heard)
            const ok = heard.toLowerCase().includes(target.toLowerCase())
            if (ok) finish('success', rndMsg(SUCCESS_MSGS), { success: true })
            else finish('fail', rndMsg(FAIL_MSGS), { countTry: true })
          } else {
            // No STT provider configured yet — recording itself succeeded,
            // just no accuracy grading available. Not a failure.
            setUngraded(true)
            finish('success', '녹음 완료! 내 발음을 들어보고 원어민과 비교해봐요. 🎧', { success: true })
          }
        } catch (err) {
          console.error('[WordDetail] transcribeViaServerSTT() failed:', err)
          setUngraded(true)
          finish('success', '녹음 완료! 내 발음을 들어보고 원어민과 비교해봐요. 🎧', { success: true })
        }
      })
      .catch((err) => {
        console.error('[WordDetail] mic stream error:', err)
        // Mic genuinely unavailable (no hardware, denied, insecure origin,
        // etc.) — don't block the lesson on it. Suggest skipping ahead to
        // listening/quiz instead of showing a dead-end technical error.
        finish('fail', '녹음은 나중에 하고 먼저 듣기와 퀴즈를 해볼까요? 🎧', { countTry: false })
        onAnyResult?.()
      })
  }

  // Escape hatch: if a student taps the yellow "이제 말해봐요!" button while
  // it's genuinely stuck (no event ever arrived), let them cancel and retry
  // immediately instead of waiting out the 6s timeout.
  const cancelListen = () => {
    console.log('[WordDetail] listening cancelled by tap — retrying')
    if (settledRef.current) return
    settledRef.current = true
    clearTimeout(hangTimerRef.current)
    try { mrRef.current?.stop?.() } catch {}
    setPhase('fail')
    setMsg('다시 눌러서 시도해봐요! 🎤')
  }

  const handleClick = () => {
    console.log('[WordDetail] record button clicked')
    if (phase === 'listening') { cancelListen(); return }
    if (phase === 'speaking' || phase === 'success') return
    unlockAudio()
    setMsg('')
    setPhase('speaking')
    playWordAudio(wordAudioUrl, target, {
      times: 2,
      onEnd: () => startListen(),
      onError: () => startListen(),
    })
  }

  return (
    <div className="space-y-2">
      <button onClick={handleClick} disabled={phase === 'speaking' || phase === 'success'}
        className={`w-full py-3 rounded-xl font-black text-sm btn-press transition-colors ${
          phase === 'success'   ? 'bg-green-500 text-white' :
          phase === 'fail'      ? 'bg-orange-400 text-white' :
          // 'listening' is the ACTIVE recording state — the student should be
          // talking right now, so it must look alive (pulsing), not flat gray
          // like a disabled/broken button (that was being misread as "stuck").
          phase === 'listening' ? 'bg-yellow-400 text-white animate-pulse cursor-not-allowed' :
          phase === 'speaking'  ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
                                  'bg-purple-500 hover:bg-purple-600 text-white'
        }`}>
        {phase === 'idle'      ? `🎤 ${label}` :
         phase === 'speaking'  ? '🔊 잘 들어봐요...' :
         phase === 'listening' ? '👂 이제 말해봐요!' :
         phase === 'success'   ? (ungraded ? '✅ 녹음 완료!' : '✅ 발음 성공!') :
                                 tries >= 2 ? '🔄 한 번 더 (선택)' : '🔄 다시 시도'}
      </button>

      {msg && (
        <p className={`text-center text-sm font-bold ${phase === 'success' ? 'text-green-600' : 'text-orange-500'}`}>
          {msg}
        </p>
      )}

      {(phase === 'success' || phase === 'fail') && transcript && (
        <p className="text-center text-xs text-gray-500">
          인식 결과: &ldquo;{transcript}&rdquo; · 정답: &ldquo;{target}&rdquo;
        </p>
      )}

      {(phase === 'success' || (phase === 'fail' && tries >= 2)) && (
        <div className="flex gap-2">
          <button onClick={() => { unlockAudio(); playWordAudio(wordAudioUrl, target) }}
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
    </div>
  )
}

// ── Step 1: 발음 연습 ──────────────────────────────────────────────────────────
function PronounceStep({ word, onDone, onMarkPronunciationOk, onPronunciationAttempt }) {
  const [canProceed, setCanProceed] = useState(false)

  const playWord = () => {
    playWordAudio(word.wordAudioUrl, word.word, { times: 3 })
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-blue-500 to-purple-500 rounded-3xl p-6 text-white card-shadow word-card">
        <div className="text-center mb-4">
          <button onClick={playWord} className="btn-press max-w-full">
            <h1 className="word-text font-black hover:scale-110 transition-transform">{word.word}</h1>
          </button>
          <p className="text-blue-200 text-xs mt-1">탭하면 발음이 나와요 👆</p>
          <div className="bg-white/20 rounded-2xl px-4 py-3 mt-3 inline-block">
            <p className="text-3xl font-black">{word.meaning}</p>
          </div>
        </div>
        <SpeechBtn
          target={word.word}
          wordAudioUrl={word.wordAudioUrl}
          label="따라 말하기"
          maxMs={5000}
          onSuccess={onMarkPronunciationOk}
          onAnyResult={() => setCanProceed(true)}
          onAttempt={onPronunciationAttempt}
        />
      </div>

      {word.memoryTip && (
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-3xl p-4 card-shadow">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🧠</span>
            <span className="font-black text-yellow-800 text-sm">이렇게 외워봐요!</span>
          </div>
          <p className="text-yellow-900 text-sm leading-relaxed">{word.memoryTip}</p>
        </div>
      )}

      {canProceed && (
        <button onClick={onDone}
          className="w-full bg-purple-500 text-white font-black py-4 rounded-3xl btn-press card-shadow text-lg animate-slide-up">
          계속 → 📝 예문 보기
        </button>
      )}
    </div>
  )
}

// ── Step 2: 예문 ───────────────────────────────────────────────────────────────
function ExampleStep({ english, korean, memoryTip, audioUrl, onDone, onMarkExampleHeard }) {
  const [canProceed, setCanProceed] = useState(false)

  const handlePlay = () => {
    unlockAudio()
    playWordAudio(audioUrl, english, { times: 2 })
    onMarkExampleHeard?.()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl card-shadow p-6">
        <p className="font-black text-gray-500 text-sm mb-3">📝 예문</p>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
          <p className="font-bold text-gray-800 text-lg leading-snug">{english}</p>
          {korean && <p className="text-gray-500 text-sm mt-2">→ {korean}</p>}
        </div>
        <button onClick={handlePlay}
          className="w-full mt-4 bg-blue-500 hover:bg-blue-600 text-white font-black py-3 rounded-2xl btn-press transition-colors">
          🔊 예문 듣기
        </button>

        <div className="mt-4">
          <SpeechBtn
            target={english}
            wordAudioUrl={audioUrl}
            label="예문 따라 말하기"
            maxMs={15000}
            onAnyResult={() => setCanProceed(true)}
          />
        </div>

        {memoryTip && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 mt-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🧠</span>
              <span className="font-black text-yellow-800 text-sm">암기 꿀팁</span>
            </div>
            <p className="text-yellow-900 text-sm leading-relaxed">{memoryTip}</p>
          </div>
        )}
      </div>

      {canProceed && (
        <button onClick={onDone}
          className="w-full bg-purple-500 text-white font-black py-4 rounded-3xl btn-press card-shadow text-lg animate-slide-up">
          계속 → 🎮 퀴즈
        </button>
      )}
    </div>
  )
}

// ── Step 3: 퀴즈 ───────────────────────────────────────────────────────────────
const FALLBACK_MEANINGS = ['탐험하다','결정하다','변화하다','도착하다','사라지다','만들다','이해하다','중요한','특별한','연습하다']

function QuizStep({ word, classWords, onDone, onMarkQuizSolved, onQuizAnswer }) {
  const options = useMemo(() => {
    const pool = (classWords || []).filter(w => w.id !== word.id && w.meaning && w.meaning !== word.meaning)
    const wrongs = [...pool].sort(() => Math.random() - 0.5).slice(0, 3).map(w => w.meaning)
    let fi = 0
    while (wrongs.length < 3 && fi < FALLBACK_MEANINGS.length) {
      const fb = FALLBACK_MEANINGS[fi++]
      if (!wrongs.includes(fb) && fb !== word.meaning) wrongs.push(fb)
    }
    return [word.meaning, ...wrongs].sort(() => Math.random() - 0.5)
  }, [word.id])

  const correctIdx   = options.indexOf(word.meaning)
  const [selected, setSelected] = useState(null)
  const isAnswered   = selected !== null
  const isCorrect    = isAnswered && selected === correctIdx

  const handleSelect = (i) => {
    if (isAnswered) return
    setSelected(i)
    if (i === correctIdx) onMarkQuizSolved?.()
    onQuizAnswer?.(word.id, i === correctIdx)
  }

  // Auto-advance to the next word a couple seconds after answering, so kids
  // don't have to tap through every single word — the "다음 단어" button
  // stays as a manual override for anyone who wants to move on immediately.
  // QuizStep only ever mounts fresh per word (WordDetail resets `step` back
  // to 'pronounce' on word change before 'quiz' is reachable again), so this
  // timer can never fire for a word other than the one it was set up for.
  useEffect(() => {
    if (!isAnswered) return
    const t = setTimeout(() => onDone(), 1800)
    return () => clearTimeout(t)
  }, [isAnswered])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl card-shadow p-6">
        <p className="text-center text-gray-500 font-bold text-sm mb-4">🎮 뜻 맞히기</p>
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-5 text-center text-white mb-5 word-card">
          <p className="word-text font-black">{word.word}</p>
          <p className="text-purple-200 text-sm mt-1">이 단어의 뜻은?</p>
        </div>
        <div className="space-y-2">
          {options.map((opt, i) => {
            let cls = 'border-2 border-gray-200 bg-gray-50 text-gray-700 hover:border-purple-300'
            if (isAnswered) {
              if (i === correctIdx)    cls = 'border-2 border-green-400 bg-green-50 text-green-800'
              else if (i === selected) cls = 'border-2 border-red-400 bg-red-50 text-red-700'
              else                     cls = 'border-2 border-gray-100 bg-gray-50 text-gray-400'
            }
            return (
              <button key={i} disabled={isAnswered} onClick={() => handleSelect(i)}
                className={`w-full p-4 rounded-2xl font-bold text-left flex items-center gap-3 btn-press transition-all ${cls}`}>
                <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 font-black text-sm flex items-center justify-center flex-shrink-0">
                  {['①','②','③','④'][i]}
                </span>
                <span className="flex-1">{opt}</span>
                {isAnswered && i === correctIdx && <span>✅</span>}
                {isAnswered && i === selected && i !== correctIdx && <span>❌</span>}
              </button>
            )
          })}
        </div>
        {isAnswered && (
          <div className={`mt-4 p-3 rounded-2xl text-center animate-slide-up border-2 ${
            isCorrect ? 'bg-green-50 border-green-200 text-green-700' : 'bg-orange-50 border-orange-200 text-orange-700'
          }`}>
            <p className="font-black">
              {isCorrect ? '🎉 정답! 잘했어요!' : `정답은 "${word.meaning}"이에요 💪`}
            </p>
          </div>
        )}
      </div>

      {isAnswered && (
        <button onClick={onDone}
          className="w-full bg-gradient-to-r from-green-400 to-teal-500 text-white font-black py-4 rounded-3xl btn-press card-shadow text-lg animate-slide-up">
          ✅ 완료! 다음 단어 →
        </button>
      )}
    </div>
  )
}

// 학습 모드별 단계 구성 — 모드 선택(WordBrowser: 공부하기/퀴즈/쓰기/종합)에
// 따라 WordDetail이 어떤 단계를 요구할지 결정. "종합"만 스펠링 단계를
// 조건부로 포함(반 설정에서 쓰기 시험이 켜져 있을 때만) — 나머지는 고정.
function buildSteps(mode, hasExample, spellingAllowed) {
  if (mode === 'quiz') return ['quiz']
  if (mode === 'write') return ['spelling']
  if (mode === 'study') return ['pronounce', ...(hasExample ? ['example'] : [])]
  // comprehensive (기본값이자 모르는 모드에 대한 안전한 폴백 — 기존 v1.0 동작과 동일 + 스펠링만 추가)
  return ['pronounce', ...(hasExample ? ['example'] : []), 'quiz', ...(spellingAllowed ? ['spelling'] : [])]
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function WordDetail({
  word, onBack, onNext,
  onMarkViewed, onMarkExampleHeard, onMarkPronunciationOk, onMarkQuizSolved,
  onQuizAnswer, onPronunciationAttempt, onSpellingAnswer,
  classWords,
  mode = 'comprehensive',
  spellingSettings,
}) {
  const exampleEnglish = word.easyExample || word.funnyExample || word.realExample
  const exampleKorean  = word.exampleTranslation
  const spellingAllowed = !!spellingSettings?.spellingTestEnabled
  const STEPS = buildSteps(mode, !!exampleEnglish, spellingAllowed)

  const [step, setStep] = useState(STEPS[0])

  // Reset to first step whenever the word changes, and cut off whatever
  // audio was playing for the previous word.
  useEffect(() => {
    stopCurrentAudio()
    setStep(STEPS[0])
    onMarkViewed?.(word.id)
    // Lazily backfill audio AND example text for words that never got either
    // — e.g. the admin's save-time request got cut off by the browser
    // backgrounding the tab, or Anthropic generation failed while TTS still
    // succeeded (see api/generate-audio.js's isolated try/catch around the
    // example call). Without retrying on missing exampleText specifically, a
    // word that already has audio but no example was stuck showing the
    // generic "I can see a/an {word}." filler (exampleTextFor()) forever —
    // every such word looked the same. Safe to call even if generation
    // already ran; requestAudioGeneration de-dupes and the server is
    // idempotent per word.
    if ((!word.wordAudioUrl || !word.exampleText) && word.dbId) {
      requestAudioGeneration(word.dbId, word.word, word.meaning, word.exampleText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id, mode])

  const stepIdx = STEPS.indexOf(step)
  // 현재 단계 다음으로 — 모드마다 단계 구성이 달라서 각 단계 이름을
  // 하드코딩하지 않고 STEPS 배열 안에서 다음 항목으로만 이동. 마지막
  // 단계였으면 다음 단어로.
  const goNext = () => {
    const nextIdx = stepIdx + 1
    if (nextIdx < STEPS.length) setStep(STEPS[nextIdx])
    else { onNext ? onNext() : onBack?.() }
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="flex items-center justify-between max-w-lg mx-auto mb-4 pt-2">
        <button onClick={onBack} className="text-blue-600 font-bold btn-press">← 단어 목록</button>
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s}
              className={`rounded-full transition-all ${i < stepIdx ? 'w-3 h-3 bg-purple-400' : i === stepIdx ? 'w-4 h-4 bg-purple-600' : 'w-3 h-3 bg-gray-200'}`}
            />
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto animate-fade-in">
        {step === 'pronounce' && (
          <PronounceStep
            word={word}
            onDone={goNext}
            onMarkPronunciationOk={onMarkPronunciationOk}
            onPronunciationAttempt={onPronunciationAttempt}
          />
        )}
        {step === 'example' && exampleEnglish && (
          <ExampleStep
            english={exampleEnglish}
            korean={exampleKorean}
            memoryTip={word.memoryTip}
            audioUrl={word.exampleAudioUrl}
            onDone={goNext}
            onMarkExampleHeard={onMarkExampleHeard}
          />
        )}
        {step === 'quiz' && (
          <QuizStep
            word={word}
            classWords={classWords}
            onDone={goNext}
            onMarkQuizSolved={onMarkQuizSolved}
            onQuizAnswer={onQuizAnswer}
          />
        )}
        {step === 'spelling' && (
          <SpellingQuestion
            word={word.word}
            meaning={word.meaning}
            wordAudioUrl={word.wordAudioUrl}
            hintEnabled={!!spellingSettings?.spellingHintEnabled}
            onResult={(correct) => onSpellingAnswer?.(word.id, correct)}
            onDone={goNext}
          />
        )}
      </div>
    </div>
  )
}
