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
      },
    },
  },
  plugins: [],
}
