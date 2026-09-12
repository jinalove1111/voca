// src/components/town/TownWoodenSignHeader.jsx — Paul Town British World,
// 나무 표지판 스타일 헤더 래퍼(안전 프로토타입, 2026-09-12).
//
// 설계: docs/design/town/VISUAL_SYSTEM.md(팔레트/톤), PAUL_TOWN_BRITISH_
// WORLD.md §5(Paul 가이드 라인).
//
// 이 컴포넌트는 **아직 어떤 화면에도 와이어링돼 있지 않다**
// (docs/design/town/COMPONENT_ARCHITECTURE.md §6) — 새 이미지 0장, CSS
// 그라데이션/테두리만으로 "나무 표지판" 느낌을 낸다. 기존 TownScreen.jsx의
// 가이드 카드(<div className="bg-white rounded-3xl card-shadow p-4">)를
// 대체하려는 목적이 아니라, 그 자리에 "옵션으로 씌울 수 있는" 스타일
// 래퍼로 설계했다 — children을 그대로 감싸기만 하고 로직/상태는 갖지 않는다
// (순수 프레젠테이션, HeroReaction/가이드 텍스트 자체는 여전히 부모 소유).
import { isFeatureEnabled } from '../../config/features'

/**
 * @param {{ children: React.ReactNode }} props
 */
export default function TownWoodenSignHeader({ children }) {
  if (!isFeatureEnabled('paulTownV1')) return children || null

  return (
    <div className="relative bg-gradient-to-b from-[#fdebd0] to-[#f6e3c8] border-2 border-[#8b6f3e]/40 rounded-2xl p-1">
      <div className="bg-white/90 rounded-xl p-3">{children}</div>
    </div>
  )
}
