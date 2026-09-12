// src/components/town/v2/TownSprite.jsx — Paul Town V2-A 스프라이트
// 렌더러(2026-09-13).
//
// assetKey -> 실제 이미지 URL 해석은 이 컴포넌트가 유일하게 담당한다
// (townAsset() 호출부 단일화). 에셋이 아직 없으면(TOWN_ASSETS = {} 고정,
// src/assets/town/index.js) 항상 null이 돌아오고, 이 컴포넌트는 조용히
// 이모지로 폴백한다 — 기능이 이미지 부재로 깨지지 않는다(V1과 동일 원칙).
import { townAsset } from '../../../assets/town'

// 2026-09-13 비주얼 폴리시 — 이전 clamp는 최대값이 작아(3rem) 390px
// 화면에서 이모지가 "작은 알약 속 점"처럼 보였다(코디네이터 스크린샷
// 피드백). 뷰포트에 비례해 훨씬 크게 스케일하도록 상한을 올린다.
const EMOJI_SIZE_CLASS = {
  lg: 'text-[clamp(2.6rem,15vw,4.6rem)]',
  md: 'text-[clamp(2rem,11vw,3.4rem)]',
  sm: 'text-[clamp(1.6rem,9vw,2.6rem)]',
}

export default function TownSprite({ sprite, sizeClass, className = '', style, title }) {
  const s = sprite || {}
  const asset = townAsset(s.assetKey)
  const emojiSizeClass = EMOJI_SIZE_CLASS[s.footprint] || EMOJI_SIZE_CLASS.sm

  if (asset) {
    return (
      <span className={`relative inline-flex items-center justify-center w-full h-full ${className}`} style={style}>
        <span aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-2 rounded-full bg-[#1e2a5a]/15 blur-[2px]" />
        <img
          src={asset}
          alt=""
          loading="lazy"
          decoding="async"
          data-asset-key={s.assetKey || ''}
          title={title}
          className={`relative w-full h-full object-contain drop-shadow-sm ${sizeClass || ''}`}
        />
      </span>
    )
  }

  return (
    <span className={`relative inline-flex items-center justify-center w-full h-full ${className}`} style={style}>
      <span aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-2 rounded-full bg-[#1e2a5a]/15 blur-[2px]" />
      <span
        aria-hidden="true"
        data-asset-key={s.assetKey || ''}
        title={title}
        className={`relative inline-flex items-center justify-center w-full h-full leading-none drop-shadow-sm ${emojiSizeClass} ${sizeClass || ''}`}
      >
        {s.emoji || '🎁'}
      </span>
    </span>
  )
}
