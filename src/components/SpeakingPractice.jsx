import { useEffect, useReducer, useRef, useState } from 'react'
import { isInAppBrowser } from '../utils/browserDetect'
import { speak } from '../utils/speech'
import InAppBrowserNotice from './InAppBrowserNotice'
import {
  SPEAKING_QUESTIONS, SPEAKING_MESSAGES, MAX_RECORD_MS, initialSpeakingState,
  speakingReducer, mapMediaError, pickMimeType,
} from '../utils/speaking/speakingSession'

// 2026-10-04 Speaking 첫 체험 — 녹음→들어보기만 하는 연습 화면. 저장/채점/전송 없음.
// 마이크 스트림은 speech.js의 공유 캐시(getMicStreamOnce)를 쓰지 않고 이 화면이
// 직접 얻는다: 화면을 떠날 때 트랙을 반드시 stop해야 하는데, 공유 스트림을 stop하면
// 단어 화면 녹음이 깨지기 때문이다. 스트림은 첫 녹음에서 얻어 이 화면 안에서 재사용한다
// (iOS는 getUserMedia 호출마다 권한을 다시 묻는다). 뒤로가기/언마운트/백그라운드/
// pagehide/오류에서만 트랙을 놓는다.
// 주의(운영자 기기 점검): iOS에서 두 번째 캡처가 공유 스트림을 mute할 수 있다 —
// 이 화면을 다녀온 뒤 WordDetail 따라 말하기가 정상인지 실기기에서 확인할 것.
const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'

export default function SpeakingPractice({ onBack }) {
  const [st, dispatch] = useReducer(speakingReducer, initialSpeakingState)
  const [audioUrl, setAudioUrl] = useState('')
  const [mic, setMic] = useState('idle') // idle(미획득) | live(보유 중) | released
  const [elapsed, setElapsed] = useState(0)
  const streamRef = useRef(null)
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const urlRef = useRef('')
  const maxTimerRef = useRef(null)
  const tickRef = useRef(null)
  const startAtRef = useRef(0)
  const mountedRef = useRef(true)
  const reqSeqRef = useRef(0) // 마이크 허용 대기 중 문제를 바꾸면 늦게 온 요청을 무효화
  const audioRef = useRef(null)

  const clearTimers = () => { clearTimeout(maxTimerRef.current); clearInterval(tickRef.current) }
  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (mountedRef.current) setMic('released')
  }
  const clearUrl = () => {
    // 재생 중인 답을 끊어야 URL revoke 뒤에 소리가 남지 않는다
    const a = audioRef.current
    if (a) { a.pause(); try { a.currentTime = 0 } catch { /* 메타데이터 없음 */ } }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = ''
    if (mountedRef.current) setAudioUrl('')
  }
  const stopRecording = () => {
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') rec.stop() // 이후 처리는 onstop에서
  }

  // 화면을 떠나거나 백그라운드로 가면 마이크를 반드시 놓는다
  useEffect(() => {
    mountedRef.current = true
    // 녹음은 정상 종료 경로(onstop)로 마무리하고, 보유 중인 마이크는 바로 놓는다
    const onHide = () => { if (document.visibilityState === 'hidden') { stopRecording(); releaseStream() } }
    const onPageHide = () => { stopRecording(); releaseStream() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      clearTimers()
      const rec = recRef.current
      if (rec) { rec.onstop = null; if (rec.state !== 'inactive') rec.stop() }
      releaseStream()
      clearUrl()
    }
  }, [])

  const start = async () => {
    clearUrl()
    const seq = ++reqSeqRef.current
    dispatch({ type: 'REQUEST' })
    let stream = streamRef.current
    if (!stream || !stream.getTracks().some((t) => t.readyState === 'live')) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        if (mountedRef.current && seq === reqSeqRef.current) dispatch({ type: 'FAIL', code: mapMediaError(err) })
        return
      }
      streamRef.current = stream
      // 허용을 기다리는 사이 떠났거나 백그라운드로 갔으면 녹음을 시작하지 않고 놓는다
      if (!mountedRef.current || document.visibilityState === 'hidden') { releaseStream(); return }
      setMic('live')
    }
    if (seq !== reqSeqRef.current) return // 대기 중 문제가 바뀜 — 스트림은 보유한 채 재사용
    try {
      const mime = pickMimeType((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        clearTimers()
        const duration = Date.now() - startAtRef.current
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/webm' })
        if (!mountedRef.current) return
        dispatch({ type: 'STOP', durationMs: duration, size: blob.size })
        if (blob.size > 0 && duration >= 500) {
          urlRef.current = URL.createObjectURL(blob)
          setAudioUrl(urlRef.current)
        }
      }
      recRef.current = rec
      startAtRef.current = Date.now()
      setElapsed(0)
      rec.start()
      dispatch({ type: 'START' })
      tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startAtRef.current) / 1000)), 250)
      maxTimerRef.current = setTimeout(stopRecording, MAX_RECORD_MS)
    } catch (err) {
      clearTimers()
      releaseStream()
      dispatch({ type: 'FAIL', code: mapMediaError(err) })
    }
  }

  const play = () => {
    const a = audioRef.current
    if (!a) return
    dispatch({ type: 'PLAY' })
    a.currentTime = 0
    a.play().catch(() => dispatch({ type: 'PLAY_END' }))
  }
  const retake = () => { clearUrl(); dispatch({ type: 'RETAKE' }) }
  const move = (type) => { reqSeqRef.current++; clearUrl(); dispatch({ type }) }

  if (isInAppBrowser()) {
    return (
      <div data-testid="speaking-practice" className="min-h-screen p-4 pb-24">
        <div className="max-w-lg mx-auto space-y-4">
          <button onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
          <InAppBrowserNotice />
        </div>
      </div>
    )
  }

  const q = SPEAKING_QUESTIONS[st.index]
  const busy = st.status === 'recording'
  const canRecord = st.status === 'idle'
  const statusText = st.status === 'recording' ? '녹음 중이에요… 끝나면 그만을 눌러요'
    : st.status === 'requesting' ? '마이크를 켜는 중이에요. 허용을 눌러 주세요'
    : st.status === 'recorded' || st.status === 'playing' ? '잘했어요! 들어보거나 다시 녹음해요'
    : st.status === 'error' ? SPEAKING_MESSAGES[st.errorCode] || SPEAKING_MESSAGES.unknown
    : ''

  return (
    <div data-testid="speaking-practice" data-mic-state={mic} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
          <h1 className="text-xl font-black text-sky-700">말하기 연습</h1>
        </div>
        <p className="text-sm text-gray-600">🎙️ 녹음은 저장되지 않아요. 연습만 해요</p>

        <div data-testid="speaking-question" className="bg-white rounded-3xl p-5 card-shadow space-y-2">
          <p className="text-sm font-bold text-sky-600">질문 {st.index + 1}/{SPEAKING_QUESTIONS.length}</p>
          <p className="text-2xl font-black text-gray-900">{q.en}</p>
          <p className="text-base text-gray-600">{q.ko}</p>
          <button onClick={() => speak(q.en, { source: 'speaking' })} disabled={busy}
            className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 질문 듣기</button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(canRecord || st.status === 'requesting' || st.status === 'recorded' || st.status === 'playing') && (
            <button data-testid="speaking-record" onClick={start}
              disabled={!canRecord && st.status !== 'recorded'} className={`${BTN} bg-gradient-to-br from-sky-400 to-blue-600 text-white`}>🎤 녹음 시작</button>
          )}
          {st.status === 'recording' && (
            <button data-testid="speaking-stop" onClick={stopRecording} className={`${BTN} bg-red-500 text-white`}>
              ⏹ 그만 <span data-testid="speaking-timer" className="motion-safe:animate-pulse">{elapsed}초</span>
            </button>
          )}
          {(st.status === 'recorded' || st.status === 'playing') && (
            <button data-testid="speaking-play" onClick={play} disabled={st.status === 'playing'}
              className={`${BTN} bg-emerald-500 text-white`}>▶ 들어보기</button>
          )}
          {(st.status === 'recorded' || st.status === 'playing' || st.status === 'error') && (
            <button data-testid="speaking-retake" onClick={retake} disabled={st.status === 'playing'}
              className={`${BTN} bg-gray-200 text-gray-700`}>🔁 다시 녹음</button>
          )}
        </div>

        <p className="text-xs text-gray-500">최대 20초까지 녹음돼요</p>

        <audio data-testid="speaking-audio" ref={audioRef} src={audioUrl || undefined}
          onEnded={() => dispatch({ type: 'PLAY_END' })} onPause={() => dispatch({ type: 'PLAY_END' })}
          onError={() => dispatch({ type: 'PLAY_END' })} className="hidden" />

        <p data-testid="speaking-status" role="status" aria-live="polite"
          className="text-center text-base font-bold text-sky-700 min-h-[1.5rem]">{statusText}</p>

        <div className="flex justify-between gap-2">
          <button data-testid="speaking-prev" onClick={() => move('PREV')} disabled={busy || st.index === 0}
            className={`${BTN} bg-white card-shadow text-gray-700`}>← 이전</button>
          <button data-testid="speaking-next" onClick={() => move('NEXT')} disabled={busy || st.index === SPEAKING_QUESTIONS.length - 1}
            className={`${BTN} bg-white card-shadow text-gray-700`}>다음 →</button>
        </div>
      </div>
    </div>
  )
}
