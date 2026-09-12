// src/components/town/v2/TownSprite.jsx — Paul Town V2-A 스프라이트
// 렌더러(2026-09-13).
//
// assetKey -> 실제 이미지 URL 해석은 이 컴포넌트가 유일하게 담당한다
// (townAsset() 호출부 단일화). 에셋이 아직 없으면(TOWN_ASSETS = {} 고정,
// src/assets/town/index.js) 항상 null이 돌아오고, 이 컴포넌트는 조용히
// 이모지로 폴백한다 — 기능이 이미지 부재로 깨지지 않는다(V1과 동일 원칙).
import { townAsset } from '../../../assets/town'

const EMOJI_SIZE_CLASS = {
  lg: 'text-[clamp(1.6rem,8vw,3rem)]',
  md: 'text-[clamp(1.3rem,6vw,2.25rem)]',
  sm: 'text-[clamp(1rem,4.5vw,1.5rem)]',
}

export default function TownSprite({ sprite, sizeClass, className = '', style, title }) {
  const s = sprite || {}
  const asset = townAsset(s.assetKey)
  const emojiSizeClass = EMOJI_SIZE_CLASS[s.footprint] || EMOJI_SIZE_CLASS.sm

  if (asset) {
    return (
      <img
        src={asset}
        alt=""
        loading="lazy"
        decoding="async"
        data-asset-key={s.assetKey || ''}
        title={title}
        className={`w-full h-full object-contain ${sizeClass || ''} ${className}`}
        style={style}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      data-asset-key={s.assetKey || ''}
      title={title}
      className={`inline-flex items-center justify-center w-full h-full leading-none ${emojiSizeClass} ${sizeClass || ''} ${className}`}
      style={style}
    >
      {s.emoji || '🎁'}
    </span>
  )
}
