// src/components/town/v2/TownEnvImage.jsx — Paul Town V2 환경(environment)
// 아트 프레젠테이션 컴포넌트(2026-09-18).
//
// assetKey -> src/assets/town/env/index.js(townEnvAsset)로 해석한 이미지
// URL을 <img>로 그리는 것이 유일한 책임이다. 이 파일이 v2/* 안에서
// townEnvAsset()을 호출하는 주된 지점이다 — CSS background-image URL이
// 필요한 레이어(예: grass-base 타일)만 예외적으로 townEnvAsset을 직접
// 호출한다(TownGroundLayer.jsx 헤더 참고). 키가 없거나(townEnvAsset이
// null 반환) 런타임 로드 실패(onError)면 조용히 아무것도 렌더하지 않는다
// — TownSprite.jsx(카탈로그 아이템, 이모지 폴백 있음)와 달리 이 컴포넌트는
// 이모지 폴백조차 없다: 배경/장식 환경 아트는 "없으면 안 보임"이 의도된
// 동작이다(깨진 이미지 아이콘만 피하면 된다, 학생에게 아이템으로
// 인지되는 요소가 아니므로 대체 표시가 필요 없다).
//
// eager=true면 loading="eager"(sky-hills처럼 최초 페인트에 바로 필요한
// 자산), 기본은 lazy.
import { useState, useEffect } from 'react'
import { townEnvAsset } from '../../../assets/town/env'

export default function TownEnvImage({ assetKey, className = '', style, eager = false }) {
  const url = townEnvAsset(assetKey)
  const [loadFailed, setLoadFailed] = useState(false)

  // assetKey가 바뀌면(다른 자산으로 재사용되는 컴포넌트 인스턴스) 이전
  // 실패 상태를 들고 있지 않도록 초기화(TownSprite.jsx와 동일 관례).
  useEffect(() => {
    setLoadFailed(false)
  }, [assetKey])

  if (!url || loadFailed) return null

  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      data-env-asset={assetKey}
      onError={() => setLoadFailed(true)}
      className={className}
      style={style}
    />
  )
}
