// src/learning/ai/memoryPlugPoints.js — 미래 AI 연결 지점의 계약만 고정
// (구현 없음). src/utils/curriculum/generatorContract.js의 not_implemented
// 관례를 그대로 따른다 — 실제 AI 호출 0, import 0, 어떤 규칙 기반이든
// AI든 이 시그니처 위에서만 구현되면 된다.
//
// 이 파일이 존재하는 이유는 "지금 만든다"가 아니라 "나중에 여기에 꽂는다"
// 는 계약을 문서 대신 코드로 남기기 위함이다(계약이 코드에 있으면 미래
// 구현체가 시그니처를 어기면 하네스가 즉시 잡아낸다). 두 함수 모두 지금은
// 항상 { ok:false, reason:'not_implemented' }만 돌려준다.

// predictWordDifficulty(context) — 미래에 학생별/단어별 오답 이력 등을
// 넣어 memory/difficulty.js의 규칙 기반 점수보다 더 정교한 난이도 예측을
// 시도할 수 있는 자리. context 예상 shape: { studentId?, wordId?,
// historicalSignals? } — 지금은 미사용(계약만).
export async function predictWordDifficulty(context) {
  void context
  return { ok: false, reason: 'not_implemented', prediction: null }
}

// optimizeReviewSchedule(context) — 미래에 §6.3의 고정 간격 표
// [0,1,3,7,14,30] 대신 학생별 최적 간격을 제안할 수 있는 자리. 이 계약이
// 존재해도 leitner.js의 BOX_INTERVALS_DAYS는 여전히 "유일한 파라미터"로
// 남는다 — 이 함수가 실제로 구현되기 전까지는 아무 것도 그 표를 대체하지
// 않는다(§6.3 "파라미터 튜닝: 없음" 원칙 유지).
export async function optimizeReviewSchedule(context) {
  void context
  return { ok: false, reason: 'not_implemented', schedule: null }
}
