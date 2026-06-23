import { useState, useEffect, useRef } from 'react'
import { speak, listenFor, SUCCESS_MSGS, FAIL_MSGS, rndMsg, unlockAudio } from '../utils/speech'

function SpeechBtn({ target, label = '따라 말하기', onSuccess }) {
  const [phase, setPhase] = useState('idle')
  // idle | speaking | 3 | 2 | 1 | listening | success | fail
  const [msg, setMsg]     = useState('')
  const [audioUrl, setUrl] = useState(null)
  const [tries, setTries] = useState(0)
  const recRef            = useRef(null)
  const timers            = useRef([])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    if (recRef.current?.state === 'recording') recRef.current.stop()
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

  const startListen = () => {
    setPhase('listening')
    setUrl(null)

    // MediaRecorder (optional — no crash if denied)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(stream => {
        try {
          const mr = new MediaRecorder(stream)
          const chunks = []
          mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
          mr.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' })
            setUrl(URL.createObjectURL(blob))
            stream.getTracks().forEach(t => t.stop())
          }
          mr.start()
          recRef.current = mr
        } catch (err) {
          stream.getTracks().forEach(t => t.stop())
          console.warn('MediaRecorder unsupported on this device', err)
        }
      }).catch((err) => {
        console.warn('getUserMedia failed', err)
      })
    }

    listenFor(target, {
      onResult: (ok) => {
        if (recRef.current?.state === 'recording') recRef.current.stop()
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
        if (recRef.current?.state === 'recording') recRef.current.stop()
        setPhase('fail')
        setMsg(MIC_ERR[errCode] || '마이크를 확인해보세요! 🎤')
      },
    })
  }

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
        addTimer(() => startListen(), 3000)
      },
    })
  }

  const isCountdown = ['3', '2', '1'].includes(phase)
  const busy = phase === 'speaking' || isCountdown || phase === 'listening'

  const btnColor =
    phase === 'success'   ? 'bg-green-500 text-white' :
    phase === 'fail'      ? 'bg-orange-400 text-white' :
    busy                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
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
      <button onClick={handleClick} disabled={busy}
        className={`w-full py-3 rounded-xl font-black text-sm btn-press transition-colors ${btnColor}`}>
        {btnLabel}
      </button>

      {msg && (
        <p className={`text-center text-sm font-bold ${phase === 'success' ? 'text-green-600' : 'text-orange-500'}`}>
          {msg}
        </p>
      )}

      {/* Comparison buttons */}
      {(phase === 'success' || phase === 'fail') && (
        <div className="flex gap-2">
          <button onClick={() => speak(target, { twice: false })}
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

export default function WordDetail({ word, onBack, onQuiz, onMarkViewed, onMarkExampleHeard, onMarkPronunciationOk }) {
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

        {/* Quiz button */}
        <button onClick={() => onQuiz(word)}
          className="w-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-black text-xl py-5 rounded-3xl btn-press card-shadow">
          🎮 이 단어 퀴즈 풀기!
        </button>
      </div>
    </div>
  )
}
