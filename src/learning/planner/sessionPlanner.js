// src/learning/planner/sessionPlanner.js — 세션 플랜 방출: (mode, item, options)
// 시퀀스를 만든다(docs/CURRICULUM_ENGINE.md §13.3 "review/exam은 모드가
// 아니라 플랜 생성기" 그대로 — 이 파일이 그 "review 플랜 생성기"의 실제
// 구현이다).
//
// 순수 함수만 export한다. import는 딱 둘: 형제 순수 모듈 memory/leitner.js
// (MAX_BOX — 박스 임계값의 단일 출처, 여기서 매직넘버로 재정의하지 않음)
// + 기존 검증된 순수 셔플 src/utils/sentenceLearning.js의
// shuffleDeterministic(재구현 금지 — 이미 djb2 LCG로 결정론이 검증된
// 로직을 그대로 재사용). 후자는 코드베이스 관례대로 확장자 없이 import
// 하므로(registry.js와 동일한 이유) 이 파일은 plain Node 하네스에서
// esbuild 인메모리 번들이 필요하다(tests/harness/runMemoryEngine.mjs의
// esbuild 섹션, runLearningEngine.mjs 9-28행과 동일 관례).
//
// 세션 "크기"(몇 개를 오늘 시킬지)는 이 파일의 책임이 아니다 — 그건
// src/utils/dailyRitual.js(밴드별 세션 크기 상수)가 이미 담당하고 있고,
// 이 파일의 호출부는 dailyRitual이 잘라준 items 배열을 그대로 받아
// "그 안에서 어떤 모드로, 어떤 순서로 풀지"만 결정한다(items를 스스로
// 늘리거나 줄이지 않음).
import { MAX_BOX } from '../memory/leitner'
import { shuffleDeterministic } from '../../utils/sentenceLearning'

const DEFAULT_STEP_OPTIONS = { retries: 1 }
// "낮은 박스" 임계값을 MAX_BOX에서 유도(매직넘버 재정의 금지) — MAX_BOX=5
// 기준 하위 1/3(0~1)을 신규/저박스로 취급, 나머지(2~5)는 중~고박스.
const LOW_BOX_MAX_LEVEL = Math.floor(MAX_BOX / 3)

function isNewOrLowBox(level) {
  return level == null || level <= LOW_BOX_MAX_LEVEL
}

function modesForLevel(level, { enrich = false } = {}) {
  const modes = isNewOrLowBox(level) ? ['learn', 'fill_blank'] : ['fill_blank']
  if (enrich) return [...modes, 'listen', 'write']
  return modes
}

// planDailySession({ items, boxes, difficultyByWord, seed, options }) →
// [{ mode, item, options }] — 오늘 학습(신규 배정 위주) 세션 플랜.
// 아이템 순서는 shuffleDeterministic(items, seed)로 고정(같은 seed → 항상
// 같은 순서). 신규/낮은 박스(level<=1 또는 박스 없음) 단어는
// [learn, fill_blank], 그 이상은 [fill_blank]만. options.enrich===true면
// 모든 단어에 listen/write까지 덧붙인다(심화 모드, 기본 false).
//
// difficultyByWord는 지금 모드 선택에 쓰지 않는다(레벨만으로 충분 — §6.3
// "파라미터 튜닝 없음" 원칙과 같은 결) — 시그니처에는 남겨 미래에 난이도
// 기반 모드 조정이 필요해지면(예: 고난도 단어에 write까지 강제) breaking
// change 없이 확장할 수 있게 한다.
export function planDailySession({ items = [], boxes = {}, difficultyByWord = {}, seed, options = {} } = {}) {
  void difficultyByWord // 미래 확장 자리 — 지금은 레벨만으로 모드 결정(위 주석 참고)
  const orderedItems = shuffleDeterministic(items, seed)
  const stepOptions = { ...DEFAULT_STEP_OPTIONS, ...options }
  const plan = []
  for (const item of orderedItems) {
    const level = boxes[item?.id]?.level
    for (const mode of modesForLevel(level, options)) plan.push({ mode, item, options: stepOptions })
  }
  return plan
}

// planReviewSession({ queueWordIds, itemsById, boxes, seed, cap, options }) →
// [{ mode, item, options }] — memory/reviewQueue.js가 이미 우선순위로
// 정렬해 돌려준 queueWordIds(가장 오래 밀린/어려운 단어가 앞)를 받아
// cap(§6.3 "세션당 노출 상한", 10~15 밴드 — 실제 값 결정은 호출부 책임,
// 여기 기본값 12는 그 밴드 중앙값)만큼 자른 뒤 세션으로 조립한다. 우선
// 순위로 뽑은 뒤에 shuffleDeterministic으로 제시 순서만 섞는다(선택은
// 우선순위, 제시는 결정론적으로 무작위) — 매번 같은 몇 단어부터 시작해
// 뒷단어가 항상 소홀해지는 것을 막는다.
export function planReviewSession({ queueWordIds = [], itemsById = {}, boxes = {}, seed, cap = 12, options = {} } = {}) {
  const capped = queueWordIds.slice(0, cap)
  const orderedIds = shuffleDeterministic(capped, seed)
  const stepOptions = { ...DEFAULT_STEP_OPTIONS, ...options }
  const plan = []
  for (const wordId of orderedIds) {
    const item = itemsById[wordId]
    if (!item) continue // 카탈로그에 없는 id는 추측하지 않고 건너뜀
    const level = boxes[wordId]?.level
    for (const mode of modesForLevel(level, options)) plan.push({ mode, item, options: stepOptions })
  }
  return plan
}

// MAX_BOX는 재-export하지 않는다(이 파일의 공개 계약은 두 plan 함수뿐) —
// LOW_BOX_MAX_LEVEL 유도에만 쓰인다(위 참고).
