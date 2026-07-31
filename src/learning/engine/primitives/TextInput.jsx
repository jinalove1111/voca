// src/learning/engine/primitives/TextInput.jsx — 상호작용 프리미티브 ③: 입력.
//
// fill_blank(및 향후 spelling 등) 텍스트 채점 모드가 공용으로 쓰는 입력
// 필드. autoComplete="off"/autoCapitalize="none"/autoCorrect="off"/
// spellCheck={false} 조합은 SentenceLearningFlow.jsx/SpellingQuestion.jsx의
// 기존 관례와 동일 — 브라우저 자동완성/자동교정이 정답을 미리 채우거나
// 바꿔 채점을 무의미하게 만드는 것을 방지한다(일관성 유지, 새 관례 도입
// 없음).
export default function TextInput({ value, onChange, onSubmit, placeholder = '정답을 입력해보세요', disabled = false }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onSubmit?.()
  }

  return (
    <input
      type="text"
      inputMode="text"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      className="learning-primitive learning-primitive-text-input w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-300 text-lg"
    />
  )
}
