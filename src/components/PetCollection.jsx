import { PETS, RARITY_COLORS } from '../data/pets'

export default function PetCollection({ pets, onBack }) {
  const petMap = {}
  pets.forEach(p => { if (!petMap[p.id]) petMap[p.id] = p })

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="flex items-center gap-3 max-w-lg mx-auto mb-4 pt-2">
        <button onClick={onBack} className="text-green-600 font-bold btn-press">← 홈</button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-green-600">🐾 내 캐릭터</h1>
          <p className="text-gray-400 text-xs">{Object.keys(petMap).length}/{PETS.length}마리 수집</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        <div className="bg-green-50 rounded-2xl p-3 border-2 border-green-100 text-center mb-4">
          <p className="text-green-700 font-bold text-sm">💡 레벨업 미션 5개 클리어하면 알 뽑기!</p>
        </div>

        <div className="grid grid-cols-3 gap-3 animate-fade-in">
          {PETS.map((pet) => {
            const owned = !!petMap[pet.id]
            const rc = RARITY_COLORS[pet.rarity]
            return (
              <div key={pet.id} className={`rounded-2xl p-4 text-center card-shadow transition-all ${owned ? 'bg-white' : 'bg-gray-100 opacity-50'}`}>
                <div className={`text-4xl mb-2 ${owned ? '' : 'grayscale'}`} style={{ filter: owned ? 'none' : 'grayscale(100%)' }}>
                  {owned ? pet.emoji : '❓'}
                </div>
                {owned ? (
                  <>
                    <div className={`inline-block ${rc.bg} ${rc.text} text-xs font-black px-2 py-0.5 rounded-full mb-1`}>{rc.label}</div>
                    <p className="text-gray-700 font-black text-sm">{pet.name}</p>
                  </>
                ) : (
                  <p className="text-gray-400 font-bold text-sm">???</p>
                )}
              </div>
            )
          })}
        </div>

        {pets.length > 0 && (
          <div className="mt-6 bg-white rounded-3xl card-shadow p-5">
            <p className="font-black text-gray-700 mb-4">✨ 획득 순서</p>
            <div className="space-y-2">
              {[...pets].reverse().map((p, i) => {
                const rc = RARITY_COLORS[p.rarity]
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-2xl">{p.emoji}</span>
                    <div className="flex-1">
                      <span className="font-bold text-gray-800 text-sm">{p.name}</span>
                      <span className={`ml-2 text-xs font-black ${rc.text}`}>{rc.label}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(p.obtainedAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
