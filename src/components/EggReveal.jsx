import { useState, useEffect } from 'react'
import { RARITY_COLORS } from '../data/pets'

export default function EggReveal({ pet, onClose }) {
  const [stage, setStage] = useState('egg') // egg → crack → reveal

  useEffect(() => {
    const t1 = setTimeout(() => setStage('crack'), 1200)
    const t2 = setTimeout(() => setStage('reveal'), 2400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const rc = RARITY_COLORS[pet.rarity]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={stage === 'reveal' ? onClose : undefined}>
      <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full animate-slide-up" onClick={e => e.stopPropagation()}>
        <p className="text-purple-600 font-black text-lg mb-4">🥚 알 뽑기 성공!</p>

        {stage === 'egg' && (
          <div className="animate-bounce-slow">
            <div className="text-9xl mb-4">🥚</div>
            <p className="text-gray-400 text-sm">알이 흔들려요...</p>
          </div>
        )}

        {stage === 'crack' && (
          <div className="animate-wiggle">
            <div className="text-9xl mb-4">🥚</div>
            <p className="text-orange-500 font-bold">금이 가고 있어요! 💥</p>
          </div>
        )}

        {stage === 'reveal' && (
          <div className="animate-slide-up">
            <div className="text-9xl mb-4">{pet.emoji}</div>
            <div className={`inline-block ${rc.bg} ${rc.text} font-black text-xs px-3 py-1 rounded-full mb-3`}>
              {rc.label}
            </div>
            <h2 className="text-3xl font-black text-gray-800 mb-2">{pet.name}</h2>
            <p className="text-gray-500 text-sm mb-6">{pet.desc}</p>
            <button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black py-4 rounded-2xl btn-press"
            >
              🎉 내 친구가 됐어요!
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
