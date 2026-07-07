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
        'paul-pop': 'paulPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
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
        // 폴 선생님 리액션 등장 연출 — Pop + Bounce + Scale + Fade를 하나의
        // 키프레임으로 합침(따로 쪼개면 뚝뚝 끊겨 보여서 자연스러운 통통
        // 튀는 등장 하나로 구현).
        paulPop: {
          '0%':   { opacity: '0', transform: 'scale(0.3) translateY(16px)' },
          '60%':  { opacity: '1', transform: 'scale(1.15) translateY(-4px)' },
          '80%':  { opacity: '1', transform: 'scale(0.95) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
