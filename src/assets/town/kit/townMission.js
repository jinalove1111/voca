// 마을 미션 표지판용 키트 아트(2026-10-10, 242차). 키트 import는 이 모듈과
// Proto25DScreen 청크에서만(testTownKitAssets 격리 가드). w/h는 kit/manifest.json과 동일(핀 있음).
import signpost from './props/signpost.webp'
import signpost2x from './props/signpost@2x.webp'
import cookieStand from './character/cookie-stand.webp'
import cookieStand2x from './character/cookie-stand@2x.webp'

export const MISSION_ART = Object.freeze({
  'props/signpost': Object.freeze({ src: signpost, src2x: signpost2x, w: 168, h: 256 }),
  'character/cookie-stand': Object.freeze({ src: cookieStand, src2x: cookieStand2x, w: 213, h: 256 }),
})

/** devicePixelRatio > 1이면 @2x, 아니면(SSR/없음 포함) 1x. */
export function missionArtUrl(art) {
  if (!art) return null
  const dpr = typeof window !== 'undefined' ? Number(window.devicePixelRatio) || 1 : 1
  return dpr > 1 ? art.src2x : art.src
}
