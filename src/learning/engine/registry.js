// src/learning/engine/registry.js — Learning Engine 모드 레지스트리
// (docs/CURRICULUM_ENGINE.md §13.2 "② 모드 = 레지스트리의 설정 객체").
//
// 순수 모듈: 각 모드는 { primitives, prepare, grade? } 설정 객체다 — 하드코딩
// 페이지가 아니라 데이터. React/Supabase/네트워크 무의존(prepare/grade는
// 전부 순수 함수 재사용, 아래 참고). import는 기존 검증된 순수 엔진만
// 허용(중복 금지 원칙, 설계 §1.1) — 빈칸/채점 로직을 여기서 재구현하지
// 않는다.
import { makeFillBlank, checkAnswer } from '../../utils/textbookExampleModel'

// Phase 0 모드 5종(설계 §11 Phase 0 범위: learn/fill_blank/listen/shadowing/
// write). review/exam은 모드가 아니라 "플랜 생성기"라 여기 없다(§13.3).
export const MODES = {
  // learn — 제시 + 재생. 파생 데이터 없음(prepare는 item을 그대로 통과).
  learn: {
    primitives: ['show', 'audio'],
    prepare: (item) => item,
  },

  // listen — 듣기 우선(TTS로 문장 재생), 필요하면 원문을 확인. 파생 없음.
  listen: {
    primitives: ['audio', 'show'],
    prepare: (item) => item,
  },

  // shadowing — 재생 후 따라 말하기. 실제 음성 인식/채점은 이 모드가 하지
  // 않는다 — 호스트가 renderRecorder prop으로 주입하는 기존 SpeechBtn이
  // 전담한다(설계 §13.6 "기존 화면 재작성 금지"). 엔진은 그 결과의 세부를
  // 몰라도 되고, onEvent로 전달받은 결과만 그대로 방출한다.
  shadowing: {
    primitives: ['audio', 'record'],
    prepare: (item) => item,
  },

  // fill_blank — 기존 순수 엔진(textbookExampleModel.js)을 그대로 재사용.
  // prepare가 { prompt, answer }를 돌려주고, grade(checkAnswer)가 관대한
  // 비교(공백/구두점 무시, 대소문자 무관)로 채점한다.
  fill_blank: {
    primitives: ['show', 'text-input'],
    prepare: (item) => makeFillBlank(item.text, item.targetWord),
    grade: checkAnswer,
  },

  // write — 문장 따라 쓰기. 설계 §8: "채점 없음, checkAnswer 자가 확인만" —
  // grade가 있어도 그 결과로 보상/DB에 쓰지 않는다(엔진은 onEvent만 방출,
  // 저장/보상은 호스트 책임, §13.4). 파생 없음(원문 그대로 제시).
  write: {
    primitives: ['show', 'write'],
    prepare: (item) => item,
    grade: checkAnswer,
  },
}

// ── 향후 모드 추가 예시(주석만 — 아직 구현 안 함, 설계 §13.5 "정직 조항") ──
//
// 기존 프리미티브 조합 + 기존 순수 로직 재사용이면 "설정만" 추가된다:
//
//   spelling: {
//     primitives: ['text-input'],
//     // 기존 스펠링 채점 로직(예: normalizeAnswer 계열)을 재사용 — 여기서
//     // 재구현하지 않는다.
//     prepare: (item) => ({ answer: item.targetWord }),
//     grade: checkAnswer, // 또는 기존 스펠링 전용 채점 함수를 import해 교체
//   },
//   multiple_choice: {
//     primitives: ['show', 'choice'],
//     // 결정론 셔플(djb2 LCG 등 기존 shuffleDeterministic 계열 재사용) +
//     // item.distractorPool로 보기 구성 — 오답 후보 생성 자체는 어댑터
//     // (learningItem.js) 또는 콘텐츠 계층의 몫이지 registry의 몫이 아니다.
//     prepare: (item, opt) => ({ choices: pickChoicesDeterministic(item, opt?.choices ?? 4) },
//     grade: (input, correctIndex) => input === correctIndex,
//   },
//   speaking: {
//     primitives: ['show', 'record'],
//     // shadowing과 동일하게 실제 녹음/인식은 renderRecorder 주입 컴포넌트
//     // (기존 SpeechBtn 계열)가 전담 — registry는 파이프라인 순서만 정의.
//     prepare: (item) => item,
//   },
//
// 완전히 새로운 상호작용(예: 드래그 매칭)은 프리미티브 1개를 새로 만들어야
// 한다 — "모든 미래 모드가 React 0줄"은 아니다(과장 금지, 규칙 18).
