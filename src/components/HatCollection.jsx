// 모자 컬렉션(2026-07-22, 애착 시스템) — 학생 아바타의 모자 수집/장착 화면.
//
// 시각 언어: 기존 폴이지보카 카드 문법 그대로(bg-white rounded-3xl
// card-shadow, 그라데이션 헤더 카드, btn-press, RARITY 스타일의 잠금 표시)
// — 새 디자인 시스템 없음. 폴은 항상 자기 검은 모자를 쓴다: 이 화면은
// "학생 아바타"의 모자만 다룬다.
import { HAT_CATALOG } from '../utils/attachment/hatSystem'

export default function HatCollection({ studentName, hatInventory, equippedHatId, onEquip, onBack }) {
  const ownedById = new Map(hatInventory.map((h) => [h.hatId, h]))
  const equipped = HAT_CATALOG.find((h) => h.id === equippedHatId)
  const avatarEmoji = equipped ? equipped.emoji : '👑'

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 홈으로</button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        {/* 아바타 미리보기 — 장착 모자가 바로 보인다 */}
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-6xl mb-2">{avatarEmoji}</div>
          <h1 className="text-2xl font-black">{studentName}의 모자 컬렉션</h1>
          <p className="text-purple-200 text-sm mt-1">
            {equipped ? `지금 쓰고 있는 모자: ${equipped.name}` : '기본 왕관을 쓰고 있어요'}
          </p>
          <p className="text-purple-200 text-xs mt-2">
            모은 모자 {ownedById.size} / {HAT_CATALOG.length} — 공부하면서 얻는 진짜 성취의 기록이에요
          </p>
        </div>

        {/* 컬렉션 그리드 */}
        <div className="grid grid-cols-2 gap-3">
          {HAT_CATALOG.map((hat) => {
            const owned = ownedById.get(hat.id)
            const isEquipped = equippedHatId === hat.id
            return (
              <div key={hat.id}
                className={`rounded-3xl p-4 text-center card-shadow border-2 ${
                  isEquipped ? 'bg-purple-50 border-purple-300'
                  : owned ? 'bg-white border-transparent'
                  : 'bg-gray-50 border-gray-200'
                }`}>
                <div className={`text-4xl mb-1 ${owned ? '' : 'grayscale opacity-40'}`}>{owned ? hat.emoji : '🔒'}</div>
                <p className={`font-black text-sm ${owned ? 'text-gray-800' : 'text-gray-400'}`}>{hat.name}</p>
                <p className={`text-xs mt-1 ${owned ? 'text-gray-500' : 'text-gray-400'}`}>{hat.desc}</p>
                {owned ? (
                  <>
                    {/* 획득 출처 + 날짜 — 진짜 성취의 기록 */}
                    <p className="text-xs text-purple-500 font-bold mt-2">🏅 {owned.source}</p>
                    {owned.earnedAt && (
                      <p className="text-xs text-gray-400">{new Date(owned.earnedAt).toLocaleDateString('ko-KR')} 획득</p>
                    )}
                    <button
                      onClick={() => onEquip(isEquipped ? null : hat.id)}
                      className={`w-full mt-2 py-2 rounded-xl font-black text-sm btn-press ${
                        isEquipped ? 'bg-purple-200 text-purple-700' : 'bg-purple-500 text-white hover:bg-purple-600'
                      }`}>
                      {isEquipped ? '쓰고 있어요 ✓ (벗기)' : '이 모자 쓰기'}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-gray-400 font-bold mt-2">아직 잠겨 있어요</p>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-gray-400">
          모자는 열심히 공부해서만 얻을 수 있어요 — 뽑기도, 구매도 없어요. 한 번 얻은 모자는 영원히 내 거예요!
        </p>
      </div>
    </div>
  )
}
