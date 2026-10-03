import * as paul from '../assets/paul'
import { townAsset } from '../assets/town'

// 2026-10-04 상황 보고 말하기 — 장면 카드. 최종 그림(src/assets/situations/<scene.id>.webp)이 있으면
// 그것만 보여 주고, 없으면 기존 에셋(배경/Paul 스티커/동물/이모지)으로 합성한 임시 그림 + "임시 그림" 배지.
// 폴더가 비어 있거나 없어도 Vite의 glob은 빈 객체를 돌려준다 — webp를 넣기만 하면 코드 수정 없이 전환된다.
const FINAL_ART = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/situations/*.webp', { eager: true, import: 'default' }))
    .map(([path, url]) => [path.split('/').pop().replace(/\.webp$/, ''), url]),
)

export default function SceneCard({ scene, final = FINAL_ART[scene.id] }) {
  const backdrop = townAsset(scene.backdrop)
  const partner = townAsset(scene.partner)
  return (
    <div role="img" aria-label={final ? scene.alt : `임시 그림. ${scene.alt}`} data-testid="scene-card" data-final={final ? 'true' : 'false'}
      className="relative w-full max-w-lg aspect-[4/3] min-h-[40vh] mx-auto rounded-3xl overflow-hidden card-shadow bg-gradient-to-b from-sky-100 to-amber-50">
      {final ? (
        <img src={final} alt="" aria-hidden="true" className="w-full h-full object-contain" />
      ) : (
        <>
          <span data-testid="scene-temp-badge"
            className="absolute top-2 left-2 z-10 px-2 py-1 rounded-full bg-white/90 text-xs font-black text-gray-700">🖼️ 임시 그림</span>
          {backdrop && <img src={backdrop} alt="" aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[70%] object-contain" />}
          <span aria-hidden="true" className="absolute top-[18%] left-1/2 -translate-x-1/2 text-5xl">{scene.cue}</span>
          {paul[scene.paulSticker] && <img src={paul[scene.paulSticker]} alt="" aria-hidden="true" className="absolute bottom-2 left-2 h-[35%] object-contain" />}
          {partner && <img src={partner} alt="" aria-hidden="true" className="absolute bottom-2 right-2 h-[30%] object-contain" />}
        </>
      )}
    </div>
  )
}
