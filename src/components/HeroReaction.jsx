import { useEffect, useRef } from 'react'

// Project Paul 리액션을 보여주는 앱 전체 공용 컴포넌트. 화면마다 따로
// "캐릭터 이미지 + 텍스트"를 만들지 않고, 이 하나로 통일한다(2026-07-08
// CTO 지시). 항상 다음 순서로 렌더링한다:
//   [Paul 캐릭터] → [큰 제목] → [짧은 메시지] → [children: 버튼 등]
//
// 순수 프레젠테이션 컴포넌트다 — 어떤 리액션을 보여줄지 고르는 로직
// (pickReaction/getReactionById)과 효과음 재생(playReactionSound)은 여기
// 안 두고 utils/paulReactions.js에 그대로 둔다. 호출부가 리액션을 고른
// 뒤 image/title/message만 이 컴포넌트에 넘긴다.
const SIZE_CLASS = {
  // 단어 학습 카드 전용 예외(rule 5) — 작은 마스코트로만 48~64px.
  // "히어로 모먼트"가 아니므로 rule 2의 큰 사이즈 대상에서 제외.
  xs: 'w-14 h-14',
  // 페이지 헤더/로그인 화면의 장식용 로고 자리 — "리액션 순간"이 아니라
  // 목록에 명시된 12개 대상에는 포함되지 않음. 레이아웃을 깨지 않도록
  // 작게 유지하되, 아래 PNG 크롭 처리는 동일하게 적용해 작아 보이는
  // 버그는 없앤다.
  sm: 'w-[90px] md:w-[110px] lg:w-[120px]',
  // 표준 히어로 모먼트 — rule 2 그대로: 모바일 120~160 / 태블릿 160~180 / PC 180~220
  md: 'w-[140px] md:w-[170px] lg:w-[200px]',
  // 가장 큰 축하 순간(레벨업/보상)
  lg: 'w-[170px] md:w-[200px] lg:w-[220px]',
}

const THEME = {
  success:   { title: 'text-green-600',  message: 'text-gray-500',  button: 'bg-green-500 hover:bg-green-600' },
  fail:      { title: 'text-orange-500', message: 'text-gray-500',  button: 'bg-orange-400 hover:bg-orange-500' },
  encourage: { title: 'text-orange-500', message: 'text-gray-500',  button: 'bg-orange-400 hover:bg-orange-500' },
  levelup:   { title: 'text-purple-600', message: 'text-gray-500',  button: 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600' },
  brand:     { title: 'text-indigo-700', message: 'text-gray-500',  button: 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600' },
  neutral:   { title: 'text-gray-800',   message: 'text-gray-500',  button: 'bg-purple-500 hover:bg-purple-600' },
  // 인디고/퍼플 그라데이션 배너 위에 얹히는 흰 텍스트 버전(홈 카드,
  // 레벨업 미션 안내 배너처럼 컬러 배경 카드 안에서 쓰는 경우).
  banner:    { title: 'text-white',      message: 'text-white/80',  button: 'bg-white text-indigo-600 hover:bg-indigo-50' },
  // 감싸는 카드가 이미 자기만의 색(예: 레벨업 미션의 빨간 정답/오답
  // 박스)을 정해둔 경우 — 강제로 덧씌우지 않고 부모의 text color를
  // 그대로 물려받는다.
  inherit:   { title: '', message: '',                              button: 'bg-gray-700 hover:bg-gray-800' },
}

export default function HeroReaction({
  image, title, message, theme = 'neutral', size = 'md',
  onClose, autoClose = false, overlay = false, children,
}) {
  const t = THEME[theme] || THEME.neutral
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.md
  const firedRef = useRef(false)

  // autoClose: 화면이 이미 자기만의 "몇 초 후 다음으로" 타이머를 갖고
  // 있다면(대부분의 기존 화면이 그렇다) 이 prop을 쓰지 말 것 — 두 타이머가
  // 경쟁하는 버그를 이미 한 번 겪은 적 있음(WordDetail.jsx 참고).
  useEffect(() => {
    firedRef.current = false
    if (!autoClose) return
    const ms = typeof autoClose === 'number' ? autoClose : 2000
    const timer = setTimeout(() => {
      if (firedRef.current) return
      firedRef.current = true
      onClose?.()
    }, ms)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, title, message, autoClose])

  // 이미지 로드 실패(배포 경로 문제 등)와 애초에 image가 없는 경우(아직
  // 개별 PNG가 없는 캐릭터) 모두, 이모지 등으로 대신 채우지 않고 조용히
  // 아무것도 그리지 않는다 — "브랜드 캐릭터가 없으면 기능이 실패한 것".
  if (!image) return null

  const handleClose = () => {
    if (firedRef.current) return
    firedRef.current = true
    onClose?.()
  }

  const body = (
    <div className="flex flex-col items-center text-center gap-0.5">
      {/* 원본 이미지 크기를 그대로 유지 — CSS로 무리하게 확대(scale)하지
          않는다. object-fit:contain으로 박스 안에 비율 유지해서 맞추고,
          image-rendering:auto로 브라우저 기본 리샘플링만 쓴다(저해상도를
          인위적으로 커 보이게 하는 트릭 없음). 저해상도 원본을 큰 사이즈로
          늘려서 깨져 보이는 게 이 파일의 문제가 아니라 원본 자산 해상도
          문제라, 진짜 해법은 assets를 고해상도로 교체하는 것뿐이다. */}
      <div className={`${sizeClass} aspect-square overflow-hidden relative flex-shrink-0`}>
        <img
          src={image}
          alt=""
          style={{ imageRendering: 'auto' }}
          className="w-full h-full object-contain"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      </div>
      {title && <p className={`font-black text-xl leading-snug ${t.title}`}>{title}</p>}
      {message && <p className={`font-bold text-sm ${t.message}`}>{message}</p>}
      {children}
      {onClose && !autoClose && !children && (
        <button onClick={handleClose}
          className={`w-full mt-2 text-white font-black py-3 rounded-2xl btn-press transition-colors ${t.button}`}>
          계속하기 →
        </button>
      )}
    </div>
  )

  if (!overlay) return body

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={handleClose}>
      <div className="bg-white rounded-3xl card-shadow px-8 py-6 max-w-sm w-full animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  )
}
