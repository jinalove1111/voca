// src/learning/engine/primitives/Record.jsx — 상호작용 프리미티브 ⑤: 녹음/
// 음성 인식.
//
// 이 컴포넌트는 실제 녹음/음성 인식 로직을 전혀 갖지 않는 얇은 슬롯이다.
// shadowing(및 향후 speaking) 모드가 이 프리미티브를 쓸 때, 호스트 화면
// (WordDetail 등 — 이 커밋 범위 밖, 후속 배선)이 renderRecorder prop으로
// 기존 검증된 SpeechBtn 계열 컴포넌트를 주입한다(설계 §13.6 "기존 화면
// 재작성 금지" — 음성 인식은 이미 프로덕션 검증된 로직이라 여기서 재구현
// 하지 않는다). renderRecorder가 없으면 아무것도 렌더링하지 않는다 —
// 엔진을 단독으로(주입 없이) 써도 크래시하지 않는 안전한 기본값이다.
export default function Record({ renderRecorder, item, onEvent }) {
  if (typeof renderRecorder !== 'function') return null
  return <>{renderRecorder({ item, onEvent })}</>
}
