// Paul Town(Paul Town v2.0, 2026-07-22) — 마을이 곧 내비게이션인 한 화면.
//
// paulTown.js 엔진(순수 파생)의 계산 결과만 그린다 — 저장 0, 무작위 0.
// 아키텍처 규칙(운영자 확정): 모든 것은 학습 이력에서 파생, DB에는 사실만,
// UI는 감정을 파생. 이 화면이 읽는 영속 상태는 기존 3가지 사실
// (hatInventory/equippedHatId/milestones — 여기서는 앞의 둘)뿐이다.
//
// 시각 언어: 기존 폴이지보카 카드 문법 그대로(보라/핑크 그라데이션 헤더,
// bg-white rounded-3xl card-shadow, btn-press) — 새 디자인 시스템 없음.
// 정원 3x3 격자는 EnglishGarden.jsx와 시각적으로 동일한 렌더링 패턴을
// 자체 포함(컴포넌트 import 없이 — 이 화면은 자기완결)한다.
//
// 마을 = 내비게이션(Paul Town 월드, 2026-07-22): 정원/폴의 집은 마을 안
// 섹션이고, 건물(박물관→wordMuseum/도서관→bookshelf/시계탑→timeMachine)은
// 카드를 누르면 해당 화면으로 이동한다(onGo). 잠긴 건물은 목록/개수 없이
// 부드러운 힌트 한 줄만 — 체크리스트 금지(점진 발견).
import { computeWorldState, gardenPlots } from '../utils/attachment/worldProgress'
import { retroWelcome, townPlacesState, paulHomeDeco } from '../utils/attachment/paulTown'
import { HAT_CATALOG, HAT_COLOR_STYLE, hatById } from '../utils/attachment/hatSystem'
import { isFeatureEnabled } from '../config/features'

export default function PaulTown({ stats, hatInventory, equippedHatId, onEquip, onGo, onBack }) {
  const welcome = retroWelcome(stats)
  const world = computeWorldState(stats)
  const plots = gardenPlots(stats)
  const showGarden = isFeatureEnabled('paulTownGarden')
  const showBuildings = isFeatureEnabled('paulTownBuildings')
  // 아직 발견 못 한 모자 수 — 큰 잠금 체크리스트 대신 한 줄만(점진 발견).
  const undiscoveredHats = Math.max(0, HAT_CATALOG.length - hatInventory.length)
  // 폴의 집 소품 — 진행에서만 파생(paulHomeDeco, 저장 0·단조).
  const deco = paulHomeDeco(stats)
  // 플래그 게이트 건물들 — townPlacesState(플래그 조회는 주입, 엔진은
  // 저장소를 직접 안 읽음). 발견된 곳만 이동 카드로. 도서관은 화면 플래그
  // (attachmentBookshelf)도 켜져 있어야 입장 가능 — 꺼져 있으면 아직
  // 안개 속(힌트 한 줄)으로 남는다.
  const canEnter = (p) => p.id !== 'library' || isFeatureEnabled('attachmentBookshelf')
  const flaggedPlaces = townPlacesState(stats, isFeatureEnabled).filter((p) => p.requiresFlag)
  const discoveredPlaces = flaggedPlaces.filter((p) => p.discovered && canEnter(p))
  const anyHidden = flaggedPlaces.some((p) => !(p.discovered && canEnter(p)))

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 홈으로</button>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        {/* 마을 입구 — 헤더 카드 + 작은 팻말 */}
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-5xl mb-2">🏡</div>
          <h1 className="text-2xl font-black">Paul Town</h1>
          <p className="text-purple-200 text-sm mt-1">📖 단어를 배울 때마다 자라나는 우리 마을</p>
        </div>

        {/* 소급 환영 — 이미 배운 단어가 실제로 있을 때만(신규 학생 null).
            성장 시각화는 computeWorldState 재사용 — 열린 구역만 이모지. */}
        {welcome && (
          <div className="bg-white rounded-3xl card-shadow p-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl flex-shrink-0">{welcome.emoji}</span>
              <p className="text-sm font-bold text-gray-600">{welcome.text}</p>
            </div>
            <div className="flex gap-2 mt-3 justify-center">
              {world.stages.map((s) => (
                <span key={s.id} className={`text-2xl ${s.unlocked ? '' : 'grayscale opacity-30'}`}>
                  {s.unlocked ? s.emoji : '🔒'}
                </span>
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">
              🌿 마을 성장 {welcome.growthLevel}단계 · 성장 포인트 {world.growthPoints}
            </p>
          </div>
        )}

        {/* 정원 — EnglishGarden.jsx의 3x3 텃밭과 시각적으로 동일한 격자
            (같은 gardenPlots 파생 — 같은 진행이면 어느 화면에서 봐도 같은
            정원). */}
        {showGarden && (
          <div className="bg-white rounded-3xl card-shadow p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🌷</span>
              <h2 className="font-black text-gray-800 text-lg">정원</h2>
            </div>
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
        )}

        {/* 폴의 집 — 학생 모자걸이. 가진 모자만 컬러 톱햇으로 걸려 있고
            (colorHex 틴트 — HatCeremony와 같은 순수 CSS 실루엣 기법),
            잠긴 모자는 체크리스트로 안 보여준다 — 개수 한 줄만(점진 발견). */}
        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🏡</span>
            <h2 className="font-black text-gray-800 text-lg">폴의 집</h2>
          </div>
          {/* 폴의 인사 — 폴은 항상 자기 검은 모자(🎩 원색). 일반 인사만 —
              없는 기억을 말하지 않는다(구체적 회상은 홈의 '폴의 기억' 담당). */}
          <div className="flex items-center gap-3 rounded-2xl bg-purple-50 p-3 mb-3">
            <span className="text-3xl flex-shrink-0">🎩</span>
            <p className="text-sm font-bold text-gray-600">"어서 와! 우리 집 구경하고 갈래?"</p>
          </div>
          <p className="text-xs text-gray-400 mb-3">모자걸이에 네 모자들이 걸려 있어 — 눌러서 바꿔 쓸 수 있어!</p>
          {hatInventory.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {hatInventory.map((h) => {
                const hat = hatById(h.hatId)
                if (!hat) return null
                const style = HAT_COLOR_STYLE[h.hatId]
                const isEquipped = equippedHatId === h.hatId
                return (
                  <button
                    key={h.hatId}
                    onClick={() => onEquip(isEquipped ? null : h.hatId)}
                    title={`${hat.name}${isEquipped ? ' (쓰고 있어요)' : ''}`}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl btn-press border-2 ${
                      isEquipped ? 'border-purple-400 bg-purple-50' : 'border-transparent bg-gray-50 hover:border-purple-200'
                    }`}
                  >
                    <span style={{ color: 'transparent', textShadow: `0 0 0 ${style?.colorHex || '#2d2d2d'}` }}>🎩</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-sm font-bold text-gray-500">아직 모자걸이가 비어 있어 — 공부하면서 첫 모자를 만나보자!</p>
          )}
          {equippedHatId && hatById(equippedHatId) && (
            <p className="text-xs font-bold text-purple-500 mt-3">지금 쓰고 있는 모자: {hatById(equippedHatId).name}</p>
          )}
          {undiscoveredHats > 0 && (
            <p className="text-xs text-gray-400 mt-2">아직 발견하지 못한 모자 {undiscoveredHats}개</p>
          )}
          {/* 방 소품 — 진행에서만 파생(단조: 한 번 생긴 소품은 안 사라짐).
              열린 소품만 보여준다 — 잠긴 소품 목록/개수 없음(점진 발견). */}
          {deco.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex gap-2 flex-wrap">
                {deco.map((d) => (
                  <span key={d.id} title={d.name} className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">
                    {d.emoji}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">네가 공부할수록 방에 물건이 하나씩 늘어나</p>
            </div>
          )}
        </div>

        {/* 건물들 — 마을이 곧 내비게이션: 발견된 건물 카드를 누르면 해당
            화면(박물관/도서관/시계탑)으로 들어간다. 잠긴 곳은 목록/개수
            없이 부드러운 힌트 한 줄만(점진 발견 — 체크리스트 금지). */}
        {showBuildings && (discoveredPlaces.length > 0 || anyHidden) && (
          <div className="bg-white rounded-3xl card-shadow p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🗺️</span>
              <h2 className="font-black text-gray-800 text-lg">마을 곳곳</h2>
            </div>
            {discoveredPlaces.length > 0 && (
              <div className="space-y-2">
                {discoveredPlaces.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => p.screen && onGo && onGo(p.screen)}
                    className="w-full flex items-center gap-3 rounded-2xl p-3 bg-purple-50 btn-press hover:bg-purple-100 text-left"
                  >
                    <span className="text-2xl flex-shrink-0">{p.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.desc}</p>
                    </div>
                    <span className="text-purple-300 font-black text-lg flex-shrink-0">›</span>
                  </button>
                ))}
              </div>
            )}
            {anyHidden && (
              <p className="text-xs text-gray-400 mt-3">🌫️ 아직 안개 속에 있는 곳이 있어요…</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
