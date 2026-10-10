import { useState, useEffect } from 'react'

// prefers-reduced-motion: reduce 미디어 쿼리를 구독하는 작은 공유 훅
// (useDocumentHidden.js와 동일한 이유 — 브라우저 전역 상태를 훅 하나로
// 공유, 레이어마다 중복 리스너를 달지 않는다). 기존 Tailwind motion-safe:
// 변형은 CSS 애니메이션 자체를 끄는 데는 충분하지만, Paul Town V2 벤치
// 앉기 상호작용(TownScene.jsx)처럼 "reduced-motion이면 아예 다른 타이밍/
// 단계(걷기 생략, 바로 착석)로 상태 머신을 분기"해야 하는 경우는 JS
// 레벨에서 이 값을 알아야 한다 — 이 저장소에서 그런 요구가 처음 생긴
// 지점(2026-09-21)이라 새 훅으로 분리한다. SSR/matchMedia 부재 환경에서도
// 안전(초기값 false로 폴백).
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ))
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    function onChange() { setReduced(mql.matches) }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return reduced
}
