// src/components/town/TownDiscoveryCard.jsx — Paul Town British World,
// Discovery 카드(안전 프로토타입, 2026-09-12).
//
// 설계: docs/design/town/DISCOVERY_SYSTEM.md, UX_FLOW.md §7.
//
// 이 컴포넌트는 **아직 어떤 화면에도 와이어링돼 있지 않다**
// (docs/design/town/COMPONENT_ARCHITECTURE.md §6 — 필수 회귀 게이트
// testTownUiStatic.mjs/tests/e2e/townV1.spec.mjs를 이번 세션이 건드리지
// 않기 위한 의도적 결정). 파일이 존재하는 것 자체는 어떤 기존 동작도
// 바꾸지 않는다(import하는 곳이 없으므로 번들/런타임 영향 0).
//
// 계약(구현 세션이 와이어링할 때 지켜야 할 것):
//   - 별(⭐)/Paul Dollar(💵) 아이콘/숫자를 절대 표시하지 않는다(flavor only,
//     보상 카드와 시각적으로 구분).
//   - 별도 모달이 아니라 인라인 카드(부모의 기존 열림 상태에 종속).
//   - 텍스트 최대 2줄(en 1줄 + ko 1줄), text-xs(12px) 이상.
//   - 닫기 버튼은 44px 이상 터치 타겟(min-h-[44px]).
import { isFeatureEnabled } from '../../config/features'
import { pickDiscoveryForItem } from '../../utils/town/townDiscovery'

/**
 * @param {{ itemId: string, studentId?: string|null, now?: Date, onClose?: () => void }} props
 */
export default function TownDiscoveryCard({ itemId, studentId, now, onClose }) {
  if (!isFeatureEnabled('paulTownV1')) return null
  const discovery = pickDiscoveryForItem(itemId, studentId, now)
  if (!discovery) return null

  return (
    <div
      className="mt-1 bg-[#fdebd0]/60 border border-[#c9a227]/40 rounded-2xl p-3 text-left"
      role="note"
      aria-label="발견"
    >
      <p className="text-xs font-bold text-[#1e2a5a]">{discovery.en}</p>
      <p className="text-xs text-gray-500 mt-0.5">{discovery.ko}</p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-[44px] px-3 rounded-xl bg-white text-gray-500 text-xs font-black btn-press"
        >
          닫기
        </button>
      )}
    </div>
  )
}
