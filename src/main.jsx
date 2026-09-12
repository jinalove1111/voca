import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Stale lazy chunk 자동 복구(2026-09-12, src/utils/staleChunkRecovery.js
// 헤더 주석 참고) — Vite가 발행하는 'vite:preloadError' 이벤트는 지금까지
// 아무도 안 듣고 있었다. 이 리스너가 그 이벤트도 AppErrorBoundary의
// componentDidCatch와 같은 판정/가드 경로로 처리해, dynamic import()가
// throw 없이 이 이벤트만 쏘는 브라우저/타이밍에서도 자동 새로고침되게 한다.
import { tryRecoverFromStaleChunk, scheduleGuardReset } from './utils/staleChunkRecovery'

window.addEventListener('vite:preloadError', (event) => {
  try {
    const result = tryRecoverFromStaleChunk({
      error: event?.payload,
      storage: window.sessionStorage,
      reload: () => window.location.reload(),
    })
    if (result.reloaded) event.preventDefault()
  } catch { /* 이 리스너 자체가 실패해도 앱 부팅을 막지 않는다 */ }
})
scheduleGuardReset(window.sessionStorage)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
