import { useState, useEffect } from 'react'
import { RARITY_COLORS } from '../data/stickers'
import { playSuccessSound } from '../utils/speech'
import PaulReaction from './PaulReaction'

// Gift-box reveal — replaces the old egg-crack animation. Fires
// automatically whenever a mission round completes (see useStudent.js's
// pendingGift), not from a manual "pick" button, since missions now repeat
// all day instead of once.
export default function GiftReveal({ sticker, isDuplicate, isMilestone, streakDays, isBadge, badgeThreshold, onClose }) {
  const [stage, setStage] = useState('box') // box → shake → open

  useEffect(() => {
    const t1 = setTimeout(() => setStage('shake'), 900)
    const t2 = setTimeout(() => { setStage('open'); playSuccessSound() }, 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const rc = RARITY_COLORS[sticker.rarity]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={stage === 'open' ? onClose : undefined}>
      <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full animate-slide-up" onClick={e => e.stopPropagation()}>
        <p className="text-indigo-600 font-black text-lg mb-1">
          {isMilestone ? `🔥 ${streakDays}일 연속 달성!` : isBadge ? `⭐ 별 ${badgeThreshold}개 달성!` : '🎁 미션 완료!'}
        </p>
        {(isMilestone || isBadge) && <p className="text-gray-400 text-xs mb-3">특별 스티커가 왔어요!</p>}

        {stage === 'box' && (
          <div className="py-4">
            <div className="text-9xl mb-4">🎁</div>
            <p className="text-gray-400 text-sm">두근두근...</p>
          </div>
        )}

        {stage === 'shake' && (
          <div className="py-4 animate-wiggle">
            <div className="text-9xl mb-4">🎁</div>
            <p className="text-pink-500 font-bold">반짝반짝! ✨</p>
          </div>
        )}

        {stage === 'open' && (
          <div className="animate-slide-up">
            {/* playSuccessSound()가 이미 위에서 재생하므로 효과음 중복 방지 */}
            <PaulReaction type="complete" message="" size="sm" muted />
            <div className="text-9xl mb-4">{sticker.emoji}</div>
            <div className={`inline-block ${rc.bg} ${rc.text} font-black text-xs px-3 py-1 rounded-full mb-3 border-2 ${rc.ring}`}>
              {rc.dot} {rc.label}
            </div>
            <h2 className="text-3xl font-black text-gray-800 mb-2">{sticker.name}</h2>
            {isDuplicate ? (
              <p className="text-orange-500 font-black mb-6">✨ 중복! ⭐ 별 +20 지급!</p>
            ) : (
              <p className="text-green-600 font-black mb-6">📔 새 스티커! 다이어리에 꾸며보세요!</p>
            )}
            <button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black py-4 rounded-2xl btn-press"
            >
              🎉 좋아요!
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
