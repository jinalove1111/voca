/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard', 'Noto Sans KR', 'sans-serif'],
        title: ['OneStoreMobilePop', 'Pretendard', 'Noto Sans KR', 'sans-serif'],
      },
      animation: {
        'bounce-slow': 'bounce 2s infinite',
        'wiggle': 'wiggle 0.5s ease-in-out',
        'fade-in': 'fadeIn 0.4s ease-in',
        'slide-up': 'slideUp 0.4s ease-out',
        'paul-pop': 'paulPop 250ms ease-out',
        // Paul Town V2 2.5D/ambient polish(2026-09-20) — motion-safe:로만
        // 쓰인다(prefers-reduced-motion: reduce에서 전부 비활성). 아이템별
        // 위치/앵커 transform(translate(-50%,-100%) 등)과 절대 같은
        // 엘리먼트에 걸지 않는다 — 애니메이션이 실행되는 동안 그 transform
        // 값을 완전히 대체해 앵커가 깨지므로, 항상 자식 엘리먼트(버튼/이미지)
        // 에만 건다(각 호출부 주석 참고).
        'town-settle': 'townSettle 520ms cubic-bezier(0.34, 1.56, 0.64, 1) 1',
        'town-glow': 'townGlow 1.8s ease-in-out infinite',
        'town-shimmer': 'townShimmer 2.6s ease-in-out infinite',
        'town-sway': 'townSway 5s ease-in-out infinite',
        'town-drift': 'townDrift 10s ease-in-out infinite',
        'town-cat-idle': 'townCatIdle 2.4s ease-in-out infinite',
        'town-entrance': 'townEntrance 450ms ease-out 1',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // 폴 선생님 리액션 등장 연출 — 요청 사양 그대로: scale 0.8 -> 1.05
        // -> 1.0, 250ms.
        paulPop: {
          '0%':   { opacity: '0', transform: 'scale(0.8)' },
          '60%':  { opacity: '1', transform: 'scale(1.05)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // 배치 완료 "정착(settle)" — 짧은 오버셔트 바운스. 0%/100%가 평상시
        // 정적 transform(scale(1) translateY(0%))과 정확히 같아, 클래스가
        // 붙고 떨어질 때 시각적 점프가 없다.
        townSettle: {
          '0%': { transform: 'scale(0.85) translateY(6%)' },
          '40%': { transform: 'scale(1.12) translateY(-8%)' },
          '65%': { transform: 'scale(0.96) translateY(2%)' },
          '100%': { transform: 'scale(1) translateY(0%)' },
        },
        // 선택 강조 rim/glow — opacity만 오간다(reduced-motion에서는
        // motion-safe:가 애니메이션 자체를 꺼서 정적 링만 남는다).
        townGlow: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        // 강 반짝임(river-highlight) — opacity만(위치/transform은 앵커
        // 계산이 소유하므로 건드리지 않는다).
        townShimmer: {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '0.9' },
        },
        // 초목 흔들림 — 아주 미세한 회전(±1.5deg)만.
        townSway: {
          '0%, 100%': { transform: 'rotate(-1.5deg)' },
          '50%': { transform: 'rotate(1.5deg)' },
        },
        // 대기(atmosphere) 부유 요소 — 느린 표류 + 옅은 opacity 변화.
        townDrift: {
          '0%, 100%': { transform: 'translate(0px, 0px)', opacity: '0.75' },
          '25%': { transform: 'translate(6px, -10px)', opacity: '1' },
          '50%': { transform: 'translate(-4px, -18px)', opacity: '0.85' },
          '75%': { transform: 'translate(-8px, -6px)', opacity: '1' },
        },
        // 고양이 idle 숨쉬기 — 아주 미세한 scale/translateY 오실레이션.
        townCatIdle: {
          '0%, 100%': { transform: 'scale(1) translateY(0%)' },
          '50%': { transform: 'scale(1.015) translateY(-1.5%)' },
        },
        // 씬 최초 진입 settle/zoom — 1회성(infinite 아님).
        townEntrance: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
