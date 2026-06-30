import { useState, useEffect, useRef, useMemo } from 'react'
import { speak, listenFor, SUCCESS_MSGS, FAIL_MSGS, rndMsg, unlockAudio } from '../utils/speech'

const FALLBACK_MEANINGS = ['탐험하다','결정하다','변화하다','도착하다','사라지다','만들다','이해하다','중요한','특별한','연습하다']

function WordQuizFlow({ word, classWords, onClose }) {
  const [stage, setStage]           = useState(1)
  const [mcSelected, setMcSelected] = useState(null)
  const [e2kRevealed, setE2k]       = useState(false)
  const [voiceOk, setVoiceOk]       = useState(false)
  const [voiceTries, setVoiceTries] = useState(0)
  const [voicePhase, setVoicePhase] = useState('idle') // idle | listening | success | fail
  const [voiceMsg, setVoiceMsg]     = useState('')

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

  const correctIdx = options.indexOf(word.meaning)
  const isCorrect  = mcSelected !== null && mcSelected === correctIdx

  if (stage === 1) return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="inline-block bg-purple-100 text-purple-700 font-black text-xs px-3 py-1 rounded-full mb-3">1단계 · 객관식</span>
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-6 text-white">
          <p className="text-4xl font-black">{word.word}</p>
          <p className="text-purple-200 text-sm mt-1">이 단어의 뜻은? 🤔</p>
        </div>
      </div>
      <div className="space-y-2">
        {options.map((opt, i) => {
          let cls = 'border-2 border-gray-200 bg-gray-50 text-gray-700 hover:border-purple-300'
          if (mcSelected !== null) {
            if (i === correctIdx)       cls = 'border-2 border-green-400 bg-green-50 text-green-800'
            else if (i === mcSelected)  cls = 'border-2 border-red-400 bg-red-50 text-red-700'
            else                        cls = 'border-2 border-gray-100 bg-gray-50 text-gray-400'
          }
          return (
            <button key={i} disabled={mcSelected !== null} onClick={() => setMcSelected(i)}
              className={`w-full p-4 rounded-2xl font-bold text-left flex items-center gap-3 btn-press transition-all ${cls}`}>
              <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 font-black text-sm flex items-center justify-center flex-shrink-0">
                {['①','②','③','④'][i]}
              </span>
              <span className="flex-1">{opt}</span>
              {mcSelected !== null && i === correctIdx && <span>✅</span>}
              {mcSelected !== null && i === mcSelected && i !== correctIdx && <span>❌</span>}
            </button>
          )
        })}
      </div>
      {isCorrect && (
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 text-center">
          <p className="font-black text-green-700 text-lg">🎉 정답이에요! 잘했어요!</p>
          <button onClick={() => setStage(2)} className="mt-3 w-full bg-green-500 text-white font-black py-3 rounded-2xl btn-press">2단계로 →</button>
        </div>
      )}
      {mcSelected !== null && !isCorrect && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 text-center">
          <p className="font-black text-orange-700">아쉽지만 다시 해봐요! 💪</p>
          <p className="text-sm text-orange-600 mt-1">정답: <span className="font-black">{word.meaning}</span></p>
          <button onClick={() => setMcSelected(null)} className="mt-3 w-full bg-orange-400 text-white font-black py-3 rounded-2xl btn-press">🔄 다시 시도</button>
        </div>
      )}
    </div>
  )

  if (stage === 2) return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="inline-block bg-blue-100 text-blue-700 font-black text-xs px-3 py-1 rounded-full mb-3">2단계 · 영어 → 한국어</span>
        <div className="bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl p-6 text-white">
          <p className="text-4xl font-black">{word.word}</p>
          <p className="text-blue-200 text-sm mt-2">한국어 뜻을 말해보세요 🗣️</p>
        </div>
      </div>
      {!e2kRevealed ? (
        <button onClick={() => setE2k(true)} className="w-full bg-blue-500 text-white font-black py-4 rounded-2xl btn-press hover:bg-blue-600">정답 확인</button>
      ) : (
        <div className="space-y-3">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 text-center">
            <p className="text-xs text-gray-500 font-bold mb-1">정답</p>
            <p className="text-2xl font-black text-blue-700">{word.meaning}</p>
          </div>
          <button onClick={() => setStage(3)} className="w-full bg-blue-500 text-white font-black py-3 rounded-2xl btn-press">3단계로 →</button>
        </div>
      )}
    </div>
  )

  if (stage === 3) {
    const MIC_ERR = {
      'not-allowed':   '마이크 권한을 허용해주세요! 🎤',
      'no-speech':     '소리가 안 들렸어요. 크게 다시 말해봐요! 🗣️',
      'audio-capture': '마이크를 찾을 수 없어요 😢',
      'network':       '네트워크 오류예요. 인터넷을 확인해주세요 📶',
      'unsupported':   '이 브라우저는 음성 인식을 지원하지 않아요 😢',
    }
    const QUIZ_SUCCESS = ['잘했어요! 정확해요! 🎉', '완벽해요! 원어민 발음! 🌟', '최고야! 이 단어 완전 잡았다! 💪', '오 발음 미쳤다! 🔥']
    const canComplete = voiceOk || voiceTries >= 2

    const startQuizListen = () => {
      unlockAudio()
      setVoicePhase('listening')
      setVoiceMsg('')
      listenFor(word.word, {
        onResult: (ok) => {
          if (ok) {
            setVoicePhase('success')
            setVoiceMsg(rndMsg(QUIZ_SUCCESS))
            setVoiceOk(true)
          } else {
            const next = voiceTries + 1
            setVoiceTries(next)
            setVoicePhase('fail')
            setVoiceMsg(next >= 2 ? `아쉽지만 정답은 "${word.word}"이에요!` : rndMsg(FAIL_MSGS))
          }
        },
        onError: (errCode) => {
          const next = voiceTries + 1
          setVoiceTries(next)
          setVoicePhase('fail')
          setVoiceMsg(MIC_ERR[errCode] || '마이크를 확인해보세요! 🎤')
        },
      })
    }

    return (
      <div className="space-y-4">
        <div className="text-center">
          <span className="inline-block bg-green-100 text-green-700 font-black text-xs px-3 py-1 rounded-full mb-3">3단계 · 한국어 → 영어</span>
          <div className="bg-gradient-to-br from-green-500 to-teal-500 rounded-2xl p-6 text-white">
            <p className="text-4xl font-black">{word.meaning}</p>
            <p className="text-green-200 text-sm mt-2">영어 단어를 소리 내서 말해봐요 🗣️</p>
          </div>
        </div>

        {voicePhase === 'idle' && (
          <button onClick={startQuizListen}
            className="w-full bg-green-500 text-white font-black py-4 rounded-2xl btn-press hover:bg-green-600 text-lg">
            🎤 영어로 말해봐요!
          </button>
        )}

        {voicePhase === 'listening' && (
          <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-5 text-center">
            <p className="text-3xl mb-2 animate-pulse">👂</p>
            <p className="font-black text-green-700">듣고 있어요... 크게 말해봐요!</p>
          </div>
        )}

        {voicePhase === 'success' && (
          <div className="space-y-3">
            <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-5 text-center">
              <p className="text-2xl mb-1">🎉</p>
              <p className="font-black text-green-700 text-lg">{voiceMsg}</p>
            </div>
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 text-center">
              <p className="text-xs text-gray-500 font-bold mb-1">정답</p>
              <p className="text-2xl font-black text-green-700">{word.word}</p>
            </div>
          </div>
        )}

        {voicePhase === 'fail' && (
          <div className="space-y-3">
            <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 text-center">
              <p className="font-black text-orange-700">{voiceMsg}</p>
              {voiceTries < 2 && (
                <p className="text-xs text-orange-500 mt-1">{voiceTries}번 시도 · 1번 더 할 수 있어요!</p>
              )}
            </div>
            {voiceTries < 2 && (
              <button onClick={() => setVoicePhase('idle')}
                className="w-full bg-orange-400 text-white font-black py-3 rounded-2xl btn-press hover:bg-orange-500">
                🔄 다시 시도
              </button>
            )}
            {voiceTries >= 2 && (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-500 font-bold mb-1">정답</p>
                <p className="text-2xl font-black text-gray-700">{word.word}</p>
              </div>
            )}
          </div>
        )}

        {canComplete && (
          <div className="space-y-3">
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 text-center">
              <p className="text-3xl mb-1">🏆</p>
              <p className="font-black text-yellow-800 text-lg">퀴즈 완료!</p>
              <p className="text-sm text-yellow-700">3단계를 모두 마쳤어요!</p>
            </div>
            <button onClick={onClose} className="w-full bg-purple-500 text-white font-black py-3 rounded-2xl btn-press">✅ 완료</button>
          </div>
        )}
      </div>
    )
  }

  return null
}

// Returns the best supported audio mime type for MediaRecorder
function getAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}

function SpeechBtn({ target, label = '따라 말하기', onSuccess }) {
  const [phase, setPhase] = useState('idle')
  // idle | speaking | 3 | 2 | 1 | ready | listening | success | fail
  // 'ready' = TTS finished, waiting for user tap to start mic (iOS requires
  // SpeechRecognition.start() inside a direct user-gesture handler)
  const [msg, setMsg]      = useState('')
  const [audioUrl, setUrl] = useState(null)
  const [tries, setTries]  = useState(0)
  const mrRef              = useRef(null)
  const timers             = useRef([])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    if (mrRef.current?.state === 'recording') { try { mrRef.current.stop() } catch {} }
  }, [])

  const addTimer = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t }
  const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  const MIC_ERR = {
    'not-allowed':   '마이크 권한을 허용해주세요! 🎤',
    'no-speech':     '소리가 안 들렸어요. 크게 다시 말해봐요! 🗣️',
    'audio-capture': '마이크를 찾을 수 없어요 😢',
    'network':       '네트워크 오류예요. 인터넷을 확인해주세요 📶',
    'unsupported':   '이 브라우저는 음성 인식을 지원하지 않아요 😢',
  }

  // Called directly from a button onClick — must stay in user-gesture context for iOS
  const startListen = () => {
    setPhase('listening')
    setUrl(null)

    // MediaRecorder: best-effort recording of student's voice
    if (navigator.mediaDevices?.getUserMedia) {
      const mimeType = getAudioMimeType()
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(stream => {
          try {
            const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
            const chunks = []
            mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
            mr.onstop = () => {
              const blobType = mimeType || 'audio/webm'
              setUrl(URL.createObjectURL(new Blob(chunks, { type: blobType })))
              stream.getTracks().forEach(t => t.stop())
            }
            mr.start()
            mrRef.current = mr
          } catch {
            stream.getTracks().forEach(t => t.stop())
          }
        })
        .catch(() => {})
    }

    listenFor(target, {
      onResult: (ok) => {
        if (mrRef.current?.state === 'recording') { try { mrRef.current.stop() } catch {} }
        if (ok) {
          setPhase('success')
          setMsg(rndMsg(SUCCESS_MSGS))
          onSuccess?.()
        } else {
          setTries(t => t + 1)
          setPhase('fail')
          setMsg(rndMsg(FAIL_MSGS))
        }
      },
      onError: (errCode) => {
        if (mrRef.current?.state === 'recording') { try { mrRef.current.stop() } catch {} }
        setPhase('fail')
        setMsg(MIC_ERR[errCode] || '마이크를 확인해보세요! 🎤')
      },
    })
  }

  // Initial button click: play TTS then show 'ready' tap button.
  // Do NOT call startListen() from inside setTimeout/onEnd — iOS blocks
  // SpeechRecognition.start() outside a direct user-gesture handler.
  const handleClick = () => {
    if (!['idle', 'fail', 'success'].includes(phase)) return
    unlockAudio()
    clearAll()
    setMsg('')
    setPhase('speaking')
    speak(target, {
      twice: true,
      onEnd: () => {
        setPhase('3')
        addTimer(() => setPhase('2'), 1000)
        addTimer(() => setPhase('1'), 2000)
        addTimer(() => setPhase('ready'), 3000)
      },
    })
  }

  // User taps this after countdown — starts mic in a fresh user gesture
  const handleReady = () => {
    unlockAudio()
    startListen()
  }

  const isCountdown = ['3', '2', '1'].includes(phase)
  const busy = phase === 'speaking' || isCountdown || phase === 'listening'

  const btnColor =
    phase === 'success' ? 'bg-green-500 text-white' :
    phase === 'fail'    ? 'bg-orange-400 text-white' :
    busy                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
                          'bg-purple-500 hover:bg-purple-600 text-white'

  const btnLabel =
    phase === 'idle'      ? `🎤 ${label}` :
    phase === 'speaking'  ? '🔊 듣는 중...' :
    isCountdown           ? <span className="text-2xl font-black">{phase}</span> :
    phase === 'listening' ? '👂 말해보세요!' :
    phase === 'success'   ? '✅ 성공! 다시하기' :
                            '🔄 다시 시도'

  return (
    <div className="space-y-2">
      {/* Main action button (hidden while in 'ready' state) */}
      {phase !== 'ready' && (
        <button onClick={handleClick} disabled={busy}
          className={`w-full py-3 rounded-xl font-black text-sm btn-press transition-colors ${btnColor}`}>
          {btnLabel}
        </button>
      )}

      {/* 'ready' state: user must tap to start mic (iOS user-gesture requirement) */}
      {phase === 'ready' && (
        <button onClick={handleReady}
          className="w-full py-4 rounded-xl font-black text-base btn-press bg-green-500 hover:bg-green-600 text-white animate-pulse">
          🎤 탭해서 말하기!
        </button>
      )}

      {msg && (
        <p className={`text-center text-sm font-bold ${phase === 'success' ? 'text-green-600' : 'text-orange-500'}`}>
          {msg}
        </p>
      )}

      {/* Comparison buttons */}
      {(phase === 'success' || phase === 'fail') && (
        <div className="flex gap-2">
          <button onClick={() => { unlockAudio(); speak(target, { twice: false }) }}
            className="flex-1 bg-blue-100 text-blue-700 font-bold py-2 rounded-xl text-xs btn-press">
            🔊 원어민
          </button>
          {audioUrl && (
            <button onClick={() => { const a = new Audio(audioUrl); a.play() }}
              className="flex-1 bg-purple-100 text-purple-700 font-bold py-2 rounded-xl text-xs btn-press">
              🎧 내 발음
            </button>
          )}
        </div>
      )}

      {tries > 0 && phase !== 'success' && (
        <p className="text-center text-xs text-gray-400">{tries}번 시도 중 · 성공해야 ⭐</p>
      )}
    </div>
  )
}

function ExCard({ emoji, title, color, english, korean, word, onListen, onPronunciationOk }) {
  return (
    <div className="rounded-2xl overflow-hidden card-shadow">
      <div className={`px-4 py-2 flex items-center gap-2 ${color}`}>
        <span>{emoji}</span>
        <span className="text-white font-black text-sm">{title}</span>
      </div>
      <div className="bg-white p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-bold text-gray-800 text-base leading-snug">{english}</p>
            <p className="text-gray-500 text-sm mt-1">→ {korean}</p>
          </div>
          <button onClick={() => onListen(english)}
            className="flex-shrink-0 w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-xl flex items-center justify-center text-lg btn-press transition-colors">
            🔊
          </button>
        </div>
        <SpeechBtn target={english} label="예문 따라 말하기" onSuccess={onPronunciationOk} />
      </div>
    </div>
  )
}

export default function WordDetail({ word, onBack, onQuiz, onMarkViewed, onMarkExampleHeard, onMarkPronunciationOk, classWords }) {
  const [showQuiz, setShowQuiz] = useState(false)
  useState(() => { onMarkViewed(word.id) })

  const listenExample = (text) => {
    speak(text, { twice: false })
    onMarkExampleHeard()
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="flex items-center justify-between max-w-lg mx-auto mb-4 pt-2">
        <button onClick={onBack} className="text-blue-600 font-bold btn-press">← 단어 목록</button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        {/* Word card — click word to hear */}
        <div className="bg-gradient-to-br from-blue-500 to-purple-500 rounded-3xl p-6 text-white card-shadow">
          <div className="text-center mb-4">
            <button onClick={() => speak(word.word)} className="btn-press">
              <h1 className="text-5xl font-black hover:scale-110 transition-transform">{word.word}</h1>
            </button>
            <p className="text-blue-200 text-xs mt-1">탭하면 발음이 나와요 👆</p>
            <div className="bg-white/20 rounded-2xl px-4 py-3 mt-3 inline-block">
              <p className="text-3xl font-black">{word.meaning}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => speak(word.word)}
              className="bg-white/20 hover:bg-white/30 rounded-2xl py-3 font-black text-sm btn-press transition-colors">
              🔊 단어 듣기
            </button>
            <SpeechBtn target={word.word} label="단어 따라 말하기" onSuccess={onMarkPronunciationOk} />
          </div>
        </div>

        {/* Memory tip */}
        {word.memoryTip && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-3xl p-5 card-shadow">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🧠</span>
              <h2 className="font-black text-yellow-800">이렇게 외워봐요!</h2>
            </div>
            <p className="text-yellow-900 leading-relaxed">{word.memoryTip}</p>
          </div>
        )}

        {/* Examples */}
        <div className="space-y-3">
          <p className="font-black text-gray-600 text-sm px-1">📝 예문 (듣고 따라 말해봐요!)</p>
          {word.easyExample  && <ExCard emoji="⭐" title="쉬운 예문"  color="bg-blue-500"   english={word.easyExample}  korean={word.easyMeaning}  word={word.word} onListen={listenExample} onPronunciationOk={onMarkPronunciationOk} />}
          {word.funnyExample && <ExCard emoji="😂" title="웃긴 예문"  color="bg-orange-500" english={word.funnyExample} korean={word.funnyMeaning} word={word.word} onListen={listenExample} onPronunciationOk={onMarkPronunciationOk} />}
          {word.realExample  && <ExCard emoji="💬" title="실제 회화"  color="bg-green-500"  english={word.realExample}  korean={word.realMeaning}  word={word.word} onListen={listenExample} onPronunciationOk={onMarkPronunciationOk} />}
        </div>

        {/* Quiz section */}
        {showQuiz ? (
          <div className="bg-white rounded-3xl card-shadow p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-gray-800 text-lg">🎮 퀴즈</h2>
              <button onClick={() => setShowQuiz(false)} className="text-gray-400 font-bold text-xl btn-press hover:text-gray-600">✕</button>
            </div>
            <WordQuizFlow word={word} classWords={classWords || []} onClose={() => setShowQuiz(false)} />
          </div>
        ) : (
          <button onClick={() => setShowQuiz(true)}
            className="w-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-black text-xl py-5 rounded-3xl btn-press card-shadow">
            🎮 퀴즈 시작
          </button>
        )}
      </div>
    </div>
  )
}
