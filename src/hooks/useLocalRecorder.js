import { useEffect, useReducer, useRef, useState } from 'react'
import {
  MAX_RECORD_MS, MIN_RECORD_MS, initialSpeakingState, speakingReducer, mapMediaError, pickMimeType,
} from '../utils/speaking/speakingSession'

// 2026-10-04 상황 보고 말하기 — SpeakingPractice의 녹음 연결 코드를 그대로 옮긴 훅.
// 동작은 이전과 동일하다(SpeakingPractice e2e가 계약): 마이크 스트림은 speech.js의 공유
// 캐시를 쓰지 않고 이 훅이 직접 얻어 컴포넌트 수명 동안 보유하고(iOS는 호출마다 권한을
// 다시 묻는다), 뒤로가기/언마운트/백그라운드/pagehide/오류에서만 트랙을 놓는다.
// 녹음 Blob은 메모리(object URL)에만 있고 저장/전송하지 않는다.
// 반환: st(reducer 상태), dispatch(문제 전환 등 외부 액션), audioUrl, mic(data-mic-state 값),
// elapsed(초), start/stop/play/retake, reset(type)(요청 무효화 + 녹음 폐기 후 액션),
// audioProps(<audio {...audioProps}/>에 펼친다).
export default function useLocalRecorder({ maxMs = MAX_RECORD_MS, minMs = MIN_RECORD_MS } = {}) {
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
  const stop = () => {
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') rec.stop() // 이후 처리는 onstop에서
  }

  // 화면을 떠나거나 백그라운드로 가면 마이크를 반드시 놓는다
  useEffect(() => {
    mountedRef.current = true
    // 녹음은 정상 종료 경로(onstop)로 마무리하고, 보유 중인 마이크는 바로 놓는다
    const onHide = () => { if (document.visibilityState === 'hidden') { stop(); releaseStream() } }
    const onPageHide = () => { stop(); releaseStream() }
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
        if (blob.size > 0 && duration >= minMs) {
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
      maxTimerRef.current = setTimeout(stop, maxMs)
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
  const reset = (type) => { reqSeqRef.current++; clearUrl(); dispatch({ type }) }

  const audioProps = {
    ref: audioRef,
    src: audioUrl || undefined,
    onEnded: () => dispatch({ type: 'PLAY_END' }),
    onPause: () => dispatch({ type: 'PLAY_END' }),
    onError: () => dispatch({ type: 'PLAY_END' }),
  }

  return { st, dispatch, audioUrl, mic, elapsed, start, stop, play, retake, reset, audioProps }
}
