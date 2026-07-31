// src/learning/engine/primitives/Show.jsx — 상호작용 프리미티브 ①: 제시.
//
// 순수 표시 컴포넌트 — 상태/부작용 없음. LearningItem(또는 fill_blank처럼
// 모드가 파생한 값)의 text/translation/targetWord를 보여주기만 한다.
// registry.js의 모드 설정이 어떤 primitives를 쓸지 고르고, LearningEngine이
// 이 컴포넌트에 무엇을 보여줄지(원문 vs 빈칸 프롬프트)를 결정해 넘긴다 —
// 이 컴포넌트 자신은 그 판단을 하지 않는다(설계 §13.2 "모드는 테이블을
// 모른다"와 대칭으로, "프리미티브는 모드를 모른다").
export default function Show({ text, translation, targetWord }) {
  return (
    <div className="learning-primitive learning-primitive-show">
      <p className="text-xl font-medium leading-relaxed break-keep">{text}</p>
      {translation ? <p className="mt-1 text-sm text-gray-500">{translation}</p> : null}
      {targetWord ? <p className="mt-1 text-xs text-gray-400">대상 단어: {targetWord}</p> : null}
    </div>
  )
}
