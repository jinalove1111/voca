import { useState, useEffect } from 'react'

// document.hidden(탭이 백그라운드로 감)을 구독하는 작은 공유 훅 — Paul
// Town V2 ambient 루프(강 반짝임/초목 흔들림/고양이 idle/대기 부유
// 요소, 2026-09-20)가 탭이 백그라운드일 때 CSS animation-play-state를
// 'paused'로 낮추기 위해 쓴다(useMicReady.js와 동일하게 이런 종류의
// 브라우저 전역 상태를 훅 하나로 공유 — 레이어마다 중복 리스너를 달지
// 않는다). SSR/document 부재 환경에서도 안전(초기값 false로 폴백).
export function useDocumentHidden() {
  const [hidden, setHidden] = useState(() => (typeof document !== 'undefined' ? document.hidden : false))
  useEffect(() => {
    function onVisibility() { setHidden(document.hidden) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  return hidden
}
