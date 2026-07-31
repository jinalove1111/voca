// src/learning/engine/primitives/ChoiceGrid.jsx — 상호작용 프리미티브 ④:
// 선택지.
//
// Phase 0의 5개 모드(learn/fill_blank/listen/shadowing/write) 중 어느 것도
// 이 프리미티브를 쓰지 않는다 — "상호작용 프리미티브 6종" 완결성을 위해
// 지금 만들어 두고, multiple_choice 모드가 나중에 추가될 때(registry.js
// 하단 주석의 향후 모드 예시 참고) 그대로 쓰인다(설계 §5/§13.2). 결정론
// 셔플/오답 후보 구성은 이 컴포넌트의 책임이 아니다 — 호출부(모드의
// prepare)가 이미 순서가 정해진 choices 배열을 넘겨준다.
export default function ChoiceGrid({ choices = [], onSelect, selectedIndex = null }) {
  return (
    <div className="learning-primitive learning-primitive-choice-grid grid grid-cols-2 gap-2">
      {choices.map((choice, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onSelect?.(idx)}
          className={`min-h-[44px] px-3 py-2 rounded-lg border text-base ${
            selectedIndex === idx ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
        >
          {choice}
        </button>
      ))}
    </div>
  )
}
