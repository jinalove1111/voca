// src/components/town/v2/PaulGuide.jsx — Paul Town V2-A 폴 가이드 팻말
// (2026-09-13).
//
// 폴 캐릭터는 이 파일이 v2 폴더에서 유일하게 렌더한다 — 항상
// HeroReaction + getReactionById(src/utils/paulReactions.js) 조합으로만
// 표시하고, src/assets/paul을 직접 import하지 않는다(V1 TownScreen과
// 동일 원칙).
import HeroReaction from '../../HeroReaction'
import { getReactionById } from '../../../utils/paulReactions'

export default function PaulGuide({ guide }) {
  if (!guide) return null
  const reaction = getReactionById(guide.reactionId)
  if (!reaction) return null

  return (
    <div className="relative bg-gradient-to-b from-[#fdebd0] to-[#f6e3c8] border-2 border-[#8b6f3e]/40 rounded-2xl p-1">
      <div className="bg-white/90 rounded-xl p-4">
        <HeroReaction image={reaction.image} message={guide.text} theme="neutral" size="sm" />
      </div>
    </div>
  )
}
