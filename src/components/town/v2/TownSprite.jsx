// src/components/town/v2/TownSprite.jsx — Paul Town V2-A 스프라이트
// 렌더러(2026-09-13).
//
// assetKey -> 실제 이미지 URL 해석은 이 컴포넌트가 유일하게 담당한다
// (townAsset() 호출부 단일화). 에셋이 아직 없으면(TOWN_ASSETS = {} 고정,
// src/assets/town/index.js) 항상 null이 돌아오고, 이 컴포넌트는 조용히
// 이모지로 폴백한다 — 기능이 이미지 부재로 깨지지 않는다(V1과 동일 원칙).
//
// 2026-09-14 — 런타임 이미지 로드 실패 폴백(보안 리뷰 발견 사항, Low).
// townAsset()이 URL을 반환해도 배포 이후 해시된 자산 파일이 사라지면
// (예: CDN 캐시 정리, 배포 스킵) <img>가 깨진 이미지 아이콘을 그대로
// 노출했다 — onError 시 1회만 이모지 폴백으로 전환한다(재시도/네트워크
// 폭주 없음, assetKey가 바뀌면 다음 자산에 대해 다시 시도).
import { useState, useEffect } from 'react'
import { townAsset } from '../../../assets/town'

// 2026-09-13 비주얼 폴리시 — 이전 clamp는 최대값이 작아(3rem) 390px
// 화면에서 이모지가 "작은 알약 속 점"처럼 보였다(코디네이터 스크린샷
// 피드백). 뷰포트에 비례해 훨씬 크게 스케일하도록 상한을 올린다.
const EMOJI_SIZE_CLASS = {
  lg: 'text-[clamp(2.6rem,15vw,4.6rem)]',
  md: 'text-[clamp(2rem,11vw,3.4rem)]',
  sm: 'text-[clamp(1.6rem,9vw,2.6rem)]',
}

export default function TownSprite({ sprite, className = '', style }) {
  const s = sprite || {}
  const asset = townAsset(s.assetKey)
  const emojiSizeClass = EMOJI_SIZE_CLASS[s.footprint] || EMOJI_SIZE_CLASS.sm
  const [loadFailed, setLoadFailed] = useState(false)

  // assetKey가 바뀌면(다른 아이템으로 재사용되는 컴포넌트 인스턴스) 이전
  // 실패 상태를 들고 있지 않도록 초기화 — 새 자산은 다시 <img>로 시도한다.
  useEffect(() => {
    setLoadFailed(false)
  }, [s.assetKey])

  if (asset && !loadFailed) {
    return (
      <span className={`relative inline-flex items-center justify-center w-full h-full ${className}`} style={style}>
        <span aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-2 rounded-full bg-[#1e2a5a]/15 blur-[2px]" />
        <img
          src={asset}
          alt=""
          loading="lazy"
          decoding="async"
          data-asset-key={s.assetKey || ''}
          onError={() => setLoadFailed(true)}
          className="relative w-full h-full object-contain drop-shadow-sm"
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
        className={`relative inline-flex items-center justify-center w-full h-full leading-none drop-shadow-sm ${emojiSizeClass}`}
      >
        {s.emoji || '🎁'}
      </span>
    </span>
  )
}
