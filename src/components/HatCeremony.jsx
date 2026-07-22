import { useMemo } from 'react'
import { pickReaction } from '../utils/paulReactions'
import HeroReaction from './HeroReaction'

// 모자 수여식(Paul Town v2.0, 2026-07-22) — 조용히 인벤토리에만 들어가던
// 새 모자 획득을 폴이 직접 축하하며 건네주는 전면 연출로 바꾼다.
//
// 시각 패턴은 GiftReveal.jsx 그대로(fixed inset-0 z-50 + 흰 rounded-3xl
// 카드 + animate-slide-up) — 새 디자인 언어 없음. 폴 캐릭터는 기존 리액션
// 이미지(pickReaction('complete'))를 재사용하고, 폴 본인의 검은 모자는
// 절대 바뀌지 않는다 — 여기서 건네는 것은 "학생 아바타"의 컬러 톱햇이다.
//
// 상태 저장 없음: 표시 여부는 useAttachment의 세션 로컬 큐
// (pendingCeremonyHat)가 전담한다. grantHats가 멱등이고 newHats는 실제
// 획득 순간에만 비지 않으므로 이 연출이 무한 반복될 수 없다(구조 보장 —
// "봤는지" 영속 플래그를 만들지 않는 이유).
//
// 컬러 톱햇 틴트: 모든 학생 모자는 같은 🎩 디자인에 색만 다르다
// (hatSystem.js colorHex). 이모지는 color로 안 물들므로 투명 글자 +
// text-shadow 실루엣 기법으로 틴트한다(순수 CSS, 라이브러리 없음).
export default function HatCeremony({ hat, onEquip, onDismiss }) {
  // 마운트 시 한 번만 뽑음 — GiftReveal의 completePaul과 동일한 패턴.
  const paul = useMemo(() => pickReaction('complete'), [])
  if (!hat) return null

  const handleWear = () => {
    onEquip?.(hat.id)
    onDismiss?.()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <p className="text-indigo-600 font-black text-lg mb-1">🎩 새 모자를 받았어요!</p>

        {/* 폴 등장 — 이미지가 없어도 텍스트는 살아있도록 HeroReaction에는
            이미지만 맡긴다(GiftReveal과 같은 사용법). */}
        <HeroReaction image={paul?.image} size="lg" />
        <p className="font-black text-xl text-purple-600 mt-1">정말 열심히 했구나!</p>
        <p className="text-sm font-bold text-gray-500 mt-1">&ldquo;{hat.sourceLabel}&rdquo;을(를) 해내서 받은 모자야</p>

        {/* 컬러 톱햇 — colorHex 틴트 + colorName */}
        <div className="my-5">
          <div
            className="inline-flex items-center justify-center w-28 h-28 rounded-full animate-wiggle"
            style={{ backgroundColor: `${hat.colorHex}22`, border: `3px solid ${hat.colorHex}` }}
          >
            <span className="text-7xl" style={{ color: 'transparent', textShadow: `0 0 0 ${hat.colorHex}` }}>🎩</span>
          </div>
          <p className="font-black text-xl text-gray-800 mt-3">{hat.name}</p>
          <p className="text-xs font-bold mt-0.5 text-gray-400">{hat.colorName} 톱햇 · {hat.sourceLabel}</p>
        </div>

        <button
          onClick={handleWear}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black py-4 rounded-2xl btn-press"
        >
          🎩 모자 쓰기!
        </button>
        <button
          onClick={onDismiss}
          className="w-full mt-2 border-2 border-gray-200 text-gray-500 font-bold py-3 rounded-2xl btn-press"
        >
          나중에 쓸래
        </button>
      </div>
    </div>
  )
}
