// 잉글리시 월드 — 정원 MVP(2026-07-22, 애착 시스템).
//
// worldProgress.js 엔진의 계산 결과만 그린다(저장 없음, 전부 파생).
// v1 노출: 정원 3x3 텃밭 + 다음 구역 진행바. 이후 구역(집~왕국)의 상세
// UI는 attachmentWorldFull 플래그(기본 OFF) 뒤 — 여기서는 잠금 목록으로
// "다음에 열릴 세계"만 살짝 보여준다(별도 게임 인터페이스 없음, 기존
// 카드 문법 그대로).
import { computeWorldState, gardenPlots, WORLD_STAGES } from '../utils/attachment/worldProgress'
import { isFeatureEnabled } from '../config/features'

export default function EnglishGarden({ stats, onBack }) {
  const world = computeWorldState(stats)
  const plots = gardenPlots(stats)
  const showFullWorld = isFeatureEnabled('attachmentWorldFull')
  const next = world.nextStage

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 홈으로</button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="bg-gradient-to-br from-green-400 to-emerald-600 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-5xl mb-2">🌱</div>
          <h1 className="text-2xl font-black">나의 잉글리시 정원</h1>
          <p className="text-green-100 text-sm mt-1">단어를 배울 때마다 정원이 자라나요</p>
          <p className="text-green-100 text-xs mt-2">🌿 성장 포인트 {world.growthPoints} (클리어한 단어 수)</p>
        </div>

        {/* 정원 텃밭 — 3x3, 전부 파생(같은 진행이면 어느 기기에서 봐도 같은 정원) */}
        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="grid grid-cols-3 gap-2">
            {plots.map((p) => (
              <div key={p.index} className="aspect-square rounded-2xl bg-lime-50 border-2 border-lime-100 flex items-center justify-center text-4xl">
                {p.emoji}
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">
            🌰 씨앗 → 🌱 새싹 → 🌸 꽃 → 🌳 나무 — 단어 클리어가 정원을 키워요
          </p>
        </div>

        {/* 다음 구역 진행 */}
        {next && (
          <div className="bg-white rounded-3xl card-shadow p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{next.emoji}</span>
              <h2 className="font-black text-gray-800">{next.name}이(가) 기다려요</h2>
            </div>
            <p className="text-sm text-gray-500 mb-2">{next.desc}</p>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (world.growthPoints / next.minPoints) * 100)}%` }} />
            </div>
            <p className="text-right text-xs text-gray-400 mt-1">{world.growthPoints} / {next.minPoints}</p>
          </div>
        )}

        {/* 월드 지도(요약) — 잠긴 구역은 이름만. 상세 UI는 플래그 뒤(파운데이션) */}
        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🗺️</span>
            <h2 className="font-black text-gray-800 text-lg">나의 잉글리시 월드</h2>
          </div>
          <div className="space-y-2">
            {world.stages.map((s) => (
              <div key={s.id} className={`flex items-center gap-3 rounded-2xl p-3 ${s.unlocked ? 'bg-green-50' : 'bg-gray-50'}`}>
                <span className={`text-2xl ${s.unlocked ? '' : 'grayscale opacity-40'}`}>{s.unlocked ? s.emoji : '🔒'}</span>
                <div className="min-w-0 flex-1">
                  <p className={`font-black text-sm ${s.unlocked ? 'text-gray-800' : 'text-gray-400'}`}>{s.name}</p>
                  <p className="text-xs text-gray-400">{s.unlocked ? (s.id === 'garden' ? '열려 있어요!' : showFullWorld ? '열려 있어요!' : '열렸어요 — 곧 구경할 수 있어요!') : s.desc}</p>
                </div>
                {s.unlocked && <span className="text-green-500 font-black text-xs">✓</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
