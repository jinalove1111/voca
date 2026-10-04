import * as paul from '../assets/paul'
import { townAsset } from '../assets/town'

// 2026-10-04 상황 보고 말하기 — 장면 카드. 최종 그림(src/assets/situations/<scene.id>.webp)이 있으면
// 그것만 보여 주고, 없으면 기존 에셋(배경/Paul 스티커/동물/이모지)으로 합성한 임시 그림 + "임시 그림" 배지.
// 폴더가 비어 있거나 없어도 Vite의 glob은 빈 객체를 돌려준다 — webp를 넣기만 하면 코드 수정 없이 전환된다.
const FINAL_ART = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/situations/*.webp', { eager: true, import: 'default' }))
    .map(([path, url]) => [path.split('/').pop().replace(/\.webp$/, ''), url]),
)

// exam: 시험 화면 — 표현 의미를 풀어 쓰지 않는 examAlt를 읽어 준다
// 2026-10-04(207차) — 한글 상황 기반 Speaking: 임시 합성 그림은 화면에 내지 않는다. 최종 일러스트 파일
// (src/assets/situations/<scene-id>.webp)이 있는 장면만 그림을 보여 준다 — 파일만 넣으면 자동으로 다시 나타난다.
export const hasFinalArt = (sceneId) => Boolean(FINAL_ART[sceneId])

export default function SceneCard({ scene, exam = false, final = FINAL_ART[scene.id] }) {
  const alt = exam && scene.examAlt ? scene.examAlt : scene.alt
  const backdrop = townAsset(scene.backdrop)
  const partner = townAsset(scene.partner)
  return (
    <div role="img" aria-label={final ? alt : `임시 그림. ${alt}`} data-testid="scene-card" data-scene={scene.id} data-final={final ? 'true' : 'false'}
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
