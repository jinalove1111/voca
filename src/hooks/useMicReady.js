import { useState, useEffect } from 'react'
import { hasMicStream } from '../utils/speech'

// Polls hasMicStream() until the shared mic stream (primed via
// getMicStreamOnce() elsewhere — usually Dashboard's "마이크 준비하기"
// button) becomes available, then stops polling. The stream itself is a
// module-level singleton in speech.js, not React state, so any screen that
// wants to know when it's ready has to poll rather than receive it as a
// prop — this hook is the single shared place that does that polling
// (previously duplicated with slightly different intervals in Dashboard.jsx
// and WordDetail.jsx).
export function useMicReady(intervalMs = 500) {
  const [ready, setReady] = useState(() => hasMicStream())
  useEffect(() => {
    if (ready) return
    const t = setInterval(() => { if (hasMicStream()) setReady(true) }, intervalMs)
    return () => clearInterval(t)
  }, [ready, intervalMs])
  return ready
}
